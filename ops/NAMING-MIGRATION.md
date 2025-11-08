# Database Naming Migration — Systematic Checklist

**Status:** Active (2025-11-08)  
**Purpose:** Track systematic migration from old terminology (local/LOCAL/PRIMARY LOCAL/EXPERIMENTAL) to canonical naming schema (CLOUD-DEV-MASTER, CLOUD-PROD-RUNTIME, ONPREMISE-DEV-PRIMARY, ONPREMISE-DEV-EXPERIMENT).  
**Authority:** See `docs/database-naming-schema.md` for canonical definitions.

---

## Overview

This document provides a systematic checklist for migrating the entire codebase to use the canonical database naming schema. The migration touches 5 major categories:

1. **Code Files** — TypeScript/JavaScript source code
2. **Documentation** — Markdown docs and guides
3. **Scripts** — Automation and operational scripts
4. **Configuration** — Environment files and service configs
5. **Tests** — Test files and fixtures

---

## Search Patterns

### Old Terminology to Find

```bash
# Prisma client names
grep -r "localPrisma" --include="*.ts" --include="*.js"
grep -r "experimentPrisma" --include="*.ts" --include="*.js"

# Environment variables
grep -r "DATABASE_LOCAL_URL" --include="*.ts" --include="*.js" --include="*.md"
grep -r "DATABASE_EXPERIMENT_URL" --include="*.ts" --include="*.js" --include="*.md"
grep -r "DATABASE_LOCAL_PRIMARY" --include="*.ts" --include="*.js" --include="*.md"

# Prose references
grep -ri "local database" --include="*.md" --include="*.ts" --include="*.js"
grep -ri "PRIMARY LOCAL" --include="*.md" --include="*.ts" --include="*.js"
grep -ri "EXPERIMENTAL database" --include="*.md" --include="*.ts" --include="*.js"
grep -ri "LOCAL client" --include="*.md" --include="*.ts" --include="*.js"

# Script names
find scripts/ -name "*local*"
find scripts/ -name "*experiment*"

# Directory names
find Store/ -name "*db*" -type d
find Store/ -name "*local*" -type d
find Store/ -name "*experiment*" -type d

# CLI targets
grep -r "target local" --include="*.ts" --include="*.js" --include="*.md"
grep -r "target experiment" --include="*.ts" --include="*.js" --include="*.md"
grep -r "--target dev" --include="*.ts" --include="*.js" --include="*.md"
grep -r "--target prod" --include="*.ts" --include="*.js" --include="*.md"
```

### Replacement Rules

| Old Term | New Term | Context |
|----------|----------|---------|
| `localPrisma` | `onPremiseDevPrisma` | Prisma client for workstation development database |
| `experimentPrisma` | `onPremiseExperimentPrisma` | Prisma client for workstation testing database |
| `DATABASE_LOCAL_URL` | `DATABASE_ONPREMISE_DEV_PRIMARY` | Environment variable |
| `DATABASE_EXPERIMENT_URL` | `DATABASE_ONPREMISE_DEV_EXPERIMENT` | Environment variable |
| `DATABASE_LOCAL_PRIMARY` | `DATABASE_ONPREMISE_DEV_PRIMARY` | Environment variable |
| "local database" | "ONPREMISE-DEV-PRIMARY" or "ONPREMISE-DEV-EXPERIMENT" | Prose (context-dependent) |
| "LOCAL" | "ONPREMISE-DEV-PRIMARY" | Prose (context-dependent) |
| "PRIMARY LOCAL" | "ONPREMISE-DEV-PRIMARY" | Prose |
| "EXPERIMENTAL" | "ONPREMISE-DEV-EXPERIMENT" | Prose |
| "DEV database" | "CLOUD-DEV-MASTER" | Prose (context-dependent) |
| "PROD database" | "CLOUD-PROD-RUNTIME" | Prose (context-dependent) |
| `--target dev` | `--target cloud-dev` | CLI argument |
| `--target prod` | `--target cloud-prod` | CLI argument |
| `--target local` | `--target onpremise-dev` | CLI argument |
| `--target experiment` | `--target onpremise-experiment` | CLI argument |
| `Store/db/` | `Store/onpremise-dev-primary/` | Directory path |
| `Store/db-experiment/` | `Store/onpremise-dev-experiment/` | Directory path |

---

## Category 1: Code Files

### 1.1 Prisma Client Definitions

**File:** `src/shared/prisma.ts`

