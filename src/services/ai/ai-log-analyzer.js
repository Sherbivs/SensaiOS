/**
 * AI Log Analyzer - Self-Learning System
 * 
 * ⚠️ **DEPRECATED** — This file is being replaced by TimescaleDB continuous aggregates + SQL analytics.
 * 
 * **Replacement:** Use TimescaleDB views + aggregation functions for pattern detection
 * 
 * **Migration Path:**
 * 1. Pattern detection: TimescaleDB materialized views with GROUP BY + window functions
 * 2. Correlation analysis: SQL JOINs on correlation_id + parent_correlation_id
 * 3. Performance profiling: TimescaleDB continuous aggregates (avg/max/percentile)
 * 4. Anomaly detection: SQL statistical functions (stddev, outlier detection)
 * 5. Self-learning: Update thresholds via parameterized SQL queries
 * 
 * **Why Deprecated:**
 * - OLD: File-based NDJSON parsing, in-memory analysis, manual pattern detection (slow, limited)
 * - NEW: TimescaleDB SQL queries with native time-series functions (fast, scalable, standard)
 * - TimescaleDB provides built-in analytics better than custom JavaScript parsers
 * - Real-time insights via continuous aggregates (no batch processing needed)
 * 
 * **Removal Timeline:** After 100% logger.ts adoption + TimescaleDB analytics (Task 9 Phase 5)
 * 
 * @module services/ai/ai-log-analyzer
 * @deprecated Use TimescaleDB continuous aggregates and SQL analytics instead
 */
/* eslint-disable no-console */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import path from 'node:path';
import readline from 'node:readline';

// ============================================================================
// AI LOG ANALYZER - SELF-LEARNING SYSTEM
// ============================================================================
// Purpose: Analyze structured logs for patterns, insights, and self-learning
// Features:
//   - Pattern detection (error patterns, performance patterns, user behavior)
//   - Correlation analysis (find related errors, cascade failures)
//   - Performance profiling (slow queries, memory leaks, bottlenecks)
//   - Anomaly detection (unusual patterns, spikes, degradation)
//   - Self-learning (improve detection over time, adapt thresholds)
//   - Insights generation (actionable recommendations for AI)
// ============================================================================

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  baseDir: process.env.IS_RENDER ? '/Store/ai-logs' : path.resolve(process.cwd(), 'Store/ai-logs'),
  analysisDir: process.env.IS_RENDER ? '/Store/ai-logs/analysis' : path.resolve(process.cwd(), 'Store/ai-logs/analysis'),
  
  // Pattern detection settings
  patterns: {
    minOccurrences: 3,           // Minimum occurrences to consider a pattern
    timeWindow: 60 * 60 * 1000,  // 1 hour time window for pattern detection
    similarityThreshold: 0.7,     // 70% similarity to group errors
  },
  
  // Anomaly detection settings
  anomaly: {
    baselineWindow: 24 * 60 * 60 * 1000, // 24 hours baseline
    deviationThreshold: 2.0,              // 2 standard deviations
  },
  
  // Learning settings
  learning: {
    enableAutoUpdate: true,         // Auto-update patterns and thresholds
    minDataPoints: 100,             // Minimum data points before learning
    adaptationRate: 0.1,            // How quickly to adapt (0.0 - 1.0)
  },
};

// ============================================================================
// State Management
// ============================================================================

// In-memory knowledge base (persisted to disk)
const knowledgeBase = {
  errorPatterns: new Map(),        // Known error patterns
  performanceBaselines: new Map(), // Performance baselines by operation
  userBehaviorPatterns: new Map(), // User behavior patterns
  correlations: new Map(),         // Correlated events
  anomalies: [],                   // Detected anomalies
  insights: [],                    // Generated insights
  lastUpdate: Date.now(),
};

// Statistics
const stats = {
  logsAnalyzed: 0,
  patternsDetected: 0,
  anomaliesDetected: 0,
  insightsGenerated: 0,
  correlationsFound: 0,
  learningUpdates: 0,
};

// ============================================================================
// Log Reading
// ============================================================================

/**
 * Read log entries from a file (supports both .ndjson and .ndjson.gz).
 * @param {string} filepath - Path to log file
 * @returns {AsyncGenerator<object>} Stream of log entries
 */
