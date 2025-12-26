# Kernel-First Logging Initiative

**Project ID:** KERNEL-LOG-001  
**Status:** PROPOSED  
**Created:** 2025-12-26  
**Owner:** DRIPTVDD  
**Priority:** HIGH — Foundational Infrastructure

---

## Executive Summary

Establish the **Kernel-First Principle**: The kernel logging and error systems MUST be the first thing initialized in ANY process, file, or service across the entire codebase. This ensures complete observability from the first line of execution to the last, with outputs flowing to consoles, databases, and external tools.

---

## Problem Statement

### Current State
- Logging is fragmented across multiple systems (console.log, logger.ts, intelligent-logger, kernel-logger)
- Some modules initialize before logging is available, creating blind spots
- Error capture is inconsistent — some errors logged, some silently swallowed
- No unified pipeline from code → console → database → external tools
- Startup/shutdown phases have incomplete observability

### Desired State
- **Single source of truth**: Kernel is THE logging/error system
- **First boot, last shutdown**: Kernel initializes before anything, shuts down after everything
- **Zero blind spots**: Every line of code has access to logging from moment of import
- **Unified pipeline**: All logs flow: Code → Kernel → Console + Database + External Tools
- **Consistent API**: One way to log, one way to capture errors, everywhere

---

## Guiding Principles

### The Kernel-First Principle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KERNEL-FIRST BOOT ORDER                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. Kernel.boot()           ← FIRST (logging available immediately)       │
│   2. Database connections                                                   │
│   3. Service Registry                                                       │
│   4. Discord client                                                         │
│   5. Workers/Background jobs                                                │
│   6. HTTP health server                                                     │
│   ...                                                                       │
│   N-1. Application ready                                                    │
│   N. Kernel.shutdown()       ← LAST (captures everything until the end)    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Import-Time Logging Principle

Every file should be able to log from the moment it's imported:

```typescript
// BEFORE (problematic)
import { logger } from './logger'; // May not be initialized yet
logger.info('Module loaded'); // Might fail or be lost

// AFTER (kernel-first)
import { Kernel } from './kernel'; // Always available
Kernel.log.info('Module loaded'); // Always works, always captured
```

---

## Scope of Work

### Phase 1: Audit & Assessment (Week 1)

| Task | Description | Deliverable |
|------|-------------|-------------|
| 1.1 | Inventory all logging calls in codebase | `logging-audit.md` |
| 1.2 | Identify modules that initialize before logging | Risk assessment |
| 1.3 | Map all error handling patterns | Error pattern catalog |
| 1.4 | Document current output destinations | Output flow diagram |
| 1.5 | Identify external tool integration points | Integration inventory |

**Audit Queries:**
```bash
# Find all console.log/warn/error usage
grep -rn "console\.\(log\|warn\|error\|debug\)" src/ --include="*.ts" --include="*.js"

# Find all logger imports
grep -rn "import.*logger" src/ --include="*.ts" --include="*.js"

# Find all error handling
grep -rn "catch\|\.catch\|try {" src/ --include="*.ts" --include="*.js"

# Find early initialization patterns
grep -rn "^import" src/index.ts src/bot/index.ts src/worker/*.ts
```

### Phase 2: Kernel Enhancement (Week 2)

| Task | Description | Status |
|------|-------------|--------|
| 2.1 | Ensure Kernel works at import-time (no async required for basic logging) | TODO |
| 2.2 | Add synchronous fallback for pre-boot logging | TODO |
| 2.3 | Create log queue for pre-boot messages (replayed after boot) | TODO |
| 2.4 | Add process-level signal handlers (SIGTERM, SIGINT, uncaughtException) | TODO |
| 2.5 | Implement graceful degradation (if kernel fails, console fallback) | TODO |

**Pre-Boot Queue Pattern:**
```typescript
// Kernel stores logs before boot, replays after
const preBootQueue: LogEntry[] = [];
let booted = false;

export function log(level, message, meta) {
  const entry = { level, message, meta, timestamp: Date.now() };
  
  if (!booted) {
    preBootQueue.push(entry);
    console.log(`[PRE-BOOT] ${message}`); // Console fallback
    return;
  }
  
  // Normal kernel logging
  processLogEntry(entry);
}

export async function boot() {
  // ... initialization ...
  booted = true;
  
  // Replay pre-boot logs
  for (const entry of preBootQueue) {
    processLogEntry(entry);
  }
  preBootQueue.length = 0;
}
```

