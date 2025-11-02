# ROUTER
Title: Application Source
Purpose: Root app source tree; see sub-routers for domains.
Owned Globs: src/**
Last Updated (UTC): 2025-11-02T14:05:00Z

Notes:
- 2025-11-02: Battle engine and Dex API now hydrate from `src/data/dexpack.js` for O(1) lookups instead of ad-hoc JSON parsing.
- Battle persistence now centralizes result storage + arena/winner messaging.
- Updated shared config to fall back to Render-provided database env mappings.
- Daily quest claim flow adds handler, cooldown wiring, and tests under src/bot and src/commands.
- Shared runtime config (`src/shared/config.ts`) now validates Render DATABASE_URL wiring and exports cache/runtime hints.
- Background workers under `src/worker/**` now run standalone entries (event bus drain, cache refresh, data pipeline) via `runWorker`; ENABLE_CONTINUOUS_SWEEP keeps security sweeps dedicated to the Render worker.
- `src/engine/**` introduces the durable event bus helpers and category-aware worker loop powering asynchronous tasks.
- PBSL scaffold (`src/core/pbsl/**`) houses deterministic RNG, audit trails, and encounter generators with provenance metadata recorded in docs/PBSL.md.
- Dexpack loader (`src/data/dexpack.js`) exposes the committed asset via lazy in-memory helpers shared across CommonJS and TypeScript surfaces.
- Prisma client boot now prioritises Accelerate URLs surfaced from runtime config; CLI telemetry reports the active transport (direct vs accelerate-node).

Subdomains:
- src/bot - Discord client & interaction handlers
- src/cache - Legacy cache publishers for PokeAPI mirrors
- src/commands - CommonJS command handlers retained for backwards compatibility
- src/config - Legacy environment shim (CommonJS callers)
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
