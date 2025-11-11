# Disk Resource Integration - Quick Reference

**TL;DR:** All disk access MUST go through ResourceManager. Import convenience wrappers and register your disk resources.

---

## Import

```typescript
import { 
  createManagedDiskCache,    // For Runtime Cache, Read-DB, Write-DB
  createManagedDiskBuffer,   // For Write Buffer, Logger Buffer
  createManagedDiskLog,      // For Application/Battle/Error/Audit logs
  resourceManager            // For manual registration/stats
} from '@/services/resource-manager';
```

---

## Quick Start: Disk Cache (Runtime Cache, Read-DB, Write-DB)

### Register Cache
```typescript
// Runtime Cache with 10 MB hot layer + 40 MB disk layer
const cacheHandle = createManagedDiskCache(
  'RuntimeCache',                  // Owner (component name)
  'pokemon-cache',                 // Resource name
  'runtime-cache',                 // Cache type
  '/Store/cache/pokemon.db',       // File path
  50 * 1024 * 1024,                // Total size (50 MB)
  async () => await cache.close(), // Cleanup callback
  {
    hotLayerBytes: 10 * 1024 * 1024,  // 10 MB in-memory
    diskBytes: 40 * 1024 * 1024,      // 40 MB on disk
  }
);
```

### Update Cache Stats
```typescript
// After cache access
resourceManager.updateDiskCacheStats(cacheHandle.id, {
  lastAccessTime: new Date()
});

// After eviction (hot → cold)
resourceManager.updateDiskCacheStats(cacheHandle.id, {
  sizeBytes: newTotalSize,
  hotLayerBytes: newHotSize,
  diskBytes: newDiskSize
});
```

### Cleanup Cache
```typescript
// Automatic cleanup on shutdown (via cleanup callback)
// Or manual cleanup:
await resourceManager.unregisterDiskCache(cacheHandle.id);
```

---

## Quick Start: Disk Buffer (Write Buffer, Logger Buffer)

### Register Buffer
```typescript
// Write Buffer with 1000-item queue, 5s flush interval
const bufferHandle = createManagedDiskBuffer(
  'EngineWriteBuffer',             // Owner
  'battle-writes',                 // Resource name
  'write-buffer',                  // Buffer type
  '/Store/engine/write-buffer.db', // File path
  1000,                            // Max queue size
  5000,                            // Flush interval (5s)
  async () => await buffer.forceFlush()  // Cleanup callback
);
```

### Update Buffer Stats
```typescript
// After enqueue/dequeue
resourceManager.updateDiskBufferStats(bufferHandle.id, {
  queueSize: buffer.currentQueueSize
});

// After flush
resourceManager.updateDiskBufferStats(bufferHandle.id, {
  queueSize: 0,
  lastFlushTime: new Date()
});
```

### Cleanup Buffer
```typescript
// Automatic cleanup on shutdown
// Or manual cleanup:
await resourceManager.unregisterDiskBuffer(bufferHandle.id);
```

---

## Quick Start: Disk Log (Application/Battle/Error/Audit)

### Register Log
```typescript
// Error Log with 30-day retention
const logHandle = createManagedDiskLog(
  'ErrorTracker',                  // Owner
  'error-log',                     // Resource name
  'error',                         // Log type
  '/Store/logs/error.log',         // File path
  30,                              // Retention days
  async () => await logger.close() // Cleanup callback
);
```

### Update Log Stats
```typescript
// After log write
resourceManager.updateDiskLogStats(logHandle.id, {
  sizeBytes: fs.statSync(logPath).size
});

// After log rotation
resourceManager.updateDiskLogStats(logHandle.id, {
  sizeBytes: 0,
  lastRotationTime: new Date()
});
```

### Cleanup Log
```typescript
// Automatic cleanup on shutdown
// Or manual cleanup:
await resourceManager.unregisterDiskLog(logHandle.id);
```

---

## Resource Types

| Type | Use Case | Key Metrics |
|------|----------|-------------|
| `disk-cache` | Runtime Cache, Read-DB, Write-DB | hot layer, cold layer, last access |
| `disk-buffer` | Write Buffer, Logger Buffer | queue size, flush interval |
| `disk-log` | App/Battle/Error/Audit logs | file size, retention, rotation |

---

## Statistics

