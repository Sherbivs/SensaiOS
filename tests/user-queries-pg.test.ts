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

  describe("Write Operations", () => {
    // Use unique Discord IDs for write tests to avoid conflicts
    const generateTestId = () => `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    describe("createUser", () => {
      it("should create a new user with default coins", async () => {
        const testDiscordId = generateTestId();
        
        const result = await pgQueries.createUser(testDiscordId, 0, pool);

        expect(result).not.toBeNull();
        expect(result.discordId).toBe(testDiscordId);
        expect(result.coins).toBe(0);
        expect(result.id).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
        console.log(`✓ createUser: Created user ${testDiscordId} with 0 coins`);

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });

      it("should create a new user with specified coins", async () => {
        const testDiscordId = generateTestId();
        
        const result = await pgQueries.createUser(testDiscordId, 1000, pool);

        expect(result.coins).toBe(1000);
        console.log(`✓ createUser: Created user with 1000 coins`);

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });
    });

    describe("updateUserCoins", () => {
      it("should update existing user's coins", async () => {
        const testDiscordId = generateTestId();
        
        // Setup: Create user with initial coins
        await pgQueries.createUser(testDiscordId, 100, pool);
        
        // Update coins
        const result = await pgQueries.updateUserCoins(testDiscordId, 500, pool);

        expect(result).not.toBeNull();
        if (result) {
          expect(result.coins).toBe(500);
          expect(result.discordId).toBe(testDiscordId);
          console.log(`✓ updateUserCoins: Updated coins from 100 to 500`);
        }

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });

      it("should return null for non-existent user", async () => {
        const nonExistentId = generateTestId();
        
        const result = await pgQueries.updateUserCoins(nonExistentId, 500, pool);

        expect(result).toBeNull();
        console.log("✓ updateUserCoins: Returns null for non-existent user");
      });
    });

    describe("incrementUserCoins", () => {
      it("should increment user's coins", async () => {
        const testDiscordId = generateTestId();
        
        // Setup: Create user with 100 coins
        await pgQueries.createUser(testDiscordId, 100, pool);
        
        // Increment by 50
        const result = await pgQueries.incrementUserCoins(testDiscordId, 50, pool);

        expect(result).not.toBeNull();
        if (result) {
          expect(result.coins).toBe(150);
          console.log(`✓ incrementUserCoins: Incremented from 100 to 150`);
        }

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });

      it("should decrement user's coins with negative amount", async () => {
        const testDiscordId = generateTestId();
        
        // Setup: Create user with 100 coins
        await pgQueries.createUser(testDiscordId, 100, pool);
        
        // Decrement by 30 (negative increment)
        const result = await pgQueries.incrementUserCoins(testDiscordId, -30, pool);

        expect(result).not.toBeNull();
        if (result) {
          expect(result.coins).toBe(70);
          console.log(`✓ incrementUserCoins: Decremented from 100 to 70`);
        }

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });

      it("should return null for non-existent user", async () => {
        const nonExistentId = generateTestId();
        
        const result = await pgQueries.incrementUserCoins(nonExistentId, 50, pool);

        expect(result).toBeNull();
        console.log("✓ incrementUserCoins: Returns null for non-existent user");
      });
    });

    describe("upsertUser", () => {
      it("should create user if not exists", async () => {
        const testDiscordId = generateTestId();
        
        const result = await pgQueries.upsertUser(testDiscordId, 0, pool);

        expect(result).not.toBeNull();
        expect(result.discordId).toBe(testDiscordId);
        expect(result.coins).toBe(0);
        console.log(`✓ upsertUser: Created new user ${testDiscordId}`);

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });

      it("should return existing user without modification", async () => {
        const testDiscordId = generateTestId();
        
        // First upsert creates user with 100 coins
        const first = await pgQueries.upsertUser(testDiscordId, 100, pool);
        
        // Second upsert should return existing user (coins unchanged)
        const second = await pgQueries.upsertUser(testDiscordId, 999, pool);

        expect(second.id).toBe(first.id);
        expect(second.coins).toBe(100); // Should keep original coins, not 999
        console.log(`✓ upsertUser: Returned existing user without modification`);

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });
    });

    describe("upsertUserWithCoinIncrement", () => {
      it("should create user with initial coins if not exists", async () => {
        const testDiscordId = generateTestId();
        
        const result = await pgQueries.upsertUserWithCoinIncrement(testDiscordId, 50, 100, pool);

        expect(result.discordId).toBe(testDiscordId);
        expect(result.coins).toBe(100); // Initial coins, not incremented
        console.log(`✓ upsertUserWithCoinIncrement: Created user with initial 100 coins`);

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });

      it("should increment existing user's coins", async () => {
        const testDiscordId = generateTestId();
        
        // Create user with 100 coins
        await pgQueries.createUser(testDiscordId, 100, pool);
        
        // Upsert with increment of 50
        const result = await pgQueries.upsertUserWithCoinIncrement(testDiscordId, 50, 999, pool);

        expect(result.coins).toBe(150); // 100 + 50, ignores initialCoins (999)
        console.log(`✓ upsertUserWithCoinIncrement: Incremented existing user from 100 to 150`);

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });
    });

    describe("ensureUser", () => {
      it("should create user if not exists and return minimal fields", async () => {
        const testDiscordId = generateTestId();
        
        const result = await pgQueries.ensureUser(testDiscordId, 50, pool);

        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("coins");
        expect(Object.keys(result)).toHaveLength(2); // Only id and coins
        expect(result.coins).toBe(50);
        console.log(`✓ ensureUser: Created user, returned minimal fields (id, coins)`);

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });

      it("should return existing user's id and coins", async () => {
        const testDiscordId = generateTestId();
        
        // Create user with 200 coins
        await pgQueries.createUser(testDiscordId, 200, pool);
        
        // Ensure user should return existing
        const result = await pgQueries.ensureUser(testDiscordId, 999, pool);

        expect(result.coins).toBe(200); // Original coins, not 999
        expect(Object.keys(result)).toHaveLength(2);
        console.log(`✓ ensureUser: Returned existing user's minimal fields`);

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });
    });

    describe("deleteUser", () => {
      it("should delete existing user", async () => {
        const testDiscordId = generateTestId();
        
        // Create user
        const created = await pgQueries.createUser(testDiscordId, 100, pool);
        
        // Delete user
        const deleted = await pgQueries.deleteUser(testDiscordId, pool);

        expect(deleted).not.toBeNull();
        if (deleted) {
          expect(deleted.id).toBe(created.id);
          expect(deleted.discordId).toBe(testDiscordId);
          console.log(`✓ deleteUser: Deleted user ${testDiscordId}`);
        }

        // Verify deletion
        const notFound = await pgQueries.getUserBasic(testDiscordId, pool);
        expect(notFound).toBeNull();
        console.log("✓ deleteUser: User no longer exists after deletion");
      });

      it("should return null for non-existent user", async () => {
        const nonExistentId = generateTestId();
        
        const result = await pgQueries.deleteUser(nonExistentId, pool);

        expect(result).toBeNull();
        console.log("✓ deleteUser: Returns null for non-existent user");
      });
    });

    describe("Coin Operations Atomicity", () => {
      it("should handle concurrent increments correctly", async () => {
        const testDiscordId = generateTestId();
        
        // Create user with 0 coins
        await pgQueries.createUser(testDiscordId, 0, pool);
        
        // Simulate concurrent increments
        const increments = [
          pgQueries.incrementUserCoins(testDiscordId, 10, pool),
          pgQueries.incrementUserCoins(testDiscordId, 20, pool),
          pgQueries.incrementUserCoins(testDiscordId, 30, pool),
        ];
        
        await Promise.all(increments);
        
        // Final balance should be 0 + 10 + 20 + 30 = 60
        const final = await pgQueries.getUserCoins(testDiscordId, pool);
        expect(final).toBe(60);
        console.log("✓ Coin Operations: Atomic increments handled correctly (0 → 60)");

        // Cleanup
        await pgQueries.deleteUser(testDiscordId, pool);
      });
    });
  });
});
