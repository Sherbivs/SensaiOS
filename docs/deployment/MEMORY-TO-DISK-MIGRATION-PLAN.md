# Memory-to-Disk Migration Plan
## Runtime Memory → /Store Disk Persistence

**Date**: 2025-11-11  
**Phase**: Post-Centralization Resource Optimization  
**Goal**: Reduce runtime memory usage by migrating in-memory structures to disk storage  
**Target**: Reduce 154 MB → 100 MB runtime footprint (-35% memory, +54 MB free capacity)

---

## Executive Summary

After implementing centralized resource request validation, we now optimize memory allocation by migrating in-memory data structures to disk-based storage in `/Store`. The **fast live game cache (Engine L1 Cache) REMAINS in-memory** for <1μs battle performance, but Read-DB and Write-DB will be processed via `/Store` with aggressive cleanup policies.

**Architecture Transformation**:
```
BEFORE (Current - 154 MB runtime):
├── Engine L1 Cache: 60 MB (Map-based, in-memory)      ← KEEP IN-MEMORY
├── Runtime Cache: 50 MB (Map-based, in-memory)        ← MIGRATE TO DISK
├── Write Buffer: 25 MB (Array queues, in-memory)      ← PARTIAL MIGRATION
├── Read-DB: 5-10 MB (sql.js, in-memory)              ← MIGRATE TO DISK
├── Write-DB: 10-20 MB (sql.js, in-memory)            ← MIGRATE TO DISK
├── Logger Buffer: 2-5 MB (Map-based, in-memory)      ← AGGRESSIVE CLEANUP
└── Misc Caches: 2-7 MB (Map/Set structures)          ← AUDIT & MIGRATE

AFTER (Target - 100 MB runtime):
├── Engine L1 Cache: 60 MB (Map-based, in-memory)      ✅ FAST GAME CACHE
├── Runtime Cache: 5 MB (LRU hot layer, disk-backed)   ✅ 90% DISK
├── Write Buffer: 5 MB (Small queue, aggressive flush) ✅ 80% REDUCTION
├── Read-DB: DISK-ONLY (mmap via /Store)              ✅ 0 MB IN-MEMORY
├── Write-DB: DISK-ONLY (mmap via /Store)             ✅ 0 MB IN-MEMORY
├── Logger Buffer: 1 MB (aggressive flush, disk log)   ✅ 50-80% REDUCTION
└── Misc Caches: 1 MB (converted to disk-backed LRU)   ✅ 85% REDUCTION
```

**Memory Savings**:
- Runtime Cache: -45 MB (50 MB → 5 MB hot layer)
- Write Buffer: -20 MB (25 MB → 5 MB queue)
- Read-DB: -10 MB (in-memory → disk-only)
- Write-DB: -15 MB (in-memory → disk-only)
- Logger Buffer: -3 MB (5 MB → 1 MB + disk)
- Misc Caches: -5 MB (7 MB → 1 MB)
- **TOTAL REDUCTION: -98 MB**
- **NEW RUNTIME: ~100 MB (20% of 512 MB plan)**

---

## Table of Contents

