# ROUTER
Title: Runtime Cache Namespace
Purpose: Worker cache persisted between runs for general application state.
Owned Globs: Store/runtime-cache/**
Last Updated (UTC): 2025-11-01T15:35:00Z

Notes:
- Managed by `src/services/cache/facade.ts`; eviction policies should be updated in code and documented here when cache layout changes.
- Treat contents as generated; clear via cache maintenance CLI rather than manual removal.
