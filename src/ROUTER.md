# ROUTER
Title: Application Source
Purpose: Root app source tree; see sub-routers for domains.
Owned Globs: src/**
Last Updated (UTC): 2025-10-27T08:45:00Z

Notes:
- Battle persistence now centralizes result storage + arena/winner messaging.
- Updated shared config to fall back to Render-provided database env mappings.
- Daily quest claim flow adds handler, cooldown wiring, and tests under src/bot and src/commands.
- Shared runtime config (`src/shared/config.ts`) now validates Render DATABASE_URL wiring and exports cache/runtime hints.
- Background worker (`src/worker/backup.ts`) drains the Prisma outbox and emits health diagnostics for `/ops stats`.

Subdomains:
- src/bot — Discord client & interaction handlers
- src/core — game engines (battle, encounter, data)
- src/shared — runtime config, Prisma client, logging, cache, outbox helpers
- src/worker — background worker loops
