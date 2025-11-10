# Database Replication Architecture# Database Replication Architecture — Master-Replica Cascade with Version Control



**Last Updated (UTC):** 2025-11-08T20:00:00Z  **Status:** DESIGN PHASE  

**Status:** PRODUCTION  **Owner:** Database Systems  

**Purpose:** Document the complete database replication architecture including cloud nodes, on-premise mirrors, and ONPREMISE-DEV-EXPERIMENT databases**Last Updated:** 2025-11-06



## Architecture Overview---



The Infinity Gauntlet system uses a **4-tier database architecture** combining cloud databases (DEV master + PROD local node) with workstation databases (ONPREMISE-DEV-PRIMARY + ONPREMISE-DEV-EXPERIMENT) for development, testing, and migration workflows.## Executive Summary



## Cloud Databases (Production)This document defines a **comprehensive, automated database replication system** with:

- **DEV as master** — All schema changes originate here

### DEV Master Database- **Cascading replication** — DEV → Prisma (prod) → Local DB with version gating

- **URL**: `DEV_DATABASE_URL` or `RENDER_DB_EXTERNAL_URL`- **Integrity verification** — Automated schema/data validation at each hop

- **Purpose**: Source of truth for all migrations and schema changes- **Silent error elimination** — Explicit validation, detailed logging, no assumptions

- **Location**: Render.com managed PostgreSQL- **Version control** — Migration-based versioning with reversion detection

- **Replication Role**: Master (source for all replication)- **Multi-connection integration** — Leverages existing dual Prisma client architecture

- **Access**: Direct PostgreSQL connection (no pooling)- **Observability** — Real-time monitoring, alerting, and dashboard visibility

- **Usage**:

  - All migration operations (`prisma migrate deploy`)**Core Principle:** DEV is the single source of truth. Downstream replicas (Prisma prod, Local workstation) mirror DEV perfectly unless waiting for DEV to catch up after a reversion.

  - Schema changes and DDL operations

  - Source for DEV → PROD replication---

  - Source for workstation database downloads

## Architecture Overview

### PROD Local Node Database

- **URL**: `PROD_DATABASE_URL`### Data Flow Hierarchy

- **Purpose**: Primary database for live gameplay operations

- **Location**: Render.com managed PostgreSQL (dedicated node)```

- **Replication Role**: Replica (receives from DEV master)┌─────────────────────────────────────────────────────────────────────┐

- **Latency**: <50ms for gameplay operations│                          DATA CHANGE SOURCE                          │

- **Access**: Direct PostgreSQL connection│                     (Developer, Migration, Script)                   │

- **Usage**:└──────────────────────────────────┬──────────────────────────────────┘

  - All live gameplay operations (battles, encounters, trainer CRUD)                                   │

  - Read-heavy workloads                                   ▼

  - Automatic replication from DEV master┌──────────────────────────────────────────────────────────────────────┐

│                      DEV DATABASE (MASTER)                           │

### Replication Flow (Cloud)│  Host: dpg-...render.com/infinity_gauntlet_db                       │

│  Role: Single source of truth                                        │

```│  Connection: RENDER_DB_EXTERNAL_URL (devPrisma)                     │

DEV Master (Source of Truth)│                                                                       │

         ││  Operations:                                                          │

         │ Auto-Sync (Every 5 minutes)│  - Receives ALL schema migrations first                              │

         │ scripts/dev_prod_auto_sync.ts│  - Accepts data changes from developers/scripts                      │

         ▼│  - Tracks version via _prisma_migrations + db_version table         │

PROD Local Node (Gameplay)│  - Validates migration integrity before marking applied              │

         ││                                                                       │

         │ Health Checks (Every 30 seconds)│  Version Tracking:                                                    │

         │ src/shared/prisma.ts│  - Migration count + checksum = version fingerprint                 │

         ▼│  - Emits version on every schema change                              │

   Production Traffic│  - Logs version changes to audit trail                               │

```└──────────────────────────────────┬──────────────────────────────────┘

                                   │

**Critical Rules:**                                   │ Sync Trigger (automated/manual)

- DEV → PROD is ONE-WAY only                                   │

- PROD never writes back to DEV                                   ▼

- Migrations MUST run on DEV first                       ┌───────────────────────┐

- PROD automatically receives changes from DEV                       │  VERSION GATE CHECK   │

                       │  DEV version >= Prod? │

## Workstation Databases (Development)                       └───────────┬───────────┘

                                   │

### ONPREMISE-DEV-PRIMARY Database                ┌──────────────────┴──────────────────┐

- **URL**: `DATABASE_ONPREMISE_DEV_PRIMARY`                │ YES: Proceed                        │ NO: Wait/Alert

- **Port**: 55433                ▼                                     │

- **Storage**: `Store/db/`┌──────────────────────────────────────────────────────────────────────┐

- **Purpose**: Local development with production-like data│                     INTEGRITY VERIFICATION                           │

- **Replication Role**: Replica (downloads from DEV master)│  - Schema comparison (tables, columns, indexes, constraints)        │

- **Sync Method**: Manual (`npm run ops:bootstrap-onpremise-dev`)│  - Data checksums (configurable tables)                              │

- **Location**: Localhost PostgreSQL cluster (workstation)│  - Row count validation                                              │

- **CRITICAL**: **100% OFFLINE** — NOT visible to production nodes│  - Foreign key integrity                                             │

│  - Enum value matching                                               │

**Features:**│                                                                       │

- Downloads schema + data from DEV master (one-way PULL)│  Output: PASS (sync proceeds) / FAIL (abort + alert)                │

- Provides <50ms latency for local development└──────────────────────────────────┬──────────────────────────────────┘

- Used for testing migrations after ONPREMISE-DEV-EXPERIMENT validation                                   │

- Rotation: Keeps 3 timestamped snapshots (configurable)                                   ▼

┌──────────────────────────────────────────────────────────────────────┐

**Storage Structure:**│                    PRISMA DB (PRODUCTION REPLICA)                    │

```│  Host: accelerate.prisma-data.net (via Accelerate proxy)           │

Store/db/│  Role: Production query layer with caching                           │

├── local-cluster/          # PostgreSQL data directory│  Connection: DATABASE_URL (prisma)                                  │

├── local-url.txt           # Connection string│                                                                       │

├── local-metadata.json     # Last sync timestamp, source│  Operations:                                                          │

├── local-postgres.log      # Server logs│  - Receives migrations ONLY after DEV successful                     │

└── snapshots/             # Timestamped backups (retention: 3)│  - Uses secrets/migrate.env for DDL (direct PostgreSQL)             │

    ├── infinity_gauntlet_db-2025-11-08T10-00-00.dump│  - Runs integrity tests against DEV before accepting                 │

    ├── infinity_gauntlet_db-2025-11-08T12-00-00.dump│  - Updates version tracking after successful sync                    │

    └── infinity_gauntlet_db-2025-11-08T14-00-00.dump│  - Serves production game operations via Accelerate cache            │

```│                                                                       │

│  Version Constraint:                                                  │

### ONPREMISE-DEV-EXPERIMENT Database│  - MUST match or lag behind DEV version                              │

- **URL**: `DATABASE_ONPREMISE_DEV_EXPERIMENT`│  - Blocks sync if DEV version < Prod version (reversion detected)   │

- **Port**: 55434│  - Waits for DEV to reach Prod version + 1 before resuming          │

- **Storage**: `Store/db-experiment/`└──────────────────────────────────┬──────────────────────────────────┘

- **Purpose**: Migration testing and schema experiments                                   │

- **Replication Role**: Independent clone (manual sync from ONPREMISE-DEV-PRIMARY/DEV/PROD)                                   │ Sync Trigger (automated/manual)

- **Sync Method**: Manual (`npm run ops:sync-onpremise-experiment`)                                   │

- **Location**: Localhost PostgreSQL cluster (workstation)                                   ▼

- **CRITICAL**: **100% OFFLINE** — NOT visible to production nodes, isolated from ONPREMISE-DEV-PRIMARY                       ┌───────────────────────┐

                       │  VERSION GATE CHECK   │

**Features:**                       │  Prod version >= Local?│

- Clones from ONPREMISE-DEV-PRIMARY (default), DEV, or PROD                       └───────────┬───────────┘

- Fully isolated for destructive testing (DROP TABLE, schema experiments)                                   │

- Safe for migration testing before pushing to DEV                ┌──────────────────┴──────────────────┐

- Manual snapshots only (no automatic rotation)                │ YES: Proceed                        │ NO: Wait/Alert

                ▼                                     │

**Storage Structure:**┌──────────────────────────────────────────────────────────────────────┐

```│                     INTEGRITY VERIFICATION                           │

Store/db-experiment/│  - Schema comparison against Prod                                    │

├── pg_data/               # PostgreSQL data directory│  - Data checksums (critical tables)                                  │

├── experiment-url.txt     # Connection string│  - Row count validation                                              │

├── metadata.json          # Last sync source, timestamp│  - Migration history matching                                        │

├── logs/└──────────────────────────────────┬──────────────────────────────────┘

│   └── postgres.log      # Server logs                                   │

└── snapshots/            # Manual snapshots (retention: 2)                                   ▼

    ├── sync-2025-11-08T10-00-00.dump┌──────────────────────────────────────────────────────────────────────┐

    └── sync-2025-11-08T12-00-00.dump│                LOCAL DB (WORKSTATION MIRROR)                         │

```│  Host: localhost:5432 (Store/db/ via PostgreSQL portable)          │

│  Role: Offline development fallback                                  │

## Complete Replication Flow│  Connection: postgresql://localhost:5432/infinity_gauntlet          │

│                                                                       │

```│  Operations:                                                          │

                    Cloud (Production)              Workstation (Offline)│  - Mirrors Prod for offline dev work                                 │

                    ──────────────────              ────────────────────│  - Receives pg_dump from Prod, restores via pg_restore              │

