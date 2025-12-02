# Backup production database before TimescaleDB POC
# Usage: pwsh -File scripts/devops/backup-database.ps1
# Requires: RENDER_DB_EXTERNAL_URL or PROD_DATABASE_URL in secrets/Infinity-Gauntlet.env
# Requires: PostgreSQL 18 client tools (matching production server version)

param(
    [string]$EnvFile = "secrets/Infinity-Gauntlet.env"
)

$ErrorActionPreference = "Stop"

# Ensure PostgreSQL 18 bin directory is in PATH (required for version compatibility)
$env:PATH = "C:\Program Files\PostgreSQL\18\bin;$env:PATH"

# Load environment variables
if (-not (Test-Path $EnvFile)) {
    Write-Host "❌ Error: Environment file not found: $EnvFile" -ForegroundColor Red
    Write-Host "   Expected: secrets/Infinity-Gauntlet.env"
    exit 1
}

$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.*)$') {
        $envVars[$matches[1]] = $matches[2]
    }
}

$DatabaseUrl = $envVars['RENDER_DB_EXTERNAL_URL']
if (-not $DatabaseUrl) {
    $DatabaseUrl = $envVars['PROD_DATABASE_URL']
}

if (-not $DatabaseUrl) {
    Write-Host "❌ Error: Neither RENDER_DB_EXTERNAL_URL nor PROD_DATABASE_URL found in $EnvFile" -ForegroundColor Red
    exit 1
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupDir = "backups/pre-timescale-poc"
$BackupFile = "$BackupDir/infinity-gauntlet-db-$Timestamp.dump"

Write-Host ""
Write-Host "=== Database Backup (Pre-TimescaleDB POC) ===" -ForegroundColor Cyan
Write-Host "Timestamp: $Timestamp"
Write-Host "Backup file: $BackupFile"
Write-Host ""

# Create backup directory
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# Backup using custom format (compressed, faster restore)
Write-Host "Starting pg_dump (this may take 1-2 minutes)..." -ForegroundColor Yellow

# Parse database URL for connection parameters
if ($DatabaseUrl -match 'postgresql://([^:]+):([^@]+)@([^/]+)/(.+)') {
    $dbUser = $matches[1]
    $dbPass = $matches[2]
    $dbHost = $matches[3]
    $dbName = $matches[4]
    
    # Set password environment variable for pg_dump
    $env:PGPASSWORD = $dbPass
    
    try {
        & pg_dump --host=$dbHost --username=$dbUser --dbname=$dbName `
            --format=custom `
            --compress=9 `
            --verbose `
            --file=$BackupFile 2>&1 | Where-Object { $_ -match "(dumping|complete|rows)" } | Select-Object -Last 20
    } catch {
        Write-Host "❌ Backup failed: $_" -ForegroundColor Red
        exit 1
    } finally {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "❌ Error: Invalid database URL format" -ForegroundColor Red
    exit 1
}

# Calculate backup size
$BackupSize = (Get-Item $BackupFile).Length
$BackupSizeMB = [math]::Round($BackupSize / 1MB, 2)

Write-Host ""
Write-Host "✅ Backup complete: $BackupSizeMB MB" -ForegroundColor Green

# Verify backup integrity
Write-Host ""
Write-Host "=== Verifying Backup Integrity ===" -ForegroundColor Cyan
& pg_restore --list $BackupFile 2>&1 | Select-Object -First 20 | ForEach-Object { Write-Host $_ }

# Create metadata file
$metadata = @{
    timestamp = $Timestamp
    backup_file = $BackupFile
    backup_size_mb = $BackupSizeMB
    database_url = "RENDER_DB_EXTERNAL_URL"
    purpose = "Pre-TimescaleDB POC deployment"
    restore_tested = $false
    retention_days = 90
} | ConvertTo-Json

$metadata | Out-File -FilePath "$BackupDir/backup-$Timestamp-metadata.json" -Encoding utf8

Write-Host ""
Write-Host "✅ Backup metadata saved" -ForegroundColor Green
Write-Host ""
Write-Host "=== Backup Summary ===" -ForegroundColor Cyan
Write-Host "File: $BackupFile"
Write-Host "Size: $BackupSizeMB MB"
Write-Host "Retention: 90 days"
Write-Host ""
Write-Host "⚠️  IMPORTANT: Test restore before proceeding with POC deployment" -ForegroundColor Yellow
Write-Host "   Run: pwsh -File scripts/devops/test-restore.ps1 $BackupFile"
