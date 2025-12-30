/**
 * Tests for SensaiOS runGuarded() — Kernel Wrapper
 *
 * @module tests/sensaios/run-guarded
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantScope } from '../../src/sensaios/tenant-scope.js';
import {
  runGuarded,
  runGuardedSafe,
  getCorrelationId,
  requireCorrelationId,
  createGuardedHandler,
  wrapWithGuard,
  runGuardedParallel,
  runGuardedSequence,
  type RunGuardedContext,
} from '../../src/sensaios/run-guarded.js';
import { isCanonicalError } from '../../src/sensaios/canonical-error.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const testScope: TenantScope = {
  tenant: 'test-guild-123',
  environment: 'development',
  service: 'test-service',
  component: 'test-component',
};

const makeContext = (overrides?: Partial<RunGuardedContext>): RunGuardedContext => ({
  name: 'test.handler',
  scope: testScope,
  ...overrides,
});

// ============================================================================
// runGuarded() Tests
// ============================================================================

describe('runGuarded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful execution', () => {
    it('should execute handler and return result', async () => {
      const handler = vi.fn().mockResolvedValue('success');

      const result = await runGuarded(handler, makeContext());

      expect(result).toBe('success');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should pass through complex return values', async () => {
      const returnValue = { battle: { id: '123', status: 'active' }, turns: [1, 2, 3] };
      const handler = vi.fn().mockResolvedValue(returnValue);

      const result = await runGuarded(handler, makeContext());

      expect(result).toEqual(returnValue);
    });

    it('should handle synchronous return values', async () => {
      // Handler that returns immediately (no await needed internally)
      const handler = vi.fn().mockResolvedValue(42);

      const result = await runGuarded(handler, makeContext());

      expect(result).toBe(42);
    });
  });

  describe('correlation ID', () => {
    it('should inject correlation ID into context', async () => {
      let capturedCorrelationId: string | undefined;

      const handler = vi.fn().mockImplementation(async () => {
        capturedCorrelationId = getCorrelationId();
        return 'done';
      });

      await runGuarded(handler, makeContext());

      expect(capturedCorrelationId).toBeDefined();
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(capturedCorrelationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should use provided correlation ID', async () => {
      const providedId = '01HQXYZ123456789ABCDEFGH';
      let capturedCorrelationId: string | undefined;

      const handler = vi.fn().mockImplementation(async () => {
        capturedCorrelationId = getCorrelationId();
        return 'done';
      });

      await runGuarded(handler, makeContext({ correlationId: providedId }));

      expect(capturedCorrelationId).toBe(providedId);
    });

    it('should clear correlation ID after execution', async () => {
      const handler = vi.fn().mockResolvedValue('done');

      await runGuarded(handler, makeContext());

      // Outside runGuarded, correlation should be undefined
      expect(getCorrelationId()).toBeUndefined();
    });
  });

  describe('scope propagation', () => {
    it('should propagate scope through context', async () => {
      const { getCurrentScope } = await import('../../src/sensaios/tenant-scope.js');
      let capturedScope: TenantScope | undefined;

      const handler = vi.fn().mockImplementation(async () => {
        capturedScope = getCurrentScope();
        return 'done';
      });

      await runGuarded(handler, makeContext());

      expect(capturedScope).toEqual(testScope);
    });
  });

  describe('error handling', () => {
    it('should convert errors to CanonicalError', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Test error'));

      try {
        await runGuarded(handler, makeContext());
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isCanonicalError(error)).toBe(true);
        if (isCanonicalError(error)) {
          expect(error.message).toBe('Test error');
          expect(error.scope).toEqual(testScope);
          expect(error.category).toBeDefined();
          expect(error.severity).toBeDefined();
          expect(error.fingerprint).toBeDefined();
        }
      }
    });

    it('should preserve existing CanonicalError', async () => {
      const { toCanonicalError } = await import('../../src/sensaios/canonical-error.js');
      const originalError = toCanonicalError(new Error('Original'), testScope);
      const handler = vi.fn().mockRejectedValue(originalError);

      try {
        await runGuarded(handler, makeContext());
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isCanonicalError(error)).toBe(true);
        if (isCanonicalError(error)) {
          expect(error.id).toBe(originalError.id);
        }
      }
    });

    it('should call onError handler before throwing', async () => {
      const onError = vi.fn();
      const handler = vi.fn().mockRejectedValue(new Error('Test error'));

      try {
        await runGuarded(handler, makeContext({ onError }));
      } catch {
        // Expected
      }

      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Test error' })
      );
    });

    it('should handle async onError handler', async () => {
      const onError = vi.fn().mockResolvedValue(undefined);
      const handler = vi.fn().mockRejectedValue(new Error('Test error'));

      try {
        await runGuarded(handler, makeContext({ onError }));
      } catch {
        // Expected
      }

      expect(onError).toHaveBeenCalledOnce();
    });

    it('should not throw when rethrow is false', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Test error'));

      const result = await runGuarded(handler, makeContext({ rethrow: false }));

      expect(result).toBeUndefined();
    });
  });

  describe('timeout', () => {
    it('should timeout after specified duration', async () => {
      const slowHandler = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      try {
        await runGuarded(slowHandler, makeContext({ timeoutMs: 50 }));
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isCanonicalError(error)).toBe(true);
        if (isCanonicalError(error)) {
          expect(error.message).toContain('timed out');
          expect(error.message).toContain('50ms');
        }
      }
    });

    it('should use default timeout of 30 seconds', async () => {
      // We won't actually wait 30 seconds - just verify the handler completes
      // within a reasonable time
      const fastHandler = vi.fn().mockResolvedValue('fast');

      const result = await runGuarded(fastHandler, makeContext());

      expect(result).toBe('fast');
    });
  });

  describe('metadata', () => {
    it('should pass metadata to error context', async () => {
      const metadata = { userId: '123', action: 'battle.start' };
      const handler = vi.fn().mockRejectedValue(new Error('Test error'));

      try {
        await runGuarded(handler, makeContext({ metadata }));
      } catch (error) {
        if (isCanonicalError(error)) {
          expect(error.context).toMatchObject({
            handlerName: 'test.handler',
            userId: '123',
            action: 'battle.start',
          });
        }
      }
    });
  });
});

// ============================================================================
// requireCorrelationId() Tests
// ============================================================================

describe('requireCorrelationId', () => {
  it('should throw when called outside runGuarded', () => {
    expect(() => requireCorrelationId()).toThrow(
      'requireCorrelationId() called outside runGuarded context'
    );
  });

  it('should return correlation ID when inside runGuarded', async () => {
    let capturedId: string | undefined;

    await runGuarded(
      async () => {
        capturedId = requireCorrelationId();
        return 'done';
      },
      makeContext()
    );

    expect(capturedId).toBeDefined();
    // UUID format
    expect(capturedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});

// ============================================================================
// runGuardedSafe() Tests
// ============================================================================

describe('runGuardedSafe', () => {
  it('should return success result on success', async () => {
    const handler = vi.fn().mockResolvedValue('result');

    const guardedResult = await runGuardedSafe(handler, makeContext());

    expect(guardedResult.success).toBe(true);
    expect(guardedResult.result).toBe('result');
    expect(guardedResult.error).toBeUndefined();
    expect(guardedResult.correlationId).toBeDefined();
    expect(guardedResult.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should return failure result on error', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Test error'));

    const guardedResult = await runGuardedSafe(handler, makeContext());

    expect(guardedResult.success).toBe(false);
    expect(guardedResult.result).toBeUndefined();
    expect(guardedResult.error).toBeDefined();
    expect(guardedResult.correlationId).toBeDefined();
    expect(guardedResult.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should include CanonicalError in failure result', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Test error'));

    const guardedResult = await runGuardedSafe(handler, makeContext());

    expect(guardedResult.success).toBe(false);
    expect(isCanonicalError(guardedResult.error)).toBe(true);
  });
});

// ============================================================================
// createGuardedHandler() Tests
// ============================================================================

describe('createGuardedHandler', () => {
  it('should create a guarded function', async () => {
    const originalHandler = vi.fn().mockResolvedValue('handled');

    const guardedHandler = createGuardedHandler(
      'test.create',
      (_scope: TenantScope) => _scope,
      async (_scope: TenantScope) => {
        return originalHandler();
      }
    );

    const result = await guardedHandler(testScope);

    expect(result).toBe('handled');
    expect(originalHandler).toHaveBeenCalledOnce();
  });

  it('should resolve scope from arguments', async () => {
    let capturedScope: TenantScope | undefined;

    const guardedHandler = createGuardedHandler(
      'test.scope',
      (_id: string, _scope: TenantScope) => _scope,
      async (_id: string, _scope: TenantScope) => {
        const { getCurrentScope } = await import('../../src/sensaios/tenant-scope.js');
        capturedScope = getCurrentScope();
        return 'done';
      }
    );

    await guardedHandler('123', testScope);

    expect(capturedScope).toEqual(testScope);
  });
});

// ============================================================================
// wrapWithGuard() Tests
// ============================================================================

describe('wrapWithGuard', () => {
  it('should wrap existing handler', async () => {
    const originalHandler = vi.fn().mockResolvedValue('wrapped');

    const wrappedHandler = wrapWithGuard(
      'test.wrap',
      originalHandler,
      testScope
    );

    const result = await wrappedHandler('arg1', 'arg2');

    expect(result).toBe('wrapped');
    expect(originalHandler).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should use default scope when none in context', async () => {
    let capturedScope: TenantScope | undefined;
    const { getCurrentScope } = await import('../../src/sensaios/tenant-scope.js');

    const originalHandler = vi.fn().mockImplementation(async () => {
      capturedScope = getCurrentScope();
      return 'done';
    });

    const wrappedHandler = wrapWithGuard(
      'test.wrap',
      originalHandler,
      testScope
    );

    await wrappedHandler();

    expect(capturedScope).toEqual(testScope);
  });
});

// ============================================================================
// runGuardedParallel() Tests
// ============================================================================

describe('runGuardedParallel', () => {
  it('should execute all handlers in parallel', async () => {
    const handler1 = vi.fn().mockResolvedValue('result1');
    const handler2 = vi.fn().mockResolvedValue('result2');
    const handler3 = vi.fn().mockResolvedValue('result3');

    const results = await runGuardedParallel([
      { handler: handler1, context: makeContext({ name: 'handler1' }) },
      { handler: handler2, context: makeContext({ name: 'handler2' }) },
      { handler: handler3, context: makeContext({ name: 'handler3' }) },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].success).toBe(true);
    expect(results[0].result).toBe('result1');
    expect(results[1].success).toBe(true);
    expect(results[1].result).toBe('result2');
    expect(results[2].success).toBe(true);
    expect(results[2].result).toBe('result3');
  });

  it('should handle individual failures without affecting others', async () => {
    const handler1 = vi.fn().mockResolvedValue('result1');
    const handler2 = vi.fn().mockRejectedValue(new Error('Failed'));
    const handler3 = vi.fn().mockResolvedValue('result3');

    const results = await runGuardedParallel([
      { handler: handler1, context: makeContext({ name: 'handler1' }) },
      { handler: handler2, context: makeContext({ name: 'handler2' }) },
      { handler: handler3, context: makeContext({ name: 'handler3' }) },
    ]);

    expect(results[0].success).toBe(true);
    expect(results[0].result).toBe('result1');
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBeDefined();
    expect(results[2].success).toBe(true);
    expect(results[2].result).toBe('result3');
  });
});

// ============================================================================
// runGuardedSequence() Tests
// ============================================================================

describe('runGuardedSequence', () => {
  it('should execute handlers sequentially', async () => {
    const order: number[] = [];
    const handler1 = vi.fn().mockImplementation(async () => {
      order.push(1);
      return 'result1';
    });
    const handler2 = vi.fn().mockImplementation(async () => {
      order.push(2);
      return 'result2';
    });
    const handler3 = vi.fn().mockImplementation(async () => {
      order.push(3);
      return 'result3';
    });

    const result = await runGuardedSequence([
      { handler: handler1, context: makeContext({ name: 'handler1' }) },
      { handler: handler2, context: makeContext({ name: 'handler2' }) },
      { handler: handler3, context: makeContext({ name: 'handler3' }) },
    ]);

    expect(order).toEqual([1, 2, 3]);
    expect(result.success).toBe(true);
    expect(result.result).toBe('result3');
  });

  it('should stop at first failure', async () => {
    const handler1 = vi.fn().mockResolvedValue('result1');
    const handler2 = vi.fn().mockRejectedValue(new Error('Failed'));
    const handler3 = vi.fn().mockResolvedValue('result3');

    const result = await runGuardedSequence([
      { handler: handler1, context: makeContext({ name: 'handler1' }) },
      { handler: handler2, context: makeContext({ name: 'handler2' }) },
      { handler: handler3, context: makeContext({ name: 'handler3' }) },
    ]);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler3).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it('should handle empty array', async () => {
    const result = await runGuardedSequence([]);

    expect(result.success).toBe(true);
    expect(result.result).toBeUndefined();
  });
});
