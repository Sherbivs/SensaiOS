# ROUTER
Title: Guard Scripts
Purpose: CI and preflight guard entrypoints that enforce repository invariants.
Owned Globs: scripts/guards/**
Last Updated (UTC): 2025-11-01T17:30:00Z

Notes:
- `require-ensure-db-preload.mjs` ensures runtime entrypoints preload env/ensure-db-url before touching Prisma.
- Guard scripts are invoked from GitHub Actions and local guard wrappers; keep outputs terse and actionable.

Linked Routers:
- scripts/ROUTER.md — Parent index covering guard entrypoints.
- ops/ROUTER.md — Operational docs that consume guard outputs.
