# Kernel-First Logging Initiative — Expert Review Panel

**Date:** 2025-12-26  
**Purpose:** Multi-expert analysis of kernel logging architecture gaps and expansion opportunities  
**Sprint Status:** Sprint 1-2 COMPLETE (PREBOOT_QUEUE, TEST_UTILS, BOT_ENTRY, OUTPUT_PLUGINS, PII_SCRUBBING, CORRELATION_IDS, SAMPLING)

---

## 🎭 Expert Panel

| Expert | Domain | Focus Area |
|--------|--------|------------|
| **🔧 Systems Architect** | Distributed Systems | Integration patterns, data flow |
| **🛡️ Security Engineer** | Security & Privacy | PII handling, audit trails |
| **📊 Observability Expert** | Monitoring & Tracing | Telemetry, correlation |
| **🎮 Game Systems Expert** | Discord/Game Engine | Bot patterns, battle logging |
| **🧪 Quality Engineer** | Testing & Reliability | Test coverage, failure modes |

---

## 📋 Executive Summary

### Current State Assessment

The kernel infrastructure is **well-architected** with 13 modules (~5,000 lines):

```
src/kernel/
├── boot-kernel.ts          ✅ Main entry, unified API
├── kernel-logger.ts        ✅ Ring buffer, pre-boot queue
├── kernel-error-detector.ts ✅ Error capture, fingerprinting
├── kernel-observer.ts      ✅ System observation
├── kernel-metrics.ts       ✅ Aggregation, anomalies
├── kernel-hooks.ts         ✅ Application bridges
├── kernel-persistence.ts   ✅ Snapshots, database export
├── kernel-output-plugins.ts ✅ Plugin architecture
├── pii-scrubber.ts         ✅ PII protection
├── correlation.ts          ✅ Request tracing
├── log-sampling.ts         ✅ Volume control
├── kernel-types.ts         ✅ Type definitions
└── index.ts                ✅ Barrel exports
```

### Critical Gaps Identified

| Priority | Gap | Impact | Section |
|----------|-----|--------|---------|
| 🔴 P0 | **Application hooks NOT connected** | Kernel observes nothing from app layer | §1 |
| 🔴 P0 | **Correlation IDs not injected** into shared/logger.ts | Traces incomplete | §2 |
| 🟠 P1 | **Error tracker not hooked** to kernel | Errors bypass kernel observation | §3 |
| 🟠 P1 | **Event Bus not bridged** to kernel | Event flows invisible | §4 |
| 🟡 P2 | **Workers isolated** from kernel | Background jobs untracked | §5 |
| 🟡 P2 | **Database layer unobserved** | Query performance hidden | §6 |

---

## 🔧 Systems Architect Analysis

### §1. Application Hooks Not Connected (P0 CRITICAL)

**Problem:** The kernel has hooks defined (`createLoggerHook`, `createErrorTrackerHook`, etc.) but NO application code is using them.

**Evidence:**
```bash
# Search for hook usage in app code
grep -r "createLoggerHook" src/  # Only finds kernel definitions
grep -r "createErrorTrackerHook" src/  # Only finds kernel definitions
grep -r "createServiceRegistryHook" src/  # Zero usage
grep -r "createEventBusHook" src/  # Zero usage
```

**Current Flow (BROKEN):**
```
Application Log → shared/logger.ts → console + Loki
                     ↳ Kernel is BYPASSED ❌
```

**Required Flow:**
```
Application Log → shared/logger.ts → Kernel Hook → Kernel Observer
                     ↳ Kernel Logger → console + plugins + persistence
```

**Fix Required — `src/shared/logger.ts`:**
```typescript
// At top of file, add kernel integration
import { createLoggerHook } from '../kernel/kernel-hooks.js';

// After logger initialization
const kernelHook = createLoggerHook('shared-logger');

// In log() function, add:
kernelHook.log(level, component, operation, message, context);
```

---

### §2. Correlation IDs Not Injected (P0 CRITICAL)

