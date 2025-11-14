# Directory Growth Monitor
# Monitors specified directories for size changes over time
# Usage: .\monitor_directory_growth.ps1 -DurationMinutes 10 -IntervalSeconds 30

param(
    [int]$DurationMinutes = 5,
    [int]$IntervalSeconds = 30,
    [string]$BaseDir = "./Store"
)

$EndTime = (Get-Date).AddMinutes($DurationMinutes)
$LogFile = "Store/directory-growth-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"

# Directories to monitor
$DirsToMonitor = @(
    "$BaseDir/logs",
    "$BaseDir/error-reports",
    "$BaseDir/emergency-error-logs",
    "$BaseDir/ai-logs",
    "$BaseDir/onpremise-dev-primary",
    "$BaseDir/db-experiment",
    "$BaseDir/runtime-cache",
    "$BaseDir/discord-cache"
)

function Get-DirectorySize {
    param([string]$Path)
    
    if (!(Test-Path $Path)) {
        return @{
            SizeMB = 0
            Files = 0
            Exists = $false
        }
    }
    
    $items = Get-ChildItem -Path $Path -Recurse -File -ErrorAction SilentlyContinue
    $totalSize = ($items | Measure-Object -Property Length -Sum).Sum
    
    return @{
        SizeMB = [math]::Round($totalSize / 1MB, 2)
        Files = $items.Count
        Exists = $true
    }
}

Write-Host "🔍 Directory Growth Monitor" -ForegroundColor Cyan
Write-Host "Duration: $DurationMinutes minutes" -ForegroundColor Gray
Write-Host "Interval: $IntervalSeconds seconds" -ForegroundColor Gray
Write-Host "Logging to: $LogFile" -ForegroundColor Gray
Write-Host ""

# Initial snapshot
$Baseline = @{}
foreach ($dir in $DirsToMonitor) {
    $Baseline[$dir] = Get-DirectorySize -Path $dir
}

# Header
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LogFile -Value "Directory Growth Monitor - Started at $timestamp"
Add-Content -Path $LogFile -Value "=" * 80
Add-Content -Path $LogFile -Value ""

# Monitoring loop
$iteration = 0
while ((Get-Date) -lt $EndTime) {
    $iteration++
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    Write-Host "[$timestamp] Snapshot $iteration" -ForegroundColor Yellow
    Add-Content -Path $LogFile -Value "[$timestamp] Snapshot $iteration"
    
    foreach ($dir in $DirsToMonitor) {
        $current = Get-DirectorySize -Path $dir
        $baseline = $Baseline[$dir]
        
        if (!$current.Exists) {
            Write-Host "  $dir : NOT FOUND" -ForegroundColor DarkGray
            continue
        }
        
        $sizeDelta = $current.SizeMB - $baseline.SizeMB
        $filesDelta = $current.Files - $baseline.Files
        
        $color = "White"
        $indicator = "→"
        
        if ($sizeDelta -gt 0.1) {
            $color = "Red"
            $indicator = "↑"
        } elseif ($sizeDelta -lt -0.1) {
            $color = "Green"
            $indicator = "↓"
        }
        
        $message = "  {0,-40} {1} {2,8:F2} MB ({3,+6:F2}) | {4,5} files ({5,+4})" -f `
            $dir, $indicator, $current.SizeMB, $sizeDelta, $current.Files, $filesDelta
        
        Write-Host $message -ForegroundColor $color
        Add-Content -Path $LogFile -Value $message
    }
    
    Write-Host ""
    Add-Content -Path $LogFile -Value ""
    
    if ((Get-Date) -lt $EndTime) {
        Start-Sleep -Seconds $IntervalSeconds
    }
}

# Final summary
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "📊 Growth Summary" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan

Add-Content -Path $LogFile -Value "=" * 80
Add-Content -Path $LogFile -Value "Growth Summary"
Add-Content -Path $LogFile -Value "=" * 80

foreach ($dir in $DirsToMonitor) {
    $current = Get-DirectorySize -Path $dir
    $baseline = $Baseline[$dir]
    
    if (!$current.Exists) { continue }
    
    $sizeDelta = $current.SizeMB - $baseline.SizeMB
    $filesDelta = $current.Files - $baseline.Files
    
    if ([math]::Abs($sizeDelta) -gt 0.01 -or $filesDelta -ne 0) {
        $message = "{0,-40} Size: {1,+8:F2} MB | Files: {2,+5}" -f $dir, $sizeDelta, $filesDelta
        
        if ($sizeDelta -gt 0.5) {
            Write-Host $message -ForegroundColor Red
        } elseif ($sizeDelta -gt 0.1) {
            Write-Host $message -ForegroundColor Yellow
        } else {
            Write-Host $message -ForegroundColor Gray
        }
        
        Add-Content -Path $LogFile -Value $message
    }
}

Write-Host ""
Write-Host "Log saved to: $LogFile" -ForegroundColor Green
