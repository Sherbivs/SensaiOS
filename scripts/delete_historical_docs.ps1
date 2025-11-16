# Documentation Cleanup Script
# Deletes 254 historical/redundant files as per DOC-CLASSIFICATION-MATRIX.md
# Phase 0 - Week 1 deliverable

param(
    [switch]$DryRun = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Stop"
$deletedCount = 0
$failedCount = 0
$deletedFiles = @()
$failedFiles = @()

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Documentation Cleanup - Phase 0 Week 1" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "[DRY RUN MODE] No files will be deleted" -ForegroundColor Yellow
    Write-Host ""
}

# Base path
$docsPath = "docs"

# Category 1: Historical Archive (129 files)
Write-Host "Category 1: Historical Archive (129 files)" -ForegroundColor Green
Write-Host "-------------------------------------------" -ForegroundColor Green

$historicalRoot = @(
    "docs/historical/README.md",
    "docs/historical/env-variable-grep-report.md",
    "docs/historical/PRISMA-ACCELERATE-REMOVAL.md",
    "docs/historical/SANITY-CHECK-REPORT.md",
    "docs/historical/DEPLOYMENT-STATUS.md",
    "docs/historical/AUTOMATION-SUMMARY.md"
)

$historicalMemory = @(
    "docs/historical/memory-investigations/MEMORY-MONITORING-ACTIVE-SESSION-QUICKREF.md",
    "docs/historical/memory-investigations/MEMORY-MONITORING-24H-CHECKLIST.md"
)

$historicalResource = @(
    "docs/historical/resource-system/README.md"
)

# Get all files in historical/ subdirectories
$historicalDeploymentSessions = Get-ChildItem -Path "docs/historical/deployment-sessions" -Filter "*.md" -File -ErrorAction SilentlyContinue
$historicalMemoryAll = Get-ChildItem -Path "docs/historical/memory-investigations" -Filter "*.md" -File -ErrorAction SilentlyContinue

# Category 2: Task Reports (89 files)
Write-Host ""
Write-Host "Category 2: Task Reports (89 files)" -ForegroundColor Green
Write-Host "------------------------------------" -ForegroundColor Green

$taskReportsRoot = @(
    "docs/task-reports/CURRENT-STATE-SUMMARY.md"
)

# Get all task reports except ROUTER.md
$taskReportsAll = Get-ChildItem -Path "docs/task-reports" -Filter "*.md" -File -ErrorAction SilentlyContinue | 
    Where-Object { $_.Name -ne "ROUTER.md" }

# Category 3: Architecture (9 files)
Write-Host ""
Write-Host "Category 3: Architecture (9 files)" -ForegroundColor Green
Write-Host "-----------------------------------" -ForegroundColor Green

$architecture = @(
    "docs/architecture/intelligent-logging-implementation-summary.md",
    "docs/architecture/error-logging-integration-summary.md",
    "docs/architecture/phase2.2-errortracker-migration-plan.md",
    "docs/architecture/phase2.3-dripalertmanager-migration-plan.md",
    "docs/architecture/phase2.4-intelligentlogger-migration-plan.md",
    "docs/architecture/phases1-2.3-comprehensive-audit.md",
    "docs/architecture/SERVICE-REGISTRY-PROGRESS.md",
    "docs/architecture/SERVICE-CONSOLIDATION-PLAN.md",
    "docs/architecture/cache-lru-optimization-summary.md"
)

# Category 4: Database (2 files)
Write-Host ""
Write-Host "Category 4: Database (2 files)" -ForegroundColor Green
Write-Host "-------------------------------" -ForegroundColor Green

$database = @(
    "docs/database/2-node-cluster-migration.md",
    "docs/database/prisma-to-pg-migration.md"
)

# Category 5: Deployment (13 files)
Write-Host ""
Write-Host "Category 5: Deployment (13 files)" -ForegroundColor Green
Write-Host "----------------------------------" -ForegroundColor Green

$deployment = @(
    "docs/deployment/DEPLOYMENT-SUCCESS-2025-11-12.md",
    "docs/deployment/DISK-RESOURCE-IMPLEMENTATION-SUMMARY.md",
    "docs/deployment/MEMORY-TO-DISK-MIGRATION-PLAN.md",
    "docs/deployment/production-resource-usage-2025-11-11-0232.md",
    "docs/deployment/production-resource-usage-2025-11-11.md",
    "docs/deployment/RENDER-RESOURCE-OPTIMIZATION-PLAN.md",
    "docs/deployment/RESOURCE-OPTIMIZATION-SUMMARY.md",
    "docs/deployment/RESOURCE-OPTIMIZATION-VALIDATION.md",
    "docs/deployment/RESOURCE-REQUEST-IMPLEMENTATION-SUMMARY.md",
    "docs/deployment/RESOURCE-REQUEST-MIGRATION.md",
    "docs/deployment/SESSION-SUMMARY-DISK-INTEGRATION.md",
    "docs/deployment/SYSTEM-VERIFICATION-2025-11-12.md",
    "docs/deployment/RENDER-ARCHITECTURE-AUDIT-2025-11-12.md"
)

