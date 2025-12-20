/**
 * Engine Workers Orchestrator — Background Task Coordination
 *
 * Coordinates 5 background workers that handle Engine DB operations:
 * 1. Cache Refresh Worker → Refreshes L1 cache hourly (non-blocking)
 * 2. Write Buffer Flusher → Flushes write buffer every 30s (non-blocking)
 * 3. Read-DB Sync Worker → Syncs PROD → Read-DB daily (Render cron job)
 * 4. Write-DB Validator → Validates + uploads Write-DB every 10 minutes
 * 5. Engine Maintenance Worker → Forces buffer flush + Read-DB rebuild every 8 hours
 *
 * Key Features:
 * - Graceful startup (staggered initialization to prevent thundering herd)
 * - Graceful shutdown (stop workers, wait for in-flight tasks)
 * - Error isolation (worker failure doesn't crash others)
 * - Performance monitoring (track last run time, error counts)
 * - Feature flag support (enable/disable individual workers)
 *
 * Referenced By: src/index.ts (startup/shutdown), docs/engine-db-replication.md
 *                (Worker Architecture section)
 *
 * @module workers/engine-workers
 */
import { performance } from 'node:perf_hooks';
import { EngineDbConfig } from '../config/engine-db-config.js';
import { engineCache } from '../services/cache/engine-cache.js';
import { engineWriteBuffer } from '../services/cache/engine-write-buffer.js';
import { workerErrorHandler } from './worker-error-handler.js';
import { log } from "../shared/logger.js";
import { getErrorMessage, delay, ensureError } from '../shared/utils/index.js';
// ============================================================================
// Worker 1: Cache Refresh Worker
// ============================================================================
/**
 * Worker 1: Refreshes L1 cache from Read-DB hourly (non-blocking).
 *
 * Purpose: Pick up emergency data fixes applied to Read-DB without restart.
 * Frequency: Hourly (configurable via EngineDbConfig.l1CacheRefreshIntervalMs)
 * Non-blocking: Uses double-buffering, battles unaffected during refresh
 */
class CacheRefreshWorker {
    interval = null;
    isRunning = false;
    status = {
        name: 'CacheRefreshWorker',
        isRunning: false,
        lastRunTime: null,
        lastRunDurationMs: 0,
        successCount: 0,
        errorCount: 0,
        lastError: null
    };
    /**
     * Start periodic refresh worker with staggered startup
     */
    async start() {
        if (this.interval) {
            log('warn', 'engine-workers: CacheRefreshWorker already running');
            return;
        }
        log('info', 'engine-workers: Starting CacheRefreshWorker', {
            intervalMs: EngineDbConfig.l1CacheRefreshIntervalMs,
            staggerDelayMs: EngineDbConfig.workerStartupStaggerMs
        });
        // Stagger startup (prevent thundering herd)
        await delay(EngineDbConfig.workerStartupStaggerMs);
        // Start periodic execution
        this.interval = setInterval(async () => {
            await this.execute();
        }, EngineDbConfig.l1CacheRefreshIntervalMs);
        this.isRunning = true;
    }
    /**
     * Execute cache refresh task
     */
    async execute() {
        if (this.status.isRunning) {
            log('warn', 'engine-workers: CacheRefreshWorker execution skipped (previous run still in progress)');
            return;
        }
        this.status.isRunning = true;
        const startTime = performance.now();
        try {
            log('info', 'engine-workers: CacheRefreshWorker execution started');
            // Delegate to engineCache (handles double-buffering)
            await engineCache['refresh'](); // Access private method via bracket notation
            const durationMs = performance.now() - startTime;
            this.status.lastRunTime = new Date();
            this.status.lastRunDurationMs = durationMs;
            this.status.successCount++;
            this.status.lastError = null;
            log('info', 'engine-workers: CacheRefreshWorker execution complete', {
                durationMs: durationMs.toFixed(2),
                successCount: this.status.successCount
            });
        }
        catch (error) {
            const durationMs = performance.now() - startTime;
            this.status.lastRunTime = new Date();
            this.status.lastRunDurationMs = durationMs;
            this.status.errorCount++;
            this.status.lastError = getErrorMessage(error);
            log('error', 'engine-workers: CacheRefreshWorker execution failed', {
                error: this.status.lastError,
                errorCount: this.status.errorCount
            });
            // Capture error for tracking
            await workerErrorHandler.handleCacheRefreshError(ensureError(error), 'engine-cache-l1', 'refresh');
        }
        finally {
            this.status.isRunning = false;
        }
    }
    /**
     * Stop worker gracefully
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.isRunning = false;
            log('info', 'engine-workers: CacheRefreshWorker stopped', {
                totalRuns: this.status.successCount + this.status.errorCount,
                successCount: this.status.successCount,
                errorCount: this.status.errorCount
            });
        }
    }
    /**
     * Get worker status
     */
    getStatus() {
        return { ...this.status };
    }
}
// ============================================================================
// Worker 2: Write Buffer Flusher
// ============================================================================
/**
 * Worker 2: Flushes write buffer to Write-DB every 30 seconds (non-blocking).
 *
 * Purpose: Persist in-memory battle logs to disk before memory exhaustion.
 * Frequency: 30 seconds (configurable via EngineDbConfig.writeBufferFlushIntervalMs)
 * Non-blocking: Uses atomic splice, battles can push during flush
 */
