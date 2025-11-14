# Memory Baseline Snapshot — November 14, 2025

**Purpose**: Document initial memory state after deploying Event Bus LRU eviction and enhanced /ops memory command.

**Deployment Details**:
- Restart Time: 21:42 UTC (November 14, 2025)
- Process PID: 63
- Uptime at Baseline: 16 minutes 49 seconds
- Render Service: srv-d3snk2ndiees73cn709g (Infinity-Gauntlet security bot)

## Memory Metrics

### Node Process (PID 63)
- **RSS (Resident Set Size)**: 157 MB (157,412 KB)
- **VSZ (Virtual Size)**: 32,254 MB (33,029,428 KB)
- **Growth from Initial**: +16 MB (141 MB at restart → 157 MB at +16:49)
- **Growth Rate**: ~0.95 MB/min (typical startup phase)

### Expected Plateau
- **Target RSS**: 400-450 MB by hour 24
- **Growth Pattern**: Rapid startup (20-40 MB/hr) → Stabilization (10-20 MB/hr) → Plateau (<5 MB/hr)
- **Alert Threshold**: 435 MB (85% of 512 MB limit)
- **Critical Threshold**: 486 MB (95% of 512 MB limit)

## Component Memory Budgets

### Event Bus Pattern Cache (NEW - LRU Eviction)
- **Status**: ✅ LRU eviction implemented (src/shared/event-bus.ts lines 97-170)
- **Limit**: 500 entries maximum
- **Memory Bound**: ~250 KB (500 patterns × ~500 bytes)
- **Eviction Strategy**: Delete oldest entry when cache reaches 500, insert new pattern
- **LRU Tracking**: Map delete+re-insert on cache hit moves pattern to end
- **Expected Size**: 20-50 patterns initially, <250 patterns steady-state

### Log Buffer
- **Limit**: 200 entries
- **Memory Bound**: ~400 KB (200 × ~2 KB per entry)
- **Behavior**: Flush on interval, backpressure at 180 entries

### Discord.js Cache Sweepers
- **Configuration**: Aggressive (15-min intervals, 30-min lifetimes)
- **Messages**: LimitedCollection(50) per channel
- **Members**: LimitedCollection(1000) per guild
- **Threads**: LimitedCollection(50)
- **Estimated Memory**: 50-100 MB steady-state

### Prisma Connection Pool
- **Connections**: ~10 (Render-managed pooling)
- **Memory**: ~20-30 MB
- **Behavior**: Stable, connection reuse

### IntelligentLogger Write Queue
- **Limit**: 10,000 entries
- **Memory**: ~20 MB (10k × ~2 KB)
- **Behavior**: Bounded backpressure

### Event Bus Event Queues
- **Per-subscriber Limit**: 1000 events
- **Subscribers**: ~10-15 active
- **Total Bound**: ~15,000 events × 200 bytes = 3 MB
- **Replay Buffer**: 100 events × 200 bytes = 20 KB

## Monitoring Plan

### Automated Checks (scripts/monitor_memory_24h.ps1)
- **Interval**: Every 30 minutes
- **Duration**: 24 hours (48 checks total)
- **Metrics**: RSS, VmRSS, Threads, File Descriptors, Growth Rate
- **Log**: Store/monitoring/memory-growth-2025-11-14.log

### Manual Validation Points
1. **Hour 1** (22:59 UTC): Verify startup spike complete, RSS ~180-200 MB
2. **Hour 6** (03:59 UTC): Verify active growth, RSS ~250-300 MB
3. **Hour 12** (09:59 UTC): Verify deceleration, RSS ~350-380 MB
4. **Hour 24** (21:59 UTC Nov 15): Verify plateau, RSS ~400-450 MB

### Discord Command Validation
- **Command**: `/ops memory` (requires Administrator permission, server channel only)
- **Expected Sections**:
  - **Log Buffer**: "Buffered entries: X/200 (~Y KB)"
  - **Event Bus**: "Subscribers: Z, Replay Buffer: N events, Pattern Cache: M/500 patterns (~K KB)"
  - **Discord.js Cache**: "Messages: A, Members: B, Threads: C (~D MB total)"
- **Baseline Pattern Cache**: 20-50 patterns initially

## Success Criteria

### 24-Hour Observation
- ✅ RSS plateaus at 400-450 MB (not exceeding 435 MB alert threshold)
- ✅ Growth rate decreases to <5 MB/hr by hour 24
- ✅ Pattern cache stays <250 entries (well below 500 limit)
- ✅ No FD leaks (file descriptors stable ~32-40)
- ✅ Thread count stable (~10-15 threads)

### /ops memory Command
- ✅ Log Buffer section displays correctly
- ✅ Event Bus section shows Pattern Cache utilization (X/500)
- ✅ Discord.js Cache section shows message/member/thread counts
- ✅ No errors or exceptions when retrieving metrics

### Pattern Cache LRU Eviction
- ✅ Cache never exceeds 500 entries
- ✅ LRU eviction logs appear when cache reaches 500
- ✅ Old patterns evicted successfully (no memory leak)
- ✅ Cache hit/miss pattern remains healthy

## Rollback Criteria

If any of these occur within 24 hours, consider rollback:
- ❌ RSS exceeds 486 MB (95% limit)
- ❌ OOM kill events
- ❌ Pattern cache grows unbounded (>600 entries)
- ❌ /ops memory command throws errors
- ❌ Service crashes or restarts unexpectedly

## Notes

- Previous baseline (pre-LRU implementation): 418 MB RSS after 14 hours runtime
- Pattern cache was previously unbounded Map<string, RegExp>
- New LRU implementation deployed at 21:42 UTC via render_deploy.ps1
- This baseline captures state 16 minutes post-restart (typical startup memory allocation)
- Next validation: 1-hour mark (22:59 UTC) to confirm startup spike complete

---

**Created**: 2025-11-14 21:59 UTC  
**Process**: PID 63, RSS 157 MB, Uptime 16:49  
**Next Check**: 2025-11-14 22:59 UTC (1-hour mark)
