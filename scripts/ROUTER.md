# ROUTER
Title: Tooling
Purpose: Guard scripts and automation entrypoints.
Owned Globs: scripts/**
Last Updated (UTC): 2025-10-28T06:42:00Z

Notes:
- guard_meta.sh enforces READY invariants. Called in CI preflight/postflight.
- When POSTFLIGHT=1 it hard-fails on missing READY or NONE NEXT to keep merges safe.
- 2025-10-26: guard_meta detects the marker switch, relaxes contracts in Markerless Mode, and still enforces Absolutes.
- 2025-10-27: verify_router_links.sh and update_router_index.sh keep router docs synchronised after PBSL oracle additions.
- 2025-10-28: Documented bootstrap_staging_db.ps1 for staging schema prep and referenced it in ops router metadata.
- 2025-10-28: update_change_ledger.sh / update_change_ledger_unix.sh now exec the Node helper for consistent ledger generation across shells.
