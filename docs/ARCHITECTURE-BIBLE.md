# ARCHITECTURE BIBLE
**Centralized System Architecture Documentation** | **Created: 2025-11-16** | **Status: TEMPLATE (Phase 1 Week 3)**

## Purpose
Single source of truth for Infinity Gauntlet architectural design, component relationships, safety guarantees, and technical decisions. Consolidates 37 source documents into unified reference.

---

## Table of Contents

### 1. System Overview
- High-level architecture snapshot
- Technology stack
- Service topology
- Design principles

### 2. Database Architecture
- **2.1 Overview** — Database system design
- **2.2 Replication** — Master-replica cascade (Phase 16)
- **2.3 URL Selection** — Connection string logic (CRITICAL)
- **2.4 Multi-Client Runtime** — `prisma`, `onPremiseDevPrisma`, `experimentPrisma`

### 3. Worker Architecture
- **3.1 Core Design** — Worker topology, scaling roadmap
- **3.2 State Visibility** — Cross-worker state management

### 4. Event Bus
- Pub-sub event system (Phase 2.4)
- Correlation tracking
- Backpressure management

### 5. Logging Architecture
- **5.1 Core Design** — Intelligent logging system
- **5.2 Buffer Design** — Log buffering strategy
- **5.3 AI Integration** — AI-readable logs
- **5.4 Scaling** — Log scaling techniques

### 6. Error System
- **6.1 Detection Architecture** — Error detection design
- **6.2 Guarantees** — Error detection guarantees
- **6.3 Tracker Integration** — ErrorTracker integration
- **6.4 Logger Integration** — Logger-error bridge
- **6.5 Logging Integration** — Error-logging pipeline

### 7. Security Bot
- **7.1 State Persistence** — 7-day state history, restart continuity
- **7.2 Restart DMs** — Restart notification format

### 8. Router System
- Meta-router design
- Router-of-routers architecture
- Routing discipline

### 9. Game Engine
- **9.1 PBSL Manifesto** — Deterministic battle system
- **9.2 Battle DM Flow** — Battle interaction patterns
- **9.3 Cache Safety** — Engine cache guarantees
- **9.4 DB Replication** — Engine DB architecture (Phases 17-22)
- **9.5 DB Persistence Roadmap** — sql.js → better-sqlite3 migration
- **9.6 Event Tracking** — Event schema design
- **9.7 Dex V2** — Dexpack v2 architecture

### 10. Discord Bot
- **10.1 Command Suite** — Discord command overview
- **10.2 AI DM Commands** — AI DM guidance
- **10.3 Admin Command Spec** — Admin command specification
- **10.4 Admin Docs Index** — Admin documentation navigation

### 11. Safety Guarantees
- Memory safety
- Error isolation
- State persistence
- Disaster recovery

### 12. Observability
- **12.1 Metrics** — Metrics transparency design
- **12.2 Calculation Methods** — Metrics calculation

### 13. Performance
- **13.1 Optimization Roadmap** — System-wide optimization plan
- **13.2 Centralization** — Centralized architecture analysis

### 14. Future Roadmap
- System evolution vision
- Planned improvements
- Research areas

---

## Navigation

### Referenced By
*(To be populated during Phase 1 consolidation)*

### Cross-References
- **OPERATIONS-BIBLE.md** § Database Operations — Operational procedures
- **DEVELOPMENT-BIBLE.md** § Local Setup — Development environment
- **Agents.md** — Operations guide
- **README.md** — Getting started

---

## Section 1: System Overview

*(Content to be consolidated from `architecture/architecture.md` in Phase 1 Week 3)*

**Placeholder**: High-level architecture snapshot, technology stack, service topology, design principles.

---

## Section 2: Database Architecture

### 2.1 Overview

*(Content to be consolidated from `database/database-systems.md` in Phase 1 Week 3)*

**Placeholder**: Database system design, schema architecture, migration strategy.

### 2.2 Replication

*(Content to be consolidated from `database/db-replication-architecture.md` in Phase 1 Week 3)*

**Placeholder**: Master-replica cascade (PROD → DEV → Local), version tracking, sync orchestration.

### 2.3 URL Selection

**See**: OPERATIONS-BIBLE.md § Database Operations → URL Selection (CRITICAL operational procedures)

### 2.4 Multi-Client Runtime

**See**: OPERATIONS-BIBLE.md § Database Operations → Connections (runtime client configuration)

---

## Section 3: Worker Architecture

### 3.1 Core Design

*(Content to be consolidated from `deployment/workers.md` in Phase 1 Week 3)*

**Placeholder**: Worker topology, Render service matrix, Phase 10+ scaling roadmap, cost optimization.

### 3.2 State Visibility

*(Content to be consolidated from `architecture/cross-worker-state-visibility.md` in Phase 1 Week 3)*

**Placeholder**: Cross-worker state management, shared cache, coordination patterns.

---

## Section 4: Event Bus

*(Content to be consolidated from `architecture/phase2-event-bus-design.md` in Phase 1 Week 3)*

**Placeholder**: Pub-sub event system (Phase 2.4), correlation tracking, pattern matching, backpressure management.

---

## Section 5: Logging Architecture

### 5.1 Core Design

*(Content to be consolidated from `architecture/intelligent-logging-system.md` in Phase 1 Week 3)*

**Placeholder**: Intelligent logging system design, log levels, categorization, output formatting.

### 5.2 Buffer Design

*(Content to be consolidated from `architecture/log-buffer.md` in Phase 1 Week 3)*

**Placeholder**: Log buffering strategy, deduplication, aggregation, flush intervals.

### 5.3 AI Integration

*(Content to be consolidated from `architecture/AI-LOG-SYSTEM.md` in Phase 1 Week 3)*

**Placeholder**: AI-readable log format, context preservation, debugging assistance.

### 5.4 Scaling

*(Content to be consolidated from `architecture/AI-LOG-SCALING.md` in Phase 1 Week 3)*

**Placeholder**: Log scaling techniques, memory management, retention policies.

---

## Section 6: Error System

**Motto**: "No Silent Errors"  
**Mission**: Capture every error at every layer with zero false negatives, learn from patterns, recover automatically, and alert operators for critical issues.

### 6.1 Detection Architecture

**Purpose**: Multi-tier error detection ensuring 100% error capture rate regardless of database health.

#### Architecture Overview

```
Application Runtime → Domain Error Handlers → Error Tracker Service → [Database | Emergency Fallback] → Live Stream → Logger
```

**Core Components**:

1. **Error Tracker Service** (`src/services/error-tracker.ts`)
   - Captures errors with fingerprinting (SHA-256 hash of stack + message + category)
   - Deduplicates identical errors (same fingerprint → increment `occurrenceCount`)
   - Context enrichment (userId, guildId, commandName, service, operation, system state)
   - Severity classification (CRITICAL, HIGH, MEDIUM, LOW)
   - Database persistence (PostgreSQL `ErrorLog` table with atomic upsert)
   - Live stream emission (EventEmitter for real-time monitoring)

2. **Domain-Specific Error Handlers**
   - **BotErrorHandler** (`src/bot/error-handler.ts`): Discord API errors, interaction timeouts, permission errors
   - **EngineErrorHandler** (`src/core/engine-error-handler.ts`): Battle calculation errors, encounter logic failures
   - **WorkerErrorHandler** (`src/workers/worker-error-handler.ts`): Worker crashes, background job failures, scheduler errors
   - **ServiceErrorHandler** (`src/services/service-error-handler.ts`): Database errors, cache corruption, API timeouts

3. **Error Learning Engine** (`src/services/error-learning.ts`)
   - Pattern detection (time-of-day clustering, correlation analysis, cascade detection)
   - Impact prediction (affected features, estimated user impact, cascade effects)
   - Mitigation suggestions (recovery strategies with historical success rates)
   - Knowledge base updates (learns from recovery outcomes, builds error relationship graph)

4. **Error Recovery Engine** (`src/services/error-recovery.ts`)
   - Auto-retry strategies (exponential backoff for database/network errors, rate limit queuing, cache rebuild on corruption)
   - Recovery tracking (success rate, recovery time, strategy effectiveness)
   - Escalation (Render incident creation after 3 failed recovery attempts)