async function* readLogFile(filepath) {
  const isCompressed = filepath.endsWith('.gz');
  const stream = createReadStream(filepath);
  const decompressor = isCompressed ? createGunzip() : null;
  const input = decompressor ? stream.pipe(decompressor) : stream;
  
  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity,
  });
  
  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      const entry = JSON.parse(line);
      // Skip metadata entries
      if (entry._type === 'log_file_metadata') continue;
      
      yield entry;
      stats.logsAnalyzed++;
    } catch (error) {
      console.warn('[ai-log-analyzer] Failed to parse log entry:', error.message);
    }
  }
}

/**
 * Read all log files in directory (including compressed).
 * @param {string} dirPath - Directory path
 * @param {object} options - Query options
 * @returns {AsyncGenerator<object>} Stream of log entries
 */
async function* readAllLogs(dirPath = CONFIG.baseDir, options = {}) {
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
    // Read uncompressed logs
    const files = await fs.readdir(dirPath);
    const logFiles = files.filter(f => f.endsWith('.ndjson')).sort().reverse();
    
    for (const file of logFiles) {
      const filepath = path.join(dirPath, file);
      
      for await (const entry of readLogFile(filepath)) {
        // Apply filters
        if (category && entry.category !== category) continue;
        if (level && entry.level !== level) continue;
        if (since && new Date(entry.timestamp) < since) continue;
        if (until && new Date(entry.timestamp) > until) continue;
        if (tags.length > 0 && !tags.some(tag => entry.tags?.includes(tag))) continue;
        
        yield entry;
        count++;
        
        if (limit && count >= limit) return;
      }
    }
    
    // Read compressed logs if not limited yet
    if (!limit || count < limit) {
      const compressedDir = path.join(dirPath, 'compressed');
      try {
        const compressedFiles = await fs.readdir(compressedDir);
        const gzFiles = compressedFiles.filter(f => f.endsWith('.ndjson.gz')).sort().reverse();
        
        for (const file of gzFiles) {
          const filepath = path.join(compressedDir, file);
          
          for await (const entry of readLogFile(filepath)) {
            // Apply filters
            if (category && entry.category !== category) continue;
            if (level && entry.level !== level) continue;
            if (since && new Date(entry.timestamp) < since) continue;
            if (until && new Date(entry.timestamp) > until) continue;
            if (tags.length > 0 && !tags.some(tag => entry.tags?.includes(tag))) continue;
            
            yield entry;
            count++;
            
            if (limit && count >= limit) return;
          }
        }
      } catch {
        // Compressed directory might not exist yet
      }
    }
  } catch {
    console.error('[ai-log-analyzer] Failed to read logs:', error);
  }
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Calculate similarity between two error messages using Levenshtein distance.
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0.0 - 1.0)
 */
function calculateSimilarity(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  const maxLen = Math.max(len1, len2);
  return 1 - (matrix[len1][len2] / maxLen);
}

/**
 * Detect error patterns in logs.
 * @param {object} options - Analysis options
 * @returns {Promise<Array>} Detected patterns
 */
async function detectErrorPatterns(options = {}) {
  const { since = new Date(Date.now() - CONFIG.patterns.timeWindow) } = options;
  
  const errors = [];
  
  // Collect all error-level logs
  for await (const entry of readAllLogs(CONFIG.baseDir, {
    level: 'ERROR',
    since,
  })) {
    errors.push(entry);
  }
  
  // Group similar errors
  const groups = [];
  
  for (const error of errors) {
    const errorMessage = error.message || '';
    const errorName = error.error?.name || 'UnknownError';
    
    // Find existing group with similar error
    let foundGroup = null;
    for (const group of groups) {
      const representative = group.errors[0];
      const repMessage = representative.message || '';
      const repName = representative.error?.name || 'UnknownError';
      
      // Check name match and message similarity
      if (errorName === repName && calculateSimilarity(errorMessage, repMessage) >= CONFIG.patterns.similarityThreshold) {
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
        files: [error.context?.file].filter(Boolean),
      });
    }
  }
  
  // Filter groups that meet minimum occurrences
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
 * @param {object} options - Analysis options
 * @returns {Promise<Array>} Detected patterns
 */
