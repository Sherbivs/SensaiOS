# ==========================================
# Docker Desktop Installation Script
# ==========================================
# Installs Docker Desktop on Windows and configures for development

param(
    [switch]$SkipInstall,
    [switch]$ConfigureOnly
)

Write-Host "==========================================`n" -ForegroundColor Cyan
Write-Host "Docker Desktop Installation for Infinity Gauntlet`n" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check if Docker is already installed
$dockerInstalled = Get-Command docker -ErrorAction SilentlyContinue

if ($dockerInstalled) {
    Write-Host "`n✓ Docker is already installed!" -ForegroundColor Green
    Write-Host "  Location: $($dockerInstalled.Source)" -ForegroundColor Gray
    
    # Check Docker version
    $dockerVersion = docker --version 2>$null
    Write-Host "  Version: $dockerVersion" -ForegroundColor Gray
    
    # Check if Docker Desktop is running
    $dockerRunning = docker ps 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Status: Running ✓" -ForegroundColor Green
    } else {
        Write-Host "  Status: Not running (Start Docker Desktop)" -ForegroundColor Yellow
        Write-Host "`nStarting Docker Desktop..." -ForegroundColor Cyan
        Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
        Write-Host "Waiting for Docker to start (this may take 30-60 seconds)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
    }
} else {
    Write-Host "`n⚠ Docker is not installed" -ForegroundColor Yellow
    
    if ($ConfigureOnly) {
        Write-Host "ERROR: Cannot configure without Docker installed" -ForegroundColor Red
        exit 1
    }
    
    if (-not $SkipInstall) {
        Write-Host "`nDownloading Docker Desktop installer..." -ForegroundColor Cyan
        
        $installerUrl = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
        $installerPath = "$env:TEMP\DockerDesktopInstaller.exe"
        
        try {
            # Download installer
            Write-Host "  Downloading from: $installerUrl" -ForegroundColor Gray
            Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
            Write-Host "  ✓ Download complete" -ForegroundColor Green
            
            # Run installer
            Write-Host "`nRunning Docker Desktop installer..." -ForegroundColor Cyan
            Write-Host "  (This will require administrator privileges)" -ForegroundColor Yellow
            
            Start-Process -FilePath $installerPath -Wait -ArgumentList "install", "--quiet"
            
            Write-Host "`n✓ Docker Desktop installation complete!" -ForegroundColor Green
            Write-Host "`n⚠ IMPORTANT: You need to:" -ForegroundColor Yellow
            Write-Host "  1. Restart your computer" -ForegroundColor Yellow
            Write-Host "  2. Start Docker Desktop from the Start menu" -ForegroundColor Yellow
            Write-Host "  3. Wait for Docker to fully start (check system tray)" -ForegroundColor Yellow
            Write-Host "  4. Run this script again to verify installation" -ForegroundColor Yellow
            
            # Cleanup
            Remove-Item $installerPath -ErrorAction SilentlyContinue
            
            Write-Host "`nAfter restart, run:" -ForegroundColor Cyan
            Write-Host "  pwsh -File scripts/install_docker.ps1 -ConfigureOnly" -ForegroundColor White
            
            exit 0
        }
        catch {
            Write-Host "`n✗ Installation failed: $_" -ForegroundColor Red
            Write-Host "`nPlease install Docker Desktop manually from:" -ForegroundColor Yellow
            Write-Host "  https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
            exit 1
        }
    }
}

# Wait for Docker to be fully ready
Write-Host "`nWaiting for Docker daemon to be ready..." -ForegroundColor Cyan
$maxAttempts = 30
$attempt = 0

while ($attempt -lt $maxAttempts) {
    $dockerReady = docker ps 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Docker daemon is ready!" -ForegroundColor Green
        break
    }
    
    $attempt++
    Write-Host "  Attempt $attempt/$maxAttempts - Waiting..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
}

if ($attempt -eq $maxAttempts) {
    Write-Host "✗ Docker daemon failed to start" -ForegroundColor Red
    Write-Host "`nPlease:" -ForegroundColor Yellow
    Write-Host "  1. Start Docker Desktop from the Start menu" -ForegroundColor Yellow
    Write-Host "  2. Wait for the Docker icon in system tray to show 'Docker Desktop is running'" -ForegroundColor Yellow
    Write-Host "  3. Run this script again" -ForegroundColor Yellow
    exit 1
}

# Verify Docker Compose
Write-Host "`nVerifying Docker Compose..." -ForegroundColor Cyan
$composeVersion = docker compose version 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Docker Compose is available" -ForegroundColor Green
    Write-Host "  Version: $composeVersion" -ForegroundColor Gray
} else {
    Write-Host "✗ Docker Compose not available" -ForegroundColor Red
    exit 1
}

# Check if .env file exists
Write-Host "`nChecking environment configuration..." -ForegroundColor Cyan
$envFile = ".env"
$envTemplate = ".env.docker"

if (Test-Path $envFile) {
    Write-Host "✓ .env file exists" -ForegroundColor Green
} else {
    Write-Host "⚠ .env file not found" -ForegroundColor Yellow
    
    if (Test-Path $envTemplate) {
        Write-Host "  Creating .env from template..." -ForegroundColor Cyan
        Copy-Item $envTemplate $envFile
        Write-Host "  ✓ .env file created from template" -ForegroundColor Green
        Write-Host "`n⚠ IMPORTANT: Edit .env and add your Discord bot tokens:" -ForegroundColor Yellow
        Write-Host "  notepad .env" -ForegroundColor White
        Write-Host "`nRequired variables:" -ForegroundColor Yellow
        Write-Host "  BOT_TOKEN=your_discord_bot_token_here" -ForegroundColor Gray
        Write-Host "  POKEMON_BOT_TOKEN=your_pokemon_bot_token_here" -ForegroundColor Gray
    } else {
        Write-Host "✗ .env.docker template not found" -ForegroundColor Red
        exit 1
    }
}

# Summary
Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "Docker Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "  1. Edit .env file with your Discord bot tokens" -ForegroundColor White
Write-Host "     notepad .env" -ForegroundColor Gray
Write-Host "`n  2. Start the application:" -ForegroundColor White
Write-Host "     docker compose up -d" -ForegroundColor Gray
Write-Host "`n  3. Run database migrations:" -ForegroundColor White
Write-Host "     docker compose exec bot npx prisma migrate deploy" -ForegroundColor Gray
Write-Host "`n  4. View logs:" -ForegroundColor White
Write-Host "     docker compose logs -f bot" -ForegroundColor Gray
Write-Host "`n  5. Check health:" -ForegroundColor White
Write-Host "     curl http://localhost:3000/health" -ForegroundColor Gray

Write-Host "`nQuick Reference:" -ForegroundColor Cyan
Write-Host "  VS Code Task: Run Task > Docker: Start All Services" -ForegroundColor Gray
Write-Host "  Helper Script: .\scripts\docker.ps1 start" -ForegroundColor Gray
Write-Host "  Full Guide: docs/DOCKER-SETUP.md" -ForegroundColor Gray

Write-Host "`n==========================================" -ForegroundColor Cyan