**Problem:** The correlation.ts module exists but is NOT used by shared/logger.ts or error-tracker.ts.

**Evidence:**
```typescript
// src/shared/logger.ts - NO correlation ID injection
export function log(level: LogLevel, component: string, ...): void {
  const entry: LogEntry = {
    timestamp: now.toISOString(),
    level,
    component,
    operation,
    message,
    // MISSING: correlationId from kernel
  };
}
```

**Fix Required — `src/shared/logger.ts`:**
```typescript
import { getCurrentCorrelationId, getCorrelationData } from '../kernel/correlation.js';

export function log(level: LogLevel, ...): void {
  const correlationData = getCorrelationData();
  const entry: LogEntry = {
    ...baseEntry,
    correlationId: correlationData?.correlationId,
    parentCorrelationId: correlationData?.parentCorrelationId,
    traceSource: correlationData?.traceSource,
  };
}
```

---

### §3. Bot Layer Missing Trace Wrapping

**Problem:** Discord interactions are NOT wrapped in correlation traces.

**Evidence in `src/bot/index.ts`:**
```typescript
client.on(Events.InteractionCreate, async (interaction) => {
  // ❌ No correlation trace started
  if (interaction.isCommand()) {
    await handleCommand(interaction);
  }
});
```

**Fix Required:**
```typescript
import { startDiscordTraceAsync } from '../kernel/correlation.js';

client.on(Events.InteractionCreate, async (interaction) => {
  await startDiscordTraceAsync(
    interaction.id,
    interaction.user.id,
    interaction.guildId,
    interaction.isCommand() ? interaction.commandName : 'button',
    async () => {
      if (interaction.isCommand()) {
        await handleCommand(interaction);
      }
    }
  );
});
```

---

## 🛡️ Security Engineer Analysis

### §4. PII Scrubbing Not Applied to Output

**Problem:** pii-scrubber.ts exists but is NOT wired to any output plugin.

**Evidence:**
```typescript
// kernel-output-plugins.ts creates plugins but doesn't wrap with scrubbing
const consolePlugin = createConsolePlugin('INFO');
// ❌ Not wrapped: createScrubbingPlugin(consolePlugin)
```

**Fix Required — `src/kernel/boot-kernel.ts` initialization:**
```typescript
import { createScrubbingPlugin } from './pii-scrubber.js';

// In boot sequence, register scrubbed console plugin
const rawConsole = createConsolePlugin('INFO');
const scrubbedConsole = createScrubbingPlugin(rawConsole);
registerOutputPlugin(scrubbedConsole);
```

---

### §5. Audit Trail Incomplete

**Problem:** Kernel has audit trail capability but critical operations not audited.

**Missing Audits:**
- Database schema changes
- Permission role assignments
- Discord channel creations (homestead)
- Player data modifications

**Expansion Required:**
```typescript
// src/services/homestead-manager.ts
import Kernel from '../kernel/boot-kernel.js';

async function createHomesteadChannel(userId: string, ...): Promise<Channel> {
  Kernel.observe.event({
    topic: 'audit.homestead.create',
    correlationId: Kernel.correlation.getId(),
    emitter: 'homestead-manager',
    metadata: { userId, channelId },
  });
  // ... implementation
}
```

---

## 📊 Observability Expert Analysis

### §6. Event Bus Not Bridged to Kernel

**Problem:** Event Bus emits events but kernel doesn't observe them.

**Evidence in `src/shared/event-bus.ts`:**
```typescript
export class EventBus {
  emit(topic: string, payload: unknown): void {
    // ❌ No kernel observation
    this.handlers.get(topic)?.forEach(handler => handler(payload));
  }
}
```

**Fix Required:**
```typescript
import { createEventBusHook } from '../kernel/kernel-hooks.js';
import { getCurrentCorrelationId } from '../kernel/correlation.js';

const kernelHook = createEventBusHook('event-bus');

emit(topic: string, payload: unknown): void {
  const correlationId = getCurrentCorrelationId() ?? generateId();
  kernelHook.event(topic, correlationId, 'event-bus', JSON.stringify(payload).length);
  // ... existing implementation
}
```

