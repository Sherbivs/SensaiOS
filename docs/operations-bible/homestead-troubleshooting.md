# Homestead System Troubleshooting Guide

**Document Type:** Operations Bible — AUTHORITATIVE  
**Last Updated:** 2025-12-06  
**Status:** ✅ COMPLETE  
**Scope:** Error scenarios, remediation procedures, diagnostics, recovery workflows

---

## Executive Summary

This comprehensive troubleshooting guide covers **all known failure scenarios** for the homestead security system. It provides:

1. **Diagnostic Workflows** — Step-by-step debugging procedures
2. **Orphan Scenarios** — Detection, root causes, remediation
3. **Ghost Scenarios** — Detection, root causes, remediation  
4. **Permission Drift** — Unauthorized changes and auto-revert failures
5. **Rate Limit Alerts** — Anomaly detection and response
6. **IntegrityReport Interpretation** — Reading JSON reports and issue rate analysis
7. **Common Error Codes** — Definitions, causes, solutions

**Target Audience:** Operations engineers, Discord bot administrators, on-call responders

**Quick Access:**
- [Orphan Scenarios](#orphan-scenarios) — DB records without Discord channels
- [Ghost Scenarios](#ghost-scenarios) — Discord channels without DB records
- [Permission Issues](#permission-drift-recovery) — Unauthorized permission changes
- [Error Code Reference](#error-code-reference) — Complete error catalog

---

## Table of Contents

1. [Diagnostic Workflow](#diagnostic-workflow)
2. [Orphan Scenarios](#orphan-scenarios)
3. [Ghost Scenarios](#ghost-scenarios)
4. [Permission Drift Recovery](#permission-drift-recovery)
5. [Rate Limit Alert Handling](#rate-limit-alert-handling)
6. [IntegrityReport Interpretation](#integrityreport-interpretation)
7. [Error Code Reference](#error-code-reference)
8. [Emergency Procedures](#emergency-procedures)

---

## Diagnostic Workflow

### Initial Assessment (First 5 Minutes)

**Step 1: Identify Symptom**
- User reports homestead not created?
- Integrity alert received?
- Permission changes detected?
- Rate limit alert triggered?

**Step 2: Check System Health**
```bash
# Check bot uptime and status
/ops stats

# Check homestead integrity
/ops homestead:integrity <guild_id>

# Check error logs
/ops errors category:HOMESTEAD limit:20
```

**Step 3: Determine Scope**
- Single user affected? → User-specific issue
- Multiple users? → System-wide issue
- Single guild? → Guild configuration issue
- All guilds? → Service degradation

**Step 4: Classify Severity**

| Severity | Criteria | Response Time |
|----------|----------|---------------|
| **P0 (Critical)** | >5% orphan rate, service down | Immediate (5 min) |
| **P1 (High)** | 2-5% orphan rate, creation failures | 15 minutes |
| **P2 (Medium)** | <2% orphan rate, single user issues | 1 hour |
| **P3 (Low)** | Cosmetic issues, false alerts | 24 hours |

---

### Deep Dive Diagnostics

**Step 1: Database Query**
```sql
-- Check homestead status breakdown
SELECT status, COUNT(*) 
FROM "homestead_channels" 
WHERE "guildId" = '<guild_id>' 
GROUP BY status;

-- Check recent creations
SELECT "userId", "channelId", "createdAt", "verifiedAt", status
FROM "homestead_channels"
WHERE "guildId" = '<guild_id>'
  AND "createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC;

-- Check orphans (no verifiedAt or old lastHealthCheck)
SELECT "userId", "channelId", "createdAt", "lastHealthCheck", status
FROM "homestead_channels"
WHERE "guildId" = '<guild_id>'
  AND status = 'active'
  AND ("verifiedAt" IS NULL OR "lastHealthCheck" < NOW() - INTERVAL '2 hours')
ORDER BY "createdAt" DESC;
```

**Step 2: Discord Channel Audit**
```javascript
// Via bot console or script
const guild = await client.guilds.fetch('<guild_id>');
const homesteads = guild.channels.cache.filter(c => c.name.startsWith('homestead-'));

console.log(`Total homestead channels: ${homesteads.size}`);

// Check for permission issues
homesteads.forEach(channel => {
  const userPerms = channel.permissionOverwrites.cache.filter(
    po => po.type === 'Member' && po.id !== client.user.id
  );
  
  if (userPerms.size === 0) {
    console.warn(`⚠️ No user permissions: ${channel.name} (${channel.id})`);
  }
});
```

**Step 3: Review IntegrityReports**
```bash
# List recent integrity reports
ls -lh Store/homestead-integrity/<guild_id>-*.json | tail -5

# Read latest report
cat Store/homestead-integrity/<guild_id>-<latest-timestamp>.json | jq '.'
```

**Step 4: Check Audit Logs**
```bash
# Query ImmutableAuditService for recent homestead actions
# (Requires audit service CLI tool or database query)

SELECT action, actor, target, timestamp, metadata
FROM audit_entries
WHERE "chainId" = 'homestead-operations'
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY sequence DESC
LIMIT 50;
```

---

## Orphan Scenarios

### Definition

**Orphan:** Database record exists but Discord channel does not exist.

**Root Causes:**
1. Manual channel deletion by admin
2. Discord API failure during verification (Phase 1.4)
3. Channel deletion after successful creation
4. Bulk channel cleanup by guild owner
5. Bot kicked from guild (loses channel access)

---

### Scenario 1: Admin Manually Deleted Channel

**Symptoms:**
- IntegrityReport shows orphans
- User cannot access homestead
- Database shows `status: 'active'`

**Diagnostic:**
```bash
# Check orphan list in latest report
/ops homestead:integrity <guild_id>

# Verify channel truly deleted (not bot permission issue)
# Via bot console:
const channel = await client.channels.fetch('<channel_id>').catch(() => null);
console.log(channel ? 'Channel exists' : 'Channel deleted');
```

**Root Cause:**
- Admin deleted homestead channel without using bot command
- Database record not updated

**Remediation:**

**Option 1: Mark as Deleted (Recommended)**
```bash
# Preview cleanup
/ops homestead:cleanup <guild_id> dry_run:True

# Execute cleanup
/ops homestead:cleanup <guild_id> dry_run:False
```

**Option 2: Recreate Channel (If User Wants It Back)**
```javascript
// Requires manual service call or admin script
const homestead = await prisma.homesteadChannel.findUnique({
  where: { id: '<orphan_id>' }
});

const guild = await client.guilds.fetch(homestead.guildId);
const user = await client.users.fetch(homestead.userId);

// Call HomesteadVerificationService.createVerifiedHomestead()
// This will create new channel and update database record
```

**Prevention:**
- Document proper homestead deletion procedure for admins
- Consider Discord role restrictions on channel deletion
- Add warning messages when deleting homestead channels

---

### Scenario 2: Verification Failure (Phase 1.4 Error)

**Symptoms:**
- User reports "homestead creation failed"
- Database record exists with `verifiedAt: NULL`
- Discord channel may or may not exist

**Diagnostic:**
```bash
# Check error logs for verification failures
/ops errors category:HOMESTEAD search:"VERIFICATION_FAILED"

# Check database
SELECT "userId", "channelId", "createdAt", "verifiedAt", status
FROM "homestead_channels"
WHERE "guildId" = '<guild_id>'
  AND "verifiedAt" IS NULL
ORDER BY "createdAt" DESC;
```

**Root Cause:**
- Discord API rate limit during channel fetch
- Network timeout during verification
- Channel deleted immediately after creation (rare race condition)

**Remediation:**

**Step 1: Check if Channel Exists**
```javascript
const channel = await client.channels.fetch('<channel_id>').catch(() => null);

if (channel) {
  // Channel exists, just needs verification update
  await prisma.homesteadChannel.update({
    where: { id: '<orphan_id>' },
    data: {
      verifiedAt: new Date(),
      securityFingerprint: generateSecurityFingerprint(
        channel.id, userId, guildId, secretKey
      ),
    }
  });
} else {
  // Channel doesn't exist, mark as deleted
  await prisma.homesteadChannel.update({
    where: { id: '<orphan_id>' },
    data: { status: 'deleted' }
  });
  
  // User can retry creation
}
```

**Prevention:**
- Increase verification retry attempts (exponential backoff)
- Add network timeout handling in Phase 1.4
- Log verification failures with full context

---

### Scenario 3: Bot Kicked from Guild

**Symptoms:**
- All homesteads in guild appear as orphans
- Bot cannot fetch channels via API
- IntegrityReport shows 100% orphan rate

**Diagnostic:**
```bash
# Check if bot is in guild
const guild = await client.guilds.fetch('<guild_id>').catch(() => null);
console.log(guild ? 'Bot in guild' : 'Bot not in guild');

# If bot is in guild, check permissions
if (guild) {
  const botMember = await guild.members.fetch(client.user.id);
  console.log('Bot permissions:', botMember.permissions.toArray());
}
```

**Root Cause:**
- Guild owner kicked bot
- Bot removed by admin

**Remediation:**

**Option 1: Bot Re-Added to Guild**
```bash
# After bot rejoins guild, wait for next integrity check (hourly)
# Or manually trigger integrity verification
# Orphans should resolve automatically once bot regains channel access
```

**Option 2: Bot Permanently Removed**
```bash
# Mark all homesteads in guild as deleted
UPDATE "homestead_channels"
SET status = 'deleted'
WHERE "guildId" = '<guild_id>'
  AND status = 'active';
```

**Prevention:**
- Monitor `guildDelete` Discord event
- Automatically mark all homesteads as deleted when bot leaves guild
- Alert DRIPTVDD when bot kicked from guild

---

## Ghost Scenarios

### Definition

**Ghost:** Discord channel exists but no database record exists.

**Root Causes:**
1. Manual channel creation by admin (not via bot)
2. Database transaction failure (Phase 1.3)
3. Database record manually deleted
4. Channel restore after deletion (Discord feature)
5. Migration/import errors

---

### Scenario 1: Manual Channel Creation by Admin

**Symptoms:**
- IntegrityReport shows ghost channels
- Channel exists with `homestead-{username}` pattern
- No database record found

**Diagnostic:**
```bash
# Check ghost list in latest report
/ops homestead:integrity <guild_id>

# Verify channel is truly a ghost
const channel = await guild.channels.cache.get('<channel_id>');
const dbRecord = await prisma.homesteadChannel.findFirst({
  where: { channelId: channel.id }
});

console.log(dbRecord ? 'Has DB record' : 'Ghost channel');
```

**Root Cause:**
- Admin created `homestead-{username}` channel manually
- Bot never recorded it in database

**Remediation:**

**Option 1: Delete Ghost Channel (Recommended)**
```javascript
// Delete channel via Discord API
const channel = await guild.channels.fetch('<channel_id>');
await channel.delete('Ghost channel cleanup');
```

**Option 2: Adopt Ghost Channel (Create DB Record)**
```javascript
// Extract user ID from channel name or permissions
const channel = await guild.channels.fetch('<channel_id>');
const userName = channel.name.replace('homestead-', '');

// Find user in guild
const member = guild.members.cache.find(m => 
  m.user.username.toLowerCase() === userName.toLowerCase()
);

if (member) {
  // Create database record
  await prisma.homesteadChannel.create({
    data: {
      guildId: guild.id,
      userId: member.user.id,
      channelId: channel.id,
      status: 'active',
      createdBy: 'admin-adoption',
      verifiedAt: new Date(),
      securityFingerprint: generateSecurityFingerprint(
        channel.id, member.user.id, guild.id, secretKey
      ),
      lastHealthCheck: new Date(),
    }
  });
}
```

**Prevention:**
- Document that homestead channels should only be created via bot
- Monitor `channelCreate` event for `homestead-*` pattern
- Alert admins when manual homestead channels detected

---

### Scenario 2: Database Transaction Failure (Phase 1.3)

**Symptoms:**
- Discord channel exists
- User reports "homestead creation succeeded"
- No database record (ghost channel)

**Diagnostic:**
```bash
# Check error logs for database insert failures
/ops errors category:DATABASE search:"homestead_channels"

# Check ghost channels
/ops homestead:integrity <guild_id>
```

**Root Cause:**
- Database connection lost during Phase 1.3
- Prisma transaction timeout
- Database constraint violation (shouldn't happen with unique checks)

**Remediation:**

**Step 1: Verify Ghost Channel**
```javascript
const channel = await guild.channels.fetch('<channel_id>');
const userPerms = channel.permissionOverwrites.cache.find(
  po => po.type === 'Member' && po.id !== client.user.id
);

if (userPerms) {
  // Adopt ghost channel (create DB record)
  await prisma.homesteadChannel.create({
    data: {
      guildId: guild.id,
      userId: userPerms.id,
      channelId: channel.id,
      status: 'active',
      createdBy: 'recovery-from-ghost',
      verifiedAt: new Date(),
      securityFingerprint: generateSecurityFingerprint(
        channel.id, userPerms.id, guild.id, secretKey
      ),
      lastHealthCheck: new Date(),
    }
  });
} else {
  // Cannot determine owner, delete channel
  await channel.delete('Ghost channel with unknown owner');
}
```

**Prevention:**
- Increase database transaction timeout
- Add retry logic for database inserts
- Implement idempotency tokens (prevent duplicate creations)

---

### Scenario 3: Database Record Manually Deleted

**Symptoms:**
- Discord channel exists and functional
- User can access homestead
- IntegrityReport shows ghost channel
- Database query returns no record

**Diagnostic:**
```bash
# Check audit logs for database deletions
SELECT * FROM audit_entries
WHERE action LIKE '%deleted%'
  AND metadata->>'channelId' = '<channel_id>'
ORDER BY timestamp DESC;

# Check if accidental database migration rollback
git log --oneline prisma/migrations/
```

**Root Cause:**
- Admin manually deleted database record (SQL DELETE)
- Database migration rollback
- Data corruption

**Remediation:**

**Option 1: Restore from Backup**
```bash
# If database backup available
pg_restore --dbname=<db_name> --table=homestead_channels <backup_file>
```

**Option 2: Recreate Database Record**
```javascript
// Extract user ID from channel permissions
const channel = await guild.channels.fetch('<channel_id>');
const userPerm = channel.permissionOverwrites.cache.find(
  po => po.type === 'Member' && po.id !== client.user.id
);

await prisma.homesteadChannel.create({
  data: {
    guildId: guild.id,
    userId: userPerm.id,
    channelId: channel.id,
    status: 'active',
    createdBy: 'recovery-from-deletion',
    verifiedAt: new Date(),
    securityFingerprint: generateSecurityFingerprint(
      channel.id, userPerm.id, guild.id, secretKey
    ),
    lastHealthCheck: new Date(),
  }
});
```

**Prevention:**
- Implement Row-Level Security (RLS) in PostgreSQL
- Restrict database access (read-only for most services)
- Enable database audit logging
- Regular database backups (daily minimum)

---

## Permission Drift Recovery

### Definition

**Permission Drift:** Unauthorized changes to homestead channel permissions detected by Phase 2.3 monitoring.

**Root Causes:**
1. Admin manually changed permissions via Discord
2. Role permission changes affecting channel inheritance
3. Guild member role changes (user promoted to admin)
4. Bot permission changes (lost MANAGE_CHANNELS)

---

### Scenario 1: User Permission Removed

**Symptoms:**
- User reports "cannot access homestead"
- Permission monitoring log shows `homestead.permissions.reverted`
- Channel permissions missing user `ViewChannel`

**Diagnostic:**
```bash
# Check audit logs
SELECT action, metadata
FROM audit_entries
WHERE action = 'homestead.permissions.reverted'
  AND metadata->>'channelId' = '<channel_id>'
ORDER BY timestamp DESC
LIMIT 5;

# Check current channel permissions
const channel = await guild.channels.fetch('<channel_id>');
const userPerms = channel.permissionOverwrites.cache.get('<user_id>');
console.log('User permissions:', userPerms?.allow.toArray());
```

**Root Cause:**
- Admin accidentally removed user permission
- Bulk permission change via Discord

**Remediation:**

**Auto-Revert (Automatic):**
```javascript
// Permission monitor detects and auto-reverts (Phase 2.3)
// No manual intervention needed if auto-revert succeeds
```

**Manual Revert (If Auto-Revert Failed):**
```javascript
const channel = await guild.channels.fetch('<channel_id>');
const homestead = await prisma.homesteadChannel.findFirst({
  where: { channelId: channel.id }
});

await channel.permissionOverwrites.edit(homestead.userId, {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
});

// Log manual revert
await auditService.append({
  action: 'homestead.permissions.manually-reverted',
  actor: 'admin-manual',
  target: homestead.userId,
  metadata: {
    channelId: channel.id,
    reason: 'auto-revert-failed',
  }
});
```

**Prevention:**
- Monitor permission monitor health (check last revert timestamp)
- Alert if auto-revert fails multiple times
- Document proper permission change procedures for admins

---

### Scenario 2: @everyone Permission Added

**Symptoms:**
- Homestead channel visible to all guild members
- Security violation detected by Phase 2.3
- Permission monitor log shows `homestead.permissions.security-violation`

**Diagnostic:**
```bash
# Check for @everyone permission
const channel = await guild.channels.fetch('<channel_id>');
const everyonePerms = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);

if (everyonePerms && everyonePerms.allow.has('ViewChannel')) {
  console.error('🚨 SECURITY VIOLATION: @everyone can view private homestead');
}
```

**Root Cause:**
- Admin granted @everyone `ViewChannel` permission
- Role permission inheritance misconfiguration

**Remediation:**

**Auto-Revert (Automatic):**
```javascript
// Permission monitor detects and removes @everyone permission (Phase 2.3)
await channel.permissionOverwrites.delete(guild.roles.everyone.id);
```

**Manual Verification:**
```javascript
// Verify @everyone permission removed
const channel = await guild.channels.fetch('<channel_id>');
const everyonePerms = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);

if (everyonePerms?.deny.has('ViewChannel')) {
  console.log('✅ @everyone correctly denied ViewChannel');
} else {
  console.warn('⚠️ @everyone permission not properly set');
  
  // Fix
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, {
    ViewChannel: false,
  });
}
```

**Escalation:**
- DM DRIPTVDD with security violation details
- Log to ImmutableAuditService with severity HIGH
- Consider temporary suspension of admin who made change

---

### Scenario 3: Bot Permission Removed

**Symptoms:**
- Bot cannot manage homestead channels
- Permission revert attempts fail
- Error logs show `MISSING_PERMISSIONS`

**Diagnostic:**
```bash
# Check bot permissions in guild
const guild = await client.guilds.fetch('<guild_id>');
const botMember = await guild.members.fetch(client.user.id);
const hasManageChannels = botMember.permissions.has('ManageChannels');

console.log('Bot has MANAGE_CHANNELS:', hasManageChannels);

# Check specific channel
const channel = await guild.channels.fetch('<channel_id>');
const botPerms = channel.permissionsFor(client.user.id);
console.log('Bot channel permissions:', botPerms.toArray());
```

**Root Cause:**
- Admin removed bot's `MANAGE_CHANNELS` permission
- Bot role demoted

**Remediation:**

**Step 1: Restore Bot Permissions**
```javascript
// Admin must grant MANAGE_CHANNELS permission via Discord
// Or re-assign bot to role with proper permissions
```

**Step 2: Verify Permission Restoration**
```bash
# After permissions restored, verify
const guild = await client.guilds.fetch('<guild_id>');
const botMember = await guild.members.fetch(client.user.id);
console.log('Bot permissions:', botMember.permissions.toArray());
```

**Step 3: Re-Run Integrity Check**
```bash
# Trigger manual integrity check
/ops homestead:integrity <guild_id>
```

**Prevention:**
- Document minimum bot permissions for admins
- Monitor bot permission changes via `guildMemberUpdate` event
- Alert DRIPTVDD when bot permissions removed

---

## Rate Limit Alert Handling

### Alert Types

**Alert 1: Mass Creation Anomaly**
- **Trigger:** 5+ homestead creations in 10 minutes by single user
- **EventBus:** `homestead.anomaly.mass-creation`
- **Severity:** HIGH

**Alert 2: Rapid Verification Anomaly**
- **Trigger:** 10+ verification calls in 5 minutes by single user
- **EventBus:** `homestead.anomaly.rapid-verification`
- **Severity:** MEDIUM

---

### Response Procedure

**Step 1: Confirm Anomaly**
```bash
# Check database for recent creations by user
SELECT "userId", COUNT(*), MIN("createdAt"), MAX("createdAt")
FROM "homestead_channels"
WHERE "userId" = '<user_id>'
  AND "createdAt" > NOW() - INTERVAL '10 minutes'
GROUP BY "userId";
```

**Step 2: Assess Intent**
- Legitimate user testing bot? → Allow after cooldown
- Automated script detected? → Block user temporarily
- Malicious attack? → Ban user, report to guild admin

**Step 3: Remediation**

**Option 1: Temporary Block (Soft)**
```javascript
// Extend rate limit cooldown for user
rateLimiter.extendCooldown(userId, 60 * 60 * 1000); // 1 hour
```

**Option 2: Permanent Block (Hard)**
```javascript
// Add user to blocklist
await prisma.blockedUser.create({
  data: {
    userId: userId,
    guildId: guildId,
    reason: 'mass-homestead-creation-anomaly',
    blockedAt: new Date(),
    blockedBy: 'automated-security',
  }
});
```

**Option 3: Guild-Wide Rate Limit Adjustment**
```javascript
// Temporarily increase cooldown for all users in guild
await prisma.guildSettings.update({
  where: { guildId: guildId },
  data: {
    homesteadCreationCooldownMs: 600000, // 10 minutes (from 5 minutes)
  }
});
```

**Step 4: Notify Stakeholders**
- DM DRIPTVDD with anomaly details
- DM guild owner if malicious activity suspected
- Log to ImmutableAuditService with full context

---

## IntegrityReport Interpretation

### Report Structure

**Key Metrics:**
- `totalHomesteads` — Total active + suspended homesteads in guild
- `verified` — Homesteads with `verifiedAt` timestamp
- `unverified` — Homesteads missing `verifiedAt` (potential orphans)
- `orphans` — DB records without Discord channels
- `ghosts` — Discord channels without DB records

**Issue Rate Formula:**
```
issueRate = ((orphans + ghosts) / totalHomesteads) * 100
```

---

### Severity Classification

| Issue Rate | Severity | Action Required |
|-----------|----------|----------------|
| **<2%** | 🟢 Green (Healthy) | Monitor, no action needed |
| **2-5%** | 🟡 Yellow (Warning) | Investigate root cause, schedule cleanup |
| **>5%** | 🔴 Red (Critical) | Immediate investigation, cleanup ASAP |

---

### Example Reports

**Healthy System:**
```json
{
  "totalHomesteads": 150,
  "verified": 148,
  "unverified": 2,
  "orphans": 1,
  "ghosts": 1,
  "issueRate": 1.33  // 🟢 Green
}
```
**Interpretation:** System healthy, 2 minor issues (1 orphan + 1 ghost). Schedule cleanup during maintenance window.

---

**Warning System:**
```json
{
  "totalHomesteads": 100,
  "verified": 95,
  "unverified": 3,
  "orphans": 3,
  "ghosts": 1,
  "issueRate": 4.0  // 🟡 Yellow
}
```
**Interpretation:** Warning threshold. Investigate why 3 orphans exist. Check recent admin activity, Discord API stability. Cleanup within 24 hours.

---

**Critical System:**
```json
{
  "totalHomesteads": 80,
  "verified": 70,
  "unverified": 10,
  "orphans": 8,
  "ghosts": 2,
  "issueRate": 12.5  // 🔴 Red
}
```
**Interpretation:** CRITICAL. 10 unverified homesteads + 8 orphans + 2 ghosts. Possible system-wide failure. Check:
1. Bot permissions in guild
2. Discord API outages (past 24h)
3. Database connection issues
4. Recent admin bulk actions

**Immediate Action:** Run `/ops homestead:cleanup` to mark orphans as deleted, investigate root cause.

---

### Trend Analysis

**Monitor IntegrityReports over time:**
```bash
# List last 7 reports
ls -lh Store/homestead-integrity/<guild_id>-*.json | tail -7

# Extract issue rates
for file in Store/homestead-integrity/<guild_id>-*.json; do
  echo "$file: $(jq '.orphans + .ghosts' $file) issues"
done
```

**Trend Indicators:**
- **Increasing orphans:** Likely admin deletions or bot permission issues
- **Increasing ghosts:** Likely manual channel creations or DB failures
- **Stable low rates:** System healthy
- **Sudden spike:** Investigate incident (API outage, bulk actions)

---

## Error Code Reference

### Creation Errors

**ERROR: DUPLICATE_HOMESTEAD**
- **Code:** `DUPLICATE_HOMESTEAD`
- **Phase:** 1.1 (Pre-Flight Validation)
- **Cause:** User already has active homestead in guild
- **Solution:** Direct user to existing homestead channel
- **Recovery:** No action needed (expected behavior)

**ERROR: INSUFFICIENT_PERMISSIONS**
- **Code:** `INSUFFICIENT_PERMISSIONS`
- **Phase:** 1.1 (Pre-Flight Validation)
- **Cause:** Bot lacks `MANAGE_CHANNELS` permission
- **Solution:** Grant bot permission, user retries
- **Recovery:** Admin restores bot permissions

**ERROR: RATE_LIMIT_EXCEEDED**
- **Code:** `RATE_LIMIT_EXCEEDED`
- **Phase:** 1.1 (Pre-Flight Validation)
- **Cause:** User attempted creation within cooldown period
- **Solution:** Wait for cooldown expiry (5 minutes default)
- **Recovery:** User waits and retries

**ERROR: DISCORD_API_TIMEOUT**
- **Code:** `DISCORD_API_TIMEOUT`
- **Phase:** 1.2 (Discord Channel Creation)
- **Cause:** Discord API did not respond within timeout
- **Solution:** Retry creation (Discord may be experiencing issues)
- **Recovery:** Automatic retry with exponential backoff

**ERROR: CATEGORY_NOT_FOUND**
- **Code:** `CATEGORY_NOT_FOUND`
- **Phase:** 1.2 (Discord Channel Creation)
- **Cause:** "Homesteads" category deleted or renamed
- **Solution:** Bot creates new category automatically
- **Recovery:** Automatic (bot creates category)

**ERROR: DATABASE_INSERT_FAILED**
- **Code:** `DATABASE_INSERT_FAILED`
- **Phase:** 1.3 (Database Recording)
- **Cause:** Database connection lost or constraint violation
- **Solution:** Rollback Discord channel, user retries
- **Recovery:** Check database connectivity, retry

**ERROR: VERIFICATION_FAILED_CHANNEL_NOT_FOUND**
- **Code:** `VERIFICATION_FAILED_CHANNEL_NOT_FOUND`
- **Phase:** 1.4 (Verification)
- **Cause:** Channel deleted between creation and verification
- **Solution:** Rollback database record, user retries
- **Recovery:** Investigate rapid channel deletion (admin action?)

**ERROR: VERIFICATION_FAILED_NAME_MISMATCH**
- **Code:** `VERIFICATION_FAILED_NAME_MISMATCH`
- **Phase:** 1.4 (Verification)
- **Cause:** Channel name changed between creation and verification
- **Solution:** Rollback, investigate race condition
- **Recovery:** Rare, check for concurrent admin renames

---

### Admin Command Errors

**ERROR: NO_INTEGRITY_REPORTS_FOUND**
- **Code:** `NO_INTEGRITY_REPORTS_FOUND`
- **Command:** `/ops homestead:integrity`
- **Cause:** Integrity worker has not run yet or reports deleted
- **Solution:** Wait for next hourly run or manually trigger worker
- **Recovery:** Check cron job status, verify Store/ directory

**ERROR: CLEANUP_FAILED_NO_ORPHANS**
- **Code:** `CLEANUP_FAILED_NO_ORPHANS`
- **Command:** `/ops homestead:cleanup`
- **Cause:** Latest IntegrityReport shows 0 orphans
- **Solution:** No cleanup needed (expected)
- **Recovery:** Verify IntegrityReport is current

**ERROR: ORPHAN_CLEANUP_DATABASE_FAILURE**
- **Code:** `ORPHAN_CLEANUP_DATABASE_FAILURE`
- **Command:** `/ops homestead:cleanup`
- **Cause:** Database update failed during cleanup
- **Solution:** Check database connectivity, retry
- **Recovery:** Per-orphan error handling (other orphans still cleaned)

---

## Emergency Procedures

### Procedure 1: Total Homestead System Outage

**Symptoms:**
- All homestead creations failing
- 100% error rate
- Multiple guilds affected

**Actions:**

**Step 1: Confirm Outage (2 minutes)**
```bash
# Check bot status
/ops stats

# Check error rate
/ops errors category:HOMESTEAD limit:50

# Check database connectivity
SELECT 1;  # Should return instantly
```

**Step 2: Identify Root Cause (5 minutes)**
- Discord API outage? Check Discord status page
- Database outage? Check database connection
- Bot service down? Check process status

**Step 3: Notify Stakeholders (Immediate)**
- Post status update in Discord announcements channel
- DM DRIPTVDD with incident details
- Update status page (if available)

**Step 4: Implement Workaround**
- If Discord API down: Wait for resolution
- If database down: Restart database service
- If bot service down: Restart bot

**Step 5: Post-Incident Review**
- Document incident timeline
- Identify preventive measures
- Update runbooks

---

### Procedure 2: Mass Orphan Creation

**Symptoms:**
- IntegrityReport shows 50+ orphans suddenly
- Guild admin bulk deleted channels
- Users reporting "homestead not found"

**Actions:**

**Step 1: Confirm Scope (3 minutes)**
```bash
# Check IntegrityReport
/ops homestead:integrity <guild_id>

# Query database
SELECT COUNT(*) FROM "homestead_channels"
WHERE "guildId" = '<guild_id>'
  AND status = 'active';
```

**Step 2: Contact Guild Admin (Immediate)**
- Ask if bulk channel deletion was intentional
- Explain homestead system and proper deletion procedures

**Step 3: Cleanup Orphans (5 minutes)**
```bash
# Preview cleanup
/ops homestead:cleanup <guild_id> dry_run:True

# Execute cleanup
/ops homestead:cleanup <guild_id> dry_run:False
```

**Step 4: User Communication**
- Announce in guild: "Homestead channels were accidentally deleted. Users can recreate via /home command"

---

### Procedure 3: Security Breach (Unauthorized Access)

**Symptoms:**
- Multiple homestead channels show @everyone permission
- Security violation alerts flooding
- Users report "everyone can see my homestead"

**Actions:**

**Step 1: Immediate Containment (1 minute)**
```javascript
// Emergency script: Remove @everyone from all homesteads
const guild = await client.guilds.fetch('<guild_id>');
const homesteads = guild.channels.cache.filter(c => c.name.startsWith('homestead-'));

for (const channel of homesteads.values()) {
  await channel.permissionOverwrites.delete(guild.roles.everyone.id);
}
```

**Step 2: Identify Attacker (5 minutes)**
```bash
# Check audit logs for permission changes
const auditLogs = await guild.fetchAuditLogs({
  type: AuditLogEvent.ChannelOverwriteUpdate,
  limit: 50
});

auditLogs.entries.forEach(entry => {
  if (entry.changes.some(c => c.key === 'allow' && c.new.includes('ViewChannel'))) {
    console.log('Suspicious change by:', entry.executor.tag);
  }
});
```

**Step 3: Ban Attacker**
```javascript
await guild.members.ban(attackerUserId, {
  reason: 'Security breach: Unauthorized homestead permission changes'
});
```

**Step 4: Post-Incident**
- Document incident in security log
- Review bot permission model
- Consider additional permission monitoring

---

## Summary

This troubleshooting guide provides **comprehensive coverage** of all known homestead system failure scenarios with:

1. ✅ **Diagnostic Workflows** — Step-by-step debugging procedures
2. ✅ **Orphan Remediation** — 3 scenarios with detection, root cause, recovery
3. ✅ **Ghost Remediation** — 3 scenarios with detection, root cause, recovery
4. ✅ **Permission Recovery** — 3 scenarios with auto-revert and manual procedures
5. ✅ **Rate Limit Handling** — Anomaly detection and response workflows
6. ✅ **IntegrityReport Analysis** — Severity classification and trend analysis
7. ✅ **Error Code Catalog** — 15+ errors with causes and solutions
8. ✅ **Emergency Procedures** — 3 critical scenarios with immediate actions

**Key Operational Principles:**
- ✅ **Rapid Diagnosis:** 5-minute initial assessment workflow
- ✅ **Clear Remediation:** Step-by-step recovery procedures
- ✅ **Preventive Measures:** Root cause analysis and prevention strategies
- ✅ **Escalation Paths:** When to notify DRIPTVDD, when to ban users

**Related Documents:**
- `homestead-verification-flow.md` — Complete operational flow reference
- `homestead-deployment-checklist.md` — Production deployment procedures

---

**Document Ownership:** Operations Team  
**Review Cadence:** Quarterly or after major incidents  
**Last Incident:** None (system newly deployed)  
**Incident Response Time SLA:** P0: 5min, P1: 15min, P2: 1hr, P3: 24hr
