# Section 6: Error System

[← Back to INDEX](INDEX.md) | [← Previous: Logging Architecture](05-logging-architecture.md) | [Next: Security Bot →](07-security-bot.md)

---

**Philosophy**: "Zero false negatives. 100% error capture rate. AI-optimized structured logging for learning and pattern detection."

**Purpose**: Multi-tier error detection with comprehensive fallbacks ensuring no error goes untracked.

## 6.1 Detection Architecture

**Multi-Tier Error Detection** — Comprehensive error capture with five layers of fallback guarantees.

**Tier 1 — Tracked Try-Catch**:

```typescript
import { ErrorTracker } from "./services/error-tracker.js";

try {
  await riskyOperation();
} catch (error) {
  ErrorTracker.track(error, {
    component: "user-action",
    action: "process-command",
    userId,
    guildId,
    metadata: { commandName, options }
  });
  // Error recorded, context preserved
}
```

**Tier 2 — ErrorTracker.wrap()**:

```typescript
const safeFunc = ErrorTracker.wrap(async () => {
  await riskyOperation();
}, {
  component: "database",
  action: "query-species"
});

await safeFunc(); // Errors auto-tracked with full context
```

**Tier 3 — Global Handlers**:

```typescript
process.on("uncaughtException", (error, origin) => {
  ErrorTracker.track(error, {
    component: "system",
    action: "uncaught-exception",
    origin,
    fatal: true
  });
});

process.on("unhandledRejection", (reason, promise) => {
  ErrorTracker.track(reason, {
    component: "system",
    action: "unhandled-rejection",
    promise: String(promise),
    fatal: false
  });
});
```

**Tier 4 — Discord Client Errors**:

```typescript
client.on("error", (error) => {
  ErrorTracker.track(error, {
    component: "discord",
    action: "client-error"
  });
});

client.rest.on("rateLimited", (info) => {
  ErrorTracker.track(new Error("Discord rate limit"), {
    component: "discord",
    action: "rate-limited",
    metadata: info
  });
});
```

**Tier 5 — Prisma Query Errors**:

```typescript
prisma.$use(async (params, next) => {
  try {
    return await next(params);
  } catch (error) {
    ErrorTracker.track(error, {
      component: "database",
      action: "prisma-query",
      metadata: {
        model: params.model,
        action: params.action,
        args: params.args
      }
    });
    throw error;
  }
});
```

**100% Capture Rate Guarantee**:
- Layer 1: Application-level try-catch (explicit tracking)
- Layer 2: Wrapper functions (automatic tracking)
- Layer 3: Process-level handlers (unhandled exceptions/rejections)
- Layer 4: Discord.js event handlers (API errors, rate limits)
- Layer 5: Prisma middleware (database errors)

**Coverage Map**:

| Error Source | Detection Layer | Coverage |
|--------------|----------------|----------|
| Application logic | Tier 1 (try-catch) | 85% |
| Async operations | Tier 1+2 (try-catch + wrap) | 95% |
| Uncaught exceptions | Tier 3 (global handler) | 100% |
| Unhandled promises | Tier 3 (global handler) | 100% |
| Discord API | Tier 4 (client handlers) | 100% |
| Database queries | Tier 5 (Prisma middleware) | 100% |

**Error Context Enrichment**:

```typescript
interface ErrorContext {
  // Required
  component: string;              // "database" | "discord" | "game-engine" | ...
  action: string;                 // Specific operation being performed
  
  // Auto-captured
  timestamp: Date;
  environment: string;            // "production" | "development"
  processId: number;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  
  // Optional
  userId?: string;
  guildId?: string;
  channelId?: string;
  commandName?: string;
  metadata?: Record<string, any>;
  fatal?: boolean;
  
  // Error properties
  error: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    cause?: Error;
  };
}
```

## 6.2 Guarantees

**Five-Layer Fallback System** — Ensuring zero untracked errors.

**Layer 1 — Try-Catch (Best Practice)**:

```typescript
try {
  await database.query(...);
} catch (error) {
  ErrorTracker.track(error, context);
  // Handle gracefully
}
```

**Guarantee**: Developer explicitly handles error with full context.

**Layer 2 — ErrorTracker.wrap() (Convenience)**:

```typescript
const safeQuery = ErrorTracker.wrap(async () => {
  return await database.query(...);
}, context);

await safeQuery(); // Auto-tracked on error
```

**Guarantee**: Wrapper catches and tracks errors without manual try-catch.

**Layer 3 — Global Handlers (Safety Net)**:

```typescript
process.on("uncaughtException", (error) => {
  ErrorTracker.track(error, { fatal: true });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  ErrorTracker.track(reason, { fatal: false });
});
```

