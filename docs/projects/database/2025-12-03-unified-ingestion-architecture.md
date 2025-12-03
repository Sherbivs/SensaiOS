# Unified Log/Metrics/Output Ingestion Architecture

**Generated:** 2025-12-03T06:00:00Z  
**Updated:** 2025-12-03T08:00:00Z  
**Specialist Team:** Database, Performance, Architecture, AI Coding  
**Status:** ✅ IMPLEMENTATION COMPLETE — DB-First Architecture

---

## 🔥 KEY ARCHITECTURE PRINCIPLE: Database-First

**Console output in production is a VIEW of database data, NOT the other way around.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
│                                                                             │
│   Application Code                                                          │
│        │                                                                    │
│        ▼                                                                    │
│   ┌─────────────┐                                                          │
│   │   Logger    │ ─────────────────────────────┐                           │
│   │  (Write)    │                              │                           │
│   └─────────────┘                              │                           │
│                                                ▼                           │
│                                    ┌───────────────────┐                   │
│                                    │     DATABASE      │                   │
│                                    │   (log_entries,   │                   │
│                                    │  worker_metrics,  │                   │
│                                    │  console_outputs) │                   │
│                                    └───────────────────┘                   │
│                                                │                           │
│                                                ▼                           │
│                                    ┌───────────────────┐                   │
│                                    │ Console Renderer  │                   │
│                                    │    (Polls DB)     │                   │
│                                    └───────────────────┘                   │
│                                                │                           │
│                                                ▼                           │
│                                    ┌───────────────────┐                   │
│                                    │  Render Console   │                   │
│                                    │  (stdout/stderr)  │                   │
│                                    └───────────────────┘                   │
│                                                                             │
│   ✅ All console output comes FROM database queries                        │
│   ✅ Database is single source of truth                                    │
│   ✅ Survives restarts, deployments                                        │
│   ✅ Queryable history                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎉 Implementation Summary

**Completed Files:**
| File | Lines | Purpose |
|------|-------|---------|
| `prisma/schema.prisma` | +88 | WorkerMetrics, ConsoleOutput models, LogEntry enhancements |
| `prisma/migrations/20251203060000_unified_ingestion_architecture/migration.sql` | 270 | Schema, indexes, views, functions |
| `src/shared/logger.ts` | Modified | DB-first mode support (writes to DB, no console in prod) |
| `src/shared/console-renderer.ts` | 450 | Polls DB for logs, outputs to Render console |
| `src/shared/metrics-collector.ts` | 265 | Periodic worker health metrics collection |
| `src/shared/log-query-views.ts` | 380 | Pre-built SQL queries for analytics |

**Total Code:** ~1,500+ lines

---

## 🏗️ Architecture Components

### 1. Logger (Write Path) — `src/shared/logger.ts`

**Purpose:** Write structured logs to database. Does NOT output to console in production.

**Modes:**
- **Production (dbFirstMode=true):** Write to DB only, ConsoleRenderer handles display
- **Development (dbFirstMode=false):** Write to DB AND console (immediate feedback)
- **Fallback:** If DB write fails, always output to console (safety)

```typescript
// Usage remains the same
const logger = getLogger();
logger.info('bot', 'initialize', 'Discord connected', { guildCount: 5 });

// Behind the scenes:
// 1. Logger writes to TimescaleDB (log_entries table)
// 2. ConsoleRenderer polls DB every 5s
// 3. Renderer outputs to Render console
```

### 2. Console Renderer (Read Path) — `src/shared/console-renderer.ts`

**Purpose:** Poll database for new entries, format and output to Render console.

**Features:**
- Polls `log_entries` table for new entries (5s default)
- Polls `console_outputs` for captured raw outputs
- Displays worker health summary (1 minute default)
- Formats with emojis, timestamps, context
- Tracks last entry ID to avoid duplicates

