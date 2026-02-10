# ROUTER
Title: Services Test Suite
Purpose: Vitest coverage for service-layer cache and recipe helpers.
Owned Globs: tests/services/**
Last Updated (UTC): 2026-02-10T16:05:00Z

Notes:
- `cache.facade.spec.ts` guards cache hit/miss metrics and eviction behaviour.
- `cache.recipes.spec.ts` validates recipe builders consumed by DM flows and workers.
- `player-resolver.bounded.spec.ts` validates PlayerResolver cache bounds and LRU eviction.
- `discord-identity.bounded.spec.ts` validates Discord identity cache bounds and LRU eviction.
- `ai/ai-log-analyzer.bounded.spec.ts` validates AI log analyzer knowledge base bounds and LRU refresh.
- `error-brain/detector-maps.bounded.spec.ts` validates Error Brain fingerprint map bounds and prune behavior.
- `monitoring/memory-metrics.spec.ts` validates bounded memory metrics collection and formatting.
- `prometheus-metrics.spec.js` tests Prometheus metrics collection and HTTP server.
- `role-assignment.spec.js` tests unified role assignment logic.
- Tests mock `src/services/cache/**`; update alongside service contracts to avoid divergence.

**⚠️ ARCHIVED TESTS (2025-12-20 Dead Code Cleanup Meeting #4):**
- ~~rls-context.spec.ts (286 lines)~~ — Orphan test for deleted `rls-context.ts`
- ~~statistics-window.spec.js (511 lines)~~ — Orphan test with structural issues
- ~~performance-optimizer.spec.js (625 lines)~~ — References non-existent `performanceOptimizer.js`
- ~~prometheus-exporter.spec.js (521 lines)~~ — References non-existent `prometheusExporter.js`
- ~~events.spec.ts (289 lines)~~ — Source directory `src/services/events/` never existed
- ~~profiles.spec.ts (412 lines)~~ — Source directory `src/services/profiles/` never existed
