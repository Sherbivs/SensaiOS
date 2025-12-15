/**
 * System Health Monitor - Real-Time Health Scoring & Alerting
 * 
 * This module provides real-time system health monitoring:
 * - Health scoring (0-100) for each component
 * - Trend analysis (improving/stable/degrading)
 * - Predictive alerting (detect issues before they become critical)
 * - Dashboard data aggregation
 * 
 * Philosophy: "Backend super brain" with proactive, intelligent monitoring
 * 
 * @module system-health-monitor
 * @version 1.0.0
 */

import type { PrismaClient } from "../generated/prisma/client.js";
import { getLogger } from "./logger.js";
import { getErrorMessage } from "./utils/error-utils.js";
import { minutesAgo } from "./utils/date-utils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

interface ComponentHealth {
  component: string;
  score: number; // 0-100
  status: "healthy" | "degraded" | "unhealthy" | "critical" | "unknown";
  trend: "improving" | "stable" | "degrading";
  metrics: ComponentMetrics;
  issues: HealthIssue[];
  lastUpdated: Date;
}

interface ComponentMetrics {
  errorRate: number; // errors per minute
  avgLatencyMs: number;
  p95LatencyMs: number;
  successRate: number; // 0-1
  throughput: number; // operations per minute
  uptime: number; // seconds since last failure
}

interface HealthIssue {
  severity: "low" | "medium" | "high" | "critical";
  type: "error_rate" | "latency" | "availability" | "throughput" | "memory" | "connection";
  message: string;
  detectedAt: Date;
  recommendation: string;
}

interface SystemHealth {
  overallScore: number;
  overallStatus: "healthy" | "degraded" | "unhealthy" | "critical" | "unknown";
  components: ComponentHealth[];
  alerts: Alert[];
  timestamp: Date;
}

interface Alert {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  component: string;
  title: string;
  message: string;
  createdAt: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
}

interface HealthCheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  duration: number;
  details?: string;
}

interface MonitorConfig {
  checkIntervalMs: number;
  errorRateThreshold: number;
  latencyThresholdMs: number;
  successRateThreshold: number;
  alertCooldownMs: number;
  enablePredictiveAlerts: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

let prisma: PrismaClient | null = null;
let monitorInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

const defaultConfig: MonitorConfig = {
  checkIntervalMs: 30000, // 30 seconds
  errorRateThreshold: 1.0, // 1 error per minute
  latencyThresholdMs: 1000, // 1 second
  successRateThreshold: 0.95, // 95%
  alertCooldownMs: 300000, // 5 minutes
  enablePredictiveAlerts: true,
};

let config: MonitorConfig = { ...defaultConfig };

// History for trend analysis
const healthHistory = new Map<string, number[]>(); // component → last 10 scores
const alertCooldowns = new Map<string, Date>(); // alertKey → lastAlertTime

// Current state
let currentHealth: SystemHealth = {
  overallScore: 100,
  overallStatus: "healthy",
  components: [],
  alerts: [],
  timestamp: new Date(),
};

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH SCORING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate health score for a component based on metrics
 */
function calculateHealthScore(metrics: ComponentMetrics): number {
  let score = 100;
  
  // Error rate penalty (up to -40 points)
  if (metrics.errorRate > 0) {
    const errorPenalty = Math.min(40, metrics.errorRate * 10);
    score -= errorPenalty;
  }
  
  // Latency penalty (up to -30 points)
  if (metrics.avgLatencyMs > config.latencyThresholdMs) {
    const latencyRatio = metrics.avgLatencyMs / config.latencyThresholdMs;
    const latencyPenalty = Math.min(30, (latencyRatio - 1) * 15);
    score -= latencyPenalty;
  }
  
  // Success rate penalty (up to -20 points)
  if (metrics.successRate < config.successRateThreshold) {
    const successPenalty = (config.successRateThreshold - metrics.successRate) * 100;
    score -= Math.min(20, successPenalty);
  }
  
  // Throughput bonus (up to +10 points for high activity)
  if (metrics.throughput > 10) {
    score = Math.min(100, score + 5);
  }
  
  return Math.max(0, Math.round(score));
}

/**
 * Determine status from score
 */
function scoreToStatus(score: number): ComponentHealth["status"] {
  if (score >= 90) return "healthy";
  if (score >= 70) return "degraded";
  if (score >= 50) return "unhealthy";
  return "critical";
}

/**
 * Analyze trend from score history
 */
function analyzeTrend(component: string, currentScore: number): ComponentHealth["trend"] {
  const history = healthHistory.get(component) || [];
  
  if (history.length < 3) {
    history.push(currentScore);
    healthHistory.set(component, history);
    return "stable";
  }
  
  // Keep only last 10 scores
  history.push(currentScore);
  if (history.length > 10) history.shift();
  healthHistory.set(component, history);
  
  // Calculate trend from recent scores
  const recentAvg = history.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const olderAvg = history.slice(0, Math.min(3, history.length - 3)).reduce((a, b) => a + b, 0) / Math.min(3, history.length - 3);
  
  const diff = recentAvg - olderAvg;
  if (diff > 5) return "improving";
  if (diff < -5) return "degrading";
  return "stable";
}

/**
 * Identify issues from metrics
 */
function identifyIssues(component: string, metrics: ComponentMetrics): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const now = new Date();
  
