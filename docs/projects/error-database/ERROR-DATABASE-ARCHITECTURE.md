# Error Database Architecture

> **Lead: Documentation Specialist**  
> **Project: Comprehensive Error Tracking System**  
> **Created: 2025-12-06**  
> **Status: IN PROGRESS**

---

## 📋 Executive Summary

**Mission:** "No Silent Errors" — Every error is captured, logged, and made visible. There should not be a single piece of code that can give errors or fail to fire that isn't tracked, documented, and alerted about.

**Current State:** ~70% coverage with excellent foundation  
**Target State:** 100% coverage with automated alerting

---

## 🏗️ Current Architecture

### Database Schema (Prisma)

```prisma
model ErrorLog {
  errorId              String    @id @default(uuid())
  fingerprint          String    @unique  // SHA-256 hash for deduplication
  category             String    // VALIDATION, NETWORK, DATABASE, DISCORD, ENGINE, WORKER, CONFIG, CACHE, UNKNOWN
  severity             String    // CRITICAL, HIGH, MEDIUM, LOW
  
  // Occurrence tracking
  firstSeen            DateTime  @default(now())
  lastSeen             DateTime  @default(now())
  occurrenceCount      Int       @default(1)
  
  // Error details
  errorName            String
  errorMessage         String    @db.Text
  stackTrace           String?   @db.Text
  contextData          Json?     // Rich context: service, operation, userId, guildId, commandName
  
  // Recovery tracking
  recoveryAttempted    Int       @default(0)
  recoverySuccess      Int       @default(0)
  lastRecoveryStrategy String?
  lastRecoveryOutcome  String?
  
  // Impact assessment
  impactedFeatures     String[]
  estimatedUserImpact  Int?
  learningMetadata     Json?     // ML features for pattern detection
  
  alerts               ErrorAlert[]
}

model ErrorAlert {
  alertId        String    @id @default(uuid())
  errorId        String
  alertType      String    // DM, CHANNEL, WEBHOOK, EMAIL
  recipientId    String?   // Discord user ID
  sentAt         DateTime  @default(now())
  acknowledged   Boolean   @default(false)
  acknowledgedAt DateTime?
  acknowledgedBy String?
  
  error ErrorLog @relation(fields: [errorId], references: [errorId], onDelete: Cascade)
}
```

### Core Service: ErrorTracker (`src/services/monitoring/error-tracker.ts`)

**Capabilities:**
- ✅ `captureError(error, context)` — Main capture method with fingerprinting
- ✅ Auto-classification of severity (CRITICAL/HIGH/MEDIUM/LOW)
- ✅ Auto-detection of category (DATABASE/DISCORD/NETWORK/etc.)
- ✅ Stack trace parsing with source code enrichment
- ✅ EventBus emission (`error.<severity>` topics)
- ✅ Emergency file fallback (Store/emergency-error-logs/)
- ✅ AI report generation (Store/error-reports/)
- ✅ `getErrorStats(since)` — Statistics query
- ✅ `getRecentErrors(limit, filters)` — Filtered queries
- ✅ `getTopErrors(limit, orderBy)` — Top errors by count/recency
- ✅ `recordRecoveryAttempt(errorId, strategy, success)` — Recovery tracking

**Live Detection Guarantees:**
1. IMMEDIATE console output (before async operations)
2. Direct database write (no caching layer)
3. EventBus emission for real-time visibility
4. Emergency file fallback if database fails

---

## 🔴 GAP ANALYSIS

### Coverage Matrix

| Location | Current Status | Issue |
|----------|---------------|-------|
| **admin.ts** | ✅ 9 catch blocks use errorTracker | Good coverage |
| **worker-error-handler.ts** | ✅ 7 capture methods | Comprehensive |
| **resource-manager.ts** | ✅ 5 capture calls | Good coverage |
| **index.ts** | ✅ 3 capture calls | Partial - misses some catches |
| **main.js:3944** | ❌ uncaughtException logs but doesn't capture | **CRITICAL GAP** |
| **main.js:236,260** | ❌ `.catch(() => {})` silent swallow | **GAP** |
| **main.js:3083** | ❌ `.catch((error) => {...})` logs but doesn't capture | **GAP** |
| **main.js:3887,3895** | ❌ `.catch(() => {})` silent swallow | **GAP** |
| **pokemonService.js** | ❌ Multiple `.catch(() => {})` | **GAP** |
| **service-registry.ts** | ❌ `.catch(() => {})` silent swallow | **GAP** |
| **system-health-monitor.ts** | ⚠️ Logs but doesn't capture | Partial |

### Critical Issues

1. **Silent Catch Swallowing**
   ```javascript
   // FOUND in main.js, pokemonService.js, service-registry.ts
   .catch(() => {});  // Error lost forever!
   ```

2. **Log-Only Error Handling**
   ```javascript
   // FOUND in main.js:3944
   process.on('uncaughtException', async (error) => {
     log('error', '[State] Uncaught exception, saving state', { error });
     // ❌ Missing: errorTracker.captureError(error, { operation: 'uncaughtException' })
     process.exit(1);
   });
   ```

3. **No Automated Alerting**
   - `ErrorAlert` table exists but is never populated
   - DripTVDD (owner) not alerted on CRITICAL errors
   - No Discord DM/channel notifications

4. **No Admin Query Interface**
   - `/ops errors` command doesn't exist
   - No way to query error database from Discord

---

## 📐 Resolution Plan

### Phase 1: Wire Critical Handlers (main.js)

**Target:** Ensure process-level exceptions are captured

