/* eslint-disable no-console */
/**
 * AI Log Analyzer - Self-Learning System
 * @module services/ai/ai-log-analyzer
 * 
 * Features:
 *   - Pattern detection (error patterns, performance patterns, user behavior)
 *   - Correlation analysis (find related errors, cascade failures)
 *   - Performance profiling (slow queries, memory leaks, bottlenecks)
 *   - Anomaly detection (unusual patterns, spikes, degradation)
 *   - Self-learning (improve detection over time, adapt thresholds)
 *   - Insights generation (actionable recommendations for AI)
 * 
 * Storage: PostgreSQL CacheEntry table (Database-First Architecture 2025-12-27)
 */

import { prisma } from '../../shared/prisma.js';
import type { LogEntry, LogLevel } from './ai-log-writer.js';
import { ensureError } from '../../shared/utils/error-utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AnalysisConfig {
  baseDir: string;
  analysisDir: string;
  patterns: {
    minOccurrences: number;
    timeWindow: number;
    similarityThreshold: number;
  };
  anomaly: {
    baselineWindow: number;
    deviationThreshold: number;
  };
  learning: {
    enableAutoUpdate: boolean;
    minDataPoints: number;
    adaptationRate: number;
  };
}

interface QueryOptions {
  category?: string | null;
  level?: LogLevel | null;
  since?: Date | null;
  until?: Date | null;
  tags?: string[];
  limit?: number | null;
}

interface ErrorOccurrence {
  timestamp: number;
  count: number;
  timeWindow: number;
}

interface ErrorPattern {
  pattern: string;
  errorName: string;
  totalOccurrences: number;
  firstDetected: string;
  lastSeen: string;
  files: string[];
  occurrences: ErrorOccurrence[];
}

interface ErrorPatternGroup {
  pattern: string;
  errorName: string;
  errors: LogEntry[];
  count: number;
  firstSeen: string;
  lastSeen: string;
  files: string[];
}

interface PerformanceMeasurement {
  duration: number;
  timestamp: string;
  file?: string;
}

interface PerformanceBaseline {
  operation: string;
  avg: number;
  p95: number;
  measurements: number;
  firstMeasured: string;
  lastUpdate: number;
}

export interface PerformancePattern {
  operation: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  p95: number;
  files: string[];
}

export interface Correlation {
  event1: string;
  event2: string;
  count: number;
  avgTimeDelta: number;
  timeDeltaSum: number;
  lastDetected?: number;
}

export interface Anomaly {
  level: string;
  count: number;
  baseline: number;
  threshold: number;
  deviation: number;
  hour: number;
  detectedAt?: number;
}

type InsightSeverity = 'high' | 'medium' | 'low';

type InsightType = 
  | 'recurring_error'
  | 'performance_bottleneck'
  | 'cascading_failure'
  | 'anomaly';

export interface Insight {
  id?: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  affectedFiles?: string[];
  recommendation: string;
  data: unknown;
  generatedAt?: number;
}

interface KnowledgeBase {
  errorPatterns: Map<string, ErrorPattern>;
  performanceBaselines: Map<string, PerformanceBaseline>;
  userBehaviorPatterns: Map<string, unknown>;
  correlations: Map<string, Correlation>;
  anomalies: Anomaly[];
  insights: Insight[];
  lastUpdate: number;
}

interface AnalysisStats {
  logsAnalyzed: number;
  patternsDetected: number;
  anomaliesDetected: number;
  insightsGenerated: number;
  correlationsFound: number;
  learningUpdates: number;
}

export interface AnalysisResults {
  errorPatterns: ErrorPatternGroup[];
  performancePatterns: PerformancePattern[];
  correlations: Correlation[];
  anomalies: Anomaly[];
  insights: Insight[];
  stats: AnalysisStats;
}

export interface KnowledgeSummary {
  errorPatterns: number;
  performanceBaselines: number;
  correlations: number;
  anomalies: number;
  insights: number;
  lastUpdate: number;
  stats: AnalysisStats;
}

