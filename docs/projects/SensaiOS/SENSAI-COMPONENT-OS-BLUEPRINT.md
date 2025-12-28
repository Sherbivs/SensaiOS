# Sensai OS — Component OS Blueprint

**Version:** 1.0.0  
**Status:** REFERENCE — Component Model Design  
**Authority:** Project Leadership (DRIPTVDD)  
**Created:** December 28, 2025

---

## 1. Executive Summary

This blueprint defines the **component model** that makes Sensai behave like an operating system. Components are the installable, removable, upgradable units of functionality that make up the game.

**Key Insight:** The component model is NOT plugins or microservices. It's closer to kernel modules — they share the same process, same database, same primitives, but have clear boundaries and contracts.

---

## 2. Component Philosophy

### 2.1 What Is a Component?

A component is a **self-contained unit of functionality** that:
- Declares its identity, capabilities, and resource needs
- Owns specific data (tables it can write to)
- Provides handlers for events (Discord, exports, jobs, HTTP, CLI)
- Has lifecycle hooks (load, enable, disable, unload)
- Can be enabled/disabled without affecting other components

### 2.2 Why Components?

| Problem | Solution |
|---------|----------|
| "Everything depends on everything" | Components declare explicit dependencies |
| "Can't disable feature X without breaking Y" | Components communicate via exports, not direct calls |
| "Who owns this table?" | Components declare data ownership |
| "Why is this service using 500 MB?" | Components declare resource budgets |
| "What capabilities does this code need?" | Components declare capabilities explicitly |

### 2.3 Component vs Module vs Service

| Concept | Scope | Communication | Lifecycle |
|---------|-------|---------------|-----------|
| **Module** | Code organization | Direct imports | N/A (always loaded) |
| **Service** | Separate process | Network/IPC | Independent |
| **Component** | Logical boundary | Exports/Jobs/Outbox | Enable/Disable |

Components sit between modules (too coupled) and services (too isolated). They're in the same process but have enforced boundaries.

---

## 3. Component Manifest

Every component MUST declare a manifest:

```typescript
export interface SensaiComponent {
  // === Identity ===
  name: string;                          // Scoped name: 'game.core', 'security.guard'
  version: string;                       // Semver: '1.2.3'
  description?: string;                  // Human-readable description

  // === Deployment ===
  hosts: HostKind[];                     // Where can this run?
  dependencies?: string[];               // Other components required

  // === Security ===
  capabilities: ComponentCapabilities;   // What permissions does it need?

  // === Data ===
  owns?: DataOwnership;                  // What data does it own?

  // === Resources ===
  resources?: ResourceBudget;            // How much can it use?

  // === Lifecycle ===
  onLoad?(ctx: ComponentContext): Promise<void>;
  onEnable?(ctx: ComponentContext): Promise<void>;
  onDisable?(ctx: ComponentContext): Promise<void>;
  onUnload?(ctx: ComponentContext): Promise<void>;

  // === Handlers ===
  handlers?: ComponentHandlers;
}
```

### 3.1 Identity

```typescript
const component: SensaiComponent = {
  name: 'game.battles',           // Scoped name
  version: '1.0.0',               // Semver
  description: 'Pokemon battle system',
};
```

**Naming Convention:** `{domain}.{subdomain}` (e.g., `game.core`, `game.battles`, `security.guard`)

### 3.2 Deployment

```typescript
type HostKind = 'bot' | 'worker' | 'cron' | 'cli';

const component: SensaiComponent = {
  // ...
  hosts: ['bot', 'worker'],       // Runs on bot and worker hosts
  dependencies: ['game.core'],    // Requires game.core to be enabled
};
```

**Host Types:**
- `bot` — Discord bot process (handles interactions)
- `worker` — Background worker process (handles jobs)
- `cron` — Scheduled job runner
- `cli` — CLI tool process

### 3.3 Capabilities

```typescript
interface ComponentCapabilities {
  db: Array<'read' | 'write' | 'migrate'>;
  discord?: Array<'read' | 'send' | 'moderate'>;
  network?: Array<'http-egress'>;
}

const component: SensaiComponent = {
  // ...
  capabilities: {
    db: ['read', 'write'],        // Can read and write to DB
    discord: ['read', 'send'],    // Can read and send Discord messages
    network: ['http-egress'],     // Can make outbound HTTP requests
  },
};
```

### 3.4 Data Ownership

```typescript
interface DataOwnership {
  canonical?: string[];           // Tables this component WRITES to
  projections?: string[];         // Read models it maintains
}

const component: SensaiComponent = {
  // ...
  owns: {
    canonical: ['Battle', 'BattleTurn'],  // Owns these tables
    projections: ['BattleStats'],          // Maintains this projection
  },
};
```

