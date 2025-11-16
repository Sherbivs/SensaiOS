# AI Logging System - Scaling & Integration Guide

**Version:** 1.0  
**Last Updated:** 2025-11-11  
**Status:** Production-Ready

## Overview

The AI Logging System is designed to scale across all application components, capturing comprehensive operational data for machine learning analysis. The system maintains **48+ hours of readable hard log archives** on persistent disk while automatically managing storage through rotation and compression.

## Storage Guarantees

### Retention Policy
- **Minimum Archive:** 48 hours of readable logs
- **File Retention:** 200 compressed files (doubled from initial 100)
- **Rotation Trigger:** 10MB per file OR 24 hours (whichever comes first)
- **Compression Timing:** 1 hour after file rotation
- **Storage Location:** `/Store/ai-logs/` (persistent disk, survives deployments)

### Capacity Planning

**At High Volume (10MB every 2 hours):**
- Files per day: 12 files
- Files for 48 hours: 24 files
- Files for 7 days: 84 files
- Buffer capacity: 200 files = **16+ days** of logs at high volume

**At Medium Volume (10MB every 6 hours):**
- Files per day: 4 files
- Files for 48 hours: 8 files
- Files for 7 days: 28 files
- Buffer capacity: 200 files = **50+ days** of logs at medium volume

**At Low Volume (10MB every 24 hours):**
- Files per day: 1 file
- Files for 48 hours: 2 files
- Files for 7 days: 7 files
- Buffer capacity: 200 files = **200 days** of logs at low volume

### Storage Math

```
Uncompressed: 10MB per file × 200 files = 2000MB = ~2GB maximum
Compressed: ~2-3MB per file (gzip) × 200 files = 400-600MB typical
Persistent disk allocation: /Store mount (shared across all workers)
```

## Integration Points

### 1. Error Tracking System
**File:** `src/services/error-tracker.ts`  
**Integration:** `integrateErrorTracker(errorTracker)`

**Captures:**
- All tracked errors with full context
- Error IDs, severity, categories
- User/guild context when available
- Recovery attempts and outcomes

**Log Level:** ERROR  
**Category:** error  
**Tags:** error-tracker, [category], [severity]

---

### 2. Console Logging System
**File:** `src/shared/log.ts`  
**Integration:** `integrateConsoleLogger(logger)`

**Captures:**
- All `log.info()`, `log.warn()`, `log.error()` calls
- Structured metadata from console logs
- Performance timing data
- System state changes

**Log Levels:** INFO, WARN, ERROR  
**Categories:** Based on log context  
**Tags:** console-logger, [custom tags]

---

### 3. Resource Monitor
**File:** `src/services/resource-monitor.ts`  
**Integration:** `integrateResourceMonitor(resourceMonitor)`

**Captures:**
- Health check results (every 12 hours)
- Check duration timing
- Warnings and errors
- System health status

**Log Level:** INFO (healthy), WARN (warnings), ERROR (errors)  
**Category:** resource  
**Tags:** resource-monitor, health-check

---

### 4. Resource Manager (Leak Detection)
**File:** `src/services/resource-manager.ts`  
**Integration:** `integrateResourceManager(resourceManager)`

**Captures:**
- Memory leak detections
- Leak type, size, age, stack traces
- Resource tracking (high-value resources only)
- Total leak size calculations

**Log Level:** WARN (leaks), DEBUG (tracking)  
**Category:** resource  
**Tags:** resource-manager, memory-leak, detection, tracking

---

### 5. Database Connection Monitor
**File:** `src/shared/prisma.ts`  
**Integration:** `integrateDatabaseMonitor(databaseMonitor)`

**Captures:**
- Database health status (every minute)
- Connection issues (error/degraded states)
- Latency measurements
- Connection pool stats
- Transport type (direct/accelerate)

**Log Level:** WARN (issues)  
**Category:** database  
**Tags:** database, health, [db-name], [status]

---

### 6. Prisma Database Queries
**File:** `src/shared/prisma.ts`  
**Integration:** `integratePrisma(prisma)`

**Captures:**
- All database queries with duration
- Slow queries (>100ms) flagged
- Query errors with full context
- Transaction boundaries

**Log Levels:** DEBUG (normal), WARN (slow >100ms), ERROR (failures)  
**Category:** database  
**Tags:** prisma, query, slow, error

---

