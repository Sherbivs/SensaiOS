# Query Optimization Patterns — Infinity Gauntlet

**Document:** Query Profiling & Optimization Guide  
**Section:** Operations Bible - Performance  
**Created:** 2025-12-04  
**Status:** ✅ Active

---

## Overview

This guide documents query optimization patterns, profiling tools, and best practices for maintaining database performance in the Infinity Gauntlet system.

## Query Profiler Service

### Location
`src/services/query-profiler.ts`

### Features
- **EXPLAIN ANALYZE Integration** — Deep query plan analysis
- **Slow Query Pattern Tracking** — Aggregate patterns for optimization
- **Index Recommendations** — Automatic missing index detection
- **N+1 Detection** — Pattern analysis for common anti-patterns
- **Complexity Scoring** — 1-10 score for query complexity assessment

### Basic Usage

```typescript
import { getQueryProfiler, trackSlowQuery, getTopSlowQueries } from '../services/query-profiler.js';

// Track slow queries (called automatically by Prisma integration)
trackSlowQuery('SELECT * FROM "Trainer" WHERE "discordId" = $1', 150);

// Get top 10 slowest query patterns
const slowPatterns = getTopSlowQueries(10);
for (const pattern of slowPatterns) {
  console.log(`${pattern.fingerprint}: ${pattern.count} calls, avg ${pattern.avgTime}ms`);
}

// Get index recommendations
const recommendations = getIndexRecommendations();
for (const rec of recommendations) {
  console.log(`Suggested: ${rec.suggestedDDL}`);
  console.log(`Reason: ${rec.reason}`);
}
```

### EXPLAIN ANALYZE (Development Only)

```typescript
const profiler = getQueryProfiler({ enableExplainAnalyze: true });

// Analyze specific query
const analysis = await profiler.analyzeQuery(
  prisma,
  `SELECT t.*, COUNT(p.id) as pokemon_count 
   FROM "Trainer" t 
   LEFT JOIN "Pokemon" p ON p."ownerId" = t.id 
   GROUP BY t.id`
);

console.log('Complexity:', analysis.complexity.level);
console.log('Warnings:', analysis.warnings);
console.log('Recommendations:', analysis.recommendations);
```

⚠️ **Warning:** EXPLAIN ANALYZE runs the query. Only use in development/staging.

---

## Query Complexity Scoring

| Score | Level | Description | Action Required |
|-------|-------|-------------|-----------------|
| 1-2 | Simple | Basic CRUD operations | None |
| 3-4 | Moderate | Joins, simple aggregations | Monitor |
| 5-6 | Complex | Multiple joins, subqueries | Review |
| 7-8 | High | Many operations, large scans | Optimize |
| 9-10 | Critical | Performance risk | Immediate optimization |

### Complexity Factors
- Sequential scans (+2 per scan)
- Nested loops (+1.5 per loop)
- Sort operations (+1 per sort)
- High cost estimates (+1-2)

---

## Common Optimization Patterns

### 1. Add Missing Indexes

**Problem:** Sequential scans on large tables

```sql
-- Detect tables with high seq scan ratio
SELECT 
  relname,
  seq_scan,
  idx_scan,
  seq_tup_read,
  CASE WHEN seq_scan > 0 
    THEN seq_tup_read / seq_scan 
    ELSE 0 
  END as avg_rows_per_scan
FROM pg_stat_user_tables
WHERE seq_scan > 100
ORDER BY seq_tup_read DESC;
```

**Solution:** Add index on filtered columns

```sql
-- Create index concurrently (non-blocking)
CREATE INDEX CONCURRENTLY idx_trainer_discord_id 
ON "Trainer" ("discordId");
```

### 2. Use Covering Indexes

**Problem:** Index lookup followed by table fetch

**Solution:** Include commonly selected columns

```sql
CREATE INDEX idx_pokemon_owner_species 
ON "Pokemon" ("ownerId") 
INCLUDE ("speciesId", "nickname", "level");
```

### 3. Avoid N+1 Queries

**Problem Pattern:**
```typescript
// BAD: N+1 queries
const trainers = await prisma.trainer.findMany();
for (const trainer of trainers) {
  const pokemon = await prisma.pokemon.findMany({
    where: { ownerId: trainer.id }
  });
}
```

**Solution:**
```typescript
// GOOD: Single query with include
const trainers = await prisma.trainer.findMany({
  include: { pokemon: true }
});

// GOOD: Or use repository pattern
const trainers = await trainerRepository.findWithPokemon();
```

### 4. Pagination Best Practices

**Problem:** OFFSET pagination degrades at scale

```typescript
// BAD: Slow for large offsets
await prisma.pokemon.findMany({
  skip: 10000,
  take: 50
});
```

**Solution:** Cursor-based pagination

```typescript
// GOOD: Cursor pagination
const results = await pokemonRepository.findPaginated({
  cursor: lastPokemonId,
  take: 50,
  orderBy: { id: 'asc' }
});
```

