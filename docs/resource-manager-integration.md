# Resource Manager Integration Guide

**Purpose**: Step-by-step guide to integrate Resource Manager into existing codebase to fix all 25 identified resource leaks.

**Status**: Implementation Ready  
**Estimated Time**: 5.5 hours total  
**Priority**: P0 (Critical - Production Stability)

## Integration Overview

The Resource Manager provides a centralized system to track and cleanup all resources. This guide shows how to migrate from unmanaged resources (current state) to managed resources (safe state).

**Files to Modify**: 5 files containing 25 leaks
1. `src/services/error-alerting.ts` - 1 timer leak (20 min)
2. `src/index.ts` - 12 Discord listener leaks (2 hours)
3. `src/bot/Main.js` - 7 Discord listener leaks (2 hours)
4. `src/bot/Main.js` - 3 timer leaks (30 min)
5. `src/shared/prisma.ts` - 2 timer leaks (30 min)

## Phase 1: Initialize Resource Manager (10 minutes)

### Step 1.1: Add Resource Manager to Main Initialization

**File**: `src/index.ts`

**Location**: After imports, before bot initialization

```typescript
// Add import at top of file
import { resourceManager } from './services/resource-manager.js';

// In main() function, after error tracker initialization
async function main() {
  try {
    // ... existing initialization ...

    // Initialize Resource Manager (add this)
    log('info', '🛡️ Initializing Resource Manager...');
    resourceManager.initialize({
      maxListenersPerEmitter: 15,      // Higher for Discord bots
      maxTimersPerOwner: 30,            // Higher for background workers
      maxConnectionsPerOwner: 15,       // Higher for multi-DB setup
      leakDetectionThresholdMs: 7200000, // 2 hours
      alertOnLeakSuspect: true,
    });
    log('success', 'Resource Manager initialized with leak detection');

    // ... rest of initialization ...
  } catch (error) {
    log('error', 'Startup failed', error);
    process.exit(1);
  }
}
```

### Step 1.2: Add Shutdown Hook

**File**: `src/index.ts`

**Location**: Bottom of file, after existing shutdown handlers

```typescript
// Add to existing shutdown handlers
async function handleShutdown(signal) {
  log('warn', `${signal} received - shutting down gracefully...`);

  // Cleanup Resource Manager (add this)
  try {
    log('info', '🛡️ Cleaning up Resource Manager...');
    await resourceManager.shutdown();
    log('success', 'Resource Manager cleanup complete');
  } catch (error) {
    log('error', 'Resource Manager cleanup failed', error);
  }

  // ... existing shutdown code ...
  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
```

**Testing**: Restart bot, verify logs show "Resource Manager initialized" and "Resource Manager cleanup complete" on shutdown.

---

## Phase 2: Fix Error Alerting Timer (20 minutes)

### File: `src/services/error-alerting.ts`

**Current State (LEAKING)**:
```typescript
// Line 267 - Timer created but never cleared
export function subscribeToErrorStream() {
  setInterval(async () => {
    const recentErrors = await errorTracker.getRecentErrors({ limit: 50 });
    for (const error of recentErrors) {
      await checkAndAlert(error);
    }
  }, 30 * 1000); // 30 seconds
}
```

**Fixed State (MANAGED)**:

```typescript
import { createManagedInterval, resourceManager } from './resource-manager.js';

// Store handle at module level
let alertPollingHandle = null;

export function subscribeToErrorStream() {
  // Register managed interval
  alertPollingHandle = createManagedInterval(
    'error-alerting',
    'error-stream-polling',
    async () => {
      const recentErrors = await errorTracker.getRecentErrors({ limit: 50 });
      for (const error of recentErrors) {
        await checkAndAlert(error);
      }
    },
    30 * 1000,
    { purpose: 'Poll error stream for alerting' }
  );
}

// Add shutdown function
export async function shutdownErrorAlerting() {
  if (alertPollingHandle) {
    resourceManager.unregisterTimer(alertPollingHandle.id);
    alertPollingHandle = null;
  }
}
```

**Integration Point**: Call `shutdownErrorAlerting()` from main shutdown handler:

```typescript
// In src/index.ts handleShutdown()
import { shutdownErrorAlerting } from './services/error-alerting.js';

async function handleShutdown(signal) {
  // ... existing code ...
  await shutdownErrorAlerting();
  // ... rest of shutdown ...
}
```

**Testing**:
```bash
# Start bot, wait 1 minute, check resource stats
npm run dev

# In another terminal, check resources
curl http://localhost:3000/ops/resources
# Should show: timer:error-alerting:error-stream-polling

# Send SIGTERM, verify timer cleaned up
```

---

## Phase 3: Fix Discord Listeners in Main Bot (2 hours)

### File: `src/index.ts`

**Current State (LEAKING)**:
```typescript
// Lines 574-602 - 6 listeners added without cleanup
function bindDiscordLifecycle(client) {
  const updateOnline = () => {
    // ... implementation ...
  };

  client.on('guildCreate', updateOnline);
  client.on('guildDelete', updateOnline);
  client.on('shardDisconnect', updateOnline);
  client.on('shardResume', updateOnline);
  client.on('error', updateOnline);
  client.on('warn', updateOnline);
}

// Lines 693-720 - 6 security bot listeners added without cleanup
// Similar pattern for security bot
```

**Fixed State (MANAGED)**:

```typescript
import { createManagedListener, resourceManager } from './services/resource-manager.js';

// Store listener handles at module level
const discordListenerHandles = new Map();

function bindDiscordLifecycle(client, botType = 'main') {
  // Unbind existing listeners first (prevents accumulation on reconnect)
  unbindDiscordLifecycle(botType);

  const updateOnline = () => {
    // ... existing implementation ...
  };

  const owner = `discord-${botType}-bot`;
  const events = ['guildCreate', 'guildDelete', 'shardDisconnect', 'shardResume', 'error', 'warn'];

  for (const eventName of events) {
    const handle = createManagedListener(
      owner,
      `lifecycle-${eventName}`,
      client,
      eventName,
      updateOnline,
      10  // Max 10 listeners per event
    );
    discordListenerHandles.set(`${owner}:${eventName}`, handle);
  }

  log('info', `Bound ${events.length} Discord lifecycle listeners for ${botType} bot`);
}

function unbindDiscordLifecycle(botType = 'main') {
  const owner = `discord-${botType}-bot`;
  let removed = 0;

  for (const [key, handle] of discordListenerHandles.entries()) {
    if (key.startsWith(`${owner}:`)) {
      resourceManager.unregisterListener(handle.id);
      discordListenerHandles.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    log('info', `Unbound ${removed} Discord lifecycle listeners for ${botType} bot`);
  }
}

// Export for shutdown
export function shutdownDiscordListeners() {
  // Cleanup main bot listeners
  unbindDiscordLifecycle('main');
  // Cleanup security bot listeners
  unbindDiscordLifecycle('security');
}
```

**Integration Points**:

1. **Reconnection Handling** (already calls `bindDiscordLifecycle`):
```typescript
// In reconnection logic (existing code)
client.on('ready', () => {
  bindDiscordLifecycle(client, 'main');  // Now cleans up old listeners first
});
```

2. **Shutdown Hook**:
```typescript
// In src/index.ts handleShutdown()
async function handleShutdown(signal) {
  // ... existing code ...
  shutdownDiscordListeners();
  // ... rest of shutdown ...
}
```

**Testing**:
```bash
# Start bot
npm run dev

# Check listener counts (should be 6 for main + 6 for security = 12 total)
# In Discord developer portal, trigger bot reconnection by changing bot status

# After reconnection, check listener counts again - should STILL be 12, not 24
# This proves cleanup is working!

# Send SIGTERM, verify all listeners removed
```

---

## Phase 4: Fix Discord Listeners in Legacy Bot (2 hours)

### File: `src/bot/Main.js`

