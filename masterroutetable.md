# Master Router Table
Last Updated (UTC): 2025-02-26T00:00:00Z
Purpose: Text-only reference of every router, its downstream routers, and the primary files/routes they cover for hotfix navigation when automation is unavailable.
Muted callouts note local-only tooling that never ships to prod/cloud runtimes.

## Router-of-Routers
- `ops/ROUTER_INDEX.yaml` — Generated index of active routers. Start here to locate downstream routers quickly.
- `ops/ROUTER.yaml` — Canonical route map. Markerless Mode is documented in `ops/CRITICAL.md`; even when contracts are OFF, do not remove routers.
  - Routes:
  - `ops/ROUTER.md` — Ops & Governance
    - `ops/ARCHIVE/ROUTER.md` — Tasklist archive snapshots (read-only history)
    - `ops/INBOX/ROUTER.md` — Operator inbox notes pending Tasklist promotion
    - `scripts/ROUTER.md` — Dev & Docs Scripts (includes bootstrap_staging_db.ps1 helper)
    - `src/ROUTER.md` — Application Source
    - `ops/DB_IMPORT_PRISMA_POSTGRES.md` — Prisma Postgres import runbook for Accelerate migrations
  - `ops/POKEMON_CACHE.md` — PokeAPI integration & cache operations runbook
    - `outbox.ts` now wraps the event bus helpers so legacy drains can enqueue/claim messages while handlers migrate.
    - `worker-runtime.ts` centralizes worker lifecycle helpers (shutdown hooks, repeating tasks) for outbox/cache/data pipeline entries.
    - `log.ts` remains the structured logger, consuming the shared runtime config.
  - `src/bot/ROUTER.md` — Discord Bot Layer
    - `src/bot/arena/ROUTER.md` — Arena threads and announcer summaries
    - `src/bot/battle/ROUTER.md` — Battle interaction handlers
    - `src/bot/daily/ROUTER.md` — Daily quest claim flow
    - `src/bot/dm/ROUTER.md` — DM home, heal, and starter flows
    - `src/bot/middleware/ROUTER.md` — Command guardrails and limits
    - `src/bot/ops/ROUTER.md` — `/ops` admin command surface
    - `src/bot/wilds/ROUTER.md` — Walk/catch encounter handlers
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
  - `scripts/guards/ROUTER.md` — Guard entrypoints
  - `scripts/ops/ROUTER.md` — Operator automation scripts
- `src/services/ROUTER.md` — Service Layer Helpers
  - `src/services/cache/ROUTER.md` — Cache facade + recipes
- `src/shared/ROUTER.md` — Shared Runtime & Utilities
  - `src/shared/cache/ROUTER.md` — Cache backends (memory/LRU)
  - `src/shared/storage/ROUTER.md` — Durable storage adapters
- `sync-layer/ROUTER.md` — Sync Layer Prototype
  - `sync-layer/data/ROUTER.md` — Stored JSON manifests mirrored by the prototype
  - `sync-layer/discord/ROUTER.md` — Discord watchers emitting sync payloads
    - `sync-layer/discord/hooks/ROUTER.md` — Event-specific Discord hooks
  - `sync-layer/shared/ROUTER.md` — Shared IO/logging helpers
  - `sync-layer/worker/ROUTER.md` — Worker entries applying payloads
    - `sync-layer/worker/schema/ROUTER.md` — JSON schemas validating payloads
- `tools/ROUTER.md` — Tooling Binaries & Helpers
  - `tools/pgsql17/ROUTER.md` — Vendored Postgres client bundle
    - `tools/pgsql17/pgsql/ROUTER.md` — Bundle root metadata
    - `tools/pgsql17/pgsql/bin/ROUTER.md` — CLI binaries and usage notes
- `discord-pokemon-bot/ROUTER.md` — Legacy Discord Bot Package
  - `discord-pokemon-bot/battles/ROUTER.md` — Legacy battle scaffolding
  - `discord-pokemon-bot/data/ROUTER.md` — Legacy fixture placeholders
  - `discord-pokemon-bot/scripts/ROUTER.md` — Legacy build scripts
  - `discord-pokemon-bot/utils/ROUTER.md` — Legacy helper archive

## Muted Local Files
- `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env` — Muted (DEV Postgres secrets); set `IG_ENV_FILE` here for local and staging work. Keep the repo `.env` empty.
- `C:/Users/sherb/OneDrive/Documents/Key/Prod/.env` — Muted (Accelerate/production credentials); repoint `IG_ENV_FILE` here only when working against Prisma Accelerate and run `npx prisma generate` before returning to Dev so the client drops the Accelerate proxy.
- `docs/db-control-suite.md` — Muted (local operator guide); documents `npm run db:cli` usage for dev DB checks.
- `docs/ai-env-setup.md` — Muted (local env instructions); covers `IG_ENV_FILE` setup for agents.

