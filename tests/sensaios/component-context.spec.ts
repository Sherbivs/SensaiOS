/**
 * SensaiOS Component Context Tests
 * 
 * Tests for kernel primitives, context factory, and ComponentContext.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Types
  type TenantScope,
  type ExportsPrimitive,
  type JobsPrimitive,
  type OutboxPrimitive,
  type ConfigPrimitive,
  type RbacPrimitive,
  type StoragePrimitive,
  type ObsPrimitive,
  type RngPrimitive,
  type DeterministicRng,
  // Factory
  createComponentContext,
  createTestContext,
  contextFromWorker,
  systemContext,
  contextFromCli,
  // Primitive stubs
  createExportsPrimitiveStub,
  createJobsPrimitiveStub,
  createOutboxPrimitiveStub,
  createConfigPrimitiveStub,
  createRbacPrimitiveStub,
  createStoragePrimitiveStub,
  createObsPrimitive,
  createRngPrimitive,
  // Error type for jobs.fail
  toCanonicalError,
} from '../../src/sensaios/index.js';

// ============================================================================
// TEST DATA
// ============================================================================

const testScope: TenantScope = {
  tenant: 'test-guild-123',
  environment: 'development',
  service: 'test-service',
  component: 'test-component',
};

const testCorrelationId = 'test-correlation-001';

// ============================================================================
// COMPONENT CONTEXT TESTS
// ============================================================================

describe('ComponentContext', () => {
  describe('createComponentContext', () => {
    it('should create context with all primitives', () => {
      const ctx = createComponentContext({
        component: 'test.component',
        scope: testScope,
        correlationId: testCorrelationId,
      });

      // Verify all primitives exist
      expect(ctx.scope).toEqual(testScope);
      expect(ctx.component).toBe('test.component');
      expect(ctx.db).toBeDefined();
      expect(ctx.exports).toBeDefined();
      expect(ctx.jobs).toBeDefined();
      expect(ctx.outbox).toBeDefined();
      expect(ctx.obs).toBeDefined();
      expect(ctx.rng).toBeDefined();
      expect(ctx.rbac).toBeDefined();
      expect(ctx.config).toBeDefined();
      expect(ctx.storage).toBeDefined();
    });

    it('should auto-generate correlation ID if not provided', () => {
      const ctx = createComponentContext({
        component: 'test.component',
        scope: testScope,
      });

      // Correlation ID should be a UUID
      expect(ctx.obs.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should allow primitive overrides', () => {
      const mockExports: ExportsPrimitive = {
        append: vi.fn().mockResolvedValue({ seq: 1, duplicate: false }),
        query: vi.fn().mockResolvedValue([]),
        getOffset: vi.fn().mockResolvedValue(0),
        setOffset: vi.fn().mockResolvedValue(undefined),
        consumeFrom: vi.fn().mockResolvedValue([]),
      };

      const ctx = createComponentContext({
        component: 'test.component',
        scope: testScope,
        overrides: { exports: mockExports },
      });

      expect(ctx.exports).toBe(mockExports);
    });
  });

  describe('createTestContext', () => {
    it('should create context with default test scope', () => {
      const ctx = createTestContext();

      expect(ctx.scope.tenant).toBe('test-guild-123');
      expect(ctx.scope.environment).toBe('development');
      expect(ctx.component).toBe('test');
    });

    it('should allow scope overrides', () => {
      const ctx = createTestContext('custom.component', {
        tenant: 'custom-tenant',
        environment: 'staging',
      });

      expect(ctx.scope.tenant).toBe('custom-tenant');
      expect(ctx.scope.environment).toBe('staging');
      expect(ctx.component).toBe('custom.component');
    });
  });

  describe('contextFromWorker', () => {
    it('should create context for worker with tenant', () => {
      const ctx = contextFromWorker('cache-worker', 'guild-456');

      expect(ctx.component).toBe('cache-worker');
      expect(ctx.scope.tenant).toBe('guild-456');
      expect(ctx.scope.component).toBe('cache-worker');
    });
  });

  describe('systemContext', () => {
    it('should create context with system tenant', () => {
      const ctx = systemContext('scheduler');

      expect(ctx.scope.tenant).toBe('system');
      expect(ctx.component).toBe('scheduler');
    });
  });

  describe('contextFromCli', () => {
    it('should create context for CLI commands', () => {
      const ctx = contextFromCli('db:migrate');

      expect(ctx.scope.tenant).toBe('system');
      expect(ctx.scope.service).toBe('infinity-gauntlet-cli');
      expect(ctx.component).toBe('db:migrate');
    });
  });
});

// ============================================================================
// EXPORTS PRIMITIVE TESTS
// ============================================================================

describe('ExportsPrimitive', () => {
  let exports: ExportsPrimitive;

  beforeEach(() => {
    exports = createExportsPrimitiveStub(testScope, testCorrelationId);
  });

  describe('append', () => {
    it('should append export and return sequence number', async () => {
      const result = await exports.append({
        source: 'game.battles',
        type: 'battle.completed',
        scope: testScope,
        idempotencyKey: 'battle-001',
        payload: { battleId: '001', winnerId: 'player-1' },
        occurredAt: new Date(),
        correlationId: testCorrelationId,
      });

      expect(result.seq).toBeGreaterThan(0);
      expect(result.duplicate).toBe(false);
    });

    it('should increment sequence on multiple appends', async () => {
      const result1 = await exports.append({
        source: 'game.battles',
        type: 'battle.started',
        scope: testScope,
        idempotencyKey: 'battle-start-001',
        payload: {},
        occurredAt: new Date(),
        correlationId: testCorrelationId,
      });

      const result2 = await exports.append({
        source: 'game.battles',
        type: 'battle.completed',
        scope: testScope,
        idempotencyKey: 'battle-end-001',
        payload: {},
        occurredAt: new Date(),
        correlationId: testCorrelationId,
      });

      expect(result2.seq).toBeGreaterThan(result1.seq);
    });
  });

  describe('offset tracking', () => {
    it('should get and set projection offsets', async () => {
      const projection = 'leaderboard.projection';

      // Initial offset is 0
      const initial = await exports.getOffset(projection);
      expect(initial).toBe(0);

      // Set offset
      await exports.setOffset(projection, 42);

      // Verify offset was set
      const updated = await exports.getOffset(projection);
      expect(updated).toBe(42);
    });
  });

  describe('query and consume', () => {
    it('should return empty array for query (stub)', async () => {
      const results = await exports.query({ types: ['battle.completed'] });
      expect(results).toEqual([]);
    });

    it('should return empty array for consumeFrom (stub)', async () => {
      const results = await exports.consumeFrom(0, ['battle.completed'], 100);
      expect(results).toEqual([]);
    });
  });
});

// ============================================================================
// JOBS PRIMITIVE TESTS
// ============================================================================

describe('JobsPrimitive', () => {
  let jobs: JobsPrimitive;

  beforeEach(() => {
    jobs = createJobsPrimitiveStub(testScope, testCorrelationId);
  });

  describe('enqueue', () => {
    it('should enqueue job and return ID', async () => {
      const jobId = await jobs.enqueue({
        kind: 'battle.cleanup',
        scope: testScope,
        payload: { battleId: '001' },
        correlationId: testCorrelationId,
      });

      expect(jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should accept scheduled jobs', async () => {
      const scheduledFor = new Date(Date.now() + 60000);

      const jobId = await jobs.enqueue({
        kind: 'battle.cleanup',
        scope: testScope,
        payload: { battleId: '001' },
        correlationId: testCorrelationId,
        scheduledFor,
      });

      expect(jobId).toBeDefined();
    });
  });

  describe('lease', () => {
    it('should return empty array (stub)', async () => {
      const leased = await jobs.lease(['battle.cleanup'], 10);
      expect(leased).toEqual([]);
    });
  });

  describe('complete', () => {
    it('should complete job without error', async () => {
      await expect(
        jobs.complete('job-001', { durationMs: 123 })
      ).resolves.not.toThrow();
    });
  });

  describe('fail', () => {
    it('should fail job with error', async () => {
      const error = toCanonicalError(new Error('Test failure'), testScope);

      await expect(
        jobs.fail('job-001', error, new Date())
      ).resolves.not.toThrow();
    });
  });
});

// ============================================================================
// OUTBOX PRIMITIVE TESTS
// ============================================================================

describe('OutboxPrimitive', () => {
  let outbox: OutboxPrimitive;

  beforeEach(() => {
    outbox = createOutboxPrimitiveStub(testScope, testCorrelationId);
  });

  describe('send', () => {
    it('should send message and return ID', async () => {
      const messageId = await outbox.send({
        destination: 'discord',
        topic: 'battle.result',
        key: 'channel-123',
        scope: testScope,
        payload: { channelId: '123', content: 'Battle result!' },
        correlationId: testCorrelationId,
      });

      expect(messageId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('markDelivered', () => {
    it('should mark message as delivered without error', async () => {
      await expect(outbox.markDelivered('msg-001')).resolves.not.toThrow();
    });
  });

  describe('markFailed', () => {
    it('should mark message as failed with error', async () => {
      const error = toCanonicalError(new Error('Delivery failed'), testScope);

      await expect(outbox.markFailed('msg-001', error)).resolves.not.toThrow();
    });
  });
});

// ============================================================================
// CONFIG PRIMITIVE TESTS
// ============================================================================

describe('ConfigPrimitive', () => {
  let config: ConfigPrimitive;

  beforeEach(() => {
    config = createConfigPrimitiveStub();
  });

  describe('get/set', () => {
    it('should set and get values', async () => {
      await config.set('app.name', 'Infinity Gauntlet');

      const value = await config.get<string>('app.name');
      expect(value).toBe('Infinity Gauntlet');
    });

    it('should return undefined for missing keys', async () => {
      const value = await config.get<string>('missing.key');
      expect(value).toBeUndefined();
    });
  });

  describe('getFeatureFlag', () => {
    it('should return false by default', async () => {
      const enabled = await config.getFeatureFlag('new-feature');
      expect(enabled).toBe(false);
    });

    it('should return true when flag is set', async () => {
      await config.set('flag:new-feature', true);

      const enabled = await config.getFeatureFlag('new-feature');
      expect(enabled).toBe(true);
    });
  });
});

// ============================================================================
// RBAC PRIMITIVE TESTS
// ============================================================================

describe('RbacPrimitive', () => {
  let rbac: RbacPrimitive;

  beforeEach(() => {
    rbac = createRbacPrimitiveStub(testScope, testCorrelationId);
  });

  describe('check', () => {
    it('should return true (stub allows all)', async () => {
      const allowed = await rbac.check(
        { resource: 'battle', action: 'create' },
        testScope
      );

      expect(allowed).toBe(true);
    });
  });

  describe('assert', () => {
    it('should not throw (stub allows all)', async () => {
      await expect(
        rbac.assert({ resource: 'battle', action: 'create' }, testScope)
      ).resolves.not.toThrow();
    });
  });

  describe('audit', () => {
    it('should audit events without error', async () => {
      await expect(
        rbac.audit({
          action: 'battle.start',
          actor: { type: 'user', id: 'user-123' },
          target: { type: 'battle', id: 'battle-001' },
          result: 'success',
        })
      ).resolves.not.toThrow();
    });
  });
});

// ============================================================================
// STORAGE PRIMITIVE TESTS
// ============================================================================

describe('StoragePrimitive', () => {
  let storage: StoragePrimitive;

  beforeEach(() => {
    storage = createStoragePrimitiveStub();
  });

  describe('blob operations', () => {
    it('should put and get blob', async () => {
      const data = Buffer.from('test data');

      const id = await storage.putBlob(data, { contentType: 'text/plain' });
      expect(id).toBeDefined();

      const retrieved = await storage.getBlob(id);
      expect(retrieved).toEqual(data);
    });

    it('should return null for missing blob', async () => {
      const retrieved = await storage.getBlob('missing-id');
      expect(retrieved).toBeNull();
    });

    it('should delete blob', async () => {
      const data = Buffer.from('test data');
      const id = await storage.putBlob(data);

      await storage.deleteBlob(id);

      const retrieved = await storage.getBlob(id);
      expect(retrieved).toBeNull();
    });
  });

  describe('object operations', () => {
    it('should put and get object', async () => {
      const obj = {
        namespace: 'cache',
        key: 'pokemon:pikachu',
        data: { id: 25, name: 'Pikachu' },
      };

      const id = await storage.putObject(obj);
      expect(id).toBeDefined();

      const retrieved = await storage.getObject(id);
      expect(retrieved?.data).toEqual(obj.data);
    });

    it('should get object by key', async () => {
      const obj = {
        namespace: 'cache',
        key: 'pokemon:pikachu',
        data: { id: 25, name: 'Pikachu' },
      };

      await storage.putObject(obj);

      const retrieved = await storage.getByKey('cache', 'pokemon:pikachu');
      expect(retrieved?.data).toEqual(obj.data);
    });

    it('should return null for missing object', async () => {
      const retrieved = await storage.getObject('missing-id');
      expect(retrieved).toBeNull();
    });

    it('should delete object', async () => {
      const obj = {
        namespace: 'cache',
        key: 'pokemon:pikachu',
        data: { id: 25, name: 'Pikachu' },
      };

      const id = await storage.putObject(obj);
      await storage.deleteObject(id);

      const retrieved = await storage.getObject(id);
      expect(retrieved).toBeNull();
    });
  });
});

// ============================================================================
// OBSERVABILITY PRIMITIVE TESTS
// ============================================================================

describe('ObsPrimitive', () => {
  let obs: ObsPrimitive;

  beforeEach(() => {
    obs = createObsPrimitive(testScope, testCorrelationId, 'test');
  });

  it('should have correlation ID', () => {
    expect(obs.correlationId).toBe(testCorrelationId);
  });

  it('should have scope', () => {
    expect(obs.scope).toEqual(testScope);
  });

  it('should have scoped logger', () => {
    expect(obs.log).toBeDefined();
    expect(typeof obs.log.debug).toBe('function');
    expect(typeof obs.log.info).toBe('function');
    expect(typeof obs.log.warn).toBe('function');
    expect(typeof obs.log.error).toBe('function');
  });

  it('should have metrics client', () => {
    expect(obs.metrics).toBeDefined();
    expect(typeof obs.metrics.inc).toBe('function');
    expect(typeof obs.metrics.gauge).toBe('function');
    expect(typeof obs.metrics.timing).toBe('function');
  });

  it('should create child context with new correlation', () => {
    const child = obs.withCorrelation('child-correlation');

    expect(child.correlationId).toBe('child-correlation');
    expect(child.scope).toEqual(testScope);
  });
});

// ============================================================================
// RNG PRIMITIVE TESTS
// ============================================================================

describe('RngPrimitive', () => {
  let rng: RngPrimitive;

  beforeEach(() => {
    rng = createRngPrimitive();
  });

  describe('derive', () => {
    it('should create deterministic RNG from seed parts', () => {
      const rng1 = rng.derive(['battle', '001', 'turn-1']);
      const rng2 = rng.derive(['battle', '001', 'turn-1']);

      // Same seeds should produce same sequences
      const values1 = [rng1.random(), rng1.random(), rng1.random()];
      const values2 = [rng2.random(), rng2.random(), rng2.random()];

      expect(values1).toEqual(values2);
    });

    it('should produce different sequences for different seeds', () => {
      const rng1 = rng.derive(['battle', '001']);
      const rng2 = rng.derive(['battle', '002']);

      const value1 = rng1.random();
      const value2 = rng2.random();

      expect(value1).not.toBe(value2);
    });
  });

  describe('DeterministicRng', () => {
    let drng: DeterministicRng;

    beforeEach(() => {
      drng = rng.derive(['test-seed']);
    });

    it('should produce random floats [0, 1)', () => {
      for (let i = 0; i < 100; i++) {
        const value = drng.random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should produce random integers in range', () => {
      for (let i = 0; i < 100; i++) {
        const value = drng.int(1, 10);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(10);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('should select weighted items', () => {
      const items = [
        { weight: 1, value: 'rare' },
        { weight: 99, value: 'common' },
      ];

      // With 99:1 odds, common should be selected most of the time
      let commonCount = 0;
      for (let i = 0; i < 100; i++) {
        const derng = rng.derive(['weighted-test', String(i)]);
        if (derng.weighted(items) === 'common') {
          commonCount++;
        }
      }

      // Should be mostly common (>80 of 100)
      expect(commonCount).toBeGreaterThan(80);
    });

    it('should shuffle arrays deterministically', () => {
      const original = [1, 2, 3, 4, 5];

      const drng1 = rng.derive(['shuffle-test']);
      const drng2 = rng.derive(['shuffle-test']);

      const shuffled1 = drng1.shuffle([...original]);
      const shuffled2 = drng2.shuffle([...original]);

      // Same seed = same shuffle
      expect(shuffled1).toEqual(shuffled2);

      // Shuffled should contain same elements
      expect([...shuffled1].sort()).toEqual([...original].sort());
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('ComponentContext Integration', () => {
  it('should provide full context for handler execution', async () => {
    const ctx = createTestContext('game.battles');

    // Simulate a handler using all primitives
    const battleId = 'battle-001';

    // 1. Append export (fact)
    const exportResult = await ctx.exports.append({
      source: ctx.component,
      type: 'battle.started',
      scope: ctx.scope,
      idempotencyKey: `battle-start-${battleId}`,
      payload: { battleId },
      occurredAt: new Date(),
      correlationId: ctx.obs.correlationId,
    });
    expect(exportResult.seq).toBeGreaterThan(0);

    // 2. Enqueue background job
    const jobId = await ctx.jobs.enqueue({
      kind: 'battle.process-turn',
      scope: ctx.scope,
      payload: { battleId },
      correlationId: ctx.obs.correlationId,
    });
    expect(jobId).toBeDefined();

    // 3. Send outbox message
    const messageId = await ctx.outbox.send({
      destination: 'discord',
      topic: 'battle.notification',
      key: `channel-${battleId}`,
      scope: ctx.scope,
      payload: { content: 'Battle started!' },
      correlationId: ctx.obs.correlationId,
    });
    expect(messageId).toBeDefined();

    // 4. Use RNG for battle mechanics
    const rng = ctx.rng.derive(['battle', battleId, 'turn-1']);
    const criticalHit = rng.random() < 0.0625; // 1/16 chance
    expect(typeof criticalHit).toBe('boolean');

    // 5. Store battle state
    const stateId = await ctx.storage.putObject({
      namespace: 'battles',
      key: battleId,
      data: { phase: 'started', turn: 1 },
    });
    expect(stateId).toBeDefined();

    // 6. Audit the action
    await ctx.rbac.audit({
      action: 'battle.start',
      actor: { type: 'user', id: 'player-001' },
      target: { type: 'battle', id: battleId },
      result: 'success',
    });

    // 7. Log completion
    ctx.obs.log.info('battle-start', 'Battle initiated successfully', { battleId });
  });
});
