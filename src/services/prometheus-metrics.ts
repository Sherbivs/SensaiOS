/**
 * Prometheus Metrics Service
 * @module services/prometheus-metrics
 *
 * Exports time-windowed metrics in Prometheus format for production monitoring.
 */

import { register, Counter, Gauge, Histogram, collectDefaultMetrics, Registry } from 'prom-client';
import {
  calculateWindowStats,
  TIME_WINDOWS,
  type HourlyMetric,
  type MetricsHistory,
  type SecurityBotState,
  type WindowStats,
} from './statistics-window.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MetricLabels {
  origin?: string;
  guild_id?: string;
  guild_name?: string;
  result?: string;
  reason?: string;
  type?: string;
  resource_type?: string;
  cache_type?: string;
}

interface MetricsInstances {
  // Counters (monotonically increasing)
  roleAssignmentsTotal: Counter<string> | null;
  cacheInvalidationsTotal: Counter<string> | null;
  permissionViolationsTotal: Counter<string> | null;
  distributedLockAcquisitions: Counter<string> | null;

  // Gauges (current values, can go up/down)
  activeSweeps: Gauge<string> | null;
  cacheHitRate: Gauge<string> | null;
  revertFailureRate: Gauge<string> | null;

  // Histograms (distribution of values)
  sweepCandidates: Histogram<string> | null;
  roleAssignmentDuration: Histogram<string> | null;

  // Time-windowed gauges (from statistics-window.js)
  sweepsLast24Hours: Gauge<string> | null;
  alertsLast24Hours: Gauge<string> | null;
  permissionChangesLast24Hours: Gauge<string> | null;
  errorsLast24Hours: Gauge<string> | null;
  sweepRatePerHour: Gauge<string> | null;
  alertRatePerHour: Gauge<string> | null;
}

interface InitializeResult {
  registry: Registry;
  metrics: MetricsInstances;
}