### Dev & Docs Scripts (`scripts/ROUTER.md`)
- Purpose: Repository automation (ledger, router index, refresh, archiving, guards).
- Owned Globs: `scripts/**`
- Last Updated: 2025-11-02T14:05:00Z
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
  - `scripts/dev_prod_auto_sync.ts` — Muted (automation loop); ensures migrate/seed inherit env-specific credentials, forces direct migrations, times out hung commands, preflights Optimize SpeciesSheet access, watches `data/cache/dex-sync-trigger.json`, and continuously runs the Dev → Prod → Dev cadence with integrity checks (`npm run db:auto-sync`)
  - `scripts/build_dexpack.ts` — Deterministic dexpack builder emitting committed JSON + gzip assets (`npm run data:dexpack`)
- Sub-Routers:
  - `scripts/dex/ROUTER.md` — dex backfill/seed/warm helpers
  - `scripts/guards/ROUTER.md` — CI guard entrypoints (require ensure-db preload, etc.)
  - `scripts/ops/ROUTER.md` — operator automation (e.g., run_dex_migrations.ps1)
- Notes:
  - 2025-10-27: Router scripts audited; verify_router_links and update_router_index keep meta routers synchronized during PBSL work.
  - 2025-10-28: Added staging bootstrap helper to tooling catalog.
  - 2025-10-29: Added Accelerate restore + smoke scripts to support Prisma Postgres migrations.
  - 2025-10-30: Added Dev ↔ Prod auto-sync loop to kick on deployment, poll every five minutes, and surface drift via JSON logs.
  - 2025-11-01: Broke out dex automation, guard entrypoints, and ops scripts into dedicated sub-routers for faster discovery.
  - 2025-11-02: Added dexpack build + guard tooling so committed pack artifacts stay deterministic across branches.

### Ops Archive (`ops/ARCHIVE/ROUTER.md`)
- Purpose: Read-only snapshots of Tasklist history and supporting meta exports.
- Notes: Populate via `scripts/archive_task_history.mjs`; avoid manual edits so provenance stays intact.

### Ops Inbox (`ops/INBOX/ROUTER.md`)
- Purpose: Fast notes queue for operators; guard scripts compare its timestamp to `ops/NEXT.yaml.last_notes_read_utc`.
- Notes: Move resolved items into Tasklist or archive them to keep the inbox actionable.

### Prisma Migrations (`prisma/migrations/ROUTER.md`)
- Purpose: Timestamped Prisma migration bundles plus `migration_lock.toml` state.
- Notes: Follow `ops/DB_BOOTSTRAP.md` before applying new migrations; record rollout evidence in Tasklist notes.
- Sub-Routers:
  - `prisma/migrations/202510280500_scaling_indexes/ROUTER.md` — Adds scaling indexes and composite uniqueness guards for battle, encounter, cooldown tables.
  - `prisma/migrations/202510290930_dex_reference_spine/ROUTER.md` — Introduces normalized dex reference spine, supporting extensions, and SpeciesSheet matview.
  - `prisma/migrations/202511010900_schema_constraints/ROUTER.md` — Tightens relational constraints, formalizes OutboxStatus enum, and adds updatedAt defaults.

### Dex Automation (`scripts/dex/ROUTER.md`)
- Purpose: Helpers (`backfill_species.ts`, `seed_reference.ts`, `warm_cache.ts`) used during dex seeding and rehearsals.
- Notes: Coordinate schema changes with the data pipeline and Prisma migrations before re-running seeds.

### Guard Entry Points (`scripts/guards/ROUTER.md`)
- Purpose: Hardened guard wrappers (e.g., `require-ensure-db-preload.mjs`) consumed by CI and local guard scripts.
- Notes: Keep outputs terse so developers can remediate failures quickly.
- Latest: `guard_auto_sync.sh` provides a `--ci --dry-run` auto-sync check so missing secrets or dex trigger metadata fail before deployment.
- Latest: `dev_prod_auto_sync.ts` now pushes webhook embeds (`ALERT_WEBHOOK_URL`) whenever `integrity.alert` fires after consolidation, suppressing duplicates until counts change.
- Latest: `guard_dexpack.sh` runs the dexpack builder in verification mode (`npm run guard:dexpack`) so committed assets stay in sync.

### Operator Scripts (`scripts/ops/ROUTER.md`)
- Purpose: PowerShell helpers such as `run_dex_migrations.ps1` for environment-specific deploy flows.
- Notes: Document usage in ops runbooks when adding new operator automation.

### Data Pipeline Schemas (`src/data_pipeline/schema/ROUTER.md`)
- Purpose: Zod validators for dataset outputs (`abilities`, `moves`, `species`, `typechart`, `manifest`).
- Notes: Update alongside `data/bootstrap/**` and consumers when introducing breaking schema changes.

### Generated Assets (`assets/ROUTER.md`)
- Purpose: Committed build outputs (dexpack JSON + gzip) consumed by the bot, engine, and guards.
- Notes: Regenerate via `npm run data:dexpack`; verify consistency in CI with `npm run guard:dexpack` so artifacts stay deterministic.
- Files: `assets/dexpack.v1.json`, `assets/dexpack.v1.json.gz`.

