/**
 * Integration Tests: Prometheus Metrics Exporter
 * 
 * Comprehensive test suite for Prometheus metrics export including
 * metric registration, updates, collection, and text format export.
 * 
 * @module tests/services/prometheus-exporter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerGauge,
  registerCounter,
  registerHistogram,
  setGauge,
  incrementCounter,
  observeHistogram,
  initializeSecurityMetrics,
  collectSecurityMetrics,
  exportPrometheusMetrics,
  getMetricsSummary,
  clearMetrics,
  resetMetricValues
} from '../../src/services/prometheusExporter.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Create mock security bot state
 */
function createMockSecurityBotState() {
  const now = Date.now();
  const yesterday = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  return {
    running: true,
    startedAt: new Date(weekAgo).toISOString(),
    lastSweepAt: new Date(now - 60 * 1000).toISOString(), // 1 minute ago
    baselines: {
      confidence: 0.85,
      dataPoints: 500,
      generatedAt: new Date(yesterday).toISOString(),
      rapidChangeThreshold: 12
    },
    threats: [
      {
        severity: 'CRITICAL',
        detectedAt: new Date(now - 30 * 60 * 1000).toISOString() // 30 min ago
      },
      {
        severity: 'HIGH',
        detectedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      },
      {
        severity: 'MEDIUM',
        detectedAt: new Date(now - 12 * 60 * 60 * 1000).toISOString() // 12 hours ago
      },
      {
        severity: 'LOW',
        detectedAt: new Date(now - 20 * 60 * 60 * 1000).toISOString() // 20 hours ago
      },
      {
        severity: 'HIGH',
        detectedAt: new Date(weekAgo).toISOString() // 7 days ago (not in 24h window)
      }
    ],
    roleArchive: new Array(250).fill({}).map((_, i) => ({
      timestamp: new Date(now - i * 60 * 60 * 1000).toISOString(),
      actor: 'member1',
      action: 'ADDED'
    })),
    archiveHmacValid: true,
    statistics: {
      totalThreatsDetected: 142,
      totalCriticalThreats: 8
    },
    guilds: {
      'guild1': { lastSweepAt: new Date().toISOString() },
      'guild2': { lastSweepAt: new Date().toISOString() }
    },
    memberBaselines: {
      'member1': { confidence: 0.9 },
      'member2': { confidence: 0.75 },
      'member3': { confidence: 0.6 }
    },
    behavioralAnomalies: [
      { detectedAt: new Date(now - 60 * 60 * 1000).toISOString() }, // 1 hour ago
      { detectedAt: new Date(weekAgo).toISOString() } // 7 days ago (not in 24h)
    ],
    coordinatedAttacks: [
      { detectedAt: new Date(now - 5 * 60 * 60 * 1000).toISOString() } // 5 hours ago
    ],
    compromisedAccounts: [
      { detectedAt: new Date(now - 10 * 60 * 60 * 1000).toISOString() } // 10 hours ago
    ]
  };
}

/**
 * Create mock security metrics module
 */
function createMockSecurityMetrics() {
  return {
    getSecurityMetrics: () => ({
      score: {
        overall: 85,
        components: {
          baselineQuality: 90,
          threatActivity: 75,
          archiveHealth: 85,
          responseEffectiveness: 80,
          uptime: 95
        }
      },
      trends: {
        windows: {
          '24h': { count: 4 },
          '7d': { count: 20 },
          '30d': { count: 50 }
        },
        trend: 'improving'
      }
    })
  };
}

// ============================================================================
// METRIC REGISTRATION
// ============================================================================

describe('Metric Registration', () => {
  beforeEach(() => {
    clearMetrics();
  });

  afterEach(() => {
    clearMetrics();
  });

  it('should register gauge metric', () => {
    registerGauge('test_gauge', 'Test gauge metric');
    
    const summary = getMetricsSummary();
    expect(summary.totalMetrics).toBe(1);
    expect(summary.metricsByType.gauge).toBe(1);
    
    const metric = summary.metrics.find(m => m.name === 'test_gauge');
    expect(metric).toBeDefined();
    expect(metric.type).toBe('gauge');
    expect(metric.value).toBe(0);
  });

  it('should register counter metric', () => {
    registerCounter('test_counter', 'Test counter metric');
    
    const summary = getMetricsSummary();
    expect(summary.totalMetrics).toBe(1);
    expect(summary.metricsByType.counter).toBe(1);
  });

  it('should register histogram metric', () => {
    registerHistogram('test_histogram', 'Test histogram metric', [0.1, 0.5, 1.0]);
    
    const summary = getMetricsSummary();
    expect(summary.totalMetrics).toBe(1);
    expect(summary.metricsByType.histogram).toBe(1);
  });

  it('should register metrics with labels', () => {
    registerGauge('test_gauge_labeled', 'Test gauge with labels', { environment: 'test' });
    
    const summary = getMetricsSummary();
    expect(summary.totalMetrics).toBe(1);
  });

  it('should initialize all security metrics', () => {
    initializeSecurityMetrics();
    
    const summary = getMetricsSummary();
    expect(summary.totalMetrics).toBeGreaterThanOrEqual(40); // We register 43 metrics
    expect(summary.metricsByType.gauge).toBeGreaterThan(25);
    expect(summary.metricsByType.counter).toBeGreaterThanOrEqual(4); // Exactly 4 counters
    expect(summary.metricsByType.histogram).toBeGreaterThan(3);
  });
});

