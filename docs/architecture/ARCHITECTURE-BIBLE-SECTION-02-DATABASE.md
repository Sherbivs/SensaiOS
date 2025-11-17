# Architecture Bible — Section 2: Database Architecture

**Part of:** [ARCHITECTURE-BIBLE.md](./ARCHITECTURE-BIBLE.md)  
**Section:** 2 of 14  
**Last Updated:** 2025-11-17

## Overview

This section documents the complete database replication architecture including cloud nodes, on-premise mirrors, and version control mechanisms.

## Primary Sources

### Main Documentation
- **Database Replication Architecture**: `docs/database/db-replication-architecture.md`
- **Database Configuration**: `docs/database/database-configuration.md`
- **Database URL Selection**: `docs/database/database-url-selection.md`

### Implementation Files
- **Prisma Client**: `src/shared/prisma.ts` - Triple database connection management
- **Version Control**: `src/services/db-replication/version.ts` - Version fingerprinting
- **Integrity Verification**: `src/services/db-replication/integrity.ts` - Schema validation

## Architecture Overview

### 4-Tier Database Structure

```
Production (Render)          Workstation (OFFLINE - Local Dev Only)
-------------------          ----------------------------------------

Infinity-Gauntlet-DB ───┐     ONPREMISE-DEV-PRIMARY DB
(Render managed)       │     Port: 55433
Production database    │     Store: Store/onpremise-dev-primary/
All services connect   │     URL: DATABASE_ONPREMISE_DEV_PRIMARY
here                   │     Sync: PULL from Render (one-way)
                       │     Purpose: Local development with cloud-like data
                       │              │
                       ▼              │ Manual Clone
                  Downloads to        ▼
                  workstation    ONPREMISE-DEV-EXPERIMENT
                                 Port: 55434
                                 Store: Store/onpremise-dev-primary-experiment/
                                 URL: DATABASE_ONPREMISE_DEV_EXPERIMENT
                                 Sync: MANUAL clone from ONPREMISE-DEV-PRIMARY
                                 Purpose: Migration testing (isolated)

                                 │
                                 │ EXPLICIT PUSH (when ready)
                                 ▼
                            Upload to Render DB
                            (migrations, schema changes)
```

**CRITICAL:** Both on-premise databases are **completely offline and isolated**. Production cannot see or access either on-premise database.

## Version Control System

### Version Fingerprint Calculation

Each database tracks version via SHA-256 fingerprint of migration history:

```typescript
const migrations = await prisma.$queryRaw`
  SELECT migration_name, checksum 
  FROM _prisma_migrations 
  ORDER BY started_at ASC
`;

const fingerprintInput = migrations
  .map(m => `${m.migration_name}:${m.checksum}`)
  .join('|');

const versionFingerprint = crypto
  .createHash('sha256')
  .update(fingerprintInput)
  .digest('hex');
```

### Version Comparison States

```typescript
enum VersionComparison {
  MATCH = 'MATCH',           // Fingerprints identical
  AHEAD = 'AHEAD',           // Source has more migrations
  BEHIND = 'BEHIND',         // Source has fewer migrations (reversion!)
  DIVERGED = 'DIVERGED'      // Different fingerprints at same count
}
```

### Reversion Handling

**Scenario:** PROD rolled back from migration 50 to migration 45

```typescript
// PROD: version_fingerprint = hash(migrations 1-45), count = 45
// Replica: version_fingerprint = hash(migrations 1-50), count = 50
// Comparison: PROD is BEHIND Replica

async function handleReversion(prodVersion: Version, replicaVersion: Version) {
  logger.warn('Reversion detected', {
    prod: { count: prodVersion.count, last: prodVersion.lastMigration },
    replica: { count: replicaVersion.count, last: replicaVersion.lastMigration },
    rollbackDepth: replicaVersion.count - prodVersion.count
  });
  
  // Block replica sync until PROD catches up
  await updateSyncState('REPLICA', {
    status: 'WAITING_FOR_MASTER',
    reason: `PROD rolled back ${replicaVersion.count - prodVersion.count} migrations`,
    waitingForVersion: prodVersion.count + 1,
    blockedAt: new Date()
  });
  
  // Alert operators
  await sendAlert({
    severity: 'WARNING',
    title: 'DB Reversion Detected',
    message: `PROD rolled back to migration ${prodVersion.lastMigration}. Replica sync blocked.`
  });
}
```

