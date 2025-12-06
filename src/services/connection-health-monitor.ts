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

import { log } from '../utils/logger.js';
import { 
  getPoolConfig, 
  getPoolMetrics, 
  getCurrentServiceName,
  type PoolConfig 
} from '../config/database-pool-config.js';
import { Counter, Gauge, register } from 'prom-client';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Connection tracking entry
 */
interface TrackedConnection {
  id: string;
  acquiredAt: Date;
  lastActivityAt: Date;
  queryCount: number;
  status: 'active' | 'idle' | 'suspected_leak';
}

/**
 * Connection health assessment result
 */
export interface ConnectionHealthReport {
  timestamp: Date;
  serviceName: string;
  poolConfig: PoolConfig;
  
  // Current state
  currentState: {
    acquired: number;
    idle: number;
    waiting: number;
    total: number;
    utilizationPercent: number;
  };
  
  // Health assessment
  health: {
    status: 'healthy' | 'warning' | 'critical';
    score: number; // 0-100
    reasons: string[];
  };
  
  // Leak detection
  leakDetection: {
    suspectedLeaks: number;
    oldestConnectionAge: number; // seconds
    connectionsOverThreshold: number;
  };
  
  // Predictions
  predictions: {
    exhaustionRisk: 'low' | 'medium' | 'high';
    estimatedTimeToExhaustion: number | null; // seconds, null if not at risk
    recommendedAction: string | null;
  };
  
  // Recommendations
  recommendations: string[];
}

/**
 * Monitor configuration options
 */
export interface MonitorConfig {
  /** How long (ms) before a held connection is considered a potential leak */
  leakThresholdMs: number;
  /** How long (ms) before warning about connection age */
  connectionAgeWarningMs: number;
  /** Pool utilization % that triggers warnings */
  utilizationWarningThreshold: number;
  /** Pool utilization % that triggers critical alerts */
  utilizationCriticalThreshold: number;
  /** Enable detailed connection tracking */
  enableConnectionTracking: boolean;
  /** How often (ms) to run health checks */
  healthCheckIntervalMs: number;
}

