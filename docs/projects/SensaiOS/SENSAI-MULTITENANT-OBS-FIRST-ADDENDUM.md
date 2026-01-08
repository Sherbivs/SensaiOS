# Sensai OS — Multi-Tenant & Observability-First Addendum (v1.1.2)

**Version:** 1.1.2  
**Status:** ADDENDUM — Core Pattern Extensions  
**Authority:** Project Leadership (DRIPTVDD)  
**Created:** December 28, 2025

---

## 1. Purpose

This addendum introduces two critical patterns for Sensai OS v1.1.2:

1. **Multi-Tenant Scope** — Every operation carries tenant context
2. **Observability-First Boot** — Logging starts before database connection
3. **Guarded Execution** — All handlers wrapped for safety
4. **Typed Error Taxonomy** — Structured error handling

These patterns are **NON-NEGOTIABLE** for all new Sensai code.

---

## 2. Multi-Tenant Scope

### 2.1 The Problem

Without tenant context:
- Queries return data from ALL guilds
- Logs are impossible to filter by tenant
- Metrics blend multiple installations
- Security boundaries are unclear

### 2.2 The Solution: TenantScope

Every operation carries explicit tenant context:

```typescript
/** TenantScope — Enhanced v1.1.2 (Updated 2026-01-05) */
interface TenantScope {
  /**
   * Tenant identifier
   * - For Discord: guild ID (multi-tenant per guild)
   * - For System: "system" or service name
   * - For User: "user:{userId}" (homestead context)
   * 
   * Examples: "123456789012345678", "system", "user:563220840708177927"
   */
  tenant: string;

  /**
   * Deployment environment
   * Controls routing and filtering of logs.
   */
  environment: 'production' | 'staging' | 'development';

  /**
   * Service name
   * Which service is generating this data.
   * 
   * Examples: "infinity-gauntlet", "security-bot", "cache-worker"
   */
  service: string;

  /**
   * Component within the service
   * More specific than service — the subsystem.
   * 
   * Examples: "battle-engine", "homestead", "database"
   */
  component: string;

  /**
   * Optional: Instance identifier
   * For worker processes or multiple instances.
   * 
   * Examples: "worker-1", "srv-abc123"
   */
  instance?: string;

  /**
   * Optional: Region/zone
   * For geographically distributed deployments.
   * 
   * Examples: "us-east-1", "virginia"
   */
  region?: string;
}
```

### 2.3 Scope Extraction

Extract scope from Discord interactions using factory functions:

```typescript
import { scopeFromInteraction, scopeFromGuild, systemScope } from '../sensaios/tenant-scope.js';

// From Discord interaction (auto-extracts tenant, environment, service)
const scope = scopeFromInteraction(interaction);

// From guild ID with component name
const scope = scopeFromGuild(guildId, 'battle-engine');

// For system/CLI operations
const scope = systemScope('cli-tools');

// For user-scoped operations (homestead)
const scope = scopeFromUser(userId, 'homestead');
```

### 2.4 Scope in Envelopes

ALL envelopes MUST include scope:

```typescript
interface ExportEnvelope {
  id: string;
  source: string;
  type: string;
  payload: unknown;
  occurredAt: Date;
  correlationId: string;
  idempotencyKey?: string;
  
  // MANDATORY (v1.1.2)
  scope: TenantScope;
}

interface JobEnvelope {
  id: string;
  kind: string;
  payload: unknown;
  scheduledAt: Date;
  correlationId: string;
  
  // MANDATORY (v1.1.2)
  scope: TenantScope;
}

interface OutboxEnvelope {
  id: string;
  destination: string;
  topic: string;
  key: string;
  payload: unknown;
  correlationId: string;
  
  // MANDATORY (v1.1.2)
  scope: TenantScope;
}
```

### 2.5 Scope-Aware Queries

Always filter by scope in queries:

