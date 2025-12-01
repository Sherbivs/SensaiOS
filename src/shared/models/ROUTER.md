# ROUTER
Title: Database Query Models
Purpose: PostgreSQL query modules providing raw SQL alternatives to Prisma ORM patterns
Owned Globs: src/shared/models/**
Last Updated (UTC): 2025-12-01T00:00:00Z

**Root-to-Leaf Consolidation Complete (2025-12-01):**
- ✅ **pool-helper.ts**: Centralized database pool resolution logic (4 duplicates eliminated)
  - Consolidated from: battle-queries-pg.ts, encounter-queries-pg.ts, party-queries-pg.ts, user-queries-pg.ts
  - Impact: -40 lines duplicate code, single source of truth for pool fallback logic
  - Features: TypeScript overloads for Pool and PoolClient support

Notes:
- All query modules use raw pg queries for performance (5-10ms improvement over Prisma)
- Maintains type safety via src/types/db-models.ts
- Leverages query builders from src/shared/pg-query.ts
- All modules use centralized pool resolution from pool-helper.ts

Key Files:

**`pool-helper.ts` (NEW - 60 lines) [Root-to-Leaf Consolidation 2025-12-01]**
- Purpose: Centralized database pool resolution with fallback to PROD
- Key Functions:
  - `getPool(pool?: Pool): Pool` — Standard pool resolution
  - `getPool(pool?: Pool | PoolClient): Pool | PoolClient` — Overload for transaction support
- Features:
  - TypeScript function overloads (supports both Pool and PoolClient)
  - Consistent error messaging across all query modules
  - Fallback to PROD database for gameplay operations
  - Optional pool override for testing scenarios
- Usage Pattern:
  ```typescript
  import { getPool } from './pool-helper.js';
  
  export async function getUserBasic(discordId: string, pool?: Pool): Promise<UserBasic | null> {
    const db = getPool(pool);  // Use provided pool or fallback to PROD
    const result = await db.query('SELECT * FROM "User" WHERE "discordId" = $1', [discordId]);
    return result.rows[0] || null;
  }
  ```
- Eliminated Duplicates:
  - `src/shared/models/battle-queries-pg.ts` (line 67) — 8 lines
  - `src/shared/models/encounter-queries-pg.ts` (line 35) — 10 lines
  - `src/shared/models/party-queries-pg.ts` (line 185) — 10 lines
  - `src/shared/models/user-queries-pg.ts` (line 55) — 12 lines

**`battle-queries-pg.ts` (458 lines)**
- Purpose: Raw pg queries for Battle model operations
- Migration: Replaces Prisma patterns from challenge.ts, conclude.ts, limits.ts
- Patterns Covered:
  - Battle creation (challenge)
  - State transitions (Pending → Active → Finished/Aborted)
  - Player inclusion (JOIN with User)
  - Limit checks (active/pending battles)
  - Result recording with coin rewards
  - Thread linking
- Key Functions:
  - `findActiveBattle(discordId)` — Check if user has active/pending battle
  - `createBattle(p1Id, p2Id)` — Create new challenge
  - `startBattle(battleId)` — Transition Pending → Active
  - `concludeBattle(battleId, result)` — Record outcome and rewards
- Uses: `getPool()` from pool-helper.ts

**`encounter-queries-pg.ts` (493 lines)**
- Purpose: Direct pg replacement for Encounter Prisma patterns
- Migration: Phase 7 - Core gameplay encounter system
- Operations:
  - Spawn: Create new encounter in "Spawned" state
  - Find: Retrieve encounter by ID or owner
  - Update: State transitions (Spawned → Caught/Fled/Expired)
  - Thread linking: Associate Discord thread with encounter
- Key Functions:
  - `spawnEncounter(ownerId, speciesId, level)` — Create new wild encounter
  - `getActiveEncounter(ownerId)` — Find user's active encounter
  - `updateEncounterState(encounterId, newState)` — Transition state
  - `linkThreadToEncounter(encounterId, threadId)` — Discord thread association
- Uses: `getPool()` from pool-helper.ts

**`party-queries-pg.ts` (740 lines)**
- Purpose: Raw pg queries for Party, PartySlot, and PokemonInstance operations
- Migration: Replaces Prisma patterns from party-queries.ts, starters.ts, heal.ts, catch.ts
- Patterns Covered:
  - Party with slots and Pokemon (3-way JOIN)
  - Party CRUD (create, find, count)
  - PokemonInstance CRUD (create, update, find)
  - PartySlot assignment (find available slot, create)
  - Healing (bulk Pokemon updates)
  - Box management (boxSlot tracking)
- Key Functions:
  - `getPartyWithSlots(ownerId)` — Load party with all Pokemon
  - `createParty(ownerId)` — Initialize new trainer party
  - `addPokemonToParty(pokemon, partyId)` — Assign to available slot
  - `healAllPokemon(partyId)` — Restore HP to max
- Uses: `getPool(pool?: Pool | PoolClient)` with PoolClient support for transactions

**`user-queries-pg.ts` (628 lines)**
- Purpose: Direct pg replacement for user-queries.ts Prisma patterns
- Migration: Phase 5 POC - Validates query builder API and type safety
- Operations:
  - User CRUD (create, find, update)
  - Balance operations (coins, battle stats)
  - Profile queries (username, discordId lookups)
  - User with party (JOIN operations)
- Key Functions:
  - `getUserBasic(discordId)` — Minimal data for balance checks
  - `getUserWithParty(discordId)` — Full profile with Pokemon
  - `createUser(discordId, username)` — Initialize new trainer
  - `updateCoins(userId, amount)` — Add/subtract coins
- Uses: `getPool()` from pool-helper.ts

**Other Query Modules (using centralized pool-helper):**
- `bus-queries-pg.ts` — Event bus message queries
- `cooldown-queries-pg.ts` — Rate limiting and cooldown tracking
- `dex-queries-pg.ts` — Pokedex reference data queries

## Consolidation History

**2025-12-01: Root-to-Leaf Consolidation (getPool helpers)**

**Impact:**
- **Lines Removed**: 40 lines of duplicate pool resolution logic
- **Files Updated**: 4 query modules (battle, encounter, party, user)
- **Infrastructure Created**: 1 file (pool-helper.ts with TypeScript overloads)
- **Quality**: Build verified with 0 errors, full TypeScript type safety

**Before:**
```typescript
// Duplicated in 4 files (battle-queries-pg.ts, encounter-queries-pg.ts, etc.)
function getPool(pool?: Pool): Pool {
  if (pool) return pool;
  const prodPool = getProdDb();
  if (!prodPool) throw new Error("No PROD database pool available");
  return prodPool;
}
```

**After:**
```typescript
// Centralized in pool-helper.ts with overloads
export function getPool(pool?: Pool): Pool;
export function getPool(pool?: Pool | PoolClient): Pool | PoolClient;
export function getPool(pool?: Pool | PoolClient): Pool | PoolClient {
  if (pool) return pool;
  const prodPool = getProdDb();
  if (!prodPool) {
    throw new Error(
      "PROD database pool not initialized. " +
      "Call initializeConnection() first or provide a pool override."
    );
  }
  return prodPool;
}
```

## Usage Statistics

**Pool Helper:**
- Used in: 6+ query modules (battle, encounter, party, user, bus, cooldown, dex)
- Pattern: Every exported query function accepts optional `pool?: Pool` parameter
- Testing: Pool override enables isolated unit tests without prod database
- Transactions: party-queries-pg.ts uses PoolClient overload for atomic operations

Linked Routers:
- src/shared/ROUTER.md — Parent router for all shared modules
- src/shared/pg-connection.ts — Provides getProdDb() connection factory
- src/shared/pg-query.ts — Query builder utilities (buildSelect, buildInsert, etc.)
- src/types/db-models.ts — Type definitions for database entities
