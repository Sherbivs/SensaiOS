<#
.SYNOPSIS
Start the experimental PostgreSQL database cluster.

.DESCRIPTION
Starts the experimental database cluster on port 55434 if it's not already running.
The cluster must be initialized first using bootstrap_onpremise_experiment.ts.

.EXAMPLE
.\scripts\ops\start_experiment_db.ps1
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
    Write-Host "❌ Store root not found. Run bootstrap_onpremise_experiment.ts first." -ForegroundColor Red
    exit 1
}

$ClusterDir = Join-Path $StoreRoot "onpremise-dev-experiment\pg_data"
$LogFile = Join-Path $StoreRoot "onpremise-dev-experiment\logs\postgres.log"
$Port = 55434

# Check if cluster exists
if (-not (Test-Path $ClusterDir)) {
    Write-Host "❌ Experimental database cluster not initialized." -ForegroundColor Red
    Write-Host "Run: npm run ops:bootstrap-onpremise-experiment" -ForegroundColor Yellow
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

# Check if already running
$StatusResult = & $PgCtl status -D $ClusterDir 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Experimental database cluster is already running on port $Port" -ForegroundColor Green
    exit 0
}

# Start cluster
Write-Host "🚀 Starting experimental database cluster on port $Port..." -ForegroundColor Cyan

# Ensure log directory exists
$LogDir = Split-Path $LogFile -Parent
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

& $PgCtl start -D $ClusterDir -l $LogFile -w -o "-p $Port"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Experimental database cluster started successfully" -ForegroundColor Green
    Write-Host "   Port: $Port" -ForegroundColor Gray
    Write-Host "   Log: $LogFile" -ForegroundColor Gray
    Write-Host "" 
    Write-Host "Connection URL:" -ForegroundColor Yellow
    Write-Host "  postgresql://postgres@127.0.0.1:$Port/infinity_gauntlet_experiment" -ForegroundColor White
} else {
    Write-Host "❌ Failed to start experimental database cluster" -ForegroundColor Red
    Write-Host "Check log: $LogFile" -ForegroundColor Yellow
    exit 1
}