**Changes:**
- [ ] Rename `localPrisma` → `onPremiseDevPrisma`
- [ ] Rename `experimentPrisma` → `onPremiseExperimentPrisma`
- [ ] Update environment variable references:
  - `DATABASE_LOCAL_URL` → `DATABASE_ONPREMISE_DEV_PRIMARY`
  - `DATABASE_EXPERIMENT_URL` → `DATABASE_ONPREMISE_DEV_EXPERIMENT`
- [ ] Update `QuintupleDatabaseStats` type with new client names
- [ ] Update `getDatabaseStats()` function with new client names
- [ ] Update all JSDoc comments with canonical names
- [ ] Update export statements

**Verification:**
```bash
grep "localPrisma\|experimentPrisma\|DATABASE_LOCAL\|DATABASE_EXPERIMENT" src/shared/prisma.ts
# Should return zero matches
```

---

### 1.2 Configuration Module

**File:** `src/shared/config.ts`

**Changes:**
- [ ] Update `getDbUrl()` function to check new environment variables
- [ ] Add backward compatibility: if `DATABASE_LOCAL_URL` exists, log deprecation warning
- [ ] Update all comments referencing database names
- [ ] Update fallback logic and error messages

**Verification:**
```bash
grep "DATABASE_LOCAL\|DATABASE_EXPERIMENT" src/shared/config.ts
# Should only find deprecation warning comments
```

---

### 1.3 Database CLI Tool

**File:** `scripts/db_admin.ts`

**Changes:**
- [ ] Update `--target` flag options:
  - `dev` → `cloud-dev`
  - `prod` → `cloud-prod`
  - `local` → `onpremise-dev`
  - `experiment` → `onpremise-experiment`
- [ ] Update `resolveDatasource()` switch statement
- [ ] Update help text and usage examples
- [ ] Update status command output with new names
- [ ] Update counts command with new target names
- [ ] Update error messages and validation

**Verification:**
```bash
node --loader tsx scripts/db_admin.ts --help
# Should show cloud-dev, cloud-prod, onpremise-dev, onpremise-experiment
```

---

### 1.4 Database Replication Services

**Files:**
- `src/services/db-replication/version.ts`
- `src/services/db-replication/integrity.ts`
- `src/services/db-replication/sync.ts`

**Changes:**
- [ ] Update all comments referencing database names
- [ ] Update function parameter names (e.g., `localClient` → `onPremiseClient`)
- [ ] Update log messages with canonical names
- [ ] Update error messages

**Verification:**
```bash
grep -r "local.*database\|LOCAL" src/services/db-replication/
# Should return zero matches (except in string literals for backward compat)
```

---

### 1.5 Logger Module

**File:** `src/utils/logger.js`

**Changes:**
- [ ] Update `global.securityBotState` references if any mention database names
- [ ] Update database stats display with new client names
- [ ] Update telemetry labels

**Verification:**
```bash
grep "localPrisma\|experimentPrisma" src/utils/logger.js
# Should return zero matches
```

---

## Category 2: Documentation

### 2.1 AGENTS.md

**Changes:**
- [ ] Update "Database URL Selection" section with new names
- [ ] Update "Dual Database Connection Architecture" section
- [ ] Update "Local Database Access" → "On-Premise Database Access"
- [ ] Update all environment variable references
- [ ] Update all Prisma client references
- [ ] Update replication flow diagrams
- [ ] Add prominent link to `docs/database-naming-schema.md` at top of database sections
- [ ] Update "Dual Local Database Setup" → "Dual On-Premise Database Setup"

**Verification:**
```bash
grep -i "local database\|LOCAL.*database\|PRIMARY LOCAL\|EXPERIMENTAL database" AGENTS.md
# Should return zero matches (except when referring to canonical doc)
```

---

### 2.2 Database Documentation Files

**Files:**
- `docs/database-url-selection.md`
- `docs/database-configuration.md`
- `docs/database-systems.md`
- `docs/db-replication-architecture.md`
- `docs/dual-local-database-guide.md` → `docs/dual-onpremise-database-guide.md` (rename file)
- `docs/workstation-gameplay-setup.md`

