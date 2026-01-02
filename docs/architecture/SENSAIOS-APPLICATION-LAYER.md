# SensaiOS Application Layer — Detailed Architecture

**Version:** 1.0  
**Date:** December 30, 2025  
**Location:** `src/app/`  
**Status:** Current & Accurate

---

## 🎯 Purpose

The Application Layer is **user-space domain adapters** that load POST-OS (after SensaiOS initializes). It provides domain-specific facades that simplify SensaiOS primitives for different application contexts (Discord, Workers, Infrastructure).

**Architectural Position:**
- **Layer 3** (User Space) — Loads AFTER SensaiOS (Layer 2) is initialized
- Sits ABOVE SensaiOS (Operating System)
- Parallel to Observability Layer (both are user-space systems)
- NO layers between Application and SensaiOS (direct access to OS primitives)

**Key Benefits:**
- **Clean Separation** — Application code imports from `src/app/` (which wraps SensaiOS), not kernel directly
- **Testability** — Facades can be mocked independently of kernel/OS
- **Flexibility** — Kernel can change without breaking application code (SensaiOS abstracts it)
- **Security** — All kernel/OS access is auditable through this single entry point

---

## 🏗️ Component Architecture

**Position in 3-Layer Model:** Layer 3A (User Space) — Domain adapters that load POST-OS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  LAYER 3A: APPLICATION LAYER (User Space)                   │
│                            (src/app/)                                       │
│               Domain adapters wrapping SensaiOS primitives                  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      APPLICATION ENTRY POINT                         │  │
│  │                           index.ts                                   │  │
│  │                                                                      │  │
│  │  • Re-exports from all adapters                                     │  │
│  │  • Single import point for application systems                      │  │
│  │  • Type re-exports (wraps SensaiOS, not kernel directly)            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                   │                                         │
│         ┌─────────────────────────┼─────────────────────────┐              │
│         ↓                         ↓                         ↓              │
│  ┌──────────────┐        ┌──────────────┐        ┌──────────────────┐     │
│  │   DISCORD    │        │   WORKER     │        │ INFRASTRUCTURE   │     │
│  │   ADAPTER    │        │   ADAPTER    │        │    ADAPTER       │     │
│  │              │        │              │        │                  │     │
│  │ discord-     │        │ worker-      │        │ infrastructure-  │     │
│  │ adapter.ts   │        │ adapter.ts   │        │ adapter.ts       │     │
│  └──────────────┘        └──────────────┘        └──────────────────┘     │
│         │                         │                         │              │
│         │                         │                         │              │
└─────────┼─────────────────────────┼─────────────────────────┼──────────────┘
          │                         │                         │
          │ Use SensaiOS primitives (ctx.db, ctx.exports, ctx.jobs, etc.)   │
          ↓                         ↓                         ↓
    ┌───────────────────────────────────────────────────────────────┐
    │              LAYER 2: SENSAIOS (Operating System)             │
    │     Component Context → 9 kernel primitives injection         │
    └───────────────────────────────────────────────────────────────┘
                               │
                               ↓ Direct access to substrate
    ┌───────────────────────────────────────────────────────────────┐
    │         LAYER 1: KERNEL (Mainframe Substrate)                 │
    │    Metrics, DB control, cross-layer parsing → DB              │
    └───────────────────────────────────────────────────────────────┘
          │                         │                         │
          ↓                         ↓                         ↓
    ┌─────────────┐         ┌─────────────┐         ┌─────────────────┐
    │  Discord    │         │   Workers   │         │  Infrastructure │
    │  Bot Layer  │         │  (Engine)   │         │     Systems     │
    │             │         │             │         │                 │
    │ src/bot/    │         │ src/workers/│         │ src/shared/     │
    │             │         │             │         │ src/services/   │
    └─────────────┘         └─────────────┘         └─────────────────┘
