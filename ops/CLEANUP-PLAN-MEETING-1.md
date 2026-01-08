# Codebase Cleanup Plan — Meeting #1

**Created:** 2026-01-06T14:45:00Z  
**Agent:** cleanup-agent  
**Status:** 🔍 DISCOVERY PHASE — Analysis Complete

---

## 📊 Discovery Summary (EXPANDED)

| Category | Finding | Count | Priority | Size Impact |
|----------|---------|-------|----------|-------------|
| **Unused npm Dependencies** | Zero imports found | 4 packages | **P0** | ~15 MB |
| **Math.random() Violations** | Should use RNG service | 49 instances | **P0** | — |
| **Store/ Expired Data** | Error reports >7 days old | 420 files | **P0** | 0.57 MB |
| **Console.* Calls** | Should use envelope system | 24 files | **P1** | — |
| **Duplicate RNG** | Two RNG implementations | 2 files | **P1** | 30 lines |
| **Empty Barrel File** | models/index.ts (no exports) | 1 file | **P2** | — |
| **TODO/FIXME/HACK Markers** | Technical debt markers | 116 | P2 | — |
| **Commented Lines** | Potential dead code | 11,124 | P3 | — |
| **@deprecated Tags** | Deprecated code markers | 21 markers | P2 | — |
| **.d.ts Declaration Files** | Potentially redundant | 4 files | P2 | — |
| **Skipped Tests** | Tests not running | 15 skipped | P2 | — |
| **Empty Directories** | Unused folder structure | 9 dirs | P3 | — |
| **Backup Files** | Old task backups | 4 .backup | P3 | — |
| **Scripts Archive** | Archived scripts | 31 files | P3 | 244 KB |
| **backups/ Folder** | Migration checkpoints | 28 files | P3 | 2.05 MB |
| **Store/ Directories** | Mostly empty | 17 dirs | INFO | — |
| **Build Status** | ✅ Passing | — | — | — |
| **Test Status** | ✅ Running | — | — | — |

---

## 🎯 Priority Targets (EXPANDED)

### P0 — IMMEDIATE (Multiple Issues)

#### Issue 1: Unused npm Dependencies (15 MB cleanup)

**Evidence:** Tier A (depcheck confirms zero imports)

**Unused Dependencies:**
- `@aws-sdk/client-s3` — No imports found
- `express` — No imports found
- `fs-extra` — No imports found
- `simple-git` — No imports found

**Unused DevDependencies:**
- `husky` — Git hooks not configured
- `madge` — Circular dependency checker not used
- `patch-package` — No patches directory
- `ts-prune` — Dead code tool not in scripts

**Action:**
```bash
npm uninstall @aws-sdk/client-s3 express fs-extra simple-git
npm uninstall -D husky madge patch-package ts-prune
```

**Missing Dependencies (Add):**
```bash
npm install fast-check ioredis ts-morph
```

**Estimate:** 10 minutes  
**Impact:** 15 MB disk space, cleaner dependencies

---

#### Issue 2: Math.random() Violations (49 instances)

**Evidence:** Tier A (SensaiOS contract violation — NON-NEGOTIABLE per sensai.instructions.md)

**Contract Violation:**
> "❌ No `Math.random()` in gameplay — Use kernel RNG service"

**Files Affected:**
- `src/bot/security/errors/security-errors.ts` — 1 instance
- `src/bot/security/services/continuous-aggregates-service.ts` — 5 instances
- `src/bot/security/services/cross-reference-validation-service.ts` — 2 instances
- `src/bot/security/services/di-container.ts` — 1 instance
- `src/bot/security/services/integrity-sweep-scheduler.ts` — 1 instance
- + 39 more instances across security services

**Required Fix:**
```typescript
// BEFORE (VIOLATION)
const randomValue = Math.random();

// AFTER (CORRECT)
import { createRng } from '../../core/pbsl/rng.js';
const rng = createRng(Date.now()); // or deterministic seed
const randomValue = rng.nextFloat();
```

**Estimate:** 3-4 hours  
**Priority:** **CRITICAL** — Violates SensaiOS kernel contracts

---

#### Issue 3: Store/ Expired Data (420 files, 0.57 MB)

**Evidence:** Tier A (Retention policy: 7 days per INVENTORY-RUNTIME.md)

**Retention Violation:**
- All 420 error reports are >7 days old (oldest: 2025-12-24)
- Retention policy: 7 days
- Current date: 2026-01-06 (13 days elapsed)

**Action:**
```powershell
$cutoffDate = (Get-Date).AddDays(-7)
Get-ChildItem -Path "Store/error-reports" -File | 
  Where-Object { $_.LastWriteTime -lt $cutoffDate } | 
  Remove-Item -Force
```

**Estimate:** 5 minutes  
**Impact:** 0.57 MB disk space, policy compliance

---

### P1 — HIGH (Multiple Issues)

#### Issue 1: Console.* Migration (24 files)

**Evidence:** Tier A (Envelope migration incomplete)

**Impact:** Breaks structured logging, no Loki integration

**Action:** Complete envelope migration per `envelope-migration.instructions.md`

**Estimate:** 2-3 hours

---

#### Issue 2: Duplicate RNG Implementations

**Issue:** Two RNG implementations with different algorithms

| File | Lines | Algorithm | Usage |
|------|-------|-----------|-------|
| `src/engine/rng.ts` | 23 | Xorshift32 | 1 import (`battle-turn.ts`) |
| `src/core/pbsl/rng.ts` | 100 | Mulberry32 | PBSL system |

**Evidence:** Tier B (Different algorithms, potentially incompatible)

**Analysis:**
- `engine/rng.ts` — Simple Xorshift32, only used in `battle-turn.ts`
- `pbsl/rng.ts` — Full-featured with snapshot/restore, state tracking
- **PBSL version is superior** — Has provenance, replay capabilities

**Recommended Action:**
1. Migrate `battle-turn.ts` to use `pbsl/rng.ts`
2. Delete `src/engine/rng.ts` (SAFE — only 1 import)
3. Update ROUTER.md references

**Estimate:** 30 minutes

---

### P2 — MEDIUM (Multiple Issues)

#### Issue 1: Empty Barrel File (models/index.ts)

**Evidence:** Tier B (File has no exports but 10 imports exist)

**Analysis:**
- File: `src/shared/models/index.ts`
- Content: Only documentation comment, no actual exports
- Imports: 10 files import from `models/index`
- All imports likely fail at runtime

**Recommended Action:**
1. Find all files importing from `models/index`
2. Replace with direct imports from `*-queries-pg.ts` files
3. Delete `models/index.ts`

**Estimate:** 45 minutes

---

#### Issue 3: Deprecated Code Markers (21 instances)

**Evidence:** Tier B (Explicit @deprecated tags in code)

**Files with @deprecated:**
- `src/services/alert-dispatcher.ts` — 2 deprecated methods
- `src/services/restart-metrics.ts` — 2 deprecated methods
- `src/services/monitoring/error-tracker.ts` — 1 deprecated method
- `src/services/cache/engine-cache.ts` — 2 deprecated methods
- `src/workers/heap-pruner.ts` — 3 deprecated notes (entire file deprecated)
- `src/shared/logger.ts` — 2 deprecated exports
- `src/shared/constants.ts` — deprecated exports removed (documented)
- `src/index.ts` — 1 disabled function (preserved for reference)
- `src/config/env.ts` — 1 deprecated note
- `src/bot/state/index.ts` — 4 deprecated paths
- `src/bot/state/types.ts` — 1 deprecated type

**Recommended Action:**
1. Audit each deprecated item for actual usage
2. Remove deprecated code with zero imports
3. Update callers to use replacement methods

**Estimate:** 2-3 hours

---

#### Issue 4: .d.ts Declaration Files (4 files)

**Evidence:** Tier B (May be redundant with TypeScript compilation)

**Files Found:**
- `src/bot/dripAlerts.d.ts`
- `src/config/env.d.ts`
- `src/data/dexpack.d.ts`
- `src/utils/cliStatus.d.ts`

**Analysis Needed:**
- Check if matching .ts files exist (dual declaration)
- Verify TypeScript generates these in dist/
- May be intentional for JS interop

**Estimate:** 30 minutes (investigation only)

---

#### Issue 5: Skipped Tests (15 tests)

**Evidence:** Tier B (Tests marked .skip are not running)

**Files with Skipped Tests:**
- `tests/battle_engine.spec.ts` — 1 skipped
- `tests/battle_flow.spec.ts` — 4 skipped
- `tests/homestead-security.spec.ts` — 6 skipped
- `tests/outbox.spec.ts` — 1 skipped
- `tests/battle/actions.interaction.spec.ts` — 3 skipped

**Recommended Action:**
1. Review each skipped test for validity
2. Either fix and enable, or delete obsolete tests
3. Document why tests remain skipped (if intentional)

**Estimate:** 2-4 hours (depends on complexity)

---

#### Issue 2: Technical Debt Markers (116 instances)

