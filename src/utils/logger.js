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

// Dynamically load getDatabaseStats when available
(async () => {
  try {
    const prismaModule = await import('../shared/prisma.js');
    if (typeof prismaModule.getDatabaseStats === 'function') {
      getDatabaseStats = prismaModule.getDatabaseStats;
    }
  } catch (error) {
    // Prisma module not available yet
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
      dev: {
        status: 'loading',
        latency: 'n/a',
        connections: 'n/a',
        source: 'n/a',
      },
      prod: {
        status: 'loading',
        latency: 'n/a',
        connections: 'n/a',
        source: 'n/a',
      },
      local: {
        status: 'loading',
        latency: 'n/a',
        connections: 'n/a',
        source: 'n/a',
      },
    };
  }

  try {
    const stats = getDatabaseStats();
    
    // Format DEV stats
    const devLatency = stats.dev.latency !== null 
      ? `${stats.dev.latency.toFixed(2)}ms` 
      : 'n/a';
    
    // Format PROD stats
    const prodLatency = stats.prod.latency !== null 
      ? `${stats.prod.latency.toFixed(2)}ms` 
      : 'n/a';
    
    // Format LOCAL stats
    const localLatency = stats.local.latency !== null
      ? `${stats.local.latency.toFixed(2)}ms`
      : 'n/a';
    
    return {
      dev: {
        status: stats.dev.status,
        latency: devLatency,
        connections: 'n/a', // Will be populated when pool stats are available
        source: stats.dev.source,
        transport: stats.dev.transport,
      },
      prod: {
        status: stats.prod.status,
        latency: prodLatency,
        connections: 'n/a', // Will be populated when pool stats are available
        source: stats.prod.source,
        transport: stats.prod.transport,
      },
      local: {
        status: stats.local.status,
        latency: localLatency,
        connections: 'n/a',
        source: stats.local.source,
        transport: stats.local.transport,
      },
    };
  } catch (error) {
    return {
      dev: {
        status: 'error',
        latency: 'n/a',
        connections: 'n/a',
        source: 'error',
      },
      prod: {
        status: 'error',
        latency: 'n/a',
        connections: 'n/a',
        source: 'error',
      },
      local: {
        status: 'error',
        latency: 'n/a',
        connections: 'n/a',
        source: 'error',
      },
    };
  }
}

function collectSecurityBotStats() {
  // Placeholder - will be populated by security bot when available
  return {
    status: 'unknown',
    guilds: 0,
    lastSweep: 'never',
    assignments: 0,
    failures: 0,
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
  
  const timestamp = new Date().toISOString();
  const lines = [];
  
  lines.push(SPACER);
  lines.push(`[${timestamp}] ═══════════════════════════════════════════════════════════════`);
  lines.push(SPACER);
  
  // Node Stats
  lines.push(`[NODE] Uptime: ${statsCache.node.uptime}  |  PID: ${statsCache.node.pid}  |  Version: ${statsCache.node.version}`);
  lines.push(`       Memory → RSS: ${statsCache.node.memory.rss}  Heap: ${statsCache.node.memory.heapUsed}/${statsCache.node.memory.heapTotal}  External: ${statsCache.node.memory.external}`);
  lines.push(`       CPU    → User: ${statsCache.node.cpu.user}  System: ${statsCache.node.cpu.system}`);
  lines.push(SPACER);
  
  // Database Stats
  lines.push(`[DATABASE]`);
  lines.push(`  DEV   → Status: ${statsCache.databases.dev.status}  |  Latency: ${statsCache.databases.dev.latency}  |  Source: ${statsCache.databases.dev.source}  |  Connections: ${statsCache.databases.dev.connections}`);
  lines.push(`  PROD  → Status: ${statsCache.databases.prod.status}  |  Latency: ${statsCache.databases.prod.latency}  |  Source: ${statsCache.databases.prod.source}  |  Connections: ${statsCache.databases.prod.connections}`);
  lines.push(`  LOCAL → Status: ${statsCache.databases.local.status}  |  Latency: ${statsCache.databases.local.latency}  |  Source: ${statsCache.databases.local.source}  |  Connections: ${statsCache.databases.local.connections}`);
  lines.push(SPACER);
  
  // Security Bot Stats
  lines.push(`[SECURITY BOT]`);
  lines.push(`  Status: ${statsCache.security.status}  |  Guilds: ${statsCache.security.guilds}  |  Last Sweep: ${statsCache.security.lastSweep}`);
  lines.push(`  Lifetime → Assignments: ${statsCache.security.assignments}  |  Failures: ${statsCache.security.failures}`);
  lines.push(SPACER);
  
  lines.push(`───────────────────────────────────────────────────────────────`);
  lines.push(SPACER);
  
  console.log(lines.join('\n'));
}

function getFormattedStats() {
  refreshStats();
  
  const lines = [];
  
  // Node Stats
  lines.push(`[NODE] Uptime: ${statsCache.node.uptime}  |  PID: ${statsCache.node.pid}  |  Version: ${statsCache.node.version}`);
  lines.push(`       Memory → RSS: ${statsCache.node.memory.rss}  Heap: ${statsCache.node.memory.heapUsed}/${statsCache.node.memory.heapTotal}  External: ${statsCache.node.memory.external}`);
  lines.push(`       CPU    → User: ${statsCache.node.cpu.user}  System: ${statsCache.node.cpu.system}`);
  
  // Database Stats
  lines.push(`[DATABASE]`);
  lines.push(`  DEV   → Status: ${statsCache.databases.dev.status}  |  Latency: ${statsCache.databases.dev.latency}  |  Source: ${statsCache.databases.dev.source}  |  Connections: ${statsCache.databases.dev.connections}`);
  lines.push(`  PROD  → Status: ${statsCache.databases.prod.status}  |  Latency: ${statsCache.databases.prod.latency}  |  Source: ${statsCache.databases.prod.source}  |  Connections: ${statsCache.databases.prod.connections}`);
  lines.push(`  LOCAL → Status: ${statsCache.databases.local.status}  |  Latency: ${statsCache.databases.local.latency}  |  Source: ${statsCache.databases.local.source}  |  Connections: ${statsCache.databases.local.connections}`);
  
  return lines.join('\n');
}

function log(level, message, context, options = {}) {
  const timestamp = new Date().toISOString();
  const label = LOG_LABEL[level] || LOG_LABEL.info;
  
  console.log(`[${timestamp}] [${label}] ${message}`);
  
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
  const timestamp = new Date().toISOString();
  const label = LOG_LABEL[level] || LOG_LABEL.info;
  
  console.log(SPACER);
  console.log(`[${timestamp}] [${label}] ═══ ${title} ═══`);
  
  if (meta && typeof meta === 'object') {
    const entries = Object.entries(meta);
    if (entries.length > 0) {
      for (const [key, value] of entries) {
        console.log(`  ${key}: ${value}`);
      }
    }
  }
  
  console.log(SPACER);
  
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