**Rule:** Only ONE component can own a canonical table. Multiple components can maintain projections.

### 3.5 Resource Budgets

```typescript
interface ResourceBudget {
  maxCacheMb?: number;            // Max memory for caching
  maxQueueSize?: number;          // Max items in internal queues
  maxConcurrency?: number;        // Max concurrent operations
}

const component: SensaiComponent = {
  // ...
  resources: {
    maxCacheMb: 50,               // 50 MB cache limit
    maxQueueSize: 1000,           // 1000 items max in queues
    maxConcurrency: 10,           // 10 concurrent operations
  },
};
```

---

## 4. Component Lifecycle

### 4.1 State Machine

```
                    ┌──────────────┐
                    │  UNINSTALLED │
                    └──────┬───────┘
                           │ install()
                           ▼
                    ┌──────────────┐
                    │  INSTALLED   │◄─────┐
                    │  (disabled)  │      │
                    └──────┬───────┘      │
                           │ enable()     │ disable()
                           ▼              │
                    ┌──────────────┐      │
                    │   ENABLED    │──────┘
                    │   (active)   │
                    └──────┬───────┘
                           │ uninstall()
                           ▼
                    ┌──────────────┐
                    │  UNINSTALLED │
                    └──────────────┘
```

### 4.2 Lifecycle Hooks

```typescript
const component: SensaiComponent = {
  // Called when component is loaded (but not yet enabled)
  async onLoad(ctx) {
    // Initialize resources, validate config
    ctx.obs.log.info('lifecycle', 'Component loaded');
  },

  // Called when component is enabled
  async onEnable(ctx) {
    // Start processing, register handlers
    ctx.obs.log.info('lifecycle', 'Component enabled');
  },

  // Called when component is disabled
  async onDisable(ctx) {
    // Stop processing, drain queues, cleanup
    ctx.obs.log.info('lifecycle', 'Component disabled');
  },

  // Called when component is unloaded
  async onUnload(ctx) {
    // Final cleanup, release resources
    ctx.obs.log.info('lifecycle', 'Component unloaded');
  },
};
```

### 4.3 Lifecycle Operations

**Install:**
1. Validate manifest
2. Check dependencies exist
3. Register in database (enabled=false)
4. Call `onLoad()` if defined

**Enable:**
1. Verify all dependencies are enabled
2. Call `onEnable()` if defined
3. Register all handlers
4. Update database (enabled=true)

**Disable:**
1. Unregister all handlers
2. Wait for in-flight operations
3. Call `onDisable()` if defined
4. Update database (enabled=false)

**Uninstall:**
1. Ensure component is disabled
2. Call `onUnload()` if defined
3. Remove from database
4. **NEVER drop tables** (data is preserved)

---

## 5. Component Handlers

### 5.1 Handler Types

```typescript
interface ComponentHandlers {
  discord?: Record<string, DiscordHandler>;
  exports?: Record<string, ExportHandler>;
  jobs?: Record<string, JobHandler>;
  http?: Record<string, HttpHandler>;
  cli?: Record<string, CliHandler>;
}
```

### 5.2 Discord Handlers

Handle Discord interactions (commands, buttons, modals):

```typescript
type DiscordHandler = (
  ctx: ComponentContext,
  interaction: Interaction
) => Promise<void>;

const component: SensaiComponent = {
  handlers: {
    discord: {
      'command:battle': async (ctx, interaction) => {
        // Handle /battle command
        await interaction.deferReply();
        const result = await startBattle(ctx, interaction);
        await interaction.editReply({ embeds: [result] });
      },
      'button:attack': async (ctx, interaction) => {
        // Handle attack button
        await processAttack(ctx, interaction);
      },
    },
  },
};
```

### 5.3 Export Handlers

Process events from the export log:

```typescript
type ExportHandler = (
  ctx: ComponentContext,
  envelope: ExportEnvelope
) => Promise<void>;

const component: SensaiComponent = {
  handlers: {
    exports: {
      'battle.started': async (ctx, envelope) => {
        // React to battle started event
        const { battleId, participants } = envelope.payload;
        await initializeBattleState(ctx, battleId, participants);
      },
      'battle.turn.submitted': async (ctx, envelope) => {
        // Process turn submission
        const { battleId, move } = envelope.payload;
        await processTurn(ctx, battleId, move);
      },
    },
  },
};
```

### 5.4 Job Handlers

Process background jobs:

