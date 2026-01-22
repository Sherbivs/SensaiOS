# Master Router Table
Last Updated (UTC): 2026-01-21T00:00:00Z
Purpose: Text-only reference of every router, its downstream routers, and the primary files/routes they cover for hotfix navigation when automation is unavailable.
Muted callouts note local-only tooling that never ships to prod/cloud runtimes.

**HOMESTEAD MIGRATION COMPLETE (2025-06-15):** All DM gameplay migrated to private guild channels. `src/bot/dm/` DELETED.

**TEST ENVIRONMENT (TE) ESTABLISHED (2026-01-21):** Isolated test environment at `E:\SensaiOS\TE` with Stage Members database (500 simulated guild members).

---

## Top-Level Directory Overview

| Directory | Purpose | ROUTER.md |
|-----------|---------|-----------|
| `assets/` | Generated dexpack assets | ✅ |
| `backups/` | Database backup archives | ❌ (git-ignored) |
| `data/` | Pokemon reference data | ✅ |
| `docs/` | Documentation (Bible system) | ✅ |
| `ops/` | Governance & operations | ✅ |
| `playbooks/` | Escalation & recovery recipes | ✅ |
| `prisma/` | Schema & migrations | ✅ |
| `router/` | Meta-router implementation | ✅ |
| `scripts/` | Automation tooling | ✅ |
| `secrets/` | Local credentials (git-ignored) | ❌ |
| `src/` | Application source | ✅ |
| `Store/` | Runtime cache & local DB | ✅ |
| `tests/` | Test suites | ✅ |
| `tools/` | Vendored binaries | ✅ |

---

## External Test Environment (E:\SensaiOS\TE)

| Directory | Purpose | ROUTER.md |
|-----------|---------|-----------|
| `E:\SensaiOS\TE\` | Test Environment root | ✅ |
| `E:\SensaiOS\TE\config\` | TE configuration | ❌ (in root ROUTER) |
| `E:\SensaiOS\TE\database\seed\` | Database seeding | ✅ |
| `E:\SensaiOS\TE\fixtures\discord\` | Discord mocks | ✅ |
| `E:\SensaiOS\TE\fixtures\gameplay\` | Gameplay state factories | ✅ |
| `E:\SensaiOS\TE\fixtures\pbsl\` | PBSL battle snapshots | ✅ |
| `E:\SensaiOS\TE\runners\` | Test execution scripts | ❌ (in root ROUTER) |

**TE Quick Reference:**
- **Location:** `E:\SensaiOS\TE` (secondary drive backup)
- **Database:** `postgresql://localhost:55435/sensaios_te`
- **Stage Members:** 500 (100 new + 150 casual + 125 active + 100 veteran + 25 champion)
- **Setup:** `cd E:\SensaiOS\TE && .\runners\validate-environment.ps1`

---

## Router-of-Routers
- `ops/ROUTER_INDEX.yaml` — Generated index of active routers. Start here to locate downstream routers quickly.
- `ops/ROUTER.yaml` — Canonical route map. Markerless Mode is documented in `Patch.md`; even when contracts are OFF, do not remove routers.
  - Routes:
  - `ops/ROUTER.md` — Ops & Governance
    - `scripts/ROUTER.md` — Dev & Docs Scripts (includes bootstrap_staging_db.ps1 helper)
    - `src/ROUTER.md` — Application Source
      - `src/dex/ROUTER.md` — Dex runtime loaders, metrics, and flag instrumentation for the v2 pack
    - `outbox.ts` now wraps the event bus helpers so legacy drains can enqueue/claim messages while handlers migrate.
    - `worker-runtime.ts` centralizes worker lifecycle helpers (shutdown hooks, repeating tasks) for outbox/cache/data pipeline entries.
    - `log.ts` remains the structured logger, consuming the shared runtime config.
  - `src/bot/ROUTER.md` — Discord Bot Layer
    - `src/bot/arena/ROUTER.md` — Arena threads and announcer summaries
    - `src/bot/battle/ROUTER.md` — Battle interaction handlers
    - `src/bot/daily/ROUTER.md` — Daily quest claim flow
    - `src/bot/homestead/ROUTER.md` — Homestead channel gameplay (healing, starters, home views)
    - `src/bot/middleware/ROUTER.md` — Command guardrails and limits
    - `src/bot/ops/ROUTER.md` — `/ops` admin command surface
    - `src/bot/wilds/ROUTER.md` — Walk/catch encounter handlers
  - `docs/ROUTER.md` — Documentation Library
    <!-- NOTE: docs/dex-v2-design.md removed - consolidated into Bible system (2025-11-16) -->
  - `src/core/ROUTER.md` — Core Game Engines
    - `src/core/battle/ROUTER.md` — Deterministic battle engine internals
    - `src/core/encounter/ROUTER.md` — Encounter spawn and catch logic
    - `src/core/pbsl/ROUTER.md` — PBSL deterministic engine scaffold
      - `src/core/pbsl/battle/ROUTER.md` — PBSL battle resolver
      - `src/core/pbsl/data/ROUTER.md` — Provenance helpers
      - `src/core/pbsl/encounter/ROUTER.md` — PBSL encounter generator
  - `tests/ROUTER.md` — Test Suite
    - `tests/battle/ROUTER.md` — Battle interaction specs
    - `tests/pbsl/ROUTER.md` — PBSL harness overview
      - `tests/pbsl/fixtures/ROUTER.md` — Deterministic fixture snapshots
