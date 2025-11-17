# ARCHITECTURE BIBLE
**Centralized System Architecture Documentation** | **Created: 2025-11-16** | **Status: TEMPLATE (Phase 1 Week 3)**

## Purpose
Single source of truth for Infinity Gauntlet architectural design, component relationships, safety guarantees, and technical decisions. Consolidates 37 source documents into unified reference.

---

## Table of Contents

### 1. System Overview
- High-level architecture snapshot
- Technology stack
- Service topology
- Design principles

### 2. Database Architecture
- **2.1 Overview** — Database system design
- **2.2 Replication** — Master-replica cascade (Phase 16)
- **2.3 URL Selection** — Connection string logic (CRITICAL)
- **2.4 Multi-Client Runtime** — `prisma`, `onPremiseDevPrisma`, `experimentPrisma`

### 3. Worker Architecture
- **3.1 Core Design** — Worker topology, scaling roadmap
- **3.2 State Visibility** — Cross-worker state management

### 4. Event Bus
- Pub-sub event system (Phase 2.4)
- Correlation tracking
- Backpressure management

### 5. Logging Architecture
- **5.1 Core Design** — Intelligent logging system
- **5.2 Buffer Design** — Log buffering strategy
- **5.3 AI Integration** — AI-readable logs
- **5.4 Scaling** — Log scaling techniques

### 6. Error System
- **6.1 Detection Architecture** — Error detection design
- **6.2 Guarantees** — Error detection guarantees
- **6.3 Tracker Integration** — ErrorTracker integration
- **6.4 Logger Integration** — Logger-error bridge
- **6.5 Logging Integration** — Error-logging pipeline

### 7. Security Bot
- **7.1 State Persistence** — 7-day state history, restart continuity
- **7.2 Restart DMs** — Restart notification format

### 8. Router System
- Meta-router design
- Router-of-routers architecture
- Routing discipline

### 9. Game Engine
- **9.1 PBSL Manifesto** — Deterministic battle system
- **9.2 Battle DM Flow** — Battle interaction patterns
- **9.3 Cache Safety** — Engine cache guarantees
- **9.4 DB Replication** — Engine DB architecture (Phases 17-22)
- **9.5 DB Persistence Roadmap** — sql.js → better-sqlite3 migration
- **9.6 Event Tracking** — Event schema design
- **9.7 Dex V2** — Dexpack v2 architecture

### 10. Discord Bot
- **10.1 Command Suite** — Discord command overview
- **10.2 AI DM Commands** — AI DM guidance
- **10.3 Admin Command Spec** — Admin command specification
- **10.4 Admin Docs Index** — Admin documentation navigation

### 11. Safety Guarantees
- Memory safety
- Error isolation
- State persistence
- Disaster recovery

### 12. Observability
- **12.1 Metrics** — Metrics transparency design
- **12.2 Calculation Methods** — Metrics calculation

### 13. Performance
- **13.1 Optimization Roadmap** — System-wide optimization plan
- **13.2 Centralization** — Centralized architecture analysis

### 14. Future Roadmap
- System evolution vision
- Planned improvements
- Research areas

---

## Navigation

### Referenced By
*(To be populated during Phase 1 consolidation)*

### Cross-References
- **OPERATIONS-BIBLE.md** § Database Operations — Operational procedures
- **DEVELOPMENT-BIBLE.md** § Local Setup — Development environment
- **Agents.md** — Operations guide
- **README.md** — Getting started

---

## Section 1: System Overview

*(Content to be consolidated from `architecture/architecture.md` in Phase 1 Week 3)*

**Placeholder**: High-level architecture snapshot, technology stack, service topology, design principles.

---

## Section 2: Database Architecture

### 2.1 Overview

*(Content to be consolidated from `database/database-systems.md` in Phase 1 Week 3)*

**Placeholder**: Database system design, schema architecture, migration strategy.

### 2.2 Replication

*(Content to be consolidated from `database/db-replication-architecture.md` in Phase 1 Week 3)*

**Placeholder**: Master-replica cascade (PROD → DEV → Local), version tracking, sync orchestration.

### 2.3 URL Selection

**See**: OPERATIONS-BIBLE.md § Database Operations → URL Selection (CRITICAL operational procedures)

### 2.4 Multi-Client Runtime

**See**: OPERATIONS-BIBLE.md § Database Operations → Connections (runtime client configuration)

---

## Section 3: Worker Architecture

### 3.1 Core Design

*(Content to be consolidated from `deployment/workers.md` in Phase 1 Week 3)*

**Placeholder**: Worker topology, Render service matrix, Phase 10+ scaling roadmap, cost optimization.

### 3.2 State Visibility

*(Content to be consolidated from `architecture/cross-worker-state-visibility.md` in Phase 1 Week 3)*

**Placeholder**: Cross-worker state management, shared cache, coordination patterns.

---

## Section 4: Event Bus

*(Content to be consolidated from `architecture/phase2-event-bus-design.md` in Phase 1 Week 3)*

**Placeholder**: Pub-sub event system (Phase 2.4), correlation tracking, pattern matching, backpressure management.

---

## Section 5: Logging Architecture

**Philosophy**: "Logs are not just debugging tools—they are the system's memory, the AI's training data, and the foundation for continuous improvement."

**Purpose**: Comprehensive, AI-optimized logging system with SSH accessibility, intelligent memory management, and automated insight generation.

### 5.1 Core Design

**Intelligent Logging System** — AI-optimized architecture serving as the cognitive memory of the infrastructure.

**Key Objectives**:
1. **AI Continuity** — Enable AI agents to reconstruct context, learn from history, make informed decisions
2. **SSH Accessibility** — Full CLI access for querying, filtering, analyzing logs via SSH
3. **Intelligent Caching** — 7MB circular buffer with priority-based retention and compression
4. **Pattern Detection** — Automated anomaly detection, error correlation, optimization opportunities
5. **Zero Overhead** — Non-blocking, async-first design with <5ms latency impact

**High-Level Flow**:

```
Application Layer → Intelligent Logger API → [Immediate Output | Intelligent Cache] → [Persistence | AI Analysis] → SSH CLI Access
```

**Core Log Entry Schema**:

```typescript
interface LogEntry {
  // Identity
  id: string;                    // UUID v4
  timestamp: string;             // ISO 8601 with milliseconds
  
  // Categorization
  level: LogLevel;               // trace | debug | info | warn | error | fatal
  category: LogCategory;         // AUTO-DETECTED or manual
  subcategory?: string;
  
  // Content
  message: string;
  data?: Record<string, any>;
  
  // Context (Auto-enriched)
  context: {
    service: string;
    process: { pid, uptime, memory };
    user?: { id, username };
    guild?: { id, name };
    operation?: { name, duration, success, retryCount };
    error?: { name, message, stack, fingerprint, cause };
  };
  
  // AI Metadata
  ai: {
    importance: number;          // 0-100 (retention priority)
    tags: string[];
    pattern?: string;
    anomaly?: boolean;
    actionable?: boolean;
  };
}
```

**Log Levels (RFC 5424 Compliance)**:
- **trace** (0) — Function entry/exit, loop iterations
- **debug** (1) — Development debugging, verbose state
- **info** (2) — Normal operations, milestones
- **warn** (3) — Recoverable issues, deprecations
- **error** (4) — Failures requiring attention
- **fatal** (5) — System-critical failures

**Log Categories (Auto-Detected)**:
- STARTUP (application initialization), SHUTDOWN (graceful shutdown), COMMAND (Discord slash commands), EVENT (Discord events), BATTLE (battle system), DATABASE (Prisma queries), CACHE (cache operations), WORKER (background workers), API (external API calls), ERROR (error tracking), PERFORMANCE (timing/profiling), SECURITY (auth/permissions), NETWORK (HTTP/WebSocket), STORAGE (file I/O), MIGRATION (database migrations), ALERT (critical notifications), SYSTEM (OS-level events)

**Auto-Detection Logic**:
- Stack trace analysis (file path patterns)
- Message content (keywords, patterns)
- Context metadata (operation type, error type)

**Storage Architecture**:

```
Store/logs/
├── current.jsonl               # Active log file (rotated hourly)
├── cache.bin                   # 7MB circular buffer (binary format)
├── index.db                    # SQLite index for fast queries
├── hourly/                     # Hourly rotations (last 24 hours)
│   └── *.jsonl.gz
├── daily/                      # Daily archives (last 30 days)
│   └── *.jsonl.gz
├── archive/                    # Compressed archives (90 days)
│   └── *.tar.gz
├── insights/                   # AI-generated insights
│   ├── *.json                  # Daily insight reports
│   └── patterns.json           # Detected patterns library
└── emergency/                  # Emergency fallback logs
    ├── fatal-errors.jsonl
    └── critical-events.jsonl
```

**Rotation Policy**:
- **Hourly rotation**: Every hour at :00, gzip -9 compression, 24h retention, 100MB/file max
- **Daily archival**: Daily at 00:00 UTC, consolidate hourly files, 30d retention, 500MB/day max
- **Monthly archival**: First of month at 00:00 UTC, consolidate daily files, 90d retention, tar.gz format

**Index Database (SQLite)**:

```sql
CREATE TABLE log_index (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  level INTEGER NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  fingerprint TEXT,
  file_path TEXT NOT NULL,
  importance INTEGER DEFAULT 50,
  
  INDEX idx_timestamp, idx_level, idx_category, idx_fingerprint, idx_importance,
  FTS5(message)
);

CREATE TABLE pattern_occurrences (
  pattern_id TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  log_ids TEXT NOT NULL,
  severity TEXT NOT NULL,
  
  INDEX idx_pattern_time
);
```

**SSH CLI Tools**:

```bash
# Search & filter
log-query "database connection failed"
log-query --since "1h ago" --level error
log-query --category BATTLE --level info,warn,error
log-query --filter 'context.operation.duration > 1000' --limit 50
log-query --user-id "123456789" --since "7d ago"

# AI-optimized summaries
log-report session --since "24h ago"
log-report errors --since "7d ago"
log-report performance --category BATTLE --since "24h ago"
log-report continuity --user-id "123456789" --since "7d ago"

# Pattern detection
log-pattern anomaly --since "24h ago"
log-pattern trends --since "7d ago"
log-pattern correlate --fingerprint "abc123def456" --since "7d ago"

# Session reconstruction
log-context session --session-id "sess_abc123" --output json
log-context user --user-id "123456789" --since "24h ago"
log-context error --fingerprint "abc123def456"
```

**Performance Characteristics**:

| Operation | Target | P95 | P99 |
|-----------|--------|-----|-----|
| Log emission (info) | <0.5ms | <1ms | <2ms |
| Log emission (error) | <1ms | <2ms | <5ms |
| Cache lookup (by ID) | <0.1ms | <0.2ms | <0.5ms |
| Cache query (filtered) | <5ms | <10ms | <20ms |
| SSH query (indexed) | <50ms | <100ms | <200ms |
| SSH query (full scan) | <500ms | <1s | <2s |
| Report generation | <1s | <2s | <5s |

**Memory Budget**:
- Circular Buffer: 7MB (fixed)
- Index Database: ~50MB (indexed logs)
- Pattern Library: ~1MB
- Active Connections: ~2MB
- Worker Threads: ~10MB
- **Total Target**: ~70MB (<1% of 8GB Render instance)

### 5.2 Buffer Design

**Centralized Log Buffer** — Reduces console noise by collecting logs in memory and flushing at configurable intervals (default: 10 seconds).

**Benefits**:
- **Deduplicating** identical messages (counts occurrences instead of repeating)
- **Aggregating** similar messages together
- **Prioritizing** critical logs (errors/warnings bypass buffering by default)
- **Batching** non-critical logs for periodic flushing

**Architecture**:

```
Application Logging → Log Router → [Immediate Out (errors/warns) | Log Buffer] → Batch Flush (deduplicated)
```

**Configuration via Environment Variables**:

```bash
LOG_BUFFER_ENABLED=true              # Enable/disable (default: true, false in tests)
LOG_BUFFER_INTERVAL=10000            # Flush interval (ms, default: 10000 = 10s)
LOG_BUFFER_MAX_SIZE=1000             # Max buffer size before forced flush
LOG_BUFFER_BYPASS_CRITICAL=true      # Errors/warns bypass buffer (default: true)
```

**Programmatic Configuration**:

```typescript
import { setupLogBuffer } from "./shared/logBufferInit.js";

setupLogBuffer({
  flushIntervalMs: 5000,
  maxBufferSize: 500,
  bypassCritical: true,
  enabled: true
});
```

**Usage Examples**:

```typescript
import { log } from "./shared/log.js";

// Buffered (flushed every 10s)
log.info("User action completed", { userId: 123, action: "login" });
log.debug("Cache hit", { key: "pokemon:25" });

// Immediate (bypasses buffer)
log.error("Database connection failed", error);
log.warn("High memory usage detected", { heapUsed: "512MB" });

// Manual flush
import { getLogBuffer } from "./shared/logBuffer.js";
const buffer = getLogBuffer();
if (buffer) buffer.flush();
```

**Deduplication Example**:

```typescript
// If called 50 times within 10 seconds:
for (let i = 0; i < 50; i++) {
  log.info("Processing item", { count: i });
}

// Output after 10s (single consolidated entry):
// {
//   "level": "info",
//   "msg": "Processing item",
//   "_buffered": {
//     "count": 50,
//     "firstSeen": "2025-11-09T12:00:00.000Z",
//     "lastSeen": "2025-11-09T12:00:09.500Z",
//     "durationMs": 9500
//   }
// }
```

**Output Format**:

```json
{
  "t": "2025-11-09T12:22:32.000Z",
  "level": "info",
  "msg": "Database query completed",
  "env": "production",
  "userId": 123,
  "_buffered": {
    "count": 15,
    "firstSeen": "2025-11-09T12:22:22.000Z",
    "lastSeen": "2025-11-09T12:22:31.500Z",
    "durationMs": 9500
  }
}
```

**Performance**:
- Memory overhead: ~200 bytes per unique log entry
- CPU overhead: Negligible (hashing + map operations)
- Flush time: <5ms for 1000 entries
- Max memory: Bounded by maxBufferSize (default: 1000 entries ≈ 200KB)

