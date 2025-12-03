# ROUTER
Title: Shared Runtime & Utilities
Purpose: Centralized runtime config, Prisma bootstrap, logging, caching, constants, and shared data access layers.
Owned Globs: src/shared/**
Last Updated (UTC): 2025-12-04 (DB-First observability system: console-renderer, log-aggregator, system-health-monitor, observability)

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
- **DB-First Observability System (2025-12-04):** Complete observability stack with database as single source of truth. Architecture: App → Logger → DATABASE → ConsoleRenderer → Render Console. Components: console-renderer (polling/rendering), log-aggregator (pattern detection), system-health-monitor (health scoring), observability (unified init).

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
- **console-interceptor.ts (280 lines)** — **NEW 2025-12-03** Console capture system for unified ingestion. Intercepts all console.log/warn/error/debug calls, parses structured patterns (component, step, duration, key-value), buffers entries (500 max, 10s flush), stores in `console_outputs` table. API: `installConsoleInterceptor(serviceName)`, `uninstallConsoleInterceptor()`, `getConsoleInterceptorStats()`, `forceFlush()`, `getOriginalConsole()`.
- **metrics-collector.ts (265 lines)** — **NEW 2025-12-03** Worker performance telemetry collector. Polls all database workers every 15s, captures health status, latency, throughput, buffer utilization, stores in `worker_metrics` table. API: `startMetricsCollection(options)`, `stopMetricsCollection()`, `forceCollect()`, `getCollectionStats()`, `setCollectionInterval()`.
- **log-query-views.ts (380 lines)** — **NEW 2025-12-03** Pre-built SQL queries for log/metrics/console analytics. Provides time-bounded queries for dashboards, /ops commands, and reporting. API: `getLogViews()` returning object with: `recentLogs()`, `logCountsByLevel()`, `logCountsByComponent()`, `logsForCorrelation()`, `errorRateByHour()`, `workerHealthSummary()`, `workerMetricsTimeline()`, `unhealthyWorkers()`, `recentConsoleOutputs()`, `systemHealthOverview()`, `recentActivityTimeline()`.
- **console-renderer.ts (~420 lines)** — **NEW 2025-12-04** DB-First console output system. Polls `log_entries` and `console_outputs` tables, renders human-friendly formatted output to Render console with emoji icons, color coding, component grouping, and worker health dashboards. Architecture: DATABASE → ConsoleRenderer → Render Console. API: `initConsoleRenderer(prisma, options)`, `startConsoleRenderer()`, `stopConsoleRenderer()`, `getRendererStats()`, `queryAndDisplayLogs()`, `displayHealthDashboard()`.
- **log-aggregator.ts (~385 lines)** — **NEW 2025-12-04** Intelligent backend "super brain" for log analytics. Pattern detection (normalizes messages, detects repeated errors), correlation grouping (tracks correlationId chains), error spike detection (compares current vs baseline rates), performance trend analysis (p50/p95/p99 latency tracking), anomaly detection (auto-generates alerts). API: `initLogAggregator(prisma, options)`, `runAggregation()`, `getPatterns()`, `getCorrelations()`, `getAnomalies()`, `getPerformanceTrends()`.
- **system-health-monitor.ts (~380 lines)** — **NEW 2025-12-04** Real-time health scoring and alerting system. Calculates component health scores (0-100) based on error rate, latency, success rate, throughput. Tracks trends (improving/stable/degrading), generates alerts with cooldown, runs health checks (database, memory). API: `initHealthMonitor(prisma, options)`, `startHealthMonitor()`, `stopHealthMonitor()`, `getSystemHealth()`, `getComponentHealth(name)`, `forceHealthCycle()`, `acknowledgeAlert()`.
- **observability.ts (~205 lines)** — **NEW 2025-12-04** Unified initialization module for DB-First observability system. Single entry point to initialize, start, and shutdown all observability components (ConsoleRenderer, MetricsCollector, LogAggregator, HealthMonitor). Feature flags for selective component enablement. API: `initializeObservability(prisma, config)`, `startObservability()`, `shutdownObservability()`, `getObservabilityStatus()`, `getObservabilityConfig()`, `runAggregationNow()`.

Subrouters:
- src/shared/cache/ROUTER.md — Cache backend implementations.
- src/shared/storage/ROUTER.md — Storage adapter catalog.
- src/shared/utils/ROUTER.md — Shared utility functions catalog.
