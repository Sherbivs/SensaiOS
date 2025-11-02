import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';

import {
  getSpecies,
  getSpeciesBaseStats,
  getSpeciesMatchups,
  loadDexpack,
  resetDexpack,
  dexpackState,
} from '../src/data/dexpack.js';

describe('dexpack fast indexes', () => {
  afterEach(() => {
    resetDexpack();
  });

  it('resolves canonical names through the perfect hash table', () => {
    const bulbasaur = getSpecies('bulbasaur');
    expect(bulbasaur?.slug).toBe('bulbasaur');
  });

  it('resolves alias names through the perfect hash table', () => {
    const mrMime = getSpecies('Mr. Mime');
    expect(mrMime?.slug).toBe('mr-mime');
  });

  it('provides typed-array backed base stats and matchups', () => {
    const fast = dexpackState.fast;
    expect(fast?.statIndex).toBeInstanceOf(Int32Array);
    expect(fast?.baseStats).toBeInstanceOf(Uint16Array);

    const stats = getSpeciesBaseStats(1);
    expect(stats).toMatchObject({ hp: expect.any(Number), atk: expect.any(Number) });

    const matchups = getSpeciesMatchups(1);
    expect(matchups?.grass ?? 1).toBeDefined();
  });

  it('rebuilds fast indexes when loading from a JSON file', () => {
    const jsonPath = path.join(process.cwd(), 'assets', 'dexpack.v1.json');
    loadDexpack(jsonPath);
    const stats = getSpeciesBaseStats(1);
    expect(stats).toMatchObject({ hp: expect.any(Number) });
    const fast = dexpackState.fast;
    expect(fast?.nameTable?.ids).toBeInstanceOf(Int32Array);
  });
});
