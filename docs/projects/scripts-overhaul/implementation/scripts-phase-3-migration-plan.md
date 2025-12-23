# Scripts Directory Phase 3 Migration Plan

**Lead Architecture Specialist Report**  
**Date:** 2025-12-22  
**Status:** ACTIONABLE

---

## Executive Summary

The Scripts Overhaul project (Phases 1-2) successfully created 8 domain-specific CLI subdirectories. However, **47 scripts remain at root level** and several structural inconsistencies exist:

| Issue | Count | Priority |
|-------|-------|----------|
| Root-level orphan scripts | 47 | HIGH |
| Duplicate files | 3 pairs | HIGH |
| Conflicting directories (`guard/` vs `guards/`) | 2 | HIGH |
| Undocumented directories | 4 | MEDIUM |
| Dead migration scripts | 2 | LOW |

---

## Current Directory Structure Analysis

### ✅ Well-Organized Domains (Keep As-Is)

| Domain | Files | Has ROUTER.md | CLI Entry |
|--------|-------|---------------|-----------|
| `lib/` | 9 | ✅ | — (library) |
| `render/` | 2 | ✅ | cli.ts |
| `observe/` | 2 | ✅ | logs.ts |
| `db/` | 2 | ✅ | cli.ts |
| `diagnose/` | 2 | ✅ | cli.ts |
| `guard/` | 2 | ✅ | cli.ts |
| `docker/` | 2 | ✅ | cli.ts |
| `data/` | 2 | ✅ | cli.ts |
| `ops/` | 14 | ✅ | cli.ts |
| `archive/` | 4 subdirs | — | — |

### ⚠️ Problematic Directories

| Directory | Files | Issue |
|-----------|-------|-------|
| `guards/` | 4 | **Conflicts with** `guard/` - should consolidate |
| `devops/` | 7 | Missing ROUTER.md, overlaps with `ops/` |
| `dex/` | 4 | Missing ROUTER.md link in parent |
| `security/` | 3 | Missing ROUTER.md link in parent |
| `shared/` | 1 | Only 1 file - should merge into `lib/` |
| `sql/` | 1 | Only 1 file - should merge into `db/` |

---

## Phase 3 Migration Plan

### 1. DUPLICATES TO DELETE (Immediate)

| Keep | Delete | Reason |
|------|--------|--------|
| `build_dexpack.ts` | — | Used by `data:dexpack:v1` - generates v1 JSON |
| `build-dexpack.ts` | — | Used by `data:dexpack:v2` - generates v2 binary |

**Note:** These are NOT duplicates! They serve different purposes:
- `build_dexpack.ts` → v1 format (JSON + gzip)
- `build-dexpack.ts` → v2 format (binary sections)

Both are needed. No deletion required.

### 2. CONSOLIDATE GUARD DIRECTORIES

**Action:** Merge `guards/` INTO `guard/`

```
guards/ → DELETE after migration
├── guard_auto_sync.sh    → guard/guard_auto_sync.sh
├── guard_dexpack.sh      → guard/guard_dexpack.sh
├── require-ensure-db-preload.mjs → guard/require-ensure-db-preload.mjs
└── ROUTER.md             → Merge content into guard/ROUTER.md
```

**package.json updates:**
```diff
- "guard:auto-sync": "bash scripts/guards/guard_auto_sync.sh",
+ "guard:auto-sync": "bash scripts/guard/guard_auto_sync.sh",
- "guard:dexpack": "bash scripts/guards/guard_dexpack.sh",
+ "guard:dexpack": "bash scripts/guard/guard_dexpack.sh",
```

### 3. ROOT-LEVEL SCRIPTS → DOMAIN MAPPING

#### A. Guard Scripts → `guard/`

| Script | Action |
|--------|--------|
| `guard_accelerate.sh` | MOVE to `guard/accelerate.sh` |
| `guard_db_docs.mjs` | MOVE to `guard/db-docs.mjs` |
| `guard_db_migrations.mjs` | MOVE to `guard/db-migrations.mjs` |
| `guard_render.mjs` | MOVE to `guard/render.mjs` |
| `verify_router_links.sh` | MOVE to `guard/router-links.sh` |
| `verify_store_protection.sh` | MOVE to `guard/store-protection.sh` |
| `pre-commit-store-guard.sh` | MOVE to `guard/pre-commit-store.sh` |
| `pre-commit-metrics.mjs` | MOVE to `guard/pre-commit-metrics.mjs` |

#### B. Data Pipeline Scripts → `data/`