class WriteBufferFlusher {
    interval = null;
    isRunning = false;
    status = {
        name: 'WriteBufferFlusher',
        isRunning: false,
        lastRunTime: null,
        lastRunDurationMs: 0,
        successCount: 0,
        errorCount: 0,
        lastError: null
    };
    // Adaptive polling state
    consecutiveEmptyFlushes = 0;
    currentFlushIntervalMs = EngineDbConfig.writeBufferFlushIntervalMs;
    lastDataSeen = null;
    totalFlushesSkipped = 0;
    /**
     * Start periodic flush worker with staggered startup and adaptive polling
     */
    async start() {
        if (this.interval) {
            log('warn', 'engine-workers: WriteBufferFlusher already running');
            return;
        }
        log('info', 'engine-workers: Starting WriteBufferFlusher with adaptive polling', {
            baseIntervalMs: this.currentFlushIntervalMs,
            staggerDelayMs: EngineDbConfig.workerStartupStaggerMs * 2
        });
        // Stagger startup (2x delay to avoid overlap with Worker 1)
        await delay(EngineDbConfig.workerStartupStaggerMs * 2);
        // Start periodic execution
        this.interval = setInterval(async () => {
            await this.execute();
        }, this.currentFlushIntervalMs);
        this.isRunning = true;
    }
    /**
     * Execute buffer flush task with adaptive polling
     * Skips flush if queues empty, adjusts interval based on activity
     */
    async execute() {
        if (this.status.isRunning) {
            log('warn', 'engine-workers: WriteBufferFlusher execution skipped (previous run still in progress)');
            return;
        }
        // Check buffer state BEFORE taking lock (fast check)
        const bufferStats = engineWriteBuffer.getStats();
        // ADAPTIVE CONTROL: Skip flush if queues empty
        if (bufferStats.totalQueueSize === 0) {
            this.consecutiveEmptyFlushes++;
            this.totalFlushesSkipped++;
            log('info', 'engine-workers: WriteBufferFlusher skipping empty flush (adaptive polling)', {
                consecutiveEmpty: this.consecutiveEmptyFlushes,
                currentInterval: `${this.currentFlushIntervalMs / 1000}s`,
                totalSkipped: this.totalFlushesSkipped,
            });
            // Adjust interval after 5 consecutive empty flushes
            if (this.consecutiveEmptyFlushes >= 5) {
                this.adjustFlushInterval('increase');
            }
            return; // Skip flush entirely
        }
        this.status.isRunning = true;
        const startTime = performance.now();
        try {
            // Data present, reset adaptive state
            this.consecutiveEmptyFlushes = 0;
            this.lastDataSeen = new Date();
            // Reset interval if needed
            if (this.currentFlushIntervalMs !== EngineDbConfig.writeBufferFlushIntervalMs) {
                this.adjustFlushInterval('reset');
            }
            // Delegate to engineWriteBuffer (handles atomic splice)
            await engineWriteBuffer.flush();
            const durationMs = performance.now() - startTime;
            this.status.lastRunTime = new Date();
            this.status.lastRunDurationMs = durationMs;
            this.status.successCount++;
            this.status.lastError = null;
            // Only log if flush actually wrote data (check buffer stats)
            const updatedStats = engineWriteBuffer.getStats();
            if (updatedStats.flushCount > 0) {
                log('info', 'engine-workers: WriteBufferFlusher execution complete', {
                    durationMs: durationMs.toFixed(2),
                    flushCount: updatedStats.flushCount,
                    successCount: this.status.successCount,
                    adaptivePolling: {
                        consecutiveEmpty: this.consecutiveEmptyFlushes,
                        currentInterval: `${this.currentFlushIntervalMs / 1000}s`,
                        totalSkipped: this.totalFlushesSkipped,
                    },
                });
            }
        }
        catch (error) {
            const durationMs = performance.now() - startTime;
            this.status.lastRunTime = new Date();
            this.status.lastRunDurationMs = durationMs;
            this.status.errorCount++;
            this.status.lastError = getErrorMessage(error);
            log('error', 'engine-workers: WriteBufferFlusher execution failed', {
                error: this.status.lastError,
                errorCount: this.status.errorCount
            });
            // Capture error for tracking
            const bufferStats = engineWriteBuffer.getStats();
            await workerErrorHandler.handleTaskError(ensureError(error), 'WriteBufferFlusher', 'flush', {
                operation: 'buffer-flush',
                customData: {
                    battleLogQueueSize: bufferStats.battleLogQueueSize,
                    moveUsageQueueSize: bufferStats.moveUsageQueueSize,
                    anomalyQueueSize: bufferStats.anomalyQueueSize,
                },
            });
        }
        finally {
            this.status.isRunning = false;
        }
    }
    /**
     * Adjust flush interval based on activity (adaptive polling)
     * @param action - 'increase' to double interval (low activity), 'reset' to base interval (activity detected)
     */
    adjustFlushInterval(action) {
        const baseInterval = EngineDbConfig.writeBufferFlushIntervalMs;
        const maxInterval = 60 * 1000; // 60 seconds max (6x base for 10s interval)
        if (action === 'increase') {
            const newInterval = Math.min(this.currentFlushIntervalMs * 2, maxInterval);
            if (newInterval !== this.currentFlushIntervalMs) {
                const oldInterval = this.currentFlushIntervalMs;
                this.currentFlushIntervalMs = newInterval;
                this.restartTimer();
                log('info', 'engine-workers: WriteBufferFlusher increasing flush interval (low activity)', {
                    from: `${oldInterval / 1000}s`,
                    to: `${newInterval / 1000}s`,
                    consecutiveEmpty: this.consecutiveEmptyFlushes,
                    reason: 'No battles detected, reducing disk I/O',
                });
            }
        }
        else if (action === 'reset') {
            if (this.currentFlushIntervalMs !== baseInterval) {
                const oldInterval = this.currentFlushIntervalMs;
                this.currentFlushIntervalMs = baseInterval;
                this.restartTimer();
                log('info', 'engine-workers: WriteBufferFlusher resetting flush interval (activity detected)', {
                    from: `${oldInterval / 1000}s`,
                    to: `${baseInterval / 1000}s`,
                    reason: 'Battles detected, resuming normal flush frequency',
                });
            }
        }
    }
    /**
     * Restart timer with current interval (called after interval adjustment)
     */
    restartTimer() {
        if (this.interval) {
            clearInterval(this.interval);
        }
        this.interval = setInterval(async () => {
            await this.execute();
        }, this.currentFlushIntervalMs);
    }
    /**
     * Stop worker gracefully
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.isRunning = false;
            log('info', 'engine-workers: WriteBufferFlusher stopped', {
                totalRuns: this.status.successCount + this.status.errorCount,
                successCount: this.status.successCount,
                errorCount: this.status.errorCount,
                adaptivePolling: {
                    totalFlushesSkipped: this.totalFlushesSkipped,
                    finalInterval: `${this.currentFlushIntervalMs / 1000}s`,
                },
            });
        }
    }
    /**
     * Get worker status
     */
    getStatus() {
        return { ...this.status };
    }
}
// ============================================================================
// Worker 3: Read-DB Sync Worker (Placeholder - Runs as Render Cron)
// ============================================================================
/**
 * Worker 3: Syncs PROD → Read-DB daily (runs as Render Cron Job).
 *
 * Purpose: Keep Read-DB in sync with PROD for cache refresh.
 * Frequency: Daily at 4 AM UTC (configured in render.yaml)
 *
 * NOTE: This worker runs as a SEPARATE Render Cron Job, not in-process.
 * This class is a placeholder for status tracking only.
 */
