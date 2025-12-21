<#
.SYNOPSIS
    ngrok Watchdog - Auto-restart ngrok tunnel with health monitoring
    
.DESCRIPTION
    Monitors ngrok tunnel health and automatically restarts if down.
    Designed for Loki log ingestion pipeline reliability.
    
.PARAMETER Port
    Local port to tunnel (default: 3100 for Loki)
    
.PARAMETER CheckInterval
    Seconds between health checks (default: 30)
    
.PARAMETER MaxRestarts
    Maximum restarts before alerting (default: 5)
    
.EXAMPLE
    .\ngrok-watchdog.ps1
    .\ngrok-watchdog.ps1 -Port 3100 -CheckInterval 60
    
.NOTES
    Created: 2025-12-21
    Part of: Infinity Gauntlet Observability Pipeline
#>

param(
    [int]$Port = 3100,
    [int]$CheckInterval = 30,
    [int]$MaxRestarts = 5,
    [switch]$Verbose
)

# ============================================================================
# Configuration
# ============================================================================

$script:NgrokPath = "$env:LOCALAPPDATA\ngrok\ngrok.exe"
$script:NgrokApiUrl = "http://localhost:4040/api/tunnels"
$script:RestartCount = 0
$script:LastRestartTime = $null
$script:StartTime = Get-Date

# ============================================================================
# Helper Functions
# ============================================================================

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "INFO"    { "White" }
        "SUCCESS" { "Green" }
        "WARNING" { "Yellow" }
        "ERROR"   { "Red" }
        default   { "White" }
    }
    
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Test-NgrokHealth {
    <#
    .SYNOPSIS
        Check if ngrok tunnel is healthy
    #>
    try {
        $response = Invoke-RestMethod -Uri $script:NgrokApiUrl -TimeoutSec 5 -ErrorAction Stop
        
        if ($response.tunnels -and $response.tunnels.Count -gt 0) {
            $tunnel = $response.tunnels[0]
            return @{
                Healthy = $true
                PublicUrl = $tunnel.public_url
                Connections = $tunnel.metrics.conns.count
                Proto = $tunnel.proto
            }
        }
        
        return @{ Healthy = $false; Reason = "No active tunnels" }
    }
    catch {
        return @{ Healthy = $false; Reason = $_.Exception.Message }
    }
}

function Test-LokiHealth {
    <#
    .SYNOPSIS
        Check if local Loki is healthy
    #>
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$Port/ready" -TimeoutSec 5 -ErrorAction Stop
        return @{ Healthy = ($response -eq "ready"); Status = $response }
    }
    catch {
        return @{ Healthy = $false; Reason = $_.Exception.Message }
    }
}

function Stop-Ngrok {
    <#
    .SYNOPSIS
        Stop any running ngrok processes
    #>
    $processes = Get-Process -Name "ngrok" -ErrorAction SilentlyContinue
    if ($processes) {
        Write-Log "Stopping $($processes.Count) ngrok process(es)..." "WARNING"
        $processes | Stop-Process -Force
        Start-Sleep -Seconds 2
    }
}

