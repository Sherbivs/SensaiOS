/**
 * Logger - Centralized Logging with Stats Display
 * @module utils/logger
 *
 * Provides a comprehensive logging system with:
 *   - Structured log levels (info, warn, error, success, detail)
 *   - Automatic stats collection and display
 *   - Database, security bot, and error tracking integration
 *   - Change detection to avoid duplicate output
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resourceMonitor } from '../services/monitoring/resource-monitor.js';
import { formatBytes, formatUptime, extractDatabaseName } from '../shared/utils/index.js';
import { renderDashboard, } from '../shared/logging/console-renderer.js';
import { lokiTransport } from '../shared/logging/loki-transport.js';
// ─────────────────────────────────────────────────────────────────────────────
// Loki Integration (Forward console output to Loki)
// ─────────────────────────────────────────────────────────────────────────────
function forwardToLoki(level, message, data) {
    try {
        lokiTransport.push({
            level,
            message,
            timestamp: new Date().toISOString(),
            service: 'stats-logger',
            data,
        });
    }
    catch {
        // Graceful degradation - Loki not available
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_LABEL = Object.freeze({
    success: 'SUCCESS',
    info: 'INFO',
    warn: 'WARN',
    detail: 'DETAIL',
    error: 'ERROR',
});
const REFRESH_INTERVAL_MS = 15_000;
const LATENCY_CHANGE_THRESHOLD_MS = 5;
// Feature flag for Infinity Console visual output
const INFINITY_CONSOLE_ENABLED = process.env.INFINITY_CONSOLE_ENABLED?.toLowerCase() !== 'false'
    && process.env.NODE_ENV !== 'test';
const METRIC_UNAVAILABLE = Object.freeze({
    NOT_QUERIED_YET: 'not-queried-yet',
    INITIALIZING: 'initializing',
    NO_PROVIDER: 'no-provider',
    QUERY_FAILED: 'query-failed',
    NOT_CONNECTED: 'not-connected',
    DISABLED: 'disabled',
    NOT_APPLICABLE: 'n/a',
});
// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let errorTracker = null;
let getDatabaseStats = null;
let databaseStatsProvider = 'none';
let databaseStatsInitialized = false;
let logIntervalHandle = null;
let lastLogTime = 0;
let previousStats = null;
const statsCache = {
    node: null,
    cache: null,
    databases: null,
    security: null,
    errors: null,
    lastRefresh: 0,
};
// ─────────────────────────────────────────────────────────────────────────────
// Lazy Loaders
// ─────────────────────────────────────────────────────────────────────────────
async function getErrorTracker() {
    if (errorTracker)
        return errorTracker;
    try {
        const errorTrackerModule = await import('../services/monitoring/error-tracker.js');
        errorTracker = errorTrackerModule.errorTracker;
        return errorTracker;
    }
    catch {
        return null;
    }
}
async function initializeDatabaseStatsProvider() {
    if (databaseStatsInitialized)
        return;
    databaseStatsInitialized = true;
    try {
        const prismaModule = await import('../shared/prisma.js');
        if (typeof prismaModule.getDatabaseStats === 'function') {
            getDatabaseStats = prismaModule.getDatabaseStats;
            databaseStatsProvider = 'prisma';
            // eslint-disable-next-line no-console
            console.info('[logger] Database stats provider: Prisma (primary)');
            return;
        }
    }
    catch {
        // Prisma not available
    }
    try {
        const pgModule = await import('../shared/pg-connection.js');
        if (typeof pgModule.getDatabaseStats === 'function') {
            getDatabaseStats = pgModule.getDatabaseStats;
            databaseStatsProvider = 'pg-connection';
            // eslint-disable-next-line no-console
            console.info('[logger] Database stats provider: pg-connection (fallback)');
            return;
        }
    }
    catch {
        // pg-connection not available
    }
    // eslint-disable-next-line no-console
    console.warn('[logger] Database stats unavailable - both Prisma and pg-connection failed to load');
}
// ─────────────────────────────────────────────────────────────────────────────
// Service Detection
// ─────────────────────────────────────────────────────────────────────────────
function detectServiceType() {
    const serviceName = process.env.RENDER_SERVICE_NAME || process.env.SERVICE_NAME || '';
    return {
        isSecurityBot: serviceName.includes('security'),
        isMainBot: serviceName.includes('bots') && !serviceName.includes('security'),
        isWorker: serviceName.includes('worker') || serviceName.includes('cache') || serviceName.includes('data-pipeline'),
        isWeb: serviceName.includes('web'),
        serviceName: serviceName || 'unknown',
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────
function hasSignificantChange(current, previous) {
    if (!previous)
        return true;
    if (current.databases?.master?.status !== previous.databases?.master?.status)
        return true;
    if (current.databases?.engineRead?.status !== previous.databases?.engineRead?.status)
        return true;
    if (current.databases?.engineWrite?.status !== previous.databases?.engineWrite?.status)
        return true;
    const currentMasterLatency = current.databases?.master?.latency ?? 0;
    const previousMasterLatency = previous.databases?.master?.latency ?? 0;
    if (Math.abs(currentMasterLatency - previousMasterLatency) > LATENCY_CHANGE_THRESHOLD_MS)
        return true;
    if (current.security?.status !== previous.security?.status)
        return true;
    const currentRss = parseFloat(current.node?.memory?.rss ?? '0') || 0;
    const previousRss = parseFloat(previous.node?.memory?.rss ?? '0') || 0;
    if (Math.abs(currentRss - previousRss) > 50 * 1024 * 1024)
        return true;
    return false;
}
function formatMetric(value, reason, formatter) {
    if (value === null || value === undefined) {
        return `<unavailable: ${reason || 'unknown'}>`;
    }
    if (formatter && typeof value === 'number') {
        try {
            return formatter(value);
        }
        catch {
            return '<unavailable: formatter-error>';
        }
    }
    return String(value);
}
function formatTimeSince(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay > 0)
        return `${diffDay}d`;
    if (diffHour > 0)
        return `${diffHour}h`;
    if (diffMin > 0)
        return `${diffMin}m`;
    return `${diffSec}s`;
}
// ─────────────────────────────────────────────────────────────────────────────
// Stats Collection
// ─────────────────────────────────────────────────────────────────────────────
function collectNodeStats() {
    const resourceMetrics = resourceMonitor.getMetrics();
    return {
        uptime: formatUptime(resourceMetrics.uptime * 1000),
        memory: {
            rss: formatBytes(resourceMetrics.rss),
            heapUsed: formatBytes(resourceMetrics.heapUsed),
            heapTotal: formatBytes(resourceMetrics.heapTotal),
            external: formatBytes(resourceMetrics.external),
        },
        cpu: {
            user: `${resourceMetrics.cpuUser.toFixed(1)}%`,
            system: `${resourceMetrics.cpuSystem.toFixed(1)}%`,
        },
        pid: resourceMetrics.pid,
        version: resourceMetrics.nodeVersion,
    };
}
function collectCacheStats() {
    const resourceMetrics = resourceMonitor.getMetrics();
    return {
        cacheDir: resourceMetrics.cacheDir,
        cacheSize: formatBytes(resourceMetrics.cacheSize),
        cacheBudgetMax: formatBytes(resourceMetrics.cacheBudgetMax),
        cacheBudgetPercent: `${resourceMetrics.cacheBudgetPercent.toFixed(1)}%`,
        approxFree: formatBytes(resourceMetrics.cacheBudgetMax - resourceMetrics.cacheSize),
        workspaceLimit: formatBytes(resourceMetrics.workspaceLimit),
        workspaceFree: formatBytes(resourceMetrics.approxFree),
        diskTotal: formatBytes(resourceMetrics.diskTotal),
        diskFree: formatBytes(resourceMetrics.diskFree),
        diskUsed: formatBytes(resourceMetrics.diskUsed),
    };
}
async function collectDatabaseStats() {
    if (!databaseStatsInitialized) {
        await initializeDatabaseStatsProvider();
    }
    const defaultReturn = {
        master: {
            status: METRIC_UNAVAILABLE.INITIALIZING,
            latency: null,
            latencyReason: METRIC_UNAVAILABLE.INITIALIZING,
            source: null,
            sourceReason: METRIC_UNAVAILABLE.INITIALIZING,
        },
        engineRead: {
            status: METRIC_UNAVAILABLE.INITIALIZING,
            latency: null,
            latencyReason: METRIC_UNAVAILABLE.INITIALIZING,
            entries: null,
            entriesReason: METRIC_UNAVAILABLE.INITIALIZING,
        },
        engineWrite: {
            status: METRIC_UNAVAILABLE.INITIALIZING,
            latency: null,
            latencyReason: METRIC_UNAVAILABLE.INITIALIZING,
            entries: null,
            entriesReason: METRIC_UNAVAILABLE.INITIALIZING,
        },
        onPremiseDev: {
            status: METRIC_UNAVAILABLE.NOT_APPLICABLE,
            latency: null,
            latencyReason: METRIC_UNAVAILABLE.NOT_APPLICABLE,
            source: null,
            sourceReason: METRIC_UNAVAILABLE.NOT_APPLICABLE,
        },
        onPremiseExperiment: {
            status: METRIC_UNAVAILABLE.NOT_APPLICABLE,
            latency: null,
            latencyReason: METRIC_UNAVAILABLE.NOT_APPLICABLE,
            source: null,
            sourceReason: METRIC_UNAVAILABLE.NOT_APPLICABLE,
        },
    };
    if (typeof getDatabaseStats !== 'function') {
        const reason = databaseStatsProvider === 'none'
            ? METRIC_UNAVAILABLE.NO_PROVIDER
            : METRIC_UNAVAILABLE.INITIALIZING;
        defaultReturn.master.status = reason;
        defaultReturn.master.latencyReason = reason;
        defaultReturn.master.sourceReason = reason;
        return defaultReturn;
    }
    try {
        const stats = getDatabaseStats();
        if (!stats || stats.error) {
            defaultReturn.master.status = METRIC_UNAVAILABLE.NOT_CONNECTED;
            defaultReturn.master.latencyReason = METRIC_UNAVAILABLE.NOT_CONNECTED;
            defaultReturn.master.sourceReason = METRIC_UNAVAILABLE.NOT_CONNECTED;
            return defaultReturn;
        }
        const masterLatency = stats.prod.latency ?? null;
        const masterLatencyReason = masterLatency === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null;
        const masterSource = stats.prod.source ?? null;
        const masterSourceReason = masterSource === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null;
        const onPremiseDevLatency = stats.onPremiseDev.latency ?? null;
        const onPremiseDevLatencyReason = stats.onPremiseDev.status === 'disabled'
            ? METRIC_UNAVAILABLE.DISABLED
            : (onPremiseDevLatency === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null);
        const onPremiseDevSource = stats.onPremiseDev.source ?? null;
        const onPremiseDevSourceReason = stats.onPremiseDev.status === 'disabled'
            ? METRIC_UNAVAILABLE.DISABLED
            : (onPremiseDevSource === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null);
        const onPremiseExperimentLatency = stats.onPremiseExperiment?.latency ?? null;
        const onPremiseExperimentLatencyReason = stats.onPremiseExperiment?.status === 'disabled'
            ? METRIC_UNAVAILABLE.DISABLED
            : (onPremiseExperimentLatency === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null);
        const onPremiseExperimentSource = stats.onPremiseExperiment?.source ?? null;
        const onPremiseExperimentSourceReason = stats.onPremiseExperiment?.status === 'disabled'
            ? METRIC_UNAVAILABLE.DISABLED
            : (onPremiseExperimentSource === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null);
        // Collect Engine DB stats
        let engineReadStats = {
            status: 'n/a', latency: null, pokemonCount: null
        };
        let engineWriteStats = {
            status: 'n/a', latency: null, battleLogCount: null
        };
        try {
            const engineReadDb = await import('../services/database/engine-read-db.js');
            if (typeof engineReadDb.getStats === 'function') {
                engineReadStats = engineReadDb.getStats();
            }
        }
        catch {
            // Engine Read-DB not available
        }
        try {
            const engineWriteDb = await import('../services/database/engine-write-db.js');
            if (typeof engineWriteDb.getStats === 'function') {
                engineWriteStats = engineWriteDb.getStats();
            }
        }
        catch {
            // Engine Write-DB not available
        }
        return {
            master: {
                status: stats.prod.status,
                latency: masterLatency,
                latencyReason: masterLatencyReason,
                source: masterSource ? extractDatabaseName(masterSource) : null,
                sourceReason: masterSourceReason,
            },
            engineRead: {
                status: engineReadStats.status || 'n/a',
                latency: engineReadStats.latency ?? null,
                latencyReason: engineReadStats.latency ? null : METRIC_UNAVAILABLE.NOT_APPLICABLE,
                entries: engineReadStats.pokemonCount ?? null,
                entriesReason: engineReadStats.pokemonCount ? null : METRIC_UNAVAILABLE.NOT_APPLICABLE,
            },
            engineWrite: {
                status: engineWriteStats.status || 'n/a',
                latency: engineWriteStats.latency ?? null,
                latencyReason: engineWriteStats.latency ? null : METRIC_UNAVAILABLE.NOT_APPLICABLE,
                entries: engineWriteStats.battleLogCount ?? null,
                entriesReason: engineWriteStats.battleLogCount ? null : METRIC_UNAVAILABLE.NOT_APPLICABLE,
            },
            onPremiseDev: {
                status: stats.onPremiseDev.status,
                latency: onPremiseDevLatency,
                latencyReason: onPremiseDevLatencyReason,
                source: onPremiseDevSource ? extractDatabaseName(onPremiseDevSource) : null,
                sourceReason: onPremiseDevSourceReason,
            },
            onPremiseExperiment: {
                status: stats.onPremiseExperiment?.status || 'disabled',
                latency: onPremiseExperimentLatency,
                latencyReason: onPremiseExperimentLatencyReason,
                source: onPremiseExperimentSource ? extractDatabaseName(onPremiseExperimentSource) : null,
                sourceReason: onPremiseExperimentSourceReason,
            },
        };
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[logger] Error collecting database stats:', error.message);
        getErrorTracker()
            .then(tracker => {
            if (tracker) {
                tracker.captureError(error, {
                    service: 'logger',
                    operation: 'collectDatabaseStats',
                    category: 'DATABASE',
                    severity: 'MEDIUM',
                }).catch(trackErr => {
                    // eslint-disable-next-line no-console
                    console.warn('[logger] Failed to track database stats error:', trackErr.message);
                });
            }
        })
            .catch(() => {
            // Error tracker not available
        });
        defaultReturn.master.status = METRIC_UNAVAILABLE.QUERY_FAILED;
        defaultReturn.master.latencyReason = METRIC_UNAVAILABLE.QUERY_FAILED;
        defaultReturn.master.sourceReason = METRIC_UNAVAILABLE.QUERY_FAILED;
        defaultReturn.engineRead.status = METRIC_UNAVAILABLE.QUERY_FAILED;
        defaultReturn.engineRead.latencyReason = METRIC_UNAVAILABLE.QUERY_FAILED;
        defaultReturn.engineRead.entriesReason = METRIC_UNAVAILABLE.QUERY_FAILED;
        defaultReturn.engineWrite.status = METRIC_UNAVAILABLE.QUERY_FAILED;
        defaultReturn.engineWrite.latencyReason = METRIC_UNAVAILABLE.QUERY_FAILED;
        defaultReturn.engineWrite.entriesReason = METRIC_UNAVAILABLE.QUERY_FAILED;
        return defaultReturn;
    }
}
function collectSecurityBotStats() {
    const serviceInfo = detectServiceType();
    if (typeof global.securityBotState === 'object' && global.securityBotState) {
        const botState = global.securityBotState;
        const client = global.securityBotClient;
        const guildCount = client?.guilds?.cache?.size ?? 0;
        const isReady = client?.isReady?.() ?? false;
        if (botState.stats) {
            const totalPermissionChanges = botState.stats.totalPermissionChanges || 0;
            const totalAlerts = botState.stats.totalAlerts || 0;
            let lastSweepTime = 'never';
            if (Array.isArray(botState.timeline) && botState.timeline.length > 0) {
                const sweepEvents = botState.timeline
                    .filter(e => e.type === 'sweep')
                    .sort((a, b) => {
                    const tsA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : Number(a.timestamp);
                    const tsB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : Number(b.timestamp);
                    return tsB - tsA;
                });
                if (sweepEvents.length > 0) {
                    const lastSweep = sweepEvents[0];
                    const lastSweepTs = typeof lastSweep.timestamp === 'string'
                        ? new Date(lastSweep.timestamp).getTime()
                        : Number(lastSweep.timestamp);
                    const elapsed = Date.now() - lastSweepTs;
                    if (elapsed < 60000) {
                        lastSweepTime = `${Math.round(elapsed / 1000)}s ago`;
                    }
                    else if (elapsed < 3600000) {
                        lastSweepTime = `${Math.round(elapsed / 60000)}m ago`;
                    }
                    else {
                        lastSweepTime = `${Math.round(elapsed / 3600000)}h ago`;
                    }
                }
            }
            return {
                status: isReady ? 'online' : 'initializing',
                guilds: guildCount,
                lastSweep: lastSweepTime,
                assignments: totalPermissionChanges,
                failures: totalAlerts,
            };
        }
        return {
            status: isReady ? 'online' : 'connecting',
            guilds: guildCount,
            lastSweep: 'n/a',
            assignments: 0,
            failures: 0,
        };
    }
    if (serviceInfo.isSecurityBot) {
        return {
            status: 'loading',
            guilds: 0,
            lastSweep: 'n/a',
            assignments: 0,
            failures: 0,
        };
    }
    // Try to read from persisted state file
    try {
        const stateFile = process.env.IS_RENDER
            ? '/Store/security-bot-state/current.json'
            : path.resolve(__dirname, '../../Store/security-bot-state/current.json');
        if (fs.existsSync(stateFile)) {
            const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            const cumulative = stateData.cumulative || {};
            const timeline = stateData.timeline || [];
            let lastSweepTime = 'n/a';
            if (Array.isArray(timeline) && timeline.length > 0) {
                const sweepEvents = timeline
                    .filter(e => e.type === 'sweep')
                    .sort((a, b) => {
                    const tsA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : Number(a.timestamp);
                    const tsB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : Number(b.timestamp);
                    return tsB - tsA;
                });
                if (sweepEvents.length > 0) {
                    const lastSweep = sweepEvents[0];
                    const lastSweepTs = typeof lastSweep.timestamp === 'string'
                        ? new Date(lastSweep.timestamp).getTime()
                        : Number(lastSweep.timestamp);
                    const elapsed = Date.now() - lastSweepTs;
                    if (elapsed < 60000) {
                        lastSweepTime = `${Math.round(elapsed / 1000)}s ago`;
                    }
                    else if (elapsed < 3600000) {
                        lastSweepTime = `${Math.round(elapsed / 60000)}m ago`;
                    }
                    else {
                        lastSweepTime = `${Math.round(elapsed / 3600000)}h ago`;
                    }
                }
            }
            return {
                status: 'online',
                guilds: cumulative.guildCount || 0,
                lastSweep: lastSweepTime,
                assignments: cumulative.permissionChangesReverted || 0,
                failures: cumulative.revertFailures || 0,
                source: 'persisted-state',
            };
        }
    }
    catch {
        // File read failed
    }
    return null;
}
async function collectErrorStats() {
    try {
        const errorTrackerModule = await import('../services/monitoring/error-tracker.js');
        const tracker = errorTrackerModule.errorTracker;
        if (!tracker) {
            return {
                status: METRIC_UNAVAILABLE.NO_PROVIDER,
                recentErrors: [],
                summary: null,
            };
        }
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const stats = await tracker.getErrorStats(oneHourAgo);
        const topErrors = await tracker.getRecentErrors(10, { since: oneHourAgo });
        return {
            status: 'ready',
            summary: {
                totalUnique: stats.totalErrors,
                totalOccurrences: stats.totalOccurrences,
                criticalCount: stats.bySeverity.CRITICAL || 0,
                highCount: stats.bySeverity.HIGH || 0,
                mediumCount: stats.bySeverity.MEDIUM || 0,
                lowCount: stats.bySeverity.LOW || 0,
                errorRate: stats.errorRate,
                topCategories: stats.byCategory,
            },
            recentErrors: topErrors.map(err => ({
                severity: err.severity,
                category: err.category,
                name: err.name,
                message: err.message,
                count: err.count,
                lastSeen: err.lastSeen,
                impactedFeatures: err.impactedFeatures || [],
                recoveryAttempts: err.recoveryAttempts,
                recoverySuccesses: err.recoverySuccesses,
            })),
        };
    }
    catch (error) {
        return {
            status: METRIC_UNAVAILABLE.QUERY_FAILED,
            statusReason: error.message,
            recentErrors: [],
            summary: null,
        };
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Stats Display
// ─────────────────────────────────────────────────────────────────────────────
async function refreshStats() {
    const now = Date.now();
    if (now - statsCache.lastRefresh < REFRESH_INTERVAL_MS) {
        return;
    }
    statsCache.node = collectNodeStats();
    statsCache.cache = collectCacheStats();
    statsCache.databases = await collectDatabaseStats();
    statsCache.security = collectSecurityBotStats();
    statsCache.errors = await collectErrorStats();
    statsCache.lastRefresh = now;
}
/**
 * Renders the Infinity Console visual dashboard
 */