```typescript
// ❌ WRONG: No scope filtering
const trainers = await ctx.db.prisma.trainer.findMany({
  where: { level: { gte: 10 } },
});

// ✅ CORRECT: Scope-aware query
const trainers = await ctx.db.prisma.trainer.findMany({
  where: {
    guildId: ctx.scope.guildId,
    level: { gte: 10 },
  },
});

// ✅ ALSO CORRECT: Using helper
const trainers = await ctx.db.queryScoped(
  ctx.scope,
  (prisma) => prisma.trainer.findMany({
    where: { level: { gte: 10 } },
  })
);
```

### 2.6 Scope in Logs

Include scope in all log entries:

```typescript
ctx.obs.log.info('battle.start', 'Starting battle', {
  battleId,
  participants,
  // Scope is automatically included by ObsPrimitive
});

// Resulting log entry:
{
  "level": "info",
  "timestamp": "2025-12-28T12:00:00Z",
  "op": "battle.start",
  "msg": "Starting battle",
  "battleId": "battle-123",
  "participants": ["user1", "user2"],
  "scope": {
    "tenantId": "prod",
    "guildId": "123456789"
  },
  "correlationId": "corr-abc-123"
}
```

---

## 3. Observability-First Boot

### 3.1 The Problem

Traditional boot sequence:
1. Connect to database
2. Initialize services
3. Start logging

**Issue:** If database connection fails, we have no logs to diagnose.

### 3.2 The Solution: Boot Logger First

New boot sequence:
1. **Create boot logger** (no dependencies)
2. Load configuration
3. Connect to database
4. Initialize kernel
5. Initialize full observability hub

```typescript
async function bootSensai(): Promise<Kernel> {
  // 1. IMMEDIATE: Boot logger (no dependencies)
  const bootLog = createBootLogger();
  bootLog.info('boot', 'Starting Sensai kernel...', { version: '1.1.2' });
  
  try {
    // 2. EARLY: Load configuration
    const config = await loadConfig();
    bootLog.info('boot', 'Configuration loaded', {
      env: config.env,
      tenantId: config.tenantId,
    });
    
    // 3. DATABASE: Connect to PostgreSQL
    bootLog.info('boot', 'Connecting to database...');
    const db = await connectDatabase(config);
    bootLog.info('boot', 'Database connected', {
      host: config.dbHost,
      database: config.dbName,
    });
    
    // 4. KERNEL: Initialize kernel primitives
    bootLog.info('boot', 'Initializing kernel...');
    const kernel = await initKernel(db, config);
    bootLog.info('boot', 'Kernel initialized');
    
    // 5. COMPONENTS: Load and enable components
    bootLog.info('boot', 'Loading components...');
    await kernel.loadComponents();
    bootLog.info('boot', 'Components loaded', {
      count: kernel.componentCount,
      enabled: kernel.enabledComponentCount,
    });
    
    // 6. FULL: Switch to full observability hub
    bootLog.info('boot', 'Initializing observability hub...');
    const obs = await initObservabilityHub(kernel);
    obs.log.info('boot', 'Sensai kernel ready', {
      version: '1.1.2',
      bootTimeMs: Date.now() - bootStartTime,
    });
    
    return kernel;
    
  } catch (err) {
    bootLog.error('boot', 'Boot failed', {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
}
```

### 3.3 Boot Logger Implementation

```typescript
interface BootLogger {
  info(op: string, msg: string, data?: Record<string, unknown>): void;
  error(op: string, msg: string, data?: Record<string, unknown>): void;
}

function createBootLogger(): BootLogger {
  const startTime = Date.now();
  
  function formatEntry(
    level: string,
    op: string,
    msg: string,
    data?: Record<string, unknown>
  ): string {
    return JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - startTime,
      op,
      msg,
      ...data,
    });
  }
  
  return {
    info(op, msg, data) {
      console.log(formatEntry('info', op, msg, data));
    },
    error(op, msg, data) {
      console.error(formatEntry('error', op, msg, data));
    },
  };
}
```

