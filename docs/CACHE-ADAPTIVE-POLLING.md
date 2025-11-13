# Engine Cache Adaptive Polling & Change Detection

**Status:** ✅ Implemented (2025-11-13)  
**Commit:** 9435c83  
**Purpose:** Prevent unlimited refresh operations when Pokemon data is stable

## Problem Solved

The Engine Cache was refreshing every hour **unconditionally**, even though:
- Pokemon data is mostly static (rarely changes in production)
- Each refresh consumes CPU/memory for identical data copying
- Current implementation is a no-op (just copies existing data)
- Wasted resources on redundant operations

## Solution: Adaptive Polling with Change Detection

### **Change Detection**
- **Checksum comparison** before/after refresh
- Detects if data actually changed during refresh
- Tracks consecutive refreshes with no changes
- Logs change events with checksums for debugging

### **Adaptive Polling Strategy**
1. **Base interval:** 1 hour (initial polling frequency)
2. **Stable data detection:** After 3 consecutive no-change refreshes
3. **Interval doubling:** When stable, double the interval (1h → 2h → 4h)
4. **Maximum interval:** 4 hours (prevents excessive delays)
5. **Reset trigger:** Any data change resets to base 1-hour interval

### **Polling Behavior Examples**

**Scenario 1: Static Data (typical)**
```
Refresh 1:  No change detected → 1 hour interval
Refresh 2:  No change detected → 1 hour interval  
Refresh 3:  No change detected → 1 hour interval
Refresh 4:  No change detected → 2 hour interval (doubled)
Refresh 5:  No change detected → 2 hour interval
Refresh 6:  No change detected → 2 hour interval
Refresh 7:  No change detected → 4 hour interval (doubled, max)
Refresh 8+: No change detected → 4 hour interval (max, stays here)
```

**Scenario 2: Data Update Detected**
```
Refresh 1-7: No changes → 4 hour interval (max)
Refresh 8:   CHANGE DETECTED → Reset to 1 hour interval
Refresh 9:   No change → 1 hour interval
Refresh 10:  No change → 1 hour interval
Refresh 11:  No change → 2 hour interval (doubling restarts)
```

## Implementation Details

### **New Class Properties**
```typescript
// Smart refresh tracking
private consecutiveNoChangeRefreshes: number = 0;  // Stability counter
private currentRefreshIntervalMs: number;          // Dynamic interval
private lastDataChangeTime: Date | null = null;    // Last change timestamp
private totalRefreshes: number = 0;                // Total refresh count
private totalDataChanges: number = 0;              // Total change count
```

### **New Methods**

**`calculateChecksum(maps): string | null`**
- Calculates checksum for any set of Maps (not just instance Maps)
- Used for pre-swap comparison during refresh
- Returns hex string (simple hash, not cryptographic)
- Enables change detection without modifying live cache

**`adjustRefreshInterval(): void`**
- Called after each refresh to evaluate data stability
- Doubles interval when consecutiveNoChangeRefreshes >= 3
- Resets to base interval when changes detected
- Restarts timer with new interval (clearInterval + startRefreshWorker)
- Logs interval changes for observability

**`refresh(): Promise<void>` (Enhanced)**
- Captures checksum **before** refresh (`previousChecksum`)
- Builds new cache Maps (existing logic)
- Calculates checksum **before** swap (`tempChecksum`)
- Compares checksums to detect changes
- Updates metrics: `consecutiveNoChangeRefreshes`, `totalDataChanges`
- Logs detailed change detection results
- Calls `adjustRefreshInterval()` after completion

### **Extended CacheStats Interface**
```typescript
export interface CacheStats {
  // ... existing metrics ...
  
  // Adaptive polling metrics (new)
  totalRefreshes: number;                // Total refresh operations
  totalDataChanges: number;              // Times data actually changed
  consecutiveNoChangeRefreshes: number;  // Current stability streak
  currentRefreshIntervalMs: number;      // Current polling interval
  lastDataChangeTime: Date | null;       // Last detected change
}
```

### **Logging Examples**

**No Change Detected:**
```javascript
log('info', 'engine-cache: NO DATA CHANGE detected during refresh', {
  checksum: '3f2a1b9c',
  consecutiveNoChanges: 4,
  totalRefreshes: 10,
});
```

**Change Detected:**
```javascript
log('info', 'engine-cache: Data CHANGED detected during refresh', {
  previousChecksum: '3f2a1b9c',
  newChecksum: '8d4e2f1a',
  totalChanges: 2,
});
```

**Interval Adjustment:**
```javascript
log('info', 'engine-cache: Data stable, reducing refresh frequency (adaptive polling)', {
  from: '60min',
  to: '120min',
  consecutiveNoChanges: 3,
  reason: 'Static dataset - Pokemon data rarely changes',
});
```

