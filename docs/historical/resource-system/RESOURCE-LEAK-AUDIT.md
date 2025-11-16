# Resource Leak Audit - Comprehensive System Review

**Date Created:** 2025-11-10  
**Priority:** P0 - Critical Infrastructure  
**Status:** READY - Awaiting execution  
**Triggered By:** EventEmitter memory leak discovery (d63f9ad)

## Executive Summary

**Purpose:** Systematically identify and fix ALL unbounded resource usage patterns across the entire codebase to prevent future memory leaks, file descriptor exhaustion, database connection leaks, and other resource-related crashes.

**Scope:** All TypeScript/JavaScript files, worker processes, database connections, file operations, timers, event listeners, caches, buffers, and external API connections.

**Target:** 100% of code audited for resource leak patterns within 7 days.

---

## Risk Categories

### 🔴 CRITICAL (Unbounded Growth - Can Crash System)

1. **EventEmitter Listeners** - Accumulate without cleanup
2. **Map/Set/Array Collections** - Grow indefinitely without eviction
3. **setInterval/setTimeout** - Never cleared, accumulate over time
4. **Database Connections** - Pool exhaustion, connection leaks
5. **File Descriptors** - Files opened but never closed
6. **Child Processes** - Spawned but never killed
7. **Circular Buffers** - Conservative eviction allows bloat

### 🟡 HIGH (Resource Exhaustion - Degrades Performance)

8. **HTTP/WebSocket Connections** - Keep-alive without timeout
9. **Cache Without TTL** - Never expires, grows forever
10. **Log Files** - Append-only, no rotation
11. **Promise Chains** - Memory retained in closures
12. **Stream Pipelines** - No backpressure handling
13. **Worker Threads** - Thread pool exhaustion

### 🟢 MEDIUM (Slow Leaks - Impacts Long-term Stability)

14. **Singleton Instances** - Accumulate state over time
15. **Global Variables** - Never cleaned up
16. **Closure Captures** - Large objects captured unnecessarily
17. **Event Bus Messages** - Retained after processing
18. **Telemetry Data** - Metrics accumulate without aggregation

---

## Audit Checklist by Resource Type

### 1. EventEmitter Patterns

**Risk:** Listeners added without cleanup, accumulate indefinitely.

**Search Patterns:**
```bash
# Find all EventEmitter usage
grep -r "new EventEmitter()" src/ --include="*.ts" --include="*.js"
grep -r "\.on\(" src/ --include="*.ts" --include="*.js" | grep -v "\.off\("
grep -r "\.once\(" src/ --include="*.ts" --include="*.js"
grep -r "\.addListener\(" src/ --include="*.ts" --include="*.js"
```

**Checklist:**
- [ ] **src/services/error-tracker.ts** - ✅ FIXED (setMaxListeners, listener cleanup)
- [ ] **src/utils/intelligent-logger.ts** - ✅ FIXED (stored reference, shutdown cleanup)
- [ ] **src/bot/main.js** (legacy) - Verify Discord.js client listeners
- [ ] **src/bot/security-bot.js** - Verify guild event listeners
- [ ] **src/workers/outbox.ts** - Check worker event listeners
- [ ] **src/workers/cache-maintenance.ts** - Check scheduled event listeners
- [ ] **src/shared/prisma.ts** - Check Prisma client event listeners
- [ ] **All worker files** - Audit worker event subscriptions

**Fix Template:**
```typescript
// BAD (leak):
emitter.on('event', (data) => { ... });

// GOOD (cleanup):
private listener?: (data: any) => void;

initialize() {
  this.listener = (data) => { ... };
  emitter.on('event', this.listener);
  emitter.setMaxListeners(5); // Warn on accumulation
}

shutdown() {
  if (this.listener) {
    emitter.off('event', this.listener);
    this.listener = undefined;
  }
}
```

---

### 2. Map/Set/Array Collections

**Risk:** Unbounded growth without size limits or eviction policies.

**Search Patterns:**
```bash
# Find all Map/Set declarations
grep -r "new Map\|new Set\|private.*Map\|private.*Set" src/ --include="*.ts" --include="*.js"
grep -r "\.push\|\.add\|\.set" src/ --include="*.ts" --include="*.js"
```

