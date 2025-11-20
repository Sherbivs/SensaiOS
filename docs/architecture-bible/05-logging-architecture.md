# Section 5: Logging Architecture

[← Back to INDEX](INDEX.md) | [Next: Error System →](06-error-system.md)

---

**Philosophy**: "Logs are not just debugging tools—they are the system's memory, the AI's training data, and the foundation for continuous improvement."

**Purpose**: Comprehensive, AI-optimized logging system with SSH accessibility, intelligent memory management, and automated insight generation.

## 5.1 Core Design

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

**Initialization Order Constraint (2025-11-17)**:

> **CRITICAL**: Event Bus (`src/shared/event-bus.ts`) must NOT import `logger.js` to avoid circular dependency.  
> **Dependency Chain**: `intelligent-logger.ts` constructor → `EventBus.subscribe()` → would call `log()` → accesses `LOG_LABEL` before initialization.  
> **Solution**: Event Bus uses direct `console.*()` calls for internal logging (subscribe, unsubscribe, backpressure, errors).  
> **Documented with**: `/* eslint-disable no-console */` at top of `event-bus.ts`.  
> **Why It Works**: Event Bus is low-level infrastructure that initializes before logger, avoiding the circular dependency.

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

## 5.2 Buffer Design

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
log.warn("High memory usage detected", { heapUsed: "1536MB" });

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

## 5.3 AI Integration

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

## 5.4 Scaling

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

## 5.5 Logger Auto-Refresh Runtime

**Logger Auto-Refresh** (`src/utils/logger.js`) — Continuous console stats dashboard with intelligent change detection, multi-source metrics aggregation, and automatic refresh management.

**Purpose**: Provide real-time visibility into system health (Node process, databases, cache, errors, security bot) via automatic console output refreshed every 15 seconds with change detection to avoid spamming identical stats.

### 5.5.1 Initialization Timing

**Boot Sequence Integration** — Logger auto-refresh starts **AFTER** Service Registry initialization to avoid race conditions with error tracker, engine cache, and engine write buffer services.

**Critical Timing Constraint** (Boot Phase 1):

```typescript
// src/index.ts lines 1178-1183
// Start logger auto-refresh AFTER services initialize to avoid race condition
// where logger tries to import error-tracker before Service Registry initializes
log.info("Starting logger auto-refresh...");
startLoggerAutoRefresh();
log.info("Logger auto-refresh started", {
  category: "SYSTEM",
  tags: ["observability", "auto-refresh"],
});
```

**Why Timing Matters**:
- **Problem**: Logger auto-refresh → `collectErrorStats()` → `import error-tracker` → Service Registry not ready → "degraded" warnings
- **Solution**: Defer `startAutoRefresh()` until after `registry.initializeAll()` completes (Phase 1)
- **Impact**: Eliminates false "degraded" warnings during first 10-20 seconds of boot
- **Validation**: Lines 1178-1183 explicitly comment this constraint

**Previously** (2025-11-17 before optimization):
- Auto-refresh started on module load (immediate `setInterval()` at import time)
- Caused 10-20s of "degraded" warnings for error-tracker, engine-cache, engine-write-buffer
- Required Service Registry to mark services "degraded" until ready, polluted console output

**Currently** (2025-11-17 after optimization):
- Auto-refresh deferred until explicit `startLoggerAutoRefresh()` call in `src/index.ts`
- Services initialize cleanly without premature status queries
- Logger waits for stable state before activating dashboard
- Zero false warnings on clean boot

See Section 16 (Boot Sequence) for complete initialization order documentation.

### 5.5.2 Refresh Interval & Change Detection

**Refresh Interval** — 15 seconds (`REFRESH_INTERVAL_MS = 15_000`), strikes balance between real-time visibility and console noise.

**Stats Refresh Flow**:

```javascript
// src/utils/logger.js lines 1104-1120
function startAutoRefresh() {
  if (logIntervalHandle) return; // Already running
  
  // Initial stats collection and print (fire-and-forget)
  refreshStats()
    .then(() => printStats())
    .catch(err => console.warn('[logger] Initial stats failed:', err.message));
  
  // Set up interval with error handling
  logIntervalHandle = setInterval(() => {
    printStats().catch(err => console.warn('[logger] Stats refresh failed:', err.message));
  }, REFRESH_INTERVAL_MS);
  
  // Allow process to exit even if interval is active (unref timer)
  if (logIntervalHandle.unref) {
    logIntervalHandle.unref();
  }
}
```

**Key Implementation Details**:
1. **Initial Print**: Immediate `refreshStats()` + `printStats()` on first call (show stats instantly)
2. **Interval Timer**: `setInterval()` with 15s period, fire-and-forget error handling
3. **Unref Timer**: `logIntervalHandle.unref()` allows process exit without blocking (graceful shutdown)
4. **Fire-and-Forget**: All async operations catch errors, never block interval

**Change Detection** — Intelligent deduplication prevents spamming identical stats to console.

**Change Detection Logic** (`hasSignificantChange()` function):

```javascript
// src/utils/logger.js lines 145-168
function hasSignificantChange(current, previous) {
  if (!previous) return true; // First run, always print
  
  // Check database status changes (updated for new structure)
  if (current.databases?.master?.status !== previous.databases?.master?.status) return true;
  if (current.databases?.engineRead?.status !== previous.databases?.engineRead?.status) return true;
  if (current.databases?.engineWrite?.status !== previous.databases?.engineWrite?.status) return true;
  
  // Check latency changes (>5ms difference)
  const currentMasterLatency = parseFloat(current.databases?.master?.latency) || 0;
  const previousMasterLatency = parseFloat(previous.databases?.master?.latency) || 0;
  if (Math.abs(currentMasterLatency - previousMasterLatency) > 5) return true; // LATENCY_CHANGE_THRESHOLD_MS
  
  // Check security bot status changes
  if (current.security?.status !== previous.security?.status) return true;
  
  // Check memory changes (>50MB difference to avoid noise)
  const currentRss = current.node?.memory?.rss || 0;
  const previousRss = previous.node?.memory?.rss || 0;
  if (Math.abs(currentRss - previousRss) > 50 * 1024 * 1024) return true; // 50 MB threshold
  
  return false; // No significant change, skip print
}
```

**What Triggers Re-Print**:
- **Database Status Change**: `online` → `degraded`, `degraded` → `offline`, etc.
- **Latency Spike**: Master database latency changes by >5ms (detects slowdowns)
- **Security Bot Change**: `online` → `offline`, `initializing` → `online`, etc.
- **Memory Pressure**: RSS memory changes by >50MB (detects leaks or GC cycles)
- **First Run**: No previous stats, always print initial state

**What Does NOT Trigger Re-Print**:
- Minor memory fluctuations (<50MB) — Avoids noise from normal GC cycles
- Small latency changes (<5ms) — Avoids noise from network jitter
- CPU changes — Too volatile, not actionable
- Cache size changes — Tracked by resource monitor alerts instead

**Memory Optimization** (2025-11-17):
- **Previous Behavior**: Deep clone entire stats object every 15s → 1-2 MB allocation/15s → 5 MB/min memory churn
- **Current Behavior**: Shallow reference only (`previousStats = statsCache`) → 0 allocation, pointer swap
- **Why It Works**: `hasSignificantChange()` only compares specific fields (status, latency, memory), doesn't need deep clone
- **Impact**: Eliminates 5 MB/min memory churn, reduces GC pressure

See lines 740-743 for memory optimization comments.

### 5.5.3 Metrics Collection Pipeline

**Multi-Source Metrics Aggregation** — Logger collects real-time metrics from 5 independent sources:

