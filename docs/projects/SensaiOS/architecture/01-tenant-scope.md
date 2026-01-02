# 01 — Tenant Scope Design

**Component:** TenantScope  
**Status:** SPECIFICATION (v1.1.2)  
**Created:** 2025-12-28  
**Updated:** 2026-01-01

> **Canonical Source:** See [SENSAI-FINAL-ARCHITECTURE.md](../SENSAI-FINAL-ARCHITECTURE.md) § 2.7 for authoritative definition.

---

## Overview

TenantScope is the **mandatory** context that must accompany every envelope, log entry, and error in the SensaiOS architecture. It provides multi-tenant isolation and enables proper routing, filtering, and aggregation of observability data.

**v1.1.2 Simplification:** The original 6-field design was simplified to 2 fields for clarity and ease of use.

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

## Type Definition (v1.1.2 — CANONICAL)

```typescript
/**
 * TenantScope — Mandatory context for all operations (v1.1.2)
 * 
 * Every log, error, and envelope MUST have a TenantScope.
 * This enables multi-tenant isolation and proper routing.
 * 
 * @see SENSAI-FINAL-ARCHITECTURE.md § 2.7
 */
export interface TenantScope {
  /**
   * Tenant identifier — Bot instance or installation
   * 
   * For production: "prod"
   * For staging: "staging"  
   * For development: "dev"
   * 
   * @example "prod"
   * @example "staging"
   */
  tenantId: string;

  /**
   * Discord Guild identifier
   * 
   * The guild (server) where the operation originated.
   * Use "system" for non-guild operations.
   * 
   * @example "123456789012345678" // Guild ID
   * @example "system" // System operations
   */
  guildId: string;
}
```

### v1.0 Definition (SUPERSEDED)

<details>
<summary>Click to expand deprecated 6-field definition</summary>

The original v1.0 design had 6 fields for detailed tracing:

```typescript
// DEPRECATED — Use v1.1.2 definition above
interface TenantScopeV1 {
  tenant: string;           // Guild ID or "system"
  environment: 'production' | 'staging' | 'development';
  service: string;          // Service name
  component: string;        // Subsystem name
  instance?: string;        // Worker instance
  region?: string;          // Geographic region
}
```

**Why Simplified:** 
- Most fields were redundant with envelope metadata
- Environment/service/component tracked elsewhere in envelopes
- 2-field design is easier to pass through all call sites

</details>

---

## Scope Resolution

### Priority Order (Highest to Lowest)

1. **Explicit Scope** — Passed directly to function
2. **Context Scope** — From async local storage (runGuarded)
3. **Request Scope** — From incoming Discord interaction
4. **Default Scope** — Service-level defaults

### Resolution Logic (v1.1.2)

```typescript
function resolveScope(
  explicit?: Partial<TenantScope>,
  context?: TenantScope
): TenantScope {
  const defaults = getDefaultScope();
  
  return {
    tenantId: explicit?.tenantId ?? context?.tenantId ?? defaults.tenantId,
    guildId: explicit?.guildId ?? context?.guildId ?? defaults.guildId,
  };
}

function getDefaultScope(): TenantScope {
  return {
    tenantId: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    guildId: 'system',
  };
}
```

---

## Discord Context Mapping (v1.1.2)

### From Interaction

```typescript
function scopeFromInteraction(interaction: Interaction): TenantScope {
  return {
    tenantId: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    guildId: interaction.guildId ?? 'system',
  };
}
```

### From Guild

```typescript
function scopeFromGuild(guildId: string): TenantScope {
  return {
    tenantId: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    guildId,
  };
}
```

### System Operations

```typescript
function systemScope(): TenantScope {
  return {
    tenantId: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    guildId: 'system',
  };
}
```

---

## Validation (v1.1.2)

```typescript
/**
 * Validate a TenantScope (v1.1.2)
 * 
 * @throws {ValidationError} If scope is invalid
 */
function validateScope(scope: unknown): asserts scope is TenantScope {
  if (typeof scope !== 'object' || scope === null) {
    throw new ValidationError('Scope must be an object');
  }

  const s = scope as Record<string, unknown>;

  if (typeof s.tenantId !== 'string' || s.tenantId.length === 0) {
    throw new ValidationError('Scope.tenantId is required');
  }

  if (typeof s.guildId !== 'string' || s.guildId.length === 0) {
    throw new ValidationError('Scope.guildId is required');
  }
}
```

---

## Serialization (v1.1.2)

```typescript
/**
 * Serialize scope for logging/transmission
 */
function serializeScope(scope: TenantScope): string {
  return JSON.stringify({
    tenantId: scope.tenantId,
    guildId: scope.guildId,
  });
}

/**
 * Create a compact scope string for log prefixes
 * 
 * @example "[prod:123456789012345678]"
 */
function scopePrefix(scope: TenantScope): string {
  return `[${scope.tenantId}:${scope.guildId}]`;
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

## Usage Examples (v1.1.2)

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
  const scope = systemScope();
  
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

## Testing (v1.1.2)

```typescript
import { describe, it, expect } from 'vitest';

describe('TenantScope v1.1.2', () => {
  it('should require tenantId', () => {
    expect(() => validateScope({ guildId: 'guild-123' }))
      .toThrow('Scope.tenantId is required');
  });

  it('should require guildId', () => {
    expect(() => validateScope({ tenantId: 'prod' }))
      .toThrow('Scope.guildId is required');
  });

  it('should serialize correctly', () => {
    const scope: TenantScope = {
      tenantId: 'prod',
      guildId: '123456789012345678',
    };
    const json = JSON.parse(serializeScope(scope));
    expect(json.tenantId).toBe('prod');
    expect(json.guildId).toBe('123456789012345678');
  });

  it('should create compact prefix', () => {
    const scope: TenantScope = {
      tenantId: 'prod',
      guildId: '123456789012345678',
    };
    expect(scopePrefix(scope)).toBe('[prod:123456789012345678]');
  });
});
```

---

## Next Steps

→ Continue to [02-export-envelope.md](./02-export-envelope.md) for scoped envelope design.