```typescript
type JobHandler = (
  ctx: ComponentContext,
  job: LeasedJob
) => Promise<JobResult>;

const component: SensaiComponent = {
  handlers: {
    jobs: {
      'battle.timeout.check': async (ctx, job) => {
        // Check for timed-out battles
        const timedOut = await findTimedOutBattles(ctx);
        for (const battle of timedOut) {
          await forfeitBattle(ctx, battle.id, 'timeout');
        }
        return { processed: timedOut.length };
      },
    },
  },
};
```

### 5.5 HTTP Handlers

Handle HTTP requests (webhooks, health checks):

```typescript
type HttpHandler = (
  ctx: ComponentContext,
  req: HttpRequest
) => Promise<HttpResponse>;

const component: SensaiComponent = {
  handlers: {
    http: {
      'GET /health': async (ctx, req) => {
        return { status: 200, body: { ok: true } };
      },
      'POST /webhook/battle': async (ctx, req) => {
        // Handle external webhook
        await processWebhook(ctx, req.body);
        return { status: 200 };
      },
    },
  },
};
```

### 5.6 CLI Handlers

Handle CLI commands:

```typescript
type CliHandler = (
  ctx: ComponentContext,
  args: string[]
) => Promise<void>;

const component: SensaiComponent = {
  handlers: {
    cli: {
      'battle:list': async (ctx, args) => {
        const battles = await ctx.db.prisma.battle.findMany();
        console.table(battles);
      },
      'battle:cancel': async (ctx, args) => {
        const [battleId] = args;
        await cancelBattle(ctx, battleId);
        console.log(`Battle ${battleId} cancelled`);
      },
    },
  },
};
```

---

## 6. Component Communication

### 6.1 The Golden Rule

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│   COMPONENTS NEVER CALL EACH OTHER DIRECTLY.                     │
│                                                                   │
│   They communicate through:                                       │
│     - EXPORTS (facts/events)                                     │
│     - JOBS (background work requests)                            │
│     - OUTBOX (external side effects)                             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Export-Based Communication

**Component A wants Component B to do something:**

```typescript
// Component A: Request reward
await ctx.exports.append({
  source: 'game.battles',
  type: 'player.reward.request',
  payload: { trainerId, amount: 100, reason: 'battle_win' },
  idempotencyKey: `${battleId}-reward`,
  correlationId: ctx.obs.correlationId,
  scope: ctx.scope,
  occurredAt: new Date(),
});

// Component B: Handle request
// (in game.economy component)
handlers: {
  exports: {
    'player.reward.request': async (ctx, envelope) => {
      const { trainerId, amount, reason } = envelope.payload;
      
      // Actually grant the reward (game.economy owns Trainer.money)
      await ctx.db.prisma.trainer.update({
        where: { id: trainerId },
        data: { money: { increment: amount } }
      });
      
      // Emit fact that reward was granted
      await ctx.exports.append({
        source: 'game.economy',
        type: 'player.reward.granted',
        payload: { trainerId, amount, reason },
        idempotencyKey: envelope.idempotencyKey + '-granted',
        correlationId: envelope.correlationId,
        scope: envelope.scope,
        occurredAt: new Date(),
      });
    },
  },
}
```

### 6.3 Job-Based Communication

**Component A needs background work done:**

```typescript
// Component A: Enqueue job
await ctx.jobs.enqueue({
  kind: 'notification.send',
  payload: { userId, message: 'Battle won!' },
  correlationId: ctx.obs.correlationId,
  scope: ctx.scope,
});

// Component B: Process job
// (in notifications component)
handlers: {
  jobs: {
    'notification.send': async (ctx, job) => {
      const { userId, message } = job.payload;
      await sendNotification(ctx, userId, message);
      return { success: true };
    },
  },
}
```

### 6.4 Outbox-Based Communication

**Component needs to send external message:**

```typescript
// Send Discord message via outbox
await ctx.outbox.send({
  destination: 'discord',
  topic: 'channel.message',
  key: channelId,
  payload: { channelId, content: 'Battle starting!' },
  correlationId: ctx.obs.correlationId,
  scope: ctx.scope,
});

// Outbox worker delivers the message
// (handled by kernel, not components)
```

---

## 7. Component Context

Every handler receives a `ComponentContext`:

```typescript
interface ComponentContext {
  // Component identity
  component: SensaiComponent;
  
  // Tenant scope (v1.1.2)
  scope: TenantScope;
  
  // Kernel primitives
  db: DbPrimitive;
  exports: ExportsPrimitive;
  jobs: JobsPrimitive;
  outbox: OutboxPrimitive;
  config: ConfigPrimitive;
  rbac: RbacPrimitive;
  obs: ObsPrimitive;
  rng: RngPrimitive;
  storage: StoragePrimitive;
}
```

