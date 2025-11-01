# ROUTER
Title: Schema Constraints & Outbox Enum
Purpose: Tightens relational constraints, adds updatedAt tracking, and formalizes the outbox status enum.
Owned Globs: prisma/migrations/202511010900_schema_constraints/**
Last Updated (UTC): 2025-11-01T09:00:00Z

Notes:
- Adds cascading foreign keys across Party, PartySlot, PokemonInstance, Cooldown, Encounter, and Battle tables to simplify cleanup.
- Introduces the `OutboxStatus` enum, normalizes existing rows, and adds indexes for processed/error scans.
- Adds `updatedAt` defaults to key tables and unique constraints to prevent duplicate Party/PartySlot ownership entries.

Linked Routers:
- prisma/migrations/ROUTER.md — Migration catalogue and rollout guidance.
- ops/DB_BOOTSTRAP.md — Runbook covering migration deploy expectations.
