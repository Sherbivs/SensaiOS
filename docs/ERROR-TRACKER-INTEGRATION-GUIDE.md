# Error Tracker Integration Guide

**Date:** 2025-11-17  
**Status:** ACTIVE — Error tracker integration pattern established  
**Purpose:** Ensure ALL production errors are captured, logged, and made visible in error monitoring dashboard

---

## 🚨 The Problem (Solved)

**Issue:** Error tracker was not capturing production errors, showing "0 errors" when errors were actively occurring (extractDatabaseName error every 15 seconds).

**Root Cause:** Error tracker not integrated into error catch blocks throughout application. Errors were logged to console but never passed to error tracker's `captureError()` function.

**Solution:** Integrate error tracker into all critical error handling paths using lazy-loading pattern to avoid circular dependencies.

---

## ✅ Completed Integration (2025-11-17)

### logger.js — Database Stats Collection Errors

**Location:** `src/utils/logger.js` lines 1-30, 387-420

**Pattern:**
```javascript
// Top of file - lazy-load error tracker
let errorTracker = null;

async function getErrorTracker() {
  if (errorTracker) return errorTracker;
  
  try {
    const errorTrackerModule = await import('../services/monitoring/error-tracker.js');
    errorTracker = errorTrackerModule.errorTracker;
    return errorTracker;
  } catch (err) {
    // Error tracker not available (early startup or testing environment)
    return null;
  }
}

// In catch block
try {
  // ... database stats collection code
} catch (error) {
  console.warn('[logger] Error collecting database stats:', error.message);
  
  // Track error in error tracker for visibility
  getErrorTracker()
    .then(tracker => {
      if (tracker) {
        tracker.captureError(error, {
          service: 'logger',
          operation: 'collectDatabaseStats',
          category: 'DATABASE',
          severity: 'MEDIUM',
        }).catch(trackErr => {
          // Error tracker itself failed - just log it
          console.warn('[logger] Failed to track database stats error:', trackErr.message);
        });
      }
    })
    .catch(() => {
      // Error tracker not available - continue without tracking
    });
  
  // ... set default return values
}
```

**Why Lazy Loading:**
- Avoids circular dependency (logger → error-tracker → logger)
- Gracefully handles early startup before error tracker initialized
- Continues operation if error tracker unavailable

**Commit:** `c10a842` — "[CRITICAL] Fix extractDatabaseName import + integrate error tracker into logger"

---

## 📋 Remaining Integration Opportunities (High Priority)

### 1. Service Registry Health Checks

**Location:** `src/shared/service-registry.ts` lines 400-500 (approximate)

**Current State:** Health check failures logged but not tracked

**Needed Pattern:**
```typescript
import { errorTracker } from '../services/monitoring/error-tracker.js';

// In health check failure handler
async checkHealth(serviceName: string): Promise<HealthStatus> {
  try {
    // ... health check logic
  } catch (error) {
    this.logger.error(`Health check failed for ${serviceName}`, error);
    
    // TRACK ERROR
    await errorTracker.captureError(error, {
      service: 'service-registry',
      operation: 'healthCheck',
      category: 'ENGINE',
      severity: 'HIGH',
      customData: { serviceName },
    });
    
    return 'error';
  }
}
```

**Impact:** Service initialization/degradation errors visible in error tracker

---

### 2. Prisma Database Queries

**Location:** Throughout `src/` (commands, services, workers)

**Current State:** Try-catch blocks log errors but don't track them

**Needed Pattern:**
```typescript
import { errorTracker } from '../services/monitoring/error-tracker.js';

// Example: User profile queries
try {
  const user = await prisma.user.findUnique({ where: { userId } });
  // ... handle result
} catch (error) {
  log('error', 'Failed to fetch user profile', error);
  
  // TRACK ERROR
  await errorTracker.captureError(error, {
    service: 'commands',
    operation: 'fetchUserProfile',
    category: 'DATABASE',
    severity: 'HIGH',
    userId,
    customData: { query: 'User.findUnique' },
  });
  
  throw error; // or handle gracefully
}
```

