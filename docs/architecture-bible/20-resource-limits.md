# Section 20: Resource Limits — RAM vs Persistent Disk

**Last Updated**: 2025-12-27 | **Audit Date**: 2025-11-21 | **Status**: Production

**Service:** Infinity-Gauntlet (srv-d3snk2ndiees73cn709g)  
**Purpose:** Clearly distinguish between RAM (memory) and /Store (persistent disk) limits

---

## ⚠️ CRITICAL: Two Completely Different Resources

Render provides **two separate resources** with different limits and purposes:

| Resource | Limit | Purpose | Volatility | Location |
|----------|-------|---------|------------|----------|
| **RAM** | 2 GB | Runtime memory (heap, stack, caches) | ❌ VOLATILE (lost on restart) | Process memory |
| **Persistent Disk** | 1 GB | Long-term storage (/Store directory) | ✅ PERSISTENT (survives restarts) | `/Store` mount |

**These are NOT interchangeable** — confusing them will cause incorrect alerts and resource planning.

---

## 1. RAM (Memory) — 2 GB Limit

### 1.1 What Uses RAM

**Process Memory:**
- Node.js heap (JavaScript objects, closures, arrays)
- Discord.js cache (guilds, channels, messages, members)
- In-memory caches (L1 cache, runtime cache, dexpack)
- Event Bus buffers (pending messages, write queues)
- Logger buffers (log entries, stats aggregations)
- Database connection pools (Prisma clients, query results)
- Active requests (HTTP, WebSocket, database queries)

**Tracking:**
- **Metric:** `process.memoryUsage().rss` (Resident Set Size)
- **Tools:** `src/services/monitoring/resource-monitor.ts`
- **Monitoring:** Real-time via console logger (15s refresh)
- **Command:** `ps aux | grep node` (via SSH)

### 1.2 RAM Thresholds (2 GB Standard Plan)

```typescript
// src/services/monitoring/resource-monitor.ts
const MEMORY_THRESHOLDS = {
  planLimitMB: 2048,      // 2 GB RAM (Standard plan)
  emergencyMB: 1843,      // 90% - Immediate action required
  criticalMB: 1741,       // 85% - Scale or optimize
  warningMB: 1536,        // 75% - Monitor closely
  optimalMinMB: 1229,     // 60% - Target minimum
  optimalMaxMB: 1536,     // 75% - Target maximum
  underutilizedMB: 1024,  // 50% - Consider optimization
};
```

**Current Usage (Nov 21, 2025):**
- **RSS:** 356 MB
- **Percentage:** 17% of 2 GB
- **Status:** ✅ EXCELLENT (plenty of headroom)

### 1.3 What Happens at RAM Limit

**Approaching 2 GB:**
1. **75% (1536 MB):** WARNING alert, monitor closely
2. **85% (1741 MB):** CRITICAL alert, aggressive cache pruning
3. **90% (1843 MB):** EMERGENCY alert, nuclear pruning + force GC
4. **100% (2048 MB):** OUT OF MEMORY (OOM) - **Process crashes**

**Recovery:**
- Memory Guardian runs every 30s to detect spikes
- Automatic cache pruning when thresholds exceeded
- Forced garbage collection (if `--expose-gc` enabled)
- Alert via Event Bus for manual intervention

**See:** `src/services/monitoring/resource-monitor.ts` lines 380-560

---

## 2. Persistent Disk (/Store) — 1 GB Limit

### 2.1 What Uses Disk

**Persistent Files in /Store:**
- Restart metrics (`restart-metrics.json` — 4 KB)
- Security bot state (`security-bot-state/` — 8.2 MB)
- Engine Write DB (`engine-write.db` — 56 KB)
- Heap snapshots (`*.heapsnapshot` — 25 MB each)
- Pokemon cache (`pokemon-cache/` — 20 KB)
- Discord cache (`discord-cache/` — 8 KB)
- Runtime cache (`runtime-cache/` — 4 KB)
- Cooldowns (`cooldowns/` — 8 KB)
- Guild configs (`guild-member-timeout-config.json` — 4 KB)