```
Resource Monitor → collectNodeStats()      → Node.js process (uptime, memory, CPU, PID, version)
Resource Monitor → collectCacheStats()     → Cache & disk usage (cache size, workspace limits, disk free)
Prisma Client   → collectDatabaseStats()   → Database health (master, engine-read, engine-write, on-premise)
Security Bot    → collectSecurityBotStats()→ Security bot status (guilds, sweeps, assignments, failures)
Error Tracker   → collectErrorStats()      → Error monitoring (top 10 errors, severity counts, error rate)
```

**Collection Flow** (`refreshStats()` function):

```javascript
// src/utils/logger.js lines 651-664
async function refreshStats() {
  const now = Date.now();
  if (now - statsCache.lastRefresh < REFRESH_INTERVAL_MS) {
    return; // Cache still fresh, skip refresh
  }
  
  // Collect all metrics in parallel (fire-and-forget, errors caught per-source)
  statsCache.node = collectNodeStats();                // Sync: ~0.5ms
  statsCache.cache = collectCacheStats();              // Sync: ~0.5ms
  statsCache.databases = await collectDatabaseStats(); // Async: 5-50ms (DB queries)
  statsCache.security = collectSecurityBotStats();     // Sync: ~1ms (file read)
  statsCache.errors = await collectErrorStats();       // Async: 5-20ms (error tracker query)
  statsCache.lastRefresh = now;
}
```

**Performance Characteristics**:
- **Total Latency**: 10-75ms typical (dominated by async DB queries and error tracker)
- **Node Stats**: <1ms (synchronous `process.memoryUsage()`, `process.cpuUsage()`, `process.uptime()`)
- **Cache Stats**: <1ms (synchronous `resourceMonitor.getMetrics()` call)
- **Database Stats**: 5-50ms (async Prisma queries, depends on DB latency)
- **Security Bot Stats**: <1ms (synchronous file read from `Store/security-bot-state/current.json`)
- **Error Stats**: 5-20ms (async error tracker query for last hour)

**Caching Strategy**:
- Stats cached for 15 seconds (`REFRESH_INTERVAL_MS`)
- Early return if `now - statsCache.lastRefresh < REFRESH_INTERVAL_MS` (skip redundant queries)
- Multiple `printStats()` calls within 15s reuse cached data (no re-query)
- Cache invalidated automatically after 15s, next `printStats()` triggers full refresh

### 5.5.4 Database Stats Collection

**Database Stats Provider** — Deferred initialization with Prisma-first fallback chain.

**Initialization Flow** (`initializeDatabaseStatsProvider()` function):

```javascript
// src/utils/logger.js lines 53-88
async function initializeDatabaseStatsProvider() {
  if (databaseStatsInitialized) return; // Already initialized
  databaseStatsInitialized = true;
  
  // Try Prisma first (primary database client)
  try {
    const prismaModule = await import('../shared/prisma.js');
    if (typeof prismaModule.getDatabaseStats === 'function') {
      getDatabaseStats = prismaModule.getDatabaseStats;
      databaseStatsProvider = 'prisma';
      console.info('[logger] Database stats provider: Prisma (primary)');
      return;
    }
  } catch {
    // Prisma not available, try fallback
  }
  
  // Fallback to pg-connection if Prisma unavailable
  try {
    const pgModule = await import('../shared/pg-connection.js');
    if (typeof pgModule.getDatabaseStats === 'function') {
      getDatabaseStats = pgModule.getDatabaseStats;
      databaseStatsProvider = 'pg-connection';
      console.info('[logger] Database stats provider: pg-connection (fallback)');
      return;
    }
  } catch {
    // Both providers unavailable
  }
  
  // If we get here, no provider is available
  console.warn('[logger] Database stats unavailable - both Prisma and pg-connection failed to load');
}
```

