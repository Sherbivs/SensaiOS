#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Enhanced Memory Monitor with Accuracy Verification
.DESCRIPTION
    Monitors Render service memory with real-time hardcoded estimate detection.
    Scans console output for estimate keywords, magic numbers, and approximation patterns.
    Exports metrics to CSV for trend analysis.
    
    Features:
    - Memory monitoring (RSS, VmRSS, threads, FDs)
    - Hardcoded estimate detection in output
    - CSV export for historical analysis
    - Violation alerts and reporting
    - Baseline tracking and growth rate calculation
    
.PARAMETER ServiceId
    Render service ID (default: srv-d3snk2ndiees73cn709g - main bot)
.PARAMETER IntervalMinutes
    Check interval in minutes (default: 30)
.PARAMETER DurationHours
    Total monitoring duration in hours (default: 24)
.PARAMETER EnableAccuracyCheck
    Enable hardcoded estimate detection (default: $true)
.PARAMETER ExportCsv
    Export metrics to CSV (default: $true)
.EXAMPLE
    pwsh -File scripts/monitor_memory_enhanced.ps1
    pwsh -File scripts/monitor_memory_enhanced.ps1 -IntervalMinutes 15 -DurationHours 48
    pwsh -File scripts/monitor_memory_enhanced.ps1 -EnableAccuracyCheck $false
#>

param(
    [string]$ServiceId = "srv-d3snk2ndiees73cn709g",
    [int]$IntervalMinutes = 30,
    [int]$DurationHours = 24,
    [bool]$EnableAccuracyCheck = $true,
    [bool]$ExportCsv = $true
)

$ErrorActionPreference = "Stop"

# Magic numbers that indicate hardcoded estimates
$MAGIC_NUMBERS = @(50, 100, 150, 200, 250, 500, 750, 1000, 5000, 10000)

# Estimate keywords
$ESTIMATE_KEYWORDS = @(
    'about', 'roughly', 'approximately', 'typical', 'usually',
    'around', 'estimate', 'guess', 'probably', 'maybe'
)

# Estimate patterns (regex)
$ESTIMATE_PATTERNS = @(
    '~\s*\d+',           # ~50
    '≈\s*\d+',           # ≈100
    'approximately\s+\d+', # approximately 50
    'about\s+\d+',       # about 100
    'roughly\s+\d+',     # roughly 200
    'around\s+\d+'       # around 500
)

# Setup logging
$timestamp = Get-Date -Format "yyyy-MM-dd"
$logDir = "Store/monitoring"
if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = Join-Path $logDir "memory-enhanced-$timestamp.log"
$csvFile = Join-Path $logDir "memory-metrics-$timestamp.csv"
$violationsFile = Join-Path $logDir "accuracy-violations-$timestamp.log"

# Initialize CSV if enabled
if ($ExportCsv) {
    if (!(Test-Path $csvFile)) {
        $csvHeader = "Timestamp,Iteration,ElapsedHours,ProcessPID,RSS_MB,RSS_KB,VSZ,CPU_Percent,MEM_Percent,VmRSS_KB,Threads,FDSize,DeltaMB,GrowthRateMBPerHour,MemoryUsagePercent,Status,AccuracyViolations"
        Add-Content -Path $csvFile -Value $csvHeader
    }
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestampedMessage = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Message"
    Write-Host $timestampedMessage
    Add-Content -Path $logFile -Value $timestampedMessage
}

