/**
 * Kernel Metrics — Unified System Metrics Aggregation
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SINGLE SOURCE OF TRUTH FOR SYSTEM STATE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module aggregates metrics from ALL sources:
 * - Kernel internal metrics (logs, errors, phases)
 * - Observed application metrics (from hooks)
 * - Computed metrics (rates, trends, anomalies)
 * 
 * Provides a unified view of the entire system health at any moment.
 * 
 * @module kernel/metrics
 */

import { getKernelUptime, getKernelLogStats } from './kernel-logger.js';
import { getErrorStats, getPhase } from './kernel-error-detector.js';
import { getMetrics as getObserverMetrics, getSystemHealth, getRegisteredSystems } from './kernel-observer.js';
import type { LifecyclePhase, SystemHealth, SystemRegistration as _SystemRegistration } from './kernel-types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Unified kernel dashboard metrics
 */
export interface KernelDashboard {
  // Identity
  version: string;
  bootedAt: string;
  
  // Timing
  uptimeMs: number;
  uptimeFormatted: string;
  bootTimeMs: number;  // Time from start to RUNTIME phase
  
  // Lifecycle
  currentPhase: LifecyclePhase;
  
  // Systems overview
  totalSystems: number;
  healthySystems: number;
  degradedSystems: number;
  errorSystems: number;
  
  // Observation rates
  logsPerMinute: number;
  errorsPerMinute: number;
  eventsPerMinute: number;
  
  // Kernel internals
  kernelLogEntries: number;
  kernelErrors: number;
  ringBufferUsage: number;  // Percentage
  
  // Memory estimate
  estimatedMemoryMB: number;
}

/**
 * Trend data for a metric
 */
export interface MetricTrend {
  current: number;
  average: number;
  min: number;
  max: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  samples: number;
}

/**
 * System anomaly detected by metrics analysis
 */
