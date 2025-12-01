/**
 * Prometheus Metrics Exporter
 * 
 * Exports security intelligence metrics in Prometheus format for external
 * monitoring, alerting, and observability. Provides real-time visibility into
 * security posture, threat activity, and system health.
 * 
 * **Metric Types:**
 * - Gauges: Current state values (security score, baseline confidence, active threats)
 * - Counters: Cumulative totals (total threats detected, sweeps completed, alerts sent)
 * - Histograms: Distribution data (threat detection latency, baseline generation time)
 * 
 * **Exported Metrics:**
 * - Security Score: Overall security health (0-100)
 * - Component Scores: Baseline, threat, archive, response, uptime (0-100 each)
 * - Threat Counts: By severity (CRITICAL, HIGH, MEDIUM, LOW)
 * - Baseline Quality: Confidence, data points, freshness
 * - Archive Health: File status, HMAC validation, backup status
 * - Performance: Sweep duration, detection latency, memory usage
 * - Behavioral: Member baselines, anomalies detected, compromise assessments
 * 
 * **Integration:**
 * - HTTP endpoint: GET /metrics (Prometheus text format)
 * - Auto-refresh: Metrics updated every 15 seconds
 * - Thread-safe: Concurrent scrapes supported
 * 
 * @module prometheusExporter
 */

import { log } from '../utils/logger.js';

// ============================================================================
// METRIC REGISTRY
// ============================================================================

/**
 * Metric registry storing all Prometheus metrics
 * 
 * Structure: Map<metricName, { type, help, labels, value }>
 */
const metricRegistry = new Map();

/**
 * Last metrics update timestamp
 */
let lastMetricsUpdate = null;

/**
 * Metrics refresh interval (15 seconds)
 */
const METRICS_REFRESH_INTERVAL = 15 * 1000;

// ============================================================================
// METRIC REGISTRATION
// ============================================================================

/**
 * Register a gauge metric
 * 
 * Gauges represent current state values that can go up or down.
 * Examples: security_score, baseline_confidence, active_threats
 * 
 * @param {string} name - Metric name (snake_case)
 * @param {string} help - Human-readable description
 * @param {Object} labels - Label key-value pairs (optional)
 */
export function registerGauge(name, help, labels = {}) {
  metricRegistry.set(name, {
    type: 'gauge',
    help,
    labels,
    value: 0
  });
}

/**
 * Register a counter metric
 * 
 * Counters represent cumulative totals that only increase.
 * Examples: total_threats_detected, sweeps_completed, alerts_sent
 * 
 * @param {string} name - Metric name (snake_case)
 * @param {string} help - Human-readable description
 * @param {Object} labels - Label key-value pairs (optional)
 */
export function registerCounter(name, help, labels = {}) {
  metricRegistry.set(name, {
    type: 'counter',
    help,
    labels,
    value: 0
  });
}

/**
 * Register a histogram metric
 * 
 * Histograms track distribution of values across buckets.
 * Examples: threat_detection_duration, baseline_generation_duration
 * 
 * @param {string} name - Metric name (snake_case)
 * @param {string} help - Human-readable description
 * @param {Array<number>} buckets - Histogram buckets (e.g., [0.1, 0.5, 1.0, 5.0])
 * @param {Object} labels - Label key-value pairs (optional)
 */
export function registerHistogram(name, help, buckets = [0.1, 0.5, 1.0, 5.0, 10.0], labels = {}) {
  metricRegistry.set(name, {
    type: 'histogram',
    help,
    labels,
    buckets,
    observations: [],
    sum: 0,
    count: 0
  });
}

// ============================================================================
// METRIC UPDATES
// ============================================================================

/**
 * Set gauge value
 * 
 * @param {string} name - Metric name
 * @param {number} value - New value
 * @param {Object} labels - Label overrides (optional)
 */
export function setGauge(name, value, labels = {}) {
  const metric = metricRegistry.get(name);
  if (!metric || metric.type !== 'gauge') {
    log('warn', '[PrometheusExporter] Gauge not registered', { name });
    return;
  }

  metric.value = value;
  if (Object.keys(labels).length > 0) {
    metric.labels = { ...metric.labels, ...labels };
  }
}

/**
 * Increment counter
 * 
 * @param {string} name - Metric name
 * @param {number} delta - Increment amount (default: 1)
 * @param {Object} labels - Label overrides (optional)
 */
