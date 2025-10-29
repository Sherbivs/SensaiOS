# ROUTER
Title: Background Workers
Purpose: Render background services that drain the event bus and perform offline tasks.
Owned Globs: src/worker/**
Last Updated (UTC): 2025-10-28T22:55:00Z

Notes:
- Render now runs dedicated background workers:
	- `infinity-gauntlet-outbox` → `dist/worker/outbox.js`
	- `infinity-gauntlet-cache` → `dist/worker/cache-refresh.js`
	- `infinity-gauntlet-data-pipeline` → `dist/worker/data-pipeline.js`
- Each worker sets `SERVICE_NAME` and pooled/direct DB URLs so telemetry and Prisma connections stay isolated per service.
- Shared helper `src/shared/worker-runtime.ts` powers signal handling, repeating tasks, and shutdown hooks for every worker entry.
- Event bus drain still streams payloads to the backup sink (S3/local) while new handlers are wired.
- Cache/data workers emit periodic `worker.*.health` logs for ops dashboards; security sweeps now live in the dedicated Render worker (`security-bot.js`).

Areas:
- outbox.ts — Event bus drain loop, cache integration, structured logging
- cache-refresh.ts — Pokémon cache refresher with interval + jitter controls
- data-pipeline.ts — Reference data rebuild loop with manifest logging
- backup.ts — Legacy entrypoint kept for backwards compatibility (delegates to outbox)
