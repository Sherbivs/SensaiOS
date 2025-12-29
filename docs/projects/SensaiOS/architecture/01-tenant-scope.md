# 01 — Tenant Scope Design

**Component:** TenantScope  
**Status:** SPECIFICATION  
**Created:** 2025-12-28

---

## Overview

TenantScope is the **mandatory** context that must accompany every envelope, log entry, and error in the SensaiOS architecture. It provides multi-tenant isolation and enables proper routing, filtering, and aggregation of observability data.

---

## Design Principles

### 1. **Always Present**
Every operation must have a TenantScope. There is no "scope-less" state.

### 2. **Immutable During Request**
Once set at the start of a request, the scope cannot change mid-execution.

### 3. **Inheritable**
Child operations inherit parent scope unless explicitly overridden.

### 4. **Serializable**
Scope must serialize cleanly to JSON for logging and transmission.

---

## Type Definition

```typescript
/**
 * TenantScope — Mandatory context for all operations
 * 
 * Every log, error, and envelope MUST have a TenantScope.
 * This enables multi-tenant isolation and proper routing.
 */
export interface TenantScope {
  /**
   * Tenant identifier
   * 
   * For Discord: guild ID (multi-tenant per guild)
   * For System: "system" or service name
   * For User: user ID (homestead context)
   * 
   * @example "123456789012345678" // Guild ID
   * @example "system" // System operations
   * @example "user:563220840708177927" // User-scoped
   */
  tenant: string;

  /**
   * Deployment environment
   * 
   * Controls routing and filtering of logs.
   * Production logs go to Loki, development to console only.
   */
  environment: 'production' | 'staging' | 'development';

  /**
   * Service name
   * 
   * Which service is generating this data.
   * 
   * @example "infinity-gauntlet"
   * @example "security-bot"
   * @example "cache-worker"
   */
  service: string;

  /**
   * Component within the service
   * 
   * More specific than service — the subsystem.
   * 
   * @example "battle-engine"
   * @example "homestead"
   * @example "database"
   */
  component: string;

  /**
   * Optional: Instance identifier
   * 
   * For worker processes or multiple instances.
   * 
   * @example "worker-1"
   * @example "srv-abc123"
   */
  instance?: string;

  /**
   * Optional: Region/zone
   * 
   * For geographically distributed deployments.
   * 
   * @example "us-east-1"
   * @example "virginia"
   */
  region?: string;
}
```

---

## Scope Resolution

### Priority Order (Highest to Lowest)

1. **Explicit Scope** — Passed directly to function
2. **Context Scope** — From async local storage
3. **Request Scope** — From incoming request/interaction
4. **Default Scope** — Service-level defaults

### Resolution Logic

```typescript
function resolveScope(
  explicit?: Partial<TenantScope>,
  context?: TenantScope
): TenantScope {
  const defaults = getDefaultScope();
  
  return {
    tenant: explicit?.tenant ?? context?.tenant ?? defaults.tenant,
    environment: explicit?.environment ?? context?.environment ?? defaults.environment,
    service: explicit?.service ?? context?.service ?? defaults.service,
    component: explicit?.component ?? context?.component ?? defaults.component,
    instance: explicit?.instance ?? context?.instance ?? defaults.instance,
    region: explicit?.region ?? context?.region ?? defaults.region,
  };
}

function getDefaultScope(): TenantScope {
  return {
    tenant: 'system',
    environment: (process.env.NODE_ENV as TenantScope['environment']) || 'development',
    service: process.env.SERVICE_NAME || 'infinity-gauntlet',
    component: 'unknown',
    instance: process.env.RENDER_SERVICE_ID,
    region: process.env.RENDER_REGION,
  };
}
```

---

## Discord Context Mapping

### From Interaction

```typescript
function scopeFromInteraction(interaction: Interaction): TenantScope {
  return {
    tenant: interaction.guildId || `user:${interaction.user.id}`,
    environment: determineEnvironment(),
    service: 'infinity-gauntlet',
    component: 'discord-bot',
  };
}
```

### From Guild

```typescript
function scopeFromGuild(guildId: string, component: string): TenantScope {
  return {
    tenant: guildId,
    environment: determineEnvironment(),
    service: 'infinity-gauntlet',
    component,
  };
}
```

### System Operations

```typescript
function systemScope(component: string): TenantScope {
  return {
    tenant: 'system',
    environment: determineEnvironment(),
    service: 'infinity-gauntlet',
    component,
  };
}
```