const DEFAULT_CONFIG: MonitorConfig = {
  leakThresholdMs: 30_000,           // 30 seconds
  connectionAgeWarningMs: 300_000,   // 5 minutes  
  utilizationWarningThreshold: 70,   // 70%
  utilizationCriticalThreshold: 90,  // 90%
  enableConnectionTracking: true,
  healthCheckIntervalMs: 30_000,     // 30 seconds
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
  private config: MonitorConfig;
  private trackedConnections: Map<string, TrackedConnection> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthReport: ConnectionHealthReport | null = null;
  private utilizationHistory: number[] = []; // Last 10 measurements
  private static instance: ConnectionHealthMonitor | null = null;

  private constructor(config: Partial<MonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<MonitorConfig>): ConnectionHealthMonitor {
    if (!ConnectionHealthMonitor.instance) {
      ConnectionHealthMonitor.instance = new ConnectionHealthMonitor(config);
    }
    return ConnectionHealthMonitor.instance;
  }

  /**
   * Start periodic health monitoring
   */
  start(): void {
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
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      log.info('Connection health monitor stopped');
    }
  }

  /**
   * Track a connection acquisition
   */
  trackConnectionAcquired(connectionId: string): void {
    if (!this.config.enableConnectionTracking) return;

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
  trackConnectionReleased(connectionId: string): void {
    if (!this.config.enableConnectionTracking) return;
    this.trackedConnections.delete(connectionId);
  }

  /**
   * Track query execution on a connection
   */
  trackQueryExecuted(connectionId: string): void {
    if (!this.config.enableConnectionTracking) return;

    const conn = this.trackedConnections.get(connectionId);
    if (conn) {
      conn.lastActivityAt = new Date();
      conn.queryCount++;
    }
  }

  /**
   * Run a health check and return report
   */
  async runHealthCheck(): Promise<ConnectionHealthReport> {
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
          utilizationPercent:
            poolConfig.max > 0
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

    const report: ConnectionHealthReport = {
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
  getLastHealthReport(): ConnectionHealthReport | null {
    return this.lastHealthReport;
  }

  /**
   * Detect potential connection leaks
   */
  private detectLeaks(): ConnectionHealthReport['leakDetection'] {
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
  private assessHealth(
    state: ConnectionHealthReport['currentState'],
    leaks: ConnectionHealthReport['leakDetection']
  ): ConnectionHealthReport['health'] {
    const reasons: string[] = [];
    let score = 100;

    // Utilization scoring
    if (state.utilizationPercent >= this.config.utilizationCriticalThreshold) {
      score -= 40;
      reasons.push(`Critical utilization: ${state.utilizationPercent.toFixed(1)}%`);
    } else if (state.utilizationPercent >= this.config.utilizationWarningThreshold) {
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
    let status: 'healthy' | 'warning' | 'critical';
    if (score >= 80) {
      status = 'healthy';
    } else if (score >= 50) {
      status = 'warning';
    } else {
      status = 'critical';
    }

    return { status, score, reasons };
  }

  /**
   * Generate predictions based on utilization trends
   */
  private generatePredictions(
    state: ConnectionHealthReport['currentState']
  ): ConnectionHealthReport['predictions'] {
    // Calculate trend from history
    let trend = 0;
    if (this.utilizationHistory.length >= 3) {
      const recent = this.utilizationHistory.slice(-3);
      trend = (recent[2] - recent[0]) / 2; // Average change per interval
    }

    // Determine risk level
    let exhaustionRisk: 'low' | 'medium' | 'high';
    let estimatedTimeToExhaustion: number | null = null;
    let recommendedAction: string | null = null;

    if (state.utilizationPercent >= 90 || (trend > 5 && state.utilizationPercent >= 70)) {
      exhaustionRisk = 'high';
      if (trend > 0) {
        const remaining = 100 - state.utilizationPercent;
        const intervalsToExhaustion = remaining / trend;
        estimatedTimeToExhaustion = Math.floor(
          (intervalsToExhaustion * this.config.healthCheckIntervalMs) / 1000
        );
      }
      recommendedAction = 'Consider increasing pool size or investigating slow queries';
    } else if (state.utilizationPercent >= 70 || (trend > 2 && state.utilizationPercent >= 50)) {
      exhaustionRisk = 'medium';
      recommendedAction = 'Monitor closely; prepare to scale if trend continues';
    } else {
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
  private generateRecommendations(
    health: ConnectionHealthReport['health'],
    leaks: ConnectionHealthReport['leakDetection'],
    predictions: ConnectionHealthReport['predictions']
  ): string[] {
    const recommendations: string[] = [];

    if (leaks.suspectedLeaks > 0) {
      recommendations.push(
        'Review code for unreleased connections - ensure all queries use try/finally or connection pool properly'
      );
    }

    if (leaks.connectionsOverThreshold > 0) {
      recommendations.push(
        'Long-running connections detected - consider reducing idle timeout or investigating transaction scope'
      );
    }

    if (predictions.exhaustionRisk === 'high') {
      recommendations.push(
        'Pool exhaustion imminent - increase connection_limit in pool config or optimize query patterns'
      );
    }

    if (health.score < 50) {
      recommendations.push(
        'Critical health score - review slow queries with EXPLAIN ANALYZE and check for N+1 patterns'
      );
    }

    if (health.reasons.some((r) => r.includes('waiting'))) {
      recommendations.push(
        'Requests are queueing - increase pool size or implement request batching'
      );
    }

    return recommendations;
  }

  /**
   * Update Prometheus metrics
   */
  private updateMetrics(report: ConnectionHealthReport): void {
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
export function getConnectionHealthMonitor(config?: Partial<MonitorConfig>): ConnectionHealthMonitor {
  return ConnectionHealthMonitor.getInstance(config);
}

/**
 * Start connection health monitoring with default config
 */
export function startConnectionHealthMonitoring(config?: Partial<MonitorConfig>): void {
  const monitor = ConnectionHealthMonitor.getInstance(config);
  monitor.start();
}

/**
 * Stop connection health monitoring
 */
export function stopConnectionHealthMonitoring(): void {
  const monitor = ConnectionHealthMonitor.getInstance();
  monitor.stop();
}

/**
 * Get current health report
 */
export async function getConnectionHealthReport(): Promise<ConnectionHealthReport> {
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
