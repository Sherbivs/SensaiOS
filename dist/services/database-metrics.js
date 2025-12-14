/**
 * Database Performance Metrics for Prometheus
 *
 * P0-007: Provides database-specific metrics including:
 * - Connection pool utilization and health
 * - Query latency histograms
 * - Cache hit/miss rates
 * - Database size tracking
 * - Active connections gauge
 *
 * Integration Points:
 * - Prisma client query events (slow query detection)
 * - Connection pool configuration (database-pool-config.ts)
 * - Engine cache metrics (engine-cache.ts)
 * - Health server integration (health-server.ts)
 *
 * @module services/database-metrics
 */
import { Counter, Gauge, Histogram, register } from 'prom-client';
import { getPoolConfig, getPoolMetrics, isPoolHealthy, getCurrentServiceName } from '../config/database-pool-config.js';
import { log } from '../utils/logger.js';
// ============================================================================
// Metric Definitions
// ============================================================================
const PREFIX = 'infinity_gauntlet_db_';
/**
 * Database Query Metrics
 */
const queryDurationHistogram = new Histogram({
    name: `${PREFIX}query_duration_seconds`,
    help: 'Database query duration in seconds',
    labelNames: ['operation', 'model', 'result'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
});
const slowQueryCounter = new Counter({
    name: `${PREFIX}slow_queries_total`,
    help: 'Total number of slow queries (>100ms)',
    labelNames: ['model', 'operation'],
    registers: [register],
});
const queryErrorCounter = new Counter({
    name: `${PREFIX}query_errors_total`,
    help: 'Total number of query errors',
    labelNames: ['error_type', 'model'],
    registers: [register],
});
/**
 * Connection Pool Metrics
 */
const poolConnectionsGauge = new Gauge({
    name: `${PREFIX}pool_connections`,
    help: 'Number of connections in the pool',
    labelNames: ['state', 'service'],
    registers: [register],
});
const poolUtilizationGauge = new Gauge({
    name: `${PREFIX}pool_utilization_percent`,
    help: 'Pool utilization percentage',
    labelNames: ['service'],
    registers: [register],
});
const poolHealthGauge = new Gauge({
    name: `${PREFIX}pool_healthy`,
    help: 'Pool health status (1=healthy, 0=unhealthy)',
    labelNames: ['service'],
    registers: [register],
});
const poolConfigGauge = new Gauge({
    name: `${PREFIX}pool_config`,
    help: 'Pool configuration values',
    labelNames: ['service', 'config_key'],
    registers: [register],
});
/**
 * Cache Metrics
 */
const cacheHitsCounter = new Counter({
    name: `${PREFIX}cache_hits_total`,
    help: 'Total cache hits',
    labelNames: ['cache_name'],
    registers: [register],
});
const cacheMissesCounter = new Counter({
    name: `${PREFIX}cache_misses_total`,
    help: 'Total cache misses',
    labelNames: ['cache_name'],
    registers: [register],
});
const cacheHitRateGauge = new Gauge({
    name: `${PREFIX}cache_hit_rate`,
    help: 'Cache hit rate percentage',
    labelNames: ['cache_name'],
    registers: [register],
});
const cacheSizeGauge = new Gauge({
    name: `${PREFIX}cache_size_bytes`,
    help: 'Cache size in bytes',
    labelNames: ['cache_name'],
    registers: [register],
});
const cacheEntriesGauge = new Gauge({
    name: `${PREFIX}cache_entries`,
    help: 'Number of entries in cache',
    labelNames: ['cache_name'],
    registers: [register],
});
/**
 * Database Size Metrics
 */
const databaseSizeGauge = new Gauge({
    name: `${PREFIX}size_bytes`,
    help: 'Database size in bytes',
    labelNames: ['database'],
    registers: [register],
});
const tableRowsGauge = new Gauge({
    name: `${PREFIX}table_rows`,
    help: 'Estimated row count per table',
    labelNames: ['table'],
    registers: [register],
});
/**
 * Heartbeat Metrics
 */
const heartbeatLatencyHistogram = new Histogram({
    name: `${PREFIX}heartbeat_latency_seconds`,
    help: 'Database heartbeat latency in seconds',
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [register],
});
const heartbeatFailuresCounter = new Counter({
    name: `${PREFIX}heartbeat_failures_total`,
    help: 'Total number of heartbeat failures',
    registers: [register],
});
// ============================================================================
// Metric Recording Functions
// ============================================================================
/**
 * Record a database query execution
 */
export function recordQueryExecution(operation, model, durationMs, success) {
    const durationSeconds = durationMs / 1000;
    const result = success ? 'success' : 'error';
    queryDurationHistogram.observe({ operation, model, result }, durationSeconds);
    // Track slow queries (>100ms)
    if (durationMs > 100) {
        slowQueryCounter.inc({ model, operation });
    }
}
/**
 * Record a query error
 */
export function recordQueryError(errorType, model) {
    queryErrorCounter.inc({ error_type: errorType, model: model || 'unknown' });
}
/**
 * Update connection pool metrics
 */
export function updatePoolMetricsSnapshot() {
    const serviceName = getCurrentServiceName();
    const poolConfig = getPoolConfig();
    const poolMetrics = getPoolMetrics();
    const healthCheck = isPoolHealthy();
    // Record pool configuration
    poolConfigGauge.set({ service: serviceName, config_key: 'max' }, poolConfig.max);
    poolConfigGauge.set({ service: serviceName, config_key: 'min' }, poolConfig.min);
    poolConfigGauge.set({ service: serviceName, config_key: 'idle_timeout_ms' }, poolConfig.idleTimeoutMs);
    poolConfigGauge.set({ service: serviceName, config_key: 'connection_timeout_ms' }, poolConfig.connectionTimeoutMs);
    // Record pool health
    poolHealthGauge.set({ service: serviceName }, healthCheck.healthy ? 1 : 0);
    // Record pool utilization if metrics available
    if (poolMetrics) {
        poolConnectionsGauge.set({ state: 'acquired', service: serviceName }, poolMetrics.acquiredConnections);
        poolConnectionsGauge.set({ state: 'idle', service: serviceName }, poolMetrics.idleConnections);
        poolConnectionsGauge.set({ state: 'waiting', service: serviceName }, poolMetrics.waitingRequests);
        poolConnectionsGauge.set({ state: 'total', service: serviceName }, poolMetrics.totalConnections);
        // Calculate utilization percentage
        const utilization = poolMetrics.totalConnections > 0
            ? (poolMetrics.acquiredConnections / poolMetrics.totalConnections) * 100
            : 0;
        poolUtilizationGauge.set({ service: serviceName }, utilization);
    }
}
/**
 * Record cache hit
 */
export function recordCacheHit(cacheName) {
    cacheHitsCounter.inc({ cache_name: cacheName });
}
/**
 * Record cache miss
 */
export function recordCacheMiss(cacheName) {
    cacheMissesCounter.inc({ cache_name: cacheName });
}
/**
 * Update cache metrics snapshot
 */
export function updateCacheMetrics(cacheName, stats) {
    const total = stats.hitCount + stats.missCount;
    const hitRate = total > 0 ? (stats.hitCount / total) * 100 : 0;
    cacheHitRateGauge.set({ cache_name: cacheName }, hitRate);
    cacheSizeGauge.set({ cache_name: cacheName }, stats.sizeBytes);
    cacheEntriesGauge.set({ cache_name: cacheName }, stats.entryCount);
}
/**
 * Update database size metrics
 */
export function updateDatabaseSize(databaseName, sizeBytes) {
    databaseSizeGauge.set({ database: databaseName }, sizeBytes);
}
/**
 * Update table row counts
 */
export function updateTableRows(tableName, rowCount) {
    tableRowsGauge.set({ table: tableName }, rowCount);
}
/**
 * Record heartbeat result
 */
export function recordHeartbeat(latencyMs, success) {
    const latencySeconds = latencyMs / 1000;
    heartbeatLatencyHistogram.observe(latencySeconds);
    if (!success) {
        heartbeatFailuresCounter.inc();
    }
}
// ============================================================================
// Metric Collection Interval
// ============================================================================
let collectionInterval = null;
const COLLECTION_INTERVAL_MS = 15_000; // 15 seconds
/**
 * Start periodic metrics collection
 */
export function startMetricsCollection() {
    if (collectionInterval) {
        log.warn('Database metrics collection already started');
        return;
    }
    // Initial collection
    collectMetricsSnapshot();
    // Periodic collection
    collectionInterval = setInterval(() => {
        collectMetricsSnapshot();
    }, COLLECTION_INTERVAL_MS);
    // Don't prevent process exit
    collectionInterval.unref();
    log.info('Database metrics collection started', {
        intervalMs: COLLECTION_INTERVAL_MS,
        service: getCurrentServiceName(),
    });
}
/**
 * Stop periodic metrics collection
 */
export function stopMetricsCollection() {
    if (collectionInterval) {
        clearInterval(collectionInterval);
        collectionInterval = null;
        log.info('Database metrics collection stopped');
    }
}
/**
 * Collect a snapshot of all database metrics
 */
async function collectMetricsSnapshot() {
    try {
        // Update pool metrics
        updatePoolMetricsSnapshot();
        // Try to update cache metrics from engine cache
        try {
            const { engineCache } = await import('./cache/engine-cache.js');
            if (engineCache) {
                const stats = engineCache.getStats();
                updateCacheMetrics('engine-l1', {
                    hitCount: stats.hitCount,
                    missCount: stats.missCount,
                    sizeBytes: stats.memorySizeMb * 1024 * 1024,
                    entryCount: stats.pokemonCount + stats.moveCount,
                });
            }
        }
        catch {
            // Engine cache not available
        }
        // Try to get database size (requires prisma connection)
        try {
            const { prisma } = await import('../shared/prisma.js');
            if (prisma) {
                const sizeResult = await prisma.$queryRaw `
          SELECT pg_database_size(current_database()) as size
        `;
                if (sizeResult[0]) {
                    updateDatabaseSize('infinity_gauntlet', Number(sizeResult[0].size));
                }
                // Get table row estimates
                const tableStats = await prisma.$queryRaw `
          SELECT relname as tablename, n_live_tup 
          FROM pg_stat_user_tables 
          WHERE schemaname = 'public'
          ORDER BY n_live_tup DESC
          LIMIT 20
        `;
                for (const row of tableStats) {
                    updateTableRows(row.tablename, Number(row.n_live_tup));
                }
            }
        }
        catch {
            // Database not available for size query
        }
    }
    catch (error) {
        log.warn('Error collecting database metrics snapshot', { error: String(error) });
    }
}
// ============================================================================
// Exports
// ============================================================================
export default {
    recordQueryExecution,
    recordQueryError,
    updatePoolMetricsSnapshot,
    recordCacheHit,
    recordCacheMiss,
    updateCacheMetrics,
    updateDatabaseSize,
    updateTableRows,
    recordHeartbeat,
    startMetricsCollection,
    stopMetricsCollection,
};
