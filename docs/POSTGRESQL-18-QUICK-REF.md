# PostgreSQL 18 Upgrade - Quick Reference

**Date:** 2025-11-28  
**Full Plan:** `docs/POSTGRESQL-18-UPGRADE-PLAN.md`

---

## Pre-Flight Checklist

```powershell
# 1. Backup everything
npm run ops:dex-v2-backup -- --env-file secrets/Infinity-Gauntlet.env --label prod-pre-pg18 --output-dir backups/migration-checkpoints --pg-dump-path tools/pgsql17/pgsql/bin/pg_dump.exe

# 2. Verify current version
npm run db:cli -- query "SELECT version();"

# 3. Stop local databases
npm run ops:stop-onpremise-primary
npm run ops:stop-onpremise-experiment
```

---

## Phase 1: Download PostgreSQL 18 (15 min)

```powershell
# Install PostgreSQL 18
winget install --id PostgreSQL.PostgreSQL --version 18.0

# Rename old tooling
mv tools/pgsql17 tools/pgsql17-backup

# Verify installation
"C:/Program Files/PostgreSQL/18/bin/postgres.exe" --version
# Expected: postgres (PostgreSQL) 18.0
```

---

## Phase 2: Upgrade Local Databases (30 min)

```powershell
# Fresh bootstrap ONPREMISE-DEV-PRIMARY
rm -r -force Store/onpremise-dev-primary
npm run ops:bootstrap-onpremise-dev

# Fresh bootstrap ONPREMISE-DEV-EXPERIMENT
rm -r -force Store/onpremise-dev-primary-experiment
npm run ops:bootstrap-onpremise-experiment

# Verify versions
npm run ops:start-onpremise-primary
psql "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db" -c "SELECT version();"

npm run ops:start-onpremise-experiment
psql "postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment" -c "SELECT version();"

# Verify data integrity
npm run db:cli -- count User --target primary
npm run db:cli -- count Species --target primary
```

---

## Phase 3: Upgrade Render Database (10 min + downtime)

**⚠️ PRODUCTION DOWNTIME: 5-10 minutes**

### Render Dashboard Steps:

1. Open: https://dashboard.render.com/d/infinity-gauntlet-db
2. Navigate: Databases → infinity-gauntlet-db → Settings
3. Find: "Database Version" section
4. Select: PostgreSQL 18
5. Click: "Upgrade Database Version"
6. Confirm: Upgrade
7. Wait: 5-10 minutes
8. Verify: Status shows "Available"

### Post-Upgrade Verification:

```powershell
# Check version
npm run db:cli -- query "SELECT version();"

# Verify data
npm run db:cli -- counts

# Restart services
npm run render:restart -- --service infinity-gauntlet
npm run render:restart -- --service infinity-gauntlet-outbox
npm run render:restart -- --service infinity-gauntlet-cache
npm run render:restart -- --service infinity-gauntlet-data-pipeline

# Check status
npm run render:status
```

---

## Phase 4: Update Code & Docs (15 min)

### Update Scripts:

```powershell
# scripts/bootstrap_onpremise_dev.ps1
# Line ~25: $defaultPgBin = "C:/Program Files/PostgreSQL/18/bin"

# scripts/ops_auto_bootstrap_onpremise_dev.ps1
# Line ~45: winget install --id PostgreSQL.PostgreSQL --version 18.0 --silent
```

### Update Documentation:

```powershell
# Update these files:
# - docs/operations-bible/02-database-operations.md (PostgreSQL 17 → 18)
# - docs/development-bible/01-local-setup.md (version requirements)
# - README.md (dependencies section)
# - tools/ROUTER.md (pgsql17 → pgsql18)

# Regenerate routers
npm run docs:update-routers
```

### Commit:

```powershell
git add -A
git commit -m "[INFRASTRUCTURE] Upgrade PostgreSQL 17 → 18"
git push origin main
```

---

## Rollback (If Needed)

### Render Database:

1. Open: https://dashboard.render.com/d/infinity-gauntlet-db
2. Navigate: Backups tab
3. Select: Backup from before upgrade
4. Click: "Restore"

### Local Databases:

```powershell
pg_restore --format=custom --dbname="postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db" backups/migration-checkpoints/onpremise-primary-pre-pg18-*.dump
```

---

## Post-Upgrade Monitoring

```powershell
# Query performance
npm run db:cli -- query "SELECT * FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;"

# Connection count
npm run db:cli -- query "SELECT count(*) FROM pg_stat_activity;"

# Database size
npm run db:cli -- query "SELECT pg_size_pretty(pg_database_size(current_database()));"

# Error monitoring
npm run render:logs -- --service infinity-gauntlet --tail
```

---

## Success Criteria

- ✅ Render DB shows PostgreSQL 18.0
- ✅ Local DBs show PostgreSQL 18.0
- ✅ All migrations applied
- ✅ Data counts match
- ✅ Services healthy
- ✅ No error increase
- ✅ Docs updated

---

**Total Time:** ~70 minutes  
**Downtime:** 5-10 minutes  
**Risk:** LOW (backward compatible)