**Impact:** Database query failures immediately visible, can detect patterns (e.g., connection timeouts, constraint violations)

---

### 3. Discord API Error Handler

**Location:** `src/bot/error-handler.ts` (already uses error tracker)

**Current State:** ✅ GOOD — Already integrated

**Pattern Reference:**
```typescript
// src/bot/error-handler.ts line ~50
await errorTracker.captureError(error, {
  service: 'discord-bot',
  operation: interaction.commandName || 'unknown',
  category: 'DISCORD',
  severity: discordErrorSeverity,
  userId: interaction.user.id,
  guildId: interaction.guildId,
});
```

**Note:** This is the gold standard pattern for error tracking. Use as reference.

---

### 4. Worker Error Handlers

**Location:** `src/workers/worker-error-handler.ts` (already uses error tracker)

**Current State:** ✅ GOOD — Already integrated

**Pattern Reference:**
```typescript
// src/workers/worker-error-handler.ts line ~30
await errorTracker.captureError(error, {
  service: 'worker',
  operation: context.workerName,
  category: workerErrorCategory,
  severity: workerErrorSeverity,
  customData: context,
});
```

---

### 5. Cache Operations (Already Good)

**Locations:**
- `src/services/cache/facade.ts` — ✅ Already integrated
- `src/services/cache/engine-cache.ts` — ✅ Already integrated
- `src/services/cache/engine-write-buffer.ts` — ✅ Already integrated

**Pattern:** Already using `errorTracker.captureError()` in catch blocks

---

### 6. Engine DB Operations

**Location:** `src/services/database/engine-read-db.js`, `engine-write-db.js`

**Current State:** Try-catch blocks log errors but may not track them

**Needed Integration:** Verify error tracking in:
- Database initialization
- Query execution
- WAL replay
- Auto-save operations

---

### 7. Resource Monitor

**Location:** `src/services/monitoring/resource-monitor.ts`

**Current State:** Uses error tracker (already good)

**Verify:** Memory guardian errors tracked properly

---

## 📊 Error Tracker Best Practices

### Context Fields (Always Provide)

```typescript
{
  service: string;        // 'logger', 'commands', 'worker', etc.
  operation: string;      // 'collectDatabaseStats', 'fetchUser', 'processJob', etc.
  category?: ErrorCategory; // 'DATABASE', 'NETWORK', 'DISCORD', 'ENGINE', 'WORKER', etc.
  severity?: ErrorSeverity; // 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
  userId?: string;        // When error involves user operation
  guildId?: string;       // When error involves guild
  commandName?: string;   // When error occurs during command execution
  customData?: Record<string, any>; // Additional context (query params, state, etc.)
}
```

### Severity Guidelines

- **CRITICAL:** Service down, data loss risk, system-wide failure
- **HIGH:** Feature broken, user-facing errors, data inconsistency
- **MEDIUM:** Degraded performance, recoverable errors, warnings
- **LOW:** Non-critical issues, informational, expected errors

### Category Guidelines

- **DATABASE:** Prisma queries, connection errors, migrations
- **NETWORK:** HTTP requests, API calls, timeouts
- **DISCORD:** Discord API errors, rate limits, permission issues
- **ENGINE:** Battle engine, encounter system, game logic
- **WORKER:** Background jobs, scheduled tasks, async processing
- **CACHE:** Cache operations, storage I/O
- **CONFIG:** Environment variables, configuration errors
- **VALIDATION:** Input validation, schema validation

---

## 🔍 Verification After Integration

### 1. Check Production Logs

After deploying error tracker integration, verify in Render logs:

```
[ERROR MONITORING] (Last Hour)
  🚨 CRITICAL: 1 unique | ⚠️  HIGH: 2 unique | 📊 MEDIUM: 5 unique | 📝 LOW: 3 unique
  Total: 11 unique errors | 47 occurrences | Rate: 3.13/min
```

**Expected Change:** 
- BEFORE: "Total: undefined unique errors | 0 occurrences"
- AFTER: Actual error counts with breakdown by severity