function Start-Ngrok {
    <#
    .SYNOPSIS
        Start ngrok tunnel
    #>
    param([int]$TargetPort)
    
    Write-Log "Starting ngrok tunnel for port $TargetPort..." "INFO"
    
    # Verify ngrok exists
    if (-not (Test-Path $script:NgrokPath)) {
        Write-Log "ngrok not found at: $script:NgrokPath" "ERROR"
        Write-Log "Install with: winget install ngrok.ngrok" "INFO"
        return $false
    }
    
    # Start ngrok
    try {
        Start-Process -FilePath $script:NgrokPath -ArgumentList "http", $TargetPort -WindowStyle Hidden
        Start-Sleep -Seconds 3
        
        # Verify startup
        $health = Test-NgrokHealth
        if ($health.Healthy) {
            Write-Log "ngrok started successfully: $($health.PublicUrl)" "SUCCESS"
            return $true
        }
        else {
            Write-Log "ngrok started but tunnel not healthy: $($health.Reason)" "WARNING"
            return $false
        }
    }
    catch {
        Write-Log "Failed to start ngrok: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Restart-Ngrok {
    <#
    .SYNOPSIS
        Restart ngrok tunnel with tracking
    #>
    $script:RestartCount++
    $script:LastRestartTime = Get-Date
    
    Write-Log "Restart attempt #$($script:RestartCount)..." "WARNING"
    
    Stop-Ngrok
    $success = Start-Ngrok -TargetPort $Port
    
    if (-not $success) {
        Write-Log "Restart failed!" "ERROR"
    }
    
    return $success
}

function Show-Status {
    <#
    .SYNOPSIS
        Display current watchdog status
    #>
    $uptime = (Get-Date) - $script:StartTime
    $ngrokHealth = Test-NgrokHealth
    $lokiHealth = Test-LokiHealth
    
    Write-Host "`n" -NoNewline
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  ngrok Watchdog Status" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    
    Write-Host "  Uptime:          " -NoNewline; Write-Host "$($uptime.ToString('hh\:mm\:ss'))" -ForegroundColor White
    Write-Host "  Check Interval:  " -NoNewline; Write-Host "${CheckInterval}s" -ForegroundColor White
    Write-Host "  Restarts:        " -NoNewline; Write-Host "$($script:RestartCount)" -ForegroundColor $(if ($script:RestartCount -gt 0) { "Yellow" } else { "Green" })
    Write-Host ""
    
    # ngrok status
    Write-Host "  ngrok Tunnel:    " -NoNewline
    if ($ngrokHealth.Healthy) {
        Write-Host "✅ Healthy" -ForegroundColor Green
        Write-Host "  Public URL:      " -NoNewline; Write-Host "$($ngrokHealth.PublicUrl)" -ForegroundColor Cyan
        Write-Host "  Connections:     " -NoNewline; Write-Host "$($ngrokHealth.Connections)" -ForegroundColor White
    }
    else {
        Write-Host "❌ Unhealthy" -ForegroundColor Red
        Write-Host "  Reason:          " -NoNewline; Write-Host "$($ngrokHealth.Reason)" -ForegroundColor Yellow
    }
    Write-Host ""
    
    # Loki status
    Write-Host "  Loki (port $Port): " -NoNewline
    if ($lokiHealth.Healthy) {
        Write-Host "✅ Ready" -ForegroundColor Green
    }
    else {
        Write-Host "❌ Not Ready" -ForegroundColor Red
        Write-Host "  Reason:          " -NoNewline; Write-Host "$($lokiHealth.Reason)" -ForegroundColor Yellow
    }
    
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

# ============================================================================
# Main Watchdog Loop
# ============================================================================

function Start-Watchdog {
    Write-Host ""
    Write-Host "🐕 ngrok Watchdog Starting..." -ForegroundColor Cyan
    Write-Host "   Port: $Port | Check Interval: ${CheckInterval}s | Max Restarts: $MaxRestarts" -ForegroundColor Gray
    Write-Host "   Press Ctrl+C to stop" -ForegroundColor Gray
    Write-Host ""
    
    # Initial health check
    $health = Test-NgrokHealth
    if (-not $health.Healthy) {
        Write-Log "ngrok not running, starting..." "WARNING"
        Start-Ngrok -TargetPort $Port
    }
    else {
        Write-Log "ngrok already running: $($health.PublicUrl)" "SUCCESS"
    }
    
    # Watchdog loop
    try {
        while ($true) {
            Start-Sleep -Seconds $CheckInterval
            
            $health = Test-NgrokHealth
            
            if (-not $health.Healthy) {
                Write-Log "ngrok tunnel down! Reason: $($health.Reason)" "ERROR"
                
                if ($script:RestartCount -ge $MaxRestarts) {
                    Write-Log "Max restarts ($MaxRestarts) reached! Manual intervention required." "ERROR"
                    Show-Status
                    
                    # Wait longer before trying again
                    Write-Log "Waiting 5 minutes before next attempt..." "WARNING"
                    Start-Sleep -Seconds 300
                    $script:RestartCount = 0  # Reset after cooldown
                }
                
                Restart-Ngrok
            }
            else {
                if ($Verbose) {
                    Write-Log "Health check passed: $($health.PublicUrl)" "INFO"
                }
            }
        }
    }
    catch {
        Write-Log "Watchdog error: $($_.Exception.Message)" "ERROR"
    }
    finally {
        Write-Log "Watchdog stopped" "WARNING"
    }
}

# ============================================================================
# Entry Point
# ============================================================================

# Show initial status
Show-Status

# Start watchdog
Start-Watchdog