export function incrementCounter(name, delta = 1, labels = {}) {
  const metric = metricRegistry.get(name);
  if (!metric || metric.type !== 'counter') {
    log('warn', '[PrometheusExporter] Counter not registered', { name });
    return;
  }

  metric.value += delta;
  if (Object.keys(labels).length > 0) {
    metric.labels = { ...metric.labels, ...labels };
  }
}

/**
 * Observe histogram value
 * 
 * @param {string} name - Metric name
 * @param {number} value - Observed value
 * @param {Object} labels - Label overrides (optional)
 */
export function observeHistogram(name, value, labels = {}) {
  const metric = metricRegistry.get(name);
  if (!metric || metric.type !== 'histogram') {
    log('warn', '[PrometheusExporter] Histogram not registered', { name });
    return;
  }

  metric.observations.push(value);
  metric.sum += value;
  metric.count++;

  if (Object.keys(labels).length > 0) {
    metric.labels = { ...metric.labels, ...labels };
  }
}

// ============================================================================
// SECURITY METRICS INITIALIZATION
// ============================================================================

/**
 * Initialize all security intelligence metrics
 * 
 * Registers gauges, counters, and histograms for comprehensive monitoring.
 */
export function initializeSecurityMetrics() {
  // Security Score Metrics (Gauges)
  registerGauge('security_score_overall', 'Overall security score (0-100)');
  registerGauge('security_score_baseline_quality', 'Baseline quality component score (0-100)');
  registerGauge('security_score_threat_activity', 'Threat activity component score (0-100)');
  registerGauge('security_score_archive_health', 'Archive health component score (0-100)');
  registerGauge('security_score_response_effectiveness', 'Response effectiveness component score (0-100)');
  registerGauge('security_score_uptime', 'Uptime component score (0-100)');

  // Baseline Quality Metrics (Gauges)
  registerGauge('baseline_confidence', 'Baseline confidence level (0.0-1.0)');
  registerGauge('baseline_data_points', 'Number of data points in baseline');
  registerGauge('baseline_freshness_days', 'Days since baseline was last updated');
  registerGauge('baseline_rapid_change_threshold', 'Changes per hour threshold (95th percentile)');

  // Threat Activity Metrics (Gauges + Counters)
  registerGauge('threats_active_count', 'Number of active threats in last 24 hours');
  registerGauge('threats_critical_count', 'Number of CRITICAL threats in last 24 hours');
  registerGauge('threats_high_count', 'Number of HIGH threats in last 24 hours');
  registerGauge('threats_medium_count', 'Number of MEDIUM threats in last 24 hours');
  registerGauge('threats_low_count', 'Number of LOW threats in last 24 hours');
  registerCounter('threats_total_detected', 'Total threats detected (cumulative)');
  registerCounter('threats_total_critical', 'Total CRITICAL threats detected (cumulative)');

  // Archive Health Metrics (Gauges)
  registerGauge('archive_file_exists', 'Whether archive file exists (0=no, 1=yes)');
  registerGauge('archive_hmac_valid', 'Whether HMAC signature is valid (0=no, 1=yes, -1=unknown)');
  registerGauge('archive_backup_exists', 'Whether backup exists (0=no, 1=yes)');
  registerGauge('archive_size_bytes', 'Archive file size in bytes');
  registerGauge('archive_entry_count', 'Number of entries in archive');

  // Bot Uptime Metrics (Gauges)
  registerGauge('bot_running', 'Whether security bot is running (0=no, 1=yes)');
  registerGauge('bot_uptime_seconds', 'Security bot uptime in seconds');
  registerGauge('bot_guilds_monitored', 'Number of guilds being monitored');
  registerGauge('bot_last_sweep_age_seconds', 'Seconds since last sweep');

  // Performance Metrics (Histograms)
  registerHistogram('sweep_duration_seconds', 'Duration of security sweeps', [0.1, 0.5, 1.0, 2.0, 5.0]);
  registerHistogram('threat_detection_duration_seconds', 'Duration of threat detection', [0.01, 0.05, 0.1, 0.5, 1.0]);
  registerHistogram('baseline_generation_duration_seconds', 'Duration of baseline generation', [0.1, 0.5, 1.0, 5.0, 10.0]);
  registerHistogram('metrics_calculation_duration_seconds', 'Duration of metrics calculation', [0.01, 0.05, 0.1, 0.5, 1.0]);

  // Behavioral Analysis Metrics (Gauges + Counters)
  registerGauge('behavioral_member_baselines_count', 'Number of member baselines generated');
  registerGauge('behavioral_anomalies_detected', 'Number of behavioral anomalies detected in last 24 hours');
  registerGauge('behavioral_coordinated_attacks_detected', 'Number of coordinated attacks detected in last 24 hours');
  registerGauge('behavioral_compromised_accounts_detected', 'Number of potentially compromised accounts in last 24 hours');
  registerCounter('behavioral_total_anomalies', 'Total behavioral anomalies detected (cumulative)');
  registerCounter('behavioral_total_compromises', 'Total account compromises detected (cumulative)');

  // Trend Metrics (Gauges)
  registerGauge('threat_trend_24h_count', 'Threat count in last 24 hours');
  registerGauge('threat_trend_7d_count', 'Threat count in last 7 days');
  registerGauge('threat_trend_30d_count', 'Threat count in last 30 days');
  registerGauge('threat_trend_direction', 'Trend direction (1=improving, 0=stable, -1=degrading)');

  // System Health Metrics (Gauges)
  registerGauge('security_system_memory_bytes', 'Security system memory usage in bytes');
  registerGauge('security_system_cpu_percent', 'Security system CPU usage percentage');
  registerGauge('security_system_errors_count', 'Number of system errors in last 24 hours');

  log('info', '[PrometheusExporter] Security metrics initialized', {
    totalMetrics: metricRegistry.size
  });
}

