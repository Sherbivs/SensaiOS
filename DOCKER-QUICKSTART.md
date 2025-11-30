# Docker Quick Start Guide

Get the Pokémon Infinity Gauntlet bot running locally in 5 minutes!

## Prerequisites

- **Docker Desktop** installed ([download here](https://www.docker.com/products/docker-desktop))
- **Discord Bot Token** ([create one here](https://discord.com/developers/applications))

## 1. Setup Environment

```powershell
# Copy environment template
Copy-Item .env.docker .env

# Edit .env and add your Discord bot token
notepad .env
```

Add your token to `.env`:
```bash
BOT_TOKEN=your_actual_discord_bot_token_here
POKEMON_BOT_TOKEN=your_actual_pokemon_bot_token_here
```

## 2. Start Application

```powershell
# Start all services (database + bot + workers)
docker-compose up -d

# Wait ~30 seconds for database to initialize
Start-Sleep -Seconds 30

# Run database migrations
docker-compose exec bot npx prisma migrate deploy
```

## 3. Verify It's Working

```powershell
# Check health endpoint
curl http://localhost:3000/health

# View bot logs
docker-compose logs -f bot
```

You should see output like:
```
✓ Discord client ready
✓ Database connected
✓ Health server listening on :3000
```

## 4. Add Bot to Discord Server

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Navigate to OAuth2 → URL Generator
4. Select scopes: `bot`, `applications.commands`
5. Select permissions: `Administrator` (or minimum required)
6. Copy the generated URL and open in browser
7. Add bot to your test server

## 5. Test Commands

In your Discord server:
```
/pokemon          - View your Pokémon
/battle @user     - Start a battle
/catch            - Catch wild Pokémon
```

## Common Operations

```powershell
# View logs
docker-compose logs -f bot

# Restart bot after code changes
docker-compose up -d --build bot

# Stop everything
docker-compose down

# Clean slate (removes all data)
docker-compose down -v

# Helper script (optional)
.\scripts\docker.ps1 logs
.\scripts\docker.ps1 restart bot
.\scripts\docker.ps1 db
```

## Troubleshooting

### Bot won't start
```powershell
# Check logs for errors
docker-compose logs bot

# Verify environment variables
cat .env

# Restart services
docker-compose restart
```

### Database connection errors
```powershell
# Check PostgreSQL is healthy
docker-compose ps postgres

# View database logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres pg_isready -U gauntlet
```

### Port already in use
```powershell
# Check what's using port 5432 or 3000
netstat -ano | findstr :5432
netstat -ano | findstr :3000

# Stop conflicting process or change ports in docker-compose.yml
```

## Next Steps

- Read full guide: `docs/DOCKER-SETUP.md`
- Configure game settings: Edit `docker-compose.yml` environment variables
- Enable security bot: `docker-compose --profile security up -d`
- View architecture: `docs/architecture-bible/INDEX.md`

## Resources

- **Full Documentation**: `docs/DOCKER-SETUP.md`
- **Operations Guide**: `OPERATIONS.md`
- **Agents Manual**: `Agents.md`
- **Issue Tracker**: https://github.com/Sherbivs/Infinity-Gauntlet/issues

---

**Need Help?** Open an issue on GitHub with:
1. Output of `docker-compose logs`
2. Your `.env` file (with tokens removed)
3. Error messages you're seeing