function Write-Violation {
    param([string]$Message, [string]$Context)
    $timestampedMessage = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] VIOLATION: $Message`n  Context: $Context"
    Write-Host $timestampedMessage -ForegroundColor Yellow
    Add-Content -Path $violationsFile -Value $timestampedMessage
    Add-Content -Path $logFile -Value $timestampedMessage
}

function Test-OutputForEstimates {
    param([string]$Output)
    
    $violations = @()
    
    if ([string]::IsNullOrWhiteSpace($Output)) {
        return $violations
    }
    
    $lines = $Output -split "`n"
    
    foreach ($line in $lines) {
        # Skip empty lines
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        
        # Check for estimate keywords
        foreach ($keyword in $ESTIMATE_KEYWORDS) {
            if ($line -match "\b$keyword\b") {
                $violations += @{
                    Type = "EstimateKeyword"
                    Keyword = $keyword
                    Line = $line.Trim()
                }
            }
        }
        
        # Check for estimate patterns
        foreach ($pattern in $ESTIMATE_PATTERNS) {
            if ($line -match $pattern) {
                $violations += @{
                    Type = "EstimatePattern"
                    Pattern = $pattern
                    Match = $matches[0]
                    Line = $line.Trim()
                }
            }
        }
        
        # Check for magic numbers in metric contexts
        foreach ($number in $MAGIC_NUMBERS) {
            # Look for suspicious patterns like "latency = 50" or "memory: 100"
            if ($line -match "(latency|memory|heap|rss|time|duration|count|size)\s*[:=]\s*$number\b") {
                $violations += @{
                    Type = "MagicNumber"
                    Number = $number
                    Line = $line.Trim()
                }
            }
        }
    }
    
    return $violations
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
        
        # Check output for accuracy violations
        if ($EnableAccuracyCheck) {
            $outputText = $result -join "`n"
            $violations = Test-OutputForEstimates -Output $outputText
            if ($violations.Count -gt 0) {
                Write-Violation -Message "Found $($violations.Count) accuracy violations in ps output" -Context "ps aux command"
                foreach ($v in $violations) {
                    Write-Violation -Message "$($v.Type): $($v.Line)" -Context "Type: $($v.Type)"
                }
            }
        }
        
        # Parse ps output
        $lines = $result | Where-Object { 
            $_ -match "^\s*render\s+\d+.*\sSl\s+.*node\s+dist/index\.js" 
        }
        
        if ($lines) {
            $line = $lines | Select-Object -First 1
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
                    AccuracyViolations = if ($EnableAccuracyCheck) { $violations.Count } else { 0 }
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
            # Check output for accuracy violations
            if ($EnableAccuracyCheck) {
                $outputText = $result -join "`n"
                $violations = Test-OutputForEstimates -Output $outputText
                if ($violations.Count -gt 0) {
                    Write-Violation -Message "Found $($violations.Count) accuracy violations in /proc/status" -Context "/proc/*/status read"
                    foreach ($v in $violations) {
                        Write-Violation -Message "$($v.Type): $($v.Line)" -Context "Type: $($v.Type)"
                    }
                }
            }
            
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

function Export-MetricsToCSV {
    param(
        [int]$Iteration,
        [double]$ElapsedHours,
        [hashtable]$MemInfo,
        [hashtable]$Details,
        [double]$Delta,
        [double]$GrowthRate,
        [double]$MemoryUsagePercent,
        [string]$Status
    )
    
    $csvLine = "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')),$Iteration,$ElapsedHours,$($MemInfo.ProcessPID),$($MemInfo.RSS_MB),$($MemInfo.RSS_KB),$($MemInfo.VSZ),$($MemInfo.CPU_Percent),$($MemInfo.MEM_Percent),$($Details.VmRSS_KB),$($Details.Threads),$($Details.FDSize),$Delta,$GrowthRate,$MemoryUsagePercent,$Status,$($MemInfo.AccuracyViolations)"
    Add-Content -Path $csvFile -Value $csvLine
}

# Monitoring loop
$startTime = Get-Date
$endTime = $startTime.AddHours($DurationHours)
$intervalSeconds = $IntervalMinutes * 60
$iteration = 0

Write-Log "========================================"
Write-Log "Enhanced Memory Monitoring Started"
Write-Log "Service: $ServiceId"
Write-Log "Interval: $IntervalMinutes minutes"
Write-Log "Duration: $DurationHours hours"
Write-Log "End Time: $($endTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Log "Accuracy Check: $EnableAccuracyCheck"
Write-Log "CSV Export: $ExportCsv"
Write-Log "Log File: $logFile"
if ($ExportCsv) {
    Write-Log "CSV File: $csvFile"
}
if ($EnableAccuracyCheck) {
    Write-Log "Violations File: $violationsFile"
}
Write-Log "========================================"
Write-Log ""

$baseline = $null
$totalViolations = 0

while ((Get-Date) -lt $endTime) {
    $iteration++
    $elapsed = [math]::Round(((Get-Date) - $startTime).TotalHours, 2)
    
    Write-Log "--- Check #$iteration (Elapsed: ${elapsed}h) ---"
    
    # Get process memory
    $memInfo = Get-ProcessMemory -ServiceId $ServiceId
    
    if ($memInfo.Success) {
        Write-Log "PID: $($memInfo.ProcessPID) | RSS: $($memInfo.RSS_MB) MB ($($memInfo.RSS_KB) KB)"
        Write-Log "VSZ: $($memInfo.VSZ) KB | CPU: $($memInfo.CPU_Percent)%, MEM: $($memInfo.MEM_Percent)%"
        
        # Track violations
        if ($EnableAccuracyCheck -and $memInfo.AccuracyViolations -gt 0) {
            $totalViolations += $memInfo.AccuracyViolations
            Write-Log "⚠️ Accuracy Violations: $($memInfo.AccuracyViolations) in this check" "WARN"
        }
        
        # Calculate delta from baseline
        $delta = 0
        $growthRate = 0
        if ($null -eq $baseline) {
            $baseline = $memInfo.RSS_MB
            Write-Log "BASELINE SET: $baseline MB"
        }
        else {
            $delta = $memInfo.RSS_MB - $baseline
            $growthRate = if ($elapsed -gt 0) { [math]::Round($delta / $elapsed, 2) } else { 0 }
            Write-Log "Delta from baseline: $delta MB (Growth rate: $growthRate MB/hour)"
        }
        
        # Get detailed process info
        $details = Get-ProcessDetails -ServiceId $ServiceId
        if ($details.Success) {
            Write-Log "VmRSS: $($details.VmRSS_KB) KB | Threads: $($details.Threads) | FDs: $($details.FDSize)"
        }
        else {
            $details = @{ VmRSS_KB = 0; Threads = 0; FDSize = 0 }
        }
        
        # Status assessment
        $memoryUsagePercent = [math]::Round($memInfo.RSS_MB / 512 * 100, 1)
        $status = if ($memInfo.RSS_MB -ge 460) { "EMERGENCY" }
                  elseif ($memInfo.RSS_MB -ge 435) { "CRITICAL" }
                  elseif ($memInfo.RSS_MB -ge 384) { "WARNING" }
                  else { "HEALTHY" }
        
        $statusIcon = switch ($status) {
            "EMERGENCY" { "💀" }
            "CRITICAL" { "🚨" }
            "WARNING" { "⚠️" }
            "HEALTHY" { "✅" }
        }
        
        Write-Log "Status: $statusIcon $status ($($memInfo.RSS_MB) MB / 512 MB = $memoryUsagePercent%)"
        
        # Export to CSV
        if ($ExportCsv) {
            Export-MetricsToCSV -Iteration $iteration -ElapsedHours $elapsed -MemInfo $memInfo -Details $details -Delta $delta -GrowthRate $growthRate -MemoryUsagePercent $memoryUsagePercent -Status $status
        }
    }
    else {
        Write-Log "❌ Failed to get memory info: $($memInfo.Error)" "ERROR"
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
Write-Log "Enhanced Memory Monitoring Complete"
Write-Log "Duration: $DurationHours hours"
Write-Log "Total Checks: $iteration"
if ($baseline -and $memInfo.Success) {
    $totalGrowth = $memInfo.RSS_MB - $baseline
    $avgRate = [math]::Round($totalGrowth / $DurationHours, 2)
    Write-Log "Final RSS: $($memInfo.RSS_MB) MB"
    Write-Log "Total Growth: $totalGrowth MB"
    Write-Log "Average Rate: $avgRate MB/hour"
}
if ($EnableAccuracyCheck) {
    Write-Log "Total Accuracy Violations: $totalViolations"
    if ($totalViolations -eq 0) {
        Write-Log "✅ No accuracy violations detected - all metrics exact!" "INFO"
    }
    else {
        Write-Log "⚠️ $totalViolations accuracy violations detected - review $violationsFile" "WARN"
    }
}
if ($ExportCsv) {
    Write-Log "CSV Export: $csvFile"
}
Write-Log "Log File: $logFile"
Write-Log "========================================"

# Summary report
if ($ExportCsv) {
    Write-Log ""
    Write-Log "CSV Analysis Available:"
    Write-Log "  Import-Csv '$csvFile' | Select-Object Timestamp, RSS_MB, DeltaMB, Status"
    Write-Log "  Import-Csv '$csvFile' | Measure-Object -Property RSS_MB -Average -Minimum -Maximum"
    Write-Log "  Import-Csv '$csvFile' | Where-Object { [double]$_.GrowthRateMBPerHour -gt 5 }"
}
