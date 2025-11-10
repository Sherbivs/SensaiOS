# Render API - Restart Service
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
    Write-Error "RENDER_API_KEY not found. Add it to secrets/Infinity-Gauntlet.env"
    exit 1
}

Write-Host "🔄 Restarting $Service..." -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Accept" = "application/json"
}

try {
    # Get service ID
    $services = Invoke-RestMethod -Uri "https://api.render.com/v1/services" -Headers $headers
    $targetService = $services | Where-Object { $_.service.name -eq $Service } | Select-Object -First 1
    
    if (-not $targetService) {
        Write-Error "Service '$Service' not found"
        exit 1
    }
    
    $serviceId = $targetService.service.id
    
    # Suspend service
    Write-Host "  Suspending service..." -ForegroundColor Yellow
    Invoke-RestMethod `
        -Uri "https://api.render.com/v1/services/$serviceId/suspend" `
        -Method Post `
        -Headers $headers | Out-Null
    
    Start-Sleep -Seconds 3
    
    # Resume service
    Write-Host "  Resuming service..." -ForegroundColor Yellow
    Invoke-RestMethod `
        -Uri "https://api.render.com/v1/services/$serviceId/resume" `
        -Method Post `
        -Headers $headers | Out-Null
    
    Write-Host "✅ Service restarted successfully!" -ForegroundColor Green
    Write-Host "View in dashboard: https://dashboard.render.com/services/$serviceId" -ForegroundColor Blue
    
} catch {
    Write-Host "❌ Failed to restart: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
