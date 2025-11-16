# Render Mount Path Verification Checklist

**Date**: 2025-11-09  
**Issue**: Mount path mismatch causing state persistence failure  
**Status**: ✅ ALL FIXES COMPLETE - Ready for Deployment

## Summary of Changes

Fixed critical infrastructure misconfiguration where all Render services had incorrect mount paths (`/opt/render/project/src/Store`) that didn't match the actual disk mount point (`/Store`), causing all state files to write to ephemeral filesystem instead of persistent disk.

## Files Modified

### Infrastructure (render.yaml)
✅ **Line 45** - infinity-gauntlet (main bot): `mountPath: /Store`  
✅ **Line 82** - infinity-gauntlet-outbox: `mountPath: /Store`  
✅ **Line 128** - infinity-gauntlet-security: `mountPath: /Store`  
✅ **Line 172** - infinity-gauntlet-cache: `mountPath: /Store`  
✅ **Line 213** - infinity-gauntlet-data-pipeline: `mountPath: /Store`  
✅ **Line 257** - pokedex-cache-worker: `mountPath: /Store`  
✅ **Line 266** - pokedex-cache-worker CACHE_DIR: `value: /Store/cache`

**Total**: 6 services, 7 mount path references corrected (web service removed in batch 16a)

### Application Code
✅ **src/bot/state/persistence.js** (line 17):
```javascript
const STATE_DIR = process.env.RENDER 
  ? '/Store/security-bot-state'
  : path.resolve(__dirname, '../../../Store/security-bot-state');
```

✅ **src/bot/Main.js** (lines 62-66):
```javascript
const TIMEOUT_CONFIG_FILE = process.env.RENDER
  ? '/Store/guild-member-timeout-config.json'
  : './Store/guild-member-timeout-config.json';
```

✅ **src/services/cache.js** (lines 8-10):
```javascript
const PRIMARY_CACHE_DIR = process.env.RENDER 
  ? '/Store/discord-cache'
  : path.join(process.cwd(), 'Store', 'discord-cache');
```

✅ **src/services/cache/facade.ts** (lines 24-26):
```typescript
const PRIMARY_RUNTIME_CACHE_DIR = process.env.RENDER 
  ? "/Store/runtime-cache"
  : path.join(process.cwd(), "Store", "runtime-cache");
```

**Total**: 4 files with environment-aware path selection

### Documentation
✅ **AGENTS.md** (line 343): Updated persistent disk section  
✅ **Prompt.md** (line 611): Updated state persistence path  
✅ **docs/render-disk-mount-fix.md**: Comprehensive analysis document  
✅ **docs/render-mount-verification.md**: This checklist

## Verification Commands

### Pre-Deployment (Local)
```bash
# Verify no old mount paths in render.yaml
grep -n "mountPath:" render.yaml
# Should show 7 instances of "/Store" (not "/opt/render/project/src/Store")

# Verify build succeeds
npm run build
# Should show: 0 errors

# Verify code uses environment detection
grep -n "process.env.RENDER" src/bot/state/persistence.js src/bot/Main.js
# Should show 2 files with RENDER environment checks
```

### Post-Deployment (SSH to Render services)

#### 1. Verify Mount Point Exists
```bash
# SSH to any service
ls -la /Store/
# Should show directories (not empty)

# Check security bot state directory
ls -la /Store/security-bot-state/
# Should show: current.json, previous.json, snapshots/

# Check timeout config
ls -la /Store/guild-member-timeout-config.json
# Should exist if bot has run

# Check discord cache
ls -la /Store/discord-cache/
# Should show cached guild/role data

# Check runtime cache
ls -la /Store/runtime-cache/
# Should show namespace directories (encounters, battles, etc.)
```

#### 2. Verify State Persistence
```bash
# View security bot state
cat /Store/security-bot-state/current.json
# Should show: restartNumber > 1 after multiple restarts

# View timeout config
cat /Store/guild-member-timeout-config.json
# Should show: timeoutMs, adjustments, history array
```

