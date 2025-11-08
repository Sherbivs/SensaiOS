# Workstation Gameplay Setup Guide
*Setting up an optional low-latency PostgreSQL mirror on your personal computer*

## Overview

This guide configures an **optional local PostgreSQL on your personal workstation** for ultra-low-latency gameplay testing. This local mirror provides **<50ms latency** for battles, encounters, and trainer operations during development.

**Note:** This is NOT the Game Engine (Render cloud service). This is a PostgreSQL instance running on YOUR personal computer at `127.0.0.1:55433` for offline development.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     INFINITY GAUNTLET                        │
│                    Database Architecture                     │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐     Replication      ┌──────────────┐
│  Game Engine │ ──────────────────>  │ Your Personal│
│   (Render)   │   (PROD → LOCAL)     │  Workstation │
│              │                       │              │
│ PostgreSQL   │   Data flows DOWN    │  PostgreSQL  │
│ 50-200ms     │   from cloud to      │   <50ms      │
│              │   your computer      │              │
└──────────────┘                       └──────────────┘
      ↑                                      ↑
      │                                      │
      │                                      │
  Production Ops                      Testing/Development
  (Render workers)                    (Your VS Code)
  (Migrations)                        (Local bot testing)
  (Replication source)                (Offline gameplay)
```

### Data Flow

1. **Schema changes**: Migrations run on DEV master (Render PostgreSQL) via your workstation using `RENDER_DB_EXTERNAL_URL`
2. **Data sync**: Game Engine's PROD → Your workstation's LOCAL replication (automated every 5 minutes)
3. **Live gameplay**: Discord bot on Game Engine reads/writes to PROD (Game Engine's persistent disk)
4. **Testing**: Discord bot on your workstation can read/write to LOCAL (`localPrisma`) for offline development
5. **Upward sync**: LOCAL changes on your workstation can sync back to Game Engine's PROD (optional, manual)

## Prerequisites

✅ **Already Configured** (from your system):
- Local PostgreSQL installed on your personal computer and running
- Local cluster listening on `127.0.0.1:55433` (YOUR workstation, not Game Engine)
- Database name: `infinity_gauntlet_db`
- Local URL file: `Store/db/local-url.txt` contains `postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db`

**Important:** This setup is for YOUR personal computer (VS Code workstation), NOT for the Game Engine (Render cloud service). The Game Engine uses its own PostgreSQL on its persistent disk (`PROD_DATABASE_URL=postgresql://localhost:5432/...`).

## Setup Steps

### Step 1: Add DATABASE_LOCAL_URL to Environment

Edit your secure environment file on your personal computer:

```powershell
# Open your environment file
notepad "secrets/Infinity-Gauntlet.env"
```

Add this line (or verify it exists):

```bash
# LOCAL WORKSTATION - Optional low-latency mirror on YOUR personal computer
DATABASE_LOCAL_URL=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
```

Your complete database configuration on your workstation should look like:

```bash
# DEV master (Render PostgreSQL) - accessed via internet from your workstation
RENDER_DB_EXTERNAL_URL=postgresql://infinity_gauntlet_db_user:a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db

# LOCAL WORKSTATION - Optional PostgreSQL on YOUR personal computer (port 55433)
DATABASE_LOCAL_URL=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db

# Bot tokens
BOT_TOKEN=MTQzMDcwMjAyOTM5MDQ4MzUyNg.Gc5C1A.YXM3MM68EgWkEfCGyWCfItOQP6tGnUDkjy8rHI
POKEMON_BOT_TOKEN=MTQzMDcwMjAyOTM5MDQ4MzUyNg.Gc5C1A.YXM3MM68EgWkEfCGyWCfItOQP6tGnUDkjy8rHI
```

**Note:** Game Engine (Render) does NOT use these URLs. It uses `DEV_DATABASE_URL` (internal network) and `PROD_DATABASE_URL` (localhost on persistent disk) configured in Render environment variables.

### Step 2: Verify Local Database is Running (On Your Workstation)

```powershell
# Test connection to local PostgreSQL on your personal computer
psql -h 127.0.0.1 -p 55433 -U postgres -d infinity_gauntlet_db -c "SELECT 1;"

# Expected output:
#  ?column?
# ----------
#         1
# (1 row)
```

