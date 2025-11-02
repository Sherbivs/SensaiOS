# ROUTER
Title: Utility Helpers
Purpose: Cross-cutting utilities for logging, CLI status output, and operational helpers.
Owned Globs: src/utils/**
Last Updated (UTC): 2025-11-02T20:09:24Z

Notes:
- Legacy CommonJS utilities still imported by scripts and command handlers.
- Keep declaration files (`*.d.ts`) synchronized with implementation exports for TypeScript callers.
- 2025-11-02: CLI status monitor now renders a stat-sheet layout with capacity/alert insights and aligns refresh cadence to 5m (30s during active alerts).

Key Files:
- activityTracker.js - Tracks user activity/co-op engagement for rate limiting.
- cliStatus.js / cliStatus.d.ts - Renders CLI dashboards used by runtime monitors.
- fatalErrorGuard.js - Wraps process-level error handling for bot/worker entrypoints.
- logger.js / logger.d.ts - Logging abstraction consumed by legacy modules.
- opsNotifier.js - Sends operational alerts/DMs to staff channels.
- timezone.js - Timezone helpers for scheduling and DM messaging.
