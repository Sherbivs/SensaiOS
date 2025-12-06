# ADR-002: Repository Pattern for Data Access

| Metadata | Value |
|----------|-------|
| **Status** | Accepted |
| **Date** | 2025-12-04 |
| **Authors** | Architecture Specialist, AI Coding Specialist |
| **Sprint** | Sprint 2 (P2-004, P2-005, P2-006) |

## Context

The Pokémon Infinity Gauntlet application needs a consistent, maintainable approach to database access. The codebase currently has:

1. **Direct Prisma calls** scattered throughout the application
2. **Inconsistent error handling** across different modules
3. **No centralized RLS context management**
4. **Duplicate query logic** in multiple places

**Problem Statement:**

We need a data access layer that:
1. Encapsulates all database operations for each domain entity
2. Integrates seamlessly with RLS context management
3. Provides type-safe interfaces with proper error handling
4. Enables consistent testing patterns
5. Supports domain-specific business logic (e.g., party validation, battle state machines)

**Constraints:**

- Must integrate with existing Prisma ORM
- Must handle RLS context automatically
- Must be testable without database connections
- Must not add significant runtime overhead
- Must support both single operations and transactions

## Decision

**We will implement a Repository Pattern with RLS-aware base class and domain-specific implementations.**

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Services                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │EncounterSvc│  │ BattlesSvc │  │ AdminSvc   │                │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘                │
│        │               │               │                        │
│        v               v               v                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │               Domain Repositories                            ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           ││
│  │  │TrainerRepo  │ │PokemonRepo  │ │BattleRepo   │           ││
│  │  │• getProfile │ │• findByOwner│ │• create     │           ││
│  │  │• updateStats│ │• addToParty │ │• finishGame │           ││
│  │  │• getParty   │ │• evolve     │ │• getHistory │           ││
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘           ││
│  │         │               │               │                    ││
│  │         v               v               v                    ││
│  │  ┌─────────────────────────────────────────────────────────┐││
│  │  │            BaseRepository<T>                            │││
│  │  │  • prisma: PrismaClient                                 │││
│  │  │  • context: RlsUserContext                              │││
│  │  │  • withRls<R>(fn): Promise<R>                          │││
│  │  │  • findById(id): Promise<T | null>                     │││
│  │  │  • create(data): Promise<T>                            │││
│  │  │  • update(id, data): Promise<T>                        │││
│  │  │  • delete(id): Promise<void>                           │││
│  │  └──────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              v
┌─────────────────────────────────────────────────────────────────┐
│                        Prisma ORM                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   PrismaClient                               ││
│  │  • $executeRawUnsafe() — RLS context                        ││
│  │  • Model operations — CRUD                                   ││
│  │  • $transaction() — Atomic operations                       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Repository Hierarchy

```
BaseRepository<T>
├── TrainerRepository
│   ├── findByDiscordId(discordId)
│   ├── getActiveParty(trainerId)
│   ├── updateStatistics(trainerId, stats)
│   └── getWithFullProfile(trainerId)
├── PokemonRepository  
│   ├── findByOwner(ownerId, filters)
│   ├── addToParty(pokemonId, partyId, slot)
│   ├── removeFromParty(pokemonId)
│   ├── evolve(pokemonId, targetSpeciesId)
│   └── updateStats(pokemonId, ivs, evs)
└── BattleRepository
    ├── findByArenaThread(threadId)
    ├── startBattle(battleId)
    ├── finishBattle(battleId, result)
    ├── abortBattle(battleId, reason)
    └── getBattleStats(userId)
```

### Core Implementation

```typescript
// Base repository with RLS integration
abstract class BaseRepository<T> {
  protected prisma: PrismaClient;
  protected context: RlsUserContext;

  constructor(prisma: PrismaClient, context: RlsUserContext) {
    this.prisma = prisma;
    this.context = context;
  }

  // RLS-wrapped operation executor
  protected async withRls<R>(operation: () => Promise<R>): Promise<R> {
    await setUserContext(this.prisma, this.context);
    try {
      return await operation();
    } finally {
      await clearUserContext(this.prisma);
    }
  }

  // Common CRUD operations
  abstract findById(id: string): Promise<T | null>;
  abstract create(data: CreateData<T>): Promise<T>;
  abstract update(id: string, data: UpdateData<T>): Promise<T>;
  abstract delete(id: string): Promise<void>;
}

// Domain-specific repository
class PokemonRepository extends BaseRepository<Pokemon> {
  async findByOwner(ownerId: string, filters?: PokemonFilter): Promise<Pokemon[]> {
    return this.withRls(() =>
      this.prisma.pokemon.findMany({
        where: {
          ownerId,
          ...filters,
        },
        include: { species: true, heldItem: true },
      })
    );
  }

  async addToParty(pokemonId: string, partyId: string, slot: number): Promise<PartySlot> {
    return this.withRls(async () => {
      // Validate slot availability
      const existingSlot = await this.prisma.partySlot.findFirst({
        where: { partyId, slot },
      });
      if (existingSlot) {
        throw new PartySlotOccupiedError(slot);
      }

      // Create party slot
      return this.prisma.partySlot.create({
        data: { partyId, pokemonId, slot },
        include: { pokemon: true },
      });
    });
  }
}
```

