# ROUTER
Title: PBSL Encounter Engine
Purpose: Deterministic encounter generator that mirrors live encounter semantics for PBSL validation.
Owned Globs: src/core/pbsl/encounter/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Generates deterministic encounter payloads driven by seeded RNG to match oracle fixtures.
- Reuses provenance helpers so encounters carry audit-ready metadata.

Key Files:
- generator.ts — Deterministic encounter generator consumed by PBSL fixtures and tests.

Linked Routers:
- src/core/pbsl/ROUTER.md — PBSL deterministic engine overview.
- tests/pbsl/ROUTER.md — PBSL fixtures and specs verifying encounter parity.
