# 2-Node Cluster Automation Guide

**Last Updated**: 2025-01-23  
**Status**: Complete - All scripts updated, bootstrap automation integrated

## Overview

This guide documents the automation improvements made to the 2-node database cluster after the core migration completed. The automation ensures that PROD PostgreSQL nodes initialize automatically on Render deployments without manual intervention.

## Architecture Recap

### Database Topology

- **DEV_DATABASE_URL** (Master): Render PostgreSQL managed database - Source of truth for schema and migrations
- **PROD_DATABASE_URL** (Local): PostgreSQL on Render Node persistent disk at `127.0.0.1:55433` - Low-latency production queries
- **Replication**: DEV → PROD via `scripts/dev_prod_auto_sync.ts`

### Data Flow

1. **Migrations**: Run against DEV_DATABASE_URL (master) via `npx prisma migrate deploy`
2. **Replication**: Auto-sync script copies data from DEV → PROD every interval
3. **Production Queries**: Application uses PROD_DATABASE_URL for <100ms latency
4. **Bootstrap**: `scripts/bootstrap_prod_node.sh` initializes PROD PostgreSQL automatically during deployment

## Automation Components

### 1. Script Updates

All database administration scripts now use the canonical 2-node cluster environment variable schema:

#### Updated Scripts

**scripts/dev_prod_auto_sync.ts** (6 references updated):
- `relevantKeys` array: Prioritizes `PROD_DATABASE_URL`, `DEV_DATABASE_URL` before legacy variables
- `cliEnvForSeed()`: Production uses `PROD_DATABASE_URL`, development uses `DEV_DATABASE_URL`
- `withPrismaClient()`: Selects correct URL based on `NODE_ENV` and new schema
- Local fallback: Checks `PROD_DATABASE_URL` before `DATABASE_LOCAL_URL`

**scripts/db_admin.ts** (4 references updated):
- `readLocalFallbackUrl()`: Prioritizes `PROD_DATABASE_URL` and `PROD_DATABASE_URL_FILE`
- Error messages: Include `PROD_DATABASE_URL` and `DEV_DATABASE_URL`
- `showStatus()`: Displays status for both `PROD_DATABASE_URL` and `DEV_DATABASE_URL`

**scripts/db_smoke.ts** (2 references updated):
- `selectDatasource()`: Adds `PROD_DATABASE_URL` and `DEV_DATABASE_URL` to direct candidates
- Error messages: Include new environment variables

**scripts/db_mirror_checks.ts** (1 reference removed):
- `extractConnections()`: Removed `DATABASE_ACCELERATE_URL` (Accelerate no longer used)
- Added `PROD_DATABASE_URL` and `DEV_DATABASE_URL` to direct connection candidates

### 2. Bootstrap Script

**scripts/bootstrap_prod_node.sh** - Automated PROD node initialization:

```bash
#!/bin/bash
# Automatically sets up PostgreSQL on Render Node at /Store/db/

# Key Features:
- Checks for existing PostgreSQL installation
- Installs PostgreSQL via apt-get if missing (Render Ubuntu environment)
- Initializes cluster at /Store/db/pgdata with UTF-8 encoding
- Configures PostgreSQL to listen on 127.0.0.1:55433
- Creates infinity_gauntlet_db database
- Runs migrations from DEV (master) database
- Creates startup script for automatic restart
- Comprehensive logging to /Store/db/bootstrap.log

# Usage:
./scripts/bootstrap_prod_node.sh [--dry-run] [--force]
```

**Environment Variables Used**:
- `DEV_DATABASE_URL` - Master database for migration source
- `PROD_PG_PORT` - PostgreSQL port (default: 55433)
- `PROD_PG_USER` - PostgreSQL user (default: postgres)
- `PROD_PG_DATABASE` - Database name (default: infinity_gauntlet_db)
- `IG_STORE_ROOT` - Store directory root (default: /opt/render/project/src/Store)

**Output**:
- `/Store/db/pgdata/` - PostgreSQL cluster data directory
- `/Store/db/postgres.log` - PostgreSQL server logs
- `/Store/db/bootstrap.log` - Bootstrap execution log
- `/Store/db/start.sh` - Manual startup script

### 3. Render Integration

**render.yaml** updates integrate bootstrap into deployment:

**Services Updated** (5 total):
1. `infinity-gauntlet-bot` (web)
2. `infinity-gauntlet-outbox` (worker)
3. `infinity-gauntlet-bots` (worker)
4. `infinity-gauntlet-cache` (worker)
5. `infinity-gauntlet-data-pipeline` (worker)

**Changes Applied**:

```yaml
buildCommand: npm install --include=dev && npm run prebuild && bash scripts/bootstrap_prod_node.sh
disks:
  - name: prod-database
    mountPath: /opt/render/project/src/Store
    sizeGB: 2
```

**Persistent Disks**:
- Each service now has a 2GB persistent disk at `/opt/render/project/src/Store`
- Ensures PostgreSQL data survives deployments
- Bootstrap script creates `/Store/db/` structure automatically

