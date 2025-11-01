# ROUTER
Title: Tooling Binaries & Helpers
Purpose: Vendored third-party tools required for local operations.
Owned Globs: tools/**
Last Updated (UTC): 2025-11-01T16:20:00Z

Notes:
- Houses the Windows-friendly Postgres 17 client bundle used by recovery and migration scripts; see tools/pgsql17/ROUTER.md for bundle internals.
- Keep binaries untouched; updates should follow the DB bootstrap runbook and document checksum changes.

Key Assets:
- pgsql17/pgsql/bin/* - Postgres command-line utilities (psql, pg_dump, pg_restore, clusterdb, etc.) plus supporting DLLs.
