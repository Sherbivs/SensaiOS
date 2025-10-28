# Master Router Table
Last Updated (UTC): 2025-10-28T06:45:00Z
Purpose: Text-only reference of every router, its downstream routers, and the primary files/routes they cover for hotfix navigation when automation is unavailable.

## Router-of-Routers
- `ops/ROUTER_INDEX.yaml` — Generated index of active routers. Start here to locate downstream routers quickly.
- `ops/ROUTER.yaml` — Canonical route map. Markerless Mode is documented in `ops/CRITICAL.md`; even when contracts are OFF, do not remove routers.
  - Routes:
    - `ops/ROUTER.md` — Ops & Governance
    - `scripts/ROUTER.md` — Dev & Docs Scripts (includes bootstrap_staging_db.ps1 helper)
    - `src/ROUTER.md` — Application Source
    - `src/shared/ROUTER.md` — Shared Runtime & Utilities
    - `src/worker/ROUTER.md` — Background Workers
    - `src/bot/ROUTER.md` — Discord Bot Layer
    - `src/core/ROUTER.md` — Core Game Engines
    - `tests/ROUTER.md` — Test Suite

## Router Details

### Ops & Governance (`ops/ROUTER.md`)
- Purpose: Canonical operational control-plane (NEXT pointer, CRITICAL, TOUCHMAP, router maps, inbox).
- Owned Globs: `ops/**`
- Last Updated: 2025-10-28T06:40:00Z
- Key References:
  - `ops/NEXT.yaml` — next task pointer (READY pointer must exist on exit)
  - `ops/CRITICAL.md` — fast-path guardrails + Markerless guidance
  - `ops/ROUTER.yaml` — canonical path map
  - `ops/ROUTER_INDEX.yaml` — router-of-routers manifest
  - `ops/INBOX/notes.md` — operator notes
  - `ops/RECOVERY.yaml` — resume metadata
  - `ops/CANONICAL_NAMES.yaml` — router/document casing guard
  - `ops/ARCHIVE/README.md` — Tasklist archival guidance
  - `ops/DB_BOOTSTRAP.md` — staging schema bootstrap runbook
- Notes:
  - 2025-10-27: Router maps now track PBSL oracle fixtures and DRIP role assignment alerts; audit recorded in ops/ROUTER.md.
  - 2025-10-28: Added DB bootstrap runbook and helper script to router inventory.

### Dev & Docs Scripts (`scripts/ROUTER.md`)
- Purpose: Repository automation (ledger, router index, refresh, archiving, guards).
- Owned Globs: `scripts/**`
- Last Updated: 2025-10-28T06:42:00Z
- Key Scripts:
  - `scripts/update_change_ledger.sh` — regenerate Prompt change ledger
  - `scripts/update_router_index.sh` — rebuild `ops/ROUTER_INDEX.yaml`
  - `scripts/refresh_vision.sh` — refresh routers + recovery metadata
  - `scripts/archive_task_history.mjs` — archive Tasklist history to `ops/ARCHIVE/`
  - `scripts/verify_router_links.sh` — canonical path guard (CI)
  - `scripts/hotfix_entry.sh` — hotfix checklist helper
  - `scripts/guard_meta.sh` — enforces READY invariants pre/post flight
  - `scripts/bootstrap_staging_db.ps1` — interactive helper to run `prisma migrate deploy` on staging safely
- Notes:
  - 2025-10-27: Router scripts audited; verify_router_links and update_router_index keep meta routers synchronized during PBSL work.
  - 2025-10-28: Added staging bootstrap helper to tooling catalog.

### Application Source (`src/ROUTER.md`)
- Purpose: Root TypeScript source tree; delegates to domain routers.
- Owned Globs: `src/**`
- Last Updated: 2025-10-27T08:45:00Z
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
        - Background worker drains the Prisma outbox and publishes health diagnostics.

### Shared Runtime & Utilities (`src/shared/ROUTER.md`)
- Purpose: Centralized runtime config, Prisma bootstrap, logging, caching, and shared outbox helpers.
- Owned Globs: `src/shared/**`
- Last Updated: 2025-10-27T08:45:00Z
- Key Files:
        - `config.ts` — `loadConfig()` promotes Render internal URLs and enforces runtime invariants.
        - `prisma.ts` — singleton Prisma client with early `$connect()` and URL validation.
        - `cache/memory.ts` — default TTL cache backing bots and workers.
        - `outbox.ts` — enqueue/dequeue helpers for `OutboxMessage` records.
        - `log.ts` — structured logger leveraging shared runtime metadata.
- Last Task ID: META.RUNTIME.BLUEPRINT_APPLY

### Background Workers (`src/worker/ROUTER.md`)
- Purpose: Render-bound loops that drain the outbox and run offline jobs.
- Owned Globs: `src/worker/**`
- Last Updated: 2025-10-27T08:45:00Z
- Key Files:
        - `backup.ts` — Render worker that polls the outbox, logs health, and prepares backup sinks.
- Last Task ID: META.RUNTIME.BLUEPRINT_APPLY

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
