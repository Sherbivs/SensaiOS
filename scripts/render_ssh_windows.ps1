#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Windows-native wrapper for Render SSH access via WSL
.DESCRIPTION
    Provides familiar PowerShell interface that delegates to WSL Render CLI
    Requires: WSL with Render CLI installed (see scripts/README-RENDER.md)
.PARAMETER Command
    Command to execute on Render service (default: interactive shell)
.PARAMETER ServiceId
    Service ID to connect to (default: srv-d3snk2ndiees73cn709g)
.PARAMETER Region
    Render region shortcut (default: virginia)
.PARAMETER Interactive
    Open interactive SSH session
.EXAMPLE
    .\render_ssh_windows.ps1 -Interactive
.EXAMPLE
    .\render_ssh_windows.ps1 -Command "df -h /Store"
.EXAMPLE
    .\render_ssh_windows.ps1 -Command "ls -lah /Store/" -ServiceId "srv-abc123"
#>

param(
    [Parameter(Position=0)]
    [string]$Command,
    
    [string]$ServiceId = "srv-d3snk2ndiees73cn709g",
    
    [ValidateSet("virginia", "oregon", "frankfurt", "singapore")]
    [string]$Region = "virginia",
    
    [switch]$Interactive
)

$ErrorActionPreference = "Stop"

Write-Host "⚡ Render SSH (Windows → WSL)" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Check if WSL is available
try {
    $wslCheck = wsl --list --quiet 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "WSL not found"
    }
} catch {
    Write-Host "❌ ERROR: WSL not available" -ForegroundColor Red
    Write-Host ""
    Write-Host "WSL is required for Render SSH access." -ForegroundColor Yellow
    Write-Host "Install WSL: wsl --install" -ForegroundColor Gray
    Write-Host "Setup Render CLI: See scripts/README-RENDER.md" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# Check if Render CLI is installed in WSL
$renderCheck = wsl bash -c "which render 2>/dev/null"
if ([string]::IsNullOrWhiteSpace($renderCheck)) {
    Write-Host "⚠️  WARNING: Render CLI not found in WSL" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Install Render CLI in WSL:" -ForegroundColor Yellow
    Write-Host "  1. wsl" -ForegroundColor Gray
    Write-Host "  2. curl -L https://github.com/render-oss/render-cli/releases/download/v2.5.0/render-linux-amd64-v2.5.0.zip -o /tmp/render.zip" -ForegroundColor Gray
    Write-Host "  3. unzip /tmp/render.zip -d /tmp/" -ForegroundColor Gray
    Write-Host "  4. sudo mv /tmp/render /usr/local/bin/" -ForegroundColor Gray
    Write-Host "  5. sudo chmod +x /usr/local/bin/render" -ForegroundColor Gray
    Write-Host "  6. render login" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or see: scripts/README-RENDER.md § SSH Access" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# Check if SSH config exists
$sshConfigCheck = wsl bash -c "grep -q 'Host render-$Region' ~/.ssh/config 2>/dev/null && echo 'found' || echo 'missing'"
if ($sshConfigCheck -ne "found") {
    Write-Host "⚠️  WARNING: SSH shortcut 'render-$Region' not configured" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Add to WSL ~/.ssh/config:" -ForegroundColor Yellow
    Write-Host "Host render-$Region" -ForegroundColor Gray
    Write-Host "  HostName ssh.$Region.render.com" -ForegroundColor Gray
    Write-Host "  User $ServiceId" -ForegroundColor Gray
    Write-Host "  IdentityFile ~/.ssh/render_key" -ForegroundColor Gray
    Write-Host "  StrictHostKeyChecking no" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Falling back to direct SSH..." -ForegroundColor Yellow
    Write-Host ""
}

# Build SSH command
if ($Interactive -or [string]::IsNullOrWhiteSpace($Command)) {
    Write-Host "🚀 Opening interactive SSH session..." -ForegroundColor Cyan
    Write-Host "   Service: $ServiceId" -ForegroundColor Gray
    Write-Host "   Region: $Region" -ForegroundColor Gray
    Write-Host ""
    Write-Host "💡 TIP: Type 'exit' to close SSH session" -ForegroundColor DarkGray
    Write-Host ""
    
    # Interactive mode - use SSH shortcut if available
    if ($sshConfigCheck -eq "found") {
        wsl ssh "render-$Region"
    } else {
        wsl bash -c "ssh -i ~/.ssh/render_key '$ServiceId@ssh.$Region.render.com'"
    }
} else {
    Write-Host "🚀 Executing command..." -ForegroundColor Cyan
    Write-Host "   Service: $ServiceId" -ForegroundColor Gray
    Write-Host "   Region: $Region" -ForegroundColor Gray
    Write-Host "   Command: $Command" -ForegroundColor Gray
    Write-Host ""
    
    # Command mode - escape command for shell
    $escapedCommand = $Command -replace "'", "'\\''"
    
    if ($sshConfigCheck -eq "found") {
        wsl ssh "render-$Region" "$Command"
    } else {
        wsl bash -c "ssh -i ~/.ssh/render_key '$ServiceId@ssh.$Region.render.com' '$escapedCommand'"
    }
}

$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host "✅ SSH operation completed successfully" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ SSH operation failed (exit code: $exitCode)" -ForegroundColor Red
}

exit $exitCode
