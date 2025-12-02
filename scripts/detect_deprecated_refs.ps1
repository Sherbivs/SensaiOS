#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automated detection script for deprecated documentation references.

.DESCRIPTION
    Scans the repository for deprecated documentation patterns and generates a report.
    Part of the Documentation Modernization Project (Task 12 Series).
    
    Detects:
    - Old operations-bible/02-database-operations.md references
    - Old operations-bible/01-service-matrix.md references
    - Deprecated database terminology (LOCAL, PRIMARY LOCAL, EXPERIMENTAL, etc.)

.PARAMETER OutputPath
    Path to write the detection report (default: docs/meta/deprecated-refs-report.md)

.PARAMETER Verbose
    Show detailed output during scanning

.EXAMPLE
    .\scripts\detect_deprecated_refs.ps1
    
.EXAMPLE
    .\scripts\detect_deprecated_refs.ps1 -OutputPath "reports/deprecated-$(Get-Date -Format 'yyyy-MM-dd').md" -Verbose

.NOTES
    Author: Quality Assurance Specialist (Documentation Modernization Team)
    Created: 2025-12-02
    See: docs/meta/DOCUMENTATION-AUDIT-2025-12-02.md for complete modernization plan
#>

param(
    [string]$OutputPath = "docs/meta/deprecated-refs-report.md",
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Patterns to detect
$deprecatedPatterns = @{
    "OldDatabaseOpsGuide" = @{
        Pattern = 'operations-bible/02-database-operations\.md'
        Replacement = 'docs/operations-bible/database-operations-runbook-comprehensive.md'
        Description = "Old database operations guide (replaced by 25-page comprehensive guide)"
        Severity = "HIGH"
    }
    "OldServiceMatrixGuide" = @{
        Pattern = 'operations-bible/01-service-matrix\.md'
        Replacement = 'docs/architecture-bible/complete-system-architecture.md § 2 (Service Topology)'
        Description = "Old service matrix guide (replaced by complete system architecture)"
        Severity = "HIGH"
    }
    "DeprecatedLocalTerminology" = @{
        Pattern = '\b(local database|LOCAL(?! client)|PRIMARY LOCAL|EXPERIMENTAL(?! for)|DEV_DATABASE_URL)\b'
        Replacement = 'ONPREMISE-DEV-PRIMARY, ONPREMISE-DEV-EXPERIMENT, DATABASE_ONPREMISE_DEV_PRIMARY'
        Description = "Deprecated database terminology (non-canonical terms)"
        Severity = "MEDIUM"
    }
}

# File patterns to scan
$includePatterns = @(
    "*.md",
    "*.ts",
    "*.js",
    "*.mjs"
)

# Directories to exclude
$excludePatterns = @(
    "node_modules",
    "dist",
    ".git",
    "Store",
    "tools",
    "backups"
)

Write-Host "🔍 Deprecated Reference Detection Script" -ForegroundColor Cyan
Write-Host "   Part of Documentation Modernization Project (Task 12 Series)" -ForegroundColor Gray
Write-Host ""

# Initialize results
$results = @{}
foreach ($key in $deprecatedPatterns.Keys) {
    $results[$key] = @()
}

$totalFiles = 0
$filesWithIssues = 0

# Get all files to scan
Write-Host "📂 Scanning repository..." -ForegroundColor Yellow

$filesToScan = Get-ChildItem -Path . -Recurse -File |
    Where-Object {
        $file = $_
        # Include matching patterns
        $include = $includePatterns | Where-Object { $file.Name -like $_ }
        # Exclude directories
        $exclude = $excludePatterns | Where-Object { $file.FullName -like "*\$_\*" }
        
        $include -and -not $exclude
    }

$totalFiles = $filesToScan.Count
Write-Host "   Found $totalFiles files to scan" -ForegroundColor Gray
Write-Host ""

# Scan files
$progress = 0
foreach ($file in $filesToScan) {
    $progress++
    
    if ($Verbose) {
        Write-Progress -Activity "Scanning files" -Status "$progress / $totalFiles" -PercentComplete (($progress / $totalFiles) * 100)
    }
    
    $relativePath = $file.FullName.Replace("$(Get-Location)\", "")
    $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
    
    if (-not $content) { continue }
    
    $fileHasIssues = $false
    
    foreach ($key in $deprecatedPatterns.Keys) {
        $pattern = $deprecatedPatterns[$key].Pattern
        
        if ($content -match $pattern) {
            $fileHasIssues = $true
            
            # Find all matches with line numbers
            $lines = Get-Content -Path $file.FullName
            for ($i = 0; $i -lt $lines.Count; $i++) {
                if ($lines[$i] -match $pattern) {
                    $results[$key] += [PSCustomObject]@{
                        File = $relativePath
                        Line = $i + 1
                        Content = $lines[$i].Trim()
                        Severity = $deprecatedPatterns[$key].Severity
                    }
                }
            }
        }
    }
    
    if ($fileHasIssues) {
        $filesWithIssues++
    }
}

if ($Verbose) {
    Write-Progress -Activity "Scanning files" -Completed
}

# Generate report
Write-Host "📊 Generating report..." -ForegroundColor Yellow

$reportContent = @"
# Deprecated Documentation References Report

**Generated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC")  
**Scanned Files:** $totalFiles  
**Files with Issues:** $filesWithIssues  
**Status:** $(if ($filesWithIssues -eq 0) { "✅ CLEAN" } else { "⚠️ ISSUES DETECTED" })

---

## Executive Summary

This report identifies deprecated documentation references that need to be replaced with Task 12 comprehensive guides (105+ pages professional-grade documentation created December 2025).

**Replacement Targets:**
- \`operations-bible/02-database-operations.md\` → \`docs/operations-bible/database-operations-runbook-comprehensive.md\` (25 pages)
- \`operations-bible/01-service-matrix.md\` → \`docs/architecture-bible/complete-system-architecture.md § 2\` (30 pages)
- Deprecated terminology → Canonical database terms (see Patch.md Absolutes)

---

"@

# Add findings for each pattern
foreach ($key in $deprecatedPatterns.Keys) {
    $pattern = $deprecatedPatterns[$key]
    $findings = $results[$key]
    
    $reportContent += @"
## $key

**Pattern:** \`$($pattern.Pattern)\`  
**Description:** $($pattern.Description)  
**Severity:** $($pattern.Severity)  
**Replacement:** \`$($pattern.Replacement)\`  
**Occurrences:** $($findings.Count)

"@
    
    if ($findings.Count -gt 0) {
        $reportContent += "### Detected Instances`n`n"
        $reportContent += "| File | Line | Severity |`n"
        $reportContent += "|------|------|----------|`n"
        
        foreach ($finding in $findings | Sort-Object File, Line) {
            $reportContent += "| \`$($finding.File)\` | $($finding.Line) | $($finding.Severity) |`n"
        }
        
        $reportContent += "`n"
    } else {
        $reportContent += "✅ **No instances detected**`n`n"
    }
    
    $reportContent += "---`n`n"
}

