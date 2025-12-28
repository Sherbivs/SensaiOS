# /Store Write Elimination Migration Plan

**Date**: 2025-12-27  
**Objective**: Stop ALL file writes to /Store, redirect to databases  
**Policy**: Database-First Architecture

---

## Current Writers to /Store

### 1. Heap Snapshots (HIGH IMPACT - 53 MB) ✅ COMPLETE
**Location**: `/Store/startup-heap-*.heapsnapshot`  
**Writer**: V8 heap profiler (via `v8.writeHeapSnapshot()`)  
**Solution**: ✅ **MIGRATED 2025-12-28** — Replaced with `heap_snapshots` table in `engine-write.db` (SQLite)
- Memory metrics captured via `process.memoryUsage()` and `v8.getHeapStatistics()`
- Equivalent observability: RSS, heap total/used, external, array buffers, V8 stats
- Storage: <1 KB per snapshot vs ~27 MB raw file
- Heap-pruner worker updated to cleanup-only mode (will delete legacy files)

### 2. Restart Metrics (4 KB)
**Location**: `/Store/restart-metrics.json`  
**Writer**: `src/services/restart-metrics.ts`  
**Solution**: Migrate to `runtime_metrics` table in PostgreSQL

### 3. Security Bot State (3.0 MB)
**Location**: `/Store/security-bot-state/`  
**Writer**: Security bot persistence layer  
**Solution**: Phase 2-9 migration already planned - execute immediately

### 4. Kernel Logs (28 KB)
**Location**: `/Store/kernel-logs/`  
**Writer**: Kernel logger  
**Solution**: Already has TimeScaleDB migration path - activate it

### 5. Alert Dispatcher (4 KB)
**Location**: `/Store/alerts/`  
**Writer**: `src/services/alert-dispatcher.ts`  
**Solution**: Write to `alert_queue` table in PostgreSQL

### 6. Cache Directories
**Location**: `/Store/runtime-cache/`, `/Store/discord-cache/`, `/Store/pokemon-cache/`  
**Writer**: Various cache services  
**Solution**: Migrate to Redis or PostgreSQL `cache_entries` table

### 7. Guild Config (2.4 KB)
**Location**: `/Store/guild-member-timeout-config.json`  
**Writer**: Guild configuration service  
**Solution**: Migrate to `guild_config` table

### 8. Cooldowns (8 KB)
**Location**: `/Store/cooldowns/`  
**Writer**: Cooldown tracking  
**Solution**: Migrate to `cooldowns` table with expiry timestamps

### 9. Error Reports
**Location**: `/Store/error-reports/`  
**Writer**: `src/services/monitoring/error-tracker.ts`  
**Solution**: TimeScaleDB `error_log` table (already exists)

### 10. Engine Databases (456 KB)
**Location**: `/Store/engine-write.db`, `/Store/engine-read.db`  
**Writer**: Engine DB services  
**Solution**: KEEP - These ARE databases (SQLite) - compliant with policy

---

## Migration Priority

| Priority | Item | Impact | Effort | Status |
|----------|------|--------|--------|--------|
| **P0** | Stop heap snapshot writes | -53 MB/day | 2h | ✅ **COMPLETE** (2025-12-28) |
| **P0** | Restart metrics → PostgreSQL | -4 KB | 30m | READY |
| **P1** | Security state → PostgreSQL | -3 MB | 4h | ✅ **COMPLETE** (2025-12-27) |
| **P1** | Kernel logs → TimeScaleDB | -28 KB | 1h | READY |
| **P2** | Alert dispatcher → PostgreSQL | -4 KB | 30m | READY |
| **P2** | Guild config → PostgreSQL | -2.4 KB | 30m | READY |
| **P2** | Cooldowns → PostgreSQL | -8 KB | 1h | READY |
| **P3** | Cache → PostgreSQL/Redis | -44 KB | 3h | PLANNED |
| **P3** | Error reports → TimeScaleDB | varies | 1h | READY |

**Total savings**: 56.5 MB (99% of current /Store usage)

### ✅ Completed Migrations

#### Heap Snapshots (2025-12-28)
**Files migrated:**
- `src/index.ts` — Replaced `v8.writeHeapSnapshot()` with DB insert
- `src/services/database/engine-write-db.ts` — Added `heap_snapshots` table + insert/query functions
- `src/workers/heap-pruner.ts` — Deprecated to cleanup-only mode

**Database schema:**
```sql
CREATE TABLE heap_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at INTEGER NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('startup', 'manual', 'oom-warning')),
  rss_bytes INTEGER NOT NULL,
  heap_total_bytes INTEGER NOT NULL,
  heap_used_bytes INTEGER NOT NULL,
  external_bytes INTEGER NOT NULL,
  array_buffers_bytes INTEGER NOT NULL,
  v8_total_heap_bytes INTEGER NOT NULL,
  v8_used_heap_bytes INTEGER NOT NULL,
  v8_heap_limit_bytes INTEGER NOT NULL,
  v8_malloced_bytes INTEGER NOT NULL,
  v8_external_bytes INTEGER NOT NULL,
  heap_utilization_percent REAL NOT NULL,
  mystery_allocation_bytes INTEGER NOT NULL
);
CREATE INDEX idx_heap_snapshots_captured_at ON heap_snapshots(captured_at DESC);
```

**Impact:** Eliminated ~27 MB per startup (previously ~53 MB/day with 2 restarts)

#### Security Bot State (2025-12-27)
**Files migrated:**
- `src/bot/state/persistence.ts` — Core save/load/shutdown via CacheEntry table
- `src/bot/state/roleArchive.ts` — Role archive with HMAC integrity
- `src/bot/state/securityBaselines.ts` — Security baselines with HMAC

