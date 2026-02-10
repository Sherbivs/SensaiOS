/**
 * Tests for SensaiOS Context Factory — ComponentContext Creation
 *
 * Per v1.1.2: Every component receives ComponentContext with all 9 primitives.
 *
 * Tests cover:
 * - createComponentContext
 * - Specialized context helpers (interaction, guild, worker, system, CLI, test)
 * - Individual primitive stub implementations
 * - RNG determinism
 * - Primitive override mechanism
 *
 * @module tests/sensaios/context-factory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Interaction, Guild } from 'discord.js';
import type { TenantScope } from '../../src/sensaios/tenant-scope.js';
import {
  createComponentContext,
  createTestContext,
  contextFromInteraction,
  contextFromGuild,
  contextFromWorker,
  systemContext,
  contextFromCli,
  createDbPrimitive,
  createExportsPrimitiveStub,
  createJobsPrimitiveStub,
  createOutboxPrimitiveStub,
  createConfigPrimitiveStub,
  createRbacPrimitiveStub,
  createStoragePrimitiveStub,
  createObsPrimitive,
  createRngPrimitive,
} from '../../src/sensaios/context-factory.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const testScope: TenantScope = {
  tenant: 'test-guild-123',
  environment: 'development',
  service: 'test-service',
  component: 'test-component',
};

function createMockPrisma(): PrismaClient {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn().mockImplementation(async (fn) => fn({})),
    componentCapability: {
      findFirst: vi.fn().mockResolvedValue({
        createdAt: new Date(),
        scope: null,
        revokedAt: null,
        expiresAt: null,
        grantedBy: null,
      }),
    },
  } as unknown as PrismaClient;
}

function createMockInteraction(overrides?: Record<string, unknown>): Interaction {
  return {
    id: 'interaction-123',
    guildId: 'guild-456',
    user: { id: 'user-789', username: 'testuser' },
    type: 2,
    isCommand: () => true,
    isChatInputCommand: () => true,
    ...overrides,
  } as unknown as Interaction;
}

function createMockGuild(overrides?: Record<string, unknown>): Guild {
  return {
    id: 'guild-789',
    name: 'Test Guild',
    ...overrides,
  } as unknown as Guild;
}

// ============================================================================
// createComponentContext TESTS
// ============================================================================

describe('createComponentContext', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic context creation', () => {
    it('should create context with all 9 primitives', () => {
      const ctx = createComponentContext({
        component: 'test.component',
        scope: testScope,
      });

      // Verify all 9 primitives exist
      expect(ctx.db).toBeDefined();
      expect(ctx.exports).toBeDefined();
      expect(ctx.jobs).toBeDefined();
      expect(ctx.outbox).toBeDefined();
      expect(ctx.config).toBeDefined();
      expect(ctx.rbac).toBeDefined();
      expect(ctx.obs).toBeDefined();
      expect(ctx.rng).toBeDefined();
      expect(ctx.storage).toBeDefined();
    });

    it('should set component name', () => {
      const ctx = createComponentContext({
        component: 'game.battles',
        scope: testScope,
      });

      expect(ctx.component).toBe('game.battles');
    });

    it('should set scope', () => {
      const ctx = createComponentContext({
        component: 'test',
        scope: testScope,
      });

      expect(ctx.scope).toEqual(testScope);
      expect(ctx.scope.tenant).toBe('test-guild-123');
    });

    it('should auto-generate correlation ID', () => {
      const ctx = createComponentContext({
        component: 'test',
        scope: testScope,
      });

      expect(ctx.obs.correlationId).toBeDefined();
      expect(ctx.obs.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should use provided correlation ID', () => {
      const customCorrelationId = 'custom-corr-123';
      const ctx = createComponentContext({
        component: 'test',
        scope: testScope,
        correlationId: customCorrelationId,
      });

      expect(ctx.obs.correlationId).toBe(customCorrelationId);
    });
  });

  describe('prisma integration', () => {
    it('should use real db primitive when prisma provided', () => {
      const prisma = createMockPrisma();
      const ctx = createComponentContext({
        component: 'test',
        scope: testScope,
        prisma,
      });

      expect(ctx.db.prisma).toBe(prisma);
    });

    it('should use stub db when no prisma provided', () => {
      const ctx = createComponentContext({
        component: 'test',
        scope: testScope,
      });

      // Stub should throw when accessing prisma
      expect(() => ctx.db.prisma).toThrow('Database not available');
    });
  });

  describe('primitive overrides', () => {
    it('should allow overriding individual primitives', () => {
      const customExports = {
        append: vi.fn().mockResolvedValue({ seq: 1, duplicate: false }),
        query: vi.fn().mockResolvedValue([]),
        getOffset: vi.fn().mockResolvedValue(0),
        setOffset: vi.fn().mockResolvedValue(undefined),
        consumeFrom: vi.fn().mockResolvedValue([]),
      };

      const ctx = createComponentContext({
        component: 'test',
        scope: testScope,
        overrides: {
          exports: customExports,
        },
      });

      expect(ctx.exports).toBe(customExports);
    });

    it('should allow overriding multiple primitives', () => {
      const customConfig = {
        get: vi.fn().mockResolvedValue('value'),
        set: vi.fn().mockResolvedValue(undefined),
        getComponentConfig: vi.fn().mockResolvedValue({}),
        getFeatureFlag: vi.fn().mockResolvedValue(true),
      };

      const customRbac = {
        assert: vi.fn().mockResolvedValue(undefined),
        check: vi.fn().mockResolvedValue(true),
        audit: vi.fn().mockResolvedValue(undefined),
      };

      const ctx = createComponentContext({
        component: 'test',
        scope: testScope,
        overrides: {
          config: customConfig,
          rbac: customRbac,
        },
      });

      expect(ctx.config).toBe(customConfig);
      expect(ctx.rbac).toBe(customRbac);
    });
  });
});

// ============================================================================
// SPECIALIZED CONTEXT HELPERS TESTS
// ============================================================================

describe('Specialized Context Helpers', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('contextFromInteraction', () => {
    it('should create context with guild tenant from interaction', () => {
      const interaction = createMockInteraction({ guildId: 'guild-abc' });
      const ctx = contextFromInteraction(interaction, 'game.homestead');

      expect(ctx.scope.tenant).toBe('guild-abc');
      expect(ctx.component).toBe('game.homestead');
    });

    it('should use user ID as tenant when no guild', () => {
      const interaction = createMockInteraction({ guildId: null, user: { id: 'user-xyz' } });
      const ctx = contextFromInteraction(interaction, 'dm.handler');

      expect(ctx.scope.tenant).toBe('user:user-xyz');
    });

    it('should pass prisma to context', () => {
      const prisma = createMockPrisma();
      const interaction = createMockInteraction();
      const ctx = contextFromInteraction(interaction, 'test', prisma);

      expect(ctx.db.prisma).toBe(prisma);
    });
  });

  describe('contextFromGuild', () => {
    it('should create context with guild ID as tenant', () => {
      const guild = createMockGuild({ id: 'guild-def' });
      const ctx = contextFromGuild(guild, 'security.guard');

      expect(ctx.scope.tenant).toBe('guild-def');
      expect(ctx.component).toBe('security.guard');
    });
  });

  describe('contextFromWorker', () => {
    it('should create context for worker with tenant', () => {
      const ctx = contextFromWorker('cache-worker', 'guild-123');

      expect(ctx.scope.tenant).toBe('guild-123');
      expect(ctx.component).toBe('cache-worker');
    });

    it('should support system tenant for global workers', () => {
      const ctx = contextFromWorker('scheduler', 'system');

      expect(ctx.scope.tenant).toBe('system');
    });

    it('should allow custom correlation ID', () => {
      const ctx = contextFromWorker('worker', 'tenant', undefined, 'custom-job-corr');

      expect(ctx.obs.correlationId).toBe('custom-job-corr');
    });
  });

  describe('systemContext', () => {
    it('should create system-tenant context', () => {
      const ctx = systemContext('startup');

      expect(ctx.scope.tenant).toBe('system');
      expect(ctx.component).toBe('startup');
    });
  });

  describe('contextFromCli', () => {
    it('should create CLI context with system tenant', () => {
      const ctx = contextFromCli('db:migrate');

      expect(ctx.scope.tenant).toBe('system');
      expect(ctx.scope.service).toBe('infinity-gauntlet-cli');
      expect(ctx.component).toBe('db:migrate');
    });
  });

  describe('createTestContext', () => {
    it('should create context with test defaults', () => {
      const ctx = createTestContext();

      expect(ctx.scope.tenant).toBe('test-guild-123');
      expect(ctx.scope.environment).toBe('development');
      expect(ctx.component).toBe('test');
    });

    it('should allow custom component name', () => {
      const ctx = createTestContext('game.battles');

      expect(ctx.component).toBe('game.battles');
    });

    it('should allow scope overrides', () => {
      const ctx = createTestContext('test', {
        tenant: 'custom-tenant',
        environment: 'staging',
      });

      expect(ctx.scope.tenant).toBe('custom-tenant');
      expect(ctx.scope.environment).toBe('staging');
    });
  });
});

// ============================================================================
// PRIMITIVE STUB TESTS
// ============================================================================

describe('Primitive Stub Implementations', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createDbPrimitive', () => {
    it('should expose prisma client', () => {
      const prisma = createMockPrisma();
      const db = createDbPrimitive(prisma, 'test-component', testScope);

      expect(db.prisma).toBe(prisma);
    });

    it('should support transactions', async () => {
      const prisma = createMockPrisma();
      const db = createDbPrimitive(prisma, 'test-component', testScope);

      await db.transaction(async (_tx) => {
        return 'transaction-result';
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should support raw queries', async () => {
      const prisma = createMockPrisma();
      const db = createDbPrimitive(prisma, 'test-component', testScope);

      await db.query('SELECT * FROM users WHERE id = $1', [123]);

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', 123);
    });
  });

  describe('createExportsPrimitiveStub', () => {
    it('should return sequential seq numbers', async () => {
      const exports = createExportsPrimitiveStub(testScope, 'corr-1');

      const r1 = await exports.append({
        source: 'test',
        type: 'test.event',
        scope: testScope,
        idempotencyKey: 'key-1',
        payload: {},
        occurredAt: new Date(),
        correlationId: 'corr-1',
      });

      const r2 = await exports.append({
        source: 'test',
        type: 'test.event',
        scope: testScope,
        idempotencyKey: 'key-2',
        payload: {},
        occurredAt: new Date(),
        correlationId: 'corr-1',
      });

      expect(r1.seq).toBe(1);
      expect(r2.seq).toBe(2);
      expect(r1.duplicate).toBe(false);
    });

    it('should track projection offsets', async () => {
      const exports = createExportsPrimitiveStub(testScope, 'corr-1');

      await exports.setOffset('my-projection', 50);
      const offset = await exports.getOffset('my-projection');

      expect(offset).toBe(50);
    });

    it('should return 0 for unknown projection offset', async () => {
      const exports = createExportsPrimitiveStub(testScope, 'corr-1');

      const offset = await exports.getOffset('unknown');

      expect(offset).toBe(0);
    });
  });

  describe('createJobsPrimitiveStub', () => {
    it('should return job ID on enqueue', async () => {
      const jobs = createJobsPrimitiveStub(testScope, 'corr-1');

      const jobId = await jobs.enqueue({
        kind: 'test.job',
        scope: testScope,
        payload: { data: 123 },
        correlationId: 'corr-1',
      });

      expect(jobId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should return empty array on lease', async () => {
      const jobs = createJobsPrimitiveStub(testScope, 'corr-1');

      const leased = await jobs.lease(['test.job'], 5);

      expect(leased).toEqual([]);
    });

    it('should complete without error', async () => {
      const jobs = createJobsPrimitiveStub(testScope, 'corr-1');

      await expect(
        jobs.complete('job-123', { durationMs: 100 })
      ).resolves.toBeUndefined();
    });

    it('should fail without error', async () => {
      const jobs = createJobsPrimitiveStub(testScope, 'corr-1');
      const error = {
        id: 'err-123',
        name: 'TestError',
        message: 'Failed',
        timestamp: new Date().toISOString(),
        category: 'worker' as const,
        severity: 'high' as const,
        code: 'INTERNAL_ERROR',
        fingerprint: 'fp-123',
        scope: testScope,
        isCanonical: true as const,
      };

      await expect(
        jobs.fail('job-123', error, new Date())
      ).resolves.toBeUndefined();
    });
  });

  describe('createOutboxPrimitiveStub', () => {
    it('should return message ID on send', async () => {
      const outbox = createOutboxPrimitiveStub(testScope, 'corr-1');

      const messageId = await outbox.send({
        destination: 'discord',
        topic: 'battle.result',
        key: 'battle-123',
        scope: testScope,
        payload: { winnerId: 'user-1' },
        correlationId: 'corr-1',
      });

      expect(messageId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should mark delivered without error', async () => {
      const outbox = createOutboxPrimitiveStub(testScope, 'corr-1');

      await expect(outbox.markDelivered('msg-123')).resolves.toBeUndefined();
    });

    it('should mark failed without error', async () => {
      const outbox = createOutboxPrimitiveStub(testScope, 'corr-1');
      const error = {
        id: 'err-456',
        name: 'DeliveryError',
        message: 'Delivery failed',
        timestamp: new Date().toISOString(),
        category: 'network' as const,
        severity: 'high' as const,
        code: 'DELIVERY_ERROR',
        fingerprint: 'fp-456',
        scope: testScope,
        isCanonical: true as const,
      };

      await expect(outbox.markFailed('msg-123', error)).resolves.toBeUndefined();
    });
  });

  describe('createConfigPrimitiveStub', () => {
    it('should store and retrieve values', async () => {
      const config = createConfigPrimitiveStub();

      await config.set('myKey', 'myValue');
      const value = await config.get<string>('myKey');

      expect(value).toBe('myValue');
    });

    it('should return undefined for missing keys', async () => {
      const config = createConfigPrimitiveStub();

      const value = await config.get('missing');

      expect(value).toBeUndefined();
    });

    it('should return empty object for component config', async () => {
      const config = createConfigPrimitiveStub();

      const componentConfig = await config.getComponentConfig('game.battles');

      expect(componentConfig).toEqual({});
    });

    it('should return false for unknown feature flags', async () => {
      const config = createConfigPrimitiveStub();

      const flag = await config.getFeatureFlag('new-feature');

      expect(flag).toBe(false);
    });
  });

  describe('createRbacPrimitiveStub', () => {
    it('should allow all operations (stub)', async () => {
      const rbac = createRbacPrimitiveStub(testScope, 'corr-1');

      await expect(rbac.assert({ resource: 'system', action: 'admin' }, testScope)).resolves.toBeUndefined();
    });

    it('should return true for all checks (stub)', async () => {
      const rbac = createRbacPrimitiveStub(testScope, 'corr-1');

      const allowed = await rbac.check({ resource: 'system', action: 'admin' }, testScope);

      expect(allowed).toBe(true);
    });

    it('should accept audit events', async () => {
      const rbac = createRbacPrimitiveStub(testScope, 'corr-1');

      await expect(
        rbac.audit({
          action: 'user.ban',
          actor: { type: 'user', id: 'admin-1' },
          target: { type: 'user', id: 'user-2' },
          result: 'success',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('createStoragePrimitiveStub', () => {
    it('should store and retrieve blobs', async () => {
      const storage = createStoragePrimitiveStub();
      const data = Buffer.from('test data');

      const id = await storage.putBlob(data);
      const retrieved = await storage.getBlob(id);

      expect(retrieved).toEqual(data);
    });

    it('should return null for missing blobs', async () => {
      const storage = createStoragePrimitiveStub();

      const blob = await storage.getBlob('missing-id');

      expect(blob).toBeNull();
    });

    it('should delete blobs', async () => {
      const storage = createStoragePrimitiveStub();
      const id = await storage.putBlob(Buffer.from('data'));

      await storage.deleteBlob(id);
      const blob = await storage.getBlob(id);

      expect(blob).toBeNull();
    });

    it('should store and retrieve objects', async () => {
      const storage = createStoragePrimitiveStub();
      const obj = {
        namespace: 'test',
        key: 'my-object',
        data: { foo: 'bar' },
      };

      const id = await storage.putObject(obj);
      const retrieved = await storage.getObject(id);

      expect(retrieved?.data).toEqual({ foo: 'bar' });
    });

    it('should retrieve objects by key', async () => {
      const storage = createStoragePrimitiveStub();
      const obj = {
        namespace: 'cache',
        key: 'pokemon:25',
        data: { name: 'Pikachu' },
      };

      await storage.putObject(obj);
      const retrieved = await storage.getByKey('cache', 'pokemon:25');

      expect(retrieved?.data).toEqual({ name: 'Pikachu' });
    });

    it('should return null for missing object keys', async () => {
      const storage = createStoragePrimitiveStub();

      const obj = await storage.getByKey('missing', 'key');

      expect(obj).toBeNull();
    });
  });
});

// ============================================================================
// OBSERVABILITY PRIMITIVE TESTS
// ============================================================================

describe('createObsPrimitive', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should provide scoped logger', () => {
    const obs = createObsPrimitive(testScope, 'corr-123', 'game.battles');

    expect(obs.log).toBeDefined();
    expect(obs.log.debug).toBeInstanceOf(Function);
    expect(obs.log.info).toBeInstanceOf(Function);
    expect(obs.log.warn).toBeInstanceOf(Function);
    expect(obs.log.error).toBeInstanceOf(Function);
  });

  it('should provide metrics client', () => {
    const obs = createObsPrimitive(testScope, 'corr-123', 'game.battles');

    expect(obs.metrics).toBeDefined();
    expect(obs.metrics.inc).toBeInstanceOf(Function);
    expect(obs.metrics.gauge).toBeInstanceOf(Function);
    expect(obs.metrics.timing).toBeInstanceOf(Function);
    expect(obs.metrics.histogram).toBeInstanceOf(Function);
  });

  it('should include correlation ID', () => {
    const obs = createObsPrimitive(testScope, 'my-correlation-id', 'test');

    expect(obs.correlationId).toBe('my-correlation-id');
  });

  it('should include scope', () => {
    const obs = createObsPrimitive(testScope, 'corr-123', 'test');

    expect(obs.scope).toEqual(testScope);
  });

  it('should create new obs with different correlation', () => {
    const obs = createObsPrimitive(testScope, 'corr-original', 'test');
    const newObs = obs.withCorrelation('corr-child');

    expect(obs.correlationId).toBe('corr-original');
    expect(newObs.correlationId).toBe('corr-child');
  });
});

// ============================================================================
// RNG PRIMITIVE TESTS
// ============================================================================

describe('createRngPrimitive', () => {
  describe('determinism', () => {
    it('should produce same sequence from same seed', () => {
      const rng = createRngPrimitive();
      const r1 = rng.derive(['battle', '123']);
      const r2 = rng.derive(['battle', '123']);

      expect(r1.random()).toBe(r2.random());
      expect(r1.random()).toBe(r2.random());
      expect(r1.random()).toBe(r2.random());
    });

    it('should produce different sequences from different seeds', () => {
      const rng = createRngPrimitive();
      const r1 = rng.derive(['battle', '123']);
      const r2 = rng.derive(['battle', '456']);

      // Very unlikely to be same with different seeds
      const seq1 = [r1.random(), r1.random(), r1.random()];
      const seq2 = [r2.random(), r2.random(), r2.random()];

      expect(seq1).not.toEqual(seq2);
    });
  });

  describe('random()', () => {
    it('should return values in [0, 1)', () => {
      const rng = createRngPrimitive();
      const r = rng.derive(['test']);

      for (let i = 0; i < 100; i++) {
        const val = r.random();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });
  });

  describe('int()', () => {
    it('should return integers in range', () => {
      const rng = createRngPrimitive();
      const r = rng.derive(['test']);

      for (let i = 0; i < 100; i++) {
        const val = r.int(1, 10);
        expect(val).toBeGreaterThanOrEqual(1);
        expect(val).toBeLessThanOrEqual(10);
        expect(Number.isInteger(val)).toBe(true);
      }
    });

    it('should include both bounds', () => {
      const rng = createRngPrimitive();
      const r = rng.derive(['edge-test']);

      const results = new Set<number>();
      for (let i = 0; i < 1000; i++) {
        results.add(r.int(1, 3));
      }

      expect(results.has(1)).toBe(true);
      expect(results.has(2)).toBe(true);
      expect(results.has(3)).toBe(true);
    });
  });

  describe('weighted()', () => {
    it('should select from weighted items', () => {
      const rng = createRngPrimitive();
      const r = rng.derive(['weighted-test']);

      const items = [
        { weight: 100, value: 'common' },
        { weight: 1, value: 'rare' },
      ];

      const counts = { common: 0, rare: 0 };
      for (let i = 0; i < 1000; i++) {
        const val = r.weighted(items);
        counts[val as keyof typeof counts]++;
      }

      // Common should be much more frequent
      expect(counts.common).toBeGreaterThan(counts.rare * 10);
    });

    it('should be deterministic', () => {
      const rng = createRngPrimitive();
      const items = [
        { weight: 50, value: 'a' },
        { weight: 30, value: 'b' },
        { weight: 20, value: 'c' },
      ];

      const r1 = rng.derive(['w-test']);
      const r2 = rng.derive(['w-test']);

      expect(r1.weighted(items)).toBe(r2.weighted(items));
      expect(r1.weighted(items)).toBe(r2.weighted(items));
    });
  });

  describe('shuffle()', () => {
    it('should return all original items', () => {
      const rng = createRngPrimitive();
      const r = rng.derive(['shuffle-test']);
      const original = [1, 2, 3, 4, 5];

      const shuffled = r.shuffle(original);

      expect(shuffled.sort()).toEqual(original.sort());
    });

    it('should not modify original array', () => {
      const rng = createRngPrimitive();
      const r = rng.derive(['shuffle-test']);
      const original = [1, 2, 3, 4, 5];
      const originalCopy = [...original];

      r.shuffle(original);

      expect(original).toEqual(originalCopy);
    });

    it('should be deterministic', () => {
      const rng = createRngPrimitive();
      const items = ['a', 'b', 'c', 'd', 'e'];

      const r1 = rng.derive(['shuffle-det']);
      const r2 = rng.derive(['shuffle-det']);

      expect(r1.shuffle(items)).toEqual(r2.shuffle(items));
    });
  });
});

// ============================================================================
// V1.1.2 COMPLIANCE TESTS
// ============================================================================

describe('Context Factory v1.1.2 Compliance', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides all 9 kernel primitives', () => {
    const ctx = createComponentContext({
      component: 'test',
      scope: testScope,
    });

    // Per v1.1.2 spec
    expect(ctx.db).toBeDefined();       // 1. Database access
    expect(ctx.exports).toBeDefined();   // 2. Export log
    expect(ctx.jobs).toBeDefined();      // 3. Job queue
    expect(ctx.outbox).toBeDefined();    // 4. Outbox
    expect(ctx.config).toBeDefined();    // 5. Configuration
    expect(ctx.rbac).toBeDefined();      // 6. RBAC
    expect(ctx.obs).toBeDefined();       // 7. Observability
    expect(ctx.rng).toBeDefined();       // 8. Deterministic RNG
    expect(ctx.storage).toBeDefined();   // 9. Object store
  });

  it('TenantScope uses tenant property (not tenantId)', () => {
    const ctx = createComponentContext({
      component: 'test',
      scope: testScope,
    });

    // Per v1.1.2: TenantScope has `tenant` not `tenantId`
    expect(ctx.scope.tenant).toBeDefined();
    expect((ctx.scope as any).tenantId).toBeUndefined();
  });

  it('obs includes scope for multi-tenant context', () => {
    const ctx = createComponentContext({
      component: 'test',
      scope: testScope,
    });

    // Per v1.1.2: Every envelope carries scope
    expect(ctx.obs.scope).toBeDefined();
    expect(ctx.obs.scope.tenant).toBe(testScope.tenant);
  });

  it('obs supports withCorrelation for child contexts', () => {
    const ctx = createComponentContext({
      component: 'test',
      scope: testScope,
      correlationId: 'parent-corr',
    });

    const childObs = ctx.obs.withCorrelation('child-corr');

    expect(childObs.correlationId).toBe('child-corr');
    expect(ctx.obs.correlationId).toBe('parent-corr');
  });

  it('rng provides deterministic seeds for game mechanics', () => {
    const ctx = createComponentContext({
      component: 'game.encounter',
      scope: testScope,
    });

    // Per v1.1.2: ctx.rng.derive() for deterministic RNG
    const battleRng = ctx.rng.derive(['battle', 'turn-1', 'damage']);
    const battleRng2 = ctx.rng.derive(['battle', 'turn-1', 'damage']);

    expect(battleRng.random()).toBe(battleRng2.random());
  });
});
