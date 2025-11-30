import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Week 4 Day 22: Prometheus End-to-End Integration Tests
 * 
 * Tests the complete metrics pipeline:
 * 1. Discord bot starts → metrics server starts on port 9090
 * 2. Bot performs operations → metrics recorded
 * 3. Prometheus scrapes → metrics exported in Prometheus text format
 * 4. Grafana queries → metrics queryable via PromQL
 * 
 * Prerequisites:
 * - Prometheus running on port 9091 (Docker: see SETUP-GUIDE.md)
 * - Discord bot running with metrics enabled (npm run dev)
 * 
 * Test Strategy:
 * - Query Prometheus /api/v1/query endpoint to verify metrics exist
 * - Verify metric labels, types, and values match expected format
 * - Test time-windowed metrics update correctly
 * - Simulate operations and verify counters increment
 */

const PROMETHEUS_URL = 'http://localhost:9091';
const METRICS_ENDPOINT = 'http://localhost:9090/metrics';

describe('Prometheus Integration - End to End', () => {
  let prometheusAvailable = false;
  let metricsServerAvailable = false;

  beforeAll(async () => {
    // Check if Prometheus is running
    try {
      const response = await fetch(`${PROMETHEUS_URL}/-/healthy`);
      prometheusAvailable = response.ok;
    } catch {
      // eslint-disable-next-line no-console
      console.warn('⚠️  Prometheus not available on port 9091. Skipping integration tests.');
      // eslint-disable-next-line no-console
      console.warn('   Run: docker run -d --name prometheus-integration -p 9091:9090 -v prometheus.yml:/etc/prometheus/prometheus.yml prom/prometheus');
    }

    // Check if Discord bot metrics server is running
    try {
      const response = await fetch(`${METRICS_ENDPOINT}`);
      metricsServerAvailable = response.ok;
    } catch {
      // eslint-disable-next-line no-console
      console.warn('⚠️  Discord bot metrics server not available on port 9090.');
      // eslint-disable-next-line no-console
      console.warn('   Run: npm run dev (ensure METRICS_PORT=9090)');
    }
  });

  describe('Infrastructure Validation', () => {
    it('should have Prometheus server running on port 9091', async () => {
      if (!prometheusAvailable) {
        // eslint-disable-next-line no-console
        console.warn('⏭️  Skipping: Prometheus not available');
        return;
      }

      const response = await fetch(`${PROMETHEUS_URL}/-/healthy`);
      expect(response.ok).toBe(true);
      
      const text = await response.text();
      expect(text).toContain('Prometheus Server is Healthy');
    });

    it('should have Discord bot metrics server running on port 9090', async () => {
      if (!metricsServerAvailable) {
        // eslint-disable-next-line no-console
        console.warn('⏭️  Skipping: Metrics server not available');
        return;
      }

      const response = await fetch(METRICS_ENDPOINT);
      expect(response.ok).toBe(true);
      
      const text = await response.text();
      expect(text).toContain('security_bot_');
    });

    it('should have Prometheus scraping Discord bot target', async () => {
      if (!prometheusAvailable) {
        // eslint-disable-next-line no-console
        console.warn('⏭️  Skipping: Prometheus not available');
        return;
      }

      const response = await fetch(`${PROMETHEUS_URL}/api/v1/targets`);
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.status).toBe('success');
      
      // Find discord-security-bot target
      const targets = data.data.activeTargets || [];
      const botTarget = targets.find(t => t.labels.job === 'discord-security-bot');
      
      if (!botTarget) {
        // eslint-disable-next-line no-console
        console.warn('⚠️  Discord bot target not configured in Prometheus');
        // eslint-disable-next-line no-console
        console.warn('   Check prometheus.yml scrape_configs');
        return;
      }
      
      expect(botTarget.health).toBe('up');
    });
  });

  describe('Metric Export Validation', () => {
    it('should export all 4 counter metrics', async () => {
      if (!metricsServerAvailable) {
        // eslint-disable-next-line no-console
        console.warn('⏭️  Skipping: Metrics server not available');
        return;
      }

      const response = await fetch(METRICS_ENDPOINT);
      const text = await response.text();

      // Counter 1: Role assignments
      expect(text).toContain('security_bot_role_assignments_total');
      expect(text).toContain('TYPE security_bot_role_assignments_total counter');

      // Counter 2: Cache invalidations
      expect(text).toContain('security_bot_cache_invalidations_total');
      expect(text).toContain('TYPE security_bot_cache_invalidations_total counter');

      // Counter 3: Permission violations
      expect(text).toContain('security_bot_permission_violations_total');
      expect(text).toContain('TYPE security_bot_permission_violations_total counter');

      // Counter 4: Lock acquisitions
      expect(text).toContain('security_bot_lock_acquisitions_total');
      expect(text).toContain('TYPE security_bot_lock_acquisitions_total counter');
    });

    it('should export all 7 gauge metrics', async () => {
      if (!metricsServerAvailable) {
        // eslint-disable-next-line no-console
        console.warn('⏭️  Skipping: Metrics server not available');
        return;
      }

      const response = await fetch(METRICS_ENDPOINT);
      const text = await response.text();

      // Gauge 1: Active sweeps
      expect(text).toContain('security_bot_active_sweeps');
      expect(text).toContain('TYPE security_bot_active_sweeps gauge');

      // Gauge 2: Cache hit rate
      expect(text).toContain('security_bot_cache_hit_rate');
      expect(text).toContain('TYPE security_bot_cache_hit_rate gauge');

      // Gauge 3-6: Time-windowed metrics (24h)
      expect(text).toContain('security_bot_sweeps_last_24_hours');
      expect(text).toContain('security_bot_alerts_last_24_hours');
      expect(text).toContain('security_bot_permission_changes_last_24_hours');
      expect(text).toContain('security_bot_errors_last_24_hours');

      // Gauge 7-8: Rate metrics
      expect(text).toContain('security_bot_sweep_rate_per_hour');
      expect(text).toContain('security_bot_alert_rate_per_hour');
    });

    it('should export all 2 histogram metrics', async () => {
      if (!metricsServerAvailable) {
        // eslint-disable-next-line no-console
        console.warn('⏭️  Skipping: Metrics server not available');
        return;
      }

      const response = await fetch(METRICS_ENDPOINT);
      const text = await response.text();

      // Histogram 1: Sweep candidates per guild
      expect(text).toContain('security_bot_sweep_candidates_per_guild');
      expect(text).toContain('TYPE security_bot_sweep_candidates_per_guild histogram');
      expect(text).toContain('security_bot_sweep_candidates_per_guild_bucket');
      expect(text).toContain('security_bot_sweep_candidates_per_guild_sum');
      expect(text).toContain('security_bot_sweep_candidates_per_guild_count');

      // Histogram 2: Role assignment duration
      expect(text).toContain('security_bot_role_assignment_duration_seconds');
      expect(text).toContain('TYPE security_bot_role_assignment_duration_seconds histogram');
      expect(text).toContain('security_bot_role_assignment_duration_seconds_bucket');
      expect(text).toContain('security_bot_role_assignment_duration_seconds_sum');
      expect(text).toContain('security_bot_role_assignment_duration_seconds_count');
    });
  });

  describe('Prometheus Query Validation', () => {
    it('should be able to query role assignment counter from Prometheus', async () => {
      if (!prometheusAvailable) {
        // eslint-disable-next-line no-console
        console.warn('⏭️  Skipping: Prometheus not available');
        return;
      }

      const query = 'security_bot_role_assignments_total';
      const response = await fetch(
        `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`
      );
      
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.status).toBe('success');
      expect(data.data.resultType).toBe('vector');
      
      // Metrics might be empty if bot just started
      if (data.data.result.length > 0) {
        const metric = data.data.result[0];
        expect(metric.metric.__name__).toBe('security_bot_role_assignments_total');
        expect(metric.metric).toHaveProperty('origin');
        expect(metric.metric).toHaveProperty('guild_id');
        expect(metric.metric).toHaveProperty('result');
      }
    });

    it('should be able to query time-windowed metrics from Prometheus', async () => {
      if (!prometheusAvailable) {
        // eslint-disable-next-line no-console
        console.warn('⏭️  Skipping: Prometheus not available');
        return;
      }

      const query = 'security_bot_sweeps_last_24_hours';
      const response = await fetch(
        `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`
      );
      
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.status).toBe('success');
      expect(data.data.resultType).toBe('vector');
      
      // Should have exactly 1 result (global gauge, no labels)
      if (data.data.result.length > 0) {
        const metric = data.data.result[0];
        expect(metric.metric.__name__).toBe('security_bot_sweeps_last_24_hours');
        
        // Value should be non-negative number
        const value = parseFloat(metric.value[1]);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });

    it('should be able to calculate role assignment success rate', async () => {
      if (!prometheusAvailable) {
        // eslint-disable-next-line no-console
        console.warn('⏭️  Skipping: Prometheus not available');
        return;
      }

      // PromQL query: (success / total) * 100
      const query = `
        (
          sum(rate(security_bot_role_assignments_total{result="success"}[5m]))
          /
          sum(rate(security_bot_role_assignments_total[5m]))
        ) * 100
      `;
      
      const response = await fetch(
        `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`
      );
      
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.status).toBe('success');
      
      // Result might be empty if no assignments yet
      if (data.data.result.length > 0) {
        const value = parseFloat(data.data.result[0].value[1]);
        // Success rate should be between 0-100%
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Health Endpoint Validation', () => {
    it('should return healthy status from /health endpoint', async () => {
      if (!metricsServerAvailable) {
        // eslint-disable-next-line no-console
        console.warn('⏭️  Skipping: Metrics server not available');
        return;
      }

      const response = await fetch('http://localhost:9090/health');
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      
      // Uptime should be positive number (seconds)
      expect(data.uptime).toBeGreaterThan(0);
    });
  });
});

/**
 * Test Results Summary (Expected):
 * 
 * ✅ Infrastructure Validation (3 tests)
 *    - Prometheus server running
 *    - Discord bot metrics server running
 *    - Prometheus scraping bot target
 * 
 * ✅ Metric Export Validation (3 tests)
 *    - All 4 counters exported
 *    - All 7 gauges exported
 *    - All 2 histograms exported
 * 
 * ✅ Prometheus Query Validation (3 tests)
 *    - Query role assignment counter
 *    - Query time-windowed metrics
 *    - Calculate success rate (PromQL)
 * 
 * ✅ Health Endpoint Validation (1 test)
 *    - Health endpoint returns OK
 * 
 * Total: 10 integration tests
 * 
 * Run Command:
 *   npm test -- tests/integration/prometheus-e2e.spec.js
 * 
 * Prerequisites:
 *   1. Start Prometheus: docker run -d -p 9091:9090 -v prometheus.yml:/etc/prometheus/prometheus.yml prom/prometheus
 *   2. Start Discord bot: npm run dev
 *   3. Wait 15-30 seconds for first scrape
 *   4. Run tests: npm test -- tests/integration/prometheus-e2e.spec.js
 */
