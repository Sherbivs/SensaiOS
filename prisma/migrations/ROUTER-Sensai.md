# ROUTER
Title: Prisma Migrations
Purpose: Chronological migration bundles applied via `prisma migrate deploy`.
Owned Globs: prisma/migrations/**
Last Updated (UTC): 2025-11-05T08:00:00Z

Notes:
- Each timestamped folder contains a generated `migration.sql` plus metadata; follow ops/DB_BOOTSTRAP.md before applying new migrations.
- `migration_lock.toml` tracks Prisma state and must remain committed so drift is visible in CI.
- Document rollout evidence for new migrations in Tasklist notes or ops/DB_BOOTSTRAP.md to maintain the chain of custody.

Sub-Routers:
- `prisma/migrations/202510280500_scaling_indexes/ROUTER.md` — Adds scaling indexes and unique guards for battle, encounter, cooldown tables.
- `prisma/migrations/202510290930_dex_reference_spine/ROUTER.md` — Introduces normalized dex reference spine and required extensions.
- `prisma/migrations/202511010900_schema_constraints/ROUTER.md` — Tightens relational constraints, adds OutboxStatus enum, and default timestamps.
- `prisma/migrations/202511021024_db_v0_bootstrap/ROUTER.md` — Seeds tenants, trainers, dex pack registry, inventories, and audit log structures for day-one blueprint alignment; includes rollback guidance.
- `prisma/migrations/202511030830_trainer_profile_option_c/ROUTER.md` — Introduces TrainerProfile table with tagline/bio/favorite species metadata for Option C hybrid profiles.
- `prisma/migrations/202511050900_pack_registry_signature/ROUTER.md` — Adds the DexPack signature column with a unique index to pair registry entries with signed artifacts.

Linked Routers:
- prisma/ROUTER.md — Parent schema overview.
- scripts/ops/ROUTER.md — Operator scripts that apply or verify migrations.
- ops/DB_BOOTSTRAP.md — Operational checklist for migration deploys.
