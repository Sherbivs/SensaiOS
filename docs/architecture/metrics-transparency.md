
# Metrics Transparency Documentation

**Last Updated:** 2025-11-09  
**Purpose:** Ensure all metrics are either queried live or explicitly declared unavailable with reason.

## Principle

**Zero hardcoded metrics.** Every metric displayed in console output must be:
1. **Queried from a live source** (process.memoryUsage, getDatabaseStats, etc.), OR
2. **Explicitly declared unavailable** with a specific reason explaining why it cannot be queried

## Unavailability Reasons

When a metric cannot be queried, the system declares one of these standardized reasons:

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

## Display Format

Unavailable metrics are displayed with explicit reasoning:

```
<unavailable: reason>
```

**Examples:**
- `<unavailable: not-queried-yet>` - Provider hasn't been initialized yet
- `<unavailable: no-provider>` - No stats provider available (Prisma/pg-connection failed to load)
- `<unavailable: disabled>` - Feature is intentionally disabled (e.g., LOCAL database not configured)
- `<unavailable: query-failed>` - Stats query threw an error

## Metric Sources

### Node Stats
**Source:** Node.js built-in APIs
- Uptime: `process.uptime()`
- Memory: `process.memoryUsage()` (rss, heapUsed, heapTotal, external)
- CPU: `process.cpuUsage()` (user, system)
- PID: `process.pid`
- Version: `process.version`

**Availability:** Always available (Node.js runtime guarantees)

### Database Stats
**Source:** `getDatabaseStats()` from Prisma client or pg-connection fallback
- Status: Queried from connection health checks
- Latency: Queried from `SELECT 1` timing
- Connections: Queried from `pg_stat_activity` count
- Source: Extracted from connection string

**Availability:** 
- Depends on database connection initialization
- Falls back to explicit unavailability reasons if provider not loaded
- Declares specific reason (no-provider, not-connected, query-failed, etc.)

### Security Bot Stats
**Source:** `global.securityBotState` and `global.securityBotClient`
- Status: Queried from client.isReady()
- Guilds: Queried from client.guilds.cache.size
- Last Sweep: Queried from botState.timeline.events
- Assignments/Failures: Queried from botState.stats

**Availability:**
- Only applicable when running inside security bot worker
- Returns null for other services (not-applicable)
- Declares bot-initializing during startup

## Implementation

### Metric Formatting Function

```javascript
/**
 * Format a metric value with explicit unavailability reason when null.
 * @param {any} value - The metric value
 * @param {string|null} reason - The unavailability reason
 * @param {function} formatter - Optional formatter for non-null values
 * @returns {string} Formatted string declaring why metric is unavailable if null
 */
function formatMetric(value, reason, formatter = null) {
  if (value === null || value === undefined) {
    // Explicitly declare why metric cannot be queried
    return `<unavailable: ${reason || 'unknown'}>`;
  }
  
  return formatter ? formatter(value) : String(value);
}
```

### Usage Example

```javascript
// Database latency with explicit unavailability handling
const prodLatency = formatMetric(
  statsCache.databases.prod.latency,           // Queried value or null
  statsCache.databases.prod.latencyReason,     // Reason if null
  (val) => `${val.toFixed(2)}ms`              // Formatter for non-null
);

// Output examples:
// "45.23ms"                              (when queried successfully)
// "<unavailable: not-queried-yet>"       (when provider not initialized)
// "<unavailable: no-provider>"           (when Prisma/pg-connection unavailable)
```

## Console Output Example

```
─────────────────────────────────────────────────────────────────────────
[NODE]
  Uptime: 1h 23m 45s
  Process: PID 12345 | v22.10.0

  Memory:
    RSS:      245.6 MB
    Heap:     123.4 MB / 200.0 MB
    External: 12.3 MB

  CPU:
    User:   45.23s
    System: 12.34s

[DATABASE]
  PROD  = ONLINE        Latency: 45.23ms                        Database: infinity_gauntlet_db
  LOCAL = DISABLED      Latency: <unavailable: disabled>        Database: <unavailable: disabled>

[SECURITY BOT]
  Status: ONLINE
  Guilds: 3 (queried from client.guilds.cache.size)
  Last Sweep: 2m ago (queried from botState.timeline.events)

  Lifetime Statistics (queried from botState.stats):
    Assignments: 142
    Failures:    3
─────────────────────────────────────────────────────────────────────────
```

## Benefits

1. **Transparency:** Operators immediately see why a metric is unavailable instead of seeing ambiguous "n/a" or "unknown"
2. **Debugging:** Explicit reasons help diagnose initialization issues, connection problems, or provider failures
3. **Accountability:** Zero hardcoded values - every metric is either live data or explicitly declared unavailable
4. **Observability:** Clear distinction between "metric shows 0" (live data) and "metric unavailable" (query failed)

## Migration Path

**Before (Hardcoded):**
```javascript
const prodLatency = stats.prod.latency || 'n/a';  // Ambiguous
```

**After (Explicit):**
```javascript
const prodLatency = formatMetric(
  stats.prod.latency,
  stats.prod.latencyReason,
  (val) => `${val.toFixed(2)}ms`
);
// Output: "45.23ms" or "<unavailable: not-queried-yet>"
```

## Testing

Verify metrics transparency:

```bash
# Start service and observe console output
npm run dev

# Expected behaviors:
# 1. Node stats always show live values (never unavailable)
# 2. Database stats show explicit reasons when unavailable
# 3. Security bot stats show explicit reasons or return null for non-security services
# 4. No hardcoded "n/a", "unknown", or empty strings
```

## Related Files

- `src/utils/logger.js` - Core metrics collection and formatting
- `src/shared/prisma.ts` - Database stats provider (getDatabaseStats)
- `src/bot/main.js` - Security bot state exposure (global.securityBotState)

## Contract

**Absolute:** Never display a metric without either:
1. Querying it from a live source, OR
2. Declaring explicitly why it cannot be queried

Violations result in ambiguous "n/a" or "unknown" strings that provide no debugging value.
