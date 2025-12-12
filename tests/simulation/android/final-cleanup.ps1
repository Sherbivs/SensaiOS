# Final Model Migration Cleanup Script
# Run this after imports are fixed to handle property/enum conversions

$ErrorActionPreference = "Continue"
$basePath = "c:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\tests\simulation\android\app\src\main\java\com\infinitygauntlet\simulation"

Write-Host "🔧 Final cleanup: Property names and enum conversions..." -ForegroundColor Cyan

# Files needing property/enum fixes
$criticalFiles = @(
    "services\TestRunnerService.kt",
    "services\ReportGeneratorService.kt",
    "utils\Extensions.kt",
    "utils\ReportFormatter.kt",
    "utils\TestRunner.kt"
)

foreach ($file in $criticalFiles) {
    $fullPath = Join-Path $basePath $file
    
    if (Test-Path $fullPath) {
        Write-Host "📝 Final cleanup: $file..." -ForegroundColor Yellow
        
        $content = Get-Content $fullPath -Raw
        
        # Add missing enum imports at top (after existing imports)
        if ($content -notmatch 'import com\.infinitygauntlet\.simulation\.domain\.models\.ResultStatus') {
            $content = $content -replace '(import com\.infinitygauntlet\.simulation\.domain\.models\.TestResult\nimport)', "import com.infinitygauntlet.simulation.domain.models.ResultStatus`n`$1"
        }
        if ($content -notmatch 'import com\.infinitygauntlet\.simulation\.domain\.models\.TestStatus') {
            $content = $content -replace '(import com\.infinitygauntlet\.simulation\.domain\.models\.TestScenario\nimport)', "import com.infinitygauntlet.simulation.domain.models.TestStatus`n`$1"
        }
        
        # Fix specific patterns in TestRunnerService and TestRunner
        # These need TestResult/TestScenario constructor fixes
        $content = $content -replace 'TestResult\(\s*id\s*=', 'TestResult(scenarioId ='
        $content = $content -replace 'testName\s*=', 'scenarioName ='
        $content = $content -replace 'failureReason\s*=', 'errorMessage ='
        $content = $content -replace 'timestamp\s*=(?!ed)', 'executionTimestamp ='
        
        # Fix enum status assignments
        $content = $content -replace '(?<![a-zA-Z])status\s*=\s*"PASSED"', 'status = ResultStatus.PASSED'
        $content = $content -replace '(?<![a-zA-Z])status\s*=\s*"FAILED"', 'status = ResultStatus.FAILED'
        $content = $content -replace '(?<![a-zA-Z])status\s*=\s*"ERROR"', 'status = ResultStatus.ERROR'
        $content = $content -replace '(?<![a-zA-Z])status\s*=\s*"SKIPPED"', 'status = ResultStatus.SKIPPED'
        
        # Fix when expressions comparing to strings
        $content = $content -replace '\.status\s*==\s*"PASSED"', '.status == ResultStatus.PASSED'
        $content = $content -replace '\.status\s*==\s*"FAILED"', '.status == ResultStatus.FAILED'
        $content = $content -replace '\.status\s*==\s*"ERROR"', '.status == ResultStatus.ERROR'
        $content = $content -replace '\.status\s*==\s*"SKIPPED"', '.status == ResultStatus.SKIPPED'
        
        # Remove computed properties from constructor calls (passRate, etc)
        $content = $content -replace ',\s*passRate\s*=\s*[^,\)]+', ''
        $content = $content -replace 'passRate\s*=\s*[^,\)]+,', ''
        
        # Fix sumOf ambiguity by adding type hints
        $content = $content -replace 'sumOf\s*\{\s*([^}]+)\.durationMs\s*\}', 'sumOf { $1.durationMs.toLong() }'
        $content = $content -replace 'sumOf\s*\{\s*([^}]+)\.estimatedDuration\s*\}', 'sumOf { $1.estimatedDuration.toLong() }'
        
        # Fix minBy/maxBy with nullable returns
        $content = $content -replace '\.minBy\s*\{\s*it\.durationMs\s*\}', '.minByOrNull { it.durationMs }'
        $content = $content -replace '\.maxBy\s*\{\s*it\.durationMs\s*\}', '.maxByOrNull { it.durationMs }'
        
        # Fix function calls that should be property access
        $content = $content -replace '\.passRate\(\)', '.passRate'
        $content = $content -replace '\.getDurationSeconds\(\)', '.formatDuration()'
        $content = $content -replace '\.getTotal\(\)', '.getTotal()'
        
        # Fix TestScenario enum categories (if applicable)
        $content = $content -replace 'TestCategory\.ONBOARDING', '"ONBOARDING"'
        $content = $content -replace 'TestCategory\.WILD_ENCOUNTERS', '"WILD_ENCOUNTERS"'
        $content = $content -replace 'TestCategory\.BATTLE_SYSTEM', '"BATTLE_SYSTEM"'
        $content = $content -replace 'TestCategory\.AI_VALIDATION', '"AI_VALIDATION"'
        $content = $content -replace 'TestCategory\.STRESS_TEST', '"STRESS_TEST"'
        
        Set-Content $fullPath $content -NoNewline
        Write-Host "✅ Cleaned up $file" -ForegroundColor Green
    }
}

Write-Host "`n🎉 Final cleanup complete!" -ForegroundColor Green
Write-Host "📋 Summary:" -ForegroundColor Cyan
Write-Host "  ✅ Imports fixed (domain models)" -ForegroundColor Green
Write-Host "  ✅ Property names updated (scenarioName, errorMessage, etc)" -ForegroundColor Green
Write-Host "  ✅ Enum conversions added (ResultStatus, TestStatus)" -ForegroundColor Green
Write-Host "  ✅ sumOf ambiguity resolved (.toLong())" -ForegroundColor Green
Write-Host "  ✅ Computed properties removed from constructors" -ForegroundColor Green
Write-Host "`n🔨 Next: Open Android Studio and run Build > Rebuild Project" -ForegroundColor Yellow
Write-Host "Expected: Compilation should succeed with new Clean Architecture!" -ForegroundColor Cyan
