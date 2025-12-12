# Grace Period Hotfix - Complete Workflow Diagram

**Date:** 2025-12-11  
**Issue:** Infinite healing loop when admins remove Trainer role  
**Solution:** 60-second grace period for authorized removals

---

## 🔄 COMPLETE WORKFLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DISCORD ROLE CHANGE EVENT FLOW                           │
└─────────────────────────────────────────────────────────────────────────────┘

                              Admin Removes Role
                                      │
                                      ▼
                        ┌─────────────────────────┐
                        │ Discord.js Event Fires  │
                        │  guildMemberUpdate      │
                        └───────────┬─────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
        ┌────────────────────────┐      ┌──────────────────────┐
        │ DataPool Service       │      │ Cache Invalidation   │
        │ (Track role changes)   │      │ (Delete stale cache) │
        └────────────────────────┘      └──────────┬───────────┘
                                                   │
                                                   ▼
                                    ┌──────────────────────────────┐
                                    │ CHECK GRACE PERIOD (HOTFIX)  │
                                    │ gracePeriod = Map.get(userId)│
                                    └──────────┬──────────┬────────┘
                                               │          │
                    ┌──────────────────────────┤          │
                    │ Grace Period Active?     │          │
                    │ (elapsed < 60s)          │          │
                    └──┬────────────────────┬──┘          │
                       │ YES                │ NO          │ NO ENTRY
                       │                    │             │
                       ▼                    ▼             │
        ┌──────────────────────┐  ┌─────────────────┐   │
        │ SKIP HEALING         │  │ DELETE EXPIRED  │   │
        │ Log grace period     │  │ Resume healing  │   │
        │ Return early         │  └────────┬────────┘   │
        └──────────────────────┘           │            │
                                           │            │
                                           └────────────┼───────┐
                                                        │       │
                                                        ▼       ▼
                                        ┌────────────────────────────────┐
                                        │ maybeAlertRoleAssignments()    │
                                        │ (Authorization Check)          │
                                        └──────────┬──────────┬──────────┘
                                                   │          │
                                    ┌──────────────┴──────┐   │
                                    │ Authorization?      │   │
                                    └──┬──────────────┬───┘   │
                                       │ AUTHORIZED   │ UNAUTHORIZED
                                       │              │       │
                                       ▼              ▼       ▼
                        ┌──────────────────┐  ┌─────────────────────┐
                        │ Trainer Removed? │  │ IMMEDIATE REVERT    │
                        │ (hadRole && !has)│  │ No grace period     │
                        └────┬─────────────┘  │ Security alert sent │
                             │ YES            └─────────────────────┘
                             │
                             ▼
                ┌────────────────────────────────┐
                │ SET GRACE PERIOD (HOTFIX)      │
                │ Map.set(userId, {              │
                │   timestamp: now,              │
                │   executor: admin,             │
                │   reason: 'authorized',        │
                │   roleId: trainerRole.id       │
                │ })                             │
                └────────────┬───────────────────┘
                             │
                             ▼
                ┌────────────────────────────────┐
                │ RETURN EARLY                   │
                │ Skip healing immediately       │
                │ Log grace period activation    │
                └────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                    GRACE PERIOD CLEANUP (Every 30s)                         │
└─────────────────────────────────────────────────────────────────────────────┘

                        setInterval(30 seconds)
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │ cleanupExpiredGracePeriods() │
                    │                              │
                    │ For each entry in Map:       │
                    │   if (now - timestamp > 60s) │
                    │     delete entry             │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │ Log cleanup results          │
                    │ - expiredCount               │
                    │ - remainingCount (Map.size)  │
                    └──────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                    60 SECONDS LATER (Grace Period Expires)                  │