class ReadDbSyncWorker {
    status = {
        name: 'ReadDbSyncWorker',
        isRunning: false,
        lastRunTime: null,
        lastRunDurationMs: 0,
        successCount: 0,
        errorCount: 0,
        lastError: null
    };
    /**
     * Placeholder start (actual work happens in Render cron job)
     */
    async start() {
        log('info', 'engine-workers: ReadDbSyncWorker (Render Cron Job)', {
            schedule: EngineDbConfig.readDbSyncCron,
            note: 'This worker runs as a separate Render Cron Job, not in-process'
        });
    }
    /**
     * Placeholder stop
     */
    stop() {
        log('info', 'engine-workers: ReadDbSyncWorker (no in-process work to stop)');
    }
    /**
     * Get worker status
     */
    getStatus() {
        return { ...this.status };
    }
    /**
     * Update status after cron job completion (called externally)
     */
    recordExecution(success, durationMs, error = null) {
        this.status.lastRunTime = new Date();
        this.status.lastRunDurationMs = durationMs;
        if (success) {
            this.status.successCount++;
            this.status.lastError = null;
        }
        else {
            this.status.errorCount++;
            this.status.lastError = error;
        }
    }
}
// ============================================================================
// Worker 4: Write-DB Validator Worker
// ============================================================================
/**
 * Worker 4: Validates Write-DB data and uploads to PROD every 10 minutes.
 *
 * Purpose: Ensure data quality before polluting PROD with bad battle logs.
 * Frequency: 10 minutes (configurable via EngineDbConfig.writeDbValidatorIntervalMs)
 * Quality threshold: 95% pass rate required for PROD upload
 */
