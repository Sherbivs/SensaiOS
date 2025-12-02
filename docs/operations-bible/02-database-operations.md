# Section 2: Database Operations

[← Back to INDEX](INDEX.md) | [← Previous: Service Matrix](01-service-matrix.md) | [Next: Deployment Procedures →](03-deployment-procedures.md)

---

**Philosophy**: "The database is the single source of truth—connection strings are sacred, migrations are deliberate, naming is canonical."

**Purpose**: [CRITICAL] Database URL selection, connections, naming conventions, CLI tools, on-premise setup, and optimization.

## 2.1 URL Selection [ABSOLUTE - CRITICAL]

**Contract Status:** Absolute Requirement (see Patch.md) — **violations cause production failures.**

### The Architecture (2025-11-08)

Production uses **unified Render-managed PostgreSQL** (infinity-gauntlet-db):

- **PROD_DATABASE_URL** → PRIMARY for ALL operations (gameplay, migrations, admin commands)
- **RENDER_DB_EXTERNAL_URL** → Direct PostgreSQL access (external connections, same database)
- **DATABASE_ONPREMISE_DEV_PRIMARY** → OPTIONAL Workstation mirror (offline fallback only)

**There is NO separate DEV database in production.** All services connect to the same Render-managed database.

### Environment Variables

| Variable | Protocol | Purpose | Access Point | Port |
|----------|----------|---------|--------------|------|
| `PROD_DATABASE_URL` | `postgresql://` | **PRIMARY** production database | Render managed | Cloud |
| `RENDER_DB_EXTERNAL_URL` | `postgresql://` | Direct PostgreSQL access (same DB) | External | Cloud |
| `DATABASE_ONPREMISE_DEV_PRIMARY` | `postgresql://` | Workstation mirror (offline fallback) | Localhost | 55433 |
| `DATABASE_ONPREMISE_DEV_EXPERIMENT` | `postgresql://` | Migration testing (isolated) | Localhost | 55434 |

### Canonical URL Selection Logic

```typescript
// UNIFIED ARCHITECTURE: Production uses single Render-managed database
function selectDatabaseUrl(envVars: Record<string, string>): string {
  // Priority: PROD_DATABASE_URL → RENDER_DB_EXTERNAL_URL → LOCAL fallback
  return (
    envVars.PROD_DATABASE_URL ?? 
    envVars.RENDER_DB_EXTERNAL_URL ?? 
    envVars.RENDER_DB_INTERNAL_URL ??
    envVars.DATABASE_ONPREMISE_DEV_PRIMARY ??
    ""
  );
}
```

**Quick Reference:**

| Operation | Environment | URL Variable | Database | Port |
|-----------|-------------|--------------|----------|------|
| **ALL production operations** | Production | `PROD_DATABASE_URL` | Render managed (PRIMARY) | Cloud |
| **Migrations** | ALL | `PROD_DATABASE_URL` | Render managed | Cloud |
| **Offline dev** (optional) | Local | `DATABASE_ONPREMISE_DEV_PRIMARY` | Workstation mirror | 55433 |
| **Migration testing** (optional) | Local | `DATABASE_ONPREMISE_DEV_EXPERIMENT` | Isolated test DB | 55434 |

### Critical Rules

#### ✅ DO

1. **Production operations** → Use `PROD_DATABASE_URL` (Render managed database)
2. **All migrations** → Use `PROD_DATABASE_URL` (single source of truth)
3. **Offline development** → Use `DATABASE_ONPREMISE_DEV_PRIMARY` (workstation mirror)
4. **Migration testing** → Use `DATABASE_ONPREMISE_DEV_EXPERIMENT` (isolated experiments)
5. **Verify URL before operations** → Run `npm run db:cli -- status` to confirm connection

#### ❌ DON'T

