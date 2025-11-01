import { describe, it, expect } from 'vitest';

import { chooseLevel, chooseSpeciesId } from '../src/core/encounter/spawn';

describe('encounter spawn helpers', () => {
  it('chooseLevel returns in early range (2..6)', () => {
    for (let i = 0; i < 100; i++) {
      const lvl = chooseLevel();
      expect(lvl).toBeGreaterThanOrEqual(2);
      expect(lvl).toBeLessThanOrEqual(6);
    }
  });

  it('chooseSpeciesId picks from known small set', () => {
    const allowed = new Set([10, 13, 16, 19, 21, 23, 25]);
    for (let i = 0; i < 100; i++) {
      const sid = chooseSpeciesId();
      expect(allowed.has(sid)).toBe(true);
    }
  });
});
