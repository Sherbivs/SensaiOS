import { describe, it, expect } from "vitest";

import { newBattle, resolveTurn, loadIndexes } from "../src/core/battle/engine";

function getSide(state: unknown, key: "a" | "b") {
  if (!state || typeof state !== "object") {
    throw new Error("Battle state missing");
  }
  const side = (state as Record<"a" | "b", unknown>)[key];
  if (!side || typeof side !== "object") {
    throw new Error(`Battle state missing side ${key}`);
  }
  const hp = (side as { hp?: unknown }).hp;
  if (typeof hp !== "number") {
    throw new Error(`Battle state side ${key} has no numeric hp`);
  }
  return { side, hp } as { side: Record<string, unknown>; hp: number };
}

describe('battle core v1', () => {
  it('orders by speed when priorities tie', () => {
    const battle = newBattle({
      a: { name: 'charizard', level: 50, moves: ['tackle'] },
      b: { name: 'venusaur', level: 50, moves: ['tackle'] },
      seed: 42,
    });
  const res = resolveTurn(battle, "tackle", "tackle");
    const firstLine = res.log[0] || '';
    expect(firstLine.toLowerCase()).toContain('charizard');
    expect(firstLine.toLowerCase()).toContain('tackle');
  });

  it('applies STAB and type effectiveness (fire vs grass/poison)', () => {
  const { movesIndex } = loadIndexes();
    const battle = newBattle({
      a: { name: "charizard", level: 50, moves: ["flamethrower"] },
      b: { name: "venusaur", level: 50, moves: ["tackle"] },
      seed: 123,
    });
    const hpBefore = getSide(battle.state, "b").hp;
    const res = resolveTurn(battle, "flamethrower", "tackle");
    const hpAfter = getSide(res.state, "b").hp;
    const dealt = hpBefore - hpAfter;
    expect(dealt).toBeGreaterThan(0);
    // Ensure the move exists and is fire-type
  expect(movesIndex["flamethrower"].type).toBe("fire");
    // Log should mention Flamethrower
  expect(res.log.join("\n").toLowerCase()).toContain("flamethrower");
  });

  it('respects ability immunities (Levitate vs Ground)', () => {
    const battle = newBattle({
      a: { name: "gyarados", level: 50, moves: ["earthquake"] },
      b: { name: "rotom", level: 50, moves: ["tackle"] },
      seed: 7,
    });
    const hpBefore = getSide(battle.state, "b").hp;
    const res = resolveTurn(battle, "earthquake", "tackle");
    const hpAfter = getSide(res.state, "b").hp;
    expect(hpAfter).toBe(hpBefore); // immune due to Levitate
  });

  it('supports deterministic crit via critChance override', () => {
    // Two identical attacks, but with critChance=1 they should deal strictly more
    const battleCrit = newBattle({
      a: { name: "charizard", level: 50, moves: ["tackle"] },
      b: { name: "venusaur", level: 50, moves: ["tackle"] },
      seed: 1,
      critChance: 1, // always crit
    });
    const beforeCrit = getSide(battleCrit.state, "b").hp;
    const rc = resolveTurn(battleCrit, "tackle", "tackle");
    const dealtCrit = beforeCrit - getSide(rc.state, "b").hp;

    const battleNoCrit = newBattle({
      a: { name: "charizard", level: 50, moves: ["tackle"] },
      b: { name: "venusaur", level: 50, moves: ["tackle"] },
      seed: 1,
      critChance: 0, // never crit
    });
    const beforeNo = getSide(battleNoCrit.state, "b").hp;
    const rn = resolveTurn(battleNoCrit, "tackle", "tackle");
    const dealtNo = beforeNo - getSide(rn.state, "b").hp;

    expect(dealtCrit).toBeGreaterThan(dealtNo);
  });
});
