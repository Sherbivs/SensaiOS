/**
 * Prometheus Metrics Service
 *
 * @module src/bot/security/services/prometheus-metrics-service
 * @description Exposes security metrics in Prometheus format for observability.
 * Implements standard metric types (Counter, Gauge, Histogram, Summary) and
 * provides health check endpoints compatible with Kubernetes probes.
 *
 * @compliance
 * - Prometheus exposition format (text/plain; version=0.0.4)
 * - OpenMetrics compatible
 * - Kubernetes liveness/readiness probe compatible
 *
 * @features
 * - Security event counters by type and severity
 * - Threat detection rate metrics
 * - Role change velocity tracking
 * - Database connection health
 * - Memory and CPU utilization
 * - Custom histogram buckets for latency
 *
 * @author DevOps Specialist (Sprint 2)
 * @since 2025-12-05
 */
import { getErrorMessage } from "../../../shared/utils/error-utils.js";
// ============================================================================
// Constants
// ============================================================================
/**
 * Default histogram buckets for latency measurements (ms)
 */
export const DEFAULT_LATENCY_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
/**
 * Default summary quantiles
 */
export const DEFAULT_QUANTILES = [0.5, 0.9, 0.95, 0.99];
/**
 * Pre-defined security metrics
 */
export const SECURITY_METRICS = [
    {
        name: 'security_events_total',
        help: 'Total number of security events recorded',
        type: 'counter',
        labelNames: ['event_type', 'severity', 'guild_id'],
    },
    {
        name: 'threats_detected_total',
        help: 'Total number of threats detected',
        type: 'counter',
        labelNames: ['threat_type', 'severity', 'resolved'],
    },
    {
        name: 'role_changes_total',
        help: 'Total number of role changes audited',
        type: 'counter',
        labelNames: ['change_type', 'guild_id'],
    },
    {
        name: 'active_baselines',
        help: 'Number of active security baselines',
        type: 'gauge',
        labelNames: ['guild_id'],
    },
    {
        name: 'security_operation_duration_seconds',
        help: 'Duration of security operations in seconds',
        type: 'histogram',
        labelNames: ['operation', 'status'],
        buckets: DEFAULT_LATENCY_BUCKETS.map(b => b / 1000), // Convert to seconds
    },
    {
        name: 'database_query_duration_seconds',
        help: 'Duration of database queries in seconds',
        type: 'histogram',
        labelNames: ['table', 'operation'],
        buckets: DEFAULT_LATENCY_BUCKETS.map(b => b / 1000),
    },
    {
        name: 'encryption_operations_total',
        help: 'Total number of encryption/decryption operations',
        type: 'counter',
        labelNames: ['operation', 'field_type'],
    },
    {
        name: 'key_rotations_total',
        help: 'Total number of key rotations performed',
        type: 'counter',
        labelNames: ['algorithm', 'status'],
    },
    {
        name: 'audit_log_entries_total',
        help: 'Total number of immutable audit log entries',
        type: 'counter',
        labelNames: ['category'],
    },
    {
        name: 'hash_chain_verifications_total',
        help: 'Total number of hash chain verifications',
        type: 'counter',
        labelNames: ['result'],
    },
];
// ============================================================================
// Implementation
// ============================================================================
/**
 * Prometheus Metrics Service
 *
 * Collects and exposes security metrics in Prometheus format.
 */
