# DATA SCHEMA

_Last initialized: {{TO_BE_SET_BY_AI}} (UTC) — Rev: 0.1_

High-level reference for persistent and reference data.

## Entities (persistent)
- Users, PokemonInstances, Parties, Encounters, Battles, Cooldowns

## Reference (read-only)
- Species, Moves, Abilities, TypeChart, Manifest

## Notes
- Formal JSON Schemas (T2.1) will live under `src/data_pipeline/schema/*`.
- Pipeline output layout (T2.2): `/data/{pokemon,moves,abilities}/...`, `manifest.json`.
