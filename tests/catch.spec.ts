import { describe, it, expect } from 'vitest';
import { catchChance } from '../src/core/encounter/catch';

function inRange(x: number, lo: number, hi: number) {
  return x >= lo && x <= hi;
}

describe('catchChance', () => {
  it('returns a probability between 0.05 and 0.95', () => {
    for (let lvl = 2; lvl <= 30; lvl++) {
      const p = catchChance(lvl, 'poke');
      expect(inRange(p, 0.05, 0.95)).toBe(true);
    }
  });

  it('great and ultra balls increase chance vs poke ball', () => {
    for (let lvl = 2; lvl <= 10; lvl++) {
      const base = catchChance(lvl, 'poke');
      const great = catchChance(lvl, 'great');
      const ultra = catchChance(lvl, 'ultra');
      expect(great).toBeGreaterThanOrEqual(base);
      expect(ultra).toBeGreaterThanOrEqual(great);
    }
  });
});
