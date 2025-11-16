# 24-Hour Memory Monitoring — Quick Reference Card

**Monitoring Job**: PowerShell Job #1  
**Start**: 2025-11-14 17:09 UTC (22:09 workstation)  
**End**: 2025-11-15 17:09 UTC (22:09 workstation)  
**Baseline RSS**: 160.9 MB (PID 63)

---

## Quick Status Check (Run Anytime)

```powershell
# Check monitoring job is running
Get-Job -Id 1 | Format-List State, HasMoreData

# View recent output (last 15 lines)
Receive-Job -Id 1 -Keep | Select-Object -Last 15

# View log file (last 30 lines)
Get-Content "Store/monitoring/memory-growth-2025-11-14.log" | Select-Object -Last 30

# Current RSS via SSH
pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId "srv-d3snk2ndiees73cn709g" -Command "ps -p 63 -o pid,rss,etime"
```

---

## Manual Check Schedule

| Time (UTC) | Time (Workstation) | Expected RSS | Action |
| --- | --- | --- | --- |
| 18:09 | Nov 14 23:09 | 180-200 MB | Verify startup spike complete |
| 23:09 | Nov 15 04:09 | 250-300 MB | Run `/ops memory` in Discord, check pattern cache |
| 05:09 | Nov 15 10:09 | 350-380 MB | Verify deceleration (<15 MB/hr growth) |
| 17:09 | Nov 15 22:09 | 400-450 MB | Final validation, create results document |

---

## Discord Command Validation

**When to run**: Hour 6, 12, 24  
**Command**: `/ops memory` (in Discord server channel, requires Administrator)  
**Look for**:
- 📝 Log Buffer: X/200 entries
- 🚌 Event Bus: Pattern Cache M/500 patterns
- 💬 Discord.js Cache: Messages/Members/Threads counts

**Record Pattern Cache Size**:
- Hour 6: _____ patterns
- Hour 12: _____ patterns
- Hour 24: _____ patterns

---

## Alert Thresholds

- ⚠️ **WARNING**: RSS > 435 MB (85% limit)
- ❌ **CRITICAL**: RSS > 486 MB (95% limit)
- ❌ **ROLLBACK**: Pattern cache > 600 entries, OOM kill, service crash

---

## If Monitoring Job Stops

```powershell
# Check if job died
Get-Job -Id 1

# If State = Completed/Failed, restart it
Start-Job -ScriptBlock { 
    Set-Location "C:\Users\sherb\OneDrive\Documents\github\Infinity-Gauntlet"
    pwsh -File "scripts/monitor_memory_24h.ps1" 
}

# New job will be ID 2, 3, etc.
```

---

## Key Files

- **Monitoring Log**: `Store/monitoring/memory-growth-2025-11-14.log`
- **Baseline Snapshot**: `docs/MEMORY-BASELINE-2025-11-14.md`
- **Checklist**: `docs/MEMORY-MONITORING-24H-CHECKLIST.md`
- **Deployment Summary**: `docs/MEMORY-DEPLOYMENT-SUMMARY-2025-11-14.md`
- **Monitoring Script**: `scripts/monitor_memory_24h.ps1`

---

## Success = All Green

- ✅ RSS < 435 MB by hour 24
- ✅ Growth rate < 5 MB/hr by hour 24
- ✅ Pattern cache < 250 entries
- ✅ No crashes, no OOM kills
- ✅ `/ops memory` works in Discord

---

**Created**: 2025-11-14 17:15 UTC  
**Next Check**: 18:09 UTC (1 hour from baseline)