### 7.1 Creating Context

Context is created by the kernel for each handler invocation:

```typescript
function createContext(
  component: SensaiComponent,
  scope: TenantScope,
  correlationId: string
): ComponentContext {
  return {
    component,
    scope,
    db: kernel.db,
    exports: kernel.exports,
    jobs: kernel.jobs,
    outbox: kernel.outbox,
    config: kernel.config,
    rbac: kernel.rbac,
    obs: kernel.obs.withCorrelation(correlationId),
    rng: kernel.rng,
    storage: kernel.storage,
  };
}
```

### 7.2 Context Scoping

The context is scoped to:
1. **Component** — Which component is executing
2. **Tenant** — Which tenant (bot instance + guild)
3. **Correlation** — Which request chain this belongs to

---

## 8. Component Registration

### 8.1 Component Database Schema

```prisma
model Component {
  name        String   @id
  version     String
  manifest    Json
  enabled     Boolean  @default(false)
  installedAt DateTime @default(now())
  enabledAt   DateTime?
  disabledAt  DateTime?
  config      Json?
  
  @@map("sensai_components")
}
```

### 8.2 Component Registry

```typescript
class ComponentRegistry {
  private installed = new Map<string, SensaiComponent>();
  private enabled = new Map<string, SensaiComponent>();
  
  async install(component: SensaiComponent): Promise<void> {
    // Validate
    this.validateManifest(component);
    await this.checkDependencies(component.dependencies ?? []);
    
    // Register
    await this.db.prisma.component.create({
      data: {
        name: component.name,
        version: component.version,
        manifest: component as unknown as Prisma.JsonObject,
        enabled: false,
      },
    });
    
    this.installed.set(component.name, component);
    
    // Call onLoad
    if (component.onLoad) {
      await component.onLoad(this.createContext(component));
    }
  }
  
  async enable(name: string): Promise<void> {
    const component = this.installed.get(name);
    if (!component) throw new Error(`Component ${name} not installed`);
    
    // Check dependencies enabled
    for (const dep of component.dependencies ?? []) {
      if (!this.enabled.has(dep)) {
        throw new Error(`Dependency ${dep} not enabled`);
      }
    }
    
    // Enable
    await component.onEnable?.(this.createContext(component));
    this.registerHandlers(component);
    
    await this.db.prisma.component.update({
      where: { name },
      data: { enabled: true, enabledAt: new Date() },
    });
    
    this.enabled.set(name, component);
  }
  
  async disable(name: string): Promise<void> {
    const component = this.enabled.get(name);
    if (!component) return;
    
    // Check no dependents
    for (const [n, c] of this.enabled) {
      if (c.dependencies?.includes(name)) {
        throw new Error(`Cannot disable: ${n} depends on ${name}`);
      }
    }
    
    // Disable
    this.unregisterHandlers(component);
    await this.drainWork(component);
    await component.onDisable?.(this.createContext(component));
    
    await this.db.prisma.component.update({
      where: { name },
      data: { enabled: false, disabledAt: new Date() },
    });
    
    this.enabled.delete(name);
  }
}
```

---

## 9. Built-In Components

### 9.1 Core Components

| Component | Purpose | Hosts |
|-----------|---------|-------|
| `kernel.core` | Kernel services | all |
| `kernel.exports` | Export log management | worker |
| `kernel.jobs` | Job queue management | worker |
| `kernel.outbox` | Outbox delivery | worker |

### 9.2 Game Components

| Component | Purpose | Hosts |
|-----------|---------|-------|
| `game.core` | Core game logic, trainer management | bot, worker |
| `game.homestead` | Homestead channel features | bot |
| `game.encounters` | Wild Pokemon encounters | bot, worker |
| `game.battles` | Battle system | bot, worker |
| `game.economy` | Money, items, trading | bot, worker |

### 9.3 System Components

| Component | Purpose | Hosts |
|-----------|---------|-------|
| `security.guard` | Permission enforcement | bot, worker |
| `security.audit` | Audit logging | all |
| `observability.core` | Logging, metrics, tracing | all |
| `ops.cli-tools` | Administrative CLI | cli |

---

## 10. Component Configuration

### 10.1 Config Schema

Each component can define its configuration schema:

```typescript
const component: SensaiComponent = {
  name: 'game.battles',
  // ...
  configSchema: {
    turnTimeoutSeconds: { type: 'number', default: 60 },
    maxConcurrentBattles: { type: 'number', default: 100 },
    enableRankedMode: { type: 'boolean', default: false },
  },
};
```