### 2. Check `/ops errors` Command

Run in Discord: `/ops errors`

Should show:
- Recent errors with timestamps
- Error categories and severities
- Occurrence counts
- Source locations (file, line, function)

### 3. Check Emergency Logs

If error tracker fails, errors written to:
`Store/emergency-error-logs/error-<timestamp>.json`

Verify these files contain:
- Error name, message, stack trace
- Context (service, operation, severity)
- Parsed stack trace metadata

---

## 🚀 Rollout Plan

### Phase 1: Critical Paths (DONE — 2025-11-17)
- ✅ logger.js database stats collection
- ✅ Discord command handler (already done)
- ✅ Worker error handlers (already done)

### Phase 2: Service Layer (Next)
- [ ] Service Registry health checks
- [ ] Resource Monitor failures
- [ ] Cache facade errors

### Phase 3: Data Layer (After Phase 2)
- [ ] Prisma query errors (user commands)
- [ ] Prisma query errors (battle engine)
- [ ] Engine DB operations

### Phase 4: Background Workers (After Phase 3)
- [ ] Cache refresh worker
- [ ] Buffer flush worker
- [ ] Write-DB validator

---

## 📝 Testing Checklist

After integrating error tracker in a new location:

1. **Trigger Test Error:** Cause an intentional error (e.g., invalid query)
2. **Check Console:** Verify error logged with "🚨 [ERROR CAPTURED]" prefix
3. **Check `/ops errors`:** Verify error appears in error list
4. **Check Database:** Verify `ErrorLog` table has new entry
5. **Check Logger Stats:** Verify error count increments in auto-refresh output
6. **Check Emergency Logs:** If DB fails, verify emergency file written

---

## ⚠️ Common Pitfalls

### 1. Circular Dependencies

**Problem:** Importing error tracker at top level causes circular dependency

**Solution:** Use lazy loading pattern (see logger.js example)

### 2. Error Tracker Not Initialized

**Problem:** Error tracker may not be available during early startup

**Solution:** Always check if tracker exists before calling `captureError()`

```typescript
const tracker = await getErrorTracker();
if (tracker) {
  await tracker.captureError(error, context);
}
```

### 3. Forgetting to Await

**Problem:** `captureError()` is async, forgetting to await silently fails

**Solution:** Always await or use `.catch()` to handle failures

```typescript
// GOOD
await errorTracker.captureError(error, context);

// ALSO GOOD (fire-and-forget with error handling)
errorTracker.captureError(error, context).catch(err => {
  console.warn('Failed to track error:', err);
});
```

### 4. Missing Context

**Problem:** Error tracked without service/operation context

**Solution:** Always provide at minimum `service` and `operation` fields

```typescript
// BAD
await errorTracker.captureError(error);

// GOOD
await errorTracker.captureError(error, {
  service: 'my-service',
  operation: 'myOperation',
  category: 'DATABASE',
  severity: 'MEDIUM',
});
```

---

## 📚 Related Documentation

- **Error Tracker Implementation:** `src/services/monitoring/error-tracker.ts`
- **Error Handler (Discord):** `src/bot/error-handler.ts`
- **Error Handler (Workers):** `src/workers/worker-error-handler.ts`
- **Stack Trace Parser:** `src/utils/stack-trace-parser.ts`
- **Production Log Audit:** `docs/PRODUCTION-LOG-AUDIT-2025-11-17.md`

---

## 🎯 Success Metrics

After full integration, error tracker should show:

- **✅ Zero False Negatives:** Every error in console also appears in error tracker
- **✅ Live Detection:** Errors visible within 1 second of occurrence
- **✅ Proper Categorization:** Errors tagged with correct severity and category
- **✅ Source Attribution:** Error source file/line/function identified
- **✅ Context Preservation:** User IDs, guild IDs, operation context captured

---

**Last Updated:** 2025-11-17  
**Maintainer:** DripTVDD  
**Status:** Active Development — Phase 1 Complete