interface SerializedKnowledgeBase {
  errorPatterns: Array<[string, ErrorPattern]>;
  performanceBaselines: Array<[string, PerformanceBaseline]>;
  userBehaviorPatterns: Array<[string, unknown]>;
  correlations: Array<[string, Correlation]>;
  anomalies: Anomaly[];
  insights: Insight[];
  lastUpdate: number;
  stats: AnalysisStats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

// Database namespace for AI logs
const AI_LOG_NAMESPACE = 'ai-logs';
const ANALYSIS_NAMESPACE = 'ai-logs-analysis';

const CONFIG: AnalysisConfig = {
  baseDir: AI_LOG_NAMESPACE, // Database namespace
  analysisDir: ANALYSIS_NAMESPACE, // Database namespace for analysis results
  
  // Pattern detection settings
  patterns: {
    minOccurrences: 3,
    timeWindow: 60 * 60 * 1000, // 1 hour
    similarityThreshold: 0.7,
  },
  
  // Anomaly detection settings
  anomaly: {
    baselineWindow: 24 * 60 * 60 * 1000, // 24 hours
    deviationThreshold: 2.0,
  },
  
  // Learning settings
  learning: {
    enableAutoUpdate: true,
    minDataPoints: 100,
    adaptationRate: 0.1,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

const knowledgeBase: KnowledgeBase = {
  errorPatterns: new Map(),
  performanceBaselines: new Map(),
  userBehaviorPatterns: new Map(),
  correlations: new Map(),
  anomalies: [],
  insights: [],
  lastUpdate: Date.now(),
};

const stats: AnalysisStats = {
  logsAnalyzed: 0,
  patternsDetected: 0,
  anomaliesDetected: 0,
  insightsGenerated: 0,
  correlationsFound: 0,
  learningUpdates: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Log Reading
// ─────────────────────────────────────────────────────────────────────────────

// Type for database log batch structure
interface LogBatch {
  _type: string;
  entries: LogEntry[];
  category: string;
  created: string;
}

/**
 * Read log entries from database (Database-First Architecture).
 */
async function* readAllLogs(
  _namespace: string = CONFIG.baseDir, 
  options: QueryOptions = {}
): AsyncGenerator<LogEntry> {
  const {
    category = null,
    level = null,
    since = null,
    until = null,
    tags = [],
    limit = null,
  } = options;
  
  let count = 0;
  
  try {
    // Build where clause for database query
    const whereClause: Record<string, unknown> = {
      namespace: AI_LOG_NAMESPACE,
    };
    
    if (since) {
      whereClause.createdAt = { gte: since };
    }
    
    // Fetch log batches from database
    const batches = await prisma.cacheEntry.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 1000, // Max batches to process
    });
    
    for (const batch of batches) {
      const batchData = batch.value as unknown as LogBatch;
      if (!batchData || batchData._type !== 'ai_log_batch' || !Array.isArray(batchData.entries)) {
        continue;
      }
      
      for (const entry of batchData.entries) {
        // Apply filters
        if (category && entry.category !== category) continue;
        if (level && entry.level !== level) continue;
        if (since && new Date(entry.timestamp) < since) continue;
        if (until && new Date(entry.timestamp) > until) continue;
        if (tags.length > 0 && !tags.some(tag => entry.tags?.includes(tag))) continue;
        
        yield entry;
        stats.logsAnalyzed++;
        count++;
        
        if (limit && count >= limit) return;
      }
    }
  } catch (error) {
    const err = ensureError(error);
    console.error('[ai-log-analyzer] Failed to read logs from database:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate similarity between two strings using Levenshtein distance.
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : 1 - (matrix[len1][len2] / maxLen);
}

/**
 * Detect error patterns in logs.
 */
export async function detectErrorPatterns(
  options: { since?: Date } = {}
): Promise<ErrorPatternGroup[]> {
  const { since = new Date(Date.now() - CONFIG.patterns.timeWindow) } = options;
  
  const errors: LogEntry[] = [];
  
  for await (const entry of readAllLogs(CONFIG.baseDir, {
    level: 'ERROR',
    since,
  })) {
    errors.push(entry);
  }
  
  const groups: ErrorPatternGroup[] = [];
  
  for (const error of errors) {
    const errorMessage = error.message || '';
    const errorName = error.error?.name || 'UnknownError';
    
    let foundGroup: ErrorPatternGroup | null = null;
    for (const group of groups) {
      const representative = group.errors[0];
      const repMessage = representative.message || '';
      const repName = representative.error?.name || 'UnknownError';
      
      if (errorName === repName && 
          calculateSimilarity(errorMessage, repMessage) >= CONFIG.patterns.similarityThreshold) {
        foundGroup = group;
        break;
      }
    }
    
    if (foundGroup) {
      foundGroup.errors.push(error);
      foundGroup.count++;
      foundGroup.lastSeen = error.timestamp;
    } else {
      groups.push({
        pattern: errorMessage,
        errorName,
        errors: [error],
        count: 1,
        firstSeen: error.timestamp,
        lastSeen: error.timestamp,
        files: [error.context?.file].filter((f): f is string => Boolean(f)),
      });
    }
  }
  
  const patterns = groups
    .filter(g => g.count >= CONFIG.patterns.minOccurrences)
    .sort((a, b) => b.count - a.count);
  
  // Update knowledge base
  for (const pattern of patterns) {
    const key = `${pattern.errorName}:${pattern.pattern}`;
    const existing = knowledgeBase.errorPatterns.get(key);
    
    if (existing) {
      existing.totalOccurrences += pattern.count;
      existing.lastSeen = pattern.lastSeen;
      existing.occurrences.push({
        timestamp: Date.now(),
        count: pattern.count,
        timeWindow: CONFIG.patterns.timeWindow,
      });
    } else {
      knowledgeBase.errorPatterns.set(key, {
        pattern: pattern.pattern,
        errorName: pattern.errorName,
        totalOccurrences: pattern.count,
        firstDetected: pattern.firstSeen,
        lastSeen: pattern.lastSeen,
        files: [...new Set(pattern.files)],
        occurrences: [{
          timestamp: Date.now(),
          count: pattern.count,
          timeWindow: CONFIG.patterns.timeWindow,
        }],
      });
    }
  }
  
  stats.patternsDetected += patterns.length;
  
  return patterns;
}

/**
 * Detect performance patterns (slow operations, bottlenecks).
 */
export async function detectPerformancePatterns(
  options: { since?: Date } = {}
): Promise<PerformancePattern[]> {
  const { since = new Date(Date.now() - CONFIG.patterns.timeWindow) } = options;
  
  const operations = new Map<string, PerformanceMeasurement[]>();
  
  for await (const entry of readAllLogs(CONFIG.baseDir, {
    category: 'performance',
    since,
  })) {
    const operation = (entry.data?.operation as string) || 'unknown';
    const duration = (entry.data?.duration as number) || 0;
    
    if (!operations.has(operation)) {
      operations.set(operation, []);
    }
    
    operations.get(operation)!.push({
      duration,
      timestamp: entry.timestamp,
      file: entry.context?.file,
    });
  }
  
  const patterns: PerformancePattern[] = [];
  
  for (const [operation, measurements] of operations.entries()) {
    if (measurements.length < CONFIG.patterns.minOccurrences) continue;
    
    const durations = measurements.map(m => m.duration);
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    const min = Math.min(...durations);
    const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)];
    
    patterns.push({
      operation,
      count: measurements.length,
      avg,
      min,
      max,
      p95,
      files: [...new Set(measurements.map(m => m.file).filter((f): f is string => Boolean(f)))],
    });
    
    // Update baseline
    const baseline = knowledgeBase.performanceBaselines.get(operation);
    
    if (baseline) {
      baseline.avg = baseline.avg * (1 - CONFIG.learning.adaptationRate) + 
                     avg * CONFIG.learning.adaptationRate;
      baseline.p95 = baseline.p95 * (1 - CONFIG.learning.adaptationRate) + 
                     p95 * CONFIG.learning.adaptationRate;
      baseline.measurements += measurements.length;
      baseline.lastUpdate = Date.now();
    } else {
      knowledgeBase.performanceBaselines.set(operation, {
        operation,
        avg,
        p95,
        measurements: measurements.length,
        firstMeasured: measurements[0].timestamp,
        lastUpdate: Date.now(),
      });
    }
  }
  
  return patterns;
}

// ─────────────────────────────────────────────────────────────────────────────
// Correlation Analysis
// ─────────────────────────────────────────────────────────────────────────────

interface EventSummary {
  timestamp: number;
  level: string;
  category: string;
  message: string;
  correlationId: string;
}

/**
 * Find correlated events (events that happen together).
 */
export async function findCorrelations(
  options: { since?: Date; timeWindow?: number } = {}
): Promise<Correlation[]> {
  const { 
    since = new Date(Date.now() - CONFIG.patterns.timeWindow), 
    timeWindow = 60000 
  } = options;
  
  const events: EventSummary[] = [];
  
  for await (const entry of readAllLogs(CONFIG.baseDir, { since })) {
    events.push({
      timestamp: new Date(entry.timestamp).getTime(),
      level: entry.level,
      category: entry.category,
      message: entry.message,
      correlationId: entry.correlationId,
    });
  }
  
  events.sort((a, b) => a.timestamp - b.timestamp);
  
  const correlations = new Map<string, Correlation>();
  
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const event1 = events[i];
      const event2 = events[j];
      
      if (event2.timestamp - event1.timestamp > timeWindow) break;
      if (event1.category === event2.category) continue;
      
      const key = `${event1.category}:${event1.level}→${event2.category}:${event2.level}`;
      
      if (!correlations.has(key)) {
        correlations.set(key, {
          event1: `${event1.category}:${event1.level}`,
          event2: `${event2.category}:${event2.level}`,
          count: 0,
          avgTimeDelta: 0,
          timeDeltaSum: 0,
        });
      }
      
      const corr = correlations.get(key)!;
      corr.count++;
      corr.timeDeltaSum += event2.timestamp - event1.timestamp;
      corr.avgTimeDelta = corr.timeDeltaSum / corr.count;
    }
  }
  