| Script | Action |
|--------|--------|
| `build-data.ts` | MOVE to `data/build-data.ts` |
| `build-assets-manifest.ts` | MOVE to `data/build-assets-manifest.ts` |
| `ensure-data.ts` | MOVE to `data/ensure-data.ts` |
| `fetch_pokemon.mjs` | MOVE to `data/fetch-pokemon.mjs` |
| `cache_client.mjs` | MOVE to `data/cache-client.mjs` |
| `refresh_cache.mjs` | MOVE to `data/refresh-cache.mjs` |
| `refresh_cache_gh_only.mjs` | MOVE to `data/refresh-cache-gh.mjs` |
| `pull-snapshot.mjs` | MOVE to `data/pull-snapshot.mjs` |
| `replicate_to_repo_api.mjs` | MOVE to `data/replicate-to-repo.mjs` |
| `build_dexpack.ts` | MOVE to `data/build-dexpack-v1.ts` |
| `build-dexpack.ts` | MOVE to `data/build-dexpack-v2.ts` |

#### C. Database Scripts → `db/`

| Script | Action |
|--------|--------|
| `db_admin.ts` | KEEP (already documented, used by `db:cli`) |
| `seed_dex.ts` | MOVE to `db/seed-dex.ts` |
| `validate_database_urls.ts` | MOVE to `db/validate-urls.ts` |
| `generate_pg_types.ts` | MOVE to `db/generate-types.ts` |
| `check_prisma_findmany.ts` | MOVE to `db/check-findmany.ts` |
| `dev_prod_auto_sync.ts` | MOVE to `db/auto-sync.ts` |

**Also merge:**
- `shared/database-url.ts` → `lib/database-url.ts`
- `sql/timescaledb-optimization.sql` → `db/sql/timescaledb-optimization.sql`

#### D. DevOps Scripts → SPLIT

The `devops/` directory contains TimescaleDB-specific scripts. Decision:

| Script | Destination | Reason |
|--------|-------------|--------|
| `backup-database.ps1` | `db/backup.ps1` | Database backup |
| `backup-database.sh` | `db/backup.sh` | Database backup |
| `test-restore.ps1` | `db/test-restore.ps1` | Database restore |
| `test-restore.sh` | `db/test-restore.sh` | Database restore |
| `deploy-*.sql` | `db/sql/` | SQL scripts |

**DELETE `devops/` directory after migration.**

#### E. Ops Scripts → `ops/`

| Script | Action |
|--------|--------|
| `archive_task_history.mjs` | MOVE to `ops/archive-tasks.mjs` |
| `update_change_ledger.mjs` | MOVE to `ops/update-ledger.mjs` |
| `update_change_ledger.sh` | MOVE to `ops/update-ledger.sh` |
| `update_change_ledger_unix.sh` | DELETE (duplicate of .sh) |
| `update_router_index.sh` | MOVE to `ops/update-routers.sh` |
| `refresh_vision.sh` | MOVE to `ops/refresh-vision.sh` |
| `hotfix_entry.sh` | MOVE to `ops/hotfix-entry.sh` |
| `setup-git-hooks.mjs` | MOVE to `ops/setup-git-hooks.mjs` |

#### F. Dex Scripts → Keep `dex/` (Merge into `data/`)

The `dex/` directory has specialized seeding scripts. Decision:

| Script | Destination |
|--------|-------------|
| `dex/backfill_species.ts` | `data/dex/backfill-species.ts` |
| `dex/seed_reference.ts` | `data/dex/seed-reference.ts` |
| `dex/warm_cache.ts` | `data/dex/warm-cache.ts` |

**DELETE `dex/` directory after migration.**

#### G. Security Scripts → Keep `security/`

Security scripts are legitimately separate. Just add to ROUTER.md:

| Script | Action |
|--------|--------|
| `security/migrate-security-state.ts` | KEEP |
| `security/rollback-security-migration.ts` | KEEP |
| `security/ROUTER.md` | KEEP |

**Add link to parent ROUTER.md.**

#### H. Discord Bot Scripts → NEW `bot/` directory

| Script | Action |
|--------|--------|
| `register-commands.ts` | MOVE to `bot/register-commands.ts` |
| `preflight.ts` | MOVE to `bot/preflight.ts` |
| `start_bot.sh` | MOVE to `bot/start.sh` |
| `worker.mjs` | MOVE to `bot/worker.mjs` |

#### I. Monitoring Scripts → NEW `monitor/` directory

