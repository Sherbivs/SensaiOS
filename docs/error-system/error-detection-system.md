# Error Detection System Documentation

**Motto**: "No Silent Errors"  
**Version**: 1.0.0  
**Last Updated**: November 10, 2025

## Executive Summary

A multi-tier error detection system that:
1. **Captures** every error at every layer (process, service, domain, function)
2. **Learns** from error patterns to predict impact and suggest mitigations
3. **Recovers** automatically using proven strategies
4. **Alerts** operators for critical issues requiring human intervention
5. **Visualizes** errors in real-time through live logs and commands

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION RUNTIME                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │   Bot   │  │ Workers │  │ Engines │  │ Services│          │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘          │
│       │            │            │            │                 │
│       └────────────┴────────────┴────────────┘                 │
│                        │                                        │
│              Domain Error Handlers                             │
│       ┌────────────────┴────────────────┐                     │
│       │                                  │                     │
│  ┌────▼─────┐                    ┌──────▼──────┐             │
│  │  Error   │◄───────────────────┤   Error     │             │
│  │ Tracker  │   Fingerprinting   │  Learning   │             │
│  │ Service  │    Deduplication   │   Engine    │             │
│  │          │                    │             │             │
│  │ LIVE     │  ◄─── NO CACHING   │  Pattern    │             │
│  │ CAPTURE  │  ◄─── <1ms CONSOLE │  Detection  │             │
│  └────┬─────┘  ◄─── TRIPLE BACKUP└──────┬──────┘             │
│       │                                  │                     │
│       ├──────────────┬──────────────────┤                     │
│       │              │                  │                     │
│  ┌────▼────┐   ┌─────▼─────┐    ┌──────▼──────┐             │
│  │  Error  │   │   Error   │    │   Error     │             │
│  │Database │   │ Recovery  │    │  Alerting   │             │
│  │(PROD DB)│   │  Engine   │    │   System    │             │
│  │         │   │           │    │             │             │
│  │ Upsert  │   │ Auto-Retry│    │ DM Alerts   │             │
│  │ Atomic  │   │ Strategies│    │ Error Storm │             │
│  └─────────┘   └───────────┘    └─────────────┘             │
│       │              │                  │                     │
│       └──────────────┴──────────────────┘                     │
│                        │                                        │
│              ┌─────────▼─────────┐                            │
│              │  Live Error Stream│                            │
│              │  (EventEmitter)   │                            │
│              │  <100ms latency   │                            │
│              └─────────┬─────────┘                            │
│                        │                                        │
│              ┌─────────▼─────────┐                            │
│              │  Logger / Buffer  │                            │
│              │  ERROR SECTION    │                            │
│              │  (Real-time)      │                            │
│              └───────────────────┘                            │
│                                                                 │
│  EMERGENCY FALLBACK: Store/emergency-error-logs/*.json        │
└─────────────────────────────────────────────────────────────────┘
```

## Critical Design Principles

### 1. NO CACHING (Live Detection Only)

**Problem**: Cached error detection creates false negatives - errors that occur between cache refresh cycles are missed.

**Solution**: Every error is captured immediately with NO intermediate caching layer.

```typescript
// ❌ BAD: Cached detection (false negatives possible)
const errorCache = new Map();
setInterval(() => {
  // Refresh cache every 15 seconds
  errorCache.clear();
  errorCache.set('recent', await fetchRecentErrors());
}, 15000);

// ⚠️ Errors occurring between refreshes are invisible for up to 15 seconds!

// ✅ GOOD: Live capture (zero false negatives)
async function captureError(error: Error) {
  console.error(`🚨 [ERROR CAPTURED] ${error.message}`); // <1ms, immediate
  await prisma.errorLog.upsert({ /* ... */ }); // ~50ms, async
  liveErrorStream.emit('error', event); // <100ms, real-time
}
```

**Guarantee**: Every error visible in console within **<1ms**, database within **~50ms**, live stream within **<100ms**.

### 2. ZERO FALSE NEGATIVES (Triple Redundancy)

**Layers of Fallback**:

1. **Console Output** (tier 1) — Always succeeds, synchronous, <1ms
2. **Database Write** (tier 2) — Primary persistence, async, ~50ms
3. **Emergency Log** (tier 3) — Disk fallback if database fails, ~10ms
4. **Live Stream** (tier 4) — Real-time monitoring, <100ms

**Even in catastrophic database failure**, every error is captured somewhere:

```typescript
async captureError(error: Error) {
  // TIER 1: Immediate console (always succeeds)
  console.error(`🚨 [ERROR CAPTURED] ${error.message}`);
  
  try {
    // TIER 2: Primary persistence
    await prisma.errorLog.upsert({ /* ... */ });
    
    // TIER 4: Live stream
    liveErrorStream.emit('error', event);
  } catch (captureError) {
    // TIER 3: Emergency fallback
    await fs.writeFile(`Store/emergency-error-logs/error-${Date.now()}.json`, JSON.stringify(error));
    console.error('❌ [ERROR TRACKER FAILURE] Database write failed, emergency log created');
  }
}
```

**Guarantee**: **100% error capture** rate, regardless of database health.

### 3. CONSOLE FIRST (Immediate Visibility)

**Order of Operations**:

1. Console output (synchronous, <1ms)
2. Database write (async, non-blocking, ~50ms)
3. Live stream emit (async, non-blocking, <100ms)

**Why this order matters**:

```typescript
// ❌ BAD: Database first (50ms delay before visibility)
async captureError(error: Error) {
  await prisma.errorLog.create({ /* ... */ }); // 50ms database latency
  console.error('Error captured'); // Only visible after 50ms
}

