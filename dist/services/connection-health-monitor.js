/**
 * Enhanced Connection Health Monitor — Advanced pool monitoring with leak detection
 *
 * P2-003: Connection Health Monitoring (Database-Centric Development Plan Sprint 3)
 *
 * Features:
 * - Connection leak detection (connections held >30s)
 * - Connection age tracking (long-lived connection warnings)
 * - Automatic unhealthy connection detection
 * - Pool exhaustion prediction
 * - Detailed health report generation
 *
 * Integration Points:
 * - database-pool-config.ts (pool configuration)
 * - database-metrics.ts (Prometheus metrics)
 * - prisma.ts (heartbeat events)
 *
 * @module services/connection-health-monitor
 */
import { log } from "../shared/logger.js";
import { getPoolConfig, getPoolMetrics, getCurrentServiceName } from '../config/database-pool-config.js';
import { Counter, Gauge, register } from 'prom-client';
const DEFAULT_CONFIG = {
    leakThresholdMs: 30_000, // 30 seconds
    connectionAgeWarningMs: 300_000, // 5 minutes  
    utilizationWarningThreshold: 70, // 70%
    utilizationCriticalThreshold: 90, // 90%
    enableConnectionTracking: true,
    healthCheckIntervalMs: 30_000, // 30 seconds
};
// ============================================================================
// Prometheus Metrics
// ============================================================================
const PREFIX = 'infinity_gauntlet_conn_';
const connectionLeaksDetected = new Counter({
    name: `${PREFIX}leaks_detected_total`,
    help: 'Total number of suspected connection leaks detected',
    labelNames: ['service'],
    registers: [register],
});
const connectionAgeGauge = new Gauge({
    name: `${PREFIX}oldest_age_seconds`,
    help: 'Age of the oldest active connection in seconds',
    labelNames: ['service'],
    registers: [register],
});
const healthScoreGauge = new Gauge({
    name: `${PREFIX}health_score`,
    help: 'Connection pool health score (0-100)',
    labelNames: ['service'],
    registers: [register],
});
const exhaustionRiskGauge = new Gauge({
    name: `${PREFIX}exhaustion_risk`,
    help: 'Pool exhaustion risk level (0=low, 1=medium, 2=high)',
    labelNames: ['service'],
    registers: [register],
});
// ============================================================================
// Connection Health Monitor Class
// ============================================================================
export class ConnectionHealthMonitor {
    config;
    trackedConnections = new Map();
    healthCheckInterval = null;
    lastHealthReport = null;
    utilizationHistory = []; // Last 10 measurements
    static instance = null;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Get singleton instance
     */
    static getInstance(config) {
        if (!ConnectionHealthMonitor.instance) {
            ConnectionHealthMonitor.instance = new ConnectionHealthMonitor(config);
        }
        return ConnectionHealthMonitor.instance;
    }
    /**
     * Start periodic health monitoring
     */
    start() {
        if (this.healthCheckInterval) {
            log.warn('Connection health monitor already started');
            return;
        }
        // Initial check
        void this.runHealthCheck();
        // Periodic checks
        this.healthCheckInterval = setInterval(() => {
            void this.runHealthCheck();
        }, this.config.healthCheckIntervalMs);
        // Don't prevent process exit
        this.healthCheckInterval.unref();
        log.info('Connection health monitor started', {
            service: getCurrentServiceName(),
            intervalMs: this.config.healthCheckIntervalMs,
            leakThresholdMs: this.config.leakThresholdMs,
        });
    }
    /**
     * Stop health monitoring
     */
    stop() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            log.info('Connection health monitor stopped');
        }
    }
    /**
     * Track a connection acquisition
     */
    trackConnectionAcquired(connectionId) {
        if (!this.config.enableConnectionTracking)
            return;
        this.trackedConnections.set(connectionId, {
            id: connectionId,
            acquiredAt: new Date(),
            lastActivityAt: new Date(),
            queryCount: 0,
            status: 'active',
        });
    }
    /**
     * Track a connection release
     */
    trackConnectionReleased(connectionId) {
        if (!this.config.enableConnectionTracking)
            return;
        this.trackedConnections.delete(connectionId);
    }
    /**
     * Track query execution on a connection
     */
    trackQueryExecuted(connectionId) {
        if (!this.config.enableConnectionTracking)
            return;
        const conn = this.trackedConnections.get(connectionId);
        if (conn) {
            conn.lastActivityAt = new Date();
            conn.queryCount++;
        }
    }
    /**
     * Run a health check and return report
     */
    async runHealthCheck() {
        const serviceName = getCurrentServiceName();
        const poolConfig = getPoolConfig();
        const poolMetrics = getPoolMetrics();
        // Build current state from metrics
        const currentState = poolMetrics
            ? {
                acquired: poolMetrics.acquiredConnections,
                idle: poolMetrics.idleConnections,
                waiting: poolMetrics.waitingRequests,
                total: poolMetrics.totalConnections,
                utilizationPercent: poolConfig.max > 0
                    ? (poolMetrics.acquiredConnections / poolConfig.max) * 100
                    : 0,
            }
            : {
                acquired: 0,
                idle: 0,
                waiting: 0,
                total: 0,
                utilizationPercent: 0,
            };
        // Track utilization history for prediction
        this.utilizationHistory.push(currentState.utilizationPercent);
        if (this.utilizationHistory.length > 10) {
            this.utilizationHistory.shift();
        }
        // Detect leaks
        const leakDetection = this.detectLeaks();
        // Assess health
        const health = this.assessHealth(currentState, leakDetection);
        // Generate predictions
        const predictions = this.generatePredictions(currentState);
        // Generate recommendations
        const recommendations = this.generateRecommendations(health, leakDetection, predictions);
        const report = {
            timestamp: new Date(),
            serviceName,
            poolConfig,
            currentState,
            health,
            leakDetection,
            predictions,
            recommendations,
        };
        // Update metrics
        this.updateMetrics(report);
        // Log if not healthy
        if (health.status !== 'healthy') {
            log.warn('Connection pool health degraded', {
                service: serviceName,
                status: health.status,
                score: health.score,
                reasons: health.reasons,
                recommendations,
            });
        }
        this.lastHealthReport = report;
        return report;
    }
    /**
     * Get the last health report without running a new check
     */
    getLastHealthReport() {
        return this.lastHealthReport;
    }
    /**
     * Detect potential connection leaks
     */
    detectLeaks() {
        const now = Date.now();
        let suspectedLeaks = 0;
        let oldestAge = 0;
        let overThreshold = 0;
        for (const conn of this.trackedConnections.values()) {
            const age = now - conn.acquiredAt.getTime();
            const idleTime = now - conn.lastActivityAt.getTime();
            oldestAge = Math.max(oldestAge, age);
            // Check for potential leaks
            if (idleTime > this.config.leakThresholdMs) {
                conn.status = 'suspected_leak';
                suspectedLeaks++;
                connectionLeaksDetected.inc({ service: getCurrentServiceName() });
                log.warn('Suspected connection leak detected', {
                    connectionId: conn.id,
                    ageMs: age,
                    idleTimeMs: idleTime,
                    queryCount: conn.queryCount,
                });
            }
            // Check for old connections
            if (age > this.config.connectionAgeWarningMs) {
                overThreshold++;
            }
        }
        return {
            suspectedLeaks,
            oldestConnectionAge: Math.floor(oldestAge / 1000),
            connectionsOverThreshold: overThreshold,
        };
    }
    /**
     * Assess overall pool health
     */
    assessHealth(state, leaks) {
        const reasons = [];
        let score = 100;
        // Utilization scoring
        if (state.utilizationPercent >= this.config.utilizationCriticalThreshold) {
            score -= 40;
            reasons.push(`Critical utilization: ${state.utilizationPercent.toFixed(1)}%`);
        }
        else if (state.utilizationPercent >= this.config.utilizationWarningThreshold) {
            score -= 20;
            reasons.push(`High utilization: ${state.utilizationPercent.toFixed(1)}%`);
        }
        // Waiting requests penalty
        if (state.waiting > 0) {
            score -= state.waiting * 10;
            reasons.push(`${state.waiting} requests waiting for connections`);
        }
        // Leak penalty
        if (leaks.suspectedLeaks > 0) {
            score -= leaks.suspectedLeaks * 15;
            reasons.push(`${leaks.suspectedLeaks} suspected connection leaks`);
        }
        // Old connections penalty
        if (leaks.connectionsOverThreshold > 0) {
            score -= leaks.connectionsOverThreshold * 5;
            reasons.push(`${leaks.connectionsOverThreshold} connections older than ${this.config.connectionAgeWarningMs / 1000}s`);
        }
        // Determine status
        score = Math.max(0, Math.min(100, score));
        let status;
        if (score >= 80) {
            status = 'healthy';
        }
        else if (score >= 50) {
            status = 'warning';
        }
        else {
            status = 'critical';
        }
        return { status, score, reasons };
    }
    /**
     * Generate predictions based on utilization trends
     */
    generatePredictions(state) {
        // Calculate trend from history
        let trend = 0;
        if (this.utilizationHistory.length >= 3) {
            const recent = this.utilizationHistory.slice(-3);
            trend = (recent[2] - recent[0]) / 2; // Average change per interval
        }
        // Determine risk level
        let exhaustionRisk;
        let estimatedTimeToExhaustion = null;
        let recommendedAction = null;
        if (state.utilizationPercent >= 90 || (trend > 5 && state.utilizationPercent >= 70)) {
            exhaustionRisk = 'high';
            if (trend > 0) {
                const remaining = 100 - state.utilizationPercent;
                const intervalsToExhaustion = remaining / trend;
                estimatedTimeToExhaustion = Math.floor((intervalsToExhaustion * this.config.healthCheckIntervalMs) / 1000);
            }
            recommendedAction = 'Consider increasing pool size or investigating slow queries';
        }
        else if (state.utilizationPercent >= 70 || (trend > 2 && state.utilizationPercent >= 50)) {
            exhaustionRisk = 'medium';
            recommendedAction = 'Monitor closely; prepare to scale if trend continues';
        }
        else {
            exhaustionRisk = 'low';
        }
        return {
            exhaustionRisk,
            estimatedTimeToExhaustion,
            recommendedAction,
        };
    }
    /**
     * Generate actionable recommendations
     */
    generateRecommendations(health, leaks, predictions) {
        const recommendations = [];
        if (leaks.suspectedLeaks > 0) {
            recommendations.push('Review code for unreleased connections - ensure all queries use try/finally or connection pool properly');
        }
        if (leaks.connectionsOverThreshold > 0) {
            recommendations.push('Long-running connections detected - consider reducing idle timeout or investigating transaction scope');
        }
        if (predictions.exhaustionRisk === 'high') {
            recommendations.push('Pool exhaustion imminent - increase connection_limit in pool config or optimize query patterns');
        }
        if (health.score < 50) {
            recommendations.push('Critical health score - review slow queries with EXPLAIN ANALYZE and check for N+1 patterns');
        }
        if (health.reasons.some((r) => r.includes('waiting'))) {
            recommendations.push('Requests are queueing - increase pool size or implement request batching');
        }
        return recommendations;
    }
    /**
     * Update Prometheus metrics
     */
    updateMetrics(report) {
        const service = report.serviceName;
        connectionAgeGauge.set({ service }, report.leakDetection.oldestConnectionAge);
        healthScoreGauge.set({ service }, report.health.score);
        const riskValue = { low: 0, medium: 1, high: 2 }[report.predictions.exhaustionRisk];
        exhaustionRiskGauge.set({ service }, riskValue);
    }
}
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Get singleton monitor instance
 */
export function getConnectionHealthMonitor(config) {
    return ConnectionHealthMonitor.getInstance(config);
}
/**
 * Start connection health monitoring with default config
 */
export function startConnectionHealthMonitoring(config) {
    const monitor = ConnectionHealthMonitor.getInstance(config);
    monitor.start();
}
/**
 * Stop connection health monitoring
 */
export function stopConnectionHealthMonitoring() {
    const monitor = ConnectionHealthMonitor.getInstance();
    monitor.stop();
}
/**
 * Get current health report
 */
export async function getConnectionHealthReport() {
    const monitor = ConnectionHealthMonitor.getInstance();
    return monitor.runHealthCheck();
}
// ============================================================================
// Export
// ============================================================================
export default {
    ConnectionHealthMonitor,
    getConnectionHealthMonitor,
    startConnectionHealthMonitoring,
    stopConnectionHealthMonitoring,
    getConnectionHealthReport,
};
