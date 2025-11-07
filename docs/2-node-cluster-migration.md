# 2-Node Database Cluster Migration

**Date**: November 7, 2025  
**Status**: ✅ COMPLETE (Core Infrastructure)

## Overview

Migrated Infinity Gauntlet from Prisma Accelerate-based architecture to a simplified 2-node PostgreSQL cluster due to Prisma Accelerate account hold (error P6003: planLimitReached).

## Architecture

### Previous (Accelerate-Based)
- **PROD**: Prisma Accelerate proxy (`DATABASE_URL`)
- **DEV**: Render PostgreSQL direct (`RENDER_DB_EXTERNAL_URL` / `RENDER_DB_INTERNAL_URL`)
- **LOCAL**: Workstation PostgreSQL (`DATABASE_LOCAL_URL`)

### Current (2-Node Cluster)
- **DEV (Master)**: Render PostgreSQL - Source of truth (`DEV_DATABASE_URL`)
- **PROD (Local)**: Render Node persistent disk - Production runtime (`PROD_DATABASE_URL`)
- **Replication**: DEV → PROD via `scripts/dev_prod_auto_sync.ts`

## Environment Variables

### New Schema
```bash
# Master database (source of truth) - Render PostgreSQL
DEV_DATABASE_URL=postgresql://infinity_gauntlet_db_user:...@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db

# Production database (replicated) - Render Node persistent disk
PROD_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
```

### Legacy References (Backwards Compatibility)
```bash
RENDER_DB_EXTERNAL_URL  # External access to DEV (same as DEV_DATABASE_URL)
RENDER_DB_INTERNAL_URL  # Render internal network access to DEV
DATABASE_LOCAL_URL      # Workstation-only local PostgreSQL
```

### Removed
- `DATABASE_URL` (Prisma Accelerate - account on hold)
- `DATABASE_POOL_URL` (Accelerate pool)
- `DATABASE_ACCELERATE_URL` (Accelerate proxy)

## Core File Changes

### 1. Prisma Schema (`prisma/schema.prisma`)
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("PROD_DATABASE_URL")      # Production queries use local DB
  directUrl = env("DEV_DATABASE_URL")        # Migrations run against master
}
```

### 2. Database Configuration (`src/shared/config.ts`)
- Removed Accelerate candidate logic
- Prioritize `PROD_DATABASE_URL` in production mode
- Prioritize `DEV_DATABASE_URL` in development/external mode
- Maintain backwards compatibility with `RENDER_DB_*` variables

### 3. Prisma Client Factory (`src/shared/prisma.ts`)
- **DEV client**: Uses `DEV_DATABASE_URL` (master database)
- **LOCAL client**: Uses `PROD_DATABASE_URL` (production database)
- Updated connection logs to reflect MASTER/PROD roles

### 4. Render Deployment (`render.yaml`)
**All Services Updated:**
- `infinity-gauntlet-bot` (web)
- `infinity-gauntlet-outbox` (worker)
- `infinity-gauntlet-bots` (worker)
- `infinity-gauntlet-cache` (worker)
- `infinity-gauntlet-data-pipeline` (worker)
- `pokedex-cache-worker` (worker)
- `pokedex-cache-failsafe` (cron)

**Environment Variables Per Service:**
```yaml
envVars:
  - key: PROD_DATABASE_URL
    value: postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
  - key: DEV_DATABASE_URL
    fromDatabase:
      name: infinity-gauntlet-db
      property: connectionString
