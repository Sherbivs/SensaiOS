/**
 * @file Statistics Window Calculator
 * @description Provides rolling time window statistics to prevent integer overflow
 *              on long-running bot instances. Replaces cumulative counters with
 *              time-bounded aggregations (24h, 7d, 30d windows).
 * @module services/statistics-window
 * @since Week 3 Day 18-19 (Security Hardening Project)
 */

/**
 * Time window configurations (in milliseconds)
 */
export const TIME_WINDOWS = {
  HOUR_1: 1 * 60 * 60 * 1000,       // 1 hour
  HOURS_24: 24 * 60 * 60 * 1000,    // 24 hours
  DAYS_7: 7 * 24 * 60 * 60 * 1000,  // 7 days
  DAYS_30: 30 * 24 * 60 * 60 * 1000 // 30 days
};

/**
 * Calculate statistics for a specific time window
 * @param {Array} metricsHistory - Array of hourly metric objects from state.metricsHistory.hourly
 * @param {number} windowMs - Time window in milliseconds (use TIME_WINDOWS constants)
 * @returns {Object} Aggregated statistics for the time window
 */
export function calculateWindowStats(metricsHistory, windowMs) {
  if (!Array.isArray(metricsHistory) || metricsHistory.length === 0) {
    return createEmptyStats();
  }
  
  const now = Date.now();
  const cutoffTime = now - windowMs;
  
  // Filter metrics within the time window
  const windowMetrics = metricsHistory.filter(m => {
    const timestamp = new Date(m.timestamp).getTime();
    return timestamp >= cutoffTime && timestamp <= now;
  });
  
  // Aggregate metrics
  const stats = createEmptyStats();
  stats.hoursWithData = windowMetrics.length;
  stats.windowStart = windowMetrics.length > 0
    ? new Date(Math.min(...windowMetrics.map(m => new Date(m.timestamp).getTime()))).toISOString()
    : null;
  stats.windowEnd = new Date(now).toISOString();
  
  for (const m of windowMetrics) {
    stats.sweeps += m.sweeps || 0;
    stats.alerts += m.alerts || 0;
    stats.permissionChanges += m.permissionChanges || 0;
    stats.permissionReverts += m.permissionReverts || 0;
    stats.revertFailures += m.revertFailures || 0;
    stats.errors += m.errors || 0;
    stats.memberFetchTimeouts += m.memberFetchTimeouts || 0;
    stats.restarts += m.restarts || 0;
  }
  
  return stats;
}

/**
 * Calculate statistics for multiple time windows (24h, 7d, 30d)
 * @param {Array} metricsHistory - Array of hourly metric objects from state.metricsHistory.hourly
 * @returns {Object} Statistics for all time windows
 */
export function calculateAllWindows(metricsHistory) {
  return {
    last24Hours: calculateWindowStats(metricsHistory, TIME_WINDOWS.HOURS_24),
    last7Days: calculateWindowStats(metricsHistory, TIME_WINDOWS.DAYS_7),
    last30Days: calculateWindowStats(metricsHistory, TIME_WINDOWS.DAYS_30)
  };
}

/**
 * Calculate rate statistics (events per hour/day)
 * @param {Object} windowStats - Statistics object from calculateWindowStats
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Object} Rate statistics (per hour, per day)
 */
export function calculateRates(windowStats, windowMs) {
  if (!windowStats || windowStats.hoursWithData === 0) {
    return {
      sweepsPerHour: 0,
      sweepsPerDay: 0,
      alertsPerHour: 0,
      alertsPerDay: 0,
      permissionChangesPerHour: 0,
      permissionChangesPerDay: 0,
      errorsPerHour: 0,
      errorsPerDay: 0
    };
  }
  
  const windowHours = windowMs / (60 * 60 * 1000);
  const windowDays = windowHours / 24;
  
  // Calculate rates
  const sweepsPerHour = windowStats.sweeps / windowHours;
  const alertsPerHour = windowStats.alerts / windowHours;
  const permissionChangesPerHour = windowStats.permissionChanges / windowHours;
  const errorsPerHour = windowStats.errors / windowHours;
  
  return {
    sweepsPerHour: Number(sweepsPerHour.toFixed(2)),
    sweepsPerDay: Number((sweepsPerHour * 24).toFixed(2)),
    alertsPerHour: Number(alertsPerHour.toFixed(2)),
    alertsPerDay: Number((alertsPerHour * 24).toFixed(2)),
    permissionChangesPerHour: Number(permissionChangesPerHour.toFixed(2)),
    permissionChangesPerDay: Number((permissionChangesPerHour * 24).toFixed(2)),
    errorsPerHour: Number(errorsPerHour.toFixed(2)),
    errorsPerDay: Number((errorsPerHour * 24).toFixed(2)),
    windowHours: Number(windowHours.toFixed(1)),
    windowDays: Number(windowDays.toFixed(1))
  };
}