// ✅ GOOD: Console first (immediate visibility)
async captureError(error: Error) {
  console.error(`🚨 [ERROR CAPTURED] ${error.message}`); // 0ms, immediate
  await prisma.errorLog.create({ /* ... */ }); // Happens after visibility
}
```

**Guarantee**: Every error visible in logs within **<1ms**, before any async operations.

### 4. ATOMIC UPSERT (No Race Conditions)

**Problem**: High-frequency errors (100+/second) could create race conditions with find-then-update logic.

**Solution**: Atomic upsert with increment.

```typescript
// ❌ BAD: Race condition
const existing = await prisma.errorLog.findUnique({ where: { fingerprint } });
if (existing) {
  // If another error captured between find and update, count is wrong!
  await prisma.errorLog.update({
    where: { fingerprint },
    data: { occurrenceCount: existing.occurrenceCount + 1 },
  });
}

// ✅ GOOD: Atomic upsert
await prisma.errorLog.upsert({
  where: { fingerprint },
  update: {
    occurrenceCount: { increment: 1 }, // Atomic, no race condition
  },
  create: { /* ... */ },
});
```

**Guarantee**: Accurate occurrence counts even at **1000+ errors/second**.

### 5. LIVE STREAM (Real-Time Monitoring)

**Problem**: Logger stats refresh every 15 seconds, creating up to 15s delay in ERROR MONITORING section.

**Solution**: Event-driven architecture with live stream.

```typescript
// Global event emitter
export const liveErrorStream = new EventEmitter();

// ErrorTracker emits immediately
liveErrorStream.emit('error', {
  errorId,
  fingerprint,
  severity,
  message,
  timestamp,
});

