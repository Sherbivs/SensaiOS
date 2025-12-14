# Render API - Check All Services Status
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

Write-Host "Checking Render services status..." -ForegroundColor Cyan
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Accept" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services" -Headers $headers
    
    foreach ($item in $response) {
        $service = $item.service
        $status = $service.serviceDetails.deployStatus
        $type = $service.type
        
        $statusColor = switch ($status) {
            "live" { "Green" }
            "building" { "Yellow" }
            "deploying" { "Cyan" }
            default { "Red" }
        }
        
        Write-Host "  [$type] " -NoNewline -ForegroundColor Gray
        Write-Host "$($service.name) " -NoNewline -ForegroundColor White
        Write-Host "[$status]" -ForegroundColor $statusColor
        
        if ($service.serviceDetails.url) {
            Write-Host "    URL: $($service.serviceDetails.url)" -ForegroundColor Blue
        }
    }
    
    Write-Host ""
    Write-Host "Status check complete" -ForegroundColor Green
    
} catch {
    $errorMsg = $_.Exception.Message
    Write-Host "Failed to check status" -ForegroundColor Red
    Write-Host $errorMsg -ForegroundColor Red
    exit 1
}
