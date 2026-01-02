# Operating Systems / Runtime Architect — Expert Review
**Focus:** Kernel/OS Boundary, Lifecycle, "No Layers In Between"  
**Date:** December 30, 2025  
**Review Depth:** Comprehensive Analysis

---

## Executive Summary

Your 3-layer architecture is the right simplification, but documentation alone won't prevent drift. You need active enforcement mechanisms—think of how a real operating system prevents userland from directly accessing ring-0 hardware. That's what you're building here: a software OS where layers have hard boundaries, enforced at compile-time (TypeScript paths, ESLint) and runtime (capability checks, supervisor gates).

The biggest risks I see:
1. **Convenience erosion** — "Just one import" becomes a tangled dependency graph
2. **Boot timing bugs** — User-space code running before kernel is ready
3. **Shutdown races** — Components shutting down in wrong order, losing data
4. **Lifecycle confusion** — No clear contract for what primitives do in each state

Fix these now, before the codebase grows. Every month you wait, the cost 10x.

---

## Core Recommendations

### 1. Enforce 3-Layer Model as a Rule

"The 3-layer model is the right simplification. Now enforce it as a rule: Kernel exposes primitives + substrate control; SensaiOS owns lifecycle + composition; user-space is everything that *consumes* those contracts."

#### Architectural Rule (Non-Negotiable)
```
LAYER 1 (Kernel):   Primitives + substrate control (ring buffers, DB stop/control, parsing)
                    - Zero dependencies on SensaiOS or user-space
                    - Syscall-like interface (stable, small, boring)
                    - Owned by: Infrastructure team

LAYER 2 (SensaiOS): Lifecycle + composition (supervisor, DI, component model)
                    - Only imports from Kernel
                    - Manages all component loading/enabling/disabling
                    - Owned by: Platform team

LAYER 3 (User):     Consumption of contracts (adapters, backends, application)
                    - Only imports from SensaiOS (never Kernel directly)
                    - No knowledge of boot sequence or other components
                    - Owned by: Application teams
```

#### Why This Matters

In a traditional OS, user-space cannot directly access hardware—it goes through kernel syscalls. You're building the same model in software:

- **Kernel** = Ring 0 (hardware abstraction)
- **SensaiOS** = Kernel modules + init system (lifecycle, drivers)
- **User-space** = Applications (Discord bot, workers, observability)

If user-space imports Kernel directly, you've broken the abstraction. It's like letting `/usr/bin/app` directly touch `/dev/mem`—you'd never allow that in a real OS, so don't allow it here.

#### Concrete Example

```typescript
// ❌ VIOLATION: User-space importing Kernel directly
// File: src/bot/battle.ts
import { kernelLogger } from '../../kernel/kernel-logger.js';
import { kernelMetrics } from '../../kernel/kernel-metrics.js';

export async function executeTurn(battleId: string) {
  kernelLogger.log({ source: 'game.battles', operation: 'execute-turn' });
  // This looks harmless, but now the Discord bot knows about kernel internals
}

// ✅ CORRECT: User-space via SensaiOS adapter
// File: src/bot/battle.ts
import { appLog, createHandler } from '../../app/discord-adapter.js';

export const executeTurn = createHandler('execute-turn', async (ctx, battleId: string) => {
  // ctx provided by SensaiOS, no kernel knowledge required
  ctx.obs.log.info('Execute turn', { battleId });
  // Adapter routes to kernel transparently
});
```

**Why the second is better:**
1. Discord bot has zero knowledge of kernel structure
2. If kernel internals change (ring buffer → database), bot doesn't break
3. Testability: mock `ctx.obs` instead of kernel logger
4. Security: SensaiOS enforces capabilities before forwarding to kernel


### 2. Prevent "Middle Layer" Reintroduction

"Your biggest risk is accidentally reintroducing a 'middle layer' through convenience helpers. The smell is: anything that both understands boot sequencing *and* understands app-level semantics."

#### The Middle Layer Anti-Pattern

Middle layers form when engineers get impatient with the proper abstraction and create shortcuts. It starts innocently:

```typescript
// Week 1: "Let's make logging easier"
// File: src/utils/easy-logger.ts
import { kernelLogger } from '../kernel/kernel-logger.js';
import { discordClient } from '../bot/client.js';

export function logWithDiscord(message: string) {
  kernelLogger.log({ source: 'helper', message });
  if (discordClient.isReady()) {
    // Also send to Discord admin channel
  }
}
```

**Why this is a middle layer:**
- Imports from both Kernel (bottom) and Application (top)
- Knows about boot state (`discordClient.isReady()`)
- Knows about app semantics (Discord admin channel)

Six months later:
- 47 files import `easy-logger`
- Kernel refactor requires updating this file
- Discord bot refactor requires updating this file
- Supervisor has no control over lifecycle
- Tests break because they mock the wrong layer

#### Warning Signs (Code Smells)

**Smell #1: Bidirectional Imports**
```typescript
// ❌ RED FLAG
// File: src/helpers/bridge.ts
import { kernel } from '../kernel/index.js';
import { discordBot } from '../bot/index.js';
import { workerPool } from '../workers/index.js';
```
If a file imports from multiple layers, it's probably a middle layer.

**Smell #2: "Smart" Helpers**
```typescript
// ❌ RED FLAG
export function smartLog(message: string, options?: SmartLogOptions) {
  // "Smart" logic that understands both kernel and application
  if (isBootPhase()) {
    useBootLogger();
  } else if (isTestEnvironment()) {
    useConsole();
  } else if (options?.sendToDiscord) {
    useKernelAndDiscordChannel();
  }
}
```
Logic that switches based on boot phase OR environment OR app state is a middle layer.

**Smell #3: Lifecycle Observers**
```typescript
// ❌ RED FLAG
// File: src/utils/startup-watcher.ts
kernel.on('ready', () => {
  initializeDiscordBot(); // User-space from a kernel event
});
```
If you're wiring user-space components from kernel events, that wiring MUST be in SensaiOS supervisor, not a utility file.

#### The Correct Pattern: Always Through SensaiOS

```typescript
// ✅ CORRECT: Adapter in Layer 3
// File: src/app/discord-adapter.ts
import { createComponentContext } from '../../sensai/component-context.js';

export function appLog(message: string, data?: Record<string, unknown>) {
  const ctx = createComponentContext('discord.bot');
  ctx.obs.log.info(message, data);
  // SensaiOS routes to kernel transparently
}

// ✅ CORRECT: Lifecycle in SensaiOS
// File: src/sensai/component-supervisor.ts
export class ComponentSupervisor {
  async enableComponent(name: string): Promise<void> {
    const manifest = this.registry.get(name);
    
    // Supervisor knows about lifecycle, components don't
    await manifest.onEnable?.(this.createContext(name));
  }
}
```

#### Enforcement Strategy

**Compile-Time (TypeScript Path Mapping):**
```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@kernel/*": ["src/kernel/*"],
      "@sensai/*": ["src/sensai/*"],
      "@app/*": ["src/app/*"]
    }
  }
}
```
Then configure ESLint to block:
- `@app/*` importing `@kernel/*`
- `@observability/*` importing `@kernel/*`
- `@kernel/*` importing `@sensai/*` or `@app/*`

**Lint-Time (ESLint Import Rules):**
See implementation in validation checklist section below.


