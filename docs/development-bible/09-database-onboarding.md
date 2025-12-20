# 09 — Database Layer Onboarding

**Purpose:** Complete guide for developers working with the Infinity Gauntlet database layer  
**Prerequisites:** Basic TypeScript, Prisma familiarity  
**Estimated Reading Time:** 10 minutes

> **⚠️ IMPORTANT (2025-12-19):** The generic repository pattern files (`base-repository.ts`, `trainer-repository.ts`, `pokemon-repository.ts`, `battle-repository.ts`) were removed in Meeting #4 of the Dead Code Cleanup initiative. These files were built during the Database-Centric Sprint but never integrated into the runtime. Historical documentation exists in `docs/projects/database-centric/`.

---

## Table of Contents

1. [Quick Start Checklist](#1-quick-start-checklist)
2. [Current Database Patterns](#2-current-database-patterns)
3. [Using the Prisma Client](#3-using-the-prisma-client)
4. [Domain Repositories (Active)](#4-domain-repositories-active)
5. [Row-Level Security (RLS) Context](#5-row-level-security-rls-context)
6. [Query Patterns & Best Practices](#6-query-patterns--best-practices)
7. [Testing Database Code](#7-testing-database-code)
8. [Troubleshooting](#8-troubleshooting)
9. [Quick Reference](#9-quick-reference)

---

## 1. Quick Start Checklist

Before writing your first database PR:

### Environment Setup
- [ ] Load environment: `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env"`
- [ ] Verify database connection: `npm run db:cli -- status`
- [ ] Run existing tests: `npm test -- tests/services/`

### Key Files to Review
- [ ] `src/shared/prisma.ts` — Prisma client singleton with multi-database support
- [ ] `src/services/homestead-repository.ts` — Active domain repository example
- [ ] `src/services/rls-context.ts` — Security context management
- [ ] `prisma/schema.prisma` — Database schema reference

### Documentation References
- [ ] `docs/operations-bible/02-database-operations.md` — Database URL selection, connections
- [ ] `docs/prisma-7-bible.md` — Comprehensive Prisma 7 guide (emergency triage, migration)

---

## 2. Current Database Patterns

The codebase uses **three primary database access patterns**:

### Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                   Bot Commands / Services                │
│              (src/bot/, src/services/)                  │
├─────────────────────────────────────────────────────────┤
│              Direct Prisma Queries (Primary)             │
│         Most operations use prisma.* directly           │
├─────────────────────────────────────────────────────────┤
│            Domain Repositories (Where Needed)            │
│       HomesteadRepository for complex channel ops       │
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

### Pattern Selection Guide

| Use Case | Pattern | When to Use |
|----------|---------|-------------|
| **Simple CRUD** | Direct Prisma | Most operations: `prisma.user.findUnique()` |
| **Complex Domain Logic** | Domain Repository | Multi-step operations, lifecycle management |
| **Performance-Critical** | Raw PG Queries | Hot paths requiring specific SQL |
| **Security Context** | RLS Context | User-scoped operations with row-level isolation |

---

## 3. Using the Prisma Client

### Basic Import

```typescript
import { prisma } from "../shared/prisma.js";

// Simple query
const user = await prisma.user.findUnique({
  where: { discordId: "123456789" }
});

// With relations
const userWithPokemon = await prisma.user.findUnique({
  where: { discordId: "123456789" },
  include: { pokemon: true, party: true }
});
```

### Multi-Database Support

The codebase supports multiple Prisma clients for different environments:

```typescript
import { prisma, onPremiseDevPrisma, getDatabaseStats } from "../shared/prisma.js";

// Production queries (always available)
const prodUsers = await prisma.user.findMany();

// Local development (optional, may be null)
if (onPremiseDevPrisma) {
  const localUsers = await onPremiseDevPrisma.user.findMany();
}

// Get telemetry for all databases
const stats = getDatabaseStats();
console.log(`PROD: ${stats.prod.status} | LOCAL: ${stats.onPremiseDev.status}`);
```

---

## 4. Domain Repositories (Active)

### Available Repositories

| Repository | Model | Status | Key Operations |
|------------|-------|--------|----------------|
| `HomesteadRepository` | HomesteadChannel | **ACTIVE** | Channel lifecycle, health checks, bulk ops |

> **Note:** The generic repository pattern (`TrainerRepository`, `PokemonRepository`, `BattleRepository`, `BaseRepository`) was removed in Meeting #4 (2025-12-19). Use direct Prisma queries for trainer, pokemon, and battle operations.

### Using HomesteadRepository

```typescript
import { homesteadRepository } from "../services/homestead-repository.js";

// Find by Discord user ID
const homestead = await homesteadRepository.findByUserId(userId);

// Find by channel ID
const channel = await homesteadRepository.findByChannelId(channelId);

// Create a new homestead
const created = await homesteadRepository.create({
  userId: "discord-user-id",
  guildId: "guild-id",
  channelId: "channel-id",
  status: "active"
});

// Update homestead status
await homesteadRepository.updateStatus(homesteadId, "suspended");

// Get inactive homesteads for cleanup
const inactive = await homesteadRepository.findInactive(30); // 30 days
```

### Direct Prisma Queries (Recommended for Most Operations)

For trainer, pokemon, and battle operations, use direct Prisma queries:

```typescript
import { prisma } from "../shared/prisma.js";

// Find trainer by Discord ID
const trainer = await prisma.user.findUnique({
  where: { discordId: "123456789" }
});

// Get trainer's party with Pokemon details
const party = await prisma.partySlot.findMany({
  where: { userId: trainer.id },
  include: { pokemon: true },
  orderBy: { slot: "asc" }
});

// Create a new Pokemon
const pokemon = await prisma.pokemonInstance.create({
  data: { 
    userId: trainer.id,
    speciesId: 25,
    nickname: "Pikachu",
    level: 5
  }
});

// Update battle status
await prisma.battle.update({
  where: { id: battleId },
  data: { status: "COMPLETED", winnerId }
});
```

---

## 5. Row-Level Security (RLS) Context

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

## 6. Transaction Management

### Simple Transactions

```typescript
// Using Prisma's $transaction
const result = await prisma.$transaction(async (tx) => {
  const trainer = await tx.user.update({
    where: { id visitorId },
    data: { coins: { decrement: 100 } }
  });
  
  const pokemon = await tx.pokemonInstance.create({
    data: { 
      userId: trainerId,
      speciesId: 25,
      nickname: "Pikachu"
    }
  });
  
  return { trainer, pokemon };
});
// Both succeed or both rollback
```

### Interactive Transactions (Complex Operations)

For multi-step operations requiring intermediate results:

```typescript
const result = await prisma.$transaction(async (tx) => {
  // Step 1: Get current state
  const party = await tx.partySlot.findMany({
    where: { userId: trainerId },
    include: { pokemon: true }
  });
  
  // Step 2: Check business rules
  if (party.length >= 6) {
    throw new Error("Party is full");
  }
  
  // Step 3: Create and assign
  const pokemon = await tx.pokemonInstance.create({
    data: { userId: trainerId, speciesId: 25, level: 5 }
  });
  
  await tx.partySlot.create({
    data: { 
      userId: trainerId, 
      pokemonId: pokemon.id, 
      slot: party.length + 1 
    }
  });
  
  return pokemon;
});
```

---

## 7. Query Patterns & Best Practices

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

## 6.5. Prisma Imports & JSON Types

> **CRITICAL:** This project uses a custom Prisma output path. Wrong imports will fail on Render.

### Import Patterns

```typescript
// ✅ CORRECT: Import from generated path
import { PrismaClient, Prisma, type User } from '../generated/prisma/client.js';
import type { Battle, PokemonInstance } from '../generated/prisma/client.js';

// ✅ CORRECT: Import prisma instance from shared
import { prisma } from '../shared/prisma.js';

// ❌ WRONG: Will fail on Render (fresh install, no default output)
import { PrismaClient } from '@prisma/client';  // BLOCKED BY ESLINT
```

### Path Calculation

| Source Directory | Import Path |
|------------------|-------------|
| `src/services/` | `../generated/prisma/client.js` |
| `src/bot/commands/` | `../../generated/prisma/client.js` |
| `src/bot/security/services/` | `../../../generated/prisma/client.js` |
| `tests/services/` | `../../src/generated/prisma/client.js` |

### JSON Type Conversion (Prisma 7.x)

Prisma 7.x has strict typing for JSON fields. Use our utility helpers:

```typescript
import { toJsonValue, fromJsonValue } from '../shared/json-types.js';

// ✅ Writing JSON fields
const pokemon = await prisma.pokemonInstance.create({
  data: {
    ivsJson: toJsonValue(stats),     // StatSpread → InputJsonValue
    movesJson: toJsonValue(moves),   // MoveSlot[] → InputJsonValue
  }
});

// ✅ Reading JSON fields
const moves = fromJsonValue<MoveSlot[]>(pokemon.movesJson) ?? [];

// ✅ Nullable JSON with fallback
await prisma.auditLog.create({
  data: {
    beforeJson: entry.beforeJson ? toJsonValue(entry.beforeJson) : Prisma.DbNull,
  }
});

// ✅ Filtering non-null JSON
const finishedBattles = await prisma.battle.findMany({
  where: {
    resultJson: { not: Prisma.JsonNull },  // NOT { not: null }
  }
});
```

### Common Domain Types

| Domain Type | Used In | Prisma Field |
|-------------|---------|--------------|
| `StatSpread` | pokemon-repository | `ivsJson`, `evsJson` |
| `MoveSlot[]` | pokemon-repository | `movesJson` |
| `BattleResult` | battle-repository | `resultJson` |
| `CompactLogEntry[]` | battle-repository | `logCompact` |
| `FullLogEntry[]` | battle-repository | `logFull` |
| `Record<string, unknown>` | audit-service | `beforeJson`, `afterJson` |

### Why This Matters

1. **Build Failures:** `@prisma/client` imports fail on Render (no default output)
2. **Type Errors:** Domain interfaces don't satisfy `InputJsonValue` structure
3. **Runtime Safety:** These are compile-time type fixes, not runtime behavior changes

---

## 8. Testing Database Code

### Unit Testing with Mocks

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("User Database Operations", () => {
  let mockPrisma: any;
  
  beforeEach(() => {
    // Create mock Prisma client
    mockPrisma = {
      user: {
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
  });
  
  it("should find user by Discord ID", async () => {
    const mockUser = { id: "1", discordId: "123", username: "Ash" };
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    
    const result = await mockPrisma.user.findUnique({
      where: { discordId: "123" }
    });
    
    expect(result).toEqual(mockUser);
  });
});
```

### Test Factories

```typescript
// tests/factories/user.factory.ts
export function createMockUser(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    discordId: `discord_${Date.now()}`,
    username: "TestUser",
    coins: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

// In tests
const user = createMockUser({ coins: 5000 });
```

### Integration Testing

For actual database tests (requires test database):

```typescript
import { prisma } from "../shared/prisma.js";

describe("User Integration", () => {
  let testUserId: string;
  
  beforeEach(async () => {
    // Clean up and create test data
    await prisma.user.deleteMany({ 
      where: { discordId: { startsWith: "test_" } } 
    });
    
    const user = await prisma.user.create({
      data: {
        discordId: `test_${Date.now()}`,
        username: "IntegrationTest"
      }
    });
    testUserId = user.id;
  });
  
  afterAll(async () => {
    await prisma.user.deleteMany({ 
      where: { discordId: { startsWith: "test_" } } 
    });
  });
  
  it("should create and retrieve user", async () => {
    const found = await prisma.user.findUnique({
      where: { id: testUserId }
    });
    expect(found).not.toBeNull();
    expect(found?.username).toBe("IntegrationTest");
  });
});
```

---

## 9. Common Scenarios

### Scenario: Player Catches Pokemon

```typescript
import { prisma } from "../shared/prisma.js";

async function catchPokemon(
  userId: string, 
  speciesId: number, 
  level: number
): Promise<PokemonInstance> {
  return await prisma.$transaction(async (tx) => {
    // 1. Create the Pokemon
    const pokemon = await tx.pokemonInstance.create({
      data: {
        userId,
        speciesId,
        level,
        currentHp: calculateMaxHp(speciesId, level),
        isShiny: Math.random() < 0.001
      }
    });
    
    // 2. Try to add to party (if space)
    const party = await tx.partySlot.findMany({
      where: { userId }
    });
    
    if (party.length < 6) {
      await tx.partySlot.create({
        data: { userId, pokemonId: pokemon.id, slot: party.length + 1 }
      });
    }
    // Otherwise goes to storage automatically
    
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
  await prisma.$transaction(async (tx) => {
    // 1. Update battle status
    await tx.battle.update({
      where: { id: battleId },
      data: { 
        status: "COMPLETED", 
        winnerId,
        completedAt: new Date()
      }
    });
    
    // 2. Update winner stats
    await tx.user.update({
      where: { id: winnerId },
      data: { 
        coins: { increment: 100 },
        wins: { increment: 1 }
      }
    });
    
    // 3. Update loser stats
    await tx.user.update({
      where: { id: loserId },
      data: { losses: { increment: 1 } }
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
  
  const user = await prisma.user.findUnique({
    where: { discordId: targetDiscordId },
    include: {
      pokemon: true,
      party: { include: { pokemon: true } },
      battles: { take: 100 }
    }
  });
  
  if (!user) {
    throw new NotFoundError("User not found");
  }
  
  return {
    user,
    exportedAt: new Date(),
    exportedBy: adminId
  };
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

## 11. Quick Reference

### Common Prisma Operations

| Operation | Example |
|-----------|---------|
| Find by ID | `prisma.user.findUnique({ where: { id } })` |
| Find by field | `prisma.user.findFirst({ where: { discordId } })` |
| Find all | `prisma.user.findMany({ orderBy: { coins: "desc" } })` |
| Create | `prisma.user.create({ data: { ... } })` |
| Update | `prisma.user.update({ where: { id }, data: { ... } })` |
| Delete | `prisma.user.delete({ where: { id } })` |
| Count | `prisma.user.count({ where: { active: true } })` |
| Paginate | `prisma.user.findMany({ skip, take, orderBy })` |

### RLS Context Functions

| Function | Description |
|----------|-------------|
| `setRlsContext(prisma, context)` | Set user context |
| `clearRlsContext(prisma)` | Clear context |
| `withRlsContext(prisma, context, fn)` | Execute with auto-cleanup |
| `withAdminContext(prisma, fn)` | Execute with RLS bypass |
| `getRlsContext(prisma)` | Get current context |

### Key Files Reference

| File | Purpose |
|------|---------|
| `src/shared/prisma.ts` | Prisma client singleton |
| `src/services/homestead-repository.ts` | Homestead channel operations |
| `src/services/rls-context.ts` | Row-Level Security context |
| `src/services/home-bundle-pg.ts` | Raw PG query helpers |
| `prisma/schema.prisma` | Database schema |

### Commands

```bash
# Check database status
npm run db:cli -- status

# Run tests
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

- **[Prisma 7 Bible](../prisma-7-bible.md)** — Comprehensive Prisma 7 guide (1000+ lines)
- **[Database Operations Runbook](../operations-bible/02-database-operations.md)** — Production database operations
- **[Testing Patterns](02-testing-patterns.md)** — General testing guide
- **[Historical: Database-Centric Project](../projects/database-centric/)** — Original repository pattern design (archived)

---

**Last Updated:** 2025-12-19  
**Revision:** 2.0 — Updated after Meeting #4 dead code removal  
**Part of:** Development Bible
