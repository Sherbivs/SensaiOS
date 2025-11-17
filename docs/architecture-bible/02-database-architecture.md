# Section 2: Database Architecture

[← Back to INDEX](INDEX.md) | [← Previous: System Overview](01-system-overview.md) | [Next: Worker Architecture →](03-worker-architecture.md)

---

**Philosophy**: "The database is the source of truth—consistent, reliable, and always available."

**Purpose**: Unified Render-managed PostgreSQL architecture with optional workstation mirrors for offline development and migration testing.

## 2.1 Production Architecture

**As of 2025-11-08**, production uses **unified Render-managed PostgreSQL**.

**The Architecture:**
- **PRODUCTION (Render)**: Single managed database (infinity-gauntlet-db) accessed via PROD_DATABASE_URL
- **LOCAL DEVELOPMENT**: Optional on-premise database (DATABASE_ONPREMISE_DEV_PRIMARY) for offline work

**Database Instances:**

1. **PROD_DATABASE_URL** — Render-managed PostgreSQL (PRIMARY for all operations)
   - Host: dpg-d3vd8h7diees73et3i3g-a.render.com
   - Purpose: Production gameplay, migrations, all live operations
   - Latency: 50-100ms (Render to Render)
   - Connection: Direct PostgreSQL (no pooling)

2. **DATABASE_ONPREMISE_DEV_PRIMARY** — Workstation mirror (OPTIONAL)
   - Host: localhost:55433
   - Storage: Store/onpremise-dev-primary/
   - Purpose: Offline development fallback
   - Sync: Manual PULL from Render database (one-way)
   - Latency: <50ms (local)

3. **DATABASE_ONPREMISE_DEV_EXPERIMENT** — Testing cluster (OPTIONAL)
   - Host: localhost:55434
   - Storage: Store/onpremise-dev-primary-experiment/
   - Purpose: Migration testing (isolated experiments)
   - Sync: Manual clone from PRIMARY or DEV
   - **CRITICAL**: 100% OFFLINE — Production cannot see this database

**Prisma Client Architecture:**

```typescript
import { prisma, onPremiseDevPrisma, onPremiseExperimentPrisma } from "../shared/prisma.js";

// PRIMARY: Unified Render-managed PostgreSQL (all production operations)
const prodUsers = await prisma.user.findMany(); // PROD_DATABASE_URL

// OPTIONAL: Workstation development (offline fallback)
if (onPremiseDevPrisma) {
  const localUsers = await onPremiseDevPrisma.user.findMany(); // DATABASE_ONPREMISE_DEV_PRIMARY
}

// OPTIONAL: Migration testing (isolated experiments)
if (onPremiseExperimentPrisma) {
  const experimentUsers = await onPremiseExperimentPrisma.user.findMany(); // DATABASE_ONPREMISE_DEV_EXPERIMENT
}
```

**Environment Variable Priority:**
1. `PROD_DATABASE_URL` → PRIMARY production database (Render managed)
2. `RENDER_DB_EXTERNAL_URL` → Direct PostgreSQL access (external)
3. `DATABASE_ONPREMISE_DEV_PRIMARY` → Workstation mirror (offline mode)
4. `DATABASE_ONPREMISE_DEV_EXPERIMENT` → Migration testing cluster

## 2.2 Database Replication

**Master-Replica Cascade with Version Control** — Automated replication system with integrity verification.

**Core Principle:** Render database is the single source of truth. Workstation databases mirror production perfectly unless waiting for production to catch up after a reversion.

