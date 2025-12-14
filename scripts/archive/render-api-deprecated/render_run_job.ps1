#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Run a one-off job on Render
.DESCRIPTION
    Executes a command as a one-off job in the Render environment
.PARAMETER ServiceId
    The Render service ID to run the job on
.PARAMETER Command
    The command to execute
.EXAMPLE
    .\render_run_job.ps1 -ServiceId "srv-abc123" -Command "npx tsx scripts/check_prisma_findmany.ts"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ServiceId,
    
    [Parameter(Mandatory=$true)]
    [string]$Command
)

# Load API key from secrets
$envFile = "secrets/Infinity-Gauntlet.env"
if (Test-Path $envFile) {
    $apiKey = Get-Content $envFile | Select-String -Pattern '^RENDER_API_KEY=' | ForEach-Object { 
        ($_ -split '=', 2)[1].Trim() 
    }
} else {
    Write-Error "Environment file not found: $envFile"
    exit 1
}

if (-not $apiKey) {
    Write-Error "RENDER_API_KEY not found in $envFile"
    exit 1
}

Write-Host "🚀 Starting one-off job on Render..." -ForegroundColor Cyan
Write-Host "Service ID: $ServiceId" -ForegroundColor Gray
Write-Host "Command: $Command" -ForegroundColor Gray
Write-Host ""

# Create job request
$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Content-Type" = "application/json"
}

$body = @{
    startCommand = $Command
} | ConvertTo-Json

try {
    # Start the job
    $response = Invoke-RestMethod `
        -Uri "https://api.render.com/v1/services/$ServiceId/jobs" `
        -Method POST `
        -Headers $headers `
        -Body $body
    
    $jobId = $response.id
    Write-Host "✅ Job created successfully!" -ForegroundColor Green
    Write-Host "Job ID: $jobId" -ForegroundColor Gray
    Write-Host "Status: $($response.status)" -ForegroundColor Gray
    Write-Host ""
    
    # Poll for job completion
    Write-Host "⏳ Waiting for job to complete..." -ForegroundColor Yellow
    $maxAttempts = 60  # 5 minutes max
    $attempt = 0
    $completed = $false
    
    while ($attempt -lt $maxAttempts -and -not $completed) {
        Start-Sleep -Seconds 5
        $attempt++
        
        $statusResponse = Invoke-RestMethod `
            -Uri "https://api.render.com/v1/services/$ServiceId/jobs/$jobId" `
            -Method GET `
            -Headers $headers
        
        $status = $statusResponse.status
        Write-Host "  Status: $status (attempt $attempt/$maxAttempts)" -ForegroundColor Gray
        
        if ($status -eq "succeeded" -or $status -eq "failed") {
            $completed = $true
        }
    }
    
    if ($completed) {
        if ($status -eq "succeeded") {
            Write-Host "✅ Job completed successfully!" -ForegroundColor Green
        } else {
            Write-Host "❌ Job failed!" -ForegroundColor Red
        }
        
        Write-Host ""
        Write-Host "📋 Job Details:" -ForegroundColor Cyan
        Write-Host "  Job ID: $jobId"
        Write-Host "  Status: $status"
        Write-Host "  Started: $($statusResponse.startedAt)"
        Write-Host "  Finished: $($statusResponse.finishedAt)"
        
        # Note: Logs are retrieved via a different endpoint
        Write-Host ""
        Write-Host "💡 To view logs, use:" -ForegroundColor Yellow
        Write-Host "   Render Dashboard: https://dashboard.render.com"
        Write-Host "   Or Render CLI: render logs --job $jobId"
    } else {
        Write-Host "⚠️  Job did not complete within timeout period" -ForegroundColor Yellow
        Write-Host "   Check status in Render Dashboard or CLI"
    }
    
} catch {
    Write-Host "❌ Error creating/monitoring job:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}
