# Data Architect: System Audit Report
**Specialist:** Data Architect  
**Phase:** Assessment (Week 1-2)  
**Date:** 2025-12-01  
**Status:** IN PROGRESS

---

## 1. Data Sources Audit (Complete Inventory)

### 1.1 Primary Database (PostgreSQL)

**Connection Details:**
- **Provider:** Render-managed PostgreSQL (infinity-gauntlet-db)
- **URL:** `PROD_DATABASE_URL` (unified architecture)
- **Schema Lines:** 590 (Prisma)
- **Tables:** 20+ entities
- **Current Size:** Unknown (requires query)
- **Health:** ✅ EXCELLENT (well-designed schema)

**Schema Analysis:**

```
Core Entity Hierarchy:
┌─────────────────────────────────────────────────────┐
│                    Tenant (Multi-tenant root)        │
└──────────────┬──────────────────────────────────────┘
               │
               ├─→ Trainer (User profiles)
               │   ├─→ PokemonInstance (Individual Pokemon)
               │   │   └─→ Party (Active team)
               │   ├─→ Encounter (Wild Pokemon spawns)
               │   ├─→ Battle (PvP/PvE battles)
               │   └─→ Inventory (Items/TMs)
               │
               ├─→ AuditLog (Change tracking)
               └─→ Various lookup tables
                   ├─→ Species (Pokemon data)
                   ├─→ Move (Attack data)
                   ├─→ Ability (Special abilities)
                   ├─→ Type (Fire, Water, etc.)
                   └─→ Item (Pokeballs, potions)
```

**Strengths:**
- ✅ Proper normalization (3NF)
- ✅ Foreign key constraints enforced
- ✅ Tenant isolation ready
- ✅ Audit logging infrastructure exists
- ✅ Indexed for gameplay queries

**Gaps for Analytics:**
- ❌ No time-series optimization (no hypertables)
- ❌ No log storage tables
- ❌ No event correlation tracking
- ❌ No aggregated metrics tables
- ❌ No retention policies

---

### 1.2 File-Based Storage (`/Store/` - 83 MB Used)

#### **Logs Directory** (`/Store/logs/`)
```
logs/
├── hourly/*.jsonl      (Structured logs, JSON Lines format)
├── daily/*.jsonl       (Consolidated daily logs)
├── emergency/*.jsonl   (Critical error logs)
└── insights/*.jsonl    (Analytics snapshots)
```

**Volume Analysis:**
- **Estimated Size:** <10 MB (based on 83 MB total - 75 MB heap - 8.2 MB security)
- **Daily Growth:** ~1-2 MB/day
- **Format:** JSON Lines (one JSON object per line)
- **Retention:** 7 days (automatic rotation)

**Sample Log Entry:**
```json
{
  "timestamp": "2025-12-01T22:27:02.502Z",
  "level": "info",
  "category": "system",
  "message": "Service initialized",
  "data": {
    "service": "event-bus",
    "subscriptions": 5,
    "buffer_size": 100
  }
}
```

**Migration Priority:** 🔴 HIGH (primary analytics source)

---

#### **Security Bot State** (`/Store/security-bot-state/`)
```
security-bot-state/
├── current.json        (Active runtime state)
├── previous.json       (Backup from last restart)
├── baselines.json      (Security baselines)
└── snapshots/*.json    (Hourly backups, 7-day retention)
    └── role-archive/   (Role change history)
```

**Volume:** 8.2 MB  
**Contents:**
- Role assignment sweeps
- Permission changes
- Security alerts
- Member statistics
- Threat detection data

**Migration Priority:** 🟡 MEDIUM (security analytics source)

---

#### **Engine Write DB** (`/Store/engine-write.db`)
- **Type:** SQLite database
- **Size:** 56 KB
- **Purpose:** Battle logs, move usage, anomalies
- **Schema:**
  - `battle_logs` - Battle outcomes
  - `move_usage` - Move effectiveness tracking
  - `anomalies` - Data quality issues
  - `write_ahead_log` - Crash recovery

**Migration Priority:** 🟢 LOW (already structured, small volume)

---

#### **Discord Cache** (`/Store/discord-cache/`)
- **Type:** JSON files
- **Size:** <1 MB
- **Purpose:** Guild/role/member caching
- **Retention:** 1 hour TTL

**Migration Priority:** ⚪ NONE (ephemeral cache, not analytics data)

---

#### **Heap Snapshots** (`/Store/*.heapsnapshot`)
- **Type:** V8 heap dumps
- **Size:** 75 MB (3 files @ 25 MB each)
- **Purpose:** Memory profiling
- **Created:** 2025-11-18