```typescript
import { initConsoleRenderer, startConsoleRenderer, stopConsoleRenderer } from './shared/console-renderer.js';

// During startup (after Prisma init):
await initConsoleRenderer(prismaClient, {
  pollIntervalMs: 5000,
  includeDebug: false,
  showWorkerHealth: true,
});
startConsoleRenderer();

// During shutdown:
stopConsoleRenderer();
```

### 3. Database Tables

| Table | Purpose | Retention |
|-------|---------|-----------|
| `log_entries` | All structured logs | 30 days (hypertable) |
| `worker_metrics` | Worker health snapshots | 7 days (hypertable) |
| `console_outputs` | Raw console captures | 7 days (hypertable) |

### 4. Integration Flow

```
Startup Sequence:
1. Initialize Prisma client
2. Initialize TimescaleDB worker
3. Initialize Logger (auto-sets dbFirstMode in production)
4. Initialize ConsoleRenderer with Prisma client
5. Start ConsoleRenderer polling loop
6. Application runs (all logs → DB → ConsoleRenderer → Render Console)

Shutdown Sequence:
1. Stop ConsoleRenderer
2. Flush remaining logs
3. Close Prisma client
```

---

## 🎯 Problem Statement

**Current State (Fragmented):**
```
Application Code
       │
       ├─► console.log() ────────────────► Render logs (ephemeral, 7-day retention)
       ├─► intelligent-logger.ts ────────► File buffer (7MB, lost on deploy)
       ├─► logger.js ────────────────────► Console only (ephemeral)
       ├─► EventBus.emit() ──────────────► Memory only (lost on restart)
       ├─► getStats() ───────────────────► Console only (ephemeral)
       └─► error-tracker.ts ─────────────► ErrorLog table ✅
```

**Problems:**
1. **50+ console.log calls** scattered across codebase → ephemeral, not queryable
2. **Metrics/stats** only shown in console → lost after restart
3. **No correlation** between events, logs, and metrics
4. **Duplicate logging systems** (intelligent-logger, logger.js, logger.ts)
5. **No query API** for historical log analysis

---

## ✅ Target State (Unified)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION CODE                                  │
│ (bot, battle, encounter, workers, services)                                │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED LOGGER (src/shared/logger.ts)                    │
│                                                                             │
│  logger.info('bot', 'initialize', 'Discord connected', { guildCount: 5 })  │
│  logger.error('database', 'query', 'Connection failed', { error })         │
│  logger.metric('worker', 'flush', 'Buffer flushed', { count: 100 })        │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  TimescaleDB     │  │  Console Output  │  │  Event Bus       │
│  Worker (ASYNC)  │  │  (SYNC fallback) │  │  (Real-time)     │
│                  │  │                  │  │                  │
│  Batch: 100/5min │  │  Production: OFF │  │  Subscribers:    │
│  Buffer: 10k max │  │  Dev: ON         │  │  - /ops commands │
│  Backpressure    │  │                  │  │  - Alerts        │
└────────┬─────────┘  └──────────────────┘  └──────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATABASE LAYER                                      │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  log_entries    │  │  worker_metrics │  │  error_log      │             │
│  │  (TimescaleDB)  │  │  (TimescaleDB)  │  │  (Prisma)       │             │
│  │                 │  │                 │  │                 │             │
│  │  - All logs     │  │  - Worker stats │  │  - Aggregated   │             │
│  │  - Correlation  │  │  - Performance  │  │  - Fingerprint  │             │
│  │  - Component    │  │  - Throughput   │  │  - Learning     │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  audit_log      │  │  battle_analytics│ │  security_events│             │
│  │  (Prisma)       │  │  (TimescaleDB)  │  │  (TimescaleDB)  │             │
│  │                 │  │                 │  │                 │             │
│  │  - Entity CRUD  │  │  - Battle stats │  │  - Permissions  │             │
│  │  - User actions │  │  - Move usage   │  │  - Sweeps       │             │
│  │  - Compliance   │  │  - Win rates    │  │  - Alerts       │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OUTPUT LAYER                                       │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Console Views  │  │  /ops Commands  │  │  Grafana        │             │
│  │                 │  │                 │  │  Dashboards     │             │
│  │  - Real-time    │  │  - /ops logs    │  │                 │             │
│  │  - Formatted    │  │  - /ops errors  │  │  - Metrics      │             │
│  │  - Filtered     │  │  - /ops metrics │  │  - Alerts       │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Specialist: Data Flow Definitions

