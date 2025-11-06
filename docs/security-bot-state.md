# Security Bot State Persistence System

## Overview

The security bot maintains operational state across restarts to provide continuity, cumulative metrics, and intelligent recovery. State snapshots are stored as JSON files with automatic versioning and migration support.

**Purpose:** Give the bot "memory" so it remembers its operational history, displays cumulative statistics instead of resetting to zero, and can resume monitoring from where it left off after restarts or crashes.

## Architecture

### Storage Structure

```
Store/security-bot-state/
├── current.json          # Active runtime state (auto-saved every 5 minutes)
├── previous.json         # Backup from last restart
├── snapshots/           # Timestamped backups (7-day retention)
│   ├── 2025-11-06T15-30-00.json
│   └── 2025-11-06T14-00-00.json
└── schema.md            # JSON schema documentation
```

### State Lifecycle

1. **Startup:**
   - Load `current.json` (or `previous.json` as fallback)
   - Validate schema version and migrate if needed
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

## Module Structure

### `src/bot/state/persistence.js`

Core state management module providing:

- `initializeState()` - Load previous state and initialize for new session
- `saveState(state)` - Persist current state to disk
- `shutdownState(state, reason)` - Graceful shutdown with final save
- `startAutoSave(state)` - Begin 5-minute auto-save interval
- `stopAutoSave(interval)` - Stop auto-save interval
- `loadState()` - Load state with fallback chain
- `addTimelineEvent(state, event)` - Append to activity timeline
- `updateCumulativeStats(state, updates)` - Increment counters
- `updateGuildState(state, guildId, updates)` - Track guild-specific state
- `updateRuntimeState(state, updates)` - Update current session info

**Key Features:**
- Three-tier fallback: `current.json` → `previous.json` → default state
- Automatic schema migration when versions change
- Timestamped snapshots with auto-pruning
- Error-tolerant (never crashes bot due to state persistence failures)

### `src/bot/state/stats.js`

Statistics collection and formatting:

- `recordSweep()` - Log role sweep completion
- `recordPermissionChange()` - Log unauthorized change detection + revert
- `recordAlert()` - Log administrator alert sent
- `recordError()` - Log error events
- `updateDatabaseStatus()` - Track DB connection health
- `getStatsSummary()` - Get formatted summary for display
- `getRecentEvents()` - Retrieve last N timeline events
- `formatUptime()` - Convert ms to human-readable duration

**Tracked Metrics:**
- Total uptime (across all restarts)
- Total sweeps performed
- Total alerts sent
- Permission changes detected/reverted
- Revert failures
- Guild count
- Database connection status (DEV + PROD)

### `src/bot/state/timeline.js`

Activity timeline management and formatting:

- `formatTimelineEvent()` - Human-readable event description
- `getEventsByType()` - Filter by event type
- `getEventsByGuild()` - Filter by guild
- `getEventsByTimeRange()` - Filter by timestamp range
- `getTimelineSummary()` - Aggregate statistics
- `getFormattedTimeline()` - Discord-friendly event list
- `getRecentActivitySummary()` - Condensed summary for restart DMs
- `buildTimelineEmbedFields()` - Discord embed fields

**Event Types:**
- `sweep` - Role permission sweep completed
- `permission_change` - Unauthorized change detected
- `alert` - Administrator alert sent
- `restart` - Bot restarted
- `shutdown` - Graceful shutdown
- `error` - Critical error encountered

### `src/bot/state/context.js`

Operational context restoration:

- `restoreGuildContext()` - Retrieve guild's previous monitoring state
- `getTimeSinceLastSweep()` - Calculate time since last guild sweep
- `isSweepOverdue()` - Check if guild needs immediate sweep
- `getGuildsNeedingSweep()` - List guilds with overdue sweeps
- `initializeGuild()` - Create or update guild entry
- `enableGuildMonitoring()` / `disableGuildMonitoring()` - Toggle monitoring
- `getMonitoringStatus()` - Export all guild states
- `buildRestartSummary()` - Format restart DM content
- `getRecoveryRecommendations()` - Suggest actions after restart

**Guild State Tracking:**
- Last sweep timestamp
- Total sweeps performed
- Total alerts sent
- Permission changes detected
- Monitoring enabled/disabled
- Last activity timestamp

## Integration Points

### Security Bot (`src/bot/main.js`)

State persistence integrates at key lifecycle points:

**Startup (ClientReady event):**
```javascript
botState = await initializeState();
autoSaveInterval = startAutoSave(botState);
```

**Restart Notification:**
Enhanced DM shows:
- Restart number
- Time since last restart
- Total all-time uptime
- Cumulative stats (sweeps, alerts, reverts)
- Recent activity timeline

**After Sweeps:**
```javascript
recordSweep(botState, guildId, guildName, rolesChecked, changesDetected);
```

**On Permission Changes:**
```javascript
recordPermissionChange(botState, guildId, guildName, userId, userName, action, reverted, revertStatus);
```

**On Alerts:**
```javascript
recordAlert(botState, guildId, recipient, reason, delivered);
```

**Graceful Shutdown:**
```javascript
process.on('SIGTERM', async () => {
  stopAutoSave(autoSaveInterval);
  await shutdownState(botState, 'SIGTERM');
  process.exit(0);
});
```

### `/ops state` Command

Administrator command to view operational state:

**Basic Usage:**
```
/ops state
```

Shows:
- Cumulative statistics
- Database connection status
- Recent activity summary (last 5 events)
- State metadata

**Full Timeline:**
```
/ops state timeline:true
```