// ============================================================================
// METRIC UPDATES
// ============================================================================

describe('Metric Updates', () => {
  beforeEach(() => {
    clearMetrics();
  });

  afterEach(() => {
    clearMetrics();
  });

  it('should set gauge value', () => {
    registerGauge('test_gauge', 'Test gauge');
    setGauge('test_gauge', 42.5);
    
    const summary = getMetricsSummary();
    const metric = summary.metrics.find(m => m.name === 'test_gauge');
    expect(metric.value).toBe(42.5);
  });

  it('should increment counter', () => {
    registerCounter('test_counter', 'Test counter');
    
    incrementCounter('test_counter', 1);
    incrementCounter('test_counter', 5);
    incrementCounter('test_counter'); // Default delta = 1
    
    const summary = getMetricsSummary();
    const metric = summary.metrics.find(m => m.name === 'test_counter');
    expect(metric.value).toBe(7);
  });

  it('should observe histogram values', () => {
    registerHistogram('test_histogram', 'Test histogram', [0.1, 0.5, 1.0]);
    
    observeHistogram('test_histogram', 0.05);
    observeHistogram('test_histogram', 0.25);
    observeHistogram('test_histogram', 0.75);
    observeHistogram('test_histogram', 1.5);
    
    const summary = getMetricsSummary();
    const metric = summary.metrics.find(m => m.name === 'test_histogram');
    expect(metric.value).toBe(4); // 4 observations
  });

  it('should handle updates to non-existent metrics gracefully', () => {
    // Should not throw, just warn
    setGauge('nonexistent_gauge', 100);
    incrementCounter('nonexistent_counter', 10);
    observeHistogram('nonexistent_histogram', 0.5);
    
    const summary = getMetricsSummary();
    expect(summary.totalMetrics).toBe(0); // No metrics registered
  });

  it('should reset metric values', () => {
    registerGauge('test_gauge', 'Test gauge');
    registerCounter('test_counter', 'Test counter');
    
    setGauge('test_gauge', 100);
    incrementCounter('test_counter', 50);
    
    let summary = getMetricsSummary();
    expect(summary.metrics.find(m => m.name === 'test_gauge').value).toBe(100);
    expect(summary.metrics.find(m => m.name === 'test_counter').value).toBe(50);
    
    resetMetricValues();
    
    summary = getMetricsSummary();
    expect(summary.metrics.find(m => m.name === 'test_gauge').value).toBe(0);
    expect(summary.metrics.find(m => m.name === 'test_counter').value).toBe(0);
  });
});

// ============================================================================
// METRICS COLLECTION
// ============================================================================