### 3. Make Boot Chain Non-Negotiable

"Make the boot chain explicit and non-negotiable: Boot logger → Kernel minimal init → SensaiOS supervisor init → register/enable components → user-space wiring (application + observability). If anything user-space runs before supervisor readiness, you've broken the model."

#### Why Boot Order Matters

Boot timing bugs are the worst kind of heisenbug:
- They only happen on cold starts (not hot reloads)
- They're often masked by "retry until it works" logic
- They cause production outages at 3am when the service restarts
- They're nearly impossible to reproduce locally

A real example I've seen:
```typescript
// ❌ DISASTER WAITING TO HAPPEN
// File: src/index.ts
import { initKernel } from './kernel/boot-kernel.js';
import { initDiscordBot } from './bot/index.js';
import { initWorkers } from './workers/index.js';

// Top-level imports execute immediately
const botClient = new DiscordClient(); // ← RUNS BEFORE KERNEL INIT

async function main() {
  await initKernel();
  // Bot already started, might try to log before kernel logger is ready
}
```

**Result:** 1 in 50 boots, the Discord bot tries to log before the kernel logger ring buffer exists. Crash.

#### The Non-Negotiable Boot Sequence

```typescript
// File: src/index.ts
import { initBootLogger } from './kernel/boot-kernel.js';

// PHASE 1: Boot Logger (no dependencies)
// This is the ONLY thing that can happen before main()
const bootLog = initBootLogger();
bootLog.info('Boot sequence started', { timestamp: Date.now() });

async function main() {
  try {
    // PHASE 2: Kernel Minimal Init
    bootLog.info('Initializing kernel');
    const kernel = await initKernel(bootLog);
    bootLog.info('Kernel ready', { 
      primitives: kernel.getPrimitivesList(),
      uptime: kernel.getUptime() 
    });

    // PHASE 3: SensaiOS Supervisor + DI
    bootLog.info('Initializing SensaiOS supervisor');
    const supervisor = await initSupervisor(kernel);
    
    // Register all components (DOES NOT ENABLE THEM)
    await supervisor.registerAllComponents();
    bootLog.info('Components registered', { 
      count: supervisor.getComponentCount(),
      components: supervisor.getComponentNames() 
    });

    // PHASE 4: User-Space Wiring (Application + Observability)
    bootLog.info('Enabling user-space components');
    
    // Enable observability first (so we can monitor application startup)
    await supervisor.enableComponents(['observability.*']);
    bootLog.info('Observability components enabled');
    
    // Then enable application components
    await supervisor.enableComponents(['application.*']);
    bootLog.info('Application components enabled');

    // PHASE 5: Mark READY for requests
    await kernel.markReady();
    bootLog.info('System READY', { 
      totalBootTime: kernel.getUptime(),
      state: 'ENABLED' 
    });

  } catch (error) {
    bootLog.fatal('Boot failed', { 
      error: error.message, 
      stack: error.stack,
      phase: getCurrentPhase() 
    });
    process.exit(1);
  }
}

main();
```

#### Enforcement: Gate User-Space Startup

```typescript
// File: src/bot/index.ts
import { getSystemState } from '../sensai/component-supervisor.js';

export async function initDiscordBot() {
  // ✅ CORRECT: Check system state before proceeding
  const state = await getSystemState();
  
  if (state !== 'READY') {
    throw new Error(
      `Cannot initialize Discord bot: system state is ${state}, expected READY. ` +
      `This indicates a boot sequence violation. Check src/index.ts boot chain.`
    );
  }
  
  // Now safe to proceed
  const client = new DiscordClient();
  // ...
}
```

#### Common Boot Violations to Avoid

**Violation #1: Top-Level Side Effects**
```typescript
// ❌ WRONG: This runs at import time, before main()
// File: src/services/cache.ts
import { prisma } from '../shared/prisma.js';

const cache = await initializeCache(prisma); // ← Runs at import!
export { cache };

// ✅ CORRECT: Lazy initialization
let _cache: Cache | null = null;

export async function getCache(): Promise<Cache> {
  if (!_cache) {
    assertSystemReady(); // Gate check
    _cache = await initializeCache(prisma);
  }
  return _cache;
}
```

**Violation #2: Event Listeners in Global Scope**
```typescript
// ❌ WRONG: Listener registered at import time
// File: src/bot/handlers.ts
import { client } from './client.js';

client.on('messageCreate', handleMessage); // ← Runs at import!

// ✅ CORRECT: Register during component enable
export async function enableDiscordHandlers(ctx: ComponentContext) {
  const client = await getDiscordClient();
  client.on('messageCreate', createHandler(ctx, handleMessage));
}
```

**Violation #3: Database Queries at Module Load**
```typescript
// ❌ WRONG: Query runs at import time
// File: src/config/feature-flags.ts
const flags = await prisma.featureFlag.findMany(); // ← Runs at import!

export { flags };

// ✅ CORRECT: Query during component init
export async function loadFeatureFlags(ctx: ComponentContext): Promise<FeatureFlags> {
  return await ctx.db.featureFlag.findMany();
}
```

#### State Machine Enforcement

```typescript
// File: src/sensai/component-supervisor.ts
export type SystemState = 'INIT' | 'READY' | 'ENABLED' | 'DRAINING' | 'STOPPED';

let currentState: SystemState = 'INIT';

export function getSystemState(): SystemState {
  return currentState;
}

export function assertSystemState(expected: SystemState | SystemState[]): void {
  const expectedStates = Array.isArray(expected) ? expected : [expected];
  
  if (!expectedStates.includes(currentState)) {
    throw new LifecycleError({
      code: 3001,
      message: `Invalid system state: expected ${expectedStates.join(' or ')}, got ${currentState}`,
      context: { currentState, expectedStates }
    });
  }
}

// Use in every user-space entry point
export async function initDiscordBot() {
  assertSystemState(['READY', 'ENABLED']);
  // ...
}
```


### 4. Define Kernel API Like Syscalls

"Define the Kernel API like a syscall surface: small, stable, boring. If a change requires app knowledge, it does not belong in Kernel."

#### The Syscall Analogy

In Linux, there are ~330 syscalls. That number hasn't changed much in decades. Why? Because syscalls are the contract between kernel and userland—breaking them breaks everything.

Your kernel should have the same philosophy:

**Kernel API Rules:**
- **Small:** 9 primitives only (db, exports, jobs, outbox, obs, rng, rbac, config, storage)
  - If you find yourself adding a 10th, question whether it's truly foundational
- **Stable:** Changes must be rare and backward-compatible
  - Semver MAJOR version bump if signature changes
  - Deprecation period (6+ months) before removal
- **Boring:** No business logic, no app-specific knowledge
  - Kernel doesn't know what a "battle" or "Pokemon" is
  - Kernel only knows: transactions, logs, metrics, jobs
- **Isolated:** Kernel cannot import SensaiOS or application modules
  - Enforced via linter (see validation checklist)

#### What Belongs in Kernel vs SensaiOS vs User-Space

**Belongs in Kernel (Layer 1):**
```typescript
// ✅ Generic primitive
ctx.db.transaction(async (tx) => {
  // Kernel provides transaction wrapper
  // Doesn't know what's inside the transaction
});

// ✅ Generic event log
ctx.exports.append({
  source: 'game.battles',  // Kernel doesn't interpret this
  type: 'battle.completed', // Just stores it
  payload: { battleId: '123' } // Opaque to kernel
});

// ✅ Generic ring buffer
ctx.obs.log.info('message', { data }); // Kernel buffers, doesn't interpret
```

