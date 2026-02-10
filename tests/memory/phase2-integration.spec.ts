/**
 * Phase 2 integration test — bounded memory safety for C3/C4/C8/C9/C10
 * @module tests/memory/phase2-integration
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  discordMember: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
  },
  discordGuild: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  cacheEntry: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
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

import { ContentAddressableStorage } from '../../src/sensaios/storage/content-addressable.js';
import { getPlayerResolver, PlayerResolver } from '../../src/services/player-resolver.js';
import { DiscordIdentityService, getDiscordIdentityService } from '../../src/services/discord-identity.js';
import {
  getKnowledgeBaseMetrics,
  loadKnowledgeBase,
} from '../../src/services/ai/ai-log-analyzer.js';
import {
  MAX_FINGERPRINTS as PATTERN_MAX_FINGERPRINTS,
  clearAllPatternState,
  getPatternDetectorStats,
  recordFingerprintForTesting,
} from '../../src/services/error-brain/pattern-detector.js';
import {
  MAX_FINGERPRINTS as IMPACT_MAX_FINGERPRINTS,
  clearAllImpactState,
  getImpactPredictorStats,
  recordErrorCount,
} from '../../src/services/error-brain/impact-predictor.js';

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

function buildSerializedKnowledgeBase(counts: {
  errorPatterns: number;
  performanceBaselines: number;
  userBehaviorPatterns: number;
  correlations: number;
  anomalies: number;
  insights: number;
}): SerializedKnowledgeBase {
  return {
    errorPatterns: Array.from({ length: counts.errorPatterns }, (_, index) => [
      `Error${index}:Pattern ${index}`,
      {
        pattern: `Pattern ${index}`,
        errorName: `Error${index}`,
        totalOccurrences: 5,
        firstDetected: new Date(0).toISOString(),
        lastSeen: new Date(1).toISOString(),
        files: [],
        occurrences: [{
          timestamp: Date.now(),
          count: 5,
          timeWindow: 1000,
        }],
      },
    ]),
    performanceBaselines: Array.from({ length: counts.performanceBaselines }, (_, index) => [
      `op-${index}`,
      {
        operation: `op-${index}`,
        avg: 100,
        p95: 200,
        measurements: 10,
        firstMeasured: new Date(0).toISOString(),
        lastUpdate: Date.now(),
      },
    ]),
    userBehaviorPatterns: Array.from({ length: counts.userBehaviorPatterns }, (_, index) => [
      `user-${index}`,
      { score: index },
    ]),
    correlations: Array.from({ length: counts.correlations }, (_, index) => [
      `correlation-${index}`,
      {
        event1: `ERROR:${index}`,
        event2: `WARN:${index}`,
        count: 3,
        avgTimeDelta: 10,
        timeDeltaSum: 30,
        lastDetected: Date.now(),
      },
    ]),
    anomalies: Array.from({ length: counts.anomalies }, (_, index) => ({
      level: 'ERROR',
      count: 10 + index,
      baseline: 3,
      threshold: 8,
      deviation: 2,
      hour: index,
      detectedAt: Date.now(),
    })),
    insights: Array.from({ length: counts.insights }, (_, index) => ({
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

beforeEach(() => {
  PlayerResolver.resetInstance();
  DiscordIdentityService.resetInstance();
  clearAllPatternState();
  clearAllImpactState();
  vi.clearAllMocks();

  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { discordId: string } }) => ({
    id: `user-${where.discordId}`,
    discordId: where.discordId,
    coins: 100,
    createdAt: new Date(0),
    updatedAt: new Date(1),
    homesteadChannels: [],
  }));

  prismaMock.discordMember.findUnique.mockImplementation(async ({ where }: { where: { discordUserId_guildId: { discordUserId: string; guildId: string } } }) => ({
    id: `member-${where.discordUserId_guildId.discordUserId}`,
    discordUserId: where.discordUserId_guildId.discordUserId,
    guildId: where.discordUserId_guildId.guildId,
    username: `user-${where.discordUserId_guildId.discordUserId}`,
    displayName: null,
    avatar: null,
    bot: false,
    joinedAt: null,
    roles: [],
    isAdministrator: false,
    isOwner: false,
    riskScore: null,
    lastActivityAt: null,
    lastUpdatedAt: new Date(0),
  }));

  prismaMock.discordGuild.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    name: `guild-${where.id}`,
    ownerId: 'owner',
    icon: null,
    memberCount: 10,
    roleCount: 1,
    channelCount: 1,
    monitoringEnabled: true,
    lastSweepAt: null,
    lastUpdatedAt: new Date(0),
  }));

  prismaMock.cacheEntry.findUnique.mockResolvedValue({
    value: buildSerializedKnowledgeBase({
      errorPatterns: 200,
      performanceBaselines: 200,
      userBehaviorPatterns: 200,
      correlations: 200,
      anomalies: 80,
      insights: 80,
    }),
  });
});

describe('Phase 2 integration — bounded memory safety', () => {
  it('keeps all Phase 2 structures below 90% utilization under normal load', async () => {
    const resolver = getPlayerResolver();
    const guildId = 'guild-1';

    for (let i = 0; i < 700; i += 1) {
      await resolver.resolve(`discord-${i}`, {
        guildId,
        skipIdentity: true,
        skipHomestead: true,
      });
    }

    const resolverStats = resolver.getCacheStats();
    expect(resolverStats.utilization).toBeLessThan(90);

    const identity = getDiscordIdentityService();
    for (let i = 0; i < 400; i += 1) {
      await identity.getUserByDiscordId(`user-${i}`, guildId);
      await identity.getGuild(`guild-${i}`);
    }

    const identityStats = identity.getCacheStats();
    expect(identityStats.users.utilization).toBeLessThan(90);
    expect(identityStats.guilds.utilization).toBeLessThan(90);

    const cas = new ContentAddressableStorage({ maxBlobs: 100 });
    for (let i = 0; i < 80; i += 1) {
      await cas.put(Buffer.from(`blob-${i}`));
    }

    const casStats = cas.getStats();
    expect(casStats.utilization).toBeLessThan(90);

    await loadKnowledgeBase();
    const knowledgeMetrics = getKnowledgeBaseMetrics();
    expect(knowledgeMetrics.errorPatterns.utilization).toBeLessThan(0.9);
    expect(knowledgeMetrics.performanceBaselines.utilization).toBeLessThan(0.9);
    expect(knowledgeMetrics.userBehaviorPatterns.utilization).toBeLessThan(0.9);
    expect(knowledgeMetrics.correlations.utilization).toBeLessThan(0.9);
    expect(knowledgeMetrics.anomalies.utilization).toBeLessThan(0.9);
    expect(knowledgeMetrics.insights.utilization).toBeLessThan(0.9);

    const maxPatternFingerprints = Math.floor(PATTERN_MAX_FINGERPRINTS * 0.4);
    for (let i = 0; i < maxPatternFingerprints; i += 1) {
      recordFingerprintForTesting(`fingerprint-${i}`);
    }

    const patternStats = getPatternDetectorStats();
    expect(patternStats.fingerprintKeysTotal).toBeLessThanOrEqual(PATTERN_MAX_FINGERPRINTS * 0.9);

    const maxImpactFingerprints = Math.floor(IMPACT_MAX_FINGERPRINTS * 0.7);
    for (let i = 0; i < maxImpactFingerprints; i += 1) {
      recordErrorCount(`impact-${i}`, 1);
    }

    const impactStats = getImpactPredictorStats();
    expect(impactStats.fingerprintsWithHistory).toBeLessThanOrEqual(IMPACT_MAX_FINGERPRINTS * 0.9);
  });
});
