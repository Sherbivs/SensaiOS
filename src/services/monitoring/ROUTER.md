# ROUTER
Title: Error Monitoring & Resource Management Services
Purpose: Error tracking, pattern learning, resource monitoring, resource lifecycle management with centralized observability.
Owned Globs: src/services/monitoring/**
Last Updated (UTC): 2025-11-16T00:00:00Z

Notes:
- `error-tracker.ts` (640 lines) — Core error tracking service: creates/updates ErrorLog entries in PostgreSQL, generates fingerprints (SHA-256 of category+name+message+first 500 chars of stack), tracks occurrence counts, recovery attempts, learning metadata. Integrates with Event Bus for correlation tracking.
- `error-learning.ts` (450 lines) — Pattern learning from error history: analyzes recent errors, identifies frequent patterns, suggests recovery strategies, updates knowledge base. Consumed by error-recovery.ts for intelligent retry logic.
- `resource-monitor.ts` (380 lines) — System resource monitoring: tracks memory usage, heap statistics, event loop lag, CPU usage. Emits warnings at 75% thresholds, critical alerts at 90%. Integrates with logger auto-refresh for live stats display.
- `resource-manager.ts` (1097 lines) — Resource lifecycle management: tracks timers (interval/timeout), event listeners, database connections, disk caches, disk buffers, disk logs. Enforces per-owner limits (timers: 20, listeners: 30, connections: 10). Provides centralized cleanup on process exit. Performance: <1ms registration overhead.
- `index.ts` (45 lines) — Barrel exports with namespace exports (ErrorTracking, ErrorLearning, ResourceMonitoring, ResourceManagement) to avoid naming collisions.
- Integration: Bot layer uses barrel exports (`from '../../services/monitoring/index.js'`). Admin commands expose monitoring stats via `/ops` command suite.

Linked Routers:
- src/bot/ops/admin.ts — Admin commands display monitoring stats, error summaries, resource usage.
- src/bot/error-handler.ts — Bot layer error handling uses monitoring/index.js barrel exports.
- src/shared/event-bus.ts — Event Bus integration for correlation tracking and pattern matching.
- src/shared/service-factories.ts — Service factory uses resource-manager for lifecycle management.
- tests/shared/error-tracker-mocks.ts — Centralized test mock factory (8 functions, 200+ lines).

Areas:
- `error-tracker.ts` — Core error tracking: ErrorLog CRUD operations, fingerprint generation, occurrence counting, recovery tracking, learning metadata management. Used by 14+ files across bot layer, core engines, workers.
- `error-learning.ts` — Pattern learning: analyzes error history, identifies frequent patterns (by category, severity, fingerprint), suggests recovery strategies based on success rates, updates knowledge base. Consulted by error-recovery service.
- `resource-monitor.ts` — Resource monitoring: memory usage (RSS, heap used/total, external, array buffers), heap statistics (detailed V8 heap breakdown), event loop lag, CPU usage. Emits warnings/alerts, integrates with logger auto-refresh.
- `resource-manager.ts` — Resource lifecycle management: registers timers (registerInterval, registerTimeout), event listeners (registerListener), database connections (registerConnection), disk resources (registerDiskCache, registerDiskBuffer, registerDiskLog). Tracks ownership per service/component. Enforces limits: maxTimersPerOwner (20), maxListenersPerOwner (30), maxConnectionsPerOwner (10). Provides cleanup APIs: cleanupByOwner(owner), cleanupAll(). Auto-cleanup on SIGTERM/SIGINT/uncaughtException. Used by service-factories.ts for service lifecycle management. Performance: <1ms registration, automatic leak detection.
- `index.ts` — Barrel export with namespace exports to prevent naming collisions when importing multiple monitoring services. Exports resource-manager singleton + types (ResourceStats, ResourceType, ResourceHandle variants, ResourceLimits).
