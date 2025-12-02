# Task 11: Rollback Procedure Documentation

**Date**: December 2, 2025  
**Specialist**: DevOps  
**Status**: ✅ **COMPLETE**  
**Duration**: 45 minutes

---

## Executive Summary

Complete rollback procedure for TimescaleDB POC deployment covering:
- ✅ Rollback trigger conditions (when to rollback vs. forward fix)
- ✅ Pre-rollback validation checklist (backup verification, stakeholder notification)
- ✅ Database rollback steps (drop views, drop hypertables, uninstall extension)
- ✅ Code rollback steps (remove worker, revert Prisma schema, restore index.ts)
- ✅ Restore from backup procedure (0.83 MB pre-timescale-poc backup)
- ✅ Post-rollback verification (database operational, bot functional)
- ✅ Monitoring and observation period (24-hour validation)

**Emergency Contact**: DripTVDD (Discord: @DripTVDD)  
**Backup Location**: `backups/pre-timescale-poc/backup-<timestamp>.dump`  
**Estimated Rollback Time**: 15-30 minutes  
**Risk Level**: Low (comprehensive backup + test-restore validated)

---

## 1. Rollback Decision Matrix

### When to Rollback (EMERGENCY)

Rollback is recommended if **ANY** of these critical conditions occur:

1. **Data Loss Detected**
   - Missing correlation IDs in log_entries
   - Events dropped by log ingestion worker
   - Hypertable data corruption (failed integrity checks)
   - Materialized views return incorrect aggregations

2. **Performance Degradation**
   - Query latency >10× slower than pre-TimescaleDB baseline
   - Database CPU usage >90% sustained for >30 minutes
   - Memory exhaustion (OOM errors in logs)
   - Render service crashes repeatedly (>3 times in 1 hour)

3. **Critical Bugs**
   - Log ingestion worker crashes on startup
   - Hypertable writes fail with unrecoverable errors
   - TimescaleDB extension conflicts with PostgreSQL 18
   - Data type mismatches cause query failures

4. **Storage Exhaustion**
   - Database size exceeds 950 MB (95% of 1 GB quota)
   - Hypertable chunk creation fails (out of space)
   - Cannot drop old data (retention policies broken)

5. **Stakeholder Decision**
   - Product owner requests immediate rollback
   - Security concerns identified (data exposure risk)
   - Business priorities shift (POC no longer needed)

---

### When to Forward Fix (PREFERRED)

Forward fix is preferred if **ANY** of these conditions apply:

1. **Non-Critical Issues**
   - Materialized view refresh slower than expected (but functional)
   - Missing indexes (can add without rollback)
   - Alert thresholds need tuning
   - Dashboard panels need adjustments

2. **Temporary Problems**
   - Network latency to Render database (not TimescaleDB issue)
   - Worker restart resolves issue (not systematic failure)
   - Configuration error (environment variable mismatch)

3. **Minor Performance Issues**
   - Query latency 2-5× slower (not 10×)
   - Database CPU <80% (acceptable range)
   - Memory usage within limits

4. **Data Integrity Intact**
   - All events accounted for (no data loss)
   - Correlation IDs preserved correctly
   - Aggregations match expected values

**Decision Rule**: If issue is **non-critical** and **reversible**, attempt forward fix first. Rollback only if forward fix fails or issue is critical.

---

## 2. Pre-Rollback Checklist

Before initiating rollback, complete **ALL** checklist items:

### Validation Steps

- [ ] **Backup Verification**: Confirm pre-timescale-poc backup exists and is restorable
  ```powershell
  # Check backup exists
  Get-ChildItem backups/pre-timescale-poc/ -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  
  # Verify backup size (expected: ~0.83 MB)
  # Test restore (dry-run): npm run db:test-restore
  ```