**Migration Priority:** ⚪ NONE (not logs, profiling artifacts)

---

### 1.3 In-Memory Systems

#### **Event Bus** (`src/shared/event-bus.ts`)
- **Type:** In-memory pub-sub system
- **Buffer:** 100 most recent events (FIFO)
- **Pattern Matching:** Wildcard support (`battle.*`, `error.**`)
- **Correlation:** UUID-based tracing
- **Persistence:** ❌ NONE (lost on restart)

**Current Subscriptions:**
```typescript
// Active patterns from codebase grep:
- 'log.**'           // All log events
- 'alert.*'          // All alert events  
- 'security.**'      // Security events
- 'error.critical'   // Critical errors
- 'battle.started'   // Battle events
```

**Migration Priority:** 🔴 HIGH (enable event replay/analytics)

---

#### **Error Tracker** (`src/services/error-tracker.ts`)
- **Type:** In-memory queue
- **Buffer Size:** Bounded (configurable)
- **Flush:** Periodic to Event Bus
- **Persistence:** Temporary (until flush)

**Migration Priority:** 🟡 MEDIUM (via Event Bus integration)

---

## 2. Unified Schema Design

### 2.1 New Tables (TimescaleDB Hypertables)

#### **Table: log_entries**
```sql
CREATE TABLE log_entries (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL,
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT,
  metadata JSONB,
  correlation_id UUID,
  service_name TEXT,
  user_id TEXT,
  trace_context TEXT,
  PRIMARY KEY (id, timestamp)
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('log_entries', 'timestamp');

-- Indexes for common queries
CREATE INDEX idx_log_level ON log_entries (level, timestamp DESC);
CREATE INDEX idx_log_category ON log_entries (category, timestamp DESC);
CREATE INDEX idx_log_correlation ON log_entries (correlation_id);
CREATE INDEX idx_log_user ON log_entries (user_id, timestamp DESC);

-- GIN index for JSONB metadata queries
CREATE INDEX idx_log_metadata ON log_entries USING GIN (metadata);

-- Automatic retention (30 days)
SELECT add_retention_policy('log_entries', INTERVAL '30 days');
```

**Estimated Storage:**
- 1000 logs/day × 1 KB avg = 1 MB/day
- 30 days retention = 30 MB
- With indexes: ~60 MB

---

#### **Table: event_history**
```sql
CREATE TABLE event_history (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  correlation_id UUID NOT NULL,
  parent_correlation_id UUID,
  emitter TEXT,
  PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable
SELECT create_hypertable('event_history', 'timestamp');

-- Indexes
CREATE INDEX idx_event_topic ON event_history (topic, timestamp DESC);
CREATE INDEX idx_event_correlation ON event_history (correlation_id);
CREATE INDEX idx_event_parent ON event_history (parent_correlation_id);
CREATE INDEX idx_event_emitter ON event_history (emitter, timestamp DESC);

-- GIN index for payload queries
CREATE INDEX idx_event_payload ON event_history USING GIN (payload);

-- Automatic retention (90 days for debugging)
SELECT add_retention_policy('event_history', INTERVAL '90 days');
```

**Estimated Storage:**
- 500 events/day × 2 KB avg = 1 MB/day
- 90 days retention = 90 MB
- With indexes: ~180 MB

---

#### **Table: security_events**
```sql
CREATE TABLE security_events (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  guild_id TEXT,
  user_id TEXT,
  role_id TEXT,
  metadata JSONB,
  correlation_id UUID,
  PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('security_events', 'timestamp');

-- Indexes
CREATE INDEX idx_security_severity ON security_events (severity, timestamp DESC);
CREATE INDEX idx_security_type ON security_events (event_type, timestamp DESC);
CREATE INDEX idx_security_guild ON security_events (guild_id, timestamp DESC);
CREATE INDEX idx_security_user ON security_events (user_id, timestamp DESC);

-- Infinite retention (compliance requirement)
-- No retention policy - keep forever
```

**Estimated Storage:**
- 100 events/day × 1 KB avg = 100 KB/day
- No retention limit = grows indefinitely
- 1 year = ~36 MB

---

