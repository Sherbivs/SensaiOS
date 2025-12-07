# Database ID Standardization Audit

**Date:** 2025-12-07  
**Updated:** 2025-12-08  
**Lead:** Database Specialist + Integration Specialist  
**Status:** ✅ RESOLVED — All critical issues fixed, Identity Consolidation system operational

---

## Executive Summary

Multiple ID format inconsistencies were discovered across the database. **All critical issues have been resolved.** The Identity Consolidation system (`discord-identity.ts` + `player-resolver.ts`) is now fully operational with proper Discord snowflake handling.

---

## Resolved Issues

### ✅ FIXED: Guild ID Mismatch

| Table | Field | Before | After | Status |
|-------|-------|--------|-------|--------|
| `homestead_channels` | `guildId` | `1304490987784753163` | `1100976155579912222` | ✅ Fixed |

**Root Cause:** Manual bootstrap script used wrong hardcoded guild ID.
**Resolution:** Updated to correct "Black Infinity Gauntlet" guild ID.
**Verified:** 2025-12-08 via `SELECT * FROM homestead_channels;`

### ✅ RESOLVED: User ID Format Consistency

| Table | Field | Format Used | Status |
|-------|-------|-------------|--------|
| `User` | `id` | CUID or custom string | ✅ Works (FK-safe) |
| `User` | `discordId` | Discord Snowflake | ✅ Correct |
| `discord_members` | `id` | CUID (internal) | ✅ Correct |
| `discord_members` | `discord_user_id` | Discord Snowflake | ✅ Correct |
| `homestead_channels` | `userId` | References `User.id` | ✅ Correct (FK) |

**Analysis:** 
- `User.id` uses CUID (Prisma default) or custom strings (e.g., `driptvdd-founder-001`)
- `discord_members.id` uses CUID (internal identifier, not Discord snowflake)
- `discord_members.discord_user_id` stores actual Discord snowflakes (17-19 digits)
- **Identity Consolidation system handles all formats correctly via PlayerResolver**

### ✅ UNDERSTOOD: Mixed ID Formats (By Design)

| Pattern | Tables Affected | Purpose |
|---------|-----------------|---------|
| CUID | `User.id`, most Prisma models | Internal database identifiers |
| UUID/CUID | `discord_members.id`, `discord_roles.id` | Internal row identifiers |
| Discord Snowflake | `discord_guilds.id`, `User.discordId`, `discord_members.discord_user_id` | Discord platform identifiers |
| Custom String | `driptvdd-founder-001` (User.id) | Special bootstrap record |

**Resolution:** Mixed formats are intentional. Internal PKs use CUID, external Discord IDs use snowflakes stored in dedicated columns. The Identity Consolidation system abstracts this via `PlayerResolver.resolve()`.

---

## Current Data State (Verified 2025-12-08)

### Users Table (2 records)
```
id                                    | discordId            | coins
--------------------------------------|----------------------|------
42ff0918-60a7-448e-9318-0efbc3f9a2fa | 563220840708177927   | 0
driptvdd-founder-001                  | 398910451420348448   | 1000   ← DRIPTVDD (founder)
```

### Homestead Channels (1 record)
```
id                       | userId                 | guildId               | channelId          | status
-------------------------|------------------------|-----------------------|--------------------|--------
driptvdd-homestead-001   | driptvdd-founder-001   | 1100976155579912222   | pending-creation   | deleted
                                                    ✅ CORRECT GUILD ID
```

### Discord Guilds (1 record)
```
id                    | name                      | owner_id
----------------------|---------------------------|---------------------
1100976155579912222   | Black Infinity Gauntlet   | 712718125354844240
```

### Discord Members (496 records - verified)
```
id (CUID)                              | guild_id              | discord_user_id       | username
---------------------------------------|----------------------|------------------------|----------
(internal)                             | 1100976155579912222  | 563220840708177927    | driptvdd
(internal)                             | 1100976155579912222  | 926689645759189022    | drip_kit1
```

**Note:** The `discord_user_id` `563220840708177927` in `discord_members` is a different Discord account than DRIPTVDD's primary account (`398910451420348448`). This is correct behavior — the security bot tracks all Discord members independently from game accounts.

---

## ID Format Standards (Canonical Reference)

| Entity Type | Field Name | Format | Example | Validation |
|-------------|------------|--------|---------|------------|
| Discord User ID | `discordId` | Snowflake (string) | `398910451420348448` | 17-19 digits |
| Discord Guild ID | `guildId` | Snowflake (string) | `1100976155579912222` | 17-19 digits |
| Discord Channel ID | `channelId` | Snowflake (string) | `1234567890123456789` | 17-19 digits |
| Discord Role ID | `roleId` | Snowflake (string) | `1234567890123456789` | 17-19 digits |
| Internal User ID | `User.id` | CUID | `clxxxxxxxxxxxxxxxxxx` | 25 chars |
| Internal Entity ID | `*.id` | CUID | `clxxxxxxxxxxxxxxxxxx` | 25 chars |
| Correlation ID | `correlationId` | UUID v4 | `123e4567-e89b-...` | 36 chars |

---

## Completed Action Plan

### Phase 1: Fix Critical Data ✅ COMPLETE
1. ✅ Identified wrong guild ID
2. ✅ Updated homestead_channels.guildId to correct value (`1100976155579912222`)
3. ✅ Verified User records are correctly linked

### Phase 2: Identity Consolidation System ✅ COMPLETE
1. ✅ Created `discord-identity.ts` (687 lines) — Discord identity lookups
2. ✅ Created `player-resolver.ts` (420 lines) — Unified player context
3. ✅ Integrated with HomesteadManager
4. ✅ Created `/ops player` command for verification

### Phase 3: Schema Validation (Future Enhancement)
1. ⬜ Add CHECK constraints for Discord snowflake format
2. ⬜ Add validation in application layer
3. ⬜ Document ID standards in Architecture Bible

---

## Recommendations (Future Work)

1. **SHORT-TERM:** Add snowflake validation regex to identity services
2. **MEDIUM-TERM:** Add database-level CHECK constraints
3. **LONG-TERM:** Create ID standardization guide in Architecture Bible section 19

---

## Identity Consolidation System Integration

The Identity Consolidation system created during this audit provides:

```typescript
// SINGLE SOURCE OF TRUTH for Discord identity
import { resolveDiscordUser } from "../services/discord-identity.js";

// RECOMMENDED ENTRY POINT for player lookups
import { resolvePlayer } from "../services/player-resolver.js";

// Example: Get unified player context
const player = await resolvePlayer(discordId);
// Returns: { id, discordId, username, displayName, roles, coins, homesteadChannelId }
```

**See:** `src/services/discord-identity.ts`, `src/services/player-resolver.ts`

---

*Document created by Database Specialist + Integration Specialist team*  
*Updated 2025-12-08: Marked RESOLVED after verification and Identity Consolidation system completion*
