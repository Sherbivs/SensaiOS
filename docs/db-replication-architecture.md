# Database Replication Architecture — Master-Replica Cascade with Version Control

**Status:** DESIGN PHASE  
**Owner:** Database Systems  
**Last Updated:** 2025-11-06

---

## Executive Summary

This document defines a **comprehensive, automated database replication system** with:
- **DEV as master** — All schema changes originate here
- **Cascading replication** — DEV → Prisma (prod) → Local DB with version gating
- **Integrity verification** — Automated schema/data validation at each hop
- **Silent error elimination** — Explicit validation, detailed logging, no assumptions
- **Version control** — Migration-based versioning with reversion detection
- **Multi-connection integration** — Leverages existing dual Prisma client architecture
- **Observability** — Real-time monitoring, alerting, and dashboard visibility

**Core Principle:** DEV is the single source of truth. Downstream replicas (Prisma prod, Local workstation) mirror DEV perfectly unless waiting for DEV to catch up after a reversion.

---

## Architecture Overview

### Data Flow Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                          DATA CHANGE SOURCE                          │
│                     (Developer, Migration, Script)                   │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      DEV DATABASE (MASTER)                           │
│  Host: dpg-...render.com/infinity_gauntlet_db                       │
│  Role: Single source of truth                                        │
│  Connection: DATABASE_DIRECT_URL (devPrisma)                        │
│                                                                       │
│  Operations:                                                          │
│  - Receives ALL schema migrations first                              │
│  - Accepts data changes from developers/scripts                      │
│  - Tracks version via _prisma_migrations + db_version table         │
│  - Validates migration integrity before marking applied              │
│                                                                       │
│  Version Tracking:                                                    │
│  - Migration count + checksum = version fingerprint                 │
│  - Emits version on every schema change                              │
│  - Logs version changes to audit trail                               │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   │ Sync Trigger (automated/manual)
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │  VERSION GATE CHECK   │
                       │  DEV version >= Prod? │
                       └───────────┬───────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                │ YES: Proceed                        │ NO: Wait/Alert
                ▼                                     │
┌──────────────────────────────────────────────────────────────────────┐
│                     INTEGRITY VERIFICATION                           │
│  - Schema comparison (tables, columns, indexes, constraints)        │
│  - Data checksums (configurable tables)                              │
│  - Row count validation                                              │
│  - Foreign key integrity                                             │
│  - Enum value matching                                               │
│                                                                       │
│  Output: PASS (sync proceeds) / FAIL (abort + alert)                │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    PRISMA DB (PRODUCTION REPLICA)                    │
│  Host: accelerate.prisma-data.net (via Accelerate proxy)           │
│  Role: Production query layer with caching                           │
│  Connection: DATABASE_POOL_URL (prisma)                             │
│                                                                       │
│  Operations:                                                          │
│  - Receives migrations ONLY after DEV successful                     │
│  - Uses secrets/migrate.env for DDL (direct PostgreSQL)             │
│  - Runs integrity tests against DEV before accepting                 │
│  - Updates version tracking after successful sync                    │
│  - Serves production game operations via Accelerate cache            │
│                                                                       │
│  Version Constraint:                                                  │
│  - MUST match or lag behind DEV version                              │
│  - Blocks sync if DEV version < Prod version (reversion detected)   │
│  - Waits for DEV to reach Prod version + 1 before resuming          │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   │ Sync Trigger (automated/manual)
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │  VERSION GATE CHECK   │
                       │  Prod version >= Local?│
                       └───────────┬───────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                │ YES: Proceed                        │ NO: Wait/Alert
                ▼                                     │
┌──────────────────────────────────────────────────────────────────────┐
│                     INTEGRITY VERIFICATION                           │
│  - Schema comparison against Prod                                    │
│  - Data checksums (critical tables)                                  │
│  - Row count validation                                              │
│  - Migration history matching                                        │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                LOCAL DB (WORKSTATION MIRROR)                         │
│  Host: localhost:5432 (Store/db/ via PostgreSQL portable)          │
│  Role: Offline development fallback                                  │
│  Connection: postgresql://localhost:5432/infinity_gauntlet          │
│                                                                       │
│  Operations:                                                          │
│  - Mirrors Prod for offline dev work                                 │
│  - Receives pg_dump from Prod, restores via pg_restore              │
│  - Runs integrity tests against Prod before accepting                │
│  - Updates version tracking after successful restore                 │
│  - Used by src/shared/config.ts when Render/Accelerate unavailable  │
│                                                                       │
│  Version Constraint:                                                  │
│  - MUST match or lag behind Prod version                             │
│  - Blocks restore if Prod version < Local version                    │
│  - Prunes stale snapshots (7-day retention)                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Version Control System