export class PrometheusMetricsService {
    config;
    counters = new Map();
    gauges = new Map();
    histograms = new Map();
    summaries = new Map();
    metricConfigs = new Map();
    healthCheckers = new Map();
    startTime;
    /**
     * Create a new PrometheusMetricsService
     */
    constructor(config = {}) {
        this.config = {
            prefix: config.prefix ?? 'infinity_gauntlet_security_',
            defaultLabels: config.defaultLabels ?? {},
            healthCheckTimeoutMs: config.healthCheckTimeoutMs ?? 5000,
            includeProcessMetrics: config.includeProcessMetrics ?? true,
            includeRuntimeMetrics: config.includeRuntimeMetrics ?? true,
            version: config.version ?? '1.0.0',
        };
        this.startTime = new Date();
        // Register default security metrics
        for (const metric of SECURITY_METRICS) {
            this.registerMetric(metric);
        }
    }
    // ==========================================================================
    // Metric Registration
    // ==========================================================================
    /**
     * Register a new metric
     */
    registerMetric(config) {
        const fullName = this.config.prefix + config.name;
        this.metricConfigs.set(fullName, { ...config, name: fullName });
        switch (config.type) {
            case 'counter':
                this.counters.set(fullName, new Map());
                break;
            case 'gauge':
                this.gauges.set(fullName, new Map());
                break;
            case 'histogram':
                this.histograms.set(fullName, new Map());
                break;
            case 'summary':
                this.summaries.set(fullName, new Map());
                break;
        }
    }
    /**
     * Get registered metric config
     */
    getMetricConfig(name) {
        const fullName = name.startsWith(this.config.prefix) ? name : this.config.prefix + name;
        return this.metricConfigs.get(fullName);
    }
    // ==========================================================================
    // Counter Operations
    // ==========================================================================
    /**
     * Increment a counter
     */
    incCounter(name, labels = {}, value = 1) {
        const fullName = this.config.prefix + name;
        const counter = this.counters.get(fullName);
        if (!counter) {
            throw new Error(`Counter ${name} not registered`);
        }
        const labelKey = this.labelsToKey(labels);
        const current = counter.get(labelKey) ?? 0;
        counter.set(labelKey, current + value);
    }
    /**
     * Get counter value
     */
    getCounter(name, labels = {}) {
        const fullName = this.config.prefix + name;
        const counter = this.counters.get(fullName);
        if (!counter) {
            return 0;
        }
        const labelKey = this.labelsToKey(labels);
        return counter.get(labelKey) ?? 0;
    }
    // ==========================================================================
    // Gauge Operations
    // ==========================================================================
    /**
     * Set a gauge value
     */
    setGauge(name, value, labels = {}) {
        const fullName = this.config.prefix + name;
        const gauge = this.gauges.get(fullName);
        if (!gauge) {
            throw new Error(`Gauge ${name} not registered`);
        }
        const labelKey = this.labelsToKey(labels);
        gauge.set(labelKey, value);
    }
    /**
     * Increment a gauge
     */
    incGauge(name, labels = {}, value = 1) {
        const fullName = this.config.prefix + name;
        const gauge = this.gauges.get(fullName);
        if (!gauge) {
            throw new Error(`Gauge ${name} not registered`);
        }
        const labelKey = this.labelsToKey(labels);
        const current = gauge.get(labelKey) ?? 0;
        gauge.set(labelKey, current + value);
    }
    /**
     * Decrement a gauge
     */
    decGauge(name, labels = {}, value = 1) {
        this.incGauge(name, labels, -value);
    }
    /**
     * Get gauge value
     */
    getGauge(name, labels = {}) {
        const fullName = this.config.prefix + name;
        const gauge = this.gauges.get(fullName);
        if (!gauge) {
            return 0;
        }
        const labelKey = this.labelsToKey(labels);
        return gauge.get(labelKey) ?? 0;
    }
    // ==========================================================================
    // Histogram Operations
    // ==========================================================================
    /**
     * Observe a histogram value
     */
    observeHistogram(name, value, labels = {}) {
        const fullName = this.config.prefix + name;
        const histogram = this.histograms.get(fullName);
        if (!histogram) {
            throw new Error(`Histogram ${name} not registered`);
        }
        const config = this.metricConfigs.get(fullName);
        const buckets = config?.buckets ?? DEFAULT_LATENCY_BUCKETS;
        const labelKey = this.labelsToKey(labels);
        let histValue = histogram.get(labelKey);
        if (!histValue) {
            histValue = {
                sum: 0,
                count: 0,
                buckets: new Map(buckets.map(b => [b, 0])),
                labels,
            };
            histogram.set(labelKey, histValue);
        }
        histValue.sum += value;
        histValue.count += 1;
        // Update bucket counts
        for (const bucket of buckets) {
            if (value <= bucket) {
                histValue.buckets.set(bucket, (histValue.buckets.get(bucket) ?? 0) + 1);
            }
        }
    }
    /**
     * Time a function and observe as histogram
     */
    async timeHistogram(name, fn, labels = {}) {
        const start = performance.now();
        try {
            return await fn();
        }
        finally {
            const duration = (performance.now() - start) / 1000; // Convert to seconds
            this.observeHistogram(name, duration, labels);
        }
    }
    // ==========================================================================
    // Summary Operations
    // ==========================================================================
    /**
     * Observe a summary value
     */
    observeSummary(name, value, labels = {}) {
        const fullName = this.config.prefix + name;
        const summary = this.summaries.get(fullName);
        if (!summary) {
            throw new Error(`Summary ${name} not registered`);
        }
        const labelKey = this.labelsToKey(labels);
        let summaryValue = summary.get(labelKey);
        if (!summaryValue) {
            summaryValue = {
                sum: 0,
                count: 0,
                quantiles: new Map(),
                labels,
            };
            summary.set(labelKey, summaryValue);
        }
        summaryValue.sum += value;
        summaryValue.count += 1;
        // Note: Proper quantile calculation requires keeping all observations
        // This is a simplified implementation
    }
    // ==========================================================================
    // Health Checks
    // ==========================================================================
    /**
     * Register a health checker
     */
    registerHealthChecker(name, checker) {
        this.healthCheckers.set(name, checker);
    }
    /**
     * Run all health checks
     */
    async checkHealth() {
        const components = [];
        let overallStatus = 'healthy';
        for (const [name, checker] of this.healthCheckers) {
            try {
                const result = await Promise.race([
                    checker(),
                    this.healthCheckTimeout(name),
                ]);
                components.push(result);
                if (result.status === 'unhealthy') {
                    overallStatus = 'unhealthy';
                }
                else if (result.status === 'degraded' && overallStatus !== 'unhealthy') {
                    overallStatus = 'degraded';
                }
            }
            catch (error) {
                components.push({
                    name,
                    status: 'unhealthy',
                    message: getErrorMessage(error),
                    lastCheck: new Date(),
                });
                overallStatus = 'unhealthy';
            }
        }
        return {
            status: overallStatus,
            timestamp: new Date(),
            version: this.config.version,
            uptime: Date.now() - this.startTime.getTime(),
            components,
        };
    }
    /**
     * Get liveness status (for Kubernetes)
     */
    async getLiveness() {
        // Basic liveness - service is running
        return {
            alive: true,
            message: 'Service is alive',
        };
    }
    /**
     * Get readiness status (for Kubernetes)
     */
    async getReadiness() {
        const health = await this.checkHealth();
        return {
            ready: health.status !== 'unhealthy',
            message: health.status === 'unhealthy'
                ? 'Service is not ready'
                : 'Service is ready',
        };
    }
    // ==========================================================================
    // Prometheus Format Export
    // ==========================================================================
    /**
     * Export all metrics in Prometheus text format
     */
    exportMetrics() {
        const lines = [];
        // Export counters
        for (const [name, values] of this.counters) {
            const config = this.metricConfigs.get(name);
            if (config) {
                lines.push(`# HELP ${name} ${config.help}`);
                lines.push(`# TYPE ${name} counter`);
                for (const [labelKey, value] of values) {
                    const labels = this.keyToLabels(labelKey);
                    lines.push(`${name}${this.formatLabels(labels)} ${value}`);
                }
            }
        }
        // Export gauges
        for (const [name, values] of this.gauges) {
            const config = this.metricConfigs.get(name);
            if (config) {
                lines.push(`# HELP ${name} ${config.help}`);
                lines.push(`# TYPE ${name} gauge`);
                for (const [labelKey, value] of values) {
                    const labels = this.keyToLabels(labelKey);
                    lines.push(`${name}${this.formatLabels(labels)} ${value}`);
                }
            }
        }
        // Export histograms
        for (const [name, values] of this.histograms) {
            const config = this.metricConfigs.get(name);
            if (config) {
                lines.push(`# HELP ${name} ${config.help}`);
                lines.push(`# TYPE ${name} histogram`);
                for (const [, histValue] of values) {
                    const labels = histValue.labels;
                    // Bucket counts
                    let cumulativeCount = 0;
                    for (const [bucket, count] of histValue.buckets) {
                        cumulativeCount += count;
                        lines.push(`${name}_bucket${this.formatLabels({ ...labels, le: String(bucket) })} ${cumulativeCount}`);
                    }
                    lines.push(`${name}_bucket${this.formatLabels({ ...labels, le: '+Inf' })} ${histValue.count}`);
                    lines.push(`${name}_sum${this.formatLabels(labels)} ${histValue.sum}`);
                    lines.push(`${name}_count${this.formatLabels(labels)} ${histValue.count}`);
                }
            }
        }
        // Export summaries
        for (const [name, values] of this.summaries) {
            const config = this.metricConfigs.get(name);
            if (config) {
                lines.push(`# HELP ${name} ${config.help}`);
                lines.push(`# TYPE ${name} summary`);
                for (const [, summaryValue] of values) {
                    const labels = summaryValue.labels;
                    lines.push(`${name}_sum${this.formatLabels(labels)} ${summaryValue.sum}`);
                    lines.push(`${name}_count${this.formatLabels(labels)} ${summaryValue.count}`);
                }
            }
        }
        // Add process metrics if enabled
        if (this.config.includeProcessMetrics) {
            lines.push(...this.getProcessMetrics());
        }
        return lines.join('\n');
    }
    /**
     * Get metrics as JSON (for debugging)
     */
    getMetricsJson() {
        return {
            counters: Object.fromEntries(Array.from(this.counters).map(([name, values]) => [
                name,
                Object.fromEntries(values),
            ])),
            gauges: Object.fromEntries(Array.from(this.gauges).map(([name, values]) => [
                name,
                Object.fromEntries(values),
            ])),
            histograms: Object.fromEntries(Array.from(this.histograms).map(([name, values]) => [
                name,
                Array.from(values).map(([_key, val]) => ({
                    labels: val.labels,
                    sum: val.sum,
                    count: val.count,
                    buckets: Object.fromEntries(val.buckets),
                })),
            ])),
        };
    }
    // ==========================================================================
    // Utility Methods
    // ==========================================================================
    /**
     * Reset all metrics (for testing)
     */
    reset() {
        for (const counter of this.counters.values()) {
            counter.clear();
        }
        for (const gauge of this.gauges.values()) {
            gauge.clear();
        }
        for (const histogram of this.histograms.values()) {
            histogram.clear();
        }
        for (const summary of this.summaries.values()) {
            summary.clear();
        }
    }
    /**
     * Get uptime in seconds
     */
    getUptime() {
        return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    }
    /**
     * Get registered metric names
     */
    getRegisteredMetrics() {
        return Array.from(this.metricConfigs.keys());
    }
    // ==========================================================================
    // Private Helpers
    // ==========================================================================
    /**
     * Convert labels to a deterministic string key
     */
    labelsToKey(labels) {
        const merged = { ...this.config.defaultLabels, ...labels };
        const sorted = Object.keys(merged).sort();
        return sorted.map(k => `${k}=${merged[k]}`).join(',');
    }
    /**
     * Convert key back to labels
     */
    keyToLabels(key) {
        if (!key)
            return {};
        const labels = {};
        for (const pair of key.split(',')) {
            const [k, v] = pair.split('=');
            if (k && v !== undefined) {
                labels[k] = v;
            }
        }
        return labels;
    }
    /**
     * Format labels for Prometheus output
     */
    formatLabels(labels) {
        const pairs = Object.entries(labels)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => `${k}="${this.escapeLabel(v)}"`);
        return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
    }
    /**
     * Escape label value for Prometheus format
     */
    escapeLabel(value) {
        return value
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n');
    }
    /**
     * Get process metrics
     */
    getProcessMetrics() {
        const lines = [];
        const prefix = this.config.prefix;
        // Memory usage
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const mem = process.memoryUsage();
            lines.push(`# HELP ${prefix}process_heap_bytes Process heap size in bytes`);
            lines.push(`# TYPE ${prefix}process_heap_bytes gauge`);
            lines.push(`${prefix}process_heap_bytes ${mem.heapUsed}`);
            lines.push(`# HELP ${prefix}process_rss_bytes Process resident set size in bytes`);
            lines.push(`# TYPE ${prefix}process_rss_bytes gauge`);
            lines.push(`${prefix}process_rss_bytes ${mem.rss}`);
        }
        // Uptime
        lines.push(`# HELP ${prefix}process_uptime_seconds Process uptime in seconds`);
        lines.push(`# TYPE ${prefix}process_uptime_seconds gauge`);
        lines.push(`${prefix}process_uptime_seconds ${this.getUptime()}`);
        return lines;
    }
    /**
     * Create a timeout promise for health checks
     */
    healthCheckTimeout(name) {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Health check ${name} timed out`));
            }, this.config.healthCheckTimeoutMs);
        });
    }
}
// ============================================================================
// Factory Function
// ============================================================================
/**
 * Create a PrometheusMetricsService with environment-based configuration
 */
export function createPrometheusMetricsService(overrides) {
    const config = {
        prefix: process.env.METRICS_PREFIX ?? 'infinity_gauntlet_security_',
        healthCheckTimeoutMs: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS ?? '5000', 10),
        includeProcessMetrics: process.env.INCLUDE_PROCESS_METRICS !== 'false',
        includeRuntimeMetrics: process.env.INCLUDE_RUNTIME_METRICS !== 'false',
        version: process.env.APP_VERSION ?? '1.0.0',
        ...overrides,
    };
    return new PrometheusMetricsService(config);
}
// ============================================================================
// Exports
// ============================================================================
export default PrometheusMetricsService;