---

### §7. Service Registry Not Observed

**Problem:** ServiceRegistry manages services but kernel doesn't see state changes.

**Evidence in `src/shared/service-registry.ts`:**
```typescript
registerService(service: Service): void {
  this.services.set(service.name, service);
  // ❌ No kernel observation
}
```

**Fix Required:**
```typescript
import { createServiceRegistryHook } from '../kernel/kernel-hooks.js';

const kernelHook = createServiceRegistryHook();

registerService(service: Service): void {
  const previousState = this.services.get(service.name)?.state;
  this.services.set(service.name, service);
  kernelHook.service(service.name, 'register', previousState);
}

updateServiceState(name: string, state: ServiceState): void {
  const previousState = this.services.get(name)?.state;
  this.services.get(name)!.state = state;
  kernelHook.service(name, state, previousState);
}
```

---

## 🎮 Game Systems Expert Analysis

### §8. Battle Engine Logging Gaps

**Problem:** Battle actions need deterministic correlation for replay debugging.

**Current in `src/core/battle/engine.ts`:**
```typescript
function executeTurn(battle: Battle, action: Action): TurnResult {
  // Uses local logging only
  console.log('Turn executed');
}
```

**Required Pattern:**
```typescript
import Kernel from '../../kernel/boot-kernel.js';

function executeTurn(battle: Battle, action: Action): TurnResult {
  return Kernel.correlation.startTrace(
    { source: 'battle', metadata: { battleId: battle.id, turnNumber: battle.turn } },
    () => {
      Kernel.log.debug('battle-engine', `Turn ${battle.turn} starting`, {
        battleId: battle.id,
        actions: action,
      });
      // ... implementation
    }
  );
}
```

---

### §9. Encounter System Missing Telemetry

**Problem:** Wild encounters not tracked in kernel for analytics.

**Required in `src/core/encounter/spawn.ts`:**
```typescript
import Kernel from '../../kernel/boot-kernel.js';

function spawnEncounter(location: Location, userId: string): Encounter {
  return Kernel.correlation.startTrace(
    { source: 'internal', metadata: { location, userId } },
    () => {
      const encounter = generateEncounter(location);
      
      Kernel.observe.event({
        topic: 'game.encounter.spawn',
        correlationId: Kernel.correlation.getId()!,
        emitter: 'encounter-spawner',
        metadata: {
          species: encounter.pokemon.species,
          level: encounter.pokemon.level,
          rarity: encounter.rarity,
        },
      });
      
      return encounter;
    }
  );
}
```

---

## 🧪 Quality Engineer Analysis

### §10. Missing Integration Tests

**Problem:** Kernel hooks have unit tests but no integration tests with real app systems.

**Required Test Files:**
```
tests/integration/
├── kernel-logger-integration.spec.ts     # shared/logger → kernel flow
├── kernel-error-integration.spec.ts      # error-tracker → kernel flow
├── kernel-discord-integration.spec.ts    # Discord trace propagation
├── kernel-eventbus-integration.spec.ts   # Event Bus observation
└── kernel-service-integration.spec.ts    # Service Registry observation
```

**Example Test:**
```typescript
// tests/integration/kernel-logger-integration.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { log } from '../../src/shared/logger.js';
import { getRecentLogs } from '../../src/kernel/boot-kernel.js';
import { startTrace, getCurrentCorrelationId } from '../../src/kernel/correlation.js';

describe('Kernel-Logger Integration', () => {
  it('should propagate logs to kernel observer', async () => {
    log('info', 'test-component', 'test-operation', 'Test message');
    
    const kernelLogs = getRecentLogs(1);
    expect(kernelLogs[0]).toMatchObject({
      component: 'test-component',
      message: 'Test message',
    });
  });
  
  it('should include correlation ID when in trace', async () => {
    await startTrace({ source: 'test' }, async () => {
      const correlationId = getCurrentCorrelationId();
      log('info', 'test', 'op', 'Traced message');
      
      const kernelLogs = getRecentLogs(1);
      expect(kernelLogs[0].correlationId).toBe(correlationId);
    });
  });
});
```

