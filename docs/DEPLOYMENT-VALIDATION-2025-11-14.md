# Deployment Validation Checklist — 2025-11-14

## Deployment Status

**Date:** 2025-11-14  
**Service:** Infinity-Gauntlet (srv-d3snk2ndiees73cn709g)  
**Changes:** Event Bus Pattern Cache LRU + Enhanced /ops memory command  

### Deployment Timeline:
- ✅ **21:30 UTC** - Build successful (zero errors)
- ✅ **21:35 UTC** - Deployment triggered to Render
- ⏳ **Pending** - Service restart and validation

---

## Validation Steps

### Phase 1: Service Health (Immediate)

- [ ] **Service is running** - Check via SSH or Render dashboard
  ```bash
  pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId "srv-d3snk2ndiees73cn709g" -Command "ps aux | grep node"
  ```

- [ ] **Bot is online in Discord** - Check bot presence in server

- [ ] **No startup errors** - Check logs for errors during initialization
  ```bash
  pwsh -File "scripts/render_logs.ps1" -Service "Infinity-Gauntlet"
  ```

- [ ] **Baseline memory recorded** - Note initial RSS after startup
  ```bash
  pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId "srv-d3snk2ndiees73cn709g" -Command "ps aux | grep node | grep -v grep"
  ```

---

### Phase 2: Feature Validation (Within 1 Hour)

- [ ] **`/ops memory` command responds** - Run in Discord (admin-only)

- [ ] **Log Buffer metrics display** - Verify shows "X/200 entries"
  ```
  Expected line: • Log Buffer: ~0.XX MB (XX/200 entries)
  ```

- [ ] **Event Bus metrics display** - Verify shows subscribers, replay buffer, pattern cache
  ```
  Expected lines:
  • Event Bus: ~0.XX MB (XX subs, XX replay)
    - Pattern Cache: XX/500 patterns
  ```

- [ ] **Discord Cache metrics display** - Verify shows message/member/thread counts
  ```
  Expected line: • Discord Cache: ~XX.X MB (XXXX msg, XXXX members, XXX threads)
  ```

- [ ] **Pattern cache < 500** - Initial pattern count should be low (~50-100)

- [ ] **All existing metrics present** - RSS, heap, Engine DB stats, startup progression

---

### Phase 3: Pattern Cache Growth Monitoring (24 Hours)

**Start automated monitoring:**
```powershell
# In background terminal (runs for 24 hours, checks every 30 minutes)
pwsh -File "scripts/monitor_memory_24h.ps1"
```

**Manual checks via `/ops memory`:**
- [ ] **Hour 0** (deployment) - Baseline: ___ patterns
- [ ] **Hour 1** - Expected: ~50-80 patterns
- [ ] **Hour 6** - Expected: ~80-120 patterns
- [ ] **Hour 12** - Expected: <150 patterns
- [ ] **Hour 24** - Expected: <250 patterns (plateau)

**Validation Criteria:**
- ✅ Pattern cache stays below 250 patterns (50% of limit)
- ✅ No evictions logged (unless pattern count approaches 500)
- ✅ LRU mechanism working (patterns move to end on access)

---

### Phase 4: Memory Growth Monitoring (24 Hours)

**Baseline (from earlier session):**
- Previous steady state: ~268 MB RSS (startup)
- Previous observation: 418 MB RSS after 7h 19m uptime

**Monitoring Schedule:**

| Time | Expected RSS | Status Threshold | Notes |
|------|-------------|------------------|-------|
| **0h** (startup) | ~250-300 MB | ✅ HEALTHY | Fresh restart baseline |
| **1h** | ~280-330 MB | ✅ HEALTHY | Initial cache warming |
| **3h** | ~320-370 MB | ✅ HEALTHY | Rapid growth phase |
| **6h** | ~350-400 MB | ✅ HEALTHY | Stabilizing |
| **12h** | ~380-430 MB | ✅⚠️ HEALTHY/WARNING | Should be plateauing |
| **24h** | ~400-450 MB | ✅⚠️ HEALTHY/WARNING | Target plateau |

**Growth Rate Targets:**
- **Hour 0-3:** ~20-40 MB/hour (acceptable - cache warming)
- **Hour 3-6:** ~10-20 MB/hour (slowing down)
- **Hour 6-12:** ~5-10 MB/hour (stabilizing)
- **Hour 12-24:** <5 MB/hour (plateau)

**Alert Thresholds:**
- ⚠️ **WARNING:** 384 MB (75% of 512 MB limit)
- 🚨 **CRITICAL:** 435 MB (85% of 512 MB limit)
- 💀 **EMERGENCY:** 460 MB (90% of 512 MB limit)

