# Resource Request System - Quick Reference

**Version**: 1.0  
**Created**: 2025-11-11  
**Purpose**: Fast lookup guide for centralized resource requests

---

## 🚀 Quick Start

### Import Statement

```typescript
// OLD (direct creation)
import { createManagedInterval } from '../services/resource-manager.js';

// NEW (validated request)
import { requestManagedInterval } from '../services/resource-request.js';
```

### Basic Usage

```typescript
// Request a timer (throws Error if rejected)
try {
  const handle = requestManagedInterval(
    'my-service',           // owner
    'my-timer',            // name
    () => { /* work */ },  // callback
    60000,                 // interval (1 minute)
    { priority: 'normal' } // options (optional)
  );
  
  // Later: cleanup
  handle.cleanup();
} catch (error) {
  console.error('Request rejected:', error.message);
  // Implement fallback strategy
}
```

---

## 📋 API Reference

### Functions

| Function | Purpose | Returns | Throws |
|----------|---------|---------|--------|
| `requestManagedInterval()` | Request validated interval timer | TimerHandle | Error if rejected |
| `requestManagedTimeout()` | Request validated timeout timer | TimerHandle | Error if rejected |
| `requestManagedListener()` | Request validated event listener | ListenerHandle | Error if rejected |
| `requestManagedConnection()` | Request validated connection | ConnectionHandle | Error if rejected |
| `getResourceRequestStats()` | Get request statistics | Stats object | Never |
| `getResourceBudget()` | Get current budget config | Budget object | Never |

### Request Priorities

```typescript
type Priority = 'critical' | 'high' | 'normal' | 'low';

// Examples:
{ priority: 'critical' }  // Discord client, database, core bot
{ priority: 'high' }      // Security sweeps, battle engine
{ priority: 'normal' }    // Cache refresh, analytics (default)
{ priority: 'low' }       // Stats, cleanup tasks
```

### Resource Types

```typescript
// Timers
requestManagedInterval(owner, name, callback, intervalMs, options?);
requestManagedTimeout(owner, name, callback, timeoutMs, options?);

// Listeners
requestManagedListener(owner, name, emitter, eventName, listener, options?);

// Connections
requestManagedConnection(owner, name, type, cleanup, options?);
```

---

## ⚠️ Validation Rules

### Memory Budget (512 MB Plan)

| Zone | Threshold | Action |
|------|-----------|--------|
| **CRITICAL** | ≥435 MB (85%) | ❌ Reject ALL requests |
| **WARNING** | ≥384 MB (75%) | ⚠️ Allow critical priority only |
| **OPTIMAL** | 307-384 MB (60-75%) | ✅ Allow all requests |
| **UNDERUTILIZED** | <307 MB (60%) | ✅ Allow all requests |

### Resource Quotas

| Resource | System-Wide Quota | Per-Owner Quota |
|----------|-------------------|-----------------|
| Timers | 150 | 20 |
| Listeners | 150 | 30 |
| Connections | 50 | 10 |

### Rejection Reasons

```typescript
// Common rejection messages:
"Memory critical: 441.2 MB / 512 MB (86.2%). No capacity for new resources."
"Timer quota exceeded: 150 / 150"
"Owner 'security-bot' timer quota exceeded: 20 / 20"
"Listener quota exceeded: 150 / 150"
"Connection quota exceeded: 50 / 50"
```

---

## 📝 Code Patterns

### Pattern 1: Simple Timer (Non-Critical)

```typescript
try {
  const handle = requestManagedInterval(
    'cache-worker',
    'cache-refresh',
    async () => {
      await refreshCache();
    },
    300000 // 5 minutes
  );
} catch (error) {
  logger.warn('Cache refresh rejected, using lazy loading', { error });
  // Fallback: Load cache on-demand instead of background refresh
  useLazyCacheLoading();
}
```

### Pattern 2: Critical Service (Must Succeed)

```typescript
try {
  const handle = requestManagedListener(
    'discord-bot',
    'message-handler',
    client,
    'messageCreate',
    async (message) => {
      await handleMessage(message);
    },
    {
      maxListeners: 50,
      priority: 'critical', // Fail fast if rejected
      metadata: { service: 'core-bot' }
    }
  );
} catch (error) {
  logger.error('CRITICAL: Message handler rejected - bot cannot function', error, {
    category: 'ALERT',
  });
  
  // Fail fast - this is required
  process.exit(1);
}
```

### Pattern 3: Database Connection

```typescript
try {
  const handle = requestManagedConnection(
    'prisma-client',
    'prod-connection',
    'database',
    async () => prisma.$disconnect(),
    {
      url: process.env.PROD_DATABASE_URL,
      priority: 'critical',
      metadata: {
        poolSize: 10,
        timeout: 10000,
      }
    }
  );
  
  logger.info('Database connection registered');
} catch (error) {
  logger.error('Database connection rejected - cannot start', error);
  process.exit(1);
}
```

### Pattern 4: Multiple Requests (Worker Startup)

```typescript
export function startEngineWorkers() {
  const workers: any[] = [];
  
  // Critical worker - must succeed
  try {
    const bufferFlush = requestManagedInterval(
      'engine-workers',
      'buffer-flush',
      async () => await flushBuffer(),
      30000,
      { priority: 'critical' }
    );
    workers.push(bufferFlush);
  } catch (error) {
    logger.error('Buffer flush worker FAILED - data loss risk', error);
    throw error; // Fail fast
  }
  
  // Non-critical worker - can degrade
  try {
    const cacheRefresh = requestManagedInterval(
      'engine-workers',
      'cache-refresh',
      async () => await refreshCache(),
      3600000,
      { priority: 'low' }
    );
    workers.push(cacheRefresh);
  } catch (error) {
    logger.warn('Cache refresh rejected, using lazy loading', { error });
    // Continue without this worker
  }
  
  return workers;
}
```