// ============================================================================
// METRICS COLLECTION
// ============================================================================

/**
 * Collect current metrics from security bot state
 * 
 * Reads from global.securityBotState and updates all registered metrics.
 * This should be called periodically (every 15 seconds) or on-demand during scrapes.
 * 
 * @param {Object} securityBotState - Security bot state object
 * @param {Object} securityMetrics - Security metrics module (optional)
 * @param {Object} behavioralAnalysis - Behavioral analysis module (optional)
 * @returns {boolean} Success status
 */
export function collectSecurityMetrics(securityBotState, securityMetrics = null, behavioralAnalysis = null) {
  try {
    if (!securityBotState) {
      log('warn', '[PrometheusExporter] No security bot state available');
      return false;
    }

    const now = Date.now();

    // Check if refresh needed (15 second cache)
    if (lastMetricsUpdate && (now - lastMetricsUpdate) < METRICS_REFRESH_INTERVAL) {
      return true; // Use cached metrics
    }

    // Security Score Components
    if (securityMetrics) {
      const metrics = securityMetrics.getSecurityMetrics(securityBotState);
      
      if (metrics.score) {
        setGauge('security_score_overall', metrics.score.overall);
        setGauge('security_score_baseline_quality', metrics.score.components.baselineQuality || 0);
        setGauge('security_score_threat_activity', metrics.score.components.threatActivity || 0);
        setGauge('security_score_archive_health', metrics.score.components.archiveHealth || 0);
        setGauge('security_score_response_effectiveness', metrics.score.components.responseEffectiveness || 0);
        setGauge('security_score_uptime', metrics.score.components.uptime || 0);
      }

      // Threat Trends
      if (metrics.trends) {
        const trend24h = metrics.trends.windows['24h'] || {};
        const trend7d = metrics.trends.windows['7d'] || {};
        const trend30d = metrics.trends.windows['30d'] || {};

        setGauge('threat_trend_24h_count', trend24h.count || 0);
        setGauge('threat_trend_7d_count', trend7d.count || 0);
        setGauge('threat_trend_30d_count', trend30d.count || 0);

        const trendValue = metrics.trends.trend === 'improving' ? 1 : 
                          metrics.trends.trend === 'degrading' ? -1 : 0;
        setGauge('threat_trend_direction', trendValue);
      }
    }

    // Baseline Quality
    if (securityBotState.baselines) {
      const baselines = securityBotState.baselines;
      setGauge('baseline_confidence', baselines.confidence || 0);
      setGauge('baseline_data_points', baselines.dataPoints || 0);
      
      if (baselines.generatedAt) {
        const ageMs = now - new Date(baselines.generatedAt).getTime();
        const ageDays = ageMs / (24 * 60 * 60 * 1000);
        setGauge('baseline_freshness_days', ageDays);
      }

      setGauge('baseline_rapid_change_threshold', baselines.rapidChangeThreshold || 0);
    }

    // Threat Activity
    const threats = securityBotState.threats || [];
    const now24h = now - 24 * 60 * 60 * 1000;
    const recent24hThreats = threats.filter(t => new Date(t.detectedAt).getTime() > now24h);

    setGauge('threats_active_count', recent24hThreats.length);

    const severityCounts = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0
    };

    recent24hThreats.forEach(threat => {
      severityCounts[threat.severity] = (severityCounts[threat.severity] || 0) + 1;
    });

    setGauge('threats_critical_count', severityCounts.CRITICAL);
    setGauge('threats_high_count', severityCounts.HIGH);
    setGauge('threats_medium_count', severityCounts.MEDIUM);
    setGauge('threats_low_count', severityCounts.LOW);

    // Cumulative totals (read from state, should persist across restarts)
    if (securityBotState.statistics) {
      const stats = securityBotState.statistics;
      setGauge('threats_total_detected', stats.totalThreatsDetected || 0);
      setGauge('threats_total_critical', stats.totalCriticalThreats || 0);
    }

    // Archive Health
    if (securityBotState.roleArchive) {
      const archive = securityBotState.roleArchive;
      setGauge('archive_file_exists', 1); // If we have archive data, file exists
      setGauge('archive_entry_count', archive.length || 0);
    } else {
      setGauge('archive_file_exists', 0);
      setGauge('archive_entry_count', 0);
    }

    if (securityBotState.archiveHmacValid !== undefined) {
      setGauge('archive_hmac_valid', securityBotState.archiveHmacValid ? 1 : 0);
    } else {
      setGauge('archive_hmac_valid', -1); // Unknown
    }

    // Bot Uptime
    const botRunning = securityBotState.running === true ? 1 : 0;
    setGauge('bot_running', botRunning);

    if (securityBotState.startedAt) {
      const uptimeMs = now - new Date(securityBotState.startedAt).getTime();
      setGauge('bot_uptime_seconds', Math.floor(uptimeMs / 1000));
    }

    if (securityBotState.guilds) {
      setGauge('bot_guilds_monitored', Object.keys(securityBotState.guilds).length);
    }

    if (securityBotState.lastSweepAt) {
      const lastSweepAge = now - new Date(securityBotState.lastSweepAt).getTime();
      setGauge('bot_last_sweep_age_seconds', Math.floor(lastSweepAge / 1000));
    }

    // Behavioral Analysis
    if (behavioralAnalysis && securityBotState.memberBaselines) {
      const baselines = securityBotState.memberBaselines || {};
      setGauge('behavioral_member_baselines_count', Object.keys(baselines).length);
    }

    if (securityBotState.behavioralAnomalies) {
      const anomalies24h = securityBotState.behavioralAnomalies.filter(a => 
        new Date(a.detectedAt).getTime() > now24h
      );
      setGauge('behavioral_anomalies_detected', anomalies24h.length);
    }

    if (securityBotState.coordinatedAttacks) {
      const attacks24h = securityBotState.coordinatedAttacks.filter(a => 
        new Date(a.detectedAt).getTime() > now24h
      );
      setGauge('behavioral_coordinated_attacks_detected', attacks24h.length);
    }

    if (securityBotState.compromisedAccounts) {
      const compromises24h = securityBotState.compromisedAccounts.filter(c => 
        new Date(c.detectedAt).getTime() > now24h
      );
      setGauge('behavioral_compromised_accounts_detected', compromises24h.length);
    }

    // System Health
    if (process.memoryUsage) {
      const memUsage = process.memoryUsage();
      setGauge('security_system_memory_bytes', memUsage.heapUsed);
    }

    lastMetricsUpdate = now;

    log('debug', '[PrometheusExporter] Metrics collected', {
      metricsCount: metricRegistry.size,
      timestamp: new Date(now).toISOString()
    });

    return true;
  } catch (error) {
    log('error', '[PrometheusExporter] Failed to collect metrics', {
      error: error.message
    });
    return false;
  }
}

