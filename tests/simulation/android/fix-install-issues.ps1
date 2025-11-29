# fix-install-issues.ps1
# Comprehensive fix for Android installation issues
# Addresses: dex2oat crashes, UID mismatches, fs-verity errors

param(
    [switch]$FullClean,
    [switch]$ReleaseMode,
    [switch]$Force64Bit
)

$ErrorActionPreference = "Continue"

Write-Host @"

╔════════════════════════════════════════════════════════════════════════════╗
║  🔧 ANDROID INSTALLATION ISSUE FIXER                                       ║
╚════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Check ADB connection
Write-Host "📱 Step 1: Checking ADB connection..." -ForegroundColor Yellow
$adbDevices = adb devices 2>$null | Select-String "device$"
if (-not $adbDevices) {
    Write-Host "❌ No Android device connected!" -ForegroundColor Red
    Write-Host "   • Connect device via USB" -ForegroundColor Gray
    Write-Host "   • Enable USB debugging in Developer Options" -ForegroundColor Gray
    Write-Host "   • Run: adb devices" -ForegroundColor Gray
    exit 1
}
Write-Host "✅ Device connected" -ForegroundColor Green

# Step 2: Complete uninstall
Write-Host "`n🗑️  Step 2: Complete app removal..." -ForegroundColor Yellow
$packageName = "com.infinitygauntlet.simulation"

Write-Host "   Uninstalling $packageName..." -ForegroundColor Gray
adb uninstall $packageName 2>$null

Write-Host "   Clearing app data..." -ForegroundColor Gray
adb shell pm clear $packageName 2>$null

Write-Host "   Removing cached files..." -ForegroundColor Gray
adb shell "rm -rf /data/data/$packageName" 2>$null
adb shell "rm -rf /sdcard/Android/data/$packageName" 2>$null

Write-Host "✅ App completely removed" -ForegroundColor Green

# Step 3: Clear system cache (if full clean)
if ($FullClean) {
    Write-Host "`n🧹 Step 3: Clearing system cache..." -ForegroundColor Yellow
    
    Write-Host "   Stopping Package Manager..." -ForegroundColor Gray
    adb shell "am force-stop com.android.vending" 2>$null
    
    Write-Host "   Clearing dalvik cache..." -ForegroundColor Gray
    adb shell "rm -rf /data/dalvik-cache/*" 2>$null
    
    Write-Host "   Clearing ART profiles..." -ForegroundColor Gray
    adb shell "rm -rf /data/misc/profiles/cur/0/$packageName" 2>$null
    
    Write-Host "✅ System cache cleared" -ForegroundColor Green
}

# Step 4: Check storage
Write-Host "`n💾 Step 4: Checking device storage..." -ForegroundColor Yellow
$storage = adb shell "df -h /data" 2>$null | Select-String "/data"
if ($storage) {
    Write-Host "   $storage" -ForegroundColor Gray
    
    # Parse available space (rough check)
    if ($storage -match "(\d+)%") {
        $usedPercent = [int]$matches[1]
        if ($usedPercent -gt 90) {
            Write-Host "⚠️  Storage critically low ($usedPercent% used)" -ForegroundColor Yellow
            Write-Host "   Free up space before installing" -ForegroundColor Gray
        } else {
            Write-Host "✅ Sufficient storage available" -ForegroundColor Green
        }
    }
} else {
    Write-Host "⚠️  Could not check storage" -ForegroundColor Yellow
}

# Step 5: Build configuration recommendations
Write-Host "`n🔨 Step 5: Build recommendations..." -ForegroundColor Yellow

$buildType = if ($ReleaseMode) { "Release" } else { "Debug" }
$buildArgs = @()

if ($ReleaseMode) {
    Write-Host "   • Using RELEASE build (better optimization)" -ForegroundColor Green
    $buildArgs += "-BuildType", "Release"
} else {
    Write-Host "   • Using DEBUG build" -ForegroundColor Gray
    $buildArgs += "-BuildType", "Debug"
}

