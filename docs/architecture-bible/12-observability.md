# Section 12: Observability

**Last Updated**: 2025-12-28 | **Status**: Production

[← Back to INDEX](INDEX.md) | [← Previous: Safety Guarantees](11-safety-guarantees.md) | [Next: Performance →](13-performance.md)

---

## 12.0 Philosophy & Mental Models

**Core Philosophy**: "Observability is not optional—every metric must be queried live or explicitly declared unavailable with reason."

**Purpose**: Comprehensive monitoring and metrics transparency for production operations.

### 12.0.1 The Three Pillars

| Pillar | Tool | Purpose | Query Language |
|--------|------|---------|----------------|
| **Metrics** | Prometheus | Numeric time-series (gauges, counters, histograms) | PromQL |
| **Logs** | Loki | Structured event streams | LogQL |
| **Traces** | (Future) | Request flow across services | — |

### 12.0.2 Mental Models

**Metrics are for Dashboards** — Answer: "How is the system performing right now?"
- CPU, memory, request rates, error rates
- Aggregate patterns, trends, anomalies
- Alert when thresholds breached

**Logs are for Debugging** — Answer: "What happened to this specific request?"
- Structured JSON events with context
- Full event details, stack traces, parameters
- Query by correlation_id, user_id, error_type

### 12.0.3 Cardinality Discipline

**CRITICAL RULE:** Never use unbounded values as metric labels.

| ❌ FORBIDDEN Labels | ✅ SAFE Labels | ✅ Log Fields Instead |
|---------------------|----------------|----------------------|
| `user_id` | `command_name` | `context.user_id` |
| `guild_id` | `error_type` | `context.guild_id` |
| `battle_id` | `service` | `battle.id` |
| `correlation_id` | `environment` | `correlation_id` |

**Why?** A bot with 10K users × 100 guilds × 50 commands = **50 million** metric series. Prometheus will OOM.

**Solution:** Use high-cardinality values as **log fields**, then query with LogQL:
```logql
{service="bot"} | json | user_id="123456789"
```

### 12.0.4 Metric Type Selection

| Type | Use When | Example |
|------|----------|---------|
| **Counter** | Counting events (always increases) | `commands_total`, `errors_total` |
| **Gauge** | Current value (can go up/down) | `active_battles`, `memory_bytes` |
| **Histogram** | Measuring distributions | `command_duration_seconds` |

### 12.0.5 Authoritative Contracts

- **[Telemetry Contract](../../src/observability/TELEMETRY_CONTRACT.md)** — ALL metrics, labels, schemas
- **[Discord Observability](../../src/observability/DISCORD_OBSERVABILITY.md)** — Discord-specific patterns

## 12.1 Metrics Transparency

**Zero Hardcoded Metrics** — Every metric displayed in console output must be:
1. **Queried from a live source** (process.memoryUsage, getDatabaseStats, etc.), OR
2. **Explicitly declared unavailable** with a specific reason explaining why it cannot be queried

**Unavailability Reasons**:

```javascript
const METRIC_UNAVAILABLE = Object.freeze({
  NOT_QUERIED_YET: 'not-queried-yet',      // Provider not initialized
  INITIALIZING: 'initializing',             // Provider loading
  NO_PROVIDER: 'no-provider',               // No stats provider available
  QUERY_FAILED: 'query-failed',             // Stats query threw error
  NOT_CONNECTED: 'not-connected',           // Database not connected
  DISABLED: 'disabled',                     // Feature disabled
  NOT_APPLICABLE: 'n/a',                    // Not relevant to this service
});
```

**Display Format**:

```
<unavailable: reason>
```

**Examples:**
- `<unavailable: not-queried-yet>` — Provider hasn't been initialized yet
- `<unavailable: no-provider>` — No stats provider available
- `<unavailable: disabled>` — Feature intentionally disabled
- `<unavailable: query-failed>` — Stats query threw error

**Metric Sources**:

**Node Stats** (Always Available):
- Uptime: `process.uptime()`
- Memory: `process.memoryUsage()` (rss, heapUsed, heapTotal, external)
- CPU: `process.cpuUsage()` (user, system)
- PID: `process.pid`
- Version: `process.version`
- Persisted Disk: (PLACEHOLDER FOR FUTURE FULL IMPLMENTATION AND DOCUMENTATION)