#### **Table: battle_analytics**
```sql
CREATE TABLE battle_analytics (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL,
  battle_id TEXT NOT NULL,
  trainer1_id TEXT NOT NULL,
  trainer2_id TEXT NOT NULL,
  winner_id TEXT,
  duration_ms INTEGER NOT NULL,
  turn_count INTEGER NOT NULL,
  pokemon_used JSONB NOT NULL,  -- Array of species IDs
  moves_used JSONB NOT NULL,    -- Move usage stats
  outcome TEXT NOT NULL,
  metadata JSONB,
  PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('battle_analytics', 'timestamp');

-- Indexes for analytics
CREATE INDEX idx_battle_trainer1 ON battle_analytics (trainer1_id, timestamp DESC);
CREATE INDEX idx_battle_trainer2 ON battle_analytics (trainer2_id, timestamp DESC);
CREATE INDEX idx_battle_winner ON battle_analytics (winner_id, timestamp DESC);
CREATE INDEX idx_battle_duration ON battle_analytics (duration_ms);

-- GIN indexes for array queries
CREATE INDEX idx_battle_pokemon ON battle_analytics USING GIN (pokemon_used);
CREATE INDEX idx_battle_moves ON battle_analytics USING GIN (moves_used);

-- Retention: 180 days (6 months of battle history)
SELECT add_retention_policy('battle_analytics', INTERVAL '180 days');
```

**Estimated Storage:**
- 50 battles/day × 2 KB avg = 100 KB/day
- 180 days = 18 MB
- With indexes: ~40 MB

---

### 2.2 Continuous Aggregates (Pre-computed Rollups)

#### **Hourly Log Aggregates**
```sql
CREATE MATERIALIZED VIEW logs_hourly
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 hour', timestamp) AS hour,
  level,
  category,
  service_name,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT correlation_id) as unique_requests
FROM log_entries
GROUP BY hour, level, category, service_name;

-- Refresh policy: every 30 minutes
SELECT add_continuous_aggregate_policy('logs_hourly',
  start_offset => INTERVAL '2 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes');
```

**Benefit:** Instant dashboard queries (pre-aggregated)

---

#### **Daily Battle Statistics**
```sql
CREATE MATERIALIZED VIEW battles_daily
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 day', timestamp) AS day,
  COUNT(*) as total_battles,
  AVG(duration_ms) as avg_duration_ms,
  AVG(turn_count) as avg_turn_count,
  COUNT(DISTINCT trainer1_id) + COUNT(DISTINCT trainer2_id) as unique_trainers,
  jsonb_object_agg(
    winner_id, 
    COUNT(*)
  ) as wins_by_trainer
FROM battle_analytics
GROUP BY day;

SELECT add_continuous_aggregate_policy('battles_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day');
```

---

## 3. Data Flow Architecture

