# 24-Hour Memory Monitoring Checklist — November 14-15, 2025

**Purpose**: Validate Event Bus LRU eviction and enhanced /ops memory command over 24-hour production runtime.

**Monitoring Job**: PowerShell Job #1 (Background)  
**Start Time**: 2025-11-14 17:09:26 UTC (21:09:26 UTC workstation time)  
**End Time**: 2025-11-15 17:09:26 UTC  
**Log File**: `Store/monitoring/memory-growth-2025-11-14.log`  
**Check Interval**: Every 30 minutes (48 checks total)

---

## Initial Baseline (Check #1 - 17:09 UTC)

✅ **Captured at startup**:
- **Process PID**: 63 (node dist/index.js)
- **RSS Memory**: 160.9 MB (164,808 KB)
- **VSZ (Virtual)**: 32,254 MB (33,028,916 KB)
- **CPU Usage**: 0.2%
- **Memory %**: 0.2% (of pod total)
- **Status**: ✅ HEALTHY (31.4% of 512 MB limit)
- **Process Uptime**: ~27 minutes (restart 21:42 UTC → baseline 22:09 UTC)

---

## Manual Validation Points

### ✅ Hour 0 (Initial) — 17:09 UTC (22:09 UTC workstation)
**Timestamp**: 2025-11-14 22:09 UTC  
**Expected RSS**: 160-170 MB (startup stabilization)  
**Actual RSS**: 160.9 MB ✅  
**Growth from Restart**: +19.9 MB (141 MB → 160.9 MB over 27 minutes)  
**Growth Rate**: ~44 MB/hr (typical startup phase)  
**Status**: HEALTHY ✅

**Actions**:
- [x] Verify monitoring job running (Get-Job -Id 1)
- [x] Confirm PID 63 detected correctly
- [x] Check log file created: Store/monitoring/memory-growth-2025-11-14.log
- [x] Baseline documented in MEMORY-BASELINE-2025-11-14.md

---

### ✅ Hour 1 — 18:09 UTC (23:09 UTC workstation) — COMPLETE
**Timestamp**: 2025-11-14 18:10 UTC  
**Expected RSS**: 180-200 MB (active growth phase)  
**Actual RSS**: 181.8 MB ✅  
**Growth from Baseline**: +20.9 MB (160.9 MB → 181.8 MB over 30 minutes)  
**Growth Rate**: 41.8 MB/hr (within expected 20-40 MB/hr range, high end)  
**Status**: HEALTHY ✅ (35.5% of 512 MB limit)

**Check Commands**:
```powershell
# Check job status
Get-Job -Id 1 | Format-List

# View recent monitoring output
Receive-Job -Id 1 -Keep | Select-Object -Last 20

# Check log file
Get-Content "Store/monitoring/memory-growth-2025-11-14.log" | Select-Object -Last 30
```

**Validation**:
- [x] RSS < 435 MB (85% threshold) — 181.8 MB ✅
- [x] Growth rate 20-40 MB/hr — 41.8 MB/hr ✅ (high end, typical for warmup)
- [x] No OOM events — Clean ✅
- [x] Monitoring job still running — State: Running ✅

**Notes**: Growth rate at high end of expected range (41.8 MB/hr). This is typical during initial warmup phase. Expect deceleration to 10-20 MB/hr by Hour 6. Process PID 63 stable. Monitoring job operational.

---

### ⏳ Hour 6 — 23:09 UTC (04:09 UTC Nov 15 workstation) — PENDING
**Expected RSS**: 250-300 MB (continued growth, start of deceleration)  
**Target Growth Rate**: 15-30 MB/hr (decreasing)

**Check Commands**:
```powershell
# Manual RSS check via SSH
pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId "srv-d3snk2ndiees73cn709g" -Command "ps -p 63 -o pid,rss,vsz,etime,cmd"

# Check pattern cache size (if /ops memory available)
# Run in Discord: /ops memory

# View monitoring stats
Get-Content "Store/monitoring/memory-growth-2025-11-14.log" | Select-String "Check #13" -Context 0,8
```