└─────────────────────────────────────────────────────────────────────────────┘

                    Another guildMemberUpdate Event
                    (or periodic health check)
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │ CHECK GRACE PERIOD           │
                    │ gracePeriod = Map.get(userId)│
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │ elapsed >= 60s?              │
                    │ YES                          │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │ DELETE GRACE PERIOD          │
                    │ Map.delete(userId)           │
                    │ Log: "Grace period expired"  │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │ RESUME HEALING               │
                    │ hasNoAssignableRoles() ✓     │
                    │ ensureTrainerFor() called    │
                    │ Trainer role re-added        │
                    └──────────────────────────────┘
```

---

## 📊 STATE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER STATE TRANSITIONS                              │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   New Member Join   │
                    │   (Has Trainer)     │
                    └──────────┬──────────┘
                               │
                               │ Admin Removes Role
                               │ (Authorized Action)
                               ▼
                    ┌─────────────────────┐
                    │  Grace Period Set   │
                    │  (60 seconds)       │
                    │                     │
                    │  Map Entry:         │
                    │  - timestamp        │
                    │  - executor         │
                    │  - reason           │
                    └──────────┬──────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
        Within 60s      After 60s      Unauthorized
        Admin Action    Timer Expires   Removal
                │              │              │
                ▼              ▼              ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ Grace Period │  │ Grace Period │  │ Immediate    │
    │ Still Active │  │ Expired      │  │ Revert       │
    │ Skip Healing │  │ Resume Heal  │  │ (No Grace)   │
    └──────────────┘  └──────┬───────┘  └──────┬───────┘
                             │                 │
                             ▼                 ▼
                    ┌─────────────────┐  ┌─────────────┐
                    │ Trainer Role    │  │ Role        │
                    │ Re-Added        │  │ Restored    │
                    └─────────────────┘  └─────────────┘
```

---

## 🔍 AUTHORIZATION DECISION TREE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              evaluateExecutorAuthorization() DECISION TREE                  │
└─────────────────────────────────────────────────────────────────────────────┘

                        Role Change Executor
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Is Security Bot?      │
                    │ (executor.id === bot) │
                    └───────┬───────┬───────┘
                            │ YES   │ NO
                            ▼       │
                ┌──────────────┐   │
                │ AUTHORIZED   │   │
                │ reason:      │   │
                │ 'security-   │   │
                │  bot'        │   │
                └──────────────┘   │
                                   ▼
                        ┌───────────────────────┐
                        │ Is Guild Owner?       │
                        │ (ownerId === executor)│
                        └───────┬───────┬───────┘
                                │ YES   │ NO
                                ▼       │
                    ┌──────────────┐   │
                    │ AUTHORIZED   │   │
                    │ reason:      │   │
                    │ 'guild-      │   │
                    │  owner'      │   │
                    └──────────────┘   │
                                       ▼
                            ┌────────────────────────────┐
                            │ Has Administrator Flag?    │
                            │ (PermissionsBitField.Flags │
                            │  .Administrator)           │
                            └────────┬──────────┬────────┘
                                     │ YES      │ NO
                                     ▼          ▼
                        ┌──────────────┐  ┌──────────────┐
                        │ AUTHORIZED   │  │ UNAUTHORIZED │
                        │ reason:      │  │ reason:      │
                        │ 'admin-      │  │ 'insufficient│
                        │  istrator'   │  │  -permissions'│
                        └──────────────┘  └──────┬───────┘
                                                  │
                                                  ▼
                                        ┌──────────────────┐
                                        │ IMMEDIATE REVERT │
                                        │ No grace period  │
                                        │ Security alert   │
                                        └──────────────────┘
```

---

## 🎯 SCENARIO WALKTHROUGH

### Scenario 1: Admin Removes Role (Grace Period Active)

```
T+0s:  Admin removes Trainer role
       → guildMemberUpdate fires
       → Cache invalidated
       → Grace period check: NO ENTRY
       → maybeAlertRoleAssignments: AUTHORIZED (admin)
       → Grace period SET (timestamp = now)
       → RETURN EARLY (skip healing)
       → LOG: "Set grace period for authorized Trainer role removal"