```

### 5. Replication Scripts (`scripts/db_replication.ts`)
```typescript
async function getClients() {
  const devUrl = process.env.DEV_DATABASE_URL || 
                 process.env.RENDER_DB_EXTERNAL_URL || 
                 process.env.RENDER_DB_INTERNAL_URL;
  const prodUrl = process.env.PROD_DATABASE_URL || 
                  process.env.DATABASE_LOCAL_URL;
  // ...
}
```

## Data Flow

### Migration Workflow
1. **Run Migrations**: Execute against DEV (master)
   ```bash
   DEV_DATABASE_URL=postgresql://... npx prisma migrate deploy
   ```

2. **Auto-Sync Replication**: DEV → PROD
   ```bash
   # Handled automatically by scripts/dev_prod_auto_sync.ts
   ```

3. **Production Queries**: Use PROD (local, low-latency)
   ```typescript
   import { prisma } from "./shared/prisma.js";
   const users = await prisma.user.findMany(); // Uses PROD_DATABASE_URL
   ```

### Development Workflow
1. **Development Queries**: Use DEV (master)
   ```typescript
   import { devPrisma } from "./shared/prisma.js";
   const users = await devPrisma.user.findMany(); // Uses DEV_DATABASE_URL
   ```

2. **Local Testing**: Use DATABASE_LOCAL_URL (laptop)
   ```typescript
   import { localPrisma } from "./shared/prisma.js";
   const users = await localPrisma.user.findMany(); // Uses DATABASE_LOCAL_URL
   ```

## Testing Results

### ✅ Compilation
```bash
npm run prebuild
# ✅ No TypeScript errors
```

### ✅ Migrations
```bash
npx prisma migrate status
# ✅ Database schema is up to date (8 migrations found)
```

### ✅ Database Connection
```bash
npm run db:cli -- status
# ✅ Active host: dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com
# ✅ Engine: Direct/Postgres
# ✅ Species records: 1025
# ✅ User records: 2
```

## Future Expansion

### Placeholder Pattern
Environment file includes comments for future nodes:
```bash
# --- FUTURE EXPANSION PLACEHOLDERS ---
# REPLICA_1_DATABASE_URL=postgresql://...  (read replica)
# WORKER_DATABASE_URL=postgresql://...     (dedicated worker node)
# ANALYTICS_DATABASE_URL=postgresql://...  (analytics/reporting node)
```

### Extension Points
1. **Config System** (`src/shared/config.ts`): Add new URL sources to candidate list
2. **Prisma Factory** (`src/shared/prisma.ts`): Add client initialization functions (e.g., `initializeReplicaClient()`)
3. **Replication Scripts** (`scripts/dev_prod_auto_sync.ts`): Extend sync logic for n-node clusters
4. **Render Config** (`render.yaml`): Add environment variables for new nodes

## Commits

1. **69211ec** - `refactor: Migrate to 2-node database cluster (DEV master + PROD local)`
   - Updated `prisma/schema.prisma`, `src/shared/config.ts`, `src/shared/prisma.ts`, `render.yaml`
   - Removed Accelerate dependency
   - Added 2-node cluster architecture

2. **61bd37f** - `refactor(scripts): Update db_replication for 2-node cluster`
   - Updated `scripts/db_replication.ts` to use `DEV_DATABASE_URL` and `PROD_DATABASE_URL`

## Pending Work

### Documentation Updates (Low Priority)
- [ ] `docs/database-systems.md` - Update triple-client architecture section
- [ ] `OPERATIONS.md` - Update deployment procedures
- [ ] `ops/DB_BOOTSTRAP.md` - Update bootstrap instructions
- [ ] `AGENTS.md` - Update database URL selection guide

### Testing (Medium Priority)
- [ ] Test auto-sync replication (DEV → PROD)
- [ ] Test production deployment on Render
- [ ] Verify all worker services connect successfully
- [ ] Monitor connection latency post-deployment

### Cleanup (Low Priority)
- [ ] Remove unused Accelerate-related code
- [ ] Update error messages referencing old variable names
- [ ] Archive Prisma Accelerate credentials

## Rollback Plan

If issues arise, restore previous architecture by:

1. **Revert Commits**:
   ```bash
   git revert 61bd37f 69211ec
   ```

2. **Restore Environment File**:
   ```bash
   cp secrets/Infinity-Gauntlet.env.backup secrets/Infinity-Gauntlet.env
   ```

3. **Update Render Dashboard**:
   - Re-add `DATABASE_URL` with Accelerate connection string
   - Remove `PROD_DATABASE_URL` and `DEV_DATABASE_URL`

4. **Redeploy Services**

## Notes

- **Prisma Accelerate**: Account on hold (P6003: planLimitReached). Contact Prisma support to resolve or cancel subscription.
- **Local PostgreSQL**: Requires Render persistent disk mounted at `/Store/db/` with PostgreSQL running on port 55433.
- **Backwards Compatibility**: Legacy `RENDER_DB_*` variables still work as fallbacks.
