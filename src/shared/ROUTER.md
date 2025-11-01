# ROUTER
Title: Shared Runtime & Utilities
Purpose: Centralized runtime config, Prisma bootstrap, logging, caching, and shared data access layers.
Owned Globs: src/shared/**
Last Updated (UTC): 2025-11-01T17:30:00Z

Notes:
- `config.ts` now exposes `loadConfig()` that promotes Render's `DATABASE_INTERNAL_URL`, forbids localhost hosts in production, and surfaces cache/runtime settings.
- `prisma.ts` initializes a singleton Prisma client, validates URLs early, and shares `$connect()` across importers.
- `cache/memory.ts` holds the default TTL cache backend used by the bot and background worker until Redis wiring lands; see src/shared/cache/ROUTER.md for backend internals.
- `outbox.ts` now wraps the event bus helpers so legacy drains can enqueue/claim messages while the new engine comes online.
- `log.ts` remains the structured logger, consuming the shared runtime config.
- `worker-runtime.ts` centralizes worker lifecycles (signal handling, repeat helpers) consumed by outbox/cache/data pipeline entries.
- `config.ts` and `prisma.ts` now surface Prisma Accelerate URLs (DATABASE_ACCELERATE_URL/PRISMA_*), auto-select runtimes, and record transport telemetry for CLI/status output.
- Storage adapters live under src/shared/storage/ROUTER.md to keep durable sink integrations isolated from command handlers.

Areas:
- config.ts — runtime/env loader
- prisma.ts — Prisma client singleton + ensure helper
- cache/memory.ts — memory cache implementation
- outbox.ts — compatibility helpers layered on the event bus
- log.ts — structured logger used across bots/workers
- worker-runtime.ts — shared worker bootstrap + signal handling utilities

Subrouters:
- src/shared/cache/ROUTER.md — Cache backend implementations.
- src/shared/storage/ROUTER.md — Storage adapter catalog.
