# ROUTER
Title: Trainer Profile Option C
Purpose: Materializes trainer profile customization table (Option C hybrid plan).
Owned Globs: prisma/migrations/202511030830_trainer_profile_option_c/**
Last Updated (UTC): 2025-11-03T07:45:00Z

Notes:
- Creates `TrainerProfile` with tagline, bio, and favorite species metadata keyed to `User`.
- Adds foreign keys to `User` and `Species` plus an index on the favorite species selector.
- Apply via `npx prisma migrate deploy` and document rollout evidence in Tasklist or ops/DB_BOOTSTRAP.md before enabling profile commands in production.

Key Files:
- migration.sql — SQL migration establishing the TrainerProfile table and constraints.

Linked Routers:
- prisma/ROUTER.md — Parent schema overview.
- prisma/migrations/ROUTER.md — Chronological migration ledger.
