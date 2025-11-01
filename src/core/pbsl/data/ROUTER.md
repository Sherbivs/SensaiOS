# ROUTER
Title: PBSL Provenance Data
Purpose: Provenance helpers and metadata used to stamp deterministic battle/encounter fixtures.
Owned Globs: src/core/pbsl/data/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Builds provenance envelopes attached to audit events for compliance checks.
- Exported helpers normalize upstream fixture metadata before PBSL validation runs.

Key Files:
- provenance.ts — Utility helpers for constructing provenance records consumed by audit trails.

Linked Routers:
- src/core/pbsl/ROUTER.md — PBSL deterministic engine overview.
- tests/pbsl/ROUTER.md — Fixtures referencing provenance helpers.
