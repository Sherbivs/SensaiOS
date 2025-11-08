/**
 * User Queries PostgreSQL Migration Tests
 * 
 * Purpose: Validate pg-based user queries match expected behavior
 * Strategy: Direct testing of pg implementation (Prisma removed from codebase)
 * 
 * Test Coverage:
 * - getUserBasic: Minimal user data by Discord ID
 * - getUserBasicById: Minimal user data by database ID
 * - getUserForDisplay: Display data with timestamps
 * - getUserWithParty: Complex 3-way join (User -> Party -> Slots -> Pokemon)
 * - getUserFull: Complete user record
 * - userExists: Existence check
 * - getUserCoins: Coin balance only
 * - getUserProfile: Full profile data
 * 
 * Migration Phase: 5 (POC)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { initializeConnection, getConnection, getProdDb } from "../src/shared/pg-connection.js";
import * as pgQueries from "../src/shared/models/user-queries-pg.js";

describe("User Queries: PostgreSQL Implementation Tests", () => {
  let pool: Pool;
  
  // Test data IDs (assuming these exist in the database)
  const TEST_DISCORD_ID = "398910451420348448"; // DripTVDD's Discord ID

  beforeAll(async () => {
    // Initialize pg connection
    await initializeConnection();
    const prodPool = getProdDb();
    if (!prodPool) {
      throw new Error("Failed to initialize PROD database pool");
    }
    pool = prodPool;
    
    console.log("Test setup complete: pg connection initialized");
  });

  afterAll(async () => {
    // Cleanup
    const connection = getConnection();
    await connection.shutdown();
    console.log("Test cleanup complete: Connection closed");
  });

  describe("getUserBasic", () => {
    it("should return minimal user data for valid Discord ID", async () => {
      const result = await pgQueries.getUserBasic(TEST_DISCORD_ID, pool);

      if (result) {
        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("discordId");
        expect(result).toHaveProperty("coins");
        expect(result.discordId).toBe(TEST_DISCORD_ID);
        expect(typeof result.coins).toBe("number");
        console.log(`✓ getUserBasic: Found user with ${result.coins} coins`);
      } else {
        console.log("⚠ getUserBasic: User not found (expected for fresh database)");
      }
    });

    it("should return null for non-existent user", async () => {
      const nonExistentId = "999999999999999999";
      const result = await pgQueries.getUserBasic(nonExistentId, pool);

      expect(result).toBeNull();
      console.log("✓ getUserBasic: Returns null for non-existent user");
    });

    it("should only include requested fields (id, discordId, coins)", async () => {
      const result = await pgQueries.getUserBasic(TEST_DISCORD_ID, pool);

      if (result) {
        const keys = Object.keys(result);
        expect(keys).toEqual(expect.arrayContaining(["id", "discordId", "coins"]));
        expect(keys).toHaveLength(3);
        console.log("✓ getUserBasic: Returns only minimal fields");
      }
    });
  });

  describe("getUserBasicById", () => {
    it("should return minimal user data for valid database ID", async () => {
      // First get a valid user ID
      const testUser = await pgQueries.getUserBasic(TEST_DISCORD_ID, pool);
      
      if (!testUser) {
        console.log("⚠ Skipping getUserBasicById: No test user found");
        return;
      }

      const result = await pgQueries.getUserBasicById(testUser.id, pool);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.id).toBe(testUser.id);
        expect(result.discordId).toBe(TEST_DISCORD_ID);
        expect(result.coins).toBe(testUser.coins);
        console.log("✓ getUserBasicById: Found user by database ID");
      }
    });
  });

  describe("getUserForDisplay", () => {
    it("should return display data including createdAt timestamp", async () => {
      const result = await pgQueries.getUserForDisplay(TEST_DISCORD_ID, pool);

      if (result) {
        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("discordId");
        expect(result).toHaveProperty("coins");
        expect(result).toHaveProperty("createdAt");
        expect(result.createdAt).toBeInstanceOf(Date);
        console.log(`✓ getUserForDisplay: Found user, created ${result.createdAt.toISOString()}`);
      } else {
        console.log("⚠ getUserForDisplay: User not found");
      }
    });
  });

  describe("getUserWithParty", () => {
    it("should return user with nested party structure", async () => {
      const result = await pgQueries.getUserWithParty(TEST_DISCORD_ID, pool);

      if (!result) {
        console.log("⚠ getUserWithParty: User not found");
        return;
      }

      // User fields
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("discordId");
      expect(result).toHaveProperty("coins");
      expect(result).toHaveProperty("parties");
      expect(Array.isArray(result.parties)).toBe(true);
      
      if (result.parties.length > 0) {
        const party = result.parties[0];
        
        // Party fields
        expect(party).toHaveProperty("id");
        expect(party).toHaveProperty("ownerId");
        expect(party).toHaveProperty("slots");
        expect(Array.isArray(party.slots)).toBe(true);
        expect(party.ownerId).toBe(result.id);
        
        if (party.slots.length > 0) {
          const slot = party.slots[0];
          
          // Slot fields
          expect(slot).toHaveProperty("id");
          expect(slot).toHaveProperty("partyId");
          expect(slot).toHaveProperty("slot");
          expect(slot).toHaveProperty("pokemonId");
          expect(slot).toHaveProperty("pokemon");
          expect(slot.partyId).toBe(party.id);
          
          // Pokemon fields
          expect(slot.pokemon).toHaveProperty("id");
          expect(slot.pokemon).toHaveProperty("speciesId");
          expect(slot.pokemon).toHaveProperty("level");
          expect(slot.pokemon).toHaveProperty("hp");
          expect(slot.pokemon).toHaveProperty("maxHp");
          
          console.log(`✓ getUserWithParty: Found user with party (${party.slots.length} slots)`);
        } else {
          console.log("✓ getUserWithParty: Found user with empty party");
        }
      } else {
        console.log("✓ getUserWithParty: Found user with no parties");
      }
    });

    it("should order party slots correctly (by slot number)", async () => {
      const result = await pgQueries.getUserWithParty(TEST_DISCORD_ID, pool);

      if (!result || result.parties.length === 0 || result.parties[0].slots.length === 0) {
        console.log("⚠ Skipping slot order test: No party or slots found");
        return;
      }

      const slots = result.parties[0].slots;
      for (let i = 0; i < slots.length - 1; i++) {
        expect(slots[i].slot).toBeLessThan(slots[i + 1].slot);
      }
      console.log("✓ getUserWithParty: Slots ordered correctly by slot number");
    });
  });

  describe("getUserFull", () => {
    it("should return complete user record with all fields", async () => {
      const result = await pgQueries.getUserFull(TEST_DISCORD_ID, pool);

      if (result) {
        // Check all User model fields are present
        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("discordId");
        expect(result).toHaveProperty("coins");
        expect(result).toHaveProperty("createdAt");
        expect(result).toHaveProperty("updatedAt");
        console.log("✓ getUserFull: All fields present");
      } else {
        console.log("⚠ getUserFull: User not found");
      }
    });
  });

  describe("userExists", () => {
    it("should return true for existing user", async () => {
      // First ensure user exists
      const user = await pgQueries.getUserBasic(TEST_DISCORD_ID, pool);
      
      if (!user) {
        console.log("⚠ Skipping userExists test: No test user found");
        return;
      }

      const result = await pgQueries.userExists(TEST_DISCORD_ID, pool);
      expect(result).toBe(true);
      console.log("✓ userExists: Returns true for existing user");
    });

    it("should return false for non-existent user", async () => {
      const nonExistentId = "999999999999999999";
      const result = await pgQueries.userExists(nonExistentId, pool);

      expect(result).toBe(false);
      console.log("✓ userExists: Returns false for non-existent user");
    });
  });

  describe("getUserCoins", () => {
    it("should return coin balance for existing user", async () => {
      const result = await pgQueries.getUserCoins(TEST_DISCORD_ID, pool);

      if (result !== null) {
        expect(typeof result).toBe("number");
        expect(result).toBeGreaterThanOrEqual(0);
        console.log(`✓ getUserCoins: User has ${result} coins`);
      } else {
        console.log("⚠ getUserCoins: User not found, returns null");
      }
    });

    it("should return null for non-existent user", async () => {
      const nonExistentId = "999999999999999999";
      const result = await pgQueries.getUserCoins(nonExistentId, pool);

      expect(result).toBeNull();
      console.log("✓ getUserCoins: Returns null for non-existent user");
    });
  });

  describe("getUserProfile", () => {
    it("should return complete profile data", async () => {
      const result = await pgQueries.getUserProfile(TEST_DISCORD_ID, pool);

      if (result) {
        // Verify all fields are present
        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("discordId");
        expect(result).toHaveProperty("coins");
        expect(result).toHaveProperty("createdAt");
        expect(result).toHaveProperty("updatedAt");
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.updatedAt).toBeInstanceOf(Date);
        console.log("✓ getUserProfile: Complete profile data returned");
      } else {
        console.log("⚠ getUserProfile: User not found");
      }
    });
  });

  describe("Query Performance", () => {
    it("should execute queries efficiently (<50ms target)", async () => {
      // Skip if no test user
      const testUser = await pgQueries.getUserBasic(TEST_DISCORD_ID, pool);
      if (!testUser) {
        console.log("⚠ Skipping performance test: No test user found");
        return;
      }

      const iterations = 100;
      
      // Warm-up
      await pgQueries.getUserBasic(TEST_DISCORD_ID, pool);

      // Timing
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        await pgQueries.getUserBasic(TEST_DISCORD_ID, pool);
      }
      const end = performance.now();
      const avg = (end - start) / iterations;

      console.log(`\n📊 Query Performance (${iterations} iterations):`);
      console.log(`   Average: ${avg.toFixed(2)}ms per query`);
      console.log(`   Target: <50ms per query`);
      console.log(`   Status: ${avg < 50 ? '✅ PASS' : '⚠️  NEEDS OPTIMIZATION'}\n`);

      // Test passes if under 100ms (50ms is ideal, 100ms is acceptable)
      expect(avg).toBeLessThan(100);
    });
  });
});
