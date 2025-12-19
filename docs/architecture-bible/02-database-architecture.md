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

## 2.2 Prisma Client Initialization

**Purpose**: Initialize up to 3 Prisma clients (PROD + optional LOCAL + optional EXPERIMENT) during boot Phase 2.

**Source**: `src/shared/prisma.ts` (`ensurePrisma` function) + `src/models/index.ts` (`initPrisma` wrapper)

**Called From**: `src/index.ts` Phase 2 (Database Connection) — after Service Registry, before Engine/Bots

**Prisma Version**: 7.1.0 (as of 2025-12-18)

### Prisma 7 Critical Configuration

**Schema Requirements** (`prisma/schema.prisma`):

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
  engineType    = "library"  // REQUIRED: Direct PostgreSQL connections
}

datasource db {
  provider = "postgresql"
  // URL configured via prisma.config.ts (NOT here)
}
```

**Breaking Changes:**
- `engineType = "library"` — **REQUIRED** for direct PostgreSQL (Prisma 7 defaults to "client" which needs Accelerate)
- Database URL — Moved from schema.prisma to `prisma.config.ts`
- `datasources` option — **REMOVED** from PrismaClient constructor

**See Also:** [Operations Bible § 2.7](../operations-bible/02-database-operations.md#27-prisma-7-configuration-updated-2025-12-18) for complete migration checklist.

### 2.2.1 Initialization Flow

**Entry Point** (`src/index.ts` Phase 2):

```typescript
await initPrisma(); // Wrapper that calls ensurePrisma()
await prisma.$queryRaw(Prisma.sql`SELECT 1`); // Connectivity probe
```

**Core Logic** (`src/shared/prisma.ts`):

```typescript
export async function ensurePrisma(): Promise<PrismaClient> {
  // Use existing singleton if already connected
  await globalPrisma.prismaConnectPromise;
  return prisma;
}
```

**Singleton Pattern**: Prisma clients initialized once, reused across entire app lifecycle.

**globalPrisma.prismaConnectPromise**: Promise that resolves when all configured clients connect successfully.

### 2.2.2 Multi-Client Architecture

**3 Prisma Clients** (1 required + 2 optional):

1. **`prisma`** (PRIMARY - REQUIRED)
   - Connected to: `PROD_DATABASE_URL` (Render-managed PostgreSQL)
   - Purpose: ALL production operations (gameplay, migrations, monitoring)
   - Export: `export let prisma: PrismaClient`
   - Initialization: Always attempted, fails boot if unreachable

2. **`onPremiseDevPrisma`** (LOCAL - OPTIONAL)
   - Connected to: `DATABASE_ONPREMISE_DEV_PRIMARY` (localhost:55433)
   - Purpose: Offline development fallback
   - Export: `export let onPremiseDevPrisma: PrismaClient | null = null`
   - Initialization: Only if environment variable present, skips gracefully if missing

3. **`onPremiseExperimentPrisma`** (EXPERIMENT - OPTIONAL)
   - Connected to: `DATABASE_ONPREMISE_DEV_EXPERIMENT` (localhost:55434)
   - Purpose: Migration testing (isolated sandbox)
   - Export: `export let onPremiseExperimentPrisma: PrismaClient | null = null`
   - Initialization: Only if environment variable present, skips gracefully if missing

**Graceful Degradation**: Missing optional clients log info message, don't fail boot.

### 2.2.3 PROD Client Initialization

**Configuration Detection**:

```typescript
// From src/shared/config.ts
const config = loadConfig();
const candidate = config.databases.find(db => db.isPrimary); // PROD_DATABASE_URL
activeCandidate = candidate;
```

**Transport Selection**: Always "direct" (no connection pooling).

```typescript
prodTransport = "direct";
```

**Client Creation**:

```typescript
const baseOptions = {
  log: ["error"] as any, // Only log errors (reduce noise)
};

// PRISMA REQUIREMENT: Temporarily set DATABASE_URL for constructor
const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = candidate.url; // PROD_DATABASE_URL

prodPrismaClient = new PrismaClient(baseOptions);

// Restore original DATABASE_URL
if (originalDatabaseUrl) {
  process.env.DATABASE_URL = originalDatabaseUrl;
}
```

**Connection + Probe**:

```typescript
await prodPrismaClient.$connect();

const start = process.hrtime.bigint();
await prodPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;

log.info("PROD Prisma client connected", {
  latencyMs: latencyMs.toFixed(2),
  transport: "direct",
  source: candidate.source, // "PROD_DATABASE_URL"
});
```

**Export Assignment**:

```typescript
prisma = prodPrismaClient; // Primary export
prismaClient = prodPrismaClient; // Legacy reference
```

### 2.2.4 LOCAL Client Initialization (Optional)

**Skip Condition**:

```typescript
const onPremiseDevUrl = process.env.DATABASE_ONPREMISE_DEV_PRIMARY?.trim();
if (!onPremiseDevUrl) {
  log.info("LOCAL database connection skipped", { 
    reason: "no DATABASE_ONPREMISE_DEV_PRIMARY" 
  });
  return; // Graceful skip
}
```

**Client Creation** (same pattern as PROD):

```typescript
onPremiseDevTransport = "direct";

