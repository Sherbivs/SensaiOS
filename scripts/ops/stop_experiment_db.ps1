<#
.SYNOPSIS
Stop the experimental PostgreSQL database cluster.

.DESCRIPTION
Stops the experimental database cluster on port 55434 if it's running.

.EXAMPLE
.\scripts\ops\stop_experiment_db.ps1
#>

$ErrorActionPreference = "Stop"

# Resolve Store root
$StoreRoot = if ($env:IG_STORE_ROOT) { 
    $env:IG_STORE_ROOT 
} else { 
    Join-Path $PSScriptRoot "..\..\Store" 
}
$StoreRoot = Resolve-Path $StoreRoot -ErrorAction SilentlyContinue

if (-not $StoreRoot) {
    Write-Host "❌ Store root not found." -ForegroundColor Red
    exit 1
}

$ClusterDir = Join-Path $StoreRoot "db-experiment\pg_data"
$Port = 55434

# Check if cluster exists
if (-not (Test-Path $ClusterDir)) {
    Write-Host "❌ Experimental database cluster not initialized." -ForegroundColor Red
    exit 1
}

# Find PostgreSQL binaries
$PgBinDir = $env:PG_BIN_DIR
if (-not $PgBinDir) {
    $PgCandidates = @(
        "C:\Program Files\PostgreSQL\17\bin",
        "C:\Program Files\PostgreSQL\16\bin",
        "C:\Program Files\PostgreSQL\15\bin"
    )
    
    foreach ($Candidate in $PgCandidates) {
        if (Test-Path (Join-Path $Candidate "pg_ctl.exe")) {
            $PgBinDir = $Candidate
            break
        }
    }
}

if (-not $PgBinDir) {
    Write-Host "❌ PostgreSQL binaries not found." -ForegroundColor Red
    Write-Host "Set PG_BIN_DIR environment variable or install PostgreSQL." -ForegroundColor Yellow
    exit 1
}

$PgCtl = Join-Path $PgBinDir "pg_ctl.exe"

# Check if running
& $PgCtl status -D $ClusterDir 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✅ Experimental database cluster is not running" -ForegroundColor Green
    exit 0
}

# Stop cluster
Write-Host "🛑 Stopping experimental database cluster..." -ForegroundColor Cyan

& $PgCtl stop -D $ClusterDir -m fast -w -t 10

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Experimental database cluster stopped successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to stop experimental database cluster" -ForegroundColor Red
    exit 1
}