**Provider Priority**:
1. **Prisma** (primary) — `getDatabaseStats()` from `src/shared/prisma.js` (production default)
2. **pg-connection** (fallback) — `getDatabaseStats()` from `src/shared/pg-connection.js` (legacy compatibility)
3. **None** — Both failed to load, all database metrics show `<unavailable: no-provider>`

**Why Deferred Initialization**:
- Avoids top-level `await` at module import (would block all imports)
- Allows logger to load before database clients initialize
- Enables testing without database dependencies
- Graceful degradation when database unavailable

**Database Metrics Collected**:

```javascript
// src/utils/logger.js lines 235-320 (collectDatabaseStats function)
{
  master: {
    status: 'online',           // online | degraded | offline | initializing | not-connected
    latency: 12.34,             // ms (recent query time)
    latencyReason: null,        // <unavailable: reason> if latency null
    source: 'render-managed',   // render-managed | onpremise-dev | experiment
    sourceReason: null,         // <unavailable: reason> if source null
  },
  engineRead: {
    status: 'online',           // online | degraded | offline | initializing | not-connected
    latency: 0.42,              // ms (SQLite read latency)
    latencyReason: null,
    entries: 1025,              // Pokemon count in Read-DB
    entriesReason: null,
  },
  engineWrite: {
    status: 'online',           // online | degraded | offline | initializing | not-connected
    latency: 1.23,              // ms (SQLite write latency)
    latencyReason: null,
    entries: 8472,              // Battle log count in Write-DB
    entriesReason: null,
  },
  onPremiseDev: {               // Only visible on workstation (development)
    status: 'n/a',              // n/a (production) | online | offline
    latency: null,
    latencyReason: 'not-applicable',
    source: null,
    sourceReason: 'not-applicable',
  },
  onPremiseExperiment: {        // Only visible on workstation (testing)
    status: 'n/a',              // n/a (production) | online | offline
    latency: null,
    latencyReason: 'not-applicable',
    source: null,
    sourceReason: 'not-applicable',
  },
}
```

**Explicit Unavailability** — All null metrics include explicit reason via `formatMetric()` helper:

```javascript
// src/utils/logger.js lines 666-688
function formatMetric(value, reason, formatter = null) {
  if (value === null || value === undefined) {
    // Explicitly declare why metric cannot be queried
    return `<unavailable: ${reason || 'unknown'}>`;
  }
  
  // Apply formatter with error handling
  if (formatter) {
    try {
      return formatter(value);
    } catch {
      // Formatter failed (e.g., trying to call .toFixed() on non-number)
      return `<unavailable: formatter-error>`;
    }
  }
  
  return String(value);
}
```

**Unavailability Reasons** (`METRIC_UNAVAILABLE` constants):
- `not-queried-yet` — Provider not initialized yet
- `initializing` — Provider loading (first boot)
- `no-provider` — No stats provider available (Prisma and pg-connection both failed)
- `query-failed` — Stats query threw error
- `not-connected` — Database not connected
- `disabled` — Feature disabled
- `n/a` — Not applicable to this service (e.g., on-premise DBs in production)

See lines 43-51 for complete unavailability reason definitions.

### 5.5.5 Console Output Format

**Stats Dashboard Layout** — Comprehensive 5-section console output with ASCII borders and clear visual hierarchy.

**Output Structure** (`printStats()` function):