### 7. Discord Client Events
**File:** `discord.js Client`  
**Integration:** `integrateDiscordClient(discordClient)`

**Captures:**
- Rate limit events (global/per-route)
- API errors with retry context
- Warning events (connection issues)
- Ready events (bot startup)
- Reconnection events

**Log Levels:** WARN (rate limits, warnings), ERROR (API errors), INFO (ready/reconnect)  
**Category:** discord  
**Tags:** discord, rate-limit, error, warning, ready, reconnect

---

### 8. Worker Process Lifecycle
**File:** All worker processes  
**Integration:** `integrateWorkerProcess(workerConfig)`

**Captures:**
- Worker startup (name, type, PID, environment)
- Uncaught exceptions (fatal)
- Unhandled rejections (critical)
- Process metrics (memory, CPU, uptime - every 5 minutes)

**Log Levels:** INFO (startup), DEBUG (metrics), CRITICAL (rejections), FATAL (exceptions)  
**Category:** system  
**Tags:** worker, startup, metrics, fatal, critical, uncaught-exception, unhandled-rejection

---

### 9. Game Engine Events
**Integration:** `aiLogIntegrations.gameEngine.*` helpers

**Captures:**
- Battle start/end/errors
- Pokemon spawns
- Engine calculations
- Performance bottlenecks

**Functions:**
```javascript
aiLogIntegrations.gameEngine.logBattleStart(battleId, participants, options)
aiLogIntegrations.gameEngine.logBattleEnd(battleId, result, duration, options)
aiLogIntegrations.gameEngine.logBattleError(battleId, error, options)
aiLogIntegrations.gameEngine.logPokemonSpawn(pokemon, location, options)
```

**Log Levels:** INFO (start/end/spawn), ERROR (errors)  
**Category:** game-engine  
**Tags:** battle, pokemon, spawn, error

---

### 10. Security Bot Events
**Integration:** `aiLogIntegrations.securityBot.*` helpers

**Captures:**
- Permission sweeps
- Unauthorized changes
- Revert operations
- Security violations

**Functions:**
```javascript
aiLogIntegrations.securityBot.logSweep(guildId, results, options)
aiLogIntegrations.securityBot.logUnauthorizedChange(guildId, change, options)
aiLogIntegrations.securityBot.logRevert(guildId, revert, options)
```

**Log Levels:** INFO (sweeps), WARN (unauthorized), ERROR (reverts)  
**Category:** security  
**Tags:** security-bot, sweep, unauthorized, revert

---

### 11. User Actions
**Integration:** `aiLogIntegrations.userActions.*` helpers

**Captures:**
- Command executions
- Command errors
- User interactions
- Rate limiting events

**Functions:**
```javascript
aiLogIntegrations.userActions.logCommand(command, user, guild, options)
aiLogIntegrations.userActions.logCommandError(command, error, user, guild, options)
```

**Log Levels:** NOTICE (commands), ERROR (command errors)  
**Category:** user-action  
**Tags:** user-action, command, command-error

---

## Scaling Architecture

### Centralized Collection
All integration points funnel through `ai-log-writer.js`:
```
Application Components → Integration Hooks → AI Log Writer → /Store/ai-logs/
```

### Buffered Writes
- **Buffer Size:** 100 entries
- **Flush Interval:** 5 seconds
- **Auto-Flush:** On rotation, shutdown, or buffer full

### Non-Blocking Design
- All logging is asynchronous
- Buffering prevents I/O blocking
- Errors in logging don't crash application
- Graceful degradation on disk full

### Multi-Worker Support
- Each worker writes to shared `/Store/ai-logs/` directory
- File rotation uses timestamps (collision-free)
- Compression runs independently per worker
- Analysis reads across all worker logs

## Query Interface

### CLI Commands (SSH-Accessible)

```bash
# Query logs with filters
npm run ai-logs:query -- --level ERROR --since 24h --limit 100

# Full analysis pipeline
npm run ai-logs:analyze -- --since 48h

# View error patterns
npm run ai-logs:patterns

# Performance baselines
npm run ai-logs:performance

# AI-generated insights
npm run ai-logs:insights

# System statistics
npm run ai-logs:stats
```

