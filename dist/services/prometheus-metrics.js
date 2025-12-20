/**
 * Prometheus Metrics Service
 * @module services/prometheus-metrics
 *
 * Exports time-windowed metrics in Prometheus format for production monitoring.
 *
 * Metrics Categories:
 * 1. Security Bot Metrics (original) - role assignments, cache, permission violations
 * 2. Resource Monitor Metrics (P5) - memory, disk, CPU, uptime gauges
 * 3. System Event Metrics (P5) - heap pruning, disk alerts, auto-remediation counters
 *
 * @see docs/projects/metrics-expansion-bible.md § Project 5
 */
import { register, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import { calculateWindowStats, TIME_WINDOWS, } from './statistics-window.js';
import { EventBus } from '../shared/event-bus.js';
import { log } from '../shared/log.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';
// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Metrics registry (singleton).
 */
let metricsRegistry = null;
let metricsInitialized = false;
/**
 * EventBus subscription IDs (for cleanup).
 */
let metricsSnapshotSubId = null;
let diskAlertSubId = null;
let heapPruneSubId = null;
let autoRemediationSubId = null;
/**
 * Metric instances (counters, gauges, histograms).
 */
let metrics = {
    roleAssignmentsTotal: null,
    cacheInvalidationsTotal: null,
    permissionViolationsTotal: null,
    distributedLockAcquisitions: null,
    activeSweeps: null,
    cacheHitRate: null,
    revertFailureRate: null,
    sweepCandidates: null,
    roleAssignmentDuration: null,
    sweepsLast24Hours: null,
    alertsLast24Hours: null,
    permissionChangesLast24Hours: null,
    errorsLast24Hours: null,
    sweepRatePerHour: null,
    alertRatePerHour: null,
    // P5: Resource Monitor gauges
    memoryRss: null,
    memoryHeapUsed: null,
    memoryHeapTotal: null,
    memoryExternal: null,
    diskTotal: null,
    diskUsed: null,
    diskFree: null,
    diskUsedPercent: null,
    cpuUser: null,
    cpuSystem: null,
    uptimeSeconds: null,
    // P5: System Event counters
    heapSnapshotsPruned: null,
    diskAlerts: null,
    autoRemediation: null,
};
// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Initialize Prometheus metrics registry.
 */
export function initializeMetrics(options = {}) {
    if (metricsInitialized && metricsRegistry) {
        return { registry: metricsRegistry, metrics };
    }
    const { prefix = 'security_bot_', includeDefaultMetrics = true } = options;
    // Clear existing registry
    register.clear();
    metricsRegistry = register;
    // Include default Node.js metrics (process CPU, memory, event loop, etc.)
    if (includeDefaultMetrics) {
        collectDefaultMetrics({ register: metricsRegistry, prefix });
    }
    // === COUNTERS (monotonically increasing) ===
    metrics.roleAssignmentsTotal = new Counter({
        name: `${prefix}role_assignments_total`,
        help: 'Total number of role assignments attempted',
        labelNames: ['origin', 'guild_id', 'guild_name', 'result'],
        registers: [metricsRegistry],
    });
    metrics.cacheInvalidationsTotal = new Counter({
        name: `${prefix}cache_invalidations_total`,
        help: 'Total number of cache invalidations',
        labelNames: ['reason', 'guild_id', 'guild_name'],
        registers: [metricsRegistry],
    });
    metrics.permissionViolationsTotal = new Counter({
        name: `${prefix}permission_violations_total`,
        help: 'Total number of permission enforcement violations',
        labelNames: ['type', 'guild_id', 'guild_name'],
        registers: [metricsRegistry],
    });
    metrics.distributedLockAcquisitions = new Counter({
        name: `${prefix}distributed_lock_acquisitions_total`,
        help: 'Total number of distributed lock acquisition attempts',
        labelNames: ['result', 'resource_type'],
        registers: [metricsRegistry],
    });
    // === GAUGES (current values) ===
    metrics.activeSweeps = new Gauge({
        name: `${prefix}active_sweeps`,
        help: 'Number of currently active role sweeps',
        labelNames: ['guild_id', 'guild_name'],
        registers: [metricsRegistry],
    });
    metrics.cacheHitRate = new Gauge({
        name: `${prefix}cache_hit_rate`,
        help: 'Cache hit rate (percentage, 0-100)',
        labelNames: ['cache_type'],
        registers: [metricsRegistry],
    });
    metrics.revertFailureRate = new Gauge({
        name: `${prefix}revert_failure_rate`,
        help: 'Permission revert failure rate (percentage, 0-100)',
        labelNames: ['guild_id', 'guild_name'],
        registers: [metricsRegistry],
    });
    // === HISTOGRAMS (distributions) ===
    metrics.sweepCandidates = new Histogram({
        name: `${prefix}sweep_candidates`,
        help: 'Number of candidates per sweep operation',
        labelNames: ['guild_id', 'guild_name'],
        buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
        registers: [metricsRegistry],
    });
    metrics.roleAssignmentDuration = new Histogram({
        name: `${prefix}role_assignment_duration_seconds`,
        help: 'Duration of role assignment operations in seconds',
        labelNames: ['origin', 'result'],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
        registers: [metricsRegistry],
    });
    // === TIME-WINDOWED GAUGES (from statistics-window.js) ===
    metrics.sweepsLast24Hours = new Gauge({
        name: `${prefix}sweeps_last_24_hours`,
        help: 'Number of sweeps in the last 24 hours',
        registers: [metricsRegistry],
    });
    metrics.alertsLast24Hours = new Gauge({
        name: `${prefix}alerts_last_24_hours`,
        help: 'Number of alerts in the last 24 hours',
        registers: [metricsRegistry],
    });
    metrics.permissionChangesLast24Hours = new Gauge({
        name: `${prefix}permission_changes_last_24_hours`,
        help: 'Number of permission changes detected in the last 24 hours',
        registers: [metricsRegistry],
    });
    metrics.errorsLast24Hours = new Gauge({
        name: `${prefix}errors_last_24_hours`,
        help: 'Number of errors in the last 24 hours',
        registers: [metricsRegistry],
    });
    metrics.sweepRatePerHour = new Gauge({
        name: `${prefix}sweep_rate_per_hour`,
        help: 'Average number of sweeps per hour (last 24 hours)',
        registers: [metricsRegistry],
    });
    metrics.alertRatePerHour = new Gauge({
        name: `${prefix}alert_rate_per_hour`,
        help: 'Average number of alerts per hour (last 24 hours)',
        registers: [metricsRegistry],
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // P5: RESOURCE MONITOR GAUGES (from metrics.snapshot EventBus events)
    // ═══════════════════════════════════════════════════════════════════════════
    // @see docs/projects/metrics-expansion-bible.md § Project 5
    const resourcePrefix = 'ig_'; // Different prefix for resource metrics
    metrics.memoryRss = new Gauge({
        name: `${resourcePrefix}memory_rss_bytes`,
        help: 'Resident Set Size (total process memory) in bytes',
        registers: [metricsRegistry],
    });
    metrics.memoryHeapUsed = new Gauge({
        name: `${resourcePrefix}memory_heap_used_bytes`,
        help: 'V8 heap used memory in bytes',
        registers: [metricsRegistry],
    });
    metrics.memoryHeapTotal = new Gauge({
        name: `${resourcePrefix}memory_heap_total_bytes`,
        help: 'V8 heap total memory in bytes',
        registers: [metricsRegistry],
    });
    metrics.memoryExternal = new Gauge({
        name: `${resourcePrefix}memory_external_bytes`,
        help: 'Memory used by C++ objects bound to V8',
        registers: [metricsRegistry],
    });
    metrics.diskTotal = new Gauge({
        name: `${resourcePrefix}disk_total_bytes`,
        help: 'Total disk space in bytes (/Store volume)',
        registers: [metricsRegistry],
    });
    metrics.diskUsed = new Gauge({
        name: `${resourcePrefix}disk_used_bytes`,
        help: 'Used disk space in bytes (/Store volume)',
        registers: [metricsRegistry],
    });
    metrics.diskFree = new Gauge({
        name: `${resourcePrefix}disk_free_bytes`,
        help: 'Free disk space in bytes (/Store volume)',
        registers: [metricsRegistry],
    });
    metrics.diskUsedPercent = new Gauge({
        name: `${resourcePrefix}disk_used_percent`,
        help: 'Disk usage percentage (0-100)',
        registers: [metricsRegistry],
    });
    metrics.cpuUser = new Gauge({
        name: `${resourcePrefix}cpu_user_percent`,
        help: 'CPU user time percentage (0-100)',
        registers: [metricsRegistry],
    });
    metrics.cpuSystem = new Gauge({
        name: `${resourcePrefix}cpu_system_percent`,
        help: 'CPU system time percentage (0-100)',
        registers: [metricsRegistry],
    });
    metrics.uptimeSeconds = new Gauge({
        name: `${resourcePrefix}uptime_seconds`,
        help: 'Process uptime in seconds',
        registers: [metricsRegistry],
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // P5: SYSTEM EVENT COUNTERS (from EventBus events)
    // ═══════════════════════════════════════════════════════════════════════════
    metrics.heapSnapshotsPruned = new Counter({
        name: `${resourcePrefix}heap_snapshots_pruned_total`,
        help: 'Total number of heap snapshots pruned',
        registers: [metricsRegistry],
    });
    metrics.diskAlerts = new Counter({
        name: `${resourcePrefix}disk_alerts_total`,
        help: 'Total disk pressure alerts by level',
        labelNames: ['level'],
        registers: [metricsRegistry],
    });
    metrics.autoRemediation = new Counter({
        name: `${resourcePrefix}auto_remediation_total`,
        help: 'Total auto-remediation actions by type and success status',
        labelNames: ['action', 'success'],
        registers: [metricsRegistry],
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // P5: EVENTBUS SUBSCRIPTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    subscribeToResourceEvents();
    metricsInitialized = true;
    return { registry: metricsRegistry, metrics };
}
/**
 * Increment role assignment counter.
 */
export function recordRoleAssignment(origin, guildId, guildName, result) {
    if (!metricsInitialized || !metrics.roleAssignmentsTotal)
        return;
    metrics.roleAssignmentsTotal.inc({
        origin,
        guild_id: guildId,
        guild_name: guildName,
        result,
    });
}
/**
 * Increment cache invalidation counter.
 */
export function recordCacheInvalidation(reason, guildId, guildName) {
    if (!metricsInitialized || !metrics.cacheInvalidationsTotal)
        return;
    metrics.cacheInvalidationsTotal.inc({
        reason,
        guild_id: guildId,
        guild_name: guildName,
    });
}
/**
 * Increment permission violation counter.
 */
export function recordPermissionViolation(type, guildId, guildName) {
    if (!metricsInitialized || !metrics.permissionViolationsTotal)
        return;
    metrics.permissionViolationsTotal.inc({
        type,
        guild_id: guildId,
        guild_name: guildName,
    });
}
/**
 * Increment distributed lock acquisition counter.
 */
export function recordLockAcquisition(result, resourceType) {
    if (!metricsInitialized || !metrics.distributedLockAcquisitions)
        return;
    metrics.distributedLockAcquisitions.inc({
        result,
        resource_type: resourceType,
    });
}
/**
 * Update active sweeps gauge.
 */
export function setActiveSweeps(guildId, guildName, count) {
    if (!metricsInitialized || !metrics.activeSweeps)
        return;
    metrics.activeSweeps.set({
        guild_id: guildId,
        guild_name: guildName,
    }, count);
}
/**
 * Update cache hit rate gauge.
 */
export function setCacheHitRate(cacheType, hitRate) {
    if (!metricsInitialized || !metrics.cacheHitRate)
        return;
    metrics.cacheHitRate.set({
        cache_type: cacheType,
    }, hitRate);
}
/**
 * Update revert failure rate gauge.
 */
export function setRevertFailureRate(guildId, guildName, failureRate) {
    if (!metricsInitialized || !metrics.revertFailureRate)
        return;
    metrics.revertFailureRate.set({
        guild_id: guildId,
        guild_name: guildName,
    }, failureRate);
}
/**
 * Record sweep candidates histogram.
 */
export function recordSweepCandidates(guildId, guildName, candidateCount) {
    if (!metricsInitialized || !metrics.sweepCandidates)
        return;
    metrics.sweepCandidates.observe({
        guild_id: guildId,
        guild_name: guildName,
    }, candidateCount);
}
/**
 * Record role assignment duration histogram.
 */
export function recordRoleAssignmentDuration(origin, result, durationSeconds) {
    if (!metricsInitialized || !metrics.roleAssignmentDuration)
        return;
    metrics.roleAssignmentDuration.observe({
        origin,
        result,
    }, durationSeconds);
}
/**
 * Update time-windowed gauges from security bot state.
 */
export function updateTimeWindowedMetrics(state) {
    if (!metricsInitialized)
        return;
    if (!state || !state.metricsHistory || !state.metricsHistory.hourly)
        return;
    const metricsHistory = state.metricsHistory.hourly;
    // Calculate 24-hour window statistics
    const stats24h = calculateWindowStats(metricsHistory, TIME_WINDOWS.HOURS_24);
    // Update gauges
    if (metrics.sweepsLast24Hours) {
        metrics.sweepsLast24Hours.set(stats24h.sweeps);
    }
    if (metrics.alertsLast24Hours) {
        metrics.alertsLast24Hours.set(stats24h.alerts);
    }
    if (metrics.permissionChangesLast24Hours) {
        metrics.permissionChangesLast24Hours.set(stats24h.permissionChanges);
    }
    if (metrics.errorsLast24Hours) {
        metrics.errorsLast24Hours.set(stats24h.errors);
    }
    // Calculate rates (events per hour)
    const windowHours = stats24h.hoursWithData || 1; // Avoid division by zero
    if (metrics.sweepRatePerHour) {
        const sweepRate = stats24h.sweeps / windowHours;
        metrics.sweepRatePerHour.set(sweepRate);
    }
    if (metrics.alertRatePerHour) {
        const alertRate = stats24h.alerts / windowHours;
        metrics.alertRatePerHour.set(alertRate);
    }
}
/**
 * Get metrics in Prometheus text format.
 */
export async function getMetricsText() {
    if (!metricsInitialized || !metricsRegistry) {
        throw new Error('Metrics not initialized. Call initializeMetrics() first.');
    }
    return metricsRegistry.metrics();
}
/**
 * Get metrics in JSON format (for debugging).
 */
export async function getMetricsJson() {
    if (!metricsInitialized || !metricsRegistry) {
        throw new Error('Metrics not initialized. Call initializeMetrics() first.');
    }
    return metricsRegistry.getMetricsAsJSON();
}
/**
 * Get content type for Prometheus metrics endpoint.
 */
export function getMetricsContentType() {
    if (!metricsRegistry)
        return 'text/plain; version=0.0.4; charset=utf-8';
    return metricsRegistry.contentType;
}
/**
 * Reset all metrics (for testing).
 */
export function resetMetrics() {
    if (!metricsRegistry)
        return;
    metricsRegistry.resetMetrics();
}
/**
 * Shutdown metrics registry.
 */
export function shutdownMetrics() {
    // Unsubscribe from EventBus events
    unsubscribeFromResourceEvents();
    if (metricsRegistry) {
        register.clear();
        metricsRegistry = null;
        metricsInitialized = false;
        metrics = {
            roleAssignmentsTotal: null,
            cacheInvalidationsTotal: null,
            permissionViolationsTotal: null,
            distributedLockAcquisitions: null,
            activeSweeps: null,
            cacheHitRate: null,
            revertFailureRate: null,
            sweepCandidates: null,
            roleAssignmentDuration: null,
            sweepsLast24Hours: null,
            alertsLast24Hours: null,
            permissionChangesLast24Hours: null,
            errorsLast24Hours: null,
            sweepRatePerHour: null,
            alertRatePerHour: null,
            // P5: Resource Monitor gauges
            memoryRss: null,
            memoryHeapUsed: null,
            memoryHeapTotal: null,
            memoryExternal: null,
            diskTotal: null,
            diskUsed: null,
            diskFree: null,
            diskUsedPercent: null,
            cpuUser: null,
            cpuSystem: null,
            uptimeSeconds: null,
            // P5: System Event counters
            heapSnapshotsPruned: null,
            diskAlerts: null,
            autoRemediation: null,
        };
    }
}
/**
 * Check if metrics are initialized.
 */
export function isMetricsInitialized() {
    return metricsInitialized;
}
/**
 * Get metrics registry (for advanced usage).
 */
export function getRegistry() {
    return metricsRegistry;
}
/**
 * Get all metric instances (for advanced usage).
 */
export function getMetrics() {
    return metrics;
}
/**
 * Subscribe to EventBus events for resource metrics.
 * Called during initializeMetrics().
 */
function subscribeToResourceEvents() {
    try {
        const eventBus = EventBus.getInstance();
        // metrics.snapshot (every 15s from resource-monitor)
        metricsSnapshotSubId = eventBus.subscribe('metrics.snapshot', (event) => {
            handleMetricsSnapshot(event.payload);
        });
        // alert.disk.* (WARNING, CRITICAL, EMERGENCY)
        diskAlertSubId = eventBus.subscribe('alert.disk.*', (event) => {
            handleDiskAlert(event.payload);
        });
        // system.prune.heapsnapshot
        heapPruneSubId = eventBus.subscribe('system.prune.heapsnapshot', (event) => {
            handleHeapSnapshotPruned(event.payload);
        });
        // system.auto-remediation
        autoRemediationSubId = eventBus.subscribe('system.auto-remediation', (event) => {
            handleAutoRemediation(event.payload);
        });
        log.debug('[prometheus-metrics] EventBus subscriptions active for P5 resource metrics');
    }
    catch (error) {
        log.warn('[prometheus-metrics] Failed to subscribe to EventBus events', {
            error: getErrorMessage(error),
        });
    }
}
/**
 * Unsubscribe from EventBus events (cleanup on shutdown).
 */
function unsubscribeFromResourceEvents() {
    try {
        const eventBus = EventBus.getInstance();
        if (metricsSnapshotSubId) {
            eventBus.unsubscribe(metricsSnapshotSubId);
            metricsSnapshotSubId = null;
        }
        if (diskAlertSubId) {
            eventBus.unsubscribe(diskAlertSubId);
            diskAlertSubId = null;
        }
        if (heapPruneSubId) {
            eventBus.unsubscribe(heapPruneSubId);
            heapPruneSubId = null;
        }
        if (autoRemediationSubId) {
            eventBus.unsubscribe(autoRemediationSubId);
            autoRemediationSubId = null;
        }
        log.debug('[prometheus-metrics] EventBus subscriptions cleaned up');
    }
    catch (error) {
        log.warn('[prometheus-metrics] Failed to unsubscribe from EventBus events', {
            error: getErrorMessage(error),
        });
    }
}
/**
 * Handle metrics.snapshot event - update resource gauges.
 */
function handleMetricsSnapshot(payload) {
    if (!metricsInitialized)
        return;
    try {
        // Memory metrics
        metrics.memoryRss?.set(payload.memory.rss);
        metrics.memoryHeapUsed?.set(payload.memory.heapUsed);
        metrics.memoryHeapTotal?.set(payload.memory.heapTotal);
        metrics.memoryExternal?.set(payload.memory.external);
        // Disk metrics
        metrics.diskTotal?.set(payload.storage.total);
        metrics.diskUsed?.set(payload.storage.used);
        metrics.diskFree?.set(payload.storage.free);
        metrics.diskUsedPercent?.set(payload.storage.usedPercent);
        // CPU metrics (payload.cpu uses 'user'/'system' not 'userPercent'/'systemPercent')
        // These are already percentages from resource-monitor
        metrics.cpuUser?.set(payload.cpu.user);
        metrics.cpuSystem?.set(payload.cpu.system);
        // Uptime (from node.uptime, already in seconds)
        metrics.uptimeSeconds?.set(payload.node.uptime);
    }
    catch (error) {
        log.warn('[prometheus-metrics] Failed to update gauges from metrics.snapshot', {
            error: getErrorMessage(error),
        });
    }
}
/**
 * Handle disk alert event - increment counter with level label.
 */
function handleDiskAlert(payload) {
    if (!metricsInitialized)
        return;
    try {
        const level = payload.level.toLowerCase();
        metrics.diskAlerts?.inc({ level });
    }
    catch (error) {
        log.warn('[prometheus-metrics] Failed to increment disk alert counter', {
            error: getErrorMessage(error),
        });
    }
}
/**
 * Handle heap snapshot pruned event - increment counter.
 */
function handleHeapSnapshotPruned(payload) {
    if (!metricsInitialized)
        return;
    try {
        const deletedCount = payload.deleted?.length ?? 0;
        if (deletedCount > 0) {
            metrics.heapSnapshotsPruned?.inc(deletedCount);
        }
    }
    catch (error) {
        log.warn('[prometheus-metrics] Failed to increment heap snapshots counter', {
            error: getErrorMessage(error),
        });
    }
}
/**
 * Handle auto-remediation event - increment counter with labels.
 */
function handleAutoRemediation(payload) {
    if (!metricsInitialized)
        return;
    try {
        metrics.autoRemediation?.inc({
            action: payload.action,
            success: String(payload.success),
        });
    }
    catch (error) {
        log.warn('[prometheus-metrics] Failed to increment auto-remediation counter', {
            error: getErrorMessage(error),
        });
    }
}
/**
 * Handle Prometheus metrics HTTP request.
 * Use this in health-server.ts to add /metrics endpoint.
 *
 * @example
 * ```typescript
 * import { handleMetricsRequest } from './prometheus-metrics.js';
 *
 * // In request handler
 * if (req.url === '/metrics') {
 *   return handleMetricsRequest(res);
 * }
 * ```
 */
export async function handleMetricsRequest(res) {
    try {
        const metrics = await getMetricsText();
        const contentType = getMetricsContentType();
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end(metrics);
    }
    catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`# Error: ${getErrorMessage(error)}\n`);
    }
}
/**
 * Get Prometheus service status for /ops command.
 */
export function getPrometheusStatus() {
    return {
        initialized: metricsInitialized,
        metricsCount: metricsRegistry?.getMetricsAsArray().length ?? 0,
        subscriptionsActive: !!(metricsSnapshotSubId && diskAlertSubId && heapPruneSubId && autoRemediationSubId),
    };
}
