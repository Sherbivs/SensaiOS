# Homestead System Deployment Checklist

**Document Type:** Operations Bible — AUTHORITATIVE  
**Last Updated:** 2025-12-06  
**Status:** ✅ COMPLETE  
**Scope:** Production deployment procedures, pre-flight validation, post-deployment verification

---

## Executive Summary

This deployment checklist ensures **zero-downtime production deployment** of the homestead security system. It covers:

1. **Pre-Deployment Validation** — Environment, permissions, database readiness
2. **Database Migration** — Schema deployment, verification, rollback procedures
3. **Service Deployment** — Bot restart, worker configuration, cron job setup
4. **Post-Deployment Verification** — Health checks, test homestead creation, integrity validation
5. **Rollback Procedures** — Emergency rollback if deployment fails
6. **Production Cutover** — Final switchover steps and monitoring setup

**Target Audience:** DevOps engineers, deployment operators, release managers

**Deployment Windows:**
- **Estimated Time:** 30-45 minutes (with testing)
- **Recommended Window:** Low-traffic period (2-4 AM UTC)
- **Rollback Time:** <10 minutes (if needed)

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Database Migration](#database-migration)
3. [Service Deployment](#service-deployment)
4. [Post-Deployment Verification](#post-deployment-verification)
5. [Rollback Procedures](#rollback-procedures)
6. [Production Cutover](#production-cutover)

---

## Pre-Deployment Checklist

### Phase 1: Environment Variables (Critical)

**Required Environment Variables:**

```bash
# Security
HOMESTEAD_HMAC_KEY="<32+ character secret>"          # Required for fingerprinting
AUDIT_HMAC_SECRET="<32+ character secret>"           # Required for audit chain

# Database (already configured)
PROD_DATABASE_URL="postgresql://..."                 # Render managed PostgreSQL

# Discord (already configured)
DISCORD_TOKEN="..."                                  # Bot token
GUILD_ID="..."                                       # Target guild ID
```

**Validation Script:**
```bash
# Run environment validation
npm run ops:validate-homestead-env

# Expected output:
# ✅ HOMESTEAD_HMAC_KEY: Present (32+ chars)
# ✅ AUDIT_HMAC_SECRET: Present (32+ chars)
# ✅ PROD_DATABASE_URL: Present and reachable
# ✅ DISCORD_TOKEN: Present
# ✅ GUILD_ID: Present
```

**Action Required:**
- [ ] Generate `HOMESTEAD_HMAC_KEY` via `openssl rand -hex 32`
- [ ] Generate `AUDIT_HMAC_SECRET` via `openssl rand -hex 32`
- [ ] Add both to Render environment variables
- [ ] Verify variables appear in Render dashboard

---

### Phase 2: Bot Permissions (Critical)

**Required Discord Permissions:**

| Permission | Scope | Purpose |
|-----------|-------|---------|
| `MANAGE_CHANNELS` | Guild-level | Create homestead channels |
| `VIEW_CHANNELS` | Guild-level | Verify channel existence |
| `MANAGE_ROLES` | Guild-level | Set channel permissions |
| `SEND_MESSAGES` | Guild-level | Post to homesteads |

**Validation:**
```javascript
// Run via bot console or test script
const guild = await client.guilds.fetch(process.env.GUILD_ID);
const botMember = await guild.members.fetch(client.user.id);
const requiredPerms = [
  'ManageChannels',
  'ViewChannels',
  'ManageRoles',
  'SendMessages'
];

requiredPerms.forEach(perm => {
  const has = botMember.permissions.has(perm);
  console.log(`${has ? '✅' : '❌'} ${perm}: ${has ? 'Present' : 'MISSING'}`);
});
```

**Action Required:**
- [ ] Verify bot has all 4 required permissions
- [ ] If missing, grant permissions via Discord server settings → Roles → Bot Role
- [ ] Re-run validation script to confirm

---

### Phase 3: Database Readiness

**Database Connection Test:**
```bash
# Test production database connection
npm run db:cli -- status

# Expected output:
# ✅ Connected to CLOUD-PROD-MASTER (Render PostgreSQL)
# ✅ Latency: <100ms
# ✅ Tables: 15+ tables present
```

**Action Required:**
- [ ] Confirm database connection successful
- [ ] Verify latency <100ms (acceptable)
- [ ] Check for active transactions (should be none)

---

### Phase 4: Store Directory Setup

**Create Integrity Report Directory:**
```bash
# Create directory for IntegrityReports (if not exists)
mkdir -p Store/homestead-integrity

# Set permissions (read/write for bot process)
chmod 755 Store/homestead-integrity
```

**Validation:**
```bash
# Verify directory exists and is writable
ls -ld Store/homestead-integrity

# Expected output:
# drwxr-xr-x 2 bot bot 4096 Dec 06 12:00 Store/homestead-integrity
```

**Action Required:**
- [ ] Verify directory exists
- [ ] Verify bot process has write permissions
- [ ] Test write access: `touch Store/homestead-integrity/test.json && rm Store/homestead-integrity/test.json`

---

### Phase 5: Build Validation

**Run Full Test Suite:**
```bash
# Run all tests (should pass 100%)
npm run test

# Run build (should succeed with 0 errors)
npm run build

# Expected output:
# ✅ 293 tests passed
# ✅ Build succeeded: dist/ created
```

**Action Required:**
- [ ] All tests pass (no failures)
- [ ] Build succeeds (no TypeScript errors)
- [ ] Linter passes: `npm run lint` (0 warnings)

---

## Database Migration

### Phase 1: Backup Current Database

**Create Backup (Critical):**
```bash
# Create database backup before migration
pg_dump $PROD_DATABASE_URL > backups/pre-homestead-$(date +%Y%m%d-%H%M%S).sql

# Verify backup created
ls -lh backups/pre-homestead-*.sql | tail -1

# Expected output:
# -rw-r--r-- 1 user user 50M Dec 06 12:00 pre-homestead-20251206-120000.sql
```

**Action Required:**
- [ ] Database backup created successfully
- [ ] Backup file size reasonable (>10 MB)
- [ ] Store backup in secure location (S3, external drive)

---

### Phase 2: Apply Migrations

**Run Prisma Migrations:**
```bash
# Apply all pending migrations
npx prisma migrate deploy

# Expected output:
# ✅ Migration 20251206_add_homestead_channels applied
# ✅ Migration 20251206_add_homestead_audit applied
# ✅ All migrations applied successfully
```

**Validation:**
```bash
# Verify new tables exist
npm run db:cli -- query "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'homestead%';"

# Expected output:
# homestead_channels
# homestead_audit_entries
```

**Action Required:**
- [ ] All migrations applied successfully
- [ ] New tables exist in database
- [ ] No migration errors in logs

---

### Phase 3: Verify Schema

**Run Schema Validation:**
```bash
# Verify schema matches Prisma schema.prisma
npx prisma db pull --force

# Compare generated schema to committed schema
diff prisma/schema.prisma prisma/schema.prisma.bak

# Expected output:
# (no differences - schema matches)
```

**Action Required:**
- [ ] Prisma schema matches database schema
- [ ] No unexpected schema drift detected
- [ ] Foreign keys and indexes created correctly

---

## Service Deployment

### Phase 1: Deploy Bot Service

**Deploy via Render Dashboard:**
```
1. Navigate to: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
2. Click "Manual Deploy" → Deploy latest commit
3. Select branch: main
4. Click "Deploy"
5. Wait for deployment to complete (~5 minutes)
```

**Monitor Deployment:**
```bash
# Watch deployment logs via Render dashboard
# Or via CLI (if available):
render logs --service Infinity-Gauntlet --tail

# Expected output:
# ✅ Build succeeded
# ✅ Starting service...
# ✅ Bot logged in as Infinity Gauntlet#1234
# ✅ Service Registry initialized
# ✅ Database connection successful
```

**Action Required:**
- [ ] Deployment completes successfully
- [ ] Bot logs in to Discord
- [ ] No errors in startup logs
- [ ] Service shows "Running" status in Render dashboard

---

### Phase 2: Configure Integrity Worker (Cron Job)

**Create/Update Render Cron Job:**

**Via render.yaml (Recommended):**
```yaml
# render.yaml
- type: cron
  name: homestead-integrity-worker
  runtime: node
  schedule: "0 * * * *"  # Every hour at :00
  buildCommand: npm run build
  startCommand: node dist/workers/homestead-integrity-worker.js
  envVars:
    - key: PROD_DATABASE_URL
      sync: false
    - key: DISCORD_TOKEN
      sync: false
    - key: HOMESTEAD_HMAC_KEY
      sync: false
    - key: AUDIT_HMAC_SECRET
      sync: false
```

**Via Render Dashboard:**
```
1. Navigate to Render Dashboard → Cron Jobs
2. Click "New Cron Job"
3. Name: homestead-integrity-worker
4. Schedule: "0 * * * *" (hourly)
5. Build Command: npm run build
6. Start Command: node dist/workers/homestead-integrity-worker.js
7. Add environment variables (sync from main service)
8. Click "Create Cron Job"
```

**Validation:**
```bash
# Wait for next hourly run (or manually trigger)
# Check Store/ for new IntegrityReport
ls -lh Store/homestead-integrity/*.json | tail -1

# Expected output:
# -rw-r--r-- 1 bot bot 500 Dec 06 13:00 <guild_id>-2025-12-06T13:00:00Z.json
```

**Action Required:**
- [ ] Cron job created successfully
- [ ] First run completes without errors
- [ ] IntegrityReport generated in Store/
- [ ] Report contains expected fields (totalHomesteads, orphans, ghosts, issueRate)

---

### Phase 3: Verify EventBus Integration

**Test Alert System:**
```javascript
// Via bot console or test script
const { eventBus } = require('./src/shared/event-bus');

// Emit test alert
eventBus.emit('homestead.anomaly.mass-creation', {
  userId: 'test-user-id',
  guildId: process.env.GUILD_ID,
  count: 6,
  windowMinutes: 10,
  timestamp: new Date().toISOString()
});

// Check DRIPTVDD DM for alert
// Expected: DM with "⚠️ HOMESTEAD ANOMALY: Mass creation detected"
```

**Action Required:**
- [ ] EventBus emits alerts successfully
- [ ] DRIPTVDD receives DM with alert details
- [ ] Alert includes full context (user, guild, anomaly type)

---

## Post-Deployment Verification

### Phase 1: Health Check

**Run Bot Health Check:**
```bash
# Via Discord (if /ops stats implemented)
/ops stats

# Expected output:
# ✅ Bot Status: Online
# ✅ Database: Connected (CLOUD-PROD-MASTER)
# ✅ Uptime: 5m 23s
# ✅ Memory: 300 MB / 2048 MB (15%)
# ✅ Active Guilds: 1
# ✅ Active Homesteads: 0 (pre-deployment)
```

**Action Required:**
- [ ] Bot responds to commands
- [ ] Database connection confirmed
- [ ] Memory usage normal (<500 MB)
- [ ] No errors in /ops stats output

---

### Phase 2: Test Homestead Creation

**Create Test Homestead:**
```bash
# Via Discord (test user account)
/home

# Expected output:
# ✅ "Creating your personal homestead..."
# ✅ Private channel created: homestead-testuser
# ✅ User receives DM: "Your homestead is ready!"
# ✅ User can access channel
```

**Validation Checklist:**
- [ ] Channel created in "Homesteads" category
- [ ] Channel name matches pattern: `homestead-{username}`
- [ ] User has `ViewChannel`, `SendMessages`, `ReadMessageHistory` permissions
- [ ] Bot has `ManageChannels`, `ManageRoles` permissions in channel
- [ ] @everyone denied `ViewChannel` permission
- [ ] Database record created in `homestead_channels` table
- [ ] `verifiedAt` timestamp present in database
- [ ] `securityFingerprint` present in database (HMAC-SHA256)

**Database Validation:**
```bash
# Check database record
npm run db:cli -- query "SELECT * FROM homestead_channels WHERE userId = '<test_user_id>';"

# Expected fields:
# id, guildId, channelId, userId, status ('active'), createdBy, createdAt, verifiedAt, securityFingerprint, lastHealthCheck
```

**Action Required:**
- [ ] All validation checks pass
- [ ] No errors in bot logs
- [ ] Test user can send messages in homestead
- [ ] Database record matches Discord channel

---

### Phase 3: Test Admin Commands

**Test Integrity Report:**
```bash
# Wait for first hourly integrity run (or manually trigger)
# Then run via Discord (admin account):
/ops homestead:integrity <guild_id>

# Expected output:
# 📊 Homestead Integrity Report
# Guild: <guild_name> (<guild_id>)
# Timestamp: 2025-12-06T13:00:00Z
# 
# Total Homesteads: 1
# Verified: 1 (100%)
# Unverified: 0 (0%)
# Orphans: 0 (0%)
# Ghosts: 0 (0%)
# Issue Rate: 0.0% 🟢
```

**Action Required:**
- [ ] Command responds successfully
- [ ] Report displays correct counts
- [ ] Issue rate calculated correctly (should be 0% for test)
- [ ] No errors in command execution

---

**Test Cleanup Command (Dry Run):**
```bash
# Create artificial orphan for testing
# (Delete test homestead channel via Discord, keep DB record)

# Run cleanup dry run
/ops homestead:cleanup <guild_id> dry_run:True

# Expected output:
# 🧹 Homestead Cleanup (DRY RUN)
# Guild: <guild_name>
# 
# Found 1 orphan(s):
# - homestead-testuser (User: <test_user_id>, Channel: <channel_id>)
# 
# ℹ️ DRY RUN MODE: No changes made
# Run with dry_run:False to execute cleanup
```

**Action Required:**
- [ ] Dry run detects orphan correctly
- [ ] No database changes made (dry run mode)
- [ ] Command provides clear output

---

**Test Cleanup Command (Live):**
```bash
# Execute cleanup (mark orphan as deleted)
/ops homestead:cleanup <guild_id> dry_run:False

# Expected output:
# 🧹 Homestead Cleanup
# Guild: <guild_name>
# 
# Cleaned up 1 orphan(s):
# - homestead-testuser (User: <test_user_id>, Channel: <channel_id>) ✅ Marked as deleted
# 
# ✅ Cleanup complete
```

**Validation:**
```bash
# Verify orphan marked as deleted in database
npm run db:cli -- query "SELECT status FROM homestead_channels WHERE userId = '<test_user_id>';"

# Expected output:
# status: 'deleted'
```

**Action Required:**
- [ ] Orphan marked as deleted successfully
- [ ] Database status updated to 'deleted'
- [ ] No errors in cleanup execution

---

### Phase 4: Test Security Monitoring

**Test Permission Auto-Revert:**
```bash
# Via Discord (admin account):
# 1. Navigate to test homestead channel
# 2. Manually grant @everyone ViewChannel permission
# 3. Wait 10 seconds for permission monitor to detect

# Expected behavior:
# - Permission monitor detects change (Phase 2.3)
# - Auto-revert removes @everyone permission
# - DRIPTVDD receives DM: "⚠️ Permission violation detected and reverted"
# - Audit log entry created
```

**Validation:**
```bash
# Check audit log
npm run db:cli -- query "SELECT action, metadata FROM homestead_audit_entries WHERE action = 'homestead.permissions.reverted' ORDER BY timestamp DESC LIMIT 1;"

# Expected output:
# action: 'homestead.permissions.reverted'
# metadata: { channelId: '<channel_id>', reason: 'unauthorized-everyone-permission' }
```

**Action Required:**
- [ ] Permission change detected within 10 seconds
- [ ] @everyone permission auto-reverted
- [ ] DRIPTVDD receives security alert DM
- [ ] Audit log entry created with full context

---

### Phase 5: Load Testing (Optional but Recommended)

**Create Multiple Homesteads:**
```bash
# Use test script or multiple Discord accounts
# Create 10-20 homesteads rapidly

# Expected behavior:
# - First 5 succeed immediately
# - 6th+ trigger rate limit (5-minute cooldown)
# - Rate limit anomaly alert sent to DRIPTVDD
```

**Validation:**
```bash
# Check database for all created homesteads
npm run db:cli -- counts homestead_channels

# Expected output:
# homestead_channels: 10-20 records

# Check IntegrityReport (wait for next hourly run)
/ops homestead:integrity <guild_id>

# Expected output:
# Total Homesteads: 10-20
# Issue Rate: <2% (healthy)
```

**Action Required:**
- [ ] Multiple homesteads created successfully
- [ ] Rate limiting enforced correctly
- [ ] No integrity issues detected
- [ ] System stable under load

---

## Rollback Procedures

### Emergency Rollback Triggers

**Rollback immediately if:**
- ❌ >10% of homestead creations fail
- ❌ Database integrity compromised
- ❌ Security vulnerabilities detected
- ❌ Bot crashes repeatedly
- ❌ Critical bugs discovered in production

---

### Rollback Phase 1: Stop New Creations

**Disable Homestead Commands:**
```javascript
// Via bot console or config change
global.HOMESTEAD_ENABLED = false;

// Or update environment variable
// HOMESTEAD_FEATURE_FLAG=disabled

// Restart bot to apply
```

**Action Required:**
- [ ] Homestead creation commands disabled
- [ ] Users see "Homestead system temporarily unavailable" message
- [ ] Existing homesteads remain accessible

---

### Rollback Phase 2: Revert Database Migration

**Rollback Database:**
```bash
# Restore from pre-deployment backup
psql $PROD_DATABASE_URL < backups/pre-homestead-<timestamp>.sql

# Or use Prisma migration rollback
npx prisma migrate resolve --rolled-back <migration_name>
```

**Validation:**
```bash
# Verify tables removed
npm run db:cli -- query "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'homestead%';"

# Expected output:
# (no tables - rollback successful)
```

**Action Required:**
- [ ] Database restored to pre-deployment state
- [ ] Homestead tables removed
- [ ] No data corruption detected

---

### Rollback Phase 3: Revert Code

**Deploy Previous Version:**
```bash
# Via Render dashboard:
# 1. Navigate to service → Deploys tab
# 2. Find last stable deploy (before homestead feature)
# 3. Click "Redeploy"
# 4. Confirm rollback

# Wait for deployment (~5 minutes)
```

**Validation:**
```bash
# Verify bot version
/ops stats

# Expected output:
# Version: <previous_version> (rollback successful)
```

**Action Required:**
- [ ] Previous version deployed successfully
- [ ] Bot stable and responsive
- [ ] No homestead commands available (as expected)

---

### Rollback Phase 4: Cleanup Artifacts

**Remove IntegrityReports:**
```bash
# Delete generated IntegrityReports
rm -rf Store/homestead-integrity/*

# Verify deletion
ls Store/homestead-integrity/

# Expected output:
# (empty directory)
```

**Action Required:**
- [ ] IntegrityReports deleted
- [ ] Store/ directory cleaned up
- [ ] No orphaned data remaining

---

### Rollback Phase 5: Post-Rollback Communication

**Notify Stakeholders:**
- [ ] Post announcement in Discord: "Homestead feature temporarily disabled due to [reason]"
- [ ] DM DRIPTVDD with rollback details and incident report
- [ ] Update status page (if available)
- [ ] Schedule post-mortem meeting

**Documentation:**
- [ ] Document rollback reason
- [ ] Create incident report
- [ ] Update deployment checklist with lessons learned

---

## Production Cutover

### Phase 1: Enable for All Users

**Feature Flag Activation:**
```javascript
// Update environment variable
HOMESTEAD_FEATURE_FLAG=enabled

// Restart bot to apply
// Or use hot reload if available
```

**Action Required:**
- [ ] Feature flag enabled
- [ ] All users can access `/home` command
- [ ] No errors in production logs

---

### Phase 2: Monitoring Setup

**Configure Alerts:**
```yaml
# prometheus-alerts.yml (or similar)
- alert: HomesteadCreationFailureRate
  expr: rate(homestead_creation_failures[5m]) > 0.1
  for: 5m
  labels:
    severity: high
  annotations:
    summary: "High homestead creation failure rate"

- alert: HomesteadOrphanRate
  expr: homestead_orphan_rate > 5
  for: 1h
  labels:
    severity: critical
  annotations:
    summary: "High orphan rate detected (>5%)"
```

**Action Required:**
- [ ] Prometheus alerts configured
- [ ] Grafana dashboard created (if available)
- [ ] DRIPTVDD added to alert notification list
- [ ] Test alert delivery (send test alert)

---

### Phase 3: Documentation Updates

**Update Operations Bible:**
- [ ] Add production cutover date to `homestead-verification-flow.md`
- [ ] Update known issues section in `homestead-troubleshooting.md`
- [ ] Mark deployment complete in project tracker

**Update Team Documentation:**
- [ ] Share operations guides with team
- [ ] Schedule training session for admins
- [ ] Create quick reference card for common commands

---

### Phase 4: Post-Cutover Monitoring (First 24 Hours)

**Monitor Key Metrics:**

| Metric | Target | Check Frequency |
|--------|--------|-----------------|
| Homestead Creation Rate | <100/hour | Every hour |
| Creation Success Rate | >95% | Every hour |
| Orphan Rate | <2% | Every 4 hours |
| Ghost Rate | <2% | Every 4 hours |
| Permission Reverts | <5/hour | Every hour |

**Monitoring Commands:**
```bash
# Check current statistics
/ops stats

# Check integrity status
/ops homestead:integrity <guild_id>

# Check error logs
/ops errors category:HOMESTEAD limit:50
```

**Action Required:**
- [ ] All metrics within target ranges
- [ ] No critical errors detected
- [ ] User feedback positive
- [ ] System stable under production load

---

### Phase 5: Celebrate Success 🎉

**Post-Deployment Actions:**
- [ ] Announce feature launch in Discord
- [ ] Thank contributors in #dev-announcements
- [ ] Document lessons learned
- [ ] Plan next iteration (Phase 5+)

**Announcement Template:**
```
🎉 Homestead System Now Live! 🎉

Your personal, secure homestead channels are now available!

Use `/home` to create your private homestead channel where you can:
- Heal your Pokémon instantly
- Swap your party
- Access your PC storage
- Manage inventory
- View your Pokédex

Each homestead is private and secure with automatic integrity monitoring.

Questions? Use `/help homestead` or ask in #support.

Happy adventuring! 🏠✨
```

---

## Summary

This deployment checklist provides **comprehensive production deployment procedures** with:

1. ✅ **Pre-Deployment Validation** — Environment, permissions, database, build readiness
2. ✅ **Database Migration** — Backup, apply migrations, verify schema
3. ✅ **Service Deployment** — Bot deploy, cron job setup, EventBus integration
4. ✅ **Post-Deployment Verification** — Health checks, test creation, admin commands, security monitoring
5. ✅ **Rollback Procedures** — Emergency rollback (5 phases, <10 minutes)
6. ✅ **Production Cutover** — Feature flag activation, monitoring setup, 24-hour watch

**Deployment SLA:**
- **Total Time:** 30-45 minutes (with testing)
- **Rollback Time:** <10 minutes (if needed)
- **Zero Downtime:** Achieved via hot deployment and graceful restart

**Success Criteria:**
- ✅ All pre-deployment checks pass
- ✅ Database migrations applied successfully
- ✅ Test homestead creation succeeds
- ✅ Admin commands functional
- ✅ Security monitoring active
- ✅ <2% orphan/ghost rate maintained
- ✅ >95% creation success rate

**Related Documents:**
- `homestead-verification-flow.md` — Complete operational flow reference
- `homestead-troubleshooting.md` — Error scenarios and remediation
- `IMPLEMENTATION-PROGRESS.md` — Project status tracker

---

**Document Ownership:** DevOps Team  
**Review Cadence:** Before each major release  
**Last Deployment:** [Date TBD]  
**Deployment Status:** ✅ READY FOR PRODUCTION
