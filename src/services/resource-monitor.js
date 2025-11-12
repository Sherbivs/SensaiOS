/**
 * @file Centralized Resource Monitoring & Pooling System
 * @description Real-time checkpoint tool integrating:
 *   - Process metrics (RSS, heap, CPU from process APIs)
 *   - Cache/disk tracking (directory sizes, workspace limits)
 *   - Resource manager integration (timers, listeners, connections)
 *   - Historical snapshots for leak detection
 *   - Alert generation with thresholds
 * @module services/resource-monitor
 * 
 * Integration Points:
 *   - logger.js: Reads metrics for stats display
 *   - resource-manager.ts: Provides resource counts
 *   - resource-monitor.ts: Scheduling and alerting
 *   - index.ts: Lifecycle management
 */

import os from 'node:os';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';

// ============================================================================
// Configuration
// ============================================================================

const REFRESH_INTERVAL_MS = 15_000; // 15 seconds (real-time monitoring)
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (historical snapshots)
const SNAPSHOT_RETENTION = 288; // Keep 24 hours (288 × 5min = 1440min = 24h)

const CACHE_DIR = process.env.IS_RENDER 
  ? '/Store/discord-cache' 
  : './Store/discord-cache';
const WORKSPACE_LIMIT = 1.0 * 1024 * 1024 * 1024; // 1 GB in bytes
const MEMORY_LIMIT = 512 * 1024 * 1024; // 512 MB Render limit

// Thresholds aligned with Render Starter plan
const THRESHOLDS = {
  memory: {
    emergency: 460 * 1024 * 1024,  // 90% of 512 MB
    critical: 435 * 1024 * 1024,   // 85%
    warning: 384 * 1024 * 1024,    // 75%
    optimal: 307 * 1024 * 1024,    // 60%
  },
  cpu: {
    emergency: 90,  // 90% CPU
    critical: 70,   // 70%
    warning: 50,    // 50%
  },
  cache: {
    warning: 500 * 1024 * 1024,    // 500 MB
    critical: 650 * 1024 * 1024,   // 650 MB
  },
};

// ============================================================================
// State
// ============================================================================

let monitorInterval = null;
let snapshotInterval = null;
let lastCpuUsage = null;
let resourceManagerStats = null; // Cached stats from resource-manager.ts

// Current metrics (updated every 15 seconds)
let metrics = {
  // Memory metrics (from process.memoryUsage())
  rss: 0,              // Resident Set Size (total memory allocated)
  heapUsed: 0,         // V8 heap actually used
  heapTotal: 0,        // V8 heap allocated
  external: 0,         // C++ objects bound to JS
  arrayBuffers: 0,     // ArrayBuffer and SharedArrayBuffer
  
  // Calculated percentages
  heapPercent: 0,
  workspacePercent: 0,
  memoryLimitPercent: 0,
  
  // CPU metrics
  cpuPercent: 0,
  cpuUser: 0,
  cpuSystem: 0,
  
  // Process info
  pid: process.pid,
  uptime: 0,
  nodeVersion: process.version,
  
  // Cache metrics
  cacheDir: CACHE_DIR,
  cacheSize: 0,
  cacheBudgetMax: 714.9 * 1024 * 1024, // ~715 MB
  cacheBudgetPercent: 0,
  
  // Disk metrics
  diskFree: 0,
  diskTotal: 0,
  diskUsed: 0,
  diskPercent: 0,
  
  // Workspace metrics
  workspaceLimit: WORKSPACE_LIMIT,
  approxFree: 0,
  
  // Resource manager metrics (from TypeScript system)
  resources: {
    total: 0,
    timers: 0,
    listeners: 0,
    connections: 0,
    caches: 0,
    diskCaches: 0,
    diskBuffers: 0,
    diskLogs: 0,
    leakSuspects: 0,
    diskUsageBytes: 0,
  },
  
  // Alert status
  alerts: [],
  status: 'healthy', // healthy | warning | critical | emergency
  
  // Timing
  lastUpdate: null,
  uptimeSec: 0,
};

// Historical snapshots (5-minute intervals, 24-hour retention)
let snapshots = [];

// Alert tracking
let alertHistory = [];

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes.toFixed(1)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Get directory size recursively
 */
async function getDirectorySize(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    
    if (!stat.isDirectory()) {
      return stat.size;
    }
    
    const files = await fs.readdir(dirPath);
    const sizes = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dirPath, file);
        try {
          return await getDirectorySize(filePath);
        } catch (err) {
          // Skip files we can't read
          return 0;
        }
      })
    );
    
    return sizes.reduce((total, size) => total + size, 0);
  } catch (err) {
    return 0;
  }
}