### 1. Log Entry Schema (log_entries hypertable)

**Already Exists** — Enhance with `component` column:

```sql
-- Migration: Add component column for better filtering
ALTER TABLE log_entries ADD COLUMN IF NOT EXISTS component TEXT;

-- Index for component-based queries
CREATE INDEX IF NOT EXISTS idx_log_entries_component_time 
  ON log_entries(component, timestamp DESC) 
  WHERE component IS NOT NULL;

-- Index for level + component combination
CREATE INDEX IF NOT EXISTS idx_log_entries_level_component 
  ON log_entries(level, component, timestamp DESC);
```

### 2. Worker Metrics Schema (NEW TABLE)

```sql
-- Create worker_metrics hypertable for performance tracking
CREATE TABLE IF NOT EXISTS worker_metrics (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Worker identification
  worker_id TEXT NOT NULL,       -- 'timescaledb', 'prod-postgres', 'engine-read', 'engine-write'
  worker_name TEXT NOT NULL,     -- Human-readable name
  
  -- Performance metrics
  operation_count BIGINT DEFAULT 0,
  success_count BIGINT DEFAULT 0,
  failure_count BIGINT DEFAULT 0,
  avg_latency_ms DOUBLE PRECISION,
  peak_latency_ms DOUBLE PRECISION,
  throughput DOUBLE PRECISION,   -- ops/sec
  
  -- Buffer metrics (for buffered workers)
  buffer_size INTEGER,
  buffer_utilization_pct DOUBLE PRECISION,
  flush_count INTEGER,
  backpressure_events INTEGER,
  
  -- Resource metrics
  memory_used_bytes BIGINT,
  cpu_percent DOUBLE PRECISION,
  
  -- Health status
  health_status TEXT CHECK (health_status IN ('healthy', 'degraded', 'unhealthy')),
  last_error TEXT,
  
  PRIMARY KEY (id, timestamp)
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('worker_metrics', 'timestamp', 
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Indexes for common queries
CREATE INDEX idx_worker_metrics_worker_time ON worker_metrics(worker_id, timestamp DESC);
CREATE INDEX idx_worker_metrics_health ON worker_metrics(health_status, timestamp DESC)
  WHERE health_status != 'healthy';
```

### 3. Console Output Schema (NEW TABLE)

```sql
-- Create console_outputs table for formatted console logs
CREATE TABLE IF NOT EXISTS console_outputs (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Output identification
  service_name TEXT NOT NULL,    -- 'infinity-gauntlet', 'security-bot', etc.
  output_type TEXT NOT NULL,     -- 'telemetry', 'stats', 'section', 'banner'
  
  -- Content
  raw_output TEXT NOT NULL,      -- Original console output string
  parsed_data JSONB,             -- Structured extraction from output
  
  -- Metadata
  correlation_id UUID,
  session_id TEXT,               -- Render session/deploy ID
  
  PRIMARY KEY (id, timestamp)
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('console_outputs', 'timestamp',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Indexes
CREATE INDEX idx_console_outputs_service ON console_outputs(service_name, timestamp DESC);
CREATE INDEX idx_console_outputs_type ON console_outputs(output_type, timestamp DESC);
CREATE INDEX idx_console_outputs_parsed ON console_outputs USING GIN (parsed_data);
```

### 4. Data Type Mapping