**Belongs in SensaiOS (Layer 2):**
```typescript
// ✅ Component lifecycle
await supervisor.enableComponent('game.battles');

// ✅ Dependency injection
const ctx = createComponentContext('game.battles', manifest);

// ✅ Capability enforcement
await rbac.assert({ component: 'game.battles', action: 'db.write' });
```

**Belongs in User-Space (Layer 3):**
```typescript
// ✅ Business logic
export async function resolveBattleTurn(battleId: string, moveId: string) {
  // Application knows what a battle is
  // Application uses ctx.db, ctx.exports (via SensaiOS)
  // But doesn't touch kernel directly
}
```

#### Anti-Pattern: App-Specific Kernel Code

```typescript
// ❌ WRONG: Kernel should NOT know about battles
// File: src/kernel/kernel-observer.ts
export function observeBattleEvent(event: BattleEvent) {
  if (event.type === 'turn-completed') {
    // Special handling for battle turns
  }
}

// ✅ CORRECT: Kernel handles generic events
// File: src/kernel/kernel-observer.ts
export function observeEvent(event: GenericEvent) {
  // Store in ring buffer
  // Route to subscribers
  // Kernel doesn't interpret event semantics
}
```

#### API Stability Contract

When you do need to change a kernel primitive, follow this process:

**Step 1: Deprecate (6 months minimum)**
```typescript
/**
 * @deprecated Use ctx.exports.append() instead. Will be removed in v3.0.0.
 * Migration guide: docs/migrations/v2-to-v3.md
 */
export function legacyEmit(event: Event): void {
  console.warn('legacyEmit is deprecated, use ctx.exports.append()');
  // Forward to new API
  exports.append(migrateEvent(event));
}
```

**Step 2: Update all internal usage**
- grep for `legacyEmit` across codebase
- Update all calls to new API
- Commit with message: "Migrate legacyEmit → exports.append"

**Step 3: Remove (after deprecation period)**
- Delete deprecated function
- Semver MAJOR bump (v2.0.0 → v3.0.0)
- Release notes explain the breaking change

#### Backward Compatibility Techniques

**Technique #1: Overloads**
```typescript
// Old signature (deprecated)
export function append(type: string, payload: unknown): void;

// New signature (preferred)
export function append(envelope: ExportEnvelope): void;

// Implementation handles both
export function append(arg1: string | ExportEnvelope, arg2?: unknown): void {
  if (typeof arg1 === 'string') {
    // Legacy path
    return append({ type: arg1, payload: arg2, /* defaults */ });
  }
  // New path
  appendInternal(arg1);
}
```

**Technique #2: Optional Fields**
```typescript
// Before
interface ExportEnvelope {
  type: string;
  payload: unknown;
}

// After (backward compatible)
interface ExportEnvelope {
  type: string;
  payload: unknown;
  scope?: TenantScope;        // New optional field
  correlationId?: string;      // New optional field
}

// Kernel fills in defaults if not provided
function append(envelope: ExportEnvelope): void {
  const normalized = {
    ...envelope,
    scope: envelope.scope ?? inferScope(),
    correlationId: envelope.correlationId ?? generateCorrelationId()
  };
  // ...
}
```

**Technique #3: Adapter Pattern**
```typescript
// If you absolutely MUST change signature, create an adapter
export const exportsV1 = {
  emit: (type: string, payload: unknown) => exports.append({ type, payload })
};

export const exportsV2 = {
  append: (envelope: ExportEnvelope) => exports.append(envelope)
};

// User-space can choose version
import { exportsV1 } from '@kernel/exports'; // Old code
import { exportsV2 } from '@kernel/exports'; // New code
```


### 5. Stop/Control Flow Must Be First-Class

"Stop/control flow must be first-class: shutdown ordering, deadlines, and flush policies. Specify per-buffer behavior (flush, drop, persist) and make it deterministic."

#### Why Shutdown is Harder Than Startup

Shutdown bugs are worse than boot bugs because:
1. They cause **data loss** (unflushed buffers)
2. They cause **corruption** (partial writes)
3. They're **time-sensitive** (SIGTERM → 30s → SIGKILL)
4. They're **rare** (you boot every deploy, but clean shutdown only on graceful restarts)

A production example I've debugged:
```typescript
// ❌ WRONG: No coordination
process.on('SIGTERM', () => {
  prisma.$disconnect();  // ← Runs first
  logger.flush();        // ← Tries to write to closed DB
  process.exit(0);       // ← Never reached due to error
});
```
**Result:** 10 seconds of battle logs lost every deploy.

#### The Shutdown Contract (Non-Negotiable)

```typescript
// File: src/index.ts
async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, starting graceful shutdown`);
  
  // PHASE 1: Mark NOT READY (stop accepting new work)
  // Duration: <100ms
  console.log('Phase 1: Marking NOT READY');
  await kernel.markNotReady();
  // HTTP health checks now return 503
  // Discord bot stops accepting commands
  // Workers stop pulling from job queue
  
  // PHASE 2: Stop user-space (drain in-flight work)
  // Duration: Up to 10s (configurable per component)
  console.log('Phase 2: Draining user-space');
  await supervisor.disableComponents(['application.*', 'observability.*'], {
    timeout: 10000,  // 10s max
    allowInFlight: true  // Finish current work
  });
  
  // PHASE 3: Drain/flush buffers (critical path)
  // Duration: Up to 5s
  console.log('Phase 3: Flushing buffers');
  const flushResults = await kernel.flushBuffers({
    logs: { policy: 'FLUSH', timeout: 3000 },
    metrics: { policy: 'DROP' },  // Observability can be lost
    errors: { policy: 'FLUSH', timeout: 5000 },
    exports: { policy: 'MUST_FLUSH', timeout: 5000 }  // Correctness-critical
  });
  
  // Log flush results (to console, DB is still available)
  console.log('Flush results:', JSON.stringify(flushResults, null, 2));
  
  // PHASE 4: Persist snapshots (crash recovery)
  // Duration: Up to 2s
  console.log('Phase 4: Persisting snapshots');
  await kernel.persistSnapshots({
    includeRingBuffers: true,
    includeComponentState: true
  });
  
  // PHASE 5: Stop kernel (close DB, release resources)
  // Duration: Up to 1s
  console.log('Phase 5: Stopping kernel');
  await kernel.shutdown();
  
  console.log('Graceful shutdown complete');
  process.exit(0);
}

// Register handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Hard deadline: if graceful shutdown takes >25s, force exit
setTimeout(() => {
  console.error('Graceful shutdown exceeded 25s, forcing exit');
  process.exit(1);
}, 25000);
```

#### Per-Buffer Flush Policies

```typescript
type FlushPolicy = 'FLUSH' | 'DROP' | 'MUST_FLUSH';

interface FlushConfig {
  policy: FlushPolicy;
  timeout?: number;  // ms, default 3000
}

interface FlushResult {
  buffer: string;
  policy: FlushPolicy;
  itemsFlushed: number;
  itemsDropped: number;
  duration: number;  // ms
  error?: string;
}

