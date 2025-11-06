# Query Performance & Optimization Guide

_Created: 2025-11-06T16:35:00Z (UTC) — Status: FINAL_

## Overview

This guide provides comprehensive query optimization strategies for Infinity Gauntlet's PostgreSQL database. It covers index selection, query patterns, caching strategies, and performance monitoring.

## Quick Reference

| Query Type | Target Latency | Strategy | Index |
| --- | --- | --- | --- |
| User profile load | < 50ms | Covering index + cache | `idx_users_discord_profile` |
| Leaderboard (top 100) | < 200ms | Materialized view | `user_stats_mv` |
| Battle history (20 results) | < 100ms | Composite index | `idx_battles_p1_history` |
| Event timeline (50 events) | < 75ms | Partial index | `idx_user_events_timeline` |
| Species lookup | < 10ms | Materialized view + cache | `SpeciesSheet` |
| Active encounters | < 30ms | Partial index | `idx_encounters_active` |

## Index Selection Guide

### When to Use Each Index Type

#### 1. B-Tree Index (Default)
**Use for:**
- Equality comparisons (`WHERE user_id = '...'`)
- Range queries (`WHERE level BETWEEN 1 AND 50`)
- Sorting (`ORDER BY created_at DESC`)
- Pattern matching with prefix (`WHERE slug LIKE 'pikachu%'`)

**Example:**
```sql
CREATE INDEX idx_pokemon_level ON "PokemonInstance" (level);
```

#### 2. Composite Index
**Use for:**
- Multi-column filters (`WHERE owner_id = '...' AND species_id = 25`)
- Sorted queries with filters (`WHERE state = 'Finished' ORDER BY ended_at DESC`)

**Column order matters:**
1. Equality filters first
2. Range filters second
3. Sort columns last

**Example:**
```sql
-- Good: equality (p1_id), equality (state), sort (ended_at)
CREATE INDEX idx_battles_p1_history 
ON "Battle" (p1_id, state, ended_at DESC);

-- Bad: sort first prevents index usage for filters
CREATE INDEX idx_battles_bad 
ON "Battle" (ended_at DESC, p1_id, state);
```

#### 3. Partial Index
**Use for:**
- Queries with consistent WHERE conditions
- Active/hot data only
- Reduces index size and improves performance

**Example:**
```sql
-- Only index last 30 days of events
CREATE INDEX idx_user_events_recent
ON "UserEvent" (user_id, occurred_at DESC)
WHERE occurred_at > NOW() - INTERVAL '30 days';

-- Only index active encounters
CREATE INDEX idx_encounters_active
ON "Encounter" (owner_id, state)
WHERE state IN ('Spawned', 'Idle');
```

#### 4. Covering Index (INCLUDE)
**Use for:**
- Avoid table lookups
- Hot queries that need multiple columns
- Read-heavy workloads

**Example:**
```sql
-- Index covers lookup + display columns
CREATE INDEX idx_users_profile_card
ON "User" (id)
INCLUDE (nickname, avatar_url, total_battles, total_wins);

-- Query uses index-only scan
SELECT id, nickname, avatar_url, total_battles, total_wins
FROM "User"
WHERE id = '...';
```

#### 5. GIN/GiST Index
**Use for:**
- Full-text search
- JSON field searches
- Array containment

**Example:**
```sql
-- Full-text search on bio
CREATE INDEX idx_users_bio_search 
ON "User" USING GIN (to_tsvector('english', bio));

-- Search
SELECT * FROM "User"
WHERE to_tsvector('english', bio) @@ to_tsquery('pokemon & trainer');
```

## Query Patterns

### Pattern 1: Paginated Leaderboards

**Bad (Slow with OFFSET):**
```sql
-- Gets slower as page number increases
SELECT id, nickname, total_battles, total_wins
FROM "User"
ORDER BY total_battles DESC, total_wins DESC
LIMIT 20 OFFSET 1000; -- Page 50
```

**Good (Keyset Pagination):**
```sql
-- Fast at any page depth
SELECT id, nickname, total_battles, total_wins
FROM "User"
WHERE (total_battles, total_wins, id) < (450, 230, 'last_user_id')
ORDER BY total_battles DESC, total_wins DESC, id DESC
LIMIT 20;
```

