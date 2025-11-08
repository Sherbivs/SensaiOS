# Dual On-Premise Database Architecture

**Last Updated (UTC):** 2025-11-08T19:00:00Z  
**Status:** READY for Implementation  
**Purpose:** Two independent on-premise PostgreSQL databases for replication testing and experimental development

## Overview

The dual-local-database architecture provides **two PostgreSQL clusters** on the workstation:

1. **ONPREMISE-DEV-PRIMARY DB** (`DATABASE_ONPREMISE_DEV_PRIMARY`) — Port **55433**
   - Downloads data from DEV master (one-way sync, PULL only)
   - **OFFLINE:** Not visible to production, not accessible from cloud
   - Used for local development and testing with production-like data
   - Automatically pulls from DEV master every 5 minutes (optional, can disable)
   - **Cannot push changes back to DEV** — read-only sync

2. **ONPREMISE-DEV-EXPERIMENT** (`DATABASE_ONPREMISE_DEV_EXPERIMENT`) — Port **55434**
   - Independent clone from ONPREMISE-DEV-PRIMARY (manual sync only)
   - **OFFLINE:** Not visible to production, not accessible from cloud
   - Used for testing migrations before applying to DEV
   - **Does NOT sync automatically** — completely isolated
   - Safe for destructive operations (DROP TABLE, schema experiments)

## Architecture Diagram

```
Cloud Databases              Workstation (OFFLINE - NOT VISIBLE TO PRODUCTION)
---------------              ------------------------------------------------

DEV Master (Render) ───┐     ONPREMISE-DEV-PRIMARY DB
(Source of truth)      │     Port: 55433
                       │     Store: Store/onpremise-dev-primary/
PROD Node (Render)     │     URL: DATABASE_ONPREMISE_DEV_PRIMARY
(Production gameplay)  │     Sync: PULL ONLY from DEV (one-way)
                       │     Purpose: Offline testing/development
                       │              │
                       ▼              │ Manual Clone
                  Downloads to        ▼
                  workstation    ONPREMISE-DEV-EXPERIMENT
                                 Port: 55434
                                 Store: Store/onpremise-dev-experiment/
                                 URL: DATABASE_ONPREMISE_DEV_EXPERIMENT
                                 Sync: MANUAL clone from ONPREMISE-DEV-PRIMARY
                                 Purpose: Migration testing (isolated)

                                 │
                                 │ EXPLICIT PUSH (when ready)
                                 ▼
                            Upload to DEV Master
                            (migrations, schema changes)
                            DEV Master then replicates to PROD Node
```

**CRITICAL:** Both on-premise databases are **completely offline and isolated**. The production node (PROD) cannot see or access either on-premise database. Changes only reach production when you **explicitly push migrations to DEV Master**, which then replicates to PROD Node.

## Environment Variables

### secrets/Infinity-Gauntlet.env

```bash
# ONPREMISE-DEV-PRIMARY database (participates in replication)
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db

# On-premise experimental database (independent clone)
DATABASE_ONPREMISE_DEV_EXPERIMENT=postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment
```

### Variable Purposes

| Variable | Port | Store Path | Cloud Access | Purpose |
| --- | --- | --- | --- | --- |
| `DATABASE_ONPREMISE_DEV_PRIMARY` | 55433 | `Store/onpremise-dev-primary/` | **NONE (offline)** | Local development, pulls from DEV (one-way) |
| `DATABASE_ONPREMISE_DEV_EXPERIMENT` | 55434 | `Store/onpremise-dev-experiment/` | **NONE (offline)** | Migration testing, isolated experiments |

**IMPORTANT:** Neither on-premise database is visible to production nodes. Changes reach production only when you:
1. Test migration on ONPREMISE-DEV-EXPERIMENT (port 55434)
2. Validate migration on ONPREMISE-DEV-PRIMARY DB (port 55433)
3. **Explicitly push migration to DEV Master** (via `psql` or `prisma migrate deploy`)
4. DEV Master replicates changes to PROD Node automatically

## When to Use Each Database

