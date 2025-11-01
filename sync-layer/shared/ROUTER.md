# ROUTER
Title: Sync Layer Shared Utilities
Purpose: Shared IO and logging helpers leveraged by the sync layer prototype.
Owned Globs: sync-layer/shared/**
Last Updated (UTC): 2025-11-01T15:24:00Z

Notes:
- `io.js` wraps filesystem persistence helpers for the sync worker.
- `logger.js` exposes the minimal logger so Discord and worker surfaces share consistent telemetry.