**API Reference**:
- `setupLogBuffer(config?)` — Initialize global buffer
- `getLogBuffer()` — Get buffer instance
- `destroyLogBuffer()` — Cleanup and shutdown
- `LogBuffer` methods: `add()`, `flush()`, `pause()`, `resume()`, `size()`, `getStats()`, `configure()`, `destroy()`

### 5.3 AI Integration

**AI-Optimized Hard Logging System** — Centralized, machine-readable logging for AI analysis and self-learning.

**Key Differences from Console Logger**:

| Feature | Console Logger | AI Log System |
|---------|---------------|---------------|
| **Output** | stdout/stderr (ephemeral) | Hard files on `/Store` disk |
| **Format** | Human-readable text | Machine-readable NDJSON |
| **Persistence** | Lost on restart | Retained indefinitely |
| **Correlation** | Manual | Automatic with correlation IDs |
| **Analysis** | Manual inspection | Automatic pattern detection |
| **Learning** | None | Self-adapts baselines and thresholds |
| **Query** | Scroll through logs | Structured queries with filters |

**Features**:

1. **Structured Logging** — Complete JSON logs with timestamp, level, category, correlationId, message, context (file/line/function/stack), process (pid/uptime/memory), data, error, tags, user, guild

2. **Log Levels** — TRACE (0, line-by-line), DEBUG (1, variable values), INFO (2, successful ops), NOTICE (3, notable events), WARN (4, degradation), ERROR (5, handled errors), CRITICAL (6, system instability), FATAL (7, shutdown required)

3. **Categories** — system, database, discord, game-engine, security, performance, error, resource, user-action, integration

4. **Correlation IDs** — Every entry has unique ID (`{timestamp}-{counter}-{random}`). Related operations share same ID for tracing entire flow across multiple systems.

5. **Auto-Rotation & Compression**:
   - Rotation triggers: File size >10MB OR age >24h
   - Compression: After 1h, gzipped to `/Store/ai-logs/compressed/`
   - Cleanup: Keeps last 100 compressed files, oldest deleted automatically

**Storage**:

```
/Store/ai-logs/
├── general-2025-11-10T15-30-00.ndjson        # Current active
├── database-2025-11-10T14-00-00.ndjson       # Category-specific
├── error-2025-11-10T12-30-00.ndjson
├── compressed/
│   └── *.ndjson.gz                           # Compressed archives
└── analysis/
    └── knowledge-base.json                    # Learned patterns
```

**File Format (NDJSON)**:

```
{"timestamp":"2025-11-10T15:30:00.000Z","level":"INFO","message":"Server started"}
{"timestamp":"2025-11-10T15:30:01.123Z","level":"DEBUG","message":"Loading config"}
{"timestamp":"2025-11-10T15:30:02.456Z","level":"ERROR","message":"Failed to connect"}
```

**Usage**:

```javascript
import * as aiLogger from './services/ai-log-writer.js';

await aiLogger.initialize();

aiLogger.info('system', 'Application started', {
  data: { version: '1.0.0', port: 3000 },
  tags: ['startup'],
});

const correlationId = aiLogger.generateCorrelationId();
aiLogger.error('database', 'Connection failed', {
  error: new Error('Timeout'),
  data: { host: 'localhost', port: 5432 },
  correlationId,
});

await aiLogger.flush();
await aiLogger.shutdown();
```

**Integration Hooks**:

```javascript
import * as aiLogIntegrations from './services/ai-log-integrations.js';

await aiLogIntegrations.integrateAll({
  errorTracker,
  logger,
  resourceMonitor,
  prisma,
  discordClient: client,
});
```

**Self-Learning Features**:

1. **Error Pattern Detection** — Levenshtein distance similarity (70% threshold), groups similar errors, tracks occurrences

2. **Performance Baselines** — Measures avg/P95/min/max durations, adapts baselines over time (10% adaptation rate), detects slow operations (>100ms)

3. **Correlation Detection** — Finds events occurring together within time windows, identifies cascade failures (error A → error B), tracks average time deltas

4. **Anomaly Detection** — Establishes baselines (24h window), detects spikes (>2 standard deviations), tracks log volume by level/category

5. **Insight Generation** — Generates actionable insights: recurring errors, performance bottlenecks, cascading failures, anomalies

**Knowledge Base Persistence** (`/Store/ai-logs/analysis/knowledge-base.json`):

```json
{
  "errorPatterns": [ ["PrismaClientKnownRequestError:Timeout...", { ... }] ],
  "performanceBaselines": [ ["Species.findUnique", { avg: 45.3, p95: 234.5, ... }] ],
  "correlations": [...],
  "anomalies": [...],
  "insights": [...]
}
```

**Query Interface (SSH)**:

```bash
# Basic queries
node src/cli/ai-log-query.js query --level ERROR --since 1h
node src/cli/ai-log-query.js query --category database --since 30m
node src/cli/ai-log-query.js query --grep "timeout" --since 2h

# Analysis
node src/cli/ai-log-query.js analyze --since 24h
node src/cli/ai-log-query.js patterns
node src/cli/ai-log-query.js insights
node src/cli/ai-log-query.js stats
```

### 5.4 Scaling

**AI Logging System — Scaling & Integration Guide**

**Storage Guarantees**:
- **Minimum Archive**: 48 hours of readable logs
- **File Retention**: 200 compressed files (16+ days at high volume)
- **Rotation Trigger**: 10MB per file OR 24 hours
- **Compression Timing**: 1 hour after rotation
- **Storage Location**: `/Store/ai-logs/` (persistent disk, survives deployments)

**Capacity Planning**:

| Volume | Files/Day | 48h Files | 7d Files | Buffer Capacity |
|--------|-----------|-----------|----------|-----------------|
| **High** (10MB/2h) | 12 | 24 | 84 | 16+ days (200 files) |
| **Medium** (10MB/6h) | 4 | 8 | 28 | 50+ days (200 files) |
| **Low** (10MB/24h) | 1 | 2 | 7 | 200 days (200 files) |

**Storage Math**:
- Uncompressed: 10MB × 200 files = 2GB maximum
- Compressed: ~2-3MB × 200 files = 400-600MB typical
- Persistent disk allocation: /Store mount (shared across workers)

**Integration Points** (11 total):

1. **Error Tracking System** (`src/services/error-tracker.ts`) — All tracked errors with context (ERROR level, error category, error-tracker tags)

2. **Console Logging** (`src/shared/log.ts`) — All log.info/warn/error calls with structured metadata (INFO/WARN/ERROR levels, based on context, console-logger tags)

3. **Resource Monitor** (`src/services/resource-monitor.ts`) — Health checks every 12h (INFO/WARN/ERROR levels, resource category, resource-monitor tags)

4. **Resource Manager (Leak Detection)** (`src/services/resource-manager.ts`) — Memory leak detections (WARN leaks, DEBUG tracking, resource category)

5. **Database Connection Monitor** (`src/shared/prisma.ts`) — Health status every minute (WARN issues, database category, database/health tags)

6. **Prisma Queries** (`src/shared/prisma.ts`) — All queries with duration (DEBUG normal, WARN slow >100ms, ERROR failures, database category, prisma tags)

7. **Discord Client Events** (`discord.js`) — Rate limits, API errors, warnings (WARN/ERROR/INFO levels, discord category)

8. **Worker Process Lifecycle** (all workers) — Startup, exceptions, rejections, metrics (INFO startup, DEBUG metrics, CRITICAL rejections, FATAL exceptions, system category)

9. **Game Engine Events** — Battle start/end/errors, Pokemon spawns (INFO/ERROR levels, game-engine category)

10. **Security Bot Events** — Permission sweeps, unauthorized changes (INFO sweeps, WARN unauthorized, ERROR reverts, security category)

11. **User Actions** — Command executions, errors (NOTICE commands, ERROR failures, user-action category)

**Scaling Architecture**:

```
Application Components → Integration Hooks → AI Log Writer → /Store/ai-logs/
```

**Multi-Worker Support**:
- Each worker writes to shared `/Store/ai-logs/` directory
- File rotation uses timestamps (collision-free)
- Compression runs independently per worker
- Analysis reads across all worker logs

**Performance Impact**:
- **Logging**: <1ms per entry (buffered)
- **Rotation**: ~50ms per file (async)
- **Compression**: ~500ms per file (background, I/O bound)
- **Analysis**: ~2s for 10,000 logs (on-demand)

**Memory Usage**:
- **Buffer**: ~5MB (100 entries × 50KB average)
- **Knowledge Base**: ~2MB (patterns + baselines + correlations)
- **Total**: ~7MB resident memory

**CLI Commands (SSH-Accessible)**:

```bash
npm run ai-logs:query -- --level ERROR --since 24h --limit 100
npm run ai-logs:analyze -- --since 48h
npm run ai-logs:patterns
npm run ai-logs:performance
npm run ai-logs:insights
npm run ai-logs:stats
```

**Best Practices**:
- ✅ Log all errors with full context (error object + metadata)
- ✅ Use appropriate log levels (TRACE verbose, ERROR actual errors)
- ✅ Include correlation IDs for related operations
- ✅ Add meaningful tags for filtering
- ✅ Log performance metrics for slow operations (>100ms)
- ✅ Capture user/guild context when available
- ❌ Don't log sensitive data (passwords, API keys, tokens)
- ❌ Don't log in tight loops without throttling
- ❌ Don't use TRACE level in production
- ❌ Don't block application flow waiting for logs

---

## Section 6: Error System

**Motto**: "No Silent Errors"  
**Mission**: Capture every error at every layer with zero false negatives, learn from patterns, recover automatically, and alert operators for critical issues.

### 6.1 Detection Architecture

**Purpose**: Multi-tier error detection ensuring 100% error capture rate regardless of database health.

#### Architecture Overview

```
Application Runtime → Domain Error Handlers → Error Tracker Service → [Database | Emergency Fallback] → Live Stream → Logger
```

**Core Components**:

1. **Error Tracker Service** (`src/services/error-tracker.ts`)
   - Captures errors with fingerprinting (SHA-256 hash of stack + message + category)
   - Deduplicates identical errors (same fingerprint → increment `occurrenceCount`)
   - Context enrichment (userId, guildId, commandName, service, operation, system state)
   - Severity classification (CRITICAL, HIGH, MEDIUM, LOW)
   - Database persistence (PostgreSQL `ErrorLog` table with atomic upsert)
   - Live stream emission (EventEmitter for real-time monitoring)

2. **Domain-Specific Error Handlers**
   - **BotErrorHandler** (`src/bot/error-handler.ts`): Discord API errors, interaction timeouts, permission errors
   - **EngineErrorHandler** (`src/core/engine-error-handler.ts`): Battle calculation errors, encounter logic failures
   - **WorkerErrorHandler** (`src/workers/worker-error-handler.ts`): Worker crashes, background job failures, scheduler errors
   - **ServiceErrorHandler** (`src/services/service-error-handler.ts`): Database errors, cache corruption, API timeouts

3. **Error Learning Engine** (`src/services/error-learning.ts`)
   - Pattern detection (time-of-day clustering, correlation analysis, cascade detection)
   - Impact prediction (affected features, estimated user impact, cascade effects)
   - Mitigation suggestions (recovery strategies with historical success rates)
   - Knowledge base updates (learns from recovery outcomes, builds error relationship graph)

4. **Error Recovery Engine** (`src/services/error-recovery.ts`)
   - Auto-retry strategies (exponential backoff for database/network errors, rate limit queuing, cache rebuild on corruption)
   - Recovery tracking (success rate, recovery time, strategy effectiveness)
   - Escalation (Render incident creation after 3 failed recovery attempts)

5. **Error Alerting System** (`src/services/error-alerting.ts`)
   - Critical alerts (immediate DM to admin for CRITICAL severity)
   - Pattern alerts (error storm detection >10/min)
   - New error alerts (first occurrence of unknown fingerprint)
   - Escalation alerts (recovery failed 3x → create Render incident)

**Error Taxonomy**:

**9 Categories**: VALIDATION (input failures, schema mismatches), NETWORK (HTTP errors, API timeouts, rate limits), DATABASE (query failures, connection errors, constraint violations), DISCORD (API errors, permission errors, interaction timeouts), ENGINE (battle calculation errors, encounter errors), WORKER (worker crashes, background job failures), CONFIG (missing env vars, invalid configuration), CACHE (cache corruption, eviction errors), UNKNOWN (uncategorized errors requiring human classification)

**4 Severity Levels**:
- **CRITICAL** (system-wide failure, data loss risk, service down) → Immediate recovery + DM admin
- **HIGH** (feature broken, user-facing errors, data inconsistency) → Attempt recovery + log + /ops
- **MEDIUM** (degraded performance, recoverable errors, warnings) → Attempt recovery + stats only
- **LOW** (non-critical issues, informational, expected errors) → Log only, no action

**Database Schema**:

```sql
-- ErrorLog table (PROD PostgreSQL)
CREATE TABLE "ErrorLog" (
  "errorId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "fingerprint" VARCHAR(64) NOT NULL UNIQUE,
  "category" VARCHAR(20) NOT NULL,  -- VALIDATION, NETWORK, DATABASE, etc.
  "severity" VARCHAR(10) NOT NULL,   -- CRITICAL, HIGH, MEDIUM, LOW
  
  -- Occurrence tracking
  "firstSeen" TIMESTAMP NOT NULL DEFAULT NOW(),
  "lastSeen" TIMESTAMP NOT NULL DEFAULT NOW(),
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  
  -- Error details
  "errorName" VARCHAR(255) NOT NULL,
  "errorMessage" TEXT NOT NULL,
  "stackTrace" TEXT,
  
  -- Context (JSONB for flexibility)
  "contextData" JSONB,  -- {userId, guildId, commandName, service, operation, stackMetadata, sourceLocation}
  
  -- Recovery tracking
  "recoveryAttempted" INTEGER DEFAULT 0,
  "recoverySuccess" INTEGER DEFAULT 0,
  "lastRecoveryStrategy" VARCHAR(50),
  "lastRecoveryOutcome" VARCHAR(20),  -- success, failed, partial
  
  -- Impact assessment
  "impactedFeatures" TEXT[],  -- ['battles', 'encounters', 'commands.battle']
  "estimatedUserImpact" INTEGER,  -- Number of users potentially affected
  
  -- Learning metadata (JSONB for ML features)
  "learningMetadata" JSONB,  -- {hourlyPattern, correlatedErrors, cascadeParent, mitigationSuccess}
  
  -- Timestamps
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX "idx_errorlog_fingerprint" ON "ErrorLog"("fingerprint");
CREATE INDEX "idx_errorlog_category" ON "ErrorLog"("category");
CREATE INDEX "idx_errorlog_severity" ON "ErrorLog"("severity");
CREATE INDEX "idx_errorlog_lastseen" ON "ErrorLog"("lastSeen" DESC);
CREATE INDEX "idx_errorlog_occurrences" ON "ErrorLog"("occurrenceCount" DESC);
CREATE INDEX "idx_errorlog_context" ON "ErrorLog" USING GIN("contextData");

-- ErrorAlert table (alert history)
CREATE TABLE "ErrorAlert" (
  "alertId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "errorId" UUID NOT NULL REFERENCES "ErrorLog"("errorId") ON DELETE CASCADE,
  "alertType" VARCHAR(20) NOT NULL,  -- critical, pattern, new, escalation
  "recipientId" VARCHAR(20),  -- Discord user ID
  "sentAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "acknowledged" BOOLEAN DEFAULT FALSE,
  "acknowledgedAt" TIMESTAMP,
  "acknowledgedBy" VARCHAR(20)
);
```

