# Seamless Restart Optimization Plan

**Goal:** Make service restarts feel like "nothing happened" — zero data loss, zero user disruption.

**Date:** 2025-11-21  
**Status:** PROPOSED  
**Target:** Production deployment with 35-minute health checks

---

## Current State Analysis

### Existing Auto-Save Systems

| System | Current Interval | Data at Risk | Impact on Restart |
|--------|-----------------|--------------|-------------------|
| **Security Bot State** | **1 minute** | Sweep/alert/permission stats | <1 min of stats lost |
| **Cooldowns** | **1 minute** | User command cooldowns | <1 min of cooldowns lost |
| **Engine Write Buffer** | **30 seconds** | Battle logs, move usage, anomalies | <30s of analytics lost |
| **Engine Write-DB** | **30 seconds** (auto-save) | Battle data, move stats | <30s of analytics lost |
| **Prisma Connections** | On shutdown only | N/A | Reconnect on boot (~2-3s) |
| **Discord.js Cache** | In-memory only | Guild/channel/member cache | Rebuild on boot (~5-10s) |

### Shutdown Sequence (PHASE 1 + PHASE 2)

**PHASE 1: Critical Data Persistence** (~2-5 seconds)
1. Security bot state → `/Store/security-bot-state/current.json`
2. Cooldowns → `/Store/cooldowns/cooldowns.json`
3. Engine Write Buffer → flush to Write-DB
4. Engine Write-DB → save to disk (`Store/engine-write-db.sqlite`)
5. Pokémon cache → save to disk (non-critical, best-effort)

**PHASE 2: Service Shutdown** (~5-10 seconds)
- Stop workers (cache, outbox, data pipeline, security)
- ServiceRegistry shutdown (reverse dependency order)
- Event Bus shutdown (drain subscriptions)
- AI Logger shutdown (flush logs)
- Prisma disconnect
- Discord clients destroy
- Health server stop

**Total Shutdown Time:** ~7-15 seconds (graceful, data-safe)

---

## Optimization Strategy

### 1. Reduce Auto-Save Intervals (Minimize Data Loss Window)

**Rationale:** With 35-minute health checks (105-minute max downtime), we have budget for MORE FREQUENT auto-saves to reduce data loss risk.

#### Proposed Changes

| System | Current | Optimized | Benefit | Trade-off |
|--------|---------|-----------|---------|-----------|
| **Security Bot** | 1 min | **30 seconds** | <30s stats loss (50% improvement) | +1 disk write/min |
| **Cooldowns** | 1 min | **30 seconds** | <30s cooldowns loss (50% improvement) | +1 disk write/min |
| **Engine Write Buffer** | 30s | **15 seconds** | <15s analytics loss (50% improvement) | +2 flushes/min |
| **Engine Write-DB** | 30s | **15 seconds** | <15s analytics loss (50% improvement) | +2 disk writes/min |

**Total Overhead:** +6 disk operations/minute (negligible on modern SSD)

**Memory Impact:** ZERO (just flush frequency, not buffer size)

**CPU Impact:** <0.5% (JSON serialization + SQLite writes are fast)

#### Implementation

**File:** `src/bot/state/persistence.js`
```javascript
// Line 31: Reduce from 1 minute → 30 seconds
const AUTO_SAVE_INTERVAL_MS = 30 * 1000; // 30 seconds (reduced from 1min for seamless restart optimization)
```

**File:** `src/lib/cooldown.js`
```javascript
// Line 10: Reduce from 1 minute → 30 seconds
const PERSIST_INTERVAL_MS = 30 * 1000; // 30 seconds (reduced from 1min for seamless restart optimization)
```

**File:** `src/config/engine-db-config.ts`
```typescript
// Line 144-146: Reduce from 30 seconds → 15 seconds
export const WRITE_BUFFER_FLUSH_INTERVAL_MS = IS_TEST
  ? 100              // 100ms for unit tests (fast feedback)
  : 15 * 1000;       // 15 seconds (reduced from 30s for seamless restart optimization)
```

---

