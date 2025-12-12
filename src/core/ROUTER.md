# ROUTER
Title: Core Game Engines
Purpose: Deterministic battle/encounter engines and shared mechanics.
Owned Globs: src/core/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Catch engine now stamps pokemonId in encounter metadata for persistence.
- PBSL scaffold introduces deterministic RNG/audit utilities and encounter helpers consumed by future adapters.
- PBSL oracle fixtures validate deterministic battle snapshots against upstream engine outputs.
- Dedicated sub-routers document battle, encounter, and PBSL internals for downstream editors.

Areas:
- battle/* — engine wrappers, damage, status; see src/core/battle/ROUTER.md
- encounter/* — walking/spawn logic; see src/core/encounter/ROUTER.md
- pbsl/* — PBSL seedable RNG, audit trails, deterministic battle/encounter scaffolding; see src/core/pbsl/ROUTER.md
