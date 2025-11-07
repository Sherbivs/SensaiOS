# ROUTER
Title: Postgres 17 Bundle
Purpose: Vendored Postgres 17 client binaries for local recovery and migration workflows.
Owned Globs: tools/pgsql17/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- `pgsql/bin/` houses psql, pg_dump, pg_restore, and supporting DLLs; keep checksums documented when upgrading.
- Binaries are read-only and only used locally; follow ops/DB_BOOTSTRAP.md when replacing the bundle to avoid partial upgrades.
- Sub-routers capture the bundle root and bin directories so future upgrades are easy to audit.

Linked Routers:
- tools/ROUTER.md — Parent tooling index and ownership.
- ops/DB_BOOTSTRAP.md — Runbook dictating usage and refresh cadence.
- tools/pgsql17/pgsql/ROUTER.md — Bundle root metadata.
- tools/pgsql17/pgsql/bin/ROUTER.md — CLI binaries and usage notes.