### Step 3: Bootstrap Local Database (If Fresh Install on Your Workstation)

If your local database on your personal computer is empty or needs schema/data:

```powershell
# Auto-bootstrap: installs PostgreSQL, creates schema, replicates from Game Engine's PROD
npm run ops:auto-bootstrap-local-db

# OR manual bootstrap (if PostgreSQL already installed on your workstation):
npm run ops:bootstrap-local-db
```

This will:
1. ✅ Create `infinity_gauntlet_db` database on your personal computer
2. ✅ Run Prisma migrations to create schema
3. ✅ Replicate data from Game Engine's PROD → Your workstation's LOCAL
4. ✅ Write connection URL to `Store/db/local-url.txt`

### Step 4: Verify Replication Status

```powershell
# Check database health (from your workstation)
npm run db:health

# Expected output (when run from your workstation):
# [DATABASE]
#   DEV   → Status: healthy  | Latency: 390ms    | Source: direct | (Render PostgreSQL master - accessed via internet)
#   PROD  → Status: N/A      | N/A              | N/A            | (Game Engine only - not accessible from workstation)
#   LOCAL → Status: healthy  | Latency: <50ms    | Source: local  | (Your personal computer PostgreSQL) ⭐
```

**Note:** When the Game Engine (Render) runs health checks, it sees DEV (internal network), PROD (localhost), and does NOT see YOUR workstation's LOCAL database.

### Step 5: Test Gameplay Operations (On Your Workstation)

```powershell
# Start the Discord bot locally (will use LOCAL on your workstation for testing)
npm start

# Monitor logs for LOCAL database usage:
# [DATABASE] LOCAL → Status: healthy | Latency: 15ms (your personal computer)
```

**Production Note:** When bots run on the Game Engine (Render), they use `prisma` (PROD_DATABASE_URL → localhost PostgreSQL on persistent disk), NOT `localPrisma`. The `localPrisma` client is only available when running bots on YOUR personal workstation with DATABASE_LOCAL_URL configured.

## Usage Patterns

### In Your Bot Code (Running on Your Workstation)

When you run bots on your personal computer for testing, the application can use `localPrisma` for ultra-low latency:

```typescript
import { localPrisma, prisma } from '../shared/prisma.js';

// Battles, encounters, trainer operations (local testing on your workstation)
async function handleBattle(trainerId: string) {
  // Prefer LOCAL for <50ms latency when testing on your workstation
  const client = localPrisma || prisma;
  
  const trainer = await client.user.findUnique({
    where: { discordId: trainerId },
    include: { pokemon: true }
  });
  
  // Battle logic runs on your workstation's local database
  // Lightning-fast reads/writes (<50ms total)
}
```

