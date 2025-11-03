# ROUTER
Title: Test Suite
Purpose: Vitest coverage for schemas, pipeline, engines, and flows.
Owned Globs: tests/**
Last Updated (UTC): 2025-11-03T00:15:00Z

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
- 2025-11-01: `tests/battle_engine.spec.ts` asserts priority ordering, status interactions, flinch skips, and the early-item pool documented in `RULESET.md`.
- 2025-11-02: `tests/dexpack.v2.spec.ts` toggles the DEX v2 flag and verifies the binary hash guard rejects tampered manifests.
- 2025-11-02: `tests/dexpack.parity.spec.ts` compares v1/v2 lookups, stats, and move metadata to guard the compatibility bridge.
- 2025-11-03: `tests/dexpack.parity.spec.ts` now walks every v1 alias to confirm the v2 hash tables resolve identical species ids.
- 2025-11-02: `tests/dexpack.microbench.ts` provides an opt-in vitest bench harness (`DEX_V2_BENCH=1 npm run bench:dex`) for lookup latency tracking.
- Dedicated sub-routers capture focused suites (battle interactions, PBSL fixtures) for faster discovery.

Subrouters:
- tests/battle/ROUTER.md — Interaction tests for Discord battle prompts.
- tests/pbsl/ROUTER.md — PBSL harness overview and specs.
- tests/pbsl/fixtures/ROUTER.md — Canonical deterministic snapshots consumed by oracle tests.
