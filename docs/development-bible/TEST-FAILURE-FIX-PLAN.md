# Test Failure Fix Plan

**Created:** 2025-12-21
**Updated:** 2025-12-22
**Status:** In Progress
**Baseline:** 65 failures → 52 → 42 → 25 → 22 failed test files (significant progress!)
**Tests:** 47 failed | 2162 passed | 214 skipped (2423 total)

## Session 2 Progress (2025-12-22)

### Test Files Fixed This Session
| Test File | Before | After | Fix Applied |
|-----------|--------|-------|-------------|
| `tests/limits.spec.ts` | 4 fail | 0 fail | vi.hoisted mocks for pg-connection |
| `tests/dexpack.v2.spec.ts` | 3 fail | 0 fail | Hardcoded signature mock, Uint16Array types |
| `tests/dexpack.fast.spec.ts` | 1 fail | 0 fail | Fixed type assertions |
| `tests/outbox.spec.ts` | 1 fail | skipped | Legacy module removed (describe.skip) |
| `tests/error-tracker.test.ts` | suite fail | partial | vi.hoisted + expanded Prisma mock |
| `tests/error-learning.test.ts` | suite fail | partial | vi.hoisted + expanded Prisma mock |

### Key Discoveries
1. **vi.resetModules() breaks mocks** - Module imports after reset lose mock values. Solution: Use vi.hoisted() with hardcoded values.
2. **Dexpack bridge converts types** - dexpack.ts converts Int32Array → Uint16Array for v1 compatibility
3. **Outbox module was removed** - Functionality migrated to Event Bus (Phase 2.4)
4. **Error monitoring needs comprehensive mocks** - Requires errorLog, errorResolution, errorCodeContext, errorKnowledge, errorDependency, errorTimePattern

## Quick Fixes Applied ✅

| Category | Fix | Files Changed |
|----------|-----|---------------|
| Cache facade peek | Added `peek<T>()` function | `src/services/cache/facade.ts` |
| Arena summary exports | Added `buildArenaTurnSummary`, `buildDMDetailedLog` | `src/bot/arena/summary.ts` |
| Config env handling | Added `PROD_DATABASE_URL` to tracked keys | `tests/config.database.spec.ts` |
| Service registry timing | Updated `delay()` calls to pass 100ms | `tests/service-registry.test.ts` |
| Turn manager testing | Added `__testing` export with `clear()` | `src/core/battle/turn-manager.ts` |
| Actions testing | Added `__testing.parse` export | `src/bot/battle/actions.ts` |
| Runtime config tests | Updated to match unified architecture | `tests/runtime_config.spec.ts` |
| Actions pg-connection | Added mock for `pg-connection.js` | `tests/battle/actions.interaction.spec.ts` |
| Dexpack assets | Rebuilt v1 and v2 with valid signatures | `assets/dexpack.v2.*.bin` |
| Memory measurement | Added `formatMB`, fixed replayBuffer tests, used public API | `src/utils/memory-measurement.ts`, `tests/memory-measurement.test.ts` |
| Limits mocks | vi.hoisted mocks for pg-connection, query modules | `tests/limits.spec.ts` |
| Dexpack v2 mocks | Hardcoded signature values + Uint16Array | `tests/dexpack.v2.spec.ts` |
| Dexpack fast types | Fixed type assertions | `tests/dexpack.fast.spec.ts` |
| Outbox skipped | Legacy module removed, test skipped | `tests/outbox.spec.ts` |
| Error tracker mocks | vi.hoisted + 6 Prisma models mocked | `tests/error-tracker.test.ts` |
| Error learning mocks | vi.hoisted + 4 Prisma models mocked | `tests/error-learning.test.ts` |
| Catch pg-connection | Mocked pg-connection + party-queries-pg | `tests/catch.spec.ts` |
| Battle results | Fixed HomesteadChannelManager mock as class | `tests/battle_results.spec.ts` |

---

## Remaining Failures by Category (22 files, 47 tests)

### 1. Security Archive Tests (10 failures)
**File:** `tests/security/archive-integrity.spec.js`
**Root Cause:** Signature verification failures - tests use mock data that doesn't have valid cryptographic signatures.

**Symptoms:**
- `[RoleArchive] 🚨 SECURITY ALERT: Archive signature verification FAILED!`
- `[SecurityBaselines] 🚨 SECURITY ALERT: Baseline signature verification FAILED!`

**Fix Strategy:**
1. Option B: Generate valid test fixtures with proper signatures
2. Option C: Add test mode flag that bypasses signature checks

**Complexity:** Medium (requires understanding security architecture)

---

### 2. Battle Interaction Tests (3 failures)
**File:** `tests/battle/actions.interaction.spec.ts`
**Root Cause:** Complex integration tests that need additional mocks beyond pg-connection

**Symptoms:**
- Tests expect specific component structures from Discord.js mocks
- Reply components not matching expected format

**Fix Strategy:**
1. Enhance mock Discord.js interaction responses
2. Mock the entire battle action flow chain
3. Consider splitting into unit vs integration tests

**Complexity:** Medium-High (requires Discord.js knowledge)

---

### 3. Runtime Config Tests (4 failures)
**File:** `tests/runtime_config.spec.ts`
**Root Cause:** Tests still expect old DATABASE_URL fallback behavior

