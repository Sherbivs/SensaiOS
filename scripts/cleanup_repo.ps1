[CmdletBinding()]
param(
    [Parameter(HelpMessage = "Root of the Infinity-Gauntlet repository")]
    [string]$RepoRoot = "C:/Users/sherb/Infinity-Gauntlet",

    [Parameter(HelpMessage = "Relative paths (files or folders) that should never ship.")]
    [string[]]$LegacyPaths = @(
        "discord-pokemon-bot",
        "apply-pokemon-skeleton-patch.ps1",
        "index.js",
        "src/index.js"
    ),

    [Parameter(HelpMessage = "Relative paths to transient build artifacts (files or folders).")]
    [string[]]$TransientPaths = @(
        "dist",
        "node_modules/.vite",
        "node_modules/.cache",
        "node_modules/.tsbuildinfo",
        ".turbo",
        "tmp",
        "temp"
    ),

    [Parameter(HelpMessage = "Additional relative paths to clean (files or folders).")]
    [string[]]$AdditionalPaths = @()
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $RepoRoot)) {
    throw "Repo root '$RepoRoot' does not exist. Pass -RepoRoot with a valid path."
}

Push-Location -Path $RepoRoot
try {
    Write-Host "== Infinity-Gauntlet cleanup ==" -ForegroundColor Cyan

    $allCleanupTargets = @()
    $allCleanupTargets += $LegacyPaths
    $allCleanupTargets += $TransientPaths
    $allCleanupTargets += $AdditionalPaths

    foreach ($relativePath in ($allCleanupTargets | Where-Object { $_ } | Sort-Object -Unique)) {
        $fullPath = Join-Path -Path $RepoRoot -ChildPath $relativePath
        if (Test-Path -LiteralPath $fullPath) {
            Write-Host "Removing path: $relativePath" -ForegroundColor Yellow
            Remove-Item -LiteralPath $fullPath -Recurse -Force
        }
    }

    Write-Host "Checking git status..." -ForegroundColor Cyan
    $gitStatus = git status -sb 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "git status failed; ensure Git is installed and accessible."
    } else {
        Write-Host $gitStatus
        if ($gitStatus -match '^##.+$') {
            $lines = $gitStatus -split "`n" | Where-Object { $_ -and ($_ -notmatch '^##') }
            if ($lines.Count -eq 0) {
                Write-Host "Repository is clean." -ForegroundColor Green
            } else {
                Write-Warning "Repository has staged or unstaged changes:" 
                $lines | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
            }
        }
    }

    Write-Host "Cleanup complete." -ForegroundColor Green
}
finally {
    Pop-Location
}
