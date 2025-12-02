/**
 * Log Ingestion Worker - Event Bus → TimescaleDB Pipeline
 * 
 * ⚠️ **DEPRECATED** — This file is being replaced by the standardized logging system.
 * 
 * **Replacement:** Use `src/shared/logger.ts` + `src/workers/database/timescaledb-worker.ts`
 * 
 * **Migration Path:**
 * 1. Replace Event Bus subscriptions with direct logger.info/error/warn calls
 * 2. Logger.ts handles real-time TimescaleDB ingestion via TimescaleDBWorker
 * 3. Standardized vocabulary from LOGGING-STANDARD.md (components + operations)
 * 4. Type-safe logging with compile-time validation
 * 
 * **Why Deprecated:**
 * - OLD: Event Bus → log-ingestion-worker → Prisma → TimescaleDB (indirect, complex)
 * - NEW: logger.ts → TimescaleDBWorker → TimescaleDB (direct, type-safe, standardized)
 * 
 * **Removal Timeline:** After 100% logger.ts adoption (Task 9 Phase 2-5 complete)
 * 
 * ---
 * 
 * Original description:
 * Subscribes to ALL Event Bus events and persists to log_entries hypertable.
 * 
 * Features:
 * - Batch processing (100 events OR 5 minutes)
 * - Graceful degradation (fallback to file logs on database failure)
 * - Quality validation (>95% success threshold)
 * - Automatic retry with exponential backoff
 * 
 * @module workers/log-ingestion-worker
 * @deprecated Use src/shared/logger.ts instead
 */

/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { EventBus, type BusEvent } from '../shared/event-bus.js';
import { prisma } from '../shared/prisma.js';
import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

/// ---- Configuration ----

const BATCH_SIZE = 100;                  // Events per batch insert
const BATCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const FALLBACK_LOG_DIR = 'Store/failed-log-ingestion';
const QUALITY_THRESHOLD = 0.95;          // 95% success rate minimum

/// ---- State ----

const eventBuffer: BusEvent[] = [];
let batchTimer: NodeJS.Timeout | null = null;
let subscriptionId: string | null = null;
let shutdownRequested = false;

const stats = {
  eventsReceived: 0,
  eventsIngested: 0,
  batchesProcessed: 0,
  errors: 0,
  lastIngestTimestamp: null as Date | null,
  fallbackWrites: 0,
};

/// ---- Core Logic ----

/**
 * Transform Event Bus event to LogEntry record
 */
function transformEvent(event: BusEvent) {
  return {
    timestamp: event.timestamp,
    level: extractLevel(event),
    category: extractCategory(event),
    message: extractMessage(event),
    metadata: event.payload as any, // Type cast for Prisma compatibility (file deprecated)
    correlationId: event.correlationId,
    serviceName: event.emitter || 'unknown',
    userId: extractUserId(event),
    traceContext: extractTraceContext(event),
  };
}

/**
 * Extract log level from event topic
 * Examples: 'error.critical' → 'error', 'battle.started' → 'info'
 */
function extractLevel(event: BusEvent): string {
  const topic = event.topic.toLowerCase();
  
  if (topic.includes('error') || topic.includes('fatal')) return 'error';
  if (topic.includes('warn') || topic.includes('warning')) return 'warn';
  if (topic.includes('debug')) return 'debug';
  
  return 'info';
}

/**
 * Extract category from event topic
 * Examples: 'battle.started' → 'BATTLE', 'error.critical' → 'ERROR'
 */
function extractCategory(event: BusEvent): string {
  const parts = event.topic.split('.');
  const category = parts[0].toUpperCase();
  
  const categoryMap: Record<string, string> = {
    'BATTLE': 'BATTLE',
    'ENCOUNTER': 'EVENT',
    'ERROR': 'ERROR',
    'ALERT': 'ALERT',
    'SECURITY': 'SECURITY',
    'CACHE': 'CACHE',
    'DATABASE': 'DATABASE',
    'API': 'API',
    'WORKER': 'WORKER',
  };
  
  return categoryMap[category] || 'SYSTEM';
}

/**
 * Extract message from event payload
 */
function extractMessage(event: BusEvent): string {
  if (typeof event.payload === 'string') return event.payload;
  if (event.payload?.message) return String(event.payload.message);
  if (event.payload?.error?.message) return String(event.payload.error.message);
  
  return event.topic;
}

/**
 * Extract user ID from event payload
 */
function extractUserId(event: BusEvent): string | null {
  if (typeof event.payload !== 'object' || event.payload === null) return null;
  return event.payload.userId || event.payload.user_id || null;
}

