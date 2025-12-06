# 09 — Database Layer Onboarding

**Purpose:** Complete guide for developers working with the Infinity Gauntlet database layer  
**Prerequisites:** Basic TypeScript, Prisma familiarity  
**Estimated Reading Time:** 15 minutes

---

## Table of Contents

1. [Quick Start Checklist](#1-quick-start-checklist)
2. [Repository Pattern Overview](#2-repository-pattern-overview)
3. [Using Domain Repositories](#3-using-domain-repositories)
4. [Row-Level Security (RLS) Context](#4-row-level-security-rls-context)
5. [Transaction Management](#5-transaction-management)
6. [Query Patterns & Best Practices](#6-query-patterns--best-practices)
7. [Testing Database Code](#7-testing-database-code)
8. [Common Scenarios](#8-common-scenarios)
9. [Troubleshooting](#9-troubleshooting)
10. [Quick Reference](#10-quick-reference)

---

## 1. Quick Start Checklist

Before writing your first database PR:

### Environment Setup
- [ ] Load environment: `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env"`
- [ ] Verify database connection: `npm run db:cli -- status`
- [ ] Run existing tests: `npm test -- tests/services/`

### Key Files to Review
- [ ] `src/services/base-repository.ts` — Core repository pattern
- [ ] `src/services/trainer-repository.ts` — Domain-specific example
- [ ] `src/services/rls-context.ts` — Security context management
- [ ] `prisma/schema.prisma` — Database schema reference

### Architecture Decisions
- [ ] Read ADR-002: Repository Pattern Selection (`docs/projects/database-centric/adrs/`)
- [ ] Read ADR-003: Session-Aware Prisma Client

---

## 2. Repository Pattern Overview

We use the **Repository Pattern** to abstract database operations from business logic.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                   Bot Commands / Services                │
│              (src/bot/, src/services/)                  │
├─────────────────────────────────────────────────────────┤
│                  Domain Repositories                     │
│   TrainerRepository | PokemonRepository | BattleRepository│
├─────────────────────────────────────────────────────────┤
│                   BaseRepository<T>                      │
│         Generic CRUD, pagination, transactions          │
├─────────────────────────────────────────────────────────┤
│               RLS Context Manager                        │
│          Session variables, user isolation              │
├─────────────────────────────────────────────────────────┤
│                 Prisma Client (ORM)                      │
├─────────────────────────────────────────────────────────┤
│                    PostgreSQL                            │
│              Row-Level Security Policies                │
└─────────────────────────────────────────────────────────┘
```

### Why Repository Pattern?

| Benefit | Description |
|---------|-------------|
| **Testability** | Mock repositories without touching database |
| **Consistency** | Standardized CRUD, pagination, error handling |
| **Security** | RLS context automatically applied |
| **Maintainability** | Domain logic in one place |
| **Type Safety** | Full TypeScript inference |

---

## 3. Using Domain Repositories

### Available Repositories

| Repository | Model | Key Operations |
|------------|-------|----------------|
| `TrainerRepository` | Trainer, TrainerProfile | Party management, coins, leaderboard |
| `PokemonRepository` | Pokemon | Box management, battle ops, evolution |
| `BattleRepository` | Battle, BattleLog | State machine, logs, statistics |

### Basic Usage

```typescript
import { TrainerRepository } from "../services/trainer-repository.js";
import { PokemonRepository } from "../services/pokemon-repository.js";
import { BattleRepository } from "../services/battle-repository.js";
import { prisma } from "../shared/prisma.js";

// Create repository instances
const trainerRepo = new TrainerRepository(prisma);
const pokemonRepo = new PokemonRepository(prisma);
const battleRepo = new BattleRepository(prisma);

// Find trainer by Discord ID
const trainer = await trainerRepo.findByDiscordId("123456789");

// Get trainer's party
const party = await trainerRepo.getParty(trainer.id);

// Get Pokemon by ID with full details
const pokemon = await pokemonRepo.findByIdWithDetails(pokemonId);

// Create a new battle
const battle = await battleRepo.createBattle(
  trainerId1, 
  trainerId2, 
  "Wild Encounter"
);
```

### CRUD Operations (BaseRepository)

All repositories inherit from `BaseRepository<T>`:

```typescript
// CREATE
const trainer = await trainerRepo.create({
  discordId: "123456789",
  username: "AshKetchum"
});

// READ
const found = await trainerRepo.findById(trainerId);
const all = await trainerRepo.findAll();
const first = await trainerRepo.findFirst({ username: "Ash" });

// UPDATE
const updated = await trainerRepo.update(trainerId, { 
  coins: { increment: 100 } 
});

// DELETE
const deleted = await trainerRepo.delete(trainerId);

// SOFT DELETE (if model supports)
const archived = await trainerRepo.softDelete(trainerId);
```

### Pagination

```typescript
// Paginated results
const page = await trainerRepo.findPaginated({
  where: { coins: { gte: 100 } },
  orderBy: { coins: "desc" },
  page: 1,
  pageSize: 20
});

console.log(page.data);       // Trainer[]
console.log(page.total);      // Total count
console.log(page.totalPages); // Total pages
console.log(page.hasNext);    // Boolean
console.log(page.hasPrev);    // Boolean
```

---

## 4. Row-Level Security (RLS) Context

### What is RLS?

Row-Level Security ensures users can only access their own data at the database level — **not just application level**.

### Setting User Context

**IMPORTANT:** Always set RLS context before operations involving user data.

```typescript
import { setRlsContext, clearRlsContext } from "../services/rls-context.js";
import { prisma } from "../shared/prisma.js";

// Set context for a specific user
await setRlsContext(prisma, {
  trainerId: trainer.id,
  discordUserId: "123456789",
  adminBypass: false  // Only true for admin operations
});

try {
  // All queries now filtered by RLS policies
  const myPokemon = await pokemonRepo.findByTrainerId(trainer.id);
  // Database ensures only this user's Pokemon are returned
} finally {
  // Always clear context when done
  await clearRlsContext(prisma);
}
```

### Context Pattern for Discord Commands

```typescript
import { withRlsContext, RlsUserContext } from "../services/rls-context.js";

async function handleCommand(interaction: CommandInteraction) {
  const discordId = interaction.user.id;
  const trainer = await trainerRepo.findByDiscordId(discordId);
  
  if (!trainer) {
    return interaction.reply("You need to register first!");
  }
  
  // Wrap database operations in RLS context
  const result = await withRlsContext(
    prisma,
    { trainerId: trainer.id, discordUserId: discordId },
    async () => {
      // All operations here are RLS-protected
      return await pokemonRepo.findByTrainerId(trainer.id);
    }
  );
  
  // Context automatically cleared after callback
}
```

### Admin Operations

For admin commands that need to access any user's data:

```typescript
import { withAdminContext } from "../services/rls-context.js";

async function adminViewUser(adminDiscordId: string, targetTrainerId: string) {
  // Verify admin status first!
  if (!isAdmin(adminDiscordId)) {
    throw new Error("Unauthorized");
  }
  
  return await withAdminContext(prisma, async () => {
    // RLS bypassed for this scope
    return await trainerRepo.findByIdWithDetails(targetTrainerId);
  });
}
```

---

## 5. Transaction Management

### Simple Transactions

```typescript
// Using Prisma's $transaction
const result = await prisma.$transaction(async (tx) => {
  const trainer = await tx.trainer.update({
    where: { id: trainerId },
    data: { coins: { decrement: 100 } }
  });
  
  const pokemon = await tx.pokemon.create({
    data: { 
      trainerId,
      speciesId: 25,
      nickname: "Pikachu"
    }
  });
  
  return { trainer, pokemon };
});
// Both succeed or both rollback
```

### Unit of Work Pattern

For complex multi-repository transactions:

```typescript
import { UnitOfWork } from "../services/base-repository.js";

const uow = new UnitOfWork(prisma);

try {
  await uow.begin();
  
  const trainerRepo = uow.getRepository(TrainerRepository);
  const pokemonRepo = uow.getRepository(PokemonRepository);
  
  // Deduct coins
  await trainerRepo.adjustCoins(trainerId, -500);
  
  // Add Pokemon
  const pokemon = await pokemonRepo.create({
    trainerId,
    speciesId: 150,  // Mewtwo!
    level: 70
  });
  
  await uow.commit();
  return pokemon;
  
} catch (error) {
  await uow.rollback();
  throw error;
}
```

---

## 6. Query Patterns & Best Practices

### Filtering

```typescript
// Type-safe filter conditions
const activeBattles = await battleRepo.findAll({
  where: {
    status: "ACTIVE",
    createdAt: { gte: oneHourAgo }
  }
});

// Complex conditions
const rareHighLevel = await pokemonRepo.findAll({
  where: {
    AND: [
      { level: { gte: 50 } },
      { rarity: { in: ["RARE", "LEGENDARY"] } }
    ]
  }
});
```

### Sorting

```typescript
// Single field
const topTrainers = await trainerRepo.findAll({
  orderBy: { coins: "desc" }
});

// Multiple fields
const sorted = await pokemonRepo.findAll({
  orderBy: [
    { level: "desc" },
    { createdAt: "asc" }
  ]
});
```

### Eager Loading (Includes)

```typescript
// Load related data to avoid N+1 queries
const trainerWithParty = await trainerRepo.findById(trainerId, {
  include: {
    party: {
      include: {
        pokemon: true
      }
    },
    profile: true
  }
});
```

### Select Specific Fields

```typescript
// Only load what you need
const leaderboard = await prisma.trainer.findMany({
  select: {
    id: true,
    username: true,
    coins: true,
    profile: {
      select: { wins: true, losses: true }
    }
  },
  orderBy: { coins: "desc" },
  take: 10
});
```

### Avoid N+1 Queries

```typescript
// ❌ BAD: N+1 queries
const trainers = await trainerRepo.findAll();
for (const trainer of trainers) {
  const party = await trainerRepo.getParty(trainer.id); // 1 query per trainer!
}

// ✅ GOOD: Single query with include
const trainersWithParty = await prisma.trainer.findMany({
  include: {
    party: { include: { pokemon: true } }
  }
});
```

---

## 7. Testing Database Code

### Unit Testing with Mocks

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrainerRepository } from "../services/trainer-repository.js";

describe("TrainerRepository", () => {
  let mockPrisma: any;
  let repo: TrainerRepository;
  
  beforeEach(() => {
    // Create mock Prisma client
    mockPrisma = {
      trainer: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      partySlot: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((fn) => fn(mockPrisma)),
      $executeRaw: vi.fn(),
    };
    
    repo = new TrainerRepository(mockPrisma);
  });
  
  it("should find trainer by Discord ID", async () => {
    const mockTrainer = { id: "1", discordId: "123", username: "Ash" };
    mockPrisma.trainer.findUnique.mockResolvedValue(mockTrainer);
    
    const result = await repo.findByDiscordId("123");
    
    expect(result).toEqual(mockTrainer);
    expect(mockPrisma.trainer.findUnique).toHaveBeenCalledWith({
      where: { discordId: "123" }
    });
  });
});
```

### Test Factories

```typescript
// tests/factories/trainer.factory.ts
export function createMockTrainer(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    discordId: `discord_${Date.now()}`,
    username: "TestTrainer",
    coins: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

// In tests
const trainer = createMockTrainer({ coins: 5000 });
```

### Integration Testing

For actual database tests (requires test database):

```typescript
import { prisma } from "../shared/prisma.js";
import { TrainerRepository } from "../services/trainer-repository.js";

describe("TrainerRepository Integration", () => {
  const repo = new TrainerRepository(prisma);
  let testTrainerId: string;
  
  beforeEach(async () => {
    // Clean up and create test data
    await prisma.trainer.deleteMany({ 
      where: { discordId: { startsWith: "test_" } } 
    });
    
    const trainer = await repo.create({
      discordId: `test_${Date.now()}`,
      username: "IntegrationTest"
    });
    testTrainerId = trainer.id;
  });
  
  afterAll(async () => {
    await prisma.trainer.deleteMany({ 
      where: { discordId: { startsWith: "test_" } } 
    });
  });
  
  it("should create and retrieve trainer", async () => {
    const found = await repo.findById(testTrainerId);
    expect(found).not.toBeNull();
    expect(found?.username).toBe("IntegrationTest");
  });
});
```

---

## 8. Common Scenarios

### Scenario: Player Catches Pokemon

```typescript
async function catchPokemon(
  trainerId: string, 
  speciesId: number, 
  level: number
): Promise<Pokemon> {
  const trainerRepo = new TrainerRepository(prisma);
  const pokemonRepo = new PokemonRepository(prisma);
  
  return await prisma.$transaction(async (tx) => {
    // 1. Create the Pokemon
    const pokemon = await pokemonRepo.create({
      trainerId,
      speciesId,
      level,
      currentHp: calculateMaxHp(speciesId, level),
      isShiny: Math.random() < 0.001
    });
    
    // 2. Try to add to party (if space)
    const party = await trainerRepo.getParty(trainerId);
    if (party.length < 6) {
      await trainerRepo.addToParty(trainerId, pokemon.id);
    } else {
      // Goes to PC box instead
      await pokemonRepo.setBoxSlot(pokemon.id, 1, findEmptySlot());
    }
    
    // 3. Log to audit
    await auditService.logCreate("Pokemon", pokemon.id, {
      trainerId,
      speciesId,
      method: "catch"
    });
    
    return pokemon;
  });
}
```

### Scenario: Battle Completion

```typescript
async function completeBattle(
  battleId: string, 
  winnerId: string, 
  loserId: string
): Promise<void> {
  const battleRepo = new BattleRepository(prisma);
  const trainerRepo = new TrainerRepository(prisma);
  
  await prisma.$transaction(async (tx) => {
    // 1. Update battle status
    await battleRepo.transitionStatus(battleId, "COMPLETED");
    await battleRepo.setWinner(battleId, winnerId);
    
    // 2. Update trainer stats
    await trainerRepo.recordBattleResult(winnerId, true);
    await trainerRepo.recordBattleResult(loserId, false);
    
    // 3. Award coins to winner
    await trainerRepo.adjustCoins(winnerId, 100);
    
    // 4. Log battle completion
    await battleRepo.addBattleLog(battleId, {
      action: "BATTLE_COMPLETE",
      data: { winnerId, loserId }
    });
  });
}
```

### Scenario: Admin Data Export

```typescript
async function exportUserData(
  adminId: string, 
  targetDiscordId: string
): Promise<UserDataExport> {
  // Verify admin status
  if (!await isAdmin(adminId)) {
    throw new UnauthorizedError("Admin access required");
  }
  
  return await withAdminContext(prisma, async () => {
    const trainer = await prisma.trainer.findUnique({
      where: { discordId: targetDiscordId },
      include: {
        profile: true,
        pokemon: true,
        party: { include: { pokemon: true } },
        battlesAsChallenger: { take: 100 },
        battlesAsDefender: { take: 100 }
      }
    });
    
    if (!trainer) {
      throw new NotFoundError("User not found");
    }
    
    return {
      trainer,
      exportedAt: new Date(),
      exportedBy: adminId
    };
  });
}
```

---

## 9. Troubleshooting

### Common Errors

#### "RLS policy violation"
**Cause:** Trying to access data without setting RLS context.

```typescript
// ❌ Error: RLS blocks access
const pokemon = await pokemonRepo.findByTrainerId(someTrainerId);

// ✅ Fix: Set context first
await setRlsContext(prisma, { trainerId, discordUserId });
const pokemon = await pokemonRepo.findByTrainerId(trainerId);
await clearRlsContext(prisma);
```

#### "Transaction already committed/rolled back"
**Cause:** Using Prisma client outside transaction scope.

```typescript
// ❌ Error: Wrong client
await prisma.$transaction(async (tx) => {
  await prisma.trainer.create({...});  // Uses wrong client!
});

// ✅ Fix: Use transaction client
await prisma.$transaction(async (tx) => {
  await tx.trainer.create({...});  // Correct!
});
```

#### "Connection pool exhausted"
**Cause:** Too many concurrent database connections.

```typescript
// ❌ Error: Unbounded parallel queries
await Promise.all(trainers.map(t => 
  prisma.pokemon.findMany({ where: { trainerId: t.id } })
));

// ✅ Fix: Batch or limit concurrency
import pLimit from 'p-limit';
const limit = pLimit(5);
await Promise.all(trainers.map(t =>
  limit(() => prisma.pokemon.findMany({ where: { trainerId: t.id } }))
));
```

#### Slow Queries (>100ms warning in logs)

**Cause:** Missing indexes or inefficient query patterns.

```typescript
// Check slow query log for patterns
// Add appropriate indexes in schema.prisma:
// @@index([fieldName])

// Or use query profiler:
const result = await prisma.$queryRaw`
  EXPLAIN ANALYZE SELECT * FROM "Pokemon" WHERE "trainerId" = ${id}
`;
```

---

## 10. Quick Reference

### Repository Methods

| Method | Description | Example |
|--------|-------------|---------|
| `findById(id)` | Find by primary key | `repo.findById("uuid")` |
| `findFirst(where)` | First matching record | `repo.findFirst({ active: true })` |
| `findAll(options)` | All matching records | `repo.findAll({ orderBy: { name: "asc" } })` |
| `findPaginated(options)` | Paginated results | `repo.findPaginated({ page: 1, pageSize: 20 })` |
| `create(data)` | Create new record | `repo.create({ name: "Test" })` |
| `update(id, data)` | Update by ID | `repo.update(id, { name: "New" })` |
| `delete(id)` | Hard delete | `repo.delete(id)` |
| `softDelete(id)` | Soft delete | `repo.softDelete(id)` |
| `count(where)` | Count records | `repo.count({ active: true })` |
| `exists(where)` | Check existence | `repo.exists({ id })` |

### RLS Context Functions

| Function | Description |
|----------|-------------|
| `setRlsContext(prisma, context)` | Set user context |
| `clearRlsContext(prisma)` | Clear context |
| `withRlsContext(prisma, context, fn)` | Execute with auto-cleanup |
| `withAdminContext(prisma, fn)` | Execute with RLS bypass |
| `getRlsContext(prisma)` | Get current context |

### Files Reference

| File | Purpose |
|------|---------|
| `src/services/base-repository.ts` | Generic repository base class |
| `src/services/trainer-repository.ts` | Trainer domain operations |
| `src/services/pokemon-repository.ts` | Pokemon domain operations |
| `src/services/battle-repository.ts` | Battle domain operations |
| `src/services/rls-context.ts` | Row-Level Security context |
| `src/services/audit-service.ts` | Audit logging |
| `prisma/schema.prisma` | Database schema |

### Commands

```bash
# Check database status
npm run db:cli -- status

# Run repository tests
npm test -- tests/services/

# Check migration safety
node scripts/guard_db_migrations.mjs

# Apply migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# View database in browser
npx prisma studio
```

---

## See Also

- **[ADR-002: Repository Pattern](../projects/database-centric/adrs/ADR-002-repository-pattern.md)** — Design decisions
- **[ADR-003: Session-Aware Client](../projects/database-centric/adrs/ADR-003-session-aware-client.md)** — RLS integration
- **[Database Operations Runbook](../operations-bible/database-operations-runbook-comprehensive.md)** — Production operations
- **[Testing Patterns](02-testing-patterns.md)** — General testing guide

---

**Last Updated:** 2025-12-04  
**Author:** Database Specialist + Documentation Specialist  
**Part of:** Database-Centric Development Plan (Sprint 3, P2-009)
