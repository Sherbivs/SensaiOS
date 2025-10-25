import { describe, it, expect } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { isAdmin } from '../src/bot/ops/admin';

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
