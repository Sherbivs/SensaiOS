# ROUTER
Title: Prisma Schema & Migrations
Purpose: Database schema definition and migration history.
Owned Globs: prisma/**
Last Updated (UTC): 2025-10-30T00:46:00Z

Notes:
- `schema.prisma` defines the Accelerate-first data model shared by the bot, workers, and maintenance scripts.
- The `migrations/` folder stores deterministic migration bundles (`migration.sql` + lockfiles) applied via `prisma migrate deploy`.
- Keep migration folders chronological and document rollout evidence in Tasklist notes or ops/DB_BOOTSTRAP.md.

Key Files:
- schema.prisma - Canonical Prisma schema loaded by runtime/config helpers.
- migrations/*/migration.sql - Generated SQL migrations; follow runbook before editing.
- migrations/migration_lock.toml - Prisma migration state, committed to keep drift visible.
