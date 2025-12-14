# Android Environment Setup Script
# Run as Administrator: Right-click → Run with PowerShell (Admin)

param(
    [switch]$Check,
    [switch]$Fix
)

Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Android Test Environment Setup for VS Code         ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# Check Java
Write-Host "1️⃣ Checking Java JDK 17..." -ForegroundColor Yellow
$javaHome = "C:\Program Files\Java\jdk-17"
$javaFound = Test-Path $javaHome

if ($javaFound) {
    Write-Host "   ✅ Java JDK found at: $javaHome" -ForegroundColor Green
    
    if ($Fix -and $isAdmin) {
        [Environment]::SetEnvironmentVariable("JAVA_HOME", $javaHome, "Machine")
        Write-Host "   ✅ Set JAVA_HOME environment variable" -ForegroundColor Green
    }
    
    try {
        $version = java -version 2>&1 | Select-Object -First 1
        Write-Host "   📦 Version: $version" -ForegroundColor Gray
    } catch {
        Write-Host "   ⚠️  Java not in PATH (restart terminal after setup)" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ❌ Java JDK 17 not found" -ForegroundColor Red
    Write-Host "   📥 Download from: https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html" -ForegroundColor Yellow
    Write-Host "   📁 Install to: C:\Program Files\Java\jdk-17\" -ForegroundColor Yellow
}

# Check Android SDK
Write-Host "`n2️⃣ Checking Android SDK..." -ForegroundColor Yellow
$androidHome = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
$androidFound = Test-Path $androidHome

if ($androidFound) {
    Write-Host "   ✅ Android SDK found at: $androidHome" -ForegroundColor Green
    
    if ($Fix -and $isAdmin) {
        [Environment]::SetEnvironmentVariable("ANDROID_HOME", $androidHome, "Machine")
        Write-Host "   ✅ Set ANDROID_HOME environment variable" -ForegroundColor Green
        
        # Add platform-tools to PATH
        $platformTools = "$androidHome\platform-tools"
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        
        if ($currentPath -notlike "*$platformTools*") {
            [Environment]::SetEnvironmentVariable("Path", "$currentPath;$platformTools", "Machine")
            Write-Host "   ✅ Added platform-tools to PATH" -ForegroundColor Green
        } else {
            Write-Host "   ℹ️  Platform-tools already in PATH" -ForegroundColor Gray
        }
    }
    
    # Check for platform-tools
    $platformTools = "$androidHome\platform-tools"
    if (Test-Path $platformTools) {
        Write-Host "   ✅ Platform-tools found (includes ADB)" -ForegroundColor Green
        
        try {
            $adbVersion = adb version 2>&1 | Select-Object -First 1
            Write-Host "   📦 ADB: $adbVersion" -ForegroundColor Gray
        } catch {
            Write-Host "   ⚠️  ADB not in PATH (restart terminal after setup)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "   ❌ Android SDK not found" -ForegroundColor Red
    Write-Host "   📥 Option 1: Install Android Studio from https://developer.android.com/studio" -ForegroundColor Yellow
    Write-Host "   📥 Option 2: Download command-line tools from https://developer.android.com/studio#command-tools" -ForegroundColor Yellow
    Write-Host "   📁 Default location: C:\Users\$env:USERNAME\AppData\Local\Android\Sdk" -ForegroundColor Yellow
}

# Check Gradle
Write-Host "`n3️⃣ Checking Gradle..." -ForegroundColor Yellow
$gradlewPath = "C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\tests\simulation\android\gradlew.bat"

if (Test-Path $gradlewPath) {
    Write-Host "   ✅ Gradle wrapper found (gradlew.bat)" -ForegroundColor Green
    
    if ($javaFound) {
        try {
            Push-Location "C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\tests\simulation\android"
            $gradleVersion = .\gradlew --version 2>&1 | Select-String "Gradle" | Select-Object -First 1
            Write-Host "   📦 $gradleVersion" -ForegroundColor Gray
            Pop-Location
        } catch {
            Write-Host "   ⚠️  Cannot run Gradle (Java required)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ⚠️  Cannot run Gradle (Java not found)" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ❌ Gradle wrapper not found" -ForegroundColor Red
}

# Summary
Write-Host "`n" -NoNewline
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 Summary" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan

$ready = $javaFound -and $androidFound

if ($ready) {
    Write-Host "`n✅ Environment is ready for Android development!" -ForegroundColor Green
    
    if (-not $Fix) {
        Write-Host "`n💡 Run with -Fix flag to set environment variables:" -ForegroundColor Cyan
        Write-Host "   .\setup-android-env.ps1 -Fix" -ForegroundColor White
        Write-Host "`n⚠️  Must run as Administrator to set system variables" -ForegroundColor Yellow
    } else {
        if ($isAdmin) {
            Write-Host "`n🔄 Environment variables updated!" -ForegroundColor Green
            Write-Host "   Restart PowerShell/VS Code to apply changes" -ForegroundColor Yellow
        } else {
            Write-Host "`n⚠️  Not running as Administrator - cannot set environment variables" -ForegroundColor Red
            Write-Host "   Right-click → Run as Administrator" -ForegroundColor Yellow
        }
    }
    
    Write-Host "`n🎯 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Restart VS Code" -ForegroundColor White
    Write-Host "   2. Install recommended extensions (VS Code will prompt)" -ForegroundColor White
    Write-Host "   3. Press Ctrl+Shift+B → Select '🔨 Build Debug APK'" -ForegroundColor White
    Write-Host "   4. Connect Android device and run '📦 Install Debug APK'" -ForegroundColor White
    
} else {
    Write-Host "`n❌ Environment setup incomplete" -ForegroundColor Red
    
    if (-not $javaFound) {
        Write-Host "`n📥 Install Java JDK 17:" -ForegroundColor Yellow
        Write-Host "   https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html" -ForegroundColor White
    }
    
    if (-not $androidFound) {
        Write-Host "`n📥 Install Android SDK:" -ForegroundColor Yellow
        Write-Host "   https://developer.android.com/studio" -ForegroundColor White
    }
    
    Write-Host "`n📖 See .vscode/SETUP.md for detailed instructions" -ForegroundColor Cyan
}

Write-Host "`n"
