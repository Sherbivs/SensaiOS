# Verify and Fix Loki Integration on Render
# This script checks environment variables and triggers redeploy if needed

param(
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

# Load API key
$apiKey = (Get-Content secrets/Infinity-Gauntlet.env | Select-String "RENDER_API_KEY" | ForEach-Object { $_.ToString().Split('=')[1].Trim() })
$headers = @{ Authorization = "Bearer $apiKey" }
$serviceId = "srv-d3snk2ndiees73cn709g"

Write-Host "`n🔍 Checking Loki Integration Status..." -ForegroundColor Cyan
Write-Host "=" -NoNewline; for ($i=0; $i -lt 60; $i++) { Write-Host "=" -NoNewline }
Write-Host "`n"

# Step 1: Check environment variables
Write-Host "1️⃣  Checking LOKI_ENDPOINT environment variable..." -ForegroundColor Yellow
try {
    $envVarsResponse = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId/env-vars" -Headers $headers
    $lokiVar = $envVarsResponse | Where-Object { $_.envVar.key -eq 'LOKI_ENDPOINT' }
    
    if ($lokiVar) {
        Write-Host "   ✅ LOKI_ENDPOINT is SET" -ForegroundColor Green
        Write-Host "   Value: $($lokiVar.envVar.value)" -ForegroundColor Gray
    } else {
        Write-Host "   ❌ LOKI_ENDPOINT is NOT SET!" -ForegroundColor Red
        Write-Host "`n   This is the problem! Environment variable doesn't exist in Render." -ForegroundColor Yellow
        Write-Host "   Go to: https://dashboard.render.com/services/$serviceId" -ForegroundColor White
        Write-Host "   1. Click 'Environment' tab" -ForegroundColor White
        Write-Host "   2. Add: LOKI_ENDPOINT = https://unlifelike-nonbotanically-chante.ngrok-free.dev" -ForegroundColor White
        Write-Host "   3. Save (will trigger automatic redeploy)`n" -ForegroundColor White
        exit 1
    }
} catch {
    Write-Host "   ⚠️  Could not check environment variables: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 2: Check current deployment
Write-Host "`n2️⃣  Checking current deployment..." -ForegroundColor Yellow
try {
    $deploys = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId/deploys" -Headers $headers
    $latest = $deploys | Where-Object { $_.deploy.status -eq 'live' } | Select-Object -First 1
    
    if ($latest) {
        $commit = $latest.deploy.commit.id.Substring(0,8)
        Write-Host "   Current commit: $commit" -ForegroundColor Gray
        
        # Check if it's our Loki commit
        if ($commit -eq "c8706c79" -or $commit -eq "5c9d0117") {
            Write-Host "   ✅ Loki integration code IS deployed" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Loki integration code NOT deployed!" -ForegroundColor Red
            Write-Host "   Expected: c8706c79 (stats logger + DB logger)" -ForegroundColor Gray
            Write-Host "   Actual: $commit" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ⚠️  No live deployment found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Could not check deployment: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 3: Check if ngrok tunnel is still valid
Write-Host "`n3️⃣  Checking ngrok tunnel..." -ForegroundColor Yellow
try {
    $tunnel = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels"
    $publicUrl = $tunnel.tunnels[0].public_url
    Write-Host "   Current tunnel: $publicUrl" -ForegroundColor Gray
    
    if ($lokiVar -and $lokiVar.envVar.value -ne $publicUrl) {
        Write-Host "   ⚠️  MISMATCH!" -ForegroundColor Red
        Write-Host "   Render has: $($lokiVar.envVar.value)" -ForegroundColor Gray
        Write-Host "   ngrok has: $publicUrl" -ForegroundColor Gray
        Write-Host "`n   ngrok tunnel changed! Update LOKI_ENDPOINT in Render." -ForegroundColor Yellow
    } else {
        Write-Host "   ✅ Tunnel matches Render configuration" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  Could not check ngrok: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 4: Recommend action
Write-Host "`n" -NoNewline
Write-Host "=" -NoNewline; for ($i=0; $i -lt 60; $i++) { Write-Host "=" -NoNewline }
Write-Host ""
Write-Host "📋 RECOMMENDATION:" -ForegroundColor Cyan

if ($CheckOnly) {
    Write-Host "   Check complete. Use -CheckOnly:`$false to trigger redeploy." -ForegroundColor Gray
} else {
    Write-Host "`n   If LOKI_ENDPOINT is set correctly above, the issue is:" -ForegroundColor Yellow
    Write-Host "   The environment variable was added AFTER the last deployment," -ForegroundColor Gray
    Write-Host "   so the running service doesn't have it loaded yet.`n" -ForegroundColor Gray
    
    Write-Host "   💡 SOLUTION: Trigger a redeploy to load the new environment variable" -ForegroundColor Cyan
    Write-Host "`n   Option 1: Manual (Dashboard)" -ForegroundColor White
    Write-Host "     https://dashboard.render.com/services/$serviceId" -ForegroundColor Gray
    Write-Host "     Click 'Manual Deploy' button`n" -ForegroundColor Gray
    
    Write-Host "   Option 2: Automatic (Script)" -ForegroundColor White
    Write-Host "     pwsh -File scripts/render_deploy.ps1 -Service Infinity-Gauntlet`n" -ForegroundColor Gray
    
    $response = Read-Host "   Trigger redeploy now? (y/n)"
    if ($response -eq 'y') {
        Write-Host "`n   🚀 Triggering deployment..." -ForegroundColor Cyan
        $deployPayload = @{
            clearCache = "do_not_clear"
        } | ConvertTo-Json
        
        try {
            $newDeploy = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId/deploys" `
                -Method Post `
                -Headers $headers `
                -ContentType "application/json" `
                -Body $deployPayload
            
            Write-Host "   ✅ Deployment triggered!" -ForegroundColor Green
            Write-Host "   Deploy ID: $($newDeploy.id)" -ForegroundColor Gray
            Write-Host "   Dashboard: https://dashboard.render.com/services/$serviceId`n" -ForegroundColor Gray
        } catch {
            Write-Host "   ❌ Failed to trigger deployment: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host ""
