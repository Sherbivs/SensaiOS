import os from 'node:os';
import { performance } from 'node:perf_hooks';

const LOG_LABEL = Object.freeze({
  success: 'SUCCESS',
  info: 'INFO',
  warn: 'WARN',
  detail: 'DETAIL',
  error: 'ERROR',
});

const REFRESH_INTERVAL_MS = 15_000;
const SPACER = '';

let getDatabaseStats = null;

// Dynamically load getDatabaseStats from pg-connection when available
(async () => {
  try {
    // Try pg-connection first (new PostgreSQL pool architecture)
    const pgConnectionModule = await import('../shared/pg-connection.js');
    if (typeof pgConnectionModule.getDatabaseStats === 'function') {
      getDatabaseStats = pgConnectionModule.getDatabaseStats;
      return;
    }
  } catch (error) {
    // pg-connection not available, try Prisma fallback
  }
  
  try {
    // Fallback to Prisma (legacy)
    const prismaModule = await import('../shared/prisma.js');
    if (typeof prismaModule.getDatabaseStats === 'function') {
      getDatabaseStats = prismaModule.getDatabaseStats;
    }
  } catch (error) {
    // Database stats not available
  }
})();

let logIntervalHandle = null;
let lastLogTime = 0;
let statsCache = {
  node: null,
  databases: null,
  security: null,
  lastRefresh: 0,
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

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

function collectDatabaseStats() {
  if (typeof getDatabaseStats !== 'function') {
    return {
      prod: {
        status: 'loading',
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

  try {
    const stats = getDatabaseStats();
    
    // If connection not initialized, return 'initializing' instead of error
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
    
    // Format LOCAL stats (onPremiseDev - optional workstation development)
    const localLatency = stats.onPremiseDev.latency !== null
      ? `${stats.onPremiseDev.latency.toFixed(2)}ms`
      : 'n/a';
    
    return {
      prod: {
        status: stats.prod.status,
        latency: prodLatency,
        connections: stats.prod.connections !== null ? stats.prod.connections : 'n/a',
        source: stats.prod.source || 'n/a',
      },
      local: {
        status: stats.onPremiseDev.status,
        latency: localLatency,
        connections: stats.onPremiseDev.connections !== null ? stats.onPremiseDev.connections : 'n/a',
        source: stats.onPremiseDev.source || 'n/a',
      },
    };
  } catch (error) {
    // Don't log errors during initialization - connection may not be ready yet
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
        source: 'error',
      },
    };
  }
}

function collectSecurityBotStats() {
  // Check if we're running INSIDE the security bot process
  // by looking for global state that security bot sets up
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
      
      // Get last sweep time from timeline or guild context
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
  
  // Not running in security bot process - return disabled status
  return {
    status: 'n/a',
    guilds: 'n/a',
    lastSweep: 'n/a',
    assignments: 'n/a',
    failures: 'n/a',
  };
}

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

function printStats() {
  refreshStats();
  
  const lines = [];
  
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════════════');
  lines.push('');
  
  // Node Stats
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
  
  // Database Stats
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
  
  // Security Bot Stats
  lines.push(`[SECURITY BOT]`);
  const secStatus = String(statsCache.security.status).toUpperCase();
  lines.push(`  Status: ${secStatus}`);
  
  if (secStatus !== 'N/A' && secStatus !== 'INITIALIZING') {
    lines.push(`  Guilds: ${statsCache.security.guilds}`);
    lines.push(`  Last Sweep: ${statsCache.security.lastSweep}`);
    lines.push(``);
    lines.push(`  Lifetime Statistics:`);
    lines.push(`    Assignments: ${statsCache.security.assignments}`);
    lines.push(`    Failures:    ${statsCache.security.failures}`);
  } else if (secStatus === 'N/A') {
    lines.push(`  (Security bot disabled)`);
  }
  
  lines.push('');
  lines.push('───────────────────────────────────────────────────────────────────────────');
  lines.push('');
  
  console.log(lines.join('\n'));
}

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
  
  const now = Date.now();
  if (now - lastLogTime >= REFRESH_INTERVAL_MS) {
    printStats();
    lastLogTime = now;
  }
}

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
  
  const now = Date.now();
  if (now - lastLogTime >= REFRESH_INTERVAL_MS) {
    printStats();
    lastLogTime = now;
  }
}

function startAutoRefresh() {
  if (logIntervalHandle) return;
  
  refreshStats();
  printStats();
  
  logIntervalHandle = setInterval(() => {
    printStats();
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

// Auto-start on import
startAutoRefresh();

export { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };

export default { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };
