---
applyTo: '**'
---

# Envelope System Migration — AI Agent Instruction Manual

**Mission:** Migrate all `console.*` calls to the unified envelope logging system.
**Status:** Phase 5 in progress — 8 files migrated, ~74 remaining
**Priority:** HIGH — Modernizes observability for structured, queryable logs

---

## 🎯 OBJECTIVE

Replace ALL raw `console.log/info/warn/error` calls with the envelope system's `scopedLogger()` pattern. This enables:
- Structured JSON output for Loki/Grafana
- Correlation tracking across requests
- Query DSL for log analysis
- Consistent formatting across all services

---

## 📋 PRE-FLIGHT CHECKLIST

Before starting ANY migration work:

```powershell
# 1. Verify envelope system is intact
npm run build 2>&1 | Select-String -Pattern "error"

# 2. Run envelope tests
npm test -- tests/observability/envelope.spec.ts

# 3. Confirm tests pass (should be 37/37)
```

If build fails or tests fail, STOP and investigate before proceeding.

---

## 🔄 THE MIGRATION PATTERN

### Step 1: Add Import (Top of File)
```typescript
import { scopedLogger } from '../../observability/envelope/console.js';
// OR for deeper paths:
import { scopedLogger } from '../../../observability/envelope/console.js';
```

### Step 2: Create Scoped Logger (After Imports)
```typescript
/** Scoped logger for [component-name] */
const log = scopedLogger('component-name');
```

### Step 3: Convert Each Console Call

| Old Pattern | New Pattern |
|-------------|-------------|
| `console.log('[Tag] Message')` | `log.info('operation', 'Message')` |
| `console.info('[Tag] Message')` | `log.info('operation', 'Message')` |
| `console.warn('[Tag] Message')` | `log.warn('operation', 'Message')` |
| `console.error('[Tag] Message')` | `log.error('operation', 'Message')` |
| `console.log(\`[Tag] Value: ${x}\`)` | `log.info('operation', 'Description', { value: x })` |
| `console.error('[Tag] Error:', err.message)` | `log.error('operation', 'Error description', { error: err.message })` |

### Step 4: Remove ESLint Disable Comments
Delete these lines when found:
```typescript
/* eslint-disable no-console */
// eslint-disable-next-line no-console
```

### Step 5: Verify Build
```powershell
npm run build 2>&1 | Select-String -Pattern "error"
```

---

## 📁 FILE MIGRATION ORDER

### ✅ COMPLETED (8 files, ~60 calls)
1. `src/observability/hub/observability-hub.ts` — 20 calls
2. `src/shared/event-bus.ts` — 9 calls
3. `src/observability/backends/loki/loki-backend.ts` — 4 calls
4. `src/observability/backends/loki/loki-flush-worker.ts` — 6 calls
5. `src/observability/backends/loki/loki-health-worker.ts` — 5 calls
6. `src/observability/index.ts` — 5 calls
7. `src/shared/logging/loki-transport.ts` — 8 calls
8. `src/shared/logging/log-sampler.ts` — 3 calls

### 🔄 PRIORITY QUEUE (Migrate in this order)

#### Tier 1: Core Logging (HIGH PRIORITY)
```
src/utils/logger.ts                    — 17 calls (CRITICAL: main logger)
src/shared/logging/ai-log-analyzer.ts  — grep for count
src/shared/logging/ai-log-router.ts    — grep for count
```

#### Tier 2: Bot Layer
```
src/bot/main.js                        — grep for count
src/bot/index.ts                       — grep for count
src/bot/error-handler.ts               — grep for count
src/bot/homestead/*.ts                 — multiple files
```

#### Tier 3: Core Engines
```
src/core/battle/*.ts                   — battle engine
src/core/encounter/*.ts                — encounter system
src/core/pbsl/*.ts                     — snapshot language
```

#### Tier 4: Services
```
src/services/**/*.ts                   — all service files
```

#### Tier 5: Workers
```
src/workers/**/*.ts                    — all worker files
```

#### Tier 6: Remaining
```
scripts/**/*.ts                        — automation scripts
```

---

## 🔍 HOW TO FIND REMAINING FILES

### Scan for Console Calls
```powershell
# Find all files with console.* calls
npm run migrate:console -- --scan

# Or use grep directly
grep -r "console\." --include="*.ts" --include="*.js" src/ | grep -v node_modules | grep -v ".spec.ts"
```

### Count Calls Per File
```powershell
# Count console calls in a specific file
grep -c "console\." src/path/to/file.ts
```

---

## ⚠️ SPECIAL CASES

### Dashboard/Pretty Output (logger.ts)
The `renderDashboard()` output uses `console.log` for formatted display. Convert to:
```typescript
log.info('dashboard', 'Stats rendered', { /* metrics */ });
```

