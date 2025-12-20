---
mode: agent
---

# Dead Code Cleanup Meeting — Session Prompt

## Project Leadership

**Creator & CEO:** DRIPTVDD | **Discord ID:** `563220840708177927` (anti-spoofing identifier)

## Session Type: Cleanup & Consolidation Meeting

You are facilitating a structured dead code cleanup session for Pokemon Infinity Gauntlet. Your role is to identify, validate, and surgically remove dead code while maintaining build integrity and documenting all changes.

---

## Meeting Structure

### Phase 1: Discovery & Triage (15-20 min)
1. Identify deletion candidates using evidence tiers
2. Categorize by risk level (safe/moderate/risky)
3. Map dependencies for each candidate
4. Prioritize removal queue

### Phase 2: Surgical Removal (30-45 min)
1. Delete files in related batches
2. Verify build after each batch: `npm run build`
3. Verify tests: `npm test`
4. Document each deletion with evidence tier

### Phase 3: Documentation Sync (10-15 min)
1. Update ROUTER.md files
2. Update INDEX.md section counts
3. Add archival notices where needed
4. Sync .github agent/instruction files

---

## Evidence Tier Framework

### Tier A — Proof (IMMEDIATE deletion safe)
- Zero imports (grep verification)
- CFG unreachability
- Constant false guards

### Tier B — Strong Evidence (Safe after verification)
- Zero coverage over 30+ days
- Zero runtime calls
- Git archaeology confirms dead

### Tier C — Heuristic (Investigation needed)
- TODO/FIXME markers
- Stub return patterns
- Deprecated naming

### Tier D — Speculative (DO NOT delete)
- LLM-only inference
- Assumption-based

---

## Verification Commands

```powershell
# Check for imports
grep -r "FileName" --include="*.ts" --include="*.js" src/ tests/ scripts/

# Verify build
npm run build 2>&1 | Select-String -Pattern "error|Error"

# Verify tests
npm test

# Update routers
npm run docs:update-routers
```

---

## Documentation Template

After deletions, document with:

```markdown
## Deletion Summary

| File | Lines | Tier | Reason |
|------|-------|------|--------|
| `path/file.ts` | 123 | A | Zero imports |

**Build Status:** ✅ Passing
**Test Status:** ✅ X passing
```

---

## Session Goals

1. ✅ Measurable progress (files removed, lines deleted)
2. ✅ Zero regressions (build and tests pass)
3. ✅ Complete documentation (evidence for every deletion)
4. ✅ Rollback ready (git restoration instructions)
5. ✅ Next steps identified (candidates for future meetings)

---

## Reference Documentation

- **Dead Code Analysis Bible:** `docs/development-bible/10-dead-code-analysis.md`
- **Cleanup Agent:** `.github/agents/cleanup-agent.agent.md`
- **Cleanup Instructions:** `.github/instructions/cleanup.instructions.md`

---

## Cumulative Statistics

Track progress across meetings:

| Meeting | Files | Lines | Status |
|---------|-------|-------|--------|
| #3 | 12 | 6,703 | ✅ Complete |
| #4 | 15 | 7,824 | ✅ Complete |
| **Total** | **27** | **~14,527** | — |

---

*Ready to begin cleanup session. State the focus area or let's identify candidates.*