### Version Fingerprint Calculation

Each database instance tracks its version via:

```sql
CREATE TABLE IF NOT EXISTS db_version (
  id SERIAL PRIMARY KEY,
  version_fingerprint TEXT NOT NULL,        -- SHA-256(migration_names + checksums)
  migration_count INTEGER NOT NULL,         -- Total applied migrations
  last_migration_name TEXT NOT NULL,        -- Most recent migration
  last_migration_applied_at TIMESTAMPTZ NOT NULL,
  sync_source TEXT,                         -- 'DEV' | 'PROD' | 'LOCAL'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Fingerprint Formula:**
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

const version = {
  fingerprint: versionFingerprint,
  count: migrations.length,
  lastMigration: migrations[migrations.length - 1].migration_name,
  lastAppliedAt: migrations[migrations.length - 1].finished_at
};
```

### Version Comparison Logic

```typescript
enum VersionComparison {
  MATCH = 'MATCH',           // Fingerprints identical
  AHEAD = 'AHEAD',           // Source has more migrations
  BEHIND = 'BEHIND',         // Source has fewer migrations (reversion!)
  DIVERGED = 'DIVERGED'      // Different fingerprints at same count
}

function compareVersions(source: Version, target: Version): VersionComparison {
  if (source.fingerprint === target.fingerprint) {
    return VersionComparison.MATCH;
  }
  
  if (source.count > target.count) {
    // Check if target's migrations are a prefix of source's
    const targetFingerprint = calculateFingerprintUpTo(source.migrations, target.count);
    return targetFingerprint === target.fingerprint 
      ? VersionComparison.AHEAD 
      : VersionComparison.DIVERGED;
  }
  
  if (source.count < target.count) {
    // Reversion detected! Source rolled back migrations
    return VersionComparison.BEHIND;
  }
  
  // Same count but different fingerprints
  return VersionComparison.DIVERGED;
}
```

### Reversion Handling

**Scenario:** DEV rolled back from migration 50 to migration 45

```typescript
// DEV: version_fingerprint = hash(migrations 1-45), count = 45
// Prod: version_fingerprint = hash(migrations 1-50), count = 50
// Comparison: DEV is BEHIND Prod

async function handleReversion(devVersion: Version, prodVersion: Version) {
  logger.warn('Reversion detected', {
    dev: { count: devVersion.count, last: devVersion.lastMigration },
    prod: { count: prodVersion.count, last: prodVersion.lastMigration },
    rollbackDepth: prodVersion.count - devVersion.count
  });
  
  // Block Prod sync until DEV catches up
  await updateSyncState('PROD', {
    status: 'WAITING_FOR_MASTER',
    reason: `DEV rolled back ${prodVersion.count - devVersion.count} migrations`,
    waitingForVersion: devVersion.count + 1,
    blockedAt: new Date()
  });
  
  // Alert operators
  await sendAlert({
    severity: 'WARNING',
    title: 'DB Reversion Detected',
    message: `DEV rolled back to migration ${devVersion.lastMigration}. Prod sync blocked until DEV >= ${prodVersion.count + 1} migrations.`,
    escalate: true
  });
}
```

---

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

interface SchemaDiff {
  type: 'TABLE' | 'COLUMN' | 'INDEX' | 'CONSTRAINT' | 'ENUM';
  action: 'MISSING' | 'EXTRA' | 'MISMATCH';
  source: string;  // e.g., 'DEV'
  target: string;  // e.g., 'PROD'
  path: string;    // e.g., 'User.email' or 'idx_users_email'
  details: Record<string, any>;
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
  
  missingTables.forEach(table => {
    diffs.push({
      type: 'TABLE',
      action: 'MISSING',
      source: 'source',
      target: 'target',
      path: table,
      details: {}
    });
  });
  
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
  
