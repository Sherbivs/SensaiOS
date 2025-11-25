# Memory Profiling Guide — Infinity Gauntlet

**Last Updated:** 2025-11-18  
**Status:** Production Ready

---

## Overview

This guide covers memory profiling tools and workflows for diagnosing memory leaks and analyzing memory usage in the Infinity Gauntlet Discord bot.

## Quick Start

### 1. `/ops snapshot` Command (Production)

Capture a heap snapshot from the running production bot:

```
/ops snapshot [detailed:true]
```

**What it does:**
- Captures current process memory statistics (RSS, heap, external)
- Shows V8 heap breakdown and utilization
- Writes `.heapsnapshot` file to `/Store/` on Render
- Provides Chrome DevTools analysis instructions

**Options:**
- `detailed` (boolean): Include detailed heap space breakdown

**Output Example:**
```
📸 Memory Heap Snapshot
Timestamp: 2025-11-18T19:30:00.000Z

💾 Process Memory Usage
• RSS (Resident Set): 953.42 MB
• Heap Total: 180.50 MB
• Heap Used: 145.32 MB
• External: 25.10 MB
• Array Buffers: 15.70 KB

Accounted for: 205.60 MB
Mystery allocation: 747.82 MB (78.4% of RSS)

📊 V8 Heap Statistics
• Total Heap Size: 180.50 MB
• Heap Size Limit: 4.19 GB
• Used Heap Size: 145.32 MB
• Malloced Memory: 2.15 MB
• External Memory: 25.10 MB

📁 Heap Snapshot File
✅ Snapshot captured: 125.43 MB
📂 Location: heap-snapshot-2025-11-18T19-30-00-000Z.heapsnapshot

💡 Analysis Instructions:
1. Download snapshot file from Render dashboard
2. Open Chrome DevTools (F12) → Memory tab
3. Click 'Load' and select the .heapsnapshot file
4. Analyze memory allocations by constructor
```

### 2. Automated Startup Profiling

**Automatic on every production startup:**
- Captures post-startup memory statistics
- Logs comprehensive memory breakdown to logs
- Writes `startup-heap-<timestamp>.heapsnapshot` to `/Store/`

**Where to find:**
- Logs: Search for "🔬 Post-Startup Memory Analysis"
- Snapshot files: `/Store/startup-heap-*.heapsnapshot` on Render

**Example Log Output:**
```json
{
  "message": "🔬 Post-Startup Memory Analysis",
  "process": {
    "rss_mb": 450,
    "heap_total_mb": 180,
    "heap_used_mb": 145,
    "external_mb": 25,
    "array_buffers_mb": 0
  },
  "v8_heap": {
    "total_heap_mb": 180,
    "used_heap_mb": 145,
    "heap_limit_mb": 4288,
    "malloced_mb": 2,
    "external_mb": 25
  },
  "analysis": {
    "accounted_for_mb": 205,
    "mystery_allocation_mb": 245,
    "heap_utilization_percent": "80.6"
  }
}
```

### 3. Standalone Script (Local Development)

Run memory snapshot on local machine:

```powershell
node scripts/memory_snapshot.mjs
```

**Output:**
- Terminal: Detailed memory breakdown
- File: `Store/heap-snapshot-<timestamp>.heapsnapshot`

---

## Analyzing Heap Snapshots

### Step 1: Download Snapshot from Render

**Via Render Dashboard:**
1. Navigate to https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
2. Go to "Shell" tab
3. Run: `ls -lh /Store/*.heapsnapshot`
4. Download via file browser or:
   ```bash
   cat /Store/heap-snapshot-YYYY-MM-DDTHH-MM-SS-SSSZ.heapsnapshot > snapshot.txt
   ```

**Via Windows PowerShell Wrapper:**
```powershell
# List heap snapshots
.\scripts\render_ssh_windows.ps1 -Command "ls -lh /Store/*.heapsnapshot"

# Download specific snapshot
.\scripts\render_ssh_windows.ps1 -Command "cat /Store/heap-snapshot-YYYY-MM-DDTHH-MM-SS-SSSZ.heapsnapshot" > snapshot.heapsnapshot
```

