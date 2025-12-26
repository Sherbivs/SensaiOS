// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from "../shared/logging/index.js";
const logger = getLogger();

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

/**
 * Restart Metrics - Persistent State Tracking
 * 
 * Tracks service restart history, crash counts, and uptime metrics across restarts.
 * Persists to disk at /Store/restart-metrics.json for long-term observability.
 * 
 * Purpose: Enable operators to identify reliability issues and track improvements.
 */

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RestartMetrics {
  // Counters
  totalRestarts: number;
  totalCrashes: number;
  
  // Lifecycle timestamps (ISO 8601)
  firstBoot: string;
  lastBoot: string;
  lastShutdown: string | null;
  lastCrash: string | null;
  
  // Shutdown tracking
  lastShutdownTrigger: string | null; // SIGTERM | SIGINT | EXIT | PM2_RESTART
  lastShutdownUptimeMs: number | null;
  
  // Crash tracking
  lastCrashError: string | null;
  lastCrashStack: string | null;
  
  // Uptime calculations
  totalUptimeMs: number; // Cumulative across all sessions
  longestUptimeMs: number;
  shortestUptimeMs: number | null;
  
  // Recent history (rolling window)
  recentRestarts: RestartEvent[];
  recentCrashes: CrashEvent[];
}

export interface RestartEvent {
  timestamp: string; // ISO 8601
  trigger: string; // manual | scheduled | crash | health-check | unknown
  uptimeMs: number;
  graceful: boolean;
}

export interface CrashEvent {
  timestamp: string; // ISO 8601
  error: string;
  stack: string | null;
  uptimeMs: number;
}

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const STORAGE_PATH = process.env.NODE_ENV === "production"
  ? "/Store/restart-metrics.json"
  : "Store/restart-metrics.json";

const RECENT_EVENTS_LIMIT = 50; // Rolling window size

// -----------------------------------------------------------------------------
// Initialization & Persistence
// -----------------------------------------------------------------------------

let metricsState: RestartMetrics | null = null;
let currentBootTime: number = 0;

/**
 * Load metrics from disk or initialize default state.
 * Call this at boot before any other metrics operations.
 */
export function initializeMetrics(): RestartMetrics {
  if (metricsState) {
    return metricsState;
  }
  
  try {
    if (existsSync(STORAGE_PATH)) {
      const content = readFileSync(STORAGE_PATH, "utf-8");
      metricsState = JSON.parse(content);
      
      // Record this boot
      metricsState!.totalRestarts += 1;
      metricsState!.lastBoot = new Date().toISOString();
      currentBootTime = Date.now();
      
      logger.info('restart-metrics', 'load', `Loaded state: ${metricsState!.totalRestarts} restarts, ${metricsState!.totalCrashes} crashes`);
    } else {
      // First boot - create default state
      metricsState = createDefaultMetrics();
      currentBootTime = Date.now();
      
      // Ensure directory exists
      const dir = dirname(STORAGE_PATH);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      saveMetrics();
      logger.info('restart-metrics', 'init', 'Initialized new state');
    }
  } catch (error) {
    logger.error('restart-metrics', 'load', 'Failed to load state, using defaults', { error: { name: 'LoadError', message: String(error) } });
    metricsState = createDefaultMetrics();
    currentBootTime = Date.now();
  }
  
  return metricsState!; // Non-null after initialization
}

function createDefaultMetrics(): RestartMetrics {
  const now = new Date().toISOString();
  return {
    totalRestarts: 1,
    totalCrashes: 0,
    firstBoot: now,
    lastBoot: now,
    lastShutdown: null,
    lastCrash: null,
    lastShutdownTrigger: null,
    lastShutdownUptimeMs: null,
    lastCrashError: null,
    lastCrashStack: null,
    totalUptimeMs: 0,
    longestUptimeMs: 0,
    shortestUptimeMs: null,
    recentRestarts: [],
    recentCrashes: [],
  };
}

