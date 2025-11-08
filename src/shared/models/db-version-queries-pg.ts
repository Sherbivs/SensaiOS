/**
 * db-version-queries-pg.ts
 * PostgreSQL queries for database version tracking and replication
 * Handles DbVersion and DbSyncState operations for dual-database architecture
 */

import type { Pool, PoolClient } from "pg";
import { getProdDb } from "../pg-connection.js";

// ============================================================================
// Types
// ============================================================================

export type DbVersion = {
  id: string;
  versionFingerprint: string;
  migrationCount: number;
  lastMigrationName: string;
  lastMigrationAppliedAt: Date;
  syncSource: string;
  createdAt: Date;
};

export type DbSyncState = {
  source: string;
  target: string;
  status: string;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MigrationRow = {
  migration_name: string;
  checksum: string;
  applied_steps_count: number;
  started_at: Date;
  finished_at: Date | null;
};

// ============================================================================
// Migration Query Operations
// ============================================================================

/**
 * Query _prisma_migrations table for version fingerprinting
 * Returns all migrations ordered by started_at ASC
 */
export async function getMigrations(pool?: Pool | PoolClient): Promise<MigrationRow[]> {
  const db = pool ?? getProdDb();
  
  const query = `
    SELECT 
      migration_name,
      checksum,
      applied_steps_count,
      started_at,
      finished_at
    FROM _prisma_migrations
    ORDER BY started_at ASC
  `;
  
  const result = await db.query<MigrationRow>(query);
  return result.rows;
}

/**
 * Query _prisma_migrations table with LIMIT for prefix verification
 * Used to check if target migrations are a prefix of source migrations
 */
export async function getMigrationsWithLimit(
  limit: number,
  pool?: Pool | PoolClient
): Promise<Array<{ migration_name: string; checksum: string }>> {
  const db = pool ?? getProdDb();
  
  const query = `
    SELECT migration_name, checksum
    FROM _prisma_migrations
    ORDER BY started_at ASC
    LIMIT $1
  `;
  
  const result = await db.query<{ migration_name: string; checksum: string }>(query, [limit]);
  return result.rows;
}

// ============================================================================
// DbVersion Operations
// ============================================================================

/**
 * Create a new DbVersion record
 * Used to record version snapshots for historical tracking
 */
export async function createDbVersion(
  data: {
    versionFingerprint: string;
    migrationCount: number;
    lastMigrationName: string;
    lastMigrationAppliedAt: Date;
    syncSource: string;
  },
  pool?: Pool | PoolClient
): Promise<DbVersion> {
  const db = pool ?? getProdDb();
  
  const query = `
    INSERT INTO "DbVersion" (
      "versionFingerprint",
      "migrationCount",
      "lastMigrationName",
      "lastMigrationAppliedAt",
      "syncSource",
      "createdAt"
    )
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING 
      "id",
      "versionFingerprint",
      "migrationCount",
      "lastMigrationName",
      "lastMigrationAppliedAt",
      "syncSource",
      "createdAt"
  `;
  
  const values = [
    data.versionFingerprint,
    data.migrationCount,
    data.lastMigrationName,
    data.lastMigrationAppliedAt,
    data.syncSource,
  ];
  
  const result = await db.query<DbVersion>(query, values);
  return result.rows[0]!;
}

// ============================================================================
// DbSyncState Operations
// ============================================================================

/**
 * Find a DbSyncState record by source and target
 */
export async function findDbSyncState(
  source: string,
  target: string,
  pool?: Pool | PoolClient
): Promise<DbSyncState | null> {
  const db = pool ?? getProdDb();
  
  const query = `
    SELECT 
      "source",
      "target",
      "status",
      "lastSyncAt",
      "lastError",
      "createdAt",
      "updatedAt"
    FROM "DbSyncState"
    WHERE "source" = $1 AND "target" = $2
  `;
  
  const result = await db.query<DbSyncState>(query, [source, target]);
  return result.rows[0] ?? null;
}

/**
 * Upsert DbSyncState record (create or update)
 * Used to track replication status and block sync during reversions
 */
export async function upsertDbSyncState(
  data: {
    source: string;
    target: string;
    status: string;
    lastSyncAt?: Date | null;
    lastError?: string | null;
  },
  pool?: Pool | PoolClient
): Promise<DbSyncState> {
  const db = pool ?? getProdDb();
  
  const query = `
    INSERT INTO "DbSyncState" (
      "source",
      "target",
      "status",
      "lastSyncAt",
      "lastError",
      "createdAt",
      "updatedAt"
    )
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT ("source", "target")
    DO UPDATE SET
      "status" = EXCLUDED."status",
      "lastSyncAt" = COALESCE(EXCLUDED."lastSyncAt", "DbSyncState"."lastSyncAt"),
      "lastError" = EXCLUDED."lastError",
      "updatedAt" = NOW()
    RETURNING 
      "source",
      "target",
      "status",
      "lastSyncAt",
      "lastError",
      "createdAt",
      "updatedAt"
  `;
  
  const values = [
    data.source,
    data.target,
    data.status,
    data.lastSyncAt ?? null,
    data.lastError ?? null,
  ];
  
  const result = await db.query<DbSyncState>(query, values);
  return result.rows[0]!;
}

// ============================================================================
// Schema Integrity Query Operations (for integrity.ts)
// ============================================================================

/**
 * Get all table names in public schema
 * Used for schema comparison between databases
 */
export async function getTableNames(pool?: Pool | PoolClient): Promise<string[]> {
  const db = pool ?? getProdDb();
  
  const query = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '_prisma_%'
    ORDER BY table_name
  `;
  
  const result = await db.query<{ table_name: string }>(query);
  return result.rows.map((row) => row.table_name);
}

/**
 * Get column information for a specific table
 * Used for schema column comparison
 */
export async function getTableColumns(
  tableName: string,
  pool?: Pool | PoolClient
): Promise<Array<{
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}>> {
  const db = pool ?? getProdDb();
  
  const query = `
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
  `;
  
  const result = await db.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(query, [tableName]);
  
  return result.rows;
}

/**
 * Get index information for a specific table
 * Used for schema index comparison
 */
export async function getTableIndexes(
  tableName: string,
  pool?: Pool | PoolClient
): Promise<Array<{
  index_name: string;
  column_name: string;
  is_unique: boolean;
}>> {
  const db = pool ?? getProdDb();
  
  const query = `
    SELECT
      i.relname as index_name,
      a.attname as column_name,
      ix.indisunique as is_unique
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    WHERE t.relname = $1
      AND t.relkind = 'r'
      AND i.relname NOT LIKE 'pg_%'
    ORDER BY i.relname, a.attnum
  `;
  
  const result = await db.query<{
    index_name: string;
    column_name: string;
    is_unique: boolean;
  }>(query, [tableName]);
  
  return result.rows;
}

/**
 * Get foreign key constraints for a specific table
 * Used for schema constraint comparison
 */
export async function getTableConstraints(
  tableName: string,
  pool?: Pool | PoolClient
): Promise<Array<{
  constraint_name: string;
  constraint_type: string;
}>> {
  const db = pool ?? getProdDb();
  
  const query = `
    SELECT 
      tc.constraint_name,
      tc.constraint_type
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = $1
    ORDER BY tc.constraint_name
  `;
  
  const result = await db.query<{
    constraint_name: string;
    constraint_type: string;
  }>(query, [tableName]);
  
  return result.rows;
}

/**
 * Count rows in a specific table
 * Used for row count comparison between databases
 */
export async function countTableRows(
  tableName: string,
  pool?: Pool | PoolClient
): Promise<number> {
  const db = pool ?? getProdDb();
  
  // Note: Using unsafe query since table name can't be parameterized
  // TableName should be validated by caller
  const query = `SELECT COUNT(*)::bigint as count FROM "${tableName}"`;
  
  const result = await db.query<{ count: string }>(query);
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

/**
 * Get column names for checksum calculation
 * Used for content integrity verification
 */
export async function getColumnsForChecksum(
  tableName: string,
  pool?: Pool | PoolClient
): Promise<string[]> {
  const db = pool ?? getProdDb();
  
  const query = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
  `;
  
  const result = await db.query<{ column_name: string }>(query, [tableName]);
  return result.rows.map((row) => row.column_name);
}

/**
 * Calculate table content checksum
 * Used for content integrity verification between databases
 */
export async function calculateTableChecksum(
  tableName: string,
  columns: string[],
  pool?: Pool | PoolClient
): Promise<string | null> {
  const db = pool ?? getProdDb();
  
  // Build column list for MD5 calculation
  const columnList = columns
    .map((col) => `COALESCE(CAST("${col}" AS TEXT), '')`)
    .join(` || '|' || `);
  
  // Note: Using unsafe query construction - tableName and columns should be validated by caller
  const query = `
    SELECT MD5(STRING_AGG(row_hash, '')) as checksum
    FROM (
      SELECT MD5(${columnList}) as row_hash
      FROM "${tableName}"
      ORDER BY ${columns.map((c) => `"${c}"`).join(", ")}
    ) subq
  `;
  
  const result = await db.query<{ checksum: string | null }>(query);
  return result.rows[0]?.checksum ?? null;
}

/**
 * Get foreign key relationships for a table
 * Used for orphan record detection
 */
export async function getForeignKeys(
  tableName: string,
  pool?: Pool | PoolClient
): Promise<Array<{
  constraint_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}>> {
  const db = pool ?? getProdDb();
  
  const query = `
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = $1
  `;
  
  const result = await db.query<{
    constraint_name: string;
    column_name: string;
    foreign_table_name: string;
    foreign_column_name: string;
  }>(query, [tableName]);
  
  return result.rows;
}

/**
 * Count orphan records (records with FK pointing to non-existent parent)
 * Used for referential integrity checking
 */
export async function countOrphanRecords(
  tableName: string,
  columnName: string,
  foreignTableName: string,
  foreignColumnName: string,
  pool?: Pool | PoolClient
): Promise<number> {
  const db = pool ?? getProdDb();
  
  // Note: Using unsafe query construction - table/column names should be validated by caller
  const query = `
    SELECT COUNT(*)::bigint as count
    FROM "${tableName}" child
    LEFT JOIN "${foreignTableName}" parent
      ON child."${columnName}" = parent."${foreignColumnName}"
    WHERE parent."${foreignColumnName}" IS NULL
      AND child."${columnName}" IS NOT NULL
  `;
  
  const result = await db.query<{ count: string }>(query);
  return parseInt(result.rows[0]?.count ?? "0", 10);
}
