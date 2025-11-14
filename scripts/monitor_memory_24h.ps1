#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Monitor Render service memory for 24 hours
.DESCRIPTION
    Checks node process RSS memory and pattern cache stats every 30 minutes for 24 hours.
    Logs results to Store/monitoring/memory-growth-YYYY-MM-DD.log
.PARAMETER ServiceId
    Render service ID (default: srv-d3snk2ndiees73cn709g - main bot)
.PARAMETER IntervalMinutes
    Check interval in minutes (default: 30)
.PARAMETER DurationHours
    Total monitoring duration in hours (default: 24)
.EXAMPLE
    pwsh -File scripts/monitor_memory_24h.ps1
    pwsh -File scripts/monitor_memory_24h.ps1 -IntervalMinutes 15 -DurationHours 48
#>

param(
    [string]$ServiceId = "srv-d3snk2ndiees73cn709g",
    [int]$IntervalMinutes = 30,
    [int]$DurationHours = 24
)

$ErrorActionPreference = "Stop"

# Setup logging
$timestamp = Get-Date -Format "yyyy-MM-dd"
$logDir = "Store/monitoring"
if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = Join-Path $logDir "memory-growth-$timestamp.log"

function Write-Log {
    param([string]$Message)
    $timestampedMessage = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Write-Host $timestampedMessage
    Add-Content -Path $logFile -Value $timestampedMessage
}

function Get-ProcessMemory {
    param([string]$ServiceId)
    
    try {
        $result = & pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId $ServiceId -Command "ps aux" 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            return @{
                Success = $false
                Error = "SSH command failed (exit code $LASTEXITCODE)"
                Output = $result -join "`n"
            }
        }
        
        # Parse ps output: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
        # Find line with "node dist/index.js" (main bot process, not shell wrapper)
        # Look for " Sl " status (sleeping interruptible, leader) which is the node process
        # Exclude "sh -c" wrapper which has " S " status
        $lines = $result | Where-Object { 
            $_ -match "^\s*render\s+\d+.*\sSl\s+.*node\s+dist/index\.js" 
        }
        
        if ($lines) {
            $line = $lines | Select-Object -First 1
            # Remove leading/trailing whitespace and split
            $cleanLine = $line.Trim() -replace '\s+', ' '
            $parts = $cleanLine -split ' ', 11
            
            if ($parts.Count -ge 6) {
                $rssKb = [int]$parts[5]
                $rssMb = [math]::Round($rssKb / 1024, 1)
                $vsz = $parts[4]
                $cpu = $parts[2]
                $mem = $parts[3]
                $processPid = $parts[1]
                
                return @{
                    Success = $true
                    ProcessPID = $processPid
                    RSS_KB = $rssKb
                    RSS_MB = $rssMb
                    VSZ = $vsz
                    CPU_Percent = $cpu
                    MEM_Percent = $mem
                    Timestamp = Get-Date
                }
            }
        }
        
        return @{
            Success = $false
            Error = "No node process found"
            Output = $result -join "`n"
        }
    }
    catch {
        return @{
            Success = $false
            Error = $_.Exception.Message
        }
    }
}

function Get-ProcessDetails {
    param([string]$ServiceId)
    
    try {
        $result = & pwsh -File "scripts/render_ssh_exec.ps1" -ServiceId $ServiceId -Command "cat /proc/`$(pgrep node)/status | grep -E 'VmRSS|Threads|FDSize'" 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            $vmrss = ($result | Where-Object { $_ -match "VmRSS" }) -replace '.*:\s+(\d+)\s+kB', '$1'
            $threads = ($result | Where-Object { $_ -match "Threads" }) -replace '.*:\s+(\d+)', '$1'
            $fdsize = ($result | Where-Object { $_ -match "FDSize" }) -replace '.*:\s+(\d+)', '$1'
            
            return @{
                Success = $true
                VmRSS_KB = [int]$vmrss
                Threads = [int]$threads
                FDSize = [int]$fdsize
            }
        }
        
        return @{ Success = $false }
    }
    catch {
        return @{ Success = $false }
    }
}

