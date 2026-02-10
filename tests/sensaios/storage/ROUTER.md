# ROUTER
Title: SensaiOS Storage Tests
Purpose: Vitest coverage for SensaiOS storage primitives.
Owned Globs: tests/sensaios/storage/**
Last Updated (UTC): 2026-02-10T00:45:00Z

Notes:
- Content-addressable storage bounded tests validate MAX_BLOBS LRU eviction and utilization metrics.

Areas:
- content-addressable.bounded.spec.ts — CAS bounds and LRU behavior.
