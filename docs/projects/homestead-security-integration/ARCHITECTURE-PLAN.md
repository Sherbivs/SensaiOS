# Homestead Channel Security Integration — Architecture Plan

**Project:** Guild-Wide Homestead Channel System with Security Verification  
**Owner:** Architecture Specialist + Security Specialist  
**Created:** 2025-12-06  
**Status:** 🎯 PLANNING

---

## 🎯 Executive Summary

**Problem:** The test script (`init-driptvdd-test.ts`) creates Discord channels but doesn't:
1. ❌ Record creation in database (`HomesteadChannel` table exists but unused)
2. ❌ Verify creation succeeded (no integrity checks)
3. ❌ Integrate with security bot (no heuristic detection)
4. ❌ Provide rollback on failure (orphaned channels possible)

**Solution:** Build a **verified channel creation service** that:
1. ✅ Creates Discord channel with permissions
2. ✅ Records in database with security fingerprint
3. ✅ Verifies creation success (Discord + DB consistency)
4. ✅ Logs to security system (audit trail + anomaly detection)
5. ✅ Rolls back on failure (no orphaned resources)

---

## 📋 Current State Analysis

### Existing Database Schema (`HomesteadChannel`)
```prisma
model HomesteadChannel {
  id             String   @id @default(cuid())
  userId         String   @unique          // Discord user ID
  guildId        String                     // Discord guild ID
  channelId      String   @unique          // Discord channel ID
  createdAt      DateTime @default(now())
  lastAccessedAt DateTime @updatedAt
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([guildId])
  @@index([channelId])
  @@map("homestead_channels")
}
```

**✅ GOOD:** Schema exists with basic tracking  
**❌ GAPS:**
- No `verifiedAt` timestamp (creation vs verification)
- No `securityFingerprint` (HMAC signature for integrity)
- No `createdBy` (who triggered creation: user, admin, bot)
- No `lastHealthCheck` (periodic verification)
- No `status` field (active, suspended, orphaned, deleted)

### Existing Security System Components

**Security Bot (`src/bot/main.js`):**
- ✅ Role/permission monitoring (40+ event handlers)
- ✅ Threat detection (`threatDetector.js` — 5 MITRE ATT&CK patterns)
- ✅ State persistence (7-day history in `/Store/security-bot-state/`)
- ✅ Alert routing (DM notifications to DRIPTVDD)
- ✅ Immutable audit trail (`SecurityEvent` model with hash chains)

**Security Services:**
- `ImmutableAuditService` — Hash-chained audit logs (HMAC-256)
- `RoleAuditService` — Role change tracking with anomaly detection
- `PermissionResolverService` — Guild permission hierarchy resolution
- `ContinuousAggregatesService` — Real-time metrics (5min/1h/1d windows)

**Integration Points:**
- `EventBus` — Pub-sub for security events (`role.change`, `permission.change`, `alert.critical`)
- `SecurityPlugin` system — Extensible security checks (priority-based chain)
- `ThreatDetector` — Behavioral baseline comparison (rapid changes, unusual origins, mass removal)

---

## 🏗️ Proposed Architecture

### Phase 1: Enhanced Database Schema

**Migration:** Add security verification fields to `HomesteadChannel`

```prisma
model HomesteadChannel {
  id                  String   @id @default(cuid())
  userId              String   @unique
  guildId             String
  channelId           String   @unique
  createdAt           DateTime @default(now())
  verifiedAt          DateTime?              // NULL until Discord verification succeeds
  createdBy           String                 // "user", "admin", "bot-auto-onboard"
  securityFingerprint String?                // HMAC-SHA256(userId|guildId|channelId|createdAt)
  lastHealthCheck     DateTime?              // Last periodic integrity check
  status              String   @default("active") // "active", "suspended", "orphaned", "deleted"
  lastAccessedAt      DateTime @updatedAt
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([guildId])
  @@index([channelId])
  @@index([status])                          // Query by status for cleanup
  @@index([verifiedAt])                      // Find unverified channels
  @@map("homestead_channels")
}
```

**New Fields Explained:**
- `verifiedAt` — Timestamp when Discord confirmed channel exists (NULL = creation failed or pending)
- `createdBy` — Audit trail: who/what triggered creation (user command, admin, bot auto-onboard)
- `securityFingerprint` — HMAC signature to detect tampering (integrates with `ImmutableAuditService`)
- `lastHealthCheck` — Periodic verification that channel still exists in Discord (detect orphans)
- `status` — Lifecycle state for automated cleanup and suspension workflows