/**
 * Get CPU usage percentage
 * CRITICAL: First call establishes baseline, returns 0s gracefully
 */
function getCpuUsage() {
  const currentUsage = process.cpuUsage();
  
  if (!lastCpuUsage) {
    // First call - establish baseline for next measurement
    lastCpuUsage = currentUsage;
    return { user: 0, system: 0, total: 0 };
  }
  
  const userDiff = currentUsage.user - lastCpuUsage.user;
  const systemDiff = currentUsage.system - lastCpuUsage.system;
  const totalDiff = userDiff + systemDiff;
  
  // Convert microseconds to percentage (divide by interval in microseconds)
  const intervalMicros = REFRESH_INTERVAL_MS * 1000;
  const userPercent = (userDiff / intervalMicros) * 100;
  const systemPercent = (systemDiff / intervalMicros) * 100;
  const totalPercent = (totalDiff / intervalMicros) * 100;
  
  // Update baseline for next measurement
  lastCpuUsage = currentUsage;
  
  // Clamp to valid range [0, 100]
  return {
    user: Math.min(100, Math.max(0, userPercent)),
    system: Math.min(100, Math.max(0, systemPercent)),
    total: Math.min(100, Math.max(0, totalPercent)),
  };
}

/**
 * Get disk usage (Linux only)
 */