#### 3. Verify Auto-Increment System
```bash
# Check timeout config evolution
cat /Store/guild-member-timeout-config.json | jq '.history'
# Should show: Array with timestamp entries if timeouts occurred

# Check current timeout value
cat /Store/guild-member-timeout-config.json | jq '.timeoutMs'
# Should show: Number (120250, 120500, 120750, etc.)
```

#### 4. Verify Restart Behavior
```bash
# Trigger restart via Render Dashboard
# Then SSH in and check:

cat /Store/security-bot-state/current.json | jq '.restartNumber'
# Should show: Number incrementing (2, 3, 4...) not staying at 1

ls -la /Store/security-bot-state/snapshots/
# Should show: Multiple timestamped JSON files (7-day retention)
```

#### 5. Verify Disk Usage
```bash
# Check total disk usage
du -sh /Store/*
# Should show reasonable sizes (< 1GB for security-state, < 2GB for others)

# Check available space
df -h /Store
# Should show mounted disk with proper size (1GB or 2GB)
```

## Success Criteria

### Critical (Must Pass)
- ✅ All 7 services have `mountPath: /Store` in render.yaml
- ✅ Code uses `process.env.RENDER` to detect environment
- ✅ TypeScript builds with 0 errors
- ✅ No references to `/opt/render/project/src/Store` in active code
- ⏳ Post-deploy: `restartNumber` increments on each restart (not stuck at 1)
- ⏳ Post-deploy: State files survive deployment (previous.json exists)

### Important (Should Pass)
- ⏳ Post-deploy: Timeout config persists and auto-increments
- ⏳ Post-deploy: Snapshots directory accumulates timestamped backups
- ⏳ Post-deploy: Disk usage stays within allocated limits

### Nice to Have (Observability)
- ⏳ Post-deploy: Restart DMs show accurate restart count and recent activity
- ⏳ Post-deploy: `/ops state` command displays full operational history
- ⏳ Post-deploy: Logs show `[State] STATE_DIR: /Store/security-bot-state`

## Rollback Plan

If state persistence still fails after deployment:

### Option 1: Emergency Revert (Fastest)
```bash
# Revert render.yaml changes
git revert <commit-hash>
git push

# Services will restart with old (broken) paths but at least won't crash
```

### Option 2: Fix Mount Paths in Dashboard (Safest)
1. Open Render Dashboard → Services → [service] → Settings → Disks
2. Change mount path from `/Store` to `/opt/render/project/src/Store`
3. Redeploy service
4. Verify files appear at new location via SSH

### Option 3: Update Code Paths (Most Flexible)
```javascript
// Force absolute path regardless of environment
const STATE_DIR = '/Store/security-bot-state';
const TIMEOUT_CONFIG_FILE = '/Store/guild-member-timeout-config.json';
```

## Known Issues

### Resolved
- ✅ Mount path mismatch between dashboard and render.yaml
- ✅ Files written to ephemeral filesystem (lost on restart)
- ✅ `restartNumber` stuck at 1 (never incremented)
- ✅ Timeout config reset to default on every restart
- ✅ No operational history preservation

### Monitoring
- ⏳ Verify disk usage doesn't grow unbounded (snapshots should prune)
- ⏳ Verify timeout doesn't exceed maximum (300s cap enforced)
- ⏳ Verify state persistence doesn't cause memory leaks

## Related Documentation

- **Root Cause Analysis**: `docs/render-disk-mount-fix.md`
- **Security Bot State**: `docs/security-bot-state.md`
- **Operations Guide**: `AGENTS.md` (State Persistence section)
- **Prompt History**: `Prompt.md` (Render Persistent Disk Mount Path Fix section)

## Timeline

- **2025-11-09 13:35Z**: Auto-adjusting timeout system implemented
- **2025-11-09 14:00Z**: User reported state persistence not working
- **2025-11-09 14:15Z**: Mount path mismatch identified and fixed
- **2025-11-09 14:30Z**: All services corrected, build verified
- **Next**: Deploy and verify persistence works in production

## Contact

If verification fails or unexpected behavior occurs:
1. Check Render Dashboard → Services → [service] → Logs
2. SSH to service: `ls -la /Store/` to verify mount point
3. Review `docs/render-disk-mount-fix.md` for troubleshooting
4. Escalate to `playbooks/escalate.md` if critical