### Phase 2: Verified Channel Creation Service

**Service:** `HomesteadVerificationService` (`src/services/homestead-verification.ts`)

**Responsibilities:**
1. **Pre-Flight Checks** (before Discord API call):
   - Validate user exists in database
   - Check if homestead already exists (prevent duplicates)
   - Verify guild permissions (bot can create channels)
   - Rate limit check (prevent abuse)

2. **Discord Channel Creation**:
   - Create channel with proper permissions (private to user + bot)
   - Set up category (Homesteads)
   - Configure rate limits, slowmode, etc.

3. **Database Recording** (atomic transaction):
   - Insert `HomesteadChannel` record
   - Generate security fingerprint (HMAC)
   - Log to `SecurityEvent` (immutable audit)

4. **Verification Phase**:
   - Query Discord API to confirm channel exists
   - Update `verifiedAt` timestamp
   - Emit `homestead.verified` event to EventBus

5. **Rollback on Failure**:
   - Delete Discord channel if DB insert fails
   - Delete DB record if Discord creation fails
   - Log failure to security system (anomaly detection)

**Code Structure:**
```typescript
export class HomesteadVerificationService {
  constructor(
    private readonly discordClient: Client,
    private readonly auditService: ImmutableAuditService,
    private readonly eventBus: EventBus
  ) {}

  async createVerifiedHomestead(
    user: User,
    guild: Guild,
    options: HomesteadCreationOptions
  ): Promise<VerifiedHomesteadResult> {
    // Phase 1: Pre-flight checks
    await this.validatePrerequisites(user, guild);
    
    // Phase 2: Discord channel creation
    const discordChannel = await this.createDiscordChannel(user, guild, options);
    
    try {
      // Phase 3: Database recording (transaction)
      const dbRecord = await this.recordInDatabase(user, guild, discordChannel);
      
      // Phase 4: Verification
      await this.verifyCreation(discordChannel, dbRecord);
      
      // Phase 5: Security logging
      await this.logToSecuritySystem(user, guild, discordChannel, dbRecord);
      
      return { success: true, channel: discordChannel, record: dbRecord };
      
    } catch (error) {
      // Rollback: Delete Discord channel if DB failed
      await this.rollback(discordChannel, error);
      throw error;
    }
  }
  
  // Periodic health check (cron job)
  async verifyIntegrity(guildId: string): Promise<IntegrityReport> {
    // 1. Find all homesteads in DB for guild
    // 2. Check if channels exist in Discord
    // 3. Detect orphans (DB exists, Discord missing)
    // 4. Detect ghosts (Discord exists, DB missing)
    // 5. Update lastHealthCheck timestamps
    // 6. Generate report for /ops command
  }
}
```

### Phase 3: Security Integration Points

**Integration 1: Immutable Audit Trail**

Every homestead creation logs to `SecurityEvent`:

```typescript
await auditService.append({
  action: 'homestead.created',
  actor: user.id,
  target: channel.id,
  metadata: {
    guildId: guild.id,
    userId: user.id,
    channelId: channel.id,
    channelName: channel.name,
    createdBy: 'user-command', // or 'bot-auto-onboard'
    permissions: channel.permissionOverwrites.toJSON(),
    securityFingerprint: fingerprint,
  },
});
```

**Integration 2: Anomaly Detection**

Homestead creation triggers heuristic checks:

```typescript
// Detect mass homestead creation (bot compromise)
const recentCreations = await prisma.homesteadChannel.count({
  where: {
    guildId: guild.id,
    createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } // Last 5 minutes
  }
});

if (recentCreations > 10) {
  // Emit threat event
  eventBus.emit('threat.detected', {
    type: 'mass-homestead-creation',
    severity: 'HIGH',
    evidence: {
      count: recentCreations,
      threshold: 10,
      guildId: guild.id,
      timeWindow: '5min'
    },
    recommendedAction: 'SUSPEND_CREATION + DRIP_ALERT'
  });
}
```

**Integration 3: Permission Monitoring**

Security bot monitors homestead channel permissions:

```typescript
// Add to security bot event handlers
client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  // Check if this is a homestead channel
  const homestead = await prisma.homesteadChannel.findUnique({
    where: { channelId: newChannel.id }
  });
  
  if (!homestead) return;
  
  // Verify permissions haven't been tampered with
  const expectedPermissions = getHomesteadPermissions(homestead.userId, client.user.id);
  const actualPermissions = newChannel.permissionOverwrites.cache;
  
  if (!permissionsMatch(expectedPermissions, actualPermissions)) {
    // Emit permission drift event
    eventBus.emit('permission.drift.detected', {
      channelId: newChannel.id,
      userId: homestead.userId,
      expected: expectedPermissions,
      actual: actualPermissions
    });
    
    // Auto-revert (if authorized)
    await revertPermissions(newChannel, expectedPermissions);
  }
});
```

**Integration 4: Periodic Integrity Checks**

Cron job (hourly) verifies all homesteads:

```typescript
// Add to worker/homestead-integrity.ts
export async function runIntegrityCheck(guildId: string): Promise<IntegrityReport> {
  const dbHomesteads = await prisma.homesteadChannel.findMany({
    where: { guildId, status: 'active' }
  });
  
  const guild = await client.guilds.fetch(guildId);
  const discordChannels = guild.channels.cache;
  
  const orphans: HomesteadChannel[] = [];
  const ghosts: GuildChannel[] = [];
  
  // Detect orphans (DB exists, Discord missing)
  for (const homestead of dbHomesteads) {
    const discordChannel = discordChannels.get(homestead.channelId);
    if (!discordChannel) {
      orphans.push(homestead);
      await prisma.homesteadChannel.update({
        where: { id: homestead.id },
        data: { status: 'orphaned' }
      });
    } else {
      // Update last health check
      await prisma.homesteadChannel.update({
        where: { id: homestead.id },
        data: { lastHealthCheck: new Date() }
      });
    }
  }
  
  // Detect ghosts (Discord exists, DB missing)
  const homesteadChannels = discordChannels.filter(ch => 
    ch.name.startsWith('homestead-') && ch.parent?.name === 'Homesteads'
  );
  
  for (const channel of homesteadChannels.values()) {
    const dbRecord = await prisma.homesteadChannel.findUnique({
      where: { channelId: channel.id }
    });
    if (!dbRecord) {
      ghosts.push(channel);
    }
  }
  
  return {
    timestamp: new Date(),
    guildId,
    totalHomesteads: dbHomesteads.length,
    verified: dbHomesteads.length - orphans.length,
    orphans: orphans.length,
    ghosts: ghosts.length,
    orphanList: orphans,
    ghostList: ghosts
  };
}
```

### Phase 4: Admin Operations Commands

**Command:** `/ops homestead:integrity <guild_id>`

Shows integrity report:
```
🔍 Homestead Integrity Report
Guild: Black Infinity Gauntlet (1100976155579912222)
Timestamp: 2025-12-06 22:45:00 UTC

✅ Total Homesteads: 247
✅ Verified: 245 (99.2%)
⚠️  Orphans: 2 (DB exists, Discord missing)
   - homestead-olduser (User left guild)
   - homestead-deleteduser (User deleted account)
⚠️  Ghosts: 0 (Discord exists, DB missing)

📊 Last Health Check: 15 minutes ago
🔐 Security Fingerprints: All valid
```

**Command:** `/ops homestead:cleanup <guild_id> [--dry-run]`

Cleans up orphaned homesteads:
```
🧹 Homestead Cleanup
Guild: Black Infinity Gauntlet

Dry Run: YES
━━━━━━━━━━━━━━━━━━━━━━
Orphans Found: 2

1. homestead-olduser (ID: abc123)
   User: olduser#1234 (Left guild 30 days ago)
   Action: Mark as deleted, archive DB record
   
2. homestead-deleteduser (ID: def456)
   User: deleteduser#5678 (Account deleted)
   Action: Mark as deleted, archive DB record

Run without --dry-run to execute cleanup.
```

---

## 🔒 Security Guarantees

### 1. **Atomic Operations**
- Database writes wrapped in transactions
- Rollback on Discord API failure
- No orphaned resources (channels or DB records)

### 2. **Immutable Audit Trail**
- Every creation logged to `SecurityEvent`
- HMAC signatures prevent tampering
- Hash chain ensures chronological integrity

### 3. **Anomaly Detection**
- Rate limiting (prevent mass creation)
- Heuristic checks (unusual patterns)
- MITRE ATT&CK mapping (T1098 - Account Manipulation)

### 4. **Permission Integrity**
- Security bot monitors permission changes
- Auto-revert unauthorized modifications
- Periodic verification (hourly health checks)

### 5. **Graceful Degradation**
- Verification failures don't block gameplay
- Unverified channels flagged for review
- Manual admin intervention available

---

## 📊 Success Metrics

### Phase 1: Database Schema
- ✅ Migration applied successfully
- ✅ All existing homesteads backfilled (0 NULL fingerprints)
- ✅ Indexes created (query performance <50ms)

### Phase 2: Verification Service
- ✅ 100% verification success rate
- ✅ <2 second end-to-end creation time
- ✅ Zero orphaned channels (rollback works)
- ✅ Security logging <10ms overhead

### Phase 3: Security Integration
- ✅ Threat detection active (mass creation alerts)
- ✅ Permission drift auto-revert (0% tampering)
- ✅ Integrity checks run hourly (99.9% uptime)

### Phase 4: Admin Operations
- ✅ `/ops homestead:integrity` <1 second response
- ✅ Orphan detection 100% accurate
- ✅ Cleanup automation zero false positives

---

## 🚀 Implementation Phases

### Phase 1: Schema & Migration (Day 1)
**Owner:** Database Specialist  
**Effort:** 2-3 hours

- [ ] Design schema updates (add 5 new fields)
- [ ] Write Prisma migration
- [ ] Backfill existing records (generate fingerprints)
- [ ] Test migration on ONPREMISE-DEV-PRIMARY
- [ ] Apply to CLOUD-PROD-MASTER

### Phase 2: Verification Service (Days 2-3)
**Owner:** AI Coding Specialist + Security Specialist  
**Effort:** 8-12 hours

- [ ] Create `HomesteadVerificationService` class
- [ ] Implement pre-flight validation
- [ ] Implement Discord channel creation
- [ ] Implement database recording (transaction)
- [ ] Implement verification phase
- [ ] Implement rollback logic
- [ ] Write unit tests (50+ test cases)
- [ ] Write integration tests (full flow)

### Phase 3: Security Integration (Days 4-5)
**Owner:** Security Specialist  
**Effort:** 6-8 hours

- [ ] Integrate with `ImmutableAuditService`
- [ ] Add anomaly detection (mass creation)
- [ ] Add permission monitoring (drift detection)
- [ ] Add periodic integrity checks (cron job)
- [ ] Update security bot event handlers
- [ ] Test threat detection scenarios
- [ ] Document MITRE ATT&CK mappings

### Phase 4: Admin Operations (Day 6)
**Owner:** AI Coding Specialist + Documentation Specialist  
**Effort:** 4-6 hours

- [ ] Create `/ops homestead:integrity` command
- [ ] Create `/ops homestead:cleanup` command
- [ ] Add dry-run mode (safety)
- [ ] Generate integrity reports
- [ ] Document admin workflows
- [ ] Update Operations Bible

### Phase 5: Testing & Rollout (Day 7)
**Owner:** Testing Specialist  
**Effort:** 6-8 hours

- [ ] End-to-end testing (create 10+ homesteads)
- [ ] Load testing (50+ concurrent creations)
- [ ] Failure scenario testing (Discord API errors)
- [ ] Security scenario testing (tampering attempts)
- [ ] DRIPTVDD production test (verify with CEO)
- [ ] Gradual rollout (10%, 50%, 100%)

---

## 🎯 Next Steps

1. **Architecture Review** — Team review this plan (30 min)
2. **Database Schema Approval** — Finalize 5 new fields
3. **Security Integration Design** — Map all EventBus events
4. **Implementation Kickoff** — Assign Phase 1 tasks

---

**Does this architecture make sense? Key questions:**

1. ✅ **Database Schema:** Are the 5 new fields comprehensive?
2. ✅ **Security Integration:** Are all security bot touchpoints identified?
3. ✅ **Verification Logic:** Is the atomic transaction pattern sound?
4. ✅ **Admin Operations:** Do the `/ops` commands cover all scenarios?
5. ✅ **Rollout Strategy:** Is gradual rollout (10/50/100%) appropriate?

**Ready to proceed with Phase 1 (Database Schema)?** 🚀
