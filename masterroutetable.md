# Master Router Table
Last Updated (UTC): 2025-10-29T19:10:00Z
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
	- `tests/battle_engine.spec.ts` — deterministic battle engine coverage
	- `tests/battle_flow.spec.ts` — arena flow integration tests
	- `tests/daily.spec.ts` — daily quest claim success and cooldown guard rails
	- `tests/ops.spec.ts` — `/ops` admin command scenarios (limit/after/participant)
	- `tests/data_pipeline.spec.ts` — reference data validation
	- `tests/encounter_walk.spec.ts` — wild encounter flow
- Notes:
	- 2025-10-27: PBSL oracle diff suite compares fixtures under tests/pbsl/** for deterministic regressions.