**Issue:** 116 TODO/FIXME/HACK/DEPRECATED markers

**Evidence:** Tier C (Heuristic — requires investigation)

**Breakdown Needed:**
- Categorize by age (git blame)
- Identify completed TODOs
- Flag abandoned work

**Action:** Manual audit required

**Estimate:** 4-6 hours

---

### P3 — LOW (Commented Code)

**Issue:** 11,124 commented lines

**Evidence:** Tier D (Speculative — many are documentation)

**Analysis Needed:**
- Distinguish documentation comments from dead code
- Look for patterns like `// function oldHandler() {`
- Check git history for intentional preservation

**Action:** Conservative scan, low deletion rate

**Estimate:** 8-10 hours

---

### P3 — LOW (Additional Findings)

#### Issue 1: Empty Directories (9 non-node_modules)

**Evidence:** Tier A (File system scan)

**Directories:**
- `dist/services/data-pool/` — Empty after cleanup
- `dist/shared/console/` — Empty
- `docs/projects/cleanup/temp/` — Empty temp folder
- `prisma/archive/` — Empty archive folder
- `Store/loki-logs/` — Empty logs folder
- `Store/logs/archive/` — Empty
- `Store/logs/daily/` — Empty
- `Store/logs/emergency/` — Empty
- `Store/logs/hourly/` — Empty
- `Store/logs/insights/` — Empty
- `Store/runtime-cache/encounter-state/` — Empty
- `Store/runtime-cache/quest-reward/` — Empty
- `Store/security-bot-state/snapshots/` — Empty

**Action:** Remove empty directories (safe)

**Estimate:** 5 minutes

---

#### Issue 2: Backup Files (.backup extension)

**Evidence:** Tier A (File extension scan)

**Files Found (4):**
- `backups/migration-checkpoints/task15_*/integrity.test.ts.backup`
- `backups/migration-checkpoints/task15_*/monitoring.test.ts.backup`
- `backups/migration-checkpoints/task15_*/sync.test.ts.backup`
- `backups/migration-checkpoints/task15_*/version.test.ts.backup`

**Action:** These are in backups/ folder (intentional). No action needed unless folder is archived.

---

#### Issue 3: Archived Scripts Folder

**Evidence:** Tier A (Archive folder analysis)

**Stats:**
- Location: `scripts/archive/`
- Files: 31
- Size: 244 KB

**Content:** Deprecated scripts moved to archive

**Action:** Keep for reference or delete after review

**Estimate:** 15 minutes (review)

---

#### Issue 4: backups/ Folder

**Evidence:** Tier A (Folder size analysis)

**Stats:**
- Total Size: 2.05 MB
- Files: 28
- Includes: .dump files, migration checkpoints, task reports

**Key Contents:**
- `pre-timescale-poc/*.dump` — Pre-migration database backups (3 files)
- `migration-checkpoints/*.ts` — Code checkpoints
- `migration-checkpoints/*.md` — Task reports

**Decision Needed:**
- Keep for rollback capability?
- Archive to external storage?
- Delete after verification period?

**Action:** Review with leadership before deletion

---

#### Issue 5: Store/ Directory Analysis

**Evidence:** Tier A (File system scan)

**Size Breakdown:**
| Directory | Size | Status |
|-----------|------|--------|
| `onpremise-dev-primary/` | 81.52 MB | PostgreSQL cluster (KEEP) |
| `error-reports/` | 0.57 MB | **EXPIRED** (P0 cleanup) |
| `security-bot-state/` | 0.35 MB | Active state (KEEP) |
| `emergency-error-logs/` | 0.26 MB | Logs (review retention) |
| `kernel-logs/` | 0.21 MB | Logs (review retention) |
| `test/` | 0.06 MB | Test artifacts (KEEP) |
| `monitoring/` | 0.02 MB | Active (KEEP) |
| `db/` | 0.01 MB | Database (KEEP) |
| Other 9 directories | 0 MB | Empty (can delete) |

**Total Store/:** ~83 MB  
**Deletable:** ~0.57 MB (error-reports)  
**Cleanup Gain:** 0.57 MB + empty folders

---

## 🔬 Detailed Analysis Queue

### 1. Console Migration (P0)

**Command to find all files:**
```powershell
Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.js" -File | Where-Object {
  (Get-Content $_.FullName -Raw) -match 'console\.(log|info|warn|error)'
} | Select-Object FullName
```

**Migration Pattern:**
```typescript
// OLD
console.log('[Tag] Message');

// NEW
import { scopedLogger } from '../../observability/envelope/console.js';
const log = scopedLogger('component-name');
log.info('operation', 'Message');
```