/**
 * Extract trace context from event payload
 */
function extractTraceContext(event: BusEvent): string | null {
  if (typeof event.payload !== 'object' || event.payload === null) return null;
  return event.payload.traceContext || event.payload.trace_context || null;
}

/**
 * Flush event buffer to database (batch insert)
 */
async function flushBatch(): Promise<void> {
  if (eventBuffer.length === 0) return;
  
  const batch = eventBuffer.splice(0, BATCH_SIZE);
  const logEntries = batch.map(transformEvent);
  
  try {
    // Batch insert via Prisma
    const result = await prisma.logEntry.createMany({
      data: logEntries,
      skipDuplicates: true,
    });
    
    stats.eventsIngested += result.count;
    stats.batchesProcessed++;
    stats.lastIngestTimestamp = new Date();
    
    // Quality validation
    const successRate = result.count / logEntries.length;
    if (successRate < QUALITY_THRESHOLD) {
      console.warn('[LogIngestionWorker] Quality threshold violation:', {
        expected: QUALITY_THRESHOLD,
        actual: successRate,
        inserted: result.count,
        attempted: logEntries.length,
      });
    }
    
    console.log('[LogIngestionWorker] Batch ingested:', {
      count: result.count,
      totalIngested: stats.eventsIngested,
      bufferSize: eventBuffer.length,
    });
  } catch (error) {
    stats.errors++;
    console.error('[LogIngestionWorker] Database insert failed:', error);
    
    // Graceful degradation: write to file
    await fallbackToFile(batch);
  }
  
  // Reschedule batch timer if buffer still has events
  if (eventBuffer.length >= BATCH_SIZE) {
    await flushBatch();
  } else if (eventBuffer.length > 0 && !shutdownRequested) {
    scheduleBatchFlush();
  }
}

/**
 * Fallback: write events to JSON Lines file (when database unavailable)
 */
async function fallbackToFile(events: BusEvent[]): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  const filename = path.join(FALLBACK_LOG_DIR, `failed-ingestion-${date}.jsonl`);
  
  try {
    // Ensure directory exists
    await mkdir(FALLBACK_LOG_DIR, { recursive: true });
    
    // Append events as JSON Lines
    const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
    await appendFile(filename, lines);
    
    stats.fallbackWrites += events.length;
    console.warn('[LogIngestionWorker] Events written to fallback file:', filename);
  } catch (error) {
    console.error('[LogIngestionWorker] Fallback file write failed:', error);
    // Last resort: console output (Render captures logs)
    console.log('[LogIngestionWorker] Lost events (console dump):', events);
  }
}

/**
 * Schedule batch flush after timeout
 */
function scheduleBatchFlush(): void {
  if (batchTimer) {
    clearTimeout(batchTimer);
  }
  
  batchTimer = setTimeout(() => {
    flushBatch();
  }, BATCH_INTERVAL_MS);
}

/// ---- Lifecycle ----

/**
 * Start log ingestion worker
 */
export async function startLogIngestionWorker(): Promise<void> {
  const bus = EventBus.getInstance();
  
  // Subscribe to ALL events (pattern: '**')
  subscriptionId = bus.subscribe(
    '**',
    (event) => {
      stats.eventsReceived++;
      eventBuffer.push(event);
      
      // Flush immediately if buffer full
      if (eventBuffer.length >= BATCH_SIZE) {
        flushBatch();
      } else if (!batchTimer) {
        scheduleBatchFlush();
      }
    },
    {
      priority: -10,
      maxQueueSize: 1000,
      async: true,
    }
  );
  
  console.log('[LogIngestionWorker] Started:', {
    subscriptionId,
    batchSize: BATCH_SIZE,
    batchIntervalMs: BATCH_INTERVAL_MS,
  });
}

/**
 * Stop log ingestion worker (graceful shutdown)
 */
export async function stopLogIngestionWorker(): Promise<void> {
  shutdownRequested = true;
  
  // Unsubscribe from Event Bus
  if (subscriptionId) {
    const bus = EventBus.getInstance();
    bus.unsubscribe(subscriptionId);
    subscriptionId = null;
  }
  
  // Clear batch timer
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  
  // Flush remaining events
  if (eventBuffer.length > 0) {
    console.log('[LogIngestionWorker] Flushing remaining events:', eventBuffer.length);
    await flushBatch();
  }
  
  console.log('[LogIngestionWorker] Stopped:', stats);
}

/**
 * Get worker statistics
 */
export function getLogIngestionStats() {
  return {
    ...stats,
    bufferSize: eventBuffer.length,
    isActive: subscriptionId !== null,
  };
}