│  - Runs integrity tests against Prod before accepting                │

                    DEV Master│  - Updates version tracking after successful restore                 │

                    (Source of Truth)│  - Used by src/shared/config.ts when Render/Accelerate unavailable  │

                           ││                                                                       │

           ┌───────────────┼───────────────┐│  Version Constraint:                                                  │

           │               │               ││  - MUST match or lag behind Prod version                             │

           │ Auto-Sync     │ Downloads     │ Downloads│  - Blocks restore if Prod version < Local version                    │

           │ (5 min)       │ (Manual)      │ (Manual)│  - Prunes stale snapshots (7-day retention)                          │

           ▼               ▼               ▼└──────────────────────────────────────────────────────────────────────┘

    PROD Local Node    ONPREMISE-DEV-PRIMARY   ONPREMISE-DEV-EXPERIMENT```

    (Gameplay)         (Port 55433)    (Port 54434)

                           │               │---

                           │ Manual Clone  │

                           └───────────────┘## Version Control System

                                  │

                                  │ EXPLICIT PUSH (when ready)### Version Fingerprint Calculation

                                  ▼

                            Upload to DEV MasterEach database instance tracks its version via:

                            (migrations, schema changes)

                                  │```sql

                                  │ Auto-SyncCREATE TABLE IF NOT EXISTS db_version (

                                  ▼  id SERIAL PRIMARY KEY,

                            PROD Local Node  version_fingerprint TEXT NOT NULL,        -- SHA-256(migration_names + checksums)

```  migration_count INTEGER NOT NULL,         -- Total applied migrations

  last_migration_name TEXT NOT NULL,        -- Most recent migration

## Replication Workflows  last_migration_applied_at TIMESTAMPTZ NOT NULL,

  sync_source TEXT,                         -- 'DEV' | 'PROD' | 'LOCAL'

### Workflow 1: Normal Development (Cloud → Workstation)  created_at TIMESTAMPTZ DEFAULT NOW()

);

```bash```

# Step 1: Download latest data from DEV master to ONPREMISE-DEV-PRIMARY

npm run ops:bootstrap-onpremise-dev**Fingerprint Formula:**

```typescript

# Step 2: Develop locally using ONPREMISE-DEV-PRIMARY (port 55433)const migrations = await prisma.$queryRaw`

npm run db:cli -- status --target=local  SELECT migration_name, checksum 

npm run db:cli -- count User --target=local  FROM _prisma_migrations 

  ORDER BY started_at ASC

# Step 3: Test queries locally`;

psql postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db

```const fingerprintInput = migrations

  .map(m => `${m.migration_name}:${m.checksum}`)

**Critical:** ONPREMISE-DEV-PRIMARY downloads from DEV (one-way PULL). Local changes do NOT sync back to DEV automatically.  .join('|');



### Workflow 2: Migration Testing (ONPREMISE-DEV-EXPERIMENT → ONPREMISE-DEV-PRIMARY → DEV → PROD)const versionFingerprint = crypto

  .createHash('sha256')

```bash  .update(fingerprintInput)

# Step 1: Ensure ONPREMISE-DEV-PRIMARY is up-to-date  .digest('hex');

npm run ops:bootstrap-onpremise-dev

const version = {

# Step 2: Clone ONPREMISE-DEV-PRIMARY to ONPREMISE-DEV-EXPERIMENT (100% OFFLINE)  fingerprint: versionFingerprint,

npm run ops:bootstrap-onpremise-experiment  count: migrations.length,

  lastMigration: migrations[migrations.length - 1].migration_name,

# Step 3: Test migration on ONPREMISE-DEV-EXPERIMENT (100% OFFLINE)  lastAppliedAt: migrations[migrations.length - 1].finished_at

psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \};

  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql```



# Step 4: Validate migration results (100% OFFLINE)### Version Comparison Logic

npm run db:cli -- count User --target=experiment

npm run db:cli -- query "SELECT COUNT(*) FROM \"TrainerProfile\";" --target=experiment```typescript

enum VersionComparison {

# Step 5: Test rollback if needed (100% OFFLINE)  MATCH = 'MATCH',           // Fingerprints identical

psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \  AHEAD = 'AHEAD',           // Source has more migrations

  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/rollback.sql  BEHIND = 'BEHIND',         // Source has fewer migrations (reversion!)

  DIVERGED = 'DIVERGED'      // Different fingerprints at same count

# Step 6: Validate on ONPREMISE-DEV-PRIMARY if successful (100% OFFLINE)}

npm run ops:sync-onpremise-experiment --from local

psql postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db \function compareVersions(source: Version, target: Version): VersionComparison {

  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql  if (source.fingerprint === target.fingerprint) {

    return VersionComparison.MATCH;

# Step 7: ONLY AFTER LOCAL VALIDATION - Push to DEV Master (CLOUD OPERATION)  }

# Connect to DEV master and apply migration  

psql $DEV_DATABASE_URL -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql  if (source.count > target.count) {

    // Check if target's migrations are a prefix of source's

# Step 8: DEV Master replicates to PROD Node automatically (within 5 minutes)    const targetFingerprint = calculateFingerprintUpTo(source.migrations, target.count);

```    return targetFingerprint === target.fingerprint 

      ? VersionComparison.AHEAD 

**Critical:** Steps 1-6 are completely offline. Production sees nothing until Step 7 (explicit push to DEV Master).      : VersionComparison.DIVERGED;

  }

### Workflow 3: Emergency Rollback (PROD ← DEV ← Workstation)  

  if (source.count < target.count) {

```bash    // Reversion detected! Source rolled back migrations

# Step 1: Test rollback on ONPREMISE-DEV-EXPERIMENT (100% OFFLINE)    return VersionComparison.BEHIND;

npm run ops:sync-onpremise-experiment --from dev  }

psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \  

  -f prisma/migrations/MIGRATION_ID/rollback.sql  // Same count but different fingerprints

  return VersionComparison.DIVERGED;

# Step 2: Validate rollback success (100% OFFLINE)}

npm run db:cli -- databases```

npm run db:cli -- count User --target=experiment

### Reversion Handling

# Step 3: Apply rollback to DEV Master (CLOUD OPERATION)

psql $DEV_DATABASE_URL -f prisma/migrations/MIGRATION_ID/rollback.sql**Scenario:** DEV rolled back from migration 50 to migration 45



# Step 4: DEV Master replicates rollback to PROD Node automatically```typescript

```// DEV: version_fingerprint = hash(migrations 1-45), count = 45

// Prod: version_fingerprint = hash(migrations 1-50), count = 50

### Workflow 4: Sync ONPREMISE-DEV-EXPERIMENT from Different Sources// Comparison: DEV is BEHIND Prod



```bashasync function handleReversion(devVersion: Version, prodVersion: Version) {

# Clone from ONPREMISE-DEV-PRIMARY (default, 100% OFFLINE)  logger.warn('Reversion detected', {

npm run ops:sync-onpremise-experiment --from local    dev: { count: devVersion.count, last: devVersion.lastMigration },

    prod: { count: prodVersion.count, last: prodVersion.lastMigration },

# Clone from DEV master (downloads from cloud)    rollbackDepth: prodVersion.count - devVersion.count

npm run ops:sync-onpremise-experiment --from dev  });

  

# Clone from PROD local node (downloads from cloud)  // Block Prod sync until DEV catches up

npm run ops:sync-onpremise-experiment --from prod  await updateSyncState('PROD', {

```    status: 'WAITING_FOR_MASTER',

    reason: `DEV rolled back ${prodVersion.count - devVersion.count} migrations`,

## Database Lifecycle Management    waitingForVersion: devVersion.count + 1,

    blockedAt: new Date()

### ONPREMISE-DEV-PRIMARY Database  });

  

**Bootstrap:**  // Alert operators

```bash  await sendAlert({

npm run ops:bootstrap-onpremise-dev    severity: 'WARNING',

```    title: 'DB Reversion Detected',

    message: `DEV rolled back to migration ${devVersion.lastMigration}. Prod sync blocked until DEV >= ${prodVersion.count + 1} migrations.`,

**Start:**    escalate: true

```bash  });

# Automatically started by bootstrap script}

# Manual start: pg_ctl start -D Store/db/local-cluster -l Store/db/local-postgres.log -o "-p 55433"```

```

---

**Stop:**

```bash## Integrity Verification Framework

# WARNING: Stops ability to pull from DEV

pg_ctl stop -D Store/db/local-cluster -m fast### Schema Comparison

```

```typescript

**Status:**interface SchemaIntegrityResult {

```bash  passed: boolean;

npm run ops:status-onpremise-dbs  diffs: SchemaDiff[];

```  summary: {

    tablesMatch: boolean;

### ONPREMISE-DEV-EXPERIMENT Database    columnsMatch: boolean;

    indexesMatch: boolean;

**Bootstrap:**    constraintsMatch: boolean;

```bash    enumsMatch: boolean;

# From ONPREMISE-DEV-PRIMARY (default, 100% OFFLINE)  };

npm run ops:bootstrap-onpremise-experiment}



# From DEV master (downloads from cloud)interface SchemaDiff {

npm run ops:bootstrap-onpremise-experiment -- --source dev  type: 'TABLE' | 'COLUMN' | 'INDEX' | 'CONSTRAINT' | 'ENUM';

```  action: 'MISSING' | 'EXTRA' | 'MISMATCH';

  source: string;  // e.g., 'DEV'

**Start:**  target: string;  // e.g., 'PROD'

```bash  path: string;    // e.g., 'User.email' or 'idx_users_email'

npm run ops:start-onpremise-experiment  details: Record<string, any>;

```}



**Stop:**async function verifySchemaIntegrity(

```bash  sourcePrisma: PrismaClient,

npm run ops:stop-onpremise-experiment  targetPrisma: PrismaClient,

```  options: { skipTables?: string[] } = {}

): Promise<SchemaIntegrityResult> {

**Sync:**  const diffs: SchemaDiff[] = [];

```bash  

# From ONPREMISE-DEV-PRIMARY (100% OFFLINE)  // 1. Compare tables

npm run ops:sync-onpremise-experiment  const sourceTables = await getTableNames(sourcePrisma);

  const targetTables = await getTableNames(targetPrisma);

# From DEV master (downloads from cloud)  

npm run ops:sync-onpremise-experiment -- --from dev  const missingTables = sourceTables.filter(t => !targetTables.includes(t));

```  const extraTables = targetTables.filter(t => !sourceTables.includes(t));

  

**Status:**  missingTables.forEach(table => {

```bash    diffs.push({

npm run ops:status-onpremise-dbs      type: 'TABLE',

```      action: 'MISSING',

      source: 'source',

## Monitoring & Observability      target: 'target',

      path: table,

### Database Status Monitoring      details: {}

    });

```bash  });

# List all databases with connection status  

npm run db:cli -- databases  // 2. Compare columns for matching tables

  const commonTables = sourceTables.filter(t => targetTables.includes(t));

# Check specific database status  

npm run db:cli -- status --target=dev  for (const table of commonTables) {

npm run db:cli -- status --target=prod    if (options.skipTables?.includes(table)) continue;

npm run db:cli -- status --target=local    

npm run db:cli -- status --target=experiment    const sourceColumns = await getColumnSchema(sourcePrisma, table);

```    const targetColumns = await getColumnSchema(targetPrisma, table);

    

### Prisma Client Telemetry    const columnDiffs = compareColumns(table, sourceColumns, targetColumns);

    diffs.push(...columnDiffs);

The system maintains **four simultaneous Prisma clients** with independent heartbeat monitoring:  }

  

```typescript  // 3. Compare indexes

import { prisma, devPrisma, onPremiseDevPrisma, onPremiseExperimentPrisma } from "../shared/prisma.js";  const indexDiffs = await compareIndexes(sourcePrisma, targetPrisma);

  diffs.push(...indexDiffs);

// PROD database (gameplay operations)  

const prodUsers = await prisma.user.findMany();  // 4. Compare constraints (FK, unique, check)

  const constraintDiffs = await compareConstraints(sourcePrisma, targetPrisma);

// DEV database (master, source of truth)  diffs.push(...constraintDiffs);

if (devPrisma) {  

  const devUsers = await devPrisma.user.findMany();  // 5. Compare enums

}  const enumDiffs = await compareEnums(sourcePrisma, targetPrisma);

  diffs.push(...enumDiffs);

// ONPREMISE-DEV-PRIMARY database (workstation mirror)  

if (onPremiseDevPrisma) {  return {

  const localUsers = await onPremiseDevPrisma.user.findMany();    passed: diffs.length === 0,

}    diffs,

    summary: {

// ONPREMISE-DEV-EXPERIMENT database (migration testing)      tablesMatch: !diffs.some(d => d.type === 'TABLE'),

if (onPremiseExperimentPrisma) {      columnsMatch: !diffs.some(d => d.type === 'COLUMN'),

  const experimentUsers = await onPremiseExperimentPrisma.user.findMany();      indexesMatch: !diffs.some(d => d.type === 'INDEX'),

}      constraintsMatch: !diffs.some(d => d.type === 'CONSTRAINT'),

```      enumsMatch: !diffs.some(d => d.type === 'ENUM')

    }

**Heartbeat Monitoring:**  };

- Interval: Every 30 seconds}

- Latency tracking: Records query execution time```

- Status: `healthy`, `degraded`, `reconnecting`, `error`, `offline`

- Telemetry: Displayed in console output, restart DMs, `/ops` commands### Data Integrity Checks



### Replication Status Checks```typescript

interface DataIntegrityResult {

```bash  passed: boolean;

# Check if ONPREMISE-DEV-PRIMARY is up-to-date  checks: DataCheck[];

npm run db:cli -- query "SELECT * FROM db_version WHERE environment = 'LOCAL' ORDER BY updated_at DESC LIMIT 1;" --target=local  summary: {

    rowCountsMatch: boolean;

# Check if ONPREMISE-DEV-EXPERIMENT is up-to-date    checksumsMatch: boolean;

npm run db:cli -- query "SELECT * FROM db_version WHERE environment = 'EXPERIMENT' ORDER BY updated_at DESC LIMIT 1;" --target=experiment    foreignKeysValid: boolean;

  };

# Compare DEV vs PROD versions}

npm run db:cli -- query "SELECT * FROM db_version WHERE environment IN ('DEV', 'PROD') ORDER BY environment, updated_at DESC;" --target=dev

```interface DataCheck {

  table: string;

## Storage Quotas & Management  check: 'ROW_COUNT' | 'CHECKSUM' | 'FK_INTEGRITY';

  passed: boolean;

### Cloud Databases  source: any;

- **DEV Master**: 1.0 GB (Render managed)  target: any;

- **PROD Local Node**: 0.5 GB (Render managed)  difference?: number | string;

}

**Monitoring:**

```bashasync function verifyDataIntegrity(

npm run db:cli -- query "SELECT pg_size_pretty(pg_database_size(current_database()));" --target=dev  sourcePrisma: PrismaClient,

npm run db:cli -- query "SELECT pg_size_pretty(pg_database_size(current_database()));" --target=prod  targetPrisma: PrismaClient,

```  options: {

    tables?: string[];           // Limit to specific tables

### Workstation Databases    skipChecksums?: boolean;     // Skip expensive checksums

- **ONPREMISE-DEV-PRIMARY**: ~200 MB (including snapshots)    sampleSize?: number;         // Sample rows for large tables

- **ONPREMISE-DEV-EXPERIMENT**: ~50 MB (manual snapshots only)  } = {}

): Promise<DataIntegrityResult> {

**Cleanup:**  const checks: DataCheck[] = [];

```bash  

# ONPREMISE-DEV-PRIMARY: Automatic snapshot rotation (keeps 3 most recent)  const tables = options.tables || await getTableNames(sourcePrisma);

npm run ops:bootstrap-onpremise-dev  

  for (const table of tables) {

# ONPREMISE-DEV-EXPERIMENT: Manual cleanup required    // 1. Row count comparison

rm Store/db-experiment/snapshots/*.dump    const sourceCount = await sourcePrisma.$queryRaw`

```      SELECT COUNT(*) as count FROM ${Prisma.raw(table)}

    `;

## Safety Rules & Best Practices    const targetCount = await targetPrisma.$queryRaw`

      SELECT COUNT(*) as count FROM ${Prisma.raw(table)}

### Critical Rules (Absolutes)    `;

    

1. **✅ DO** remember both workstation databases are OFFLINE (localhost-only)    const rowCountMatch = sourceCount[0].count === targetCount[0].count;

2. **✅ DO** test migrations on ONPREMISE-DEV-EXPERIMENT before ONPREMISE-DEV-PRIMARY    checks.push({

3. **✅ DO** validate migrations on ONPREMISE-DEV-PRIMARY before pushing to DEV      table,

4. **✅ DO** use `--target` flag to avoid accidentally targeting wrong database      check: 'ROW_COUNT',

5. **✅ DO** document testing results in Tasklist.md      passed: rowCountMatch,

6. **✅ DO** bootstrap ONPREMISE-DEV-PRIMARY before creating ONPREMISE-DEV-EXPERIMENT      source: sourceCount[0].count,

7. **✅ DO** use explicit push workflow for production changes      target: targetCount[0].count,

      difference: rowCountMatch ? 0 : Math.abs(sourceCount[0].count - targetCount[0].count)

8. **❌ DON'T** expect production to see local database changes automatically    });

9. **❌ DON'T** assume local databases replicate automatically to cloud    

10. **❌ DON'T** skip ONPREMISE-DEV-EXPERIMENT testing — always test destructive operations offline first    // 2. Data checksum (if enabled and counts match)

11. **❌ DON'T** run migrations on PROD directly — always go through DEV first    if (!options.skipChecksums && rowCountMatch) {

12. **❌ DON'T** modify PROD manually — all changes must come from DEV via auto-sync      const sourceChecksum = await calculateTableChecksum(sourcePrisma, table, options.sampleSize);

13. **❌ DON'T** use pooled connections for migrations — always use direct PostgreSQL      const targetChecksum = await calculateTableChecksum(targetPrisma, table, options.sampleSize);

14. **❌ DON'T** forget to sync ONPREMISE-DEV-EXPERIMENT before testing new migrations      

      checks.push({

### Development Best Practices        table,

        check: 'CHECKSUM',

1. **Always test on ONPREMISE-DEV-EXPERIMENT first**: Never test destructive operations on ONPREMISE-DEV-PRIMARY        passed: sourceChecksum === targetChecksum,

2. **Keep ONPREMISE-DEV-PRIMARY up-to-date**: Bootstrap regularly to sync with DEV master        source: sourceChecksum,

3. **Document migration testing**: Record outcomes in Tasklist.md with timestamps        target: targetChecksum

4. **Use --target flag**: Avoid accidental cross-database operations      });

5. **Monitor storage quotas**: Check disk usage regularly with `ops:status-onpremise-dbs`    }

6. **Backup before destructive operations**: Take manual snapshots when testing DROP/TRUNCATE  }

  

## Troubleshooting  // 3. Foreign key integrity (target only)

  const fkChecks = await validateForeignKeys(targetPrisma);

### ONPREMISE-DEV-PRIMARY Issues  checks.push(...fkChecks);

  

**Problem: Bootstrap fails with connection error**  return {

```bash    passed: checks.every(c => c.passed),

# Solution: Check DEV_DATABASE_URL is configured    checks,

echo $Env:DEV_DATABASE_URL    summary: {

pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist      rowCountsMatch: checks.filter(c => c.check === 'ROW_COUNT').every(c => c.passed),

```      checksumsMatch: checks.filter(c => c.check === 'CHECKSUM').every(c => c.passed),

      foreignKeysValid: checks.filter(c => c.check === 'FK_INTEGRITY').every(c => c.passed)

**Problem: ONPREMISE-DEV-PRIMARY out of sync with DEV**    }

```bash  };

# Solution: Re-bootstrap from DEV master}

npm run ops:bootstrap-onpremise-dev```

```

---

**Problem: Port 55433 already in use**

```bash## Sync Orchestration

# Solution: Stop existing cluster

pg_ctl stop -D Store/db/local-cluster -m fast### DEV → Prisma (Prod) Sync

npm run ops:bootstrap-onpremise-dev

``````typescript

interface SyncResult {

### ONPREMISE-DEV-EXPERIMENT Issues  success: boolean;

  stage: 'VERSION_CHECK' | 'INTEGRITY_VERIFY' | 'MIGRATION_APPLY' | 'VALIDATION' | 'COMPLETE';

**Problem: Bootstrap fails - ONPREMISE-DEV-PRIMARY not running**  startedAt: Date;

```bash  completedAt?: Date;

# Solution: Start ONPREMISE-DEV-PRIMARY first  duration?: number;

npm run ops:bootstrap-onpremise-dev  errors: SyncError[];

npm run ops:bootstrap-onpremise-experiment  metrics: SyncMetrics;

```}



**Problem: Sync fails - source database unreachable**interface SyncMetrics {

```bash  migrationsApplied: number;

# Solution: Use different source  schemaIntegrityPassed: boolean;

npm run ops:sync-onpremise-experiment --from local  # Use ONPREMISE-DEV-PRIMARY (offline)  dataIntegrityPassed: boolean;

npm run ops:sync-onpremise-experiment --from dev    # Use DEV master (cloud)  versionBefore: string;

```  versionAfter: string;

  bytesTransferred?: number;

**Problem: Port 55434 already in use**}

```bash

# Solution: Stop existing clusterasync function syncDevToProd(): Promise<SyncResult> {

npm run ops:stop-onpremise-experiment  const result: SyncResult = {

npm run ops:start-onpremise-experiment    success: false,

```    stage: 'VERSION_CHECK',

    startedAt: new Date(),

### Cloud Replication Issues    errors: [],

    metrics: {

**Problem: PROD out of sync with DEV**      migrationsApplied: 0,

```bash      schemaIntegrityPassed: false,

# Solution: Check auto-sync service status      dataIntegrityPassed: false,

npm run db:auto-sync -- --dry-run      versionBefore: '',

npm run db:auto-sync -- --once      versionAfter: ''

```    }

  };

**Problem: Migration stuck on DEV**  

```bash  try {

# Solution: Check migration status    // STAGE 1: Version Check

npm run db:cli -- query "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;" --target=dev    logger.info('Sync: DEV → Prod - Stage 1: Version Check');

```    

    const devVersion = await getVersion(devPrisma);

## Related Documentation    const prodVersion = await getVersion(prisma);

    

- `AGENTS.md` — Complete agent operations guide including dual-local setup    result.metrics.versionBefore = prodVersion.fingerprint;

- `docs/dual-local-database-guide.md` — Comprehensive dual-local database documentation    

- `docs/database-url-selection.md` — Canonical URL selection logic    const comparison = compareVersions(devVersion, prodVersion);

- `docs/database-systems.md` — Database architecture overview    

- `docs/2-node-cluster-automation.md` — Cloud replication automation    if (comparison === VersionComparison.BEHIND) {

- `ops/DB_BOOTSTRAP.md` — Staging database bootstrap procedures      // Reversion detected!

- `scripts/ops/bootstrap_local_fallback.ts` — ONPREMISE-DEV-PRIMARY bootstrap implementation      await handleReversion(devVersion, prodVersion);

- `scripts/ops/bootstrap_experiment_db.ts` — ONPREMISE-DEV-EXPERIMENT bootstrap implementation      throw new Error(`DEV is behind Prod (DEV: ${devVersion.count}, Prod: ${prodVersion.count}). Sync blocked.`);

- `scripts/ops/sync_experiment_db.ts` — ONPREMISE-DEV-EXPERIMENT sync implementation    }

    
    if (comparison === VersionComparison.DIVERGED) {
      throw new Error(`DEV and Prod have diverged! Manual resolution required. DEV: ${devVersion.fingerprint.slice(0, 8)}, Prod: ${prodVersion.fingerprint.slice(0, 8)}`);
    }
    
    if (comparison === VersionComparison.MATCH) {
      logger.info('Sync: DEV and Prod already in sync', { version: devVersion.fingerprint.slice(0, 8) });
      result.success = true;
      result.stage = 'COMPLETE';
      return result;
    }
    
    // comparison === AHEAD: Prod needs migrations
    const migrationGap = devVersion.count - prodVersion.count;
    logger.info(`Sync: Prod is ${migrationGap} migrations behind DEV`);
    
    // STAGE 2: Integrity Verify (pre-migration)
    result.stage = 'INTEGRITY_VERIFY';
    logger.info('Sync: Stage 2: Pre-migration integrity check');
    
    const integrityResult = await verifySchemaIntegrity(devPrisma, prisma);
    
    if (!integrityResult.passed) {
      logger.warn('Pre-migration integrity check failed', { diffs: integrityResult.diffs });
      // Continue anyway - migrations should fix diffs
    }
    
    // STAGE 3: Apply Migrations
    result.stage = 'MIGRATION_APPLY';
    logger.info('Sync: Stage 3: Applying migrations to Prod');
    
    // Use secrets/migrate.env for DDL operations
    const migrateEnv = {
      ...process.env,
      ...loadEnvFile('secrets/migrate.env')  // Direct PostgreSQL URL
    };
    
    const migrateResult = await execCommand(
      'npx prisma migrate deploy',
      { env: migrateEnv, timeout: 300000 }  // 5min timeout
    );
    
    if (migrateResult.exitCode !== 0) {
      throw new Error(`Migration failed: ${migrateResult.stderr}`);
    }
    
    result.metrics.migrationsApplied = migrationGap;
    
    // STAGE 4: Post-migration Validation
    result.stage = 'VALIDATION';
    logger.info('Sync: Stage 4: Post-migration validation');
    
    const prodVersionAfter = await getVersion(prisma);
    result.metrics.versionAfter = prodVersionAfter.fingerprint;
    
    if (prodVersionAfter.fingerprint !== devVersion.fingerprint) {
      throw new Error(`Version mismatch after sync! DEV: ${devVersion.fingerprint.slice(0, 8)}, Prod: ${prodVersionAfter.fingerprint.slice(0, 8)}`);
    }
    
    const postIntegrity = await verifySchemaIntegrity(devPrisma, prisma);
    result.metrics.schemaIntegrityPassed = postIntegrity.passed;
    
    if (!postIntegrity.passed) {
      throw new Error(`Schema integrity failed after migration: ${JSON.stringify(postIntegrity.diffs)}`);
    }
    
    // Optional: Data integrity (expensive, run selectively)
    const dataIntegrity = await verifyDataIntegrity(devPrisma, prisma, {
      tables: ['User', 'Species'],  // Critical tables only
      skipChecksums: true           // Row counts only
    });
    result.metrics.dataIntegrityPassed = dataIntegrity.passed;
    
    // STAGE 5: Complete
    result.stage = 'COMPLETE';
    result.success = true;
    result.completedAt = new Date();
    result.duration = result.completedAt.getTime() - result.startedAt.getTime();
    
    logger.info('Sync: DEV → Prod COMPLETE', {
      duration: result.duration,
      migrationsApplied: result.metrics.migrationsApplied,
      versionAfter: result.metrics.versionAfter.slice(0, 8)
    });
    
    // Record sync in audit log
    await recordSyncEvent({
      source: 'DEV',
      target: 'PROD',
      result,
      triggeredBy: 'automated'  // or 'manual' if CLI
    });
    
    return result;
    
  } catch (error) {
    result.errors.push({
      stage: result.stage,
      message: error.message,
      stack: error.stack,
      timestamp: new Date()
    });
    
    logger.error('Sync: DEV → Prod FAILED', {
      stage: result.stage,
      error: error.message,
      duration: Date.now() - result.startedAt.getTime()
    });
    
    // Alert on failure
    await sendAlert({
      severity: 'ERROR',
      title: 'DB Sync Failed: DEV → Prod',
      message: `Stage: ${result.stage}\nError: ${error.message}`,
      escalate: true
    });
    
    return result;
  }
}
```

### Prod → Local Sync

```typescript
async function syncProdToLocal(): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    stage: 'VERSION_CHECK',
    startedAt: new Date(),
    errors: [],
    metrics: {
      migrationsApplied: 0,
      schemaIntegrityPassed: false,
      dataIntegrityPassed: false,
      versionBefore: '',
      versionAfter: ''
    }
  };
  
  try {
    // Connect to local DB
    const onPremiseDevPrisma = new PrismaClient({
      datasources: {
        db: { url: 'postgresql://localhost:5432/infinity_gauntlet' }
      }
    });
    
    // STAGE 1: Version Check
    const prodVersion = await getVersion(prisma);
    const localVersion = await getVersion(onPremiseDevPrisma);
    
    const comparison = compareVersions(prodVersion, localVersion);
    
    if (comparison === VersionComparison.BEHIND) {
      await handleReversion(prodVersion, localVersion);
      throw new Error(`Prod is behind Local (Prod: ${prodVersion.count}, Local: ${localVersion.count}). Sync blocked.`);
    }
    
    if (comparison === VersionComparison.MATCH) {
      logger.info('Sync: Prod and Local already in sync');
      result.success = true;
      result.stage = 'COMPLETE';
      return result;
    }
    
    // STAGE 2: pg_dump from Prod
    result.stage = 'MIGRATION_APPLY';
    logger.info('Sync: Creating pg_dump from Prod');
    
    const dumpPath = path.join('Store', 'db', `prod-snapshot-${Date.now()}.sql`);
    
    await execCommand(
      `pg_dump ${getProdDirectUrl()} --clean --if-exists --no-owner --no-acl -f ${dumpPath}`,
      { timeout: 600000 }  // 10min for large DBs
    );
    
    // STAGE 3: Restore to Local
    logger.info('Sync: Restoring dump to Local');
    
    await execCommand(
      `psql postgresql://localhost:5432/infinity_gauntlet -f ${dumpPath}`,
      { timeout: 600000 }
    );
    
    // STAGE 4: Validation
    result.stage = 'VALIDATION';
    
    const localVersionAfter = await getVersion(onPremiseDevPrisma);
    
    if (localVersionAfter.fingerprint !== prodVersion.fingerprint) {
      throw new Error(`Version mismatch after restore!`);
    }
    
    const integrityResult = await verifySchemaIntegrity(prisma, onPremiseDevPrisma);
    result.metrics.schemaIntegrityPassed = integrityResult.passed;
    
    if (!integrityResult.passed) {
      throw new Error(`Integrity check failed: ${JSON.stringify(integrityResult.diffs)}`);
    }
    
    // STAGE 5: Cleanup old snapshots (retain 7 days)
    await pruneOldSnapshots('Store/db', 7);
    
    // Update local-url.txt for config.ts fallback
    await fs.writeFile(
      'Store/db/local-url.txt',
      `postgresql://localhost:5432/infinity_gauntlet\n# Last synced: ${new Date().toISOString()}\n# Version: ${localVersionAfter.fingerprint.slice(0, 8)}`
    );
    
    result.stage = 'COMPLETE';
    result.success = true;
    result.completedAt = new Date();
    result.duration = result.completedAt.getTime() - result.startedAt.getTime();
    
    logger.info('Sync: Prod → Local COMPLETE', { duration: result.duration });
    
    return result;
    
  } catch (error) {
    result.errors.push({ stage: result.stage, message: error.message, timestamp: new Date() });
    logger.error('Sync: Prod → Local FAILED', { stage: result.stage, error: error.message });
    return result;
  }
}
```

---

## Monitoring & Observability

### Metrics Dashboard

```typescript
interface ReplicationMetrics {
  devToProd: {
    lastSyncAt: Date;
    lastSyncDuration: number;
    versionLag: number;              // Prod migrations behind DEV
    syncStatus: 'IN_SYNC' | 'LAGGING' | 'BLOCKED' | 'ERROR';
    lastError?: string;
  };
  prodToLocal: {
    lastSyncAt: Date;
    lastSyncDuration: number;
    versionLag: number;
    syncStatus: 'IN_SYNC' | 'LAGGING' | 'BLOCKED' | 'ERROR';
    lastError?: string;
  };
  versionFingerprints: {
    dev: string;
    prod: string;
    local: string;
  };
  integrityStatus: {
    devProdSchema: 'PASS' | 'FAIL' | 'UNKNOWN';
    prodLocalSchema: 'PASS' | 'FAIL' | 'UNKNOWN';
    lastCheckedAt: Date;
  };
}

