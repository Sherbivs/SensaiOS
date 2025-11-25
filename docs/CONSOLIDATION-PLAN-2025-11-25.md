# Repository Re-Consolidation Plan
**Date:** 2025-11-25  
**Goal:** Simplify repository to human-logical organization, remove deprecated code, consolidate documentation to Bibles

---

## Phase 1: Documentation Consolidation (ACTIVE)

### Root-Level Docs to Move

**Target: docs/operations-bible/**
- `MEMORY-OPTIMIZATION-2025-11-17.md` → `03-memory-management.md` (merge/replace)
- `MEMORY-AUDIT-COMPLETE-2025-11-18.md` → Archive or merge to 03
- `MEMORY-LEAK-FIX-2025-11-18.md` → Archive or merge to 03
- `MEMORY-PROFILING-GUIDE.md` → `development-bible/05-profiling.md`
- `MEMORY-PROFILING-IMPLEMENTATION.md` → Archive or merge to dev-bible/05
- `DISCORD-CACHE-MANAGEMENT.md` → `03-memory-management.md` (section)
- `DATABASE-SYSTEM-AUDIT-2025-11-17.md` → `02-database-operations.md` (merge)
- `LOGGING-AND-STORAGE-AUDIT-2025-11-21.md` → `operations-bible/08-logging.md` (new)

**Target: docs/architecture-bible/**
- `SEAMLESS-RESTART-ARCHITECTURE.md` → `15-seamless-restart.md` (new)
- `SEAMLESS-RESTART-OPTIMIZATION.md` → Merge to 15 or archive
- `SEAMLESS-RESTART-IMPLEMENTATION-COMPLETE.md` → Archive (completed work)
- `SAVE-STATE-OPTIMIZATION-MAP.md` → Merge to 15 or archive
- `RESOURCE-LIMITS-RAM-VS-DISK.md` → `architecture-bible/16-resource-limits.md`

---

## Phase 2: Remove Deprecated DM Code (HIGH PRIORITY)

### Files to DELETE
```
src/bot/dm/
├── home.ts (openProfileView, openPartyView, openBoxView - move to homestead/)
├── heal.ts (handleHeal - move to homestead/)
├── starters.ts (openStartersDM, handleStarterPick - move to homestead/)
└── ROUTER.md (deprecated)
```

### Files to UPDATE (10 createDM() call sites)

**Source Files:**
1. `src/commands/home.js` line 559 → Replace with homestead channel lookup
2. `src/commands/profile.js` line 71 → Replace with homestead channel lookup
3. `src/bot/battle/conclude.ts` line 18 → Replace with homestead channel lookup
4. `src/bot/battle/challenge.ts` lines 97, 154 → Replace with homestead channel lookup
5. `src/bot/battle/actions.ts` lines 59, 66 → Replace with homestead channel lookup
6. `src/bot/wilds/controls.ts` line 88 → Replace with homestead channel lookup

**Test Files:**
- `tests/battle_results.spec.ts`
- `tests/battle_flow.spec.ts`
- `tests/battle/actions.interaction.spec.ts`

### New Structure
```
src/bot/homestead/
├── home.ts (migrated from dm/home.ts)
├── heal.ts (migrated from dm/heal.ts)
├── starters.ts (migrated from dm/starters.ts)
├── manager.ts (HomesteadChannelManager - already exists per arch doc)
└── ROUTER.md
```

---

## Phase 3: Bible Organization Audit

### Current State
```
docs/
├── architecture-bible/ (14 files, needs INDEX.md)
├── operations-bible/ (7 files, needs INDEX.md)
├── development-bible/ (7 files, needs INDEX.md)
└── [12 scattered root docs to consolidate]
```

### Target State
```
docs/
├── architecture-bible/
│   ├── INDEX.md (comprehensive ToC)
│   ├── 01-system-overview.md
│   ├── 02-database-architecture.md
│   ├── ...
│   ├── 14-private-channel-architecture.md
│   ├── 15-seamless-restart.md (NEW - consolidated)
│   └── 16-resource-limits.md (NEW - moved from root)
├── operations-bible/
│   ├── INDEX.md (comprehensive ToC)
│   ├── 01-service-matrix.md
│   ├── 02-database-operations.md
│   ├── 03-memory-management.md (CONSOLIDATED)
│   ├── ...
│   └── 08-logging.md (NEW)
├── development-bible/
│   ├── INDEX.md (comprehensive ToC)
│   ├── 01-local-setup.md
│   ├── ...
│   └── 07-profiling.md (NEW)
└── ROUTER.md (only meta file in root)
```

---

## Phase 4: Dead Code Audit

### Tools
- `ts-prune` output review
- `grep` for deprecated patterns:
  - `createDM()` calls (10 found, migration needed)
  - Old DM imports (`from "./dm/`)
  - Deprecated env vars (check config.ts)
  - Unused exports (ts-prune)

### Targets
1. **Unused Functions:** Review ts-prune-output.txt
2. **Deprecated Patterns:** DM flows, old cache patterns
3. **Redundant Modules:** Duplicate implementations
4. **Outdated Comments:** Remove migration markers after completion

---

## Phase 5: Folder Structure Simplification

### Review Areas
- `src/bot/` - Too many subdirectories? (arena, battle, daily, dm, ops, profile, wilds)
- `src/services/` - Logical grouping? Cache/database/lifecycle separation clear?
- `src/shared/` - Truly shared utilities vs feature-specific?
- `scripts/` - Archive old migration scripts?
- `tests/` - Mirror src/ structure?

### Simplification Criteria
1. **Depth:** Prefer flat over deep nesting (max 3 levels)
2. **Cohesion:** Group by feature/domain, not by type
3. **Clarity:** Folder name should match usage (no abstract names)
4. **Size:** 5-15 files per directory ideal (not 2, not 50)

---

## Success Criteria

- ✅ Zero docs in `docs/` root except INDEX.md + ROUTER.md
- ✅ All Bibles have comprehensive INDEX.md files
- ✅ Zero createDM() calls in src/ (except tests)
- ✅ src/bot/dm/ directory deleted
- ✅ src/bot/homestead/ fully functional
- ✅ ts-prune shows <10 unused exports
- ✅ Folder structure max 3 levels deep
- ✅ Every file/folder has clear, single purpose

---

## Execution Order

1. **Documentation Consolidation** (30 min) - Low risk, high clarity gain
2. **DM Code Migration** (60 min) - Medium risk, blocks cleanup
3. **Bible Organization** (45 min) - Low risk, navigation improvement
4. **Dead Code Removal** (60 min) - Medium risk, size reduction
5. **Folder Simplification** (90 min) - High risk, requires careful testing

**Total Estimated Time:** ~4-5 hours (aggressive mode)

---

**Status:** Phase 1 starting - Documentation consolidation
**Next:** Move 12 root docs to appropriate Bibles, create INDEX.md files
