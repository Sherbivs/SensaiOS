# Section 7: Security Bot

[← Back to INDEX](INDEX.md) | [← Previous: Error System](06-error-system.md) | [Next: Router System →](08-router-system.md)

---

**Philosophy**: "Security is not a feature—it's a foundation. The security bot is the immune system of the infrastructure."

**Purpose**: Automated permission management and security monitoring with cumulative state persistence across restarts.

## 7.1 State Persistence

**Security Bot Memory Across Restarts** — Cumulative statistics and state preservation using 7-day rolling history.

**Problem**: Original security bot lost all state on restart. Stats (sweeps, alerts, permission changes) reset to zero, losing operational history.

**Solution**: Persistent state storage with automatic recovery.

**Storage Location**: `/Store/security-bot-state/`

**File Structure**:

```
/Store/security-bot-state/
├── current.json                  # Active runtime state
├── previous.json                 # Backup from last restart
└── snapshots/                    # Hourly backups (7-day retention)
    ├── 2025-11-10T15-00-00.json
    ├── 2025-11-10T16-00-00.json
    └── ...
```

**State Schema**:

```typescript
interface SecurityBotState {
  version: number;                // State schema version
  lastUpdated: string;            // ISO timestamp
  
  // Cumulative statistics (never reset)
  stats: {
    totalSweeps: number;          // All-time permission sweeps
    totalAlerts: number;          // All-time security alerts
    totalChanges: number;         // All-time permission changes
    totalReverts: number;         // All-time unauthorized reverts
  };
  
  // Current session
  session: {
    startedAt: string;            // Current session start
    uptime: number;               // Milliseconds
    sweepsThisSession: number;
    alertsThisSession: number;
  };
  
  // Recent activity (last 7 days)
  recentSweeps: Array<{
    timestamp: string;
    guildId: string;
    changesDetected: number;
    changesReverted: number;
  }>;
  
  recentAlerts: Array<{
    timestamp: string;
    type: string;
    guildId: string;
    userId?: string;
    severity: "low" | "medium" | "high" | "critical";
  }>;
  
  // Guild-specific state
  guilds: Record<string, {
    lastSweep: string;
    totalSweeps: number;
    totalChanges: number;
    knownIssues: string[];
  }>;
}
```

**Initialization Flow**:

```typescript
// src/worker/security-bot-worker.ts
import { SecurityBotState } from "./security-bot-state.js";

async function initializeSecurityBot() {
  const state = await SecurityBotState.load();
  
  if (state) {
    log.info("Security bot state restored", {
      totalSweeps: state.stats.totalSweeps,
      totalAlerts: state.stats.totalAlerts,
      lastUpdated: state.lastUpdated
    });
  } else {
    log.info("Security bot state initialized (first run)");
  }
  
  // Start periodic sweeps with cumulative stats
  schedulePeriodicSweeps(state);
}
```

**Auto-Save Strategy**:

```typescript
// Save every 5 minutes + on critical events
setInterval(() => {
  SecurityBotState.save();
}, 5 * 60 * 1000);

// Save on shutdown
process.on("SIGTERM", async () => {
  await SecurityBotState.save();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await SecurityBotState.save();
  process.exit(0);
});
```

**Snapshot Rotation**:

```typescript
// Hourly snapshots with 7-day retention
setInterval(() => {
  SecurityBotState.snapshot();
  SecurityBotState.cleanOldSnapshots(7 * 24 * 60 * 60 * 1000); // 7 days
}, 60 * 60 * 1000);
```

**Recovery Scenarios**:

1. **Normal Restart**:
   - Load `current.json`
   - Restore cumulative stats
   - Continue from last state

2. **Corrupted State**:
   - Fall back to `previous.json`
   - Log warning
   - Continue with last good state

3. **Missing State Files**:
   - Check snapshots (most recent)
   - Fall back to fresh initialization
   - Log info

4. **State Version Mismatch**:
   - Attempt migration
   - Fall back to fresh initialization
   - Preserve what's compatible

**API**:

```typescript
// src/worker/security-bot-state.ts
export class SecurityBotState {
  static async load(): Promise<State | null>;
  static async save(): Promise<void>;
  static async snapshot(): Promise<void>;
  static async cleanOldSnapshots(maxAge: number): Promise<void>;
  
  static incrementSweeps(): void;
  static incrementAlerts(): void;
  static recordSweep(guildId: string, changes: number): void;
  static recordAlert(alert: Alert): void;
  
  static getStats(): Stats;
  static getRecentActivity(): RecentActivity;
  static getGuildState(guildId: string): GuildState;
}
```

**Benefits**:
- ✅ Cumulative statistics survive restarts
- ✅ Historical context for trend analysis
- ✅ Recovery from corrupted state
- ✅ 7-day rolling history
- ✅ Hourly snapshots for point-in-time recovery

**Performance**:
- State load: <10ms (small JSON files)
- State save: <50ms (async write)
- Snapshot: <100ms (copy + write)
- Memory overhead: ~1MB (in-memory state)

