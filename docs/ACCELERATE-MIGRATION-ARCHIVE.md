# Prisma Accelerate Migration Archive

**Status**: Historical Reference Only  
**Date**: November 7, 2025  
**Migration**: Prisma Accelerate → 2-Node Direct PostgreSQL Cluster

## Purpose

This document catalogs files containing historical Prisma Accelerate references. These files are **archived for historical reference** and document the migration process. They should NOT be updated to remove Accelerate references as they serve as historical documentation of the architecture evolution.

## Archived Documentation (Historical Reference)

### Migration Documentation
- `docs/2-node-cluster-migration.md` - Documents the Accelerate → 2-node cluster migration
- `docs/2-node-cluster-automation.md` - Automation changes during migration
- `PRISMA-ACCELERATE-REMOVAL.md` - Critical production fix documentation
- `DEPLOYMENT-STATUS.md` - Deployment history and Accelerate removal timeline
- `DEPLOYMENT-CHECKLIST.md` - Migration checklist (completed)
- `AUTOMATION-SUMMARY.md` - Automation changes summary
- `SANITY-CHECK-REPORT.md` - Post-migration validation report

### Historical Completion Reports
- `docs/northstar-phase1-completion.md` - Northstar Phase 1 completion (includes Accelerate DDL discovery)
- `env-variable-grep-report.md` - Environment variable audit (pre-migration)

### Operational Runbooks (Legacy - Use with Caution)

**⚠️ WARNING**: The following runbooks describe **outdated Prisma Accelerate workflows**. They are preserved for historical reference only. For current operational procedures, see:
- `docs/database-systems.md` (Rev 2.0) - Current 2-node cluster architecture
- `AGENTS.md` - Current agent operations guide
- `ops/DB_BOOTSTRAP.md` - Current database bootstrap procedures

#### Archived Runbooks:
- `ops/DB_IMPORT_PRISMA_POSTGRES.md` - Prisma Postgres (Accelerate-backed) import workflow
- `docs/db-accelerate-workflow.md` - Direct vs. Accelerate database workflow guide
- `docs/database-url-selection.md` - URL selection logic (includes Accelerate mode)
- `docs/database-configuration.md` - Database configuration (includes Accelerate setup)
- `docs/DATABASE-CONFIG-REFERENCE.md` - Config reference (includes Accelerate URLs)
- `docs/ai-env-setup.md` - AI environment setup (includes Accelerate switching)
- `docs/db-control-suite.md` - Database control suite (includes Accelerate mode)
- `docs/WORKSTATION-GAMEPLAY-SETUP.md` - Workstation setup (includes Accelerate references)
- `docs/db-replication-architecture.md` - Replication architecture (describes Accelerate as PROD)
- `docs/db-replication-runbook.md` - Replication runbook (Accelerate workflows)

#### Partially Archived:
- `ops/DB_BOOTSTRAP.md` - Contains both current procedures and legacy Accelerate warnings (see CRITICAL section from 2025-11-06)
- `Prompt.md` - Operational prompt with historical Accelerate references in change log
- `masterroutetable.md` - Master route table with some legacy Accelerate references in historical notes
- `Tasklist.md` - Task ledger with historical Accelerate completion records

## Current Architecture (As of 2025-11-07)

**2-Node Direct PostgreSQL Cluster:**
- **DEV (Master)**: Source of truth for migrations (`DEV_DATABASE_URL` or `RENDER_DB_EXTERNAL_URL`)
- **PROD (Local Node)**: Primary node for live gameplay with <50ms latency (`PROD_DATABASE_URL`)
- **LOCAL (Optional)**: Offline workstation mirror (`DATABASE_LOCAL_URL`)

**Key Changes:**
- ❌ Removed: Prisma Accelerate proxy layer
- ❌ Removed: `DATABASE_URL` (Accelerate), `DATABASE_ACCELERATE_URL`
- ✅ Added: `DEV_DATABASE_URL` (master), `PROD_DATABASE_URL` (primary)
- ✅ All connections use direct PostgreSQL (`postgresql://` URLs)
- ✅ Zero proxy layer, <50ms latency for gameplay

## Migration Timeline

- **2025-11-06**: Prisma Accelerate account hold (P6003: planLimitReached)
- **2025-11-07 12:15**: CRITICAL FIX - Removed Accelerate schema configuration (commit d87e5a0)
- **2025-11-07 14:00-16:00**: Phase 1 - Removed all Accelerate code (6 commits, ~200 lines)
- **2025-11-07 16:00-18:00**: Phase 2 - Updated critical documentation (4 commits)
- **2025-11-07 18:00+**: Phase 3 - Ongoing comprehensive documentation updates

## Files Updated (Clean - No Accelerate References)

### Phase 1: Code Cleanup (6 commits)
- `scripts/check_db_redundancy.ts`
- `scripts/db_admin.ts`
- `src/shared/config.ts`
- `src/shared/prisma.ts` (96 lines removed)
- `scripts/dev_prod_auto_sync.ts`
- `scripts/db_smoke.ts`
- `scripts/db_mirror_checks.ts`
- `src/types/prisma-accelerate.d.ts` (deleted)
- `src/services/db-replication/sync.ts`
- `src/env/ensure-db-url.ts`

### Phase 2: Critical Documentation (4 commits)
- `docs/database-systems.md` (Rev 2.0 - authoritative reference)
- `AGENTS.md` (agent operations guide)
- `Patch.md` (AI contract - Absolutes updated)
- Removed 10 -Sensai.md duplicates

### Phase 3: Root Documentation (1 commit so far)
- `README.md`
- `secrets/README.md`

## Guidance for AI Agents

When encountering Accelerate references in documentation:

1. **Check this archive first** - If the file is listed here, it's intentionally preserved for historical reference
2. **For current operations** - Consult `docs/database-systems.md` (Rev 2.0), `AGENTS.md`, or `Patch.md`
3. **For runbooks** - Verify the file is NOT in the "Archived Runbooks" section before following procedures
4. **For migration context** - Historical docs provide valuable context but should not be used for current workflows

## See Also

- `docs/database-systems.md` (Rev 2.0) - **CURRENT** authoritative database architecture reference
- `AGENTS.md` - **CURRENT** agent operations guide
- `Patch.md` - **CURRENT** AI project manager contract
- `README.md` - **CURRENT** repository overview and quickstart
