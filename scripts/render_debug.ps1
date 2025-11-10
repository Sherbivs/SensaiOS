# Debug Render API - Show service details
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
$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Accept" = "application/json"
}

$response = Invoke-RestMethod -Uri "https://api.render.com/v1/services" -Headers $headers

foreach ($item in $response) {
    $service = $item.service
    Write-Host "================================" -ForegroundColor Cyan
    Write-Host "Name: $($service.name)" -ForegroundColor White
    Write-Host "ID: $($service.id)" -ForegroundColor Gray
    Write-Host "Type: $($service.type)" -ForegroundColor Yellow
    Write-Host "Status: $($service.serviceDetails.deployStatus)" -ForegroundColor Green
    Write-Host ""
}
