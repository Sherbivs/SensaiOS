# ROUTER
Title: Ops & Governance
Purpose: Canonical operational control-plane (NEXT, CRITICAL, TOUCHMAP, router maps, inbox).
Owned Globs: ops/**
Last Updated (UTC): 2025-10-28T06:40:00Z

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

Key Files:
- ops/NEXT.yaml — execution pointer
- ops/CRITICAL.md — policies & guardrails
- ops/ROUTER.yaml — canonical path map
- ops/ROUTER_INDEX.yaml — router-of-routers (generated)
- ops/INBOX/notes.md — quick notes
- ops/RECOVERY.yaml — resume after timeout
- ops/ARCHIVE/README.md — guidance for Tasklist history offload
- ops/CANONICAL_NAMES.yaml — canonical doc/router spellings for CI guard

