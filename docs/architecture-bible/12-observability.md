# Section 12: Observability

[← Back to INDEX](INDEX.md) | [← Previous: Safety Guarantees](11-safety-guarantees.md) | [Next: Performance →](13-performance.md)

---

**Philosophy**: "Observability is not optional—every metric must be queried live or explicitly declared unavailable with reason."

**Purpose**: Comprehensive monitoring and metrics transparency for production operations.

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
  Memory: 342 MB / 512 MB (66.8%)
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