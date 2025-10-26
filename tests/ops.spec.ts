import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

    const prisma = {
      user: { count: vi.fn().mockResolvedValue(3) },
      encounter: { count: vi.fn().mockResolvedValue(1) },
      battle: {
        count: vi.fn().mockResolvedValue(2),
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
    expect(content).toContain('Recent Battles:');
    expect(content).toContain('battle-1');
    expect(content).toContain('<@winner> over <@loser>');
    expect(content).toContain('rewards +75/+18');
  });

  it('handles missing database gracefully', async () => {
    const { interaction, editReply } = baseInteraction();

    await handleOpsCommand(interaction, {
      prismaFactory: async () => null,
    });

    const content: string = editReply.mock.calls[0][0].content;
    expect(content).toContain('unavailable (database not configured)');
  });
});
