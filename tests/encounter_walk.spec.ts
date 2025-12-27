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

  it('chooseSpeciesId picks from valid Gen 1 species', () => {
    // Complete species pools from spawn.ts - Common, Uncommon, Rare, Ultra-Rare
    const validGen1Species = new Set([
      // Common (21 species)
      10, 13, 16, 19, 21, 23, 41, 43, 46, 48, 52, 56, 60, 69, 72, 74, 84, 96, 100, 118, 129,
      // Uncommon (29 species)
      1, 4, 7, 25, 27, 29, 32, 35, 37, 39, 50, 54, 58, 63, 66, 77, 79, 81, 88, 90, 92, 95, 98, 102, 104, 109, 111, 116, 120,
      // Rare (34 species)
      12, 15, 18, 26, 31, 34, 36, 38, 40, 57, 59, 65, 68, 76, 78, 80, 94, 103, 112, 113, 115, 123, 124, 125, 126, 127, 128, 130, 131, 132, 133, 137, 142, 143,
      // Ultra-Rare (5 species)
      144, 145, 146, 150, 151,
    ]);
    
    for (let i = 0; i < 100; i++) {
      const sid = chooseSpeciesId();
      expect(validGen1Species.has(sid)).toBe(true);
    }
  });
});
