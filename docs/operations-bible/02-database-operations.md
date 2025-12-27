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

## 2.7 Prisma 7 Configuration [UPDATED 2025-12-18]

### Breaking Changes from Prisma 6

| Change | Prisma 6 | Prisma 7 | Required Fix |
|--------|----------|----------|--------------|
| **Engine Type** | Auto-detected | Defaults to `"client"` | Add `engineType = "library"` to schema.prisma |
| **URL Config** | In schema.prisma `datasource.url` | In `prisma.config.ts` | Create config file, remove `url` from schema |
| **datasources option** | Supported in constructor | **REMOVED** | Remove from PrismaClient constructor |
| **Generated Location** | `node_modules/@prisma/client` | Default: `node_modules/.prisma/client` | Use default or configure `output` |
| **CJS Support** | Full | ESM-first | Use ESM imports, fix `effect`/`fast-check` overrides |

### Schema Configuration (Required)

**`prisma/schema.prisma`:**

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
  engineType    = "library"  // REQUIRED for direct PostgreSQL connections
}

datasource db {
  provider = "postgresql"
  // NO url field - configured via prisma.config.ts
}
```

**Key Points:**
- `engineType = "library"` — Uses native query engine for direct PostgreSQL
- `binaryTargets` — Include `debian-openssl-3.0.x` for Render deployment
- URL removed from schema — Moved to `prisma.config.ts`

### Environment Configuration (Required)

**`prisma.config.ts`:**

```typescript
import path from "path";
import type { PrismaConfig } from "prisma";

export default {
  earlyAccess: true,
  schema: path.join(__dirname, "prisma/schema.prisma"),

  migrate: {
    async resolveUrl(params) {
      return (
        process.env.PROD_DATABASE_URL ??
        process.env.RENDER_DB_EXTERNAL_URL ??
        process.env.DATABASE_ONPREMISE_DEV_PRIMARY ??
        "postgresql://localhost:5432/default"
      );
    },
  },
} satisfies PrismaConfig;
```

### Client Initialization (Updated)

**✅ CORRECT (Prisma 7):**

```typescript
import { PrismaClient } from "@prisma/client";

// Simple constructor - URL from environment/config
const prisma = new PrismaClient({
  log: [{ emit: "stdout", level: "error" }]
});
```

**❌ WRONG (Breaks in Prisma 7):**

```typescript
// datasources option was REMOVED in Prisma 7
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.PROD_DATABASE_URL }  // ❌ RUNTIME ERROR
  }
});
```

### Engine Types Explained

| Engine Type | Use Case | Driver | Performance |
|-------------|----------|--------|-------------|
| `"library"` | Direct PostgreSQL (our setup) | Native binary | Fastest |
| `"client"` | Accelerate/Edge (requires adapter) | Driver adapter | Cloud optimized |
| `"binary"` | Legacy compatibility | Separate process | Slowest |

**We use `"library"`** because:
- Direct connection to Render PostgreSQL (no Accelerate)
- Best performance for server-side applications
- Matches our production architecture

### Common Errors & Fixes

**Error: `Using engine type "client" requires either "adapter" or "accelerateUrl"`**

```
PrismaClientConstructorValidationError: 
Using engine type "client" requires either "adapter" or "accelerateUrl" 
to be provided to PrismaClient constructor.
```

**Cause:** Prisma 7 defaults `engineType` to `"client"` which requires Accelerate or driver adapter.

**Fix:** Add `engineType = "library"` to generator block in `schema.prisma`.

---

**Error: `Unknown argument 'datasources'`**

```
PrismaClientInitializationError:
Unknown argument `datasources`. Did you mean `log`?
```

**Cause:** Prisma 7 removed `datasources` option from PrismaClient constructor.

**Fix:** Remove `datasources` from constructor, configure URL via `prisma.config.ts`.

---

**Error: `effect` or `fast-check` CJS compatibility issues**

```
TypeError: Cannot read properties of undefined (reading 'cause')
```

**Cause:** Prisma 7 uses ESM-first dependencies that have CJS compatibility issues.

**Fix:** Add overrides to `package.json`:

```json
{
  "overrides": {
    "effect": "3.19.12",
    "fast-check": "3.22.0"
  }
}
```

### Migration Checklist (Prisma 6 → 7)

1. **Update schema.prisma:**
   - Add `engineType = "library"` to generator block
   - Remove `url` from datasource block

2. **Create prisma.config.ts:**
   - Configure database URL resolution
   - Use fallback chain for multiple environments

3. **Update PrismaClient usage:**
   - Remove `datasources` option from all constructors
   - URL now comes from environment, not constructor

4. **Add package.json overrides:**
   - `effect@3.19.12`, `fast-check@3.22.0`
   - Required for CJS compatibility

5. **Regenerate Prisma client:**
   - Run `npx prisma generate`
   - Verify `node_modules/.prisma/client` created

6. **Test deployment:**
   - Run `npm ci && npm run prebuild` locally
   - Deploy to Render and verify startup

### SSL Configuration (CRITICAL for Render)

**🚨 REQUIRED:** Render PostgreSQL requires SSL connections. When using Prisma 7 with driver adapters (`@prisma/adapter-pg`), you MUST explicitly configure SSL in pg.Pool.

**Problem:** Without SSL config, you'll see:
- `P1017: DriverAdapterError: ConnectionClosed`
- `Error: read ECONNRESET`
- ALL database operations fail

**Solution:**

```typescript
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const pool = new pg.Pool({
  connectionString: process.env.PROD_DATABASE_URL,
  max: 20,
  
  // ✅ REQUIRED for Render PostgreSQL
  ssl: {
    rejectUnauthorized: false,  // Render uses self-signed certs
  },
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

**Why This Is Necessary:**
- Prisma 6 handled SSL automatically via connection string parsing
- Prisma 7 delegates connection management to pg.Pool
- pg.Pool ignores `?sslmode=require` in connection string
- Must configure SSL explicitly in Pool constructor

**Production Validation:**
```typescript
// Test that SSL is working
const result = await prisma.$queryRaw`SELECT 1 as test;`;
console.log('✅ SSL connection working:', result);
```

**Complete Reference:** See `docs/troubleshooting/PRISMA7-SSL-RENDER.md` for comprehensive troubleshooting guide and diagnosis steps.

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

---

[← Back to INDEX](INDEX.md) | [← Previous: Service Matrix](01-service-matrix.md) | [Next: Deployment Procedures →](03-deployment-procedures.md)