### Phase 3: Codebase Migration (Week 3-4)

| Task | Description | Files Affected |
|------|-------------|----------------|
| 3.1 | Replace `console.log` with `Kernel.log.*` | All source files |
| 3.2 | Replace legacy logger imports with Kernel | ~50+ files |
| 3.3 | Wrap all `try/catch` with `Kernel.error.capture()` | All error handlers |
| 3.4 | Update entry points to boot Kernel first | index.ts, workers |
| 3.5 | Add Kernel shutdown to all exit paths | SIGTERM handlers |

**Migration Script (Proposed):**
```typescript
// scripts/migrate-to-kernel-logging.ts
// Automated refactoring tool to:
// 1. Find console.log → replace with Kernel.log.info
// 2. Find console.warn → replace with Kernel.log.warn
// 3. Find console.error → replace with Kernel.log.error
// 4. Find catch blocks → add Kernel.error.capture()
```

### Phase 4: Output Destinations (Week 4-5)

| Destination | Implementation | Status |
|-------------|----------------|--------|
| **Console** | Formatted, colored, structured output | ✅ Exists |
| **Log Files** | Daily rotation in Store/kernel-logs/ | ✅ Exists |
| **Snapshots** | Periodic JSON snapshots | ✅ Exists |
| **PostgreSQL** | Prisma hook for long-term storage | 🔄 Hook exists, needs connection |
| **Loki** | Grafana Loki push integration | TODO |
| **Discord** | Critical alerts to admin channel | TODO |
| **Webhooks** | External notification system | TODO |

**Output Pipeline:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LOG OUTPUT PIPELINE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Kernel.log.info("message")                                                │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Log Router (kernel-logger.ts)                    │   │
│   └───────┬───────────────┬───────────────┬───────────────┬─────────────┘   │
│           │               │               │               │                 │
│           ▼               ▼               ▼               ▼                 │
│   ┌───────────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────────────┐   │
│   │   Console     │ │ Log File  │ │ Database  │ │   External Tools      │   │
│   │   (stdout)    │ │ (.log)    │ │ (Prisma)  │ │ (Loki/Discord/Webhook)│   │
│   └───────────────┘ └───────────┘ └───────────┘ └───────────────────────┘   │
│                                                                             │
│   Filtering by level:                                                       │
│   - Console: INFO and above (configurable)                                  │
│   - Files: DEBUG and above (everything)                                     │
│   - Database: WARN and above (persistent)                                   │
│   - External: ERROR and above (alerts)                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 5: External Tool Integration (Week 5-6)

#### 5.1 Loki Integration (Grafana Stack)
```typescript
// src/kernel/outputs/loki-output.ts
export function createLokiOutput(config: LokiConfig): LogOutput {
  return {
    id: 'loki',
    name: 'Grafana Loki',
    write: async (entries: LogEntry[]) => {
      const streams = formatForLoki(entries);
      await fetch(`${config.url}/loki/api/v1/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streams }),
      });
    },
    minLevel: 'debug',
  };
}
```

#### 5.2 Discord Alert Integration
```typescript
// src/kernel/outputs/discord-output.ts
export function createDiscordOutput(webhookUrl: string): LogOutput {
  return {
    id: 'discord-alerts',
    name: 'Discord Alerts',
    write: async (entries: LogEntry[]) => {
      // Only send ERROR and FATAL
      const criticalEntries = entries.filter(e => 
        e.level === 'error' || e.level === 'fatal'
      );
      
      for (const entry of criticalEntries) {
        await sendDiscordEmbed(webhookUrl, formatErrorEmbed(entry));
      }
    },
    minLevel: 'error',
  };
}
```

#### 5.3 Database Long-Term Storage
```typescript
// Connect the Prisma hook
import { prisma } from '../shared/prisma';