async function getDiskUsage() {
  if (process.platform !== 'linux') {
    return { free: 0, total: 0, used: 0, percent: 0 };
  }
  
  try {
    // Read /proc/meminfo for memory stats (fallback)
    const meminfo = await fs.readFile('/proc/meminfo', 'utf-8');
    const lines = meminfo.split('\n');
    const stats = {};
    
    for (const line of lines) {
      const match = line.match(/^(\w+):\s+(\d+)\s+kB/);
      if (match) {
        stats[match[1]] = parseInt(match[2], 10) * 1024; // Convert to bytes
      }
    }
    
    // For disk, we'd need to parse df output, but that requires shell access
    // For now, use memory as a proxy
    const total = stats.MemTotal || 0;
    const free = stats.MemFree || 0;
    const used = total - free;
    const percent = total > 0 ? (used / total) * 100 : 0;
    
    return { free, total, used, percent };
  } catch (err) {
    return { free: 0, total: 0, used: 0, percent: 0 };
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Integrate with resource-manager.ts to get managed resource stats
 */
async function collectResourceManagerStats() {
  try {
    // Dynamic import to avoid circular dependency
    const { resourceManager } = await import('./resource-manager.js');
    const stats = resourceManager.getStats();
    
    resourceManagerStats = {
      total: stats.total,
      timers: stats.byType?.timer || 0,
      listeners: stats.byType?.listener || 0,
      connections: stats.byType?.connection || 0,
      caches: stats.byType?.cache || 0,
      diskCaches: stats.byType?.['disk-cache'] || 0,
      diskBuffers: stats.byType?.['disk-buffer'] || 0,
      diskLogs: stats.byType?.['disk-log'] || 0,
      leakSuspects: stats.leakSuspects?.length || 0,
      diskUsageBytes: stats.diskUsage?.totalDiskBytes || 0,
    };
    
    return resourceManagerStats;
  } catch (err) {
    // Resource manager not loaded yet or not available
    return {
      total: 0,
      timers: 0,
      listeners: 0,
      connections: 0,
      caches: 0,
      diskCaches: 0,
      diskBuffers: 0,
      diskLogs: 0,
      leakSuspects: 0,
      diskUsageBytes: 0,
    };
  }
}

/**
 * Generate alerts based on current metrics and thresholds
 */
function generateAlerts() {
  const alerts = [];
  
  // Memory alerts
  if (metrics.rss >= THRESHOLDS.memory.emergency) {
    alerts.push({
      level: 'emergency',
      category: 'memory',
      message: `Memory usage critical: ${formatBytes(metrics.rss)} / ${formatBytes(MEMORY_LIMIT)} (${metrics.memoryLimitPercent.toFixed(1)}%)`,
      value: metrics.rss,
      threshold: THRESHOLDS.memory.emergency,
      action: 'Immediate restart or scale required',
    });
  } else if (metrics.rss >= THRESHOLDS.memory.critical) {
    alerts.push({
      level: 'critical',
      category: 'memory',
      message: `Memory usage high: ${formatBytes(metrics.rss)} / ${formatBytes(MEMORY_LIMIT)} (${metrics.memoryLimitPercent.toFixed(1)}%)`,
      value: metrics.rss,
      threshold: THRESHOLDS.memory.critical,
      action: 'Scale or optimize within 1 hour',
    });
  } else if (metrics.rss >= THRESHOLDS.memory.warning) {
    alerts.push({
      level: 'warning',
      category: 'memory',
      message: `Memory usage elevated: ${formatBytes(metrics.rss)} / ${formatBytes(MEMORY_LIMIT)} (${metrics.memoryLimitPercent.toFixed(1)}%)`,
      value: metrics.rss,
      threshold: THRESHOLDS.memory.warning,
      action: 'Monitor closely, consider optimization',
    });
  }
  
  // CPU alerts
  if (metrics.cpuPercent >= THRESHOLDS.cpu.emergency) {
    alerts.push({
      level: 'emergency',
      category: 'cpu',
      message: `CPU usage critical: ${metrics.cpuPercent.toFixed(1)}%`,
      value: metrics.cpuPercent,
      threshold: THRESHOLDS.cpu.emergency,
      action: 'Check for runaway processes',
    });
  } else if (metrics.cpuPercent >= THRESHOLDS.cpu.critical) {
    alerts.push({
      level: 'critical',
      category: 'cpu',
      message: `CPU usage high: ${metrics.cpuPercent.toFixed(1)}%`,
      value: metrics.cpuPercent,
      threshold: THRESHOLDS.cpu.critical,
      action: 'Investigate CPU-intensive operations',
    });
  } else if (metrics.cpuPercent >= THRESHOLDS.cpu.warning) {
    alerts.push({
      level: 'warning',
      category: 'cpu',
      message: `CPU usage elevated: ${metrics.cpuPercent.toFixed(1)}%`,
      value: metrics.cpuPercent,
      threshold: THRESHOLDS.cpu.warning,
      action: 'Monitor CPU usage patterns',
    });
  }
  
  // Cache alerts
  if (metrics.cacheSize >= THRESHOLDS.cache.critical) {
    alerts.push({
      level: 'critical',
      category: 'cache',
      message: `Cache size critical: ${formatBytes(metrics.cacheSize)}`,
      value: metrics.cacheSize,
      threshold: THRESHOLDS.cache.critical,
      action: 'Clear cache immediately',
    });
  } else if (metrics.cacheSize >= THRESHOLDS.cache.warning) {
    alerts.push({
      level: 'warning',
      category: 'cache',
      message: `Cache size high: ${formatBytes(metrics.cacheSize)}`,
      value: metrics.cacheSize,
      threshold: THRESHOLDS.cache.warning,
      action: 'Schedule cache cleanup',
    });
  }
  
  // Leak suspect alerts
  if (metrics.resources.leakSuspects >= 10) {
    alerts.push({
      level: 'critical',
      category: 'leaks',
      message: `High leak suspects: ${metrics.resources.leakSuspects} resources`,
      value: metrics.resources.leakSuspects,
      threshold: 10,
      action: 'Investigate resource leaks',
    });
  } else if (metrics.resources.leakSuspects >= 5) {
    alerts.push({
      level: 'warning',
      category: 'leaks',
      message: `Leak suspects detected: ${metrics.resources.leakSuspects} resources`,
      value: metrics.resources.leakSuspects,
      threshold: 5,
      action: 'Review long-lived resources',
    });
  }
  
  // Determine overall status
  let status = 'healthy';
  if (alerts.some(a => a.level === 'emergency')) {
    status = 'emergency';
  } else if (alerts.some(a => a.level === 'critical')) {
    status = 'critical';
  } else if (alerts.some(a => a.level === 'warning')) {
    status = 'warning';
  }
  
  return { alerts, status };
}

/**
 * Create a snapshot for historical tracking
 */
function createSnapshot() {
  const snapshot = {
    timestamp: new Date().toISOString(),
    metrics: JSON.parse(JSON.stringify(metrics)),
  };
  
  snapshots.push(snapshot);
  
  // Trim old snapshots (keep last 24 hours) - CRITICAL: Use splice to mutate in place
  if (snapshots.length > SNAPSHOT_RETENTION) {
    const excessCount = snapshots.length - SNAPSHOT_RETENTION;
    snapshots.splice(0, excessCount);
  }
  
  return snapshot;
}

/**
 * Collect all resource metrics
 * CRITICAL: Each section has individual error handling for graceful degradation
 */
async function collectMetrics() {
  try {
    // Memory metrics - CRITICAL: Always collect, never fail
    try {
      const mem = process.memoryUsage();
      metrics.rss = mem.rss;
      metrics.heapUsed = mem.heapUsed;
      metrics.heapTotal = mem.heapTotal;
      metrics.external = mem.external;
      metrics.arrayBuffers = mem.arrayBuffers || 0;
      
      // Calculate percentages
      metrics.heapPercent = metrics.heapTotal > 0 
        ? (metrics.heapUsed / metrics.heapTotal) * 100 
        : 0;
      metrics.workspacePercent = WORKSPACE_LIMIT > 0
        ? (metrics.rss / WORKSPACE_LIMIT) * 100
        : 0;
      metrics.memoryLimitPercent = MEMORY_LIMIT > 0
        ? (metrics.rss / MEMORY_LIMIT) * 100
        : 0;
    } catch (memErr) {
      console.error('[resource-monitor] Memory collection failed:', memErr);
      // Keep previous values, don't crash
    }
    
    // CPU metrics - Graceful degradation on first call
    try {
      const cpu = getCpuUsage();
      metrics.cpuPercent = cpu.total;
      metrics.cpuUser = cpu.user;
      metrics.cpuSystem = cpu.system;
    } catch (cpuErr) {
      console.error('[resource-monitor] CPU collection failed:', cpuErr);
      // Keep previous values
    }
    
    // Process info - Always available
    metrics.uptime = process.uptime();
    metrics.uptimeSec = Math.floor(metrics.uptime);
    
    // Cache metrics - May fail if directory doesn't exist
    try {
      metrics.cacheSize = await getDirectorySize(CACHE_DIR);
      metrics.cacheBudgetPercent = metrics.cacheBudgetMax > 0
        ? (metrics.cacheSize / metrics.cacheBudgetMax) * 100
        : 0;
    } catch (cacheErr) {
      // Cache directory might not exist yet or be inaccessible
      metrics.cacheSize = 0;
      metrics.cacheBudgetPercent = 0;
    }
    
    // Disk metrics - Linux only, optional
    try {
      const disk = await getDiskUsage();
      metrics.diskFree = disk.free;
      metrics.diskTotal = disk.total;
      metrics.diskUsed = disk.used;
      metrics.diskPercent = disk.percent;
    } catch (diskErr) {
      // Not critical, keep previous values
      console.error('[resource-monitor] Disk collection failed:', diskErr);
    }
    
    // Workspace metrics
    metrics.approxFree = WORKSPACE_LIMIT - metrics.rss;
    
    // Resource manager integration - May fail during startup
    try {
      metrics.resources = await collectResourceManagerStats();
    } catch (rmErr) {
      console.error('[resource-monitor] Resource manager integration failed:', rmErr);
      // Keep previous values or use defaults
      if (!metrics.resources || metrics.resources.total === 0) {
        metrics.resources = {
          total: 0,
          timers: 0,
          listeners: 0,
          connections: 0,
          caches: 0,
          diskCaches: 0,
          diskBuffers: 0,
          diskLogs: 0,
          leakSuspects: 0,
          diskUsageBytes: 0,
        };
      }
    }
    
    // Generate alerts based on thresholds
    try {
      const { alerts, status } = generateAlerts();
      metrics.alerts = alerts;
      metrics.status = status;
      
      // Store alerts in history
      if (alerts.length > 0) {
        alertHistory.push({
          timestamp: new Date().toISOString(),
          alerts: alerts.map(a => ({ ...a })),
        });
        
        // Keep last 100 alert events - CRITICAL: Use splice to mutate in place
        if (alertHistory.length > 100) {
          const excessCount = alertHistory.length - 100;
          alertHistory.splice(0, excessCount);
        }
      }
    } catch (alertErr) {
      console.error('[resource-monitor] Alert generation failed:', alertErr);
      metrics.alerts = [];
      metrics.status = 'healthy';
    }
    
    // Timing - Always update
    metrics.lastUpdate = new Date().toISOString();
    
    return metrics;
    
  } catch (err) {
    // Top-level catch - Should never reach here due to individual try-catches
    console.error('[resource-monitor] CRITICAL: Metrics collection completely failed:', err);
    // Return current state, don't throw
    return metrics;
  }
}

/**
 * Get current metrics (returns cached values)
 */
function getMetrics() {
  return { ...metrics };
}

/**
 * Get formatted metrics for display
 * CRITICAL: Defensive against null/undefined values
 */
function getFormattedMetrics() {
  return {
    memory: {
      rss: formatBytes(metrics.rss || 0),
      heapUsed: formatBytes(metrics.heapUsed || 0),
      heapTotal: formatBytes(metrics.heapTotal || 0),
      external: formatBytes(metrics.external || 0),
      heapPercent: `${(metrics.heapPercent || 0).toFixed(1)}%`,
      workspacePercent: `${(metrics.workspacePercent || 0).toFixed(1)}%`,
    },
    cpu: {
      total: `${(metrics.cpuPercent || 0).toFixed(1)}%`,
      user: `${(metrics.cpuUser || 0).toFixed(1)}%`,
      system: `${(metrics.cpuSystem || 0).toFixed(1)}%`,
    },
    cache: {
      size: formatBytes(metrics.cacheSize || 0),
      budgetMax: formatBytes(metrics.cacheBudgetMax || 0),
      budgetPercent: `${(metrics.cacheBudgetPercent || 0).toFixed(1)}%`,
      approxFree: formatBytes(Math.max(0, (metrics.cacheBudgetMax || 0) - (metrics.cacheSize || 0))),
    },
    disk: {
      free: formatBytes(metrics.diskFree || 0),
      total: formatBytes(metrics.diskTotal || 0),
      used: formatBytes(metrics.diskUsed || 0),
      percent: `${(metrics.diskPercent || 0).toFixed(1)}%`,
    },
    workspace: {
      limit: formatBytes(metrics.workspaceLimit || 0),
      approxFree: formatBytes(metrics.approxFree || 0),
    },
    process: {
      pid: metrics.pid || process.pid,
      uptime: `${metrics.uptimeSec || 0}s`,
      nodeVersion: metrics.nodeVersion || process.version,
    },
    lastUpdate: metrics.lastUpdate || new Date().toISOString(),
  };
}

/**
 * Start monitoring
 */
function startMonitoring() {
  if (monitorInterval) {
    return; // Already running
  }
  
  // Initial collection
  collectMetrics().catch(err => {
    console.error('[resource-monitor] Initial collection failed:', err);
  });
  
  // Set up real-time refresh interval (15 seconds)
  monitorInterval = setInterval(() => {
    collectMetrics().catch(err => {
      console.error('[resource-monitor] Collection failed:', err);
    });
  }, REFRESH_INTERVAL_MS);
  
  // Set up snapshot interval (5 minutes)
  snapshotInterval = setInterval(() => {
    createSnapshot();
  }, SNAPSHOT_INTERVAL_MS);
  
  // Allow process to exit
  if (monitorInterval.unref) {
    monitorInterval.unref();
  }
  if (snapshotInterval.unref) {
    snapshotInterval.unref();
  }
}

/**
 * Stop monitoring
 */
function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
    snapshotInterval = null;
  }
}