async function detectPerformancePatterns(options = {}) {
  const { since = new Date(Date.now() - CONFIG.patterns.timeWindow) } = options;
  
  const operations = new Map();
  
  // Collect performance-related logs
  for await (const entry of readAllLogs(CONFIG.baseDir, {
    category: 'performance',
    since,
  })) {
    const operation = entry.data?.operation || 'unknown';
    const duration = entry.data?.duration || 0;
    
    if (!operations.has(operation)) {
      operations.set(operation, []);
    }
    
    operations.get(operation).push({
      duration,
      timestamp: entry.timestamp,
      file: entry.context?.file,
    });
  }
  
  // Analyze each operation
  const patterns = [];
  
  for (const [operation, measurements] of operations.entries()) {
    if (measurements.length < CONFIG.patterns.minOccurrences) continue;
    
    const durations = measurements.map(m => m.duration);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    const min = Math.min(...durations);
    const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)];
    
    patterns.push({
      operation,
      count: measurements.length,
      avg,
      min,
      max,
      p95,
      files: [...new Set(measurements.map(m => m.file))].filter(Boolean),
    });
    
    // Update baseline
    const baseline = knowledgeBase.performanceBaselines.get(operation);
    
    if (baseline) {
      // Adapt baseline with new measurements
      baseline.avg = baseline.avg * (1 - CONFIG.learning.adaptationRate) + avg * CONFIG.learning.adaptationRate;
      baseline.p95 = baseline.p95 * (1 - CONFIG.learning.adaptationRate) + p95 * CONFIG.learning.adaptationRate;
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

// ============================================================================
// Correlation Analysis
// ============================================================================

/**
 * Find correlated events (events that happen together).
 * @param {object} options - Analysis options
 * @returns {Promise<Array>} Correlated event pairs
 */
async function findCorrelations(options = {}) {
  const { since = new Date(Date.now() - CONFIG.patterns.timeWindow), timeWindow = 60000 } = options;
  
  const events = [];
  
  // Collect all events
  for await (const entry of readAllLogs(CONFIG.baseDir, { since })) {
    events.push({
      timestamp: new Date(entry.timestamp).getTime(),
      level: entry.level,
      category: entry.category,
      message: entry.message,
      correlationId: entry.correlationId,
    });
  }
  
  // Sort by timestamp
  events.sort((a, b) => a.timestamp - b.timestamp);
  
  const correlations = new Map();
  
  // Find events that occur within time window
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const event1 = events[i];
      const event2 = events[j];
      
      // Stop if too far apart
      if (event2.timestamp - event1.timestamp > timeWindow) break;
      
      // Skip same category
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
      
      const corr = correlations.get(key);
      corr.count++;
      corr.timeDeltaSum += event2.timestamp - event1.timestamp;
      corr.avgTimeDelta = corr.timeDeltaSum / corr.count;
    }
  }
  
  // Filter significant correlations
  const significantCorrelations = Array.from(correlations.values())
    .filter(c => c.count >= CONFIG.patterns.minOccurrences)
    .sort((a, b) => b.count - a.count);
  
  // Update knowledge base
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

// ============================================================================
// Anomaly Detection
// ============================================================================

/**
 * Detect anomalies in log patterns.
 * @param {object} options - Analysis options
 * @returns {Promise<Array>} Detected anomalies
 */
async function detectAnomalies(options = {}) {
  const { since = new Date(Date.now() - CONFIG.anomaly.baselineWindow) } = options;
  
  const hourlyBuckets = new Map();
  
  // Bucket logs by hour
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
    
    hourlyBuckets.get(key).count++;
  }
  
  // Group by level
  const byLevel = new Map();
  
  for (const bucket of hourlyBuckets.values()) {
    if (!byLevel.has(bucket.level)) {
      byLevel.set(bucket.level, []);
    }
    
    byLevel.get(bucket.level).push(bucket.count);
  }
  
  // Detect anomalies (values outside 2 standard deviations)
  const anomalies = [];
  
  for (const [level, counts] of byLevel.entries()) {
    if (counts.length < 24) continue; // Need at least 24 hours of data
    
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
          deviation: (counts[i] - avg) / stdDev,
          hour: i,
        });
      }
    }
  }
  
  // Store anomalies
  knowledgeBase.anomalies.push(...anomalies.map(a => ({
    ...a,
    detectedAt: Date.now(),
  })));
  
  stats.anomaliesDetected += anomalies.length;
  
  return anomalies;
}

// ============================================================================
// Insights Generation
// ============================================================================

/**
 * Generate actionable insights from analysis.
 * @returns {Promise<Array>} Generated insights
 */
