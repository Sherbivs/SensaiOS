# ROUTER
Title: PBSL Test Harness
Purpose: Vitest suites and fixtures validating the PBSL deterministic battle engine.
Owned Globs: tests/pbsl/**
Last Updated (UTC): 2025-11-01T15:26:00Z

Notes:
- Specs cover RNG determinism, provenance tracking, and oracle diffing against curated fixtures.
- Keep fixtures in sync with `src/core/pbsl/**`; update provenance metadata when schemas evolve.

Subdirectories:
- fixtures/ — Canonical battle snapshots exercised by `oracle.spec.ts`; regenerate via PBSL tooling and review diffs carefully.