### Filter Options
- `--level <LEVEL>` - Filter by log level (TRACE, DEBUG, INFO, NOTICE, WARN, ERROR, CRITICAL, FATAL)
- `--category <CATEGORY>` - Filter by category (system, database, discord, game-engine, security, etc.)
- `--since <TIME>` - Relative (1h, 30m, 2d) or absolute (ISO date)
- `--until <TIME>` - End time filter
- `--tags <TAG>` - Filter by tags (comma-separated)
- `--grep <PATTERN>` - Search message text
- `--limit <N>` - Max results (default 100)

### Output Formats
- **Human-readable** (default): Colorized, formatted for terminal
- **Compact** (`--compact`): One line per log entry
- **JSON** (`--json`): Machine-readable for automation

## Self-Learning Features

### 1. Error Pattern Detection
**Algorithm:** Levenshtein distance similarity  
**Threshold:** 70% similarity  
**Minimum Occurrences:** 3  
**Time Window:** 1 hour

**Output:**
```javascript
{
  pattern: "TypeError: Cannot read property 'id' of undefined",
  count: 15,
  severity: "HIGH",
  files: ["src/bot/dm/heal.ts", "src/core/encounter/catch.ts"],
  firstSeen: "2025-11-11T00:00:00Z",
  lastSeen: "2025-11-11T23:59:59Z",
  recommendation: "Add null checks before accessing object properties"
}
```

### 2. Performance Baselines
**Metrics:** avg, min, max, P95  
**Adaptation Rate:** 10% (gradual learning)  
**Slow Threshold:** >100ms operations

**Output:**
```javascript
{
  operation: "prisma.user.findMany",
  baseline: { avg: 45, p95: 78, min: 12, max: 234 },
  recent: { avg: 156, p95: 312, min: 45, max: 890 },
  status: "DEGRADED",
  recommendation: "Query performance degraded 3.5x - check indexes"
}
```

### 3. Correlation Analysis
**Time Window:** 60 seconds  
**Correlation Types:** Cascade failures, causal chains  
**Minimum Correlations:** 5 occurrences

**Output:**
```javascript
{
  event1: "Database connection timeout",
  event2: "Prisma query error",
  count: 23,
  avgTimeDelta: 450, // milliseconds
  direction: "event1 → event2",
  recommendation: "Connection timeout causes query failures - increase timeout or pool size"
}
```

### 4. Anomaly Detection
**Baseline Window:** 24 hours  
**Detection Threshold:** 2 standard deviations  
**Bucketing:** Hourly aggregation

**Output:**
```javascript
{
  metric: "error_rate",
  baseline: { mean: 12, stddev: 3 },
  current: 45,
  sigma: 11, // 11 standard deviations above baseline
  severity: "CRITICAL",
  recommendation: "Error rate spike detected - check recent deployments"
}
```

## Integration Workflow

### Adding New Integration Point

**Step 1: Create Integration Function**
```javascript
// In src/services/ai-log-integrations.js
export function integrateMyService(myService) {
  if (!myService) return;
  
  // Hook into service methods
  const original = myService.doSomething?.bind(myService);
  
  if (original) {
    myService.doSomething = async function(...args) {
      const start = performance.now();
      const result = await original(...args);
      const duration = performance.now() - start;
      
      // Log to AI system
      aiLogger.info(CONFIG.categories.SYSTEM, 'My service did something', {
        data: { args, result, duration },
        tags: ['my-service', 'operation'],
      });
      
      return result;
    };
  }
  
  console.log('[ai-log-integrations] My Service integrated');
}
```

**Step 2: Add to integrateAll()**
```javascript
export async function integrateAll(services = {}) {
  const { myService, /* ... */ } = services;
  
  if (myService) integrateMyService(myService);
  // ... other integrations
}
```

**Step 3: Update Main Application**
```typescript
// In src/index.ts
await aiLogIntegrations.integrateAll({
  myService,
  // ... other services
});
```

**Step 4: Document**
Add entry to this document with:
- Integration point description
- Captured data
- Log levels used
- Categories and tags
- Example usage

## Monitoring & Maintenance

### Health Checks

**Check Log Writer Status:**
```bash
npm run ai-logs:stats
```

Expected output:
```
═══ AI LOG SYSTEM STATS ═══

Writer:
  Logs written: 45,234
  Bytes written: 127.45 MB
  Errors: 0
  Rotations: 13
  Compressions: 12
  Flushes: 9,047
  Uptime: 172,800s (48 hours)
  Current file: 2025-11-11T12-00-00-000Z.ndjson
  Buffer size: 23 entries

Analyzer:
  Logs analyzed: 45,234
  Error patterns: 7
  Performance baselines: 24
  Correlations: 12
  Anomalies: 3
  Insights: 8
  Last update: 2025-11-11 12:34:56
```

