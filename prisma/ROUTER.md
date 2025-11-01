# ROUTER
Title: Prisma Schema & Migrations
Purpose: Database schema definition and migration history.
Owned Globs: prisma/**
Last Updated (UTC): 2025-11-01T16:20:00Z

Notes:
- `schema.prisma` defines the Accelerate-first data model shared by the bot, workers, and maintenance scripts.
- The `migrations/` folder now carries its own router outlining timestamped bundles and the committed `migration_lock.toml` state.
- Keep migration folders chronological and document rollout evidence in Tasklist notes or ops/DB_BOOTSTRAP.md.

Key Files:
- schema.prisma - Canonical Prisma schema loaded by runtime/config helpers.
- migrations/*/migration.sql - Generated SQL migrations; follow runbook before editing.
- migrations/migration_lock.toml - Prisma migration state, committed to keep drift visible.
