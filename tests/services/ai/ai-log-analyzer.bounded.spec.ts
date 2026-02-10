import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '../../../src/services/ai/ai-log-writer.js';

const prismaMock = {
  cacheEntry: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock('../../../src/shared/prisma.js', () => ({
  prisma: prismaMock,
}));

type SerializedKnowledgeBase = {
  errorPatterns: Array<[string, unknown]>;
  performanceBaselines: Array<[string, unknown]>;
  userBehaviorPatterns: Array<[string, unknown]>;
  correlations: Array<[string, unknown]>;
  anomalies: unknown[];
  insights: unknown[];
  lastUpdate: number;
  stats: {
    logsAnalyzed: number;
    patternsDetected: number;
    anomaliesDetected: number;
    insightsGenerated: number;
    correlationsFound: number;
    learningUpdates: number;
  };
};

const BASE_STATS = {
  logsAnalyzed: 0,
  patternsDetected: 0,
  anomaliesDetected: 0,
  insightsGenerated: 0,
  correlationsFound: 0,
  learningUpdates: 0,
};

function buildSerializedKnowledgeBase(options: {
  errorPatterns?: number;
  performanceBaselines?: number;
  userBehaviorPatterns?: number;
  correlations?: number;
  anomalies?: number;
  insights?: number;
}): SerializedKnowledgeBase {
  const {
    errorPatterns = 0,
    performanceBaselines = 0,
    userBehaviorPatterns = 0,
    correlations = 0,
    anomalies = 0,
    insights = 0,
  } = options;

  return {
    errorPatterns: Array.from({ length: errorPatterns }, (_, index) => [
      `Error${index}:Pattern ${index}`,
      {
        pattern: `Pattern ${index}`,
        errorName: `Error${index}`,
        totalOccurrences: 10,
        firstDetected: new Date(0).toISOString(),
        lastSeen: new Date(1).toISOString(),
        files: [],
        occurrences: [{
          timestamp: Date.now(),
          count: 10,
          timeWindow: 1000,
        }],
      },
    ]),
    performanceBaselines: Array.from({ length: performanceBaselines }, (_, index) => [
      `op-${index}`,
      {
        operation: `op-${index}`,
        avg: 10,
        p95: index === 0 ? 1200 : 50,
        measurements: 10,
        firstMeasured: new Date(0).toISOString(),
        lastUpdate: Date.now(),
      },
    ]),
    userBehaviorPatterns: Array.from({ length: userBehaviorPatterns }, (_, index) => [
      `user-${index}`,
      { score: index },
    ]),
    correlations: Array.from({ length: correlations }, (_, index) => [
      `event-${index}`,
      {
        event1: `ERROR:${index}`,
        event2: `WARN:${index}`,
        count: 3,
        avgTimeDelta: 10,
        timeDeltaSum: 30,
        lastDetected: Date.now(),
      },
    ]),
    anomalies: Array.from({ length: anomalies }, (_, index) => ({
      level: 'ERROR',
      count: 50 + index,
      baseline: 10,
      threshold: 20,
      deviation: 2,
      hour: index,
      detectedAt: Date.now(),
    })),
    insights: Array.from({ length: insights }, (_, index) => ({
      id: `insight-${index}`,
      type: 'recurring_error',
      severity: 'high',
      title: `Insight ${index}`,
      description: 'Test insight',
      recommendation: 'Test recommendation',
      data: { index },
      generatedAt: Date.now(),
    })),
    lastUpdate: Date.now(),
    stats: { ...BASE_STATS },
  };
}

function createLogEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    timestampMs: Date.now(),
    level: 'ERROR',
    category: 'error',
    correlationId: 'corr-1',
    message: 'Test error',
    context: {
      file: 'src/services/ai/ai-log-analyzer.ts',
      line: 1,
      function: 'test',
      stack: [],
    },
    process: {
      pid: 1,
      uptime: 1,
      memory: {
        rss: 1,
        heapTotal: 1,
        heapUsed: 1,
        external: 1,
        arrayBuffers: 1,
      },
      hostname: 'test',
    },
    data: {},
    tags: [],
    ...overrides,
  };
}