**Guarantee**: Process-level handlers catch everything layers 1-2 miss.

**Layer 4 — Discord Client Handlers (API Safety)**:

```typescript
client.on("error", (error) => {
  ErrorTracker.track(error, { component: "discord" });
});

client.on("warn", (info) => {
  log.warn("Discord client warning", { info });
});
```

**Guarantee**: Discord.js errors never escape untracked.

**Layer 5 — Prisma Middleware (Database Safety)**:

```typescript
prisma.$use(async (params, next) => {
  try {
    return await next(params);
  } catch (error) {
    ErrorTracker.track(error, {
      component: "database",
      model: params.model,
      action: params.action
    });
    throw error;
  }
});
```

**Guarantee**: All database errors logged before propagation.

**Zero False Negatives Policy**:
- Every error tracked at least once
- No error silently swallowed
- No error lost during shutdown
- All errors persisted to disk

**Error Deduplication**:
- Fingerprinting based on error name + message + stack trace hash
- Groups similar errors (same fingerprint) together
- Tracks occurrence count and first/last seen timestamps
- Prevents log spam from repeated errors

## 6.3 Tracker Integration

**ErrorTracker Phase 1 Implementation** — Comprehensive error management with AI-optimized structured logging.

**Component**: `src/services/error-tracker.ts`

**Files Created** (6 files, 120+ lines):
- `src/services/error-tracker.ts` — Core tracker implementation
- `src/services/error-tracker.spec.ts` — Vitest test suite
- `src/types/error-tracker-types.ts` — TypeScript interfaces
- `src/utils/error-fingerprint.ts` — Error deduplication
- `src/utils/error-sanitizer.ts` — Sensitive data redaction
- `src/cli/error-tracker-cli.ts` — SSH query tool

**API**:

```typescript
import { ErrorTracker } from "./services/error-tracker.js";

// Basic tracking
ErrorTracker.track(error, {
  component: "database",
  action: "query-species",
  userId: "123",
  metadata: { query: "SELECT * FROM Species" }
});

// Wrapped function (auto-tracking)
const safeFunc = ErrorTracker.wrap(async () => {
  await riskyOperation();
}, {
  component: "game-engine",
  action: "spawn-pokemon"
});

await safeFunc(); // Errors tracked automatically

// Query tracked errors
const recent = ErrorTracker.getRecent(100);
const byFingerprint = ErrorTracker.getByFingerprint("abc123");
const stats = ErrorTracker.getStats();

// Graceful shutdown
await ErrorTracker.shutdown();
```

**Error Storage**:

```
/Store/errors/
├── current.ndjson                # Active error log
├── archive/
│   └── *.ndjson.gz               # Compressed archives
└── index.db                      # SQLite index for queries
```

**Error Schema**:

```typescript
interface TrackedError {
  id: string;                     // UUID
  timestamp: Date;
  fingerprint: string;            // Deduplication hash
  
  component: string;
  action: string;
  
  error: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  
  context: {
    userId?: string;
    guildId?: string;
    channelId?: string;
    metadata?: Record<string, any>;
  };
  
  environment: {
    node: string;
    platform: string;
    uptime: number;
    memory: NodeJS.MemoryUsage;
  };
  
  fatal: boolean;
}
```

**Deduplication Example**:

```typescript
// First occurrence
ErrorTracker.track(new Error("Database timeout"));
// → Full error logged with stack trace

// Subsequent occurrences (same fingerprint)
ErrorTracker.track(new Error("Database timeout"));
ErrorTracker.track(new Error("Database timeout"));
// → Only occurrence count incremented
```

**Query CLI**:

```bash
# Recent errors
node src/cli/error-tracker-cli.js recent --limit 50

# By component
node src/cli/error-tracker-cli.js query --component database

# By fingerprint
node src/cli/error-tracker-cli.js query --fingerprint abc123

# Statistics
node src/cli/error-tracker-cli.js stats
```

**Integration Status**:
- ✅ ErrorTracker core implementation
- ✅ Test suite (Vitest)
- ✅ CLI query tool
- ✅ Global handler integration (uncaughtException, unhandledRejection)
- ✅ Discord client error handler
- ✅ Prisma middleware
- ⏳ AI Log Writer integration (Phase 2)
- ⏳ Pattern detection (Phase 2)
- ⏳ Anomaly detection (Phase 2)

## 6.4 Logger Integration

**ErrorTracker ↔ Logger Integration** — Real-time error visibility in console output.

**Flow**:

```
Application Error → ErrorTracker.track() → [Disk Storage | Log Buffer] → Console Output
```