```
─────────────────────────────────────────────────────────────────────────

[NODE]
  Uptime: 2h 34m 12s
  Process: PID 42 | v20.10.0

  Memory:
    RSS:      342.56 MB
    Heap:     245.12 MB / 512.00 MB
    External: 12.34 MB

  CPU:
    User:   3.2%
    System: 1.8%

[CACHE & RESOURCES]
  Cache Directory: /Store/runtime-cache
  Cache Size: 15.23 MB / 20.00 MB (76.2%)
  Cache Free: 4.77 MB

  Workspace Limit: 1.00 GB
  Workspace Free:  845.67 MB

  Disk Total: 10.00 GB
  Disk Free:  8.23 GB

[DATABASE]
  MASTER  → ONLINE       | Latency: 12.34ms | render-managed
  LOCAL-R → ONLINE       | Latency: 0.42ms  | Pokemon: 1025
  LOCAL-W → ONLINE       | Latency: 1.23ms  | Battles: 8472

[SECURITY BOT]
  Status: online | Guilds: 5 | Last Sweep: 2m ago
  Assignments: 12 reverted | Failures: 0

[ERROR MONITORING]
  🚨 CRITICAL: 0 unique | ⚠️  HIGH: 2 unique | 📊 MEDIUM: 5 unique | 📝 LOW: 3 unique
  Total: 10 unique errors | 47 occurrences | Rate: 0.78/min

  Top Recent Errors:
    ⚠️  [HIGH] DatabaseTimeout (x5, 3m ago) | Recovery: 3/5
       → affecting: battles, encounters, profile-load
    📊 [MEDIUM] CacheEviction (x12, 1m ago)
    📊 [MEDIUM] RateLimitHit (x8, 5m ago)

  Top Categories: DATABASE (7), CACHE (5), API (3)

─────────────────────────────────────────────────────────────────────────
```

**Visual Hierarchy**:
- **Top Border**: `─` (ASCII dash, 73 chars) — Separates stats from surrounding console output
- **Section Headers**: `[SECTION_NAME]` in brackets — Clear section delineation
- **Metrics**: Indented 2 spaces — Visual grouping under sections
- **Subsections**: Additional 2-space indent — Nested metrics (e.g., Memory, CPU)
- **Bottom Border**: `─` (ASCII dash, 73 chars) — Clean closure

**Service-Specific Visibility** — Sections conditionally shown based on service type:

```javascript
// src/utils/logger.js lines 93-105
function detectServiceType() {
  const serviceName = process.env.RENDER_SERVICE_NAME || process.env.SERVICE_NAME || '';
  return {
    isSecurityBot: serviceName.includes('security'),
    isMainBot: serviceName.includes('bots') && !serviceName.includes('security'),
    isWorker: serviceName.includes('worker') || serviceName.includes('cache') || serviceName.includes('data-pipeline'),
    isWeb: serviceName.includes('web'),
    serviceName: serviceName || 'unknown',
  };
}
```

**Section Visibility Rules**:
- **[NODE]**: Always shown (all services)
- **[CACHE & RESOURCES]**: Always shown (all services)
- **[DATABASE]**: Always shown (all services)
- **[SECURITY BOT]**: Only shown on `isSecurityBot=true` (infinity-gauntlet-security worker)
- **[ERROR MONITORING]**: Only shown on services with error tracker (main bot, workers)

See lines 725-942 for complete `printStats()` implementation.

### 5.5.6 Error Stats Integration

**Error Monitoring Dashboard** — Top 10 recent errors with severity breakdown, occurrence counts, recovery tracking, and impacted features.

**Error Stats Collection** (`collectErrorStats()` function):

