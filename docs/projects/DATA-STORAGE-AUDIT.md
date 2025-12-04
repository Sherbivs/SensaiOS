# Data Storage Architecture Audit

> **Created:** 2025-12-03  
> **Purpose:** Document what data goes to DB vs. files vs. memory  
> **Status:** Comprehensive reference for storage decisions

---

## Executive Summary

The Infinity Gauntlet system uses **four storage tiers**:

| Tier | Technology | Purpose | Retention |
|------|------------|---------|-----------|
| **Hot** | In-Memory (Map) | Runtime cache, transient state | Session-scoped, TTL eviction |
| **Warm** | SQLite (Engine-DB) | Local write buffer, read mirror | Until sync/upload |
| **Cold** | PostgreSQL | Game state, reference data, errors | Permanent |
| **Archive** | Compressed Files | Log history, error reports | Time-based (7-30 days) |

### Key Metrics Tables (TimescaleDB Hypertables)

| Table | Storage | Data Volume | Retention Policy |
|-------|---------|-------------|------------------|
| `LogEntry` | PostgreSQL (hypertable) | High (~1000/sec peak) | 30 days (chunk drop) |
| `WorkerMetrics` | PostgreSQL (hypertable) | Medium (~1/15sec/worker) | 30 days (chunk drop) |
| `ConsoleOutput` | PostgreSQL (hypertable) | Medium | 30 days (chunk drop) |
| `ErrorLog` | PostgreSQL (standard) | Low (deduplicated) | Permanent (fingerprint-based) |
| `AuditLog` | PostgreSQL (standard) | Low (admin actions) | Permanent |

---

## Storage Tier Details

### Tier 1: In-Memory (Hot Data)

**Location:** Runtime heap via `MemoryCache` class

**What Goes Here:**
- Discord.js client caches (guilds, channels, users)
- L1 Engine Cache (Species lookups, moves, type charts)
- Event Bus replay buffer (last 100 events)
- Pattern cache for topic matching (500 entry LRU)
- Write buffer pending flush (100 entries or 5 min trigger)

**Implementation:** `src/shared/cache/memory.ts`
```typescript
class MemoryCache {
  #store = new Map<string, CacheRecord>();
  #defaultTtl: number; // Configurable TTL
}
```

**Memory Budget:**
- L1 Cache: 20 MB max
- Write Buffer: 5 MB (queue size limits)
- Logger Buffer: 1 MB (200 entry cap)
- Discord.js Caches: Sweeper-managed

**Rationale:**
- Sub-microsecond reads for hot paths (battle engine, encounters)
- No network latency for critical game calculations
- Auto-eviction prevents memory leaks

---

### Tier 2: Local SQLite (Warm Data)

**Location:** `Store/engine-write-db.sqlite`

**What Goes Here:**
- Engine write buffer (game events pending upload)
- Local read mirror (offline development mode)
- Validation staging (integrity checks before PROD)

**Flow:**
```
Game Event → Write Buffer (memory)
           → SQLite Write-DB (every 30s flush)
           → PostgreSQL PROD (hourly upload after validation)
```

**Rationale:**
- Offline development without cloud dependency
- Write coalescing reduces PROD write frequency
- Integrity validation before permanent storage
- Fast local queries for debugging

---

### Tier 3: PostgreSQL (Cold Data)

**Location:** Render-managed PostgreSQL + TimescaleDB extension

#### 3A: Game State Tables (Permanent)

| Table | Purpose | Growth Pattern |
|-------|---------|----------------|
| `User` | Player accounts | Slow (new signups) |
| `Trainer` | Player game profiles | Slow (1:1 with User) |
| `TrainerSettings` | Player preferences | Slow (per-trainer) |
| `PokemonInstance` | Owned Pokémon | Medium (catches) |
| `Party` | Active party | Slow (per-trainer) |
| `PartySlot` | Party composition | Slow (party changes) |
| `Battle` | Active/historical battles | Medium (game activity) |
| `Encounter` | Active wild encounters | Fast (spawn/despawn) |
| `Inventory` | Player items | Medium (item acquisition) |
| `Cooldown` | Action cooldowns | Fast (game activity) |
| `HomesteadChannel` | Private channel mappings | Slow (channel creation) |

