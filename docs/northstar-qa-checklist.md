# Northstar Quality Assurance Checklist

**Purpose:** Standardized QA validation for all Northstar optimization phases  
**Created:** 2025-11-08  
**Status:** Living Document

---

## Table of Contents

1. [Pre-Development QA](#pre-development-qa)
2. [Development Phase QA](#development-phase-qa)
3. [Testing Phase QA](#testing-phase-qa)
4. [Deployment Readiness QA](#deployment-readiness-qa)
5. [Post-Deployment QA](#post-deployment-qa)
6. [Phase-Specific Checklists](#phase-specific-checklists)

---

## Pre-Development QA

### Requirements Validation

- [ ] **Task Definition** in Tasklist.md
  - Task ID follows convention (DB.NORTHSTAR.PHASE#)
  - Title clearly describes scope
  - Status set to READY (all dependencies met)
  - `depends_on` correctly lists prerequisite tasks
  - Acceptance criteria are measurable and testable
  
- [ ] **Dependencies Verified**
  - All prerequisite tasks marked DONE
  - Required services deployed and tested
  - Monitoring infrastructure in place
  - Database at expected state (verified via db:cli)

- [ ] **Documentation Review**
  - Schema optimization plan reviewed (docs/schema-northstar-optimization.md)
  - Previous phase completion verified
  - Migration strategy understood
  - Rollback procedure documented

### Environment Preparation

- [ ] **Local Development**
  - PRIMARY LOCAL database running (port 55433)
  - EXPERIMENTAL database configured (port 55434)
  - Environment variables set (IG_ENV_FILE)
  - Database CLI tools available (npm run db:cli)

- [ ] **Tooling Verified**
  - PostgreSQL binaries accessible (psql, pg_dump, pg_restore)
  - Node.js environment configured
  - Dependencies installed (`npm install`)
  - Prisma CLI working (`npx prisma --version`)

---

## Development Phase QA

### Code Quality

- [ ] **SQL Validation**
  - Syntax checked in PostgreSQL-compatible editor
  - All table/column names quoted properly ("User", "Species")
  - Parameters use $1, $2 placeholders (no string concatenation)
  - Validation logic included (DO $$ blocks with RAISE NOTICE/EXCEPTION)
  - Comments explain each step

- [ ] **TypeScript Quality**
  - No `any` types (use proper types from Prisma or define interfaces)
  - All functions have JSDoc comments
  - Error handling implemented (try/catch with logging)
  - Logging includes context (userId, operation, outcome)
  - Return types explicitly declared

- [ ] **Build Verification**
  - TypeScript compiles without errors (`npm run build`)
  - No ESLint warnings (`npm run lint`)
  - Prisma schema valid (`npx prisma validate`)
  - No type errors in IDE

### Migration Files

- [ ] **Directory Structure**
  ```
  prisma/migrations/YYYYMMDDHHMMSS_migration_name/
  ├── migration.sql      (forward migration)
  ├── rollback.sql       (backward migration)
  └── README.md          (comprehensive documentation)
  ```

- [ ] **migration.sql**
  - Includes pre-migration validation (row counts, column checks)
  - Each step has RAISE NOTICE for progress tracking
  - Post-step validation (data integrity checks)
  - Failure conditions trigger RAISE EXCEPTION
  - Idempotent where possible (IF NOT EXISTS, ON CONFLICT DO NOTHING)

- [ ] **rollback.sql**
  - Reverses all changes from migration.sql
  - Tested on EXPERIMENTAL database
  - Includes data restoration logic
  - Validates rollback success (row counts match pre-migration)

- [ ] **README.md**
  - Purpose clearly stated
  - Prerequisites listed with checkboxes
  - Migration overview (3-5 step summary)
  - Data flow diagram (ASCII or Mermaid)
  - Safety measures documented
  - Testing workflow for all 4 tiers
  - Rollback procedure step-by-step
  - Performance impact expectations
  - Troubleshooting section

### Service Code

- [ ] **ProfileService / EventTracker**
  - Uses typed Prisma queries
  - Error handling with graceful degradation
  - Logging at appropriate levels (debug, info, warn, error)
  - No PII exposed in logs
  - Caching strategy implemented
  - Batch operations where applicable

- [ ] **Query Builders (pg-query.ts)**
  - Parameterized queries only
  - Input validation (reject empty WHERE for DELETE)
  - Return types match database schema
  - Documentation includes usage examples

---

## Testing Phase QA

### Tier 1: EXPERIMENTAL Database (Destructive Testing)

- [ ] **Environment Setup**
  - EXPERIMENTAL database running (port 55434)
  - Synced from PRIMARY LOCAL (`npm run ops:sync-experiment-db -- --from local`)
  - Verified data matches PRIMARY LOCAL

- [ ] **Pre-Migration Validation**
  ```bash
  # Verify prerequisite schema
  npm run db:cli -- query "SELECT column_name FROM information_schema.columns WHERE table_name = 'User';" --target experiment
  
  # Capture baseline counts
  npm run db:cli -- count User --target experiment
  npm run db:cli -- count TrainerProfile --target experiment
  ```

- [ ] **Migration Execution**
  ```bash
  psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
    -f prisma/migrations/YYYYMMDDHHMMSS_migration_name/migration.sql
  ```
  - Migration completes without errors
  - All RAISE NOTICE messages appear in console
  - No RAISE EXCEPTION triggered

- [ ] **Post-Migration Validation**
  ```bash
  # Verify data integrity
  npm run db:cli -- count User --target experiment
  npm run db:cli -- query "SELECT COUNT(*) FROM \"User\" WHERE \"tagline\" IS NOT NULL;" --target experiment
  
  # Verify table drops
  npm run db:cli -- query "SELECT table_name FROM information_schema.tables WHERE table_name = 'TrainerProfile';" --target experiment
  ```
  - Row counts match expectations
  - No orphaned records
  - Schema changes applied correctly

- [ ] **Rollback Testing**
  ```bash
  psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
    -f prisma/migrations/YYYYMMDDHHMMSS_migration_name/rollback.sql
  ```
  - Rollback completes without errors
  - Data restored to pre-migration state
  - Row counts match original baseline

- [ ] **Isolation Verification**
  - PRIMARY LOCAL unaffected by EXPERIMENTAL changes
  - Confirmed via db:cli queries on PRIMARY LOCAL

### Tier 2: PRIMARY LOCAL (Production-Like Validation)

- [ ] **Environment Setup**
  - PRIMARY LOCAL database running (port 55433)
  - Synced from Render DEV (`npm run ops:bootstrap-onpremise-dev`)
  - Verified schema matches Render DEV

- [ ] **Migration Execution**
  ```bash
  psql postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db \
    -f prisma/migrations/YYYYMMDDHHMMSS_migration_name/migration.sql
  ```
  - Migration completes without errors
  - Validation checks pass

- [ ] **Application Testing**
  ```bash
  # Run unit tests against PRIMARY LOCAL
  export PROD_DATABASE_URL="postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db"
  npm test
  ```
  - All tests pass
  - No database connection errors
  - Services function correctly with new schema

- [ ] **Performance Validation**
  ```bash
  # Capture performance metrics
  npm run db:cli -- index_usage > primary_local_index_usage.txt
  npm run db:cli -- table_bloat > primary_local_table_bloat.txt
  npm run db:cli -- slow_queries > primary_local_slow_queries.txt
  npm run db:cli -- cache_stats > primary_local_cache_stats.txt
  ```
  - Query latency <500ms for profile queries
  - Cache hit rate >80%
  - Table bloat <20%
  - No new slow queries (>2s)

### Tier 3: DEV Master (Staging Validation)

- [ ] **Pre-Deployment**
  - Maintenance window scheduled
  - Snapshot created:
    ```bash
    pg_dump $DEV_DATABASE_URL \
      --format=custom \
      --file=dev_backup_$(date +%Y%m%d_%H%M%S).dump
    ```
  - Rollback script ready and tested

- [ ] **Migration Execution**
  ```bash
  psql $DEV_DATABASE_URL \
    -f prisma/migrations/YYYYMMDDHHMMSS_migration_name/migration.sql
  ```
  - Migration completes without errors
  - Validation checks pass
  - No errors in Render logs

- [ ] **Service Deployment**
  - Updated services deployed to DEV environment
  - Health checks passing
  - No startup errors

- [ ] **Integration Testing**
  - Discord bot commands functional
  - Profile queries return expected data
  - Event tracking working
  - No errors in application logs

- [ ] **Performance Monitoring (24-48 hours)**
  - Query latency monitored via db:cli slow_queries
  - No regressions detected
  - Cache hit rates stable or improved
  - Table bloat within acceptable range

### Tier 4: PROD Deployment (Production Rollout)

*See Deployment Readiness QA below*

---

## Deployment Readiness QA

### Pre-Deployment Validation

- [ ] **All Lower Tiers Passed**
  - EXPERIMENTAL testing complete
  - PRIMARY LOCAL testing complete
  - DEV Master deployment successful
  - 24-48 hour monitoring period passed

- [ ] **Code Quality Gates**
  - All unit tests passing (`npm test`)
  - No ESLint errors (`npm run lint`)
  - TypeScript compiles (`npm run build`)
  - Prisma schema valid (`npx prisma validate`)

- [ ] **Documentation Complete**
  - Migration README.md comprehensive
  - Tasklist.md updated with progress notes
  - ops/NEXT.yaml points to next READY task
  - Rollback procedure documented and tested

- [ ] **Performance Baseline**
  - Pre-migration metrics captured on PROD
  - Performance targets defined
  - Alert thresholds configured

### Deployment Preparation

- [ ] **Backup & Recovery**
  - Full PROD snapshot created:
    ```bash
    pg_dump $PROD_DATABASE_URL \
      --format=custom \
      --file=prod_backup_$(date +%Y%m%d_%H%M%S).dump
    ```
  - Snapshot stored in secure location (off-database)
  - Restore procedure tested on DEV

- [ ] **Maintenance Window**
  - Low-traffic window scheduled
  - Users notified (if applicable)
  - On-call engineer assigned
  - Rollback decision criteria defined

- [ ] **Deployment Artifacts**
  - migration.sql tested on DEV
  - rollback.sql tested on DEV
  - Service build artifacts ready
  - Deployment runbook prepared

### Execution Checklist

- [ ] **Pre-Migration**
  - Backup created and verified
  - Baseline metrics captured
  - Services in healthy state
  - No active incidents

- [ ] **Migration**
  ```bash
  psql $PROD_DATABASE_URL \
    -f prisma/migrations/YYYYMMDDHHMMSS_migration_name/migration.sql
  ```
  - Migration completes without errors
  - Validation checks pass
  - Downtime within expected window

- [ ] **Service Deployment**
  - Updated services deployed
  - Health checks passing
  - No startup errors
  - Monitoring active

- [ ] **Immediate Validation (0-1 hour)**
  - Discord bot responding
  - Profile queries functional
  - Event tracking working
  - Error rates normal (<0.1%)

---

## Post-Deployment QA

### Short-Term Monitoring (1-24 hours)

- [ ] **Error Tracking**
  - No database connection errors
  - No query timeout errors
  - Error rate <0.1%
  - No critical alerts

- [ ] **Performance Metrics**
  ```bash
  # Check every 1 hour for first 24 hours
  npm run db:cli -- slow_queries
  npm run db:cli -- cache_stats
  ```
  - Query latency <500ms for profile queries
  - Cache hit rate >80%
  - No new slow queries

- [ ] **Application Health**
  - Discord bot responsive
  - Commands executing successfully
  - No user-reported issues
  - Logs show expected patterns

### Medium-Term Validation (1-7 days)

- [ ] **Performance Trends**
  - Query latency stable or improved
  - Cache hit rates sustained
  - Table bloat within limits (<20%)
  - Index usage as expected

- [ ] **Data Integrity**
  - No orphaned records detected
  - Foreign key constraints intact
  - Data consistency validated
  - No duplicate entries

- [ ] **System Stability**
  - No memory leaks
  - No connection pool exhaustion
  - Disk usage stable
  - CPU usage within normal range

### Long-Term Monitoring (7+ days)

- [ ] **Success Criteria Met**
  - Performance targets achieved
  - No rollback required
  - User satisfaction maintained
  - Technical debt reduced

- [ ] **Documentation Updated**
  - Tasklist.md marked DONE with outcome notes
  - ops/NEXT.yaml points to next task
  - Lessons learned documented
  - Runbook updated

- [ ] **Cleanup**
  - Rollback script archived (keep for 30 days)
  - Backup snapshot retained (30-day retention)
  - Monitoring alerts adjusted
  - Next phase planning initiated

---

## Phase-Specific Checklists

### Phase 1: Additive Changes

**Additional Validations:**

- [ ] New columns added with NULL defaults
- [ ] New tables created with proper foreign keys
- [ ] New indexes created without blocking queries
- [ ] Prisma schema updated and generated
- [ ] No impact on existing queries

**Rollback Validation:**

- [ ] DROP COLUMN statements work
- [ ] DROP TABLE statements work
- [ ] DROP INDEX statements work
- [ ] No data loss

### Phase 2: Data Migration & Consolidation

**Additional Validations:**

- [ ] Source data fully migrated (row counts match)
- [ ] No orphaned records
- [ ] Foreign keys updated correctly
- [ ] Redundant tables dropped successfully
- [ ] Application code updated and deployed

**Rollback Validation:**

- [ ] Table recreation works
- [ ] Data restore complete
- [ ] Foreign keys re-established
- [ ] Application code compatible with rollback

### Phase 3: Schema Cleanup

**Additional Validations:**

- [ ] NOT NULL constraints added without violations
- [ ] Deprecated columns dropped
- [ ] Unused indexes removed
- [ ] Legacy service code removed
- [ ] Final schema matches Northstar design

**Rollback Validation:**

- [ ] Constraints can be removed
- [ ] Columns can be re-added with data
- [ ] Indexes can be recreated
- [ ] Services handle rollback gracefully

---

## Failure Response Matrix

| Failure Type | Severity | Response | Timeline |
| --- | --- | --- | --- |
| **Data loss detected** | CRITICAL | IMMEDIATE ROLLBACK | <5 minutes |
| **Migration error** | CRITICAL | IMMEDIATE ROLLBACK | <5 minutes |
| **Query latency >5s** | CRITICAL | IMMEDIATE ROLLBACK | <10 minutes |
| **Cache hit rate <40%** | HIGH | Investigate → Rollback if not resolved | <30 minutes |
| **Query latency >2s** | HIGH | Optimize indexes → Rollback if not resolved | <1 hour |
| **Table bloat >50%** | MEDIUM | VACUUM FULL + monitor | <24 hours |
| **Slow query (rare)** | LOW | Optimize query plan | <1 week |
| **Minor index unused** | LOW | Document for next cleanup | Next phase |

---

## Sign-Off Template

### Phase Completion Sign-Off

```markdown
# Northstar Phase X — QA Sign-Off

**Phase:** DB.NORTHSTAR.PHASEХ  
**Date:** YYYY-MM-DD  
**QA Engineer:** [Name]

## Pre-Development QA
- [x] Requirements validated
- [x] Dependencies met
- [x] Environment prepared

## Development Phase QA
- [x] Code quality verified
- [x] Migration files complete
- [x] Service code reviewed

## Testing Phase QA
- [x] Tier 1 (EXPERIMENTAL) — PASSED
- [x] Tier 2 (PRIMARY LOCAL) — PASSED
- [x] Tier 3 (DEV Master) — PASSED
- [x] Tier 4 (PROD) — PASSED

## Deployment Readiness QA
- [x] All quality gates passed
- [x] Backup created and verified
- [x] Deployment runbook prepared

## Post-Deployment QA
- [x] Short-term monitoring (24 hours) — PASSED
- [x] Medium-term validation (7 days) — PASSED
- [x] Success criteria met

## Performance Results
- Query latency: [X]ms (target <500ms) ✅
- Cache hit rate: [X]% (target >80%) ✅
- Table bloat: [X]% (target <20%) ✅

## Rollback Status
- Rollback tested: YES
- Rollback script location: prisma/migrations/.../rollback.sql
- Backup retention: 30 days

## Sign-Off
- [x] Phase ready for production deployment
- [x] All acceptance criteria met
- [x] Documentation complete

**Approved by:** [Name]  
**Date:** YYYY-MM-DD  
**Next Phase:** DB.NORTHSTAR.PHASEХ+1
```

---

## Revision History

- **2025-11-08T21:30:00Z** — Initial QA checklist (Rev 1.0)

---

## Related Documents

- `docs/northstar-methodology.md` — Methodology and standards
- `docs/schema-northstar-optimization.md` — Overall Northstar plan
- `docs/query-optimization-guide.md` — Performance monitoring
- `ops/DB_BOOTSTRAP.md` — Migration runbook
- `Tasklist.md` — Phase 15 tasks