**Changes:**
- [ ] Rename `dual-local-database-guide.md` → `dual-onpremise-database-guide.md`
- [ ] Update all references to `DATABASE_LOCAL_URL` → `DATABASE_ONPREMISE_DEV_PRIMARY`
- [ ] Update all references to `DATABASE_EXPERIMENT_URL` → `DATABASE_ONPREMISE_DEV_EXPERIMENT`
- [ ] Update all prose: "local database" → "ONPREMISE-DEV-PRIMARY" (context-dependent)
- [ ] Update architecture diagrams with new names
- [ ] Add reference to `docs/database-naming-schema.md` at top of each file
- [ ] Update all code examples with new client names

**Verification:**
```bash
grep -ri "DATABASE_LOCAL\|DATABASE_EXPERIMENT\|localPrisma\|experimentPrisma" docs/database-*.md docs/dual-*.md docs/workstation-*.md
# Should return zero matches
```

---

### 2.3 Operational Documentation

**Files:**
- `ops/DB_BOOTSTRAP.md`
- `ops/CRITICAL.md`
- `ops/KNOWLEDGE.yaml`

**Changes:**
- [ ] Update all database references in `DB_BOOTSTRAP.md`
- [ ] Update environment variable examples
- [ ] Update command examples with new target names
- [ ] Update any critical alerts/warnings with new names

**Verification:**
```bash
grep -ri "local database\|DATABASE_LOCAL\|DATABASE_EXPERIMENT" ops/
# Should return zero matches (except in NAMING-MIGRATION.md)
```

---

### 2.4 Router Documentation

**Files:**
- `ops/ROUTER.yaml`
- `ops/ROUTER_INDEX.yaml`
- `masterroutetable.md`
- `src/ROUTER.md`
- `scripts/ROUTER.md`
- `Store/ROUTER.md`

**Changes:**
- [ ] Update all database references in router manifests
- [ ] Update Store/ directory references:
  - `Store/db/` → `Store/onpremise-dev-primary/`
  - `Store/db-experiment/` → `Store/onpremise-dev-experiment/`
- [ ] Update script descriptions with new names

**Verification:**
```bash
grep -r "Store/db\b\|Store/db-experiment" --include="*ROUTER*"
# Should return zero matches
```

---

## Category 3: Scripts

### 3.1 Bootstrap Scripts

**Files to Rename:**
- `scripts/bootstrap_staging_db.ps1` → Keep (applies to CLOUD-DEV-MASTER)
- `scripts/ops/bootstrap_local_db.ps1` → `scripts/ops/bootstrap_onpremise_dev.ps1`
- `scripts/ops/bootstrap_experiment_db.ps1` → `scripts/ops/bootstrap_onpremise_experiment.ps1`
- `scripts/ops/auto_bootstrap_local_db.ps1` → `scripts/ops/auto_bootstrap_onpremise_dev.ps1`

**Changes:**
- [ ] Rename files as listed above
- [ ] Update all internal variable names (e.g., `$localDbPath` → `$onPremiseDbPath`)
- [ ] Update all output messages with new names
- [ ] Update Store/ directory paths:
  - `Store/db/` → `Store/onpremise-dev-primary/`
  - `Store/db-experiment/` → `Store/onpremise-dev-experiment/`
- [ ] Update file output paths (e.g., `local-url.txt` → `onpremise-dev-url.txt`)
- [ ] Update comments and help text

**Verification:**
```bash
grep -r "Store/db\b\|Store/db-experiment\|local.*database" scripts/ops/bootstrap_*.ps1
# Should return zero matches
```

---

### 3.2 Sync Scripts

**Files to Create:**
- `scripts/ops/pull_schema_to_cloud_prod.ts` (new)
- `scripts/ops/push_gameplay_to_cloud_dev.ts` (new)
- `scripts/ops/sync_daemon_cloud_prod.ts` (new)

**Files to Rename:**
- `scripts/ops/sync_experiment_db.ps1` → `scripts/ops/sync_onpremise_experiment.ps1`

**Changes:**
- [ ] Create bidirectional sync scripts for Cloud PROD
- [ ] Rename `sync_experiment_db.ps1` → `sync_onpremise_experiment.ps1`
- [ ] Update all internal references with new names
- [ ] Update log file paths to `Store/sync-logs/`

**Verification:**
```bash
ls scripts/ops/*local* scripts/ops/*experiment*
# Should only show onpremise_* scripts
```

---

### 3.3 Database Utility Scripts

**Files:**
- `scripts/db_mirror_checks.ts`
- `scripts/db_smoke.ts`
- `scripts/dev_prod_auto_sync.ts`

**Changes:**
- [ ] Update all database client references
- [ ] Update environment variable checks
- [ ] Update log messages with new names

