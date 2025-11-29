#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test the development server setup
.DESCRIPTION
    Verifies firewall rules, network connectivity, and API endpoints
#>

$ErrorActionPreference = "Continue"

Write-Host @"

╔════════════════════════════════════════════════════════════════╗
║  🧪 Development Server Setup Test                            ║
╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

$testsPassed = 0
$testsFailed = 0

function Test-Item {
    param(
        [string]$Name,
        [scriptblock]$Test
    )
    
    Write-Host "`n🔍 Testing: $Name" -ForegroundColor Yellow
    try {
        $result = & $Test
        if ($result) {
            Write-Host "   ✅ PASS" -ForegroundColor Green
            $script:testsPassed++
            return $true
        } else {
            Write-Host "   ❌ FAIL" -ForegroundColor Red
            $script:testsFailed++
            return $false
        }
    } catch {
        Write-Host "   ❌ FAIL: $_" -ForegroundColor Red
        $script:testsFailed++
        return $false
    }
}

# Test 1: Check local IP
Test-Item "Local IP Address" {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
        ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*') -and
        $_.PrefixOrigin -in @('Dhcp', 'Manual')
    } | Select-Object -First 1).IPAddress
    
    if ($ip) {
        Write-Host "      IP: $ip" -ForegroundColor Gray
        $true
    } else {
        Write-Host "      Could not determine local IP" -ForegroundColor Red
        $false
    }
}

# Test 2: Check firewall rule
Test-Item "Firewall Rule" {
    $rule = Get-NetFirewallRule -DisplayName "Infinity-Gauntlet-Dev-Server" -ErrorAction SilentlyContinue
    
    if ($rule) {
        Write-Host "      Enabled: $($rule.Enabled)" -ForegroundColor Gray
        Write-Host "      Action: $($rule.Action)" -ForegroundColor Gray
        $rule.Enabled -eq 'True' -and $rule.Action -eq 'Allow'
    } else {
        Write-Host "      Rule not found" -ForegroundColor Red
        $false
    }
}

# Test 3: Check Node.js
Test-Item "Node.js Installation" {
    try {
        $version = node --version 2>$null
        if ($version) {
            Write-Host "      Version: $version" -ForegroundColor Gray
            $true
        } else {
            $false
        }
    } catch {
        Write-Host "      Node.js not found" -ForegroundColor Red
        $false
    }
}

# Test 4: Check dev-server.mjs exists
Test-Item "Server Script (dev-server.mjs)" {
    $exists = Test-Path "dev-server.mjs"
    if ($exists) {
        $size = (Get-Item "dev-server.mjs").Length / 1KB
        Write-Host "      Size: $($size.ToString('F1')) KB" -ForegroundColor Gray
    }
    $exists
}

# Test 5: Check Android API client exists
Test-Item "Android API Client (ApiClient.kt)" {
    $path = "app\src\main\kotlin+java\com\infinitygauntlet\simulation\network\ApiClient.kt"
    $exists = Test-Path $path
    
    if ($exists) {
        $content = Get-Content $path -Raw
        if ($content -match 'private const val DEV_SERVER_IP = "([^"]+)"') {
            $ip = $matches[1]
            Write-Host "      Configured IP: $ip" -ForegroundColor Gray
            
            if ($ip -eq "192.168.1.100") {
                Write-Host "      ⚠️  Default IP detected - needs update" -ForegroundColor Yellow
            }
        }
    }
    
    $exists
}

# Test 6: Check network security config
Test-Item "Network Security Config" {
    $path = "app\src\main\res\xml\network_security_config.xml"
    $exists = Test-Path $path
    
    if ($exists) {
        $content = Get-Content $path -Raw
        $hasCleartext = $content -match 'cleartextTrafficPermitted="true"'
        
        if ($hasCleartext) {
            Write-Host "      Cleartext traffic: Allowed" -ForegroundColor Gray
        } else {
            Write-Host "      ⚠️  Cleartext traffic not configured" -ForegroundColor Yellow
        }
    }
    
    $exists
}

# Test 7: Check if port 3000 is available
Test-Item "Port 3000 Availability" {
    $listening = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
    
    if ($listening) {
        Write-Host "      ⚠️  Port 3000 is already in use" -ForegroundColor Yellow
        Write-Host "      Process: $($listening.OwningProcess)" -ForegroundColor Gray
        $false
    } else {
        Write-Host "      Port 3000 is available" -ForegroundColor Gray
        $true
    }
}

# Test 8: Check Android manifest permissions
Test-Item "Android Manifest Permissions" {
    $manifestPath = "app\src\main\AndroidManifest.xml"
    
    if (Test-Path $manifestPath) {
        $content = Get-Content $manifestPath -Raw
        $hasInternet = $content -match 'android.permission.INTERNET'
        $hasNetworkState = $content -match 'android.permission.ACCESS_NETWORK_STATE'
        $hasNetworkConfig = $content -match 'android:networkSecurityConfig'
        
        Write-Host "      INTERNET: $hasInternet" -ForegroundColor Gray
        Write-Host "      ACCESS_NETWORK_STATE: $hasNetworkState" -ForegroundColor Gray
        Write-Host "      networkSecurityConfig: $hasNetworkConfig" -ForegroundColor Gray
        
        $hasInternet -and $hasNetworkState
    } else {
        $false
    }
}

# Summary
Write-Host "`n════════════════════════════════════════" -ForegroundColor Gray
Write-Host "`n📊 Test Results:" -ForegroundColor Cyan
Write-Host "   ✅ Passed: $testsPassed" -ForegroundColor Green
Write-Host "   ❌ Failed: $testsFailed" -ForegroundColor Red

$total = $testsPassed + $testsFailed
$passRate = if ($total -gt 0) { ($testsPassed / $total * 100).ToString("F0") } else { "0" }

Write-Host "`n   Pass Rate: $passRate%" -ForegroundColor $(if ($passRate -ge 75) { "Green" } else { "Yellow" })

# Recommendations
if ($testsFailed -gt 0) {
    Write-Host "`n💡 Recommendations:" -ForegroundColor Yellow
    
    if (-not (Get-NetFirewallRule -DisplayName "Infinity-Gauntlet-Dev-Server" -ErrorAction SilentlyContinue)) {
        Write-Host "   • Run start-dev-server.ps1 as Administrator to create firewall rule" -ForegroundColor Gray
    }
    
    $apiClientPath = "app\src\main\kotlin+java\com\infinitygauntlet\simulation\network\ApiClient.kt"
    if (Test-Path $apiClientPath) {
        $content = Get-Content $apiClientPath -Raw
        if ($content -match 'DEV_SERVER_IP = "192.168.1.100"') {
            Write-Host "   • Update ApiClient.kt with your actual local IP" -ForegroundColor Gray
            Write-Host "     Run: .\start-dev-server.ps1 -UpdateAndroidConfig" -ForegroundColor Gray
        }
    }
    
    try {
        $null = node --version 2>$null
    } catch {
        Write-Host "   • Install Node.js from https://nodejs.org/" -ForegroundColor Gray
    }
}

# Next steps
if ($testsPassed -eq $total) {
    Write-Host "`n🎉 All tests passed! Ready to start development server." -ForegroundColor Green
    Write-Host "`n📝 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Start server: .\start-dev-server.ps1" -ForegroundColor White
    Write-Host "   2. Build app: .\build-android.ps1 -Install" -ForegroundColor White
    Write-Host "   3. Test connection from app" -ForegroundColor White
} else {
    Write-Host "`n⚠️  Some tests failed. Please address the issues above." -ForegroundColor Yellow
}

Write-Host ""