**Checklist:**
- [ ] **src/services/engine-cache.ts** - Verify pokemon/moves Maps have size limits
- [ ] **src/services/engine-write-buffer.ts** - Check queue arrays have max size (10k limit OK)
- [ ] **src/utils/intelligent-logger.ts** - Verify CircularBuffer eviction works
- [ ] **src/services/cache/facade.ts** - Check LRU cache has max entries
- [ ] **src/shared/cache/** - Audit all cache Map/Set implementations
- [ ] **src/bot/state/** - Check security bot state Maps
- [ ] **src/workers/** - Verify worker job queues have limits

**Fix Template:**
```typescript
// BAD (unbounded):
private cache = new Map<string, Data>();

addToCache(key: string, value: Data) {
  this.cache.set(key, value); // No limit!
}

// GOOD (bounded with LRU):
private cache = new Map<string, Data>();
private readonly MAX_SIZE = 10000;

addToCache(key: string, value: Data) {
  if (this.cache.size >= this.MAX_SIZE) {
    // Evict oldest entry (LRU)
    const firstKey = this.cache.keys().next().value;
    this.cache.delete(firstKey);
  }
  this.cache.set(key, value);
}
```

---

### 3. Timers (setInterval/setTimeout)

**Risk:** Timers created but never cleared, accumulate over time.

**Search Patterns:**
```bash
# Find all timer usage
grep -r "setInterval\|setTimeout" src/ --include="*.ts" --include="*.js"
grep -r "clearInterval\|clearTimeout" src/ --include="*.ts" --include="*.js"
```

**Checklist:**
- [ ] **src/utils/intelligent-logger.ts** - Verify writeInterval cleared in shutdown
- [ ] **src/workers/engine-workers.ts** - Check all 4 worker intervals cleared
- [ ] **src/services/cache/facade.ts** - Verify cleanup scheduler cleared
- [ ] **src/bot/main.js** - Check Discord heartbeat timers
- [ ] **src/bot/security-bot.js** - Verify sweep interval cleared on shutdown
- [ ] **src/shared/prisma.ts** - Check database heartbeat timers
- [ ] **All worker files** - Audit background task timers

**Fix Template:**
```typescript
// BAD (leak):
setInterval(() => { ... }, 30000);

// GOOD (cleanup):
private interval?: NodeJS.Timeout;

initialize() {
  this.interval = setInterval(() => { ... }, 30000);
}

shutdown() {
  if (this.interval) {
    clearInterval(this.interval);
    this.interval = undefined;
  }
}
```

---

### 4. Database Connections

**Risk:** Connections opened but never closed, pool exhaustion.

**Search Patterns:**
```bash
# Find all Prisma client usage
grep -r "prisma\." src/ --include="*.ts" --include="*.js"
grep -r "\$connect\|\$disconnect" src/ --include="*.ts" --include="*.js"
grep -r "new PrismaClient" src/ --include="*.ts" --include="*.js"
```

**Checklist:**
- [ ] **src/shared/prisma.ts** - Verify all clients have $disconnect in shutdown
- [ ] **src/shared/prisma.ts** - Check connection pool limits (max connections)
- [ ] **scripts/** - Audit all scripts that create Prisma clients
- [ ] **tests/** - Verify test cleanup calls $disconnect
- [ ] **src/workers/** - Check worker Prisma client lifecycle
- [ ] **Database CLI tools** - Verify connections closed after operations

**Fix Template:**
```typescript
// BAD (connection leak):
const prisma = new PrismaClient();
await prisma.user.findMany();
// Never disconnects!

// GOOD (cleanup):
const prisma = new PrismaClient();
try {
  await prisma.user.findMany();
} finally {
  await prisma.$disconnect();
}
```

---

### 5. File Descriptors

**Risk:** Files/streams opened but never closed, descriptor exhaustion.

**Search Patterns:**
```bash
# Find all file operations
grep -r "fs\.open\|fs\.createReadStream\|fs\.createWriteStream" src/ --include="*.ts" --include="*.js"
grep -r "\.close()" src/ --include="*.ts" --include="*.js"
```

**Checklist:**
- [ ] **src/utils/intelligent-logger.ts** - Verify disk writes close file handles
- [ ] **src/services/engine-read-db.ts** - Check SQLite connection closed
- [ ] **src/services/engine-write-db.ts** - Verify WAL file handles closed
- [ ] **scripts/build-data.js** - Check data file handles closed
- [ ] **Store/** - Audit all file write operations
- [ ] **Log files** - Verify rotation doesn't leak descriptors

**Fix Template:**
```typescript
// BAD (descriptor leak):
const stream = fs.createWriteStream('data.json');
stream.write(data);
// Never closes!

// GOOD (cleanup):
const stream = fs.createWriteStream('data.json');
try {
  stream.write(data);
} finally {
  stream.close();
}

// BETTER (auto-cleanup):
await fs.promises.writeFile('data.json', data);
```

---

### 6. Child Processes

**Risk:** Processes spawned but never killed, accumulate zombie processes.

**Search Patterns:**
```bash
# Find all process spawning
grep -r "spawn\|exec\|fork" src/ --include="*.ts" --include="*.js"
grep -r "\.kill()" src/ --include="*.ts" --include="*.js"
```

**Checklist:**
- [ ] **scripts/** - Check all scripts that spawn child processes
- [ ] **src/workers/** - Verify worker processes have kill handlers
- [ ] **tests/** - Check test spawned processes cleaned up
- [ ] **Build scripts** - Verify build processes exit properly

**Fix Template:**
```typescript
// BAD (zombie process):
const child = spawn('node', ['worker.js']);
// Never kills!

// GOOD (cleanup):
const child = spawn('node', ['worker.js']);

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
  process.exit(0);
});
```

---

### 7. HTTP/WebSocket Connections

**Risk:** Long-lived connections without timeout, accumulate over time.

**Search Patterns:**
```bash
# Find all HTTP/WS usage
grep -r "axios\|fetch\|http\.request\|WebSocket" src/ --include="*.ts" --include="*.js"
grep -r "keepAlive\|timeout" src/ --include="*.ts" --include="*.js"
```

**Checklist:**
- [ ] **src/bot/main.js** - Discord.js WebSocket connection lifecycle
- [ ] **src/services/** - Check external API clients have timeouts
- [ ] **scripts/cache_client.mjs** - Verify HTTP requests have timeout
- [ ] **scripts/render_*.ps1** - Check Render API clients
- [ ] **External APIs** - Verify all have connection timeout + retry limits

**Fix Template:**
```typescript
// BAD (connection hangs):
const response = await fetch('https://api.example.com');
// No timeout!

// GOOD (timeout):
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch('https://api.example.com', {
    signal: controller.signal
  });
} finally {
  clearTimeout(timeout);
}
```

---

### 8. Cache Without TTL

**Risk:** Cache entries never expire, accumulate indefinitely.

**Search Patterns:**
```bash
# Find all cache implementations
grep -r "cache\|Cache" src/ --include="*.ts" --include="*.js"
grep -r "ttl\|TTL\|expir" src/ --include="*.ts" --include="*.js"
```

**Checklist:**
- [ ] **src/services/cache/facade.ts** - Verify TTL on cache entries
- [ ] **src/services/engine-cache.ts** - Check if Pokemon cache needs TTL
- [ ] **src/shared/cache/** - Audit all cache backends for TTL
- [ ] **Store/runtime-cache/** - Check persisted cache expiration
- [ ] **Store/discord-cache/** - Verify Discord cache TTL
- [ ] **Redis/memory caches** - Check all have max-age or TTL

**Fix Template:**
```typescript
// BAD (never expires):
cache.set('key', value);

// GOOD (TTL):
cache.set('key', value, { ttl: 3600 }); // 1 hour

// BETTER (automatic cleanup):
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt < now) {
      cache.delete(key);
    }
  }
}, 60000); // Clean every minute
```

---

### 9. Circular Buffers

**Risk:** Conservative eviction allows buffer to grow near capacity.

**Search Patterns:**
```bash
# Find all buffer implementations
grep -r "CircularBuffer\|RingBuffer\|buffer" src/ --include="*.ts" --include="*.js"
grep -r "evict\|threshold" src/ --include="*.ts" --include="*.js"
```

**Checklist:**
- [ ] **src/utils/intelligent-logger.ts** - ⚠️ NEEDS FIX (90% threshold too high)
  - Current: 90% threshold, 10% eviction → allows 6.3 MB before eviction
  - Target: 85% threshold, 15% eviction → triggers at 5.95 MB, removes more aggressively
- [ ] **src/services/engine-write-buffer.ts** - Check queue backpressure thresholds
- [ ] **Other buffer implementations** - Audit eviction policies

**Fix Template:**
```typescript
// BAD (conservative eviction):
private readonly EVICTION_THRESHOLD = 0.9; // 90%
private readonly EVICTION_PERCENT = 0.1;   // 10%

// GOOD (aggressive eviction):
private readonly EVICTION_THRESHOLD = 0.85; // 85%
private readonly EVICTION_PERCENT = 0.15;   // 15%

// Also cleanup indexes:
private cleanupIndexes() {
  for (const [id, entry] of this.categoryIndex.entries()) {
    if (!this.entries.has(entry.id)) {
      this.categoryIndex.delete(id);
    }
  }
}
```

---

### 10. Promise Chains & Closures

**Risk:** Large objects captured in closures, never released.

**Search Patterns:**
```bash
# Find promise patterns
grep -r "\.then\|async\|await" src/ --include="*.ts" --include="*.js"
grep -r "Promise\.all\|Promise\.race" src/ --include="*.ts" --include="*.js"
```

**Checklist:**
- [ ] **src/commands/** - Check battle command closures
- [ ] **src/workers/** - Verify worker promise chains don't capture large objects
- [ ] **src/data_pipeline/** - Check data processing closures
- [ ] **All async functions** - Audit closure captures

**Fix Template:**
```typescript
// BAD (captures large object):
async function process(largeData: Buffer) {
  return somePromise.then(() => {
    // Closure captures entire largeData forever!
    console.log(largeData.length);
  });
}

// GOOD (release early):
async function process(largeData: Buffer) {
  const length = largeData.length;
  largeData = null; // Release immediately
  
  return somePromise.then(() => {
    console.log(length); // Only captures primitive
  });
}
```

---

## Implementation Plan

### Phase 1: Critical Audit (Week 1 - Days 1-3)

**Focus:** EventEmitters, Maps/Sets, Timers (highest risk)

**Tasks:**
1. [ ] Run automated grep searches for all patterns
2. [ ] Create spreadsheet: File | Resource Type | Risk | Status | Fix Required
3. [ ] Audit top 20 highest-risk files first
4. [ ] Implement fixes for CRITICAL issues (unbounded growth)
5. [ ] Add tests for resource cleanup in shutdown flows

**Deliverables:**
- [ ] `RESOURCE-LEAK-AUDIT-RESULTS.md` with findings
- [ ] Pull request with critical fixes
- [ ] Updated shutdown handlers for all services

### Phase 2: High Priority Audit (Week 1 - Days 4-5)

**Focus:** Database connections, file descriptors, HTTP connections

**Tasks:**
1. [ ] Audit all Prisma client instantiations
2. [ ] Check all file I/O operations have cleanup
3. [ ] Verify all HTTP/WS clients have timeouts
4. [ ] Add connection pool monitoring
5. [ ] Implement automatic connection cleanup

**Deliverables:**
- [ ] Database connection audit report
- [ ] File descriptor leak fixes
- [ ] HTTP timeout enforcement

### Phase 3: Medium Priority Audit (Week 1 - Days 6-7)

**Focus:** Caches, buffers, singletons, global state

**Tasks:**
1. [ ] Review all cache implementations for TTL
2. [ ] Audit circular buffer eviction policies
3. [ ] Check singleton state accumulation
4. [ ] Add memory monitoring for long-running services
5. [ ] Implement periodic cleanup tasks

**Deliverables:**
- [ ] Cache TTL implementation
- [ ] Buffer eviction improvements (Fix 2 from memory leak)
- [ ] Singleton cleanup policies

### Phase 4: Automated Detection (Week 2)

**Focus:** Prevent future leaks with tooling

**Tasks:**
1. [ ] Create ESLint rules for common leak patterns
2. [ ] Add memory leak tests to CI/CD pipeline
3. [ ] Implement automated memory profiling (clinic.js)
4. [ ] Create resource leak detection scripts
5. [ ] Add monitoring alerts for resource exhaustion

**Deliverables:**
- [ ] ESLint plugin with leak detection rules
- [ ] CI/CD memory leak tests
- [ ] Automated profiling in staging
- [ ] Monitoring dashboard for resource usage

---

## Automated Search Commands

### Run All Searches at Once

```bash
# Save to file: scripts/audit-resource-leaks.sh
#!/bin/bash

echo "🔍 Resource Leak Audit - Automated Search"
echo "=========================================="

echo -e "\n1️⃣ EventEmitter Patterns:"
grep -r "new EventEmitter()" src/ --include="*.ts" --include="*.js" | wc -l
grep -r "\.on\(" src/ --include="*.ts" --include="*.js" | grep -v "\.off\(" | wc -l

echo -e "\n2️⃣ Map/Set Collections:"
grep -r "new Map\|new Set" src/ --include="*.ts" --include="*.js" | wc -l
grep -r "private.*Map<\|private.*Set<" src/ --include="*.ts" --include="*.js" | wc -l

echo -e "\n3️⃣ Timers:"
grep -r "setInterval\|setTimeout" src/ --include="*.ts" --include="*.js" | wc -l
grep -r "clearInterval\|clearTimeout" src/ --include="*.ts" --include="*.js" | wc -l

echo -e "\n4️⃣ Database Connections:"
grep -r "new PrismaClient" src/ --include="*.ts" --include="*.js" | wc -l
grep -r "\$disconnect" src/ --include="*.ts" --include="*.js" | wc -l

echo -e "\n5️⃣ File Operations:"
grep -r "createReadStream\|createWriteStream" src/ --include="*.ts" --include="*.js" | wc -l
grep -r "\.close()" src/ --include="*.ts" --include="*.js" | wc -l

echo -e "\n6️⃣ Child Processes:"
grep -r "spawn\|exec\|fork" src/ --include="*.ts" --include="*.js" | wc -l
grep -r "\.kill()" src/ --include="*.ts" --include="*.js" | wc -l

echo -e "\n7️⃣ HTTP/WebSocket:"
grep -r "axios\|fetch\|WebSocket" src/ --include="*.ts" --include="*.js" | wc -l
grep -r "timeout" src/ --include="*.ts" --include="*.js" | wc -l

echo -e "\n8️⃣ Cache Implementations:"
grep -r "cache\.set\|Cache\(" src/ --include="*.ts" --include="*.js" | wc -l
grep -r "ttl\|TTL\|expir" src/ --include="*.ts" --include="*.js" | wc -l

echo -e "\n✅ Audit complete. Review counts above."
```

### PowerShell Version (Windows)

```powershell
# Save to file: scripts/audit-resource-leaks.ps1

Write-Host "🔍 Resource Leak Audit - Automated Search" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "`n1️⃣ EventEmitter Patterns:" -ForegroundColor Yellow
$emitters = (Get-ChildItem -Path src -Recurse -Include *.ts,*.js | Select-String "new EventEmitter\(\)").Count
$listeners = (Get-ChildItem -Path src -Recurse -Include *.ts,*.js | Select-String "\.on\(" | Select-String -NotMatch "\.off\(").Count
Write-Host "  EventEmitters created: $emitters"
Write-Host "  Listeners without cleanup: $listeners"

Write-Host "`n2️⃣ Map/Set Collections:" -ForegroundColor Yellow
$maps = (Get-ChildItem -Path src -Recurse -Include *.ts,*.js | Select-String "new Map|new Set").Count
$privateMaps = (Get-ChildItem -Path src -Recurse -Include *.ts,*.js | Select-String "private.*Map<|private.*Set<").Count
Write-Host "  Maps/Sets created: $maps"
Write-Host "  Private Maps/Sets: $privateMaps"

Write-Host "`n3️⃣ Timers:" -ForegroundColor Yellow
$timers = (Get-ChildItem -Path src -Recurse -Include *.ts,*.js | Select-String "setInterval|setTimeout").Count
$cleared = (Get-ChildItem -Path src -Recurse -Include *.ts,*.js | Select-String "clearInterval|clearTimeout").Count
Write-Host "  Timers created: $timers"
Write-Host "  Timers cleared: $cleared"

Write-Host "`n4️⃣ Database Connections:" -ForegroundColor Yellow
$clients = (Get-ChildItem -Path src -Recurse -Include *.ts,*.js | Select-String "new PrismaClient").Count
$disconnects = (Get-ChildItem -Path src -Recurse -Include *.ts,*.js | Select-String "\`$disconnect").Count
Write-Host "  Prisma clients created: $clients"
Write-Host "  Disconnects called: $disconnects"

Write-Host "`n✅ Audit complete." -ForegroundColor Green
```

---

## Monitoring & Alerts

### Memory Monitoring (Add to All Services)

```typescript
// Add to src/shared/monitoring.ts
export function startMemoryMonitoring() {
  setInterval(() => {
    const usage = process.memoryUsage();
    const heapPercent = (usage.heapUsed / usage.heapTotal) * 100;
    
    if (heapPercent > 80) {
      console.warn('[MEMORY] High heap usage:', {
        heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
        heapPercent: heapPercent.toFixed(2),
        rssMB: Math.round(usage.rss / 1024 / 1024)
      });
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}
```

### Resource Leak Detection Test

```typescript
// Add to tests/resource-leak.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Resource Leak Detection', () => {
  it('EventEmitter listeners cleaned up on shutdown', async () => {
    const emitter = new EventEmitter();
    const logger = new IntelligentLogger();
    
    await logger.initialize();
    const initialCount = emitter.listenerCount('error');
    
    await logger.shutdown();
    const finalCount = emitter.listenerCount('error');
    
    expect(finalCount).toBeLessThanOrEqual(initialCount);
  });
  
  it('Timers cleared on shutdown', async () => {
    const worker = new CacheWorker();
    await worker.start();
    
    // Mock to track active timers
    const activeTimers = (process as any)._getActiveHandles();
    const initialCount = activeTimers.length;
    
    await worker.stop();
    const finalCount = activeTimers.length;
    
    expect(finalCount).toBeLessThan(initialCount);
  });
  
  it('Database connections closed', async () => {
    const prisma = new PrismaClient();
    await prisma.$connect();
    
    expect(prisma.$connect).toBeTruthy();
    
    await prisma.$disconnect();
    
    // Verify connection closed
    await expect(prisma.user.count()).rejects.toThrow();
  });
});
```

---

## Success Criteria

### Week 1 Goals

- [ ] 100% of EventEmitters audited and fixed
- [ ] All Map/Set collections have size limits
- [ ] All timers have cleanup in shutdown handlers
- [ ] Zero database connection leaks
- [ ] All file operations have proper cleanup
- [ ] `RESOURCE-LEAK-AUDIT-RESULTS.md` completed

### Week 2 Goals

- [ ] ESLint rules prevent new leaks
- [ ] CI/CD pipeline detects memory leaks
- [ ] Automated memory profiling active
- [ ] Monitoring alerts for resource exhaustion
- [ ] Documentation updated with best practices

### Long-term Goals

- [ ] Zero resource-related crashes in production
- [ ] Memory usage stable for 7+ days
- [ ] No connection pool exhaustion
- [ ] No file descriptor exhaustion
- [ ] Automated leak detection in staging

---

## Documentation & Best Practices

### Developer Guidelines

Create `docs/RESOURCE-LEAK-PREVENTION.md` with:

1. **EventEmitter Best Practices**
   - Always store listener references
   - Remove listeners in shutdown
   - Set maxListeners to warn on accumulation
   - Use `.once()` when appropriate

2. **Collection Best Practices**
   - Set max size for all Maps/Sets/Arrays
   - Implement LRU eviction policies
   - Add TTL for cached data
   - Monitor collection sizes

3. **Timer Best Practices**
   - Store timer IDs as instance properties
   - Clear timers in shutdown handlers
   - Use `once` for one-time delays
   - Document timer purpose and lifecycle

4. **Database Best Practices**
   - Always call $disconnect in finally blocks
   - Use connection pooling with limits
   - Monitor active connections
   - Set query timeouts

5. **File Best Practices**
   - Use fs.promises for automatic cleanup
   - Close streams in finally blocks
   - Implement file rotation for logs
   - Monitor open file descriptors

---

## Timeline

| Week | Phase | Focus | Deliverables |
|------|-------|-------|--------------|
| **1** | Critical | EventEmitters, Maps, Timers | Fixes + Report |
| **1** | High | DB, Files, HTTP | Connection fixes |
| **1** | Medium | Caches, Buffers | TTL + Eviction |
| **2** | Automation | Tooling, Monitoring | ESLint + CI/CD |

---

## Next Actions

1. **Immediate (Today):**
   - [ ] Run automated search scripts
   - [ ] Create tracking spreadsheet
   - [ ] Prioritize top 10 highest-risk files

2. **This Week:**
   - [ ] Execute Phase 1 (Critical audit)
   - [ ] Fix all EventEmitter leaks
   - [ ] Add cleanup to all timers

3. **Next Week:**
   - [ ] Execute Phase 2-3 (High/Medium)
   - [ ] Implement automated detection
   - [ ] Add monitoring + alerts

---

## References

- **Memory Leak Fix:** `docs/MEMORY-LEAK-ANALYSIS.md` (EventEmitter example)
- **Validation Guide:** `docs/MEMORY-LEAK-DEPLOYMENT-VALIDATION.md`
- **Agents Guide:** `Agents.md` (Database architecture section)
- **Operations Guide:** `OPERATIONS.md` (Service matrix)

**Status:** READY - Execute Phase 1 immediately ✅