### Use ONPREMISE-DEV-PRIMARY DB When:
- ✅ Testing locally with production-like data (offline)
- ✅ Pulling latest schema/data from DEV master for local development
- ✅ Running queries that don't require cloud access
- ✅ Validating migrations after testing on EXPERIMENTAL
- ✅ Developing features that need real data structures

### Use ONPREMISE-DEV-EXPERIMENT When:
- ✅ Testing Phase 2 migration **before** pushing to DEV
- ✅ Experimenting with schema changes (completely isolated)
- ✅ Testing destructive operations (DROP TABLE, etc.)
- ✅ Prototyping new features with schema modifications
- ✅ Running migration rollback tests
- ✅ Testing data migration scripts
- ✅ Learning new SQL patterns without risk

**KEY POINT:** Test migrations on EXPERIMENTAL → Validate on ONPREMISE-DEV-PRIMARY → **Push to DEV Master** → DEV replicates to PROD

## Operational Workflows

### Workflow 1: Bootstrap Both Databases

```bash
# Step 1: Bootstrap ONPREMISE-DEV-PRIMARY database (if not exists)
npm run ops:bootstrap-onpremise-dev

# Step 2: Bootstrap On-premise experimental database (clones from ONPREMISE-DEV-PRIMARY)
npm run ops:bootstrap-onpremise-experiment

# Step 3: Verify both databases running
npm run ops:status-onpremise-dbs
```

**Expected Output:**
```
ONPREMISE-DEV-PRIMARY DB (port 55433)
  Status: ✅ Running
  URL: postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
  Rows: User=10, Species=1025, PokemonInstance=50
  Last Sync: 2025-11-08T18:55:00Z (auto, 5min ago)

ONPREMISE-DEV-EXPERIMENT (port 55434)
  Status: ✅ Running
  URL: postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment
  Rows: User=10, Species=1025, PokemonInstance=50
  Last Sync: 2025-11-08T19:00:00Z (manual, just now)
```

### Workflow 2: Test Migration on ONPREMISE-DEV-EXPERIMENT

```bash
# Step 1: Ensure ONPREMISE-DEV-EXPERIMENT has fresh data (from ONPREMISE-DEV-PRIMARY)
npm run ops:sync-onpremise-experiment --from local

# Step 2: Run migration on ONPREMISE-DEV-EXPERIMENT (ISOLATED TEST)
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql

# Step 3: Verify migration success (on experimental only)
npm run db:cli -- count TrainerProfile --target experiment
# Expected: 0 rows (table dropped)

npm run db:cli -- query "SELECT COUNT(*) FROM \"User\" WHERE tagline IS NOT NULL" --target experiment
# Expected: Row count matches original TrainerProfile count

# Step 4: Test rollback on ONPREMISE-DEV-EXPERIMENT
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/rollback.sql

# Step 5: Verify rollback success
npm run db:cli -- count TrainerProfile --target experiment
# Expected: Original row count restored

# Step 6: If tests pass, apply to ONPREMISE-DEV-PRIMARY DB (still offline)
npm run ops:sync-onpremise-experiment --from local  # Refresh experiment
psql postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql

# Step 7: ONLY AFTER LOCAL VALIDATION - Push to DEV Master
psql $DEV_DATABASE_URL \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql
# DEV Master will then replicate to PROD Node automatically
```

**CRITICAL:** Steps 1-6 are **completely offline**. Production cannot see your changes until Step 7 (explicit push to DEV Master).

### Workflow 3: Sync ONPREMISE-DEV-EXPERIMENT from ONPREMISE-DEV-PRIMARY

```bash
# Refresh ONPREMISE-DEV-EXPERIMENT with latest local data (OFFLINE operation)
npm run ops:sync-onpremise-experiment --from local

# Alternative: Sync from DEV master (downloads from cloud)
npm run ops:sync-onpremise-experiment --from dev

# Alternative: Sync from PROD (downloads production snapshot)
npm run ops:sync-onpremise-experiment --from prod
```

**Sync Process (ALL OFFLINE until --from dev/prod):**
1. Take snapshot of source database (local=offline, dev/prod=downloads from cloud)
2. Stop On-premise experimental database cluster (pg_ctl stop)
3. Clear On-premise experimental database directory
4. Restore snapshot to On-premise experimental database
5. Start On-premise experimental database cluster (pg_ctl start)
6. Log sync timestamp and row counts

**IMPORTANT:** Only `--from dev` or `--from prod` connect to cloud. `--from local` is 100% offline.

### Workflow 4: Start/Stop Databases Independently

```bash
# Start ONPREMISE-DEV-PRIMARY database
npm run ops:start-local-db

# Start On-premise experimental database
npm run ops:start-onpremise-experiment

# Stop ONPREMISE-DEV-PRIMARY database (WARNING: Stops replication)
npm run ops:stop-local-db

# Stop On-premise experimental database (safe, no replication impact)
npm run ops:stop-onpremise-experiment

# Check status of both databases
npm run ops:status-onpremise-dbs
```

### Workflow 5: Performance Monitoring on Both Databases

```bash
# Monitor ONPREMISE-DEV-PRIMARY database (default)
npm run db:cli -- index_usage
npm run db:cli -- table_bloat
npm run db:cli -- slow_queries
npm run db:cli -- cache_stats

# Monitor On-premise experimental database
npm run db:cli -- index_usage --target experiment
npm run db:cli -- table_bloat --target experiment
npm run db:cli -- slow_queries --target experiment
npm run db:cli -- cache_stats --target experiment

# Compare performance between databases
npm run db:cli -- databases  # Lists all databases with stats
```

## Storage Management

### Directory Structure

```
Store/
├── db/                           # ONPREMISE-DEV-PRIMARY DB (55433)
│   ├── pg_data/                  # PostgreSQL cluster data
│   ├── logs/                     # PostgreSQL logs
│   ├── snapshots/                # Timestamped backups
│   │   ├── 20251108_120000/
│   │   ├── 20251108_140000/
│   │   └── 20251108_160000/
│   ├── local-url.txt             # DATABASE_ONPREMISE_DEV_PRIMARY
│   └── metadata.json             # Last sync, row counts
│
└── db-experiment/                # ONPREMISE-DEV-EXPERIMENT (55434)
    ├── pg_data/                  # PostgreSQL cluster data
    ├── logs/                     # PostgreSQL logs
    ├── snapshots/                # Manual backups only
    ├── experiment-url.txt        # DATABASE_ONPREMISE_DEV_EXPERIMENT
    └── metadata.json             # Last sync, row counts
```

### Storage Quotas

| Database | Estimated Size | Snapshots | Total Storage |
| --- | --- | --- | --- |
| ONPREMISE-DEV-PRIMARY | ~50 MB | 3 recent (7-day retention) | ~200 MB |
| EXPERIMENTAL | ~50 MB | On-demand only | ~50 MB |
| **Total** | | | **~250 MB** |

**Note:** On-premise experimental database does NOT auto-snapshot. Create manual backups before destructive operations:

```bash
# Manual snapshot of ONPREMISE-DEV-EXPERIMENT
pg_dump postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -F c -f Store/onpremise-dev-experiment/snapshots/manual_$(date +%Y%m%d_%H%M%S).dump
```

## Port Allocation

| Database | Port | Conflicts | Resolution |
| --- | --- | --- | --- |
| ONPREMISE-DEV-PRIMARY | **55433** | None (custom port) | Change `--port` flag in bootstrap script |
| EXPERIMENTAL | **55434** | None (custom port) | Change `--port` flag in bootstrap script |

**Checking Port Availability:**

```powershell
# Check if port 55433 is in use
Test-NetConnection -ComputerName localhost -Port 55433

# Check if port 55434 is in use
Test-NetConnection -ComputerName localhost -Port 55434
```

## Recovery Procedures

### Scenario 1: ONPREMISE-DEV-PRIMARY DB Corrupted

```bash
# Option A: Restore from DEV master (recommended)
npm run ops:bootstrap-onpremise-dev --source dev

# Option B: Restore from recent snapshot
npm run ops:bootstrap-onpremise-dev --restore Store/onpremise-dev-primary/snapshots/20251108_160000
```

### Scenario 2: ONPREMISE-DEV-EXPERIMENT Corrupted

