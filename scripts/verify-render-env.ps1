#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Verify LOKI_ENDPOINT is actually loaded in Render production environment
.DESCRIPTION
    Uses Render SSH to check if LOKI_ENDPOINT environment variable is present
    in the running process. This is the definitive test.
#>

param(
    [string]$ServiceId = "srv-d3snk2ndiees73cn709g"
)

Write-Host "`n🔬 RENDER ENVIRONMENT VERIFICATION" -ForegroundColor Cyan
Write-Host "=" * 70

Write-Host "`nConnecting to Render via SSH to check environment variables..." -ForegroundColor Yellow
Write-Host "Service ID: $ServiceId" -ForegroundColor Gray

# Check if WSL is available
$wslAvailable = Get-Command wsl -ErrorAction SilentlyContinue

if (-not $wslAvailable) {
    Write-Host "`n❌ WSL not available. Cannot use Render SSH." -ForegroundColor Red
    Write-Host "`nAlternative: Check Render Dashboard manually:" -ForegroundColor Yellow
    Write-Host "1. Open: https://dashboard.render.com/services/$ServiceId/env" -ForegroundColor White
    Write-Host "2. Verify LOKI_ENDPOINT exists and contains the ngrok URL" -ForegroundColor White
    Write-Host "3. Click 'Restart Service' to force reload of environment variables" -ForegroundColor White
    exit 1
}

Write-Host "`n📡 Executing remote command via SSH..." -ForegroundColor Cyan
Write-Host "Command: printenv | grep -i loki" -ForegroundColor Gray

try {
    # Execute remote command to check for LOKI_ENDPOINT
    $output = wsl bash -c "ssh render-virginia 'printenv | grep -i loki'" 2>&1
    
    if ($LASTEXITCODE -eq 0 -and $output) {
        Write-Host "`n✅ LOKI_ENDPOINT found in process environment:" -ForegroundColor Green
        Write-Host $output -ForegroundColor White
    } else {
        Write-Host "`n❌ LOKI_ENDPOINT NOT FOUND in process environment" -ForegroundColor Red
        Write-Host "`nThis explains why the Loki transport isn't initializing!" -ForegroundColor Yellow
        Write-Host "`n🔧 SOLUTION:" -ForegroundColor Cyan
        Write-Host "1. Go to Render Dashboard Environment Variables" -ForegroundColor White
        Write-Host "2. Verify LOKI_ENDPOINT is set correctly" -ForegroundColor White
        Write-Host "3. Click 'Save' to trigger automatic redeploy" -ForegroundColor White
        Write-Host "4. Wait for deployment to complete (~3-5 minutes)" -ForegroundColor White
    }
} catch {
    Write-Host "`n⚠️ SSH connection failed: $_" -ForegroundColor Yellow
    Write-Host "`nFalling back to manual verification instructions..." -ForegroundColor Gray
}

Write-Host "`n📋 MANUAL VERIFICATION STEPS:" -ForegroundColor Cyan
Write-Host "1. Open Render Dashboard: https://dashboard.render.com/services/$ServiceId" -ForegroundColor White
Write-Host "2. Click 'Environment' tab" -ForegroundColor White
Write-Host "3. Find LOKI_ENDPOINT variable" -ForegroundColor White
Write-Host "4. If missing or incorrect, add/fix it" -ForegroundColor White
Write-Host "5. Click 'Save' (this triggers redeploy automatically)" -ForegroundColor White
Write-Host ""