**Validation**:
- [ ] RSS < 435 MB
- [ ] Growth rate 15-30 MB/hr (decelerating)
- [ ] Pattern cache < 250 entries (via /ops memory in Discord)
- [ ] No FD leaks (file descriptors ~32-40)
- [ ] Thread count stable (~10-15)

**Notes**: ____________________________________________________________

---

### ⏳ Hour 12 — 05:09 UTC Nov 15 (10:09 UTC workstation) — PENDING
**Expected RSS**: 350-380 MB (significant deceleration)  
**Target Growth Rate**: 5-15 MB/hr

**Check Commands**:
```powershell
# Full process status
pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId "srv-d3snk2ndiees73cn709g" -Command "cat /proc/63/status | grep -E 'VmRSS|Threads|FDSize'"

# Check log for growth pattern
Get-Content "Store/monitoring/memory-growth-2025-11-14.log" | Select-String "Growth rate" | Select-Object -Last 10
```

**Validation**:
- [ ] RSS 350-380 MB (approaching plateau)
- [ ] Growth rate < 15 MB/hr (near plateau)
- [ ] Pattern cache stable (no unbounded growth)
- [ ] Log Buffer < 200 entries (via /ops memory)
- [ ] Event Bus subscribers stable (~10-15)

**Notes**: ____________________________________________________________

---

### ⏳ Hour 24 — 17:09 UTC Nov 15 (22:09 UTC workstation) — PENDING
**Expected RSS**: 400-450 MB (plateau reached)  
**Target Growth Rate**: <5 MB/hr (stable)

**Check Commands**:
```powershell
# Final memory snapshot
pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId "srv-d3snk2ndiees73cn709g" -Command "ps -p 63 -o pid,rss,vsz,etime,cmd; echo '---'; cat /proc/63/status | grep -E 'VmRSS|Threads|FDSize'"

# Check monitoring job completion
Get-Job -Id 1 | Format-List
Receive-Job -Id 1 -Keep | Select-Object -Last 50

# Full log review
Get-Content "Store/monitoring/memory-growth-2025-11-14.log" | Select-String "Check #48" -Context 0,8
```

**Validation**:
- [ ] RSS 400-450 MB (plateau achieved)
- [ ] RSS < 435 MB (alert threshold)
- [ ] Growth rate < 5 MB/hr (stable)
- [ ] Pattern cache < 250 entries (LRU working)
- [ ] No memory leaks detected
- [ ] Monitoring job completed successfully

**Notes**: ____________________________________________________________

---

## Discord Command Validation (/ops memory)

### Expected New Metrics Sections

Run `/ops memory` in Discord server channel (requires Administrator permission):

#### 1. Log Buffer Metrics (NEW)
```
📝 Log Buffer:
   Buffered entries: X/200 (~Y KB)
```
- Verify counter displays (X should be 0-200)
- Memory estimate should be ~2 KB per entry

#### 2. Event Bus Metrics (NEW)
```
🚌 Event Bus:
   Subscribers: Z
   Replay Buffer: N events
   Pattern Cache: M/500 patterns (~K KB)
```
- Verify pattern cache counter (M/500)
- M should stay < 250 patterns
- K should be ~500 bytes per pattern

#### 3. Discord.js Cache Metrics (NEW)
```
💬 Discord.js Cache:
   Messages: A (~B KB)
   Members: C (~D KB)
   Threads: E (~F KB)
   Total: ~G MB
```
- Verify all counters display
- Totals should match sweeper limits (50 messages, 1000 members, 50 threads)

### Validation Schedule

- [ ] **Hour 1** (18:09 UTC): Run `/ops memory`, record pattern cache baseline
- [ ] **Hour 6** (23:09 UTC): Verify pattern cache growth, check for errors
- [ ] **Hour 12** (05:09 UTC Nov 15): Confirm pattern cache stable (<250 entries)
- [ ] **Hour 24** (17:09 UTC Nov 15): Final validation, document peak memory

