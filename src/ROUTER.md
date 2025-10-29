# ROUTER
Title: Application Source
Purpose: Root app source tree; see sub-routers for domains.
Owned Globs: src/**
Last Updated (UTC): 2025-10-29T01:50:00Z

Notes:
- Battle persistence now centralizes result storage + arena/winner messaging.
- Updated shared config to fall back to Render-provided database env mappings.
- Daily quest claim flow adds handler, cooldown wiring, and tests under src/bot and src/commands.
- Shared runtime config (`src/shared/config.ts`) now validates Render DATABASE_URL wiring and exports cache/runtime hints.
- Background workers under `src/worker/**` now run standalone entries (event bus drain, cache refresh, data pipeline) via `runWorker`; ENABLE_CONTINUOUS_SWEEP keeps security sweeps dedicated to the Render worker.
- `src/engine/**` introduces the durable event bus helpers and category-aware worker loop powering asynchronous tasks.
- PBSL scaffold (`src/core/pbsl/**`) houses deterministic RNG, audit trails, and encounter generators with provenance metadata recorded in docs/PBSL.md.
- Prisma client boot now prioritises Accelerate URLs surfaced from runtime config; CLI telemetry reports the active transport (direct vs accelerate-node).

Subdomains:
- src/bot — Discord client & interaction handlers
- src/core — game engines (battle, encounter, data)
- src/shared — runtime config, Prisma client, logging, cache, event bus compatibility helpers
- src/engine — event bus primitives and worker registry
- src/worker — background worker loops
