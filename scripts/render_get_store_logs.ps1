<#
.SYNOPSIS
    Retrieve log files from /Store directory on Render service

.DESCRIPTION
    Uses Render Shell API to list and retrieve log files from /Store directory.
    Supports various log locations: restart metrics, security bot state, cache logs, etc.

.PARAMETER ServiceId
    Render service ID (default: srv-d3snk2ndiees73cn709g - main bot)

.PARAMETER LogPath
    Path to log file or directory in /Store (default: list all)
    Examples:
    - "/Store/restart-metrics.json"
    - "/Store/security-bot-state/current.json"
    - "/Store/runtime-cache/"

.PARAMETER OutputFile
    Local file to save the log contents (optional)

.EXAMPLE
    .\render_get_store_logs.ps1
    List all files in /Store directory

.EXAMPLE
    .\render_get_store_logs.ps1 -LogPath "/Store/restart-metrics.json"
    Retrieve restart metrics log

.EXAMPLE
    .\render_get_store_logs.ps1 -LogPath "/Store/security-bot-state/current.json" -OutputFile "security-state.json"
    Download security bot state to local file
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ServiceId = "srv-d3snk2ndiees73cn709g",
    
    [Parameter(Mandatory=$false)]
    [string]$LogPath = "",
    
    [Parameter(Mandatory=$false)]
    [string]$OutputFile = ""
)

# Load environment variables from secrets file
$possibleEnvFiles = @(
    "secrets/Infinity-Gauntlet.env",
    "C:\Users\sherb\OneDrive\Documents\Key\Dev\.env"
)

$envFile = $possibleEnvFiles | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*?)\s*=\s*(.+?)\s*$') {
            $key = $matches[1]
            $value = $matches[2]
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
}

$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) {
    Write-Host "❌ Error: RENDER_API_KEY not found in environment" -ForegroundColor Red
    Write-Host "   Searched locations:" -ForegroundColor Yellow
    Write-Host "   - secrets/Infinity-Gauntlet.env" -ForegroundColor White
    Write-Host "   - C:\Users\sherb\OneDrive\Documents\Key\Dev\.env" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "📂 Render Store Logs Retrieval" -ForegroundColor Cyan
Write-Host "=" * 80
Write-Host ""

# Determine command to run
$command = if ($LogPath) {
    if ($LogPath.EndsWith("/")) {
        "ls -lah $LogPath"
    } else {
        "cat $LogPath"
    }
} else {
    "ls -lah /Store/"
}

Write-Host "🚀 Executing command..." -ForegroundColor Green
Write-Host "   Service: $ServiceId" -ForegroundColor White
Write-Host "   Command: $command" -ForegroundColor White
Write-Host ""

# Execute command via Render Shell API
$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Content-Type" = "application/json"
}

$body = @{
    command = $command
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId/shell" -Method Post -Headers $headers -Body $body
    
    # Parse response
    if ($response.output) {
        Write-Host "📤 Output:" -ForegroundColor Green
        Write-Host "=" * 80
        Write-Host $response.output
        Write-Host "=" * 80
        
        # Save to file if requested
        if ($OutputFile -and $LogPath -and -not $LogPath.EndsWith("/")) {
            $response.output | Out-File -FilePath $OutputFile -Encoding UTF8
            Write-Host ""
            Write-Host "💾 Saved to: $OutputFile" -ForegroundColor Green
        }
    }
    
    if ($response.stderr) {
        Write-Host ""
        Write-Host "⚠️  Errors:" -ForegroundColor Yellow
        Write-Host "=" * 80
        Write-Host $response.stderr
        Write-Host "=" * 80
    }
    
    Write-Host ""
    Write-Host "✅ Command completed successfully" -ForegroundColor Green
    
} catch {
    Write-Host "❌ Error executing command" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Yellow
    
    if ($_.ErrorDetails.Message) {
        $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "   API Error: $($errorDetails.message)" -ForegroundColor Yellow
    }
    
    exit 1
}

Write-Host ""
Write-Host "=" * 80
Write-Host ""

# Show common log locations
if (-not $LogPath) {
    Write-Host "📋 Common Log Locations:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   Restart Metrics:" -ForegroundColor Yellow
    Write-Host "   pwsh -File scripts/render_get_store_logs.ps1 -LogPath '/Store/restart-metrics.json'" -ForegroundColor White
    Write-Host ""
    Write-Host "   Security Bot State:" -ForegroundColor Yellow
    Write-Host "   pwsh -File scripts/render_get_store_logs.ps1 -LogPath '/Store/security-bot-state/current.json'" -ForegroundColor White
    Write-Host ""
    Write-Host "   Runtime Cache:" -ForegroundColor Yellow
    Write-Host "   pwsh -File scripts/render_get_store_logs.ps1 -LogPath '/Store/runtime-cache/'" -ForegroundColor White
    Write-Host ""
    Write-Host "   Discord Cache:" -ForegroundColor Yellow
    Write-Host "   pwsh -File scripts/render_get_store_logs.ps1 -LogPath '/Store/discord-cache/'" -ForegroundColor White
    Write-Host ""
}