async function flushBuffer(
  buffer: RingBuffer, 
  config: FlushConfig
): Promise<FlushResult> {
  const startTime = Date.now();
  
  if (config.policy === 'DROP') {
    // Immediate drop, no I/O
    const itemsDropped = buffer.length;
    buffer.clear();
    return { 
      buffer: buffer.name, 
      policy: 'DROP', 
      itemsFlushed: 0, 
      itemsDropped, 
      duration: 0 
    };
  }
  
  if (config.policy === 'FLUSH' || config.policy === 'MUST_FLUSH') {
    const items = buffer.drain();
    let flushed = 0;
    let error: string | undefined;
    
    try {
      // Attempt flush with timeout
      await Promise.race([
        flushToDB(items).then(() => { flushed = items.length; }),
        sleep(config.timeout ?? 3000).then(() => { throw new Error('Timeout'); })
      ]);
    } catch (err) {
      error = err.message;
      
      if (config.policy === 'MUST_FLUSH') {
        // MUST_FLUSH: retry or fail loudly
        console.error(`CRITICAL: Failed to flush ${buffer.name}, retrying...`);
        try {
          await flushToDB(items);  // Retry without timeout
          flushed = items.length;
          error = undefined;
        } catch (retryErr) {
          // Give up, but log to console + file as fallback
          await emergencyDumpToFile(buffer.name, items);
          error = `Failed after retry: ${retryErr.message}`;
        }
      }
    }
    
    return {
      buffer: buffer.name,
      policy: config.policy,
      itemsFlushed: flushed,
      itemsDropped: items.length - flushed,
      duration: Date.now() - startTime,
      error
    };
  }
}
```

#### Component Shutdown Hooks

```typescript
// File: src/sensai/component-manifest.ts
export interface ComponentManifest {
  name: string;
  
  // Lifecycle hooks
  onEnable?(ctx: ComponentContext): Promise<void>;
  onDisable?(ctx: ComponentContext, options: DisableOptions): Promise<void>;
  
  // Shutdown configuration
  shutdown?: {
    timeout?: number;       // Max ms to wait for component shutdown (default 10s)
    allowInFlight?: boolean; // Finish in-flight work? (default true)
    priority?: number;      // Shutdown order (higher = earlier, default 100)
  };
}

interface DisableOptions {
  reason: 'shutdown' | 'maintenance' | 'error';
  timeout: number;      // Deadline for this component
  allowInFlight: boolean;
}

// Example: Discord bot component
export const discordBotComponent: ComponentManifest = {
  name: 'discord.bot',
  
  async onEnable(ctx) {
    const client = await initDiscordClient(ctx);
    await client.login(ctx.config.get('BOT_TOKEN'));
  },
  
  async onDisable(ctx, options) {
    const client = getDiscordClient();
    
    if (options.allowInFlight) {
      // Wait for in-flight commands to complete
      await client.waitForPendingInteractions(options.timeout * 0.8);
    }
    
    // Graceful disconnect
    await client.destroy();
    
    ctx.obs.log.info('Discord bot disabled', { reason: options.reason });
  },
  
  shutdown: {
    timeout: 10000,        // 10s max
    allowInFlight: true,   // Finish current commands
    priority: 200          // Shut down before observability (100)
  }
};
```

#### Shutdown Ordering by Priority

```typescript
// Higher priority = shuts down earlier
const SHUTDOWN_PRIORITIES = {
  // User-facing services shut down first (stop new work)
  DISCORD_BOT: 300,
  HTTP_SERVER: 300,
  WORKER_POOL: 250,
  
  // Application logic drains
  BATTLE_ENGINE: 200,
  ENCOUNTER_SYSTEM: 200,
  
  // Observability stays up as long as possible
  OBSERVABILITY_HUB: 100,
  LOKI_BACKEND: 90,
  
  // Infrastructure last (needed by everyone else)
  KERNEL: 10
};

async function shutdownByPriority(components: ComponentManifest[]): Promise<void> {
  // Sort by priority (descending)
  const sorted = components.slice().sort((a, b) => 
    (b.shutdown?.priority ?? 100) - (a.shutdown?.priority ?? 100)
  );
  
  for (const component of sorted) {
    console.log(`Disabling ${component.name} (priority ${component.shutdown?.priority ?? 100})`);
    await supervisor.disableComponent(component.name, {
      reason: 'shutdown',
      timeout: component.shutdown?.timeout ?? 10000,
      allowInFlight: component.shutdown?.allowInFlight ?? true
    });
  }
}
```

#### Testing Shutdown Behavior

```typescript
// File: tests/shutdown.spec.ts
describe('Shutdown', () => {
  it('should flush exports before closing DB', async () => {
    // Arrange
    await kernel.markReady();
    await ctx.exports.append({ type: 'test', payload: { id: 1 } });
    
    // Act
    await shutdown('SIGTERM');
    
    // Assert
    const persisted = await prisma.export.findMany();
    expect(persisted).toHaveLength(1);
  });
  
  it('should drop metrics if timeout exceeded', async () => {
    // Arrange
    await kernel.markReady();
    for (let i = 0; i < 10000; i++) {
      ctx.obs.metrics.inc('test.metric');
    }
    
    // Act
    const result = await kernel.flushBuffers({
      metrics: { policy: 'FLUSH', timeout: 10 } // Very short timeout
    });
    
    // Assert
    expect(result.metrics.itemsDropped).toBeGreaterThan(0);
  });
  
  it('should respect shutdown priority order', async () => {
    // Arrange
    const shutdownOrder: string[] = [];
    const mockComponents = [
      { name: 'observability', shutdown: { priority: 100 } },
      { name: 'discord', shutdown: { priority: 300 } },
      { name: 'kernel', shutdown: { priority: 10 } }
    ];
    
    // Act
    await shutdownByPriority(mockComponents);
    
    // Assert
    expect(shutdownOrder).toEqual(['discord', 'observability', 'kernel']);
  });
});

### 6. Observability Must Not Block Correctness

"Do not let observability become a dependency of correctness. Observability can observe and export, but the system must remain correct when logs/metrics are degraded or disabled."

#### The Correctness vs Observability Split

This is a **non-negotiable architectural principle**: the system must work even if observability is completely broken.

Real-world scenario I've seen cause 2 production outages:
```typescript
// ❌ WRONG: Observability failure crashes the system
async function handleBattleCommand(interaction: CommandInteraction) {
  // This blocks correctness path
  await logger.flush();  // ← 5s timeout
  await metrics.send();  // ← Another 3s timeout
  
  // If observability is down, battle never happens
  const result = await executeBattle(interaction);
  await interaction.reply(result);
}
```

**Problem:** When Loki went down (disk full), battles stopped working. Users couldn't play the game, even though the game logic was fine.

#### Correct Pattern: Fire-and-Forget + Backpressure

```typescript
// ✅ CORRECT: Observability is async and non-blocking
async function handleBattleCommand(interaction: CommandInteraction) {
  const correlationId = generateCorrelationId();
  
  // Correctness path: ZERO dependencies on observability
  const result = await executeBattle(interaction);
  await interaction.reply(result);
  
  // Observability: Fire-and-forget (don't await)
  // These run in background and can fail silently
  ctx.obs.log.info('battle.completed', { 
    correlationId, 
    battleId: result.id 
  }).catch(ignoreObservabilityError);
  
  ctx.obs.metrics.inc('battles.completed', { 
    outcome: result.outcome 
  }).catch(ignoreObservabilityError);
}

function ignoreObservabilityError(err: Error): void {
  // Log to console (last resort) but don't propagate
  console.error('Observability error (non-fatal):', err.message);
}
```

