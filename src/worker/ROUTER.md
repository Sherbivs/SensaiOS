# ROUTER
Title: Background Workers
Purpose: Render background services that drain the outbox and perform offline tasks.
Owned Globs: src/worker/**
Last Updated (UTC): 2025-10-27T08:45:00Z

Notes:
- `backup.ts` runs as the Render worker (`infinity-gauntlet-app-worker`) and drains `OutboxMessage` rows with jittered polling.
- Health logs include runtime + DB host diagnostics so `/ops stats` can surface worker status.
- Placeholder sink currently logs processed messages; follow-up task swaps in persistent storage (S3/R2).

Areas:
- backup.ts — Outbox drain loop, cache integration, structured logging
