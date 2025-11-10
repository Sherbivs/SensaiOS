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
    Write-Host "RENDER_API_KEY not found. Add it to secrets/Infinity-Gauntlet.env" -ForegroundColor Red
    exit 1
}

Write-Host "Fetching logs for $Service..." -ForegroundColor Cyan

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
    
    if ($Tail) {
        Write-Host "Tailing logs (Ctrl+C to stop)..." -ForegroundColor Yellow
        $startTime = $null
        $endTime = $null
        
        while ($true) {
            if ($startTime -and $endTime) {
                $uri = "https://api.render.com/v1/logs?resourceIds=$serviceId&startTime=$startTime&endTime=$endTime&limit=100"
            } else {
                $uri = "https://api.render.com/v1/logs?resourceIds=$serviceId&limit=100"
            }
            
            $response = Invoke-RestMethod -Uri $uri -Headers $headers
            
            foreach ($log in $response.logs) {
                $timestamp = [DateTime]::Parse($log.timestamp).ToLocalTime().ToString("HH:mm:ss")
                Write-Host "[$timestamp] $($log.text)"
            }
            
            if ($response.hasMore) {
                $startTime = $response.nextStartTime
                $endTime = $response.nextEndTime
            }
            
            Start-Sleep -Seconds 2
        }
    } else {
        # Get last 100 logs
        $logs = Invoke-RestMethod -Uri "https://api.render.com/v1/logs?resourceIds=$serviceId&limit=100" -Headers $headers
        
        foreach ($log in $logs.logs) {
            $timestamp = [DateTime]::Parse($log.timestamp).ToLocalTime().ToString("HH:mm:ss")
            Write-Host "[$timestamp] $($log.text)"
        }
    }
    
} catch {
    $errorMsg = $_.Exception.Message
    Write-Host "Failed to fetch logs" -ForegroundColor Red
    Write-Host $errorMsg -ForegroundColor Red
    exit 1
}
