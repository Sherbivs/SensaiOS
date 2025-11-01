# ROUTER
Title: PBSL Battle Engine
Purpose: Deterministic battle resolution mirroring live engine phases for PBSL verification.
Owned Globs: src/core/pbsl/battle/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Implements battle resolution using deterministic RNG and audit trails supplied by the PBSL core.
- Hooks into phase definitions so oracle fixtures can assert order-of-operations consistency.
- Keep logic aligned with `src/core/battle/**` when parity fixes ship.

Key Files:
- engine.ts — Deterministic battle resolver used by PBSL oracle fixtures.

Linked Routers:
- src/core/pbsl/ROUTER.md — PBSL deterministic engine overview.
- tests/pbsl/ROUTER.md — Fixtures and specs consuming the deterministic battle engine.
