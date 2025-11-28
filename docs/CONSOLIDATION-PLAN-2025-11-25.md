# Repository Re-Consolidation Plan
**Date:** 2025-11-25  
**Last Updated:** 2025-11-28  
**Goal:** Simplify repository to human-logical organization, remove deprecated code, consolidate documentation to Bibles

---

## Phase 0: PostgreSQL 18 Upgrade (INFRASTRUCTURE PREREQUISITE)

**Status:** ✅ COMPLETE (2025-11-28)  
**Priority:** HIGH (infrastructure modernization)  
**Time:** 70 minutes (5-10 min downtime)  
**Full Plan:** `docs/POSTGRESQL-18-UPGRADE-PLAN.md`  
**Quick Ref:** `docs/POSTGRESQL-18-QUICK-REF.md`

### Completion Summary (2025-11-28)

✅ **Phase 1 Complete: PostgreSQL 18 Tooling Installed**
- PostgreSQL 18.1-1 installed via winget
- tools/pgsql17 backed up to tools/pgsql17-backup
- Scripts updated (bootstrap, sync, ensure_postgres_bundle)
- PostgreSQL 18 binaries verified at C:/Program Files/PostgreSQL/18/bin

✅ **Phase 2 Complete: ONPREMISE-DEV-PRIMARY Upgraded**
- Old PostgreSQL 17 database backed up
- Fresh bootstrap completed with PostgreSQL 18.1
- Version verified: PostgreSQL 18.1 on x86_64-windows
- Data integrity confirmed: 1025 species, 0 users (expected)
- Running on port 55433 (localhost)

✅ **Phase 3 Complete: Render Database Upgrade**
- Pre-upgrade backup created: prod-pre-pg18-2025-11-28-174712.dump (0.89 MB)
- Upgraded via Render Dashboard: PostgreSQL 17.7 → 18.1
- Version verified: PostgreSQL 18.1 (Debian 18.1-1.pgdg12+2)
- Data integrity confirmed: 1025 species (matches pre-upgrade)
- Downtime: ~8 minutes

✅ **Phase 4 Complete: Documentation Updates**
- All version references updated to PostgreSQL 18

### Overview

Upgrade all databases from PostgreSQL 17 → 18 to leverage:
- Improved query planner (faster dex queries)
- Better parallel query performance (analytics)
- Enhanced VACUUM efficiency (maintenance)
- Faster B-tree index scans (Species/Move lookups)

### Scope

1. **Render Production:** infinity-gauntlet-db (Render Dashboard upgrade)
2. **Workstation:** ONPREMISE-DEV-PRIMARY (fresh bootstrap)
3. **Testing:** ONPREMISE-DEV-EXPERIMENT (fresh bootstrap)
4. **Tooling:** tools/pgsql17 → tools/pgsql18
5. **Scripts:** Update bootstrap/backup scripts
6. **Docs:** Update version references

### Quick Steps

```powershell
# 1. Backup everything
npm run ops:dex-v2-backup -- --env-file secrets/Infinity-Gauntlet.env --label prod-pre-pg18 --output-dir backups/migration-checkpoints

# 2. Install PostgreSQL 18
winget install --id PostgreSQL.PostgreSQL --version 18.0

# 3. Upgrade local databases
rm -r -force Store/onpremise-dev-primary
npm run ops:bootstrap-onpremise-dev

# 4. Upgrade Render DB via dashboard
# https://dashboard.render.com/d/infinity-gauntlet-db → Settings → Upgrade to PostgreSQL 18

# 5. Update scripts and docs
# See POSTGRESQL-18-UPGRADE-PLAN.md for details
```

### Success Criteria

- ✅ All databases show PostgreSQL 18.0
- ✅ Data integrity verified (counts match)
- ✅ Services healthy after restart
- ✅ Scripts updated (pgsql17 → pgsql18)
- ✅ Documentation updated

**Note:** This phase should be completed BEFORE homestead implementation to ensure infrastructure stability.

---

## Phase 1: Documentation Consolidation

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

1. **PostgreSQL 18 Upgrade** (70 min) - Infrastructure prerequisite, minimal risk
2. **Documentation Consolidation** (30 min) - Low risk, high clarity gain
3. **DM Code Migration** (4-6 hours) - Medium risk, blocks cleanup
4. **Bible Organization** (45 min) - Low risk, navigation improvement
5. **Dead Code Removal** (60 min) - Medium risk, size reduction
6. **Folder Simplification** (90 min) - High risk, requires careful testing

**Total Estimated Time:** ~8-10 hours (including PostgreSQL upgrade)

---

**Status:** Phase 0 ready - PostgreSQL 18 upgrade prerequisites documented  
**Next:** Execute Phase 0 (infrastructure upgrade), then continue with documentation consolidation

