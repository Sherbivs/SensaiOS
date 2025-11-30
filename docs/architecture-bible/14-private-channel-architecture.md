# Private Channel Architecture — Discord Guild Homestead Design

**Status:** Architecture specification (implementation planned)  
**Created:** 2025-11-21  
**Last Updated:** 2025-11-21  
**Version:** 1.0  
**Cross-References:**
- See `src/bot/dm/ROUTER.md` for current DM-based implementation (to be migrated)
- See `operations-bible/02-database-operations.md` for database persistence patterns
- See `architecture-bible/02-discord-bot-layer.md` for Discord interaction patterns

---

## Executive Summary

**Problem:** Current architecture uses Discord Direct Messages (DMs) for private gameplay (home views, healing, starter selection, battle notifications, wild encounters). This creates UX friction (DM delivery failures, permissions issues, difficult moderation) and technical constraints (cannot be moderated by guild admins, no audit trail).

**Solution:** Migrate to **private guild channels** where each user has their own channel within the Discord guild for private gameplay. This provides:
- ✅ Guild admin visibility and moderation capability
- ✅ Audit trail for moderation/support
- ✅ No DM permission requirements
- ✅ Consistent Discord patterns (channels, not DMs)
- ✅ Better error handling (no silent DM failures)

**Impact:** Major refactor affecting 10 DM call sites, 4 dedicated DM modules, and 6 feature areas (home, healing, starters, battles, wilds, profiles).

---

## 1. Architecture Overview

### 1.1 Channel Lifecycle

```
User First Interaction → getOrCreateHomesteadChannel()
                         ↓
                 Channel Exists?
                 ├─ YES → Return existing channel
                 └─ NO  → Create channel flow:
                          1. Check database for mapping
                          2. If not found, create channel
                          3. Set permissions (user-only + bot)
                          4. Store mapping in database
                          5. Return channel
```

### 1.2 Channel Naming Convention

**Pattern:** `homestead-{username}`

**Examples:**
- User "DripTVDD" → Channel: `homestead-driptvdd`
- User "Trainer123" → Channel: `homestead-trainer123`

**Rationale:**
- **Lowercase username:** Discord channel names must be lowercase, no spaces
- **Prefix "homestead-":** Clear purpose identification for admins
- **Username (not userId):** Human-readable for moderation, collision-resistant via Discord uniqueness

**Collision Handling:**
- If username changes, channel name stays the same (persisted by channel ID)
- If username contains special characters, sanitize to lowercase alphanumeric + hyphens
- Maximum length: 100 characters (Discord channel name limit)

### 1.3 Channel Category Organization

**Category Name:** `Homesteads` (or configurable via guild settings)

**Purpose:**
- Groups all homestead channels together
- Provides consistent permissions structure
- Allows bulk management by admins

**Category Permissions:**
- **Default:** No access (deny @everyone)
- **Per-channel overrides:** User-specific allow + bot allow

---

## 2. Database Schema

### 2.1 New Table: `HomesteadChannel`

```prisma
model HomesteadChannel {
  id              String   @id @default(cuid())
  userId          String   @unique
  guildId         String
  channelId       String   @unique
  createdAt       DateTime @default(now())
  lastAccessedAt  DateTime @updatedAt
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([guildId])
  @@index([channelId])
}
```

**Indexes:**
- `userId` (unique) — Fast lookup by user
- `channelId` (unique) — Fast lookup by channel for event handlers
- `guildId` (non-unique) — Bulk queries per guild (admin tools)

### 2.2 Schema Migration Plan

**Phase 1:** Add `HomesteadChannel` table
- Migration: `prisma/migrations/YYYYMMDDHHMMSS_add_homestead_channel/migration.sql`
- Prisma schema update: Add model to `schema.prisma`
- Regenerate client: `npx prisma generate`

**Phase 2:** Backfill existing users (optional)
- Script: `scripts/backfill_homestead_channels.ts`
- Process: For each user with pokemon, create channel + mapping
- Safety: Dry-run mode, progress tracking, rollback support

