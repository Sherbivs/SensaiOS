#!/usr/bin/env pwsh
# PSScriptAnalyzerSettings
@{
    Rules = @{
        PSUseApprovedVerbs = @{ Enable = $false }
    }
}
<#!
.SYNOPSIS
  Auto-sync ROUTER.md timestamps and router index.

.DESCRIPTION
  Detects recent file changes and updates Last Updated (UTC) in ROUTER.md files
  up the directory chain. Optionally regenerates ops/ROUTER_INDEX.yaml.

.PARAMETER Since
  Git ref to diff against (e.g. HEAD~1).

.PARAMETER Staged
  Use staged changes only.

.PARAMETER All
  Use all tracked files (ignores recent-change detection).

.PARAMETER DryRun
  Report changes without writing files.

.PARAMETER SkipIndex
  Skip ops/ROUTER_INDEX.yaml regeneration.

.EXAMPLE
  pwsh -File scripts/update-routers.ps1
  pwsh -File scripts/update-routers.ps1 -Since HEAD~1
  pwsh -File scripts/update-routers.ps1 -Staged -DryRun
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Since,

    [Parameter(Mandatory = $false)]
    [switch]$Staged,

    [Parameter(Mandatory = $false)]
    [switch]$All,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun,

    [Parameter(Mandatory = $false)]
    [switch]$SkipIndex
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Write-Warn([string]$Message) {
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Ok([string]$Message) {
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Fail([string]$Message) {
    Write-Host "❌ $Message" -ForegroundColor Red
}

$PathNormalizer = {
    param([string]$PathValue)
    return $PathValue -replace "\\", "/"
}

function Get-RepoRoot {
    try {
        $root = git rev-parse --show-toplevel 2>$null
        if ($root) { return $root.Trim() }
    } catch {}
    return (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
}

function Get-ChangedFiles {
    param(
        [string]$RootPath,
        [string]$SinceRef,
        [switch]$UseStaged,
        [switch]$UseAll
    )

    if ($UseAll) {
        $output = git ls-files -z
        return ($output -split "\0") | Where-Object { $_ -ne "" }
    }

    if ($SinceRef) {
        $output = git diff --name-only "$SinceRef...HEAD"
        return ($output -split "`r?`n") | Where-Object { $_ -ne "" }
    }

    if ($UseStaged) {
        $output = git diff --name-only --cached
        return ($output -split "`r?`n") | Where-Object { $_ -ne "" }
    }

    $status = git status --porcelain=v1 -z
    if (-not $status) { return @() }

    $entries = $status -split "\0" | Where-Object { $_ -ne "" }
    $files = New-Object System.Collections.Generic.List[string]

    for ($i = 0; $i -lt $entries.Count; $i++) {
        $entry = $entries[$i]
        if ($entry.Length -lt 4) { continue }

        $code = $entry.Substring(0, 2)
        $pathValue = $entry.Substring(3)

        if (($code.StartsWith("R") -or $code.StartsWith("C")) -and ($i + 1) -lt $entries.Count) {
            $pathValue = $entries[$i + 1]
            $i++
        }

        if ($pathValue) {
            $files.Add($pathValue)
        }
    }

    return $files.ToArray()
}

$ExcludePathMatcher = {
    param([string]$PathValue)
    $parts = (& $PathNormalizer $PathValue).Split("/")
    return $parts -contains "node_modules" -or $parts -contains ".git"
}

function Get-ParentDir([string]$PathValue) {
    $dir = [System.IO.Path]::GetDirectoryName($PathValue)
    if (-not $dir) { return "" }
    if ($dir -eq ".") { return "" }
    return $dir
}

function Get-RouterChain {
    param(
        [string]$RootPath,
        [string]$RelativePath
    )

    $routers = New-Object System.Collections.Generic.List[string]
    $current = Get-ParentDir $RelativePath

    while ($true) {
        $routerPath = Join-Path $RootPath (Join-Path $current "ROUTER.md")
        if (Test-Path $routerPath) {
            $routers.Add((Resolve-Path $routerPath).Path)
        }

        if (-not $current) { break }
        $next = Get-ParentDir $current
        if ($next -eq $current) { break }
        $current = $next
    }

    return $routers.ToArray()
}

function Get-MissingHeaders {
    param([string]$Content)

    $missing = New-Object System.Collections.Generic.List[string]
    if ($Content -notmatch "^Title:") { $missing.Add("Title:") }
    if ($Content -notmatch "^Purpose:") { $missing.Add("Purpose:") }
    if ($Content -notmatch "^Owned Globs:") { $missing.Add("Owned Globs:") }
    if ($Content -notmatch "^Last Updated \(UTC\):") { $missing.Add("Last Updated (UTC):") }
    return $missing.ToArray()
}

function Update-Timestamp {
    param(
        [string]$Content,
        [string]$Timestamp
    )

    $pattern = "^Last Updated \(UTC\):.*$"
    if ($Content -notmatch $pattern) { return @{ Updated = $Content; Changed = $false } }

    $updated = [Regex]::Replace($Content, $pattern, "Last Updated (UTC): $Timestamp", "Multiline")
    return @{ Updated = $updated; Changed = ($updated -ne $Content) }
}

try {
    $root = Get-RepoRoot
    Set-Location $root

    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

    Write-Host "=== Router Sync ===" -ForegroundColor White
    Write-Info "Root: $root"
    Write-Info "Timestamp: $timestamp"
    Write-Info ("Mode: " + ($(if ($All) { "all" } elseif ($Staged) { "staged" } elseif ($Since) { "since $Since" } else { "working" })))
    Write-Info "Dry Run: $($DryRun.IsPresent)"
    Write-Host ""

    $changedFiles = Get-ChangedFiles -RootPath $root -SinceRef $Since -UseStaged:$Staged -UseAll:$All
    $normalized = $changedFiles | ForEach-Object { & $PathNormalizer $_ } | Where-Object { $_ -ne "" -and -not (& $ExcludePathMatcher $_) }

    if ($normalized.Count -eq 0) {
        Write-Warn "No recent changes detected"
        exit 0
    }

    $routerPaths = New-Object System.Collections.Generic.List[string]
    $missingRouters = New-Object System.Collections.Generic.List[string]

    foreach ($file in $normalized) {
        $chain = Get-RouterChain -RootPath $root -RelativePath $file
        foreach ($router in $chain) {
            $routerPaths.Add($router)
        }

        $parentDir = Get-ParentDir $file
        if ($parentDir) {
            $directRouter = Join-Path $root (Join-Path $parentDir "ROUTER.md")
            if (-not (Test-Path $directRouter)) {
                $missingRouters.Add((& $PathNormalizer (Join-Path $parentDir "ROUTER.md")))
            }
        }
    }

    $uniqueRouters = $routerPaths | Sort-Object -Unique
    $updatedRouters = New-Object System.Collections.Generic.List[string]
    $currentRouters = New-Object System.Collections.Generic.List[string]
    $missingHeaders = @()

    foreach ($router in $uniqueRouters) {
        $content = Get-Content -Raw -Path $router
        $missing = Get-MissingHeaders -Content $content
        if ($missing.Count -gt 0) {
            $missingHeaders += [PSCustomObject]@{
                Path = $router
                Fields = $missing
            }
            continue
        }

        $result = Update-Timestamp -Content $content -Timestamp $timestamp
        if ($result.Changed) {
            if (-not $DryRun) {
                Set-Content -Path $router -Value $result.Updated
            }
            $updatedRouters.Add($router)
        } else {
            $currentRouters.Add($router)
        }
    }

    Write-Info "Changed Files: $($normalized.Count)"
    Write-Info "Routers in Chain: $($uniqueRouters.Count)"
    Write-Info "Routers Updated: $($updatedRouters.Count)"

    if ($updatedRouters.Count -gt 0) {
        Write-Host ""
        Write-Info "Updated Routers:"
        foreach ($router in $updatedRouters) {
            $relative = & $PathNormalizer ([System.IO.Path]::GetRelativePath($root, $router))
            Write-Host "  • $relative" -ForegroundColor Gray
        }
    }

    if ($currentRouters.Count -gt 0) {
        Write-Host ""
        Write-Info "Routers Already Current:"
        foreach ($router in $currentRouters) {
            $relative = & $PathNormalizer ([System.IO.Path]::GetRelativePath($root, $router))
            Write-Host "  • $relative" -ForegroundColor DarkGray
        }
    }

    if ($missingHeaders.Count -gt 0) {
        Write-Host ""
        Write-Warn "Routers Missing Required Headers:"
        foreach ($entry in $missingHeaders) {
            $relative = & $PathNormalizer ([System.IO.Path]::GetRelativePath($root, $entry.Path))
            Write-Host "  • $relative → Missing: $([string]::Join(', ', $entry.Fields))" -ForegroundColor Yellow
        }
    }

    if ($missingRouters.Count -gt 0) {
        Write-Host ""
        Write-Warn "Directories Missing ROUTER.md:"
        $uniqueMissing = $missingRouters | Sort-Object -Unique
        foreach ($missing in $uniqueMissing) {
            Write-Host "  • $(& $PathNormalizer $missing)" -ForegroundColor Yellow
        }
    }

    if (-not $SkipIndex -and -not $DryRun) {
        Write-Host ""
        Write-Info "Updating router index"
        $bash = Get-Command bash -ErrorAction SilentlyContinue
        if (-not $bash) {
            Write-Warn "bash not found; skipping router index update"
        } else {
            bash scripts/update-router-index.sh
        }
    }

    if ($DryRun) {
        Write-Info "Dry run complete (no files written)"
    } else {
        Write-Ok "Router sync complete"
    }
} catch {
    Write-Fail "Router sync failed: $_"
    exit 1
}