---

### 2. RNG Consolidation (P1)

**Migration Steps:**

1. **Update battle-turn.ts** — Change import:
```typescript
// OLD
import { makeRNG } from '../engine/rng.js';

// NEW
import { createRng } from '../core/pbsl/rng.js';
```

2. **Update RNG usage:**
```typescript
// OLD
const rng = makeRNG(seed);
const value = rng.next();

// NEW
const rng = createRng(seed);
const value = rng.nextFloat();
```

3. **Delete engine/rng.ts:**
```bash
Remove-Item "src\engine\rng.ts"
```

4. **Verify build:**
```bash
npm run build
npm test
```

---

### 3. TODO Audit (P2)

**Categorization Strategy:**

```powershell
# Group TODOs by pattern
Get-ChildItem -Path "src" -Recurse -Include "*.ts" | Select-String -Pattern "TODO|FIXME|HACK" | 
  Group-Object { $_.Line -replace '.*?(TODO|FIXME|HACK).*','$1' } | 
  Select-Object Name, Count
```

**Evidence Tiers:**
- **Tier A** — `// TODO: Remove after migration` with git date > 6 months
- **Tier B** — `// FIXME:` with zero coverage in function
- **Tier C** — `// HACK:` in code still actively modified
- **Tier D** — Generic `// TODO:` without context

---

### 4. Dead Code Scan (P3)

**High-Confidence Patterns:**

```typescript
// Pattern 1: Stub functions
function notImplemented(): void { /* TODO */ }

// Pattern 2: Always-false guards
if (false) { /* code */ }

// Pattern 3: Post-return code
return result;
unreachableCode();

// Pattern 4: Commented functions
// function oldHandler() {
//   /* ... */
// }
```

**Scan Command:**
```powershell
# Find always-false guards
Get-ChildItem -Path "src" -Recurse -Include "*.ts" | 
  Select-String -Pattern "if\s*\(\s*false\s*\)" | 
  Select-Object Path, LineNumber
```

---

## 🛡️ Safety Checklist (Per Item)

Before deleting ANY code:

- [ ] **Grep Verification** — No matches in codebase
- [ ] **Dynamic Access Check** — No reflection/computed access
- [ ] **Build Passes** — `npm run build` succeeds
- [ ] **Tests Pass** — `npm test` succeeds
- [ ] **Git Staged** — Can rollback immediately
- [ ] **Router Updated** — ROUTER.md references removed

---

## 📋 Cleanup Workflow

### Session 1: Console Migration (P0)
1. List all 24 files with console.* calls
2. Batch 1: Migrate 8 files
3. Build + test verification
4. Batch 2: Migrate 8 files
5. Build + test verification
6. Batch 3: Migrate 8 files
7. Final build + test verification

### Session 2: RNG Consolidation (P1)
1. Update `battle-turn.ts` import
2. Update RNG usage pattern
3. Run battle tests
4. Delete `engine/rng.ts`
5. Update ROUTER.md
6. Final build + test

### Session 3: TODO Audit (P2)
1. Export full TODO list
2. Categorize by evidence tier
3. Create cleanup tasks for Tier A/B
4. Document Tier C/D for backlog

### Session 4: Dead Code Scan (P3)
1. Scan for stub functions
2. Scan for always-false guards
3. Scan for commented code blocks
4. Conservative deletion (Tier A only)

---

## 📊 Expected Outcomes (EXPANDED)

| Session | Files Modified | Lines Deleted | Disk Saved | Confidence |
|---------|----------------|---------------|------------|------------|
| **Session 0: Deps Cleanup** | package.json | — | 15 MB | High |
| **Session 1: Store Cleanup** | — | 420 files | 0.57 MB | High |
| **Session 2: Math.random Fix** | ~15 | ~150 | — | High |
| **Session 3: Console Migration** | 24 | ~100 | — | High |
| **Session 4: RNG Consolidation** | 2 | ~30 | — | High |
| **Session 5: Empty Barrel + Dirs** | 11 | ~20 | — | Medium |
| **Session 6: Deprecated Code** | ~10 | ~200 | — | Medium |
| **Session 7: Skipped Tests** | 5 | TBD | — | Medium |
| **Session 8: TODO Cleanup** | TBD | TBD | — | Medium |
| **Session 9: Dead Code** | TBD | TBD | — | Low-Medium |
| **TOTAL** | ~70+ | ~800+ | 15.57 MB | — |

---

