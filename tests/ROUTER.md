# ROUTER
Title: Test Suite
Purpose: Vitest coverage for schemas, pipeline, engines, and flows.
Owned Globs: tests/**
Last Updated (UTC): 2025-10-26T12:20:00Z

Notes:
- Added coverage for `concludeBattleWithVictory` alongside existing persistence and announcer tests.
- Ops stats spec now checks for recent battle summaries when Prisma data is mocked.
- Ops stats spec exercises limit/after filters and empty window messaging to keep admin reporting deterministic.
- Ops stats spec validates participant filtering, invalid-input messaging, and scoped empty results.
- Keep tests hermetic and deterministic; seed RNG where applicable.
- `tests/daily.spec.ts` covers daily quest claim success and cooldown blocking scenarios.
