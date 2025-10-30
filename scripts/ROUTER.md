# ROUTER
Title: Tooling
Purpose: Guard scripts and automation entrypoints.
Owned Globs: scripts/**
Last Updated (UTC): 2025-10-30T20:15:00Z

Notes:
- guard_meta.sh enforces READY invariants. Called in CI preflight/postflight.
- When POSTFLIGHT=1 it hard-fails on missing READY or NONE NEXT to keep merges safe.
- 2025-10-26: guard_meta detects the marker switch, relaxes contracts in Markerless Mode, and still enforces Absolutes.
- 2025-10-27: verify_router_links.sh and update_router_index.sh keep router docs synchronised after PBSL oracle additions.
- 2025-10-28: Documented bootstrap_staging_db.ps1 for staging schema prep and referenced it in ops router metadata.
- 2025-10-28: update_change_ledger.sh / update_change_ledger_unix.sh now exec the Node helper for consistent ledger generation across shells.
- 2025-10-29: Added `restore_prisma_postgres.ps1` to automate Prisma Postgres imports and `db_smoke.ts` for Accelerate smoke tests.
- 2025-10-29: `sync_accelerate_to_render.ps1` ships the Accelerate→Render refresh workflow and `guard_router_docs.sh` enforces generated router docs stay command-generated.
- 2025-10-29: Introduced `setup_ai_env.ps1` to register `IG_ENV_FILE` for agent/automation runs while keeping secrets outside the repo.
- 2025-10-29: Added `db_admin.ts` (run via `npm run db:cli`) as the master database control suite for status inspections and ad-hoc queries.
- 2025-10-30: Added `guard_db_docs.mjs` + CI workflow to fail when DB connection docs drift on Key/Dev, Key/Prod, or Prisma regenerate guidance.
- 2025-10-30: Added `dev_prod_auto_sync.ts` (`npm run db:auto-sync`) to consolidate on deployment and poll every five minutes for drift before replaying the Dev → Prod → Dev migration/seed cadence.
- 2025-10-30: Added `seed_dex.ts` (`npm run db:seed:dex`) to populate Pokédex reference tables and refresh `SpeciesSheet`.
