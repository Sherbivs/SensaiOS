# Repository Optimization Plan - Phase 9

**Date Created:** 2025-11-07  
**Current State:** Post-Accelerate Migration (Phase 1-8 Complete)  
**Objective:** Maximize repository efficiency, eliminate technical debt, improve maintainability

---

## Executive Summary

With the Accelerate→2-Node migration complete (16 commits, 8 phases), the repository is production-ready but contains accumulated technical debt from rapid iteration. Phase 9 focuses on **optimization and fine-tuning** to maximize operational efficiency.

**Key Metrics (Current State):**
- **Build:** ✅ Zero TypeScript errors
- **Linter:** ⚠️ 27 warnings (unused variables in test files)
- **Active Code:** ✅ Clean (zero Accelerate refs, zero TODOs, zero stale env vars)
- **Documentation:** ⚠️ ~190 historical Accelerate references preserved (intentional)
- **Repository Size:** Unknown (needs audit)
- **Dependencies:** Unknown vulnerabilities count
- **Test Coverage:** Unknown % (needs measurement)

---

## Phase 9 Objectives

### 1. **Repository Audit & Analysis** (Planning)
**Estimated Time:** 2-3 hours  
**Deliverable:** Comprehensive findings document

**Audit Areas:**
- [ ] **File System Audit**
  - Unused scripts in `scripts/` (migration/bootstrap helpers for Accelerate)
  - Stale documentation in `docs/` (duplicates, outdated guides)
  - Orphaned test fixtures in `tests/`
  - Legacy config files (old .env templates, deprecated configs)
  
- [ ] **Code Analysis**
  - Dead code in `src/` (unreferenced functions, commented blocks)
  - Unused imports (linter reports + manual grep)
  - Duplicate functionality (multiple implementations of same feature)
  - Call graph analysis (find orphaned modules)
  
- [ ] **Dependency Analysis**
  - `npm audit` for vulnerabilities
  - `npm outdated` for upgrade opportunities
  - `depcheck` for unused packages
  - Duplicate dependencies (e.g., multiple lodash versions)
  
- [ ] **Configuration Review**
  - Multiple `.env.example` files (consolidate?)
  - TypeScript config redundancy (`tsconfig.json` vs `tsconfig.build.json`)
  - ESLint/Prettier overlap
  - `render.yaml` verbosity
  
- [ ] **Documentation Accuracy**
  - README.md setup steps vs reality
  - AGENTS.md practices vs current code
  - API documentation examples (do they work?)
  - ROUTER.md files (verify routing tables match code)
  
- [ ] **Test Suite Health**
  - Coverage gaps (battle engine, encounters)
  - Redundant tests (same logic tested multiple times)
  - Slow tests (>1s execution)
  - 27 linter warnings (unused imports in tests)

**Measurement Baseline:**
```bash
# Repository size
du -sh .git
find . -type f | wc -l
cloc src/ tests/ scripts/

# Dependencies
npm audit
npm outdated
npx depcheck

# Test performance
npx vitest run --reporter=verbose

# Code quality
npm run lint | grep "problems"
```

---

### 2. **Prune Unused Files** (Execution)
**Estimated Time:** 1-2 hours  
**Estimated Removals:** 50-100 files

**Targets:**

**scripts/ (Migration Helpers):**
- [ ] `scripts/sync_accelerate_to_render.ps1` (Accelerate-specific)
- [ ] `scripts/restore_prisma_postgres.ps1` (Accelerate-specific)
- [ ] Any other Accelerate-related scripts flagged in audit

**docs/ (Stale Documentation):**
- [ ] Identify duplicates (e.g., multiple "getting started" guides)
- [ ] Archive vs delete decision (use archive catalog approach)
- [ ] Remove outdated API docs that reference removed code

**tests/ (Unused Fixtures):**
- [ ] Old mock data for Accelerate workflows
- [ ] Deprecated test helpers
- [ ] Snapshot files for removed features

**Configuration:**
- [ ] Old `.env` templates (if multiple exist)
- [ ] Deprecated config files (old ESLint, Prettier versions)

**Safety Protocol:**
1. **Before deletion:** Run `git grep <filename>` to check references
2. **Document removals:** Each commit message lists removed files with rationale
3. **Staged deletion:** Commit in logical groups (scripts, docs, tests, configs)
4. **Reversibility:** Never force-push; maintain full git history

---

### 3. **Dead Code Elimination** (Execution)
**Estimated Time:** 2-3 hours  
**Estimated Removals:** 200-500 lines

**Methodology:**

**Unused Imports:**
```bash
# Linter already flags some
npm run lint | grep "defined but never used"

# Manual verification for each flagged import
```

**Unreferenced Functions:**
```bash
# Use list_code_usages tool
# Example: Check if function is called anywhere
list_code_usages --symbol="oldHelperFunction" --filePaths="src/utils/helpers.ts"
```

**Commented Code:**
```bash
# Find large comment blocks (likely old code)
grep -r "^[[:space:]]*//.*{" src/
grep -r "^[[:space:]]*/\*" src/
```

**Deprecated Utilities:**
- [ ] Functions marked with `@deprecated` JSDoc
- [ ] Modules in `src/legacy/` (if any)
- [ ] Feature flags for removed features

**Safety Checklist:**
- [ ] Run `list_code_usages` before deleting any function
- [ ] Verify zero references in `src/`, `tests/`, `scripts/`
- [ ] Preserve public API functions (even if unused internally)
- [ ] Update exports in index files after deletions

---

### 4. **Dependency Audit & Cleanup** (Execution)
**Estimated Time:** 1-2 hours  
**Expected Savings:** 10-50 MB node_modules size

**Audit Commands:**
```bash
# Check for vulnerabilities
npm audit

# Find outdated packages
npm outdated

# Find unused packages
npx depcheck

# Check for duplicate dependencies
npm dedupe --dry-run
```

**Cleanup Actions:**
- [ ] **Remove unused packages** (via depcheck results)
- [ ] **Update outdated packages** (prioritize security patches)
- [ ] **Consolidate duplicates** (e.g., if both `lodash` and `lodash-es` exist)
- [ ] **Move to devDependencies** (packages only used in dev/test)
- [ ] **Remove deprecated packages** (check npm warnings)

**Example Workflow:**
```bash
# 1. Identify unused
npx depcheck

# 2. Remove (example)
npm uninstall old-package unused-helper

# 3. Verify build still works
npm run build

# 4. Verify tests still pass
npm test

# 5. Commit
git add package.json package-lock.json
git commit -m "chore: Remove unused dependencies (old-package, unused-helper)"
```

**Target Metrics:**
- ✅ Zero npm audit vulnerabilities
- ✅ All packages <6 months outdated (except major version jumps)
- ✅ Zero unused packages (depcheck clean)

---

### 5. **Configuration Consolidation** (Execution)
**Estimated Time:** 1 hour  
**Files Affected:** 5-10 config files

**Review Targets:**

**TypeScript:**
- [ ] `tsconfig.json` vs `tsconfig.build.json` - Are both necessary?
- [ ] `tsconfig.build.json` exclusions - Are they correct?
- [ ] Shared config extraction opportunity?

**Linting:**
- [ ] `eslint.config.js` - Is it minimal?
- [ ] Prettier config - Is it duplicating ESLint rules?
- [ ] Can we use `eslint-config-prettier` to simplify?

**Environment:**
- [ ] `.env.example` - Is it accurate for 2-node cluster?
- [ ] Are there multiple .env examples? (consolidate)
- [ ] `secrets/README.md` - Does it match .env.example?

**Render:**
- [ ] `render.yaml` - Remove verbose comments (keep critical ones)
- [ ] Service definitions - Are they minimal?
- [ ] Environment variable duplication - Can we use envVarGroups?

