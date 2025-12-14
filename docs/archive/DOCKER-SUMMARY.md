# Docker Container Setup - Summary

## Overview

Complete Docker containerization for the Pokémon Infinity Gauntlet application has been created. This allows you to run the entire application stack locally using Docker containers.

## Files Created

### 1. Dockerfile (Multi-stage Build)
**Location**: `Dockerfile`

- **Stage 1 (Builder)**: Compiles TypeScript, generates Prisma client, builds application
- **Stage 2 (Production)**: Minimal Node.js Alpine image with only production dependencies
- **Features**:
  - Non-root user (`nodejs:nodejs`)
  - Health check endpoint monitoring
  - Persistent `/app/Store` directory
  - Security-hardened Alpine base
  - ~200-300 MB final image size

### 2. Docker Compose Configuration
**Location**: `docker-compose.yml`

Multi-container orchestration with:
- **postgres** — PostgreSQL 16 database with health checks
- **bot** — Main Discord bot worker
- **outbox** — Async message delivery worker
- **cache** — Cache refresh worker
- **data-pipeline** — Data pipeline worker
- **security** — Security bot (optional, via profile)

All services connected via `infinity-gauntlet` bridge network with persistent volumes.

### 3. Docker Ignore File
**Location**: `.dockerignore`

Excludes unnecessary files from Docker build context:
- node_modules (rebuilt in container)
- Documentation, tests, IDE files
- Secrets and environment files
- ~50% reduction in build context size

### 4. Environment Template
**Location**: `.env.docker`

Template for local Docker environment with:
- Discord bot credentials (BOT_TOKEN, POKEMON_BOT_TOKEN)
- PostgreSQL password configuration
- Optional security bot settings
- GitHub tokens for data pipeline
- Clear usage instructions

### 5. Comprehensive Documentation
**Location**: `docs/DOCKER-SETUP.md`

Complete guide covering:
- Architecture overview
- Prerequisites and quick start
- Service management commands
- Database operations
- Troubleshooting
- Development workflow
- Production vs development comparison
- Performance expectations

### 6. Quick Start Guide
**Location**: `DOCKER-QUICKSTART.md`

5-minute setup guide with:
- Minimal steps to get running
- Common operations reference
- Troubleshooting tips
- Next steps and resources

### 7. Helper Script
**Location**: `scripts/docker.ps1`

PowerShell script for common operations:
```powershell
.\scripts\docker.ps1 start       # Start all services
.\scripts\docker.ps1 logs bot    # View logs
.\scripts\docker.ps1 shell       # Open container shell
.\scripts\docker.ps1 db          # Connect to PostgreSQL
.\scripts\docker.ps1 clean       # Clean slate
```

### 8. Updated .gitignore
**Location**: `.gitignore`

Modified to allow `.env.docker` template to be committed while still excluding actual `.env` files.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Docker Host                        │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐               │
│  │ PostgreSQL   │  │ Main Bot     │               │
│  │ Container    │◄─┤ Worker       │               │
│  │              │  │              │               │
│  │ Port: 5432   │  │ Port: 3000   │               │
│  └──────────────┘  └──────────────┘               │
│         ▲                                          │
│         │                                          │
│         ├─────┬──────────┬──────────┐             │
│         │     │          │          │             │
│  ┌──────┴──┐ ┌┴──────┐ ┌┴──────┐ ┌┴───────┐      │
│  │ Outbox  │ │Cache  │ │Data   │ │Security│      │
│  │ Worker  │ │Worker │ │Worker │ │Bot     │      │
│  └─────────┘ └───────┘ └───────┘ └────────┘      │
│                                                     │
│  Persistent Volumes:                               │
│  • postgres_data                                   │
│  • bot_store, outbox_store, cache_store           │
│  • pipeline_store, security_store                  │
└─────────────────────────────────────────────────────┘
```

## Quick Start Commands

```powershell
# 1. Setup environment
Copy-Item .env.docker .env
# Edit .env with your Discord bot tokens

# 2. Start all services
docker-compose up -d

# 3. Run migrations
docker-compose exec bot npx prisma migrate deploy

# 4. Verify it's working
docker-compose logs -f bot
curl http://localhost:3000/health