async function generateInsights() {
  const insights = [];
  
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
    if (baseline.p95 > 1000) { // >1 second
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
  const recentAnomalies = knowledgeBase.anomalies.filter(a => Date.now() - a.detectedAt < 60 * 60 * 1000);
  if (recentAnomalies.length > 0) {
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

// ============================================================================
// Persistence
// ============================================================================

/**
 * Save knowledge base to disk.
 * @returns {Promise<void>}
 */
async function saveKnowledgeBase() {
  try {
    await fs.mkdir(CONFIG.analysisDir, { recursive: true });
    
    const filepath = path.join(CONFIG.analysisDir, 'knowledge-base.json');
    
    // Convert Maps to objects for JSON serialization
    const serializable = {
      errorPatterns: Array.from(knowledgeBase.errorPatterns.entries()),
      performanceBaselines: Array.from(knowledgeBase.performanceBaselines.entries()),
      userBehaviorPatterns: Array.from(knowledgeBase.userBehaviorPatterns.entries()),
      correlations: Array.from(knowledgeBase.correlations.entries()),
      anomalies: knowledgeBase.anomalies.slice(-100), // Keep last 100
      insights: knowledgeBase.insights.slice(-100),   // Keep last 100
      lastUpdate: Date.now(),
      stats: { ...stats },
    };
    
    await fs.writeFile(filepath, JSON.stringify(serializable, null, 2));
    
    console.log('[ai-log-analyzer] Knowledge base saved');
  } catch (error) {
    console.error('[ai-log-analyzer] Failed to save knowledge base:', error);
  }
}

/**
 * Load knowledge base from disk.
 * @returns {Promise<void>}
 */
async function loadKnowledgeBase() {
  try {
    const filepath = path.join(CONFIG.analysisDir, 'knowledge-base.json');
    const data = await fs.readFile(filepath, 'utf8');
    const parsed = JSON.parse(data);
    
    // Restore Maps
    knowledgeBase.errorPatterns = new Map(parsed.errorPatterns);
    knowledgeBase.performanceBaselines = new Map(parsed.performanceBaselines);
    knowledgeBase.userBehaviorPatterns = new Map(parsed.userBehaviorPatterns);
    knowledgeBase.correlations = new Map(parsed.correlations);
    knowledgeBase.anomalies = parsed.anomalies || [];
    knowledgeBase.insights = parsed.insights || [];
    knowledgeBase.lastUpdate = parsed.lastUpdate;
    
    Object.assign(stats, parsed.stats || {});
    
    console.log('[ai-log-analyzer] Knowledge base loaded');
  } catch {
    // File doesn't exist yet, start fresh
    console.log('[ai-log-analyzer] Starting with fresh knowledge base');
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Run full analysis pipeline.
 * @param {object} options - Analysis options
 * @returns {Promise<object>} Analysis results
 */
async function analyze(options = {}) {
  console.log('[ai-log-analyzer] Starting analysis...');
  
  const results = {
    errorPatterns: await detectErrorPatterns(options),
    performancePatterns: await detectPerformancePatterns(options),
    correlations: await findCorrelations(options),
    anomalies: await detectAnomalies(options),
    insights: await generateInsights(),
    stats: { ...stats },
  };
  
  // Save updated knowledge base
  if (CONFIG.learning.enableAutoUpdate) {
    await saveKnowledgeBase();
    stats.learningUpdates++;
  }
  
  console.log('[ai-log-analyzer] Analysis complete');
  
  return results;
}

/**
 * Query logs with filters.
 * @param {object} filters - Query filters
 * @returns {AsyncGenerator<object>} Matching log entries
 */
async function* query(filters = {}) {
  for await (const entry of readAllLogs(CONFIG.baseDir, filters)) {
    yield entry;
  }
}

/**
 * Get knowledge base summary.
 * @returns {object} Summary of learned patterns
 */
function getKnowledgeSummary() {
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
 * @returns {Promise<void>}
 */
async function initialize() {
  await loadKnowledgeBase();
  console.log('[ai-log-analyzer] Initialized');
}

/**
 * Shutdown analyzer.
 * @returns {Promise<void>}
 */
async function shutdown() {
  await saveKnowledgeBase();
  console.log('[ai-log-analyzer] Shutdown complete');
}

// ============================================================================
// Exports
// ============================================================================

export {
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
