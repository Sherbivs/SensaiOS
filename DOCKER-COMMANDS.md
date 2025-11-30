# 🐳 Docker Container - Quick Commands

## Start Application
```powershell
# Start all services
docker compose up -d

# View logs
docker compose logs -f bot

# Check status
docker compose ps
```

## Manage Services
```powershell
# Stop all
docker compose down

# Restart bot
docker compose restart bot

# Rebuild after code changes
docker compose up -d --build
```

## Database
```powershell
# Run migrations
docker compose exec bot npx prisma migrate deploy

# Connect to PostgreSQL
docker compose exec postgres psql -U gauntlet -d infinity_gauntlet

# Check DB connection
docker compose exec bot npx prisma db pull
```

## Debugging
```powershell
# Open shell in bot container
docker compose exec bot sh

# Check health
curl http://localhost:3000/health

# View all logs
docker compose logs -f
```

## VS Code Tasks
Use Ctrl+Shift+P → "Tasks: Run Task" →:
- Docker: Start All Services
- Docker: View Bot Logs
- Docker: Run Migrations
- Docker: Check Health

## Clean Slate
```powershell
# Remove everything (including database)
docker compose down -v

# Start fresh
docker compose up -d
docker compose exec bot npx prisma migrate deploy
```

## Troubleshooting
- **Build fails**: `docker compose build --no-cache`
- **Port conflict**: Edit ports in `docker-compose.yml`
- **Logs not showing**: `docker compose logs --tail=100 bot`
