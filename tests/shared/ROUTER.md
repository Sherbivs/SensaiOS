# ROUTER
Title: Shared Test Utilities
Purpose: Common test fixtures and sinks shared across the Vitest suite.
Owned Globs: tests/shared/**
Last Updated (UTC): 2025-11-01T15:28:00Z

Notes:
- `backup-sink.spec.ts` ensures backup/logging sinks remain deterministic under mocked IO.
- Use this space for cross-suite helpers; document new utilities so domain routers know where shared behaviour resides.
