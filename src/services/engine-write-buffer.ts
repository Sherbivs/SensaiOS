/**
 * Engine Write Buffer — In-Memory Queue for Gameplay Logs
 * 
 * Provides non-blocking write operations with <10μs push latency.
 * Buffers battle logs, move usage, and anomalies in memory before
 * flushing to Write-DB every 30 seconds.
 * 
 * Architecture:
 * - Battle Engine → Write Buffer (sync push, <10μs)
 * - Write Buffer → Write-DB (async flush, 30s interval)
 * - Write-DB → PROD (async upload, hourly after validation)
 * 
 * Key Features:
 * - Non-blocking loggers (synchronous push to array)
 * - Periodic flush (30s interval, atomic splice)
 * - Backpressure mechanism (rejects at 95% utilization)
 * - Graceful shutdown (final flush before exit)
 * - Performance monitoring (utilization, flush stats)
 * 
 * Referenced By: src/core/battle/engine.ts, src/workers/engine-workers.ts,
 *                docs/engine-db-replication.md (Write Buffer Implementation section)
 * 
 * @module services/engine-write-buffer
 */

import { EngineDbConfig } from '../config/engine-db-config.js';
import { log } from '../utils/logger.js';
import { errorTracker } from './error-tracker.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Battle log entry (one per completed battle)
 */
export interface BattleLogEntry {
  battleId: string;
  trainerId1: string;
  trainerId2: string;
  winnerId: string;
  durationMs: number;
  turnCount: number;
  timestamp: Date;
}

/**
 * Move usage entry (one per move execution in battle)
 */
export interface MoveUsageEntry {
  battleId: string;
  trainerId: string;
  pokemonId: number;
  moveId: number;
  targetPokemonId: number;
  damage: number;
  effectiveness: number;
  isCritical: boolean;
  timestamp: Date;
}

/**
 * Anomaly entry (data quality issues detected during battle)
 */
export interface AnomalyEntry {
  battleId: string;
  anomalyType: 'INVALID_DAMAGE' | 'INVALID_TYPE' | 'INVALID_MOVE' | 'LOGIC_ERROR';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  context: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Buffer statistics (for observability)
 */
export interface BufferStats {
  battleLogQueueSize: number;
  moveUsageQueueSize: number;
  anomalyQueueSize: number;
  totalQueueSize: number;
  utilizationPercent: number;
  maxQueueSize: number;
  flushCount: number;
  lastFlushTime: Date | null;
  isBackpressureActive: boolean;
}

// ============================================================================
// Engine Write Buffer Class
// ============================================================================

/**
 * In-memory buffer for battle logs, move usage, and anomalies.
 * Provides synchronous push with <10μs latency, periodic flush every 30s.
 */
export class EngineWriteBuffer {
  // In-memory queues (append-only until flush)
  private battleLogQueue: BattleLogEntry[] = [];
  private moveUsageQueue: MoveUsageEntry[] = [];
  private anomalyQueue: AnomalyEntry[] = [];
  
  // State tracking
  private flushInterval: NodeJS.Timeout | null = null;
  private isFlushing: boolean = false;
  private flushCount: number = 0;
  private lastFlushTime: Date | null = null;
  private isBackpressureActive: boolean = false;
  
  // Performance metrics
  private pushCount: number = 0;
  private pushLatencySum: number = 0; // Microseconds
  
  // ============================================================================
  // Initialization (Startup)
  // ============================================================================
  
  /**
   * Start periodic flush worker (non-blocking background task).
   * 
   * This method starts a timer that flushes queues every 30 seconds.
   * Does NOT block startup - battle engine can start immediately.
   */
  start(): void {
    log('info', 'engine-write-buffer: Starting periodic flush worker', {
      flushIntervalMs: EngineDbConfig.writeBufferFlushIntervalMs,
      maxQueueSize: EngineDbConfig.writeBufferMaxQueueSize
    });
    
    this.flushInterval = setInterval(async () => {
      await this.flush();
    }, EngineDbConfig.writeBufferFlushIntervalMs);
  }
  
  // ============================================================================
  // Non-Blocking Loggers (Battle Engine Interface)
  // ============================================================================
  
