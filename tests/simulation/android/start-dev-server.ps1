#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start the development server for Android app testing
.DESCRIPTION
    Configures firewall, gets local IP, updates Android config, and starts Node.js dev server
.PARAMETER Port
    Port to run the server on (default: 3000)
.PARAMETER UpdateAndroidConfig
    Automatically update the Android app's ApiClient.kt with the correct IP
.EXAMPLE
    .\start-dev-server.ps1
    .\start-dev-server.ps1 -Port 3001
    .\start-dev-server.ps1 -UpdateAndroidConfig
#>

param(
    [int]$Port = 3000,
    [switch]$UpdateAndroidConfig
)

$ErrorActionPreference = "Stop"

Write-Host @"

╔════════════════════════════════════════════════════════════════╗
║  🚀 Infinity Gauntlet Development Server Setup               ║
╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Step 1: Get local IP address
Write-Host "📍 Step 1: Getting local IP address..." -ForegroundColor Yellow

$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -like '172.*') -and
    $_.PrefixOrigin -in @('Dhcp', 'Manual')
} | Select-Object -First 1).IPAddress

if (-not $localIP) {
    Write-Host "❌ Could not determine local IP address" -ForegroundColor Red
    Write-Host "   Please connect to a network and try again" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Local IP: $localIP" -ForegroundColor Green

# Step 2: Configure firewall
Write-Host "`n🔥 Step 2: Configuring Windows Firewall..." -ForegroundColor Yellow

$ruleName = "Infinity-Gauntlet-Dev-Server"

try {
    # Remove existing rule if it exists
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        Remove-NetFirewallRule -DisplayName $ruleName | Out-Null
        Write-Host "   Removed existing firewall rule" -ForegroundColor Gray
    }
    
    # Create new rule
    New-NetFirewallRule -DisplayName $ruleName `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort 3000-3010 `
        -Action Allow `
        -Profile Private,Domain `
        -Description "Allow Android test app connections" `
        -ErrorAction Stop | Out-Null
    
    Write-Host "✅ Firewall rule created (ports 3000-3010)" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Warning: Could not configure firewall" -ForegroundColor Yellow
    Write-Host "   You may need to run as Administrator" -ForegroundColor Gray
    Write-Host "   Attempting to continue..." -ForegroundColor Gray
}

# Step 3: Update Android configuration
if ($UpdateAndroidConfig) {
    Write-Host "`n📱 Step 3: Updating Android app configuration..." -ForegroundColor Yellow
    
    # Use the configuration generator script
    $envFile = "C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\secrets\Infinity-Gauntlet.env"
    
    if (Test-Path "generate-android-config.ps1") {
        & .\generate-android-config.ps1 -EnvFile $envFile
        Write-Host "✅ Android configuration updated via generate-android-config.ps1" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Configuration generator not found" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n📱 Step 3: Android app configuration" -ForegroundColor Yellow
    Write-Host "   Run to update: .\generate-android-config.ps1" -ForegroundColor Gray
    Write-Host "   Or use: .\start-dev-server.ps1 -UpdateAndroidConfig" -ForegroundColor Cyan
}

# Step 4: Check for Node.js
Write-Host "`n🔍 Step 4: Checking Node.js installation..." -ForegroundColor Yellow

$nodeVersion = $null
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Node.js not found" -ForegroundColor Red
    Write-Host @"

Please install Node.js:
1. Download from: https://nodejs.org/
2. Install LTS version (v20+)
3. Restart PowerShell
4. Run this script again

"@ -ForegroundColor Yellow
    exit 1
}

# Step 5: Display connection info
Write-Host "`n📡 Step 5: Server Configuration" -ForegroundColor Yellow
Write-Host "════════════════════════════════════════" -ForegroundColor Gray

Write-Host "`n🌐 Server URLs:" -ForegroundColor Cyan
Write-Host "   Local:   http://localhost:$Port" -ForegroundColor White
Write-Host "   Network: http://${localIP}:$Port" -ForegroundColor Green
Write-Host "   API:     http://${localIP}:$Port/api" -ForegroundColor Green

Write-Host "`n🔗 Android App Configuration:" -ForegroundColor Cyan
Write-Host "   BASE_URL = `"http://${localIP}:${Port}/api`"" -ForegroundColor White

Write-Host "`n📚 Available Endpoints:" -ForegroundColor Cyan
$endpoints = @(
    "GET  /api/health        - Health check",
    "GET  /api/config        - App configuration",
    "POST /api/session       - Create test session",
    "POST /api/test-result   - Submit test result",
    "POST /api/command       - Execute bot command",
    "GET  /api/stats         - Server statistics"
)
foreach ($endpoint in $endpoints) {
    Write-Host "   $endpoint" -ForegroundColor Gray
}

Write-Host "`n🧪 Test Connection:" -ForegroundColor Cyan
Write-Host "   curl http://${localIP}:${Port}/api/health" -ForegroundColor White

# Step 6: Create package.json if it doesn't exist
if (-not (Test-Path "package.json")) {
    Write-Host "`n📦 Creating package.json..." -ForegroundColor Yellow
    
    $packageJson = @"
{
  "name": "infinity-gauntlet-dev-server",
  "version": "1.0.0",
  "description": "Development API server for Android test app",
  "type": "module",
  "main": "dev-server.mjs",
  "scripts": {
    "start": "node dev-server.mjs",
    "dev": "node dev-server.mjs"
  },
  "keywords": ["android", "testing", "api"],
  "author": "",
  "license": "MIT"
}
"@
    
    Set-Content "package.json" -Value $packageJson
    Write-Host "✅ Created package.json" -ForegroundColor Green
}

# Step 7: Start the server
Write-Host "`n🚀 Starting development server..." -ForegroundColor Yellow
Write-Host "════════════════════════════════════════" -ForegroundColor Gray
Write-Host "`nPress Ctrl+C to stop the server`n" -ForegroundColor Gray

# Set environment variable for port
$env:PORT = $Port

# Start the Node.js server
try {
    node dev-server.mjs
} catch {
    Write-Host "`n❌ Server stopped with error: $_" -ForegroundColor Red
    exit 1
}