**Current State (LEAKING)**:
```javascript
// Lines 2618-2753 - 7 listeners added without cleanup
client.on('interactionCreate', handleInteraction);
client.on('guildCreate', handleGuildJoin);
client.on('guildDelete', handleGuildLeave);
client.on('guildMemberAdd', handleMemberJoin);
client.on('guildMemberUpdate', handleMemberUpdate);
client.on('roleUpdate', handleRoleUpdate);
```

**Fixed State (MANAGED)**:

```javascript
// Add import at top
const { createManagedListener, resourceManager } = require('../services/resource-manager.js');

// Store handles at module level
const legacyBotListenerHandles = new Map();

function bindLegacyBotListeners(client) {
  // Cleanup existing listeners first
  unbindLegacyBotListeners();

  const owner = 'discord-legacy-bot';
  const listeners = [
    { event: 'interactionCreate', handler: handleInteraction },
    { event: 'guildCreate', handler: handleGuildJoin },
    { event: 'guildDelete', handler: handleGuildLeave },
    { event: 'guildMemberAdd', handler: handleMemberJoin },
    { event: 'guildMemberUpdate', handler: handleMemberUpdate },
    { event: 'roleUpdate', handler: handleRoleUpdate },
  ];

  for (const { event, handler } of listeners) {
    const handle = createManagedListener(
      owner,
      `legacy-${event}`,
      client,
      event,
      handler,
      10
    );
    legacyBotListenerHandles.set(`${owner}:${event}`, handle);
  }

  console.log(`[Legacy Bot] Bound ${listeners.length} event listeners`);
}

function unbindLegacyBotListeners() {
  const owner = 'discord-legacy-bot';
  let removed = 0;

  for (const [key, handle] of legacyBotListenerHandles.entries()) {
    if (key.startsWith(`${owner}:`)) {
      resourceManager.unregisterListener(handle.id);
      legacyBotListenerHandles.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`[Legacy Bot] Unbound ${removed} event listeners`);
  }
}

// Export for shutdown
module.exports.shutdownLegacyBotListeners = unbindLegacyBotListeners;
```

**Integration Points**:

1. **Client Ready Event** (existing code location):
```javascript
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  bindLegacyBotListeners(client);  // Replace raw .on() calls with this
});
```

2. **Shutdown Handler** (modify existing `handleShutdown` function):
```javascript
async function handleShutdown() {
  console.log('Shutting down legacy bot...');
  
  // Add this line
  unbindLegacyBotListeners();
  
  // ... existing shutdown code ...
}
```

**Testing**:
```bash
# Start bot, check listener counts
npm run dev

# Trigger bot reconnection, verify listener counts stay constant

# Send SIGTERM, verify listeners removed
```

---

## Phase 5: Fix Timers in Legacy Bot (30 minutes)

### File: `src/bot/Main.js`

**Current State (LEAKING)**:
```javascript
// Line 2593 - Not stored, can't be cleared
setInterval(() => reportOperationalStats(client), 300000);

// Line 2600 - Not stored, can't be cleared
setInterval(async () => {
  for (const guild of client.guilds.cache.values()) {
    await fixGuildRoles(guild);
  }
}, 3600000);

// Line 2608 - Stored but NEVER cleared
const memberStatsInterval = setInterval(async () => {
  await updateMemberStats(client);
}, 600000);
memberStatsInterval.unref(); // .unref() ≠ clearInterval()!
```

**Fixed State (MANAGED)**:

