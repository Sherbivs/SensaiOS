# ROUTER
Title: Background Workers
Purpose: Render background services that drain the outbox and perform offline tasks.
Owned Globs: src/worker/**
Last Updated (UTC): 2025-10-28T21:45:00Z

Notes:
- Render now runs dedicated background workers:
	- `infinity-gauntlet-outbox` → `dist/worker/outbox.js`
	- `infinity-gauntlet-cache` → `dist/worker/cache-refresh.js`
	- `infinity-gauntlet-data-pipeline` → `dist/worker/data-pipeline.js`
- Each worker sets `SERVICE_NAME` and pooled/direct DB URLs so telemetry and Prisma connections stay isolated per service.
- Placeholder sink still logs processed messages; follow-up task swaps in persistent storage (S3/R2).

Areas:
- outbox.ts — Outbox drain loop, cache integration, structured logging
- cache-refresh.ts — Pokémon cache refresher with interval + jitter controls
- data-pipeline.ts — Reference data rebuild loop with manifest logging
- backup.ts — Legacy entrypoint kept for backwards compatibility (delegates to outbox)
