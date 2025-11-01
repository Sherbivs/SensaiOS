# ROUTER
Title: Dex Reference Spine
Purpose: Introduces normalized dex reference tables (types, moves, species, learnsets) with supporting indexes.
Owned Globs: prisma/migrations/202510290930_dex_reference_spine/**
Last Updated (UTC): 2025-10-29T09:30:00Z

Notes:
- Creates core reference tables (Type, Ability, Item, Move, Species) and lookup junctions with deterministic keys.
- Seeds supporting extensions (`pg_trgm`, `unaccent`) required for fuzzy name queries and locale normalization.
- Adds the `SpeciesSheet` materialized view for fast species hydration and rewires runtime tables to reference the new schema.

Linked Routers:
- prisma/migrations/ROUTER.md — Migration catalogue and rollout guidance.
- data/ROUTER.md — Reference data populated by the new schema.
- ops/DB_BOOTSTRAP.md — Runbook covering migration deploy expectations.