**Verification:**
```bash
grep "localPrisma\|experimentPrisma\|DATABASE_LOCAL\|DATABASE_EXPERIMENT" scripts/db_*.ts scripts/dev_prod_*.ts
# Should return zero matches
```

---

### 3.4 Guard Scripts

**Files:**
- `scripts/guard_routing.sh`
- `scripts/guard_doc_names.sh`
- `scripts/guard_meta.sh`

**Changes:**
- [ ] Update any database name checks with new canonical names
- [ ] Add checks for deprecated terminology (optional)

**Verification:**
```bash
bash scripts/guard_routing.sh && bash scripts/guard_doc_names.sh && bash scripts/guard_meta.sh
# Should pass with zero violations
```

---

## Category 4: Configuration

### 4.1 Package.json

**File:** `package.json`

**Changes:**
- [ ] Rename npm scripts:
  - `ops:bootstrap-local-db` → `ops:bootstrap-onpremise-dev`
  - `ops:auto-bootstrap-local-db` → `ops:auto-bootstrap-onpremise-dev`
  - `ops:bootstrap-experiment-db` → `ops:bootstrap-onpremise-experiment`
  - `ops:sync-experiment-db` → `ops:sync-onpremise-experiment`
  - `ops:start-experiment-db` → `ops:start-onpremise-experiment`
  - `ops:stop-experiment-db` → `ops:stop-onpremise-experiment`
  - `ops:status-local-dbs` → `ops:status-onpremise-dbs`
- [ ] Add new scripts:
  - `ops:pull-schema-to-prod` (CLOUD-DEV-MASTER → CLOUD-PROD-RUNTIME)
  - `ops:push-gameplay-to-dev` (CLOUD-PROD-RUNTIME → CLOUD-DEV-MASTER)
  - `ops:sync-daemon-cloud-prod` (continuous gameplay push)
- [ ] Update all script descriptions with new names

**Verification:**
```bash
npm run | grep -E "local|experiment"
# Should only show onpremise-* scripts
```

---

### 4.2 Environment Examples

**Files:**
- `.env.example` (if exists)
- `secrets/Infinity-Gauntlet.env.example` (if exists)

**Changes:**
- [ ] Create `.env.example` with new environment variable names
- [ ] Add comments explaining CLOUD vs ONPREMISE distinction
- [ ] Include deprecation notices for old variable names

**Example:**
```bash
# CLOUD Databases (Render Production)
DEV_DATABASE_URL=postgresql://...  # CLOUD-DEV-MASTER
PROD_DATABASE_URL=postgresql://... # CLOUD-PROD-RUNTIME

# ONPREMISE Databases (Development Only)
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_dev
DATABASE_ONPREMISE_DEV_EXPERIMENT=postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment

# DEPRECATED (backward compatibility only)
# DATABASE_LOCAL_URL=...  # Use DATABASE_ONPREMISE_DEV_PRIMARY
# DATABASE_EXPERIMENT_URL=...  # Use DATABASE_ONPREMISE_DEV_EXPERIMENT
```

---

### 4.3 Render Configuration

**File:** `render.yaml`

**Changes:**
- [ ] Update comments referencing databases with new names
- [ ] Update any environment variable references (if applicable)
- [ ] Update service descriptions

**Verification:**
```bash
grep -i "local database\|experiment database" render.yaml
# Should return zero matches
```

---

## Category 5: Tests

### 5.1 Test Files

**Files:**
- `tests/db-replication/*.test.ts`
- `tests/ops/*.test.ts`
- `tests/cache/*.test.ts`

**Changes:**
- [ ] Update all Prisma client references:
  - `localPrisma` → `onPremiseDevPrisma`
  - `experimentPrisma` → `onPremiseExperimentPrisma`
- [ ] Update test descriptions with new names
- [ ] Update mock data and fixtures
- [ ] Update comments

**Verification:**
```bash
grep -r "localPrisma\|experimentPrisma\|DATABASE_LOCAL\|DATABASE_EXPERIMENT" tests/
# Should return zero matches
```

---

### 5.2 Test Configuration

**File:** `vitest.config.ts`

**Changes:**
- [ ] Update any environment variable references
- [ ] Update test setup with new names

**Verification:**
```bash
npm test
# Should pass all tests with zero failures
```

---

## Category 6: Directory Structure

### 6.1 Store Directory