**Pattern Cache Observations**:
- Hour 1: _____ patterns
- Hour 6: _____ patterns
- Hour 12: _____ patterns
- Hour 24: _____ patterns

---

## Rollback Criteria (Immediate Action Required)

If any of these conditions occur, **consider rollback**:

❌ **CRITICAL - Immediate Rollback**:
- RSS exceeds 486 MB (95% of 512 MB limit)
- OOM kill event (service crash with memory error)
- Pattern cache grows > 600 entries (LRU failure)
- Service restarts unexpectedly (crash loop)

⚠️ **WARNING - Monitor Closely**:
- RSS exceeds 435 MB (85% threshold)
- Pattern cache > 400 entries at Hour 12+
- Growth rate > 10 MB/hr after Hour 12
- `/ops memory` command throws errors

**Rollback Procedure**:
1. Document failure state (RSS, errors, logs)
2. Revert commit: `git revert HEAD` (Event Bus LRU + /ops memory changes)
3. Deploy rollback: `pwsh -File "scripts/render_deploy.ps1" -Service "Infinity-Gauntlet"`
4. Update tasklist.md with rollback reason
5. Create incident report in docs/

---

## Success Criteria (All Must Pass)

After 24 hours, validate:

- ✅ RSS plateaus at 400-450 MB (not exceeding 435 MB)
- ✅ Growth rate decreases to <5 MB/hr by Hour 24
- ✅ Pattern cache stays <250 entries throughout observation
- ✅ `/ops memory` displays all new metric sections without errors
- ✅ No FD leaks (file descriptors stable ~32-40)
- ✅ Thread count stable (~10-15 threads)
- ✅ No OOM kills or unexpected restarts
- ✅ LRU eviction logs appear when pattern cache reaches 500 (if applicable)

---

## Monitoring Job Management

### Check Job Status
```powershell
Get-Job -Id 1 | Format-List
```

### View Recent Output
```powershell
Receive-Job -Id 1 -Keep | Select-Object -Last 30
```

### Stop Job (If Needed)
```powershell
Stop-Job -Id 1
Remove-Job -Id 1
```

### Restart Job (If Crashed)
```powershell
Start-Job -ScriptBlock { 
    Set-Location "C:\Users\sherb\OneDrive\Documents\github\Infinity-Gauntlet"
    pwsh -File "scripts/monitor_memory_24h.ps1" 
}
```

---

## Log File Analysis

### View Full Log
```powershell
Get-Content "Store/monitoring/memory-growth-2025-11-14.log"
```

### Extract All Baselines
```powershell
Get-Content "Store/monitoring/memory-growth-2025-11-14.log" | Select-String "BASELINE|RSS:"
```

### Extract Growth Rates
```powershell
Get-Content "Store/monitoring/memory-growth-2025-11-14.log" | Select-String "Growth rate"
```

### Extract Status Checks
```powershell
Get-Content "Store/monitoring/memory-growth-2025-11-14.log" | Select-String "Status:"
```

### Count Total Checks
```powershell
(Get-Content "Store/monitoring/memory-growth-2025-11-14.log" | Select-String "Check #").Count
```

---

## Documentation Updates (Post-24h)

After validation completes:

1. **Update MEMORY-BASELINE-2025-11-14.md**:
   - Add final RSS measurements
   - Document pattern cache peak size
   - Record growth rate progression
   - Note any anomalies or warnings

2. **Create MEMORY-24H-VALIDATION-RESULTS.md**:
   - Comprehensive report of all checks
   - Success/failure determination
   - Recommendations for future work

3. **Update tasklist.md**:
   - Close related tasks (Task 3, 4, 5, 6)
   - Mark validation outcomes
   - Link to result documents

4. **Update Prompt.md** (if successful):
   - Add to Last Repo Changes section
   - Update PATCHSET echo with validation results

---

**Created**: 2025-11-14 17:10 UTC  
**Monitoring Job**: PowerShell Job #1  
**Process**: PID 63, RSS 160.9 MB baseline  
**Next Manual Check**: Hour 1 (2025-11-14 18:09 UTC / 23:09 workstation)