```bash
# Option A: Re-clone from ONPREMISE-DEV-PRIMARY (recommended)
npm run ops:bootstrap-onpremise-experiment --source local

# Option B: Restore from manual backup
pg_restore -h localhost -p 55434 -U postgres -d infinity_gauntlet_experiment \
  -c Store/onpremise-dev-experiment/snapshots/manual_20251108_180000.dump
```

### Scenario 3: Both Databases Corrupted

```bash
# Step 1: Rebuild ONPREMISE-DEV-PRIMARY from DEV master
npm run ops:bootstrap-onpremise-dev --source dev

# Step 2: Rebuild EXPERIMENTAL from new ONPREMISE-DEV-PRIMARY
npm run ops:bootstrap-onpremise-experiment --source local

# Step 3: Verify both databases
npm run ops:status-onpremise-dbs
```

### Scenario 4: Need to Reset ONPREMISE-DEV-EXPERIMENT

```bash
# Quick reset: Re-clone from ONPREMISE-DEV-PRIMARY
npm run ops:sync-onpremise-experiment --from local

# Complete rebuild: Bootstrap fresh
npm run ops:stop-onpremise-experiment
rm -rf Store/onpremise-dev-experiment/pg_data
npm run ops:bootstrap-onpremise-experiment --source local
```

## Safety Best Practices

### DO ✅

- **Test all migrations on EXPERIMENTAL first** before applying to ONPREMISE-DEV-PRIMARY or cloud
- **Keep ONPREMISE-DEV-PRIMARY synced** with DEV master via periodic pulls (optional auto-sync)
- **Create manual snapshots** before destructive operations on EXPERIMENTAL
- **Use `--target experiment`** flag when testing risky queries
- **Verify rollback scripts** on EXPERIMENTAL before trusting them
- **Document experiment outcomes** in Tasklist.md or migration docs
- **Stop EXPERIMENTAL when not in use** (saves CPU/memory)
- **Remember both databases are OFFLINE** — changes don't reach production until explicit push to DEV

### DON'T ❌

- **DON'T run DROP TABLE on ONPREMISE-DEV-PRIMARY** without testing on EXPERIMENTAL first
- **DON'T expect production to see local changes** — they're completely offline
- **DON'T push migrations to DEV Master** without testing on EXPERIMENTAL → ONPREMISE-DEV-PRIMARY first
- **DON'T use EXPERIMENTAL for production-like gameplay** (data may be stale)
- **DON'T share on-premise database URLs** (localhost-only access, not accessible from cloud)
- **DON'T rely on EXPERIMENTAL for data integrity** (can be reset anytime)
- **DON'T run migrations on ONPREMISE-DEV-PRIMARY** before testing on EXPERIMENTAL
- **DON'T forget both on-premise databases are isolated** — PROD node cannot access them

## Migration Testing Strategy (Phase 2 Example)

### Step-by-Step: Testing Phase 2 Migration (OFFLINE → Cloud Push)

**Day 1: Experimental Testing (100% OFFLINE)**
1. ✅ Sync EXPERIMENTAL from ONPREMISE-DEV-PRIMARY: `npm run ops:sync-onpremise-experiment --from local`
2. ✅ Snapshot EXPERIMENTAL manually: `pg_dump ... -f manual_pre_phase2.dump`
3. ✅ Run migration.sql on EXPERIMENTAL: `psql ... -f migration.sql`
4. ✅ Verify data integrity: Check row counts, TrainerProfile dropped, User columns populated
5. ✅ Test rollback.sql on EXPERIMENTAL: `psql ... -f rollback.sql`
6. ✅ Verify rollback success: TrainerProfile restored, data matches snapshot
7. ✅ Document results in Tasklist.md

**Day 2: ONPREMISE-DEV-PRIMARY Testing (100% OFFLINE)**
1. ✅ Sync EXPERIMENTAL again: `npm run ops:sync-onpremise-experiment --from local`
2. ✅ Re-run migration.sql on EXPERIMENTAL (final rehearsal)
3. ✅ Snapshot ONPREMISE-DEV-PRIMARY: Automatic or manual `pg_dump`
4. ✅ Run migration.sql on ONPREMISE-DEV-PRIMARY: `psql ... -f migration.sql`
5. ✅ Verify data integrity on ONPREMISE-DEV-PRIMARY
6. ✅ Test queries locally (still offline)
7. ✅ Monitor performance: `npm run db:cli -- slow_queries`

