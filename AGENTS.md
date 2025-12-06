# Pokémon Infinity Gauntlet — Agent Operations Guide

## ⚠️ CRITICAL: Patch Engine Compliance (READ FIRST)

**MANDATORY REQUIREMENT:** All work MUST flow through the Patch engine system defined in `Patch.md`. This is NOT optional for:
- ❌ **Error handling and debugging** (all error codes, exceptions, failures)
- ❌ **System optimizations** (performance, memory, startup time, queries)
- ❌ **Architecture upgrades** (database, workers, cache, API changes)
- ❌ **Infrastructure changes** (deployment, configuration, scaling)

**Enforcement:** Any work on errors, optimization, or system upgrades that bypasses Patch.md workflow will be rejected and reverted. No exceptions.

**Required Reading Order:**
1. **`Patch.md`** — Contract rules, Absolutes, workflow (MUST READ FIRST)
2. **`ops/NEXT.yaml`** — Multi-task queue (3 main + 1 quick/hot task)
3. **`Tasklist.md`** — READY queue, dependencies, acceptance criteria
4. **`Prompt.md`** — Current state, PATCHSET echo, recent changes
5. **This document** — Operations guide and capabilities

**See Patch Engine Enforcement at:** Lines 1-25 (introduction), Line 150 (orientation flow), Line 400 (contract workflow), Line 650 (final reminder)

---

## Mission
An agentic system that routes tasks to capable sub-agents, never gets stuck, and can self-heal after errors. The system prioritizes safety, observability, and progress over perfection.

**Phase 9 Complete** (2025-11-07): Repository is production-ready, centralized, standardized, and scalable. All quality metrics optimized: zero linter warnings, zero npm vulnerabilities, zero outdated packages, fast tests (6.82s), clean documentation. See `ops/REPO-OPTIMIZATION-REPORT.md` for comprehensive achievements.

**Recent Enhancements (November-December 2025)**:
- ✅ **Comprehensive Documentation Project (Task 12, December 2025)**: **105+ pages** of professional-grade operational and architectural documentation created:
  * **Worker Troubleshooting Guide** (22 pages) — ALL failure scenarios, recovery procedures, diagnostic workflows
  * **Database Operations Runbook** (25 pages) — Master-mirror-staging pipeline, live game real-time requirements (<1μs cache, <50μs writes)
  * **/ops Commands Reference** (28 pages) — Complete reference for all 9 administrative commands with 50+ parameter combinations
  * **Complete System Architecture** (30 pages) — 10 detailed diagrams covering service topology, dependency graphs, data flows, error handling
  * **📚 CRITICAL: Read Recent Documentation** — These comprehensive guides are AUTHORITATIVE for database operations, worker management, system architecture, and troubleshooting
- ✅ **Private Channel Architecture (2025-11-21)**: **MAJOR ARCHITECTURE PIVOT** — Migrating from Discord DMs to private guild channels for all gameplay. Each user gets a dedicated "homestead" channel (homestead-{username}) within the Discord guild. Eliminates DM delivery failures, enables guild admin moderation, provides audit trail. 6-phase migration affecting 10 call sites, 4 modules, 6 feature areas. Complete 900-line architecture specification created. Foundation phase READY for implementation.
- ✅ **Memory Safety Audit Complete**: 13/13 runtime structures bounded, peak RAM ~300-350 MB (15-17% of 2 GB RAM limit, upgraded from Starter 512 MB on 2025-11-17)
- ✅ **Resource Limits Clarification**: Clear distinction between RAM (2 GB volatile memory) and persistent disk (1 GB /Store volume) documented in `docs/RESOURCE-LIMITS-RAM-VS-DISK.md`
- ✅ **Discord.js Cache Management (2025-11-17)**: Configured cache limits + sweeping to prevent unbounded growth (50-200 MB/day → 0 MB/day on idle bot)
- ✅ **7-Day State Persistence**: Security bot maintains hourly metrics with full restart continuity (Store/security-bot-state/)
- ✅ **Event Bus Phase 2.4.3**: IntelligentLogger migration complete with correlation tracking and pattern caching
- ✅ **Cache Management**: Discord.js automatic sweeping prevents 100+ MB memory leaks

**✅ HOMESTEAD CHANNEL MIGRATION COMPLETE (2025-06-15):**
- **GAMEPLAY PLATFORM:** Private guild channels (homestead-{username}) — NOT Discord DMs
- **MIGRATION STATUS:** ✅ COMPLETE — All 10 createDM() call sites migrated, src/bot/dm/ deleted
- **IMPLEMENTATION:** `src/bot/homestead/` (home.ts, heal.ts, starters.ts)
- **SERVICE LAYER:** `src/services/homestead-manager.ts` (HomesteadChannelManager)
- **SPECIFICATION:** `docs/architecture-bible/18-private-channel-architecture.md`

**⚠️ CRITICAL RESOURCE DISTINCTION:**
- **RAM:** 2 GB (2048 MB) — Process memory, tracked by `process.memoryUsage().rss`, monitored by `resource-monitor.ts`
- **Disk:** 1 GB (974 MB) — Persistent /Store volume, tracked via `fs.statfsSync()`, manual monitoring
- **Why It Matters:** Different resources, different limits, different failure modes (OOM kill vs write failures)
- **Complete Guide:** `docs/RESOURCE-LIMITS-RAM-VS-DISK.md` (375 lines, quick reference card, glossary)

**Cross-References**:
- See `Patch.md` for contract rules, marker modes, Absolutes (read first before any work)
- See `Prompt.md` for current timestamp, recent changes, PATCHSET echo
- See `Tasklist.md` for backlog (READY queue, dependencies, acceptance criteria)
- See `README.md` for getting started guide, architecture snapshot, Phase 9 achievements
- See `OPERATIONS.md` for service matrix, rollout checklist, observability
- **📚 See `docs/operations-bible/` for AUTHORITATIVE operational documentation:**
  * `worker-troubleshooting-comprehensive.md` (22 pages) — ALL worker failure scenarios with recovery procedures
  * `database-operations-runbook-comprehensive.md` (25 pages) — Complete database ops, live game architecture, master-mirror-staging pipeline
  * `ops-commands-reference-comprehensive.md` (28 pages) — Complete /ops commands reference with 50+ parameter combinations
- **📚 See `docs/architecture-bible/` for AUTHORITATIVE architecture documentation:**
  * `complete-system-architecture.md` (30 pages) — System topology, dependency graphs, data flows, 10 detailed diagrams
  * `18-private-channel-architecture.md` — Homestead channel architecture (DM → Guild Channels, ✅ COMPLETE)
  * `17-service-registry.md` — Service Registry deep dive (740 lines, dependency injection, health monitoring)
- **📚 See `docs/projects/` for WORK-IN-PROGRESS documentation:**
  * `README.md` — **Bible-centric documentation system** (staged workflow, 100% accuracy requirement)
  * Active projects document as they build, Bible integration after AI integrity validation
  * **CRITICAL:** Never edit Bible directly during development — use projects/ staging area first
- See `docs/workers.md` for worker architecture, scaling roadmap (Phase 10+), cost optimization
- See `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` for deployment readiness validation
- See `docs/OPTIMIZATION-BIBLE.md` for comprehensive system optimization roadmap (startup, console logging, profile creation, runtime weight, queries, cache)
- See `docs/engine-db-persistence-opportunities.md` for Engine DB disk persistence migration (sql.js → better-sqlite3, 78% memory reduction)

**🔥 CRITICAL REQUIREMENT — Documentation Maintenance:**
- **When modifying architecture/operations:** UPDATE corresponding Bible sections in SAME commit
- **When discovering outdated references:** Document in Tasklist.md for systematic cleanup
- **Long-term project (est. 1 year):** Replace ALL deprecated references across entire codebase
- **Goal:** After completion, everything should look brand new with consistent, accurate documentation
- **Bible drift causes production failures** — Keep documentation synchronized with implementation

**Referenced By**: README.md (operations guide), Patch.md (Absolutes), ops/NEXT.yaml (guidance references), ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md (architecture reference)

## Repo Map
- `router/` — meta-router implementation and agent routing runtime
- `ops/` — governance surface (optimization reports, tasklists, routers, recovery, touchmap, policies)
- `scripts/` — automation (guards, data pipeline, bootstrap, cache tooling, workers)
- `src/` — TypeScript application source (bot, core engines, data pipeline, shared runtime, workers)
- `Store/` — on-disk cache namespaces maintained by runtime services
- `data/` — reference datasets generated by the pipeline
- `docs/` — architecture, safety, operations, runbooks, and knowledge guides (Phase 9: 25 current + 6 archived)
- `playbooks/` — escalation and recovery recipes
- `tools/` — vendored binaries (e.g., Postgres bundle) and helpers
- `tests/` — Vitest coverage for engines, data, ops, and cache surfaces (269 passing, 14 failing, 137 skipped of 420 total; 4.22s execution; DEV connection issues under investigation)

## Orientation Flow
- **START HERE:** Read `Patch.md` completely before ANY work. Understand marker modes, Absolutes, and the multi-task queue system (3 main + 1 quick/hot task). This is MANDATORY for errors/optimization/upgrades.
- **📚 READ RECENT DOCUMENTATION (Task 12, December 2025):** Review comprehensive operational and architectural guides before making changes:
  * `docs/operations-bible/worker-troubleshooting-comprehensive.md` (22 pages) — ALL worker failure scenarios
  * `docs/operations-bible/database-operations-runbook-comprehensive.md` (25 pages) — Complete database ops + live game architecture
  * `docs/operations-bible/ops-commands-reference-comprehensive.md` (28 pages) — ALL /ops administrative commands
  * `docs/architecture-bible/complete-system-architecture.md` (30 pages) — System topology with 10 detailed diagrams
  * **These documents are AUTHORITATIVE** — Read before implementing database, worker, or monitoring features
