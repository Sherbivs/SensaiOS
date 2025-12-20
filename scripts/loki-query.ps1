<#
.SYNOPSIS
    Loki Query CLI - Query production logs from local Loki instance

.DESCRIPTION
    Provides easy access to common Loki queries for monitoring Infinity Gauntlet.
    
    Architecture: Render → ngrok → localhost:3100 (Loki) → This Script

.PARAMETER Query
    Predefined query name: all, errors, warnings, security, sweeps, dashboard, labels

.PARAMETER Custom
    Custom LogQL query string

.PARAMETER Hours
    Hours of logs to retrieve (default: 1)

.PARAMETER Limit
    Maximum number of log entries (default: 100)

.PARAMETER Raw
    Output raw JSON instead of formatted text

.EXAMPLE
    .\loki-query.ps1 -Query errors
    # Get all errors from the last hour

.EXAMPLE
    .\loki-query.ps1 -Query security -Hours 6
    # Get security-related logs from last 6 hours

.EXAMPLE
    .\loki-query.ps1 -Custom '{level="info"} |= "Sweep"' -Limit 50
    # Custom query with limit

.EXAMPLE
    .\loki-query.ps1 -Query labels
    # List all available labels and values
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet("all", "errors", "warnings", "critical", "security", "sweeps", "dashboard", "database", "labels", "stats", "help")]
    [string]$Query = "all",

    [Parameter()]
    [string]$Custom,

    [Parameter()]
    [int]$Hours = 1,

    [Parameter()]
    [int]$Limit = 100,

    [Parameter()]
    [switch]$Raw
)

# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

$LokiEndpoint = "http://localhost:3100"

# Predefined queries
$Queries = @{
    "all"       = '{job="infinity-gauntlet"}'
    "errors"    = '{level="error"}'
    "warnings"  = '{level="warn"}'
    "critical"  = '{level=~"error|warn"}'
    "security"  = '{level=~"success|detail|warn|error"} |~ "(?i)permission|role|security|sweep"'
    "sweeps"    = '{level="info"} |= "Sweep"'
    "dashboard" = '{level="info"} |= "Dashboard rendered"'
    "database"  = '{service="stats-logger"} |~ "(?i)database|prisma|postgres|connection"'
}

# ═══════════════════════════════════════════════════════════════════════════════
# Functions
# ═══════════════════════════════════════════════════════════════════════════════

function Test-LokiReady {
    try {
        $response = Invoke-RestMethod "$LokiEndpoint/ready" -TimeoutSec 5 -ErrorAction Stop
        return $response.Trim() -eq "ready"
    }
    catch {
        return $false
    }
}

