/**
 * Query Profiler Service — Performance analysis and optimization recommendations
 *
 * P2-005: Query Profiling Integration (Database-Centric Development Plan Sprint 3)
 *
 * Features:
 * - EXPLAIN ANALYZE integration for query plan analysis
 * - Missing index detection and recommendations
 * - Slow query aggregation and pattern analysis
 * - Query complexity scoring
 * - N+1 detection through query pattern analysis
 *
 * Integration Points:
 * - Prisma query events ($on('query'))
 * - database-metrics.ts (slow query metrics)
 * - connection-health-monitor.ts (performance correlation)
 *
 * @module services/query-profiler
 */
import { log } from '../utils/logger.js';
import { Counter, Histogram, Gauge, register } from 'prom-client';
const DEFAULT_CONFIG = {
    slowQueryThresholdMs: 100,
    enableExplainAnalyze: false, // Disabled by default in production
    maxPatterns: 100,
    enableIndexRecommendations: true,
};
// ============================================================================
// Prometheus Metrics
// ============================================================================
const PREFIX = 'infinity_gauntlet_query_';
const seqScansCounter = new Counter({
    name: `${PREFIX}seq_scans_total`,
    help: 'Total sequential scans detected',
    labelNames: ['table'],
    registers: [register],
});
const complexQueryCounter = new Counter({
    name: `${PREFIX}complex_queries_total`,
    help: 'Total complex queries detected (complexity score >= 7)',
    registers: [register],
});
const indexRecommendationsGauge = new Gauge({
    name: `${PREFIX}index_recommendations`,
    help: 'Number of index recommendations pending',
    registers: [register],
});
const queryComplexityHistogram = new Histogram({
    name: `${PREFIX}complexity_score`,
    help: 'Query complexity score distribution',
    buckets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    registers: [register],
});
// ============================================================================
// Query Profiler Class
// ============================================================================
export class QueryProfiler {
    config;
    slowQueryPatterns = new Map();
    indexRecommendations = [];
    static instance = null;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Get singleton instance
     */
    static getInstance(config) {
        if (!QueryProfiler.instance) {
            QueryProfiler.instance = new QueryProfiler(config);
        }
        return QueryProfiler.instance;
    }
    /**
     * Analyze a query using EXPLAIN ANALYZE
     *
     * @param prisma - Prisma client instance
     * @param query - SQL query to analyze
     * @returns Query plan analysis
     */
    async analyzeQuery(prisma, query) {
        if (!this.config.enableExplainAnalyze) {
            throw new Error('EXPLAIN ANALYZE is disabled in config. Set enableExplainAnalyze: true to enable.');
        }
        try {
            // Run EXPLAIN ANALYZE with JSON output
            const explainResult = await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, FORMAT JSON) ${query}`);
            const plan = explainResult[0]?.['QUERY PLAN']?.[0];
            if (!plan) {
                throw new Error('Unable to parse query plan');
            }
            return this.analyzePlan(query, plan);
        }
        catch (error) {
            log.error('Query analysis failed', { query, error: String(error) });
            throw error;
        }
    }
    /**
     * Track a slow query for pattern analysis
     */
    trackSlowQuery(query, durationMs) {
        if (durationMs < this.config.slowQueryThresholdMs)
            return;
        const fingerprint = this.generateFingerprint(query);
        const existing = this.slowQueryPatterns.get(fingerprint);
        if (existing) {
            existing.count++;
            existing.totalTime += durationMs;
            existing.avgTime = existing.totalTime / existing.count;
            existing.maxTime = Math.max(existing.maxTime, durationMs);
            existing.minTime = Math.min(existing.minTime, durationMs);
            existing.lastSeen = new Date();
        }
        else {
            // Evict oldest pattern if at capacity
            if (this.slowQueryPatterns.size >= this.config.maxPatterns) {
                const oldest = Array.from(this.slowQueryPatterns.entries())
                    .sort((a, b) => a[1].lastSeen.getTime() - b[1].lastSeen.getTime())[0];
                if (oldest) {
                    this.slowQueryPatterns.delete(oldest[0]);
                }
            }
            this.slowQueryPatterns.set(fingerprint, {
                fingerprint,
                count: 1,
                totalTime: durationMs,
                avgTime: durationMs,
                maxTime: durationMs,
                minTime: durationMs,
                lastSeen: new Date(),
                sampleQuery: query.substring(0, 500),
            });
        }
    }
    /**
     * Get all slow query patterns sorted by total time
     */
    getSlowQueryPatterns() {
        return Array.from(this.slowQueryPatterns.values())
            .sort((a, b) => b.totalTime - a.totalTime);
    }
    /**
     * Get top N slow query patterns
     */
    getTopSlowQueries(limit = 10) {
        return this.getSlowQueryPatterns().slice(0, limit);
    }
    /**
     * Get index recommendations
     */
    getIndexRecommendations() {
        return [...this.indexRecommendations];
    }
    /**
     * Add index recommendation
     */
    addIndexRecommendation(recommendation) {
        // Check for duplicates
        const exists = this.indexRecommendations.some((r) => r.table === recommendation.table &&
            r.columns.join(',') === recommendation.columns.join(','));
        if (!exists) {
            this.indexRecommendations.push(recommendation);
            indexRecommendationsGauge.set(this.indexRecommendations.length);
            log.info('New index recommendation', {
                table: recommendation.table,
                columns: recommendation.columns,
                reason: recommendation.reason,
                ddl: recommendation.suggestedDDL,
            });
        }
    }
    /**
     * Analyze table for missing indexes
     */
    async analyzeTableIndexes(prisma, tableName) {
        const recommendations = [];
        try {
            // Get table statistics
            const statsResult = await prisma.$queryRaw `
        SELECT seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, n_live_tup
        FROM pg_stat_user_tables
        WHERE relname = ${tableName}
      `;
            const stats = statsResult[0];
            if (!stats)
                return recommendations;
            const seqScans = Number(stats.seq_scan);
            const idxScans = Number(stats.idx_scan);
            const rowCount = Number(stats.n_live_tup);
            // High sequential scan ratio on large table
            if (seqScans > 100 && rowCount > 1000 && seqScans > idxScans * 10) {
                // Get most common filter columns from pg_stats
                const columnStats = await prisma.$queryRaw `
          SELECT attname, n_distinct, correlation
          FROM pg_stats
          WHERE tablename = ${tableName}
            AND n_distinct > 0
          ORDER BY n_distinct DESC
          LIMIT 5
        `;
                for (const col of columnStats) {
                    if (Math.abs(col.n_distinct) > 10) {
                        const recommendation = {
                            table: tableName,
                            columns: [col.attname],
                            reason: `High sequential scan ratio (${seqScans}:${idxScans}) with selective column`,
                            estimatedImpact: seqScans > idxScans * 50 ? 'high' : 'medium',
                            suggestedDDL: `CREATE INDEX CONCURRENTLY idx_${tableName}_${col.attname} ON "${tableName}" ("${col.attname}");`,
                            queryPattern: `Frequent scans filtering on ${col.attname}`,
                        };
                        recommendations.push(recommendation);
                    }
                }
            }
        }
        catch (error) {
            log.warn('Failed to analyze table indexes', { table: tableName, error: String(error) });
        }
        return recommendations;
    }
    /**
     * Detect potential N+1 query patterns
     *
     * @param queryHistory - Recent queries with timestamps
     * @returns Detected N+1 patterns
     */
    detectN1Patterns(queryHistory) {
        const patterns = [];
        const windowMs = 1000; // 1 second window
        // Group queries by fingerprint within time windows
        const fingerprints = new Map();
        for (const { query, timestamp } of queryHistory) {
            const fp = this.generateFingerprint(query);
            // Count queries within window
            const key = `${fp}:${Math.floor(timestamp / windowMs)}`;
            fingerprints.set(key, (fingerprints.get(key) ?? 0) + 1);
        }
        // Detect patterns with >5 identical queries in a window
        for (const [key, count] of fingerprints) {
            if (count > 5) {
                const fp = key.split(':')[0];
                patterns.push(`Potential N+1: ${count} similar queries in 1s window (fingerprint: ${fp})`);
            }
        }
        return patterns;
    }
    /**
     * Clear all tracked patterns and recommendations
     */
    clear() {
        this.slowQueryPatterns.clear();
        this.indexRecommendations = [];
        indexRecommendationsGauge.set(0);
    }
    /**
     * Get profiler statistics
     */
    getStats() {
        return {
            trackedPatterns: this.slowQueryPatterns.size,
            indexRecommendations: this.indexRecommendations.length,
            config: this.config,
        };
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    /**
     * Analyze EXPLAIN output
     */
    analyzePlan(query, plan) {
        const operations = {
            seqScans: 0,
            indexScans: 0,
            nestedLoops: 0,
            hashJoins: 0,
            sortOperations: 0,
        };
        const warnings = [];
        const recommendations = [];
        // Traverse plan tree
        this.traversePlan(plan, operations, warnings, recommendations);
        // Calculate complexity score
        const complexityScore = this.calculateComplexity(operations, plan);
        const complexityLevel = this.getComplexityLevel(complexityScore);
        // Record metrics
        queryComplexityHistogram.observe(complexityScore);
        if (complexityScore >= 7) {
            complexQueryCounter.inc();
        }
        // Calculate estimate accuracy
        const actualRows = plan['Actual Rows'] ?? 0;
        const planRows = plan['Plan Rows'] ?? 1;
        const estimateAccuracy = planRows > 0 ? actualRows / planRows : 0;
        return {
            query,
            totalTime: plan['Actual Total Time'] ?? 0,
            planningTime: 0, // Would need BUFFERS option
            executionTime: plan['Actual Total Time'] ?? 0,
            rowsReturned: actualRows,
            warnings,
            recommendations,
            complexity: {
                score: complexityScore,
                level: complexityLevel,
            },
            operations,
            estimateAccuracy,
        };
    }
    /**
     * Traverse plan tree and collect statistics
     */
    traversePlan(node, operations, warnings, recommendations) {
        const nodeType = node['Node Type'];
        // Count operation types
        if (nodeType === 'Seq Scan') {
            operations.seqScans++;
            const table = node['Relation Name'] ?? 'unknown';
            seqScansCounter.inc({ table });
            // Check for large sequential scans
            const rows = node['Actual Rows'] ?? 0;
            if (rows > 1000) {
                warnings.push(`Sequential scan on "${table}" returned ${rows} rows`);
                recommendations.push(`Consider adding an index on "${table}" for filtered columns`);
            }
        }
        else if (nodeType.includes('Index')) {
            operations.indexScans++;
        }
        else if (nodeType === 'Nested Loop') {
            operations.nestedLoops++;
            if (operations.nestedLoops > 3) {
                warnings.push('Multiple nested loops detected - may indicate suboptimal join order');
            }
        }
        else if (nodeType.includes('Hash')) {
            operations.hashJoins++;
        }
        else if (nodeType === 'Sort') {
            operations.sortOperations++;
            // Check for in-memory sort spill
            if (node['Actual Rows'] && node['Actual Rows'] > 10000) {
                warnings.push('Large sort operation - may spill to disk');
                recommendations.push('Consider adding an index for ORDER BY columns');
            }
        }
        // Check for filter inefficiency
        const rowsRemoved = node['Rows Removed by Filter'] ?? 0;
        const actualRows = node['Actual Rows'] ?? 0;
        if (rowsRemoved > 0 && rowsRemoved > actualRows * 10) {
            warnings.push(`Filter removed ${rowsRemoved} rows to return ${actualRows} - consider index on filter columns`);
        }
        // Recurse into child plans
        if (node.Plans) {
            for (const child of node.Plans) {
                this.traversePlan(child, operations, warnings, recommendations);
            }
        }
    }
    /**
     * Calculate query complexity score (1-10)
     */
    calculateComplexity(operations, plan) {
        let score = 1;
        // Sequential scans add complexity
        score += operations.seqScans * 2;
        // Nested loops are expensive
        score += operations.nestedLoops * 1.5;
        // Sorts add complexity
        score += operations.sortOperations;
        // High cost adds complexity
        const cost = plan['Total Cost'] ?? 0;
        if (cost > 10000)
            score += 2;
        else if (cost > 1000)
            score += 1;
        // Cap at 10
        return Math.min(10, Math.max(1, Math.round(score)));
    }
    /**
     * Get complexity level from score
     */
    getComplexityLevel(score) {
        if (score <= 2)
            return 'simple';
        if (score <= 4)
            return 'moderate';
        if (score <= 7)
            return 'complex';
        return 'critical';
    }
    /**
     * Generate fingerprint for query pattern matching
     * Normalizes literals and parameter values
     */
    generateFingerprint(query) {
        return query
            // Remove string literals
            .replace(/'[^']*'/g, '?')
            // Remove numeric literals
            .replace(/\b\d+\b/g, '?')
            // Remove UUIDs
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '?')
            // Normalize whitespace
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase()
            .substring(0, 200);
    }
}
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Get singleton profiler instance
 */
export function getQueryProfiler(config) {
    return QueryProfiler.getInstance(config);
}
/**
 * Track a slow query (convenience function)
 */
export function trackSlowQuery(query, durationMs) {
    getQueryProfiler().trackSlowQuery(query, durationMs);
}
/**
 * Get top slow queries (convenience function)
 */
export function getTopSlowQueries(limit) {
    return getQueryProfiler().getTopSlowQueries(limit);
}
/**
 * Get index recommendations (convenience function)
 */
export function getIndexRecommendations() {
    return getQueryProfiler().getIndexRecommendations();
}
// ============================================================================
// Export
// ============================================================================
export default {
    QueryProfiler,
    getQueryProfiler,
    trackSlowQuery,
    getTopSlowQueries,
    getIndexRecommendations,
};
