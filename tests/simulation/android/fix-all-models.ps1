# Comprehensive Model Migration Script
# Fixes all import statements and property references to use domain models

$ErrorActionPreference = "Continue"

Write-Host "🔧 Starting comprehensive model migration..." -ForegroundColor Cyan

# Define all files that need fixing
$filesToFix = @(
    "app/src/main/java/com/infinitygauntlet/simulation/services/ReportGeneratorService.kt",
    "app/src/main/java/com/infinitygauntlet/simulation/services/TestRunnerService.kt",
    "app/src/main/java/com/infinitygauntlet/simulation/utils/Extensions.kt",
    "app/src/main/java/com/infinitygauntlet/simulation/utils/ReportFormatter.kt",
    "app/src/main/java/com/infinitygauntlet/simulation/utils/TestRunner.kt"
)

foreach ($file in $filesToFix) {
    $fullPath = Join-Path $PSScriptRoot $file
    
    if (Test-Path $fullPath) {
        Write-Host "📝 Processing $file..." -ForegroundColor Yellow
        
        $content = Get-Content $fullPath -Raw
        
        # Fix imports
        $content = $content -replace 'import com\.infinitygauntlet\.simulation\.models\.TestResult', 'import com.infinitygauntlet.simulation.domain.models.TestResult'
        $content = $content -replace 'import com\.infinitygauntlet\.simulation\.models\.TestScenario', 'import com.infinitygauntlet.simulation.domain.models.TestScenario'
        $content = $content -replace 'import com\.infinitygauntlet\.simulation\.models\.ChatMessage', 'import com.infinitygauntlet.simulation.domain.models.ChatMessage'
        
        # Add ResultStatus and TestStatus imports where needed
        if ($content -notmatch 'import com\.infinitygauntlet\.simulation\.domain\.models\.ResultStatus') {
            $content = $content -replace '(import com\.infinitygauntlet\.simulation\.domain\.models\.TestResult)', "`$1`nimport com.infinitygauntlet.simulation.domain.models.ResultStatus"
        }
        if ($content -notmatch 'import com\.infinitygauntlet\.simulation\.domain\.models\.TestStatus') {
            $content = $content -replace '(import com\.infinitygauntlet\.simulation\.domain\.models\.TestScenario)', "`$1`nimport com.infinitygauntlet.simulation.domain.models.TestStatus"
        }
        
        # Fix property references
        $content = $content -replace '\.testName', '.scenarioName'
        $content = $content -replace '\.failureReason', '.errorMessage'
        $content = $content -replace '\.passedCount', '.passedTests'
        $content = $content -replace '\.failedCount', '.failedTests'
        $content = $content -replace '\.skippedCount', '.skippedTests'
        $content = $content -replace '\.expectedDurationMs', '.estimatedDuration'
        $content = $content -replace '\.timestamp(?!ed)', '.executionTimestamp'
        
        # Fix status string comparisons to enum
        $content = $content -replace '\.status\s*==\s*"passed"', '.status == ResultStatus.PASSED'
        $content = $content -replace '\.status\s*==\s*"failed"', '.status == ResultStatus.FAILED'
        $content = $content -replace '\.status\s*==\s*"error"', '.status == ResultStatus.ERROR'
        $content = $content -replace '\.status\s*==\s*"skipped"', '.status == ResultStatus.SKIPPED'
        $content = $content -replace 'status\s*=\s*"passed"', 'status = ResultStatus.PASSED'
        $content = $content -replace 'status\s*=\s*"failed"', 'status = ResultStatus.FAILED'
        $content = $content -replace 'status\s*=\s*"error"', 'status = ResultStatus.ERROR'
        $content = $content -replace 'status\s*=\s*"skipped"', 'status = ResultStatus.SKIPPED'
        
        # Fix computed properties (change from constructor params to accessed properties)
        $content = $content -replace 'passRate\s*=\s*[^,\n]+', '// passRate is computed property'
        
        # Fix sumOf ambiguity
        $content = $content -replace 'sumOf\s*\{\s*it\.durationMs\s*\}', 'sumOf { it.durationMs.toLong() }'
        $content = $content -replace 'sumOf\s*\{\s*it\.estimatedDuration\s*\}', 'sumOf { it.estimatedDuration.toLong() }'
        
        # Fix function calls vs properties
        $content = $content -replace '\.passRate\(\)', '.passRate'
        $content = $content -replace '\.averageDuration\(\)', '.averageDuration'
        $content = $content -replace '\.totalDuration\(\)', '.totalDuration'
        
        # Save fixed content
        Set-Content $fullPath $content -NoNewline
        
        Write-Host "✅ Fixed $file" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️ File not found: $file" -ForegroundColor Red
    }
}

Write-Host "`n🎉 Model migration complete!" -ForegroundColor Green
Write-Host "Next: Run './gradlew assembleDebug' to test compilation" -ForegroundColor Cyan