| Script | Action |
|--------|--------|
| `measure_memory.mjs` | MOVE to `monitor/memory.mjs` |
| `measure_startup_time.mjs` | MOVE to `monitor/startup-time.mjs` |
| `memory_snapshot.mjs` | MOVE to `monitor/memory-snapshot.mjs` |
| `monitor_directory_growth.ps1` | MOVE to `monitor/directory-growth.ps1` |
| `monitor_memory_24h.ps1` | MOVE to `monitor/memory-24h.ps1` |
| `monitor_memory_enhanced.ps1` | MOVE to `monitor/memory-enhanced.ps1` |
| `verify-metrics-accuracy.mjs` | MOVE to `monitor/verify-metrics.mjs` |
| `ci-verify-metrics.sh` | MOVE to `monitor/ci-verify-metrics.sh` |

#### J. Development Tools → NEW `dev/` directory

| Script | Action |
|--------|--------|
| `check-dead-code.ts` | MOVE to `dev/dead-code.ts` |
| `generate-dependency-graph.ts` | MOVE to `dev/dependency-graph.ts` |
| `demo-infinity-console.ts` | MOVE to `dev/demo-console.ts` |

#### K. Migration Scripts → `archive/`

These are one-time migration scripts that should be archived:

| Script | Action |
|--------|--------|
| `migrate-deprecated-log.ts` | ARCHIVE to `archive/log-migration/` |
| `migrate-log-to-getLogger.ts` | ARCHIVE to `archive/log-migration/` |

#### L. Environment Scripts → `ops/`

| Script | Action |
|--------|--------|
| `setup_ai_env.ps1` | MOVE to `ops/setup-ai-env.ps1` |

#### M. Build Scripts → Keep at root (special case)

| Script | Action | Reason |
|--------|--------|--------|
| `build_typescript.sh` | KEEP at root | Called by npm build |

---

### 4. DIRECTORIES TO DELETE (After Migration)

| Directory | Reason |
|-----------|--------|
| `guards/` | Merged into `guard/` |
| `devops/` | Merged into `db/` |
| `dex/` | Merged into `data/dex/` |
| `shared/` | Single file moved to `lib/` |
| `sql/` | Single file moved to `db/sql/` |

---

### 5. NEW DIRECTORIES TO CREATE

| Directory | Purpose | CLI |
|-----------|---------|-----|
| `bot/` | Discord bot operations | No (simple scripts) |
| `monitor/` | Performance monitoring | Potential future CLI |
| `dev/` | Developer tools | Potential future CLI |
| `data/dex/` | Dex-specific data scripts | Via data CLI |
| `db/sql/` | SQL script storage | No |

---

## Package.json Script Updates

```diff
  "scripts": {
    "---BUILD---": "...",
-   "validate:urls": "tsx scripts/validate_database_urls.ts",
+   "validate:urls": "tsx scripts/db/validate-urls.ts",
-   "generate:types": "tsx scripts/generate_pg_types.ts",
+   "generate:types": "tsx scripts/db/generate-types.ts",
-   "data:dexpack:v1": "tsx scripts/build_dexpack.ts",
+   "data:dexpack:v1": "tsx scripts/data/build-dexpack-v1.ts",
-   "data:dexpack:v2": "tsx scripts/build-dexpack.ts",
+   "data:dexpack:v2": "tsx scripts/data/build-dexpack-v2.ts",
-   "docs:update-ledger": "node scripts/update_change_ledger.mjs",
+   "docs:update-ledger": "node scripts/ops/update-ledger.mjs",
-   "docs:update-routers": "bash scripts/update_router_index.sh",
+   "docs:update-routers": "bash scripts/ops/update-routers.sh",
-   "refresh:vision": "bash scripts/refresh_vision.sh",
+   "refresh:vision": "bash scripts/ops/refresh-vision.sh",
-   "tasks:archive": "node scripts/archive_task_history.mjs",
+   "tasks:archive": "node scripts/ops/archive-tasks.mjs",
-   "db:seed:dex": "tsx scripts/seed_dex.ts",
+   "db:seed:dex": "tsx scripts/db/seed-dex.ts",
-   "db:auto-sync": "tsx scripts/dev_prod_auto_sync.ts",
+   "db:auto-sync": "tsx scripts/db/auto-sync.ts",
-   "register:commands": "tsx scripts/register-commands.ts",
+   "register:commands": "tsx scripts/bot/register-commands.ts",
-   "hotfix": "bash scripts/hotfix_entry.sh",
+   "hotfix": "bash scripts/ops/hotfix-entry.sh",
-   "guard:auto-sync": "bash scripts/guards/guard_auto_sync.sh",
+   "guard:auto-sync": "bash scripts/guard/auto-sync.sh",
-   "guard:dexpack": "bash scripts/guards/guard_dexpack.sh",
+   "guard:dexpack": "bash scripts/guard/dexpack.sh",
-   "measure:startup": "node scripts/measure_startup_time.mjs",
+   "measure:startup": "node scripts/monitor/startup-time.mjs",
-   "measure:memory": "node --expose-gc scripts/measure_memory.mjs",
+   "measure:memory": "node --expose-gc scripts/monitor/memory.mjs",
-   "monitor:memory": "powershell ... scripts/monitor_memory_enhanced.ps1",
+   "monitor:memory": "powershell ... scripts/monitor/memory-enhanced.ps1",
-   "monitor:memory:24h": "powershell ... scripts/monitor_memory_24h.ps1",
+   "monitor:memory:24h": "powershell ... scripts/monitor/memory-24h.ps1",
-   "verify:metrics": "node scripts/verify-metrics-accuracy.mjs --all",
+   "verify:metrics": "node scripts/monitor/verify-metrics.mjs --all",
-   "setup:git-hooks": "node scripts/setup-git-hooks.mjs",
+   "setup:git-hooks": "node scripts/ops/setup-git-hooks.mjs",
-   "check:dead-code": "tsx scripts/check-dead-code.ts",
+   "check:dead-code": "tsx scripts/dev/dead-code.ts",
-   "deps:graph": "tsx scripts/generate-dependency-graph.ts",
+   "deps:graph": "tsx scripts/dev/dependency-graph.ts",
-   "guard:store": "bash scripts/verify_store_protection.sh",
+   "guard:store": "bash scripts/guard/store-protection.sh",
-   "guard:pre-commit": "bash scripts/pre-commit-store-guard.sh",
+   "guard:pre-commit": "bash scripts/guard/pre-commit-store.sh",
  }
```