### 3.1 Event Bus → Database Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│                    CURRENT ARCHITECTURE                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Application Code                                            │
│         │                                                     │
│         ├──→ Event Bus (in-memory)                           │
│         │      └──→ Subscribers                              │
│         │             └──→ Console Output ❌                 │
│         │                                                     │
│         └──→ File Logs (/Store/logs/*.jsonl)                │
│                                                               │
│  ❌ No database persistence                                  │
│  ❌ No correlation across restarts                           │
│  ❌ No time-series analytics                                 │
└──────────────────────────────────────────────────────────────┘

                            ⬇️ MIGRATION

┌──────────────────────────────────────────────────────────────┐
│                     TARGET ARCHITECTURE                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Application Code                                            │
│         │                                                     │
│         └──→ Event Bus (in-memory)                           │
│                │                                              │
│                ├──→ Real-time Subscribers                    │
│                │      └──→ Alerts, Monitoring                │
│                │                                              │
│                └──→ Log Ingestion Worker (NEW)               │
│                       │                                       │
│                       ├──→ Batch Buffer (100 events)         │
│                       │                                       │
│                       └──→ PostgreSQL + TimescaleDB          │
│                              ├─→ log_entries (30d)           │
│                              ├─→ event_history (90d)         │
│                              ├─→ security_events (∞)         │
│                              └─→ battle_analytics (180d)     │
│                                                               │
│  ✅ Queryable database                                       │
│  ✅ Correlation tracking                                     │
│  ✅ Time-series analytics                                    │
│  ✅ Automatic retention                                      │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Ingestion Strategy

**Batch Processing:**
- Buffer 100 events OR 5 minutes (whichever first)
- Single transaction insert (atomic)
- Correlation ID linking preserved
- Graceful degradation on DB failure

**Implementation:**
```typescript
// src/workers/log-ingestion-worker.ts
const BATCH_SIZE = 100;
const BATCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const logBuffer: LogEntry[] = [];
const eventBuffer: EventEntry[] = [];

bus.subscribe('log.**', (event) => {
  logBuffer.push(transformToLogEntry(event));
  if (logBuffer.length >= BATCH_SIZE) {
    flushLogsToDatabase();
  }
});

bus.subscribe('**', (event) => {
  eventBuffer.push(transformToEventEntry(event));
  if (eventBuffer.length >= BATCH_SIZE) {
    flushEventsToDatabase();
  }
});

setInterval(flushLogsToDatabase, BATCH_TIMEOUT_MS);
setInterval(flushEventsToDatabase, BATCH_TIMEOUT_MS);
```

---

## 4. Technology Stack Decision

### ✅ RECOMMENDED: TimescaleDB (PostgreSQL Extension)

**Rationale:**
1. **Zero Infrastructure Change:** Extends existing PostgreSQL
2. **Prisma Compatible:** Works with current ORM
3. **Scale Appropriate:** Perfect for 1000-5000 events/day
4. **SQL Familiarity:** Team already knows PostgreSQL
5. **Backup Integration:** Same backup strategy as game data
6. **Cost:** $0 additional (just disk space)

**Installation (Render):**
```sql
-- Run once on production database
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Verify installation
SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb';
```

### ❌ NOT RECOMMENDED: ClickHouse

**Why not:**
- Overkill for current scale (optimized for billions of rows)
- Requires separate infrastructure
- No Prisma support (raw SQL only)
- Additional backup/monitoring needed
- Team learning curve

**When to reconsider:** If log volume exceeds 100k/day

---

## 5. Retention Policy Strategy

| Table | Retention | Rationale | Storage Impact |
|-------|-----------|-----------|----------------|
| `log_entries` | 30 days | Debugging window | 30-60 MB |
| `event_history` | 90 days | Correlation analysis | 90-180 MB |
| `security_events` | Infinite | Compliance/audit | 36 MB/year |
| `battle_analytics` | 180 days | Seasonal trends | 20-40 MB |
| **TOTAL** | Mixed | | 140-316 MB |

**Disk Headroom:** 876 MB available ✅ Plenty of space

---

## 6. Migration Roadmap

### Phase 1: Foundation (Week 3)
- [ ] Install TimescaleDB extension
- [ ] Create `log_entries` hypertable
- [ ] Build simple Event Bus → DB pipeline
- [ ] Test with 1 week historical data

### Phase 2: Expansion (Week 4-5)
- [ ] Add `event_history` table
- [ ] Add `security_events` table  
- [ ] Add `battle_analytics` table
- [ ] Backfill 30 days of historical logs

### Phase 3: Analytics (Week 6)
- [ ] Create continuous aggregates
- [ ] Build Grafana dashboards
- [ ] Deploy query cookbook

### Phase 4: Production (Week 7-8)
- [ ] Deploy ingestion worker to Render
- [ ] Monitor performance
- [ ] Train team
- [ ] Deprecate file-only logging

---

## 7. Risk Assessment

### HIGH RISK ⚠️
- **Data loss during migration** 
  - Mitigation: Full backup + parallel run (files + DB)
- **PostgreSQL disk full**
  - Mitigation: Automated retention + 80% alerts

### MEDIUM RISK ⚠️
- **Ingestion worker crashes**
  - Mitigation: Graceful fallback to files + auto-restart
- **Query performance degradation**
  - Mitigation: Proper indexes + continuous aggregates

### LOW RISK ✅
- **Team unfamiliarity with TimescaleDB**
  - Mitigation: Training + documentation + example queries

---

## 8. Next Steps for Other Specialists

### Database Specialist
- **Task:** Evaluate current schema health
- **Input:** This audit report
- **Output:** Index optimization plan

### Data Analyst  
- **Task:** Define 10 key business metrics
- **Input:** This audit + battle_analytics schema
- **Output:** Dashboard requirements

### Backend Developer
- **Task:** Build POC pipeline
- **Input:** log_entries schema + Event Bus docs
- **Output:** Working ingestion worker

---

## 9. Deliverables Complete ✅

- [x] Comprehensive data source inventory (15 sources)
- [x] Unified schema design (4 new hypertables)
- [x] Data flow architecture diagrams
- [x] Technology stack decision (TimescaleDB)
- [x] Retention policy strategy
- [x] Migration roadmap (4 phases)
- [x] Risk assessment with mitigations

**Status:** Ready for Database Specialist review  
**Next:** Database Specialist validates schema design

---

**Data Architect:** Ready for Phase 1 handoff  
**Confidence Level:** 🟢 HIGH (solid foundation)