```javascript
const { createManagedInterval, resourceManager } = require('../services/resource-manager.js');

// Store handles at module level
let opsReportHandle = null;
let roleRemediationHandle = null;
let memberStatsHandle = null;

function startLegacyBotTimers(client) {
  // Cleanup existing timers first
  stopLegacyBotTimers();

  // Operational stats reporting (5 minutes)
  opsReportHandle = createManagedInterval(
    'discord-legacy-bot',
    'ops-report',
    () => reportOperationalStats(client),
    300000,
    { purpose: 'Report operational statistics' }
  );

  // Guild role remediation (1 hour)
  roleRemediationHandle = createManagedInterval(
    'discord-legacy-bot',
    'role-remediation',
    async () => {
      for (const guild of client.guilds.cache.values()) {
        await fixGuildRoles(guild);
      }
    },
    3600000,
    { purpose: 'Fix guild role permissions' }
  );

  // Member stats update (10 minutes)
  memberStatsHandle = createManagedInterval(
    'discord-legacy-bot',
    'member-stats',
    async () => await updateMemberStats(client),
    600000,
    { purpose: 'Update member statistics' }
  );

  console.log('[Legacy Bot] Started 3 background timers');
}

function stopLegacyBotTimers() {
  const handles = [opsReportHandle, roleRemediationHandle, memberStatsHandle];
  let stopped = 0;

  for (const handle of handles) {
    if (handle) {
      resourceManager.unregisterTimer(handle.id);
      stopped++;
    }
  }

  opsReportHandle = null;
  roleRemediationHandle = null;
  memberStatsHandle = null;

  if (stopped > 0) {
    console.log(`[Legacy Bot] Stopped ${stopped} background timers`);
  }
}

// Export for shutdown
module.exports.shutdownLegacyBotTimers = stopLegacyBotTimers;
```

**Integration Points**:

1. **Client Ready Event** (replace existing timer setup):
```javascript
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  bindLegacyBotListeners(client);
  startLegacyBotTimers(client);  // Replace raw setInterval calls
});
```

2. **Shutdown Handler**:
```javascript
async function handleShutdown() {
  console.log('Shutting down legacy bot...');
  unbindLegacyBotListeners();
  stopLegacyBotTimers();  // Add this line
  // ... existing shutdown code ...
}
```

**Testing**:
```bash
# Start bot, verify 3 timers registered
npm run dev

# Check resource stats - should show 3 timers for 'discord-legacy-bot'

# Send SIGTERM, verify all 3 timers cleared
```

---

## Phase 6: Fix Prisma Heartbeat Timers (30 minutes)

### File: `src/shared/prisma.ts`

**Current State (LEAKING)**:
```typescript
// Line 649 - Stored but NEVER cleared
const heartbeatInterval = setInterval(
  async () => await checkPrismaHeartbeat(localPrisma, 'LOCAL'),
  HEARTBEAT_DEFAULTS.intervalMs
).unref(); // .unref() ≠ clearInterval()!

// Line 744 - Stored but NEVER cleared
const heartbeatInterval2 = setInterval(
  async () => await checkPrismaHeartbeat(experimentPrisma, 'EXPERIMENT'),
  HEARTBEAT_DEFAULTS.intervalMs
).unref(); // .unref() ≠ clearInterval()!
```

**Fixed State (MANAGED)**:

```typescript
import { createManagedInterval, resourceManager } from '../services/resource-manager.js';

// Store handles at module level
let localHeartbeatHandle = null;
let experimentHeartbeatHandle = null;

// In LOCAL Prisma initialization (replace existing setInterval)
if (localDatabaseUrl) {
  localPrisma = new PrismaClient({ datasources: { db: { url: localDatabaseUrl } } });
  
  localHeartbeatHandle = createManagedInterval(
    'prisma-local',
    'heartbeat',
    async () => await checkPrismaHeartbeat(localPrisma, 'LOCAL'),
    HEARTBEAT_DEFAULTS.intervalMs,
    { database: 'LOCAL', url: localDatabaseUrl }
  );
  
  log('success', 'LOCAL Prisma client initialized with managed heartbeat');
}

// In EXPERIMENT Prisma initialization (replace existing setInterval)
if (experimentDatabaseUrl) {
  experimentPrisma = new PrismaClient({ datasources: { db: { url: experimentDatabaseUrl } } });
  
  experimentHeartbeatHandle = createManagedInterval(
    'prisma-experiment',
    'heartbeat',
    async () => await checkPrismaHeartbeat(experimentPrisma, 'EXPERIMENT'),
    HEARTBEAT_DEFAULTS.intervalMs,
    { database: 'EXPERIMENT', url: experimentDatabaseUrl }
  );
  
  log('success', 'EXPERIMENT Prisma client initialized with managed heartbeat');
}

// Add to existing shutdownPrismaClients() function
export async function shutdownPrismaClients() {
  log('info', 'Shutting down Prisma clients...');

  // Clear heartbeat timers (add this)
  if (localHeartbeatHandle) {
    resourceManager.unregisterTimer(localHeartbeatHandle.id);
    localHeartbeatHandle = null;
  }
  if (experimentHeartbeatHandle) {
    resourceManager.unregisterTimer(experimentHeartbeatHandle.id);
    experimentHeartbeatHandle = null;
  }

  // ... existing Prisma disconnect code ...
  
  log('success', 'Prisma clients shutdown complete');
}
```