function mockFindUnique(value: SerializedKnowledgeBase | null): void {
  prismaMock.cacheEntry.findUnique.mockResolvedValue(value ? { value } : null);
}

function mockLogBatch(entries: LogEntry[]): void {
  prismaMock.cacheEntry.findMany.mockResolvedValue([
    {
      value: {
        _type: 'ai_log_batch',
        entries,
        category: 'error',
        created: new Date().toISOString(),
      },
    },
  ]);
}

async function loadAnalyzer() {
  return await import('../../../src/services/ai/ai-log-analyzer.js');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  prismaMock.cacheEntry.findMany.mockResolvedValue([]);
  prismaMock.cacheEntry.findUnique.mockResolvedValue(null);
});

describe('ai-log-analyzer knowledge base bounds', () => {
  it('caps error patterns on load', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ errorPatterns: 501 }));
    const { loadKnowledgeBase, getKnowledgeBaseMetrics } = await loadAnalyzer();

    await loadKnowledgeBase();

    const metrics = getKnowledgeBaseMetrics();
    expect(metrics.errorPatterns.size).toBe(metrics.errorPatterns.max);
  });

  it('caps performance baselines on load', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ performanceBaselines: 501 }));
    const { loadKnowledgeBase, getKnowledgeBaseMetrics } = await loadAnalyzer();

    await loadKnowledgeBase();

    const metrics = getKnowledgeBaseMetrics();
    expect(metrics.performanceBaselines.size).toBe(metrics.performanceBaselines.max);
  });

  it('caps user behavior patterns on load', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ userBehaviorPatterns: 501 }));
    const { loadKnowledgeBase, getKnowledgeBaseMetrics } = await loadAnalyzer();

    await loadKnowledgeBase();

    const metrics = getKnowledgeBaseMetrics();
    expect(metrics.userBehaviorPatterns.size).toBe(metrics.userBehaviorPatterns.max);
  });

  it('caps correlations on load', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ correlations: 501 }));
    const { loadKnowledgeBase, getKnowledgeBaseMetrics } = await loadAnalyzer();

    await loadKnowledgeBase();

    const metrics = getKnowledgeBaseMetrics();
    expect(metrics.correlations.size).toBe(metrics.correlations.max);
  });

  it('caps anomalies on load', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ anomalies: 205 }));
    const { loadKnowledgeBase, getKnowledgeBaseMetrics } = await loadAnalyzer();

    await loadKnowledgeBase();

    const metrics = getKnowledgeBaseMetrics();
    expect(metrics.anomalies.size).toBe(metrics.anomalies.max);
  });

  it('caps insights on load', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ insights: 205 }));
    const { loadKnowledgeBase, getKnowledgeBaseMetrics } = await loadAnalyzer();

    await loadKnowledgeBase();

    const metrics = getKnowledgeBaseMetrics();
    expect(metrics.insights.size).toBe(metrics.insights.max);
  });

  it('reports utilization for capped error patterns', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ errorPatterns: 500 }));
    const { loadKnowledgeBase, getKnowledgeBaseMetrics } = await loadAnalyzer();

    await loadKnowledgeBase();

    const metrics = getKnowledgeBaseMetrics();
    expect(metrics.errorPatterns.utilization).toBeCloseTo(1);
  });

  it('reports utilization for capped anomalies', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ anomalies: 200 }));
    const { loadKnowledgeBase, getKnowledgeBaseMetrics } = await loadAnalyzer();

    await loadKnowledgeBase();

    const metrics = getKnowledgeBaseMetrics();
    expect(metrics.anomalies.utilization).toBeCloseTo(1);
  });

  it('keeps refreshed error patterns when evicting', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ errorPatterns: 500 }));
    const { loadKnowledgeBase, detectErrorPatterns, generateInsights } = await loadAnalyzer();

    await loadKnowledgeBase();

    const entries = [
      createLogEntry({
        message: 'Pattern 0',
        error: { name: 'Error0' } as unknown as LogEntry['error'],
      }),
      createLogEntry({
        message: 'Pattern 0',
        error: { name: 'Error0' } as unknown as LogEntry['error'],
      }),
      createLogEntry({
        message: 'Pattern 0',
        error: { name: 'Error0' } as unknown as LogEntry['error'],
      }),
      createLogEntry({
        message: 'Pattern 0',
        error: { name: 'Error0' } as unknown as LogEntry['error'],
      }),
      createLogEntry({
        message: 'New Pattern',
        error: { name: 'ErrorNew' } as unknown as LogEntry['error'],
      }),
      createLogEntry({
        message: 'New Pattern',
        error: { name: 'ErrorNew' } as unknown as LogEntry['error'],
      }),
      createLogEntry({
        message: 'New Pattern',
        error: { name: 'ErrorNew' } as unknown as LogEntry['error'],
      }),
    ];

    mockLogBatch(entries);

    await detectErrorPatterns();
    const insights = await generateInsights();

    expect(insights.some((insight) => insight.title.includes('Error0'))).toBe(true);
  });

  it('keeps refreshed performance baselines when evicting', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ performanceBaselines: 500 }));
    const { loadKnowledgeBase, detectPerformancePatterns, generateInsights } = await loadAnalyzer();

    await loadKnowledgeBase();

    const entries = [
      createLogEntry({
        level: 'INFO',
        category: 'performance',
        message: 'op-0',
        data: { operation: 'op-0', duration: 1500 },
      }),
      createLogEntry({
        level: 'INFO',
        category: 'performance',
        message: 'op-0',
        data: { operation: 'op-0', duration: 1600 },
      }),
      createLogEntry({
        level: 'INFO',
        category: 'performance',
        message: 'op-0',
        data: { operation: 'op-0', duration: 1700 },
      }),
      createLogEntry({
        level: 'INFO',
        category: 'performance',
        message: 'op-new',
        data: { operation: 'op-new', duration: 20 },
      }),
      createLogEntry({
        level: 'INFO',
        category: 'performance',
        message: 'op-new',
        data: { operation: 'op-new', duration: 22 },
      }),
      createLogEntry({
        level: 'INFO',
        category: 'performance',
        message: 'op-new',
        data: { operation: 'op-new', duration: 24 },
      }),
    ];

    mockLogBatch(entries);

    await detectPerformancePatterns();
    const insights = await generateInsights();

    expect(insights.some((insight) => insight.title.includes('op-0'))).toBe(true);
  });

  it('caps stored insights after generation', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ errorPatterns: 500, insights: 200 }));
    const { loadKnowledgeBase, generateInsights, getKnowledgeBaseMetrics } = await loadAnalyzer();

    await loadKnowledgeBase();
    await generateInsights();

    const metrics = getKnowledgeBaseMetrics();
    expect(metrics.insights.size).toBe(metrics.insights.max);
  });

  it('adds correlations without exceeding bounds', async () => {
    mockFindUnique(buildSerializedKnowledgeBase({ correlations: 500 }));
    const { loadKnowledgeBase, findCorrelations, getKnowledgeBaseMetrics } = await loadAnalyzer();

    await loadKnowledgeBase();

    const baseTime = Date.now();
    const entries: LogEntry[] = [];

    for (let i = 0; i < 3; i += 1) {
      entries.push(
        createLogEntry({
          timestamp: new Date(baseTime + i * 1000).toISOString(),
          level: 'ERROR',
          category: 'system',
          message: 'system-error',
        }),
        createLogEntry({
          timestamp: new Date(baseTime + i * 1000 + 500).toISOString(),
          level: 'WARN',
          category: 'database',
          message: 'db-warning',
        })
      );
    }

    mockLogBatch(entries);

    await findCorrelations();

    const metrics = getKnowledgeBaseMetrics();
    expect(metrics.correlations.size).toBe(metrics.correlations.max);
  });
});
