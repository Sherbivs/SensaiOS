# ROUTER
Title: Prisma Schema & Migrations
Purpose: Database schema definition and migration history.
Owned Globs: prisma/**
Last Updated (UTC): 2025-11-04T17:42:30Z

Notes:
- `schema.prisma` defines the Accelerate-first data model shared by the bot, workers, and maintenance scripts.
- The `migrations/` folder now carries its own router outlining timestamped bundles and the committed `migration_lock.toml` state.
- Keep migration folders chronological and document rollout evidence in Tasklist notes or ops/DB_BOOTSTRAP.md.
- 2025-11-03: Added TrainerProfile table for Option C hybrid trainer profiles (tagline/bio/favorite species) plus referential integrity to Species.
- 2025-11-02: Added tenants, trainers, dex pack registry, inventories, and audit log foundations to support the DEX v2/DB bootstrap blueprint.
- 2025-11-04: Drafted `db_v0_bootstrap` migration with paired `rollback.sql` and archived tooling evidence under `ops/ARCHIVE/db-bootstrap/`.

Key Files:
- schema.prisma - Canonical Prisma schema loaded by runtime/config helpers.
- migrations/*/migration.sql - Generated SQL migrations; follow runbook before editing.
- migrations/migration_lock.toml - Prisma migration state, committed to keep drift visible.

Linked Routers:
- prisma/migrations/ROUTER.md — Timestamped migration bundles and lock state.
- ops/DB_BOOTSTRAP.md — Runbook governing Prisma migration apply flows.
