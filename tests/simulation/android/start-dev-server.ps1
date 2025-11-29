#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start the development server for Android app callbacks
.DESCRIPTION
    Configures firewall, discovers network IP, and starts Node.js server
.PARAMETER Port
    Port to run the server on (default: 8080)
.PARAMETER SkipFirewall
    Skip firewall configuration
.EXAMPLE
    .\start-dev-server.ps1
    .\start-dev-server.ps1 -Port 3000
#>

param(
    [int]$Port = 8080,
    [switch]$SkipFirewall
)

$ErrorActionPreference = "Stop"

Write-Host @"

╔════════════════════════════════════════════════════════════════╗
║  🚀 Infinity Gauntlet - Development Server Setup             ║
╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Step 1: Get network IP
Write-Host "📡 Step 1: Discovering network configuration..." -ForegroundColor Yellow

$networkInfo = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown'
}

if ($networkInfo.Count -eq 0) {
    Write-Host "❌ No network interfaces found!" -ForegroundColor Red
    exit 1
}

Write-Host "`nAvailable network interfaces:" -ForegroundColor Gray
$networkInfo | ForEach-Object {
    Write-Host "  • $($_.IPAddress) - $($_.InterfaceAlias)" -ForegroundColor Gray
}

$primaryIP = $networkInfo[0].IPAddress
Write-Host "`n✅ Primary IP: $primaryIP" -ForegroundColor Green

# Step 2: Configure firewall (if not skipped)
if (-not $SkipFirewall) {
    Write-Host "`n🔥 Step 2: Configuring Windows Firewall..." -ForegroundColor Yellow
    
    $ruleName = "Infinity-Gauntlet-Dev-Server-$Port"
    $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    
    if ($existingRule) {
        Write-Host "  ℹ Firewall rule already exists" -ForegroundColor Gray
    } else {
        try {
            $null = New-NetFirewallRule -DisplayName $ruleName `
                -Direction Inbound `
                -Protocol TCP `
                -LocalPort $Port `
                -Action Allow `
                -Profile Any `
                -Description "Allow Android app to callback to dev machine on port $Port"
            
            Write-Host "  ✅ Firewall rule created for port $Port" -ForegroundColor Green
        } catch {
            Write-Host "  ⚠ Could not create firewall rule (may need admin privileges)" -ForegroundColor Yellow
            Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "`n⏭ Step 2: Skipping firewall configuration" -ForegroundColor Gray
}

# Step 3: Check Node.js
Write-Host "`n🔍 Step 3: Checking Node.js installation..." -ForegroundColor Yellow

try {
    $nodeVersion = node --version 2>$null
    Write-Host "  ✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Node.js not found!" -ForegroundColor Red
    Write-Host "`n  Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Step 4: Generate Android configuration
Write-Host "`n📱 Step 4: Generating Android app configuration..." -ForegroundColor Yellow

$configContent = @"
# Android App Configuration
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## Development Server URL
Configure the Android app with this URL:

\`\`\`kotlin
DevServerClient.configure("http://$primaryIP`:$Port")
\`\`\`

## In MainActivity.kt, add to onCreate():
\`\`\`kotlin
import com.infinitygauntlet.simulation.network.DevServerClient
import com.infinitygauntlet.simulation.network.DevServerDiscovery
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

// Option 1: Manual configuration
DevServerClient.configure("http://$primaryIP`:$Port")
DevServerClient.setEnabled(true)

// Option 2: Auto-discovery (recommended)
GlobalScope.launch {
    val serverUrl = DevServerDiscovery.discover(this@MainActivity)
    if (serverUrl != null) {
        DevServerClient.configure(serverUrl)
        DevServerClient.setEnabled(true)
        runOnUiThread {
            Toast.makeText(this@MainActivity, "Connected to dev server", Toast.LENGTH_SHORT).show()
        }
    }
}
\`\`\`

## Network Information
- Primary IP: $primaryIP
- Port: $Port
- Full URL: http://$primaryIP`:$Port

## Available Endpoints
- GET  /ping          - Health check
- GET  /status        - Server status
- GET  /dashboard     - Web dashboard
- POST /log           - Receive app logs
- POST /test-result   - Receive test results
- POST /test-batch    - Receive test batch results

## Firewall Status
$( if ($SkipFirewall) { "⏭ Skipped" } else { "✅ Configured" } )

## QR Code for Easy Configuration
Scan this in your app to auto-configure:
http://$primaryIP`:$Port
"@

$configFile = Join-Path $PSScriptRoot "dev-server-config.md"
Set-Content -Path $configFile -Value $configContent
Write-Host "  ✅ Configuration saved to: dev-server-config.md" -ForegroundColor Green

# Step 5: Create logs directory
$logsDir = Join-Path $PSScriptRoot "logs"
$resultsDir = Join-Path $PSScriptRoot "test-results"

if (!(Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}
if (!(Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir | Out-Null
}

Write-Host "  ✅ Created data directories" -ForegroundColor Green

# Step 6: Start the server
Write-Host "`n🚀 Step 5: Starting development server..." -ForegroundColor Yellow
Write-Host ""

# Display connection information
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  📱 ANDROID APP CONFIGURATION                                 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Add this code to MainActivity.kt:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  import kotlinx.coroutines.GlobalScope" -ForegroundColor Gray
Write-Host "  import kotlinx.coroutines.launch" -ForegroundColor Gray
Write-Host "  import com.infinitygauntlet.simulation.network.*" -ForegroundColor Gray
Write-Host ""
Write-Host "  GlobalScope.launch {" -ForegroundColor White
Write-Host "      val url = DevServerDiscovery.discover(this@MainActivity)" -ForegroundColor White
Write-Host "      DevServerClient.configure(url ?: " -NoNewline -ForegroundColor White
Write-Host """http://$primaryIP`:$Port""" -NoNewline -ForegroundColor Green
Write-Host ")" -ForegroundColor White
Write-Host "      DevServerClient.setEnabled(true)" -ForegroundColor White
Write-Host "  }" -ForegroundColor White
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🌐 ACCESS DASHBOARD                                          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Browser: " -NoNewline -ForegroundColor Yellow
Write-Host "http://localhost:$Port/dashboard" -ForegroundColor Green
Write-Host "  Network: " -NoNewline -ForegroundColor Yellow
Write-Host "http://$primaryIP`:$Port/dashboard" -ForegroundColor Green
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host ""

# Check if dev-server.js exists
$serverScript = Join-Path $PSScriptRoot "dev-server.js"
if (!(Test-Path $serverScript)) {
    Write-Host "❌ dev-server.js not found!" -ForegroundColor Red
    exit 1
}

# Set environment variable for port
$env:PORT = $Port

# Start the server
try {
    node $serverScript
} catch {
    Write-Host "`n❌ Server failed to start: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
