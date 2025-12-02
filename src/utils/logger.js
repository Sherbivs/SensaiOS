/**
 * Legacy Logger System - Console Telemetry
 * 
 * ⚠️ **DEPRECATED** — This file is being replaced by the standardized logging system.
 * 
 * **Replacement:** Use `src/shared/logger.ts` with LOGGING-STANDARD.md vocabulary
 * 
 * **Migration Path:**
 * 1. Replace logger.js functions with logger.info/error/warn from src/shared/logger.ts
 * 2. Replace printStats() with logger telemetry (built-in database stats)
 * 3. Replace printSection() with logger.info() calls with structured context
 * 4. Auto-refresh handled by logger.ts (no manual intervals needed)
 * 
 * **Why Deprecated:**
 * - OLD: Console-based telemetry, manual stats refresh, no persistence (ephemeral)
 * - NEW: TimescaleDB persistence, correlation tracking, type-safe vocabulary
 * - NEW approach integrates with Worker Manager for unified observability
 * 
 * **Removal Timeline:** After 100% logger.ts adoption (Task 9 Phase 5 complete)
 * 
 * @module utils/logger
 * @deprecated Use src/shared/logger.ts instead
 */

import fs from 'node:fs';
import path from 'node:path';
import { resourceMonitor } from '../services/monitoring/resource-monitor.js';
import { formatBytes, formatUptime, extractDatabaseName } from '../shared/utils/index.js';

// Import error tracker for integration
let errorTracker = null;

/**
 * Lazy-load error tracker to avoid circular dependencies.
 * Error tracker may not be available during early startup phases.
 */
async function getErrorTracker() {
  if (errorTracker) return errorTracker;
  
  try {
    const errorTrackerModule = await import('../services/monitoring/error-tracker.js');
    errorTracker = errorTrackerModule.errorTracker;
    return errorTracker;
  } catch {
    // Error tracker not available (early startup or testing environment)
    return null;
  }
}

// ============================================================================
// Constants & Configuration
// ============================================================================

const LOG_LABEL = Object.freeze({
  success: 'SUCCESS',
  info: 'INFO',
  warn: 'WARN',
  detail: 'DETAIL',
  error: 'ERROR',
});

const REFRESH_INTERVAL_MS = 15_000;
const _STATS_CHANGE_THRESHOLD = 0.1; // Reserved for future use
const LATENCY_CHANGE_THRESHOLD_MS = 5; // 5ms change triggers re-print

// Metric unavailability reasons (for transparency)
const METRIC_UNAVAILABLE = Object.freeze({
  NOT_QUERIED_YET: 'not-queried-yet',      // Provider not initialized
  INITIALIZING: 'initializing',             // Provider loading
  NO_PROVIDER: 'no-provider',               // No stats provider available
  QUERY_FAILED: 'query-failed',             // Stats query threw error
  NOT_CONNECTED: 'not-connected',           // Database not connected
  DISABLED: 'disabled',                     // Feature disabled
  NOT_APPLICABLE: 'n/a',                    // Not relevant to this service
});

// ============================================================================
// Database Stats Provider (Deferred Initialization)
// ============================================================================

let getDatabaseStats = null;
let databaseStatsProvider = 'none';
let databaseStatsInitialized = false;

/**
 * Initialize database stats provider asynchronously.
 * This is called once during the first stats collection to avoid top-level await.
 */
async function initializeDatabaseStatsProvider() {
  if (databaseStatsInitialized) return;
  databaseStatsInitialized = true;
  
  try {
    // Try Prisma first (primary database client)
    const prismaModule = await import('../shared/prisma.js');
    if (typeof prismaModule.getDatabaseStats === 'function') {
      getDatabaseStats = prismaModule.getDatabaseStats;
      databaseStatsProvider = 'prisma';
      console.info('[logger] Database stats provider: Prisma (primary)');
      return;
    }
  } catch {
    // Prisma not available, try fallback
  }
  
  try {
    // Fallback to pg-connection if Prisma unavailable
    const pgModule = await import('../shared/pg-connection.js');
    if (typeof pgModule.getDatabaseStats === 'function') {
      getDatabaseStats = pgModule.getDatabaseStats;
      databaseStatsProvider = 'pg-connection';
      console.info('[logger] Database stats provider: pg-connection (fallback)');
      return;
    }
  } catch {
    // Both providers unavailable
  }
  
  // If we get here, no provider is available
  console.warn('[logger] Database stats unavailable - both Prisma and pg-connection failed to load');
}

// ============================================================================
// Service Detection
// ============================================================================

/**
 * Detect which Render service this process is running in.
 * Used to conditionally show/hide service-specific stats.
 */
