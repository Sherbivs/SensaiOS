# ROUTER
Title: Test Suite
Purpose: Vitest coverage for schemas, pipeline, engines, and flows.
Owned Globs: tests/**
Last Updated (UTC): 2026-02-10T16:05:00Z

Notes:
- Added coverage for `concludeBattleWithVictory` alongside existing persistence and announcer tests.
- Ops stats spec now checks for recent battle summaries when Prisma data is mocked.
- Ops stats spec exercises limit/after filters and empty window messaging to keep admin reporting deterministic.
- Ops stats spec validates participant filtering, invalid-input messaging, and scoped empty results.
- Ops cache spec snapshots cache metrics, verifies cleanup triggers, and guards hit/miss counters against regression.
- Keep tests hermetic and deterministic; seed RNG where applicable.
- `tests/daily.spec.ts` covers daily quest claim success and cooldown blocking scenarios.
- `tests/dm_home_views.spec.ts` snapshots the DM Home party/box/profile embeds, including pagination buttons.
- `tests/pbsl/**` validates the new PBSL RNG, battle engine scaffold, and provenance helpers for deterministic compliance; see `tests/pbsl/ROUTER.md` for suite structure.
- PBSL oracle diff suite compares curated fixtures against upstream outputs nightly to detect regressions.
- `tests/services/ROUTER.md` tracks cache facade regression coverage; `tests/shared/ROUTER.md` documents cross-suite fixtures.
- `tests/services/ai/ROUTER.md` captures AI service knowledge base bound coverage.
- 2025-11-01: `tests/battle_engine.spec.ts` asserts priority ordering, status interactions, flinch skips, and the early-item pool documented in `RULESET.md`.
- 2025-11-02: `tests/dexpack.v2.spec.ts` toggles the DEX v2 flag and verifies the binary hash guard rejects tampered manifests.
- 2025-11-02: `tests/dexpack.parity.spec.ts` compares v1/v2 lookups, stats, and move metadata to guard the compatibility bridge.
- 2025-11-03: `tests/dexpack.parity.spec.ts` now walks every v1 alias to confirm the v2 hash tables resolve identical species ids.
- 2025-11-02: `tests/dexpack.microbench.ts` provides an opt-in vitest bench harness (`DEX_V2_BENCH=1 npm run bench:dex`) for lookup latency tracking.
- Dedicated sub-routers capture focused suites (battle interactions, PBSL fixtures) for faster discovery.
- 2026-02-09: `tests/memory/phase1-integration.spec.ts` validates Phase 1 memory leak fixes (C1/C2/C7) under simulated load.
- 2026-02-10: `tests/memory/phase2-integration.spec.ts` validates Phase 2 bounded structures under simulated load.
- 2026-02-10: `tests/memory/bounded-verification.spec.ts` stress-tests 19 bounded structures and heap growth limits.
- 2026-02-10: `tests/services/monitoring/memory-metrics.spec.ts` validates bounded memory metrics collection and formatting.
- 2026-02-10: `tests/sensaios/storage/content-addressable.bounded.spec.ts` validates CAS MAX_BLOBS LRU eviction and utilization metrics.
- 2025-11-09: `tests/engine-db/cache.test.ts` validates L1 cache LRU eviction policy with 9 new tests covering lastAccessed tracking, eviction counts, cache miss fallback, hit rate calculation (>95% target), memory footprint reduction (60%, 20MB → 8MB), and maxEntries limits (500 Pokemon, 200 Moves).
- 2025-11-09: `tests/engine-db/cache.test.ts` includes Read-DB fallback tests verifying cache miss recovery (<5ms penalty) and hit rate maintenance under LRU eviction workloads.
- **2025-11-11: Event Bus Integration Tests (Phase 2.2.4)** — `tests/error-tracker-bus-integration.test.ts` validates ErrorTracker→Event Bus→Logger integration with 23 comprehensive tests (100% passing). Test categories: Event emission (4 tests - topic routing, correlation IDs, parent chaining), pattern subscriptions (3 tests - wildcards, exact match, multiple patterns), event replay (4 tests - buffer limits, pattern filtering, timestamp filtering, late subscribers), backpressure control (3 tests - queue limits, drop-oldest strategy, statistics tracking), correlation tracking (3 tests - unique IDs, parent-child chaining, payload inclusion), full integration (3 tests - ErrorTracker→Logger flow, multiple subscribers, error resilience), graceful shutdown (3 tests - drain subscriptions, clear state, cleanup buffers). All tests validate UUID v4 correlation IDs, pattern matching (error.**), replay buffer (100 events FIFO), backpressure (max queue size), and graceful cleanup. Performance validation: <1ms emit latency, <10ms handler invocation, ~15KB memory overhead.
- **2025-11-11: DripAlertManager Event Bus Migration Tests (Phase 2.3)** — Three validation suites covering DripAlertManager Event Bus integration:
  - `tests/dripalert-bus-phase2.3.1-validation.test.ts` — Event Bus emission validation (9 tests, 100% passing). Validates alert emission to correct topics (alert.critical, alert.security, alert.warning, alert.notice), correlation ID generation (UUID v4 format), Event Bus replay buffer population, payload structure (severity, title, meta, timestamp, recipient).
  - `tests/dripalert-bus-phase2.3.2-validation.test.ts` — Event Bus subscription validation (8 tests, 100% passing). Validates subscription creation on start (2 subscriptions: immediate + digest), priority levels (immediate=20, digest=10), topic patterns (alert.critical|alert.security, alert.warning|alert.notice), subscription cleanup on stop.
  - `tests/dripalert-bus-phase2.3.4-integration.test.ts` — End-to-end integration tests (12 tests, 6 passing, 6 WIP). Passing tests: Critical/security immediate delivery via Event Bus subscriptions, warning/notice queuing in replay buffer, digest delivery with multiple alerts, digest skip when empty. WIP tests: Failure retry re-emission, subscription lifecycle, correlation ID propagation (requires test isolation improvements).
  - Total: 29 tests (23 passing, 6 WIP), validates complete Event Bus migration from in-memory queue architecture. See architecture-bible/05-event-bus.md for Event Bus architecture and development-bible/02-testing-guidelines.md for testing patterns.

**⚠️ ARCHIVED TESTS (2025-12-20 Dead Code Cleanup Meeting #4):**

**Source Module Orphans (tests for deleted source files):**
- ~~tests/services/rls-context.spec.ts (286 lines)~~ — **REMOVED** — Source module `rls-context.ts` deleted.
- ~~tests/services/statistics-window.spec.js (511 lines)~~ — **REMOVED** — Test file had structural issues.
- ~~tests/services/events.spec.ts (289 lines)~~ — **REMOVED** — Source directory `src/services/events/` never existed.
- ~~tests/services/profiles.spec.ts (412 lines)~~ — **REMOVED** — Source directory `src/services/profiles/` never existed.

**Non-Existent Source Module Orphans:**
- ~~tests/services/performance-optimizer.spec.js (625 lines)~~ — **REMOVED** — References non-existent `performanceOptimizer.js`.
- ~~tests/services/prometheus-exporter.spec.js (521 lines)~~ — **REMOVED** — References non-existent `prometheusExporter.js`.
- ~~tests/security/behavioral-analysis.spec.js (510 lines)~~ — **REMOVED** — References non-existent `behavioralAnalysis.js`.
- ~~tests/security/cache-invalidation.spec.js (406 lines)~~ — **REMOVED** — Pure mock tests with no source imports.
- ~~tests/security/crypto/crypto-provider.test.ts (560 lines)~~ — **REMOVED** — Source directory `src/bot/security/crypto/` never existed.

**Entire Test Directories Removed:**
- ~~tests/db-replication/ (7 files, 2,816 lines)~~ — **REMOVED** — Source directory `src/services/db-replication/` never existed.
  - cli.test.ts (246), end-to-end.test.ts (451), integration.test.ts (192), integrity.test.ts (725), monitoring.test.ts (438), sync.test.ts (312), version.test.ts (452)
- ~~tests/engine-db/ (3 files, 955 lines)~~ — **REMOVED** — Source modules `engine-cache.ts`, `engine-write-buffer.ts` never existed.
  - buffer.test.ts (310), cache.test.ts (291), write-db-stress.test.ts (354)
- ~~tests/shared/backup-sink.spec.ts (61 lines)~~ — **REMOVED** — Source module `backup-sink.ts` never existed.

**Total Orphan Test Lines Removed:** ~7,390 lines

Subrouters:
- tests/battle/ROUTER.md — Interaction tests for Discord battle prompts.
- tests/memory/ROUTER.md — Phase 1 memory leak integration coverage.
- tests/sensaios/storage/ROUTER.md — SensaiOS storage primitive tests.
- tests/pbsl/ROUTER.md — PBSL harness overview and specs.
- tests/pbsl/fixtures/ROUTER.md — Canonical deterministic snapshots consumed by oracle tests.
