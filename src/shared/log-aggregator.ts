/**
 * Intelligent Log Aggregator - Backend "Super Brain"
 * 
 * This module provides intelligent backend processing for logs:
 * - Pattern detection and deduplication
 * - Correlation across related log entries
 * - Error spike detection
 * - Performance trend analysis
 * - Anomaly detection
 * 
 * Philosophy: "Backend should be a super brain" - no stinginess on logic
 * 
 * @module log-aggregator
 * @version 1.0.0
 */

import type { PrismaClient } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

interface PatternMatch {
  pattern: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  examples: string[];
  severity: "info" | "warn" | "error" | "critical";
}

interface CorrelatedGroup {
  correlationId: string;
  entries: LogEntrySummary[];
  duration: number;
  startTime: Date;
  endTime: Date;
  components: string[];
  hasErrors: boolean;
}

interface LogEntrySummary {
  id: string;
  timestamp: Date;
  level: string;
  message: string;
  component: string | null;
  operation: string | null;
  durationMs: number | null;
}

interface ErrorSpike {
  timestamp: Date;
  windowMinutes: number;
  errorCount: number;
  normalRate: number;
  spikeMultiplier: number;
  topMessages: Array<{ message: string; count: number }>;
}

interface PerformanceTrend {
  component: string;
  operation: string;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  trendDirection: "improving" | "stable" | "degrading";
  sampleCount: number;
}

interface Anomaly {
  id: string;
  detectedAt: Date;
  type: "error_spike" | "latency_increase" | "missing_component" | "unusual_pattern" | "resource_exhaustion";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedComponents: string[];
  metrics: Record<string, number>;
  recommendation: string;
}

interface AggregationConfig {
  patternDetectionEnabled: boolean;
  correlationEnabled: boolean;
  anomalyDetectionEnabled: boolean;
  deduplicationWindowMs: number;
  errorSpikeThreshold: number;
  latencyDegradationPct: number;
}