---

## Validation

```typescript
/**
 * Validate a TenantScope
 * 
 * @throws {ValidationError} If scope is invalid
 */
function validateScope(scope: unknown): asserts scope is TenantScope {
  if (typeof scope !== 'object' || scope === null) {
    throw new ValidationError('Scope must be an object');
  }

  const s = scope as Record<string, unknown>;

  if (typeof s.tenant !== 'string' || s.tenant.length === 0) {
    throw new ValidationError('Scope.tenant is required');
  }

  if (!['production', 'staging', 'development'].includes(s.environment as string)) {
    throw new ValidationError('Scope.environment must be production|staging|development');
  }

  if (typeof s.service !== 'string' || s.service.length === 0) {
    throw new ValidationError('Scope.service is required');
  }

  if (typeof s.component !== 'string' || s.component.length === 0) {
    throw new ValidationError('Scope.component is required');
  }
}
```

---

## Serialization

```typescript
/**
 * Serialize scope for logging/transmission
 */
function serializeScope(scope: TenantScope): string {
  return JSON.stringify({
    tenant: scope.tenant,
    environment: scope.environment,
    service: scope.service,
    component: scope.component,
    instance: scope.instance,
    region: scope.region,
  });
}

/**
 * Create a compact scope string for log prefixes
 * 
 * @example "[prod:guild-123:battle-engine]"
 */
function scopePrefix(scope: TenantScope): string {
  const env = scope.environment === 'production' ? 'prod' : 
              scope.environment === 'development' ? 'dev' : 'stg';
  return `[${env}:${scope.tenant}:${scope.component}]`;
}
```

---

## Storage & Propagation

### Async Local Storage

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

const scopeStorage = new AsyncLocalStorage<TenantScope>();

/**
 * Run a function with a specific scope
 */
function withScope<T>(scope: TenantScope, fn: () => T): T {
  return scopeStorage.run(scope, fn);
}

/**
 * Get the current scope from context
 */
function getCurrentScope(): TenantScope | undefined {
  return scopeStorage.getStore();
}

/**
 * Get the current scope or throw
 */
function requireScope(): TenantScope {
  const scope = getCurrentScope();
  if (!scope) {
    throw new Error('No scope in context — did you forget withScope()?');
  }
  return scope;
}
```

---

## Usage Examples

### Discord Command Handler

```typescript
async function handleBattleCommand(interaction: ChatInputCommandInteraction) {
  const scope = scopeFromInteraction(interaction);
  
  await withScope(scope, async () => {
    // All operations within this block have the scope
    Kernel.log.info('battle.start', { scope });
    
    // Nested calls inherit scope
    await battleEngine.startBattle(trainerId, opponentId);
  });
}
```

### Worker Process

```typescript
async function processJob(job: Job) {
  const scope = systemScope('job-processor');
  
  await withScope(scope, async () => {
    Kernel.log.info('job.processing', { jobId: job.id, scope });
    await job.execute();
  });
}
```

### Database Operation

```typescript
async function fetchUser(userId: string) {
  const scope = requireScope(); // Get from context
  
  Kernel.log.debug('database.query', {
    scope,
    operation: 'findUnique',
    table: 'User',
  });
  
  return prisma.user.findUnique({ where: { id: userId } });
}
```

---

## Testing

```typescript
import { describe, it, expect } from 'vitest';

describe('TenantScope', () => {
  it('should require tenant', () => {
    expect(() => validateScope({ environment: 'production', service: 's', component: 'c' }))
      .toThrow('Scope.tenant is required');
  });

  it('should validate environment', () => {
    expect(() => validateScope({ tenant: 't', environment: 'invalid', service: 's', component: 'c' }))
      .toThrow('Scope.environment must be');
  });

  it('should serialize correctly', () => {
    const scope: TenantScope = {
      tenant: 'guild-123',
      environment: 'production',
      service: 'infinity-gauntlet',
      component: 'battle-engine',
    };
    const json = JSON.parse(serializeScope(scope));
    expect(json.tenant).toBe('guild-123');
  });

  it('should create compact prefix', () => {
    const scope: TenantScope = {
      tenant: 'guild-123',
      environment: 'production',
      service: 'infinity-gauntlet',
      component: 'battle-engine',
    };
    expect(scopePrefix(scope)).toBe('[prod:guild-123:battle-engine]');
  });
});
```

---

## Next Steps

→ Continue to [02-export-envelope.md](./02-export-envelope.md) for scoped envelope design.