### 3.4 Boot Phase Markers

Track boot phases for diagnostics:

```typescript
enum BootPhase {
  STARTING = 'starting',
  CONFIG_LOADED = 'config_loaded',
  DB_CONNECTED = 'db_connected',
  KERNEL_INITIALIZED = 'kernel_initialized',
  COMPONENTS_LOADED = 'components_loaded',
  OBS_INITIALIZED = 'obs_initialized',
  READY = 'ready',
  FAILED = 'failed',
}

// Expose boot phase for health checks
let currentBootPhase: BootPhase = BootPhase.STARTING;

// Health check endpoint
app.get('/health/boot', (req, res) => {
  res.json({
    phase: currentBootPhase,
    ready: currentBootPhase === BootPhase.READY,
  });
});
```

---

## 4. Guarded Execution

### 4.1 The Problem

Unguarded handlers:
- Don't log consistently
- Don't track metrics
- Don't handle errors uniformly
- Don't propagate correlation IDs

### 4.2 The Solution: runGuarded Wrapper

ALL handlers MUST be wrapped with `runGuarded()`:

```typescript
function runGuarded<T>(
  ctx: ComponentContext,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  const { correlationId } = ctx.obs;
  const { tenantId, guildId } = ctx.scope;
  
  // Log start
  ctx.obs.log.debug(operation, 'Starting', {
    correlationId,
    tenantId,
    guildId,
  });
  
  return fn()
    .then((result) => {
      const duration = Date.now() - startTime;
      
      // Log success
      ctx.obs.log.debug(operation, 'Completed', {
        correlationId,
        duration,
      });
      
      // Track metrics
      ctx.obs.metrics.timing(`${operation}.duration`, duration);
      ctx.obs.metrics.inc(`${operation}.success`);
      
      return result;
    })
    .catch((err) => {
      const duration = Date.now() - startTime;
      
      if (err instanceof SensaiError) {
        // Known error - warn level
        ctx.obs.log.warn(operation, 'Failed with known error', {
          correlationId,
          duration,
          code: err.code,
          message: err.message,
          context: err.context,
        });
        ctx.obs.metrics.inc(`${operation}.error.${err.code}`);
      } else {
        // Unknown error - error level
        ctx.obs.log.error(operation, 'Failed with unknown error', {
          correlationId,
          duration,
          error: err.message,
          stack: err.stack,
        });
        ctx.obs.metrics.inc(`${operation}.error.unknown`);
      }
      
      throw err;
    });
}
```

### 4.3 Automatic Handler Wrapping

The kernel automatically wraps registered handlers:

```typescript
class ComponentSupervisor {
  registerDiscordHandler(
    component: SensaiComponent,
    eventName: string,
    handler: DiscordHandler
  ): void {
    const wrappedHandler = async (interaction: Interaction) => {
      const scope = extractScope(interaction);
      const correlationId = generateCorrelationId();
      const ctx = this.createContext(component, scope, correlationId);
      
      return runGuarded(
        ctx,
        `discord.${eventName}`,
        () => handler(ctx, interaction)
      );
    };
    
    this.client.on(eventName, wrappedHandler);
  }
  
  registerExportHandler(
    component: SensaiComponent,
    exportType: string,
    handler: ExportHandler
  ): void {
    const wrappedHandler = async (envelope: ExportEnvelope) => {
      const ctx = this.createContext(
        component,
        envelope.scope,
        envelope.correlationId
      );
      
      return runGuarded(
        ctx,
        `export.${exportType}`,
        () => handler(ctx, envelope)
      );
    };
    
    this.exportRouter.register(exportType, wrappedHandler);
  }
}
```

---

## 5. Typed Error Taxonomy

### 5.1 The Problem

Untyped errors:
- Hard to handle programmatically
- Inconsistent error messages
- No structured context
- Can't build reliable retry logic

