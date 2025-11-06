# Database Replication Operational Runbook

**Owner:** Database Systems  
**Last Updated:** 2025-11-06  
**Status:** Active

---

## Table of Contents

1. [Overview](#overview)
2. [Daily Operations](#daily-operations)
3. [Manual Sync Procedures](#manual-sync-procedures)
4. [Emergency Rollback](#emergency-rollback)
5. [Version Conflict Resolution](#version-conflict-resolution)
6. [Monitoring & Alerts](#monitoring--alerts)
7. [Troubleshooting](#troubleshooting)
8. [CLI Reference](#cli-reference)

---

## Overview

### Architecture

```
DEV (master) → Prisma Accelerate (prod) → Local (workstation)
```

- **DEV** is the single source of truth for all schema changes
- **Prod** (Prisma Accelerate) is the production replica, synced every 6 hours
- **Local** (workstation mirror) is the offline fallback, synced daily at 2 AM

### Key Principles

1. **Version Control** — SHA-256 fingerprints ensure tamper-proof version tracking
2. **Integrity First** — Schema and data integrity verified before every sync completion
3. **No Silent Errors** — All failures logged and alerted
4. **Rollback Safety** — Reversion detection blocks downstream sync automatically
5. **Manual Override** — Emergency controls available for operator intervention

---

## Daily Operations

### Routine Health Check (5 minutes)

```bash
# 1. Check replication status
npm run db:replication status

# Expected output:
#   DEV:   X migrations
#   PROD:  Y migrations (lag: Z)
#   LOCAL: A migrations (lag: B)

# 2. Review metrics and alerts
npm run db:replication metrics

# Expected: No CRITICAL/ERROR alerts, lag <5 migrations

# 3. Verify integrity (if lag detected)
npm run db:replication integrity all

# Expected: Schema PASS, Data PASS
```

### Action Thresholds

| Condition | Action |
|-----------|--------|
| Lag <5 migrations | ✅ Normal - no action |
| Lag 5-10 migrations | ⚠️ Monitor - check next sync |
| Lag >10 migrations | ❌ Investigate - manual sync may be needed |
| Schema integrity FAIL | 🚨 Alert ops - block syncs until resolved |
| Reversion detected | 🚨 Alert ops - DEV rolled back, investigate |

---

## Manual Sync Procedures

### DEV → Prod Sync

**When:** After significant DEV schema changes, before production deploys

```bash
# 1. Dry run to verify safety
npm run db:replication sync dev-to-prod --dry-run

# 2. Review output for warnings
# Look for:
#   - Version comparison: AHEAD (safe) or MATCH (no-op)
#   - Schema integrity: warnings acceptable, failures block
#   - Migration count: verify expected delta

# 3. Execute sync
npm run db:replication sync dev-to-prod

# 4. Verify completion
npm run db:replication compare
# Expected: DEV and Prod fingerprints match

# 5. Check for alerts
npm run db:replication metrics
```

### Prod → Local Sync

**When:** After Prod updates, before offline work

```bash
# 1. Verify Prod is stable
npm run db:replication version prod

# 2. Backup current Local (optional)
# Save current Store/db/ snapshot

# 3. Execute sync
npm run db:replication sync prod-to-local

# 4. Verify Local mirror
npm run db:replication diff prod local
# Expected: No schema differences
```

### Full Cascade Sync

**When:** Major migration batches, weekly maintenance windows

```bash
# 1. Check current state
npm run db:replication status

# 2. Dry run full cascade
npm run db:replication sync full-cascade --dry-run

# 3. Execute cascade
npm run db:replication sync full-cascade

# 4. Verify all environments match
npm run db:replication compare
# Expected: All fingerprints identical
```

---

## Emergency Rollback

### Scenario: Production Deploy Failed, Need to Rollback DEV

**Timeline:** 15-30 minutes

```bash
# STEP 1: Identify Target Version (2 min)
# Find last known good migration timestamp
cd prisma/migrations
ls -lt | head -n 20
# Identify target migration (e.g., 20251106120000_stable_release)

# STEP 2: Block Downstream Syncs (1 min)
npm run db:replication block-prod
# This prevents Prod from syncing broken DEV state

# STEP 3: Rollback DEV Migrations (5 min)
# Option A: Undo last migration
npx prisma migrate resolve --rolled-back <migration_name>

# Option B: Reset to specific migration
# WARNING: Data loss possible
npx prisma migrate reset
# Then re-apply migrations up to target

# STEP 4: Verify DEV Schema (3 min)
npm run db:replication version dev
npm run db:replication integrity dev-prod
# Expected: Schema differences detected (DEV now behind Prod)

# STEP 5: Restore DEV from Prod (10 min)
# If DEV rollback was mistake, restore from Prod
npm run db:cli -- query "SELECT version();"
# Verify connectivity

# Manual pg_dump from Prod, pg_restore to DEV
# (Automated command coming in future release)

# STEP 6: Unblock Syncs (1 min)
npm run db:replication unblock-prod

# STEP 7: Verify Recovery (3 min)
npm run db:replication compare
npm run db:replication metrics
# Expected: No CRITICAL alerts, fingerprints match

# STEP 8: Alert Team
# Post recovery summary to #ops-alerts channel
```

---

## Version Conflict Resolution

### Scenario: DEV and Prod Diverged (Different Migration Histories)

**Timeline:** 30-60 minutes

```bash
# STEP 1: Capture State (5 min)
npm run db:replication compare > divergence-report.txt
npm run db:replication diff dev prod >> divergence-report.txt

# Review divergence-report.txt for:
#   - When did divergence occur?
#   - Which migrations differ?
#   - Are there conflicting schema changes?

# STEP 2: Decide Resolution Strategy

# Option A: Prod is Correct (Reset DEV from Prod)
# Use when: Production deployment succeeded, DEV has experimental changes

# Option B: DEV is Correct (Force Sync DEV to Prod)
# Use when: DEV has critical fixes, Prod is stale
# WARNING: DANGEROUS - only use with approval

# Option C: Manual Merge
# Use when: Both have valid changes requiring reconciliation

# STEP 3: Execute Resolution (Option A Example)

# Block syncs
npm run db:replication block-prod

# Backup DEV (save migration files)
cd prisma/migrations
tar -czf dev-migrations-backup-$(date +%Y%m%d%H%M%S).tar.gz .

# Reset DEV from Prod
npm run db:replication reset-dev-from-prod --confirm
# (Command stub - manual steps below until implemented)

# Manual steps:
# 1. Export Prod schema: pg_dump --schema-only
# 2. Drop DEV database
# 3. Restore Prod schema to DEV
# 4. Run: npx prisma db pull (generate Prisma schema from DB)
# 5. Run: npx prisma migrate dev --name restore_from_prod

# STEP 4: Verify Convergence (5 min)
npm run db:replication compare
# Expected: DEV and Prod fingerprints identical

# STEP 5: Unblock and Monitor (5 min)
npm run db:replication unblock-prod
npm run db:replication metrics
```

---

## Monitoring & Alerts

### Alert Levels

| Severity | Meaning | Response Time | Action |
|----------|---------|---------------|--------|
| **INFO** | Informational | N/A | No action |
| **WARNING** | Lag detected, sync slow | <1 hour | Monitor next sync |
| **ERROR** | Sync failure, integrity fail | <30 min | Investigate and resolve |
| **CRITICAL** | Divergence, reversion | <15 min | Emergency response |

### Automated Sync Schedule

```yaml
dev_to_prod:
  schedule: "0 */6 * * *"  # Every 6 hours
  timeout: 600s            # 10 minutes
  retry: 2                 # Retry twice on failure
  alert_on_failure: true

prod_to_local:
  schedule: "0 2 * * *"    # Daily at 2 AM
  timeout: 1200s           # 20 minutes
  retry: 1
  alert_on_failure: true
```

### Metrics Dashboard

Access via CLI:

```bash
npm run db:replication metrics
```

**Key Metrics:**
- Version lag (migrations behind)
- Sync status (IN_SYNC, LAGGING, BLOCKED, ERROR)
- Last sync time and duration
- Integrity check results
- Active alerts

---

## Troubleshooting

### Problem: Sync Fails with "Version BEHIND" Error

**Cause:** DEV rolled back migrations after Prod already synced

**Solution:**
1. Verify reversion: `npm run db:replication compare`
2. Check alert: Should show "Reversion Detected"
3. Wait for DEV to catch up (new migrations applied)
4. Sync will auto-resume when DEV version >= Prod version
5. If stuck, see [Emergency Rollback](#emergency-rollback)

### Problem: Schema Integrity Check Fails

**Cause:** Manual schema changes bypassed migrations

**Solution:**
1. Identify differences: `npm run db:replication diff dev prod`
2. Review diffs for unauthorized changes
3. Option A: Revert unauthorized changes manually
4. Option B: Create migration to formalize changes
5. Re-run integrity: `npm run db:replication integrity dev-prod`

### Problem: Sync Timeout

**Cause:** Large migration batch or slow network

**Solution:**
1. Check timeout in sync logs
2. Increase timeout via environment variable (future)
3. Split large migrations into smaller batches
4. Retry sync manually: `npm run db:replication sync dev-to-prod`

### Problem: Local Database Not Updating

**Cause:** DATABASE_LOCAL_URL not configured

**Solution:**
1. Verify env: `echo $DATABASE_LOCAL_URL`
2. Check Store/db/local-url.txt exists
3. Run bootstrap: `npm run ops:bootstrap-local-db`
4. Retry sync: `npm run db:replication sync prod-to-local`

---

## CLI Reference

### Commands

```bash
# Sync databases
npm run db:replication sync dev-to-prod
npm run db:replication sync prod-to-local
npm run db:replication sync full-cascade

# Check status
npm run db:replication status        # Quick overview
npm run db:replication metrics       # Full metrics + alerts
npm run db:replication compare       # Version comparison

# Verify integrity
npm run db:replication integrity all
npm run db:replication integrity dev-prod
npm run db:replication integrity prod-local

# Inspect versions
npm run db:replication version dev
npm run db:replication version prod
npm run db:replication version local

# Schema comparison
npm run db:replication diff dev prod
npm run db:replication diff prod local

# Emergency controls
npm run db:replication block-prod    # Block DEV→Prod sync
npm run db:replication unblock-prod  # Unblock DEV→Prod sync
npm run db:replication reset-local   # Rebuild Local from Prod
```

### Options

```bash
--dry-run          # Simulate sync without applying changes
--skip-integrity   # Skip integrity checks (use with caution)
--confirm          # Confirm destructive operations
```

### Environment Variables

```bash
DATABASE_DIRECT_URL      # DEV database (direct PostgreSQL)
DATABASE_POOL_URL        # PROD database (Accelerate)
DATABASE_LOCAL_URL       # LOCAL database (workstation mirror)
IG_ENV_FILE              # External env file path
```

---

## Best Practices

1. **Always dry-run first** — Use `--dry-run` for manual syncs
2. **Monitor alerts daily** — Check `npm run db:replication metrics` every morning
3. **Verify after migrations** — Run `integrity` check after major DEV changes
4. **Document exceptions** — Log manual syncs in #ops-log channel
5. **Test rollback procedures** — Practice emergency workflows quarterly
6. **Keep Local current** — Sync Local weekly for offline work readiness
7. **Review logs** — Check sync logs after automated runs

---

## Escalation

### When to Escalate

- CRITICAL alerts >30 min unresolved
- Divergence with production impact
- Data integrity failures affecting users
- Rollback procedures not resolving issues

### Escalation Path

1. **Tier 1:** On-call ops engineer (check #ops-alerts)
2. **Tier 2:** Database systems lead (DM @DripTVDD)
3. **Tier 3:** Engineering manager (escalate via PagerDuty)

---

## Related Documentation

- [Database Replication Architecture](./db-replication-architecture.md) — Design document
- [Database Bootstrap Runbook](../ops/DB_BOOTSTRAP.md) — Migration workflows
- [Database Control Suite](./db-control-suite.md) — CLI reference
- [Database Systems Overview](./database-systems.md) — Dual client architecture

---

**Document Status:** Living document - update after operational procedures change  
**Feedback:** Submit issues or suggestions to #database-systems channel