- `data/ROUTER.md` — Pokemon Reference Data
- `assets/ROUTER.md` — Generated dexpack assets committed for runtime bootstrapping
  - `data/bootstrap/ROUTER.md` — Bootstrap JSON bundles
  - `data/cache/ROUTER.md` — Generated cache artifacts + sync trigger
- `prisma/ROUTER.md` — Prisma Schema & Migrations
  - `prisma/migrations/ROUTER.md` — Timestamped migration bundles + lockfile provenance
- `scripts/ROUTER.md` — Tooling
  - `scripts/dex/ROUTER.md` — Dex automation helpers
  - `scripts/guard/ROUTER.md` — Guard entrypoints
  - `scripts/ops/ROUTER.md` — Operator automation scripts
- `src/services/ROUTER.md` — Service Layer Helpers
  - `src/services/cache/ROUTER.md` — Cache facade + recipes
- `src/shared/ROUTER.md` — Shared Runtime & Utilities
  - `src/shared/cache/ROUTER.md` — Cache backends (memory/LRU)
<!-- NOTE: src/shared/storage/ removed in Integrity Audit (2025-12-23) - directory never existed -->
<!-- NOTE: sync-layer/ removed in Architecture Audit (2025-12-23) - directory never existed -->
- `tools/ROUTER.md` — Tooling Binaries & Helpers
  - `tools/pgsql17/ROUTER.md` — Vendored Postgres client bundle
    - `tools/pgsql17/pgsql/ROUTER.md` — Bundle root metadata
    - `tools/pgsql17/pgsql/bin/ROUTER.md` — CLI binaries and usage notes
- `Store/ROUTER.md` — Runtime cache store and local Postgres mirror (prefer `npm run ops:auto-bootstrap-local-db` for tooling install + refresh; `npm run ops:bootstrap-local-db` if tooling already exists)
  - `Store/db/` — Local Postgres fallback cluster (git-ignored, created by `npm run ops:auto-bootstrap-local-db`)
<!-- NOTE: discord-pokemon-bot/ removed in Dead Code Cleanup Meeting #4 (2025-12-20) - empty legacy placeholders -->

## Muted Local Files
- `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env` — Muted (DEV Postgres secrets); set `IG_ENV_FILE` here for local and staging work. Keep the repo `.env` empty.
- `C:/Users/sherb/OneDrive/Documents/Key/Prod/.env` — Muted (PROD credentials - DEPRECATED); historically used for Accelerate proxy. Now use Dev/.env with DEV_DATABASE_URL/PROD_DATABASE_URL for 2-node cluster.
<!-- NOTE: docs/db-control-suite.md and docs/ai-env-setup.md removed - consolidated into Bible system (2025-11-16) -->

### Dev & Docs Scripts (`scripts/ROUTER.md`)
- Purpose: Repository automation (ledger, router index, refresh, archiving, guards).
- Owned Globs: `scripts/**`
- Last Updated: 2025-11-09T00:00:00Z
- Key Scripts:
  - `scripts/update_change_ledger.sh` — regenerate Prompt change ledger
  - `scripts/update_router_index.sh` — rebuild `ops/ROUTER_INDEX.yaml`
  - `scripts/refresh_vision.sh` — refresh routers + recovery metadata
  - `scripts/archive_task_history.mjs` — Muted (local archival helper); archive Tasklist history to `ops/ARCHIVE/` (now uses output-formatter)
  - `scripts/verify_router_links.sh` — Muted (CI-only guard); canonical path guard (CI)
  - `scripts/hotfix_entry.sh` — Muted (operator checklist); hotfix checklist helper
  - `scripts/guard_meta.sh` — Muted (preflight-only); enforces READY invariants pre/post flight
  - `scripts/bootstrap_staging_db.ps1` — Muted (staging-only); interactive helper to run `prisma migrate deploy` on staging safely
  - `scripts/restore_prisma_postgres.ps1` — Muted (local restore); Prisma Postgres tunnel + restore automation
  - `scripts/db_admin.ts` — Muted (local CLI); run via `npm run db:cli` for status, counts, and ad-hoc queries (now uses output-formatter)
  - `scripts/setup_ai_env.ps1` — Muted (agent env helper); registers `IG_ENV_FILE` so secrets load from external storage
  - `scripts/db_smoke.ts` — IG_ENV_FILE-aware smoke helper (supports both DEV/PROD direct PostgreSQL modes, now uses output-formatter)
  - `scripts/dev_prod_auto_sync.ts` — Muted (automation loop); ensures migrate/seed inherit env-specific credentials, forces direct migrations, times out hung commands, watches `data/cache/dex-sync-trigger.json`, and continuously runs the Dev → Prod → Dev cadence with integrity checks (`npm run db:auto-sync`)
  - `scripts/db_replication.ts` — Muted (CLI tool); database replication management with 11 commands (now uses output-formatter)
  - `scripts/check_db_redundancy.ts` — Muted (verification tool); database mirror comparison and checksums (now uses output-formatter)
  - `scripts/db_bootstrap_backfill.ts` — Muted (backfill tool); database backfill operations (now uses output-formatter)
  - `scripts/build_dexpack.ts` — Deterministic dexpack builder emitting committed JSON + gzip assets (`npm run data:dexpack`, now uses output-formatter)
  - `scripts/build-dexpack.ts` — DEX v2 binary format builder (`npm run data:dexpack:v2`, now uses output-formatter)
  - `scripts/build-data.ts` — Data pipeline builder (TypeScript, uses output-formatter)
  - `scripts/build-assets-manifest.ts` — Asset manifest generator (TypeScript)
  - `scripts/preflight.ts` — Pre-flight validation (TypeScript)
  - `scripts/ensure-data.ts` — Data orchestration (TypeScript)
  - `scripts/register-commands.ts` — Discord command registration (TypeScript)
  - `scripts/validate_database_urls.ts` — Database URL validation (TypeScript)
  - `scripts/fetch_pokemon.mjs` — PokeAPI data fetching (now uses output-formatter)
  - `scripts/cache_client.mjs` — Cache fallback client (now uses output-formatter)
  - `scripts/ops/dex_v2_backup.ts` — `pg_dump -Fc` wrapper for Dev/Prod backups with env selection (`npm run ops:dex-v2-backup`)
  - `scripts/ops/simulate_flag_rollout.ts` — Feature-flag rollout planner producing JSON payloads and optional webhook alerts (`npm run ops:simulate-flag`)
  - `scripts/ops/dex_v2_alert_dry_run.ts` — Canary alert rehearsal for Grafana/Discord webhooks (`npm run ops:dex-v2-alert-dry-run`)
  - `scripts/ops/bootstrap_local_fallback.ts` — Sync the DEV database into the Store-backed Postgres fallback using binaries from `PG_BIN_DIR` and emit `local-url.txt` (`npm run ops:bootstrap-local-db`)
  - `scripts/ops/ensure_postgres_bundle.ps1` — Winget-backed installer that ensures Postgres CLI tooling (including `share/`) exists and persists `PG_BIN_DIR` for the bootstrapper.
  - `scripts/ops/auto_bootstrap_local_db.ps1` — Calls the installer when needed then executes the fallback refresh for a single-command bootstrap (`npm run ops:auto-bootstrap-local-db`).
- Sub-Routers:
  - `scripts/dex/ROUTER.md` — dex backfill/seed/warm helpers
  - `scripts/guard/ROUTER.md` — CI guard entrypoints (require ensure-db preload, etc.)
  - `scripts/ops/ROUTER.md` — operator automation (e.g., run_dex_migrations.ps1)
- Notes:
  - 2025-10-27: Router scripts audited; verify_router_links and update_router_index keep meta routers synchronized during PBSL work.
  - 2025-10-28: Added staging bootstrap helper to tooling catalog.
  - 2025-10-29: Added Accelerate restore + smoke scripts to support Prisma Postgres migrations.
  - 2025-10-30: Added Dev ↔ Prod auto-sync loop to kick on deployment, poll every five minutes, and surface drift via JSON logs.
  - 2025-11-01: Broke out dex automation, guard entrypoints, and ops scripts into dedicated sub-routers for faster discovery.
  - 2025-11-02: Added dexpack build + guard tooling so committed pack artifacts stay deterministic across branches.
  - 2025-11-03: Added DEX v2 cutover helpers covering backups, flag scheduling, and observability alert dry-runs.
  - 2025-11-05: Added a Store-backed Postgres fallback bootstrapper that mirrors DEV data and writes `Store/db/local-url.txt` for Prisma failover.
  - 2025-11-06: Landed a silent Postgres dependency installer plus a single wrapper command so `npm run ops:auto-bootstrap-local-db` provisions tooling then refreshes the Store-backed mirror.
  - 2025-11-09: Completed console output standardization - 11 scripts migrated to centralized output-formatter utility (src/utils/output-formatter.ts) with ESLint enforcement and 61 comprehensive tests. All CLI scripts now use consistent formatting patterns.

<!-- NOTE: ops/INBOX/ removed in Integrity Audit (2025-12-23) - directory never existed -->

### Documentation Library (`docs/ROUTER.md`)
- Purpose: Centralized Bible-based documentation system with Architecture, Operations, and Development guides.
- Owned Globs: `docs/**`
- Last Updated: 2025-11-16T00:00:00Z
- Bible Structure:
  - `docs/architecture-bible/` (15 files) — System overview, infrastructure, database, services, game engine, Discord bot, future roadmap
  - `docs/operations-bible/` (6 files) — Service matrix, database operations, deployment, environment, monitoring
  - `docs/development-bible/` (8 files) — Local setup, testing, debugging, performance, error handling, console tooling, utilities
  - `docs/ROUTER.md` — Comprehensive navigation hub with Bible tables, quick refs, cross-references
- Notes:
  - 2025-11-16: Documentation centralized into Bible system (93.4% reduction, 454 → 30 files)
  - All operational directories (architecture/, database/, deployment/, environment/, error-system/, game-engine/, console-output/, specs/) consolidated into Bible sections
  - See docs/ROUTER.md for comprehensive navigation tables and quick reference index

### Prisma Migrations (`prisma/migrations/ROUTER.md`)
- Purpose: Timestamped Prisma migration bundles plus `migration_lock.toml` state.
- Notes: Follow Prisma migration procedures before applying new migrations; record rollout evidence in Tasklist notes.
- Sub-Routers:
  - `prisma/migrations/202510280500_scaling_indexes/ROUTER.md` — Adds scaling indexes and composite uniqueness guards for battle, encounter, cooldown tables.
  - `prisma/migrations/202510290930_dex_reference_spine/ROUTER.md` — Introduces normalized dex reference spine, supporting extensions, and SpeciesSheet matview.
  - `prisma/migrations/202511010900_schema_constraints/ROUTER.md` — Tightens relational constraints, formalizes OutboxStatus enum, and adds updatedAt defaults.

### Dex Automation (`scripts/dex/ROUTER.md`)
- Purpose: Helpers (`backfill_species.ts`, `seed_reference.ts`, `warm_cache.ts`) used during dex seeding and rehearsals.
- Notes: Coordinate schema changes with the data pipeline and Prisma migrations before re-running seeds.

### Guard Entry Points (`scripts/guard/ROUTER.md`)
- Purpose: Hardened guard wrappers (e.g., `require-ensure-db-preload.mjs`) consumed by CI and local guard scripts.
- Notes: Keep outputs terse so developers can remediate failures quickly.
- Latest: `guard_auto_sync.sh` provides a `--ci --dry-run` auto-sync check so missing secrets or dex trigger metadata fail before deployment.
- Latest: `dev_prod_auto_sync.ts` now pushes webhook embeds (`ALERT_WEBHOOK_URL`) whenever `integrity.alert` fires after consolidation, suppressing duplicates until counts change.
- Latest: `guard_dexpack.sh` runs the dexpack builder in verification mode (`npm run guard:dexpack`) so the committed JSON/gzip/module artifacts stay in sync.

### Operator Scripts (`scripts/ops/ROUTER.md`)
- Purpose: Operator helpers for migrations, backups, and rollout rehearsals.
- Notes: `run_dex_migrations.ps1` drives the DEV/PROD migrate cadence; DEX v2 helpers cover backup generation (`ops:dex-v2-backup`), flag plan authoring (`ops:simulate-flag`), alert dry-runs (`ops:dex-v2-alert-dry-run`), and the Store-backed Postgres fallback bootstrapper (`ops:auto-bootstrap-local-db` for dependency install + refresh, `ops:bootstrap-local-db` when tooling already exists).

### Data Pipeline Schemas (`src/data_pipeline/schema/ROUTER.md`)
- Purpose: Zod validators for dataset outputs (`abilities`, `moves`, `species`, `typechart`, `manifest`).
- Notes: Update alongside `data/bootstrap/**` and consumers when introducing breaking schema changes.

### Generated Assets (`assets/ROUTER.md`)
- Purpose: Committed build outputs (dexpack JSON, gzip, and ES module) consumed by the bot, engine, and guards.
- Notes: Regenerate via `npm run data:dexpack`; verify consistency in CI with `npm run guard:dexpack` so JSON/gzip/module artifacts stay deterministic and keep typed-array/perfect-hash tables aligned with runtime expectations.
- Files: `assets/dexpack.v1.json`, `assets/dexpack.v1.json.gz`, `assets/dexpack.gen.mjs`.

### Runtime Cache Store (`Store/ROUTER.md`)
- Purpose: Store-backed persistence for cache namespaces and the offline Postgres mirror.
- Notes: `discord-cache/` and `runtime-cache/` stay git-ignored; `Store/db/` hosts the local Postgres cluster, snapshots, and `local-url.txt` written by the automated bootstrap (`npm run ops:auto-bootstrap-local-db`).
<!-- NOTE: Store/db/ROUTER.md removed in Integrity Audit (2025-12-23) - directory is git-ignored -->

### Service Cache Recipes (`src/services/cache/ROUTER.md`)
- Purpose: Cache facade + namespace recipes powering battle, encounter, and quest flows.
- Notes: Emit `/ops cache` updates when introducing new namespaces so operators can monitor hit/miss metrics.

### Shared Cache Backends (`src/shared/cache/ROUTER.md`)
- Purpose: Memory + LRU implementations that back the facade.
- Notes: Tune TTL or capacity limits here when adjusting runtime budgets.

<!-- NOTE: src/shared/storage/ section removed in Integrity Audit (2025-12-23) - directory never existed -->

### ⚠️ REMOVED: Sync Layer Prototype (Architecture Audit, 2025-12-23)
The `sync-layer/` directory was referenced in documentation but never existed in the repository.
This phantom reference has been removed. Any future sync layer work should start fresh.

### Postgres 17 Bundle (`tools/pgsql17/ROUTER.md`)
- Purpose: Vendored Postgres client binaries for local recovery and migration workflows.
- Notes: Treat as read-only; document checksums when upgrading the bundle.
- Sub-Routers:
  - `tools/pgsql17/pgsql/ROUTER.md` — Bundle root metadata (read-only)
  - `tools/pgsql17/pgsql/bin/ROUTER.md` — CLI binaries used by local scripts

### ⚠️ REMOVED: Legacy Discord Bot Package (Meeting #4, 2025-12-20)
The `discord-pokemon-bot/` directory was removed in Dead Code Cleanup Meeting #4. It contained only
empty ROUTER.md placeholder files with no actual code. Modern implementation is in `src/bot/**`.

### Application Source (`src/ROUTER.md`)
- Purpose: Root TypeScript source tree; delegates to domain routers.
- Owned Globs: `src/**`
- Last Updated: 2025-11-02T23:45:00Z
- Downstream Routers:
  - `src/bot/ROUTER.md` — Discord bot interactions
  - `src/core/ROUTER.md` — core battle/encounter engines
  - `src/data/ROUTER.md` — dexpack loader + helper facade for committed assets
  - `src/dex/ROUTER.md` — DEX v2 runtime loaders, metrics, and manifest accessors
  - `src/shared/ROUTER.md` — shared runtime/config/logging
  - `src/workers/ROUTER.md` — background workers
- Supporting Files:
  - `src/index.ts` — application entry (Prisma init + boots Discord bot and legacy security worker)
  - `src/shared/**` — shared config, logging, utilities
- Recent Notes:
  - Battle result persistence centralized; announcer flow shared for victories/forfeits.
  - Daily quest claim flow landed with cooldown wiring.
  - Render DATABASE_URL overrides prefer managed connection strings.
  - Entry now launches the security bot before the Discord client so DripTVDD alerts stay online.
  - Runtime config loader now forbids localhost URLs in production and exposes cache settings.
  - Dexpack loader (`src/data/dexpack.js`) now boots from the generated ES module for zero-parse startup while keeping helpers shared across CommonJS + TypeScript callers.
  - Dex runtime metrics (`src/dex/metrics.js`) emit structured load, lookup, and fallback events to trace the v1/v2 compatibility bridge.
  - Background workers now run via dedicated Render services; ENABLE_CONTINUOUS_SWEEP defers security sweeps to the security worker.
  - Prisma client boot now uses 2-node direct PostgreSQL cluster (DEV master + PROD local node) for <50ms latency gameplay.

### Dex Runtime (`src/dex/ROUTER.md`)
- Purpose: Binary runtime, telemetry helpers, and manifest accessors for the DEX v2 pack.
- Owned Globs: `src/dex/**`
- Last Updated: 2025-11-02T23:45:00Z
- Key Files:
  - `metrics.js` — Structured logging for load, lookup, miss, and fallback events surfaced to operators.
  - `v2/loader.js` — Maps the v2 binary, verifies signatures, and exposes typed-array views.
  - `v2/accessors.js` — Generated manifest bindings consumed by the loader and parity tests.
- Notes:
  - 2025-11-02: Instrumentation added to capture load/fallback telemetry and feed newly introduced parity and microbench suites.
  - 2025-11-03: Parity spec now iterates every v1 alias to ensure v2 hash tables resolve identical species ids; guard_dexpack.sh verifies both v1 JSON/module and v2 binary artifacts.

### Shared Runtime & Utilities (`src/shared/ROUTER.md`)
- Purpose: Centralized runtime config, Prisma bootstrap, logging, caching, and event bus compatibility helpers.
- Owned Globs: `src/shared/**`
- Last Updated: 2025-11-06T14:30:00Z
- Key Files:
  - `config.ts` — `loadConfig()` promotes Render internal URLs and enforces runtime invariants.
  - `prisma.ts` — Triple Prisma clients (`prisma` for PROD local node + `devPrisma` for DEV master + `localPrisma` for workstation mirror), all connected on startup, exports `getDatabaseStats()` returning `TripleDatabaseStats` with separate DEV/PROD/LOCAL telemetry.
  - `cache/memory.ts` — default TTL cache backing bots and workers.
  - `outbox.ts` — enqueue/dequeue helpers layered on `BusMessage` records for backwards compatibility.
  - `log.ts` — structured logger leveraging shared runtime metadata.
- Notes:
  - 2025-11-07: `prisma.ts` maintains simultaneous DEV (direct PostgreSQL master via `DEV_DATABASE_URL` or `RENDER_DB_EXTERNAL_URL`), PROD (direct PostgreSQL local node via `PROD_DATABASE_URL` - PRIMARY for gameplay), and LOCAL (workstation mirror via `DATABASE_LOCAL_URL`) connections with independent heartbeat tracking; `getDatabaseStats()` surfaces all three in logger output.
  - 2025-10-29: `config.ts` and `prisma.ts` surface database environment configuration and runtime telemetry for status CLI output.
- Last Task ID: META.RUNTIME.BLUEPRINT_APPLY

### Background Workers (`src/workers/ROUTER.md`)
- Purpose: Render-bound loops that drain the event bus and run offline jobs.
- Owned Globs: `src/workers/**`
- Last Updated: 2025-10-28T22:55:00Z
- Key Files:
  - `outbox.ts` — Drains event bus entries and publishes `worker.outbox.*` telemetry via `runWorker`.
  - `cache-refresh.ts` — Refreshes Pokédex cache on an interval with jittered scheduling helpers.
  - `data-pipeline.ts` — Rebuilds reference data manifests and records last-success/last-error markers.
  - `backup.ts` — Legacy entry retained for compatibility (delegates to the outbox worker).
- Last Task ID: T10.SCALE.WORKERS

### Discord Bot Layer (`src/bot/ROUTER.md`)
- Purpose: Discord client bootstrap, slash commands, homestead channels, arena threads, admin ops.
- Owned Globs: `src/bot/**`
- Last Updated: 2025-12-18T00:00:00Z
- Areas & Key Files:
  - `src/bot/index.ts` — Discord client bootstrap & routing with ready guards
  - `src/bot/commands/**` — Slash command registration (e.g., `/ops`, `/battle`)
  - `src/bot/homestead/**` — Homestead channels (party/box/profile views, starter selection, healing, daily quests); see `src/bot/homestead/ROUTER.md`
  - `src/bot/arena/**` — Arena thread creation and summary helpers; see `src/bot/arena/ROUTER.md`
  - `src/bot/battle/**` — Interaction handlers queuing moves, switches, and forfeits; see `src/bot/battle/ROUTER.md`
  - `src/bot/daily/**` — Daily quest claim logic; see `src/bot/daily/ROUTER.md`
  - `src/bot/middleware/**` — Rate limiting and guardrails; see `src/bot/middleware/ROUTER.md`
  - `src/bot/ops/**` — `/ops` admin command surface; see `src/bot/ops/ROUTER.md`
  - `src/bot/wilds/**` — Walk/catch encounter controls; see `src/bot/wilds/ROUTER.md`
  - `src/bot/security/**` — Security bot module (role sweeps, DripTVDD alert digest); see `src/bot/security/ROUTER.md`
- Notes:
  - 2025-06-15: **HOMESTEAD MIGRATION COMPLETE** — All gameplay moved from DMs to private guild channels (homestead-{username}).
  - 2025-10-27: DRIP security alerts now fire on role assignments with audit-log attribution and CLI telemetry.

### CLI Tools (`src/cli/ROUTER.md`)
- Purpose: Command-line interface tools for runtime operations and analysis.
- Owned Globs: `src/cli/**`
- Last Updated: 2025-12-23T00:00:00Z
- Key Files:
  - `ai-log-query.ts` — AI log querying and analysis CLI (commander-based)
- Notes:
  - 2025-12-23: Created during Architecture Audit Meeting #6

### Slash Command Handlers (`src/commands/ROUTER.md`)
- Purpose: Discord slash command implementations loaded by command-loader.ts.
- Owned Globs: `src/commands/**`
- Last Updated: 2025-12-20T00:00:00Z
- Active Commands:
  - `battle.ts` / `battle-turn.ts` — Turn-based battle flows
  - `home.ts` / `starter.ts` / `daily.ts` / `heal.ts` — Player onboarding and maintenance
  - `dex.ts` / `move.ts` / `weak.ts` / `calc.ts` — Pokedex lookups and matchup utilities
  - `profile.ts` — Trainer profile management
  - `ping.ts` / `version.ts` / `walk.ts` — Utility commands
  - `ops.ts` — Administrative `/ops` command logic
- Notes:
  - 2025-12-20: Archived dm-home-loader.ts, box.ts, party.ts (dead code cleanup)

### Configuration Modules (`src/config/ROUTER.md`)
- Purpose: Environment configuration and centralized settings for services.
- Owned Globs: `src/config/**`
- Last Updated: 2025-12-20T21:00:00Z
- Key Files:
  - `env.ts` — Primary environment configuration (14+ imports across codebase)
  - `env.d.ts` — Ambient type definitions for TypeScript callers
  - `engine-db-config.ts` — Engine DB runtime configuration (Phase 17-22)
- Notes:
  - 2025-12-20: Archived index.ts, schema.ts, loader.ts (927 lines, Zod system never integrated)

### Event Bus & Battle Primitives (`src/engine/ROUTER.md`)
- Purpose: Shared mechanics for battle calculations and worker orchestration.
- Owned Globs: `src/engine/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `bus.ts` — Event bus primitives powering worker scheduling
  - `worker.ts` — Worker bootstrap and message loop helpers
  - `calc.js` / `effects.js` / `stats.js` / `tables.js` / `types.js` / `turn.js` — Legacy battle math/logic modules
  - `rng.js` — Randomness helpers mirrored in PBSL oracle tests
- Notes:
  - Mix of legacy CommonJS battle utilities and new TypeScript bus/worker helpers

### Generated Prisma Client (`src/generated/`)
- Purpose: Auto-generated Prisma client files from schema.prisma.
- Owned Globs: `src/generated/**`
- Notes:
  - Contains `prisma/` subdirectory with generated Prisma client
  - Regenerated via `npx prisma generate`
  - Do NOT edit manually — always regenerate from schema

### Shared Library Helpers (`src/lib/ROUTER.md`)
- Purpose: Utility modules used by legacy command surfaces and cache builders.
- Owned Globs: `src/lib/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `assets.js` — Resolves asset locations for embeds and messaging
  - `cooldown.js` — Cooldown tracking helpers for command throttling
  - `dex-api.js` — Fetch helpers for PokeAPI endpoints
  - `type-colors.js` — Maps Pokemon types to embed color metadata
- Notes:
  - Prefer TypeScript equivalents under `src/shared` where available

### Prisma Data Models (`src/models/ROUTER.md`)
- Purpose: TypeScript wrappers around Prisma client entities.
- Owned Globs: `src/models/**`
- Last Updated: 2025-11-02T00:10:00Z
- Key Files:
  - `index.ts` — Re-exports Prisma client, typed accessors, and shared model helpers
- Notes:
  - Update alongside schema/migration changes so downstream code compiles

### Observability Suite (`src/observability/ROUTER.md`)
- Purpose: Centralized observability infrastructure with pluggable backends.
- Owned Globs: `src/observability/**`
- Last Updated: 2025-12-20T00:00:00Z
- Key Components:
  - `hub/` — Central Observability Hub (observability-hub.ts, observability-types.ts, observability-config.ts)
  - `backends/loki/` — Loki/Grafana backend implementation
- Notes:
  - Subscribes to Event Bus with '**' pattern
  - Complete isolation: Hub/backend failures never affect main application

### Runtime Supervisors (`src/runtime/ROUTER.md`)
- Purpose: Supervisors and orchestration helpers invoked by long-lived automation.
- Owned Globs: `src/runtime/**`
- Last Updated: 2025-11-01T15:20:00Z
- Key Files:
  - `autoSync.ts` — Spawns auto-sync loop with shutdown handle (30s restart delay)
- Notes:
  - Used by Render workers to keep database sync loops running

### Ambient Type Declarations (`src/types/ROUTER.md`)
- Purpose: Type definitions that augment external modules used by the runtime.
- Owned Globs: `src/types/**`
- Last Updated: 2025-11-07T22:00:00Z
- Notes:
  - Houses `.d.ts` files needed until upstream packages ship proper typings
  - Prisma Accelerate typings removed 2025-11-07

### Utility Helpers (`src/utils/ROUTER.md`)
- Purpose: Cross-cutting utilities for logging, CLI status output, and operational helpers.
- Owned Globs: `src/utils/**`
- Last Updated: 2025-12-20T00:00:00Z
- Key Files:
  - `activityTracker.js` — Tracks user activity for rate limiting
  - `cliStatus.js` / `cliStatus.d.ts` — CLI dashboard renderers
  - `fatalErrorGuard.js` — Process-level error handling
  - `logger.ts` (1,248 lines) — Stats display + Infinity Console visual output
  - `opsNotifier.js` — Operational alerts to staff channels
  - `timezone.js` — Timezone helpers for scheduling
  - `output-formatter.ts` — Centralized CLI/script output formatting (ESLint enforced)
- Notes:
  - 2025-12-20: intelligent-logger.ts DELETED (Meeting #11) — migrated to shared/logging/index.ts

### Core Game Engines (`src/core/ROUTER.md`)
- Purpose: Deterministic battle and encounter mechanics.
- Owned Globs: `src/core/**`
- Last Updated: 2025-11-01T19:30:00Z
- Areas & Representative Files:
  - `src/core/battle/**` — Engine wrappers, damage calculations, status effects; see `src/core/battle/ROUTER.md`
  - `src/core/encounter/**` — Spawn/walk logic and catch resolution; see `src/core/encounter/ROUTER.md`
  - `src/core/pbsl/**` — Deterministic PBSL scaffolding (RNG, provenance, battle/encounter mirrors); see `src/core/pbsl/ROUTER.md`
  - Shared math/utilities referenced by `src/bot/**` during battles and encounters
- Notes:
  - 2025-10-27: PBSL oracle fixtures diff deterministic battle snapshots against upstream engines for compliance.
  - 2025-11-01: Sub-routers capture battle, encounter, and PBSL internals so parity fixes stay discoverable.

### Test Suite (`tests/ROUTER.md`)
- Purpose: Vitest suites covering schemas, data pipeline, battle engines, DM flows, ops tooling.
- Owned Globs: `tests/**`
- Last Updated: 2025-11-02T23:45:00Z
- Representative Specs:
  - `tests/battle_engine.spec.ts` — deterministic battle engine coverage
  - `tests/battle_flow.spec.ts` — arena flow integration tests
  - `tests/battle/actions.interaction.spec.ts` — button prompt coverage; see `tests/battle/ROUTER.md`
  - `tests/daily.spec.ts` — daily quest claim success and cooldown guard rails
  - `tests/ops.spec.ts` — `/ops` admin command scenarios (limit/after/participant)
  - `tests/data_pipeline.spec.ts` — reference data validation
  - `tests/dm_home_views.spec.ts` — DM Home party/box/profile embed output with pagination buttons
  - `tests/encounter_walk.spec.ts` — wild encounter flow
- Notes:
  - 2025-10-27: PBSL oracle diff suite compares fixtures under tests/pbsl/** for deterministic regressions.
  - 2025-11-01: Battle engine spec mirrors MVP rules for priority, status modifiers, flinch handling, and early offensive items.
  - 2025-11-01: PBSL fixtures (`tests/pbsl/fixtures/**`) capture deterministic snapshots referenced by oracle tests.
  - 2025-11-02: `tests/dexpack.parity.spec.ts` verifies v1/v2 lookup parity across species and move metadata.
  - 2025-11-02: `tests/dexpack.microbench.ts` provides an opt-in bench harness (`DEX_V2_BENCH=1 npm run bench:dex`) to track lookup latency.
