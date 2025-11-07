# ROUTER
Title: Application Source
Purpose: Root app source tree; see sub-routers for domains.
Owned Globs: src/**
Last Updated (UTC): 2025-11-03T00:15:00Z

Notes:
- 2025-11-02: Battle engine and Dex API now hydrate from `src/data/dexpack.js` for O(1) lookups instead of ad-hoc JSON parsing.
- 2025-11-02: `src/dex/**` models the DEX v2 binary runtime; `metrics.js` logs load/fallback/lookup events feeding the new parity and bench suites.
- 2025-11-03: Alias coverage invariant added—parity spec iterates every v1 alias while guard_dexpack.sh checks both v1 JSON/module and v2 binary outputs.
- Battle persistence now centralizes result storage + arena/winner messaging.
- Updated shared config to fall back to Render-provided database env mappings.
- Daily quest claim flow adds handler, cooldown wiring, and tests under src/bot and src/commands.
- Shared runtime config (`src/shared/config.ts`) now validates Render DATABASE_URL wiring and exports cache/runtime hints.
- Background workers under `src/worker/**` now run standalone entries (event bus drain, cache refresh, data pipeline) via `runWorker`; ENABLE_CONTINUOUS_SWEEP keeps security sweeps dedicated to the Render worker.
- `src/engine/**` introduces the durable event bus helpers and category-aware worker loop powering asynchronous tasks.
- PBSL scaffold (`src/core/pbsl/**`) houses deterministic RNG, audit trails, and encounter generators with provenance metadata recorded in docs/PBSL.md.
- Dexpack loader (`src/data/dexpack.js`) now boots from the generated ES module for zero-parse startup while keeping helpers shared across CommonJS and TypeScript surfaces.
- 2025-11-02: CLI status monitor now presents a stat-sheet layout (security, database, PokéAPI, capacity) with a 5-minute baseline refresh and 30s alert cadence.

Subdomains:
- src/bot - Discord client & interaction handlers
- src/cache - Legacy cache publishers for PokeAPI mirrors
- src/commands - CommonJS command handlers retained for backwards compatibility
- src/config - Legacy environment shim (CommonJS callers)
- src/dex - DEX v2 binary runtime loaders and metrics helpers
- src/core - game engines (battle, encounter, data)
- src/data - Dexpack loader + helper facade for committed assets
- src/data_pipeline - reference data ingestion and schema validation
- src/engine - event bus + battle primitives (legacy math helpers)
- src/env - runtime environment validation utilities
- src/lib - shared CommonJS helpers (assets, dex API, cooldowns)
- src/models - Prisma access layer and typed helpers
- src/services - service abstractions feeding DM/command flows
- src/shared - runtime config, Prisma client, logging, cache, event bus compatibility helpers
- src/runtime - supervisors that wrap automation scripts (e.g., auto-sync loop)
- src/types - ambient declaration files bridging external packages
- src/utils - logging, CLI status, and operational helper utilities
- src/worker - background worker loops
