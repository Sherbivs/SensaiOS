// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from "../shared/logging/index.js";
const logger = getLogger();

import { prisma } from "../shared/prisma.js";

/**
 * Restart Metrics - Database-Backed State Tracking
 * 
 * Tracks service restart history, crash counts, and uptime metrics across restarts.
 * Persists to PostgreSQL `runtime_metrics` table for long-term observability.
 * 
 * MIGRATION (2025-12-27): Moved from /Store/restart-metrics.json to PostgreSQL
 * Reference: docs/projects/STORE-WRITE-ELIMINATION.md
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

const RECENT_EVENTS_LIMIT = 50; // Rolling window size

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

let metricsState: RestartMetrics | null = null;
let currentBootTime: number = 0;

// -----------------------------------------------------------------------------
// Database Operations
// -----------------------------------------------------------------------------

/**
 * Record a metric to the database (non-blocking)
 */
async function recordMetricToDb(
  metricType: string,
  trigger: string | null,
  uptimeMs: number | null,
  errorMessage: string | null = null,
  stackTrace: string | null = null,
  metadata: Record<string, unknown> | null = null
): Promise<void> {
  try {
    await prisma.runtimeMetric.create({
      data: {
        metricType,
        trigger,
        uptimeMs: uptimeMs ? BigInt(uptimeMs) : null,
        errorMessage,
        stackTrace,
        metadata: metadata ? (metadata as object) : undefined,
      },
    });
  } catch (error) {
    // Non-blocking - log and continue
    logger.error('restart-metrics', 'db-write', 'Failed to write metric to database', { 
      error: { name: 'DbWriteError', message: String(error) } 
    });
  }
}

/**
 * Load historical metrics from database
 */