**Via Direct WSL:**
```bash
# List heap snapshots
wsl ssh render-virginia 'ls -lh /Store/*.heapsnapshot'

# Download specific snapshot
wsl ssh render-virginia 'cat /Store/heap-snapshot-YYYY-MM-DDTHH-MM-SS-SSSZ.heapsnapshot' > snapshot.heapsnapshot
```

### Step 2: Load in Chrome DevTools

1. **Open Chrome DevTools:**
   - Press `F12` or `Ctrl+Shift+I`
   - Or right-click → "Inspect"

2. **Navigate to Memory Tab:**
   - Click "Memory" tab at top
   - Select "Load" button (bottom left)
   - Choose `.heapsnapshot` file

3. **View Options:**
   - **Summary:** Group objects by constructor (most useful)
   - **Comparison:** Compare two snapshots (before/after)
   - **Containment:** Show object ownership tree
   - **Statistics:** Pie chart of heap distribution

### Step 3: Identify Large Allocations

**Key Columns:**
- **Constructor:** Object type (e.g., `Array`, `String`, `(compiled code)`)
- **Distance:** Steps from GC root (lower = harder to collect)
- **Objects Count:** Number of instances
- **Shallow Size:** Memory used by object itself
- **Retained Size:** Memory kept alive by object + references

**Common Memory Hogs:**
- `(compiled code)` — V8 JIT compiled functions (~50-100 MB normal)
- `Array` — Check if any arrays are >10 MB (potential leak)
- `String` — Large string accumulation (logging, buffers)
- `Object` — Generic objects (check for Map/Set leaks)
- `system / Context` — V8 internal structures (~50 MB normal)

**Red Flags:**
- Arrays with >100k entries
- Strings consuming >50 MB
- Objects with distance >10 from GC root (retained unnecessarily)
- Duplicate large objects (cache not working)

### Step 4: Drill Down into Leaks

**Example: Investigating Large Array**

1. Click on `Array` constructor in Summary view
2. Sort by "Retained Size" (descending)
3. Click largest array → "Retainers" panel shows what's holding it
4. Trace back to source:
   ```
   Array (10 MB) ← Map entry ← deliveredOpsErrorIds ← global ← GC Root
   ```
5. This identifies `deliveredOpsErrorIds` Set as the leak source

**Example: Finding Closure Leaks**

1. Look for `(closure)` entries with large retained sizes
2. Click entry → "Retainers" panel
3. Check if closure is captured by event listener or timer
4. Verify cleanup handlers exist

---

## Common Memory Issues

### Issue 1: Unbounded Map/Set Growth

**Symptom:** Memory grows continuously over time  
**Root Cause:** Map or Set never removes old entries

**Fix Pattern:**
```javascript
const MAX_SIZE = 200;
const myMap = new Map();

function addEntry(key, value) {
  // LRU eviction
  if (myMap.size >= MAX_SIZE) {
    const entries = Array.from(myMap.keys());
    const toRemove = Math.ceil(MAX_SIZE * 0.2); // Remove oldest 20%
    entries.slice(0, toRemove).forEach(k => myMap.delete(k));
  }
  myMap.set(key, value);
}
```

**Example from codebase:**
- `deliveredOpsErrorIds` Set (src/bot/main.js:478-483)
- Fixed with 200-entry cap + 20% LRU eviction

### Issue 2: Event Listener Accumulation

**Symptom:** Memory grows with each event handler registration  
**Root Cause:** Listeners registered in loops or repeated calls

**Fix Pattern:**
```javascript
// ❌ BAD: Registers new listener every time
function setupHandler() {
  emitter.on('event', handler); // LEAK!
}

// ✅ GOOD: Register once at startup
emitter.on('event', handler);

// ✅ GOOD: Remove old listener first
function setupHandler() {
  emitter.off('event', handler);
  emitter.on('event', handler);
}
```

### Issue 3: Unclosed Timers/Intervals

**Symptom:** Memory never drops after operations complete  
**Root Cause:** setInterval/setTimeout not cleared

**Fix Pattern:**
```javascript
let intervalId;

function start() {
  intervalId = setInterval(work, 1000);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// CRITICAL: Clear on shutdown
process.on('SIGTERM', stop);
```

### Issue 4: Discord.js Cache Growth

**Symptom:** Memory grows with Discord activity  
**Root Cause:** Unbounded message/member caching

