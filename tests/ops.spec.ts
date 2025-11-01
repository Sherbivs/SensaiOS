import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { isAdmin, handleOpsCommand } from '../src/bot/ops/admin';
import * as cacheFacade from '../src/services/cache/facade';

function mockInteraction(userId: string, isAdminPerm = false): ChatInputCommandInteraction {
  return {
    user: { id: userId } as any,
    member: isAdminPerm ? ({ permissions: { has: () => true } } as any) : ({} as any),
  } as ChatInputCommandInteraction;
}

function createPrismaStatsMock() {
  return {
    user: { count: vi.fn().mockResolvedValue(0) },
    encounter: { count: vi.fn().mockResolvedValue(0) },
    battle: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    cooldown: { count: vi.fn().mockResolvedValue(0) },
    busMessage: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  } as any;
}

function cacheInteraction(cleanup = false) {
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);

  const interaction: ChatInputCommandInteraction = {
    user: { id: 'admin-user' } as any,
    member: { permissions: { has: () => true } } as any,
    options: {
      getSubcommand: vi.fn().mockReturnValue('cache'),
      getSubcommandGroup: vi.fn().mockReturnValue(null),
      getBoolean: vi.fn().mockReturnValue(cleanup),
      getUser: vi.fn(),
      getInteger: vi.fn(),
      getString: vi.fn(),
    } as any,
    deferReply: deferReply as any,
    editReply: editReply as any,
    reply: reply as any,
  } as ChatInputCommandInteraction;

  return { interaction, deferReply, editReply, reply };
}

describe('/ops admin gating', () => {
  it('allows administrators via guild permission', () => {
    const ix = mockInteraction('123', true);
    expect(isAdmin(ix)).toBe(true);
  });

  it('allows users listed in ADMIN_USER_IDS env var', () => {
    const prev = process.env.ADMIN_USER_IDS;
    process.env.ADMIN_USER_IDS = 'u1,u2';
    const ix = mockInteraction('u2', false);
    expect(isAdmin(ix)).toBe(true);
    process.env.ADMIN_USER_IDS = prev;
  });

  it('denies others by default', () => {
    const ix = mockInteraction('not-admin', false);
    expect(isAdmin(ix)).toBe(false);
  });
});

