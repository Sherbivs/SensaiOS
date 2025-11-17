# Section 5: Monitoring

[← Back to INDEX](INDEX.md) | [← Previous: Environment Management](04-environment-management.md)

---

**Philosophy**: "Observability is not optional—every metric must be live or explicitly unavailable with reason."

**Purpose**: Error dashboard, service health, performance metrics, alerting configuration.

## 5.1 Error Dashboard (`/ops error`)

### Command Overview

**Discord Command:** `/ops error [filter] [type]`

**Purpose:** Query, filter, and drill down into operational errors across all services.

**Permissions:** Admin-only (via `isAdmin()` check)

### Filter Options

| Filter | Description | Example |
|--------|-------------|---------|
| `all` | Show all errors (default) | `/ops error all` |
| `recent` | Last 10 errors | `/ops error recent` |
| `service:<name>` | Filter by service name | `/ops error service:discord-bot` |
| `severity:<level>` | Filter by severity (error, warn, info) | `/ops error severity:error` |
| `date:<YYYY-MM-DD>` | Filter by date | `/ops error date:2025-11-10` |

### Type Options

| Type | Description | Output Format |
|------|-------------|---------------|
| `summary` | Error count by service (default) | Table with counts |
| `detailed` | Full error details | Multi-page embed |
| `export` | Generate CSV report | Downloadable file |

### Output Examples

**Summary View:**
```
═══════════════════════════════════════════════════════════
   ERROR DASHBOARD — SUMMARY
═══════════════════════════════════════════════════════════

Service             | Count | Last Seen
--------------------|-------|----------------------------
discord-bot         |    42 | 2025-11-10T12:34:56Z
database            |     8 | 2025-11-10T11:22:33Z
event-bus           |     3 | 2025-11-10T10:15:20Z
security-bot        |     1 | 2025-11-09T23:45:10Z

Total Errors: 54
Time Range: Last 7 days
```

**Detailed View:**
```
═══════════════════════════════════════════════════════════
   ERROR DASHBOARD — DETAILED (Page 1/3)
═══════════════════════════════════════════════════════════

Error #42
  Time: 2025-11-10T12:34:56Z
  Service: discord-bot
  Severity: error
  Message: Failed to execute battle turn
  Stack: Error: Pokemon not found (ID: 123)
    at resolveTurn (battle-engine.ts:145)
    at executeTurn (battle-turn.js:89)
  Context:
    trainerId: 987654321
    battleId: abc123def456
    moveId: 1
```

### Integration with ErrorTracker

**Backend Implementation:**
```typescript
// src/bot/ops/admin.ts
import { ErrorTracker } from '../../services/error-tracker.js';

async function executeOpsErrorCommand(interaction, filter, type) {
  const tracker = ErrorTracker.getInstance();
  const errors = tracker.getErrors({ filter });
  
  if (type === 'summary') {
    return formatSummary(errors);
  } else if (type === 'detailed') {
    return formatDetailed(errors);
  }
}
```

**Error Recording:**
```typescript
// src/services/error-tracker.ts
import { ErrorTracker } from './error-tracker.js';

try {
  await executeBattleTurn(battle, move);
} catch (error) {
  ErrorTracker.getInstance().recordError({
    service: 'discord-bot',
    severity: 'error',
    message: error.message,
    stack: error.stack,
    context: { trainerId, battleId, moveId }
  });
  throw error;
}
```

## 5.2 Service Health

### Health Check Endpoints

**Web Service** (`infinity-gauntlet-bot`):
- **Endpoint:** `https://infinity-gauntlet-bot.onrender.com/health`
- **Response:** `{ "status": "healthy", "uptime": 12345, "memory": 342MB }`

**Worker Health Signals:**
- `worker.outbox.health` — Outbox worker status
- `worker.cache.health` — Cache worker status
- `worker.pipeline.health` — Data pipeline worker status
- `security.*` — Security bot events

### Monitoring Commands

```bash
# Check all services status
npm run render:status

# View service logs
npm run render:logs -- infinity-gauntlet

# Check specific service health
curl https://infinity-gauntlet-bot.onrender.com/health
```

### Health Thresholds

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| **Memory Usage** | <350 MB | 350-450 MB | >450 MB |
| **CPU Usage** | <70% | 70-85% | >85% |
| **Database Latency** | <100ms | 100-200ms | >200ms |
| **Event Bus Queue** | <50 messages | 50-200 messages | >200 messages |
| **Cache Staleness** | <10 minutes | 10-30 minutes | >30 minutes |

## 5.3 Performance Metrics

### Real-Time Metrics Dashboard

**Console Output** (Auto-refreshes every 15 seconds):

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

### Metric Sources

**Node Stats** (Always Available):
- Uptime: `process.uptime()`
- Memory: `process.memoryUsage()` (rss, heapUsed, heapTotal, external)
- CPU: `process.cpuUsage()` (user, system)
- PID: `process.pid`
- Version: `process.version`

