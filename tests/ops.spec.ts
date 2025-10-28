import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { isAdmin, handleOpsCommand } from '../src/bot/ops/admin';

function mockInteraction(userId: string, isAdminPerm = false): ChatInputCommandInteraction {
  return {
    user: { id: userId } as any,
    member: isAdminPerm ? ({ permissions: { has: () => true } } as any) : ({} as any),
  } as ChatInputCommandInteraction;
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

    const battleCount = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(7);
    const prisma = {
      user: { count: vi.fn().mockResolvedValue(3) },
      encounter: { count: vi.fn().mockResolvedValue(1) },
      battle: {
        count: battleCount,
        findMany: vi.fn().mockResolvedValue([
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
        ]),
      },
      cooldown: { count: vi.fn().mockResolvedValue(6) },
    } as any;

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

    const battleCount = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(10);
    const prisma = {
      user: { count: vi.fn().mockResolvedValue(3) },
      encounter: { count: vi.fn().mockResolvedValue(1) },
      battle: {
        count: battleCount,
        findMany: vi.fn().mockResolvedValue([
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
        ]),
      },
      cooldown: { count: vi.fn().mockResolvedValue(4) },
    } as any;

    await handleOpsCommand(interaction, {
      prismaFactory: async () => prisma,
    });

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const call = prisma.battle.findMany.mock.calls[0][0];
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

    const battleCount = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(9);
    const prisma = {
      user: { count: vi.fn().mockResolvedValue(3) },
      encounter: { count: vi.fn().mockResolvedValue(1) },
      battle: {
        count: battleCount,
        findMany: vi.fn().mockResolvedValue([]),
      },
      cooldown: { count: vi.fn().mockResolvedValue(4) },
    } as any;

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

    const battleCount = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(4);
    const prisma = {
      user: { count: vi.fn().mockResolvedValue(2) },
      encounter: { count: vi.fn().mockResolvedValue(0) },
      battle: {
        count: battleCount,
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'battle-filtered',
            endedAt: new Date('2025-10-26T03:00:00Z'),
            resultJson: { winner: { discordId: '123456789012345678' }, loser: { discordId: 'opponent' }, rewards: null, reason: 'victory', turnCount: 5 },
          },
        ]),
      },
      cooldown: { count: vi.fn().mockResolvedValue(0) },
    } as any;

    await handleOpsCommand(interaction, {
      prismaFactory: async () => prisma,
    });

    const finishedCall = prisma.battle.count.mock.calls[1][0];
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

    const battleCount = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    const prisma = {
      user: { count: vi.fn().mockResolvedValue(1) },
      encounter: { count: vi.fn().mockResolvedValue(0) },
      battle: {
        count: battleCount,
        findMany: vi.fn().mockResolvedValue([]),
      },
      cooldown: { count: vi.fn().mockResolvedValue(0) },
    } as any;

    await handleOpsCommand(interaction, {
      prismaFactory: async () => prisma,
    });

    const content: string = editReply.mock.calls[0][0].content;
    expect(content).toContain('Finished Battles: total 0 | showing 0/5 | after none | participant <@876543210987654321>');
    expect(content).toContain('none recorded for <@876543210987654321>');
  });
});