| Source | Target Table | Parsing Strategy |
|--------|--------------|------------------|
| `logger.info/warn/error/debug()` | `log_entries` | Direct structured insert |
| `console.log('[Component]...')` | `console_outputs` + `log_entries` | Regex parse + structured copy |
| `getStats()` returns | `worker_metrics` | Object → row transform |
| `WorkerHealth` checks | `worker_metrics` | Health status snapshots |
| `EventBus.emit()` events | `log_entries` | Event → log transform |
| File logs (`Store/logs/*`) | `log_entries` | JSON Lines parse |
| Error reports | `error_log` | Fingerprint dedup |

---

## ⚡ Performance Specialist: Ingestion Pipeline Design

### Buffering Strategy

```typescript
/**
 * Ingestion Pipeline Configuration
 */
export const INGESTION_CONFIG = {
  // Log entries buffer
  logs: {
    batchSize: 100,              // Entries per batch
    flushIntervalMs: 5000,       // 5 seconds max wait
    maxBufferSize: 10000,        // Hard limit
    backpressureWarn: 0.75,      // 75% → warn
    backpressureCritical: 0.95,  // 95% → reject new entries
  },
  
  // Worker metrics buffer (less frequent)
  metrics: {
    batchSize: 50,
    flushIntervalMs: 15000,      // 15 seconds
    maxBufferSize: 1000,
  },
  
  // Console outputs buffer
  console: {
    batchSize: 200,
    flushIntervalMs: 10000,      // 10 seconds
    maxBufferSize: 5000,
  },
};
```

### Write Path Optimization

```
┌─────────────────────────────────────────────────────────────────┐
│                    INGESTION PIPELINE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐ │
│   │  PARSE   │───►│  BUFFER  │───►│  BATCH   │───►│  WRITE  │ │
│   │          │    │          │    │          │    │         │ │
│   │ Validate │    │ Circular │    │ Trigger: │    │ Batch   │ │
│   │ Transform│    │ Queue    │    │ Size OR  │    │ Insert  │ │
│   │ Enrich   │    │ 10k max  │    │ Time     │    │ Prisma  │ │
│   └──────────┘    └──────────┘    └──────────┘    └─────────┘ │
│                                                                 │
│   Latency: <1μs   Latency: <1μs   Latency: async   <200ms     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Throughput Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Log ingestion | 1000 logs/sec | Batched, non-blocking |
| Metric snapshots | 10/sec | 15s intervals per worker |
| Console capture | 100 lines/sec | Parsed on main thread |
| Query latency (recent) | <50ms | Last 1 hour |
| Query latency (historical) | <200ms | Last 30 days |

---

## 🏗 Architecture Specialist: Integration Points

### 1. Application → Logger Migration

**Before (scattered console.log):**
```typescript
// worker-manager.ts
console.log('[WorkerManager] [1/4] Initializing PROD PostgreSQL Worker...');
```

**After (unified logger):**
```typescript
import { getLogger } from '../shared/logger.js';
const logger = getLogger();

logger.info('worker', 'initialize', 'Initializing PROD PostgreSQL Worker', {
  metadata: { step: '1/4', workerId: 'prod-postgres' }
});
```

### 2. Console Output Capture

**New Console Interceptor:**
```typescript
// src/shared/console-interceptor.ts

import { getTimescaleDBWorker } from '../workers/database/index.js';

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

/**
 * Intercept console.* calls and forward to database
 */
export function installConsoleInterceptor(serviceName: string): void {
  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    captureConsoleOutput('log', serviceName, args);
  };
  
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    captureConsoleOutput('warn', serviceName, args);
  };
  
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    captureConsoleOutput('error', serviceName, args);
  };
}

async function captureConsoleOutput(
  level: 'log' | 'warn' | 'error',
  serviceName: string,
  args: unknown[]
): Promise<void> {
  const rawOutput = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  
  const parsed = parseConsoleOutput(rawOutput);
  
  const worker = getTimescaleDBWorker();
  await worker.insert('consoleOutput', {
    serviceName,
    outputType: parsed.type,
    rawOutput,
    parsedData: parsed.data,
  });
}