#### Health Checks Are Independent

```typescript
// File: src/health.ts
export async function healthCheck(): Promise<HealthStatus> {
  // ✅ CORRECT: Check only correctness-critical dependencies
  const checks = await Promise.all([
    checkDatabase(),      // Correctness: Can't play without DB
    checkDiscordAPI(),    // Correctness: Can't send commands
    checkKernel()         // Correctness: Need primitives
    // ❌ NOT CHECKED: Loki, Grafana, metrics backend
  ]);
  
  const healthy = checks.every(c => c.ok);
  
  return {
    status: healthy ? 'UP' : 'DOWN',
    checks,
    timestamp: new Date().toISOString()
  };
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'database', ok: true };
  } catch (err) {
    return { name: 'database', ok: false, error: err.message };
  }
}

// ❌ WRONG: Don't include observability in health checks
async function checkLoki(): Promise<CheckResult> {
  // This would cause health check to fail when observability is down
  // But the system can still function!
  try {
    await lokiClient.push([{ labels: { health: 'check' }, entries: [] }]);
    return { name: 'loki', ok: true };
  } catch (err) {
    return { name: 'loki', ok: false, error: err.message };
  }
}
```

#### Observability Circuit Breaker

When observability backends are failing, stop sending traffic to them:

```typescript
// File: src/observability/circuit-breaker.ts
interface CircuitState {
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailure?: Date;
  lastSuccess?: Date;
}

class ObservabilityCircuitBreaker {
  private state: CircuitState = { status: 'CLOSED', failures: 0 };
  
  private readonly FAILURE_THRESHOLD = 5;    // Open after 5 failures
  private readonly RESET_TIMEOUT = 60000;    // Try again after 1 minute
  private readonly SUCCESS_THRESHOLD = 3;     // Close after 3 successes
  
  async execute<T>(operation: () => Promise<T>): Promise<T | null> {
    if (this.state.status === 'OPEN') {
      // Circuit is open: fail fast, don't even try
      const elapsed = Date.now() - this.state.lastFailure!.getTime();
      
      if (elapsed > this.RESET_TIMEOUT) {
        // Try again (HALF_OPEN state)
        this.state.status = 'HALF_OPEN';
        console.log('Circuit breaker: Attempting recovery (HALF_OPEN)');
      } else {
        // Still in cooldown
        return null;  // Drop observability event
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      return null;  // Drop event on failure
    }
  }
  
  private onSuccess(): void {
    if (this.state.status === 'HALF_OPEN') {
      // Recovery attempt succeeded
      const successes = (this.state.failures < 0 ? -this.state.failures : 0) + 1;
      
      if (successes >= this.SUCCESS_THRESHOLD) {
        // Fully recovered
        this.state = { status: 'CLOSED', failures: 0 };
        console.log('Circuit breaker: Closed (recovered)');
      } else {
        // Track recovery progress (use negative failures as success counter)
        this.state.failures = -successes;
      }
    }
    
    this.state.lastSuccess = new Date();
  }
  
  private onFailure(err: Error): void {
    this.state.failures++;
    this.state.lastFailure = new Date();
    
    if (this.state.failures >= this.FAILURE_THRESHOLD) {
      this.state.status = 'OPEN';
      console.warn('Circuit breaker: Opened due to failures', {
        failures: this.state.failures,
        lastError: err.message
      });
    }
  }
  
  getState(): CircuitState {
    return { ...this.state };
  }
}

// Usage in observability hub
const lokiCircuit = new ObservabilityCircuitBreaker();

async function sendToLoki(events: LogEvent[]): Promise<void> {
  await lokiCircuit.execute(async () => {
    await lokiBackend.push(events);
  });
  // Returns null if circuit is open = events dropped
  // But game keeps working!
}
```

#### Graceful Degradation Example

```typescript
// File: src/observability/hub.ts
export class ObservabilityHub {
  private backends: Map<string, ObservabilityBackend> = new Map();
  private circuits: Map<string, ObservabilityCircuitBreaker> = new Map();
  
  async emit(event: ObservabilityEvent): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [name, backend] of this.backends) {
      const circuit = this.circuits.get(name)!;
      
      // Fire-and-forget with circuit breaker
      const promise = circuit.execute(async () => {
        await backend.send(event);
      }).catch(err => {
        // Observability error: log to console but don't propagate
        console.error(`Observability backend ${name} failed:`, err.message);
      });
      
      promises.push(promise);
    }
    
    // DON'T await promises: fire-and-forget
    // Caller (game logic) continues immediately
    Promise.allSettled(promises);  // Run in background
  }
  
  getBackendHealth(): Record<string, CircuitState> {
    const health: Record<string, CircuitState> = {};
    for (const [name, circuit] of this.circuits) {
      health[name] = circuit.getState();
    }
    return health;
  }
}
```

#### Testing Observability Independence

```typescript
// File: tests/observability-independence.spec.ts
describe('Observability Independence', () => {
  it('should execute battle when Loki is down', async () => {
    // Arrange: Kill Loki backend
    await lokiBackend.stop();
    
    // Act: Execute battle
    const result = await handleBattleCommand(mockInteraction);
    
    // Assert: Battle still works
    expect(result.outcome).toBe('VICTORY');
    expect(result.winnerId).toBe(trainer1.id);
  });
  
  it('should open circuit breaker after 5 failures', async () => {
    // Arrange: Loki is down
    await lokiBackend.stop();
    
    // Act: Send 5 events (will fail)
    for (let i = 0; i < 5; i++) {
      await obs.emit({ type: 'test', payload: {} });
    }
    
    // Assert: Circuit is now OPEN
    const health = obs.getBackendHealth();
    expect(health.loki.status).toBe('OPEN');
  });
  
  it('should drop events when circuit is open', async () => {
    // Arrange: Circuit is OPEN
    await forceCircuitOpen('loki');
    
    // Act: Try to send event
    const result = await obs.emit({ type: 'test', payload: {} });
    
    // Assert: Event was dropped (returned null)
    expect(result).toBeNull();
    // But no error was thrown (non-blocking)
  });
  
  it('should exclude observability from health checks', async () => {
    // Arrange: Loki is down
    await lokiBackend.stop();
    
    // Act: Check health
    const health = await healthCheck();
    
    // Assert: Still healthy (Loki failure doesn't matter)
    expect(health.status).toBe('UP');
  });
});
```

#### Summary: The Golden Rule

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  IF THE GAME LOGIC WORKS, THE HEALTH CHECK SAYS "UP".       │
│                                                               │
│  Observability failures are OPERATIONAL issues, not          │
│  CORRECTNESS issues.                                         │
│                                                               │
│  Players can still battle even if we can't see the logs.     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Design Principle:**
- **Correctness layer**: DB + exports + jobs + outbox (MUST work)
- **Observability layer**: logs + metrics (CAN fail without breaking correctness)



### 7. Enforce Boundaries in Repo Structure

