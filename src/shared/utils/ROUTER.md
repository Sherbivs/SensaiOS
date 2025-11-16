# ROUTER
Title: Shared Utilities
Purpose: Common utility functions used across the entire application
Owned Globs: src/shared/utils/**
Last Updated (UTC): 2025-11-16T06:00:00Z

**Consolidation Campaign Complete (2025-11-16) — Phases 1-21:**
- ✅ **Phase 1-6**: Created barrel export `index.ts` + utility consolidation (-86 lines)
- ✅ **Phase 7-8**: Centralized constants into `src/shared/constants.ts` (-18 duplicate definitions)
- ✅ **Phase 9**: Date utilities consolidation into `date-utils.ts` (-38 lines, 3 files)
- ✅ **Phase 10**: Comprehensive pattern analysis (all domain-specific, no consolidation)
- ✅ **Phase 11**: Dead code removal (formatNumber, formatPercentage) (-39 lines, 2 files)
- ✅ **Phase 12**: Cache configuration consolidation (-3 duplicate constants, 1 file)
- ✅ **Phase 13**: Discord/retry/error/I/O pattern search (already optimized)
- ✅ **Phase 14**: File I/O utilities module created (`file-utils.ts`, +109 lines infrastructure)
- ✅ **Phase 15**: Object utilities module created (`object-utils.ts`, +27 lines infrastructure)
- ✅ **Phase 16**: Deep clone pattern consolidated (-5 lines, 2 files: logger.js, pokemonService.js)
- ✅ **Phase 17**: SQL COUNT extraction utilities (`src/services/database/sql-utils.ts`, -16 lines, 2 files: engine-write-db.ts, engine-read-db.ts)
- ✅ **Phase 18**: String utilities module (`string-utils.ts`, -14 lines, 6 files: bot/main.js, pokemonService.js, config.ts x3, env.js, ai-log-writer.js, persistence.js)
- ✅ **Phase 19**: Deprecated timezone.js removal (migrated msUntilNextZonedTime to shared/datetime.js, deleted src/utils/timezone.js, updated bot/dripAlerts.js)
- ✅ **Phase 20**: TYPE_COLORS constant consolidation (moved from src/lib/type-colors.js to GAME_CONSTANTS.TYPE_COLORS in shared/constants.ts, updated 3 commands: dex.js, move.js, weak.js)
- ✅ **Phase 21**: Time conversion constants (added MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND, SECONDS_PER_DAY to TIME_CONSTANTS, replaced MILLIS_IN_DAY in dripAlerts.js)
- ✅ **Total Impact**: -220 lines duplicate code eliminated, 28 files migrated, 7 infrastructure files created, 2 deprecated files removed
- ✅ **Quality**: 0 build errors, full TypeScript type safety, comprehensive documentation

**Usage Pattern:**
```typescript
import { 
  formatBytes, delay, toDate, getErrorMessage, clamp,
  readJsonFile, writeJsonFile, deepClone
} from '../shared/utils/index.js';
import { CACHE_CONSTANTS, TIME_CONSTANTS, GAME_CONSTANTS } from '../shared/constants.js';
```

Notes:
- All utilities are pure functions with no side effects
- Functions are fully typed with TypeScript
- Zero dependencies on other application code (except types)
- Extensively used across bot, services, workers, and shared modules

Key Files:

**`index.ts` (NEW - Barrel Export)**
- Purpose: Single entry point for all shared utilities
- Exports: All functions from format-utils, error-utils, async-utils, math-utils, url-utils
- Usage Pattern:
  ```typescript
  // Before (verbose)
  import { formatBytes } from '../../shared/utils/format-utils.js';
  import { delay } from '../../shared/utils/async-utils.js';
  import { getErrorMessage } from '../../shared/utils/error-utils.js';
  
  // After (clean)
  import { formatBytes, delay, getErrorMessage } from '../../shared/utils/index.js';
  ```

**`format-utils.ts` (263 lines)**
- Purpose: String formatting utilities for human-readable output
- Key Functions:
  - `formatBytes(bytes)` — "1.5 MB", "234 KB" (used 15+ times across codebase)
  - `formatBytesShort(bytes)` — "1.5M", "234K" (compact variant)
  - `formatDuration(ms)` — "2h 34m 12s" (used in bot DM flows)
  - `formatUptime(ms)` — "2d 5h 34m" (logger, security bot stats)
  - `formatDurationCompact(ms)` — "2.6m", "1.1h" (admin ops commands)
  - `formatNumber(value)` — "1,234,567" (NOT CURRENTLY USED - candidate for removal)
  - `formatPercentage(value, decimals)` — "75.50%" (NOT CURRENTLY USED - candidate for removal)
  - `truncate(value, maxLength)` — "long text…" (CLI log query, ops notifier)
  - `formatTimestamp(date)` — ISO 8601 with fallback (monitoring utils wrapper)
  - `stripQuotes(value)` — Remove surrounding quotes (USED in scripts: dev_prod_auto_sync.ts, db_mirror_checks.ts)

**`error-utils.ts` (134 lines)**
- Purpose: Error handling and normalization utilities
- Key Functions:
  - `getErrorMessage(error)` — Extract message from any error type (used 20+ times)
  - `normalizeError(err)` — Convert unknown errors to ErrorMeta (cache recipes)
  - `formatError(err)` — Format error with stack trace (NOT DIRECTLY USED - via services)
  - `safeError(err)` — Serialize error safely (shared log module)
- Type: `ErrorMeta` — {name, message, stack, code} (exported for type safety)

**`async-utils.ts` (32 lines)**
- Purpose: Promise-based async helpers
- Key Functions:
  - `delay(ms)` — Promise-based setTimeout (workers, engine-workers) [CONSOLIDATED 2025-11-16]
  - `delayWithJitter(baseMs)` — Delay with 25% random variance (anti-thundering-herd)

**`math-utils.ts` (29 lines)**
- Purpose: Math operations and range utilities
- Key Functions:
  - `clamp(value, min, max)` — Constrain value to range (used in models/index.ts)

**`date-utils.ts` (106 lines) [NEW - Phase 9]**
- Purpose: Date parsing and manipulation utilities
- Key Functions:
  - `toDate(value)` — Convert Date/string/number to Date or null (CONSOLIDATED from 3 duplicates)
  - `toDateOrNow(value)` — Convert with fallback to current date (activityTracker variant)
  - `startOfUtcDay(date)` — Returns UTC day start 00:00:00.000Z (CONSOLIDATED from 2 duplicates)
  - `diffInUtcDays(a, b)` — Calculate day difference (CONSOLIDATED from models/index.ts)
  - `cloneDate(value)` — Clone Date object or return null (CONSOLIDATED from activityTracker)
- Eliminated Duplicates:
  - `src/commands/home.js` (-14 lines): toDate, startOfUtcDay
  - `src/utils/activityTracker.js` (-6 lines): toDate, cloneDate
  - `src/models/index.ts` (-18 lines): toDate, startOfUtcDay, diffInUtcDays
- Usage Example:
  ```typescript
  import { toDate, startOfUtcDay, diffInUtcDays } from '../shared/utils/index.js';
  
  const date = toDate(userInput);  // Safely parse any date input
  if (date) {
    const dayStart = startOfUtcDay(date);  // Normalize to UTC day boundary
    const daysSince = diffInUtcDays(new Date(), date);  // Calculate difference
  }
  ```

**`url-utils.ts` (76 lines)**
- Purpose: URL parsing and database connection utilities
- Key Functions:
  - `extractDatabaseName(url)` — Parse DB name from connection string (logger observability)

## Consolidation History

**2025-11-16: Comprehensive Consolidation Campaign (Phases 1-10)**

**Phase 1-6: Utility Functions (-86 lines)**
1. **formatBytes + formatTimestamp** — Eliminated duplicates from `monitoring-utils.ts` (-39 lines)
2. **delay()** — Eliminated 4 duplicate implementations from `engine-workers.ts` (-20 lines)
3. **formatUptime()** — Eliminated 2 duplicate implementations from `logger.js` and `bot/state/stats.js` (-26 lines)
4. **clamp()** — Eliminated 2 duplicate implementations (models used, recipes migrated)
5. **Barrel Export** — Created `index.ts` for clean imports across 9 files

**Phase 7-8: Constants Infrastructure (-18 definitions)**
1. Created `src/shared/constants.ts` with 5 constant groups:
   - GAME_CONSTANTS, TIME_CONSTANTS, CACHE_CONSTANTS, MONITORING_CONSTANTS, DISCORD_CONSTANTS
2. Migrated 6 files: home.js, recipes.ts, opsNotifier.js, dripAlerts.js, bot/main.js, cliStatus.js
3. Eliminated 18 duplicate constant definitions across codebase

**Phase 9: Date Utilities (-38 lines)**
1. Created `date-utils.ts` with 5 consolidated functions
2. Eliminated duplicate implementations:
   - 3x `toDate()` (home.js, activityTracker.js, models/index.ts)
   - 2x `startOfUtcDay()` (home.js, models/index.ts)
   - 1x `diffInUtcDays()` (models/index.ts)
   - 1x `cloneDate()` (activityTracker.js)
3. Migrated 3 files with full TypeScript type safety

**Phase 10: Analysis (No Changes Required)**
1. **Sanitize Functions** — All domain-specific, no consolidation opportunities
2. **Parse Functions** — Different implementations serve different purposes
3. **Dead Code** — formatNumber/formatPercentage removed (Phase 11), stripQuotes kept (used in scripts)

**Total Impact: -218 lines eliminated, 26 files migrated, 7 infrastructure files created**

## Consolidation Metrics (Phases 1-18)

### Code Elimination Summary
- **Total Lines Removed**: 218 lines (-218)
  - Phase 1-6: -86 lines (utility function duplicates)
  - Phase 7-8: -18 lines (constant duplicates)
  - Phase 9: -38 lines (date utility duplicates)
  - Phase 11: -39 lines (dead code: formatNumber, formatPercentage)
  - Phase 12: -3 lines (cache constant duplicates)
  - Phase 16: -5 lines (deep clone pattern: JSON.parse(JSON.stringify()))
  - Phase 17: -16 lines (SQL COUNT extraction pattern)
  - Phase 18: -14 lines (string normalization + timestamp formatting)

### Files Migrated (26 total)
1-18. [Previous files from Phases 1-17]
19. `src/bot/main.js` (normalizeString for user search)
20. `src/services/pokemonService.js` (normalizeString for Pokemon lookup)
21. `src/shared/config.ts` (normalizeString x3: boolean parsing, mode normalization, backup provider)
22. `src/config/env.js` (normalizeString for envTruthy)
23. `src/services/ai/ai-log-writer.js` (getFilesafeTimestamp for log filenames)
24. `src/bot/state/persistence.js` (getFilesafeTimestamp for snapshots)

### Infrastructure Created (7 files)
1-6. [Previous infrastructure files]

7. **`src/shared/utils/string-utils.ts`** (50 lines) [Phase 18]
   - 2 string manipulation utilities
   - normalizeString: Trim + lowercase for case-insensitive comparison
   - getFilesafeTimestamp: ISO timestamp → filesystem-safe format (removes colons, milliseconds)
   - Replaced 8 instances of .trim().toLowerCase() and 2 instances of .toISOString().replace(/:/g, '-').split('.')[0]

### Quality Metrics
- ✅ **TypeScript Compilation**: Clean (0 errors after Phase 14-16, path casing warnings are Windows artifacts)
- ✅ **Build Status**: 0 new errors, 0 new warnings
- ✅ **Type Safety**: All utilities fully typed with TypeScript
- ✅ **Documentation**: Comprehensive JSDoc + usage examples
- ✅ **Test Coverage**: Maintained (no test breakage)

## Usage Statistics

**High Usage (10+ references):**
- `getErrorMessage` — 20+ imports across workers, services, bot, config
- `formatBytes` — 15+ imports across logger, stack-trace-parser, bot, monitoring
- `formatDuration` — 10+ imports across bot state, CLI status, logger
- `toDate` — 3 duplicates eliminated (home.js, activityTracker.js, models/index.ts)

**Medium Usage (5-10 references):**
- `delay` — 4 duplicates eliminated (engine-workers.ts), now used in workers for staggered startup
- `formatUptime` — 2 duplicates eliminated (logger.js, bot/state/stats.js)
- `truncate` — Used in CLI tools and ops notifier
- `startOfUtcDay` — 2 duplicates eliminated (home.js, models/index.ts)
- `diffInUtcDays` — 1 duplicate eliminated (models/index.ts)
- `cloneDate` — 1 duplicate eliminated (activityTracker.js)
- `clamp` — 2 duplicates eliminated, used in models/index.ts

**New Infrastructure (Phases 14-17):**
- `deepClone` — Centralized deep cloning (2 instances consolidated: logger.js, pokemonService.js)
- `readJsonFile` — File I/O pattern consolidation (20+ candidate locations identified)
- `writeJsonFile` — File I/O pattern consolidation (20+ candidate locations identified)
- `readTextFile` / `writeTextFile` — Text file operations with error handling
- `fileExists` / `ensureDir` — File system utilities
- `getTableCount` — SQL COUNT(*) extraction for simple queries (3 instances: engine-read-db.ts)
- `getCount` — SQL COUNT(*) extraction with WHERE clauses (7 instances: engine-write-db.ts)

**Removed (Dead Code):**
- `formatNumber` — ❌ REMOVED Phase 11 (0 active usages)
- `formatPercentage` — ❌ REMOVED Phase 11 (0 active usages)
- `clamp` — Used in models/index.ts (quest streak calculations)

**Script-Only Usage (keep):**
- `stripQuotes` — Used in 2 scripts (dev_prod_auto_sync.ts, db_mirror_checks.ts)

Linked Routers:
- src/shared/ROUTER.md — Parent router for all shared modules
- src/services/monitoring/ROUTER.md — Heavy consumer of format utilities
- src/workers/ROUTER.md — Heavy consumer of async + error utilities
- src/bot/state/ROUTER.md — Consumer of format utilities for stats
