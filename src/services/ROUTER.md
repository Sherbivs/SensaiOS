# ROUTER
Title: Service Layer Helpers
Purpose: Legacy abstractions that supply data to command handlers and DM flows.
Owned Globs: src/services/**
Last Updated (UTC): 2025-11-01T17:30:00Z

Notes:
- These modules bridge cached data and presentation layers pending full TypeScript rewrites.
- Keep TypeScript declaration files aligned with their CommonJS counterparts.
- `cache/facade.ts` now tracks hit/miss counters, disk usage, maintenance schedule state, and exposes an immediate cleanup trigger consumed by `/ops cache` and tests; see src/services/cache/ROUTER.md for namespace recipes.

Key Files:
- pokemonService.js / .d.ts - Provides Pokemon lookup helpers for commands and DM flows.
- cache.js - Wraps cache hydration logic for downstream consumers.
- home-bundle.ts - Bundles DM home data for React renderers.

Linked Routers:
- src/services/cache/ROUTER.md — Namespace recipes and instrumentation backing these helpers.
- src/shared/cache/ROUTER.md — Backend implementations leveraged by service caches.
- Store/ROUTER.md — Persistent cache targets populated via service hydration.