### 5. Selective Column Loading

**Problem:** SELECT * loading unnecessary data

**Solution:** Select only needed columns

```typescript
// GOOD: Select specific columns
const trainers = await prisma.trainer.findMany({
  select: {
    id: true,
    discordId: true,
    name: true,
    // Don't include large JSON fields unless needed
  }
});
```

---

## Index Strategy Reference

### Existing Critical Indexes

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| Trainer | idx_trainer_discord_id | discordId | Discord lookup |
| Pokemon | idx_pokemon_owner | ownerId | Team loading |
| Battle | idx_battle_status | status | Active battle queries |
| Encounter | idx_encounter_active | guildId, status | Active encounters |
| ErrorLog | idx_error_fingerprint | fingerprint | Deduplication |

### When to Add Indexes

✅ **Add index when:**
- Column frequently in WHERE clause
- Column used in JOIN conditions
- Column used in ORDER BY with LIMIT
- High cardinality (many distinct values)

❌ **Avoid indexes when:**
- Table is small (<1000 rows)
- Column has low cardinality
- Table has frequent writes, rare reads
- Column rarely filtered/sorted

### Index Creation Checklist

```sql
-- 1. Check if index exists
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'YourTable';

-- 2. Analyze table first
ANALYZE "YourTable";

-- 3. Create CONCURRENTLY (non-blocking)
CREATE INDEX CONCURRENTLY idx_name ON "YourTable" ("column");

-- 4. Verify index is used
EXPLAIN (ANALYZE) SELECT * FROM "YourTable" WHERE "column" = 'value';
```

---

## Prometheus Metrics

The query profiler exports these metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `infinity_gauntlet_query_seq_scans_total` | Counter | Sequential scans by table |
| `infinity_gauntlet_query_complex_queries_total` | Counter | Queries with complexity ≥7 |
| `infinity_gauntlet_query_index_recommendations` | Gauge | Pending recommendations |
| `infinity_gauntlet_query_complexity_score` | Histogram | Complexity distribution |

### Grafana Dashboard Query

```promql
# Sequential scan rate by table
rate(infinity_gauntlet_query_seq_scans_total[5m])

# Complex query rate
rate(infinity_gauntlet_query_complex_queries_total[5m])

# 95th percentile complexity
histogram_quantile(0.95, rate(infinity_gauntlet_query_complexity_score_bucket[5m]))
```

---

## Alert Rules

```yaml
# prometheus-alerts.yml additions
groups:
  - name: query_performance
    rules:
      - alert: HighSequentialScanRate
        expr: rate(infinity_gauntlet_query_seq_scans_total[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High sequential scan rate detected
          
      - alert: CriticalQueryComplexity
        expr: rate(infinity_gauntlet_query_complex_queries_total[5m]) > 5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: Many complex queries detected
```

---

## Repository Pattern Integration

The repository pattern automatically uses optimized query patterns:

```typescript
// BaseRepository provides optimized pagination
const results = await trainerRepository.findPaginated({
  page: 1,
  pageSize: 50,
  filters: { isActive: { equals: true } },
  orderBy: { createdAt: 'desc' }
});

// Automatically:
// - Uses cursor pagination internally
// - Applies proper indexes
// - Selects only needed columns
// - Tracks slow queries
```

---

## Troubleshooting Slow Queries

### Step 1: Identify Slow Queries

```typescript
// Get top slow query patterns
const patterns = getTopSlowQueries(10);
console.table(patterns.map(p => ({
  fingerprint: p.fingerprint.substring(0, 50),
  count: p.count,
  avgMs: Math.round(p.avgTime),
  maxMs: Math.round(p.maxTime)
})));
```

### Step 2: Analyze Query Plan

```sql
-- In psql or database tool
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ... your slow query ...;
```

### Step 3: Look for Red Flags

- `Seq Scan` on large tables
- `Nested Loop` with high row counts
- `Sort` with large memory
- Poor row estimates (actual >> planned)

### Step 4: Apply Optimization

1. Add index for filter columns
2. Rewrite with better join order
3. Add covering index for common selects
4. Use pagination for large results

### Step 5: Verify Improvement

```typescript
// Before optimization
trackSlowQuery(query, beforeMs);

// After optimization
trackSlowQuery(query, afterMs);

// Compare patterns
console.log(`Improvement: ${beforeMs - afterMs}ms (${((beforeMs - afterMs) / beforeMs * 100).toFixed(1)}%)`);
```

---

## See Also

- [Prepared Statement Guide](../projects/database-centric/prepared-statement-guide.md)
- [Connection Health Monitoring](./connection-troubleshooting.md)
- [Database Onboarding](../development-bible/09-database-onboarding.md)
- [Schema Health Audit](../architecture-bible/schema-health-audit-2025-12-04.md)

---

**Last Updated:** 2025-12-04T16:30:00Z
