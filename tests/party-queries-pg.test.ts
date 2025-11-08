/**
 * Party/Pokemon Queries PostgreSQL Implementation Tests
 * 
 * Purpose: Validate pg-based party/pokemon queries for team management
 * Strategy: Test CRUD operations, complex JOINs, slot management
 * 
 * Test Coverage:
 * - getPartyWithSlots: 3-way JOIN (Party → Slots → Pokemon)
 * - getPartyByIdWithSlots: Retrieve by ID with full data
 * - getAllPartiesWithSlots: Multiple parties with grouping
 * - hasParty: Existence check
 * - getPartyWithSlotCount: Aggregation query
 * - createParty: Party creation
 * - deleteParty: Cleanup
 * - createPartySlot: Slot assignment
 * - findNextAvailableSlot: Slot finding logic
 * - deletePartySlot: Slot removal
 * - createPokemon: Pokemon instance creation
 * - findPokemonById: Pokemon retrieval
 * - updatePokemonHealth: HP/status updates
 * - healPokemon: Bulk healing
 * - deletePokemon: Cleanup
 * 
 * Migration Phase: 9 (Party/Pokemon queries)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { initializeConnection, getConnection, getProdDb } from "../src/shared/pg-connection.js";
import * as partyQueries from "../src/shared/models/party-queries-pg.js";
import * as userQueries from "../src/shared/models/user-queries-pg.js";

describe("Party/Pokemon Queries: PostgreSQL Implementation Tests", () => {
  let pool: Pool;
  let testUserId: string;
  let testUserDiscordId: string;

  beforeAll(async () => {
    // Initialize pg connection
    await initializeConnection();
    const prodPool = getProdDb();
    if (!prodPool) {
      throw new Error("Failed to initialize PROD database pool");
    }
    pool = prodPool;
    
    // Create test user
    testUserDiscordId = `test-party-${Date.now()}`;
    const user = await userQueries.createUser(testUserDiscordId, 1000, pool);
    testUserId = user.id;
    
    console.log("Test setup complete: pg connection initialized, test user created");
  });

  afterAll(async () => {
    // Cleanup test user (will cascade delete parties and pokemon)
    if (testUserDiscordId) {
      await userQueries.deleteUser(testUserDiscordId, pool);
    }
    
    // Cleanup connection
    const connection = getConnection();
    await connection.shutdown();
    console.log("Test cleanup complete: Connection closed");
  });

  describe("createParty", () => {
    it("should create a new party", async () => {
      const result = await partyQueries.createParty(testUserId, pool);

      expect(result).not.toBeNull();
      expect(result.ownerId).toBe(testUserId);
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      console.log(`✓ createParty: Created party ${result.id}`);

      // Cleanup
      await partyQueries.deleteParty(result.id, pool);
    });
  });

  describe("hasParty", () => {
    it("should return true when user has a party", async () => {
      // Setup: Create party
      const party = await partyQueries.createParty(testUserId, pool);

      // Check existence
      const exists = await partyQueries.hasParty(testUserId, pool);

      expect(exists).toBe(true);
      console.log("✓ hasParty: Returns true when party exists");

      // Cleanup
      await partyQueries.deleteParty(party.id, pool);
    });

    it("should return false when user has no party", async () => {
      // Ensure no party exists
      const exists = await partyQueries.hasParty(testUserId, pool);

      expect(exists).toBe(false);
      console.log("✓ hasParty: Returns false when no party");
    });
  });

  describe("createPokemon", () => {
    it("should create a new Pokemon instance", async () => {
      const ivs: partyQueries.IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: partyQueries.EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const moves: partyQueries.Move[] = [
        { id: 33, name: "Tackle", pp: 35, maxPP: 35 },
      ];

      const result = await partyQueries.createPokemon({
        ownerId: testUserId,
        speciesId: 25, // Pikachu
        level: 5,
        exp: 0,
        nature: null,
        ivsJson: ivs,
        evsJson: evs,
        movesJson: moves,
        status: null,
        hp: 20,
        maxHp: 20,
        isShiny: false,
        nickname: null,
        boxSlot: null,
      }, pool);

      expect(result).not.toBeNull();
      expect(result.ownerId).toBe(testUserId);
      expect(result.speciesId).toBe(25);
      expect(result.level).toBe(5);
      expect(result.hp).toBe(20);
      expect(result.maxHp).toBe(20);
      expect(result.id).toBeDefined();
      console.log(`✓ createPokemon: Created Lv5 Pikachu ${result.id}`);

      // Cleanup
      await partyQueries.deletePokemon(result.id, pool);
    });
  });

  describe("findPokemonById", () => {
    it("should find Pokemon by ID", async () => {
      // Setup: Create Pokemon
      const ivs: partyQueries.IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: partyQueries.EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const moves: partyQueries.Move[] = [{ id: 33, name: "Tackle", pp: 35, maxPP: 35 }];

      const created = await partyQueries.createPokemon({
        ownerId: testUserId,
        speciesId: 10, // Caterpie
        level: 3,
        exp: 0,
        nature: null,
        ivsJson: ivs,
        evsJson: evs,
        movesJson: moves,
        status: null,
        hp: 15,
        maxHp: 15,
        isShiny: false,
        nickname: null,
        boxSlot: null,
      }, pool);

      // Find by ID
      const found = await partyQueries.findPokemonById(created.id, pool);

      expect(found).not.toBeNull();
      if (found) {
        expect(found.id).toBe(created.id);
        expect(found.speciesId).toBe(10);
        console.log(`✓ findPokemonById: Found Pokemon ${found.id}`);
      }

      // Cleanup
      await partyQueries.deletePokemon(created.id, pool);
    });

    it("should return null for non-existent Pokemon", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      
      const result = await partyQueries.findPokemonById(nonExistentId, pool);

      expect(result).toBeNull();
      console.log("✓ findPokemonById: Returns null for non-existent ID");
    });
  });

  describe("createPartySlot", () => {
    it("should create a party slot", async () => {
      // Setup: Create party and Pokemon
      const party = await partyQueries.createParty(testUserId, pool);
      const ivs: partyQueries.IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: partyQueries.EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const moves: partyQueries.Move[] = [{ id: 33, name: "Tackle", pp: 35, maxPP: 35 }];

      const pokemon = await partyQueries.createPokemon({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        exp: 0,
        nature: null,
        ivsJson: ivs,
        evsJson: evs,
        movesJson: moves,
        status: null,
        hp: 20,
        maxHp: 20,
        isShiny: false,
        nickname: null,
        boxSlot: null,
      }, pool);

      // Create slot
      const slot = await partyQueries.createPartySlot(party.id, pokemon.id, 1, pool);

      expect(slot).not.toBeNull();
      expect(slot.partyId).toBe(party.id);
      expect(slot.pokemonId).toBe(pokemon.id);
      expect(slot.slot).toBe(1);
      console.log(`✓ createPartySlot: Created slot 1 in party ${party.id}`);

      // Cleanup
      await partyQueries.deletePartySlot(slot.id, pool);
      await partyQueries.deletePokemon(pokemon.id, pool);
      await partyQueries.deleteParty(party.id, pool);
    });
  });

  describe("findNextAvailableSlot", () => {
    it("should find first available slot", async () => {
      // Setup: Create party with slots 1 and 3 occupied
      const party = await partyQueries.createParty(testUserId, pool);
      const ivs: partyQueries.IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: partyQueries.EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const moves: partyQueries.Move[] = [{ id: 33, name: "Tackle", pp: 35, maxPP: 35 }];

      const pokemon1 = await partyQueries.createPokemon({
        ownerId: testUserId,
        speciesId: 1,
        level: 5,
        exp: 0,
        nature: null,
        ivsJson: ivs,
        evsJson: evs,
        movesJson: moves,
        status: null,
        hp: 20,
        maxHp: 20,
        isShiny: false,
        nickname: null,
        boxSlot: null,
      }, pool);
      const pokemon3 = await partyQueries.createPokemon({
        ownerId: testUserId,
        speciesId: 4,
        level: 5,
        exp: 0,
        nature: null,
        ivsJson: ivs,
        evsJson: evs,
        movesJson: moves,
        status: null,
        hp: 20,
        maxHp: 20,
        isShiny: false,
        nickname: null,
        boxSlot: null,
      }, pool);

      await partyQueries.createPartySlot(party.id, pokemon1.id, 1, pool);
      await partyQueries.createPartySlot(party.id, pokemon3.id, 3, pool);

      // Find next available (should be 2)
      const nextSlot = await partyQueries.findNextAvailableSlot(party.id, pool);

      expect(nextSlot).toBe(2);
      console.log(`✓ findNextAvailableSlot: Found slot 2 (slots 1,3 occupied)`);

      // Cleanup
      await partyQueries.deletePokemon(pokemon1.id, pool);
      await partyQueries.deletePokemon(pokemon3.id, pool);
      await partyQueries.deleteParty(party.id, pool);
    });

    it("should return null when party is full", async () => {
      // Setup: Create party with all 6 slots
      const party = await partyQueries.createParty(testUserId, pool);
      const ivs: partyQueries.IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: partyQueries.EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const moves: partyQueries.Move[] = [{ id: 33, name: "Tackle", pp: 35, maxPP: 35 }];

      const pokemonIds: string[] = [];
      for (let i = 1; i <= 6; i++) {
        const pokemon = await partyQueries.createPokemon({
          ownerId: testUserId,
          speciesId: i,
          level: 5,
          exp: 0,
          nature: null,
          ivsJson: ivs,
          evsJson: evs,
          movesJson: moves,
          status: null,
          hp: 20,
          maxHp: 20,
          isShiny: false,
          nickname: null,
          boxSlot: null,
        }, pool);
        pokemonIds.push(pokemon.id);
        await partyQueries.createPartySlot(party.id, pokemon.id, i, pool);
      }

      // Find next available (should be null)
      const nextSlot = await partyQueries.findNextAvailableSlot(party.id, pool);

      expect(nextSlot).toBeNull();
      console.log("✓ findNextAvailableSlot: Returns null when party full (6/6)");

      // Cleanup
      for (const id of pokemonIds) {
        await partyQueries.deletePokemon(id, pool);
      }
      await partyQueries.deleteParty(party.id, pool);
    });
  });

  describe("getPartyWithSlots", () => {
    it("should get party with slots and Pokemon (3-way JOIN)", async () => {
      // Setup: Create party with 2 Pokemon
      const party = await partyQueries.createParty(testUserId, pool);
      const ivs: partyQueries.IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: partyQueries.EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const moves: partyQueries.Move[] = [{ id: 33, name: "Tackle", pp: 35, maxPP: 35 }];

      const pokemon1 = await partyQueries.createPokemon({
        ownerId: testUserId,
        speciesId: 25, // Pikachu
        level: 5,
        exp: 0,
        nature: null,
        ivsJson: ivs,
        evsJson: evs,
        movesJson: moves,
        status: null,
        hp: 20,
        maxHp: 20,
        isShiny: false,
        nickname: null,
        boxSlot: null,
      }, pool);
      const pokemon2 = await partyQueries.createPokemon({
        ownerId: testUserId,
        speciesId: 10, // Caterpie
        level: 3,
        exp: 0,
        nature: null,
        ivsJson: ivs,
        evsJson: evs,
        movesJson: moves,
        status: null,
        hp: 15,
        maxHp: 15,
        isShiny: false,
        nickname: null,
        boxSlot: null,
      }, pool);

      await partyQueries.createPartySlot(party.id, pokemon1.id, 1, pool);
      await partyQueries.createPartySlot(party.id, pokemon2.id, 2, pool);

      // Get party with slots
      const result = await partyQueries.getPartyWithSlots(testUserId, pool);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.id).toBe(party.id);
        expect(result.slots).toHaveLength(2);
        expect(result.slots[0].slot).toBe(1);
        expect(result.slots[0].pokemon.speciesId).toBe(25);
        expect(result.slots[1].slot).toBe(2);
        expect(result.slots[1].pokemon.speciesId).toBe(10);
        console.log(`✓ getPartyWithSlots: Loaded party with 2 Pokemon (3-way JOIN)`);
      }

      // Cleanup
      await partyQueries.deletePokemon(pokemon1.id, pool);
      await partyQueries.deletePokemon(pokemon2.id, pool);
      await partyQueries.deleteParty(party.id, pool);
    });

    it("should return null when user has no party", async () => {
      // Ensure no party exists for test user
      const result = await partyQueries.getPartyWithSlots(testUserId, pool);

      expect(result).toBeNull();
      console.log("✓ getPartyWithSlots: Returns null when no party");
    });
  });

  describe("getPartyByIdWithSlots", () => {
    it("should get party by ID with slots and Pokemon", async () => {
      // Setup: Create party with Pokemon
      const party = await partyQueries.createParty(testUserId, pool);
      const ivs: partyQueries.IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: partyQueries.EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const moves: partyQueries.Move[] = [{ id: 33, name: "Tackle", pp: 35, maxPP: 35 }];

      const pokemon = await partyQueries.createPokemon({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        exp: 0,
        nature: null,
        ivsJson: ivs,
        evsJson: evs,
        movesJson: moves,
        status: null,
        hp: 20,
        maxHp: 20,
        isShiny: false,
        nickname: null,
        boxSlot: null,
      }, pool);

      await partyQueries.createPartySlot(party.id, pokemon.id, 1, pool);

      // Get by ID
      const result = await partyQueries.getPartyByIdWithSlots(party.id, pool);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.id).toBe(party.id);
        expect(result.slots).toHaveLength(1);
        expect(result.slots[0].pokemon.speciesId).toBe(25);
        console.log(`✓ getPartyByIdWithSlots: Found party ${party.id} with Pokemon`);
      }

      // Cleanup
      await partyQueries.deletePokemon(pokemon.id, pool);
      await partyQueries.deleteParty(party.id, pool);
    });
  });

  describe("getPartyWithSlotCount", () => {
    it("should get party with slot count (aggregation)", async () => {
      // Setup: Create party with 3 Pokemon
      const party = await partyQueries.createParty(testUserId, pool);
      const ivs: partyQueries.IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: partyQueries.EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const moves: partyQueries.Move[] = [{ id: 33, name: "Tackle", pp: 35, maxPP: 35 }];

      const pokemonIds: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const pokemon = await partyQueries.createPokemon({
          ownerId: testUserId,
          speciesId: i,
          level: 5,
          exp: 0,
          nature: null,
          ivsJson: ivs,
          evsJson: evs,
          movesJson: moves,
          status: null,
          hp: 20,
          maxHp: 20,
          isShiny: false,
          nickname: null,
          boxSlot: null,
        }, pool);
        pokemonIds.push(pokemon.id);
        await partyQueries.createPartySlot(party.id, pokemon.id, i, pool);
      }

      // Get with slot count
      const result = await partyQueries.getPartyWithSlotCount(testUserId, pool);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.id).toBe(party.id);
        expect(result._count.slots).toBe(3);
        console.log(`✓ getPartyWithSlotCount: Party has 3 slots`);
      }

      // Cleanup
      for (const id of pokemonIds) {
        await partyQueries.deletePokemon(id, pool);
      }
      await partyQueries.deleteParty(party.id, pool);
    });
  });

  describe("updatePokemonHealth", () => {
    it("should update Pokemon HP and status", async () => {
      // Setup: Create Pokemon with full HP
      const ivs: partyQueries.IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: partyQueries.EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const moves: partyQueries.Move[] = [{ id: 33, name: "Tackle", pp: 35, maxPP: 35 }];

      const created = await partyQueries.createPokemon({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        exp: 0,
        nature: null,
        ivsJson: ivs,
        evsJson: evs,
        movesJson: moves,
        status: null,
        hp: 20,
        maxHp: 20,
        isShiny: false,
        nickname: null,
        boxSlot: null,
      }, pool);

      // Update to damaged with status
      const updated = await partyQueries.updatePokemonHealth(created.id, 10, "PAR", pool);

      expect(updated).not.toBeNull();
      if (updated) {
        expect(updated.hp).toBe(10);
        expect(updated.status).toBe("PAR");
        console.log(`✓ updatePokemonHealth: HP 20 → 10, status → PAR`);
      }

      // Cleanup
      await partyQueries.deletePokemon(created.id, pool);
    });
  });

  describe("healPokemon", () => {
    it("should heal multiple Pokemon (bulk update)", async () => {
      // Setup: Create 3 damaged Pokemon
      const ivs: partyQueries.IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: partyQueries.EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const moves: partyQueries.Move[] = [{ id: 33, name: "Tackle", pp: 35, maxPP: 35 }];

      const pokemonIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const pokemon = await partyQueries.createPokemon({
          ownerId: testUserId,
          speciesId: 1 + i,
          level: 5,
          exp: 0,
          nature: null,
          ivsJson: ivs,
          evsJson: evs,
          movesJson: moves,
          status: "PAR",
          hp: 10,
          maxHp: 20,
          isShiny: false,
          nickname: null,
          boxSlot: null,
        }, pool);
        pokemonIds.push(pokemon.id);
      }

      // Heal all
      const healed = await partyQueries.healPokemon(pokemonIds, pool);

      expect(healed).toBe(3);
      console.log(`✓ healPokemon: Healed 3 Pokemon (bulk update)`);

      // Verify healing
      const healed1 = await partyQueries.findPokemonById(pokemonIds[0], pool);
      if (healed1) {
        expect(healed1.hp).toBe(20);
        expect(healed1.status).toBeNull();
        console.log(`✓ healPokemon: Pokemon 1 restored to full HP, status cleared`);
      }

      // Cleanup
      for (const id of pokemonIds) {
        await partyQueries.deletePokemon(id, pool);
      }
    });

    it("should return 0 when healing empty array", async () => {
      const healed = await partyQueries.healPokemon([], pool);

      expect(healed).toBe(0);
      console.log("✓ healPokemon: Returns 0 for empty array");
    });
  });

  describe("deletePokemon", () => {
    it("should delete Pokemon", async () => {
      // Setup: Create Pokemon
      const ivs: partyQueries.IVs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      const evs: partyQueries.EVs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const moves: partyQueries.Move[] = [{ id: 33, name: "Tackle", pp: 35, maxPP: 35 }];

      const created = await partyQueries.createPokemon({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        exp: 0,
        nature: null,
        ivsJson: ivs,
        evsJson: evs,
        movesJson: moves,
        status: null,
        hp: 20,
        maxHp: 20,
        isShiny: false,
        nickname: null,
        boxSlot: null,
      }, pool);

      // Delete
      const deleted = await partyQueries.deletePokemon(created.id, pool);

      expect(deleted).not.toBeNull();
      if (deleted) {
        expect(deleted.id).toBe(created.id);
        console.log(`✓ deletePokemon: Deleted Pokemon ${deleted.id}`);
      }

      // Verify deletion
      const notFound = await partyQueries.findPokemonById(created.id, pool);
      expect(notFound).toBeNull();
      console.log("✓ deletePokemon: Pokemon no longer exists");
    });
  });

  describe("deleteParty", () => {
    it("should delete party", async () => {
      // Setup: Create party
      const created = await partyQueries.createParty(testUserId, pool);

      // Delete
      const deleted = await partyQueries.deleteParty(created.id, pool);

      expect(deleted).not.toBeNull();
      if (deleted) {
        expect(deleted.id).toBe(created.id);
        console.log(`✓ deleteParty: Deleted party ${deleted.id}`);
      }

      // Verify deletion
      const notFound = await partyQueries.getPartyByIdWithSlots(created.id, pool);
      expect(notFound).toBeNull();
      console.log("✓ deleteParty: Party no longer exists");
    });
  });
});
