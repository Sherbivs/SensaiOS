# ROUTER
Title: db_v0_bootstrap Migration
Purpose: Day-one schema blueprint for tenants, trainers, dex packs, inventory, and audit logging.
Owned Globs: prisma/migrations/202511021024_db_v0_bootstrap/**
Last Updated (UTC): 2025-11-04T17:42:30Z

Notes:
- `migration.sql` applies the day-one schema additions (tenants, trainers, dex pack registry, inventory, audit log, and pack-aware columns).
- `rollback.sql` removes the associated foreign keys, columns, and tables if the bootstrap must be reverted.
- Coordinate deploy/rollback with `ops/DB_BOOTSTRAP.md` and capture evidence in Tasklist notes.
