# Database ID Standardization Audit

**Date:** 2025-12-07  
**Lead:** Database Specialist + Integration Specialist  
**Status:** � PARTIALLY RESOLVED — Guild ID fixed, monitoring recommended

---

## Executive Summary

Multiple ID format inconsistencies were discovered across the database. The critical issue (wrong guild ID) has been resolved. Discord snowflake IDs (18-19 digit numbers) are properly used where needed.

---

## Resolved Issues

### ✅ FIXED: Guild ID Mismatch

| Table | Field | Before | After | Status |
|-------|-------|--------|-------|--------|
| `homestead_channels` | `guildId` | `1304490987784753163` | `1100976155579912222` | ✅ Fixed |

**Root Cause:** Manual bootstrap script used wrong hardcoded guild ID.
**Resolution:** Updated to correct "Black Infinity Gauntlet" guild ID.

### 🔴 CRITICAL: User ID Format Inconsistency

| Table | Field | Format Used | Expected Format |
|-------|-------|-------------|-----------------|
| `User` | `id` | CUID (`42ff0918-...`) or custom (`driptvdd-founder-001`) | CUID |
| `User` | `discordId` | Discord Snowflake (`398910451420348448`) | ✅ Correct |
| `discord_members` | `id` | UUID (`190931b9-...`) | Should be Discord Snowflake |
| `discord_members` | `discord_user_id` | ??? (need to check) | Discord Snowflake |
| `homestead_channels` | `userId` | References `User.id` | CUID (FK to User) |

**Analysis:** 
- `User.id` uses CUID (correct for Prisma)
- `discord_members.id` uses UUID but should store Discord user snowflake for consistency
- The `discord_user_id` column exists but relationship to `User` table unclear

### 🟡 WARNING: Mixed ID Formats

| Pattern | Tables Affected |
|---------|-----------------|
| CUID | `User.id`, most Prisma models |
| UUID | `discord_members.id`, `discord_roles.id` |
| Discord Snowflake | `discord_guilds.id`, `User.discordId` |
| Custom String | `driptvdd-founder-001` (User.id - manual insert) |

---

## Current Data State

### Users Table (2 records)
```
id                                    | discordId            | coins
--------------------------------------|----------------------|------
42ff0918-60a7-448e-9318-0efbc3f9a2fa | 563220840708177927   | 0
driptvdd-founder-001                  | 398910451420348448   | 1000   ← Custom ID (non-standard)
```

### Homestead Channels (1 record)
```
id                       | userId                 | guildId               | channelId          | status
-------------------------|------------------------|-----------------------|--------------------|--------
driptvdd-homestead-001   | driptvdd-founder-001   | 1304490987784753163   | pending-creation   | deleted
                                                    ↑ WRONG GUILD ID!
```

### Discord Guilds (1 record)
```
id                    | name                      | owner_id
----------------------|---------------------------|---------------------
1100976155579912222   | Black Infinity Gauntlet   | 712718125354844240
```

### Discord Members (496 records - sample)
```
id (UUID)                              | guild_id              | username
---------------------------------------|----------------------|----------
190931b9-1128-4fb6-9e58-e9d05dab054f  | 1100976155579912222   | abtaco10
5b203ad2-158f-49af-bdee-4c2a35a3765a  | 1100976155579912222   | josuketheone
```

---

## Required Fixes

### Fix 1: Correct DRIPTVDD Homestead Guild ID
```sql
-- Change guild from wrong ID to correct "Black Infinity Gauntlet" guild
UPDATE homestead_channels 
SET "guildId" = '1100976155579912222' 
WHERE id = 'driptvdd-homestead-001';
```

### Fix 2: Standardize User.id (Optional but Recommended)
```sql
-- If we want to enforce CUID format, regenerate the custom ID
-- WARNING: This requires updating all FK references

-- Option A: Leave as-is (custom IDs work, just non-standard)
-- Option B: Migrate to CUID (complex, requires FK cascade)
```

### Fix 3: Add discord_user_id to discord_members check
```sql
-- Verify discord_user_id column stores actual Discord snowflakes
SELECT id, discord_user_id, username FROM discord_members LIMIT 5;
```

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

## Immediate Action Plan

### Phase 1: Fix Critical Data (NOW)
1. ✅ Identify wrong guild ID
2. ⬜ Update homestead_channels.guildId to correct value
3. ⬜ Verify User records are correctly linked

### Phase 2: Schema Validation (Next)
1. Add CHECK constraints for Discord snowflake format
2. Add validation in application layer
3. Document ID standards in Architecture Bible

### Phase 3: Data Migration (If Needed)
1. Audit all discord_members.discord_user_id values
2. Consider normalizing User.id to always use CUID
3. Create migration scripts with rollback capability

---

## Environment Variables Check

Need to verify `DISCORD_GUILD_ID` in environment:
- Current value in code/bootstrap: `1304490987784753163`
- Actual guild in database: `1100976155579912222`

**This mismatch is the root cause!**

---

## Recommendations

1. **IMMEDIATE:** Fix homestead guild ID to `1100976155579912222`
2. **SHORT-TERM:** Update `DISCORD_GUILD_ID` env var to correct value
3. **MEDIUM-TERM:** Add snowflake validation to all Discord ID fields
4. **LONG-TERM:** Create ID standardization guide in Architecture Bible

---

*Document created by Database Specialist + Integration Specialist team*
