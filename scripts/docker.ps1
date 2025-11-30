# ==========================================
# Docker Quick Reference Script
# ==========================================
# PowerShell helper for common Docker operations

param(
    [Parameter(Position=0)]
    [ValidateSet('start', 'stop', 'restart', 'logs', 'build', 'shell', 'db', 'health', 'clean', 'help')]
    [string]$Command = 'help',
    
    [Parameter(Position=1)]
    [string]$Service = 'bot'
)

function Show-Help {
    Write-Host @"
==========================================
Docker Quick Reference - Infinity Gauntlet
==========================================

Usage: .\docker.ps1 <command> [service]

Commands:
  start       Start all services
  stop        Stop all services
  restart     Restart service (default: bot)
  logs        View logs (default: bot)
  build       Rebuild and restart
  shell       Open shell in container (default: bot)
  db          Connect to PostgreSQL
  health      Check health endpoint
  clean       Remove all containers and volumes
  help        Show this help message

Examples:
  .\docker.ps1 start
  .\docker.ps1 logs bot
  .\docker.ps1 restart outbox
  .\docker.ps1 shell
  .\docker.ps1 db
  .\docker.ps1 clean

Services:
  bot         Main Discord bot
  postgres    PostgreSQL database
  outbox      Outbox worker
  cache       Cache worker
  data-pipeline Data pipeline worker
  security    Security bot (requires --profile security)

"@
}

function Start-Services {
    Write-Host "Starting all services..." -ForegroundColor Green
    docker-compose up -d
    Write-Host "Services started. Run '.\docker.ps1 logs' to view logs." -ForegroundColor Green
}

function Stop-Services {
    Write-Host "Stopping all services..." -ForegroundColor Yellow
    docker-compose down
    Write-Host "Services stopped." -ForegroundColor Yellow
}

function Restart-Service {
    param([string]$ServiceName)
    Write-Host "Restarting $ServiceName..." -ForegroundColor Cyan
    docker-compose restart $ServiceName
    Write-Host "$ServiceName restarted." -ForegroundColor Cyan
}

function Show-Logs {
    param([string]$ServiceName)
    Write-Host "Showing logs for $ServiceName (Ctrl+C to exit)..." -ForegroundColor Cyan
    docker-compose logs -f $ServiceName
}

function Build-Service {
    Write-Host "Rebuilding and restarting services..." -ForegroundColor Magenta
    docker-compose up -d --build
    Write-Host "Build complete." -ForegroundColor Magenta
}

function Open-Shell {
    param([string]$ServiceName)
    Write-Host "Opening shell in $ServiceName container..." -ForegroundColor Cyan
    docker-compose exec $ServiceName sh
}

function Connect-Database {
    Write-Host "Connecting to PostgreSQL..." -ForegroundColor Cyan
    docker-compose exec postgres psql -U gauntlet -d infinity_gauntlet
}

function Check-Health {
    Write-Host "Checking health endpoint..." -ForegroundColor Cyan
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing
        Write-Host "Status: $($response.StatusCode) - $($response.Content)" -ForegroundColor Green
    }
    catch {
        Write-Host "Health check failed: $_" -ForegroundColor Red
    }
}

function Clean-All {
    Write-Host "WARNING: This will remove all containers and volumes!" -ForegroundColor Red
    $confirm = Read-Host "Are you sure? (y/N)"
    if ($confirm -eq 'y' -or $confirm -eq 'Y') {
        Write-Host "Removing containers and volumes..." -ForegroundColor Yellow
        docker-compose down -v
        Write-Host "Cleanup complete." -ForegroundColor Green
    }
    else {
        Write-Host "Cleanup cancelled." -ForegroundColor Yellow
    }
}

# Execute command
switch ($Command) {
    'start'   { Start-Services }
    'stop'    { Stop-Services }
    'restart' { Restart-Service -ServiceName $Service }
    'logs'    { Show-Logs -ServiceName $Service }
    'build'   { Build-Service }
    'shell'   { Open-Shell -ServiceName $Service }
    'db'      { Connect-Database }
    'health'  { Check-Health }
    'clean'   { Clean-All }
    'help'    { Show-Help }
    default   { Show-Help }
}