Kernel.persist.registerDatabaseHook(
  Kernel.persist.createPrismaHook(prisma, {
    tableName: 'KernelLog',
    batchSize: 100,
    flushInterval: 30000, // 30 seconds
  })
);
```

---

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Console.log usage | 0 occurrences | `grep -c "console\." src/` |
| Legacy logger usage | 0 occurrences | `grep -c "import.*logger" src/` |
| Kernel boot position | Line 1 of index.ts | Code review |
| Pre-boot log capture | 100% | Test: log before boot, verify captured |
| Error capture rate | 100% | All catch blocks call Kernel.error.capture |
| External tool latency | <1s for alerts | Monitoring |
| Database persistence | 99.9% | Audit logs vs entries |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes during migration | HIGH | Incremental migration, feature flags |
| Performance overhead of unified logging | MEDIUM | Async batching, level filtering |
| External tool failures | LOW | Graceful degradation, local fallback |
| Circular dependencies (Kernel imports) | MEDIUM | Careful dependency graph, lazy loading |
| PII leakage to external tools | HIGH | Scrubbing pipeline before output |
| Pre-boot queue overflow | MEDIUM | Size cap with oldest-drop policy |
| High-frequency log flooding | MEDIUM | Sampling support for debug logs |

---

## Expert Panel Findings (2025-12-26)

### Critical Additions Identified

#### 1. PII Scrubbing Pipeline
**Owner:** Security  
**Phase:** 2 (Kernel Enhancement)

All log outputs must pass through a scrubbing layer before external transmission:
```typescript
interface ScrubConfig {
  patterns: RegExp[];      // Token patterns, webhook URLs
  fields: string[];        // 'password', 'token', 'apiKey', 'email'
  replacement: string;     // '[REDACTED]'
}

// Scrub before Loki/Discord/Database
function scrubEntry(entry: LogEntry, config: ScrubConfig): LogEntry
```

#### 2. Correlation ID / Request Tracing
**Owner:** Architecture  
**Phase:** 2 (Kernel Enhancement)

Every log entry should support context propagation for distributed tracing:
```typescript
interface LogContext {
  correlationId: string;   // Unique per request/interaction
  userId?: string;         // Discord user ID
  guildId?: string;        // Discord guild ID
  commandName?: string;    // Slash command name
  workerId?: string;       // Render worker instance
}

Kernel.log.info('Processing command', { 
  context: { correlationId: 'abc-123', userId: '123456' } 
});
```

#### 3. Log Sampling for High-Frequency Events
**Owner:** Performance  
**Phase:** 2 (Kernel Enhancement)

Battle engine and encounter systems can generate thousands of logs per second:
```typescript
// Sample 1% of debug logs
Kernel.log.debug('Damage calculated', { 
  damage: 45, 
  sample: 0.01  // Only log 1%
});

// Always log errors (no sampling)
Kernel.log.error('Critical failure'); // sample: 1.0 implied
```

#### 4. Pre-Boot Queue Size Limit
**Owner:** Performance  
**Phase:** 2 (Kernel Enhancement)

Prevent memory exhaustion if boot fails:
```typescript
const MAX_PREBOOT_ENTRIES = 1000;

function logPreBoot(entry: LogEntry) {
  if (preBootQueue.length >= MAX_PREBOOT_ENTRIES) {
    preBootQueue.shift(); // Drop oldest
  }
  preBootQueue.push(entry);
}
```

#### 5. Battle Replay Structured Logging
**Owner:** Game Development  
**Phase:** 4 (Output Destinations)

Special logging for PBSL battle reconstruction:
```typescript
Kernel.battle.log({
  battleId: string;
  turn: number;
  phase: 'selection' | 'execution' | 'resolution';
  action: BattleAction;
  state: BattleSnapshot;
  rngSeed?: number;
});
```

#### 6. Runtime Log Level Toggle
**Owner:** DevOps  
**Phase:** 4 (Output Destinations)

Enable debugging production without restart:
```typescript
// Via Discord /ops command
/ops kernel loglevel DEBUG   // Enable debug temporarily
/ops kernel loglevel INFO    // Return to normal

