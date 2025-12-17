/**
 * TimescaleDB Worker — Log Ingestion, Analytics, and Retention Management
 *
 * Purpose:
 * - Consolidate ALL log/error/monitoring data from filesystem (/Store) to database
 * - Ingest Event Bus logs into log_entries hypertable (batched writes)
 * - Migrate existing filesystem logs/errors to database (one-time bulk import)
 * - Refresh materialized views (hourly/daily/weekly analytics)
 * - Manage retention via chunk dropping (30-day default)
 * - Enable SQL-queryable logs for /ops commands
 *
 * Architecture:
 * - Extends BaseDatabaseWorker
 * - Implements QueryableWorker + WritableWorker
 * - Uses HybridWriteBufferStrategy (100 events OR 5 minutes flush)
 * - Shares Prisma client with ProdPostgresWorker (same PROD database)
 *
 * Performance Targets:
 * - Write throughput: 1000+ log writes/sec (batched)
 * - Flush latency: <200ms per batch
 * - View refresh: <5s hourly views, <30s daily views
 * - Chunk drop: <1s per chunk
 *
 * Integration:
 * - Replaces startLogIngestionWorker() in src/index.ts
 * - Consolidates /Store/logs, /Store/error-reports, /Store/emergency-error-logs
 * - Powers /ops logs, /ops errors, /ops monitoring commands
 *
 * @module workers/database/timescaledb-worker
 */
import { BaseDatabaseWorker } from './base-worker.js';
import { HybridWriteBufferStrategy } from './strategies.js';
import { getErrorMessage } from '../../shared/utils/error-utils.js';
/**
 * Materialized view names for refresh operations
 */
export const MATERIALIZED_VIEWS = [
    'logs_hourly',
    'error_rate_hourly',
    'battles_daily',
    'security_events_daily',
    'pokemon_usage_weekly',
];
// ============================================================================
// TimescaleDB Worker Implementation
// ============================================================================
/**
 * TimescaleDB worker for log ingestion and analytics.
 * Handles all log/error/monitoring data storage and retention.
 */