**Standards Document:**
Create `docs/configuration-standards.md`:
- TypeScript config rationale (why two configs?)
- Linting philosophy (what we enforce, what we don't)
- Environment variable naming conventions
- Render deployment best practices

---

### 6. **Documentation Accuracy Audit** (Execution)
**Estimated Time:** 2-3 hours  
**Files Affected:** 20-30 docs

**Verification Process:**

**README.md:**
- [ ] Step-by-step setup - Does it work for new developer?
- [ ] Architecture diagrams - Do they match current 2-node cluster?
- [ ] Quick start commands - Do they execute successfully?
- [ ] Links to other docs - Are they valid?

**AGENTS.md:**
- [ ] Database connection examples - Correct for 2-node?
- [ ] Workflow examples - Match current practices?
- [ ] Tool references - Are commands accurate?
- [ ] Code snippets - Do they compile?

**API Documentation (docs/):**
- [ ] Code examples - Run them, verify they work
- [ ] API signatures - Match actual function signatures
- [ ] Response examples - Match actual responses
- [ ] Error handling - Covers current error types

**ROUTER.md Files:**
- [ ] Routing tables - Match actual Discord command handlers
- [ ] Interaction flows - Accurate sequence diagrams
- [ ] Data structures - Match TypeScript interfaces

**Action Plan:**
1. **Test every code example** in documentation
2. **Update or remove** outdated sections
3. **Archive** historical docs (don't delete - use archive catalog)
4. **Add date stamps** to technical docs (e.g., "As of 2025-11-07")
5. **Link to source** (e.g., "See src/bot/main.ts:L145")

---

### 7. **Test Suite Optimization** (Execution)
**Estimated Time:** 2-3 hours  
**Target:** <5s total suite execution, zero linter warnings

**Current Issues:**
- ⚠️ 27 linter warnings (unused imports in test files)
- ❓ Unknown coverage % (needs measurement)
- ❓ Unknown execution time (needs profiling)
- ❓ Potential redundant tests

**Optimization Tasks:**

**Fix Linter Warnings (27):**
```typescript
// Before (warning)
import { vi, beforeEach, afterEach } from 'vitest';
// None actually used

// After (clean)
import { describe, it, expect } from 'vitest';
// Only import what's needed
```

**Remove Redundant Tests:**
- [ ] Identify tests testing same logic (grep for duplicate assertions)
- [ ] Consolidate or remove duplicates
- [ ] Keep most comprehensive version

**Add Missing Critical Tests:**
- [ ] Battle engine core logic (RULESET.md compliance)
- [ ] Encounter spawn/catch flow (DATA-SCHEMA.md validation)
- [ ] Database replication edge cases (DIVERGED state handling)

**Optimize Slow Tests:**
```bash
# Identify slow tests
npx vitest run --reporter=verbose | grep "took"

# Common optimizations:
# - Mock database calls instead of real queries
# - Use smaller test datasets
# - Parallelize independent tests
# - Remove unnecessary sleeps/waits
```

**Measure Coverage:**
```bash
# Generate coverage report
npx vitest run --coverage

# Target: >80% for critical paths
# - src/core/battle/** (battle engine)
# - src/core/encounter/** (encounter system)
# - src/shared/prisma.ts (database client)
# - src/services/db-replication/** (replication system)
```

---

### 8. **Final Validation & Documentation** (Completion)
**Estimated Time:** 1 hour  
**Deliverable:** ops/REPO-OPTIMIZATION-REPORT.md

**Validation Checklist:**
- [ ] **Build:** `npm run build` - ✅ Zero errors
- [ ] **Tests:** `npm test` - ✅ All passing
- [ ] **Linter:** `npm run lint` - ✅ Zero warnings (target)
- [ ] **Audit:** `npm audit` - ✅ Zero vulnerabilities
- [ ] **Size:** Compare before/after repository size
- [ ] **Performance:** Compare before/after test execution time

**Final Report Structure:**

```markdown
# Repository Optimization Report - Phase 9

## Summary
- **Duration:** [X hours]
- **Commits:** [Y commits]
- **Files Removed:** [Z files]
- **Lines Deleted:** [N lines]

## Metrics Improvement

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Linter Warnings | 27 | 0 | -27 |
| npm Audit Issues | ? | 0 | ? |
| Repository Size | ? MB | ? MB | -? MB |
| Test Execution | ? s | <5s | -? s |
| Test Coverage | ?% | >80% | +?% |
| Unused Files | ? | 0 | -? |
| Dead Code (lines) | ? | 0 | -? |

## Changes by Category

### Files Removed (Z total)
- scripts/: [list]
- docs/: [list]
- tests/: [list]
- configs/: [list]

### Code Cleanup
- Unused imports: [N lines]
- Dead functions: [N lines]
- Commented code: [N lines]
- Total: [N lines removed]

### Dependencies
- Removed: [packages]
- Updated: [packages]
- Savings: [MB]

### Configuration
- Consolidated: [files]
- Simplified: [configs]

### Documentation
- Updated: [files]
- Archived: [files]
- Added: [new docs]

### Tests
- Fixed warnings: 27
- Removed redundant: [N tests]
- Added critical: [N tests]
- Coverage improvement: [%]
- Speed improvement: [seconds]

## Lessons Learned
- [Insight 1]
- [Insight 2]
- [Insight 3]

## Future Recommendations
- [Recommendation 1]
- [Recommendation 2]
- [Recommendation 3]
```

**Final Updates:**
- [ ] Update `Prompt.md` with Phase 9 completion notes
- [ ] Update `Tasklist.md` marking all Phase 9 tasks DONE
- [ ] Update `ops/NEXT.yaml` pointing to next priority
- [ ] Create git tag: `v1.0.0-phase9-optimized`
- [ ] Push all commits: `git push origin main --tags`

---

## Success Criteria

✅ **Build Quality:**
- Zero TypeScript compilation errors
- Zero linter warnings (down from 27)
- Zero npm audit vulnerabilities

✅ **Repository Health:**
- No unused files (scripts, docs, configs)
- No dead code in src/
- No unused dependencies
- Clean configuration (minimal, documented)

✅ **Documentation:**
- All examples tested and working
- Accurate architecture diagrams
- Up-to-date setup instructions
- Clear configuration standards

✅ **Test Suite:**
- <5 second execution time
- >80% coverage on critical paths
- Zero redundant tests
- Zero linter warnings

✅ **Operational Excellence:**
- Comprehensive optimization report
- Clear before/after metrics
- Documented lessons learned
- Roadmap for future optimization

---

## Risk Mitigation

**Risk: Deleting needed files**
- **Mitigation:** Use `git grep` to verify zero references before deletion
- **Rollback:** Full git history preserved, easy to restore

**Risk: Breaking changes from dependency updates**
- **Mitigation:** Update one package at a time, test after each
- **Rollback:** `npm install package@previous-version`

**Risk: Removing code that's needed**
- **Mitigation:** Use `list_code_usages` tool, check all references
- **Rollback:** Git revert specific commits

**Risk: Documentation drift**
- **Mitigation:** Test every code example before committing
- **Validation:** Ask team to review updated docs

**Risk: Test suite regression**
- **Mitigation:** Run full suite after every change
- **Baseline:** Capture test output before starting Phase 9

---

## Timeline Estimate

| Phase | Estimated Time | Dependencies |
|-------|---------------|--------------|
| 1. Planning & Audit | 2-3 hours | None |
| 2. Prune Files | 1-2 hours | Phase 1 |
| 3. Dead Code | 2-3 hours | Phase 1 |
| 4. Dependencies | 1-2 hours | Phase 1 |
| 5. Configuration | 1 hour | Phase 1 |
| 6. Documentation | 2-3 hours | Phase 1 |
| 7. Test Optimization | 2-3 hours | Phases 2-6 |
| 8. Final Validation | 1 hour | Phases 2-7 |
| **TOTAL** | **12-17 hours** | Sequential |

**Recommended Approach:** Execute over 2-3 days with validation checkpoints after each phase.

---

## Next Steps

1. **Review this plan** with team/stakeholders
2. **Capture baseline metrics** (run audit commands, save output)
3. **Begin Phase 1** (Planning & Audit)
4. **Create dedicated branch** (optional: `feature/phase9-optimization`)
5. **Execute phases sequentially** with commits after each
6. **Generate final report** comparing before/after metrics
7. **Celebrate wins!** 🎉

---

**Document Status:** DRAFT - Ready for Review  
**Last Updated:** 2025-11-07  
**Next Review:** After Phase 1 audit completion