- [ ] **Stakeholder Notification**: Alert team before rollback
  - Notify: DripTVDD (Discord: @DripTVDD)
  - Notify: Dev team (#infinity-gauntlet-dev channel)
  - Reason: `<brief description of rollback trigger>`
  - ETA: 15-30 minutes downtime

- [ ] **Document Issue**: Capture evidence before rollback
  ```powershell
  # Save current database state
  npm run db:cli -- query "SELECT pg_database_size(current_database())::BIGINT / (1024 * 1024) AS size_mb;" > rollback-evidence/db-size.txt
  
  # Save hypertable row counts
  npm run db:cli -- counts > rollback-evidence/table-counts.txt
  
  # Save recent logs
  Get-Content Store/logs/bot.log -Tail 500 > rollback-evidence/bot-logs.txt
  
  # Save error screenshots (if applicable)
  ```

- [ ] **Stop Bot Services**: Prevent new data writes during rollback
  ```powershell
  # Stop main bot (Render dashboard or CLI)
  # Or use render_restart.ps1 to stop service
  ```

- [ ] **Verify No Active Connections**: Ensure safe rollback
  ```sql
  SELECT count(*) FROM pg_stat_activity WHERE datname = 'infinity_gauntlet_db';
  -- Expected: 1 (only your admin connection)
  ```

---

### Emergency Contacts

| Role | Contact | Method | Response Time |
|------|---------|--------|---------------|
| **Project Owner** | DripTVDD | Discord @DripTVDD | <15 minutes |
| **DevOps Lead** | (Specialist Team) | Discord #infinity-gauntlet-ops | <30 minutes |
| **Database Admin** | (Specialist Team) | Discord #infinity-gauntlet-db | <30 minutes |
| **Render Support** | support@render.com | Email | 1-4 hours |

---

## 3. Database Rollback Procedure

### Step 1: Drop Materialized Views (5 minutes)

**Objective**: Remove all 5 materialized views created in Task 7

```sql
-- Connect to production database
-- Use: npm run db:cli -- query "<SQL>"

-- Drop materialized views (includes indexes automatically)
DROP MATERIALIZED VIEW IF EXISTS logs_hourly CASCADE;
DROP MATERIALIZED VIEW IF EXISTS error_rate_hourly CASCADE;
DROP MATERIALIZED VIEW IF EXISTS battles_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS security_events_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS pokemon_usage_weekly CASCADE;

-- Verify removal
SELECT matviewname FROM pg_matviews WHERE schemaname = 'public';
-- Expected: No rows (or only pre-existing SpeciesSheet view)
```

**PowerShell Execution**:
```powershell
npm run db:cli -- query "DROP MATERIALIZED VIEW IF EXISTS logs_hourly CASCADE;"
npm run db:cli -- query "DROP MATERIALIZED VIEW IF EXISTS error_rate_hourly CASCADE;"
npm run db:cli -- query "DROP MATERIALIZED VIEW IF EXISTS battles_daily CASCADE;"
npm run db:cli -- query "DROP MATERIALIZED VIEW IF EXISTS security_events_daily CASCADE;"
npm run db:cli -- query "DROP MATERIALIZED VIEW IF EXISTS pokemon_usage_weekly CASCADE;"

# Verify
npm run db:cli -- query "SELECT matviewname FROM pg_matviews WHERE schemaname = 'public';"
```

**Expected Result**: ✅ All 5 materialized views dropped, 0 errors

---

### Step 2: Drop Hypertables (5 minutes)

**Objective**: Remove all 4 hypertables created in Task 5

```sql
-- Drop hypertables (automatically drops chunks and indexes)
DROP TABLE IF EXISTS log_entries CASCADE;
DROP TABLE IF EXISTS event_history CASCADE;
DROP TABLE IF EXISTS security_events CASCADE;
DROP TABLE IF EXISTS battle_analytics CASCADE;

-- Verify removal
SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_schema = 'public';
-- Expected: No rows
```

**PowerShell Execution**:
```powershell
npm run db:cli -- query "DROP TABLE IF EXISTS log_entries CASCADE;"
npm run db:cli -- query "DROP TABLE IF EXISTS event_history CASCADE;"
npm run db:cli -- query "DROP TABLE IF EXISTS security_events CASCADE;"
npm run db:cli -- query "DROP TABLE IF EXISTS battle_analytics CASCADE;"

# Verify
npm run db:cli -- query "SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_schema = 'public';"
```

**Expected Result**: ✅ All 4 hypertables dropped, 0 errors

---

### Step 3: Uninstall TimescaleDB Extension (2 minutes)

**Objective**: Remove TimescaleDB 2.23.0 extension from database

```sql
-- Uninstall extension (requires CASCADE to remove dependent objects)
DROP EXTENSION IF EXISTS timescaledb CASCADE;

-- Verify removal
SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb';
-- Expected: No rows
```

**PowerShell Execution**:
```powershell
npm run db:cli -- query "DROP EXTENSION IF EXISTS timescaledb CASCADE;"

# Verify
npm run db:cli -- query "SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb';"
```

**Expected Result**: ✅ TimescaleDB extension removed, database back to standard PostgreSQL 18

**⚠️ WARNING**: This step removes **ALL** TimescaleDB-specific features. Ensure Steps 1-2 completed successfully before executing.

---

### Step 4: Restore from Backup (10 minutes)

**Objective**: Restore database to pre-TimescaleDB state (0.83 MB backup)

**Option A: Full Database Restore** (DESTRUCTIVE - replaces entire database)

```powershell
# Locate backup file
$backupFile = Get-ChildItem backups/pre-timescale-poc/ -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# Restore using pg_restore
$env:PGPASSWORD = "<RENDER_DB_PASSWORD>"
pg_restore --clean --if-exists --no-owner --no-acl -d $env:PROD_DATABASE_URL $backupFile.FullName

# Or use helper script
npm run db:restore -- --backup $backupFile.FullName
```

**Option B: Selective Restore** (SAFER - restore specific tables only)

```powershell
# Restore only affected tables (User, TrainerProfile, Pokemon, etc.)
# This preserves any new data created during POC period

pg_restore --clean --if-exists --no-owner --no-acl --table=User --table=TrainerProfile -d $env:PROD_DATABASE_URL $backupFile.FullName
```

**Verification**:
```powershell
# Check database size (should match pre-POC size: ~24 MB)
npm run db:cli -- query "SELECT pg_database_size(current_database())::BIGINT / (1024 * 1024) AS size_mb;"

# Verify table counts match backup
npm run db:cli -- counts

# Spot-check critical tables
npm run db:cli -- count User
npm run db:cli -- count Species
```

**Expected Result**: ✅ Database restored to pre-TimescaleDB state, all core tables intact

---

## 4. Code Rollback Procedure

### Step 1: Remove Log Ingestion Worker (5 minutes)

**Objective**: Remove log ingestion worker code (Task 6 implementation)

**Files to Modify**:

1. **Remove worker file**:
   ```powershell
   Remove-Item src/workers/log-ingestion-worker.ts -Force
   ```

2. **Revert src/index.ts integration** (lines added in Task 6):
   ```typescript
   // REMOVE THESE LINES (around line 1543):
   // import { startLogIngestionWorker, stopLogIngestionWorker } from './workers/log-ingestion-worker.js';
   // await startLogIngestionWorker();
   
   // REMOVE THESE LINES (around line 1058):
   // await stopLogIngestionWorker();
   ```

   **PowerShell Command** (use git to revert):
   ```powershell
   # Revert src/index.ts to pre-worker state
   git diff HEAD~6 HEAD src/index.ts > rollback-evidence/index-diff.txt
   git checkout HEAD~6 -- src/index.ts
   ```

3. **Verify removal**:
   ```powershell
   # Check worker file deleted
   Test-Path src/workers/log-ingestion-worker.ts
   # Expected: False
   
   # Check index.ts has no worker imports
   Select-String -Path src/index.ts -Pattern "log-ingestion-worker"
   # Expected: No matches
   ```

**Expected Result**: ✅ Log ingestion worker code removed, bot startup/shutdown no longer references worker

---

### Step 2: Revert Prisma Schema (2 minutes)

**Objective**: Remove LogEntry model added in Task 6 (lines 590-617 in prisma/schema.prisma)

**Files to Modify**:

1. **Remove LogEntry model**:
   ```prisma
   // DELETE THIS MODEL (lines 590-617):
   model LogEntry {
     id              String   @id @default(uuid())
     timestamp       DateTime @default(now())
     level           String
     category        String?
     service_name    String?
     message         String
     metadata        Json?
     correlation_id  String?
     parent_correlation_id String?
     
     @@index([timestamp])
     @@index([level])
     @@index([correlation_id])
     @@index([service_name])
     @@map("log_entries")
   }
   ```

   **PowerShell Command** (use git to revert):
   ```powershell
   # Revert schema to pre-TimescaleDB state
   git checkout HEAD~6 -- prisma/schema.prisma
   ```

2. **Regenerate Prisma client**:
   ```powershell
   npx prisma generate
   ```

3. **Verify reversion**:
   ```powershell
   # Check LogEntry model removed
   Select-String -Path prisma/schema.prisma -Pattern "model LogEntry"
   # Expected: No matches
   ```

**Expected Result**: ✅ Prisma schema reverted, LogEntry model removed, client regenerated

---

### Step 3: Remove Task 5-9 Artifacts (5 minutes)

**Objective**: Clean up POC documentation and scripts

**Files to Remove**:

1. **SQL deployment scripts**:
   ```powershell
   Remove-Item scripts/devops/deploy-hypertables.sql -Force
   Remove-Item scripts/devops/deploy-materialized-views.sql -Force
   ```

2. **Specialist documentation** (optional - archive instead):
   ```powershell
   # Archive instead of deleting (for post-mortem analysis)
   New-Item -ItemType Directory -Path docs/specialists/archive-timescaledb-poc -Force
   Move-Item docs/specialists/task-*.md docs/specialists/archive-timescaledb-poc/
   Move-Item ops/grafana-timescaledb-dashboard.json docs/specialists/archive-timescaledb-poc/
   ```

3. **Grafana dashboard JSON**:
   ```powershell
   # Archive dashboard (don't delete - useful for future reference)
   Move-Item ops/grafana-timescaledb-dashboard.json backups/pre-timescale-poc/
   ```

**Expected Result**: ✅ POC artifacts archived, repository clean

---

### Step 4: Rebuild Application (3 minutes)

**Objective**: Ensure application compiles without TimescaleDB dependencies

```powershell
# Clean build artifacts
Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue

# Rebuild TypeScript
npm run build

# Verify no errors
# Expected: 0 errors, 0 warnings
```

**Verification**:
```powershell
# Check build output exists
Test-Path dist/index.js
# Expected: True

# Test import resolution (no missing modules)
node -e "require('./dist/index.js')" 2>&1 | Select-String -Pattern "ERROR|Cannot find module"
# Expected: No matches (or graceful exit)
```

**Expected Result**: ✅ Application builds successfully, no TimescaleDB imports remain

---

## 5. Deployment Rollback (Render)

### Step 1: Stop Current Deployment (1 minute)

```powershell
# Use Render CLI or dashboard to stop service
pwsh -File scripts/render_restart.ps1 -Service "Infinity-Gauntlet"
```

**Alternative** (Render Dashboard):
1. Navigate to: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
2. Click "Manual Deploy" → "Clear build cache & deploy"
3. Or use "Suspend" to stop service temporarily

---

### Step 2: Deploy Rollback Commit (5 minutes)

```powershell
# Create rollback commit
git add -A
git commit -m "[ROLLBACK] Revert TimescaleDB POC deployment (Tasks 4-9)

Reason: <brief description of rollback trigger>
- Removed log ingestion worker
- Reverted Prisma schema (removed LogEntry model)
- Dropped TimescaleDB extension
- Restored database from pre-timescale-poc backup

Database state: Pre-POC (0.83 MB backup)
Rollback initiated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')
Stakeholder approval: DripTVDD"

# Push rollback commit
git push origin main

# Trigger Render deployment
pwsh -File scripts/render_deploy.ps1 -Service "Infinity-Gauntlet"
```

**Monitor Deployment**:
```powershell
# Watch deployment logs
pwsh -File scripts/render_logs.ps1 -Service "Infinity-Gauntlet" -Tail

# Check deployment status
pwsh -File scripts/render_status.ps1
```

**Expected Result**: ✅ Rollback commit deployed, bot running on pre-POC codebase

---

## 6. Post-Rollback Verification

### Database Verification Checklist

- [ ] **PostgreSQL Operational**:
  ```powershell
  npm run db:cli -- query "SELECT version();"
  # Expected: PostgreSQL 18.1 (no TimescaleDB mention)
  ```

- [ ] **TimescaleDB Extension Removed**:
  ```powershell
  npm run db:cli -- query "SELECT extname FROM pg_extension WHERE extname = 'timescaledb';"
  # Expected: No rows
  ```

- [ ] **Hypertables Removed**:
  ```powershell
  npm run db:cli -- counts
  # Expected: No log_entries, event_history, security_events, battle_analytics tables
  ```

- [ ] **Core Tables Intact**:
  ```powershell
  npm run db:cli -- count User
  npm run db:cli -- count Species
  npm run db:cli -- count TrainerProfile
  # Expected: Row counts match pre-POC backup
  ```

- [ ] **Database Size Restored**:
  ```powershell
  npm run db:cli -- query "SELECT pg_database_size(current_database())::BIGINT / (1024 * 1024) AS size_mb;"
  # Expected: ~24 MB (pre-POC size)
  ```

---

### Bot Functionality Verification Checklist

- [ ] **Bot Online**:
  - Check Discord server for bot presence (green status)
  - Run `/ops status` command
  - Expected: Bot responds with operational status

- [ ] **Commands Working**:
  - Test `/home` command (DM flow)
  - Test `/battle` command (battle system)
  - Test `/walk` command (wild encounters)
  - Expected: All core features functional

- [ ] **No Errors in Logs**:
  ```powershell
  pwsh -File scripts/render_logs.ps1 -Service "Infinity-Gauntlet" | Select-String -Pattern "ERROR|FATAL|TimescaleDB"
  # Expected: No TimescaleDB errors, no critical errors
  ```

- [ ] **Memory Usage Normal**:
  - Check Render dashboard metrics
  - Expected: <600 MB memory usage (pre-POC baseline)

- [ ] **Database Connections Stable**:
  ```powershell
  npm run db:cli -- query "SELECT count(*) FROM pg_stat_activity WHERE datname = 'infinity_gauntlet_db';"
  # Expected: 1-3 connections (bot + admin)
  ```

---

### Grafana Dashboard Verification (if applicable)

- [ ] **Dashboard Still Accessible**:
  - Open Grafana instance
  - Expected: Old security bot dashboard still functional

- [ ] **TimescaleDB Dashboard Removed**:
  - Check for `grafana-timescaledb-dashboard.json` import
  - Expected: Dashboard archived, not active

---

## 7. Post-Rollback Monitoring (24 Hours)

### Hour 0-4: Immediate Monitoring

**Check Every 30 Minutes**:
- [ ] Bot online and responsive
- [ ] No database connection errors
- [ ] Memory usage stable (<600 MB)
- [ ] No user-reported issues in Discord

**Monitoring Commands**:
```powershell
# Check bot status
pwsh -File scripts/render_status.ps1

# Monitor memory usage
# (Render dashboard: Metrics tab → Memory graph)

# Watch logs for errors
pwsh -File scripts/render_logs.ps1 -Service "Infinity-Gauntlet" | Select-String -Pattern "ERROR|FATAL"
```

---

### Hour 4-24: Observation Period

**Check Every 4 Hours**:
- [ ] Bot uptime stable (no crashes)
- [ ] Database size stable (~24 MB)
- [ ] User engagement normal (battles, walks, etc.)
- [ ] No performance degradation vs. pre-POC

**Validation Queries**:
```powershell
# Check database size stability
npm run db:cli -- query "SELECT pg_database_size(current_database())::BIGINT / (1024 * 1024) AS size_mb;"

# Check active connections
npm run db:cli -- query "SELECT count(*) FROM pg_stat_activity WHERE datname = 'infinity_gauntlet_db';"

# Check user activity (battles in last 4 hours)
npm run db:cli -- query "SELECT COUNT(*) FROM \"Battle\" WHERE \"createdAt\" >= NOW() - INTERVAL '4 hours';"
```

---

### Day 2-7: Extended Observation

**Check Daily**:
- [ ] Bot stability (zero crashes for 7 days)
- [ ] Database growth rate normal (<1 MB/day)
- [ ] User feedback positive (no complaints)
- [ ] Performance metrics baseline restored

**Success Criteria** (after 7 days):
- ✅ Zero rollback-related incidents
- ✅ Bot uptime >99.9%
- ✅ User satisfaction maintained
- ✅ Performance metrics match pre-POC baseline

---

## 8. Rollback Completion Report

### Template (fill after 24h observation):

```markdown
# TimescaleDB POC Rollback - Completion Report

**Date**: <rollback date>  
**Initiated By**: <your name>  
**Reason**: <brief description of rollback trigger>

## Rollback Summary

- **Start Time**: <timestamp>
- **End Time**: <timestamp>
- **Duration**: <X minutes>
- **Downtime**: <X minutes>

## Steps Completed

- [x] Pre-rollback checklist (backup verified, stakeholders notified)
- [x] Database rollback (dropped views, hypertables, extension)
- [x] Restore from backup (0.83 MB pre-timescale-poc)
- [x] Code rollback (removed worker, reverted schema)
- [x] Deployment rollback (pushed rollback commit, redeployed)
- [x] Post-rollback verification (database + bot functional)

## Verification Results

**Database Status**: ✅ Operational  
- PostgreSQL 18.1: ✅ Running
- TimescaleDB extension: ✅ Removed
- Core tables: ✅ Intact (User, Species, TrainerProfile)
- Database size: ✅ ~24 MB (restored)

**Bot Status**: ✅ Operational  
- Online: ✅ Green status in Discord
- Commands: ✅ /home, /battle, /walk working
- Memory usage: ✅ <600 MB (normal)
- Errors: ✅ None detected

## Issues Encountered

<list any issues during rollback, or "None">

## Lessons Learned

1. <what went well>
2. <what could be improved>
3. <recommendations for future POCs>

## Post-Rollback Actions

- [ ] Archive TimescaleDB POC documentation (docs/specialists/archive-timescaledb-poc/)
- [ ] Update tasklist.md (mark Tasks 4-10 as ROLLED BACK)
- [ ] Notify stakeholders of successful rollback
- [ ] Schedule post-mortem meeting (optional)
- [ ] Document rollback in ops/ROLLBACK_LOG.md

## Sign-Off

**DevOps Specialist**: <your name>  
**Project Owner**: DripTVDD  
**Date**: <completion date>

---

Rollback completed successfully. Database and bot restored to pre-POC state. Monitoring continues for 7 days to ensure stability.
```

---

## 9. Emergency Rollback (Fast Path)

**Use this ONLY in critical situations** (data loss, bot crashes repeatedly, database corruption).

### 5-Minute Emergency Rollback

```powershell
# Step 1: Stop bot (1 min)
pwsh -File scripts/render_restart.ps1 -Service "Infinity-Gauntlet"

# Step 2: Database emergency restore (3 min)
$backupFile = Get-ChildItem backups/pre-timescale-poc/ -Filter "*.dump" | Select-Object -First 1
pg_restore --clean --if-exists --no-owner --no-acl -d $env:PROD_DATABASE_URL $backupFile.FullName

# Step 3: Code rollback (1 min)
git checkout HEAD~6 -- src/index.ts prisma/schema.prisma
npx prisma generate
npm run build

# Step 4: Deploy rollback
git add -A
git commit -m "[EMERGENCY ROLLBACK] Revert TimescaleDB POC"
git push origin main
pwsh -File scripts/render_deploy.ps1 -Service "Infinity-Gauntlet"
```

**Verification**:
```powershell
# Check bot online
pwsh -File scripts/render_status.ps1

# Check database operational
npm run db:cli -- query "SELECT version();"
```

**Follow-Up**: Complete full rollback procedure documentation after emergency is resolved.

---

## 10. Rollback Prevention Checklist

**Use this checklist BEFORE deploying future POCs** to minimize rollback risk:

- [ ] **Comprehensive Testing**: Run all validation tests in staging environment first
- [ ] **Phased Rollout**: Deploy to 10% of users, then 50%, then 100%
- [ ] **Feature Flags**: Use feature flags to disable POC without rollback
- [ ] **Automated Rollback**: Create automated rollback script triggered by alerts
- [ ] **Backup Validation**: Test backup restore procedure BEFORE deployment
- [ ] **Monitoring Setup**: Configure alerts and dashboards BEFORE deployment
- [ ] **Rollback Rehearsal**: Practice rollback procedure in staging environment
- [ ] **Stakeholder Communication**: Ensure team knows rollback criteria and process

---

## Appendix A: Rollback Automation Script

**File**: `scripts/devops/emergency-rollback.ps1`

```powershell
# Emergency Rollback Script for TimescaleDB POC
# Usage: pwsh -File scripts/devops/emergency-rollback.ps1 -Reason "Brief description"

param(
    [Parameter(Mandatory=$true)]
    [string]$Reason
)

Write-Host "🚨 EMERGENCY ROLLBACK INITIATED" -ForegroundColor Red
Write-Host "Reason: $Reason"
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')"
Write-Host ""

# Step 1: Stop bot
Write-Host "Step 1/5: Stopping bot..." -ForegroundColor Yellow
pwsh -File scripts/render_restart.ps1 -Service "Infinity-Gauntlet"
Start-Sleep -Seconds 10

# Step 2: Database restore
Write-Host "Step 2/5: Restoring database from backup..." -ForegroundColor Yellow
$backupFile = Get-ChildItem backups/pre-timescale-poc/ -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($null -eq $backupFile) {
    Write-Error "❌ Backup file not found! Aborting rollback."
    exit 1
}

Write-Host "Using backup: $($backupFile.Name)"
$env:PGPASSWORD = $env:RENDER_DB_PASSWORD
pg_restore --clean --if-exists --no-owner --no-acl -d $env:PROD_DATABASE_URL $backupFile.FullName

# Step 3: Code rollback
Write-Host "Step 3/5: Reverting code changes..." -ForegroundColor Yellow
git checkout HEAD~6 -- src/index.ts prisma/schema.prisma
npx prisma generate
npm run build

# Step 4: Deploy rollback
Write-Host "Step 4/5: Deploying rollback commit..." -ForegroundColor Yellow
git add -A
git commit -m "[EMERGENCY ROLLBACK] Revert TimescaleDB POC

Reason: $Reason
Initiated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')
Automated rollback via emergency-rollback.ps1"

git push origin main
pwsh -File scripts/render_deploy.ps1 -Service "Infinity-Gauntlet"

# Step 5: Verification
Write-Host "Step 5/5: Verifying rollback..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

$status = pwsh -File scripts/render_status.ps1
if ($status -match "running") {
    Write-Host "✅ ROLLBACK COMPLETE - Bot online" -ForegroundColor Green
} else {
    Write-Host "⚠️ ROLLBACK COMPLETE - Manual verification needed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Post-rollback checklist:"
Write-Host "1. Verify bot responding in Discord"
Write-Host "2. Run: npm run db:cli -- counts"
Write-Host "3. Monitor logs for 30 minutes"
Write-Host "4. Fill rollback completion report"
```

---

## Summary

✅ **Rollback Procedure Complete**: Comprehensive documentation covering all rollback scenarios (emergency, planned, partial)  
✅ **Decision Matrix**: Clear criteria for rollback vs. forward fix  
✅ **Step-by-Step Instructions**: Database, code, and deployment rollback procedures  
✅ **Verification Checklists**: Post-rollback validation and 24-hour monitoring  
✅ **Emergency Fast Path**: 5-minute emergency rollback for critical situations  
✅ **Automation Script**: PowerShell script for automated emergency rollback  

**DevOps Specialist**: Rollback procedure documentation complete. All rollback scenarios covered (database, code, deployment). Emergency fast path documented (5 minutes). Verification checklists provided for 24-hour monitoring. Automation script created for emergency situations. Ready to support production deployment or execute rollback if needed.
