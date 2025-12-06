# Prepared Statement Caching & Query Optimization

**Purpose:** Document Prisma query behavior, prepared statement patterns, and optimization best practices  
**Part of:** Database-Centric Development Plan (Sprint 3, P2-006)  
**Last Updated:** 2025-12-04

---

## Table of Contents

1. [Overview](#overview)
2. [How Prisma Handles Prepared Statements](#how-prisma-handles-prepared-statements)
3. [Query Patterns for Statement Reuse](#query-patterns-for-statement-reuse)
4. [Connection String Configuration](#connection-string-configuration)
5. [Query Performance Monitoring](#query-performance-monitoring)
6. [Optimization Best Practices](#optimization-best-practices)
7. [Metrics & Observability](#metrics--observability)

---

## Overview

Prisma 7 with the `@prisma/adapter-pg` driver adapter communicates with PostgreSQL using parameterized queries. Unlike raw SQL with explicit `PREPARE/EXECUTE` statements, Prisma abstracts this away while still benefiting from PostgreSQL's automatic prepared statement caching.

### Key Concepts

| Term | Description |
|------|-------------|
| **Parameterized Query** | SQL with `$1, $2, ...` placeholders - prevents SQL injection |
| **Prepared Statement** | Pre-compiled query plan cached by PostgreSQL |
| **Plan Cache** | PostgreSQL's internal cache of compiled query plans |
| **Connection-Level Caching** | Plans cached per connection (cleared on disconnect) |

---

## How Prisma Handles Prepared Statements

### Prisma 7 with pg Driver Adapter

When using `@prisma/adapter-pg`, Prisma generates parameterized queries:

```sql
-- Prisma generates this:
SELECT "id", "discordId", "username" 
FROM "Trainer" 
WHERE "discordId" = $1

-- NOT this (SQL injection vulnerable):
SELECT "id", "discordId", "username" 
FROM "Trainer" 
WHERE "discordId" = '123456789'
```

### PostgreSQL Automatic Caching

PostgreSQL automatically caches prepared statements when:

1. **Same query structure** is executed multiple times
2. **Connection persists** (plan cache is per-connection)
3. **Query complexity** warrants caching (simple queries may not be cached)

```sql
-- PostgreSQL internal behavior:
-- 1st execution: Parse → Plan → Execute → Cache plan
-- 2nd+ execution: Execute (plan retrieved from cache)
```

### Connection Pooling Impact

Our pool configuration affects statement caching:

```typescript
// From database-pool-config.ts
const POOL_CONFIG = {
  main_bot: { min: 3, max: 10 },
  outbox: { min: 1, max: 3 },
  // ...
};
```

- **Longer-lived connections** = Better statement cache utilization
- **Min connections > 0** = Some connections always warm
- **Idle timeout** balances cache warmth vs resource usage

---

## Query Patterns for Statement Reuse

### ✅ Good: Consistent Query Shapes

```typescript
// Same query structure = plan reuse
const trainers = await prisma.trainer.findMany({
  where: { coins: { gte: amount } },  // Parameter varies, structure same
  orderBy: { coins: "desc" },
  take: 10
});
```

### ❌ Avoid: Dynamic Query Construction

```typescript
// Different structure each time = no plan reuse
const where: any = {};
if (condition1) where.coins = { gte: 100 };
if (condition2) where.username = { contains: "ash" };
if (condition3) where.createdAt = { gte: someDate };

// Each combination generates different SQL
await prisma.trainer.findMany({ where });
```

### ✅ Better: Standardized Query Methods

```typescript
// Repository methods ensure consistent query shapes
class TrainerRepository {
  async findByCoinsAbove(amount: number) {
    return this.prisma.trainer.findMany({
      where: { coins: { gte: amount } },
      orderBy: { coins: "desc" }
    });
  }
  
  async searchByUsername(pattern: string) {
    return this.prisma.trainer.findMany({
      where: { username: { contains: pattern, mode: "insensitive" } }
    });
  }
}
```

### Include Patterns

```typescript
// ✅ Consistent includes = same query shape
const withParty = await prisma.trainer.findUnique({
  where: { id: trainerId },
  include: {
    party: { include: { pokemon: true } },
    profile: true
  }
});

// ❌ Conditional includes = different shapes
const include: any = { profile: true };
if (needParty) include.party = { include: { pokemon: true } };
// May generate different SQL each time
```

---

## Connection String Configuration

### Current Configuration (Render)

```bash
# Direct connection to Render-managed PostgreSQL
PROD_DATABASE_URL=postgresql://user:pass@host:5432/db

# Prisma applies pool parameters via query string:
# ?statement_cache_size=100  (default)
# ?prepared_statement_cache=true (default for @prisma/adapter-pg)
```

### PostgreSQL Parameters

These parameters affect prepared statement behavior:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `plan_cache_mode` | auto | auto, force_generic_plan, force_custom_plan |
| `statement_cache_size` | 100 | Max cached statements per connection |

### Monitoring Plan Cache

```sql
-- Check if plan caching is effective (requires pg_stat_statements extension)
SELECT 
  query,
  calls,
  mean_exec_time,
  rows
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;
```

---

## Query Performance Monitoring

### Current Implementation

Slow query logging is implemented in `src/shared/prisma.ts`:

```typescript
// Logs queries exceeding 100ms threshold
(baseClient as any).$on('query', (e: any) => {
  const duration = e.duration;
  if (duration > 100) {
    log.warn('Slow query detected', {
      duration,
      query: e.query,
      params: e.params,
      target: e.target,
      timestamp: e.timestamp
    });
  }
});
```

### Environment Configuration

```bash
# Configure slow query threshold
SLOW_QUERY_THRESHOLD_MS=100  # Default: 100ms

# Enable verbose query logging (development only)
PRISMA_LOG_LEVEL=query  # Options: query, info, warn, error
```

### What to Look For

1. **Repeated Slow Queries** → Candidate for index optimization
2. **N+1 Patterns** → Need eager loading with `include`
3. **Full Table Scans** → Missing index or inefficient WHERE clause
4. **Large Result Sets** → Add pagination or filtering

---

## Optimization Best Practices

### 1. Use Repository Pattern

Repository methods ensure consistent query shapes:

```typescript
// ✅ Centralized query definitions
class PokemonRepository extends BaseRepository<Pokemon> {
  // This query shape is always the same
  async findByTrainerForBattle(trainerId: string) {
    return this.prisma.pokemon.findMany({
      where: { 
        trainerId,
        currentHp: { gt: 0 }
      },
      orderBy: { level: "desc" },
      include: { species: true }
    });
  }
}
```

### 2. Standardize Includes

Define common include patterns as constants:

```typescript
// In pokemon-repository.ts
const POKEMON_WITH_DETAILS = {
  species: true,
  trainer: { select: { id: true, username: true } },
  heldItem: true
} as const;

// Reused across methods
async findByIdWithDetails(id: string) {
  return this.prisma.pokemon.findUnique({
    where: { id },
    include: POKEMON_WITH_DETAILS
  });
}
```

### 3. Avoid `select` When Possible

`select` creates unique query shapes:

```typescript
// ❌ Each select combination = different query
const minimal = await prisma.trainer.findUnique({
  where: { id },
  select: { id: true, username: true }
});

// ✅ Fetch full entity, use TypeScript to restrict usage
const trainer = await trainerRepo.findById(id);
const { id, username } = trainer; // TypeScript handles
```

### 4. Batch Similar Operations

```typescript
// ❌ Many individual queries
for (const id of pokemonIds) {
  await prisma.pokemon.update({ where: { id }, data: { currentHp: 0 } });
}

// ✅ Single batched query
await prisma.pokemon.updateMany({
  where: { id: { in: pokemonIds } },
  data: { currentHp: 0 }
});
```

### 5. Use `findFirst` Instead of `findMany()[0]`

```typescript
// ❌ Fetches all then takes first
const active = (await prisma.battle.findMany({
  where: { status: "ACTIVE", trainerId }
}))[0];

// ✅ Database limits to 1 row
const active = await prisma.battle.findFirst({
  where: { status: "ACTIVE", trainerId }
});
```

---

## Metrics & Observability

### Available Metrics

From `src/services/database-metrics.ts`:

```typescript
// Query latency histogram
db_query_duration_seconds_bucket{operation="findMany", le="0.1"}
db_query_duration_seconds_bucket{operation="findMany", le="0.5"}
db_query_duration_seconds_bucket{operation="findMany", le="1.0"}

// Slow query counter
db_slow_queries_total{threshold="100ms"}

// Connection pool stats (indicator of cache efficiency)
db_pool_connections_acquired
db_pool_connections_idle
```

### Grafana Dashboard Panels

Recommended panels for monitoring query performance:

1. **Query Latency Percentiles** (p50, p95, p99)
2. **Slow Query Rate** (queries/minute > 100ms)
3. **Query Operation Distribution** (findMany, findUnique, update, etc.)
4. **Pool Connection Lifetime** (longer = better cache utilization)

### Query Analysis Query

Run periodically to identify optimization candidates:

```sql
-- Requires pg_stat_statements extension
SELECT 
  substring(query, 1, 100) as query_preview,
  calls,
  total_exec_time / calls as avg_time_ms,
  rows / NULLIF(calls, 0) as avg_rows
FROM pg_stat_statements
WHERE calls > 100
  AND total_exec_time / calls > 50  -- Avg > 50ms
ORDER BY total_exec_time DESC
LIMIT 20;
```

---

## Summary

### Key Takeaways

1. **Prisma uses parameterized queries** → PostgreSQL caches plans automatically
2. **Consistent query shapes** → Better plan cache utilization
3. **Repository pattern** → Standardizes queries for optimal caching
4. **Pool configuration** → Longer connections = warmer caches
5. **Slow query monitoring** → Already implemented (100ms threshold)

### What We Don't Need

- ❌ Manual `PREPARE/EXECUTE` statements (Prisma handles this)
- ❌ Custom statement cache layer (PostgreSQL does this)
- ❌ Query plan forcing (auto mode works well for most cases)

### What We Have

- ✅ Parameterized queries (SQL injection protection)
- ✅ Slow query logging (>100ms threshold)
- ✅ Repository pattern (consistent query shapes)
- ✅ Connection pooling (maintains warm connections)
- ✅ Query metrics (Prometheus integration)

---

## References

- [Prisma Query Engine](https://www.prisma.io/docs/concepts/components/prisma-engines/query-engine)
- [PostgreSQL Prepared Statements](https://www.postgresql.org/docs/current/sql-prepare.html)
- [Database Pool Config](../../src/config/database-pool-config.ts)
- [Database Metrics](../../src/services/database-metrics.ts)
- [ADR-003: Session-Aware Client](adrs/ADR-003-session-aware-client.md)

---

**Document Status:** Complete  
**Reviewed By:** Database Specialist, Performance Specialist  
**Part of:** Database-Centric Development Plan Sprint 3