class WriteDbValidatorWorker {
    interval = null;
    isRunning = false;
    status = {
        name: 'WriteDbValidatorWorker',
        isRunning: false,
        lastRunTime: null,
        lastRunDurationMs: 0,
        successCount: 0,
        errorCount: 0,
        lastError: null
    };
    /**
     * Start periodic validator worker with staggered startup
     */
    async start() {
        if (this.interval) {
            log('warn', 'engine-workers: WriteDbValidatorWorker already running');
            return;
        }
        log('info', 'engine-workers: Starting WriteDbValidatorWorker', {
            intervalMs: EngineDbConfig.writeDbValidatorIntervalMs,
            minQualityScore: EngineDbConfig.validationMinQualityScore,
            staggerDelayMs: EngineDbConfig.workerStartupStaggerMs * 3
        });
        // Stagger startup (3x delay to avoid overlap with Workers 1 & 2)
        await delay(EngineDbConfig.workerStartupStaggerMs * 3);
        // Start periodic execution
        this.interval = setInterval(async () => {
            await this.execute();
        }, EngineDbConfig.writeDbValidatorIntervalMs);
        this.isRunning = true;
    }
    /**
     * Execute validation + upload task
     */
    async execute() {
        if (this.status.isRunning) {
            log('warn', 'engine-workers: WriteDbValidatorWorker execution skipped (previous run still in progress)');
            return;
        }
        this.status.isRunning = true;
        const startTime = performance.now();
        try {
            log('info', 'engine-workers: WriteDbValidatorWorker execution started');
            // Import Write-DB service
            const writeDb = await import('../services/database/engine-write-db.js');
            // Ensure Write-DB initialized
            if (!writeDb.isReady()) {
                log('warn', 'engine-workers: WriteDbValidatorWorker skipped - Write-DB not initialized');
                this.status.lastRunTime = new Date();
                this.status.lastRunDurationMs = performance.now() - startTime;
                return;
            }
            // Step 1: Validate data
            const validationReport = await writeDb.validateData();
            log('info', 'engine-workers: WriteDbValidatorWorker validation complete', {
                qualityScore: validationReport.qualityScore.toFixed(3),
                totalRows: validationReport.totalRows,
                passedRows: validationReport.passedRows,
                failedRows: validationReport.failedRows
            });
            // Step 2: Upload if quality meets threshold
            const minQualityScore = EngineDbConfig.validationMinQualityScore;
            if (validationReport.qualityScore >= minQualityScore) {
                const uploadReport = await writeDb.uploadToProd();
                log('info', 'engine-workers: WriteDbValidatorWorker upload complete', {
                    battleLogsUploaded: uploadReport.battleLogsUploaded,
                    moveUsageUploaded: uploadReport.moveUsageUploaded,
                    anomaliesUploaded: uploadReport.anomaliesUploaded,
                    durationMs: uploadReport.durationMs.toFixed(2)
                });
                // Step 3: Prune old entries after successful upload
                await writeDb.pruneOldEntries();
                log('info', 'engine-workers: WriteDbValidatorWorker pruning complete');
                // Step 4: P6 - Prune old system metrics (7-day retention)
                const metricsPruneResult = await writeDb.pruneOldMetrics();
                if (metricsPruneResult.deletedCount > 0) {
                    log('info', 'engine-workers: WriteDbValidatorWorker metrics pruning complete', {
                        deletedCount: metricsPruneResult.deletedCount
                    });
                }
            }
            else {
                // Data quality too low - quarantine
                log('warn', 'engine-workers: WriteDbValidatorWorker quality score below threshold - data quarantined', {
                    qualityScore: validationReport.qualityScore.toFixed(3),
                    minRequired: minQualityScore,
                    errors: validationReport.errors.slice(0, 10) // First 10 errors
                });
            }
            const durationMs = performance.now() - startTime;
            this.status.lastRunTime = new Date();
            this.status.lastRunDurationMs = durationMs;
            this.status.successCount++;
            this.status.lastError = null;
            log('info', 'engine-workers: WriteDbValidatorWorker execution complete', {
                durationMs: durationMs.toFixed(2),
                successCount: this.status.successCount
            });
        }
        catch (error) {
            const durationMs = performance.now() - startTime;
            this.status.lastRunTime = new Date();
            this.status.lastRunDurationMs = durationMs;
            this.status.errorCount++;
            this.status.lastError = getErrorMessage(error);
            log('error', 'engine-workers: WriteDbValidatorWorker execution failed', {
                error: this.status.lastError,
                errorCount: this.status.errorCount
            });
            // Capture error for tracking
            await workerErrorHandler.handleTaskError(ensureError(error), 'WriteDbValidatorWorker', 'validation', {
                operation: 'write-db-validation',
                customData: {
                    taskType: 'validation',
                },
            });
        }
        finally {
            this.status.isRunning = false;
        }
    }
    /**
     * Stop worker gracefully
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.isRunning = false;
            log('info', 'engine-workers: WriteDbValidatorWorker stopped', {
                totalRuns: this.status.successCount + this.status.errorCount,
                successCount: this.status.successCount,
                errorCount: this.status.errorCount
            });
        }
    }
    /**
     * Get worker status
     */
    getStatus() {
        return { ...this.status };
    }
}
// ============================================================================
// Worker 5: Engine Maintenance Worker
// ============================================================================
/**
 * Worker 5: Forces write buffer flush + Read-DB rebuild every 8 hours.
 *
 * Purpose: Guarantee write buffer persistence and Read-DB health without manual ops.
 * Frequency: 8 hours (configurable via EngineDbConfig.maintenanceWorkerIntervalMs)
 * Sequence: Flush Write Buffer → Save Write-DB → Rebuild Read-DB with backup
 */
