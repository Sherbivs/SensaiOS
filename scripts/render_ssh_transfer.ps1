#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Transfer files to/from Render services via SCP
.DESCRIPTION
    Upload or download files using SCP over SSH
.PARAMETER ServiceId
    Service ID (required)
.PARAMETER Source
    Source path (local or remote)
.PARAMETER Destination
    Destination path (local or remote)
.PARAMETER Direction
    Transfer direction: upload or download
.PARAMETER Region
    Render region (default: virginia)
.PARAMETER Recursive
    Transfer directories recursively
.EXAMPLE
    .\render_ssh_transfer.ps1 -ServiceId "srv-abc123" -Source "./config.json" -Destination "/Store/config.json" -Direction upload
.EXAMPLE
    .\render_ssh_transfer.ps1 -ServiceId "srv-abc123" -Source "/Store/logs/" -Destination "./logs/" -Direction download -Recursive
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ServiceId,
    
    [Parameter(Mandatory=$true)]
    [string]$Source,
    
    [Parameter(Mandatory=$true)]
    [string]$Destination,
    
    [Parameter(Mandatory=$true)]
    [ValidateSet("upload", "download")]
    [string]$Direction,
    
    [ValidateSet("virginia", "oregon", "frankfurt", "singapore")]
    [string]$Region = "virginia",
    
    [switch]$Recursive
)

$ErrorActionPreference = "Stop"

Write-Host "📦 Render SSH Transfer" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host ""

# Build SSH hostname
$hostname = "$ServiceId@ssh.$Region.render.com"

Write-Host "🚀 Transferring files..." -ForegroundColor Cyan
Write-Host "   Service: $ServiceId" -ForegroundColor Gray
Write-Host "   Region: $Region" -ForegroundColor Gray
Write-Host "   Direction: $Direction" -ForegroundColor Gray
Write-Host "   Source: $Source" -ForegroundColor Gray
Write-Host "   Destination: $Destination" -ForegroundColor Gray
if ($Recursive) {
    Write-Host "   Mode: Recursive" -ForegroundColor Gray
}
Write-Host ""

# Check if SSH key exists (using standard SSH key name per Render documentation)
$sshDir = Join-Path $env:USERPROFILE ".ssh"
$defaultKey = Join-Path $sshDir "id_ed25519"
if (-not (Test-Path $defaultKey)) {
    Write-Host "⚠️  Render SSH key not found: $defaultKey" -ForegroundColor Yellow
    Write-Host "   Run: npm run render:ssh-setup" -ForegroundColor Gray
    Write-Host ""
}

# Build SCP command
$scpArgs = @()
if ($Recursive) {
    $scpArgs += "-r"
}

if ($Direction -eq "upload") {
    # Upload: local -> remote
    if (-not (Test-Path $Source)) {
        Write-Host "❌ Source file/directory not found: $Source" -ForegroundColor Red
        exit 1
    }
    $scpArgs += @($Source, "${hostname}:${Destination}")
} else {
    # Download: remote -> local
    $scpArgs += @("${hostname}:${Source}", $Destination)
}

# Execute SCP
try {
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    
    & scp $scpArgs
    $exitCode = $LASTEXITCODE
    
    $stopwatch.Stop()
    $elapsed = $stopwatch.Elapsed.TotalSeconds
    
    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "✅ Transfer completed successfully" -ForegroundColor Green
        Write-Host "   Duration: $([math]::Round($elapsed, 2))s" -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "❌ Transfer failed with exit code: $exitCode" -ForegroundColor Red
        Write-Host "   Duration: $([math]::Round($elapsed, 2))s" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "  1. Verify SSH key is added to Render Dashboard" -ForegroundColor Gray
        Write-Host "  2. Check path permissions on both sides" -ForegroundColor Gray
        Write-Host "  3. For uploads to /Store, ensure disk is mounted" -ForegroundColor Gray
        Write-Host "  4. Test basic connectivity: npm run render:ssh-connect" -ForegroundColor Gray
        Write-Host ""
        exit $exitCode
    }
    
} catch {
    Write-Host ""
    Write-Host "❌ Error during transfer:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
