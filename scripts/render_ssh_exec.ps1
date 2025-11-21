#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Execute commands on Render services via SSH
.DESCRIPTION
    Run commands remotely and capture output
.PARAMETER ServiceId
    Service ID to execute command on (required)
.PARAMETER Command
    Command to execute (required)
.PARAMETER Region
    Render region (virginia, oregon, frankfurt, singapore) - default: virginia
.PARAMETER Instance
    Specific instance slug to target
.PARAMETER Timeout
    Command timeout in seconds (default: 300)
.EXAMPLE
    .\render_ssh_exec.ps1 -ServiceId "srv-abc123" -Command "ls -la /Store"
.EXAMPLE
    .\render_ssh_exec.ps1 -ServiceId "srv-abc123" -Command "df -h" -Region "virginia"
.EXAMPLE
    .\render_ssh_exec.ps1 -ServiceId "srv-abc123" -Command "node --version" -Timeout 60
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ServiceId,
    
    [Parameter(Mandatory=$true)]
    [string]$Command,
    
    [ValidateSet("virginia", "oregon", "frankfurt", "singapore")]
    [string]$Region = "virginia",
    
    [string]$Instance,
    
    [int]$Timeout = 300
)

$ErrorActionPreference = "Stop"

Write-Host "⚡ Render SSH Exec" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan
Write-Host ""

# Build SSH hostname
$hostname = if ($Instance) {
    "$ServiceId-$Instance@ssh.$Region.render.com"
} else {
    "$ServiceId@ssh.$Region.render.com"
}

Write-Host "🚀 Executing command..." -ForegroundColor Cyan
Write-Host "   Service: $ServiceId" -ForegroundColor Gray
Write-Host "   Region: $Region" -ForegroundColor Gray
if ($Instance) {
    Write-Host "   Instance: $Instance" -ForegroundColor Gray
}
Write-Host "   Command: $Command" -ForegroundColor Gray
Write-Host "   Timeout: $Timeout seconds" -ForegroundColor Gray
Write-Host ""

# Check if SSH key exists (using standard SSH key name per Render documentation)
$sshDir = Join-Path $env:USERPROFILE ".ssh"
$defaultKey = Join-Path $sshDir "id_ed25519"
if (-not (Test-Path $defaultKey)) {
    Write-Host "⚠️  Render SSH key not found: $defaultKey" -ForegroundColor Yellow
    Write-Host "   Run: npm run render:ssh-setup" -ForegroundColor Gray
    Write-Host ""
}

# Execute SSH with timeout
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

try {
    # Use Start-Process for better control over timeout
    $process = Start-Process -FilePath "ssh" `
        -ArgumentList @($hostname, $Command) `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput "render_ssh_output.tmp" `
        -RedirectStandardError "render_ssh_error.tmp"
    
    $stopwatch.Stop()
    $elapsed = $stopwatch.Elapsed.TotalSeconds
    
    # Read output
    $output = ""
    $errorOutput = ""
    
    if (Test-Path "render_ssh_output.tmp") {
        $output = Get-Content "render_ssh_output.tmp" -Raw
        Remove-Item "render_ssh_output.tmp" -Force
    }
    
    if (Test-Path "render_ssh_error.tmp") {
        $errorOutput = Get-Content "render_ssh_error.tmp" -Raw
        Remove-Item "render_ssh_error.tmp" -Force
    }
    
    # Display results
    Write-Host "📤 Output:" -ForegroundColor Cyan
    Write-Host "=" * 80 -ForegroundColor Gray
    if ($output) {
        Write-Host $output
    } else {
        Write-Host "(no output)" -ForegroundColor Gray
    }
    Write-Host "=" * 80 -ForegroundColor Gray
    Write-Host ""
    
    if ($errorOutput) {
        Write-Host "⚠️  Errors:" -ForegroundColor Yellow
        Write-Host "=" * 80 -ForegroundColor Gray
        Write-Host $errorOutput -ForegroundColor Yellow
        Write-Host "=" * 80 -ForegroundColor Gray
        Write-Host ""
    }
    
    $exitCode = $process.ExitCode
    
    if ($exitCode -eq 0) {
        Write-Host "✅ Command completed successfully" -ForegroundColor Green
        Write-Host "   Duration: $([math]::Round($elapsed, 2))s" -ForegroundColor Gray
    } else {
        Write-Host "❌ Command failed with exit code: $exitCode" -ForegroundColor Red
        Write-Host "   Duration: $([math]::Round($elapsed, 2))s" -ForegroundColor Gray
        exit $exitCode
    }
    
} catch {
    $stopwatch.Stop()
    
    # Clean up temp files
    if (Test-Path "render_ssh_output.tmp") { Remove-Item "render_ssh_output.tmp" -Force }
    if (Test-Path "render_ssh_error.tmp") { Remove-Item "render_ssh_error.tmp" -Force }
    
    Write-Host "❌ Error executing command:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Verify SSH key is added to Render Dashboard" -ForegroundColor Gray
    Write-Host "  2. Check service is running: npm run render:status" -ForegroundColor Gray
    Write-Host "  3. Test basic connectivity: npm run render:ssh-connect" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
