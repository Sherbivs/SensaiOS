/**
 * Bus/Outbox queries using raw PostgreSQL (pg library)
 * 
 * Handles async message bus operations:
 * - Message enqueueing with idempotency
 * - Batch claiming with FOR UPDATE SKIP LOCKED
 * - Status tracking (pending → processing → done/error)
 * - Retry logic with exponential backoff
 * - Cleanup of old processed messages
 * - Idempotency token management
 * 
 * Patterns Used:
 * - Advisory locks for atomic claiming (FOR UPDATE SKIP LOCKED)
 * - Upsert for idempotency (ON CONFLICT DO NOTHING)
 * - Priority-based ordering (high → normal → low)
 * - Date revival for availableAt/processedAt/createdAt
 * - JSON payload storage
 * - Error message truncation (512 chars)
 * 
 * Related Files:
 * - src/shared/outbox.ts (legacy Prisma, enqueue/claim/mark operations)
 * - src/engine/bus.ts (legacy Prisma, publish/claim/finish/fail operations)
 * - src/types/db-models.ts (BusMessage, BusIdemToken models)
 */

import type { Pool, PoolClient } from "pg";
import { getProdDb } from "../pg-connection.js";
import { buildSelect, buildWhereClause, buildInsert, buildUpdate, buildDelete } from "../pg-query.js";
import type { BusMessage, BusIdemToken, BusKind, BusPriority, BusStatus } from "../../types/db-models.js";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Options for publishing a message to the bus
 */
export type PublishOptions = {
  priority?: BusPriority;
  delayMs?: number;
  idempotencyKey?: string;
  shardKey?: string;
  kind?: BusKind;
};

/**
 * Options for claiming a batch of messages
 */
export type ClaimOptions = {
  topics?: string[];
};

/**
 * Options for failing a message with retry logic
 */
export type FailOptions = {
  backoffMs?: number;
  maxAttempts?: number;
};

/**
 * Claimed message with subset of fields for processing
 */
export type ClaimedMessage = Pick<BusMessage, "id" | "topic" | "payload" | "createdAt" | "idempotencyKey" | "shardKey">;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Revival helper: Convert Date-like strings to Date objects
 */
function reviveDates(row: any): any {
  if (!row) return row;
  const copy = { ...row };
  if (copy.createdAt && typeof copy.createdAt === "string") copy.createdAt = new Date(copy.createdAt);
  if (copy.availableAt && typeof copy.availableAt === "string") copy.availableAt = new Date(copy.availableAt);
  if (copy.processedAt && typeof copy.processedAt === "string") copy.processedAt = new Date(copy.processedAt);
  if (copy.updatedAt && typeof copy.updatedAt === "string") copy.updatedAt = new Date(copy.updatedAt);
  return copy;
}

/**
 * Generate default idempotency key from topic and payload
 */
