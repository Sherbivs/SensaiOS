# ROUTER
Title: PBSL Deterministic Engine
Purpose: Seeded RNG, audit, and deterministic battle/encounter scaffolding for PBSL compliance.
Owned Globs: src/core/pbsl/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Provides seeded RNG utilities and provenance records so fixtures can be reproduced across environments.
- Battle and encounter wrappers expose deterministic flows that mirror the live engine for oracle diffing.
- Audit trail helpers capture per-phase events and enrich them with provenance metadata for compliance reviews.

Key Files:
- rng.ts — Seeded RNG with deterministic stepping semantics.
- audit.ts — In-memory audit trail that annotates events with provenance records.
- phases.ts — Enumerates PBSL battle phase ordering consumed by the deterministic engine.
- index.ts — Barrel exports for battle/encounter modules and provenance helpers.

Linked Routers:
- src/core/ROUTER.md — Core engine overview.
- src/core/pbsl/battle/ROUTER.md — Deterministic battle resolution internals.
- src/core/pbsl/data/ROUTER.md — Provenance record builders and static metadata.
- src/core/pbsl/encounter/ROUTER.md — Deterministic encounter generator.
- tests/pbsl/ROUTER.md — Test harness validating PBSL compliance.