## Integrity Verification Framework

### Schema Comparison

```typescript
interface SchemaIntegrityResult {
  passed: boolean;
  diffs: SchemaDiff[];
  summary: {
    tablesMatch: boolean;
    columnsMatch: boolean;
    indexesMatch: boolean;
    constraintsMatch: boolean;
    enumsMatch: boolean;
  };
}

async function verifySchemaIntegrity(
  sourcePrisma: PrismaClient,
  targetPrisma: PrismaClient,
  options: { skipTables?: string[] } = {}
): Promise<SchemaIntegrityResult> {
  const diffs: SchemaDiff[] = [];
  
  // 1. Compare tables
  const sourceTables = await getTableNames(sourcePrisma);
  const targetTables = await getTableNames(targetPrisma);
  
  const missingTables = sourceTables.filter(t => !targetTables.includes(t));
  const extraTables = targetTables.filter(t => !sourceTables.includes(t));
  
  // 2. Compare columns for matching tables
  const commonTables = sourceTables.filter(t => targetTables.includes(t));
  
  for (const table of commonTables) {
    if (options.skipTables?.includes(table)) continue;
    
    const sourceColumns = await getColumnSchema(sourcePrisma, table);
    const targetColumns = await getColumnSchema(targetPrisma, table);
    
    const columnDiffs = compareColumns(table, sourceColumns, targetColumns);
    diffs.push(...columnDiffs);
  }
  
  // 3. Compare indexes
  const indexDiffs = await compareIndexes(sourcePrisma, targetPrisma);
  diffs.push(...indexDiffs);
  
  // 4. Compare constraints
  const constraintDiffs = await compareConstraints(sourcePrisma, targetPrisma);
  diffs.push(...constraintDiffs);
  
  // 5. Compare enums
  const enumDiffs = await compareEnums(sourcePrisma, targetPrisma);
  diffs.push(...enumDiffs);
  
  return {
    passed: diffs.length === 0,
    diffs,
    summary: {
      tablesMatch: !diffs.some(d => d.type === 'TABLE'),
      columnsMatch: !diffs.some(d => d.type === 'COLUMN'),
      indexesMatch: !diffs.some(d => d.type === 'INDEX'),
      constraintsMatch: !diffs.some(d => d.type === 'CONSTRAINT'),
      enumsMatch: !diffs.some(d => d.type === 'ENUM')
    }
  };
}
```

## Database Connection Architecture

### Runtime Prisma Clients

The system maintains **three simultaneous Prisma clients**:

```typescript
import { prisma, onPremiseDevPrisma, onPremiseExperimentPrisma } from "../shared/prisma.js";

// PRIMARY: Production database (Render managed)
const prodUsers = await prisma.user.findMany(); // PROD_DATABASE_URL

// OPTIONAL: Workstation mirror (offline development)
if (onPremiseDevPrisma) {
  const localUsers = await onPremiseDevPrisma.user.findMany(); // DATABASE_ONPREMISE_DEV_PRIMARY
}

// OPTIONAL: Migration testing (isolated experiments)
if (onPremiseExperimentPrisma) {
  const experimentUsers = await onPremiseExperimentPrisma.user.findMany(); // DATABASE_ONPREMISE_DEV_EXPERIMENT
}
```

### Environment Variable Priority

1. `PROD_DATABASE_URL` → PRIMARY production database (Render managed)
2. `RENDER_DB_EXTERNAL_URL` → Direct PostgreSQL access (external)
3. `DATABASE_ONPREMISE_DEV_PRIMARY` → Workstation mirror (offline mode)
4. `DATABASE_ONPREMISE_DEV_EXPERIMENT` → Migration testing cluster

## Migration Testing Workflow

```bash
# Step 1: Ensure ONPREMISE-DEV-PRIMARY is up-to-date
npm run ops:bootstrap-onpremise-dev

# Step 2: Clone ONPREMISE-DEV-PRIMARY to ONPREMISE-DEV-EXPERIMENT (100% OFFLINE)
npm run ops:bootstrap-onpremise-experiment

# Step 3: Test Phase 2 migration on ONPREMISE-DEV-EXPERIMENT (100% OFFLINE)
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql

# Step 4: Validate migration results (100% OFFLINE)
npm run db:cli -- count User --target experiment
npm run db:cli -- query "SELECT COUNT(*) FROM \"TrainerProfile\";" --target experiment

# Step 5: Test rollback if needed (100% OFFLINE)
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/rollback.sql

# Step 6: Validate on ONPREMISE-DEV-PRIMARY if successful (100% OFFLINE)
npm run ops:sync-onpremise-experiment --from local
psql postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql

# Step 7: ONLY AFTER LOCAL VALIDATION - Push to Render database (CLOUD OPERATION)
psql $PROD_DATABASE_URL -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql
```

## Storage Quotas & Management

### Cloud Databases

- **Render PROD**: 0.5 GB allocation
- **Render DEV**: 1.0 GB allocation (deprecated in unified architecture)

### Workstation Databases

- **ONPREMISE-DEV-PRIMARY**: 3 timestamped snapshots (configurable)
- **ONPREMISE-DEV-EXPERIMENT**: 2 manual snapshots (configurable)

### Monitoring Commands

```bash
# Check database size
npm run db:cli -- query "SELECT pg_size_pretty(pg_database_size(current_database()));"

# List all databases with status
npm run db:cli -- databases

# Check specific database status
npm run db:cli -- status --target=prod
npm run db:cli -- status --target=local
npm run db:cli -- status --target=experiment
```

## Prisma Client Telemetry

The system maintains independent heartbeat monitoring for all database connections:

- **Interval**: Every 30 seconds
- **Latency tracking**: Records query execution time via `SELECT 1`
- **Status**: `healthy`, `degraded`, `reconnecting`, `error`, `offline`
- **Telemetry**: Displayed in console output, restart DMs, `/ops` commands

## Safety Rules

✅ **DO** remember both on-premise databases are OFFLINE (localhost-only)  
✅ **DO** test migrations on ONPREMISE-DEV-EXPERIMENT before ONPREMISE-DEV-PRIMARY  
✅ **DO** validate migrations on ONPREMISE-DEV-PRIMARY before pushing to Render  
✅ **DO** document testing results in Tasklist.md  
❌ **DON'T** expect production to see local database changes  
❌ **DON'T** assume local databases replicate automatically to cloud  
❌ **DON'T** skip ONPREMISE-DEV-EXPERIMENT testing — always test destructive operations offline first

## Related Documentation

- **Database Replication Architecture**: `docs/database/db-replication-architecture.md`
- **Database Configuration**: `docs/database/database-configuration.md`
- **Dual On-Premise Guide**: `docs/database/dual-onpremise-database-guide.md`
- **URL Selection Logic**: `docs/database/database-url-selection.md`
- **Workstation Gameplay Setup**: `docs/WORKSTATION-GAMEPLAY-SETUP.md`

---

**Navigation:**  
← [Section 1: Introduction](./ARCHITECTURE-BIBLE-SECTION-01-INTRODUCTION.md) | [Back to Index](./ARCHITECTURE-BIBLE.md) | [Section 3: Worker Architecture](./ARCHITECTURE-BIBLE-SECTION-03-WORKERS.md) →
