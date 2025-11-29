#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Generate Android test app configuration from environment variables
.DESCRIPTION
    Reads Infinity-Gauntlet.env and generates hardcoded configuration
    for the Android test app (since Android can't load .env files)
#>

param(
    [string]$EnvFile = "..\..\..\..\secrets\Infinity-Gauntlet.env",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host @"

╔════════════════════════════════════════════════════════════════╗
║  📱 Android Test App Configuration Generator                 ║
╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Get local IP address
Write-Host "🌐 Detecting network configuration..." -ForegroundColor Yellow

$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -like '172.*') -and
    $_.PrefixOrigin -in @('Dhcp', 'Manual')
} | Select-Object -First 1).IPAddress

if (-not $localIP) {
    Write-Host "❌ Could not detect local IP" -ForegroundColor Red
    exit 1
}

Write-Host "  Local IP: $localIP" -ForegroundColor Green

# Configuration values
$config = @{
    DEV_SERVER_IP = $localIP
    DEV_SERVER_PORT = 3000
    API_TIMEOUT_MS = 10000
    ENABLE_LOGGING = "true"
    ENABLE_TEST_MODE = "true"
}

# Load environment variables if file exists
if (Test-Path $EnvFile) {
    Write-Host "`n📄 Loading environment variables..." -ForegroundColor Yellow
    Write-Host "  File: $EnvFile" -ForegroundColor Gray
    
    $envContent = Get-Content $EnvFile -Raw
    
    # Extract useful values for Android app
    if ($envContent -match 'BOT_TOKEN=([^\r\n]+)') {
        $botToken = $matches[1]
        # Only store first 20 chars for identification (security)
        $config.BOT_TOKEN_PREFIX = $botToken.Substring(0, [Math]::Min(20, $botToken.Length))
    }
    
    if ($envContent -match 'NODE_ENV=([^\r\n]+)') {
        $config.NODE_ENV = $matches[1]
    }
    
    if ($envContent -match 'TZ=([^\r\n]+)') {
        $config.TIMEZONE = $matches[1]
    }
    
    # Database info (for display/debugging only - NOT credentials)
    if ($envContent -match 'PROD_DATABASE_URL=postgresql://[^:]+:[^@]+@([^/]+)/([^\r\n]+)') {
        $config.DB_HOST = $matches[1].Split(':')[0]
        $config.DB_NAME = $matches[2]
    }
    
    Write-Host "  ✓ Loaded environment configuration" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Environment file not found: $EnvFile" -ForegroundColor Yellow
    Write-Host "  Using default configuration" -ForegroundColor Gray
}

# Display configuration
Write-Host "`n📋 Generated Configuration:" -ForegroundColor Cyan
Write-Host "────────────────────────────────────────" -ForegroundColor Gray

foreach ($key in $config.Keys | Sort-Object) {
    $value = $config[$key]
    Write-Host "  $key = " -NoNewline -ForegroundColor White
    Write-Host "$value" -ForegroundColor Yellow
}

# Generate ApiClient.kt configuration
$apiClientPath = "app\src\main\kotlin+java\com\infinitygauntlet\simulation\network\ApiClient.kt"

if (Test-Path $apiClientPath) {
    Write-Host "`n📝 Updating ApiClient.kt..." -ForegroundColor Yellow
    
    $content = Get-Content $apiClientPath -Raw
    
    # Update configuration values
    $content = $content -replace 'private const val DEV_SERVER_IP = "[^"]*"', "private const val DEV_SERVER_IP = `"$($config.DEV_SERVER_IP)`""
    $content = $content -replace 'private const val DEV_SERVER_PORT = \d+', "private const val DEV_SERVER_PORT = $($config.DEV_SERVER_PORT)"
    $content = $content -replace 'private const val TIMEOUT_MS = \d+', "private const val TIMEOUT_MS = $($config.API_TIMEOUT_MS)"
    
    if (-not $DryRun) {
        Set-Content $apiClientPath -Value $content
        Write-Host "  ✓ Updated ApiClient.kt" -ForegroundColor Green
    } else {
        Write-Host "  ℹ️  Dry run - no changes made" -ForegroundColor Cyan
    }
} else {
    Write-Host "`n⚠️  ApiClient.kt not found at: $apiClientPath" -ForegroundColor Yellow
}

