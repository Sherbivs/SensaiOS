[CmdletBinding()]
param(
    [Parameter(HelpMessage = "Roots of the Infinity-Gauntlet repository to sweep.")]
    [string[]]$RepoRoots = @(),

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

if (-not $RepoRoots -or $RepoRoots.Count -eq 0) {
    $autoRoots = @()
    if ($PSScriptRoot) {
        $scriptRepoRoot = Split-Path -Parent $PSScriptRoot
        if ($scriptRepoRoot) {
            $autoRoots += $scriptRepoRoot
        }
    }
    $autoRoots += "C:/Users/sherb/Infinity-Gauntlet"
    $RepoRoots = $autoRoots | Where-Object { $_ } | Sort-Object -Unique
}

$resolvedRepoRoots = @()
foreach ($root in ($RepoRoots | Where-Object { $_ })) {
    try {
        $resolvedRepoRoots += (Resolve-Path -LiteralPath $root -ErrorAction Stop).ProviderPath
    } catch {
        Write-Warning "Repo root '$root' does not exist. Skipping."
    }
}

if ($resolvedRepoRoots.Count -eq 0) {
    throw "No valid repo roots to clean. Pass -RepoRoots with an existing path."
}

function Invoke-RepoCleanup {
    param(
        [string]$RepoRoot,
        [string[]]$LegacyPaths,
        [string[]]$TransientPaths,
        [string[]]$AdditionalPaths
    )

    Push-Location -Path $RepoRoot
    try {
        Write-Host "== Infinity-Gauntlet cleanup :: $RepoRoot ==" -ForegroundColor Cyan

        $allCleanupTargets = @()
        $allCleanupTargets += $LegacyPaths
        $allCleanupTargets += $TransientPaths
        $allCleanupTargets += $AdditionalPaths

        foreach ($relativePath in ($allCleanupTargets | Where-Object { $_ } | Sort-Object -Unique)) {
            $fullPath = Join-Path -Path $RepoRoot -ChildPath $relativePath
            if (Test-Path -LiteralPath $fullPath) {
                Write-Host "Removing path: $relativePath" -ForegroundColor Yellow
                try {
                    Remove-Item -LiteralPath $fullPath -Recurse -Force
                } catch {
                    Write-Warning "Failed to remove '$relativePath': $_"
                }
            } else {
                Write-Verbose "Skipping missing path: $relativePath"
            }
        }

        $gitDir = Join-Path -Path $RepoRoot -ChildPath ".git"
        if (Test-Path -LiteralPath $gitDir) {
            Write-Host "Checking git status..." -ForegroundColor Cyan
            $gitStatus = git status -sb 2>$null
            if ($LASTEXITCODE -ne 0 -or -not $gitStatus) {
                Write-Warning "git status failed; ensure Git is installed and accessible."
            } else {
                Write-Host $gitStatus
                $statusLines = $gitStatus -split "`n" | Where-Object { $_ }
                $detailLines = $statusLines | Where-Object { $_ -notmatch '^##' }
                if ($detailLines.Count -eq 0) {
                    Write-Host "Repository is clean." -ForegroundColor Green
                } else {
                    Write-Warning "Repository has staged or unstaged changes:"
                    $detailLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
                }
            }
        } else {
            Write-Warning "Skipping git status; '.git' directory not found under '$RepoRoot'."
        }

        Write-Host "Cleanup complete." -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

foreach ($repoRoot in ($resolvedRepoRoots | Sort-Object -Unique)) {
    Invoke-RepoCleanup -RepoRoot $repoRoot -LegacyPaths $LegacyPaths -TransientPaths $TransientPaths -AdditionalPaths $AdditionalPaths
}
