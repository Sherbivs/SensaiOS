# Delete Remaining Historical Documentation (Phase 0 Completion)
# Removes all remaining DELETE-classified files from docs/historical/
# Part of 20-week Documentation Overhaul 2025

param(
    [switch]$DryRun,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Files to DELETE (all historical except 3 CONSOLIDATE files)
$deleteFiles = @(
    # docs/historical/completion-reports/ (DELETE ALL - 17 files except README which was deleted Week 1)
    "docs/historical/completion-reports/COMPLETE-SESSION-SUMMARY.md",
    "docs/historical/completion-reports/error-logging-integration-COMPLETE.md",
    "docs/historical/completion-reports/METICULOUS-DEPLOYMENT-COMPLETE.md",
    "docs/historical/completion-reports/phase1-migration-complete.md",
    "docs/historical/completion-reports/phase1-service-registry-complete.md",
    "docs/historical/completion-reports/phase2-console-logging-complete.md",
    "docs/historical/completion-reports/phase2.1-event-bus-foundation-complete.md",
    "docs/historical/completion-reports/phase2.2-errortracker-migration-complete.md",
    "docs/historical/completion-reports/phase2.3-dripalertmanager-migration-complete.md",
    "docs/historical/completion-reports/phase2.4.1-intelligentlogger-dual-emission-complete.md",
    "docs/historical/completion-reports/phase2.4.3-intelligentlogger-eventbus-exclusive-complete.md",
    "docs/historical/completion-reports/README.md",
    "docs/historical/completion-reports/render-ssh-complete-guide.md",
    "docs/historical/completion-reports/TASK1-DEPLOYMENT-COMPLETE.md",
    "docs/historical/completion-reports/task10-error-alerting-complete.md",
    "docs/historical/completion-reports/task11-error-recovery-complete.md",
    "docs/historical/completion-reports/task12-error-testing-complete.md",
    "docs/historical/completion-reports/task13-documentation-complete.md",
    "docs/historical/completion-reports/task9-complete-summary.md",
    "docs/historical/completion-reports/timezone-standardization-complete.md",

    # docs/historical/resource-system/ (DELETE 11 of 14 files)
    "docs/historical/resource-system/RESOURCE-LEAK-AUDIT-RESULTS.md",
    "docs/historical/resource-system/RESOURCE-LEAK-AUDIT.md",
    "docs/historical/resource-system/RESOURCE-LEAK-FINDINGS.md",
    "docs/historical/resource-system/resource-manager-integration.md",
    "docs/historical/resource-system/RESOURCE-MANAGER-QUICK-REF.md",
    "docs/historical/resource-system/RESOURCE-MANAGER-SUMMARY.md",
    "docs/historical/resource-system/resource-manager.md",
    "docs/historical/resource-system/resource-monitor-integration-summary.md",
    "docs/historical/resource-system/resource-monitor-manual-validation.md",
    "docs/historical/resource-system/resource-monitor-perfection.md",
    "docs/historical/resource-system/RESOURCE-MONITOR-QUICK-REF.md",

    # docs/historical/system-audits/ (DELETE ALL - 4 files)
    "docs/historical/system-audits/ADAPTIVE-POLLING-AUDIT.md",
    "docs/historical/system-audits/CACHE-ADAPTIVE-POLLING.md",
    "docs/historical/system-audits/README.md",
    "docs/historical/system-audits/REPORTING-ACCURACY-AUDIT.md"

    # KEEP (CONSOLIDATE - do NOT delete):
    # docs/historical/memory-investigations/memory-analysis-summary.md → DEVELOPMENT-BIBLE Performance
    # docs/historical/memory-investigations/MEMORY-MONITORING-QUICK-REF.md → OPERATIONS-BIBLE Monitoring
    # docs/historical/memory-investigations/memory-profiling-report.md → DEVELOPMENT-BIBLE Performance
)

# Summary counters
$totalFiles = $deleteFiles.Count
$deletedCount = 0
$failedCount = 0
$skippedCount = 0

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Delete Remaining Historical Docs (Phase 0 Completion)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Total files to process: $totalFiles" -ForegroundColor Yellow
Write-Host ""

if ($DryRun) {
    Write-Host "[DRY-RUN MODE] No files will be deleted" -ForegroundColor Green
    Write-Host ""
}

# Process each file
foreach ($file in $deleteFiles) {
    $fullPath = Join-Path $PSScriptRoot ".." $file
    $exists = Test-Path $fullPath

    if ($Verbose) {
        $status = if ($exists) { "[EXISTS]" } else { "[MISSING]" }
        $color = if ($exists) { "White" } else { "DarkGray" }
        Write-Host "$status $file" -ForegroundColor $color
    }

    if (-not $exists) {
        $skippedCount++
        continue
    }

    if (-not $DryRun) {
        try {
            Remove-Item -Path $fullPath -Force
            $deletedCount++
            if ($Verbose) {
                Write-Host "  ✓ Deleted" -ForegroundColor Green
            }
        }
        catch {
            $failedCount++
            Write-Host "  ✗ Failed: $_" -ForegroundColor Red
        }
    }
    else {
        $deletedCount++
    }
}

# Summary
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Total files processed: $totalFiles" -ForegroundColor White
Write-Host "Deleted: $deletedCount" -ForegroundColor Green
Write-Host "Failed: $failedCount" -ForegroundColor $(if ($failedCount -eq 0) { "Green" } else { "Red" })
Write-Host "Skipped (not found): $skippedCount" -ForegroundColor Yellow
Write-Host ""

if (-not $DryRun -and $deletedCount -gt 0) {
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "1. Review changes: git status" -ForegroundColor White
    Write-Host "2. Commit deletion: git add -A && git commit -m '[Phase 0] Delete remaining 35 historical files'" -ForegroundColor White
    Write-Host "3. Update classification matrix (mark historical completion-reports, resource-system, system-audits as DELETED)" -ForegroundColor White
    Write-Host ""
    Write-Host "Files PRESERVED for consolidation (3 files):" -ForegroundColor Cyan
    Write-Host "  - docs/historical/memory-investigations/memory-analysis-summary.md → DEVELOPMENT-BIBLE Performance" -ForegroundColor White
    Write-Host "  - docs/historical/memory-investigations/MEMORY-MONITORING-QUICK-REF.md → OPERATIONS-BIBLE Monitoring" -ForegroundColor White
    Write-Host "  - docs/historical/memory-investigations/memory-profiling-report.md → DEVELOPMENT-BIBLE Performance" -ForegroundColor White
}