# Generate AppConfig.kt with all configuration
$appConfigPath = "app\src\main\kotlin+java\com\infinitygauntlet\simulation\config\AppConfig.kt"
$appConfigDir = Split-Path $appConfigPath -Parent

if (-not (Test-Path $appConfigDir)) {
    New-Item -ItemType Directory -Path $appConfigDir -Force | Out-Null
}

Write-Host "`n📝 Generating AppConfig.kt..." -ForegroundColor Yellow

$appConfigContent = @"
package com.infinitygauntlet.simulation.config

/**
 * Application Configuration
 * 
 * This file is auto-generated from environment variables.
 * DO NOT EDIT MANUALLY - run generate-android-config.ps1 to update.
 * 
 * Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
 */
object AppConfig {
    
    // Development Server Configuration
    const val DEV_SERVER_IP = "$($config.DEV_SERVER_IP)"
    const val DEV_SERVER_PORT = $($config.DEV_SERVER_PORT)
    const val DEV_SERVER_URL = "http://`${DEV_SERVER_IP}:`${DEV_SERVER_PORT}"
    const val API_BASE_URL = "`${DEV_SERVER_URL}/api"
    
    // Network Configuration
    const val TIMEOUT_MS = $($config.API_TIMEOUT_MS)
    const val MAX_RETRIES = 3
    const val RETRY_DELAY_MS = 1000
    
    // Feature Flags
    const val ENABLE_LOGGING = $($config.ENABLE_LOGGING)
    const val ENABLE_TEST_MODE = $($config.ENABLE_TEST_MODE)
    const val ENABLE_ANALYTICS = false
    
    // Environment Information (for display only)
    const val ENVIRONMENT = "$($config.NODE_ENV ?? 'development')"
    const val TIMEZONE = "$($config.TIMEZONE ?? 'America/New_York')"
    
    // Backend Information (for debugging)
    const val BACKEND_DB_HOST = "$($config.DB_HOST ?? 'render.com')"
    const val BACKEND_DB_NAME = "$($config.DB_NAME ?? 'infinity_gauntlet_db')"
    
    // App Metadata
    const val APP_VERSION = "1.0.0"
    const val BUILD_TYPE = "debug"
    const val GENERATED_AT = "$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")"
    
    /**
     * Get connection URL for Android Emulator
     * Uses 10.0.2.2 instead of localhost
     */
    fun getEmulatorUrl(): String {
        return "http://10.0.2.2:`${DEV_SERVER_PORT}/api"
    }
    
    /**
     * Get connection URL for physical device
     * Uses actual local IP address
     */
    fun getDeviceUrl(): String {
        return API_BASE_URL
    }
    
    /**
     * Check if running in test/simulation mode
     */
    fun isTestMode(): Boolean = ENABLE_TEST_MODE
    
    /**
     * Get display name for current environment
     */
    fun getEnvironmentDisplay(): String {
        return when (ENVIRONMENT) {
            "production" -> "Production"
            "staging" -> "Staging"
            "development" -> "Development"
            else -> "Unknown"
        }
    }
}
"@

if (-not $DryRun) {
    Set-Content $appConfigPath -Value $appConfigContent
    Write-Host "  ✓ Generated AppConfig.kt" -ForegroundColor Green
    Write-Host "  Location: $appConfigPath" -ForegroundColor Gray
} else {
    Write-Host "  ℹ️  Dry run - would generate: $appConfigPath" -ForegroundColor Cyan
}

# Update ApiClient.kt to use AppConfig
Write-Host "`n📝 Updating ApiClient to use AppConfig..." -ForegroundColor Yellow