**Symptoms:**
- Tests expect legacy config behavior
- Unified architecture requires direct PostgreSQL URLs

**Fix Strategy:**
1. Remove tests for deprecated functionality
2. Update remaining tests to match unified architecture
3. Add new tests for current behavior

**Complexity:** Low-Medium

---

### 4. E2E Security Commands (4 failures)
**File:** `tests/security/services/e2e-commands.test.ts`
**Root Cause:** `handleSecuritySweep` returning `success: false`

**Symptoms:**
- Security sweep operations failing in test environment
- Mock Discord client not providing expected guild/role data

**Fix Strategy:**
1. Improve Discord client mocking
2. Verify security command prerequisites are met
3. Add mock guild/role data that passes validation

**Complexity:** Medium

---

### 5. Memory Measurement Tests (7 failures)
**File:** `tests/memory-measurement.test.ts`
**Root Cause:** Missing exports from `memory-measurement.ts`

**Symptoms:**
- Tests import functions that don't exist
- TypeScript compilation errors in tests

**Fix Strategy:**
1. Identify expected exports from tests
2. Add missing function implementations
3. Or remove tests for unimplemented features

**Complexity:** Low

---

### 6. Battle Flow Tests (5 failures)
**File:** `tests/battle_flow.spec.ts`
**Root Cause:** Missing battle system components

**Symptoms:**
- Battle state management issues
- Missing mock data or incorrect mocking

**Fix Strategy:**
1. Review battle flow requirements
2. Update mocks to match current implementation
3. Consider using PBSL fixtures

**Complexity:** Medium

---

### 7. Limits Tests (4 failures)
**File:** `tests/limits.spec.ts`
**Root Cause:** Resource limits module issues

**Symptoms:**
- Tests for resource limiting functionality
- May need mock configuration

**Fix Strategy:**
1. Review limits module implementation
2. Update test expectations
3. Add appropriate mocks

**Complexity:** Low-Medium

---

### 8. Battle Engine Tests (2 failures)
**File:** `tests/battle_engine.spec.ts`
**Root Cause:** Engine state or calculation issues

**Symptoms:**
- Battle calculations not matching expected values
- State management issues

**Fix Strategy:**
1. Verify PBSL oracle compatibility
2. Update expected values if logic changed
3. Review damage/status calculations

**Complexity:** Medium

---

### 9. Dexpack Tests (3 + 2 failures)
**Files:** `tests/dexpack.v2.spec.ts`, `tests/dexpack.fast.spec.ts`
**Root Cause:** Missing or invalid dexpack signature

**Symptoms:**
- `dexpack.v2 signature unavailable — rebuild assets to record the trusted signature`
- Asset loading failures

**Fix Strategy:**
1. Run `npm run build:dexpack` to regenerate assets
2. Update test expectations if schema changed
3. Add signature generation to CI

**Complexity:** Low (rebuild assets)

---

### 10. DripAlert Bus Integration (3 failures)
**File:** `tests/dripalert-bus-phase2.3.4-integration.test.ts`
**Root Cause:** Event bus re-emission timing or format issues

**Fix Strategy:**
1. Review event bus Phase 2.3.4 implementation
2. Adjust timing/retry expectations
3. Update mock event handlers

**Complexity:** Medium

---

### 11. Ops Command Tests (5 failures)
**File:** `tests/ops.spec.ts`
**Root Cause:** Admin command mock issues

**Fix Strategy:**
1. Review `/ops` command requirements
2. Update Discord interaction mocks
3. Verify permission checks

**Complexity:** Low-Medium

---

### 12. Other Single-Test Failures

| File | Failures | Issue |
|------|----------|-------|
| `role-audit-service.test.ts` | 1 | Hash chain linking |
| `executable-docs.test.ts` | 1 | Documentation executable issue |
| `security-event-bus.test.ts` | 1 | Handler timeout expectation |
| `catch.spec.ts` | 1 | Catch flow issue |
| `battle_results.spec.ts` | 1 | Battle result format |

---

## Recommended Fix Order

### Priority 1 - Quick Wins (1-2 hours)
1. ⏳ **Dexpack tests** - Rebuild assets with `npm run build:dexpack`
2. ⏳ **Memory measurement tests** - Add missing exports
3. ⏳ **Limits tests** - Update expectations

### Priority 2 - Medium Complexity (2-4 hours each)
4. ⏳ **Runtime config tests** - Finish unified architecture alignment
5. ⏳ **Ops command tests** - Update mock interactions
6. ⏳ **Battle engine/flow tests** - Review against PBSL fixtures

### Priority 3 - Complex Fixes (4+ hours each)
7. ⏳ **Security archive tests** - Add test mode or proper fixtures
8. ⏳ **E2E security commands** - Full mock overhaul
9. ⏳ **Battle interaction tests** - Complete Discord.js mocking

### Priority 4 - Investigation Needed
10. ⏳ **Single-failure tests** - Root cause analysis per test

---

## Tracking

- **Starting failures:** 65
- **After quick fixes:** 52
- **Tests fixed:** 13
- **Target:** < 20 (or skip tests for unimplemented features)

**Last Updated:** 2025-12-21