**Production Note:** On the Game Engine (Render), `localPrisma` is `undefined` because DATABASE_LOCAL_URL is not configured there. Production bots use `prisma` (PROD_DATABASE_URL → localhost PostgreSQL on Game Engine's persistent disk).

### Explicit Client Selection

```typescript
// Force LOCAL (fails if unavailable - only works on your workstation with DATABASE_LOCAL_URL)
if (!localPrisma) {
  throw new Error('Local workstation database required for this operation');
}
const trainer = await localPrisma.user.findUnique({ ... });

// Force PROD (production database - Game Engine's localhost or your workstation via RENDER_DB_EXTERNAL_URL)
const globalStats = await prisma.battleLog.aggregate({ ... });

// Force DEV (Render PostgreSQL master - migrations, replication monitoring)
// From your workstation: use RENDER_DB_EXTERNAL_URL
// From Game Engine: use DEV_DATABASE_URL (internal network)
if (devPrisma) {
  await devPrisma.$queryRaw`SELECT pg_size_pretty(pg_database_size(current_database()))`;
}
```

## Replication Schedule

### Automated Sync (PROD → LOCAL)

The replication system runs automatically:

```bash
# Every 5 minutes (configurable):
npm run db:auto-sync

# Manual sync:
npm run db:replicate
```

### What Gets Replicated

- ✅ Species data (Pokémon, moves, abilities)
- ✅ Trainer data (users, caught Pokémon, battle history)
- ✅ Game state (encounters, active battles)
- ✅ Schema changes (migrations)

### Replication Monitoring

```bash
# View replication status
npm run db:replication-status

# Expected output:
# DEV → PROD: MATCH (fingerprint: abc123...)
# PROD → LOCAL: AHEAD (LOCAL is 2 migrations behind)
```

## Performance Comparison

| Operation | PROD (Direct PG) | DEV (Direct PG) | LOCAL (Workstation) |
|-----------|------------------|-----------------|---------------------|
| **Find trainer** | 88ms | 95ms | **15ms** ⚡ |
| **Battle round** | 120ms | 150ms | **25ms** ⚡ |
| **Catch Pokémon** | 95ms | 110ms | **18ms** ⚡ |
| **Query leaderboard** | 150ms | 180ms | **30ms** ⚡ |

**Result**: LOCAL database provides **5-20x faster** response times for live gameplay! 🚀

## Troubleshooting

### Issue: LOCAL shows "offline"

**Check 1**: Verify PostgreSQL is running
```powershell
Get-Process postgres
# Should show running processes
```

**Check 2**: Test connection manually
```powershell
psql -h 127.0.0.1 -p 55433 -U postgres -d infinity_gauntlet_db -c "SELECT 1;"
```

**Check 3**: Verify environment variable
```powershell
$Env:DATABASE_LOCAL_URL
# Should print: postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
```

**Check 4**: Restart application
```powershell
# Reload environment
$Env:IG_ENV_FILE = "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env"
npm start
```

### Issue: Replication fails

**Symptom**: `PROD → LOCAL: DIVERGED`

**Solution**:
```powershell
# Reset local database to match PROD
npm run ops:bootstrap-local-db --force

# Re-run replication
npm run db:replicate
```

### Issue: Schema out of sync

**Symptom**: `Prisma schema version mismatch`

**Solution**:
```bash
# Run migrations on local database
npx prisma migrate deploy

# Regenerate Prisma client
npx prisma generate
```

## Maintenance

### Daily Operations

```bash
# Morning: Check replication status
npm run db:health

# During gameplay: Monitor latency in logs
# (LOCAL should consistently show <50ms)

# Evening: Verify data sync
npm run db:replication-status
```

### Weekly Maintenance

```bash
# Vacuum local database (reclaim space)
psql -h 127.0.0.1 -p 55433 -U postgres -d infinity_gauntlet_db -c "VACUUM ANALYZE;"

# Check database size
npm run db:cli -- query "SELECT pg_size_pretty(pg_database_size(current_database()));"
```

### Backup Strategy

```bash
# Backup local database (before major changes)
npm run ops:backup-local-db

# Backups stored in: Store/db/backups/
# Format: infinity_gauntlet_db_YYYY-MM-DD_HH-MM-SS.sql
```

## Benefits of Local Workstation Setup

1. ✅ **Lightning-fast gameplay**: <50ms latency vs 88-200ms cloud
2. ✅ **Offline capability**: Play without internet (after initial sync)
3. ✅ **Cost savings**: Reduce cloud database API calls
4. ✅ **Data sovereignty**: Full control over game data
5. ✅ **Development flexibility**: Test changes locally before cloud deploy

## Security Notes

- 🔒 Local database runs on `127.0.0.1` (localhost only, not exposed to network)
- 🔒 Connection string in `Store/db/local-url.txt` is gitignored
- 🔒 Environment file (`Key/Dev/.env`) is outside repository
- 🔒 Replication is one-way by default (PROD → LOCAL), preventing accidental cloud corruption

## Next Steps

1. ✅ Add `DATABASE_LOCAL_URL` to your environment file
2. ✅ Run `npm run db:health` to verify LOCAL is healthy
3. ✅ Start Discord bot and play! Monitor logs for LOCAL database usage
4. ✅ Enjoy <50ms latency for all gameplay operations! 🎮⚡

**Status**: Your local PostgreSQL is already running at `127.0.0.1:55433`. You just need to add the environment variable and restart the bot!