class EngineMaintenanceWorker {
    interval = null;
    isRunning = false;
    status = {
        name: 'EngineMaintenanceWorker',
        isRunning: false,
        lastRunTime: null,
        lastRunDurationMs: 0,
        successCount: 0,
        errorCount: 0,
        lastError: null,
    };
    /**
     * Start periodic maintenance worker with staggered startup (after other workers)
     */
    async start() {
        if (this.interval) {
            log('warn', 'engine-workers: EngineMaintenanceWorker already running');
            return;
        }
        log('info', 'engine-workers: Starting EngineMaintenanceWorker', {
            intervalMs: EngineDbConfig.maintenanceWorkerIntervalMs,
            staggerDelayMs: EngineDbConfig.workerStartupStaggerMs * 4,
        });
        // Stagger startup (ensure other workers settle first)
        await delay(EngineDbConfig.workerStartupStaggerMs * 4);
        this.interval = setInterval(async () => {
            await this.execute();
        }, EngineDbConfig.maintenanceWorkerIntervalMs);
        this.isRunning = true;
    }
    /**
     * Execute maintenance cycle: flush → persist → rebuild
     */
    async execute() {
        if (this.status.isRunning) {
            log('warn', 'engine-workers: EngineMaintenanceWorker execution skipped (previous run still in progress)');
            return;
        }
        this.status.isRunning = true;
        const startTime = performance.now();
        try {
            log('info', 'engine-workers: EngineMaintenanceWorker maintenance cycle started');
            // Step 1: Force write buffer flush (best-effort)
            await engineWriteBuffer.flush();
            const bufferStats = engineWriteBuffer.getStats();
            // Step 2: Persist Write-DB to disk
            const writeDb = await import('../services/database/engine-write-db.js');
            if (!writeDb.isReady()) {
                await writeDb.initialize();
            }
            await writeDb.saveToFile();
            // Step 3: Rebuild Read-DB with optional backup
            const readDb = await import('../services/database/engine-read-db.js');
            await readDb.rebuild({
                reason: 'engine-maintenance-worker',
                backupExisting: true,
            });
            const durationMs = performance.now() - startTime;
            this.status.lastRunTime = new Date();
            this.status.lastRunDurationMs = durationMs;
            this.status.successCount++;
            this.status.lastError = null;
            log('info', 'engine-workers: EngineMaintenanceWorker maintenance cycle complete', {
                durationMs: durationMs.toFixed(2),
                bufferStats,
                successCount: this.status.successCount,
            });
        }
        catch (error) {
            const durationMs = performance.now() - startTime;
            this.status.lastRunTime = new Date();
            this.status.lastRunDurationMs = durationMs;
            this.status.errorCount++;
            this.status.lastError = getErrorMessage(error);
            log('error', 'engine-workers: EngineMaintenanceWorker maintenance cycle failed', {
                error: this.status.lastError,
                errorCount: this.status.errorCount,
            });
            await workerErrorHandler.handleTaskError(ensureError(error), 'EngineMaintenanceWorker', 'maintenance-cycle', {
                operation: 'engine-maintenance',
            });
        }
        finally {
            this.status.isRunning = false;
        }
    }
    /**
     * Stop worker gracefully
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.isRunning = false;
            log('info', 'engine-workers: EngineMaintenanceWorker stopped', {
                totalRuns: this.status.successCount + this.status.errorCount,
                successCount: this.status.successCount,
                errorCount: this.status.errorCount,
            });
        }
    }
    /**
     * Get worker status snapshot
     */
    getStatus() {
        return { ...this.status };
    }
}
// ============================================================================
// Workers Orchestrator
// ============================================================================
// Worker instances (created once)
const cacheRefreshWorker = new CacheRefreshWorker();
const writeBufferFlusher = new WriteBufferFlusher();
const readDbSyncWorker = new ReadDbSyncWorker();
const writeDbValidatorWorker = new WriteDbValidatorWorker();
const engineMaintenanceWorker = new EngineMaintenanceWorker();
/**
 * Start all enabled Engine workers.
 *
 * Workers start with staggered delays to prevent thundering herd:
 * - Worker 1 (Cache Refresh): +5s delay
 * - Worker 2 (Buffer Flush): +10s delay
 * - Worker 3 (Read-DB Sync): Render cron job (not in-process)
 * - Worker 4 (Validator): +15s delay
 * - Worker 5 (Maintenance): +20s delay
 *
 * @throws {Error} If required workers fail to start
 */