function generateIdempotencyKey(topic: string, payload: any): string {
  return `${topic}:${JSON.stringify(payload)}`;
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Find message by ID
 * @returns BusMessage or null if not found
 */
export async function findMessageById(
  id: string,
  client?: PoolClient,
): Promise<BusMessage | null> {
  const pool = client ?? getProdDb();
  const sql = `SELECT * FROM "BusMessage" WHERE id = $1`;
  const result = await pool.query(sql, [id]);
  return result.rows.length > 0 ? reviveDates(result.rows[0]) : null;
}

/**
 * Find message by ID (throws if not found)
 * @throws Error if message not found
 */
export async function getMessageById(
  id: string,
  client?: PoolClient,
): Promise<BusMessage> {
  const message = await findMessageById(id, client);
  if (!message) throw new Error(`BusMessage not found: ${id}`);
  return message;
}

/**
 * Count messages by status
 * @param status - BusStatus to filter by
 * @returns Count of messages with given status
 */
export async function countMessagesByStatus(
  status: BusStatus,
  client?: Pool | PoolClient,
): Promise<number> {
  const pool = client ?? getProdDb();
  const sql = `SELECT COUNT(*) AS count FROM "BusMessage" WHERE status = $1`;
  const result = await pool.query(sql, [status]);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Count pending messages ready for processing
 * @returns Count of pending messages where availableAt <= now
 */
export async function countReadyMessages(
  client?: Pool | PoolClient,
): Promise<number> {
  const pool = client ?? getProdDb();
  const sql = `SELECT COUNT(*) AS count FROM "BusMessage" WHERE status = 'pending' AND "availableAt" <= NOW()`;
  const result = await pool.query(sql, []);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Find messages by topic
 * @param topic - Topic to filter by
 * @param limit - Maximum number of messages to return
 * @returns Array of messages for given topic
 */
export async function findMessagesByTopic(
  topic: string,
  limit = 100,
  client?: PoolClient,
): Promise<BusMessage[]> {
  const pool = client ?? getProdDb();
  const sql = `SELECT * FROM "BusMessage" WHERE topic = $1 ORDER BY "createdAt" DESC LIMIT $2`;
  const result = await pool.query(sql, [topic, limit]);
  return result.rows.map(reviveDates);
}

// ============================================================================
// Write Operations - Message Lifecycle
// ============================================================================

/**
 * Enqueue/publish a message to the bus
 * Uses idempotency to prevent duplicates (ON CONFLICT DO NOTHING)
 * 
 * @param topic - Message topic/channel
 * @param payload - JSON payload
 * @param opts - Publishing options (priority, delay, idempotency, shard key, kind)
 * @returns Created or existing message
 */
export async function publishMessage(
  topic: string,
  payload: any,
  opts: PublishOptions = {},
  client?: PoolClient,
): Promise<BusMessage> {
  const pool = client ?? getProdDb();
  const now = new Date();
  const availableAt = new Date(now.getTime() + (opts.delayMs ?? 0));
  const idempotencyKey = opts.idempotencyKey ?? generateIdempotencyKey(topic, payload);
  const priority = opts.priority ?? "normal";
  const kind = opts.kind ?? "event";
  const shardKey = opts.shardKey ?? null;

  // Upsert: if idempotency key exists, return existing message
  const sql = `
    INSERT INTO "BusMessage" (
      topic, payload, priority, "availableAt", "idempotencyKey", "shardKey", kind,
      status, attempts, "createdAt", "updatedAt"
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 0, NOW(), NOW())
    ON CONFLICT (topic, "idempotencyKey") DO UPDATE SET "updatedAt" = NOW()
    RETURNING *
  `;
  const result = await pool.query(sql, [
    topic,
    JSON.stringify(payload),
    priority,
    availableAt,
    idempotencyKey,
    shardKey,
    kind,
  ]);
  return reviveDates(result.rows[0]);
}

/**
 * Claim a batch of pending messages for processing
 * Uses FOR UPDATE SKIP LOCKED for lock-free concurrent claiming
 * Updates status to 'processing' and increments attempts
 * 
 * @param limit - Maximum messages to claim
 * @param options - Claim options (topics filter)
 * @returns Array of claimed message IDs with metadata
 */
export async function claimMessageBatch(
  limit = 64,
  options: ClaimOptions = {},
  client?: PoolClient,
): Promise<ClaimedMessage[]> {
  const pool = client ?? getProdDb();
  const topics = options.topics?.filter(Boolean) ?? [];
  
  // Build topic filter if provided
  const topicCondition = topics.length > 0
    ? `AND topic = ANY($2::text[])`
    : "";
  
  const params: any[] = [limit];
  if (topics.length > 0) params.push(topics);

  // CTE with FOR UPDATE SKIP LOCKED for atomic claiming
  // Priority order: high (0) → normal (1) → low (2), then FIFO by createdAt
  const sql = `
    WITH cte AS (
      SELECT id
      FROM "BusMessage"
      WHERE status = 'pending'
        AND "availableAt" <= NOW()
        ${topicCondition}
      ORDER BY 
        CASE priority
          WHEN 'high' THEN 0
          WHEN 'normal' THEN 1
          ELSE 2
        END,
        "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    )
    UPDATE "BusMessage" AS b
    SET 
      status = 'processing',
      attempts = attempts + 1,
      "updatedAt" = NOW()
    FROM cte
    WHERE b.id = cte.id
    RETURNING b.id, b.topic, b.payload, b."createdAt", b."idempotencyKey", b."shardKey"
  `;

  const result = await pool.query(sql, params);
  return result.rows.map(reviveDates);
}

/**
 * Mark message as successfully processed
 * Sets status to 'done', clears error, sets processedAt timestamp
 * 
 * @param id - Message ID
 * @returns Updated message
 */
export async function markMessageProcessed(
  id: string,
  client?: PoolClient,
): Promise<BusMessage> {
  const pool = client ?? getProdDb();
  const sql = `
    UPDATE "BusMessage"
    SET 
      status = 'done',
      "processedAt" = NOW(),
      error = NULL,
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const result = await pool.query(sql, [id]);
  if (result.rows.length === 0) throw new Error(`BusMessage not found: ${id}`);
  return reviveDates(result.rows[0]);
}

/**
 * Mark message as failed with error
 * Handles retry logic based on attempts and maxAttempts
 * - If attempts < maxAttempts: status = 'pending', availableAt = now + backoff
 * - If attempts >= maxAttempts: status = 'error' (permanent failure)
 * 
 * @param id - Message ID
 * @param error - Error message (truncated to 512 chars)
 * @param options - Fail options (backoffMs, maxAttempts)
 * @returns Updated message
 */
export async function markMessageFailed(
  id: string,
  error: unknown,
  options: FailOptions = {},
  client?: PoolClient,
): Promise<BusMessage> {
  const pool = client ?? getProdDb();
  const backoffMs = Math.max(0, options.backoffMs ?? 5_000);
  const maxAttempts = options.maxAttempts ?? 20;
  
  // Load current message to check attempts
  const message = await getMessageById(id, client);
  const willRetry = message.attempts < maxAttempts;
  const newStatus = willRetry ? "pending" : "error";
  const availableAt = new Date(Date.now() + backoffMs);
  const errorMessage = String(error).slice(0, 512);

  const sql = `
    UPDATE "BusMessage"
    SET 
      status = $2,
      error = $3,
      "availableAt" = $4,
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const result = await pool.query(sql, [id, newStatus, errorMessage, availableAt]);
  return reviveDates(result.rows[0]);
}

/**
 * Update message status directly (for admin/testing purposes)
 * 
 * @param id - Message ID
 * @param status - New status
 * @returns Updated message
 */
export async function updateMessageStatus(
  id: string,
  status: BusStatus,
  client?: PoolClient,
): Promise<BusMessage> {
  const pool = client ?? getProdDb();
  const sql = `UPDATE "BusMessage" SET status = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING *`;
  const result = await pool.query(sql, [id, status]);
  if (result.rows.length === 0) throw new Error(`BusMessage not found: ${id}`);
  return reviveDates(result.rows[0]);
}

/**
 * Increment message attempts count (for retry tracking)
 * 
 * @param id - Message ID
 * @returns Updated message
 */
export async function incrementMessageAttempts(
  id: string,
  client?: PoolClient,
): Promise<BusMessage> {
  const pool = client ?? getProdDb();
  const sql = `
    UPDATE "BusMessage"
    SET attempts = attempts + 1, "updatedAt" = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const result = await pool.query(sql, [id]);
  if (result.rows.length === 0) throw new Error(`BusMessage not found: ${id}`);
  return reviveDates(result.rows[0]);
}

/**
 * Delete message by ID
 * 
 * @param id - Message ID
 * @returns True if deleted, false if not found
 */
export async function deleteMessage(
  id: string,
  client?: PoolClient,
): Promise<boolean> {
  const pool = client ?? getProdDb();
  const sql = `DELETE FROM "BusMessage" WHERE id = $1`;
  const result = await pool.query(sql, [id]);
  return result.rowCount !== null && result.rowCount > 0;
}

// ============================================================================
// Cleanup Operations
// ============================================================================

/**
 * Delete old processed messages
 * Removes messages with status 'done' older than specified age
 * 
 * @param olderThanDays - Delete messages older than this many days (default: 30)
 * @returns Number of messages deleted
 */
export async function cleanupOldMessages(
  olderThanDays = 30,
  client?: PoolClient,
): Promise<number> {
  const pool = client ?? getProdDb();
  const sql = `
    DELETE FROM "BusMessage"
    WHERE status = 'done'
      AND "processedAt" < NOW() - INTERVAL '${olderThanDays} days'
  `;
  const result = await pool.query(sql, []);
  return result.rowCount ?? 0;
}

/**
 * Delete messages by status
 * Useful for cleanup of error/pending messages
 * 
 * @param status - Status to delete
 * @param limit - Maximum messages to delete (default: 1000)
 * @returns Number of messages deleted
 */
export async function deleteMessagesByStatus(
  status: BusStatus,
  limit = 1000,
  client?: PoolClient,
): Promise<number> {
  const pool = client ?? getProdDb();
  const sql = `
    DELETE FROM "BusMessage"
    WHERE id IN (
      SELECT id FROM "BusMessage"
      WHERE status = $1
      ORDER BY "createdAt"
      LIMIT $2
    )
  `;
  const result = await pool.query(sql, [status, limit]);
  return result.rowCount ?? 0;
}

// ============================================================================
// Idempotency Token Operations
// ============================================================================

/**
 * Check if idempotency token has been seen before
 * Creates token if not seen (returns false)
 * Returns true if token already exists (duplicate)
 * 
 * @param token - Idempotency token key
 * @returns True if seen before (duplicate), false if first time
 */
export async function hasSeenToken(
  token: string,
  client?: PoolClient,
): Promise<boolean> {
  const pool = client ?? getProdDb();
  try {
    // Try to insert token (will fail if exists)
    const sql = `INSERT INTO "BusIdemToken" (key, "createdAt") VALUES ($1, NOW())`;
    await pool.query(sql, [token]);
    return false; // First time seeing this token
  } catch (err: any) {
    // Unique constraint violation means token exists
    if (err.code === "23505") return true;
    throw err; // Re-throw unexpected errors
  }
}

/**
 * Delete old idempotency tokens
 * Removes tokens older than specified age to prevent unbounded growth
 * 
 * @param olderThanDays - Delete tokens older than this many days (default: 7)
 * @returns Number of tokens deleted
 */
export async function cleanupOldTokens(
  olderThanDays = 7,
  client?: PoolClient,
): Promise<number> {
  const pool = client ?? getProdDb();
  const sql = `
    DELETE FROM "BusIdemToken"
    WHERE "createdAt" < NOW() - INTERVAL '${olderThanDays} days'
  `;
  const result = await pool.query(sql, []);
  return result.rowCount ?? 0;
}

/**
 * Count idempotency tokens
 * Useful for monitoring token table growth
 * 
 * @returns Count of tokens
 */
export async function countTokens(
  client?: PoolClient,
): Promise<number> {
  const pool = client ?? getProdDb();
  const sql = `SELECT COUNT(*) AS count FROM "BusIdemToken"`;
  const result = await pool.query(sql, []);
  return parseInt(result.rows[0].count, 10);
}
