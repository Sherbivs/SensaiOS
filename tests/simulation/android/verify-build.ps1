<#
.SYNOPSIS
    Build Verification Script for Infinity Gauntlet Simulation Android App

.DESCRIPTION
    Performs comprehensive build verification:
    1. Checks environment setup (JAVA_HOME, Android SDK)
    2. Validates Gradle wrapper
    3. Performs Gradle sync
    4. Compiles all Kotlin files
    5. Runs lint checks
    6. Generates build report

.NOTES
    Week 3 → Week 4 Transition
    Created: November 29, 2025
#>

param(
    [switch]$SkipLint,
    [switch]$Verbose
)

# ════════════════════════════════════════════════════════════════════════════════
# HEADER
# ════════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🔍 BUILD VERIFICATION - Week 3 Component Library" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

# ════════════════════════════════════════════════════════════════════════════════
# STEP 1: ENVIRONMENT CHECK
# ════════════════════════════════════════════════════════════════════════════════

Write-Host "📋 STEP 1: Environment Check" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# Check JAVA_HOME
$javaHome = $env:JAVA_HOME
if (-not $javaHome) {
    Write-Host "⚠️  JAVA_HOME not set, checking Android Studio JDK..." -ForegroundColor Yellow
    
    $androidStudioJdk = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $androidStudioJdk) {
        $env:JAVA_HOME = $androidStudioJdk
        $env:PATH = "$androidStudioJdk\bin;$env:PATH"
        Write-Host "✅ Using Android Studio JDK: $androidStudioJdk" -ForegroundColor Green
    } else {
        Write-Host "❌ ERROR: Java not found. Please install Android Studio or set JAVA_HOME" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ JAVA_HOME: $javaHome" -ForegroundColor Green
}

# Verify Java version
try {
    $javaVersion = & java -version 2>&1 | Select-String "version" | Select-Object -First 1
    Write-Host "✅ Java Version: $javaVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ ERROR: Cannot execute java. Check JAVA_HOME setup" -ForegroundColor Red
    exit 1
}

# Check Android SDK
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) {
    $androidHome = $env:ANDROID_SDK_ROOT
}
if ($androidHome) {
    Write-Host "✅ Android SDK: $androidHome" -ForegroundColor Green
} else {
    Write-Host "⚠️  Android SDK location not set (ANDROID_HOME/ANDROID_SDK_ROOT)" -ForegroundColor Yellow
    Write-Host "   This may cause issues during build" -ForegroundColor Yellow
}

Write-Host ""

# ════════════════════════════════════════════════════════════════════════════════
# STEP 2: GRADLE WRAPPER CHECK
# ════════════════════════════════════════════════════════════════════════════════

Write-Host "📦 STEP 2: Gradle Wrapper Check" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