**Rationale:** ACID compliance, relational queries, cross-session persistence

#### 3B: Reference Data Tables (Static)

| Table | Records | Update Frequency |
|-------|---------|------------------|
| `Species` | 1,025 | Rare (game updates) |
| `Move` | 919 | Rare |
| `Type` | 18 | Never |
| `Ability` | 367 | Rare |
| `Item` | Varies | Rare |
| `TypeChart` | 324 | Never |
| `EvolutionStep` | Varies | Rare |
| `NameVariant` | Varies | Rare |
| `DexPack` | 1 | Monthly |

**Rationale:** Authoritative source, loaded to L1 cache on startup

#### 3C: TimescaleDB Hypertables (Analytics)

**`LogEntry` Table:**
```prisma
model LogEntry {
  id            BigInt   @id @default(autoincrement())
  timestamp     DateTime @db.Timestamptz
  level         String   // debug, info, warn, error
  category      String   // bot, engine, worker, security
  message       String?
  metadata      Json?
  correlationId String?
  serviceName   String?
  userId        String?
  traceContext  String?
  component     String?  // Added 2025-12-03
  operation     String?
  durationMs    Int?
}
```

**What Goes Here:**
- All structured log output from services
- Event Bus routed messages
- Correlation-tracked operations
- Performance timing data

**Volume:** ~1000 writes/sec peak (batched to 100/flush)

---

**`WorkerMetrics` Table:**
```prisma
model WorkerMetrics {
  id                   BigInt   @id @default(autoincrement())
  timestamp            DateTime @default(now()) @db.Timestamptz
  workerId             String
  workerName           String
  operationCount       BigInt   @default(0)
  successCount         BigInt   @default(0)
  failureCount         BigInt   @default(0)
  avgLatencyMs         Float?
  peakLatencyMs        Float?
  throughput           Float?
  bufferSize           Int?
  bufferUtilizationPct Float?
  flushCount           Int?
  backpressureEvents   Int?
  memoryUsedBytes      BigInt?
  cpuPercent           Float?
  healthStatus         String?
  lastError            String?
}
```

**What Goes Here:**
- Worker health snapshots (every 15 seconds)
- Buffer utilization metrics
- Error counts and latency stats
- Health status indicators

**Volume:** ~1 write/15sec/worker × 6 workers = ~24 writes/min

---

**`ConsoleOutput` Table:**
```prisma
model ConsoleOutput {
  id          BigInt   @id @default(autoincrement())
  timestamp   DateTime @default(now()) @db.Timestamptz
  serviceName String
  outputType  String   // stdout, stderr
  outputLevel String   // log, warn, error, info, debug
  rawOutput   String
  parsedData  Json?
}
```

**What Goes Here:**
- Intercepted console.log/warn/error output
- Service-tagged for filtering
- Parsed structured data when available

**Volume:** Medium (varies by service verbosity)

---

#### 3D: Error System Tables (Permanent + Deduplicated)

**`ErrorLog` Table:**
```prisma
model ErrorLog {
  errorId              String   @id @default(uuid())
  fingerprint          String   @unique
  category             String
  severity             String
  errorName            String
  errorMessage         String
  stackTrace           String?
  contextData          Json?
  occurrenceCount      Int      @default(1)
  firstSeen            DateTime @default(now())
  lastSeen             DateTime @default(now())
  impactedFeatures     String[]
  estimatedUserImpact  Int?
  // Recovery tracking
  recoveryAttempted    Int      @default(0)
  recoverySuccess      Int      @default(0)
  lastRecoveryStrategy String?
  lastRecoveryOutcome  String?
  // Learning
  learningMetadata     Json?
  alerts               ErrorAlert[]
}
```