---

## Final Directory Structure

```
scripts/
├── lib/                    # Foundation library (NO CHANGE)
│   ├── cli.ts
│   ├── env.ts
│   ├── errors.ts
│   ├── exec.ts
│   ├── fs.ts
│   ├── index.ts
│   ├── output.ts
│   ├── progress.ts
│   ├── ssh.ts
│   ├── database-url.ts     # NEW (from shared/)
│   └── ROUTER.md
├── render/                 # Render operations (NO CHANGE)
│   ├── cli.ts
│   └── ROUTER.md
├── observe/                # Loki observation (NO CHANGE)
│   ├── logs.ts
│   └── ROUTER.md
├── db/                     # Database operations (EXPANDED)
│   ├── cli.ts
│   ├── seed-dex.ts         # NEW
│   ├── validate-urls.ts    # NEW
│   ├── generate-types.ts   # NEW
│   ├── check-findmany.ts   # NEW
│   ├── auto-sync.ts        # NEW
│   ├── backup.ps1          # NEW (from devops/)
│   ├── backup.sh           # NEW (from devops/)
│   ├── test-restore.ps1    # NEW (from devops/)
│   ├── test-restore.sh     # NEW (from devops/)
│   ├── sql/                # NEW
│   │   ├── timescaledb-optimization.sql
│   │   ├── deploy-continuous-aggregates.sql
│   │   ├── deploy-hypertables.sql
│   │   └── deploy-materialized-views.sql
│   └── ROUTER.md
├── diagnose/               # Emergency diagnostics (NO CHANGE)
│   ├── cli.ts
│   └── ROUTER.md
├── guard/                  # CI guards (EXPANDED)
│   ├── cli.ts
│   ├── accelerate.sh       # NEW
│   ├── db-docs.mjs         # NEW
│   ├── db-migrations.mjs   # NEW
│   ├── render.mjs          # NEW
│   ├── router-links.sh     # NEW
│   ├── store-protection.sh # NEW
│   ├── pre-commit-store.sh # NEW
│   ├── pre-commit-metrics.mjs # NEW
│   ├── auto-sync.sh        # NEW (from guards/)
│   ├── dexpack.sh          # NEW (from guards/)
│   ├── require-ensure-db-preload.mjs # NEW (from guards/)
│   └── ROUTER.md
├── docker/                 # Container management (NO CHANGE)
│   ├── cli.ts
│   └── ROUTER.md
├── data/                   # Data pipeline (EXPANDED)
│   ├── cli.ts
│   ├── build-data.ts       # NEW
│   ├── build-assets-manifest.ts # NEW
│   ├── build-dexpack-v1.ts # NEW
│   ├── build-dexpack-v2.ts # NEW
│   ├── ensure-data.ts      # NEW
│   ├── fetch-pokemon.mjs   # NEW
│   ├── cache-client.mjs    # NEW
│   ├── refresh-cache.mjs   # NEW
│   ├── refresh-cache-gh.mjs # NEW
│   ├── pull-snapshot.mjs   # NEW
│   ├── replicate-to-repo.mjs # NEW
│   ├── dex/                # NEW (from dex/)
│   │   ├── backfill-species.ts
│   │   ├── seed-reference.ts
│   │   └── warm-cache.ts
│   └── ROUTER.md
├── ops/                    # Operations (EXPANDED)
│   ├── cli.ts
│   ├── archive-tasks.mjs   # NEW
│   ├── update-ledger.mjs   # NEW
│   ├── update-ledger.sh    # NEW
│   ├── update-routers.sh   # NEW
│   ├── refresh-vision.sh   # NEW
│   ├── hotfix-entry.sh     # NEW
│   ├── setup-git-hooks.mjs # NEW
│   ├── setup-ai-env.ps1    # NEW
│   ├── [existing ops/ files...]
│   └── ROUTER.md
├── bot/                    # NEW: Discord bot operations
│   ├── register-commands.ts
│   ├── preflight.ts
│   ├── start.sh
│   ├── worker.mjs
│   └── ROUTER.md
├── monitor/                # NEW: Performance monitoring
│   ├── memory.mjs
│   ├── startup-time.mjs
│   ├── memory-snapshot.mjs
│   ├── directory-growth.ps1
│   ├── memory-24h.ps1
│   ├── memory-enhanced.ps1
│   ├── verify-metrics.mjs
│   ├── ci-verify-metrics.sh
│   └── ROUTER.md
├── dev/                    # NEW: Developer tools
│   ├── dead-code.ts
│   ├── dependency-graph.ts
│   ├── demo-console.ts
│   └── ROUTER.md
├── security/               # Security operations (ADD TO ROUTER)
│   ├── migrate-security-state.ts
│   ├── rollback-security-migration.ts
│   └── ROUTER.md
├── archive/                # Archived scripts (EXPANDED)
│   ├── log-migration/      # NEW
│   │   ├── migrate-deprecated-log.ts
│   │   └── migrate-log-to-getLogger.ts
│   ├── bootstrap/
│   ├── loki-setup/
│   ├── one-time-migrations/
│   └── render-api-deprecated/
├── db_admin.ts             # KEEP (documented legacy CLI)
├── build_typescript.sh     # KEEP (build system root)
└── ROUTER.md               # UPDATE
```