- Review `ops/NEXT.yaml` to see active task queue and quick task slot availability.
- Review `Prompt.md` for the current timestamp, revision, recent repo changes, and PATCHSET echo so you know what happened last.
- Use `masterroutetable.md` alongside `ops/ROUTER.yaml` to map directories to their routers before touching code or docs.
- Consult `README.md` and domain-specific docs under `docs/` for architecture, operations, and safety context; follow links from the router manifests when deeper knowledge is required.
- `Tasklist.md` captures backlog intent, but only act after verifying readiness in `Patch.md`/`Prompt.md` and aligning with `ops/NEXT.yaml`.
- **🔥 WHEN CHANGING ARCHITECTURE/OPERATIONS:** Update corresponding Bible sections in SAME commit to prevent documentation drift

---

**⚠️ PATCH ENGINE CHECKPOINT #1:** Before proceeding, confirm you've read `Patch.md` and understand the multi-task queue system. All error handling, optimization, and upgrade work MUST use this workflow.

---

## Core Control Documents
- `Patch.md` — AI Project Manager Contract. Defines marker modes, clipboard expectations, hotfix loop, and Absolutes. Never edit outside the rules described here.
- `Prompt.md` — Operational prompt. Holds the current timestamp, revision, Last Repo Changes, PATCHSET echo, and NEXT pointer context.
- `Tasklist.md` — Task ledger. Tracks backlog, in-flight efforts, and outcomes. When tasks close, record status changes here.
- `masterroutetable.md` — Human-readable router index. Pairs with `ops/ROUTER.yaml` for canonical routing metadata.
- `README.md` (Router & Meta Index section) — Cross-links routers, contract files, and meta tooling for external automation.
- `ops/DB_BOOTSTRAP.md` — Staging Postgres bootstrap runbook covering migrate deploy vs. db push safety.
  - Expect `PROD_DATABASE_URL` (Render-managed PostgreSQL) to be configured. Runtime services use PROD_DATABASE_URL for all operations including gameplay and migrations.
- `docs/operations-bible/database-operations-runbook-comprehensive.md` — **CRITICAL (25 pages):** Canonical database URL selection logic, live game architecture (<1μs cache, <50μs writes), master-mirror-staging pipeline. Production requires `PROD_DATABASE_URL` (direct PostgreSQL - Render managed database). Non-compliance causes production failures. Read this before any database operation.

## How to Run Locally
- **Install:** `npm install`
- **Start dev:** `npm run dev`
- **Test:** `npm test`
- **Lint:** `npm run lint`
- **Env needed (do not commit secrets):** use `secrets/Infinity-Gauntlet.env` as the **single consolidated environment file** for all local development and testing. This file contains all required keys: BOT_TOKEN, PROD_DATABASE_URL, RENDER_DB_EXTERNAL_URL (direct PostgreSQL), DATABASE_ONPREMISE_DEV_PRIMARY (local workstation), and POKEMON_BOT_TOKEN. Load it with `IG_ENV_FILE`; keep the repo `.env` empty so local tooling always pulls from the external file. **No other key files are needed for development.**

## On-Premise Database Access (Local Development Only)

**PRODUCTION ARCHITECTURE:** Render deployments use **unified managed PostgreSQL** (infinity-gauntlet-db). All DATABASE_URL/PROD_DATABASE_URL/RENDER_DB_EXTERNAL_URL point to the same Render-managed database for simplicity and reliability.

**LOCAL DEVELOPMENT:** On-premise databases (DATABASE_ONPREMISE_DEV_PRIMARY) provide offline development capability when cloud databases are unavailable. These are **workstation-only** and never used in production.

1. **Environment file:** use `secrets/Infinity-Gauntlet.env` as the single consolidated environment file containing all development keys. This file includes PROD_DATABASE_URL, RENDER_DB_EXTERNAL_URL (direct PostgreSQL), DATABASE_ONPREMISE_DEV_PRIMARY (local workstation), BOT_TOKEN, and POKEMON_BOT_TOKEN. **No other environment files are needed.**
2. **Load environment before DB work:** run `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist` to activate the environment. Production skips repo `.env` unless `IG_ALLOW_REPO_ENV=1`, so this override must be active.
  - **FOR MIGRATIONS:** Migrations use direct PostgreSQL access via `PROD_DATABASE_URL` or `RENDER_DB_EXTERNAL_URL` (Render-managed database).
  - **Verify access:** `echo $Env:IG_ENV_FILE` should print the chosen file; use `Get-Content secrets/Infinity-Gauntlet.env | Select-Object -First 5` to confirm it is reachable before running tooling.
  - **Automation service:** `npm run db:auto-sync` detects unified architecture mode and exits gracefully when all URLs point to same database.
3. **Inspect databases:** use the database CLI tool:
  ```powershell
  npm run db:cli -- status         # connection info + sample counts
  npm run db:cli -- counts         # common table counts (Species, BusMessage, ...)
  npm run db:cli -- count Species  # single-table helpers
  npm run db:cli -- query "SELECT COUNT(*) FROM \"Species\";"
  ```
4. **Bootstrap the local workstation database (OPTIONAL for offline development):** set `PG_BIN_DIR` to a Postgres installation with `bin/` + `share/` (e.g., `C:/Program Files/PostgreSQL/17/bin`), then run `npm run ops:bootstrap-onpremise-dev` to mirror the Render database into `Store/onpremise-dev-primary`, rotate timestamped snapshots, and emit `onpremise-url.txt` (e.g., `postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db`) so `src/shared/config.ts` can connect the `onPremiseDevPrisma` client. Prefer `npm run ops:auto-bootstrap-onpremise-dev` when you want the script to install PostgreSQL silently (via winget) and run the mirror in one step. See `docs/WORKSTATION-GAMEPLAY-SETUP.md` for complete setup guide.
5. **Document actions:** log purpose, command, and outcome in `Tasklist.md` under the active task when running anything outside status/counts.

Reference: `docs/ai-env-setup.md` describes the secure loading order and available commands. These tools run locally only; do not expose the secure env path in CI or production. **All development work uses `secrets/Infinity-Gauntlet.env` as the single consolidated environment file.**

## Database URL Selection (CRITICAL - Read Before Any Database Operation)

**As of 2025-11-08**, production uses **unified Render-managed PostgreSQL**. See `docs/operations-bible/database-operations-runbook-comprehensive.md` (25 pages) for complete documentation.

**The Architecture:**
- **PRODUCTION (Render)**: Single managed database (infinity-gauntlet-db) accessed via PROD_DATABASE_URL
- **LOCAL DEVELOPMENT**: Optional on-premise database (DATABASE_ONPREMISE_DEV_PRIMARY) for offline work - Workstation-only

**Canonical URL Selection Logic:**

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
- **Production**: `PROD_DATABASE_URL` → Render-managed PostgreSQL (infinity-gauntlet-db) - **PRIMARY for all operations**
- **Development**: `PROD_DATABASE_URL` → Same Render-managed database (no separate DEV database)
- **Migrations**: `PROD_DATABASE_URL` → Same Render-managed database
- **Local Development** (optional): `DATABASE_ONPREMISE_DEV_PRIMARY` → Workstation PostgreSQL (offline fallback only)

**Contract Status:** This is an **Absolute** requirement in `Patch.md`. Violations cause production failures and must be fixed immediately.

### Database Connection Architecture (Runtime)

**As of 2025-11-08**, the runtime maintains **single production Prisma client + optional LOCAL client**:

- **`prisma`** (PRIMARY) — Connected to `PROD_DATABASE_URL`; **PRIMARY for ALL operations** - gameplay, battles, encounters, migrations, everything. This is the Render-managed PostgreSQL database (infinity-gauntlet-db).
- **`onPremiseDevPrisma`** (LOCAL) — **OPTIONAL** — Connected to `DATABASE_ONPREMISE_DEV_PRIMARY`; offline workstation mirror for local development when Render database is unavailable. May be `null` if not configured.
- **`onPremiseExperimentPrisma`** (EXPERIMENTAL) — **OPTIONAL** — Connected to `DATABASE_ONPREMISE_DEV_EXPERIMENT`; isolated testing database for migration validation. May be `null` if not configured.

All clients initialize on startup via `src/shared/prisma.ts` and maintain independent heartbeat monitoring. The logger (`src/utils/logger.js`) auto-refreshes stats every 15 seconds, displaying telemetry for active connections in console output.

**Key Point:** There is NO separate DEV database in production. `PROD_DATABASE_URL` points to the single Render-managed PostgreSQL database for all environments.

### Dual On-Premise Database Setup (Workstation Only - NOT Production)

**As of 2025-11-08**, workstations can maintain **two independent PostgreSQL clusters** for local development and migration testing. These databases are **completely OFFLINE** and NOT used in production. See `docs/dual-onpremise-database-guide.md` for comprehensive documentation.

**Architecture:**

```
Production (Render)          Workstation (OFFLINE - Local Dev Only)
-------------------          ----------------------------------------

Infinity-Gauntlet-DB ───┐     ONPREMISE-DEV-PRIMARY DB
(Render managed)       │     Port: 55433
Production database    │     Store: Store/onpremise-dev-primary/
All services connect   │     URL: DATABASE_ONPREMISE_DEV_PRIMARY
here                   │     Sync: PULL from Render (one-way)
                       │     Purpose: Local development with cloud-like data
                       │              │
                       ▼              │ Manual Clone
                  Downloads to        ▼
                  workstation    ONPREMISE-DEV-EXPERIMENT
                                 Port: 55434
                                 Store: Store/onpremise-dev-primary-experiment/
                                 URL: DATABASE_ONPREMISE_DEV_EXPERIMENT
                                 Sync: MANUAL clone from ONPREMISE-DEV-PRIMARY
                                 Purpose: Migration testing (isolated)

                                 │
                                 │ EXPLICIT PUSH (when ready)
                                 ▼
                            Upload to Render DB
                            (migrations, schema changes)
```

**CRITICAL:** Both on-premise databases are **completely offline and isolated**. Production cannot see or access either on-premise database. Changes only reach production when you **explicitly push migrations to Render database**.

**Use Cases:**