**Global Error Boundaries**:

```typescript
// Process-level (src/index.ts)
process.on('uncaughtException', async (error) => {
  await errorTracker.captureError(error, { category: 'UNKNOWN', severity: 'CRITICAL', service: 'process' });
  await gracefulShutdown(1);
});

process.on('unhandledRejection', async (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  await errorTracker.captureError(error, { category: 'UNKNOWN', severity: 'HIGH', service: 'process' });
});

// Discord client (src/bot/main.js)
client.on('error', async (error) => {
  await errorTracker.captureError(error, { category: 'DISCORD', severity: 'HIGH', service: 'discord-client' });
});

// Worker boundary (src/workers/engine-workers.ts)
function wrapWorkerWithErrorBoundary(worker) {
  // Try-catch wrapper with automatic restart on crash (max 3 attempts)
  // Escalates to Render after restart limit reached
}
```

### 6.2 Guarantees

**Zero False Negatives**: Triple redundancy ensures 100% error capture.

#### Five-Layer Fallback System

**Layer 1: Console Output (tier 1, <1ms)** — Always succeeds, synchronous:
```typescript
console.error(`🚨 [ERROR CAPTURED] ${timestamp}`);
console.error(`   Type: ${error.name}`);
console.error(`   Message: ${error.message}`);
console.error(`   Location: ${topFrame.relativeFilePath}:${topFrame.lineNumber}`);
```

**Layer 2: Database Write (tier 2, ~50ms)** — Primary persistence with atomic upsert:
```typescript
await prisma.errorLog.upsert({
  where: { fingerprint },
  update: {
    lastSeen: new Date(),
    occurrenceCount: { increment: 1 },  // Atomic, no race condition
    contextData: enrichedContext,
  },
  create: { /* ... */ },
});
```

**Layer 3: Emergency Log (tier 3, ~10ms)** — Disk fallback if database fails:
```typescript
await fs.writeFile(`Store/emergency-error-logs/error-${Date.now()}.json`, JSON.stringify(error));
```

**Layer 4: Live Stream (tier 4, <100ms)** — Real-time event emission to logger:
```typescript
liveErrorStream.emit('error', { errorId, fingerprint, severity, message, timestamp, parsedStack });
```

**Layer 5: Absolute Last Resort** — Console dump if all else fails:
```typescript
console.error('[ErrorTracker] Error data:', JSON.stringify({ error, context }));
```

**Latency Targets**:
- Console visibility: **<1ms** (synchronous, immediate)
- Database write: **~50-100ms** (async, non-blocking)
- Emergency fallback: **~10ms** (async file write)
- Live stream emission: **<100ms** (event emitter)
- Logger integration: **<100ms** (event subscriber)

**Critical Design Principles**:

1. **NO CACHING (Live Detection Only)** — Every error captured immediately with NO intermediate caching layer. Caching creates false negatives (errors occurring between refresh cycles are missed).

2. **CONSOLE FIRST (Immediate Visibility)** — Console output BEFORE any async operations. Order: console output (sync, <1ms) → database write (async, ~50ms) → live stream (async, <100ms). This ensures every error is visible within <1ms, before any async operations that might fail.

3. **ATOMIC UPSERT (No Race Conditions)** — Single atomic operation handles both insert and update with increment. Accurate occurrence counts even at 1000+ errors/second.

4. **LIVE STREAM (Real-Time Monitoring)** — Event-driven architecture with immediate emission to logger. Logger ERROR MONITORING section updates within <100ms (vs. 15s polling delay).

**Testing & Verification**:

```typescript
// Test 1: Console output latency
const start = performance.now();
await errorTracker.captureError(new Error('Test'), { service: 'test' });
const consoleLatency = performance.now() - start;
assert(consoleLatency < 1, 'Console output must be <1ms');

// Test 2: Database failure fallback
jest.spyOn(prisma, 'errorLog').mockImplementation(() => {
  throw new Error('Database unavailable');
});
const errorId = await errorTracker.captureError(new Error('Test'), { service: 'test' });
// Verify emergency log file created
const files = await fs.readdir('Store/emergency-error-logs');
assert(files.length > 0, 'Emergency log file created');

// Test 3: High-frequency accuracy (1000 identical errors)
await Promise.all(Array(1000).fill(0).map(() => 
  errorTracker.captureError(new Error('Timeout'), { service: 'test' })
));
// Verify occurrence count is exactly 1000 (no race conditions)
const errorLog = await prisma.errorLog.findUnique({ where: { fingerprint } });
assert(errorLog.occurrenceCount === 1000, 'Accurate count under high frequency');

// Test 4: Live stream latency
let streamReceived = false;
const start = performance.now();
liveErrorStream.once('error', (event) => {
  streamReceived = true;
  const latency = performance.now() - start;
  assert(latency < 100, 'Live stream latency must be <100ms');
});
await errorTracker.captureError(new Error('Test'), { service: 'test' });
assert(streamReceived, 'Live stream event emitted');
```

**Operational Checklist**:
- ✅ Console logs show `🚨 [ERROR CAPTURED]` for test errors
- ✅ Database ErrorLog table populated
- ✅ Emergency log directory exists: `Store/emergency-error-logs/`
- ✅ Logger ERROR MONITORING section visible
- ✅ Live stream events emitting (<100ms latency)

**Troubleshooting**:
- **Error not in console**: Error occurred before ErrorTracker initialized → Add error boundaries at process level
- **Error in emergency logs but not database**: Database connection issues → Check DATABASE_URL, verify Prisma connectivity
- **ERROR MONITORING section not updating**: Logger not subscribed to liveErrorStream → Add subscription in logger initialization
- **Inaccurate occurrence counts**: Race condition (find-then-update instead of upsert) → Verify atomic upsert with increment

### 6.3 Tracker Integration

**Phase 1 Complete (Critical User-Facing Paths)**: 6 files modified, 120+ lines added, 9 catch blocks enhanced.

**Integration Strategy**: Systematic integration of `errorTracker.captureError()` throughout codebase to ensure all errors tracked with contextual enrichment.

**Phase 1 Completed Files**:

1. **Daily Commands** (`src/bot/daily/claim.ts`) — Error tracking for daily quest claim failures with context (userId, guildId, commandName, operation)

2. **Battle Actions** (`src/bot/battle/actions.ts`) — Error tracking for move queue failures and switch action failures with context (battleId, playerKey, moveId/switchToId, operation)

3. **Battle Challenges** (`src/bot/battle/challenge.ts`) — Import added (DM delivery failures intentionally silent per best-effort patterns)

4. **DM Home Views** (`src/bot/dm/home.ts`) — Error tracking for DM delivery failures with context (userId, view type, fallback mode)

5. **Admin Operations** (`src/bot/ops/admin.ts`) — Error tracking for `/ops cache`, `/ops engine`, `/ops stats`, `/ops state` failures with category-specific context (CACHE, ENGINE, DATABASE, WORKER)

**Standard Error Tracking Pattern**:

```typescript
try {
  const result = await someOperation();
} catch (err) {
  // Track error with context
  await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
    category: 'DISCORD' | 'DATABASE' | 'ENGINE' | 'WORKER' | 'CACHE',
    userId: interaction?.user.id,
    guildId: interaction?.guildId || undefined,
    commandName: '/command-name',
    operation: 'module:function',
    context: {
      relevantId: 'value',
      input: 'parameters',
    },
  });
  
  // User-facing error message
  await interaction.reply({ content: "Operation failed. Please try again later.", ephemeral: true });
}
```

**Category Guidelines**:
- **DISCORD**: Discord API failures, interaction timeouts, DM delivery (rate limits, missing permissions, user blocked DMs)
- **DATABASE**: PostgreSQL/Prisma failures, connection issues, query timeouts (connection timeout, constraint violation, deadlock)
- **ENGINE**: Battle engine, encounter logic, calculation errors (invalid move queue, switch failure, damage overflow)
- **WORKER**: Background worker failures, scheduled task errors (worker crash, timeout, memory exceeded)
- **CACHE**: Cache corruption, Redis failures, eviction errors (cache miss on critical data, serialization failure)
- **UNKNOWN**: Unclassifiable or unexpected errors (generic JavaScript errors, unexpected types)

**Context Enrichment (Required Fields)**:
- `userId`: `interaction.user.id` — Always include for user-triggered operations
- `guildId`: `interaction.guildId || undefined` — Include for server context
- `operation`: `'module:function'` — Specific operation that failed
- Optional: `commandName` (/command-name), `battleId`, `encounterId`, `moveId`, `input` (relevant parameters)

**Phase 2-4 Pending**:
- **Phase 2: Service Layer** (15 files) — Cache facade, Engine DB services (cache, buffer, read-db, write-db), data pipeline
- **Phase 3: Worker Tasks** (5 files) — Engine workers, error learning worker, state persistence
- **Phase 4: Core Engine** (8 files) — Battle turn manager, encounter manager, calculation modules (damage, stats)

**Build Status**: ✅ PASSING (0 errors, 0 warnings)

### 6.4 Logger Integration

**Purpose**: Real-time error visibility in console output alongside Node, Database, and Security Bot metrics.

**Implementation**: `src/utils/logger.js` (+130 lines, ERROR MONITORING section added)

**Auto-Refresh**: Every 15 seconds with live stream integration.

**Console Format**:

```
[ERROR MONITORING] (Last Hour)
  🚨 CRITICAL: 2 unique | ⚠️  HIGH: 5 unique | 📊 MEDIUM: 12 unique | 📝 LOW: 31 unique
  Total: 50 unique errors | 234 occurrences | Rate: 3.90/min

  Top Recent Errors:
    ❌ [CRITICAL] PrismaClientInitializationError (x5, 2m ago) | Recovery: 0/5
       → affecting: battles, encounters, trainer-ops
    ⚠️  [HIGH] DiscordAPIError[50013] (x8, 5m ago) | Recovery: 6/8
       → affecting: permission-sweeps, role-management
    📊 [MEDIUM] TimeoutError: Member fetch timeout (x10, 8m ago) | Recovery: 10/10
       → affecting: security-sweeps

  Top Categories: DATABASE (45), DISCORD (30), WORKER (15)
```

**Live Stream Subscription**:

```javascript
// In src/utils/logger.js after collectDatabaseStats()
async function collectErrorStats() {
  const errorTracker = await import('../services/error-tracker.js');
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const stats = await errorTracker.getErrorStats(oneHourAgo);
  const topErrors = await errorTracker.getRecentErrors({ limit: 10, orderBy: 'lastSeen' });
  
  return { stats, topErrors, status: 'ready' };
}

// In printStats() add ERROR MONITORING section
if (statsCache.errors?.status === 'ready') {
  const { stats, topErrors } = statsCache.errors;
  
  console.log('\n[ERROR MONITORING] (Last Hour)');
  console.log(`  🚨 CRITICAL: ${stats.bySeverity.CRITICAL} unique | ...`);
  // ... format top 5 errors with affecting features and recovery status
}
```

**Display Logic**:
- Shows top 5 recent errors (from last 10 queried)
- Icon per severity: ❌ CRITICAL, ⚠️  HIGH, 📊 MEDIUM, 📝 LOW
- Occurrence count: `(x5)` = 5 occurrences of same error
- Time since last occurrence: `2m ago`
- Recovery statistics: `0/5` = 0 successes out of 5 attempts
- Impacted features: First 3 features shown
- Top 3 error categories with counts

**Performance Impact**:
- **Memory overhead**: ~50 KB per refresh cycle (summary stats 1 KB + top 10 errors 5 KB each)
- **CPU overhead**: <5ms per refresh cycle (database query 2-3ms + transformation/formatting <2ms)
- **Database load**: Minimal (1 query per 15s = 4 queries/min = 240 queries/hour, indexed queries ~2-3ms each)
- **Network overhead**: None (local database queries)

**Operational Benefits**:
- **Immediate error visibility**: Errors visible in same console view as runtime metrics (no SSH/database queries needed)
- **Quick diagnosis**: Severity breakdown shows error distribution at glance, top errors highlight most frequent issues, recovery stats show which errors self-heal
- **Proactive monitoring**: Error rate shows if errors increasing, time since last shows if errors still occurring, category breakdown identifies problem areas
- **Zero-cost debugging**: Real-time updates every 15s without manual log parsing or database queries

### 6.5 Logging Integration

**Purpose**: Comprehensive guide to integrated error detection, stack trace parsing, and intelligent logging for AI-powered troubleshooting.

**Components**: error-tracker.ts, stack-trace-parser.ts, intelligent-logger.ts

**Architecture Flow**:

```
Error Occurs
    │
    ▼
error-tracker.ts
    │
    ├─► Parse Stack Trace (stack-trace-parser.ts)
    │   ├─► Extract file/line/function
    │   ├─► Build call chain
    │   ├─► Get source code snippets
    │   └─► Calculate importance
    │
    ├─► Enrich Context (system state, environment, AI troubleshooting hints)
    ├─► Persist to Database (PostgreSQL, fingerprint deduplication)
    ├─► Generate AI Report (async, fire-and-forget, Store/error-reports/)
    ├─► Emit to Live Stream (liveErrorStream)
    │   └─► intelligent-logger.ts subscribes
    └─► Emergency Fallback (if DB fails, Store/emergency-error-logs/)
```

**Stack Trace Parsing** (`src/utils/stack-trace-parser.ts`):

**Features**:
- Frame extraction (parse V8 stack traces into structured frames)
- Source locations (file path, line number, column number)
- Function names (extract function/method names from stack)
- Call chain (reconstruct execution flow: A → B → C)
- Source snippets (extract 3 lines around error: before, error line, after)
- TypeScript support (handle compiled JS → TS source maps, future enhancement)

**Stack Frame Structure**:
```typescript
interface StackFrame {
  functionName: string | null;          // "BattleEngine.resolveTurn"
  filePath: string | null;               // Absolute path
  relativeFilePath: string | null;       // "src/core/battle-engine.ts"
  lineNumber: number | null;             // 1-indexed
  columnNumber: number | null;           // 1-indexed
  fileType: 'typescript' | 'javascript' | 'native' | 'unknown';
  isNodeModule: boolean;                 // Skip node_modules
  isNative: boolean;                     // Native Node.js code
  isAnonymous: boolean;                  // Anonymous function
  raw: string;                           // Original frame string
  sourceSnippet?: SourceSnippet;        // Source code around error
}
```

**Error Context Snapshot** (`captureErrorContextSnapshot()`):

Captures complete system state at error time:
```typescript
interface ErrorContextSnapshot {
  timestamp: string;                    // ISO 8601
  error: { name, message, fingerprint };
  stackTrace: ParsedStackTrace;        // Full parsed stack
  system: {
    nodeVersion: string;                // "v20.10.0"
    platform: string;                   // "win32"
    architecture: string;               // "x64"
    memoryUsage: NodeJS.MemoryUsage;    // RSS, heap, external
    uptime: number;                     // Process uptime (seconds)
  };
  environment: {
    cwd: string;                        // Working directory
    execPath: string;                   // Node.js binary path
    execArgv: string[];                 // Node.js arguments
    env: Record<string, string>;        // Safe env vars (no secrets)
  };
  context?: Record<string, any>;       // Additional context
  troubleshootingHints: string[];      // AI-optimized hints
}
```

**Troubleshooting Hints** (automatically generated):
- Primary location: "Error originated in: src/core/battle-engine.ts:42"
- Error type hints: "TypeError suggests: undefined/null access, incorrect type usage"
- Call chain: "Call sequence: resolveTurn → executeBattle → handleCommand"
- Memory pressure: "⚠️ High memory usage: 92.3% heap used - possible memory leak"
- Review files: "Review user code in: src/core/battle-engine.ts, src/commands/battle.ts"
- Stack depth: "⚠️ Deep call stack (>50 frames) - possible infinite recursion"

**AI-Optimized Error Reports** (`formatErrorReportForAI()`):

**Storage**: `Store/error-reports/error-{fingerprint}-{timestamp}.md`

