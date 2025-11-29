#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test the development server setup
.DESCRIPTION
    Verifies firewall rules, network connectivity, and server functionality
#>

Write-Host @"

╔════════════════════════════════════════════════════════════════╗
║  🧪 Development Server Test Suite                            ║
╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

$passed = 0
$failed = 0

function Test-Item {
    param(
        [string]$Name,
        [scriptblock]$Test
    )
    
    Write-Host "`n🔍 Testing: $Name" -ForegroundColor Yellow
    try {
        $result = & $Test
        if ($result) {
            Write-Host "   ✅ PASSED" -ForegroundColor Green
            $script:passed++
            return $true
        } else {
            Write-Host "   ❌ FAILED" -ForegroundColor Red
            $script:failed++
            return $false
        }
    } catch {
        Write-Host "   ❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
        return $false
    }
}

# Test 1: Check Node.js installation
Test-Item "Node.js Installation" {
    $version = node --version 2>$null
    if ($version) {
        Write-Host "      Version: $version" -ForegroundColor Gray
        return $true
    }
    return $false
}

# Test 2: Check network interfaces
Test-Item "Network Interfaces" {
    $interfaces = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
        $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown'
    }
    
    if ($interfaces.Count -gt 0) {
        $interfaces | ForEach-Object {
            Write-Host "      • $($_.IPAddress) - $($_.InterfaceAlias)" -ForegroundColor Gray
        }
        return $true
    }
    return $false
}

# Test 3: Check firewall rules
Test-Item "Firewall Rules" {
    $rules = Get-NetFirewallRule -DisplayName "Infinity-Gauntlet-Dev-Server-*" -ErrorAction SilentlyContinue
    if ($rules) {
        $rules | ForEach-Object {
            Write-Host "      • $($_.DisplayName): $($_.Enabled)" -ForegroundColor Gray
        }
        return $true
    } else {
        Write-Host "      ⚠ No firewall rules found (may need to run start-dev-server.ps1)" -ForegroundColor Yellow
        return $false
    }
}

# Test 4: Check required files
Test-Item "Required Files" {
    $files = @(
        "dev-server.js",
        "start-dev-server.ps1",
        "app\src\main\kotlin+java\com\infinitygauntlet\simulation\network\DevServerClient.kt",
        "app\src\main\kotlin+java\com\infinitygauntlet\simulation\network\DevServerDiscovery.kt"
    )
    
    $allExist = $true
    foreach ($file in $files) {
        $exists = Test-Path $file
        $status = if ($exists) { "✓" } else { "✗"; $allExist = $false }
        Write-Host "      $status $file" -ForegroundColor $(if ($exists) { "Gray" } else { "Red" })
    }
    
    return $allExist
}

# Test 5: Check server can start
Test-Item "Server Startup (Quick Check)" {
    Write-Host "      Starting server for 3 seconds..." -ForegroundColor Gray
    
    $job = Start-Job -ScriptBlock {
        $env:PORT = "8080"
        node "$using:PSScriptRoot\dev-server.js"
    }
    
    Start-Sleep -Seconds 3
    
    # Check if job is running
    $running = $job.State -eq "Running"
    
    # Stop the job
    Stop-Job $job
    Remove-Job $job
    
    if ($running) {
        Write-Host "      Server started successfully" -ForegroundColor Gray
        return $true
    } else {
        Write-Host "      Server failed to start" -ForegroundColor Red
        return $false
    }
}

# Test 6: Check port availability
Test-Item "Port Availability (8080)" {
    $port = 8080
    $tcpConnection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    
    if ($tcpConnection) {
        Write-Host "      ⚠ Port $port is already in use" -ForegroundColor Yellow
        Write-Host "      Process: $(Get-Process -Id $tcpConnection.OwningProcess -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)" -ForegroundColor Gray
        return $false
    } else {
        Write-Host "      Port $port is available" -ForegroundColor Gray
        return $true
    }
}

# Summary
Write-Host @"

╔════════════════════════════════════════════════════════════════╗
║  📊 Test Results                                              ║
╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

Write-Host "  ✅ Passed: $passed" -ForegroundColor Green
Write-Host "  ❌ Failed: $failed" -ForegroundColor Red
Write-Host "  📈 Success Rate: $([Math]::Round(($passed / ($passed + $failed)) * 100, 1))%" -ForegroundColor Cyan

if ($failed -eq 0) {
    Write-Host @"

╔════════════════════════════════════════════════════════════════╗
║  🎉 All Tests Passed!                                         ║
║  Ready to start the development server.                       ║
╚════════════════════════════════════════════════════════════════╝

Run: .\start-dev-server.ps1

"@ -ForegroundColor Green
} else {
    Write-Host @"

╔════════════════════════════════════════════════════════════════╗
║  ⚠ Some Tests Failed                                          ║
║  Please fix the issues before starting the server.            ║
╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Yellow
}