---

### §11. Error Recovery Testing

**Problem:** Kernel error detector lacks chaos testing for failure scenarios.

**Required Tests:**
```typescript
describe('Kernel Error Detector Resilience', () => {
  it('should capture error when database is unavailable', async () => {
    // Simulate DB failure
    vi.mock('../shared/prisma.js', () => ({
      prisma: { $queryRaw: vi.fn().mockRejectedValue(new Error('Connection refused')) },
    }));
    
    // Error should still be captured in kernel
    const errorId = await errorTracker.captureError(new Error('Test'), {});
    expect(errorId).toBeDefined();
    
    // Should be in kernel buffer
    const kernelErrors = Kernel.getErrors();
    expect(kernelErrors.some(e => e.id === errorId)).toBe(true);
  });
  
  it('should write crash report on disk when all else fails', async () => {
    // Simulate total failure
    Kernel.detectCrash();
    
    // Should have written crash file
    expect(fs.existsSync('Store/kernel-crashes/')).toBe(true);
  });
});
```

---

## 📋 Implementation Roadmap

### Sprint 3: Core Integration (NEXT)

| Task ID | Description | Owner | Est. |
|---------|-------------|-------|------|
| `KERNEL.INTEGRATION.LOGGER` | Connect shared/logger.ts to kernel hook | Systems | 2h |
| `KERNEL.INTEGRATION.CORRELATION` | Inject correlation IDs in logger | Systems | 2h |
| `KERNEL.INTEGRATION.ERROR_TRACKER` | Connect error-tracker to kernel | Security | 2h |
| `KERNEL.INTEGRATION.EVENT_BUS` | Bridge Event Bus to kernel observation | Observability | 2h |

### Sprint 4: System Observation

| Task ID | Description | Owner | Est. |
|---------|-------------|-------|------|
| `KERNEL.OBSERVE.SERVICE_REGISTRY` | Hook Service Registry to kernel | Systems | 2h |
| `KERNEL.OBSERVE.DISCORD_TRACES` | Wrap Discord interactions in traces | Game | 3h |
| `KERNEL.OBSERVE.WORKERS` | Add kernel hooks to background workers | Systems | 2h |

### Sprint 5: Testing & Hardening

| Task ID | Description | Owner | Est. |
|---------|-------------|-------|------|
| `KERNEL.TEST.INTEGRATION` | Integration test suite | Quality | 4h |
| `KERNEL.TEST.CHAOS` | Failure mode testing | Quality | 3h |
| `KERNEL.TEST.PERFORMANCE` | Benchmark kernel overhead | Observability | 2h |

---

## 🎯 Priority Matrix

```
                    HIGH IMPACT
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    │  P0: Logger Hook  │  P1: Error Hook   │
    │  P0: Correlation  │  P1: Event Bus    │
    │                   │                   │
LOW ├───────────────────┼───────────────────┤ HIGH
EFFORT                  │                   EFFORT
    │                   │                   │
    │  P2: Workers      │  P3: Full Testing │
    │  P2: Database     │  P3: Dashboard    │
    │                   │                   │
    └───────────────────┼───────────────────┘
                        │
                    LOW IMPACT
```

---

## ✅ Immediate Actions (Today)

1. **Connect `shared/logger.ts` to kernel** — Import and use `createLoggerHook`
2. **Inject correlation IDs** — Use `getCorrelationData()` in log entries
3. **Wire PII scrubber** to console output plugin
4. **Wrap Discord interactions** in `startDiscordTraceAsync`

---

**Expert Panel Consensus:** The kernel infrastructure is sound. The gap is **integration** — all pieces exist but aren't connected. Sprint 3 should focus entirely on wiring application systems to kernel hooks.

---

*Document generated by AI Expert Panel — 2025-12-26*
