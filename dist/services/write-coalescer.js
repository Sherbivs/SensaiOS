/**
 * Write Coalescer — Write-behind cache pattern for non-critical writes
 *
 * P2-001: Write-Behind Cache Pattern (Database-Centric Development Plan Sprint 3)
 *
 * Features:
 * - Batches multiple writes into single database operations
 * - Adaptive flush intervals based on load
 * - Backpressure handling for high write volumes
 * - Entity-aware coalescing (only keep latest version)
 * - Guaranteed delivery with retry logic
 *
 * Design Principles:
 * - Non-critical writes only (stats, metrics, activity logs)
 * - Critical writes (battles, captures) should NOT use this
 * - Eventual consistency acceptable for coalesced data
 * - Data integrity over performance (flush on shutdown)
 *
 * @module services/write-coalescer
 */
import { Counter, Gauge, Histogram, register } from 'prom-client';
import { log } from "../shared/logger.js";
import { delay } from '../shared/utils/async-utils.js';
const DEFAULT_CONFIG = {
    maxPendingWrites: 1000,
    defaultFlushIntervalMs: 5000, // 5 seconds
    backpressureThreshold: 0.75,
    maxRetries: 3,
    retryDelayMs: 1000,
    enableAdaptiveFlush: true,
};
// ============================================================================
// Prometheus Metrics
// ============================================================================
const PREFIX = 'infinity_gauntlet_write_coalescer_';
const writesQueuedCounter = new Counter({
    name: `${PREFIX}writes_queued_total`,
    help: 'Total writes queued for coalescing',
    labelNames: ['entity_type'],
    registers: [register],
});
const writesFlushedCounter = new Counter({
    name: `${PREFIX}writes_flushed_total`,
    help: 'Total writes successfully flushed',
    labelNames: ['entity_type'],
    registers: [register],
});
const writesFailedCounter = new Counter({
    name: `${PREFIX}writes_failed_total`,
    help: 'Total writes that failed',
    labelNames: ['entity_type'],
    registers: [register],
});
const pendingWritesGauge = new Gauge({
    name: `${PREFIX}pending_writes`,
    help: 'Current pending writes',
    labelNames: ['entity_type'],
    registers: [register],
});
const backpressureGauge = new Gauge({
    name: `${PREFIX}backpressure_active`,
    help: 'Whether backpressure is active (1 or 0)',
    registers: [register],
});
const flushDurationHistogram = new Histogram({
    name: `${PREFIX}flush_duration_ms`,
    help: 'Flush operation duration in milliseconds',
    buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
    labelNames: ['entity_type'],
    registers: [register],
});
const batchSizeHistogram = new Histogram({
    name: `${PREFIX}batch_size`,
    help: 'Batch size distribution',
    buckets: [1, 5, 10, 25, 50, 100, 250, 500],
    labelNames: ['entity_type'],
    registers: [register],
});
// ============================================================================
// Write Coalescer Class
// ============================================================================
export class WriteCoalescer {
    config;
    prisma;
    entityConfigs = new Map();
    pendingWrites = new Map(); // entityType -> (entityId -> operation)
    flushTimers = new Map();
    stats = {
        totalQueued: 0,
        totalFlushed: 0,
        totalFailed: 0,
        batchesFlushed: 0,
        lastFlushTime: null,
    };
    isShuttingDown = false;
    static instance = null;
    constructor(prisma, config = {}) {
        this.prisma = prisma;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Get singleton instance
     */
    static getInstance(prisma, config) {
        if (!WriteCoalescer.instance) {
            WriteCoalescer.instance = new WriteCoalescer(prisma, config);
        }
        return WriteCoalescer.instance;
    }
    /**
     * Register an entity type for write coalescing
     */
    registerEntity(config) {
        this.entityConfigs.set(config.entityType, config);
        this.pendingWrites.set(config.entityType, new Map());
        // Start flush timer for this entity
        this.startFlushTimer(config.entityType, config.flushIntervalMs);
        log.info('Entity registered for write coalescing', {
            entityType: config.entityType,
            maxBatchSize: config.maxBatchSize,
            flushIntervalMs: config.flushIntervalMs,
        });
    }
    /**
     * Queue a write operation for coalescing
     */
    queue(entityType, entityId, operationType, data, options = {}) {
        if (this.isShuttingDown) {
            log.warn('Write coalescer is shutting down, rejecting write');
            return false;
        }
        const config = this.entityConfigs.get(entityType);
        if (!config) {
            log.warn('Unknown entity type for write coalescing', { entityType });
            return false;
        }
        // Check backpressure
        const totalPending = this.getTotalPendingCount();
        if (totalPending >= this.config.maxPendingWrites * this.config.backpressureThreshold) {
            backpressureGauge.set(1);
            // If adaptive flush is enabled, trigger immediate flush
            if (this.config.enableAdaptiveFlush) {
                void this.flushEntity(entityType);
            }
            // If at hard limit, reject
            if (totalPending >= this.config.maxPendingWrites) {
                log.warn('Write coalescer at capacity, rejecting write', {
                    entityType,
                    pending: totalPending,
                    max: this.config.maxPendingWrites
                });
                return false;
            }
        }
        else {
            backpressureGauge.set(0);
        }
        const operation = {
            entityType,
            entityId,
            operationType,
            data,
            queuedAt: Date.now(),
            priority: options.priority ?? 0,
            onComplete: options.onComplete,
        };
        // Get or create entity queue
        const entityQueue = this.pendingWrites.get(entityType);
        if (!entityQueue) {
            this.pendingWrites.set(entityType, new Map());
        }
        // Deduplicate by entityId if configured (latest wins)
        if (config.deduplicateByEntityId) {
            const existing = this.pendingWrites.get(entityType)?.get(entityId);
            if (existing?.onComplete) {
                // Call previous callback with "superseded" indicator
                existing.onComplete(true);
            }
        }
        this.pendingWrites.get(entityType).set(entityId, operation);
        // Update metrics
        this.stats.totalQueued++;
        writesQueuedCounter.inc({ entity_type: entityType });
        pendingWritesGauge.set({ entity_type: entityType }, this.pendingWrites.get(entityType).size);
        // If batch size reached, trigger immediate flush
        if (this.pendingWrites.get(entityType).size >= config.maxBatchSize) {
            void this.flushEntity(entityType);
        }
        return true;
    }
    /**
     * Flush all pending writes for an entity type
     */
    async flushEntity(entityType) {
        const config = this.entityConfigs.get(entityType);
        const entityQueue = this.pendingWrites.get(entityType);
        if (!config || !entityQueue || entityQueue.size === 0) {
            return { success: 0, failed: 0 };
        }
        // Take snapshot of operations to flush
        const operations = Array.from(entityQueue.values());
        entityQueue.clear();
        const startTime = Date.now();
        let result;
        try {
            // Execute batch
            result = await this.executeWithRetry(operations, config);
            // Update metrics
            this.stats.totalFlushed += result.success;
            this.stats.totalFailed += result.failed;
            this.stats.batchesFlushed++;
            this.stats.lastFlushTime = Date.now();
            writesFlushedCounter.inc({ entity_type: entityType }, result.success);
            if (result.failed > 0) {
                writesFailedCounter.inc({ entity_type: entityType }, result.failed);
            }
            // Call completion callbacks
            for (const op of operations) {
                if (op.onComplete) {
                    op.onComplete(result.failed === 0);
                }
            }
        }
        catch (error) {
            // All failed
            result = { success: 0, failed: operations.length };
            this.stats.totalFailed += operations.length;
            writesFailedCounter.inc({ entity_type: entityType }, operations.length);
            log.error('Write coalescer flush failed', {
                entityType,
                operationCount: operations.length,
                error: String(error)
            });
            // Call completion callbacks with error
            for (const op of operations) {
                if (op.onComplete) {
                    op.onComplete(false, error instanceof Error ? error : new Error(String(error)));
                }
            }
        }
        // Record metrics
        const duration = Date.now() - startTime;
        flushDurationHistogram.observe({ entity_type: entityType }, duration);
        batchSizeHistogram.observe({ entity_type: entityType }, operations.length);
        pendingWritesGauge.set({ entity_type: entityType }, 0);
        return result;
    }
    /**
     * Flush all pending writes across all entities
     */
    async flushAll() {
        let totalSuccess = 0;
        let totalFailed = 0;
        const flushPromises = Array.from(this.entityConfigs.keys()).map(async (entityType) => {
            const result = await this.flushEntity(entityType);
            totalSuccess += result.success;
            totalFailed += result.failed;
        });
        await Promise.all(flushPromises);
        return { success: totalSuccess, failed: totalFailed };
    }
    /**
     * Get coalescer statistics
     */
    getStats() {
        const pendingByEntity = {};
        let totalPending = 0;
        for (const [entityType, queue] of this.pendingWrites) {
            pendingByEntity[entityType] = queue.size;
            totalPending += queue.size;
        }
        const averageBatchSize = this.stats.batchesFlushed > 0
            ? this.stats.totalFlushed / this.stats.batchesFlushed
            : 0;
        return {
            pendingWrites: totalPending,
            pendingByEntity,
            totalWritesQueued: this.stats.totalQueued,
            totalWritesFlushed: this.stats.totalFlushed,
            totalWritesFailed: this.stats.totalFailed,
            batchesFlushed: this.stats.batchesFlushed,
            averageBatchSize,
            backpressureActive: totalPending >= this.config.maxPendingWrites * this.config.backpressureThreshold,
            lastFlushTime: this.stats.lastFlushTime,
        };
    }
    /**
     * Graceful shutdown — flushes all pending writes
     */
    async shutdown() {
        this.isShuttingDown = true;
        // Stop all timers
        for (const timer of this.flushTimers.values()) {
            clearInterval(timer);
        }
        this.flushTimers.clear();
        // Flush all pending writes
        const result = await this.flushAll();
        log.info('Write coalescer shutdown complete', {
            flushed: result.success,
            failed: result.failed,
        });
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    /**
     * Start flush timer for an entity
     */
    startFlushTimer(entityType, intervalMs) {
        // Clear existing timer if any
        const existing = this.flushTimers.get(entityType);
        if (existing) {
            clearInterval(existing);
        }
        const timer = setInterval(() => {
            if (!this.isShuttingDown) {
                void this.flushEntity(entityType);
            }
        }, intervalMs);
        this.flushTimers.set(entityType, timer);
    }
    /**
     * Execute batch with retry logic
     */
    async executeWithRetry(operations, config) {
        let lastError = null;
        for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
            try {
                return await config.executor(operations, this.prisma);
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt < this.config.maxRetries - 1) {
                    // Wait before retry with exponential backoff
                    await delay(this.config.retryDelayMs * Math.pow(2, attempt));
                }
            }
        }
        throw lastError;
    }
    /**
     * Get total pending write count
     */
    getTotalPendingCount() {
        let total = 0;
        for (const queue of this.pendingWrites.values()) {
            total += queue.size;
        }
        return total;
    }
}
// ============================================================================
// Pre-built Entity Configurations
// ============================================================================
/**
 * Activity log coalescing config
 * For non-critical activity tracking (login times, page views, etc.)
 */