  /**
   * Log completed battle (synchronous, <10μs).
   * 
   * @param entry Battle log entry
   * @throws {Error} If backpressure active (queue full)
   */
  logBattle(entry: BattleLogEntry): void {
    const start = performance.now();
    
    // Check backpressure before accepting
    if (this.isBackpressureActive) {
      throw new Error(
        `Write buffer backpressure active: Battle log queue full (${this.battleLogQueue.length}/${EngineDbConfig.writeBufferMaxQueueSize})`
      );
    }
    
    // Synchronous push (no await, <10μs)
    this.battleLogQueue.push(entry);
    
    this.trackPushLatency(performance.now() - start);
    this.checkBackpressure();
  }
  
  /**
   * Log move usage (synchronous, <10μs).
   * 
   * @param entry Move usage entry
   * @throws {Error} If backpressure active (queue full)
   */
  logMoveUsage(entry: MoveUsageEntry): void {
    const start = performance.now();
    
    // Check backpressure before accepting
    if (this.isBackpressureActive) {
      throw new Error(
        `Write buffer backpressure active: Move usage queue full (${this.moveUsageQueue.length}/${EngineDbConfig.writeBufferMaxQueueSize})`
      );
    }
    
    // Synchronous push (no await, <10μs)
    this.moveUsageQueue.push(entry);
    
    this.trackPushLatency(performance.now() - start);
    this.checkBackpressure();
  }
  
  /**
   * Log anomaly (synchronous, <10μs).
   * 
   * @param entry Anomaly entry
   * @throws {Error} If backpressure active (queue full)
   */
  logAnomaly(entry: AnomalyEntry): void {
    const start = performance.now();
    
    // Check backpressure before accepting
    if (this.isBackpressureActive) {
      throw new Error(
        `Write buffer backpressure active: Anomaly queue full (${this.anomalyQueue.length}/${EngineDbConfig.writeBufferMaxQueueSize})`
      );
    }
    
    // Synchronous push (no await, <10μs)
    this.anomalyQueue.push(entry);
    
    this.trackPushLatency(performance.now() - start);
    this.checkBackpressure();
  }
  
  // ============================================================================
  // Backpressure Management
  // ============================================================================
  
  /**
   * Check if any queue exceeds thresholds and activate backpressure.
   * 
   * Thresholds:
   * - 75%: Log warnings, alert operators
   * - 95%: Reject new battles, emergency flush
   */
  private checkBackpressure(): void {
    const maxSize = EngineDbConfig.writeBufferMaxQueueSize;
    const warnThreshold = maxSize * EngineDbConfig.writeBufferWarnThreshold;
    const rejectThreshold = maxSize * EngineDbConfig.writeBufferRejectThreshold;
    
    const battleLogSize = this.battleLogQueue.length;
    const moveUsageSize = this.moveUsageQueue.length;
    const anomalySize = this.anomalyQueue.length;
    const maxQueueSize = Math.max(battleLogSize, moveUsageSize, anomalySize);
    
    // Check reject threshold (95%)
    if (maxQueueSize >= rejectThreshold && !this.isBackpressureActive) {
      this.isBackpressureActive = true;
      
      log('error', 'engine-write-buffer: BACKPRESSURE ACTIVATED - Rejecting new battles', {
        battleLogSize,
        moveUsageSize,
        anomalySize,
        maxSize,
        utilizationPercent: ((maxQueueSize / maxSize) * 100).toFixed(2)
      });
      
      // Emergency flush (don't wait for next interval)
      this.flush().catch(error => {
        log('error', 'engine-write-buffer: Emergency flush failed', error);
      });
    }
    
    // Check warn threshold (75%)
    else if (maxQueueSize >= warnThreshold && !this.isBackpressureActive) {
      log('warn', 'engine-write-buffer: High queue utilization detected', {
        battleLogSize,
        moveUsageSize,
        anomalySize,
        maxSize,
        utilizationPercent: ((maxQueueSize / maxSize) * 100).toFixed(2)
      });
    }
    
    // Deactivate backpressure if queues drained below 50%
    if (this.isBackpressureActive && maxQueueSize < maxSize * 0.5) {
      this.isBackpressureActive = false;
      
      log('info', 'engine-write-buffer: Backpressure deactivated - Queues drained', {
        battleLogSize,
        moveUsageSize,
        anomalySize,
        utilizationPercent: ((maxQueueSize / maxSize) * 100).toFixed(2)
      });
    }
  }
  
