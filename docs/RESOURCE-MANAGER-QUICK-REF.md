# Resource Manager - Quick Reference Card

**Status**: ✅ Production Ready  
**Location**: `src/services/resource-manager.ts`  
**Docs**: `docs/resource-manager.md`, `docs/resource-manager-integration.md`

---

## 🚀 Quick Start

### 1. Initialize (in `src/index.ts`)

```typescript
import { resourceManager } from './services/resource-manager.js';

resourceManager.initialize({
  maxListenersPerEmitter: 15,
  maxTimersPerOwner: 30,
  maxConnectionsPerOwner: 20,
  leakDetectionThresholdMs: 7200000, // 2 hours
  alertOnLeakSuspect: true,
});
```

### 2. Shutdown Hook (in `src/index.ts`)

```typescript
process.on('SIGTERM', async () => {
  await resourceManager.shutdown();
  process.exit(0);
});
```

---

## 📋 Common Operations

### Create Managed Timer

```typescript
import { createManagedInterval } from './services/resource-manager.js';

const handle = createManagedInterval(
  'my-service',               // owner
  'cache-refresh',            // name
  async () => { /* work */ },
  60000                       // interval ms
);

// Cleanup
resourceManager.unregisterTimer(handle.id);
```

### Create Managed Listener

```typescript
import { createManagedListener } from './services/resource-manager.js';

const handle = createManagedListener(
  'discord-bot',              // owner
  'guild-events',             // name
  client,                     // emitter
  'guildCreate',              // event
  async (guild) => { /* handle */ }
);

// Cleanup
resourceManager.unregisterListener(handle.id);
```

### Create Managed Connection

```typescript
import { createManagedConnection } from './services/resource-manager.js';

const handle = createManagedConnection(
  'database',                 // owner
  'prod-postgres',            // name
  'database',                 // type
  async () => await prisma.$disconnect()
);

// Cleanup
await resourceManager.unregisterConnection(handle.id);
```

---

## 📊 Statistics & Monitoring

```typescript
// Get current statistics
const stats = resourceManager.getStats();
console.log({
  total: stats.total,
  byType: stats.byType,           // { listener, timer, connection, ... }
  byOwner: stats.byOwner,         // { 'discord-bot': 12, ... }
  leakSuspects: stats.leakSuspects.length,
});

// Query specific resources
const myResources = resourceManager.getResourcesByOwner('my-service');
const allTimers = resourceManager.getResourcesByType('timer');
```

---

## 🔧 Bulk Cleanup

```typescript
// Cleanup by owner (all types)
await resourceManager.cleanupByOwner('my-service');

// Type-specific cleanup
resourceManager.clearAllTimers('my-service');
resourceManager.clearAllListeners('discord-bot');
await resourceManager.clearAllConnections('database');

// Full shutdown
await resourceManager.shutdown();
```

---

## 🎯 Resource Limits (Default)

| Resource Type | Limit | Scope |
|--------------|-------|-------|
| **Listeners** | 10 per event | Per EventEmitter |
| **Timers** | 20 | Per owner |
| **Connections** | 10 | Per owner |
| **Leak Threshold** | 2 hours | Age detection |

Update limits:
```typescript
resourceManager.updateLimits({
  maxListenersPerEmitter: 20,
  maxTimersPerOwner: 50,
});
```

---

## ⚠️ Error Integration

### Limit Violations (CONFIG, HIGH)
```
Error: Timer limit exceeded for owner: X (max: 20)
```

### Leak Suspects (ENGINE, MEDIUM)
```
Error: Resource leak suspect: timer cache-refresh (age: 4500000ms)
```

**View**: `/ops errors` command in Discord

---

## 🧪 Testing

```bash
# Start bot
npm run dev

# Check resource stats
curl http://localhost:3000/ops/resources | jq

# Force reconnection (verify no accumulation)
# Listener count should stay constant, not double!

# Shutdown (verify cleanup)
kill -TERM <PID>
# Expected log: "remainingResources: 0"
```

---

## 📖 Migration Patterns

### ❌ Before (LEAKING)

```typescript
// Unmanaged timer - leaks on restart
const timer = setInterval(() => { /* work */ }, 60000);

// Unmanaged listener - accumulates on reconnect
client.on('guildCreate', handler);

// Unmanaged connection - never closed
const prisma = new PrismaClient();
```

### ✅ After (MANAGED)

```typescript
// Managed timer - tracked and cleaned up
const timerHandle = createManagedInterval('owner', 'name', () => { /* work */ }, 60000);

// Managed listener - limit enforced, cleanup tracked
const listenerHandle = createManagedListener('owner', 'name', client, 'guildCreate', handler);

// Managed connection - cleanup guaranteed
const connHandle = createManagedConnection('owner', 'name', 'database', async () => await prisma.$disconnect());
```

---

## 🛠️ Troubleshooting

### "Timer limit exceeded"
```typescript
// Increase limit OR audit timers
resourceManager.updateLimits({ maxTimersPerOwner: 50 });
// OR
const timers = resourceManager.getResourcesByOwner('X');
console.log(timers.map(t => t.name));
```

### Leak suspects detected
```typescript
const stats = resourceManager.getStats();
for (const suspect of stats.leakSuspects) {
  console.log(`${suspect.type} ${suspect.name} age: ${suspect.ageMs}ms`);
  // Decide: intentional (long-running) or actual leak?
}
```

### Resources not cleaned up
```typescript
// Ensure shutdown called in all exit paths
process.on('SIGTERM', async () => await resourceManager.shutdown());
process.on('SIGINT', async () => await resourceManager.shutdown());
```

---

## 📚 Documentation

- **Core API**: `docs/resource-manager.md` (650+ lines)
- **Integration Guide**: `docs/resource-manager-integration.md` (800+ lines)
- **Summary**: `docs/RESOURCE-MANAGER-SUMMARY.md` (741 lines)
- **Leak Findings**: `docs/RESOURCE-LEAK-FINDINGS.md` (641 lines)

---

## ⏱️ Integration Roadmap

| Phase | Task | Time | Impact |
|-------|------|------|--------|
| 1 | Initialize Resource Manager | 10 min | System-wide enabled |
| 2 | Fix error-alerting.ts timer | 20 min | 1 leak fixed |
| 3 | Fix index.ts listeners | 2 hours | 12 leaks fixed |
| 4 | Fix Main.js listeners | 2 hours | 7 leaks fixed |
| 5 | Fix Main.js timers | 30 min | 3 leaks fixed |
| 6 | Fix prisma.ts timers | 30 min | 2 leaks fixed |
| 7 | Validation & testing | 1 hour | Confidence |
| 8 | Production deployment | 30 min | 0 leaks live |

**Total**: 5.5 hours + 24h staging + 48-72h production monitoring

---

## 🎯 Success Criteria

### Before (LEAKING)
- Memory: 20% → 100%+ in 7 hours
- Uptime: ~7 hours before crash
- Listeners: +19 per reconnection
- Timers: +6 per restart
- Cleanup: 0%

### After (MANAGED)
- Memory: 150-200 MB stable (flat line)
- Uptime: 7+ days without crashes
- Listeners: 0 accumulation
- Timers: 0 accumulation
- Cleanup: 100% on shutdown

---

**Created**: 2025-11-10  
**Version**: 1.0.0  
**Commits**: b4be4d3, d709ac1
