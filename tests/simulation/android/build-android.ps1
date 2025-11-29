#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build script for Infinity Gauntlet Simulation Android app
.DESCRIPTION
    Handles Java setup and builds the Android project
.PARAMETER Clean
    Clean build (removes build cache)
.PARAMETER Release
    Build release APK instead of debug
.PARAMETER Install
    Install APK on connected device after building
.EXAMPLE
    .\build-android.ps1
    .\build-android.ps1 -Clean
    .\build-android.ps1 -Release
    .\build-android.ps1 -Install
#>

param(
    [switch]$Clean,
    [switch]$Release,
    [switch]$Install
)

$ErrorActionPreference = "Stop"

Write-Host @"

╔════════════════════════════════════════════════════════════════╗
║  🤖 Infinity Gauntlet Simulation - Android Build Script      ║
╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Check for Java
Write-Host "🔍 Checking for Java installation..." -ForegroundColor Yellow

$javaHomes = @(
    "C:\Program Files\Android\Android Studio\jbr",
    "C:\Program Files\Java\jdk-17",
    "C:\Program Files\Java\jdk-11",
    "C:\Program Files\Java\jdk-21",
    "C:\Program Files\Eclipse Adoptium\jdk-17.0.8.7-hotspot",
    "C:\Program Files\Eclipse Adoptium\jdk-17.0.9.9-hotspot"
)

$javaFound = $false
foreach ($path in $javaHomes) {
    if (Test-Path $path) {
        $javaExe = Join-Path $path "bin\java.exe"
        if (Test-Path $javaExe) {
            Write-Host "✅ Found Java at: $path" -ForegroundColor Green
            $env:JAVA_HOME = $path
            $version = & $javaExe -version 2>&1 | Select-Object -First 1
            Write-Host "   Version: $version" -ForegroundColor Gray
            $javaFound = $true
            break
        }
    }
}

if (-not $javaFound) {
    Write-Host "❌ Java not found!" -ForegroundColor Red
    Write-Host @"

Please install Java Development Kit (JDK):
• JDK 17 recommended: https://adoptium.net/
• Or install Android Studio which includes JDK

"@ -ForegroundColor Yellow
    exit 1
}

# Set JAVA_HOME persistently for this session
[Environment]::SetEnvironmentVariable("JAVA_HOME", $env:JAVA_HOME, "Process")

Write-Host "`n📦 Preparing build..." -ForegroundColor Yellow

# Determine build type
$buildType = if ($Release) { "Release" } else { "Debug" }
$buildTask = if ($Release) { "assembleRelease" } else { "assembleDebug" }

Write-Host "   Build Type: $buildType" -ForegroundColor Gray

# Clean if requested
if ($Clean) {
    Write-Host "`n🧹 Cleaning build cache..." -ForegroundColor Yellow
    & .\gradlew clean --console=plain
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Clean failed!" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "✅ Clean complete" -ForegroundColor Green
}

# Build the APK
Write-Host "`n🔨 Building Android APK..." -ForegroundColor Yellow
Write-Host "   Task: $buildTask" -ForegroundColor Gray

$startTime = Get-Date
& .\gradlew $buildTask --console=plain

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Build failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

$duration = (Get-Date) - $startTime
Write-Host "`n✅ Build successful! (${duration.TotalSeconds:F1}s)" -ForegroundColor Green

# Locate the APK
$apkPath = "app\build\outputs\apk\$($buildType.ToLower())\app-$($buildType.ToLower()).apk"
if (Test-Path $apkPath) {
    $apkSize = (Get-Item $apkPath).Length / 1MB
    Write-Host @"

📱 APK Details:
   Path: $apkPath
   Size: $($apkSize.ToString("F2")) MB

"@ -ForegroundColor Cyan
}

# Install if requested
if ($Install) {
    Write-Host "📲 Installing APK on device..." -ForegroundColor Yellow
    
    # Check for connected devices
    & adb devices
    
    $installTask = if ($Release) { "installRelease" } else { "installDebug" }
    & .\gradlew $installTask --console=plain
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Installation failed!" -ForegroundColor Red
        Write-Host "   Make sure a device is connected and USB debugging is enabled" -ForegroundColor Yellow
        exit $LASTEXITCODE
    }
    
    Write-Host "✅ Installation complete!" -ForegroundColor Green
}

Write-Host @"

╔════════════════════════════════════════════════════════════════╗
║  ✨ Build Complete!                                           ║
╚════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Green

# Show next steps
if (-not $Install) {
    Write-Host @"
📋 Next Steps:
   • Install: .\build-android.ps1 -Install
   • Or manually: adb install $apkPath
   • Run in Android Studio: Shift+F10

"@ -ForegroundColor Cyan
}
