# Docker Setup Guide - Pokémon Infinity Gauntlet

## Overview

This guide explains how to run the Pokémon Infinity Gauntlet application locally using Docker containers. The Docker setup mirrors the production Render architecture with multiple workers and a PostgreSQL database.

## Architecture

The Docker Compose setup includes:

- **PostgreSQL Database** — Local database for development
- **Main Bot Worker** — Discord bot with health check endpoint
- **Outbox Worker** — Async message delivery
- **Cache Worker** — Runtime cache maintenance
- **Data Pipeline Worker** — Reference data updates
- **Security Bot** (Optional) — Permission guardrails

## Prerequisites

1. **Docker Desktop** — Install from [docker.com](https://www.docker.com/products/docker-desktop)
2. **Discord Bot Token** — Create bot at [discord.com/developers/applications](https://discord.com/developers/applications)
3. **Git** — For cloning the repository

## Quick Start

### 1. Clone Repository

```powershell
git clone https://github.com/Sherbivs/Infinity-Gauntlet.git
cd Infinity-Gauntlet
```

### 2. Configure Environment

Copy the Docker environment template:

```powershell
Copy-Item .env.docker .env
```

Edit `.env` and add your Discord bot tokens:

```bash
BOT_TOKEN=your_actual_discord_bot_token
POKEMON_BOT_TOKEN=your_actual_pokemon_bot_token
POSTGRES_PASSWORD=localdev123
```

### 3. Build and Start Containers

```powershell
# Build images and start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f bot
```

### 4. Run Database Migrations

```powershell
# Apply Prisma migrations
docker-compose exec bot npx prisma migrate deploy

# Verify database connection
docker-compose exec bot npx prisma db pull
```

### 5. Verify Application

```powershell
# Check health endpoint
curl http://localhost:3000/health

# View bot logs
docker-compose logs -f bot

# Check all services
docker-compose ps
```

## Service Management

### Start/Stop Services

```powershell
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v

# Restart specific service
docker-compose restart bot
```

### View Logs

```powershell
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f bot
docker-compose logs -f postgres
docker-compose logs -f outbox

# Last 100 lines
docker-compose logs --tail=100 bot
```

### Rebuild After Code Changes

```powershell
# Rebuild and restart
docker-compose up -d --build

# Rebuild specific service
docker-compose up -d --build bot
```

## Optional: Security Bot

The security bot is in a separate Docker Compose profile and must be explicitly enabled:

```powershell
# Add SECURITY_BOT_TOKEN to .env first
docker-compose --profile security up -d

# View security bot logs
docker-compose logs -f security
```

## Database Management

### Access PostgreSQL

```powershell
# Connect to PostgreSQL container
docker-compose exec postgres psql -U gauntlet -d infinity_gauntlet

# Run SQL queries
docker-compose exec postgres psql -U gauntlet -d infinity_gauntlet -c "SELECT COUNT(*) FROM \"User\";"
```

### Backup Database

```powershell
# Create backup
docker-compose exec postgres pg_dump -U gauntlet infinity_gauntlet > backups/local-backup-$(Get-Date -Format "yyyyMMdd-HHmmss").sql

# Restore backup
docker-compose exec -T postgres psql -U gauntlet infinity_gauntlet < backups/your-backup.sql
```

### Reset Database

```powershell
# Stop services and remove volumes
docker-compose down -v

# Start fresh
docker-compose up -d

# Run migrations
docker-compose exec bot npx prisma migrate deploy
```

## Troubleshooting

### Container Won't Start

```powershell
# Check logs for errors
docker-compose logs bot

# Verify environment variables
docker-compose config

# Check container status
docker-compose ps
```

### Database Connection Issues

```powershell
# Verify PostgreSQL is healthy
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres pg_isready -U gauntlet
```

### Build Errors

```powershell
# Clean rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Port Conflicts

If port 5432 or 3000 is already in use:

```yaml
# Edit docker-compose.yml
services:
  postgres:
    ports:
      - "5433:5432"  # Change host port
  
  bot:
    ports:
      - "3001:3000"  # Change host port
```

## Development Workflow

### Code Changes

```powershell
# 1. Make changes to src/
# 2. Rebuild container
docker-compose up -d --build bot

# 3. Check logs
docker-compose logs -f bot
```

### Run Tests

```powershell
# Run tests in container
docker-compose exec bot npm test

# Run specific test
docker-compose exec bot npm run test:pbsl
```

### Access Container Shell

```powershell
# Get shell in bot container
docker-compose exec bot sh

# Inside container
ls -la /app
node -v
npm -v
```

## Environment Variables

Key environment variables (set in `.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Discord bot token |
| `POKEMON_BOT_TOKEN` | Yes | Pokemon bot token |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `SECURITY_BOT_TOKEN` | No | Security bot token (if using) |
| `ALERT_WEBHOOK_URL` | No | Discord webhook for alerts |

## Volumes

Persistent data stored in Docker volumes:

- `postgres_data` — Database files
- `bot_store` — Bot runtime cache
- `outbox_store` — Outbox worker state
- `cache_store` — Cache worker data
- `pipeline_store` — Data pipeline cache
- `security_store` — Security bot state

### Inspect Volumes

```powershell
# List volumes
docker volume ls

# Inspect volume
docker volume inspect infinity-gauntlet_postgres_data

# Remove unused volumes
docker volume prune
```

## Production vs Development

| Feature | Docker (Local) | Render (Production) |
|---------|----------------|---------------------|
| Database | PostgreSQL container | Managed PostgreSQL |
| Storage | Docker volumes | Persistent disks |
| Networking | Bridge network | Private network |
| Scaling | Single replica | Auto-scaling |
| Monitoring | Docker logs | Render metrics |

## Performance

Expected resource usage:

- **Bot Worker**: 300-600 MB RAM
- **PostgreSQL**: 100-200 MB RAM
- **Other Workers**: 100-300 MB RAM each
- **Total**: ~1-2 GB RAM

## Next Steps

1. **Configure Discord Bot**: Add bot to your test server
2. **Seed Data**: Run data pipeline to fetch Pokémon data
3. **Test Commands**: Try `/pokemon`, `/battle`, etc.
4. **Monitor Logs**: Watch for errors or issues
5. **Review Docs**: Check `docs/` for architecture details

## References

- Docker Compose Docs: https://docs.docker.com/compose/
- Discord.js Guide: https://discord.js.org/
- Prisma Docs: https://www.prisma.io/docs/
- Project README: `../README.md`
- Operations Guide: `../OPERATIONS.md`

## Support

For issues:

1. Check logs: `docker-compose logs -f`
2. Review troubleshooting section above
3. Open GitHub issue with logs and error details
4. Consult `docs/architecture-bible/` for system design

---

**Last Updated:** 2025-11-30
**Docker Version:** 24.0+
**Docker Compose Version:** 2.0+