### 2. Add Pre-Shutdown State Snapshot (Instant Recovery)

**Rationale:** When SIGTERM received, immediately snapshot ALL critical state BEFORE starting shutdown sequence.

#### New Shutdown Flow

**PHASE 0: INSTANT STATE SNAPSHOT** (~500ms)
```typescript
// Execute ALL saves in parallel (no waiting)
await Promise.allSettled([
  saveSecurityBotState(),
  saveCooldowns(),
  flushEngineWriteBuffer(),
  saveEngineWriteDb(),
  // Add more as needed
]);
```

**Benefits:**
- ✅ Zero data loss (snapshot captures moment of SIGTERM)
- ✅ Parallel execution (~500ms vs ~2-5s sequential)
- ✅ `Promise.allSettled` → No cascading failures

**Implementation:**

**File:** `src/index.ts` (gracefulShutdown function)
```typescript
async function gracefulShutdown(signal: string) {
  log.info("=".repeat(80));
  log.info(`GRACEFUL SHUTDOWN INITIATED (${signal})`);
  log.info("=".repeat(80));

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 0: INSTANT STATE SNAPSHOT (NEW - Parallel saves, no cascading failures)
  // ═══════════════════════════════════════════════════════════════════════════
  
  log.info("PHASE 0: Instant state snapshot starting (parallel execution)");
  const snapshotStart = Date.now();
  
  const snapshotResults = await Promise.allSettled([
    // Security bot state
    (async () => {
      if (global.securityBotState) {
        const { saveState } = await import("./bot/state/persistence.js");
        await saveState(global.securityBotState);
        log.info("✅ Security bot state saved");
      }
    })(),
    
    // Cooldowns
    (async () => {
      const { persist: persistCooldowns } = await import("./lib/cooldown.js");
      await persistCooldowns();
      log.info("✅ Cooldowns saved");
    })(),
    
    // Engine Write Buffer
    (async () => {
      if (engineWriteBuffer) {
        await engineWriteBuffer.flush();
        log.info("✅ Engine Write Buffer flushed");
      }
    })(),
    
    // Engine Write-DB
    (async () => {
      if (engineWriteDbService) {
        await engineWriteDbService.save();
        log.info("✅ Engine Write-DB saved");
      }
    })(),
  ]);
  
  const snapshotDuration = Date.now() - snapshotStart;
  const snapshotFailures = snapshotResults.filter(r => r.status === 'rejected').length;
  
  log.info(`PHASE 0: Instant state snapshot complete (${snapshotDuration}ms, ${snapshotFailures} failures)`);
  
  if (snapshotFailures > 0) {
    log.warn("Some snapshots failed (non-critical, proceeding with shutdown)", {
      failures: snapshotResults
        .filter(r => r.status === 'rejected')
        .map(r => (r as PromiseRejectedResult).reason)
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: CRITICAL DATA PERSISTENCE (Existing flow, now redundant but safe)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // ... existing PHASE 1 + PHASE 2 code ...
}
```

---

### 3. Optimize Discord.js Cache Rebuild (Faster Boot)

**Rationale:** Discord.js cache rebuild (~5-10s) is the slowest boot step. Optimize with lazy loading + prefetch hints.

#### Current Behavior
- Bot connects → Discord.js fetches ALL guilds → fetches ALL channels → fetches ALL members
- ~5-10 seconds before bot is "ready"

#### Optimized Behavior
- Bot connects → Mark ready IMMEDIATELY
- Background prefetch: Guilds (1s) → Active channels only (2s) → Members on-demand
- User sees bot online instantly, commands work immediately

**Implementation:**

