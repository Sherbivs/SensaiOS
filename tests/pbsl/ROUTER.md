# ROUTER
Title: PBSL Test Harness
Purpose: Vitest suites and fixtures validating the PBSL deterministic battle engine.
Owned Globs: tests/pbsl/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Specs cover RNG determinism, provenance tracking, and oracle diffing against curated fixtures.
- Keep fixtures in sync with `src/core/pbsl/**`; update provenance metadata when schemas evolve.

Subdirectories:
- fixtures/ — Canonical battle snapshots exercised by `oracle.spec.ts`; see tests/pbsl/fixtures/ROUTER.md for notes on regeneration.
