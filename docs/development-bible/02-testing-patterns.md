# Section 2: Testing Patterns

[← Back to INDEX](INDEX.md) | [← Previous: Local Setup](01-local-setup.md) | [Next: Debugging Guides →](03-debugging-guides.md)

---

**Philosophy**: "Tests are the specification—deterministic, comprehensive, and fast."

**Purpose**: Unit testing, integration testing, PBSL oracle, coverage requirements.

## 2.1 Test Suite Overview

**Current Status (November 2025):**
- **Total Tests**: 420 (293 passing, 14 failing, 137 skipped / 24 todo)
- **Execution Time**: 4.22s (fast feedback loop)
- **Coverage Target**: 80%+ for core systems

**Test Categories:**
- **Unit Tests**: `tests/*.spec.ts` (battle engine, DM flows, ops commands)
- **PBSL Oracle**: `tests/pbsl/**` (deterministic battle snapshots)
- **Integration**: `tests/battle/actions.interaction.spec.ts` (Discord button flows)
- **Benchmarks**: `tests/benchmarks/**` (performance regression detection)

## 2.2 Running Tests

### Common Commands

```bash
# Full test suite
npm test

# Watch mode (auto-rerun on file changes)
npm test -- --watch

# Specific file
npm test -- tests/battle/engine.spec.ts

# Specific pattern
npm test -- --grep "calculateDamage"

# PBSL oracle tests only
npm run test:pbsl

# Benchmarks
npm run bench:dex
```

### Test Output

```
 ✓ tests/battle/engine.spec.ts (12 tests) 245ms
 ✓ tests/dm/home.spec.ts (8 tests) 189ms
 ✓ tests/pbsl/basic-battle.spec.ts (15 tests) 412ms
 ○ tests/integration/button-flow.spec.ts (4 tests skipped)

Test Files  42 passed (42)
     Tests  293 passed | 14 failed | 137 skipped (420)
  Duration  4.22s (transform 892ms, setup 0ms, collect 1.8s, tests 1.5s)
```

## 2.3 Unit Testing Patterns

### Battle Engine Tests

```typescript
import { describe, it, expect } from "vitest";
import { calculateDamage } from "../src/core/battle/damage.js";

describe("Battle Engine - Damage Calculation", () => {
  it("should calculate basic damage correctly", () => {
    const damage = calculateDamage({
      attackerLevel: 50,
      attackerAttack: 100,
      defenderDefense: 80,
      movePower: 90,
      type: "physical"
    });
    
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThanOrEqual(100);
  });

  it("should apply STAB bonus (1.5x) when types match", () => {
    const baseMove = { power: 90, type: "fire" };
    const pokemon = { type1: "fire", type2: null };
    
    const damageWithStab = calculateDamage({ move: baseMove, attacker: pokemon });
    const damageWithoutStab = calculateDamage({ move: { ...baseMove, type: "water" }, attacker: pokemon });
    
    expect(damageWithStab).toBeCloseTo(damageWithoutStab * 1.5, 0);
  });
});
```

### Prisma Client Mocking

```typescript
import { vi, beforeEach } from "vitest";
import { prisma } from "../src/shared/prisma.js";

vi.mock("../src/shared/prisma.js", () => ({
  prisma: {
    trainerProfile: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    pokemon: {
      findMany: vi.fn()
    }
  }
}));

describe("Home Command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch trainer profile", async () => {
    prisma.trainerProfile.findUnique.mockResolvedValue({
      id: 1,
      discordId: "123",
      name: "Ash"
    });

    const trainer = await getTrainerProfile("123");
    
    expect(prisma.trainerProfile.findUnique).toHaveBeenCalledWith({
      where: { discordId: "123" }
    });
    expect(trainer.name).toBe("Ash");
  });
});
```

## 2.4 PBSL Oracle Testing

**Purpose:** Deterministic battle outcome validation via snapshot fixtures.

**Architecture:**
- **Fixtures:** `tests/pbsl/fixtures/` (JSON snapshots of battle states)
- **Oracle:** Validates actual outcomes match expected snapshots
- **Regeneration:** `npm run test:pbsl -- --update` to refresh snapshots

### PBSL Test Example

```typescript
import { describe, it, expect } from "vitest";
import { loadFixture, executeBattle } from "./pbsl-helpers.js";

describe("PBSL Oracle - Basic Battle", () => {
  it("should match snapshot for level 50 starter battle", () => {
    const fixture = loadFixture("level-50-starter-battle");
    const outcome = executeBattle(fixture.initialState);
    
    expect(outcome).toMatchSnapshot();
  });

  it("should handle Earthquake vs Pikachu (2x damage)", () => {
    const fixture = loadFixture("earthquake-vs-pikachu");
    const outcome = executeBattle(fixture.initialState);
    
    expect(outcome.damageDealt).toBe(fixture.expected.damageDealt);
    expect(outcome.winner).toBe(fixture.expected.winner);
  });
});
```

### Fixture Structure

```json
{
  "testName": "earthquake-vs-pikachu",
  "initialState": {
    "attacker": {
      "species": "Nidoking",
      "level": 50,
      "moves": ["Earthquake"]
    },
    "defender": {
      "species": "Pikachu",
      "level": 50,
      "hp": 100
    }
  },
  "expected": {
    "damageDealt": 78,
    "winner": "attacker",
    "moveEffectiveness": "super-effective"
  }
}
```

## 2.5 Integration Testing

### Discord Button Flow Tests

```typescript
import { describe, it, expect, vi } from "vitest";
import { handleBattleButton } from "../src/bot/battle/button-handler.js";

describe("Battle Button Integration", () => {
  it("should execute move when button clicked", async () => {
    const interaction = {
      customId: "battle-move-1",
      user: { id: "123" },
      reply: vi.fn(),
      update: vi.fn()
    };

    await handleBattleButton(interaction);
    
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("used")
      })
    );
  });
});
```

## 2.6 Coverage Requirements

**Target Coverage:**
- **Core Systems:** 80%+ (battle engine, encounter, DM flows)
- **Utilities:** 70%+ (helpers, formatters)
- **Integration:** 60%+ (Discord flows, error handlers)

**Current Coverage (November 2025):**
- **Battle Engine:** 85% (good)
- **Encounter System:** 78% (acceptable)
- **DM Flows:** 72% (needs improvement)
- **Error Handlers:** 65% (below target)

### Measuring Coverage

```bash
# Generate coverage report
npm test -- --coverage

# View HTML report
npm test -- --coverage --reporter=html
# Opens coverage/index.html
```

### Coverage Thresholds

```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      }
    }
  }
});
```

---

[← Back to INDEX](INDEX.md) | [← Previous: Local Setup](01-local-setup.md) | [Next: Debugging Guides →](03-debugging-guides.md)