---
applyTo: '**'
---

# Cleanup & Consolidation Instructions — Pokemon Infinity Gauntlet

Instructions for dead code detection, cleanup meetings, and documentation consolidation operations.

## Evidence-Based Deletion Framework

### Tier A — Proof (IMMEDIATE deletion safe)
- **CFG Unreachability**: No control flow path reaches the code
- **Zero Imports**: Exported symbol imported nowhere (grep returns empty)
- **SSA Dead Assignment**: Variable assigned but never read
- **Constant False Guards**: `if (false)`, `if (DEPRECATED_FLAG && false)`

### Tier B — Strong Evidence (Safe after verification)
- **Zero Coverage**: 0% line hits in coverage reports over 30+ days
- **Zero Runtime**: OpenTelemetry traces show no invocations
- **Git Archaeology**: No changes in 12+ months, author confirms dead

### Tier C — Heuristic (Requires investigation)
- **TODO/FIXME/HACK**: Comments suggesting incomplete work
- **Stub Returns**: `return null`, `throw new Error("Not implemented")`
- **Naming Patterns**: `*_old`, `*_backup`, `*_deprecated`

### Tier D — Speculative (DO NOT delete without proof)
- **LLM-Only**: AI suggests dead without evidence
- **Assumption-Based**: "Looks unused" without verification

## Pre-Deletion Checklist

Before deleting ANY file or code block:

```powershell
# 1. Verify no imports exist
grep -r "FileName" --include="*.ts" --include="*.js" src/ tests/ scripts/

# 2. Check for dynamic access patterns
grep -r "require\|import\|from" --include="*.ts" | grep -i "dynamic\|variable"

# 3. Verify build passes after deletion
npm run build 2>&1 | Select-String -Pattern "error|Error"

# 4. Verify tests pass
npm test

# 5. Check barrel exports
grep -r "export.*from.*deleted-file" --include="index.ts"
```

## File Deletion Workflow

### Step 1: Document the Candidate
```markdown
| File | Lines | Evidence Tier | Reason |
|------|-------|---------------|--------|
| `src/path/file.ts` | 123 | A | Zero imports, grep verified |
```

### Step 2: Remove from Barrel Exports
```typescript
// Before: src/repositories/index.ts
export * from "./base-repository.js";     // DELETE this line
export * from "./trainer-repository.js";  // DELETE this line
export * from "./homestead-repository.js"; // KEEP - still active
```

### Step 3: Delete the File
```powershell
Remove-Item "src/path/file.ts"
```

### Step 4: Verify Build
```powershell
npm run build 2>&1 | Select-String -Pattern "error|Error"
```

### Step 5: Update Documentation
- Remove from `ROUTER.md` files
- Update section counts in INDEX files
- Add archival notices where appropriate

## TypeScript Dead Code Patterns

### Stub Detection
```typescript
// HIGH CONFIDENCE — Delete these patterns
function notImplemented(): void { /* TODO */ }
const handler = () => { throw new Error("Not impl"); };
export const LEGACY_MODE = false; // Never-true constant

// VERIFY FIRST — May be intentional
function deprecated(): void { console.warn("Deprecated"); }
const placeholder = () => null; // Check if used as default
```

### Unreachable Code
```typescript
// IMMEDIATE DELETE — Provably unreachable
if (false) { this.neverRuns(); }
return result; this.afterReturn(); // Post-return code
switch (x) { default: break; } // Fall-through with no cases

// VERIFY — May have edge cases
if (process.env.NEVER_SET) { specialMode(); }
```

### Orphan Exports
```typescript
// Check with: grep -r "importedFunction" src/ tests/
export function importedFunction() { } // If grep returns empty → SAFE to delete
export const IMPORTED_CONST = 42;       // Same verification
```

## Game-Server Specific Checks

### Discord Bot Dead Code
- **Unregistered Commands**: Defined in files but not in command registration
- **Orphan Event Handlers**: `client.on('event')` for events never emitted
- **Deprecated Interactions**: Button/Select handlers for removed UI

### Database Layer Dead Code
- **Unused Repositories**: Classes with no instantiation or injection
- **Orphan Query Builders**: Builder patterns never called
- **Legacy Schema Helpers**: Old migration utilities

### Worker Dead Code
- **Unscheduled Jobs**: Job definitions with no cron/interval setup
- **Deprecated Workers**: Worker entry points not in render.yaml

## Documentation Updates After Cleanup

### ROUTER.md Updates
```markdown
# Before
Areas:
- base-repository.ts — Abstract base for all repositories
- trainer-repository.ts — Trainer CRUD operations

# After  
Areas:
- homestead-repository.ts — Homestead channel CRUD (ACTIVE)
# NOTE: base-repository.ts, trainer-repository.ts removed in Meeting #4
```

### INDEX.md Updates
```markdown
# Update section counts
**Total Sections**: 9 → 10

# Update estimated reading time
- **Full Read**: ~30 minutes → ~55 minutes
```

### Archival Notices
```markdown
## ⚠️ ARCHIVED (2025-12-20)

This module was removed in Dead Code Cleanup Meeting #4.

**Removed Files:**
- `base-repository.ts` (234 lines) — Abstract base, unused after Prisma migration
- `trainer-repository.ts` (189 lines) — Replaced by direct Prisma queries

**Reason:** Migration to direct Prisma patterns eliminated repository abstraction layer.

**If Restoration Needed:**
\```bash
git checkout HEAD~N -- path/to/file.ts
\```
```

## Meeting Summary Template

After each cleanup meeting, update documentation with:

```markdown
## Dead Code Cleanup — Meeting #N Summary

**Date:** YYYY-MM-DD
**Files Removed:** X files
**Lines Deleted:** ~Y,YYY lines
**Build Status:** ✅ Passing

### Deletions
| Category | Files | Lines |
|----------|-------|-------|
| Repositories | 5 | 1,234 |
| Utilities | 3 | 567 |

### Documentation Updated
- [x] ROUTER.md files
- [x] INDEX.md section counts
- [x] Archival notices added
- [x] Agent configs synced
```

## Rollback Procedures

If deletion causes issues:

### Immediate Rollback (Single File)
```powershell
git checkout HEAD~1 -- path/to/deleted/file.ts
npm run build
```

### Batch Rollback (Multiple Files)
```powershell
git revert HEAD --no-commit
npm run build
npm test
git commit -m "Revert: Cleanup Meeting #N (issue: X)"
```

### Selective Restoration
```powershell
# Find the commit before deletion
git log --oneline -10

# Restore specific file from that commit
git checkout abc1234 -- path/to/file.ts
```

## Reference Documentation

- **Dead Code Analysis Bible**: `docs/development-bible/10-dead-code-analysis.md`
- **Cleanup Agent**: `.github/agents/cleanup-agent.agent.md`
- **Patch.md**: Contract rules for all modifications
- **Development Bible**: `docs/development-bible/INDEX.md`

---

**Created:** 2025-12-20 | **For:** Dead Code Cleanup Initiative