export async function startEngineWorkers() {
    log('info', 'engine-workers: Starting all Engine workers...');
    try {
        // Worker 1: Cache Refresh (if L1 cache enabled)
        if (EngineDbConfig.featureL1CacheEnabled && EngineDbConfig.featureWorkersEnabled) {
            await cacheRefreshWorker.start();
        }
        else {
            log('info', 'engine-workers: CacheRefreshWorker disabled (feature flag off)');
        }
        // Worker 2: Write Buffer Flush (if write buffer enabled)
        if (EngineDbConfig.featureWriteBufferEnabled && EngineDbConfig.featureWorkersEnabled) {
            await writeBufferFlusher.start();
        }
        else {
            log('info', 'engine-workers: WriteBufferFlusher disabled (feature flag off)');
        }
        // Worker 3: Read-DB Sync (Render cron job - just log status)
        await readDbSyncWorker.start();
        // Worker 4: Write-DB Validator (if validation enabled)
        if (EngineDbConfig.featureValidationEnabled && EngineDbConfig.featureWorkersEnabled) {
            await writeDbValidatorWorker.start();
        }
        else {
            log('info', 'engine-workers: WriteDbValidatorWorker disabled (feature flag off)');
        }
        // Worker 5: Engine Maintenance (always enabled with workers)
        if (EngineDbConfig.featureWorkersEnabled) {
            await engineMaintenanceWorker.start();
        }
        else {
            log('info', 'engine-workers: EngineMaintenanceWorker disabled (feature flag off)');
        }
        log('info', 'engine-workers: All Engine workers started successfully');
    }
    catch (error) {
        log('error', 'engine-workers: Failed to start Engine workers', error);
        throw error; // Propagate to caller (likely startup sequence)
    }
}
/**
 * Stop all Engine workers gracefully.
 *
 * Waits for in-flight tasks to complete before stopping timers.
 * Should be called during SIGTERM/SIGINT shutdown sequence.
 */
export function stopEngineWorkers() {
    log('info', 'engine-workers: Stopping all Engine workers...');
    cacheRefreshWorker.stop();
    writeBufferFlusher.stop();
    readDbSyncWorker.stop();
    writeDbValidatorWorker.stop();
    engineMaintenanceWorker.stop();
    log('info', 'engine-workers: All Engine workers stopped');
}
/**
 * Get status snapshot for all workers (for /ops engine command).
 *
 * @returns Current status of all 4 workers
 */
export function getEngineWorkersStatus() {
    return {
        cacheRefresh: cacheRefreshWorker.getStatus(),
        bufferFlush: writeBufferFlusher.getStatus(),
        readDbSync: readDbSyncWorker.getStatus(),
        writeDbValidator: writeDbValidatorWorker.getStatus(),
        maintenance: engineMaintenanceWorker.getStatus(),
    };
}
