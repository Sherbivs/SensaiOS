# ROUTER
Title: PBSL Fixture Snapshots
Purpose: Canonical deterministic battle snapshots consumed by PBSL oracle tests.
Owned Globs: tests/pbsl/fixtures/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Fixtures capture battle logs and provenance data used to diff the PBSL engine against upstream outputs.
- Update snapshots via the PBSL tooling when engine changes land, and review diffs carefully before committing.

Key Files:
- README.md — Explains fixture generation and review process.
- basic-turn.json — Reference snapshot for a minimal deterministic turn.

Linked Routers:
- tests/pbsl/ROUTER.md — PBSL test harness overview.
- src/core/pbsl/ROUTER.md — Deterministic engine modules that consume the fixtures.
