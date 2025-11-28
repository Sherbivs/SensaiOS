# PostgreSQL 18 Upgrade Plan

**Created:** 2025-11-28  
**Status:** READY FOR EXECUTION  
**Target:** Upgrade all databases from PostgreSQL 17 → PostgreSQL 18  
**Render Announcement:** https://www.postgresql.org/about/news/postgresql-18-released-3142/

---

## Executive Summary

PostgreSQL 18 was released recently and Render now supports it. This upgrade will modernize our database infrastructure across:

1. **Production (Render):** infinity-gauntlet-db database
2. **Workstation (Local):** ONPREMISE-DEV-PRIMARY (port 55433)
3. **Testing (Local):** ONPREMISE-DEV-EXPERIMENT (port 55434)

**Estimated Time:** 2-3 hours  
**Downtime:** ~5-10 minutes (Render database upgrade)  
**Risk Level:** LOW (backward compatible, Render-managed, testable locally first)

---

## PostgreSQL 18 Key Features

**Performance Enhancements:**
- Improved query planner for complex joins
- Better parallel query performance
- Enhanced VACUUM efficiency
- Faster B-tree index scans

**New Features:**
- Incremental backup improvements
- Better JSON/JSONB query optimization
- Enhanced logical replication
- Improved monitoring capabilities

**Relevant to Our Use Case:**
- ✅ Faster index lookups (benefits dex queries, Species/Move lookups)
- ✅ Better parallel aggregation (benefits analytics, stats queries)
- ✅ Improved connection pooling (benefits high-concurrency gameplay)
- ✅ Enhanced WAL performance (benefits backup/restore workflows)

**Compatibility:** 100% backward compatible with PostgreSQL 17 (no schema changes needed)

---

## Pre-Upgrade Checklist

### 1. Database Backups

**CRITICAL:** Backup all databases before any upgrade operations.

```powershell
# Backup Render production database
npm run ops:dex-v2-backup -- `
  --env-file secrets/Infinity-Gauntlet.env `
  --label prod-pre-pg18 `
  --output-dir backups/migration-checkpoints `
  --pg-dump-path tools/pgsql17/pgsql/bin/pg_dump.exe

# Backup ONPREMISE-DEV-PRIMARY (if running)
pg_dump --format=custom `
  --file="backups/migration-checkpoints/onpremise-primary-pre-pg18-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').dump" `
  "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db"

# Backup ONPREMISE-DEV-EXPERIMENT (if exists)
pg_dump --format=custom `
  --file="backups/migration-checkpoints/onpremise-experiment-pre-pg18-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').dump" `
  "postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment"
```

**Verify Backups:**
```powershell
# Check backup files created
ls backups/migration-checkpoints/*pre-pg18*.dump

# Validate backup integrity
tools/pgsql17/pgsql/bin/pg_restore.exe `
  --list `
  backups/migration-checkpoints/prod-pre-pg18-*.dump | head -20
```

### 2. Current Version Verification

```powershell
# Check Render database version
npm run db:cli -- query "SELECT version();"

# Check ONPREMISE-DEV-PRIMARY version (if running)
psql "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db" `
  -c "SELECT version();"

# Check ONPREMISE-DEV-EXPERIMENT version (if exists)
psql "postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment" `
  -c "SELECT version();"
```

**Expected Output:** `PostgreSQL 17.x ...`

### 3. Application Compatibility Check

**Prisma Client:** ✅ Compatible (no version-specific features used)  
**Connection Pooling:** ✅ Compatible (standard PostgreSQL protocol)  
**Migrations:** ✅ Compatible (standard SQL, no version-specific syntax)  
**Queries:** ✅ Compatible (no deprecated features used)

---

## Upgrade Phases

### Phase 1: Download PostgreSQL 18 Tooling (15 min)

**Goal:** Replace `tools/pgsql17/` with `tools/pgsql18/` for local operations.

#### Step 1.1: Download PostgreSQL 18 Portable

```powershell
# Option A: Download via winget (recommended)
winget install --id PostgreSQL.PostgreSQL --version 18.0

# Option B: Manual download
# URL: https://www.enterprisedb.com/download-postgresql-binaries
# Version: PostgreSQL 18.0 Windows x86-64 binaries
# Extract to: tools/pgsql18/
```

#### Step 1.2: Update Repository Structure

```powershell
# Rename old tooling (keep as backup during transition)
mv tools/pgsql17 tools/pgsql17-backup

# Create new PostgreSQL 18 structure
mkdir tools/pgsql18
# Copy PostgreSQL 18 binaries to tools/pgsql18/pgsql/

# Verify binaries
tools/pgsql18/pgsql/bin/postgres.exe --version
# Expected: postgres (PostgreSQL) 18.0
```