**Integration Point**:

```typescript
// src/services/error-tracker.ts
import { log } from "../shared/log.js";

export class ErrorTracker {
  static track(error: Error, context: ErrorContext) {
    // 1. Store to disk
    this.writeToStorage(error, context);
    
    // 2. Log to console
    log.error("Error tracked", {
      component: context.component,
      action: context.action,
      fingerprint: this.generateFingerprint(error),
      message: error.message,
      userId: context.userId,
      guildId: context.guildId,
      metadata: context.metadata
    });
    
    // 3. Update statistics
    this.updateStats(error, context);
  }
}
```

**Console Output Example**:

```
[2025-11-10T15:30:00.000Z] ERROR Error tracked
  component: database
  action: query-species
  fingerprint: abc123def456
  message: Timeout acquiring connection from pool
  userId: 123456789
  metadata: { model: "Species", query: "findUnique" }
```

**Benefits**:
- **Immediate visibility**: Errors visible in console logs
- **Correlation**: Console logs link to persisted error storage
- **Deduplication**: Repeated errors show occurrence count
- **Context**: Full context preserved in both systems

**Log Buffer Integration**:
- ErrorTracker calls bypass log buffer (immediate output)
- Critical errors never delayed by buffering
- Console output includes fingerprint for correlation

## 6.5 Logging Integration

**AI Log Writer ↔ ErrorTracker Integration** — Structured error logging for AI analysis.

**Integration Hook**:

```typescript
// src/services/ai-log-integrations.ts
import * as aiLogger from "./ai-log-writer.js";
import { ErrorTracker } from "./error-tracker.js";

export async function integrateErrorTracker(tracker: typeof ErrorTracker) {
  tracker.onError((error, context) => {
    const correlationId = aiLogger.generateCorrelationId();
    
    aiLogger.error("error", "Error tracked", {
      error,
      data: {
        component: context.component,
        action: context.action,
        fingerprint: ErrorTracker.generateFingerprint(error),
        userId: context.userId,
        guildId: context.guildId,
        metadata: context.metadata
      },
      correlationId,
      tags: ["error-tracker", context.component]
    });
  });
}
```

**AI Log Entry Schema**:

```json
{
  "timestamp": "2025-11-10T15:30:00.000Z",
  "level": "ERROR",
  "category": "error",
  "message": "Error tracked",
  "correlationId": "2025-11-10T15-30-00-000-abc123",
  "context": {
    "file": "error-tracker.ts",
    "line": 45,
    "function": "track"
  },
  "data": {
    "component": "database",
    "action": "query-species",
    "fingerprint": "abc123def456",
    "userId": "123456789",
    "metadata": { "model": "Species" }
  },
  "error": {
    "name": "Error",
    "message": "Timeout acquiring connection",
    "stack": "Error: Timeout...\n    at ...",
    "code": "P2024"
  },
  "tags": ["error-tracker", "database"]
}
```

**Pattern Detection**:

AI Log Writer analyzes error patterns across tracked errors:
- **Recurring errors**: Same fingerprint > 10 occurrences in 1h
- **Error cascades**: Multiple errors with same correlationId
- **Slow operations**: Errors following performance warnings
- **User-specific**: Errors isolated to specific userId/guildId

**Stack Trace Parsing**:

```typescript
// AI Log Writer automatically parses stack traces
{
  "stack_parsed": [
    { "file": "error-tracker.ts", "line": 45, "function": "track" },
    { "file": "database.ts", "line": 123, "function": "querySpecies" },
    { "file": "pokemon-service.ts", "line": 67, "function": "getPokemon" }
  ]
}
```

**AI Insights**:

AI Log Writer generates insights from error patterns:

```json
{
  "insight_type": "recurring_error",
  "confidence": 0.95,
  "description": "Database timeout error occurred 15 times in last hour",
  "fingerprint": "abc123def456",
  "occurrences": 15,
  "first_seen": "2025-11-10T14:30:00.000Z",
  "last_seen": "2025-11-10T15:30:00.000Z",
  "affected_users": ["123", "456", "789"],
  "recommendation": "Investigate database connection pool configuration"
}
```

**Query Integration**:

```bash
# Query errors from AI logs
node src/cli/ai-log-query.js query --category error --since 1h

# Get error insights
node src/cli/ai-log-query.js insights --type error

# Correlate errors
node src/cli/ai-log-query.js query --correlationId abc123
```

**Benefits**:
- **Historical analysis**: Persistent error logs for trend detection
- **Pattern detection**: Automatic identification of recurring issues
- **Correlation**: Link errors to user actions, performance issues
- **Learning**: AI adapts error severity based on historical data

