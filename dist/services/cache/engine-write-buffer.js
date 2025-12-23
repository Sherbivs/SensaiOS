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
import { EngineDbConfig } from '../../config/engine-db-config.js';
import { getLogger } from "../../shared/logging/index.js";
import { errorTracker } from '../monitoring/error-tracker.js';
import { ensureError } from '../../shared/utils/error-utils.js';
const logger = getLogger();
// ============================================================================
// Engine Write Buffer Class
// ============================================================================
/**
 * In-memory buffer for battle logs, move usage, and anomalies.
 * Provides synchronous push with <10μs latency, periodic flush every 30s.
 */
export class EngineWriteBuffer {
    // In-memory queues (append-only until flush)
    battleLogQueue = [];
    moveUsageQueue = [];
    anomalyQueue = [];
    // State tracking
    flushInterval = null;
    isFlushing = false;
    flushCount = 0;
    lastFlushTime = null;
    isBackpressureActive = false;
    // Performance metrics
    pushCount = 0;
    pushLatencySum = 0; // Microseconds
    // ============================================================================
    // Initialization (Startup)
    // ============================================================================
    /**
     * Start periodic flush worker (non-blocking background task).
     *
     * This method starts a timer that flushes queues every 30 seconds.
     * Does NOT block startup - battle engine can start immediately.
     */
    start() {
        logger.info('engine-write-buffer', 'start', 'Starting periodic flush worker', {
            metadata: {
                flushIntervalMs: EngineDbConfig.writeBufferFlushIntervalMs,
                maxQueueSize: EngineDbConfig.writeBufferMaxQueueSize
            },
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
    logBattle(entry) {
        const start = performance.now();
        // Check backpressure before accepting
        if (this.isBackpressureActive) {
            throw new Error(`Write buffer backpressure active: Battle log queue full (${this.battleLogQueue.length}/${EngineDbConfig.writeBufferMaxQueueSize})`);
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
    logMoveUsage(entry) {
        const start = performance.now();
        // Check backpressure before accepting
        if (this.isBackpressureActive) {
            throw new Error(`Write buffer backpressure active: Move usage queue full (${this.moveUsageQueue.length}/${EngineDbConfig.writeBufferMaxQueueSize})`);
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
    logAnomaly(entry) {
        const start = performance.now();
        // Check backpressure before accepting
        if (this.isBackpressureActive) {
            throw new Error(`Write buffer backpressure active: Anomaly queue full (${this.anomalyQueue.length}/${EngineDbConfig.writeBufferMaxQueueSize})`);
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
    checkBackpressure() {
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
            logger.error('engine-write-buffer', 'backpressure', 'BACKPRESSURE ACTIVATED - Rejecting new battles', {
                metadata: {
                    battleLogSize,
                    moveUsageSize,
                    anomalySize,
                    maxSize,
                    utilizationPercent: ((maxQueueSize / maxSize) * 100).toFixed(2)
                },
            });
            // Emergency flush (don't wait for next interval)
            this.flush().catch(error => {
                logger.error('engine-write-buffer', 'emergency-flush', 'Emergency flush failed', {
                    error: { name: 'FlushError', message: String(error) },
                });
            });
        }
        // Check warn threshold (75%)
        else if (maxQueueSize >= warnThreshold && !this.isBackpressureActive) {
            logger.warn('engine-write-buffer', 'utilization', 'High queue utilization detected', {
                metadata: {
                    battleLogSize,
                    moveUsageSize,
                    anomalySize,
                    maxSize,
                    utilizationPercent: ((maxQueueSize / maxSize) * 100).toFixed(2)
                },
            });
        }
        // Deactivate backpressure if queues drained below 50%
        if (this.isBackpressureActive && maxQueueSize < maxSize * 0.5) {
            this.isBackpressureActive = false;
            logger.info('engine-write-buffer', 'backpressure', 'Backpressure deactivated - Queues drained', {
                metadata: {
                    battleLogSize,
                    moveUsageSize,
                    anomalySize,
                    utilizationPercent: ((maxQueueSize / maxSize) * 100).toFixed(2)
                },
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
    async flush() {
        if (this.isFlushing) {
            logger.warn('engine-write-buffer', 'flush', 'Flush already in progress, skipping');
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
            const writeDb = await import('../database/engine-write-db.js');
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
            logger.info('engine-write-buffer', 'flush', 'Flush complete', {
                durationMs,
                metadata: {
                    battleLogsWritten: battleLogs.length,
                    moveUsageWritten: moveUsage.length,
                    anomaliesWritten: anomalies.length,
                }
            });
            // Check backpressure after flush
            this.checkBackpressure();
        }
        catch (error) {
            // Track flush failure
            await errorTracker.captureError(ensureError(error), {
                category: 'ENGINE',
                operation: 'engine-write-buffer:flush',
                customData: {
                    queueSizes: this.getStats(),
                },
            });
            logger.error('engine-write-buffer', 'flush', 'Flush failed', {
                error: {
                    name: ensureError(error).name,
                    message: ensureError(error).message,
                    stack: ensureError(error).stack,
                }
            });
            // TODO: Re-queue failed entries? Or let them be lost?
            // Current strategy: Let them be lost (WAL will recover if crash)
        }
        finally {
            this.isFlushing = false;
        }
    }
    // ============================================================================
    // Observability & Stats
    // ============================================================================
    /**
     * Get buffer statistics (for /ops engine command and monitoring)
     */
    getStats() {
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
    trackPushLatency(durationMs) {
        const durationUs = durationMs * 1000; // Convert ms to μs
        this.pushCount++;
        this.pushLatencySum += durationUs;
        // Warn if latency exceeds expected threshold
        if (durationUs > EngineDbConfig.writeBufferExpectedLatencyUs) {
            logger.warn('engine-write-buffer', 'push', 'Slow push detected', {
                latencyMs: durationMs,
                metadata: {
                    latencyUs: durationUs.toFixed(2),
                    expectedUs: EngineDbConfig.writeBufferExpectedLatencyUs,
                }
            });
        }
    }
    /**
     * Get average push latency (microseconds)
     */
    getAvgPushLatency() {
        return this.pushCount > 0 ? this.pushLatencySum / this.pushCount : 0;
    }
    /**
     * Reset performance metrics (for testing)
     */
    resetMetrics() {
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
    async shutdown(timeoutMs = EngineDbConfig.writeBufferShutdownTimeoutMs) {
        logger.info('engine-write-buffer', 'shutdown', 'Starting graceful shutdown...');
        // Stop accepting new entries (backpressure)
        this.isBackpressureActive = true;
        // Stop periodic flush worker
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        // Final flush with timeout
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Write buffer shutdown timeout (>${timeoutMs}ms)`));
                }, timeoutMs);
            });
            await Promise.race([
                this.flush(),
                timeoutPromise
            ]);
            const stats = this.getStats();
            logger.info('engine-write-buffer', 'shutdown', 'Graceful shutdown complete', {
                metadata: {
                    totalFlushes: stats.flushCount,
                    avgPushLatencyUs: this.getAvgPushLatency().toFixed(2),
                    finalQueueSize: stats.totalQueueSize,
                }
            });
        }
        catch (error) {
            const err = ensureError(error);
            logger.error('engine-write-buffer', 'shutdown', 'Shutdown flush failed or timed out', {
                error: {
                    name: err.name,
                    message: err.message,
                    stack: err.stack,
                }
            });
            const stats = this.getStats();
            if (stats.totalQueueSize > 0) {
                logger.warn('engine-write-buffer', 'shutdown', 'DATA LOSS WARNING - Unflushed entries', {
                    metadata: {
                        battleLogsLost: stats.battleLogQueueSize,
                        moveUsageLost: stats.moveUsageQueueSize,
                        anomaliesLost: stats.anomalyQueueSize,
                    }
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
    async emergencyShutdown() {
        logger.error('engine-write-buffer', 'emergency-shutdown', 'EMERGENCY SHUTDOWN - Attempting best-effort flush');
        try {
            // Synchronous data collection (prepare for possible crash)
            const stats = this.getStats();
            // Attempt flush (may fail if system corrupted)
            await this.flush();
            logger.info('engine-write-buffer', 'emergency-shutdown', 'Emergency flush succeeded', {
                metadata: {
                    battleLogsFlushed: stats.battleLogQueueSize,
                    moveUsageFlushed: stats.moveUsageQueueSize,
                    anomaliesFlushed: stats.anomalyQueueSize,
                }
            });
        }
        catch (error) {
            const err = ensureError(error);
            logger.error('engine-write-buffer', 'emergency-shutdown', 'Emergency flush failed', {
                error: {
                    name: err.name,
                    message: err.message,
                    stack: err.stack,
                }
            });
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