async function getReplicationMetrics(): Promise<ReplicationMetrics> {
  const devVersion = await getVersion(devPrisma);
  const prodVersion = await getVersion(prisma);
  const localVersion = await getVersion(onPremiseDevPrisma);
  
  const syncState = await getSyncState();  // From db_sync_state table
  
  return {
    devToProd: {
      lastSyncAt: syncState.devToProd.lastSyncAt,
      lastSyncDuration: syncState.devToProd.lastDuration,
      versionLag: devVersion.count - prodVersion.count,
      syncStatus: calculateSyncStatus(devVersion, prodVersion, syncState.devToProd),
      lastError: syncState.devToProd.lastError
    },
    prodToLocal: {
      lastSyncAt: syncState.prodToLocal.lastSyncAt,
      lastSyncDuration: syncState.prodToLocal.lastDuration,
      versionLag: prodVersion.count - localVersion.count,
      syncStatus: calculateSyncStatus(prodVersion, localVersion, syncState.prodToLocal),
      lastError: syncState.prodToLocal.lastError
    },
    versionFingerprints: {
      dev: devVersion.fingerprint.slice(0, 16),
      prod: prodVersion.fingerprint.slice(0, 16),
      local: localVersion.fingerprint.slice(0, 16)
    },
    integrityStatus: {
      devProdSchema: syncState.devToProd.lastIntegrityCheck?.passed ? 'PASS' : 'FAIL',
      prodLocalSchema: syncState.prodToLocal.lastIntegrityCheck?.passed ? 'PASS' : 'FAIL',
      lastCheckedAt: syncState.lastIntegrityCheckAt
    }
  };
}
```

### Alerting Thresholds

| Condition | Severity | Alert |
|-----------|----------|-------|
| Version lag > 5 migrations | WARNING | "Prod is 5+ migrations behind DEV" |
| Version lag > 10 migrations | ERROR | "Prod is 10+ migrations behind DEV - manual sync required" |
| Sync failure (any stage) | ERROR | "DB sync failed at stage X: {error}" |
| Reversion detected | WARNING | "DEV rolled back migrations - Prod sync blocked" |
| Integrity check failed | ERROR | "Schema integrity failed: {diffs}" |
| Sync duration > 10min | WARNING | "Sync took {duration}ms - investigate performance" |
| Diverged fingerprints | CRITICAL | "DEV and Prod have diverged - manual resolution required" |

### CLI Commands

```bash
# Manual sync triggers
npm run db:sync dev-to-prod      # Force DEV → Prod sync
npm run db:sync prod-to-local    # Force Prod → Local sync
npm run db:sync full-cascade     # DEV → Prod → Local in sequence

# Status checks
npm run db:replication status    # Show current versions and sync state
npm run db:replication metrics   # Full metrics dashboard
npm run db:replication diff      # Show schema diffs between environments

# Integrity verification
npm run db:integrity dev-prod    # Schema comparison only
npm run db:integrity prod-local  # Schema + data validation
npm run db:integrity full        # All environments, all checks

# Version queries
npm run db:version dev           # Show DEV version
npm run db:version prod          # Show Prod version
npm run db:version local         # Show Local version
npm run db:version compare       # Compare all three

# Emergency operations
npm run db:replication block-prod     # Manually block Prod sync
npm run db:replication unblock-prod   # Resume Prod sync
npm run db:replication reset-local    # Drop and rebuild Local from Prod
```

---

## Implementation Phases

### Phase 1: Version Tracking Foundation (READY)
- **Tasks:**
  - Create `db_version` table in schema
  - Implement `getVersion()` function for each client
  - Build `compareVersions()` logic
  - Add migration fingerprint calculation
  - Create `db_sync_state` table for tracking sync status
- **Deliverables:**
  - `src/services/db-replication/version.ts` — Version tracking module
  - Migration: `create_db_version_tables.sql`
  - Tests: version comparison, fingerprint calculation, reversion detection

### Phase 2: Integrity Verification (READY)
- **Tasks:**
  - Implement schema comparison (`verifySchemaIntegrity()`)
  - Build data validation (`verifyDataIntegrity()`)
  - Create diff reporting utilities
  - Add FK validation checks
  - Build enum comparison logic
- **Deliverables:**
  - `src/services/db-replication/integrity.ts` — Integrity module
  - Tests: schema diffs, data checksums, FK violations

### Phase 3: Sync Orchestrator (READY after Phase 1+2)
- **Tasks:**
  - Build `syncDevToProd()` orchestrator
  - Build `syncProdToLocal()` orchestrator
  - Implement error handling and rollback
  - Add idempotency checks
  - Create sync event logging
- **Deliverables:**
  - `src/services/db-replication/sync.ts` — Sync orchestration
  - `src/services/db-replication/rollback.ts` — Rollback handling
  - Tests: sync success, sync failure, partial sync, rollback

### Phase 4: Monitoring & Alerting (READY after Phase 3)
- **Tasks:**
  - Build `getReplicationMetrics()` dashboard
  - Implement alerting thresholds
  - Add `/ops replication` command to bot
  - Create automated sync scheduler
  - Add Prometheus metrics export
- **Deliverables:**
  - `src/services/db-replication/monitoring.ts` — Metrics module
  - `src/bot/ops/replication.ts` — Admin commands
  - Tests: metrics calculation, alert triggers

### Phase 5: CLI & Automation (READY after Phase 4)
- **Tasks:**
  - Create CLI commands for manual sync/status
  - Build automated sync scheduler (cron/worker)
  - Add emergency block/unblock controls
  - Implement local DB reset tooling
  - Create operational runbooks
- **Deliverables:**
  - `scripts/db_replication.ts` — CLI interface
  - `src/workers/db-sync-worker.ts` — Automated sync
  - `docs/db-replication-runbook.md` — Operations guide
  - Updated `ops/DB_BOOTSTRAP.md` with replication architecture

### Phase 6: Multi-Connection Integration (READY after Phase 5)
- **Tasks:**
  - Extend dual Prisma client (devPrisma/prisma) with onPremiseDevPrisma
  - Add connection health checks with version awareness
  - Implement failover logic respecting version constraints
  - Update `src/shared/config.ts` fallback to check Local version
  - Add replication state to connection telemetry
- **Deliverables:**
  - Updated `src/shared/prisma.ts` with onPremiseDevPrisma
  - Updated `src/utils/logger.js` with replication metrics
  - Tests: connection failover with version gating

---

## Silent Error Elimination

**Principle:** Every operation must have explicit validation with detailed logging. No assumptions.

### Error Detection Points

| Stage | Validation | On Failure |
|-------|-----------|------------|
| **Version Check** | Fingerprint calculation succeeds | Log error + alert, block sync |
| **Version Comparison** | Comparison returns valid enum | Log error + alert, block sync |
| **Migration Deployment** | Exit code === 0 AND stderr empty | Log stderr + alert, rollback |
| **Post-Migration Version** | Fingerprint matches expected | Log mismatch + alert, rollback |
| **Schema Integrity** | All diffs array empty | Log diffs + alert, block next stage |
| **Data Integrity** | All checks passed | Log failures + alert, block next stage |
| **Local Restore** | pg_restore exit code === 0 | Log error + alert, mark restore failed |
| **Snapshot Cleanup** | All old files deleted | Log stale files, retry cleanup |

### Logging Requirements

```typescript
// Every sync operation logs:
logger.info('DB Sync Started', {
  source: 'DEV',
  target: 'PROD',
  triggeredBy: 'automated',
  timestamp: new Date().toISOString()
});

// Every stage transition logs:
logger.info('DB Sync Stage', {
  source: 'DEV',
  target: 'PROD',
  stage: 'INTEGRITY_VERIFY',
  previousStage: 'VERSION_CHECK',
  timestamp: new Date().toISOString()
});

// Every validation logs:
logger.info('DB Sync Validation', {
  check: 'schema_integrity',
  passed: true,
  details: { tablesMatch: true, columnsMatch: true },
  timestamp: new Date().toISOString()
});

// Every error logs:
logger.error('DB Sync Error', {
  source: 'DEV',
  target: 'PROD',
  stage: 'MIGRATION_APPLY',
  error: error.message,
  stack: error.stack,
  timestamp: new Date().toISOString(),
  escalate: true  // Trigger alert
});
```

---

## Operational Workflows

### Daily Automated Sync

```yaml
schedule:
  dev_to_prod:
    cron: "0 */6 * * *"  # Every 6 hours
    command: npm run db:sync dev-to-prod
    timeout: 600s
    on_success: log_metrics
    on_failure: alert_ops
  
  prod_to_local:
    cron: "0 2 * * *"    # Daily at 2 AM
    command: npm run db:sync prod-to-local
    timeout: 1200s
    on_success: log_metrics
    on_failure: alert_ops
```

### Emergency Rollback Procedure

```bash
# 1. Identify last known good version
npm run db:version compare

# 2. Block downstream syncs
npm run db:replication block-prod
npm run db:replication block-local

# 3. Roll back DEV to target migration
cd prisma/migrations
# Find target migration timestamp
npx prisma migrate resolve --rolled-back <migration_name>

# 4. Verify DEV schema
npm run db:integrity dev-prod

# 5. Unblock syncs when DEV reaches stable version
npm run db:replication unblock-prod

# 6. Force sync cascade
npm run db:sync full-cascade
```

### Version Conflict Resolution

```bash
# Scenario: DEV and Prod diverged (different fingerprints at same count)

# 1. Dump both schemas for comparison
npm run db:schema dump dev > dev-schema.sql
npm run db:schema dump prod > prod-schema.sql

# 2. Analyze differences
diff dev-schema.sql prod-schema.sql

# 3. Decide on resolution:
#    Option A: Prod is correct → Reset DEV from Prod
#    Option B: DEV is correct → Reset Prod from DEV (DANGEROUS!)
#    Option C: Manual merge required

# 4. Execute resolution (Option A example)
npm run db:replication reset-dev-from-prod --confirm

# 5. Verify convergence
npm run db:version compare
```

---

## Success Criteria

- ✅ DEV is the single source of truth for all schema changes
- ✅ Prod mirrors DEV within 6 hours (automated sync cadence)
- ✅ on-premise mirrors Prod within 24 hours (daily sync)
- ✅ Version mismatches detected and blocked automatically
- ✅ Reversions detected and handled gracefully
- ✅ Schema integrity verified before every sync completion
- ✅ Data integrity spot-checked on critical tables
- ✅ All sync operations logged with detailed metrics
- ✅ Alerts triggered on failures within 5 minutes
- ✅ Manual sync/rollback tools available for emergencies
- ✅ Zero silent errors (all failures logged and alerted)
- ✅ Multi-connection architecture respects version constraints
- ✅ Operators have visibility into replication health via dashboard

---

## Next Steps

1. **Review this design with stakeholders** — Validate architecture decisions
2. **Create Tasklist entries** — Break down into actionable tasks
3. **Update Prompt.md & NEXT.yaml** — Queue Phase 1 as READY
4. **Implement Phase 1** — Version tracking foundation
5. **Test thoroughly** — Version comparison, fingerprint calculation, reversion detection
6. **Proceed to Phase 2** — Integrity verification framework
7. **Document operational workflows** — Runbooks, CLI usage, emergency procedures

---

**Document Owner:** Database Systems  
**Status:** DESIGN PHASE → Ready for implementation planning  
**Next Action:** Create Tasklist entries for Phase 1-6 implementation
