# ROUTER
Title: Dex Automation Scripts
Purpose: Utility scripts that backfill, seed, and warm dex reference data.
Owned Globs: scripts/dex/**
Last Updated (UTC): 2025-11-01T16:20:00Z

Notes:
- `backfill_species.ts` repairs legacy species gaps before modern seeds run.
- `seed_reference.ts` hydrates structured dex tables; coordinate with prisma/migrations when schema changes.
- `warm_cache.ts` primes filesystem caches so runtime lookups stay warm between sync cycles.