---

## 3. Service Architecture

### 3.1 Homestead Channel Manager

**File:** `src/services/homestead-channel-manager.ts`

**Responsibilities:**
- Channel creation with proper permissions
- Database mapping persistence
- Channel lookup (by user, by channel ID)
- Channel cleanup (inactive channels, departed users)
- Error handling and fallbacks

**Key Methods:**

```typescript
export class HomesteadChannelManager {
  // Primary API
  async getOrCreateChannel(userId: string, guildId: string): Promise<TextChannel>
  
  // Lookup operations
  async getChannelByUserId(userId: string): Promise<TextChannel | null>
  async getUserByChannelId(channelId: string): Promise<User | null>
  
  // Lifecycle management
  async createChannel(userId: string, guildId: string): Promise<TextChannel>
  async deleteChannel(channelId: string): Promise<void>
  
  // Maintenance
  async cleanupInactiveChannels(guildId: string, daysInactive: number): Promise<number>
  async syncMissingChannels(guildId: string): Promise<SyncResult>
}
```

### 3.2 Permission Structure

**Channel Permissions (per homestead):**
```typescript
{
  permissionOverwrites: [
    {
      id: guildId,             // @everyone role
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: userId,              // Specific user
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.UseApplicationCommands,
      ],
    },
    {
      id: client.user.id,      // Bot
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    },
  ],
}
```

**Admin Visibility (optional enhancement):**
- Guild admins can optionally be granted ViewChannel permission via guild config
- Default: Admins cannot see channels (fully private)
- Config option: `HOMESTEAD_ADMIN_VISIBILITY` (boolean)

---

## 4. Migration Strategy

### 4.1 Code Migration Phases

**Phase A: Foundation (Week 1)**
- Create `HomesteadChannelManager` service
- Add database schema + migration
- Implement channel creation/lookup logic
- Write unit tests (channel creation, permissions, lookup)

**Phase B: DM Module Migration (Week 2)**
- Migrate `src/bot/dm/home.ts` → `src/bot/homestead/home.ts`
  - Replace `user.createDM()` with `channelManager.getOrCreateChannel()`
  - Update all view rendering to use channels instead of DMs
  - Test: home views, box pagination, profile display
- Migrate `src/bot/dm/heal.ts` → `src/bot/homestead/heal.ts`
  - Replace DM interaction with channel interaction
  - Test: healing confirmation, party updates
- Migrate `src/bot/dm/starters.ts` → `src/bot/homestead/starters.ts`
  - Replace DM starter flow with channel starter flow
  - Test: starter selection, party assignment

**Phase C: Feature Integration (Week 3)**
- Update battle challenge notifications (2 call sites)
- Update battle action delivery (2 call sites)
- Update battle conclusion messages (1 call site)
- Update wild encounter spawns (1 call site)
- Update home/profile commands (2 call sites)

**Phase D: Testing & Cleanup (Week 4)**
- Integration tests for all features
- Channel cleanup automation (inactive channels)
- Database backfill script for existing users
- Documentation updates
- Remove deprecated DM modules

### 4.2 Backward Compatibility Strategy

**Option 1: Hard Cutover (Recommended)**
- Set cutover date
- Announce to users 1 week in advance
- Deploy all changes at once
- DM modules immediately deprecated
- Users see "Use your homestead channel" message if DM attempted

**Option 2: Gradual Migration (Complex)**
- Feature flag: `USE_HOMESTEAD_CHANNELS` (per guild or global)
- Dual support: DM + channel flows both operational
- Gradual rollout by guild
- Sunset DM support after 30 days

**Recommendation:** Hard cutover (Option 1) for simplicity and clean codebase.

---

## 5. Error Handling & Edge Cases

### 5.1 Channel Creation Failures

**Scenario:** Discord API error during channel creation