# Category 6: Error System (2 files)
Write-Host ""
Write-Host "Category 6: Error System (2 files)" -ForegroundColor Green
Write-Host "-----------------------------------" -ForegroundColor Green

$errorSystem = @(
    "docs/error-system/error-system-implementation-summary.md",
    "docs/error-system/error-system-progress-report.md"
)

# Category 7: Console Output (2 files)
Write-Host ""
Write-Host "Category 7: Console Output (2 files)" -ForegroundColor Green
Write-Host "-------------------------------------" -ForegroundColor Green

$consoleOutput = @(
    "docs/console-output/console-output-project.md",
    "docs/console-output/console-output-final-report.md"
)

# Category 8: Northstar (8 files)
Write-Host ""
Write-Host "Category 8: Northstar (8 files)" -ForegroundColor Green
Write-Host "--------------------------------" -ForegroundColor Green

$northstar = @(
    "docs/northstar/northstar-methodology.md",
    "docs/northstar/northstar-phase1-contract-verification.md",
    "docs/northstar/northstar-phase1-handoff.md",
    "docs/northstar/northstar-phase2-consolidation.md",
    "docs/northstar/northstar-qa-checklist.md",
    "docs/northstar/northstar-schema-state.md",
    "docs/northstar/northstar-solidification-summary.md",
    "docs/northstar/schema-northstar-optimization.md"
)

# Combine all files
$allFilesToDelete = @()
$allFilesToDelete += $historicalRoot
$allFilesToDelete += $historicalMemory
$allFilesToDelete += $historicalResource
$allFilesToDelete += $taskReportsRoot
$allFilesToDelete += $architecture
$allFilesToDelete += $database
$allFilesToDelete += $deployment
$allFilesToDelete += $errorSystem
$allFilesToDelete += $consoleOutput
$allFilesToDelete += $northstar

# Add directory-based files
if ($historicalDeploymentSessions) {
    $allFilesToDelete += $historicalDeploymentSessions.FullName
}
if ($historicalMemoryAll) {
    # Exclude the 3 files we're keeping
    $keepFiles = @(
        "memory-analysis-summary.md",
        "MEMORY-MONITORING-QUICK-REF.md",
        "memory-profiling-report.md"
    )
    foreach ($file in $historicalMemoryAll) {
        if ($keepFiles -notcontains $file.Name) {
            $allFilesToDelete += $file.FullName
        }
    }
}
if ($taskReportsAll) {
    $allFilesToDelete += $taskReportsAll.FullName
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Total files to delete: $($allFilesToDelete.Count)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "Files that would be deleted:" -ForegroundColor Yellow
    foreach ($file in $allFilesToDelete) {
        if (Test-Path $file) {
            Write-Host "  [EXISTS] $file" -ForegroundColor White
        } else {
            Write-Host "  [MISSING] $file" -ForegroundColor DarkGray
        }
    }
    Write-Host ""
    Write-Host "Run without -DryRun to execute deletion" -ForegroundColor Yellow
    exit 0
}

# Execute deletion
Write-Host "Executing deletion..." -ForegroundColor Yellow
Write-Host ""

foreach ($file in $allFilesToDelete) {
    if (Test-Path $file) {
        try {
            Remove-Item -Path $file -Force
            $deletedCount++
            $deletedFiles += $file
            if ($Verbose) {
                Write-Host "  [DELETED] $file" -ForegroundColor Green
            }
        } catch {
            $failedCount++
            $failedFiles += $file
            Write-Host "  [FAILED] $file - $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "  [SKIP] $file (not found)" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Deletion Summary" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Files deleted: $deletedCount" -ForegroundColor Green
Write-Host "Files failed: $failedCount" -ForegroundColor $(if ($failedCount -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($failedCount -gt 0) {
    Write-Host "Failed files:" -ForegroundColor Red
    foreach ($file in $failedFiles) {
        Write-Host "  - $file" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "Cleanup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review deletion with: git status" -ForegroundColor White
Write-Host "  2. Commit changes: git add -A && git commit -m '[Phase 0] Delete 254 historical/redundant docs'" -ForegroundColor White
Write-Host "  3. Update DOC-CLASSIFICATION-MATRIX.md progress" -ForegroundColor White
Write-Host ""
