# ROUTER
Title: Postgres Client Root
Purpose: Root directory for the vendored Postgres 17 client bundle.
Owned Globs: tools/pgsql17/pgsql/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Hosts the unpacked Postgres client binaries relied on by local recovery and migration scripts.
- Treated as read-only; replace only via the DB bootstrap runbook and document checksum changes.

Linked Routers:
- tools/pgsql17/ROUTER.md — Bundle overview and upgrade guidance.
- tools/pgsql17/pgsql/bin/ROUTER.md — Command-line binaries shipped with the bundle.