## Benefits

### **Performance**
- **Reduced CPU usage:** Fewer refresh operations during stable periods
- **Lower memory overhead:** Less frequent cache swaps and GC pressure
- **Efficient polling:** Adapts to actual data volatility

### **Resource Optimization**
- **Smart scheduling:** Adjusts automatically without manual tuning
- **No wasted cycles:** Only refreshes frequently when data changes
- **Scalable:** Works efficiently with static or dynamic data sources

### **Observability**
- **Detailed metrics:** Track refresh frequency, change rate, stability
- **Change detection logs:** Know exactly when data updates occur
- **Adaptive behavior:** See polling adjustments in real-time

## Current Status (Temporary No-Op Refresh)

**Note:** The refresh implementation currently just **copies existing data** (no-op):
```typescript
// TEMPORARY: Copy current data (no-op refresh)
this.pokemon.forEach((value, key) => newPokemon.set(key, value));
```

**Why This Still Works:**
- Change detection verifies checksums match (no changes detected)
- Adaptive polling reduces frequency (recognizes static data)
- System practices smart polling behavior **before** Read-DB sync implemented

**When Read-DB Sync Implemented:**
- Replace no-op with actual Read-DB queries
- Change detection will identify real Pokemon data updates from PROD
- Adaptive polling will optimize refresh frequency based on actual volatility

## Configuration

**Base Interval (engine-db-config.ts):**
```typescript
export const L1_CACHE_REFRESH_INTERVAL_MS = IS_TEST
  ? 10 * 1000      // 10 seconds (test)
  : 60 * 60 * 1000; // 1 hour (production)
```

**Maximum Interval (hard-coded in adjustRefreshInterval):**
```typescript
const maxIntervalMs = 4 * 60 * 60 * 1000; // 4 hours max
```

**Stability Threshold (hard-coded in adjustRefreshInterval):**
```typescript
if (this.consecutiveNoChangeRefreshes >= 3) {
  // Double interval after 3 consecutive no-change refreshes
}
```

## Future Enhancements

**Possible Improvements:**
1. **Configurable thresholds:** Move stability threshold (3 refreshes) to config
2. **Maximum interval config:** Make 4-hour max configurable
3. **Exponential backoff tuning:** Adjust doubling strategy (e.g., 1.5x instead of 2x)
4. **Time-based triggers:** Reset to base interval after X hours regardless of changes
5. **Manual refresh API:** Force immediate refresh via admin command

**Monitoring Opportunities:**
- Dashboard showing current polling interval
- Alerts when refresh interval hits maximum (indicates very stable data)
- Metrics on data change frequency over time
- Comparison of refresh counts before/after adaptive polling

## Testing

**Unit Tests (Recommended):**
```typescript
describe('Engine Cache Adaptive Polling', () => {
  it('should double interval after 3 no-change refreshes', async () => {
    // Arrange: Initialize cache
    // Act: Trigger 3 refreshes with no data changes
    // Assert: interval doubled from 1h to 2h
  });
  
  it('should reset interval when data changes', async () => {
    // Arrange: Cache at max interval (4h)
    // Act: Trigger refresh with data change
    // Assert: interval reset to 1h
  });
  
  it('should cap interval at 4 hours maximum', async () => {
    // Arrange: Trigger many refreshes with no changes
    // Assert: interval never exceeds 4h
  });
});
```

**Manual Testing (Production):**
1. Deploy to Render with adaptive polling enabled
2. Monitor logs for "NO DATA CHANGE detected" messages
3. Verify interval doubling after 3 consecutive no-changes
4. Simulate data change (when Read-DB sync implemented)
5. Verify interval resets to 1 hour

## Related Documentation

- **Engine Cache Implementation:** `src/services/engine-cache.ts`
- **Engine DB Configuration:** `src/config/engine-db-config.ts`
- **Engine DB Architecture:** `docs/engine-db-replication.md`
- **Memory Guardian Integration:** `docs/MEMORY-PROTECTION-SYSTEM.md`

## Deployment

**Commit:** 9435c83  
**Date:** 2025-11-13  
**Status:** ✅ Deployed to production  
**Build:** 0 TypeScript errors  

**Verification:**
```bash
# Check current polling status
npm run ops:engine  # Shows adaptive polling metrics

# Watch logs for adaptive behavior
npm run render:logs -- Infinity-Gauntlet --tail
# Look for "adaptive polling" and "NO DATA CHANGE detected" messages
```

---

**Authored By:** AI Assistant  
**Review Status:** Ready for production  
**Next Steps:** Monitor adaptive polling behavior in production logs
