# ROUTER
Title: Services Test Suite
Purpose: Vitest coverage for service-layer cache and recipe helpers.
Owned Globs: tests/services/**
Last Updated (UTC): 2025-11-01T15:27:00Z

Notes:
- `cache.facade.spec.ts` guards cache hit/miss metrics and eviction behaviour.
- `cache.recipes.spec.ts` validates recipe builders consumed by DM flows and workers.
- Tests mock `src/services/cache/**`; update alongside service contracts to avoid divergence.
