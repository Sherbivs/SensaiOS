# ROUTER
Title: Ops Scripts
Purpose: Operator helpers that wrap multi-step deployment or migration flows.
Owned Globs: scripts/ops/**
Last Updated (UTC): 2025-11-01T17:30:00Z

Notes:
- `run_dex_migrations.ps1` switches IG_ENV_FILE to the Accelerate secrets set, runs staged migrations, then logs remediation hints.
- Extend this directory with additional operator entrypoints rather than crowding scripts/ root; document new flows in ops/ runbooks.

Linked Routers:
- scripts/ROUTER.md — Parent routing index for automation scripts.
- ops/ROUTER.md — Operational runbooks referencing these helpers.
- ops/DB_BOOTSTRAP.md — Runbook pairing with migration/deploy scripts.