"Enforce boundaries in the repo structure: Kernel code cannot import SensaiOS or application modules; SensaiOS can import Kernel; user-space can import SensaiOS (and optionally Kernel only via OS-provided context). If TypeScript pathing makes this hard, add lint rules or build-time checks."

#### Why Enforce at Build Time?

Runtime enforcement is too late. By the time you catch a boundary violation at runtime, the code is already deployed. You want to catch violations during **development** (IDE warnings) and **CI** (build failures).

The analogy: a C compiler won't let you call a userland function from kernel code. We need the same for TypeScript.

#### TypeScript Path Mapping

```json
// File: tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      // Kernel imports NOTHING
      "@kernel/*": ["src/kernel/*"],
      
      // SensaiOS can import Kernel
      "@sensai/*": ["src/sensai/*"],
      
      // Application/User-space can import SensaiOS (not Kernel directly)
      "@app/*": ["src/app/*"],
      "@observability/*": ["src/observability/*"]
    }
  }
}
```

#### ESLint Boundary Rules

```javascript
// File: eslint.config.js
import { FlatCompat } from '@eslint/eslintrc';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    files: ['src/kernel/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      // Kernel CANNOT import from upper layers
      'import/no-restricted-paths': ['error', {
        zones: [
          {
            target: './src/kernel',
            from: './src/sensai',
            message: 'Kernel cannot import from SensaiOS layer'
          },
          {
            target: './src/kernel',
            from: './src/app',
            message: 'Kernel cannot import from application layer'
          },
          {
            target: './src/kernel',
            from: './src/observability',
            message: 'Kernel cannot import from observability layer'
          }
        ]
      }]
    }
  },
  {
    files: ['src/app/**/*.ts', 'src/observability/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      // User-space CANNOT import Kernel directly
      'import/no-restricted-paths': ['error', {
        zones: [
          {
            target: './src/app',
            from: './src/kernel',
            message: 'Application must use SensaiOS adapters, not Kernel directly'
          },
          {
            target: './src/observability',
            from: './src/kernel',
            message: 'Observability must use SensaiOS adapters, not Kernel directly'
          }
        ]
      }]
    }
  }
];
```

#### Violation Examples (Caught by ESLint)

```typescript
// ❌ WRONG: Kernel importing from SensaiOS
// File: src/kernel/primitives/exports.ts
import { ComponentContext } from '@sensai/component'; // ← ERROR!
// ESLint: "Kernel cannot import from SensaiOS layer"

// ✅ CORRECT: Kernel owns its own types
// File: src/kernel/types.ts
export interface ExportsPrimitive {
  append(envelope: ExportEnvelope): Promise<void>;
}
```

```typescript
// ❌ WRONG: Application importing Kernel directly
// File: src/app/battles/handler.ts
import { ExportsPrimitive } from '@kernel/primitives/exports'; // ← ERROR!
// ESLint: "Application must use SensaiOS adapters, not Kernel directly"

// ✅ CORRECT: Application uses ComponentContext from SensaiOS
// File: src/app/battles/handler.ts
import { ComponentContext } from '@sensai/component';

export async function handleBattle(ctx: ComponentContext) {
  // ctx.exports is provided by SensaiOS (which wraps Kernel)
  await ctx.exports.append({ type: 'battle.completed', payload: {} });
}
```

```typescript
// ❌ WRONG: Observability importing Kernel directly
// File: src/observability/hub.ts
import { ObsPrimitive } from '@kernel/primitives/obs'; // ← ERROR!
// ESLint: "Observability must use SensaiOS adapters, not Kernel directly"

// ✅ CORRECT: Observability registers as component
// File: src/observability/hub.ts
import { ComponentManifest } from '@sensai/component';

export const observabilityHub: ComponentManifest = {
  name: 'observability.hub',
  
  async onEnable(ctx: ComponentContext) {
    // ctx.obs is provided by SensaiOS
    ctx.obs.log.info('Observability hub enabled');
  }
};
```

#### Build-Time Validation Script

```typescript
// File: scripts/validate-boundaries.ts
import { Project } from 'ts-morph';
import * as path from 'path';

interface Violation {
  file: string;
  line: number;
  imported: string;
  reason: string;
}

async function validateBoundaries(): Promise<Violation[]> {
  const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
  const violations: Violation[] = [];
  
  // Check Kernel files
  const kernelFiles = project.getSourceFiles('src/kernel/**/*.ts');
  for (const file of kernelFiles) {
    for (const importDecl of file.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      
      // Kernel importing from SensaiOS?
      if (moduleSpecifier.includes('/sensai/') || moduleSpecifier.startsWith('@sensai/')) {
        violations.push({
          file: file.getFilePath(),
          line: importDecl.getStartLineNumber(),
          imported: moduleSpecifier,
          reason: 'Kernel cannot import from SensaiOS layer'
        });
      }
      
      // Kernel importing from application?
      if (moduleSpecifier.includes('/app/') || moduleSpecifier.startsWith('@app/')) {
        violations.push({
          file: file.getFilePath(),
          line: importDecl.getStartLineNumber(),
          imported: moduleSpecifier,
          reason: 'Kernel cannot import from application layer'
        });
      }
    }
  }
  
  // Check Application files
  const appFiles = project.getSourceFiles('src/app/**/*.ts');
  for (const file of appFiles) {
    for (const importDecl of file.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      
      // Application importing Kernel directly?
      if (moduleSpecifier.includes('/kernel/') || moduleSpecifier.startsWith('@kernel/')) {
        violations.push({
          file: file.getFilePath(),
          line: importDecl.getStartLineNumber(),
          imported: moduleSpecifier,
          reason: 'Application must use SensaiOS adapters, not Kernel directly'
        });
      }
    }
  }
  
  return violations;
}

// Run validation
const violations = await validateBoundaries();

if (violations.length > 0) {
  console.error('❌ Boundary violations detected:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    Imported: ${v.imported}`);
    console.error(`    Reason: ${v.reason}\n`);
  }
  process.exit(1);
}

console.log('✅ All boundary rules satisfied');
```

#### CI Integration

```yaml
# File: .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Validate layer boundaries
        run: npm run validate:boundaries
      
      - name: Lint (includes ESLint boundary rules)
        run: npm run lint
      
      - name: Build
        run: npm run build
      
      - name: Test
        run: npm test
```

#### Automated Refactoring Tool

When you catch a violation, provide guidance on how to fix it:

```typescript
// File: scripts/fix-boundary-violation.ts
import { Project, ImportDeclaration } from 'ts-morph';

interface Fix {
  file: string;
  line: number;
  action: string;
}