function Get-LokiLabels {
    Write-Host "`n📊 AVAILABLE LOKI LABELS" -ForegroundColor Cyan
    Write-Host "═" * 50 -ForegroundColor DarkGray

    try {
        $labels = Invoke-RestMethod "$LokiEndpoint/loki/api/v1/labels" -ErrorAction Stop
        
        foreach ($label in $labels.data) {
            $values = Invoke-RestMethod "$LokiEndpoint/loki/api/v1/label/$label/values" -ErrorAction SilentlyContinue
            Write-Host "`n  $label" -ForegroundColor Yellow -NoNewline
            Write-Host " →" -ForegroundColor DarkGray -NoNewline
            Write-Host " $($values.data -join ', ')" -ForegroundColor White
        }
        Write-Host ""
    }
    catch {
        Write-Host "  ❌ Failed to fetch labels: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Get-LokiStats {
    Write-Host "`n📈 LOKI LOG STATISTICS (Last $Hours hour(s))" -ForegroundColor Cyan
    Write-Host "═" * 50 -ForegroundColor DarkGray

    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000
    $start = ([DateTimeOffset]::UtcNow.AddHours(-$Hours)).ToUnixTimeMilliseconds() * 1000000

    $levels = @("success", "info", "detail", "warn", "error")
    $total = 0

    foreach ($level in $levels) {
        $queryStr = '{level="' + $level + '"}'
        $query = [uri]::EscapeDataString($queryStr)
        try {
            $r = Invoke-RestMethod "$LokiEndpoint/loki/api/v1/query_range?query=$query&limit=5000&start=$start&end=$now" -ErrorAction Stop
            $count = ($r.data.result | ForEach-Object { $_.values.Count } | Measure-Object -Sum).Sum
            if ($null -eq $count) { $count = 0 }
            $total += $count

            $color = switch ($level) {
                "error"   { "Red" }
                "warn"    { "Yellow" }
                "success" { "Green" }
                "info"    { "Cyan" }
                "detail"  { "DarkGray" }
            }
            
            $bar = "█" * [math]::Min([math]::Max(1, [math]::Floor($count / 10)), 40)
            Write-Host "  $($level.PadRight(8))" -ForegroundColor $color -NoNewline
            Write-Host " │ " -ForegroundColor DarkGray -NoNewline
            Write-Host "$($count.ToString().PadLeft(6))" -ForegroundColor White -NoNewline
            Write-Host " │ $bar" -ForegroundColor $color
        }
        catch {
            Write-Host "  $($level.PadRight(8)) │ Error fetching" -ForegroundColor Red
        }
    }

    Write-Host "  ────────┼────────" -ForegroundColor DarkGray
    Write-Host "  TOTAL   │ " -ForegroundColor White -NoNewline
    Write-Host "$($total.ToString().PadLeft(6))" -ForegroundColor Yellow
    Write-Host ""
}

function Invoke-LokiQuery {
    param(
        [string]$QueryString,
        [int]$QueryLimit,
        [int]$QueryHours,
        [switch]$RawOutput
    )

    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000
    $start = ([DateTimeOffset]::UtcNow.AddHours(-$QueryHours)).ToUnixTimeMilliseconds() * 1000000
    $encoded = [uri]::EscapeDataString($QueryString)

    $url = "$LokiEndpoint/loki/api/v1/query_range?query=$encoded&limit=$QueryLimit&start=$start&end=$now"

    try {
        $response = Invoke-RestMethod $url -ErrorAction Stop

        if ($RawOutput) {
            return $response | ConvertTo-Json -Depth 10
        }

        $totalEntries = 0
        $streamCount = $response.data.result.Count

        Write-Host "`n📜 QUERY RESULTS" -ForegroundColor Cyan
        Write-Host "═" * 60 -ForegroundColor DarkGray
        Write-Host "  Query: " -NoNewline -ForegroundColor DarkGray
        Write-Host $QueryString -ForegroundColor Yellow
        Write-Host "  Range: Last $QueryHours hour(s) | Limit: $QueryLimit" -ForegroundColor DarkGray
        Write-Host "  Streams: $streamCount" -ForegroundColor DarkGray
        Write-Host "─" * 60 -ForegroundColor DarkGray

        foreach ($stream in $response.data.result) {
            $labels = $stream.stream
            $levelColor = switch ($labels.level) {
                "error"   { "Red" }
                "warn"    { "Yellow" }
                "success" { "Green" }
                "info"    { "Cyan" }
                "detail"  { "DarkGray" }
                default   { "White" }
            }

            foreach ($entry in $stream.values) {
                $totalEntries++
                $timestamp = [DateTimeOffset]::FromUnixTimeMilliseconds([long]($entry[0] / 1000000)).LocalDateTime.ToString("HH:mm:ss")
                $logLine = $entry[1]

                # Try to parse JSON
                try {
                    $parsed = $logLine | ConvertFrom-Json -ErrorAction Stop
                    $message = $parsed.message
                }
                catch {
                    $message = $logLine
                }

                # Truncate long messages
                if ($message.Length -gt 80) {
                    $message = $message.Substring(0, 77) + "..."
                }

                Write-Host "  [$timestamp] " -NoNewline -ForegroundColor DarkGray
                Write-Host "[$($labels.level.ToUpper().PadRight(7))]" -NoNewline -ForegroundColor $levelColor
                Write-Host " $message" -ForegroundColor White
            }
        }

        Write-Host "─" * 60 -ForegroundColor DarkGray
        Write-Host "  Total entries: $totalEntries" -ForegroundColor DarkGray
        Write-Host ""
    }
    catch {
        Write-Host "  ❌ Query failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  URL: $url" -ForegroundColor DarkGray
    }
}

function Show-Help {
    Write-Host "`n🔍 LOKI QUERY CLI" -ForegroundColor Cyan
    Write-Host "═" * 50 -ForegroundColor DarkGray
    Write-Host "
  PREDEFINED QUERIES:
    all        All production logs
    errors     Error-level logs only
    warnings   Warning-level logs only
    critical   Errors + Warnings combined
    security   Security/permission-related logs
    sweeps     Security bot sweep activity
    dashboard  Dashboard render events
    database   Database-related logs
    labels     List available labels/values
    stats      Log statistics by level

  EXAMPLES:
    .\loki-query.ps1 errors                    # Last hour of errors
    .\loki-query.ps1 security -Hours 6         # 6 hours of security logs
    .\loki-query.ps1 -Custom '{level=`"info`"}'  # Custom query
    .\loki-query.ps1 stats -Hours 24           # 24-hour statistics
    .\loki-query.ps1 labels                    # Show all labels

  FLAGS:
    -Hours <n>    Time range in hours (default: 1)
    -Limit <n>    Max entries to return (default: 100)
    -Raw          Output raw JSON
" -ForegroundColor White
}

# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "🔮 Loki Query CLI — Infinity Gauntlet" -ForegroundColor Magenta

# Check Loki readiness
if (-not (Test-LokiReady)) {
    Write-Host "`n  ❌ Loki is not ready at $LokiEndpoint" -ForegroundColor Red
    Write-Host "  Check: Docker containers running? ngrok tunnel active?" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "  ✅ Loki ready at $LokiEndpoint" -ForegroundColor Green

# Handle special queries
if ($Query -eq "help") {
    Show-Help
    exit 0
}

if ($Query -eq "labels") {
    Get-LokiLabels
    exit 0
}

if ($Query -eq "stats") {
    Get-LokiStats
    exit 0
}

# Execute query
if ($Custom) {
    Invoke-LokiQuery -QueryString $Custom -QueryLimit $Limit -QueryHours $Hours -RawOutput:$Raw
}
else {
    $queryString = $Queries[$Query]
    if ($queryString) {
        Invoke-LokiQuery -QueryString $queryString -QueryLimit $Limit -QueryHours $Hours -RawOutput:$Raw
    }
    else {
        Write-Host "  ❌ Unknown query: $Query" -ForegroundColor Red
        Show-Help
    }
}