### Disk Usage Monitoring

**Check Storage:**
```bash
# Via SSH
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com
du -sh /Store/ai-logs/*

# Expected:
# 15M    /Store/ai-logs/2025-11-11T00-00-00-000Z.ndjson (current)
# 450M   /Store/ai-logs/compressed/ (200 compressed files)
# Total: ~465M
```

**Storage Alerts:**
- WARNING: >800MB (approaching limit)
- ERROR: >1GB (consider reducing retention)
- CRITICAL: >1.5GB (automatic cleanup triggered)

### Performance Impact

**Expected Overhead:**
- **Logging:** <1ms per log entry (buffered)
- **Rotation:** ~50ms per file (async)
- **Compression:** ~500ms per file (background, I/O bound)
- **Analysis:** ~2s for 10,000 logs (on-demand)

**Memory Usage:**
- **Buffer:** ~5MB (100 entries × 50KB average)
- **Knowledge Base:** ~2MB (patterns + baselines + correlations)
- **Total:** ~7MB resident memory

### Troubleshooting

**No Logs Being Written:**
1. Check AI_LOG_LEVEL environment variable (default: INFO)
2. Verify /Store/ai-logs/ directory exists and is writable
3. Check stats: `npm run ai-logs:stats` - should show non-zero "Logs written"
4. Verify integrations initialized: Look for "[ai-log-integrations] All integrations complete" in startup logs

**Disk Full:**
1. Check retention setting (maxFiles in CONFIG)
2. Manually compress old logs: Find .ndjson files >1 hour old, gzip them
3. Delete oldest compressed files if needed
4. Reduce maxFiles in config (requires restart)

**High Memory Usage:**
1. Check buffer size: `npm run ai-logs:stats`
2. If buffer >80 entries consistently, increase flushInterval or decrease maxSize
3. Verify compression is running (check compressed/ directory growth)

**Slow Queries:**
1. Use query CLI with --limit to reduce result set
2. Use --since to query recent logs only
3. Use --grep for text search instead of loading all logs
4. For large datasets, use --json and pipe to jq for filtering

## Best Practices

### DO:
- ✅ Log all errors with full context (error object + metadata)
- ✅ Use appropriate log levels (TRACE for verbose, ERROR for actual errors)
- ✅ Include correlation IDs for related operations
- ✅ Add meaningful tags for filtering
- ✅ Log performance metrics for slow operations (>100ms)
- ✅ Capture user/guild context when available
- ✅ Use categories consistently across integrations

### DON'T:
- ❌ Log sensitive data (passwords, API keys, tokens) - sanitization catches most, but avoid logging
- ❌ Log in tight loops without throttling
- ❌ Use TRACE level in production (creates huge log files)
- ❌ Forget to add new integration points to integrateAll()
- ❌ Block application flow waiting for logs
- ❌ Assume logs are immediately flushed (5-second buffer)

## Future Enhancements

### Planned Features
1. **Real-time Streaming:** WebSocket API for live log streaming
2. **Advanced Analytics:** Machine learning-based anomaly detection
3. **Alert Webhooks:** Automatic notifications for critical patterns
4. **Log Replay:** Replay logs through analysis pipeline for testing
5. **Multi-tenancy:** Per-guild log isolation and analysis
6. **Compression Tuning:** Adaptive compression based on log volume
7. **Query Optimization:** Index-based searching for faster queries
8. **Visualization:** Web dashboard for log analytics
9. **Export API:** Bulk export to external analytics platforms
10. **Sampling:** Intelligent log sampling for high-volume systems

## References

- **Architecture:** `docs/AI-LOG-SYSTEM.md`
- **Implementation:** `src/services/ai-log-writer.js`, `src/services/ai-log-analyzer.js`, `src/services/ai-log-integrations.js`
- **CLI Tool:** `src/cli/ai-log-query.js`
- **Deployment:** `AGENTS.md` (Production & Render Notes)
- **Operations:** `OPERATIONS.md` (Service Matrix)

---

**Document Version:** 1.0  
**Maintained By:** Development Team  
**Last Review:** 2025-11-11  
**Next Review:** 2025-12-11 (monthly)
