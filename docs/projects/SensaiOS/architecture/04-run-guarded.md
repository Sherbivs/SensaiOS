# 04 — runGuarded() Kernel Wrapper

**Component:** runGuarded  
**Status:** SPECIFICATION  
**Created:** 2025-12-28

---

## Overview

`runGuarded()` is the **kernel wrapper** that enforces observability for all handler invocations. It wraps any async function with automatic:

- **Correlation ID injection** — Every execution has a traceable ID
- **Tenant scope enforcement** — Scope propagates through context
- **Timing/metrics collection** — Duration tracked automatically
- **Error capture** — All errors converted to CanonicalError and routed
- **Logging** — Start/complete/error events logged consistently

---

## Design Principles

### 1. **Wrap Everything**
All Discord commands, workers, and async handlers should run through `runGuarded()`.

### 2. **Zero Escape**
Errors cannot escape without being captured and logged.

### 3. **Transparent**
The wrapper is invisible to the handler — it just works.

### 4. **Composable**
Nested calls maintain correlation through context.

---

## Type Definitions

```typescript
import type { TenantScope } from './tenant-scope.js';
import type { CanonicalError } from './error-detection.js';

/**
 * Context for a guarded execution
 */
export interface GuardedContext {
  /**
   * Human-readable name for this handler
   * Used in logs and error messages.
   * 
   * @example "battle.start"
   * @example "homestead.create"
   * @example "cache.refresh"
   */
  name: string;

  /**
   * Tenant scope (required)
   */
  scope: TenantScope;

  /**
   * Correlation ID (auto-generated if not provided)
   */
  correlationId?: string;

  /**
   * Parent correlation ID (for nested calls)
   */
  parentCorrelationId?: string;

  /**
   * Additional metadata to include in logs
   */
  metadata?: Record<string, unknown>;

  /**
   * Timeout in milliseconds (default: 30000)
   */
  timeoutMs?: number;

  /**
   * Should errors be rethrown? (default: true)
   */
  rethrow?: boolean;

  /**
   * Custom error handler (called before routing)
   */
  onError?: (error: CanonicalError) => void;
}

/**
 * Result of a guarded execution
 */
export interface GuardedResult<T> {
  /**
   * Was the execution successful?
   */
  success: boolean;

  /**
   * The result (if successful)
   */
  result?: T;

  /**
   * The error (if failed)
   */
  error?: CanonicalError;

  /**
   * Execution duration in milliseconds
   */
  durationMs: number;

  /**
   * Correlation ID used
   */
  correlationId: string;
}
```

---

## Implementation

### Core Function

```typescript
import { ulid } from 'ulid';
import { performance } from 'perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import { toCanonicalError, routeError } from './error-detection.js';
import { withScope, getCurrentScope } from './tenant-scope.js';

// Correlation ID storage
const correlationStorage = new AsyncLocalStorage<string>();

/**
 * Get the current correlation ID from context
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}

/**
 * Run a handler with full observability
 * 
 * @example
 * const result = await runGuarded(
 *   () => battleEngine.startBattle(trainerId, opponentId),
 *   { name: 'battle.start', scope }
 * );
 */
export async function runGuarded<T>(
  handler: () => Promise<T>,
  context: GuardedContext
): Promise<T> {
  const correlationId = context.correlationId ?? ulid();
  const startTime = performance.now();
  const timeoutMs = context.timeoutMs ?? 30000;
  
  // Log start
  Kernel.log.info(`${context.name}.start`, {
    scope: context.scope,
    correlationId,
    parentCorrelationId: context.parentCorrelationId,
    ...context.metadata,
  });
  
  try {
    // Run with scope and correlation in context
    const result = await withScope(context.scope, () =>
      correlationStorage.run(correlationId, async () => {
        // Apply timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
            timeoutMs
          );
        });
        
        return Promise.race([handler(), timeoutPromise]);
      })
    );
    
    const durationMs = performance.now() - startTime;
    
    // Log success
    Kernel.log.info(`${context.name}.complete`, {
      scope: context.scope,
      correlationId,
      durationMs,
    });
    
    // Record metrics
    Kernel.metrics.recordDuration(context.name, durationMs, {
      scope: context.scope,
      success: true,
    });
    
    return result;
  } catch (error) {
    const durationMs = performance.now() - startTime;
    
    // Convert to canonical error
    const canonical = toCanonicalError(error, context.scope, {
      correlationId,
      context: {
        handlerName: context.name,
        durationMs,
        ...context.metadata,
      },
    });
    
    // Custom error handler
    if (context.onError) {
      context.onError(canonical);
    }
    
    // Route error (log, track, alert)
    await routeError(canonical);
    
    // Log failure
    Kernel.log.error(`${context.name}.failed`, {
      scope: context.scope,
      correlationId,
      durationMs,
      errorId: canonical.id,
      errorCode: canonical.code,
    });
    
    // Record metrics
    Kernel.metrics.recordDuration(context.name, durationMs, {
      scope: context.scope,
      success: false,
      errorCategory: canonical.category,
    });
    
    // Rethrow if configured (default: true)
    if (context.rethrow !== false) {
      throw canonical;
    }
    
    // Return undefined if not rethrowing
    return undefined as T;
  }
}
```

