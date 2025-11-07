# 2-Node Cluster Deployment Checklist

**Date**: November 7, 2025  
**Status**: ✅ Code Complete | 🚀 Ready for Render Deployment

## Pre-Deployment Verification

### ✅ Code Changes (COMPLETE)
- [x] Updated `prisma/schema.prisma` (url=PROD_DATABASE_URL, directUrl=DEV_DATABASE_URL)
- [x] Updated `src/shared/config.ts` (removed Accelerate, added PROD/DEV priority)
- [x] Updated `src/shared/prisma.ts` (DEV client = master, LOCAL client = prod)
- [x] Updated `render.yaml` (all 7 services use PROD_DATABASE_URL + DEV_DATABASE_URL)
- [x] Updated `scripts/db_replication.ts` (getClients uses new schema)
- [x] Created migration documentation (`docs/2-node-cluster-migration.md`)
- [x] TypeScript compilation successful (no errors)
- [x] Migrations validated (8 migrations, schema up to date)
- [x] Database connection tested (1025 Species, 2 Users)

### ✅ Render Environment Variables Updated
Based on your confirmation, the following variables should now be set in Render dashboard:

**All Services** (`infinity-gauntlet-bot`, `infinity-gauntlet-outbox`, `infinity-gauntlet-bots`, `infinity-gauntlet-cache`, `infinity-gauntlet-data-pipeline`):
- `PROD_DATABASE_URL` = `postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db`
- `DEV_DATABASE_URL` = [from database connection string: `infinity-gauntlet-db`]

**Pokédex Services** (`pokedex-cache-worker`, `pokedex-cache-failsafe`):
- `DEV_DATABASE_URL` = [from database connection string: `infinity-gauntlet-db`]

## Deployment Steps

### 1. Pre-Deployment Validation
```bash
# Verify local PostgreSQL setup on Render (if applicable)
# SSH into Render Node and check:
ls -la /Store/db/
pg_isready -h 127.0.0.1 -p 55433
```

### 2. Deploy Services
The deployment will happen automatically via `render.yaml` when you push to main.

**Expected Behavior**:
- Services will rebuild with new environment variables
- Prisma clients will initialize with PROD_DATABASE_URL and DEV_DATABASE_URL
- Auto-sync will replicate DEV → PROD on startup

### 3. Post-Deployment Monitoring

**Check Service Logs** (First 5 minutes):
```
# Look for successful database connections:
✅ "DEV Prisma client connected (MASTER)"
✅ "PROD Prisma client connected (LOCAL)"

# Monitor for errors:
❌ Connection failures
❌ Missing environment variables
❌ Replication errors
```

**Verify Database Connections**:
```bash
# From Render shell or logs, check:
# 1. DEV connection (master database)
# 2. PROD connection (local database on persistent disk)
# 3. Auto-sync status
```

**Test Functionality**:
- [ ] Discord bot responds to commands
- [ ] Pokemon encounters work
- [ ] Battle system functional
- [ ] Database queries return correct data

## Rollback Plan (If Issues Occur)

### Option 1: Revert Environment Variables
1. Go to Render dashboard
2. Restore previous environment variables:
   - `DATABASE_URL` = Prisma Accelerate connection string
   - `RENDER_DB_INTERNAL_URL` = [from database]
3. Restart all services

### Option 2: Revert Code Changes
```bash
# Revert the 3 migration commits
git revert 47a2c78 61bd37f 69211ec
git push origin main
```

### Option 3: Emergency Fix
If Render deployment fails but local works:
1. Temporarily set `PROD_DATABASE_URL` to use DEV database URL
2. This makes both PROD and DEV point to master (safe fallback)
3. Debug local PostgreSQL setup on Render Node

## Post-Deployment Verification

### Database Health Check
```bash
# Run from Render shell or via worker script
npm run db:cli -- status

# Expected output:
# ✅ Active host: dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com (or 127.0.0.1)
# ✅ Engine: Direct/Postgres
# ✅ Species records: 1025
# ✅ User records: 2+
```

### Replication Status
```bash
# Check auto-sync logs
# Should show:
# ✅ DEV → PROD sync completed
# ✅ No version divergence
# ✅ Integrity checks passed
```

### Performance Metrics
- [ ] Query latency acceptable (<100ms for PROD, <200ms for DEV)
- [ ] No connection pool exhaustion
- [ ] Memory usage within limits

## Known Considerations

### Local PostgreSQL on Render
**PROD_DATABASE_URL** points to `127.0.0.1:55433` which requires:
1. PostgreSQL installed on Render Node
2. Persistent disk mounted at `/Store/db/`
3. PostgreSQL service running on port 55433

**If not yet set up**:
- Services will fall back to legacy variables (RENDER_DB_EXTERNAL_URL)
- System will still work but with higher latency (external Render PostgreSQL)
- Local setup can be added later without code changes

### Prisma Accelerate
- Removed from architecture due to account hold (P6003: planLimitReached)
- All connections now use direct PostgreSQL
- No query caching layer (acceptable tradeoff for reliability)

### Auto-Sync Behavior
- Runs on startup and every 5 minutes (configurable)
- DEV (master) is always source of truth
- PROD updates via replication only (never direct writes)

## Success Criteria

Deployment is successful when:
- ✅ All services start without errors
- ✅ Database connections established (DEV + PROD)
- ✅ Discord bot responds to commands
- ✅ Auto-sync completes at least once
- ✅ No critical errors in logs for 30 minutes

## Next Steps After Successful Deployment

1. **Monitor for 24 hours**: Watch for edge cases, connection issues, sync failures
2. **Update remaining docs**: `docs/database-systems.md`, `OPERATIONS.md`, `AGENTS.md`
3. **Archive Accelerate**: Document Accelerate account status, cancel subscription if needed
4. **Optimize local PostgreSQL**: Tune configuration for Render Node if using local DB

---

**Current Status**: Ready to deploy. Render environment variables confirmed updated.