### 10.2 Accessing Config

```typescript
handlers: {
  discord: {
    'command:battle': async (ctx, interaction) => {
      const config = await ctx.config.getComponentConfig<BattleConfig>('game.battles');
      
      if (config.enableRankedMode) {
        // Ranked battle logic
      }
    },
  },
}
```

### 10.3 Config Scoping

Config can be scoped at different levels:

```typescript
// Global config (all tenants)
await ctx.config.set('maxBattles', 100, { scope: 'global' });

// Tenant config (specific bot instance)
await ctx.config.set('maxBattles', 50, { scope: 'tenant', tenantId: 'prod' });

// Guild config (specific guild)
await ctx.config.set('maxBattles', 25, { scope: 'guild', guildId: '123' });

// Resolution: guild > tenant > global
const maxBattles = await ctx.config.get('maxBattles', ctx.scope);
```

---

## 11. Component Testing

### 11.1 Unit Testing

```typescript
import { createTestContext } from '@sensai/testing';

describe('game.battles', () => {
  it('should start battle', async () => {
    const ctx = createTestContext({
      component: battleComponent,
      scope: { tenantId: 'test', guildId: 'test-guild' },
    });
    
    const handler = battleComponent.handlers!.discord!['command:battle'];
    const interaction = mockInteraction({ userId: 'user1' });
    
    await handler(ctx, interaction);
    
    // Verify exports were appended
    expect(ctx.exports.appended).toContainEqual(
      expect.objectContaining({ type: 'battle.started' })
    );
  });
});
```

### 11.2 Integration Testing

```typescript
import { createTestKernel } from '@sensai/testing';

describe('battle flow', () => {
  it('should complete battle', async () => {
    const kernel = await createTestKernel({
      components: [coreComponent, battleComponent],
    });
    
    // Start battle
    await kernel.handleDiscord('command:battle', mockInteraction());
    
    // Submit moves
    await kernel.handleDiscord('button:attack', mockInteraction());
    
    // Process exports
    await kernel.processExports();
    
    // Verify battle completed
    const battle = await kernel.db.prisma.battle.findFirst();
    expect(battle?.status).toBe('completed');
  });
});
```

---

## 12. Component Best Practices

### 12.1 Do's

✅ **Declare all capabilities** — No implicit permissions
✅ **Own data explicitly** — Clear ownership prevents conflicts
✅ **Use idempotency keys** — Safe retries
✅ **Log with correlation IDs** — Traceable requests
✅ **Bound resource usage** — Prevent runaway consumption
✅ **Handle lifecycle hooks** — Clean startup/shutdown

### 12.2 Don'ts

❌ **Don't call other components directly** — Use exports/jobs/outbox
❌ **Don't write to tables you don't own** — Request via exports
❌ **Don't use unbounded data structures** — Always have limits
❌ **Don't use Math.random()** — Use ctx.rng for determinism
❌ **Don't write files** — Use ctx.storage
❌ **Don't hardcode admin checks** — Use ctx.rbac

---

## 13. Migration Path

### 13.1 From Direct Calls to Components

**Before:**
```typescript
// Old: Direct function call
import { grantReward } from '../economy/rewards';
await grantReward(trainerId, 100);
```

**After:**
```typescript
// New: Export-based communication
await ctx.exports.append({
  source: 'game.battles',
  type: 'player.reward.request',
  payload: { trainerId, amount: 100, reason: 'battle_win' },
  // ...
});
```

### 13.2 From Global State to Component Ownership

**Before:**
```typescript
// Old: Anyone can write to any table
await prisma.trainer.update({ ... });
await prisma.battle.create({ ... });
await prisma.item.delete({ ... });
```

**After:**
```typescript
// New: Only owner writes to owned tables
// game.core owns Trainer
// game.battles owns Battle
// game.economy owns Item

// Other components request changes via exports
```

---

## 14. Reference

### 14.1 Related Documents

- **Final Architecture:** `SENSAI-FINAL-ARCHITECTURE.md`
- **Architecture Addendum:** `SENSAI-ARCHITECTURE-ADDENDUM.md`
- **Multi-Tenant Addendum:** `SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md`
- **Quick Reference:** `SENSAI-QUICK-REFERENCE.md`

### 14.2 Type Definitions

See `src/sensai/types/` for complete TypeScript definitions:
- `component.ts` — SensaiComponent interface
- `handlers.ts` — Handler type signatures
- `context.ts` — ComponentContext interface
- `primitives.ts` — Kernel primitive interfaces

---

**Document Version:** 1.0.0  
**Created:** December 28, 2025  
**Purpose:** Component model specification for Sensai OS
