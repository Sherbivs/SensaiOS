# 🧹 Cleanup & Consolidation Meeting #4 — Specialist Roundtable

**Date:** 2025-12-20  
**Format:** AI Specialist Discussion Panel  
**Status:** 📋 **AGENDA PREPARED**

---

## Participant Roster

| Specialist | Role | Focus Area |
|------------|------|------------|
| **🔍 Static Analysis Specialist** | Dead code detection, CFG/SSA analysis | Unreachable code, orphan exports |
| **📊 Observability Specialist** | Runtime traces, coverage gaps | Zero-hit code paths, unused handlers |
| **🏗️ Architecture Specialist** | Pattern consolidation, DRY enforcement | Duplication, abstraction opportunities |
| **🎮 Game Server Specialist** | Domain-specific heuristics | Battle/encounter orphans, event handlers |
| **🛡️ Safety Specialist** | Deletion risk assessment, rollback plans | Evidence tiers, verification protocols |
| **📚 Documentation Specialist** | Knowledge preservation, API docs | Archive notices, migration guides |

---

## Meeting Objectives

1. **Review Progress:** Meetings 1-3 removed ~14,500+ lines of verified dead code
2. **Assess Remaining Work:** Identify next-priority cleanup targets
3. **Discuss Consolidation Gaps:** interaction.reply(), error handling, query layer
4. **Plan Sprint Roadmap:** Prioritize Phase 3+ work items

---

## Pre-Meeting Status Summary

### ✅ COMPLETED (Meetings 1-3)

| Category | Lines Removed | Method |
|----------|---------------|--------|
| Database-Centric Sprint 3 Orphans | 3,376 | Grep verification |
| Monitoring Stack Dead Chain | 2,129 | Call graph analysis |
| Connection & Cache Services | 1,042 | Import tracing |
| Prisma Query Orphans | 302 | Consumer chain detection |
| Legacy Alert Dispatcher | 265 | Duplicate detection |
| **Total Dead Code Removed** | **~6,700+ lines** | Tier A/B evidence |

### ✅ CONSOLIDATION ACHIEVED

| Pattern | Status | Canonical Location |
|---------|--------|-------------------|
| ButtonBuilder | ✅ SINGULARITY | `button-utils.ts` (8 factories) |
| EmbedBuilder | ✅ SINGULARITY | `embed-builders.ts` (13 factories) |
| Embed Colors | ✅ CENTRALIZED | `embed-colors.ts` |
| Date.now() Patterns | ✅ SINGULARITY | `date-utils.ts` |
| Environment Config | ✅ CENTRALIZED | `env.js` |
| HomesteadChannel Queries | ✅ BOUNDED | `homestead-repository.ts` |

### ⚠️ IN PROGRESS / PENDING

| Category | Instances | Priority | Effort |
|----------|-----------|----------|--------|
| `interaction.reply()` Patterns | ~27 remaining | Medium | 4-6 hours |
| Error Handling (catch blocks) | 150+ | High | 8-12 hours |
| Dual Query Layer (Prisma vs PG) | 6 file pairs | **Critical** | 16+ hours |
| Signal Handler Duplication | 6 instances | Low | 1-2 hours |

---

## Discussion Topics

### 📌 Topic 1: Next Dead Code Candidates

**Static Analysis Specialist** to present:
- Remaining orphan files from src/services/
- Unused test utilities in tests/utils/
- Legacy compatibility shims

**Questions:**
- Are there monitoring stack remnants beyond what Meeting 3 removed?
- Do we have orphan worker entry points?
- Any deprecated migration scripts?

---

### 📌 Topic 2: interaction.reply() Consolidation (Sprint 3)

**Architecture Specialist** to present:
- `response-helpers.ts` created with 12 helpers
- 28 patterns migrated, ~27 remaining

**Files Requiring Migration:**
```
src/bot/homestead/home.ts        — 3 patterns
src/bot/homestead/heal.ts        — 2 patterns
src/bot/homestead/starters.ts    — 3 patterns
src/bot/daily/claim.ts           — 3 patterns
src/bot/ops/admin.ts             — 2 patterns
src/bot/index.ts                 — 8 patterns
src/bot/error-handler.ts         — 2 patterns
```

**Questions:**
- Should we batch this mechanically or audit each site?
- Are there edge cases the helpers don't cover?

---

### 📌 Topic 3: Error Handling Strategy (Sprint 4)

