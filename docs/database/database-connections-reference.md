# Database Connections Reference

**Last Updated**: 2025-11-10  
**Status**: Production-Ready  
**Purpose**: Comprehensive connection methods for all databases

## Overview

This document provides the canonical connection information for all databases in the Infinity Gauntlet infrastructure. Use this as the single source of truth for database access across development, testing, and production environments.

## Production Environment (Render)

### Render Managed PostgreSQL (Primary)
**Status**: ✅ Active  
**Purpose**: Production database for all live operations  
**Location**: Render Cloud (Virginia region)

**Connection Methods:**

#### Environment Variable
```bash
PROD_DATABASE_URL=postgresql://infinity_gauntlet_db_user:a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db
```

#### Direct Connection (psql)
```bash
psql "postgresql://infinity_gauntlet_db_user:a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db"
```

#### Via npm CLI Tool
```bash
npm run db:cli -- status
npm run db:cli -- counts
npm run db:cli -- query "SELECT COUNT(*) FROM \"Species\";"
```

#### Prisma Client (Runtime)
```typescript
import { prisma } from '../shared/prisma.js';

// All production operations use this client
const users = await prisma.user.findMany();
```

**Connection Details:**
- **Host**: `dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com`
- **Port**: `5432` (default PostgreSQL)
- **Database**: `infinity_gauntlet_db`
- **User**: `infinity_gauntlet_db_user`
- **SSL**: Required (enforced by Render)
- **Max Connections**: 100 (Render managed)

**Storage:**
- **Quota**: 0.5 GB (production tier)
- **Current Usage**: Check via `npm run db:cli -- query "SELECT pg_size_pretty(pg_database_size(current_database()));"`

**Access From:**
- ✅ Render services (internal network)
- ✅ Local development (via direct URL)
- ✅ Prisma migrations
- ✅ npm scripts

---

## Development Environments

### On-Premise Dev Primary (Local Workstation)
**Status**: ✅ Active  
**Purpose**: Local development mirror of production  
**Location**: Local workstation (Store/onpremise-dev-primary/)

**Connection Methods:**

#### Environment Variable
```bash
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
```

#### Direct Connection (psql)
```bash
psql -h 127.0.0.1 -p 55433 -U postgres -d infinity_gauntlet_db
```

Or using the full URL:
```bash
psql "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db"
```

#### Via npm CLI Tool
```bash
npm run db:cli -- status --target local
npm run db:cli -- counts --target local
```

#### Prisma Client (Runtime)
```typescript
import { onPremiseDevPrisma } from '../shared/prisma.js';

// Optional offline development client
if (onPremiseDevPrisma) {
  const users = await onPremiseDevPrisma.user.findMany();
}
```

**Connection Details:**
- **Host**: `127.0.0.1` (localhost)
- **Port**: `55433` (custom port)
- **Database**: `infinity_gauntlet_db`
- **User**: `postgres` (superuser, no password)
- **SSL**: Not required (local connection)
- **Cluster Directory**: `Store/onpremise-dev-primary/onpremise-cluster/`
- **Log File**: `Store/onpremise-dev-primary/onpremise-postgres.log`

**Management:**

Start database:
```bash
pg_ctl -D "Store/onpremise-dev-primary/onpremise-cluster" -l "Store/onpremise-dev-primary/onpremise-postgres.log" start -o "-p 55433 -h 127.0.0.1"
```

Stop database:
```bash
pg_ctl -D "Store/onpremise-dev-primary/onpremise-cluster" stop
```

Check status:
```bash
pg_isready -h 127.0.0.1 -p 55433
```

Bootstrap/Mirror from production:
```bash
npm run ops:bootstrap-onpremise-dev
```

**Snapshots:**
- **Location**: `Store/onpremise-dev-primary/snapshots/`
- **Format**: PostgreSQL custom dump (`.dump`)
- **Naming**: `infinity_gauntlet_db-YYYY-MM-DDTHH-mm-ss-SSSZ.dump`
- **Retention**: Managed by bootstrap script

**Data Source:**
- Mirrored from Production (Render PostgreSQL)
- Snapshot timestamp indicates last sync
- Use bootstrap script to refresh

---

