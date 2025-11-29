# verify-upgrade-complete.ps1
# Comprehensive verification of AGP and Gradle upgrade

Write-Host @"

╔════════════════════════════════════════════════════════════════════════════╗
║  🔍 COMPLETE UPGRADE VERIFICATION                                          ║
╚════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

$allGood = $true

Write-Host "1️⃣  CHECKING ANDROID GRADLE PLUGIN VERSION`n" -ForegroundColor Yellow

$agpFiles = @(
    "build.gradle.kts",
    "app/build.gradle.kts",
    "gradle/libs.versions.toml"
)

$agpFound = $false
foreach ($file in $agpFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        if ($content -match '8\.13\.1') {
            Write-Host "  ✅ $file contains AGP 8.13.1" -ForegroundColor Green
            $agpFound = $true
        }
    }
}

if (-not $agpFound) {
    Write-Host "  ⚠️  AGP 8.13.1 not found in configuration files" -ForegroundColor Yellow
    $allGood = $false
}

Write-Host "`n2️⃣  CHECKING GRADLE WRAPPER VERSION`n" -ForegroundColor Yellow

$wrapperFile = "gradle/wrapper/gradle-wrapper.properties"
if (Test-Path $wrapperFile) {
    $wrapperContent = Get-Content $wrapperFile -Raw
    
    if ($wrapperContent -match 'gradle-8\.13-bin\.zip') {
        Write-Host "  ✅ Gradle wrapper configured for 8.13" -ForegroundColor Green
        Write-Host "     File: $wrapperFile" -ForegroundColor Gray
    } elseif ($wrapperContent -match 'gradle-(\d+\.\d+)') {
        Write-Host "  ❌ Wrong Gradle version: $($matches[1])" -ForegroundColor Red
        Write-Host "     Expected: 8.13" -ForegroundColor Yellow
        $allGood = $false
    } else {
        Write-Host "  ⚠️  Could not determine Gradle version" -ForegroundColor Yellow
        $allGood = $false
    }
} else {
    Write-Host "  ❌ gradle-wrapper.properties not found!" -ForegroundColor Red
    $allGood = $false
}

Write-Host "`n3️⃣  CHECKING GRADLE EXECUTABLE`n" -ForegroundColor Yellow

if (Test-Path "gradlew.bat") {
    Write-Host "  ✅ Gradle wrapper (gradlew.bat) exists" -ForegroundColor Green
    
    Write-Host "`n     Testing Gradle version..." -ForegroundColor Gray
    Write-Host "     (This will download Gradle 8.13 if not cached)`n" -ForegroundColor Gray
    
    try {
        $gradleVersion = & .\gradlew.bat --version 2>&1 | Select-String "Gradle"
        Write-Host "     $gradleVersion" -ForegroundColor White
        
        if ($gradleVersion -match "8\.13") {
            Write-Host "`n  ✅ Gradle 8.13 is active" -ForegroundColor Green
        } else {
            Write-Host "`n  ⚠️  Gradle version mismatch detected" -ForegroundColor Yellow
            Write-Host "     Run: .\gradlew.bat --stop" -ForegroundColor Gray
            Write-Host "     Then: .\gradlew.bat --version" -ForegroundColor Gray
        }
    } catch {
        Write-Host "     ⚠️  Could not execute gradlew.bat" -ForegroundColor Yellow
        Write-Host "     This is normal - sync in Android Studio first" -ForegroundColor Gray
    }
} else {
    Write-Host "  ⚠️  gradlew.bat not found" -ForegroundColor Yellow
    Write-Host "     Sync project in Android Studio to generate" -ForegroundColor Gray
}

Write-Host "`n📊 VERIFICATION SUMMARY`n" -ForegroundColor Cyan

if ($allGood) {
    Write-Host @"
  ✅ ALL CHECKS PASSED

  Configuration is ready:
    • AGP 8.13.1 configured
    • Gradle 8.13 configured
    • Wrapper properties updated

  Next Step:
    Sync project in Android Studio

"@ -ForegroundColor Green
} else {
    Write-Host @"
  ⚠️  SOME ISSUES DETECTED

  Review the warnings above and:
    1. Ensure all files are saved
    2. Sync project in Android Studio
    3. Run this script again

"@ -ForegroundColor Yellow
}

Write-Host "🔄 NEXT: Open Android Studio → File → Sync Project with Gradle Files`n" -ForegroundColor Cyan