Shows last 20 timeline events with details.

**Guild Details:**
```
/ops state guilds:true
```

Shows per-guild monitoring status, sweep counts, last activity.

## JSON Schema (Version 1.0.0)

### Root Object

```json
{
  "version": 1,
  "schemaVersion": "1.0.0",
  "metadata": { ... },
  "cumulative": { ... },
  "timeline": [ ... ],
  "guilds": { ... },
  "runtime": { ... }
}
```

### `metadata`

Session metadata:
- `lastSaved` - ISO timestamp of last persistence
- `lastRestart` - ISO timestamp of most recent restart
- `processStartTime` - Current process start time
- `hostname` - Server hostname (e.g., Render service name)
- `nodeVersion` - Node.js version
- `botVersion` - Bot semantic version

### `cumulative`

All-time totals:
- `totalUptime` - Total milliseconds online (all restarts)
- `restartCount` - Number of restarts
- `sweepCount` - Total sweeps performed
- `alertCount` - Total alerts sent
- `permissionChangesDetected` - Unauthorized changes found
- `permissionChangesReverted` - Successfully reverted
- `revertFailures` - Failed revert attempts
- `guildCount` - Current number of guilds
- `firstStartTime` - ISO timestamp of first ever start

### `timeline`

Array of recent events (max 100, rolling window):

```json
{
  "timestamp": "2025-11-06T15:30:00.000Z",
  "type": "sweep",
  "guildId": "1234567890",
  "guildName": "Test Guild",
  "details": {
    "rolesChecked": 45,
    "changesDetected": 0
  }
}
```

Event types: `sweep`, `permission_change`, `alert`, `restart`, `shutdown`, `error`

### `guilds`

Object keyed by guild ID:

```json
{
  "1234567890": {
    "id": "1234567890",
    "name": "Test Guild",
    "lastSweep": "2025-11-06T15:25:00.000Z",
    "sweepCount": 150,
    "alertCount": 5,
    "permissionChanges": 3,
    "monitoring": true,
    "lastActivity": "2025-11-06T15:25:00.000Z"
  }
}
```

### `runtime`

Current session state (reset on restart):
- `currentUptime` - Milliseconds since process start
- `currentRestartTime` - ISO timestamp of process start
- `databaseStatus` - `{ dev: "healthy", prod: "healthy" }`
- `activeSweepIntervals` - Array of guild IDs with active timers

## Error Handling

State persistence is designed to never crash the bot:

1. **Corrupt State Files:**
   - Try `current.json`
   - Fall back to `previous.json`
   - Fall back to default empty state
   - Log error but continue

2. **Save Failures:**
   - Log error
   - Continue operation
   - Retry on next auto-save

3. **Schema Migration Errors:**
   - Log warning
   - Use state as-is
   - Continue operation

4. **Graceful Shutdown Failures:**
   - Best-effort save
   - Don't block process exit
   - State recoverable from auto-save

## Performance

- **Startup:** < 100ms (load + migrate + save)
- **Auto-save:** < 50ms every 5 minutes (async, non-blocking)
- **Event Recording:** < 1ms (in-memory append)
- **State Size:** ~10-50 KB typical, ~100 KB max
- **Disk I/O:** Minimal (auto-save + graceful shutdown only)

## Security

- **No Secrets:** State files contain no tokens or credentials
- **Public Identifiers Only:** Guild/user IDs are Discord public data
- **No Message Content:** Only metadata (timestamps, counts, IDs)
- **Read Access:** Anyone with filesystem access (local dev only)
- **Production:** State persists on Render worker disk (ephemeral but restarts preserve)

## Migration Strategy

When schema versions change:

```javascript
function migrateV1toV2(oldState) {
  return {
    version: 2,
    schemaVersion: "2.0.0",
    metadata: {
      ...oldState.metadata,
      // Add new fields with defaults
      migrationDate: new Date().toISOString(),
    },
    cumulative: oldState.cumulative,
    timeline: oldState.timeline,
    guilds: oldState.guilds,
    runtime: oldState.runtime,
    // Add new sections
    newFeature: {},
  };
}
```

Migrations are automatic and non-destructive. Old snapshots remain readable.

## Troubleshooting

### State Not Persisting

1. Check `Store/security-bot-state/` exists
2. Verify write permissions
3. Check logs for save errors
4. Confirm auto-save started (`startAutoSave` called)

### `/ops state` Shows "Not Available"

1. Ensure bot fully initialized (ClientReady fired)
2. Check `botState` exported from `main.js`
3. Verify state modules imported correctly
4. Check logs for initialization errors

### Restart DM Missing State Info

1. Confirm `botState` initialized before `notifyServiceRestart()`
2. Check `buildRestartSummary()` accessible
3. Verify `getRecentActivitySummary()` returns data
4. Check state timeline has events

### State Reset After Restart

1. Confirm `previous.json` exists and readable
2. Check for schema migration errors
3. Verify fallback chain working
4. Check snapshot retention (7-day auto-prune)

## Future Enhancements

Potential additions (not yet implemented):

- State compression for large timelines
- Remote state backup (S3, database)
- State export/import commands
- Historical trend analysis
- Alerting on anomalies (e.g., spike in permission changes)
- State replication across distributed workers

## References

- Schema: `Store/security-bot-state/schema.md`
- Implementation: `src/bot/state/*.js`
- Integration: `src/bot/main.js` (startup, shutdown, event recording)
- Admin Interface: `src/bot/ops/admin.ts` (`/ops state` command)
- Command Registration: `src/commands/ops.js`