### Get Disk Usage
```typescript
const stats = resourceManager.getStats();

console.log(`Total Disk: ${(stats.diskUsage.totalDiskBytes / (1024 * 1024)).toFixed(2)} MB`);
console.log(`  Caches: ${(stats.diskUsage.byType.cacheBytes / (1024 * 1024)).toFixed(2)} MB`);
console.log(`  Buffers: ${(stats.diskUsage.byType.bufferBytes / (1024 * 1024)).toFixed(2)} MB`);
console.log(`  Logs: ${(stats.diskUsage.byType.logBytes / (1024 * 1024)).toFixed(2)} MB`);
console.log(`Hot Layer: ${(stats.diskUsage.hotLayerBytes / (1024 * 1024)).toFixed(2)} MB (in-memory)`);
console.log(`Cold Layer: ${(stats.diskUsage.coldLayerBytes / (1024 * 1024)).toFixed(2)} MB (disk-only)`);
```

---

## Cleanup Patterns

### Cleanup Single Resource
```typescript
await resourceManager.unregisterDiskCache(cacheId);
await resourceManager.unregisterDiskBuffer(bufferId);
await resourceManager.unregisterDiskLog(logId);
```

### Cleanup All Disk Resources for Component
```typescript
await resourceManager.clearAllDiskResources('RuntimeCache');
```

### Cleanup All Disk Resources (Shutdown)
```typescript
await resourceManager.clearAllDiskResources();
```

---

## Migration Checklist

- [ ] Import convenience wrappers (`createManagedDiskCache/Buffer/Log`)
- [ ] Replace direct disk access with `createManaged*()` calls
- [ ] Add `updateDisk*Stats()` calls on resource state changes
- [ ] Verify cleanup callback is called on shutdown
- [ ] Test statistics tracking (`getStats().diskUsage`)

---

## Common Mistakes

❌ **DON'T:** Access disk directly without registering
```typescript
const cache = new DiskCache('/Store/cache/pokemon.db');  // No tracking!
```

✅ **DO:** Register with ResourceManager
```typescript
const handle = createManagedDiskCache('RuntimeCache', 'pokemon-cache', ...);
```

---

❌ **DON'T:** Forget to update statistics
```typescript
cache.evict(key);  // Hot → cold eviction, stats not updated!
```

✅ **DO:** Update stats on state changes
```typescript
cache.evict(key);
resourceManager.updateDiskCacheStats(handle.id, { hotLayerBytes: newHotSize });
```

---

❌ **DON'T:** Skip cleanup callback
```typescript
createManagedDiskCache('RuntimeCache', 'pokemon-cache', 'runtime-cache', path, size, null);  // No cleanup!
```

✅ **DO:** Provide cleanup callback
```typescript
createManagedDiskCache('RuntimeCache', 'pokemon-cache', 'runtime-cache', path, size, 
  async () => await cache.close()  // Cleanup on shutdown
);
```

---

## Debugging

### Check Resource Registration
```typescript
const stats = resourceManager.getStats();
console.log(`Registered disk caches: ${stats.byType['disk-cache']}`);
console.log(`Registered disk buffers: ${stats.byType['disk-buffer']}`);
console.log(`Registered disk logs: ${stats.byType['disk-log']}`);
```

### Find Resource by Owner
```typescript
const resources = resourceManager.getResourcesByOwner('RuntimeCache');
console.log(`RuntimeCache resources:`, resources);
```

### Verify Cleanup
```typescript
// Before cleanup
console.log('Before:', resourceManager.getStats().totalResources);

// Cleanup
await resourceManager.clearAllDiskResources('RuntimeCache');

// After cleanup
console.log('After:', resourceManager.getStats().totalResources);
```

---

## Next Steps

1. **Extend resource-request.ts:** Add disk resource quotas and validation
2. **Migrate components:** Update Runtime Cache, Read-DB, Write-DB, Write Buffer, Logger Buffer
3. **Monitor statistics:** Add disk usage alerts to resource-monitor.ts
4. **Test cleanup:** Verify cleanup callbacks execute on shutdown

---

## References

- Full documentation: `docs/deployment/DISK-RESOURCE-INTEGRATION.md`
- Implementation: `src/services/resource-manager.ts`
- Migration plan: `docs/deployment/MEMORY-TO-DISK-MIGRATION-PLAN.md`