**File:** `src/bot/index.ts` (ClientReady event)
```typescript
client.once("ready", async () => {
  log.info("Discord client READY", { user: client.user?.tag });
  
  // Mark ready IMMEDIATELY (don't wait for cache prefetch)
  global.engineReady = true;
  
  // Background prefetch (non-blocking)
  prefetchCriticalData().catch(err => {
    log.warn("Cache prefetch failed (non-critical)", { error: err.message });
  });
});

async function prefetchCriticalData() {
  // Prefetch guilds (fast, usually cached)
  const guilds = client.guilds.cache;
  log.info(`Prefetched ${guilds.size} guilds`);
  
  // Prefetch active channels only (where bot has recent activity)
  // Skip dead guilds, skip DM channels (fetched on-demand)
  for (const guild of guilds.values()) {
    // Fetch channels (fast, <100ms per guild)
    await guild.channels.fetch().catch(() => {});
  }
  
  log.info("Cache prefetch complete");
}
```

---

### 4. Add "Restart in Progress" User Feedback

**Rationale:** Users see bot go offline → online, but don't know if it's a crash or planned restart.

#### Discord Webhook Enhancements

**Current:** Boot notification (green embed) with uptime, memory, service health  
**Improved:** Add "Last restart reason" field

**File:** `src/services/lifecycle-webhook.ts`
```typescript
export async function notifyBoot(bootNumber: number, lastRestartReason?: string) {
  const embed = {
    title: "🟢 Infinity Gauntlet: BOOT COMPLETE",
    description: `Service online (boot #${bootNumber})`,
    color: 0x00ff00, // Green
    fields: [
      {
        name: "Last Restart Reason",
        value: lastRestartReason || "Unknown (first boot or crash)",
        inline: false
      },
      {
        name: "Restart Type",
        value: lastRestartReason === "SIGTERM" 
          ? "✅ Planned (GitHub Actions scheduled restart)" 
          : lastRestartReason === "SIGINT"
          ? "🔄 Manual (operator restart)"
          : "❌ Unexpected (crash or forced kill)",
        inline: false
      },
      // ... existing fields ...
    ]
  };
  
  await sendWebhook(embed);
}
```

**Storage:** Persist last restart reason in `/Store/restart-metrics.json`

---

### 5. Health Check Optimization (Faster Warmup)

**Rationale:** Health endpoint returns 503 during init (~10-15s), causing health check failures during restart.

#### Current Behavior
- Bot boots → Health returns 503 → Discord client connects → Engine initializes → Health returns 200
- Health watchdog sees 503 → records failure → potentially triggers restart loop

#### Optimized Behavior
- Health returns **206 Partial Content** during init (not 503)
- Health watchdog recognizes 206 as "booting, wait" (not failure)

**File:** `src/services/health-server.ts`
```typescript
function getHealthStatus() {
  if (!global.engineReady) {
    return {
      statusCode: 206, // Partial Content (booting, not failed)
      body: {
        status: "booting",
        message: "Service initializing, not yet ready",
        uptime: process.uptime(),
        memory: process.memoryUsage().rss / 1024 / 1024,
      }
    };
  }
  
  // ... existing 200 OK logic ...
}
```

**File:** `.github/workflows/health-check-watchdog.yml`
```yaml
# Update health check to recognize 206 as "booting" (not failure)
if [ "$health_status" = "200" ] || [ "$health_status" = "206" ]; then
  echo "✅ Service is healthy or booting!"
  echo "health_status=healthy" >> $GITHUB_OUTPUT
  exit 0
else
  echo "⚠️ Health endpoint returned non-200/206: $health_status"
  echo "health_status=unhealthy" >> $GITHUB_OUTPUT
  exit 0
