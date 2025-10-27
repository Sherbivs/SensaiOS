# ROUTER
Title: Shared Runtime & Utilities
Purpose: Centralized runtime config, Prisma bootstrap, logging, caching, and shared data access layers.
Owned Globs: src/shared/**
Last Updated (UTC): 2025-10-27T08:45:00Z

Notes:
- `config.ts` now exposes `loadConfig()` that promotes Render's `DATABASE_INTERNAL_URL`, forbids localhost hosts in production, and surfaces cache/runtime settings.
- `prisma.ts` initializes a singleton Prisma client, validates URLs early, and shares `$connect()` across importers.
- `cache/memory.ts` holds the default TTL cache backend used by the bot and background worker until Redis wiring lands.
- `outbox.ts` provides enqueue/dequeue helpers for durable background jobs drained by the backup worker.
- `log.ts` remains the structured logger, consuming the shared runtime config.

Areas:
- config.ts — runtime/env loader
- prisma.ts — Prisma client singleton + ensure helper
- cache/memory.ts — memory cache implementation
- outbox.ts — durable outbox helpers
- log.ts — structured logger used across bots/workers