T+30s: Grace period still active
       → User performs some action (triggers update)
       → Grace period check: ACTIVE (30s elapsed, 30s remaining)
       → RETURN EARLY (skip healing)
       → LOG: "Skipping healing during active grace period"

T+59s: Grace period almost expired
       → Grace period check: ACTIVE (59s elapsed, 1s remaining)
       → RETURN EARLY (skip healing)
       → LOG: "Skipping healing during active grace period"

T+61s: Grace period expired
       → Grace period check: EXPIRED (61s elapsed)
       → DELETE grace period entry
       → LOG: "Grace period expired, resuming healing"
       → Continue to healing logic
       → hasNoAssignableRoles() returns true
       → ensureTrainerFor() called
       → Trainer role RE-ADDED
       → LOG: "Healing resumed after grace period expiration"
```

### Scenario 2: Unauthorized User Removes Role (Immediate Revert)

```
T+0s:  Non-admin removes Trainer role
       → guildMemberUpdate fires
       → Cache invalidated
       → Grace period check: NO ENTRY
       → maybeAlertRoleAssignments: UNAUTHORIZED
       → IMMEDIATE REVERT (no grace period set)
       → Role restored immediately
       → Security alert sent to admin
       → LOG: "Unauthorized role change reverted"
```

### Scenario 3: New Member Join (No Grace Period)

```
T+0s:  New user joins Discord server
       → guildMemberAdd fires
       → assignTrainerRoleToNewMember() called
       → Trainer role assigned
       → NO grace period involved
       → LOG: "New member joined and received Trainer role"
```

---

## 🧪 TESTING MATRIX

| Test # | Scenario | Expected Behavior | Grace Period | Healing |
|--------|----------|-------------------|--------------|---------|
| 1 | New member join | Auto-assign Trainer | NO | YES (immediate) |
| 2 | Admin removes role (t=0s) | Grace period set | YES (60s) | NO (skip) |
| 3 | Check at t=30s | Grace period active | YES (30s remain) | NO (skip) |
| 4 | Check at t=61s | Grace period expired | NO (deleted) | YES (resume) |
| 5 | Unauthorized removal | Immediate revert | NO | N/A (reverted) |
| 6 | Multiple users | Independent grace periods | YES (per user) | Per user |
| 7 | Bot restart | Grace periods cleared | NO (memory-only) | YES (resume) |

---

## 📈 MEMORY MANAGEMENT

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GRACE PERIOD MAP LIFECYCLE                               │
└─────────────────────────────────────────────────────────────────────────────┘

                    authorizedRoleRemovalGracePeriods
                                  │
                    ┌─────────────┴─────────────┐
                    │ Map<userId, GracePeriod>  │
                    │                           │
                    │ Entry Structure:          │
                    │ {                         │
                    │   timestamp: number,      │
                    │   executor: User,         │
                    │   reason: string,         │
                    │   roleId: string          │
                    │ }                         │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
            ┌─────────────┐ ┌──────────┐ ┌──────────┐
            │ Entry Added │ │ Entry    │ │ Entry    │
            │ on AUTH     │ │ Checked  │ │ Deleted  │
            │ removal     │ │ before   │ │ after    │
            │             │ │ healing  │ │ 60s      │
            └─────────────┘ └──────────┘ └──────────┘

            Cleanup Mechanism:
            setInterval(cleanupExpiredGracePeriods, 30_000)
                    │
                    ▼
            Every 30 seconds:
            - Iterate all entries
            - If (now - timestamp > 60s) → delete
            - Log cleanup stats

            Expected Map Size:
            - Normal: 0-5 entries
            - Busy server: 5-10 entries
            - Warning threshold: >100 entries (memory leak)
```

---

## 📋 IMPLEMENTATION CHECKLIST

### ✅ Completed Components

