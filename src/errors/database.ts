/**
 * Database Error Types
 * ====================
 *
 * Error classes for database operations including connection, query,
 * transaction, and migration errors.
 *
 * @module errors/database
 * @since 2025-12-16
 *
 * @example
 * ```typescript
 * import { DatabaseError, ConnectionError, QueryError } from './database.js';
 *
 * // Connection failure
 * throw new ConnectionError('Failed to connect to PROD database', {
 *   database: 'CLOUD-PROD-MASTER',
 *   host: 'localhost',
 *   port: 5432,
 * });
 *
 * // Query failure
 * throw new QueryError('Failed to insert party record', {
 *   table: 'Party',
 *   operation: 'INSERT',
 *   userId: '12345',
 * });
 * ```
 */

import { AppError, type ErrorContext, type ErrorSeverity } from "./base.js";

// ============================================================================
// Error Codes
// ============================================================================

export const DatabaseErrorCode = {
  // Connection errors
  CONNECTION_FAILED: "DB_CONN_001",
  CONNECTION_TIMEOUT: "DB_CONN_002",
  CONNECTION_REFUSED: "DB_CONN_003",
  CONNECTION_POOL_EXHAUSTED: "DB_CONN_004",
  CONNECTION_LOST: "DB_CONN_005",
  
  // Query errors
  QUERY_FAILED: "DB_QUERY_001",
  QUERY_TIMEOUT: "DB_QUERY_002",
  QUERY_SYNTAX: "DB_QUERY_003",
  QUERY_CONSTRAINT: "DB_QUERY_004",
  
  // Transaction errors
  TRANSACTION_FAILED: "DB_TXN_001",
  TRANSACTION_DEADLOCK: "DB_TXN_002",
  TRANSACTION_ROLLBACK: "DB_TXN_003",
  TRANSACTION_SERIALIZATION: "DB_TXN_004",
  
  // Data errors
  RECORD_NOT_FOUND: "DB_DATA_001",
  DUPLICATE_RECORD: "DB_DATA_002",
  FOREIGN_KEY_VIOLATION: "DB_DATA_003",
  NULL_VIOLATION: "DB_DATA_004",
  CHECK_VIOLATION: "DB_DATA_005",
  
  // Migration errors
  MIGRATION_FAILED: "DB_MIG_001",
  MIGRATION_CONFLICT: "DB_MIG_002",
  MIGRATION_ROLLBACK_FAILED: "DB_MIG_003",
} as const;

export type DatabaseErrorCodeType = typeof DatabaseErrorCode[keyof typeof DatabaseErrorCode];

// ============================================================================
// Error Contexts
// ============================================================================

export interface DatabaseContext extends ErrorContext {
  /** Database identifier (CLOUD-PROD-MASTER, ONPREMISE-DEV-PRIMARY, etc.) */
  database?: string;
  /** Table name if applicable */
  table?: string;
  /** SQL operation (SELECT, INSERT, UPDATE, DELETE) */
  sqlOperation?: string;
  /** Query text (sanitized) */
  query?: string;
}

export interface ConnectionContext extends DatabaseContext {
  /** Database host */
  host?: string;
  /** Database port */
  port?: number;
  /** Connection attempt number */
  attempt?: number;
  /** Maximum retries */
  maxRetries?: number;
}

export interface QueryContext extends DatabaseContext {
  /** Number of rows affected */
  rowsAffected?: number;
  /** Query duration in ms */
  durationMs?: number;
  /** Parameter count */
  paramCount?: number;
}

export interface TransactionContext extends DatabaseContext {
  /** Transaction ID */
  transactionId?: string;
  /** Savepoint name */
  savepoint?: string;
  /** Isolation level */
  isolationLevel?: string;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base class for all database errors.
 */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    code: DatabaseErrorCodeType = DatabaseErrorCode.QUERY_FAILED,
    context: DatabaseContext = {},
    options?: { severity?: ErrorSeverity; cause?: Error }
  ) {
    super(message, code, context, {
      severity: options?.severity ?? "high",
      type: "operational",
      cause: options?.cause,
    });
  }
}

/**
 * Connection-related database errors.
 */
export class ConnectionError extends DatabaseError {
  readonly host?: string;
  readonly port?: number;

  constructor(
    message: string,
    context: ConnectionContext = {},
    code: DatabaseErrorCodeType = DatabaseErrorCode.CONNECTION_FAILED
  ) {
    super(message, code, context, { severity: "critical" });
    this.host = context.host;
    this.port = context.port;
  }
}

/**
 * Query execution errors.
 */
export class QueryError extends DatabaseError {
  readonly table?: string;
  readonly sqlOperation?: string;

  constructor(
    message: string,
    context: QueryContext = {},
    code: DatabaseErrorCodeType = DatabaseErrorCode.QUERY_FAILED
  ) {
    super(message, code, context, { severity: "high" });
    this.table = context.table;
    this.sqlOperation = context.sqlOperation;
  }
}

/**
 * Transaction errors.
 */
export class TransactionError extends DatabaseError {
  readonly transactionId?: string;

  constructor(
    message: string,
    context: TransactionContext = {},
    code: DatabaseErrorCodeType = DatabaseErrorCode.TRANSACTION_FAILED
  ) {
    super(message, code, context, { severity: "high" });
    this.transactionId = context.transactionId;
  }
}

/**
 * Record not found error (for required lookups).
 */
export class RecordNotFoundError extends DatabaseError {
  readonly table: string;
  readonly lookupKey: string;

  constructor(table: string, lookupKey: string, context: DatabaseContext = {}) {
    super(
      `Record not found in ${table}: ${lookupKey}`,
      DatabaseErrorCode.RECORD_NOT_FOUND,
      { ...context, table },
      { severity: "medium" }
    );
    this.table = table;
    this.lookupKey = lookupKey;
  }
}

/**
 * Duplicate record error (unique constraint violation).
 */
export class DuplicateRecordError extends DatabaseError {
  readonly table: string;
  readonly field: string;

  constructor(table: string, field: string, context: DatabaseContext = {}) {
    super(
      `Duplicate record in ${table} on ${field}`,
      DatabaseErrorCode.DUPLICATE_RECORD,
      { ...context, table },
      { severity: "medium" }
    );
    this.table = table;
    this.field = field;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

export function isConnectionError(error: unknown): error is ConnectionError {
  return error instanceof ConnectionError;
}

export function isRecordNotFoundError(error: unknown): error is RecordNotFoundError {
  return error instanceof RecordNotFoundError;
}
