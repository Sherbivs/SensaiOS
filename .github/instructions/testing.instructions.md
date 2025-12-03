---
applyTo: 'tests/**'
---
# Testing Instructions — Pokémon Infinity Gauntlet

## Test Framework

**Stack:** Vitest + TypeScript

```powershell
# Run all tests
npm test

# Run specific test file
npm test -- tests/battle/engine.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode for development
npm test -- --watch
```

## Test Organization

### Directory Structure
```
tests/
├── battle/           # Battle engine tests
├── data/             # Data pipeline tests
├── dm/               # DM flow tests
├── ops/              # Ops command tests
├── pbsl/             # PBSL oracle tests (deterministic)
├── integration/      # Cross-system tests
└── utils/            # Utility function tests
```

### File Naming
- **Unit tests:** `*.test.ts` or `*.spec.ts`
- **Integration tests:** `*.integration.spec.ts`
- **PBSL snapshots:** `*.pbsl.spec.ts`

## Writing Tests

### Basic Test Pattern
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("BattleEngine", () => {
  beforeEach(() => {
    // Setup before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup after each test
    vi.restoreAllMocks();
  });

  it("should calculate damage correctly", () => {
    const damage = calculateDamage({ power: 50, attack: 100, defense: 80 });
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThan(200);
  });

  it("should handle critical hits", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01); // Force crit
    const damage = calculateDamage({ power: 50, attack: 100, defense: 80 });
    expect(damage).toBeGreaterThan(75); // 1.5x normal
  });
});
```

### Mocking Prisma (Prisma 7)
```typescript
import { vi } from "vitest";
import { prisma } from "../src/shared/prisma.js";

// Mock the shared prisma module
vi.mock("../src/shared/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    $transaction: vi.fn((fn) => fn(prisma))
  }
}));

// Mock types from generated client (Prisma 7)
vi.mock("../src/generated/prisma/client.js", () => ({
  PrismaClient: vi.fn(),
  Prisma: {}
}));

// In test
vi.mocked(prisma.user.findUnique).mockResolvedValue({
  id: "test-id",
  discordId: "123456789",
  username: "TestUser"
});
```

### Mocking Discord.js
```typescript
const mockInteraction = {
  reply: vi.fn().mockResolvedValue(undefined),
  followUp: vi.fn().mockResolvedValue(undefined),
  editReply: vi.fn().mockResolvedValue(undefined),
  deferReply: vi.fn().mockResolvedValue(undefined),
  deferred: false,
  replied: false,
  user: { id: "123456789", username: "TestUser" },
  guildId: "987654321",
  channelId: "555555555"
} as unknown as ChatInputCommandInteraction;
```

## PBSL Testing (Deterministic Battle Snapshots)

### Purpose
PBSL (Pokémon Battle Snapshot Language) ensures battle engine determinism by comparing snapshots.

### Writing PBSL Tests
```typescript
import { describe, it, expect } from "vitest";
import { createBattleFixture, runBattle, snapshotBattle } from "../pbsl/fixtures.js";

describe("PBSL: Basic Battle", () => {
  it("should produce deterministic output for seed 12345", () => {
    const battle = createBattleFixture({
      seed: 12345,
      pokemon1: { species: "pikachu", level: 50 },
      pokemon2: { species: "bulbasaur", level: 50 }
    });

    const result = runBattle(battle);
    const snapshot = snapshotBattle(result);

    expect(snapshot).toMatchSnapshot();
  });
});
```

## Test Categories

### Unit Tests (Fast, Isolated)
- Individual functions
- Pure calculations
- State transformations
- **Target:** <100ms per test

### Integration Tests (Slower, Connected)
- Multi-component flows
- Database interactions (mocked)
- Discord command handling
- **Target:** <1s per test

### Snapshot Tests (Deterministic)
- Battle outcomes
- Data pipeline outputs
- **Target:** 100% determinism

## Coverage Requirements

**Minimum coverage targets:**
- **Core engines:** 80%+ (battle, encounter)
- **Utilities:** 70%+
- **Commands:** 60%+
- **Overall:** 65%+

```powershell
# Generate coverage report
npm test -- --coverage

# View coverage in browser
npx vitest --ui --coverage
```

## Common Testing Patterns

### Async Testing
```typescript
it("should fetch user data", async () => {
  const user = await fetchUser("123456789");
  expect(user).toBeDefined();
  expect(user.discordId).toBe("123456789");
});
```

### Error Testing
```typescript
it("should throw on invalid input", async () => {
  await expect(createBattle(null))
    .rejects
    .toThrow("Invalid battle configuration");
});
```

### Parameterized Tests
```typescript
it.each([
  { level: 1, expectedHp: 20 },
  { level: 50, expectedHp: 150 },
  { level: 100, expectedHp: 300 }
])("should calculate HP for level $level", ({ level, expectedHp }) => {
  const hp = calculateHp({ level, baseHp: 45 });
  expect(hp).toBe(expectedHp);
});
```

## Test Isolation Rules

1. **No shared state** between tests
2. **Clean up mocks** in `afterEach`
3. **Use unique IDs** for test data
4. **Don't rely on test order**
5. **Reset singletons** before each test

## Running Specific Suites

```powershell
# Battle engine only
npm run test:battle

# PBSL determinism tests
npm run test:pbsl

# Data pipeline tests
npm test -- tests/data/

# Skip slow tests
npm test -- --testTimeout=5000
```

## Reference

- **Test Config:** `vitest.config.ts`
- **Coverage Config:** `vitest.config.ts` → `coverage`
- **Test Utils:** `tests/utils/` (shared helpers)
- **Fixtures:** `tests/fixtures/` (test data)