**Best (Materialized View):**
```sql
-- Pre-computed ranks
SELECT * FROM user_stats_mv
WHERE rank_battles BETWEEN 1000 AND 1020
ORDER BY rank_battles;
```

### Pattern 2: User Activity Timeline

**Bad (Table Scan):**
```sql
SELECT * FROM "UserEvent"
WHERE user_id = '...'
ORDER BY occurred_at DESC
LIMIT 50;
-- Missing index on (user_id, occurred_at)
```

**Good (Index Scan):**
```sql
-- Uses idx_user_events_timeline
SELECT event_type, occurred_at, data, severity
FROM "UserEvent"
WHERE user_id = '...'
  AND occurred_at > NOW() - INTERVAL '30 days'
ORDER BY occurred_at DESC
LIMIT 50;
```

**Best (Category Filter + Partial Index):**
```sql
-- Uses idx_user_events_category_timeline
SELECT event_type, occurred_at, data
FROM "UserEvent"
WHERE user_id = '...'
  AND category = 'gameplay'
  AND occurred_at > NOW() - INTERVAL '7 days'
ORDER BY occurred_at DESC
LIMIT 50;
```

### Pattern 3: Aggregation Queries

**Bad (Full Table Scan):**
```sql
SELECT 
  species_id,
  COUNT(*) as catch_count,
  AVG(level) as avg_level
FROM "PokemonInstance"
GROUP BY species_id
ORDER BY catch_count DESC;
```

**Good (Materialized View):**
```sql
-- Pre-aggregated in species_popularity_mv
SELECT 
  species_id,
  species_name,
  total_caught,
  unique_trainers
FROM species_popularity_mv
ORDER BY total_caught DESC;
```

### Pattern 4: Complex Joins

**Bad (Multiple Joins):**
```sql
SELECT 
  u.id,
  u.nickname,
  COUNT(p.id) as pokemon_count,
  COUNT(ua.achievement_id) as achievements
FROM "User" u
LEFT JOIN "PokemonInstance" p ON p.owner_id = u.id
LEFT JOIN "UserAchievement" ua ON ua.user_id = u.id AND ua.is_completed = true
WHERE u.total_battles > 0
GROUP BY u.id, u.nickname
ORDER BY u.total_battles DESC;
```

**Good (Materialized View):**
```sql
-- Pre-joined in user_stats_mv
SELECT 
  id,
  nickname,
  pokemon_count,
  achievements_unlocked
FROM user_stats_mv
WHERE total_battles > 0
ORDER BY total_battles DESC;
```

## Caching Strategy

### Cache Layers

```
┌─────────────────────────────────────────┐
│  Application Layer (In-Memory Cache)    │
│  - LRU cache (max 10,000 entries)       │
│  - TTL: 5-30 minutes                    │
│  - Hot data: user profiles, species     │
└─────────────────────────────────────────┘
              ↓ (cache miss)
┌─────────────────────────────────────────┐
│  Disk Cache (Store/runtime-cache/)      │
│  - Persistent JSON files                │
│  - TTL: 1-24 hours                      │
│  - Warm data: leaderboards, stats       │
└─────────────────────────────────────────┘
              ↓ (cache miss)
┌─────────────────────────────────────────┐
│  Materialized Views                     │
│  - Pre-aggregated queries               │
│  - Refresh: hourly or on-demand         │
│  - Analytics, leaderboards              │
└─────────────────────────────────────────┘
              ↓ (cache miss)
┌─────────────────────────────────────────┐
│  Database (PostgreSQL)                  │
│  - Indexed queries                      │
│  - Source of truth                      │
└─────────────────────────────────────────┘
```

### Cache TTL by Data Type

| Data Type | In-Memory TTL | Disk TTL | Refresh Strategy |
| --- | --- | --- | --- |
| User profile | 30 minutes | 24 hours | On update |
| Species data | Infinite | Infinite | On dex update |
| Leaderboard | 5 minutes | 1 hour | Scheduled (hourly) |
| Battle history | 15 minutes | 6 hours | On battle completion |
| Event timeline | 10 minutes | 1 hour | On new event |
| Achievement progress | 15 minutes | 6 hours | On achievement update |
| Daily stats | N/A | 24 hours | Scheduled (daily) |