**Database Stats** (Conditionally Available):
- Source: `getDatabaseStats()` from Prisma client or pg-connection fallback
- Status: Queried from connection health checks
- Latency: Queried from `SELECT 1` timing
- Connections: Queried from `pg_stat_activity` count
- Availability: Depends on database connection initialization

**Security Bot Stats** (Service-Specific):
- Source: `global.securityBotState` and `global.securityBotClient`
- Status: Queried from client.isReady()
- Guilds: Queried from client.guilds.cache.size
- Last Sweep: Queried from botState.timeline.events
- Availability: Only applicable when running inside security bot worker

**Implementation**:

```javascript
function formatMetric(value, reason, formatter = null) {
  if (value === null || value === undefined) {
    return `<unavailable: ${reason || 'unknown'}>`;
  }
  
  return formatter ? formatter(value) : String(value);
}

// Usage
const dbStatus = getDatabaseStats()?.status || null;
console.log(`Database: ${formatMetric(dbStatus, 'not-connected')}`);
// Output: Database: healthy  OR  Database: <unavailable: not-connected>
```

## 12.2 Metrics Calculation

**Metrics Dashboard** — Real-time operational metrics displayed in console output.

**Console Output Structure**:

```
═══════════════════════════════════════════════════════════════════════
   INFINITY GAUNTLET — OPERATIONAL METRICS
═══════════════════════════════════════════════════════════════════════

⏱ Node Runtime
  Status: online
  Uptime: 2h 34m 12s
  Memory: 342 MB / 2048 MB (16.7%)
  Process: PID 1234, Node v22.16.0

🗄️ Database (PROD)
  Status: healthy
  Latency: 45ms (last query)
  Source: Render PostgreSQL (dpg-d3vd8h7...)
  Version: PostgreSQL 15.3

🗄️ Database (LOCAL)
  Status: <unavailable: disabled>

🛡️ Security Bot
  Status: online
  Guilds: 5
  Last Sweep: 2025-11-10T07:20:00Z (14m ago)
  Total Sweeps: 482
  Alerts: 0

📊 Cache (L1)
  Status: healthy
  Hit Rate: 95.2% (1,234 hits / 1,296 requests)
  Memory: 8 MB / 20 MB (40%)
  Entries: 493 Pokémon, 825 moves

📝 Logger
  Buffer: 42 entries (utilization: 4.2%)
  Flushes: 156 (last: 8s ago)
  Deduplication: 89% savings (1,234 → 142 unique)

═══════════════════════════════════════════════════════════════════════
```

**Auto-Refresh** (Every 15 Seconds):

```javascript
// src/utils/logger.js
setInterval(() => {
  updateConsoleDashboard();
}, 15000);

function updateConsoleDashboard() {
  const nodeStats = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    pid: process.pid,
    version: process.version
  };
  
  const dbStats = getDatabaseStats();
  const securityStats = readSecurityBotState();
  const cacheStats = getEngineCacheStats();
  const loggerStats = getLogBufferStats();
  
  // Clear console and redraw
  console.clear();
  printDashboard({
    node: nodeStats,
    database: dbStats,
    security: securityStats,
    cache: cacheStats,
    logger: loggerStats
  });
}
```

**Benefits**:
- ✅ Real-time visibility into all services
- ✅ No hardcoded metrics (all queried live)
- ✅ Explicit unavailability reasons
- ✅ Cross-worker state visibility
- ✅ SSH-accessible (can view via `docker logs`)

**Monitoring Commands**:

```bash
# View real-time metrics
npm run status

# Query specific metrics
npm run db:cli -- status
npm run ops:cache -- status
npm run ops:state -- status

# Historical analysis
npm run db:cli -- query "SELECT * FROM db_version ORDER BY created_at DESC LIMIT 5;"
cat /Store/security-bot-state/current.json | jq '.cumulative'
```

---

[← Back to INDEX](INDEX.md) | [← Previous: Safety Guarantees](11-safety-guarantees.md) | [Next: Performance →](13-performance.md)