```javascript
// src/utils/logger.js lines 588-644
async function collectErrorStats() {
  try {
    // Dynamic import to avoid circular dependency
    const errorTrackerModule = await import('../services/monitoring/error-tracker.js');
    const { errorTracker } = errorTrackerModule;
    
    if (!errorTracker) {
      return {
        status: METRIC_UNAVAILABLE.NO_PROVIDER,
        recentErrors: [],
        summary: null,
      };
    }
    
    // Get stats for last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const stats = await errorTracker.getErrorStats(oneHourAgo);
    
    // Get top 10 recent errors (limit as first param, filters as second)
    const topErrors = await errorTracker.getRecentErrors(10, {
      since: oneHourAgo,
    });
    
    return {
      status: 'ready',
      summary: {
        totalUnique: stats.totalErrors,
        totalOccurrences: stats.totalOccurrences,
        criticalCount: stats.bySeverity.CRITICAL || 0,
        highCount: stats.bySeverity.HIGH || 0,
        mediumCount: stats.bySeverity.MEDIUM || 0,
        lowCount: stats.bySeverity.LOW || 0,
        errorRate: stats.errorRate,
        topCategories: stats.byCategory,
      },
      recentErrors: topErrors.map(err => ({
        severity: err.severity,
        category: err.category,
        name: err.errorName,
        message: err.errorMessage,
        count: err.occurrenceCount,
        lastSeen: err.lastSeen,
        impactedFeatures: err.impactedFeatures || [],
        recoveryAttempts: err.recoveryAttempts,
        recoverySuccesses: err.recoverySuccesses,
      })),
    };
    
  } catch (error) {
    // ErrorTracker not available or query failed
    return {
      status: METRIC_UNAVAILABLE.QUERY_FAILED,
      statusReason: error.message,
      recentErrors: [],
      summary: null,
    };
  }
}
```

**Error Dashboard Features**:
1. **Severity Breakdown**: CRITICAL/HIGH/MEDIUM/LOW counts (unique errors per severity)
2. **Occurrence Tracking**: Total occurrences vs unique errors (detect error storms)
3. **Error Rate**: Errors per minute (trend monitoring)
4. **Top Categories**: Most common error categories (DATABASE, CACHE, API, etc.)
5. **Recent Errors**: Top 10 errors with metadata (name, count, time since, recovery)
6. **Recovery Tracking**: `recoverySuccesses / recoveryAttempts` ratio (automatic recovery effectiveness)
7. **Impacted Features**: Features affected by each error (battles, encounters, profile-load, etc.)

**Console Output** (see lines 882-942 for implementation):

```
[ERROR MONITORING]
  🚨 CRITICAL: 0 unique | ⚠️  HIGH: 2 unique | 📊 MEDIUM: 5 unique | 📝 LOW: 3 unique
  Total: 10 unique errors | 47 occurrences | Rate: 0.78/min

  Top Recent Errors:
    ⚠️  [HIGH] DatabaseTimeout (x5, 3m ago) | Recovery: 3/5
       → affecting: battles, encounters, profile-load
    📊 [MEDIUM] CacheEviction (x12, 1m ago)
    📊 [MEDIUM] RateLimitHit (x8, 5m ago)
    📝 [LOW] DeprecationWarning (x2, 15m ago)

  Top Categories: DATABASE (7), CACHE (5), API (3)
```

