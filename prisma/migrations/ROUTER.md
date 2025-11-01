# ROUTER
Title: Prisma Migrations
Purpose: Chronological migration bundles applied via `prisma migrate deploy`.
Owned Globs: prisma/migrations/**
Last Updated (UTC): 2025-11-01T16:20:00Z

Notes:
- Each timestamped folder contains a generated `migration.sql` plus metadata; follow ops/DB_BOOTSTRAP.md before applying new migrations.
- `migration_lock.toml` tracks Prisma state and must remain committed so drift is visible in CI.
- Document rollout evidence for new migrations in Tasklist notes or ops/DB_BOOTSTRAP.md to maintain the chain of custody.
