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
 * - Infrastructure metrics (memory, CPU, disk, network)
 * 
 * Provides a unified view of the entire system health at any moment.
 * 
 * Metric Flow:
 * ```
 * [resource-monitor.ts] ──┐
 * [prometheus-metrics.ts] ├──► [kernel-metrics.ts] ──► [kernel-observer.ts]
 * [restart-metrics.ts] ───┘                                    │
 *                                                              ▼
 *                                                  [KernelStateExport]
 * ```
 * 
 * @module kernel/metrics
 */

import { kernel, getKernelUptime, getKernelLogStats } from './kernel-logger.js';
import { getErrorStats, getPhase } from './kernel-error-detector.js';
import { getMetrics as getObserverMetrics, getSystemHealth, getRegisteredSystems } from './kernel-observer.js';
import type { 
  LifecyclePhase, 
  SystemHealth, 
  SystemRegistration as _SystemRegistration,
  MetricCategory,
  MetricUnit as _MetricUnit,
  MetricType as _MetricType,
  MetricHook,
  ResourceMetricObservation,
  InfrastructureMetrics,
  MetricDefinition,
} from './kernel-types.js';

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
  infrastructure: InfrastructureMetrics;
} {
  return {
    dashboard: getDashboard(),
    trends: getAllTrends(),
    anomalies: getAnomalies(),
    health: getOverallHealth(),
    systems: getSystemHealth(),
    infrastructure: getInfrastructureMetrics(),
  };
}

// ============================================================================
// INFRASTRUCTURE METRICS — Resource Tracking at Kernel Level
// ============================================================================

const MAX_METRIC_BUFFER = 500;           // Recent metric observations to keep
const MAX_METRIC_DEFINITIONS = 200;      // Maximum registered metrics
const _AGGREGATION_WINDOW_MS = 60_000;   // 1 minute aggregation window (reserved for future)

// Infrastructure metric observation buffer (ring buffer)
const infraMetricObservations: ResourceMetricObservation[] = [];

// Registered metric definitions
const metricDefinitions = new Map<string, MetricDefinition>();

// Metric hooks (for real-time forwarding)
const metricHooks: MetricHook[] = [];

// Latest values by metric name (for quick access)
const latestMetricValues = new Map<string, ResourceMetricObservation>();

// Counters
let totalInfraMetricObservations = 0;

// Cached aggregation (updated periodically)
let cachedInfrastructureMetrics: InfrastructureMetrics | null = null;
let lastInfraAggregationTime = 0;

/**
 * Initialize the infrastructure metrics system
 * Called automatically on module load
 */
function initializeInfrastructureMetrics(): void {
  kernel.boot('metrics', 'Infrastructure Metrics initialized — resource tracking active');
  registerCoreMetricDefinitions();
}

/**
 * Register core infrastructure metric definitions
 */