**Database keys:**
- `security-bot-state:current` — Active runtime state
- `security-bot-state:previous` — Backup from last save
- `security-bot-state:snapshot:{timestamp}` — Timestamped snapshots (7-day retention)
- `security-bot-state:backup-{n}` — Rotating backups (0, 1, 2)
- `security-bot-state:role-archive` — Role change archive with HMAC
- `security-bot-state:baselines` — Security baselines with HMAC

**Impact:** Eliminated ~3 MB of /Store writes per deployment cycle

---

## Database Schema Requirements

### PostgreSQL Tables Needed

```sql
-- Restart metrics (src/services/restart-metrics.ts)
CREATE TABLE runtime_metrics (
  id SERIAL PRIMARY KEY,
  metric_type TEXT NOT NULL, -- 'restart', 'crash', 'shutdown'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger TEXT,
  uptime_ms BIGINT,
  error_message TEXT,
  stack_trace TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_runtime_metrics_type_timestamp ON runtime_metrics(metric_type, timestamp DESC);

-- Alert queue (src/services/alert-dispatcher.ts)
CREATE TABLE alert_queue (
  id SERIAL PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL, -- 'critical', 'warning', 'info'
  message TEXT NOT NULL,
  metadata JSONB,
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_alert_queue_created ON alert_queue(created_at DESC);
CREATE INDEX idx_alert_queue_pending ON alert_queue(dispatched_at) WHERE dispatched_at IS NULL;

-- Guild configuration (guild-member-timeout-config.json)
CREATE TABLE guild_config (
  guild_id TEXT PRIMARY KEY,
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_guild_config_key ON guild_config(config_key);

-- Cooldowns (src/services/cache.ts cooldowns)
CREATE TABLE cooldowns (
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, action_type)
);
CREATE INDEX idx_cooldowns_expires ON cooldowns(expires_at);

-- Cache entries (runtime-cache, discord-cache, pokemon-cache)
CREATE TABLE cache_entries (
  cache_key TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cache_namespace ON cache_entries(namespace);
CREATE INDEX idx_cache_expires ON cache_entries(expires_at) WHERE expires_at IS NOT NULL;
```

### SQLite (engine-write.db) Tables Needed

```sql
-- Heap snapshots (parse and summarize only)
CREATE TABLE heap_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL,
  trigger TEXT NOT NULL, -- 'startup', 'manual', 'oom-warning'
  heap_size_bytes INTEGER NOT NULL,
  external_size_bytes INTEGER,
  array_buffer_size_bytes INTEGER,
  top_allocators TEXT, -- JSON array of top 10 allocators
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_heap_captured ON heap_snapshots(captured_at DESC);
```

---

## Implementation Steps

### ✅ Step 1: Create Database Schemas (COMPLETE)
- ✅ Prisma schema updated (`prisma/schema.prisma`)
- ✅ Migration file created (`20251227075227_store_write_elimination/migration.sql`)
- ✅ Tables: runtime_metrics, alert_queue, guild_config, cache_entries
- **Ready to apply**: `psql $PROD_DATABASE_URL -f prisma/migrations/20251227075227_store_write_elimination/migration.sql`

### ⏳ Step 2: Apply Migration to Production (30 min)
```bash
# Option 1: SSH into Render and apply directly
wsl ssh render-virginia
psql $PROD_DATABASE_URL -f /opt/render/project/src/prisma/migrations/20251227075227_store_write_elimination/migration.sql

# Option 2: From local workstation
$env:PROD_DATABASE_URL=(Get-Content "secrets\Infinity-Gauntlet.env" | Select-String "^PROD_DATABASE_URL=")
psql $PROD_DATABASE_URL -f prisma/migrations/20251227075227_store_write_elimination/migration.sql

# Verify tables created
psql $PROD_DATABASE_URL -c "\dt *metrics* *alert* *guild_config* *cache_entries*"
```

### ⏳ Step 3: Redirect Writers - Phase 1 (P0 Priority) (3 hours)
1. ✅ Heap snapshots: Parse → DB, delete raw
2. ✅ Restart metrics: PostgreSQL instead of JSON
3. ✅ Alert dispatcher: PostgreSQL queue
4. ✅ Guild config: PostgreSQL table
5. ✅ Cooldowns: PostgreSQL table with expiry
6. ✅ Cache: PostgreSQL cache_entries table

### Step 3: Activate TimeScaleDB Workers (1 hour)
- Kernel logs → TimeScaleDB
- Error reports → TimeScaleDB
- Already implemented in `src/workers/database/timescaledb-worker.ts`

### Step 4: Remove Maintenance Scripts (10 min)
- Delete `scripts/store-maintenance.sh`
- Delete `scripts/cleanup-store-heaps.sh`
- Delete `scripts/verify-store-policy.sh`
- Remove cron job from render.yaml

### Step 5: Verify Zero Writes (30 min)
```bash
# Monitor /Store for 24 hours
watch -n 60 'du -sh /Store && find /Store -type f -mmin -60'

# Should see ZERO new files after deployment
```

---

## Target State

```
/Store/
├── engine-write.db       (SQLite - COMPLIANT)
├── engine-read.db        (SQLite - COMPLIANT)
└── (no other files)
```

**Expected size**: ~1-2 MB (databases only)  
**Write frequency**: Database updates only (no new files)  
**Maintenance**: NONE NEEDED

---

## Rollback Plan

If issues arise:
1. Revert Prisma migration: `npx prisma migrate resolve --rolled-back <migration>`
2. Re-enable file writers via feature flags
3. Restore /Store writes temporarily
4. Debug database performance issues

---

**Status**: READY TO EXECUTE  
**Next Action**: Create Prisma migration for new tables

