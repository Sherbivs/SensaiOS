# DATA SCHEMA

_Last initialized: 2025-10-29T14:30:00Z (UTC) — Rev: 0.3_

High-level reference for persistent and reference data. Pair with `docs/database-systems.md` for connection modes, role grants, helper functions, and operational playbooks.

## Entities (persistent)
- Users, PokemonInstances, Parties, Encounters, Battles, Cooldowns

## Reference (read-only)
- Dex spine: `Type`, `Ability`, `Item`, `Move`, `Species`, `SpeciesType`, `SpeciesAbility`, `SpeciesLearnset`, `EvolutionStep`, `TypeChart`, `NameVariant`
- Materialized hydration view `SpeciesSheet` (refresh after dex patches)
- Manifest remains the top-level digest for pipeline exports

### Dex spine notes (2025-10-29)
- All IDs are `SMALLINT` primaries with ASCII slugs for human lookups; rows upsert idempotently via `id` + `slug`.
- Junctions (`SpeciesType`, `SpeciesAbility`, `SpeciesLearnset`) use compound primary keys to prevent duplicates and keep joins narrow.
- `SpeciesLearnset.level` stores `0` for non-level methods so the composite PK stays deterministic; queries filter by `method` + `level`.
- `NameVariant.normalized` carries lowercase/unaccented text with a trigram GIN index for fuzzy nickname resolution; pair with `unaccent(lower($input))` when searching.
- `SpeciesSheet` pre-joins types, abilities, and base stats for quick battle UI hydration—refresh via `REFRESH MATERIALIZED VIEW CONCURRENTLY "SpeciesSheet";` after data loads.

## Notes
- Formal JSON Schemas (T2.1) live under `src/data_pipeline/schema/*`.
- Pipeline output layout (T2.2): `/data/{pokemon,moves,abilities}/...`, `manifest.json`.
- Operational guidance (migrations, grants, helper refresh, dex scripts) now resides in `docs/database-systems.md` and `ops/DB_BOOTSTRAP.md`.

## Performance Indexes (2025-10-28)
- `Cooldown (ownerId, kind)` is now a unique key so each trainer/kind pair upserts cleanly; vacuum ANALYZE weekly keeps the index statistics current.
- `Battle` table gains composite indexes on `(state, endedAt)` plus `(p1Id|p2Id, state, endedAt)` to speed DM history and `/ops stats` filters; REINDEX during major schema upgrades or if bloat exceeds 30%.
- `Encounter (ownerId, state)` and `(state, startedAt)` indexes, alongside `PokemonInstance.ownerId` and `Party.ownerId`, ensure trainer-centric queries remain O(log n) as concurrency grows.
- Migration `202510280500_scaling_indexes` applies these indexes forward-only; rollouts should run `prisma migrate deploy` during a quiet window and monitor autovacuum lag after deployment.
 - Dex migration `202510290930_dex_reference_spine` installs trigram/unaccent extensions, canonical tables, `SpeciesSheet`, and links live `PokemonInstance`/`Encounter` rows to `Species`.