function registerCoreMetricDefinitions(): void {
  // Memory metrics
  registerMetricDefinition({
    name: 'memory_rss_bytes',
    category: 'MEMORY',
    type: 'gauge',
    unit: 'bytes',
    description: 'Resident Set Size (total memory allocated)',
  });
  
  registerMetricDefinition({
    name: 'memory_heap_used_bytes',
    category: 'MEMORY',
    type: 'gauge',
    unit: 'bytes',
    description: 'V8 heap used',
  });
  
  registerMetricDefinition({
    name: 'memory_heap_total_bytes',
    category: 'MEMORY',
    type: 'gauge',
    unit: 'bytes',
    description: 'V8 heap total',
  });
  
  registerMetricDefinition({
    name: 'memory_utilization_percent',
    category: 'MEMORY',
    type: 'gauge',
    unit: 'percent',
    description: 'Memory utilization percentage',
  });
  
  // CPU metrics
  registerMetricDefinition({
    name: 'cpu_usage_percent',
    category: 'CPU',
    type: 'gauge',
    unit: 'percent',
    description: 'CPU utilization percentage',
  });
  
  registerMetricDefinition({
    name: 'event_loop_lag_ms',
    category: 'CPU',
    type: 'gauge',
    unit: 'milliseconds',
    description: 'Event loop lag',
  });
  
  // Disk metrics
  registerMetricDefinition({
    name: 'disk_used_bytes',
    category: 'DISK',
    type: 'gauge',
    unit: 'bytes',
    description: 'Disk space used',
  });
  
  registerMetricDefinition({
    name: 'disk_utilization_percent',
    category: 'DISK',
    type: 'gauge',
    unit: 'percent',
    description: 'Disk utilization percentage',
  });
  
  // Database metrics
  registerMetricDefinition({
    name: 'db_connections_active',
    category: 'DATABASE',
    type: 'gauge',
    unit: 'count',
    description: 'Active database connections',
  });
  
  registerMetricDefinition({
    name: 'db_query_duration_ms',
    category: 'DATABASE',
    type: 'histogram',
    unit: 'milliseconds',
    description: 'Database query duration',
    labels: ['operation'],
  });
  
  // Cache metrics
  registerMetricDefinition({
    name: 'cache_hit_rate',
    category: 'CACHE',
    type: 'gauge',
    unit: 'ratio',
    description: 'Cache hit rate (0-1)',
  });
  
  registerMetricDefinition({
    name: 'cache_size_bytes',
    category: 'CACHE',
    type: 'gauge',
    unit: 'bytes',
    description: 'Cache size in bytes',
  });
  
  // Worker metrics
  registerMetricDefinition({
    name: 'worker_tasks_total',
    category: 'WORKER',
    type: 'counter',
    unit: 'count',
    description: 'Total worker tasks',
    labels: ['worker', 'status'],
  });
  
  registerMetricDefinition({
    name: 'worker_task_duration_ms',
    category: 'WORKER',
    type: 'histogram',
    unit: 'milliseconds',
    description: 'Worker task duration',
    labels: ['worker', 'task'],
  });
  
  // Discord metrics
  registerMetricDefinition({
    name: 'discord_latency_ms',
    category: 'DISCORD',
    type: 'gauge',
    unit: 'milliseconds',
    description: 'Discord gateway latency',
  });
  
  // System health
  registerMetricDefinition({
    name: 'system_health_score',
    category: 'SYSTEM',
    type: 'gauge',
    unit: 'gauge',
    description: 'Overall system health (0-100)',
  });
  
  kernel.debug('metrics', `Registered ${metricDefinitions.size} core metric definitions`);
}

// ============================================================================
// METRIC REGISTRATION
// ============================================================================

/**
 * Register a new metric definition
 */
export function registerMetricDefinition(definition: MetricDefinition): void {
  if (metricDefinitions.size >= MAX_METRIC_DEFINITIONS) {
    kernel.warn('metrics', 'Maximum metric definitions reached, ignoring new registration', {
      metric: definition.name,
    });
    return;
  }
  
  metricDefinitions.set(definition.name, definition);
}

/**
 * Get all registered metric definitions
 */
export function getMetricDefinitions(): MetricDefinition[] {
  return Array.from(metricDefinitions.values());
}

// ============================================================================
// METRIC OBSERVATION
// ============================================================================

/**
 * Record a metric observation
 * 
 * Called by application monitors to report metrics to kernel.
 * 
 * @param observation - Partial observation (uptimeMs added automatically)
 */
export function observeInfraMetric(observation: Omit<ResourceMetricObservation, 'uptimeMs'>): void {
  const fullObservation: ResourceMetricObservation = {
    ...observation,
    uptimeMs: getKernelUptime(),
  };
  
  // Add to buffer (ring buffer behavior)
  infraMetricObservations.push(fullObservation);
  if (infraMetricObservations.length > MAX_METRIC_BUFFER) {
    infraMetricObservations.shift();
  }
  
  // Update latest value
  latestMetricValues.set(observation.name, fullObservation);
  
  totalInfraMetricObservations++;
  
  // Forward to hooks
  for (const hook of metricHooks) {
    try {
      hook(fullObservation);
    } catch (error) {
      kernel.error('metrics', 'Metric hook error', { error });
    }
  }
  
  // Invalidate cache
  cachedInfrastructureMetrics = null;
}

/**
 * Record multiple metrics at once (batch observation)
 */
export function observeInfraMetrics(observations: Omit<ResourceMetricObservation, 'uptimeMs'>[]): void {
  for (const obs of observations) {
    observeInfraMetric(obs);
  }
}

// ============================================================================
// METRIC HOOKS
// ============================================================================

/**
 * Subscribe to metric observations
 */
