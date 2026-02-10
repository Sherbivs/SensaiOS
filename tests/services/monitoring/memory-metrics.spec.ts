import { beforeEach, describe, expect, it, vi } from 'vitest';

const activityMetricsMock = vi.hoisted(() => vi.fn());
const playerResolverMock = vi.hoisted(() => ({ getCacheStats: vi.fn() }));
const casMock = vi.hoisted(() => ({ getStats: vi.fn() }));
const discordIdentityMock = vi.hoisted(() => ({ getCacheStats: vi.fn() }));
const knowledgeBaseMock = vi.hoisted(() => vi.fn());
const eventBusMock = vi.hoisted(() => ({ getStats: vi.fn(), getPatternCacheStats: vi.fn() }));
const cacheSnapshotMock = vi.hoisted(() => vi.fn());
const logBufferMock = vi.hoisted(() => ({ getStats: vi.fn() }));
const aiLogStatsMock = vi.hoisted(() => vi.fn());
const lokiBackendMock = vi.hoisted(() => ({ getDetailedStatus: vi.fn() }));
const resilientBufferMock = vi.hoisted(() => vi.fn());
const patternDetectorMock = vi.hoisted(() => vi.fn());
const errorBrainCacheMock = vi.hoisted(() => vi.fn());
const monitoringCacheMock = vi.hoisted(() => vi.fn());
const formatBytesMock = vi.hoisted(() => vi.fn());
const auditTrailMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/utils/activityTracker.js', () => ({
  getBufferMetrics: () => activityMetricsMock(),
}));

vi.mock('../../../src/services/player-resolver.js', () => ({
  PlayerResolver: { getInstance: () => playerResolverMock },
}));

vi.mock('../../../src/sensaios/storage/content-addressable.js', () => ({
  getContentAddressableStorage: () => casMock,
}));

vi.mock('../../../src/services/discord-identity.js', () => ({
  getDiscordIdentityService: () => discordIdentityMock,
}));

vi.mock('../../../src/services/ai/ai-log-analyzer.js', () => ({
  getKnowledgeBaseMetrics: () => knowledgeBaseMock(),
}));

vi.mock('../../../src/shared/event-bus.js', () => ({
  EventBus: { getInstance: () => eventBusMock },
}));

vi.mock('../../../src/services/cache.js', () => ({
  getCacheSnapshot: () => cacheSnapshotMock(),
}));

vi.mock('../../../src/shared/logBuffer.js', () => ({
  getLogBuffer: () => logBufferMock,
}));

vi.mock('../../../src/services/ai/ai-log-writer.js', () => ({
  getStats: () => aiLogStatsMock(),
}));

vi.mock('../../../src/observability/backends/loki/index.js', () => ({
  lokiBackend: lokiBackendMock,
}));

vi.mock('../../../src/services/monitoring/resilient-write-buffer.js', () => ({
  getBufferStats: () => resilientBufferMock(),
}));

vi.mock('../../../src/services/error-brain/pattern-detector.js', () => ({
  getPatternDetectorStats: () => patternDetectorMock(),
  MAX_FINGERPRINTS: 2000,
}));

vi.mock('../../../src/services/error-brain/error-brain-cache.js', () => ({
  getStats: () => errorBrainCacheMock(),
}));

vi.mock('../../../src/services/monitoring/monitoring-utils.js', () => ({
  formatBytes: (value: number) => formatBytesMock(value),
  getCacheStats: () => monitoringCacheMock(),
}));

vi.mock('../../../src/kernel/kernel-observer.js', () => ({
  getAuditTrail: (limit: number) => auditTrailMock(limit),
}));

import {
  collectMemoryMetrics,
  formatMemoryMetrics,
} from '../../../src/services/monitoring/memory-metrics.js';

const defaultMemoryUsage = {
  rss: 100 * 1024 * 1024,
  heapUsed: 50 * 1024 * 1024,
  heapTotal: 80 * 1024 * 1024,
  external: 0,
  arrayBuffers: 0,
};

