# ROUTER
Title: Monitoring Service Tests
Purpose: Vitest coverage for monitoring-layer helpers and bounded memory metrics reporting.
Owned Globs: tests/services/monitoring/**
Last Updated (UTC): 2026-02-10T16:05:00Z

Notes:
- Validates bounded memory metrics collection and formatting used by `/ops memory`.

Areas:
- memory-metrics.spec.ts — Covers bounded-structure metrics, warnings, and formatting output.