# 5. Stop services
docker-compose down
```

## Key Features

### Production Parity
- Mirrors Render production architecture
- Same worker topology (bot + 4 background workers)
- Identical environment variable structure
- Compatible with production database schema

### Security
- Non-root container user
- Secrets managed via environment variables
- Isolated bridge network
- Health check monitoring
- No hardcoded credentials

### Developer Experience
- Single command to start entire stack
- Hot reload with rebuild: `docker-compose up -d --build`
- Easy log access: `docker-compose logs -f`
- Database tools included: `psql`, migrations
- Helper scripts for common operations

### Performance
Expected resource usage:
- **Total RAM**: 1-2 GB (all services)
- **Bot Worker**: 300-600 MB
- **PostgreSQL**: 100-200 MB
- **Other Workers**: 100-300 MB each
- **Build Time**: 2-5 minutes (first build)
- **Start Time**: 30-60 seconds

## Service Configuration

### Main Bot Worker
- **Command**: `node dist/index.js`
- **Port**: 3000 (health check)
- **Restart**: unless-stopped
- **Health Check**: `/health` endpoint
- **Volume**: `bot_store` mounted at `/app/Store`

### PostgreSQL
- **Image**: postgres:16-alpine
- **Port**: 5432
- **Database**: infinity_gauntlet
- **User**: gauntlet
- **Volume**: `postgres_data` for persistence
- **Health Check**: `pg_isready`

### Workers
Each worker runs independently:
- **Outbox**: Message delivery queue processing
- **Cache**: Hourly Pokémon data refresh
- **Data Pipeline**: Daily reference data updates
- **Security**: Permission guardrails (optional)

## Environment Variables

### Required
- `BOT_TOKEN` — Discord bot token
- `POKEMON_BOT_TOKEN` — Pokemon bot token
- `POSTGRES_PASSWORD` — Database password

### Optional
- `SECURITY_BOT_TOKEN` — Security bot token
- `GITHUB_TOKEN` — For data pipeline
- `RENDER_API_KEY` — For Render API access
- `ALERT_WEBHOOK_URL` — Discord webhook URL

### Auto-configured
- `DATABASE_URL` — Generated from compose
- `PROD_DATABASE_URL` — Same as DATABASE_URL
- `NODE_ENV` — Set to development
- `LOG_FORMAT`, `LOG_BUFFER_*` — Logging config

## Volume Management

### Persistent Data
All data persists across container restarts:
- **postgres_data**: Database files (survives restart)
- **bot_store**: Runtime cache, state files
- **worker stores**: Worker-specific data

### Backup/Restore
```powershell
# Backup database
docker-compose exec postgres pg_dump -U gauntlet infinity_gauntlet > backup.sql

# Restore database
docker-compose exec -T postgres psql -U gauntlet infinity_gauntlet < backup.sql

# Inspect volumes
docker volume ls
docker volume inspect infinity-gauntlet_postgres_data
```

### Clean Slate
```powershell
# Remove all data (fresh start)
docker-compose down -v

# Start fresh
docker-compose up -d
docker-compose exec bot npx prisma migrate deploy
```

## Network Configuration

Bridge network `infinity-gauntlet` connects all services:
- Internal DNS: Services accessible by name
- PostgreSQL URL: `postgres:5432`
- Isolated from host network (secure)
- Port forwarding for external access:
  - `5432:5432` — PostgreSQL
  - `3000:3000` — Bot health check

## Troubleshooting Reference

### Build Issues
```powershell
docker-compose build --no-cache
docker-compose up -d
```

### Connection Issues
```powershell
docker-compose ps                    # Check status
docker-compose logs postgres         # Database logs
docker-compose exec postgres pg_isready -U gauntlet
```

### Port Conflicts
Edit `docker-compose.yml` ports section:
```yaml
ports:
  - "5433:5432"  # Use different host port
```

### Performance Issues
```powershell
docker stats                         # Monitor resources
docker-compose restart bot           # Restart service
docker system prune                  # Clean unused data
```

## Next Steps

### For Development
1. Read `docs/DOCKER-SETUP.md` for detailed guide
2. Review `docker-compose.yml` for service configuration
3. Check `docs/architecture-bible/` for system design
4. Run tests: `docker-compose exec bot npm test`

### For Production
1. Review Render deployment: `render.yaml`
2. Check production monitoring: `OPERATIONS.md`
3. Read scaling guide: `docs/workers.md`
4. Review security: `docs/SECURITY-HARDENING-PROJECT.md`

### For Contributing
1. Local development: Use Docker for consistency
2. Run linter: `docker-compose exec bot npm run lint`
3. Run tests: `docker-compose exec bot npm test`
4. Test migrations: `docker-compose exec bot npx prisma migrate dev`

## Resources

### Documentation
- **Full Docker Guide**: `docs/DOCKER-SETUP.md`
- **Quick Start**: `DOCKER-QUICKSTART.md`
- **Operations**: `OPERATIONS.md`
- **Architecture**: `docs/architecture-bible/INDEX.md`

### Tools
- **Helper Script**: `scripts/docker.ps1`
- **Environment Template**: `.env.docker`
- **Compose Config**: `docker-compose.yml`

### External Links
- **Docker Docs**: https://docs.docker.com/
- **Docker Compose**: https://docs.docker.com/compose/
- **PostgreSQL**: https://www.postgresql.org/docs/
- **Discord.js**: https://discord.js.org/

## Support

**Issues**: https://github.com/Sherbivs/Infinity-Gauntlet/issues

When reporting issues, include:
1. Output of `docker-compose logs`
2. Your `.env` file (with tokens removed)
3. Output of `docker-compose ps`
4. Error messages

---

**Created**: 2025-11-30
**Docker Version**: 24.0+
**Docker Compose Version**: 2.0+
**Node.js Version**: 20 (Alpine)
**PostgreSQL Version**: 16
