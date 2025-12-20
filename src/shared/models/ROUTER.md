# ROUTER
Title: Database Query Models
Purpose: PostgreSQL query modules providing raw SQL alternatives to Prisma ORM patterns
Owned Globs: src/shared/models/**
Last Updated (UTC): 2025-12-20T00:00:00Z

**Root-to-Leaf Consolidation Planned (2025-12-01) — NOT IMPLEMENTED:**
- ⚠️ **pool-helper.ts**: Was planned but never integrated (DELETED 2025-12-20)
  - Reason: Created as consolidation helper but query modules were never updated to use it
  - Status: File deleted (55 lines of never-used code)
  - Future: If pool consolidation needed, create fresh implementation

Notes:
- All query modules use raw pg queries for performance (5-10ms improvement over Prisma)
- Maintains type safety via src/types/db-models.ts
- Leverages query builders from src/shared/pg-query.ts
- Each query module maintains its own local getPool() function (consolidation not implemented)

Key Files:

## ⚠️ ARCHIVED (2025-12-20)

**`pool-helper.ts` — DELETED**
- Reason: Created as consolidation helper (55 lines) but query modules were never updated to use it
- Status: File deleted during Dead Code Cleanup Meeting #4
- Each query module still maintains its own local `getPool()` function

---

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
- Uses: Local `getPool()` function

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
- Uses: Local `getPool()` function

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
- Uses: Local `getPool()` function

**Other Query Modules:**
- `bus-queries-pg.ts` — Event bus message queries
- `cooldown-queries-pg.ts` — Rate limiting and cooldown tracking
- `dex-queries-pg.ts` — Pokedex reference data queries

## Usage Notes

**Query Modules:**
- Each module has its own local `getPool()` function for pool resolution
- Pattern: Every exported query function accepts optional `pool?: Pool` parameter
- Testing: Pool override enables isolated unit tests without prod database
- Transactions: party-queries-pg.ts uses PoolClient support for atomic operations

Linked Routers:
- src/shared/ROUTER.md — Parent router for all shared modules
- src/shared/pg-connection.ts — Provides getProdDb() connection factory
- src/shared/pg-query.ts — Query builder utilities (buildSelect, buildInsert, etc.)
- src/types/db-models.ts — Type definitions for database entities