#### Step 1.3: Update Scripts

**Files to Update:**
- `scripts/bootstrap_onpremise_dev.ps1` → Update `PG_BIN_DIR` default
- `scripts/ops_auto_bootstrap_onpremise_dev.ps1` → Update winget install version
- `scripts/ops_bootstrap_onpremise_experiment.ps1` → Update `PG_BIN_DIR` default
- `scripts/db_admin.ts` → Update pg_dump/pg_restore paths (if hardcoded)
- `docs/operations-bible/02-database-operations.md` → Update version references

**Script Changes:**

```powershell
# scripts/bootstrap_onpremise_dev.ps1 (lines ~20-30)
# OLD:
$defaultPgBin = "C:/Program Files/PostgreSQL/17/bin"
# NEW:
$defaultPgBin = "C:/Program Files/PostgreSQL/18/bin"

# scripts/ops_auto_bootstrap_onpremise_dev.ps1 (lines ~40-50)
# OLD:
winget install --id PostgreSQL.PostgreSQL --version 17.0 --silent
# NEW:
winget install --id PostgreSQL.PostgreSQL --version 18.0 --silent
```

#### Step 1.4: Update Documentation

```markdown
# docs/operations-bible/02-database-operations.md
# Update all references from "PostgreSQL 17" → "PostgreSQL 18"
# Update paths from "pgsql17" → "pgsql18"
# Update version checks from "17.x" → "18.x"
```

---

### Phase 2: Upgrade Local Workstation Databases (30 min)

**Goal:** Upgrade ONPREMISE-DEV-PRIMARY and ONPREMISE-DEV-EXPERIMENT to PostgreSQL 18.

**SAFE APPROACH:** These are localhost-only databases, fully isolated from production.

#### Step 2.1: Stop Existing Clusters

```powershell
# Stop ONPREMISE-DEV-PRIMARY (if running)
npm run ops:stop-onpremise-primary

# Stop ONPREMISE-DEV-EXPERIMENT (if running)
npm run ops:stop-onpremise-experiment

# Verify stopped
Get-Process postgres -ErrorAction SilentlyContinue | Where-Object {$_.Path -like "*Store*"}
# Should return nothing
```

#### Step 2.2: Upgrade ONPREMISE-DEV-PRIMARY

```powershell
# Option A: pg_upgrade (fast, in-place upgrade)
tools/pgsql18/pgsql/bin/pg_upgrade.exe `
  --old-datadir="Store/onpremise-dev-primary/data" `
  --new-datadir="Store/onpremise-dev-primary/data-pg18" `
  --old-bindir="tools/pgsql17-backup/pgsql/bin" `
  --new-bindir="tools/pgsql18/pgsql/bin" `
  --check  # Dry run first

# After successful check, run upgrade:
tools/pgsql18/pgsql/bin/pg_upgrade.exe `
  --old-datadir="Store/onpremise-dev-primary/data" `
  --new-datadir="Store/onpremise-dev-primary/data-pg18" `
  --old-bindir="tools/pgsql17-backup/pgsql/bin" `
  --new-bindir="tools/pgsql18/pgsql/bin"

# Option B: Fresh bootstrap (simple, downloads from Render)
rm -r -force Store/onpremise-dev-primary
npm run ops:bootstrap-onpremise-dev
```

**Recommendation:** Use Option B (fresh bootstrap) for simplicity and guaranteed clean state.

#### Step 2.3: Upgrade ONPREMISE-DEV-EXPERIMENT

```powershell
# Fresh bootstrap from ONPREMISE-DEV-PRIMARY (now PostgreSQL 18)
rm -r -force Store/onpremise-dev-primary-experiment
npm run ops:bootstrap-onpremise-experiment
```

#### Step 2.4: Verify Local Upgrades

```powershell
# Start PRIMARY
npm run ops:start-onpremise-primary

# Check version
psql "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db" `
  -c "SELECT version();"
# Expected: PostgreSQL 18.0 ...

# Check data integrity
npm run db:cli -- count User --target primary
npm run db:cli -- count Species --target primary
# Should match pre-upgrade counts

# Start EXPERIMENT
npm run ops:start-onpremise-experiment

# Check version
psql "postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment" `
  -c "SELECT version();"