beforeEach(() => {
  vi.restoreAllMocks();

  activityMetricsMock.mockReturnValue({ current: 10, max: 100, utilization: 10 });
  playerResolverMock.getCacheStats.mockReturnValue({ size: 80, max: 100, utilization: 80 });
  casMock.getStats.mockReturnValue({ total: 95, maxBlobs: 100, utilization: 95 });
  discordIdentityMock.getCacheStats.mockReturnValue({
    users: { size: 10, max: 100, utilization: 10 },
    guilds: { size: 50, max: 100, utilization: 50 },
  });
  knowledgeBaseMock.mockReturnValue({
    errorPatterns: { size: 1, max: 10, utilization: 0.1 },
    performanceBaselines: { size: 2, max: 10, utilization: 0.2 },
    userBehaviorPatterns: { size: 3, max: 10, utilization: 0.3 },
    correlations: { size: 4, max: 10, utilization: 0.4 },
    anomalies: { size: 2, max: 10, utilization: 0.2 },
    insights: { size: 1, max: 10, utilization: 0.1 },
  });
  eventBusMock.getStats.mockReturnValue({ replayBufferSize: 12 });
  eventBusMock.getPatternCacheStats.mockReturnValue({ size: 20 });
  cacheSnapshotMock.mockReturnValue({ entryCount: 40 });
  logBufferMock.getStats.mockReturnValue({ buffered: 5, totalMessages: 10 });
  aiLogStatsMock.mockReturnValue({ bufferSize: 4 });
  lokiBackendMock.getDetailedStatus.mockReturnValue({
    queue: { depth: 12, capacity: 100 },
  });
  resilientBufferMock.mockReturnValue({ pendingWrites: 50 });
  patternDetectorMock.mockReturnValue({ recentErrorsCount: 20, fingerprintKeysTotal: 100 });
  errorBrainCacheMock.mockReturnValue({ estimatedSizeBytes: 1024, maxSizeBytes: 2048 });
  monitoringCacheMock.mockReturnValue({ fingerprintCache: { size: 10, capacity: 500 } });
  formatBytesMock.mockImplementation((value: number) => `${value} B`);
  auditTrailMock.mockReturnValue([{}, {}]);

  vi.spyOn(process, 'memoryUsage').mockReturnValue(defaultMemoryUsage);
});

describe('memory-metrics', () => {
  it('collects memory usage and applies status thresholds', async () => {
    const summary = await collectMemoryMetrics();

    expect(summary.rssMemoryMB).toBeCloseTo(100, 1);
    expect(summary.heapUsedMB).toBeCloseTo(50, 1);

    const resolverMetric = summary.boundedStructures.find(
      (metric) => metric.name === 'PlayerResolver.cache'
    );
    const casMetric = summary.boundedStructures.find(
      (metric) => metric.name === 'ContentAddressableStorage.blobs'
    );

    expect(resolverMetric?.status).toBe('warning');
    expect(casMetric?.status).toBe('critical');
  });

  it('adds warnings for high utilization and collection failures', async () => {
    cacheSnapshotMock.mockImplementationOnce(() => {
      throw new Error('snapshot failed');
    });

    const summary = await collectMemoryMetrics();

    expect(summary.warnings.some((warning) => warning.includes('PlayerResolver.cache'))).toBe(true);
    expect(summary.warnings.some((warning) => warning.includes('ContentAddressableStorage.blobs'))).toBe(true);
    expect(summary.warnings.some((warning) => warning.includes('SecurityCache'))).toBe(true);
  });

  it('formats memory metrics with bytes and warnings', () => {
    const formatted = formatMemoryMetrics({
      timestamp: new Date('2026-02-10T00:00:00Z'),
      rssMemoryMB: 123.4,
      heapUsedMB: 56.7,
      boundedStructures: [
        {
          name: 'ErrorBrain.cacheBytes',
          current: 1024,
          max: 2048,
          utilization: 50,
          status: 'healthy',
          unit: 'bytes',
        },
      ],
      warnings: ['Example warning'],
    });

    expect(formatted).toContain('RSS Memory: 123.4 MB');
    expect(formatted).toContain('ErrorBrain.cacheBytes: 1024 B/2048 B');
    expect(formatted).toContain('Warnings:');
  });

  it('includes EventBus and Loki metrics', async () => {
    const summary = await collectMemoryMetrics();

    const eventBusMetric = summary.boundedStructures.find(
      (metric) => metric.name === 'EventBus.replayBuffer'
    );
    const lokiMetric = summary.boundedStructures.find(
      (metric) => metric.name === 'Loki.queueDepth'
    );

    expect(eventBusMetric?.max).toBe(100);
    expect(lokiMetric?.max).toBe(100);
  });

  it('returns no warnings when utilization stays below thresholds', async () => {
    playerResolverMock.getCacheStats.mockReturnValue({ size: 10, max: 100, utilization: 10 });
    casMock.getStats.mockReturnValue({ total: 20, maxBlobs: 100, utilization: 20 });

    const summary = await collectMemoryMetrics();

    expect(summary.warnings).toEqual([]);
  });
});
