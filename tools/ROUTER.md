# ROUTER
Title: Tooling Binaries & Helpers
Purpose: Vendored third-party tools required for local operations.
Owned Globs: tools/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Houses the Windows-friendly Postgres 17 client bundle used by recovery and migration scripts; see tools/pgsql17/ROUTER.md for bundle internals.
- Keep binaries untouched; updates should follow the DB bootstrap runbook and document checksum changes.
- Sub-routers document the bundle root and bin directories so archive upgrades remain auditable.

Key Assets:
- pgsql17/pgsql/bin/* - Postgres command-line utilities (psql, pg_dump, pg_restore, clusterdb, etc.) plus supporting DLLs.

Subrouters:
- tools/pgsql17/ROUTER.md — Vendored Postgres bundle contents and upgrade path.
- tools/pgsql17/pgsql/ROUTER.md — Bundle root metadata.
- tools/pgsql17/pgsql/bin/ROUTER.md — CLI binaries and usage notes.