**Deduplication Strategy:**
- SHA-256 fingerprint from: `{errorName}|{errorMessage}|{normalizedStack}|{category}`
- Same fingerprint → increment `occurrenceCount`, update `lastSeen`
- Stack normalization removes line numbers (`:123:45` → `:*:*`)

**What Goes Here:**
- All captured errors (via `errorTracker.captureError()`)
- Context data (userId, guildId, commandName, etc.)
- Recovery attempt history
- Learning metadata (hourly patterns, correlations)

**Volume:** Low (deduplicated, ~10-100 unique errors/day typical)

---

**`ErrorAlert` Table:**
```prisma
model ErrorAlert {
  id             String    @id @default(uuid())
  errorId        String
  alertType      String    // discord, ops-channel, webhook
  recipientId    String?
  sentAt         DateTime  @default(now())
  acknowledged   Boolean   @default(false)
  acknowledgedAt DateTime?
  acknowledgedBy String?
  error          ErrorLog  @relation(...)
}
```

**What Goes Here:**
- Alert delivery tracking per error
- Acknowledgment status
- Prevents duplicate alerting

---

#### 3E: Infrastructure Tables

**`BusMessage` (Event Queue):**
```prisma
model BusMessage {
  id          String    @id @default(uuid())
  topic       String
  payload     Json
  status      String    @default("pending")
  claimedBy   String?
  claimedAt   DateTime?
  processedAt DateTime?
  createdAt   DateTime  @default(now())
  retryCount  Int       @default(0)
  lastError   String?
}
```

**What Goes Here:**
- Async message queue for cross-service communication
- Claimed/processed tracking for exactly-once delivery
- Retry history for failed deliveries

**Lifecycle:** `pending` → `claimed` → `done`/`error` → TTL cleanup

---

**`BusIdemToken` (Idempotency):**
```prisma
model BusIdemToken {
  token     String   @id
  createdAt DateTime @default(now())
}
```

**What Goes Here:**
- Deduplication tokens for message processing
- Prevents double-processing of retried messages

**TTL:** 24 hours (configurable)

---

**`AuditLog` (Admin Actions):**
```prisma
model AuditLog {
  id         String   @id @default(uuid())
  timestamp  DateTime @default(now())
  actorId    String
  actorType  String   // user, system, admin
  action     String   // create, update, delete, execute
  resource   String   // trainer, pokemon, battle, etc.
  resourceId String?
  changes    Json?
  metadata   Json?
}
```

**What Goes Here:**
- All admin/ops command executions
- Database modifications via admin tools
- Security-relevant actions

**Retention:** Permanent (compliance/audit trail)

---

### Tier 4: File Storage (Archive)

**Location:** `Store/` directory on Render persistent disk

#### 4A: Log Archives

**Structure:**
```
Store/logs/
├── hourly/          # Last 7 days of hourly segments
├── daily/           # Last 30 days of daily rollups
├── archive/         # Compressed monthly archives
├── emergency/       # Critical error captures
└── insights/        # Aggregated analytics
```

**What Goes Here:**
- Rotated log files from active `current.jsonl`
- Compressed historical logs (gzip)
- Emergency captures when DB write fails

**Retention:**
- Hourly: 7 days
- Daily: 30 days
- Monthly archives: Indefinite (manual cleanup)

---

#### 4B: Security Bot State

**Location:** `Store/security-bot-state/`

**Files:**
| File | Purpose | Update Frequency |
|------|---------|------------------|
| `current.json` | Active runtime state | Every 5 min + shutdown |
| `previous.json` | Pre-restart backup | On startup |
| `baselines.json` | Permission baselines | On baseline capture |
| `snapshots/*.json` | Hourly state snapshots | Hourly |

