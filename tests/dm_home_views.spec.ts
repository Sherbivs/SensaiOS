import { describe, expect, test } from 'vitest';

import {
  BOX_PAGE_PREFIX,
  buildBoxView,
  buildPartyView,
  buildProfileView,
} from '../src/bot/homestead/home.js';
import type { TrainerHomeSnapshot, TrainerHomePokemon } from '../src/models/index.js';

function createPokemon(overrides: Partial<TrainerHomePokemon> = {}): TrainerHomePokemon {
  return {
    id: overrides.id ?? 'pokemon-1',
    speciesId: overrides.speciesId ?? 25,
    speciesName: overrides.speciesName ?? 'Pikachu',
    nickname: overrides.nickname ?? 'Sparky',
    level: overrides.level ?? 15,
    hp: overrides.hp ?? 42,
    maxHp: overrides.maxHp ?? 50,
    isShiny: overrides.isShiny ?? false,
    status: overrides.status ?? null,
    boxSlot: overrides.boxSlot ?? null,
    createdAt: overrides.createdAt ?? new Date('2025-10-20T08:00:00Z'),
  } satisfies TrainerHomePokemon;
}

function createSnapshot(overrides: Partial<TrainerHomeSnapshot> = {}): TrainerHomeSnapshot {
  const now = new Date('2025-10-26T12:00:00Z');
  return {
    user: {
      id: 'user-1',
      discordId: 'trainer-1',
      coins: 1275,
      dailyQuestStreak: 3,
      dailyQuestLastCompleted: new Date('2025-10-26T08:00:00Z'),
      dailyQuestLastReset: new Date('2025-10-20T08:00:00Z'),
      createdAt: new Date('2025-10-01T10:00:00Z'),
      ...overrides.user,
    },
    party: [
      { slot: 1, pokemon: createPokemon({ isShiny: true }) },
      { slot: 2, pokemon: null },
      ...(overrides.party ?? []),
    ],
    box: overrides.box ?? [
      createPokemon({ id: 'box-1', speciesId: 7, speciesName: 'Squirtle', nickname: 'Shellshock', level: 12, boxSlot: 1 }),
      createPokemon({ id: 'box-2', speciesId: 4, speciesName: 'Charmander', nickname: 'Blaze', level: 10, boxSlot: 2 }),
    ],
    cooldowns: overrides.cooldowns ?? [
      { id: 'cd-daily', kind: 'daily', readyAt: new Date(now.getTime() + 60 * 60 * 1000) },
    ],
  } satisfies TrainerHomeSnapshot;
}

describe('DM Home view builders', () => {
  test('party view lists shiny nickname and nav buttons', () => {
    const snapshot = createSnapshot();
    const render = buildPartyView(snapshot);
    const embed = render.embed.toJSON();
    const firstField = embed.fields?.[0];
    expect(firstField?.value).toContain('Sparky');
    expect(firstField?.value).toContain('✨');

    const navRow = render.components[0].toJSON();
    // Type assertion for button components with custom_id
    const navButtons = navRow.components as Array<{ custom_id?: string }>;
    expect(navButtons[0]?.custom_id).toBe('HOME_PARTY');
    expect(navButtons[1]?.custom_id).toBe('HOME_BOX');
  });

  test('box view paginates stored Pokémon', () => {
    const extras = Array.from({ length: 11 }).map((_, idx) =>
      createPokemon({
        id: `box-extra-${idx}`,
        speciesId: 10 + idx,
        speciesName: `Species-${idx}`,
        nickname: `Stored ${idx}`,
        boxSlot: idx + 3,
      })
    );
    const snapshot = createSnapshot({ box: [...extras] });
    const render = buildBoxView(snapshot, 1);
    const embed = render.embed.toJSON();
    expect(embed.footer?.text).toContain('Page 1 of');
    const paginationRow = render.components.find((row, idx) => idx === 1)?.toJSON();
    // Type assertion for button components with custom_id
    const paginationButtons = paginationRow?.components as Array<{ custom_id?: string }> | undefined;
    expect(paginationButtons?.[1]?.custom_id).toBe(`${BOX_PAGE_PREFIX}2`);
  });

  test('profile view surfaces coins and quest state', () => {
    const now = new Date('2025-10-26T12:00:00Z');
    const snapshot = createSnapshot();
    const render = buildProfileView(snapshot, now);
    const embed = render.embed.toJSON();
    const coinsField = embed.fields?.find((field) => field.name === 'Coins');
    expect(coinsField?.value).toBe('1275');
    const questField = embed.fields?.find((field) => field.name === 'Daily Quest');
    expect(questField?.value).toContain('3-day streak');
    const rewardField = embed.fields?.find((field) => field.name === 'Daily Reward');
    expect(rewardField?.value).toMatch(/Available <t:/);
  });
});
