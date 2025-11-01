# ROUTER
Title: Scaling Indexes
Purpose: Adds supporting indexes and unique constraints to core battle, encounter, and cooldown tables.
Owned Globs: prisma/migrations/202510280500_scaling_indexes/**
Last Updated (UTC): 2025-10-28T05:00:00Z

Notes:
- Adds owner/state/endedAt composite indexes across battle and encounter tables to speed leaderboard/history queries.
- Normalizes cooldown uniqueness via `Cooldown_ownerId_kind_key` and drops the legacy non-unique index.
- Uses defensive `to_regclass` guards so re-running the migration remains idempotent when tables already exist.

Linked Routers:
- prisma/migrations/ROUTER.md — Migration catalogue and rollout guidance.
- ops/DB_BOOTSTRAP.md — Runbook covering migration deploy expectations.