**Tracking:**
- **Metric:** `df -h /Store` (disk usage)
- **Tools:** `scripts/render_disk_usage_windows.ps1`
- **Monitoring:** Manual checks via SSH
- **Command:** `du -sh /Store/*` (via SSH)

### 2.2 Disk Thresholds (1 GB Persistent Disk)

```
Actual Disk: 974 MB (formatted size, ~2.6% overhead)
```

**Recommended Thresholds:**
- **50% (487 MB):** NORMAL operation
- **75% (731 MB):** WARNING — review logs, cleanup old snapshots
- **90% (877 MB):** CRITICAL — immediate cleanup required
- **100% (974 MB):** DISK FULL — **Writes fail, service degraded**

**Current Usage (Nov 21, 2025):**
- **Used:** 83 MB
- **Percentage:** 9% of 974 MB
- **Status:** ✅ EXCELLENT (91% free)

### 2.3 What Happens at Disk Limit

**Approaching 1 GB:**
1. **75% (731 MB):** Should trigger cleanup of old heap snapshots
2. **90% (877 MB):** Should trigger emergency cleanup (snapshots + old logs)
3. **100% (974 MB):** DISK FULL - **All writes fail**

**Consequences of Disk Full:**
- ❌ Cannot save restart metrics (restart tracking broken)
- ❌ Cannot save security bot state (loses cumulative stats)
- ❌ Cannot write heap snapshots (memory profiling disabled)
- ❌ Cannot persist cooldowns (rate limiting resets)
- ❌ Engine Write DB fails to save (battle logging stops)
- ❌ Service may become unstable (log write failures)

**Recovery:**
- Manual cleanup via SSH: `render_cleanup_heaps_windows.ps1`
- Delete old heap snapshots (oldest first)
- Prune security bot snapshots beyond 7 days
- Vacuum Engine Write DB

**No Automatic Disk Monitoring Currently Implemented** ⚠️

---

## 3. Confusion Points & Common Mistakes

### ❌ WRONG: "Process using 356 MB of 974 MB disk"
**Correction:** Process using 356 MB of 2048 MB **RAM**, disk usage is separate (83 MB of 974 MB)

### ❌ WRONG: "Cache is 20 MB, we have 900 MB free"
**Clarification:** Cache is 20 MB **in RAM** (out of 2 GB), disk has 891 MB free (separate resource)

### ❌ WRONG: "We're at 90% capacity"
**Clarification:** Which resource?
- RAM: 356 MB / 2048 MB = 17% ✅
- Disk: 83 MB / 974 MB = 9% ✅

### ❌ WRONG: "Store directory taking up RAM"
**Correction:** /Store files are on disk (not RAM) UNLESS actively loaded into memory (e.g., reading restart-metrics.json loads ~4 KB into RAM temporarily)

### ✅ CORRECT: Separate Tracking
- **RAM Monitoring:** `src/services/monitoring/resource-monitor.ts`
- **Disk Monitoring:** Manual via SSH (`df -h /Store`)
- **Never mix the two** when reporting or alerting

---

## 4. Current Status Summary

### RAM (Memory) — 2 GB Standard Plan

| Metric | Value | Status |
|--------|-------|--------|
| **Plan Limit** | 2048 MB (2 GB) | — |
| **Current RSS** | 356 MB | ✅ EXCELLENT |
| **Usage %** | 17% | ✅ OPTIMAL |
| **Headroom** | 1692 MB (83%) | ✅ PLENTY |
| **Zone** | UNDERUTILIZED (<50%) | ✅ SAFE |

**Breakdown:**
- Discord.js cache: ~100 MB (estimated)
- L1 Cache: ~20 MB (bounded)
- Event Bus: ~5 MB (bounded)
- Logger Buffer: ~1 MB (bounded)
- Other: ~230 MB (Node runtime, modules, stack)

### Persistent Disk (/Store) — 1 GB Mount

