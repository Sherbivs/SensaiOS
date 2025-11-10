import os from 'node:os';
import { performance } from 'node:perf_hooks';

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
const STATS_CHANGE_THRESHOLD = 0.1; // 10% change triggers re-print
const LATENCY_CHANGE_THRESHOLD_MS = 5; // 5ms change triggers re-print

// ============================================================================
// Database Stats Provider (Top-Level Initialization)
// ============================================================================

let getDatabaseStats = null;
let databaseStatsProvider = 'none';

// Load database stats provider synchronously to avoid race conditions
try {
  // Try Prisma first (primary database client)
  const prismaModule = await import('../shared/prisma.js');
  if (typeof prismaModule.getDatabaseStats === 'function') {
    getDatabaseStats = prismaModule.getDatabaseStats;
    databaseStatsProvider = 'prisma';
    console.info('[logger] Database stats provider: Prisma (primary)');
  }
} catch (prismaError) {
  try {
    // Fallback to pg-connection if Prisma unavailable
    const pgModule = await import('../shared/pg-connection.js');
    if (typeof pgModule.getDatabaseStats === 'function') {
      getDatabaseStats = pgModule.getDatabaseStats;
      databaseStatsProvider = 'pg-connection';
      console.info('[logger] Database stats provider: pg-connection (fallback)');
    }
  } catch (pgError) {
    console.warn('[logger] Database stats unavailable - both Prisma and pg-connection failed to load');
    console.warn('[logger] Prisma error:', prismaError.message);
    console.warn('[logger] pg-connection error:', pgError.message);
  }
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
    isWeb: serviceName.includes('web') || serviceName === 'infinity-gauntlet-bot',
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
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Format milliseconds into human-readable uptime.
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted uptime (e.g., "2m 34s")
 */
function formatUptime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Extract database name from connection string for observability.
 * @param {string} connectionString - Database URL
 * @returns {string} Database name or 'unknown'
 */
function extractDatabaseName(connectionString) {
  if (!connectionString || typeof connectionString !== 'string') {
    return 'unknown';
  }
  
  try {
    // PostgreSQL URL format: postgresql://user:pass@host:port/dbname?params
    const match = connectionString.match(/\/([^/?]+)(\?|$)/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (error) {
    // Ignore parsing errors
  }
  
  return 'unknown';
}

/**
 * Check if stats have changed significantly (for deduplication).
 * @param {object} current - Current stats
 * @param {object} previous - Previous stats
 * @returns {boolean} True if significant change detected
 */
function hasSignificantChange(current, previous) {
  if (!previous) return true; // First run
  
  // Check database status changes
  if (current.databases.prod.status !== previous.databases.prod.status) return true;
  if (current.databases.local.status !== previous.databases.local.status) return true;
  
  // Check latency changes (>5ms difference)
  const currentProdLatency = parseFloat(current.databases.prod.latency) || 0;
  const previousProdLatency = parseFloat(previous.databases.prod.latency) || 0;
  if (Math.abs(currentProdLatency - previousProdLatency) > LATENCY_CHANGE_THRESHOLD_MS) return true;
  
  // Check security bot status changes
  if (current.security.status !== previous.security.status) return true;
  
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
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const uptime = process.uptime() * 1000;
  
  return {
    uptime: formatUptime(uptime),
    memory: {
      rss: formatBytes(mem.rss),
      heapUsed: formatBytes(mem.heapUsed),
      heapTotal: formatBytes(mem.heapTotal),
      external: formatBytes(mem.external),
    },
    cpu: {
      user: `${(cpu.user / 1000000).toFixed(2)}s`,
      system: `${(cpu.system / 1000000).toFixed(2)}s`,
    },
    pid: process.pid,
    version: process.version,
  };
}

/**
 * Collect database connection statistics with health checks.
 * @returns {object} Database stats for PROD and LOCAL connections
 */
function collectDatabaseStats() {
  // Provider not loaded yet
  if (typeof getDatabaseStats !== 'function') {
    return {
      prod: {
        status: 'loading',
        latency: 'n/a',
        connections: 'n/a',
        source: `(${databaseStatsProvider})`,
      },
      local: {
        status: 'disabled',
        latency: 'n/a',
        connections: 'n/a',
        source: 'n/a',
      },
    };
  }

  try {
    const stats = getDatabaseStats();
    
    // Connection not initialized yet
    if (!stats || stats.error) {
      return {
        prod: {
          status: 'initializing',
          latency: 'n/a',
          connections: 'n/a',
          source: 'n/a',
        },
        local: {
          status: 'disabled',
          latency: 'n/a',
          connections: 'n/a',
          source: 'n/a',
        },
      };
    }
    
    // Format PROD stats (unified Render database - PRIMARY for all operations)
    const prodLatency = stats.prod.latency !== null 
      ? `${stats.prod.latency.toFixed(2)}ms` 
      : 'n/a';
    
    // Extract database name from source if available
    const prodSource = stats.prod.source 
      ? extractDatabaseName(stats.prod.source)
      : 'n/a';
    
    // Format LOCAL stats (onPremiseDev - optional workstation development)
    const localLatency = stats.onPremiseDev.latency !== null
      ? `${stats.onPremiseDev.latency.toFixed(2)}ms`
      : 'n/a';
    
    const localSource = stats.onPremiseDev.source
      ? extractDatabaseName(stats.onPremiseDev.source)
      : 'n/a';
    
    return {
      prod: {
        status: stats.prod.status,
        latency: prodLatency,
        connections: stats.prod.connections !== null ? stats.prod.connections : 'n/a',
        source: prodSource,
      },
      local: {
        status: stats.onPremiseDev.status,
        latency: localLatency,
        connections: stats.onPremiseDev.connections !== null ? stats.onPremiseDev.connections : 'n/a',
        source: localSource,
      },
    };
  } catch (error) {
    // Catch-all for unexpected errors during stats collection
    console.warn('[logger] Error collecting database stats:', error.message);
    return {
      prod: {
        status: 'error',
        latency: 'n/a',
        connections: 'n/a',
        source: 'error',
      },
      local: {
        status: 'disabled',
        latency: 'n/a',
        connections: 'n/a',
        source: 'n/a',
      },
    };
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
      const totalSweeps = botState.stats.totalSweeps || 0;
      const totalPermissionChanges = botState.stats.totalPermissionChanges || 0;
      const totalAlerts = botState.stats.totalAlerts || 0;
      
      // Get last sweep time from timeline
      let lastSweepTime = 'never';
      if (botState.timeline?.events?.length > 0) {
        const sweepEvents = botState.timeline.events
          .filter(e => e.type === 'sweep')
          .sort((a, b) => b.timestamp - a.timestamp);
        
        if (sweepEvents.length > 0) {
          const lastSweep = sweepEvents[0];
          const elapsed = Date.now() - lastSweep.timestamp;
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
  
  // Security bot not applicable to this service - hide section
  return null;
}

// ============================================================================
// Stats Display Functions
// ============================================================================

/**
 * Refresh cached stats if refresh interval has elapsed.
 */

/**
 * Refresh cached stats if refresh interval has elapsed.
 */
function refreshStats() {
  const now = Date.now();
  if (now - statsCache.lastRefresh < REFRESH_INTERVAL_MS) {
    return;
  }
  
  statsCache.node = collectNodeStats();
  statsCache.databases = collectDatabaseStats();
  statsCache.security = collectSecurityBotStats();
  statsCache.lastRefresh = now;
}

/**
 * Print comprehensive stats to console.
 * Uses change detection to avoid spamming identical output.
 */
function printStats() {
  refreshStats();
  
  // Skip printing if no significant changes detected
  if (!hasSignificantChange(statsCache, previousStats)) {
    return;
  }
  
  // Store current stats for next comparison
  previousStats = JSON.parse(JSON.stringify(statsCache));
  
  const lines = [];
  
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════════════');
  lines.push('');
  
  // -------------------------------------------------------------------------
  // Node Stats
  // -------------------------------------------------------------------------
  lines.push(`[NODE]`);
  lines.push(`  Uptime: ${statsCache.node.uptime}`);
  lines.push(`  Process: PID ${statsCache.node.pid} | ${statsCache.node.version}`);
  lines.push(``);
  lines.push(`  Memory:`);
  lines.push(`    RSS:      ${statsCache.node.memory.rss}`);
  lines.push(`    Heap:     ${statsCache.node.memory.heapUsed} / ${statsCache.node.memory.heapTotal}`);
  lines.push(`    External: ${statsCache.node.memory.external}`);
  lines.push(``);
  lines.push(`  CPU:`);
  lines.push(`    User:   ${statsCache.node.cpu.user}`);
  lines.push(`    System: ${statsCache.node.cpu.system}`);
  lines.push('');
  
  // -------------------------------------------------------------------------
  // Database Stats
  // -------------------------------------------------------------------------
  lines.push(`[DATABASE]`);
  
  const prodStatus = statsCache.databases.prod.status.toUpperCase().padEnd(12);
  const prodLatency = statsCache.databases.prod.latency.padEnd(10);
  const prodSource = statsCache.databases.prod.source || 'n/a';
  lines.push(`  PROD  → ${prodStatus} Latency: ${prodLatency} Database: ${prodSource}`);
  
  const localStatus = statsCache.databases.local.status.toUpperCase().padEnd(12);
  const localLatency = statsCache.databases.local.latency.padEnd(10);
  const localSource = statsCache.databases.local.source || 'n/a';
  lines.push(`  LOCAL → ${localStatus} Latency: ${localLatency} Database: ${localSource}`);
  lines.push('');
  
  // -------------------------------------------------------------------------
  // Security Bot Stats (only if applicable to this service)
  // -------------------------------------------------------------------------
  if (statsCache.security !== null) {
    lines.push(`[SECURITY BOT]`);
    const secStatus = String(statsCache.security.status).toUpperCase();
    lines.push(`  Status: ${secStatus}`);
    
    if (secStatus === 'ONLINE') {
      lines.push(`  Guilds: ${statsCache.security.guilds}`);
      lines.push(`  Last Sweep: ${statsCache.security.lastSweep}`);
      lines.push(``);
      lines.push(`  Lifetime Statistics:`);
      lines.push(`    Assignments: ${statsCache.security.assignments}`);
      lines.push(`    Failures:    ${statsCache.security.failures}`);
    } else if (secStatus === 'LOADING' || secStatus === 'INITIALIZING' || secStatus === 'CONNECTING') {
      lines.push(`  (Initializing...)`);
    }
    
    lines.push('');
  }
  
  lines.push('───────────────────────────────────────────────────────────────────────────');
  lines.push('');
  
  console.log(lines.join('\n'));
}

/**
 * Get formatted stats as string (for programmatic use).
 * @returns {string} Formatted stats
 */

/**
 * Get formatted stats as string (for programmatic use).
 * @returns {string} Formatted stats
 */
function getFormattedStats() {
  refreshStats();
  
  const lines = [];
  
  // Node Stats
  lines.push(`[NODE]`);
  lines.push(`  Uptime: ${statsCache.node.uptime}`);
  lines.push(`  Process: PID ${statsCache.node.pid} | ${statsCache.node.version}`);
  lines.push(``);
  lines.push(`  Memory: RSS ${statsCache.node.memory.rss} | Heap ${statsCache.node.memory.heapUsed}/${statsCache.node.memory.heapTotal} | External ${statsCache.node.memory.external}`);
  lines.push(`  CPU: User ${statsCache.node.cpu.user} | System ${statsCache.node.cpu.system}`);
  lines.push('');
  
  // Database Stats
  lines.push(`[DATABASE]`);
  lines.push(`  PROD  → ${statsCache.databases.prod.status} | Latency: ${statsCache.databases.prod.latency} | ${statsCache.databases.prod.source}`);
  lines.push(`  LOCAL → ${statsCache.databases.local.status} | Latency: ${statsCache.databases.local.latency} | ${statsCache.databases.local.source}`);
  
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
 * @param {object} options - Optional configuration
 */
function log(level, message, context, options = {}) {
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
  
  // Print stats on interval
  const now = Date.now();
  if (now - lastLogTime >= REFRESH_INTERVAL_MS) {
    printStats();
    lastLogTime = now;
  }
}

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
  
  // Print stats on interval
  const now = Date.now();
  if (now - lastLogTime >= REFRESH_INTERVAL_MS) {
    printStats();
    lastLogTime = now;
  }
}

// ============================================================================
// Auto-Refresh Management
// ============================================================================

/**
 * Start automatic stats refresh on interval.
 * Stats will be printed every REFRESH_INTERVAL_MS if significant changes detected.
 */
function startAutoRefresh() {
  if (logIntervalHandle) return;
  
  // Initial stats collection and print
  refreshStats();
  printStats();
  
  // Set up interval
  logIntervalHandle = setInterval(() => {
    printStats();
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

// Auto-start stats refresh on module load
startAutoRefresh();

// ============================================================================
// Exports
// ============================================================================

export { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };

export default { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };
