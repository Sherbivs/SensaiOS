# Master Router Table
Last Updated (UTC): 2025-10-30T00:47:00Z
Purpose: Text-only reference of every router, its downstream routers, and the primary files/routes they cover for hotfix navigation when automation is unavailable.
Muted callouts note local-only tooling that never ships to prod/cloud runtimes.

## Router-of-Routers
- `ops/ROUTER_INDEX.yaml` — Generated index of active routers. Start here to locate downstream routers quickly.
- `ops/ROUTER.yaml` — Canonical route map. Markerless Mode is documented in `ops/CRITICAL.md`; even when contracts are OFF, do not remove routers.
  - Routes:
  - `ops/ROUTER.md` — Ops & Governance
    - `scripts/ROUTER.md` — Dev & Docs Scripts (includes bootstrap_staging_db.ps1 helper)
    - `src/ROUTER.md` — Application Source
    - `ops/DB_IMPORT_PRISMA_POSTGRES.md` — Prisma Postgres import runbook for Accelerate migrations
  - `ops/POKEMON_CACHE.md` — PokeAPI integration & cache operations runbook
    - `outbox.ts` now wraps the event bus helpers so legacy drains can enqueue/claim messages while handlers migrate.
    - `worker-runtime.ts` centralizes worker lifecycle helpers (shutdown hooks, repeating tasks) for outbox/cache/data pipeline entries.
    - `log.ts` remains the structured logger, consuming the shared runtime config.
    - `src/bot/ROUTER.md` — Discord Bot Layer
    - `src/core/ROUTER.md` — Core Game Engines
    - `tests/ROUTER.md` — Test Suite

## Muted Local Files
- `.env` — Muted (local dev secrets); configure tokens and keys for personal environments only. Prefer setting `IG_ENV_FILE` to an external path (e.g., `C:/Users/<you>/OneDrive/Documents/Key/.env`). Production skips repo `.env` unless `IG_ALLOW_REPO_ENV=1`.
- `secrets/prisma-accelerate.env` — Muted (Accelerate credentials); copy from `secrets/prisma-accelerate.env.example` and store outside the repo.
- `secrets/prisma-dev.env` — Muted (local/staging DB credentials); copy from `secrets/prisma-dev.env.example` and store outside the repo.

## Router Details

### Ops & Governance (`ops/ROUTER.md`)
- Purpose: Canonical operational control-plane (NEXT pointer, CRITICAL, TOUCHMAP, router maps, inbox).
- Owned Globs: `ops/**`
- Last Updated: 2025-10-29T05:20:00Z
- Key References:
  - `ops/NEXT.yaml` — next task pointer (READY pointer must exist on exit)
  - `ops/CRITICAL.md` — fast-path guardrails + Markerless guidance
  - `Agents.md` — Agent handbook (contract-first quickstart)
  - `OPERATIONS.md` — operational runbook and worker matrix
  - `ops/POKEMON_CACHE.md` — PokeAPI cache architecture & incident response
  - `ops/ROUTER.yaml` — canonical path map; router_docs category groups ops/ROUTER.md, ops/ROUTER_INDEX.yaml, and masterroutetable.md
  - `ops/ROUTER_INDEX.yaml` — router-of-routers manifest
  - `ops/INBOX/notes.md` — operator notes
  - `ops/RECOVERY.yaml` — resume metadata
  - `ops/CANONICAL_NAMES.yaml` — router/document casing guard
  - `ops/ARCHIVE/README.md` — Tasklist archival guidance
  - `ops/DB_BOOTSTRAP.md` — staging schema bootstrap runbook
  - `ops/DB_IMPORT_PRISMA_POSTGRES.md` — Prisma Accelerate import runbook (Render → Prisma Postgres)
  - `ops/change-ledger.md` — generated 200-entry commit ledger (Prompt holds 10-entry summary)
- Notes:
  - 2025-10-27: Router maps now track PBSL oracle fixtures and DRIP role assignment alerts; audit recorded in ops/ROUTER.md.
  - 2025-10-28: Added DB bootstrap runbook and helper script to router inventory.
  - 2025-10-28: Trimmed Prompt ledger to 10 entries and moved the full log to ops/change-ledger.md for readability.
  - 2025-10-28: OPERATIONS.md documents the worker matrix, rollout checklist, and recovery toggles for ENABLE_CONTINUOUS_SWEEP + interval envs.
  - 2025-10-28: Added router_docs category under ops/ROUTER.yaml to track masterroutetable alongside the generated router manifests.
  - 2025-10-29: Prisma Accelerate import + restore workflow documented; router metadata refreshed to surface Accelerate-first strategy and smoke test coverage.
  - 2025-10-29: PokeAPI integration runbook added (`ops/POKEMON_CACHE.md`) with axios/node-cron dependencies noted for the cache worker.
  - 2025-10-29: Prisma Accelerate `DATABASE_URL` lives in `secrets/prisma-accelerate.env` (gitignored); pull the value from Render secrets before running local migrate deploys.

### Dev & Docs Scripts (`scripts/ROUTER.md`)
- Purpose: Repository automation (ledger, router index, refresh, archiving, guards).
- Owned Globs: `scripts/**`
- Last Updated: 2025-10-29T01:50:00Z
- Key Scripts:
  - `scripts/update_change_ledger.sh` — regenerate Prompt change ledger
  - `scripts/update_router_index.sh` — rebuild `ops/ROUTER_INDEX.yaml`
  - `scripts/refresh_vision.sh` — refresh routers + recovery metadata
  - `scripts/archive_task_history.mjs` — Muted (local archival helper); archive Tasklist history to `ops/ARCHIVE/`
  - `scripts/verify_router_links.sh` — Muted (CI-only guard); canonical path guard (CI)
  - `scripts/hotfix_entry.sh` — Muted (operator checklist); hotfix checklist helper
  - `scripts/guard_meta.sh` — Muted (preflight-only); enforces READY invariants pre/post flight
  - `scripts/bootstrap_staging_db.ps1` — Muted (staging-only); interactive helper to run `prisma migrate deploy` on staging safely
  - `scripts/restore_prisma_postgres.ps1` — Muted (local restore); Prisma Postgres tunnel + restore automation
  - `scripts/db_admin.ts` — Muted (local CLI); run via `npm run db:cli` for status, counts, and ad-hoc queries
  - `scripts/setup_ai_env.ps1` — Muted (agent env helper); registers `IG_ENV_FILE` so secrets load from external storage
  - `scripts/db_smoke.ts` — Accelerate smoke query (`SELECT 1 AS ok`)
- Notes:
  - 2025-10-27: Router scripts audited; verify_router_links and update_router_index keep meta routers synchronized during PBSL work.
  - 2025-10-28: Added staging bootstrap helper to tooling catalog.
  - 2025-10-29: Added Accelerate restore + smoke scripts to support Prisma Postgres migrations.

### Application Source (`src/ROUTER.md`)
- Purpose: Root TypeScript source tree; delegates to domain routers.
- Owned Globs: `src/**`
- Last Updated: 2025-10-29T01:50:00Z
- Downstream Routers:
        - `src/bot/ROUTER.md` — Discord bot interactions
        - `src/core/ROUTER.md` — core battle/encounter engines
        - `src/shared/ROUTER.md` — shared runtime/config/logging
        - `src/worker/ROUTER.md` — background workers
- Supporting Files:
        - `src/index.ts` — application entry (Prisma init + boots Discord bot and legacy security worker)
        - `src/shared/**` — shared config, logging, utilities
- Recent Notes:
        - Battle result persistence centralized; announcer flow shared for victories/forfeits.
        - Daily quest claim flow landed with cooldown wiring.
        - Render DATABASE_URL overrides prefer managed connection strings.
        - Entry now launches the security bot before the Discord client so DripTVDD alerts stay online.
        - Runtime config loader now forbids localhost URLs in production and exposes cache settings.
  - Background workers now run via dedicated Render services; ENABLE_CONTINUOUS_SWEEP defers security sweeps to the security worker.
    - Prisma client boot now prioritises Accelerate URLs surfaced by shared config and reports the active transport (direct vs accelerate-node) in CLI telemetry.

### Shared Runtime & Utilities (`src/shared/ROUTER.md`)
- Purpose: Centralized runtime config, Prisma bootstrap, logging, caching, and event bus compatibility helpers.
- Owned Globs: `src/shared/**`
- Last Updated: 2025-10-29T01:50:00Z
- Key Files:
  - `config.ts` — `loadConfig()` promotes Render internal URLs and enforces runtime invariants.
  - `prisma.ts` — singleton Prisma client with early `$connect()` and URL validation.
  - `cache/memory.ts` — default TTL cache backing bots and workers.
  - `outbox.ts` — enqueue/dequeue helpers layered on `BusMessage` records for backwards compatibility.
  - `log.ts` — structured logger leveraging shared runtime metadata.
- Notes:
  - 2025-10-29: `config.ts` and `prisma.ts` surface Accelerate env hints, auto-select edge/node runtimes, and capture transport telemetry for status CLI output.
- Last Task ID: META.RUNTIME.BLUEPRINT_APPLY

### Background Workers (`src/worker/ROUTER.md`)
- Purpose: Render-bound loops that drain the event bus and run offline jobs.
- Owned Globs: `src/worker/**`
- Last Updated: 2025-10-28T22:55:00Z
- Key Files:
  - `outbox.ts` — Drains event bus entries and publishes `worker.outbox.*` telemetry via `runWorker`.
  - `cache-refresh.ts` — Refreshes Pokédex cache on an interval with jittered scheduling helpers.
  - `data-pipeline.ts` — Rebuilds reference data manifests and records last-success/last-error markers.
  - `backup.ts` — Legacy entry retained for compatibility (delegates to the outbox worker).
- Last Task ID: T10.SCALE.WORKERS

### Discord Bot Layer (`src/bot/ROUTER.md`)
- Purpose: Discord client bootstrap, slash commands, DM flows, arena threads, admin ops.
- Owned Globs: `src/bot/**`
- Last Updated: 2025-10-27T11:45:00Z
- Areas & Key Files:
	- `src/bot/index.ts` — Discord client bootstrap & routing with ready guards
	- `src/bot/dm/**` — DM home, starter selection, healing, drip alerts, daily quests
	- `src/bot/commands/**` — Slash command registration (e.g., `/ops`, `/battle`)
	- `src/bot/wilds/**` — encounter controls
	- `src/bot/battle/**` — arena threads, announcer summaries, persistence hooks
	- `src/bot/ops/admin.ts` — `/ops` admin stats with filters (limit, after, participant)
	- `src/bot/main.js` — legacy security bot (role sweeps, DripTVDD alert digest)
	- `src/bot/dripAlerts.js` — DM alert scheduler/dispatcher backing security alerts
- Notes:
	- 2025-10-27: DRIP security alerts now fire on role assignments with audit-log attribution and CLI telemetry.

### Core Game Engines (`src/core/ROUTER.md`)
- Purpose: Deterministic battle and encounter mechanics.
- Owned Globs: `src/core/**`
- Last Updated: 2025-10-27T12:30:00Z
- Areas & Representative Files:
	- `src/core/battle/**` — engine wrappers, damage calculations, status effects
	- `src/core/encounter/**` — spawn/walk logic
	- Shared math/utilities referenced by `src/bot/**` during battles and encounters
- Notes:
	- 2025-10-27: PBSL oracle fixtures diff deterministic battle snapshots against upstream engines for compliance.

### Test Suite (`tests/ROUTER.md`)
- Purpose: Vitest suites covering schemas, data pipeline, battle engines, DM flows, ops tooling.
- Owned Globs: `tests/**`
- Last Updated: 2025-10-27T12:30:00Z
- Representative Specs:
	- `tests/battle_engine.spec.ts` - deterministic battle engine coverage
	- `tests/battle_flow.spec.ts` - arena flow integration tests
	- `tests/daily.spec.ts` - daily quest claim success and cooldown guard rails
	- `tests/ops.spec.ts` - `/ops` admin command scenarios (limit/after/participant)
	- `tests/data_pipeline.spec.ts` - reference data validation
	- `tests/encounter_walk.spec.ts` - wild encounter flow
- Notes:
	- 2025-10-27: PBSL oracle diff suite compares fixtures under tests/pbsl/** for deterministic regressions.

### CI & Automation Workflows (`.github/ROUTER.md`)
- Purpose: GitHub Actions guards, health checks, and runtime automation.
- Owned Globs: `.github/**`
- Last Updated: 2025-10-30T00:46:00Z
- Key Workflows:
  - `.github/workflows/guard-meta.yml` / `guard-docs.yml` / `guard-router.yml` / `guard-routing.yml` / `guard-render.yml` - Contract, docs, router, and Render guards.
  - `.github/workflows/agent-health.yml` / `runtime.yml` - Agent readiness probes and runtime lint/test gates.
  - `.github/workflows/data-health.yml` / `refresh-cache.yml` - Nightly data pipeline smoke tests and cache refreshers.
  - `.github/workflows/pbsl-oracle.yml` - Deterministic PBSL fixture regression suite.
- Notes:
  - Guard pipelines should be re-run after router/document updates to keep CI aligned with the meta contract.

### Local Database State Cache (`.db-state/ROUTER.md`)
- Purpose: Track the most recent database source used by local tooling.
- Owned Globs: `.db-state/**`
- Last Updated: 2025-10-30T00:46:00Z
- Key Files:
  - `.db-state/db-connection.json` - Records the last connection source (Accelerate vs direct) and timestamp for operator context.
- Notes:
  - Generated locally; keep credentials out of this folder.

### Pokemon Reference Data (`data/ROUTER.md`)
- Purpose: Cached datasets and bootstrap payloads for dex helpers and tests.
- Owned Globs: `data/**`
- Last Updated: 2025-10-30T00:46:00Z
- Key Files:
  - `data/pokemon.json` / `data/effects.json` - Runtime cache payloads hydrated by workers.
  - `data/bootstrap/dex.min.json`, `moves.min.json`, `version.json` - Bootstrap bundles for dex seeding/backfill scripts.
  - `data/README.md` - Documents cache-worker expectations.
- Notes:
  - Cache workers regenerate these files; keep structure intact for automation.

### Documentation Library (`docs/ROUTER.md`)
- Purpose: Central hub for architecture, safety, and operational guidance.
- Owned Globs: `docs/**`
- Last Updated: 2025-10-30T00:46:00Z
- Key Documents:
  - `docs/architecture.md` / `docs/operations.md` - System overview and day-to-day ops.
  - `docs/database-systems.md` / `docs/db-control-suite.md` - Database topology and tooling.
  - `docs/perfect-system-roadmap.md` - Long-range governance/automation plan feeding Phase 12 tasks.
  - `docs/meta-router.md` - Routing philosophy, coverage expectations, and guard workflow links.
- Notes:
  - Cross-link new guides from Prompt and this table to keep navigation consistent.

### Operational Playbooks (`playbooks/ROUTER.md`)
- Purpose: Escalation and recovery procedures when automation stalls.
- Owned Globs: `playbooks/**`
- Last Updated: 2025-10-30T00:46:00Z
- Key Documents:
  - `playbooks/escalate.md` - Escalation checklist once self-healing exhausts options.
- Notes:
  - Pair with `ops/RECOVERY.yaml` to capture state before escalation.

### Prisma Schema & Migrations (`prisma/ROUTER.md`)
- Purpose: Prisma data model and migration history.
- Owned Globs: `prisma/**`
- Last Updated: 2025-10-30T00:46:00Z
- Key Files:
  - `prisma/schema.prisma` - Canonical data model for runtime and tooling.
  - `prisma/migrations/*/migration.sql` - Deterministic migration bundles applied via `prisma migrate deploy`.
  - `prisma/migrations/migration_lock.toml` - Prisma migration lock state.
- Notes:
  - Follow `ops/DB_BOOTSTRAP.md` before applying migrations to staging/production.

### Meta Router Implementation (`router/ROUTER.md`)
- Purpose: TypeScript router that assigns tasks to specialist agents.
- Owned Globs: `router/**`
- Last Updated: 2025-10-30T00:46:00Z
- Key Files:
  - `router/metaRouter.ts` - Event-driven router with recovery heuristics (shrink step → swap strategy → reset).
- Notes:
  - Extend registry wiring when introducing new agent roles; emits JSONL telemetry for observability.

### Secret Template Store (`secrets/ROUTER.md`)
- Purpose: Environment template files for local development.
- Owned Globs: `secrets/**`
- Last Updated: 2025-10-30T00:46:00Z
- Key Files:
  - `secrets/prisma-accelerate.env.example` / `secrets/prisma-dev.env.example` - Credential templates for Accelerate and local Prisma URLs.
  - `secrets/README.md` - Instructions for copying templates to a secure location and configuring `IG_ENV_FILE`.
- Notes:
  - Never commit filled-in secret files; copy templates outside the repo.

### Sync Layer Prototype (`sync-layer/ROUTER.md`)
- Purpose: Experimental sync services for mirroring Discord/game data.
- Owned Globs: `sync-layer/**`
- Last Updated: 2025-10-30T00:46:00Z
- Subdirectories:
  - `sync-layer/discord/` - Sync client and hooks that watch Discord events.
  - `sync-layer/worker/` - Worker entries (`api-server`, `commit-deltas`, `indexer`) plus JSON schemas.
  - `sync-layer/data/` - Manifest files describing synced objects.
  - `sync-layer/shared/` - Shared helpers (IO, logging) for the sync workers.
- Notes:
  - Isolated from production runtime; treat as evolving prototype.

### Tooling Binaries & Helpers (`tools/ROUTER.md`)
- Purpose: Vendored Postgres binaries required for local recovery scripts.
- Owned Globs: `tools/**`
- Last Updated: 2025-10-30T00:46:00Z
- Key Assets:
  - `tools/pgsql17/pgsql/bin/*` - Postgres command-line utilities (psql, pg_dump, pg_restore, pg_upgrade, etc.) plus supporting DLLs.
- Notes:
  - Keep binaries untouched unless updating per the DB bootstrap runbook; document checksum changes in ops docs.

### Legacy Cache Builders (`src/cache/ROUTER.md`)
- Purpose: CommonJS cache builders that publish PokeAPI mirrors.
- Owned Globs: `src/cache/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `src/cache/index.js` - Orchestrates cloning the cache repo and publishing refreshed JSON.
  - `src/cache/pokemonCache.js` - Builds minimal Pokemon payloads for cache distribution.
  - `src/cache/gitStore.js` - Git helpers for clone/commit/push.
- Notes:
  - Retained for compatibility while the TypeScript data pipeline matures.
### Legacy Slash Command Handlers (`src/commands/ROUTER.md`)
- Purpose: CommonJS command implementations predating the TypeScript port.
- Owned Globs: `src/commands/**`
- Last Updated: 2025-10-30T00:47:00Z
- Representative Commands:
  - `battle.js` / `battle-turn.js` - Battle challenge flow and per-turn execution.
  - `home.js` / `starter.js` / `daily.js` / `heal.js` - Player onboarding and daily maintenance.
  - `dex.js` / `move.js` / `weak.js` / `calc.js` - Pokedex lookups and matchup utilities.
  - `ops.js` - Administrative `/ops` command logic.
- Notes:
  - Keep stable until all flows migrate to `src/bot/commands/**`.
### Legacy Environment Config (`src/config/ROUTER.md`)
- Purpose: CommonJS environment loader used by legacy modules.
- Owned Globs: `src/config/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `src/config/env.js` - Legacy env bootstrap referenced by non-TypeScript modules.
  - `src/config/env.d.ts` - Ambient types ensuring compatibility with TypeScript callers.
- Notes:
  - Mirror updates from `src/shared/config.ts` to avoid divergence.

### Data Pipeline (`src/data_pipeline/ROUTER.md`)
- Purpose: Ingest and validate Pokemon reference datasets.
- Owned Globs: `src/data_pipeline/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `src/data_pipeline/index.ts` - Entry point invoked by `npm run data:build`.
  - `src/data_pipeline/schema/*.ts` - Zod schemas for abilities, moves, species, type chart, and manifest metadata.
- Notes:
  - Regenerate caches after schema changes to keep data and tests aligned.

### Event Bus & Battle Engine Primitives (`src/engine/ROUTER.md`)
- Purpose: Shared mechanics for battle calculations and worker orchestration.
- Owned Globs: `src/engine/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `src/engine/bus.ts` / `worker.ts` - Event bus and worker bootstrap helpers.
  - `src/engine/calc.js`, `effects.js`, `stats.js`, `tables.js`, `types.js`, `turn.js`, `rng.js` - Legacy battle math modules.
- Notes:
  - PBSL oracle tests depend on these calculations; avoid silent drift.

### Environment Utilities (`src/env/ROUTER.md`)
- Purpose: Validate database configuration at startup.
- Owned Globs: `src/env/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `src/env/ensure-db-url.ts` - Guards against missing or unsafe DATABASE_POOL_URL / DATABASE_DIRECT_URL settings.
- Notes:
  - Imported by runtime entrypoints before Prisma connects.

### Shared Library Helpers (`src/lib/ROUTER.md`)
- Purpose: Legacy utilities consumed by command handlers and cache builders.
- Owned Globs: `src/lib/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `src/lib/assets.js` - Resolves asset paths for embeds.
  - `src/lib/cooldown.js` - Cooldown tracking helpers.
  - `src/lib/dex-api.js` - Fetch helpers for external PokeAPI calls.
  - `src/lib/type-colors.js` - Maps Pokemon types to embed colors.
- Notes:
  - Prefer new utilities in `src/shared/**` when porting features.
### Prisma Data Models (`src/models/ROUTER.md`)
- Purpose: Typed Prisma access and re-exports.
- Owned Globs: `src/models/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `src/models/index.ts` - Prisma client singleton and helper exports.
- Notes:
  - Update alongside schema changes and runtime access patterns.

### Service Layer Helpers (`src/services/ROUTER.md`)
- Purpose: Bridge cached data and presentation flows.
- Owned Globs: `src/services/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `src/services/pokemonService.js` / `.d.ts` - Pokemon lookup service for commands and DM flows.
  - `src/services/cache.js` - Cache hydration wrapper.
  - `src/services/home-bundle.ts` - Bundles DM home state for renderers.
- Notes:
  - Maintain declaration files until services are fully ported to TypeScript.

### Ambient Type Declarations (`src/types/ROUTER.md`)
- Purpose: Provide typings for external modules lacking TypeScript support.
- Owned Globs: `src/types/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `src/types/prisma-accelerate.d.ts` - Declares Prisma Accelerate extension types.
- Notes:
  - Refresh when upgrading Prisma Accelerate APIs.

### Utility Helpers (`src/utils/ROUTER.md`)
- Purpose: Cross-cutting utilities for logging, CLI status, and ops helpers.
- Owned Globs: `src/utils/**`
- Last Updated: 2025-10-30T00:47:00Z
- Key Files:
  - `src/utils/cliStatus.js` / `.d.ts` - CLI dashboard used by runtime monitors.
  - `src/utils/fatalErrorGuard.js` - Process-level error guard for bot/worker entries.
  - `src/utils/logger.js` / `.d.ts` - Logging abstraction for legacy modules.
  - `src/utils/opsNotifier.js` / `timezone.js` - Ops alert helpers and timezone utilities.
  - `src/utils/activityTracker.js` - Rate limiting/activity tracking helper.
- Notes:
  - New implementations should prefer `src/shared/log.ts` and related helpers when possible.