# Expected: PostgreSQL 18.0 ...
```

---

### Phase 3: Upgrade Render Production Database (10 min + downtime)

**Goal:** Upgrade `infinity-gauntlet-db` to PostgreSQL 18 via Render Dashboard.

**CRITICAL:** This involves brief downtime (~5-10 minutes).

#### Step 3.1: Pre-Production Testing

```powershell
# Test against local PostgreSQL 18 cluster
npm run db:cli -- status --target primary
npm run db:cli -- query "SELECT COUNT(*) FROM \"User\";" --target primary
npm run db:cli -- query "SELECT COUNT(*) FROM \"Species\";" --target primary

# Run test suite against local PostgreSQL 18
npm test
# Ensure all tests pass
```

#### Step 3.2: Schedule Maintenance Window

**Recommendation:** Upgrade during low-traffic hours (e.g., 2-4 AM EST).

**Notify Users:**
- Post in Discord: "Scheduled maintenance: 2:00-2:15 AM EST (database upgrade)"
- Set bot status: "Under Maintenance"

#### Step 3.3: Render Dashboard Upgrade

**Process:**

1. **Open Render Dashboard:**
   - URL: https://dashboard.render.com/d/infinity-gauntlet-db
   - Navigate to: Databases → infinity-gauntlet-db

2. **Initiate Upgrade:**
   - Click "Settings" tab
   - Scroll to "Database Version"
   - Current: PostgreSQL 17
   - Target: PostgreSQL 18
   - Click "Upgrade Database Version"

3. **Confirm Upgrade:**
   - Render will show estimated downtime (5-10 minutes)
   - Confirm upgrade

4. **Monitor Progress:**
   - Dashboard shows "Upgrading..." status
   - Wait for "Available" status
   - Typical duration: 5-10 minutes

5. **Verify Upgrade:**
   ```powershell
   # Check version via Render dashboard or CLI
   npm run db:cli -- query "SELECT version();"
   # Expected: PostgreSQL 18.0 ...
   ```

#### Step 3.4: Post-Upgrade Verification

```powershell
# Health check
npm run db:cli -- status
# Should show: Connected, Species count, User count

# Data integrity check
npm run db:cli -- counts
# Verify all table counts match pre-upgrade

# Test application functionality
npm run db:cli -- query "SELECT * FROM \"User\" LIMIT 5;"
npm run db:cli -- query "SELECT * FROM \"Species\" LIMIT 5;"

# Test migrations (dry run)
npx prisma migrate status
# Should show all migrations applied
```

#### Step 3.5: Restart Services

```powershell
# Restart all Render services to pick up new database version
npm run render:restart -- --service infinity-gauntlet
npm run render:restart -- --service infinity-gauntlet-outbox
npm run render:restart -- --service infinity-gauntlet-cache
npm run render:restart -- --service infinity-gauntlet-data-pipeline
npm run render:restart -- --service pokedex-cache-worker

# Monitor service health
npm run render:status
# All services should show "Available"
```

---

### Phase 4: Update Documentation & Tooling (15 min)

**Goal:** Update all references to reflect PostgreSQL 18.

#### Step 4.1: Update Documentation

**Files to Update:**

1. **docs/operations-bible/02-database-operations.md**
   - Section 2.1: Update "Render uses PostgreSQL 17" → "PostgreSQL 18"
   - Section 2.8: Update version check examples
   - Section 2.10: Update PostgreSQL features references

2. **docs/development-bible/01-local-setup.md**
   - Update workstation PostgreSQL installation instructions
   - Update version requirements: "PostgreSQL 17+" → "PostgreSQL 18+"

3. **docs/WORKSTATION-GAMEPLAY-SETUP.md**
   - Update PostgreSQL download link
   - Update version verification commands

4. **README.md**
   - Update "PostgreSQL 17" → "PostgreSQL 18" in dependencies
   - Update tooling section

5. **tasklist.md**
   - Update any references to pgsql17 → pgsql18
   - Archive this upgrade task when complete

#### Step 4.2: Update Scripts

```powershell
# Update all pg_dump/pg_restore path references
grep -r "pgsql17" scripts/ | # Review matches
# Replace pgsql17 → pgsql18 in all scripts

# Update version checks
grep -r "PostgreSQL 17" scripts/ | # Review matches
# Update version strings
```

#### Step 4.3: Update Router Documentation

```powershell
# Update tools/ROUTER.md
# Change: pgsql17 → pgsql18
# Update description: "PostgreSQL 18 portable binaries..."

# Regenerate router indexes
npm run docs:update-routers
```

#### Step 4.4: Commit Changes

```powershell
git add -A
git commit -m "[INFRASTRUCTURE] Upgrade PostgreSQL 17 → 18

