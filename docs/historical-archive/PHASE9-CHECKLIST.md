# Phase 9 Repository Optimization - Quick Start Checklist

**Date:** 2025-11-07  
**Status:** READY TO BEGIN  
**Plan:** See `ops/REPO-OPTIMIZATION-PLAN.md` for full details

---

## Pre-Flight Checklist ✅

- [x] Phase 1-8 complete (Accelerate migration)
- [x] All 16 commits pushed to origin
- [x] Build passing (zero TypeScript errors)
- [x] Working tree clean (`git status`)
- [x] Optimization plan created (`ops/REPO-OPTIMIZATION-PLAN.md`)
- [x] Todo list updated with Phase 9 tasks
- [x] NEXT.yaml pointing to `REPO.OPTIMIZATION.PLANNING`

---

## Phase 1: Planning & Audit (START HERE)

### Step 1: Capture Baseline Metrics

```bash
# Repository size
git count-objects -vH > baseline-git-size.txt
find . -type f | wc -l > baseline-file-count.txt
npx cloc src/ tests/ scripts/ docs/ > baseline-code-stats.txt

# Dependencies
npm audit > baseline-npm-audit.txt
npm outdated > baseline-npm-outdated.txt
npx depcheck > baseline-depcheck.txt

# Linter
npm run lint > baseline-lint.txt 2>&1

# Test performance
npx vitest run --reporter=verbose > baseline-test-performance.txt 2>&1

# Test coverage (if vitest coverage configured)
npx vitest run --coverage > baseline-test-coverage.txt 2>&1
```

**Save all baseline files to:** `ops/baseline-metrics/` (create directory)

### Step 2: File System Audit

```bash
# Find potentially unused scripts
ls -la scripts/ | grep -i "accelerate\|prisma.*postgres\|sync.*render"

# Find large files
find . -type f -size +1M | grep -v node_modules | grep -v .git

# Find duplicate file names
find . -type f | grep -v node_modules | grep -v .git | xargs basename -a | sort | uniq -d

# Count documentation files
find docs/ -type f -name "*.md" | wc -l
```

### Step 3: Code Analysis

```bash
# Find commented code blocks
grep -r "^[[:space:]]*//.*{" src/ | wc -l
grep -r "^[[:space:]]*/\*" src/ | wc -l

# Find TODO/FIXME comments (should be zero after Phase 6)
grep -r "TODO\|FIXME" src/ tests/ scripts/

# Find unused imports (from linter output)
npm run lint 2>&1 | grep "defined but never used" | wc -l
```

### Step 4: Create Audit Report

Create `ops/REPO-AUDIT-FINDINGS.md` with:

```markdown
# Repository Audit Findings - Phase 9.1

**Date:** 2025-11-07  
**Auditor:** [Your Name/AI]

## Baseline Metrics

### Repository Size
- Total files: [from baseline]
- Git object count: [from baseline]
- Lines of code: [from cloc baseline]

### Code Quality
- TypeScript errors: 0 ✅
- Linter warnings: 27 ⚠️
- npm audit issues: [from baseline] 
- Outdated packages: [from baseline]
- Unused dependencies: [from depcheck]

### Test Suite
- Total tests: [count]
- Execution time: [seconds]
- Coverage: [%] (if available)

## Findings by Category

### 1. Unused Files (scripts/)
- [ ] script-name.ext - [reason it's unused]
- [ ] ...

### 2. Unused Files (docs/)
- [ ] doc-name.md - [duplicate of / outdated]
- [ ] ...

### 3. Dead Code (src/)
- [ ] src/path/file.ts:functionName - [0 references]
- [ ] ...

### 4. Unused Dependencies
- [ ] package-name - [from depcheck]
- [ ] ...

### 5. Configuration Issues
- [ ] Issue description
- [ ] ...

### 6. Documentation Issues
- [ ] doc-name.md - [specific inaccuracy]
- [ ] ...

### 7. Test Issues
- [ ] Slow test: test-name (Xs)
- [ ] Redundant: test-1 == test-2
- [ ] Missing coverage: feature-name
- [ ] Linter warnings: [list files]

## Prioritized Action Items

### High Priority (Phase 9.2)
1. [Item]
2. [Item]

### Medium Priority (Phase 9.3-9.5)
1. [Item]
2. [Item]

### Low Priority (Future)
1. [Item]
2. [Item]

## Estimated Impact

- Files to remove: ~[X]
- Lines to delete: ~[X]
- Dependencies to remove: ~[X]
- Linter warnings to fix: 27
- Estimated time savings: [X hours/week]
```

---

## Phase 2-7: Execution (AFTER Phase 1)

**Do NOT proceed until:**
- ✅ Audit report complete
- ✅ Baseline metrics captured
- ✅ Action items prioritized
- ✅ Team review (if applicable)

**Execution order:** Follow phases 2-7 in sequence per plan

---

## Phase 8: Final Validation

### Validation Commands

```bash
# Build
npm run build

# Tests
npm test

# Linter (target: 0 warnings)
npm run lint

# Audit (target: 0 vulnerabilities)
npm audit

# Coverage (target: >80%)
npx vitest run --coverage
```

### Create Final Report

Create `ops/REPO-OPTIMIZATION-REPORT.md` following template in plan.

### Git Workflow

```bash
# Stage all changes
git add -A

# Commit with summary
git commit -m "Phase 9: Repository optimization complete

- Removed [X] unused files
- Deleted [Y] lines of dead code
- Cleaned [Z] dependencies
- Fixed 27 linter warnings
- Improved test suite to <5s execution
- Achieved >80% coverage

See ops/REPO-OPTIMIZATION-REPORT.md for details."

# Optional: Create tag
git tag -a v1.0.0-phase9-optimized -m "Phase 9 optimization complete"

# Push
git push origin main --tags
```

---

## Quick Reference

**Plan:** `ops/REPO-OPTIMIZATION-PLAN.md`  
**Todo List:** See GitHub Copilot todo list (8 phases)  
**Next Pointer:** `ops/NEXT.yaml` → `REPO.OPTIMIZATION.PLANNING`  
**Baseline Metrics:** `ops/baseline-metrics/` (create this)  
**Audit Findings:** `ops/REPO-AUDIT-FINDINGS.md` (Phase 1 deliverable)  
**Final Report:** `ops/REPO-OPTIMIZATION-REPORT.md` (Phase 8 deliverable)

**Time Estimate:** 12-17 hours total (2-3 days recommended)  
**Current Phase:** 1 (Planning & Audit)  
**Status:** ⏳ READY TO START

---

## Success Criteria Reminder

✅ Zero TypeScript errors  
✅ Zero linter warnings (down from 27)  
✅ Zero npm audit vulnerabilities  
✅ <5 second test suite execution  
✅ >80% test coverage (critical paths)  
✅ No unused files  
✅ No dead code  
✅ No unused dependencies  
✅ Documentation accuracy verified  
✅ Comprehensive optimization report

**Ready to begin? Start with Phase 1: Capture baseline metrics! 🚀**