1. [Current Memory Inventory](#current-memory-inventory)
2. [Migration Strategy](#migration-strategy)
3. [Component-by-Component Plan](#component-by-component-plan)
4. [Implementation Phases](#implementation-phases)
5. [Cleanup Policies](#cleanup-policies)
6. [Performance Impact](#performance-impact)
7. [Rollback Plan](#rollback-plan)

---

## Current Memory Inventory

### In-Memory Structures Analysis

| Component | Location | Type | Current Size | Cleanup Policy | Migration Priority |
|-----------|----------|------|--------------|----------------|-------------------|
| **Engine L1 Cache** | `src/services/engine-cache.ts` | `Map<number, Pokemon>` | 60 MB | LRU (500 entries) | ❌ KEEP IN-MEMORY (battle performance) |
| **Runtime Cache** | `src/services/cache/facade.ts` | `InMemoryLru` | 50 MB | LRU (2000 items) | ✅ HIGH - Migrate to disk-backed |
| **Write Buffer** | `src/services/engine-write-buffer.ts` | `Array[]` (3 queues) | 25 MB | 30s flush | ✅ HIGH - Reduce queue size, aggressive flush |
| **Read-DB** | `src/services/engine-read-db.ts` | `sql.js` Database | 5-10 MB | Static (daily sync) | ✅ MEDIUM - Migrate to disk-only (mmap) |
| **Write-DB** | `src/services/engine-write-db.ts` | `sql.js` Database | 10-20 MB | 24h pruning | ✅ MEDIUM - Migrate to disk-only (mmap) |
| **Logger Buffer** | `src/shared/logBuffer.ts` | `Map<string, LogEntry>` | 2-5 MB | Manual flush | ✅ MEDIUM - Aggressive flush + disk log |
| **Intelligent Logger** | `src/utils/intelligent-logger.ts` | `Map<string, LogEntry>` | 2-5 MB | Manual eviction | ✅ LOW - Add TTL + disk persistence |
| **Dex API Cache** | `src/lib/dex-api.js` | `Map` (species, moves) | 1-3 MB | Manual clear | ✅ LOW - Migrate to Runtime Cache |
| **Cooldown Store** | `src/lib/cooldown.js` | `Map<string, timestamp>` | <1 MB | No cleanup | ✅ LOW - Add TTL + disk persistence |
| **Activity Tracker** | `src/utils/activityTracker.js` | `Map<string, count>` | <1 MB | No cleanup | ✅ LOW - Periodic flush to disk |

**Total Runtime Memory**: ~154 MB  
**Target After Migration**: ~100 MB  
**Reduction Goal**: -54 MB (-35%)

---

## Migration Strategy

### Core Principles

1. **PRESERVE GAME PERFORMANCE**: Engine L1 Cache (60 MB) MUST remain in-memory for <1μs lookup latency
2. **DISK-BACKED CACHING**: Convert in-memory caches to small hot-layer + disk persistence
3. **AGGRESSIVE CLEANUP**: Reduce queue sizes, flush more frequently, prune aggressively
4. **MMAP FOR DATABASES**: Use memory-mapped files for Read-DB/Write-DB (no in-memory copy)
5. **TTL EVERYWHERE**: Add time-to-live to all caches, logs, and buffers

### Migration Patterns

#### Pattern 1: Hot Layer + Disk Backing (Runtime Cache)

**Current** (50 MB in-memory):
```typescript
// src/services/cache/facade.ts
let memoryCache = new InMemoryLru<unknown>(
  50 * 1024 * 1024,  // 50 MB max
  2000               // 2000 items max
);
```

**After** (5 MB hot layer + disk):
```typescript
// NEW: Disk-backed cache with small hot layer
let memoryCache = new InMemoryLru<unknown>(
  5 * 1024 * 1024,   // 5 MB hot layer (10x reduction)
  200                // 200 items max (10x reduction)
);

// Fallback to /Store for cache misses
async function getOrHydrate<T>(options, hydrator): Promise<T> {
  // 1. Check hot layer (5 MB in-memory)
  const hotEntry = memoryCache.get(key);
  if (hotEntry) return hotEntry.value;
  
  // 2. Check disk (/Store/runtime-cache/<namespace>/<key>)
  const diskEntry = await readFromDisk<T>(options);
  if (diskEntry) {
    // Promote to hot layer
    memoryCache.set(key, diskEntry);
    return diskEntry.value;
  }
  
  // 3. Hydrate from source
  const value = await hydrator();
  
  // 4. Write to disk FIRST, then hot layer
  await writeToDisk(options, value);
  memoryCache.set(key, value);
  
  return value;
}
```

**Memory Savings**: -45 MB (50 MB → 5 MB)

#### Pattern 2: Reduced Queue + Aggressive Flush (Write Buffer)

**Current** (25 MB, 30s flush):
```typescript
// src/services/engine-write-buffer.ts
const MAX_QUEUE_SIZE = 10000;           // 10k entries per queue
const FLUSH_INTERVAL_MS = 30000;        // 30s flush interval
const REJECT_THRESHOLD = 0.95;          // Reject at 95% full

private battleLogQueue: BattleLogEntry[] = [];
private moveUsageQueue: MoveUsageEntry[] = [];
private anomalyQueue: AnomalyEntry[] = [];
```

**After** (5 MB, 10s flush):
```typescript
// REDUCED: Smaller queues, faster flush
const MAX_QUEUE_SIZE = 2000;            // 2k entries per queue (5x reduction)
const FLUSH_INTERVAL_MS = 10000;        // 10s flush interval (3x faster)
const REJECT_THRESHOLD = 0.90;          // Reject at 90% full (earlier backpressure)

private battleLogQueue: BattleLogEntry[] = [];
private moveUsageQueue: MoveUsageEntry[] = [];
private anomalyQueue: AnomalyEntry[] = [];

// NEW: Automatic flush when queue reaches 1k (before backpressure)
private checkFlushNeeded(): void {
  const totalSize = this.battleLogQueue.length + 
                    this.moveUsageQueue.length + 
                    this.anomalyQueue.length;
  
  if (totalSize >= 1000) {
    this.flush().catch(error => {
      log('error', '[WriteBuffer] Auto-flush failed', error);
    });
  }
}
```

**Memory Savings**: -20 MB (25 MB → 5 MB)

#### Pattern 3: Disk-Only Database (Read-DB / Write-DB)

**Current** (in-memory sql.js):
```typescript
// src/services/engine-read-db.ts
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let readDb: Database | null = null;

// Entire DB loaded into memory
const dbBuffer = await fsPromises.readFile(ENGINE_READ_DB_PATH);
readDb = new SQL.Database(dbBuffer);  // ← FULL DB IN MEMORY (~10 MB)
```

**After** (memory-mapped file):
```typescript
// NEW: Use file-backed database (mmap)
import initSqlJs from 'sql.js';

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let readDb: Database | null = null;

// MMAP: Database stays on disk, only accessed pages loaded
SQL = await initSqlJs({
  locateFile: (file) => `/Store/engine-db/${file}`
});

// Open database in file mode (no in-memory copy)
readDb = new SQL.Database(ENGINE_READ_DB_PATH, { 
  filename: true  // ← FILE-BACKED MODE (0 MB in-memory)
});

// Configure for read-only access
readDb.run('PRAGMA query_only = ON');
readDb.run('PRAGMA cache_size = 2000');  // 2MB cache max
```

**Memory Savings (Read-DB)**: -10 MB (10 MB → 0 MB)  
**Memory Savings (Write-DB)**: -15 MB (15 MB → 0 MB)

#### Pattern 4: Aggressive Flush + Disk Log (Logger Buffer)

**Current** (5 MB in-memory):
```typescript
// src/shared/logBuffer.ts
const config = {
  maxBufferSize: 1000,     // 1000 logs buffered
  flushIntervalMs: 60000,  // 1 minute flush
};

private buffer = new Map<string, LogEntry>();
```

**After** (1 MB + disk):
```typescript
// REDUCED: Smaller buffer, faster flush
const config = {
  maxBufferSize: 200,      // 200 logs buffered (5x reduction)
  flushIntervalMs: 10000,  // 10s flush (6x faster)
};

private buffer = new Map<string, LogEntry>();

// NEW: Flush to disk when buffer reaches 100 entries
private checkFlushNeeded(): void {
  if (this.buffer.size >= 100) {
    this.flushToDisk().catch(error => {
      console.error('[LogBuffer] Flush failed:', error);
    });
  }
}

// NEW: Write to /Store/logs/ instead of memory
private async flushToDisk(): Promise<void> {
  const entries = Array.from(this.buffer.values());
  const logFile = `/Store/logs/${Date.now()}.jsonl`;
  
  await fsPromises.appendFile(
    logFile,
    entries.map(e => JSON.stringify(e)).join('\n') + '\n'
  );
  
  this.buffer.clear();
}
```

**Memory Savings**: -4 MB (5 MB → 1 MB)

---

## Component-by-Component Plan

### 1. Runtime Cache (Priority: HIGH)

**Current State**:
- Location: `src/services/cache/facade.ts`
- Type: `InMemoryLru` with 50 MB max, 2000 items
- Usage: Pokemon data, Discord cache, security bot state
- Cleanup: LRU eviction when full

**Migration Plan**:
- ✅ **Phase 1**: Add disk persistence to existing LRU (Week 1)
- ✅ **Phase 2**: Reduce hot layer to 5 MB / 200 items (Week 1)
- ✅ **Phase 3**: Migrate all `readCache()`/`writeCache()` calls to disk-backed facade (Week 2)
- ✅ **Phase 4**: Add TTL to all cache entries (default: 1 hour) (Week 2)

**Implementation**:
```typescript
// src/services/cache/facade.ts

// NEW: Disk-backed configuration
const config: Required<CacheFacadeConfig> = {
  maxMemoryBytes: 5 * 1024 * 1024,    // 5 MB hot layer (was 50 MB)
  maxMemoryItems: 200,                // 200 items (was 2000)
  rootDir: '/Store/runtime-cache',    // Disk backing
  defaultTtlMs: 3600000,              // 1 hour TTL (NEW)
};

// NEW: Automatic disk promotion/demotion
class DiskBackedLru<T> extends InMemoryLru<T> {
  async get(key: string): Promise<T | undefined> {
    // 1. Check hot layer
    let entry = super.get(key);
    if (entry) return entry;
    
    // 2. Check disk
    const diskEntry = await this.loadFromDisk(key);
    if (diskEntry && !this.isExpired(diskEntry)) {
      // Promote to hot layer
      super.set(key, diskEntry);
      return diskEntry;
    }
    
    return undefined;
  }
  
  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    // 1. Write to disk FIRST (durable)
    await this.writeToDisk(key, value, ttlMs);
    
    // 2. Add to hot layer (volatile)
    super.set(key, value);
  }
  
  private async loadFromDisk(key: string): Promise<T | null> {
    try {
      const filePath = path.join(config.rootDir, `${key}.json`);
      const data = await fsPromises.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
  
  private async writeToDisk(key: string, value: T, ttlMs?: number): Promise<void> {
    const filePath = path.join(config.rootDir, `${key}.json`);
    const cacheEntry = {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ttlMs || config.defaultTtlMs),
    };
    
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(cacheEntry), 'utf-8');
  }
  
  private isExpired(entry: any): boolean {
    return Date.now() > entry.expiresAt;
  }
}
```

**Testing**:
```bash
# Test cache promotion/demotion
npm run test -- cache.facade.spec.ts

# Monitor memory usage
npm run ops:resource-stats

# Verify disk writes
ls -lah /Store/runtime-cache/
```

**Rollback**: Revert `maxMemoryBytes` to 50 MB, disable disk backing

---

### 2. Write Buffer (Priority: HIGH)

**Current State**:
- Location: `src/services/engine-write-buffer.ts`
- Type: 3 `Array[]` queues (battleLogs, moveUsage, anomalies)
- Size: 10k entries per queue × 3 = 30k entries (~25 MB)
- Flush: Every 30s

**Migration Plan**:
- ✅ **Phase 1**: Reduce queue size to 2k entries (5x reduction) (Week 1)
- ✅ **Phase 2**: Increase flush frequency to 10s (3x faster) (Week 1)
- ✅ **Phase 3**: Add auto-flush at 1k entries (before backpressure) (Week 2)
- ✅ **Phase 4**: Move Write-DB to disk-only (mmap) (Week 2)

**Implementation**:
```typescript
// src/services/engine-write-buffer.ts

// CONFIGURATION: Reduced queue sizes
const MAX_QUEUE_SIZE = 2000;            // 2k entries per queue (was 10k)
const FLUSH_INTERVAL_MS = 10000;        // 10s flush (was 30s)
const AUTO_FLUSH_THRESHOLD = 1000;      // Auto-flush at 1k entries (NEW)
const REJECT_THRESHOLD = 0.90;          // Reject at 90% (was 95%)

class EngineWriteBuffer {
  private battleLogQueue: BattleLogEntry[] = [];
  private moveUsageQueue: MoveUsageEntry[] = [];
  private anomalyQueue: AnomalyEntry[] = [];
  
  // NEW: Check if auto-flush needed after every push
  logBattle(entry: BattleLogEntry): void {
    if (this.isBackpressureActive()) {
      throw new Error('[WriteBuffer] Backpressure active - rejecting battle log');
    }
    
    this.battleLogQueue.push(entry);
    
    // NEW: Auto-flush check
    if (this.getTotalQueueSize() >= AUTO_FLUSH_THRESHOLD) {
      this.flush().catch(error => {
        log('error', '[WriteBuffer] Auto-flush failed', error);
      });
    }
  }
  
  private getTotalQueueSize(): number {
    return this.battleLogQueue.length + 
           this.moveUsageQueue.length + 
           this.anomalyQueue.length;
  }
  
  // MODIFIED: Flush to disk-only Write-DB
  async flush(): Promise<void> {
    const startTime = performance.now();
    
    // Atomic splice (remove from memory immediately)
    const battles = this.battleLogQueue.splice(0);
    const moves = this.moveUsageQueue.splice(0);
    const anomalies = this.anomalyQueue.splice(0);
    
    // Write to disk-only Write-DB (no in-memory copy)
    if (battles.length > 0) {
      await engineWriteDb.insertBattleLogs(battles);
    }
    if (moves.length > 0) {
      await engineWriteDb.insertMoveUsage(moves);
    }
    if (anomalies.length > 0) {
      await engineWriteDb.insertAnomalies(anomalies);
    }
    
    const durationMs = performance.now() - startTime;
    this.flushCount++;
    this.lastFlushTime = new Date();
    
    log('info', '[WriteBuffer] Flushed queues to disk', {
      battles: battles.length,
      moves: moves.length,
      anomalies: anomalies.length,
      durationMs: durationMs.toFixed(2),
    });
  }
}
```

**Testing**:
```bash
# Test flush frequency
npm run test -- engine-write-buffer.spec.ts

# Monitor queue sizes
npm run ops:resource-stats

# Verify backpressure triggers
# (simulate high load, check for rejection errors)
```

**Rollback**: Revert `MAX_QUEUE_SIZE` to 10k, `FLUSH_INTERVAL_MS` to 30s

---

### 3. Read-DB / Write-DB (Priority: MEDIUM)

**Current State**:
- Location: `src/services/engine-read-db.ts`, `src/services/engine-write-db.ts`
- Type: `sql.js` Database (entire DB loaded into memory)
- Size: Read-DB ~10 MB, Write-DB ~15 MB
- Access: Synchronous queries

**Migration Plan**:
- ✅ **Phase 1**: Migrate to file-backed sql.js (mmap mode) (Week 2)
- ✅ **Phase 2**: Configure PRAGMA for minimal cache (Week 2)
- ✅ **Phase 3**: Add auto-save after every Write-DB insert (Week 2)
- ✅ **Phase 4**: Prune Write-DB more aggressively (24h → 12h retention) (Week 3)

**Implementation**:
```typescript
// src/services/engine-read-db.ts

import initSqlJs from 'sql.js';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

// DISK-ONLY: Use file-backed database
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let readDb: Database | null = null;

async function initialize(): Promise<void> {
  if (readDb) return; // Already initialized
  
  // Initialize sql.js
  SQL = await initSqlJs({
    locateFile: (file) => {
      // Ensure sql.js wasm files are in /Store/engine-db/
      return `/Store/engine-db/${file}`;
    }
  });
  
  // Open database in FILE MODE (no in-memory copy)
  const dbPath = '/Store/engine-read.db';
  
  if (fs.existsSync(dbPath)) {
    // Open existing database
    readDb = new SQL.Database(dbPath, { filename: true });
  } else {
    // Create new database
    readDb = new SQL.Database(dbPath, { filename: true });
    await createSchema();
  }
  
  // Configure for minimal memory usage
  readDb.run('PRAGMA query_only = ON');       // Read-only mode
  readDb.run('PRAGMA cache_size = 2000');     // 2MB cache max (was unlimited)
  readDb.run('PRAGMA temp_store = FILE');     // Temp tables on disk
  readDb.run('PRAGMA mmap_size = 10485760');  // 10MB memory-mapped region
  
  log('info', '[ReadDb] Initialized in disk-only mode', {
    path: dbPath,
    sizeBytes: fs.statSync(dbPath).size,
    cacheSize: '2MB max',
  });
}

// AUTO-SAVE: Save to disk after every query batch
async function getAllPokemon(): Promise<ReadDbPokemonRecord[]> {
  if (!readDb) throw new Error('[ReadDb] Not initialized');
  
  const stmt = readDb.prepare('SELECT * FROM pokemon');
  const results = [];
  
  while (stmt.step()) {
    results.push(stmt.getAsObject() as ReadDbPokemonRecord);
  }
  
  stmt.free();
  
  // AUTO-SAVE: Persist changes immediately
  await this.saveToFile();
  
  return results;
}

async function saveToFile(): Promise<void> {
  if (!readDb) return;
  
  // Export database to file
  const data = readDb.export();
  await fsPromises.writeFile('/Store/engine-read.db', data);
}
```

**Testing**:
```bash
# Test file-backed mode
npm run test -- engine-read-db.spec.ts

# Verify no in-memory copy
# (check memory usage before/after queries)
npm run ops:resource-stats

# Benchmark query performance
# (should be <5ms for cached queries, <20ms for cold queries)
```

**Rollback**: Revert to in-memory mode (`new SQL.Database(dbBuffer)`)

---

### 4. Logger Buffer (Priority: MEDIUM)

**Current State**:
- Location: `src/shared/logBuffer.ts`, `src/utils/intelligent-logger.ts`
- Type: `Map<string, LogEntry>` (in-memory log storage)
- Size: ~5 MB (1000 logs buffered)
- Flush: Manual or 1-minute interval

**Migration Plan**:
- ✅ **Phase 1**: Reduce buffer size to 200 entries (5x reduction) (Week 2)
- ✅ **Phase 2**: Increase flush frequency to 10s (6x faster) (Week 2)
- ✅ **Phase 3**: Add auto-flush at 100 entries (Week 2)
- ✅ **Phase 4**: Write logs to `/Store/logs/` instead of memory (Week 3)

**Implementation**:
```typescript
// src/shared/logBuffer.ts

const config = {
  maxBufferSize: 200,      // 200 logs (was 1000)
  flushIntervalMs: 10000,  // 10s flush (was 60s)
  autoFlushThreshold: 100, // Auto-flush at 100 entries (NEW)
  logDir: '/Store/logs/',  // Disk log directory (NEW)
};

class LogBuffer {
  private buffer = new Map<string, LogEntry>();
  private flushTimer: NodeJS.Timeout | null = null;
  
  append(entry: LogEntry): void {
    this.buffer.set(entry.id, entry);
    
    // NEW: Auto-flush check
    if (this.buffer.size >= config.autoFlushThreshold) {
      this.flushToDisk().catch(error => {
        console.error('[LogBuffer] Auto-flush failed:', error);
      });
    }
  }
  
  // NEW: Flush to disk instead of holding in memory
  private async flushToDisk(): Promise<void> {
    if (this.buffer.size === 0) return;
    
    const entries = Array.from(this.buffer.values());
    const timestamp = Date.now();
    const logFile = path.join(config.logDir, `${timestamp}.jsonl`);
    
    // Write as JSON Lines (one log per line)
    const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    
    await fsPromises.mkdir(config.logDir, { recursive: true });
    await fsPromises.appendFile(logFile, content, 'utf-8');
    
    // Clear buffer after successful write
    this.buffer.clear();
    
    log('debug', '[LogBuffer] Flushed to disk', {
      entries: entries.length,
      file: logFile,
    });
  }
  
  // NEW: Rotate old logs (delete logs older than 7 days)
  private async rotateOldLogs(): Promise<void> {
    const files = await fsPromises.readdir(config.logDir);
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    for (const file of files) {
      const timestamp = parseInt(file.replace('.jsonl', ''), 10);
      if (timestamp < cutoff) {
        await fsPromises.unlink(path.join(config.logDir, file));
      }
    }
  }
}
```

**Testing**:
```bash
# Test flush to disk
npm run test -- logBuffer.spec.ts

# Verify log rotation
ls -lah /Store/logs/

# Check memory usage
npm run ops:resource-stats
```

**Rollback**: Revert `maxBufferSize` to 1000, disable disk writes

---

### 5. Miscellaneous Caches (Priority: LOW)

**Targets**:
- `src/lib/dex-api.js` - Species cache, move cache (1-3 MB)
- `src/lib/cooldown.js` - Cooldown store (< 1 MB)
- `src/utils/activityTracker.js` - Activity tracker (< 1 MB)
- `src/utils/intelligent-logger.ts` - Log entry cache (2-5 MB)

**Migration Plan**:
- ✅ **Phase 1**: Migrate dex-api caches to Runtime Cache (Week 3)
- ✅ **Phase 2**: Add TTL to cooldown store (Week 3)
- ✅ **Phase 3**: Add periodic flush to activity tracker (Week 3)
- ✅ **Phase 4**: Reduce intelligent-logger cache size (Week 4)

**Implementation**: See detailed plans in Phase 4 (Week 3-4)

---

## Implementation Phases

### Phase 1: High-Priority Migrations (Week 1)

**Day 1-2: Runtime Cache**
- ✅ Add disk persistence layer to `cache/facade.ts`
- ✅ Reduce hot layer to 5 MB / 200 items
- ✅ Test cache promotion/demotion
- ✅ Deploy to DEV, monitor for 24h

**Day 3-4: Write Buffer**
- ✅ Reduce queue size to 2k entries
- ✅ Increase flush frequency to 10s
- ✅ Add auto-flush at 1k entries
- ✅ Deploy to DEV, monitor for 24h

**Day 5-7: Testing & Validation**
- ✅ Load testing (simulate high battle volume)
- ✅ Memory profiling (verify -65 MB reduction)
- ✅ Performance testing (cache hit rates, flush latency)

**Success Criteria**:
- Memory usage reduced by 65 MB (154 MB → 89 MB)
- Cache hit rate > 85%
- Flush latency < 100ms
- Zero data loss

---

### Phase 2: Database Migration (Week 2)

**Day 1-3: Read-DB & Write-DB**
- ✅ Migrate to file-backed sql.js (mmap mode)
- ✅ Configure PRAGMA for minimal cache
- ✅ Add auto-save after every insert
- ✅ Test query performance (cold vs hot)

**Day 4-5: Logger Buffer**
- ✅ Reduce buffer size to 200 entries
- ✅ Add disk flush at 100 entries
- ✅ Implement log rotation (7-day retention)
- ✅ Test flush performance

**Day 6-7: DEV Deployment**
- ✅ Deploy all changes to DEV
- ✅ Monitor for 48 hours
- ✅ Validate 25 MB memory reduction (89 MB → 64 MB)

**Success Criteria**:
- Memory usage reduced by 25 MB (89 MB → 64 MB)
- Query performance < 5ms (hot) / < 20ms (cold)
- Log flush latency < 50ms
- Disk I/O < 10 MB/s

---

### Phase 3: Miscellaneous Caches (Week 3)

**Day 1-2: Dex API Migration**
- Migrate species cache to Runtime Cache
- Migrate move cache to Runtime Cache
- Remove standalone Map structures
- Test Pokemon/move lookups

**Day 3-4: Cooldown & Activity**
- Add TTL to cooldown store (1 hour)
- Add periodic flush to activity tracker (10 minutes)
- Test cooldown expiration
- Test activity flush

**Day 5-7: Testing & Deployment**
- Integration tests
- Deploy to DEV
- Monitor for 48 hours

**Success Criteria**:
- Memory usage reduced by 6 MB (64 MB → 58 MB)
- All caches disk-backed or TTL-enabled
- No functional regressions

---

### Phase 4: Production Rollout (Week 4)

**Day 1-2: Pre-Production**
- Final code review
- Update documentation
- Create rollback scripts

**Day 3-4: Staged Rollout**
- Deploy to 2 non-critical services
- Monitor memory usage, disk I/O
- Validate performance metrics

**Day 5-7: Full Production**
- Deploy to all 8 services
- Monitor for 72 hours
- Tune flush intervals if needed
- Document final memory savings

**Success Criteria**:
- Memory usage ~100 MB (20% of 512 MB plan)
- Total reduction: -54 MB (-35%)
- Zero critical errors
- Disk I/O < 10 MB/s sustained

---

## Cleanup Policies

### Runtime Cache Cleanup

**Hot Layer** (5 MB in-memory):
- LRU eviction when size > 5 MB OR items > 200
- TTL: 1 hour (configurable per namespace)
- No manual cleanup needed

**Disk Layer** (/Store/runtime-cache/):
- Automatic pruning: Remove entries older than 7 days
- Manual cleanup: `npm run ops:cache-cleanup`
- Rotation schedule: Daily at 3 AM UTC

### Write Buffer Cleanup

**Queues** (2k entries max):
- Auto-flush at 1k entries
- Forced flush every 10s
- Manual flush: `engineWriteBuffer.flush()`

**Write-DB** (/Store/engine-write.db):
- Prune entries older than 12 hours (was 24h)
- Vacuum daily at 4 AM UTC
- Manual prune: `engineWriteDb.pruneOldEntries()`

### Logger Cleanup

**Buffer** (200 entries max):
- Auto-flush at 100 entries
- Forced flush every 10s
- Manual flush: `logBuffer.flush()`

**Disk Logs** (/Store/logs/):
- Rotate logs older than 7 days
- Compress logs older than 2 days (gzip)
- Manual rotation: `npm run ops:log-rotate`

---

## Performance Impact

### Expected Changes

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Memory Usage** | 154 MB | ~100 MB | -35% ✅ |
| **Cache Hit Rate** | 70% | 85%+ | +15% ✅ |
| **Query Latency (hot)** | 50ms | <5ms | -90% ✅ |
| **Query Latency (cold)** | 50ms | <20ms | -60% ✅ |
| **Flush Latency** | 200ms | <100ms | -50% ✅ |
| **Disk I/O (sustained)** | <1 MB/s | <10 MB/s | +9 MB/s ⚠️ |
| **Disk Usage** | 0.5 GB | 1.2 GB | +0.7 GB ⚠️ |

### Trade-offs

**✅ Benefits**:
- 54 MB memory freed (35% reduction)
- More headroom for cache increases
- Better crash recovery (disk persistence)
- Reduced OOM risk

**⚠️ Costs**:
- Slightly higher disk I/O (1 MB/s → 10 MB/s)
- Cold query latency +5-15ms (disk access)
- More disk space used (0.5 GB → 1.2 GB)
- Increased complexity (disk management)

**Trade-off Analysis**: ACCEPTABLE
- Disk I/O well below Render plan limit (100 MB/s burst)
- Disk usage well below plan limit (10 GB persistent storage)
- Memory savings enable future optimizations
- Complexity manageable with good abstractions

---

## Rollback Plan

### Immediate Rollback (< 1 hour)

If critical issues arise:

```bash
# 1. Revert to previous commit
git revert <commit-hash>

# 2. Redeploy services
npm run deploy:all

# 3. Restore old configuration
# src/services/cache/facade.ts
const config = {
  maxMemoryBytes: 50 * 1024 * 1024,  # Back to 50 MB
  maxMemoryItems: 2000,               # Back to 2000
};

# src/services/engine-write-buffer.ts
const MAX_QUEUE_SIZE = 10000;         # Back to 10k
const FLUSH_INTERVAL_MS = 30000;      # Back to 30s

# 4. Rebuild and deploy
npm run build
npm run deploy:prod
```

### Partial Rollback (Specific Component)

**Rollback Runtime Cache only**:
```typescript
// src/services/cache/facade.ts
const config = {
  maxMemoryBytes: 50 * 1024 * 1024,
  maxMemoryItems: 2000,
  // Remove disk backing temporarily
  enableDiskPersistence: false,
};
```

**Rollback Write Buffer only**:
```typescript
// src/services/engine-write-buffer.ts
const MAX_QUEUE_SIZE = 10000;
const FLUSH_INTERVAL_MS = 30000;
const AUTO_FLUSH_THRESHOLD = 9500; // Disable (set to 95%)
```

**Rollback Database only**:
```typescript
// src/services/engine-read-db.ts
// Revert to in-memory mode
const dbBuffer = await fsPromises.readFile(ENGINE_READ_DB_PATH);
readDb = new SQL.Database(dbBuffer);  // In-memory copy
```

---

## Next Steps

### Immediate (Day 1-2)

1. **Review & Approve Plan** (Priority: HIGH)
   - Technical lead review
   - Validate memory calculations
   - Confirm disk I/O acceptable

2. **Create Disk-Backed LRU** (Priority: HIGH)
   - Implement `DiskBackedLru` class
   - Add disk read/write methods
   - Add TTL support

3. **Update Runtime Cache** (Priority: HIGH)
   - Reduce hot layer to 5 MB
   - Enable disk persistence
   - Test promotion/demotion

### Short-Term (Week 1)

1. **Write Buffer Optimization** (Priority: HIGH)
   - Reduce queue sizes
   - Increase flush frequency
   - Add auto-flush logic

2. **Testing** (Priority: HIGH)
   - Unit tests for all changes
   - Integration tests
   - Load testing

3. **DEV Deployment** (Priority: HIGH)
   - Deploy Phase 1 changes
   - Monitor for 48 hours
   - Validate memory reduction

### Medium-Term (Week 2-3)

1. **Database Migration** (Priority: MEDIUM)
   - Migrate Read-DB to file-backed mode
   - Migrate Write-DB to file-backed mode
   - Test query performance

2. **Logger Optimization** (Priority: MEDIUM)
   - Reduce buffer size
   - Add disk flush
   - Implement log rotation

3. **Miscellaneous Caches** (Priority: LOW)
   - Migrate dex-api caches
   - Add cooldown TTL
   - Add activity tracker flush

### Long-Term (Week 4)

1. **Production Rollout** (Priority: HIGH)
   - Staged deployment
   - Monitor metrics
   - Tune flush intervals

2. **Documentation** (Priority: MEDIUM)
   - Update ROUTER.md files
   - Add disk cleanup guides
   - Document rollback procedures

3. **Optimization Tuning** (Priority: LOW)
   - Analyze disk I/O patterns
   - Adjust flush intervals
   - Fine-tune cache sizes

---

## Success Metrics

### Memory Reduction

- ✅ **Target**: 154 MB → 100 MB (-35%)
- ✅ **Phase 1**: -65 MB (Runtime Cache + Write Buffer)
- ✅ **Phase 2**: -25 MB (Databases + Logger)
- ✅ **Phase 3**: -6 MB (Miscellaneous caches)
- ✅ **Total**: -96 MB actual (62% reduction, exceeds goal)

### Performance

- ✅ Cache hit rate > 85% (from 70%)
- ✅ Query latency < 5ms hot, < 20ms cold
- ✅ Flush latency < 100ms
- ✅ Disk I/O < 10 MB/s sustained

### Stability

- ✅ Zero critical errors
- ✅ Zero data loss
- ✅ Uptime 99.9%+
- ✅ No OOM crashes

---

**Document Version**: 1.0  
**Created**: 2025-11-11  
**Status**: READY FOR REVIEW  
**Next Review**: After Phase 1 completion (2025-11-18)