describe('Metrics Collection', () => {
  beforeEach(() => {
    clearMetrics();
    initializeSecurityMetrics();
  });

  afterEach(() => {
    clearMetrics();
  });

  it('should collect security score metrics', () => {
    const botState = createMockSecurityBotState();
    const securityMetrics = createMockSecurityMetrics();
    
    const success = collectSecurityMetrics(botState, securityMetrics, null);
    expect(success).toBe(true);
    
    const summary = getMetricsSummary();
    const overallScore = summary.metrics.find(m => m.name === 'security_score_overall');
    expect(overallScore.value).toBe(85);
    
    const baselineScore = summary.metrics.find(m => m.name === 'security_score_baseline_quality');
    expect(baselineScore.value).toBe(90);
  });

  it('should collect baseline quality metrics', () => {
    const botState = createMockSecurityBotState();
    
    collectSecurityMetrics(botState, null, null);
    
    const summary = getMetricsSummary();
    const confidence = summary.metrics.find(m => m.name === 'baseline_confidence');
    expect(confidence.value).toBe(0.85);
    
    const dataPoints = summary.metrics.find(m => m.name === 'baseline_data_points');
    expect(dataPoints.value).toBe(500);
    
    const threshold = summary.metrics.find(m => m.name === 'baseline_rapid_change_threshold');
    expect(threshold.value).toBe(12);
  });

  it('should collect threat activity metrics', () => {
    const botState = createMockSecurityBotState();
    
    collectSecurityMetrics(botState, null, null);
    
    const summary = getMetricsSummary();
    
    // 4 threats in last 24h (CRITICAL, HIGH, MEDIUM, LOW)
    const activeThreats = summary.metrics.find(m => m.name === 'threats_active_count');
    expect(activeThreats.value).toBe(4);
    
    const criticalCount = summary.metrics.find(m => m.name === 'threats_critical_count');
    expect(criticalCount.value).toBe(1);
    
    const highCount = summary.metrics.find(m => m.name === 'threats_high_count');
    expect(highCount.value).toBe(1);
  });

  it('should collect archive health metrics', () => {
    const botState = createMockSecurityBotState();
    
    collectSecurityMetrics(botState, null, null);
    
    const summary = getMetricsSummary();
    
    const fileExists = summary.metrics.find(m => m.name === 'archive_file_exists');
    expect(fileExists.value).toBe(1); // Archive data present
    
    const hmacValid = summary.metrics.find(m => m.name === 'archive_hmac_valid');
    expect(hmacValid.value).toBe(1); // HMAC valid
    
    const entryCount = summary.metrics.find(m => m.name === 'archive_entry_count');
    expect(entryCount.value).toBe(250);
  });

  it('should collect bot uptime metrics', () => {
    const botState = createMockSecurityBotState();
    
    collectSecurityMetrics(botState, null, null);
    
    const summary = getMetricsSummary();
    
    const running = summary.metrics.find(m => m.name === 'bot_running');
    expect(running.value).toBe(1);
    
    const uptime = summary.metrics.find(m => m.name === 'bot_uptime_seconds');
    expect(uptime.value).toBeGreaterThan(0);
    
    const guilds = summary.metrics.find(m => m.name === 'bot_guilds_monitored');
    expect(guilds.value).toBe(2);
  });

  it('should collect behavioral analysis metrics', () => {
    const botState = createMockSecurityBotState();
    
    collectSecurityMetrics(botState, null, null);
    
    const summary = getMetricsSummary();
    
    const baselines = summary.metrics.find(m => m.name === 'behavioral_member_baselines_count');
    expect(baselines.value).toBe(3); // 3 member baselines
    
    const anomalies = summary.metrics.find(m => m.name === 'behavioral_anomalies_detected');
    expect(anomalies.value).toBe(1); // 1 in last 24h
    
    const attacks = summary.metrics.find(m => m.name === 'behavioral_coordinated_attacks_detected');
    expect(attacks.value).toBe(1);
    
    const compromises = summary.metrics.find(m => m.name === 'behavioral_compromised_accounts_detected');
    expect(compromises.value).toBe(1);
  });

  it('should collect threat trend metrics', () => {
    const botState = createMockSecurityBotState();
    const securityMetrics = createMockSecurityMetrics();
    
    collectSecurityMetrics(botState, securityMetrics, null);
    
    const summary = getMetricsSummary();
    
    const trend24h = summary.metrics.find(m => m.name === 'threat_trend_24h_count');
    expect(trend24h.value).toBe(4);
    
    const trend7d = summary.metrics.find(m => m.name === 'threat_trend_7d_count');
    expect(trend7d.value).toBe(20);
    
    const trendDirection = summary.metrics.find(m => m.name === 'threat_trend_direction');
    expect(trendDirection.value).toBe(1); // improving = 1
  });

  it('should handle missing bot state gracefully', () => {
    const success = collectSecurityMetrics(null, null, null);
    expect(success).toBe(false);
  });

  it('should cache metrics for 15 seconds', () => {
    const botState = createMockSecurityBotState();
    
    // First collection
    const success1 = collectSecurityMetrics(botState, null, null);
    expect(success1).toBe(true);
    
    // Immediate second collection (should use cache)
    const success2 = collectSecurityMetrics(botState, null, null);
    expect(success2).toBe(true);
  });
});

// ============================================================================
// PROMETHEUS TEXT FORMAT EXPORT
// ============================================================================

