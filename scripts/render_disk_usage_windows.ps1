#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Check /Store disk usage on Render service (Windows wrapper)
.DESCRIPTION
    Windows-native wrapper for checking Render disk usage via WSL
.PARAMETER ServiceId
    Service ID (default: srv-d3snk2ndiees73cn709g - main bot)
.PARAMETER Detailed
    Show detailed breakdown of /Store contents
.EXAMPLE
    .\render_disk_usage_windows.ps1
.EXAMPLE
    .\render_disk_usage_windows.ps1 -Detailed
.EXAMPLE
    .\render_disk_usage_windows.ps1 -ServiceId "srv-abc123"
#>

param(
    [string]$ServiceId = "srv-d3snk2ndiees73cn709g",
    [switch]$Detailed
)

$ErrorActionPreference = "Stop"

Write-Host "💾 Render Disk Usage Check" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan
Write-Host ""

if ($Detailed) {
    Write-Host "📊 Detailed /Store breakdown:" -ForegroundColor Yellow
    Write-Host ""
    & "$PSScriptRoot\render_ssh_windows.ps1" -ServiceId $ServiceId -Command "df -h /Store && echo '' && du -sh /Store/* 2>/dev/null | sort -hr"
} else {
    Write-Host "📊 Disk usage summary:" -ForegroundColor Yellow
    Write-Host ""
    & "$PSScriptRoot\render_ssh_windows.ps1" -ServiceId $ServiceId -Command "df -h /Store"
}

Write-Host ""
Write-Host "💡 TIP: Use -Detailed flag for file breakdown" -ForegroundColor DarkGray