// Via environment
KERNEL_LOG_LEVEL=DEBUG       // Runtime override
```

#### 7. Kernel Test Utilities
**Owner:** QA  
**Phase:** 3 (Migration)

Testing infrastructure for kernel-aware tests:
```typescript
// tests/kernel-test-utils.ts
export function mockKernel(): MockKernel {
  const logs: LogEntry[] = [];
  const errors: CapturedError[] = [];
  
  // Capture all logs for assertions
  vi.spyOn(Kernel.log, 'info').mockImplementation(...);
  
  return {
    logs,
    errors,
    assertLogged: (pattern: RegExp) => {...},
    assertErrorCaptured: (category: string) => {...},
    restore: () => vi.restoreAllMocks(),
  };
}
```

### Important Additions (Phase 5-6)

| Item | Description |
|------|-------------|
| **Worker Process ID** | Include `workerId` in all logs from Render workers |
| **Loki Health Monitoring** | Periodic health checks, fallback to file-only |
| **Disk Space Monitoring** | Alert when log directory > 90% capacity |
| **GDPR Log Deletion** | API to purge logs by userId on request |
| **Async Output Backpressure** | Queue limits with overflow strategies |
| **RNG Audit Trail** | Log seeds and outcomes for anti-cheat |

### Deferred Items (Future Work)

| Item | Rationale |
|------|-----------|
| Render Log Drain Integration | Evaluate after Loki is stable |
| Hot Reload State Persistence | Development convenience, not critical |
| Log Query API for /ops | Nice-to-have after core complete |

---

## Meeting Agenda (Kickoff)

### Meeting #1: Audit & Planning

**Duration:** 1-2 hours  
**Attendees:** Development team

1. **Review Current State** (20 min)
   - Walk through logging-audit.md results
   - Identify biggest blind spots
   - Discuss pain points

2. **Agree on Principles** (15 min)
   - Kernel-First Principle
   - Import-Time Logging
   - Zero Blind Spots

3. **Define Migration Strategy** (30 min)
   - Incremental vs Big Bang
   - Feature flags approach
   - Testing strategy

4. **Assign Tasks** (20 min)
   - Phase ownership
   - Timeline commitments
   - Review checkpoints

5. **External Tools Discussion** (15 min)
   - Loki priority
   - Discord alerts scope
   - Database retention policies

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/kernel/outputs/console-output.ts` | Formatted console output handler |
| `src/kernel/outputs/file-output.ts` | Log file rotation handler |
| `src/kernel/outputs/loki-output.ts` | Grafana Loki integration |
| `src/kernel/outputs/discord-output.ts` | Discord alert integration |
| `src/kernel/outputs/database-output.ts` | Prisma persistence handler |
| `src/kernel/outputs/index.ts` | Output router/registry |
| `scripts/migrate-to-kernel-logging.ts` | Automated migration tool |
| `docs/audits/logging-audit.md` | Codebase logging audit |

### Modified Files
| File | Changes |
|------|---------|
| `src/index.ts` | Kernel.boot() as first line |
| `src/bot/index.ts` | Kernel.boot() as first line |
| `src/worker/*.ts` | Kernel.boot() in all workers |
| `src/kernel/kernel-logger.ts` | Add output plugin system |
| `src/kernel/boot-kernel.ts` | Pre-boot queue, output registration |
| All `*.ts` files | Replace console.log/logger with Kernel |

---

## Timeline

```
Week 1: Audit & Assessment
├── Day 1-2: Run audit queries, document findings
├── Day 3-4: Risk assessment, dependency mapping
└── Day 5: Meeting #1 (Kickoff)

Week 2: Kernel Enhancement
├── Day 1-2: Pre-boot queue implementation
├── Day 3-4: Output plugin system
└── Day 5: Testing & documentation

Week 3-4: Codebase Migration
├── Week 3: Core modules (src/core/*, src/shared/*)
└── Week 4: Application modules (src/bot/*, src/worker/*)

Week 5-6: External Integration
├── Week 5: Loki + Discord integration
└── Week 6: Testing, optimization, documentation
```

---

## Appendix: Audit Queries

```powershell
# Run from project root

# Count console.log usage
Get-ChildItem -Recurse -Include *.ts,*.js src/ | Select-String "console\.(log|warn|error|debug)" | Measure-Object

# Find all logger imports
Get-ChildItem -Recurse -Include *.ts,*.js src/ | Select-String "import.*logger"

# Find try/catch without Kernel.error.capture
Get-ChildItem -Recurse -Include *.ts,*.js src/ | Select-String "catch.*{" -Context 0,5 | Where-Object { $_.Context.PostContext -notmatch "Kernel\.error" }

# Find early imports in entry points
Get-Content src/index.ts | Select-Object -First 20
Get-Content src/bot/index.ts | Select-Object -First 20
```

---

## Approval

- [ ] Technical review complete
- [ ] Resource allocation confirmed
- [ ] Timeline approved
- [ ] Meeting #1 scheduled

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-26  
**Next Review:** After Meeting #1
