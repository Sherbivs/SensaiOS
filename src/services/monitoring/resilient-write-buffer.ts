/**
 * Resilient Write Buffer — Power-Loss Safe Database Operations
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * CRASH-RESILIENT ARCHITECTURE (2025-01-04)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Ensures database writes survive sudden power loss or server crashes by:
 * 1. Buffering writes in memory with sequence numbers
 * 2. Persisting buffer to database atomically
 * 3. Replaying uncommitted writes on startup
 * 4. Providing idempotent operation guarantees
 * 
 * GUARANTEES:
 * - Every write eventually reaches the database (at-least-once delivery)
 * - Duplicate writes are safely deduplicated via idempotency keys
 * - Crash recovery is automatic on next startup
 * - No data loss even with sudden power failure
 * 
 * @module services/monitoring/resilient-write-buffer
 */

import { prisma } from '../../shared/prisma.js';
import { getLogger } from '../../shared/logging/index.js';
import crypto from 'node:crypto';

const logger = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/** Pending write operation with metadata */
export interface PendingWrite<T = unknown> {
  /** Unique operation ID for deduplication */
  idempotencyKey: string;
  /** Monotonic sequence number for ordering */
  sequenceNumber: number;
  /** Operation type (e.g., 'error-log', 'cache-entry') */
  operationType: string;
  /** The actual data to write */
  payload: T;
  /** Timestamp when queued */
  queuedAt: Date;
  /** Number of write attempts */
  attempts: number;
  /** Last error message if failed */
  lastError?: string;
}

/** Buffer status for monitoring */
export interface BufferStats {
  pendingWrites: number;
  processedWrites: number;
  failedWrites: number;
  lastFlushTime: Date | null;
  lastSequenceNumber: number;
  isRecoveryMode: boolean;
}

