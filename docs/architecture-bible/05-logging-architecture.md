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

---

[← Back to INDEX](INDEX.md) | [Next: Error System →](06-error-system.md)
