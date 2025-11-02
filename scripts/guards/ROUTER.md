# ROUTER
Title: Guard Scripts
Purpose: CI and preflight guard entrypoints that enforce repository invariants.
Owned Globs: scripts/guards/**
Last Updated (UTC): 2025-02-26T00:00:00Z

Notes:
- `require-ensure-db-preload.mjs` ensures runtime entrypoints preload env/ensure-db-url before touching Prisma.
- Guard scripts are invoked from GitHub Actions and local guard wrappers; keep outputs terse and actionable.
- 2025-11-02: Added `guard_auto_sync.sh` to run the auto-sync `--ci --dry-run` check so operators catch missing secrets or trigger artifacts before deploying.
- 2025-02-26: Documented `guard_dexpack.sh` alongside the dexpack build notes; guard fails when committed artifacts drift.

Linked Routers:
- scripts/ROUTER.md — Parent index covering guard entrypoints.
- ops/ROUTER.md — Operational docs that consume guard outputs.