### Transaction Support

```typescript
class BattleRepository extends BaseRepository<Battle> {
  async finishBattle(battleId: string, result: BattleResult): Promise<Battle> {
    return this.withRls(async () => {
      return this.prisma.$transaction(async (tx) => {
        // Update battle record
        const battle = await tx.battle.update({
          where: { id: battleId },
          data: {
            state: 'Finished',
            resultJson: result,
            endedAt: new Date(),
          },
        });

        // Update winner stats
        if (result.winnerId) {
          await tx.trainerProfile.update({
            where: { userId: result.winnerId },
            data: { wins: { increment: 1 } },
          });
        }

        // Update loser stats
        if (result.loserId) {
          await tx.trainerProfile.update({
            where: { userId: result.loserId },
            data: { losses: { increment: 1 } },
          });
        }

        return battle;
      });
    });
  }
}
```

## Consequences

### Positive

1. **Encapsulation**: All database logic for an entity lives in one place
2. **Type Safety**: Full TypeScript support with proper generics
3. **RLS Integration**: Context management is automatic and consistent
4. **Testability**: Repositories can be mocked easily for unit tests
5. **Business Logic**: Domain rules (party limits, state machines) centralized
6. **Transactions**: Complex operations are atomic and consistent
7. **Discoverability**: Developers know where to find data access code

### Negative

1. **Abstraction Overhead**: Additional layer between services and database
2. **Learning Curve**: Team must understand repository pattern
3. **Boilerplate**: Each entity requires a repository class

### Neutral

1. **Performance**: No measurable impact (just code organization)
2. **Flexibility**: Easy to add caching, logging, or metrics at repository level
3. **Migration Path**: Can be adopted incrementally

## Repository Method Guidelines

### Naming Conventions

| Prefix | Returns | Example |
|--------|---------|---------|
| `find*` | Single or null | `findById(id)`, `findByDiscordId(discordId)` |
| `findAll*` | Array | `findAllByOwner(ownerId)` |
| `get*` | Single (throws if not found) | `getActiveParty(trainerId)` |
| `create*` | Created entity | `create(data)`, `createBattle(p1, p2)` |
| `update*` | Updated entity | `update(id, data)`, `updateStats(id, stats)` |
| `delete*` | void | `delete(id)`, `deletePartySlot(slotId)` |
| `count*` | number | `countByOwner(ownerId)` |
| `exists*` | boolean | `existsInParty(pokemonId)` |

### Error Handling

```typescript
// Repository errors
class RepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly entity?: string,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

// Domain-specific errors
class EntityNotFoundError extends RepositoryError { }
class DuplicateEntityError extends RepositoryError { }
class ValidationError extends RepositoryError { }
class StateTransitionError extends RepositoryError { }
```

### Testing Pattern

```typescript
// Unit test with mocked repository
describe('BattleService', () => {
  it('should create battle with correct state', async () => {
    const mockRepo = {
      create: vi.fn().mockResolvedValue({
        id: 'battle-1',
        state: 'Pending',
        p1Id: 'user-1',
        p2Id: 'user-2',
      }),
    };

    const service = new BattleService(mockRepo as any);
    const battle = await service.initiateBattle('user-1', 'user-2');

    expect(mockRepo.create).toHaveBeenCalledWith({
      p1Id: 'user-1',
      p2Id: 'user-2',
      state: 'Pending',
    });
    expect(battle.state).toBe('Pending');
  });
});
```

## Related ADRs

- **ADR-001**: Row Level Security Context Pattern
- **ADR-003**: Session-Aware Prisma Client

## References

- [Repository Pattern by Martin Fowler](https://martinfowler.com/eaaCatalog/repository.html)
- [Prisma Client API](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)
- [TypeScript Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html)
