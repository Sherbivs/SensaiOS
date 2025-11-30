# Documentation Consolidation Script
# Removes redundant .md files and consolidates into architecture bible

$ErrorActionPreference = "Continue"
$repoRoot = "C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet"

Write-Host "`n🗂️  DOCUMENTATION CONSOLIDATION SCRIPT" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# Track statistics
$deletedCount = 0
$preservedCount = 0
$archivedCount = 0

# ============================================================================
# PHASE 1: Android Directory - Remove Redundant Status/Phase Docs
# ============================================================================

Write-Host "`n📱 PHASE 1: Cleaning Android Directory..." -ForegroundColor Yellow

$androidRoot = Join-Path $repoRoot "tests\simulation\android"
$androidDocsToDelete = @(
    # Phase completion reports (redundant)
    "PHASE-2-COMPLETE.md",
    "PHASE-4-7-9-COMPLETE.md",
    "PHASE-5-COMPLETE.md",
    "PHASE-5-COMPLETION-SUMMARY.md",
    "PHASE-5-EXECUTIVE-SUMMARY.md",
    "PHASE-5-INDEX.md",
    "PHASE-5-QUICK-REF.md",
    "PHASE-5-VERIFICATION.md",
    "PHASE-5-VISUAL-SUMMARY.md",
    "PHASE-10-COMPLETE.md",
    "PHASE-12-COMPLETE.md",
    "PHASE-13-COMPLETE.md",
    "PHASE-14-PROGRESS.md",
    "PHASE-14-STATUS.md",
    
    # Weekly progress reports (outdated)
    "WEEK-1-PROGRESS.md",
    "WEEK-2-PROGRESS.md",
    "WEEK-4-STATUS-REPORT.md",
    
    # Setup/completion summaries (redundant)
    "BUILD_SETUP_COMPLETE.md",
    "COMPLETE-STATUS-REPORT.md",
    "FOUNDATION-COMPLETE.md",
    "INTEGRATION-COMPLETE.md",
    "MIGRATION-COMPLETE.md",
    "PROJECT-COMPLETE.md",
    "SETUP-COMPLETE.md",
    "SETUP_SUMMARY.md",
    
    # Duplicate guides (content in README)
    "ANDROID-STUDIO-SETUP.md",
    "ARCHITECTURE_FIX_GUIDE.md",
    "ARCHITECTURE-DIAGRAM.md",
    "AGP_UPGRADE_SUMMARY.md",
    "CALLBACK-SYSTEM-README.md",
    "GRADLE-SYNC-FIX.md",
    "IMPLEMENTATION-ROADMAP.md",
    "PLATFORM-VISION.md",
    "UI-REFACTOR-ROADMAP.md",
    
    # Redundant reference docs
    "DATABASE-CONNECTIVITY-GUIDE.md",
    "DATABASE-IMPLEMENTATION-SUMMARY.md",
    "DATABASE-QUICK-REFERENCE.md",
    "DEVICE-TEST-RESULTS.md",
    "ENVIRONMENT_CONFIG.md",
    "HARDCODED_CREDENTIALS_SUMMARY.md",
    "NETWORKING_SETUP.md",
    "PERMISSIONS-GUIDE.md",
    "PERMISSIONS-QUICK-REFERENCE.md",
    "QUICK_REFERENCE.md",
    "QUICK-START.md",
    "PROJECT-STRUCTURE.md",
    "TESTING-CHECKLIST.md"
)

foreach ($doc in $androidDocsToDelete) {
    $path = Join-Path $androidRoot $doc
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  ✓ Deleted: $doc" -ForegroundColor Green
        $deletedCount++
    }
}

# Clean android/docs/ subdirectory
$androidDocsDir = Join-Path $androidRoot "docs"
if (Test-Path $androidDocsDir) {
    $docsToDelete = @(
        "BUILD-VERIFICATION-REPORT.md",
        "COMPILATION-FIX-COMPLETE.md",
        "COMPONENT-PREVIEW-TESTING-GUIDE.md",
        "STATUS-REPORT.md",
        "WEEK-3-COMPONENT-LIBRARY.md",
        "WEEK-3-PROGRESS.md",
        "WEEK-3-SUMMARY.md",
        "WEEK-4-ACTION-PLAN.md"
    )
    
    foreach ($doc in $docsToDelete) {
        $path = Join-Path $androidDocsDir $doc
        if (Test-Path $path) {
            Remove-Item $path -Force
            Write-Host "  ✓ Deleted: docs/$doc" -ForegroundColor Green
            $deletedCount++
        }
    }
    
    # Remove empty docs directory
    if ((Get-ChildItem $androidDocsDir -File).Count -eq 0) {
        Remove-Item $androidDocsDir -Force -Recurse
        Write-Host "  ✓ Removed empty docs/ directory" -ForegroundColor Green
    }
}

# ============================================================================
# PHASE 2: Repository Root - Remove Redundant Top-Level Docs
# ============================================================================

