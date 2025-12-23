[CmdletBinding()]
param(
    [string]$Version = "17"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    $opsDir = Split-Path -Parent $PSCommandPath
    $scriptsDir = Split-Path -Parent $opsDir
    return (Split-Path -Parent $scriptsDir)
}

function Get-ShareCandidates {
    param(
        [Parameter(Mandatory = $true)][string]$BinPath
    )

    $candidates = @()
    $parent = Split-Path -Parent $BinPath
    if ($parent) {
        $candidates += (Join-Path $parent "share")
        $grandParent = Split-Path -Parent $parent
        if ($grandParent) {
            $candidates += (Join-Path $grandParent "share")
        }
    }

    return $candidates | Where-Object { $_ -and (Test-Path $_) }
}

function Test-PostgresBin {
    param(
        [Parameter(Mandatory = $true)][string]$BinPath
    )

    if (-not (Test-Path $BinPath)) {
        return $false
    }

    $shareCandidates = Get-ShareCandidates -BinPath $BinPath
    return ($shareCandidates.Count -gt 0)
}

function Get-BinCandidates {
    param(
        [string]$Version = "17"
    )

    $candidates = @()

    if ($env:PG_BIN_DIR) {
        $candidates += $env:PG_BIN_DIR
    }

    $repoRoot = Get-RepoRoot
    $candidates += (Join-Path $repoRoot "tools/pgsql18/pgsql/bin")

    $programFiles = [System.Environment]::GetEnvironmentVariable("ProgramFiles")
    if ($programFiles) {
        $candidates += (Join-Path $programFiles "PostgreSQL/$Version/bin")
    }

    $programFilesX86 = [System.Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
    if ($programFilesX86) {
        $candidates += (Join-Path $programFilesX86 "PostgreSQL/$Version/bin")
    }

    return $candidates | Where-Object { $_ } | Select-Object -Unique
}

function Find-ExistingPostgresBin {
    param(
        [string]$Version = "18"
    )

    foreach ($candidate in Get-BinCandidates -Version $Version) {
        try {
            $resolved = (Resolve-Path -LiteralPath $candidate -ErrorAction Stop).ProviderPath
        }
        catch {
            continue
        }

        if (Test-PostgresBin -BinPath $resolved) {
            return $resolved
        }
    }

    return $null
}

function Install-PostgresPackage {
    param(
        [string]$Version = "18"
    )

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "winget is required to install PostgreSQL automatically. Install PostgreSQL manually or install winget and re-run the script."
    }

    $arguments = @(
        "install",
        "-e",
        "--id",
        "PostgreSQL.PostgreSQL",
        "--accept-source-agreements",
        "--accept-package-agreements",
        "--silent"
    )

    if ($Version) {
        $arguments += @("--version", $Version)
    }

    Write-Host "[ensure-postgres] Installing PostgreSQL $Version via winget (silent)..."

    $process = Start-Process -FilePath $winget.Source -ArgumentList $arguments -Wait -NoNewWindow -PassThru
    if ($process.ExitCode -ne 0) {
        throw "winget install failed with exit code $($process.ExitCode)."
    }
}

function Set-PersistentEnvironmentVariable {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    try {
        setx $Name $Value | Out-Null
    }
    catch {
        Write-Warning "Failed to persist $Name to the user profile: $($_.Exception.Message)"
    }
}

function Get-PostgresBundle {
    param(
        [string]$Version = "17"
    )

    $binPath = Find-ExistingPostgresBin -Version $Version
    if (-not $binPath) {
        Install-PostgresPackage -Version $Version
        $binPath = Find-ExistingPostgresBin -Version $Version
    }

    if (-not $binPath) {
        throw "PostgreSQL binaries with a share directory were not found. Install PostgreSQL manually and re-run the script."
    }

    $env:PG_BIN_DIR = $binPath
    Set-PersistentEnvironmentVariable -Name "PG_BIN_DIR" -Value $binPath

    Write-Host "[ensure-postgres] Using PG_BIN_DIR=$binPath"
    return $binPath
}

if ($MyInvocation.InvocationName -ne ".") {
    Get-PostgresBundle -Version $Version | Out-String | Write-Output
}
*** End of File