# Section 7: Security Bot

**Last Updated**: 2026-04-05 | **Status**: Production | **Phase 1 PostgreSQL Migration**: ✅ Complete | **DM Console UI**: ✅ Active

[← Back to INDEX](INDEX.md) | [← Previous: Error System](06-error-system.md) | [Next: Router System →](08-router-system.md)

---

**Philosophy**: "Security is not a feature—it's a foundation. The security bot is the immune system of the infrastructure."

**Purpose**: Automated permission management and security monitoring with cumulative state persistence across restarts.

## 7.1 State Persistence

**Security Bot Memory Across Restarts** — Cumulative statistics and state preservation using database-first architecture.

**Problem**: Original security bot lost all state on restart. Stats (sweeps, alerts, permission changes) reset to zero, losing operational history.

**Solution**: Database-first state storage with PostgreSQL `CacheEntry` table (migrated from /Store files 2025-12-27).

**Storage**: PostgreSQL `CacheEntry` table, namespace `security-bot-state`

**Database Keys**:

```
Namespace: security-bot-state
Keys:
├── security-bot-state:current       # Active runtime state
├── security-bot-state:previous      # Backup from last save
├── security-bot-state:snapshot:{ts}  # Timestamped snapshots (7-day retention)
├── security-bot-state:backup-{n}    # Rotating backups (0, 1, 2)
├── security-bot-state:role-archive   # Role change archive with HMAC
└── security-bot-state:baselines      # Security baselines with HMAC
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
// Entry point: security-bot.ts → src/bot/main.ts
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
// State management via src/bot/state/persistence.js
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
// Entry point: security-bot.ts → src/bot/main.ts → src/bot/state/
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
    
    // Administrators
    const members = await guild.members.fetch();
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

## 7.3 Gym Leader Channel-Role Sync

**Automated Role Assignment via Channel Access** — The 👑moderator-only👑 channel drives Gym Leader role membership.

**Added**: 2026-04-03 | **Channel ID**: `1129075047416463381` | **Role ID**: `1349132231880216631`

**Problem**: Gym Leader role assignment was manual and error-prone. Members added to the moderator-only channel should automatically receive the Gym Leader role, and members removed should lose it.

**Solution**: Two-path synchronization that covers both live changes and boot-time reconciliation.

### 7.3.1 Live Synchronization (channelUpdate)

When a Discord admin adds or removes a per-member permission overwrite on the moderator-only channel, the `channelUpdate` event handler:

1. Detects added/removed `OverwriteType.Member` entries by diffing old vs new overwrites
2. Grants or strips the Gym Leader role via `member.roles.add()` / `member.roles.remove()`
3. Writes a `RoleChangeAudit` record with `origin: 'moderator-channel-sync'` (HMAC + hash-chain)
4. Writes a `SecurityEvent` record with `eventType: 'moderator-channel-sync'`
5. The subsequent `guildMemberUpdate` event fires `maybeAlertRoleAssignments` which creates a DRIP `notice` alert (bot is recognized as authorized executor)

### 7.3.2 Boot-Time Reconciliation (syncModeratorChannelRoles)

On `ClientReady`, the bot runs a full reconciliation:

1. Fetches all per-member overwrites on the channel
2. Fetches all guild members
3. Grants the role to members with channel access who lack it
4. Strips the role from members without channel access who have it
5. Batch-writes all changes to `RoleChangeAudit` via `recordRoleChangesBatch()` (single hash-chain transaction)
6. Writes a summary `SecurityEvent` with severity `MEDIUM` if >10 changes, `INFO` otherwise
7. Fires DRIP alert (`security` severity if >10 changes, `notice` otherwise)
8. Records activity via `activityTracker` and updates CLI dashboard

### 7.3.3 Integration Matrix

| System | Boot Sync | Live channelUpdate |
|--------|-----------|-------------------|
| `RoleChangeAudit` (DB) | Batch write | Per-change write |
| `SecurityEvent` (DB) | Summary event | Per-change event |
| DRIP Alerts | If changes > 0 | Via guildMemberUpdate |
| `activityTracker` | Direct call | Via guildMemberUpdate |
| `updateSecurityCliSection` | Direct call | Via guildMemberUpdate |
| `report()` logging | Per-guild summary | Per-change log |

### 7.3.4 Configuration

```bash
# Environment variables (overridable, defaults to production IDs)
GYM_LEADER_ROLE_ID=1349132231880216631
MODERATOR_ONLY_CHANNEL_ID=1129075047416463381
```

**Source**: `src/config/env.ts` | **Handler**: `src/bot/main.ts`

### 7.3.5 Security Properties

- **No false alarms**: `maybeAlertRoleAssignments` recognizes the bot as authorized executor via audit log lookup
- **Idempotent**: Boot sync is safe to run multiple times — only acts on actual mismatches
- **Audit trail**: Every grant/revoke has a corresponding `RoleChangeAudit` with HMAC signature and hash-chain link
- **Graceful degradation**: DB write failures are caught and logged but don't block the role operation
- **Gateway intents**: Requires `Guilds` (channelUpdate) + `GuildMembers` (member.roles operations) — both already enabled

---

## 7.4 DM Console UI (2026-04-05)

**Interactive Management Console via Direct Messages** — The security bot provides a rich embed/button management console for authorized operators, replacing the original text-based DM command interface.

**Architecture**: `src/bot/dm-console/` module (4 files: types.ts, panels.ts, actions.ts, index.ts)

**Authorization**: `canUseDirectStatusCommand()` gate checks guild ownership + Administrator permission.

> **Note**: The original 17 text-based DM commands (stats, status, roles, etc.) remain functional via backward-compatible text command mapping in `dm-console/index.ts`. Typing a legacy command name automatically routes to the corresponding panel.

### 7.4.1 Trainer Coverage Calculation

**Coverage Formula:** Members with Role / Eligible Members × 100

**Coverage Metrics**:
- **Eligible Members**: All guild members excluding bot accounts (Discord.js reports these as `bot: true`)
- **Members with Role**: Count of members assigned the Trainer/Drip role
- **Fallback Denominator**: If eligible count is unavailable, use total members

**Reason for Bot Exclusion**: Bot accounts should not consume trainer coverage quota; only human members count as part of coverage responsibility. A guild with 470 human members + 2 bots shows as 470/470 (100%) if all humans have the role, not 470/472.

**Display Sources** (all using identical calculation):
- DM Console Overview panel (`renderOverview()` in panels.ts)
- Logger metrics (`formatSecurityMetrics()` in main.ts)
- Both fallback to `totalMembers` when `totalEligibleMembers` is unavailable

**Data Quality**:
- `partial: true` = Estimated coverage (partial guild member fetch)
- `partial: false` = Complete coverage (all guild members cached)

### 7.4.2 Panel Architecture

| Panel | Type | Content |
|-------|------|---------|
| **Main Menu** | Navigation hub | Status, uptime, guilds, sweep/alert counts, 4 nav buttons |
| **Overview** | Read-only | Bot identity, memory, heap, environment, engine cache stats, guild list with sweep times, trainer coverage |
| **Security** | Hub + select menu | Sweep status, last alert, perm changes, total sweeps, assignments. Sub-panels: Roles, Members, Admins, Channels, Audit, Changes |
| **System** | Actions | Pause/Resume/Restart sweep, Force sweep, Clear/Rebuild cache |
| **Logs** | Read-only | Recent log entries, error queue, bot list |

### 7.4.2 Sub-Panels (Paginated)

| Panel | Data Source | Page Size |
|-------|------------|-----------|
| Roles | `discord_roles` | 12 per page |
| Members | `discord_members` | 12 per page |
| Admins | `discord_members` (filtered) | 12 per page |
| Channels | `discord_channels` | 12 per page |
| Audit | `role_change_audit` | 12 per page |
| Changes | `role_change_audit` (failures) | 12 per page |
| Errors | `pendingOpsErrorQueue` | 12 per page |
| Bots | `discord_members` (bots) | 12 per page |

### 7.4.3 Drip Relationship Indicators

| Indicator | Meaning |
|-----------|---------|
| `🤖 DRIP ROLE` | The role belonging to Drip bot |
| `🤖 Has Drip` | User/bot has the Drip role assigned |
| `🤖 THIS BOT` | The Dripbot user itself |
| `✅🤖` / `❌🤖` | Channel has/lacks Drip permission overwrite |

### 7.4.4 Action Handlers

| Action | Button ID | Effect |
|--------|-----------|--------|
| Pause Sweep | `sys:pause` | Sets `continuousSweepState.running = false` |
| Resume Sweep | `sys:resume` | Calls `startContinuousSweepLoop()` |
| Restart Sweep | `sys:restart` | Stop → re-enable |
| Force Sweep | `sys:force_sweep` | Immediate sweep all guilds |
| Clear Cache | `sys:clear_cache` | Purge in-memory caches |
| Rebuild Cache | `sys:rebuild_cache` | Clear + reinitialize engine cache |

### 7.4.5 ConsoleContext

The DM console receives a `ConsoleContext` object from `main.ts` containing all necessary state and functions — the console module has zero imports from `main.ts` internals. This includes:
- Discord client, Prisma client
- Security CLI state (sweep stats, alert tracking)
- Bot persistent state (cumulative stats, timeline)
- Sweep control functions
- Engine cache reference
- Logging/reporting functions

**Source**: `src/bot/dm-console/` | **Wiring**: `src/bot/main.ts` (`buildConsoleContext()`, InteractionCreate handler, MessageCreate DM handler)

---

## 7.5 Startup Sync Blocking (2026-04-03)

**Deterministic Boot Sequence** — Three sync operations are now awaited at startup instead of fire-and-forget.

**Problem**: `syncGuildSnapshot()`, `syncModeratorChannelRoles('boot')`, and `enforceDripRoleAllChannels('boot')` were all fire-and-forget at boot. This meant the bot could start periodic sweeps before the initial sync completed, leading to stale data in browse commands and missed role corrections.

**Solution**: All three operations are now `await`ed at startup with individual try/catch wrappers. Failures are non-fatal — logged as warnings but the bot continues startup. Only the `startup` origin triggers blocking; periodic sweeps remain fire-and-forget.

### 7.5.1 Boot Sequence

```
ClientReady
  ├── await syncGuildSnapshot()              ← Blocking: snapshot guild state to DB
  ├── await syncModeratorChannelRoles('boot') ← Blocking: reconcile Gym Leader roles
  ├── await enforceDripRoleAllChannels('boot') ← Blocking: ensure Drip overwrites
  └── Start periodic sweep scheduler          ← Only begins after sync completes