async function loadMetricsFromDb(): Promise<Partial<RestartMetrics>> {
  try {
    // Count totals
    const [restartCount, crashCount] = await Promise.all([
      prisma.runtimeMetric.count({ where: { metricType: 'restart' } }),
      prisma.runtimeMetric.count({ where: { metricType: 'crash' } }),
    ]);

    // Get first and last boot
    const [firstBoot, lastShutdown, lastCrash] = await Promise.all([
      prisma.runtimeMetric.findFirst({
        where: { metricType: 'restart' },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.runtimeMetric.findFirst({
        where: { metricType: 'shutdown' },
        orderBy: { timestamp: 'desc' },
      }),
      prisma.runtimeMetric.findFirst({
        where: { metricType: 'crash' },
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    // Calculate uptime stats from all shutdown/crash events
    const uptimeRecords = await prisma.runtimeMetric.findMany({
      where: { 
        metricType: { in: ['shutdown', 'crash'] },
        uptimeMs: { not: null },
      },
      select: { uptimeMs: true },
    });

    let totalUptimeMs = 0;
    let longestUptimeMs = 0;
    let shortestUptimeMs: number | null = null;

    for (const record of uptimeRecords) {
      if (record.uptimeMs) {
        const ms = Number(record.uptimeMs);
        totalUptimeMs += ms;
        if (ms > longestUptimeMs) longestUptimeMs = ms;
        if (shortestUptimeMs === null || ms < shortestUptimeMs) shortestUptimeMs = ms;
      }
    }

    // Get recent events
    const recentRestarts = await prisma.runtimeMetric.findMany({
      where: { metricType: { in: ['restart', 'shutdown'] } },
      orderBy: { timestamp: 'desc' },
      take: RECENT_EVENTS_LIMIT,
    });

    const recentCrashes = await prisma.runtimeMetric.findMany({
      where: { metricType: 'crash' },
      orderBy: { timestamp: 'desc' },
      take: RECENT_EVENTS_LIMIT,
    });

    return {
      totalRestarts: restartCount + 1, // +1 for current boot
      totalCrashes: crashCount,
      firstBoot: firstBoot?.timestamp.toISOString() ?? new Date().toISOString(),
      lastShutdown: lastShutdown?.timestamp.toISOString() ?? null,
      lastShutdownTrigger: lastShutdown?.trigger ?? null,
      lastShutdownUptimeMs: lastShutdown?.uptimeMs ? Number(lastShutdown.uptimeMs) : null,
      lastCrash: lastCrash?.timestamp.toISOString() ?? null,
      lastCrashError: lastCrash?.errorMessage ?? null,
      lastCrashStack: lastCrash?.stackTrace ?? null,
      totalUptimeMs,
      longestUptimeMs,
      shortestUptimeMs,
      recentRestarts: recentRestarts.map(r => ({
        timestamp: r.timestamp.toISOString(),
        trigger: r.trigger ?? 'unknown',
        uptimeMs: r.uptimeMs ? Number(r.uptimeMs) : 0,
        graceful: r.metricType === 'shutdown',
      })).reverse(),
      recentCrashes: recentCrashes.map(r => ({
        timestamp: r.timestamp.toISOString(),
        error: r.errorMessage ?? 'Unknown error',
        stack: r.stackTrace,
        uptimeMs: r.uptimeMs ? Number(r.uptimeMs) : 0,
      })).reverse(),
    };
  } catch (error) {
    logger.error('restart-metrics', 'db-load', 'Failed to load metrics from database', {
      error: { name: 'DbLoadError', message: String(error) }
    });
    return {};
  }
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

/**
 * Load metrics from database or initialize default state.
 * Call this at boot before any other metrics operations.
 */
export async function initializeMetricsAsync(): Promise<RestartMetrics> {
  if (metricsState) {
    return metricsState;
  }
  
  try {
    const now = new Date().toISOString();
    currentBootTime = Date.now();
    
    // Load historical data from database
    const dbMetrics = await loadMetricsFromDb();
    
    // Merge with defaults
    metricsState = {
      totalRestarts: dbMetrics.totalRestarts ?? 1,
      totalCrashes: dbMetrics.totalCrashes ?? 0,
      firstBoot: dbMetrics.firstBoot ?? now,
      lastBoot: now,
      lastShutdown: dbMetrics.lastShutdown ?? null,
      lastCrash: dbMetrics.lastCrash ?? null,
      lastShutdownTrigger: dbMetrics.lastShutdownTrigger ?? null,
      lastShutdownUptimeMs: dbMetrics.lastShutdownUptimeMs ?? null,
      lastCrashError: dbMetrics.lastCrashError ?? null,
      lastCrashStack: dbMetrics.lastCrashStack ?? null,
      totalUptimeMs: dbMetrics.totalUptimeMs ?? 0,
      longestUptimeMs: dbMetrics.longestUptimeMs ?? 0,
      shortestUptimeMs: dbMetrics.shortestUptimeMs ?? null,
      recentRestarts: dbMetrics.recentRestarts ?? [],
      recentCrashes: dbMetrics.recentCrashes ?? [],
    };
    
    // Record this boot to database (non-blocking)
    recordMetricToDb('restart', 'boot', null, null, null, {
      totalRestarts: metricsState.totalRestarts,
    });
    
    logger.info('restart-metrics', 'load', `Loaded state: ${metricsState.totalRestarts} restarts, ${metricsState.totalCrashes} crashes (database-backed)`);
  } catch (error) {
    logger.error('restart-metrics', 'load', 'Failed to load state, using defaults', { 
      error: { name: 'LoadError', message: String(error) } 
    });
    metricsState = createDefaultMetrics();
    currentBootTime = Date.now();
  }
  
  return metricsState!;
}

/**
 * Synchronous initialization for backward compatibility.
 * Uses cached state if available, otherwise creates defaults.
 * @deprecated Use initializeMetricsAsync() for proper database loading
 */
export function initializeMetrics(): RestartMetrics {
  if (metricsState) {
    return metricsState;
  }
  
  // Create defaults - async load will update later
  metricsState = createDefaultMetrics();
  currentBootTime = Date.now();
  
  // Trigger async load in background
  loadMetricsFromDb().then(dbMetrics => {
    if (metricsState) {
      Object.assign(metricsState, dbMetrics, { lastBoot: metricsState.lastBoot });
    }
  }).catch(() => {
    // Ignore - defaults are fine
  });
  
  return metricsState;
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
 * Save metrics - now a no-op since we write directly to database.
 * Kept for backward compatibility.
 * @deprecated Database writes happen automatically
 */
export function saveMetrics(): void {
  // No-op - database writes are done in event recording functions
  // This function is kept for backward compatibility
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
  
  // Update in-memory state
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
  
  // Write to database (fire and forget - shutdown can't wait)
  recordMetricToDb('shutdown', trigger, uptimeMs);
  
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
  
  // Update in-memory state
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
  
  // Write to database (fire and forget)
  recordMetricToDb('crash', 'crash', uptimeMs, errorMessage, errorStack);
  
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
    `Storage: PostgreSQL (database-first)`,
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