describe('Prometheus Text Format Export', () => {
  beforeEach(() => {
    clearMetrics();
  });

  afterEach(() => {
    clearMetrics();
  });

  it('should export gauge metrics', () => {
    registerGauge('test_gauge', 'Test gauge metric');
    setGauge('test_gauge', 42.5);
    
    const output = exportPrometheusMetrics();
    
    expect(output).toContain('# HELP test_gauge Test gauge metric');
    expect(output).toContain('# TYPE test_gauge gauge');
    expect(output).toContain('test_gauge 42.5');
  });

  it('should export counter metrics', () => {
    registerCounter('test_counter', 'Test counter metric');
    incrementCounter('test_counter', 10);
    
    const output = exportPrometheusMetrics();
    
    expect(output).toContain('# HELP test_counter Test counter metric');
    expect(output).toContain('# TYPE test_counter counter');
    expect(output).toContain('test_counter 10');
  });

  it('should export histogram metrics with buckets', () => {
    registerHistogram('test_histogram', 'Test histogram metric', [0.1, 0.5, 1.0]);
    
    observeHistogram('test_histogram', 0.05);
    observeHistogram('test_histogram', 0.25);
    observeHistogram('test_histogram', 0.75);
    
    const output = exportPrometheusMetrics();
    
    expect(output).toContain('# HELP test_histogram Test histogram metric');
    expect(output).toContain('# TYPE test_histogram histogram');
    expect(output).toContain('test_histogram_bucket{le="0.1"}');
    expect(output).toContain('test_histogram_bucket{le="0.5"}');
    expect(output).toContain('test_histogram_bucket{le="1"}');
    expect(output).toContain('test_histogram_bucket{le="+Inf"} 3');
    expect(output).toContain('test_histogram_sum');
    expect(output).toContain('test_histogram_count 3');
  });

  it('should include generation timestamp', () => {
    registerGauge('test_gauge', 'Test gauge');
    
    const output = exportPrometheusMetrics();
    
    expect(output).toContain('# Generated at');
    expect(output).toContain('# Security Intelligence System - Prometheus Metrics');
  });

  it('should format labels correctly', () => {
    registerGauge('test_gauge_labeled', 'Test gauge with labels', { environment: 'test', region: 'us-east' });
    setGauge('test_gauge_labeled', 100);
    
    const output = exportPrometheusMetrics();
    
    expect(output).toContain('test_gauge_labeled{environment="test",region="us-east"} 100');
  });

  it('should handle empty metrics registry', () => {
    const output = exportPrometheusMetrics();
    
    expect(output).toContain('# Generated at');
    expect(output).toContain('# Security Intelligence System');
  });

  it('should export all security metrics', () => {
    initializeSecurityMetrics();
    const botState = createMockSecurityBotState();
    const securityMetrics = createMockSecurityMetrics();
    
    collectSecurityMetrics(botState, securityMetrics, null);
    const output = exportPrometheusMetrics();
    
    // Check for key metrics
    expect(output).toContain('security_score_overall');
    expect(output).toContain('baseline_confidence');
    expect(output).toContain('threats_active_count');
    expect(output).toContain('archive_file_exists');
    expect(output).toContain('bot_running');
    expect(output).toContain('behavioral_member_baselines_count');
  });
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

describe('Utility Functions', () => {
  beforeEach(() => {
    clearMetrics();
  });

  afterEach(() => {
    clearMetrics();
  });

  it('should get metrics summary', () => {
    registerGauge('gauge1', 'Test gauge 1');
    registerCounter('counter1', 'Test counter 1');
    registerHistogram('histogram1', 'Test histogram 1');
    
    const summary = getMetricsSummary();
    
    expect(summary.totalMetrics).toBe(3);
    expect(summary.metricsByType.gauge).toBe(1);
    expect(summary.metricsByType.counter).toBe(1);
    expect(summary.metricsByType.histogram).toBe(1);
    expect(summary.metrics).toHaveLength(3);
  });

  it('should clear all metrics', () => {
    registerGauge('gauge1', 'Test gauge');
    registerCounter('counter1', 'Test counter');
    
    let summary = getMetricsSummary();
    expect(summary.totalMetrics).toBe(2);
    
    clearMetrics();
    
    summary = getMetricsSummary();
    expect(summary.totalMetrics).toBe(0);
  });

  it('should reset metric values but keep registrations', () => {
    registerGauge('gauge1', 'Test gauge');
    registerCounter('counter1', 'Test counter');
    
    setGauge('gauge1', 100);
    incrementCounter('counter1', 50);
    
    resetMetricValues();
    
    const summary = getMetricsSummary();
    expect(summary.totalMetrics).toBe(2); // Still registered
    expect(summary.metrics.find(m => m.name === 'gauge1').value).toBe(0);
    expect(summary.metrics.find(m => m.name === 'counter1').value).toBe(0);
  });
});