5. **Error Alerting System** (`src/services/error-alerting.ts`)
   - Critical alerts (immediate DM to admin for CRITICAL severity)
   - Pattern alerts (error storm detection >10/min)
   - New error alerts (first occurrence of unknown fingerprint)
   - Escalation alerts (recovery failed 3x → create Render incident)

**Error Taxonomy**:

**9 Categories**: VALIDATION (input failures, schema mismatches), NETWORK (HTTP errors, API timeouts, rate limits), DATABASE (query failures, connection errors, constraint violations), DISCORD (API errors, permission errors, interaction timeouts), ENGINE (battle calculation errors, encounter errors), WORKER (worker crashes, background job failures), CONFIG (missing env vars, invalid configuration), CACHE (cache corruption, eviction errors), UNKNOWN (uncategorized errors requiring human classification)

**4 Severity Levels**:
- **CRITICAL** (system-wide failure, data loss risk, service down) → Immediate recovery + DM admin
- **HIGH** (feature broken, user-facing errors, data inconsistency) → Attempt recovery + log + /ops
- **MEDIUM** (degraded performance, recoverable errors, warnings) → Attempt recovery + stats only
- **LOW** (non-critical issues, informational, expected errors) → Log only, no action

**Database Schema**:

```sql
-- ErrorLog table (PROD PostgreSQL)
CREATE TABLE "ErrorLog" (
  "errorId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "fingerprint" VARCHAR(64) NOT NULL UNIQUE,
  "category" VARCHAR(20) NOT NULL,  -- VALIDATION, NETWORK, DATABASE, etc.
  "severity" VARCHAR(10) NOT NULL,   -- CRITICAL, HIGH, MEDIUM, LOW
  
  -- Occurrence tracking
  "firstSeen" TIMESTAMP NOT NULL DEFAULT NOW(),
  "lastSeen" TIMESTAMP NOT NULL DEFAULT NOW(),
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  
  -- Error details
  "errorName" VARCHAR(255) NOT NULL,
  "errorMessage" TEXT NOT NULL,
  "stackTrace" TEXT,
  
  -- Context (JSONB for flexibility)
  "contextData" JSONB,  -- {userId, guildId, commandName, service, operation, stackMetadata, sourceLocation}
  
  -- Recovery tracking
  "recoveryAttempted" INTEGER DEFAULT 0,
  "recoverySuccess" INTEGER DEFAULT 0,
  "lastRecoveryStrategy" VARCHAR(50),
  "lastRecoveryOutcome" VARCHAR(20),  -- success, failed, partial
  
  -- Impact assessment
  "impactedFeatures" TEXT[],  -- ['battles', 'encounters', 'commands.battle']
  "estimatedUserImpact" INTEGER,  -- Number of users potentially affected
  
  -- Learning metadata (JSONB for ML features)
  "learningMetadata" JSONB,  -- {hourlyPattern, correlatedErrors, cascadeParent, mitigationSuccess}
  
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

-- ErrorAlert table (alert history)
CREATE TABLE "ErrorAlert" (
  "alertId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "errorId" UUID NOT NULL REFERENCES "ErrorLog"("errorId") ON DELETE CASCADE,
  "alertType" VARCHAR(20) NOT NULL,  -- critical, pattern, new, escalation
  "recipientId" VARCHAR(20),  -- Discord user ID
  "sentAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "acknowledged" BOOLEAN DEFAULT FALSE,
  "acknowledgedAt" TIMESTAMP,
  "acknowledgedBy" VARCHAR(20)
);
```

**Global Error Boundaries**:

```typescript
// Process-level (src/index.ts)
process.on('uncaughtException', async (error) => {
  await errorTracker.captureError(error, { category: 'UNKNOWN', severity: 'CRITICAL', service: 'process' });
  await gracefulShutdown(1);
});

process.on('unhandledRejection', async (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  await errorTracker.captureError(error, { category: 'UNKNOWN', severity: 'HIGH', service: 'process' });
});

// Discord client (src/bot/main.js)
client.on('error', async (error) => {
  await errorTracker.captureError(error, { category: 'DISCORD', severity: 'HIGH', service: 'discord-client' });
});

// Worker boundary (src/workers/engine-workers.ts)
function wrapWorkerWithErrorBoundary(worker) {
  // Try-catch wrapper with automatic restart on crash (max 3 attempts)
  // Escalates to Render after restart limit reached
}
```

### 6.2 Guarantees

**Zero False Negatives**: Triple redundancy ensures 100% error capture.

#### Five-Layer Fallback System

**Layer 1: Console Output (tier 1, <1ms)** — Always succeeds, synchronous:
```typescript
console.error(`🚨 [ERROR CAPTURED] ${timestamp}`);
console.error(`   Type: ${error.name}`);
console.error(`   Message: ${error.message}`);
console.error(`   Location: ${topFrame.relativeFilePath}:${topFrame.lineNumber}`);
```

**Layer 2: Database Write (tier 2, ~50ms)** — Primary persistence with atomic upsert:
```typescript
await prisma.errorLog.upsert({
  where: { fingerprint },
  update: {
    lastSeen: new Date(),
    occurrenceCount: { increment: 1 },  // Atomic, no race condition
    contextData: enrichedContext,
  },
  create: { /* ... */ },
});
```

**Layer 3: Emergency Log (tier 3, ~10ms)** — Disk fallback if database fails:
```typescript
await fs.writeFile(`Store/emergency-error-logs/error-${Date.now()}.json`, JSON.stringify(error));
```

**Layer 4: Live Stream (tier 4, <100ms)** — Real-time event emission to logger:
```typescript
liveErrorStream.emit('error', { errorId, fingerprint, severity, message, timestamp, parsedStack });
```

**Layer 5: Absolute Last Resort** — Console dump if all else fails:
```typescript
console.error('[ErrorTracker] Error data:', JSON.stringify({ error, context }));
```

**Latency Targets**:
- Console visibility: **<1ms** (synchronous, immediate)
- Database write: **~50-100ms** (async, non-blocking)
- Emergency fallback: **~10ms** (async file write)
- Live stream emission: **<100ms** (event emitter)
- Logger integration: **<100ms** (event subscriber)

**Critical Design Principles**:

1. **NO CACHING (Live Detection Only)** — Every error captured immediately with NO intermediate caching layer. Caching creates false negatives (errors occurring between refresh cycles are missed).

2. **CONSOLE FIRST (Immediate Visibility)** — Console output BEFORE any async operations. Order: console output (sync, <1ms) → database write (async, ~50ms) → live stream (async, <100ms). This ensures every error is visible within <1ms, before any async operations that might fail.

3. **ATOMIC UPSERT (No Race Conditions)** — Single atomic operation handles both insert and update with increment. Accurate occurrence counts even at 1000+ errors/second.

4. **LIVE STREAM (Real-Time Monitoring)** — Event-driven architecture with immediate emission to logger. Logger ERROR MONITORING section updates within <100ms (vs. 15s polling delay).

**Testing & Verification**:

```typescript
// Test 1: Console output latency
const start = performance.now();
await errorTracker.captureError(new Error('Test'), { service: 'test' });
const consoleLatency = performance.now() - start;
assert(consoleLatency < 1, 'Console output must be <1ms');

// Test 2: Database failure fallback
jest.spyOn(prisma, 'errorLog').mockImplementation(() => {
  throw new Error('Database unavailable');
});
const errorId = await errorTracker.captureError(new Error('Test'), { service: 'test' });
// Verify emergency log file created
const files = await fs.readdir('Store/emergency-error-logs');
assert(files.length > 0, 'Emergency log file created');

// Test 3: High-frequency accuracy (1000 identical errors)
await Promise.all(Array(1000).fill(0).map(() => 
  errorTracker.captureError(new Error('Timeout'), { service: 'test' })
));
// Verify occurrence count is exactly 1000 (no race conditions)
const errorLog = await prisma.errorLog.findUnique({ where: { fingerprint } });
assert(errorLog.occurrenceCount === 1000, 'Accurate count under high frequency');

// Test 4: Live stream latency
let streamReceived = false;
const start = performance.now();
liveErrorStream.once('error', (event) => {
  streamReceived = true;
  const latency = performance.now() - start;
  assert(latency < 100, 'Live stream latency must be <100ms');
});
await errorTracker.captureError(new Error('Test'), { service: 'test' });
assert(streamReceived, 'Live stream event emitted');
```