### On-Premise Dev Experiment (Migration Testing)
**Status**: ⚠️ Optional  
**Purpose**: Isolated database for testing migrations before production  
**Location**: Local workstation (Store/onpremise-dev-experiment/)

**Connection Methods:**

#### Environment Variable
```bash
DATABASE_ONPREMISE_DEV_EXPERIMENT=postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment
```

#### Direct Connection (psql)
```bash
psql -h 127.0.0.1 -p 55434 -U postgres -d infinity_gauntlet_experiment
```

Or using the full URL:
```bash
psql "postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment"
```

#### Via npm CLI Tool
```bash
npm run db:cli -- status --target experiment
npm run db:cli -- counts --target experiment
```

#### Prisma Client (Runtime)
```typescript
import { experimentPrisma } from '../shared/prisma.js';

// Optional experiment/testing client
if (experimentPrisma) {
  const users = await experimentPrisma.user.findMany();
}
```

**Connection Details:**
- **Host**: `127.0.0.1` (localhost)
- **Port**: `55434` (custom port, different from dev primary)
- **Database**: `infinity_gauntlet_experiment`
- **User**: `postgres` (superuser, no password)
- **SSL**: Not required (local connection)
- **Cluster Directory**: `Store/onpremise-dev-experiment/onpremise-cluster/`
- **Log File**: `Store/onpremise-dev-experiment/onpremise-postgres.log`

**Management:**

Start database:
```bash
npm run ops:start-onpremise-experiment
```

Stop database:
```bash
npm run ops:stop-onpremise-experiment
```

Bootstrap from dev primary (offline):
```bash
npm run ops:bootstrap-onpremise-experiment
```

Bootstrap from production (online):
```bash
npm run ops:bootstrap-onpremise-experiment -- --source prod
```

Sync from dev primary:
```bash
npm run ops:sync-onpremise-experiment
```

**Data Source:**
- Default: Cloned from On-Premise Dev Primary (offline)
- Optional: Can sync from Production (online)
- Completely isolated for destructive testing

**Use Cases:**
- Test migrations before applying to production
- Validate schema changes
- Practice rollback procedures
- Test destructive operations (DROP TABLE, etc.)

---

## Connection String Formats

### PostgreSQL URL Format
```
postgresql://[user[:password]@][host][:port][/database][?parameters]
```

### Examples

**Production (with password):**
```
postgresql://infinity_gauntlet_db_user:a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db
```

**Local (no password, custom port):**
```
postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
```

**With SSL parameters:**
```
postgresql://user:pass@host:5432/database?sslmode=require
```

---

## Environment Variables Summary

```bash
# Production (Render)
PROD_DATABASE_URL=postgresql://infinity_gauntlet_db_user:a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db

# Alias (same as PROD_DATABASE_URL)
RENDER_DB_EXTERNAL_URL=${PROD_DATABASE_URL}

# Local Development (On-Premise)
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db

# Migration Testing (On-Premise)
DATABASE_ONPREMISE_DEV_EXPERIMENT=postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment
```

**Configuration File:**
- **Location**: `secrets/Infinity-Gauntlet.env`
- **Loading**: Via `scripts/setup_ai_env.ps1` or dotenv in code
- **Format**: `KEY=value` (one per line)

---

## Connection Decision Tree

```
┌─────────────────────────────────────────────────┐
│ Which database should I use?                    │
└─────────────────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │ What are you doing?           │
        └───────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌───────────────┐              ┌────────────────┐
│ Production    │              │ Development/   │
│ operations?   │              │ Testing?       │
└───────────────┘              └────────────────┘
        │                               │
        ▼                               ▼
USE PROD_DATABASE_URL           ┌────────────────┐
(Render PostgreSQL)             │ Need to test   │
                                │ migrations?    │
                                └────────────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
                ┌───────────────┐           ┌─────────────────┐
                │ YES - Testing │           │ NO - Regular    │
                │ destructive   │           │ development     │
                │ changes       │           └─────────────────┘
                └───────────────┘                     │
                        │                             ▼
                        ▼                   DATABASE_ONPREMISE_DEV_PRIMARY
        DATABASE_ONPREMISE_DEV_EXPERIMENT   (Local mirror, port 55433)
        (Isolated testing, port 55434)
```

