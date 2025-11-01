# ROUTER
Title: Service Cache Recipes
Purpose: Namespaced cache facade entrypoints for battles, encounters, and quests.
Owned Globs: src/services/cache/**
Last Updated (UTC): 2025-11-01T17:30:00Z

Notes:
- `facade.ts` exposes get-or-hydrate helpers with in-memory LRU + disk persistence under /Store/runtime-cache.
- `recipes.ts` defines namespace TTLs, hydration callbacks, and invalidation hooks consumed by battle, encounter, and quest flows.
- Update docs and `/ops cache` when adding new namespaces so operators can monitor hit/miss counts and cleanup cadence.

Linked Routers:
- Store/ROUTER.md — On-disk cache namespaces backed by this facade.
- src/shared/cache/ROUTER.md — Shared cache backends that power recipe hydration.