### Safe Variant (No Throw)

```typescript
/**
 * Run a handler and return a result object instead of throwing
 * 
 * @example
 * const { success, result, error } = await runGuardedSafe(
 *   () => riskyOperation(),
 *   { name: 'risky.op', scope }
 * );
 * 
 * if (!success) {
 *   console.error('Failed:', error.message);
 * }
 */
export async function runGuardedSafe<T>(
  handler: () => Promise<T>,
  context: Omit<GuardedContext, 'rethrow'>
): Promise<GuardedResult<T>> {
  const correlationId = context.correlationId ?? ulid();
  const startTime = performance.now();
  
  try {
    const result = await runGuarded(handler, {
      ...context,
      correlationId,
      rethrow: false,
    });
    
    return {
      success: true,
      result,
      durationMs: performance.now() - startTime,
      correlationId,
    };
  } catch (error) {
    return {
      success: false,
      error: error as CanonicalError,
      durationMs: performance.now() - startTime,
      correlationId,
    };
  }
}
```

### Decorator Pattern

```typescript
/**
 * Decorator to wrap a method with runGuarded
 * 
 * @example
 * class BattleService {
 *   @guarded('battle.execute')
 *   async executeTurn(battleId: string): Promise<TurnResult> {
 *     // ...
 *   }
 * }
 */
export function guarded(name: string) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: unknown[]) {
      // Get scope from first argument if it's a scope, or from context
      const scope = isTenantScope(args[0]) 
        ? args[0] 
        : getCurrentScope() ?? systemScope('unknown');
      
      return runGuarded(
        () => originalMethod.apply(this, args),
        { name, scope }
      );
    };
    
    return descriptor;
  };
}
```

---

## Usage Patterns

### Discord Command Handler

```typescript
import { runGuarded } from './run-guarded.js';
import { scopeFromInteraction } from './tenant-scope.js';

async function handleBattleCommand(interaction: ChatInputCommandInteraction) {
  const scope = scopeFromInteraction(interaction);
  
  await runGuarded(
    async () => {
      await interaction.deferReply();
      
      const trainerId = interaction.user.id;
      const opponentId = interaction.options.getString('opponent', true);
      
      const battle = await battleEngine.startBattle(trainerId, opponentId);
      
      await interaction.editReply({
        embeds: [createBattleEmbed(battle)],
      });
    },
    {
      name: 'command.battle',
      scope,
      metadata: {
        commandName: 'battle',
        trainerId: interaction.user.id,
      },
    }
  );
}
```

### Worker Job

```typescript
import { runGuarded } from './run-guarded.js';
import { systemScope } from './tenant-scope.js';

async function processCacheRefresh(job: Job) {
  const scope = systemScope('cache-worker');
  
  await runGuarded(
    async () => {
      const refreshed = await cacheService.refresh();
      await job.updateProgress(100);
      return refreshed;
    },
    {
      name: 'job.cache-refresh',
      scope,
      timeoutMs: 60000, // 1 minute
      metadata: {
        jobId: job.id,
        jobType: job.type,
      },
    }
  );
}
```

### Nested Calls

```typescript
async function parentOperation(scope: TenantScope) {
  await runGuarded(
    async () => {
      // Get parent correlation ID
      const parentCorrelationId = getCorrelationId();
      
      // Child operation maintains trace
      await runGuarded(
        () => childOperation(),
        {
          name: 'child.operation',
          scope,
          parentCorrelationId, // Link to parent
        }
      );
    },
    { name: 'parent.operation', scope }
  );
}
```

### Safe Execution with Fallback

```typescript
async function riskyOperationWithFallback() {
  const scope = systemScope('risky-service');
  
  const { success, result, error } = await runGuardedSafe(
    () => externalApiCall(),
    { name: 'external.api-call', scope, timeoutMs: 5000 }
  );
  
  if (success) {
    return result;
  }
  
  // Log and return fallback
  Kernel.log.warn('external.api-fallback', {
    scope,
    errorCode: error?.code,
    fallback: 'using cached data',
  });
  
  return getCachedData();
}
```

---

## Integration with Kernel

### Kernel Logger Integration

```typescript
// The Kernel.log methods are automatically scoped
const Kernel = {
  log: {
    debug: (op: string, data?: Record<string, unknown>) => {
      const scope = getCurrentScope();
      const correlationId = getCorrelationId();
      // ... emit scoped log
    },
    info: (op: string, data?: Record<string, unknown>) => { /* ... */ },
    warn: (op: string, data?: Record<string, unknown>) => { /* ... */ },
    error: (op: string, data?: Record<string, unknown>) => { /* ... */ },
  },
  
  metrics: {
    recordDuration: (name: string, durationMs: number, tags?: Record<string, unknown>) => {
      // ... record metric
    },
  },
};
```

