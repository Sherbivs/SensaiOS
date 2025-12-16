/**
 * @fileoverview Tests for Prometheus Metrics Service
 * @module tests/security/services/prometheus-metrics-service
 *
 * Task: P1-007 - Prometheus Metrics + Health
 * Sprint: 2 (SECDB-2025-12)
 *
 * Tests the Prometheus metrics collection and health check functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { delay } from '../../shared/index.js';
import {
  PrometheusMetricsService,
  createPrometheusMetricsService,
  SECURITY_METRICS,
  DEFAULT_LATENCY_BUCKETS,
  type HealthChecker,
  type Labels as _Labels,
} from "../../../src/bot/security/services/prometheus-metrics-service.js";

// ============================================================================
// TEST SUITES
// ============================================================================

describe("PrometheusMetricsService", () => {
  let service: PrometheusMetricsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PrometheusMetricsService({
      prefix: "test_",
      version: "1.0.0-test",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // CONSTRUCTOR TESTS
  // ==========================================================================

  describe("Constructor", () => {
    it("should create instance with default configuration", () => {
      const instance = new PrometheusMetricsService();
      expect(instance).toBeInstanceOf(PrometheusMetricsService);
    });

    it("should create instance with custom prefix", () => {
      const instance = new PrometheusMetricsService({ prefix: "custom_" });
      expect(instance.getRegisteredMetrics()).toContain("custom_security_events_total");
    });

    it("should register default security metrics", () => {
      const metrics = service.getRegisteredMetrics();
      
      for (const metric of SECURITY_METRICS) {
        expect(metrics).toContain(`test_${metric.name}`);
      }
    });

    it("should create instance with custom version", () => {
      const instance = new PrometheusMetricsService({ version: "2.0.0" });
      expect(instance).toBeInstanceOf(PrometheusMetricsService);
    });
  });

  // ==========================================================================
  // FACTORY FUNCTION TESTS
  // ==========================================================================

  describe("createPrometheusMetricsService factory", () => {
    it("should create service instance via factory", () => {
      const instance = createPrometheusMetricsService();
      expect(instance).toBeInstanceOf(PrometheusMetricsService);
    });

    it("should create service with overrides via factory", () => {
      const instance = createPrometheusMetricsService({
        prefix: "factory_test_",
      });
      expect(instance.getRegisteredMetrics()).toContain("factory_test_security_events_total");
    });
  });

  // ==========================================================================
  // METRIC REGISTRATION
  // ==========================================================================

  describe("Metric Registration", () => {
    it("should register a new counter metric", () => {
      service.registerMetric({
        name: "custom_counter",
        help: "A custom counter",
        type: "counter",
      });

      const metrics = service.getRegisteredMetrics();
      expect(metrics).toContain("test_custom_counter");
    });

    it("should register a new gauge metric", () => {
      service.registerMetric({
        name: "custom_gauge",
        help: "A custom gauge",
        type: "gauge",
      });

      const metrics = service.getRegisteredMetrics();
      expect(metrics).toContain("test_custom_gauge");
    });

    it("should register a new histogram metric", () => {
      service.registerMetric({
        name: "custom_histogram",
        help: "A custom histogram",
        type: "histogram",
        buckets: [0.1, 0.5, 1.0],
      });

      const metrics = service.getRegisteredMetrics();
      expect(metrics).toContain("test_custom_histogram");
    });

    it("should register a new summary metric", () => {
      service.registerMetric({
        name: "custom_summary",
        help: "A custom summary",
        type: "summary",
        quantiles: [0.5, 0.99],
      });

      const metrics = service.getRegisteredMetrics();
      expect(metrics).toContain("test_custom_summary");
    });

    it("should get metric config by name", () => {
      const config = service.getMetricConfig("security_events_total");

      expect(config).toBeDefined();
      expect(config?.type).toBe("counter");
    });

    it("should return undefined for unknown metric", () => {
      const config = service.getMetricConfig("unknown_metric");
      expect(config).toBeUndefined();
    });
  });

  // ==========================================================================
  // COUNTER OPERATIONS
  // ==========================================================================

  describe("Counter Operations", () => {
    it("should increment counter by 1", () => {
      service.incCounter("security_events_total", { event_type: "ROLE_CHANGE" });

      const value = service.getCounter("security_events_total", { event_type: "ROLE_CHANGE" });
      expect(value).toBe(1);
    });

    it("should increment counter by custom value", () => {
      service.incCounter("security_events_total", { event_type: "LOGIN" }, 5);

      const value = service.getCounter("security_events_total", { event_type: "LOGIN" });
      expect(value).toBe(5);
    });

    it("should track separate label combinations", () => {
      service.incCounter("security_events_total", { event_type: "ROLE_CHANGE" }, 3);
      service.incCounter("security_events_total", { event_type: "PERMISSION_CHANGE" }, 2);

      expect(service.getCounter("security_events_total", { event_type: "ROLE_CHANGE" })).toBe(3);
      expect(service.getCounter("security_events_total", { event_type: "PERMISSION_CHANGE" })).toBe(2);
    });

    it("should accumulate counter increments", () => {
      service.incCounter("security_events_total", {});
      service.incCounter("security_events_total", {});
      service.incCounter("security_events_total", {});

      expect(service.getCounter("security_events_total", {})).toBe(3);
    });

    it("should return 0 for unset counter", () => {
      expect(service.getCounter("security_events_total", { event_type: "NEW" })).toBe(0);
    });

    it("should throw error for unregistered counter", () => {
      expect(() => {
        service.incCounter("unknown_counter", {});
      }).toThrow("Counter unknown_counter not registered");
    });
  });

  // ==========================================================================
  // GAUGE OPERATIONS
  // ==========================================================================

  describe("Gauge Operations", () => {
    it("should set gauge value", () => {
      service.setGauge("active_baselines", 10, { guild_id: "guild1" });

      expect(service.getGauge("active_baselines", { guild_id: "guild1" })).toBe(10);
    });

    it("should overwrite gauge value", () => {
      service.setGauge("active_baselines", 10, {});
      service.setGauge("active_baselines", 20, {});

      expect(service.getGauge("active_baselines", {})).toBe(20);
    });

    it("should increment gauge", () => {
      service.setGauge("active_baselines", 5, {});
      service.incGauge("active_baselines", {}, 3);

      expect(service.getGauge("active_baselines", {})).toBe(8);
    });

    it("should decrement gauge", () => {
      service.setGauge("active_baselines", 10, {});
      service.decGauge("active_baselines", {}, 4);

      expect(service.getGauge("active_baselines", {})).toBe(6);
    });

    it("should track separate label combinations for gauges", () => {
      service.setGauge("active_baselines", 5, { guild_id: "guild1" });
      service.setGauge("active_baselines", 8, { guild_id: "guild2" });

      expect(service.getGauge("active_baselines", { guild_id: "guild1" })).toBe(5);
      expect(service.getGauge("active_baselines", { guild_id: "guild2" })).toBe(8);
    });

    it("should return 0 for unset gauge", () => {
      expect(service.getGauge("active_baselines", { guild_id: "unknown" })).toBe(0);
    });

    it("should throw error for unregistered gauge", () => {
      expect(() => {
        service.setGauge("unknown_gauge", 10, {});
      }).toThrow("Gauge unknown_gauge not registered");
    });
  });

  // ==========================================================================
  // HISTOGRAM OPERATIONS
  // ==========================================================================

  describe("Histogram Operations", () => {
    it("should observe histogram value", () => {
      service.observeHistogram("security_operation_duration_seconds", 0.5, { operation: "verify" });

      const metrics = service.getMetricsJson();
      expect(metrics.histograms).toBeDefined();
    });

    it("should track multiple observations", () => {
      service.observeHistogram("security_operation_duration_seconds", 0.1, { operation: "hash" });
      service.observeHistogram("security_operation_duration_seconds", 0.2, { operation: "hash" });
      service.observeHistogram("security_operation_duration_seconds", 0.3, { operation: "hash" });

      const metrics = service.getMetricsJson();
      expect(metrics.histograms).toBeDefined();
    });

    it("should update bucket counts correctly", () => {
      // Observe values that fall into different buckets
      service.observeHistogram("security_operation_duration_seconds", 0.001, { operation: "fast" });
      service.observeHistogram("security_operation_duration_seconds", 0.1, { operation: "fast" });
      service.observeHistogram("security_operation_duration_seconds", 1.0, { operation: "fast" });

      const output = service.exportMetrics();
      expect(output).toContain("test_security_operation_duration_seconds_count");
    });

    it("should throw error for unregistered histogram", () => {
      expect(() => {
        service.observeHistogram("unknown_histogram", 1.0, {});
      }).toThrow("Histogram unknown_histogram not registered");
    });

    it("should time async functions", async () => {
      const result = await service.timeHistogram(
        "security_operation_duration_seconds",
        async () => {
          await delay();
          return "done";
        },
        { operation: "async_test" }
      );

      expect(result).toBe("done");
    });
  });

  // ==========================================================================
  // SUMMARY OPERATIONS
  // ==========================================================================

  describe("Summary Operations", () => {
    beforeEach(() => {
      service.registerMetric({
        name: "request_duration_summary",
        help: "Request duration summary",
        type: "summary",
        quantiles: [0.5, 0.9, 0.99],
      });
    });

    it("should observe summary value", () => {
      service.observeSummary("request_duration_summary", 0.5, {});

      const metrics = service.getMetricsJson();
      expect(metrics).toBeDefined();
    });

    it("should track sum and count", () => {
      service.observeSummary("request_duration_summary", 1.0, {});
      service.observeSummary("request_duration_summary", 2.0, {});
      service.observeSummary("request_duration_summary", 3.0, {});

      const output = service.exportMetrics();
      expect(output).toContain("test_request_duration_summary_sum");
      expect(output).toContain("test_request_duration_summary_count");
    });

    it("should throw error for unregistered summary", () => {
      expect(() => {
        service.observeSummary("unknown_summary", 1.0, {});
      }).toThrow("Summary unknown_summary not registered");
    });
  });

  // ==========================================================================
  // HEALTH CHECKS
  // ==========================================================================

  describe("Health Checks", () => {
    describe("registerHealthChecker", () => {
      it("should register a health checker", () => {
        const checker: HealthChecker = async () => ({
          name: "database",
          status: "healthy",
          lastCheck: new Date(),
        });

        service.registerHealthChecker("database", checker);
        // No error means success
      });
    });

    describe("checkHealth", () => {
      it("should return healthy when all checks pass", async () => {
        service.registerHealthChecker("db", async () => ({
          name: "db",
          status: "healthy",
          lastCheck: new Date(),
        }));

        const report = await service.checkHealth();

        expect(report.status).toBe("healthy");
        expect(report.components.length).toBe(1);
      });

      it("should return degraded when some checks are degraded", async () => {
        service.registerHealthChecker("db", async () => ({
          name: "db",
          status: "healthy",
          lastCheck: new Date(),
        }));
        service.registerHealthChecker("cache", async () => ({
          name: "cache",
          status: "degraded",
          message: "High latency",
          lastCheck: new Date(),
        }));

        const report = await service.checkHealth();

        expect(report.status).toBe("degraded");
      });

      it("should return unhealthy when any check fails", async () => {
        service.registerHealthChecker("db", async () => ({
          name: "db",
          status: "unhealthy",
          message: "Connection failed",
          lastCheck: new Date(),
        }));

        const report = await service.checkHealth();

        expect(report.status).toBe("unhealthy");
      });

      it("should handle health check exceptions", async () => {
        service.registerHealthChecker("failing", async () => {
          throw new Error("Check failed");
        });

        const report = await service.checkHealth();

        expect(report.status).toBe("unhealthy");
        expect(report.components[0].message).toContain("Check failed");
      });

      it("should include version and uptime", async () => {
        const report = await service.checkHealth();

        expect(report.version).toBe("1.0.0-test");
        expect(report.uptime).toBeGreaterThanOrEqual(0);
      });
    });

    describe("getLiveness", () => {
      it("should return alive status", async () => {
        const status = await service.getLiveness();

        expect(status.alive).toBe(true);
        expect(status.message).toBe("Service is alive");
      });
    });

    describe("getReadiness", () => {
      it("should return ready when healthy", async () => {
        service.registerHealthChecker("db", async () => ({
          name: "db",
          status: "healthy",
          lastCheck: new Date(),
        }));

        const status = await service.getReadiness();

        expect(status.ready).toBe(true);
      });

      it("should return not ready when unhealthy", async () => {
        service.registerHealthChecker("db", async () => ({
          name: "db",
          status: "unhealthy",
          lastCheck: new Date(),
        }));

        const status = await service.getReadiness();

        expect(status.ready).toBe(false);
        expect(status.message).toBe("Service is not ready");
      });
    });
  });

  // ==========================================================================
  // PROMETHEUS FORMAT EXPORT
  // ==========================================================================

  describe("Prometheus Format Export", () => {
    it("should export counters in Prometheus format", () => {
      service.incCounter("security_events_total", { event_type: "TEST" }, 5);

      const output = service.exportMetrics();

      expect(output).toContain("# HELP test_security_events_total");
      expect(output).toContain("# TYPE test_security_events_total counter");
      expect(output).toContain('test_security_events_total{event_type="TEST"} 5');
    });

    it("should export gauges in Prometheus format", () => {
      service.setGauge("active_baselines", 42, { guild_id: "g123" });

      const output = service.exportMetrics();

      expect(output).toContain("# HELP test_active_baselines");
      expect(output).toContain("# TYPE test_active_baselines gauge");
      expect(output).toContain('test_active_baselines{guild_id="g123"} 42');
    });

    it("should export histograms with buckets", () => {
      service.observeHistogram("security_operation_duration_seconds", 0.5, { operation: "test" });

      const output = service.exportMetrics();

      expect(output).toContain("test_security_operation_duration_seconds_bucket");
      expect(output).toContain("test_security_operation_duration_seconds_sum");
      expect(output).toContain("test_security_operation_duration_seconds_count");
    });

    it("should escape special characters in labels", () => {
      service.incCounter("security_events_total", { event_type: 'test"quoted' });

      const output = service.exportMetrics();

      expect(output).toContain('event_type="test\\"quoted"');
    });

    it("should include process metrics when enabled", () => {
      const instance = new PrometheusMetricsService({
        prefix: "test_",
        includeProcessMetrics: true,
      });

      const output = instance.exportMetrics();

      expect(output).toContain("test_process_uptime_seconds");
    });
  });

  // ==========================================================================
  // JSON EXPORT
  // ==========================================================================

  describe("JSON Export", () => {
    it("should export metrics as JSON", () => {
      service.incCounter("security_events_total", { event_type: "TEST" }, 3);
      service.setGauge("active_baselines", 5, {});

      const json = service.getMetricsJson();

      expect(json.counters).toBeDefined();
      expect(json.gauges).toBeDefined();
      expect(json.histograms).toBeDefined();
    });
  });

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  describe("Utility Methods", () => {
    describe("reset", () => {
      it("should clear all metric values", () => {
        service.incCounter("security_events_total", {}, 10);
        service.setGauge("active_baselines", 5, {});

        service.reset();

        expect(service.getCounter("security_events_total", {})).toBe(0);
        expect(service.getGauge("active_baselines", {})).toBe(0);
      });
    });

    describe("getUptime", () => {
      it("should return uptime in seconds", () => {
        const uptime = service.getUptime();

        expect(uptime).toBeGreaterThanOrEqual(0);
      });
    });

    describe("getRegisteredMetrics", () => {
      it("should return list of registered metric names", () => {
        const metrics = service.getRegisteredMetrics();

        expect(metrics.length).toBeGreaterThan(0);
        expect(metrics).toContain("test_security_events_total");
      });
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe("Edge Cases", () => {
    it("should handle empty labels", () => {
      service.incCounter("security_events_total");

      const value = service.getCounter("security_events_total");
      expect(value).toBe(1);
    });

    it("should handle labels with empty string values", () => {
      service.incCounter("security_events_total", { event_type: "" });

      const output = service.exportMetrics();
      expect(output).toBeDefined();
    });

    it("should handle labels with special characters", () => {
      service.incCounter("security_events_total", { event_type: "test\nvalue" });

      const output = service.exportMetrics();
      expect(output).toContain("\\n");
    });

    it("should handle concurrent metric updates", async () => {
      const promises = Array.from({ length: 100 }, (_) =>
        Promise.resolve(
          service.incCounter("security_events_total", { event_type: "concurrent" })
        )
      );

      await Promise.all(promises);

      expect(service.getCounter("security_events_total", { event_type: "concurrent" })).toBe(100);
    });

    it("should handle very large counter values", () => {
      service.incCounter("security_events_total", {}, Number.MAX_SAFE_INTEGER);

      const value = service.getCounter("security_events_total", {});
      expect(value).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("should handle negative gauge values", () => {
      service.setGauge("active_baselines", -10, {});

      expect(service.getGauge("active_baselines", {})).toBe(-10);
    });
  });

  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  describe("Constants", () => {
    it("should have default latency buckets", () => {
      expect(DEFAULT_LATENCY_BUCKETS).toEqual([1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);
    });

    it("should have pre-defined security metrics", () => {
      expect(SECURITY_METRICS.length).toBeGreaterThan(0);
      
      const metricNames = SECURITY_METRICS.map(m => m.name);
      expect(metricNames).toContain("security_events_total");
      expect(metricNames).toContain("threats_detected_total");
      expect(metricNames).toContain("role_changes_total");
    });
  });
});