// ============================================================================
// PROMETHEUS TEXT FORMAT EXPORT
// ============================================================================

/**
 * Format label pairs for Prometheus
 * 
 * @param {Object} labels - Label key-value pairs
 * @returns {string} Formatted labels (e.g., '{severity="high",guild="123"}')
 */
function formatLabels(labels) {
  if (!labels || Object.keys(labels).length === 0) {
    return '';
  }

  const pairs = Object.entries(labels).map(([key, value]) => `${key}="${value}"`);
  return `{${pairs.join(',')}}`;
}

/**
 * Export metrics in Prometheus text format
 * 
 * Returns metrics in the standard Prometheus exposition format:
 * # HELP metric_name Description
 * # TYPE metric_name gauge|counter|histogram
 * metric_name{labels} value
 * 
 * @returns {string} Prometheus-formatted metrics
 */
export function exportPrometheusMetrics() {
  const lines = [];

  // Add timestamp comment
  lines.push(`# Generated at ${new Date().toISOString()}`);
  lines.push(`# Security Intelligence System - Prometheus Metrics`);
  lines.push('');

  metricRegistry.forEach((metric, name) => {
    // HELP line
    lines.push(`# HELP ${name} ${metric.help}`);
    
    // TYPE line
    lines.push(`# TYPE ${name} ${metric.type}`);

    const labelStr = formatLabels(metric.labels);

    if (metric.type === 'gauge' || metric.type === 'counter') {
      // Simple metric: name{labels} value
      lines.push(`${name}${labelStr} ${metric.value}`);
    } else if (metric.type === 'histogram') {
      // Histogram: buckets + sum + count
      const buckets = metric.buckets || [];
      const observations = metric.observations || [];

      // Count observations in each bucket
      buckets.forEach(upperBound => {
        const count = observations.filter(obs => obs <= upperBound).length;
        lines.push(`${name}_bucket{le="${upperBound}"${labelStr ? ',' + labelStr.slice(1) : ''}} ${count}`);
      });

      // +Inf bucket (all observations)
      lines.push(`${name}_bucket{le="+Inf"${labelStr ? ',' + labelStr.slice(1) : ''}} ${observations.length}`);

      // Sum and count
      lines.push(`${name}_sum${labelStr} ${metric.sum || 0}`);
      lines.push(`${name}_count${labelStr} ${metric.count || 0}`);
    }

    lines.push(''); // Blank line between metrics
  });

  return lines.join('\n');
}