### 5.2 The Solution: SensaiError

All errors use the typed `SensaiError` class:

```typescript
class SensaiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SensaiError';
  }
  
  /**
   * Is this error retryable?
   */
  get isRetryable(): boolean {
    return RETRYABLE_CODES.includes(this.code);
  }
  
  /**
   * Is this a client error (user mistake)?
   */
  get isClientError(): boolean {
    return this.code >= 4000 && this.code < 5000;
  }
  
  /**
   * Is this a server error (our fault)?
   */
  get isServerError(): boolean {
    return this.code >= 5000;
  }
  
  /**
   * Convert to JSON for logging/transmission
   */
  toJSON(): ErrorEnvelope {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
      isRetryable: this.isRetryable,
    };
  }
}
```

### 5.3 Error Codes

Organized by category:

```typescript
type ErrorCode =
  // === Kernel errors (1xxx) ===
  | 'KERNEL_BOOT_FAILED'        // 1001 - Kernel failed to start
  | 'KERNEL_SHUTDOWN_TIMEOUT'   // 1002 - Shutdown timed out
  | 'PRIMITIVE_UNAVAILABLE'     // 1003 - Required primitive not available
  | 'KERNEL_UNKNOWN'            // 1999 - Unknown kernel error
  
  // === Component errors (2xxx) ===
  | 'COMPONENT_NOT_FOUND'       // 2001 - Component not installed
  | 'COMPONENT_LOAD_FAILED'     // 2002 - Failed to load component
  | 'COMPONENT_DEPENDENCY'      // 2003 - Dependency not satisfied
  | 'COMPONENT_DISABLED'        // 2004 - Component is disabled
  | 'CAPABILITY_VIOLATION'      // 2005 - Missing required capability
  
  // === Data errors (3xxx) ===
  | 'VALIDATION_FAILED'         // 3001 - Input validation failed
  | 'CONCURRENCY_CONFLICT'      // 3002 - Optimistic lock conflict
  | 'DATA_NOT_FOUND'            // 3003 - Entity not found
  | 'DATA_OWNERSHIP_VIOLATION'  // 3004 - Writing to unowned table
  | 'IDEMPOTENCY_VIOLATION'     // 3005 - Duplicate idempotency key
  
  // === Discord errors (4xxx) ===
  | 'DISCORD_API_ERROR'         // 4001 - Discord API returned error
  | 'DISCORD_RATE_LIMITED'      // 4002 - Rate limited by Discord
  | 'DISCORD_PERMISSION'        // 4003 - Missing Discord permission
  | 'DISCORD_NOT_FOUND'         // 4004 - Discord entity not found
  
  // === Business logic errors (5xxx) ===
  | 'BATTLE_INVALID_MOVE'       // 5001 - Invalid move selection
  | 'BATTLE_NOT_YOUR_TURN'      // 5002 - Not player's turn
  | 'BATTLE_ALREADY_ENDED'      // 5003 - Battle already ended
  | 'ENCOUNTER_EXPIRED'         // 5004 - Encounter timed out
  | 'ENCOUNTER_ALREADY_CAUGHT'  // 5005 - Pokemon already caught
  | 'INVENTORY_INSUFFICIENT'    // 5006 - Not enough items
  | 'TRAINER_NOT_FOUND'         // 5007 - Trainer doesn't exist
  | 'POKEMON_NOT_FOUND'         // 5008 - Pokemon doesn't exist
  
  // === External errors (6xxx) ===
  | 'EXTERNAL_API_ERROR'        // 6001 - External API call failed
  | 'EXTERNAL_TIMEOUT'          // 6002 - External call timed out
  | 'EXTERNAL_UNAVAILABLE';     // 6003 - External service unavailable

const RETRYABLE_CODES: ErrorCode[] = [
  'KERNEL_SHUTDOWN_TIMEOUT',
  'CONCURRENCY_CONFLICT',
  'DISCORD_RATE_LIMITED',
  'EXTERNAL_TIMEOUT',
  'EXTERNAL_UNAVAILABLE',
];
```