describe('/ops stats reporting', () => {
  const baseInteraction = () => {
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const reply = vi.fn().mockResolvedValue(undefined);

    const interaction: ChatInputCommandInteraction = {
      user: { id: 'admin-user' } as any,
      member: { permissions: { has: () => true } } as any,
      options: {
        getSubcommand: vi.fn().mockReturnValue('stats'),
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getUser: vi.fn(),
        getInteger: vi.fn().mockReturnValue(null),
        getString: vi.fn((name: string) => null),
      } as any,
      deferReply: deferReply as any,
      editReply: editReply as any,
      reply: reply as any,
    } as ChatInputCommandInteraction;

    return { interaction, deferReply, editReply, reply };
  };

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows counts and recent battles when Prisma is available', async () => {
    const { interaction, editReply, deferReply } = baseInteraction();

    const prisma = createPrismaStatsMock();
    (prisma.user.count as Mock).mockResolvedValue(3);
    (prisma.encounter.count as Mock).mockResolvedValue(1);
    (prisma.battle.count as Mock).mockResolvedValueOnce(2).mockResolvedValueOnce(7);
    (prisma.battle.findMany as Mock).mockResolvedValue([
      {
        id: 'battle-1',
        endedAt: new Date('2025-10-26T01:00:00Z'),
        resultJson: {
          reason: 'victory',
          turnCount: 4,
          winner: { discordId: 'winner' },
          loser: { discordId: 'loser' },
          rewards: { winner: 75, loser: 18 },
        },
      },
    ]);
    (prisma.cooldown.count as Mock).mockResolvedValue(6);
    (prisma.busMessage.count as Mock).mockResolvedValue(2);
    (prisma.busMessage.findFirst as Mock).mockResolvedValue({ processedAt: new Date('2025-10-26T01:05:00Z') });

    await handleOpsCommand(interaction, {
      prismaFactory: async () => prisma,
    });

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(prisma.battle.findMany).toHaveBeenCalled();
    const content: string = editReply.mock.calls[0][0].content;
    expect(content).toContain('Users: 3');
    expect(content).toContain('Finished Battles: total 7 | showing 1/5 | after none | participant all');
    expect(content).toContain('Recent Battles:');
    expect(content).toContain('battle-1');
    expect(content).toContain('<@winner> over <@loser>');
    expect(content).toContain('rewards +75/+18');
  });

  it('applies limit and after filters when provided', async () => {
    const { interaction, editReply, deferReply } = baseInteraction();
    const getIntegerMock = interaction.options.getInteger as unknown as Mock;
    const getStringMock = interaction.options.getString as unknown as Mock;
    getIntegerMock.mockReturnValue(2);
    getStringMock.mockImplementation((name: string) => (name === 'after' ? '2025-10-26T00:30:00Z' : null));

    const prisma = createPrismaStatsMock();
    (prisma.user.count as Mock).mockResolvedValue(3);
    (prisma.encounter.count as Mock).mockResolvedValue(1);
    (prisma.battle.count as Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(10);
    (prisma.battle.findMany as Mock).mockResolvedValue([
      {
        id: 'battle-2',
        endedAt: new Date('2025-10-26T01:10:00Z'),
        resultJson: { winner: { discordId: 'w1' }, loser: { discordId: 'l1' }, rewards: { winner: 50, loser: 20 }, reason: 'victory', turnCount: 6 },
      },
      {
        id: 'battle-3',
        endedAt: new Date('2025-10-26T00:45:00Z'),
        resultJson: { winner: { discordId: 'w2' }, loser: { discordId: 'l2' }, rewards: { winner: 60, loser: 10 }, reason: 'forfeit', turnCount: 2 },
      },
    ]);
    (prisma.cooldown.count as Mock).mockResolvedValue(4);

    await handleOpsCommand(interaction, {
      prismaFactory: async () => prisma,
    });

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const call = (prisma.battle.findMany as Mock).mock.calls[0][0];
    expect(call.take).toBe(2);
    expect(call.where.state).toBe('Finished');
    expect(call.where.endedAt.gt instanceof Date).toBe(true);
    expect((call.where.endedAt.gt as Date).toISOString()).toBe('2025-10-26T00:30:00.000Z');

    const content: string = editReply.mock.calls[0][0].content;
    expect(content).toContain('Finished Battles: total 10 | showing 2/2 | after 2025-10-26T00:30:00.000Z | participant all');
    expect(content).toContain('battle-2');
    expect(content).toContain('battle-3');
  });

  it('reports when no battles exist in the selected window', async () => {
    const { interaction, editReply } = baseInteraction();
    const getStringMock = interaction.options.getString as unknown as Mock;
    getStringMock.mockImplementation((name: string) => (name === 'after' ? '2025-10-26T02:00:00Z' : null));

    const prisma = createPrismaStatsMock();
    (prisma.user.count as Mock).mockResolvedValue(3);
    (prisma.encounter.count as Mock).mockResolvedValue(1);
    (prisma.battle.count as Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(9);
    (prisma.battle.findMany as Mock).mockResolvedValue([]);
    (prisma.cooldown.count as Mock).mockResolvedValue(4);

    await handleOpsCommand(interaction, {
      prismaFactory: async () => prisma,
    });

    const content: string = editReply.mock.calls[0][0].content;
    expect(content).toContain('Finished Battles: total 9 | showing 0/5 | after 2025-10-26T02:00:00.000Z | participant all');
    expect(content).toContain('none recorded in the selected window');
  });

  it('handles missing database gracefully', async () => {
    const { interaction, editReply } = baseInteraction();

    await handleOpsCommand(interaction, {
      prismaFactory: async () => null,
    });

    const content: string = editReply.mock.calls[0][0].content;
    expect(content).toContain('Finished Battles: total n/a | showing 0/5 | after none | participant all');
    expect(content).toContain('unavailable (database not configured)');
  });

  it('filters battles by participant mention when provided', async () => {
    const { interaction, editReply } = baseInteraction();
    const getStringMock = interaction.options.getString as unknown as Mock;
    getStringMock.mockImplementation((name: string) => {
      if (name === 'participant') {
        return '<@123456789012345678>';
      }
      return null;
    });

    const prisma = createPrismaStatsMock();
    (prisma.user.count as Mock).mockResolvedValue(2);
    (prisma.encounter.count as Mock).mockResolvedValue(0);
    (prisma.battle.count as Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(4);
    (prisma.battle.findMany as Mock).mockResolvedValue([
      {
        id: 'battle-filtered',
        endedAt: new Date('2025-10-26T03:00:00Z'),
        resultJson: { winner: { discordId: '123456789012345678' }, loser: { discordId: 'opponent' }, rewards: null, reason: 'victory', turnCount: 5 },
      },
    ]);
    (prisma.cooldown.count as Mock).mockResolvedValue(0);

    await handleOpsCommand(interaction, {
      prismaFactory: async () => prisma,
    });

    const finishedCall = (prisma.battle.count as Mock).mock.calls[1][0];
    expect(finishedCall.where.OR).toEqual([
      { p1: { discordId: '123456789012345678' } },
      { p2: { discordId: '123456789012345678' } },
    ]);

    const content: string = editReply.mock.calls[0][0].content;
    expect(content).toContain('participant <@123456789012345678>');
    expect(content).toContain('<@123456789012345678> over <@opponent>');
  });

  it('rejects invalid participant values', async () => {
    const { interaction, editReply } = baseInteraction();
    const getStringMock = interaction.options.getString as unknown as Mock;
    getStringMock.mockImplementation((name: string) => (name === 'participant' ? 'bad value' : null));

    await handleOpsCommand(interaction, {
      prismaFactory: async () => null,
    });

    expect(editReply).toHaveBeenCalledWith({
      content: "Invalid 'participant' value. Provide a Discord ID or mention, e.g. 123456789012345678 or <@123456789012345678>.",
    });
  });

  it('scopes empty results messaging when participant filter is used', async () => {
    const { interaction, editReply } = baseInteraction();
    const getStringMock = interaction.options.getString as unknown as Mock;
    getStringMock.mockImplementation((name: string) => (name === 'participant' ? '<@876543210987654321>' : null));

    const prisma = createPrismaStatsMock();
    (prisma.user.count as Mock).mockResolvedValue(1);
    (prisma.encounter.count as Mock).mockResolvedValue(0);
    (prisma.battle.count as Mock).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    (prisma.battle.findMany as Mock).mockResolvedValue([]);
    (prisma.cooldown.count as Mock).mockResolvedValue(0);

    await handleOpsCommand(interaction, {
      prismaFactory: async () => prisma,
    });

    const content: string = editReply.mock.calls[0][0].content;
    expect(content).toContain('Finished Battles: total 0 | showing 0/5 | after none | participant <@876543210987654321>');
    expect(content).toContain('none recorded for <@876543210987654321>');
  });
});

describe('/ops cache reporting', () => {
  const sampleSnapshot = (): cacheFacade.CacheMetricsSnapshot => ({
    generatedAtIso: '2025-11-01T05:00:00Z',
    memory: { items: 4, bytes: 2048, maxItems: 512, maxBytes: 16 * 1024 * 1024 },
    disk: {
      entries: 3,
      bytes: 4096,
      approxFreeBytes: 50 * 1024 * 1024,
      maxAllowedBytes: 100 * 1024 * 1024,
      rootDir: '/Store/runtime-cache',
      oldestEntryIso: '2025-11-01T04:54:00Z',
      newestEntryIso: '2025-11-01T04:59:30Z',
    },
    maintenance: {
      runs: 5,
      lastRunIso: '2025-11-01T04:59:00Z',
      lastDurationMs: 1_200,
      lastReason: 'manual',
      lastError: null,
      pending: false,
      origin: 'snapshot',
    },
    namespaces: [
      {
        namespace: 'battle-state',
        memoryHits: 6,
        diskHits: 2,
        misses: 1,
        hydrations: 1,
        inflightWaits: 0,
        touches: 3,
        evictions: 0,
        diskPrunes: 0,
        diskCleanups: 0,
        writes: 4,
        lastHitIso: '2025-11-01T04:59:30Z',
        lastMissIso: '2025-11-01T04:52:00Z',
        lastHydratedIso: '2025-11-01T04:52:00Z',
        lastEvictedIso: null,
        lastCleanupIso: null,
        lastWriteIso: '2025-11-01T04:59:00Z',
        diskEntries: 2,
        diskBytes: 2048,
        oldestEntryIso: '2025-11-01T04:54:00Z',
        newestEntryIso: '2025-11-01T04:59:00Z',
      },
    ],
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports cache metrics without running cleanup', async () => {
    const { interaction, deferReply, editReply } = cacheInteraction(false);
    const snapshot = sampleSnapshot();
    const collectSpy = vi.spyOn(cacheFacade, 'collectCacheMetrics').mockResolvedValue(snapshot);
    const runSpy = vi.spyOn(cacheFacade, 'runCacheMaintenanceNow').mockResolvedValue();
    const startSpy = vi.spyOn(cacheFacade, 'startCacheMaintenanceScheduler').mockImplementation(() => {});

    await handleOpsCommand(interaction);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(startSpy).toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
    expect(collectSpy).toHaveBeenCalledWith(expect.objectContaining({ maintenanceReason: 'snapshot' }));

    const content: string = editReply.mock.calls[0][0].content;
    expect(content).toContain('Cache metrics snapshot');
    expect(content).toContain('Memory:');
    expect(content).toContain('Namespaces');
  });

  it('runs manual cleanup when requested', async () => {
    const { interaction, editReply } = cacheInteraction(true);
    const snapshot = sampleSnapshot();
    snapshot.maintenance.origin = 'manual';
    snapshot.maintenance.lastReason = 'manual';
    const collectSpy = vi.spyOn(cacheFacade, 'collectCacheMetrics').mockResolvedValue(snapshot);
    const runSpy = vi.spyOn(cacheFacade, 'runCacheMaintenanceNow').mockResolvedValue();
    vi.spyOn(cacheFacade, 'startCacheMaintenanceScheduler').mockImplementation(() => {});

    await handleOpsCommand(interaction);

    expect(runSpy).toHaveBeenCalledWith('manual');
    expect(collectSpy).toHaveBeenCalledWith(expect.objectContaining({ maintenanceReason: 'manual' }));

    const content: string = editReply.mock.calls[0][0].content;
    expect(content.startsWith('Cache metrics snapshot (cleanup triggered).')).toBe(true);
  });
});