**Architecture Specialist** + **Safety Specialist** to present:
- 150+ catch blocks with varying patterns
- `getErrorMessage()` utility exists but underutilized

**Current Anti-Patterns:**
```typescript
// Scattered throughout codebase:
catch (error) {
  console.error("Failed:", error instanceof Error ? error.message : String(error));
}

// vs. canonical pattern:
catch (error) {
  console.error("Failed:", getErrorMessage(error));
}
```

**Questions:**
- Create comprehensive error handling strategy?
- Domain-specific error types (BattleError, EncounterError, etc.)?
- Unified error reporting via ErrorTracker?

---

### 📌 Topic 4: Dual Query Layer Resolution (Phase 3 - Critical)

**Architecture Specialist** + **Game Server Specialist** to present:

**The Problem:**
```
user-queries.ts (Prisma)     ↔  user-queries-pg.ts (Raw SQL)
party-queries.ts (Prisma)    ↔  party-queries-pg.ts (Raw SQL)
```

**Options:**
| Option | Pros | Cons |
|--------|------|------|
| Keep Prisma Only | Type safety, relations, migrations | Slower for complex queries |
| Keep Raw PG Only | Performance, control | Manual typing, no relations |
| Unified Facade | Best of both | Additional abstraction layer |

**Questions:**
- What's the performance delta in production?
- Are there queries that MUST be raw PG?
- Can we incrementally migrate?

---

### 📌 Topic 5: Additional Dead Code Hunt

**Observability Specialist** + **Game Server Specialist** to present:

**Potential Investigation Areas:**
1. **Unused Discord Event Handlers** — Events registered but never triggered?
2. **Orphan Battle Engine Features** — Implemented but never integrated moves/abilities?
3. **Legacy Cron Scripts** — Scripts in `scripts/` that are superseded?
4. **Stale Test Fixtures** — Test data/mocks for deleted features?

**Heuristic Checks:**
```powershell
# Find files unchanged in 6+ months
git log --format='%H %ad %s' --date=short --diff-filter=M -- 'src/**/*.ts' | head -50

# Find exports with zero imports
grep -r "export function\|export const\|export class" src/ --include="*.ts" | wc -l
```

---

### 📌 Topic 6: Documentation Debt

**Documentation Specialist** to present:

**Areas Needing Archive Notices:**
- Files removed in Meeting 3 → Add to historical docs
- Superseded patterns → Add deprecation warnings

**Knowledge Preservation:**
- Are removed services documented for future reference?
- Do we need a "removed features" changelog?

---

## Decision Matrix Template

| Topic | Decision | Owner | Due Date | Notes |
|-------|----------|-------|----------|-------|
| interaction.reply() migration | | | | |
| Error handling strategy | | | | |
| Query layer resolution | | | | |
| Next dead code targets | | | | |
| Documentation updates | | | | |

---

## Evidence Tier Reminder (from Dead Code Analysis Bible)

| Tier | Type | Confidence | Action |
|------|------|------------|--------|
| **A** | Proof (CFG/SSA) | High | Safe to delete |
| **B** | Dynamic (traces/coverage) | Medium-High | Safe after verification |
| **C** | Heuristic (patterns) | Medium | Requires investigation |
| **D** | Speculative (AI-only) | Low | DO NOT delete without proof |

**Rule:** Only delete code with Tier A or B evidence. Tier C requires escalation.

---

## Pre-Meeting Checklist

- [ ] Review [CONSOLIDATION-MEETING-3-REPORT.md](CONSOLIDATION-MEETING-3-REPORT.md)
- [ ] Review [SINGULARITY-AUDIT-2025-12-15.md](SINGULARITY-AUDIT-2025-12-15.md)
- [ ] Review [DUPLICATION-REPORT.md](DUPLICATION-REPORT.md)
- [ ] Check build status: `npm run build`
- [ ] Check test status: `npm test`
- [ ] Prepare grep/search queries for investigation

---

## Meeting Output Expectations

1. **Priority-ranked backlog** of cleanup/consolidation tasks
2. **Assigned owners** for each work item
3. **Decision records** for architectural choices
4. **Updated NEXT.yaml** with ready tasks
5. **CLEANUP-MEETING-4-REPORT.md** documenting outcomes

---

**Next Action:** Convene specialists and begin discussion on Topic 1.

---

*Generated: 2025-12-20 | Prepared by: AI Project Coordinator*