### Error Handlers
Always include error details in data object:
```typescript
// OLD
console.error('[Tag] Error:', error.message);

// NEW
log.error('operation', 'Error description', { 
  error: error.message,
  stack: error.stack 
});
```

### Conditional Logging
Preserve the condition, change the output:
```typescript
// OLD
if (verbose) console.log('[Debug] Details:', data);

// NEW
if (verbose) log.debug('operation', 'Details', data);
```

### Import Path Calculation
Count directory levels from file to `src/observability/envelope/`:
- `src/utils/` → `../observability/envelope/console.js`
- `src/shared/logging/` → `../../observability/envelope/console.js`
- `src/bot/homestead/` → `../../observability/envelope/console.js`
- `src/services/cache/` → `../../observability/envelope/console.js`

---

## ✅ VERIFICATION PROTOCOL

After EVERY file migration:

### 1. Build Check
```powershell
npm run build 2>&1 | Select-String -Pattern "error"
```

### 2. Test Check (if file has tests)
```powershell
npm test -- tests/[relevant-test-file].spec.ts
```

### 3. Full Test Suite (every 5 files)
```powershell
npm test
```

---

## 📊 PROGRESS TRACKING

### Update Prompt.md After Each Session

Add to `Prompt.md` under PATCHSET echo:

```markdown
## Envelope Migration Progress

**Session Date:** YYYY-MM-DD
**Files Migrated This Session:** X
**Total Files Migrated:** Y
**Console Calls Converted:** Z

### Files Completed:
- `path/to/file.ts` — N calls

### Next Priority:
- `path/to/next/file.ts`

### Build Status:** ✅ Passing / ❌ Failing
### Test Status:** ✅ X/Y passing
```

---

## 🚨 FAILURE RECOVERY

### Build Fails After Migration
1. Check import path is correct
2. Verify `scopedLogger` is imported (not `createScopedLogger`)
3. Check for typos in log level methods

### Circular Dependency Error
The envelope system has NO dependencies on Event Bus or other observability modules. If you see circular dependency errors:
1. Verify you're importing from `observability/envelope/console.js`
2. NOT from `observability/index.js` or other modules

### Type Errors
```typescript
// If TypeScript complains about data parameter, ensure object:
log.info('op', 'msg', { key: value }); // ✅ Correct
log.info('op', 'msg', value);          // ❌ Wrong - needs object wrapper
```

---

## 📁 ENVELOPE SYSTEM REFERENCE

### Module Locations
```
src/observability/envelope/
├── types.ts      — Universal envelope types
├── factory.ts    — Creation functions
├── serializer.ts — Output formats (json, jsonl, pretty, etc.)
├── console.ts    — scopedLogger() function ← USE THIS
├── query.ts      — Query DSL
├── migrate.ts    — Migration helpers
└── index.ts      — Barrel exports
```

### Key Export
```typescript
import { scopedLogger } from '../../observability/envelope/console.js';

const log = scopedLogger('component-name');

log.debug('operation', 'Debug message', { data });
log.info('operation', 'Info message', { data });
log.warn('operation', 'Warning message', { data });
log.error('operation', 'Error message', { error: err.message });
log.fatal('operation', 'Fatal message', { error: err.message });
```

---

## 🎯 COMPLETION CRITERIA

Migration is COMPLETE when:

1. **Zero `eslint-disable no-console` comments** in codebase
2. **Zero raw `console.*` calls** in `src/` (except intentional CLI output)
3. **Build passes** with zero errors
4. **All tests pass** (target: 290+)
5. **Prompt.md updated** with final migration report

---

## 📝 FINAL REPORT TEMPLATE

When migration is 100% complete, add to Prompt.md:

```markdown
## 🎉 ENVELOPE MIGRATION COMPLETE

**Completion Date:** YYYY-MM-DD
**Total Files Migrated:** XX
**Total Console Calls Converted:** ~1,083
**Build Status:** ✅ Passing
**Test Status:** ✅ XXX/XXX passing

### Migration Summary:
- Observability layer: ✅ Complete
- Logging layer: ✅ Complete  
- Bot layer: ✅ Complete
- Core engines: ✅ Complete
- Services: ✅ Complete
- Workers: ✅ Complete
- Scripts: ✅ Complete

### Benefits Achieved:
- Structured JSON logging for Loki ingestion
- Correlation tracking across all services
- Query DSL for log analysis (`logq` CLI tool)
- Consistent formatting across 80+ files
```

---

**Document Version:** 1.0
**Created:** 2025-12-27
**Purpose:** AI Agent guidance for envelope system migration