- [x] **Grace Period Map** (`authorizedRoleRemovalGracePeriods`)
- [x] **Grace Period Constant** (`GRACE_PERIOD_DURATION_MS = 60_000`)
- [x] **Cleanup Function** (`cleanupExpiredGracePeriods()`)
- [x] **Cleanup Interval** (`setInterval(30 seconds)`)
- [x] **Grace Period Check** (before healing logic)
- [x] **Grace Period Set** (after authorized removal)
- [x] **Expiration Handling** (delete + resume healing)
- [x] **Logging** (all grace period operations)
- [x] **Authorization Integration** (works with existing framework)
- [x] **Documentation** (HOTFIX_PLAN.yaml)

### ⏸️ Pending Components

- [ ] **Local Testing** (5 test scenarios)
- [ ] **Code Review** (verify authorization integration)
- [ ] **Production Deployment** (after testing passes)
- [ ] **48-Hour Monitoring** (verify no loops)

---

## 🚨 CRITICAL SUCCESS FACTORS

### Primary Objective
✅ **No infinite healing loops when admin removes Trainer role**

### Secondary Objectives
✅ **New members still receive Trainer role automatically**  
✅ **Unauthorized removals still trigger immediate revert**  
✅ **No memory leaks (cleanup runs every 30s)**  
✅ **Observable via logs (clear [GRACE_PERIOD] messages)**

### Failure Scenarios (Rollback Triggers)
❌ Grace period prevents legitimate healing (new member doesn't get role)  
❌ Memory leak detected (Map grows unbounded)  
❌ Authorization bypass (unauthorized users set grace periods)  
❌ Race condition between grace period check and set

---

## 🔧 TROUBLESHOOTING GUIDE

### Problem: Bot re-adds role immediately (grace period not working)

**Check:**
1. Verify `[GRACE_PERIOD] Set grace period` log appears
2. Check grace period Map has entry: `authorizedRoleRemovalGracePeriods.has(userId)`
3. Verify authorization passed: `result.changed && !result.unauthorized`
4. Check Trainer role detection: `findRole(guild)` returns role

### Problem: Healing never resumes (stuck in grace period)

**Check:**
1. Verify cleanup runs: Look for `[GRACE_PERIOD] Cleaned up` logs every 30s
2. Check Map size: `authorizedRoleRemovalGracePeriods.size` (should be <10)
3. Verify expiration logic: `elapsed >= GRACE_PERIOD_DURATION_MS`
4. Check grace period deletion on expiration

### Problem: Memory leak (Map growing unbounded)

**Check:**
1. Verify `setInterval(cleanupExpiredGracePeriods, 30_000)` is running
2. Check `cleanupExpiredGracePeriods()` is actually deleting entries
3. Verify timestamp comparison: `now - entry.timestamp > GRACE_PERIOD_DURATION_MS`
4. Monitor Map size over time (should oscillate, not grow)

---

## 📊 MONITORING DASHBOARD

### Key Metrics to Track

```
Grace Period Operations (Per Hour):
- Grace Periods Set: __________ (expect: <10 on normal server)
- Grace Periods Checked: __________ (expect: varies with activity)
- Grace Periods Expired: __________ (expect: ~same as Set)
- Cleanups Executed: 120 (every 30s = 120/hour)

Memory Usage:
- Map Size (Current): __________ (expect: 0-10)
- Map Size (Peak): __________ (warning: >100)
- Map Size (Average): __________ (expect: <5)

Healing Operations:
- Healing Skipped (Grace Period): __________ (expect: >0 if admins active)
- Healing Resumed (Expiration): __________ (expect: ~same as Skipped)
- Healing Executed (No Grace): __________ (expect: minimal)

Authorization Checks:
- Authorized Removals: __________ (expect: >0 if admins active)
- Unauthorized Removals: __________ (expect: 0 on secure server)
- Immediate Reverts: __________ (expect: same as Unauthorized)
```

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-11  
**Status:** ✅ READY FOR TESTING