**Operational Checklist**:
- ✅ Console logs show `🚨 [ERROR CAPTURED]` for test errors
- ✅ Database ErrorLog table populated
- ✅ Emergency log directory exists: `Store/emergency-error-logs/`
- ✅ Logger ERROR MONITORING section visible
- ✅ Live stream events emitting (<100ms latency)

**Troubleshooting**:
- **Error not in console**: Error occurred before ErrorTracker initialized → Add error boundaries at process level
- **Error in emergency logs but not database**: Database connection issues → Check DATABASE_URL, verify Prisma connectivity
- **ERROR MONITORING section not updating**: Logger not subscribed to liveErrorStream → Add subscription in logger initialization
- **Inaccurate occurrence counts**: Race condition (find-then-update instead of upsert) → Verify atomic upsert with increment

### 6.3 Tracker Integration

**Phase 1 Complete (Critical User-Facing Paths)**: 6 files modified, 120+ lines added, 9 catch blocks enhanced.

**Integration Strategy**: Systematic integration of `errorTracker.captureError()` throughout codebase to ensure all errors tracked with contextual enrichment.

**Phase 1 Completed Files**:

1. **Daily Commands** (`src/bot/daily/claim.ts`) — Error tracking for daily quest claim failures with context (userId, guildId, commandName, operation)

2. **Battle Actions** (`src/bot/battle/actions.ts`) — Error tracking for move queue failures and switch action failures with context (battleId, playerKey, moveId/switchToId, operation)

3. **Battle Challenges** (`src/bot/battle/challenge.ts`) — Import added (DM delivery failures intentionally silent per best-effort patterns)

4. **DM Home Views** (`src/bot/dm/home.ts`) — Error tracking for DM delivery failures with context (userId, view type, fallback mode)

5. **Admin Operations** (`src/bot/ops/admin.ts`) — Error tracking for `/ops cache`, `/ops engine`, `/ops stats`, `/ops state` failures with category-specific context (CACHE, ENGINE, DATABASE, WORKER)

**Standard Error Tracking Pattern**:

```typescript
try {
  const result = await someOperation();
} catch (err) {
  // Track error with context
  await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
    category: 'DISCORD' | 'DATABASE' | 'ENGINE' | 'WORKER' | 'CACHE',
    userId: interaction?.user.id,
    guildId: interaction?.guildId || undefined,
    commandName: '/command-name',
    operation: 'module:function',
    context: {
      relevantId: 'value',
      input: 'parameters',
    },
  });
  
  // User-facing error message
  await interaction.reply({ content: "Operation failed. Please try again later.", ephemeral: true });
}
```

**Category Guidelines**:
- **DISCORD**: Discord API failures, interaction timeouts, DM delivery (rate limits, missing permissions, user blocked DMs)
- **DATABASE**: PostgreSQL/Prisma failures, connection issues, query timeouts (connection timeout, constraint violation, deadlock)
- **ENGINE**: Battle engine, encounter logic, calculation errors (invalid move queue, switch failure, damage overflow)
- **WORKER**: Background worker failures, scheduled task errors (worker crash, timeout, memory exceeded)
- **CACHE**: Cache corruption, Redis failures, eviction errors (cache miss on critical data, serialization failure)
- **UNKNOWN**: Unclassifiable or unexpected errors (generic JavaScript errors, unexpected types)

**Context Enrichment (Required Fields)**:
- `userId`: `interaction.user.id` — Always include for user-triggered operations
- `guildId`: `interaction.guildId || undefined` — Include for server context
- `operation`: `'module:function'` — Specific operation that failed
- Optional: `commandName` (/command-name), `battleId`, `encounterId`, `moveId`, `input` (relevant parameters)

**Phase 2-4 Pending**:
- **Phase 2: Service Layer** (15 files) — Cache facade, Engine DB services (cache, buffer, read-db, write-db), data pipeline
- **Phase 3: Worker Tasks** (5 files) — Engine workers, error learning worker, state persistence
- **Phase 4: Core Engine** (8 files) — Battle turn manager, encounter manager, calculation modules (damage, stats)

**Build Status**: ✅ PASSING (0 errors, 0 warnings)

### 6.4 Logger Integration

**Purpose**: Real-time error visibility in console output alongside Node, Database, and Security Bot metrics.

**Implementation**: `src/utils/logger.js` (+130 lines, ERROR MONITORING section added)

**Auto-Refresh**: Every 15 seconds with live stream integration.

**Console Format**:

```
[ERROR MONITORING] (Last Hour)
  🚨 CRITICAL: 2 unique | ⚠️  HIGH: 5 unique | 📊 MEDIUM: 12 unique | 📝 LOW: 31 unique
  Total: 50 unique errors | 234 occurrences | Rate: 3.90/min

  Top Recent Errors:
    ❌ [CRITICAL] PrismaClientInitializationError (x5, 2m ago) | Recovery: 0/5
       → affecting: battles, encounters, trainer-ops
    ⚠️  [HIGH] DiscordAPIError[50013] (x8, 5m ago) | Recovery: 6/8
       → affecting: permission-sweeps, role-management
    📊 [MEDIUM] TimeoutError: Member fetch timeout (x10, 8m ago) | Recovery: 10/10
       → affecting: security-sweeps

  Top Categories: DATABASE (45), DISCORD (30), WORKER (15)
```

**Live Stream Subscription**:

```javascript
// In src/utils/logger.js after collectDatabaseStats()
async function collectErrorStats() {
  const errorTracker = await import('../services/error-tracker.js');
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const stats = await errorTracker.getErrorStats(oneHourAgo);
  const topErrors = await errorTracker.getRecentErrors({ limit: 10, orderBy: 'lastSeen' });
  
  return { stats, topErrors, status: 'ready' };
}

// In printStats() add ERROR MONITORING section
if (statsCache.errors?.status === 'ready') {
  const { stats, topErrors } = statsCache.errors;
  
  console.log('\n[ERROR MONITORING] (Last Hour)');
  console.log(`  🚨 CRITICAL: ${stats.bySeverity.CRITICAL} unique | ...`);
  // ... format top 5 errors with affecting features and recovery status
}
```

**Display Logic**:
- Shows top 5 recent errors (from last 10 queried)
- Icon per severity: ❌ CRITICAL, ⚠️  HIGH, 📊 MEDIUM, 📝 LOW
- Occurrence count: `(x5)` = 5 occurrences of same error
- Time since last occurrence: `2m ago`
- Recovery statistics: `0/5` = 0 successes out of 5 attempts
- Impacted features: First 3 features shown
- Top 3 error categories with counts

**Performance Impact**:
- **Memory overhead**: ~50 KB per refresh cycle (summary stats 1 KB + top 10 errors 5 KB each)
- **CPU overhead**: <5ms per refresh cycle (database query 2-3ms + transformation/formatting <2ms)
- **Database load**: Minimal (1 query per 15s = 4 queries/min = 240 queries/hour, indexed queries ~2-3ms each)
- **Network overhead**: None (local database queries)

**Operational Benefits**:
- **Immediate error visibility**: Errors visible in same console view as runtime metrics (no SSH/database queries needed)
- **Quick diagnosis**: Severity breakdown shows error distribution at glance, top errors highlight most frequent issues, recovery stats show which errors self-heal
- **Proactive monitoring**: Error rate shows if errors increasing, time since last shows if errors still occurring, category breakdown identifies problem areas
- **Zero-cost debugging**: Real-time updates every 15s without manual log parsing or database queries

### 6.5 Logging Integration

**Purpose**: Comprehensive guide to integrated error detection, stack trace parsing, and intelligent logging for AI-powered troubleshooting.

