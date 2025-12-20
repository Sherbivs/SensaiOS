# Watch Loki Integration - Monitor for first logs
# Usage: pwsh -File scripts/watch-loki-integration.ps1

param(
    [int]$CheckInterval = 10,  # Seconds between checks
    [int]$MaxWait = 300        # Maximum seconds to wait (5 minutes)
)

$elapsed = 0
$deployId = "dep-d53egiili9vc73af47u0"

Write-Host "`n🔍 Watching for Loki Integration..." -ForegroundColor Cyan
Write-Host "Deploy ID: $deployId" -ForegroundColor Gray
Write-Host "Checking every $CheckInterval seconds (max $MaxWait seconds)`n" -ForegroundColor Gray

while ($elapsed -lt $MaxWait) {
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] Checking... " -NoNewline -ForegroundColor Gray
    
    # Check 1: Loki has logs
    try {
        $lokiQuery = "http://localhost:3100/loki/api/v1/query_range"
        $start = ([DateTimeOffset]::UtcNow.AddMinutes(-10)).ToUnixTimeSeconds()
        $end = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $query = '{service=~".+"}'
        
        $response = Invoke-RestMethod -Uri $lokiQuery `
            -Method Get `
            -Body @{
                query = $query
                start = "${start}000000000"
                end = "${end}000000000"
            } -ErrorAction SilentlyContinue
        
        $logCount = ($response.data.result | Measure-Object).Count
        
        if ($logCount -gt 0) {
            Write-Host "✅ SUCCESS!" -ForegroundColor Green
            Write-Host "`n🎉 Logs detected in Loki!" -ForegroundColor Green
            Write-Host "   Total streams: $logCount" -ForegroundColor White
            Write-Host "`n📊 Next steps:" -ForegroundColor Cyan
            Write-Host "   1. Open Grafana: http://localhost:3000" -ForegroundColor White
            Write-Host "   2. Query: {service=`"stats-logger`"}" -ForegroundColor White
            Write-Host "   3. Check Store/loki-logs/ for saved logs`n" -ForegroundColor White
            exit 0
        }
        
        Write-Host "⏳ No logs yet (checked $logCount streams)" -ForegroundColor Yellow
        
    } catch {
        Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Check 2: Deployment status
    try {
        $apiKey = (Get-Content secrets/Infinity-Gauntlet.env | Select-String "RENDER_API_KEY" | ForEach-Object { $_.ToString().Split('=')[1].Trim() })
        $headers = @{ Authorization = "Bearer $apiKey" }
        $deploy = Invoke-RestMethod -Uri "https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g/deploys/$deployId" -Headers $headers -ErrorAction SilentlyContinue
        
        $status = $deploy.deploy.status
        if ($status -eq "live") {
            Write-Host " | Deploy: ✅ LIVE" -ForegroundColor Green
        } elseif ($status -eq "build_failed" -or $status -eq "canceled") {
            Write-Host " | Deploy: ❌ $status" -ForegroundColor Red
            Write-Host "`n⚠️  Deployment failed. Check Render dashboard." -ForegroundColor Yellow
            exit 1
        } else {
            Write-Host " | Deploy: 🔄 $status" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host " | Deploy: ❓ Unknown" -ForegroundColor Gray
    }
    
    Start-Sleep -Seconds $CheckInterval
    $elapsed += $CheckInterval
}

Write-Host "`n⏰ Timeout reached ($MaxWait seconds)" -ForegroundColor Yellow
Write-Host "Logs may still be propagating. Manual check:" -ForegroundColor Gray
Write-Host "  curl http://localhost:3100/loki/api/v1/labels`n" -ForegroundColor White
exit 2