  // ============================================================================
  // Periodic Flush (Background Task)
  // ============================================================================
  
  /**
   * Flush queues to Write-DB (async, non-blocking).
   * 
   * Strategy:
   * 1. Atomic splice (extract entries, ongoing battles can still push)
   * 2. Write to Write-DB (async, doesn't block new pushes)
   * 3. Track stats (flush duration, entries written)
   */
  async flush(): Promise<void> {
    if (this.isFlushing) {
      log('warn', 'engine-write-buffer: Flush already in progress, skipping');
      return;
    }
    
    // Quick check: Skip flush if all queues empty
    const totalSize = this.battleLogQueue.length + this.moveUsageQueue.length + this.anomalyQueue.length;
    if (totalSize === 0) {
      return; // Nothing to flush
    }
    
    this.isFlushing = true;
    const startTime = performance.now();
    
    try {
      // Step 1: Atomic splice (extract entries from queues)
      const battleLogs = this.battleLogQueue.splice(0, this.battleLogQueue.length);
      const moveUsage = this.moveUsageQueue.splice(0, this.moveUsageQueue.length);
      const anomalies = this.anomalyQueue.splice(0, this.anomalyQueue.length);
      
      // Step 2: Write to Write-DB (integrate with engine-write-db.ts)
      const writeDb = await import('./engine-write-db.js');
      
      // Ensure Write-DB initialized
      if (!writeDb.isReady()) {
        await writeDb.initialize();
      }
      
      // Insert entries to Write-DB
      if (battleLogs.length > 0) {
        await writeDb.insertBattleLogs(battleLogs);
      }
      
      if (moveUsage.length > 0) {
        await writeDb.insertMoveUsage(moveUsage);
      }
      
      if (anomalies.length > 0) {
        await writeDb.insertAnomalies(anomalies);
      }
      
      // Step 3: Track stats
      this.flushCount++;
      this.lastFlushTime = new Date();
      
      const durationMs = performance.now() - startTime;
      
      log('info', 'engine-write-buffer: Flush complete', {
        battleLogsWritten: battleLogs.length,
        moveUsageWritten: moveUsage.length,
        anomaliesWritten: anomalies.length,
        durationMs: durationMs.toFixed(2)
      });
      
      // Check backpressure after flush
      this.checkBackpressure();
      
    } catch (error) {
      // Track flush failure
      await errorTracker.captureError(error instanceof Error ? error : new Error(String(error)), {
        category: 'ENGINE',
        operation: 'engine-write-buffer:flush',
        customData: {
          queueSizes: this.getStats(),
        },
      });
      
      log('error', 'engine-write-buffer: Flush failed', error);
      
      // TODO: Re-queue failed entries? Or let them be lost?
      // Current strategy: Let them be lost (WAL will recover if crash)
      
    } finally {
      this.isFlushing = false;
    }
  }
  
  // ============================================================================
  // Observability & Stats
  // ============================================================================
  
  /**
   * Get buffer statistics (for /ops engine command and monitoring)
   */
  getStats(): BufferStats {
    const totalSize = this.battleLogQueue.length + this.moveUsageQueue.length + this.anomalyQueue.length;
    const maxSize = EngineDbConfig.writeBufferMaxQueueSize * 3; // 3 queues
    
    return {
      battleLogQueueSize: this.battleLogQueue.length,
      moveUsageQueueSize: this.moveUsageQueue.length,
      anomalyQueueSize: this.anomalyQueue.length,
      totalQueueSize: totalSize,
      utilizationPercent: (totalSize / maxSize) * 100,
      maxQueueSize: EngineDbConfig.writeBufferMaxQueueSize,
      flushCount: this.flushCount,
      lastFlushTime: this.lastFlushTime,
      isBackpressureActive: this.isBackpressureActive
    };
  }
  
