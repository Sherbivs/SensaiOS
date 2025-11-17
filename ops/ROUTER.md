# ROUTER
Title: Ops & Governance
Purpose: Canonical operational control-plane (NEXT, CRITICAL, TOUCHMAP, router maps, inbox).
Owned Globs: ops/**
Last Updated (UTC): 2025-11-06T04:45:00Z

Notes:
- 2025-02-26: Documented dexpack guard coverage; ops/ROUTER.yaml and touchmap now map assets build to T13.DEX.DEXPACK_ROLLOUT.
- 2025-11-06: Local Postgres fallback automation now lives under `scripts/ops/`; `npm run ops:auto-bootstrap-local-db` installs dependencies then refreshes the Store mirror. Docs (AGENTS, OPERATIONS, operations-bible) and ledger entries were updated to reflect the silent install flow.
- 2025-11-01: Added dedicated router for ops/INBOX so operator inbox notes have clear owners.
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
- 2025-10-28: Router maps refreshed to note PBSL oracle fixtures and DRIP role assignment alerts; ops/NEXT.yaml timestamp updated alongside master router table.
- 2025-11-16: Documentation centralized into Bible system (454 → 30 files, 93.4% reduction); all operational guides consolidated into architecture-bible, operations-bible, and development-bible subdirectories.
- 2025-10-30: Documented the DB doc drift guard (`scripts/guard_db_docs.mjs` + guard-db-docs workflow) so ops runbooks stay aligned on Key/Dev, Key/Prod, and Prisma regenerate instructions.
- 2025-10-30: Runtime cache facade instrumentation landed alongside `/ops cache` diagnostics; docs/tests refreshed to surface maintenance scheduler and cleanup triggers.

Key Files:
- ops/NEXT.yaml — execution pointer
- Agents.md — contract-first agent handbook
- ops/ROUTER.yaml — canonical path map
- ops/ROUTER_INDEX.yaml — router-of-routers (generated)
- OPERATIONS.md — operational runbook documenting worker matrix and rollouts
- operations-bible/02-database-operations.md — canonical database architecture, grants, and maintenance guide
- masterroutetable.md — text-first router map for hotfix navigation when automation is unavailable

Subrouters:
- ops/INBOX/ROUTER.md — Operator inbox staging area; sync with NEXT metadata before edits.

