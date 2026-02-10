/**
 * Discord identity cache bounds tests
 * @module tests/services/discord-identity.bounded
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
    discordMember: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    discordGuild: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/shared/prisma.js';
import { DiscordIdentityService } from '../../src/services/discord-identity.js';

function makeMember(discordUserId: string, guildId: string) {
  return {
    id: `member-${discordUserId}`,
    discordUserId,
    guildId,
    username: `user-${discordUserId}`,
    displayName: null,
    avatar: null,
    bot: false,
    joinedAt: null,
    roles: [],
    isAdministrator: false,
    isOwner: false,
    riskScore: null,
    lastActivityAt: null,
    lastUpdatedAt: new Date('2026-02-10T00:00:00Z'),
  };
}

function makeGuild(guildId: string) {
  return {
    id: guildId,
    name: `guild-${guildId}`,
    ownerId: 'owner-1',
    icon: null,
    memberCount: 100,
    roleCount: 5,
    channelCount: 10,
    monitoringEnabled: true,
    lastSweepAt: null,
    lastUpdatedAt: new Date('2026-02-10T00:00:00Z'),
  };
}

describe('DiscordIdentityService cache bounds (MEMLEAK.PHASE2.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T00:00:00Z'));
    DiscordIdentityService.resetInstance();
    vi.mocked(prisma.discordMember.findUnique).mockReset();
    vi.mocked(prisma.discordGuild.findUnique).mockReset();

    vi.mocked(prisma.discordMember.findUnique).mockImplementation((args: any) => {
      const where = args.where;
      return Promise.resolve(makeMember(where.discordUserId_guildId.discordUserId, where.discordUserId_guildId.guildId)) as any;
    });

    vi.mocked(prisma.discordGuild.findUnique).mockImplementation((args: any) => {
      const where = args.where;
      return Promise.resolve(makeGuild(where.id)) as any;
    });
  });

  it('should enforce MAX_USER_CACHE_SIZE and evict oldest entries', async () => {
    const service = DiscordIdentityService.getInstance();

    for (let i = 0; i < 501; i++) {
      await service.getUserByDiscordId(`user-${i}`, 'guild-1');
    }

    const stats = service.getCacheStats();
    expect(stats.users.size).toBe(500);
    expect(stats.users.max).toBe(500);
  });

  it('should refresh LRU order on user cache hits', async () => {
    const service = DiscordIdentityService.getInstance();

    for (let i = 0; i < 500; i++) {
      await service.getUserByDiscordId(`user-${i}`, 'guild-1');
    }

    await service.getUserByDiscordId('user-0', 'guild-1');
    expect(prisma.discordMember.findUnique).toHaveBeenCalledTimes(500);

    await service.getUserByDiscordId('user-500', 'guild-1');
    expect(prisma.discordMember.findUnique).toHaveBeenCalledTimes(501);

    await service.getUserByDiscordId('user-1', 'guild-1');
    expect(prisma.discordMember.findUnique).toHaveBeenCalledTimes(502);

    await service.getUserByDiscordId('user-0', 'guild-1');
    expect(prisma.discordMember.findUnique).toHaveBeenCalledTimes(502);
  });

  it('should enforce MAX_GUILD_CACHE_SIZE and evict oldest entries', async () => {
    const service = DiscordIdentityService.getInstance();

    for (let i = 0; i < 501; i++) {
      await service.getGuild(`guild-${i}`);
    }

    const stats = service.getCacheStats();
    expect(stats.guilds.size).toBe(500);
    expect(stats.guilds.max).toBe(500);
  });

  it('should report utilization metrics', async () => {
    const service = DiscordIdentityService.getInstance();

    for (let i = 0; i < 250; i++) {
      await service.getUserByDiscordId(`user-${i}`, 'guild-1');
    }

    for (let i = 0; i < 100; i++) {
      await service.getGuild(`guild-${i}`);
    }

    const stats = service.getCacheStats();
    expect(stats.users.utilization).toBe(50);
    expect(stats.guilds.utilization).toBe(20);
  });
});
