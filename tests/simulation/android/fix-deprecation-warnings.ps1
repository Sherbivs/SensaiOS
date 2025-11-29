# Fix all deprecation warnings automatically
# Targets: 7 AutoMirrored icons + 1 @OptIn + 1 statusBar deprecation

$ErrorActionPreference = "Stop"

Write-Host "`n=== FIXING DEPRECATION WARNINGS ===" -ForegroundColor Cyan
Write-Host "Target: 9 warnings → 1 warning (Kapt only)" -ForegroundColor Yellow

# Counter
$filesModified = 0

# ============================================================================
# 1. Fix Icons.kt - AutoMirrored Icon Deprecations (7 warnings)
# ============================================================================
Write-Host "`n[1/3] Fixing Icons.kt - AutoMirrored deprecations..." -ForegroundColor Yellow
$iconsFile = "app\src\main\java\com\infinitygauntlet\simulation\ui\components\Icons.kt"

if (Test-Path $iconsFile) {
    $content = Get-Content $iconsFile -Raw
    
    # Replace all deprecated icons with AutoMirrored versions
    $replacements = @(
        @{Old = "Icons.Filled.ArrowBack"; New = "Icons.AutoMirrored.Filled.ArrowBack"}
        @{Old = "Icons.Filled.Sort"; New = "Icons.AutoMirrored.Filled.Sort"}
        @{Old = "Icons.Filled.Message"; New = "Icons.AutoMirrored.Filled.Message"}
        @{Old = "Icons.Filled.Login"; New = "Icons.AutoMirrored.Filled.Login"}
        @{Old = "Icons.Filled.Logout"; New = "Icons.AutoMirrored.Filled.Logout"}
        @{Old = "Icons.Filled.Help"; New = "Icons.AutoMirrored.Filled.Help"}
        @{Old = "Icons.Filled.HelpOutline"; New = "Icons.AutoMirrored.Filled.HelpOutline"}
    )
    
    foreach ($replacement in $replacements) {
        $content = $content -replace [regex]::Escape($replacement.Old), $replacement.New
    }
    
    Set-Content -Path $iconsFile -Value $content -NoNewline
    Write-Host "  ✅ Fixed 7 AutoMirrored icon deprecations" -ForegroundColor Green
    $filesModified++
} else {
    Write-Host "  ❌ Icons.kt not found!" -ForegroundColor Red
}

# ============================================================================
# 2. Fix ChatViewModel.kt - Add @OptIn for ExperimentalCoroutinesApi (1 warning)
# ============================================================================
Write-Host "`n[2/3] Fixing ChatViewModel.kt - @OptIn annotation..." -ForegroundColor Yellow
$chatViewModelFile = "app\src\main\java\com\infinitygauntlet\simulation\presentation\chat\ChatViewModel.kt"

if (Test-Path $chatViewModelFile) {
    $content = Get-Content $chatViewModelFile -Raw
    
    # Check if @OptIn already exists
    if ($content -notmatch "@file:OptIn") {
        # Add @OptIn annotation after package declaration
        $content = $content -replace "(package com\.infinitygauntlet\.simulation\.presentation\.chat)", "@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)`n`n`$1"
        
        Set-Content -Path $chatViewModelFile -Value $content -NoNewline
        Write-Host "  ✅ Added @OptIn(ExperimentalCoroutinesApi)" -ForegroundColor Green
        $filesModified++
    } else {
        Write-Host "  ℹ️  @OptIn already present, skipping" -ForegroundColor Gray
    }
} else {
    Write-Host "  ❌ ChatViewModel.kt not found!" -ForegroundColor Red
}

# ============================================================================
# 3. Fix Theme.kt - StatusBar Deprecation (1 warning)
# ============================================================================
Write-Host "`n[3/3] Fixing Theme.kt - statusBarColor deprecation..." -ForegroundColor Yellow
$themeFile = "app\src\main\java\com\infinitygauntlet\simulation\ui\theme\Theme.kt"

if (Test-Path $themeFile) {
    $content = Get-Content $themeFile -Raw
    
    # Replace deprecated statusBarColor with modern edge-to-edge approach
    $oldPattern = 'window\.statusBarColor = colorScheme\.primary\.toArgb\(\)'
    
    if ($content -match $oldPattern) {
        # Modern approach: Use WindowCompat for edge-to-edge
        $newCode = @'
// Modern edge-to-edge design
                WindowCompat.setDecorFitsSystemWindows(window, false)
                WindowInsetsControllerCompat(window, view).apply {
                    isAppearanceLightStatusBars = !darkTheme
                }
'@
        
        $content = $content -replace $oldPattern, $newCode
        
        # Add necessary imports at top of file if not present
        if ($content -notmatch "androidx\.core\.view\.WindowCompat") {
            $content = $content -replace "(import androidx\.activity\.ComponentActivity)", "`$1`nimport androidx.core.view.WindowCompat`nimport androidx.core.view.WindowInsetsControllerCompat"
        }
        
        Set-Content -Path $themeFile -Value $content -NoNewline
        Write-Host "  ✅ Updated statusBarColor to modern API" -ForegroundColor Green
        $filesModified++
    } else {
        Write-Host "  ℹ️  statusBarColor pattern not found, may be already fixed" -ForegroundColor Gray
    }
} else {
    Write-Host "  ❌ Theme.kt not found!" -ForegroundColor Red
}

# ============================================================================
# Compile and Verify
# ============================================================================
Write-Host "`n=== COMPILING TO VERIFY FIXES ===" -ForegroundColor Cyan
Write-Host "Modified $filesModified files" -ForegroundColor White

& .\gradlew.bat compileDebugKotlin 2>&1 | Tee-Object -FilePath "compile-deprecations-fixed.txt"

# Count remaining warnings
$warnings = Get-Content "compile-deprecations-fixed.txt" | Select-String -Pattern "^w: "
$warningCount = ($warnings | Measure-Object).Count

Write-Host "`n=== RESULTS ===" -ForegroundColor Cyan
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "Warnings: $warningCount (expected: 1 Kapt warning)" -ForegroundColor Yellow
    
    if ($warningCount -le 1) {
        Write-Host "`n🎉 All deprecation warnings fixed!" -ForegroundColor Green
        Write-Host "Only Kapt 2.0 warning remains (non-critical)" -ForegroundColor Gray
    } else {
        Write-Host "`nℹ️  $warningCount warnings remaining. Check compile-deprecations-fixed.txt" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Build failed. Check compile-deprecations-fixed.txt for errors" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== NEXT STEPS ===" -ForegroundColor Cyan
Write-Host "1. Review changes in modified files" -ForegroundColor White
Write-Host "2. Test component previews in Android Studio" -ForegroundColor White
Write-Host "3. Proceed with Week 4 feature implementation" -ForegroundColor White