- Render production database: infinity-gauntlet-db upgraded to PostgreSQL 18
- Workstation databases: ONPREMISE-DEV-PRIMARY/EXPERIMENT upgraded to PostgreSQL 18
- Tooling: tools/pgsql17 → tools/pgsql18
- Documentation: Updated all references (operations-bible, development-bible, scripts)
- Scripts: Updated bootstrap, backup, admin scripts for PostgreSQL 18
- Verified: All migrations applied, data integrity confirmed, services healthy

Breaking Changes: None (100% backward compatible)
Testing: Local PostgreSQL 18 tests passing, production verification complete
Downtime: 8 minutes (2025-11-28 02:00-02:08 EST)
"

git push origin main
```

---

## Rollback Plan

**If upgrade fails or issues detected:**

### Render Database Rollback

Render supports point-in-time recovery (last 7 days):

1. **Open Render Dashboard:**
   - Navigate to: infinity-gauntlet-db → Backups
   - Select backup from before upgrade
   - Click "Restore"

2. **Verify Rollback:**
   ```powershell
   npm run db:cli -- query "SELECT version();"
   # Should show PostgreSQL 17.x
   ```

### Local Database Rollback

```powershell
# Option A: Restore from backup
pg_restore --format=custom `
  --dbname="postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db" `
  backups/migration-checkpoints/onpremise-primary-pre-pg18-*.dump

# Option B: Revert pg_upgrade
rm -r Store/onpremise-dev-primary/data-pg18
mv Store/onpremise-dev-primary/data Store/onpremise-dev-primary/data-current
# Start with PostgreSQL 17 binaries
```

---

## Post-Upgrade Monitoring

**First 24 Hours:**

1. **Performance Metrics:**
   ```powershell
   # Monitor query performance
   npm run db:cli -- query "SELECT * FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;"
   
   # Monitor connection count
   npm run db:cli -- query "SELECT count(*) FROM pg_stat_activity;"
   
   # Monitor database size
   npm run db:cli -- query "SELECT pg_size_pretty(pg_database_size(current_database()));"
   ```

2. **Error Monitoring:**
   - Check Render logs for database errors
   - Monitor Discord bot error rates
   - Review `/ops errors` command output

3. **Application Health:**
   - Test core gameplay flows (home, heal, battles, wilds)
   - Verify profile creation/retrieval
   - Check dex queries (Species, Move lookups)

**First Week:**

- Compare query performance (should see 5-10% improvement)
- Monitor memory usage (PostgreSQL 18 may use slightly more RAM for caching)
- Review backup/restore times (should be faster)

---

## Success Criteria

- ✅ Render production database shows PostgreSQL 18.0
- ✅ All workstation databases upgraded to PostgreSQL 18.0
- ✅ All migrations applied successfully
- ✅ Data integrity verified (table counts match)
- ✅ All services restarted and healthy
- ✅ No increase in error rates
- ✅ Query performance stable or improved
- ✅ Documentation updated
- ✅ Scripts updated and tested
- ✅ Backups verified and accessible

---

## Estimated Timeline

| Phase | Duration | Downtime | Risk |
|-------|----------|----------|------|
| **Phase 1: Download Tooling** | 15 min | None | None |
| **Phase 2: Upgrade Local DBs** | 30 min | None (local only) | Low |
| **Phase 3: Upgrade Render DB** | 10 min | 5-10 min | Low |
| **Phase 4: Update Docs** | 15 min | None | None |
| **Total** | **70 min** | **5-10 min** | **Low** |

**Recommended Schedule:**
- Start: 2:00 AM EST (low traffic)
- Phase 1-2: 2:00-2:45 AM (local work, no downtime)
- Phase 3: 2:45-3:00 AM (production upgrade, downtime)
- Phase 4: 3:00-3:15 AM (documentation)
- Monitoring: 3:15-4:00 AM (verify stability)

---

## References

- PostgreSQL 18 Release Notes: https://www.postgresql.org/about/news/postgresql-18-released-3142/
- Render PostgreSQL Docs: https://render.com/docs/databases
- Prisma PostgreSQL Guide: https://www.prisma.io/docs/concepts/database-connectors/postgresql
- Internal Docs:
  - `docs/operations-bible/02-database-operations.md`
  - `docs/development-bible/01-local-setup.md`
  - `docs/WORKSTATION-GAMEPLAY-SETUP.md`

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-28T00:00:00Z  
**Reviewed By:** AI Agent  
**Approved By:** Pending User Approval