**Handling:**
```typescript
try {
  channel = await guild.channels.create({ ... });
} catch (error) {
  if (error.code === 50013) { // Missing Permissions
    throw new HomesteadError('Bot lacks MANAGE_CHANNELS permission in this guild', 'MISSING_PERMISSIONS');
  }
  if (error.code === 30013) { // Maximum Channels Reached (500 limit)
    throw new HomesteadError('Guild has reached Discord channel limit', 'GUILD_CHANNEL_LIMIT');
  }
  // Fallback: Ephemeral message + retry guidance
  await interaction.reply({
    content: 'Failed to create your homestead channel. Please try again later.',
    ephemeral: true,
  });
}
```

### 5.2 Channel Deleted By User/Admin

**Scenario:** User/admin manually deletes homestead channel

**Detection:**
- Discord `channelDelete` event listener
- Check if deleted channel is a homestead (via database lookup)

**Handling:**
```typescript
client.on('channelDelete', async (channel) => {
  const mapping = await db.homesteadChannel.findUnique({ where: { channelId: channel.id } });
  if (mapping) {
    await db.homesteadChannel.delete({ where: { id: mapping.id } });
    // Optional: Notify user that next interaction will recreate channel
  }
});
```

**Next Interaction:** `getOrCreateChannel()` will recreate channel + mapping automatically.

### 5.3 User Leaves Guild

**Scenario:** User leaves guild, homestead channel becomes orphaned

**Cleanup Strategy:**
- Cron job (daily): Detect orphaned channels via guild member list
- Delete channels where user no longer in guild
- Remove database mappings

**Implementation:**
```typescript
// Daily cleanup task
async function cleanupOrphanedChannels(guildId: string) {
  const guild = await client.guilds.fetch(guildId);
  // Force fresh member list to ensure accurate cleanup decisions
  const members = await guild.members.fetch({ force: true });
  
  const channels = await db.homesteadChannel.findMany({ where: { guildId } });
  for (const mapping of channels) {
    if (!members.has(mapping.userId)) {
      await guild.channels.delete(mapping.channelId);
      await db.homesteadChannel.delete({ where: { id: mapping.id } });
    }
  }
}
```

### 5.4 Username Changes

**Scenario:** User changes Discord username

**Handling:**
- Channel name stays the same (channel ID persists)
- Optional enhancement: Rename channel to match new username
- Implementation: Discord `guildMemberUpdate` event listener

### 5.5 Bot Permission Loss

**Scenario:** Admin removes bot's MANAGE_CHANNELS permission

**Detection:**
- Try channel creation → catch 50013 error
- Periodic permission audit (optional)

**Handling:**
- Graceful degradation: Fallback to ephemeral replies
- Admin notification: Post alert in system channel
- User notification: "Bot lacks permissions, contact admin"

---

## 6. Testing Strategy

### 6.1 Unit Tests

**Service Tests:** `tests/services/homestead-channel-manager.spec.ts`
- Channel creation with correct permissions
- Database mapping persistence
- Lookup operations (by user, by channel)
- Error handling (missing permissions, channel limit)

**Migration Tests:** `tests/homestead/migration.spec.ts`
- DM → Channel conversion accuracy
- View rendering consistency
- Button interaction flows

### 6.2 Integration Tests

**Feature Tests:** `tests/homestead/features.spec.ts`
- Home view → box → party navigation
- Healing flow start to finish
- Starter selection complete flow
- Battle challenge delivery
- Wild encounter spawn

### 6.3 E2E Tests (Manual)

**Checklist:**
- [ ] Fresh user: `/starter` → homestead channel created
- [ ] Home view: `/home` → displays in homestead channel
- [ ] Healing: Heal button → confirms in homestead
- [ ] Profile: `/profile` → renders in homestead
- [ ] Battle challenge: User A challenges User B → notifications in both homesteads
- [ ] Wild encounter: `/walk` → Pokemon spawns in homestead
- [ ] Channel deletion: Admin deletes channel → next interaction recreates
- [ ] Permission loss: Remove bot permissions → graceful error message
- [ ] Guild leave: User leaves → channel cleaned up within 24h

---

## 7. Performance Considerations