/**
 * Get historical snapshots
 */
function getSnapshots() {
  return [...snapshots];
}

/**
 * Get alert history
 */
function getAlertHistory() {
  return [...alertHistory];
}

/**
 * Get current alerts only
 */
function getCurrentAlerts() {
  return [...metrics.alerts];
}

/**
 * Get resource checkpoint (comprehensive status)
 */
function getCheckpoint() {
  return {
    timestamp: new Date().toISOString(),
    status: metrics.status,
    metrics: {
      memory: {
        rss: metrics.rss,
        heapUsed: metrics.heapUsed,
        heapTotal: metrics.heapTotal,
        limitPercent: metrics.memoryLimitPercent,
      },
      cpu: {
        total: metrics.cpuPercent,
        user: metrics.cpuUser,
        system: metrics.cpuSystem,
      },
      cache: {
        size: metrics.cacheSize,
        percent: metrics.cacheBudgetPercent,
      },
      resources: metrics.resources,
    },
    alerts: metrics.alerts,
    uptime: metrics.uptimeSec,
  };
}

// ============================================================================
// Exports
// ============================================================================

// Named exports for TypeScript modules (index.ts, resource-request.ts)
export const resourceMonitor = {
  // Core monitoring
  getMetrics,
  getFormattedMetrics,
  startMonitoring,
  stopMonitoring,
  
  // Historical data
  getSnapshots,
  getAlertHistory,
  getCurrentAlerts,
  
  // Checkpoint API
  getCheckpoint,
  
  // Status
  getStatus: () => ({
    running: monitorInterval !== null,
    refreshInterval: REFRESH_INTERVAL_MS,
    snapshotInterval: SNAPSHOT_INTERVAL_MS,
    lastUpdate: metrics.lastUpdate,
    status: metrics.status,
    alertCount: metrics.alerts.length,
    snapshotCount: snapshots.length,
  }),
};

// Aliases for index.ts lifecycle management
export const startResourceMonitoring = startMonitoring;
export const stopResourceMonitoring = stopMonitoring;

// Default export for logger.js compatibility
export default resourceMonitor;

// ============================================================================
// Initialization
// ============================================================================

// Auto-start monitoring after export (avoid circular dependency issues)
startMonitoring();