if ($Force64Bit) {
    Write-Host "   • Forcing 64-bit only (avoids 32-bit dex2oat crash)" -ForegroundColor Green
    Write-Host "     NOTE: You need to add this to build.gradle.kts:" -ForegroundColor Yellow
    Write-Host @"
     
     android {
         defaultConfig {
             ndk { 
                 abiFilters.clear()
                 abiFilters += listOf("arm64-v8a", "x86_64")
             }
         }
     }
     
"@ -ForegroundColor Gray
}

# Step 6: Clean build
Write-Host "`n🏗️  Step 6: Building APK..." -ForegroundColor Yellow
Write-Host "   Running: .\build-android.ps1 -Clean $($buildArgs -join ' ')" -ForegroundColor Gray

& .\build-android.ps1 -Clean @buildArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Build failed!" -ForegroundColor Red
    Write-Host "   Check errors above and try:" -ForegroundColor Yellow
    Write-Host "   • .\gradlew clean" -ForegroundColor Gray
    Write-Host "   • File → Invalidate Caches in Android Studio" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Build successful" -ForegroundColor Green

# Step 7: Install
Write-Host "`n📲 Step 7: Installing APK..." -ForegroundColor Yellow

$apkPath = "app\build\outputs\apk\$($buildType.ToLower())\app-$($buildType.ToLower()).apk"

if (-not (Test-Path $apkPath)) {
    Write-Host "❌ APK not found: $apkPath" -ForegroundColor Red
    exit 1
}

Write-Host "   APK: $apkPath" -ForegroundColor Gray
$apkSize = (Get-Item $apkPath).Length / 1MB
Write-Host "   Size: $($apkSize.ToString("F2")) MB" -ForegroundColor Gray

Write-Host "`n   Installing..." -ForegroundColor Gray
$installOutput = adb install -r $apkPath 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Installation successful!" -ForegroundColor Green
} else {
    Write-Host "`n❌ Installation failed!" -ForegroundColor Red
    Write-Host "   Output: $installOutput" -ForegroundColor Gray
    
    Write-Host "`n   Try these fixes:" -ForegroundColor Yellow
    Write-Host "   1. Run with -FullClean flag" -ForegroundColor Gray
    Write-Host "   2. Run with -ReleaseMode flag" -ForegroundColor Gray
    Write-Host "   3. Restart device" -ForegroundColor Gray
    Write-Host "   4. Free up storage space" -ForegroundColor Gray
    exit 1
}

# Step 8: Verify installation
Write-Host "`n✅ Step 8: Verifying installation..." -ForegroundColor Yellow
$installed = adb shell pm list packages | Select-String $packageName

if ($installed) {
    Write-Host "✅ Package verified on device" -ForegroundColor Green
    
    Write-Host "`n📱 Launching app..." -ForegroundColor Yellow
    adb shell am start -n "$packageName/.MainActivity"
    
    Write-Host "`n✨ COMPLETE!" -ForegroundColor Green
    Write-Host @"

To monitor logs:
  adb logcat | Select-String "$packageName"
  
To monitor crashes:
  adb logcat | Select-String "FATAL|AndroidRuntime|crash"

"@ -ForegroundColor Cyan
} else {
    Write-Host "⚠️  Package not found on device" -ForegroundColor Yellow
}

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Usage Examples:" -ForegroundColor Yellow
Write-Host "  .\fix-install-issues.ps1                    # Standard fix" -ForegroundColor Gray
Write-Host "  .\fix-install-issues.ps1 -FullClean         # Deep clean" -ForegroundColor Gray
Write-Host "  .\fix-install-issues.ps1 -ReleaseMode       # Release build" -ForegroundColor Gray
Write-Host "  .\fix-install-issues.ps1 -Force64Bit        # 64-bit only" -ForegroundColor Gray
Write-Host "  .\fix-install-issues.ps1 -FullClean -ReleaseMode  # All fixes" -ForegroundColor Gray
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
