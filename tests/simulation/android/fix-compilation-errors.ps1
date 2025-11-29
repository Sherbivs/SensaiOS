<#
.SYNOPSIS
    Automated fix script for Week 3 component compilation errors

.DESCRIPTION
    Performs systematic replacements across all component files to fix:
    - PaddingPresets.Screen → Spacing.Medium
    - verticalAlignment = Arrangement → verticalArrangement = Arrangement
    - Adds missing imports

.NOTES
    Week 3 Component Library - Compilation Fix Automation
    Created: November 29, 2025
#>

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🔧 AUTOMATED COMPILATION FIXES - Week 3 Component Library" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$fixCount = 0

# ════════════════════════════════════════════════════════════════════════════════
# FIX 1: Replace PaddingPresets.Screen with Spacing.Medium
# ════════════════════════════════════════════════════════════════════════════════

Write-Host "🔧 Fix 1: Replacing PaddingPresets.Screen with Spacing.Medium..." -ForegroundColor Yellow

$componentsDir = "app\src\main\java\com\infinitygauntlet\simulation\ui\components"
$files = Get-ChildItem -Path $componentsDir -Filter "*.kt" -Recurse

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    if ($content -match "PaddingPresets\.Screen") {
        $newContent = $content -replace "PaddingPresets\.Screen", "Spacing.Medium"
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        Write-Host "  ✅ Fixed: $($file.Name)" -ForegroundColor Green
        $fixCount++
    }
}

# ════════════════════════════════════════════════════════════════════════════════
# FIX 2: Replace verticalAlignment with verticalArrangement
# ════════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "🔧 Fix 2: Fixing Column parameter (verticalAlignment → verticalArrangement)..." -ForegroundColor Yellow

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    if ($content -match "verticalAlignment = Arrangement") {
        $newContent = $content -replace "verticalAlignment = Arrangement", "verticalArrangement = Arrangement"
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        Write-Host "  ✅ Fixed: $($file.Name)" -ForegroundColor Green
        $fixCount++
    }
}

# ════════════════════════════════════════════════════════════════════════════════
# FIX 3: Add @OptIn for ExperimentalLayoutApi where FlowRow is used
# ════════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "🔧 Fix 3: Adding @OptIn for ExperimentalLayoutApi..." -ForegroundColor Yellow

$filesToAddOptIn = @("Chips.kt", "ComponentPreviews.kt")

foreach ($fileName in $filesToAddOptIn) {
    $filePath = Join-Path $componentsDir $fileName
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw
        
        # Check if FlowRow is used but @OptIn is not present
        if ($content -match "FlowRow" -and $content -notmatch "@file:OptIn\(ExperimentalLayoutApi::class\)") {
            # Add @OptIn after package declaration
            $newContent = $content -replace "(package [^\r\n]+)", "`$1`r`n`r`n@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)"
            
            # Add import if not present
            if ($newContent -notmatch "import androidx\.compose\.foundation\.layout\.ExperimentalLayoutApi") {
                $newContent = $newContent -replace "(import androidx\.compose\.foundation\.layout\.\*)", "`$1`r`nimport androidx.compose.foundation.layout.ExperimentalLayoutApi"
            }
            
            Set-Content -Path $filePath -Value $newContent -NoNewline
            Write-Host "  ✅ Fixed: $fileName" -ForegroundColor Green
            $fixCount++
        }
    }
}

# ════════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "✅ AUTOMATED FIXES COMPLETE" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "Total files fixed: $fixCount" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: Run .\verify-build.ps1 to check compilation status" -ForegroundColor Yellow
Write-Host ""
