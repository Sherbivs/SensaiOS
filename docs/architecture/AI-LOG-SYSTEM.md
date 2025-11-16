# AI-Optimized Hard Logging System

**Date:** November 10, 2025  
**Purpose:** Centralized, machine-readable logging system for AI analysis and self-learning  
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Storage](#storage)
5. [Usage](#usage)
6. [AI Query Interface](#ai-query-interface)
7. [Integration](#integration)
8. [Self-Learning](#self-learning)
9. [Operational Guide](#operational-guide)

---

## Overview

The AI Log System is a comprehensive logging infrastructure designed specifically for AI analysis and machine learning. Unlike traditional console logs that disappear after viewing, this system:

- **Persists logs to disk** (`/Store/ai-logs/`) for long-term analysis
- **Structures data in JSON** for easy machine parsing
- **Auto-correlates events** to trace cause-effect relationships
- **Detects patterns** automatically (errors, performance, anomalies)
- **Self-learns** by adapting baselines and thresholds over time
- **Generates insights** with actionable recommendations

### Key Differences from Console Logger

| Feature | Console Logger | AI Log System |
|---------|---------------|---------------|
| **Output** | stdout/stderr (ephemeral) | Hard files on `/Store` disk |
| **Format** | Human-readable text | Machine-readable NDJSON |
| **Persistence** | Lost on restart | Retained indefinitely |
| **Correlation** | Manual | Automatic with correlation IDs |
| **Analysis** | Manual inspection | Automatic pattern detection |
| **Learning** | None | Self-adapts baselines and thresholds |
| **Query** | Scroll through logs | Structured queries with filters |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                        │
│  (Error Tracker, Game Engine, Discord, Database, etc.)     │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI LOG INTEGRATIONS                         │
│  - Error Tracker Hook                                       │
│  - Console Logger Hook                                      │
│  - Resource Monitor Hook                                    │
│  - Database Query Hook (Prisma middleware)                  │
│  - Discord Event Hook                                       │
│  - Game Engine Event Hook                                   │
│  - Security Bot Event Hook                                  │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI LOG WRITER                             │
│  - Structured JSON logs (NDJSON format)                     │
│  - Context capture (stack traces, file/line, correlation)  │
│  - Auto-rotation (10MB or 24 hours)                         │
│  - Auto-compression (gzip after 1 hour)                     │
│  - Sanitization (redact tokens, passwords, secrets)         │
│  - Buffering (5-second flush interval)                      │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   /Store/ai-logs/                            │
│  - general-2025-11-10T12-30-00.ndjson (current)            │
│  - error-2025-11-10T08-15-00.ndjson (rotated)              │
│  - compressed/                                              │
│    - general-2025-11-09T18-00-00.ndjson.gz                 │
│  - analysis/                                                │
│    - knowledge-base.json (learned patterns)                 │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   AI LOG ANALYZER                            │
│  - Pattern detection (errors, performance, correlations)    │
│  - Anomaly detection (spikes, degradation)                  │
│  - Correlation analysis (cascade failures)                  │
│  - Performance baselines (adaptive thresholds)              │
│  - Insight generation (actionable recommendations)          │
│  - Self-learning (update patterns and baselines)            │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI QUERY INTERFACE (CLI)                    │
│  - ai-log-query query --level ERROR --since 1h             │
│  - ai-log-query analyze                                     │
│  - ai-log-query patterns                                    │
│  - ai-log-query insights                                    │
│  - ai-log-query stats                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### 1. Structured Logging

Every log entry includes:

```json
{
  "timestamp": "2025-11-10T15:30:45.123Z",
  "timestampMs": 1699628445123,
  "level": "ERROR",
  "category": "database",
  "correlationId": "3j2k1m-0001-a3f2",
  "message": "Query failed: Species.findUnique",
  "context": {
    "file": "/opt/render/project/src/services/database.js",
    "line": 145,
    "function": "querySpecies",
    "stack": [
      "at querySpecies (/opt/render/project/src/services/database.js:145:12)",
      "at async handleBattle (/opt/render/project/src/game-engine/battle.js:89:5)"
    ]
  },
  "process": {
    "pid": 42,
    "uptime": 3600,
    "memory": {
      "rss": 145678336,
      "heapUsed": 89456128,
      "heapTotal": 112345088,
      "external": 1234567
    },
    "hostname": "infinity-gauntlet-bots"
  },
  "data": {
    "model": "Species",
    "action": "findUnique",
    "duration": 245.67,
    "args": { "where": { "id": 25 } }
  },
  "error": {
    "name": "PrismaClientKnownRequestError",
    "message": "Timeout waiting for database response",
    "code": "P2024",
    "stack": ["..."],
    "cause": null
  },
  "tags": ["prisma", "query-error", "findUnique"],
  "user": { "userId": "123456789" },
  "guild": { "guildId": "987654321" }
}
```

### 2. Log Levels

| Level | Priority | Use Case |
|-------|----------|----------|
| **TRACE** | 0 | Extremely detailed execution flow (line-by-line) |
| **DEBUG** | 1 | Detailed debug information (variable values, state) |
| **INFO** | 2 | General informational messages (successful operations) |
| **NOTICE** | 3 | Notable events (user actions, state changes) |
| **WARN** | 4 | Warning conditions (degraded performance, deprecation) |
| **ERROR** | 5 | Error conditions (handled errors, retries) |
| **CRITICAL** | 6 | Critical errors (system instability, data loss risk) |
| **FATAL** | 7 | Fatal errors (system shutdown required) |

### 3. Categories

Logs are organized by category for filtering:

- `system` - System-level events (startup, shutdown, config)
- `database` - Database operations (queries, connections, migrations)
- `discord` - Discord API interactions (commands, events, rate limits)
- `game-engine` - Game engine operations (battles, spawns, calculations)
- `security` - Security events (auth, permissions, threats)
- `performance` - Performance metrics and profiling
- `error` - Error tracking and recovery
- `resource` - Resource management (memory, CPU, connections)
- `user-action` - User-initiated actions (commands, interactions)
- `integration` - External integrations (APIs, webhooks)

### 4. Correlation IDs

Every log entry has a unique correlation ID (`{timestamp}-{counter}-{random}`). Related operations share the same correlation ID, allowing you to trace the entire flow of an operation across multiple systems.

**Example:** A user command triggers:
1. Discord command handler logs with correlation ID `abc-0001-xyz`
2. Game engine logs battle with same ID `abc-0001-xyz`
3. Database queries log with same ID `abc-0001-xyz`
4. AI can trace entire flow by querying this correlation ID

### 5. Auto-Rotation & Compression

- **Rotation triggers:**
  - File size exceeds 10MB
  - File age exceeds 24 hours

- **Compression:**
  - After 1 hour, logs are gzipped to save space
  - Compressed logs moved to `/Store/ai-logs/compressed/`

- **Cleanup:**
  - Keeps last 100 compressed files
  - Oldest files deleted automatically

---

## Storage

### Directory Structure

```
/Store/ai-logs/
├── general-2025-11-10T15-30-00.ndjson        # Current active log
├── database-2025-11-10T14-00-00.ndjson       # Category-specific log
├── error-2025-11-10T12-30-00.ndjson          # Error log
├── compressed/
│   ├── general-2025-11-09T18-00-00.ndjson.gz
│   ├── database-2025-11-09T18-00-00.ndjson.gz
│   └── error-2025-11-09T12-00-00.ndjson.gz
└── analysis/
    └── knowledge-base.json                    # Learned patterns and insights
```

### File Format: NDJSON (Newline-Delimited JSON)

Each line is a complete JSON object:

```
{"timestamp":"2025-11-10T15:30:00.000Z","level":"INFO","message":"Server started"}
{"timestamp":"2025-11-10T15:30:01.123Z","level":"DEBUG","message":"Loading config"}
{"timestamp":"2025-11-10T15:30:02.456Z","level":"ERROR","message":"Failed to connect"}
```

**Why NDJSON?**
- Streamable (process one line at a time without loading entire file)
- Easy to parse (each line is valid JSON)
- Append-friendly (no need to rewrite entire file)
- Works with standard Unix tools (`grep`, `awk`, `sed`)

---

## Usage

### Basic Logging

```javascript
import * as aiLogger from './services/ai-log-writer.js';

// Initialize (done once at app startup)
await aiLogger.initialize();

// Log at different levels
aiLogger.info('system', 'Application started', {
  data: { version: '1.0.0', port: 3000 },
  tags: ['startup'],
});

aiLogger.error('database', 'Connection failed', {
  error: new Error('Timeout'),
  data: { host: 'localhost', port: 5432 },
  tags: ['database', 'connection-error'],
});

// With correlation ID (track related operations)
const correlationId = aiLogger.generateCorrelationId();

aiLogger.info('user-action', 'Command received', {
  data: { command: 'battle', userId: '123' },
  correlationId,
  userId: '123',
  guildId: '456',
});

aiLogger.debug('game-engine', 'Battle started', {
  data: { battleId: 'b123', participants: ['p1', 'p2'] },
  correlationId,
});

aiLogger.info('game-engine', 'Battle ended', {
  data: { battleId: 'b123', winner: 'p1', duration: 1234 },
  correlationId,
});

// Flush logs to disk immediately
await aiLogger.flush();

// Shutdown (done at app shutdown)
await aiLogger.shutdown();
```

### Integration Hooks

```javascript
import * as aiLogIntegrations from './services/ai-log-integrations.js';
import { errorTracker } from './services/error-tracker.js';
import logger from './utils/logger.js';
import { resourceMonitor } from './services/resource-monitor.js';
import { prisma } from './shared/prisma.js';
import client from './discord-client.js';

// Auto-integrate all systems
await aiLogIntegrations.integrateAll({
  errorTracker,
  logger,
  resourceMonitor,
  prisma,
  discordClient: client,
});

// Or integrate individually
aiLogIntegrations.integrateErrorTracker(errorTracker);
aiLogIntegrations.integratePrisma(prisma);
aiLogIntegrations.integrateDiscordClient(client);

// Log game engine events
aiLogIntegrations.gameEngine.logBattleStart('b123', [
  { userId: '123', pokemonId: 25, level: 50 },
  { userId: '456', pokemonId: 6, level: 50 },
], { correlationId, guildId: '789' });

aiLogIntegrations.gameEngine.logBattleEnd('b123', {
  winner: '123',
  turns: 12,
  outcome: 'knockout',
}, 1234, { correlationId });

// Log security events
aiLogIntegrations.securityBot.logUnauthorizedChange({
  guildId: '789',
  roleId: 'r123',
  permission: 'ADMINISTRATOR',
  previousState: false,
  currentState: true,
});

// Log user actions
aiLogIntegrations.userActions.logCommand(
  'battle',
  { id: '123', tag: 'user#1234' },
  { id: '789', name: 'My Guild' },
  { opponent: '456' },
  { correlationId }
);
```

---

## AI Query Interface

### Via SSH

```bash
# SSH into server
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# Query last hour of errors
node src/cli/ai-log-query.js query --level ERROR --since 1h

# Query specific category
node src/cli/ai-log-query.js query --category database --since 30m

# Grep for text
node src/cli/ai-log-query.js query --grep "timeout" --since 2h

# Compact output
node src/cli/ai-log-query.js query --level WARN --since 1h --compact

# JSON output (for scripting)
node src/cli/ai-log-query.js query --level ERROR --since 1h --json

# Run full analysis
node src/cli/ai-log-query.js analyze --since 24h

# Show detected patterns
node src/cli/ai-log-query.js patterns

# Show performance baselines
node src/cli/ai-log-query.js performance

# Show AI insights
node src/cli/ai-log-query.js insights

# Show stats
node src/cli/ai-log-query.js stats
```

### Query Examples

#### Find all errors in last hour

```bash
node src/cli/ai-log-query.js query --level ERROR --since 1h
```

Output:
```
────────────────────────────────────────────────────────────────────────────
2025-11-10 15:30:45 ERROR    database        Query failed: Species.findUnique
  at querySpecies (/opt/render/project/src/services/database.js:145:12)
  Error: PrismaClientKnownRequestError: Timeout waiting for database response
  Data:
    model: Species
    action: findUnique
    duration: 245.67
  Tags: prisma, query-error, findUnique
  Correlation ID: 3j2k1m-0001-a3f2
────────────────────────────────────────────────────────────────────────────
```

#### Trace operation by correlation ID

```bash
node src/cli/ai-log-query.js query --grep "abc-0001-xyz" --since 1h
```

Shows entire flow of operation across all systems.

#### Analyze patterns and generate insights

```bash
node src/cli/ai-log-query.js analyze --since 24h
```

Output:
```
═══ ANALYSIS RESULTS ═══

Error Patterns: 3
  ● PrismaClientKnownRequestError (x12)
    Timeout waiting for database response
    Files: /opt/render/project/src/services/database.js

Performance Patterns: 5
  ● Species.findUnique
    Avg: 45.3ms | P95: 234.5ms | Max: 567.8ms

Correlations: 2
  ● database:ERROR → game-engine:ERROR (x8)
    Avg time delta: 1.2s

Insights: 4
  ❌ [HIGH] Recurring error: PrismaClientKnownRequestError
    This error has occurred 12 times...
    → Investigate root cause in database.js. Consider adding retry logic.
```

---

## Integration

### Step 1: Initialize at Startup

Add to `src/index.js`:

```javascript
import * as aiLogger from './services/ai-log-writer.js';
import * as aiLogAnalyzer from './services/ai-log-analyzer.js';
import * as aiLogIntegrations from './services/ai-log-integrations.js';

// Initialize AI logging system
await aiLogger.initialize();
await aiLogAnalyzer.initialize();

// Integrate with existing systems
await aiLogIntegrations.integrateAll({
  errorTracker,
  logger,
  resourceMonitor,
  prisma,
  discordClient: client,
});

// Log startup
aiLogger.info('system', 'AI Log System initialized', {
  data: {
    version: '1.0.0',
    minLevel: aiLogger.CONFIG.minLevel,
    baseDir: aiLogger.CONFIG.baseDir,
  },
  tags: ['startup', 'ai-logger'],
});
```

### Step 2: Add Shutdown Hook

```javascript
process.on('SIGTERM', async () => {
  await aiLogger.shutdown();
  await aiLogAnalyzer.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await aiLogger.shutdown();
  await aiLogAnalyzer.shutdown();
  process.exit(0);
});
```

### Step 3: Use Throughout Application

```javascript
// In any module
import * as aiLogger from '../services/ai-log-writer.js';

export async function myFunction() {
  const correlationId = aiLogger.generateCorrelationId();
  
  aiLogger.debug('system', 'Function called', {
    data: { foo: 'bar' },
    correlationId,
  });
  
  try {
    // Do work
    const result = await someOperation();
    
    aiLogger.info('system', 'Operation succeeded', {
      data: { result },
      correlationId,
    });
    
    return result;
  } catch (error) {
    aiLogger.error('system', 'Operation failed', {
      error,
      data: { context: 'some context' },
      correlationId,
    });
    
    throw error;
  }
}
```

---

## Self-Learning

The AI Log Analyzer continuously learns from logs:

### 1. Error Patterns

- Groups similar errors by name and message similarity (70% threshold)
- Tracks occurrence counts, first/last seen times
- Identifies recurring issues automatically
- Adapts grouping based on observed patterns

### 2. Performance Baselines

- Measures operation durations (avg, p95, min, max)
- Adapts baselines over time (10% adaptation rate)
- Detects slow operations (>100ms logged as WARN)
- Identifies degradation trends

### 3. Correlation Detection

- Finds events that occur together within time windows
- Identifies cascade failures (error A → error B)
- Tracks average time deltas between correlated events
- Builds cause-effect knowledge

### 4. Anomaly Detection

- Establishes baselines (24-hour window)
- Detects spikes (>2 standard deviations)
- Tracks log volume by level and category
- Alerts on unusual patterns

### 5. Insight Generation

Generates actionable insights:

- **Recurring Errors**: "This error occurred X times. Investigate root cause in file.js"
- **Performance Bottlenecks**: "Operation Y is slow (P95: Xms). Consider caching or optimization"
- **Cascading Failures**: "Error A leads to Error B. Add circuit breaker pattern"
- **Anomalies**: "ERROR log volume spiked 3σ above baseline. Check recent changes"

### Knowledge Base Persistence

The analyzer saves learned patterns to `/Store/ai-logs/analysis/knowledge-base.json`:

```json
{
  "errorPatterns": [
    ["PrismaClientKnownRequestError:Timeout...", {
      "totalOccurrences": 24,
      "firstDetected": "2025-11-09T12:00:00.000Z",
      "lastSeen": "2025-11-10T15:30:00.000Z",
      "files": ["database.js"],
      "occurrences": [...]
    }]
  ],
  "performanceBaselines": [
    ["Species.findUnique", {
      "avg": 45.3,
      "p95": 234.5,
      "measurements": 1234,
      "lastUpdate": "2025-11-10T15:30:00.000Z"
    }]
  ],
  "correlations": [...],
  "anomalies": [...],
  "insights": [...]
}
```

This knowledge persists across restarts and continuously improves over time.

---

## Operational Guide

### Monitoring

#### Check log system status

```bash
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com
node src/cli/ai-log-query.js stats
```

Output:
```
═══ AI LOG SYSTEM STATS ═══

Writer:
  Logs written: 12345
  Bytes written: 45.67 MB
  Errors: 0
  Rotations: 3
  Compressions: 12
  Uptime: 3600s
  Buffer size: 5 entries

Analyzer:
  Logs analyzed: 12345
  Error patterns: 15
  Performance baselines: 42
  Correlations: 8
  Anomalies: 2
  Insights: 23
```

#### Check disk usage

```bash
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com
du -sh /Store/ai-logs/*
```

#### View recent logs

```bash
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com
tail -100 /Store/ai-logs/general-*.ndjson | jq -r '"\(.timestamp) [\(.level)] \(.message)"'
```

### Troubleshooting

#### No logs appearing

1. Check if AI logger initialized:
```bash
grep "AI Log Writer initialized" /Store/ai-logs/*.ndjson
```

2. Check for initialization errors in console logs:
```bash
# In Render Dashboard → Logs tab
# Search for: "[ai-log-writer]"
```

3. Verify /Store directory exists and is writable:
```bash
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com
ls -la /Store/
```

#### Logs filling up disk

1. Check rotation working:
```bash
ls -lh /Store/ai-logs/ | grep ".ndjson$"
# Should see files with recent timestamps
```

2. Check compression working:
```bash
ls -lh /Store/ai-logs/compressed/
# Should see .ndjson.gz files
```

3. Manually trigger cleanup:
```bash
node -e "import('./src/services/ai-log-writer.js').then(m => m.shutdown())"
```

#### Analysis not running

1. Check knowledge base exists:
```bash
cat /Store/ai-logs/analysis/knowledge-base.json | jq .lastUpdate
```

2. Manually run analysis:
```bash
node src/cli/ai-log-query.js analyze --since 24h
```

### Performance Tuning

#### Reduce log volume

Set higher minimum log level:

```bash
# In environment variables or secrets/Infinity-Gauntlet.env
AI_LOG_LEVEL=WARN  # Only log WARN and above
```

#### Increase rotation frequency

Edit `src/services/ai-log-writer.js`:

```javascript
rotation: {
  maxSize: 5 * 1024 * 1024,  // 5MB instead of 10MB
  maxAge: 12 * 60 * 60 * 1000, // 12 hours instead of 24 hours
}
```

#### Disable auto-flush

Edit `src/services/ai-log-writer.js`:

```javascript
autoFlush: false,
flushInterval: 10000,  // 10 seconds instead of 5
```

---

## Production Deployment Checklist

- [x] AI log writer implemented
- [x] AI log analyzer implemented
- [x] Integration hooks implemented
- [x] CLI query tool implemented
- [ ] Initialize in src/index.js
- [ ] Add shutdown hooks
- [ ] Deploy to Render production
- [ ] Verify /Store/ai-logs/ directory created
- [ ] Test via SSH: `node src/cli/ai-log-query.js stats`
- [ ] Run first analysis: `node src/cli/ai-log-query.js analyze`
- [ ] Monitor disk usage (should stay under 500MB)
- [ ] Check insights after 24 hours

---

## Next Steps

1. **Deploy to production** - Initialize AI logger in src/index.js
2. **Monitor for 24 hours** - Let system collect baseline data
3. **Run first analysis** - Generate initial insights
4. **Review insights** - Identify quick wins (recurring errors, slow queries)
5. **Iterate** - Fix identified issues, re-analyze to measure improvement

---

**Questions? Issues? Improvements?**

This system is designed to continuously learn and improve. As it accumulates more data, its insights will become more accurate and actionable. Use the insights to guide development priorities and system improvements.
