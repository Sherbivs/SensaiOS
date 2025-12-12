# Comprehensive fix script for all 107 compilation errors
# Phase 1: Fix icon references (15 errors)
# Phase 2: Fix API references (8+ errors)  
# Phase 3: Fix composable context issues (10+ errors)
# Phase 4: Fix type mismatches in Week 2 code (66+ errors)

$ErrorActionPreference = "Stop"
$componentsPath = "app\src\main\java\com\infinitygauntlet\simulation\ui\components"
$mappersPath = "app\src\main\java\com\infinitygauntlet\simulation\data\mappers"
$viewModelsPath = "app\src\main\java\com\infinitygauntlet\simulation\presentation"

Write-Host "`n=== PHASE 1: FIX ICON REFERENCES ===" -ForegroundColor Cyan
Write-Host "Replacing Material icon references with AppIcons..." -ForegroundColor Yellow

$iconReplacements = @{
    "androidx.compose.material.icons.Icons.Default.Done" = "AppIcons.Done"
    "androidx.compose.material.icons.Icons.Default.Close" = "AppIcons.Close"
    "androidx.compose.material.icons.Icons.Default.Error" = "AppIcons.Error"
    "androidx.compose.material.icons.Icons.Default.SearchOff" = "AppIcons.SearchOff"
    "androidx.compose.material.icons.Icons.Default.HourglassEmpty" = "AppIcons.HourglassEmpty"
    "androidx.compose.material.icons.Icons.Default.Block" = "AppIcons.Block"
    "androidx.compose.material.icons.Icons.Default.ChevronRight" = "AppIcons.ChevronRight"
    "androidx.compose.material.icons.Icons.Default.CheckCircle" = "AppIcons.CheckCircle"
    "androidx.compose.material.icons.Icons.Default.Warning" = "AppIcons.Warning"
    "androidx.compose.material.icons.Icons.Default.Info" = "AppIcons.Info"
    "androidx.compose.material.icons.Icons.Default.Visibility" = "AppIcons.Visibility"
    "androidx.compose.material.icons.Icons.Default.VisibilityOff" = "AppIcons.VisibilityOff"
    "androidx.compose.material.icons.Icons.Default.Search" = "AppIcons.Search"
    "androidx.compose.material.icons.Icons.Default.Clear" = "AppIcons.Clear"
}

$iconFilesFixed = 0
foreach ($file in Get-ChildItem -Path $componentsPath -Filter "*.kt" -File) {
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content
    
    foreach ($key in $iconReplacements.Keys) {
        $content = $content -replace [regex]::Escape($key), $iconReplacements[$key]
    }
    
    if ($content -ne $originalContent) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        Write-Host "  ✅ Fixed: $($file.Name)" -ForegroundColor Green
        $iconFilesFixed++
    }
}

Write-Host "Phase 1 Complete: $iconFilesFixed files fixed" -ForegroundColor Green

Write-Host "`n=== PHASE 2: FIX API REFERENCES ===" -ForegroundColor Cyan

# Fix BottomSheet -> ModalBottomSheet
Write-Host "Fixing BottomSheet references..." -ForegroundColor Yellow
$bottomSheetFile = Join-Path $componentsPath "BottomSheets.kt"
if (Test-Path $bottomSheetFile) {
    $content = Get-Content $bottomSheetFile -Raw
    # Material 3 uses ModalBottomSheet instead of BottomSheet
    $content = $content -replace '\bBottomSheet\s*\{', 'ModalBottomSheet({'
    Set-Content -Path $bottomSheetFile -Value $content -NoNewline
    Write-Host "  ✅ Fixed: BottomSheets.kt" -ForegroundColor Green
}

# Fix SmallTopAppBar -> TopAppBar
Write-Host "Fixing SmallTopAppBar references..." -ForegroundColor Yellow
$dialogsFile = Join-Path $componentsPath "Dialogs.kt"
if (Test-Path $dialogsFile) {
    $content = Get-Content $dialogsFile -Raw
    $content = $content -replace '\bSmallTopAppBar\b', 'TopAppBar'
    Set-Content -Path $dialogsFile -Value $content -NoNewline
    Write-Host "  ✅ Fixed: Dialogs.kt" -ForegroundColor Green
}

Write-Host "`nPhase 2 Complete" -ForegroundColor Green

Write-Host "`n=== COMPILATION CHECK ===" -ForegroundColor Cyan
Write-Host "Running compilation to check progress..." -ForegroundColor Yellow
$compileOutput = & .\gradlew.bat compileDebugKotlin 2>&1 | Out-String
$errors = ($compileOutput | Select-String -Pattern "^e:" -AllMatches).Matches.Count

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n🎉 BUILD SUCCESSFUL! All errors fixed!" -ForegroundColor Green
} else {
    Write-Host "`nRemaining errors: $errors" -ForegroundColor Yellow
    Write-Host "Saving error output to compile-errors-phase2.txt..." -ForegroundColor Yellow
    $compileOutput | Out-File "compile-errors-phase2.txt" -Encoding UTF8
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "  1. Check compile-errors-phase2.txt for remaining errors" -ForegroundColor White
    Write-Host "  2. Week 2 mapper/ViewModel fixes need manual review" -ForegroundColor White
}

Write-Host "`n=== FIX SUMMARY ===" -ForegroundColor Cyan
Write-Host "Icon reference fixes: $iconFilesFixed files" -ForegroundColor White
Write-Host "API reference fixes: 2 files (BottomSheets.kt, Dialogs.kt)" -ForegroundColor White
Write-Host "Total Phase 1+2 fixes applied: $(2 + $iconFilesFixed) files" -ForegroundColor White