**Build Command Flow**:
1. `npm install --include=dev` - Install dependencies
2. `npm run prebuild` - Compile TypeScript (runs `prisma generate`)
3. `bash scripts/bootstrap_prod_node.sh` - Initialize PROD PostgreSQL

## Migration from Legacy Variables

### Before (Legacy Schema)

```bash
DATABASE_URL=prisma+postgres://accelerate...  # Accelerate (REMOVED)
DATABASE_ACCELERATE_URL=prisma://...          # Accelerate (REMOVED)
RENDER_DB_EXTERNAL_URL=postgresql://...       # DEV master
DATABASE_LOCAL_URL=postgresql://127.0.0.1...  # PROD local
```

### After (2-Node Cluster Schema)

```bash
DEV_DATABASE_URL=postgresql://...@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db  # Master
PROD_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db                                       # Local PROD
```

### Backwards Compatibility

Scripts maintain fallback logic for gradual migration:

```typescript
// Production URL selection
const prodUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_LOCAL_URL;

// Development URL selection
const devUrl = process.env.DEV_DATABASE_URL || 
               process.env.RENDER_DB_EXTERNAL_URL || 
               process.env.RENDER_DB_INTERNAL_URL;
```

## Deployment Workflow

### Automated Deployment (Render)

1. **Trigger**: Git push to `main` branch
2. **Build Phase**:
   - `npm install --include=dev` - Install all dependencies
   - `npm run prebuild` - Generate Prisma Client and compile TypeScript
   - `bash scripts/bootstrap_prod_node.sh` - Initialize PROD PostgreSQL
     - Check for PostgreSQL installation (install if missing)
     - Initialize cluster at `/Store/db/pgdata`
     - Configure to listen on `127.0.0.1:55433`
     - Create `infinity_gauntlet_db` database
     - Run migrations from DEV (master)
     - Create startup script
3. **Start Phase**:
   - Service starts with `PROD_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db`
   - Auto-sync replicates DEV → PROD on schedule
   - Application queries use PROD for <100ms latency

### Manual Deployment (Local Development)

```bash
# Load environment variables
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist

# Test bootstrap script locally (dry-run)
bash scripts/bootstrap_prod_node.sh --dry-run

# Run bootstrap (creates /Store/db/)
bash scripts/bootstrap_prod_node.sh

# Verify PROD connection
npm run db:cli -- status

# Start auto-sync
npm run dev-prod-sync
```

## Testing & Validation

### Pre-Deployment Checks

**Environment Variables**:
```bash
echo $DEV_DATABASE_URL    # Should be Render PostgreSQL connection string
echo $PROD_DATABASE_URL   # Should be postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
```

**TypeScript Compilation**:
```bash
npm run build             # Should compile without errors
```

**Script Validation**:
```bash
npm run db:cli -- status  # Should show PROD_DATABASE_URL and DEV_DATABASE_URL status
npm run db:smoke          # Should connect to PROD or DEV based on NODE_ENV
```

### Post-Deployment Validation

**Database Connections**:
```bash
npm run db:cli -- status
# Expected output:
# PROD_DATABASE_URL set : yes
# DEV_DATABASE_URL set : yes
# Active host : 127.0.0.1:55433 (or DEV based on config)
```

**PROD Node Status**:
```bash
# Check PostgreSQL running on Render Node
pg_isready -h 127.0.0.1 -p 55433 -U postgres

# Check database exists
psql -h 127.0.0.1 -p 55433 -U postgres -lqt | grep infinity_gauntlet_db

# View bootstrap logs
cat /opt/render/project/src/Store/db/bootstrap.log
```

**Replication Status**:
```bash
npm run dev-prod-sync -- --once
# Should replicate DEV → PROD successfully
```

**Data Integrity**:
```bash
npm run db:cli -- counts
# Compare Species, Move, Ability counts between DEV and PROD
```

## Troubleshooting

### Bootstrap Script Fails

**Symptom**: Bootstrap script exits with error during deployment

**Diagnosis**:
```bash
# Check bootstrap log
cat /opt/render/project/src/Store/db/bootstrap.log

# Check PostgreSQL installation
which pg_ctl
pg_ctl --version

# Verify disk mount
ls -la /opt/render/project/src/Store
```

**Solutions**:
- Ensure persistent disk mounted at `/opt/render/project/src/Store`
- Verify `DEV_DATABASE_URL` set in Render dashboard
- Check Render build logs for PostgreSQL installation errors
- Run bootstrap with `--force` to recreate cluster

### PROD Database Not Connecting

**Symptom**: Application cannot connect to `127.0.0.1:55433`

**Diagnosis**:
```bash
# Check if PostgreSQL is running
pg_isready -h 127.0.0.1 -p 55433 -U postgres

# Check PostgreSQL logs
cat /opt/render/project/src/Store/db/postgres.log

# Check PostgreSQL configuration
cat /opt/render/project/src/Store/db/pgdata/postgresql.conf | grep port
cat /opt/render/project/src/Store/db/pgdata/postgresql.conf | grep listen_addresses
```

**Solutions**:
- Restart PostgreSQL: `/opt/render/project/src/Store/db/start.sh`
- Verify port configuration (should be 55433)
- Check `pg_hba.conf` allows local connections
- Ensure PostgreSQL started during build phase

### Auto-Sync Not Running

**Symptom**: DEV changes not replicating to PROD

**Diagnosis**:
```bash
# Check auto-sync configuration
echo $ENABLE_DB_AUTO_SYNC  # Should be "true" for bots worker

# Test manual sync
npm run dev-prod-sync -- --once

# Check Render logs for bots worker
# Look for "sync.config" and "sync.complete" log entries
```

**Solutions**:
- Verify `ENABLE_DB_AUTO_SYNC=true` in `render.yaml` for bots worker
- Check `DEV_DATABASE_URL` and `PROD_DATABASE_URL` both set
- Ensure persistent disk mounted (sync needs local PROD database)
- Review `scripts/dev_prod_auto_sync.ts` logs for errors

### Data Divergence

**Symptom**: PROD and DEV databases have different data

**Diagnosis**:
```bash
# Compare table counts
npm run db:cli -- counts

# Check sync status
npm run db:cli -- query "SELECT * FROM db_sync_state ORDER BY last_checked_at DESC LIMIT 1"

# Check version fingerprints
npm run db:cli -- query "SELECT * FROM db_version ORDER BY updated_at DESC"
```

**Solutions**:
- Run full sync: `npm run dev-prod-sync -- --once`
- Check for migration mismatches (DEV should have all migrations PROD has)
- Verify replication direction (DEV → PROD, never PROD → DEV)
- If diverged, run `--force` sync to reset PROD from DEV

## Rollback Plan

If automation causes deployment issues:

### 1. Revert Bootstrap Integration

Remove bootstrap script from `render.yaml`:

```yaml
buildCommand: npm install --include=dev && npm run prebuild
# Removed: && bash scripts/bootstrap_prod_node.sh
```

### 2. Revert to Manual PROD Setup

Follow manual PostgreSQL setup:
1. SSH into Render Node
2. Install PostgreSQL manually
3. Create cluster at `/Store/db/`
4. Configure port 55433
5. Create database and run migrations

### 3. Revert Script Updates

```bash
git revert f910981  # Revert "feat: Update scripts for 2-node cluster automation"
git revert 69211ec  # Revert "feat: Migrate to 2-node cluster (DEV master + PROD local)"
```

### 4. Emergency: Disable PROD Database

Set environment variable in Render dashboard:
```bash
PROD_DATABASE_URL=  # Leave blank - scripts will fall back to DEV_DATABASE_URL
```

Application will use DEV for all queries (higher latency but functional).

## Future Enhancements

### Planned Improvements

1. **Health Checks**: Add `/health` endpoint that validates PROD database connectivity
2. **Metrics Dashboard**: Expose PROD/DEV connection pool stats, query latency, sync lag
3. **Automated Failover**: If PROD unreachable, automatically fall back to DEV
4. **Snapshot Backups**: Schedule periodic snapshots of PROD database to persistent disk
5. **Multi-Region PROD Nodes**: Add PROD PostgreSQL nodes in multiple Render regions

### Expansion Patterns

The 2-node cluster is designed for extensibility. Future additions:

**Read Replicas**:
```bash
REPLICA_1_DATABASE_URL=postgresql://...  # Read-only replica for analytics
REPLICA_2_DATABASE_URL=postgresql://...  # Read-only replica for reporting
```

**Worker-Specific Databases**:
```bash
WORKER_DATABASE_URL=postgresql://...     # Dedicated worker node (background jobs)
ANALYTICS_DATABASE_URL=postgresql://...  # Analytics/reporting node (read-only)
```

**Geographic Distribution**:
```bash
PROD_US_WEST_DATABASE_URL=postgresql://...  # PROD node in Oregon
PROD_US_EAST_DATABASE_URL=postgresql://...  # PROD node in Virginia
PROD_EU_DATABASE_URL=postgresql://...       # PROD node in Frankfurt
```

Scripts already support this pattern via environment variable fallback chains.

## References

- **Core Migration Documentation**: `docs/2-node-cluster-migration.md`
- **Deployment Checklist**: `DEPLOYMENT-CHECKLIST.md`
- **Bootstrap Script**: `scripts/bootstrap_prod_node.sh`
- **Auto-Sync Script**: `scripts/dev_prod_auto_sync.ts`
- **Database Control Suite**: `docs/db-control-suite.md`
- **Render Configuration**: `render.yaml`

## Commit History

- **f910981**: feat: Update scripts for 2-node cluster automation (script updates + bootstrap script)
- **e7fe7ad**: docs: Add deployment checklist for 2-node cluster
- **47a2c78**: docs: Document 2-node cluster migration
- **61bd37f**: feat: Update db_replication.ts for 2-node cluster
- **69211ec**: feat: Migrate to 2-node cluster (DEV master + PROD local)
