# ROUTER
Title: Core Game Engines
Purpose: Deterministic battle/encounter engines and shared mechanics.
Owned Globs: src/core/**
Last Updated (UTC): 2025-06-15T07:15:00Z

Notes:
- Catch engine now stamps pokemonId in encounter metadata for persistence.
- PBSL scaffold introduces deterministic RNG/audit utilities and encounter helpers consumed by future adapters.
- PBSL oracle fixtures validate deterministic battle snapshots against upstream engine outputs.
- Dedicated sub-routers document battle, encounter, and PBSL internals for downstream editors.
- **NEW (2025-06-15):** starter-validation.ts adds open starter validation with forbidden categories (regional starters, legendaries, mythicals, pseudo-legendary finals).

Areas:
- battle/* — engine wrappers, damage, status; see src/core/battle/ROUTER.md
- encounter/* — walking/spawn logic; see src/core/encounter/ROUTER.md
- pbsl/* — PBSL seedable RNG, audit trails, deterministic battle/encounter scaffolding; see src/core/pbsl/ROUTER.md
- starter-validation.ts — Open starter Pokémon validation with forbidden category checks; see docs/architecture-bible/19-starter-selection-flow.md