**Schema (from `Store/security-bot-state/schema.md`):**
```typescript
interface SecurityBotState {
  version: number;
  lastUpdated: string;
  statistics: {
    cumulativeSweeps: number;
    cumulativeAlerts: number;
    cumulativePermissionChanges: number;
    // ... more cumulative metrics
  };
  timeline: TimelineEvent[];
  guildState: Record<GuildId, GuildStateSnapshot>;
  memberState: Record<MemberId, MemberStateSnapshot>;
}
```

**Rationale:**
- Survives process restarts (cumulative stats preserved)
- No DB dependency during security operations
- Fast JSON read/write for state updates
- Rollback capability via `previous.json`

---

#### 4C: Error Reports (AI Analysis)

**Location:** `Store/error-reports/`

**Format:** Markdown files optimized for AI analysis
**Naming:** `error-{fingerprint12}-{timestamp}.md`

**What Goes Here:**
- Full error context snapshots
- Stack trace with source code snippets
- Call chain reconstruction
- Troubleshooting hints

**Retention:** 24 hours (auto-cleanup on ENOSPC)

---

#### 4D: Emergency Error Logs

**Location:** `Store/emergency-error-logs/`

**Purpose:** Fallback when database write fails

**What Goes Here:**
- Complete error JSON when ErrorTracker DB write fails
- Ensures ZERO false negatives

**Retention:** 24 hours (cleaned up with error reports)

---

## Decision Matrix: Where Does Data Go?

| Data Type | Hot (Memory) | Warm (SQLite) | Cold (PostgreSQL) | Archive (Files) |
|-----------|:------------:|:-------------:|:-----------------:|:---------------:|
| **L1 Cache (Species, Moves)** | ✅ Primary | - | ✅ Source | - |
| **Active Battle State** | ✅ Runtime | - | ✅ Persist | - |
| **Wild Encounters** | ✅ Runtime | - | ✅ Persist | - |
| **Trainer Profiles** | - | - | ✅ Primary | - |
| **Pokémon Instances** | - | - | ✅ Primary | - |
| **Structured Logs** | ✅ Buffer | - | ✅ Hypertable | ✅ Rotate |
| **Worker Metrics** | ✅ Collect | - | ✅ Hypertable | - |
| **Errors (Unique)** | ✅ Emit | - | ✅ Dedupe | ✅ Reports |
| **Errors (Occurrence)** | - | - | ✅ Increment | - |
| **Security Bot State** | ✅ Runtime | - | - | ✅ JSON |
| **Event Bus Messages** | ✅ Buffer | - | ✅ Queue | - |
| **Audit Trail** | - | - | ✅ Permanent | - |
| **Console Output** | ✅ Intercept | - | ✅ Hypertable | - |
| **Write Buffer** | ✅ Batch | ✅ Flush | ✅ Upload | - |

---

## Storage Costs & Optimization

### PostgreSQL (Render Managed)

**Current Usage:**
- Reference data: ~50 MB (Species, Moves, Types, etc.)
- Game state: Variable (grows with players)
- TimescaleDB hypertables: ~100 MB/month (with 30-day retention)
- Error system: ~10 MB (deduplicated)

**Optimization Applied:**
- TimescaleDB chunk dropping (30-day retention)
- Error fingerprinting (prevents unbounded growth)
- Event Bus TTL cleanup (24-hour idempotency tokens)

### Persistent Disk (Render)

**Allocation:** 2 GB per worker (12 GB total)

**Usage:**
- Logs: ~500 MB (compressed archives)
- Security state: ~10 MB
- Error reports: ~50 MB (24h retention)
- SQLite write-db: ~100 MB

---

## What Does NOT Go to Database

### Explicitly File-Based (by design):

