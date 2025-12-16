# ROUTER
Title: Shared Runtime & Utilities
Purpose: Centralized runtime config, Prisma bootstrap, logging, caching, constants, and shared data access layers.
Owned Globs: src/shared/**
Last Updated (UTC): 2025-12-16 (Phase 5: Event Bus typed payloads)

Notes:
- **Phase 5 (2025-12-16):** Event Bus refactored with typed event payloads. `event-types.ts` defines 17+ payload interfaces (`ErrorEventPayload`, `ThreatDetectedPayload`, `BattleStartedPayload`, etc.) and `EventTopicMap` for compile-time type safety. `BusEvent<T>` now generic. Overloaded `emit()` and `subscribe()` provide type inference for known topics while preserving flexibility for custom events.
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
- **event-types.ts (420+ lines)** — **NEW** Typed event payload interfaces for Event Bus. Defines `EventTopicMap` mapping topics to payloads: `ErrorEventPayload` (error.{severity}), `ThreatDetectedPayload` (threat.detected), `HomesteadCreatedPayload` (homestead.created), `BattleStartedPayload/BattleEndedPayload/BattleTurnPayload` (battle.*), `CacheMaintenancePayload/CacheAccessPayload` (cache.*), `WorkerStartedPayload/WorkerStoppedPayload/WorkerErrorPayload` (worker.*), `SystemStartupPayload/SystemShutdownPayload/SystemHealthPayload` (system.*), `AlertPayload` (alert.*). Exports: `EventTopic`, `EventPayload<T>`, `AnyEventPayload`, type guards for known topics.
- **event-bus.ts (720+ lines)** — Singleton Event Bus with typed payloads. `BusEvent<T>` generic, `emit<T>()` overloaded for type inference, `subscribe<T>()` overloaded for typed handlers. Features: pattern matching (exact, single-level `*`, multi-level `**`), priority-based subscription ordering, backpressure protection (maxQueueSize limits), replay buffer (last 100 events FIFO), correlation ID chaining (parentCorrelationId for event genealogy), sync/async handler support, graceful shutdown with draining. Exports all event types from event-types.ts. API: `getInstance()`, `emit(topic, payload, options)`, `subscribe(pattern, handler, options)`, `getReplayBuffer()`, `getStats()`, `shutdown()`.
- constants.ts — **NEW** Centralized application constants (game settings, timeouts, cache limits, monitoring thresholds) organized into 4 groups with backwards-compatible exports
- datetime.js — **ENHANCED** (2025-11-16) Eastern Time (EST/EDT) timezone utilities. Single source of truth for all timestamp formatting. Exports: `toEasternString()`, `toEasternTime()`, `toEasternDate()`, `toEasternLogFormat()` (high-precision console logging), `formatInTimeZone()` (generic timezone support), `msUntilNextZonedTime()` (scheduling helper, migrated from deprecated src/utils/timezone.js). Used by: bot/dripAlerts.js (digest scheduling), models/index.ts (timestamp formatting), utils/cliStatus.js (console output), services/monitoring/error-tracker.ts (error timestamps).
- config.ts — runtime/env loader
- prisma.ts — Dual Prisma client singleton (PROD `prisma` + DEV `devPrisma`), ensures both connections, exports `getDatabaseStats(): DualDatabaseStats`
- cache/memory.ts — memory cache implementation
- outbox.ts — compatibility helpers layered on the event bus
- log.ts — structured logger used across bots/workers
- worker-runtime.ts — shared worker bootstrap + signal handling utilities
- utils/ — Shared utility functions (format, error, async, math, URL) with barrel export at `utils/index.ts`

Subrouters:
- src/shared/cache/ROUTER.md — Cache backend implementations.
- src/shared/storage/ROUTER.md — Storage adapter catalog.
- src/shared/utils/ROUTER.md — Shared utility functions catalog.