  // 4. Compare constraints (FK, unique, check)
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

### Data Integrity Checks

```typescript
interface DataIntegrityResult {
  passed: boolean;
  checks: DataCheck[];
  summary: {
    rowCountsMatch: boolean;
    checksumsMatch: boolean;
    foreignKeysValid: boolean;
  };
}

interface DataCheck {
  table: string;
  check: 'ROW_COUNT' | 'CHECKSUM' | 'FK_INTEGRITY';
  passed: boolean;
  source: any;
  target: any;
  difference?: number | string;
}

async function verifyDataIntegrity(
  sourcePrisma: PrismaClient,
  targetPrisma: PrismaClient,
  options: {
    tables?: string[];           // Limit to specific tables
    skipChecksums?: boolean;     // Skip expensive checksums
    sampleSize?: number;         // Sample rows for large tables
  } = {}
): Promise<DataIntegrityResult> {
  const checks: DataCheck[] = [];
  
  const tables = options.tables || await getTableNames(sourcePrisma);
  
  for (const table of tables) {
    // 1. Row count comparison
    const sourceCount = await sourcePrisma.$queryRaw`
      SELECT COUNT(*) as count FROM ${Prisma.raw(table)}
    `;
    const targetCount = await targetPrisma.$queryRaw`
      SELECT COUNT(*) as count FROM ${Prisma.raw(table)}
    `;
    
    const rowCountMatch = sourceCount[0].count === targetCount[0].count;
    checks.push({
      table,
      check: 'ROW_COUNT',
      passed: rowCountMatch,
      source: sourceCount[0].count,
      target: targetCount[0].count,
      difference: rowCountMatch ? 0 : Math.abs(sourceCount[0].count - targetCount[0].count)
    });
    
    // 2. Data checksum (if enabled and counts match)
    if (!options.skipChecksums && rowCountMatch) {
      const sourceChecksum = await calculateTableChecksum(sourcePrisma, table, options.sampleSize);
      const targetChecksum = await calculateTableChecksum(targetPrisma, table, options.sampleSize);
      
      checks.push({
        table,
        check: 'CHECKSUM',
        passed: sourceChecksum === targetChecksum,
        source: sourceChecksum,
        target: targetChecksum
      });
    }
  }
  
  // 3. Foreign key integrity (target only)
  const fkChecks = await validateForeignKeys(targetPrisma);
  checks.push(...fkChecks);
  
  return {
    passed: checks.every(c => c.passed),
    checks,
    summary: {
      rowCountsMatch: checks.filter(c => c.check === 'ROW_COUNT').every(c => c.passed),
      checksumsMatch: checks.filter(c => c.check === 'CHECKSUM').every(c => c.passed),
      foreignKeysValid: checks.filter(c => c.check === 'FK_INTEGRITY').every(c => c.passed)
    }
  };
}
```

---

## Sync Orchestration

### DEV → Prisma (Prod) Sync

```typescript
interface SyncResult {
  success: boolean;
  stage: 'VERSION_CHECK' | 'INTEGRITY_VERIFY' | 'MIGRATION_APPLY' | 'VALIDATION' | 'COMPLETE';
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  errors: SyncError[];
  metrics: SyncMetrics;
}

interface SyncMetrics {
  migrationsApplied: number;
  schemaIntegrityPassed: boolean;
  dataIntegrityPassed: boolean;
  versionBefore: string;
  versionAfter: string;
  bytesTransferred?: number;
}

async function syncDevToProd(): Promise<SyncResult> {
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
    // STAGE 1: Version Check
    logger.info('Sync: DEV → Prod - Stage 1: Version Check');
    
    const devVersion = await getVersion(devPrisma);
    const prodVersion = await getVersion(prisma);
    
    result.metrics.versionBefore = prodVersion.fingerprint;
    
    const comparison = compareVersions(devVersion, prodVersion);
    
    if (comparison === VersionComparison.BEHIND) {
      // Reversion detected!
      await handleReversion(devVersion, prodVersion);
      throw new Error(`DEV is behind Prod (DEV: ${devVersion.count}, Prod: ${prodVersion.count}). Sync blocked.`);
    }
    
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
    const localPrisma = new PrismaClient({
      datasources: {
        db: { url: 'postgresql://localhost:5432/infinity_gauntlet' }
      }
    });
    
    // STAGE 1: Version Check
    const prodVersion = await getVersion(prisma);
    const localVersion = await getVersion(localPrisma);
    
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
    
    const localVersionAfter = await getVersion(localPrisma);
    
    if (localVersionAfter.fingerprint !== prodVersion.fingerprint) {
      throw new Error(`Version mismatch after restore!`);
    }
    
    const integrityResult = await verifySchemaIntegrity(prisma, localPrisma);
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
  const localVersion = await getVersion(localPrisma);
  
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
  - Extend dual Prisma client (devPrisma/prisma) with localPrisma
  - Add connection health checks with version awareness
  - Implement failover logic respecting version constraints
  - Update `src/shared/config.ts` fallback to check Local version
  - Add replication state to connection telemetry
- **Deliverables:**
  - Updated `src/shared/prisma.ts` with localPrisma
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
- ✅ Local mirrors Prod within 24 hours (daily sync)
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