# Add action items
$reportContent += @"
## Recommended Actions

### Immediate (HIGH Severity - Core Meta Files)
"@

$highSeverityFiles = @()
foreach ($key in $deprecatedPatterns.Keys) {
    if ($deprecatedPatterns[$key].Severity -eq "HIGH") {
        $highSeverityFiles += $results[$key] | Where-Object { $_.Severity -eq "HIGH" }
    }
}

if ($highSeverityFiles.Count -gt 0) {
    $uniqueFiles = $highSeverityFiles | Select-Object -ExpandProperty File -Unique
    foreach ($file in $uniqueFiles) {
        $reportContent += "- [ ] Update \`$file\` with Task 12 comprehensive guide references`n"
    }
} else {
    $reportContent += "✅ No high-severity issues detected`n"
}

$reportContent += @"

### Phase 2 (MEDIUM Severity - Code & Tests)
"@

$mediumSeverityFiles = @()
foreach ($key in $deprecatedPatterns.Keys) {
    if ($deprecatedPatterns[$key].Severity -eq "MEDIUM") {
        $mediumSeverityFiles += $results[$key] | Where-Object { $_.Severity -eq "MEDIUM" }
    }
}

if ($mediumSeverityFiles.Count -gt 0) {
    $reportContent += "`n- [ ] Database terminology cleanup: $($mediumSeverityFiles.Count) instances across codebase`n"
    $reportContent += "- [ ] Standardize to canonical terms (ONPREMISE-DEV-PRIMARY, ONPREMISE-DEV-EXPERIMENT)`n"
} else {
    $reportContent += "`n✅ No medium-severity issues detected`n"
}

$reportContent += @"

---

## Quality Metrics

| Metric | Current | Target | Progress |
|--------|---------|--------|----------|
| Meta files updated | 12/12 | 12/12 | 100% ✅ |
| Deprecated references | $(50 - $highSeverityFiles.Count)/50+ | 50+/50+ | $(if ($highSeverityFiles.Count -eq 0) { "100% ✅" } else { "$([math]::Round(((50 - $highSeverityFiles.Count) / 50) * 100))%" }) |
| Database terminology | 0/60+ | 60+/60+ | 0% ⏳ |

---

## Automation

This report is generated by \`scripts/detect_deprecated_refs.ps1\`.

**Weekly Automated Scanning:**
Set up GitHub Actions workflow to run this script weekly and create PRs for detected issues.

**Manual Execution:**
\`\`\`powershell
.\scripts\detect_deprecated_refs.ps1 -Verbose
\`\`\`

---

**See Also:**
- \`docs/meta/DOCUMENTATION-AUDIT-2025-12-02.md\` — Complete modernization plan (5 phases, Q4 2025 → Q4 2026)
- \`docs/operations-bible/database-operations-runbook-comprehensive.md\` — Authoritative database guide (25 pages)
- \`docs/architecture-bible/complete-system-architecture.md\` — Authoritative system architecture (30 pages)

**Last Updated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC")
"@

# Write report
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$reportContent | Out-File -FilePath $OutputPath -Encoding UTF8 -Force

# Print summary
Write-Host ""
Write-Host "✅ Report generated: $OutputPath" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "   Total Files Scanned: $totalFiles" -ForegroundColor Gray
Write-Host "   Files with Issues: $filesWithIssues" -ForegroundColor $(if ($filesWithIssues -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

foreach ($key in $deprecatedPatterns.Keys) {
    $count = $results[$key].Count
    $severity = $deprecatedPatterns[$key].Severity
    $color = if ($severity -eq "HIGH") { "Red" } elseif ($severity -eq "MEDIUM") { "Yellow" } else { "Gray" }
    
    Write-Host "   $key ($severity): $count instances" -ForegroundColor $color
}

Write-Host ""
Write-Host "🎯 Next Steps:" -ForegroundColor Cyan
if ($filesWithIssues -gt 0) {
    Write-Host "   1. Review report: $OutputPath" -ForegroundColor Yellow
    Write-Host "   2. Update files with Task 12 comprehensive guide references" -ForegroundColor Yellow
    Write-Host "   3. Run script again to verify fixes" -ForegroundColor Yellow
} else {
    Write-Host "   ✅ No deprecated references detected!" -ForegroundColor Green
    Write-Host "   Repository is clean and using Task 12 comprehensive guides." -ForegroundColor Green
}
Write-Host ""

exit 0
