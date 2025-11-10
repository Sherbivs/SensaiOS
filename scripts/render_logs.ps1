# Render API - View Service Logs
param(
    [Parameter(Mandatory=$true)]
    [string]$Service,
    
    [switch]$Tail
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

Write-Host "📋 Fetching logs for $Service..." -ForegroundColor Cyan

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
    
    if ($Tail) {
        Write-Host "Tailing logs (Ctrl+C to stop)..." -ForegroundColor Yellow
        $cursor = $null
        
        while ($true) {
            $uri = "https://api.render.com/v1/services/$serviceId/logs?limit=100"
            if ($cursor) {
                $uri += "&cursor=$cursor"
            }
            
            $response = Invoke-RestMethod -Uri $uri -Headers $headers
            
            foreach ($log in $response) {
                $timestamp = [DateTime]::Parse($log.timestamp).ToLocalTime().ToString("HH:mm:ss")
                Write-Host "[$timestamp] $($log.message)"
            }
            
            if ($response.Count -gt 0) {
                $cursor = $response[-1].id
            }
            
            Start-Sleep -Seconds 2
        }
    } else {
        # Get last 100 logs
        $logs = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId/logs?limit=100" -Headers $headers
        
        foreach ($log in $logs) {
            $timestamp = [DateTime]::Parse($log.timestamp).ToLocalTime().ToString("HH:mm:ss")
            Write-Host "[$timestamp] $($log.message)"
        }
    }
    
} catch {
    Write-Host "❌ Failed to fetch logs: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
