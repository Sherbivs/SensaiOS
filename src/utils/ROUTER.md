# ROUTER
Title: Utility Helpers
Purpose: Cross-cutting utilities for logging, CLI status output, and operational helpers.
Owned Globs: src/utils/**
Last Updated (UTC): 2025-11-09T00:00:00Z

Notes:
- Legacy CommonJS utilities still imported by scripts and command handlers.
- Keep declaration files (`*.d.ts`) synchronized with implementation exports for TypeScript callers.
- 2025-11-02: CLI status monitor now renders a stat-sheet layout with capacity/alert insights and aligns refresh cadence to 5m (30s during active alerts).
- 2025-11-09: Added output-formatter.ts centralized formatting utility for consistent CLI/script output with ESLint enforcement.

Key Files:
- activityTracker.js - Tracks user activity/co-op engagement for rate limiting.
- cliStatus.js / cliStatus.d.ts - Renders CLI dashboards used by runtime monitors.
- fatalErrorGuard.js - Wraps process-level error handling for bot/worker entrypoints.
- **intelligent-logger.ts (975 lines)** — Advanced logging system with Event Bus integration (Phase 2.4.1 COMPLETE). Features: Smart rate limiting (10 identical messages/min), automatic duplicate detection with occurrence counters, log buffering with configurable flush interval (10s default), correlation ID tracking (UUID v4 from Event Bus), severity-based filtering (error/warn/info/debug/trace), stack trace parsing with source location enrichment. **Event Bus Integration:** (1) Subscribes to `error.**` pattern (all errors) with priority 10 and backpressure control (max 100 queued errors) for error tracking. (2) **Emits to Event Bus** (Phase 2.4.1): All log calls emit to `log.<level>` topics (log.trace, log.debug, log.info, log.warn, log.error, log.fatal) with priority mapping (error/fatal/warn → 'high', trace/debug/info → 'normal') and correlation ID passthrough (parentCorrelationId in EmitOptions). **Dual Emission:** EventEmitter preserved for backward compatibility during Phase 2.4.1 transition (removal planned in Phase 2.4.3). Performance: <1ms log write, <10ms buffer flush, <5ms error subscriber handler, ~50-100μs Event Bus emission overhead. Exposes log(), error(), warn(), info(), debug(), trace(), getStats(), shutdown() API. See tests/error-tracker-bus-integration.test.ts for ErrorTracker→Logger flow, tests/utils/intelligent-logger-event-bus.test.ts for Phase 2.4.1 dual emission validation (17/17 tests passing).
- logger.js / logger.d.ts - Legacy logging abstraction consumed by older modules (being migrated to intelligent-logger.ts).
- opsNotifier.js - Sends operational alerts/DMs to staff channels.
- timezone.js - Timezone helpers for scheduling and DM messaging.
- output-formatter.ts - Centralized CLI/script output formatting utility (11 functions: formatBorder, formatSectionHeader, formatKeyValue, formatKeyValueList, formatTable, formatList, formatStatus, formatProgress, formatOutputBlock, formatSeparator, formatSection). Required for all scripts/** with ESLint enforcement.
