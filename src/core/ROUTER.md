# ROUTER
Title: Core Game Engines
Purpose: Deterministic battle/encounter engines and shared mechanics.
Owned Globs: src/core/**
Last Updated (UTC): 2025-10-27T12:30:00Z

Notes:
- Catch engine now stamps pokemonId in encounter metadata for persistence.
- PBSL scaffold introduces deterministic RNG/audit utilities and encounter helpers consumed by future adapters.
- PBSL oracle fixtures validate deterministic battle snapshots against upstream engine outputs.
- PBSL oracle fixtures validate deterministic battle snapshots against upstream engine outputs.

Areas:
- battle/* — engine wrappers, damage, status
- encounter/* — walking/spawn logic
- pbsl/* — PBSL seedable RNG, audit trails, deterministic battle/encounter scaffolding
