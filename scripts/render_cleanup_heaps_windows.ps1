#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Clean up old heap snapshots on Render service (Windows wrapper)
.DESCRIPTION
    Deletes old heap snapshots, keeping only the N most recent files
.PARAMETER ServiceId
    Service ID (default: srv-d3snk2ndiees73cn709g - main bot)
.PARAMETER Keep
    Number of most recent snapshots to keep (default: 3)
.PARAMETER DryRun
    Preview files that would be deleted without actually deleting
.EXAMPLE
    .\render_cleanup_heaps_windows.ps1 -DryRun
.EXAMPLE
    .\render_cleanup_heaps_windows.ps1 -Keep 3
.EXAMPLE
    .\render_cleanup_heaps_windows.ps1 -Keep 5 -ServiceId "srv-abc123"
#>

param(
    [string]$ServiceId = "srv-d3snk2ndiees73cn709g",
    [int]$Keep = 3,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "🧹 Render Heap Snapshot Cleanup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# First, list current heap snapshots
Write-Host "📋 Current heap snapshots:" -ForegroundColor Yellow
Write-Host ""
& "$PSScriptRoot\render_ssh_windows.ps1" -ServiceId $ServiceId -Command "cd /Store && ls -lth startup-heap-*.heapsnapshot 2>/dev/null | head -20 || echo 'No heap snapshots found'"
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 DRY RUN: Files that would be deleted (keeping $Keep most recent):" -ForegroundColor Yellow
    Write-Host ""
    & "$PSScriptRoot\render_ssh_windows.ps1" -ServiceId $ServiceId -Command "cd /Store && ls -t startup-heap-*.heapsnapshot 2>/dev/null | tail -n +$($Keep + 1) || echo 'No files to delete'"
    Write-Host ""
    Write-Host "💡 Remove -DryRun flag to actually delete files" -ForegroundColor DarkGray
} else {
    Write-Host "⚠️  WARNING: About to delete old heap snapshots (keeping $Keep most recent)" -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "Continue? (yes/no)"
    
    if ($confirm -ne "yes") {
        Write-Host "❌ Cleanup cancelled" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    Write-Host "🧹 Deleting old snapshots..." -ForegroundColor Cyan
    Write-Host ""
    
    $deleteCommand = "cd /Store && ls -t startup-heap-*.heapsnapshot 2>/dev/null | tail -n +$($Keep + 1) | xargs rm -f && df -h /Store && echo 'Deleted old heap snapshots. Kept $Keep most recent.'"
    & "$PSScriptRoot\render_ssh_windows.ps1" -ServiceId $ServiceId -Command $deleteCommand
    
    Write-Host ""
    Write-Host "✅ Cleanup completed!" -ForegroundColor Green
}