### Cache Invalidation

**Write-Through Pattern:**
```typescript
async function updateUserProfile(userId: string, data: Partial<User>): Promise<void> {
  // 1. Update database
  const user = await prisma.user.update({
    where: { id: userId },
    data
  });
  
  // 2. Invalidate cache
  cache.delete(`user:profile:${userId}`);
  cache.delete(`user:stats:${userId}`);
  
  // 3. Pre-warm cache with new data
  cache.set(`user:profile:${userId}`, user, { ttl: 1800 }); // 30 min
}
```

**Event-Driven Pattern:**
```typescript
// After battle completes
eventBus.publish('battle.completed', {
  battleId: battle.id,
  p1Id: battle.p1Id,
  p2Id: battle.p2Id
});

// Cache invalidation subscriber
eventBus.subscribe('battle.completed', async (event) => {
  cache.delete(`user:battles:${event.p1Id}`);
  cache.delete(`user:battles:${event.p2Id}`);
  cache.delete(`leaderboard:battles:alltime`);
  
  // Schedule materialized view refresh
  scheduleViewRefresh('user_stats_mv', { delay: 60000 }); // 1 minute
});
```

## Performance Monitoring

### Key Metrics

**Query Performance:**
```sql
-- Enable pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 10 slowest queries
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Most frequently called queries
SELECT 
  query,
  calls,
  total_exec_time,
  mean_exec_time
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;
```

**Index Usage:**
```sql
-- Unused indexes (candidates for removal)
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Index hit rate (should be > 99%)
SELECT 
  sum(idx_blks_hit) / sum(idx_blks_hit + idx_blks_read) * 100 as index_hit_rate
FROM pg_statio_user_indexes;
```

**Table Bloat:**
```sql
-- Tables with excessive dead rows
SELECT 
  schemaname,
  tablename,
  n_live_tup,
  n_dead_tup,
  ROUND((n_dead_tup::numeric / NULLIF(n_live_tup, 0)::numeric) * 100, 2) as dead_pct,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;

-- Run VACUUM when dead_pct > 10%
VACUUM ANALYZE "UserEvent";
```

### Query Analysis with EXPLAIN

**Basic EXPLAIN:**
```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM "User"
WHERE total_battles > 100
ORDER BY total_battles DESC
LIMIT 100;
```

**Reading EXPLAIN Output:**

✅ **Good Signs:**
- `Index Scan` or `Index Only Scan`
- `Bitmap Heap Scan` for multiple conditions
- Low actual time (< 10ms for simple queries)
- Rows estimate close to actual rows

❌ **Warning Signs:**
- `Seq Scan` on large tables
- `Sort` operations without index
- Large rows estimate vs actual rows (statistics out of date)
- High buffers read (> 1000 for simple queries)

**Example Good Plan:**
```
Index Scan using idx_users_leaderboard_battles on "User"  (cost=0.29..123.45 rows=100 width=200) (actual time=0.023..1.234 rows=100 loops=1)
  Buffers: shared hit=15
Planning Time: 0.123 ms
Execution Time: 1.456 ms
```

**Example Bad Plan:**
```
Seq Scan on "User"  (cost=0.00..50000.00 rows=10000 width=200) (actual time=0.123..456.789 rows=100 loops=1)
  Filter: (total_battles > 100)
  Rows Removed by Filter: 9900
  Buffers: shared hit=5000
Sort  (cost=12345.67..12345.68 rows=100 width=200) (actual time=234.567..234.567 rows=100 loops=1)
  Sort Key: total_battles DESC
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=5000
Planning Time: 2.123 ms
Execution Time: 234.890 ms
```

### Alerting Thresholds