**Format**:
```markdown
# 🔍 AI Error Analysis Report

**Generated:** 2025-11-10T15:42:33.182Z
**Error:** TypeError: Cannot read property 'hp' of undefined
**Fingerprint:** `a1b2c3d4e5f6`

## 💡 Troubleshooting Hints
- Error originated in: src/core/battle-engine.ts:42
- TypeError suggests: undefined/null access, incorrect type usage
- Call sequence: resolveTurn → executeBattle → handleCommand
- Review user code in: src/core/battle-engine.ts

## 📚 Stack Trace
**Depth:** 15 frames | **User Code Frames:** 3
**Call Chain:** resolveTurn → executeBattle → handleCommand → ...

### Frame 1: BattleEngine.resolveTurn
**Location:** `src/core/battle-engine.ts:42:15`
**Source:**
```typescript
41:   const targetPokemon = battle.getActivePokemon(target);
42:   if (targetPokemon.hp <= 0) { <-- ERROR HERE
43:     return { success: false, reason: 'target-fainted' };
```

## 🖥️  System State
- **Node.js:** v20.10.0
- **Platform:** win32 (x64)
- **Uptime:** 3247s
- **Memory:** RSS 154.23 MB | Heap 98.45 MB/128.00 MB

## 🌍 Environment
- **Working Directory:** `C:/Users/sherb/OneDrive/Documents/GitHub/Infinity-Gauntlet`
- **Node Binary:** `C:/Program Files/nodejs/node.exe`
```

**Intelligent Logger Integration** (`src/utils/intelligent-logger.ts`):

**Live Stream Subscription**:
```typescript
// In IntelligentLogger constructor
liveErrorStream.on('error', (event: LiveErrorEvent) => {
  const message = `[ERROR-TRACKER] ${event.errorName}: ${event.errorMessage}`;
  
  // Log with full stack trace metadata
  this.log('error', message, {
    category: 'ERROR',
    data: {
      errorId: event.errorId,
      fingerprint: event.fingerprint,
      severity: event.severity,
      stackMetadata: {
        depth: event.parsedStack.depth,
        topFrame: { file, line, column, function },
        callChain: event.callChain,
        userCodeFrames: event.parsedStack.userCodeFrames.length,
      },
      sourceLocation: { file, line, column },
      errorContext: event.context,
    },
  });
});
```

**Enhanced Log Entry Schema**:
```typescript
interface LogEntry {
  context: {
    error?: {
      name: string;
      message: string;
      stack: string;
      fingerprint: string;
      stackMetadata?: {
        depth: number;
        topFrame?: { file, line, column, function };
        callChain: string[];
        userCodeFrames: number;
      };
      sourceLocation?: { file, line, column };
    };
  };
}
```

**Storage Locations**:
- **Intelligent Logs**: `Store/intelligent-logs/current.jsonl` (JSONL, live log stream)
- **Error Reports**: `Store/error-reports/error-{fp}-{ts}.md` (Markdown, AI-optimized analysis)
- **Emergency Logs**: `Store/emergency-error-logs/error-{ts}.json` (JSON, fallback when DB fails)
- **Hourly Archive**: `Store/intelligent-logs/hourly/*.jsonl.gz` (24h retention)
- **Daily Archive**: `Store/intelligent-logs/daily/*.jsonl.gz` (30d retention)
- **Monthly Archive**: `Store/intelligent-logs/archive/*.tar.gz` (90d retention)

**SSH CLI Access** (`scripts/log-cli.sh`):

**Error Analysis Commands**:
```bash
# Trace error by fingerprint
log-cli.sh error trace --fingerprint a1b2c3d4e5f6

# Get system context at error time
log-cli.sh error context --fingerprint a1b2c3d4e5f6

# Get AI-powered fix suggestions
log-cli.sh error suggest --fingerprint a1b2c3d4e5f6

# Find similar errors
log-cli.sh error similar --fingerprint a1b2c3d4e5f6

# View events ±5 minutes around error
log-cli.sh error timeline --fingerprint a1b2c3d4e5f6 --window 10m
```

**Performance Characteristics**:
- Stack parsing: <1ms (sync), 10,000+ ops/sec, 100% reliability
- Database write: ~50ms (async), 100+ writes/sec, 99.9% reliability
- AI report generation: ~100ms (background), fire-and-forget, best-effort
- Live stream emit: <0.5ms (sync), 50,000+ events/sec, 100% reliability
- Intelligent logger: <1ms (async buffer), 1000+ logs/sec, 100% reliability
- Emergency fallback: ~10ms (disk I/O), 100+ writes/sec, 100% reliability

**Total error capture latency**: ~52ms (parsing + DB write)  
**User-facing impact**: **ZERO** (async, non-blocking)

**Zero False Negatives Guarantee**: Five layers ensure NO ERRORS ARE LOST:
1. **Layer 1: Console output** (<1ms, always succeeds)
2. **Layer 2: Database persistence** (~50ms, primary storage)
3. **Layer 3: Live stream emit** (<100ms, real-time monitoring)
4. **Layer 4: Emergency file fallback** (~10ms, if DB fails)
5. **Layer 5: Absolute last resort** (console dump if all else fails)

---

## Section 7: Security Bot

### 7.1 State Persistence

**Purpose:** Give the security bot "memory" — cumulative statistics across restarts, operational history, per-guild tracking, intelligent recovery.

**Storage Structure**:

```
Store/security-bot-state/
├── current.json          # Active runtime state (auto-saved every 5 minutes)
├── previous.json         # Backup from last restart
├── snapshots/           # Timestamped backups (7-day retention)
└── schema.md            # JSON schema documentation
```

**State Lifecycle**:

1. **Startup:**
   - Load `current.json` (fallback: `previous.json` → default state)
   - Validate schema version, migrate if needed
   - Increment `restartCount` in cumulative stats
   - Add restart event to timeline
   - Save backup to `previous.json`
   - Initialize auto-save (every 5 minutes)

2. **Runtime:**
   - Update stats on every sweep, alert, permission change
   - Append events to rolling timeline (max 100)
   - Track per-guild monitoring state
   - Auto-save every 5 minutes
   - Manual save on critical events

3. **Shutdown:**
   - Capture final state snapshot
   - Add shutdown event to timeline
   - Save to `current.json`
   - Create timestamped snapshot
   - Prune snapshots older than 7 days

**Modules** (`src/bot/state/`):

- **`persistence.js`** — Core state management: `initializeState()`, `saveState()`, `shutdownState()`, `startAutoSave()`, `stopAutoSave()`, `loadState()`, `addTimelineEvent()`, `updateCumulativeStats()`, `updateGuildState()`, `updateRuntimeState()`. Three-tier fallback (current → previous → default), automatic schema migration, timestamped snapshots with auto-pruning, error-tolerant (never crashes bot).

- **`stats.js`** — Statistics collection: `recordSweep()`, `recordPermissionChange()`, `recordAlert()`, `recordError()`, `updateDatabaseStatus()`, `getStatsSummary()`, `getRecentEvents()`, `formatUptime()`. Tracks: total uptime, sweeps, alerts, permission changes/reverts, revert failures, guild count, database connection status (PROD + LOCAL).

- **`timeline.js`** — Activity timeline: `formatTimelineEvent()`, `getEventsByType()`, `getEventsByGuild()`, `getEventsByTimeRange()`, `getTimelineSummary()`, `getFormattedTimeline()`, `getRecentActivitySummary()`, `buildTimelineEmbedFields()`. Event types: `sweep`, `permission_change`, `alert`, `restart`, `shutdown`, `error`.

- **`context.js`** — Operational context restoration: `restoreGuildContext()`, `getTimeSinceLastSweep()`, `isSweepOverdue()`, `getGuildsNeedingSweep()`, `initializeGuild()`, `enableGuildMonitoring()`, `disableGuildMonitoring()`, `getMonitoringStatus()`, `buildRestartSummary()`, `getRecoveryRecommendations()`. Guild state tracking: last sweep timestamp, total sweeps, alerts, permission changes, monitoring enabled/disabled, last activity.

**JSON Schema (v1.0.0)**:

```json
{
  "version": 1,
  "schemaVersion": "1.0.0",
  "metadata": {
    "lastSaved": "ISO timestamp",
    "lastRestart": "ISO timestamp",
    "processStartTime": "ISO timestamp",
    "hostname": "Render service name",
    "nodeVersion": "v22.16.0",
    "botVersion": "1.0.0"
  },
  "cumulative": {
    "totalUptime": 0,            // ms
    "restartCount": 0,
    "sweepCount": 0,
    "alertCount": 0,
    "permissionChangesDetected": 0,
    "permissionChangesReverted": 0,
    "revertFailures": 0,
    "guildCount": 0,
    "firstStartTime": "ISO timestamp"
  },
  "timeline": [
    {
      "timestamp": "ISO timestamp",
      "type": "sweep|permission_change|alert|restart|shutdown|error",
      "guildId": "string",
      "guildName": "string",
      "details": { /* event-specific */ }
    }
  ],
  "guilds": {
    "guildId": {
      "id": "string",
      "name": "string",
      "lastSweep": "ISO timestamp",
      "sweepCount": 0,
      "alertCount": 0,
      "permissionChanges": 0,
      "monitoring": true,
      "lastActivity": "ISO timestamp"
    }
  },
  "runtime": {
    "currentUptime": 0,          // ms since process start
    "currentRestartTime": "ISO timestamp",
    "databaseStatus": { "prod": "healthy", "local": "disabled" },
    "activeSweepIntervals": ["guildId1", "guildId2"]
  }
}
```

**Integration Points**:

- **Startup** (`src/bot/main.js` ClientReady): `botState = await initializeState(); autoSaveInterval = startAutoSave(botState);`
- **After Sweeps**: `recordSweep(botState, guildId, guildName, rolesChecked, changesDetected);`
- **On Permission Changes**: `recordPermissionChange(botState, guildId, guildName, userId, userName, action, reverted, revertStatus);`
- **On Alerts**: `recordAlert(botState, guildId, recipient, reason, delivered);`
- **Graceful Shutdown**: `process.on('SIGTERM', async () => { stopAutoSave(autoSaveInterval); await shutdownState(botState, 'SIGTERM'); process.exit(0); });`
- **Admin Interface**: `/ops state` command displays cumulative statistics, database status, recent activity summary. Options: `timeline:true` (last 20 events), `guilds:true` (per-guild monitoring status).

**Performance**:
- Startup: <100ms (load + migrate + save)
- Auto-save: <50ms every 5 minutes (async, non-blocking)
- Event recording: <1ms (in-memory append)
- State size: ~10-50 KB typical, ~100 KB max
- Disk I/O: Minimal (auto-save + graceful shutdown only)

**Error Handling**:
- **Corrupt State Files**: Fallback chain (current → previous → default), log error, continue
- **Save Failures**: Log error, continue, retry on next auto-save
- **Schema Migration Errors**: Log warning, use state as-is, continue
- **Graceful Shutdown Failures**: Best-effort save, don't block process exit, recoverable from auto-save

**Security**:
- No secrets/tokens in state files
- Public identifiers only (Discord guild/user IDs)
- No message content (only metadata: timestamps, counts, IDs)
- Production state persists on Render worker disk (ephemeral but restarts preserve)

**Render Persistent Disk**:
```yaml
# render.yaml
- type: worker
  name: infinity-gauntlet-security
  disks:
    - name: security-state
      mountPath: /Store
      sizeGB: 1
```

State files persist at `/Store/security-bot-state/` (survives deployments):
- `current.json` — Active runtime state
- `previous.json` — Backup from last restart
- `snapshots/*.json` — Timestamped backups (7-day retention)

### 7.2 Restart DMs

**Purpose:** Provide comprehensive operational continuity and system health metrics when the security bot restarts.

**Message Template**:

```
🛡️ Security monitor restarted at [timestamp].
Continuous monitoring is active across [N] guild(s).

📊 **Operational Continuity**
• Restart #[N]
• Time since last restart: [duration]
• Total uptime (all time): [duration]
• Total sweeps: [N]
• Total alerts: [N]
• Permission changes detected: [N]
• Successful reverts: [N]

📜 **Recent Activity Before Restart**
• 0s ago: restart
• [time] ago: [activity description]
• [time] ago: [activity description]
• [time] ago: [activity description]
• [time] ago: [activity description]

[NODE]
  Uptime: [duration]
  Process: PID [N] | v[version]

  Memory: RSS [size] | Heap [used]/[total] | External [size]
  CPU: User [time] | System [time]

[DATABASE]
  PROD  → [status] | Latency: [value or <unavailable: reason>] | [database or <unavailable: reason>]
  LOCAL → [status] | Latency: [value or <unavailable: reason>] | [database or <unavailable: reason>]
```

**Metrics Transparency** (follows contract in `docs/metrics-transparency.md`):

**Database Status Values:**
- `initializing` — Database connection being established
- `online` — Database connected and healthy
- `disabled` — Database intentionally not configured (LOCAL in production)
- `error` — Database connection failed

**Latency Format:**
- ✅ Live value: `24.56ms`
- ❌ Unavailable: `<unavailable: initializing>`, `<unavailable: disabled>`, `<unavailable: not_connected>`, `<unavailable: not_queried_yet>`, `<unavailable: no_provider>`, `<unavailable: query_failed>`

**Database Source Format:**
- ✅ Live value: `infinity_gauntlet_prod`
- ❌ Unavailable: `<unavailable: [reason]>` (same reasons as latency)

**Implementation** (`src/bot/main.js` - `notifyServiceRestart()`):

1. Build header with restart time and guild count
2. Add operational continuity section from `botState`
3. Add recent activity timeline (last 5 events from state)
4. Wait for database initialization (up to 30 seconds)
5. Query formatted stats from logger module (`getFormattedStats()`)
6. Append stats to message

**Stats Collection** (`src/utils/logger.js` - `getFormattedStats()`):

1. Refresh all stats (Node, Database, Security Bot)
2. Format Node stats (always available from process APIs)
3. Format Database stats with explicit unavailability declarations
4. Return formatted string

**Error Handling**:
- **Missing Recipient**: Log warning, record alert
- **Database Timeout**: Send message with "initializing" status
- **Stats Collection Failure**: Send message without stats section

**Example Output** (Database Online):

```
🛡️ Security monitor restarted at 11/9/2025, 5:24:54 PM.
Continuous monitoring is active across 1 guild(s).

📊 **Operational Continuity**
• Restart #5
• Time since last restart: 2h 8m
• Total uptime (all time): 0s
• Total sweeps: 173
• Total alerts: 0
• Permission changes detected: 0
• Successful reverts: 0

📜 **Recent Activity Before Restart**
• 0s ago: restart
• 4m ago: Swept Black Infinity Gauntlet (#1100976155579712222)
• 5m ago: Swept Black Infinity Gauntlet (#1100976155579712222)
• 6m ago: Swept Black Infinity Gauntlet (#1100976155579712222)
• 7m ago: Swept Black Infinity Gauntlet (#1100976155579712222)

[NODE]
  Uptime: 34s
  Process: PID 73 | v22.16.0

  Memory: RSS 126.39 MB | Heap 25.83 MB/29.29 MB | External 25.96 MB
  CPU: User 2.22s | System 0.48s

[DATABASE]
  PROD  → online | Latency: 24.56ms | infinity_gauntlet_prod
  LOCAL → disabled | Latency: <unavailable: disabled> | <unavailable: disabled>
```

**Configuration**:
- **Environment Variable**: `RESTART_DM_RECIPIENT`
- **Format**: Discord user ID (string)
- **Required**: No (restart notifications disabled if not set)

**Verification Workflow**:
1. Build the project: `npm run build`
2. Deploy to Render (automatic via GitHub push)
3. Restart the bot (Render dashboard or automatic redeploy)
4. Check DM sent to configured `RESTART_DM_RECIPIENT`

**Change History**:
- **2025-11-09**: Enhanced with metrics transparency contract (explicit unavailability reasons, removed hardcoded "n/a", cleaner output when counts are 0)
- **2025-11-08**: Added operational continuity tracking (state persistence summary, recent activity timeline, database stats)
- **Original**: Basic restart notification (header with timestamp and guild count only)

---

## Section 8: Router System

**Meta-router Design:** Routes by capability and learned priors. Keeps a no-progress counter and hashes changes.

**Recovery Playbook:** shrink step → swap strategy → reset context → escalate.

**Budgets:** Default 15 min / 80k tokens; override per task.

**Coverage Map:**
- `ops/ROUTER.yaml` and `masterroutetable.md` remain canonical indices — run `npm run docs:update-routers` after adding or moving any `ROUTER.md`.
- Every tracked directory carries a `ROUTER.md` with key assets and ownership notes (e.g., `.github/`, `.db-state/`, `data/`, `docs/`, `playbooks/`, `prisma/`, `router/`, `secrets/`, `sync-layer/`, `tools/`, and the full `src/**` subdomains).
- Guard scripts (`scripts/guard_router_docs.sh`, `scripts/verify_router_links.sh`) should pass cleanly once new routers land; re-run them whenever the map changes.
- When adding new surfaces, create the `ROUTER.md`, update `ops/ROUTER.yaml` categories, and append a summary entry to `masterroutetable.md`.

**Router Discipline (Mandatory):**
- Every code change **must** be accompanied by comprehensive routing updates.
- Includes: adding new files, renaming/moving directories, changing purpose/activity of existing files.
- Update all routing systems in same patchset: `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, `masterroutetable.md`, affected `ROUTER.md` manifests (parent + sub-router), and `ops/TOUCHMAP.yaml` as needed.
- Do not consider a task complete until meta-routers and touch maps fully reflect the new or updated surfaces.
- If automation generates router docs, rerun the generator and commit the outputs.
- AI is responsible for verifying that routing guard scripts pass after the update. Resolve any failures before exiting the run.

---

## Section 9: Game Engine

### 9.1 PBSL Manifesto

**Official Statement**: PBSL = Pokémon Buddy System Logics. Deterministic, auditable framework for Discord battles.

**Core Pillars:**
1. **Determinism & Auditability** — Every damage roll, catch check, status proc reproducible from a logged seed
2. **Truth Hierarchy** — Upstream Pokémon data (PokeAPI/Bulbapedia) → immutable snapshot → runtime decisions
3. **Adaptable Interfaces** — Clean contracts allow swap-out implementations (e.g., different RNG, alternative formulas)
4. **Continuous Validation** — Unit tests + integration tests + oracle fixtures guard against regressions
5. **Provenance First** — Log source references for moves, abilities, formulas before results

**Module Layout:**
- `src/core/pbsl/rng.ts` — Seeded RNG with `next()`, `nextInRange()`, `shuffle()`, audit trail
- `src/core/pbsl/audit.ts` — Structured log recorder for battle events
- `src/core/pbsl/phases.ts` — Turn phases (selection → priority → execution → end-of-turn)
- `src/core/battle/engine.ts` — Battle state machine using PBSL components
- `src/core/encounter/generator.ts` — Wild Pokémon spawning with seeded RNG
- `src/data/provenance.ts` — Upstream source metadata (PokeAPI versions, Bulbapedia timestamps)

**Oracle Fixtures**: `tests/pbsl/oracle.spec.ts` validates deterministic outcomes match upstream expectations. Snapshots include: seed, moves, damage ranges, status effects, catch rates. Any change to formulas requires oracle update + approval.

**Launch Blockers (12 items):**
1. **User management & data storage** — Prisma models for User, TrainerProfile, PokemonInstance, Inventory
2. **Game init trigger** — `/start` command creates TrainerProfile, spawns starter selection
3. **Player options** — Starter selection menu with 3 options + confirmation
4. **Starter selection** — `/choose-starter <name>` creates first PokemonInstance
5. **Catching/obtaining & storage (Pokébox)** — `/catch <ball>` during encounter, stored in Inventory
6. **Battle event triggers (emoji-based 👀)** — React with 👀 to opponent's message triggers battle DM flow
7. **Battle log delivery (DM + arena broadcast)** — DM both trainers with move/switch buttons, broadcast summary to arena
8. **Arena channel safety & moderation** — Security bot monitors role changes, auto-reverts unauthorized edits
9. **Commands & events (Discord)** — Slash commands + button interactions + emoji reactions
10. **Observability & ops** — `/ops` command suite with error dashboard, cache stats, battle metrics
11. **Minimal data schemas (Prisma models)** — User, TrainerProfile, PokemonInstance, Battle, Encounter, Inventory
12. **Acceptance criteria for "launchable"** — All 11 blockers resolved + smoke tests passing + observability green

**Compliance Checklist:**
- ✅ Deterministic RNG (seeded PRNGs with audit trails)
- ✅ Battle phases (selection → priority → execution → end-of-turn)
- ✅ Encounter generator (wild spawns with seeded RNG)
- ✅ Audit trail (structured logs for damage, status, catch checks)
- ✅ Provenance metadata (upstream sources tracked via `data/provenance.ts`)
- ✅ Oracle CI (tests/pbsl/oracle.spec.ts validates deterministic outcomes)
- 🔄 Citations ledger (planned: link every formula to upstream URL)
- 🔄 Adapter integration (planned: swap RNG/formula implementations via DI)

**Governance & Contributions:**
- **Gameplay changes require upstream sources** — No formula changes without Bulbapedia/Smogon citation
- **Automated tests required** — Every new formula needs unit test + oracle fixture
- **Provenance metadata schema** — Track PokeAPI version, Bulbapedia permalink, last-verified timestamp

**Next Steps:**
1. Wire PBSL into legacy flows (replace ad-hoc RNG with seeded `rng.next()`)
2. Extend provenance metadata (add Smogon damage calculator URLs)
3. Document adapter patterns (RNG interface, formula interface)
4. Grow oracle fixture catalog (cover all Gen 1-3 mechanics)

---

### 9.2 Battle DM Flow

Battle DM experience drives every turn through ephemeral component menus so both trainers submit actions without leaving the conversation. Lightweight flow while full arena automation matures.

**Turn Prompts:**
- When battle enters `Active` state, DM both participants "Your Move" embed with **Move**, **Switch**, **Forfeit** buttons
- Selecting **Move** opens follow-up select menu listing active Pokémon's legal moves (PP callouts when available)
- Trainer chooses option, handler immediately queues move in turn manager
- Ephemeral prompt updates to confirm choice, waits for opponent if not yet acted
- Choosing **Switch** works same way: select menu lists only healthy, non-active party members
- Picking target queues swap with battle engine API, updates cached battle state, confirms pending switch

**Turn Resolution:**
- Both move and switch submissions land in turn queue managed by `src/core/battle/turn-manager.ts`
- Once each trainer has pending action, queue resolves turn, swaps active combatants when required
- Immediately sends next "Your Move" DM to both players
- Ensures ongoing battles keep moving without manual pinging in arena thread
- Failures to deliver DMs are best-effort and logged for observability work
- Handler will not block turn resolution if Discord API rejects delivery

---

### 9.3 Cache Safety

**As of 2025-11-09**, Engine Cache (L1 cache layer) implements comprehensive safety mechanisms to prevent corruption and protect against game crashes.

**Critical Safety Features:**

**1. Read-Only Data Protection**

**Private Fields**: All cache storage Maps are `private` and cannot be accessed directly:
```typescript
private pokemon: Map<number, PokemonCacheEntry> = new Map();
private moves: Map<number, MoveCacheEntry> = new Map();
private typeChart: Map<string, number> = new Map();
```

**Defensive Copies**: All getter methods return defensive copies to prevent external mutations:
```typescript
getPokemon(id: number): PokemonCacheEntry | null {
  const result = this.pokemon.get(id);
  if (result) {
    return { ...result, baseStats: { ...result.baseStats } };
  }
  return null;
}
```

**Controlled Writes**: Only two methods can modify cache data:
1. `initialize()` — Startup initialization (blocking, one-time)
2. `refresh()` — Background refresh (atomic swap via double-buffering)

Both methods are `private` and called only by EngineCache class itself.

**2. Corruption Detection**

**Data Checksum**: Simple hash calculated after every data modification (fingerprint: P:1328:1,2,3...|M:900:33,85...|T:324:1:2,1:3...). Fast hash, not cryptographic, just corruption detection.

**Integrity Verification**: Comprehensive checks run periodically:
```typescript
verifyIntegrity(): boolean {
  // Check 1: Maps not empty if initialized
  // Check 2: Secondary indexes match primary maps
  // Check 3: Data structure sanity (IDs match keys)
}
```

**Automatic Detection**: Integrity checks run before/after every background refresh (hourly) + on-demand via `verifyIntegrity()`.

**3. Corruption Response**

**Refuse Reads**: If corruption detected, all getters return safe defaults:
```typescript
getPokemon(id: number): PokemonCacheEntry | null {
  if (this.corruptionDetected) {
    log('error', 'Cache corruption detected, refusing read');
    return null; // Safe: Battle engine handles null gracefully
  }
  // ... normal read
}
```

**Block Refresh**: Corrupted cache won't be refreshed (prevents cascading corruption). Manual intervention required.

**Observability**: Corruption status exposed via `/ops engine` command (isHealthy, corruptionDetected, dataChecksum).

**4. Atomic Updates (Double-Buffering)**

**Non-Blocking Refresh**: Background refresh builds new cache without affecting ongoing battles:
```typescript
async refresh(): Promise<void> {
  // Step 1: Build new Maps (doesn't touch current cache)
  const newPokemon = new Map();
  const newMoves = new Map();
  // ... load data into new Maps ...
  
  // Step 2: Atomic swap (battles see old OR new, never partial)
  this.pokemon = newPokemon;
  this.moves = newMoves;
  // Old Maps garbage collected automatically
}
```

**Race Condition Protection**: Refresh flag prevents concurrent refreshes (`isRefreshing` boolean guard).

**What This Prevents:**

✅ **Prevented Scenarios:**
1. External Mutation — Battle engine receives defensive copies, modifications don't affect cache
2. Concurrent Writes — Only refresh() can write, protected by `isRefreshing` flag
3. Partial Updates — Atomic swap ensures battles never see half-updated cache
4. Cascading Corruption — Corrupted cache won't be refreshed, preventing propagation
5. Silent Failures — Corruption detection logs errors and returns safe defaults

⚠️ **Attack Vectors Still Possible (But Mitigated):**
1. Memory Pressure — OS could kill process if cache grows too large (Mitigation: Memory usage tracked, 20MB target enforced)
2. Malicious Code — Another module with access to `engineCache` object (Mitigation: Private fields, no public setters, defensive copies; TypeScript/JavaScript cannot prevent prototype pollution from determined attacker)
3. Logic Bugs — Bug in refresh() could load invalid data (Mitigation: Integrity checks detect structural issues, checksum detects unexpected changes)

**Emergency Recovery:**
- Automatic: Cache refuses reads, returns safe defaults (null/neutral)
- Manual: Restart application to re-initialize cache from Read-DB
- Debug: Check logs for corruption detection messages with context

**Performance Impact:**
- Defensive Copies: ~2-5μs overhead per read (still <10μs target)
- Corruption Checks: ~50-100μs every hour (negligible)
- Checksum Update: ~10-20μs after refresh (one-time)
- **Net Impact**: <1% performance overhead for significant safety improvement

**Contract (Absolute)**: Engine Cache data MUST NOT be modified by any code outside `engine-cache.ts`. Violations will cause game crashes and unpredictable battle outcomes.

**Enforcement**: TypeScript private fields + defensive copies + corruption detection + periodic integrity checks.

---

### 9.4 DB Replication

**As of 2025-11-09**, Engine DB implements production-ready 3-tier caching with write buffering, background workers, and comprehensive monitoring. Phase 17-22 delivered 4,416 lines with 0 build errors and 10-100x performance improvements.

**Architecture**: PROD → L1 Cache (Map) → Read-DB (SQLite) → Game Engine → Write Buffer → Write-DB (SQLite) → Validator → PROD

**Purpose**: Provide ultra-fast local lookups (<1μs L1, ~50ms SQLite vs 50-100ms PostgreSQL), enable offline gameplay, validate data quality before PROD upload, capture battle outcomes for analysis.

**Runtime Principle**: Game engine operates on fast in-memory cache (L1). Read-DB/Write-DB synchronization happens asynchronously in background workers. Battles never block on disk I/O or replication.

**Completed Implementation (4,416 lines):**

**1. Engine Cache (L1 In-Memory)** — `src/services/engine-cache.ts` (661 lines)
- API: `getPokemon(id)`, `getPokemonByName(name)`, `getMove(id)`, `getTypeEffectiveness(attack, defense)`, `getStats()`
- Data structures: `pokemon` Map (by ID), `pokemonByName` Map (secondary index), `moves` Map, `typeChart` Map
- Performance: <1μs read latency, 20 MB memory, 10M+ ops/sec throughput
- Refresh: Hourly background refresh with double-buffering (atomic swap)
- Integration: `src/data/dexpack.js` uses cache-first lookup pattern
- Safety: Defensive copies, corruption detection, automatic integrity checks

**2. Write Buffer (In-Memory Queues)** — `src/services/engine-write-buffer.ts` (476 lines)
- API: `logBattle(entry)`, `logMoveUsage(entry)`, `logAnomaly(entry)`, `flush()`, `getStats()`
- Data structures: `battleLogQueue[]`, `moveUsageQueue[]`, `anomalyQueue[]` (arrays)
- Performance: <10μs push latency, 10k entries per queue max
- Backpressure: 75% warn, 95% reject, <50% deactivate
- Flush: Every 30s (atomic splice), calls Write-DB insert methods
- Integration: `src/commands/battle-turn.js` logs move usage + battle completion

**3. Background Workers (4 Workers)** — `src/workers/engine-workers.ts` (655 lines)
- Worker 1: CacheRefreshWorker (hourly, +5s stagger) — Calls `engineCache['refresh']()`
- Worker 2: BufferFlushWorker (30s, +10s stagger) — Calls `engineWriteBuffer.flush()`
- Worker 3: ReadDbSyncWorker (daily, Render cron) — Placeholder with `recordExecution()` API
- Worker 4: WriteDbValidatorWorker (10min, +15s stagger) — `validateData()` → `uploadToProd()` → `pruneOldEntries()`
- Orchestration: `startEngineWorkers()`, `stopEngineWorkers()`, `getEngineWorkersStatus()`
- Error isolation: Each worker has try-catch, failures don't cascade

**4. Read-DB (SQLite)** — `src/services/engine-read-db.ts` (470 lines)
- Schema: `pokemon`, `moves`, `type_effectiveness`, `engine_read_version` (4 tables, 7 indexes)
- API: `getAllPokemon()`, `getAllMoves()`, `getAllTypeEffectiveness()`, `getVersion()`, `getStats()`
- SQLite config: WAL mode, NORMAL synchronous, cache_size from config, busy_timeout 5000ms
- Integration: L1 cache loads from this at startup and hourly refresh

**5. Write-DB (SQLite with WAL)** — `src/services/engine-write-db.ts` (697 lines)
- Schema: `battle_logs`, `move_usage`, `anomalies`, `write_ahead_log` (4 tables, 7 indexes)
- API: `insertBattleLogs()`, `insertMoveUsage()`, `insertAnomalies()`, `validateData()`, `uploadToProd()`, `pruneOldEntries()`, `replayWAL()`, `getStats()`
- WAL: `appendToWAL()` with SHA-256 checksum, `replayWAL()` with corruption detection
- Auto-save: Every 30s (sql.js in-memory → disk)
- Validation: Quality score calculation (passedRows / validatedRows), 95% threshold
- Retention: 24h after upload, VACUUM after pruning

**6. Centralized Config** — `src/config/engine-db-config.ts` (558 lines)
- Environment detection: `IS_PRODUCTION`, `IS_TEST`
- Storage paths: `/Store/` (prod), `Store/` (local), `Store/test/` (test)
- Memory limits: 20 MB L1 cache, 10k queue size
- Feature flags: `L1_CACHE_ENABLED`, `WRITE_BUFFER_ENABLED`, `WORKERS_ENABLED`, `VALIDATION_ENABLED`
- Validation: `validateEngineDbConfig()` function ensures safe runtime

**Integration Points (310 lines):**

**Startup/Shutdown Lifecycle** — `src/index.ts` (+140 lines)
- Initialization (7 steps): validateConfig → Read-DB init → L1 cache load (blocking) → Write-DB init → WAL replay → workers start → `global.engineReady = true`
- Shutdown (6 steps): mark not ready → stop workers → flush buffer (emergency) → save Write-DB → close Read-DB → cleanup cache
- Telemetry: `updateEngineSection()` shows cache hit rate, buffer utilization, database stats, worker errors

**Cache Integration** — `src/data/dexpack.js` (+80 lines)
- `getSpecies()` tries `engineCache` first (by ID → by name → fallback to dexpack)
- Performance: <1μs cache hits, 0.1-1ms dexpack fallback
- Metrics: Cache hits/misses recorded in dex metrics system

**Buffer Integration** — `src/commands/battle-turn.js` (+70 lines)
- After `resolveTurn()`, logs move usage (both sides) + battle completion (on KO)
- Performance: <10μs per log call, zero impact on battle execution
- Graceful degradation: Backpressure errors caught, battles continue normally

**Operations & Monitoring**: `/ops engine` command displays L1 Cache (hit rate, memory, entries, latency), Write Buffer (utilization, queues, backpressure), Workers (4 workers with status), Read-DB (counts, size), Write-DB (counts, WAL size, oldest entry).

**Performance Metrics:**
- L1 Cache: <1μs read latency (10-100x faster than SQLite)
- Write Buffer: <10μs push latency (non-blocking battle flow)
- Read-DB: ~50ms query latency (cached in L1 after first access)
- Write-DB: WAL ensures durability with <5ms append overhead
- **Overall: 10-100x performance improvement over remote PostgreSQL queries**

**Quality Metrics:**
- Build Status: ✅ 0 errors, 0 warnings throughout implementation
- Integration: ✅ All 5 integration points operational
- Documentation: ✅ Comprehensive ROUTER.md updates (services, workers, config)
- Testing: ⏳ Unit tests planned (Task 9) — cache, buffer, workers, read-db, write-db

**Implementation Status:**
- ✅ Phase 17 (COMPLETE): Engine Read-DB foundation, PROD → Read sync
- ✅ Phase 18 (COMPLETE): Engine Write-DB foundation, logging operations
- ✅ Phase 19 (COMPLETE): Integrity scanner with validation rules
- ✅ Phase 20 (COMPLETE): Write-DB → PROD sync with PROD schema migration placeholder
- ✅ Phase 21 (COMPLETE): Battle engine integration (cache → dexpack, buffer → battle-turn)
- ✅ Phase 22 (COMPLETE): Monitoring, automation, `/ops engine` command

**Next Steps:**
- Task 9 (READY): Unit tests for all 6 services + integration points (80%+ coverage target)
- Phase 23+ (READY): PROD schema migration for battle logs, upload automation, retention policies

---

### 9.5 DB Persistence Roadmap

**Status**: Analysis — Opportunities to migrate from sql.js (in-memory) to better-sqlite3 (native SQLite) for 78% memory reduction and disk-backed operations.

**Current State**: Hybrid In-Memory + Disk Architecture
- Read-DB (`/Store/engine-read.db`) — Static Pokemon data, loaded at startup, saved after PROD sync
- Write-DB (`/Store/engine-write.db`) — Battle logs, auto-saved every 30s
- WAL (`/Store/engine-write.wal`) — Crash recovery log
- **Problem**: sql.js operates entirely in-memory, requiring 20 MB L1 cache + Write-DB in-memory (up to 15 MB) + manual `db.export()` + `fs.writeFile()` every 30s (slow, blocking)

**Opportunity**: Migrate to better-sqlite3 for:
- ✅ True disk-backed operations (no manual persistence)
- ✅ 70% memory reduction (20 MB → 6 MB L1 cache via lazy loading)
- ✅ Crash-safe writes (WAL mode built-in, no manual recovery)
- ✅ Faster queries (native C++ vs JavaScript)
- ✅ Additional databases without memory penalty

**Migration Plan: sql.js → better-sqlite3**

**Phase 1**: Install better-sqlite3 (`npm install better-sqlite3`)

**Phase 2**: Create adapter layer (dual support for both backends)

**Phase 3**: Migrate Read-DB (low risk, read-only, large memory savings 10 MB → 0 MB)

**Phase 4**: Migrate Write-DB (medium risk, writes critical, auto-save logic changes, WAL replay changes)

**Phase 5**: Implement LRU Cache (low risk, depends on better-sqlite3 disk fallback, requires performance tuning)

**Expected Outcomes:**

**Memory Savings:**
- Read-DB: 10 MB (in-memory) → 0 MB (disk-backed) — **100% reduction**
- Write-DB: 20 MB (in-memory) → 5 MB (active pages) — **75% reduction**
- L1 Cache: 20 MB (all Pokemon) → 6 MB (LRU 500) — **70% reduction**
- **Total: 50 MB → 11 MB (78% reduction)**

**Performance Improvements:**
- Startup (cold): 1000ms → 50ms — **20x faster**
- Startup (warm): 1000ms → 5ms — **200x faster**
- Single query: 0.5ms → 0.05ms — **10x faster**
- Bulk insert: 500ms → 50ms — **10x faster**
- Auto-save: 100ms (blocking) → 0ms (async) — **∞x faster**

**Additional Databases (Zero Memory Cost):**
1. Trainer Analytics DB — Leaderboards, stats, achievements (0 MB memory)
2. Move Effectiveness Cache DB — Pre-computed damage multipliers (0 MB memory)
3. Battle Replay DB — Full turn-by-turn states for debugging (0 MB memory)
4. Rate Limiting DB — Persistent rate limits across restarts (0 MB memory)

**Risks & Mitigation:**
1. better-sqlite3 requires native compilation (Render supports via build hooks)
2. Queries may be slower (disk I/O) — Mitigated by OS page cache + LRU cache + memory-mapped I/O
3. WAL mode requires disk space — Mitigated by auto-checkpoint every 1000 pages + monitoring
4. Migration complexity — Mitigated by phased rollout + feature flags + rollback plan

**Recommendation**: Proceed with migration as Week 8-11 optimization initiative following console log cleanup and profile creation optimization.

---

### 9.6 Event Tracking

**Created**: 2025-11-06 — Complete event tracking schema for Infinity Gauntlet. Every user interaction, system event, and gameplay action is tracked through `UserEvent` table with typed JSON payloads.

**Event Categories:**

| Category | Description | Example Types | Retention |
| --- | --- | --- | --- |
| **gameplay** | Core game actions | battle.won, pokemon.caught, evolution.triggered | Indefinite |
| **engagement** | User engagement metrics | login, daily_quest.completed, achievement.unlocked | 90 days |
| **economy** | Virtual currency transactions | coins.earned, coins.spent, item.purchased | 1 year |
| **social** | Social interactions | friend.added, profile.updated, message.sent | 90 days |
| **system** | System events & errors | error.occurred, performance.slow_query | 30 days (info), 1 year (error/critical) |
| **admin** | Administrative actions | user.banned, content.moderated | Indefinite |

**Event Severity Levels:**

| Severity | Use Case | Retention | Examples |
| --- | --- | --- | --- |
| **info** | Normal operations | 30 days | login, pokemon.caught |
| **warning** | Noteworthy but not errors | 90 days | rate_limit.approached, cache.miss |
| **error** | Recoverable errors | 1 year | battle.timeout, api.error |
| **critical** | System failures | Indefinite | database.connection_lost, payment.failed |

**Key Event Schemas:**

**Gameplay Events:**
- `battle.started` — battleId, opponentId, ruleset, arenaThreadId
- `battle.won/lost` — battleId, opponentId, turns, duration_ms, pokemon_fainted, experience_gained, coins_earned
- `pokemon.caught` — pokemonId, speciesId, speciesName, level, isShiny, encounterId, catchMethod, attempts
- `pokemon.evolved` — pokemonId, fromSpeciesId, toSpeciesId, level, trigger
- `encounter.spawned` — encounterId, speciesId, speciesName, level, isShiny, spawnLocation, expiresAt

**Privacy & PII Handling:**
- IP addresses always hashed before storage (SHA-256 with daily rotating salt)
- Never store email in events, use userId only
- Data retention by category and severity (30 days to indefinite)

**Event Batching Strategy:**
- Max batch size: 100 events
- Max batch delay: 5000ms
- Critical events bypass batching (immediate flush)
- In-memory buffer before batch insert

**Query Patterns:**
- User Activity Timeline (last 7 days gameplay)
- Achievement Progress Tracking
- Error Rate Monitoring (last 24 hours)
- Top Active Users (event count, sessions, first/last activity)

---

### 9.7 Dex V2

**DEX v2** — High-Availability, Fast Pokédex Model and Day-One Database Blueprint combining high-performance Pokédex model with pragmatic day-one database plan.

**North-Star Principles:**
- **Immutable facts, mutable links** — Core reference data (Pokédex, moves, type chart) is read-only and versioned
- **Tenant-first keys** — Every gameplay row includes `tenant_id` (Discord guild/app id)
- **Time-sortable IDs** — Prefer ULIDs for chronology
- **Short, observable write paths** — Append-only where possible
- **Migrations are code** — Every schema change reversible, reviewed, tested

**Goals:**
- Instant lookups (no blocking I/O or ad-hoc parsing on hot path)
- Deterministic packs: content-addressed, signed, verified at boot
- Side-by-side rollout using feature flags; zero-downtime cutover with fast rollback
- Operational simplicity: single artifact with explicit invariants

**Architecture Overview (DEX v2):**

**Build Time:**
1. Aggregate sources → normalize → validate invariants
2. Generate binary slab `dexpack.v2.<SHA256>.bin` plus minimal perfect hash (MPH) map for name/alias → id resolution
3. Emit TypeScript accessors (codegen) with fixed offsets and integer tables (types, learnset bitsets)
4. Produce manifest `dexpack.v2.json` (hash, upstream SHAs, schema version)
5. Sign artifact using Ed25519

**Runtime:**
- Map read-only binary slab and expose typed-array views
- Verify hash and signature; on failure, refuse v2 and auto-fallback to v1
- Command handlers route through feature flag `DEX_V2_ENABLED` (supports per-guild canaries)

**Data Layout (Binary Slab, Structure-Of-Arrays):**
```
Header { magic "DEX2", schemaVersion u16, gen u8, sections: offsets & lengths }
Sections:
- species.soA: baseStats[u16][N][6], types[u8][N][2], abilities[u16][N][3], catchRate[u8][N]
- learnsets.bitset: bitset[N][ceil(M/8)] where M = total moves
- moves.tuples: [power u16, accuracy u8, type u8, priority i8, flags u16] x M
- types.table: 19x19 u8 multipliers encoded {0,5,10,20}
- names.aliases: utf8Blob + offsets[u32] + ids[u16]
- mph: arrays required for minimal perfect hash lookup
- text.offsets: flavorUtf8Blob + start/end[u32] per species
```

**Generated Accessor API:**
```typescript
export function idByNameOrAlias(q: string): number | -1;     // MPH → id
export function baseHP(id: number): number;                   // u16
export function typesOf(id: number): [number, number];        // u8, u8
export function hasMove(id: number, moveId: number): boolean; // bit test
export function moveInfo(moveId: number): MoveTuple;
export function typeMultiplier(attacking: number, defending: number): number; // 0|5|10|20
export function flavorText(id: number): string;               // slice from blob
export const META: { schema: 2; gen: number; hash: string };
```

**Performance SLO**: p50 ≤ 50 µs, p95 ≤ 200 µs, p99 ≤ 500 µs on c5.large-class nodes.

**Security**: Ed25519 signature verified at boot; public key in repo, private key in CI secrets. Loader refuses unsigned or mismatched packs.

**Migration Path:**
1. Land v2 alongside v1
2. Compatibility layer keeps old accessor signatures, dispatches to v2 under flag
3. Enable 100% in DEV; run regression plus perf verification
4. Canary in PROD; ramp in stages if green
5. Remove v1 code in later, separate PR

**High-Availability Rollout Plan:**
- DEV enable: Tue, Nov 4, 2025, 11:00–11:30 ET
- PROD canary and ramp: Wed, Nov 5, 2025, 02:00–03:00 ET
- Reserved maintenance: Thu, Nov 6, 2025, 02:00–02:15 ET
- Backups: Pre-cutover `pg_dump -Fc` for DEV/PROD; retain 14 days
- Rollback: ≤ 10 minutes (flip `DEX_V2_ENABLED=false`, redeploy LKG image if necessary)

**Day-One Database Blueprint (v0.1):**
- Tables: tenants, users, trainers, dex_packs, trainer_settings, mons, parties, encounters, battles, items, inventories, audit_log
- Indexes: tenant_id, trainer_id, started_at DESC, at DESC
- Versioning: Repository `schema_ver` integer; every migration bumps it
- Seeds: Golden tenant/trainer/party dataset for smoke tests
- Backups: Nightly PITR to object storage; monthly restore rehearsal (RPO 15 min, RTO 30 min)
- Constraints: FKs, CHECKs, UNIQUEs keep bad states unrepresentable
- Roles: `app_rw`, `migrate`, `ro` with least privilege
- Retention: Audit rows hot for 30 days, then archive
- Observability: DB op metrics, latency histograms, error rates by constraint, spans tagged with `tenant_id`, `pack_hash`, `schema_ver`

---

## Section 10: Discord Bot

### 10.1 Command Suite

**Admin Commands** (Administrator permission required):

- **`/ops stats`** — Usage statistics across all systems (users, encounters, battles, cache hits, database queries). Options: `--verbose` (detailed stats), `--json` (machine-readable), `--history` (7-day trend). Response time: 50-200ms.

- **`/ops state`** — Security bot operational state (sweeps run, alerts sent, permission changes, per-guild monitoring status, restart history). Options: `--timeline` (rolling event window), `--guilds` (per-guild stats). Response time: 50-150ms.

- **`/ops memory`** — Memory profiling dashboard (heap usage, L1 cache, write buffer, database connections, worker memory, leak detection). Options: `--verbose` (detailed breakdown), `--json` (export), `--history` (24h trend). Response time: 100-300ms.

- **`/ops cache`** — Cache metrics and maintenance (hit/miss ratios, eviction rates, disk usage, namespaces, maintenance status). Options: `--cleanup` (manual sweep), `--detailed` (namespace breakdown). Response time: 50-150ms.

- **`/ops engine`** — Engine DB dashboard (L1 cache stats, write buffer utilization, worker status, Read-DB/Write-DB metrics, WAL size, oldest entry). Options: `--workers` (worker details), `--detailed` (full breakdown). Response time: 100-200ms.

- **`/ops errors`** — Error detection dashboard (recent errors by severity/category/fingerprint, resolution status, alert history, error trends). Options: `--severity <level>` (filter), `--category <name>` (filter), `--since <duration>` (time window), `--export` (JSON), `--fingerprint <id>` (specific error). Response time: 100-300ms.

- **`/ops cooldown reset`** — Reset user command cooldowns (admin override for testing/support). Options: `--user <id>` (target), `--confirm` (required). Response time: 50-100ms.

**Regular Commands** (All users):

- **`/battle`** — Initiate wild Pokémon battle (encounter + battle flow).
- **`/starter`** — Choose starter Pokémon (first-time setup).
- **`/walk`** — Explore and encounter wild Pokémon.
- **`/party`** — View and manage party lineup (6 Pokémon max).
- **`/box`** — Access Pokémon storage (unlimited).
- **`/heal`** — Restore party HP at Pokémon Center.
- **`/dex`** — Pokédex lookup (species info, stats, moves, evolutions).
- **`/move`** — Move database search (power, type, accuracy, effects).
- **`/weak`** — Type effectiveness calculator.
- **`/calc`** — Damage calculator (attacker, defender, move).
- **`/profile`** — View trainer profile (stats, badges, achievements) with pagination (◀️ ▶️ buttons for multi-page profiles).
- **`/daily`** — Daily login rewards.
- **`/help`** — Command reference guide.
- **`/ping`** — Bot latency check.
- **`/version`** — Build info and last deployed.

**Monitoring Scenarios**:

1. **Quick Health Check**: `/ops stats` → `/ops state` → `/ops cache` (2-3 minutes, 150-500ms total)
2. **Memory Investigation**: `/ops memory --verbose` → `/ops cache --detailed` → `/ops engine --workers` (5 minutes, 300-700ms)
3. **Security Audit**: `/ops state --timeline --guilds` → Check sweep logs (3 minutes, 150ms)
4. **Performance Analysis**: `/ops stats --history` → `/ops cache` → `/ops engine` (4 minutes, 300-500ms)
5. **Error Investigation**: `/ops errors --severity critical` → `/ops errors --fingerprint <id>` → Check logs (5 minutes, 200-600ms)
6. **Guild Sweep Status**: `/ops state --guilds` → Review monitoring status per guild (2 minutes, 150ms)
7. **Full Diagnostic**: All `/ops` commands with `--verbose` (10 minutes, 800ms+)

**Tips & Best Practices**:
- Admin commands require `Administrator` permission (enforced by Discord + bot checks)
- Use `--json` flags for automation/scripting
- Response times assume healthy database connections (50-100ms Render latency)
- Cache cleanup via `/ops cache --cleanup` runs synchronously (may take 1-2 seconds)
- Error fingerprints are SHA-256 hashes (use `/ops errors` to find IDs before drilling down)
- Memory profiling captures snapshot at execution time (run multiple times for trend analysis)

### 10.2 DM Implementation Guide

**Discord Client Setup**:

```typescript
import { Client, GatewayIntentBits, Partials } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent, // Privileged intent required
  ],
  partials: [
    Partials.Channel, // Required for DM support
    Partials.Message, // Required for DM support
  ],
});
```

**DM Admin Router Architecture**:

```
DM Received → isDmCommand() → isAuthorizedDmAdmin() → checkRateLimit() 
→ parseDmCommand() → executeDmCommand() → formatResponse()
```

**Environment Configuration**:

```bash
DM_ADMIN_ENABLED=true                # Feature flag
DM_ADMIN_PREFIX=!ops                 # Command prefix
DM_ADMIN_RATE_LIMIT=10               # Commands per minute
DRIP_ALERT_RECIPIENT=<user_id>      # Authorized admin user ID
```

**DM Auth Helpers**:

```typescript
function isAuthorizedDmAdmin(userId: string): boolean {
  const authorizedUsers = [process.env.DRIP_ALERT_RECIPIENT];
  return authorizedUsers.includes(userId);
}