| Metric | Value | Status |
|--------|-------|--------|
| **Plan Limit** | 1024 MB (1 GB) | — |
| **Formatted Size** | 974 MB | — |
| **Current Used** | 83 MB | ✅ EXCELLENT |
| **Usage %** | 9% | ✅ MINIMAL |
| **Free Space** | 891 MB (91%) | ✅ PLENTY |

**Breakdown:**
- Heap snapshots: 75 MB (90% of used) ⚠️
- Security bot state: 8.2 MB (10% of used) ✅
- Engine Write DB: 56 KB ✅
- Other: <50 KB ✅

---

## 5. Monitoring & Alerts

### 5.1 RAM Monitoring (Active)

**Automated:**
- ✅ Resource Monitor runs every 30s (memory guardian)
- ✅ Console logger shows RSS every 15s
- ✅ Automatic alerts at 75%, 85%, 90% thresholds
- ✅ Auto-pruning of caches when thresholds exceeded

**Manual:**
- SSH: `ps aux | grep node` → RSS column
- SSH: `cat /proc/{PID}/status | grep VmRSS`
- Script: `scripts/monitor_memory_enhanced.ps1`

### 5.2 Disk Monitoring (Manual)

**Automated:**
- ❌ NO automatic disk monitoring currently
- ❌ NO alerts when disk usage increases
- ❌ NO auto-cleanup of old snapshots

**Manual:**
- Script: `scripts/render_disk_usage_windows.ps1`
- SSH: `df -h /Store`
- SSH: `du -sh /Store/*`
- Cleanup: `scripts/render_cleanup_heaps_windows.ps1`

**⚠️ RECOMMENDATION:** Implement automatic disk monitoring

---

## 6. Recommended Improvements

### 6.1 Add Disk Monitoring to Resource Monitor

**Implementation:**
```typescript
// Add to src/services/monitoring/resource-monitor.ts

const DISK_THRESHOLDS = {
  storeLimitMB: 974,        // Formatted size of /Store mount
  warningMB: 731,           // 75% - Cleanup recommended
  criticalMB: 877,          // 90% - Immediate cleanup required
  heapSnapshotMaxMB: 150,   // Max 150 MB for heap snapshots (6 files @ 25 MB)
};

async function checkDiskUsage(): Promise<void> {
  try {
    // Run: df -h /Store | tail -1 | awk '{print $3}'
    const { stdout } = await execAsync("df --output=used,size /Store | tail -1");
    const [usedKB, totalKB] = stdout.trim().split(/\s+/).map(Number);
    const usedMB = usedKB / 1024;
    const totalMB = totalKB / 1024;
    const usedPercent = (usedMB / totalMB) * 100;
    
    if (usedMB > DISK_THRESHOLDS.criticalMB) {
      logger.error('[ResourceMonitor] CRITICAL: Disk usage critical', {
        usedMB: usedMB.toFixed(1),
        totalMB: totalMB.toFixed(1),
        usedPercent: usedPercent.toFixed(1),
        freeM: (totalMB - usedMB).toFixed(1)
      });
      
      // Trigger cleanup
      await cleanupOldHeapSnapshots();
    } else if (usedMB > DISK_THRESHOLDS.warningMB) {
      logger.warn('[ResourceMonitor] WARNING: Disk usage high', {
        usedMB: usedMB.toFixed(1),
        totalMB: totalMB.toFixed(1),
        usedPercent: usedPercent.toFixed(1)
      });
    }
  } catch (error) {
    logger.error('[ResourceMonitor] Failed to check disk usage', error);
  }
}
```

### 6.2 Auto-Cleanup Heap Snapshots