/**
 * Get comprehensive statistics report with all windows and rates
 * @param {Object} state - Security bot state object with metricsHistory
 * @returns {Object} Comprehensive statistics report
 */
export function getComprehensiveStats(state) {
  if (!state || !state.metricsHistory || !state.metricsHistory.hourly) {
    return {
      windows: {
        last24Hours: createEmptyStats(),
        last7Days: createEmptyStats(),
        last30Days: createEmptyStats()
      },
      rates: {
        last24Hours: calculateRates(createEmptyStats(), TIME_WINDOWS.HOURS_24),
        last7Days: calculateRates(createEmptyStats(), TIME_WINDOWS.DAYS_7),
        last30Days: calculateRates(createEmptyStats(), TIME_WINDOWS.DAYS_30)
      },
      dataAvailability: {
        oldestMetric: null,
        newestMetric: null,
        totalHours: 0
      }
    };
  }
  
  const metricsHistory = state.metricsHistory.hourly;
  const windows = calculateAllWindows(metricsHistory);
  
  // Calculate rates for each window
  const rates = {
    last24Hours: calculateRates(windows.last24Hours, TIME_WINDOWS.HOURS_24),
    last7Days: calculateRates(windows.last7Days, TIME_WINDOWS.DAYS_7),
    last30Days: calculateRates(windows.last30Days, TIME_WINDOWS.DAYS_30)
  };
  
  // Calculate data availability
  const dataAvailability = {
    oldestMetric: metricsHistory.length > 0
      ? metricsHistory[metricsHistory.length - 1].timestamp
      : null,
    newestMetric: metricsHistory.length > 0
      ? metricsHistory[0].timestamp
      : null,
    totalHours: metricsHistory.length
  };
  
  return {
    windows,
    rates,
    dataAvailability
  };
}

/**
 * Compare two time windows to detect trends
 * @param {Object} olderWindow - Statistics for older time window
 * @param {Object} newerWindow - Statistics for newer time window
 * @returns {Object} Trend analysis (increase, decrease, stable)
 */
export function compareTrends(olderWindow, newerWindow) {
  if (!olderWindow || !newerWindow) {
    return {
      sweeps: 'unknown',
      alerts: 'unknown',
      permissionChanges: 'unknown',
      errors: 'unknown'
    };
  }
  
  const calculateTrend = (oldValue, newValue) => {
    if (oldValue === 0 && newValue === 0) return 'stable';
    if (oldValue === 0) return 'increase';
    
    const percentChange = ((newValue - oldValue) / oldValue) * 100;
    
    if (percentChange > 10) return 'increase';
    if (percentChange < -10) return 'decrease';
    return 'stable';
  };
  
  return {
    sweeps: {
      trend: calculateTrend(olderWindow.sweeps, newerWindow.sweeps),
      change: newerWindow.sweeps - olderWindow.sweeps,
      percentChange: olderWindow.sweeps > 0
        ? Number((((newerWindow.sweeps - olderWindow.sweeps) / olderWindow.sweeps) * 100).toFixed(1))
        : null
    },
    alerts: {
      trend: calculateTrend(olderWindow.alerts, newerWindow.alerts),
      change: newerWindow.alerts - olderWindow.alerts,
      percentChange: olderWindow.alerts > 0
        ? Number((((newerWindow.alerts - olderWindow.alerts) / olderWindow.alerts) * 100).toFixed(1))
        : null
    },
    permissionChanges: {
      trend: calculateTrend(olderWindow.permissionChanges, newerWindow.permissionChanges),
      change: newerWindow.permissionChanges - olderWindow.permissionChanges,
      percentChange: olderWindow.permissionChanges > 0
        ? Number((((newerWindow.permissionChanges - olderWindow.permissionChanges) / olderWindow.permissionChanges) * 100).toFixed(1))
        : null
    },
    errors: {
      trend: calculateTrend(olderWindow.errors, newerWindow.errors),
      change: newerWindow.errors - olderWindow.errors,
      percentChange: olderWindow.errors > 0
        ? Number((((newerWindow.errors - olderWindow.errors) / olderWindow.errors) * 100).toFixed(1))
        : null
    }
  };
}

/**
 * Check if metrics indicate anomalous activity
 * @param {Object} windowStats - Statistics for a time window
 * @param {Object} thresholds - Threshold configuration
 * @returns {Object} Anomaly detection results
 */