export function onInfraMetric(hook: MetricHook): () => void {
  metricHooks.push(hook);
  return () => {
    const index = metricHooks.indexOf(hook);
    if (index !== -1) metricHooks.splice(index, 1);
  };
}

// ============================================================================
// METRIC QUERIES
// ============================================================================

/**
 * Get recent infrastructure metric observations
 */
export function getRecentInfraMetrics(limit = 100): ResourceMetricObservation[] {
  return infraMetricObservations.slice(-limit);
}

/**
 * Get recent metrics by category
 */
export function getInfraMetricsByCategory(category: MetricCategory, limit = 50): ResourceMetricObservation[] {
  return infraMetricObservations
    .filter(m => m.category === category)
    .slice(-limit);
}

/**
 * Get latest value for a metric
 */
export function getLatestInfraMetric(name: string): ResourceMetricObservation | undefined {
  return latestMetricValues.get(name);
}

/**
 * Get all latest metric values
 */
export function getAllLatestInfraMetrics(): Map<string, ResourceMetricObservation> {
  return new Map(latestMetricValues);
}

// ============================================================================
// INFRASTRUCTURE AGGREGATION
// ============================================================================

/**
 * Get aggregated infrastructure metrics
 * 
 * This provides a snapshot of all infrastructure metrics, aggregated and
 * ready for display or export.
 */
export function getInfrastructureMetrics(): InfrastructureMetrics {
  const now = getKernelUptime();
  
  // Return cached if recent (within 5 seconds)
  if (cachedInfrastructureMetrics && now - lastInfraAggregationTime < 5000) {
    return cachedInfrastructureMetrics;
  }
  
  // Build aggregation from latest values
  const metrics: InfrastructureMetrics = {
    // Memory
    memoryRssMB: getInfraMetricNumber('memory_rss_bytes', 0) / (1024 * 1024),
    memoryHeapUsedMB: getInfraMetricNumber('memory_heap_used_bytes', 0) / (1024 * 1024),
    memoryHeapTotalMB: getInfraMetricNumber('memory_heap_total_bytes', 0) / (1024 * 1024),
    memoryExternalMB: getInfraMetricNumber('memory_external_bytes', 0) / (1024 * 1024),
    memoryUtilizationPercent: getInfraMetricNumber('memory_utilization_percent', 0),
    
    // CPU
    cpuUsagePercent: getInfraMetricNumber('cpu_usage_percent', 0),
    eventLoopLagMs: getInfraMetricNumber('event_loop_lag_ms', 0),
    
    // Storage
    diskUsedMB: getInfraMetricNumber('disk_used_bytes', 0) / (1024 * 1024),
    diskFreeMB: getInfraMetricNumber('disk_free_bytes', 0) / (1024 * 1024),
    diskUtilizationPercent: getInfraMetricNumber('disk_utilization_percent', 0),
    
    // Database
    dbConnectionsActive: getInfraMetricNumber('db_connections_active', 0),
    dbQueryLatencyMs: getInfraMetricNumber('db_query_duration_ms', 0),
    dbQueryCount: getInfraMetricNumber('db_query_total', 0),
    
    // Cache
    cacheHitRate: getInfraMetricNumber('cache_hit_rate', 0),
    cacheSizeMB: getInfraMetricNumber('cache_size_bytes', 0) / (1024 * 1024),
    cacheEntryCount: getInfraMetricNumber('cache_entries', 0),
    
    // Workers
    workersActive: getInfraMetricNumber('workers_active', 0),
    workersIdle: getInfraMetricNumber('workers_idle', 0),
    workerTasksCompleted: getInfraMetricNumber('worker_tasks_completed', 0),
    workerTasksFailed: getInfraMetricNumber('worker_tasks_failed', 0),
    
    // Discord
    discordLatencyMs: getInfraMetricNumber('discord_latency_ms', 0),
    discordGatewayStatus: getInfraMetricString('discord_gateway_status', 'UNKNOWN'),
    
    // Aggregated
    healthScore: calculateInfraHealthScore(),
    alertLevel: calculateInfraAlertLevel(),
    lastUpdated: new Date(),
  };
  
  // Cache the result
  cachedInfrastructureMetrics = metrics;
  lastInfraAggregationTime = now;
  
  return metrics;
}

/**
 * Get a latest metric value as number
 */
function getInfraMetricNumber(name: string, defaultValue: number): number {
  const metric = latestMetricValues.get(name);
  return metric?.value ?? defaultValue;
}

