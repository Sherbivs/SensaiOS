# regenerate-config.ps1
# Regenerates AppConfig.kt when dev machine IP changes

param(
    [string]$ForceIp = ""
)

Write-Host "`n🔄 REGENERATING APPCONFIG.KT`n" -ForegroundColor Cyan

# Detect or use forced IP
if ($ForceIp) {
    $localIp = $ForceIp
    Write-Host "  Using forced IP: $localIp" -ForegroundColor Yellow
} else {
    $localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" } | Select-Object -First 1).IPAddress
    if (-not $localIp) {
        Write-Host "  ❌ Could not detect local IP!" -ForegroundColor Red
        Write-Host "  Run with -ForceIp parameter: .\regenerate-config.ps1 -ForceIp '192.168.x.x'" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  Detected IP: $localIp" -ForegroundColor Green
}

$appConfigPath = "app\src\main\kotlin+java\com\infinitygauntlet\simulation\config\AppConfig.kt"

$appConfigContent = @"
package com.infinitygauntlet.simulation.config

/**
 * Application Configuration
 * 
 * This file contains hardcoded configuration values extracted from the
 * development environment. These values are compiled into the APK and
 * cannot be changed at runtime.
 * 
 * WARNING: This configuration includes sensitive credentials.
 * This app is for single-user testing only and should NEVER be distributed.
 * 
 * Generated on: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
 * Local IP: $localIp
 */
object AppConfig {
    
    // ==========================================
    // LOCAL DEV SERVER
    // ==========================================
    const val DEV_SERVER_IP = "$localIp"
    const val DEV_SERVER_PORT = 3000
    const val API_BASE_URL = "http://$localIp:3000/api"
    
    // ==========================================
    // DISCORD BOT CREDENTIALS
    // ==========================================
    const val BOT_TOKEN = "MTQzMDcwMjAyOTM5MDQ4MzUyNg.Gc5C1A.YXM3MM68EgWkEfCGyWCfItOQP6tGnUDkjy8rHI"
    const val POKEMON_BOT_TOKEN = "MTQzMDcwMjAyOTM5MDQ4MzUyNg.Gc5C1A.YXM3MM68EgWkEfCGyWCfItOQP6tGnUDkjy8rHI"
    
    // ==========================================
    // RENDER PLATFORM
    // ==========================================
    const val RENDER_API_KEY = "rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp"
    const val RENDER_SERVICE_ID = "srv-d3snk2ndiees73cn709g"
    const val RENDER_SSH_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHRmJahMqnfxmn+OSaYtWmFcxfdz8i3CPqvhOS+bkWBM"
    
    // ==========================================
    // DATABASE URLS (Render Managed PostgreSQL)
    // ==========================================
    const val PROD_DATABASE_URL = "postgresql://infinity_gauntlet_db_user:a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db"
    const val DATABASE_HOST = "dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com"
    const val DATABASE_NAME = "infinity_gauntlet_db"
    const val DATABASE_USER = "infinity_gauntlet_db_user"
    
    // ==========================================
    // WORKSTATION DATABASES (Local PostgreSQL)
    // ==========================================
    const val ONPREMISE_DEV_URL = "postgresql://postgres@localhost:55433/infinity_gauntlet_db"
    const val ONPREMISE_EXPERIMENT_URL = "postgresql://postgres@localhost:55434/infinity_gauntlet_experiment"
    
    // ==========================================
    // SYSTEM CONFIGURATION
    // ==========================================
    const val TIMEZONE = "America/New_York"
    const val NODE_ENV = "development"
    const val TIMEOUT_MS = 10000
    const val ENABLE_LOGGING = true
    const val ENABLE_TEST_MODE = true
    
    // ==========================================
    // HELPER METHODS
    // ==========================================
    
    /**
     * Get the API base URL for Android emulator
     * Emulator uses 10.0.2.2 to reach host machine's localhost
     */
    fun getEmulatorUrl(): String = "http://10.0.2.2:`$DEV_SERVER_PORT/api"
    
    /**
     * Get the API base URL for physical device
     * Uses the local network IP of the dev machine
     */
    fun getDeviceUrl(): String = API_BASE_URL
    
    /**
     * Check if running in test mode
     */
    fun isTestMode(): Boolean = ENABLE_TEST_MODE
    
    /**
     * Get complete bot token (for Discord API calls)
     */
    fun getBotToken(): String = BOT_TOKEN
    
    /**
     * Get complete database connection string
     */
    fun getDatabaseUrl(): String = PROD_DATABASE_URL
    
    /**
     * Get Render API endpoint
     */
    fun getRenderApiUrl(): String = "https://api.render.com/v1"
    
    /**
     * Get Render service dashboard URL
     */
    fun getRenderDashboardUrl(): String = "https://dashboard.render.com/services/`$RENDER_SERVICE_ID"
    
    /**
     * Get database connection info as map
     */
    fun getDatabaseInfo(): Map<String, String> = mapOf(
        "host" to DATABASE_HOST,
        "database" to DATABASE_NAME,
        "user" to DATABASE_USER,
        "port" to "5432"
    )
}
"@

# Create directory if needed
$configDir = Split-Path $appConfigPath -Parent
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    Write-Host "  ✅ Created config directory" -ForegroundColor Green
}

# Write the file
Set-Content -Path $appConfigPath -Value $appConfigContent -Encoding UTF8

Write-Host "`n✅ CONFIGURATION UPDATED`n" -ForegroundColor Green
Write-Host "  File: $appConfigPath" -ForegroundColor Gray
Write-Host "  Server IP: $localIp" -ForegroundColor White
Write-Host "  API Base: http://$localIp:3000/api" -ForegroundColor White

Write-Host "`n⚠️  NEXT STEPS:`n" -ForegroundColor Yellow
Write-Host "  1. Rebuild Android app: .\build-android.ps1 -Install" -ForegroundColor White
Write-Host "  2. App will use new IP address" -ForegroundColor White

Write-Host "`n🔐 SECURITY REMINDER: APK contains full credentials`n" -ForegroundColor Red
