# Deprecated Documentation References Report

**Generated:** 2025-12-02 14:52:45 UTC  
**Scanned Files:** 539  
**Files with Issues:** 111  
**Status:** ⚠️ ISSUES DETECTED

---

## Executive Summary

This report identifies deprecated documentation references that need to be replaced with Task 12 comprehensive guides (105+ pages professional-grade documentation created December 2025).

**Replacement Targets:**
- \operations-bible/02-database-operations.md\ → \docs/operations-bible/database-operations-runbook-comprehensive.md\ (25 pages)
- \operations-bible/01-service-matrix.md\ → \docs/architecture-bible/complete-system-architecture.md § 2\ (30 pages)
- Deprecated terminology → Canonical database terms (see Patch.md Absolutes)

---
## DeprecatedLocalTerminology

**Pattern:** \$(System.Collections.Hashtable.Pattern)\  
**Description:** Deprecated database terminology (non-canonical terms)  
**Severity:** MEDIUM  
**Replacement:** \$(System.Collections.Hashtable.Replacement)\  
**Occurrences:** 711
### Detected Instances

| File | Line | Severity |
|------|------|----------|
| \$(@{File=.db-state\ROUTER.md; Line=2; Content=Title: Local Database State Cache; Severity=MEDIUM}.File)\ | 2 | MEDIUM |
| \$(@{File=.github\copilot-instructions.md; Line=102; Content=**Production safety:** Repo `.env` stays EMPTY. Local secrets always from external file. Production ignores repo `.env` unless `IG_ALLOW_REPO_ENV=1`.; Severity=MEDIUM}.File)\ | 102 | MEDIUM |
| \$(@{File=.github\copilot-instructions.md; Line=156; Content=**NEVER use:** "local", "LOCAL", "PRIMARY LOCAL", "EXPERIMENTAL", "DEV_DATABASE_URL" (deprecated); Severity=MEDIUM}.File)\ | 156 | MEDIUM |
| \$(@{File=.github\copilot-instructions.md; Line=344; Content=- **Development Bible:** `docs/development-bible/INDEX.md` → 7 sections (local setup, testing, debugging, utilities); Severity=MEDIUM}.File)\ | 344 | MEDIUM |
| \$(@{File=Agents.md; Line=133; Content=- **Env needed (do not commit secrets):** use `secrets/Infinity-Gauntlet.env` as the **single consolidated environment file** for all local development and testing. This file contains all required keys: BOT_TOKEN, PROD_DATABASE_URL, RENDER_DB_EXTERNAL_URL (direct PostgreSQL), DATABASE_ONPREMISE_DEV_PRIMARY (local workstation), and POKEMON_BOT_TOKEN. Load it with `IG_ENV_FILE`; keep the repo `.env` empty so local tooling always pulls from the external file. **No other key files are needed for development.**; Severity=MEDIUM}.File)\ | 133 | MEDIUM |
| \$(@{File=Agents.md; Line=135; Content=## On-Premise Database Access (Local Development Only); Severity=MEDIUM}.File)\ | 135 | MEDIUM |
| \$(@{File=Agents.md; Line=139; Content=**LOCAL DEVELOPMENT:** On-premise databases (DATABASE_ONPREMISE_DEV_PRIMARY) provide offline development capability when cloud databases are unavailable. These are **workstation-only** and never used in production.; Severity=MEDIUM}.File)\ | 139 | MEDIUM |
| \$(@{File=Agents.md; Line=141; Content=1. **Environment file:** use `secrets/Infinity-Gauntlet.env` as the single consolidated environment file containing all development keys. This file includes PROD_DATABASE_URL, RENDER_DB_EXTERNAL_URL (direct PostgreSQL), DATABASE_ONPREMISE_DEV_PRIMARY (local workstation), BOT_TOKEN, and POKEMON_BOT_TOKEN. **No other environment files are needed.**; Severity=MEDIUM}.File)\ | 141 | MEDIUM |
| \$(@{File=Agents.md; Line=153; Content=4. **Bootstrap the local workstation database (OPTIONAL for offline development):** set `PG_BIN_DIR` to a Postgres installation with `bin/` + `share/` (e.g., `C:/Program Files/PostgreSQL/17/bin`), then run `npm run ops:bootstrap-onpremise-dev` to mirror the Render database into `Store/onpremise-dev-primary`, rotate timestamped snapshots, and emit `onpremise-url.txt` (e.g., `postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db`) so `src/shared/config.ts` can connect the `onPremiseDevPrisma` client. Prefer `npm run ops:auto-bootstrap-onpremise-dev` when you want the script to install PostgreSQL silently (via winget) and run the mirror in one step. See `docs/WORKSTATION-GAMEPLAY-SETUP.md` for complete setup guide.; Severity=MEDIUM}.File)\ | 153 | MEDIUM |
| \$(@{File=Agents.md; Line=164; Content=- **LOCAL DEVELOPMENT**: Optional on-premise database (DATABASE_ONPREMISE_DEV_PRIMARY) for offline work - Workstation-only; Severity=MEDIUM}.File)\ | 164 | MEDIUM |
| \$(@{File=Agents.md; Line=171; Content=// Priority: PROD_DATABASE_URL → RENDER_DB_EXTERNAL_URL → LOCAL fallback; Severity=MEDIUM}.File)\ | 171 | MEDIUM |
| \$(@{File=Agents.md; Line=186; Content=- **Local Development** (optional): `DATABASE_ONPREMISE_DEV_PRIMARY` → Workstation PostgreSQL (offline fallback only); Severity=MEDIUM}.File)\ | 186 | MEDIUM |
| \$(@{File=Agents.md; Line=195; Content=- **`onPremiseDevPrisma`** (LOCAL) — **OPTIONAL** — Connected to `DATABASE_ONPREMISE_DEV_PRIMARY`; offline workstation mirror for local development when Render database is unavailable. May be `null` if not configured.; Severity=MEDIUM}.File)\ | 195 | MEDIUM |
| \$(@{File=Agents.md; Line=196; Content=- **`onPremiseExperimentPrisma`** (EXPERIMENTAL) — **OPTIONAL** — Connected to `DATABASE_ONPREMISE_DEV_EXPERIMENT`; isolated testing database for migration validation. May be `null` if not configured.; Severity=MEDIUM}.File)\ | 196 | MEDIUM |
| \$(@{File=Agents.md; Line=204; Content=**As of 2025-11-08**, workstations can maintain **two independent PostgreSQL clusters** for local development and migration testing. These databases are **completely OFFLINE** and NOT used in production. See `docs/dual-onpremise-database-guide.md` for comprehensive documentation.; Severity=MEDIUM}.File)\ | 204 | MEDIUM |
| \$(@{File=Agents.md; Line=209; Content=Production (Render)          Workstation (OFFLINE - Local Dev Only); Severity=MEDIUM}.File)\ | 209 | MEDIUM |
| \$(@{File=Agents.md; Line=217; Content=│     Purpose: Local development with cloud-like data; Severity=MEDIUM}.File)\ | 217 | MEDIUM |
| \$(@{File=Agents.md; Line=241; Content=| **ONPREMISE-DEV-PRIMARY** | 55433 | Local development with production-like data | Testing locally with real data structures, offline development |; Severity=MEDIUM}.File)\ | 241 | MEDIUM |
| \$(@{File=Agents.md; Line=296; Content=npm run ops:sync-onpremise-experiment --from local; Severity=MEDIUM}.File)\ | 296 | MEDIUM |
| \$(@{File=Agents.md; Line=300; Content=# Step 7: ONLY AFTER LOCAL VALIDATION - Push to Render database (CLOUD OPERATION); Severity=MEDIUM}.File)\ | 300 | MEDIUM |
| \$(@{File=Agents.md; Line=344; Content=- ❌ DON'T expect production to see local database changes; Severity=MEDIUM}.File)\ | 344 | MEDIUM |
| \$(@{File=Agents.md; Line=345; Content=- ❌ DON'T assume local databases replicate automatically to cloud; Severity=MEDIUM}.File)\ | 345 | MEDIUM |
| \$(@{File=Agents.md; Line=364; Content=console.log(`PROD: ${stats.prod.status} | LOCAL: ${stats.onPremiseDev.status}`);; Severity=MEDIUM}.File)\ | 364 | MEDIUM |
| \$(@{File=Agents.md; Line=471; Content=**As of 2025-11-06**, the system implements a master-replica cascade architecture for database version control and synchronization across PROD, DEV, and Local (workstation) environments.; Severity=MEDIUM}.File)\ | 471 | MEDIUM |
| \$(@{File=Agents.md; Line=473; Content=**Architecture:** PROD (master) → DEV (replica) → Local (workstation replica); Severity=MEDIUM}.File)\ | 473 | MEDIUM |
| \$(@{File=Agents.md; Line=529; Content=**Purpose:** Provide ultra-fast local lookups for game engine (<1μs L1, ~50ms SQLite vs 50-100ms PostgreSQL), enable offline gameplay, validate data quality before PROD upload, and capture battle outcomes for analysis.; Severity=MEDIUM}.File)\ | 529 | MEDIUM |
| \$(@{File=Agents.md; Line=573; Content=- Storage paths: `/Store/` (prod), `Store/` (local), `Store/test/` (test); Severity=MEDIUM}.File)\ | 573 | MEDIUM |
| \$(@{File=Agents.md; Line=714; Content=- **Local Fallback Bootstrapper**: `npm run ops:auto-bootstrap-onpremise-dev` installs PostgreSQL (if necessary) and hydrates the Store-backed mirror, writing `Store/onpremise-dev-primary/onpremise-url.txt` and pruning stale snapshots so config fallbacks stay current when Render is unavailable; `npm run ops:bootstrap-onpremise-dev` remains available when you only need the mirror refresh.; Severity=MEDIUM}.File)\ | 714 | MEDIUM |
| \$(@{File=CONSOLIDATION-COMPLETE.md; Line=142; Content=- Local setup; Severity=MEDIUM}.File)\ | 142 | MEDIUM |
| \$(@{File=data\ROUTER.md; Line=8; Content=- JSON payloads mirror the PokeAPI publisher outputs so local runs and Render workers can hydrate caches without network flakiness.; Severity=MEDIUM}.File)\ | 8 | MEDIUM |
| \$(@{File=DOCKER-SUCCESS-SUMMARY.md; Line=234; Content=The Pokémon Infinity Gauntlet application is now running in Docker containers and ready for local development and testing.; Severity=MEDIUM}.File)\ | 234 | MEDIUM |
| \$(@{File=DOCS-CONSOLIDATION-REPORT.md; Line=179; Content=- 01-local-setup.md; Severity=MEDIUM}.File)\ | 179 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=17; Content=- **LOCAL DEVELOPMENT**: Optional on-premise database (DATABASE_ONPREMISE_DEV_PRIMARY) for offline work; Severity=MEDIUM}.File)\ | 17 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=32; Content=- Latency: <50ms (local); Severity=MEDIUM}.File)\ | 32 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=68; Content=**Purpose**: Initialize up to 3 Prisma clients (PROD + optional LOCAL + optional EXPERIMENT) during boot Phase 2.; Severity=MEDIUM}.File)\ | 68 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=107; Content=2. **`onPremiseDevPrisma`** (LOCAL - OPTIONAL); Severity=MEDIUM}.File)\ | 107 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=187; Content=log.info("LOCAL database connection skipped", {; Severity=MEDIUM}.File)\ | 187 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=215; Content=log.info("LOCAL Prisma client connected (workstation development)", {; Severity=MEDIUM}.File)\ | 215 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=442; Content=console.log(`LOCAL: ${stats.onPremiseDev.status} (${stats.onPremiseDev.latency}ms)`);; Severity=MEDIUM}.File)\ | 442 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=499; Content=**Graceful Degradation**: Optional clients (LOCAL, EXPERIMENT) silently skip if unavailable.; Severity=MEDIUM}.File)\ | 499 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=539; Content=│  Render version >= Local? │; Severity=MEDIUM}.File)\ | 539 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=558; Content=│                LOCAL DB (WORKSTATION MIRROR)                         │; Severity=MEDIUM}.File)\ | 558 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=572; Content=│  - Blocks restore if Render version < Local version                 │; Severity=MEDIUM}.File)\ | 572 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=617; Content=local: { count: localVersion.count, last: localVersion.lastMigration },; Severity=MEDIUM}.File)\ | 617 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=621; Content=// Block local sync until production catches up; Severity=MEDIUM}.File)\ | 621 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=622; Content=await updateSyncState('LOCAL', {; Severity=MEDIUM}.File)\ | 622 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=633; Content=message: `Production rolled back to migration ${prodVersion.lastMigration}. Local sync blocked until production >= ${localVersion.count + 1} migrations.`,; Severity=MEDIUM}.File)\ | 633 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=652; Content=throw new Error('Production is behind Local - sync blocked');; Severity=MEDIUM}.File)\ | 652 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=661; Content=// STAGE 4: Restore to Local; Severity=MEDIUM}.File)\ | 661 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=684; Content=npm run db:cli -- status --target=local; Severity=MEDIUM}.File)\ | 684 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=685; Content=npm run db:cli -- count User --target=local; Severity=MEDIUM}.File)\ | 685 | MEDIUM |
| \$(@{File=docs\architecture-bible\02-database-architecture.md; Line=726; Content=- ❌ DON'T expect production to see local database changes automatically; Severity=MEDIUM}.File)\ | 726 | MEDIUM |
| \$(@{File=docs\architecture-bible\05-logging-architecture.md; Line=862; Content=LOCAL-R → ONLINE       | Latency: 0.42ms  | Pokemon: 1025; Severity=MEDIUM}.File)\ | 862 | MEDIUM |
| \$(@{File=docs\architecture-bible\05-logging-architecture.md; Line=863; Content=LOCAL-W → ONLINE       | Latency: 1.23ms  | Battles: 8472; Severity=MEDIUM}.File)\ | 863 | MEDIUM |
| \$(@{File=docs\architecture-bible\05-logging-architecture.md; Line=1120; Content=- **development-bible/02-local-development.md** — On-premise database setup, workstation observability; Severity=MEDIUM}.File)\ | 1120 | MEDIUM |
| \$(@{File=docs\architecture-bible\06-error-system.md; Line=1045; Content=- None (local database queries only); Severity=MEDIUM}.File)\ | 1045 | MEDIUM |
| \$(@{File=docs\architecture-bible\06-error-system.md; Line=1169; Content=// Local tracking; Severity=MEDIUM}.File)\ | 1169 | MEDIUM |
| \$(@{File=docs\architecture-bible\06-error-system.md; Line=2033; Content=// Local tracking; Severity=MEDIUM}.File)\ | 2033 | MEDIUM |
| \$(@{File=docs\architecture-bible\10-discord-bot.md; Line=1197; Content=| **STORAGE_DIR** | `/Store/cooldowns` (Render) or `Store/cooldowns` (local) | Persistent disk location | Render persistent disk mount at `/Store`, local uses workspace-relative path |; Severity=MEDIUM}.File)\ | 1197 | MEDIUM |
| \$(@{File=docs\architecture-bible\10-discord-bot.md; Line=1433; Content=- **Local**: `Store/cooldowns/cooldowns.json` (workspace-relative); Severity=MEDIUM}.File)\ | 1433 | MEDIUM |
| \$(@{File=docs\architecture-bible\10-discord-bot.md; Line=1906; Content=- **development-bible/02-local-development.md** — Cooldown storage location (`Store/cooldowns/` vs `/Store/cooldowns/`); Severity=MEDIUM}.File)\ | 1906 | MEDIUM |
| \$(@{File=docs\architecture-bible\10-discord-bot.md; Line=2811; Content=- **development-bible/02-local-development.md** — Testing battles locally (Dexpack must be loaded); Severity=MEDIUM}.File)\ | 2811 | MEDIUM |
| \$(@{File=docs\architecture-bible\12-observability.md; Line=107; Content=🗄️ Database (LOCAL); Severity=MEDIUM}.File)\ | 107 | MEDIUM |
| \$(@{File=docs\architecture-bible\13-performance.md; Line=925; Content=- **Local Development**: `Store/pokemon-cache.json` (relative to cwd); Severity=MEDIUM}.File)\ | 925 | MEDIUM |
| \$(@{File=docs\architecture-bible\13-performance.md; Line=1809; Content=- **[development-bible/02-local-development.md](../development-bible/02-local-development.md)** — Offline development with stale cache; Severity=MEDIUM}.File)\ | 1809 | MEDIUM |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=389; Content=**Workstation Boot (Local, 16 GB RAM):**; Severity=MEDIUM}.File)\ | 389 | MEDIUM |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=395; Content=| Database Connect | ~30ms | 280ms | Local PostgreSQL |; Severity=MEDIUM}.File)\ | 395 | MEDIUM |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=646; Content=- **[development-bible/01-local-setup.md](../development-bible/01-local-setup.md)** — Local boot sequence differences; Severity=MEDIUM}.File)\ | 646 | MEDIUM |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=1009; Content=#### 3. SIGINT (Local Development); Severity=MEDIUM}.File)\ | 1009 | MEDIUM |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=1261; Content=log.info("⏰ Auto-restart disabled in local development");; Severity=MEDIUM}.File)\ | 1261 | MEDIUM |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=1266; Content=- **Local Development**: Developers need persistent state for debugging (12h restarts disruptive); Severity=MEDIUM}.File)\ | 1266 | MEDIUM |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=1270; Content=**Local Development Behavior**:; Severity=MEDIUM}.File)\ | 1270 | MEDIUM |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=1698; Content=- **development-bible/02-local-development.md** — Auto-restart disabled locally (process.env.RENDER gate); Severity=MEDIUM}.File)\ | 1698 | MEDIUM |
| \$(@{File=docs\architecture-bible\complete-system-architecture.md; Line=33; Content=- **Master-mirror-staging pipeline** — PROD master with local mirrors for performance; Severity=MEDIUM}.File)\ | 33 | MEDIUM |
| \$(@{File=docs\architecture-bible\complete-system-architecture.md; Line=64; Content=│  (SQLite Local)  │; Severity=MEDIUM}.File)\ | 64 | MEDIUM |
| \$(@{File=docs\architecture-bible\complete-system-architecture.md; Line=116; Content=│ Messages │   │ Local    │   │ Render   │; Severity=MEDIUM}.File)\ | 116 | MEDIUM |
| \$(@{File=docs\architecture-bible\complete-system-architecture.md; Line=213; Content=│                    (SQLite — Local File)                              │; Severity=MEDIUM}.File)\ | 213 | MEDIUM |
| \$(@{File=docs\architecture-bible\complete-system-architecture.md; Line=253; Content=│    engineWriteBuffer,  │   (both local, both fast); Severity=MEDIUM}.File)\ | 253 | MEDIUM |
| \$(@{File=docs\architecture-bible\complete-system-architecture.md; Line=314; Content=// Engine DBs (local files); Severity=MEDIUM}.File)\ | 314 | MEDIUM |
| \$(@{File=docs\architecture-bible\complete-system-architecture.md; Line=615; Content=│  Engine Read-DB (SQLite Local)       │; Severity=MEDIUM}.File)\ | 615 | MEDIUM |
| \$(@{File=docs\architecture-bible\complete-system-architecture.md; Line=619; Content=│  - Network calls: ZERO (local file)  │; Severity=MEDIUM}.File)\ | 619 | MEDIUM |
| \$(@{File=docs\architecture-bible\complete-system-architecture.md; Line=729; Content=│  - Source: Engine Read-DB (local)    │; Severity=MEDIUM}.File)\ | 729 | MEDIUM |
| \$(@{File=docs\architecture-bible\complete-system-architecture.md; Line=1217; Content=| Read-DB query | 15 ms | 30 ms | 50 ms | SQLite local |; Severity=MEDIUM}.File)\ | 1217 | MEDIUM |
| \$(@{File=docs\architecture-bible\INDEX.md; Line=41; Content=- **DEVELOPMENT-BIBLE** — Local setup, testing, debugging, console tooling; Severity=MEDIUM}.File)\ | 41 | MEDIUM |
| \$(@{File=docs\archive\2025-11-consolidation\MEMORY-PROFILING-IMPLEMENTATION.md; Line=47; Content=- Production-only (skipped on local development); Severity=MEDIUM}.File)\ | 47 | MEDIUM |
| \$(@{File=docs\archive\2025-11-consolidation\MEMORY-PROFILING-IMPLEMENTATION.md; Line=59; Content=- Standalone Node.js script for local memory analysis; Severity=MEDIUM}.File)\ | 59 | MEDIUM |
| \$(@{File=docs\archive\2025-11-consolidation\MEMORY-PROFILING-IMPLEMENTATION.md; Line=150; Content=- Skipped on local development to avoid pollution; Severity=MEDIUM}.File)\ | 150 | MEDIUM |
| \$(@{File=docs\archive\2025-11-consolidation\MEMORY-PROFILING-IMPLEMENTATION.md; Line=195; Content=- Local development utility; Severity=MEDIUM}.File)\ | 195 | MEDIUM |
| \$(@{File=docs\archive\2025-11-consolidation\MEMORY-PROFILING-IMPLEMENTATION.md; Line=228; Content=- [ ] Local testing (if possible); Severity=MEDIUM}.File)\ | 228 | MEDIUM |
| \$(@{File=docs\archive\2025-11-consolidation\MEMORY-PROFILING-IMPLEMENTATION.md; Line=400; Content=- Standalone script for local development; Severity=MEDIUM}.File)\ | 400 | MEDIUM |
| \$(@{File=docs\archive\2025-11-consolidation\SEAMLESS-RESTART-OPTIMIZATION.md; Line=416; Content=1. **Local Testing** (1 day) — Verify all changes work locally; Severity=MEDIUM}.File)\ | 416 | MEDIUM |
| \$(@{File=docs\archive\CONSOLIDATION-PLAN-2025-11-25.md; Line=67; Content=# 3. Upgrade local databases; Severity=MEDIUM}.File)\ | 67 | MEDIUM |
| \$(@{File=docs\archive\CONSOLIDATION-PLAN-2025-11-25.md; Line=182; Content=│   ├── 01-local-setup.md; Severity=MEDIUM}.File)\ | 182 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-QUICK-REF.md; Line=17; Content=# 3. Stop local databases; Severity=MEDIUM}.File)\ | 17 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-QUICK-REF.md; Line=40; Content=## Phase 2: Upgrade Local Databases (30 min); Severity=MEDIUM}.File)\ | 40 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-QUICK-REF.md; Line=118; Content=# - docs/development-bible/01-local-setup.md (version requirements); Severity=MEDIUM}.File)\ | 118 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-QUICK-REF.md; Line=145; Content=### Local Databases:; Severity=MEDIUM}.File)\ | 145 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-QUICK-REF.md; Line=174; Content=- ✅ Local DBs show PostgreSQL 18.0; Severity=MEDIUM}.File)\ | 174 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=29; Content=2. **Workstation (Local):** ONPREMISE-DEV-PRIMARY (port 55433); Severity=MEDIUM}.File)\ | 29 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=30; Content=3. **Testing (Local):** ONPREMISE-DEV-EXPERIMENT (port 55434); Severity=MEDIUM}.File)\ | 30 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=128; Content=**Goal:** Replace `tools/pgsql17/` with `tools/pgsql18/` for local operations.; Severity=MEDIUM}.File)\ | 128 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=193; Content=### Phase 2: Upgrade Local Workstation Databases (30 min); Severity=MEDIUM}.File)\ | 193 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=246; Content=#### Step 2.4: Verify Local Upgrades; Severity=MEDIUM}.File)\ | 246 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=282; Content=# Test against local PostgreSQL 18 cluster; Severity=MEDIUM}.File)\ | 282 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=287; Content=# Run test suite against local PostgreSQL 18; Severity=MEDIUM}.File)\ | 287 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=381; Content=2. **docs/development-bible/01-local-setup.md**; Severity=MEDIUM}.File)\ | 381 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=434; Content=Testing: Local PostgreSQL 18 tests passing, production verification complete; Severity=MEDIUM}.File)\ | 434 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=462; Content=### Local Database Rollback; Severity=MEDIUM}.File)\ | 462 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=532; Content=| **Phase 2: Upgrade Local DBs** | 30 min | None (local only) | Low |; Severity=MEDIUM}.File)\ | 532 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=539; Content=- Phase 1-2: 2:00-2:45 AM (local work, no downtime); Severity=MEDIUM}.File)\ | 539 | MEDIUM |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=553; Content=- `docs/development-bible/01-local-setup.md`; Severity=MEDIUM}.File)\ | 553 | MEDIUM |
| \$(@{File=docs\centralization-plan-database-workers.md; Line=13; Content=- Multiple Prisma client instances (3 clients: PROD, Local Dev, Experiment); Severity=MEDIUM}.File)\ | 13 | MEDIUM |
| \$(@{File=docs\centralization-plan-database-workers.md; Line=70; Content=│ LOCAL DATABASES (Workstation Development - OPTIONAL)                    │; Severity=MEDIUM}.File)\ | 70 | MEDIUM |
| \$(@{File=docs\centralization-plan-database-workers.md; Line=73; Content=│  3. Local Dev PostgreSQL (OPTIONAL - Workstation Only)                  │; Severity=MEDIUM}.File)\ | 73 | MEDIUM |
| \$(@{File=docs\centralization-plan-database-workers.md; Line=97; Content=│               Store/engine-read-db.sqlite (local)                        │; Severity=MEDIUM}.File)\ | 97 | MEDIUM |
| \$(@{File=docs\centralization-plan-database-workers.md; Line=98; Content=│     Purpose: Ultra-fast local Pokémon data lookup                       │; Severity=MEDIUM}.File)\ | 98 | MEDIUM |
| \$(@{File=docs\centralization-plan-database-workers.md; Line=109; Content=│               Store/engine-write-db.sqlite (local)                       │; Severity=MEDIUM}.File)\ | 109 | MEDIUM |
| \$(@{File=docs\development-bible\01-local-setup.md; Line=1; Content=# Section 1: Local Setup; Severity=MEDIUM}.File)\ | 1 | MEDIUM |
| \$(@{File=docs\development-bible\01-local-setup.md; Line=7; Content=**Philosophy**: "Local development should mirror production—same database schema, same runtime behavior, minimal setup friction."; Severity=MEDIUM}.File)\ | 7 | MEDIUM |
| \$(@{File=docs\development-bible\01-local-setup.md; Line=15; Content=**Purpose:** Use `secrets/Infinity-Gauntlet.env` as the **single source** for all local development and testing keys.; Severity=MEDIUM}.File)\ | 15 | MEDIUM |
| \$(@{File=docs\development-bible\01-local-setup.md; Line=25; Content=SECURITY_BOT_TOKEN=xxx (optional for local testing); Severity=MEDIUM}.File)\ | 25 | MEDIUM |
| \$(@{File=docs\development-bible\01-local-setup.md; Line=48; Content=- ✅ Local secrets always from external file; Severity=MEDIUM}.File)\ | 48 | MEDIUM |
| \$(@{File=docs\development-bible\01-local-setup.md; Line=74; Content=# Auto-install PostgreSQL + bootstrap local DB (recommended for first-time setup); Severity=MEDIUM}.File)\ | 74 | MEDIUM |
| \$(@{File=docs\development-bible\01-local-setup.md; Line=113; Content=npm run db:cli -- status --target local; Severity=MEDIUM}.File)\ | 113 | MEDIUM |
| \$(@{File=docs\development-bible\01-local-setup.md; Line=119; Content=npm run db:cli -- counts --target local; Severity=MEDIUM}.File)\ | 119 | MEDIUM |
| \$(@{File=docs\development-bible\02-testing-patterns.md; Line=3; Content=[← Back to INDEX](INDEX.md) | [← Previous: Local Setup](01-local-setup.md) | [Next: Debugging Guides →](03-debugging-guides.md); Severity=MEDIUM}.File)\ | 3 | MEDIUM |
| \$(@{File=docs\development-bible\02-testing-patterns.md; Line=266; Content=[← Back to INDEX](INDEX.md) | [← Previous: Local Setup](01-local-setup.md) | [Next: Debugging Guides →](03-debugging-guides.md); Severity=MEDIUM}.File)\ | 266 | MEDIUM |
| \$(@{File=docs\development-bible\03-debugging-guides.md; Line=131; Content=1. **Environment:** Production, staging, local?; Severity=MEDIUM}.File)\ | 131 | MEDIUM |
| \$(@{File=docs\development-bible\03-debugging-guides.md; Line=177; Content=### Local Reproduction; Severity=MEDIUM}.File)\ | 177 | MEDIUM |
| \$(@{File=docs\development-bible\07-utilities.md; Line=75; Content=// ❌ BAD: Store in local timezone; Severity=MEDIUM}.File)\ | 75 | MEDIUM |
| \$(@{File=docs\development-bible\07-utilities.md; Line=81; Content=// Convert UTC to user's local time for display; Severity=MEDIUM}.File)\ | 81 | MEDIUM |
| \$(@{File=docs\development-bible\08-profiling.md; Line=101; Content=### 3. Standalone Script (Local Development); Severity=MEDIUM}.File)\ | 101 | MEDIUM |
| \$(@{File=docs\development-bible\08-profiling.md; Line=103; Content=Run memory snapshot on local machine:; Severity=MEDIUM}.File)\ | 103 | MEDIUM |
| \$(@{File=docs\development-bible\08-profiling.md; Line=426; Content=- Local development debugging; Severity=MEDIUM}.File)\ | 426 | MEDIUM |
| \$(@{File=docs\development-bible\INDEX.md; Line=10; Content=Single source of truth for Infinity Gauntlet development workflows, local setup, testing patterns, debugging techniques, performance optimization, and developer utilities. Consolidates 12 source documents into unified guide.; Severity=MEDIUM}.File)\ | 10 | MEDIUM |
| \$(@{File=docs\development-bible\INDEX.md; Line=16; Content=1. **[Local Setup](01-local-setup.md)** — AI environment, workstation gameplay, VS Code integration; Severity=MEDIUM}.File)\ | 16 | MEDIUM |
| \$(@{File=docs\development-bible\INDEX.md; Line=29; Content=- Local Setup: § 1.1 (AI Environment), § 1.2 (Workstation Gameplay); Severity=MEDIUM}.File)\ | 29 | MEDIUM |
| \$(@{File=docs\development-bible\INDEX.md; Line=45; Content=- **Local Setup Only** (§ 1): 5 minutes; Severity=MEDIUM}.File)\ | 45 | MEDIUM |
| \$(@{File=docs\DOCKER-SETUP.md; Line=11; Content=- **PostgreSQL Database** — Local database for development; Severity=MEDIUM}.File)\ | 11 | MEDIUM |
| \$(@{File=docs\DOCKER-SETUP.md; Line=156; Content=docker-compose exec postgres pg_dump -U gauntlet infinity_gauntlet > backups/local-backup-$(Get-Date -Format "yyyyMMdd-HHmmss").sql; Severity=MEDIUM}.File)\ | 156 | MEDIUM |
| \$(@{File=docs\DOCKER-SETUP.md; Line=301; Content=| Feature | Docker (Local) | Render (Production) |; Severity=MEDIUM}.File)\ | 301 | MEDIUM |
| \$(@{File=docs\DOCKER-SUMMARY.md; Line=46; Content=Template for local Docker environment with:; Severity=MEDIUM}.File)\ | 46 | MEDIUM |
| \$(@{File=docs\DOCKER-SUMMARY.md; Line=300; Content=1. Local development: Use Docker for consistency; Severity=MEDIUM}.File)\ | 300 | MEDIUM |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=74; Content=1. **"local database"** — 30+ occurrences (tools/README.md, test files, comments); Severity=MEDIUM}.File)\ | 74 | MEDIUM |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=75; Content=2. **"LOCAL"** — 50+ occurrences (test files, sync logic, variable names); Severity=MEDIUM}.File)\ | 75 | MEDIUM |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=76; Content=3. **"PRIMARY LOCAL"** — 5 occurrences (documented as deprecated in Patch.md); Severity=MEDIUM}.File)\ | 76 | MEDIUM |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=77; Content=4. **"EXPERIMENTAL"** — 8 occurrences (documented as deprecated); Severity=MEDIUM}.File)\ | 77 | MEDIUM |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=78; Content=5. **"DEV_DATABASE_URL"** — 3 occurrences (deprecated environment variable); Severity=MEDIUM}.File)\ | 78 | MEDIUM |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=82; Content=- **Valid usage (local filesystem):** 10 instances (backup storage provider); Severity=MEDIUM}.File)\ | 82 | MEDIUM |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=116; Content=2. **tests/** — 20+ test files with "local database", deprecated terms; Severity=MEDIUM}.File)\ | 116 | MEDIUM |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=163; Content=\bPRIMARY LOCAL\b; Severity=MEDIUM}.File)\ | 163 | MEDIUM |
| \$(@{File=docs\operations-bible\01-service-matrix.md; Line=80; Content=**Purpose:** Drains `BusMessage` events and uploads payloads to durable storage (S3/R2/local).; Severity=MEDIUM}.File)\ | 80 | MEDIUM |
| \$(@{File=docs\operations-bible\01-service-matrix.md; Line=95; Content=- **Local:** Set `BACKUP_STORAGE_PROVIDER=local` for development; Severity=MEDIUM}.File)\ | 95 | MEDIUM |
| \$(@{File=docs\operations-bible\01-service-matrix.md; Line=183; Content=- Durable storage provider (S3/R2/local); Severity=MEDIUM}.File)\ | 183 | MEDIUM |
| \$(@{File=docs\operations-bible\02-database-operations.md; Line=39; Content=// Priority: PROD_DATABASE_URL → RENDER_DB_EXTERNAL_URL → LOCAL fallback; Severity=MEDIUM}.File)\ | 39 | MEDIUM |
| \$(@{File=docs\operations-bible\02-database-operations.md; Line=56; Content=| **Offline dev** (optional) | Local | `DATABASE_ONPREMISE_DEV_PRIMARY` | Workstation mirror | 55433 |; Severity=MEDIUM}.File)\ | 56 | MEDIUM |
| \$(@{File=docs\operations-bible\02-database-operations.md; Line=57; Content=| **Migration testing** (optional) | Local | `DATABASE_ONPREMISE_DEV_EXPERIMENT` | Isolated test DB | 55434 |; Severity=MEDIUM}.File)\ | 57 | MEDIUM |
| \$(@{File=docs\operations-bible\02-database-operations.md; Line=71; Content=1. **Never** use deprecated variables (`DEV_DATABASE_URL`, `LOCAL_DATABASE_URL`); Severity=MEDIUM}.File)\ | 71 | MEDIUM |
| \$(@{File=docs\operations-bible\02-database-operations.md; Line=181; Content=**NEVER use:** "local", "LOCAL", "PRIMARY LOCAL", "EXPERIMENTAL", "DEV_DATABASE_URL" (deprecated); Severity=MEDIUM}.File)\ | 181 | MEDIUM |
| \$(@{File=docs\operations-bible\02-database-operations.md; Line=187; Content=- ❌ `DEV_DATABASE_URL` (deprecated); Severity=MEDIUM}.File)\ | 187 | MEDIUM |
| \$(@{File=docs\operations-bible\02-database-operations.md; Line=211; Content=npm run db:cli -- status --target local       # Workstation mirror (DATABASE_ONPREMISE_DEV_PRIMARY); Severity=MEDIUM}.File)\ | 211 | MEDIUM |
| \$(@{File=docs\operations-bible\02-database-operations.md; Line=324; Content=npm run ops:sync-onpremise-experiment --from local; Severity=MEDIUM}.File)\ | 324 | MEDIUM |
| \$(@{File=docs\operations-bible\02-database-operations.md; Line=328; Content=# Step 7: ONLY AFTER LOCAL VALIDATION - Push to Render (CLOUD OPERATION); Severity=MEDIUM}.File)\ | 328 | MEDIUM |
| \$(@{File=docs\operations-bible\02-database-operations.md; Line=498; Content=- § 2.7 (On-Premise Setup) — Local database mirroring; Severity=MEDIUM}.File)\ | 498 | MEDIUM |
| \$(@{File=docs\operations-bible\03-deployment-procedures.md; Line=242; Content=sudo mv /tmp/render /usr/local/bin/; Severity=MEDIUM}.File)\ | 242 | MEDIUM |
| \$(@{File=docs\operations-bible\03-deployment-procedures.md; Line=243; Content=sudo chmod +x /usr/local/bin/render; Severity=MEDIUM}.File)\ | 243 | MEDIUM |
| \$(@{File=docs\operations-bible\03-deployment-procedures.md; Line=390; Content=- **Local** (development): Set `BACKUP_STORAGE_PROVIDER=local`; Severity=MEDIUM}.File)\ | 390 | MEDIUM |
| \$(@{File=docs\operations-bible\03-deployment-procedures.md; Line=406; Content=**Local Fallback:**; Severity=MEDIUM}.File)\ | 406 | MEDIUM |
| \$(@{File=docs\operations-bible\03-deployment-procedures.md; Line=408; Content=BACKUP_STORAGE_PROVIDER=local; Severity=MEDIUM}.File)\ | 408 | MEDIUM |
| \$(@{File=docs\operations-bible\04-environment-management.md; Line=113; Content=### Local Development Secrets; Severity=MEDIUM}.File)\ | 113 | MEDIUM |
| \$(@{File=docs\operations-bible\04-environment-management.md; Line=141; Content=- Local secrets always from external file; Severity=MEDIUM}.File)\ | 141 | MEDIUM |
| \$(@{File=docs\operations-bible\04-environment-management.md; Line=177; Content=**Database URLs (Development - Optional Local PostgreSQL):**; Severity=MEDIUM}.File)\ | 177 | MEDIUM |
| \$(@{File=docs\operations-bible\04-environment-management.md; Line=220; Content=- Local development requires explicit `IG_ENV_FILE` setting; Severity=MEDIUM}.File)\ | 220 | MEDIUM |
| \$(@{File=docs\operations-bible\04-environment-management.md; Line=223; Content=- ✅ DO use `secrets/Infinity-Gauntlet.env` for all local development; Severity=MEDIUM}.File)\ | 223 | MEDIUM |
| \$(@{File=docs\operations-bible\04-environment-management.md; Line=238; Content=| API Keys | Every 90 days | Regenerate in provider dashboard → Update Render + local env file |; Severity=MEDIUM}.File)\ | 238 | MEDIUM |
| \$(@{File=docs\operations-bible\04-environment-management.md; Line=255; Content=3. **Update Local Environment:**; Severity=MEDIUM}.File)\ | 255 | MEDIUM |
| \$(@{File=docs\operations-bible\06-optimization-history.md; Line=71; Content=Migrated from ambiguous database terminology (local/LOCAL/PRIMARY LOCAL/EXPERIMENTAL) to canonical naming schema:; Severity=MEDIUM}.File)\ | 71 | MEDIUM |
| \$(@{File=docs\operations-bible\06-optimization-history.md; Line=75; Content=| DEV (master) | **CLOUD-DEV-MASTER** | `DEV_DATABASE_URL` |; Severity=MEDIUM}.File)\ | 75 | MEDIUM |
| \$(@{File=docs\operations-bible\06-optimization-history.md; Line=77; Content=| LOCAL (primary) | **ONPREMISE-DEV-PRIMARY** | `DATABASE_ONPREMISE_DEV_PRIMARY` |; Severity=MEDIUM}.File)\ | 77 | MEDIUM |
| \$(@{File=docs\operations-bible\06-optimization-history.md; Line=78; Content=| EXPERIMENTAL | **ONPREMISE-DEV-EXPERIMENT** | `DATABASE_ONPREMISE_DEV_EXPERIMENT` |; Severity=MEDIUM}.File)\ | 78 | MEDIUM |
| \$(@{File=docs\operations-bible\09-discord-cache.md; Line=130; Content=### Local Testing; Severity=MEDIUM}.File)\ | 130 | MEDIUM |
| \$(@{File=docs\operations-bible\10-database-audit.md; Line=16; Content=- ✅ Triple-client architecture properly implemented (prod + 2 optional local); Severity=MEDIUM}.File)\ | 16 | MEDIUM |
| \$(@{File=docs\operations-bible\10-database-audit.md; Line=41; Content=Production (Render)          Workstation (OFFLINE - Local Dev Only); Severity=MEDIUM}.File)\ | 41 | MEDIUM |
| \$(@{File=docs\operations-bible\10-database-audit.md; Line=49; Content=│     Purpose: Local development with cloud-like data; Severity=MEDIUM}.File)\ | 49 | MEDIUM |
| \$(@{File=docs\operations-bible\10-database-audit.md; Line=264; Content=| **URL Priority** | PROD → EXTERNAL → INTERNAL → LOCAL | ✅ Matches in config.ts | ✅ PASS |; Severity=MEDIUM}.File)\ | 264 | MEDIUM |
| \$(@{File=docs\operations-bible\11-logging-storage.md; Line=107; Content=- Database connection stats (PROD, DEV, LOCAL); Severity=MEDIUM}.File)\ | 107 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=53; Content=| **On-Premise Dev** | PostgreSQL 16 | Workstation development mirror | `DATABASE_ONPREMISE_DEV_PRIMARY` | LOW | None (local only) |; Severity=MEDIUM}.File)\ | 53 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=70; Content=| **Battle Data Write** | <50 μs (microseconds) | <100 μs | Write Buffer + Write-DB | Simultaneous local writes |; Severity=MEDIUM}.File)\ | 70 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=71; Content=| **User Profile Read** | <50 ms (milliseconds) | <100 ms | Read-DB Mirror | SQLite local |; Severity=MEDIUM}.File)\ | 71 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=100; Content=// ✅ Served from: Engine Read-DB (SQLite local file); Severity=MEDIUM}.File)\ | 100 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=102; Content=// ✅ Network calls: ZERO (local disk read); Severity=MEDIUM}.File)\ | 102 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=110; Content=// ⚡ SIMULTANEOUS writes to BOTH local systems (parallel execution); Severity=MEDIUM}.File)\ | 110 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=154; Content=│  Memory  │  │  Local disk  │; Severity=MEDIUM}.File)\ | 154 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=293; Content=// ✅ Total latency: <50μs (both local, both fast); Severity=MEDIUM}.File)\ | 293 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=551; Content=│  Engine Write  │  ← In-Memory Buffer (fast local cache); Severity=MEDIUM}.File)\ | 551 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=565; Content=│                │    1. Engine Write Buffer (local fast); Severity=MEDIUM}.File)\ | 565 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=814; Content=- **Purpose:** Mirror canonical Pokémon reference data for fast local reads; Severity=MEDIUM}.File)\ | 814 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=851; Content=source_database TEXT NOT NULL  -- "PROD" or "LOCAL"; Severity=MEDIUM}.File)\ | 851 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=992; Content=// Simultaneous writes (fast local cache + staging DB); Severity=MEDIUM}.File)\ | 992 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=1080; Content=// Priority: PROD_DATABASE_URL → RENDER_DB_EXTERNAL_URL → LOCAL fallback; Severity=MEDIUM}.File)\ | 1080 | MEDIUM |
| \$(@{File=docs\operations-bible\database-operations-runbook-comprehensive.md; Line=1415; Content=# Step 2: Test connectivity from local machine; Severity=MEDIUM}.File)\ | 1415 | MEDIUM |
| \$(@{File=docs\operations-bible\INDEX.md; Line=41; Content=- **[DEVELOPMENT-BIBLE](../DEVELOPMENT-BIBLE.md)** — Local setup, testing, debugging; Severity=MEDIUM}.File)\ | 41 | MEDIUM |
| \$(@{File=docs\operations-bible\worker-troubleshooting-comprehensive.md; Line=795; Content=# Step 2: Test database connectivity from local machine; Severity=MEDIUM}.File)\ | 795 | MEDIUM |
| \$(@{File=docs\operations-bible\worker-troubleshooting-comprehensive.md; Line=941; Content=# Step 3: Compare to local environment; Severity=MEDIUM}.File)\ | 941 | MEDIUM |
| \$(@{File=docs\operations-bible\worker-troubleshooting-comprehensive.md; Line=980; Content=# Step 2: Compare to local versions; Severity=MEDIUM}.File)\ | 980 | MEDIUM |
| \$(@{File=docs\operations-bible\worker-troubleshooting-comprehensive.md; Line=1270; Content=- **Engine DB:** SQLite-based local database for game engine operations; Severity=MEDIUM}.File)\ | 1270 | MEDIUM |
| \$(@{File=docs\ROUTER.md; Line=68; Content=| **1. Local Setup** | 01-local-setup.md | AI environment (IG_ENV_FILE), workstation gameplay, VS Code integration (Render tasks, SSH) |; Severity=MEDIUM}.File)\ | 68 | MEDIUM |
| \$(@{File=docs\ROUTER.md; Line=119; Content=- **Local Setup**: development-bible/01-local-setup.md § 1.1 (IG_ENV_FILE loading); Severity=MEDIUM}.File)\ | 119 | MEDIUM |
| \$(@{File=docs\specialists\backend-developer-poc.md; Line=47; Content=# Optional: Local development database; Severity=MEDIUM}.File)\ | 47 | MEDIUM |
| \$(@{File=docs\specialists\devops-backup-diagnosis.md; Line=25; Content=- Local development environment has PostgreSQL 17.6; Severity=MEDIUM}.File)\ | 25 | MEDIUM |
| \$(@{File=docs\specialists\devops-backup-diagnosis.md; Line=39; Content=- Enables local pg_dump backups; Severity=MEDIUM}.File)\ | 39 | MEDIUM |
| \$(@{File=docs\specialists\devops-backup-diagnosis.md; Line=93; Content=| No local backup copy | Low | Render has 99.95% uptime SLA |; Severity=MEDIUM}.File)\ | 93 | MEDIUM |
| \$(@{File=docs\specialists\devops-backup-diagnosis.md; Line=105; Content=3. **Zero Installation Risk**: No local environment changes required; Severity=MEDIUM}.File)\ | 105 | MEDIUM |
| \$(@{File=docs\specialists\devops-backup-diagnosis.md; Line=107; Content=5. **Future Work**: Install PostgreSQL 18 during Week 2 for local development convenience; Severity=MEDIUM}.File)\ | 107 | MEDIUM |
| \$(@{File=docs\specialists\devops-backup-diagnosis.md; Line=150; Content=4. Update `README.md`: Add PostgreSQL 18 to local development prerequisites; Severity=MEDIUM}.File)\ | 150 | MEDIUM |
| \$(@{File=docs\specialists\devops-backup-diagnosis.md; Line=196; Content=- [ ] Install PostgreSQL 18 client tools for local development; Severity=MEDIUM}.File)\ | 196 | MEDIUM |
| \$(@{File=docs\specialists\devops-backup-diagnosis.md; Line=198; Content=- [ ] Test local backup workflow with PostgreSQL 18; Severity=MEDIUM}.File)\ | 198 | MEDIUM |
| \$(@{File=docs\specialists\devops-infrastructure-report.md; Line=217; Content=# Test restore to local database (validates backup integrity); Severity=MEDIUM}.File)\ | 217 | MEDIUM |
| \$(@{File=docs\specialists\network-topology-analysis.md; Line=43; Content=- **Link-Local**: `fe80::1ae8:e9d7:f26f:a74b%7`; Severity=MEDIUM}.File)\ | 43 | MEDIUM |
| \$(@{File=docs\specialists\network-topology-analysis.md; Line=166; Content=- **Meaning**: All non-local traffic → Forward to `192.168.23.254` (modem/router); Severity=MEDIUM}.File)\ | 166 | MEDIUM |
| \$(@{File=docs\specialists\network-topology-analysis.md; Line=169; Content=**Local Network Route**:; Severity=MEDIUM}.File)\ | 169 | MEDIUM |
| \$(@{File=docs\specialists\network-topology-analysis.md; Line=174; Content=- **Use Case**: Communication with other devices on local network (e.g., printers, NAS); Severity=MEDIUM}.File)\ | 174 | MEDIUM |
| \$(@{File=docs\specialists\network-topology-analysis.md; Line=190; Content=- **Meaning**: All non-local IPv6 traffic → Forward to `fe80::fa2d:c0ff:fe5b:8110` (modem/router link-local); Severity=MEDIUM}.File)\ | 190 | MEDIUM |
| \$(@{File=docs\specialists\network-topology-analysis.md; Line=208; Content=| 1   | 192.168.23.254  | Local modem/router      | ~4 ms         | Wi-Fi + processing overhead    |; Severity=MEDIUM}.File)\ | 208 | MEDIUM |
| \$(@{File=docs\specialists\network-topology-analysis.md; Line=215; Content=- Local network latency: ~4 ms (Wi-Fi overhead); Severity=MEDIUM}.File)\ | 215 | MEDIUM |
| \$(@{File=docs\specialists\network-topology-analysis.md; Line=297; Content=- Destination `35.90.247.165` does not match local network `192.168.23.0/24`; Severity=MEDIUM}.File)\ | 297 | MEDIUM |
| \$(@{File=docs\specialists\network-topology-analysis.md; Line=360; Content=2. **Local IP**: `192.168.23.83` (static assignment, DHCP disabled); Severity=MEDIUM}.File)\ | 360 | MEDIUM |
| \$(@{File=docs\specialists\network-topology-analysis.md; Line=363; Content=5. **Latency**: ~4 ms local, ~55-111 ms to internet (via ATT network); Severity=MEDIUM}.File)\ | 363 | MEDIUM |
| \$(@{File=docs\specialists\task-1-completion-report.md; Line=101; Content=- Restores to local test database (`infinity_gauntlet_test_restore`); Severity=MEDIUM}.File)\ | 101 | MEDIUM |
| \$(@{File=docs\specialists\task-8-grafana-dashboard-deployment.md; Line=151; Content=Open: https://grafana.your-domain.com (or localhost:3000 for local Grafana); Severity=MEDIUM}.File)\ | 151 | MEDIUM |
| \$(@{File=docs\VSCODE-DOCKER-GUIDE.md; Line=242; Content=### Local: Start Bot (Dev); Severity=MEDIUM}.File)\ | 242 | MEDIUM |
| \$(@{File=docs\VSCODE-DOCKER-GUIDE.md; Line=248; Content=3. Select "Local: Start Bot (Dev)"; Severity=MEDIUM}.File)\ | 248 | MEDIUM |
| \$(@{File=docs\VSCODE-DOCKER-GUIDE.md; Line=250; Content=This runs the bot using your local Node.js installation and local environment.; Severity=MEDIUM}.File)\ | 250 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=4; Content=Muted callouts note local-only tooling that never ships to prod/cloud runtimes.; Severity=MEDIUM}.File)\ | 4 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=64; Content=- `Store/ROUTER.md` — Runtime cache store and local Postgres mirror (prefer `npm run ops:auto-bootstrap-local-db` for tooling install + refresh; `npm run ops:bootstrap-local-db` if tooling already exists); Severity=MEDIUM}.File)\ | 64 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=65; Content=- `Store/db/ROUTER.md` — Local Postgres fallback cluster artifacts generated by the automated bootstrap (`npm run ops:auto-bootstrap-local-db`); Severity=MEDIUM}.File)\ | 65 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=72; Content=## Muted Local Files; Severity=MEDIUM}.File)\ | 72 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=73; Content=- `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env` — Muted (DEV Postgres secrets); set `IG_ENV_FILE` here for local and staging work. Keep the repo `.env` empty.; Severity=MEDIUM}.File)\ | 73 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=74; Content=- `C:/Users/sherb/OneDrive/Documents/Key/Prod/.env` — Muted (PROD credentials - DEPRECATED); historically used for Accelerate proxy. Now use Dev/.env with DEV_DATABASE_URL/PROD_DATABASE_URL for 2-node cluster.; Severity=MEDIUM}.File)\ | 74 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=75; Content=- `docs/db-control-suite.md` — Muted (local operator guide); documents `npm run db:cli` usage for dev DB checks.; Severity=MEDIUM}.File)\ | 75 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=76; Content=- `docs/ai-env-setup.md` — Muted (local env instructions); covers `IG_ENV_FILE` setup for agents.; Severity=MEDIUM}.File)\ | 76 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=86; Content=- `scripts/archive_task_history.mjs` — Muted (local archival helper); archive Tasklist history to `ops/ARCHIVE/` (now uses output-formatter); Severity=MEDIUM}.File)\ | 86 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=91; Content=- `scripts/restore_prisma_postgres.ps1` — Muted (local restore); Prisma Postgres tunnel + restore automation; Severity=MEDIUM}.File)\ | 91 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=92; Content=- `scripts/db_admin.ts` — Muted (local CLI); run via `npm run db:cli` for status, counts, and ad-hoc queries (now uses output-formatter); Severity=MEDIUM}.File)\ | 92 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=107; Content=- `scripts/ops/bootstrap_local_fallback.ts` — Sync the DEV database into the Store-backed Postgres fallback using binaries from `PG_BIN_DIR` and emit `local-url.txt` (`npm run ops:bootstrap-local-db`); Severity=MEDIUM}.File)\ | 107 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=109; Content=- `scripts/ops/auto_bootstrap_local_db.ps1` — Calls the installer when needed then executes the fallback refresh for a single-command bootstrap (`npm run ops:auto-bootstrap-local-db`).; Severity=MEDIUM}.File)\ | 109 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=122; Content=- 2025-11-05: Added a Store-backed Postgres fallback bootstrapper that mirrors DEV data and writes `Store/db/local-url.txt` for Prisma failover.; Severity=MEDIUM}.File)\ | 122 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=123; Content=- 2025-11-06: Landed a silent Postgres dependency installer plus a single wrapper command so `npm run ops:auto-bootstrap-local-db` provisions tooling then refreshes the Store-backed mirror.; Severity=MEDIUM}.File)\ | 123 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=137; Content=- `docs/development-bible/` (8 files) — Local setup, testing, debugging, performance, error handling, console tooling, utilities; Severity=MEDIUM}.File)\ | 137 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=157; Content=- Purpose: Hardened guard wrappers (e.g., `require-ensure-db-preload.mjs`) consumed by CI and local guard scripts.; Severity=MEDIUM}.File)\ | 157 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=165; Content=- Notes: `run_dex_migrations.ps1` drives the DEV/PROD migrate cadence; DEX v2 helpers cover backup generation (`ops:dex-v2-backup`), flag plan authoring (`ops:simulate-flag`), alert dry-runs (`ops:dex-v2-alert-dry-run`), and the Store-backed Postgres fallback bootstrapper (`ops:auto-bootstrap-local-db` for dependency install + refresh, `ops:bootstrap-local-db` when tooling already exists).; Severity=MEDIUM}.File)\ | 165 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=178; Content=- Notes: `discord-cache/` and `runtime-cache/` stay git-ignored; `Store/db` hosts the local Postgres cluster, snapshots, and `local-url.txt` written by the automated bootstrap (`npm run ops:auto-bootstrap-local-db`).; Severity=MEDIUM}.File)\ | 178 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=194; Content=- Purpose: Experimental Discord/worker sync utilities that mirror data into JSON manifests.; Severity=MEDIUM}.File)\ | 194 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=209; Content=- Purpose: Vendored Postgres client binaries for local recovery and migration workflows.; Severity=MEDIUM}.File)\ | 209 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=213; Content=- `tools/pgsql17/pgsql/bin/ROUTER.md` — CLI binaries used by local scripts; Severity=MEDIUM}.File)\ | 213 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=242; Content=- Prisma client boot now uses 2-node direct PostgreSQL cluster (DEV master + PROD local node) for <50ms latency gameplay.; Severity=MEDIUM}.File)\ | 242 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=262; Content=- `prisma.ts` — Triple Prisma clients (`prisma` for PROD local node + `devPrisma` for DEV master + `localPrisma` for workstation mirror), all connected on startup, exports `getDatabaseStats()` returning `TripleDatabaseStats` with separate DEV/PROD/LOCAL telemetry.; Severity=MEDIUM}.File)\ | 262 | MEDIUM |
| \$(@{File=masterroutetable.md; Line=267; Content=- 2025-11-07: `prisma.ts` maintains simultaneous DEV (direct PostgreSQL master via `DEV_DATABASE_URL` or `RENDER_DB_EXTERNAL_URL`), PROD (direct PostgreSQL local node via `PROD_DATABASE_URL` - PRIMARY for gameplay), and LOCAL (workstation mirror via `DATABASE_LOCAL_URL`) connections with independent heartbeat tracking; `getDatabaseStats()` surfaces all three in logger output.; Severity=MEDIUM}.File)\ | 267 | MEDIUM |
| \$(@{File=OPERATIONS.md; Line=116; Content=- **Providers:** Set `BACKUP_STORAGE_PROVIDER` to `s3` (Render/production) or `local` (developer dry runs). Leaving it unset defaults to `none`, which logs a warning and skips uploads—use only for emergency disablement.; Severity=MEDIUM}.File)\ | 116 | MEDIUM |
| \$(@{File=OPERATIONS.md; Line=118; Content=- **Local fallback:** For local validation, set `BACKUP_STORAGE_PROVIDER=local` and optionally `BACKUP_STORAGE_LOCAL_DIR` (defaults to `%TEMP%/infinity-gauntlet/outbox-backups`). Files land under `<prefix>/<topic>/<timestamp>-<id>.json`.; Severity=MEDIUM}.File)\ | 118 | MEDIUM |
| \$(@{File=OPERATIONS.md; Line=125; Content=- For local development, set `RENDER_DB_EXTERNAL_URL` to the external Render connection string and (optionally) export `DATABASE_CONNECTION_MODE=external` to force that endpoint. In `auto`, development builds already prefer the external URL when it is present.; Severity=MEDIUM}.File)\ | 125 | MEDIUM |
| \$(@{File=OPERATIONS.md; Line=152; Content=- `npm run worker:outbox` / `worker:cache` / `worker:data-pipeline` for local parity with Render workers.; Severity=MEDIUM}.File)\ | 152 | MEDIUM |
| \$(@{File=ops\RENDER-CREDENTIALS.md; Line=13; Content=- Local: `secrets/Infinity-Gauntlet.env` (gitignored); Severity=MEDIUM}.File)\ | 13 | MEDIUM |
| \$(@{File=ops\RENDER-CREDENTIALS.md; Line=35; Content=- Local scripts: `$env:RENDER_API_KEY` (loaded from `secrets/Infinity-Gauntlet.env`); Severity=MEDIUM}.File)\ | 35 | MEDIUM |
| \$(@{File=ops\RENDER-CREDENTIALS.md; Line=53; Content=2. **Local Environment** (Already configured in `secrets/Infinity-Gauntlet.env`):; Severity=MEDIUM}.File)\ | 53 | MEDIUM |
| \$(@{File=ops\RENDER-CREDENTIALS.md; Line=450; Content=- Update in: GitHub secrets, local environment file; Severity=MEDIUM}.File)\ | 450 | MEDIUM |
| \$(@{File=ops\RENDER-CREDENTIALS.md; Line=454; Content=- Use separate keys for different purposes (CI/CD, local dev, production); Severity=MEDIUM}.File)\ | 454 | MEDIUM |
| \$(@{File=ops\ROUTER.md; Line=9; Content=- 2025-11-06: Local Postgres fallback automation now lives under `scripts/ops/`; `npm run ops:auto-bootstrap-local-db` installs dependencies then refreshes the Store mirror. Docs (AGENTS, OPERATIONS, operations-bible) and ledger entries were updated to reflect the silent install flow.; Severity=MEDIUM}.File)\ | 9 | MEDIUM |
| \$(@{File=Patch.md; Line=29; Content=- **All database operations must use environment-aware URL selection** (see `docs/operations-bible/database-operations-runbook-comprehensive.md` § 2.1 Database URL Selection): All environments use `PROD_DATABASE_URL` (Render managed PostgreSQL); Migrations use `PROD_DATABASE_URL` or `RENDER_DB_EXTERNAL_URL` (direct PostgreSQL); Local development falls back to `DATABASE_ONPREMISE_DEV_PRIMARY` (workstation offline mode). Non-compliance causes production failures.; Severity=MEDIUM}.File)\ | 29 | MEDIUM |
| \$(@{File=Patch.md; Line=30; Content=- **Database naming MUST use canonical terms:** CLOUD-PROD-MASTER (`PROD_DATABASE_URL`), ONPREMISE-DEV-PRIMARY (`DATABASE_ONPREMISE_DEV_PRIMARY`), ONPREMISE-DEV-EXPERIMENT (`DATABASE_ONPREMISE_DEV_EXPERIMENT`). NEVER use ambiguous terms: local, LOCAL, PRIMARY LOCAL, EXPERIMENTAL, experiment, DEV_DATABASE_URL (deprecated). Prisma clients: `prisma`, `onPremiseDevPrisma`, `onPremiseExperimentPrisma`. CLI targets: `cloud-prod`, `onpremise-dev`, `onpremise-experiment`. See `docs/operations-bible/database-operations-runbook-comprehensive.md` § 2.2 (Database Terminology) for complete specification.; Severity=MEDIUM}.File)\ | 30 | MEDIUM |
| \$(@{File=Patch.md; Line=81; Content=- Include: HEAD (or `pending-local`), a concise summary sentence, `TasklistDiff true|false`, test results, `Contracts: ON|OFF (reason)`, and the READY pointer rationale.; Severity=MEDIUM}.File)\ | 81 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=23; Content=- EXPERIMENTAL database configured (port 55434); Severity=MEDIUM}.File)\ | 23 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=24; Content=- PRIMARY LOCAL database running (port 55433); Severity=MEDIUM}.File)\ | 24 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=25; Content=- Dual-local database architecture validated (see `docs/dual-local-database-guide.md`); Severity=MEDIUM}.File)\ | 25 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=132; Content=### Phase 1: EXPERIMENTAL Database Testing (100% OFFLINE); Severity=MEDIUM}.File)\ | 132 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=135; Content=# Step 1: Sync EXPERIMENTAL from PRIMARY LOCAL; Severity=MEDIUM}.File)\ | 135 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=136; Content=npm run ops:sync-experiment-db -- --from local; Severity=MEDIUM}.File)\ | 136 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=138; Content=# Step 2: Verify EXPERIMENTAL database state; Severity=MEDIUM}.File)\ | 138 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=142; Content=# Step 3: Apply migration to EXPERIMENTAL; Severity=MEDIUM}.File)\ | 142 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=159; Content=### Phase 2: PRIMARY LOCAL Validation (100% OFFLINE); Severity=MEDIUM}.File)\ | 159 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=162; Content=# Step 1: Apply migration to PRIMARY LOCAL; Severity=MEDIUM}.File)\ | 162 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=167; Content=npm run db:cli -- count User --target local; Severity=MEDIUM}.File)\ | 167 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=168; Content=npm run db:cli -- query "SELECT COUNT(*) FROM \"User\" WHERE \"tagline\" IS NOT NULL OR \"bio\" IS NOT NULL;" --target local; Severity=MEDIUM}.File)\ | 168 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=171; Content=npm run db:cli -- table_bloat --target local; Severity=MEDIUM}.File)\ | 171 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=172; Content=npm run db:cli -- slow_queries --target local; Severity=MEDIUM}.File)\ | 172 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=174; Content=# Step 4: Test application with local database; Severity=MEDIUM}.File)\ | 174 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=183; Content=psql $DEV_DATABASE_URL \; Severity=MEDIUM}.File)\ | 183 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=219; Content=### Rollback Testing (EXPERIMENTAL Database); Severity=MEDIUM}.File)\ | 219 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=222; Content=# Test rollback on EXPERIMENTAL first; Severity=MEDIUM}.File)\ | 222 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=279; Content=- [ ] EXPERIMENTAL testing complete; Severity=MEDIUM}.File)\ | 279 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=280; Content=- [ ] PRIMARY LOCAL validation complete; Severity=MEDIUM}.File)\ | 280 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=281; Content=- [ ] Rollback tested successfully on EXPERIMENTAL; Severity=MEDIUM}.File)\ | 281 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=354; Content=- **Dual-Local Database Guide:** `docs/dual-local-database-guide.md`; Severity=MEDIUM}.File)\ | 354 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=356; Content=- **AGENTS.md:** Dual Local Database Setup (Workstation Only) section; Severity=MEDIUM}.File)\ | 356 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=366; Content=- ✅ Rollback tested and validated on EXPERIMENTAL; Severity=MEDIUM}.File)\ | 366 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=372; Content=**Status:** Ready for EXPERIMENTAL testing; Severity=MEDIUM}.File)\ | 372 | MEDIUM |
| \$(@{File=prisma\migrations\20251108183000_northstar_phase2_consolidation\README.md; Line=373; Content=**Next Action:** Execute Phase 1 testing workflow on EXPERIMENTAL database; Severity=MEDIUM}.File)\ | 373 | MEDIUM |
| \$(@{File=Prompt.md; Line=75; Content=HEAD: pending-local (uncommitted architecture specification); Severity=MEDIUM}.File)\ | 75 | MEDIUM |
| \$(@{File=README.md; Line=53; Content=- **[Development Bible](docs/development-bible/INDEX.md)** — 7 sections (local setup, testing, debugging, utilities); Severity=MEDIUM}.File)\ | 53 | MEDIUM |
| \$(@{File=README.md; Line=72; Content=| SQLite read (fallback) | **<50ms** | Read-DB mirror | Local workstation offline mode |; Severity=MEDIUM}.File)\ | 72 | MEDIUM |
| \$(@{File=README.md; Line=81; Content=Write-DB (SQLite, local); Severity=MEDIUM}.File)\ | 81 | MEDIUM |
| \$(@{File=README.md; Line=118; Content=- PostgreSQL 17 (for local development); Severity=MEDIUM}.File)\ | 118 | MEDIUM |
| \$(@{File=README.md; Line=122; Content=### Quick Start (Local Development); Severity=MEDIUM}.File)\ | 122 | MEDIUM |
| \$(@{File=README.md; Line=136; Content=# 4. Database setup (local workstation); Severity=MEDIUM}.File)\ | 136 | MEDIUM |
| \$(@{File=README.md; Line=160; Content=# Database (Local Development - Optional); Severity=MEDIUM}.File)\ | 160 | MEDIUM |
| \$(@{File=README.md; Line=173; Content=**NEVER use:** "local", "LOCAL", "PRIMARY LOCAL", "EXPERIMENTAL", "DEV_DATABASE_URL" (deprecated); Severity=MEDIUM}.File)\ | 173 | MEDIUM |
| \$(@{File=README.md; Line=285; Content=│   └── development-bible/     # 7 sections (local setup, testing, debugging); Severity=MEDIUM}.File)\ | 285 | MEDIUM |
| \$(@{File=scripts\cache_client.mjs; Line=19; Content=throw new Error('Local cache checksum mismatch');; Severity=MEDIUM}.File)\ | 19 | MEDIUM |
| \$(@{File=scripts\cache_client.mjs; Line=49; Content=console.log(formatStatus(`Local cache unavailable: ${error instanceof Error ? error.message : error}`, 'warning'));; Severity=MEDIUM}.File)\ | 49 | MEDIUM |
| \$(@{File=scripts\check_prisma_findmany.ts; Line=3; Content=// Load PROD_DATABASE_URL from secrets file (local) or use existing env var (Render); Severity=MEDIUM}.File)\ | 3 | MEDIUM |
| \$(@{File=scripts\check_prisma_findmany.ts; Line=10; Content=// Try Render secret file location first, then local; Severity=MEDIUM}.File)\ | 10 | MEDIUM |
| \$(@{File=scripts\db_admin.ts; Line=77; Content=const candidates = [prodFileOverride, path.join(storeRoot, "onpremise-dev-primary", "local-url.txt"), path.join(storeRoot, "db", "local-url.txt"), path.join(storeRoot, "db", "local", "url.txt")]; Severity=MEDIUM}.File)\ | 77 | MEDIUM |
| \$(@{File=scripts\db_admin.ts; Line=168; Content="ONPREMISE-DEV-EXPERIMENT target requires DATABASE_ONPREMISE_DEV_EXPERIMENT. Bootstrap experimental database first: npm run ops:bootstrap-onpremise-experiment",; Severity=MEDIUM}.File)\ | 168 | MEDIUM |
| \$(@{File=scripts\db_admin.ts; Line=175; Content=// Default behavior: try PRIMARY LOCAL, then cloud databases; Severity=MEDIUM}.File)\ | 175 | MEDIUM |
| \$(@{File=scripts\db_admin.ts; Line=240; Content=target = (value ?? "local").toLowerCase();; Severity=MEDIUM}.File)\ | 240 | MEDIUM |
| \$(@{File=scripts\db_admin.ts; Line=288; Content=["Local fallback file", localUrl ? "yes" : "no"],; Severity=MEDIUM}.File)\ | 288 | MEDIUM |
| \$(@{File=scripts\db_admin.ts; Line=849; Content=console.log("\nLegacy aliases supported: dev (cloud-dev), prod (cloud-prod), local (onpremise-dev), experiment (onpremise-experiment)");; Severity=MEDIUM}.File)\ | 849 | MEDIUM |
| \$(@{File=scripts\db_admin.ts; Line=873; Content=["--target=<db>", "Target database: 'cloud-dev', 'cloud-prod', 'onpremise-dev' (default), 'onpremise-experiment'. Legacy aliases: 'dev', 'prod', 'local', 'experiment'."],; Severity=MEDIUM}.File)\ | 873 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=23; Content=*   sync {target}         - Sync databases (dev-to-prod, prod-to-local, full-cascade); Severity=MEDIUM}.File)\ | 23 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=27; Content=*   integrity {scope}     - Run integrity checks (dev-prod, prod-local, all); Severity=MEDIUM}.File)\ | 27 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=28; Content=*   version {env}         - Show version fingerprint for environment (dev, prod, local); Severity=MEDIUM}.File)\ | 28 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=32; Content=*   reset-local           - Drop and rebuild Local from Prod (emergency); Severity=MEDIUM}.File)\ | 32 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=56; Content=| "reset-local"; Severity=MEDIUM}.File)\ | 56 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=171; Content=} else if (target === "prod-to-local") {; Severity=MEDIUM}.File)\ | 171 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=173; Content=console.error(formatStatus("Local database not configured (DATABASE_LOCAL_URL required)", "error"));; Severity=MEDIUM}.File)\ | 173 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=177; Content=console.log(formatStatus(`Starting Prod → Local sync${dryRun ? " (DRY RUN)" : ""}`, "info"));; Severity=MEDIUM}.File)\ | 177 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=181; Content=console.log("[SUCCESS] Prod → Local sync completed");; Severity=MEDIUM}.File)\ | 181 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=184; Content=console.error("[ERROR] Prod → Local sync failed");; Severity=MEDIUM}.File)\ | 184 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=190; Content=console.log(`[INFO] Starting full cascade sync (DEV → Prod → Local)${dryRun ? " (DRY RUN)" : ""}...`);; Severity=MEDIUM}.File)\ | 190 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=205; Content=// Step 2: Prod → Local; Severity=MEDIUM}.File)\ | 205 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=207; Content=console.log("[WARN] Local database not configured, skipping Prod → Local sync");; Severity=MEDIUM}.File)\ | 207 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=209; Content=console.log("\n[STEP 2/2] Prod → Local");; Severity=MEDIUM}.File)\ | 209 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=213; Content=console.error("[ERROR] Prod → Local sync failed");; Severity=MEDIUM}.File)\ | 213 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=219; Content=console.log("[SUCCESS] Prod → Local completed");; Severity=MEDIUM}.File)\ | 219 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=225; Content=console.error("Valid targets: dev-to-prod, prod-to-local, full-cascade");; Severity=MEDIUM}.File)\ | 225 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=242; Content=const localVersion = localPrisma ? await getVersion(localPrisma, "LOCAL") : null;; Severity=MEDIUM}.File)\ | 242 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=277; Content=// LOCAL section; Severity=MEDIUM}.File)\ | 277 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=280; Content=header: "💻 LOCAL Database",; Severity=MEDIUM}.File)\ | 280 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=289; Content=header: "💻 LOCAL Database",; Severity=MEDIUM}.File)\ | 289 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=307; Content=// Prod → Local cascade; Severity=MEDIUM}.File)\ | 307 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=312; Content=header: "🔄 Prod → Local Cascade",; Severity=MEDIUM}.File)\ | 312 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=398; Content=else if (env1 === "local") client1 = localPrisma;; Severity=MEDIUM}.File)\ | 398 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=402; Content=else if (env2 === "local") client2 = localPrisma;; Severity=MEDIUM}.File)\ | 402 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=479; Content=if (scope === "prod-local" || scope === "all") {; Severity=MEDIUM}.File)\ | 479 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=481; Content=console.log(formatStatus("Local database not configured, skipping Prod ↔ Local integrity check", "warning"));; Severity=MEDIUM}.File)\ | 481 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=483; Content=console.log(formatSectionHeader("🔍 Checking Prod ↔ Local integrity"));; Severity=MEDIUM}.File)\ | 483 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=513; Content=if (scope !== "dev-prod" && scope !== "prod-local" && scope !== "all") {; Severity=MEDIUM}.File)\ | 513 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=515; Content=console.error("Valid scopes: dev-prod, prod-local, all");; Severity=MEDIUM}.File)\ | 515 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=533; Content=else if (env === "local") client = localPrisma;; Severity=MEDIUM}.File)\ | 533 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=573; Content=const localVersion = localPrisma ? await getVersion(localPrisma, "LOCAL") : null;; Severity=MEDIUM}.File)\ | 573 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=587; Content=versionInfo.push(["LOCAL", `${localVersion.fingerprint} (${localVersion.migrationCount} migrations)`]);; Severity=MEDIUM}.File)\ | 587 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=589; Content=versionInfo.push(["LOCAL", "Not configured"]);; Severity=MEDIUM}.File)\ | 589 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=610; Content=// Compare Prod vs Local; Severity=MEDIUM}.File)\ | 610 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=616; Content=console.log(formatSectionHeader("🔄 Prod → Local"));; Severity=MEDIUM}.File)\ | 616 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=651; Content=console.log(formatStatus("reset-local: This command will be implemented after pg_dump/restore integration", "warning"));; Severity=MEDIUM}.File)\ | 651 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=654; Content="Backup current Local database",; Severity=MEDIUM}.File)\ | 654 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=655; Content="Drop Local database",; Severity=MEDIUM}.File)\ | 655 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=657; Content="pg_restore to Local",; Severity=MEDIUM}.File)\ | 657 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=679; Content=["", "  Targets: dev-to-prod, prod-to-local, full-cascade"],; Severity=MEDIUM}.File)\ | 679 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=687; Content=["", "  Environments: dev, prod, local"],; Severity=MEDIUM}.File)\ | 687 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=690; Content=["", "  Scopes: dev-prod, prod-local, all"],; Severity=MEDIUM}.File)\ | 690 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=693; Content=["", "  Environments: dev, prod, local"],; Severity=MEDIUM}.File)\ | 693 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=701; Content=["reset-local", "Drop and rebuild Local from Prod (emergency)"],; Severity=MEDIUM}.File)\ | 701 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=723; Content=["DATABASE_URL", "PROD database (direct PostgreSQL, local node)"],; Severity=MEDIUM}.File)\ | 723 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=726; Content=["DATABASE_LOCAL_URL", "LOCAL database (Render Node disk mirror)"],; Severity=MEDIUM}.File)\ | 726 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=752; Content=console.log(formatStatus("sync requires a target (dev-to-prod, prod-to-local, full-cascade)", "error"));; Severity=MEDIUM}.File)\ | 752 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=776; Content=console.log(formatStatus("integrity requires a scope (dev-prod, prod-local, all)", "error"));; Severity=MEDIUM}.File)\ | 776 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=784; Content=console.log(formatStatus("version requires an environment (dev, prod, local)", "error"));; Severity=MEDIUM}.File)\ | 784 | MEDIUM |
| \$(@{File=scripts\db_replication.ts; Line=802; Content=case "reset-local":; Severity=MEDIUM}.File)\ | 802 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=39; Content=type EnvironmentName = "dev" | "prod" | "local";; Severity=MEDIUM}.File)\ | 39 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=66; Content=affectedEnvironment?: "dev" | "local"; // PROD is master, so DEV or LOCAL can be affected; Severity=MEDIUM}.File)\ | 66 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=301; Content=includeLocal: false, // Local workstation sync is opt-in; Severity=MEDIUM}.File)\ | 301 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=313; Content=case "--local-env":; Severity=MEDIUM}.File)\ | 313 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=350; Content=case "--include-local":; Severity=MEDIUM}.File)\ | 350 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=543; Content=// Fallback chain: PROD → RENDER_EXTERNAL → RENDER_INTERNAL → LOCAL → DATABASE_URL; Severity=MEDIUM}.File)\ | 543 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=689; Content=* PROD is the production database - DEV and LOCAL replicate from it; Severity=MEDIUM}.File)\ | 689 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=713; Content=* Alerts if unauthorized changes detected in DEV/LOCAL; Severity=MEDIUM}.File)\ | 713 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=737; Content=affectedEnvironment: targetEnv === "local" ? "local" : "dev",; Severity=MEDIUM}.File)\ | 737 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=798; Content=// Handle LOCAL workstation if enabled; Severity=MEDIUM}.File)\ | 798 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=802; Content=log("enforce.strategy", { target: "local", source: "prod", mode: "master_enforcement" });; Severity=MEDIUM}.File)\ | 802 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=803; Content=await enforceProdMaster("local", config.localEnvPath!, localVars, prodVars, config.dryRun);; Severity=MEDIUM}.File)\ | 803 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=805; Content=await runPhase("local", config.localEnvPath!, localVars, config.dryRun);; Severity=MEDIUM}.File)\ | 805 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=807; Content=localCounts = await captureCounts("local", localVars);; Severity=MEDIUM}.File)\ | 807 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=840; Content=local: config.localEnvPath,; Severity=MEDIUM}.File)\ | 840 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=868; Content=environments: config.includeLocal ? ["prod", "dev", "local"] : ["prod", "dev"],; Severity=MEDIUM}.File)\ | 868 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=903; Content=log("local.env.missing", {; Severity=MEDIUM}.File)\ | 903 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=904; Content=message: "Local env file not found; checking for PROD_DATABASE_URL or DATABASE_LOCAL_URL in process.env",; Severity=MEDIUM}.File)\ | 904 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=907; Content=// Fallback to process.env for LOCAL/PROD database; Severity=MEDIUM}.File)\ | 907 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=1039; Content=local: CountSnapshot | null;; Severity=MEDIUM}.File)\ | 1039 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=1043; Content=local: null,; Severity=MEDIUM}.File)\ | 1043 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=1061; Content=history.local = startupCounts.localCounts;; Severity=MEDIUM}.File)\ | 1061 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=1102; Content=history.local = consolidated.localCounts;; Severity=MEDIUM}.File)\ | 1102 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=1142; Content=history.local = consolidated.localCounts;; Severity=MEDIUM}.File)\ | 1142 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=1173; Content=// Also update local if included; Severity=MEDIUM}.File)\ | 1173 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=1175; Content=history.local = consolidated.localCounts;; Severity=MEDIUM}.File)\ | 1175 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=1204; Content=// Check LOCAL hasn't diverged from PROD (if included); Severity=MEDIUM}.File)\ | 1204 | MEDIUM |
| \$(@{File=scripts\dev_prod_auto_sync.ts; Line=1208; Content="local",; Severity=MEDIUM}.File)\ | 1208 | MEDIUM |
| \$(@{File=scripts\ensure-data.js; Line=56; Content=console.log('ensure-data: trying local build via build-data…');; Severity=MEDIUM}.File)\ | 56 | MEDIUM |
| \$(@{File=scripts\guards\ROUTER.md; Line=9; Content=- Guard scripts are invoked from GitHub Actions and local guard wrappers; keep outputs terse and actionable.; Severity=MEDIUM}.File)\ | 9 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_dev.ts; Line=216; Content=`[onpremise-dev] Skipping Postgres bin directory without share/: ${normalized}. Run "npm run ops:auto-bootstrap-local-db" to install a complete toolchain.`,; Severity=MEDIUM}.File)\ | 216 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_dev.ts; Line=231; Content="Unable to locate Postgres binaries with a share directory. Set PG_BIN_DIR manually or run \"npm run ops:auto-bootstrap-local-db\" to install dependencies.",; Severity=MEDIUM}.File)\ | 231 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_dev.ts; Line=473; Content=console.log(`[onpremise-dev] Started local Postgres on port ${options.port}`);; Severity=MEDIUM}.File)\ | 473 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_dev.ts; Line=476; Content=throw new Error("Local Postgres is not running. Remove --skip-start or start the cluster manually before syncing.");; Severity=MEDIUM}.File)\ | 476 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_dev.ts; Line=490; Content=console.log(`[onpremise-dev] Local fallback ready on ${localUrl} (sync skipped).`);; Severity=MEDIUM}.File)\ | 490 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_dev.ts; Line=501; Content=console.log(`[onpremise-dev] Local fallback synchronized from ${maskConnectionString(sourceUrl)}.`);; Severity=MEDIUM}.File)\ | 501 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=110; Content=port: parsed.port ?? 55_434, // Experimental DB uses 55434 by default; Severity=MEDIUM}.File)\ | 110 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=111; Content=source: parsed.source ?? "local", // Default: clone from primary local DB; Severity=MEDIUM}.File)\ | 111 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=150; Content=case "local":; Severity=MEDIUM}.File)\ | 150 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=233; Content=console.log("🛑 Stopping existing experimental database cluster...");; Severity=MEDIUM}.File)\ | 233 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=259; Content=console.log("✅ Experimental cluster stopped");; Severity=MEDIUM}.File)\ | 259 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=271; Content=console.log("🔨 Initializing experimental database cluster...");; Severity=MEDIUM}.File)\ | 271 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=304; Content=console.log(`🚀 Starting experimental database cluster on port ${port}...`);; Severity=MEDIUM}.File)\ | 304 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=392; Content=// Step 2: Create experimental database; Severity=MEDIUM}.File)\ | 392 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=419; Content=// Step 3: Restore dump to experimental database; Severity=MEDIUM}.File)\ | 419 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=421; Content=console.log("   Restoring snapshot to experimental database...");; Severity=MEDIUM}.File)\ | 421 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=468; Content=purpose: "experimental development and migration testing",; Severity=MEDIUM}.File)\ | 468 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=508; Content=console.log("🎯 Bootstrap Experimental Database");; Severity=MEDIUM}.File)\ | 508 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=528; Content=console.error("Available sources: local, dev, prod, or full postgresql:// URL");; Severity=MEDIUM}.File)\ | 528 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=530; Content=console.error("  - DATABASE_ONPREMISE_DEV_PRIMARY (for source=local)");; Severity=MEDIUM}.File)\ | 530 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=566; Content=console.log("\n✅ Experimental database bootstrap complete!");; Severity=MEDIUM}.File)\ | 566 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=578; Content=console.log("  4. Sync from primary local when needed:");; Severity=MEDIUM}.File)\ | 578 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=579; Content=console.log("     npm run ops:sync-onpremise-experiment --from local");; Severity=MEDIUM}.File)\ | 579 | MEDIUM |
| \$(@{File=scripts\ops\bootstrap_onpremise_experiment.ts; Line=581; Content=console.log("\n✅ Experimental cluster initialized (not started)");; Severity=MEDIUM}.File)\ | 581 | MEDIUM |
| \$(@{File=scripts\ops\ROUTER.md; Line=12; Content=- `bootstrap_local_fallback.ts` hydrates the Store-backed Postgres mirror from the DEV database, expects `PG_BIN_DIR`, and emits `local-url.txt` for Prisma fallback (`npm run ops:bootstrap-local-db`).; Severity=MEDIUM}.File)\ | 12 | MEDIUM |
| \$(@{File=scripts\ops\ROUTER.md; Line=14; Content=- `auto_bootstrap_local_db.ps1` invokes the bundle installer when needed then executes the TypeScript bootstrapper for a single-command fallback refresh (`npm run ops:auto-bootstrap-local-db`).; Severity=MEDIUM}.File)\ | 14 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=9; Content=* Sync Experimental Database Script; Severity=MEDIUM}.File)\ | 9 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=11; Content=* Refreshes the experimental database by cloning from a source database:; Severity=MEDIUM}.File)\ | 11 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=12; Content=* - --from local (default): Clone from PRIMARY LOCAL database (offline sync); Severity=MEDIUM}.File)\ | 12 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=18; Content=*   npm run ops:sync-experiment-db -- --from local; Severity=MEDIUM}.File)\ | 18 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=93; Content=from: parsed.from ?? "local",; Severity=MEDIUM}.File)\ | 93 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=270; Content=console.log("[sync-experiment] Stopping experimental cluster...");; Severity=MEDIUM}.File)\ | 270 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=284; Content=console.log("[sync-experiment] Starting experimental cluster...");; Severity=MEDIUM}.File)\ | 284 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=296; Content=case "local": {; Severity=MEDIUM}.File)\ | 296 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=300; Content="DATABASE_ONPREMISE_DEV_PRIMARY or PROD_DATABASE_URL not configured. Bootstrap PRIMARY LOCAL DB first.",; Severity=MEDIUM}.File)\ | 300 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=328; Content=`Invalid --from value: "${source}". Use: local, dev, prod, or postgres://...`,; Severity=MEDIUM}.File)\ | 328 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=455; Content=console.log("[sync-experiment] Sync Experimental Database");; Severity=MEDIUM}.File)\ | 455 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=468; Content=// Validate experimental cluster exists; Severity=MEDIUM}.File)\ | 468 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=470; Content=console.error("[sync-experiment] Experimental cluster not initialized.");; Severity=MEDIUM}.File)\ | 470 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=494; Content=console.log("[sync-experiment] Restoring snapshot to experimental database...");; Severity=MEDIUM}.File)\ | 494 | MEDIUM |
| \$(@{File=scripts\ops\sync_onpremise_experiment.ts; Line=512; Content=console.log(`[sync-experiment] Experimental database synchronized from ${sourceName}`);; Severity=MEDIUM}.File)\ | 512 | MEDIUM |
| \$(@{File=scripts\README-RENDER.md; Line=47; Content=Streams logs with local timestamps for easier debugging.; Severity=MEDIUM}.File)\ | 47 | MEDIUM |
| \$(@{File=scripts\README-RENDER.md; Line=120; Content=sudo mv /tmp/render /usr/local/bin/; Severity=MEDIUM}.File)\ | 120 | MEDIUM |
| \$(@{File=scripts\README-RENDER.md; Line=121; Content=sudo chmod +x /usr/local/bin/render; Severity=MEDIUM}.File)\ | 121 | MEDIUM |
| \$(@{File=scripts\README-RENDER.md; Line=261; Content=-Type local; Severity=MEDIUM}.File)\ | 261 | MEDIUM |
| \$(@{File=scripts\ROUTER.md; Line=33; Content=- 2025-11-05: Added `ops:bootstrap-local-db` (see `scripts/ops/bootstrap_local_fallback.ts`) to hydrate the Store-hosted Postgres mirror for offline failover.; Severity=MEDIUM}.File)\ | 33 | MEDIUM |
| \$(@{File=scripts\ROUTER.md; Line=34; Content=- 2025-11-06: Added `scripts/ops/ensure_postgres_bundle.ps1` and `scripts/ops/auto_bootstrap_local_db.ps1`; run `npm run ops:auto-bootstrap-local-db` to silently install Postgres tooling then refresh the local fallback end-to-end.; Severity=MEDIUM}.File)\ | 34 | MEDIUM |
| \$(@{File=scripts\shared\database-url.ts; Line=23; Content=* LOCAL DEVELOPMENT: Falls back to DATABASE_ONPREMISE_DEV_PRIMARY (workstation offline mode); Severity=MEDIUM}.File)\ | 23 | MEDIUM |
| \$(@{File=scripts\validate_database_urls.js; Line=18; Content=// Unified architecture: Check environment-specific URLs (PROD primary, optional LOCAL); Severity=MEDIUM}.File)\ | 18 | MEDIUM |
| \$(@{File=secrets\README.md; Line=1; Content=# Secrets Directory (Local Only); Severity=MEDIUM}.File)\ | 1 | MEDIUM |
| \$(@{File=secrets\README.md; Line=3; Content=This folder remains gitignored. The **single consolidated environment file** for all local development and testing is:; Severity=MEDIUM}.File)\ | 3 | MEDIUM |
| \$(@{File=secrets\README.md; Line=12; Content=- `DATABASE_ONPREMISE_DEV_PRIMARY` — Local workstation PostgreSQL cluster (optional offline mirror); Severity=MEDIUM}.File)\ | 12 | MEDIUM |
| \$(@{File=secrets\ROUTER.md; Line=12; Content=- README.md - Instructions for setting up local secret mirrors and environment overrides.; Severity=MEDIUM}.File)\ | 12 | MEDIUM |
| \$(@{File=src\bot\main.js; Line=1629; Content=// Check for MASTER, LOCAL-R, and LOCAL-W readiness (not just checking for 'loading'); Severity=MEDIUM}.File)\ | 1629 | MEDIUM |
| \$(@{File=src\bot\main.js; Line=3188; Content=hostname: process.env.RENDER_SERVICE_NAME || 'local',; Severity=MEDIUM}.File)\ | 3188 | MEDIUM |
| \$(@{File=src\bot\state\persistence.js; Line=46; Content=hostname: process.env.RENDER_SERVICE_NAME || 'local',; Severity=MEDIUM}.File)\ | 46 | MEDIUM |
| \$(@{File=src\bot\state\persistence.js; Line=311; Content=hostname: process.env.RENDER_SERVICE_NAME || 'local',; Severity=MEDIUM}.File)\ | 311 | MEDIUM |
| \$(@{File=src\config\engine-db-config.ts; Line=36; Content=* - Local dev: ./Store (relative to project root); Severity=MEDIUM}.File)\ | 36 | MEDIUM |
| \$(@{File=src\config\ROUTER.md; Line=24; Content=- STORAGE_BASE_DIR — /Store/ (production), Store/ (local), Store/test/ (test); Severity=MEDIUM}.File)\ | 24 | MEDIUM |
| \$(@{File=src\engine\effects.js; Line=8; Content=* - Supports AI preference: ctx.effectSource = 'auto' | 'pokeapi' | 'local'; Severity=MEDIUM}.File)\ | 8 | MEDIUM |
| \$(@{File=src\engine\effects.js; Line=9; Content=*   default 'auto' => prefer PokéAPI meta if present, else local override.; Severity=MEDIUM}.File)\ | 9 | MEDIUM |
| \$(@{File=src\engine\effects.js; Line=20; Content=// Local fallback: data/effects.json (optional); Severity=MEDIUM}.File)\ | 20 | MEDIUM |
| \$(@{File=src\engine\effects.js; Line=96; Content=if (pref === 'local')   return hasLocal ? 'local'   : null;; Severity=MEDIUM}.File)\ | 96 | MEDIUM |
| \$(@{File=src\engine\effects.js; Line=99; Content=if (hasLocal) return 'local';; Severity=MEDIUM}.File)\ | 99 | MEDIUM |
| \$(@{File=src\engine\effects.js; Line=124; Content=if (src === 'local') {; Severity=MEDIUM}.File)\ | 124 | MEDIUM |
| \$(@{File=src\index.ts; Line=1649; Content=environment: process.env.IS_RENDER ? 'render' : 'local',; Severity=MEDIUM}.File)\ | 1649 | MEDIUM |
| \$(@{File=src\index.ts; Line=1728; Content=// Capture heap snapshot to disk (production only, to avoid local pollution); Severity=MEDIUM}.File)\ | 1728 | MEDIUM |
| \$(@{File=src\index.ts; Line=1757; Content=log.info("⏰ Auto-restart disabled in local development");; Severity=MEDIUM}.File)\ | 1757 | MEDIUM |
| \$(@{File=src\runtime\autoSync.ts; Line=23; Content=// Use env file paths if explicitly provided (local development); Severity=MEDIUM}.File)\ | 23 | MEDIUM |
| \$(@{File=src\runtime\databaseRecovery.ts; Line=63; Content=* Run bootstrap script for on-premise/local development node; Severity=MEDIUM}.File)\ | 63 | MEDIUM |
| \$(@{File=src\runtime\databaseRecovery.ts; Line=65; Content=* IMPORTANT: This script is for LOCAL/ON-PREMISE development only.; Severity=MEDIUM}.File)\ | 65 | MEDIUM |
| \$(@{File=src\runtime\databaseRecovery.ts; Line=80; Content=// Only run for local/on-premise production environments; Severity=MEDIUM}.File)\ | 80 | MEDIUM |
| \$(@{File=src\shared\config.ts; Line=15; Content=| "local"; Severity=MEDIUM}.File)\ | 15 | MEDIUM |
| \$(@{File=src\shared\config.ts; Line=24; Content=export type BackupStorageProvider = "none" | "s3" | "local";; Severity=MEDIUM}.File)\ | 24 | MEDIUM |
| \$(@{File=src\shared\config.ts; Line=80; Content=const candidates = [fileOverride, path.join(storeRoot, "onpremise-dev-primary", "local-url.txt"), path.join(storeRoot, "db", "local-url.txt"), path.join(storeRoot, "db", "local", "url.txt")]; Severity=MEDIUM}.File)\ | 80 | MEDIUM |
| \$(@{File=src\shared\config.ts; Line=124; Content=["external", "pool", "internal", "direct", "env", "local"].includes(source); Severity=MEDIUM}.File)\ | 124 | MEDIUM |
| \$(@{File=src\shared\config.ts; Line=201; Content=// Priority: PROD_DATABASE_URL → RENDER_DB_EXTERNAL_URL → RENDER_DB_INTERNAL_URL → LOCAL; Severity=MEDIUM}.File)\ | 201 | MEDIUM |
| \$(@{File=src\shared\config.ts; Line=207; Content=addDirectCandidate(onPremiseDevUrl, "local");; Severity=MEDIUM}.File)\ | 207 | MEDIUM |
| \$(@{File=src\shared\config.ts; Line=211; Content=addDirectCandidate(localFallbackUrl, "local", true);; Severity=MEDIUM}.File)\ | 211 | MEDIUM |
| \$(@{File=src\shared\config.ts; Line=272; Content=throw new Error("Database URL cannot point to localhost in production (unless using PROD_DATABASE_URL for CLOUD-PROD-RUNTIME local node).");; Severity=MEDIUM}.File)\ | 272 | MEDIUM |
| \$(@{File=src\shared\config.ts; Line=305; Content=: backupProviderRaw === "local"; Severity=MEDIUM}.File)\ | 305 | MEDIUM |
| \$(@{File=src\shared\config.ts; Line=306; Content=? "local"; Severity=MEDIUM}.File)\ | 306 | MEDIUM |
| \$(@{File=src\shared\config.ts; Line=341; Content=if (source === "internal" || source === "pool" || source === "direct" || source === "local") {; Severity=MEDIUM}.File)\ | 341 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=5; Content=* Maintains PROD (production database) and LOCAL (optional workstation) connection pools.; Severity=MEDIUM}.File)\ | 5 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=15; Content=* - LOCAL Pool: Connected to DATABASE_ONPREMISE_DEV_PRIMARY (optional workstation mirror); Severity=MEDIUM}.File)\ | 15 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=30; Content=local?: string;  // DATABASE_ONPREMISE_DEV_PRIMARY (optional workstation mirror); Severity=MEDIUM}.File)\ | 30 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=44; Content=local: DbStats;; Severity=MEDIUM}.File)\ | 44 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=58; Content=local: this.createEmptyStats(),; Severity=MEDIUM}.File)\ | 58 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=68; Content=const { prod, local } = config;; Severity=MEDIUM}.File)\ | 68 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=82; Content=// Create LOCAL pool (optional workstation mirror); Severity=MEDIUM}.File)\ | 82 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=83; Content=if (local) {; Severity=MEDIUM}.File)\ | 83 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=84; Content=this.localPool = this.createPool(local, 'LOCAL');; Severity=MEDIUM}.File)\ | 84 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=85; Content=await this.testConnection(this.localPool, 'local');; Severity=MEDIUM}.File)\ | 85 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=94; Content=log.info(`  LOCAL: ${this.localPool ? 'enabled' : 'disabled'}`);; Severity=MEDIUM}.File)\ | 94 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=114; Content=* Get LOCAL database pool (optional workstation mirror).; Severity=MEDIUM}.File)\ | 114 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=117; Content=* @throws Error if LOCAL pool not initialized; Severity=MEDIUM}.File)\ | 117 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=121; Content=throw new Error('LOCAL database pool not initialized. Check DATABASE_ONPREMISE_DEV_PRIMARY configuration.');; Severity=MEDIUM}.File)\ | 121 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=209; Content=private async testConnection(pool: pg.Pool, type: 'prod' | 'local'): Promise<void> {; Severity=MEDIUM}.File)\ | 209 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=253; Content=checks.push(this.updatePoolStats(this.localPool, 'local'));; Severity=MEDIUM}.File)\ | 253 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=259; Content=private async updatePoolStats(pool: pg.Pool, type: 'prod' | 'local'): Promise<void> {; Severity=MEDIUM}.File)\ | 259 | MEDIUM |
| \$(@{File=src\shared\pg-connection.ts; Line=318; Content=local: process.env.DATABASE_ONPREMISE_DEV_PRIMARY,; Severity=MEDIUM}.File)\ | 318 | MEDIUM |
| \$(@{File=src\shared\pg-transaction.ts; Line=72; Content=await client.query(`SET LOCAL statement_timeout = ${options.timeout}`);; Severity=MEDIUM}.File)\ | 72 | MEDIUM |
| \$(@{File=src\shared\prisma.ts; Line=536; Content=log.info("LOCAL database connection skipped", { reason: "no DATABASE_ONPREMISE_DEV_PRIMARY" });; Severity=MEDIUM}.File)\ | 536 | MEDIUM |
| \$(@{File=src\shared\prisma.ts; Line=577; Content=log.info("LOCAL Prisma client connected (workstation development)", {; Severity=MEDIUM}.File)\ | 577 | MEDIUM |
| \$(@{File=src\shared\prisma.ts; Line=582; Content=// Start LOCAL heartbeat; Severity=MEDIUM}.File)\ | 582 | MEDIUM |
| \$(@{File=src\shared\prisma.ts; Line=612; Content=log.warn("LOCAL Prisma client connection failed", {; Severity=MEDIUM}.File)\ | 612 | MEDIUM |
| \$(@{File=src\shared\ROUTER.md; Line=10; Content=- `config.ts` also reads `DATABASE_LOCAL_URL` or `Store/db/local-url.txt` when present so Prisma can fall back to the Store-hosted Postgres mirror when remote datasources fail.; Severity=MEDIUM}.File)\ | 10 | MEDIUM |
| \$(@{File=src\shared\ROUTER.md; Line=11; Content=- `prisma.ts` initializes **dual Prisma clients** (`prisma` for PROD local node, `devPrisma` for DEV master), validates URLs early, connects both on startup, and shares `$connect()` across importers. Exports `getDatabaseStats()` returning `DualDatabaseStats` with separate telemetry for DEV and PROD connections including source, transport, latency, and status.; Severity=MEDIUM}.File)\ | 11 | MEDIUM |
| \$(@{File=src\shared\storage\ROUTER.md; Line=8; Content=- `backup-sink.ts` streams processed payloads to the configured durable store (S3 or local fallback) and records telemetry for `/ops stats`.; Severity=MEDIUM}.File)\ | 8 | MEDIUM |
| \$(@{File=src\utils\intelligent-logger.ts; Line=823; Content=|| 'local';; Severity=MEDIUM}.File)\ | 823 | MEDIUM |
| \$(@{File=src\utils\logger.js; Line=273; Content=* @returns {Promise<object>} Database stats for MASTER (PROD), LOCAL (Engine DBs), ONPREMISE-DEV, ONPREMISE-EXPERIMENT; Severity=MEDIUM}.File)\ | 273 | MEDIUM |
| \$(@{File=src\utils\logger.js; Line=815; Content=// LOCAL = Engine DBs on persistent disk (Read-DB + Write-DB for game engine); Severity=MEDIUM}.File)\ | 815 | MEDIUM |
| \$(@{File=src\utils\logger.js; Line=833; Content=// LOCAL databases (Engine DBs on persistent disk - production perspective); Severity=MEDIUM}.File)\ | 833 | MEDIUM |
| \$(@{File=src\utils\logger.js; Line=844; Content=lines.push(`  LOCAL-R = ${engineReadStatus}  Latency: ${engineReadLatency.padEnd(30)}  Pokemon: ${engineReadEntries}`);; Severity=MEDIUM}.File)\ | 844 | MEDIUM |
| \$(@{File=src\utils\logger.js; Line=856; Content=lines.push(`  LOCAL-W = ${engineWriteStatus}  Latency: ${engineWriteLatency.padEnd(30)}  Battles: ${engineWriteEntries}`);; Severity=MEDIUM}.File)\ | 856 | MEDIUM |
| \$(@{File=src\utils\logger.js; Line=1008; Content=// LOCAL = Engine DBs on persistent disk (Read-DB + Write-DB); Severity=MEDIUM}.File)\ | 1008 | MEDIUM |
| \$(@{File=src\utils\logger.js; Line=1023; Content=// LOCAL-R (Engine Read-DB); Severity=MEDIUM}.File)\ | 1023 | MEDIUM |
| \$(@{File=src\utils\logger.js; Line=1033; Content=lines.push(`  LOCAL-R → ${statsCache.databases.engineRead.status} | Latency: ${engineReadLatency} | Pokemon: ${engineReadEntries}`);; Severity=MEDIUM}.File)\ | 1033 | MEDIUM |
| \$(@{File=src\utils\logger.js; Line=1035; Content=// LOCAL-W (Engine Write-DB); Severity=MEDIUM}.File)\ | 1035 | MEDIUM |
| \$(@{File=src\utils\logger.js; Line=1045; Content=lines.push(`  LOCAL-W → ${statsCache.databases.engineWrite.status} | Latency: ${engineWriteLatency} | Battles: ${engineWriteEntries}`);; Severity=MEDIUM}.File)\ | 1045 | MEDIUM |
| \$(@{File=src\workers\database\protocols.md; Line=509; Content=| Query (Engine Read-DB) | <50ms | SQLite read (local disk) |; Severity=MEDIUM}.File)\ | 509 | MEDIUM |
| \$(@{File=tasklist.md; Line=76; Content=- Canonical naming applied per Patch.md Absolutes: ONPREMISE-DEV-PRIMARY (not PRIMARY LOCAL), ONPREMISE-DEV-EXPERIMENT (not EXPERIMENTAL); Severity=MEDIUM}.File)\ | 76 | MEDIUM |
| \$(@{File=tasklist.md; Line=77; Content=- Deployment status: Schema consolidated in local database, cloud deployment (CLOUD-DEV-MASTER → CLOUD-PROD-RUNTIME) pending manual push; Severity=MEDIUM}.File)\ | 77 | MEDIUM |
| \$(@{File=tasklist.md; Line=84; Content=- Phase 2 validation: EXPERIMENTAL testing complete (migration + rollback, zero data loss, 100% offline isolation); Severity=MEDIUM}.File)\ | 84 | MEDIUM |
| \$(@{File=tasklist.md; Line=87; Content=- ✅ Ready for DB.NORTHSTAR.PHASE2 PRIMARY LOCAL validation before DEV deployment; Severity=MEDIUM}.File)\ | 87 | MEDIUM |
| \$(@{File=tasklist.md; Line=308; Content=- ops/RECOVERY.yaml records last_refresh_utc, remote/local HEAD data, remote URL, and preserves last_attempted task metadata.; Severity=MEDIUM}.File)\ | 308 | MEDIUM |
| \$(@{File=tasklist.md; Line=351; Content=notes: Outcome — Outbox worker now streams processed messages to the configured backup sink (S3 or local), logs provider/location metadata, ships a storage helper with tests, and OPERATIONS.md documents deployment/env guidance.; Severity=MEDIUM}.File)\ | 351 | MEDIUM |
| \$(@{File=tasklist.md; Line=379; Content=- Capture sample output from `node scripts/guard_db_docs.mjs` (local or CI) and quote the success line in Tasklist notes once verified.; Severity=MEDIUM}.File)\ | 379 | MEDIUM |
| \$(@{File=tasklist.md; Line=383; Content=Baseline run: `node scripts/guard_db_docs.mjs` → "✅ DB connection docs mention Key/Dev, Key/Prod, and Prisma regenerate guidance consistently." (local 2025-10-30).; Severity=MEDIUM}.File)\ | 383 | MEDIUM |
| \$(@{File=tasklist.md; Line=397; Content=Local verification: `node scripts/guard_db_docs.mjs` (2025-11-01T04:30Z) returned the same ✅ message after recording the CI run.; Severity=MEDIUM}.File)\ | 397 | MEDIUM |
| \$(@{File=tasklist.md; Line=602; Content=- Build does not rely on global `tsc`; uses local binaries; Severity=MEDIUM}.File)\ | 602 | MEDIUM |
| \$(@{File=tasklist.md; Line=900; Content=- env preloader detects localhost candidates and prefers non-local fallbacks (internal connection string) even when DATABASE_URL is already set.; Severity=MEDIUM}.File)\ | 900 | MEDIUM |
| \$(@{File=tasklist.md; Line=1099; Content=- Introduce a `DATABASE_CONNECTION_MODE` (auto/internal/external) toggle in shared config that defaults to pooled/internal URLs in production while preferring the external Render URL for local development when available.; Severity=MEDIUM}.File)\ | 1099 | MEDIUM |
| \$(@{File=tasklist.md; Line=1296; Content=**IMPORTANT NOTE**: All entries dated 2025-11-05 and 2025-11-06 below describe UNRELATED infrastructure work (database replication architecture, dual database connections, security bot hardening, local Postgres mirror, logger improvements) that was incorrectly logged to this task instead of being tracked as separate Phase 16 work. DEX v2 cutover was fully complete by 2025-11-03T06:28Z. The flag is live and v2 is serving production traffic.; Severity=MEDIUM}.File)\ | 1296 | MEDIUM |
| \$(@{File=tasklist.md; Line=1304; Content=2025-11-05T22:45Z: Store-backed local Postgres mirror implementation; Severity=MEDIUM}.File)\ | 1304 | MEDIUM |
| \$(@{File=tasklist.md; Line=1305; Content=2025-11-06T04:04Z: Local Postgres mirror bootstrap execution; Severity=MEDIUM}.File)\ | 1305 | MEDIUM |
| \$(@{File=tasklist.md; Line=1306; Content=2025-11-06T04:25Z: Auto-bootstrap tooling added (npm run ops:auto-bootstrap-local-db); Severity=MEDIUM}.File)\ | 1306 | MEDIUM |
| \$(@{File=tasklist.md; Line=1661; Content=Dual-Local Database Testing (2025-11-08T19:35:00Z):; Severity=MEDIUM}.File)\ | 1661 | MEDIUM |
| \$(@{File=tasklist.md; Line=1662; Content=- ✅ PRIMARY LOCAL database running on port 55433 (2 User records, 1025 Species, 4 PokemonInstance, 0 Battle); Severity=MEDIUM}.File)\ | 1662 | MEDIUM |
| \$(@{File=tasklist.md; Line=1663; Content=- ✅ EXPERIMENTAL database created on port 55434, synced from PRIMARY LOCAL via npm run ops:sync-experiment-db -- --from local; Severity=MEDIUM}.File)\ | 1663 | MEDIUM |
| \$(@{File=tasklist.md; Line=1665; Content=- ✅ Test migration applied to EXPERIMENTAL: ALTER TABLE "User" ADD COLUMN test_column TEXT DEFAULT NULL;; Severity=MEDIUM}.File)\ | 1665 | MEDIUM |
| \$(@{File=tasklist.md; Line=1666; Content=- ✅ Verified PRIMARY LOCAL isolation: test_column NOT present in PRIMARY LOCAL (confirming 100% offline isolation); Severity=MEDIUM}.File)\ | 1666 | MEDIUM |
| \$(@{File=tasklist.md; Line=1667; Content=- ✅ Test rollback applied to EXPERIMENTAL: ALTER TABLE "User" DROP COLUMN test_column;; Severity=MEDIUM}.File)\ | 1667 | MEDIUM |
| \$(@{File=tasklist.md; Line=1668; Content=- ✅ Verified rollback success: test_column removed from EXPERIMENTAL; Severity=MEDIUM}.File)\ | 1668 | MEDIUM |
| \$(@{File=tasklist.md; Line=1669; Content=- ✅ Dual-local architecture fully functional and ready for Phase 2 migration testing; Severity=MEDIUM}.File)\ | 1669 | MEDIUM |
| \$(@{File=tasklist.md; Line=1672; Content=- Start PRIMARY LOCAL: pg_ctl start -D Store\db\local-cluster -l Store\db\local-postgres.log -w -o "-p 55433 -h 127.0.0.1"; Severity=MEDIUM}.File)\ | 1672 | MEDIUM |
| \$(@{File=tasklist.md; Line=1673; Content=- Verify PRIMARY LOCAL data: psql "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db" -c 'SELECT COUNT(*) FROM "User";'; Severity=MEDIUM}.File)\ | 1673 | MEDIUM |
| \$(@{File=tasklist.md; Line=1674; Content=- Create EXPERIMENTAL database: psql "postgresql://postgres@127.0.0.1:55434/postgres" -c "CREATE DATABASE infinity_gauntlet_experiment;"; Severity=MEDIUM}.File)\ | 1674 | MEDIUM |
| \$(@{File=tasklist.md; Line=1675; Content=- Sync EXPERIMENTAL from PRIMARY LOCAL: npm run ops:sync-experiment-db -- --from local; Severity=MEDIUM}.File)\ | 1675 | MEDIUM |
| \$(@{File=tasklist.md; Line=1681; Content=1. Sync EXPERIMENTAL from PRIMARY LOCAL (npm run ops:sync-experiment-db -- --from local); Severity=MEDIUM}.File)\ | 1681 | MEDIUM |
| \$(@{File=tasklist.md; Line=1682; Content=2. Apply Phase 2 migration.sql to EXPERIMENTAL; Severity=MEDIUM}.File)\ | 1682 | MEDIUM |
| \$(@{File=tasklist.md; Line=1684; Content=4. Test ProfileService queries against EXPERIMENTAL; Severity=MEDIUM}.File)\ | 1684 | MEDIUM |
| \$(@{File=tasklist.md; Line=1685; Content=5. Test rollback.sql on EXPERIMENTAL; Severity=MEDIUM}.File)\ | 1685 | MEDIUM |
| \$(@{File=tasklist.md; Line=1686; Content=6. If successful, apply to PRIMARY LOCAL for final validation before pushing to DEV master; Severity=MEDIUM}.File)\ | 1686 | MEDIUM |
| \$(@{File=tasklist.md; Line=1694; Content=✅ EXPERIMENTAL Database Testing (100% OFFLINE):; Severity=MEDIUM}.File)\ | 1694 | MEDIUM |
| \$(@{File=tasklist.md; Line=1698; Content=- Sync from PRIMARY LOCAL: npm run ops:sync-experiment-db -- --from local (2 User, 2 TrainerProfile, 1025 Species, 4 PokemonInstance, 0 Battle); Severity=MEDIUM}.File)\ | 1698 | MEDIUM |
| \$(@{File=tasklist.md; Line=1706; Content=- PRIMARY LOCAL isolation verified: TrainerProfile still exists (100% offline isolation confirmed); Severity=MEDIUM}.File)\ | 1706 | MEDIUM |
| \$(@{File=tasklist.md; Line=1717; Content=- Sync EXPERIMENTAL: npm run ops:sync-experiment-db -- --from local; Severity=MEDIUM}.File)\ | 1717 | MEDIUM |
| \$(@{File=tasklist.md; Line=1723; Content=- Verify PRIMARY LOCAL isolation: psql "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db" -c 'SELECT table_name FROM information_schema.tables WHERE table_name = ''TrainerProfile'';'; Severity=MEDIUM}.File)\ | 1723 | MEDIUM |
| \$(@{File=tasklist.md; Line=1732; Content=✅ Isolation confirmed (EXPERIMENTAL changes NOT visible in PRIMARY LOCAL); Severity=MEDIUM}.File)\ | 1732 | MEDIUM |
| \$(@{File=tasklist.md; Line=1734; Content=✅ Ready for PRIMARY LOCAL testing before DEV deployment; Severity=MEDIUM}.File)\ | 1734 | MEDIUM |
| \$(@{File=tasklist.md; Line=1737; Content=1. Apply Phase 2 migration to PRIMARY LOCAL (offline validation before cloud deployment); Severity=MEDIUM}.File)\ | 1737 | MEDIUM |
| \$(@{File=tasklist.md; Line=1738; Content=2. Test ProfileService queries against PRIMARY LOCAL User columns; Severity=MEDIUM}.File)\ | 1738 | MEDIUM |
| \$(@{File=tasklist.md; Line=1762; Content=- Used ONPREMISE-DEV-PRIMARY (not "PRIMARY LOCAL"); Severity=MEDIUM}.File)\ | 1762 | MEDIUM |
| \$(@{File=tasklist.md; Line=1763; Content=- Used ONPREMISE-DEV-EXPERIMENT (not "EXPERIMENTAL"); Severity=MEDIUM}.File)\ | 1763 | MEDIUM |
| \$(@{File=tasklist.md; Line=1797; Content=- Create comprehensive design document covering DEV → Prisma → Local cascade with version tracking, integrity checks, automated sync, silent error elimination.; Severity=MEDIUM}.File)\ | 1797 | MEDIUM |
| \$(@{File=tasklist.md; Line=1803; Content=- Master-replica cascade: DEV (master) → Prisma (prod) → Local (workstation); Severity=MEDIUM}.File)\ | 1803 | MEDIUM |
| \$(@{File=tasklist.md; Line=1865; Content=- tests/db-replication/sync.test.ts (353 lines) — Comprehensive test suite with 10 tests covering: syncDevToProd success path (MATCH version skips sync immediately returning success), Version Check failures (BEHIND triggers handleReversion and throws error blocking sync, DIVERGED throws manual resolution error with fingerprint slices), dry run mode (skips migration apply but tracks metrics), integrity verification (skipIntegrity option skips verifySchemaIntegrity calls), error handling (any error calls handleSyncFailure with correct parameters); syncProdToLocal tests (version MATCH skips sync, dry run mode skips pg_dump/restore, connection failures handled gracefully); Integration cascade test (DEV→Prod→Local sequence with migration gap tracking).; Severity=MEDIUM}.File)\ | 1865 | MEDIUM |
| \$(@{File=tasklist.md; Line=1892; Content=- Implement getReplicationMetrics() returning lag, sync status, version fingerprints, integrity status for DEV↔Prod and Prod↔Local. ✅; Severity=MEDIUM}.File)\ | 1892 | MEDIUM |
| \$(@{File=tasklist.md; Line=1901; Content=- src/services/db-replication/monitoring.ts (468 lines) — Core monitoring module with getReplicationMetrics() querying versions from DEV/Prod/Local via getVersion(), calling getSyncState() for sync history (commented until db_sync_state schema migration with warnings logged), calculating lag as migration count differences (devToProdLag = dev - prod, prodToLocalLag = prod - local), determining syncStatus via calculateSyncStatus() helper (IN_SYNC for matching fingerprints, LAGGING for lag 1-5, ERROR for lag >5 or explicit ERROR/FAILED states, BLOCKED for reversion/waiting states); checkAlertThresholds() evaluating metrics against thresholds via checkCascadeAlerts() helper generating Alert[] array (CRITICAL for divergence with lag=0 and different fingerprints escalate true, ERROR for critical lag >10 escalate true, ERROR for sync failure with lastError, WARNING for moderate lag 5-10 escalate false, WARNING for BLOCKED status, WARNING for slow sync >10min/600000ms, ERROR for integrity FAIL); sendAlert() logging with emoji icons (ℹ️ INFO, ⚠️ WARNING, ❌ ERROR, 🚨 CRITICAL) and [ESCALATED] label, TODO comments for Discord DM and PagerDuty integration; formatMetrics() creating formatted string with emoji section headers and formatSyncStatus/formatIntegrityStatus/formatDate helpers.; Severity=MEDIUM}.File)\ | 1901 | MEDIUM |
| \$(@{File=tasklist.md; Line=1903; Content=- tests/db-replication/monitoring.test.ts (353 lines) — Comprehensive test suite with 13 tests covering getReplicationMetrics (4 tests: all envs in sync with same mockVersion expecting IN_SYNC status and 0 lag, lag calculation with devVersion 15 vs prodVersion 12 expecting lag 3 and LAGGING status, UNKNOWN when Local unavailable with localPrisma null expecting prodToLocal.syncStatus UNKNOWN and versionFingerprints.local 'N/A', ERROR status for lag >5 with 8-migration gap), checkAlertThresholds (8 tests: WARNING for moderate lag 7, ERROR for critical lag 15, CRITICAL for diverged fingerprints with lag 0, ERROR for sync failure with lastError, WARNING for BLOCKED status, WARNING for slow sync 12min/720000ms, ERROR for integrity FAIL, no alerts for healthy metrics with empty array), formatMetrics (1 test: verify formatted output contains expected headers and data).; Severity=MEDIUM}.File)\ | 1903 | MEDIUM |
| \$(@{File=tasklist.md; Line=1906; Content=- getReplicationMetrics: 4 tests (4ms) — All in sync, lag calculation, Local unavailable, ERROR for lag >5; Severity=MEDIUM}.File)\ | 1906 | MEDIUM |
| \$(@{File=tasklist.md; Line=1924; Content=- ReplicationMetrics interface: devToProd CascadeMetrics, prodToLocal CascadeMetrics, versionFingerprints {dev/prod/local}, integrityStatus {devProdSchema/prodLocalSchema/lastCheckedAt}, capturedAt; Severity=MEDIUM}.File)\ | 1924 | MEDIUM |
| \$(@{File=tasklist.md; Line=1937; Content=- Build scripts/db_replication.ts CLI with commands: sync (dev-to-prod, prod-to-local, full-cascade), status, metrics, diff, integrity, version. ✅; Severity=MEDIUM}.File)\ | 1937 | MEDIUM |
| \$(@{File=tasklist.md; Line=1938; Content=- Add emergency controls: block-prod, unblock-prod, reset-local. ✅; Severity=MEDIUM}.File)\ | 1938 | MEDIUM |
| \$(@{File=tasklist.md; Line=1939; Content=- Create automated sync scheduler (cron/worker) for dev-to-prod (6hr) and prod-to-local (daily). (Deferred to worker implementation); Severity=MEDIUM}.File)\ | 1939 | MEDIUM |
| \$(@{File=tasklist.md; Line=1946; Content=- scripts/db_replication.ts (750 lines) — Full CLI implementation with 11 commands (sync with targets dev-to-prod/prod-to-local/full-cascade and options --dry-run/--skip-integrity, status showing versions/lag/last sync for all cascades, metrics displaying full ReplicationMetrics via formatMetrics with alerts via checkAlertThresholds, diff comparing schema between environments via verifySchemaIntegrity, integrity running checks for dev-prod/prod-local/all scopes, version showing fingerprint for dev/prod/local, compare comparing versions across all environments, block-prod/unblock-prod/reset-local emergency controls as stubs until db_sync_state schema migration and pg_dump integration, help showing usage), parseArgs() command parser extracting command/args/options from argv, getClients() creating devPrisma/prodPrisma/localPrisma from environment URLs, runSync() executing syncDevToProd/syncProdToLocal with result logging, runStatus() displaying quick overview with fingerprints/migrations/lag, runMetrics() calling getReplicationMetrics and displaying formatted output plus alerts, runDiff() comparing schemas between two environments, runIntegrity() running schema+data checks for specified scope, runVersion() showing detailed version info for single environment, runCompare() comparing all three environments with status/lag/synced indicators, emergency control stubs with TODO comments for implementation.; Severity=MEDIUM}.File)\ | 1946 | MEDIUM |
| \$(@{File=tasklist.md; Line=1948; Content=- docs/db-replication-runbook.md (450 lines) — Comprehensive operational runbook with 8 sections: Overview (architecture diagram, key principles), Daily Operations (routine health check 5min, action thresholds for lag/integrity/reversion), Manual Sync Procedures (DEV→Prod, Prod→Local, full cascade with dry-run/verify/execute/check steps), Emergency Rollback (15-30min procedure with 8 steps: identify target version, block syncs, rollback DEV migrations, verify schema, restore from Prod if needed, unblock syncs, verify recovery, alert team), Version Conflict Resolution (30-60min procedure with 4 steps: capture state via compare/diff, decide strategy Option A/B/C, execute resolution, verify convergence), Monitoring & Alerts (alert levels INFO/WARNING/ERROR/CRITICAL with response times and actions, automated sync schedule every 6hr dev-to-prod and daily 2AM prod-to-local, metrics dashboard access), Troubleshooting (5 common problems: version BEHIND error, schema integrity fails, sync timeout, local not updating with causes and solutions), CLI Reference (all commands with examples, options --dry-run/--skip-integrity/--confirm, environment variables).; Severity=MEDIUM}.File)\ | 1948 | MEDIUM |
| \$(@{File=tasklist.md; Line=1950; Content=- ops/DB_BOOTSTRAP.md updated — Added "Database Replication Architecture" section (150 lines) documenting: overview with cascade diagram, version tracking (db_version/db_sync_state tables, SHA-256 fingerprint calculation, comparison states MATCH/AHEAD/BEHIND/DIVERGED), sync orchestration (5-stage DEV→Prod process, Prod→Local skeleton, automated schedule every 6hr and daily 2AM), CLI operations (11 commands with examples), alert thresholds (WARNING/ERROR/CRITICAL with conditions and response times), emergency procedures (rollback DEV 5 steps, version conflict 5 steps), documentation references (architecture/runbook/implementation files), integration with bootstrap workflow (5-step procedure: use direct URLs, verify version, check divergence, sync if ahead, verify integrity).; Severity=MEDIUM}.File)\ | 1950 | MEDIUM |
| \$(@{File=tasklist.md; Line=1954; Content=- tests/db-replication/cli.test.ts (230 lines) — Basic CLI test suite with 31 tests covering: command parsing (7 tests: sync with target, sync with --dry-run, diff with two envs, version with env, integrity with scope, help command, default to help), validation (7 tests: require target for sync, validate sync targets, require two envs for diff, validate env names, require env for version, require scope for integrity, validate integrity scopes), options (5 tests: parse --dry-run/--skip-integrity/--confirm, parse options with values, handle multiple options), help output (4 tests: include all 11 commands, sync targets, environment names, integrity scopes), emergency controls (4 tests: recognize block-prod/unblock-prod/reset-local, warn about stub implementations), environment loading (4 tests: check IG_ENV_FILE/DATABASE_DIRECT_URL/DATABASE_POOL_URL/DATABASE_LOCAL_URL).; Severity=MEDIUM}.File)\ | 1954 | MEDIUM |
| \$(@{File=tasklist.md; Line=1967; Content=- reset-local command — Stub implementation until pg_dump/restore integration complete; Severity=MEDIUM}.File)\ | 1967 | MEDIUM |
| \$(@{File=tasklist.md; Line=1974; Content=- pg_dump/restore integration for Prod→Local and reset-local commands; Severity=MEDIUM}.File)\ | 1974 | MEDIUM |
| \$(@{File=tasklist.md; Line=1982; Content=- Add connection health checks with version awareness (check local version before using localPrisma).; Severity=MEDIUM}.File)\ | 1982 | MEDIUM |
| \$(@{File=tasklist.md; Line=1983; Content=- Implement failover logic respecting version constraints (only failover to Local if version >= required).; Severity=MEDIUM}.File)\ | 1983 | MEDIUM |
| \$(@{File=tasklist.md; Line=1985; Content=- Update src/shared/config.ts fallback logic to validate Local version before using Store/db/local-url.txt.; Severity=MEDIUM}.File)\ | 1985 | MEDIUM |
| \$(@{File=tasklist.md; Line=1996; Content=- Extended `TripleDatabaseStats` type (formerly DualDatabaseStats) with `local: DatabaseStats` field, keeping DualDatabaseStats as alias for backward compatibility; Severity=MEDIUM}.File)\ | 1996 | MEDIUM |
| \$(@{File=tasklist.md; Line=1998; Content=- Updated `getDatabaseStats()` to return stats for all three databases (dev/prod/local) with status/latency/source/transport fields; Severity=MEDIUM}.File)\ | 1998 | MEDIUM |
| \$(@{File=tasklist.md; Line=1999; Content=- Created `checkLocalHealth()` async function returning `{ connected: boolean, version: string | null, error?: Error }`, testing connection with `SELECT 1` probe, querying `db_version` table for LOCAL fingerprint if table exists, catching errors gracefully; Severity=MEDIUM}.File)\ | 1999 | MEDIUM |
| \$(@{File=tasklist.md; Line=2000; Content=- Created `validateLocalVersion(requiredVersion: string | null)` async function returning boolean, allowing failover if no version requirement (null), checking LOCAL connection and version availability via checkLocalHealth(), comparing LOCAL version to required (simple equality check for now, will use compareVersions from db-replication/version.ts in production); Severity=MEDIUM}.File)\ | 2000 | MEDIUM |
| \$(@{File=tasklist.md; Line=2001; Content=- Updated heartbeat tracking to maintain separate events for dev/prod/local with independent failure counters; Severity=MEDIUM}.File)\ | 2001 | MEDIUM |
| \$(@{File=tasklist.md; Line=2003; Content=- src/utils/logger.js (extended) — Updated telemetry to include LOCAL database stats:; Severity=MEDIUM}.File)\ | 2003 | MEDIUM |
| \$(@{File=tasklist.md; Line=2004; Content=- Extended `collectDatabaseStats()` to return `{ dev, prod, local }` structure with status/latency/connections/source/transport for all three; Severity=MEDIUM}.File)\ | 2004 | MEDIUM |
| \$(@{File=tasklist.md; Line=2005; Content=- Updated loading state to return local placeholder when getDatabaseStats unavailable; Severity=MEDIUM}.File)\ | 2005 | MEDIUM |
| \$(@{File=tasklist.md; Line=2006; Content=- Updated error handling to return local error state; Severity=MEDIUM}.File)\ | 2006 | MEDIUM |
| \$(@{File=tasklist.md; Line=2007; Content=- Updated `printStats()` to display LOCAL stats line: `LOCAL → Status/Latency/Source/Connections`; Severity=MEDIUM}.File)\ | 2007 | MEDIUM |
| \$(@{File=tasklist.md; Line=2008; Content=- Updated `getFormattedStats()` to include LOCAL stats in formatted output; Severity=MEDIUM}.File)\ | 2008 | MEDIUM |
| \$(@{File=tasklist.md; Line=2009; Content=- Stats refresh every 15 seconds (existing REFRESH_INTERVAL_MS) now includes local metrics; Severity=MEDIUM}.File)\ | 2009 | MEDIUM |
| \$(@{File=tasklist.md; Line=2015; Content=- Failover Scenarios (4 tests): DEV→PROD failover, PROD→LOCAL with version check, reject LOCAL when version too low, reject LOCAL when not connected; Severity=MEDIUM}.File)\ | 2015 | MEDIUM |
| \$(@{File=tasklist.md; Line=2017; Content=- Logger Integration (3 tests): LOCAL stats in printStats/getFormattedStats, auto-refresh every 15s; Severity=MEDIUM}.File)\ | 2017 | MEDIUM |
| \$(@{File=tasklist.md; Line=2018; Content=- Version-Aware Failover Logic (4 tests): version check before failover, use LOCAL only if version >= PROD, reject if behind, log mismatch; Severity=MEDIUM}.File)\ | 2018 | MEDIUM |
| \$(@{File=tasklist.md; Line=2036; Content=✅ Implement failover logic — validateLocalVersion() enforces version constraint (only use LOCAL if version >= required); Severity=MEDIUM}.File)\ | 2036 | MEDIUM |
| \$(@{File=tasklist.md; Line=2037; Content=✅ Update logger telemetry — collectDatabaseStats/printStats/getFormattedStats now include LOCAL stats; Severity=MEDIUM}.File)\ | 2037 | MEDIUM |
| \$(@{File=tasklist.md; Line=2044; Content=- getDatabaseStats() returns TripleDatabaseStats (dev/prod/local) with DualDatabaseStats as type alias for backward compatibility with existing consumers; Severity=MEDIUM}.File)\ | 2044 | MEDIUM |
| \$(@{File=tasklist.md; Line=2069; Content=- Complete Sync Workflow (4 tests): full DEV→Prod→Local cascade success, partial sync failure with automatic rollback, reversion detection blocking, idempotent sync operations; Severity=MEDIUM}.File)\ | 2069 | MEDIUM |
| \$(@{File=tasklist.md; Line=2074; Content=- Multi-Connection Protocol (5 tests): three independent Prisma clients maintenance, version constraint enforcement during failover, LOCAL database usage when higher priority unavailable, DATABASE_URL restoration after LOCAL client creation, independent heartbeat tracking for all clients; Severity=MEDIUM}.File)\ | 2074 | MEDIUM |
| \$(@{File=test-api.js; Line=9; Content=* Local network access: http://YOUR_IP:3001/api; Severity=MEDIUM}.File)\ | 9 | MEDIUM |
| \$(@{File=test-api.js; Line=331; Content=console.log(`🌐 Local Network: http://YOUR_IP:${PORT}/api`);; Severity=MEDIUM}.File)\ | 331 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=81; Content=const validTargets = ["dev-to-prod", "prod-to-local", "full-cascade"];; Severity=MEDIUM}.File)\ | 81 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=98; Content=const validEnvs = ["dev", "prod", "local"];; Severity=MEDIUM}.File)\ | 98 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=121; Content=const validScopes = ["dev-prod", "prod-local", "all"];; Severity=MEDIUM}.File)\ | 121 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=122; Content=const invalidScope = "dev-local";; Severity=MEDIUM}.File)\ | 122 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=180; Content="reset-local",; Severity=MEDIUM}.File)\ | 180 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=192; Content=const syncTargets = ["dev-to-prod", "prod-to-local", "full-cascade"];; Severity=MEDIUM}.File)\ | 192 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=200; Content=const environments = ["dev", "prod", "local"];; Severity=MEDIUM}.File)\ | 200 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=205; Content=expect(environments).toContain("local");; Severity=MEDIUM}.File)\ | 205 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=209; Content=const scopes = ["dev-prod", "prod-local", "all"];; Severity=MEDIUM}.File)\ | 209 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=219; Content=const isEmergencyControl = ["block-prod", "unblock-prod", "reset-local"].includes(command);; Severity=MEDIUM}.File)\ | 219 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=226; Content=const isEmergencyControl = ["block-prod", "unblock-prod", "reset-local"].includes(command);; Severity=MEDIUM}.File)\ | 226 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=231; Content=it("should recognize reset-local command", () => {; Severity=MEDIUM}.File)\ | 231 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=232; Content=const command = "reset-local";; Severity=MEDIUM}.File)\ | 232 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=233; Content=const isEmergencyControl = ["block-prod", "unblock-prod", "reset-local"].includes(command);; Severity=MEDIUM}.File)\ | 233 | MEDIUM |
| \$(@{File=tests\db-replication\cli.test.ts; Line=240; Content=const stubCommands = ["block-prod", "unblock-prod", "reset-local"];; Severity=MEDIUM}.File)\ | 240 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=20; Content=it("should execute full DEV→Prod→Local cascade successfully", async () => {; Severity=MEDIUM}.File)\ | 20 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=21; Content=// Test complete sync cascade from DEV through Prod to Local; Severity=MEDIUM}.File)\ | 21 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=26; Content=// 5. Compare Prod vs Local (should be AHEAD or MATCH); Severity=MEDIUM}.File)\ | 26 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=27; Content=// 6. Execute Prod→Local sync (pg_dump/restore); Severity=MEDIUM}.File)\ | 27 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=28; Content=// 7. Verify Local version matches Prod; Severity=MEDIUM}.File)\ | 28 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=48; Content=// 4. Verify downstream sync (Prod→Local) is blocked; Severity=MEDIUM}.File)\ | 48 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=324; Content=// 2. Attempt failover to LOCAL; Severity=MEDIUM}.File)\ | 324 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=331; Content=it("should use LOCAL database when higher priority unavailable", async () => {; Severity=MEDIUM}.File)\ | 331 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=336; Content=// 4. Verify app attempts LOCAL with version check; Severity=MEDIUM}.File)\ | 336 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=337; Content=// 5. Verify app uses LOCAL if version valid; Severity=MEDIUM}.File)\ | 337 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=355; Content=// 4. Verify PROD and LOCAL status remain healthy; Severity=MEDIUM}.File)\ | 355 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=411; Content=// 2. Verify returns { dev, prod, local } stats; Severity=MEDIUM}.File)\ | 411 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=433; Content=// 3. Verify Prod→Local sync executes; Severity=MEDIUM}.File)\ | 433 | MEDIUM |
| \$(@{File=tests\db-replication\end-to-end.test.ts; Line=454; Content=// 4. Verify output shows Local version; Severity=MEDIUM}.File)\ | 454 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=10; Content=* - Failover scenarios (dev unavailable → prod, prod unavailable → local with version check); Severity=MEDIUM}.File)\ | 10 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=11; Content=* - Telemetry updates (getDatabaseStats with local stats); Severity=MEDIUM}.File)\ | 11 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=27; Content=it("should connect to LOCAL database and start heartbeat monitoring", () => {; Severity=MEDIUM}.File)\ | 27 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=32; Content=it("should handle LOCAL connection failures gracefully", () => {; Severity=MEDIUM}.File)\ | 32 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=71; Content=it("should return false when LOCAL is not connected", async () => {; Severity=MEDIUM}.File)\ | 71 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=76; Content=it("should return false when LOCAL version is unknown", async () => {; Severity=MEDIUM}.File)\ | 76 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=81; Content=it("should return true when LOCAL version matches required version", async () => {; Severity=MEDIUM}.File)\ | 81 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=86; Content=it("should return false when LOCAL version differs from required version", async () => {; Severity=MEDIUM}.File)\ | 86 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=98; Content=it("should failover from PROD to LOCAL when PROD unavailable and version >= required", async () => {; Severity=MEDIUM}.File)\ | 98 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=103; Content=it("should NOT failover to LOCAL when version < required", async () => {; Severity=MEDIUM}.File)\ | 103 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=108; Content=it("should NOT failover to LOCAL when LOCAL is not connected", async () => {; Severity=MEDIUM}.File)\ | 108 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=115; Content=it("should return stats for all three databases (dev/prod/local)", () => {; Severity=MEDIUM}.File)\ | 115 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=116; Content=// Test telemetry includes local stats; Severity=MEDIUM}.File)\ | 116 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=120; Content=it("should report local status as offline when onPremiseDevPrisma is null", () => {; Severity=MEDIUM}.File)\ | 120 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=121; Content=// Test local stats when client not initialized; Severity=MEDIUM}.File)\ | 121 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=125; Content=it("should report local status as initializing before first heartbeat", () => {; Severity=MEDIUM}.File)\ | 125 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=126; Content=// Test local stats during initialization; Severity=MEDIUM}.File)\ | 126 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=130; Content=it("should report local status as healthy after successful heartbeat", () => {; Severity=MEDIUM}.File)\ | 130 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=131; Content=// Test local stats after successful connection; Severity=MEDIUM}.File)\ | 131 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=135; Content=it("should report local status as error after heartbeat failures", () => {; Severity=MEDIUM}.File)\ | 135 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=136; Content=// Test local stats after connection errors; Severity=MEDIUM}.File)\ | 136 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=140; Content=it("should include local latency in stats when available", () => {; Severity=MEDIUM}.File)\ | 140 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=145; Content=it("should include local transport type in stats", () => {; Severity=MEDIUM}.File)\ | 145 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=152; Content=it("should include LOCAL stats in printStats output", () => {; Severity=MEDIUM}.File)\ | 152 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=153; Content=// Test logger displays local database stats; Severity=MEDIUM}.File)\ | 153 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=157; Content=it("should include LOCAL stats in getFormattedStats output", () => {; Severity=MEDIUM}.File)\ | 157 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=158; Content=// Test formatted stats include local database; Severity=MEDIUM}.File)\ | 158 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=162; Content=it("should auto-refresh LOCAL stats every 15 seconds", () => {; Severity=MEDIUM}.File)\ | 162 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=169; Content=it("should check LOCAL version before failover", async () => {; Severity=MEDIUM}.File)\ | 169 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=174; Content=it("should use LOCAL only if version >= last known PROD version", async () => {; Severity=MEDIUM}.File)\ | 174 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=179; Content=it("should reject LOCAL failover if version is behind", async () => {; Severity=MEDIUM}.File)\ | 179 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=184; Content=it("should log version mismatch when rejecting LOCAL failover", async () => {; Severity=MEDIUM}.File)\ | 184 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=191; Content=it("should track LOCAL heartbeat separately from DEV and PROD", () => {; Severity=MEDIUM}.File)\ | 191 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=218; Content=it("should not interfere with DEV or PROD connections when initializing LOCAL", () => {; Severity=MEDIUM}.File)\ | 218 | MEDIUM |
| \$(@{File=tests\db-replication\integration.test.ts; Line=228; Content=it("should handle LOCAL initialization errors without breaking DEV/PROD", () => {; Severity=MEDIUM}.File)\ | 228 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=34; Content=localPool = createMockPoolClient('LOCAL');; Severity=MEDIUM}.File)\ | 34 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=50; Content=.mockResolvedValueOnce(mockVersion); // LOCAL; Severity=MEDIUM}.File)\ | 50 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=84; Content=source: 'LOCAL',; Severity=MEDIUM}.File)\ | 84 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=96; Content=expect(metrics.prodToLocal.versionLag).toBe(0); // Prod and Local match; Severity=MEDIUM}.File)\ | 96 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=99; Content=it('should calculate UNKNOWN status when Local is unavailable', async () => {; Severity=MEDIUM}.File)\ | 99 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=123; Content=expect(metrics.versionFingerprints.local).toBe('N/A');; Severity=MEDIUM}.File)\ | 123 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=175; Content=local: 'old456',; Severity=MEDIUM}.File)\ | 175 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=212; Content=local: 'very_old',; Severity=MEDIUM}.File)\ | 212 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=249; Content=local: 'xyz789_different',; Severity=MEDIUM}.File)\ | 249 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=286; Content=local: 'old456',; Severity=MEDIUM}.File)\ | 286 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=323; Content=local: 'old456',; Severity=MEDIUM}.File)\ | 323 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=359; Content=local: 'old456',; Severity=MEDIUM}.File)\ | 359 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=396; Content=local: 'abc123',; Severity=MEDIUM}.File)\ | 396 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=433; Content=local: 'abc123',; Severity=MEDIUM}.File)\ | 433 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=469; Content=local: 'old789ghi012',; Severity=MEDIUM}.File)\ | 469 | MEDIUM |
| \$(@{File=tests\db-replication\monitoring.test.ts; Line=485; Content=expect(formatted).toContain('Prod → Local');; Severity=MEDIUM}.File)\ | 485 | MEDIUM |
| \$(@{File=tests\db-replication\README.md; Line=34; Content=Tests sync orchestration for DEV→Prod and Prod→Local workflows.; Severity=MEDIUM}.File)\ | 34 | MEDIUM |
| \$(@{File=tests\db-replication\README.md; Line=51; Content=- ✅ Multi-cascade metrics (DEV→Prod, Prod→Local); Severity=MEDIUM}.File)\ | 51 | MEDIUM |
| \$(@{File=tests\db-replication\README.md; Line=61; Content=- ✅ Emergency controls (block-prod/unblock-prod/reset-local); Severity=MEDIUM}.File)\ | 61 | MEDIUM |
| \$(@{File=tests\db-replication\README.md; Line=71; Content=- ✅ Failover scenarios (DEV→PROD→LOCAL with version checks); Severity=MEDIUM}.File)\ | 71 | MEDIUM |
| \$(@{File=tests\db-replication\README.md; Line=72; Content=- ✅ Telemetry (getDatabaseStats with local stats); Severity=MEDIUM}.File)\ | 72 | MEDIUM |
| \$(@{File=tests\db-replication\README.md; Line=73; Content=- ✅ Logger integration (printStats/getFormattedStats with LOCAL); Severity=MEDIUM}.File)\ | 73 | MEDIUM |
| \$(@{File=tests\db-replication\README.md; Line=160; Content=✅ **Multi-Connection Protocol** — Triple client architecture (dev/prod/local) validated; Severity=MEDIUM}.File)\ | 160 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=4; Content=* Tests for DEV→Prod and Prod→Local sync orchestrators.; Severity=MEDIUM}.File)\ | 4 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=253; Content=localPool = createMockPoolClient('LOCAL');; Severity=MEDIUM}.File)\ | 253 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=258; Content=it('should skip sync if Prod and Local already match', async () => {; Severity=MEDIUM}.File)\ | 258 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=269; Content=.mockResolvedValueOnce(mockVersion); // LOCAL; Severity=MEDIUM}.File)\ | 269 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=291; Content=source: 'LOCAL',; Severity=MEDIUM}.File)\ | 291 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=318; Content=describe('Integration: Full DEV→Prod→Local Cascade', () => {; Severity=MEDIUM}.File)\ | 318 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=319; Content=it('should sync DEV→Prod then Prod→Local in sequence', async () => {; Severity=MEDIUM}.File)\ | 319 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=322; Content=const localPool = createMockPoolClient('LOCAL');; Severity=MEDIUM}.File)\ | 322 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=342; Content=// Local version (behind Prod); Severity=MEDIUM}.File)\ | 342 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=348; Content=source: 'LOCAL',; Severity=MEDIUM}.File)\ | 348 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=369; Content=// Mock Prod→Local sync; Severity=MEDIUM}.File)\ | 369 | MEDIUM |
| \$(@{File=tests\db-replication\sync.test.ts; Line=372; Content=.mockResolvedValueOnce(localVersion); // LOCAL; Severity=MEDIUM}.File)\ | 372 | MEDIUM |
| \$(@{File=tests\integration\SETUP-GUIDE.md; Line=4; Content=Set up local Prometheus + Grafana stack for integration testing of Discord Security Bot metrics.; Severity=MEDIUM}.File)\ | 4 | MEDIUM |
| \$(@{File=tests\security\archive-integrity.spec.js; Line=35; Content=process.env.RENDER = '';  // Use local storage; Severity=MEDIUM}.File)\ | 35 | MEDIUM |
| \$(@{File=tests\shared\backup-sink.spec.ts; Line=47; Content=it("writes payloads to local filesystem when provider=local", async () => {; Severity=MEDIUM}.File)\ | 47 | MEDIUM |
| \$(@{File=tests\shared\backup-sink.spec.ts; Line=49; Content=process.env.BACKUP_STORAGE_PROVIDER = "local";; Severity=MEDIUM}.File)\ | 49 | MEDIUM |
| \$(@{File=tests\shared\backup-sink.spec.ts; Line=61; Content=expect(result.provider).toBe("local");; Severity=MEDIUM}.File)\ | 61 | MEDIUM |
| \$(@{File=tests\workers\TEST-RESULTS.md; Line=222; Content=DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://...  # Local workstation; Severity=MEDIUM}.File)\ | 222 | MEDIUM |

---

## OldDatabaseOpsGuide

**Pattern:** \$(System.Collections.Hashtable.Pattern)\  
**Description:** Old database operations guide (replaced by 25-page comprehensive guide)  
**Severity:** HIGH  
**Replacement:** \$(System.Collections.Hashtable.Replacement)\  
**Occurrences:** 28
### Detected Instances

| File | Line | Severity |
|------|------|----------|
| \$(@{File=docs\architecture-bible\04-event-bus.md; Line=778; Content=- **[operations-bible/02-database-operations.md](../operations-bible/02-database-operations.md)** § 2.11 — TimescaleDB analytics tables; Severity=HIGH}.File)\ | 778 | HIGH |
| \$(@{File=docs\architecture-bible\05-logging-architecture.md; Line=1116; Content=- **operations-bible/02-database-operations.md** — Database URL selection logic, connection telemetry, heartbeat monitoring; Severity=HIGH}.File)\ | 1116 | HIGH |
| \$(@{File=docs\architecture-bible\14-private-channel-architecture.md; Line=9; Content=- See `operations-bible/02-database-operations.md` for database persistence patterns; Severity=HIGH}.File)\ | 9 | HIGH |
| \$(@{File=docs\architecture-bible\14-private-channel-architecture.md; Line=720; Content=- `operations-bible/02-database-operations.md` — Database patterns; Severity=HIGH}.File)\ | 720 | HIGH |
| \$(@{File=docs\architecture-bible\15-project-history.md; Line=245; Content=- → `operations-bible/02-database-operations.md` — Current 2-node cluster architecture; Severity=HIGH}.File)\ | 245 | HIGH |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=642; Content=- **[operations-bible/02-database-operations.md](../operations-bible/02-database-operations.md)** — Database bootstrap procedures; Severity=HIGH}.File)\ | 642 | HIGH |
| \$(@{File=docs\archive\POSTGRESQL-18-QUICK-REF.md; Line=117; Content=# - docs/operations-bible/02-database-operations.md (PostgreSQL 17 → 18); Severity=HIGH}.File)\ | 117 | HIGH |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=164; Content=- `docs/operations-bible/02-database-operations.md` → Update version references; Severity=HIGH}.File)\ | 164 | HIGH |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=185; Content=# docs/operations-bible/02-database-operations.md; Severity=HIGH}.File)\ | 185 | HIGH |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=376; Content=1. **docs/operations-bible/02-database-operations.md**; Severity=HIGH}.File)\ | 376 | HIGH |
| \$(@{File=docs\archive\POSTGRESQL-18-UPGRADE-PLAN.md; Line=552; Content=- `docs/operations-bible/02-database-operations.md`; Severity=HIGH}.File)\ | 552 | HIGH |
| \$(@{File=docs\DATA-CONSOLIDATION-PLAN.md; Line=224; Content=- [ ] Update `operations-bible/02-database-operations.md` with new tables; Severity=HIGH}.File)\ | 224 | HIGH |
| \$(@{File=docs\DATA-CONSOLIDATION-PLAN.md; Line=372; Content=- [Operations Bible - Database Operations](operations-bible/02-database-operations.md); Severity=HIGH}.File)\ | 372 | HIGH |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=44; Content=**Pattern:** `operations-bible/02-database-operations.md`; Severity=HIGH}.File)\ | 44 | HIGH |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=316; Content=1. **AI Documentation Specialist:** Begin scanning for `operations-bible/01-service-matrix.md` and `operations-bible/02-database-operations.md` references (50+ files estimated); Severity=HIGH}.File)\ | 316 | HIGH |
| \$(@{File=docs\operations-bible\06-optimization-history.md; Line=158; Content=- → `operations-bible/02-database-operations.md` — Current canonical naming schema; Severity=HIGH}.File)\ | 158 | HIGH |
| \$(@{File=docs\operations-bible\10-database-audit.md; Line=28; Content=**File:** `docs/operations-bible/02-database-operations.md`; Severity=HIGH}.File)\ | 28 | HIGH |
| \$(@{File=docs\operations-bible\10-database-audit.md; Line=330; Content=- [x] Documentation review complete (operations-bible/02-database-operations.md); Severity=HIGH}.File)\ | 330 | HIGH |
| \$(@{File=docs\operations-bible\10-database-audit.md; Line=350; Content=- [x] operations-bible/02-database-operations.md comprehensive and accurate; Severity=HIGH}.File)\ | 350 | HIGH |
| \$(@{File=docs\specialists\CONSOLIDATION-COMPLETE.md; Line=287; Content=- Updated operations-bible/02-database-operations.md (added § 2.11 Analytics Tables, 800+ lines); Severity=HIGH}.File)\ | 287 | HIGH |
| \$(@{File=docs\specialists\CONSOLIDATION-COMPLETE.md; Line=299; Content=- Updated operations-bible/02-database-operations.md (§ 2.11, 800+ lines); Severity=HIGH}.File)\ | 299 | HIGH |
| \$(@{File=docs\specialists\POC-CONTINUATION-STATUS.md; Line=61; Content=- operations-bible/02-database-operations.md § 2.11 (800+ lines hypertable DDL); Severity=HIGH}.File)\ | 61 | HIGH |
| \$(@{File=docs\specialists\POC-CONTINUATION-STATUS.md; Line=243; Content=3. Create `log_entries` hypertable (DDL from operations-bible/02-database-operations.md § 2.11); Severity=HIGH}.File)\ | 243 | HIGH |
| \$(@{File=docs\specialists\POC-CONTINUATION-STATUS.md; Line=409; Content=1. operations-bible/02-database-operations.md § 2.11 (actual deployment experience); Severity=HIGH}.File)\ | 409 | HIGH |
| \$(@{File=docs\specialists\POC-CONTINUATION-STATUS.md; Line=547; Content=- **Database Operations:** docs/operations-bible/02-database-operations.md § 2.11 (800+ lines); Severity=HIGH}.File)\ | 547 | HIGH |
| \$(@{File=docs\specialists\README.md; Line=122; Content=- Updated operations-bible/02-database-operations.md (§ 2.11 Analytics Tables, 800+ lines); Severity=HIGH}.File)\ | 122 | HIGH |
| \$(@{File=docs\specialists\README.md; Line=134; Content=**[../operations-bible/02-database-operations.md](../operations-bible/02-database-operations.md)** § 2.11; Severity=HIGH}.File)\ | 134 | HIGH |
| \$(@{File=docs\specialists\README.md; Line=293; Content=- **Database Reference:** operations-bible/02-database-operations.md § 2.11; Severity=HIGH}.File)\ | 293 | HIGH |

---

## OldServiceMatrixGuide

**Pattern:** \$(System.Collections.Hashtable.Pattern)\  
**Description:** Old service matrix guide (replaced by complete system architecture)  
**Severity:** HIGH  
**Replacement:** \$(System.Collections.Hashtable.Replacement)\  
**Occurrences:** 8
### Detected Instances

| File | Line | Severity |
|------|------|----------|
| \$(@{File=docs\architecture-bible\13-performance.md; Line=1806; Content=- **[operations-bible/01-service-matrix.md](../operations-bible/01-service-matrix.md)** — Worker topology (no dedicated Pokemon Service worker); Severity=HIGH}.File)\ | 1806 | HIGH |
| \$(@{File=docs\architecture-bible\14-private-channel-architecture.md; Line=694; Content=- [ ] Update `docs/operations-bible/01-service-matrix.md` (new service); Severity=HIGH}.File)\ | 694 | HIGH |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=641; Content=- **[operations-bible/01-service-matrix.md](../operations-bible/01-service-matrix.md)** — Render service start commands; Severity=HIGH}.File)\ | 641 | HIGH |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=1694; Content=- **operations-bible/01-service-matrix.md** — Render auto-restart behavior, exit codes, health checks; Severity=HIGH}.File)\ | 1694 | HIGH |
| \$(@{File=docs\architecture-bible\16-boot-sequence.md; Line=1736; Content=- **[operations-bible/01-service-matrix.md](../operations-bible/01-service-matrix.md)** — Render restart behavior, exit codes; Severity=HIGH}.File)\ | 1736 | HIGH |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=49; Content=**Pattern:** `operations-bible/01-service-matrix.md`; Severity=HIGH}.File)\ | 49 | HIGH |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=104; Content=1. **OPERATIONS.md** — Replace `operations-bible/01-service-matrix.md`, add Task 12 comprehensive guide references; Severity=HIGH}.File)\ | 104 | HIGH |
| \$(@{File=docs\meta\DOCUMENTATION-AUDIT-2025-12-02.md; Line=316; Content=1. **AI Documentation Specialist:** Begin scanning for `operations-bible/01-service-matrix.md` and `operations-bible/02-database-operations.md` references (50+ files estimated); Severity=HIGH}.File)\ | 316 | HIGH |

---

## Recommended Actions

### Immediate (HIGH Severity - Core Meta Files)- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references
- [ ] Update \$file\ with Task 12 comprehensive guide references

### Phase 2 (MEDIUM Severity - Code & Tests)
- [ ] Database terminology cleanup: 711 instances across codebase
- [ ] Standardize to canonical terms (ONPREMISE-DEV-PRIMARY, ONPREMISE-DEV-EXPERIMENT)

---

## Quality Metrics

| Metric | Current | Target | Progress |
|--------|---------|--------|----------|
| Meta files updated | 12/12 | 12/12 | 100% ✅ |
| Deprecated references | 14/50+ | 50+/50+ | 28% |
| Database terminology | 0/60+ | 60+/60+ | 0% ⏳ |

---

## Automation

This report is generated by \scripts/detect_deprecated_refs.ps1\.

**Weekly Automated Scanning:**
Set up GitHub Actions workflow to run this script weekly and create PRs for detected issues.

**Manual Execution:**
\\\powershell
.\scripts\detect_deprecated_refs.ps1 -Verbose
\\\

---

**See Also:**
- \docs/meta/DOCUMENTATION-AUDIT-2025-12-02.md\ — Complete modernization plan (5 phases, Q4 2025 → Q4 2026)
- \docs/operations-bible/database-operations-runbook-comprehensive.md\ — Authoritative database guide (25 pages)
- \docs/architecture-bible/complete-system-architecture.md\ — Authoritative system architecture (30 pages)

**Last Updated:** 2025-12-02 14:52:45 UTC