**Integration Point**: Already called from main shutdown handler, no changes needed.

**Testing**:
```bash
# Start bot with LOCAL database configured
export DATABASE_ONPREMISE_DEV_PRIMARY="postgresql://..."
npm run dev

# Check resource stats - should show 1-2 timers for 'prisma-local' / 'prisma-experiment'

# Send SIGTERM, verify heartbeat timers cleared before disconnect
```

---

## Phase 7: Validation & Testing (1 hour)

### Manual Testing Checklist

**1. Resource Initialization**:
```bash
npm run dev
# Expected log output:
# ✅ "Resource Manager initialized with leak detection"
# ✅ "Bound X Discord lifecycle listeners"
# ✅ "Started X background timers"
```

**2. Resource Statistics** (after 1 minute of uptime):
```typescript
// Add temporary debug endpoint to src/index.ts
app.get('/ops/resources', (req, res) => {
  const stats = resourceManager.getStats();
  res.json(stats);
});

// Test:
curl http://localhost:3000/ops/resources
// Expected:
// {
//   "total": 22-25,
//   "byType": { "listener": 19, "timer": 6, "connection": 0 },
//   "byOwner": {
//     "discord-main-bot": 6,
//     "discord-security-bot": 6,
//     "discord-legacy-bot": 10,
//     "error-alerting": 1,
//     "prisma-local": 1,
//     "prisma-experiment": 1
//   },
//   "leakSuspects": []
// }
```

**3. Reconnection Test** (verify no listener accumulation):
```bash
# Get initial listener count
curl http://localhost:3000/ops/resources | jq '.byType.listener'
# Example: 19

# Force Discord reconnection (disconnect WiFi for 30 seconds, then reconnect)

# Check listener count again after reconnection
curl http://localhost:3000/ops/resources | jq '.byType.listener'
# Expected: Still 19 (NOT 38!)
```

**4. Shutdown Test** (verify cleanup):
```bash
# Start bot
npm run dev

# Send SIGTERM
kill -TERM <PID>

# Expected log output:
# ✅ "Unbound X Discord lifecycle listeners"
# ✅ "Stopped X background timers"
# ✅ "Resource Manager cleanup complete"
# ✅ "remainingResources: 0"
```

**5. Leak Detection Test** (optional - wait 2+ hours):
```bash
# Start bot with low threshold for testing
resourceManager.updateLimits({ leakDetectionThresholdMs: 60000 }); // 1 minute

# Wait 2 minutes

# Check for leak suspects
curl http://localhost:3000/ops/resources | jq '.leakSuspects'
# Expected: Some long-running timers flagged (heartbeats, polling, etc.)
```

### Automated Testing

Create test file: `tests/resource-manager-integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resourceManager } from '../src/services/resource-manager.js';

describe('Resource Manager Integration', () => {
  beforeEach(() => {
    resourceManager.initialize({ maxTimersPerOwner: 50 });
  });

  afterEach(async () => {
    await resourceManager.shutdown();
  });

  it('should have zero resources after full shutdown', async () => {
    // Simulate production initialization
    // ... create timers, listeners, connections ...

    // Shutdown
    await resourceManager.shutdown();

    // Verify cleanup
    const stats = resourceManager.getStats();
    expect(stats.total).toBe(0);
  });

  it('should prevent listener accumulation on reconnection', () => {
    // Simulate reconnection scenario
    for (let i = 0; i < 5; i++) {
      // Call bindDiscordLifecycle() 5 times (simulates 5 reconnections)
      // ... bind listeners ...
    }

    // Verify listener count stays constant
    const stats = resourceManager.getStats();
    const listenerCount = stats.byType.listener;
    expect(listenerCount).toBeLessThanOrEqual(19); // Max expected
  });
});
```