process.env.DATABASE_URL = onPremiseDevUrl;
onPremiseDevPrismaClient = new PrismaClient({ log: ["error"] });
process.env.DATABASE_URL = originalDatabaseUrl; // Restore

onPremiseDevPrisma = onPremiseDevPrismaClient; // Export assignment
```

**Connection + Probe**:

```typescript
await onPremiseDevPrismaClient.$connect();

const start = process.hrtime.bigint();
await onPremiseDevPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;

log.info("LOCAL Prisma client connected (workstation development)", {
  latencyMs: latencyMs.toFixed(2),
  transport: "direct",
});
```

**Heartbeat Start**: Independent 30-second heartbeat for LOCAL client.

```typescript
setInterval(async () => {
  if (!onPremiseDevPrismaClient) return;
  
  const probeStart = process.hrtime.bigint();
  try {
    await onPremiseDevPrismaClient.$queryRaw(Prisma.sql`SELECT 1`);
    const probeLatencyMs = Number(process.hrtime.bigint() - probeStart) / 1_000_000;
    
    lastOnPremiseDevHeartbeatEvent = {
      ok: true,
      timestamp: new Date(),
      latencyMs: probeLatencyMs,
      slow: probeLatencyMs >= 1000,
      consecutiveFailures: 0,
      source: "heartbeat",
    };
  } catch (error) {
    lastOnPremiseDevHeartbeatEvent = {
      ok: false,
      timestamp: new Date(),
      latencyMs: null,
      slow: false,
      consecutiveFailures: (lastOnPremiseDevHeartbeatEvent?.consecutiveFailures ?? 0) + 1,
      error: error as Error,
      source: "heartbeat",
    };
  }
}, 30_000); // 30 seconds
```

### 2.2.5 EXPERIMENT Client Initialization (Optional)

**Same Pattern**: Identical to LOCAL client initialization, but uses `DATABASE_ONPREMISE_DEV_EXPERIMENT`.

**Export**: `onPremiseExperimentPrisma` (null if not configured).

**Purpose**: Isolated testing environment, never accessed in production code paths.

### 2.2.6 Heartbeat Monitoring

**Purpose**: Continuously monitor database connectivity, detect degradation.

**PROD Heartbeat** (primary monitoring):

```typescript
export function startPrismaHeartbeat(options?: HeartbeatOptions): () => void {
  const state: HeartbeatState = {
    timer: null,
    stopped: false,
    consecutiveFailures: 0,
    options: coerceOptions(options), // Default: 30s interval, 1s warn threshold
  };
  
  // Run immediately
  performHeartbeat(state, state.options);
  
  // Schedule recurring
  state.timer = setInterval(() => {
    performHeartbeat(state, state.options);
  }, state.options.intervalMs);
  
  // Return stop function
  return () => {
    if (state.timer) clearInterval(state.timer);
    state.stopped = true;
  };
}
```

**Heartbeat Probe**:

```typescript
async function performHeartbeat(state: HeartbeatState, options: Required<HeartbeatOptions>): Promise<void> {
  const start = process.hrtime.bigint();
  
  try {
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    
    const slow = latencyMs >= options.warnThresholdMs; // Default: 1000ms
    
    if (slow) {
      log.warn("Prisma heartbeat slow", { latencyMs, thresholdMs: options.warnThresholdMs });
    }
    
    state.consecutiveFailures = 0;
    
    emitHeartbeat({
      ok: true,
      timestamp: new Date(),
      latencyMs,
      slow,
      consecutiveFailures: 0,
      source: "heartbeat",
    });
  } catch (error) {
    state.consecutiveFailures += 1;
    
    if (state.consecutiveFailures >= options.errorThreshold) { // Default: 3
      log.error("Prisma heartbeat failed", error);
    } else {
      log.warn("Prisma heartbeat failed", { consecutiveFailures: state.consecutiveFailures });
    }
    
    emitHeartbeat({
      ok: false,
      timestamp: new Date(),
      latencyMs: null,
      slow: false,
      consecutiveFailures: state.consecutiveFailures,
      error: error as Error,
      source: "heartbeat",
    });
  }
}
```

**Event Emission**: Heartbeat events broadcast to listeners (CLI dashboard, monitoring).

```typescript
function emitHeartbeat(event: PrismaHeartbeatEvent): void {
  for (const listener of heartbeatListeners) {
    try {
      listener(event);
    } catch (error) {
      log.warn("Prisma heartbeat listener threw", { listenerError: getErrorMessage(error) });
    }
  }
}
```

### 2.2.7 Database Stats API

**Purpose**: Expose connection status, latency, transport for monitoring.

**Triple Stats Structure**:

```typescript
export type TripleDatabaseStats = {
  prod: DatabaseStats;
  onPremiseDev: DatabaseStats;
  onPremiseExperiment: DatabaseStats;
};