interface InitializeOptions {
  prefix?: string;
  includeDefaultMetrics?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metrics registry (singleton).
 */
let metricsRegistry: Registry | null = null;
let metricsInitialized = false;

/**
 * Metric instances (counters, gauges, histograms).
 */
let metrics: MetricsInstances = {
  roleAssignmentsTotal: null,
  cacheInvalidationsTotal: null,
  permissionViolationsTotal: null,
  distributedLockAcquisitions: null,
  activeSweeps: null,
  cacheHitRate: null,
  revertFailureRate: null,
  sweepCandidates: null,
  roleAssignmentDuration: null,
  sweepsLast24Hours: null,
  alertsLast24Hours: null,
  permissionChangesLast24Hours: null,
  errorsLast24Hours: null,
  sweepRatePerHour: null,
  alertRatePerHour: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize Prometheus metrics registry.
 */
export function initializeMetrics(options: InitializeOptions = {}): InitializeResult {
  if (metricsInitialized && metricsRegistry) {
    return { registry: metricsRegistry, metrics };
  }

  const { prefix = 'security_bot_', includeDefaultMetrics = true } = options;

  // Clear existing registry
  register.clear();
  metricsRegistry = register;

  // Include default Node.js metrics (process CPU, memory, event loop, etc.)
  if (includeDefaultMetrics) {
    collectDefaultMetrics({ register: metricsRegistry, prefix });
  }

  // === COUNTERS (monotonically increasing) ===

  metrics.roleAssignmentsTotal = new Counter({
    name: `${prefix}role_assignments_total`,
    help: 'Total number of role assignments attempted',
    labelNames: ['origin', 'guild_id', 'guild_name', 'result'],
    registers: [metricsRegistry],
  });

  metrics.cacheInvalidationsTotal = new Counter({
    name: `${prefix}cache_invalidations_total`,
    help: 'Total number of cache invalidations',
    labelNames: ['reason', 'guild_id', 'guild_name'],
    registers: [metricsRegistry],
  });

  metrics.permissionViolationsTotal = new Counter({
    name: `${prefix}permission_violations_total`,
    help: 'Total number of permission enforcement violations',
    labelNames: ['type', 'guild_id', 'guild_name'],
    registers: [metricsRegistry],
  });

  metrics.distributedLockAcquisitions = new Counter({
    name: `${prefix}distributed_lock_acquisitions_total`,
    help: 'Total number of distributed lock acquisition attempts',
    labelNames: ['result', 'resource_type'],
    registers: [metricsRegistry],
  });

  // === GAUGES (current values) ===

  metrics.activeSweeps = new Gauge({
    name: `${prefix}active_sweeps`,
    help: 'Number of currently active role sweeps',
    labelNames: ['guild_id', 'guild_name'],
    registers: [metricsRegistry],
  });

  metrics.cacheHitRate = new Gauge({
    name: `${prefix}cache_hit_rate`,
    help: 'Cache hit rate (percentage, 0-100)',
    labelNames: ['cache_type'],
    registers: [metricsRegistry],
  });

  metrics.revertFailureRate = new Gauge({
    name: `${prefix}revert_failure_rate`,
    help: 'Permission revert failure rate (percentage, 0-100)',
    labelNames: ['guild_id', 'guild_name'],
    registers: [metricsRegistry],
  });

  // === HISTOGRAMS (distributions) ===

  metrics.sweepCandidates = new Histogram({
    name: `${prefix}sweep_candidates`,
    help: 'Number of candidates per sweep operation',
    labelNames: ['guild_id', 'guild_name'],
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [metricsRegistry],
  });

  metrics.roleAssignmentDuration = new Histogram({
    name: `${prefix}role_assignment_duration_seconds`,
    help: 'Duration of role assignment operations in seconds',
    labelNames: ['origin', 'result'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [metricsRegistry],
  });

  // === TIME-WINDOWED GAUGES (from statistics-window.js) ===

  metrics.sweepsLast24Hours = new Gauge({
    name: `${prefix}sweeps_last_24_hours`,
    help: 'Number of sweeps in the last 24 hours',
    registers: [metricsRegistry],
  });

  metrics.alertsLast24Hours = new Gauge({
    name: `${prefix}alerts_last_24_hours`,
    help: 'Number of alerts in the last 24 hours',
    registers: [metricsRegistry],
  });

  metrics.permissionChangesLast24Hours = new Gauge({
    name: `${prefix}permission_changes_last_24_hours`,
    help: 'Number of permission changes detected in the last 24 hours',
    registers: [metricsRegistry],
  });

  metrics.errorsLast24Hours = new Gauge({
    name: `${prefix}errors_last_24_hours`,
    help: 'Number of errors in the last 24 hours',
    registers: [metricsRegistry],
  });

  metrics.sweepRatePerHour = new Gauge({
    name: `${prefix}sweep_rate_per_hour`,
    help: 'Average number of sweeps per hour (last 24 hours)',
    registers: [metricsRegistry],
  });

  metrics.alertRatePerHour = new Gauge({
    name: `${prefix}alert_rate_per_hour`,
    help: 'Average number of alerts per hour (last 24 hours)',
    registers: [metricsRegistry],
  });

  metricsInitialized = true;

  return { registry: metricsRegistry, metrics };
}

/**
 * Increment role assignment counter.
 */
export function recordRoleAssignment(
  origin: string,
  guildId: string,
  guildName: string,
  result: string
): void {
  if (!metricsInitialized || !metrics.roleAssignmentsTotal) return;

  metrics.roleAssignmentsTotal.inc({
    origin,
    guild_id: guildId,
    guild_name: guildName,
    result,
  });
}

/**
 * Increment cache invalidation counter.
 */
export function recordCacheInvalidation(reason: string, guildId: string, guildName: string): void {
  if (!metricsInitialized || !metrics.cacheInvalidationsTotal) return;

  metrics.cacheInvalidationsTotal.inc({
    reason,
    guild_id: guildId,
    guild_name: guildName,
  });
}

/**
 * Increment permission violation counter.
 */
export function recordPermissionViolation(type: string, guildId: string, guildName: string): void {
  if (!metricsInitialized || !metrics.permissionViolationsTotal) return;

  metrics.permissionViolationsTotal.inc({
    type,
    guild_id: guildId,
    guild_name: guildName,
  });
}

/**
 * Increment distributed lock acquisition counter.
 */
export function recordLockAcquisition(result: string, resourceType: string): void {
  if (!metricsInitialized || !metrics.distributedLockAcquisitions) return;

  metrics.distributedLockAcquisitions.inc({
    result,
    resource_type: resourceType,
  });
}

/**
 * Update active sweeps gauge.
 */
export function setActiveSweeps(guildId: string, guildName: string, count: number): void {
  if (!metricsInitialized || !metrics.activeSweeps) return;

  metrics.activeSweeps.set(
    {
      guild_id: guildId,
      guild_name: guildName,
    },
    count
  );
}

/**
 * Update cache hit rate gauge.
 */
export function setCacheHitRate(cacheType: string, hitRate: number): void {
  if (!metricsInitialized || !metrics.cacheHitRate) return;

  metrics.cacheHitRate.set(
    {
      cache_type: cacheType,
    },
    hitRate
  );
}

/**
 * Update revert failure rate gauge.
 */
export function setRevertFailureRate(guildId: string, guildName: string, failureRate: number): void {
  if (!metricsInitialized || !metrics.revertFailureRate) return;

  metrics.revertFailureRate.set(
    {
      guild_id: guildId,
      guild_name: guildName,
    },
    failureRate
  );
}

/**
 * Record sweep candidates histogram.
 */
export function recordSweepCandidates(
  guildId: string,
  guildName: string,
  candidateCount: number
): void {
  if (!metricsInitialized || !metrics.sweepCandidates) return;

  metrics.sweepCandidates.observe(
    {
      guild_id: guildId,
      guild_name: guildName,
    },
    candidateCount
  );
}

/**
 * Record role assignment duration histogram.
 */
export function recordRoleAssignmentDuration(
  origin: string,
  result: string,
  durationSeconds: number
): void {
  if (!metricsInitialized || !metrics.roleAssignmentDuration) return;

  metrics.roleAssignmentDuration.observe(
    {
      origin,
      result,
    },
    durationSeconds
  );
}

/**
 * Update time-windowed gauges from security bot state.
 */
export function updateTimeWindowedMetrics(state: SecurityBotState | null): void {
  if (!metricsInitialized) return;
  if (!state || !state.metricsHistory || !state.metricsHistory.hourly) return;

  const metricsHistory = state.metricsHistory.hourly;

  // Calculate 24-hour window statistics
  const stats24h = calculateWindowStats(metricsHistory, TIME_WINDOWS.HOURS_24) as WindowStats;

  // Update gauges
  if (metrics.sweepsLast24Hours) {
    metrics.sweepsLast24Hours.set(stats24h.sweeps);
  }

  if (metrics.alertsLast24Hours) {
    metrics.alertsLast24Hours.set(stats24h.alerts);
  }

  if (metrics.permissionChangesLast24Hours) {
    metrics.permissionChangesLast24Hours.set(stats24h.permissionChanges);
  }

  if (metrics.errorsLast24Hours) {
    metrics.errorsLast24Hours.set(stats24h.errors);
  }

  // Calculate rates (events per hour)
  const windowHours = stats24h.hoursWithData || 1; // Avoid division by zero

  if (metrics.sweepRatePerHour) {
    const sweepRate = stats24h.sweeps / windowHours;
    metrics.sweepRatePerHour.set(sweepRate);
  }

  if (metrics.alertRatePerHour) {
    const alertRate = stats24h.alerts / windowHours;
    metrics.alertRatePerHour.set(alertRate);
  }
}

/**
 * Get metrics in Prometheus text format.
 */
export async function getMetricsText(): Promise<string> {
  if (!metricsInitialized || !metricsRegistry) {
    throw new Error('Metrics not initialized. Call initializeMetrics() first.');
  }

  return metricsRegistry.metrics();
}

/**
 * Get metrics in JSON format (for debugging).
 */
export async function getMetricsJson(): Promise<unknown[]> {
  if (!metricsInitialized || !metricsRegistry) {
    throw new Error('Metrics not initialized. Call initializeMetrics() first.');
  }

  return metricsRegistry.getMetricsAsJSON();
}

/**
 * Get content type for Prometheus metrics endpoint.
 */
export function getMetricsContentType(): string {
  if (!metricsRegistry) return 'text/plain; version=0.0.4; charset=utf-8';
  return metricsRegistry.contentType;
}

/**
 * Reset all metrics (for testing).
 */
export function resetMetrics(): void {
  if (!metricsRegistry) return;
  metricsRegistry.resetMetrics();
}

/**
 * Shutdown metrics registry.
 */
export function shutdownMetrics(): void {
  if (metricsRegistry) {
    register.clear();
    metricsRegistry = null;
    metricsInitialized = false;
    metrics = {
      roleAssignmentsTotal: null,
      cacheInvalidationsTotal: null,
      permissionViolationsTotal: null,
      distributedLockAcquisitions: null,
      activeSweeps: null,
      cacheHitRate: null,
      revertFailureRate: null,
      sweepCandidates: null,
      roleAssignmentDuration: null,
      sweepsLast24Hours: null,
      alertsLast24Hours: null,
      permissionChangesLast24Hours: null,
      errorsLast24Hours: null,
      sweepRatePerHour: null,
      alertRatePerHour: null,
    };
  }
}

/**
 * Check if metrics are initialized.
 */
export function isMetricsInitialized(): boolean {
  return metricsInitialized;
}

/**
 * Get metrics registry (for advanced usage).
 */
export function getRegistry(): Registry | null {
  return metricsRegistry;
}

/**
 * Get all metric instances (for advanced usage).
 */
export function getMetrics(): MetricsInstances {
  return metrics;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────────────────────

export type { MetricsInstances, InitializeOptions, InitializeResult, SecurityBotState };