| Data | Storage | Reason |
|------|---------|--------|
| Security bot state | JSON files | Fast restart recovery, no DB dependency during security ops |
| Log archives | Compressed JSONL | Cost optimization, rarely queried |
| Error AI reports | Markdown files | Temporary analysis artifacts |
| Heap snapshots | `.heapsnapshot` | Debugging artifacts, large files |

### Explicitly In-Memory Only:

| Data | Reason |
|------|--------|
| Discord.js caches | Managed by discord.js, not our data |
| Event Bus replay buffer | Temporary debugging, 100 event cap |
| Pattern cache (regex) | Performance optimization, regenerable |
| Rate limit state | Per-session, not worth persisting |

### Could Move to External Services:

| Data | Current | Alternative | Trade-off |
|------|---------|-------------|-----------|
| `BusMessage` queue | PostgreSQL | Redis/SQS | Latency vs. simplicity |
| `ErrorLog` | PostgreSQL | Sentry/Datadog | Features vs. cost |
| `LogEntry` | TimescaleDB | Loki/CloudWatch | Query power vs. vendor lock |
| `WorkerMetrics` | TimescaleDB | Prometheus/Grafana | Real-time vs. persistence |

---

## Materialized Views (Aggregations)

TimescaleDB maintains these pre-computed views:

| View | Refresh | Purpose |
|------|---------|---------|
| `logs_hourly` | Hourly | Log volume by level/category |
| `error_rate_hourly` | Hourly | Error frequency trends |
| `battles_daily` | Daily | Battle activity metrics |
| `security_events_daily` | Daily | Security sweep results |
| `pokemon_usage_weekly` | Weekly | Pokémon popularity stats |

**Refresh Trigger:**
- Scheduled via TimescaleDB worker
- Manual via `/ops refresh-analytics` command
- Concurrent refresh (no read blocking)

---

## Appendix: File Structure Reference

```
Store/
├── ai-logs/                      # AI agent session logs (dev only)
├── db/                           # Legacy (now onpremise-dev-primary/)
├── db-experiment/                # Legacy (now onpremise-dev-experiment/)
├── discord-cache/                # Discord security bot cache
├── emergency-error-logs/         # Fallback error persistence
│   └── error-{timestamp}.json
├── engine-write-db.sqlite        # Local write buffer
├── error-reports/                # AI analysis reports
│   └── error-{fingerprint}-{timestamp}.md
├── logs/
│   ├── archive/                  # Compressed monthly archives
│   ├── daily/                    # Daily rollups (30-day retention)
│   ├── hourly/                   # Hourly segments (7-day retention)
│   ├── emergency/                # Critical captures
│   └── insights/                 # Analytics aggregations
├── monitoring/                   # Prometheus/Grafana configs
├── onpremise-dev-primary/        # On-premise PostgreSQL cluster
├── onpremise-dev-experiment/     # Migration testing cluster
├── restart-metrics.json          # Service restart tracking
├── runtime-cache/                # General runtime cache
├── security-bot-state/
│   ├── current.json              # Active state
│   ├── previous.json             # Pre-restart backup
│   ├── baselines.json            # Permission baselines
│   └── snapshots/                # Hourly state snapshots
└── test/                         # Test fixtures
```

---

## Recommendations by Specialist Team

Based on this audit, here are actionable recommendations for each specialist team:

### 🗄️ Database Specialist

**Immediate Actions:**
1. **Verify TimescaleDB Retention Jobs**
   ```sql
   -- Check if retention policy is active
   SELECT * FROM timescaledb_information.jobs WHERE proc_name = 'policy_retention';
   
   -- If missing, add 30-day retention
   SELECT add_retention_policy('log_entries', INTERVAL '30 days');
   SELECT add_retention_policy('worker_metrics', INTERVAL '30 days');
   SELECT add_retention_policy('console_outputs', INTERVAL '30 days');
   ```

2. **Add BusIdemToken Cleanup Job**
   - Currently no scheduled cleanup for idempotency tokens
   - Add daily job: `DELETE FROM "BusIdemToken" WHERE "createdAt" < NOW() - INTERVAL '24 hours'`