```

### 7.5.2 Error Handling

Each sync operation has its own try/catch:
- Failure in one does not prevent the others from running
- Errors are logged with full context (guild ID, operation name, error message)
- The bot still starts and enables periodic sweeps even if a sync fails
- This preserves the "security bot must always be running" invariant

---

## 7.6 Guild Snapshot Sync (2026-04-02)

**Production-Ready Guild State Persistence** — Full guild state (members, roles, channels, bots) synced to PostgreSQL for observability and browse commands.

**Purpose**: Provide a queryable database snapshot of guild state for the DM command surface (§7.4) and production observability.

### 7.6.1 Sync Trigger Points

| Trigger | Timing | Blocking? |
|---------|--------|-----------|
| Bot startup (`ClientReady`) | On boot | Yes (awaited) |
| Before each periodic sweep | In sweep finally block | No (fire-and-forget) |

### 7.6.2 Tables Updated

| Table | Content | Key Fields |
|-------|---------|------------|
| `discord_guilds` | Guild metadata | id, name, memberCount, ownerId |
| `discord_members` | Member roster | userId, username, roles[], joinedAt, isBot |
| `discord_roles` | Role definitions | id, name, position, color, permissions, memberCount |
| `discord_channels` | Channel list | id, name, type, position, topic |

All records are upserted (create-or-update) using parameterized Prisma queries — no raw SQL, no injection vectors.

---

## 7.7 Channel Overwrite Enforcement (2026-04-02)

**Persistent Drip Role Channel Access** — `enforceDripRoleAllChannels()` ensures the Drip bot role has `ViewChannel` + `SendMessages` permission overwrites on all guild channels.

**Trigger Points**: Boot (blocking) + Periodic sweeps (fire-and-forget)

**Per-Channel Logic**:
1. Check if the channel already has a Drip role overwrite
2. If missing, create an overwrite granting `ViewChannel` + `SendMessages`
3. If present but insufficient, update to include required permissions
4. Log each channel action (added/updated/skipped)

**Source**: `src/bot/main.ts` → `enforceDripRoleAllChannels(origin)`

---

[← Back to INDEX](INDEX.md) | [← Previous: Error System](06-error-system.md) | [Next: Router System →](08-router-system.md)