// Logger subscribes for real-time updates
liveErrorStream.on('error', (event) => {
  // Update ERROR MONITORING section immediately (no 15s delay)
  updateErrorMonitoringSection(event);
});
```

**Guarantee**: ERROR MONITORING section updates within **<100ms** of error occurrence (vs. 15s polling delay).

---

*See `docs/error-detection-guarantees.md` for comprehensive testing and verification procedures.*

## Error Taxonomy

### Categories (9 Types)

1. **VALIDATION** — Input validation failures, schema mismatches, type errors
2. **NETWORK** — HTTP errors, API timeouts, connection failures, rate limits
3. **DATABASE** — Query failures, connection errors, constraint violations, timeouts
4. **DISCORD** — Discord API errors, permission errors, interaction timeouts
5. **ENGINE** — Battle calculation errors, encounter errors, game logic failures
6. **WORKER** — Worker crashes, background job failures, scheduler errors
7. **CONFIG** — Missing environment variables, invalid configuration, startup errors
8. **CACHE** — Cache corruption, eviction errors, persistence failures
9. **UNKNOWN** — Uncategorized errors requiring human classification

### Severity Levels (4 Tiers)

| Severity | Description | Examples | Auto-Recovery | Alert |
|----------|-------------|----------|---------------|-------|
| **CRITICAL** | System-wide failure, data loss risk, service down | Database connection lost, Worker crash, Prisma client error | ✅ Immediate | 🚨 DM Admin |
| **HIGH** | Feature broken, user-facing errors, data inconsistency | Command failure, Battle calculation error, API timeout | ✅ Attempt | ⚠️ Log + /ops |
| **MEDIUM** | Degraded performance, recoverable errors, warnings | Cache miss, Retry exhausted, Timeout warning | ✅ Attempt | 📊 Stats only |
| **LOW** | Non-critical issues, informational, expected errors | Validation error, User input error, Rate limit (within quota) | ❌ No action | 📝 Log only |

### Error Fingerprinting

**Purpose**: Deduplicate identical errors, track occurrences, identify patterns.

**Algorithm**:
```javascript
function generateFingerprint(error, context) {
  const normalizedStack = error.stack
    ?.split('\n')
    .slice(0, 5) // Top 5 stack frames
    .map(frame => frame.replace(/:\d+:\d+/g, ':*:*')) // Remove line numbers
    .join('|');
  
  const key = `${error.name}|${error.message}|${normalizedStack}|${context.category}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}
```

**Benefits**:
- Same error = same fingerprint (deduplication)
- Different line numbers = same fingerprint (code changes don't create new entries)
- Different categories = different fingerprints (context matters)

## Database Schema

### ErrorLog Table (PROD PostgreSQL)

```sql
CREATE TABLE "ErrorLog" (
  "errorId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "fingerprint" VARCHAR(64) NOT NULL UNIQUE,
  "category" VARCHAR(20) NOT NULL, -- VALIDATION, NETWORK, DATABASE, etc.
  "severity" VARCHAR(10) NOT NULL,  -- CRITICAL, HIGH, MEDIUM, LOW
  
  -- Occurrence tracking
  "firstSeen" TIMESTAMP NOT NULL DEFAULT NOW(),
  "lastSeen" TIMESTAMP NOT NULL DEFAULT NOW(),
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  
  -- Error details
  "errorName" VARCHAR(255) NOT NULL,
  "errorMessage" TEXT NOT NULL,
  "stackTrace" TEXT,
  
  -- Context (JSONB for flexibility)
  "contextData" JSONB, -- {userId, guildId, commandName, service, operation, input}
  
  -- Recovery tracking
  "recoveryAttempted" INTEGER DEFAULT 0,
  "recoverySuccess" INTEGER DEFAULT 0,
  "lastRecoveryStrategy" VARCHAR(50),
  "lastRecoveryOutcome" VARCHAR(20), -- success, failed, partial
  
  -- Impact assessment
  "impactedFeatures" TEXT[], -- ['battles', 'encounters', 'commands.battle']
  "estimatedUserImpact" INTEGER, -- Number of users potentially affected
  
  -- Learning metadata (JSONB for ML features)
  "learningMetadata" JSONB, -- {hourlyPattern, correlatedErrors, cascadeParent, mitigationSuccess}
  
  -- Timestamps
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX "idx_errorlog_fingerprint" ON "ErrorLog"("fingerprint");
CREATE INDEX "idx_errorlog_category" ON "ErrorLog"("category");
CREATE INDEX "idx_errorlog_severity" ON "ErrorLog"("severity");
CREATE INDEX "idx_errorlog_lastseen" ON "ErrorLog"("lastSeen" DESC);
CREATE INDEX "idx_errorlog_occurrences" ON "ErrorLog"("occurrenceCount" DESC);
CREATE INDEX "idx_errorlog_context" ON "ErrorLog" USING GIN("contextData");
```

### ErrorAlert Table (Alert History)

```sql
CREATE TABLE "ErrorAlert" (
  "alertId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "errorId" UUID NOT NULL REFERENCES "ErrorLog"("errorId") ON DELETE CASCADE,
  "alertType" VARCHAR(20) NOT NULL, -- critical, pattern, new, escalation
  "recipientId" VARCHAR(20), -- Discord user ID
  "sentAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "acknowledged" BOOLEAN DEFAULT FALSE,
  "acknowledgedAt" TIMESTAMP,
  "acknowledgedBy" VARCHAR(20)
);

CREATE INDEX "idx_erroralert_errorid" ON "ErrorAlert"("errorId");
CREATE INDEX "idx_erroralert_sentat" ON "ErrorAlert"("sentAt" DESC);
```

## Core Services

### 1. ErrorTracker Service (`src/services/error-tracker.ts`)

**API**:

```typescript
interface ErrorContext {
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  userId?: string;
  guildId?: string;
  commandName?: string;
  service?: string;
  operation?: string;
  input?: Record<string, any>;
  customData?: Record<string, any>;
}

interface ErrorStats {
  totalUnique: number;
  totalOccurrences: number;
  bySeverity: Record<ErrorSeverity, number>;
  byCategory: Record<ErrorCategory, number>;
  criticalErrors: number;
  errorRate: number; // errors per hour
}

class ErrorTracker {
  // Capture and persist error
  async captureError(error: Error, context: ErrorContext): Promise<string>; // Returns errorId
  
  // Query errors
  async getErrorStats(since?: Date): Promise<ErrorStats>;
  async getRecentErrors(limit?: number, filters?: ErrorFilters): Promise<ErrorLog[]>;
  async getErrorByFingerprint(fingerprint: string): Promise<ErrorLog | null>;
  async getTopErrors(limit?: number, orderBy?: 'count' | 'recent'): Promise<ErrorLog[]>;
  
  // Update learning data
  async recordRecoveryAttempt(errorId: string, strategy: string, success: boolean): Promise<void>;
  async updateLearningMetadata(errorId: string, metadata: Partial<LearningMetadata>): Promise<void>;
}
```

**Implementation Highlights**:

1. **Fingerprint Generation**: Hash stack trace + message + category
2. **Deduplication**: Same fingerprint → increment `occurrenceCount`, update `lastSeen`
3. **Context Enrichment**: Merge provided context with automatic detection (current user, guild, command)
4. **Severity Classification**: Auto-classify based on error type and impact
5. **Database Persistence**: Write to PROD PostgreSQL `ErrorLog` table

### 2. Domain-Specific Error Handlers

**Bot Error Handler** (`src/bot/error-handler.ts`):
```typescript
class BotErrorHandler {
  handleCommandError(error: Error, interaction: CommandInteraction): Promise<void>;
  handleInteractionTimeout(interaction: Interaction): Promise<void>;
  handleDiscordAPIError(error: DiscordAPIError): Promise<void>;
  handleMemberFetchError(error: Error, guildId: string): Promise<void>;
}
```

**Engine Error Handler** (`src/core/engine-error-handler.ts`):
```typescript
class EngineErrorHandler {
  handleBattleError(error: Error, battleState: BattleState): Promise<void>;
  handleCalculationError(error: Error, calculation: string, inputs: any): Promise<void>;
  handleEncounterError(error: Error, encounterContext: EncounterContext): Promise<void>;
}
```

**Worker Error Handler** (`src/workers/worker-error-handler.ts`):
```typescript
class WorkerErrorHandler {
  handleWorkerCrash(workerName: string, error: Error): Promise<void>;
  handleTimeoutError(workerName: string, task: string): Promise<void>;
  handleSchedulerError(error: Error, job: string): Promise<void>;
}
```

**Service Error Handler** (`src/services/service-error-handler.ts`):
```typescript
class ServiceErrorHandler {
  handleDatabaseError(error: Error, operation: string, query?: string): Promise<void>;
  handleCacheError(error: Error, operation: string, key?: string): Promise<void>;
  handleAPIError(error: Error, endpoint: string, payload?: any): Promise<void>;
}
```

### 3. Error Learning Engine (`src/services/error-learning.ts`)

**Capabilities**:

1. **Pattern Detection**:
   - Time-of-day clustering (errors spike at certain hours?)
   - Correlation analysis (ErrorA always precedes ErrorB?)
   - Cascade detection (one error triggers multiple downstream errors?)
   - User impact patterns (certain guilds more affected?)

2. **Impact Prediction**:
   - Estimates affected features based on error category and context
   - Calculates estimated user impact (how many users can't use feature X?)
   - Predicts cascade effects (if DB connection lost, what else breaks?)

3. **Mitigation Suggestions**:
   - Recommends recovery strategies based on historical success rates
   - Suggests configuration changes (increase timeout, add retry logic)
   - Identifies root causes (multiple symptoms → single underlying issue)

4. **Knowledge Base Updates**:
   - Learns from recovery outcomes (strategy X works 80% for ErrorY)
   - Builds error relationship graph (ErrorA → ErrorB → ErrorC)
   - Tracks mitigation effectiveness over time

**API**:

```typescript
interface ErrorPattern {
  type: 'temporal' | 'correlation' | 'cascade' | 'impact';
  confidence: number; // 0.0 - 1.0
  description: string;
  affectedErrors: string[]; // fingerprints
  metadata: Record<string, any>;
}

interface MitigationSuggestion {
  strategy: string;
  confidence: number;
  successRate: number;
  estimatedRecoveryTime: number; // milliseconds
  automatable: boolean;
}

class ErrorLearningEngine {
  async detectPatterns(since?: Date): Promise<ErrorPattern[]>;
  async predictImpact(error: ErrorLog): Promise<ImpactPrediction>;
  async suggestMitigation(errorFingerprint: string): Promise<MitigationSuggestion[]>;
  async updateKnowledgeBase(): Promise<void>; // Background job
}
```

### 4. Error Recovery Engine (`src/services/error-recovery.ts`)

**Recovery Strategies** (Auto-Execution):

| Error Category | Strategy | Auto-Retry | Max Attempts | Backoff |
|----------------|----------|------------|--------------|---------|
| DatabaseConnectionError | Reconnect with exponential backoff | ✅ | 5 | 2^n seconds |
| DiscordAPIError (rate limit) | Queue and throttle requests | ✅ | ∞ | Rate limit window |
| TimeoutError | Increase timeout config, save to disk | ✅ | 3 | +250ms per attempt |
| CacheCorruption | Rebuild cache from source | ✅ | 1 | N/A |
| WorkerCrash | Restart worker with clean state | ✅ | 3 | 10s delay |
| ValidationError | Log + reject (no retry) | ❌ | 0 | N/A |
| NetworkError | Retry with exponential backoff | ✅ | 3 | 2^n seconds |

**API**:

```typescript
interface RecoveryResult {
  success: boolean;
  strategy: string;
  attemptsUsed: number;
  recoveryTime: number; // milliseconds
  outcome: 'success' | 'failed' | 'partial';
  message: string;
}

class ErrorRecoveryEngine {
  async attemptRecovery(error: Error, context: ErrorContext): Promise<RecoveryResult>;
  async getRecoveryStrategy(errorFingerprint: string): Promise<string | null>;
  async recordRecoveryOutcome(errorId: string, result: RecoveryResult): Promise<void>;
}
```

### 5. Error Alerting System (`src/services/error-alerting.ts`)

**Alert Types**:

1. **Critical Alert**: CRITICAL severity error → Immediate DM to admin
2. **Pattern Alert**: Error storm detected (>10 errors/min) → DM with summary
3. **New Error Alert**: First occurrence of unknown fingerprint → Log + /ops notification
4. **Escalation Alert**: Recovery failed 3x → Create Render incident

**API**:

```typescript
interface AlertConfig {
  criticalEnabled: boolean;
  patternEnabled: boolean;
  newErrorEnabled: boolean;
  escalationEnabled: boolean;
  recipientId: string; // Discord user ID
  errorStormThreshold: number; // errors per minute
}

class ErrorAlertingSystem {
  async alertOnCritical(error: ErrorLog): Promise<void>;
  async alertOnPattern(pattern: ErrorPattern): Promise<void>;
  async alertOnNewError(error: ErrorLog): Promise<void>;
  async escalateToRender(error: ErrorLog, reason: string): Promise<void>;
  
  async configureAlerts(config: Partial<AlertConfig>): Promise<void>;
  async getAlertHistory(limit?: number): Promise<ErrorAlert[]>;
}
```

## Logger Integration

### Enhanced Log Buffer with ERROR SECTION

**Location**: `src/utils/logger.js` lines 559-638 (DATABASE section) → Add ERROR section after

**Format**:

```
[ERROR MONITORING] (Last Hour)
  🚨 CRITICAL: 2 unique | 8 occurrences
  ⚠️  HIGH: 5 unique | 23 occurrences
  📊 MEDIUM: 12 unique | 156 occurrences
  📝 LOW: 31 unique | 892 occurrences

Top Errors:
  ❌ [CRITICAL] PrismaClientInitializationError (x5, 2m ago)
     → affecting: battles, encounters, trainer-ops
     → recovery: attempted 5x, failed 5x
  ❌ [HIGH] DiscordAPIError[50013] (x8, 5m ago)
     → affecting: permission-sweeps, role-management
     → recovery: attempted 3x, succeeded 2x
  ⚠️  [HIGH] TimeoutError: Member fetch timeout (x10, 8m ago)
     → affecting: security-sweeps
     → recovery: attempted 10x, succeeded 10x (timeout now 125.5s)
```

**Implementation**:

```javascript
// In src/utils/logger.js after collectDatabaseStats()
async function collectErrorStats() {
  try {
    const errorTracker = await import('../services/error-tracker.js');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const stats = await errorTracker.getErrorStats(oneHourAgo);
    const topErrors = await errorTracker.getTopErrors(3, 'recent');
    
    return { stats, topErrors, status: 'ready' };
  } catch (error) {
    return { status: 'unavailable', reason: error.message };
  }
}

// In printStats() add ERROR MONITORING section
if (statsCache.errors?.status === 'ready') {
  const { stats, topErrors } = statsCache.errors;
  
  console.log('\n[ERROR MONITORING] (Last Hour)');
  console.log(`  🚨 CRITICAL: ${stats.bySeverity.CRITICAL} unique | ${/* ... */} occurrences`);
  // ... format top errors with affecting features and recovery status
}
```

**Auto-Refresh**: Every 15 seconds with other stats, deduplicated through log buffer.

## Global Error Boundaries

### Process-Level Boundary (`src/index.ts`)

```typescript
// Catch all uncaught exceptions
process.on('uncaughtException', async (error: Error) => {
  await errorTracker.captureError(error, {
    category: 'UNKNOWN',
    severity: 'CRITICAL',
    service: 'process',
    operation: 'uncaughtException'
  });
  
  // Attempt graceful shutdown
  logger.error('CRITICAL: Uncaught exception, attempting graceful shutdown', error);
  await gracefulShutdown(1);
});

// Catch all unhandled promise rejections
process.on('unhandledRejection', async (reason: any, promise: Promise<any>) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  await errorTracker.captureError(error, {
    category: 'UNKNOWN',
    severity: 'HIGH',
    service: 'process',
    operation: 'unhandledRejection'
  });
  
  logger.error('Unhandled promise rejection', error);
});
```

### Discord Client Boundary (`src/bot/main.js`)

```javascript
// Error event handler
client.on('error', async (error) => {
  await errorTracker.captureError(error, {
    category: 'DISCORD',
    severity: 'HIGH',
    service: 'discord-client',
    operation: 'client-error'
  });
});

// Interaction error wrapper
async function handleInteractionWithErrorBoundary(interaction, handler) {
  try {
    await handler(interaction);
  } catch (error) {
    await errorTracker.captureError(error, {
      category: 'DISCORD',
      severity: 'HIGH',
      service: 'bot',
      operation: 'interaction',
      commandName: interaction.commandName,
      userId: interaction.user?.id,
      guildId: interaction.guildId
    });
    
    // Attempt recovery
    const recovery = await errorRecovery.attemptRecovery(error, { /* context */ });
    
    if (!recovery.success) {
      await interaction.reply({
        content: '⚠️ An error occurred. This has been logged and will be investigated.',
        ephemeral: true
      });
    }
  }
}
```

### Worker Boundary (`src/workers/engine-workers.ts`)

```typescript
function wrapWorkerWithErrorBoundary(worker: Worker) {
  const originalExecute = worker.execute.bind(worker);
  
  worker.execute = async function(...args: any[]) {
    try {
      return await originalExecute(...args);
    } catch (error) {
      await errorTracker.captureError(error as Error, {
        category: 'WORKER',
        severity: 'HIGH',
        service: 'workers',
        operation: worker.name
      });
      
      // Attempt recovery
      if (worker.restartable && worker.restartCount < 3) {
        logger.warn(`Worker ${worker.name} crashed, attempting restart...`);
        await restartWorker(worker);
      } else {
        logger.error(`Worker ${worker.name} crash limit reached, escalating...`);
        await errorAlerting.escalateToRender(/* ... */);
      }
      
      throw error; // Re-throw after logging and recovery attempt
    }
  };
}
```

## Admin Dashboard

### `/ops errors` Command

**Usage**:
```
/ops errors                          # Show summary
/ops errors --severity critical      # Filter by severity
/ops errors --category database      # Filter by category
/ops errors --since 24h              # Errors in last 24h
/ops errors --top 10                 # Top 10 most frequent
/ops errors --fingerprint abc123     # Details for specific error
```

**Output Format**:

```
🔍 ERROR DASHBOARD (Last 24 Hours)

📊 SUMMARY
  Total Unique Errors: 47
  Total Occurrences: 1,234
  Error Rate: 51.4 errors/hour
  
  By Severity:
    🚨 CRITICAL: 2 errors (18 occurrences)
    ⚠️  HIGH: 12 errors (234 occurrences)
    📊 MEDIUM: 18 errors (567 occurrences)
    📝 LOW: 15 errors (415 occurrences)
  
  By Category:
    DATABASE: 234 occurrences (18.9%)
    DISCORD: 456 occurrences (36.9%)
    ENGINE: 123 occurrences (10.0%)
    WORKER: 89 occurrences (7.2%)
    Other: 332 occurrences (26.9%)

🔥 TOP ERRORS (Most Frequent)
  1. ❌ [HIGH] DiscordAPIError[50013]: Missing Permissions
     Occurrences: 156 | First: 8h ago | Last: 2m ago
     Fingerprint: a1b2c3d4e5f6...
     Affecting: permission-sweeps, role-management
     Recovery: 145/156 succeeded (92.9%)
  
  2. ⚠️  [MEDIUM] TimeoutError: Member fetch timeout exceeded
     Occurrences: 98 | First: 12h ago | Last: 5m ago
     Fingerprint: f6e5d4c3b2a1...
     Affecting: security-sweeps
     Recovery: 98/98 succeeded (100%) - timeout auto-adjusted to 126.5s
  
  3. ❌ [CRITICAL] PrismaClientInitializationError
     Occurrences: 18 | First: 4h ago | Last: 30m ago
     Fingerprint: 1a2b3c4d5e6f...
     Affecting: battles, encounters, trainer-ops, ALL-DATABASE-OPERATIONS
     Recovery: 0/18 succeeded (0%) ⚠️ ESCALATED

⚠️  CRITICAL ERRORS REQUIRING ATTENTION
  • PrismaClientInitializationError (18x, last 30m ago)
    Status: ESCALATED to Render support
    Impact: ALL database operations offline
    Recommended: Check DATABASE_URL configuration and connection

📈 TRENDS (Compared to Previous 24h)
  Total Errors: +12.3% ⬆️
  Critical Errors: +200% ⚠️ (investigate immediately)
  Recovery Success Rate: 94.2% (stable)
```

## Integration Checklist

### Phase 1: Foundation (Week 1)
- [ ] Create ErrorLog and ErrorAlert tables (Prisma migration)
- [ ] Implement ErrorTracker service with fingerprinting and deduplication
- [ ] Add error boundaries to process, Discord client, workers
- [ ] Update logger.js with ERROR MONITORING section

### Phase 2: Domain Handlers (Week 2)
- [ ] Implement BotErrorHandler with Discord-specific error recognition
- [ ] Implement EngineErrorHandler for battle/encounter errors
- [ ] Implement WorkerErrorHandler for background job errors
- [ ] Implement ServiceErrorHandler for database/cache/API errors

### Phase 3: Intelligence (Week 3)
- [ ] Implement ErrorLearningEngine with pattern detection
- [ ] Implement ErrorRecoveryEngine with strategy execution
- [ ] Implement ErrorAlertingSystem with DM notifications
- [ ] Add background worker for hourly analysis

### Phase 4: Visibility (Week 4)
- [ ] Create /ops errors command with filtering and trends
- [ ] Integrate error stats into restart DM
- [ ] Add error metrics to /ops cache and /ops engine commands
- [ ] Create error dashboard web UI (optional)

### Phase 5: Integration (Week 5)
- [ ] Add ErrorTracker.captureError() to all try-catch blocks
- [ ] Replace console.error() with structured error tracking
- [ ] Add contextual enrichment to all error capture points
- [ ] Test error boundaries with injected failures

### Phase 6: Testing & Documentation (Week 6)
- [ ] Write unit tests for ErrorTracker, learning, recovery
- [ ] Write integration tests for error boundaries
- [ ] Document error taxonomy and severity guidelines
- [ ] Update router docs with error handling surfaces

## Success Metrics

1. **Zero Silent Errors**: 100% of runtime errors captured in ErrorLog
2. **Error Visibility**: All CRITICAL errors visible in logs within 1 second
3. **Recovery Rate**: ≥90% of HIGH/MEDIUM errors recovered automatically
4. **Alert Latency**: Admin notified within 30 seconds for CRITICAL errors
5. **Pattern Detection**: Error storms (>10/min) detected within 2 minutes
6. **Learning Accuracy**: Mitigation suggestions ≥80% success rate within 30 days

## Operational Runbook

### Daily Operations

1. **Morning Check**: Run `/ops errors --severity critical --since 24h`
2. **Review Patterns**: Check ERROR MONITORING section in live logs
3. **Acknowledge Alerts**: Mark critical alerts as acknowledged in ErrorAlert table
4. **Trend Analysis**: Compare error rates to previous period

### Incident Response

1. **Critical Error Storm**: Detected automatically, admin DM sent
2. **Investigation**: Use `/ops errors --fingerprint <fp>` for details
3. **Mitigation**: Apply suggested recovery strategies or manual intervention
4. **Post-Mortem**: Update ErrorLog.learningMetadata with root cause and fix

### Weekly Maintenance

1. **Pattern Review**: Run learning engine analysis, review detected patterns
2. **Recovery Tuning**: Adjust recovery strategies based on success rates
3. **Alert Calibration**: Fine-tune error storm threshold and alert rules
4. **Knowledge Base**: Review new error fingerprints, classify unknowns

## Future Enhancements

1. **Machine Learning**: Train ML model on historical data for better predictions
2. **Root Cause Analysis**: Automated RCA using error correlation graphs
3. **Proactive Detection**: Predict errors before they occur based on system state
4. **Self-Healing**: Automatically deploy fixes for known error patterns
5. **Cross-Service Correlation**: Detect errors spanning multiple services (bot + workers + DB)
6. **Performance Impact**: Track error impact on system performance metrics

---

**References**:
- See `src/services/error-tracker.ts` for ErrorTracker implementation
- See `src/services/error-learning.ts` for pattern detection algorithms
- See `src/bot/ops/admin.ts` for `/ops errors` command implementation
- See `src/utils/logger.js` for ERROR MONITORING section integration

**Referenced By**: README.md, Agents.md, ops/ROUTER.yaml, src/services/ROUTER.md