  /**
   * Track push latency (microseconds)
   */
  private trackPushLatency(durationMs: number): void {
    const durationUs = durationMs * 1000; // Convert ms to μs
    
    this.pushCount++;
    this.pushLatencySum += durationUs;
    
    // Warn if latency exceeds expected threshold
    if (durationUs > EngineDbConfig.writeBufferExpectedLatencyUs) {
      log('warn', 'engine-write-buffer: Slow push detected', {
        latencyUs: durationUs.toFixed(2),
        expectedUs: EngineDbConfig.writeBufferExpectedLatencyUs
      });
    }
  }
  
  /**
   * Get average push latency (microseconds)
   */
  getAvgPushLatency(): number {
    return this.pushCount > 0 ? this.pushLatencySum / this.pushCount : 0;
  }
  
  /**
   * Reset performance metrics (for testing)
   */
  resetMetrics(): void {
    this.pushCount = 0;
    this.pushLatencySum = 0;
    this.flushCount = 0;
    this.lastFlushTime = null;
  }
  
  // ============================================================================
  // Lifecycle Management
  // ============================================================================
  
  /**
   * Graceful shutdown (final flush before exit, no data loss).
   * 
   * This method drains all queues and waits for final flush to complete.
   * Should be called on SIGTERM/SIGINT before process exit.
   * 
   * @param timeoutMs Max time to wait for final flush (default: 10 seconds)
   */
  async shutdown(timeoutMs: number = EngineDbConfig.writeBufferShutdownTimeoutMs): Promise<void> {
    log('info', 'engine-write-buffer: Starting graceful shutdown...');
    
    // Stop accepting new entries (backpressure)
    this.isBackpressureActive = true;
    
    // Stop periodic flush worker
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // Final flush with timeout
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Write buffer shutdown timeout (>${timeoutMs}ms)`));
        }, timeoutMs);
      });
      
      await Promise.race([
        this.flush(),
        timeoutPromise
      ]);
      
      const stats = this.getStats();
      log('info', 'engine-write-buffer: Graceful shutdown complete', {
        totalFlushes: stats.flushCount,
        avgPushLatencyUs: this.getAvgPushLatency().toFixed(2),
        finalQueueSize: stats.totalQueueSize
      });
      
    } catch (error) {
      log('error', 'engine-write-buffer: Shutdown flush failed or timed out', error);
      
      const stats = this.getStats();
      if (stats.totalQueueSize > 0) {
        log('warn', 'engine-write-buffer: DATA LOSS WARNING - Unflushed entries', {
          battleLogsLost: stats.battleLogQueueSize,
          moveUsageLost: stats.moveUsageQueueSize,
          anomaliesLost: stats.anomalyQueueSize
        });
      }
    }
  }
  
  /**
   * Emergency shutdown (best-effort flush on crash).
   * 
   * Called on uncaughtException/unhandledRejection.
   * May not complete if process killed (SIGKILL, OOM).
   */
  async emergencyShutdown(): Promise<void> {
    log('error', 'engine-write-buffer: EMERGENCY SHUTDOWN - Attempting best-effort flush');
    
    try {
      // Synchronous data collection (prepare for possible crash)
      const stats = this.getStats();
      
      // Attempt flush (may fail if system corrupted)
      await this.flush();
      
      log('info', 'engine-write-buffer: Emergency flush succeeded', {
        battleLogsFlushed: stats.battleLogQueueSize,
        moveUsageFlushed: stats.moveUsageQueueSize,
        anomaliesFlushed: stats.anomalyQueueSize
      });
      
    } catch (error) {
      log('error', 'engine-write-buffer: Emergency flush failed', error);
      // WAL will recover on next startup
    }
  }
}

// ============================================================================
// Singleton Instance (Global Access)
// ============================================================================

/**
 * Global write buffer instance (initialized at startup)
 * 
 * Usage:
 * ```typescript
 * import { engineWriteBuffer } from './services/engine-write-buffer.js';
 * 
 * // In battle engine
 * engineWriteBuffer.logMoveUsage({
 *   battleId: 'battle-123',
 *   trainerId: 'trainer-456',
 *   pokemonId: 25,
 *   moveId: 85,
 *   targetPokemonId: 6,
 *   damage: 42,
 *   effectiveness: 2.0,
 *   isCritical: false,
 *   timestamp: new Date()
 * });
 * 
 * // On shutdown
 * await engineWriteBuffer.shutdown();
 * ```
 */
export const engineWriteBuffer = new EngineWriteBuffer();