if (Test-Path $apiClientPath) {
    $apiContent = Get-Content $apiClientPath -Raw
    
    # Check if already using AppConfig
    if ($apiContent -notmatch 'import com\.infinitygauntlet\.simulation\.config\.AppConfig') {
        Write-Host "  Adding AppConfig import..." -ForegroundColor Gray
        
        # This is a complex update, let's just note it
        Write-Host "  ℹ️  Manual update recommended: Use AppConfig values in ApiClient.kt" -ForegroundColor Cyan
    }
}

# Create environment info file for documentation
$envInfoPath = "ENVIRONMENT_CONFIG.md"

$envInfoContent = @"
# Environment Configuration

## Auto-Generated Configuration

This file documents the environment-based configuration for the Android test app.

**Generated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

---

## Network Configuration

- **Local IP:** $($config.DEV_SERVER_IP)
- **Port:** $($config.DEV_SERVER_PORT)
- **Base URL:** http://$($config.DEV_SERVER_IP):$($config.DEV_SERVER_PORT)/api
- **Timeout:** $($config.API_TIMEOUT_MS)ms

---

## Environment Settings

- **Environment:** $($config.NODE_ENV ?? 'development')
- **Timezone:** $($config.TIMEZONE ?? 'America/New_York')
- **Test Mode:** $($config.ENABLE_TEST_MODE)
- **Logging:** $($config.ENABLE_LOGGING)

---

## Backend Information

- **Database Host:** $($config.DB_HOST ?? 'N/A')
- **Database Name:** $($config.DB_NAME ?? 'N/A')

---

## Files Updated

1. **AppConfig.kt** - Central configuration object
   - Location: ``app/src/main/kotlin+java/com/infinitygauntlet/simulation/config/AppConfig.kt``
   - Contains all hardcoded configuration values
   - Auto-generated from environment variables

2. **ApiClient.kt** - HTTP client configuration
   - Location: ``app/src/main/kotlin+java/com/infinitygauntlet/simulation/network/ApiClient.kt``
   - Updated with current local IP

---

## Updating Configuration

To regenerate configuration after environment changes:

``````powershell
.\generate-android-config.ps1
``````

To preview changes without applying:

``````powershell
.\generate-android-config.ps1 -DryRun
``````

To use a different environment file:

``````powershell
.\generate-android-config.ps1 -EnvFile "path\to\custom.env"
``````

---

## Security Notes

⚠️ **Sensitive data handling:**
- Full credentials are NEVER included in Android app
- Only non-sensitive metadata (hostnames, database names) included
- Bot tokens are truncated to first 20 characters for identification only
- All configuration is hardcoded (Android apps can't load .env files)

✅ **Safe for commit:**
- AppConfig.kt is safe to commit (no credentials)
- Contains only connection endpoints and feature flags
- Actual secrets remain in ``secrets/Infinity-Gauntlet.env``

---

**Last Updated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

if (-not $DryRun) {
    Set-Content $envInfoPath -Value $envInfoContent
    Write-Host "`n✓ Generated documentation: $envInfoPath" -ForegroundColor Green
}

# Summary
Write-Host "`n════════════════════════════════════════" -ForegroundColor Gray
Write-Host "✅ Configuration Generation Complete" -ForegroundColor Green
Write-Host "`nFiles Updated:" -ForegroundColor Cyan
Write-Host "  • AppConfig.kt - Central configuration object" -ForegroundColor White
Write-Host "  • ApiClient.kt - Network client settings" -ForegroundColor White
Write-Host "  • ENVIRONMENT_CONFIG.md - Documentation" -ForegroundColor White

Write-Host "`n📋 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Review generated AppConfig.kt" -ForegroundColor Gray
Write-Host "  2. Update ApiClient.kt to import and use AppConfig" -ForegroundColor Gray
Write-Host "  3. Rebuild Android app: .\build-android.ps1" -ForegroundColor Gray

Write-Host ""