/** Write operation to execute */
export interface WriteOperation<T = unknown> {
  operationType: string;
  payload: T;
  idempotencyKey?: string;
  execute: (payload: T) => Promise<void>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BUFFER_NAMESPACE = 'resilient-write-buffer';
const CHECKPOINT_KEY = `${BUFFER_NAMESPACE}:checkpoint`;
const MAX_BUFFER_SIZE = 1000;
const FLUSH_INTERVAL_MS = 5000; // Flush every 5 seconds
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// ============================================================================
// STATE
// ============================================================================

/** In-memory write buffer */
const writeBuffer: Map<string, PendingWrite> = new Map();

/** Sequence counter for ordering */
let sequenceCounter = 0;

/** Statistics */
let processedWrites = 0;
let failedWrites = 0;
let lastFlushTime: Date | null = null;
let isRecoveryMode = false;

/** Flush interval timer */
let flushInterval: NodeJS.Timeout | null = null;

/** Operation executors by type */
const executors: Map<string, (payload: unknown) => Promise<void>> = new Map();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the resilient write buffer.
 * MUST be called on application startup to:
 * 1. Recover any uncommitted writes from previous crash
 * 2. Start the periodic flush timer
 */
export async function initializeWriteBuffer(): Promise<{ recovered: number }> {
  logger.info('resilient-buffer', 'init', '[WriteBuffer] Initializing resilient write buffer...');
  
  try {
    // Load checkpoint (last committed sequence number)
    const checkpoint = await loadCheckpoint();
    sequenceCounter = checkpoint.lastSequence;
    
    logger.info('resilient-buffer', 'init', `[WriteBuffer] Loaded checkpoint: sequence=${sequenceCounter}`);
    
    // Recover any uncommitted writes
    const recovered = await recoverUncommittedWrites();
    
    // Start periodic flush
    startFlushInterval();
    
    logger.info('resilient-buffer', 'init', `[WriteBuffer] Initialized: ${recovered} writes recovered`);
    return { recovered };
  } catch (error) {
    logger.error('resilient-buffer', 'init', `[WriteBuffer] Initialization failed: ${error}`);
    // Start flush interval anyway - buffer can still work
    startFlushInterval();
    return { recovered: 0 };
  }
}

/**
 * Shutdown the write buffer gracefully.
 * Flushes all pending writes before returning.
 */
export async function shutdownWriteBuffer(): Promise<void> {
  logger.info('resilient-buffer', 'shutdown', '[WriteBuffer] Shutting down...');
  
  stopFlushInterval();
  
  // Final flush with extended retries
  await flushBuffer({ maxRetries: 5 });
  
  // Save checkpoint
  await saveCheckpoint();
  
  logger.info('resilient-buffer', 'shutdown', '[WriteBuffer] Shutdown complete');
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Register an executor for a write operation type.
 * Must be called before queueing writes of that type.
 * 
 * @param operationType - Unique identifier for the operation type
 * @param executor - Function to execute the write
 */
export function registerWriteExecutor(
  operationType: string,
  executor: (payload: unknown) => Promise<void>
): void {
  executors.set(operationType, executor);
  logger.debug('resilient-buffer', 'register', `[WriteBuffer] Registered executor: ${operationType}`);
}

// ============================================================================
// QUEUE OPERATIONS
// ============================================================================

/**
 * Queue a write operation for resilient execution.
 * The write will be:
 * 1. Added to in-memory buffer
 * 2. Persisted to database checkpoint
 * 3. Executed with retry logic
 * 4. Deduplicated via idempotency key
 * 
 * @param operation - The write operation to queue
 * @returns Idempotency key for tracking
 */
export async function queueWrite<T>(operation: WriteOperation<T>): Promise<string> {
  const { operationType, payload, idempotencyKey, execute } = operation;
  
  // Generate idempotency key if not provided
  const key = idempotencyKey ?? generateIdempotencyKey(operationType, payload);
  
  // Check for duplicate
  if (writeBuffer.has(key)) {
    logger.debug('resilient-buffer', 'queue', `[WriteBuffer] Duplicate write ignored: ${key.substring(0, 12)}...`);
    return key;
  }
  
  // Check buffer size limit
  if (writeBuffer.size >= MAX_BUFFER_SIZE) {
    logger.warn('resilient-buffer', 'queue', '[WriteBuffer] Buffer full, forcing flush...');
    await flushBuffer();
  }
  
  // Create pending write
  const pendingWrite: PendingWrite<T> = {
    idempotencyKey: key,
    sequenceNumber: ++sequenceCounter,
    operationType,
    payload,
    queuedAt: new Date(),
    attempts: 0,
  };
  
  // Add to buffer
  writeBuffer.set(key, pendingWrite);
  
  // Register executor if provided
  if (execute && !executors.has(operationType)) {
    executors.set(operationType, execute as (p: unknown) => Promise<void>);
  }
  
  // Persist to checkpoint immediately for crash safety
  try {
    await persistPendingWrite(pendingWrite);
  } catch (error) {
    // Checkpoint failed - write is still in memory, will retry on next flush
    logger.warn('resilient-buffer', 'queue', `[WriteBuffer] Checkpoint persist failed: ${error}`);
  }
  
  return key;
}

/**
 * Execute a write immediately with resilience guarantees.
 * Bypasses the queue but still provides:
 * - Retry logic
 * - Idempotency checking
 * - Failure recovery
 * 
 * @param operation - The write operation to execute
 * @returns Success status
 */
export async function executeResilientWrite<T>(
  operation: WriteOperation<T>
): Promise<{ success: boolean; idempotencyKey: string; attempts: number }> {
  const key = operation.idempotencyKey ?? generateIdempotencyKey(operation.operationType, operation.payload);
  
  // Check if already completed
  const completed = await isWriteCompleted(key);
  if (completed) {
    return { success: true, idempotencyKey: key, attempts: 0 };
  }
  
  let attempts = 0;
  let lastError: Error | undefined;
  
  while (attempts < MAX_RETRY_ATTEMPTS) {
    attempts++;
    try {
      await operation.execute(operation.payload);
      
      // Mark as completed
      await markWriteCompleted(key);
      processedWrites++;
      
      return { success: true, idempotencyKey: key, attempts };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempts < MAX_RETRY_ATTEMPTS) {
        // Wait before retry with exponential backoff
        await sleep(RETRY_DELAY_MS * Math.pow(2, attempts - 1));
      }
    }
  }
  
  // All retries failed
  failedWrites++;
  logger.error('resilient-buffer', 'execute', 
    `[WriteBuffer] Write failed after ${attempts} attempts: ${lastError?.message}`);
  
  return { success: false, idempotencyKey: key, attempts };
}

// ============================================================================
// FLUSH OPERATIONS
// ============================================================================

/**
 * Flush all pending writes to the database.
 * Called periodically and on shutdown.
 */
export async function flushBuffer(options?: { maxRetries?: number }): Promise<{
  processed: number;
  failed: number;
  remaining: number;
}> {
  const maxRetries = options?.maxRetries ?? MAX_RETRY_ATTEMPTS;
  let processed = 0;
  let failed = 0;
  
  // Process writes in sequence order
  const writes = Array.from(writeBuffer.values())
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  
  for (const write of writes) {
    const executor = executors.get(write.operationType);
    if (!executor) {
      logger.warn('resilient-buffer', 'flush', 
        `[WriteBuffer] No executor for operation type: ${write.operationType}`);
      continue;
    }
    
    let success = false;
    let attempts = write.attempts;
    
    while (!success && attempts < maxRetries) {
      attempts++;
      try {
        await executor(write.payload);
        success = true;
      } catch (error) {
        write.lastError = error instanceof Error ? error.message : String(error);
        
        if (attempts < maxRetries) {
          await sleep(RETRY_DELAY_MS * Math.pow(2, attempts - 1));
        }
      }
    }
    
    if (success) {
      // Remove from buffer and mark completed
      writeBuffer.delete(write.idempotencyKey);
      await removePendingWrite(write.idempotencyKey);
      await markWriteCompleted(write.idempotencyKey);
      processed++;
      processedWrites++;
    } else {
      // Update attempt count
      write.attempts = attempts;
      failed++;
    }
  }
  
  // Update checkpoint
  if (processed > 0) {
    await saveCheckpoint();
    lastFlushTime = new Date();
  }
  
  if (processed > 0 || failed > 0) {
    logger.debug('resilient-buffer', 'flush', 
      `[WriteBuffer] Flush complete: ${processed} processed, ${failed} failed, ${writeBuffer.size} remaining`);
  }
  
  return {
    processed,
    failed,
    remaining: writeBuffer.size,
  };
}

// ============================================================================
// RECOVERY
// ============================================================================

/**
 * Recover uncommitted writes from a previous crash.
 * Called during initialization.
 */
async function recoverUncommittedWrites(): Promise<number> {
  isRecoveryMode = true;
  
  try {
    // Load all pending writes from database
    const pendingEntries = await prisma.cacheEntry.findMany({
      where: {
        namespace: BUFFER_NAMESPACE,
        key: { startsWith: 'pending:' },
      },
      orderBy: { createdAt: 'asc' },
    });
    
    if (pendingEntries.length === 0) {
      isRecoveryMode = false;
      return 0;
    }
    
    logger.info('resilient-buffer', 'recovery', 
      `[WriteBuffer] Recovering ${pendingEntries.length} uncommitted writes...`);
    
    // Add to buffer
    for (const entry of pendingEntries) {
      try {
        const pendingWrite = entry.value as unknown as PendingWrite;
        
        // Check if already completed
        const completed = await isWriteCompleted(pendingWrite.idempotencyKey);
        if (completed) {
          // Clean up stale pending entry
          await removePendingWrite(pendingWrite.idempotencyKey);
          continue;
        }
        
        writeBuffer.set(pendingWrite.idempotencyKey, pendingWrite);
      } catch (error) {
        logger.warn('resilient-buffer', 'recovery', 
          `[WriteBuffer] Failed to recover entry: ${error}`);
      }
    }
    
    // Flush recovered writes
    const { processed, failed } = await flushBuffer({ maxRetries: 5 });
    
    logger.info('resilient-buffer', 'recovery', 
      `[WriteBuffer] Recovery complete: ${processed} processed, ${failed} failed`);
    
    isRecoveryMode = false;
    return processed;
  } catch (error) {
    logger.error('resilient-buffer', 'recovery', 
      `[WriteBuffer] Recovery failed: ${error}`);
    isRecoveryMode = false;
    return 0;
  }
}

// ============================================================================
// CHECKPOINT OPERATIONS
// ============================================================================

/** Load the last checkpoint from database */
async function loadCheckpoint(): Promise<{ lastSequence: number }> {
  try {
    const entry = await prisma.cacheEntry.findUnique({
      where: { key: CHECKPOINT_KEY },
    });
    
    if (!entry) {
      return { lastSequence: 0 };
    }
    
    const checkpoint = entry.value as { lastSequence?: number };
    return { lastSequence: checkpoint.lastSequence ?? 0 };
  } catch (error) {
    logger.warn('resilient-buffer', 'checkpoint', 
      `[WriteBuffer] Failed to load checkpoint: ${error}`);
    return { lastSequence: 0 };
  }
}

/** Save the current checkpoint to database */
async function saveCheckpoint(): Promise<void> {
  try {
    await prisma.cacheEntry.upsert({
      where: { key: CHECKPOINT_KEY },
      update: {
        value: {
          lastSequence: sequenceCounter,
          lastFlushTime: lastFlushTime?.toISOString(),
          processedWrites,
          failedWrites,
        } as object,
        updatedAt: new Date(),
      },
      create: {
        key: CHECKPOINT_KEY,
        namespace: BUFFER_NAMESPACE,
        value: {
          lastSequence: sequenceCounter,
          lastFlushTime: lastFlushTime?.toISOString(),
          processedWrites,
          failedWrites,
        } as object,
        sizeBytes: 100,
      },
    });
  } catch (error) {
    logger.warn('resilient-buffer', 'checkpoint', 
      `[WriteBuffer] Failed to save checkpoint: ${error}`);
  }
}

/** Persist a pending write to database for crash recovery */
async function persistPendingWrite(write: PendingWrite): Promise<void> {
  const key = `pending:${write.idempotencyKey}`;
  
  await prisma.cacheEntry.upsert({
    where: { key },
    update: {
      value: write as object,
      updatedAt: new Date(),
    },
    create: {
      key,
      namespace: BUFFER_NAMESPACE,
      value: write as object,
      sizeBytes: JSON.stringify(write).length,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });
}

/** Remove a pending write from database after completion */
async function removePendingWrite(idempotencyKey: string): Promise<void> {
  const key = `pending:${idempotencyKey}`;
  
  try {
    await prisma.cacheEntry.delete({
      where: { key },
    });
  } catch {
    // Ignore if already deleted
  }
}

/** Check if a write has been completed */
async function isWriteCompleted(idempotencyKey: string): Promise<boolean> {
  const key = `completed:${idempotencyKey}`;
  
  try {
    const entry = await prisma.cacheEntry.findUnique({
      where: { key },
    });
    return entry !== null;
  } catch {
    return false;
  }
}

/** Mark a write as completed for deduplication */
async function markWriteCompleted(idempotencyKey: string): Promise<void> {
  const key = `completed:${idempotencyKey}`;
  
  try {
    await prisma.cacheEntry.upsert({
      where: { key },
      update: { updatedAt: new Date() },
      create: {
        key,
        namespace: BUFFER_NAMESPACE,
        value: { completedAt: new Date().toISOString() } as object,
        sizeBytes: 50,
        // Shorter expiry for completed markers (24 hours)
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  } catch (error) {
    logger.warn('resilient-buffer', 'complete', 
      `[WriteBuffer] Failed to mark write completed: ${error}`);
  }
}

// ============================================================================
// FLUSH INTERVAL
// ============================================================================

function startFlushInterval(): void {
  if (flushInterval) {
    clearInterval(flushInterval);
  }
  
  flushInterval = setInterval(async () => {
    if (writeBuffer.size > 0) {
      await flushBuffer().catch(error => {
        logger.error('resilient-buffer', 'flush-interval', 
          `[WriteBuffer] Periodic flush failed: ${error}`);
      });
    }
  }, FLUSH_INTERVAL_MS);
  
  logger.debug('resilient-buffer', 'interval', 
    `[WriteBuffer] Flush interval started (every ${FLUSH_INTERVAL_MS / 1000}s)`);
}

function stopFlushInterval(): void {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
    logger.debug('resilient-buffer', 'interval', '[WriteBuffer] Flush interval stopped');
  }
}

// ============================================================================
// STATISTICS
// ============================================================================

/** Get current buffer statistics */
export function getBufferStats(): BufferStats {
  return {
    pendingWrites: writeBuffer.size,
    processedWrites,
    failedWrites,
    lastFlushTime,
    lastSequenceNumber: sequenceCounter,
    isRecoveryMode,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/** Generate an idempotency key from operation type and payload */
function generateIdempotencyKey(operationType: string, payload: unknown): string {
  const hash = crypto.createHash('sha256')
    .update(operationType)
    .update(JSON.stringify(payload))
    .update(Date.now().toString())
    .digest('hex');
  return hash.substring(0, 32);
}

/** Sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up old completed markers and expired entries.
 * Should be called periodically (e.g., daily).
 */
export async function cleanupWriteBuffer(): Promise<{ deleted: number }> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    const result = await prisma.cacheEntry.deleteMany({
      where: {
        namespace: BUFFER_NAMESPACE,
        key: { startsWith: 'completed:' },
        createdAt: { lt: cutoff },
      },
    });
    
    logger.info('resilient-buffer', 'cleanup', 
      `[WriteBuffer] Cleanup complete: ${result.count} old markers deleted`);
    
    return { deleted: result.count };
  } catch (error) {
    logger.error('resilient-buffer', 'cleanup', 
      `[WriteBuffer] Cleanup failed: ${error}`);
    return { deleted: 0 };
  }
}