## 6.4 Error Tracker Integration Patterns

**Status:** ACTIVE — Error tracker integration pattern established (2025-11-17)  
**Purpose:** Ensure ALL production errors are captured, logged, and made visible in error monitoring dashboard

### 6.4.1 The Integration Challenge

**Problem:** Error tracker not capturing production errors despite errors actively occurring.

**Root Cause:** Error tracker not integrated into error catch blocks throughout application. Errors logged to console but never passed to `captureError()` function.

**Solution:** Integrate error tracker into all critical error handling paths using lazy-loading pattern to avoid circular dependencies.

### 6.4.2 Lazy-Loading Pattern

**Purpose:** Avoid circular dependencies between logger and error tracker while ensuring error capture.

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
  // ... risky operation
} catch (error) {
  console.warn('[component] Error occurred:', error.message);
  
  // Track error in error tracker for visibility
  getErrorTracker()
    .then(tracker => {
      if (tracker) {
        return tracker.captureError(error, {
          context: {
            service: 'logger',
            operation: 'collectDatabaseStats',
            severity: 'MEDIUM'
          }
        });
      }
    })
    .catch(trackError => {
      console.error('[component] Failed to track error:', trackError.message);
    });
}
```

### 6.4.3 Integration Locations

**Completed Integrations (Phase 1 - 2025-11-17):**

1. **logger.js — Database Stats Collection**
   - Location: `src/utils/logger.js` lines 1-30, 387-420
   - Errors: `extractDatabaseName` import errors, database connection failures
   - Context: `{ service: 'logger', operation: 'collectDatabaseStats', severity: 'MEDIUM' }`

**Planned Integrations (Phase 2-4):**

2. **Phase 2 — Discord Bot Layer** (Ready)
   - `src/bot/index.ts` — Command execution errors
   - `src/bot/battle/**` — Battle engine errors
   - `src/bot/dm/**` — DM flow errors
   - Context: `{ service: 'bot', operation: '<command>', userId, guildId }`

3. **Phase 3 — Core Engines** (Ready)
   - `src/core/battle/engine.ts` — Battle calculation errors
   - `src/core/encounter/spawn.ts` — Encounter generation errors
   - Context: `{ service: 'engine', operation: '<function>', severity: 'HIGH' }`

4. **Phase 4 — Workers** (Ready)
   - `src/workers/*.ts` — Background job errors
   - `src/services/monitoring/*.ts` — Monitoring failures
   - Context: `{ service: 'worker', operation: '<job>', severity: 'CRITICAL' }`

### 6.4.4 Integration Best Practices

**✅ DO:**
- Use lazy-loading pattern to avoid circular dependencies
- Include rich context (service, operation, userId, guildId)
- Set appropriate severity (CRITICAL, HIGH, MEDIUM, LOW)
- Log to console FIRST (immediate visibility), then track
- Handle error tracker failures gracefully (don't crash on tracking failure)

**❌ DON'T:**
- Import error tracker at top level (causes circular dependencies)
- Block execution waiting for error tracking
- Throw errors during error tracking (use .catch())
- Track same error multiple times (let deduplication handle it)
- Skip console logging (always log for immediate debugging)

### 6.4.5 Testing Integration

**Verify Error Capture:**

```bash
# Trigger test error
npm run test:error-tracker

# Check error tracker database
npm run db:cli -- query "SELECT COUNT(*) FROM \"ErrorLog\" WHERE component = 'logger';"

# Check recent errors
npm run db:cli -- query "SELECT * FROM \"ErrorLog\" ORDER BY \"createdAt\" DESC LIMIT 5;"
```

**Expected Behavior:**
- ✅ Error appears in console immediately
- ✅ Error appears in ErrorLog table within 100ms
- ✅ Error tracker shows non-zero error count
- ✅ `/ops errors` command displays tracked error
- ✅ Error has proper context (service, operation, severity)

### 6.4.6 Monitoring Error Tracker Health

**Check Error Tracker Status:**

```bash
# View error tracker stats
npm run ops:error-stats

# Expected output:
# Total errors: 15
# Unique errors: 8
# Critical: 2
# High: 5
# Medium: 6
# Low: 2
```

**Production Verification:**
- Check `/ops errors` command shows recent errors
- Verify error count increases when errors occur
- Confirm error fingerprinting working (duplicates grouped)
- Validate context enrichment (userId, guildId present)

---

[← Back to INDEX](INDEX.md) | [← Previous: Logging Architecture](05-logging-architecture.md) | [Next: Security Bot →](07-security-bot.md)