  const significantCorrelations = Array.from(correlations.values())
    .filter(c => c.count >= CONFIG.patterns.minOccurrences)
    .sort((a, b) => b.count - a.count);
  
  for (const corr of significantCorrelations) {
    const key = `${corr.event1}→${corr.event2}`;
    knowledgeBase.correlations.set(key, {
      ...corr,
      lastDetected: Date.now(),
    });
  }
  
  stats.correlationsFound += significantCorrelations.length;
  
  return significantCorrelations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Anomaly Detection
// ─────────────────────────────────────────────────────────────────────────────

interface HourlyBucket {
  hour: number;
  level: string;
  count: number;
}

/**
 * Detect anomalies in log patterns.
 */
export async function detectAnomalies(
  options: { since?: Date } = {}
): Promise<Anomaly[]> {
  const { since = new Date(Date.now() - CONFIG.anomaly.baselineWindow) } = options;
  
  const hourlyBuckets = new Map<string, HourlyBucket>();
  
  for await (const entry of readAllLogs(CONFIG.baseDir, { since })) {
    const hour = Math.floor(new Date(entry.timestamp).getTime() / (60 * 60 * 1000));
    const key = `${hour}:${entry.level}`;
    
    if (!hourlyBuckets.has(key)) {
      hourlyBuckets.set(key, {
        hour,
        level: entry.level,
        count: 0,
      });
    }
    
    hourlyBuckets.get(key)!.count++;
  }
  
  const byLevel = new Map<string, number[]>();
  
  for (const bucket of hourlyBuckets.values()) {
    if (!byLevel.has(bucket.level)) {
      byLevel.set(bucket.level, []);
    }
    byLevel.get(bucket.level)!.push(bucket.count);
  }
  
  const anomalies: Anomaly[] = [];
  
  for (const [level, counts] of byLevel.entries()) {
    if (counts.length < 24) continue;
    
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    
    const threshold = avg + (stdDev * CONFIG.anomaly.deviationThreshold);
    
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > threshold) {
        anomalies.push({
          level,
          count: counts[i],
          baseline: avg,
          threshold,
          deviation: stdDev > 0 ? (counts[i] - avg) / stdDev : 0,
          hour: i,
        });
      }
    }
  }
  
  knowledgeBase.anomalies.push(...anomalies.map(a => ({
    ...a,
    detectedAt: Date.now(),
  })));
  
  stats.anomaliesDetected += anomalies.length;
  
  return anomalies;
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate actionable insights from analysis.
 */
