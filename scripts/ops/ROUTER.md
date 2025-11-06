# ROUTER
Title: Ops Scripts
Purpose: Operator helpers that wrap multi-step deployment or migration flows.
Owned Globs: scripts/ops/**
Last Updated (UTC): 2025-11-05T02:10:00Z

Notes:
- `run_dex_migrations.ps1` switches IG_ENV_FILE to the Accelerate secrets set, runs staged migrations, then logs remediation hints.
- `dex_v2_backup.ts` wraps `pg_dump -Fc` with env-file loading, output naming, and dry-run support (`npm run ops:dex-v2-backup`).
- `simulate_flag_rollout.ts` emits JSON payloads for the canary ladder, optional webhook announcements, and config-service submissions (`npm run ops:simulate-flag`).
- `dex_v2_alert_dry_run.ts` dispatches Grafana-style webhook previews to validate canary alert routing (`npm run ops:dex-v2-alert-dry-run`).
- `bootstrap_local_fallback.ts` hydrates the Store-backed Postgres mirror from the DEV database and ensures `local-url.txt` is written for Prisma fallback (`npm run ops:bootstrap-local-db`).
- Extend this directory with additional operator entrypoints rather than crowding scripts/ root; document new flows in ops/ runbooks.

Linked Routers:
- scripts/ROUTER.md — Parent routing index for automation scripts.
- ops/ROUTER.md — Operational runbooks referencing these helpers.
- ops/DB_BOOTSTRAP.md — Runbook pairing with migration/deploy scripts.
