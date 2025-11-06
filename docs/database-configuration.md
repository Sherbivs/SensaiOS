# Database Configuration Standard

## Overview

This document defines the standardized database configuration for the Infinity Gauntlet project across all environments (local development, staging, production/Render).

## Environment Variables

### Production Standard (Render)

Based on the live Render deployment configuration:

```bash
# Main database connection (Prisma Accelerate pool)
DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_API_KEY"

# Pool connection alias (same as DATABASE_URL for clarity)
DATABASE_POOL_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_API_KEY"

# Direct PostgreSQL connection (for migrations, dev work, replication monitoring)
DATABASE_DIRECT_URL="postgresql://user:password@host:port/database"

# Prisma Optimize (optional performance monitoring)
OPTIMIZE_API_KEY="your_optimize_api_key"

# Bot tokens
BOT_TOKEN="your_discord_bot_token"
POKEMON_BOT_TOKEN="your_discord_bot_token"
SECURITY_BOT_TOKEN="your_discord_bot_token"
```

### Variable Definitions

| Variable | Purpose | Source | Required |
|----------|---------|--------|----------|
| `DATABASE_URL` | **Primary connection** - Used by Prisma Client for all queries | Prisma Accelerate pool URL | ✅ Yes |
| `DATABASE_POOL_URL` | Alias for `DATABASE_URL` (legacy compatibility) | Same as DATABASE_URL | ✅ Yes |
| `DATABASE_DIRECT_URL` | Direct PostgreSQL connection bypassing Accelerate | PostgreSQL connection string | ✅ Yes |
| `DATABASE_LOCAL_URL` | Local workstation PostgreSQL mirror (optional failover) | Local PostgreSQL | ❌ No |
| `OPTIMIZE_API_KEY` | Prisma Optimize performance monitoring | Prisma Console | ❌ No |

### Connection Priority

The application uses a **cascading fallback system** defined in `src/shared/config.ts`:

1. **Prisma Accelerate** (preferred for production):
   - `DATABASE_POOL_URL` (highest priority)
   - `DATABASE_URL` (if Accelerate format: `prisma+postgres://...`)

2. **Direct PostgreSQL** (fallback):
   - `DATABASE_DIRECT_URL`
   - `DATABASE_LOCAL_URL` (workstation mirror, last resort)

## Render Configuration

### Blueprint Standard

In `render.yaml`, all services follow this pattern:

```yaml
envVars:
  # Sensitive - set in Render dashboard, not in YAML
  - key: DATABASE_URL
    sync: false
  - key: DATABASE_POOL_URL
    sync: false
  
  # Auto-populated from Render database
  - key: DATABASE_DIRECT_URL
    fromDatabase:
      name: infinity-gauntlet-db
      property: connectionString
  
  # Runtime configuration
  - key: PRISMA_ACCELERATE_RUNTIME
    value: serverless
  - key: NODE_ENV
    value: production
```

### Why `sync: false`?

- `DATABASE_URL` and `DATABASE_POOL_URL` contain **Prisma Accelerate API keys**
- These must be set **manually in Render dashboard** as environment variables
- Marking `sync: false` prevents accidental exposure in repository
- `DATABASE_DIRECT_URL` uses Render's native database property (safe to auto-populate)

### Setting Up on Render

1. **In Render Dashboard** → Service → Environment:
   ```
   DATABASE_URL = prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY
   DATABASE_POOL_URL = prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY
   OPTIMIZE_API_KEY = your_optimize_key
   ```

2. **DATABASE_DIRECT_URL** auto-populates from database resource

3. Deploy service

## Local Development

### Option 1: Direct PostgreSQL (Simple)

```bash
# .env or secure environment file
DATABASE_URL=postgresql://localhost:5432/infinity_gauntlet
DATABASE_POOL_URL=postgresql://localhost:5432/infinity_gauntlet
DATABASE_DIRECT_URL=postgresql://localhost:5432/infinity_gauntlet
```

### Option 2: Prisma Accelerate (Production-like)

```bash
# Use production Accelerate for testing
DATABASE_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY
DATABASE_POOL_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY
DATABASE_DIRECT_URL=postgresql://your-render-db-host:5432/infinity_gauntlet_db
```

### Secure Environment Files

**DO NOT commit credentials to repository!**

Use one of these methods:

1. **IG_ENV_FILE** (recommended):
   ```powershell
   # Store credentials outside repository
   $Env:IG_ENV_FILE = "C:/Users/yourname/Documents/Key/Dev/.env"
   ```

2. **Local .env** (gitignored):
   ```bash
   # Create .env in project root (already in .gitignore)
   echo "DATABASE_URL=..." > .env
   ```

3. **System environment variables**:
   ```powershell
   [Environment]::SetEnvironmentVariable("DATABASE_URL", "...", "User")
   ```

## Triple-Client Architecture

The application maintains **three Prisma clients** for different purposes:

### Production Client (`prisma`)
- **Purpose**: Primary production database access
- **URL**: `DATABASE_URL` (Prisma Accelerate pool)
- **Usage**: All normal application queries
- **Export**: `src/shared/prisma.ts`

### Development Client (`devPrisma`)
- **Purpose**: Direct database access for dev operations
- **URL**: `DATABASE_DIRECT_URL`
- **Usage**: Migrations, replication monitoring, admin tools
- **Export**: `src/shared/prisma.ts`

### Local Mirror Client (`localPrisma`)
- **Purpose**: Workstation PostgreSQL mirror (failover)
- **URL**: `DATABASE_LOCAL_URL` (optional)
- **Usage**: Replication target, local testing, disaster recovery
- **Export**: `src/shared/prisma.ts`

### Health Monitoring

The application monitors all three connections:

```typescript
import { getDatabaseStats } from './shared/prisma.js';

const stats = getDatabaseStats();
console.log(stats);
// {
//   prod: { source: 'pool', transport: 'accelerate-node', latency: 559.92, status: 'healthy' },
//   dev: { source: 'direct', transport: 'direct', latency: 2008.89, status: 'degraded' },
//   local: { source: 'local', transport: 'direct', latency: null, status: 'offline' }
// }
```

## Migration Strategy

### Development
```bash
# Use direct connection for migrations
npx prisma migrate dev
```

### Production (Render)
```bash
# Migrations run automatically during deployment
# See: buildCommand in render.yaml
npm run prebuild  # Includes: prisma generate && prisma migrate deploy
```

### Manual Production Migration
```bash
# Set DATABASE_URL to DIRECT connection temporarily
export DATABASE_URL=$DATABASE_DIRECT_URL
npx prisma migrate deploy
```

## Troubleshooting

### DEV Connection Degraded (High Latency)

**Symptom**: `DATABASE_DIRECT_URL` shows 2000ms+ latency

**Causes**:
1. Render free tier databases sleep after inactivity
2. Network latency to Render data center
3. Connection pool exhaustion

**Solutions**:
```bash
# 1. Check if database is awake
npx prisma db execute --sql "SELECT 1"

# 2. Use Accelerate pool instead (caches query results)
# Already configured in production standard

# 3. Configure connection pooling
DATABASE_DIRECT_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20"
```

### LOCAL Connection Offline

**Symptom**: `local: { status: 'offline' }`

**Expected**: LOCAL mirror is optional; offline is normal if not configured

**To enable**:
1. Install PostgreSQL locally
2. Set `DATABASE_LOCAL_URL`:
   ```bash
   DATABASE_LOCAL_URL=postgresql://localhost:5432/infinity_gauntlet_mirror
   ```
3. Run replication sync:
   ```bash
   npm run db:replicate
   ```

### Prisma Client Not Found

**Symptom**: `Cannot find module '@prisma/client'`

**Solution**:
```bash
# Regenerate Prisma Client
npx prisma generate

# If still failing, reinstall
npm install @prisma/client
npx prisma generate
```

## Security Best Practices

1. **Never commit credentials**:
   - Use `IG_ENV_FILE` pointing outside repository
   - Keep `.env` in `.gitignore`
   - Use `sync: false` in `render.yaml` for sensitive vars

2. **Rotate API keys regularly**:
   - Prisma Accelerate API keys
   - Discord bot tokens
   - Database passwords

3. **Use read-only credentials where possible**:
   - Reporting/analytics services
   - Monitoring dashboards

4. **Audit database access**:
   - Check `getDatabaseStats()` output
   - Monitor Prisma Accelerate usage
   - Review connection logs

## References

- **Configuration Logic**: `src/shared/config.ts`
- **Prisma Client Setup**: `src/shared/prisma.ts`
- **Environment Template**: `.env.example`
- **Production Config**: `secrets/Infinity-Gauntlet.env` (not in repo)
- **Render Blueprint**: `render.yaml`
- **Database Schema**: `prisma/schema.prisma`

## Change History

- **2025-11-06**: Standardized to match live Render configuration
  - `DATABASE_URL` = Prisma Accelerate pool (primary)
  - `DATABASE_POOL_URL` = Same as DATABASE_URL (alias)
  - `DATABASE_DIRECT_URL` = Direct PostgreSQL (migrations/dev)
  - Updated `render.yaml` to use `sync: false` for sensitive vars
  - Updated `.env.example` with production standard
