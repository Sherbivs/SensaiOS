/**
 * Battle Queries PostgreSQL Implementation Tests
 * 
 * Purpose: Validate pg-based battle queries for PvP gameplay
 * Strategy: Test CRUD operations, state transitions, transactions
 * 
 * Test Coverage:
 * - findBattleById: Retrieve by ID
 * - findBattleWithPlayers: Retrieve with User JOIN
 * - findActiveOrPendingBattleForUser: Limit checks
 * - countBattlesByState: Aggregate queries
 * - createBattle: Challenge creation
 * - updateBattleState: State transitions
 * - updateBattleStateAndEnd: State + timestamp updates
 * - linkBattleToThread: Discord integration
 * - activateBattle: Atomic state + thread update
 * - concludeBattle: Transaction with coin rewards
 * - deleteBattle: Cleanup
 * 
 * Migration Phase: 8 (Battle queries)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { initializeConnection, getConnection, getProdDb } from "../src/shared/pg-connection.js";
import * as battleQueries from "../src/shared/models/battle-queries-pg.js";
import * as userQueries from "../src/shared/models/user-queries-pg.js";

describe("Battle Queries: PostgreSQL Implementation Tests", () => {
  let pool: Pool;
  let testUser1Id: string;
  let testUser2Id: string;
  let testUser1DiscordId: string;
  let testUser2DiscordId: string;

  beforeAll(async () => {
    // Initialize pg connection
    await initializeConnection();
    const prodPool = getProdDb();
    if (!prodPool) {
      throw new Error("Failed to initialize PROD database pool");
    }
    pool = prodPool;
    
    // Create test users for battle tests
    testUser1DiscordId = `test-battle-p1-${Date.now()}`;
    testUser2DiscordId = `test-battle-p2-${Date.now()}`;
    
    const user1 = await userQueries.createUser(testUser1DiscordId, 1000, pool);
    const user2 = await userQueries.createUser(testUser2DiscordId, 1000, pool);
    
    testUser1Id = user1.id;
    testUser2Id = user2.id;
    
    console.log("Test setup complete: pg connection initialized, 2 test users created");
  });

  afterAll(async () => {
    // Cleanup test users (will cascade delete battles)
    if (testUser1DiscordId) {
      await userQueries.deleteUser(testUser1DiscordId, pool);
    }
    if (testUser2DiscordId) {
      await userQueries.deleteUser(testUser2DiscordId, pool);
    }
    
    // Cleanup connection
    const connection = getConnection();
    await connection.shutdown();
    console.log("Test cleanup complete: Connection closed");
  });

  describe("createBattle", () => {
    it("should create a new battle with required fields", async () => {
      const result = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Pending",
        rngSeed: "test-seed-123",
        ruleset: "standard-v1",
      }, pool);

      expect(result).not.toBeNull();
      expect(result.p1Id).toBe(testUser1Id);
      expect(result.p2Id).toBe(testUser2Id);
      expect(result.state).toBe("Pending");
      expect(result.rngSeed).toBe("test-seed-123");
      expect(result.ruleset).toBe("standard-v1");
      expect(result.id).toBeDefined();
      expect(result.startedAt).toBeInstanceOf(Date);
      console.log(`✓ createBattle: Created battle ${result.id}`);

      // Cleanup
      await battleQueries.deleteBattle(result.id, pool);
    });

    it("should create battle with logCompact metadata", async () => {
      const metadata = { challengeChannelId: "123456789", guildId: "987654321" };
      
      const result = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Pending",
        rngSeed: "test-seed-456",
        ruleset: "standard-v1",
        logCompact: metadata,
      }, pool);

      expect(result.logCompact).toEqual(metadata);
      console.log("✓ createBattle: logCompact metadata stored");

      // Cleanup
      await battleQueries.deleteBattle(result.id, pool);
    });

    it("should create battle with arena thread ID", async () => {
      const threadId = "111222333444555666";
      
      const result = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Active",
        rngSeed: "test-seed-789",
        ruleset: "standard-v1",
        arenaThreadId: threadId,
      }, pool);

      expect(result.arenaThreadId).toBe(threadId);
      console.log("✓ createBattle: Arena thread ID linked");

      // Cleanup
      await battleQueries.deleteBattle(result.id, pool);
    });
  });

  describe("findBattleById", () => {
    it("should find existing battle by ID", async () => {
      // Setup: Create battle
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Pending",
        rngSeed: "find-test",
        ruleset: "standard-v1",
      }, pool);

      // Find by ID
      const found = await battleQueries.findBattleById(created.id, pool);

      expect(found).not.toBeNull();
      if (found) {
        expect(found.id).toBe(created.id);
        expect(found.state).toBe("Pending");
        console.log(`✓ findBattleById: Found battle ${found.id}`);
      }

      // Cleanup
      await battleQueries.deleteBattle(created.id, pool);
    });

    it("should return null for non-existent battle", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      
      const result = await battleQueries.findBattleById(nonExistentId, pool);

      expect(result).toBeNull();
      console.log("✓ findBattleById: Returns null for non-existent ID");
    });
  });

  describe("findBattleWithPlayers", () => {
    it("should find battle with player User records joined", async () => {
      // Setup: Create battle
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Active",
        rngSeed: "join-test",
        ruleset: "standard-v1",
      }, pool);

      // Find with players
      const found = await battleQueries.findBattleWithPlayers(created.id, pool);

      expect(found).not.toBeNull();
      if (found) {
        expect(found.id).toBe(created.id);
        expect(found.p1.id).toBe(testUser1Id);
        expect(found.p1.discordId).toBe(testUser1DiscordId);
        expect(found.p2.id).toBe(testUser2Id);
        expect(found.p2.discordId).toBe(testUser2DiscordId);
        console.log(`✓ findBattleWithPlayers: Found with p1 and p2 joined`);
      }

      // Cleanup
      await battleQueries.deleteBattle(created.id, pool);
    });

    it("should return null for non-existent battle", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      
      const result = await battleQueries.findBattleWithPlayers(nonExistentId, pool);

      expect(result).toBeNull();
      console.log("✓ findBattleWithPlayers: Returns null for non-existent ID");
    });
  });

  describe("findActiveOrPendingBattleForUser", () => {
    it("should find active battle for p1", async () => {
      // Setup: Create active battle
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Active",
        rngSeed: "active-test",
        ruleset: "standard-v1",
      }, pool);

      // Find active for p1
      const found = await battleQueries.findActiveOrPendingBattleForUser(testUser1DiscordId, pool);

      expect(found).not.toBeNull();
      if (found) {
        expect(found.id).toBe(created.id);
        expect(found.state).toBe("Active");
        console.log(`✓ findActiveOrPendingBattleForUser: Found active battle for p1`);
      }

      // Cleanup
      await battleQueries.deleteBattle(created.id, pool);
    });

    it("should find pending battle for p2", async () => {
      // Setup: Create pending battle
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Pending",
        rngSeed: "pending-test",
        ruleset: "standard-v1",
      }, pool);

      // Find pending for p2
      const found = await battleQueries.findActiveOrPendingBattleForUser(testUser2DiscordId, pool);

      expect(found).not.toBeNull();
      if (found) {
        expect(found.id).toBe(created.id);
        expect(found.state).toBe("Pending");
        console.log(`✓ findActiveOrPendingBattleForUser: Found pending battle for p2`);
      }

      // Cleanup
      await battleQueries.deleteBattle(created.id, pool);
    });

    it("should return null when no active/pending battles", async () => {
      // Setup: Create finished battle (should not be found)
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Finished",
        rngSeed: "finished-test",
        ruleset: "standard-v1",
      }, pool);

      // Find active/pending (should not find Finished)
      const found = await battleQueries.findActiveOrPendingBattleForUser(testUser1DiscordId, pool);

      // Should be null because Finished is not active/pending
      expect(found).toBeNull();
      console.log("✓ findActiveOrPendingBattleForUser: Returns null when only finished battles");

      // Cleanup
      await battleQueries.deleteBattle(created.id, pool);
    });
  });

  describe("countBattlesByState", () => {
    it("should count battles by state", async () => {
      // Setup: Create multiple battles
      const pending1 = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Pending",
        rngSeed: "count-test-1",
        ruleset: "standard-v1",
      }, pool);
      const pending2 = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Pending",
        rngSeed: "count-test-2",
        ruleset: "standard-v1",
      }, pool);

      // Count Pending
      const count = await battleQueries.countBattlesByState("Pending", pool);

      expect(count).toBeGreaterThanOrEqual(2);
      console.log(`✓ countBattlesByState: Counted ${count} Pending battles`);

      // Cleanup
      await battleQueries.deleteBattle(pending1.id, pool);
      await battleQueries.deleteBattle(pending2.id, pool);
    });
  });

  describe("updateBattleState", () => {
    it("should update battle state", async () => {
      // Setup: Create Pending battle
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Pending",
        rngSeed: "state-test",
        ruleset: "standard-v1",
      }, pool);

      // Update to Active
      const updated = await battleQueries.updateBattleState(created.id, "Active", pool);

      expect(updated).not.toBeNull();
      if (updated) {
        expect(updated.state).toBe("Active");
        console.log(`✓ updateBattleState: Pending → Active`);
      }

      // Cleanup
      await battleQueries.deleteBattle(created.id, pool);
    });

    it("should return null for non-existent battle", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      
      const result = await battleQueries.updateBattleState(nonExistentId, "Active", pool);

      expect(result).toBeNull();
      console.log("✓ updateBattleState: Returns null for non-existent ID");
    });
  });

  describe("updateBattleStateAndEnd", () => {
    it("should update state and endedAt timestamp", async () => {
      // Setup: Create Active battle
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Active",
        rngSeed: "end-test",
        ruleset: "standard-v1",
      }, pool);

      // Update to Finished with endedAt
      const endedAt = new Date();
      const updated = await battleQueries.updateBattleStateAndEnd(created.id, "Finished", endedAt, pool);

      expect(updated).not.toBeNull();
      if (updated) {
        expect(updated.state).toBe("Finished");
        expect(updated.endedAt).toBeInstanceOf(Date);
        console.log(`✓ updateBattleStateAndEnd: Active → Finished with timestamp`);
      }

      // Cleanup
      await battleQueries.deleteBattle(created.id, pool);
    });

    it("should handle Aborted state with endedAt", async () => {
      // Setup: Create Pending battle
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Pending",
        rngSeed: "abort-test",
        ruleset: "standard-v1",
      }, pool);

      // Update to Aborted with endedAt
      const endedAt = new Date();
      const updated = await battleQueries.updateBattleStateAndEnd(created.id, "Aborted", endedAt, pool);

      expect(updated).not.toBeNull();
      if (updated) {
        expect(updated.state).toBe("Aborted");
        expect(updated.endedAt).toBeInstanceOf(Date);
        console.log(`✓ updateBattleStateAndEnd: Pending → Aborted`);
      }

      // Cleanup
      await battleQueries.deleteBattle(created.id, pool);
    });
  });

  describe("linkBattleToThread", () => {
    it("should link battle to Discord thread", async () => {
      // Setup: Create battle
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Pending",
        rngSeed: "thread-test",
        ruleset: "standard-v1",
      }, pool);

      // Link to thread
      const threadId = "777888999000111222";
      const updated = await battleQueries.linkBattleToThread(created.id, threadId, pool);

      expect(updated).not.toBeNull();
      if (updated) {
        expect(updated.arenaThreadId).toBe(threadId);
        console.log(`✓ linkBattleToThread: Linked to thread ${threadId}`);
      }

      // Cleanup
      await battleQueries.deleteBattle(created.id, pool);
    });
  });

  describe("activateBattle", () => {
    it("should atomically update state to Active and link thread", async () => {
      // Setup: Create Pending battle
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Pending",
        rngSeed: "activate-test",
        ruleset: "standard-v1",
      }, pool);

      // Activate with thread
      const threadId = "333444555666777888";
      const updated = await battleQueries.activateBattle(created.id, threadId, pool);

      expect(updated).not.toBeNull();
      if (updated) {
        expect(updated.state).toBe("Active");
        expect(updated.arenaThreadId).toBe(threadId);
        console.log(`✓ activateBattle: Atomic state + thread update`);
      }

      // Cleanup
      await battleQueries.deleteBattle(created.id, pool);
    });
  });

  describe("concludeBattle", () => {
    it("should conclude battle with transaction (state + logs + coin rewards)", async () => {
      // Setup: Create Active battle
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Active",
        rngSeed: "conclude-test",
        ruleset: "standard-v1",
      }, pool);

      // Get initial coin balances
      const user1Before = await userQueries.getUserCoins(testUser1DiscordId, pool);
      const user2Before = await userQueries.getUserCoins(testUser2DiscordId, pool);

      // Conclude battle (p1 wins)
      const resultJson: battleQueries.BattleResultJson = {
        battleId: created.id,
        reason: "victory",
        turnCount: 10,
        rewards: { winner: 50, loser: 10 },
        winner: { userId: testUser1Id, discordId: testUser1DiscordId },
        loser: { userId: testUser2Id, discordId: testUser2DiscordId },
        recordedAt: new Date().toISOString(),
        winnerDiscordId: testUser1DiscordId,
        loserDiscordId: testUser2DiscordId,
      };
      const logFull = ["Turn 1: p1 used Tackle", "Turn 2: p2 used Scratch", "Battle ended"];
      const logCompact = { turns: 10, winner: "p1" };

      const concluded = await battleQueries.concludeBattle(
        created.id,
        testUser1Id,
        testUser2Id,
        resultJson,
        logFull,
        logCompact,
        50, // winner reward
        10, // loser reward
        pool
      );

      // Verify battle state
      expect(concluded.state).toBe("Finished");
      expect(concluded.endedAt).toBeInstanceOf(Date);
      expect(concluded.resultJson).toEqual(resultJson);
      expect(concluded.logFull).toEqual(logFull);

      // Verify coin rewards applied
      const user1After = await userQueries.getUserCoins(testUser1DiscordId, pool);
      const user2After = await userQueries.getUserCoins(testUser2DiscordId, pool);

      if (user1Before !== null && user1After !== null) {
        expect(user1After).toBe(user1Before + 50);
        console.log(`✓ concludeBattle: Winner received 50 coins (${user1Before} → ${user1After})`);
      }
      if (user2Before !== null && user2After !== null) {
        expect(user2After).toBe(user2Before + 10);
        console.log(`✓ concludeBattle: Loser received 10 coins (${user2Before} → ${user2After})`);
      }

      console.log("✓ concludeBattle: Transaction completed (battle + 2 user updates)");

      // Cleanup
      await battleQueries.deleteBattle(created.id, pool);
    });
  });

  describe("deleteBattle", () => {
    it("should delete battle", async () => {
      // Setup: Create battle
      const created = await battleQueries.createBattle({
        p1Id: testUser1Id,
        p2Id: testUser2Id,
        state: "Pending",
        rngSeed: "delete-test",
        ruleset: "standard-v1",
      }, pool);

      // Delete
      const deleted = await battleQueries.deleteBattle(created.id, pool);

      expect(deleted).not.toBeNull();
      if (deleted) {
        expect(deleted.id).toBe(created.id);
        console.log(`✓ deleteBattle: Deleted battle ${deleted.id}`);
      }

      // Verify deletion
      const notFound = await battleQueries.findBattleById(created.id, pool);
      expect(notFound).toBeNull();
      console.log("✓ deleteBattle: Battle no longer exists");
    });

    it("should return null for non-existent battle", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      
      const result = await battleQueries.deleteBattle(nonExistentId, pool);

      expect(result).toBeNull();
      console.log("✓ deleteBattle: Returns null for non-existent ID");
    });
  });
});
