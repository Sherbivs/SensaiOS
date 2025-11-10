# Render API - Deploy Service
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

Write-Host "🚀 Deploying $Service to Render..." -ForegroundColor Cyan

# Get service ID
$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Accept" = "application/json"
}

try {
    $services = Invoke-RestMethod -Uri "https://api.render.com/v1/services" -Headers $headers
    $targetService = $services | Where-Object { $_.service.name -eq $Service } | Select-Object -First 1
    
    if (-not $targetService) {
        Write-Error "Service '$Service' not found"
        exit 1
    }
    
    $serviceId = $targetService.service.id
    
    # Trigger deploy
    $deployResponse = Invoke-RestMethod `
        -Uri "https://api.render.com/v1/services/$serviceId/deploys" `
        -Method Post `
        -Headers $headers `
        -ContentType "application/json" `
        -Body '{"clearCache": "do_not_clear"}'
    
    Write-Host "✅ Deploy triggered successfully!" -ForegroundColor Green
    Write-Host "Deploy ID: $($deployResponse.id)" -ForegroundColor Gray
    Write-Host "View in dashboard: https://dashboard.render.com/services/$serviceId" -ForegroundColor Blue
    
} catch {
    Write-Error "Failed to deploy: $_"
    exit 1
}
