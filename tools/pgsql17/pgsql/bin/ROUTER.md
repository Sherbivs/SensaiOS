# ROUTER
Title: Postgres CLI Binaries
Purpose: Vendored Postgres command-line utilities used for local maintenance flows.
Owned Globs: tools/pgsql17/pgsql/bin/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Contains `psql`, `pg_dump`, `pg_restore`, and supporting DLLs required by recovery scripts.
- Leave binaries untouched; refresh the bundle via ops/DB_BOOTSTRAP.md to avoid checksum drift.
- Scripts such as `scripts/bootstrap_staging_db.ps1` and `scripts/restore_prisma_postgres.ps1` expect these binaries on PATH when invoked locally.

Linked Routers:
- tools/pgsql17/pgsql/ROUTER.md — Bundle root overview.
- ops/DB_BOOTSTRAP.md — Runbook controlling when to upgrade the Postgres client bundle.