async function suggestFixes(violation: Violation): Promise<Fix> {
  if (violation.reason.includes('must use SensaiOS adapters')) {
    // Application importing Kernel directly
    return {
      file: violation.file,
      line: violation.line,
      action: `Replace direct Kernel import with ComponentContext:
        
        ❌ Before:
        import { ExportsPrimitive } from '@kernel/primitives/exports';
        
        ✅ After:
        import { ComponentContext } from '@sensai/component';
        
        // Use ctx.exports instead of ExportsPrimitive directly
        export async function handler(ctx: ComponentContext) {
          await ctx.exports.append({ ... });
        }
      `
    };
  }
  
  if (violation.reason.includes('Kernel cannot import')) {
    // Kernel importing from upper layers
    return {
      file: violation.file,
      line: violation.line,
      action: `Move this functionality to SensaiOS layer:
        
        Kernel is the substrate - it should NOT know about components,
        lifecycle, or application logic. Move this code to:
        - src/sensai/ if it's lifecycle/component management
        - src/app/ if it's application-specific logic
      `
    };
  }
  
  return { file: violation.file, line: violation.line, action: 'Unknown fix' };
}
```

#### Summary: The Enforcement Pyramid

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  LEVEL 1: IDE (TypeScript paths)                            │
│    → Instant feedback while coding                           │
│                                                               │
│  LEVEL 2: ESLint (import rules)                             │
│    → Catches violations in editor + pre-commit               │
│                                                               │
│  LEVEL 3: Build-Time Validation (ts-morph script)           │
│    → Comprehensive check before CI                           │
│                                                               │
│  LEVEL 4: CI Pipeline (GitHub Actions)                      │
│    → Blocks PR merge if violations detected                  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Import Rules Recap:**
```typescript
// ✅ ALLOWED
// src/kernel/**       → imports NOTHING from src/sensai/ or src/app/ or src/observability/
// src/sensai/**       → imports from src/kernel/
// src/app/**          → imports from src/sensai/ (not src/kernel/ directly)
// src/observability/** → imports from src/sensai/ (not src/kernel/ directly)

// ❌ FORBIDDEN
// src/kernel/**       → src/sensai/**, src/app/**, src/observability/**
// src/app/**          → src/kernel/** (must go through SensaiOS)
// src/observability/** → src/kernel/** (must go through SensaiOS)
```



### 8. Document Lifecycle State Machine

"Next time you touch it: write down the lifecycle state machine (INIT → READY → ENABLED → DRAINING → STOPPED) and map every primitive's behavior across those states. That single document will prevent 80% of future architectural drift."

#### Why This Matters

Without a documented state machine, every developer invents their own. You end up with:
- Components that try to use primitives before they're ready
- Shutdown code that calls methods that are already closed
- Inconsistent behavior during drain phase
- Primitives that don't agree on what state they're in

I've seen a production bug where one primitive thought the system was DRAINING (reject new work) while another thought it was ENABLED (accept everything). **Result:** Data corruption because half the writes were rejected mid-transaction.

#### The Lifecycle State Machine

```
INIT ────→ READY ────→ ENABLED ────→ DRAINING ────→ STOPPED
  │          │            │              │              │
  │          │            │              │              │
Boot       Kernel      Components    Graceful      Final
logger     ready       enabled       shutdown     cleanup
started                              started
```

**State Definitions:**

| State | Duration | What's Happening | Who Can Run |
|-------|----------|------------------|-------------|
| **INIT** | Boot | Kernel primitives initializing | Boot logger only |
| **READY** | Normal | Kernel ready, components loading | Supervisor |
| **ENABLED** | Normal | Components active, serving requests | Everything |
| **DRAINING** | Shutdown (10-20s) | Finish in-flight work, no new work | Cleanup only |
| **STOPPED** | Final | Everything closed | Nothing |

#### Per-Primitive Behavior Matrix

```typescript
// File: src/kernel/lifecycle.ts
type LifecycleState = 'INIT' | 'READY' | 'ENABLED' | 'DRAINING' | 'STOPPED';

interface PrimitiveBehavior {
  state: LifecycleState;
  canWrite: boolean;
  canRead: boolean;
  canFlush: boolean;
  description: string;
}

const LIFECYCLE_MATRIX: Record<string, Record<LifecycleState, PrimitiveBehavior>> = {
  'ctx.db': {
    INIT: { 
      state: 'INIT', 
      canWrite: false, 
      canRead: false, 
      canFlush: false,
      description: 'Connecting to database, running migrations' 
    },
    READY: { 
      state: 'READY', 
      canWrite: true, 
      canRead: true, 
      canFlush: true,
      description: 'Fully operational, all operations allowed' 
    },
    ENABLED: { 
      state: 'ENABLED', 
      canWrite: true, 
      canRead: true, 
      canFlush: true,
      description: 'Fully operational, all operations allowed' 
    },
    DRAINING: { 
      state: 'DRAINING', 
      canWrite: false,  // ← READ-ONLY 
      canRead: true, 
      canFlush: true,
      description: 'Read-only mode, finishing transactions, no new writes' 
    },
    STOPPED: { 
      state: 'STOPPED', 
      canWrite: false, 
      canRead: false, 
      canFlush: false,
      description: 'Connection closed, all operations throw' 
    }
  },
  
  'ctx.exports': {
    INIT: { 
      state: 'INIT', 
      canWrite: false, 
      canRead: false, 
      canFlush: false,
      description: 'Ring buffer initializing' 
    },
    READY: { 
      state: 'READY', 
      canWrite: true, 
      canRead: true, 
      canFlush: true,
      description: 'Accepting append() calls, writes to DB' 
    },
    ENABLED: { 
      state: 'ENABLED', 
      canWrite: true, 
      canRead: true, 
      canFlush: true,
      description: 'Accepting append() calls, writes to DB' 
    },
    DRAINING: { 
      state: 'DRAINING', 
      canWrite: false,  // ← FLUSH ONLY
      canRead: true, 
      canFlush: true,
      description: 'No new append(), draining buffer to DB' 
    },
    STOPPED: { 
      state: 'STOPPED', 
      canWrite: false, 
      canRead: false, 
      canFlush: false,
      description: 'Buffer cleared, DB closed' 
    }
  },
  
  'ctx.jobs': {
    INIT: { 
      state: 'INIT', 
      canWrite: false, 
      canRead: false, 
      canFlush: false,
      description: 'Job queue initializing' 
    },
    READY: { 
      state: 'READY', 
      canWrite: true, 
      canRead: true, 
      canFlush: true,
      description: 'Accepting enqueue(), workers can lease()' 
    },
    ENABLED: { 
      state: 'ENABLED', 
      canWrite: true, 
      canRead: true, 
      canFlush: true,
      description: 'Accepting enqueue(), workers can lease()' 
    },
    DRAINING: { 
      state: 'DRAINING', 
      canWrite: false,  // ← COMPLETE ONLY
      canRead: true, 
      canFlush: true,
      description: 'No new enqueue(), finishing leased jobs' 
    },
    STOPPED: { 
      state: 'STOPPED', 
      canWrite: false, 
      canRead: false, 
      canFlush: false,
      description: 'Queue cleared, DB closed' 
    }
  },
  
  'ctx.outbox': {
    INIT: { 
      state: 'INIT', 
      canWrite: false, 
      canRead: false, 
      canFlush: false,
      description: 'Outbox initializing' 
    },
    READY: { 
      state: 'READY', 
      canWrite: true, 
      canRead: true, 
      canFlush: true,
      description: 'Accepting send(), deliverer can read()' 
    },
    ENABLED: { 
      state: 'ENABLED', 
      canWrite: true, 
      canRead: true, 
      canFlush: true,
      description: 'Accepting send(), deliverer can read()' 
    },
    DRAINING: { 
      state: 'DRAINING', 
      canWrite: false,  // ← FLUSH ONLY
      canRead: true, 
      canFlush: true,
      description: 'No new send(), delivering pending messages' 
    },
    STOPPED: { 
      state: 'STOPPED', 
      canWrite: false, 
      canRead: false, 
      canFlush: false,
      description: 'Outbox cleared, delivery stopped' 
    }
  },
  
  'ctx.obs': {
    INIT: { 
      state: 'INIT', 
      canWrite: true,   // ← Boot logger only
      canRead: false, 
      canFlush: false,
      description: 'Boot logger active (console only, no backends)' 
    },
    READY: { 
      state: 'READY', 
      canWrite: true, 
      canRead: true, 
      canFlush: true,
      description: 'All log levels, all backends' 
    },
    ENABLED: { 
      state: 'ENABLED', 
      canWrite: true, 
      canRead: true, 
      canFlush: true,
      description: 'All log levels, all backends' 
    },
    DRAINING: { 
      state: 'DRAINING', 
      canWrite: true,   // ← ERRORS ONLY
      canRead: true, 
      canFlush: true,
      description: 'ERROR/WARN only (drop INFO/DEBUG), flush buffers' 
    },
    STOPPED: { 
      state: 'STOPPED', 
      canWrite: false, 
      canRead: false, 
      canFlush: false,
      description: 'Observability backends closed' 
    }
  }
};
```

#### State Transition Enforcement

```typescript
// File: src/kernel/state-manager.ts
export class SystemStateManager {
  private currentState: LifecycleState = 'INIT';
  
