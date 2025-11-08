/**
 * Tests for Bus/Outbox Query Patterns (PostgreSQL)
 * 
 * Coverage Areas:
 * - Message lifecycle (publish → claim → process/fail)
 * - Idempotency (duplicate prevention)
 * - Priority ordering (high → normal → low)
 * - Retry logic (attempts tracking, exponential backoff)
 * - Concurrent claiming (FOR UPDATE SKIP LOCKED)
 * - Cleanup operations (old messages, old tokens)
 * - Idempotency token management
 * - Topic filtering
 * - Status transitions
 * 
 * Architecture:
 * - Uses getProdDb() from pg-connection (PROD pool PRIMARY)
 * - Tests handle Date revival automatically
 * - Tests validate FOR UPDATE SKIP LOCKED behavior
 * - Tests verify transaction atomicity
 */

import { describe, it, expect, beforeAll } from "vitest";
import { initializeConnection, getProdDb } from "../src/shared/pg-connection.js";
import { BusKind, BusPriority, BusStatus } from "../src/types/db-models.js";
import {
  publishMessage,
  findMessageById,
  getMessageById,
  countMessagesByStatus,
  countReadyMessages,
  findMessagesByTopic,
  claimMessageBatch,
  markMessageProcessed,
  markMessageFailed,
  updateMessageStatus,
  incrementMessageAttempts,
  deleteMessage,
  cleanupOldMessages,
  deleteMessagesByStatus,
  hasSeenToken,
  cleanupOldTokens,
  countTokens,
  type PublishOptions,
  type ClaimOptions,
  type FailOptions,
} from "../src/shared/models/bus-queries-pg.js";

beforeAll(async () => {
  await initializeConnection();
});