## 7.2 Restart DMs

**Security Bot Restart Notifications** — Automated status updates to admins on bot restart.

**Purpose**: Inform admins of security bot lifecycle events (startup, shutdown, crash recovery) with operational continuity context.

**DM Recipients**: Guild owners + users with Administrator permission in monitored guilds.

**Message Flow**:

```
Bot Restart → Load State → Send DMs to Admins → Resume Operations
```

**Startup DM**:

```
🛡️ Security Bot Online

The security bot has started and is now monitoring permissions.

📊 Statistics (All-Time):
• Total Sweeps: 1,234
• Total Alerts: 56
• Total Changes: 789
• Total Reverts: 12

⏱️ Last Session:
• Started: 2025-11-10 14:30:00 UTC
• Duration: 3h 45m
• Sweeps: 15
• Alerts: 2

🔍 Restored State:
• Loaded from: /Store/security-bot-state/current.json
• Last updated: 2025-11-10 18:15:23 UTC
• Guilds monitored: 5

Next sweep scheduled in 1 hour.
```

**Shutdown DM** (Graceful):

```
🛡️ Security Bot Shutting Down

The security bot is shutting down gracefully.

📊 Final Statistics (This Session):
• Sweeps: 15
• Alerts: 2
• Changes Detected: 8
• Changes Reverted: 1

💾 State Saved:
• File: /Store/security-bot-state/current.json
• Timestamp: 2025-11-10 18:30:00 UTC
• All stats preserved for next startup

The bot will resume operations on next deployment.
```

**Crash Recovery DM**:

```
⚠️ Security Bot Recovered from Crash

The security bot restarted after an unexpected shutdown.

📊 Recovered State:
• Source: /Store/security-bot-state/previous.json
• Last known activity: 2025-11-10 17:45:00 UTC
• Data loss: ~5 minutes (last auto-save interval)

📈 Cumulative Stats (Preserved):
• Total Sweeps: 1,234
• Total Alerts: 56

🔍 Diagnostic:
• Crash detected at: 2025-11-10 17:50:00 UTC
• Recovery time: 30 seconds
• Cause: Under investigation (check logs)

All operations resumed normally.
```

**Implementation**:

```typescript
// src/worker/security-bot-worker.ts
import { SecurityBotState } from "./security-bot-state.js";
import { sendAdminDMs } from "./security-bot-notifications.js";

async function onStartup() {
  const state = await SecurityBotState.load();
  
  const wasGracefulShutdown = state?.session.gracefulShutdown ?? false;
  const recoveredFromCrash = !wasGracefulShutdown && state !== null;
  
  await sendAdminDMs({
    type: recoveredFromCrash ? "crash-recovery" : "startup",
    state: {
      totalSweeps: state?.stats.totalSweeps ?? 0,
      totalAlerts: state?.stats.totalAlerts ?? 0,
      lastSession: state?.session,
      stateSource: recoveredFromCrash ? "previous.json" : "current.json"
    }
  });
}

async function onShutdown() {
  await SecurityBotState.markGracefulShutdown();
  await SecurityBotState.save();
  
  await sendAdminDMs({
    type: "shutdown",
    state: {
      sweepsThisSession: SecurityBotState.getStats().sweepsThisSession,
      alertsThisSession: SecurityBotState.getStats().alertsThisSession
    }
  });
}

process.on("SIGTERM", onShutdown);
process.on("SIGINT", onShutdown);
```

**DM Targeting**:

```typescript
async function getAdminRecipients(client: Client): Promise<User[]> {
  const recipients = new Set<User>();
  
  for (const guild of client.guilds.cache.values()) {
    // Guild owner
    const owner = await guild.fetchOwner();
    recipients.add(owner.user);
    
    // Administrators (fetch with fresh data for accurate permissions)
    const members = await guild.members.fetch({ force: true });
    for (const member of members.values()) {
      if (member.permissions.has("Administrator")) {
        recipients.add(member.user);
      }
    }
  }
  
  return Array.from(recipients);
}
```

**Rate Limiting**:
- DMs sent with 1-second delay between recipients (avoid Discord rate limits)
- Failed DMs logged but don't block startup
- Retry logic: 3 attempts with exponential backoff

**Configuration**:

```bash
# Environment variables
SECURITY_BOT_NOTIFY_ON_STARTUP=true      # Send startup DMs
SECURITY_BOT_NOTIFY_ON_SHUTDOWN=true     # Send shutdown DMs
SECURITY_BOT_NOTIFY_ON_CRASH=true        # Send crash recovery DMs
SECURITY_BOT_DM_COOLDOWN=3600000         # Min time between DMs (1h)
```

**Benefits**:
- ✅ Admins aware of security bot status
- ✅ Crash detection and recovery visibility
- ✅ Operational continuity context
- ✅ Historical stats preserved and communicated

---

[← Back to INDEX](INDEX.md) | [← Previous: Error System](06-error-system.md) | [Next: Router System →](08-router-system.md)