| Database | Port | Purpose | When to Use |
| --- | --- | --- | --- |
| **ONPREMISE-DEV-PRIMARY** | 55433 | Local development with production-like data | Testing locally with real data structures, offline development |
| **ONPREMISE-DEV-EXPERIMENT** | 55434 | Migration testing, schema experiments | Testing migrations **before** pushing to Render, destructive operations (DROP TABLE, etc.) |

**Workflow:** Test on ONPREMISE-DEV-EXPERIMENT → Validate on ONPREMISE-DEV-PRIMARY → **Push to Render DB**

**npm Scripts:**

```bash
# Bootstrap ONPREMISE-DEV-PRIMARY database (port 55433) - mirrors Render database
npm run ops:bootstrap-onpremise-dev

# Bootstrap ONPREMISE-DEV-EXPERIMENT database (port 55434) from ONPREMISE-DEV-PRIMARY
npm run ops:bootstrap-onpremise-experiment

# Bootstrap ONPREMISE-DEV-EXPERIMENT from DEV master (downloads from cloud)
npm run ops:bootstrap-onpremise-experiment -- --source dev

# Sync ONPREMISE-DEV-EXPERIMENT from ONPREMISE-DEV-PRIMARY (offline sync, default)
npm run ops:sync-onpremise-experiment

# Sync ONPREMISE-DEV-EXPERIMENT from DEV master (downloads from cloud)
npm run ops:sync-onpremise-experiment -- --from dev

# Start ONPREMISE-DEV-EXPERIMENT cluster
npm run ops:start-onpremise-experiment

# Stop ONPREMISE-DEV-EXPERIMENT cluster
npm run ops:stop-onpremise-experiment

# Show status of both databases (running state, row counts)
npm run ops:status-onpremise-dbs
```

**Migration Testing Workflow:**

```bash
# Step 1: Ensure ONPREMISE-DEV-PRIMARY is up-to-date
npm run ops:bootstrap-onpremise-dev

# Step 2: Clone ONPREMISE-DEV-PRIMARY to ONPREMISE-DEV-EXPERIMENT (100% OFFLINE)
npm run ops:bootstrap-onpremise-experiment

# Step 3: Test Phase 2 migration on ONPREMISE-DEV-EXPERIMENT (100% OFFLINE)
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql

# Step 4: Validate migration results (100% OFFLINE)
npm run db:cli -- count User --target experiment
npm run db:cli -- query "SELECT COUNT(*) FROM \"TrainerProfile\";" --target experiment

# Step 5: Test rollback if needed (100% OFFLINE)
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/rollback.sql

# Step 6: Validate on ONPREMISE-DEV-PRIMARY if successful (100% OFFLINE)
npm run ops:sync-onpremise-experiment --from local
psql postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql

# Step 7: ONLY AFTER LOCAL VALIDATION - Push to Render database (CLOUD OPERATION)
# Connect to Render managed database and apply migration
psql $PROD_DATABASE_URL -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql
```

**Key Points:**
- **Steps 1-6 are completely offline** — no cloud connections, no production visibility
- ONPREMISE-DEV-PRIMARY downloads from Render database (one-way PULL), does NOT push changes back
- ONPREMISE-DEV-EXPERIMENT never connects to cloud — fully isolated for testing
- Changes reach production only via **explicit push to Render database** in Step 7
- Both databases use localhost-only connections (127.0.0.1) on ports 55433/55434

**Environment Variables:**

```bash
# secrets/Infinity-Gauntlet.env
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
DATABASE_ONPREMISE_DEV_EXPERIMENT=postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment
```

**Prisma Client Access:**

```typescript
import { prisma, onPremiseDevPrisma, experimentPrisma } from "../shared/prisma.js";

// Production database (Render managed - all operations)
const prodUsers = await prisma.user.findMany();

// ONPREMISE-DEV-PRIMARY database (workstation mirror for offline development)
if (onPremiseDevPrisma) {
  const localUsers = await onPremiseDevPrisma.user.findMany();
}

// ONPREMISE-DEV-EXPERIMENT database (migration testing)
if (experimentPrisma) {
  const experimentUsers = await experimentPrisma.user.findMany();
}
```

**Safety Rules:**
- ✅ DO remember both databases are OFFLINE (localhost-only)
- ✅ DO test migrations on ONPREMISE-DEV-EXPERIMENT before ONPREMISE-DEV-PRIMARY
- ✅ DO validate migrations on ONPREMISE-DEV-PRIMARY before pushing to Render
- ✅ DO document testing results in Tasklist.md
- ❌ DON'T expect production to see local database changes
- ❌ DON'T assume local databases replicate automatically to cloud
- ❌ DON'T skip ONPREMISE-DEV-EXPERIMENT testing — always test destructive operations offline first

**Usage Patterns:**

```typescript
import { prisma, onPremiseDevPrisma, getDatabaseStats } from "../shared/prisma.js";

// PRODUCTION GAMEPLAY (battles, encounters, trainer CRUD) - unified Render database
const gameClient = prisma; // PRIMARY for all operations
const users = await gameClient.user.findMany();

// OFFLINE development (when Render database unreachable)
if (onPremiseDevPrisma) {
  const localUsers = await onPremiseDevPrisma.user.findMany();
}

// Get telemetry for all databases
const stats = getDatabaseStats();
console.log(`PROD: ${stats.prod.status} | LOCAL: ${stats.onPremiseDev.status}`);
```

**Environment Variable Mapping:**

- `PROD_DATABASE_URL` → PROD client (`prisma`) - **PRIMARY for all operations**
- `DATABASE_ONPREMISE_DEV_PRIMARY` → LOCAL client (`onPremiseDevPrisma`) - Optional offline mirror

**When to Use Each Client:**

| Use Case | Client | Reason |
| --- | --- | --- |
| **Live gameplay (battles, encounters, trainer ops)** | **`prisma`** | **PRIMARY for all production operations** |
| Migrations (`prisma migrate deploy`) | `prisma` via `PROD_DATABASE_URL` | Render managed database |
| Development/debugging | `prisma` | Render managed database (same as production in unified mode) |
| Offline development | `onPremiseDevPrisma` | Fallback when Render database unreachable |
| Stats/observability | All via `getDatabaseStats()` | Simultaneous visibility |

See `docs/operations-bible/database-operations-runbook-comprehensive.md` (25 pages) for comprehensive database architecture documentation including `TripleDatabaseStats` type definitions, heartbeat tracking, workstation gameplay setup, and replication flows.

---

## 📖 STANDARDIZED TERMINOLOGY SCHEMA (STRICTLY ENFORCED)

**Effective:** 2025-12-02 | **Authority:** Patch.md Absolutes | **Scope:** ALL code, documentation, comments, logs

This terminology schema is **STRICTLY ENFORCED** throughout the entire codebase. All contributors (human and AI) MUST use these exact terms. Deviations will be flagged in code review and must be corrected before merge.

### Database Terminology (CANONICAL)

| Canonical Term | Environment Variable | Prisma Client | CLI Target | Description |
|----------------|---------------------|---------------|------------|-------------|
| **CLOUD-PROD-MASTER** | `PROD_DATABASE_URL` | `prisma` | `cloud-prod` | Production database (Render-managed PostgreSQL) |
| **ONPREMISE-DEV-PRIMARY** | `DATABASE_ONPREMISE_DEV_PRIMARY` | `onPremiseDevPrisma` | `onpremise-dev` | Workstation development database (offline) |
| **ONPREMISE-DEV-EXPERIMENT** | `DATABASE_ONPREMISE_DEV_EXPERIMENT` | `onPremiseExperimentPrisma` | `onpremise-experiment` | Migration testing database (isolated) |