---

## Implementation Checklist

### Phase 3.1: Consolidate Guard Directories
- [ ] Move `guards/*` → `guard/`
- [ ] Update `guard/ROUTER.md` with merged content
- [ ] Update `package.json` guard scripts
- [ ] Delete `guards/` directory

### Phase 3.2: Create New Directories
- [ ] Create `bot/`, `monitor/`, `dev/`
- [ ] Create `data/dex/`, `db/sql/`
- [ ] Create ROUTER.md for each new directory

### Phase 3.3: Move Root Scripts
- [ ] Move guard scripts to `guard/`
- [ ] Move data scripts to `data/`
- [ ] Move database scripts to `db/`
- [ ] Move ops scripts to `ops/`
- [ ] Move bot scripts to `bot/`
- [ ] Move monitor scripts to `monitor/`
- [ ] Move dev scripts to `dev/`

### Phase 3.4: Merge Small Directories
- [ ] Move `shared/database-url.ts` → `lib/`
- [ ] Move `sql/*` → `db/sql/`
- [ ] Move `dex/*` → `data/dex/`
- [ ] Move `devops/*` → `db/`
- [ ] Delete empty directories

### Phase 3.5: Archive Migration Scripts
- [ ] Create `archive/log-migration/`
- [ ] Move migration scripts to archive
- [ ] Add deprecation note

### Phase 3.6: Update References
- [ ] Update `package.json` scripts
- [ ] Update `scripts/ROUTER.md`
- [ ] Update any import paths in source files
- [ ] Run tests to verify

### Phase 3.7: Documentation
- [ ] Update `scripts/ROUTER.md` with final structure
- [ ] Add missing ROUTER.md links (security/)
- [ ] Update project README if needed

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking npm scripts | Run full test suite after each phase |
| Import path changes | Use grep to find all imports |
| CI pipeline breaks | Test guards locally first |
| Git history fragmentation | Use `git mv` for moves |

---

## Success Criteria

1. ✅ Zero scripts at root level (except `build_typescript.sh`, `db_admin.ts`)
2. ✅ All scripts in domain-appropriate directories
3. ✅ All directories have ROUTER.md
4. ✅ All npm scripts functional
5. ✅ `npm test` passes
6. ✅ CI guards pass

---

**Estimated Effort:** 4-6 hours  
**Priority:** HIGH (blocks further organizational work)  
**Dependencies:** None (standalone refactor)
