/**
 * Bounded data structure verification suite (Phase 3.1)
 * @module tests/memory/bounded-verification
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  cacheEntry: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    aggregate: vi.fn(),
    findFirst: vi.fn(),
  },
  errorLog: {
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
  runtimeMetric: {
    count: vi.fn(),
  },
}));

const errorBrainDbMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  getAllTimePatterns: vi.fn(),
  getAllCorrelations: vi.fn(),
  getAllCascades: vi.fn(),
  getAllRecoveryWeights: vi.fn(),
  getAllImpactWeights: vi.fn(),
  getAllBaselines: vi.fn(),
}));

vi.mock('../../src/shared/prisma.js', () => ({
  prisma: prismaMock,
}));

vi.mock('../../src/shared/logging/index.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/app/index.js', () => ({
  createEventBusHook: () => null,
  createIntelligenceHook: () => null,
}));

vi.mock('../../src/shared/models/user-queries-pg.js', () => ({
  ensureUser: vi.fn(),
}));

vi.mock('../../src/services/inventory.js', () => ({
  hasItems: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../src/services/error-brain/error-brain-db.js', () => errorBrainDbMock);

vi.mock('../../src/config/error-brain-config.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/config/error-brain-config.js')>(
    '../../src/config/error-brain-config.js'
  );

  return {
    ...actual,
    ErrorBrainConfig: {
      ...actual.ErrorBrainConfig,
      l1CacheMaxSizeMB: 0.01,
      l1CacheEnabled: false,
      cacheRefreshIntervalMs: 60_000,
      verboseLogging: false,
    },
  };
});

import { EventBus } from '../../src/shared/event-bus.js';
import { writeCache, getCacheSnapshot } from '../../src/services/cache.js';
import { TIER } from '../../src/config/resource-tiers.js';
import { LogBuffer } from '../../src/shared/logBuffer.js';
import {
  CONFIG as AI_LOG_CONFIG,
  flush as flushAiLogs,
  getStats as getAiLogStats,
  info as aiInfo,
} from '../../src/services/ai/ai-log-writer.js';
import { LokiQueue } from '../../src/observability/backends/loki/loki-queue.js';
import {
  getBufferStats,
  queueWrite,
  registerWriteExecutor,
} from '../../src/services/monitoring/resilient-write-buffer.js';
import {
  clearAllPatternState,
  getPatternDetectorStats,
  recordErrorForCorrelation,
} from '../../src/services/error-brain/pattern-detector.js';
import { ErrorTracker } from '../../src/sensaios/error-tracker.js';
import { KeyRotationService } from '../../src/bot/security/services/key-rotation-service.js';
import {
  IntegritySweepScheduler,
  SweepType,
  type SweepResult,
} from '../../src/bot/security/services/integrity-sweep-scheduler.js';
import {
  createPagerDutyService,
  type AlertRecord,
} from '../../src/bot/security/services/pagerduty-service.js';
import { resourceMonitor } from '../../src/services/monitoring/resource-monitor.js';
import {
  getStats as getErrorBrainCacheStats,
  refreshFromDb as refreshErrorBrainCache,
  shutdown as shutdownErrorBrainCache,
} from '../../src/services/error-brain/error-brain-cache.js';
import {
  clearAllCaches,
  generateFingerprint,
  getCacheStats as getMonitoringCacheStats,
} from '../../src/services/monitoring/monitoring-utils.js';
import {
  endFishingSession,
  getFishingStats,
  startFishingSession,
} from '../../src/services/fishing.js';
import { getAuditTrail, registerSystem } from '../../src/kernel/kernel-observer.js';
import { LRUCacheStrategy } from '../../src/workers/database/strategies.js';
import {
  checkAndSet,
  cleanup as cleanupCooldowns,
  getStats as getCooldownStats,
} from '../../src/lib/cooldown.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { CanonicalError } from '../../src/sensaios/canonical-error.js';

const DEFAULT_SCOPE = {
  tenant: 'test-tenant',
  environment: 'development',
  service: 'test-service',
  component: 'test-component',
} as const;

function buildCanonicalError(fingerprint: string, timestamp: string): CanonicalError {
  return {
    name: 'TestError',
    message: 'Test error message',
    stack: 'stack',
    id: fingerprint,
    timestamp,
    category: 'system',
    severity: 'low',
    code: 'TEST-0001',
    fingerprint,
    scope: DEFAULT_SCOPE,
    isCanonical: true,
  };
}

function buildSweepResult(id: string): SweepResult {
  return {
    sweepId: id,
    scheduleId: `schedule-${id}`,
    sweepType: SweepType.FULL,
    startedAt: new Date(),
    completedAt: new Date(),
    durationMs: 1,
    success: true,
    recordsChecked: 1,
    violationsFound: 0,
    violations: [],
    metadata: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  prismaMock.cacheEntry.findUnique.mockResolvedValue(null);
  prismaMock.cacheEntry.upsert.mockResolvedValue({});
  prismaMock.cacheEntry.create.mockResolvedValue({});
  prismaMock.cacheEntry.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.cacheEntry.aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 }, _count: 0 });
  prismaMock.cacheEntry.findFirst.mockResolvedValue(null);

  errorBrainDbMock.initialize.mockResolvedValue(undefined);
  errorBrainDbMock.getAllTimePatterns.mockReturnValue(
    Array.from({ length: 120 }, (_, index) => ({
      id: index + 1,
      hour: index % 24,
      dayOfWeek: null,
      fingerprint: `fingerprint-${index}`,
      avgCount: 3,
      stdDev: 1,
      anomalyThreshold: 5,
      sampleCount: 2,
      lastUpdated: Date.now(),
    }))
  );
  errorBrainDbMock.getAllCorrelations.mockReturnValue(
    Array.from({ length: 120 }, (_, index) => ({
      id: index + 1,
      primaryFingerprint: `fp-${index}`,
      secondaryFingerprint: `fp-${index + 1}`,
      correlationStrength: 0.4,
      avgTimeDeltaMs: 100,
      observationCount: 3,
      confidence: 0.5,
      lastObserved: Date.now(),
    }))
  );
  errorBrainDbMock.getAllCascades.mockReturnValue(
    Array.from({ length: 80 }, (_, index) => ({
      id: index + 1,
      rootFingerprint: `root-${index}`,
      childFingerprints: [`child-${index}`],
      cascadeDepth: 1,
      avgSpreadTimeMs: 200,
      totalImpact: 10,
      confidence: 0.7,
      lastObserved: Date.now(),
    }))
  );
  errorBrainDbMock.getAllRecoveryWeights.mockReturnValue(
    Array.from({ length: 120 }, (_, index) => ({
      id: index + 1,
      fingerprint: `fp-${index}`,
      strategy: 'restart',
      successCount: 1,
      failureCount: 0,
      avgRecoveryTimeMs: 1000,
      effectivenessScore: 0.9,
      lastUpdated: Date.now(),
    }))
  );
  errorBrainDbMock.getAllImpactWeights.mockReturnValue(
    Array.from({ length: 120 }, (_, index) => ({
      id: index + 1,
      fingerprint: `fp-${index}`,
      category: 'system',
      severity: 'low',
      avgUserImpact: 1,
      avgFeatureCount: 1,
      observationCount: 2,
      confidence: 0.8,
      lastUpdated: Date.now(),
    }))
  );
  errorBrainDbMock.getAllBaselines.mockReturnValue(
    Array.from({ length: 80 }, (_, index) => ({
      id: index + 1,
      metricName: `metric-${index}`,
      windowMinutes: 60,
      avgValue: 10,
      stdDev: 1,
      sampleCount: 2,
      lastUpdated: Date.now(),
    }))
  );
});

afterEach(async () => {
  await shutdownErrorBrainCache();
  EventBus.resetInstance();
  clearAllCaches();
  clearAllPatternState();
});

describe('Bounded data structure verification', () => {
  it('caps EventBus replay buffer at 100 events', () => {
    const bus = EventBus.getInstance();

    for (let i = 0; i < 150; i += 1) {
      bus.emit('test.event', { index: i });
    }

    expect(bus.getStats().replayBufferSize).toBe(100);
  });

  it('caps EventBus pattern cache at 500 entries', () => {
    const bus = EventBus.getInstance();

    for (let i = 0; i < 600; i += 1) {
      bus.subscribe(`pattern.${i}`, () => {}, { async: false });
    }

    bus.emit('pattern.1', { value: 1 });

    expect(bus.getPatternCacheStats().size).toBeLessThanOrEqual(500);
  });

  it('bounds security memory cache to tier-configured entries', () => {
    const limit = TIER.cache.memoryCacheMaxEntries;
    for (let i = 0; i < limit + 10; i += 1) {
      writeCache(`entry-${i}`, { index: i });
    }

    const snapshot = getCacheSnapshot();
    expect(snapshot.entryCount).toBeLessThanOrEqual(limit);
  });

  it('keeps log buffer size under configured max', () => {
    const buffered: unknown[] = [];
    const buffer = new LogBuffer((entries) => buffered.push(entries), {
      flushIntervalMs: 0,
      maxBufferSize: 5,
      bypassCritical: false,
      enabled: true,
    });

    for (let i = 0; i < 10; i += 1) {
      buffer.add('info', `message-${i}`);
    }

    expect(buffer.size()).toBeLessThanOrEqual(5);
    buffer.destroy();
  });

  it('flushes AI log buffer at 100 entries', async () => {
    for (let i = 0; i < 120; i += 1) {
      aiInfo(AI_LOG_CONFIG.categories.SYSTEM, `log-${i}`);
    }

    await flushAiLogs();
    expect(getAiLogStats().bufferSize).toBeLessThanOrEqual(100);
  });

  it('caps Loki queue depth at configured max size', () => {
    const queue = new LokiQueue(10);

    for (let i = 0; i < 20; i += 1) {
      queue.push({
        timestamp: new Date(),
        level: 'info',
        service: 'test',
        topic: 'test.event',
        message: `log-${i}`,
      });
    }

    expect(queue.getStats().depth).toBeLessThanOrEqual(10);
  });

  it('keeps resilient write buffer under 1000 pending writes', async () => {
    registerWriteExecutor('test', async () => Promise.resolve());

    for (let i = 0; i < 1050; i += 1) {
      await queueWrite({
        operationType: 'test',
        payload: { index: i },
        idempotencyKey: `write-${i}`,
        execute: async () => Promise.resolve(),
      });
    }

    expect(getBufferStats().pendingWrites).toBeLessThanOrEqual(1000);
  });

  it('caps recent error observations at 1000 entries', () => {
    const now = Date.now();

    for (let i = 0; i < 1100; i += 1) {
      recordErrorForCorrelation({
        fingerprint: `err-${i}`,
        timestamp: now + i,
        severity: 1,
      });
    }

    expect(getPatternDetectorStats().recentErrorsCount).toBeLessThanOrEqual(1000);
  });

  it('limits Sensai error tracker patterns to configured max', () => {
    const tracker = new ErrorTracker({ maxPatterns: 5 });

    for (let i = 0; i < 12; i += 1) {
      tracker.track(buildCanonicalError(`pattern-${i}`, new Date().toISOString()));
    }

    expect(tracker.getStats().uniquePatterns).toBeLessThanOrEqual(5);
  });

  it('bounds key rotation history to 100 entries', () => {
    const service = new KeyRotationService({
      activeKeyId: 'key-0',
      activeSecret: 'secret-0',
    });

    for (let i = 1; i <= 150; i += 1) {
      service.rotate(`key-${i}`, `secret-${i}`);
    }

    expect(service.getRotationHistory(200).length).toBeLessThanOrEqual(100);
  });

  it('limits integrity sweep history to configured retention', () => {
    const scheduler = new IntegritySweepScheduler(prismaMock as unknown as PrismaClient, {
      maxHistorySize: 10,
    });
    const schedulerAny = scheduler as unknown as {
      addToHistory: (result: SweepResult) => void;
      getSweepHistory: (limit?: number) => SweepResult[];
    };

    for (let i = 0; i < 15; i += 1) {
      schedulerAny.addToHistory(buildSweepResult(`sweep-${i}`));
    }

    expect(schedulerAny.getSweepHistory().length).toBeLessThanOrEqual(10);
  });

  it('limits PagerDuty alert history to retention setting', () => {
    const pagerduty = createPagerDutyService({
      routingKey: 'test-key',
      serviceName: 'test-service',
      historyRetention: 5,
    });

    const pagerdutyAny = pagerduty as unknown as {
      addToHistory: (record: AlertRecord) => void;
      getAlertHistory: (limit?: number) => AlertRecord[];
    };

    for (let i = 0; i < 12; i += 1) {
      pagerdutyAny.addToHistory({
        dedupKey: `alert-${i}`,
        severity: 'error',
        summary: `Alert ${i}`,
        source: 'test',
        status: 'triggered',
        triggeredAt: new Date(),
        retryCount: 0,
      });
    }

    expect(pagerdutyAny.getAlertHistory().length).toBeLessThanOrEqual(5);
  });

  it('prunes resource monitor snapshots beyond retention window', () => {
    const monitorAny = resourceMonitor as unknown as {
      snapshots: Array<{ timestamp: Date }>;
      cleanupOldSnapshots: () => void;
      getHistory: () => Array<{ timestamp: Date }>;
    };

    const now = Date.now();
    monitorAny.snapshots = [
      { timestamp: new Date(now - 8 * 24 * 60 * 60 * 1000) },
      { timestamp: new Date(now) },
    ];

    monitorAny.cleanupOldSnapshots();
    expect(monitorAny.getHistory().length).toBe(1);
  });

  it('enforces Error Brain L1 cache max size', async () => {
    await refreshErrorBrainCache();
    const stats = getErrorBrainCacheStats();

    expect(stats.estimatedSizeBytes).toBeLessThanOrEqual(stats.maxSizeBytes);
  });

  it('caps monitoring fingerprint cache at 500 entries', () => {
    for (let i = 0; i < 600; i += 1) {
      generateFingerprint(`fingerprint-${i}`);
    }

    expect(getMonitoringCacheStats().fingerprintCache.size).toBeLessThanOrEqual(500);
  });

  it('ends fishing sessions to prevent unbounded growth', async () => {
    const ids = Array.from({ length: 20 }, (_, index) => `angler-${index}`);

    for (const id of ids) {
      await startFishingSession(id);
    }

    expect(getFishingStats().activeSessions).toBe(ids.length);

    for (const id of ids) {
      endFishingSession(id);
    }

    expect(getFishingStats().activeSessions).toBe(0);
  });

  it('bounds kernel audit trail to 500 entries', () => {
    for (let i = 0; i < 600; i += 1) {
      registerSystem('SERVICE', `system-${i}`);
    }

    expect(getAuditTrail(1000).length).toBeLessThanOrEqual(500);
  });

  it('enforces LRU cache strategy max entries', () => {
    const cache = new LRUCacheStrategy<string, number>();
    cache.initialize({
      enabled: true,
      evictionPolicy: 'lru',
      ttlMs: 0,
      maxSizeBytes: 100_000,
      maxEntries: 5,
      prefetch: false,
    });

    for (let i = 0; i < 10; i += 1) {
      cache.set(`key-${i}`, i);
    }

    expect(cache.getStats().entryCount).toBeLessThanOrEqual(5);
  });

  it('removes expired cooldown entries during cleanup', () => {
    for (let i = 0; i < 20; i += 1) {
      checkAndSet(`user-${i}`, 'test', 1000);
    }

    const { maxAgeSec } = getCooldownStats();
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now + maxAgeSec * 1000 + 2000);

    cleanupCooldowns();

    expect(getCooldownStats().total).toBe(0);
    dateSpy.mockRestore();
  });

  it('keeps heap growth under 50 MB during mixed operations', () => {
    const startHeap = process.memoryUsage().heapUsed;

    const cache = new LRUCacheStrategy<string, number>();
    cache.initialize({
      enabled: true,
      evictionPolicy: 'lru',
      ttlMs: 0,
      maxSizeBytes: 100_000,
      maxEntries: 100,
      prefetch: false,
    });

    const bus = EventBus.getInstance();

    for (let i = 0; i < 10_000; i += 1) {
      generateFingerprint(`stress-${i}`);
      cache.set(`entry-${i}`, i);
      bus.emit('stress.event', { index: i });
    }

    const endHeap = process.memoryUsage().heapUsed;
    const delta = endHeap - startHeap;
    const maxDelta = 50 * 1024 * 1024;

    expect(delta).toBeLessThanOrEqual(maxDelta);
  });
});