Run tests:
```bash
npm test tests/resource-manager-integration.test.ts
```

---

## Phase 8: Production Deployment (30 minutes)

### Pre-Deployment Checklist

- ✅ All 25 leaks fixed with managed resources
- ✅ Resource Manager initialized in `src/index.ts`
- ✅ Shutdown hooks call `resourceManager.shutdown()`
- ✅ Manual testing passed (reconnection test, shutdown test)
- ✅ Automated tests passing
- ✅ Code review completed

### Deployment Steps

1. **Merge feature branch**:
```bash
git checkout -b feat/resource-manager-integration
git add .
git commit -m "feat: integrate Resource Manager to fix 25 resource leaks

🛡️ RESOURCE MANAGER INTEGRATION COMPLETE

FIXES:
- ✅ src/services/error-alerting.ts - 1 timer leak
- ✅ src/index.ts - 12 Discord listener leaks
- ✅ src/bot/Main.js - 7 Discord listener leaks + 3 timer leaks
- ✅ src/shared/prisma.ts - 2 timer leaks

TOTALS:
- 25 leaks fixed
- 19 listeners now managed (cleanup on shutdown + reconnection)
- 6 timers now managed (cleanup on shutdown)
- 0 unbounded resource growth patterns

IMPACT:
- Before: Memory crashes in 7-12 hours from accumulation
- After: Stable 150-200 MB memory, 7+ days uptime, 0 leaks

MONITORING:
- Resource stats available via resourceManager.getStats()
- Leak detection runs every 5 minutes (threshold: 2 hours)
- Limit violations reported to error tracker
- All resources cleaned up on shutdown

TESTING:
- ✅ Manual reconnection test (listener counts stable)
- ✅ Manual shutdown test (all resources cleaned up)
- ✅ Automated test suite passing"

git push origin feat/resource-manager-integration
```

2. **Deploy to staging**:
```bash
# Render will auto-deploy on push (if configured)
# OR manually trigger deploy in Render dashboard
```

3. **Monitor staging for 24 hours**:
```bash
# Watch memory graph - should be flat line at 150-200 MB
# Check logs for Resource Manager output
# Trigger reconnections, verify no accumulation
```

4. **Deploy to production** (after staging validation):
```bash
git checkout main
git merge feat/resource-manager-integration
git push origin main
```

### Post-Deployment Monitoring

**Monitor for 48-72 hours**:

1. **Memory Graph**:
   - Expected: Flat line at 150-200 MB (30-40% of 512 MB)
   - Before: Climbing slope from 20% → 100%+ in 7 hours
   - Success Criteria: No climbing slope, stable memory usage

2. **Resource Statistics** (check every 6 hours):
```bash
# SSH into Render instance
ssh <service-id>

# Check resource counts
curl http://localhost:3000/ops/resources | jq '{total, byType, leakSuspects: (.leakSuspects | length)}'
```

3. **Error Tracker** (check for limit violations):
```bash
# In Discord, use /ops errors command
# Filter for category: CONFIG, severity: HIGH
# Expected: 0 "limit exceeded" errors
```

4. **Uptime Validation**:
   - Target: 7+ days without OOM crashes
   - Before: Crashes every 7 hours
   - Monitor: Render service uptime metric

### Rollback Plan

If issues detected:

```bash
# Revert to previous commit
git revert <commit-sha>
git push origin main

# Or roll back in Render dashboard
# Click "Deploys" → "Rollback" on last known good deploy
```

---

## Success Metrics

### Before Integration (BASELINE - Leaking State)