export class TimescaleDBWorker extends BaseDatabaseWorker {
    client;
    writeBuffer;
    flushTimer;
    constructor(config, eventEmitter) {
        super(config, eventEmitter);
        // Initialize write buffer strategy with complete default configuration
        const bufferConfig = config.writeBuffer || {
            enabled: true,
            flushTrigger: 'hybrid',
            flushThresholdEntries: 100,
            flushIntervalMs: 5000, // 5 seconds
            maxBufferSize: 1000,
            backpressureWarnPercent: 75,
            backpressureCriticalPercent: 95,
        };
        this.writeBuffer = new HybridWriteBufferStrategy();
        this.writeBuffer.initialize(bufferConfig, eventEmitter);
    }
    // ============================================================================
    // Worker Identity
    // ============================================================================
    get id() {
        return 'timescaledb';
    }
    get name() {
        return 'TimescaleDB Worker';
    }
    get type() {
        return 'timescaledb'; // Distinct type for log ingestion worker
    }
    // ============================================================================
    // Lifecycle Implementation
    // ============================================================================
    async doInitialize() {
        // Dynamic import to avoid circular dependencies
        const { prisma } = await import('../../shared/prisma.js');
        this.client = prisma;
        // Test TimescaleDB extension availability
        await this.executeOperation('timescaledb-version-check', async () => {
            await this.client.$queryRaw `
        SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'
      `;
        });
        this.log('TimescaleDB extension detected and operational', 'info');
    }
    async doStart() {
        // Start background flush timer
        this.writeBuffer.start();
        // Subscribe to flush events
        this.eventEmitter?.on((event) => {
            if (event.type === 'buffer-flush' && event.workerId === 'write-buffer') {
                void this.handleBufferFlush();
            }
        });
        this.log('TimescaleDB Worker started with log batching enabled', 'info');
    }
    async doStop() {
        // Stop flush timer
        this.writeBuffer.stop();
        // Final flush before shutdown
        if (this.writeBuffer.getStats().entryCount > 0) {
            this.log('Performing final flush before shutdown...', 'info');
            await this.flush();
        }
        // Disconnect Prisma client
        await this.client.$disconnect();
        this.log('TimescaleDB Worker stopped gracefully', 'info');
    }
    async doHealthCheck() {
        // Test TimescaleDB hypertable query
        const result = await this.client.$queryRaw `
      SELECT COUNT(*) as count FROM log_entries LIMIT 1
    `;
        const bufferStats = this.getBufferStats();
        return {
            hypertableAccessible: true,
            logEntriesCount: Number(result[0]?.count ?? 0),
            bufferUtilization: bufferStats.utilizationPercent,
            backpressureActive: bufferStats.isBackpressureActive,
            entryCount: bufferStats.entryCount,
        };
    }
    /**
     * Handle background buffer flush event
     */
    async handleBufferFlush() {
        try {
            await this.flush();
        }
        catch (error) {
            this.log(`Background flush failed: ${getErrorMessage(error)}`, 'error');
        }
    }
    // ============================================================================
    // Query Operations (QueryableWorker Interface)
    // ============================================================================
    async query(sql, params = []) {
        return this.executeOperation('query', async () => {
            // Execute query via Prisma $queryRawUnsafe
            const result = await this.client.$queryRawUnsafe(sql, ...(params || []));
            return result;
        });
    }
    async queryOne(sql, params = []) {
        const results = await this.query(sql, params);
        return results[0] ?? null;
    }
    getCacheStats() {
        // TimescaleDB worker doesn't cache queries
        return null;
    }
    async clearCache() {
        // No-op: TimescaleDB worker doesn't cache queries
    }
    // ============================================================================
    // Write Operations (WritableWorker Interface)
    // ============================================================================
    async insert(table, data) {
        return this.executeOperation('insert', async () => {
            this.writeBuffer.add({
                operation: 'insert',
                table,
                data,
                timestamp: new Date(),
            });
            // Check if flush needed
            if (this.writeBuffer.shouldFlush()) {
                await this.flush();
            }
        });
    }
    async update(table, data, where) {
        return this.executeOperation('update', async () => {
            this.writeBuffer.add({
                operation: 'update',
                table,
                data,
                where,
                timestamp: new Date(),
            });
            if (this.writeBuffer.shouldFlush()) {
                await this.flush();
            }
        });
    }
    async delete(table, where) {
        return this.executeOperation('delete', async () => {
            this.writeBuffer.add({
                operation: 'delete',
                table,
                data: {},
                where,
                timestamp: new Date(),
            });
            if (this.writeBuffer.shouldFlush()) {
                await this.flush();
            }
        });
    }
    async flush() {
        return this.executeOperation('flush', async () => {
            const entries = this.writeBuffer.getAll();
            if (entries.length === 0) {
                return 0;
            }
            // Execute all writes in a transaction
            await this.client.$transaction(async (tx) => {
                for (const write of entries) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const tableAccessor = tx[write.table];
                    if (!tableAccessor) {
                        throw new Error(`Table ${write.table} not found in Prisma schema`);
                    }
                    if (write.operation === 'insert') {
                        await tableAccessor.create({ data: write.data });
                    }
                    else if (write.operation === 'update') {
                        await tableAccessor.updateMany({
                            where: write.where,
                            data: write.data,
                        });
                    }
                    else if (write.operation === 'delete') {
                        await tableAccessor.deleteMany({ where: write.where });
                    }
                }
            });
            // Clear buffer after successful flush
            this.writeBuffer.clear();
            return entries.length;
        });
    }
    getBufferStats() {
        return this.writeBuffer.getStats();
    }
    // ============================================================================
    // TimescaleDB-Specific Operations
    // ============================================================================
    /**
     * Ingest log events (bulk insert to log_entries hypertable)
     *
     * This is the primary method for Event Bus → database log pipeline.
     * Batches events for performance (100 events per flush).
     */
    async ingestLogs(events) {
        // Skip if worker not initialized (during early startup, logs go to console fallback)
        if (!this.isInitialized || !this.client) {
            return;
        }
        return this.executeOperation('ingest-logs', async () => {
            if (events.length === 0) {
                return;
            }
            // Convert events to LogEntry schema format
            const logEntries = events.map((event) => ({
                timestamp: typeof event.timestamp === 'string' ? new Date(event.timestamp) : event.timestamp,
                level: event.level,
                category: event.category,
                message: event.message || undefined,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                metadata: event.metadata || undefined,
                correlationId: event.correlationId || undefined,
                serviceName: event.serviceName || undefined,
                userId: event.userId || undefined,
                traceContext: event.traceContext || undefined,
            }));
            // Bulk insert to log_entries hypertable
            await this.client.logEntry.createMany({
                data: logEntries,
                skipDuplicates: true,
            });
            this.log(`Ingested ${events.length} log events to log_entries hypertable`, 'info');
        });
    }
    /**
     * Migrate error reports from /Store/error-reports to ErrorLog table
     *
     * Consolidates filesystem error dumps into queryable database records.
     * Uses fingerprint deduplication to merge duplicate errors.
     */
    async migrateErrorReports(reports) {
        return this.executeOperation('migrate-error-reports', async () => {
            if (reports.length === 0) {
                return;
            }
            // Upsert error reports (merge duplicates by fingerprint)
            for (const report of reports) {
                await this.client.errorLog.upsert({
                    where: { fingerprint: report.fingerprint },
                    create: {
                        fingerprint: report.fingerprint,
                        category: report.category,
                        severity: report.severity,
                        errorName: report.errorName,
                        errorMessage: report.errorMessage,
                        stackTrace: report.stackTrace || null,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        contextData: report.contextData || undefined,
                        occurrenceCount: report.occurrenceCount || 1,
                        firstSeen: report.firstSeen
                            ? typeof report.firstSeen === 'string'
                                ? new Date(report.firstSeen)
                                : report.firstSeen
                            : new Date(),
                        lastSeen: report.lastSeen
                            ? typeof report.lastSeen === 'string'
                                ? new Date(report.lastSeen)
                                : report.lastSeen
                            : new Date(),
                    },
                    update: {
                        occurrenceCount: { increment: report.occurrenceCount || 1 },
                        lastSeen: report.lastSeen
                            ? typeof report.lastSeen === 'string'
                                ? new Date(report.lastSeen)
                                : report.lastSeen
                            : new Date(),
                        errorMessage: report.errorMessage, // Update to latest message
                        stackTrace: report.stackTrace || undefined,
                    },
                });
            }
            this.log(`Migrated ${reports.length} error reports to ErrorLog table`, 'info');
        });
    }
    /**
     * Refresh materialized view (CONCURRENTLY for zero downtime)
     *
     * Refreshes analytics views (hourly/daily/weekly aggregations).
     * Used by scheduled tasks and /ops refresh-analytics command.
     */
    async refreshView(viewName) {
        return this.executeOperation('refresh-view', async () => {
            // REFRESH MATERIALIZED VIEW CONCURRENTLY (non-blocking)
            await this.client.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
            this.log(`Refreshed materialized view: ${viewName}`, 'info');
        });
    }
    /**
     * Drop old hypertable chunks (retention policy)
     *
     * Removes chunks older than specified days (default 30).
     * Automatic retention management via scheduled task.
     */
    async dropOldChunks(olderThanDays = 30) {
        return this.executeOperation('drop-old-chunks', async () => {
            // Calculate retention interval
            const retentionInterval = `${olderThanDays} days`;
            // Drop chunks older than retention period
            const result = await this.client.$queryRaw `
        SELECT drop_chunks('log_entries', INTERVAL ${retentionInterval})
      `;
            const chunksDropped = Number(result[0]?.drop_chunks ?? 0);
            this.log(`Dropped ${chunksDropped} chunks older than ${olderThanDays} days`, 'info');
            return chunksDropped;
        });
    }
}
// ============================================================================
// Factory Function
// ============================================================================
/**
 * Factory function to create TimescaleDB worker with default configuration
 */
export function createTimescaleDBWorker(eventEmitter) {
    const config = {
        id: 'timescaledb',
        name: 'TimescaleDB Worker',
        enabled: true,
        // Write buffer: 100 events OR 5 minutes (whichever first)
        writeBuffer: {
            enabled: true,
            flushTrigger: 'hybrid',
            flushIntervalMs: 300000, // 5 minutes
            flushThresholdEntries: 100,
            maxBufferSize: 10000,
            backpressureWarnPercent: 75,
            backpressureCriticalPercent: 95,
        },
        // Error recovery: Circuit breaker with exponential backoff
        errorRecovery: {
            policy: 'circuit-breaker',
            maxRetries: 3,
            initialRetryDelayMs: 1000,
            maxRetryDelayMs: 30000,
            backoffMultiplier: 2,
            circuitBreakerThreshold: 5,
            circuitBreakerResetMs: 30000,
        },
        // Health monitoring
        healthCheckIntervalMs: 15000,
        metricsIntervalMs: 5000,
    };
    return new TimescaleDBWorker(config, eventEmitter);
}