### Automatic Context Propagation

```typescript
// Any code running inside runGuarded can access context
async function innerFunction() {
  const scope = getCurrentScope(); // Returns the scope from runGuarded
  const correlationId = getCorrelationId(); // Returns the correlation ID
  
  Kernel.log.debug('inner.function', { scope, correlationId });
}
```

---

## Testing

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('runGuarded', () => {
  const testScope: TenantScope = {
    tenant: 'test-guild',
    environment: 'development',
    service: 'test-service',
    component: 'test-component',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute handler successfully', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    
    const result = await runGuarded(handler, {
      name: 'test.handler',
      scope: testScope,
    });
    
    expect(result).toBe('result');
    expect(handler).toHaveBeenCalled();
  });

  it('should capture errors as CanonicalError', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Test error'));
    
    await expect(
      runGuarded(handler, { name: 'test.handler', scope: testScope })
    ).rejects.toMatchObject({
      message: 'Test error',
      scope: testScope,
      category: expect.any(String),
    });
  });

  it('should inject correlation ID', async () => {
    let capturedCorrelationId: string | undefined;
    
    const handler = vi.fn().mockImplementation(async () => {
      capturedCorrelationId = getCorrelationId();
      return 'result';
    });
    
    await runGuarded(handler, { name: 'test.handler', scope: testScope });
    
    expect(capturedCorrelationId).toBeDefined();
    expect(capturedCorrelationId).toMatch(/^[0-9A-Z]{26}$/); // ULID format
  });

  it('should propagate scope through context', async () => {
    let capturedScope: TenantScope | undefined;
    
    const handler = vi.fn().mockImplementation(async () => {
      capturedScope = getCurrentScope();
      return 'result';
    });
    
    await runGuarded(handler, { name: 'test.handler', scope: testScope });
    
    expect(capturedScope).toEqual(testScope);
  });

  it('should timeout after specified duration', async () => {
    const slowHandler = vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    );
    
    await expect(
      runGuarded(slowHandler, {
        name: 'test.slow',
        scope: testScope,
        timeoutMs: 100,
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('Timeout'),
    });
  });

  it('should not throw when rethrow is false', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Test error'));
    
    const result = await runGuarded(handler, {
      name: 'test.handler',
      scope: testScope,
      rethrow: false,
    });
    
    expect(result).toBeUndefined();
  });

  it('should call onError handler', async () => {
    const onError = vi.fn();
    const handler = vi.fn().mockRejectedValue(new Error('Test error'));
    
    try {
      await runGuarded(handler, {
        name: 'test.handler',
        scope: testScope,
        onError,
      });
    } catch {
      // Expected
    }
    
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error' })
    );
  });
});

describe('runGuardedSafe', () => {
  const testScope: TenantScope = {
    tenant: 'test-guild',
    environment: 'development',
    service: 'test-service',
    component: 'test-component',
  };

  it('should return success result', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    
    const guardedResult = await runGuardedSafe(handler, {
      name: 'test.handler',
      scope: testScope,
    });
    
    expect(guardedResult.success).toBe(true);
    expect(guardedResult.result).toBe('result');
    expect(guardedResult.error).toBeUndefined();
  });

  it('should return failure result', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Test error'));
    
    const guardedResult = await runGuardedSafe(handler, {
      name: 'test.handler',
      scope: testScope,
    });
    
    expect(guardedResult.success).toBe(false);
    expect(guardedResult.result).toBeUndefined();
    expect(guardedResult.error).toBeDefined();
    expect(guardedResult.error?.message).toBe('Test error');
  });
});
```

---

## Migration Guide

### Before (Raw Handler)

```typescript
async function handleCommand(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply();
    const result = await doSomething();
    await interaction.editReply({ content: result });
  } catch (error) {
    console.error('Command failed:', error);
    await interaction.editReply({ content: 'Error!' });
  }
}
```

### After (Guarded Handler)

```typescript
async function handleCommand(interaction: ChatInputCommandInteraction) {
  const scope = scopeFromInteraction(interaction);
  
  await runGuarded(
    async () => {
      await interaction.deferReply();
      const result = await doSomething();
      await interaction.editReply({ content: result });
    },
    {
      name: 'command.my-command',
      scope,
      metadata: { userId: interaction.user.id },
    }
  ).catch(async (error) => {
    // CanonicalError with full context
    await interaction.editReply({ 
      content: `Error: ${error.code}. ${error.recovery?.[0]?.action ?? 'Please try again.'}` 
    });
  });
}
```

---

## Next Steps

→ Continue to [FINAL-ARCHITECTURE.md](./FINAL-ARCHITECTURE.md) for the complete architecture document.
