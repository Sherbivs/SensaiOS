# Render API - View Recent Deploys
param(
    [Parameter(Mandatory=$true)]
    [string]$Service
)

# Load environment
$envFile = "secrets/Infinity-Gauntlet.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) {
    Write-Host "RENDER_API_KEY not found. Add it to secrets/Infinity-Gauntlet.env" -ForegroundColor Red
    exit 1
}

Write-Host "Fetching recent deploys for $Service..." -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Accept" = "application/json"
}

try {
    # Get service ID
    $services = Invoke-RestMethod -Uri "https://api.render.com/v1/services" -Headers $headers
    $targetService = $services | Where-Object { $_.service.name -eq $Service } | Select-Object -First 1
    
    if (-not $targetService) {
        Write-Host "Service '$Service' not found" -ForegroundColor Red
        exit 1
    }
    
    $serviceId = $targetService.service.id
    
    # Get deploys
    $deploys = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId/deploys" -Headers $headers
    
    Write-Host "`nRecent Deploys:" -ForegroundColor White
    Write-Host "=" * 80 -ForegroundColor Gray
    
    $deploys | Select-Object -First 10 | ForEach-Object {
        $deploy = $_.deploy
        
        $statusColor = switch ($deploy.status) {
            "live" { "Green" }
            "build_in_progress" { "Yellow" }
            "pre_deploy_in_progress" { "Cyan" }
            "deploy_failed" { "Red" }
            "deactivated" { "DarkGray" }
            default { "White" }
        }
        
        $created = [DateTime]::Parse($deploy.createdAt).ToLocalTime().ToString("MM-dd HH:mm:ss")
        $updated = [DateTime]::Parse($deploy.updatedAt).ToLocalTime().ToString("MM-dd HH:mm:ss")
        
        Write-Host "`n  Deploy: " -NoNewline -ForegroundColor Gray
        Write-Host $deploy.id -ForegroundColor White
        Write-Host "  Status: " -NoNewline -ForegroundColor Gray
        Write-Host $deploy.status -ForegroundColor $statusColor
        Write-Host "  Created: $created" -ForegroundColor Gray
        Write-Host "  Updated: $updated" -ForegroundColor Gray
        
        if ($deploy.commit) {
            $commitMsg = $deploy.commit.message
            if ($commitMsg.Length -gt 60) {
                $commitMsg = $commitMsg.Substring(0, 57) + "..."
            }
            Write-Host "  Commit: $commitMsg" -ForegroundColor DarkCyan
        }
    }
    
    Write-Host "`n" + ("=" * 80) -ForegroundColor Gray
    Write-Host "View full logs in dashboard:" -ForegroundColor Cyan
    Write-Host "https://dashboard.render.com/worker/$serviceId" -ForegroundColor Blue
    
} catch {
    $errorMsg = $_.Exception.Message
    Write-Host "Failed to fetch deploys" -ForegroundColor Red
    Write-Host $errorMsg -ForegroundColor Red
    exit 1
}