### 7.1 Database Queries

**Optimization:**
- Index on `userId` (unique) for fast user lookups
- Index on `channelId` (unique) for fast event handling
- Index on `guildId` for bulk operations

**Expected Query Load:**
- **Reads:** ~10-50/minute (per guild, depends on activity)
- **Writes:** ~1-5/minute (new users, first interactions)

### 7.2 Discord API Rate Limits

**Channel Creation:**
- Discord limit: 50 channels/minute per guild
- Mitigation: Unlikely to hit (gradual user onboarding)

**Permission Updates:**
- Limit: 10 permission updates/10 seconds per channel
- Mitigation: Permissions set once at creation

### 7.3 Memory Footprint

**In-Memory Caching (optional enhancement):**
- LRU cache: userId → channelId mapping
- Size: 1000 entries (~50 KB)
- TTL: 1 hour
- Benefit: Reduce database queries for frequent interactions

---

## 8. Monitoring & Observability

### 8.1 Metrics

**Channel Manager Metrics:**
- `homestead.channel.created` (counter) — Channels created
- `homestead.channel.lookups` (counter) — Database lookups
- `homestead.channel.cache_hits` (counter) — Cache hits (if implemented)
- `homestead.channel.errors` (counter, labeled by error type) — Creation failures

**Error Categories:**
- `MISSING_PERMISSIONS` — Bot lacks MANAGE_CHANNELS
- `CHANNEL_LIMIT_REACHED` — Guild at 500 channel limit
- `DATABASE_ERROR` — Persistence failures
- `DISCORD_API_ERROR` — General API errors

### 8.2 Logging

**Log Events:**
- Channel creation: `INFO` with userId, guildId, channelId
- Channel deletion (cleanup): `INFO` with reason (orphaned/inactive)
- Errors: `WARN` or `ERROR` with full context + stack trace

**Example Log:**
```json
{
  "level": "INFO",
  "timestamp": "2025-11-21T12:00:00Z",
  "category": "homestead",
  "event": "channel_created",
  "userId": "123456789",
  "guildId": "987654321",
  "channelId": "555666777",
  "channelName": "homestead-driptvdd"
}
```

### 8.3 Admin Commands

**`/ops homestead` Command:**
- Show guild homestead stats (total channels, active users, orphaned channels)
- Trigger cleanup manually
- List recent channels created
- Display error rate

---

## 9. Configuration

### 9.1 Environment Variables

```bash
# Channel naming
HOMESTEAD_CHANNEL_PREFIX="homestead-"        # Default: "homestead-"
HOMESTEAD_CATEGORY_NAME="Homesteads"         # Default: "Homesteads"

# Permissions
HOMESTEAD_ADMIN_VISIBILITY=false             # Allow guild admins to view channels

# Cleanup
HOMESTEAD_CLEANUP_DAYS_INACTIVE=30           # Delete channels inactive >30 days
HOMESTEAD_CLEANUP_ENABLED=true               # Enable automatic cleanup
```

### 9.2 Guild-Specific Config (future enhancement)

**Database Table:** `GuildSettings`
```prisma
model GuildSettings {
  guildId                    String  @id
  homesteadChannelPrefix     String  @default("homestead-")
  homesteadCategoryName      String  @default("Homesteads")
  homesteadAdminVisibility   Boolean @default(false)
  homesteadCleanupDays       Int     @default(30)
  homesteadEnabled           Boolean @default(true)
}
```

---

## 10. Security Considerations

### 10.1 Permission Isolation

**Threat:** User gains unauthorized access to another user's homestead

**Mitigation:**
- Explicit permission overwrites per channel (deny @everyone, allow user + bot)
- No role-based access (prevents accidental permission leaks)
- Audit: Periodic permission scan to detect drift

### 10.2 Channel Name Collisions

**Threat:** Malicious username change creates collision

**Mitigation:**
- Channel ID is canonical identifier (not channel name)
- Database mapping uses `channelId` (unique)
- Username changes don't affect functionality

### 10.3 Database Consistency

**Threat:** Channel exists in Discord but not in database (or vice versa)

**Mitigation:**
- Sync script: `scripts/sync_homestead_channels.ts`
- Detects orphaned channels (Discord but not DB)
- Detects orphaned mappings (DB but not Discord)
- Reconciliation: Delete orphans, recreate missing

---

## 11. Rollout Plan

### 11.1 Pre-Deployment Checklist

- [ ] Database migration tested on ONPREMISE-DEV-PRIMARY
- [ ] Service unit tests passing (100% coverage target)
- [ ] Integration tests passing
- [ ] Manual E2E testing complete
- [ ] Documentation updated (this document + ROUTER.md)
- [ ] Admin notification prepared
- [ ] User announcement prepared
- [ ] Rollback plan documented

### 11.2 Deployment Phases

**Phase 1: Internal Testing (Week 1)**
- Deploy to staging environment
- Test guild: Internal dev server
- Verify all features working
- Monitor logs/metrics for 7 days

**Phase 2: Beta Rollout (Week 2)**
- Deploy to 1-2 pilot guilds
- Announce beta to pilot users
- Collect feedback
- Monitor error rate closely
- Fix critical bugs

**Phase 3: Production Rollout (Week 3-4)**
- Deploy to all guilds (hard cutover)
- Announce 48 hours in advance
- Backfill existing users (optional)
- Monitor for 48 hours post-deployment
- Remove DM modules after stability confirmed

### 11.3 Rollback Plan

**Scenario:** Critical bugs discovered post-deployment

**Steps:**
1. Revert code to previous release (restore DM modules)
2. Database: Homestead channels remain (no data loss)
3. Announce rollback to users
4. Investigate bugs offline
5. Re-deploy once fixed

**Database Impact:** Homestead channels persist (no rollback needed for DB)

---

## 12. Future Enhancements

### 12.1 Channel Threading

**Feature:** Use Discord threads for specific features
- Home view → Main channel
- Battle challenges → Thread per battle
- Wild encounters → Thread per encounter

**Benefit:** Cleaner organization, better history tracking

### 12.2 Channel Templates

**Feature:** Pre-populate homestead with pinned messages
- Welcome message with tutorial
- Pinned commands reference
- Pinned rules/guidelines

### 12.3 Admin Dashboard

**Feature:** Web dashboard for guild admins
- View all homestead channels
- Search by user
- Bulk actions (cleanup, permissions)

### 12.4 Channel Renaming

**Feature:** Automatically rename channel when username changes
- Discord `guildMemberUpdate` event listener
- Update channel name to match new username
- Keep database mapping consistent

---

## 13. Open Questions & Decisions Needed

### 13.1 Channel Category Location

**Question:** Should homestead category be at top or bottom of channel list?

**Options:**
- Top: High visibility for users
- Bottom: Reduces clutter in main channel list

**Recommendation:** Bottom (cleaner main channel list)

### 13.2 Admin Visibility Default

**Question:** Should guild admins be able to view homestead channels by default?

**Options:**
- Yes: Better moderation capability, support easier
- No: True privacy, reduces admin workload

**Recommendation:** No (true privacy), with opt-in config option

### 13.3 Channel Cleanup Policy

**Question:** When should inactive channels be deleted?

**Options:**
- 7 days: Aggressive cleanup, reduces channel count
- 30 days: Balanced approach
- 90 days: Preserve user history
- Never: Permanent homesteads

**Recommendation:** 30 days (balanced), configurable per guild

### 13.4 Backfill Existing Users

**Question:** Should we create homestead channels for all existing users on deployment?

**Options:**
- Yes: Consistent UX, no surprises
- No: Lazy creation, reduces initial API load

**Recommendation:** No (lazy creation), announce via DM that next interaction creates channel

---

## 14. Migration Checklist

### 14.1 Code Changes Required

- [ ] Create `src/services/homestead-channel-manager.ts`
- [ ] Add `HomesteadChannel` model to `prisma/schema.prisma`
- [ ] Generate Prisma migration
- [ ] Migrate `src/bot/dm/home.ts` → `src/bot/homestead/home.ts`
- [ ] Migrate `src/bot/dm/heal.ts` → `src/bot/homestead/heal.ts`
- [ ] Migrate `src/bot/dm/starters.ts` → `src/bot/homestead/starters.ts`
- [ ] Update `src/commands/home.js` (line 559: createDM → getOrCreateChannel)
- [ ] Update `src/commands/profile.js` (line 71: createDM → getOrCreateChannel)
- [ ] Update `src/bot/battle/challenge.ts` (lines 97, 154)
- [ ] Update `src/bot/battle/actions.ts` (lines 59, 66)
- [ ] Update `src/bot/battle/conclude.ts` (line 18)
- [ ] Update `src/bot/wilds/controls.ts` (line 88)
- [ ] Update `src/bot/index.ts` imports (remove dm/, add homestead/)
- [ ] Add Discord event handler: `channelDelete` (cleanup mapping)
- [ ] Add Discord event handler: `guildMemberRemove` (cleanup channel)
- [ ] Create cleanup script: `scripts/cleanup_homestead_channels.ts`
- [ ] Create sync script: `scripts/sync_homestead_channels.ts`
- [ ] Optional: Create backfill script: `scripts/backfill_homestead_channels.ts`

### 14.2 Testing Required

- [ ] Unit tests: `tests/services/homestead-channel-manager.spec.ts`
- [ ] Integration tests: `tests/homestead/features.spec.ts`
- [ ] Migration tests: `tests/homestead/dm-migration.spec.ts`
- [ ] Manual E2E testing (all 10 scenarios)

### 14.3 Documentation Updates

- [ ] This document (14-private-channel-architecture.md)
- [ ] Update `src/bot/dm/ROUTER.md` → deprecation notice
- [ ] Create `src/bot/homestead/ROUTER.md`
- [ ] Update `src/services/ROUTER.md` (add channel manager)
- [ ] Update `docs/architecture-bible/02-discord-bot-layer.md` (architecture change)
- [ ] Update `docs/operations-bible/01-service-matrix.md` (new service)
- [ ] Update `README.md` (mention private channels)
- [ ] Create migration announcement: `docs/announcements/homestead-channel-migration.md`

### 14.4 Database Operations

- [ ] Create migration: `prisma/migrations/YYYYMMDDHHMMSS_add_homestead_channel`
- [ ] Test migration on ONPREMISE-DEV-PRIMARY
- [ ] Regenerate Prisma client: `npx prisma generate`
- [ ] Verify TypeScript build passes
- [ ] Deploy migration to PROD: `npx prisma migrate deploy`

---

## 15. References

### 15.1 Discord API Documentation

- [Channel Creation](https://discord.js.org/#/docs/discord.js/main/class/GuildChannelManager?scrollTo=create)
- [Permission Overwrites](https://discord.js.org/#/docs/discord.js/main/typedef/ChannelPermissionOverwrites)
- [Channel Types](https://discord.js.org/#/docs/discord.js/main/typedef/ChannelType)
- [Rate Limits](https://discord.com/developers/docs/topics/rate-limits)

### 15.2 Internal Documentation

- `src/bot/dm/ROUTER.md` — Current DM implementation
- `operations-bible/02-database-operations.md` — Database patterns
- `architecture-bible/02-discord-bot-layer.md` — Bot layer architecture
- `docs/RESOURCE-LIMITS-RAM-VS-DISK.md` — Resource constraints

### 15.3 External References

- Pokémon Showdown: Channel-based gameplay patterns
- MEE6 Bot: Per-user channel patterns
- Dyno Bot: Moderation channel patterns

---

**Next Steps:**
1. Review this architecture document with team
2. Get approval for approach (hard cutover vs gradual migration)
3. Create task breakdown in `tasklist.md`
4. Begin Phase A: Foundation implementation

**Document Status:** ✅ Complete — Ready for implementation planning