| Metric | Warning | Critical | Action |
| --- | --- | --- | --- |
| Query latency (p95) | > 500ms | > 2000ms | Review slow query log |
| Index hit rate | < 95% | < 90% | Increase `shared_buffers` |
| Table bloat (dead %) | > 20% | > 50% | Manual VACUUM |
| Connection count | > 70% of max | > 90% of max | Review connection pooling |
| Cache hit rate | < 80% | < 60% | Increase cache size or TTL |
| Materialized view age | > 2 hours | > 6 hours | Force refresh |

## Optimization Checklist

### Before Deploying a Query

- [ ] Run `EXPLAIN ANALYZE` and verify index usage
- [ ] Check estimated rows vs actual rows (should be within 2x)
- [ ] Verify query completes within target latency
- [ ] Consider adding to cache if frequently accessed
- [ ] Add monitoring/alerting for new query pattern

### Before Creating an Index

- [ ] Verify query pattern occurs frequently (> 100 times/day)
- [ ] Check index size won't exceed 30% of table size
- [ ] Consider partial index if WHERE clause is consistent
- [ ] Use CONCURRENTLY for production deployments
- [ ] Monitor index usage after creation

### After Schema Changes

- [ ] Run `ANALYZE` on affected tables
- [ ] Verify query plans haven't regressed
- [ ] Check for missing indexes on new columns
- [ ] Update materialized views if structure changed
- [ ] Clear application caches

## Common Anti-Patterns

### ❌ Anti-Pattern 1: SELECT *
```sql
-- Bad: Fetches unnecessary data
SELECT * FROM "User" WHERE id = '...';

-- Good: Only fetch needed columns
SELECT id, nickname, avatar_url FROM "User" WHERE id = '...';
```

### ❌ Anti-Pattern 2: N+1 Queries
```typescript
// Bad: N+1 query problem
const users = await prisma.user.findMany();
for (const user of users) {
  const pokemon = await prisma.pokemonInstance.findMany({
    where: { ownerId: user.id }
  });
}

// Good: Single query with join
const users = await prisma.user.findMany({
  include: { pokemon: true }
});
```

### ❌ Anti-Pattern 3: Using OR Instead of IN
```sql
-- Bad: Prevents index usage
SELECT * FROM "PokemonInstance"
WHERE species_id = 25 OR species_id = 26 OR species_id = 27;

-- Good: Uses index efficiently
SELECT * FROM "PokemonInstance"
WHERE species_id IN (25, 26, 27);
```

### ❌ Anti-Pattern 4: Functions in WHERE Clause
```sql
-- Bad: Prevents index usage
SELECT * FROM "User"
WHERE LOWER(nickname) = 'ash';

-- Good: Use functional index
CREATE INDEX idx_users_nickname_lower ON "User" (LOWER(nickname));
SELECT * FROM "User" WHERE LOWER(nickname) = 'ash';

-- Better: Store lowercase version
SELECT * FROM "User" WHERE nickname = 'ash'; -- assuming lowercase storage
```

### ❌ Anti-Pattern 5: Large OFFSET
```sql
-- Bad: Gets exponentially slower
SELECT * FROM "Battle"
ORDER BY ended_at DESC
LIMIT 20 OFFSET 10000; -- Page 500

-- Good: Keyset pagination
SELECT * FROM "Battle"
WHERE ended_at < '2025-11-01T00:00:00Z'
ORDER BY ended_at DESC
LIMIT 20;
```

## Maintenance Schedule

### Daily
- Monitor slow query log
- Check alert thresholds
- Review error rate in UserEvent table

### Weekly
- Review index usage stats
- Check table bloat percentages
- Verify cache hit rates
- Run ANALYZE on high-churn tables

### Monthly
- Review and remove unused indexes
- Optimize query patterns based on pg_stat_statements
- Update query performance targets
- Refresh materialized views during maintenance window

### Quarterly
- Full VACUUM on large tables
- Reindex tables with high bloat
- Review and update caching strategy
- Load testing with production-like data

---

**Related Documents:**
- `prisma/migrations/northstar_indexes.sql` — Index definitions
- `docs/database-systems.md` — Database architecture
- `docs/schema-northstar-optimization.md` — Overall optimization plan
- `src/services/cache/` — Caching implementation

**Revision History:**
- 2025-11-06T16:35:00Z — Initial version (Rev 1.0)