interface AggregationStats {
  patternsDetected: number;
  correlationsFound: number;
  anomaliesDetected: number;
  duplicatesRemoved: number;
  processingTimeMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

let prisma: PrismaClient | null = null;

const defaultConfig: AggregationConfig = {
  patternDetectionEnabled: true,
  correlationEnabled: true,
  anomalyDetectionEnabled: true,
  deduplicationWindowMs: 60000, // 1 minute
  errorSpikeThreshold: 5, // 5x normal rate
  latencyDegradationPct: 50, // 50% increase triggers alert
};

let config: AggregationConfig = { ...defaultConfig };

// In-memory caches for pattern detection
const patternCache = new Map<string, PatternMatch>();
const messageHashCache = new Map<string, { count: number; lastSeen: Date }>();
const baselineMetrics = new Map<string, { avgLatency: number; errorRate: number }>();

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN DETECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize a log message to detect patterns
 * Replaces variable parts with placeholders
 */
function normalizeMessage(message: string): string {
  return message
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>")
    // Replace timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, "<TIMESTAMP>")
    // Replace numbers (but keep context)
    .replace(/\b\d+ms\b/g, "<DURATION>")
    .replace(/\b\d+\.\d+s\b/g, "<DURATION>")
    .replace(/\b\d+ (rows?|items?|entries|records)\b/gi, "<COUNT> $1")
    // Replace IPs
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "<IP>")
    // Replace file paths
    .replace(/\/[\w\-./]+\.(ts|js|json|sql)/g, "<FILE>")
    // Replace user IDs
    .replace(/user[_-]?\d+/gi, "<USER_ID>")
    // Trim and normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Create a hash for deduplication
 */
function createMessageHash(message: string, level: string, component: string | null): string {
  const normalized = normalizeMessage(message);
  return `${level}:${component || "general"}:${normalized}`;
}

/**
 * Detect patterns in recent logs
 */
async function detectPatterns(windowMinutes: number = 60): Promise<PatternMatch[]> {
  if (!prisma) return [];
  
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  
  try {
    const logs = await prisma.$queryRaw<LogEntrySummary[]>`
      SELECT id, timestamp, level, message, component, operation, "durationMs"
      FROM log_entries
      WHERE timestamp > ${since}
      ORDER BY timestamp DESC
      LIMIT 10000
    `;
    
    const patterns = new Map<string, PatternMatch>();
    
    for (const log of logs) {
      const normalized = normalizeMessage(log.message);
      const key = `${log.level}:${log.component || "general"}:${normalized}`;
      
      if (!patterns.has(key)) {
        patterns.set(key, {
          pattern: normalized,
          count: 0,
          firstSeen: log.timestamp,
          lastSeen: log.timestamp,
          examples: [],
          severity: mapLevelToSeverity(log.level),
        });
      }
      
      const pattern = patterns.get(key)!;
      pattern.count++;
      if (log.timestamp < pattern.firstSeen) pattern.firstSeen = log.timestamp;
      if (log.timestamp > pattern.lastSeen) pattern.lastSeen = log.timestamp;
      if (pattern.examples.length < 3) pattern.examples.push(log.message);
    }
    
    // Return patterns with count > 1, sorted by count
    return Array.from(patterns.values())
      .filter(p => p.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
      
  } catch {
    return [];
  }
}

function mapLevelToSeverity(level: string): PatternMatch["severity"] {
  const normalized = level.toLowerCase();
  switch (normalized) {
    case "error": return "error";
    case "warn": return "warn";
    case "critical": return "critical";
    default: return "info";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORRELATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find correlated log entries by correlationId
 */
async function findCorrelatedGroups(windowMinutes: number = 30): Promise<CorrelatedGroup[]> {
  if (!prisma) return [];
  
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  
  try {
    const logs = await prisma.$queryRaw<LogEntrySummary[]>`
      SELECT id, timestamp, level, message, component, operation, "durationMs", "correlationId"
      FROM log_entries
      WHERE timestamp > ${since}
        AND "correlationId" IS NOT NULL
      ORDER BY "correlationId", timestamp ASC
    `;
    
    // Group by correlationId
    const groups = new Map<string, LogEntrySummary[]>();
    for (const log of logs) {
      const corrId = (log as LogEntrySummary & { correlationId: string }).correlationId;
      if (!groups.has(corrId)) groups.set(corrId, []);
      groups.get(corrId)!.push(log);
    }
    
    // Build correlated groups
    const result: CorrelatedGroup[] = [];
    
    for (const [correlationId, entries] of groups) {
      if (entries.length < 2) continue; // Skip single-entry correlations
      
      const startTime = entries[0].timestamp;
      const endTime = entries[entries.length - 1].timestamp;
      const components = [...new Set(entries.map(e => e.component).filter(Boolean))] as string[];
      const hasErrors = entries.some(e => e.level.toLowerCase() === "error");
      
      result.push({
        correlationId,
        entries,
        duration: endTime.getTime() - startTime.getTime(),
        startTime,
        endTime,
        components,
        hasErrors,
      });
    }
    
    return result.sort((a, b) => b.entries.length - a.entries.length);
    
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR SPIKE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect error spikes by comparing current rate to baseline
 */
async function detectErrorSpikes(windowMinutes: number = 5): Promise<ErrorSpike[]> {
  if (!prisma) return [];
  
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);
  const baselineStart = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour baseline
  
  try {
    // Get current window error count
    const currentErrors = await prisma.$queryRaw<Array<{ count: bigint; message: string }>>`
      SELECT COUNT(*) as count, message
      FROM log_entries
      WHERE timestamp > ${windowStart}
        AND level = 'error'
      GROUP BY message
      ORDER BY count DESC
      LIMIT 10
    `;
    
    // Get baseline hourly error rate
    const baselineResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM log_entries
      WHERE timestamp > ${baselineStart}
        AND timestamp <= ${windowStart}
        AND level = 'error'
    `;
    
    const currentCount = currentErrors.reduce((sum: number, e: { count: bigint; message: string }) => sum + Number(e.count), 0);
    const baselineCount = Number(baselineResult[0]?.count || 0);
    
    // Calculate rates (per minute)
    const currentRate = currentCount / windowMinutes;
    const baselineRate = baselineCount / (60 - windowMinutes);
    
    // Check if there's a spike
    if (baselineRate > 0 && currentRate > baselineRate * config.errorSpikeThreshold) {
      return [{
        timestamp: now,
        windowMinutes,
        errorCount: currentCount,
        normalRate: baselineRate,
        spikeMultiplier: currentRate / baselineRate,
        topMessages: currentErrors.map((e: { message: string; count: bigint }) => ({ message: e.message, count: Number(e.count) })),
      }];
    }
    
    return [];
    
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE TREND ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze performance trends by component/operation
 */
async function analyzePerformanceTrends(windowMinutes: number = 60): Promise<PerformanceTrend[]> {
  if (!prisma) return [];
  
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  
  try {
    const metrics = await prisma.$queryRaw<Array<{
      component: string;
      operation: string;
      avg_latency: number;
      p50_latency: number;
      p95_latency: number;
      p99_latency: number;
      sample_count: bigint;
    }>>`
      SELECT 
        COALESCE(component, 'general') as component,
        COALESCE(operation, 'unknown') as operation,
        AVG("durationMs") as avg_latency,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "durationMs") as p50_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs") as p95_latency,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "durationMs") as p99_latency,
        COUNT(*) as sample_count
      FROM log_entries
      WHERE timestamp > ${since}
        AND "durationMs" IS NOT NULL
      GROUP BY component, operation
      HAVING COUNT(*) >= 10
      ORDER BY avg_latency DESC
      LIMIT 50
    `;
    
    return metrics.map((m: {
      component: string;
      operation: string;
      avg_latency: number;
      p50_latency: number;
      p95_latency: number;
      p99_latency: number;
      sample_count: bigint;
    }) => {
      const key = `${m.component}:${m.operation}`;
      const baseline = baselineMetrics.get(key);
      
      let trendDirection: PerformanceTrend["trendDirection"] = "stable";
      if (baseline) {
        const change = ((m.avg_latency - baseline.avgLatency) / baseline.avgLatency) * 100;
        if (change > config.latencyDegradationPct) trendDirection = "degrading";
        else if (change < -10) trendDirection = "improving";
      }
      
      // Update baseline for next comparison
      baselineMetrics.set(key, { avgLatency: m.avg_latency, errorRate: 0 });
      
      return {
        component: m.component,
        operation: m.operation,
        avgLatencyMs: Math.round(m.avg_latency * 100) / 100,
        p50LatencyMs: Math.round(m.p50_latency * 100) / 100,
        p95LatencyMs: Math.round(m.p95_latency * 100) / 100,
        p99LatencyMs: Math.round(m.p99_latency * 100) / 100,
        trendDirection,
        sampleCount: Number(m.sample_count),
      };
    });
    
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANOMALY DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run comprehensive anomaly detection
 */
async function detectAnomalies(): Promise<Anomaly[]> {
  if (!prisma || !config.anomalyDetectionEnabled) return [];
  
  const anomalies: Anomaly[] = [];
  const now = new Date();
  
  // Check for error spikes
  const errorSpikes = await detectErrorSpikes();
  for (const spike of errorSpikes) {
    anomalies.push({
      id: `error-spike-${now.getTime()}`,
      detectedAt: now,
      type: "error_spike",
      severity: spike.spikeMultiplier > 10 ? "critical" : spike.spikeMultiplier > 5 ? "high" : "medium",
      description: `Error rate ${spike.spikeMultiplier.toFixed(1)}x above normal (${spike.errorCount} errors in ${spike.windowMinutes}min)`,
      affectedComponents: spike.topMessages.map(m => m.message.split(" ")[0]),
      metrics: {
        errorCount: spike.errorCount,
        normalRate: spike.normalRate,
        spikeMultiplier: spike.spikeMultiplier,
      },
      recommendation: "Investigate recent deployments or external dependencies",
    });
  }
  
  // Check for latency degradation
  const trends = await analyzePerformanceTrends();
  const degradingOps = trends.filter(t => t.trendDirection === "degrading");
  
  for (const op of degradingOps) {
    anomalies.push({
      id: `latency-${op.component}-${op.operation}-${now.getTime()}`,
      detectedAt: now,
      type: "latency_increase",
      severity: op.p99LatencyMs > 5000 ? "high" : "medium",
      description: `${op.component}.${op.operation}() latency degrading (avg: ${op.avgLatencyMs}ms, p99: ${op.p99LatencyMs}ms)`,
      affectedComponents: [op.component],
      metrics: {
        avgLatencyMs: op.avgLatencyMs,
        p50LatencyMs: op.p50LatencyMs,
        p95LatencyMs: op.p95LatencyMs,
        p99LatencyMs: op.p99LatencyMs,
        sampleCount: op.sampleCount,
      },
      recommendation: `Review ${op.component}.${op.operation}() for optimization opportunities`,
    });
  }
  
  return anomalies;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a message is a duplicate within the deduplication window
 */
function isDuplicate(message: string, level: string, component: string | null): boolean {
  const hash = createMessageHash(message, level, component);
  const existing = messageHashCache.get(hash);
  
  if (existing) {
    const age = Date.now() - existing.lastSeen.getTime();
    if (age < config.deduplicationWindowMs) {
      existing.count++;
      existing.lastSeen = new Date();
      return true;
    }
  }
  
  // Not a duplicate - add to cache
  messageHashCache.set(hash, { count: 1, lastSeen: new Date() });
  
  // Prune old entries periodically
  if (messageHashCache.size > 10000) {
    const cutoff = Date.now() - config.deduplicationWindowMs * 2;
    for (const [key, value] of messageHashCache) {
      if (value.lastSeen.getTime() < cutoff) {
        messageHashCache.delete(key);
      }
    }
  }
  
  return false;
}

/**
 * Get deduplication summary (how many duplicates were suppressed)
 */
function getDeduplicationSummary(): Array<{ pattern: string; count: number }> {
  const summary: Array<{ pattern: string; count: number }> = [];
  
  for (const [pattern, data] of messageHashCache) {
    if (data.count > 1) {
      summary.push({ pattern, count: data.count });
    }
  }
  
  return summary.sort((a, b) => b.count - a.count).slice(0, 20);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize the log aggregator
 */
export function initLogAggregator(prismaClient: PrismaClient, options?: Partial<AggregationConfig>): void {
  prisma = prismaClient;
  config = { ...defaultConfig, ...options };
  patternCache.clear();
  messageHashCache.clear();
  baselineMetrics.clear();
}

/**
 * Run full aggregation analysis
 */
export async function runAggregation(): Promise<{
  patterns: PatternMatch[];
  correlations: CorrelatedGroup[];
  anomalies: Anomaly[];
  performanceTrends: PerformanceTrend[];
  stats: AggregationStats;
}> {
  const startTime = Date.now();
  
  const [patterns, correlations, anomalies, performanceTrends] = await Promise.all([
    config.patternDetectionEnabled ? detectPatterns() : Promise.resolve([]),
    config.correlationEnabled ? findCorrelatedGroups() : Promise.resolve([]),
    config.anomalyDetectionEnabled ? detectAnomalies() : Promise.resolve([]),
    analyzePerformanceTrends(),
  ]);
  
  const stats: AggregationStats = {
    patternsDetected: patterns.length,
    correlationsFound: correlations.length,
    anomaliesDetected: anomalies.length,
    duplicatesRemoved: getDeduplicationSummary().reduce((sum, d) => sum + d.count - 1, 0),
    processingTimeMs: Date.now() - startTime,
  };
  
  return { patterns, correlations, anomalies, performanceTrends, stats };
}

/**
 * Check if a log entry should be suppressed (duplicate)
 */
export function shouldSuppressDuplicate(message: string, level: string, component: string | null): boolean {
  return isDuplicate(message, level, component);
}

/**
 * Get detected patterns
 */
export async function getPatterns(windowMinutes?: number): Promise<PatternMatch[]> {
  return detectPatterns(windowMinutes);
}

/**
 * Get correlated log groups
 */
export async function getCorrelations(windowMinutes?: number): Promise<CorrelatedGroup[]> {
  return findCorrelatedGroups(windowMinutes);
}

/**
 * Get detected anomalies
 */
export async function getAnomalies(): Promise<Anomaly[]> {
  return detectAnomalies();
}

/**
 * Get performance trends
 */
export async function getPerformanceTrends(windowMinutes?: number): Promise<PerformanceTrend[]> {
  return analyzePerformanceTrends(windowMinutes);
}

/**
 * Update configuration
 */
export function updateAggregatorConfig(newConfig: Partial<AggregationConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getAggregatorConfig(): AggregationConfig {
  return { ...config };
}

/**
 * Clear all caches (useful for testing)
 */
export function clearCaches(): void {
  patternCache.clear();
  messageHashCache.clear();
  baselineMetrics.clear();
}

// Export types for external use
export type {
  PatternMatch,
  CorrelatedGroup,
  LogEntrySummary,
  ErrorSpike,
  PerformanceTrend,
  Anomaly,
  AggregationConfig,
  AggregationStats,
};