  // Check error rate
  if (metrics.errorRate > config.errorRateThreshold * 5) {
    issues.push({
      severity: "critical",
      type: "error_rate",
      message: `Critical error rate: ${metrics.errorRate.toFixed(2)}/min`,
      detectedAt: now,
      recommendation: `Investigate ${component} immediately - error rate is 5x threshold`,
    });
  } else if (metrics.errorRate > config.errorRateThreshold) {
    issues.push({
      severity: "high",
      type: "error_rate",
      message: `Elevated error rate: ${metrics.errorRate.toFixed(2)}/min`,
      detectedAt: now,
      recommendation: `Review ${component} logs for error patterns`,
    });
  }
  
  // Check latency
  if (metrics.p95LatencyMs > config.latencyThresholdMs * 3) {
    issues.push({
      severity: "high",
      type: "latency",
      message: `High p95 latency: ${metrics.p95LatencyMs.toFixed(0)}ms`,
      detectedAt: now,
      recommendation: `Profile ${component} performance - latency 3x threshold`,
    });
  } else if (metrics.avgLatencyMs > config.latencyThresholdMs) {
    issues.push({
      severity: "medium",
      type: "latency",
      message: `Elevated avg latency: ${metrics.avgLatencyMs.toFixed(0)}ms`,
      detectedAt: now,
      recommendation: `Monitor ${component} - latency above threshold`,
    });
  }
  