$gradleWrapperJar = "gradle\wrapper\gradle-wrapper.jar"
if (-not (Test-Path $gradleWrapperJar)) {
    Write-Host "⚠️  Gradle wrapper JAR missing, downloading..." -ForegroundColor Yellow
    
    # Download gradle-wrapper.jar from official source
    $wrapperUrl = "https://raw.githubusercontent.com/gradle/gradle/master/gradle/wrapper/gradle-wrapper.jar"
    try {
        New-Item -ItemType Directory -Force -Path "gradle\wrapper" | Out-Null
        Invoke-WebRequest -Uri $wrapperUrl -OutFile $gradleWrapperJar
        Write-Host "✅ Downloaded gradle-wrapper.jar" -ForegroundColor Green
    } catch {
        Write-Host "❌ ERROR: Failed to download gradle-wrapper.jar: $_" -ForegroundColor Red
        Write-Host "   Please run this from Android Studio: Tools → Gradle → Generate Gradle wrapper" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "✅ Gradle wrapper JAR exists" -ForegroundColor Green
}

Write-Host ""

# ════════════════════════════════════════════════════════════════════════════════
# STEP 3: FILE INVENTORY
# ════════════════════════════════════════════════════════════════════════════════

Write-Host "📊 STEP 3: Week 3 File Inventory" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

$themeFiles = @(
    "app\src\main\java\com\infinitygauntlet\simulation\ui\theme\Color.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\theme\ColorScheme.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\theme\ColorUtils.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\theme\Type.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\theme\TypeUtils.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\theme\Shape.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\theme\Dimension.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\theme\Theme.kt"
)

$componentFiles = @(
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Buttons.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Cards.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\TextFields.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Chips.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Progress.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Dialogs.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\BottomSheets.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Navigation.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Lists.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Badges.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\EmptyStates.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Snackbars.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Surfaces.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Icons.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\PokemonComponents.kt",
    "app\src\main\java\com\infinitygauntlet\simulation\ui\components\ComponentPreviews.kt"
)

$themeCount = 0
$themeMissing = @()
foreach ($file in $themeFiles) {
    if (Test-Path $file) {
        $themeCount++
    } else {
        $themeMissing += $file
    }
}

$componentCount = 0
$componentMissing = @()
foreach ($file in $componentFiles) {
    if (Test-Path $file) {
        $componentCount++
    } else {
        $componentMissing += $file
    }
}

Write-Host "Theme Files: $themeCount / $($themeFiles.Count)" -ForegroundColor $(if ($themeCount -eq $themeFiles.Count) { "Green" } else { "Yellow" })
Write-Host "Component Files: $componentCount / $($componentFiles.Count)" -ForegroundColor $(if ($componentCount -eq $componentFiles.Count) { "Green" } else { "Yellow" })

if ($themeMissing.Count -gt 0) {
    Write-Host ""
    Write-Host "⚠️  Missing Theme Files:" -ForegroundColor Yellow
    foreach ($file in $themeMissing) {
        Write-Host "   - $file" -ForegroundColor Yellow
    }
}

if ($componentMissing.Count -gt 0) {
    Write-Host ""
    Write-Host "⚠️  Missing Component Files:" -ForegroundColor Yellow
    foreach ($file in $componentMissing) {
        Write-Host "   - $file" -ForegroundColor Yellow
    }
}

$totalFiles = $themeCount + $componentCount
$expectedFiles = $themeFiles.Count + $componentFiles.Count

if ($totalFiles -eq $expectedFiles) {
    Write-Host ""
    Write-Host "✅ All $expectedFiles Week 3 files present" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "⚠️  $($expectedFiles - $totalFiles) files missing" -ForegroundColor Yellow
}

Write-Host ""

# ════════════════════════════════════════════════════════════════════════════════
# STEP 4: GRADLE SYNC
# ════════════════════════════════════════════════════════════════════════════════

Write-Host "🔄 STEP 4: Gradle Sync" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

Write-Host "Running: .\gradlew.bat --refresh-dependencies" -ForegroundColor Cyan

try {
    $syncOutput = & .\gradlew.bat --refresh-dependencies 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Gradle sync successful" -ForegroundColor Green
        if ($Verbose) {
            Write-Host ""
            Write-Host "Sync Output:" -ForegroundColor DarkGray
            Write-Host $syncOutput -ForegroundColor DarkGray
        }
    } else {
        Write-Host "❌ Gradle sync failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Error Output:" -ForegroundColor Red
        Write-Host $syncOutput -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ ERROR: Failed to run Gradle sync: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ════════════════════════════════════════════════════════════════════════════════
# STEP 5: COMPILE CHECK
# ════════════════════════════════════════════════════════════════════════════════

Write-Host "🔨 STEP 5: Compile Check" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

Write-Host "Running: .\gradlew.bat compileDebugKotlin" -ForegroundColor Cyan

try {
    $compileOutput = & .\gradlew.bat compileDebugKotlin 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Kotlin compilation successful" -ForegroundColor Green
        
        # Check for warnings
        $warnings = $compileOutput | Select-String "warning:" -AllMatches
        if ($warnings) {
            Write-Host ""
            Write-Host "⚠️  $($warnings.Matches.Count) compilation warnings found" -ForegroundColor Yellow
            if ($Verbose) {
                foreach ($warning in $warnings) {
                    Write-Host "   $warning" -ForegroundColor Yellow
                }
            }
        }
    } else {
        Write-Host "❌ Kotlin compilation failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Error Output:" -ForegroundColor Red
        Write-Host $compileOutput -ForegroundColor Red
        
        # Parse errors
        $compileErrors = $compileOutput | Select-String "error:" -AllMatches
        if ($compileErrors) {
            Write-Host ""
            Write-Host "Compilation Errors Found:" -ForegroundColor Red
            foreach ($compileError in $compileErrors) {
                Write-Host "   $compileError" -ForegroundColor Red
            }
        }
        
        exit 1
    }
} catch {
    Write-Host "❌ ERROR: Failed to compile: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ════════════════════════════════════════════════════════════════════════════════
# STEP 6: LINT CHECK (Optional)
# ════════════════════════════════════════════════════════════════════════════════

if (-not $SkipLint) {
    Write-Host "🧹 STEP 6: Lint Check" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host ""
    
    Write-Host "Running: .\gradlew.bat lintDebug" -ForegroundColor Cyan
    
    try {
        $lintOutput = & .\gradlew.bat lintDebug 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Lint check passed" -ForegroundColor Green
            
            # Check for lint report
            $lintReport = "app\build\reports\lint-results-debug.html"
            if (Test-Path $lintReport) {
                Write-Host "📄 Lint report: $lintReport" -ForegroundColor Cyan
            }
        } else {
            Write-Host "⚠️  Lint check found issues (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
            if ($Verbose) {
                Write-Host ""
                Write-Host "Lint Output:" -ForegroundColor DarkGray
                Write-Host $lintOutput -ForegroundColor DarkGray
            }
        }
    } catch {
        Write-Host "⚠️  Lint check failed: $_" -ForegroundColor Yellow
    }
    
    Write-Host ""
}

# ════════════════════════════════════════════════════════════════════════════════
# STEP 7: BUILD REPORT
# ════════════════════════════════════════════════════════════════════════════════

Write-Host "📈 STEP 7: Build Report" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host "Build Duration: $($duration.TotalSeconds) seconds" -ForegroundColor Cyan
Write-Host "Files Verified: $totalFiles / $expectedFiles" -ForegroundColor Cyan

# Check build output size
$buildDir = "app\build"
if (Test-Path $buildDir) {
    $buildSize = (Get-ChildItem -Path $buildDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "Build Output: $([math]::Round($buildSize, 2)) MB" -ForegroundColor Cyan
}

Write-Host ""

# ════════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════════════════════

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "✅ BUILD VERIFICATION COMPLETE" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "Week 3 component library is ready for Week 4 feature implementation!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Open Android Studio" -ForegroundColor White
Write-Host "  2. File → Open → Select this project directory" -ForegroundColor White
Write-Host "  3. Wait for Gradle sync to complete" -ForegroundColor White
Write-Host "  4. Open ComponentPreviews.kt to test components" -ForegroundColor White
Write-Host "  5. Use preview pane to verify components render correctly" -ForegroundColor White
Write-Host ""
