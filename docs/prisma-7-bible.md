# Prisma ORM 7 Migration Bible

*For Infinity‑Gauntlet (Discord-based Pokémon API/game) — Node.js 22 + TypeScript 5 + PostgreSQL 16 + Docker + Render*

**Edition:** AI Agent Playbook (VS Code + Claude Opus 4.5)  
**Optimized for:** "Follow-the-rails" execution with explicit, repeatable patterns

---

## Table of Contents

1. [What Prisma 7 Changed (Breaking Production)](#0-what-prisma-7-changed-the-stuff-that-breaks-prod)
2. [Emergency Production Triage Playbook](#1-emergency-production-triage-playbook)
3. [Non-Negotiable Rules for Infinity-Gauntlet](#2-non-negotiable-rules-for-infinity-gauntlet)
4. [Target State Architecture](#3-target-state-architecture-prisma-7--postgres-on-render)
5. [Prisma 7 File Layout](#4-prisma-7-file-layout-for-infinity-gauntlet)
6. [Step-by-Step Migration: Prisma 6 → 7](#5-step-by-step-migration-prisma-6--prisma-7-postgres)
7. [Render Deployment Model](#6-render-deployment-model-prisma--postgres--discord-bot)
8. [Common Production Failure Modes](#7-common-prisma-7-production-failure-modes-and-exact-fixes)
9. [Battle-Tested Operational Patterns](#8-battle-tested-operational-patterns-for-this-game)
10. [AI Agent Operating Procedure](#9-ai-agent-operating-procedure-for-prisma-7-changes)
11. [Minimal Golden Configuration](#10-minimal-golden-configuration-snippets-copypaste)
12. [Recommended Next Steps](#11-what-i-recommend-you-do-next-in-order)
13. [Claude Task Templates](#12-claude-task-templates-use-these-as-macros)
14. [Infinity-Gauntlet Project Specifics](#13-infinity-gauntlet-project-specifics)
15. [Appendix: Reference Links](#14-appendix-prisma-v7--render-references)
16. [Reference Canonical Schema](#15-reference-canonical-schema-infinity-gauntlet-baseline)

---

## 0) What Prisma 7 Changed (The Stuff That Breaks Prod)

Prisma ORM 7 is **not a "tiny bump."** The big breaking shifts that commonly cause production failures:

### A. Connection URL Moved Out of `schema.prisma` into `prisma.config.ts` (CLI-side)

Starting with Prisma ORM v7, `prisma init` creates a `prisma.config.ts`, and the **database connection URL is configured there instead of in `schema.prisma`**. ([Prisma Docs][1])

### B. Client Generation Moved Out of `node_modules` into Your Source Tree

Prisma 7 pushes generated client + types into your project source code (not hidden in `node_modules`) and expects you to treat it like "normal code" for tooling and builds. The `output` field is now **required** when using the new `prisma-client` generator. ([Prisma Blog][2])

### C. Driver Adapters Are the Default for Relational DBs (Runtime-side)

In Prisma ORM v7, **driver adapters are the default for relational databases** and **connection pooling is handled by the JS driver you provide (like `pg`)**, not by Prisma connection URL parameters. ([Prisma Docs][3])

### D. Prisma Client Runtime Now Expects `adapter` (Direct) or `accelerateUrl` (Accelerate) in "Client Engine" Mode

A common production crash after upgrading is:

> `PrismaClientConstructorValidationError: Using engine type "client" requires either "adapter" or "accelerateUrl" ...`

This is reported broadly in Prisma's issue tracker, and it's exactly the kind of thing that will take a previously-working `new PrismaClient()` and turn it into an on-fire crater. ([GitHub Issue #28670][4])

### E. You Must Remove `engineType` and `previewFeatures = ["driverAdapters"]` from Schema (When Using Adapters)

Prisma's own v7 migration guidance explicitly calls this out when using the new adapter pattern. ([Prisma Upgrade Guide][5])

**⚠️ CRITICAL DISTINCTION:** If you want to keep using the library engine (like Infinity-Gauntlet does), you MUST explicitly set `engineType = "library"` because Prisma 7 changed the default from `"library"` to `"client"`.

### F. `datasources` Option Removed from PrismaClient Constructor

Prisma 7 removed the ability to pass database URLs via the constructor:

```typescript
// ❌ BROKEN in Prisma 7
const client = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

// ✅ CORRECT: URL comes from environment or adapter
const client = new PrismaClient();
```

---

## 1) Emergency Production Triage Playbook

When Prisma 7 blows up prod, the fastest path is to **restore service first**, then fix migration safely.

### 1.1 "Stop the Bleeding" Options

**Option A (Fastest Restore): Rollback to Prisma 6.x**

```bash
# Revert prisma and @prisma/client to last known good v6 versions
npm install prisma@6.x @prisma/client@6.x
npx prisma generate
# Redeploy
```

**Option B (Hotfix to Stay on v7 with Library Engine — INFINITY-GAUNTLET APPROACH):**

1. Add `engineType = "library"` to generator block in `schema.prisma`
2. Create/update `prisma.config.ts` with URL configuration
3. Run `npx prisma generate`
4. Redeploy

**Option C (Full v7 Migration with Driver Adapters):**

1. Add `prisma.config.ts` + move URL out of schema (CLI)
2. Switch generator to `prisma-client` + set required output (generation)
3. Install `@prisma/adapter-pg` and `pg`
4. Update runtime to use `new PrismaClient({ adapter })` (runtime)
5. Ensure `prisma generate` runs in build pipeline
6. Redeploy

### 1.2 Infinity-Gauntlet Decision: Option B (Library Engine)

We chose to keep the library engine because:
- Simpler configuration (no adapter setup required)
- Proven stability with Render PostgreSQL
- No need for Prisma Accelerate
- Minimal code changes required
- Existing codebase already uses direct PostgreSQL connections

---

## 2) Non-Negotiable Rules for Infinity-Gauntlet

These constraints prevent "migrations roulette" and "Render deploy chaos":

| Rule | Rationale | Reference |
|------|-----------|-----------|
| **Never run `prisma migrate dev` in production** | `migrate dev` is development-only, drops shadow database | [Prisma Docs][6] |
| **In non-interactive environments, use `migrate deploy`** | Docker/CI don't support interactive mode | [Prisma Docs][7] |
| **Run migrations exactly once per deploy** | Multiple instances running migrations = corruption | Best Practice |
| **Manage connection pooling at scale** | Render Postgres has connection limits (~100) | [Render Docs][8] |
| **CLI URL ≠ Runtime URL (potentially)** | Config file is for CLI; adapter/env is for runtime | [GitHub Discussion][9] |
| **Keep `prisma` and `@prisma/client` versions aligned** | Mismatched versions cause cryptic errors | [Prisma Docs][5] |

---

## 3) Target State Architecture (Prisma 7 + Postgres on Render)

### 3.1 Two Distinct "Database Connection Concepts"

**Concept 1: Prisma CLI Connection**

Used by:
- `prisma migrate deploy`
- `prisma db push / pull`
- `prisma studio`
- `prisma db seed`

Configured in `prisma.config.ts` via `datasource.url`. ([Prisma Docs][10])

**Concept 2: Prisma Client Runtime Connection**

Used when your bot/API executes queries. 

- **With driver adapters:** Connection string provided to adapter constructor
- **With library engine:** Connection string from `DATABASE_URL` environment variable

This is why it can feel like you "configure the DB twice." It's real and currently intentional. ([GitHub Discussion][9])

### 3.2 Two Engine Modes in Prisma 7

| Engine Mode | Use Case | Configuration | Runtime Behavior |
|-------------|----------|---------------|------------------|
| **Library** (`engineType = "library"`) | Direct PostgreSQL, no Accelerate | Explicit in schema, uses `DATABASE_URL` | Native Rust query engine |
| **Client** (default in v7) | Prisma Accelerate or driver adapters | Requires `adapter` or `accelerateUrl` | JavaScript-based adapter |

**Infinity-Gauntlet uses Library mode** for simplicity and proven stability with direct PostgreSQL connections.

### 3.3 Connection Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Prisma 7 Connection Flow                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CLI Operations (migrate, studio, seed)                         │
│  ┌─────────────┐     ┌──────────────────┐     ┌──────────────┐ │
│  │ prisma CLI  │────▶│ prisma.config.ts │────▶│  PostgreSQL  │ │
│  └─────────────┘     │ datasource.url   │     └──────────────┘ │
│                      └──────────────────┘                       │
│                                                                  │
│  Runtime Queries (Library Engine - Our Approach)                │
│  ┌─────────────┐     ┌──────────────────┐     ┌──────────────┐ │
│  │ PrismaClient│────▶│ DATABASE_URL env │────▶│  PostgreSQL  │ │
│  │ (library)   │     │ (automatic)      │     └──────────────┘ │
│  └─────────────┘     └──────────────────┘                       │
│                                                                  │
│  Runtime Queries (Driver Adapter - Alternative)                 │
│  ┌─────────────┐     ┌──────────────────┐     ┌──────────────┐ │
│  │ PrismaClient│────▶│ PrismaPg adapter │────▶│  PostgreSQL  │ │
│  │ ({ adapter })│    │ connectionString │     └──────────────┘ │
│  └─────────────┘     └──────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4) Prisma 7 File Layout for Infinity-Gauntlet

### 4.1 Current Layout (Library Engine)

```
repo/
  prisma/
    schema.prisma          # Schema with engineType = "library"
    migrations/            # Migration files
    seed.ts               # Seed script (optional)
  src/
    shared/
      prisma.ts           # PrismaClient singleton (from @prisma/client)
  prisma.config.ts        # CLI configuration (Prisma 7)
  package.json
  tsconfig.json
  Dockerfile
  render.yaml
```

### 4.2 Full v7 Layout (Driver Adapters - Alternative)

```
repo/
  prisma/
    schema.prisma          # Schema with prisma-client generator
    migrations/
    seed.ts
  src/
    generated/
      prisma/             # Generated output (required for prisma-client)
    db/
      prisma.ts           # PrismaClient with adapter
  prisma.config.ts
  package.json
  tsconfig.json
  Dockerfile
  render.yaml
```

### 4.3 Why Generate into `src/`? (For Adapter Pattern)

Prisma 7 explicitly explains the motivation: generated artifacts become first-class project code, easier for watchers/build tools. ([Prisma Blog][2])

**Note:** Infinity-Gauntlet currently uses `prisma-client-js` with library engine, which generates to `node_modules` by default. This is simpler and well-supported.

---

## 5) Step-by-Step Migration: Prisma 6 → Prisma 7 (Postgres)

### Step 0 — Baseline Safety Checks

- [ ] Ensure you have a **staging database** or cloned schema
- [ ] Ensure you can take a **backup/snapshot** of production DB (Render supports backups)
- [ ] Freeze production writes if expecting a destructive migration
- [ ] Review current schema for deprecated patterns
- [ ] Check current Prisma version: `npx prisma --version`

### Step 1 — Upgrade Dependencies

```bash
# Upgrade Prisma packages (keep versions aligned!)
npm install prisma@latest @prisma/client@latest

# If using driver adapters (full v7 migration)
npm install @prisma/adapter-pg pg
```

**Version Alignment Rule:** Always upgrade `prisma` and `@prisma/client` together to the **same version**.

### Step 2 — Update `schema.prisma`

**For Library Engine (Infinity-Gauntlet approach):**

```prisma
// prisma/schema.prisma

generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
  // CRITICAL: Prisma 7 defaults to "client", must explicitly set "library"
  engineType    = "library"
}

datasource db {
  provider = "postgresql"
  // Prisma 7: URL configured in prisma.config.ts for CLI operations
  // Runtime uses DATABASE_URL environment variable automatically
}
```

**For Driver Adapters (Full v7 migration):**

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client"
  // Required in Prisma 7 with prisma-client generator:
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  // Prisma 7: DO NOT put url = env("DATABASE_URL") here anymore
}
```

Key changes per Prisma v7 migration guidance:
- `provider = "prisma-client"` (not `prisma-client-js`) for adapter pattern
- `output` becomes **required** with `prisma-client` generator
- Remove `previewFeatures = ["driverAdapters"]`
- Remove `engineType` (when using adapters)
- Remove `url = ...` from datasource block ([Prisma Upgrade Guide][5])

### Step 3 — Create `prisma.config.ts`

This file configures Prisma CLI commands (migrate, studio, etc.). Prisma v7 moves DB URL configuration here. ([Prisma Docs][1])

```typescript
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    // Optional but recommended: define seeding command here
    seed: "npx tsx prisma/seed.ts",
  },

  datasource: {
    // Used by Prisma CLI (migrate/studio/etc.)
    // Use DIRECT URL for migrations, not PgBouncer
    url: env("DIRECT_DATABASE_URL") ?? env("PROD_DATABASE_URL") ?? env("DATABASE_URL"),
  },
});
```

**Strong Recommendation: Separate URLs for Migrations vs Runtime**

On Render, you may want:
- `DATABASE_URL` → PgBouncer URL (runtime, many bot workers)
- `DIRECT_DATABASE_URL` or `PROD_DATABASE_URL` → Direct DB URL (migrations)

### Step 4 — Update Runtime PrismaClient Construction

**For Library Engine (Infinity-Gauntlet approach):**

```typescript
// src/shared/prisma.ts
import { PrismaClient } from "@prisma/client";

const baseOptions = {
  log: [
    { emit: "stdout", level: "error" },
    { emit: "event", level: "query" },
  ],
};

// Library engine uses DATABASE_URL from environment automatically
export const prisma = new PrismaClient(baseOptions);

// Graceful shutdown
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
});
```

**For Driver Adapters (Full v7 migration):**

```typescript
// src/db/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import pg from "pg";

// CRITICAL (2025-12-27): Create pg.Pool with explicit SSL configuration
// Render PostgreSQL REQUIRES SSL - without this, connections fail with ECONNRESET/P1017
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 20,                          // Maximum connections in pool
  min: 2,                           // Minimum idle connections
  idleTimeoutMillis: 300_000,       // 5 minutes (allow long-running migrations)
  connectionTimeoutMillis: 30_000,  // 30 seconds (handle cold starts)
  statement_timeout: 60_000,        // Kill queries after 60s
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  allowExitOnIdle: false,
  // SSL configuration (REQUIRED for Render PostgreSQL)
  ssl: {
    rejectUnauthorized: false,      // Render uses self-signed certificates
  },
});

// Pass pool to adapter (pool handles connection lifecycle)
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

// Graceful shutdown
process.on("SIGTERM", async () => {
  await pool.end();                 // Close pool first
  await prisma.$disconnect();       // Then disconnect Prisma
});
```

This directly prevents the common v7 runtime crash. ([GitHub Issue #28670][4])

### Step 5 — Ensure Imports Point to Correct Client

**Library Engine:** Import from `@prisma/client` (generated in node_modules)

```typescript
import { PrismaClient } from "@prisma/client";
```

**Driver Adapters:** Import from your generated output path

```typescript
import { PrismaClient } from "../generated/prisma/client";
```

When you specify a custom output directory, you must import PrismaClient from that generated path (not blindly from `@prisma/client`). ([GitHub Discussion][15])

Your project's "one true import" should be your internal `src/shared/prisma.ts` wrapper; everything else imports `prisma` from there.

### Step 6 — Regenerate Client Artifacts

```bash
npx prisma generate
```

Prisma Client is generated code. After schema changes, you **must** run generate. ([Prisma Docs][16])

### Step 7 — Migrations: Dev vs Prod Commands

**Development (Interactive):**

```bash
npx prisma migrate dev        # Creates + applies migrations
npx prisma db seed            # If configured
```

**Production (Render/Docker/CI):**

```bash
npx prisma migrate deploy     # Applies existing migrations only
```

Prisma recommends `migrate deploy` be part of CI/CD and not run "locally with prod URL." ([Prisma Docs][17])

Prisma detects non-interactive environments like Docker and warns that `migrate dev` isn't supported there. ([Prisma Docs][7])

---

## 6) Render Deployment Model (Prisma + Postgres + Discord Bot)

### 6.1 Migrations on Render

Prisma's Render deployment guide shows a pattern where `npx prisma migrate deploy` is configured as a **Pre-Deploy Command**, run before the app starts. ([Prisma Docs][18])

**Critical Caution:** `migrate deploy` requires the `prisma` CLI package to be available at deploy time. Prisma docs note some platforms prune devDependencies and you may need to move `prisma` into `dependencies`. ([Prisma Docs][17])

**render.yaml Example:**

```yaml
services:
  - type: web
    name: infinity-gauntlet-bot
    env: node
    buildCommand: npm install && npm run prisma:generate && npm run build
    startCommand: npm start
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: infinity-gauntlet-db
          property: connectionString
    # Pre-deploy runs migrations before new version starts
    preDeployCommand: npm run prisma:migrate:deploy
```

### 6.2 Connection Limits and Pooling

Render states plainly:
- Render Postgres supports a limited number of simultaneous direct connections (~100)
- If approaching the limit, use PgBouncer connection pooling ([Render Docs][8])

**Infinity-Gauntlet Rule:** If you run multiple shards/workers/replicas, **assume you need pooling**.

### 6.3 The "Two URLs" Pattern

| URL | Purpose | Used By |
|-----|---------|---------|
| `DATABASE_URL` or `DATABASE_POOL_URL` | PgBouncer (runtime) | App queries |
| `DIRECT_DATABASE_URL` or `PROD_DATABASE_URL` | Direct Postgres (migrations) | `prisma migrate deploy` |

This reduces the chances you run migrations through a transaction-pooling proxy (which can cause issues).

### 6.4 PgBouncer Configuration Notes (Render)

Render's pooling guide recommends PgBouncer in **transaction** mode. Common settings:
- `POOL_MODE=transaction`
- `SERVER_RESET_QUERY=DISCARD ALL`

Prisma also maintains a PgBouncer setup page that covers when/why to use special settings. ([Prisma Docs][19])

**Important:** Prisma Migrate should use direct connections, not PgBouncer, because migrations need consistent transaction state.

### 6.5 SSL Configuration (CRITICAL for Render PostgreSQL)

**As of 2025-12-27, this is a MANDATORY requirement for Render deployments.**

#### The Problem

Render PostgreSQL **requires SSL connections**. Without explicit SSL configuration in `pg.Pool`, connections fail with:
- `Error: read ECONNRESET` (pg driver level)
- `P1017: DriverAdapterError: ConnectionClosed` (Prisma level)

This affects:
- ✅ Production deployments on Render
- ✅ Local development connecting to Render databases
- ❌ Local PostgreSQL (SSL optional)

#### The Solution

**Always configure SSL when creating `pg.Pool` for Prisma adapter:**

```typescript
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new pg.Pool({
  connectionString: process.env.PROD_DATABASE_URL,
  max: 20,
  min: 2,
  idleTimeoutMillis: 300_000,       // 5 minutes (migrations need time)
  connectionTimeoutMillis: 30_000,  // 30 seconds (cold starts)
  keepAlive: true,
  allowExitOnIdle: false,
  // SSL configuration (REQUIRED for Render)
  ssl: {
    rejectUnauthorized: false,      // Render uses self-signed certs
  },
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

#### Why `rejectUnauthorized: false`?

Render PostgreSQL uses **self-signed certificates**. Setting `rejectUnauthorized: false` allows:
- ✅ Connections to Render databases
- ✅ Development/staging environments with self-signed certs
- ⚠️ **Security Note**: This is safe for Render's managed PostgreSQL but validate certificates in production if using custom databases

#### Troubleshooting SSL Issues

**Symptom:** Connections fail immediately with `ECONNRESET` or `P1017`

**Diagnosis:**
```bash
# Test raw pg.Pool connection (bypasses Prisma)
npx tsx scripts/test-pool-behavior.ts
```

**If test fails without SSL config:**
- Add `ssl: { rejectUnauthorized: false }` to pool configuration
- Regenerate Prisma client: `npx prisma generate`
- Restart application

**If test succeeds but Prisma still fails:**
- Check `engineType = "library"` in schema.prisma
- Verify pool is passed to `PrismaPg()` constructor (not connection string)
- Ensure `prisma.config.ts` uses correct database URL

#### Production Validation

**Before deploying SSL changes:**
1. Test locally against Render database
2. Verify simple queries work: `await prisma.user.count()`
3. Test migrations: `npx prisma migrate deploy`
4. Test long-running operations (5+ minutes)
5. Check pool event logs for errors

**Expected behavior with correct SSL config:**
- ✅ Connections establish in <1 second
- ✅ Queries execute without P1017 errors
- ✅ Pool reuses connections (totalCount stable)
- ✅ Migrations complete without timeouts

---

## 7) Common Prisma 7 Production Failure Modes (and Exact Fixes)

### Error A: `P1017: DriverAdapterError: ConnectionClosed` or `Error: read ECONNRESET`

**Discovered:** 2025-12-27 (Infinity-Gauntlet Security State Migration)

**Symptoms:**
- All database operations fail immediately
- Error appears on both simple queries (`count()`) and writes (`create()`)
- Affects production (Render) but not local PostgreSQL
- Pool events show no `connect` events, immediate failures

**Cause:** Missing SSL configuration in `pg.Pool` when connecting to Render PostgreSQL.

Render PostgreSQL **requires SSL connections**. Without explicit `ssl` configuration, the pg driver attempts unencrypted connection → SSL handshake failure → connection reset.

**CRITICAL FIX (Required for Render):**

```typescript
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new pg.Pool({
  connectionString: process.env.PROD_DATABASE_URL,
  // ... other pool settings ...
  
  // SSL configuration (REQUIRED for Render PostgreSQL)
  ssl: {
    rejectUnauthorized: false,  // Render uses self-signed certificates
  },
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

**Why This Wasn't Obvious:**
1. Prisma 6 handled SSL automatically via connection string parsing
2. Prisma 7 with driver adapters delegates SSL to the pg.Pool configuration
3. No explicit error message stating "SSL required"
4. Connection string includes `?sslmode=require` but pg.Pool ignores query params

**Verification Test:**
```bash
# Test raw pg.Pool without Prisma (isolates SSL issue)
npx tsx scripts/test-pool-behavior.ts
```

**Expected Output (SSL Working):**
```
✅ Pool: new client connected
📥 Pool: client acquired from pool
  ✅ Result: 500 rows
  📊 Pool: totalCount=1, idleCount=1, waitingCount=0
```

**Root Cause Timeline:**
- 2025-12-27 03:30 UTC: Migration script fails with P1017 on all queries
- Initial hypothesis: Pool timeout settings too aggressive (idleTimeoutMillis: 30s)
- Changed timeouts: 30s → 300s, 10s → 30s → **No effect**
- Created isolation test: Raw pg.Pool (no Prisma) → **Same failure** (ECONNRESET)
- Added SSL config → **Instant fix** ✅
- Diagnosis time: ~45 minutes (would have been 5 minutes with proper documentation)

**Related Issues:**
- Applies to ALL Render PostgreSQL connections via driver adapters
- Local PostgreSQL works without SSL (optional)
- PgBouncer connections also require SSL configuration

---

### Error B: `The datasource property 'url' is no longer supported in schema files`

**Cause:** Prisma 7 rejects `url = env("DATABASE_URL")` in `schema.prisma`.

**Fix:**
1. Remove `url = ...` from datasource block in `schema.prisma` ([Prisma Upgrade Guide][5])
2. Put the URL in `prisma.config.ts` under `datasource.url` ([Prisma Docs][1])

### Error C: `Using engine type "client" requires either "adapter" or "accelerateUrl"`

**Cause:** You're using the "client engine" path without providing adapter/accelerateUrl. This happens because Prisma 7 changed the default `engineType` from `"library"` to `"client"`.

**Fix (Option 1 - Library Engine - Recommended for Infinity-Gauntlet):**
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
  engineType    = "library"  // Explicitly set
}
```

**Fix (Option 2 - Driver Adapter):**
```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
```

### Error D: `An output path is required for the prisma-client generator`

**Cause:** Prisma 7's `prisma-client` generator (not `prisma-client-js`) requires `output`. ([Prisma Docs][20])

**Fix:** Add `output = "../src/generated/prisma"` (or similar) to generator block.

**Alternative:** Use `prisma-client-js` with `engineType = "library"` (no output required).

### Error E: `Cannot find module '../generated/prisma/client'`

**Cause:** Generated client missing at runtime (build pipeline didn't run `prisma generate`, or output path mismatch).

**Fix:**
1. Ensure `prisma generate` runs during build
2. Confirm the path matches generator output
3. Confirm Docker image includes generated folder (copy it into final stage)
4. Check that TypeScript/build process includes generated files

### Error F: `migrate dev` Fails in Docker/CI ("Non-interactive")

**Cause:** Prisma warns `migrate dev` is not supported in non-interactive environments. ([Prisma Docs][7])

**Fix:** Use `prisma migrate deploy` (apply existing migrations only).

### Error G: `datasources` Option Removed / Unknown Property

**Cause:** Prisma 7 removed the `datasources` option from PrismaClient constructor.

**Wrong (Prisma 6 pattern):**
```typescript
const client = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});
```

**Fix:** Remove `datasources` option. URL is configured via:
- Environment variable `DATABASE_URL` (library engine) - automatic
- Adapter constructor (driver adapters) - explicit
- `prisma.config.ts` (CLI operations)

### Error H: Type Errors After Migration

**Cause:** Generated types are stale or imports point to wrong location.

**Fix:**
```bash
# Regenerate client
npx prisma generate

# If using custom output, check imports
# Should be: import { PrismaClient } from "../generated/prisma/client"
# Not: import { PrismaClient } from "@prisma/client"
```

---

## 8) Battle-Tested Operational Patterns for This Game

### 8.1 PrismaClient Singleton for a Discord Bot

Discord bots are long-lived processes; you want:
- **One** PrismaClient instance per process
- Graceful shutdown with `$disconnect()`
- Avoid creating a new client per command (that murders connection limits)

```typescript
// src/shared/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" 
    ? ["query", "error", "warn"] 
    : ["error"],
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
```

### 8.2 Migration Ownership

If Infinity-Gauntlet has:
- Web API service (HTTP health checks)
- Bot worker service (Discord gateway)
- Multiple worker services (cache, security, outbox, etc.)

Then:
- **Only one service runs `migrate deploy`** (typically via pre-deploy command)
- Other services should start only after migrations are applied (or tolerate "schema behind" with retry/backoff)
- Use health checks to verify database connectivity before accepting traffic

### 8.3 Deterministic RNG + DB Transactions

For anti-cheat deterministic RNG:
- Store `rngSeed` + `rngCounter` on User
- For each "roll", increment counter inside a DB transaction that also writes the result to an audit log
- This ensures "replayable outcomes" and closes race conditions

```typescript
// Example: Atomic RNG consumption
async function consumeRng(userId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { rngSeed: true, rngCounter: true },
    });
    
    const roll = deterministicRandom(user.rngSeed, user.rngCounter);
    
    await tx.user.update({
      where: { id: userId },
      data: { rngCounter: { increment: 1n } },
    });
    
    await tx.log.create({
      data: {
        userId,
        level: "AUDIT",
        message: `RNG consumed: counter=${user.rngCounter}, result=${roll}`,
        meta: { roll, counter: Number(user.rngCounter) },
      },
    });
    
    return roll;
  });
}
```

### 8.4 Transaction Patterns

Every game command that changes state must be atomic:
- Catch attempt
- Party swap
- Inventory consume
- Battle turn submission + resolution

```typescript
import { prisma } from "./prisma";

export async function runCommandTx<T>(
  fn: (tx: Parameters<typeof prisma.$transaction>[0]) => Promise<T>
): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: 5000,    // 5s max wait for transaction slot
    timeout: 10000,   // 10s max transaction duration
    isolationLevel: "ReadCommitted", // Prevent dirty reads
  });
}

// Usage example
const result = await runCommandTx(async (tx) => {
  const user = await tx.user.update({
    where: { id: userId },
    data: { coins: { decrement: itemCost } },
  });
  
  const item = await tx.inventoryItem.create({
    data: { userId: user.id, itemId, qty: 1 },
  });
  
  return { user, item };
});
```

### 8.5 Connection Health Monitoring

```typescript
// Health check endpoint
async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}

// Periodic heartbeat
setInterval(async () => {
  const healthy = await checkDatabaseHealth();
  if (!healthy) {
    // Alert, retry, or graceful shutdown
  }
}, 30000); // Every 30 seconds
```

---

## 9) "AI Agent Operating Procedure" for Prisma 7 Changes

When an AI agent touches Prisma-related files, enforce these invariants:

### Allowed Modifications

| File | Allowed Operations |
|------|-------------------|
| `prisma/schema.prisma` | Model changes, generator config, enum additions |
| `prisma.config.ts` | URL config, seed config, migration path |
| `prisma/migrations/**` | Generated via `migrate dev` only in dev |
| `prisma/seed.ts` | Seed data updates |
| `src/shared/prisma.ts` | Single source of truth for PrismaClient |
| Build scripts | Ensure `prisma generate` happens |

### Forbidden Actions

| Action | Why |
|--------|-----|
| Running `migrate dev` against production DB | Destructive, interactive-only |
| Editing migration SQL manually | Unless in controlled "migration repair" procedure |
| Changing generator output paths | Without simultaneously updating all imports |
| Using `datasources` in PrismaClient constructor | Removed in Prisma 7 |
| Adding `url` to datasource in schema | Moved to prisma.config.ts in v7 |
| Mismatched prisma/client versions | Causes cryptic runtime errors |

### Required Checks Before Merging

- [ ] `npx prisma format` passes (schema is valid)
- [ ] `npx prisma generate` succeeds
- [ ] `npx prisma migrate deploy` succeeds against staging DB
- [ ] Bot startup smoke test passes (connect + one trivial query)
- [ ] Connection count is acceptable under expected concurrency
- [ ] No TypeScript errors in files that import Prisma

### Small Diffs Workflow

When implementing changes:

1. Identify the smallest set of files to edit
2. Apply changes in **reviewable steps**
3. After each step, ensure the repo still builds or at least typechecks
4. When Prisma schema changes:
   - Run `npx prisma format`
   - Run `npx prisma migrate dev --name <short_name>` locally (interactive)
   - Run `npx prisma generate`
   - Update any seed script + tests
5. Commit schema + migration + generated changes together

---

## 10) Minimal "Golden Configuration" Snippets (Copy/Paste)

### `schema.prisma` (Library Engine — Infinity-Gauntlet Pattern)

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
  engineType    = "library"
}

datasource db {
  provider = "postgresql"
}

// Models go here...
```

### `schema.prisma` (Driver Adapter Pattern — Alternative)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// Models go here...
```

### `prisma.config.ts`

```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    // Prefer direct URL for migrations
    url: env("DIRECT_DATABASE_URL") ?? env("PROD_DATABASE_URL") ?? env("DATABASE_URL"),
  },
});
```

### `src/shared/prisma.ts` (Library Engine)

```typescript
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: [
    { emit: "stdout", level: "error" },
    { emit: "event", level: "query" },
  ],
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
});
```

### `src/db/prisma.ts` (Driver Adapter — Alternative)

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({ 
  connectionString: process.env.DATABASE_URL! 
});

export const prisma = new PrismaClient({ adapter });

// Graceful shutdown
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
});
```

### `package.json` Scripts

```json
{
  "scripts": {
    "prisma:generate": "prisma generate",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:seed": "prisma db seed",
    "prisma:studio": "prisma studio",
    "prisma:format": "prisma format",
    "build": "npm run prisma:generate && tsc -p tsconfig.build.json",
    "start": "node dist/index.js"
  }
}
```

---

## 11) What I Recommend You Do Next (In Order)

1. **Verify current configuration is correct:**
   - [ ] Check `engineType = "library"` is in schema (for library engine approach)
   - [ ] Verify `prisma.config.ts` exists and has correct URL
   - [ ] Confirm `prisma generate` runs in build pipeline
   - [ ] Check `prisma` and `@prisma/client` are same version

2. **Add Render env vars:**
   - [ ] `DATABASE_URL` = Runtime URL (potentially PgBouncer for high concurrency)
   - [ ] `PROD_DATABASE_URL` or `DIRECT_DATABASE_URL` = Direct DB URL (migrations)

3. **Configure Render:**
   - [ ] Pre-deploy command: `npm run prisma:migrate:deploy`
   - [ ] Build command includes `prisma generate`

4. **Validate staging deploy before production:**
   - [ ] Run migrations on staging first
   - [ ] Smoke test bot startup
   - [ ] Verify query performance

5. **Only after stability:** 
   - Add query tagging/structured logging via Prisma client options (observability)
   - Consider PgBouncer if approaching connection limits

---

## 12) Claude Task Templates (Use These as "Macros")

### 12.1 Add a New Model/Table

1. Edit `prisma/schema.prisma` - add model definition
2. Run locally:
   ```bash
   npx prisma format
   npx prisma migrate dev --name add_<model_name>
   npx prisma generate
   ```
3. Update:
   - Seed script if it's catalog data
   - TypeScript types/interfaces if needed
   - API layer (DTOs, validators)
   - Tests (unit + integration)
4. Confirm Render flow will run:
   - Pre-deploy `prisma migrate deploy`
5. Commit: schema + migration + generated types together

### 12.2 Add a New "Catalog" Concept (Move/Item/Species)

- Prefer stable `key` fields (e.g., `ember_fox`, `quick_attack`)
- Seed via `prisma/seed.ts`
- Use idempotent `upsert` (by `key`) so seed can run repeatedly

```typescript
// prisma/seed.ts example
async function seedSpecies() {
  const species = [
    { key: "ember_fox", name: "Ember Fox", baseJson: { hp: 45, atk: 60 } },
    { key: "aqua_seal", name: "Aqua Seal", baseJson: { hp: 50, atk: 50 } },
  ];
  
  for (const s of species) {
    await prisma.species.upsert({
      where: { key: s.key },
      update: { name: s.name, baseJson: s.baseJson },
      create: s,
    });
  }
}
```

### 12.3 Add a New "Stateful" Concept (Battle/Encounter/Cooldowns)

- Every write inside a transaction
- Add audit logs for reproducibility
- Add indexes for your query shapes
- Add optimistic concurrency if multiple processes/commands might race

```typescript
// Example: Create encounter with audit
async function createEncounter(userId: string, channelId: string, kind: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { rngSeed: true, rngCounter: true },
    });
    
    const encounter = await tx.encounter.create({
      data: {
        userId,
        channelId,
        kind,
        seed: user.rngSeed,
        resultJson: {}, // Will be populated by encounter logic
      },
    });
    
    await tx.user.update({
      where: { id: userId },
      data: { rngCounter: { increment: 1n } },
    });
    
    return encounter;
  });
}
```

### 12.4 Fix a Migration That Failed

1. **DO NOT** manually edit migration files in production
2. For development, reset migration state if safe: 
   ```bash
   npx prisma migrate reset  # WARNING: Drops all data!
   ```
3. Or create a corrective migration with:
   ```bash
   npx prisma migrate dev --create-only --name fix_<issue>
   # Edit the generated SQL if needed
   npx prisma migrate dev
   ```
4. Apply with `migrate deploy` after review on staging

### 12.5 Upgrade Prisma Version

```bash
# 1. Update packages (keep versions aligned!)
npm install prisma@latest @prisma/client@latest

# 2. Regenerate client
npx prisma generate

# 3. Check for breaking changes in schema
npx prisma format

# 4. Run migrations to verify
npx prisma migrate deploy

# 5. Test locally before deploying
npm run dev
```

---

## 13) Infinity-Gauntlet Project Specifics

### 13.1 Current Schema Approach (Library Engine)

**CRITICAL:** This project uses `engineType = "library"` for direct PostgreSQL connections, NOT the new `prisma-client` generator with adapters. This is because:

1. We use Render-managed PostgreSQL with direct connections
2. We don't use Prisma Accelerate or driver adapters
3. The library engine is proven stable for our use case
4. Minimal code changes required from pre-v7 setup

**Current generator block:**
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
  engineType    = "library"
}
```

### 13.2 Database URL Architecture

| Environment Variable | Purpose | Used By |
|---------------------|---------|---------|
| `PROD_DATABASE_URL` | Primary production database (Render-managed) | Runtime + Migrations |
| `RENDER_DB_EXTERNAL_URL` | Direct external access | Migrations from local |
| `RENDER_DB_INTERNAL_URL` | Internal Render network | Runtime on Render |
| `DATABASE_ONPREMISE_DEV_PRIMARY` | Local workstation development | Offline development |
| `DATABASE_ONPREMISE_DEV_EXPERIMENT` | Migration testing | Schema experiments |

### 13.3 Breaking Change Timeline

**Production failure on 2025-12-18/19:**

Prisma 7 changed the default `engineType` from `"library"` to `"client"`. The `"client"` engine requires either:
- An `adapter` (like `@prisma/adapter-pg`)
- An `accelerateUrl` for Prisma Accelerate

**Root Cause:** Schema didn't have explicit `engineType`, relied on default behavior which changed in v7.

**Fix Applied:** Explicitly set `engineType = "library"` in schema.prisma.

**Lesson Learned:** Always explicitly configure critical settings, never rely on defaults that can change between major versions.

### 13.4 Prisma Client Instantiation (Our Pattern)

```typescript
// src/shared/prisma.ts - Actual implementation pattern
import { PrismaClient } from "@prisma/client";

const baseOptions = {
  log: [
    { emit: "stdout", level: "error" },
    { emit: "event", level: "query" }, // Performance monitoring
  ],
};

// Library engine uses direct connection, no adapter needed
// URL comes from DATABASE_URL environment variable automatically
export const prisma = new PrismaClient(baseOptions);

// Optional: Additional clients for workstation development
export const onPremiseDevPrisma = process.env.DATABASE_ONPREMISE_DEV_PRIMARY
  ? new PrismaClient({ datasourceUrl: process.env.DATABASE_ONPREMISE_DEV_PRIMARY })
  : null;
```

### 13.5 Three-Database System

```typescript
// THREE Prisma clients initialized on startup:
import { prisma, onPremiseDevPrisma, onPremiseExperimentPrisma } from "./shared/prisma.js";

// PRIMARY: Unified Render-managed PostgreSQL (all production operations)
const prodUsers = await prisma.user.findMany(); // PROD_DATABASE_URL

// OPTIONAL: Workstation development (offline fallback)
if (onPremiseDevPrisma) {
  const localUsers = await onPremiseDevPrisma.user.findMany();
}

// OPTIONAL: Migration testing (isolated experiments)
if (onPremiseExperimentPrisma) {
  const experimentUsers = await onPremiseExperimentPrisma.user.findMany();
}
```

### 13.6 Live Game Performance Requirements

| Operation | Target Latency | Notes |
|-----------|---------------|-------|
| L1 Cache reads | <1μs | Pokemon data, moves, type chart |
| Write Buffer pushes | <10μs | Battle logs, anomalies |
| Database writes | <50μs | Game state, battles |
| Database reads | <5ms | Player queries |
| Cache refresh | <1s | Hourly background task |

---

## 14) Appendix: Prisma v7 + Render References

Keep these links open when debugging:

| Topic | Link |
|-------|------|
| Prisma Config Reference | [Prisma Docs][1] |
| Prisma 7 Release Blog | [Prisma Blog][2] |
| PostgreSQL Connector | [Prisma Docs][3] |
| GitHub Issue #28670 (ESM/adapter crash) | [GitHub][4] |
| Upgrade to Prisma 7 Guide | [Prisma Docs][5] |
| Development vs Production Workflows | [Prisma Docs][6] |
| Migrate Limitations | [Prisma Docs][7] |
| Render PostgreSQL Pooling | [Render Docs][8] |
| Why Configure DB Twice? | [GitHub Discussion][9] |
| Connection URLs Reference | [Prisma Docs][10] |
| Database Drivers Overview | [Prisma Docs][11] |
| @prisma/adapter-pg on npm | [npm][12] |
| Seeding Workflows | [Prisma Docs][14] |
| Custom Output Imports | [GitHub Discussion][15] |
| Generating Prisma Client | [Prisma Docs][16] |
| Deploying Database Changes | [Prisma Docs][17] |
| Deploy to Render | [Prisma Docs][18] |
| Database Connections & Pooling | [Prisma Docs][19] |
| Generators Reference | [Prisma Docs][20] |

---

## 15) Reference Canonical Schema (Infinity-Gauntlet Baseline)

This schema is intentionally:
- Strongly typed for core relations
- Uses JSON for "engine-defined effects/state" so the battle engine can evolve
- Indexes high-frequency queries (by discordId, by ownerId, by battle status)

> Note: This is **Pokémon-like**, not Pokémon. Use your own species keys, move keys, item keys, and flavor text.

```prisma
// prisma/schema.prisma (reference excerpt)

generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
  engineType    = "library"
}

datasource db {
  provider = "postgresql"
}

enum ElementType {
  NORMAL FIRE WATER GRASS ELECTRIC ICE FIGHTING POISON
  GROUND FLYING PSYCHIC BUG ROCK GHOST DRAGON DARK STEEL FAIRY
}

enum BattleStatus {
  PENDING ACTIVE COMPLETE ABORTED
}

enum LogLevel {
  DEBUG INFO WARN ERROR AUDIT
}

model User {
  id        String   @id @default(uuid())
  discordId String   @unique
  username  String?

  // Deterministic RNG (per-user stream)
  rngSeed    BigInt
  rngCounter BigInt   @default(0)

  // UI/session state
  uiState Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  monsters   Monster[]
  parties    Party[]
  storage    StorageBox[]
  inventory  InventoryItem[]
  encounters Encounter[]
  battles    BattleParticipant[]
  logs       Log[]

  @@index([discordId])
}

model Species {
  id   String @id @default(uuid())
  key  String @unique // stable internal key, e.g. "ember_fox"
  name String
  baseJson Json // base stats + growth rules

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  monsters Monster[]
}

model Move {
  id   String @id @default(uuid())
  key  String @unique
  name String

  type     ElementType
  power    Int?
  accuracy Int?
  pp       Int?
  priority Int @default(0)

  effectJson Json // Engine-defined move logic

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  monsterMoves MonsterMove[]

  @@index([type])
}

model Monster {
  id         String   @id @default(uuid())
  ownerId    String
  owner      User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  speciesKey String
  species    Species  @relation(fields: [speciesKey], references: [key], onDelete: Restrict)

  nickname String?
  level    Int @default(1)
  exp      Int @default(0)
  buildJson Json // IV/EV/ability/status payloads

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  moves       MonsterMove[]
  partySlots  PartySlot[]
  storageSlot StorageSlot[]

  @@index([ownerId])
  @@index([speciesKey])
}

model Battle {
  id        String       @id @default(uuid())
  status    BattleStatus @default(PENDING)
  serverId  String
  threadId  String?
  seed      BigInt
  turn      Int @default(0)
  stateJson Json // authoritative battle state blob

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  participants BattleParticipant[]
  logs         Log[]

  @@index([serverId, createdAt])
  @@index([status, updatedAt])
}

model Encounter {
  id     String @id @default(uuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  channelId String
  kind      String // "walk" | "search" | "fish" etc

  seed       BigInt
  createdAt  DateTime @default(now())
  resolvedAt DateTime?

  resultJson Json // rolled species, rarity, weather/time modifiers

  @@index([userId, createdAt])
  @@index([channelId, createdAt])
}

model Log {
  id      String   @id @default(uuid())
  level   LogLevel @default(INFO)
  message String

  userId   String?
  battleId String?
  meta     Json

  createdAt DateTime @default(now())

  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  battle Battle? @relation(fields: [battleId], references: [id], onDelete: Cascade)

  @@index([level, createdAt])
  @@index([userId, createdAt])
  @@index([battleId, createdAt])
}
```

---

**Last Updated:** 2025-12-19  
**Revision:** 2.0 — Comprehensive migration bible with emergency triage, failure modes, golden configurations, and authoritative references

[1]: https://www.prisma.io/docs/orm/reference/prisma-config-reference "Prisma Config Reference"
[2]: https://www.prisma.io/blog/announcing-prisma-orm-7-0-0 "Prisma 7 Release Blog"
[3]: https://www.prisma.io/docs/orm/overview/databases/postgresql "PostgreSQL Connector"
[4]: https://github.com/prisma/prisma/issues/28670 "GitHub Issue #28670"
[5]: https://www.prisma.io/docs/ai/prompts/prisma-7 "Upgrade to Prisma 7"
[6]: https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production "Dev vs Prod Workflows"
[7]: https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues "Migrate Limitations"
[8]: https://render.com/docs/postgresql-connection-pooling "Render PostgreSQL Pooling"
[9]: https://github.com/prisma/prisma/discussions/28616 "Why Configure DB Twice?"
[10]: https://www.prisma.io/docs/orm/reference/connection-urls "Connection URLs Reference"
[11]: https://www.prisma.io/docs/orm/overview/databases/database-drivers "Database Drivers"
[12]: https://www.npmjs.com/package/@prisma/adapter-pg "@prisma/adapter-pg npm"
[14]: https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding "Seeding Workflows"
[15]: https://github.com/prisma/prisma/discussions/25127 "Custom Output Imports"
[16]: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client "Generating Prisma Client"
[17]: https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate "Deploying Database Changes"
[18]: https://www.prisma.io/docs/orm/prisma-client/deployment/traditional/deploy-to-render "Deploy to Render"
[19]: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections "Database Connections"
[20]: https://www.prisma.io/docs/orm/prisma-schema/overview/generators "Generators Reference"