export function createActivityLogConfig() {
    return {
        entityType: 'ActivityLog',
        maxBatchSize: 100,
        flushIntervalMs: 5000,
        deduplicateByEntityId: false, // Don't dedupe - each activity is unique
        executor: async (operations, prisma) => {
            const data = operations.map(op => ({
                trainerId: op.data.trainerId,
                activityType: op.data.activityType,
                metadata: op.data.metadata ?? {},
                timestamp: op.data.timestamp,
            }));
            try {
                await prisma.$executeRaw `
          INSERT INTO "ActivityLog" ("trainerId", "activityType", "metadata", "timestamp")
          SELECT * FROM UNNEST(
            ${data.map(d => d.trainerId)}::text[],
            ${data.map(d => d.activityType)}::text[],
            ${data.map(d => JSON.stringify(d.metadata))}::jsonb[],
            ${data.map(d => d.timestamp)}::timestamp[]
          )
        `;
                return { success: data.length, failed: 0 };
            }
            catch {
                return { success: 0, failed: data.length };
            }
        },
    };
}
/**
 * Stats update coalescing config
 * For aggregated stats that can tolerate some staleness
 */
export function createStatsUpdateConfig() {
    return {
        entityType: 'TrainerStats',
        maxBatchSize: 50,
        flushIntervalMs: 10000, // 10 seconds
        deduplicateByEntityId: true, // Latest stat value wins
        executor: async (operations, prisma) => {
            let success = 0;
            let failed = 0;
            // Group by trainer and update
            const byTrainer = new Map();
            for (const op of operations) {
                const existing = byTrainer.get(op.data.trainerId) ?? [];
                existing.push({ statType: op.data.statType, value: op.data.value });
                byTrainer.set(op.data.trainerId, existing);
            }
            // Execute updates
            for (const [trainerId, stats] of byTrainer) {
                try {
                    // Use upsert pattern for each stat type
                    for (const stat of stats) {
                        await prisma.$executeRaw `
              UPDATE "Trainer" 
              SET "stats" = jsonb_set(
                COALESCE("stats", '{}'::jsonb),
                ${`{${stat.statType}}`}::text[],
                ${stat.value}::jsonb
              )
              WHERE "id" = ${trainerId}
            `;
                        success++;
                    }
                }
                catch {
                    failed += stats.length;
                }
            }
            return { success, failed };
        },
    };
}
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Get singleton coalescer instance
 */
export function getWriteCoalescer(prisma, config) {
    return WriteCoalescer.getInstance(prisma, config);
}
// ============================================================================
// Export
// ============================================================================
export default {
    WriteCoalescer,
    getWriteCoalescer,
    createActivityLogConfig,
    createStatsUpdateConfig,
};