## 📁 Additional Cleanup Opportunities

### dist/ Folder (Not Tracked)
- Size: 4.31 MB
- Action: Clean rebuild clears this automatically (`npm run build`)

### node_modules/ Folder (Not Tracked)
- Size: ~500+ MB
- Action: After dependency cleanup, `rm -rf node_modules && npm ci`

### Archived Documentation
- Location: `docs/archive/`
- Size: 381 KB
- Action: Keep for historical reference

### 23 Prisma Migrations
- Location: `prisma/migrations/`
- Action: Keep all (migration history required)

---

## 🚨 Rollback Plan

After each batch:
```bash
# If issues detected:
git diff HEAD

# Revert specific file:
git checkout HEAD -- path/to/file.ts

# Revert entire batch:
git reset --hard HEAD
```

---

## 📈 Progress Tracking (UPDATED)

```markdown
## Session 0: Dependency Cleanup (5 min)
- [ ] Uninstall unused dependencies (4)
- [ ] Uninstall unused devDependencies (4)
- [ ] Install missing dependencies (3)
- [ ] Verify build passes

## Session 1: Store/ Data Cleanup (5 min)
- [ ] Delete expired error reports (420 files)
- [ ] Verify retention policy compliance
- [ ] Update INVENTORY-RUNTIME.md counts

## Session 2: Math.random() Fix (3-4 hours)
- [ ] Audit all 49 instances
- [ ] Create RNG service wrapper for security modules
- [ ] Batch 1: continuous-aggregates-service.ts (5 fixes)
- [ ] Batch 2: cross-reference-validation-service.ts (2 fixes)
- [ ] Batch 3: Remaining 42 instances
- [ ] Verify all tests pass

## Session 3: Console Migration (2-3 hours)
- [ ] Batch 1 (8 files)
- [ ] Batch 2 (8 files)
- [ ] Batch 3 (8 files)
- [ ] Documentation updates

## Session 4: RNG Consolidation (30 min)
- [ ] Migrate battle-turn.ts
- [ ] Delete engine/rng.ts
- [ ] Update ROUTERs
- [ ] Verification

## Session 5: Empty Barrel Fix (45 min)
- [ ] Find all 10 imports of models/index
- [ ] Replace with direct imports
- [ ] Delete models/index.ts
- [ ] Verify build

## Session 6: Deprecated Code Cleanup (2-3 hours)
- [ ] Audit 21 @deprecated markers
- [ ] Remove unused deprecated methods
- [ ] Update callers to replacement methods
- [ ] Delete heap-pruner.ts if confirmed deprecated

## Session 7: Skipped Tests Fix (2-4 hours)
- [ ] Review 15 skipped tests
- [ ] Fix/enable or delete obsolete tests
- [ ] Document remaining skipped tests

## Session 8: TODO Audit (4-6 hours)
- [ ] Export TODOs
- [ ] Categorize
- [ ] Create tasks

## Session 9: Dead Code Scan (8-10 hours)
- [ ] Pattern detection
- [ ] Evidence gathering
- [ ] Safe deletions
```

---

**Next Action:** Request approval to proceed with cleanup sessions in priority order

**Recommended Execution Order:**
1. **Session 0** — Dependency cleanup (5 min, 15 MB saved)
2. **Session 1** — Store/ data cleanup (5 min, 0.57 MB saved)
3. **Session 2** — Math.random() fixes (**CRITICAL** — SensaiOS contract violation)
4. **Session 3** — Console migration (observability)
5. **Session 4** — RNG consolidation (quick win)
6. **Session 5** — Empty barrel + directories fix
7. **Session 6** — Deprecated code cleanup
8. **Session 7** — Skipped tests fix
9. **Sessions 8-9** — Technical debt audit (lower priority)

**Estimated Total Time:** 25-35 hours across 9 sessions

**Total Impact:** 15.57 MB disk space + ~800+ lines removed

**Risk Level:** Low-Medium (all changes reversible, build/test gates)

---

**Created By:** cleanup-agent  
**Updated:** 2026-01-06T16:00:00Z (Phase 3 — Comprehensive Expansion)  
**Scan Iterations:** 3 (Discovery → Expanded → Comprehensive)
**References:** 
- `envelope-migration.instructions.md`
- `sensai.instructions.md` (Math.random() violation)
- `docs/development-bible/10-dead-code-analysis.md`
- `ops/inventory/INVENTORY-CODE.md`
- `ops/inventory/INVENTORY-RUNTIME.md`
- `.github/instructions/cleanup.instructions.md`