**Fix Pattern (already implemented):**
```javascript
const client = new Client({
  makeCache: (manager) => {
    if (manager.name === 'MessageManager') {
      return new LimitedCollection({ maxSize: 50 });
    }
    if (manager.name === 'GuildMemberManager') {
      return new LimitedCollection({ maxSize: 1000 });
    }
    return new Collection();
  },
  sweepers: {
    messages: {
      interval: 900,  // Every 15 minutes
      lifetime: 1800, // Keep 30 minutes
    },
    guildMembers: {
      interval: 900,
      filter: () => (member) => /* custom filter */
    },
  },
});
```

---

## Memory Budget Guidelines

### Expected Memory Usage (Render Standard Plan: 2 GB)

| Component | Expected | Acceptable Max | Critical Threshold |
|-----------|----------|----------------|-------------------|
| **Total RSS** | 400-600 MB | 1.2 GB | 1.8 GB |
| **V8 Heap** | 150-250 MB | 500 MB | 1 GB |
| **External Memory** | 20-50 MB | 100 MB | 200 MB |
| **Discord.js Cache** | 50-150 MB | 300 MB | 500 MB |
| **L1 Cache (Pokemon)** | 20 MB | 50 MB | 100 MB |
| **Write Buffers** | 5-10 MB | 50 MB | 100 MB |
| **Logger Buffers** | 7 MB | 20 MB | 50 MB |

### "Mystery Allocation" Explained

**What is it?**  
`Mystery Allocation = RSS - (Heap Total + External Memory)`

**Why it exists:**
- Node.js/V8 runtime overhead (~50-100 MB)
- C++ addon memory (not tracked by V8)
- OS memory management overhead
- Shared libraries (libuv, OpenSSL, etc.)
- Thread stacks and TLS buffers

**Normal Range:** 30-50% of RSS  
**Concerning:** >70% of RSS suggests hidden leak in native code

---

## Workflows

### Workflow 1: Investigating Memory Leak

**Scenario:** Memory grows from 450 MB → 1.2 GB over 12 hours

**Steps:**
1. Capture baseline snapshot: `/ops snapshot`
2. Wait 1-2 hours
3. Capture second snapshot: `/ops snapshot`
4. Download both snapshots
5. Load in Chrome DevTools → "Comparison" view
6. Sort by "Size Delta" to see what grew
7. Identify leaking constructor (e.g., `Array`, `Map`)
8. Trace back via "Retainers" to source code
9. Implement fix (add bounds, cleanup handlers)
10. Deploy and monitor with `/ops snapshot` every hour

### Workflow 2: Optimizing Startup Memory

**Scenario:** Bot uses 800 MB immediately after startup

**Steps:**
1. Check startup snapshot: `Store/startup-heap-*.heapsnapshot`
2. Load in Chrome DevTools
3. Sort by "Shallow Size" (descending)
4. Look for large allocations (>10 MB each)
5. Common culprits:
   - Large JSON files loaded into memory
   - Duplicate data structures
   - Pre-allocated buffers
6. Optimize:
   - Lazy-load data when needed
   - Stream large files instead of loading entire
   - Share data structures instead of cloning
7. Deploy and compare new startup snapshot

### Workflow 3: Production Memory Monitoring

**Daily Routine:**
1. Check Render dashboard memory graph
2. Look for gradual climb (leak) vs. stable plateau (healthy)
3. If climbing: Run `/ops snapshot` at start and end of day
4. Compare snapshots to identify growth source
5. If stable but high: Run `/ops snapshot` once to audit baseline

**Alerts to Set:**
- ⚠️ Warning: RSS > 1.2 GB
- 🚨 Critical: RSS > 1.6 GB
- 💀 Emergency: RSS > 1.9 GB (restart imminent)

---

## Tools Reference

### `/ops snapshot` Command

**Full Command:**
```
/ops snapshot detailed:true
```

**Access:** Admin-only (requires Administrator permission)

**Output:** Discord ephemeral message + heap snapshot file

**Limitations:**
- Snapshot generation takes 5-30 seconds (blocks bot)
- Snapshot files can be 50-200 MB (check disk space)
- Only captures single point in time (not timeline)

### `memory_snapshot.mjs` Script

**Usage:**
```bash
node scripts/memory_snapshot.mjs
```

**Output:**
- Terminal: Formatted memory breakdown
- File: `Store/heap-snapshot-<timestamp>.heapsnapshot`

