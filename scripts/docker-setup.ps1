# ==========================================
# Docker Setup and Launch Script
# ==========================================
# Complete setup for Infinity Gauntlet Docker environment

param(
    [switch]$Clean,
    [switch]$SkipBuild
)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Pokémon Infinity Gauntlet - Docker" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

# Check Docker is running
Write-Host "🔍 Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "✓ Docker found: $dockerVersion" -ForegroundColor Green
}
catch {
    Write-Host "✗ Docker not found or not running!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again." -ForegroundColor Yellow
    exit 1
}

# Check environment file
if (-not (Test-Path ".env")) {
    Write-Host "`n📝 Creating .env file..." -ForegroundColor Yellow
    Copy-Item "secrets\Infinity-Gauntlet.env" ".env"
    Write-Host "✓ Environment configured" -ForegroundColor Green
}
else {
    Write-Host "✓ Environment file exists" -ForegroundColor Green
}

# Clean slate if requested
if ($Clean) {
    Write-Host "`n🧹 Cleaning up old containers and volumes..." -ForegroundColor Yellow
    docker compose down -v 2>$null
    Write-Host "✓ Cleaned up" -ForegroundColor Green
}

# Build images
if (-not $SkipBuild) {
    Write-Host "`n🔨 Building Docker images..." -ForegroundColor Cyan
    Write-Host "This may take 3-5 minutes on first run..." -ForegroundColor Yellow
    
    docker compose build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n✗ Build failed!" -ForegroundColor Red
        Write-Host "Check the error messages above." -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "✓ Build complete!" -ForegroundColor Green
}

# Start containers
Write-Host "`n🚀 Starting containers..." -ForegroundColor Cyan
docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n✗ Failed to start containers!" -ForegroundColor Red
    exit 1
}

# Wait for database to be healthy
Write-Host "`n⏳ Waiting for database..." -ForegroundColor Yellow
$maxWait = 30
$waited = 0
while ($waited -lt $maxWait) {
    $status = docker compose ps postgres --format json | ConvertFrom-Json
    if ($status.Health -eq "healthy") {
        Write-Host "✓ Database ready!" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 2
    $waited += 2
    Write-Host "." -NoNewline -ForegroundColor Yellow
}

if ($waited -ge $maxWait) {
    Write-Host "`n⚠️  Database took longer than expected to start" -ForegroundColor Yellow
    Write-Host "Continuing anyway..." -ForegroundColor Yellow
}

# Run migrations
Write-Host "`n📦 Running database migrations..." -ForegroundColor Cyan
docker compose exec -T bot npx prisma migrate deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Migrations complete!" -ForegroundColor Green
}
else {
    Write-Host "⚠️  Migration had issues - check logs" -ForegroundColor Yellow
}

# Show status
Write-Host "`n📊 Container Status:" -ForegroundColor Cyan
docker compose ps

# Test health endpoint
Write-Host "`n🏥 Testing health endpoint..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

try {
    $health = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 10
    Write-Host "✓ Bot is healthy! Status: $($health.StatusCode)" -ForegroundColor Green
}
catch {
    Write-Host "⚠️  Health check not yet responding (bot may still be starting)" -ForegroundColor Yellow
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  🎉 Setup Complete!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Services running:" -ForegroundColor White
Write-Host "  • PostgreSQL:  localhost:5432" -ForegroundColor Cyan
Write-Host "  • Bot Health:  http://localhost:3000/health" -ForegroundColor Cyan
Write-Host "  • Bot Logs:    docker compose logs -f bot" -ForegroundColor Cyan

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Check logs:     docker compose logs -f bot" -ForegroundColor White
Write-Host "  2. Test bot:       Add to Discord server and try /pokemon" -ForegroundColor White
Write-Host "  3. Stop services:  docker compose down" -ForegroundColor White

Write-Host "`nQuick commands:" -ForegroundColor Yellow
Write-Host "  View logs:    docker compose logs -f bot" -ForegroundColor White
Write-Host "  Restart:      docker compose restart bot" -ForegroundColor White
Write-Host "  Shell:        docker compose exec bot sh" -ForegroundColor White
Write-Host "  Database:     docker compose exec postgres psql -U gauntlet -d infinity_gauntlet" -ForegroundColor White

Write-Host "`nSee DOCKER-COMMANDS.md for more commands!`n" -ForegroundColor Green
