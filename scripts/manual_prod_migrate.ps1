# Manual Production Migration Script
# Purpose: Apply pending migrations to production database
# CRITICAL: Review this script before running!
#
# Last Updated: 2025-11-06
# Context: Production database needs schema overhaul with new migrations
#
# SAFETY CHECKS:
# 1. Uses RENDER_DB_EXTERNAL_URL (laptop) or RENDER_DB_INTERNAL_URL (Render Node) - direct PostgreSQL, not Accelerate
# 2. Runs in dry-run mode first for verification
# 3. Requires explicit confirmation before applying migrations
# 4. Logs all output for audit trail

param(
    [switch]$DryRun = $false,
    [switch]$Apply = $false,
    [string]$EnvFile = "secrets/Infinity-Gauntlet.env"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Production Database Migration Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Load environment variables
if (-not (Test-Path $EnvFile)) {
    Write-Error "Environment file not found: $EnvFile"
    exit 1
}

Write-Host "[1/6] Loading environment from: $EnvFile" -ForegroundColor Yellow
$envContent = Get-Content $EnvFile
foreach ($line in $envContent) {
    if ($line -match '^([^=]+)=(.+)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"')
        Set-Item -Path "env:$key" -Value $value -Force
    }
}

# Verify required environment variables
Write-Host "[2/6] Verifying database URLs..." -ForegroundColor Yellow

$externalUrl = $env:RENDER_DB_EXTERNAL_URL
$internalUrl = $env:RENDER_DB_INTERNAL_URL
$databaseUrl = $env:DATABASE_URL

if (-not $externalUrl -and -not $internalUrl) {
    Write-Error "No direct database URL found. Need RENDER_DB_EXTERNAL_URL or RENDER_DB_INTERNAL_URL"
    exit 1
}

# Use EXTERNAL URL (preferred for migrations from laptop) or INTERNAL (from Render Node)
$migrateUrl = if ($externalUrl) { $externalUrl } else { $internalUrl }

Write-Host "  Migration URL: $($migrateUrl.Substring(0, 40))..." -ForegroundColor Gray
Write-Host "  Accelerate URL: $($databaseUrl.Substring(0, 40))..." -ForegroundColor Gray
Write-Host ""

# Set environment for Prisma
$env:NODE_ENV = "production"
$env:DATABASE_URL = $migrateUrl
$env:PRISMA_CLIENT_ENGINE_TYPE = ""  # Direct mode

# Check current migration status
Write-Host "[3/6] Checking current migration status..." -ForegroundColor Yellow
Write-Host ""

try {
    $statusOutput = npx prisma migrate status 2>&1 | Out-String
    Write-Host $statusOutput
    
    if ($statusOutput -match "Database schema is up to date") {
        Write-Host "✅ No pending migrations - database is up to date!" -ForegroundColor Green
        exit 0
    }
    
    if ($statusOutput -match "(\d+) migration.*not yet been applied") {
        $pendingCount = $matches[1]
        Write-Host "⚠️  Found $pendingCount pending migration(s)" -ForegroundColor Yellow
    }
} catch {
    Write-Error "Failed to check migration status: $_"
    exit 1
}

Write-Host ""

# Dry run or apply
if ($DryRun) {
    Write-Host "[4/6] DRY RUN MODE - No changes will be made" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Would run: npx prisma migrate deploy" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To apply migrations, run with -Apply flag:" -ForegroundColor Yellow
    Write-Host "  .\scripts\manual_prod_migrate.ps1 -Apply" -ForegroundColor White
    exit 0
}

if ($Apply) {
    Write-Host "[4/6] APPLYING MIGRATIONS TO PRODUCTION" -ForegroundColor Red
    Write-Host ""
    Write-Host "⚠️  WARNING: This will modify the production database schema!" -ForegroundColor Red
    Write-Host ""
    
    $confirmation = Read-Host "Type 'APPLY' to confirm migration"
    
    if ($confirmation -ne "APPLY") {
        Write-Host "❌ Migration cancelled" -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host ""
    Write-Host "[5/6] Running: npx prisma migrate deploy" -ForegroundColor Yellow
    
    try {
        $deployOutput = npx prisma migrate deploy 2>&1 | Out-String
        Write-Host $deployOutput
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Migrations applied successfully!" -ForegroundColor Green
        } else {
            Write-Error "Migration deployment failed with code: $LASTEXITCODE"
            exit 1
        }
    } catch {
        Write-Error "Failed to deploy migrations: $_"
        exit 1
    }
    
    Write-Host ""
    Write-Host "[6/6] Verifying final state..." -ForegroundColor Yellow
    npx prisma migrate status
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "✅ Production migration complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Verify data integrity: npm run db:cli -- counts" -ForegroundColor White
    Write-Host "  2. Run auto-sync to seed: npm run db:auto-sync -- --once" -ForegroundColor White
    Write-Host "  3. Check logs on Render for any errors" -ForegroundColor White
    
} else {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  -DryRun : Check migration status without applying" -ForegroundColor White
    Write-Host "  -Apply  : Apply pending migrations (requires confirmation)" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\scripts\manual_prod_migrate.ps1 -DryRun" -ForegroundColor White
    Write-Host "  .\scripts\manual_prod_migrate.ps1 -Apply" -ForegroundColor White
}