fi
```

---

## Implementation Plan

### Phase 1: Auto-Save Interval Reduction (15 minutes)
1. Update `src/bot/state/persistence.js` (30s)
2. Update `src/lib/cooldown.js` (30s)
3. Update `src/config/engine-db-config.ts` (15s)
4. Update documentation (mention seamless restart optimization)
5. Test locally: Restart bot, verify <30s data loss

### Phase 2: Instant State Snapshot (30 minutes)
1. Add PHASE 0 to `gracefulShutdown()` in `src/index.ts`
2. Use `Promise.allSettled()` for parallel execution
3. Add snapshot duration logging
4. Test locally: SIGTERM → verify all saves complete <1s

### Phase 3: Discord.js Cache Optimization (30 minutes)
1. Add `prefetchCriticalData()` function
2. Move guild/channel fetch to background
3. Mark `engineReady = true` immediately on ClientReady
4. Test locally: Bot online time reduced from 10s → 2s

### Phase 4: Health Check Warmup (20 minutes)
1. Add 206 Partial Content response during boot
2. Update health-check-watchdog.yml to recognize 206
3. Test locally: Health checks during restart don't trigger failures

### Phase 5: User Feedback (15 minutes)
1. Add last restart reason to restart-metrics.json
2. Update `notifyBoot()` webhook with restart reason
3. Test locally: Verify webhook shows planned vs crash restart

**Total Implementation Time:** ~2 hours

---

## Expected Results

### Before Optimization
- ⚠️ Data loss window: **<1 minute** (cooldowns, stats)
- ⚠️ Analytics loss: **<30 seconds** (battle logs)
- ⚠️ Boot time: **10-15 seconds** (cache rebuild)
- ⚠️ Health check failures: **1-2 during restart** (503 responses)
- ⚠️ User experience: "Bot went offline for ~15 seconds, what happened?"

### After Optimization
- ✅ Data loss window: **<30 seconds** (cooldowns, stats) — 50% improvement
- ✅ Analytics loss: **<15 seconds** (battle logs) — 50% improvement
- ✅ Instant snapshot: **~500ms** (all critical state saved before shutdown)
- ✅ Boot time: **2-3 seconds** (lazy cache loading) — 70% improvement
- ✅ Health check failures: **0 during restart** (206 Partial Content)
- ✅ User experience: "Bot blinked for 2 seconds, seamless restart"

---

## Metrics to Monitor

**Restart Quality Metrics:**
1. **Data Loss Window** — Time between last auto-save and SIGTERM
2. **Snapshot Duration** — PHASE 0 execution time (<1s target)
3. **Boot Time** — SIGTERM → engineReady=true (<5s target)
4. **Health Check Failures** — During restart (0 target)
5. **User-Visible Downtime** — Discord bot offline duration (<5s target)

**Observability:**
- Add `restart.seamless` metric to restart-metrics.json
- Track "perfect restarts" (zero data loss, zero health failures)
- Alert if restart duration >10s or health failures >0

---

## Risks & Mitigation

### Risk 1: Parallel Snapshot Failures
**Scenario:** One snapshot fails, cascades to others  
**Mitigation:** `Promise.allSettled()` prevents cascading failures, logs each failure independently

### Risk 2: Increased Disk I/O
**Scenario:** More frequent saves overwhelm disk  
**Mitigation:** Modern SSDs handle 6 writes/minute trivially (<1% I/O utilization)

### Risk 3: Health Check False Positives
**Scenario:** 206 Partial Content misinterpreted as failure  
**Mitigation:** Update watchdog to explicitly handle 206, document in operations-bible

### Risk 4: Boot Time Regression
**Scenario:** Lazy loading breaks commands during boot  
**Mitigation:** Commands already check `engineReady` flag, background prefetch is non-blocking

---

## Rollout Plan

1. **Local Testing** (1 day) — Verify all changes work locally
2. **Staging Deployment** (1 day) — Test on non-production Render service
3. **Production Deployment** (1 day) — Deploy during scheduled restart window
4. **Monitoring** (1 week) — Observe metrics, validate seamless restart experience
5. **Documentation Update** (ongoing) — Update operations-bible with new behavior

---

## Success Criteria

- ✅ Zero user-visible data loss on planned restarts
- ✅ Boot time <5 seconds (80% improvement from current 10-15s)
- ✅ Zero health check failures during restart
- ✅ Restart-metrics.json shows "seamless: true" for all scheduled restarts
- ✅ Discord webhook clearly indicates planned vs crash restart
- ✅ Users report "didn't even notice the bot restarted"

---

**Status:** READY FOR IMPLEMENTATION  
**Next Step:** Review plan → Approve → Execute Phase 1-5  
**Est. Completion:** 2-3 days (implementation + testing + deployment)