function detectServiceType() {
  const serviceName = process.env.RENDER_SERVICE_NAME || process.env.SERVICE_NAME || '';
  return {
    isSecurityBot: serviceName.includes('security'),
    isMainBot: serviceName.includes('bots') && !serviceName.includes('security'),
    isWorker: serviceName.includes('worker') || serviceName.includes('cache') || serviceName.includes('data-pipeline'),
    isWeb: serviceName.includes('web'),  // Removed reference to deleted 'infinity-gauntlet-bot' web service
    serviceName: serviceName || 'unknown',
  };
}

// ============================================================================
// State Management
// ============================================================================

let logIntervalHandle = null;
let lastLogTime = 0;
let previousStats = null; // Track previous stats for change detection
let statsCache = {
  node: null,
  databases: null,
  security: null,
  errors: null,
  lastRefresh: 0,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format bytes into human-readable string.
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "154.02 MB")
 */
// formatBytes now imported from shared/utils/format-utils.js (centralized)

/**
 * Format milliseconds into human-readable uptime.
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted uptime (e.g., "2m 34s")
 */
// formatUptime now imported from shared/utils/format-utils.js (centralized)

/**
 * Extract database name from connection string for observability.
 * @param {string} connectionString - Database URL
 * @returns {string|null} Database name or null if unparseable
 */
// extractDatabaseName now imported from shared/utils/url-utils.js (centralized)

/**
 * Check if stats have changed significantly (for deduplication).
 * @param {object} current - Current stats
 * @param {object} previous - Previous stats (shallow reference comparison only)
 * @returns {boolean} True if significant change detected
 * 
 * MEMORY OPTIMIZATION: Only checks specific fields instead of deep cloning entire stats object.
 * This prevents 1-2 MB allocations every 15 seconds (stats object is ~1-2 MB serialized).
 */
function hasSignificantChange(current, previous) {
  if (!previous) return true; // First run
  
  // Check database status changes (updated for new structure)
  if (current.databases?.master?.status !== previous.databases?.master?.status) return true;
  if (current.databases?.engineRead?.status !== previous.databases?.engineRead?.status) return true;
  if (current.databases?.engineWrite?.status !== previous.databases?.engineWrite?.status) return true;
  
  // Check latency changes (>5ms difference)
  const currentMasterLatency = parseFloat(current.databases?.master?.latency) || 0;
  const previousMasterLatency = parseFloat(previous.databases?.master?.latency) || 0;
  if (Math.abs(currentMasterLatency - previousMasterLatency) > LATENCY_CHANGE_THRESHOLD_MS) return true;
  
  // Check security bot status changes
  if (current.security?.status !== previous.security?.status) return true;
  
  // Check memory changes (>50MB difference to avoid noise)
  const currentRss = current.node?.memory?.rss || 0;
  const previousRss = previous.node?.memory?.rss || 0;
  if (Math.abs(currentRss - previousRss) > 50 * 1024 * 1024) return true; // 50 MB threshold
  
  return false;
}

// ============================================================================
// Stats Collection Functions
// ============================================================================

/**
 * Collect Node.js process statistics.
 * @returns {object} Node stats (uptime, memory, CPU, PID, version)
 */

/**
 * Collect Node.js process statistics.
 * @returns {object} Node stats (uptime, memory, CPU, PID, version)
 */
function collectNodeStats() {
  // Get real-time metrics from resource monitor
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

/**
 * Collect cache and resource usage statistics from resource monitor.
 * @returns {object} Cache and resource stats
 */
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
  };
}

/**
 * Collect database connection statistics with health checks.
 * Initializes the database stats provider on first call.
 * Returns metrics with explicit unavailability reasons when data cannot be queried.
 * @returns {Promise<object>} Database stats for MASTER (PROD), LOCAL (Engine DBs), ONPREMISE-DEV, ONPREMISE-EXPERIMENT
 */