export type DatabaseStats = {
  source: string;        // "PROD_DATABASE_URL" | "onpremise-dev" | "onpremise-experiment"
  transport: string;     // "direct" (always)
  latency: number | null; // Last heartbeat latency in ms
  status: string;        // "healthy" | "degraded" | "error" | "initializing" | "disabled"
};
```

**Status Computation**:

```typescript
function computeStatus(heartbeat: PrismaHeartbeatEvent | null): string {
  if (!heartbeat) return "unknown";
  
  if (heartbeat.ok) {
    return heartbeat.slow ? "degraded" : "healthy"; // slow = latency > 1000ms
  }
  
  // Failed heartbeat
  const errorThreshold = 3;
  return heartbeat.consecutiveFailures >= errorThreshold ? "error" : "reconnecting";
}
```

**Get Stats**:

```typescript
export function getDatabaseStats(): TripleDatabaseStats {
  const prodLatency = lastProdHeartbeatEvent?.latencyMs ?? null;
  const prodStatus = prodPrismaClient 
    ? (lastProdHeartbeatEvent ? computeStatus(lastProdHeartbeatEvent) : "initializing")
    : "offline";
  
  const onPremiseDevLatency = lastOnPremiseDevHeartbeatEvent?.latencyMs ?? null;
  const onPremiseDevStatus = onPremiseDevPrismaClient
    ? (lastOnPremiseDevHeartbeatEvent ? computeStatus(lastOnPremiseDevHeartbeatEvent) : "initializing")
    : "disabled";
  
  const onPremiseExperimentLatency = lastOnPremiseExperimentHeartbeatEvent?.latencyMs ?? null;
  const onPremiseExperimentStatus = onPremiseExperimentPrismaClient
    ? (lastOnPremiseExperimentHeartbeatEvent ? computeStatus(lastOnPremiseExperimentHeartbeatEvent) : "initializing")
    : "disabled";
  
  return {
    prod: {
      source: activeCandidate?.source ?? "unknown",
      transport: prodTransport,
      latency: prodLatency,
      status: prodStatus,
    },
    onPremiseDev: {
      source: process.env.DATABASE_ONPREMISE_DEV_PRIMARY ? "onpremise-dev" : "unknown",
      transport: onPremiseDevTransport,
      latency: onPremiseDevLatency,
      status: onPremiseDevStatus,
    },
    onPremiseExperiment: {
      source: process.env.DATABASE_ONPREMISE_DEV_EXPERIMENT ? "onpremise-experiment" : "unknown",
      transport: onPremiseExperimentTransport,
      latency: onPremiseExperimentLatency,
      status: onPremiseExperimentStatus,
    },
  };
}
```

**CLI Dashboard Usage**:

```typescript
import { getDatabaseStats } from "../shared/prisma.js";

const stats = getDatabaseStats();

console.log(`PROD: ${stats.prod.status} (${stats.prod.latency}ms)`);
console.log(`LOCAL: ${stats.onPremiseDev.status} (${stats.onPremiseDev.latency}ms)`);
console.log(`EXPERIMENT: ${stats.onPremiseExperiment.status} (${stats.onPremiseExperiment.latency}ms)`);
```

### 2.2.8 Performance Metrics

**Phase 2 Timing** (Database Connection):
- Production: ~50ms typical, ~200ms max
- Workstation: <20ms typical (localhost), ~100ms max

**Breakdown**:
- Client creation: <5ms (instantiation)
- `$connect()`: ~30-100ms (TCP handshake + auth)
- Probe query (`SELECT 1`): ~10-50ms (latency check)
- Heartbeat setup: <5ms (timer registration)

**Memory Footprint**:
- Each PrismaClient: ~10-20 MB
- 3 clients: ~30-60 MB total
- Heartbeat timers: <1 KB (negligible)

**Latency Thresholds**:
- **Healthy**: <1000ms
- **Degraded**: ≥1000ms (slow but functional)
- **Error**: 3+ consecutive failures

**See Also**: [Section 16: Boot Sequence](16-boot-sequence.md) § Phase 2 for complete timing breakdown.

### 2.2.9 Error Handling

**Initialization Failures**:

```typescript
try {
  await initPrisma();
  await prisma.$queryRaw(Prisma.sql`SELECT 1`);
  log.info("Database connectivity OK");
} catch (error) {
  log.warn("Database connectivity failed; attempting recovery");
  
  // Lazy-load database recovery module
  const { runDatabaseRecovery } = await import("./runtime/databaseRecovery.js");
  await runDatabaseRecovery();
  
  // Retry connection
  await initPrisma();
  await prisma.$queryRaw(Prisma.sql`SELECT 1`);
}
```

**Recovery Strategies**:
1. Retry with exponential backoff (3 attempts)
2. Switch to fallback URL if available (RENDER_DB_EXTERNAL_URL → PROD_DATABASE_URL)
3. Fail boot if all attempts exhausted (database required for operation)

**Runtime Failures**: Heartbeat monitoring detects degradation, logs warnings, but doesn't crash app.

**Graceful Degradation**: Optional clients (LOCAL, EXPERIMENT) silently skip if unavailable.

## 2.3 Database Replication

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