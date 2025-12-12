# Homestead Verification Flow — End-to-End Operations Guide

**Document Type:** Operations Bible — AUTHORITATIVE  
**Last Updated:** 2025-12-06  
**Status:** ✅ COMPLETE  
**Scope:** Homestead channel creation, security verification, integrity monitoring, admin operations

---

## Executive Summary

This document provides the **complete end-to-end operational flow** for the guild-wide homestead channel system with security verification. It covers:

1. **Homestead Creation Flow** — 5-phase verified creation process
2. **Security Integration** — Audit logging, rate limiting, permission monitoring
3. **Integrity Verification** — Hourly cron job detecting orphans/ghosts
4. **Admin Operations** — Integrity reports and cleanup workflows

**Target Audience:** Operations engineers, Discord bot administrators, security auditors

**Key Objective:** Ensure every homestead channel is created securely, monitored continuously, and maintained through automated integrity verification.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Phase 1: Homestead Creation Flow](#phase-1-homestead-creation-flow)
3. [Phase 2: Security Integration](#phase-2-security-integration)
4. [Phase 3: Integrity Verification](#phase-3-integrity-verification)
5. [Phase 4: Admin Operations](#phase-4-admin-operations)
6. [Monitoring & Observability](#monitoring--observability)
7. [Error Handling & Recovery](#error-handling--recovery)
8. [Security Considerations](#security-considerations)

---

## System Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Discord Guild                            │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │  Homesteads    │  │  homestead-    │  │  homestead-    │   │
│  │  Category      │──│  username1     │  │  username2     │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Discord API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Infinity Gauntlet Bot                         │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  HomesteadVerificationService (Core Service)             │  │
│  │  - createVerifiedHomestead() — 5-phase creation         │  │
│  │  - verifyIntegrity() — Orphan/ghost detection           │  │
│  │  - generateSecurityFingerprint() — HMAC-SHA256          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────┼──────────────────────────────┐   │
│  │  Security Integration    │  Admin Operations            │   │
│  │  - ImmutableAuditService │  - /ops homestead:integrity  │   │
│  │  - Rate Limiting         │  - /ops homestead:cleanup    │   │
│  │  - Permission Monitor    │                              │   │
│  └──────────────────────────┴──────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │  Integrity Worker (Hourly Cron)                         │   │
│  │  - Detects orphans (DB but no channel)                  │   │
│  │  - Detects ghosts (channel but no DB)                   │   │
│  │  - Generates JSON reports (24h retention)               │   │
│  │  - Alerts on 5%+ issue rate                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Database Writes
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                           │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  homestead_channels Table                               │  │
│  │  - id, guildId, userId, channelId                       │  │
│  │  - status (active, suspended, orphaned, deleted)        │  │
│  │  - verifiedAt, createdBy, securityFingerprint          │  │
│  │  - lastHealthCheck                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ JSON Reports
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Store/homestead-integrity/                    │
│  {guildId}-2025-12-06T15-00-00Z.json (IntegrityReport)        │
│  {guildId}-2025-12-06T16-00-00Z.json (24h retention)          │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

**Creation Flow:**
```
User Request → Bot → Discord API (create channel) → Database (record) 
→ Verification (API re-fetch) → Security Fingerprint → Success
```

**Integrity Flow:**
```
Hourly Cron → Fetch DB records → Fetch Discord channels 
→ Compare → Detect orphans/ghosts → JSON report 
→ Alert if 5%+ issues
```

**Admin Flow:**
```
Admin Command → Read JSON report → Display/Cleanup 
→ Update database → Audit log → Return results
```

---

## Phase 1: Homestead Creation Flow

### Overview

The **5-phase verified creation flow** ensures atomic operations with rollback capabilities. If any phase fails, previous operations are rolled back to prevent orphaned resources.

### Phase 1.1: Pre-Flight Validation

**Purpose:** Validate prerequisites before making any changes.

**Checks Performed:**
1. ✅ **Duplicate Detection** — Check if homestead already exists for user
2. ✅ **Bot Permissions** — Verify `MANAGE_CHANNELS` permission in guild
3. ✅ **Rate Limiting** — Check user hasn't exceeded creation cooldown (Phase 3.2)

**Database Query:**
```typescript
const existing = await prisma.homesteadChannel.findFirst({
  where: {
    guildId: guild.id,
    userId: user.id,
    status: { in: ['active', 'suspended'] }
  }
});

if (existing) {
  throw new Error('DUPLICATE_HOMESTEAD');
}
```

**Outcome:**
- ✅ **Pass:** Proceed to Phase 1.2
- ❌ **Fail:** Return error, no changes made

---

### Phase 1.2: Discord Channel Creation

**Purpose:** Create private homestead channel in Discord guild.

**Operations:**
1. Find or create "Homesteads" category channel
2. Create private text channel with naming pattern: `homestead-{username}`
3. Set permissions:
   - User: `VIEW_CHANNEL`, `SEND_MESSAGES`, `READ_MESSAGE_HISTORY`
   - Bot: `MANAGE_CHANNELS`, `SEND_MESSAGES`, `MANAGE_MESSAGES`
   - @everyone: Deny `VIEW_CHANNEL` (hide channel)

**Discord API Call:**
```typescript
const category = guild.channels.cache.find(
  c => c.name === 'Homesteads' && c.type === ChannelType.GuildCategory
) || await guild.channels.create({
  name: 'Homesteads',
  type: ChannelType.GuildCategory,
});

const channel = await guild.channels.create({
  name: `homestead-${user.username}`,
  type: ChannelType.GuildText,
  parent: category.id,
  permissionOverwrites: [
    { id: user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
    { id: guild.members.me.id, allow: ['ViewChannel', 'ManageChannels', 'SendMessages'] },
    { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
  ],
});
```

**Outcome:**
- ✅ **Success:** Channel created, proceed to Phase 1.3
- ❌ **Fail:** No database record created, error returned

---

### Phase 1.3: Database Recording (Atomic Transaction)

**Purpose:** Record homestead in database with security metadata.

**Database Operation:**
```typescript
const homestead = await prisma.homesteadChannel.create({
  data: {
    guildId: guild.id,
    userId: user.id,
    channelId: channel.id,
    status: 'active',
    createdBy: 'user',  // or 'admin', 'bot-auto-onboard'
    verifiedAt: null,   // Set in Phase 1.4 after verification
    securityFingerprint: null,  // Generated in Phase 1.4
    lastHealthCheck: new Date(),
  }
});
```

**Transaction Guarantees:**
- ✅ **Atomic:** Database insert succeeds or fails as single unit
- ✅ **Rollback Ready:** On failure, Phase 1.2 channel must be deleted

**Outcome:**
- ✅ **Success:** Database record created, proceed to Phase 1.4
- ❌ **Fail:** Delete Discord channel (rollback), return error

---

### Phase 1.4: Verification

**Purpose:** Confirm Discord channel exists and is accessible via API.

**Verification Steps:**
1. Re-fetch Discord channel by ID (confirms API visibility)
2. Validate channel name matches pattern `homestead-{username}`
3. Validate user permissions are correctly set
4. Validate bot permissions are correctly set

**Discord API Call:**
```typescript
const verifiedChannel = await guild.channels.fetch(channel.id);

if (!verifiedChannel) {
  throw new Error('VERIFICATION_FAILED_CHANNEL_NOT_FOUND');
}

if (verifiedChannel.name !== `homestead-${user.username}`) {
  throw new Error('VERIFICATION_FAILED_NAME_MISMATCH');
}
```

**Outcome:**
- ✅ **Success:** Channel verified, proceed to Phase 1.5
- ❌ **Fail:** Delete channel + database record (rollback), return error

---

### Phase 1.5: Security Fingerprinting

**Purpose:** Generate HMAC-SHA256 signature for tamper detection.

**Fingerprint Generation:**
```typescript
import crypto from 'crypto';

function generateSecurityFingerprint(
  channelId: string,
  userId: string,
  guildId: string,
  secretKey: string
): string {
  const payload = `${channelId}:${userId}:${guildId}`;
  return crypto
    .createHmac('sha256', secretKey)
    .update(payload)
    .digest('hex');
}

const fingerprint = generateSecurityFingerprint(
  channel.id,
  user.id,
  guild.id,
  process.env.HOMESTEAD_HMAC_KEY || 'default-secret'
);
```

**Database Update:**
```typescript
await prisma.homesteadChannel.update({
  where: { id: homestead.id },
  data: {
    verifiedAt: new Date(),
    securityFingerprint: fingerprint,
  }
});
```

**Outcome:**
- ✅ **Success:** Homestead fully verified, creation complete
- ❌ **Fail:** Unlikely (database update), logged as warning

---

### Phase 1.6: Post-Creation Actions

**After successful creation:**

1. **Send Welcome Message** (optional):
   ```typescript
   await channel.send({
     content: `🏠 Welcome to your homestead, ${user.username}!\n\n` +
              `This is your private space. Available commands:\n` +
              `• \`/heal\` — Restore your Pokémon's HP/PP\n` +
              `• \`/party\` — Manage your active team\n` +
              `• \`/box\` — Access Pokémon storage\n` +
              `• \`/inventory\` — View items\n` +
              `• \`/pokedex\` — Check your Pokédex`,
   });
   ```

2. **Audit Logging** (Phase 2.1):
   ```typescript
   await auditService.append({
     action: 'homestead.created',
     actor: user.id,
     target: channel.id,
     timestamp: new Date(),
     metadata: {
       guildId: guild.id,
       userId: user.id,
       channelId: channel.id,
       createdBy: 'user',
     }
   });
   ```

3. **EventBus Notification** (optional):
   ```typescript
   eventBus.publish('homestead.created', {
     guildId: guild.id,
     userId: user.id,
     channelId: channel.id,
     timestamp: new Date(),
   });
   ```

---

## Phase 2: Security Integration

### 2.1: Audit Logging (ImmutableAuditService)

**Purpose:** SOC 2 compliant immutable audit trail for all homestead operations.

**Events Logged:**

| Event Type | Action | When Triggered |
|-----------|--------|----------------|
| **Creation** | `homestead.created` | Phase 1.6 (after successful creation) |
| **Verification** | `homestead.verified` | Phase 1.5 (security fingerprint generated) |
| **Permission Change** | `homestead.permissions.changed` | Phase 2.3 (Discord channel permissions modified) |
| **Cleanup** | `homestead.orphaned.cleanup` | Phase 4 (admin marks orphan as deleted) |

**Audit Entry Structure:**
```typescript
interface AuditEntry {
  sequence: number;        // Monotonic sequence number
  chainId: string;         // 'homestead-operations'
  timestamp: Date;
  action: string;          // Event type (kebab-case)
  actor: string;           // Who performed action (user ID or 'system')
  target: string;          // What was affected (channel ID or user ID)
  metadata: {
    guildId: string;
    userId: string;
    channelId: string;
    [key: string]: any;    // Event-specific context
  };
  previousHash: string;    // HMAC-SHA256 of previous entry
  entryHash: string;       // HMAC-SHA256 of this entry
}
```

**Chain Verification:**
- Each entry cryptographically linked to previous entry
- Tampering detection via hash chain validation
- Immutable append-only storage

**Example Audit Log:**
```json
{
  "sequence": 42,
  "chainId": "homestead-operations",
  "timestamp": "2025-12-06T17:30:00.000Z",
  "action": "homestead.created",
  "actor": "563220840708177927",
  "target": "1234567890123456789",
  "metadata": {
    "guildId": "1100976155579912222",
    "userId": "563220840708177927",
    "channelId": "1234567890123456789",
    "createdBy": "user"
  },
  "previousHash": "abc123...",
  "entryHash": "def456..."
}
```

---

### 2.2: Rate Limiting & Anomaly Detection

**Purpose:** Prevent abuse via mass homestead creation or rapid verification attempts.

**Rate Limits:**

| Action | Cooldown | Per | Enforcement |
|--------|----------|-----|-------------|
| **Create Homestead** | 5 minutes | User | User cannot create another homestead for 5 minutes |
| **Verify Homestead** | 1 minute | User | User cannot re-verify for 1 minute |
| **Admin Cleanup** | 30 seconds | Admin | Prevent accidental double-cleanup |

**Anomaly Detection:**

**Scenario 1: Mass Creation**
- **Trigger:** User attempts 5+ homestead creations in 10 minutes
- **Action:** Block creation, flag as anomaly
- **Alert:** Publish `homestead.anomaly.mass-creation` to EventBus
- **MITRE Mapping:** T1098 (Account Manipulation)

**Scenario 2: Rapid Verification**
- **Trigger:** User attempts 10+ verification calls in 5 minutes
- **Action:** Block verification, flag as anomaly
- **Alert:** Publish `homestead.anomaly.rapid-verification` to EventBus

**Implementation:**
```typescript
import { RateLimiter } from './rate-limiter.js';

const createLimiter = new RateLimiter({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  maxRequests: 1,
  keyGenerator: (user) => `homestead:create:${user.id}`,
});

// Before Phase 1.1
const allowed = await createLimiter.checkLimit(user.id);
if (!allowed) {
  throw new Error('RATE_LIMIT_EXCEEDED');
}
```

---

### 2.3: Permission Monitoring & Auto-Revert

**Purpose:** Detect unauthorized permission changes and automatically revert to secure state.

**Monitored Events:**

| Discord Event | Handler | Action |
|--------------|---------|--------|
| **channelUpdate** | `handleChannelUpdate()` | Compare permission overwrites, revert if unauthorized |
| **channelDelete** | `handleChannelDelete()` | Mark homestead as orphaned, alert admins |
| **roleUpdate** | `handleRoleUpdate()` | Check if role affects homestead permissions |
| **guildMemberUpdate** | `handleGuildMemberUpdate()` | Validate user still has access |

**Auto-Revert Logic:**

**Scenario 1: User Permission Removed**
- **Detection:** `channelUpdate` event, user's `ViewChannel` permission removed
- **Action:** Re-apply user permissions via `channel.permissionOverwrites.edit()`
- **Audit:** Log `homestead.permissions.reverted` to ImmutableAuditService
- **Alert:** DM DRIPTVDD with revert details

**Scenario 2: @everyone Permission Added**
- **Detection:** `channelUpdate` event, @everyone granted `ViewChannel`
- **Action:** Remove @everyone permission (restore private channel)
- **Audit:** Log `homestead.permissions.security-violation` with severity HIGH
- **Alert:** EventBus alert + DM DRIPTVDD

**Implementation:**
```typescript
client.on('channelUpdate', async (oldChannel, newChannel) => {
  // Only monitor homestead channels
  if (!newChannel.name.startsWith('homestead-')) return;

  const homestead = await prisma.homesteadChannel.findFirst({
    where: { channelId: newChannel.id }
  });

  if (!homestead) return;

  // Compare permission overwrites
  const userPerms = newChannel.permissionOverwrites.cache.get(homestead.userId);
  
  if (!userPerms || !userPerms.allow.has('ViewChannel')) {
    // Auto-revert: Restore user permissions
    await newChannel.permissionOverwrites.edit(homestead.userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });

    // Audit log
    await auditService.append({
      action: 'homestead.permissions.reverted',
      actor: 'security-monitor',
      target: homestead.userId,
      metadata: {
        channelId: newChannel.id,
        reason: 'user-permission-removed',
        autoReverted: true,
      }
    });
  }
});
```

**MITRE Mapping:** T1098.001 (Account Manipulation: Additional Cloud Credentials)

---

## Phase 3: Integrity Verification

### 3.1: Hourly Integrity Worker

**Purpose:** Automated detection of orphaned homesteads and ghost channels.

**Execution:** Render cron job (`0 */1 * * *` — every hour)

**Operations:**

**Step 1: Fetch Database Records**
```typescript
const dbHomesteads = await prisma.homesteadChannel.findMany({
  where: {
    guildId: guild.id,
    status: { in: ['active', 'suspended'] }
  }
});
```

**Step 2: Fetch Discord Channels**
```typescript
const discordChannels = guild.channels.cache.filter(
  c => c.name.startsWith('homestead-')
);
```

**Step 3: Detect Orphans** (DB but no Discord)
```typescript
const orphans = dbHomesteads.filter(h => 
  !discordChannels.has(h.channelId)
);
```

**Step 4: Detect Ghosts** (Discord but no DB)
```typescript
const ghosts = discordChannels.filter(c =>
  !dbHomesteads.some(h => h.channelId === c.id)
);
```

**Step 5: Calculate Issue Rate**
```typescript
const totalHomesteads = dbHomesteads.length;
const issueCount = orphans.length + ghosts.length;
const issueRate = (issueCount / totalHomesteads) * 100;
```

---

### 3.2: IntegrityReport Generation

**Purpose:** Generate JSON report for admin consumption and alerting.

**Report Structure:**
```typescript
interface IntegrityReport {
  timestamp: Date;
  guildId: string;
  totalHomesteads: number;
  verified: number;           // Has verifiedAt timestamp
  unverified: number;         // Missing verifiedAt
  orphans: number;            // DB but no Discord channel
  ghosts: number;             // Discord channel but no DB
  orphanList: Array<{
    id: string;               // Database record ID
    userId: string;
    channelId: string;        // Missing Discord channel ID
    createdAt: Date;
  }>;
  ghostList: Array<{
    id: string;               // Discord channel ID
    name: string;             // Channel name
    createdAt: Date;
  }>;
}
```

**Report File:**
```
Store/homestead-integrity/{guildId}-{timestamp}.json
```

**Example:**
```json
{
  "timestamp": "2025-12-06T17:00:00.000Z",
  "guildId": "123456789012345678",
  "totalHomesteads": 150,
  "verified": 145,
  "unverified": 2,
  "orphans": 2,
  "ghosts": 1,
  "orphanList": [
    {
      "id": "rec_orphan_1",
      "userId": "563220840708177927",
      "channelId": "1234567890123456789",
      "createdAt": "2025-12-01T10:00:00.000Z"
    }
  ],
  "ghostList": [
    {
      "id": "1234567890123456789",
      "name": "homestead-olduser",
      "createdAt": "2025-11-15T08:00:00.000Z"
    }
  ]
}
```

**Retention:** 24 hours (old reports auto-deleted by worker)

---

### 3.3: Alert Escalation

**Purpose:** Notify admins when issue rate exceeds threshold.

**Alert Trigger:** Issue rate ≥ 5%

**Alert Channels:**
1. EventBus: `homestead.integrity.critical-issues`
2. DM to DRIPTVDD (Discord ID: `563220840708177927`)
3. Error tracking system (if integrated)

**Alert Message:**
```
🚨 CRITICAL: Homestead Integrity Issues Detected

Guild: {guildName} ({guildId})
Total Homesteads: {total}
Issue Rate: {rate}% ({orphans} orphans + {ghosts} ghosts)

Orphans (DB but no channel): {orphans}
Ghosts (Channel but no DB): {ghosts}

Action Required:
/ops homestead:integrity {guildId}
/ops homestead:cleanup {guildId} dry_run:True

Report: Store/homestead-integrity/{guildId}-{timestamp}.json
```

---

## Phase 4: Admin Operations

### 4.1: Integrity Report Display

**Command:** `/ops homestead:integrity <guild_id>`

**Purpose:** Display latest IntegrityReport for operator review.

**Output:**
```
🏠 Homestead Integrity Report

📊 Summary:
   • Total Homesteads: 150
   • ✅ Verified: 145
   • ❓ Unverified: 2
   • 🚨 Orphans (DB but no channel): 2
   • 👻 Ghosts (Channel but no DB): 1
   • Issue Rate: 2.0% 🟢

🚨 Orphaned Channels (Top 5):
   1. User: 563220840708177927 | Channel: 1234567890123456789 | Created: 2025-12-01 10:00 AM EST
   2. User: 123456789012345678 | Channel: 9876543210987654321 | Created: 2025-12-02 02:30 PM EST

👻 Ghost Channels (Top 5):
   1. Name: homestead-olduser | ID: 1234567890123456789 | Created: 2025-11-15 08:00 AM EST

📄 Report: Store/homestead-integrity/123456789012345678-2025-12-06T17-00-00Z.json
ℹ️  To cleanup orphans: /ops homestead:cleanup 123456789012345678 dry_run:True
```

**Issue Rate Color Coding:**
- 🟢 Green: <2% (healthy)
- 🟡 Yellow: 2-5% (warning)
- 🔴 Red: >5% (critical)

---

### 4.2: Orphan Cleanup

**Command:** `/ops homestead:cleanup <guild_id> [dry_run:boolean]`

**Purpose:** Mark orphaned homesteads as deleted with audit logging.

**Dry-Run Mode (Preview):**
```
🧪 Cleanup Preview (DRY RUN)

📊 Results:
   • Orphans Found: 2
   • Would Mark Deleted: 2

🚨 Orphans to cleanup:
   1. User: 563220840708177927 | Channel: 1234567890123456789
   2. User: 123456789012345678 | Channel: 9876543210987654321

ℹ️  Run with dry_run:False to apply changes
```

**Live Mode (Execute):**
```
✅ Cleanup Complete

📊 Results:
   • Orphans Found: 2
   • Marked Deleted: 2
   • Failed: 0

🚨 Cleaned orphans:
   1. User: 563220840708177927 | Channel: 1234567890123456789 | ✅ Deleted
   2. User: 123456789012345678 | Channel: 9876543210987654321 | ✅ Deleted

📝 All cleanup actions logged to ImmutableAuditService
```

**Database Operation:**
```typescript
await prisma.homesteadChannel.update({
  where: { id: orphan.id },
  data: { status: 'deleted' }
});
```

**Why Soft Delete:**
- ✅ Preserves audit trail
- ✅ Enables orphan recovery if channel recreated
- ✅ Supports historical reporting
- ✅ Prevents UNIQUE constraint violations on future recreations

**Audit Logging:**
```typescript
await auditService.append({
  action: 'homestead.orphaned.cleanup',
  actor: 'ops-admin-command',
  target: orphan.userId,
  timestamp: new Date(),
  metadata: {
    orphanId: orphan.id,
    guildId: guildId,
    channelId: orphan.channelId,
    cleanupReason: 'orphaned-no-discord-channel',
    previousStatus: 'active',
    newStatus: 'deleted',
  }
});
```

---

## Monitoring & Observability

### Key Metrics

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| **Homestead Creation Rate** | Database inserts | >100/hour (anomaly) |
| **Orphan Rate** | IntegrityReport | >5% (critical) |
| **Ghost Rate** | IntegrityReport | >5% (critical) |
| **Verification Failures** | HomesteadVerificationService | >10/hour |
| **Permission Reverts** | Permission Monitor | >5/hour |
| **Audit Chain Integrity** | ImmutableAuditService | Any chain break |

### Logging

**Log Levels:**
- **INFO:** Successful homestead creation, verification
- **WARN:** Rate limit exceeded, unverified homestead
- **ERROR:** Creation failure, verification failure, permission revert failure
- **CRITICAL:** Audit chain break, >5% orphan rate

**Example Log Entry:**
```json
{
  "level": "INFO",
  "timestamp": "2025-12-06T17:30:00.000Z",
  "service": "homestead-verification",
  "action": "homestead.created",
  "userId": "563220840708177927",
  "guildId": "1100976155579912222",
  "channelId": "1234567890123456789",
  "duration": 1250,
  "status": "success"
}
```

### Health Checks

**Homestead System Health:**
```typescript
async function checkHomesteadHealth(): Promise<HealthStatus> {
  const [dbCount, latestReport] = await Promise.all([
    prisma.homesteadChannel.count({ where: { status: 'active' } }),
    getLatestIntegrityReport(guildId),
  ]);

  const issueRate = latestReport 
    ? ((latestReport.orphans + latestReport.ghosts) / latestReport.totalHomesteads) * 100
    : 0;

  return {
    status: issueRate < 2 ? 'healthy' : issueRate < 5 ? 'degraded' : 'unhealthy',
    activeHomesteads: dbCount,
    issueRate: issueRate,
    lastIntegrityCheck: latestReport?.timestamp,
  };
}
```

---

## Error Handling & Recovery

### Common Errors

**Error 1: DUPLICATE_HOMESTEAD**
- **Cause:** User already has active homestead
- **Recovery:** Direct user to existing homestead channel
- **Prevention:** Phase 1.1 duplicate check

**Error 2: INSUFFICIENT_PERMISSIONS**
- **Cause:** Bot lacks `MANAGE_CHANNELS` permission
- **Recovery:** Admin grants bot permission, user retries
- **Prevention:** Bot permission validation in Phase 1.1

**Error 3: VERIFICATION_FAILED_CHANNEL_NOT_FOUND**
- **Cause:** Discord channel deleted between creation and verification
- **Recovery:** Rollback database record, user retries
- **Prevention:** Atomic Phase 1.3 transaction

**Error 4: RATE_LIMIT_EXCEEDED**
- **Cause:** User attempted creation within cooldown period
- **Recovery:** Wait for cooldown expiry, user retries
- **Prevention:** Phase 2.2 rate limiting

**Error 5: ORPHAN_CLEANUP_FAILED**
- **Cause:** Database update failed during cleanup
- **Recovery:** Individual orphan errors logged, other orphans cleaned
- **Prevention:** Per-orphan error handling in cleanup logic

### Rollback Procedures

**Scenario 1: Phase 1.3 Failure (Database Insert Failed)**
- **Action:** Delete Discord channel created in Phase 1.2
- **Code:**
  ```typescript
  try {
    await prisma.homesteadChannel.create({...});
  } catch (err) {
    await channel.delete('Rollback: Database insert failed');
    throw err;
  }
  ```

**Scenario 2: Phase 1.4 Failure (Verification Failed)**
- **Action:** Delete Discord channel + database record
- **Code:**
  ```typescript
  try {
    const verified = await guild.channels.fetch(channel.id);
  } catch (err) {
    await channel.delete('Rollback: Verification failed');
    await prisma.homesteadChannel.delete({ where: { id: homestead.id } });
    throw err;
  }
  ```

---

## Security Considerations

### Threat Model

**Threat 1: Permission Escalation**
- **Attack:** User attempts to grant themselves `MANAGE_CHANNELS` via permission manipulation
- **Mitigation:** Phase 2.3 permission monitoring auto-reverts unauthorized changes
- **Detection:** `channelUpdate` event handler + permission comparison

**Threat 2: Mass Homestead Creation (DoS)**
- **Attack:** Attacker creates 1000+ homesteads to exhaust guild channel limit (500)
- **Mitigation:** Phase 2.2 rate limiting (1 per 5 minutes) + anomaly detection (5+ in 10 min)
- **Detection:** Rate limiter + EventBus alert

**Threat 3: Security Fingerprint Tampering**
- **Attack:** Attacker modifies `securityFingerprint` field in database to bypass integrity checks
- **Mitigation:** HMAC-SHA256 signature verification (secret key not exposed)
- **Detection:** Fingerprint mismatch during integrity verification

**Threat 4: Orphan Exploitation**
- **Attack:** Attacker deletes Discord channel but keeps database record to claim "active" homestead
- **Mitigation:** Phase 3 hourly integrity worker detects orphans, admin cleanup marks as deleted
- **Detection:** IntegrityReport orphan detection

### MITRE ATT&CK Mapping

| MITRE Technique | Attack Description | Mitigation |
|----------------|-------------------|------------|
| **T1098** | Account Manipulation | Rate limiting, anomaly detection, audit logging |
| **T1098.001** | Additional Cloud Credentials | Permission monitoring, auto-revert, security fingerprints |

### Environment Variables (Security Critical)

| Variable | Purpose | Security Level | Example |
|----------|---------|----------------|---------|
| **HOMESTEAD_HMAC_KEY** | Security fingerprint generation | HIGH | `generate-strong-random-key-min-32-chars` |
| **AUDIT_HMAC_SECRET** | Audit chain verification | CRITICAL | `generate-strong-random-key-min-32-chars` |

**Key Requirements:**
- ✅ Minimum 32 characters
- ✅ Cryptographically random (use `openssl rand -hex 32`)
- ✅ Never commit to version control
- ✅ Rotate quarterly in production

---

## Summary

This document provides the **complete operational reference** for the homestead security system:

1. **5-Phase Creation Flow** — Atomic operations with rollback
2. **3-Layer Security Integration** — Audit logging, rate limiting, permission monitoring
3. **Hourly Integrity Verification** — Automated orphan/ghost detection
4. **2-Command Admin Interface** — Integrity reports and cleanup

**Key Operational Principles:**
- ✅ **Atomic Operations:** All changes succeed or fail as a unit
- ✅ **Continuous Monitoring:** Hourly integrity checks, real-time permission monitoring
- ✅ **Audit Trail:** SOC 2 compliant immutable logging for all operations
- ✅ **Self-Healing:** Auto-revert unauthorized permission changes
- ✅ **Admin Visibility:** JSON reports + CLI commands for operator control

**Next Steps:**
- See `homestead-troubleshooting.md` for error scenarios and remediation
- See `homestead-deployment-checklist.md` for production deployment procedures

---

**Document Ownership:** Operations Team  
**Review Cadence:** Quarterly or after major system changes  
**Related Documents:**
- `homestead-troubleshooting.md` — Error scenarios and remediation
- `homestead-deployment-checklist.md` — Production deployment procedures
- `docs/architecture-bible/complete-system-architecture.md` — System design reference
