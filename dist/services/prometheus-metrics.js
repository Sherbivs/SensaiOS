/**
 * @file Prometheus Metrics Service
 * @description Exports time-windowed metrics in Prometheus format for production monitoring
 * @module services/prometheus-metrics
 * @since Week 3 Day 20-21 (Security Hardening Project)
 */

import { register, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import { calculateWindowStats, TIME_WINDOWS } from './statistics-window.js';

/**
 * Metrics registry (singleton)
 */
let metricsRegistry = null;
let metricsInitialized = false;

/**
 * Metric instances (counters, gauges, histograms)
 */
let metrics = {
  // Counters (monotonically increasing)
  roleAssignmentsTotal: null,
  cacheInvalidationsTotal: null,
  permissionViolationsTotal: null,
  distributedLockAcquisitions: null,
  
  // Gauges (current values, can go up/down)
  activeSweeps: null,
  cacheHitRate: null,
  revertFailureRate: null,
  
  // Histograms (distribution of values)
  sweepCandidates: null,
  roleAssignmentDuration: null,
  
  // Time-windowed gauges (from statistics-window.js)
  sweepsLast24Hours: null,
  alertsLast24Hours: null,
  permissionChangesLast24Hours: null,
  errorsLast24Hours: null,
  sweepRatePerHour: null,
  alertRatePerHour: null
};

/**
 * Initialize Prometheus metrics registry
 * @param {Object} options - Configuration options
 * @param {string} options.prefix - Metric name prefix (default: 'security_bot_')
 * @param {boolean} options.includeDefaultMetrics - Include Node.js default metrics (default: true)
 * @returns {Object} Metrics registry and metric instances
 */
export function initializeMetrics(options = {}) {
  if (metricsInitialized) {
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
    registers: [metricsRegistry]
  });
  
  metrics.cacheInvalidationsTotal = new Counter({
    name: `${prefix}cache_invalidations_total`,
    help: 'Total number of cache invalidations',
    labelNames: ['reason', 'guild_id', 'guild_name'],
    registers: [metricsRegistry]
  });
  
  metrics.permissionViolationsTotal = new Counter({
    name: `${prefix}permission_violations_total`,
    help: 'Total number of permission enforcement violations',
    labelNames: ['type', 'guild_id', 'guild_name'],
    registers: [metricsRegistry]
  });
  
  metrics.distributedLockAcquisitions = new Counter({
    name: `${prefix}distributed_lock_acquisitions_total`,
    help: 'Total number of distributed lock acquisition attempts',
    labelNames: ['result', 'resource_type'],
    registers: [metricsRegistry]
  });
  
  // === GAUGES (current values) ===
  
  metrics.activeSweeps = new Gauge({
    name: `${prefix}active_sweeps`,
    help: 'Number of currently active role sweeps',
    labelNames: ['guild_id', 'guild_name'],
    registers: [metricsRegistry]
  });
  
  metrics.cacheHitRate = new Gauge({
    name: `${prefix}cache_hit_rate`,
    help: 'Cache hit rate (percentage, 0-100)',
    labelNames: ['cache_type'],
    registers: [metricsRegistry]
  });
  
  metrics.revertFailureRate = new Gauge({
    name: `${prefix}revert_failure_rate`,
    help: 'Permission revert failure rate (percentage, 0-100)',
    labelNames: ['guild_id', 'guild_name'],
    registers: [metricsRegistry]
  });
  
  // === HISTOGRAMS (distributions) ===
  
  metrics.sweepCandidates = new Histogram({
    name: `${prefix}sweep_candidates`,
    help: 'Number of candidates per sweep operation',
    labelNames: ['guild_id', 'guild_name'],
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [metricsRegistry]
  });
  
  metrics.roleAssignmentDuration = new Histogram({
    name: `${prefix}role_assignment_duration_seconds`,
    help: 'Duration of role assignment operations in seconds',
    labelNames: ['origin', 'result'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [metricsRegistry]
  });
  
  // === TIME-WINDOWED GAUGES (from statistics-window.js) ===
  
  metrics.sweepsLast24Hours = new Gauge({
    name: `${prefix}sweeps_last_24_hours`,
    help: 'Number of sweeps in the last 24 hours',
    registers: [metricsRegistry]
  });
  
  metrics.alertsLast24Hours = new Gauge({
    name: `${prefix}alerts_last_24_hours`,
    help: 'Number of alerts in the last 24 hours',
    registers: [metricsRegistry]
  });
  
  metrics.permissionChangesLast24Hours = new Gauge({
    name: `${prefix}permission_changes_last_24_hours`,
    help: 'Number of permission changes detected in the last 24 hours',
    registers: [metricsRegistry]
  });
  
  metrics.errorsLast24Hours = new Gauge({
    name: `${prefix}errors_last_24_hours`,
    help: 'Number of errors in the last 24 hours',
    registers: [metricsRegistry]
  });
  
  metrics.sweepRatePerHour = new Gauge({
    name: `${prefix}sweep_rate_per_hour`,
    help: 'Average number of sweeps per hour (last 24 hours)',
    registers: [metricsRegistry]
  });
  
  metrics.alertRatePerHour = new Gauge({
    name: `${prefix}alert_rate_per_hour`,
    help: 'Average number of alerts per hour (last 24 hours)',
    registers: [metricsRegistry]
  });
  
  metricsInitialized = true;
  
  return { registry: metricsRegistry, metrics };
}

/**
 * Increment role assignment counter
 * @param {string} origin - Assignment origin (e.g., 'member-join', 'member-update')
 * @param {string} guildId - Guild ID
 * @param {string} guildName - Guild name
 * @param {string} result - Assignment result ('success', 'failed', 'skipped', 'cached')
 */
export function recordRoleAssignment(origin, guildId, guildName, result) {
  if (!metricsInitialized || !metrics.roleAssignmentsTotal) return;
  
  metrics.roleAssignmentsTotal.inc({
    origin,
    guild_id: guildId,
    guild_name: guildName,
    result
  });
}

/**
 * Increment cache invalidation counter
 * @param {string} reason - Invalidation reason (e.g., 'manual-removal', 'expired', 'shutdown')
 * @param {string} guildId - Guild ID
 * @param {string} guildName - Guild name
 */
export function recordCacheInvalidation(reason, guildId, guildName) {
  if (!metricsInitialized || !metrics.cacheInvalidationsTotal) return;
  
  metrics.cacheInvalidationsTotal.inc({
    reason,
    guild_id: guildId,
    guild_name: guildName
  });
}

/**
 * Increment permission violation counter
 * @param {string} type - Violation type (e.g., 'unauthorized-change', 'missing-permission')
 * @param {string} guildId - Guild ID
 * @param {string} guildName - Guild name
 */
export function recordPermissionViolation(type, guildId, guildName) {
  if (!metricsInitialized || !metrics.permissionViolationsTotal) return;
  
  metrics.permissionViolationsTotal.inc({
    type,
    guild_id: guildId,
    guild_name: guildName
  });
}

/**
 * Increment distributed lock acquisition counter
 * @param {string} result - Acquisition result ('success', 'failed', 'timeout')
 * @param {string} resourceType - Resource type (e.g., 'role-assignment', 'sweep')
 */
export function recordLockAcquisition(result, resourceType) {
  if (!metricsInitialized || !metrics.distributedLockAcquisitions) return;
  
  metrics.distributedLockAcquisitions.inc({
    result,
    resource_type: resourceType
  });
}

/**
 * Update active sweeps gauge
 * @param {string} guildId - Guild ID
 * @param {string} guildName - Guild name
 * @param {number} count - Number of active sweeps
 */
export function setActiveSweeps(guildId, guildName, count) {
  if (!metricsInitialized || !metrics.activeSweeps) return;
  
  metrics.activeSweeps.set({
    guild_id: guildId,
    guild_name: guildName
  }, count);
}

/**
 * Update cache hit rate gauge
 * @param {string} cacheType - Cache type (e.g., 'role-assignment', 'pokemon-data')
 * @param {number} hitRate - Hit rate percentage (0-100)
 */
export function setCacheHitRate(cacheType, hitRate) {
  if (!metricsInitialized || !metrics.cacheHitRate) return;
  
  metrics.cacheHitRate.set({
    cache_type: cacheType
  }, hitRate);
}

/**
 * Update revert failure rate gauge
 * @param {string} guildId - Guild ID
 * @param {string} guildName - Guild name
 * @param {number} failureRate - Failure rate percentage (0-100)
 */
export function setRevertFailureRate(guildId, guildName, failureRate) {
  if (!metricsInitialized || !metrics.revertFailureRate) return;
  
  metrics.revertFailureRate.set({
    guild_id: guildId,
    guild_name: guildName
  }, failureRate);
}

/**
 * Record sweep candidates histogram
 * @param {string} guildId - Guild ID
 * @param {string} guildName - Guild name
 * @param {number} candidateCount - Number of candidates in the sweep
 */
export function recordSweepCandidates(guildId, guildName, candidateCount) {
  if (!metricsInitialized || !metrics.sweepCandidates) return;
  
  metrics.sweepCandidates.observe({
    guild_id: guildId,
    guild_name: guildName
  }, candidateCount);
}

/**
 * Record role assignment duration histogram
 * @param {string} origin - Assignment origin
 * @param {string} result - Assignment result
 * @param {number} durationSeconds - Duration in seconds
 */
export function recordRoleAssignmentDuration(origin, result, durationSeconds) {
  if (!metricsInitialized || !metrics.roleAssignmentDuration) return;
  
  metrics.roleAssignmentDuration.observe({
    origin,
    result
  }, durationSeconds);
}

/**
 * Update time-windowed gauges from security bot state
 * @param {Object} state - Security bot state with metricsHistory
 */
export function updateTimeWindowedMetrics(state) {
  if (!metricsInitialized) return;
  if (!state || !state.metricsHistory || !state.metricsHistory.hourly) return;
  
  const metricsHistory = state.metricsHistory.hourly;
  
  // Calculate 24-hour window statistics
  const stats24h = calculateWindowStats(metricsHistory, TIME_WINDOWS.HOURS_24);
  
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
 * Get metrics in Prometheus text format
 * @returns {Promise<string>} Prometheus metrics text
 */
export async function getMetricsText() {
  if (!metricsInitialized || !metricsRegistry) {
    throw new Error('Metrics not initialized. Call initializeMetrics() first.');
  }
  
  return metricsRegistry.metrics();
}

/**
 * Get metrics in JSON format (for debugging)
 * @returns {Promise<Object>} Metrics JSON
 */
export async function getMetricsJson() {
  if (!metricsInitialized || !metricsRegistry) {
    throw new Error('Metrics not initialized. Call initializeMetrics() first.');
  }
  
  return metricsRegistry.getMetricsAsJSON();
}

/**
 * Get content type for Prometheus metrics endpoint
 * @returns {string} Content-Type header value
 */
export function getMetricsContentType() {
  if (!metricsRegistry) return 'text/plain; version=0.0.4; charset=utf-8';
  return metricsRegistry.contentType;
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics() {
  if (!metricsRegistry) return;
  metricsRegistry.resetMetrics();
}

/**
 * Shutdown metrics registry
 */
export function shutdownMetrics() {
  if (metricsRegistry) {
    register.clear();
    metricsRegistry = null;
    metricsInitialized = false;
    metrics = {};
  }
}

/**
 * Check if metrics are initialized
 * @returns {boolean}
 */
export function isMetricsInitialized() {
  return metricsInitialized;
}

/**
 * Get metrics registry (for advanced usage)
 * @returns {Object|null} Metrics registry
 */
export function getRegistry() {
  return metricsRegistry;
}

/**
 * Get all metric instances (for advanced usage)
 * @returns {Object} Metrics instances
 */
export function getMetrics() {
  return metrics;
}
