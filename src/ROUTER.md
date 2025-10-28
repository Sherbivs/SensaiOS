# ROUTER
Title: Application Source
Purpose: Root app source tree; see sub-routers for domains.
Owned Globs: src/**
Last Updated (UTC): 2025-10-28T22:55:00Z

Notes:
- Battle persistence now centralizes result storage + arena/winner messaging.
- Updated shared config to fall back to Render-provided database env mappings.
- Daily quest claim flow adds handler, cooldown wiring, and tests under src/bot and src/commands.
- Shared runtime config (`src/shared/config.ts`) now validates Render DATABASE_URL wiring and exports cache/runtime hints.
- Background workers under `src/worker/**` now run standalone entries (outbox, cache refresh, data pipeline) via `runWorker`; ENABLE_CONTINUOUS_SWEEP keeps security sweeps dedicated to the Render worker.
- PBSL scaffold (`src/core/pbsl/**`) houses deterministic RNG, audit trails, and encounter generators with provenance metadata recorded in docs/PBSL.md.

Subdomains:
- src/bot — Discord client & interaction handlers
- src/core — game engines (battle, encounter, data)
- src/shared — runtime config, Prisma client, logging, cache, outbox helpers
- src/worker — background worker loops
