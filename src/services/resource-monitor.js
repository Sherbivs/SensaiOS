/**
 * @file Real-Time Resource Monitor
 * @description Tracks actual process memory, CPU, disk, and cache usage
 * @module services/resource-monitor
 */

import os from 'node:os';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';

// ============================================================================
// Configuration
// ============================================================================

const REFRESH_INTERVAL_MS = 15_000; // 15 seconds
const CACHE_DIR = process.env.IS_RENDER 
  ? '/Store/discord-cache' 
  : './Store/discord-cache';
const WORKSPACE_LIMIT = 1.0 * 1024 * 1024 * 1024; // 1 GB in bytes

// ============================================================================
// State
// ============================================================================

let monitorInterval = null;
let lastCpuUsage = null;
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
  
  // Timing
  lastUpdate: null,
  uptimeSec: 0,
};

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
 */
function getCpuUsage() {
  const currentUsage = process.cpuUsage();
  
  if (!lastCpuUsage) {
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
  
  lastCpuUsage = currentUsage;
  
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
 * Collect all resource metrics
 */
async function collectMetrics() {
  // Memory metrics
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
  
  // CPU metrics
  const cpu = getCpuUsage();
  metrics.cpuPercent = cpu.total;
  metrics.cpuUser = cpu.user;
  metrics.cpuSystem = cpu.system;
  
  // Process info
  metrics.uptime = process.uptime();
  metrics.uptimeSec = Math.floor(metrics.uptime);
  
  // Cache metrics
  try {
    metrics.cacheSize = await getDirectorySize(CACHE_DIR);
    metrics.cacheBudgetPercent = metrics.cacheBudgetMax > 0
      ? (metrics.cacheSize / metrics.cacheBudgetMax) * 100
      : 0;
  } catch (err) {
    // Cache directory might not exist yet
    metrics.cacheSize = 0;
    metrics.cacheBudgetPercent = 0;
  }
  
  // Disk metrics
  const disk = await getDiskUsage();
  metrics.diskFree = disk.free;
  metrics.diskTotal = disk.total;
  metrics.diskUsed = disk.used;
  metrics.diskPercent = disk.percent;
  
  // Workspace metrics
  metrics.approxFree = WORKSPACE_LIMIT - metrics.rss;
  
  // Timing
  metrics.lastUpdate = new Date().toISOString();
  
  return metrics;
}

/**
 * Get current metrics (returns cached values)
 */
export function getMetrics() {
  return { ...metrics };
}

/**
 * Get formatted metrics for display
 */
export function getFormattedMetrics() {
  return {
    memory: {
      rss: formatBytes(metrics.rss),
      heapUsed: formatBytes(metrics.heapUsed),
      heapTotal: formatBytes(metrics.heapTotal),
      external: formatBytes(metrics.external),
      heapPercent: `${metrics.heapPercent.toFixed(1)}%`,
      workspacePercent: `${metrics.workspacePercent.toFixed(1)}%`,
    },
    cpu: {
      total: `${metrics.cpuPercent.toFixed(1)}%`,
      user: `${metrics.cpuUser.toFixed(1)}%`,
      system: `${metrics.cpuSystem.toFixed(1)}%`,
    },
    cache: {
      size: formatBytes(metrics.cacheSize),
      budgetMax: formatBytes(metrics.cacheBudgetMax),
      budgetPercent: `${metrics.cacheBudgetPercent.toFixed(1)}%`,
      approxFree: formatBytes(metrics.cacheBudgetMax - metrics.cacheSize),
    },
    disk: {
      free: formatBytes(metrics.diskFree),
      total: formatBytes(metrics.diskTotal),
      used: formatBytes(metrics.diskUsed),
      percent: `${metrics.diskPercent.toFixed(1)}%`,
    },
    workspace: {
      limit: formatBytes(metrics.workspaceLimit),
      approxFree: formatBytes(metrics.approxFree),
    },
    process: {
      pid: metrics.pid,
      uptime: `${metrics.uptimeSec}s`,
      nodeVersion: metrics.nodeVersion,
    },
    lastUpdate: metrics.lastUpdate,
  };
}

/**
 * Start monitoring
 */
export function startMonitoring() {
  if (monitorInterval) {
    return; // Already running
  }
  
  // Initial collection
  collectMetrics().catch(err => {
    console.error('[resource-monitor] Initial collection failed:', err);
  });
  
  // Set up interval
  monitorInterval = setInterval(() => {
    collectMetrics().catch(err => {
      console.error('[resource-monitor] Collection failed:', err);
    });
  }, REFRESH_INTERVAL_MS);
  
  // Allow process to exit
  if (monitorInterval.unref) {
    monitorInterval.unref();
  }
}

/**
 * Stop monitoring
 */
export function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

/**
 * Get monitoring status
 */
export function getStatus() {
  return {
    running: monitorInterval !== null,
    refreshInterval: REFRESH_INTERVAL_MS,
    lastUpdate: metrics.lastUpdate,
  };
}

// ============================================================================
// Initialization
// ============================================================================

// Auto-start monitoring on module load
startMonitoring();

// ============================================================================
// Exports
// ============================================================================

export default {
  getMetrics,
  getFormattedMetrics,
  startMonitoring,
  stopMonitoring,
  getStatus,
};