**When to use:**
- Local development debugging
- CI/CD memory regression tests
- Automated monitoring scripts

### Automated Startup Profiling

**Trigger:** Automatic on every production startup

**Output:**
- Log entry: "🔬 Post-Startup Memory Analysis"
- Snapshot file: `/Store/startup-heap-<timestamp>.heapsnapshot`

**Retention:** Snapshots persist until manually deleted

**Purpose:**
- Establish baseline memory usage
- Detect regressions after deployments
- Historical comparison across releases

---

## Troubleshooting

### Problem: Snapshot file too large (>200 MB)

**Solution:**
1. High memory usage is the root cause
2. Analyze snapshot to find large allocations
3. Fix memory leaks before capturing more snapshots
4. Consider increasing Render disk quota

### Problem: Cannot download snapshot from Render

**Solution 1 (via Windows PowerShell):**
```powershell
# Compress first to reduce size
.\scripts\render_ssh_windows.ps1 -Command "gzip /Store/heap-snapshot-*.heapsnapshot"

# Download compressed file (smaller)
.\scripts\render_ssh_windows.ps1 -Command "cat /Store/heap-snapshot-*.heapsnapshot.gz" > snapshot.heapsnapshot.gz
```

**Solution 2 (via Direct WSL):**
```bash
# Compress first to reduce size
wsl ssh render-virginia 'gzip /Store/heap-snapshot-*.heapsnapshot'

# Download compressed file
wsl ssh render-virginia 'cat /Store/heap-snapshot-*.heapsnapshot.gz' > snapshot.heapsnapshot.gz

# Decompress locally
gunzip snapshot.heapsnapshot.gz
```

### Problem: Chrome DevTools crashes loading snapshot

**Cause:** Snapshot too large (>500 MB) or Chrome memory limit

**Solution:**
1. Close other Chrome tabs to free memory
2. Use Chromium with `--js-flags="--max-old-space-size=8192"` (8 GB heap)
3. Or analyze snapshot programmatically:
   ```javascript
   const v8Profiler = require('v8-profiler-next');
   const snapshot = v8Profiler.loadSnapshot('heap-snapshot.heapsnapshot');
   // Custom analysis code
   ```

### Problem: "Mystery allocation" is 90%+ of RSS

**Likely Causes:**
1. Native module memory leak (C++ addons)
2. Buffer allocations not tracked by V8
3. Shared libraries consuming memory

**Debug Steps:**
1. Check for large `Buffer` objects in snapshot
2. Review native module usage (sharp, sqlite3, etc.)
3. Monitor with `process.memoryUsage().external`
4. Consider updating native dependencies

---

## Best Practices

### 1. Regular Profiling

- ✅ Capture snapshot after every deployment
- ✅ Compare before/after for regressions
- ✅ Monitor daily during high-traffic periods
- ✅ Archive snapshots for historical analysis

### 2. Proactive Monitoring

- ✅ Set memory alerts at 60%, 80%, 95% of limit
- ✅ Log memory stats every 15 minutes
- ✅ Dashboard showing 24-hour memory trend
- ✅ Automated snapshots when RSS > threshold

### 3. Code Review Guidelines

- ✅ Review all Map/Set/Array declarations for bounds
- ✅ Verify event listeners have cleanup handlers
- ✅ Check timers/intervals clear on shutdown
- ✅ Audit large data structures (>1 MB)

### 4. Testing

- ✅ Load tests with memory profiling
- ✅ Soak tests (24+ hours) to catch slow leaks
- ✅ Memory regression tests in CI/CD
- ✅ Snapshot comparisons before/after PR merges

---

## Additional Resources

- **Chrome DevTools Memory Profiler:** https://developer.chrome.com/docs/devtools/memory-problems/
- **Node.js Memory Best Practices:** https://nodejs.org/en/docs/guides/simple-profiling/
- **V8 Heap Snapshots:** https://v8.dev/blog/heap-snapshot
- **Discord.js Cache Management:** https://discordjs.guide/popular-topics/cache.html
- **Repository Memory Audit Report:** `docs/MEMORY-AUDIT-COMPLETE-2025-11-18.md`

---

**Last Updated:** 2025-11-18  
**Maintainer:** GitHub Copilot  
**Status:** Production Ready
