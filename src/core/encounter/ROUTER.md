# ROUTER
Title: Encounter Engine Core
Purpose: Generates wild encounters, catch odds, and encounter metadata used by Discord flows.
Owned Globs: src/core/encounter/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Spawn helpers produce encounter candidates with rarity logic reused by walk handlers and tests.
- Catch utilities evaluate capture odds, apply ball modifiers, and return deterministic results.
- Exports stay framework agnostic so sync-layer or worker processes can reuse the encounter math.

Key Files:
- spawn.ts — Walk encounter generator that emits wild encounter candidates.
- catch.ts — Catch resolution helper returning deterministic success/failure envelopes.
- index.ts — Aggregated exports for downstream consumers.

Linked Routers:
- src/core/ROUTER.md — Core engine overview.
- src/bot/wilds/ROUTER.md — Discord control handlers built on this engine.
- tests/ROUTER.md — Encounter specs verifying deterministic spawn/catch flows.