3. **Create Missing Indexes**
   - `ErrorLog.lastSeen` — for recent error queries
   - `BusMessage.status, createdAt` — for queue polling
   - `Encounter.createdAt` — for stale encounter cleanup

**Schema Improvements:**
- Add `BattleOutcome` table for win/loss analytics (currently not tracked)
- Add `CatchAttempt` table for catch rate analysis
- Consider partitioning `Encounter` table (high churn)

---

### 🏗️ Architecture Specialist

**Storage Tier Optimization:**
1. **Eliminate Redundant File Logs**
   - TimescaleDB already stores 30 days of logs
   - File-based `Store/logs/` is redundant for queryable data
   - Keep only: emergency fallback + compressed archives >30 days

2. **SQLite Write-DB Usage Review**
   - Currently underutilized (only offline dev mode)
   - Consider: battle replay storage, local analytics cache

3. **Event Bus Migration Path**
   | Phase | Current | Target | Benefit |
   |-------|---------|--------|---------|
   | 1 | PostgreSQL queue | PostgreSQL | ✅ Done |
   | 2 | PostgreSQL queue | Redis Streams | 10x latency reduction |
   | 3 | Redis Streams | AWS SQS | Managed scaling |

**Memory Architecture:**
- L1 Cache (20 MB) is well-sized for current reference data
- Monitor: If Species/Moves grow significantly, increase budget or add LRU eviction

---

### 🔒 Security Specialist

**State Persistence:**
1. **Security Bot State Location** — Keep in JSON files (correct decision)
   - No DB dependency during security sweeps
   - Fast restart recovery
   - Recommendation: Add integrity checksums to state files

2. **Audit Log Enhancements:**
   ```prisma
   model AuditLog {
     // Add these fields:
     ipAddress     String?   // For admin action tracking
     userAgent     String?   // Client identification
     sessionId     String?   // Session correlation
     riskScore     Int?      // Automated risk assessment
   }
   ```

3. **Add Security-Specific Tables:**
   - `PermissionChange` — Track all role/permission modifications
   - `LoginAttempt` — Authentication audit trail (future Discord OAuth)
   - `RateLimitViolation` — Track abuse patterns

---

### 📊 Performance Specialist

**Query Optimization:**
1. **Hot Path Caching**
   - Species lookups: ✅ L1 Cache (<1μs)
   - Move lookups: ✅ L1 Cache (<1μs)
   - Type effectiveness: ✅ L1 Cache (<1μs)
   - **Missing:** Trainer profile caching (add to L1 with 5-min TTL)

2. **Write Coalescing Improvements:**
   | Operation | Current | Target | Method |
   |-----------|---------|--------|--------|
   | Log writes | 100/flush | 500/flush | Increase batch size |
   | Metrics | 15s interval | 30s interval | Reduce frequency |
   | Encounters | Immediate | Batched | Add write buffer |

3. **TimescaleDB Performance:**
   - Enable compression on chunks older than 7 days
   - Create continuous aggregates for common queries
   ```sql
   CREATE MATERIALIZED VIEW logs_hourly_continuous
   WITH (timescaledb.continuous) AS
   SELECT time_bucket('1 hour', timestamp) AS bucket,
          level, category, COUNT(*)
   FROM log_entries
   GROUP BY bucket, level, category;
   ```

---

### 🧪 Testing Specialist

**Test Data Management:**
1. **Database Fixtures Location**
   - Store in: `Store/test/` (already exists)
   - Use SQLite for isolated test runs
   - Never use PROD database for tests

2. **Test Coverage Gaps (Data Layer):**
   - [ ] TimescaleDB chunk retention behavior
   - [ ] Error fingerprint deduplication
   - [ ] BusMessage exactly-once delivery
   - [ ] Write buffer flush under backpressure
   - [ ] Emergency log fallback when DB unavailable