export function detectAnomalies(windowStats, thresholds = {}) {
  const defaults = {
    alertsPerHour: 5,           // More than 5 alerts/hour is anomalous
    errorsPerHour: 10,          // More than 10 errors/hour is anomalous
    revertFailureRate: 0.1,     // More than 10% revert failures is anomalous
    permissionChangeRate: 20    // More than 20 permission changes/hour is anomalous
  };
  
  const config = { ...defaults, ...thresholds };
  
  if (!windowStats || windowStats.hoursWithData === 0) {
    return {
      hasAnomalies: false,
      anomalies: []
    };
  }
  
  const windowHours = windowStats.hoursWithData;
  const anomalies = [];
  
  // Check alert rate
  const alertsPerHour = windowStats.alerts / windowHours;
  if (alertsPerHour > config.alertsPerHour) {
    anomalies.push({
      type: 'high_alert_rate',
      severity: 'warning',
      message: `Alert rate (${alertsPerHour.toFixed(2)}/hour) exceeds threshold (${config.alertsPerHour}/hour)`,
      value: alertsPerHour,
      threshold: config.alertsPerHour
    });
  }
  
  // Check error rate
  const errorsPerHour = windowStats.errors / windowHours;
  if (errorsPerHour > config.errorsPerHour) {
    anomalies.push({
      type: 'high_error_rate',
      severity: 'warning',
      message: `Error rate (${errorsPerHour.toFixed(2)}/hour) exceeds threshold (${config.errorsPerHour}/hour)`,
      value: errorsPerHour,
      threshold: config.errorsPerHour
    });
  }
  
  // Check revert failure rate
  if (windowStats.permissionReverts > 0) {
    const failureRate = windowStats.revertFailures / windowStats.permissionReverts;
    if (failureRate > config.revertFailureRate) {
      anomalies.push({
        type: 'high_revert_failure_rate',
        severity: 'critical',
        message: `Revert failure rate (${(failureRate * 100).toFixed(1)}%) exceeds threshold (${(config.revertFailureRate * 100).toFixed(1)}%)`,
        value: failureRate,
        threshold: config.revertFailureRate
      });
    }
  }
  
  // Check permission change rate
  const permissionChangesPerHour = windowStats.permissionChanges / windowHours;
  if (permissionChangesPerHour > config.permissionChangeRate) {
    anomalies.push({
      type: 'high_permission_change_rate',
      severity: 'warning',
      message: `Permission change rate (${permissionChangesPerHour.toFixed(2)}/hour) exceeds threshold (${config.permissionChangeRate}/hour)`,
      value: permissionChangesPerHour,
      threshold: config.permissionChangeRate
    });
  }
  
  return {
    hasAnomalies: anomalies.length > 0,
    anomalies,
    criticalCount: anomalies.filter(a => a.severity === 'critical').length,
    warningCount: anomalies.filter(a => a.severity === 'warning').length
  };
}

/**
 * Create empty stats object
 * @private
 */
function createEmptyStats() {
  return {
    sweeps: 0,
    alerts: 0,
    permissionChanges: 0,
    permissionReverts: 0,
    revertFailures: 0,
    errors: 0,
    memberFetchTimeouts: 0,
    restarts: 0,
    hoursWithData: 0,
    windowStart: null,
    windowEnd: null
  };
}

/**
 * Format statistics for human-readable display
 * @param {Object} stats - Statistics object from calculateWindowStats
 * @returns {string} Formatted statistics string
 */
export function formatStatsDisplay(stats) {
  if (!stats || stats.hoursWithData === 0) {
    return 'No data available for this time window';
  }
  
  const lines = [
    `📊 Statistics (${stats.hoursWithData} hours)`,
    `├─ Sweeps: ${stats.sweeps}`,
    `├─ Alerts: ${stats.alerts}`,
    `├─ Permission Changes: ${stats.permissionChanges}`,
    `├─ Permission Reverts: ${stats.permissionReverts}`,
    `├─ Revert Failures: ${stats.revertFailures}`,
    `├─ Errors: ${stats.errors}`,
    `├─ Member Fetch Timeouts: ${stats.memberFetchTimeouts}`,
    `└─ Restarts: ${stats.restarts}`
  ];
  
  if (stats.windowStart) {
    lines.push(`⏱️ Window: ${stats.windowStart} → ${stats.windowEnd}`);
  }
  
  return lines.join('\n');
}

/**
 * Format rates for human-readable display
 * @param {Object} rates - Rates object from calculateRates
 * @returns {string} Formatted rates string
 */
export function formatRatesDisplay(rates) {
  if (!rates) {
    return 'No rate data available';
  }
  
  const lines = [
    `📈 Activity Rates`,
    `├─ Sweeps: ${rates.sweepsPerHour}/hour (${rates.sweepsPerDay}/day)`,
    `├─ Alerts: ${rates.alertsPerHour}/hour (${rates.alertsPerDay}/day)`,
    `├─ Permission Changes: ${rates.permissionChangesPerHour}/hour (${rates.permissionChangesPerDay}/day)`,
    `└─ Errors: ${rates.errorsPerHour}/hour (${rates.errorsPerDay}/day)`
  ];
  
  return lines.join('\n');
}