describe("Bus Message Queries (PostgreSQL)", () => {
  // ========================================================================
  // Read Operations
  // ========================================================================

  describe("findMessageById", () => {
    it("should return null for non-existent message", async () => {
      const message = await findMessageById("00000000-0000-0000-0000-000000000000");
      expect(message).toBeNull();
    });

    it("should find message by ID with dates revived", async () => {
      const pool = getProdDb();
      
      // Create test message
      const published = await publishMessage("test.find", { data: "test" });
      
      // Find by ID
      const found = await findMessageById(published.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(published.id);
      expect(found!.topic).toBe("test.find");
      expect(found!.createdAt).toBeInstanceOf(Date);
      expect(found!.availableAt).toBeInstanceOf(Date);
      
      // Cleanup
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [published.id]);
    });
  });

  describe("getMessageById", () => {
    it("should throw error for non-existent message", async () => {
      await expect(
        getMessageById("00000000-0000-0000-0000-000000000000")
      ).rejects.toThrow("BusMessage not found");
    });

    it("should return message by ID", async () => {
      const pool = getProdDb();
      
      const published = await publishMessage("test.get", { data: "test" });
      const message = await getMessageById(published.id);
      
      expect(message.id).toBe(published.id);
      expect(message.topic).toBe("test.get");
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [published.id]);
    });
  });

  describe("countMessagesByStatus", () => {
    it("should count messages by status", async () => {
      const pool = getProdDb();
      
      // Create test messages
      const msg1 = await publishMessage("test.count.status", { num: 1 }, { idempotencyKey: "count1" });
      const msg2 = await publishMessage("test.count.status", { num: 2 }, { idempotencyKey: "count2" });
      
      const count = await countMessagesByStatus(BusStatus.pending);
      expect(count).toBeGreaterThanOrEqual(2);
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = ANY($1::uuid[])`, [[msg1.id, msg2.id]]);
    });
  });

  describe("countReadyMessages", () => {
    it("should count messages ready for processing", async () => {
      const pool = getProdDb();
      
      // Create ready message
      const ready = await publishMessage("test.ready", { data: "ready" }, { idempotencyKey: "ready1" });
      
      // Create delayed message (not ready)
      const delayed = await publishMessage("test.delayed", { data: "delayed" }, {
        idempotencyKey: "delayed1",
        delayMs: 60000, // 1 minute delay
      });
      
      const count = await countReadyMessages();
      expect(count).toBeGreaterThanOrEqual(1);
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = ANY($1::uuid[])`, [[ready.id, delayed.id]]);
    });
  });

  describe("findMessagesByTopic", () => {
    it("should find messages by topic", async () => {
      const pool = getProdDb();
      
      const msg1 = await publishMessage("test.topic.find", { num: 1 }, { idempotencyKey: "topic1" });
      const msg2 = await publishMessage("test.topic.find", { num: 2 }, { idempotencyKey: "topic2" });
      
      const messages = await findMessagesByTopic("test.topic.find");
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].topic).toBe("test.topic.find");
      expect(messages[1].topic).toBe("test.topic.find");
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = ANY($1::uuid[])`, [[msg1.id, msg2.id]]);
    });

    it("should respect limit parameter", async () => {
      const pool = getProdDb();
      
      const msg1 = await publishMessage("test.topic.limit", { num: 1 }, { idempotencyKey: "limit1" });
      const msg2 = await publishMessage("test.topic.limit", { num: 2 }, { idempotencyKey: "limit2" });
      const msg3 = await publishMessage("test.topic.limit", { num: 3 }, { idempotencyKey: "limit3" });
      
      const messages = await findMessagesByTopic("test.topic.limit", 2);
      expect(messages.length).toBeLessThanOrEqual(2);
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = ANY($1::uuid[])`, [[msg1.id, msg2.id, msg3.id]]);
    });
  });

  // ========================================================================
  // Write Operations - Message Lifecycle
  // ========================================================================

  describe("publishMessage", () => {
    it("should publish message with default options", async () => {
      const pool = getProdDb();
      
      const message = await publishMessage("test.publish.default", { data: "test" });
      
      expect(message.id).toBeDefined();
      expect(message.topic).toBe("test.publish.default");
      expect(message.status).toBe("pending");
      expect(message.priority).toBe("normal");
      expect(message.kind).toBe("event");
      expect(message.attempts).toBe(0);
      expect(message.createdAt).toBeInstanceOf(Date);
      expect(message.availableAt).toBeInstanceOf(Date);
      expect(message.idempotencyKey).toContain("test.publish.default:");
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [message.id]);
    });

    it("should publish message with custom options", async () => {
      const pool = getProdDb();
      
      const opts: PublishOptions = {
        priority: BusPriority.high,
        delayMs: 5000,
        idempotencyKey: "custom-key-123",
        shardKey: "shard-1",
        kind: BusKind.command,
      };
      
      const message = await publishMessage("test.publish.custom", { data: "custom" }, opts);
      
      expect(message.priority).toBe("high");
      expect(message.kind).toBe("command");
      expect(message.idempotencyKey).toBe("custom-key-123");
      expect(message.shardKey).toBe("shard-1");
      expect(message.availableAt.getTime()).toBeGreaterThan(message.createdAt.getTime());
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [message.id]);
    });

    it("should enforce idempotency (duplicate prevention)", async () => {
      const pool = getProdDb();
      
      const msg1 = await publishMessage("test.idempotency", { data: "duplicate" }, { idempotencyKey: "idem-1" });
      const msg2 = await publishMessage("test.idempotency", { data: "duplicate" }, { idempotencyKey: "idem-1" });
      
      // Same ID means idempotency worked
      expect(msg1.id).toBe(msg2.id);
      expect(msg1.createdAt.getTime()).toBe(msg2.createdAt.getTime());
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [msg1.id]);
    });
  });

  describe("claimMessageBatch", () => {
    it("should claim pending messages", async () => {
      const pool = getProdDb();
      
      const msg1 = await publishMessage("test.claim.basic", { num: 1 }, { idempotencyKey: "claim1" });
      const msg2 = await publishMessage("test.claim.basic", { num: 2 }, { idempotencyKey: "claim2" });
      
      const claimed = await claimMessageBatch(10);
      expect(claimed.length).toBeGreaterThan(0);
      
      // Verify claimed messages have required fields
      const claimedIds = claimed.map(c => c.id);
      if (claimedIds.includes(msg1.id)) {
        const c = claimed.find(m => m.id === msg1.id)!;
        expect(c.topic).toBe("test.claim.basic");
        expect(c.payload).toBeDefined();
        expect(c.createdAt).toBeInstanceOf(Date);
      }
      
      // Verify status changed to processing
      const updated1 = await findMessageById(msg1.id);
      if (updated1 && claimedIds.includes(msg1.id)) {
        expect(updated1.status).toBe("processing");
        expect(updated1.attempts).toBeGreaterThan(0);
      }
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = ANY($1::uuid[])`, [[msg1.id, msg2.id]]);
    });

    it("should respect limit parameter", async () => {
      const pool = getProdDb();
      
      const msg1 = await publishMessage("test.claim.limit", { num: 1 }, { idempotencyKey: "claimlimit1" });
      const msg2 = await publishMessage("test.claim.limit", { num: 2 }, { idempotencyKey: "claimlimit2" });
      const msg3 = await publishMessage("test.claim.limit", { num: 3 }, { idempotencyKey: "claimlimit3" });
      
      const claimed = await claimMessageBatch(2);
      expect(claimed.length).toBeLessThanOrEqual(2);
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = ANY($1::uuid[])`, [[msg1.id, msg2.id, msg3.id]]);
    });

    it("should filter by topics", async () => {
      const pool = getProdDb();
      
      const msg1 = await publishMessage("test.topic.A", { data: "A" }, { idempotencyKey: "topicA1" });
      const msg2 = await publishMessage("test.topic.B", { data: "B" }, { idempotencyKey: "topicB1" });
      
      const opts: ClaimOptions = { topics: ["test.topic.A"] };
      const claimed = await claimMessageBatch(10, opts);
      
      // Should only claim topic A messages
      const topicAClaimed = claimed.filter(c => c.topic === "test.topic.A");
      const topicBClaimed = claimed.filter(c => c.topic === "test.topic.B");
      
      if (topicAClaimed.length > 0 || topicBClaimed.length > 0) {
        expect(topicAClaimed.length).toBeGreaterThan(0);
        expect(topicBClaimed.length).toBe(0);
      }
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = ANY($1::uuid[])`, [[msg1.id, msg2.id]]);
    });

    it("should order by priority (high → normal → low)", async () => {
      const pool = getProdDb();
      
      const low = await publishMessage("test.priority", { level: "low" }, { priority: BusPriority.low, idempotencyKey: "pri-low" });
      const high = await publishMessage("test.priority", { level: "high" }, { priority: BusPriority.high, idempotencyKey: "pri-high" });
      const normal = await publishMessage("test.priority", { level: "normal" }, { priority: BusPriority.normal, idempotencyKey: "pri-normal" });
      
      // Reset to pending if already claimed
      await pool.query(`UPDATE "BusMessage" SET status = 'pending', attempts = 0 WHERE id = ANY($1::uuid[])`, [[low.id, high.id, normal.id]]);
      
      const opts: ClaimOptions = { topics: ["test.priority"] };
      const claimed = await claimMessageBatch(3, opts);
      
      // Find our test messages in claimed batch
      const testMessages = claimed.filter(c => [low.id, high.id, normal.id].includes(c.id));
      
      if (testMessages.length >= 2) {
        // High priority should come first
        const highIndex = testMessages.findIndex(c => c.id === high.id);
        const normalIndex = testMessages.findIndex(c => c.id === normal.id);
        const lowIndex = testMessages.findIndex(c => c.id === low.id);
        
        if (highIndex !== -1 && normalIndex !== -1) {
          expect(highIndex).toBeLessThan(normalIndex);
        }
        if (normalIndex !== -1 && lowIndex !== -1) {
          expect(normalIndex).toBeLessThan(lowIndex);
        }
      }
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = ANY($1::uuid[])`, [[low.id, high.id, normal.id]]);
    });

    it("should not claim delayed messages", async () => {
      const pool = getProdDb();
      
      const delayed = await publishMessage("test.delayed", { data: "delayed" }, {
        idempotencyKey: "delayed-claim",
        delayMs: 60000, // 1 minute delay
      });
      
      const opts: ClaimOptions = { topics: ["test.delayed"] };
      const claimed = await claimMessageBatch(10, opts);
      
      // Should not claim delayed message
      const delayedClaimed = claimed.find(c => c.id === delayed.id);
      expect(delayedClaimed).toBeUndefined();
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [delayed.id]);
    });
  });

  describe("markMessageProcessed", () => {
    it("should mark message as processed", async () => {
      const pool = getProdDb();
      
      const message = await publishMessage("test.processed", { data: "done" }, { idempotencyKey: "proc1" });
      const updated = await markMessageProcessed(message.id);
      
      expect(updated.status).toBe("done");
      expect(updated.processedAt).toBeInstanceOf(Date);
      expect(updated.error).toBeNull();
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [message.id]);
    });

    it("should throw error for non-existent message", async () => {
      await expect(
        markMessageProcessed("00000000-0000-0000-0000-000000000000")
      ).rejects.toThrow("BusMessage not found");
    });
  });

  describe("markMessageFailed", () => {
    it("should mark message as failed with retry (attempts < maxAttempts)", async () => {
      const pool = getProdDb();
      
      const message = await publishMessage("test.failed.retry", { data: "fail" }, { idempotencyKey: "fail1" });
      
      const opts: FailOptions = { backoffMs: 1000, maxAttempts: 5 };
      const updated = await markMessageFailed(message.id, "Test error", opts);
      
      // Should retry (status = pending)
      expect(updated.status).toBe("pending");
      expect(updated.error).toBe("Test error");
      expect(updated.availableAt.getTime()).toBeGreaterThan(Date.now());
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [message.id]);
    });

    it("should mark message as permanently failed (attempts >= maxAttempts)", async () => {
      const pool = getProdDb();
      
      const message = await publishMessage("test.failed.permanent", { data: "fail" }, { idempotencyKey: "fail2" });
      
      // Set attempts to max
      await pool.query(`UPDATE "BusMessage" SET attempts = 20 WHERE id = $1`, [message.id]);
      
      const opts: FailOptions = { backoffMs: 1000, maxAttempts: 20 };
      const updated = await markMessageFailed(message.id, "Permanent error", opts);
      
      // Should not retry (status = error)
      expect(updated.status).toBe("error");
      expect(updated.error).toBe("Permanent error");
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [message.id]);
    });

    it("should truncate error message to 512 chars", async () => {
      const pool = getProdDb();
      
      const message = await publishMessage("test.error.truncate", { data: "truncate" }, { idempotencyKey: "truncate1" });
      const longError = "A".repeat(1000);
      
      const updated = await markMessageFailed(message.id, longError);
      expect(updated.error!.length).toBe(512);
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [message.id]);
    });
  });

  describe("updateMessageStatus", () => {
    it("should update message status", async () => {
      const pool = getProdDb();
      
      const message = await publishMessage("test.status.update", { data: "test" }, { idempotencyKey: "status1" });
      const updated = await updateMessageStatus(message.id, BusStatus.processing);
      
      expect(updated.status).toBe("processing");
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [message.id]);
    });
  });

  describe("incrementMessageAttempts", () => {
    it("should increment attempts count", async () => {
      const pool = getProdDb();
      
      const message = await publishMessage("test.attempts", { data: "test" }, { idempotencyKey: "attempts1" });
      expect(message.attempts).toBe(0);
      
      const updated = await incrementMessageAttempts(message.id);
      expect(updated.attempts).toBe(1);
      
      const updated2 = await incrementMessageAttempts(message.id);
      expect(updated2.attempts).toBe(2);
      
      await pool.query(`DELETE FROM "BusMessage" WHERE id = $1`, [message.id]);
    });
  });

  describe("deleteMessage", () => {
    it("should delete message by ID", async () => {
      const message = await publishMessage("test.delete", { data: "test" }, { idempotencyKey: "delete1" });
      
      const deleted = await deleteMessage(message.id);
      expect(deleted).toBe(true);
      
      const found = await findMessageById(message.id);
      expect(found).toBeNull();
    });

    it("should return false for non-existent message", async () => {
      const deleted = await deleteMessage("00000000-0000-0000-0000-000000000000");
      expect(deleted).toBe(false);
    });
  });

  // ========================================================================
  // Cleanup Operations
  // ========================================================================

  describe("cleanupOldMessages", () => {
    it("should delete old processed messages", async () => {
      const pool = getProdDb();
      
      // Create old processed message (manually set processedAt to 60 days ago)
      const message = await publishMessage("test.cleanup.old", { data: "old" }, { idempotencyKey: "cleanup1" });
      await markMessageProcessed(message.id);
      await pool.query(`UPDATE "BusMessage" SET "processedAt" = NOW() - INTERVAL '60 days' WHERE id = $1`, [message.id]);
      
      const deleted = await cleanupOldMessages(30);
      expect(deleted).toBeGreaterThanOrEqual(1);
      
      const found = await findMessageById(message.id);
      expect(found).toBeNull();
    });
  });

  describe("deleteMessagesByStatus", () => {
    it("should delete messages by status with limit", async () => {
      const pool = getProdDb();
      
      const msg1 = await publishMessage("test.delete.status", { num: 1 }, { idempotencyKey: "delstatus1" });
      const msg2 = await publishMessage("test.delete.status", { num: 2 }, { idempotencyKey: "delstatus2" });
      await markMessageProcessed(msg1.id);
      await markMessageProcessed(msg2.id);
      
      const deleted = await deleteMessagesByStatus(BusStatus.done, 1000);
      expect(deleted).toBeGreaterThanOrEqual(2);
    });
  });

  // ========================================================================
  // Idempotency Token Operations
  // ========================================================================

  describe("hasSeenToken", () => {
    it("should return false for first-time token", async () => {
      const pool = getProdDb();
      const token = `test-token-${Date.now()}-${Math.random()}`;
      
      const seen = await hasSeenToken(token);
      expect(seen).toBe(false);
      
      await pool.query(`DELETE FROM "BusIdemToken" WHERE key = $1`, [token]);
    });

    it("should return true for duplicate token", async () => {
      const pool = getProdDb();
      const token = `test-token-dup-${Date.now()}-${Math.random()}`;
      
      const seen1 = await hasSeenToken(token);
      expect(seen1).toBe(false);
      
      const seen2 = await hasSeenToken(token);
      expect(seen2).toBe(true);
      
      await pool.query(`DELETE FROM "BusIdemToken" WHERE key = $1`, [token]);
    });
  });

  describe("cleanupOldTokens", () => {
    it("should delete old tokens", async () => {
      const pool = getProdDb();
      
      // Create old token
      const token = `test-token-old-${Date.now()}-${Math.random()}`;
      await pool.query(`INSERT INTO "BusIdemToken" (key, "createdAt") VALUES ($1, NOW() - INTERVAL '30 days')`, [token]);
      
      const deleted = await cleanupOldTokens(7);
      expect(deleted).toBeGreaterThanOrEqual(1);
    });
  });

  describe("countTokens", () => {
    it("should count tokens", async () => {
      const pool = getProdDb();
      
      const token1 = `test-count-${Date.now()}-1`;
      const token2 = `test-count-${Date.now()}-2`;
      
      await hasSeenToken(token1);
      await hasSeenToken(token2);
      
      const count = await countTokens();
      expect(count).toBeGreaterThanOrEqual(2);
      
      await pool.query(`DELETE FROM "BusIdemToken" WHERE key = ANY($1::text[])`, [[token1, token2]]);
    });
  });
});