3. **Performance Benchmarks to Add:**
   ```typescript
   // tests/benchmarks/data-layer.bench.ts
   - L1 cache lookup latency (target: <1μs)
   - PostgreSQL write latency (target: <50ms)
   - Write buffer flush throughput (target: 1000/sec)
   - Error deduplication overhead (target: <5ms)
   ```

---

### 🚀 DevOps Specialist

**Monitoring Additions:**
1. **Add `/ops disk` Command**
   ```typescript
   // Show Store/ usage by directory
   /ops disk
   // Output:
   // logs/: 487 MB (24%)
   // security-bot-state/: 12 MB (0.6%)
   // error-reports/: 45 MB (2.2%)
   // Total: 544 MB / 2048 MB (26.5%)
   ```

2. **Alerting Thresholds:**
   | Metric | Warning | Critical | Action |
   |--------|---------|----------|--------|
   | Disk usage | 70% | 85% | Cleanup old files |
   | DB size | 400 MB | 450 MB | Review retention |
   | Error rate | 50/hour | 200/hour | Page on-call |
   | Queue depth | 1000 | 5000 | Scale workers |

3. **Backup Strategy:**
   - PostgreSQL: Render automated (daily)
   - Security state: Add to git-ignored backup script
   - SQLite write-db: Ephemeral (no backup needed)

4. **Render Service Disk Allocation Review:**
   | Service | Current | Recommended |
   |---------|---------|-------------|
   | Main Bot | 2 GB | 2 GB ✅ |
   | Security Worker | 2 GB | 1 GB (reduce) |
   | Cache Worker | 2 GB | 512 MB (reduce) |
   | Outbox Worker | 2 GB | 512 MB (reduce) |

---

### 📝 Documentation Specialist

**Documentation Gaps to Fill:**
1. **Missing Runbooks:**
   - [ ] TimescaleDB chunk management
   - [ ] Emergency log recovery procedure
   - [ ] Write buffer troubleshooting
   - [ ] Storage capacity planning guide

2. **Schema Documentation:**
   - Add `prisma/README.md` with table purpose overview
   - Document all JSON field schemas (contextData, metadata, etc.)
   - Create ER diagram for game state tables

3. **Update Architecture Bible:**
   - Add this audit to `docs/architecture-bible/` as Section 19
   - Cross-reference from database operations runbook
   - Update service topology diagram with storage tiers

---

## Implementation Priority Matrix

| Task | Specialist | Effort | Impact | Priority |
|------|------------|--------|--------|----------|
| Verify TimescaleDB retention | Database | 30 min | High | 🔴 P0 |
| Add BusIdemToken cleanup | Database | 1 hour | Medium | 🔴 P0 |
| Add `/ops disk` command | DevOps | 2 hours | High | 🟡 P1 |
| Remove redundant file logs | Architecture | 4 hours | Medium | 🟡 P1 |
| Add Trainer caching | Performance | 2 hours | Medium | 🟡 P1 |
| Security audit fields | Security | 3 hours | Medium | 🟡 P1 |
| Data layer test coverage | Testing | 8 hours | High | 🟢 P2 |
| Schema documentation | Documentation | 4 hours | Medium | 🟢 P2 |
| Reduce worker disk allocation | DevOps | 1 hour | Low | 🟢 P2 |
| Redis queue migration | Architecture | 16 hours | High | 🔵 P3 |

---

## Change Log

| Date | Change |
|------|--------|
| 2025-12-03 | Initial comprehensive audit created |
| 2025-12-03 | Added specialist team recommendations |

---

**Related Documents:**
- `docs/architecture-bible/complete-system-architecture.md` — System topology
- `docs/operations-bible/database-operations-runbook-comprehensive.md` — Database operations
- `prisma/schema.prisma` — Full database schema
- `Store/security-bot-state/schema.md` — Security state schema
