# ROUTER
Title: Postgres 17 Bundle
Purpose: Vendored Postgres 17 client binaries for local recovery and migration workflows.
Owned Globs: tools/pgsql17/**
Last Updated (UTC): 2025-11-01T16:20:00Z

Notes:
- `pgsql/bin/` houses psql, pg_dump, pg_restore, and supporting DLLs; keep checksums documented when upgrading.
- Binaries are read-only and only used locally; follow ops/DB_BOOTSTRAP.md when replacing the bundle to avoid partial upgrades.