function parseConsoleOutput(raw: string): { type: string; data: Record<string, unknown> } {
  // Pattern: [Component] [Step] Message
  const componentMatch = raw.match(/^\[([^\]]+)\]/);
  const stepMatch = raw.match(/\[(\d+\/\d+)\]/);
  const emojiMatch = raw.match(/^([✅❌⚠️🔄📦])/);
  
  return {
    type: emojiMatch ? 'status' : componentMatch ? 'component' : 'generic',
    data: {
      component: componentMatch?.[1] || null,
      step: stepMatch?.[1] || null,
      hasEmoji: !!emojiMatch,
      emoji: emojiMatch?.[1] || null,
    },
  };
}
```

### 3. Worker Metrics Collection

**New Metrics Collector:**
```typescript
// src/shared/metrics-collector.ts

import { getWorkerManager } from '../workers/worker-manager.js';
import { getTimescaleDBWorker } from '../workers/database/index.js';

const METRICS_INTERVAL_MS = 15000; // 15 seconds

let metricsTimer: NodeJS.Timeout | null = null;

/**
 * Start collecting worker metrics to database
 */
export function startMetricsCollection(): void {
  metricsTimer = setInterval(collectAndStoreMetrics, METRICS_INTERVAL_MS);
  console.log('[MetricsCollector] Started (interval: 15s)');
}

export function stopMetricsCollection(): void {
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }
}

async function collectAndStoreMetrics(): Promise<void> {
  const manager = getWorkerManager();
  const workers = manager.getWorkers();
  const tsWorker = getTimescaleDBWorker();
  
  for (const [workerId, worker] of Object.entries(workers)) {
    if (!worker) continue;
    
    try {
      const health = await worker.healthCheck();
      const bufferStats = 'getBufferStats' in worker ? worker.getBufferStats() : null;
      
      await tsWorker.insert('workerMetrics', {
        workerId,
        workerName: worker.name,
        operationCount: health.details.operationCount || 0,
        successCount: health.details.successCount || 0,
        failureCount: health.errorCount,
        avgLatencyMs: health.latencyMs,
        peakLatencyMs: health.details.peakLatencyMs || null,
        throughput: health.details.throughput || null,
        bufferSize: bufferStats?.entryCount || null,
        bufferUtilizationPct: bufferStats?.utilizationPercent || null,
        flushCount: bufferStats?.flushCount || null,
        backpressureEvents: bufferStats?.backpressureEventCount || null,
        healthStatus: health.status,
        lastError: health.lastError,
      });
    } catch (error) {
      console.error(`[MetricsCollector] Failed to collect metrics for ${workerId}:`, error);
    }
  }
}
```

### 4. Event Bus → Logger Integration

**Event Bus Subscriber:**
```typescript
// src/shared/event-bus-logger.ts

import { EventBus } from './event-bus.js';
import { getLogger } from './logger.js';

const logger = getLogger();

/**
 * Subscribe to Event Bus events and log them to database
 */
export function installEventBusLogger(): string {
  const bus = EventBus.getInstance();
  
  return bus.subscribe('**', (event) => {
    const level = extractLevel(event.topic);
    const component = extractComponent(event.topic);
    
    logger[level](component, 'event', event.topic, {
      correlationId: event.correlationId,
      metadata: event.payload as Record<string, unknown>,
    });
  }, {
    priority: -100, // Lowest priority (logging shouldn't block)
    async: true,
  });
}

function extractLevel(topic: string): 'error' | 'warn' | 'info' | 'debug' {
  if (topic.includes('error') || topic.includes('fatal')) return 'error';
  if (topic.includes('warn')) return 'warn';
  if (topic.includes('debug')) return 'debug';
  return 'info';
}