### 5.4 Error Handling Patterns

**Throwing Errors:**
```typescript
// Simple error
throw new SensaiError('DATA_NOT_FOUND', 'Trainer not found');

// With context
throw new SensaiError(
  'BATTLE_INVALID_MOVE',
  'Move not in Pokemon moveset',
  { moveId, pokemonId, availableMoves }
);

// Wrapping cause
try {
  await externalApi.call();
} catch (err) {
  throw new SensaiError(
    'EXTERNAL_API_ERROR',
    'Failed to fetch Pokemon data',
    { pokemonId },
    err
  );
}
```

**Catching Errors:**
```typescript
try {
  await performOperation();
} catch (err) {
  if (err instanceof SensaiError) {
    switch (err.code) {
      case 'CONCURRENCY_CONFLICT':
        // Retry after delay
        await sleep(100);
        return performOperation();
        
      case 'DATA_NOT_FOUND':
        // Return null instead of throwing
        return null;
        
      case 'DISCORD_RATE_LIMITED':
        // Wait and retry
        const retryAfter = err.context?.retryAfter ?? 5000;
        await sleep(retryAfter);
        return performOperation();
        
      default:
        // Re-throw unknown codes
        throw err;
    }
  }
  
  // Wrap unknown errors
  throw new SensaiError(
    'KERNEL_UNKNOWN',
    'Unexpected error',
    { originalMessage: err.message },
    err
  );
}
```

### 5.5 Error Response Formatting

Convert errors to user-friendly responses:

```typescript
function formatErrorResponse(err: SensaiError): InteractionReplyOptions {
  const userMessages: Record<ErrorCode, string> = {
    'BATTLE_NOT_YOUR_TURN': "It's not your turn! Please wait.",
    'BATTLE_INVALID_MOVE': "That move isn't available.",
    'INVENTORY_INSUFFICIENT': "You don't have enough items.",
    'ENCOUNTER_EXPIRED': "The wild Pokemon fled!",
    // ... etc
  };
  
  const message = userMessages[err.code] ?? "Something went wrong. Please try again.";
  
  return {
    content: `❌ ${message}`,
    ephemeral: true,
  };
}
```

---

## 6. Implementation Checklist

When implementing v1.1.2 patterns:

### Multi-Tenant
- [ ] Extract scope from all interactions
- [ ] Include scope in all envelopes (exports, jobs, outbox)
- [ ] Filter all queries by scope
- [ ] Include scope in all log entries

### Observability-First
- [ ] Boot logger starts before DB connection
- [ ] All boot phases logged
- [ ] Boot errors captured with context
- [ ] Full obs hub initializes last

### Guarded Execution
- [ ] All handlers wrapped with `runGuarded()`
- [ ] Correlation IDs propagated
- [ ] Metrics emitted for all operations
- [ ] Consistent logging format

### Error Taxonomy
- [ ] All errors use `SensaiError`
- [ ] Appropriate error codes selected
- [ ] Context attached to errors
- [ ] User-friendly error messages

---

## 7. Reference

### 7.1 Related Documents

- **Final Architecture:** `SENSAI-FINAL-ARCHITECTURE.md`
- **Component Blueprint:** `SENSAI-COMPONENT-OS-BLUEPRINT.md`
- **Architecture Addendum:** `SENSAI-ARCHITECTURE-ADDENDUM.md`
- **Quick Reference:** `SENSAI-QUICK-REFERENCE.md`

### 7.2 AI Agent Guidance

See `.github/instructions/sensai.instructions.md` for AI agent-specific guidance on implementing these patterns.

---

**Document Version:** 1.1.2  
**Created:** December 28, 2025  
**Purpose:** Multi-tenant scope and observability-first patterns for Sensai OS
