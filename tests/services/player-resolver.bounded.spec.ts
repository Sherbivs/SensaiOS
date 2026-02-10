/**
 * PlayerResolver cache bounds tests
 * @module tests/services/player-resolver.bounded
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/logging/index.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/shared/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/discord-identity.js', () => ({
  resolveDiscordUser: vi.fn().mockResolvedValue(null),
  hasDiscordIdentity: vi.fn().mockResolvedValue(false),
}));

import { prisma } from '../../src/shared/prisma.js';
import { PlayerResolver } from '../../src/services/player-resolver.js';

function seedFindUnique(): void {
  vi.mocked(prisma.user.findUnique).mockImplementation((args: any) => {
    const where = args.where;
    return Promise.resolve({
      id: `user-${where.discordId}`,
      discordId: where.discordId,
      coins: 100,
      createdAt: new Date('2026-02-10T00:00:00Z'),
      updatedAt: new Date('2026-02-10T00:00:00Z'),
      homesteadChannels: [],
    }) as any;
  });
}

describe('PlayerResolver cache bounds (MEMLEAK.PHASE2.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T00:00:00Z'));
    PlayerResolver.resetInstance();
    vi.mocked(prisma.user.findUnique).mockReset();
    seedFindUnique();
  });

  it('should enforce MAX_CACHE_SIZE and evict oldest entries', async () => {
    const resolver = PlayerResolver.getInstance();

    for (let i = 0; i < 1001; i++) {
      await resolver.resolve(`user-${i}`, { guildId: 'guild-1' });
    }

    const stats = resolver.getCacheStats();
    expect(stats.size).toBe(1000);
    expect(stats.max).toBe(1000);
  });

  it('should evict the least-recently-used entry', async () => {
    const resolver = PlayerResolver.getInstance();

    for (let i = 0; i < 1000; i++) {
      await resolver.resolve(`user-${i}`, { guildId: 'guild-1' });
    }

    await resolver.resolve('user-0', { guildId: 'guild-1' });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1000);

    await resolver.resolve('user-1000', { guildId: 'guild-1' });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1001);

    await resolver.resolve('user-1', { guildId: 'guild-1' });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1002);

    await resolver.resolve('user-0', { guildId: 'guild-1' });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1002);
  });

  it('should report utilization in cache stats', async () => {
    const resolver = PlayerResolver.getInstance();

    for (let i = 0; i < 500; i++) {
      await resolver.resolve(`user-${i}`, { guildId: 'guild-1' });
    }

    const stats = resolver.getCacheStats();
    expect(stats.size).toBe(500);
    expect(stats.utilization).toBe(50);
  });
});
