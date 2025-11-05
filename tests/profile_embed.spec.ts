import { describe, expect, test } from 'vitest';

import { buildTrainerProfileEmbed } from '../src/bot/profile/embed.js';
import type { TrainerProfileSummary } from '../src/models/index.js';

function createSummary(overrides: Partial<TrainerProfileSummary> = {}): TrainerProfileSummary {
  const base: TrainerProfileSummary = {
    user: {
      id: 'user-1',
      discordId: '1234567890',
      coins: 2350,
      createdAt: new Date('2025-09-01T12:00:00Z'),
    },
    profile: {
      tagline: 'Ace Trainer of the Plateau',
      bio: 'I travel the world catching shinies and battling friends. Catch me in the arena!\nProud member of the Midnight Crew.',
      favoriteSpeciesId: 6,
      favoriteSpeciesName: 'Charizard',
      favoriteSpeciesSlug: 'charizard',
      createdAt: new Date('2025-11-03T07:45:00Z'),
      updatedAt: new Date('2025-11-03T07:45:00Z'),
    },
    stats: {
      totalPokemon: 42,
      partyCount: 4,
      storageCount: 38,
      uniqueSpecies: 28,
      shinyCount: 3,
      recentCaptures: [
        {
          id: 'mon-1',
          speciesId: 25,
          speciesName: 'Pikachu',
          nickname: 'Spark',
          isShiny: false,
          capturedAt: new Date('2025-11-02T18:00:00Z'),
        },
        {
          id: 'mon-2',
          speciesId: 133,
          speciesName: 'Eevee',
          nickname: null,
          isShiny: true,
          capturedAt: new Date('2025-11-02T15:00:00Z'),
        },
      ],
    },
    battles: {
      total: 12,
      wins: 8,
      losses: 3,
      forfeits: 1,
      lastOutcome: 'win',
      lastBattleAt: new Date('2025-11-02T20:15:00Z'),
      recent: [
        {
          id: 'battle-1',
          outcome: 'win',
          endedAt: new Date('2025-11-02T20:15:00Z'),
          opponentDiscordId: '9876543210',
        },
        {
          id: 'battle-2',
          outcome: 'forfeit',
          endedAt: new Date('2025-11-02T19:00:00Z'),
          opponentDiscordId: '5678901234',
        },
      ],
    },
    quest: {
      streak: 5,
      status: 'locked',
      atRisk: false,
      lost: false,
      lastCompleted: new Date('2025-11-02T09:00:00Z'),
      lastReset: new Date('2025-10-28T09:00:00Z'),
      nextDue: new Date('2025-11-03T09:00:00Z'),
      daysSinceCompletion: 0,
      message: 'On a 5-day streak! Keep it up.',
    },
    dailyRewardReadyAt: new Date('2025-11-03T08:00:00Z'),
  } satisfies TrainerProfileSummary;

  return {
    ...base,
    ...overrides,
    profile: { ...base.profile, ...(overrides.profile ?? {}) },
    stats: { ...base.stats, ...(overrides.stats ?? {}) },
    battles: { ...base.battles, ...(overrides.battles ?? {}) },
    quest: { ...base.quest, ...(overrides.quest ?? {}) },
  };
}

describe('buildTrainerProfileEmbed', () => {
  test('renders tagline, stats, and battle summary', () => {
    const summary = createSummary();
    const embed = buildTrainerProfileEmbed(summary, { now: new Date('2025-11-02T21:00:00Z') }).toJSON();

    expect(embed.title).toBe('Trainer Profile');
    expect(embed.description).toBe('Ace Trainer of the Plateau');

    const statsField = embed.fields?.find((field) => field.name === 'Stats');
  expect(statsField?.value).toContain('Coins:');
  expect(statsField?.value).toContain('42 (Party 4 / Storage 38)');

    const battleField = embed.fields?.find((field) => field.name === 'Battle Record');
    expect(battleField?.value).toContain('8-3 (1 forfeit)');
    expect(battleField?.value).toMatch(/Last: Win/);

    const questField = embed.fields?.find((field) => field.name === 'Daily Quest');
    expect(questField?.value).toContain('5-day streak');

    const favoriteField = embed.fields?.find((field) => field.name === 'Favorite Pokémon');
    expect(favoriteField?.value).toContain('Charizard');
  });

  test('falls back to trainer mention when tagline absent', () => {
    const summary = createSummary({
      profile: {
        tagline: null,
        bio: null,
        favoriteSpeciesId: null,
        favoriteSpeciesName: null,
        favoriteSpeciesSlug: null,
        createdAt: new Date('2025-11-03T07:45:00Z'),
        updatedAt: new Date('2025-11-03T07:45:00Z'),
      },
    });
    const embed = buildTrainerProfileEmbed(summary).toJSON();
    expect(embed.description).toBe('Trainer: <@1234567890>');
    const recentCaptures = embed.fields?.find((field) => field.name === 'Recent Captures');
    expect(recentCaptures?.value).toContain('Pikachu');
  });
});