---

## Common Operations

### Check Database Connection

**Production:**
```bash
npm run db:cli -- status
```

**Local Development:**
```bash
pg_isready -h 127.0.0.1 -p 55433
```

**Experiment:**
```bash
pg_isready -h 127.0.0.1 -p 55434
```

### Query Database

**Production (via npm):**
```bash
npm run db:cli -- query "SELECT COUNT(*) FROM \"Species\";"
```

**Local (direct psql):**
```bash
psql -h 127.0.0.1 -p 55433 -U postgres -d infinity_gauntlet_db -c 'SELECT COUNT(*) FROM "Species";'
```

### Run Migrations

**Production:**
```bash
# Via Render one-off job (recommended)
npm run render:migrate

# Or via npm (requires PROD_DATABASE_URL set)
npx prisma migrate deploy
```

**Local:**
```bash
# Set target database first
export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db"
npx prisma migrate deploy
```

### Dump Database

**Production to local file:**
```bash
pg_dump "postgresql://infinity_gauntlet_db_user:a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db" -Fc -b --no-owner --no-privileges -f backup.dump
```

**Local to file:**
```bash
pg_dump -h 127.0.0.1 -p 55433 -U postgres -d infinity_gauntlet_db -Fc -b -f local-backup.dump
```

### Restore Database

**To local from dump:**
```bash
pg_restore -h 127.0.0.1 -p 55433 -U postgres -d infinity_gauntlet_db --clean --if-exists --no-owner --no-privileges backup.dump
```

---

## Port Reference

| Database | Port | Host | Purpose |
|----------|------|------|---------|
| **Production** | 5432 | dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com | Live production data |
| **On-Premise Dev Primary** | 55433 | 127.0.0.1 | Local development mirror |
| **On-Premise Dev Experiment** | 55434 | 127.0.0.1 | Migration testing (isolated) |

**Port Selection Rationale:**
- `5432` - Standard PostgreSQL port (production)
- `55433` - Custom port to avoid conflicts with system PostgreSQL
- `55434` - Custom port for isolated testing database

---

## Security Considerations

### Production (Render)
- ✅ SSL/TLS enforced
- ✅ Password authentication required
- ✅ Network isolation (Render internal network)
- ✅ Managed backups by Render
- ⚠️ Never commit PROD_DATABASE_URL to version control

### Local (On-Premise)
- ⚠️ No password (development convenience)
- ⚠️ Localhost-only binding (not exposed to network)
- ⚠️ Trust authentication method
- ✅ Suitable for local development only
- ❌ Never use on-premise databases for production

### Credentials Management
- ✅ Store in `secrets/Infinity-Gauntlet.env` (excluded from git)
- ✅ Use environment variable loading scripts
- ✅ Never hardcode database URLs in code
- ✅ Use Prisma client abstractions
- ❌ Never log full connection strings

---

## Troubleshooting

### Connection Refused (Local)

**Symptoms:**
```
psql: error: connection to server at "127.0.0.1", port 55433 failed: Connection refused
```

**Solutions:**
1. Check if database is running: `pg_isready -h 127.0.0.1 -p 55433`
2. Start database if stopped: `pg_ctl -D "Store/onpremise-dev-primary/onpremise-cluster" start -o "-p 55433 -h 127.0.0.1"`
3. Check log file: `type Store\onpremise-dev-primary\onpremise-postgres.log`

### Connection Timeout (Production)

**Symptoms:**
```
Error: connect ETIMEDOUT
```

**Solutions:**
1. Check internet connection
2. Verify PROD_DATABASE_URL is correct
3. Check Render service status: `npm run render:status`
4. Try Render dashboard to verify database is online

### Database Not Found

**Symptoms:**
```
FATAL: database "infinity_gauntlet_db" does not exist
```

**Solutions:**
1. **Production**: Contact Render support (database should exist)
2. **Local**: Run bootstrap script: `npm run ops:bootstrap-onpremise-dev`
3. **Experiment**: Run experiment bootstrap: `npm run ops:bootstrap-onpremise-experiment`

### Authentication Failed (Production)

**Symptoms:**
```
FATAL: password authentication failed for user "infinity_gauntlet_db_user"
```

**Solutions:**
1. Verify PROD_DATABASE_URL has correct password
2. Check `secrets/Infinity-Gauntlet.env` for correct credentials
3. Verify no typos in connection string
4. Contact Render support if password reset needed

### Port Already in Use (Local)

**Symptoms:**
```
FATAL: lock file "postmaster.pid" already exists
HINT: Is another postmaster already running?
```

**Solutions:**
1. Stop existing instance: `pg_ctl -D "Store/onpremise-dev-primary/onpremise-cluster" stop`
2. Check for stale lock file: `Remove-Item "Store/onpremise-dev-primary/onpremise-cluster/postmaster.pid"`
3. Verify no other process using port: `netstat -ano | findstr 55433`

---

## Maintenance Tasks

### Refresh Local Mirror

**From Production:**
```bash
npm run ops:bootstrap-onpremise-dev
```

**Manual refresh:**
1. Dump production: `pg_dump [PROD_URL] -Fc -b --no-owner -f prod.dump`
2. Drop local: `dropdb -h 127.0.0.1 -p 55433 -U postgres --if-exists infinity_gauntlet_db`
3. Create local: `createdb -h 127.0.0.1 -p 55433 -U postgres infinity_gauntlet_db`
4. Restore: `pg_restore -h 127.0.0.1 -p 55433 -U postgres -d infinity_gauntlet_db --clean --if-exists --no-owner prod.dump`

### Database Size Monitoring

**Production:**
```bash
npm run db:cli -- query "SELECT pg_size_pretty(pg_database_size(current_database()));"
```

**Local:**
```bash
psql -h 127.0.0.1 -p 55433 -U postgres -d infinity_gauntlet_db -c "SELECT pg_size_pretty(pg_database_size(current_database()));"
```

### Vacuum and Analyze

**Production** (via one-off job):
```bash
npm run render:job -- -ServiceId srv-d3snk2ndiees73cn709g -Command "psql \$DATABASE_URL -c 'VACUUM ANALYZE;'"
```

**Local:**
```bash
psql -h 127.0.0.1 -p 55433 -U postgres -d infinity_gauntlet_db -c "VACUUM ANALYZE;"
```

---

## Related Documentation

- **Database Architecture**: `docs/database/database-systems.md` - Comprehensive architecture overview
- **Database URL Selection**: `docs/database/database-url-selection.md` - **CRITICAL** URL selection logic
- **Dual On-Premise Setup**: `docs/database/dual-onpremise-database-guide.md` - Detailed setup guide
- **Database Replication**: `docs/database/db-replication-architecture.md` - Replication strategy
- **SSH Protocol**: `docs/deployment/ssh-protocol.md` - SSH access to Render databases
- **Cross-Worker State**: `docs/architecture/cross-worker-state-visibility.md` - Multi-worker patterns

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│ DATABASE CONNECTIONS QUICK REFERENCE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ PRODUCTION (Render - Virginia)                                 │
│   URL: postgresql://infinity_gauntlet_db_user:***@dpg-...com   │
│   Port: 5432 (standard)                                        │
│   CLI: npm run db:cli -- status                               │
│                                                                 │
│ LOCAL DEV PRIMARY (Workstation Mirror)                         │
│   URL: postgresql://postgres@127.0.0.1:55433/...              │
│   Port: 55433                                                  │
│   Start: pg_ctl -D Store/onpremise-dev-primary/... start      │
│   Bootstrap: npm run ops:bootstrap-onpremise-dev               │
│                                                                 │
│ LOCAL EXPERIMENT (Migration Testing)                           │
│   URL: postgresql://postgres@127.0.0.1:55434/...              │
│   Port: 55434                                                  │
│   Start: npm run ops:start-onpremise-experiment                │
│   Bootstrap: npm run ops:bootstrap-onpremise-experiment        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Changelog

### 2025-11-10
- Initial comprehensive connection reference
- Documented production Render PostgreSQL connection
- Documented on-premise dev primary database (port 55433)
- Documented on-premise experiment database (port 55434)
- Added connection methods, troubleshooting, maintenance tasks
- Added decision tree and quick reference card