export async function generateInsights(): Promise<Insight[]> {
  const insights: Insight[] = [];
  
  // Insight 1: Recurring errors
  for (const [_key, pattern] of knowledgeBase.errorPatterns.entries()) {
    if (pattern.totalOccurrences >= 10) {
      insights.push({
        type: 'recurring_error',
        severity: 'high',
        title: `Recurring error: ${pattern.errorName}`,
        description: `This error has occurred ${pattern.totalOccurrences} times. Pattern: "${pattern.pattern.substring(0, 100)}..."`,
        affectedFiles: pattern.files,
        recommendation: `Investigate root cause in ${pattern.files[0] || 'unknown file'}. Consider adding error recovery or improving validation.`,
        data: pattern,
      });
    }
  }
  
  // Insight 2: Performance bottlenecks
  for (const [operation, baseline] of knowledgeBase.performanceBaselines.entries()) {
    if (baseline.p95 > 1000) {
      insights.push({
        type: 'performance_bottleneck',
        severity: 'medium',
        title: `Slow operation: ${operation}`,
        description: `P95 latency is ${baseline.p95.toFixed(2)}ms (avg: ${baseline.avg.toFixed(2)}ms)`,
        recommendation: `Consider optimizing ${operation}. Add caching, reduce database queries, or optimize algorithms.`,
        data: baseline,
      });
    }
  }
  
  // Insight 3: Cascading failures
  for (const [_key, corr] of knowledgeBase.correlations.entries()) {
    if (corr.count >= 5 && corr.event1.includes('ERROR')) {
      insights.push({
        type: 'cascading_failure',
        severity: 'high',
        title: `Cascading failure detected: ${corr.event1} → ${corr.event2}`,
        description: `${corr.event1} leads to ${corr.event2} within ${(corr.avgTimeDelta / 1000).toFixed(1)}s (${corr.count} occurrences)`,
        recommendation: `Add error handling to prevent ${corr.event1} from triggering ${corr.event2}. Consider circuit breaker pattern.`,
        data: corr,
      });
    }
  }
  
  // Insight 4: Anomalies
  const recentAnomalies = knowledgeBase.anomalies.filter(
    a => a.detectedAt && Date.now() - a.detectedAt < 60 * 60 * 1000
  );
  
  for (const anomaly of recentAnomalies) {
    insights.push({
      type: 'anomaly',
      severity: 'medium',
      title: `Anomaly detected: ${anomaly.level} logs spike`,
      description: `${anomaly.level} log count (${anomaly.count}) is ${anomaly.deviation.toFixed(1)}σ above baseline (${anomaly.baseline.toFixed(0)})`,
      recommendation: `Investigate recent changes that may have caused increased ${anomaly.level} logs. Check for new error conditions or configuration changes.`,
      data: anomaly,
    });
  }
  
  // Store insights
  for (const insight of insights) {
    insight.id = `${insight.type}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    insight.generatedAt = Date.now();
  }
  
  knowledgeBase.insights.push(...insights);
  stats.insightsGenerated += insights.length;
  
  return insights;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence (Database-First Architecture)
// ─────────────────────────────────────────────────────────────────────────────

const KNOWLEDGE_BASE_KEY = `${ANALYSIS_NAMESPACE}:knowledge-base`;

/**
 * Save knowledge base to database.
 */
export async function saveKnowledgeBase(): Promise<void> {
  try {
    const serializable: SerializedKnowledgeBase = {
      errorPatterns: Array.from(knowledgeBase.errorPatterns.entries()),
      performanceBaselines: Array.from(knowledgeBase.performanceBaselines.entries()),
      userBehaviorPatterns: Array.from(knowledgeBase.userBehaviorPatterns.entries()),
      correlations: Array.from(knowledgeBase.correlations.entries()),
      anomalies: knowledgeBase.anomalies.slice(-100),
      insights: knowledgeBase.insights.slice(-100),
      lastUpdate: Date.now(),
      stats: { ...stats },
    };
    
    // Convert to JSON-safe format
    const jsonValue = JSON.parse(JSON.stringify(serializable));
    
    await prisma.cacheEntry.upsert({
      where: { key: KNOWLEDGE_BASE_KEY },
      update: {
        value: jsonValue,
        updatedAt: new Date(),
      },
      create: {
        key: KNOWLEDGE_BASE_KEY,
        namespace: ANALYSIS_NAMESPACE,
        value: jsonValue,
      },
    });
    
    console.log('[ai-log-analyzer] Knowledge base saved to database');
  } catch (error) {
    const err = ensureError(error);
    console.error('[ai-log-analyzer] Failed to save knowledge base:', err.message);
  }
}

/**
 * Load knowledge base from database.
 */
export async function loadKnowledgeBase(): Promise<void> {
  try {
    const entry = await prisma.cacheEntry.findUnique({
      where: { key: KNOWLEDGE_BASE_KEY },
    });
    
    if (!entry) {
      console.log('[ai-log-analyzer] Starting with fresh knowledge base');
      return;
    }
    
    const parsed = entry.value as unknown as SerializedKnowledgeBase;
    
    knowledgeBase.errorPatterns = new Map(parsed.errorPatterns);
    knowledgeBase.performanceBaselines = new Map(parsed.performanceBaselines);
    knowledgeBase.userBehaviorPatterns = new Map(parsed.userBehaviorPatterns);
    knowledgeBase.correlations = new Map(parsed.correlations);
    knowledgeBase.anomalies = parsed.anomalies || [];
    knowledgeBase.insights = parsed.insights || [];
    knowledgeBase.lastUpdate = parsed.lastUpdate;
    
    Object.assign(stats, parsed.stats || {});
    
    console.log('[ai-log-analyzer] Knowledge base loaded from database');
  } catch (error) {
    const err = ensureError(error);
    console.error('[ai-log-analyzer] Failed to load knowledge base:', err.message);
    console.log('[ai-log-analyzer] Starting with fresh knowledge base');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run full analysis pipeline.
 */
export async function analyze(options: { since?: Date } = {}): Promise<AnalysisResults> {
  console.log('[ai-log-analyzer] Starting analysis...');
  
  const results: AnalysisResults = {
    errorPatterns: await detectErrorPatterns(options),
    performancePatterns: await detectPerformancePatterns(options),
    correlations: await findCorrelations(options),
    anomalies: await detectAnomalies(options),
    insights: await generateInsights(),
    stats: { ...stats },
  };
  
  if (CONFIG.learning.enableAutoUpdate) {
    await saveKnowledgeBase();
    stats.learningUpdates++;
  }
  
  console.log('[ai-log-analyzer] Analysis complete');
  
  return results;
}

/**
 * Query logs with filters.
 */
export async function* query(filters: QueryOptions = {}): AsyncGenerator<LogEntry> {
  for await (const entry of readAllLogs(CONFIG.baseDir, filters)) {
    yield entry;
  }
}

/**
 * Get knowledge base summary.
 */
export function getKnowledgeSummary(): KnowledgeSummary {
  return {
    errorPatterns: knowledgeBase.errorPatterns.size,
    performanceBaselines: knowledgeBase.performanceBaselines.size,
    correlations: knowledgeBase.correlations.size,
    anomalies: knowledgeBase.anomalies.length,
    insights: knowledgeBase.insights.length,
    lastUpdate: knowledgeBase.lastUpdate,
    stats: { ...stats },
  };
}

/**
 * Initialize analyzer.
 */
export async function initialize(): Promise<void> {
  await loadKnowledgeBase();
  console.log('[ai-log-analyzer] Initialized');
}

/**
 * Shutdown analyzer.
 */
export async function shutdown(): Promise<void> {
  await saveKnowledgeBase();
  console.log('[ai-log-analyzer] Shutdown complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Export
// ─────────────────────────────────────────────────────────────────────────────

export default {
  initialize,
  shutdown,
  analyze,
  query,
  detectErrorPatterns,
  detectPerformancePatterns,
  findCorrelations,
  detectAnomalies,
  generateInsights,
  getKnowledgeSummary,
  saveKnowledgeBase,
  loadKnowledgeBase,
};
