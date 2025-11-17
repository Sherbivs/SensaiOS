# Section 4: Performance

[← Back to INDEX](INDEX.md) | [← Previous: Debugging Guides](03-debugging-guides.md) | [Next: Error Handling →](05-error-handling.md)

---

**Philosophy**: "Performance is a feature—every millisecond saved is a better player experience."

**Purpose**: Memory analysis, profiling tools, optimization techniques.

## 4.1 Memory Analysis

### Current Baselines (November 2025)

**Target Memory Usage:**
- **Per Service:** <512 MB (Render plan limit)
- **Peak RAM:** ~300-350 MB (58-68% of limit)
- **L1 Cache:** 20 MB max (lazy loading + feature flags)
- **Write Buffer:** 5 MB (queue size limits)
- **Logger Buffer:** 1 MB (200 entry cap)

**Bounded Data Structures (Completed 2025-11-06):**
- ✅ Discord.js cache sweeping (prevents 100+ MB leaks)
- ✅ Write queues (10k entry cap, 75% backpressure)
- ✅ Ops error queue (200 entry rolling buffer)
- ✅ L1 Cache (LRU with 250 entry limit)

### Memory Profiling Tools

**Node.js Heap Snapshots:**
```bash
# Start with --inspect flag
node --inspect dist/index.js

# In Chrome DevTools (chrome://inspect)
# 1. Click "inspect" on Node process
# 2. Go to "Memory" tab
# 3. Take heap snapshot
# 4. Compare snapshots to find leaks
```

**Clinic.js Heapprofiler:**
```bash
# Install
npm install -g clinic

# Profile application
clinic heapprofiler -- node dist/index.js

# Generates HTML report showing allocation timeline
```

**Process Memory Monitoring:**
```typescript
// src/utils/memory-monitor.ts
setInterval(() => {
  const mem = process.memoryUsage();
  console.log({
    rss: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`,
    heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    external: `${(mem.external / 1024 / 1024).toFixed(2)} MB`
  });
}, 30000); // Every 30 seconds
```

### Memory Leak Detection

**Signs of Memory Leaks:**
- Memory usage increases over hours without stabilizing
- Garbage collection frequency increases
- Event listeners accumulate without cleanup
- Timers/intervals not cleared

**Common Leak Sources:**
```typescript
// ❌ BAD: Event listener not removed
emitter.on('event', handler);
// Memory leak if emitter outlives handler

// ✅ GOOD: Remove listener on cleanup
const listener = emitter.on('event', handler);
// Later:
emitter.off('event', handler);

// ❌ BAD: Interval not cleared
setInterval(() => { /* work */ }, 1000);
// Memory leak if object holding interval is destroyed

// ✅ GOOD: Clear interval on shutdown
const intervalId = setInterval(() => { /* work */ }, 1000);
process.on('SIGTERM', () => clearInterval(intervalId));

// ❌ BAD: Unbounded array growth
const cache = [];
cache.push(item); // No eviction
// Memory leak as cache grows indefinitely

// ✅ GOOD: Bounded with LRU eviction
const cache = new LRUCache({ max: 1000 });
cache.set(key, item); // Auto-evicts oldest entries
```

## 4.2 Profiling

### CPU Profiling

**Node.js Inspector:**
```bash
# Start with profiling enabled
node --inspect --cpu-prof dist/index.js

# Generates .cpuprofile file
# Open in Chrome DevTools > Performance tab
```

**0x Flamegraph:**
```bash
# Install
npm install -g 0x

# Generate flamegraph
0x -- node dist/index.js

# Opens interactive flamegraph in browser
# Shows function call hierarchy + CPU time
```

### Performance Benchmarks

**Dexpack Lookup Benchmark:**
```bash
# Run performance regression tests
npm run bench:dex

# Output:
#   getSpecies (by ID):     0.003ms  (3μs)
#   getSpecies (by name):   0.012ms  (12μs)
#   getMove:                0.005ms  (5μs)
#   L1 Cache hit:           0.001ms  (1μs)  ← 10-100x faster
```

**Custom Benchmarks:**
```typescript
import { bench, describe } from "vitest";

describe("Battle Damage Calculation", () => {
  bench("calculateDamage (basic)", () => {
    calculateDamage({
      attackerLevel: 50,
      attackerAttack: 100,
      defenderDefense: 80,
      movePower: 90
    });
  }, { iterations: 10000 });

  bench("calculateDamage (with type effectiveness)", () => {
    calculateDamage({
      attackerLevel: 50,
      attackerAttack: 100,
      defenderDefense: 80,
      movePower: 90,
      attackerType: "fire",
      defenderType: "grass"
    });
  }, { iterations: 10000 });
});
```

### Performance Monitoring

**Startup Timing:**
```typescript
// src/index.ts
const STARTUP_TIMINGS = {
  module_imports: process.hrtime.bigint(),
  database_connect: null,
  engine_cache_load: null,
  bots_ready: null,
  total_startup: null
};

// After database connection
STARTUP_TIMINGS.database_connect = process.hrtime.bigint();

// Log startup report
console.log({
  module_imports: formatDuration(STARTUP_TIMINGS.database_connect - STARTUP_TIMINGS.module_imports),
  database_connect: formatDuration(STARTUP_TIMINGS.engine_cache_load - STARTUP_TIMINGS.database_connect),
  total_startup: formatDuration(STARTUP_TIMINGS.total_startup - STARTUP_TIMINGS.module_imports)
});
```

**Query Performance:**
```typescript
// src/shared/prisma.ts
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;
  
  if (duration > 100) {
    log.warn("Slow query detected", {
      duration,
      model: params.model,
      action: params.action
    });
  }
  
  return result;
});
```

### Optimization Techniques

**1. Lazy Loading:**
```typescript
// BEFORE: Load all commands on startup (~500ms)
const commands = await loadCommands();

// AFTER: Load on first interaction (deferred)
let commands: CommandCollection | null = null;
async function ensureCommandsLoaded() {
  if (!commands) commands = await loadCommands();
  return commands;
}
```

**2. LRU Cache Eviction:**
```typescript
// BEFORE: Store all 493 Pokémon (20MB)
const cache = new Map<number, Pokemon>();

// AFTER: LRU with 250 entry limit (8MB, 60% reduction)
const cache = new LRUCache<number, Pokemon>({ max: 250 });
```

**3. Tiered Cache Loading:**
```typescript
// BEFORE: Load all species at once (1000ms)
await engineCache.refresh();

// AFTER: Load Gen 1-2 core (200ms), Gen 3-9 background (800ms)
await engineCache.refreshTiered({
  corePriority: [1, 2],      // Gen 1-2 (251 species)
  backgroundGens: [3, 4, 5, 6, 7, 8, 9]
});
```

---

[← Back to INDEX](INDEX.md) | [← Previous: Debugging Guides](03-debugging-guides.md) | [Next: Error Handling →](05-error-handling.md)