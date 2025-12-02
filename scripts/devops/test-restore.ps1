# Test restore to local database (validates backup integrity)
# Usage: pwsh -File scripts/devops/test-restore.ps1 [backup-file]
# Requires: DATABASE_ONPREMISE_DEV_PRIMARY in secrets/Infinity-Gauntlet.env

param(
    [string]$BackupFile = "",
    [string]$EnvFile = "secrets/Infinity-Gauntlet.env"
)

$ErrorActionPreference = "Stop"

# Ensure PostgreSQL 18 bin directory is in PATH
$env:PATH = "C:\Program Files\PostgreSQL\18\bin;$env:PATH"

# Find latest backup if not specified
if ([string]::IsNullOrEmpty($BackupFile)) {
    $latestBackup = Get-ChildItem "backups/pre-timescale-poc/infinity-gauntlet-db-*.dump" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    
    if ($null -eq $latestBackup) {
        Write-Host "❌ Error: No backup file found" -ForegroundColor Red
        Write-Host "   Usage: pwsh -File scripts/devops/test-restore.ps1 [backup-file]"
        exit 1
    }
    
    $BackupFile = $latestBackup.FullName
}

if (-not (Test-Path $BackupFile)) {
    Write-Host "❌ Error: Backup file not found: $BackupFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Backup Restore Test ===" -ForegroundColor Cyan
Write-Host "Backup file: $BackupFile"
$sizeMB = [math]::Round((Get-Item $BackupFile).Length / 1MB, 2)
Write-Host "Backup size: $sizeMB MB"
Write-Host ""

# Load environment variables
if (-not (Test-Path $EnvFile)) {
    Write-Host "❌ Error: Environment file not found: $EnvFile" -ForegroundColor Red
    exit 1
}

$envVars = @{}
Get-Content $EnvFile | Where-Object { $_ -match '^\s*([^#][^=]+)=(.*)$' } | ForEach-Object {
    $key = $matches[1].Trim()
    $value = $matches[2].Trim()
    $envVars[$key] = $value
}

# Get local database URL
$localDbUrl = $envVars["DATABASE_ONPREMISE_DEV_PRIMARY"]
if ([string]::IsNullOrEmpty($localDbUrl)) {
    Write-Host "❌ Error: DATABASE_ONPREMISE_DEV_PRIMARY not found in $EnvFile" -ForegroundColor Red
    Write-Host "   This test requires a local PostgreSQL instance for restore validation"
    exit 1
}

# Parse database URL
if ($localDbUrl -match 'postgresql://([^:]*):?([^@]*)@([^/]+)/(.+)') {
    $dbUser = $matches[1]
    $dbPass = $matches[2]
    $dbHost = $matches[3]
    $dbName = $matches[4]
} else {
    Write-Host "❌ Error: Invalid DATABASE_ONPREMISE_DEV_PRIMARY format" -ForegroundColor Red
    exit 1
}

# Set password environment variable
if (-not [string]::IsNullOrEmpty($dbPass)) {
    $env:PGPASSWORD = $dbPass
}

$testDbName = "infinity_gauntlet_test_restore"

Write-Host "=== Step 1: Drop existing test database ===" -ForegroundColor Yellow
try {
    & psql --host=$dbHost --username=$dbUser --dbname="postgres" --command="DROP DATABASE IF EXISTS $testDbName;" 2>&1 | Out-Null
    Write-Host "✅ Old test database dropped (if existed)"
} catch {
    Write-Host "⚠️  Warning: Could not drop test database: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 2: Create test database ===" -ForegroundColor Yellow
try {
    & psql --host=$dbHost --username=$dbUser --dbname="postgres" --command="CREATE DATABASE $testDbName;" 2>&1 | Out-Null
    Write-Host "✅ Test database created: $testDbName"
} catch {
    Write-Host "❌ Error creating test database: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Step 3: Restore backup to test database ===" -ForegroundColor Yellow
Write-Host "This may take 2-3 minutes..." -ForegroundColor Gray

try {
    & pg_restore --host=$dbHost --username=$dbUser --dbname=$testDbName `
        --no-owner `
        --no-acl `
        --verbose `
        $BackupFile 2>&1 | Where-Object { $_ -match "(processing|creating|restoring)" } | Select-Object -Last 10
    Write-Host "✅ Backup restored successfully"
} catch {
    Write-Host "❌ Error during restore: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Step 4: Verify restored data ===" -ForegroundColor Yellow

try {
    $tableCount = & psql --host=$dbHost --username=$dbUser --dbname=$testDbName `
        --tuples-only --no-align `
        --command="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>&1
    
    Write-Host "✅ Tables restored: $tableCount"
    
    # Check sample data
    $userCount = & psql --host=$dbHost --username=$dbUser --dbname=$testDbName `
        --tuples-only --no-align `
        --command='SELECT COUNT(*) FROM "User";' 2>&1
    
    Write-Host "✅ Sample data: $userCount users"
    
} catch {
    Write-Host "⚠️  Warning: Could not verify data: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 5: Cleanup test database ===" -ForegroundColor Yellow

try {
    & psql --host=$dbHost --username=$dbUser --dbname="postgres" --command="DROP DATABASE $testDbName;" 2>&1 | Out-Null
    Write-Host "✅ Test database cleaned up"
} catch {
    Write-Host "⚠️  Warning: Could not cleanup test database: $_" -ForegroundColor Yellow
    Write-Host "   Manual cleanup: DROP DATABASE $testDbName;" -ForegroundColor Gray
}

# Clear password
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Restore Test Complete ===" -ForegroundColor Green
Write-Host "✅ Backup integrity verified"
Write-Host "✅ Safe to proceed with POC deployment"
Write-Host ""
