# ROUTER
Title: Shared Test Utilities
Purpose: Common test fixtures, mocks, and assertions shared across the Vitest suite.
Owned Globs: tests/shared/**
Last Updated (UTC): 2025-11-16T00:00:00Z

Notes:
- **Phase 7 Enhancement (2025-11-16):** Added centralized mock factory pattern to eliminate test code duplication.
- `error-tracker-mocks.ts` (200+ lines) — Comprehensive mock factory for error tracker tests with 8 reusable functions. Eliminated ~160 lines of duplicate code across 4 test files.
- `prisma-mocks.ts` — Centralized Prisma client mocks (existing infrastructure, low adoption rate before Phase 7).
- `pool-mocks.ts` — Database connection pool mocks.
- `index.ts` — Barrel export for all shared test utilities (assertions, fixtures, mocks).
- Use this space for cross-suite helpers; document new utilities so domain routers know where shared behaviour resides.

**Mock Factory Functions (error-tracker-mocks.ts):**
- `createMockErrorLog()` — Single ErrorLog with overrides, sensible defaults.
- `createMockErrorLogs()` — Batch generation with incremental IDs.
- `mockPrismaWithErrorLog()` — Full Prisma client mock with all CRUD methods.
- `mockLogger()` — Logger mock with standard methods.
- `mockEventBus()` — Event Bus mock with emit/on/off methods.
- `createErrorLogBatch()` — Pre-categorized test data sets (DATABASE errors, NETWORK errors, etc.).
- `createFrequentError()` — High occurrence count mocks for pattern testing.
- `createLearnedError()` — Mocks with learning metadata for knowledge base tests.

**Adoption:**
- 4 error tracker test files migrated to centralized mocks: error-tracker.test.ts, error-learning.test.ts, error-recovery.test.ts, error-alerting.test.ts.
- Pattern: Import from `'./shared/index.js'`, use in vi.mock() calls for consistent test setup.

Linked Routers:
- tests/ROUTER.md — Main test suite router with coverage map.
- src/services/monitoring/ROUTER.md — Error tracking services tested by these mocks.
