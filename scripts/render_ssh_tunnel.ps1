#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Create SSH tunnels to Render services
.DESCRIPTION
    Set up port forwarding (local, remote, or dynamic SOCKS proxy)
.PARAMETER ServiceId
    Service ID (required)
.PARAMETER LocalPort
    Local port number
.PARAMETER RemotePort
    Remote port number
.PARAMETER RemoteHost
    Remote host (default: localhost)
.PARAMETER Type
    Tunnel type: local, remote, or dynamic (SOCKS proxy)
.PARAMETER Region
    Render region (default: oregon)
.EXAMPLE
    .\render_ssh_tunnel.ps1 -ServiceId "srv-abc123" -LocalPort 5432 -RemotePort 5432 -Type local
.EXAMPLE
    .\render_ssh_tunnel.ps1 -ServiceId "srv-abc123" -LocalPort 1080 -Type dynamic
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ServiceId,
    
    [Parameter(Mandatory=$true)]
    [int]$LocalPort,
    
    [int]$RemotePort,
    
    [string]$RemoteHost = "localhost",
    
    [Parameter(Mandatory=$true)]
    [ValidateSet("local", "remote", "dynamic")]
    [string]$Type,
    
    [ValidateSet("virginia", "oregon", "frankfurt", "singapore")]
    [string]$Region = "virginia"
)

$ErrorActionPreference = "Stop"

Write-Host "🔀 Render SSH Tunnel" -ForegroundColor Cyan
Write-Host "====================" -ForegroundColor Cyan
Write-Host ""

# Validate parameters
if ($Type -ne "dynamic" -and -not $RemotePort) {
    Write-Host "❌ RemotePort is required for local and remote tunnels" -ForegroundColor Red
    exit 1
}

# Build SSH hostname
$hostname = "$ServiceId@ssh.$Region.render.com"

Write-Host "🚀 Creating SSH tunnel..." -ForegroundColor Cyan
Write-Host "   Service: $ServiceId" -ForegroundColor Gray
Write-Host "   Region: $Region" -ForegroundColor Gray
Write-Host "   Type: $Type" -ForegroundColor Gray
Write-Host "   Local Port: $LocalPort" -ForegroundColor Gray

if ($Type -eq "dynamic") {
    Write-Host "   SOCKS Proxy: localhost:$LocalPort" -ForegroundColor Gray
} else {
    Write-Host "   Remote Host: $RemoteHost" -ForegroundColor Gray
    Write-Host "   Remote Port: $RemotePort" -ForegroundColor Gray
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

# Build SSH command
$sshArgs = @()

switch ($Type) {
    "local" {
        # Local port forwarding: -L local_port:remote_host:remote_port
        $sshArgs += @("-L", "${LocalPort}:${RemoteHost}:${RemotePort}")
        Write-Host "📍 Access via: localhost:$LocalPort" -ForegroundColor Yellow
    }
    "remote" {
        # Remote port forwarding: -R remote_port:local_host:local_port
        $sshArgs += @("-R", "${RemotePort}:localhost:${LocalPort}")
        Write-Host "📍 Service can access your localhost:$LocalPort via port $RemotePort" -ForegroundColor Yellow
    }
    "dynamic" {
        # Dynamic SOCKS proxy: -D local_port
        $sshArgs += @("-D", $LocalPort)
        Write-Host "📍 SOCKS5 proxy available at: localhost:$LocalPort" -ForegroundColor Yellow
        Write-Host "   Configure your browser/app to use SOCKS5 proxy" -ForegroundColor Gray
    }
}

# Add common SSH options
$sshArgs += @(
    "-N",  # No remote command
    "-v",  # Verbose for debugging
    $hostname
)

Write-Host ""
Write-Host "🔗 Tunnel active. Press Ctrl+C to stop..." -ForegroundColor Green
Write-Host ""

# Execute SSH tunnel
try {
    & ssh $sshArgs
    $exitCode = $LASTEXITCODE
    
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "✅ Tunnel closed normally" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Tunnel closed with exit code: $exitCode" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host ""
    Write-Host "❌ Error creating tunnel:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Verify SSH key is added to Render Dashboard" -ForegroundColor Gray
    Write-Host "  2. Check local port is not already in use" -ForegroundColor Gray
    Write-Host "  3. Test basic connectivity: npm run render:ssh-connect" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