**Components**: error-tracker.ts, stack-trace-parser.ts, intelligent-logger.ts

**Architecture Flow**:

```
Error Occurs
    │
    ▼
error-tracker.ts
    │
    ├─► Parse Stack Trace (stack-trace-parser.ts)
    │   ├─► Extract file/line/function
    │   ├─► Build call chain
    │   ├─► Get source code snippets
    │   └─► Calculate importance
    │
    ├─► Enrich Context (system state, environment, AI troubleshooting hints)
    ├─► Persist to Database (PostgreSQL, fingerprint deduplication)
    ├─► Generate AI Report (async, fire-and-forget, Store/error-reports/)
    ├─► Emit to Live Stream (liveErrorStream)
    │   └─► intelligent-logger.ts subscribes
    └─► Emergency Fallback (if DB fails, Store/emergency-error-logs/)
```

**Stack Trace Parsing** (`src/utils/stack-trace-parser.ts`):

**Features**:
- Frame extraction (parse V8 stack traces into structured frames)
- Source locations (file path, line number, column number)
- Function names (extract function/method names from stack)
- Call chain (reconstruct execution flow: A → B → C)
- Source snippets (extract 3 lines around error: before, error line, after)
- TypeScript support (handle compiled JS → TS source maps, future enhancement)

**Stack Frame Structure**:
```typescript
interface StackFrame {
  functionName: string | null;          // "BattleEngine.resolveTurn"
  filePath: string | null;               // Absolute path
  relativeFilePath: string | null;       // "src/core/battle-engine.ts"
  lineNumber: number | null;             // 1-indexed
  columnNumber: number | null;           // 1-indexed
  fileType: 'typescript' | 'javascript' | 'native' | 'unknown';
  isNodeModule: boolean;                 // Skip node_modules
  isNative: boolean;                     // Native Node.js code
  isAnonymous: boolean;                  // Anonymous function
  raw: string;                           // Original frame string
  sourceSnippet?: SourceSnippet;        // Source code around error
}
```

**Error Context Snapshot** (`captureErrorContextSnapshot()`):

Captures complete system state at error time:
```typescript
interface ErrorContextSnapshot {
  timestamp: string;                    // ISO 8601
  error: { name, message, fingerprint };
  stackTrace: ParsedStackTrace;        // Full parsed stack
  system: {
    nodeVersion: string;                // "v20.10.0"
    platform: string;                   // "win32"
    architecture: string;               // "x64"
    memoryUsage: NodeJS.MemoryUsage;    // RSS, heap, external
    uptime: number;                     // Process uptime (seconds)
  };
  environment: {
    cwd: string;                        // Working directory
    execPath: string;                   // Node.js binary path
    execArgv: string[];                 // Node.js arguments
    env: Record<string, string>;        // Safe env vars (no secrets)
  };
  context?: Record<string, any>;       // Additional context
  troubleshootingHints: string[];      // AI-optimized hints
}
```

**Troubleshooting Hints** (automatically generated):
- Primary location: "Error originated in: src/core/battle-engine.ts:42"
- Error type hints: "TypeError suggests: undefined/null access, incorrect type usage"
- Call chain: "Call sequence: resolveTurn → executeBattle → handleCommand"
- Memory pressure: "⚠️ High memory usage: 92.3% heap used - possible memory leak"
- Review files: "Review user code in: src/core/battle-engine.ts, src/commands/battle.ts"
- Stack depth: "⚠️ Deep call stack (>50 frames) - possible infinite recursion"

**AI-Optimized Error Reports** (`formatErrorReportForAI()`):

**Storage**: `Store/error-reports/error-{fingerprint}-{timestamp}.md`