/**
 * Save metrics to disk (synchronous).
 * Called on shutdown and after significant events.
 */
export function saveMetrics(): void {
  if (!metricsState) {
    logger.warn('restart-metrics', 'save', 'Cannot save - not initialized');
    return;
  }
  
  try {
    // Ensure directory exists
    const dir = dirname(STORAGE_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(STORAGE_PATH, JSON.stringify(metricsState, null, 2), "utf-8");
  } catch (error) {
    logger.error('restart-metrics', 'save', 'Failed to save state', { error: { name: 'SaveError', message: String(error) } });
  }
}

// -----------------------------------------------------------------------------
// Event Recording
// -----------------------------------------------------------------------------

/**
 * Record a graceful shutdown.
 * @param trigger - SIGTERM | SIGINT | EXIT | PM2_RESTART
 */
export function recordShutdown(trigger: string): void {
  if (!metricsState) {
    logger.warn('restart-metrics', 'record-shutdown', 'Cannot record shutdown - not initialized');
    return;
  }
  
  const uptimeMs = Date.now() - currentBootTime;
  const now = new Date().toISOString();
  
  // Update state
  metricsState.lastShutdown = now;
  metricsState.lastShutdownTrigger = trigger;
  metricsState.lastShutdownUptimeMs = uptimeMs;
  metricsState.totalUptimeMs += uptimeMs;
  
  // Update uptime ranges
  if (uptimeMs > metricsState.longestUptimeMs) {
    metricsState.longestUptimeMs = uptimeMs;
  }
  if (metricsState.shortestUptimeMs === null || uptimeMs < metricsState.shortestUptimeMs) {
    metricsState.shortestUptimeMs = uptimeMs;
  }
  
  // Add to recent history
  metricsState.recentRestarts.push({
    timestamp: now,
    trigger,
    uptimeMs,
    graceful: true,
  });
  
  // Trim history
  if (metricsState.recentRestarts.length > RECENT_EVENTS_LIMIT) {
    metricsState.recentRestarts = metricsState.recentRestarts.slice(-RECENT_EVENTS_LIMIT);
  }
  
  saveMetrics();
  logger.info('restart-metrics', 'record-shutdown', `Recorded shutdown: trigger=${trigger}, uptime=${formatUptime(uptimeMs)}`);
}

/**
 * Record a crash event.
 * @param error - Error object or message
 * @param stack - Optional stack trace
 */
export function recordCrash(error: Error | string, stack?: string): void {
  if (!metricsState) {
    logger.warn('restart-metrics', 'record-crash', 'Cannot record crash - not initialized');
    return;
  }
  
  const uptimeMs = Date.now() - currentBootTime;
  const now = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = stack ?? (error instanceof Error ? error.stack : null) ?? null;
  
  // Update state
  metricsState.totalCrashes += 1;
  metricsState.lastCrash = now;
  metricsState.lastCrashError = errorMessage;
  metricsState.lastCrashStack = errorStack;
  metricsState.totalUptimeMs += uptimeMs;
  
  // Update uptime ranges
  if (uptimeMs > metricsState.longestUptimeMs) {
    metricsState.longestUptimeMs = uptimeMs;
  }
  if (metricsState.shortestUptimeMs === null || uptimeMs < metricsState.shortestUptimeMs) {
    metricsState.shortestUptimeMs = uptimeMs;
  }
  
  // Add to recent history
  metricsState.recentCrashes.push({
    timestamp: now,
    error: errorMessage,
    stack: errorStack,
    uptimeMs,
  });
  
  // Trim history
  if (metricsState.recentCrashes.length > RECENT_EVENTS_LIMIT) {
    metricsState.recentCrashes = metricsState.recentCrashes.slice(-RECENT_EVENTS_LIMIT);
  }
  
  // Also add to restart history
  metricsState.recentRestarts.push({
    timestamp: now,
    trigger: "crash",
    uptimeMs,
    graceful: false,
  });
  
  if (metricsState.recentRestarts.length > RECENT_EVENTS_LIMIT) {
    metricsState.recentRestarts = metricsState.recentRestarts.slice(-RECENT_EVENTS_LIMIT);
  }
  
  saveMetrics();
  logger.info('restart-metrics', 'record-crash', `Recorded crash: error="${errorMessage}", uptime=${formatUptime(uptimeMs)}`);
}

// -----------------------------------------------------------------------------
// Getters
// -----------------------------------------------------------------------------

/**
 * Get current metrics state (read-only).
 * Returns null if not initialized.
 */
export function getMetrics(): Readonly<RestartMetrics> | null {
  return metricsState;
}

/**
 * Get current session uptime in milliseconds.
 */
export function getCurrentUptime(): number {
  return Date.now() - currentBootTime;
}

/**
 * Calculate average uptime per session.
 */
export function getAverageUptime(): number {
  if (!metricsState || metricsState.totalRestarts === 0) {
    return 0;
  }
  return metricsState.totalUptimeMs / metricsState.totalRestarts;
}

/**
 * Calculate crash rate (crashes per 100 restarts).
 */
export function getCrashRate(): number {
  if (!metricsState || metricsState.totalRestarts === 0) {
    return 0;
  }
  return (metricsState.totalCrashes / metricsState.totalRestarts) * 100;
}

/**
 * Get formatted summary for /ops command.
 */
export function getMetricsSummary(): string {
  if (!metricsState) {
    return "Metrics not initialized";
  }
  
  const currentUptime = getCurrentUptime();
  const averageUptime = getAverageUptime();
  const crashRate = getCrashRate();
  const totalRuntime = metricsState.totalUptimeMs + currentUptime;
  
  const lines = [
    `Total Restarts: ${metricsState.totalRestarts}`,
    `Total Crashes: ${metricsState.totalCrashes}`,
    `Crash Rate: ${crashRate.toFixed(2)}%`,
    ``,
    `First Boot: ${formatTimestamp(metricsState.firstBoot)}`,
    `Last Boot: ${formatTimestamp(metricsState.lastBoot)}`,
    `Current Uptime: ${formatUptime(currentUptime)}`,
    ``,
    `Total Runtime: ${formatUptime(totalRuntime)}`,
    `Average Uptime: ${formatUptime(averageUptime)}`,
    `Longest Uptime: ${formatUptime(metricsState.longestUptimeMs)}`,
    `Shortest Uptime: ${metricsState.shortestUptimeMs ? formatUptime(metricsState.shortestUptimeMs) : "N/A"}`,
  ];
  
  if (metricsState.lastShutdown) {
    lines.push(``);
    lines.push(`Last Shutdown: ${formatTimestamp(metricsState.lastShutdown)}`);
    lines.push(`Shutdown Trigger: ${metricsState.lastShutdownTrigger}`);
    lines.push(`Shutdown Uptime: ${formatUptime(metricsState.lastShutdownUptimeMs ?? 0)}`);
  }
  
  if (metricsState.lastCrash) {
    lines.push(``);
    lines.push(`Last Crash: ${formatTimestamp(metricsState.lastCrash)}`);
    lines.push(`Crash Error: ${metricsState.lastCrashError}`);
  }
  
  // Recent restarts
  if (metricsState.recentRestarts.length > 0) {
    lines.push(``);
    lines.push(`Recent Restarts (last ${Math.min(5, metricsState.recentRestarts.length)}):`);
    metricsState.recentRestarts.slice(-5).reverse().forEach(event => {
      const icon = event.graceful ? "✅" : "❌";
      lines.push(`  ${icon} ${formatTimestamp(event.timestamp)} - ${event.trigger} (${formatUptime(event.uptimeMs)})`);
    });
  }
  
  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffMinutes < 1440) {
    return `${Math.floor(diffMinutes / 60)}h ago`;
  } else {
    return `${Math.floor(diffMinutes / 1440)}d ago`;
  }
}

