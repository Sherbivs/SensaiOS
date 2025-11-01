# ROUTER
Title: Runtime Supervisors
Purpose: Supervisors and orchestration helpers invoked by long-lived automation.
Owned Globs: src/runtime/**
Last Updated (UTC): 2025-11-01T15:20:00Z

Notes:
- `autoSync.ts` launches `scripts/dev_prod_auto_sync.ts` under a restart-on-exit supervisor so Render workers can keep database sync loops running.
- Restart delay is fixed at 30s to avoid tight thrash after repeated exits; disposer clears timers and terminates the child cleanly.

Key Files:
- autoSync.ts — spawns the auto-sync loop with a shutdown handle returned to callers.