**Format**:
```markdown
# 🔍 AI Error Analysis Report

**Generated:** 2025-11-10T15:42:33.182Z
**Error:** TypeError: Cannot read property 'hp' of undefined
**Fingerprint:** `a1b2c3d4e5f6`

## 💡 Troubleshooting Hints
- Error originated in: src/core/battle-engine.ts:42
- TypeError suggests: undefined/null access, incorrect type usage
- Call sequence: resolveTurn → executeBattle → handleCommand
- Review user code in: src/core/battle-engine.ts

## 📚 Stack Trace
**Depth:** 15 frames | **User Code Frames:** 3
**Call Chain:** resolveTurn → executeBattle → handleCommand → ...

### Frame 1: BattleEngine.resolveTurn
**Location:** `src/core/battle-engine.ts:42:15`
**Source:**
```typescript
41:   const targetPokemon = battle.getActivePokemon(target);
42:   if (targetPokemon.hp <= 0) { <-- ERROR HERE
43:     return { success: false, reason: 'target-fainted' };
```

## 🖥️  System State
- **Node.js:** v20.10.0
- **Platform:** win32 (x64)
- **Uptime:** 3247s
- **Memory:** RSS 154.23 MB | Heap 98.45 MB/128.00 MB

## 🌍 Environment
- **Working Directory:** `C:/Users/sherb/OneDrive/Documents/GitHub/Infinity-Gauntlet`
- **Node Binary:** `C:/Program Files/nodejs/node.exe`
```

**Intelligent Logger Integration** (`src/utils/intelligent-logger.ts`):

**Live Stream Subscription**:
```typescript
// In IntelligentLogger constructor
liveErrorStream.on('error', (event: LiveErrorEvent) => {
  const message = `[ERROR-TRACKER] ${event.errorName}: ${event.errorMessage}`;
  
  // Log with full stack trace metadata
  this.log('error', message, {
    category: 'ERROR',
    data: {
      errorId: event.errorId,
      fingerprint: event.fingerprint,
      severity: event.severity,
      stackMetadata: {
        depth: event.parsedStack.depth,
        topFrame: { file, line, column, function },
        callChain: event.callChain,
        userCodeFrames: event.parsedStack.userCodeFrames.length,
      },
      sourceLocation: { file, line, column },
      errorContext: event.context,
    },
  });
});
```

**Enhanced Log Entry Schema**:
```typescript
interface LogEntry {
  context: {
    error?: {
      name: string;
      message: string;
      stack: string;
      fingerprint: string;
      stackMetadata?: {
        depth: number;
        topFrame?: { file, line, column, function };
        callChain: string[];
        userCodeFrames: number;
      };
      sourceLocation?: { file, line, column };
    };
  };
}
```

**Storage Locations**:
- **Intelligent Logs**: `Store/intelligent-logs/current.jsonl` (JSONL, live log stream)
- **Error Reports**: `Store/error-reports/error-{fp}-{ts}.md` (Markdown, AI-optimized analysis)
- **Emergency Logs**: `Store/emergency-error-logs/error-{ts}.json` (JSON, fallback when DB fails)
- **Hourly Archive**: `Store/intelligent-logs/hourly/*.jsonl.gz` (24h retention)
- **Daily Archive**: `Store/intelligent-logs/daily/*.jsonl.gz` (30d retention)
- **Monthly Archive**: `Store/intelligent-logs/archive/*.tar.gz` (90d retention)

**SSH CLI Access** (`scripts/log-cli.sh`):

**Error Analysis Commands**:
```bash
# Trace error by fingerprint
log-cli.sh error trace --fingerprint a1b2c3d4e5f6

# Get system context at error time
log-cli.sh error context --fingerprint a1b2c3d4e5f6

# Get AI-powered fix suggestions
log-cli.sh error suggest --fingerprint a1b2c3d4e5f6

# Find similar errors
log-cli.sh error similar --fingerprint a1b2c3d4e5f6

# View events ±5 minutes around error
log-cli.sh error timeline --fingerprint a1b2c3d4e5f6 --window 10m
```

**Performance Characteristics**:
- Stack parsing: <1ms (sync), 10,000+ ops/sec, 100% reliability
- Database write: ~50ms (async), 100+ writes/sec, 99.9% reliability
- AI report generation: ~100ms (background), fire-and-forget, best-effort
- Live stream emit: <0.5ms (sync), 50,000+ events/sec, 100% reliability
- Intelligent logger: <1ms (async buffer), 1000+ logs/sec, 100% reliability
- Emergency fallback: ~10ms (disk I/O), 100+ writes/sec, 100% reliability

**Total error capture latency**: ~52ms (parsing + DB write)  
**User-facing impact**: **ZERO** (async, non-blocking)

**Zero False Negatives Guarantee**: Five layers ensure NO ERRORS ARE LOST:
1. **Layer 1: Console output** (<1ms, always succeeds)
2. **Layer 2: Database persistence** (~50ms, primary storage)
3. **Layer 3: Live stream emit** (<100ms, real-time monitoring)
4. **Layer 4: Emergency file fallback** (~10ms, if DB fails)
5. **Layer 5: Absolute last resort** (console dump if all else fails)

---

## Section 7: Security Bot

### 7.1 State Persistence

*(Content to be consolidated from `architecture/security-bot-state.md` in Phase 1 Week 3)*

**Placeholder**: 7-day state history, hourly snapshots, restart continuity, cumulative statistics.

### 7.2 Restart DMs

*(Content to be consolidated from `architecture/restart-dm-format.md` in Phase 1 Week 3)*

**Placeholder**: Restart notification format, operational summary, activity timeline.

---

## Section 8: Router System

*(Content to be consolidated from `architecture/meta-router.md` in Phase 1 Week 3)*

**Placeholder**: Meta-router design, router-of-routers architecture, routing discipline, navigation patterns.

---

## Section 9: Game Engine

### 9.1 PBSL Manifesto

**Official Statement**: PBSL = Pokémon Buddy System Logics. Deterministic, auditable framework for Discord battles.

**Core Pillars:**
1. **Determinism & Auditability** — Every damage roll, catch check, status proc reproducible from a logged seed
2. **Truth Hierarchy** — Upstream Pokémon data (PokeAPI/Bulbapedia) → immutable snapshot → runtime decisions
3. **Adaptable Interfaces** — Clean contracts allow swap-out implementations (e.g., different RNG, alternative formulas)
4. **Continuous Validation** — Unit tests + integration tests + oracle fixtures guard against regressions
5. **Provenance First** — Log source references for moves, abilities, formulas before results

**Module Layout:**
- `src/core/pbsl/rng.ts` — Seeded RNG with `next()`, `nextInRange()`, `shuffle()`, audit trail
- `src/core/pbsl/audit.ts` — Structured log recorder for battle events
- `src/core/pbsl/phases.ts` — Turn phases (selection → priority → execution → end-of-turn)
- `src/core/battle/engine.ts` — Battle state machine using PBSL components
- `src/core/encounter/generator.ts` — Wild Pokémon spawning with seeded RNG
- `src/data/provenance.ts` — Upstream source metadata (PokeAPI versions, Bulbapedia timestamps)

**Oracle Fixtures**: `tests/pbsl/oracle.spec.ts` validates deterministic outcomes match upstream expectations. Snapshots include: seed, moves, damage ranges, status effects, catch rates. Any change to formulas requires oracle update + approval.

**Launch Blockers (12 items):**
1. **User management & data storage** — Prisma models for User, TrainerProfile, PokemonInstance, Inventory
2. **Game init trigger** — `/start` command creates TrainerProfile, spawns starter selection
3. **Player options** — Starter selection menu with 3 options + confirmation
4. **Starter selection** — `/choose-starter <name>` creates first PokemonInstance
5. **Catching/obtaining & storage (Pokébox)** — `/catch <ball>` during encounter, stored in Inventory
6. **Battle event triggers (emoji-based 👀)** — React with 👀 to opponent's message triggers battle DM flow
7. **Battle log delivery (DM + arena broadcast)** — DM both trainers with move/switch buttons, broadcast summary to arena
8. **Arena channel safety & moderation** — Security bot monitors role changes, auto-reverts unauthorized edits
9. **Commands & events (Discord)** — Slash commands + button interactions + emoji reactions
10. **Observability & ops** — `/ops` command suite with error dashboard, cache stats, battle metrics
11. **Minimal data schemas (Prisma models)** — User, TrainerProfile, PokemonInstance, Battle, Encounter, Inventory
12. **Acceptance criteria for "launchable"** — All 11 blockers resolved + smoke tests passing + observability green

**Compliance Checklist:**
- ✅ Deterministic RNG (seeded PRNGs with audit trails)
- ✅ Battle phases (selection → priority → execution → end-of-turn)
- ✅ Encounter generator (wild spawns with seeded RNG)
- ✅ Audit trail (structured logs for damage, status, catch checks)
- ✅ Provenance metadata (upstream sources tracked via `data/provenance.ts`)
- ✅ Oracle CI (tests/pbsl/oracle.spec.ts validates deterministic outcomes)
- 🔄 Citations ledger (planned: link every formula to upstream URL)
- 🔄 Adapter integration (planned: swap RNG/formula implementations via DI)

**Governance & Contributions:**
- **Gameplay changes require upstream sources** — No formula changes without Bulbapedia/Smogon citation
- **Automated tests required** — Every new formula needs unit test + oracle fixture
- **Provenance metadata schema** — Track PokeAPI version, Bulbapedia permalink, last-verified timestamp

**Next Steps:**
1. Wire PBSL into legacy flows (replace ad-hoc RNG with seeded `rng.next()`)
2. Extend provenance metadata (add Smogon damage calculator URLs)
3. Document adapter patterns (RNG interface, formula interface)
4. Grow oracle fixture catalog (cover all Gen 1-3 mechanics)

---

### 9.2 Battle DM Flow

Battle DM experience drives every turn through ephemeral component menus so both trainers submit actions without leaving the conversation. Lightweight flow while full arena automation matures.

**Turn Prompts:**
- When battle enters `Active` state, DM both participants "Your Move" embed with **Move**, **Switch**, **Forfeit** buttons
- Selecting **Move** opens follow-up select menu listing active Pokémon's legal moves (PP callouts when available)
- Trainer chooses option, handler immediately queues move in turn manager
- Ephemeral prompt updates to confirm choice, waits for opponent if not yet acted
- Choosing **Switch** works same way: select menu lists only healthy, non-active party members
- Picking target queues swap with battle engine API, updates cached battle state, confirms pending switch

**Turn Resolution:**
- Both move and switch submissions land in turn queue managed by `src/core/battle/turn-manager.ts`
- Once each trainer has pending action, queue resolves turn, swaps active combatants when required
- Immediately sends next "Your Move" DM to both players
- Ensures ongoing battles keep moving without manual pinging in arena thread
- Failures to deliver DMs are best-effort and logged for observability work
- Handler will not block turn resolution if Discord API rejects delivery

---

### 9.3 Cache Safety

**As of 2025-11-09**, Engine Cache (L1 cache layer) implements comprehensive safety mechanisms to prevent corruption and protect against game crashes.

**Critical Safety Features:**

**1. Read-Only Data Protection**

**Private Fields**: All cache storage Maps are `private` and cannot be accessed directly:
```typescript
private pokemon: Map<number, PokemonCacheEntry> = new Map();
private moves: Map<number, MoveCacheEntry> = new Map();
private typeChart: Map<string, number> = new Map();
```

**Defensive Copies**: All getter methods return defensive copies to prevent external mutations:
```typescript
getPokemon(id: number): PokemonCacheEntry | null {
  const result = this.pokemon.get(id);
  if (result) {
    return { ...result, baseStats: { ...result.baseStats } };
  }
  return null;
}
```

**Controlled Writes**: Only two methods can modify cache data:
1. `initialize()` — Startup initialization (blocking, one-time)
2. `refresh()` — Background refresh (atomic swap via double-buffering)

Both methods are `private` and called only by EngineCache class itself.

**2. Corruption Detection**

**Data Checksum**: Simple hash calculated after every data modification (fingerprint: P:1328:1,2,3...|M:900:33,85...|T:324:1:2,1:3...). Fast hash, not cryptographic, just corruption detection.

**Integrity Verification**: Comprehensive checks run periodically:
```typescript
verifyIntegrity(): boolean {
  // Check 1: Maps not empty if initialized
  // Check 2: Secondary indexes match primary maps
  // Check 3: Data structure sanity (IDs match keys)
}
```

**Automatic Detection**: Integrity checks run before/after every background refresh (hourly) + on-demand via `verifyIntegrity()`.

**3. Corruption Response**

**Refuse Reads**: If corruption detected, all getters return safe defaults:
```typescript
getPokemon(id: number): PokemonCacheEntry | null {
  if (this.corruptionDetected) {
    log('error', 'Cache corruption detected, refusing read');
    return null; // Safe: Battle engine handles null gracefully
  }
  // ... normal read
}
```

**Block Refresh**: Corrupted cache won't be refreshed (prevents cascading corruption). Manual intervention required.

**Observability**: Corruption status exposed via `/ops engine` command (isHealthy, corruptionDetected, dataChecksum).

**4. Atomic Updates (Double-Buffering)**

**Non-Blocking Refresh**: Background refresh builds new cache without affecting ongoing battles:
```typescript
async refresh(): Promise<void> {
  // Step 1: Build new Maps (doesn't touch current cache)
  const newPokemon = new Map();
  const newMoves = new Map();
  // ... load data into new Maps ...
  
  // Step 2: Atomic swap (battles see old OR new, never partial)
  this.pokemon = newPokemon;
  this.moves = newMoves;
  // Old Maps garbage collected automatically
}
```

**Race Condition Protection**: Refresh flag prevents concurrent refreshes (`isRefreshing` boolean guard).

**What This Prevents:**

✅ **Prevented Scenarios:**
1. External Mutation — Battle engine receives defensive copies, modifications don't affect cache
2. Concurrent Writes — Only refresh() can write, protected by `isRefreshing` flag
3. Partial Updates — Atomic swap ensures battles never see half-updated cache
4. Cascading Corruption — Corrupted cache won't be refreshed, preventing propagation
5. Silent Failures — Corruption detection logs errors and returns safe defaults

⚠️ **Attack Vectors Still Possible (But Mitigated):**
1. Memory Pressure — OS could kill process if cache grows too large (Mitigation: Memory usage tracked, 20MB target enforced)
2. Malicious Code — Another module with access to `engineCache` object (Mitigation: Private fields, no public setters, defensive copies; TypeScript/JavaScript cannot prevent prototype pollution from determined attacker)
3. Logic Bugs — Bug in refresh() could load invalid data (Mitigation: Integrity checks detect structural issues, checksum detects unexpected changes)

**Emergency Recovery:**
- Automatic: Cache refuses reads, returns safe defaults (null/neutral)
- Manual: Restart application to re-initialize cache from Read-DB
- Debug: Check logs for corruption detection messages with context

**Performance Impact:**
- Defensive Copies: ~2-5μs overhead per read (still <10μs target)
- Corruption Checks: ~50-100μs every hour (negligible)
- Checksum Update: ~10-20μs after refresh (one-time)
- **Net Impact**: <1% performance overhead for significant safety improvement

**Contract (Absolute)**: Engine Cache data MUST NOT be modified by any code outside `engine-cache.ts`. Violations will cause game crashes and unpredictable battle outcomes.

**Enforcement**: TypeScript private fields + defensive copies + corruption detection + periodic integrity checks.

---

### 9.4 DB Replication

**As of 2025-11-09**, Engine DB implements production-ready 3-tier caching with write buffering, background workers, and comprehensive monitoring. Phase 17-22 delivered 4,416 lines with 0 build errors and 10-100x performance improvements.

**Architecture**: PROD → L1 Cache (Map) → Read-DB (SQLite) → Game Engine → Write Buffer → Write-DB (SQLite) → Validator → PROD

**Purpose**: Provide ultra-fast local lookups (<1μs L1, ~50ms SQLite vs 50-100ms PostgreSQL), enable offline gameplay, validate data quality before PROD upload, capture battle outcomes for analysis.

**Runtime Principle**: Game engine operates on fast in-memory cache (L1). Read-DB/Write-DB synchronization happens asynchronously in background workers. Battles never block on disk I/O or replication.

**Completed Implementation (4,416 lines):**

**1. Engine Cache (L1 In-Memory)** — `src/services/engine-cache.ts` (661 lines)
- API: `getPokemon(id)`, `getPokemonByName(name)`, `getMove(id)`, `getTypeEffectiveness(attack, defense)`, `getStats()`
- Data structures: `pokemon` Map (by ID), `pokemonByName` Map (secondary index), `moves` Map, `typeChart` Map
- Performance: <1μs read latency, 20 MB memory, 10M+ ops/sec throughput
- Refresh: Hourly background refresh with double-buffering (atomic swap)
- Integration: `src/data/dexpack.js` uses cache-first lookup pattern
- Safety: Defensive copies, corruption detection, automatic integrity checks

**2. Write Buffer (In-Memory Queues)** — `src/services/engine-write-buffer.ts` (476 lines)
- API: `logBattle(entry)`, `logMoveUsage(entry)`, `logAnomaly(entry)`, `flush()`, `getStats()`
- Data structures: `battleLogQueue[]`, `moveUsageQueue[]`, `anomalyQueue[]` (arrays)
- Performance: <10μs push latency, 10k entries per queue max
- Backpressure: 75% warn, 95% reject, <50% deactivate
- Flush: Every 30s (atomic splice), calls Write-DB insert methods
- Integration: `src/commands/battle-turn.js` logs move usage + battle completion

**3. Background Workers (4 Workers)** — `src/workers/engine-workers.ts` (655 lines)
- Worker 1: CacheRefreshWorker (hourly, +5s stagger) — Calls `engineCache['refresh']()`
- Worker 2: BufferFlushWorker (30s, +10s stagger) — Calls `engineWriteBuffer.flush()`
- Worker 3: ReadDbSyncWorker (daily, Render cron) — Placeholder with `recordExecution()` API
- Worker 4: WriteDbValidatorWorker (10min, +15s stagger) — `validateData()` → `uploadToProd()` → `pruneOldEntries()`
- Orchestration: `startEngineWorkers()`, `stopEngineWorkers()`, `getEngineWorkersStatus()`
- Error isolation: Each worker has try-catch, failures don't cascade

**4. Read-DB (SQLite)** — `src/services/engine-read-db.ts` (470 lines)
- Schema: `pokemon`, `moves`, `type_effectiveness`, `engine_read_version` (4 tables, 7 indexes)
- API: `getAllPokemon()`, `getAllMoves()`, `getAllTypeEffectiveness()`, `getVersion()`, `getStats()`
- SQLite config: WAL mode, NORMAL synchronous, cache_size from config, busy_timeout 5000ms
- Integration: L1 cache loads from this at startup and hourly refresh

**5. Write-DB (SQLite with WAL)** — `src/services/engine-write-db.ts` (697 lines)
- Schema: `battle_logs`, `move_usage`, `anomalies`, `write_ahead_log` (4 tables, 7 indexes)
- API: `insertBattleLogs()`, `insertMoveUsage()`, `insertAnomalies()`, `validateData()`, `uploadToProd()`, `pruneOldEntries()`, `replayWAL()`, `getStats()`
- WAL: `appendToWAL()` with SHA-256 checksum, `replayWAL()` with corruption detection
- Auto-save: Every 30s (sql.js in-memory → disk)
- Validation: Quality score calculation (passedRows / validatedRows), 95% threshold
- Retention: 24h after upload, VACUUM after pruning

**6. Centralized Config** — `src/config/engine-db-config.ts` (558 lines)
- Environment detection: `IS_PRODUCTION`, `IS_TEST`
- Storage paths: `/Store/` (prod), `Store/` (local), `Store/test/` (test)
- Memory limits: 20 MB L1 cache, 10k queue size
- Feature flags: `L1_CACHE_ENABLED`, `WRITE_BUFFER_ENABLED`, `WORKERS_ENABLED`, `VALIDATION_ENABLED`
- Validation: `validateEngineDbConfig()` function ensures safe runtime

**Integration Points (310 lines):**

**Startup/Shutdown Lifecycle** — `src/index.ts` (+140 lines)
- Initialization (7 steps): validateConfig → Read-DB init → L1 cache load (blocking) → Write-DB init → WAL replay → workers start → `global.engineReady = true`
- Shutdown (6 steps): mark not ready → stop workers → flush buffer (emergency) → save Write-DB → close Read-DB → cleanup cache
- Telemetry: `updateEngineSection()` shows cache hit rate, buffer utilization, database stats, worker errors

**Cache Integration** — `src/data/dexpack.js` (+80 lines)
- `getSpecies()` tries `engineCache` first (by ID → by name → fallback to dexpack)
- Performance: <1μs cache hits, 0.1-1ms dexpack fallback
- Metrics: Cache hits/misses recorded in dex metrics system

**Buffer Integration** — `src/commands/battle-turn.js` (+70 lines)
- After `resolveTurn()`, logs move usage (both sides) + battle completion (on KO)
- Performance: <10μs per log call, zero impact on battle execution
- Graceful degradation: Backpressure errors caught, battles continue normally

**Operations & Monitoring**: `/ops engine` command displays L1 Cache (hit rate, memory, entries, latency), Write Buffer (utilization, queues, backpressure), Workers (4 workers with status), Read-DB (counts, size), Write-DB (counts, WAL size, oldest entry).

**Performance Metrics:**
- L1 Cache: <1μs read latency (10-100x faster than SQLite)
- Write Buffer: <10μs push latency (non-blocking battle flow)
- Read-DB: ~50ms query latency (cached in L1 after first access)
- Write-DB: WAL ensures durability with <5ms append overhead
- **Overall: 10-100x performance improvement over remote PostgreSQL queries**

**Quality Metrics:**
- Build Status: ✅ 0 errors, 0 warnings throughout implementation
- Integration: ✅ All 5 integration points operational
- Documentation: ✅ Comprehensive ROUTER.md updates (services, workers, config)
- Testing: ⏳ Unit tests planned (Task 9) — cache, buffer, workers, read-db, write-db

**Implementation Status:**
- ✅ Phase 17 (COMPLETE): Engine Read-DB foundation, PROD → Read sync
- ✅ Phase 18 (COMPLETE): Engine Write-DB foundation, logging operations
- ✅ Phase 19 (COMPLETE): Integrity scanner with validation rules
- ✅ Phase 20 (COMPLETE): Write-DB → PROD sync with PROD schema migration placeholder
- ✅ Phase 21 (COMPLETE): Battle engine integration (cache → dexpack, buffer → battle-turn)
- ✅ Phase 22 (COMPLETE): Monitoring, automation, `/ops engine` command

**Next Steps:**
- Task 9 (READY): Unit tests for all 6 services + integration points (80%+ coverage target)
- Phase 23+ (READY): PROD schema migration for battle logs, upload automation, retention policies

---

### 9.5 DB Persistence Roadmap

**Status**: Analysis — Opportunities to migrate from sql.js (in-memory) to better-sqlite3 (native SQLite) for 78% memory reduction and disk-backed operations.

**Current State**: Hybrid In-Memory + Disk Architecture
- Read-DB (`/Store/engine-read.db`) — Static Pokemon data, loaded at startup, saved after PROD sync
- Write-DB (`/Store/engine-write.db`) — Battle logs, auto-saved every 30s
- WAL (`/Store/engine-write.wal`) — Crash recovery log
- **Problem**: sql.js operates entirely in-memory, requiring 20 MB L1 cache + Write-DB in-memory (up to 15 MB) + manual `db.export()` + `fs.writeFile()` every 30s (slow, blocking)

**Opportunity**: Migrate to better-sqlite3 for:
- ✅ True disk-backed operations (no manual persistence)
- ✅ 70% memory reduction (20 MB → 6 MB L1 cache via lazy loading)
- ✅ Crash-safe writes (WAL mode built-in, no manual recovery)
- ✅ Faster queries (native C++ vs JavaScript)
- ✅ Additional databases without memory penalty

**Migration Plan: sql.js → better-sqlite3**

**Phase 1**: Install better-sqlite3 (`npm install better-sqlite3`)

**Phase 2**: Create adapter layer (dual support for both backends)

**Phase 3**: Migrate Read-DB (low risk, read-only, large memory savings 10 MB → 0 MB)

**Phase 4**: Migrate Write-DB (medium risk, writes critical, auto-save logic changes, WAL replay changes)

**Phase 5**: Implement LRU Cache (low risk, depends on better-sqlite3 disk fallback, requires performance tuning)

**Expected Outcomes:**

**Memory Savings:**
- Read-DB: 10 MB (in-memory) → 0 MB (disk-backed) — **100% reduction**
- Write-DB: 20 MB (in-memory) → 5 MB (active pages) — **75% reduction**
- L1 Cache: 20 MB (all Pokemon) → 6 MB (LRU 500) — **70% reduction**
- **Total: 50 MB → 11 MB (78% reduction)**

**Performance Improvements:**
- Startup (cold): 1000ms → 50ms — **20x faster**
- Startup (warm): 1000ms → 5ms — **200x faster**
- Single query: 0.5ms → 0.05ms — **10x faster**
- Bulk insert: 500ms → 50ms — **10x faster**
- Auto-save: 100ms (blocking) → 0ms (async) — **∞x faster**

**Additional Databases (Zero Memory Cost):**
1. Trainer Analytics DB — Leaderboards, stats, achievements (0 MB memory)
2. Move Effectiveness Cache DB — Pre-computed damage multipliers (0 MB memory)
3. Battle Replay DB — Full turn-by-turn states for debugging (0 MB memory)
4. Rate Limiting DB — Persistent rate limits across restarts (0 MB memory)

**Risks & Mitigation:**
1. better-sqlite3 requires native compilation (Render supports via build hooks)
2. Queries may be slower (disk I/O) — Mitigated by OS page cache + LRU cache + memory-mapped I/O
3. WAL mode requires disk space — Mitigated by auto-checkpoint every 1000 pages + monitoring
4. Migration complexity — Mitigated by phased rollout + feature flags + rollback plan

**Recommendation**: Proceed with migration as Week 8-11 optimization initiative following console log cleanup and profile creation optimization.

---

### 9.6 Event Tracking

**Created**: 2025-11-06 — Complete event tracking schema for Infinity Gauntlet. Every user interaction, system event, and gameplay action is tracked through `UserEvent` table with typed JSON payloads.

**Event Categories:**

| Category | Description | Example Types | Retention |
| --- | --- | --- | --- |
| **gameplay** | Core game actions | battle.won, pokemon.caught, evolution.triggered | Indefinite |
| **engagement** | User engagement metrics | login, daily_quest.completed, achievement.unlocked | 90 days |
| **economy** | Virtual currency transactions | coins.earned, coins.spent, item.purchased | 1 year |
| **social** | Social interactions | friend.added, profile.updated, message.sent | 90 days |
| **system** | System events & errors | error.occurred, performance.slow_query | 30 days (info), 1 year (error/critical) |
| **admin** | Administrative actions | user.banned, content.moderated | Indefinite |

**Event Severity Levels:**

| Severity | Use Case | Retention | Examples |
| --- | --- | --- | --- |
| **info** | Normal operations | 30 days | login, pokemon.caught |
| **warning** | Noteworthy but not errors | 90 days | rate_limit.approached, cache.miss |
| **error** | Recoverable errors | 1 year | battle.timeout, api.error |
| **critical** | System failures | Indefinite | database.connection_lost, payment.failed |

**Key Event Schemas:**

**Gameplay Events:**
- `battle.started` — battleId, opponentId, ruleset, arenaThreadId
- `battle.won/lost` — battleId, opponentId, turns, duration_ms, pokemon_fainted, experience_gained, coins_earned
- `pokemon.caught` — pokemonId, speciesId, speciesName, level, isShiny, encounterId, catchMethod, attempts
- `pokemon.evolved` — pokemonId, fromSpeciesId, toSpeciesId, level, trigger
- `encounter.spawned` — encounterId, speciesId, speciesName, level, isShiny, spawnLocation, expiresAt

**Privacy & PII Handling:**
- IP addresses always hashed before storage (SHA-256 with daily rotating salt)
- Never store email in events, use userId only
- Data retention by category and severity (30 days to indefinite)

**Event Batching Strategy:**
- Max batch size: 100 events
- Max batch delay: 5000ms
- Critical events bypass batching (immediate flush)
- In-memory buffer before batch insert

**Query Patterns:**
- User Activity Timeline (last 7 days gameplay)
- Achievement Progress Tracking
- Error Rate Monitoring (last 24 hours)
- Top Active Users (event count, sessions, first/last activity)

---

### 9.7 Dex V2

**DEX v2** — High-Availability, Fast Pokédex Model and Day-One Database Blueprint combining high-performance Pokédex model with pragmatic day-one database plan.

**North-Star Principles:**
- **Immutable facts, mutable links** — Core reference data (Pokédex, moves, type chart) is read-only and versioned
- **Tenant-first keys** — Every gameplay row includes `tenant_id` (Discord guild/app id)
- **Time-sortable IDs** — Prefer ULIDs for chronology
- **Short, observable write paths** — Append-only where possible
- **Migrations are code** — Every schema change reversible, reviewed, tested

**Goals:**
- Instant lookups (no blocking I/O or ad-hoc parsing on hot path)
- Deterministic packs: content-addressed, signed, verified at boot
- Side-by-side rollout using feature flags; zero-downtime cutover with fast rollback
- Operational simplicity: single artifact with explicit invariants

**Architecture Overview (DEX v2):**

**Build Time:**
1. Aggregate sources → normalize → validate invariants
2. Generate binary slab `dexpack.v2.<SHA256>.bin` plus minimal perfect hash (MPH) map for name/alias → id resolution
3. Emit TypeScript accessors (codegen) with fixed offsets and integer tables (types, learnset bitsets)
4. Produce manifest `dexpack.v2.json` (hash, upstream SHAs, schema version)
5. Sign artifact using Ed25519

**Runtime:**
- Map read-only binary slab and expose typed-array views
- Verify hash and signature; on failure, refuse v2 and auto-fallback to v1
- Command handlers route through feature flag `DEX_V2_ENABLED` (supports per-guild canaries)

**Data Layout (Binary Slab, Structure-Of-Arrays):**
```
Header { magic "DEX2", schemaVersion u16, gen u8, sections: offsets & lengths }
Sections:
- species.soA: baseStats[u16][N][6], types[u8][N][2], abilities[u16][N][3], catchRate[u8][N]
- learnsets.bitset: bitset[N][ceil(M/8)] where M = total moves
- moves.tuples: [power u16, accuracy u8, type u8, priority i8, flags u16] x M
- types.table: 19x19 u8 multipliers encoded {0,5,10,20}
- names.aliases: utf8Blob + offsets[u32] + ids[u16]
- mph: arrays required for minimal perfect hash lookup
- text.offsets: flavorUtf8Blob + start/end[u32] per species
```

**Generated Accessor API:**
```typescript
export function idByNameOrAlias(q: string): number | -1;     // MPH → id
export function baseHP(id: number): number;                   // u16
export function typesOf(id: number): [number, number];        // u8, u8
export function hasMove(id: number, moveId: number): boolean; // bit test
export function moveInfo(moveId: number): MoveTuple;
export function typeMultiplier(attacking: number, defending: number): number; // 0|5|10|20
export function flavorText(id: number): string;               // slice from blob
export const META: { schema: 2; gen: number; hash: string };
```

**Performance SLO**: p50 ≤ 50 µs, p95 ≤ 200 µs, p99 ≤ 500 µs on c5.large-class nodes.

**Security**: Ed25519 signature verified at boot; public key in repo, private key in CI secrets. Loader refuses unsigned or mismatched packs.

**Migration Path:**
1. Land v2 alongside v1
2. Compatibility layer keeps old accessor signatures, dispatches to v2 under flag
3. Enable 100% in DEV; run regression plus perf verification
4. Canary in PROD; ramp in stages if green
5. Remove v1 code in later, separate PR

**High-Availability Rollout Plan:**
- DEV enable: Tue, Nov 4, 2025, 11:00–11:30 ET
- PROD canary and ramp: Wed, Nov 5, 2025, 02:00–03:00 ET
- Reserved maintenance: Thu, Nov 6, 2025, 02:00–02:15 ET
- Backups: Pre-cutover `pg_dump -Fc` for DEV/PROD; retain 14 days
- Rollback: ≤ 10 minutes (flip `DEX_V2_ENABLED=false`, redeploy LKG image if necessary)

**Day-One Database Blueprint (v0.1):**
- Tables: tenants, users, trainers, dex_packs, trainer_settings, mons, parties, encounters, battles, items, inventories, audit_log
- Indexes: tenant_id, trainer_id, started_at DESC, at DESC
- Versioning: Repository `schema_ver` integer; every migration bumps it
- Seeds: Golden tenant/trainer/party dataset for smoke tests
- Backups: Nightly PITR to object storage; monthly restore rehearsal (RPO 15 min, RTO 30 min)
- Constraints: FKs, CHECKs, UNIQUEs keep bad states unrepresentable
- Roles: `app_rw`, `migrate`, `ro` with least privilege
- Retention: Audit rows hot for 30 days, then archive
- Observability: DB op metrics, latency histograms, error rates by constraint, spans tagged with `tenant_id`, `pack_hash`, `schema_ver`

---

## Section 10: Discord Bot

### 10.1 Command Suite

*(Content to be consolidated from `DISCORD-COMMAND-SUITE.md` in Phase 1 Week 3)*

**Placeholder**: Discord command suite overview, command categories, usage patterns.

### 10.2 AI DM Commands

*(Content to be consolidated from `specs/AI DM COMMAND SUITE GUIDANCE.md` in Phase 1 Week 3)*

**Placeholder**: AI DM command guidance, automation patterns, error handling.

### 10.3 Admin Command Spec

*(Content to be consolidated from `specs/DM-ADMIN-COMMAND-SUITE-SPEC.md` in Phase 1 Week 3)*

**Placeholder**: Admin command specification, access control, validation.

### 10.4 Admin Docs Index

*(Content to be consolidated from `specs/DM-ADMIN-DOCS-INDEX.md` in Phase 1 Week 3)*

**Placeholder**: Admin documentation navigation, quick reference, troubleshooting.

---

## Section 11: Safety Guarantees

*(Content to be consolidated from `architecture/safety.md` in Phase 1 Week 3)*

**Placeholder**: Memory safety, error isolation, state persistence, disaster recovery, operational safeguards.

---

## Section 12: Observability

### 12.1 Metrics

*(Content to be consolidated from `architecture/metrics-transparency.md` in Phase 1 Week 3)*

**Placeholder**: Metrics transparency design, visibility principles, telemetry architecture.

### 12.2 Calculation Methods

*(Content to be consolidated from `metrics-calculation.md` in Phase 1 Week 3)*

**Placeholder**: Metrics calculation methods, formulas, aggregation strategies.

---

## Section 13: Performance

### 13.1 Optimization Roadmap

*(Content to be consolidated from `architecture/OPTIMIZATION-BIBLE.md` in Phase 1 Week 3)*

**Placeholder**: System-wide optimization plan, startup time, console logging, runtime weight, queries, cache.

### 13.2 Centralization

*(Content to be consolidated from `architecture/centralized-architecture-analysis.md` in Phase 1 Week 3)*

**Placeholder**: Centralized architecture analysis, code duplication elimination, shared utilities.

---

## Section 14: Future Roadmap

*(Content to be consolidated from `architecture/perfect-system-roadmap.md` in Phase 1 Week 3)*

**Placeholder**: System evolution vision, planned improvements, research areas, scalability targets.

---

**Estimated Size**: ~3000 lines (after Phase 1 consolidation)  
**Source Files**: 37 documents consolidated  
**Last Updated**: 2025-11-16 (template created)  
**Status**: Template ready for Phase 1 Week 3 consolidation