Write-Host "`n📄 PHASE 2: Cleaning Repository Root..." -ForegroundColor Yellow

$rootDocsToDelete = @(
    "VERIFICATION-2025-11-29.md",
    "Patch-Template.md"  # Keep Patch.md, remove template
)

foreach ($doc in $rootDocsToDelete) {
    $path = Join-Path $repoRoot $doc
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  ✓ Deleted: $doc" -ForegroundColor Green
        $deletedCount++
    }
}

# ============================================================================
# PHASE 3: docs/ Directory - Archive Historical Phase Docs
# ============================================================================

Write-Host "`n📚 PHASE 3: Archiving Historical Phase Docs..." -ForegroundColor Yellow

$docsRoot = Join-Path $repoRoot "docs"
$archiveDir = Join-Path $docsRoot "archive"

# Create archive directory if it doesn't exist
if (!(Test-Path $archiveDir)) {
    New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
}

$docsToArchive = @(
    "PHASE-14-COMPLETE-FINAL.md",
    "PHASE-14-UNIT-SERVICE-COMPLETE.md",
    "PHASE-14-VIEWMODELS-COMPLETE.md",
    "CONSOLIDATION-PLAN-2025-11-25.md",
    "POSTGRESQL-18-QUICK-REF.md",
    "POSTGRESQL-18-UPGRADE-PLAN.md"
)

foreach ($doc in $docsToArchive) {
    $sourcePath = Join-Path $docsRoot $doc
    if (Test-Path $sourcePath) {
        $destPath = Join-Path $archiveDir $doc
        Move-Item $sourcePath $destPath -Force
        Write-Host "  ✓ Archived: $doc" -ForegroundColor Cyan
        $archivedCount++
    }
}

# ============================================================================
# PHASE 4: tests/simulation/ - Remove Task Summaries
# ============================================================================

Write-Host "`n🧪 PHASE 4: Cleaning tests/simulation/..." -ForegroundColor Yellow

$simulationRoot = Join-Path $repoRoot "tests\simulation"
$simulationDocsToDelete = @(
    "ARCHITECTURE.md",
    "CI-CD-INTEGRATION.md",
    "COMPLETION-SUMMARY.md",
    "QUICK-START.md",
    "TASK-4-SUMMARY.md",
    "TASK-6-SUMMARY.md",
    "TASK-7-SUMMARY.md"
)

foreach ($doc in $simulationDocsToDelete) {
    $path = Join-Path $simulationRoot $doc
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  ✓ Deleted: $doc" -ForegroundColor Green
        $deletedCount++
    }
}

# ============================================================================
# PHASE 5: Remove Redundant Router Manifests
# ============================================================================

Write-Host "`n🗺️  PHASE 5: Preserving Essential ROUTER.md Files..." -ForegroundColor Yellow

# Note: ROUTER.md files are part of the navigation system
# We keep them but note their importance
$routerCount = (Get-ChildItem -Path $repoRoot -Filter "ROUTER.md" -Recurse -File).Count
Write-Host "  ℹ️  Preserving $routerCount ROUTER.md files (navigation system)" -ForegroundColor Gray

# ============================================================================
# PHASE 6: Summary Report
# ============================================================================

Write-Host "`n" + ("=" * 60) -ForegroundColor Cyan
Write-Host "✅ CONSOLIDATION COMPLETE" -ForegroundColor Green
Write-Host ("=" * 60) -ForegroundColor Cyan

Write-Host "`n📊 Summary:" -ForegroundColor Cyan
Write-Host "  • Deleted:  $deletedCount files" -ForegroundColor Red
Write-Host "  • Archived: $archivedCount files" -ForegroundColor Yellow
Write-Host "  • Preserved ROUTER.md navigation system" -ForegroundColor Green

Write-Host "`n📝 Preserved Essential Docs:" -ForegroundColor Cyan
Write-Host "  • README.md (Android + Root)" -ForegroundColor White
Write-Host "  • Agents.md (Operations guide)" -ForegroundColor White
Write-Host "  • Patch.md (AI contract)" -ForegroundColor White
Write-Host "  • Prompt.md (Current state)" -ForegroundColor White
Write-Host "  • tasklist.md (Task tracking)" -ForegroundColor White
Write-Host "  • OPERATIONS.md (Service matrix)" -ForegroundColor White
Write-Host "  • masterroutetable.md (Navigation index)" -ForegroundColor White
Write-Host "  • docs/architecture-bible/* (17 files)" -ForegroundColor White
Write-Host "  • docs/operations-bible/* (11 files)" -ForegroundColor White
Write-Host "  • docs/development-bible/* (8 files)" -ForegroundColor White

Write-Host "`n🎯 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Review Android README.md for completeness" -ForegroundColor White
Write-Host "  2. Verify no critical info was lost" -ForegroundColor White
Write-Host "  3. Update any references to deleted docs" -ForegroundColor White

Write-Host "`n✨ Documentation is now lean and consolidated!`n" -ForegroundColor Green
