# 🚀 Envelope Migration Project — START HERE

**Prompt this to any AI agent to begin work:**

---

## Mission

Migrate all `console.*` calls in this codebase to the unified envelope logging system. This is a systematic file-by-file migration that converts raw console output to structured, queryable logs.

## Before You Start

1. **Read the instruction manual:** `.github/instructions/envelope-migration.instructions.md`
2. **Check current progress:** `Prompt.md` → PATCHSET echo section
3. **Verify system health:**
   ```powershell
   npm run build
   npm test -- tests/observability/envelope.spec.ts
   ```

## The Pattern (Quick Reference)

```typescript
// OLD
console.log('[Component] Message:', value);
console.error('[Component] Error:', err.message);

// NEW
import { scopedLogger } from '../../observability/envelope/console.js';
const log = scopedLogger('component');

log.info('operation', 'Message', { value });
log.error('operation', 'Error occurred', { error: err.message });
```

## Current Status

- **8 files migrated** (~60 calls converted)
- **~74 files remaining** (~1,023 calls)
- **37/37 envelope tests passing**

## Your Task

1. Pick the next file from the priority queue in `Prompt.md`
2. Follow the migration pattern in the instruction manual
3. Verify build passes after each file
4. Update `Prompt.md` with your progress

## Priority Queue

1. `src/utils/logger.ts` — 17 calls (HIGH PRIORITY)
2. `src/shared/logging/ai-log-*.ts` — AI log modules
3. `src/bot/**/*.ts` — Bot layer
4. `src/core/**/*.ts` — Game engines
5. `src/services/**/*.ts` — Services
6. `src/workers/**/*.ts` — Workers

## Commands

```powershell
# Find files with console calls
grep -r "console\." --include="*.ts" src/ | grep -v node_modules

# Verify build
npm run build

# Run envelope tests
npm test -- tests/observability/envelope.spec.ts

# Full test suite
npm test
```

## Success Criteria

- Zero `eslint-disable no-console` comments
- Zero raw `console.*` calls in `src/`
- Build passes
- All tests pass
- `Prompt.md` updated with completion report

---

**Start now:** Read `.github/instructions/envelope-migration.instructions.md` and migrate the next file in the queue.