function isDmCommand(message: Message): boolean {
  return message.channel.type === ChannelType.DM 
    && message.content.startsWith(process.env.DM_ADMIN_PREFIX || '!ops');
}
```

**Rate Limiting** (In-Memory Map):

```typescript
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, limit: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(userId);
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}
```

**DM Command Parsing**:

```typescript
function parseDmCommand(content: string): { command: string; args: string[]; flags: Record<string, string> } {
  const parts = content.slice(process.env.DM_ADMIN_PREFIX!.length).trim().split(/\s+/);
  const command = parts[0];
  const args: string[] = [];
  const flags: Record<string, string> = {};
  
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith('--')) {
      const flagName = parts[i].slice(2);
      const flagValue = parts[i + 1] && !parts[i + 1].startsWith('--') ? parts[i + 1] : 'true';
      flags[flagName] = flagValue;
      if (flagValue !== 'true') i++;
    } else {
      args.push(parts[i]);
    }
  }
  
  return { command, args, flags };
}
```

**Stats Models** (Prisma):

```prisma
model User {
  id         String   @id
  username   String
  encounters Encounter[]
  battles    Battle[]
  createdAt  DateTime @default(now())
}

model Encounter {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  speciesId Int
  outcome   String   // 'caught' | 'fled' | 'defeated'
  createdAt DateTime @default(now())
}

