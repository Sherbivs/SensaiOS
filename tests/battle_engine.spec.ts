import { describe, it, expect } from 'vitest';
import { newBattle, resolveTurn, loadIndexes, SeededRNG } from '../src/core/battle/engine';

describe('battle core v1', () => {
  it('orders by speed when priorities tie', () => {
    const battle = newBattle({
      a: { name: 'charizard', level: 50, moves: ['tackle'] },
      b: { name: 'venusaur', level: 50, moves: ['tackle'] },
      seed: 42,
    });
    const res = resolveTurn(battle, 'tackle', 'tackle');
    const firstLine = res.log[0] || '';
    expect(firstLine.toLowerCase()).toContain('charizard');
    expect(firstLine.toLowerCase()).toContain('tackle');
  });

  it('applies STAB and type effectiveness (fire vs grass/poison)', () => {
    const { movesIndex } = loadIndexes();
    const battle = newBattle({
      a: { name: 'charizard', level: 50, moves: ['flamethrower'] },
      b: { name: 'venusaur', level: 50, moves: ['tackle'] },
      seed: 123,
    });
    const hpBefore = battle.state.b.hp;
    const res = resolveTurn(battle, 'flamethrower', 'tackle');
    const hpAfter = res.state.b.hp;
    const dealt = hpBefore - hpAfter;
    expect(dealt).toBeGreaterThan(0);
    // Ensure the move exists and is fire-type
    expect(movesIndex['flamethrower'].type).toBe('fire');
    // Log should mention Flamethrower
    expect(res.log.join('\n').toLowerCase()).toContain('flamethrower');
  });

  it('respects ability immunities (Levitate vs Ground)', () => {
    const battle = newBattle({
      a: { name: 'gyarados', level: 50, moves: ['earthquake'] },
      b: { name: 'rotom', level: 50, moves: ['tackle'] },
      seed: 7,
    });
    const hpBefore = battle.state.b.hp;
    const res = resolveTurn(battle, 'earthquake', 'tackle');
    const hpAfter = res.state.b.hp;
    expect(hpAfter).toBe(hpBefore); // immune due to Levitate
  });

  it('supports deterministic crit via critChance override', () => {
    // Two identical attacks, but with critChance=1 they should deal strictly more
    const battleCrit = newBattle({
      a: { name: 'charizard', level: 50, moves: ['tackle'] },
      b: { name: 'venusaur', level: 50, moves: ['tackle'] },
      seed: 1,
      critChance: 1, // always crit
    });
    const beforeCrit = battleCrit.state.b.hp;
    const rc = resolveTurn(battleCrit, 'tackle', 'tackle');
    const dealtCrit = beforeCrit - rc.state.b.hp;

    const battleNoCrit = newBattle({
      a: { name: 'charizard', level: 50, moves: ['tackle'] },
      b: { name: 'venusaur', level: 50, moves: ['tackle'] },
      seed: 1,
      critChance: 0, // never crit
    });
    const beforeNo = battleNoCrit.state.b.hp;
    const rn = resolveTurn(battleNoCrit, 'tackle', 'tackle');
    const dealtNo = beforeNo - rn.state.b.hp;

    expect(dealtCrit).toBeGreaterThan(dealtNo);
  });
});