**Day 3: DEV Master Push (CLOUD OPERATION)**
1. ✅ Take snapshot of DEV master: `pg_dump $DEV_DATABASE_URL -f dev_pre_phase2.dump`
2. ✅ **EXPLICIT PUSH:** Run migration.sql on DEV master: `psql $DEV_DATABASE_URL -f migration.sql`
3. ✅ Verify data integrity on DEV
4. ✅ Optionally pull changes to ONPREMISE-DEV-PRIMARY: `npm run ops:bootstrap-onpremise-dev --source dev`
5. ✅ Verify ONPREMISE-DEV-PRIMARY reflects DEV state (if pulled)

**Day 4: PROD Deployment (AUTOMATIC from DEV)**
1. ✅ DEV Master automatically replicates to PROD Node (if configured)
2. ✅ OR manually push to PROD: `psql $PROD_DATABASE_URL -f migration.sql` (during maintenance)
3. ✅ Verify data integrity on PROD
4. ✅ Deploy code updates with new schema
5. ✅ Monitor error rates and performance for 24 hours

**KEY INSIGHT:** Days 1-2 are **completely offline**. Production sees nothing until Day 3 explicit push to DEV Master.

## Troubleshooting

### Issue: ONPREMISE-DEV-EXPERIMENT won't start

```bash
# Check PostgreSQL logs
cat Store/onpremise-dev-experiment/logs/postgres.log

# Common causes:
# 1. Port 55434 in use → Change port in bootstrap script
# 2. Corrupt pg_data → Delete and re-bootstrap
# 3. Permissions issue → Check Store/onpremise-dev-experiment/ ownership
```

### Issue: Sync fails with connection error

```bash
# Verify source database is reachable
psql $DEV_DATABASE_URL -c "SELECT 1"  # Test DEV master
psql $DATABASE_ONPREMISE_DEV_PRIMARY -c "SELECT 1"  # Test ONPREMISE-DEV-PRIMARY

# Check pg_dump/pg_restore binaries
which pg_dump
which pg_restore

# Ensure PG_BIN_DIR is set
echo $Env:PG_BIN_DIR  # PowerShell
```

### Issue: ONPREMISE-DEV-PRIMARY and EXPERIMENTAL out of sync

```bash
# Compare row counts
npm run db:cli -- counts  # ONPREMISE-DEV-PRIMARY (default)
npm run db:cli -- counts --target experiment  # EXPERIMENTAL

# If mismatch, sync EXPERIMENTAL from ONPREMISE-DEV-PRIMARY
npm run ops:sync-onpremise-experiment --from local
```

## Success Criteria

After implementing dual-local-database architecture:

- [ ] Both databases running independently (ports 55433, 55434)
- [ ] ONPREMISE-DEV-PRIMARY auto-syncs with DEV master every 5 minutes
- [ ] On-premise experimental database does NOT auto-sync (manual only)
- [ ] Migration testing workflow documented and validated
- [ ] npm scripts available for all operations (bootstrap, sync, start, stop, status)
- [ ] db:cli supports `--target experiment` flag for all commands
- [ ] Storage quotas respected (~250 MB total)
- [ ] Recovery procedures tested and documented
- [ ] Phase 2 migration tested on EXPERIMENTAL before LOCAL/DEV deployment

## Next Steps

1. **Implement bootstrap_experiment_db.ts** — Create On-premise experimental database from local snapshot
2. **Implement sync_experiment_db.ts** — Refresh On-premise experimental database from local/dev/prod
3. **Update db_admin.ts** — Add `--target` flag for dual-local support
4. **Update config.ts** — Add DATABASE_ONPREMISE_DEV_EXPERIMENT and onPremiseExperimentPrisma client
5. **Add npm scripts** — Package.json entries for all dual-local operations
6. **Update AGENTS.md** — Document dual-local workflow in on-premise database Access section
7. **Test workflow** — Bootstrap both databases, test Phase 2 migration on experimental

---

**Revision History:**
- 2025-11-08T19:00:00Z — Initial dual-local-database architecture (Rev 1.0)
