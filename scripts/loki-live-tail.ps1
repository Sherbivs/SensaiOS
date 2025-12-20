# Loki Live Log Tailer - Saves production logs to local files
# Usage: .\scripts\loki-live-tail.ps1

param(
    [string]$LogDir = "Store\loki-logs",
    [int]$IntervalSeconds = 5,
    [string]$Query = '{job="infinity-gauntlet"}'
)

$ErrorActionPreference = "Stop"

# Create log directory
$LogDirPath = Join-Path $PSScriptRoot "..\$LogDir"
New-Item -ItemType Directory -Force -Path $LogDirPath | Out-Null

# Get date for filename
$Date = Get-Date -Format "yyyy-MM-dd"
$LogFile = Join-Path $LogDirPath "render-production-$Date.log"
$ErrorLogFile = Join-Path $LogDirPath "render-errors-$Date.log"
$BattleLogFile = Join-Path $LogDirPath "render-battles-$Date.log"

Write-Host "🔴 Live Log Tailer Started" -ForegroundColor Red
Write-Host "📂 Saving to: $LogDirPath" -ForegroundColor Yellow
Write-Host "🔄 Polling every $IntervalSeconds seconds" -ForegroundColor Cyan
Write-Host "⏹️  Press Ctrl+C to stop`n" -ForegroundColor Gray

# Track last timestamp to avoid duplicates
$LastTimestamp = [DateTimeOffset]::UtcNow.AddMinutes(-5).ToUnixTimeMilliseconds() * 1000000

while ($true) {
    try {
        # Query Loki for new logs since last poll
        $StartNs = $LastTimestamp
        $EndNs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000
        
        $Uri = "http://localhost:3100/loki/api/v1/query_range?query=$([uri]::EscapeDataString($Query))&start=$StartNs&end=$EndNs&limit=1000"
        
        $Response = Invoke-RestMethod -Uri $Uri -Method Get -ErrorAction SilentlyContinue
        
        if ($Response -and $Response.data -and $Response.data.result) {
            $EntryCount = 0
            $ErrorCount = 0
            $BattleCount = 0
            
            foreach ($stream in $Response.data.result) {
                $Labels = $stream.stream
                $Level = $Labels.level
                $Service = $Labels.service
                
                foreach ($entry in $stream.values) {
                    $Timestamp = [long]$entry[0]
                    $LogLine = $entry[1]
                    
                    # Parse JSON log line
                    try {
                        $LogObj = $LogLine | ConvertFrom-Json
                        $Message = $LogObj.message
                        $CorrelationId = $LogObj.correlationId
                        
                        # Format log entry
                        $FormattedTime = [DateTimeOffset]::FromUnixTimeMilliseconds($Timestamp / 1000000).ToString("yyyy-MM-dd HH:mm:ss.fff")
                        $FormattedLog = "[$FormattedTime] [$Level] [$Service] $Message"
                        
                        if ($CorrelationId) {
                            $FormattedLog += " (corr=$CorrelationId)"
                        }
                        
                        # Write to main log
                        Add-Content -Path $LogFile -Value $FormattedLog
                        $EntryCount++
                        
                        # Write errors to separate file
                        if ($Level -eq "error") {
                            Add-Content -Path $ErrorLogFile -Value $FormattedLog
                            $ErrorCount++
                            Write-Host "❌ $FormattedLog" -ForegroundColor Red
                        }
                        
                        # Write battles to separate file
                        if ($Service -eq "battle" -or $Message -match "battle|move|damage") {
                            Add-Content -Path $BattleLogFile -Value $FormattedLog
                            $BattleCount++
                            Write-Host "⚔️  $FormattedLog" -ForegroundColor Magenta
                        }
                        
                        # Update last timestamp
                        if ($Timestamp -gt $LastTimestamp) {
                            $LastTimestamp = $Timestamp
                        }
                        
                    } catch {
                        # Raw log line if not JSON
                        $FormattedTime = [DateTimeOffset]::FromUnixTimeMilliseconds($Timestamp / 1000000).ToString("yyyy-MM-dd HH:mm:ss.fff")
                        $FormattedLog = "[$FormattedTime] $LogLine"
                        Add-Content -Path $LogFile -Value $FormattedLog
                        $EntryCount++
                    }
                }
            }
            
            if ($EntryCount -gt 0) {
                Write-Host "📝 $EntryCount new logs ($ErrorCount errors, $BattleCount battles)" -ForegroundColor Green
            }
        }
        
    } catch {
        Write-Host "⚠️  Error querying Loki: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    Start-Sleep -Seconds $IntervalSeconds
}
