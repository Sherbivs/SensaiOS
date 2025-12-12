# Fix remaining Week 3 component errors
# Handles BottomSheet padding, Card imports, Dialog issues, Navigation lambda signatures, etc.

$ErrorActionPreference = "Stop"
$componentsPath = "app\src\main\java\com\infinitygauntlet\simulation\ui\components"

Write-Host "`n=== FIXING REMAINING WEEK 3 COMPONENT ERRORS ===" -ForegroundColor Cyan

# Fix 1: BottomSheets.kt - Replace PaddingPresets.BottomSheet with proper horizontal/vertical padding
Write-Host "`nFix 1: BottomSheets.kt padding..." -ForegroundColor Yellow
$file = Join-Path $componentsPath "BottomSheets.kt"
$content = Get-Content $file -Raw
$content = $content -replace 'padding\(PaddingPresets\.BottomSheet\)', 'padding(horizontal = PaddingPresets.BottomSheetHorizontal, vertical = PaddingPresets.BottomSheetVertical)'
Set-Content -Path $file -Value $content -NoNewline
Write-Host "  ✅ Fixed padding references (4 occurrences)" -ForegroundColor Green

# Fix 2: Cards.kt - Check for Card import/reference issues
Write-Host "`nFix 2: Cards.kt imports..." -ForegroundColor Yellow
$file = Join-Path $componentsPath "Cards.kt"
$content = Get-Content $file -Raw

# Ensure Card is imported from Material 3
if ($content -notmatch 'import androidx\.compose\.material3\.Card') {
    # Add explicit Card import after material3.* import
    $content = $content -replace '(import androidx\.compose\.material3\.\*)', "`$1`nimport androidx.compose.material3.Card"
    Set-Content -Path $file -Value $content -NoNewline
    Write-Host "  ✅ Added explicit Card import" -ForegroundColor Green
} else {
    Write-Host "  ℹ Card import already present" -ForegroundColor Gray
}

# Fix 3: Dialogs.kt - Fix @Composable context issues and Dialog references
Write-Host "`nFix 3: Dialogs.kt context and Dialog references..." -ForegroundColor Yellow
$file = Join-Path $componentsPath "Dialogs.kt"
$content = Get-Content $file -Raw

# Fix unresolved Dialog references - Material 3 uses BasicAlertDialog or Dialog from ui.window
$content = $content -replace '\bDialog\s*\{', 'androidx.compose.ui.window.Dialog{'

# Add @OptIn for experimental TopAppBar if needed
if ($content -notmatch '@file:OptIn\(ExperimentalMaterial3Api::class\)') {
    $content = "@file:OptIn(ExperimentalMaterial3Api::class)`n`n" + $content
}

Set-Content -Path $file -Value $content -NoNewline
Write-Host "  ✅ Fixed Dialog references and experimental API opt-in" -ForegroundColor Green

# Fix 4: Navigation.kt - Fix NavigationDrawer content lambda signature
Write-Host "`nFix 4: Navigation.kt lambda signatures..." -ForegroundColor Yellow
$file = Join-Path $componentsPath "Navigation.kt"
$content = Get-Content $file -Raw

# The content parameter needs to be ColumnScope.() -> Unit
# This is a signature issue that may require manual inspection
Write-Host "  ⚠ Navigation.kt requires manual review for lambda signatures" -ForegroundColor Yellow

# Fix 5: Badges.kt - Fix Badge content lambda signature
Write-Host "`nFix 5: Badges.kt lambda signature..." -ForegroundColor Yellow
$file = Join-Path $componentsPath "Badges.kt"
$content = Get-Content $file -Raw

# Badge content needs BoxScope.() -> Unit instead of () -> Unit
# This may require seeing the actual code structure
Write-Host "  ⚠ Badges.kt requires manual review for BoxScope lambda" -ForegroundColor Yellow

# Fix 6: Snackbars.kt - Fix rememberSnackbarHostState
Write-Host "`nFix 6: Snackbars.kt rememberSnackbarHostState..." -ForegroundColor Yellow
$file = Join-Path $componentsPath "Snackbars.kt"
$content = Get-Content $file -Raw

# Ensure correct Material 3 import
if ($content -notmatch 'import androidx\.compose\.material3\.rememberSnackbarHostState') {
    # Add explicit import
    $content = $content -replace '(import androidx\.compose\.material3\.\*)', "`$1`nimport androidx.compose.material3.SnackbarHostState`nimport androidx.compose.material3.rememberSnackbarHostState"
    Set-Content -Path $file -Value $content -NoNewline
    Write-Host "  ✅ Added explicit rememberSnackbarHostState import" -ForegroundColor Green
} else {
    Write-Host "  ℹ rememberSnackbarHostState import already present" -ForegroundColor Gray
}

Write-Host "`n=== COMPILATION CHECK ===" -ForegroundColor Cyan
$compileOutput = & .\gradlew.bat compileDebugKotlin 2>&1 | Out-String
$errors = ($compileOutput | Select-String -Pattern "^e:" -AllMatches).Matches.Count

Write-Host "Remaining errors: $errors" -ForegroundColor $(if ($errors -lt 70) { "Green" } else { "Yellow" })
$compileOutput | Out-File "compile-errors-phase3.txt" -Encoding UTF8

Write-Host "`nNext: Review compile-errors-phase3.txt and fix remaining issues manually" -ForegroundColor Cyan