function extractComponent(topic: string): string {
  return topic.split('.')[0] || 'system';
}
```

---

## 💾 Database Specialist: Query Views

### 1. Recent Logs View

```sql
-- View: recent_logs (last 24 hours, optimized for console display)
CREATE OR REPLACE VIEW v_recent_logs AS
SELECT 
  timestamp,
  level,
  component,
  operation,
  message,
  "userId",
  "correlationId",
  "durationMs"
FROM log_entries
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- Function: Get recent logs with filtering
CREATE OR REPLACE FUNCTION get_recent_logs(
  p_level TEXT DEFAULT NULL,
  p_component TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  timestamp TIMESTAMPTZ,
  level TEXT,
  component TEXT,
  operation TEXT,
  message TEXT,
  correlation_id UUID,
  duration_ms INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    le.timestamp,
    le.level,
    le.category AS component,
    (le.metadata->>'operation')::TEXT AS operation,
    le.message,
    le."correlationId",
    (le.metadata->>'durationMs')::INTEGER AS duration_ms
  FROM log_entries le
  WHERE 
    (p_level IS NULL OR le.level = p_level)
    AND (p_component IS NULL OR le.category = p_component)
    AND le.timestamp > NOW() - INTERVAL '24 hours'
  ORDER BY le.timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

### 2. Worker Health Dashboard

```sql
-- View: worker_health_summary
CREATE OR REPLACE VIEW v_worker_health AS
SELECT 
  worker_id,
  worker_name,
  health_status,
  avg_latency_ms,
  (success_count::FLOAT / NULLIF(operation_count, 0) * 100)::NUMERIC(5,2) AS success_rate,
  buffer_utilization_pct,
  timestamp AS last_report
FROM worker_metrics
WHERE timestamp = (
  SELECT MAX(timestamp) FROM worker_metrics wm2 WHERE wm2.worker_id = worker_metrics.worker_id
);

-- Function: Get worker metrics history
CREATE OR REPLACE FUNCTION get_worker_metrics_history(
  p_worker_id TEXT,
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  time_bucket TIMESTAMPTZ,
  avg_latency DOUBLE PRECISION,
  total_operations BIGINT,
  error_rate DOUBLE PRECISION,
  avg_buffer_util DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    time_bucket('1 hour', timestamp) AS time_bucket,
    AVG(avg_latency_ms) AS avg_latency,
    SUM(operation_count) AS total_operations,
    (SUM(failure_count)::FLOAT / NULLIF(SUM(operation_count), 0)) AS error_rate,
    AVG(buffer_utilization_pct) AS avg_buffer_util
  FROM worker_metrics
  WHERE 
    worker_id = p_worker_id
    AND timestamp > NOW() - (p_hours || ' hours')::INTERVAL
  GROUP BY time_bucket('1 hour', timestamp)
  ORDER BY time_bucket DESC;
END;
$$ LANGUAGE plpgsql;
```

### 3. Error Analysis View

```sql
-- View: error_summary (aggregated errors)
CREATE OR REPLACE VIEW v_error_summary AS
SELECT 
  category,
  severity,
  "errorName",
  "errorMessage",
  "occurrenceCount",
  "firstSeen",
  "lastSeen",
  CASE 
    WHEN "lastSeen" > NOW() - INTERVAL '1 hour' THEN 'active'
    WHEN "lastSeen" > NOW() - INTERVAL '24 hours' THEN 'recent'
    ELSE 'historical'
  END AS status
FROM "ErrorLog"
ORDER BY "lastSeen" DESC;

-- Function: Get errors by severity
CREATE OR REPLACE FUNCTION get_errors_by_severity(
  p_severity TEXT DEFAULT 'error',
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  fingerprint TEXT,
  category TEXT,
  error_name TEXT,
  error_message TEXT,
  occurrence_count INTEGER,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    el.fingerprint,
    el.category,
    el."errorName",
    el."errorMessage",
    el."occurrenceCount",
    el."firstSeen",
    el."lastSeen"
  FROM "ErrorLog" el
  WHERE 
    el.severity = p_severity
    AND el."lastSeen" > NOW() - (p_hours || ' hours')::INTERVAL
  ORDER BY el."occurrenceCount" DESC, el."lastSeen" DESC;
END;
$$ LANGUAGE plpgsql;
```

---

## 🔧 AI Coding Specialist: Implementation Plan

### Phase 1: Database Schema (Day 1)

1. Create Prisma migration for:
   - Add `component` column to `log_entries`
   - Create `worker_metrics` hypertable
   - Create `console_outputs` table
   - Create query functions and views

```bash
# Migration command
npx prisma migrate dev --name add_ingestion_tables
```

### Phase 2: Logger Enhancement (Day 2)

1. Update `src/shared/logger.ts`:
   - Add `component` field to LogEntry
   - Add `metric()` method for metrics logging
   - Ensure all logs include correlation IDs

2. Create `src/shared/console-interceptor.ts`:
   - Intercept console.* calls
   - Parse and store structured data
   - Non-blocking async writes

### Phase 3: Metrics Collection (Day 3)

1. Create `src/shared/metrics-collector.ts`:
   - Periodic worker health snapshots
   - Buffer stats collection
   - Performance metric aggregation

2. Integrate with WorkerManager:
   - Start collection after workers initialize
   - Stop collection before workers shutdown

### Phase 4: Console Migration (Days 4-5)

1. Replace console.log calls with logger calls:
   - `worker-manager.ts` (20 calls)
   - `log-ingestion-worker.ts` (10 calls)
   - Other workers and services

2. Install console interceptor:
   - Add to `src/index.ts` startup
   - Configure per-service settings

### Phase 5: Query Integration (Day 6)

1. Add `/ops` commands:
   - `/ops logs` — Query recent logs
   - `/ops metrics` — Worker health dashboard
   - `/ops errors` — Error analysis

2. Create console output formatter:
   - Query database for recent logs
   - Format for terminal display
   - Support filtering and pagination

---

## 📋 Migration Checklist

### Pre-Migration
- [ ] Backup current database
- [ ] Document current console.log patterns
- [ ] Test migration on ONPREMISE-DEV-EXPERIMENT

### Migration Steps
- [ ] Apply database migration
- [ ] Deploy logger.ts enhancements
- [ ] Deploy console interceptor
- [ ] Deploy metrics collector
- [ ] Update worker-manager.ts logging
- [ ] Update other console.log calls
- [ ] Verify data flowing to tables

### Post-Migration
- [ ] Verify query views working
- [ ] Test /ops commands
- [ ] Monitor storage growth
- [ ] Configure retention policies
- [ ] Remove deprecated logger files

---

## 📊 Success Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Log ingestion rate | 1000/sec | Load test |
| Query latency (recent) | <50ms | Benchmark |
| Console.log migration | 100% | grep -r "console.log" |
| Metrics coverage | All 4 workers | /ops metrics |
| Error correlation | 100% | Trace queries |
| Storage growth | <1MB/hour | Monitoring |

---

## 🚨 Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Database write failures | Lost logs | Console fallback, retry buffer |
| High memory usage | OOM | Backpressure, buffer limits |
| Query performance | Slow /ops | Indexes, time bounds |
| Migration data loss | Lost history | Pre-migration backup |
| Circular dependencies | Import errors | Lazy loading, proper module order |

---

## Specialist Sign-Offs

| Specialist | Status | Notes |
|------------|--------|-------|
| **Database Specialist** | ✅ Complete | Schema design, indexes, views |
| **Performance Specialist** | ✅ Complete | Buffering strategy, throughput targets |
| **Architecture Specialist** | ✅ Complete | Integration points, data flow |
| **AI Coding Specialist** | ✅ Complete | Implementation plan, migration steps |

---

**Document Version:** 1.0  
**Next Action:** Create Prisma migration for Phase 1

