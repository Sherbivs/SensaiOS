# Database Configuration Quick Reference

## 🎯 Production Standard (Render)

```bash
# PRIMARY - Prisma Accelerate pool connection (Render production)
DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY"

# ALIAS - Same as DATABASE_URL (for compatibility)
DATABASE_POOL_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY"

# DIRECT - PostgreSQL connection for migrations/dev
DATABASE_DIRECT_URL="postgresql://user:pass@host:5432/database"

# LOCAL WORKSTATION - PRIMARY database for live gameplay
# Auto-populated from Store/db/local-url.txt or set manually
DATABASE_LOCAL_URL="postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db"

# OPTIONAL - Prisma Optimize monitoring
OPTIMIZE_API_KEY="your_optimize_key"
```

## 🎮 **Workstation Gameplay Priority**

When `DATABASE_LOCAL_URL` is configured, the LOCAL database becomes the **PRIMARY database for live gameplay**:

- **Live Battles**: Use `localPrisma` for <50ms latency
- **Encounters**: Local workstation handles all encounter logic
- **Trainer Operations**: CRUD operations on local PostgreSQL cluster
- **Data Sync**: Automatic replication from PROD/DEV → LOCAL
- **Failover**: Graceful degradation to PROD if LOCAL unavailable

## 📋 Variable Summary

| Variable | Purpose | Format | Required |
|----------|---------|--------|----------|
| `DATABASE_URL` | **Main connection** (Prisma Client for Render) | `prisma+postgres://...` | ✅ |
| `DATABASE_POOL_URL` | Alias for DATABASE_URL | `prisma+postgres://...` | ✅ |
| `DATABASE_DIRECT_URL` | Direct PostgreSQL (migrations) | `postgresql://...` | ✅ |
| `DATABASE_LOCAL_URL` | **Local workstation (PRIMARY for gameplay)** | `postgresql://...` | ✅ Live |

### Priority Hierarchy

1. **Live Gameplay (Workstation)**: `DATABASE_LOCAL_URL` → `localPrisma` client
2. **Production Operations (Render)**: `DATABASE_URL` → `prisma` client  
3. **Development/Migrations**: `DATABASE_DIRECT_URL` → `devPrisma` client

## 🚀 Render Setup Checklist

### 1. Environment Variables (Render Dashboard)
Set these **manually** in each service's Environment tab:

```
✅ DATABASE_URL = prisma+postgres://accelerate.prisma-data.net/?api_key=...
✅ DATABASE_POOL_URL = (same as above)
✅ OPTIMIZE_API_KEY = eyJhbGci...
✅ BOT_TOKEN = your_bot_token
✅ POKEMON_BOT_TOKEN = your_bot_token
```

### 2. render.yaml Configuration
Already configured with `sync: false` for security:

```yaml
envVars:
  - key: DATABASE_URL
    sync: false  # ✅ Prevents credential exposure
  - key: DATABASE_POOL_URL
    sync: false  # ✅ Prevents credential exposure
  - key: DATABASE_DIRECT_URL
    fromDatabase:
      name: infinity-gauntlet-db
      property: connectionString  # ✅ Auto-populated by Render
```

## 💻 Local Development

### Workstation Gameplay Setup (Recommended)

```powershell
# 1. Create secure environment file
$Env:IG_ENV_FILE = "C:/Users/yourname/Documents/Key/Dev/.env"

# 2. Add credentials to file (WITH local workstation URL)
@"
# Production connections (read-only for replication)
DATABASE_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY
DATABASE_POOL_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY
DATABASE_DIRECT_URL=postgresql://user:pass@render-host:5432/infinity_gauntlet_db

# LOCAL WORKSTATION (PRIMARY for live gameplay)
DATABASE_LOCAL_URL=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db

OPTIMIZE_API_KEY=your_key
BOT_TOKEN=your_token
"@ | Out-File -FilePath $Env:IG_ENV_FILE

# 3. Bootstrap local database (creates cluster + replicates from PROD)
npm run ops:auto-bootstrap-local-db

# 4. Verify local cluster is ready
npm run db:health

# Expected output:
# LOCAL → Status: healthy | Latency: <50ms | Source: local
```

## 🔍 Health Check

```bash
# Check database connection status
npm run db:health

# Expected output (workstation with local gameplay):
# DEV   → Status: healthy   | Latency: ~100-500ms  | Source: direct  | (migrations/replication source)
# PROD  → Status: healthy   | Latency: ~50-200ms   | Source: pool    | (Render production)
# LOCAL → Status: healthy   | Latency: <50ms       | Source: local   | (PRIMARY for gameplay) ⭐

# If LOCAL is offline (not configured):
# LOCAL → Status: offline   | Latency: n/a         | Source: unknown | (optional - not required for Render-only)
```

## 🎮 **Using Local Database for Gameplay**

```typescript
// In your bot code, use localPrisma for live gameplay operations
import { localPrisma, prisma } from '../shared/prisma.js';

// Battle operations - use local workstation for <50ms latency
if (localPrisma) {
  const trainer = await localPrisma.user.findUnique({
    where: { discordId: interaction.user.id }
  });
  // Local database serves live gameplay
} else {
  // Fallback to PROD if local unavailable
  const trainer = await prisma.user.findUnique({
    where: { discordId: interaction.user.id }
  });
}
```

## ⚠️ Common Issues

### Issue: DEV showing "degraded" (2000ms+ latency)
**Cause**: Render free tier database sleeps after inactivity  
**Solution**: Normal behavior; database wakes up after first query

### Issue: Cannot find module '@prisma/client'
**Solution**: 
```bash
npx prisma generate
```

### Issue: Migration fails with "permission denied"
**Solution**: Ensure using `DATABASE_DIRECT_URL` (not Accelerate URL)
```bash
export DATABASE_URL=$DATABASE_DIRECT_URL
npx prisma migrate deploy
```

## 📚 Full Documentation

See [database-configuration.md](./database-configuration.md) for complete details on:
- Triple-client architecture (prod/dev/local)
- Connection priority cascade
- Migration strategies
- Security best practices
- Troubleshooting guide

## 🔐 Security Reminders

1. ✅ **Never commit** `DATABASE_URL` or API keys to repository
2. ✅ Use `IG_ENV_FILE` pointing **outside repository**
3. ✅ Keep `.env` in `.gitignore` (already configured)
4. ✅ Use `sync: false` in `render.yaml` for sensitive vars
5. ✅ Rotate Prisma Accelerate keys regularly

## 📦 Files Updated

- ✅ `render.yaml` - Standardized all services to production standard
- ✅ `.env.example` - Updated with Prisma Accelerate format
- ✅ `docs/database-configuration.md` - Complete documentation
- ✅ `secrets/Infinity-Gauntlet.env` - Production credentials (not in repo)

**Last Updated**: 2025-11-06  
**Status**: ✅ Standardized across all environments
