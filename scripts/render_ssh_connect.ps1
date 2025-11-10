#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Connect to Render services via SSH
.DESCRIPTION
    Interactive SSH connection to Render services with service selection menu
.PARAMETER ServiceId
    Specific service ID to connect to (e.g., srv-abc123)
.PARAMETER Instance
    Specific instance slug to connect to (e.g., d4e5f)
.PARAMETER Region
    Render region (oregon, ohio, virginia, frankfurt, singapore) - default: oregon
.PARAMETER Command
    Execute a command and exit (non-interactive)
.EXAMPLE
    .\render_ssh_connect.ps1
.EXAMPLE
    .\render_ssh_connect.ps1 -ServiceId "srv-d3snk2ndiees73cn709g"
.EXAMPLE
    .\render_ssh_connect.ps1 -ServiceId "srv-abc123" -Instance "d4e5f"
.EXAMPLE
    .\render_ssh_connect.ps1 -ServiceId "srv-abc123" -Command "ls -la /Store"
#>

param(
    [string]$ServiceId,
    [string]$Instance,
    [ValidateSet("oregon", "ohio", "virginia", "frankfurt", "singapore")]
    [string]$Region = "oregon",
    [string]$Command
)

$ErrorActionPreference = "Stop"

Write-Host "🔌 Render SSH Connect" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host ""

# Load API key from secrets
$envFile = "secrets/Infinity-Gauntlet.env"
$apiKey = $null

if (Test-Path $envFile) {
    $apiKey = Get-Content $envFile | Select-String -Pattern '^RENDER_API_KEY=' | ForEach-Object { 
        ($_ -split '=', 2)[1].Trim() 
    }
}

if (-not $apiKey -and -not $ServiceId) {
    Write-Host "⚠️  RENDER_API_KEY not found and no ServiceId specified" -ForegroundColor Yellow
    Write-Host "   Either:" -ForegroundColor Gray
    Write-Host "     1. Add RENDER_API_KEY to $envFile" -ForegroundColor Gray
    Write-Host "     2. Or provide -ServiceId manually" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# If no service specified, show interactive menu
if (-not $ServiceId) {
    Write-Host "🔍 Fetching your services..." -ForegroundColor Cyan
    
    $headers = @{
        "Authorization" = "Bearer $apiKey"
    }
    
    try {
        $response = Invoke-RestMethod `
            -Uri "https://api.render.com/v1/services?limit=20" `
            -Headers $headers
        
        # Filter SSH-compatible services (paid workers and web services)
        $services = $response | Where-Object {
            $_.service.type -in @("web_service", "background_worker") -and
            $_.service.suspended -eq "not_suspended"
        }
        
        if ($services.Count -eq 0) {
            Write-Host "❌ No SSH-compatible services found" -ForegroundColor Red
            Write-Host "   SSH is available for paid web services and workers" -ForegroundColor Gray
            exit 1
        }
        
        Write-Host ""
        Write-Host "Available services:" -ForegroundColor Cyan
        Write-Host ""
        
        $index = 1
        $serviceMap = @{}
        foreach ($item in $services) {
            $svc = $item.service
            $serviceMap[$index] = $svc
            
            $typeIcon = if ($svc.type -eq "web_service") { "🌐" } else { "⚙️ " }
            Write-Host "  [$index] $typeIcon $($svc.name)" -ForegroundColor White
            Write-Host "       ID: $($svc.id)" -ForegroundColor Gray
            Write-Host "       Region: $($svc.serviceDetails.region)" -ForegroundColor Gray
            Write-Host ""
            $index++
        }
        
        Write-Host "Select a service (1-$($services.Count)) or 'q' to quit: " -NoNewline -ForegroundColor Yellow
        $selection = Read-Host
        
        if ($selection -eq 'q') {
            Write-Host "Cancelled" -ForegroundColor Gray
            exit 0
        }
        
        $selectionNum = [int]$selection
        if ($selectionNum -lt 1 -or $selectionNum -gt $services.Count) {
            Write-Host "❌ Invalid selection" -ForegroundColor Red
            exit 1
        }
        
        $selectedService = $serviceMap[$selectionNum]
        $ServiceId = $selectedService.id
        $Region = $selectedService.serviceDetails.region
        
        Write-Host ""
        Write-Host "✅ Selected: $($selectedService.name)" -ForegroundColor Green
        Write-Host ""
        
    } catch {
        Write-Host "❌ Error fetching services:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
}

# Build SSH hostname
$hostname = if ($Instance) {
    "$ServiceId-$Instance@ssh.$Region.render.com"
} else {
    "$ServiceId@ssh.$Region.render.com"
}

# Build SSH command
$sshArgs = @($hostname)

if ($Command) {
    $sshArgs += $Command
    Write-Host "🚀 Executing command on $ServiceId..." -ForegroundColor Cyan
} else {
    Write-Host "🔌 Connecting to $ServiceId..." -ForegroundColor Cyan
}

Write-Host "   Host: $hostname" -ForegroundColor Gray
Write-Host "   Region: $Region" -ForegroundColor Gray
if ($Instance) {
    Write-Host "   Instance: $Instance" -ForegroundColor Gray
}
Write-Host ""

# Check if SSH key exists
$sshDir = Join-Path $env:USERPROFILE ".ssh"
$defaultKey = Join-Path $sshDir "id_ed25519_render"
if (-not (Test-Path $defaultKey)) {
    Write-Host "⚠️  Render SSH key not found: $defaultKey" -ForegroundColor Yellow
    Write-Host "   Run: npm run render:ssh-setup" -ForegroundColor Gray
    Write-Host ""
}

# Execute SSH
try {
    & ssh $sshArgs
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -ne 0) {
        Write-Host ""
        Write-Host "❌ SSH connection failed (exit code: $exitCode)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "  1. Verify SSH key is added to Render Dashboard" -ForegroundColor Gray
        Write-Host "     https://dashboard.render.com/settings#ssh-public-keys" -ForegroundColor Gray
        Write-Host "  2. Check service is running: npm run render:status" -ForegroundColor Gray
        Write-Host "  3. Verify service ID is correct" -ForegroundColor Gray
        Write-Host "  4. Use -Verbose flag for detailed output: ssh -v $hostname" -ForegroundColor Gray
        Write-Host ""
        exit $exitCode
    }
} catch {
    Write-Host "❌ Error executing SSH:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