1. **Never** use deprecated variables (`DEV_DATABASE_URL`, `LOCAL_DATABASE_URL`)
2. **Never** run migrations against on-premise databases expecting cloud visibility
3. **Never** assume on-premise databases replicate to cloud automatically (they don't)
4. **Never** hardcode connection strings (use environment variables)
5. **Never** commit database URLs to git (use external env file)

### Architecture Diagram (Unified Mode)

```
Production (Render)          Workstation (OFFLINE - Optional)
-------------------          --------------------------------

Infinity-Gauntlet-DB ───┐     ONPREMISE-DEV-PRIMARY DB
(Render managed)        │     Port: 55433 (localhost only)
PROD_DATABASE_URL       │     URL: DATABASE_ONPREMISE_DEV_PRIMARY
RENDER_DB_EXTERNAL_URL  │     Sync: PULL from Render (one-way)
                        │     Purpose: Offline development
All services connect    │              │
here                    │              │ Manual Clone
                        ▼              ▼
                   Downloads to    ONPREMISE-DEV-EXPERIMENT
                   workstation     Port: 55434 (localhost only)
                                  URL: DATABASE_ONPREMISE_DEV_EXPERIMENT
                                  Sync: MANUAL clone (isolated testing)
                                  Purpose: Migration testing

                                  │
                                  │ EXPLICIT PUSH (when ready)
                                  ▼
                             Upload to Render DB
                             (migrations, schema changes)
```

**CRITICAL:** Both on-premise databases are **completely offline**. Production cannot see or access either database. Changes reach production only via **explicit push to Render database**.

## 2.2 Database Connections

### Runtime Clients (Three Prisma Clients)

```typescript
import { prisma, onPremiseDevPrisma, onPremiseExperimentPrisma } from "./shared/prisma.js";

// PRIMARY: Unified Render-managed PostgreSQL (all production operations)
const prodUsers = await prisma.user.findMany(); // PROD_DATABASE_URL

// OPTIONAL: Workstation development (offline fallback)
if (onPremiseDevPrisma) {
  const localUsers = await onPremiseDevPrisma.user.findMany(); // DATABASE_ONPREMISE_DEV_PRIMARY
}

// OPTIONAL: Migration testing (isolated experiments)
if (onPremiseExperimentPrisma) {
  const experimentUsers = await onPremiseExperimentPrisma.user.findMany(); // DATABASE_ONPREMISE_DEV_EXPERIMENT
}
```

### Connection Lifecycle

**Startup (src/index.ts):**
1. Load environment variables
2. Initialize PRIMARY Prisma client (`prisma`)
3. Optional: Initialize LOCAL clients (`onPremiseDevPrisma`, `onPremiseExperimentPrisma`)
4. Test connections with `$queryRaw`
5. Start heartbeat monitoring (30s interval)

**Runtime:**
- PRIMARY client handles all gameplay, battles, encounters
- Heartbeat monitoring emits `database.heartbeat` events
- Connection failures trigger `database.error` events

**Shutdown:**
- Graceful disconnect on SIGTERM/SIGINT
- Flush pending transactions
- Close connections cleanly

### Heartbeat Monitoring

```typescript
// src/shared/prisma.ts
setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    log.info("Database heartbeat", { status: "healthy" });
  } catch (error) {
    log.error("Database heartbeat failed", { error });
  }
}, 30000); // 30 seconds
```

**Benefits:**
- Early detection of connection failures
- Automatic reconnection attempts
- Metrics visibility via `/ops stats`

### Connection Pooling

**Status:** DISABLED (direct PostgreSQL mode)

**Reason:** Render-managed PostgreSQL provides sufficient connection capacity without pooling overhead.

**Future:** Consider pgBouncer if connection count exceeds database limits (>100 concurrent connections).

## 2.3 Naming Schema [ABSOLUTE - CANONICAL TERMS]

**Canonical Database Names:**

- **CLOUD-PROD-MASTER** (`PROD_DATABASE_URL`) — Production database (Render managed)
- **ONPREMISE-DEV-PRIMARY** (`DATABASE_ONPREMISE_DEV_PRIMARY`) — Workstation development
- **ONPREMISE-DEV-EXPERIMENT** (`DATABASE_ONPREMISE_DEV_EXPERIMENT`) — Migration testing

**NEVER use:** "local", "LOCAL", "PRIMARY LOCAL", "EXPERIMENTAL", "DEV_DATABASE_URL" (deprecated)

**Environment Variable Spelling:**
- ✅ `PROD_DATABASE_URL`
- ✅ `DATABASE_ONPREMISE_DEV_PRIMARY`
- ✅ `DATABASE_ONPREMISE_DEV_EXPERIMENT`
- ❌ `DEV_DATABASE_URL` (deprecated)
- ❌ `LOCAL_DATABASE_URL` (never existed)

## 2.4 Database CLI Tools

**Primary Tool:** `npm run db:cli` — Unified database operations interface

### Commands

```bash
# Connection info + sample counts
npm run db:cli -- status

# Common table counts (Species, BusMessage, etc.)
npm run db:cli -- counts

# Single-table helpers
npm run db:cli -- count Species

# Custom SQL queries
npm run db:cli -- query "SELECT COUNT(*) FROM \"Species\";"

# Target selection (default: PRIMARY production database)
npm run db:cli -- status --target prod        # PRIMARY database (PROD_DATABASE_URL)
npm run db:cli -- status --target local       # Workstation mirror (DATABASE_ONPREMISE_DEV_PRIMARY)
npm run db:cli -- status --target experiment  # Isolated test DB (DATABASE_ONPREMISE_DEV_EXPERIMENT)
```

### Status Output Example

```
═══════════════════════════════════════════════════════════
   DATABASE STATUS — PROD
═══════════════════════════════════════════════════════════

Connection: healthy
URL: postgresql://user@render-host/infinity_gauntlet_db
Latency: 45ms (last query)

Sample Counts:
  Species: 493
  Move: 825
  TrainerProfile: 142
  Party: 142
  Pokemon: 856
  BusMessage: 23
  
Storage: 42.3 MB / 500 MB (8.5%)
```

### Query Instrumentation

**Slow Query Detection** (>100ms auto-logged):

```typescript
// src/shared/prisma.ts
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;
  
  if (duration > 100) {
    log.warn("Slow query detected", {
      duration,
      model: params.model,
      action: params.action
    });
  }
  
  return result;
});
```

**N+1 Detection** (consecutive similar queries logged):

- Tracks consecutive queries to same model
- Warns when >5 similar queries in 100ms window
- Suggests batch loading with Prisma `include`

## 2.5 On-Premise Database Setup (Optional - Offline Development)

**Purpose:** Mirror Render database to workstation for offline development and migration testing.

### Two-Database Architecture

| Database | Port | Purpose | Sync |
|----------|------|---------|------|
| **ONPREMISE-DEV-PRIMARY** | 55433 | Offline development with production-like data | PULL from Render (one-way) |
| **ONPREMISE-DEV-EXPERIMENT** | 55434 | Migration testing (isolated, safe) | MANUAL clone from PRIMARY |

**CRITICAL:** Both databases are **localhost-only**. Production cannot see or access them. Changes reach production only via **explicit push to Render database**.

### Bootstrap Commands

```bash
# Bootstrap ONPREMISE-DEV-PRIMARY database (port 55433) - mirrors Render database
npm run ops:bootstrap-onpremise-dev

# Bootstrap ONPREMISE-DEV-EXPERIMENT database (port 55434) from PRIMARY
npm run ops:bootstrap-onpremise-experiment

# Bootstrap ONPREMISE-DEV-EXPERIMENT from cloud (downloads from Render)
npm run ops:bootstrap-onpremise-experiment -- --source cloud

# Sync ONPREMISE-DEV-EXPERIMENT from PRIMARY (offline sync, default)
npm run ops:sync-onpremise-experiment

# Start/Stop ONPREMISE-DEV-EXPERIMENT cluster
npm run ops:start-onpremise-experiment
npm run ops:stop-onpremise-experiment

# Show status of both databases (running state, row counts)
npm run ops:status-onpremise-dbs
```

### Migration Testing Workflow

```bash
# Step 1: Ensure ONPREMISE-DEV-PRIMARY is up-to-date
npm run ops:bootstrap-onpremise-dev

# Step 2: Clone PRIMARY to EXPERIMENT (100% OFFLINE)
npm run ops:bootstrap-onpremise-experiment

# Step 3: Test migration on EXPERIMENT (100% OFFLINE)
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_migration_name/migration.sql

# Step 4: Validate migration results (100% OFFLINE)
npm run db:cli -- count User --target experiment
npm run db:cli -- query "SELECT COUNT(*) FROM \"TrainerProfile\";" --target experiment

# Step 5: Test rollback if needed (100% OFFLINE)
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_migration_name/rollback.sql

# Step 6: Validate on PRIMARY if successful (100% OFFLINE)
npm run ops:sync-onpremise-experiment --from local
psql postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db \
  -f prisma/migrations/20251108183000_migration_name/migration.sql

# Step 7: ONLY AFTER LOCAL VALIDATION - Push to Render (CLOUD OPERATION)
psql $PROD_DATABASE_URL -f prisma/migrations/20251108183000_migration_name/migration.sql
```

**Key Points:**
- Steps 1-6 are completely offline (no cloud connections)
- ONPREMISE-DEV-PRIMARY downloads from Render (one-way PULL)
- ONPREMISE-DEV-EXPERIMENT never connects to cloud (fully isolated)
- Changes reach production only via explicit push in Step 7

See [docs/dual-onpremise-database-guide.md](../database/dual-onpremise-database-guide.md) for comprehensive setup documentation.

## 2.6 Query Optimization

### Performance Baselines

**Target Latencies:**
- **Simple queries** (SELECT by ID): <10ms
- **Complex queries** (JOINs, aggregations): <100ms
- **Bulk operations** (batch inserts): <500ms

**Current Performance (November 2025):**
- Render PostgreSQL: 50-100ms latency
- Workstation PRIMARY: <50ms latency
- L1 Cache: <1μs hit latency

### Optimization Techniques

**1. Index Usage:**
- All foreign keys indexed automatically
- Composite indexes for common query patterns
- Partial indexes for filtered queries

**2. Query Batching:**
```typescript
// BEFORE (N+1 problem)
for (const trainerId of trainerIds) {
  const trainer = await prisma.trainerProfile.findUnique({
    where: { id: trainerId }
  });
}

// AFTER (batch loading)
const trainers = await prisma.trainerProfile.findMany({
  where: { id: { in: trainerIds } }
});
```

**3. Prisma Include Optimization:**
```typescript
// BEFORE (multiple queries)
const trainer = await prisma.trainerProfile.findUnique({ where: { id } });
const party = await prisma.party.findFirst({ where: { trainerId: trainer.id } });

// AFTER (single query)
const trainer = await prisma.trainerProfile.findUnique({
  where: { id },
  include: { Party: true }
});
```

### Monitoring

```bash
# Slow query log (>100ms)
grep "Slow query detected" logs/app.log

# N+1 detection warnings
grep "N+1 detected" logs/app.log

# Query execution plan
npm run db:cli -- query "EXPLAIN ANALYZE SELECT * FROM \"Species\" WHERE \"generation\" = 1;"
```

---

## 2.10 Schema Architecture

### Persistent Entities

Core gameplay entities managed by Prisma:
- **Users** — Discord user records, trainer profiles
- **PokemonInstances** — Individual Pokémon owned by trainers
- **Parties** — Active party compositions (6-member teams)
- **Encounters** — Wild Pokémon encounter state
- **Battles** — Arena battle records and outcomes
- **Cooldowns** — Time-gated action restrictions per trainer

### Reference Data (Dex Spine)

Read-only Pokémon reference data refreshed by data pipeline:

**Core Reference Tables:**
- `Type` — Pokémon types (Fire, Water, Grass, etc.)
- `Ability` — Pokémon abilities
- `Item` — Held items and consumables
- `Move` — Attack moves and effects
- `Species` — Pokémon species definitions

**Junction Tables:**
- `SpeciesType` — Species-to-type mappings (compound PK)
- `SpeciesAbility` — Species-to-ability mappings (compound PK)
- `SpeciesLearnset` — Species move learning patterns (method + level)

**Supporting Tables:**
- `EvolutionStep` — Evolution chain definitions
- `TypeChart` — Type effectiveness multipliers
- `NameVariant` — Fuzzy name matching with trigram GIN index

**Materialized Views:**
- `SpeciesSheet` — Pre-joined species data for battle UI hydration
  - Refresh: `REFRESH MATERIALIZED VIEW CONCURRENTLY "SpeciesSheet";`
  - Run after dex patches to update battle lookups

**Manifest:**
- Top-level digest for pipeline exports under `data/{pokemon,moves,abilities}/`

### Schema Design Patterns

**IDs & Slugs:**
- All reference IDs are `SMALLINT` primaries
- ASCII slugs for human-readable lookups
- Rows upsert idempotently via `id` + `slug`

**Junction Tables:**
- Compound primary keys prevent duplicates
- Keep joins narrow for performance
- Example: `SpeciesType(speciesId, typeId)` is PK

**Special Columns:**
- `SpeciesLearnset.level` stores `0` for non-level methods (deterministic PK)
- `NameVariant.normalized` carries lowercase/unaccented text for fuzzy search
  - Use with `unaccent(lower($input))` for nickname resolution
  - Trigram GIN index enables efficient fuzzy matching

### Performance Indexes (2025-10-28)

**Cooldown Optimization:**
- `Cooldown (ownerId, kind)` — Unique key for trainer/kind pairs
- Enables clean upserts without duplicates
- Run `VACUUM ANALYZE` weekly to maintain index statistics

**Battle Query Optimization:**
- `Battle (state, endedAt)` — State-filtered battle history
- `Battle (p1Id, state, endedAt)` — Player 1 battle lookups
- `Battle (p2Id, state, endedAt)` — Player 2 battle lookups
- Speeds DM history and `/ops stats` filters
- Run `REINDEX` during schema upgrades if bloat exceeds 30%

**Encounter & Ownership:**
- `Encounter (ownerId, state)` — Trainer encounter queries
- `Encounter (state, startedAt)` — State-based encounter filtering
- `PokemonInstance (ownerId)` — Party/box management queries
- `Party (ownerId)` — Active party lookups
- Ensures O(log n) performance as concurrency grows

**Migration References:**
- `202510280500_scaling_indexes` — Applies performance indexes (forward-only)
- `202510290930_dex_reference_spine` — Installs trigram/unaccent extensions, dex tables, SpeciesSheet
- Deploy during quiet windows, monitor autovacuum lag post-deployment

### Data Pipeline Integration

**Schema Definitions:**
- Formal JSON schemas: `src/data_pipeline/schema/*`
- Pipeline output layout: `data/{pokemon,moves,abilities}/...`, `manifest.json`
- Bootstrap payloads: `data/bootstrap/*.json` (trimmed reference data)

**See Also:**
- § 2.6 (Database CLI) — Query and inspect schema
- § 2.7 (On-Premise Setup) — Local database mirroring
- § 2.Y (Bootstrap Procedures) — Schema initialization workflows

## 2.11 Analytics Tables (TimescaleDB)

**Status:** POC Ready (2025-11) — Time-series hypertables for log aggregation and business intelligence

**Architecture:** TimescaleDB extension on Render PostgreSQL (zero infrastructure change)

### Hypertables

**Purpose:** Queryable historical data for dashboards, debugging, and analytics. Replaces fragmented file-based logs with unified SQL interface.

#### log_entries (30-day retention)

System-wide structured logs aggregated from Event Bus:

```sql
CREATE TABLE log_entries (
  time TIMESTAMPTZ NOT NULL,
  correlation_id UUID NOT NULL,
  parent_correlation_id UUID,
  level VARCHAR(10) NOT NULL,            -- info, warn, error, fatal
  service VARCHAR(50) NOT NULL,          -- infinity-gauntlet-bot, security, etc.
  message TEXT NOT NULL,
  context JSONB,
  stack_trace TEXT,
  user_id VARCHAR(50),
  guild_id VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable (partitioned by time)
SELECT create_hypertable('log_entries', 'time', chunk_time_interval => INTERVAL '1 day');

-- Indexes for common queries
CREATE INDEX idx_log_entries_correlation_id ON log_entries (correlation_id);
CREATE INDEX idx_log_entries_level_time ON log_entries (level, time DESC);
CREATE INDEX idx_log_entries_service_time ON log_entries (service, time DESC);
CREATE INDEX idx_log_entries_user_id ON log_entries (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_log_entries_guild_id ON log_entries (guild_id) WHERE guild_id IS NOT NULL;
CREATE INDEX idx_log_entries_context_gin ON log_entries USING GIN (context jsonb_path_ops);

-- Retention policy (30 days)
SELECT add_retention_policy('log_entries', INTERVAL '30 days');

-- Compression policy (compress chunks older than 7 days)
ALTER TABLE log_entries SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'service,level',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('log_entries', INTERVAL '7 days');
```

**Query Examples:**

```sql
-- Error rate by service (last 24 hours)
SELECT 
  service,
  COUNT(*) FILTER (WHERE level = 'error') AS errors,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE level = 'error') / COUNT(*), 2) AS error_rate_pct
FROM log_entries
WHERE time > NOW() - INTERVAL '24 hours'
GROUP BY service
ORDER BY error_rate_pct DESC;

-- Trace correlation ID across services
SELECT time, service, level, message, context
FROM log_entries
WHERE correlation_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY time;

-- Top 10 errors by frequency (last 7 days)
SELECT 
  message,
  COUNT(*) AS occurrences,
  MAX(time) AS last_seen
FROM log_entries
WHERE level = 'error' AND time > NOW() - INTERVAL '7 days'
GROUP BY message
ORDER BY occurrences DESC
LIMIT 10;
```

**Storage:** ~50 MB/month (~1000 logs/day × 1.5 KB avg × 30 days)

---

#### event_history (90-day retention)

High-level user actions for funnel analysis and retention tracking:

```sql
CREATE TABLE event_history (
  time TIMESTAMPTZ NOT NULL,
  correlation_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,       -- battle.started, encounter.success, profile.created
  user_id VARCHAR(50) NOT NULL,
  guild_id VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('event_history', 'time', chunk_time_interval => INTERVAL '1 day');

CREATE INDEX idx_event_history_user_id_time ON event_history (user_id, time DESC);
CREATE INDEX idx_event_history_event_type_time ON event_history (event_type, time DESC);
CREATE INDEX idx_event_history_guild_id ON event_history (guild_id) WHERE guild_id IS NOT NULL;
CREATE INDEX idx_event_history_metadata_gin ON event_history USING GIN (metadata jsonb_path_ops);

SELECT add_retention_policy('event_history', INTERVAL '90 days');

ALTER TABLE event_history SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'event_type,user_id',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('event_history', INTERVAL '30 days');
```

**Query Examples:**

```sql
-- Daily Active Users (DAU)
SELECT 
  time_bucket('1 day', time) AS day,
  COUNT(DISTINCT user_id) AS dau
FROM event_history
WHERE time > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day;

-- User retention (7-day cohort)
WITH first_seen AS (
  SELECT user_id, MIN(time)::DATE AS signup_date
  FROM event_history
  GROUP BY user_id
)
SELECT 
  signup_date,
  COUNT(DISTINCT fs.user_id) AS signups,
  COUNT(DISTINCT eh.user_id) FILTER (WHERE eh.time::DATE BETWEEN signup_date + INTERVAL '7 days' AND signup_date + INTERVAL '14 days') AS retained_7d
FROM first_seen fs
LEFT JOIN event_history eh ON fs.user_id = eh.user_id
WHERE signup_date > NOW() - INTERVAL '90 days'
GROUP BY signup_date
ORDER BY signup_date;

-- Conversion funnel (encounter → catch)
WITH encounters AS (
  SELECT user_id, time
  FROM event_history
  WHERE event_type = 'encounter.wild' AND time > NOW() - INTERVAL '7 days'
),
catches AS (
  SELECT user_id, time
  FROM event_history
  WHERE event_type = 'encounter.catch.success' AND time > NOW() - INTERVAL '7 days'
)
SELECT 
  COUNT(DISTINCT e.user_id) AS encountered,
  COUNT(DISTINCT c.user_id) AS caught,
  ROUND(100.0 * COUNT(DISTINCT c.user_id) / NULLIF(COUNT(DISTINCT e.user_id), 0), 2) AS conversion_rate_pct
FROM encounters e
LEFT JOIN catches c ON e.user_id = c.user_id AND c.time > e.time AND c.time < e.time + INTERVAL '5 minutes';
```

**Storage:** ~60 MB/month (~1500 events/day × 1.2 KB avg × 90 days)

---

#### security_events (infinite retention)

Audit log for permission changes, alerts, and security incidents:

```sql
CREATE TABLE security_events (
  time TIMESTAMPTZ NOT NULL,
  correlation_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,       -- permission.change, alert.critical, sweep.completed
  guild_id VARCHAR(50) NOT NULL,
  actor_id VARCHAR(50),                  -- Who performed the action
  target_id VARCHAR(50),                 -- Who/what was affected
  severity VARCHAR(20) NOT NULL,         -- critical, warning, notice
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('security_events', 'time', chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_security_events_guild_id_time ON security_events (guild_id, time DESC);
CREATE INDEX idx_security_events_event_type_time ON security_events (event_type, time DESC);
CREATE INDEX idx_security_events_severity_time ON security_events (severity, time DESC);
CREATE INDEX idx_security_events_actor_id ON security_events (actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_security_events_details_gin ON security_events USING GIN (details jsonb_path_ops);

-- NO retention policy (audit log kept indefinitely)

ALTER TABLE security_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'guild_id,severity',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('security_events', INTERVAL '90 days');
```

**Query Examples:**

```sql
-- Alert frequency by severity (last 30 days)
SELECT 
  severity,
  COUNT(*) AS alerts,
  ROUND(AVG(EXTRACT(EPOCH FROM time - LAG(time) OVER (PARTITION BY severity ORDER BY time))), 2) AS avg_seconds_between
FROM security_events
WHERE time > NOW() - INTERVAL '30 days' AND event_type LIKE 'alert.%'
GROUP BY severity
ORDER BY alerts DESC;

-- Permission changes by guild
SELECT 
  guild_id,
  COUNT(*) AS changes,
  COUNT(DISTINCT actor_id) AS unique_actors,
  MAX(time) AS last_change
FROM security_events
WHERE event_type = 'permission.change' AND time > NOW() - INTERVAL '90 days'
GROUP BY guild_id
ORDER BY changes DESC;

-- Audit trail for specific user
SELECT time, event_type, severity, guild_id, details
FROM security_events
WHERE actor_id = '123456789012345678'
ORDER BY time DESC
LIMIT 50;
```

**Storage:** ~30 MB/month (~500 events/day × 1.8 KB avg × infinite retention, compressed after 90 days)

---

#### battle_analytics (180-day retention)

Game balance insights: Pokémon usage, move effectiveness, battle duration:

```sql
CREATE TABLE battle_analytics (
  time TIMESTAMPTZ NOT NULL,
  correlation_id UUID NOT NULL,
  battle_id VARCHAR(50) NOT NULL,
  pokemon_species_id SMALLINT NOT NULL,
  move_id SMALLINT,
  outcome VARCHAR(20),                   -- win, loss, draw, forfeit
  damage_dealt INTEGER DEFAULT 0,
  turns_survived INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  user_id VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('battle_analytics', 'time', chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_battle_analytics_species_time ON battle_analytics (pokemon_species_id, time DESC);
CREATE INDEX idx_battle_analytics_move_id ON battle_analytics (move_id) WHERE move_id IS NOT NULL;
CREATE INDEX idx_battle_analytics_outcome_time ON battle_analytics (outcome, time DESC);
CREATE INDEX idx_battle_analytics_user_id ON battle_analytics (user_id) WHERE user_id IS NOT NULL;

SELECT add_retention_policy('battle_analytics', INTERVAL '180 days');

ALTER TABLE battle_analytics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'pokemon_species_id,outcome',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('battle_analytics', INTERVAL '30 days');
```

**Query Examples:**

```sql
-- Top 20 Pokémon by win rate (last 30 days, min 50 battles)
SELECT 
  s.name AS pokemon,
  COUNT(*) AS battles,
  COUNT(*) FILTER (WHERE ba.outcome = 'win') AS wins,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ba.outcome = 'win') / COUNT(*), 2) AS win_rate_pct,
  ROUND(AVG(ba.damage_dealt), 0) AS avg_damage,
  ROUND(AVG(ba.turns_survived), 1) AS avg_turns
FROM battle_analytics ba
JOIN "Species" s ON ba.pokemon_species_id = s.id
WHERE ba.time > NOW() - INTERVAL '30 days'
GROUP BY s.name
HAVING COUNT(*) >= 50
ORDER BY win_rate_pct DESC
LIMIT 20;

-- Move effectiveness (damage per use)
SELECT 
  m.name AS move,
  COUNT(*) AS uses,
  ROUND(AVG(ba.damage_dealt), 0) AS avg_damage,
  MAX(ba.damage_dealt) AS max_damage
FROM battle_analytics ba
JOIN "Move" m ON ba.move_id = m.id
WHERE ba.time > NOW() - INTERVAL '30 days' AND ba.move_id IS NOT NULL
GROUP BY m.name
ORDER BY avg_damage DESC
LIMIT 20;

-- Battle duration trends (P50, P95, P99)
SELECT 
  time_bucket('1 day', time) AS day,
  COUNT(*) AS battles,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds), 0) AS p50_seconds,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_seconds), 0) AS p95_seconds,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_seconds), 0) AS p99_seconds
FROM battle_analytics
WHERE time > NOW() - INTERVAL '30 days' AND duration_seconds IS NOT NULL
GROUP BY day
ORDER BY day;
```

**Storage:** ~54 MB/month (~1000 battles/day × 1.8 KB avg × 180 days)

---

### Continuous Aggregates

Pre-aggregated rollups for fast dashboard queries:

#### logs_hourly

```sql
CREATE MATERIALIZED VIEW logs_hourly
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 hour', time) AS hour,
  service,
  level,
  COUNT(*) AS log_count,
  COUNT(DISTINCT correlation_id) AS unique_correlations
FROM log_entries
GROUP BY hour, service, level;

-- Refresh policy (hourly, 2-hour lag)
SELECT add_continuous_aggregate_policy('logs_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');
```

**Query:** Fast dashboard "logs per hour" chart

---

#### battles_daily

```sql
CREATE MATERIALIZED VIEW battles_daily
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 day', time) AS day,
  pokemon_species_id,
  COUNT(*) AS battles,
  COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
  ROUND(AVG(duration_seconds), 0) AS avg_duration
FROM battle_analytics
GROUP BY day, pokemon_species_id;

SELECT add_continuous_aggregate_policy('battles_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day');
```

**Query:** Fast Pokémon usage trends over time

---

#### pokemon_usage_weekly

```sql
CREATE MATERIALIZED VIEW pokemon_usage_weekly
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 week', time) AS week,
  pokemon_species_id,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(*) AS total_battles
FROM battle_analytics
GROUP BY week, pokemon_species_id;

SELECT add_continuous_aggregate_policy('pokemon_usage_weekly',
  start_offset => INTERVAL '2 weeks',
  end_offset => INTERVAL '1 week',
  schedule_interval => INTERVAL '1 week');
```

**Query:** Fast Pokémon popularity leaderboard

---

### Storage Estimates

| Table | Daily Ingestion | Retention | Uncompressed | Compressed | Compression Ratio |
|-------|----------------|-----------|--------------|------------|-------------------|
| **log_entries** | 1.5 MB | 30 days | 45 MB | 13 MB | 3.5:1 |
| **event_history** | 1.8 MB | 90 days | 162 MB | 40 MB | 4:1 |
| **security_events** | 0.9 MB | Infinite | 27 MB/month | 7 MB/month | 3.8:1 |
| **battle_analytics** | 1.8 MB | 180 days | 324 MB | 70 MB | 4.6:1 |
| **Continuous Aggregates** | N/A | N/A | 15 MB | 4 MB | 3.8:1 |
| **Total** | ~6 MB/day | Mixed | **573 MB** | **134 MB** | **4.3:1** |

**Growth Rate:** +194 MB/month uncompressed, +45 MB/month compressed (after 30-day mark when retention kicks in)

**12-Month Projection:** +540 MB compressed (fits within 876 MB available on 1 GB /Store volume)

---

### TimescaleDB Operations

**Install Extension:**

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

**Check Compression Status:**

```sql
SELECT 
  hypertable_name,
  total_chunks,
  number_compressed_chunks,
  pg_size_pretty(before_compression_total_bytes) AS before,
  pg_size_pretty(after_compression_total_bytes) AS after,
  ROUND(100.0 * (1 - after_compression_total_bytes::NUMERIC / NULLIF(before_compression_total_bytes, 0)), 2) AS compression_pct
FROM timescaledb_information.hypertable_compression_stats;
```

**Force Compression (Manual):**

```sql
SELECT compress_chunk(show_chunks('log_entries', older_than => INTERVAL '7 days'));
```

**Check Retention Execution:**

```sql
SELECT * FROM timescaledb_information.job_stats
WHERE job_id IN (
  SELECT job_id FROM timescaledb_information.jobs
  WHERE proc_name = 'policy_retention'
)
ORDER BY last_run_started_at DESC;
```

**Hypertable Health:**

```sql
SELECT 
  hypertable_schema,
  hypertable_name,
  num_chunks,
  num_dimensions,
  compression_enabled,
  replication_factor
FROM timescaledb_information.hypertables;
```

---

### Integration with Engine DB (Phase 17-22)

**Relationship:** Engine Write-DB (`src/services/engine-write-db.ts`) buffers battle analytics in SQLite, then uploads to `battle_analytics` hypertable via validation pipeline.

**Data Flow:**

```
Battle Turn → Engine Write Buffer (in-memory) 
  → Write-DB SQLite (WAL-backed) 
  → Validator (quality check ≥95%) 
  → Upload to PostgreSQL battle_analytics 
  → TimescaleDB compression (after 30 days)
```

**Validation Rules (from Phase 19):**
- Non-null required fields (pokemon_species_id, outcome, battle_id)
- Valid foreign keys (Species.id exists)
- Reasonable ranges (damage_dealt ≥0, turns_survived ≥0, duration_seconds 10-3600)
- Quality threshold: ≥95% rows pass validation

**See Also:**
- § 2.10 (Schema Architecture) — Core Prisma entities
- [operations-bible/12-analytics-queries.md](12-analytics-queries.md) — Sample analytics queries
- [architecture-bible/17-engine-db-replication.md](../architecture-bible/17-engine-db-replication.md) — Engine DB → PostgreSQL upload pipeline

---

[← Back to INDEX](INDEX.md) | [← Previous: Service Matrix](01-service-matrix.md) | [Next: Deployment Procedures →](03-deployment-procedures.md)