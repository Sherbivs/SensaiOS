# ROUTER
Title: Ops Scripts
Purpose: Operator helpers that wrap multi-step deployment or migration flows.
Owned Globs: scripts/ops/**
Last Updated (UTC): 2025-11-01T16:20:00Z

Notes:
- `run_dex_migrations.ps1` switches IG_ENV_FILE to the Accelerate secrets set, runs staged migrations, then logs remediation hints.
- Extend this directory with additional operator entrypoints rather than crowding scripts/ root; document new flows in ops/ runbooks.
