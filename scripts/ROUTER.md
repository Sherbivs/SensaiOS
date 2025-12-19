# ROUTER
Title: Tooling
Purpose: Guard scripts and automation entrypoints.
Owned Globs: scripts/**
Last Updated (UTC): 2025-11-09T00:00:00Z

Notes:
- 2025-02-26: Added dexpack guard documentation and touchmap pointer; see guards/guard_dexpack.sh.
- 2025-11-01: Documented dex (reference data), guards (CI invariants), and ops (operator helpers) sub-routers for quicker discovery.
- 2025-11-01: guard_routing.sh now unions commit/worktree/untracked changes and trusts META.ROUTER.* tasks when touching ROUTER manifests so routing guard runs clean after the sub-router sweep.
- 2025-11-01: guard_routing.sh exits non-zero when files fall outside the NEXT touch patterns; keep ops/TOUCHMAP.yaml aligned before running guards.
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
- 2025-10-30: Hardened `dev_prod_auto_sync.ts` to inherit env file credentials, force direct migrations, and apply command timeouts.
- 2025-10-30: Linked `fetch_pokemon.mjs` + `dev_prod_auto_sync.ts`—fetcher now writes `dex-sync-trigger.json` and the auto-sync loop performs `dex_trigger` consolidations when that artifact changes.
- 2025-11-01: Added database connectivity smoke tests. Removed obsolete Optimize probe script in Wave 4 cleanup (2025-11-07).
- 2025-11-02: `dev_prod_auto_sync.ts` now dispatches `integrity.alert` payloads to `ALERT_WEBHOOK_URL`, dedupes repeated drifts, and exposes CLI overrides for rehearsals.
- 2025-11-02: Introduced `guard_auto_sync.sh` (`npm run guard:auto-sync`) to verify env secrets and the dex trigger before automation runs.
- 2025-11-02: Added `build_dexpack.ts` (`npm run data:dexpack`) and guard wrapper `guards/guard_dexpack.sh` so committed dexpack assets stay deterministic across branches.
- 2025-11-02: Added `build-dexpack.ts` (`npm run data:dexpack:v2`) to emit the binary slab/manifest for the DEX v2 pipeline alongside the legacy generator.
- 2025-11-03: Added DEX v2 cutover helpers (`npm run ops:dex-v2-backup`, `npm run ops:simulate-flag`, `npm run ops:dex-v2-alert-dry-run`) for backup, flag scheduling, and alert rehearsals ahead of the PROD canary.
- 2025-11-04: `db_smoke.ts` now loads IG_ENV_FILE secrets, prefers direct Postgres connections, and exposes `--mode` / `DB_SMOKE_MODE` overrides for testing different connection modes.
- 2025-11-05: Added `ops:bootstrap-local-db` (see `scripts/ops/bootstrap_local_fallback.ts`) to hydrate the Store-hosted Postgres mirror for offline failover.
- 2025-11-06: Added `scripts/ops/ensure_postgres_bundle.ps1` and `scripts/ops/auto_bootstrap_local_db.ps1`; run `npm run ops:auto-bootstrap-local-db` to silently install Postgres tooling then refresh the local fallback end-to-end.
- 2025-11-09: Console Output Standardization (2025-11-09):
- All CLI scripts migrated to centralized output-formatter utility (src/utils/output-formatter.ts)
- ESLint enforcement via scripts-prefer-output-formatter rule
- 61 comprehensive tests (100% coverage)
- 11 scripts standardized: db_admin.ts, db_smoke.ts, db_replication.ts, check_db_redundancy.ts, db_bootstrap_backfill.ts, build_dexpack.ts, build-dexpack.ts, build-data.ts, fetch_pokemon.mjs, cache_client.mjs, archive_task_history.mjs
- See development-bible/06-console-tooling.md for comprehensive guidelines and quick reference patterns
- 2025-12-18: TypeScript Migration (Phase 1 Complete):
- Converted 6 CommonJS scripts to TypeScript: validate_database_urls.ts, preflight.ts, ensure-data.ts, build-data.ts, build-assets-manifest.ts, register-commands.ts
- Updated package.json scripts to use tsx instead of node
- security-bot.ts migrated from root (already ESM, added types)

Subrouters:
- scripts/dex/ROUTER.md — Data seeding and cache warmup entrypoints.
- scripts/guards/ROUTER.md — CI and guard rails for repository invariants.
- scripts/ops/ROUTER.md — Operator-focused migration and recovery helpers.

Output Formatting:
- All scripts now use src/utils/output-formatter.ts for consistent CLI output
- ESLint enforces no-console in production (error), scripts (warn), tests (off)
- 11 functions available: formatBorder, formatSectionHeader, formatKeyValue, formatKeyValueList, formatTable, formatList, formatStatus, formatProgress, formatOutputBlock, formatSeparator, formatSection
- See docs/console-output-standards.md for comprehensive guidelines
- See docs/console-output-quick-reference.md for common patterns