async function collectDatabaseStats() {
  // Initialize provider on first call (deferred loading to avoid top-level await)
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
  
  // Provider not loaded yet or unavailable
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
    
    // Connection not initialized yet
    if (!stats || stats.error) {
      defaultReturn.master.status = METRIC_UNAVAILABLE.NOT_CONNECTED;
      defaultReturn.master.latencyReason = METRIC_UNAVAILABLE.NOT_CONNECTED;
      defaultReturn.master.sourceReason = METRIC_UNAVAILABLE.NOT_CONNECTED;
      return defaultReturn;
    }
    
    // Format MASTER stats (PROD - unified Render database - PRIMARY for all operations)
    const masterLatency = stats.prod.latency !== null && stats.prod.latency !== undefined
      ? stats.prod.latency
      : null;
    const masterLatencyReason = masterLatency === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null;
    
    const masterSource = stats.prod.source || null;
    const masterSourceReason = masterSource === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null;
    
    // Format ONPREMISE-DEV stats (optional workstation development)
    const onPremiseDevLatency = stats.onPremiseDev.latency !== null && stats.onPremiseDev.latency !== undefined
      ? stats.onPremiseDev.latency
      : null;
    const onPremiseDevLatencyReason = stats.onPremiseDev.status === 'disabled' 
      ? METRIC_UNAVAILABLE.DISABLED 
      : (onPremiseDevLatency === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null);
    
    const onPremiseDevSource = stats.onPremiseDev.source || null;
    const onPremiseDevSourceReason = stats.onPremiseDev.status === 'disabled'
      ? METRIC_UNAVAILABLE.DISABLED
      : (onPremiseDevSource === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null);
    
    // Format ONPREMISE-EXPERIMENT stats (optional workstation testing)
    const onPremiseExperimentLatency = stats.onPremiseExperiment?.latency !== null && stats.onPremiseExperiment?.latency !== undefined
      ? stats.onPremiseExperiment.latency
      : null;
    const onPremiseExperimentLatencyReason = stats.onPremiseExperiment?.status === 'disabled' 
      ? METRIC_UNAVAILABLE.DISABLED 
      : (onPremiseExperimentLatency === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null);
    
    const onPremiseExperimentSource = stats.onPremiseExperiment?.source || null;
    const onPremiseExperimentSourceReason = stats.onPremiseExperiment?.status === 'disabled'
      ? METRIC_UNAVAILABLE.DISABLED
      : (onPremiseExperimentSource === null ? METRIC_UNAVAILABLE.NOT_QUERIED_YET : null);
    
    // Collect Engine DB stats (SQLite databases on persistent disk)
    let engineReadStats = { status: 'n/a', latency: null, entries: null };
    let engineWriteStats = { status: 'n/a', latency: null, entries: null };
    
    try {
      const engineReadDb = await import('../services/database/engine-read-db.js');
      if (typeof engineReadDb.getStats === 'function') {
        engineReadStats = engineReadDb.getStats();
      }
    } catch {
      // Engine Read-DB not available (expected in non-production environments)
    }
    
    try {
      const engineWriteDb = await import('../services/database/engine-write-db.js');
      if (typeof engineWriteDb.getStats === 'function') {
        engineWriteStats = engineWriteDb.getStats();
      }
    } catch {
      // Engine Write-DB not available (expected in non-production environments)
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
        latency: engineReadStats.latency || null,
        latencyReason: engineReadStats.latency ? null : METRIC_UNAVAILABLE.NOT_APPLICABLE,
        entries: engineReadStats.pokemonCount || null,
        entriesReason: engineReadStats.pokemonCount ? null : METRIC_UNAVAILABLE.NOT_APPLICABLE,
      },
      engineWrite: {
        status: engineWriteStats.status || 'n/a',
        latency: engineWriteStats.latency || null,
        latencyReason: engineWriteStats.latency ? null : METRIC_UNAVAILABLE.NOT_APPLICABLE,
        entries: engineWriteStats.battleLogCount || null,
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
  } catch (error) {
    // Catch-all for unexpected errors during stats collection
    console.warn('[logger] Error collecting database stats:', error.message);
    
    // Track error in error tracker for visibility
    getErrorTracker()
      .then(tracker => {
        if (tracker) {
          tracker.captureError(error, {
            service: 'logger',
            operation: 'collectDatabaseStats',
            category: 'DATABASE',
            severity: 'MEDIUM',
          }).catch(trackErr => {
            // Error tracker itself failed - just log it
            console.warn('[logger] Failed to track database stats error:', trackErr.message);
          });
        }
      })
      .catch(() => {
        // Error tracker not available - continue without tracking
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

/**
 * Collect security bot statistics.
 * Returns null if security bot is not applicable to this service.
 * @returns {object|null} Security bot stats or null if not applicable
 */
function collectSecurityBotStats() {
  const serviceInfo = detectServiceType();
  
  // Check if we're running INSIDE the security bot process
  if (typeof global.securityBotState === 'object' && global.securityBotState) {
    const botState = global.securityBotState;
    const client = global.securityBotClient;
    
    // Collect runtime stats from client
    const guildCount = client?.guilds?.cache?.size || 0;
    const isReady = client?.isReady?.() || false;
    
    // Collect state-based stats if available
    if (botState.stats) {
      const _totalSweeps = botState.stats.totalSweeps || 0; // Reserved for future use
      const totalPermissionChanges = botState.stats.totalPermissionChanges || 0;
      const totalAlerts = botState.stats.totalAlerts || 0;
      
      // Get last sweep time from timeline
      let lastSweepTime = 'never';
      // Note: botState.timeline is an array directly, not botState.timeline.events
      if (Array.isArray(botState.timeline) && botState.timeline.length > 0) {
        const sweepEvents = botState.timeline
          .filter(e => e.type === 'sweep')
          .sort((a, b) => {
            // Handle both ISO string and numeric timestamps
            const tsA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp;
            const tsB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp;
            return tsB - tsA;
          });
        
        if (sweepEvents.length > 0) {
          const lastSweep = sweepEvents[0];
          // Convert ISO string to timestamp if needed
          const lastSweepTs = typeof lastSweep.timestamp === 'string' 
            ? new Date(lastSweep.timestamp).getTime() 
            : lastSweep.timestamp;
          const elapsed = Date.now() - lastSweepTs;
          if (elapsed < 60000) {
            lastSweepTime = `${Math.round(elapsed / 1000)}s ago`;
          } else if (elapsed < 3600000) {
            lastSweepTime = `${Math.round(elapsed / 60000)}m ago`;
          } else {
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
    
    // Fallback: basic stats from client only
    return {
      status: isReady ? 'online' : 'connecting',
      guilds: guildCount,
      lastSweep: 'n/a',
      assignments: 0,
      failures: 0,
    };
  }
  
  // Check if this service SHOULD run security bot
  if (serviceInfo.isSecurityBot) {
    // Expected to run but not initialized yet
    return {
      status: 'loading',
      guilds: 0,
      lastSweep: 'n/a',
      assignments: 0,
      failures: 0,
    };
  }
  
  // Try to read state from persisted file (cross-worker visibility)
  try {
    const stateFile = process.env.IS_RENDER
      ? '/Store/security-bot-state/current.json'
      : path.resolve(__dirname, '../../Store/security-bot-state/current.json');
    
    if (fs.existsSync(stateFile)) {
      const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const cumulative = stateData.cumulative || {};
      const timeline = stateData.timeline || [];
      
      // Get last sweep time from timeline
      let lastSweepTime = 'n/a';
      if (Array.isArray(timeline) && timeline.length > 0) {
        const sweepEvents = timeline
          .filter(e => e.type === 'sweep')
          .sort((a, b) => {
            const tsA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp;
            const tsB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp;
            return tsB - tsA;
          });
        
        if (sweepEvents.length > 0) {
          const lastSweep = sweepEvents[0];
          const lastSweepTs = typeof lastSweep.timestamp === 'string' 
            ? new Date(lastSweep.timestamp).getTime() 
            : lastSweep.timestamp;
          const elapsed = Date.now() - lastSweepTs;
          if (elapsed < 60000) {
            lastSweepTime = `${Math.round(elapsed / 1000)}s ago`;
          } else if (elapsed < 3600000) {
            lastSweepTime = `${Math.round(elapsed / 60000)}m ago`;
          } else {
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
  } catch {
    // File read failed, silently continue
  }
  
  // Security bot not applicable to this service - hide section
  return null;
}

// ============================================================================
// Error Stats Collection (Error Detection System Integration)
// ============================================================================

/**
 * Collect error statistics from ErrorTracker service.
 * Returns last 10 unique errors with occurrence counts and metadata.
 * @returns {Promise<object>} Error statistics or unavailability status
 */
async function collectErrorStats() {
  try {
    // Dynamic import to avoid circular dependency
    const errorTrackerModule = await import('../services/monitoring/error-tracker.js');
    const { errorTracker } = errorTrackerModule;
    
    if (!errorTracker) {
      return {
        status: METRIC_UNAVAILABLE.NO_PROVIDER,
        recentErrors: [],
        summary: null,
      };
    }
    
    // Get stats for last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const stats = await errorTracker.getErrorStats(oneHourAgo);
    
    // Get top 10 recent errors (limit as first param, filters as second)
    const topErrors = await errorTracker.getRecentErrors(10, {
      since: oneHourAgo,
    });
    
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
        name: err.errorName,
        message: err.errorMessage,
        count: err.occurrenceCount,
        lastSeen: err.lastSeen,
        impactedFeatures: err.impactedFeatures || [],
        recoveryAttempts: err.recoveryAttempts,
        recoverySuccesses: err.recoverySuccesses,
      })),
    };
    
  } catch (error) {
    // ErrorTracker not available or query failed
    return {
      status: METRIC_UNAVAILABLE.QUERY_FAILED,
      statusReason: error.message,
      recentErrors: [],
      summary: null,
    };
  }
}

// ============================================================================
// Stats Display Functions
// ============================================================================

/**
 * Refresh cached stats if refresh interval has elapsed.
 * @returns {Promise<void>}
 */
async function refreshStats() {
  const now = Date.now();
  if (now - statsCache.lastRefresh < REFRESH_INTERVAL_MS) {
    return;
  }
  
  statsCache.node = collectNodeStats();
  statsCache.cache = collectCacheStats(); // NEW: Cache & resource metrics
  statsCache.databases = await collectDatabaseStats(); // Now async
  statsCache.security = collectSecurityBotStats();
  statsCache.errors = await collectErrorStats(); // Now includes error monitoring
  statsCache.lastRefresh = now;
}

/**
 * Format a metric value with explicit unavailability reason when null.
 * @param {any} value - The metric value
 * @param {string|null} reason - The unavailability reason (from METRIC_UNAVAILABLE)
 * @param {function} formatter - Optional formatter for non-null values
 * @returns {string} Formatted string declaring why metric is unavailable if null
 */
function formatMetric(value, reason, formatter = null) {
  if (value === null || value === undefined) {
    // Explicitly declare why metric cannot be queried
    return `<unavailable: ${reason || 'unknown'}>`;
  }
  
  // Apply formatter with error handling
  if (formatter) {
    try {
      return formatter(value);
    } catch {
      // Formatter failed (e.g., trying to call .toFixed() on non-number)
      return `<unavailable: formatter-error>`;
    }
  }
  
  return String(value);
}

/**
 * Format time elapsed since a given date into human-readable string.
 * @param {Date} date - The past date
 * @returns {string} Formatted time (e.g., "2m", "1h", "3d")
 */
function formatTimeSince(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffDay > 0) return `${diffDay}d`;
  if (diffHour > 0) return `${diffHour}h`;
  if (diffMin > 0) return `${diffMin}m`;
  return `${diffSec}s`;
}

/**
 * Print comprehensive stats to console.
 * Uses change detection to avoid spamming identical output.
 * ALL metrics are either queried live or explicitly declared unavailable with reason.
 * @returns {Promise<void>}
 */
async function printStats() {
  await refreshStats();
  
  // Skip printing if stats not ready
  if (!statsCache.databases || !statsCache.node || !statsCache.security || !statsCache.cache) {
    return;
  }
  
  // Skip printing if no significant changes detected
  if (!hasSignificantChange(statsCache, previousStats)) {
    return;
  }
  
  // MEMORY OPTIMIZATION: Store shallow reference only (not deep clone)
  // We only check specific fields in hasSignificantChange(), so we don't need
  // a full deep clone that allocates 1-2 MB every 15 seconds.
  // Previous behavior: deepClone(statsCache) = 1-2 MB allocation every 15 seconds = ~5 MB/min
  // New behavior: shallow reference = 0 allocation, just pointer swap
  previousStats = statsCache;
  
  const lines = [];
  
  // Top border
  lines.push('');
  lines.push('─────────────────────────────────────────────────────────────────────────');
  lines.push('');
  
  // -------------------------------------------------------------------------
  // Node Stats - All metrics queried from Node.js runtime (process.memoryUsage, process.cpuUsage, process.uptime)
  // -------------------------------------------------------------------------
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
  
  // -------------------------------------------------------------------------
  // Cache & Resource Stats - Real-time metrics from resource monitor
  // NOTE: Cache stats below show DISK usage (persistent /Store), not RAM
  // -------------------------------------------------------------------------
  lines.push('[CACHE & RESOURCES - Persistent Disk]');
  lines.push(`  Cache Directory: ${statsCache.cache.cacheDir}`);
  lines.push(`  Cache Size: ${statsCache.cache.cacheSize} / ${statsCache.cache.cacheBudgetMax} (${statsCache.cache.cacheBudgetPercent})`);
  lines.push(`  Cache Free: ${statsCache.cache.approxFree}`);
  lines.push('');
  lines.push(`  Workspace Limit: ${statsCache.cache.workspaceLimit} ← 1 GB persistent disk`);
  lines.push(`  Workspace Free:  ${statsCache.cache.workspaceFree}`);
  lines.push('');
  lines.push(`  Disk Total: ${statsCache.cache.diskTotal}`);
  lines.push(`  Disk Free:  ${statsCache.cache.diskFree}`);
  lines.push('');
  
  // -------------------------------------------------------------------------
  // Database Stats - Metrics queried from getDatabaseStats() or declared unavailable
  // MASTER = Production PostgreSQL (Render managed - single source of truth)
  // LOCAL = Engine DBs on persistent disk (Read-DB + Write-DB for game engine)
  // ONPREMISE = Workstation development/testing databases (not visible in production)
  // -------------------------------------------------------------------------
  lines.push('[DATABASE]');
  
  // MASTER database (PROD PostgreSQL - single source of truth)
  const masterStatus = statsCache.databases.master.status.toUpperCase().padEnd(12);
  const masterLatency = formatMetric(
    statsCache.databases.master.latency,
    statsCache.databases.master.latencyReason,
    (val) => `${val.toFixed(2)}ms`
  );
  const masterSource = formatMetric(
    statsCache.databases.master.source,
    statsCache.databases.master.sourceReason
  );
  lines.push(`  MASTER = ${masterStatus}  Latency: ${masterLatency.padEnd(30)}  Database: ${masterSource}`);
  
  // LOCAL databases (Engine DBs on persistent disk - production perspective)
  const engineReadStatus = statsCache.databases.engineRead.status.toUpperCase().padEnd(12);
  const engineReadLatency = formatMetric(
    statsCache.databases.engineRead.latency,
    statsCache.databases.engineRead.latencyReason,
    (val) => `${val.toFixed(2)}ms`
  );
  const engineReadEntries = formatMetric(
    statsCache.databases.engineRead.entries,
    statsCache.databases.engineRead.entriesReason
  );
  lines.push(`  LOCAL-R = ${engineReadStatus}  Latency: ${engineReadLatency.padEnd(30)}  Pokemon: ${engineReadEntries}`);
  
  const engineWriteStatus = statsCache.databases.engineWrite.status.toUpperCase().padEnd(12);
  const engineWriteLatency = formatMetric(
    statsCache.databases.engineWrite.latency,
    statsCache.databases.engineWrite.latencyReason,
    (val) => `${val.toFixed(2)}ms`
  );
  const engineWriteEntries = formatMetric(
    statsCache.databases.engineWrite.entries,
    statsCache.databases.engineWrite.entriesReason
  );
  lines.push(`  LOCAL-W = ${engineWriteStatus}  Latency: ${engineWriteLatency.padEnd(30)}  Battles: ${engineWriteEntries}`);
  
  // ONPREMISE databases (workstation development/testing - NOT production visible)
  const serviceInfo = detectServiceType();
  if (!serviceInfo.isWeb && !serviceInfo.isWorker) {
    // Only show ONPREMISE databases on workstation (not in Render production)
    const onPremiseDevStatus = statsCache.databases.onPremiseDev.status.toUpperCase().padEnd(12);
    const onPremiseDevLatency = formatMetric(
      statsCache.databases.onPremiseDev.latency,
      statsCache.databases.onPremiseDev.latencyReason,
      (val) => `${val.toFixed(2)}ms`
    );
    const onPremiseDevSource = formatMetric(
      statsCache.databases.onPremiseDev.source,
      statsCache.databases.onPremiseDev.sourceReason
    );
    lines.push(`  ONPREM-D = ${onPremiseDevStatus}  Latency: ${onPremiseDevLatency.padEnd(30)}  Database: ${onPremiseDevSource}`);
    
    const onPremiseExpStatus = statsCache.databases.onPremiseExperiment.status.toUpperCase().padEnd(12);
    const onPremiseExpLatency = formatMetric(
      statsCache.databases.onPremiseExperiment.latency,
      statsCache.databases.onPremiseExperiment.latencyReason,
      (val) => `${val.toFixed(2)}ms`
    );
    const onPremiseExpSource = formatMetric(
      statsCache.databases.onPremiseExperiment.source,
      statsCache.databases.onPremiseExperiment.sourceReason
    );
    lines.push(`  ONPREM-E = ${onPremiseExpStatus}  Latency: ${onPremiseExpLatency.padEnd(30)}  Database: ${onPremiseExpSource}`);
  }
  
  lines.push('');
  
  // -------------------------------------------------------------------------
  // Security Bot Stats (only if applicable to this service) - Metrics queried from global.securityBotState or declared unavailable
  // -------------------------------------------------------------------------
  if (statsCache.security !== null) {
    lines.push('[SECURITY BOT]');
    const secStatus = String(statsCache.security.status).toUpperCase();
    const source = statsCache.security.source === 'persisted-state' ? ' (from persisted state)' : '';
    lines.push(`  Status: ${secStatus}${source}`);
    
    if (secStatus === 'ONLINE') {
      // All metrics queried from global.securityBotState or persisted file
      const stateSource = statsCache.security.source === 'persisted-state' ? 'persisted state file' : 'botState.timeline';
      lines.push(`  Guilds: ${statsCache.security.guilds} (queried from ${statsCache.security.source === 'persisted-state' ? 'state.cumulative' : 'client.guilds.cache.size'})`);
      lines.push(`  Last Sweep: ${statsCache.security.lastSweep} (queried from ${stateSource})`);
      lines.push('');
      lines.push(`  Lifetime Statistics (queried from ${statsCache.security.source === 'persisted-state' ? 'state.cumulative' : 'botState.stats'}):`);
      lines.push(`    Assignments: ${statsCache.security.assignments}`);
      lines.push(`    Failures:    ${statsCache.security.failures}`);
    } else if (secStatus === 'LOADING' || secStatus === 'INITIALIZING' || secStatus === 'CONNECTING') {
      lines.push('  <unavailable: bot-initializing>');
    } else {
      lines.push(`  <unavailable: ${statsCache.security.statusReason || 'unknown'}>`);
    }
    
    lines.push('');
  }
  
  // -------------------------------------------------------------------------
  // Error Monitoring Stats (from ErrorTracker service) - Last hour error tracking
  // -------------------------------------------------------------------------
  if (statsCache.errors) {
    lines.push('[ERROR MONITORING] (Last Hour)');
    
    if (statsCache.errors.status === 'ready' && statsCache.errors.summary) {
      const summary = statsCache.errors.summary;
      
      // Summary line with severity breakdown
      lines.push(`  🚨 CRITICAL: ${summary.criticalCount} unique | ⚠️  HIGH: ${summary.highCount} unique | 📊 MEDIUM: ${summary.mediumCount} unique | 📝 LOW: ${summary.lowCount} unique`);
      lines.push(`  Total: ${summary.totalUnique} unique errors | ${summary.totalOccurrences} occurrences | Rate: ${summary.errorRate.toFixed(2)}/min`);
      lines.push('');
      
      // Top errors (up to 5)
      if (statsCache.errors.recentErrors.length > 0) {
        lines.push('  Top Recent Errors:');
        const topErrors = statsCache.errors.recentErrors.slice(0, 5);
        
        topErrors.forEach(err => {
          const icon = err.severity === 'CRITICAL' ? '❌' : err.severity === 'HIGH' ? '⚠️ ' : err.severity === 'MEDIUM' ? '📊' : '📝';
          const timeSince = formatTimeSince(new Date(err.lastSeen));
          const recoveryInfo = err.recoveryAttempts > 0 
            ? ` | Recovery: ${err.recoverySuccesses}/${err.recoveryAttempts}`
            : '';
          
          lines.push(`    ${icon} [${err.severity}] ${err.name} (x${err.count}, ${timeSince} ago)${recoveryInfo}`);
          
          if (err.impactedFeatures && err.impactedFeatures.length > 0) {
            lines.push(`       → affecting: ${err.impactedFeatures.slice(0, 3).join(', ')}`);
          }
        });
      } else {
        lines.push('  ✅ No errors in last hour');
      }
      
      lines.push('');
      
      // Top categories (show top 3)
      const topCategories = Object.entries(summary.topCategories)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);
      
      if (topCategories.length > 0) {
        const categoryStr = topCategories.map(([cat, count]) => `${cat} (${count})`).join(', ');
        lines.push(`  Top Categories: ${categoryStr}`);
      }
      
    } else if (statsCache.errors.status === METRIC_UNAVAILABLE.QUERY_FAILED) {
      lines.push(`  <unavailable: ${statsCache.errors.statusReason || 'query-failed'}>`);
    } else if (statsCache.errors.status === METRIC_UNAVAILABLE.NO_PROVIDER) {
      lines.push('  <unavailable: error-tracker-not-loaded>');
    } else {
      lines.push(`  <unavailable: ${statsCache.errors.status}>`);
    }
    
    lines.push('');
  }
  
  // Bottom border
  lines.push('─────────────────────────────────────────────────────────────────────────');
  lines.push('');
  
  console.log(lines.join('\n'));
}

/**
 * Get formatted stats as string (for programmatic use).
 * ALL metrics are either queried live or explicitly declared unavailable with reason.
 * @returns {Promise<string>} Formatted stats with explicit unavailability declarations
 */
async function getFormattedStats() {
  await refreshStats();
  
  // Return empty string if stats not ready
  if (!statsCache.databases || !statsCache.node) {
    return '';
  }
  
  const lines = [];
  
  // Node Stats - All metrics queried from Node.js runtime
  lines.push(`[NODE]`);
  lines.push(`  Uptime: ${statsCache.node.uptime}`);
  lines.push(`  Process: PID ${statsCache.node.pid} | ${statsCache.node.version}`);
  lines.push(``);
  lines.push(`  Memory: RSS ${statsCache.node.memory.rss} | Heap ${statsCache.node.memory.heapUsed}/${statsCache.node.memory.heapTotal} | External ${statsCache.node.memory.external}`);
  lines.push(`  CPU: User ${statsCache.node.cpu.user} | System ${statsCache.node.cpu.system}`);
  lines.push('');
  
  // Database Stats - Metrics queried from getDatabaseStats() or declared unavailable
  // MASTER = Production PostgreSQL (Render managed - single source of truth)
  // LOCAL = Engine DBs on persistent disk (Read-DB + Write-DB)
  lines.push(`[DATABASE]`);
  
  // MASTER (PROD PostgreSQL)
  const masterLatency = formatMetric(
    statsCache.databases.master.latency,
    statsCache.databases.master.latencyReason,
    (val) => `${val.toFixed(2)}ms`
  );
  const masterSource = formatMetric(
    statsCache.databases.master.source,
    statsCache.databases.master.sourceReason
  );
  lines.push(`  MASTER → ${statsCache.databases.master.status} | Latency: ${masterLatency} | ${masterSource}`);
  
  // LOCAL-R (Engine Read-DB)
  const engineReadLatency = formatMetric(
    statsCache.databases.engineRead.latency,
    statsCache.databases.engineRead.latencyReason,
    (val) => `${val.toFixed(2)}ms`
  );
  const engineReadEntries = formatMetric(
    statsCache.databases.engineRead.entries,
    statsCache.databases.engineRead.entriesReason
  );
  lines.push(`  LOCAL-R → ${statsCache.databases.engineRead.status} | Latency: ${engineReadLatency} | Pokemon: ${engineReadEntries}`);
  
  // LOCAL-W (Engine Write-DB)
  const engineWriteLatency = formatMetric(
    statsCache.databases.engineWrite.latency,
    statsCache.databases.engineWrite.latencyReason,
    (val) => `${val.toFixed(2)}ms`
  );
  const engineWriteEntries = formatMetric(
    statsCache.databases.engineWrite.entries,
    statsCache.databases.engineWrite.entriesReason
  );
  lines.push(`  LOCAL-W → ${statsCache.databases.engineWrite.status} | Latency: ${engineWriteLatency} | Battles: ${engineWriteEntries}`);
  
  return lines.join('\n');
}

// ============================================================================
// Logging Functions
// ============================================================================

/**
 * Log a message with context and automatic stats refresh.
 * @param {string} level - Log level (info, warn, error, success, detail)
 * @param {string} message - Log message
 * @param {object} context - Optional context object to display
 */
function log(level, message, context) {
  const label = LOG_LABEL[level] || LOG_LABEL.info;
  
  console.log(`[${label}] ${message}`);
  
  if (context && typeof context === 'object') {
    const keys = Object.keys(context);
    if (keys.length > 0) {
      for (const key of keys) {
        console.log(`  ${key}: ${JSON.stringify(context[key])}`);
      }
    }
  }
  
  // Print stats on interval (fire-and-forget)
  const now = Date.now();
  if (now - lastLogTime >= REFRESH_INTERVAL_MS) {
    printStats().catch(err => console.warn('[logger] Stats print failed:', err.message));
    lastLogTime = now;
  }
}

// Convenience helpers (maintain compatibility with log.warn / log.error usage)
log.info = (message, context, options) => log('info', message, context, options);
log.warn = (message, context, options) => log('warn', message, context, options);
log.error = (message, context, options) => log('error', message, context, options);
log.success = (message, context, options) => log('success', message, context, options);
log.detail = (message, context, options) => log('detail', message, context, options);

/**
 * Report a structured event with metadata.
 * @param {string} title - Report title
 * @param {object} meta - Metadata key-value pairs
 * @param {string} level - Log level (default: 'info')
 */
function report(title, meta = {}, level = 'info') {
  const label = LOG_LABEL[level] || LOG_LABEL.info;
  
  console.log('');
  console.log(`[${label}] ═══ ${title} ═══`);
  
  if (meta && typeof meta === 'object') {
    const entries = Object.entries(meta);
    if (entries.length > 0) {
      for (const [key, value] of entries) {
        console.log(`  ${key}: ${value}`);
      }
    }
  }
  
  console.log('');
  
  // Print stats on interval (fire-and-forget)
  const now = Date.now();
  if (now - lastLogTime >= REFRESH_INTERVAL_MS) {
    printStats().catch(err => console.warn('[logger] Stats print failed:', err.message));
    lastLogTime = now;
  }
}

// ============================================================================
// ============================================================================
// Auto-Refresh Management
// ============================================================================

/**
 * Start automatic stats refresh on interval.
 * Stats will be printed every REFRESH_INTERVAL_MS if significant changes detected.
 */
function startAutoRefresh() {
  if (logIntervalHandle) return;
  
  // Initial stats collection and print (fire-and-forget)
  refreshStats()
    .then(() => printStats())
    .catch(err => console.warn('[logger] Initial stats failed:', err.message));
  
  // Set up interval with error handling
  logIntervalHandle = setInterval(() => {
    printStats().catch(err => console.warn('[logger] Stats refresh failed:', err.message));
  }, REFRESH_INTERVAL_MS);
  
  // Allow process to exit even if interval is active
  if (logIntervalHandle.unref) {
    logIntervalHandle.unref();
  }
}

/**
 * Stop automatic stats refresh.
 */
function stopAutoRefresh() {
  if (logIntervalHandle) {
    clearInterval(logIntervalHandle);
    logIntervalHandle = null;
  }
}

// ============================================================================
// Initialization
// ============================================================================

// NOTE: Auto-refresh is NOT started on module load to avoid race condition
// where logger tries to import error-tracker before Service Registry initializes.
// Call startAutoRefresh() explicitly from src/index.ts after registry.initializeAll().
//
// Previously: startAutoRefresh() called here caused "degraded" warnings for
// error-tracker, engine-cache, engine-write-buffer during first 10-20 seconds.

// ============================================================================
// Exports
// ============================================================================

export { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };

export default { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };
