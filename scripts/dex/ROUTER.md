# ROUTER
Title: Dex Automation Scripts
Purpose: Utility scripts that backfill, seed, and warm dex reference data.
Owned Globs: scripts/dex/**
Last Updated (UTC): 2025-11-01T17:30:00Z

Notes:
- `backfill_species.ts` repairs legacy species gaps before modern seeds run.
- `seed_reference.ts` hydrates structured dex tables; coordinate with prisma/migrations when schema changes.
- `warm_cache.ts` primes filesystem caches so runtime lookups stay warm between sync cycles.

Linked Routers:
- data/ROUTER.md — Reference datasets consumed by these scripts.
- data/bootstrap/ROUTER.md — Seed bundles generated during runs.
- data/cache/ROUTER.md — Cache outputs validated after seeding.
- src/data_pipeline/ROUTER.md — Schema validators used before writes.
