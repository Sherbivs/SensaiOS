# ROUTER
Title: Shared Runtime & Utilities
Purpose: Centralized runtime config, Prisma bootstrap, logging, caching, constants, and shared data access layers.
Owned Globs: src/shared/**
Last Updated (UTC): 2025-11-XX (constants consolidation complete)

Notes:
- `constants.ts` — **NEW** Centralized application constants organized into 4 groups (GAME_CONSTANTS, TIME_CONSTANTS, CACHE_CONSTANTS, MONITORING_CONSTANTS). Eliminates duplicate constant definitions across codebase. Provides backwards-compatible individual exports (`DEFAULT_STARTER_COINS`, `DEFAULT_TIME_ZONE`, etc.) marked with `@deprecated` tags.
- `config.ts` now exposes `loadConfig()` that promotes Render's `DATABASE_INTERNAL_URL`, forbids localhost hosts in production, and surfaces cache/runtime settings for the 2-node direct PostgreSQL cluster.
- `config.ts` also reads `DATABASE_LOCAL_URL` or `Store/db/local-url.txt` when present so Prisma can fall back to the Store-hosted Postgres mirror when remote datasources fail.
- `prisma.ts` initializes **dual Prisma clients** (`prisma` for PROD local node, `devPrisma` for DEV master), validates URLs early, connects both on startup, and shares `$connect()` across importers. Exports `getDatabaseStats()` returning `DualDatabaseStats` with separate telemetry for DEV and PROD connections including source, transport, latency, and status.
- `cache/memory.ts` holds the default TTL cache backend used by the bot and background worker until Redis wiring lands; see src/shared/cache/ROUTER.md for backend internals.
- `outbox.ts` now wraps the event bus helpers so legacy drains can enqueue/claim messages while the new engine comes online.
- `log.ts` remains the structured logger, consuming the shared runtime config.
- `worker-runtime.ts` centralizes worker lifecycles (signal handling, repeat helpers) consumed by outbox/cache/data pipeline entries.
- Storage adapters live under src/shared/storage/ROUTER.md to keep durable sink integrations isolated from command handlers.
- **Utility Consolidation:** All shared utilities accessible via barrel export at `utils/index.ts`. Eliminates verbose imports and improves discoverability. See `src/shared/utils/ROUTER.md` for complete utility catalog.

Areas:
- constants.ts — **NEW** Centralized application constants (game settings, timeouts, cache limits, monitoring thresholds) organized into 4 groups with backwards-compatible exports
- datetime.js — **ENHANCED** (2025-11-16) Eastern Time (EST/EDT) timezone utilities. Single source of truth for all timestamp formatting. Exports: `toEasternString()`, `toEasternTime()`, `toEasternDate()`, `toEasternLogFormat()` (high-precision console logging), `formatInTimeZone()` (generic timezone support), `msUntilNextZonedTime()` (scheduling helper, migrated from deprecated src/utils/timezone.js). Used by: bot/dripAlerts.js (digest scheduling), models/index.ts (timestamp formatting), utils/cliStatus.js (console output), services/monitoring/error-tracker.ts (error timestamps).
- config.ts — runtime/env loader
- prisma.ts — Dual Prisma client singleton (PROD `prisma` + DEV `devPrisma`), ensures both connections, exports `getDatabaseStats(): DualDatabaseStats`
- cache/memory.ts — memory cache implementation
- outbox.ts — compatibility helpers layered on the event bus
- log.ts — structured logger used across bots/workers
- worker-runtime.ts — shared worker bootstrap + signal handling utilities
- utils/ — Shared utility functions (format, error, async, math, URL) with barrel export at `utils/index.ts`
- **event-bus.ts (574 lines)** — Singleton Event Bus implementation for decoupled pub/sub messaging. ...-level `**`), priority-based subscription ordering, backpressure protection (maxQueueSize limits), replay buffer (last 100 events FIFO), correlation ID chaining (parentCorrelationId for event genealogy), sync/async handler support, graceful shutdown with draining. API: `getInstance()`, `emit(topic, payload, options)`, `subscribe(pattern, handler, options)`, `getReplayBuffer()`, `getStats()`, `shutdown()`. Integrations: ErrorTracker (Phase 2.2), DripAlertManager (Phase 2.3), future services. See architecture-bible/05-event-bus.md for comprehensive Event Bus design and implementation patterns.

Subrouters:
- src/shared/cache/ROUTER.md — Cache backend implementations.
- src/shared/storage/ROUTER.md — Storage adapter catalog.
- src/shared/utils/ROUTER.md — Shared utility functions catalog.
