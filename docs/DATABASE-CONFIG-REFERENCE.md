# Database Configuration Quick Reference

## 🎯 Production Standard (Render)

```bash
# PRIMARY - Prisma Accelerate pool connection
DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY"

# ALIAS - Same as DATABASE_URL (for compatibility)
DATABASE_POOL_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY"

# DIRECT - PostgreSQL connection for migrations/dev
DATABASE_DIRECT_URL="postgresql://user:pass@host:5432/database"

# OPTIONAL - Prisma Optimize monitoring
OPTIMIZE_API_KEY="your_optimize_key"
```

## 📋 Variable Summary

| Variable | Purpose | Format | Required |
|----------|---------|--------|----------|
| `DATABASE_URL` | **Main connection** (Prisma Client) | `prisma+postgres://...` | ✅ |
| `DATABASE_POOL_URL` | Alias for DATABASE_URL | `prisma+postgres://...` | ✅ |
| `DATABASE_DIRECT_URL` | Direct PostgreSQL (migrations) | `postgresql://...` | ✅ |
| `DATABASE_LOCAL_URL` | Local mirror (optional failover) | `postgresql://...` | ❌ |

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

### Quick Setup

```powershell
# 1. Create secure environment file
$Env:IG_ENV_FILE = "C:/Users/yourname/Documents/Key/Dev/.env"

# 2. Add credentials to file
@"
DATABASE_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY
DATABASE_POOL_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_KEY
DATABASE_DIRECT_URL=postgresql://user:pass@render-host:5432/infinity_gauntlet_db
OPTIMIZE_API_KEY=your_key
BOT_TOKEN=your_token
"@ | Out-File -FilePath $Env:IG_ENV_FILE

# 3. Generate Prisma Client
npx prisma generate

# 4. Run migrations
npx prisma migrate dev
```

## 🔍 Health Check

```bash
# Check database connection status
npm run db:health

# Expected output:
# DEV   → Status: healthy   | Latency: ~100-500ms  | Source: direct
# PROD  → Status: healthy   | Latency: ~50-200ms   | Source: pool
# LOCAL → Status: offline   | Latency: n/a         | Source: unknown (normal)
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