```

---

## 📦 Adapter Details

### **1. index.ts** — Unified Entry Point

**Responsibility:** Single import point for all application code

**Structure:**
```typescript
// Application code imports from here only
import {
  // Discord-specific
  appLog,
  withDiscordTrace,
  createHandler,
  scopeFromInteraction,
  
  // Worker-specific
  workerLog,
  executeWorker,
  createWorkerHook,
  
  // Infrastructure hooks
  createLoggerHook,
  createErrorTrackerHook,
  createInfrastructureHook,
  // ... all other hooks
  
  // Correlation utilities
  getCurrentCorrelationId,
  startTrace,
  continueTrace,
  
  // Infrastructure metrics
  getDashboard,
  observeInfraMetric,
  getInfrastructureMetrics,
  
  // Types
  type AppLogLevel,
  type HandlerContext,
  type InfrastructureMetrics,
  // ... all other types
} from '@/app';
```

**Why This Design?**
- **Single Source of Truth** — One place to audit what's exposed
- **No Kernel Leakage** — Application never sees `src/kernel/*` imports
- **Type Safety** — All types re-exported, no need to import from kernel
- **Future-Proof** — Can add app-specific middleware without kernel changes

---

### **2. discord-adapter.ts** — Discord Bot Facade

**Responsibility:** Simplifies kernel APIs for Discord bot handlers

#### **Key Exports:**

##### **appLog** — Simplified Logging
```typescript
export const appLog = {
  debug: (component: string, message: string, data?: Record<string, unknown>) => void;
  info: (component: string, message: string, data?: Record<string, unknown>) => void;
  warn: (component: string, message: string, data?: Record<string, unknown>) => void;
  error: (component: string, message: string, data?: Record<string, unknown>) => void;
};
```

**Features:**
- Automatically attaches correlation ID from current context
- Wraps kernel logger with simplified API
- No need for bot code to know about kernel internals

**Usage:**
```typescript
import { appLog } from '@/app';

// In Discord command handler
appLog.info('battle', 'Starting battle', { challengerId, defenderId });
appLog.warn('battle', 'Invalid move selection', { moveId });
appLog.error('battle', 'Battle engine failed', { error: err.message });
```

##### **withDiscordTrace** — Discord Handler Tracing
```typescript
export interface DiscordTraceOptions {
  interactionId: string;
  userId: string;
  guildId: string | null;
  operation: string;
}

export function withDiscordTrace<T>(
  options: DiscordTraceOptions,
  callback: () => Promise<T>
): Promise<T>;
```

**Features:**
- Wraps Discord handlers with automatic correlation tracking
- Creates trace with `DISCORD_COMMAND` or `DISCORD_INTERACTION` source
- Logs start/completion/errors with timing

**Usage:**
```typescript
await withDiscordTrace(
  {
    interactionId: interaction.id,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    operation: 'battle.start',
  },
  async () => {
    // Handler logic here
    await handleBattleStart(interaction);
  }
);
```

##### **scopeFromInteraction** — Tenant Scope Extraction
```typescript
export function scopeFromInteraction(
  interaction: CommandInteraction | ButtonInteraction
): TenantScope;

export function scopeFromGuild(guildId: string): TenantScope;
```

**Features:**
- Extracts `{ tenantId, guildId }` from Discord interactions
- Used for multi-tenant context in SensaiOS operations
- Ensures all operations carry tenant scope

**Usage:**
```typescript
const scope = scopeFromInteraction(interaction);
// => { tenantId: 'prod', guildId: '1234567890' }

await ctx.exports.append({
  source: 'game.battles',
  type: 'battle.completed',
  scope,  // ← Mandatory in v1.1.2
  payload: { battleId },
  // ...
});
```

##### **createHandler** — Wrapped Handler Pattern
```typescript
export interface HandlerContext {
  correlationId: string;
  scope: TenantScope;
  log: {
    debug: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
  };
}

export function createHandler<T>(
  operation: string,
  handler: (ctx: HandlerContext, ...args: T[]) => Promise<void>
): (...args: T[]) => Promise<void>;
```

**Features:**
- Wraps handlers with full observability (correlation, logging, timing)
- Provides pre-configured context object
- Error capture and structured logging

**Usage:**
```typescript
export const handleBattleCommand = createHandler(
  'battle.command',
  async (ctx, interaction: CommandInteraction) => {
    ctx.log.info('Battle command received', { userId: interaction.user.id });
    
    // Handler logic with automatic correlation
    const battle = await createBattle(ctx.scope, ...);
    
    ctx.log.info('Battle created', { battleId: battle.id });
  }
);
```

---

### **3. worker-adapter.ts** — Worker Facade

**Responsibility:** Simplifies kernel APIs for background workers

#### **Key Exports:**

##### **workerLog** — Worker-Specific Logging
```typescript
export const workerLog = {
  debug: (worker: string, message: string, data?: Record<string, unknown>) => void;
  info: (worker: string, message: string, data?: Record<string, unknown>) => void;
  warn: (worker: string, message: string, data?: Record<string, unknown>) => void;
  error: (worker: string, message: string, data?: Record<string, unknown>) => void;
};
```

**Features:**
- Automatically attaches correlation ID
- Marks logs with `workerContext: true` for filtering
- Same API as `appLog` but worker-specific

**Usage:**
```typescript
import { workerLog } from '@/app';

workerLog.info('cache-refresh', 'Starting cache refresh', { entries: 100 });
workerLog.error('cache-refresh', 'Refresh failed', { error: err.message });
```

##### **executeWorker** — Worker Execution Wrapper
```typescript
export interface WorkerExecutionOptions {
  workerName: string;
  jobId?: string;
  timeoutMs?: number;
}

export async function executeWorker<T>(
  options: WorkerExecutionOptions,
  callback: () => Promise<T>
): Promise<T>;
```

**Features:**
- Wraps worker execution with automatic tracing
- Logs start/completion/errors with timing
- Correlation tracking across async operations

**Usage:**
```typescript
await executeWorker(
  { workerName: 'cache-refresh', jobId: 'job-123' },
  async () => {
    workerLog.info('cache-refresh', 'Starting refresh');
    await refreshCache();
    workerLog.info('cache-refresh', 'Refresh complete');
  }
);
```

##### **createWorkerHook** — Worker Registration
```typescript
export interface WorkerHook {
  register: () => void;
  log: (level: string, component: string, operation: string, message: string, metadata?: Record<string, unknown>) => void;
  error: (errorId: string, fingerprint: string, category: string, severity: string, error: Error, context?: Record<string, unknown>) => void;
  unregister: () => void;
}

export function createWorkerHook(
  id: string,
  name: string,
  metadata?: Record<string, unknown>
): WorkerHook;
```

**Features:**
- Registers worker with kernel observer
- Provides logging and error reporting
- Tracks worker health and activity

**Usage:**
```typescript
const workerHook = createWorkerHook('cache-refresh-worker', 'Cache Refresh Worker', {
  interval: '1h',
  priority: 'medium',
});

workerHook.register();

// Worker runs...
workerHook.log('info', 'cache-refresh', 'refresh', 'Refreshed 100 entries');

// On shutdown
workerHook.unregister();
```

---

### **4. infrastructure-adapter.ts** — Infrastructure Facade

**Responsibility:** Re-exports ALL kernel hooks and utilities for infrastructure systems

#### **Key Re-Exports:**

##### **System Hooks**
```typescript
// All hook factories
export {
  createLoggerHook,           // For logger systems
  createErrorTrackerHook,     // For error tracking
  createServiceRegistryHook,  // For service registry
  createEventBusHook,         // For event bus
  createDatabaseHook,         // For database connections
  createDiscordHook,          // For Discord clients
  createWorkerHook,           // For workers
  createCacheHook,            // For cache systems
  createIntelligenceHook,     // For AI/ML systems
  createObservabilityHook,    // For observability backends
  createInfrastructureHook,   // For resource monitoring
  createCustomHook,           // For extensibility
  
  // Hook types
  type LoggerHook,
  type ErrorTrackerHook,
  // ... all other hook types
};
```

##### **Correlation Tracking**
```typescript
export {
  // Context retrieval
  getCurrentCorrelationId,
  getParentCorrelationId,
  getRootCorrelationId,
  getCurrentContext,
  isInTrace,
  
  // ID generation
  generateCorrelationId,
  generateShortCorrelationId,
  
  // Trace management
  startTrace,
  startTraceAsync,
  continueTrace,
  continueTraceAsync,
  withCorrelation,
  
  // Types
  type CorrelationContext,
  type TraceSource,
  type TraceMetadata,
  type StartTraceOptions,
  type CorrelationStats,
};
```

##### **Kernel Query API**
```typescript
export {
  queryKernel,         // Query kernel state
  kernelLog,           // Quick log to kernel
  subscribeToLogs,     // Real-time log stream
  subscribeToErrors,   // Real-time error stream
  subscribeToServices, // Real-time service events
  subscribeToEvents,   // Real-time event bus events
  subscribeToMetrics,  // Real-time metrics stream
};
```

##### **Infrastructure Metrics**
```typescript
export {
  // Dashboard
  getDashboard,           // Get kernel dashboard
  getOverallHealth,       // Get health score (0-100)
  exportMetrics,          // Export all metrics
  
  // Recording
  observeInfraMetric,     // Record single metric
  observeInfraMetrics,    // Record batch metrics
  onInfraMetric,          // Subscribe to metrics
  
  // Queries
  getRecentInfraMetrics,      // Recent metrics (limit, category)
  getInfraMetricsByCategory,  // Filter by category
  getLatestInfraMetric,       // Latest value for metric
  getAllLatestInfraMetrics,   // All latest values
  getInfrastructureMetrics,   // Aggregated view
  getInfraMetricStats,        // Statistics
  
  // Definitions
  registerMetricDefinition,   // Register new metric
  getMetricDefinitions,       // Get all definitions
  
  // Kernel metrics
  recordMetric,           // Record kernel metric
  getMetricTrend,         // Get trend data
  getAllTrends,           // All trend data
  checkForAnomalies,      // Detect anomalies
  getAnomalies,           // Get anomaly list
  getActiveAnomalies,     // Active anomalies only
  clearAnomalies,         // Clear anomaly list
  
  // Types
  type KernelDashboard,
  type MetricTrend,
  type SystemAnomaly,
  type MetricCategory,
  type MetricUnit,
  type MetricType,
  type MetricHook,
  type ResourceMetricObservation,
  type InfrastructureMetrics,
  type MetricDefinition,
};
```

**Why This Exists?**
- **Single Import Point** — Infrastructure systems import from `@/app` only
- **Centralized Auditing** — All kernel access goes through here
- **Type Safety** — All types re-exported, no kernel imports needed
- **Future Middleware** — Can add logging/validation without kernel changes

---

## 🔄 Usage Patterns

### **Discord Bot Pattern**
```typescript
// src/bot/commands/battle.ts
import {
  appLog,
  withDiscordTrace,
  scopeFromInteraction,
} from '@/app';

export async function handleBattleCommand(interaction: CommandInteraction) {
  await withDiscordTrace(
    {
      interactionId: interaction.id,
      userId: interaction.user.id,
      guildId: interaction.guildId,
      operation: 'battle.start',
    },
    async () => {
      const scope = scopeFromInteraction(interaction);
      
      appLog.info('battle', 'Starting battle', { userId: interaction.user.id });
      
      // Business logic...
      const battle = await createBattle(scope, ...);
      
      appLog.info('battle', 'Battle created', { battleId: battle.id });
    }
  );
}
```

### **Worker Pattern**
```typescript
// src/workers/cache-refresh-worker.ts
import {
  workerLog,
  executeWorker,
  createWorkerHook,
} from '@/app';

const hook = createWorkerHook('cache-refresh', 'Cache Refresh Worker');
hook.register();

export async function runCacheRefresh() {
  await executeWorker(
    { workerName: 'cache-refresh' },
    async () => {
      workerLog.info('cache-refresh', 'Starting refresh');
      
      // Worker logic...
      const entries = await refreshCache();
      
      workerLog.info('cache-refresh', 'Refresh complete', { entries });
    }
  );
}
```

### **Infrastructure Pattern**
```typescript
// src/services/monitoring/resource-monitor.ts
import {
  createInfrastructureHook,
  type ResourceMetricObservation,
} from '@/app';

const hook = createInfrastructureHook('resource-monitor', 'Resource Monitor');
hook.register();

// Record metrics
setInterval(() => {
  const memory = process.memoryUsage();
  
  hook.metric({
    source: 'resource-monitor',
    category: 'MEMORY',
    name: 'heap_used',
    value: memory.heapUsed,
    unit: 'bytes',
    timestamp: new Date(),
    uptimeMs: process.uptime() * 1000,
  });
  
  // Get health
  const health = hook.health();
  if (health.alertLevel !== 'NORMAL') {
    console.warn('Health alert:', health.alertLevel, health.healthScore);
  }
}, 5000);
```

### **Logger Integration Pattern**
```typescript
// src/shared/logger.ts
import {
  createLoggerHook,
} from '@/app';

const hook = createLoggerHook('application-logger', 'Application Logger', {
  version: '1.0.0',
});

hook.register();

export function log(level: string, component: string, message: string, data?: Record<string, unknown>) {
  // Forward to kernel
  hook.log(level, component, 'log', message, data);
  
  // Also do local logging
  console.log(`[${level}] [${component}] ${message}`, data);
}
```

---

## 🎯 Design Principles

### **1. Facade Pattern**
- Each adapter provides simplified API for its domain
- Hides kernel complexity from application code
- Domain-specific types and functions

### **2. Single Responsibility**
- **Discord Adapter** — Discord bot concerns only
- **Worker Adapter** — Background worker concerns only
- **Infrastructure Adapter** — System integration only

### **3. Type Safety**
- All types re-exported from kernel
- Application code never imports `../kernel/*`
- TypeScript enforces contracts

### **4. Fail-Safe by Default**
- All hooks already catch errors (kernel design)
- Adapter adds no additional failure modes
- Application continues even if kernel fails

### **5. Observable by Default**
- All operations traced with correlation IDs
- Automatic timing and logging
- No manual instrumentation needed

---

## 📊 Benefits

| Benefit | How Application Layer Provides It |
|---------|-----------------------------------|
| **Testability** | Mock adapters instead of kernel |
| **Type Safety** | Re-exported types, no kernel imports |
| **Flexibility** | Can change kernel without breaking apps |
| **Security** | Auditable entry point, controlled access |
| **Simplicity** | Domain-specific facades vs raw kernel APIs |
| **Performance** | Zero overhead (re-exports only) |
| **Observability** | Automatic tracing and logging |

---

## 🔌 Extension Points

### **Add New Adapter**
1. Create `src/app/new-adapter.ts`
2. Import from kernel as needed
3. Export simplified facade
4. Re-export from `src/app/index.ts`

### **Add App-Specific Behavior**
```typescript
// src/app/discord-adapter.ts

// Add rate limiting to appLog
export const appLog = {
  info: (component: string, message: string, data?: Record<string, unknown>): void => {
    // Rate limit check (app-specific logic)
    if (shouldRateLimit(component)) return;
    
    // Forward to kernel
    const correlationId = getCurrentCorrelationId();
    kernel.info(component, message, { ...data, correlationId });
  },
};
```

### **Add Middleware**
```typescript
// src/app/middleware.ts

export function withRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  return withDiscordTrace({ operation }, async () => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        appLog.warn('retry', `Retry ${i + 1}/${maxRetries}`, { operation });
      }
    }
    throw new Error('Unreachable');
  });
}
```

---

## 📚 Related Documentation

- **System Overview:** [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md)
- **Kernel Layer:** [SENSAIOS-KERNEL-DETAIL.md](./SENSAIOS-KERNEL-DETAIL.md)
- **Observability Layer:** [SENSAIOS-OBSERVABILITY-LAYER.md](./SENSAIOS-OBSERVABILITY-LAYER.md) (next)
- **Application Entry Point:** `src/app/index.ts`

---

**Next Diagram:** [Diagram 4: Observability Layer Detail](./SENSAIOS-OBSERVABILITY-LAYER.md)