### Data Flow Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                          DATA CHANGE SOURCE                          │
│                     (Developer, Migration, Script)                   │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  RENDER DATABASE (PRODUCTION MASTER)                 │
│  Host: dpg-...render.com/infinity_gauntlet_db                       │
│  Role: Single source of truth                                        │
│  Connection: PROD_DATABASE_URL                                       │
│                                                                       │
│  Operations:                                                          │
│  - Receives ALL schema migrations first                              │
│  - Accepts data changes from developers/scripts                      │
│  - Tracks version via _prisma_migrations + db_version table         │
│  - Validates migration integrity before marking applied              │
│                                                                       │
│  Version Tracking:                                                    │
│  - Migration count + checksum = version fingerprint (SHA-256)       │
│  - Emits version on every schema change                              │
│  - Logs version changes to audit trail                               │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   │ Sync Trigger (automated/manual)
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │  VERSION GATE CHECK   │
                       │  Render version >= Local? │
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
│                LOCAL DB (WORKSTATION MIRROR)                         │
│  Host: localhost:55433 (Store/onpremise-dev-primary/)               │
│  Role: Offline development fallback                                  │
│  Connection: DATABASE_ONPREMISE_DEV_PRIMARY                          │
│                                                                       │
│  Operations:                                                          │
│  - Mirrors Render database for offline dev work                     │
│  - Receives pg_dump from Render, restores via pg_restore            │
│  - Runs integrity tests against Render before accepting             │
│  - Updates version tracking after successful restore                 │
│  - Used by src/shared/config.ts when Render unavailable             │
│                                                                       │
│  Version Constraint:                                                  │
│  - MUST match or lag behind Render version                           │
│  - Blocks restore if Render version < Local version                 │
│  - Prunes stale snapshots (7-day retention)                          │
└──────────────────────────────────────────────────────────────────────┘
```

### Version Control System

**Version Fingerprint Calculation:**

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

**Version Comparison Logic:**

```typescript
enum VersionComparison {
  MATCH = 'MATCH',           // Fingerprints identical
  AHEAD = 'AHEAD',           // Source has more migrations
  BEHIND = 'BEHIND',         // Source has fewer migrations (reversion!)
  DIVERGED = 'DIVERGED'      // Different fingerprints at same count
}
```

**Reversion Handling:**

When production rolls back migrations, sync is blocked until production catches up:

```typescript
async function handleReversion(prodVersion: Version, localVersion: Version) {
  logger.warn('Reversion detected', {
    prod: { count: prodVersion.count, last: prodVersion.lastMigration },
    local: { count: localVersion.count, last: localVersion.lastMigration },
    rollbackDepth: localVersion.count - prodVersion.count
  });
  
  // Block local sync until production catches up
  await updateSyncState('LOCAL', {
    status: 'WAITING_FOR_MASTER',
    reason: `Production rolled back ${localVersion.count - prodVersion.count} migrations`,
    waitingForVersion: prodVersion.count + 1,
    blockedAt: new Date()
  });
  
  // Alert operators
  await sendAlert({
    severity: 'WARNING',
    title: 'DB Reversion Detected',
    message: `Production rolled back to migration ${prodVersion.lastMigration}. Local sync blocked until production >= ${localVersion.count + 1} migrations.`,
    escalate: true
  });
}
```

### Sync Orchestration

**5-Stage Sync Process:**

```typescript
async function syncRenderToLocal(): Promise<SyncResult> {
  // STAGE 1: Version Check
  const renderVersion = await getVersion(prisma);
  const localVersion = await getVersion(onPremiseDevPrisma);
  const comparison = compareVersions(renderVersion, localVersion);
  
  if (comparison === VersionComparison.BEHIND) {
    await handleReversion(renderVersion, localVersion);
    throw new Error('Production is behind Local - sync blocked');
  }
  
  // STAGE 2: Integrity Verify (pre-migration)
  const integrityResult = await verifySchemaIntegrity(prisma, onPremiseDevPrisma);
  
  // STAGE 3: pg_dump from Render
  await execCommand(`pg_dump ${PROD_DATABASE_URL} --clean --if-exists -f snapshot.sql`);
  
  // STAGE 4: Restore to Local
  await execCommand(`psql ${DATABASE_ONPREMISE_DEV_PRIMARY} -f snapshot.sql`);
  
  // STAGE 5: Post-migration Validation
  const localVersionAfter = await getVersion(onPremiseDevPrisma);
  
  if (localVersionAfter.fingerprint !== renderVersion.fingerprint) {
    throw new Error('Version mismatch after restore!');
  }
  
  return { success: true, stage: 'COMPLETE' };
}
```

### Workstation Database Workflows

**Bootstrap ONPREMISE-DEV-PRIMARY:**

```bash
# Download from Render database (one-way PULL)
npm run ops:bootstrap-onpremise-dev

# Verify sync
npm run db:cli -- status --target=local
npm run db:cli -- count User --target=local
```

**Bootstrap ONPREMISE-DEV-EXPERIMENT:**

```bash
# Clone from ONPREMISE-DEV-PRIMARY (offline)
npm run ops:bootstrap-onpremise-experiment

# Clone from Render database (cloud)
npm run ops:bootstrap-onpremise-experiment -- --source dev
```

**Migration Testing Workflow:**

```bash
# Step 1: Ensure PRIMARY is up-to-date
npm run ops:bootstrap-onpremise-dev

# Step 2: Clone PRIMARY to EXPERIMENT (100% OFFLINE)
npm run ops:bootstrap-onpremise-experiment

# Step 3: Test migration on EXPERIMENT (100% OFFLINE)
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/MIGRATION_NAME/migration.sql

# Step 4: Validate results (100% OFFLINE)
npm run db:cli -- count User --target=experiment

# Step 5: Test rollback if needed (100% OFFLINE)
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/MIGRATION_NAME/rollback.sql

# Step 6: Push to Render ONLY AFTER validation (CLOUD OPERATION)
psql $PROD_DATABASE_URL -f prisma/migrations/MIGRATION_NAME/migration.sql
```

**Safety Rules:**
- ✅ DO test migrations on EXPERIMENT before PRIMARY
- ✅ DO validate migrations on PRIMARY before pushing to Render
- ✅ DO use explicit push workflow for production changes
- ❌ DON'T expect production to see local database changes automatically
- ❌ DON'T run migrations on production directly without testing
- ❌ DON'T skip EXPERIMENT testing for destructive operations

---

[← Back to INDEX](INDEX.md) | [← Previous: System Overview](01-system-overview.md) | [Next: Worker Architecture →](03-worker-architecture.md)