**🚫 BANNED Database Identifiers (NEVER use as names/targets/identifiers):**
- ❌ `LOCAL` / `local` (as database identifier)
- ❌ `PRIMARY LOCAL` / `primary local`
- ❌ `EXPERIMENTAL` / `experimental` (standalone, without ONPREMISE-DEV- prefix)
- ❌ `DEV_DATABASE_URL` (deprecated environment variable)
- ❌ `LOCAL_DATABASE_URL` (never existed, don't create)

**✅ VALID Descriptive Usage (adjective describing context):**
- ✅ "local development" — Describes workstation/offline development context
- ✅ "local setup" — Section name for workstation configuration
- ✅ "local testing" — Testing methodology on workstation
- ✅ "local machine" — Hardware reference
- ✅ "local secrets" — Workstation-stored credentials

**Key Distinction:** Database **identifiers** (names, targets, env vars) require canonical terms. Descriptive **English** (section names, process descriptions) may use "local" naturally as an adjective.

### Service & Worker Terminology

| Canonical Term | Render Service Name | Purpose |
|----------------|-------------------|---------|
| **Main Bot Worker** | `Infinity-Gauntlet` | Discord bot + auto-sync |
| **Health Check Service** | `infinity-gauntlet-bot` | HTTP health endpoints |
| **Outbox Worker** | `infinity-gauntlet-outbox` | Event bus message delivery |
| **Cache Worker** | `infinity-gauntlet-cache` | Runtime cache maintenance |
| **Data Pipeline Worker** | `infinity-gauntlet-data-pipeline` | Reference data updates |
| **Security Worker** | `infinity-gauntlet-security` | Permission guardrails, monitoring |
| **Pokedex Cache Worker** | `pokedex-cache-worker` | External data sync |
| **Pokedex Failsafe Cron** | `pokedex-cache-failsafe` | Weekly fallback refresh |

### Channel Architecture Terminology

| Canonical Term | Pattern | Description |
|----------------|---------|-------------|
| **Homestead Channel** | `homestead-{username}` | Private guild channel for player gameplay |
| **Public Field Channel** | `field-{area}` | Shared exploration/encounter channels |
| **Arena Thread** | `arena-{battle-id}` | Battle spectator broadcast threads |

**🚫 BANNED Channel Terms:**
- ❌ "DM gameplay" (deprecated architecture)
- ❌ "private DM" for gameplay (use "homestead channel")

### Pokemon Game Engine Terminology

| Canonical Term | Abbreviation | Description |
|----------------|-------------|-------------|
| **PBSL** | — | Pokémon Battle Snapshot Language (deterministic testing) |
| **Dexpack** | — | Compiled Pokemon reference data package |
| **Engine Read-DB** | — | SQLite database for fast Pokemon lookups |
| **Engine Write-DB** | — | SQLite database for battle outcome persistence |
| **L1 Cache** | — | In-memory cache layer (20 MB max) |

### Resource Terminology

| Canonical Term | Value | Description |
|----------------|-------|-------------|
| **RAM Limit** | 2 GB (2048 MB) | Process memory limit (Render Standard plan) |
| **Disk Limit** | 1 GB (974 MB) | Persistent /Store volume |
| **Peak RAM** | ~300-350 MB | Typical runtime memory usage |

### Documentation Terminology

| Canonical Term | Location | Description |
|----------------|----------|-------------|
| **Architecture Bible** | `docs/architecture-bible/` | System design documentation (AUTHORITATIVE) |
| **Operations Bible** | `docs/operations-bible/` | Deployment & monitoring documentation (AUTHORITATIVE) |
| **Development Bible** | `docs/development-bible/` | Local setup & testing documentation (AUTHORITATIVE) |
| **Projects Staging** | `docs/projects/` | Work-in-progress documentation (NOT authoritative until validated) |

### Code Comment Standards

**Database References in Code:**
```typescript
// ✅ CORRECT: Using canonical terms
// Connect to CLOUD-PROD-MASTER for gameplay operations
const users = await prisma.user.findMany();

// ✅ CORRECT: Using canonical terms for fallback
// Fallback to ONPREMISE-DEV-PRIMARY when CLOUD-PROD-MASTER unavailable
if (onPremiseDevPrisma) { /* ... */ }

// ❌ WRONG: Using banned identifier
// Connect to LOCAL database  <-- BANNED
// Use local DB for testing   <-- BANNED as identifier
```

**Descriptive Context (ALLOWED):**
```typescript
// ✅ CORRECT: "local" as adjective describing development context
// Set up local development environment
// Run local tests before pushing

// ✅ CORRECT: Describing workstation context
// Bootstrap local workstation database (ONPREMISE-DEV-PRIMARY)
```

### Enforcement Mechanism

1. **Code Review:** All PRs checked for terminology compliance
2. **AI Assistants:** Copilot, chat modes, agents use canonical terms only
3. **Linting:** Future ESLint rule for banned terms in identifiers
4. **Documentation:** Bible sections use canonical terms exclusively
5. **Audit Reports:** Terminology scans use context-aware detection (not substring matching)

### Schema Updates

**To update this schema:**
1. Propose change in Tasklist.md with justification
2. Update Patch.md Absolutes (canonical source)
3. Update this section in Agents.md
4. Update `.github/copilot-instructions.md`
5. Update `.github/chatmodes/gpt.chatmode.md`
6. Document in Prompt.md PATCHSET echo

**Last Updated:** 2025-12-02 — Initial schema creation, database terminology clarified

---

## State Persistence (Security Bot)

**As of 2025-11-06**, the security bot maintains operational state across restarts via JSON snapshots stored in `Store/security-bot-state/`.

**Purpose:** Give the bot "memory" so it remembers operational history, displays cumulative statistics instead of resetting to zero, and can resume monitoring from where it left off.

**Key Features:**
- **Cumulative Statistics:** Total uptime, sweeps, alerts, permission changes across all restarts
- **Activity Timeline:** Rolling window of last 100 events (sweeps, alerts, changes, errors)
- **Guild Context:** Per-guild tracking of last sweep times, counts, monitoring status
- **Graceful Recovery:** Auto-saves every 5 minutes, final save on shutdown (SIGTERM/SIGINT/crash)
- **Enhanced Restart DMs:** Show restart number, time since last restart, recent activity summary
- **Admin Interface:** `/ops state` command displays full operational history

**State Structure:**
```
Store/security-bot-state/
├── current.json          # Active runtime state
├── previous.json         # Backup from last restart
├── snapshots/           # Timestamped backups (7-day retention)
└── schema.md            # JSON schema documentation
```

**Implementation:**
- `src/bot/state/persistence.js` — Core save/load/shutdown lifecycle with defensive directory creation
- `src/bot/state/stats.js` — Cumulative statistics tracking
- `src/bot/state/timeline.js` — Activity timeline formatting
- `src/bot/state/context.js` — Guild monitoring context restoration

**Integration Points:**
- Startup: `initializeState()` in `src/bot/main.js` ClientReady event, exposes `global.securityBotState` and `global.securityBotClient` for telemetry
- Runtime: `recordSweep()`, `recordPermissionChange()`, `recordAlert()` after operations
- Shutdown: `shutdownState()` on SIGTERM/SIGINT/uncaughtException
- Admin: `/ops state` command in `src/bot/ops/admin.ts`
- Telemetry: `src/utils/logger.js` reads `global.securityBotState` for comprehensive stats display

**Persistent Disk Configuration (Render):**
The `infinity-gauntlet-security` worker has a 1GB persistent disk mounted at `/Store` to ensure state files survive deployments:

```yaml
# render.yaml
- type: worker
  name: infinity-gauntlet-security
  disks:
    - name: security-state
      mountPath: /Store
      sizeGB: 1
```

State files persist at `/Store/security-bot-state/`:
- `current.json` — Active runtime state
- `previous.json` — Backup from last restart
- `snapshots/*.json` — Timestamped backups (7-day retention)

**Usage Patterns:**

```javascript
import { initializeState, saveState, recordSweep } from './state/persistence.js';
import { getStatsSummary } from './state/stats.js';

// Startup - state exposed to globals for telemetry
botState = await initializeState();
global.securityBotState = botState;
global.securityBotClient = client;
autoSaveInterval = startAutoSave(botState);

// After sweep
recordSweep(botState, guildId, guildName, rolesChecked, changesDetected);

// Graceful shutdown
process.on('SIGTERM', async () => {
  stopAutoSave(autoSaveInterval);
  await shutdownState(botState, 'SIGTERM');
  process.exit(0);
});
```

**Observability:**
- Logger auto-refreshes security bot stats from `global.securityBotState` every 15 seconds
- Restart DMs include: restart count, time since last restart, recent activity summary
- `/ops state` command displays full operational history with cumulative metrics
- Render logs show: status (online/initializing/n/a), guilds, last sweep time, assignments, failures

See `docs/security-bot-state.md` and `Store/security-bot-state/schema.md` for comprehensive state persistence documentation including JSON schema, lifecycle, error handling, and troubleshooting.

## Database Replication Architecture (Phase 16)

**As of 2025-11-06**, the system implements a master-replica cascade architecture for database version control and synchronization across PROD, DEV, and Local (workstation) environments.

**Architecture:** PROD (master) → DEV (replica) → Local (workstation replica)

**Purpose:** Ensure PROD is the single source of truth for production data, prevent silent errors during sync, detect rollbacks/divergence, and maintain integrity across all environments.

**Version Tracking Foundation (DB.REPLICATION.VERSION - DONE):**
- **db_version table:** Tracks version fingerprints (SHA-256), migration counts, last migration metadata per environment
- **db_sync_state table:** Records sync operations, status (MATCH/AHEAD/BEHIND/DIVERGED/WAITING_FOR_MASTER), errors, integrity check results
- **Version fingerprint calculation:** `SHA-256(migration_1:checksum|migration_2:checksum|...)` from `_prisma_migrations` table ensures tamper-proof version identity
- **Comparison logic:** Four states determine sync safety:
  - `MATCH` — Identical fingerprints, databases in sync
  - `AHEAD` — Source has more migrations with valid prefix, safe to sync
  - `BEHIND` — Source rolled back (reversion detected), blocks sync until master catches up
  - `DIVERGED` — Different migration histories, requires manual reconciliation
- **Reversion detection:** When PROD migration count < replica count, updates `db_sync_state` with `WAITING_FOR_MASTER`, blocks downstream sync, alerts operators
- **Prefix validation:** Ensures `AHEAD` status is safe by verifying target migrations are exact prefix of source

**Implementation:**
- `src/services/db-replication/version.ts` — Core version tracking module (373 lines)
- `tests/db-replication/version.test.ts` — Comprehensive test suite (15 tests, 100% passing)
- Migration `20251106115259_add_db_version_tables` — Schema foundation

**Usage Patterns:**

```typescript
import { getVersion, compareVersions, handleReversion } from '../services/db-replication/version.js';
import { prisma, devPrisma } from '../shared/prisma.js';

// Get version fingerprint from PROD
const prodVersion = await getVersion(prisma, 'PROD');

// Compare PROD vs DEV to determine sync safety
const comparison = await compareVersions(prodVersion, devVersion, prisma, devPrisma);

if (comparison.status === 'BEHIND') {
  // Reversion detected - PROD rolled back
  await handleReversion(prodVersion, devVersion, devPrisma);
  // Sync blocked, operators alerted
}
```

**Remaining Phases (In Progress):**
- **DB.REPLICATION.INTEGRITY (READY)** — Schema and data integrity verification framework
- **DB.REPLICATION.SYNC (READY)** — 5-stage sync orchestrator with rollback handling
- **DB.REPLICATION.MONITORING (READY)** — Metrics dashboard and alerting
- **DB.REPLICATION.CLI (READY)** — CLI commands and automation
- **DB.REPLICATION.INTEGRATION (READY)** — Multi-connection protocol integration
- **DB.REPLICATION.TESTING (READY)** — Comprehensive end-to-end testing

See `docs/db-replication-architecture.md` for comprehensive architecture documentation covering data flow, integrity verification, sync orchestration, monitoring, and operational workflows.

## Engine Database Replication (Phase 17-22) — COMPLETE

**As of 2025-11-09**, the system implements a **production-ready Engine DB runtime** with 3-tier caching, write buffering, background workers, and comprehensive monitoring. Phase 17-22 delivered 4,416 lines of production code with 0 build errors and 10-100x performance improvements.

**Architecture:** PROD → L1 Cache (Map) → Read-DB (SQLite) → Game Engine → Write Buffer → Write-DB (SQLite) → Validator → PROD

**Purpose:** Provide ultra-fast local lookups for game engine (<1μs L1, ~50ms SQLite vs 50-100ms PostgreSQL), enable offline gameplay, validate data quality before PROD upload, and capture battle outcomes for analysis.

**Completed Implementation (4,416 lines):**

1. **Engine Cache (L1 In-Memory)** — `src/services/engine-cache.ts` (661 lines)
   - API: `getPokemon(id)`, `getPokemonByName(name)`, `getMove(id)`, `getTypeEffectiveness(attack, defense)`, `getStats()`
   - Data structures: `pokemon` Map (by ID), `pokemonByName` Map (secondary index), `moves` Map, `typeChart` Map
   - Performance: <1μs read latency, 20 MB memory, 10M+ ops/sec throughput
   - Refresh: Hourly background refresh with double-buffering (atomic swap)
   - Integration: `src/data/dexpack.js` uses cache-first lookup pattern
   - **Safety**: Defensive copies, corruption detection, automatic integrity checks (see `docs/engine-cache-safety.md`)

2. **Write Buffer (In-Memory Queues)** — `src/services/engine-write-buffer.ts` (476 lines)
   - API: `logBattle(entry)`, `logMoveUsage(entry)`, `logAnomaly(entry)`, `flush()`, `getStats()`
   - Data structures: `battleLogQueue[]`, `moveUsageQueue[]`, `anomalyQueue[]` (arrays)
   - Performance: <10μs push latency, 10k entries per queue max
   - Backpressure: 75% warn, 95% reject, <50% deactivate
   - Flush: Every 30s (atomic splice), calls Write-DB insert methods
   - Integration: `src/commands/battle-turn.js` logs move usage + battle completion

3. **Background Workers (4 Workers)** — `src/workers/engine-workers.ts` (655 lines)
   - Worker 1: CacheRefreshWorker (hourly, +5s stagger) — Calls `engineCache['refresh']()`
   - Worker 2: BufferFlushWorker (30s, +10s stagger) — Calls `engineWriteBuffer.flush()`
   - Worker 3: ReadDbSyncWorker (daily, Render cron) — Placeholder with `recordExecution()` API
   - Worker 4: WriteDbValidatorWorker (10min, +15s stagger) — `validateData()` → `uploadToProd()` → `pruneOldEntries()`
   - Orchestration: `startEngineWorkers()`, `stopEngineWorkers()`, `getEngineWorkersStatus()`
   - Error isolation: Each worker has try-catch, failures don't cascade

4. **Read-DB (SQLite)** — `src/services/engine-read-db.ts` (470 lines)
   - Schema: `pokemon`, `moves`, `type_effectiveness`, `engine_read_version` (4 tables, 7 indexes)
   - API: `getAllPokemon()`, `getAllMoves()`, `getAllTypeEffectiveness()`, `getVersion()`, `getStats()`
   - SQLite config: WAL mode, NORMAL synchronous, cache_size from config, busy_timeout 5000ms
   - Integration: L1 cache loads from this at startup and hourly refresh

5. **Write-DB (SQLite with WAL)** — `src/services/engine-write-db.ts` (697 lines)
   - Schema: `battle_logs`, `move_usage`, `anomalies`, `write_ahead_log` (4 tables, 7 indexes)
   - API: `insertBattleLogs()`, `insertMoveUsage()`, `insertAnomalies()`, `validateData()`, `uploadToProd()`, `pruneOldEntries()`, `replayWAL()`, `getStats()`
   - WAL: `appendToWAL()` with SHA-256 checksum, `replayWAL()` with corruption detection
   - Auto-save: Every 30s (sql.js in-memory → disk)
   - Validation: Quality score calculation (passedRows / validatedRows), 95% threshold
   - Retention: 24h after upload, VACUUM after pruning

6. **Centralized Config** — `src/config/engine-db-config.ts` (558 lines)
   - Environment detection: `IS_PRODUCTION`, `IS_TEST`
   - Storage paths: `/Store/` (prod), `Store/` (local), `Store/test/` (test)
   - Memory limits: 20 MB L1 cache, 10k queue size
   - Feature flags: `L1_CACHE_ENABLED`, `WRITE_BUFFER_ENABLED`, `WORKERS_ENABLED`, `VALIDATION_ENABLED`
   - Validation: `validateEngineDbConfig()` function ensures safe runtime

**Integration Points (310 lines):**

- **Startup/Shutdown Lifecycle** — `src/index.ts` (+140 lines)
  - Initialization (7 steps): validateConfig → Read-DB init → L1 cache load (blocking) → Write-DB init → WAL replay → workers start → `global.engineReady = true`
  - Shutdown (6 steps): mark not ready → stop workers → flush buffer (emergency) → save Write-DB → close Read-DB → cleanup cache
  - Telemetry: `updateEngineSection()` function shows cache hit rate, buffer utilization, database stats, worker errors

- **Cache Integration** — `src/data/dexpack.js` (+80 lines)
  - `getSpecies()` tries `engineCache` first (by ID → by name → fallback to dexpack)
  - Performance: <1μs cache hits, 0.1-1ms dexpack fallback
  - Metrics: Cache hits/misses recorded in dex metrics system

- **Buffer Integration** — `src/commands/battle-turn.js` (+70 lines)
  - After `resolveTurn()`, logs move usage (both sides) + battle completion (on KO)
  - Performance: <10μs per log call, zero impact on battle execution
  - Graceful degradation: Backpressure errors caught, battles continue normally

**Operations & Monitoring:**

- **`/ops engine` Command** — `src/bot/ops/admin.ts` (+150 lines)
  - Stats displayed: L1 Cache (hit rate, memory, entries, latency), Write Buffer (utilization, queues, backpressure), Workers (4 workers with status), Read-DB (counts, size), Write-DB (counts, WAL size, oldest entry)
  - Access control: Admin-only via `isAdmin()` check
  - Error handling: Graceful fallback with error messages

**Performance Metrics:**
- **L1 Cache:** <1μs read latency (10-100x faster than SQLite)
- **Write Buffer:** <10μs push latency (non-blocking battle flow)
- **Read-DB:** ~50ms query latency (cached in L1 after first access)
- **Write-DB:** WAL ensures durability with <5ms append overhead
- **Overall:** 10-100x performance improvement over remote PostgreSQL queries

**Quality Metrics:**
- **Build Status:** ✅ 0 errors, 0 warnings throughout implementation
- **Integration:** ✅ All 5 integration points operational
- **Documentation:** ✅ Comprehensive ROUTER.md updates (services, workers, config)
- **Testing:** ⏳ Unit tests planned (Task 9) — cache, buffer, workers, read-db, write-db

**Implementation Status:**
- ✅ **Phase 17 (COMPLETE):** Engine Read-DB foundation, PROD → Read sync
- ✅ **Phase 18 (COMPLETE):** Engine Write-DB foundation, logging operations
- ✅ **Phase 19 (COMPLETE):** Integrity scanner with validation rules (Write-DB `validateData()`)
- ✅ **Phase 20 (COMPLETE):** Write-DB → PROD sync with PROD schema migration placeholder
- ✅ **Phase 21 (COMPLETE):** Battle engine integration (cache → dexpack, buffer → battle-turn)
- ✅ **Phase 22 (COMPLETE):** Monitoring, automation, `/ops engine` command

**Next Steps:**
- **Task 9 (READY):** Unit tests for all 6 services + integration points (80%+ coverage target)
- **Phase 23+ (READY):** PROD schema migration for battle logs, upload automation, retention policies

See `docs/engine-db-replication.md` for comprehensive design documentation. See `src/services/ROUTER.md`, `src/workers/ROUTER.md`, and `src/config/ROUTER.md` for detailed API documentation and usage patterns.

## Capabilities & Routing Hints

**⚠️ PATCH ENGINE CHECKPOINT #3:** Reminder - Error handling, optimization, and system upgrade tasks must be added to `ops/NEXT.yaml` task queue before work begins.

- **planner:** break down vague goals; produce measurable milestones and resource budgets. (Use Patch.md for errors/optimization/upgrades)
- **researcher:** search, synthesize sources; attach citations & uncertainty notes.
- **implementer:** write/change code and config; run tests. (MUST follow Patch.md workflow for errors/optimization/upgrades)
- **reviewer:** verify diffs, run safety/eval checklists; approve or request changes.

## Contract Workflow Quickstart

**⚠️ MANDATORY FOR: Error handling, Optimization, System upgrades**

1. Open `Patch.md` and review the multi-task queue system (3 main tasks + 1 quick/hot task allowed).
2. Check `ops/NEXT.yaml` to see available task slots (main_tasks queue + quick_task slot).
3. Plan file operations following Patch.md guidelines. Update `ops/NEXT.yaml` task queue.
4. Execute edits exactly as described. Maintain ASCII output, respect existing formatting, and keep comments succinct.
5. Update `Prompt.md` Last Repo Changes and PATCHSET echo before finishing. Ensure `ops/NEXT.yaml` reflects current task state.
6. Clear or archive the clipboard after work. Leave the repository in a consistent state (router docs valid, tests noted, metadata synced).
7. For hotfixes, follow `ops/HOTFIX.md`, `ops/HOTFIX_PLAN.yaml`, and `HOTFIX.md` instructions. Restrict edits to the approved file list unless the plan expands it.

**Non-compliance with this workflow for errors/optimization/upgrades will result in work rejection.**

---

**⚠️ PATCH ENGINE CHECKPOINT #2:** You are now halfway through this document. Remember: ALL error handling, optimization, and system upgrade work MUST flow through Patch.md workflow with proper task queue management.

---

## Router Contract (Mandatory)
- Every change to the Discord bot or its supporting code **must** be accompanied by comprehensive routing updates. This includes adding new files, renaming or moving directories, or changing the purpose/activity of existing files.
- Update all routing systems in the same patchset: `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, `masterroutetable.md`, affected `ROUTER.md` manifests (parent and sub-router), and `ops/TOUCHMAP.yaml` as needed.
- Do not consider a task complete until meta-routers and touch maps fully reflect the new or updated surfaces. If automation generates router docs, rerun the generator and commit the outputs.
- The AI is responsible for verifying that routing guard scripts (`scripts/guard_routing.sh`, `scripts/guard_router_docs.sh`) pass after the update. Resolve any failures before exiting the run.

## Safety Invariants (Must Never Be Violated)

**⚠️ PATCH ENGINE REQUIREMENT:** When handling errors or exceptions, ALL debugging and fixes must flow through Patch.md workflow with proper task queue management.

- Never exfiltrate secrets or raw credentials in outputs.
- Never run shell/DB/file operations without a dry-run or explicit confirmation step in CI.
- Always attach sources for claims from the web; flag low-confidence inferences.
- On error, **self-forgive**: reset working memory, keep the log, try a smaller step.
- **NEW:** On error requiring code changes, add task to `ops/NEXT.yaml` and follow Patch.md workflow.

## Stuckness Detection & Recovery (Self-Healing)

**⚠️ PATCH ENGINE CHECKPOINT #4:** When implementing recovery steps that modify code, optimization, or system configuration, you MUST use Patch.md workflow and update `ops/NEXT.yaml` task queue.

- A run is **stuck** if any of these fire:
  - No new artifact or state change in N=3 consecutive steps.
  - Same error string seen ≥2 times in the last 10 minutes.
  - Budget exceeded (time > 15m or tokens > threshold) without milestone progress.
- Recovery steps (in order):
  1) **Shrink the step** (narrow the scope, reduce toolset).
  2) **Swap strategy** (change search terms, alternate tool, or prompt template).
  3) **Reset context** (clear ephemeral memory; keep breadcrumb log).
  4) **Escalate** using `playbooks/escalate.md` (open an Issue and summarize state).
  5) **If recovery requires code changes:** Add task to `ops/NEXT.yaml` and follow Patch.md workflow (MANDATORY).

## Observability
- Emit events to `logs/agent-events.jsonl` and console: `start|step|error|recovered|done`.
- Use OpenTelemetry traces for tool calls and router decisions.
- Persist final state in `runs/<ISO8601>/run.json`.
- `/ops cache` exposes runtime cache metrics and maintenance cadence; expect `cache.maintenance` events in logs when the scheduler runs or manual cleanup executes.
- **Centralized Log Buffer**: All services use intelligent log buffering (10-second intervals) to reduce console noise. Logs are deduplicated (identical messages show count instead of repeating), aggregated (similar messages grouped with timing metadata), and flushed periodically with summary headers (`📦 Log buffer flush: X unique messages, Y total`). Errors and warnings bypass the buffer for immediate visibility. Configure via `LOG_BUFFER_ENABLED`, `LOG_BUFFER_INTERVAL`, `LOG_BUFFER_BYPASS_CRITICAL` environment variables. See `docs/log-buffer.md` for comprehensive documentation.

## Router Navigation
- Start with `ops/ROUTER.yaml` (router-of-routers) or `masterroutetable.md` for a textual overview.
- Key downstream routers:
  - `src/ROUTER.md` — Application source tree pivoting into domain routers.
  - `src/bot/ROUTER.md` — Discord bot layer, including security bot entry (`main.js`) and drip alert pipeline.
  - `scripts/ROUTER.md` — Guard scripts, router refresh tooling, change ledger automation.
  - `tests/ROUTER.md` — Vitest coverage map for major systems.
- When in doubt, consult `ops/TOUCHMAP.yaml` for file ownership and escalation paths.
- Cache/storage routers now cross-link end-to-end: `src/services/cache/ROUTER.md`, `src/shared/cache/ROUTER.md`, and `Store/ROUTER.md` describe recipes, backends, and persisted namespaces respectively.
- Pair the runbook (`ops/DB_BOOTSTRAP.md`) with `scripts/bootstrap_staging_db.ps1` before touching staging migrations; the script reads the active `IG_ENV_FILE` (defaulting to `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env`), runs `prisma migrate deploy`, and points back to the runbook if baseline tables or connection strings (pooled vs. direct) are missing.

## Documentation System & Bible Integrity

**The Bible is the single source of truth.** Architecture, Operations, and Development Bibles contain AUTHORITATIVE documentation that must be 100% accurate at all times.

### Bible-Centric Staged Workflow

**Problem:** Editing Bible directly during active development risks inaccuracy, stale references, and documentation drift.

**Solution:** Staged documentation system with AI integrity validation before Bible integration.

### Workflow Stages

1. **Project Initialization**: Create `docs/projects/{project-name}/` with subfolders:
   - `architecture/` — Design decisions, diagrams, integration points
   - `implementation/` — Phase notes, gotchas, lessons learned
   - `testing/` — Test plans, validation results
   - `bible-integration/` — Accuracy checklist, proposed Bible changes

2. **Active Development**: Document as you build (no pressure for perfection)
   - Capture architecture decisions in real-time
   - Track implementation challenges and workarounds
   - Document edge cases and failure modes discovered
   - Record performance measurements and benchmarks

3. **Project Completion**: Prepare Bible integration
   - Consolidate findings into `bible-integration/proposed-changes.md`
   - Run AI integrity check against actual codebase
   - Verify 100% accuracy (no speculation, no stale references)
   - Create structured Bible update proposals with exact text and code references

4. **Bible Integration**: Validated updates only
   - AI confirms all code references exist in codebase
   - Verify architecture diagrams match actual system topology
   - Confirm performance claims backed by measurements
   - Update Bible sections with verified information
   - Archive project folder to `docs/projects/archive/{project-name}/`

### Integrity Requirements (100% Accuracy)

**Before ANY Bible update, validate:**
- ✅ **Code Accuracy:** All code snippets/paths verified in current codebase
- ✅ **Architecture Accuracy:** All diagrams match actual implementation
- ✅ **Performance Accuracy:** All metrics backed by actual measurements
- ✅ **Integration Accuracy:** All described integrations exist and function
- ✅ **Version Accuracy:** Schema versions, migration counts current
- ✅ **Cross-Reference Accuracy:** All internal doc links resolve
- ✅ **No Speculation:** Zero future/planned features as current reality

**CRITICAL:** If accuracy check fails, documentation stays in `docs/projects/pending-validation/` until corrected. Bible pollution is NEVER acceptable.

### Bible Structure

- **Architecture Bible** (`docs/architecture-bible/`) — 17 sections, 105+ pages (system design)
- **Operations Bible** (`docs/operations-bible/`) — 12+ sections, 75+ pages (operational procedures)
- **Development Bible** (`docs/development-bible/`) — 7 sections (development workflows)

### Project Documentation

- **Active Projects:** `docs/projects/{project-name}/` (work in progress)
- **Templates:** `docs/projects/.templates/` (project README templates)
- **System Guide:** `docs/projects/README.md` (complete staged workflow documentation)

### Automation (Future)

```powershell
# Create new project with structure
npm run docs:new-project --name "feature-name" --category "architecture|operations|development"

# Validate before Bible integration
npm run docs:validate-bible-integration --project {project-name}
```

**See `docs/projects/README.md` for complete staged workflow documentation, templates, and validation procedures.**

### Project Completion Report Guidelines

**CRITICAL:** All project completion reports must follow timestamp-based naming and proper organization.

#### Naming Convention
**Format:** `YYYY-MM-DD-{descriptive-project-name}.md`

**Examples:**
- `2025-12-02-docs-root-cleanup.md` — Documentation cleanup completion
- `2025-12-15-worker-scaling-implementation.md` — Worker scaling project
- `2025-01-10-cache-optimization-results.md` — Cache optimization report

**Benefits:**
- **Chronological Sorting:** Files naturally sort by date
- **Clear Context:** Instant date visibility
- **Historical Tracking:** Easy to find reports by timeframe
- **Git Alignment:** History matches timestamps
- **Team Coordination:** Clear project timeline

#### Report Locations
- **Cleanup Reports:** `docs/projects/cleanup/`
- **Architecture Reports:** `docs/projects/architecture/`
- **Operations Reports:** `docs/projects/operations/`
- **Development Reports:** `docs/projects/development/`

**Rule:** Keep in `projects/{type}/` — NOT in docs root

#### Phase Tracking
Update parent folder `README.md` with phase entries:

```markdown
### Phase N: {Name} (YYYY-MM-DD)
- **Status:** ✅ COMPLETE
- **Report:** {timestamp-filename}.md
- **Results:** {Key metrics}
- **Impact:** {What changed}
```

#### Key Organizational Principles
1. **Docs Root Discipline:** Navigation files ONLY (ROUTER.md, system summaries)
2. **Project Reports:** Always in `projects/{type}/` with timestamps
3. **Chronological Organization:** `YYYY-MM-DD` prefix for natural sorting
4. **Phase Documentation:** Track in folder READMEs with detailed results
5. **Clear Structure:** Easy to find, maintain, and extend

#### CRITICAL: Category Folder Creation Rule

**When a completion report has no matching category folder:**

❌ **NEVER** leave report in docs root  
✅ **ALWAYS** create the appropriate category folder first

**Required Actions:**
1. Create `docs/projects/{category}/` folder (e.g., development/, operations/, architecture/)
2. Create comprehensive `README.md` in the new folder:
   - Folder purpose and scope
   - Active projects section with phase tracking
   - Guidelines and quality standards
   - Cross-references to related documentation
3. Move completion report to new folder with timestamp naming
4. Update `docs/projects/README.md` to list new folder

**Example Enforcement (2025-12-02):**
```
Found: docs/BIBLE-CENTRIC-SYSTEM-COMPLETE.md (completion report)
Issue: No development/ folder exists
Action: 
  1. Created docs/projects/development/
  2. Created comprehensive README.md
  3. Moved to 2025-12-02-bible-system-complete.md
  4. Updated projects/README.md
Result: ✅ 100% compliance with organizational principles
```

**This is MANDATORY.** Never bypass folder creation — always establish proper infrastructure before moving files.

**See `docs/projects/README.md` for complete completion report template and guidelines.**

---

## AI Specialist Team System (Team-Based AI Workflow)

**PURPOSE:** Every prompt automatically assembles a team of specialized AI agents, each with domain expertise, ensuring comprehensive problem-solving from multiple perspectives.

**INTEGRATION STATUS:** ✅ Fully integrated into Patch.md, ops/NEXT.yaml, Prompt.md (Phase 2 complete, 2025-12-02)

### Team Structure

**Dynamic Lead Assignment:** Lead is assigned based on PRIMARY work type (see detection rules). Lead orchestrates team, ensures quality gates pass, provides final approval.

**Core Specialists (Always Active):**
- **AI Coding Specialist** — Code implementation, technical coordination, quality assurance
- **Documentation Specialist** — Reviews documentation structure, enforces naming conventions, maintains Bible accuracy
- **Architecture Specialist** — Reviews architectural changes, identifies integration impacts, validates technical approaches

**Domain Specialists (Invoked as Needed):**
- **Database Specialist** — Database operations, migrations, performance optimization, data integrity
- **Testing Specialist** — Test coverage, quality assurance, validation, acceptance criteria verification
- **Security Specialist** — Security review, vulnerability detection, best practices, access control validation
- **Performance Specialist** — Performance optimization, resource management, efficiency analysis
- **DevOps Specialist** — Deployment, infrastructure, CI/CD, monitoring setup

### Automatic Detection Rules (Specialist Referral + Lead Assignment)

| Work Type | Lead | Supporting Specialists | Trigger Patterns |
|-----------|------|------------------------|------------------|
| **Documentation** | Documentation | Architecture, AI Coding | `docs/`, `README.md`, `.md` files, "document", "organize" |
| **Database** | Database | Architecture, AI Coding | `prisma/`, `schema.prisma`, "migration", "database", SQL files |
| **Testing** | Testing | AI Coding, Architecture | `tests/`, `.test.ts`, `.spec.ts`, "test", "coverage" |
| **Security** | Security | Architecture, AI Coding | "auth", "permission", "security", "credential", "secret" |
| **Performance** | Performance | Architecture, AI Coding | "optimize", "performance", "cache", "memory", "speed" |
| **Deployment** | DevOps | Architecture, AI Coding | `render.yaml`, `Dockerfile`, "deploy", "CI/CD", `.github/workflows/` |
| **Architecture** | Architecture | AI Coding, Documentation | "design", "architecture", "system", "integration", "API" |
| **Cleanup** | Documentation | AI Coding, Architecture | "cleanup", "organize", "refactor", "consolidate" |
| **Code Implementation** | AI Coding | Architecture, Testing | General coding, bug fixes, feature implementation |

### 5-Phase Workflow Protocol

**Phase 1: Analysis (Determine Lead)**
1. Receive prompt from user
2. Analyze work type using detection rules
3. **Assign lead specialist based on PRIMARY work type**
4. Identify supporting specialists from referral matrix
5. Assemble team with lead + supporting roles
6. Brief team on objectives and context

**Phase 2: Planning (Team Collaboration)**
1. Lead specialist coordinates planning session
2. Each specialist reviews work from their domain perspective
3. Identify concerns (risks, conflicts, dependencies)
4. Propose solutions with specialist expertise
5. Coordinate approach across specialists
6. Document plan with team consensus

**Phase 3: Execution (Coordinated Implementation)**
1. Lead specialist drives implementation strategy
2. Specialists monitor for domain concerns
3. Real-time feedback during implementation
4. Adjustments as needed based on specialist input

**Phase 4: Verification (Multi-Perspective QA)**
1. Each specialist validates deliverable from domain
2. Documentation Specialist checks docs, naming, cross-references
3. Architecture Specialist validates design consistency
4. Testing Specialist checks coverage
5. Security/Performance/DevOps as needed

**Phase 5: Handoff (Knowledge Transfer)**
1. Team consolidates lessons learned
2. Update Bible (Architecture/Operations/Development)
3. Capture patterns for future work
4. Document in PATCHSET echo with specialist signoffs

### Quality Gates (Required for Task Completion)

- ✅ **Documentation Specialist:** All `.md` files, naming conventions, cross-references verified
- ✅ **Architecture Specialist:** System design changes, integration points, API modifications validated
- ✅ **Database Specialist:** Schema changes, migrations, data integrity approved
- ✅ **Testing Specialist:** Test coverage, acceptance criteria validation complete
- ✅ **Security Specialist:** Auth/permission changes, credential handling reviewed
- ✅ **Performance Specialist:** Optimization claims, resource usage validated
- ✅ **DevOps Specialist:** Deployment changes, infrastructure updates approved
- ✅ **Lead Specialist:** Final approval after all domain signoffs (lead is dynamically assigned)

### Task Metadata (ops/NEXT.yaml Structure)

```yaml
main_tasks:
  - id: T15.1
    title: "Task title"
    lead_specialist: documentation  # Dynamically assigned based on work type
    specialists_required:
      - documentation (lead)
      - architecture
      - ai_coding
    specialist_signoffs:
      documentation: pending|approved|concerns
      architecture: pending|approved|concerns
      ai_coding: pending|approved|concerns
```

### PATCHSET Echo Format (Prompt.md)

Every PATCHSET echo now includes:
- **Specialists Involved:** [List with roles, lead marked: "Documentation (Lead), Architecture, AI Coding"]
- **Coordination Notes:** [Key decisions from team discussion, concerns raised, solutions agreed]
- **Quality Gates Passed:** [Specialist signoffs: "Documentation ✅, Architecture ✅, AI Coding ✅"]

### Coordination Patterns

**Pattern 1: Sequential Review**
- **When:** Independent specialist domains (docs → architecture → testing)
- **Flow:** Each specialist reviews in sequence, adds findings, passes to next

**Pattern 2: Parallel Review**
- **When:** Independent concerns (security + performance analysis)
- **Flow:** Specialists review simultaneously, consolidate findings

**Pattern 3: Collaborative Resolution**
- **When:** Conflicting requirements (performance vs maintainability)
- **Flow:** Team discussion, trade-off analysis, consensus decision

**Pattern 4: Lead-Verify**
- **When:** Rapid iteration (AI Coding implements → Specialist verifies)
- **Flow:** Quick feedback loop, domain expertise on demand

### Real-World Example: Documentation Cleanup (2025-12-02)

**Work Type Detection:** "cleanup", "organize", "docs/" → **Documentation Specialist assigned as Lead**

**Specialists Involved:**
- Documentation Specialist (Lead) — Drove organizational strategy, orchestrated cleanup
- AI Coding Specialist — Implemented file moves and code changes
- Architecture Specialist — Reviewed folder structure design, validated cross-references

**Workflow:**
- Phase 1: Analyzed user request → identified cleanup task → assigned Documentation as lead
- Phase 2: Documentation Specialist proposed naming conventions, folder structure
- Phase 3: Team executed file moves, folder creation, README updates (AI Coding implemented)
- Phase 4: Documentation Specialist verified compliance
- Phase 5: Documentation Specialist approved final deliverable

**Quality Gates Passed:**
- ✅ Documentation Specialist (Lead): Naming conventions applied
- ✅ Documentation Specialist (Lead): Folder structure optimal
- ✅ Architecture Specialist: Cross-references validated
- ✅ AI Coding Specialist: All files properly organized

**Result:** 100% compliance with organizational principles

### Integration Points

- **Patch.md § "Specialist Team Coordination"** — Complete workflow protocols (94 lines)
- **ops/NEXT.yaml** — Task metadata with `specialists_required` and `specialist_signoffs` fields
- **Prompt.md § "Embedded PATCHSET Echo"** — Enhanced format with specialist tracking
- **Tasklist.md** — Outcome notes include specialist signoffs

### Success Metrics

**Team Coordination Quality:**
- ✅ Every task has appropriate specialists identified
- ✅ Multi-perspective analysis on all major changes
- ✅ Quality gates passed before completion
- ✅ Documentation reviewed by Documentation Specialist
- ✅ Architecture validated by Architecture Specialist

**Process Efficiency:**
- ✅ Specialist referral automated (detection rules)
- ✅ Coordination overhead minimal (<10% time)
- ✅ Clear handoff protocols followed
- ✅ Team notes captured for learning

**Quality Improvements:**
- ✅ Fewer bugs caught in review (caught earlier by specialists)
- ✅ Better documentation (Documentation Specialist review)
- ✅ Stronger architecture (Architecture Specialist guidance)
- ✅ Higher test coverage (Testing Specialist enforcement)

**See:** `docs/projects/development/AI-SPECIALIST-TEAM-SYSTEM.md` for comprehensive design document (25.8 KB) covering team structure, detection rules, workflow protocols, implementation plan.

**See:** `docs/projects/development/2025-12-02-ai-specialist-team-integration.md` for Phase 2 completion report documenting Patch.md, ops/NEXT.yaml, and Prompt.md integration.

---

## Refresh Policy for Materialized Views
- Only the owner role or a `SECURITY DEFINER` function refreshes DB matviews.
- After DB errors, run `playbooks/db-recovery.md`.

## Operational Playbook
- **Guard Scripts**: `scripts/guard_meta.sh`, `scripts/guard_doc_names.sh`, and `scripts/guard_routing.sh` enforce invariants (READY pointer, canonical spellings, router consistency).
- **Bootstrap Helper**: `scripts/bootstrap_staging_db.ps1` attempts `npx prisma migrate deploy` against staging after loading the `IG_ENV_FILE` secrets (default `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env`), warns when pooled/direct URLs are absent, and prints fallback guidance from the runbook when relations are missing.
- **Local Fallback Bootstrapper**: `npm run ops:auto-bootstrap-onpremise-dev` installs PostgreSQL (if necessary) and hydrates the Store-backed mirror, writing `Store/onpremise-dev-primary/onpremise-url.txt` and pruning stale snapshots so config fallbacks stay current when Render is unavailable; `npm run ops:bootstrap-onpremise-dev` remains available when you only need the mirror refresh.
- **Hotfix Loop**: Trigger naming, suffix rules, and recovery steps live in `ops/HOTFIX.md` and `ops/RECOVERY.yaml`. Update both when issuing or closing hotfixes.
- **Security Bot Guardrail**: Only the guild owner and administrators may change roles or permissions; the security bot auto-reverts other edits, DMing DripTVDD and recording `revertStatus` / `revertErrors` fields when rollback attempts fail.
- **Clipboard Discipline**: Contract Mode ON requires markers, clipboard, and Prompt updates. Markerless Mode (no markers) relaxes the flow but still enforces Absolutes (routers intact, NEXT READY, canonical docs preserved).
- **Logging**: `Prompt.md` PATCHSET echo should contain a concise summary, tasklist diff flag, test statement, contract mode, and NEXT pointer status.
- **Database CLI**: All DB operations funnel through `npm run db:cli` for status, counts, and queries. Load `IG_ENV_FILE` first; production skips repo `.env` unless `IG_ALLOW_REPO_ENV=1`.

## Production & Render Notes

### ⚠️ RENDER ACCESS POLICY (2025-12-06) — ABSOLUTE RULE

**SSH-ONLY ACCESS TO RENDER.** Render API calls are PROHIBITED to minimize costs.

| ✅ ALLOWED | ❌ PROHIBITED |
|------------|---------------|
| SSH via `render ssh` or `wsl ssh` | REST API (`api.render.com`) |
| Render Dashboard (manual operations) | Scripts using `RENDER_API_KEY` |
| Render CLI SSH commands | `Invoke-RestMethod` to Render |

**Enforcement:** API-based scripts archived at `scripts/archive/render-api-deprecated/`

### Service Configuration
- `render.yaml` defines 8 services: web service, 6 workers, 1 cron job
- **See `docs/workers.md` for comprehensive worker architecture, scaling roadmap, and Phase 10+ opportunities**
- **Service ID:** `srv-d3snk2ndiees73cn709g` (main bot worker)
- **SSH Access:**
  - **Windows (Recommended):** `.\scripts\render_ssh_windows.ps1 -Interactive` or VS Code tasks
  - **Direct WSL:** `wsl ssh render-virginia` or `wsl bash -c "render ssh srv-d3snk2ndiees73cn709g"`
  - **Quick Operations:** `.\scripts\render_disk_usage_windows.ps1`, `.\scripts\render_cleanup_heaps_windows.ps1`
- **SSH Key:** `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH2nGfecHh4dwNrs1brxOvwvUUeG7daOsIim4qSzY7sI` (WSL `~/.ssh/render_key`)
- **Dashboard:** https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
- **Complete Reference:** See `ops/RENDER-CREDENTIALS.md` for SSH setup and troubleshooting

### Deployment (Use Dashboard)
- **Auto-deploy:** Push to `main` branch triggers automatic deployment
- **Manual Deploy:** Use Dashboard → Manual Deploy button
- **Restart:** Use Dashboard → Restart button
- **Region:** Virginia

### Current Workers
- `infinity-gauntlet-bot` (web) - HTTP health checks & webhooks
- `Infinity-Gauntlet` (worker) - Main Discord bot + auto-sync [**ID:** srv-d3snk2ndiees73cn709g]
- `infinity-gauntlet-outbox` (worker) - Async message delivery
- `infinity-gauntlet-cache` (worker) - Runtime cache maintenance
- `infinity-gauntlet-data-pipeline` (worker) - Reference data updates
- `infinity-gauntlet-security` (worker) - Permission guardrails with persistent state
- `pokedex-cache-worker` (worker) - External data sync to GitHub
- `pokedex-cache-failsafe` (cron) - Weekly fallback refresh

### Database & Monitoring
- The environment expects managed database URLs. See `src/env/ensure-db-url.ts` and `README.md` for override logic.
- Render Postgres storage quotas: 0.5 GB (prod), 1.0 GB (dev). Monitor with `npm run db:cli -- query "SELECT pg_size_pretty(pg_database_size(current_database()))";"`
- Security bot alert routing lives in `src/bot/main.js` and `src/bot/dripAlerts.js`

## Done Criteria (Per Task)
- Diff, tests, and reviewer checklist passed.
- Knowledge updated (`docs/` + this guide if behavior changed).
- Links to logs, PR, and run artifacts included.

## Testing & Tooling
- `npm test` — Vitest suite (battle engine, DM flows, ops commands, etc.).
- `npm run lint` — ESLint across `src` and `tests` (TypeScript only).
- `npm run docs:update-routers` — Rebuild router indexes after structural changes.
- `npm run docs:update-ledger` — Refresh Prompt change ledger.
- `npm run refresh:vision` — Runs the full metadata refresh pipeline (routers, recovery, NEXT validation).
- `scripts/bootstrap_staging_db.ps1` — PowerShell entry that wraps `prisma migrate deploy` with interactive confirmation.
  - Honors `DATABASE_URL`/`RENDER_DB_EXTERNAL_URL` and surfaces guidance when they're missing or identical.
  - Works best with the connection retry envs (`PRISMA_CONNECT_MAX_RETRIES`, `PRISMA_CONNECT_RETRY_DELAY_MS`, `PRISMA_CONNECT_MAX_DELAY_MS`) tuned in the external `Key/Dev/.env` secrets file.

## Data & Cache Pipelines
- Pokémon data bootstrap lives under `scripts/build-data.js`, `scripts/fetch_pokemon.mjs`, and `data/bootstrap/*`.
- The security bot uses filesystem caching via `src/services/cache.js` (`/Store/discord-cache`).
- Live game flows share a typed facade in `src/services/cache/facade.ts` that fronts an in-memory LRU and persists slices under `/Store/runtime-cache/<namespace>`; adjust limits with `configureCacheFacade` for tests or workers. See the linked routers for cache recipes (`src/services/cache/ROUTER.md`), shared backends (`src/shared/cache/ROUTER.md`), persistence (`Store/ROUTER.md`), and storage adapters (`src/shared/storage/ROUTER.md`).
- Runtime cache metrics surface via `/ops cache`; the command reports hit/miss counters, disk usage, and maintenance state, and accepts `cleanup: true` to run an immediate sweep. The scheduler runs automatically (10-minute cadence) and logs results via `cache.maintenance` events.
- Render cron (`pokedex-cache-failsafe`) calls `scripts/refresh_cache_gh_only.mjs` for a GitHub-only fallback.

## Key Directories Snapshot
- `src/bot/` — Discord bot logic, DM flows, battles, security bot (legacy JS) integration.
- `src/core/` — Deterministic game engines (battle, encounter, math helpers).
- `src/data_pipeline/` — Data ingestion/validation logic.
- `src/shared/` — Logging, config, and utilities used across services.
- `scripts/` — Automation entrypoints (guards, refreshers, build tools).
- `ops/DB_BOOTSTRAP.md` & `scripts/bootstrap_staging_db.ps1` — Paired references for staging schema bootstrap; read the runbook before executing the script and confirm PROD_DATABASE_URL and RENDER_DB_EXTERNAL_URL (direct PostgreSQL) URLs are set.
- `ops/` — Operational metadata, hotfix plans, NEXT pointers, recovery docs.
- `tests/` — Vitest specs across engines, data pipeline, DM flow, and ops surfaces.

## Checklist Before Exit

**⚠️ PATCH ENGINE COMPLIANCE VERIFICATION:**

For any work involving errors, optimization, or system upgrades, verify:
- ✅ Work was added to `ops/NEXT.yaml` task queue (main_tasks or quick_task)
- ✅ `Patch.md` workflow was followed (Preflight → Execute → Postflight)
- ✅ `Prompt.md` PATCHSET echo documents the work
- ✅ `Tasklist.md` updated with task status changes

**Standard Exit Checklist:**
- Patch clipboard cleared, markers intact.
- `Prompt.md` updated with accurate summary, tests note, NEXT pointer status.
- `ops/NEXT.yaml` task queue reflects current work state (main_tasks + quick_task).
- Routers synchronized if structural docs changed.
- Commit message (when applicable) references task ID and change summary.

---

## 🚨 FINAL REMINDER: Patch Engine Enforcement

You have completed reading this operations guide. Remember:

**MANDATORY PATCH ENGINE USAGE:**
- ❌ All error handling work → Patch.md workflow
- ❌ All optimization work → Patch.md workflow  
- ❌ All system upgrades → Patch.md workflow
- ❌ All infrastructure changes → Patch.md workflow

**Why This Matters:**
- Ensures work is tracked in task queue system (3 main + 1 quick/hot)
- Prevents work duplication and conflicts
- Maintains audit trail in Prompt.md PATCHSET echo
- Enables rollback and recovery when needed
- Enforces testing and validation requirements

**Enforcement Policy:**
Work that bypasses Patch.md workflow for errors/optimization/upgrades will be:
1. Rejected immediately
2. Reverted from codebase
3. Reopened in Tasklist.md for proper workflow
4. Documented as non-compliant in Prompt.md

**No Exceptions.** The Patch engine system exists to prevent chaos, ensure quality, and maintain production stability. Use it.

**Required Reading Before ANY Work:**
1. `Patch.md` — Complete contract (Absolutes, multi-task queue, workflow)
2. `ops/NEXT.yaml` — Current task state (main_tasks, quick_task)
3. `Tasklist.md` — READY queue and dependencies
4. `Prompt.md` — Recent changes and PATCHSET echo

Following this handbook ensures automation, human operators, and downstream agents see a consistent system snapshot and can continue work without rediscovery.

---

**Document Version:** 1.1 (2025-11-17) — Patch Engine Enforcement Added
**Last Updated:** 2025-11-17T09:00:00Z
**Enforcement Status:** ACTIVE — All errors/optimization/upgrades require Patch.md compliance
