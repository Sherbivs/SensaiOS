/**
 * Encounter Queries PostgreSQL Implementation Tests
 * 
 * Purpose: Validate pg-based encounter queries for core gameplay
 * Strategy: Test CRUD operations, state transitions, edge cases
 * 
 * Test Coverage:
 * - findEncounterById: Retrieve by ID
 * - findActiveEncounterForUser: Check for active spawned encounters
 * - findEncountersForUser: List with state filtering
 * - countEncountersByState: Count by state
 * - createEncounter: Spawn new encounter
 * - updateEncounterState: State transitions (Spawned → Caught/Fled/Expired)
 * - updateEncounterData: Track attempts, catch details
 * - updateEncounterStateAndData: Atomic updates
 * - linkEncounterToThread: Discord thread linking
 * - expireStaleEncounters: Batch expiration
 * - deleteEncounter: Cleanup
 * 
 * Migration Phase: 7 (Encounter queries)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { initializeConnection, getConnection, getProdDb } from "../src/shared/pg-connection.js";
import * as encounterQueries from "../src/shared/models/encounter-queries-pg.js";
import * as userQueries from "../src/shared/models/user-queries-pg.js";

describe("Encounter Queries: PostgreSQL Implementation Tests", () => {
  let pool: Pool;
  let testUserId: string;

  beforeAll(async () => {
    // Initialize pg connection
    await initializeConnection();
    const prodPool = getProdDb();
    if (!prodPool) {
      throw new Error("Failed to initialize PROD database pool");
    }
    pool = prodPool;
    
    // Create test user for encounter tests
    const testDiscordId = `test-encounter-${Date.now()}`;
    const testUser = await userQueries.createUser(testDiscordId, 100, pool);
    testUserId = testUser.id;
    
    console.log("Test setup complete: pg connection initialized, test user created");
  });

  afterAll(async () => {
    // Cleanup test user (will cascade delete encounters)
    if (testUserId) {
      const testUser = await pool.query('SELECT "discordId" FROM "User" WHERE "id" = $1', [testUserId]);
      if (testUser.rows[0]) {
        await userQueries.deleteUser(testUser.rows[0].discordId, pool);
      }
    }
    
    // Cleanup connection
    const connection = getConnection();
    await connection.shutdown();
    console.log("Test cleanup complete: Connection closed");
  });

  describe("createEncounter", () => {
    it("should create a new encounter with required fields", async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      
      const result = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25, // Pikachu
        level: 5,
        state: "Spawned",
        expiresAt,
      }, pool);

      expect(result).not.toBeNull();
      expect(result.ownerId).toBe(testUserId);
      expect(result.speciesId).toBe(25);
      expect(result.level).toBe(5);
      expect(result.state).toBe("Spawned");
      expect(result.id).toBeDefined();
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.expiresAt).toBeInstanceOf(Date);
      console.log(`✓ createEncounter: Created encounter ${result.id} (Lv5 Pikachu)`);

      // Cleanup
      await encounterQueries.deleteEncounter(result.id, pool);
    });

    it("should create encounter with dataJson", async () => {
      const dataJson = { attempts: 0, lastBall: "poke" };
      
      const result = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 10, // Caterpie
        level: 3,
        dataJson,
      }, pool);

      expect(result.dataJson).toEqual(dataJson);
      console.log("✓ createEncounter: dataJson stored correctly");

      // Cleanup
      await encounterQueries.deleteEncounter(result.id, pool);
    });

    it("should create encounter with thread channel ID", async () => {
      const threadChannelId = "123456789012345678";
      
      const result = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 16, // Pidgey
        level: 4,
        threadChannelId,
      }, pool);

      expect(result.threadChannelId).toBe(threadChannelId);
      console.log("✓ createEncounter: Thread channel ID linked");

      // Cleanup
      await encounterQueries.deleteEncounter(result.id, pool);
    });
  });

  describe("findEncounterById", () => {
    it("should find existing encounter by ID", async () => {
      // Setup: Create encounter
      const created = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
      }, pool);

      // Find by ID
      const found = await encounterQueries.findEncounterById(created.id, pool);

      expect(found).not.toBeNull();
      if (found) {
        expect(found.id).toBe(created.id);
        expect(found.speciesId).toBe(25);
        expect(found.level).toBe(5);
        console.log(`✓ findEncounterById: Found encounter ${found.id}`);
      }

      // Cleanup
      await encounterQueries.deleteEncounter(created.id, pool);
    });

    it("should return null for non-existent encounter", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      
      const result = await encounterQueries.findEncounterById(nonExistentId, pool);

      expect(result).toBeNull();
      console.log("✓ findEncounterById: Returns null for non-existent ID");
    });
  });

  describe("findActiveEncounterForUser", () => {
    it("should find active spawned encounter for user", async () => {
      // Setup: Create active encounter (expires in future)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const created = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        state: "Spawned",
        expiresAt,
      }, pool);

      // Find active
      const active = await encounterQueries.findActiveEncounterForUser(testUserId, pool);

      expect(active).not.toBeNull();
      if (active) {
        expect(active.id).toBe(created.id);
        expect(active.state).toBe("Spawned");
        console.log(`✓ findActiveEncounterForUser: Found active encounter`);
      }

      // Cleanup
      await encounterQueries.deleteEncounter(created.id, pool);
    });

    it("should return null when no active encounters exist", async () => {
      // Setup: Create non-active encounter (Caught state)
      const created = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        state: "Caught",
      }, pool);

      // Find active (should not find Caught encounters)
      const active = await encounterQueries.findActiveEncounterForUser(testUserId, pool);

      // Should be null because Caught is not active
      expect(active).toBeNull();
      console.log("✓ findActiveEncounterForUser: Returns null when no active encounters");

      // Cleanup
      await encounterQueries.deleteEncounter(created.id, pool);
    });

    it("should ignore expired encounters", async () => {
      // Setup: Create expired encounter (expiresAt in past)
      const expiresAt = new Date(Date.now() - 1000); // 1 second ago
      const created = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        state: "Spawned",
        expiresAt,
      }, pool);

      // Find active (should not find expired)
      const active = await encounterQueries.findActiveEncounterForUser(testUserId, pool);

      expect(active).toBeNull();
      console.log("✓ findActiveEncounterForUser: Ignores expired encounters");

      // Cleanup
      await encounterQueries.deleteEncounter(created.id, pool);
    });
  });

  describe("findEncountersForUser", () => {
    it("should find all encounters for user", async () => {
      // Setup: Create multiple encounters
      const enc1 = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        state: "Spawned",
      }, pool);
      const enc2 = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 10,
        level: 3,
        state: "Caught",
      }, pool);

      // Find all
      const all = await encounterQueries.findEncountersForUser(testUserId, undefined, 10, pool);

      expect(all.length).toBeGreaterThanOrEqual(2);
      console.log(`✓ findEncountersForUser: Found ${all.length} encounters`);

      // Cleanup
      await encounterQueries.deleteEncounter(enc1.id, pool);
      await encounterQueries.deleteEncounter(enc2.id, pool);
    });

    it("should filter encounters by state", async () => {
      // Setup: Create encounters with different states
      const spawned = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        state: "Spawned",
      }, pool);
      const caught = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 10,
        level: 3,
        state: "Caught",
      }, pool);

      // Find only Caught
      const caughtOnly = await encounterQueries.findEncountersForUser(testUserId, "Caught", 10, pool);

      expect(caughtOnly.every(e => e.state === "Caught")).toBe(true);
      console.log(`✓ findEncountersForUser: Filtered by state (Caught)`);

      // Cleanup
      await encounterQueries.deleteEncounter(spawned.id, pool);
      await encounterQueries.deleteEncounter(caught.id, pool);
    });

    it("should respect limit parameter", async () => {
      // Setup: Create encounters
      const encounters = await Promise.all([
        encounterQueries.createEncounter({ ownerId: testUserId, speciesId: 1, level: 5 }, pool),
        encounterQueries.createEncounter({ ownerId: testUserId, speciesId: 4, level: 5 }, pool),
        encounterQueries.createEncounter({ ownerId: testUserId, speciesId: 7, level: 5 }, pool),
      ]);

      // Find with limit 2
      const limited = await encounterQueries.findEncountersForUser(testUserId, undefined, 2, pool);

      expect(limited.length).toBeLessThanOrEqual(2);
      console.log(`✓ findEncountersForUser: Limit respected (${limited.length} results)`);

      // Cleanup
      for (const enc of encounters) {
        await encounterQueries.deleteEncounter(enc.id, pool);
      }
    });
  });

  describe("countEncountersByState", () => {
    it("should count encounters by state", async () => {
      // Setup: Create encounters
      const caught1 = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        state: "Caught",
      }, pool);
      const caught2 = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 10,
        level: 3,
        state: "Caught",
      }, pool);

      // Count Caught
      const count = await encounterQueries.countEncountersByState(testUserId, "Caught", pool);

      expect(count).toBeGreaterThanOrEqual(2);
      console.log(`✓ countEncountersByState: Counted ${count} Caught encounters`);

      // Cleanup
      await encounterQueries.deleteEncounter(caught1.id, pool);
      await encounterQueries.deleteEncounter(caught2.id, pool);
    });
  });

  describe("updateEncounterState", () => {
    it("should update encounter state", async () => {
      // Setup: Create Spawned encounter
      const created = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        state: "Spawned",
      }, pool);

      // Update to Caught
      const updated = await encounterQueries.updateEncounterState(created.id, "Caught", pool);

      expect(updated).not.toBeNull();
      if (updated) {
        expect(updated.state).toBe("Caught");
        console.log(`✓ updateEncounterState: Spawned → Caught`);
      }

      // Cleanup
      await encounterQueries.deleteEncounter(created.id, pool);
    });

    it("should return null for non-existent encounter", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      
      const result = await encounterQueries.updateEncounterState(nonExistentId, "Caught", pool);

      expect(result).toBeNull();
      console.log("✓ updateEncounterState: Returns null for non-existent ID");
    });
  });

  describe("updateEncounterData", () => {
    it("should update encounter dataJson", async () => {
      // Setup: Create encounter
      const created = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        dataJson: { attempts: 0 },
      }, pool);

      // Update data
      const newData = { attempts: 1, lastBall: "great", lastRoll: 0.45 };
      const updated = await encounterQueries.updateEncounterData(created.id, newData, pool);

      expect(updated).not.toBeNull();
      if (updated) {
        expect(updated.dataJson).toEqual(newData);
        console.log("✓ updateEncounterData: dataJson updated (attempts: 0 → 1)");
      }

      // Cleanup
      await encounterQueries.deleteEncounter(created.id, pool);
    });
  });

  describe("updateEncounterStateAndData", () => {
    it("should update state and data atomically", async () => {
      // Setup: Create Spawned encounter
      const created = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        state: "Spawned",
        dataJson: { attempts: 2 },
      }, pool);

      // Update both state and data
      const catchData = {
        attempts: 3,
        caughtAt: new Date().toISOString(),
        ball: "poke",
        pokemonId: "test-pokemon-id",
      };
      const updated = await encounterQueries.updateEncounterStateAndData(
        created.id,
        "Caught",
        catchData,
        pool
      );

      expect(updated).not.toBeNull();
      if (updated) {
        expect(updated.state).toBe("Caught");
        expect(updated.dataJson).toEqual(catchData);
        console.log("✓ updateEncounterStateAndData: Atomic update (state + data)");
      }

      // Cleanup
      await encounterQueries.deleteEncounter(created.id, pool);
    });
  });

  describe("linkEncounterToThread", () => {
    it("should link encounter to Discord thread", async () => {
      // Setup: Create encounter
      const created = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
      }, pool);

      // Link to thread
      const threadChannelId = "987654321098765432";
      const updated = await encounterQueries.linkEncounterToThread(created.id, threadChannelId, pool);

      expect(updated).not.toBeNull();
      if (updated) {
        expect(updated.threadChannelId).toBe(threadChannelId);
        console.log(`✓ linkEncounterToThread: Linked to thread ${threadChannelId}`);
      }

      // Cleanup
      await encounterQueries.deleteEncounter(created.id, pool);
    });
  });

  describe("expireStaleEncounters", () => {
    it("should expire encounters past their expiresAt timestamp", async () => {
      // Setup: Create expired encounter
      const expiresAt = new Date(Date.now() - 1000); // 1 second ago
      const created = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        state: "Spawned",
        expiresAt,
      }, pool);

      // Run expiration
      const count = await encounterQueries.expireStaleEncounters(pool);

      expect(count).toBeGreaterThanOrEqual(1);
      console.log(`✓ expireStaleEncounters: Expired ${count} stale encounter(s)`);

      // Verify state changed
      const updated = await encounterQueries.findEncounterById(created.id, pool);
      expect(updated?.state).toBe("Expired");

      // Cleanup
      await encounterQueries.deleteEncounter(created.id, pool);
    });

    it("should not expire encounters without expiresAt", async () => {
      // Setup: Create encounter without expiry
      const created = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
        state: "Spawned",
        // No expiresAt
      }, pool);

      // Run expiration
      await encounterQueries.expireStaleEncounters(pool);

      // Verify state unchanged
      const unchanged = await encounterQueries.findEncounterById(created.id, pool);
      expect(unchanged?.state).toBe("Spawned");
      console.log("✓ expireStaleEncounters: Skips encounters without expiresAt");

      // Cleanup
      await encounterQueries.deleteEncounter(created.id, pool);
    });
  });

  describe("deleteEncounter", () => {
    it("should delete encounter", async () => {
      // Setup: Create encounter
      const created = await encounterQueries.createEncounter({
        ownerId: testUserId,
        speciesId: 25,
        level: 5,
      }, pool);

      // Delete
      const deleted = await encounterQueries.deleteEncounter(created.id, pool);

      expect(deleted).not.toBeNull();
      if (deleted) {
        expect(deleted.id).toBe(created.id);
        console.log(`✓ deleteEncounter: Deleted encounter ${deleted.id}`);
      }

      // Verify deletion
      const notFound = await encounterQueries.findEncounterById(created.id, pool);
      expect(notFound).toBeNull();
      console.log("✓ deleteEncounter: Encounter no longer exists");
    });

    it("should return null for non-existent encounter", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      
      const result = await encounterQueries.deleteEncounter(nonExistentId, pool);

      expect(result).toBeNull();
      console.log("✓ deleteEncounter: Returns null for non-existent ID");
    });
  });
});