  // Check success rate
  if (metrics.successRate < 0.9) {
    issues.push({
      severity: "critical",
      type: "availability",
      message: `Low success rate: ${(metrics.successRate * 100).toFixed(1)}%`,
      detectedAt: now,
      recommendation: `${component} is failing frequently - investigate root cause`,
    });
  } else if (metrics.successRate < config.successRateThreshold) {
    issues.push({
      severity: "medium",
      type: "availability",
      message: `Success rate below threshold: ${(metrics.successRate * 100).toFixed(1)}%`,
      detectedAt: now,
      recommendation: `Review ${component} failure logs`,
    });
  }
  
  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA COLLECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Collect metrics for a specific component
 */
async function collectComponentMetrics(component: string, windowMinutes: number = 5): Promise<ComponentMetrics> {
  if (!prisma) {
    return {
      errorRate: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      successRate: 1,
      throughput: 0,
      uptime: 0,
    };
  }
  
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  
  try {
    // Query log_entries for metrics
    const result = await prisma.$queryRaw<Array<{
      total_count: bigint;
      error_count: bigint;
      avg_duration: number;
      p95_duration: number;
    }>>`
      SELECT 
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE level = 'error') as error_count,
        COALESCE(AVG("durationMs"), 0) as avg_duration,
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs"), 0) as p95_duration
      FROM log_entries
      WHERE timestamp > ${since}
        AND component = ${component}
    `;
    
    if (!result[0]) {
      return {
        errorRate: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        successRate: 1,
        throughput: 0,
        uptime: 0,
      };
    }
    
    const row = result[0];
    const total = Number(row.total_count);
    const errors = Number(row.error_count);
    const successCount = total - errors;
    
    return {
      errorRate: errors / windowMinutes,
      avgLatencyMs: row.avg_duration || 0,
      p95LatencyMs: row.p95_duration || 0,
      successRate: total > 0 ? successCount / total : 1,
      throughput: total / windowMinutes,
      uptime: 0, // TODO: Track uptime from last error
    };
    
  } catch {
    return {
      errorRate: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      successRate: 1,
      throughput: 0,
      uptime: 0,
    };
  }
}

/**
 * Get list of active components (from recent logs)
 */
async function getActiveComponents(): Promise<string[]> {
  if (!prisma) return [];
  
  const since = minutesAgo(5); // Last 5 minutes
  
  try {
    const components = await prisma.$queryRaw<Array<{ component: string }>>`
      SELECT DISTINCT component
      FROM log_entries
      WHERE timestamp > ${since}
        AND component IS NOT NULL
      ORDER BY component
    `;
    
    return components.map((c: { component: string }) => c.component);
    
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERTING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create an alert if not in cooldown
 */
function createAlert(
  component: string,
  severity: Alert["severity"],
  title: string,
  message: string
): Alert | null {
  const alertKey = `${component}:${title}`;
  const lastAlert = alertCooldowns.get(alertKey);
  
  // Check cooldown
  if (lastAlert && Date.now() - lastAlert.getTime() < config.alertCooldownMs) {
    return null; // Still in cooldown
  }
  
  const alert: Alert = {
    id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    severity,
    component,
    title,
    message,
    createdAt: new Date(),
    acknowledged: false,
  };
  
  alertCooldowns.set(alertKey, new Date());
  
  // Log the alert
  const logger = getLogger();
  logger.warn("system-health-monitor", "alert", `[${severity.toUpperCase()}] ${title}: ${message}`, {
    metadata: { component, alertId: alert.id },
  });
  
  return alert;
}

/**
 * Generate alerts from component health
 */
function generateAlerts(components: ComponentHealth[]): Alert[] {
  const alerts: Alert[] = [];
  
  for (const comp of components) {
    // Alert on critical status
    if (comp.status === "critical") {
      const alert = createAlert(
        comp.component,
        "critical",
        `${comp.component} Critical`,
        `Health score ${comp.score}/100 - immediate attention required`
      );
      if (alert) alerts.push(alert);
    }
    
    // Alert on unhealthy status
    if (comp.status === "unhealthy") {
      const alert = createAlert(
        comp.component,
        "error",
        `${comp.component} Unhealthy`,
        `Health score ${comp.score}/100 - issues detected`
      );
      if (alert) alerts.push(alert);
    }
    
    // Alert on degrading trend
    if (comp.trend === "degrading" && config.enablePredictiveAlerts) {
      const alert = createAlert(
        comp.component,
        "warning",
        `${comp.component} Degrading`,
        `Health trend degrading - score ${comp.score}/100`
      );
      if (alert) alerts.push(alert);
    }
    
    // Alert on high-severity issues
    for (const issue of comp.issues) {
      if (issue.severity === "critical" || issue.severity === "high") {
        const alert = createAlert(
          comp.component,
          issue.severity === "critical" ? "critical" : "error",
          `${comp.component}: ${issue.type}`,
          issue.message
        );
        if (alert) alerts.push(alert);
      }
    }
  }
  
  return alerts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run health checks for core services
 */
async function runHealthChecks(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  
  // Database check
  const dbStart = Date.now();
  try {
    if (prisma) {
      await prisma.$queryRaw`SELECT 1`;
      results.push({
        name: "database",
        status: "pass",
        duration: Date.now() - dbStart,
      });
    } else {
      results.push({
        name: "database",
        status: "fail",
        duration: 0,
        details: "Prisma client not initialized",
      });
    }
  } catch (error) {
    results.push({
      name: "database",
      status: "fail",
      duration: Date.now() - dbStart,
      details: getErrorMessage(error),
    });
  }
  
  // Memory check
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
  const heapTotalMB = memUsage.heapTotal / (1024 * 1024);
  const memPct = (heapUsedMB / heapTotalMB) * 100;
  
  results.push({
    name: "memory",
    status: memPct > 90 ? "fail" : memPct > 75 ? "warn" : "pass",
    duration: 0,
    details: `${heapUsedMB.toFixed(0)}MB / ${heapTotalMB.toFixed(0)}MB (${memPct.toFixed(1)}%)`,
  });
  
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN MONITORING LOOP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run a full health check cycle
 */
async function runHealthCycle(): Promise<SystemHealth> {
  const components: ComponentHealth[] = [];
  const now = new Date();
  
  // Get active components
  const activeComponents = await getActiveComponents();
  
  // Always include core components
  const coreComponents = ["database", "bot", "worker", "cache", "battle", "encounter"];
  const allComponents = [...new Set([...coreComponents, ...activeComponents])];
  
  // Collect health for each component
  for (const component of allComponents) {
    const metrics = await collectComponentMetrics(component);
    const score = calculateHealthScore(metrics);
    const status = scoreToStatus(score);
    const trend = analyzeTrend(component, score);
    const issues = identifyIssues(component, metrics);
    
    components.push({
      component,
      score,
      status,
      trend,
      metrics,
      issues,
      lastUpdated: now,
    });
  }
  
  // Calculate overall health
  const avgScore = components.length > 0
    ? components.reduce((sum, c) => sum + c.score, 0) / components.length
    : 100;
  
  const overallStatus = scoreToStatus(avgScore);
  
  // Generate alerts
  const newAlerts = generateAlerts(components);
  
  // Update current health (keep last 100 alerts)
  const allAlerts = [...newAlerts, ...currentHealth.alerts].slice(0, 100);
  
  currentHealth = {
    overallScore: Math.round(avgScore),
    overallStatus,
    components,
    alerts: allAlerts,
    timestamp: now,
  };
  
  return currentHealth;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize the health monitor
 */
export function initHealthMonitor(prismaClient: PrismaClient, options?: Partial<MonitorConfig>): void {
  prisma = prismaClient;
  config = { ...defaultConfig, ...options };
  healthHistory.clear();
  alertCooldowns.clear();
  
  const logger = getLogger();
  logger.info("system-health-monitor", "initialize", "Health monitor initialized", {
    metadata: { checkIntervalMs: config.checkIntervalMs },
  });
}

/**
 * Start the monitoring loop
 */
export function startHealthMonitor(): void {
  if (isRunning) {
    const logger = getLogger();
    logger.warn("system-health-monitor", "start", "Health monitor already running");
    return;
  }
  
  isRunning = true;
  
  // Run immediately, then at interval
  runHealthCycle().catch((err) => {
    const logger = getLogger();
    logger.error("system-health-monitor", "error", "Health cycle failed", {
      error: { name: "HealthCycleError", message: getErrorMessage(err) },
    });
  });
  
  monitorInterval = setInterval(() => {
    runHealthCycle().catch((err) => {
      const logger = getLogger();
      logger.error("system-health-monitor", "error", "Health cycle failed", {
        error: { name: "HealthCycleError", message: getErrorMessage(err) },
      });
    });
  }, config.checkIntervalMs);
  
  const logger = getLogger();
  logger.info("system-health-monitor", "start", "Health monitor started");
}

/**
 * Stop the monitoring loop
 */
export function stopHealthMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  isRunning = false;
  
  const logger = getLogger();
  logger.info("system-health-monitor", "stop", "Health monitor stopped");
}

/**
 * Get current system health
 */
export function getSystemHealth(): SystemHealth {
  return { ...currentHealth };
}

/**
 * Get health for a specific component
 */
export function getComponentHealth(component: string): ComponentHealth | undefined {
  return currentHealth.components.find(c => c.component === component);
}

/**
 * Run health checks on demand
 */
export async function runHealthChecksNow(): Promise<HealthCheckResult[]> {
  return runHealthChecks();
}

/**
 * Force a health cycle (on-demand)
 */
export async function forceHealthCycle(): Promise<SystemHealth> {
  return runHealthCycle();
}

/**
 * Acknowledge an alert
 */
export function acknowledgeAlert(alertId: string): boolean {
  const alert = currentHealth.alerts.find(a => a.id === alertId);
  if (alert) {
    alert.acknowledged = true;
    return true;
  }
  return false;
}

/**
 * Get unacknowledged alerts
 */
export function getUnacknowledgedAlerts(): Alert[] {
  return currentHealth.alerts.filter(a => !a.acknowledged);
}

/**
 * Update configuration
 */
export function updateMonitorConfig(newConfig: Partial<MonitorConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getMonitorConfig(): MonitorConfig {
  return { ...config };
}

// Export types
export type {
  ComponentHealth,
  ComponentMetrics,
  HealthIssue,
  SystemHealth,
  Alert,
  HealthCheckResult,
  MonitorConfig,
};
