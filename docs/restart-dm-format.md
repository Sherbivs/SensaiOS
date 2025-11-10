# Restart DM Message Format

**Last Updated**: 2025-11-09  
**Status**: ✅ Enhanced with metrics transparency

## Overview

The restart DM notification provides comprehensive operational continuity and system health metrics to administrators when the security bot restarts.

## Message Template

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

## Metrics Transparency Contract

All metrics in the restart DM follow the **Metrics Transparency Contract** documented in `docs/metrics-transparency.md`:

### Database Metrics

**Status Values:**
- `initializing` - Database connection is being established
- `online` - Database is connected and healthy
- `disabled` - Database intentionally not configured (LOCAL in production)
- `error` - Database connection failed

**Latency Format:**
- ✅ Live value: `24.56ms`
- ❌ Unavailable: `<unavailable: initializing>` or `<unavailable: disabled>`

**Database Source Format:**
- ✅ Live value: `infinity_gauntlet_prod`
- ❌ Unavailable: `<unavailable: initializing>` or `<unavailable: disabled>`

### Unavailability Reasons

When metrics cannot be queried, the exact reason is declared:

- `<unavailable: initializing>` - Database provider still loading
- `<unavailable: not_connected>` - Database connection not established
- `<unavailable: disabled>` - Database intentionally not configured
- `<unavailable: not_queried_yet>` - Metric not collected in this cycle
- `<unavailable: no_provider>` - No database provider available
- `<unavailable: query_failed>` - Query attempt failed

## Implementation Details

### Message Construction

**Location**: `src/bot/main.js` - `notifyServiceRestart()` function

**Process**:
1. Build header with restart time and guild count
2. Add operational continuity section from `botState`
3. Add recent activity timeline (last 5 events)
4. Wait for database initialization (up to 30 seconds)
5. Query formatted stats from logger module
6. Append stats to message

### Stats Collection

**Location**: `src/utils/logger.js` - `getFormattedStats()` function

**Process**:
1. Refresh all stats (Node, Database, Security Bot)
2. Format Node stats (always available from process APIs)
3. Format Database stats with explicit unavailability declarations
4. Return formatted string

### Error Handling

**Missing Recipient**: Logs warning and records alert
**Database Timeout**: Sends message anyway with "initializing" status
**Stats Collection Failure**: Message sent without stats section

## Example Output

### Successful Restart (Database Online)

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

### Restart During Database Initialization

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

[NODE]
  Uptime: 34s
  Process: PID 73 | v22.16.0

  Memory: RSS 126.39 MB | Heap 25.83 MB/29.29 MB | External 25.96 MB
  CPU: User 2.22s | System 0.48s

[DATABASE]
  PROD  → initializing | Latency: <unavailable: initializing> | <unavailable: initializing>
  LOCAL → disabled | Latency: <unavailable: disabled> | <unavailable: disabled>
```

## Verification

To verify the restart message format:

1. **Build the project**: `npm run build`
2. **Deploy to Render** (automatic via GitHub push)
3. **Restart the bot** (via Render dashboard or automatic redeploy)
4. **Check DM** sent to configured `RESTART_DM_RECIPIENT`

## Configuration

**Environment Variable**: `RESTART_DM_RECIPIENT`  
**Format**: Discord user ID (string)  
**Required**: No (restart notifications disabled if not set)

## Related Documentation

- `docs/metrics-transparency.md` - Comprehensive metrics transparency contract
- `docs/security-bot-state.md` - State persistence and continuity tracking
- `src/utils/logger.js` - Stats collection and formatting implementation
- `src/bot/main.js` - Restart notification delivery

## Change History

**2025-11-09**: Enhanced with metrics transparency contract
- Replaced hardcoded "n/a" with explicit unavailability reasons
- Added `formatMetric()` helper for consistent formatting
- Updated `getFormattedStats()` to use transparency contract
- Removed "Failed reverts" line when count is 0 (cleaner output)

**2025-11-08**: Added operational continuity tracking
- Added state persistence summary
- Added recent activity timeline
- Added database stats section

**Original**: Basic restart notification
- Header with timestamp and guild count only
