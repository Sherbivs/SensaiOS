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
import type { BusMessage, BusStatus } from "../../types/db-models.js";

// ============================================================================
// Type Definitions
// ============================================================================
// Unused types removed - PublishOptions, ClaimOptions, FailOptions, ClaimedMessage

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

// ============================================================================
// Write Operations - Message Lifecycle
// ============================================================================
// All write operations removed - unused by current codebase