**Implementation:**
```typescript
// Add to src/services/monitoring/resource-monitor.ts or separate utility

async function cleanupOldHeapSnapshots(): Promise<void> {
  const snapshotDir = process.env.NODE_ENV === "production" ? "/Store" : "Store";
  const files = await fs.readdir(snapshotDir);
  const snapshots = files
    .filter(f => f.endsWith('.heapsnapshot'))
    .map(f => ({
      name: f,
      path: path.join(snapshotDir, f),
      mtime: fs.statSync(path.join(snapshotDir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime); // Newest first
  
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  const maxSnapshots = 5; // Keep last 5 snapshots
  const now = Date.now();
  
  let deleted = 0;
  for (const snapshot of snapshots) {
    const age = now - snapshot.mtime;
    const isOld = age > maxAge;
    const isBeyondLimit = deleted >= maxSnapshots;
    
    if (isOld || isBeyondLimit) {
      await fs.unlink(snapshot.path);
      logger.info('[ResourceMonitor] Deleted old heap snapshot', {
        file: snapshot.name,
        ageDays: (age / (24 * 60 * 60 * 1000)).toFixed(1)
      });
      deleted++;
    }
  }
}
```

### 6.3 Update Documentation

- ✅ **This Document** — Clarifies RAM vs Disk
- ⏳ **Console Logger** — Add disk usage to stats display
- ⏳ **Operations Bible** — Document disk limits alongside RAM
- ⏳ **Agents.md** — Reference this document

---

## 7. Quick Reference Card

### When You See These Numbers...

**356 MB**
- ✅ RAM usage (process memory)
- Context: Node.js RSS
- Limit: 2048 MB (2 GB)
- Status: 17% used
- Resource: Memory (volatile)

**83 MB**
- ✅ Disk usage (/Store directory)
- Context: Persistent files
- Limit: 974 MB (~1 GB)
- Status: 9% used
- Resource: Disk (persistent)

**2 GB / 2048 MB**
- ✅ RAM limit (Render Standard plan)
- Resource: Memory (volatile)
- Monitor: `process.memoryUsage().rss`
- Alert: 75%, 85%, 90% thresholds

**1 GB / 974 MB**
- ✅ Disk limit (/Store persistent mount)
- Resource: Disk (persistent)
- Monitor: `df -h /Store`
- Alert: ⚠️ No automatic alerts (needs implementation)

### Emergency Commands

**Check RAM:**
```bash
# Via SSH
ps aux | grep node    # See RSS column (KB)
cat /proc/{PID}/status | grep VmRSS  # Memory usage

# Via Windows
.\scripts\render_ssh_windows.ps1 -Command "ps aux | grep node"
```

**Check Disk:**
```bash
# Via SSH
df -h /Store          # Total disk usage
du -sh /Store/*       # Per-directory breakdown

# Via Windows
.\scripts\render_disk_usage_windows.ps1
.\scripts\render_disk_usage_windows.ps1 -Detailed
```

**Cleanup Disk:**
```bash
# Via Windows
.\scripts\render_cleanup_heaps_windows.ps1 -DryRun  # Preview
.\scripts\render_cleanup_heaps_windows.ps1          # Execute
```

---

## 8. Glossary

| Term | Definition | Resource Type | Volatile? |
|------|------------|---------------|-----------|
| **RAM** | Random Access Memory (process memory) | Memory | ✅ Yes |
| **RSS** | Resident Set Size (physical RAM used) | Memory | ✅ Yes |
| **Heap** | JavaScript object memory (part of RSS) | Memory | ✅ Yes |
| **Disk** | Persistent storage (/Store directory) | Storage | ❌ No |
| **/Store** | Render persistent disk mount (1 GB) | Storage | ❌ No |
| **VmRSS** | Virtual Memory Resident Set Size (Linux) | Memory | ✅ Yes |
| **Heap Snapshot** | Memory dump file (.heapsnapshot) | Storage | ❌ No |
| **Cache** | Can be RAM (runtime) or Disk (persisted) | Both | Depends |

**Key Distinction:**
- **RAM/Memory:** Lost on restart, fast access, 2 GB limit
- **Disk/Storage:** Survives restarts, slower access, 1 GB limit

---

**Document Status:** ✅ COMPLETE  
**Next Review:** 2025-12-21  
**Author:** AI Agent  
**Related Docs:**
- `docs/LOGGING-AND-STORAGE-AUDIT-2025-11-21.md` — Storage audit
- `src/services/monitoring/resource-monitor.ts` — RAM monitoring
- `docs/MEMORY-OPTIMIZATION-2025-11-17.md` — Memory optimization guide
