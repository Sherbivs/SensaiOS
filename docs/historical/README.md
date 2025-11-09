# 2-Node Cluster Architecture - Historical Archive

**Archived Date**: 2025-11-08  
**Location**: `docs/historical/` (root-level obsolete documentation)  
**Reason**: Architecture migrated from 2-node cluster to unified Render-managed PostgreSQL  
**Status**: Historical reference only - DO NOT USE for current operations

---

## What Changed

**Old Architecture (2-Node Cluster)**:
- DEV Master: Render managed PostgreSQL (schema migrations source)
- PROD Local: Worker Node PostgreSQL on persistent disk (live gameplay <50ms)
- Bidirectional sync: DEV→PROD (migrations), PROD→DEV (gameplay data)

**New Architecture (Unified Render PostgreSQL)**:
- Single managed database: `infinity-gauntlet-db`
- All services connect to same database via internal URL
- No local PostgreSQL instances on worker nodes
- No replication needed (all services share one source of truth)

---

## Archived Files

### 1. PRISMA-ACCELERATE-REMOVAL.md
- **Date**: 2025-11-07
- **Content**: Documents removal of Prisma Accelerate proxy and transition to direct PostgreSQL
- **Why Archived**: References 2-node cluster architecture (DEV master + PROD local)
- **Historical Value**: Shows migration from Accelerate → 2-node cluster → unified architecture

### 2. DEPLOYMENT-STATUS.md
- **Date**: 2025-11-07
- **Content**: Production deployment readiness checklist for 2-node cluster
- **Why Archived**: Deployment checklist references PROD_DATABASE_URL (127.0.0.1:55433) and bootstrap scripts
- **Historical Value**: Deployment validation procedures and monitoring plan

### 3. DEPLOYMENT-CHECKLIST.md
- **Date**: 2025-11-07
- **Content**: Comprehensive 2-node cluster deployment checklist with rollback procedures
- **Why Archived**: **CRITICAL** - References obsolete localhost PostgreSQL (127.0.0.1:55433), DEV master + PROD local architecture, and Prisma Accelerate rollback steps
- **Historical Value**: Complete deployment workflow including pre-deployment verification, service deployment steps, and emergency rollback procedures
- **WARNING**: DO NOT USE for production - rollback procedures reference obsolete architecture

### 4. SANITY-CHECK-REPORT.md
- **Date**: 2025-11-07
- **Content**: Comprehensive repository sanity check after 2-node cluster automation
- **Why Archived**: Extensive documentation of 2-node cluster environment variables, bootstrap script, and localhost validation
- **Historical Value**: Complete test results (292/294 passing) and validation procedures for 2-node architecture

### 5. AUTOMATION-SUMMARY.md
- **Date**: 2025-11-23
- **Content**: Completion summary for 2-node cluster automation (bootstrap script, auto-sync, Render integration)
- **Why Archived**: Documents automation of PROD PostgreSQL initialization on worker nodes (no longer used)
- **Historical Value**: Script update documentation with before/after comparisons, bootstrap features breakdown

### 6. env-variable-grep-report.md
- **Date**: 2025-01-XX
- **Content**: Environment variable standardization report (DATABASE_POOL_URL, DATABASE_DIRECT_URL migration)
- **Why Archived**: Documents pre-2-node-cluster variable schema (Accelerate era)
- **Historical Value**: Shows evolution: Accelerate → direct PostgreSQL → 2-node cluster → unified architecture

---

## Why the Architecture Changed

**Problems with 2-Node Cluster:**
1. **Complexity**: Required PostgreSQL installation and management on every Render worker node
2. **Disk Usage**: Each service needed 2GB persistent disk for local database
3. **Replication Overhead**: Continuous bidirectional sync (DEV↔PROD) added complexity
4. **Deployment Time**: Bootstrap script added 30-60 seconds to every deployment
5. **Maintenance**: Multiple PostgreSQL instances to monitor, backup, and troubleshoot

**Benefits of Unified Architecture:**
1. **Simplicity**: One database, one URL, no replication
2. **Reliability**: Render-managed database with automatic backups and HA
3. **Performance**: Internal network access still fast (<100ms)
4. **Cost**: No persistent disks needed (save 2GB × 5 services = 10GB)
5. **Maintainability**: Single point of management, easier monitoring

**Decision**: Render's internal network (RENDER_DB_INTERNAL_URL) provides sufficient performance (<100ms latency) for gameplay operations, eliminating the need for local PostgreSQL instances on worker nodes.

---

## Migration Timeline

1. **2025-11-06**: 2-node cluster migration started (commits 69211ec → e7fe7ad)
2. **2025-11-07**: Automation completed (commits f910981, a85c322, a0a721e)
3. **2025-11-07**: Production fixes (commits 182a54b, e390706, d87e5a0)
4. **2025-11-08**: Unified architecture migration (simplified to single Render database)

---

## Current Architecture Reference

**For current architecture documentation, see:**
- `AGENTS.md` - Unified Render-managed PostgreSQL architecture
- `README.md` - Phase 9 achievements (unified database)
- `secrets/Infinity-Gauntlet.env` - Current environment variable schema
- `docs/database-url-selection.md` - Canonical URL selection logic

**Current Environment Variables:**
- `DATABASE_URL` - Primary connection (internal network)
- `DEV_DATABASE_URL` - Migrations (external access)
- `PROD_DATABASE_URL` - Runtime (internal network)
- `RENDER_DB_INTERNAL_URL` - Internal access (production)
- `RENDER_DB_EXTERNAL_URL` - External access (laptop)

All URLs point to the **same Render-managed PostgreSQL database** (`infinity-gauntlet-db`).

---

## What to Do If You Find References

If you encounter references to 2-node cluster architecture in active code:

1. **Scripts**: Update to use unified architecture (single DATABASE_URL)
2. **Documentation**: Point to current architecture docs (AGENTS.md, README.md)
3. **Tests**: Update expectations to unified database model
4. **Environment files**: Remove PROD_DATABASE_URL localhost references

**DO NOT** attempt to restore 2-node cluster architecture - it has been deprecated in favor of unified Render-managed PostgreSQL.

---

## Questions?

For questions about:
- **Current architecture**: See `AGENTS.md` section "Database URL Selection"
- **Migration history**: Review git commits from 2025-11-06 to 2025-11-08
- **Historical context**: Read archived files in this directory

---

**Archive Status**: FINAL - No further updates planned  
**Replacement Docs**: AGENTS.md, README.md, docs/database-url-selection.md