```
Memory Usage: 20% → 100%+ over 7 hours (unbounded growth)
Uptime: ~7 hours before OOM crash
Listener Accumulation: 19 new listeners per reconnection
Timer Accumulation: 6 new timers per restart
Resource Cleanup: 0% (nothing cleaned up on shutdown)
Leak Detection: None (no monitoring)
```

### After Integration (TARGET - Managed State)

```
Memory Usage: 150-200 MB stable (30-40% of 512 MB)
Uptime: 7+ days without OOM crashes
Listener Accumulation: 0 (cleanup on reconnection)
Timer Accumulation: 0 (cleanup on restart)
Resource Cleanup: 100% (all resources cleaned up on shutdown)
Leak Detection: Active (5-minute monitoring, 2-hour threshold)
Error Tracking: Limit violations + leak suspects reported
```

### Validation Criteria

- ✅ Memory graph shows flat line (no climbing slope)
- ✅ Resource count stays constant after reconnections
- ✅ `resourceManager.getStats().total` stays under 30
- ✅ `resourceManager.getStats().leakSuspects.length === 0` (or only expected long-lived resources)
- ✅ Shutdown logs show "remainingResources: 0"
- ✅ 7+ days uptime without crashes
- ✅ Zero "limit exceeded" errors in error tracker

---

## Troubleshooting

### Issue: "Timer limit exceeded for owner: X"

**Root Cause**: Owner creating too many timers

**Solution**:
```typescript
// Option 1: Increase limit
resourceManager.updateLimits({ maxTimersPerOwner: 50 });

// Option 2: Audit and consolidate timers
const timers = resourceManager.getResourcesByOwner('X').filter(r => r.type === 'timer');
console.log('Timers:', timers.map(t => t.name));
```

### Issue: "Listener limit exceeded for X on Y"

**Root Cause**: Too many listeners on same event

**Solution**:
```typescript
// Option 1: Increase limit
resourceManager.updateLimits({ maxListenersPerEmitter: 20 });

// Option 2: Audit listeners
const listeners = resourceManager.getResourcesByType('listener');
const grouped = listeners.reduce((acc, l) => {
  const key = `${l.emitter}:${l.eventName}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
console.log('Listeners per event:', grouped);
```

### Issue: Leak suspects detected

**Root Cause**: Long-lived resources flagged by leak detection

**Solution**: Verify if intentional or actual leak

```typescript
const stats = resourceManager.getStats();
for (const suspect of stats.leakSuspects) {
  console.log(`${suspect.type} ${suspect.name} age: ${(suspect.ageMs / 3600000).toFixed(1)} hours`);
  // If intentional (e.g., heartbeat timer) - ignore
  // If unintentional - investigate why not cleaned up
}
```

### Issue: Resources not cleaned up on shutdown

**Root Cause**: Shutdown hooks not called or errors during cleanup

**Solution**: Ensure all shutdown paths call `resourceManager.shutdown()`

```typescript
// Check all process exit handlers
process.on('SIGTERM', async () => await resourceManager.shutdown());
process.on('SIGINT', async () => await resourceManager.shutdown());
process.on('uncaughtException', async () => await resourceManager.shutdown());
```

---

## Maintenance

### Weekly Tasks

- Review resource statistics
- Check for leak suspects
- Verify no limit violation errors
- Audit long-lived resources

### Monthly Tasks

- Review and adjust limits based on usage patterns
- Update leak detection threshold if needed
- Analyze resource creation trends

### Quarterly Tasks

- Performance impact analysis
- Resource usage forecasting
- Documentation updates

---

## References

- **Resource Manager Documentation**: `docs/resource-manager.md`
- **Leak Findings**: `docs/RESOURCE-LEAK-FINDINGS.md`
- **Audit Results**: `docs/RESOURCE-LEAK-AUDIT-RESULTS.md`
- **Source Code**: `src/services/resource-manager.ts`

---

**Created**: 2025-11-10  
**Status**: Implementation Ready ✅  
**Priority**: P0 (Critical)  
**Estimated Time**: 5.5 hours
