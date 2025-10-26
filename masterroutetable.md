# Master Router Table
Last Updated (UTC): 2025-10-26T14:20:00Z
Purpose: Text-only reference of every router, its downstream routers, and the primary files/routes they cover for hotfix navigation when automation is unavailable.

## Router-of-Routers
- `ops/ROUTER.yaml` — Canonical route map. Start here to locate routers before consulting generated indexes. Markerless Mode is documented in `ops/CRITICAL.md`; even when contracts are OFF, do not remove routers.
- `ops/ROUTER_INDEX.yaml` — Generated index of active routers.
	- Routes:
		- `ops/ROUTER.md` — Ops & Governance
		- `scripts/ROUTER.md` — Dev & Docs Scripts
		- `src/ROUTER.md` — Application Source
		- `src/bot/ROUTER.md` — Discord Bot Layer
		- `src/core/ROUTER.md` — Core Game Engines
		- `tests/ROUTER.md` — Test Suite

## Router Details

### Ops & Governance (`ops/ROUTER.md`)
- Purpose: Canonical operational control-plane (NEXT pointer, CRITICAL, TOUCHMAP, router maps, inbox).
- Owned Globs: `ops/**`
- Last Updated: 2025-10-26T13:45:00Z
- Key References:
	- `ops/NEXT.yaml` — next task pointer
	- `ops/CRITICAL.md` — fast-path guardrails
	- `ops/ROUTER.yaml` — canonical path map
	- `ops/ROUTER_INDEX.yaml` — router-of-routers manifest
	- `ops/INBOX/notes.md` — operator notes
	- `ops/RECOVERY.yaml` — resume metadata
	- `ops/CANONICAL_NAMES.yaml` — router/document casing guard
	- `ops/ARCHIVE/README.md` — Tasklist archival guidance

### Dev & Docs Scripts (`scripts/ROUTER.md`)
- Purpose: Repository automation (ledger, router index, refresh, archiving, guards).
- Owned Globs: `scripts/**`
- Last Updated: 2025-10-26T02:05:00Z
- Key Scripts:
	- `scripts/update_change_ledger.sh` — regenerate Prompt change ledger
	- `scripts/update_router_index.sh` — rebuild `ops/ROUTER_INDEX.yaml`
	- `scripts/refresh_vision.sh` — refresh routers + recovery metadata
	- `scripts/archive_task_history.mjs` — archive Tasklist history to `ops/ARCHIVE/`
	- `scripts/verify_router_links.sh` — canonical path guard (CI)
	- `scripts/hotfix_entry.sh` — hotfix checklist helper

### Application Source (`src/ROUTER.md`)
- Purpose: Root TypeScript source tree; delegates to domain routers.
- Owned Globs: `src/**`
- Last Updated: 2025-10-26T00:45:00Z
- Downstream Routers:
	- `src/bot/ROUTER.md` — Discord bot interactions
	- `src/core/ROUTER.md` — core battle/encounter engines
- Supporting Files:
	- `src/index.ts` — application entry (Discord + Prisma bootstrap)
	- `src/shared/**` — shared config, logging, utilities

### Discord Bot Layer (`src/bot/ROUTER.md`)
- Purpose: Discord client bootstrap, slash commands, DM flows, arena threads, admin ops.
- Owned Globs: `src/bot/**`
- Last Updated: 2025-10-26T06:45:00Z
- Areas & Key Files:
	- `src/bot/index.ts` — Discord client bootstrap & routing
	- `src/bot/dm/**` — DM home, starter selection, healing, drip alerts
	- `src/bot/commands/**` — Slash command registration (e.g., `src/commands/ops.js`)
	- `src/bot/wilds/**` — encounter controls
	- `src/bot/battle/**` — arena threads, announcer summaries
	- `src/bot/ops/admin.ts` — `/ops` admin command handlers (stats, cooldown reset)

### Core Game Engines (`src/core/ROUTER.md`)
- Purpose: Deterministic battle and encounter mechanics.
- Owned Globs: `src/core/**`
- Last Updated: 2025-10-25T11:10:00Z
- Areas & Representative Files:
	- `src/core/battle/**` — engine wrappers, damage calculations, status effects
	- `src/core/encounter/**` — spawn/walk logic
	- Shared math/utilities referenced by `src/bot/**` during battles and encounters

### Test Suite (`tests/ROUTER.md`)
- Purpose: Vitest suites covering schemas, data pipeline, battle engines, DM flows, ops tooling.
- Owned Globs: `tests/**`
- Last Updated: 2025-10-26T06:45:00Z
- Representative Specs:
	- `tests/battle_engine.spec.ts` — deterministic battle engine coverage
	- `tests/battle_flow.spec.ts` — arena flow integration tests
	- `tests/ops.spec.ts` — `/ops` admin command scenarios (limit/after/participant)
	- `tests/data_pipeline.spec.ts` — reference data validation
	- `tests/encounter_walk.spec.ts` — wild encounter flow
