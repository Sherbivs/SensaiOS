<#
.SYNOPSIS
Show status of both PRIMARY LOCAL and EXPERIMENTAL databases.

.DESCRIPTION
Displays connection status, ports, running state, and basic stats for both local databases.

.EXAMPLE
.\scripts\ops\status_local_dbs.ps1
#>

$ErrorActionPreference = "Stop"

Write-Host "🔍 Local Databases Status" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""

# Resolve Store root
$StoreRoot = if ($env:IG_STORE_ROOT) { 
    $env:IG_STORE_ROOT 
} else { 
    Join-Path $PSScriptRoot "..\..\Store" 
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
    Write-Host "❌ PostgreSQL binaries not found" -ForegroundColor Red
    exit 1
}

$PgCtl = Join-Path $PgBinDir "pg_ctl.exe"
$Psql = Join-Path $PgBinDir "psql.exe"

function Get-DatabaseStatus {
    param (
        [string]$Name,
        [string]$ClusterPath,
        [int]$Port,
        [string]$DbName
    )
    
    Write-Host "$Name Database" -ForegroundColor Yellow
    Write-Host "  Port: $Port" -ForegroundColor Gray
    Write-Host "  Cluster: $ClusterPath" -ForegroundColor Gray
    
    if (-not (Test-Path $ClusterPath)) {
        Write-Host "  Status: ❌ Not initialized" -ForegroundColor Red
        Write-Host ""
        return
    }
    
    # Check if running
    & $PgCtl status -D $ClusterPath 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Status: ✅ Running" -ForegroundColor Green
        
        # Get row counts
        $ConnStr = "postgresql://postgres@127.0.0.1:$Port/$DbName"
        $Tables = @("User", "Species", "PokemonInstance", "Battle")
        
        Write-Host "  Row Counts:" -ForegroundColor Gray
        foreach ($Table in $Tables) {
            try {
                $Query = 'SELECT COUNT(*) FROM "' + $Table + '";'
                $Count = & $Psql $ConnStr -t -A -c $Query 2>$null
                if ($LASTEXITCODE -eq 0 -and $Count) {
                    Write-Host "    $Table - $Count" -ForegroundColor White
                }
            } catch {
                Write-Host "    $Table - (error)" -ForegroundColor DarkGray
            }
        }
    } else {
        Write-Host "  Status: ⏸️  Stopped" -ForegroundColor Yellow
    }
    
    Write-Host ""
}

# Check PRIMARY LOCAL DB
$LocalCluster = Join-Path $StoreRoot "db\local-cluster"
Get-DatabaseStatus -Name "PRIMARY LOCAL" -ClusterPath $LocalCluster -Port 55433 -DbName "infinity_gauntlet_db"

# Check EXPERIMENTAL DB
$ExperimentCluster = Join-Path $StoreRoot "db-experiment\pg_data"
Get-DatabaseStatus -Name "EXPERIMENTAL" -ClusterPath $ExperimentCluster -Port 55434 -DbName "infinity_gauntlet_experiment"

Write-Host "Environment Variables:" -ForegroundColor Yellow
if ($env:DATABASE_LOCAL_URL) {
    Write-Host "  DATABASE_LOCAL_URL: ✅ Set" -ForegroundColor Green
} else {
    Write-Host "  DATABASE_LOCAL_URL: ❌ Not set" -ForegroundColor Red
}

if ($env:DATABASE_EXPERIMENT_URL) {
    Write-Host "  DATABASE_EXPERIMENT_URL: ✅ Set" -ForegroundColor Green
} else {
    Write-Host "  DATABASE_EXPERIMENT_URL: ❌ Not set" -ForegroundColor Red
}

Write-Host ""
Write-Host "Commands:" -ForegroundColor Cyan
Write-Host "  Start experimental - npm run ops:start-experiment-db" -ForegroundColor Gray
Write-Host "  Stop experimental - npm run ops:stop-experiment-db" -ForegroundColor Gray
Write-Host "  Sync experimental - npm run ops:sync-experiment-db" -ForegroundColor Gray