/**
 * Get a latest metric value from metadata as string
 */
function getInfraMetricString(name: string, defaultValue: string): string {
  const metric = latestMetricValues.get(name);
  return (metric?.metadata?.stringValue as string) ?? defaultValue;
}

/**
 * Calculate overall system health score (0-100)
 */
function calculateInfraHealthScore(): number {
  let score = 100;
  
  // Memory health (weight: 30)
  const memUtil = getInfraMetricNumber('memory_utilization_percent', 0);
  if (memUtil > 90) score -= 30;
  else if (memUtil > 85) score -= 20;
  else if (memUtil > 75) score -= 10;
  else if (memUtil > 60) score -= 5;
  
  // CPU health (weight: 20)
  const cpuUtil = getInfraMetricNumber('cpu_usage_percent', 0);
  if (cpuUtil > 90) score -= 20;
  else if (cpuUtil > 70) score -= 10;
  else if (cpuUtil > 50) score -= 5;
  
  // Disk health (weight: 15)
  const diskUtil = getInfraMetricNumber('disk_utilization_percent', 0);
  if (diskUtil > 90) score -= 15;
  else if (diskUtil > 75) score -= 8;
  else if (diskUtil > 50) score -= 3;
  
  // Event loop lag (weight: 15)
  const lag = getInfraMetricNumber('event_loop_lag_ms', 0);
  if (lag > 1000) score -= 15;
  else if (lag > 500) score -= 10;
  else if (lag > 100) score -= 5;
  
  // Cache hit rate (weight: 10)
  const hitRate = getInfraMetricNumber('cache_hit_rate', 1);
  if (hitRate < 0.5) score -= 10;
  else if (hitRate < 0.7) score -= 5;
  
  // Discord latency (weight: 10)
  const discordLat = getInfraMetricNumber('discord_latency_ms', 0);
  if (discordLat > 500) score -= 10;
  else if (discordLat > 250) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate alert level based on current metrics
 */
function calculateInfraAlertLevel(): InfrastructureMetrics['alertLevel'] {
  const memUtil = getInfraMetricNumber('memory_utilization_percent', 0);
  const cpuUtil = getInfraMetricNumber('cpu_usage_percent', 0);
  const diskUtil = getInfraMetricNumber('disk_utilization_percent', 0);
  
  // Emergency thresholds
  if (memUtil > 90 || cpuUtil > 90 || diskUtil > 90) {
    return 'EMERGENCY';
  }
  
  // Critical thresholds
  if (memUtil > 85 || cpuUtil > 70 || diskUtil > 75) {
    return 'CRITICAL';
  }
  
  // Warning thresholds
  if (memUtil > 75 || cpuUtil > 50 || diskUtil > 50) {
    return 'WARNING';
  }
  
  return 'NORMAL';
}

// ============================================================================
// INFRASTRUCTURE STATISTICS
// ============================================================================

/**
 * Get infrastructure metric statistics
 */
export function getInfraMetricStats(): {
  totalObservations: number;
  uniqueMetrics: number;
  metricsInBuffer: number;
  definitionsRegistered: number;
  categoryCounts: Record<MetricCategory, number>;
} {
  const categoryCounts: Record<MetricCategory, number> = {
    MEMORY: 0,
    CPU: 0,
    DISK: 0,
    NETWORK: 0,
    DATABASE: 0,
    CACHE: 0,
    WORKER: 0,
    DISCORD: 0,
    GAME: 0,
    SYSTEM: 0,
  };
  
  for (const observation of infraMetricObservations) {
    categoryCounts[observation.category]++;
  }
  
  return {
    totalObservations: totalInfraMetricObservations,
    uniqueMetrics: latestMetricValues.size,
    metricsInBuffer: infraMetricObservations.length,
    definitionsRegistered: metricDefinitions.size,
    categoryCounts,
  };
}

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Shutdown the metrics system (clears hooks and buffers)
 */
export function shutdownMetrics(): void {
  kernel.boot('metrics', 'Kernel Metrics shutting down');
  
  // Clear hooks
  metricHooks.length = 0;
  
  // Clear buffers
  infraMetricObservations.length = 0;
  latestMetricValues.clear();
}

// ============================================================================
// AUTO-INITIALIZE
// ============================================================================

initializeInfrastructureMetrics();
