# ROUTER
Title: Ops & Governance
Purpose: Canonical operational control-plane (NEXT, CRITICAL, TOUCHMAP, router maps, inbox).
Owned Globs: ops/**
Last Updated (UTC): 2025-10-30T21:45:00Z

Notes:
- 2025-10-26: guard_meta preflight/postflight make READY absence impossible at merge time; NEXT auto-promotion enabled. See scripts/guard_meta.sh and ops/NEXT.yaml.
- 2025-10-26: Patch contract adds marker switch, clipboard scratch space, and Markerless Mode guidance; guard_meta enforces Absolutes when contracts are OFF.
- 2025-10-26: Canonical meta docs (CRITICAL.md, HOTFIX.md) live under ops/ after cleanup; outdated duplicates were removed.
- 2025-10-26: Hotfix set PATCHSET echo to plain text sentences and refreshed meta bookkeeping.
- 2025-10-26: Hotfix contract now defaults triggerless requests to the Hotfix Engine; meta timestamps refreshed.
- 2025-10-26: Hotfix enforced Markdown formatting for PATCHSET echo metadata and refreshed recovery notes.
- 2025-10-26: Documented hotfix bootstrap template, cleared NEXT to NONE, and refreshed recovery metadata.
- 2025-10-26: Documented Hotfix Engine contract + pointer and updated meta routing notes.
- 2025-10-26: Added T7.4/T7.5 persistence backlog items and repointed NEXT at T7.4.
- 2025-10-25: Router index timestamp refreshed after Render deployment wiring update.
- 2025-10-27: Router maps refreshed to note PBSL oracle fixtures and DRIP role assignment alerts; ops/NEXT.yaml timestamp updated alongside master router table.
- 2025-10-28: Added ops/DB_BOOTSTRAP.md runbook to router index, refreshed timestamps, and mapped staging bootstrap helper for AI operators.
- 2025-10-28: Ledger automation now runs through scripts/update_change_ledger.mjs with cross-shell wrappers delegating via NODE_BIN.
- 2025-10-28: ops/change-ledger.md introduced to house the full 200-entry commit log while Prompt.md carries a 10-entry summary.
- 2025-10-28: Render config split outbox/cache/data-pipeline workers with dedicated SERVICE_NAME metadata and pooled DB URLs.
- 2025-10-28: Security bot moved to dedicated Render worker (`infinity-gauntlet-security`) gated by ENABLE_SECURITY_BOT flag; monitor sections mark disabled state in the main runtime.
- 2025-10-28: OPERATIONS.md now documents the worker matrix, rollout checklist, and recovery toggles (ENABLE_CONTINUOUS_SWEEP, interval envs); master router index regenerated to match.
- 2025-10-28: Added router_docs category in ops/ROUTER.yaml bundling ops/ROUTER.md, ops/ROUTER_INDEX.yaml, and masterroutetable.md for fast navigation.
- 2025-10-29: Prisma Accelerate import documented in `ops/DB_IMPORT_PRISMA_POSTGRES.md`; helper script `scripts/restore_prisma_postgres.ps1` automates tunnel + pg_restore workflow.
- 2025-10-29: Router metadata refreshed to reflect Accelerate-first DB strategy and smoke test script (`scripts/db_smoke.ts`).
- 2025-10-29: Documented PokeAPI integration and cache operations in `ops/POKEMON_CACHE.md`; runtime now depends on axios + node-cron for scheduled refreshes.
- 2025-10-29: Dual-database workflow spelled out in `ops/DB_IMPORT_PRISMA_POSTGRES.md` (primary Accelerate, standby Render, failover playbook) to keep router metadata aligned with new DR posture.
- 2025-10-29: Router contract now requires `npm run docs:update-routers` after metadata edits; generated outputs (`ops/ROUTER_INDEX.yaml`, `masterroutetable.md`) are read-only and guarded by `scripts/guard_router_docs.sh`.
- 2025-10-29: Store the Prisma Accelerate `DATABASE_URL` in `C:/Users/sherb/OneDrive/Documents/Key/Prod/.env` (gitignored path outside the repo) for local migrate deploys; update `.gitignore` to keep any legacy filenames out of version control.
- 2025-10-29: Retired the legacy `discord-pokemon-bot/` prototype; router metadata now points exclusively at the TypeScript surfaces.
- 2025-10-29: Added `docs/database-systems.md` as the canonical database topology and maintenance guide; cross-links from DATA-SCHEMA, OPERATIONS, and DB bootstrap runbooks point here for shared context.
- 2025-10-30: Documented the DB doc drift guard (`scripts/guard_db_docs.mjs` + guard-db-docs workflow) so ops runbooks stay aligned on Key/Dev, Key/Prod, and Prisma regenerate instructions.
- 2025-10-30: Runtime cache facade instrumentation landed alongside `/ops cache` diagnostics; docs/tests refreshed to surface maintenance scheduler and cleanup triggers.

Key Files:
- ops/NEXT.yaml — execution pointer
- ops/CRITICAL.md — policies & guardrails
- Agents.md — contract-first agent handbook
- ops/ROUTER.yaml — canonical path map
- ops/ROUTER_INDEX.yaml — router-of-routers (generated)
- ops/INBOX/notes.md — quick notes
- ops/RECOVERY.yaml — resume after timeout
- ops/ARCHIVE/README.md — guidance for Tasklist history offload
- ops/CANONICAL_NAMES.yaml — canonical doc/router spellings for CI guard
- ops/change-ledger.md — generated 200-entry commit ledger (see Prompt summary)
- OPERATIONS.md — operational runbook documenting worker matrix and rollouts
- docs/database-systems.md — canonical database architecture, grants, and maintenance guide
- masterroutetable.md — text-first router map for hotfix navigation when automation is unavailable
- ops/POKEMON_CACHE.md — PokeAPI integration runbook (cache workflow, incidents, dependencies)

