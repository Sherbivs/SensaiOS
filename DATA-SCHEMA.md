# DATA SCHEMA

_Last initialized: 2025-10-28T04:55:00Z (UTC) — Rev: 0.2_

High-level reference for persistent and reference data.

## Entities (persistent)
- Users, PokemonInstances, Parties, Encounters, Battles, Cooldowns

## Reference (read-only)
- Species, Moves, Abilities, TypeChart, Manifest

## Notes
- Formal JSON Schemas (T2.1) will live under `src/data_pipeline/schema/*`.
- Pipeline output layout (T2.2): `/data/{pokemon,moves,abilities}/...`, `manifest.json`.

## Performance Indexes (2025-10-28)
- `Cooldown (ownerId, kind)` is now a unique key so each trainer/kind pair upserts cleanly; vacuum ANALYZE weekly keeps the index statistics current.
- `Battle` table gains composite indexes on `(state, endedAt)` plus `(p1Id|p2Id, state, endedAt)` to speed DM history and `/ops stats` filters; REINDEX during major schema upgrades or if bloat exceeds 30%.
- `Encounter (ownerId, state)` and `(state, startedAt)` indexes, alongside `PokemonInstance.ownerId` and `Party.ownerId`, ensure trainer-centric queries remain O(log n) as concurrency grows.
- Migration `202510280500_scaling_indexes` applies these indexes forward-only; rollouts should run `prisma migrate deploy` during a quiet window and monitor autovacuum lag after deployment.
