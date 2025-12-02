# Database Operations Runbook — Complete Reference
**Version:** 1.0  
**Last Updated:** 2025-12-02  
**Scope:** Complete operational procedures for ALL database operations  
**Target Audience:** Database administrators, operations team, on-call engineers

---

## Table of Contents

1. [Overview](#overview)
2. [Live Game Operations (Real-Time Requirements)](#live-game-operations-real-time-requirements)
3. [Database Architecture](#database-architecture)
4. [Connection Management](#connection-management)
   - [Primary Database (PROD Postgres)](#primary-database-prod-postgres)
   - [TimescaleDB (Time-Series Logs)](#timescaledb-time-series-logs)
   - [Engine Read-DB (SQLite)](#engine-read-db-sqlite)
   - [Engine Write-DB (SQLite)](#engine-write-db-sqlite)
   - [On-Premise Development Database](#on-premise-development-database)
5. [Health Check Operations](#health-check-operations)
6. [Troubleshooting Procedures](#troubleshooting-procedures)
7. [Failover Procedures](#failover-procedures)
8. [Data Recovery Procedures](#data-recovery-procedures)
9. [Rollback Procedures](#rollback-procedures)
10. [Performance Optimization](#performance-optimization)
11. [Maintenance Windows](#maintenance-windows)
12. [Backup & Restore](#backup-restore)
13. [Monitoring & Alerts](#monitoring-alerts)

---

## Overview

### Purpose
This runbook provides **complete operational procedures** for managing all database systems in the Infinity Gauntlet application. It covers:
- **Connection management** for 5 database systems
- **Health monitoring** via `/ops` commands and direct queries
- **Troubleshooting** for ALL connection failure scenarios
- **Failover procedures** for high availability
- **Data recovery** from backups and WAL replay
- **Performance optimization** via indexing and query tuning
- **Maintenance windows** with zero-downtime deployment

### Database Inventory

| Database | Type | Purpose | URL Variable | Criticality | HA Setup |
|----------|------|---------|--------------|-------------|----------|
| **PROD Postgres** | PostgreSQL 16 | **MASTER DATABASE** — Canonical source of truth | `PROD_DATABASE_URL` | CRITICAL | Managed by Render (auto-backup) |
| **TimescaleDB** | PostgreSQL + Timescale | Time-series log ingestion | `TIMESCALE_DB_URL` | HIGH | Managed by Render (auto-backup) |
| **Engine Read-DB** | SQLite (WAL mode) | **READ MIRROR** — Syncs FROM PROD master daily | File: `/Store/engine-read-db/` | MEDIUM | None (rebuilt from PROD daily) |
| **Engine Write-DB** | SQLite (WAL mode) | **WRITE STAGING** — Validated before upload TO PROD | File: `/Store/engine-write-db/` | MEDIUM | WAL-based recovery |
| **Engine Write Buffer** | In-Memory Queue | **FAST CACHE** — Simultaneous writes with Write-DB | In-Memory | MEDIUM | Periodic flush (30s) |
| **On-Premise Dev** | PostgreSQL 16 | Workstation development mirror | `DATABASE_ONPREMISE_DEV_PRIMARY` | LOW | None (local only) |

---

## Live Game Operations (Real-Time Requirements)

### 🎮 Critical Performance Requirements

**This is a LIVE GAME** — Information must be **ready and updated on-demand** with minimal latency. The database architecture is optimized for **real-time responsiveness** with the following guarantees:

### Response Time Guarantees (SLA)

| Operation Type | Target Latency | Maximum Latency | Source | Implementation |
|----------------|----------------|-----------------|--------|----------------|
| **Pokémon Species Lookup** | <1 μs (microsecond) | <10 μs | Engine L1 Cache | In-memory Map |
| **Move Data Lookup** | <1 μs (microsecond) | <10 μs | Engine L1 Cache | In-memory Map |
| **Type Effectiveness** | <1 μs (microsecond) | <10 μs | Engine L1 Cache | In-memory Map |
| **Battle Data Write** | <50 μs (microseconds) | <100 μs | Write Buffer + Write-DB | Simultaneous local writes |
| **User Profile Read** | <50 ms (milliseconds) | <100 ms | Read-DB Mirror | SQLite local |
| **PROD Master Write** | Asynchronous | N/A | Background validation | Non-blocking |

### On-Demand Data Availability

**Real-Time Read Operations (Zero Network Latency):**

```javascript
// 1. Pokémon Species Lookup — <1μs response (98.5% cache hit rate)
const species = await engineCache.getPokemon(25); // Pikachu
// ✅ Served from: Engine L1 Cache (in-memory)
// ✅ Latency: <1 microsecond
// ✅ Network calls: ZERO
// ✅ PROD queries: ZERO

// 2. Move Data Lookup — <1μs response
const move = await engineCache.getMove(1); // Pound
// ✅ Served from: Engine L1 Cache (in-memory)
// ✅ Latency: <1 microsecond
// ✅ Network calls: ZERO

// 3. Type Effectiveness — <1μs response
const effectiveness = await engineCache.getTypeEffectiveness('Fire', 'Grass');
// ✅ Served from: Engine L1 Cache (in-memory)
// ✅ Latency: <1 microsecond
// ✅ Result: 2.0 (super effective)

// 4. User Profile (Cache Miss) — <50ms fallback
const trainer = await readDb.getTrainerProfile(userId);
// ✅ Served from: Engine Read-DB (SQLite local file)
// ✅ Latency: 20-50 milliseconds
// ✅ Network calls: ZERO (local disk read)
```

**Real-Time Write Operations (Non-Blocking, Instant Response):**

```javascript
// Battle Result Recording — <50μs response (instant to player)
async function recordBattleResult(battleData) {
  // ⚡ SIMULTANEOUS writes to BOTH local systems (parallel execution)
  await Promise.all([
    engineWriteBuffer.add(battleData),    // 1. In-memory buffer (<10μs)
    engineWriteDb.writeRaw(battleData)    // 2. SQLite Write-DB (<40μs)
  ]);
  
  // ✅ Player sees result IMMEDIATELY (<50μs total)
  // ✅ Network calls: ZERO
  // ✅ PROD master: Updated later (background, non-blocking)
  
  return { success: true, latency: '<50μs' };
}

// Background Processing (Does NOT block gameplay)
// - Buffer flush: Every 30 seconds → Write-DB (with security check)
// - Validation: Every 10 minutes → Quality score calculation
// - Upload to PROD: After validation passes (quality ≥95%)
// - Player NEVER waits for these operations
```

### Real-Time Data Flow (Live Game Architecture)

```
Player Action (Battle Move)
    │
    │ <1ms Discord command processing
    ↓
┌─────────────────────────────────────────┐
│  Battle Engine (Game Logic)             │
│  - Damage calculation (<1ms)            │
│  - Status effects (<1ms)                │
│  - Victory check (<1ms)                 │
└────────┬────────────────────────────────┘
         │
         │ ⚡ INSTANT (Parallel Writes)
         │
    ┌────┴─────┐
    │          │
    ↓          ↓
┌──────────┐  ┌──────────────┐
│  Write   │  │  Write-DB    │
│  Buffer  │  │  (SQLite)    │
│          │  │              │
│  <10μs   │  │  <40μs       │
│  Memory  │  │  Local disk  │
└──────────┘  └──────────────┘
    │              │
    │              │
    └──────┬───────┘
           │
           │ ✅ Player sees result IMMEDIATELY
           │    Total latency: <50μs
           │    Network calls: ZERO
           │
           │ Background (Non-Blocking)
           ↓
    ┌─────────────────────┐
    │  Security Check #1   │ ← Every 30s
    │  (Buffer → Write-DB) │
    └──────────┬──────────┘
               │
               ↓
    ┌─────────────────────┐
    │  Validation Worker   │ ← Every 10min
    │  (Quality ≥95%)      │
    └──────────┬──────────┘
               │
               ↓
    ┌─────────────────────┐
    │  Security Check #2   │ ← Before upload
    │  (Write-DB → PROD)   │
    └──────────┬──────────┘
               │
               ↓
    ┌─────────────────────┐
    │  PROD Master         │ ← Receives validated data
    │  (Render PostgreSQL) │    (async, non-blocking)
    └─────────────────────┘
```

### Cache Strategy (Zero-Latency Reads)

**L1 Cache (In-Memory) — Primary Read Source:**

```javascript
// Cache Configuration (Optimized for Live Game)
const cacheConfig = {
  maxMemory: 20 * 1024 * 1024,      // 20 MB (bounded)
  refreshInterval: 3600000,          // Hourly refresh (1 hour)
  preloadOnStartup: true,            // CRITICAL: Block startup until loaded
  enableLazyLoading: false,          // Disable (all data preloaded)
  compressionEnabled: false          // Disable (latency over space)
};

// Cache Population (Startup)
async function initializeCache() {
  console.log('⏳ Loading Engine L1 Cache...');
  
  // Load ALL reference data into memory (blocking operation)
  await engineCache.loadFromReadDb();
  
  // ✅ 1,025 species loaded
  // ✅ 919 moves loaded
  // ✅ 324 type effectiveness entries loaded
  // ✅ Memory usage: ~18.7 MB
  // ✅ Load time: ~2.5 seconds (one-time cost)
  
  console.log('✅ Cache ready — 98.5% hit rate expected');
  
  global.engineReady = true; // Signal ready for game traffic
}

// Cache Hit Rate Monitoring
setInterval(async () => {
  const stats = engineCache.getStats();
  
  if (stats.hitRate < 0.95) {
    log.warn('Cache hit rate below target', {
      hitRate: stats.hitRate,
      hits: stats.hits,
      misses: stats.misses,
      target: 0.985
    });
  }
}, 60000); // Check every minute
```

**Cache Refresh Strategy (Zero Downtime):**

```javascript
// Hourly refresh WITHOUT service interruption
async function refreshCache() {
  // Double-buffering pattern (zero downtime)
  const newCache = new Map();
  
  // 1. Load fresh data into NEW cache (background)
  await loadDataIntoCache(newCache);
  
  // 2. Atomic swap (instant, no downtime)
  engineCache.swapBuffers(newCache);
  
  // ✅ Old cache still serving requests during load
  // ✅ Swap happens instantly (atomic operation)
  // ✅ Players experience ZERO latency spike
  // ✅ No cache misses during refresh
  
  log.info('Cache refreshed', {
    species: newCache.pokemon.size,
    moves: newCache.moves.size,
    downtime: '0ms'
  });
}
```

### Write Buffer Strategy (Instant Persistence)

**Dual-Write Pattern (Parallel Execution):**

```javascript
// CRITICAL: Simultaneous writes ensure data safety + instant response
async function persistGameEvent(event) {
  // Start both operations in parallel (not sequential)
  const writePromises = Promise.all([
    // Write #1: In-Memory Buffer (instant, volatile)
    engineWriteBuffer.add({
      timestamp: Date.now(),
      eventType: event.type,
      data: event.data
    }),
    
    // Write #2: SQLite Write-DB (fast, durable)
    engineWriteDb.writeRaw({
      timestamp: Date.now(),
      eventType: event.type,
      data: event.data
    })
  ]);
  
  // Wait for BOTH to complete (still <50μs total)
  await writePromises;
  
  // ✅ Buffer: Instant in-memory write (survives ~30s until flush)
  // ✅ Write-DB: Durable on-disk write (survives crash/restart)
  // ✅ Total latency: <50μs (both local, both fast)
  // ✅ Player: Sees result immediately
  // ✅ Safety: Data persisted in 2 places before confirmation
}
```

**Buffer Management (Bounded, No Memory Leaks):**

```javascript
// Buffer Configuration (Prevents memory exhaustion)
const bufferConfig = {
  maxQueueSize: 10000,              // 10k entries max (hard limit)
  backpressureThreshold: 0.75,      // Warn at 75% (7,500 entries)
  rejectThreshold: 0.95,             // Reject at 95% (9,500 entries)
  flushInterval: 30000,              // Flush every 30 seconds
  flushBatchSize: 1000               // Flush 1k entries at a time
};

// Backpressure Handling (Graceful degradation)
function addToBuffer(data) {
  const currentSize = engineWriteBuffer.size();
  const utilization = currentSize / bufferConfig.maxQueueSize;
  
  if (utilization >= bufferConfig.rejectThreshold) {
    // CRITICAL: Reject new writes (buffer full)
    log.error('Write buffer full — rejecting write', {
      size: currentSize,
      max: bufferConfig.maxQueueSize
    });
    throw new Error('Buffer full');
  }
  
  if (utilization >= bufferConfig.backpressureThreshold) {
    // WARNING: Buffer filling up
    log.warn('Write buffer backpressure', {
      size: currentSize,
      utilization: `${(utilization * 100).toFixed(1)}%`
    });
  }
  
  // Add to buffer (safe, below thresholds)
  engineWriteBuffer.push(data);
}
```

### Monitoring (Real-Time Observability)

**Live Game Metrics:**

```bash
# Check real-time performance via Discord
/ops engine

# Example Output:
📊 Engine Database Statistics

🎯 L1 Cache (In-Memory)
  └─ Species: 1,025 entries
  └─ Moves: 919 entries
  └─ Types: 324 entries
  └─ Memory: 18.7 MB / 20 MB (93.5%)
  └─ Hit Rate: 98.5% (target: ≥95%)
  └─ Latency: <1μs (p99)

📝 Write Buffer (Fast Cache)
  └─ Queue Size: 1,247 / 10,000 (12.5%)
  └─ Utilization: Healthy (no backpressure)
  └─ Flush Interval: 30s (last: 12s ago)
  └─ Latency: <10μs (p99)

💾 Write-DB (Staging)
  └─ Total Entries: 45,892
  └─ Validated: 45,120 (98.3%)
  └─ Quality Score: 98.7% (target: ≥95%)
  └─ Oldest Entry: 14h 32m ago
  └─ WAL Size: 2.4 MB
  └─ Latency: 35ms (p99)

📚 Read-DB (Mirror)
  └─ Species: 1,025 rows
  └─ Moves: 919 rows
  └─ Types: 324 rows
  └─ DB Size: 15.2 MB
  └─ Last Sync: 18h 42m ago (daily at 05:00 UTC)
  └─ Latency: 22ms (p99)
```

**Performance Alerts (Automated):**

```javascript
// Monitor live game latency
setInterval(async () => {
  const metrics = await collectEngineMetrics();
  
  // Alert #1: Cache hit rate degraded
  if (metrics.cache.hitRate < 0.95) {
    alertOps({
      severity: 'WARNING',
      message: 'Cache hit rate below target',
      current: metrics.cache.hitRate,
      target: 0.95,
      impact: 'Players may experience latency'
    });
  }
  
  // Alert #2: Write buffer backpressure
  if (metrics.buffer.utilization > 0.75) {
    alertOps({
      severity: 'WARNING',
      message: 'Write buffer backpressure detected',
      utilization: `${(metrics.buffer.utilization * 100).toFixed(1)}%`,
      impact: 'May start rejecting writes soon'
    });
  }
  
  // Alert #3: Validation quality degraded
  if (metrics.writeDb.qualityScore < 0.95) {
    alertOps({
      severity: 'CRITICAL',
      message: 'Write-DB quality score below threshold',
      score: metrics.writeDb.qualityScore,
      impact: 'Upload to PROD blocked'
    });
  }
}, 60000); // Check every minute
```

### Troubleshooting (Live Game Issues)

**Issue: Players Report Latency/Lag**

```bash
# Step 1: Check cache hit rate
/ops engine
# Look for: Hit Rate: X% (should be ≥95%)

# Step 2: Check PROD connectivity (should NOT be queried during gameplay)
/ops database prod-postgres
# Look for: Active Connections (should be LOW during battles)

# Step 3: Check write buffer health
/ops engine
# Look for: Queue Size, Utilization (should be <75%)

# Step 4: Verify Read-DB sync status
/ops database engine-read
# Look for: Last Sync (should be <24h ago)
```

**Issue: Data Not Appearing Immediately**

```javascript
// DIAGNOSIS: Async validation/upload blocking
// SOLUTION: Check validation worker status

/ops workers
// Look for: Write-DB Validator status (should be HEALTHY)

// Check validation quality
/ops database engine-write
// Look for: Quality Score (should be ≥95%)

// Manual validation run (force upload)
await engineWriteDb.validateData();
await engineWriteDb.uploadToProd();
```

### Best Practices (Live Game Operations)

**✅ DO:**
- Keep cache hit rate ≥95% (refresh hourly)
- Monitor write buffer utilization (alert at 75%)
- Validate write quality before PROD upload (≥95%)
- Use simultaneous writes (buffer + Write-DB)
- Preload cache on startup (block until ready)
- Test cache refresh during low-traffic windows

**❌ DON'T:**
- Query PROD during gameplay (use Read-DB mirror)
- Block gameplay on validation (async background)
- Flush buffer synchronously (use intervals)
- Skip security checkpoints (validate before PROD)
- Disable cache preload (causes latency spikes)
- Allow write buffer to exceed 10k entries

---

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Discord Application Layer                       │
│                         (Node.js Process)                            │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 │ READ Operations
                 │ (User queries, battle lookups, Pokémon data)
                 │
                 ▼
        ┌────────────────┐
        │  Engine L1     │  ← In-Memory Cache (species, moves, types)
        │  Cache         │    98.5% hit rate, <1μs lookup
        └────┬───────────┘
             │ Cache Miss
             ▼
        ┌────────────────┐
        │  Engine        │  ← SQLite Read-DB (Pokémon reference data)
        │  Read-DB       │    Daily sync from PROD (master)
        │  (SQLite)      │    15.2 MB, 1,025 species, 919 moves
        └────────────────┘
             ▲
             │ Daily Sync (05:00 UTC)
             │ Read-DB Sync Worker
             │
        ┌────┴───────────┐
        │  PROD Postgres │  ← MASTER DATABASE (Render hosted)
        │  (Master)      │    - User accounts
        │                │    - Battle records
        │                │    - Encounter history
        │                │    - Species reference (canonical)
        └────────────────┘
             ▲
             │
             │ Validated writes ONLY
             │ (after security checks)
             │
             │
        ┌────┴────────────────────────────────────────────┐
        │    🔒 Security Validation Worker                 │
        │    - Data integrity verification                 │
        │    - Quality score ≥95% required                 │
        │    - Anomaly detection                           │
        │    - Corruption checks (checksums)               │
        └────▲────────────────────────────────────────────┘
             │
             │ Validated data
             │
        ┌────┴───────────┐
        │  Engine        │  ← SQLite Write-DB (battle logs, analytics)
        │  Write-DB      │    - Battle logs (5,678 entries)
        │  (SQLite)      │    - Move usage (123,456 entries)
        │                │    - Anomalies (12 entries)
        └────▲───────────┘
             │
             │ Periodic replication
             │ (every 30s flush)
             │
             │
        ┌────┴────────────────────────────────────────────┐
        │    🔒 Cache → Write-DB Security Worker          │
        │    - Validate buffer data integrity             │
        │    - Check for corrupted entries                │
        │    - Verify battle logic consistency            │
        └────▲────────────────────────────────────────────┘
             │
             │ Game writes (battle results, move usage)
             │
        ┌────┴───────────┐
        │  Engine Write  │  ← In-Memory Buffer (fast local cache)
        │  Buffer        │    - Battle logs queue (2,345 entries)
        │  (In-Memory)   │    - Move usage queue (4,567 entries)
        │                │    - Anomalies queue (588 entries)
        │                │    Max: 10,000 entries, 75% utilized
        └────────────────┘
             ▲
             │ Simultaneous writes
             │ (game engine results)
             │
        ┌────┴───────────┐
        │  Discord       │
        │  Game Engine   │  ← Battle resolution, encounter spawning
        │                │    Writes to BOTH:
        │                │    1. Engine Write Buffer (local fast)
        │                │    2. Engine Write-DB (via buffer flush)
        └────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                     SECURITY CHECKPOINT FLOW                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Game Event → Write Buffer → 🔒 Security Check #1                   │
│               (in-memory)      (corruption, integrity)               │
│                                          ↓                           │
│                                   Write-DB (SQLite)                  │
│                                          ↓                           │
│                              🔒 Security Check #2                    │
│                                 (validation worker)                  │
│                                 - Quality score ≥95%                 │
│                                 - Anomaly detection                  │
│                                 - Checksum verification              │
│                                          ↓                           │
│                                   PROD Postgres                      │
│                                   (Master DB)                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                      REPLICATION WORKERS                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Read-DB Sync Worker (Daily @ 05:00 UTC)                         │
│     PROD (master) → Engine Read-DB                                  │
│     Purpose: Mirror canonical Pokémon reference data                │
│                                                                      │
│  2. Write Buffer Flusher (Every 30s + 10s stagger)                  │
│     Write Buffer → 🔒 Security Check → Write-DB                     │
│     Purpose: Persist game writes with integrity validation          │
│                                                                      │
│  3. Write-DB Validator (Every 10min + 15s stagger)                  │
│     Write-DB → Quality Check (≥95% threshold)                       │
│     Purpose: Validate data before upload to master                  │
│                                                                      │
│  4. Write-DB Upload Worker (After validation passes)                │
│     Write-DB → 🔒 Security Check → PROD (master)                    │
│     Purpose: Send validated analytics back to master                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘


Separate Systems:
┌────────────────┐          ┌─────────────────┐
│  TimescaleDB   │          │ On-Premise Dev  │
│  (Logs/Metrics)│          │ (Workstation)   │
│                │          │                 │
│ - Time-series  │          │ - Development   │
│ - Ingestion    │          │ - Offline work  │
│ - Analytics    │          │ - Mirror of     │
│                │          │   PROD master   │
└────────────────┘          └─────────────────┘
```

---

## Database Architecture

### PROD Postgres (Master Database)

**Role:** **MASTER DATABASE** — Canonical source of truth for all application data

**Connection Details:**
```bash
# Environment Variable
PROD_DATABASE_URL=postgresql://user:pass@host:5432/infinity_gauntlet_db

# Direct Connection (External)
RENDER_DB_EXTERNAL_URL=postgresql://user:pass@external-host:5432/infinity_gauntlet_db

# Connection Pool Settings
PRISMA_CONNECTION_POOL_SIZE=10
PRISMA_CONNECTION_TIMEOUT_MS=10000
PRISMA_QUERY_TIMEOUT_MS=30000
```

**Data Flow:**
- **Reads FROM:** Engine Read-DB syncs daily (05:00 UTC) — mirrors Pokémon reference data
- **Writes TO:** Receives validated analytics from Write-DB after security checks
- **Security Checkpoints:** 
  * ✅ Write-DB validation (quality score ≥95%)
  * ✅ Anomaly detection
  * ✅ Checksum verification
  * ✅ Data integrity checks

**Write Authorization:**
- **Allowed:** Validated game analytics (battle logs, move usage) after passing security checks
- **Blocked:** Unvalidated data, corrupted entries, quality score <95%

**Schema Overview:**
```sql
-- Core Tables (17 total)
User                    -- Discord users (5 columns)
TrainerProfile          -- Game profile data (12 columns)
Pokemon                 -- User-owned Pokémon (20 columns)
Battle                  -- Battle state (15 columns)
Encounter               -- Wild encounters (10 columns)
BusMessage              -- Event queue (8 columns)
Cooldown                -- Rate limiting (6 columns)
Species                 -- Pokémon reference (25 columns)
Move                    -- Move reference (15 columns)
TypeEffectiveness       -- Type chart (4 columns)

-- Indexes (35 total)
User_discordId_key           -- Unique constraint
TrainerProfile_userId_key    -- Unique constraint
Pokemon_trainerId_boxSlot    -- Composite for box lookups
Battle_state_idx             -- Active battle queries
Encounter_state_userId_idx   -- Active encounter queries
BusMessage_status_idx        -- Queue processing
Cooldown_userId_action_idx   -- Rate limit checks
Species_name_idx             -- Species lookup by name
Move_name_idx                -- Move lookup by name
```

**Storage Quotas:**
- **Total Size:** 500 MB (Render managed database)
- **Current Usage:** ~150 MB (30% of quota)
- **Growth Rate:** ~10 MB/month
- **Monitoring Query:**
```sql
SELECT pg_size_pretty(pg_database_size(current_database())) AS size;
```

**Connection Pooling:**
- **Max Connections:** 100 (Render limit)
- **Pool Size:** 10 connections (configurable via `PRISMA_CONNECTION_POOL_SIZE`)
- **Idle Timeout:** 60 seconds
- **Query Timeout:** 30 seconds (configurable via `PRISMA_QUERY_TIMEOUT_MS`)

---

### TimescaleDB (Time-Series Logs)

**Connection Details:**
```bash
# Environment Variable
TIMESCALE_DB_URL=postgresql://user:pass@host:5432/timescale_db

# Hypertable Configuration
chunk_time_interval = 1 day
compression_enabled = true
retention_policy = 30 days
```

**Schema Overview:**
```sql
-- Hypertable
CREATE TABLE log_entries (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL,
  level VARCHAR(10) NOT NULL,
  category VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  correlation_id UUID,
  metadata JSONB,
  PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable (time-partitioned)
SELECT create_hypertable('log_entries', 'timestamp', 
  chunk_time_interval => INTERVAL '1 day');

-- Indexes
CREATE INDEX idx_log_entries_level ON log_entries (level, timestamp DESC);
CREATE INDEX idx_log_entries_category ON log_entries (category, timestamp DESC);
CREATE INDEX idx_log_entries_correlation ON log_entries (correlation_id);
CREATE INDEX idx_log_entries_metadata ON log_entries USING GIN (metadata);

-- Retention Policy (auto-delete after 30 days)
SELECT add_retention_policy('log_entries', INTERVAL '30 days');

-- Compression Policy (compress chunks older than 7 days)
ALTER TABLE log_entries SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'level,category'
);
SELECT add_compression_policy('log_entries', INTERVAL '7 days');
```

**Storage Management:**
```sql
-- Check hypertable size
SELECT 
  hypertable_name,
  pg_size_pretty(total_bytes) AS total_size,
  pg_size_pretty(compressed_total_bytes) AS compressed_size,
  compression_ratio
FROM hypertable_detailed_size('log_entries');

-- Check chunk sizes
SELECT 
  chunk_name,
  pg_size_pretty(total_bytes) AS size,
  range_start,
  range_end
FROM chunks_detailed_size('log_entries')
ORDER BY range_start DESC;

-- Manual compression (if needed)
SELECT compress_chunk(chunk_name)
FROM chunks_detailed_size('log_entries')
WHERE range_end < NOW() - INTERVAL '7 days'
  AND compression_status = 'Uncompressed';
```

**Ingestion Rate:**
- **Target:** 100-500 logs/minute
- **Peak:** 2000 logs/minute (during busy gameplay)
- **Daily Volume:** ~100k-500k log entries
- **Monitoring Query:**
```sql
SELECT 
  date_trunc('hour', timestamp) AS hour,
  COUNT(*) AS log_count,
  COUNT(DISTINCT correlation_id) AS unique_operations
FROM log_entries
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

---

### Engine Read-DB (SQLite)

**Role:** **READ MIRROR** — Syncs FROM PROD master database daily

**File Location:**
```bash
# Production
/Store/engine-read-db/pokemon.db

# Development
Store/engine-read-db/pokemon.db

# Backup Location
/Store/engine-read-db/backups/pokemon-YYYY-MM-DD.db
```

**Data Flow:**
- **Syncs FROM:** PROD Postgres (master) — Daily at 05:00 UTC
- **Purpose:** Mirror canonical Pokémon reference data for fast local reads
- **Sync Worker:** Read-DB Sync Worker (daily schedule + stagger)
- **Rebuild:** Full rebuild from PROD master (not incremental)

**Schema Overview:**
```sql
-- Tables (4 total)
CREATE TABLE pokemon (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  types TEXT NOT NULL,  -- JSON array
  base_stats TEXT NOT NULL,  -- JSON object
  abilities TEXT NOT NULL,  -- JSON array
  moves TEXT NOT NULL  -- JSON array
);

CREATE TABLE moves (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,  -- physical, special, status
  power INTEGER,
  accuracy INTEGER,
  pp INTEGER,
  effect TEXT
);

CREATE TABLE type_effectiveness (
  attacking_type TEXT NOT NULL,
  defending_type TEXT NOT NULL,
  multiplier REAL NOT NULL,
  PRIMARY KEY (attacking_type, defending_type)
);

CREATE TABLE engine_read_version (
  version INTEGER PRIMARY KEY,
  last_sync_timestamp INTEGER NOT NULL,
  source_database TEXT NOT NULL  -- "PROD" or "LOCAL"
);

-- Indexes
CREATE INDEX idx_pokemon_name ON pokemon(name);
CREATE INDEX idx_moves_name ON moves(name);
CREATE INDEX idx_moves_type ON moves(type);
CREATE INDEX idx_type_eff_attacking ON type_effectiveness(attacking_type);
```

**SQLite Configuration:**
```javascript
// WAL mode for better concurrency
PRAGMA journal_mode = WAL;

// Normal synchronous (balance performance and durability)
PRAGMA synchronous = NORMAL;

// Cache size (10 MB)
PRAGMA cache_size = -10000;

// Busy timeout (5 seconds)
PRAGMA busy_timeout = 5000;
```

**Rebuild Procedure:**
```bash
# Daily sync (Render cron job)
npm run db:cli -- sync-engine-read

# Manual rebuild
npm run db:cli -- rebuild-engine-read

# Verification
npm run db:cli -- verify-engine-read
```

---

### Engine Write-DB (SQLite)

**Role:** **WRITE STAGING AREA** — Receives validated writes, then uploads TO PROD master

**File Location:**
```bash
# Production
/Store/engine-write-db/battles.db

# WAL Log
/Store/engine-write-db/battles.db-wal

# Backup Location
/Store/engine-write-db/backups/battles-YYYY-MM-DD.db
```

**Data Flow:**
- **Receives FROM:** Engine Write Buffer (in-memory) — Every 30s flush + 🔒 Security Check #1
- **Uploads TO:** PROD Postgres (master) — After validation passes + 🔒 Security Check #2
- **Security Requirements:**
  * ✅ Quality score ≥95% (Write-DB Validator)
  * ✅ Anomaly detection (no suspicious patterns)
  * ✅ Checksum verification (no corruption)
  * ✅ Data integrity checks (battle logic consistent)

**Write Authorization:**
- **Receives:** Game writes from Write Buffer after security validation
- **Uploads:** Only validated data (quality score ≥95%) to PROD master
- **Blocks:** Corrupted entries, failed validation, anomalies detected

**Schema Overview:**
```sql
-- Tables (4 total)
CREATE TABLE battle_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  battle_id TEXT NOT NULL,
  winner_id TEXT,
  loser_id TEXT,
  turn_count INTEGER,
  duration_ms INTEGER,
  metadata TEXT  -- JSON
);

CREATE TABLE move_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  battle_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  pokemon_species TEXT NOT NULL,
  move_name TEXT NOT NULL,
  was_effective BOOLEAN,
  damage_dealt INTEGER,
  metadata TEXT  -- JSON
);

CREATE TABLE anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  anomaly_type TEXT NOT NULL,
  severity TEXT NOT NULL,  -- low, medium, high, critical
  description TEXT NOT NULL,
  context TEXT,  -- JSON
  resolved BOOLEAN DEFAULT 0
);

CREATE TABLE write_ahead_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  operation_type TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
  table_name TEXT NOT NULL,
  data TEXT NOT NULL,  -- JSON
  checksum TEXT NOT NULL,  -- SHA-256
  applied BOOLEAN DEFAULT 0
);

-- Indexes
CREATE INDEX idx_battle_logs_timestamp ON battle_logs(timestamp DESC);
CREATE INDEX idx_battle_logs_battle_id ON battle_logs(battle_id);
CREATE INDEX idx_move_usage_timestamp ON move_usage(timestamp DESC);
CREATE INDEX idx_move_usage_battle_id ON move_usage(battle_id);
CREATE INDEX idx_anomalies_timestamp ON anomalies(timestamp DESC);
CREATE INDEX idx_anomalies_resolved ON anomalies(resolved, timestamp DESC);
CREATE INDEX idx_wal_applied ON write_ahead_log(applied, timestamp);
```

**WAL Replay Procedure:**
```javascript
// Automatic on startup
await engineWriteDb.replayWAL();

// Manual replay (after crash)
npm run db:cli -- replay-wal

// Verification
npm run db:cli -- verify-wal
```

**Data Lifecycle:**
```javascript
// CRITICAL: Game writes go to BOTH simultaneously
function recordBattleResult(battleData) {
  // Simultaneous writes (fast local cache + staging DB)
  await Promise.all([
    engineWriteBuffer.add(battleData),    // 1. In-memory buffer (instant)
    engineWriteDb.writeRaw(battleData)    // 2. SQLite Write-DB (fast)
  ]);
}

// Flush schedule: Every 30 seconds + 🔒 Security Check #1
setInterval(async () => {
  const bufferedData = engineWriteBuffer.drain();
  
  // Security validation before writing to Write-DB
  const validated = await securityWorker.validateBufferData(bufferedData);
  if (!validated.passed) {
    log.error('Security check failed on buffer data', {
      reason: validated.reason,
      corruptedCount: validated.corruptedEntries
    });
    return; // BLOCK write
  }
  
  await engineWriteDb.bulkWrite(validated.cleanData);
}, 30000);

// Validation schedule: Every 10 minutes
setInterval(async () => {
  const qualityScore = await engineWriteDb.validateData();
  
  if (qualityScore < 0.95) {
    log.warn('Quality score below threshold', { score: qualityScore });
    return; // BLOCK upload to PROD
  }
  
  log.info('Validation passed', { score: qualityScore });
}, 600000);

// Upload to PROD: After validation passes + 🔒 Security Check #2
if (qualityScore >= 0.95) {
  const dataToUpload = await engineWriteDb.getValidatedEntries();
  
  // Final security check before writing to master
  const finalCheck = await securityWorker.validateForMaster(dataToUpload);
  if (!finalCheck.passed) {
    log.error('Final security check failed', {
      reason: finalCheck.reason,
      anomalies: finalCheck.detectedAnomalies
    });
    return; // BLOCK upload to master
  }
  
  // Write to PROD master (authorized)
  await prodPostgres.uploadAnalytics(finalCheck.secureData);
  
  // Pruning: 24 hours after successful upload
  await engineWriteDb.pruneOldEntries();
}
```

**Security Checkpoints:**

**🔒 Security Check #1: Cache → Write-DB**
- **Location:** Write Buffer Flusher worker
- **Purpose:** Validate buffer data before persisting to Write-DB
- **Checks:**
  * Corruption detection (checksum validation)
  * Data integrity (battle logic consistency)
  * Entry format validation (schema compliance)
- **Action on Failure:** BLOCK write, log error, alert ops team

**🔒 Security Check #2: Write-DB → PROD Master**
- **Location:** Write-DB Upload worker
- **Purpose:** Validate staged data before uploading to master
- **Checks:**
  * Quality score ≥95% (Write-DB Validator)
  * Anomaly detection (suspicious patterns)
  * Checksum verification (no corruption)
  * Data integrity (cross-reference validation)
- **Action on Failure:** BLOCK upload, quarantine suspicious data, alert security team

---

## Connection Management

### Connection Priority Order

```typescript
// Database URL selection logic (canonical)
function selectDatabaseUrl(envVars: Record<string, string>): string {
  // Priority: PROD_DATABASE_URL → RENDER_DB_EXTERNAL_URL → LOCAL fallback
  return (
    envVars.PROD_DATABASE_URL ?? 
    envVars.RENDER_DB_EXTERNAL_URL ?? 
    envVars.RENDER_DB_INTERNAL_URL ??
    envVars.DATABASE_ONPREMISE_DEV_PRIMARY ??
    ""
  );
}
```

### Connection Lifecycle

```
Application Startup
│
├─ Load Environment Variables
│  └─ IG_ENV_FILE or .env
│
├─ Select Database URL (priority order)
│
├─ Initialize Prisma Client
│  ├─ Connect to PROD Postgres
│  ├─ Run health check (SELECT 1)
│  └─ Start heartbeat monitoring (30s interval)
│
├─ Initialize TimescaleDB Client (optional)
│  ├─ Connect to TimescaleDB
│  └─ Verify hypertable exists
│
├─ Initialize Engine Read-DB
│  ├─ Open SQLite database
│  ├─ Enable WAL mode
│  └─ Load version info
│
├─ Initialize Engine Write-DB
│  ├─ Open SQLite database
│  ├─ Enable WAL mode
│  └─ Replay WAL entries
│
└─ Mark databases as READY
   └─ Start database workers
```

### Connection Retry Logic

```typescript
// Exponential backoff with jitter
async function connectWithRetry(url: string, maxRetries = 5): Promise<PrismaClient> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = new PrismaClient({ datasources: { db: { url } } });
      await client.$connect();
      
      // Health check
      await client.$queryRaw`SELECT 1`;
      
      log.info('Database connection established', { attempt, url: maskUrl(url) });
      return client;
      
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const shouldRetry = isRetryableError(error);
      
      if (isLastAttempt || !shouldRetry) {
        log.error('Database connection failed (not retrying)', {
          attempt,
          error: getErrorMessage(error),
          retryable: shouldRetry
        });
        throw error;
      }
      
      const baseDelay = 1000;
      const maxDelay = 30000;
      const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = Math.random() * 1000; // 0-1000ms random jitter
      const delayMs = exponentialDelay + jitter;
      
      log.warn('Database connection failed, retrying', {
        attempt,
        maxRetries,
        delayMs,
        error: getErrorMessage(error)
      });
      
      await delay(delayMs);
    }
  }
  
  throw new Error('Connection failed after all retries');
}

// Retryable errors
function isRetryableError(error: any): boolean {
  const message = getErrorMessage(error);
  
  // Network errors (retry)
  if (message.includes('ETIMEDOUT')) return true;
  if (message.includes('ECONNREFUSED')) return true;
  if (message.includes('ECONNRESET')) return true;
  if (message.includes('ENETUNREACH')) return true;
  
  // Authentication errors (don't retry)
  if (message.includes('password authentication failed')) return false;
  if (message.includes('role') && message.includes('does not exist')) return false;
  
  // Database errors (don't retry)
  if (message.includes('database') && message.includes('does not exist')) return false;
  
  // Unknown errors (retry)
  return true;
}
```

### Connection Health Monitoring

```typescript
// Heartbeat monitoring (every 30 seconds)
function startPrismaHeartbeat(): () => void {
  const interval = setInterval(async () => {
    const startTime = performance.now();
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      const latencyMs = performance.now() - startTime;
      
      fireProdHeartbeatEvent({
        success: true,
        latencyMs,
        slow: latencyMs > 100,
        consecutiveFailures: 0,
        source: 'heartbeat'
      });
      
    } catch (error) {
      const latencyMs = performance.now() - startTime;
      
      fireProdHeartbeatEvent({
        success: false,
        latencyMs,
        slow: false,
        consecutiveFailures: getConsecutiveFailures() + 1,
        source: 'heartbeat',
        error: getErrorMessage(error)
      });
      
      // Auto-reconnect after 3 consecutive failures
      if (getConsecutiveFailures() >= 3) {
        log.error('Database heartbeat: 3 consecutive failures, attempting reconnect');
        await reconnectDatabase();
      }
    }
  }, 30000); // 30 seconds
  
  return () => clearInterval(interval);
}
```

---

## Health Check Operations

### /ops Commands

#### Check All Database Workers

```
/ops database
```

**Output:**
```
📊 Database Workers Status

PROD Postgres Worker:
  Status: ✅ HEALTHY
  Latency: 45ms
  Operations: 12,450 (12,398 success, 52 errors)
  Error Rate: 0.42%
  Uptime: 6h 23m

TimescaleDB Worker:
  Status: ✅ HEALTHY
  Latency: 67ms
  Operations: 145,678 (145,234 success, 444 errors)
  Error Rate: 0.30%
  Uptime: 6h 23m

Engine Read Worker:
  Status: ✅ HEALTHY
  Operations: 234 (234 success, 0 errors)
  Last Sync: 2h 15m ago
  
Engine Write Worker:
  Status: ✅ HEALTHY
  Operations: 1,234 (1,234 success, 0 errors)
  WAL Entries: 0 (all applied)
```

#### Check Specific Worker

```
/ops database worker:prod
/ops database worker:timescale
/ops database worker:engine-read
/ops database worker:engine-write
```

#### Query Database Directly

```bash
# Using db:cli tool
npm run db:cli -- status          # Connection info + sample counts
npm run db:cli -- counts          # Table counts (Species, BusMessage, etc.)
npm run db:cli -- count Species   # Single table count
npm run db:cli -- query "SELECT COUNT(*) FROM \"Species\";"
```

### Direct Database Queries

#### PROD Postgres Health Check

```sql
-- Connection test
SELECT 1;

-- Check active connections
SELECT 
  count(*) AS connection_count,
  max_conn
FROM pg_stat_database
CROSS JOIN (SELECT setting::int AS max_conn FROM pg_settings WHERE name = 'max_connections') AS s
WHERE datname = current_database();

-- Check slow queries (>1 second)
SELECT 
  pid,
  now() - query_start AS duration,
  state,
  query
FROM pg_stat_activity
WHERE state != 'idle'
  AND now() - query_start > interval '1 second'
ORDER BY duration DESC;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan AS scans,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;
```

#### TimescaleDB Health Check

```sql
-- Check hypertable status
SELECT * FROM timescaledb_information.hypertables;

-- Check chunk count and sizes
SELECT 
  COUNT(*) AS chunk_count,
  pg_size_pretty(SUM(total_bytes)) AS total_size,
  pg_size_pretty(SUM(compressed_total_bytes)) AS compressed_size
FROM chunks_detailed_size('log_entries');

-- Check compression ratio
SELECT 
  pg_size_pretty(before_compression_total_bytes) AS uncompressed,
  pg_size_pretty(after_compression_total_bytes) AS compressed,
  (1 - after_compression_total_bytes::float / before_compression_total_bytes::float) * 100 AS compression_pct
FROM hypertable_compression_stats('log_entries');

-- Check retention policy
SELECT * FROM timescaledb_information.drop_chunks_policies;

-- Check compression policy
SELECT * FROM timescaledb_information.compression_settings;
```

#### Engine SQLite Health Check

```javascript
// Read-DB stats
const readStats = engineReadDb.getStats();
console.log('Read-DB:', {
  pokemon: readStats.pokemonCount,
  moves: readStats.moveCount,
  typeEffectiveness: readStats.typeEffectivenessCount,
  sizeBytes: readStats.sizeBytes,
  lastSync: readStats.lastSyncTimestamp
});

// Write-DB stats
const writeStats = engineWriteDb.getStats();
console.log('Write-DB:', {
  battleLogs: writeStats.battleLogCount,
  moveUsage: writeStats.moveUsageCount,
  anomalies: writeStats.anomalyCount,
  walEntries: writeStats.walEntryCount,
  oldestEntryAge: writeStats.oldestEntryAge
});
```

---

## Troubleshooting Procedures

### Problem: Cannot Connect to PROD Postgres

**Symptoms:**
- Application fails to start
- Error: `Error: connect ETIMEDOUT` or `Error: ECONNREFUSED`
- `/ops database` shows "ERROR" status

**Diagnosis Steps:**

```powershell
# Step 1: Verify environment variable
echo $env:PROD_DATABASE_URL
# Should be: postgresql://user:pass@host:5432/database

# Step 2: Test connectivity from local machine
Test-NetConnection -ComputerName <host> -Port 5432

# Step 3: Test with psql
psql $env:PROD_DATABASE_URL -c "SELECT 1"

# Step 4: Check Render service status
pwsh -File scripts/render_status.ps1

# Step 5: Check Render database status
# Visit: https://dashboard.render.com/d/dpg-XXXXXXXXXXXX
```

**Resolution:**

```bash
# If network unreachable:
# - Check Render status page: https://status.render.com/
# - Verify database is running in Render dashboard
# - Check firewall rules allow Render IPs

# If authentication failed:
# - Verify PROD_DATABASE_URL credentials
# - Reset database password in Render dashboard
# - Update environment variable and redeploy

# If database doesn't exist:
# - Create database via Render dashboard
# - Run migrations: npx prisma migrate deploy
# - Seed reference data: npm run db:seed:dex

# If connection pool exhausted:
# - Check for connection leaks: npm run db:cli -- connections
# - Restart service: pwsh -File scripts/render_restart.ps1 -Service Infinity-Gauntlet
# - Increase pool size: PRISMA_CONNECTION_POOL_SIZE=20
```

---

### Problem: TimescaleDB Ingestion Lag

**Symptoms:**
- Logs not appearing in `/ops logs` immediately
- TimescaleDB worker shows high latency
- Large backlog in Event Bus queue

**Diagnosis Steps:**

```sql
-- Check ingestion rate
SELECT 
  date_trunc('minute', timestamp) AS minute,
  COUNT(*) AS log_count
FROM log_entries
WHERE timestamp > NOW() - INTERVAL '10 minutes'
GROUP BY minute
ORDER BY minute DESC;

-- Check Event Bus queue depth
SELECT COUNT(*) FROM "BusMessage" WHERE status = 'PENDING';

-- Check TimescaleDB worker status
```

Via Discord:
```
/ops workers detailed:true
# Look for "Log Ingestion Worker"

/ops database worker:timescale
# Check latencyMs and error rate
```

**Resolution:**

```typescript
// Increase batch size (process more logs per worker execution)
const TIMESCALE_BATCH_SIZE = 1000; // Up from 100

// Increase worker frequency (run more often)
const LOG_INGESTION_INTERVAL_MS = 10000; // Down from 30000 (10s instead of 30s)

// Add parallel processing
async function ingestLogsParallel(logs: LogEntry[]) {
  const batchSize = 100;
  const batches = chunk(logs, batchSize);
  
  await Promise.all(
    batches.map(batch => timescaleWorker.insertBatch(batch))
  );
}
```

---

### Problem: Engine Read-DB Out of Date

**Symptoms:**
- Battle engine uses wrong Pokémon stats
- New species not available despite being in PROD
- `/ops engine` shows "Last Sync: >24h ago"

**Diagnosis Steps:**

```javascript
// Check last sync time
const readStats = engineReadDb.getStats();
console.log('Last sync:', new Date(readStats.lastSyncTimestamp));

// Check version mismatch
const prodVersion = await prisma.species.count();
const readVersion = readStats.pokemonCount;
console.log('PROD species:', prodVersion);
console.log('Read-DB species:', readVersion);
console.log('Delta:', prodVersion - readVersion);
```

**Resolution:**

```bash
# Manual rebuild (immediate)
npm run db:cli -- rebuild-engine-read

# Verify sync
npm run db:cli -- verify-engine-read

# If automatic sync not working, check cron job
# Render dashboard > pokedex-cache-failsafe > Logs
```

---

## Failover Procedures

### PROD Postgres Failover

**Scenario:** Primary PROD Postgres database becomes unavailable

**Automatic Failover (Render Managed):**
- Render provides automatic failover for managed databases
- Failover time: ~2-5 minutes
- No manual intervention required

**Manual Failover Steps (if automatic fails):**

```bash
# Step 1: Verify primary is down
psql $PROD_DATABASE_URL -c "SELECT 1"
# Should fail with connection error

# Step 2: Check Render dashboard for failover status
# Visit: https://dashboard.render.com/d/dpg-XXXXXXXXXXXX
# Look for "Failover in progress" message

# Step 3: If failover stuck, contact Render support
# Support: https://render.com/support
# Include: Database ID, timestamp, error message

# Step 4: While waiting, switch to read-replica (if available)
# Update PROD_DATABASE_URL to point to replica
# Note: Replica is read-only, writes will fail

# Step 5: After failover completes, verify connection
psql $PROD_DATABASE_URL -c "SELECT COUNT(*) FROM \"User\""
# Should return user count

# Step 6: Restart application
pwsh -File scripts/render_restart.ps1 -Service Infinity-Gauntlet

# Step 7: Verify workers healthy
/ops database
```

**Downtime Estimate:** 2-10 minutes (automatic failover)

---

### TimescaleDB Failover

**Scenario:** TimescaleDB becomes unavailable

**Impact Assessment:**
- **Critical:** Log ingestion stops (logs lost if buffer overflows)
- **Non-Critical:** Application continues (logs buffered in Event Bus)
- **Recovery:** Logs reprocessed when TimescaleDB restored

**Manual Failover Steps:**

```bash
# Step 1: Verify TimescaleDB is down
psql $TIMESCALE_DB_URL -c "SELECT 1"

# Step 2: Check Event Bus queue depth
npm run db:cli -- query "SELECT COUNT(*) FROM \"BusMessage\" WHERE status = 'PENDING'"

# Step 3: If queue growing rapidly, increase buffer size
# Edit src/shared/event-bus.ts:
const MAX_QUEUE_SIZE = 100000; // Up from 10000

# Step 4: Deploy buffer increase
pwsh -File scripts/render_deploy.ps1 -Service Infinity-Gauntlet

# Step 5: Monitor buffer utilization
/ops stats
# Look for "Event Bus" section

# Step 6: When TimescaleDB restored, verify connection
psql $TIMESCALE_DB_URL -c "SELECT 1"

# Step 7: Restart log ingestion worker
pwsh -File scripts/render_restart.ps1 -Service Infinity-Gauntlet

# Step 8: Monitor catch-up progress
/ops logs level:info category:worker since:10m
# Look for "Log batch ingested" messages
```

**Recovery Time:** Queue catchup takes ~10 minutes per 100k buffered logs

---

## Data Recovery Procedures

### Restore from Backup (PROD Postgres)

**Scenario:** Data corruption, accidental deletion, or schema rollback needed

**Backup Schedule:**
- **Automatic:** Daily at 02:00 UTC (Render managed)
- **Retention:** 7 days (rolling)
- **Location:** Render dashboard > Database > Backups

**Restoration Steps:**

```bash
# Step 1: Stop application (prevent writes during restore)
pwsh -File scripts/render_restart.ps1 -Service Infinity-Gauntlet -Stop

# Step 2: Create point-in-time backup (safety net)
# Render dashboard > Database > Backups > Create Manual Backup
# Name: "pre-restore-YYYY-MM-DD-HHMM"

# Step 3: Identify restore point
# Render dashboard > Database > Backups
# Select backup by date/time

# Step 4: Restore backup
# Click "Restore" button
# Confirm: "This will overwrite current database"
# Wait for completion (~5-15 minutes depending on size)

# Step 5: Verify restoration
psql $PROD_DATABASE_URL -c "SELECT COUNT(*) FROM \"User\""
# Verify count matches expected

# Step 6: Run data integrity check
npm run db:cli -- verify-integrity

# Step 7: Restart application
pwsh -File scripts/render_restart.ps1 -Service Infinity-Gauntlet

# Step 8: Verify application health
/ops database
/ops stats

# Step 9: Monitor for errors
/ops logs level:error since:10m
```

**Downtime:** 10-20 minutes (depends on database size)

---

### WAL Replay (Engine Write-DB)

**Scenario:** Engine Write-DB corruption or crash recovery

**WAL Structure:**
```sql
-- Write-Ahead Log entry
{
  "id": 12345,
  "timestamp": 1733097600000,
  "operation_type": "INSERT",
  "table_name": "battle_logs",
  "data": {
    "battle_id": "battle-abc123",
    "winner_id": "user-xyz",
    "turn_count": 25,
    ...
  },
  "checksum": "sha256-hash",
  "applied": false
}
```

**Replay Procedure:**

```javascript
// Automatic on startup
await engineWriteDb.initialize();
await engineWriteDb.replayWAL();

// Manual replay
npm run db:cli -- replay-wal

// Replay process:
// 1. Read all unapplied WAL entries (applied = 0)
// 2. Verify checksum (detect corruption)
// 3. Apply operation (INSERT/UPDATE/DELETE)
// 4. Mark as applied (applied = 1)
// 5. Log success/failure
```

**Error Handling:**

```typescript
async function replayWAL(): Promise<WalReplayResult> {
  const unappliedEntries = await this.getUnappliedWalEntries();
  let successCount = 0;
  let failureCount = 0;
  const errors: string[] = [];
  
  for (const entry of unappliedEntries) {
    try {
      // Verify checksum
      const expectedChecksum = calculateChecksum(entry.data);
      if (entry.checksum !== expectedChecksum) {
        throw new Error(`Checksum mismatch (expected: ${expectedChecksum}, got: ${entry.checksum})`);
      }
      
      // Apply operation
      await this.applyWalEntry(entry);
      
      // Mark as applied
      await this.markWalEntryApplied(entry.id);
      
      successCount++;
      
    } catch (error) {
      failureCount++;
      errors.push(`WAL entry ${entry.id}: ${getErrorMessage(error)}`);
      
      log.error('WAL replay failed for entry', {
        entryId: entry.id,
        operation: entry.operation_type,
        table: entry.table_name,
        error: getErrorMessage(error)
      });
    }
  }
  
  return { successCount, failureCount, errors };
}
```

---

## Rollback Procedures

### Schema Rollback (Prisma Migrations)

**Scenario:** New migration causes production issues

**Rollback Steps:**

```bash
# Step 1: Identify problematic migration
npx prisma migrate status
# Look for most recent migration

# Step 2: Create rollback SQL (manual)
# Edit: prisma/migrations/<migration-name>/rollback.sql
# Write SQL to undo migration changes

# Example rollback.sql:
# -- Undo migration 20251202120000_add_new_column
# ALTER TABLE "User" DROP COLUMN "new_column";

# Step 3: Stop application
pwsh -File scripts/render_restart.ps1 -Service Infinity-Gauntlet -Stop

# Step 4: Execute rollback
psql $PROD_DATABASE_URL -f prisma/migrations/<migration-name>/rollback.sql

# Step 5: Delete migration record
psql $PROD_DATABASE_URL -c "DELETE FROM \"_prisma_migrations\" WHERE migration_name = '<migration-name>'"

# Step 6: Revert schema.prisma
git revert <commit-hash>
git push

# Step 7: Generate Prisma Client
npx prisma generate

# Step 8: Restart application
pwsh -File scripts/render_restart.ps1 -Service Infinity-Gauntlet

# Step 9: Verify
/ops database
npm run db:cli -- status
```

---

## Performance Optimization

### Identify Slow Queries

```sql
-- Enable pg_stat_statements (if not enabled)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slowest queries
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100 -- queries >100ms average
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Find most called queries
SELECT 
  query,
  calls,
  mean_exec_time,
  total_exec_time
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;

-- Reset stats (after optimization)
SELECT pg_stat_statements_reset();
```

### Add Indexes

```sql
-- Before adding index, check if query uses existing indexes
EXPLAIN ANALYZE
SELECT * FROM "Battle" WHERE state = 'ACTIVE' AND "createdAt" > NOW() - INTERVAL '1 hour';

-- Look for "Seq Scan" (bad) vs "Index Scan" (good)

-- Add index
CREATE INDEX CONCURRENTLY idx_battle_state_created 
ON "Battle" (state, "createdAt" DESC);

-- Verify index usage
EXPLAIN ANALYZE
SELECT * FROM "Battle" WHERE state = 'ACTIVE' AND "createdAt" > NOW() - INTERVAL '1 hour';
-- Should now show "Index Scan using idx_battle_state_created"
```

### Optimize Queries

```typescript
// BAD: N+1 query problem
for (const user of users) {
  const profile = await prisma.trainerProfile.findUnique({
    where: { userId: user.id }
  });
}

// GOOD: Single query with JOIN
const usersWithProfiles = await prisma.user.findMany({
  include: { trainerProfile: true }
});

// BAD: Load all data into memory
const allBattles = await prisma.battle.findMany();
const activeBattles = allBattles.filter(b => b.state === 'ACTIVE');

// GOOD: Filter in database
const activeBattles = await prisma.battle.findMany({
  where: { state: 'ACTIVE' }
});

// BAD: Multiple separate queries
const userCount = await prisma.user.count();
const battleCount = await prisma.battle.count();
const encounterCount = await prisma.encounter.count();

// GOOD: Single query with aggregations
const stats = await prisma.$queryRaw`
  SELECT 
    (SELECT COUNT(*) FROM "User") AS users,
    (SELECT COUNT(*) FROM "Battle") AS battles,
    (SELECT COUNT(*) FROM "Encounter") AS encounters
`;
```

---

## Maintenance Windows

### Scheduled Maintenance Tasks

| Task | Frequency | Duration | Impact | Schedule |
|------|-----------|----------|--------|----------|
| **Database Backup** | Daily | 5-10 min | None (online) | 02:00 UTC |
| **Vacuum/Analyze** | Weekly | 10-20 min | Slow queries | Sunday 03:00 UTC |
| **Index Rebuild** | Monthly | 20-30 min | Slow queries | 1st Sunday 03:00 UTC |
| **TimescaleDB Compression** | Daily | 5-10 min | None (auto) | 04:00 UTC |
| **Engine DB Rebuild** | Daily | 2-5 min | None (lazy load) | 05:00 UTC |
| **Log Pruning** | Daily | 1-2 min | None | 06:00 UTC |

### Zero-Downtime Deployment

```bash
# Step 1: Deploy new version (rolling restart)
pwsh -File scripts/render_deploy.ps1 -Service Infinity-Gauntlet
# Render automatically does zero-downtime deploy

# Step 2: Monitor health during deployment
/ops stats
# Watch for status changes

# Step 3: Verify new version
/ops stats
# Check version number

# Step 4: Monitor for errors
/ops logs level:error since:5m

# Step 5: Rollback if needed
# Render dashboard > Service > Rollback to previous deploy
```

---

## Backup & Restore

### Backup Schedule

**PROD Postgres:**
- Automatic daily backups (Render managed)
- Retention: 7 days
- Manual backups: Unlimited (user-triggered)

**TimescaleDB:**
- Automatic daily backups (Render managed)
- Retention: 7 days
- Compressed chunks: Auto-archived

**Engine SQLite:**
- Daily snapshots to `/Store/engine-read-db/backups/`
- Retention: 30 days
- Manual backup: `npm run db:cli -- backup-engine-db`

### Manual Backup Procedure

```bash
# PROD Postgres
# Method 1: pg_dump (full backup)
pg_dump $PROD_DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql

# Method 2: pg_dump (schema only)
pg_dump --schema-only $PROD_DATABASE_URL > schema-backup.sql

# Method 3: pg_dump (data only)
pg_dump --data-only $PROD_DATABASE_URL > data-backup.sql

# Method 4: Render dashboard
# Visit: Database > Backups > Create Manual Backup

# TimescaleDB
pg_dump $TIMESCALE_DB_URL > timescale-backup-$(date +%Y%m%d-%H%M%S).sql

# Engine SQLite
npm run db:cli -- backup-engine-db
```

---

## Monitoring & Alerts

### Key Metrics

| Metric | Target | Warning | Critical | Alert Channel |
|--------|--------|---------|----------|---------------|
| **Connection Count** | <50 | >80 | >95 | Slack #alerts |
| **Query Latency (p50)** | <50ms | >100ms | >500ms | Slack #ops |
| **Query Latency (p99)** | <200ms | >500ms | >2000ms | PagerDuty |
| **Error Rate** | 0% | >1% | >5% | Slack #alerts |
| **Database Size** | <400 MB | >450 MB | >490 MB | Slack #ops |
| **Slow Query Count** | 0/min | >10/min | >50/min | Slack #alerts |
| **WAL Replay Failures** | 0 | >1 | >5 | PagerDuty |

### Monitoring Queries

```sql
-- Database size growth
SELECT 
  date_trunc('day', current_timestamp) AS day,
  pg_size_pretty(pg_database_size(current_database())) AS size
FROM generate_series(NOW() - INTERVAL '7 days', NOW(), INTERVAL '1 day');

-- Connection pool usage
SELECT 
  COUNT(*) AS active_connections,
  MAX((SELECT setting FROM pg_settings WHERE name = 'max_connections')::int) AS max_connections,
  ROUND(COUNT(*)::numeric / (SELECT setting FROM pg_settings WHERE name = 'max_connections')::numeric * 100, 2) AS usage_pct
FROM pg_stat_activity
WHERE datname = current_database();

-- Slow query log
SELECT 
  query,
  mean_exec_time,
  calls,
  total_exec_time / 1000 / 60 AS total_minutes
FROM pg_stat_statements
WHERE mean_exec_time > 1000 -- >1 second
ORDER BY mean_exec_time DESC;
```

---

## Appendix

### Database URLs Reference

```bash
# Production
PROD_DATABASE_URL=postgresql://user:pass@host.render.com:5432/infinity_gauntlet_db
RENDER_DB_EXTERNAL_URL=postgresql://user:pass@external-host.render.com:5432/infinity_gauntlet_db
TIMESCALE_DB_URL=postgresql://user:pass@timescale-host.render.com:5432/timescale_db

# Development (Workstation)
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
DATABASE_ONPREMISE_DEV_EXPERIMENT=postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment
```

### Related Documentation

- [Worker Troubleshooting Guide](./worker-troubleshooting-comprehensive.md)
- [Complete System Architecture](../architecture-bible/complete-system-architecture.md)
- [Deployment Checklist](./deployment-checklist-comprehensive.md)
- [/ops Commands Reference](./ops-commands-reference.md)

---

**END OF DOCUMENT**

For questions or updates to this runbook, contact: database-team@example.com