---

## 📊 Statistics

### Get Current Stats

```typescript
import { getResourceRequestStats } from '../services/resource-request.js';

const stats = getResourceRequestStats();

console.log(stats);
// Output:
// {
//   requests: {
//     total: 457,
//     approved: 452,
//     rejected: 5,
//     approvalRate: '98.9%'
//   },
//   budget: {
//     totalMemoryBudgetMB: 307,
//     maxTimersTotal: 150,
//     maxListenersTotal: 150,
//     maxConnectionsTotal: 50,
//     ...
//   },
//   currentUtilization: {
//     memory: { current: 289, budget: 307, percent: 56.4 },
//     timers: { current: 89, quota: 150, percent: 59.3 },
//     listeners: { current: 67, quota: 150, percent: 44.7 },
//     connections: { current: 12, quota: 50, percent: 24.0 }
//   }
// }
```

### Get Budget Configuration

```typescript
import { getResourceBudget } from '../services/resource-request.js';

const budget = getResourceBudget();

console.log(budget);
// Output:
// {
//   totalMemoryBudgetMB: 307,
//   engineCacheMB: 60,
//   runtimeCacheMB: 50,
//   writeBufferMB: 25,
//   systemOverheadMB: 72,
//   availableForResourcesMB: 100,
//   maxTimersTotal: 150,
//   maxListenersTotal: 150,
//   maxConnectionsTotal: 50,
//   maxTimersPerOwner: 20,
//   maxListenersPerOwner: 30,
//   maxConnectionsPerOwner: 10
// }
```

---

## 🔧 Troubleshooting

### Problem: "Memory critical" rejection

**Cause**: Memory usage ≥435 MB (85% of 512 MB plan)

**Solutions**:
1. Scale to Standard plan (2 GB memory)
2. Reduce cache sizes (Engine L1 Cache, Runtime Cache)
3. Review memory leaks with `npm run ops:memory-analysis`
4. Close idle connections

### Problem: "Timer quota exceeded"

**Cause**: System has 150 active timers

**Solutions**:
1. Review timers: `npm run ops:resource-stats`
2. Cleanup unused timers
3. Increase quota: `updateResourceBudget({ maxTimersTotal: 200 })`
4. Convert interval timers to on-demand polling

### Problem: "Owner timer quota exceeded"

**Cause**: One service has 20 timers (per-owner limit)

**Solutions**:
1. Check for timer leaks in that service
2. Consolidate related timers into fewer intervals
3. Increase per-owner quota: `updateResourceBudget({ maxTimersPerOwner: 30 })`

### Problem: Request rejected but service critical

**Solution**: Use `priority: 'critical'` to bypass non-critical rejections

```typescript
// Before (may fail at 75% memory)
requestManagedInterval('service', 'timer', callback, 60000);

// After (only fails at 85% memory)
requestManagedInterval('service', 'timer', callback, 60000, {
  priority: 'critical'
});
```

### Problem: Need to override budget

**Admin Operation** (use carefully):

```typescript
import { updateResourceBudget } from '../services/resource-request.js';

// Increase timer quota
updateResourceBudget({
  maxTimersTotal: 200,      // Was 150
  maxTimersPerOwner: 30,    // Was 20
});

// Increase memory budget (after scaling plan)
updateResourceBudget({
  totalMemoryBudgetMB: 1024, // Standard plan (2 GB)
});
```

---

## 🎯 Best Practices

### ✅ DO

- ✅ Always wrap requests in try-catch
- ✅ Set `priority: 'critical'` for core services
- ✅ Implement fallback strategies for non-critical requests
- ✅ Cleanup resources when done: `handle.cleanup()`
- ✅ Log rejection reasons for debugging
- ✅ Monitor approval rates with `getResourceRequestStats()`

### ❌ DON'T

- ❌ Don't ignore rejection errors
- ❌ Don't mark everything as `priority: 'critical'`
- ❌ Don't bypass validation (use resource-manager directly)
- ❌ Don't create unbounded timers/listeners
- ❌ Don't forget to cleanup resources
- ❌ Don't exceed per-owner quotas

---

## 🔗 Related Documentation

- **Migration Guide**: `docs/deployment/RESOURCE-REQUEST-MIGRATION.md` - Complete migration instructions
- **Standards**: `docs/deployment/RESOURCE-MONITOR-STANDARDS.md` - Threshold definitions
- **Optimization Plan**: `docs/deployment/RENDER-RESOURCE-OPTIMIZATION-PLAN.md` - Overall strategy
- **Implementation**: `src/services/resource-request.ts` - Full source code
- **Tests**: `tests/resource-request.test.ts` - Test examples

---

## 📞 Support

**Questions?** See `RESOURCE-REQUEST-MIGRATION.md` for:
- Detailed API documentation
- Complete code examples
- Testing strategies
- Rollout plans
- Troubleshooting guides

**Issues?** Check:
1. Current utilization: `getResourceRequestStats()`
2. Budget configuration: `getResourceBudget()`
3. Error logs: Search for `[ResourceRequest]`
4. Migration guide: `docs/deployment/RESOURCE-REQUEST-MIGRATION.md`