**Why Dynamic Import**:
- Avoids circular dependency (logger ← error-tracker → logger)
- Allows logger to initialize before error tracker
- Graceful degradation when error tracker not available
- Fire-and-forget error handling (query failures don't crash logger)

See Section 6 (Error System) for complete error tracker architecture documentation.

### 5.5.7 Graceful Shutdown

**Shutdown Cleanup** — Logger auto-refresh stops cleanly during graceful shutdown.

**Shutdown Flow**:

```javascript
// src/utils/logger.js lines 1124-1130
function stopAutoRefresh() {
  if (logIntervalHandle) {
    clearInterval(logIntervalHandle);
    logIntervalHandle = null;
  }
}
```

**Integration with Graceful Shutdown** (see Section 16):

```typescript
// src/index.ts lines 991-1027 (Phase 2 cleanup)
async function performGracefulShutdown(reason: string, exitCode: number) {
  // ... Phase 1 critical saves ...
  
  // Phase 2: Service Cleanup (lines 1015-1027)
  try {
    // Stop background workers
    await stopEngineWorkers();
    await stopErrorLearningWorker();
    await stopOutboxWorker();
    stopAutoRefresh();  // ← Logger auto-refresh cleanup
    
    // Stop resource monitor
    await resourceMonitor.stop();
    
    // Shutdown Service Registry
    await registry.shutdownAll();
    
    // Drain Event Bus
    await eventBus.shutdown();
    
    // Close database connections
    await prisma.$disconnect();
  } catch (error) {
    console.error('Shutdown cleanup error:', error);
  }
  
  process.exit(exitCode);
}
```

**Shutdown Behavior**:
- **Timer Cleanup**: `clearInterval(logIntervalHandle)` stops 15s interval
- **Handle Reset**: `logIntervalHandle = null` allows restart if needed
- **No Final Print**: Shutdown doesn't trigger final stats print (avoid noise)
- **Unref Design**: Timer already unref'd, doesn't block process exit

**Why Unref Matters** (see lines 1116-1118):
- Without `unref()`: Process hangs waiting for interval to finish
- With `unref()`: Process can exit immediately, timer doesn't block
- Graceful shutdown can complete in <5s without waiting for 15s interval

### 5.5.8 Performance Metrics

**Logger Auto-Refresh Performance Impact**:

| Metric | Value | Notes |
| --- | --- | --- |
| **Refresh Interval** | 15 seconds | Balance between visibility and console noise |
| **Stats Collection** | 10-75ms | Dominated by async DB queries and error tracker |
| **Change Detection** | <1ms | Shallow field comparison only (memory optimized) |
| **Console Output** | 2-5ms | ASCII formatting and string concatenation |
| **Memory Overhead** | ~8 KB | Stats cache (shallow references, no deep clone) |
| **CPU Impact** | <0.1% | Negligible, only active during 15s interval |

**Memory Optimization** (2025-11-17):
- **Previous**: Deep clone `statsCache` every 15s → 1-2 MB allocation → 5 MB/min churn
- **Current**: Shallow reference only → 0 allocation → pointer swap
- **Why It Works**: Change detection compares specific fields, doesn't need full clone
- **Impact**: Eliminates 5 MB/min memory churn, reduces GC pressure

**Performance Trade-offs**:
- **15s Interval**: Long enough to avoid spam, short enough for real-time monitoring
- **Change Detection**: Prevents redundant prints, saves console I/O
- **Unref Timer**: Allows graceful shutdown without blocking
- **Fire-and-Forget**: Errors never block interval or crash logger

### 5.5.9 Cross-References

**Related Architecture Bible Sections**:
- **Section 2** (Database Architecture) — `getDatabaseStats()` provider, Prisma client telemetry, on-premise database telemetry
- **Section 4** (Event Bus) — Event Bus does NOT use logger (circular dependency prevention via `console.*()`)
- **Section 6** (Error System) — Error tracker integration, `collectErrorStats()`, error dashboard
- **Section 9** (Game Engine) — Engine DB stats (Read-DB/Write-DB), battle log counts
- **Section 13** (Performance Optimization) — Resource monitor integration, memory pressure detection
- **Section 16** (Boot Sequence) — Logger auto-refresh initialization timing (after Service Registry)
- **Section 17** (Service Registry) — Service health checks, degraded state detection

**Related Operations Bible Sections**:
- **operations-bible/02-database-operations.md** — Database URL selection logic, connection telemetry, heartbeat monitoring
- **operations-bible/03-monitoring.md** — Resource monitor architecture, memory guardian, cache pruning

**Related Development Bible Sections**:
- **development-bible/02-local-development.md** — On-premise database setup, workstation observability
- **development-bible/04-testing.md** — Logger mocking in tests, stats provider injection

**Related Source Files**:
- `src/utils/logger.js` (1151 lines) — Complete auto-refresh implementation
- `src/index.ts` (lines 1178-1183) — Logger auto-refresh initialization timing
- `src/services/monitoring/resource-monitor.ts` — Resource metrics collection
- `src/shared/prisma.ts` — Database stats provider (`getDatabaseStats()` function)
- `src/services/monitoring/error-tracker.ts` — Error stats provider (`getErrorStats()`, `getRecentErrors()`)

---

[← Back to INDEX](INDEX.md) | [Next: Error System →](06-error-system.md)