```javascript
// main.js:3944 - Wire uncaughtException
process.on('uncaughtException', async (error) => {
  log('error', '[State] Uncaught exception, saving state', { error });
  
  // NEW: Capture to error database before exit
  try {
    const { errorTracker } = await import('./services/monitoring/error-tracker.js');
    await errorTracker.captureError(error, {
      operation: 'uncaughtException',
      severity: 'CRITICAL',
      category: 'UNKNOWN',
    });
  } catch (captureError) {
    log('error', '[ErrorTracker] Failed to capture uncaughtException', { captureError });
  }
  
  if (autoSaveInterval) {
    stopAutoSave(autoSaveInterval);
  }
  if (botState) {
    await shutdownState(botState, 'uncaughtException');
  }
  process.exit(1);
});
```

### Phase 2: Error Alerting Service

**New File:** `src/services/monitoring/error-alerting-service.ts`

**Features:**
- Subscribe to EventBus `error.critical`, `error.high` topics
- Auto-DM DripTVDD (Discord ID: 1049161859555643433) on CRITICAL errors
- Create ErrorAlert records for audit trail
- Rate limiting (max 5 alerts per 10 minutes to prevent spam)
- Acknowledgement workflow

```typescript
// Error Alerting Service
export class ErrorAlertingService {
  private readonly DRIP_TVDD_ID = '1049161859555643433';
  private rateLimiter = new Map<string, number[]>(); // fingerprint → timestamps
  
  async initialize(): Promise<void> {
    const bus = EventBus.getInstance();
    
    // Subscribe to critical and high severity errors
    bus.subscribe('error.critical', this.handleCriticalError.bind(this));
    bus.subscribe('error.high', this.handleHighError.bind(this));
  }
  
  private async handleCriticalError(event: LiveErrorEvent): Promise<void> {
    // Rate limit check (max 5 per fingerprint per 10 min)
    if (this.isRateLimited(event.fingerprint)) return;
    
    // DM DripTVDD
    await this.sendDmAlert(event, 'CRITICAL');
    
    // Create ErrorAlert record
    await this.recordAlert(event, 'DM');
  }
}
```

### Phase 3: /ops errors Command

**Add to admin.ts:**

```
/ops errors list [limit] [severity] [category]
/ops errors stats [hours]
/ops errors detail <fingerprint>
/ops errors clear <fingerprint>
/ops errors acknowledge <alertId>
```

**Output Example:**
```
📊 Error Statistics (Last 24h)
──────────────────────────────
Total Unique Errors: 12
Total Occurrences: 47
Error Rate: 1.96/hour

By Severity:
  🔴 CRITICAL: 2
  🟠 HIGH: 8
  🟡 MEDIUM: 25
  🟢 LOW: 12

By Category:
  DATABASE: 5
  DISCORD: 15
  NETWORK: 12
  CACHE: 8
  UNKNOWN: 7
```

### Phase 4: Fix Silent Catches

**Pattern to Replace:**
```javascript
// BEFORE (error lost)
.catch(() => {});

// AFTER (error tracked)
.catch((err) => {
  errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
    service: 'serviceName',
    operation: 'operationName',
    severity: 'LOW', // or appropriate level
  });
});
```

---

## 📊 Error Taxonomy

### Severity Levels

| Level | Definition | Alert Action |
|-------|------------|--------------|
| **CRITICAL** | System down, data loss risk, process crash | Immediate DM to DripTVDD |
| **HIGH** | Feature broken, user-facing errors | DM within 5 minutes (batched) |
| **MEDIUM** | Degraded performance, recoverable | Log only (no alert) |
| **LOW** | Expected errors, validation failures | Log only |

### Category Definitions

| Category | Examples |
|----------|----------|
| **DATABASE** | Prisma errors, connection failures, query timeouts |
| **DISCORD** | API errors, rate limits, permission denied |
| **NETWORK** | Timeouts, DNS failures, connection refused |
| **ENGINE** | Battle engine errors, encounter failures |
| **WORKER** | Worker crashes, job failures |
| **CACHE** | Cache corruption, eviction failures |
| **CONFIG** | Missing env vars, invalid configuration |
| **VALIDATION** | User input errors, schema validation |
| **UNKNOWN** | Uncategorized errors |

---

## 🎯 Success Criteria

1. **100% Error Coverage** — Every catch block captures to errorTracker
2. **Zero Silent Swallows** — No `.catch(() => {})` patterns remain
3. **Automated Alerting** — CRITICAL errors DM DripTVDD within 60 seconds
4. **Admin Visibility** — `/ops errors` command works for all query types
5. **Audit Trail** — Every alert has an ErrorAlert record

---

## 📁 File Structure

```
src/services/monitoring/
├── error-tracker.ts           # Core error capture (EXISTS)
├── error-alerting-service.ts  # NEW: Auto-alerting
├── index.ts                   # Exports (EXISTS)
└── ROUTER.md                  # Update with new service

docs/projects/error-database/
├── ERROR-DATABASE-ARCHITECTURE.md  # This file
└── ERROR-DATABASE-COMPLETE.md      # Completion report (after)
```

---

## 🔗 Cross-References

- **Existing ErrorTracker:** `src/services/monitoring/error-tracker.ts`
- **Prisma Schema:** `prisma/schema.prisma` (lines 531-591)
- **Admin Commands:** `src/bot/ops/admin.ts`
- **EventBus:** `src/shared/event-bus.ts`
- **Security Events:** `docs/projects/security-db-transformation/` (similar pattern)

---

**Next Steps:**
1. ⏳ Create error-alerting-service.ts
2. ⏳ Wire main.js exception handlers
3. ⏳ Add /ops errors command
4. ⏳ Fix silent catch patterns
5. ⏳ Write completion report