model Battle {
  id           String              @id @default(uuid())
  createdAt    DateTime            @default(now())
  status       String              // 'in_progress' | 'completed'
  participants BattleParticipant[]
}

model BattleParticipant {
  id       String @id @default(uuid())
  battleId String
  battle   Battle @relation(fields: [battleId], references: [id])
  userId   String
  user     User   @relation(fields: [userId], references: [id])
  isWinner Boolean?
}
```

**Stats Query Helpers**:

```typescript
async function getOpsStats() {
  const [userCount, encounterCount, battleCount, recentBattles] = await Promise.all([
    prisma.user.count(),
    prisma.encounter.count(),
    prisma.battle.count(),
    prisma.battle.findMany({
      where: { status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { participants: { include: { user: true } } },
    }),
  ]);
  
  return { userCount, encounterCount, battleCount, recentBattles };
}

async function getRecentBattles(limit: number = 10, userId?: string) {
  return prisma.battle.findMany({
    where: userId ? { participants: { some: { userId } } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 50), // Clamp to 50 max
    include: { participants: { include: { user: true } } },
  });
}
```

**Stats Embed Formatter**:

```typescript
import { EmbedBuilder } from 'discord.js';

function formatStatsEmbed(stats: ReturnType<typeof getOpsStats>) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Bot Statistics')
    .setColor(0x5865F2)
    .addFields(
      { name: '👥 Total Users', value: stats.userCount.toString(), inline: true },
      { name: '🌿 Total Encounters', value: stats.encounterCount.toString(), inline: true },
      { name: '⚔️ Total Battles', value: stats.battleCount.toString(), inline: true },
    )
    .setTimestamp();
  
  if (stats.recentBattles.length > 0) {
    const recentBattlesList = stats.recentBattles
      .map(b => `Battle ${b.id.slice(0, 8)} - ${b.participants.length} participants`)
      .join('\n');
    embed.addFields({ name: '🕐 Recent Battles', value: recentBattlesList });
  }
  
  return embed;
}
```

**DM Command Handler** (Example: `!ops stats`):

```typescript
async function handleStatsCommand(message: Message, args: string[], flags: Record<string, string>) {
  const limit = parseInt(flags.limit || '10', 10);
  const clampedLimit = Math.max(1, Math.min(limit, 50));
  
  const stats = await getOpsStats();
  
  if (flags.json) {
    await message.reply(`\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\``);
  } else {
    const embed = formatStatsEmbed(stats);
    await message.reply({ embeds: [embed] });
  }
}
```

### 10.3 DM Admin Specification

**Feature Overview**:
- **Interface**: DM-only (private channel with bot)
- **Authentication**: Single-user (DripTVDD via `DRIP_ALERT_RECIPIENT`)
- **Command Format**: Text-based (`!ops <subcommand> [options]`)
- **Coverage**: 20+ admin commands across 7 categories
- **Responses**: Rich embeds, JSON export, confirmation prompts

**Command Syntax**: `!ops <subcommand> [options]` or `!admin <subcommand> [options]`

**Command Categories**:

1. **System Health** (5 commands):
   - `!ops stats` — Usage statistics (users, encounters, battles, cache, DB queries)
     - Options: `--verbose` (detailed), `--json` (export), `--history` (7-day trend)
   - `!ops memory` — Memory profiling (heap, cache, buffer, connections, workers, leaks)
     - Options: `--verbose`, `--json`, `--history` (24h trend)
   - `!ops state` — Security bot state (sweeps, alerts, changes, per-guild monitoring, restarts)
     - Options: `--timeline` (events), `--guilds` (per-guild)
   - `!ops cache` — Cache metrics (hit/miss, evictions, disk, namespaces, maintenance)
     - Options: `--cleanup` (manual sweep), `--detailed` (namespaces)
   - `!ops engine` — Engine DB dashboard (L1 cache, buffer, workers, Read-DB, Write-DB, WAL)
     - Options: `--workers` (details), `--detailed` (full)
   - `!ops errors` — Error detection (recent by severity/category/fingerprint, trends)
     - Options: `--severity <level>`, `--category <name>`, `--since <duration>`, `--export`, `--fingerprint <id>`

2. **User Management** (2 commands):
   - `!ops cooldown reset` — Reset user command cooldowns
     - Options: `--user <id>`, `--confirm` (required)
   - `!ops user <id>` — User profile and stats (future)

3. **Guild Management** (2 commands):
   - `!ops guild <id>` — Guild info and stats (future)
   - `!ops sweep <guild_id>` — Trigger manual security sweep (future)

4. **Service Control** (3 commands):
   - `!ops restart` — Restart bot service (future)
     - Options: `--confirm` (required)
   - `!ops logs` — View recent logs (future)
     - Options: `--lines <n>`, `--level <level>`, `--since <duration>`
   - `!ops deploy` — Trigger deployment (future)
     - Options: `--confirm` (required)

5. **Database Operations** (2 commands):
   - `!ops db query <sql>` — Execute read-only query (future)
     - Safety: Read-only enforced, no `UPDATE`/`DELETE`/`DROP`
   - `!ops db stats` — Database statistics (connections, queries, slow queries) (future)

6. **Monitoring & Alerts** (2 commands):
   - `!ops monitor start` — Start monitoring session (future)
     - Options: `--interval <ms>`, `--duration <ms>`
   - `!ops monitor stop` — Stop monitoring session (future)
   - `!ops alerts` — View recent alerts (future)

7. **Quick Actions** (3 commands):
   - `!ops ping` — Latency check
   - `!ops status` — Quick health summary (all systems)
   - `!ops help` — Command reference

**Enhanced Options** (All commands):
- `--verbose` — Detailed output with additional metrics
- `--json` — Machine-readable JSON export
- `--history` — Historical data (time window varies by command)
- `--export` — Save to file (for large datasets)
- `--confirm` — Required for destructive operations
- `--detailed` — Full breakdown (subsystem-specific)

**Implementation Plan** (6 Phases, 8-10 Weeks):

**Phase 1: Foundation** (1 week)
- DM detection and routing
- Auth check (`DRIP_ALERT_RECIPIENT`)
- Rate limiting (10/min default)
- Command parsing (`!ops <cmd> [--flags]`)
- Basic error handling

**Phase 2: Core Monitoring** (2 weeks)
- `!ops stats` (full implementation)
- `!ops memory` (full implementation)
- `!ops state` (full implementation)
- `!ops cache` (full implementation)
- `!ops engine` (full implementation)
- `!ops errors` (full implementation)

**Phase 3: User & Guild Management** (1 week)
- `!ops cooldown reset` (full implementation)
- `!ops user <id>` (profile lookup)
- `!ops guild <id>` (guild info)
- `!ops sweep <guild_id>` (manual sweep)

**Phase 4: Service Control** (2 weeks)
- `!ops restart` (service restart with confirmation)
- `!ops logs` (tail recent logs with filters)
- `!ops deploy` (trigger deployment with confirmation)

**Phase 5: Database Operations** (1 week)
- `!ops db query` (read-only SQL execution)
- `!ops db stats` (connection pool, query performance)

**Phase 6: Monitoring & Alerts** (1 week)
- `!ops monitor start/stop` (live monitoring sessions)
- `!ops alerts` (recent alert history)

**Priority**: Medium (Phase 26-27, ETA 1.5 months after Phase 25 complete)

**Safety Rules**:
- All database queries are **read-only** (enforced at query execution)
- Destructive operations require `--confirm` flag
- All DM commands logged to audit trail
- Rate limiting prevents abuse (10/min default, configurable)
- Single-user auth (expandable to RBAC in future)

### 10.4 DM Documentation Index

**Document Relationships**:

| Document | Role | Content |
|----------|------|---------|
| **DM-ADMIN-COMMAND-SUITE-SPEC.md** | **Spec (WHAT)** | Feature specification, command list, implementation phases, safety rules |
| **DM-ADMIN-IMPLEMENTATION-GUIDE.md** | **Implementation (HOW)** | Code structure, routing logic, database queries, embed formatting |
| **AI DM COMMAND SUITE GUIDANCE.md** | **Best Practices** | Discord.js patterns, Prisma queries, rate limiting, error handling |

**Implementation Workflow**:

1. **Review Spec** → Understand feature requirements, command syntax, safety rules
2. **Study Implementation** → Review code structure, routing, parsing, execution
3. **Reference Guidance** → Apply Discord.js best practices, optimize Prisma queries
4. **Begin Coding** → Implement foundation, add commands incrementally, test end-to-end

**Cross-Reference Map** (Command → Sections):

| Command | Spec Section | Implementation Section | Guidance Section |
|---------|--------------|------------------------|------------------|
| `!ops stats` | § 5.1.1 System Health | § 3.1 Stats Command | § 2.4 Stats Queries |
| `!ops memory` | § 5.1.2 System Health | § 3.2 Memory Command | § 2.5 Memory Profiling |
| `!ops state` | § 5.1.3 System Health | § 3.3 State Command | § 2.6 State Formatting |
| `!ops cache` | § 5.1.4 System Health | § 3.4 Cache Command | § 2.7 Cache Metrics |
| `!ops engine` | § 5.1.5 System Health | § 3.5 Engine Command | § 2.8 Engine Stats |
| `!ops errors` | § 5.1.6 System Health | § 3.6 Errors Command | § 2.9 Error Queries |
| `!ops cooldown reset` | § 5.2.1 User Management | § 3.7 Cooldown Command | § 2.10 User Lookup |
| `!ops user` | § 5.2.2 User Management | § 3.8 User Command | § 2.10 User Lookup |
| `!ops guild` | § 5.3.1 Guild Management | § 3.9 Guild Command | § 2.11 Guild Queries |
| `!ops sweep` | § 5.3.2 Guild Management | § 3.10 Sweep Command | § 2.12 Security Integration |
| `!ops restart` | § 5.4.1 Service Control | § 3.11 Restart Command | § 2.13 Process Control |
| `!ops logs` | § 5.4.2 Service Control | § 3.12 Logs Command | § 2.14 Log Streaming |
| `!ops deploy` | § 5.4.3 Service Control | § 3.13 Deploy Command | § 2.15 Render API |
| `!ops db query` | § 5.5.1 Database Ops | § 3.14 DB Query Command | § 2.16 Read-Only Queries |
| `!ops db stats` | § 5.5.2 Database Ops | § 3.15 DB Stats Command | § 2.17 Connection Pool |
| `!ops monitor` | § 5.6.1 Monitoring | § 3.16 Monitor Command | § 2.18 Live Sessions |
| `!ops alerts` | § 5.6.2 Monitoring | § 3.17 Alerts Command | § 2.19 Alert History |
| `!ops ping` | § 5.7.1 Quick Actions | § 3.18 Ping Command | § 2.1 DM Basics |
| `!ops status` | § 5.7.2 Quick Actions | § 3.19 Status Command | § 2.20 Health Checks |
| `!ops help` | § 5.7.3 Quick Actions | § 3.20 Help Command | § 2.2 Command Parsing |

**Architecture Patterns**:

**Auth Flow**:
```
DM → isDmCommand() → isAuthorizedDmAdmin() → checkRateLimit() 
→ parseDmCommand() → executeDmCommand()
```

**Command Dispatch**:
```typescript
switch (command) {
  case 'stats': return handleStatsCommand(message, args, flags);
  case 'memory': return handleMemoryCommand(message, args, flags);
  case 'state': return handleStateCommand(message, args, flags);
  // ...
}
```

**Data Query Pattern**:
```typescript
const [users, encounters, battles] = await Promise.all([
  prisma.user.count(),
  prisma.encounter.count(),
  prisma.battle.count(),
]);
```

**Testing Coverage**:

**Unit Tests**:
- Command parser (flags, args, edge cases)
- Rate limiter (window reset, multiple users)
- Auth checker (authorized/unauthorized users)

**Integration Tests**:
- End-to-end DM command execution
- Database queries (mocked Prisma)
- Embed formatting (Discord.js mocks)

**Environment Configuration**:

```bash
# Required for DM admin commands
DM_ADMIN_ENABLED=true                # Feature flag
DM_ADMIN_PREFIX=!ops                 # Command prefix
DM_ADMIN_RATE_LIMIT=10               # Commands per minute
DRIP_ALERT_RECIPIENT=<user_id>      # Authorized admin user ID
```

**Discord Developer Portal Setup**:

1. **Bot Permissions**: `Administrator` (or granular: `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`)
2. **Gateway Intents**: `Guilds`, `GuildMessages`, `DirectMessages`, `MessageContent` (privileged)
3. **Privileged Intent Approval**: Request `MessageContent` intent from Discord Developer Portal
4. **OAuth2 Scopes**: `bot`, `applications.commands`

**Success Metrics**:

- **Phase 1**: DM commands received and parsed successfully
- **Phase 2**: Core monitoring commands operational (`!ops stats`, `!ops memory`, `!ops state`, `!ops cache`, `!ops engine`, `!ops errors`)
- **Phase 6**: All 20+ commands operational, rate limiting enforced, audit logging active

**Known Limitations**:

- Single-user authentication (expandable to RBAC in future)
- In-memory rate limiting (resets on restart; consider Redis for persistence)
- No pagination for large datasets (implement in Phase 6+)
- No query timeouts (add in Database Operations phase)

**Future Enhancements**:

- Multi-user RBAC (roles: `OWNER`, `ADMIN`, `MODERATOR`, `VIEWER`)
- Persistent rate limiting (Redis backend)
- Interactive pagination (Discord buttons for large datasets)
- Query streaming (real-time results for long queries)
- Slash command equivalents (`/admin stats` alongside `!ops stats`)

**Support & Troubleshooting**:

| Issue | Solution |
|-------|----------|
| DM commands not received | Verify `DirectMessages` intent + `Partials.Channel` |
| Auth fails | Check `DRIP_ALERT_RECIPIENT` matches user ID |
| Rate limit too strict | Adjust `DM_ADMIN_RATE_LIMIT` (default 10/min) |
| Embed too large | Use `--json` flag or implement pagination |
| Query timeout | Add `PRISMA_QUERY_TIMEOUT_MS` environment variable |

---

## Section 11: Safety Guarantees

*(Content to be consolidated from `architecture/safety.md` in Phase 1 Week 3)*

**Placeholder**: Memory safety, error isolation, state persistence, disaster recovery, operational safeguards.

---

## Section 12: Observability

### 12.1 Metrics

*(Content to be consolidated from `architecture/metrics-transparency.md` in Phase 1 Week 3)*

**Placeholder**: Metrics transparency design, visibility principles, telemetry architecture.

### 12.2 Calculation Methods

*(Content to be consolidated from `metrics-calculation.md` in Phase 1 Week 3)*

**Placeholder**: Metrics calculation methods, formulas, aggregation strategies.

---

## Section 13: Performance

### 13.1 Optimization Roadmap

*(Content to be consolidated from `architecture/OPTIMIZATION-BIBLE.md` in Phase 1 Week 3)*

**Placeholder**: System-wide optimization plan, startup time, console logging, runtime weight, queries, cache.

### 13.2 Centralization

*(Content to be consolidated from `architecture/centralized-architecture-analysis.md` in Phase 1 Week 3)*

**Placeholder**: Centralized architecture analysis, code duplication elimination, shared utilities.

---

## Section 14: Future Roadmap

*(Content to be consolidated from `architecture/perfect-system-roadmap.md` in Phase 1 Week 3)*

**Placeholder**: System evolution vision, planned improvements, research areas, scalability targets.

---

**Estimated Size**: ~3000 lines (after Phase 1 consolidation)  
**Source Files**: 37 documents consolidated  
**Last Updated**: 2025-11-16 (template created)  
**Status**: Template ready for Phase 1 Week 3 consolidation
