# ROUTER
Title: Service Layer Helpers
Purpose: Legacy abstractions that supply data to command handlers and DM flows.
Owned Globs: src/services/**
Last Updated (UTC): 2025-11-08T19:45:00Z

Notes:
- These modules bridge cached data and presentation layers pending full TypeScript rewrites.
- Keep TypeScript declaration files aligned with their CommonJS counterparts.
- `cache/facade.ts` now tracks hit/miss counters, disk usage, maintenance schedule state, and exposes an immediate cleanup trigger consumed by `/ops cache` and tests; see src/services/cache/ROUTER.md for namespace recipes.
- **`engine-db.ts` (NEW)** provides read-optimized SQLite database for static game data (Pokemon stats), leveraging persistent disk at `/Store/engine.db` (production) or `Store/engine.db` (local). Uses sql.js (pure JavaScript SQLite, no native modules) for cross-platform compatibility. Auto-initializes from data/pokemon.json on first run, persists to disk after writes. Exposes getPokemonById(), searchPokemonByName(), getEngineStats() API. See docs/render-disk-mount-fix.md for mount path architecture.

Key Files:
- pokemonService.js / .d.ts - Provides Pokemon lookup helpers for commands and DM flows.
- cache.js - Wraps cache hydration logic for downstream consumers.
- home-bundle.ts - Bundles DM home data for React renderers.
- **engine-db.ts (NEW)** - SQLite database for static game data on persistent disk (449 lines, sql.js-based).

Linked Routers:
- src/services/cache/ROUTER.md — Namespace recipes and instrumentation backing these helpers.
- src/shared/cache/ROUTER.md — Backend implementations leveraged by service caches.
- Store/ROUTER.md — Persistent cache targets populated via service hydration.