**Changes:**
- [ ] Rename `Store/db/` → `Store/onpremise-dev-primary/`
- [ ] Rename `Store/db-experiment/` → `Store/onpremise-dev-experiment/`
- [ ] Update `Store/ROUTER.md` with new paths
- [ ] Update any symlinks or references

**Migration Commands:**
```bash
# Backup existing directories
mv Store/db Store/db.backup
mv Store/db-experiment Store/db-experiment.backup

# Wait for bootstrap scripts to create new structure
npm run ops:bootstrap-onpremise-dev
npm run ops:bootstrap-onpremise-experiment

# Verify new structure
ls -la Store/onpremise-dev-primary/
ls -la Store/onpremise-dev-experiment/

# Remove backups after verification
rm -rf Store/db.backup Store/db-experiment.backup
```

**Verification:**
```bash
ls -la Store/ | grep -E "^d.*\bdb\b|db-experiment"
# Should return zero matches
```

---

## Verification Checklist

### Pre-Migration

- [ ] Run full test suite: `npm test` (baseline)
- [ ] Run all guard scripts: `npm run guard:all`
- [ ] Document current state in `ops/terminology-audit.txt`

### During Migration

- [ ] Complete Category 1 (Code Files)
- [ ] Run tests after each major file change
- [ ] Complete Category 2 (Documentation)
- [ ] Complete Category 3 (Scripts)
- [ ] Complete Category 4 (Configuration)
- [ ] Complete Category 5 (Tests)
- [ ] Complete Category 6 (Directory Structure)

### Post-Migration

- [ ] Run full test suite: `npm test` (should still pass)
- [ ] Run all guard scripts: `npm run guard:all` (should pass)
- [ ] Test database CLI with new targets:
  ```bash
  npm run db:cli -- status --target cloud-dev
  npm run db:cli -- status --target cloud-prod
  npm run db:cli -- status --target onpremise-dev
  npm run db:cli -- status --target onpremise-experiment
  ```
- [ ] Test bootstrap scripts:
  ```bash
  npm run ops:bootstrap-onpremise-dev
  npm run ops:bootstrap-onpremise-experiment
  ```
- [ ] Search for remaining old terminology:
  ```bash
  grep -ri "DATABASE_LOCAL\|DATABASE_EXPERIMENT\|localPrisma\|experimentPrisma" \
    --include="*.ts" --include="*.js" --include="*.md" \
    --exclude-dir=node_modules --exclude-dir=.git
  # Should only find matches in NAMING-MIGRATION.md and database-naming-schema.md
  ```
- [ ] Update `Patch.md` with new Absolute
- [ ] Create `ops/NAMING-MIGRATION-REPORT.md`
- [ ] Commit all changes
- [ ] Update `Prompt.md` Last Repo Changes

---

## Breaking Changes

**For AI Agents:**
- ALL database operations must now use canonical names from `docs/database-naming-schema.md`
- Prisma clients renamed: `localPrisma` → `onPremiseDevPrisma`, `experimentPrisma` → `onPremiseExperimentPrisma`
- Environment variables renamed: `DATABASE_LOCAL_*` → `DATABASE_ONPREMISE_DEV_*`
- CLI targets renamed: `--target local` → `--target onpremise-dev`
- npm scripts renamed: `ops:*-local-*` → `ops:*-onpremise-*`

**For Human Operators:**
- Update local environment files with new variable names
- Update any scripts or aliases referencing old names
- Bookmark `docs/database-naming-schema.md` for reference

---

## Rollback Plan

If migration causes critical failures:

1. **Restore code from git:**
   ```bash
   git reset --hard HEAD~1
   ```

2. **Restore Store directories:**
   ```bash
   mv Store/onpremise-dev-primary Store/db
   mv Store/onpremise-dev-experiment Store/db-experiment
   ```

3. **Restore environment variables:**
   - Revert to `DATABASE_LOCAL_URL` and `DATABASE_EXPERIMENT_URL`

4. **Document rollback reason in `ops/NAMING-MIGRATION-REPORT.md`**

---

## Timeline

**Estimated Duration:** 4-6 hours for complete migration

**Phase 1 (1-2 hours):** Category 1 (Code Files)  
**Phase 2 (1-2 hours):** Category 2-3 (Documentation + Scripts)  
**Phase 3 (1 hour):** Category 4-5 (Configuration + Tests)  
**Phase 4 (1 hour):** Category 6 (Directory Structure) + Verification  

---

**Last Updated:** 2025-11-08  
**Status:** Active — Follow this checklist systematically to ensure complete migration.