# Monitoring loop
$startTime = Get-Date
$endTime = $startTime.AddHours($DurationHours)
$intervalSeconds = $IntervalMinutes * 60
$iteration = 0

Write-Log "========================================"
Write-Log "Memory Monitoring Started"
Write-Log "Service: $ServiceId"
Write-Log "Interval: $IntervalMinutes minutes"
Write-Log "Duration: $DurationHours hours"
Write-Log "End Time: $($endTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Log "Log File: $logFile"
Write-Log "========================================"
Write-Log ""

$baseline = $null

while ((Get-Date) -lt $endTime) {
    $iteration++
    $elapsed = [math]::Round(((Get-Date) - $startTime).TotalHours, 2)
    
    Write-Log "--- Check #$iteration (Elapsed: ${elapsed}h) ---"
    
    # Get process memory
    $memInfo = Get-ProcessMemory -ServiceId $ServiceId
    
    if ($memInfo.Success) {
        Write-Log "PID: $($memInfo.ProcessPID) | RSS: $($memInfo.RSS_MB) MB ($($memInfo.RSS_KB) KB)"
        Write-Log "VSZ: $($memInfo.VSZ) KB | CPU: $($memInfo.CPU_Percent)%, MEM: $($memInfo.MEM_Percent)%"
        
        # Calculate delta from baseline
        if ($null -eq $baseline) {
            $baseline = $memInfo.RSS_MB
            Write-Log "BASELINE SET: $baseline MB"
        }
        else {
            $delta = $memInfo.RSS_MB - $baseline
            $rate = if ($elapsed -gt 0) { [math]::Round($delta / $elapsed, 2) } else { 0 }
            Write-Log "Delta from baseline: $delta MB (Growth rate: $rate MB/hour)"
        }
        
        # Get detailed process info
        $details = Get-ProcessDetails -ServiceId $ServiceId
        if ($details.Success) {
            Write-Log "VmRSS: $($details.VmRSS_KB) KB"
            Write-Log "Threads: $($details.Threads)"
            Write-Log "File Descriptors: $($details.FDSize)"
        }
        
        # Status assessment
        $status = if ($memInfo.RSS_MB -ge 460) { "💀 EMERGENCY" }
                  elseif ($memInfo.RSS_MB -ge 435) { "🚨 CRITICAL" }
                  elseif ($memInfo.RSS_MB -ge 384) { "⚠️ WARNING" }
                  else { "✅ HEALTHY" }
        Write-Log "Status: $status ($($memInfo.RSS_MB) MB / 512 MB = $(([math]::Round($memInfo.RSS_MB / 512 * 100, 1)))%)"
    }
    else {
        Write-Log "❌ Failed to get memory info: $($memInfo.Error)"
        if ($memInfo.Output) {
            Write-Log "Output: $($memInfo.Output)"
        }
    }
    
    Write-Log ""
    
    # Wait for next interval (unless last iteration)
    if ((Get-Date).AddSeconds($intervalSeconds) -lt $endTime) {
        $remaining = [math]::Round((($endTime - (Get-Date)).TotalHours), 2)
        Write-Log "Next check in $IntervalMinutes minutes (Remaining: ${remaining}h)..."
        Write-Log ""
        Start-Sleep -Seconds $intervalSeconds
    }
}

Write-Log "========================================"
Write-Log "Memory Monitoring Complete"
Write-Log "Duration: $DurationHours hours"
Write-Log "Total Checks: $iteration"
if ($baseline -and $memInfo.Success) {
    $totalGrowth = $memInfo.RSS_MB - $baseline
    $avgRate = [math]::Round($totalGrowth / $DurationHours, 2)
    Write-Log "Final RSS: $($memInfo.RSS_MB) MB"
    Write-Log "Total Growth: $totalGrowth MB"
    Write-Log "Average Rate: $avgRate MB/hour"
}
Write-Log "Log File: $logFile"
Write-Log "========================================"