### Service Cache Recipes (`src/services/cache/ROUTER.md`)
- Purpose: Cache facade + namespace recipes powering battle, encounter, and quest flows.
- Notes: Emit `/ops cache` updates when introducing new namespaces so operators can monitor hit/miss metrics.

### Shared Cache Backends (`src/shared/cache/ROUTER.md`)
- Purpose: Memory + LRU implementations that back the facade.
- Notes: Tune TTL or capacity limits here when adjusting runtime budgets.

### Shared Storage Integrations (`src/shared/storage/ROUTER.md`)
- Purpose: Durable sink adapters (currently `backup-sink.ts`) reused across workers.
- Notes: Add new providers here instead of embedding storage logic inside command handlers.

### Sync Layer Prototype (`sync-layer/ROUTER.md`)
- Purpose: Experimental Discord/worker sync utilities that mirror data into JSON manifests.
- Owned Globs: `sync-layer/**`
- Last Updated: 2025-11-01T19:30:00Z
- Areas & Key Files:
  - `sync-layer/discord/**` — Lightweight Discord client + hooks emitting sync payloads; see `sync-layer/discord/ROUTER.md`
  - `sync-layer/discord/hooks/**` — Event-specific Discord hook implementations; see `sync-layer/discord/hooks/ROUTER.md`
  - `sync-layer/worker/**` — Prototype workers ingesting payloads; see `sync-layer/worker/ROUTER.md`
  - `sync-layer/worker/schema/**` — JSON schemas validating hook output; see `sync-layer/worker/schema/ROUTER.md`
  - `sync-layer/data/**` — JSON manifest snapshots; see `sync-layer/data/ROUTER.md`
  - `sync-layer/shared/**` — Shared IO/logging helpers for the prototype; see `sync-layer/shared/ROUTER.md`
- Notes:
  - Payload shapes must stay in sync across hooks, schemas, and workers; regenerate fixtures when schemas change.
  - This prototype remains isolated from production; document intent in Tasklist before promoting changes.

### Postgres 17 Bundle (`tools/pgsql17/ROUTER.md`)
- Purpose: Vendored Postgres client binaries for local recovery and migration workflows.
- Notes: Treat as read-only; document checksums when upgrading the bundle per `ops/DB_BOOTSTRAP.md`.
- Sub-Routers:
  - `tools/pgsql17/pgsql/ROUTER.md` — Bundle root metadata (read-only)
  - `tools/pgsql17/pgsql/bin/ROUTER.md` — CLI binaries used by local scripts

### Legacy Discord Bot Package (`discord-pokemon-bot/ROUTER.md` and sub-routers)
- Purpose: Archived Node implementation retained for archaeology during the TypeScript rewrite.
- Notes: Keep subdirectories empty unless capturing reference fixtures; modern code lives under `src/bot/**`.

### Application Source (`src/ROUTER.md`)
- Purpose: Root TypeScript source tree; delegates to domain routers.
- Owned Globs: `src/**`
- Last Updated: 2025-11-02T14:05:00Z
- Downstream Routers:
  - `src/bot/ROUTER.md` — Discord bot interactions
  - `src/core/ROUTER.md` — core battle/encounter engines
  - `src/data/ROUTER.md` — dexpack loader + helper facade for committed assets
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
  - Dexpack loader (`src/data/dexpack.js`) exposes the committed bundle via lazy helpers shared across CommonJS + TypeScript callers.
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
- Last Updated: 2025-11-02T00:30:00Z
- Areas & Key Files:
  - `src/bot/index.ts` — Discord client bootstrap & routing with ready guards
  - `src/bot/commands/**` — Slash command registration (e.g., `/ops`, `/battle`)
  - `src/bot/dm/**` — DM home (party/box/profile views with pagination), starter selection, healing, drip alerts, daily quests; see `src/bot/dm/ROUTER.md`
  - `src/bot/arena/**` — Arena thread creation and summary helpers; see `src/bot/arena/ROUTER.md`
  - `src/bot/battle/**` — Interaction handlers queuing moves, switches, and forfeits; see `src/bot/battle/ROUTER.md`
  - `src/bot/daily/**` — Daily quest claim logic; see `src/bot/daily/ROUTER.md`
  - `src/bot/middleware/**` — Rate limiting and guardrails; see `src/bot/middleware/ROUTER.md`
  - `src/bot/ops/**` — `/ops` admin command surface; see `src/bot/ops/ROUTER.md`
  - `src/bot/wilds/**` — Walk/catch encounter controls; see `src/bot/wilds/ROUTER.md`
  - `src/bot/main.js` — legacy security bot (role sweeps, DripTVDD alert digest)
  - `src/bot/dripAlerts.js` — DM alert scheduler/dispatcher backing security alerts
- Notes:
  - 2025-10-27: DRIP security alerts now fire on role assignments with audit-log attribution and CLI telemetry.
  - 2025-11-02: DM Home embeds handle party, storage, and profile views with navigation plus safe fallbacks when DMs are disabled.

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
- Last Updated: 2025-11-02T00:30:00Z
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
