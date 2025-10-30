# ROUTER
Title: Event Bus & Battle Engine Primitives
Purpose: Shared mechanics for battle calculations and worker orchestration.
Owned Globs: src/engine/**
Last Updated (UTC): 2025-10-30T00:47:00Z

Notes:
- Mix of legacy CommonJS battle utilities and new TypeScript bus/worker helpers.
- Provides deterministic math tables, RNG helpers, and event loop glue consumed by bot/worker surfaces.

Key Files:
- bus.ts - Event bus primitives powering worker scheduling.
- worker.ts - Worker bootstrap and message loop helpers.
- calc.js / effects.js / stats.js / tables.js / types.js / turn.js - Legacy battle math/logic modules.
- rng.js - Randomness helpers mirrored in PBSL oracle tests.