**Manual Checks:**
```powershell
# Quick RSS check
pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId "srv-d3snk2ndiees73cn709g" -Command "ps aux | grep node | grep -v grep"

# Detailed memory breakdown
# Run /ops memory in Discord

# Check file descriptors (should stay ~32)
pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId "srv-d3snk2ndiees73cn709g" -Command "cat /proc/`$(pgrep node)/status | grep FDSize"
```

---

### Phase 5: Component Validation (Ongoing)

**Discord.js Sweepers:**
- [ ] Message cache stays under 50 per channel
- [ ] Member cache stays under 1000 per guild
- [ ] Thread cache stays under 50 per guild
- [ ] Sweepers run every 15 minutes (check logs)

**Event Bus:**
- [ ] Replay buffer stays at ~100 events max
- [ ] Subscriber queues don't exceed 1000 events
- [ ] No backpressure warnings in logs

**Log Buffer:**
- [ ] Buffer stays under 200 entries
- [ ] Flushes every 10 seconds (check logs)
- [ ] No overflow warnings

---

## Success Criteria

### Must Pass:
- ✅ Service starts successfully and stays running
- ✅ `/ops memory` command works and shows new metrics
- ✅ Pattern cache stays below 500 entries (ideally <250)
- ✅ RSS memory plateaus below 450 MB after 24 hours
- ✅ No memory-related errors in logs
- ✅ No performance degradation (bot commands respond normally)

### Nice to Have:
- ✅ RSS plateau below 400 MB (excellent)
- ✅ Pattern cache stays below 150 entries (very stable)
- ✅ Growth rate drops below 3 MB/hour after 12 hours
- ✅ File descriptors stay below 40
- ✅ Discord cache sweepers keep counts low

---

## Rollback Triggers

**Immediate rollback if:**
- 💀 RSS exceeds 460 MB within 6 hours
- 💀 Pattern cache exceeds 500 entries (LRU failure)
- 💀 `/ops memory` command causes crashes
- 💀 Service becomes unresponsive
- 💀 Memory grows faster than 50 MB/hour sustained

**Consider rollback if:**
- ⚠️ RSS exceeds 435 MB within 12 hours
- ⚠️ Pattern cache exceeds 400 entries (approaching limit)
- ⚠️ Growth rate doesn't stabilize by hour 12
- ⚠️ New memory metrics cause errors

---

## Monitoring Commands Quick Reference

### SSH Commands:
```bash
# Process RSS
pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId "srv-d3snk2ndiees73cn709g" -Command "ps aux | grep node | grep -v grep"

# Detailed process info
pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId "srv-d3snk2ndiees73cn709g" -Command "cat /proc/`$(pgrep node)/status | grep -E 'VmRSS|Threads|FDSize'"

# Continuous monitoring (every 10 seconds)
pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId "srv-d3snk2ndiees73cn709g" -Command "while true; do date; ps aux | grep node | grep -v grep; sleep 10; done"
```

### Automated Monitoring:
```powershell
# 24-hour monitoring (checks every 30 minutes)
pwsh -File "scripts/monitor_memory_24h.ps1"

# Custom interval (every 15 minutes for 48 hours)
pwsh -File "scripts/monitor_memory_24h.ps1" -IntervalMinutes 15 -DurationHours 48

# Check monitoring log
Get-Content "Store/monitoring/memory-growth-2025-11-14.log" -Tail 50
```

### Discord Commands (Admin Only):
```
/ops memory          # Comprehensive memory breakdown
/ops system          # General system health
/ops cache           # Cache metrics
/ops engine          # Engine DB stats
```

---

## Expected Outcomes

### Pattern Cache:
- **Hour 1:** ~50-80 patterns (initial subscription warmup)
- **Hour 6:** ~80-120 patterns (steady state)
- **Hour 24:** <250 patterns (plateau, well below 500 limit)
- **Evictions:** Zero (or very rare) - patterns are relatively static

### Memory Growth:
- **Startup:** ~250-300 MB RSS
- **Hour 6:** ~350-400 MB RSS (rapid growth from cache warming)
- **Hour 12:** ~400-430 MB RSS (stabilizing)
- **Hour 24:** ~400-450 MB RSS (plateau)
- **Growth Rate:** 20-40 MB/hr → 10-20 MB/hr → <5 MB/hr (stabilizing curve)

### Component Breakdown (Hour 24):
- Node.js Base: ~50 MB
- Discord.js Client: ~80-100 MB
- Discord Caches: ~20-30 MB (bounded by sweepers)
- Event Bus: ~5-10 MB (bounded queues)
- Log Buffer: ~1 MB (200 entry limit)
- Engine L1 Cache: ~20 MB (static)
- Write Buffer: ~5-10 MB (10k entry limit)
- Prisma Pool: ~5-10 MB (Render managed)
- Other Overhead: ~50-100 MB (V8 heap, etc.)
- **Total:** ~240-350 MB baseline + ~50-100 MB growth = ~400-450 MB

---

## Documentation

- **Memory Audit:** `docs/MEMORY-AUDIT-2025-11-14.md`
- **Implementation Guide:** `docs/MEMORY-IMPROVEMENTS-2025-11-14.md`
- **Monitoring Script:** `scripts/monitor_memory_24h.ps1`
- **Monitoring Log:** `Store/monitoring/memory-growth-2025-11-14.log`

---

## Notes

- Automated monitoring script runs in background for 24 hours
- Manual `/ops memory` checks recommended every 6 hours
- Pattern cache stats visible in `/ops memory` output under Event Bus section
- All memory bounds validated during comprehensive audit
- Rollback is straightforward (surgical changes, no dependencies)

**Status:** ⏳ **DEPLOYMENT IN PROGRESS** - Waiting for service restart
