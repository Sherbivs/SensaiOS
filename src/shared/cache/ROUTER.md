# ROUTER
Title: Shared Cache Backends
Purpose: Reusable cache primitives consumed by services and workers.
Owned Globs: src/shared/cache/**
Last Updated (UTC): 2025-11-01T16:20:00Z

Notes:
- `memory.ts` provides the default TTL cache implementation used before the facade hydrates data to disk.
- `ttl-lru.ts` wraps the lightweight LRU backend underlying the facade; tune limits here when adjusting runtime budgets.
- Coordinate changes with src/services/cache recipes to keep cache metrics and eviction semantics aligned.