export interface SystemAnomaly {
  type: 'ERROR_SPIKE' | 'LOG_FLOOD' | 'SYSTEM_SILENCE' | 'DEGRADED_CLUSTER' | 'PHASE_STUCK';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  detectedAt: number;  // Uptime ms
  metadata: Record<string, unknown>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const KERNEL_VERSION = '1.0.0';
const _TREND_WINDOW_MS = 60_000;  // 1 minute (reserved for future trending features)
const ANOMALY_CHECK_INTERVAL_MS = 10_000;  // 10 seconds

// ============================================================================
// STATE
// ============================================================================

const bootTimestamp = new Date();
const metricHistory: Map<string, number[]> = new Map();
const detectedAnomalies: SystemAnomaly[] = [];
let lastAnomalyCheck = 0;
let bootTimeMs = 0;  // Time from start to RUNTIME phase

/**
 * Record boot time (called when RUNTIME phase is reached)
 */
export function recordBootTime(ms: number): void {
  bootTimeMs = ms;
}

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * Get the unified kernel dashboard
 */
export function getDashboard(): KernelDashboard {
  const uptimeMs = getKernelUptime();
  const logStats = getKernelLogStats();
  const errorStats = getErrorStats();
  const observerMetrics = getObserverMetrics();
  const systems = getRegisteredSystems();
  const health = getSystemHealth();
  
  // Count systems by health status
  let healthySystems = 0;
  let degradedSystems = 0;
  let errorSystems = 0;
  
  for (const h of health) {
    if (h.status === 'HEALTHY') healthySystems++;
    else if (h.status === 'DEGRADED') degradedSystems++;
    else if (h.status === 'ERROR') errorSystems++;
  }
  
  // Calculate rates per minute
  const logsPerMinute = observerMetrics.observationsPerSecond * 60;
  const totalErrors = observerMetrics.totalErrorObservations;
  const errorsPerMinute = uptimeMs > 60000 
    ? (totalErrors / (uptimeMs / 60000)) 
    : totalErrors;
  const eventsPerMinute = (observerMetrics.totalEventObservations / (uptimeMs / 60000)) || 0;
  
  // Estimate memory usage (rough calculation)
  const estimatedMemoryMB = (
    (logStats.totalEntries * 0.5) +  // ~500 bytes per log entry
    (errorStats.totalErrors * 1) +  // ~1KB per error
    (observerMetrics.totalLogObservations * 0.3) +
    (observerMetrics.totalErrorObservations * 0.5) +
    2  // Base overhead
  ) / 1024;  // Convert to MB
  
  return {
    version: KERNEL_VERSION,
    bootedAt: bootTimestamp.toISOString(),
    uptimeMs,
    uptimeFormatted: formatUptime(uptimeMs),
    bootTimeMs,
    currentPhase: getPhase(),
    totalSystems: systems.length,
    healthySystems,
    degradedSystems,
    errorSystems,
    logsPerMinute,
    errorsPerMinute,
    eventsPerMinute,
    kernelLogEntries: logStats.totalEntries,
    kernelErrors: errorStats.totalErrors,
    ringBufferUsage: (logStats.totalEntries / 10000) * 100,  // Assuming 10k buffer
    estimatedMemoryMB,
  };
}

/**
 * Format uptime in human-readable form
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// ============================================================================
// TREND ANALYSIS
// ============================================================================

/**
 * Record a metric value for trend analysis
 */
export function recordMetric(name: string, value: number): void {
  if (!metricHistory.has(name)) {
    metricHistory.set(name, []);
  }
  
  const history = metricHistory.get(name)!;
  history.push(value);
  
  // Keep only last 100 samples
  if (history.length > 100) {
    history.shift();
  }
}

/**
 * Get trend for a metric
 */
export function getMetricTrend(name: string): MetricTrend | null {
  const history = metricHistory.get(name);
  if (!history || history.length < 2) {
    return null;
  }
  
  const current = history[history.length - 1];
  const sum = history.reduce((a, b) => a + b, 0);
  const average = sum / history.length;
  const min = Math.min(...history);
  const max = Math.max(...history);
  
  // Determine trend (compare last 3 to previous 3)
  let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
  if (history.length >= 6) {
    const recent = history.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const previous = history.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
    const delta = (recent - previous) / previous;
    
    if (delta > 0.1) trend = 'UP';
    else if (delta < -0.1) trend = 'DOWN';
  }
  
  return {
    current,
    average,
    min,
    max,
    trend,
    samples: history.length,
  };
}

/**
 * Get all metric trends
 */
export function getAllTrends(): Record<string, MetricTrend> {
  const trends: Record<string, MetricTrend> = {};
  
  for (const name of metricHistory.keys()) {
    const trend = getMetricTrend(name);
    if (trend) {
      trends[name] = trend;
    }
  }
  
  return trends;
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

/**
 * Check for system anomalies
 */
export function checkForAnomalies(): SystemAnomaly[] {
  const now = getKernelUptime();
  
  // Only check periodically
  if (now - lastAnomalyCheck < ANOMALY_CHECK_INTERVAL_MS) {
    return detectedAnomalies;
  }
  lastAnomalyCheck = now;
  
  const newAnomalies: SystemAnomaly[] = [];
  const dashboard = getDashboard();
  const health = getSystemHealth();
  const errorStats = getErrorStats();
  
  // Check for error spike
  if (dashboard.errorsPerMinute > 10) {
    newAnomalies.push({
      type: 'ERROR_SPIKE',
      severity: dashboard.errorsPerMinute > 50 ? 'CRITICAL' : dashboard.errorsPerMinute > 20 ? 'HIGH' : 'MEDIUM',
      message: `Error rate: ${dashboard.errorsPerMinute.toFixed(1)}/min`,
      detectedAt: now,
      metadata: { rate: dashboard.errorsPerMinute },
    });
  }
  
  // Check for log flood
  if (dashboard.logsPerMinute > 1000) {
    newAnomalies.push({
      type: 'LOG_FLOOD',
      severity: dashboard.logsPerMinute > 5000 ? 'HIGH' : 'MEDIUM',
      message: `Log rate: ${dashboard.logsPerMinute.toFixed(0)}/min`,
      detectedAt: now,
      metadata: { rate: dashboard.logsPerMinute },
    });
  }
  
  // Check for system silence (no observations in 5+ minutes)
  for (const system of health) {
    if (now - system.lastSeen > 300_000) {  // 5 minutes
      newAnomalies.push({
        type: 'SYSTEM_SILENCE',
        severity: 'MEDIUM',
        message: `System "${system.name}" silent for ${Math.floor((now - system.lastSeen) / 60000)}min`,
        detectedAt: now,
        metadata: { systemId: system.id, lastSeen: system.lastSeen },
      });
    }
  }
  
  // Check for degraded cluster (>50% systems degraded or error)
  const totalSystems = health.length;
  const problemSystems = health.filter(h => h.status === 'DEGRADED' || h.status === 'ERROR').length;
  if (totalSystems > 2 && problemSystems / totalSystems > 0.5) {
    newAnomalies.push({
      type: 'DEGRADED_CLUSTER',
      severity: 'HIGH',
      message: `${problemSystems}/${totalSystems} systems unhealthy`,
      detectedAt: now,
      metadata: { problemSystems, totalSystems },
    });
  }
  
  // Check for phase stuck (in same non-RUNTIME phase for too long)
  const phase = getPhase();
  if (phase !== 'RUNTIME' && phase !== 'SHUTDOWN' && now > 120_000) {  // 2 minutes
    newAnomalies.push({
      type: 'PHASE_STUCK',
      severity: 'HIGH',
      message: `Stuck in ${phase} phase for ${formatUptime(now)}`,
      detectedAt: now,
      metadata: { phase, uptimeMs: now },
    });
  }
  
  // Check for crash detection
  if (errorStats.crashDetected) {
    newAnomalies.push({
      type: 'ERROR_SPIKE',
      severity: 'CRITICAL',
      message: 'Crash detected by kernel error detector',
      detectedAt: now,
      metadata: { crashDetected: true },
    });
  }
  
  // Add new anomalies to detected list
  for (const anomaly of newAnomalies) {
    // Avoid duplicates (same type within last minute)
    const isDuplicate = detectedAnomalies.some(
      a => a.type === anomaly.type && now - a.detectedAt < 60_000
    );
    if (!isDuplicate) {
      detectedAnomalies.push(anomaly);
    }
  }
  
  // Keep only last 100 anomalies
  while (detectedAnomalies.length > 100) {
    detectedAnomalies.shift();
  }
  
  return detectedAnomalies;
}

/**
 * Get all detected anomalies
 */
export function getAnomalies(): SystemAnomaly[] {
  return [...detectedAnomalies];
}

/**
 * Get active (recent) anomalies
 */
export function getActiveAnomalies(windowMs = 300_000): SystemAnomaly[] {
  const now = getKernelUptime();
  return detectedAnomalies.filter(a => now - a.detectedAt < windowMs);
}

/**
 * Clear anomalies (after acknowledgment)
 */
export function clearAnomalies(): void {
  detectedAnomalies.length = 0;
}

// ============================================================================
// HEALTH SUMMARY
// ============================================================================

/**
 * Get overall system health
 */
export function getOverallHealth(): {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  message: string;
  details: string[];
} {
  const dashboard = getDashboard();
  const anomalies = getActiveAnomalies();
  const details: string[] = [];
  
  // Check for critical conditions
  const criticalAnomalies = anomalies.filter(a => a.severity === 'CRITICAL');
  if (criticalAnomalies.length > 0) {
    details.push(...criticalAnomalies.map(a => a.message));
    return {
      status: 'CRITICAL',
      message: `${criticalAnomalies.length} critical issue(s) detected`,
      details,
    };
  }
  
  // Check for high severity issues
  const highAnomalies = anomalies.filter(a => a.severity === 'HIGH');
  if (highAnomalies.length > 0 || dashboard.errorSystems > 0) {
    details.push(...highAnomalies.map(a => a.message));
    if (dashboard.errorSystems > 0) {
      details.push(`${dashboard.errorSystems} system(s) in error state`);
    }
    return {
      status: 'DEGRADED',
      message: 'System experiencing issues',
      details,
    };
  }
  
  // Check for medium issues
  if (dashboard.degradedSystems > 0) {
    details.push(`${dashboard.degradedSystems} system(s) degraded`);
    return {
      status: 'DEGRADED',
      message: 'Some systems degraded',
      details,
    };
  }
  
  // All clear
  details.push(`${dashboard.totalSystems} systems healthy`);
  details.push(`Uptime: ${dashboard.uptimeFormatted}`);
  return {
    status: 'HEALTHY',
    message: 'All systems operational',
    details,
  };
}

// ============================================================================
// EXPORT
// ============================================================================

/**
 * Export all metrics data
 */
export function exportMetrics(): {
  dashboard: KernelDashboard;
  trends: Record<string, MetricTrend>;
  anomalies: SystemAnomaly[];
  health: ReturnType<typeof getOverallHealth>;
  systems: SystemHealth[];
} {
  return {
    dashboard: getDashboard(),
    trends: getAllTrends(),
    anomalies: getAnomalies(),
    health: getOverallHealth(),
    systems: getSystemHealth(),
  };
}