  transition(to: LifecycleState): void {
    const validTransitions: Record<LifecycleState, LifecycleState[]> = {
      INIT: ['READY'],
      READY: ['ENABLED', 'STOPPED'],  // Can skip ENABLED if boot fails
      ENABLED: ['DRAINING'],
      DRAINING: ['STOPPED'],
      STOPPED: []  // Terminal state
    };
    
    if (!validTransitions[this.currentState].includes(to)) {
      throw new Error(
        `Invalid state transition: ${this.currentState} → ${to}. ` +
        `Valid: ${validTransitions[this.currentState].join(', ')}`
      );
    }
    
    console.log(`System state transition: ${this.currentState} → ${to}`);
    this.currentState = to;
  }
  
  assertState(expected: LifecycleState | LifecycleState[]): void {
    const allowed = Array.isArray(expected) ? expected : [expected];
    
    if (!allowed.includes(this.currentState)) {
      throw new Error(
        `Operation not allowed in state ${this.currentState}. ` +
        `Expected: ${allowed.join(' or ')}`
      );
    }
  }
  
  getState(): LifecycleState {
    return this.currentState;
  }
}
```

#### Primitive Implementation with State Checks

```typescript
// File: src/kernel/primitives/exports.ts
export class ExportsPrimitive {
  constructor(
    private db: PrismaClient,
    private stateManager: SystemStateManager
  ) {}
  
  async append(envelope: ExportEnvelope): Promise<void> {
    // Check: Can we write in current state?
    this.stateManager.assertState(['READY', 'ENABLED']);
    
    // Now we know it's safe to append
    await this.db.export.create({ data: envelope });
  }
  
  async flush(): Promise<FlushResult> {
    // Flush allowed in READY, ENABLED, DRAINING
    this.stateManager.assertState(['READY', 'ENABLED', 'DRAINING']);
    
    // Drain buffer to DB
    const items = this.buffer.drain();
    await this.db.export.createMany({ data: items });
    
    return { itemsFlushed: items.length };
  }
}
```

#### Testing State Transitions

```typescript
// File: tests/lifecycle.spec.ts
describe('Lifecycle State Machine', () => {
  it('should enforce valid state transitions', async () => {
    const stateManager = new SystemStateManager();
    
    // Valid: INIT → READY
    expect(() => stateManager.transition('READY')).not.toThrow();
    
    // Valid: READY → ENABLED
    expect(() => stateManager.transition('ENABLED')).not.toThrow();
    
    // Invalid: ENABLED → READY (can't go backwards)
    expect(() => stateManager.transition('READY')).toThrow(
      'Invalid state transition: ENABLED → READY'
    );
  });
  
  it('should reject operations in wrong state', async () => {
    const stateManager = new SystemStateManager();
    const exports = new ExportsPrimitive(prisma, stateManager);
    
    // State is INIT: append() should fail
    await expect(
      exports.append({ type: 'test', payload: {} })
    ).rejects.toThrow('Operation not allowed in state INIT');
    
    // Transition to READY: now it works
    stateManager.transition('READY');
    await expect(
      exports.append({ type: 'test', payload: {} })
    ).resolves.not.toThrow();
  });
  
  it('should enforce DRAINING read-only mode', async () => {
    const stateManager = new SystemStateManager();
    const db = new DatabasePrimitive(prisma, stateManager);
    
    // Transition to DRAINING
    stateManager.transition('READY');
    stateManager.transition('ENABLED');
    stateManager.transition('DRAINING');
    
    // Writes should fail
    await expect(
      db.insert('users', { name: 'Alice' })
    ).rejects.toThrow('Operation not allowed in state DRAINING');
    
    // Reads should work
    await expect(
      db.query('SELECT * FROM users')
    ).resolves.not.toThrow();
  });
});
```

#### Documentation Template

For every new primitive you add, fill out this template:

```typescript
/**
 * Primitive: ctx.newPrimitive
 * 
 * Lifecycle Behavior:
 * - INIT:     Setup connections, validate config
 * - READY:    Fully operational, all methods available
 * - ENABLED:  Fully operational, all methods available
 * - DRAINING: [SPECIFY: Read-only? Flush-only? Complete-only?]
 * - STOPPED:  Connections closed, all methods throw
 * 
 * State Assertions:
 * - read():   Allowed in READY | ENABLED | DRAINING
 * - write():  Allowed in READY | ENABLED
 * - flush():  Allowed in READY | ENABLED | DRAINING
 */
```

#### Summary: The Single Document That Prevents Drift

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  THIS MATRIX IS THE CONTRACT.                                │
│                                                               │
│  Every primitive MUST document its behavior in each state.   │
│  Every operation MUST check state before executing.          │
│  Every test MUST validate state transitions.                 │
│                                                               │
│  This prevents 80% of lifecycle bugs.                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Quick Reference Table:**

| Primitive | INIT | READY | ENABLED | DRAINING | STOPPED |
|-----------|------|-------|---------|----------|---------|
| ctx.db | Setup | ✅ Full | ✅ Full | ⚠️ Read-only | ❌ Closed |
| ctx.exports | Setup | ✅ Full | ✅ Full | ⚠️ Flush only | ❌ Closed |
| ctx.jobs | Setup | ✅ Full | ✅ Full | ⚠️ Complete only | ❌ Closed |
| ctx.outbox | Setup | ✅ Full | ✅ Full | ⚠️ Flush only | ❌ Closed |
| ctx.obs | Boot log | ✅ Full | ✅ Full | ⚠️ Errors only | ❌ Closed |



---

## Validation Checklist

- [ ] 3-layer architecture enforced (no convenience "middle" layers)
- [ ] Boot sequence documented and gated (user-space cannot run before supervisor READY)
- [ ] Shutdown sequence documented with per-buffer flush/drop policies
- [ ] Kernel API is small, stable, and app-agnostic
- [ ] Import boundaries enforced via ESLint rules
- [ ] Lifecycle state machine documented with per-primitive behavior matrix
- [ ] Observability independence verified (logs/metrics can fail without breaking correctness)

---

**Reference:** [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md)