// ============================================================================
// HTTP ENDPOINT
// ============================================================================

/**
 * Handle /metrics HTTP request
 * 
 * Express/HTTP handler that returns Prometheus metrics.
 * 
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 * @param {Object} securityBotState - Security bot state
 * @param {Object} securityMetrics - Security metrics module (optional)
 * @param {Object} behavioralAnalysis - Behavioral analysis module (optional)
 */
export function handleMetricsRequest(req, res, securityBotState, securityMetrics = null, behavioralAnalysis = null) {
  try {
    // Collect latest metrics
    collectSecurityMetrics(securityBotState, securityMetrics, behavioralAnalysis);

    // Export in Prometheus format
    const metricsText = exportPrometheusMetrics();

    // Set appropriate headers
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(metricsText);

    log('debug', '[PrometheusExporter] Metrics request handled', {
      metricsSize: metricsText.length,
      userAgent: req.headers['user-agent']
    });
  } catch (error) {
    log('error', '[PrometheusExporter] Failed to handle metrics request', {
      error: error.message
    });
    res.status(500).send('Internal Server Error');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get metrics summary for debugging
 * 
 * @returns {Object} Summary of current metrics
 */
export function getMetricsSummary() {
  const summary = {
    totalMetrics: metricRegistry.size,
    metricsByType: {
      gauge: 0,
      counter: 0,
      histogram: 0
    },
    lastUpdate: lastMetricsUpdate ? new Date(lastMetricsUpdate).toISOString() : null,
    metrics: []
  };

  metricRegistry.forEach((metric, name) => {
    summary.metricsByType[metric.type]++;
    summary.metrics.push({
      name,
      type: metric.type,
      value: metric.type === 'histogram' ? metric.count : metric.value
    });
  });

  return summary;
}

/**
 * Clear all metrics (for testing)
 */
export function clearMetrics() {
  metricRegistry.clear();
  lastMetricsUpdate = null;
  log('debug', '[PrometheusExporter] Metrics cleared');
}

/**
 * Reset all metric values to defaults (keep registrations)
 */
export function resetMetricValues() {
  metricRegistry.forEach((metric) => {
    if (metric.type === 'gauge' || metric.type === 'counter') {
      metric.value = 0;
    } else if (metric.type === 'histogram') {
      metric.observations = [];
      metric.sum = 0;
      metric.count = 0;
    }
  });
  log('debug', '[PrometheusExporter] Metric values reset');
}