function printInfinityConsole() {
    if (!statsCache.databases || !statsCache.node || !statsCache.cache) {
        return;
    }
    // Build database status array for visual dashboard
    const databases = [
        {
            name: 'CLOUD-PROD',
            status: statsCache.databases.master.status === 'online' ? 'online' :
                statsCache.databases.master.status === 'degraded' ? 'degraded' : 'offline',
            latency: statsCache.databases.master.latency ?? undefined,
            details: 'Direct PostgreSQL',
        },
        {
            name: 'ENGINE-READ',
            status: statsCache.databases.engineRead.status === 'n/a' ? 'offline' :
                statsCache.databases.engineRead.status === 'ready' ? 'online' : 'degraded',
            latency: statsCache.databases.engineRead.latency ?? undefined,
            details: statsCache.databases.engineRead.entries
                ? `${statsCache.databases.engineRead.entries.toLocaleString()} Pokémon loaded`
                : 'Loading...',
        },
        {
            name: 'ENGINE-WRITE',
            status: statsCache.databases.engineWrite.status === 'n/a' ? 'offline' :
                statsCache.databases.engineWrite.status === 'ready' ? 'online' : 'degraded',
            latency: statsCache.databases.engineWrite.latency ?? undefined,
            details: 'WAL healthy',
        },
    ];
    // Add on-premise databases if in development
    const serviceInfo = detectServiceType();
    if (!serviceInfo.isWeb && !serviceInfo.isWorker) {
        if (statsCache.databases.onPremiseDev.status !== 'disabled') {
            databases.push({
                name: 'ON-PREMISE',
                status: statsCache.databases.onPremiseDev.status === 'online' ? 'online' : 'offline',
                latency: statsCache.databases.onPremiseDev.latency ?? undefined,
                details: 'Development only',
            });
        }
    }
    // Parse memory values (they come as formatted strings like "337.5 MB")
    const parseMemoryMB = (str) => {
        const match = str.match(/([\d.]+)\s*(MB|GB|KB)?/i);
        if (!match)
            return 0;
        const value = parseFloat(match[1]);
        const unit = (match[2] || 'MB').toUpperCase();
        if (unit === 'GB')
            return value * 1024;
        if (unit === 'KB')
            return value / 1024;
        return value;
    };
    const ramUsedMB = parseMemoryMB(statsCache.node.memory.rss);
    const ramTotalMB = 2048; // Render Standard plan: 2 GB
    // Parse disk values
    const parseDiskMB = (str) => {
        const match = str.match(/([\d.]+)\s*(MB|GB|KB)?/i);
        if (!match)
            return 0;
        const value = parseFloat(match[1]);
        const unit = (match[2] || 'MB').toUpperCase();
        if (unit === 'GB')
            return value * 1024;
        if (unit === 'KB')
            return value / 1024;
        return value;
    };
    // Use ACTUAL disk usage from resource monitor (calculated via statfsSync)
    // diskUsed comes directly from the source - no recalculation needed
    const diskTotalMB = parseDiskMB(statsCache.cache.diskTotal) || 1024; // 1 GB default
    const diskFreeMB = parseDiskMB(statsCache.cache.diskFree) || 0;
    const diskUsedMB = parseDiskMB(statsCache.cache.diskUsed) || (diskTotalMB - diskFreeMB); // Use direct value or fallback
    const storeSizeMB = parseDiskMB(statsCache.cache.cacheSize); // Just /Store directory size
    // Parse uptime (comes as formatted string like "4h 23m 15s")
    const parseUptimeSeconds = (str) => {
        let seconds = 0;
        const hourMatch = str.match(/(\d+)h/);
        const minMatch = str.match(/(\d+)m/);
        const secMatch = str.match(/(\d+)s/);
        if (hourMatch)
            seconds += parseInt(hourMatch[1]) * 3600;
        if (minMatch)
            seconds += parseInt(minMatch[1]) * 60;
        if (secMatch)
            seconds += parseInt(secMatch[1]);
        return seconds;
    };
    const uptimeSeconds = parseUptimeSeconds(statsCache.node.uptime);
    // Build dashboard config
    const config = {
        version: '2.5.0',
        databases,
        discord: statsCache.security?.status === 'online' ? {
            status: 'online',
            guilds: statsCache.security.guilds,
            latency: 45, // Placeholder - would need Discord client access
            uptime: uptimeSeconds,
        } : undefined,
        resources: {
            ram: { used: ramUsedMB * 1024 * 1024, total: ramTotalMB * 1024 * 1024 },
            disk: { used: diskUsedMB * 1024 * 1024, total: diskTotalMB * 1024 * 1024 },
            cpu: 12, // Placeholder - would need CPU monitoring
        },
    };
    // eslint-disable-next-line no-console
    console.log('\n' + renderDashboard(config));
    // Forward comprehensive dashboard metrics to Loki
    forwardToLoki('info', 'Dashboard rendered', {
        // Database status
        databases: databases.length,
        dbCloudProd: statsCache.databases?.master.status,
        dbCloudProdLatencyMs: statsCache.databases?.master.latency,
        dbEngineRead: statsCache.databases?.engineRead.status,
        dbEngineReadEntries: statsCache.databases?.engineRead.entries,
        dbEngineWrite: statsCache.databases?.engineWrite.status,
        // Discord status
        discord: config.discord?.status,
        discordGuilds: config.discord?.guilds,
        discordUptimeSec: uptimeSeconds,
        // RAM metrics (cloud host)
        ramUsedMB: Math.round(ramUsedMB * 100) / 100,
        ramTotalMB,
        ramPercent: Math.round((ramUsedMB / ramTotalMB) * 100),
        heapUsedMB: parseMemoryMB(statsCache.node?.memory.heapUsed || '0'),
        heapTotalMB: parseMemoryMB(statsCache.node?.memory.heapTotal || '0'),
        // Disk metrics (cloud host)  
        diskUsedMB: Math.round(diskUsedMB * 100) / 100,
        diskFreeMB: Math.round(diskFreeMB * 100) / 100,
        diskTotalMB,
        diskPercent: Math.round((diskUsedMB / diskTotalMB) * 100),
        storeSizeMB: Math.round(storeSizeMB * 100) / 100, // Just /Store directory
        // Process info
        pid: statsCache.node?.pid,
        nodeVersion: statsCache.node?.version,
        cpuUser: statsCache.node?.cpu.user,
        cpuSystem: statsCache.node?.cpu.system,
    });
}
async function printStats() {
    await refreshStats();
    if (!statsCache.databases || !statsCache.node || !statsCache.cache) {
        return;
    }
    if (!hasSignificantChange(statsCache, previousStats)) {
        return;
    }
    previousStats = { ...statsCache };
    // Use Infinity Console if enabled
    if (INFINITY_CONSOLE_ENABLED) {
        printInfinityConsole();
        return;
    }
    // Legacy text-based output
    const lines = [];
    lines.push('');
    lines.push('─────────────────────────────────────────────────────────────────────────');
    lines.push('');
    // Node Stats
    lines.push('[NODE]');
    lines.push(`  Uptime: ${statsCache.node.uptime}`);
    lines.push(`  Process: PID ${statsCache.node.pid} | ${statsCache.node.version}`);
    lines.push('');
    lines.push('  RAM (Process Memory):');
    lines.push(`    RSS:      ${statsCache.node.memory.rss.padEnd(12)} ← Total RAM used`);
    lines.push(`    Heap:     ${statsCache.node.memory.heapUsed} / ${statsCache.node.memory.heapTotal}`);
    lines.push(`    External: ${statsCache.node.memory.external}`);
    lines.push('');
    lines.push('  CPU:');
    lines.push(`    User:   ${statsCache.node.cpu.user}`);
    lines.push(`    System: ${statsCache.node.cpu.system}`);
    lines.push('');
    // Cache Stats - Simplified to show actual disk values
    lines.push('[STORAGE - /Store Persistent Disk]');
    lines.push(`  Directory: ${statsCache.cache.cacheDir}`);
    lines.push(`  Disk Total: ${statsCache.cache.diskTotal}`);
    lines.push(`  Disk Used:  ${statsCache.cache.cacheSize}`);
    lines.push(`  Disk Free:  ${statsCache.cache.diskFree}`);
    lines.push('');
    // Database Stats
    lines.push('[DATABASE]');
    const masterStatus = statsCache.databases.master.status.toUpperCase().padEnd(12);
    const masterLatency = formatMetric(statsCache.databases.master.latency, statsCache.databases.master.latencyReason, (val) => `${val.toFixed(2)}ms`);
    const masterSource = formatMetric(statsCache.databases.master.source, statsCache.databases.master.sourceReason);
    lines.push(`  MASTER = ${masterStatus}  Latency: ${masterLatency.padEnd(30)}  Database: ${masterSource}`);
    const engineReadStatus = statsCache.databases.engineRead.status.toUpperCase().padEnd(12);
    const engineReadLatency = formatMetric(statsCache.databases.engineRead.latency, statsCache.databases.engineRead.latencyReason, (val) => `${val.toFixed(2)}ms`);
    const engineReadEntries = formatMetric(statsCache.databases.engineRead.entries, statsCache.databases.engineRead.entriesReason);
    lines.push(`  LOCAL-R = ${engineReadStatus}  Latency: ${engineReadLatency.padEnd(30)}  Pokemon: ${engineReadEntries}`);
    const engineWriteStatus = statsCache.databases.engineWrite.status.toUpperCase().padEnd(12);
    const engineWriteLatency = formatMetric(statsCache.databases.engineWrite.latency, statsCache.databases.engineWrite.latencyReason, (val) => `${val.toFixed(2)}ms`);
    const engineWriteEntries = formatMetric(statsCache.databases.engineWrite.entries, statsCache.databases.engineWrite.entriesReason);
    lines.push(`  LOCAL-W = ${engineWriteStatus}  Latency: ${engineWriteLatency.padEnd(30)}  Battles: ${engineWriteEntries}`);
    const serviceInfo = detectServiceType();
    if (!serviceInfo.isWeb && !serviceInfo.isWorker) {
        const onPremiseDevStatus = statsCache.databases.onPremiseDev.status.toUpperCase().padEnd(12);
        const onPremiseDevLatency = formatMetric(statsCache.databases.onPremiseDev.latency, statsCache.databases.onPremiseDev.latencyReason, (val) => `${val.toFixed(2)}ms`);
        const onPremiseDevSource = formatMetric(statsCache.databases.onPremiseDev.source, statsCache.databases.onPremiseDev.sourceReason);
        lines.push(`  ONPREM-D = ${onPremiseDevStatus}  Latency: ${onPremiseDevLatency.padEnd(30)}  Database: ${onPremiseDevSource}`);
        const onPremiseExpStatus = statsCache.databases.onPremiseExperiment.status.toUpperCase().padEnd(12);
        const onPremiseExpLatency = formatMetric(statsCache.databases.onPremiseExperiment.latency, statsCache.databases.onPremiseExperiment.latencyReason, (val) => `${val.toFixed(2)}ms`);
        const onPremiseExpSource = formatMetric(statsCache.databases.onPremiseExperiment.source, statsCache.databases.onPremiseExperiment.sourceReason);
        lines.push(`  ONPREM-E = ${onPremiseExpStatus}  Latency: ${onPremiseExpLatency.padEnd(30)}  Database: ${onPremiseExpSource}`);
    }
    lines.push('');
    // Security Bot Stats
    if (statsCache.security !== null) {
        lines.push('[SECURITY BOT]');
        const secStatus = String(statsCache.security.status).toUpperCase();
        const source = statsCache.security.source === 'persisted-state' ? ' (from persisted state)' : '';
        lines.push(`  Status: ${secStatus}${source}`);
        if (secStatus === 'ONLINE') {
            const stateSource = statsCache.security.source === 'persisted-state' ? 'persisted state file' : 'botState.timeline';
            lines.push(`  Guilds: ${statsCache.security.guilds} (queried from ${statsCache.security.source === 'persisted-state' ? 'state.cumulative' : 'client.guilds.cache.size'})`);
            lines.push(`  Last Sweep: ${statsCache.security.lastSweep} (queried from ${stateSource})`);
            lines.push('');
            lines.push(`  Lifetime Statistics (queried from ${statsCache.security.source === 'persisted-state' ? 'state.cumulative' : 'botState.stats'}):`);
            lines.push(`    Assignments: ${statsCache.security.assignments}`);
            lines.push(`    Failures:    ${statsCache.security.failures}`);
        }
        else if (['LOADING', 'INITIALIZING', 'CONNECTING'].includes(secStatus)) {
            lines.push('  <unavailable: bot-initializing>');
        }
        else {
            lines.push(`  <unavailable: ${statsCache.security.statusReason || 'unknown'}>`);
        }
        lines.push('');
    }
    // Error Monitoring Stats
    if (statsCache.errors) {
        lines.push('[ERROR MONITORING] (Last Hour)');
        if (statsCache.errors.status === 'ready' && statsCache.errors.summary) {
            const summary = statsCache.errors.summary;
            lines.push(`  🚨 CRITICAL: ${summary.criticalCount} unique | ⚠️  HIGH: ${summary.highCount} unique | 📊 MEDIUM: ${summary.mediumCount} unique | 📝 LOW: ${summary.lowCount} unique`);
            lines.push(`  Total: ${summary.totalUnique} unique errors | ${summary.totalOccurrences} occurrences | Rate: ${summary.errorRate.toFixed(2)}/min`);
            lines.push('');
            if (statsCache.errors.recentErrors.length > 0) {
                lines.push('  Top Recent Errors:');
                const topErrors = statsCache.errors.recentErrors.slice(0, 5);
                topErrors.forEach(err => {
                    const icon = err.severity === 'CRITICAL' ? '❌' : err.severity === 'HIGH' ? '⚠️ ' : err.severity === 'MEDIUM' ? '📊' : '📝';
                    const timeSince = formatTimeSince(new Date(err.lastSeen));
                    const recoveryInfo = (err.recoveryAttempts ?? 0) > 0
                        ? ` | Recovery: ${err.recoverySuccesses}/${err.recoveryAttempts}`
                        : '';
                    lines.push(`    ${icon} [${err.severity}] ${err.name} (x${err.count}, ${timeSince} ago)${recoveryInfo}`);
                    if (err.impactedFeatures && err.impactedFeatures.length > 0) {
                        lines.push(`       → affecting: ${err.impactedFeatures.slice(0, 3).join(', ')}`);
                    }
                });
            }
            else {
                lines.push('  ✅ No errors in last hour');
            }
            lines.push('');
            const topCategories = Object.entries(summary.topCategories)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3);
            if (topCategories.length > 0) {
                const categoryStr = topCategories.map(([cat, count]) => `${cat} (${count})`).join(', ');
                lines.push(`  Top Categories: ${categoryStr}`);
            }
        }
        else if (statsCache.errors.status === METRIC_UNAVAILABLE.QUERY_FAILED) {
            lines.push(`  <unavailable: ${statsCache.errors.statusReason || 'query-failed'}>`);
        }
        else if (statsCache.errors.status === METRIC_UNAVAILABLE.NO_PROVIDER) {
            lines.push('  <unavailable: error-tracker-not-loaded>');
        }
        else {
            lines.push(`  <unavailable: ${statsCache.errors.status}>`);
        }
        lines.push('');
    }
    lines.push('─────────────────────────────────────────────────────────────────────────');
    lines.push('');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
}
async function getFormattedStats() {
    await refreshStats();
    if (!statsCache.databases || !statsCache.node) {
        return '';
    }
    const lines = [];
    lines.push('[NODE]');
    lines.push(`  Uptime: ${statsCache.node.uptime}`);
    lines.push(`  Process: PID ${statsCache.node.pid} | ${statsCache.node.version}`);
    lines.push('');
    lines.push(`  Memory: RSS ${statsCache.node.memory.rss} | Heap ${statsCache.node.memory.heapUsed}/${statsCache.node.memory.heapTotal} | External ${statsCache.node.memory.external}`);
    lines.push(`  CPU: User ${statsCache.node.cpu.user} | System ${statsCache.node.cpu.system}`);
    lines.push('');
    lines.push('[DATABASE]');
    const masterLatency = formatMetric(statsCache.databases.master.latency, statsCache.databases.master.latencyReason, (val) => `${val.toFixed(2)}ms`);
    const masterSource = formatMetric(statsCache.databases.master.source, statsCache.databases.master.sourceReason);
    lines.push(`  MASTER → ${statsCache.databases.master.status} | Latency: ${masterLatency} | ${masterSource}`);
    const engineReadLatency = formatMetric(statsCache.databases.engineRead.latency, statsCache.databases.engineRead.latencyReason, (val) => `${val.toFixed(2)}ms`);
    const engineReadEntries = formatMetric(statsCache.databases.engineRead.entries, statsCache.databases.engineRead.entriesReason);
    lines.push(`  LOCAL-R → ${statsCache.databases.engineRead.status} | Latency: ${engineReadLatency} | Pokemon: ${engineReadEntries}`);
    const engineWriteLatency = formatMetric(statsCache.databases.engineWrite.latency, statsCache.databases.engineWrite.latencyReason, (val) => `${val.toFixed(2)}ms`);
    const engineWriteEntries = formatMetric(statsCache.databases.engineWrite.entries, statsCache.databases.engineWrite.entriesReason);
    lines.push(`  LOCAL-W → ${statsCache.databases.engineWrite.status} | Latency: ${engineWriteLatency} | Battles: ${engineWriteEntries}`);
    return lines.join('\n');
}
// ─────────────────────────────────────────────────────────────────────────────
// Logging Functions
// ─────────────────────────────────────────────────────────────────────────────
function log(level, message, context) {
    const label = LOG_LABEL[level] || LOG_LABEL.info;
    // eslint-disable-next-line no-console
    console.log(`[${label}] ${message}`);
    // Forward to Loki
    forwardToLoki(level === 'detail' ? 'debug' : level, message, context);
    if (context && typeof context === 'object') {
        const keys = Object.keys(context);
        if (keys.length > 0) {
            for (const key of keys) {
                // eslint-disable-next-line no-console
                console.log(`  ${key}: ${JSON.stringify(context[key])}`);
            }
        }
    }
    const now = Date.now();
    if (now - lastLogTime >= REFRESH_INTERVAL_MS) {
        printStats().catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[logger] Stats print failed:', err.message);
        });
        lastLogTime = now;
    }
}
// Convenience helpers
log.info = (message, context) => log('info', message, context);
log.warn = (message, context) => log('warn', message, context);
log.error = (message, context) => log('error', message, context);
log.success = (message, context) => log('success', message, context);
log.detail = (message, context) => log('detail', message, context);
function report(title, meta = {}, level = 'info') {
    const label = LOG_LABEL[level] || LOG_LABEL.info;
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log(`[${label}] ═══ ${title} ═══`);
    // Forward to Loki
    forwardToLoki(level, title, meta);
    if (meta && typeof meta === 'object') {
        const entries = Object.entries(meta);
        if (entries.length > 0) {
            for (const [key, value] of entries) {
                // eslint-disable-next-line no-console
                console.log(`  ${key}: ${value}`);
            }
        }
    }
    // eslint-disable-next-line no-console
    console.log('');
    const now = Date.now();
    if (now - lastLogTime >= REFRESH_INTERVAL_MS) {
        printStats().catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[logger] Stats print failed:', err.message);
        });
        lastLogTime = now;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Auto-Refresh Management
// ─────────────────────────────────────────────────────────────────────────────
function startAutoRefresh() {
    if (logIntervalHandle)
        return;
    refreshStats()
        .then(() => printStats())
        .catch(err => {
        // eslint-disable-next-line no-console
        console.warn('[logger] Initial stats failed:', err.message);
    });
    logIntervalHandle = setInterval(() => {
        printStats().catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[logger] Stats refresh failed:', err.message);
        });
    }, REFRESH_INTERVAL_MS);
    if (logIntervalHandle.unref) {
        logIntervalHandle.unref();
    }
}
function stopAutoRefresh() {
    if (logIntervalHandle) {
        clearInterval(logIntervalHandle);
        logIntervalHandle = null;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
export { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };
export default { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };
