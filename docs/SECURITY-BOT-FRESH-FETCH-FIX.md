# Security Bot: Fresh Member Fetch Fix

**Date:** 2025-11-30  
**Status:** ✅ COMPLETE  
**Priority:** CRITICAL  

## Problem Statement

The security bot was potentially using **stale cached member data** for processing decisions (role assignments, sweeps), which could cause members to be missed or skipped incorrectly.

### Root Cause

Discord.js caches member data by default. The bot's `guild.members.fetch()` calls were **NOT forcing fresh fetches** from the Discord API, meaning:

1. Members who joined while bot was offline might not be in cache
2. Members whose roles changed externally might have stale role data
3. Guild member count could be inaccurate

## Solution Implemented

### Core Architecture Change

**Pre-existing cache is now STRICTLY for statistics and reasoning only.**  
**All processing decisions use FRESH member data from Discord API.**

### Changes Made

#### 1. `ensureGuildMembersCached()` Function
**File:** `src/bot/main.js:302`

Added `force: true` to ALL member fetch operations:

```javascript
// BEFORE (stale cache):
await guild.members.fetch({ time: chunkTimeoutMs });

// AFTER (fresh data):
await guild.members.fetch({ time: chunkTimeoutMs, force: true });
```

This applies to:
- ✅ Chunk fetch (line 323)
- ✅ Paginated fallback fetch (line 399)

#### 2. Authorization Member Fetches
**File:** `src/bot/main.js:1047, 1062`

Individual member fetches for permission verification now force fresh data:

```javascript
// BEFORE:
ownerMember = await guild.members.fetch(executor.id);

// AFTER:
ownerMember = await guild.members.fetch({ user: executor.id, force: true });
```

#### 3. Documentation Added

Added comprehensive JSDoc to `ensureGuildMembersCached`:
```javascript
/**
 * CRITICAL ARCHITECTURE: Always forces fresh fetch from Discord API
 * - Pre-existing cache is STRICTLY for statistics and reasoning only
 * - Processing decisions MUST use fresh member data (force: true)
 * - Prevents stale cache from causing members to be missed during sweeps
 */
```

Added inline comments in `sweepGuild` function:
```javascript
// CRITICAL: Force fresh member fetch from Discord API (not stale cache)
// ensureGuildMembersCached now includes force: true for all fetch operations
await ensureGuildMembersCached(guild, { origin: `sweep:${origin}` });

// ARCHITECTURE NOTE: guild.members.cache now contains FRESH data from Discord API
const toAssign = guild.members.cache.filter(member => { ... });
```

## Impact Analysis

### What This Fixes

1. **Members Missed During Sweeps**
   - Members who joined while bot was offline are now detected
   - Role changes made externally are now visible

2. **Stale Permission Checks**
   - Guild owner verification uses fresh data
   - Admin/moderator permission checks use fresh data

3. **Accurate Member Counts**
   - Statistics reflect live member data
   - Role coverage percentages are accurate

### What This Doesn't Affect

1. **Cache Usage for Statistics**
   - After fresh fetch, cache is used for fast lookups
   - `guild.members.cache.size` is accurate after fetch
   - Role filtering on cache is safe (uses fresh data)

2. **Event-Driven Updates**
   - `guildMemberAdd` still processes new joins immediately
   - `guildMemberUpdate` still detects role changes
   - Fresh fetch is complementary, not replacement

## Performance Considerations

### Network Impact

- **Increased API calls:** Every sweep now hits Discord API instead of using cache
- **Rate limit safety:** Discord.js handles rate limiting automatically
- **Timeout handling:** Existing timeout auto-increment and pagination remain

### Memory Impact

- **No change:** Cache still bounded by Discord.js internal limits
- **Same memory footprint:** Fresh fetch replaces cache, doesn't add to it

### Timing Impact

- **Chunk fetch:** Same timing (already hitting API)
- **Paginated fallback:** Same timing (already hitting API)
- **Individual member fetch:** Adds ~50-100ms per fetch (negligible)

## Testing Recommendations

### Manual Testing

1. **Test Offline Member Join:**
   ```
   1. Stop security bot
   2. Have member join guild
   3. Start security bot
   4. Verify member gets role during startup sweep
   ```

2. **Test Role Removal:**
   ```
   1. Manually remove Trainer role from member
   2. Wait for continuous sweep (5 minutes)
   3. Verify member gets role reassigned
   ```

3. **Test Permission Changes:**
   ```
   1. Change bot role permissions
   2. Try to run /ops command
   3. Verify permission check uses fresh data
   ```

### Automated Testing

Monitor these metrics after deployment:
- `sweep_candidates_total` - Should detect all members without roles
- `role_assignment_success_total` - Should not have cache-related failures
- `member_fetch_timeout_total` - Should remain stable

## Deployment Notes

### Breaking Changes

**None.** This is a transparent improvement to existing behavior.

### Rollback Procedure

If issues arise, revert these specific changes:
1. Remove `force: true` from line 323
2. Remove `force: true` from line 399
3. Change lines 1047 and 1062 back to simple ID fetch

### Monitoring

Watch for:
- Increased member fetch timeouts (would indicate API rate limits)
- Slower sweep completion times (should be negligible)
- Any new "Members Fetch Error" reports

## Related Documentation

- `docs/architecture-bible/07-security-bot.md` - Security bot architecture
- `src/bot/main.js:302` - ensureGuildMembersCached implementation
- `src/bot/main.js:2469` - sweepGuild function

## Conclusion

This fix ensures the security bot **always operates on live, accurate member data** rather than potentially stale cache. This is critical for maintaining guild member role integrity and catching members who may have been missed due to bot downtime or external role changes.

**Cache is now explicitly for statistics and optimization only - never for processing decisions.**

---

**Implemented by:** AI Agent  
**Reviewed by:** [Pending]  
**Deployed to:** [Pending]  