**Database Stats** (Conditionally Available):
- Source: `getDatabaseStats()` from Prisma client
- Status: Connection health checks
- Latency: `SELECT 1` timing
- Connections: `pg_stat_activity` count

**Security Bot Stats** (Service-Specific):
- Source: `global.securityBotState` and `global.securityBotClient`
- Status: `client.isReady()`
- Guilds: `client.guilds.cache.size`
- Last Sweep: `botState.timeline.events`

**Unavailability Reasons:**
```javascript
const METRIC_UNAVAILABLE = Object.freeze({
  NOT_QUERIED_YET: 'not-queried-yet',
  INITIALIZING: 'initializing',
  NO_PROVIDER: 'no-provider',
  QUERY_FAILED: 'query-failed',
  NOT_CONNECTED: 'not-connected',
  DISABLED: 'disabled',
  NOT_APPLICABLE: 'n/a',
});
```

See [ARCHITECTURE-BIBLE § Observability](../architecture-bible/12-observability.md) for comprehensive metrics documentation.

## 5.4 Alerting

### DRIP Alert System

**Purpose:** Critical alerts delivered via Discord webhook to DripTVDD.

**Configuration:**
```bash
ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/...
ALERT_CHANNEL_ID=123456789
ALERT_USER_ID=987654321  # DripTVDD's Discord user ID
```

**Alert Levels:**

| Level | Trigger | Example |
|-------|---------|---------|
| **INFO** | Informational events | Service restarted, deployment complete |
| **WARN** | Potential issues | Memory usage >350 MB, queue depth >50 |
| **ERROR** | Service degradation | Database connection failed, worker crashed |
| **CRITICAL** | Production outage | All services down, data loss detected |

### Alert Triggers

**Memory Alerts:**
```typescript
// Trigger when memory exceeds 450 MB (88% of 512 MB limit)
if (memoryUsage > 450 * 1024 * 1024) {
  sendDripAlert({
    level: 'CRITICAL',
    message: 'Memory usage critical',
    context: { memoryUsage, limit: 512 * 1024 * 1024 }
  });
}
```

**Event Bus Alerts:**
```typescript
// Trigger when queue depth exceeds 200 messages
if (queueDepth >= 200) {
  sendDripAlert({
    level: 'ERROR',
    message: 'Event bus queue depth critical',
    context: { queueDepth, threshold: 200 }
  });
}
```

**Database Alerts:**
```typescript
// Trigger when latency exceeds 200ms for 5 consecutive queries
if (consecutiveSlowQueries >= 5) {
  sendDripAlert({
    level: 'WARN',
    message: 'Database latency elevated',
    context: { latency, threshold: 200 }
  });
}
```

### Alert Escalation

**Escalation Path:**
1. **Automatic Alert** → DRIP webhook sends Discord message
2. **Operator Response** → DripTVDD investigates via `/ops` commands
3. **Escalation** → If unresolved in 15 minutes, page additional operators
4. **Incident Report** → Document in Tasklist.md after resolution

### Alert History

**Query Alert Log:**
```bash
# View recent alerts
grep "DRIP alert sent" logs/app.log | tail -20

# Count alerts by level
grep "DRIP alert sent" logs/app.log | grep -c "level=CRITICAL"

# Export alert history
grep "DRIP alert sent" logs/app.log > alerts-$(date +%Y%m%d).log
```

## 5.5 Incident Response

### Runbook Checklist

**When Alert Fires:**

1. **Acknowledge Alert** (within 5 minutes)
   - React to Discord message with 👀 emoji
   - Begin investigation immediately

2. **Assess Impact** (within 10 minutes)
   - Check `/ops stats` for current state
   - Review recent logs via `npm run render:logs`
   - Determine affected services and users

3. **Mitigate** (within 30 minutes)
   - If memory critical → Restart affected service
   - If queue backed up → Scale outbox worker or pause enqueueing
   - If database slow → Check for long-running queries, consider connection reset

4. **Document** (after resolution)
   - Record incident timeline in Tasklist.md
   - Note root cause and mitigation steps
   - Update runbook with lessons learned

### Common Incident Patterns

**Memory Leak:**
- **Symptoms:** Memory usage climbing over hours
- **Diagnosis:** Check for unbounded data structures, missing cache eviction
- **Mitigation:** Restart service, investigate leak source
- **Prevention:** Implement memory profiling, bounded data structures

**Event Bus Backlog:**
- **Symptoms:** Queue depth >200, message delivery delays
- **Diagnosis:** Check Render DB health, network connectivity
- **Mitigation:** Scale outbox worker, pause enqueueing if necessary
- **Prevention:** Implement backpressure, alert threshold tuning

**Database Connection Failures:**
- **Symptoms:** Repeated connection errors, timeouts
- **Diagnosis:** Check Render DB status, network issues
- **Mitigation:** Reset connections, failover to on-premise mirror if available
- **Prevention:** Implement connection pooling, retry logic

---

[← Back to INDEX](INDEX.md) | [← Previous: Environment Management](04-environment-management.md)