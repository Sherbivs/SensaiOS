/**
 * PostgreSQL Pool Mocking Utilities
 * 
 * Provides reusable mock factories for testing database operations
 * with native PostgreSQL Pool instead of Prisma Client.
 * 
 * Usage:
 * ```typescript
 * import { createMockPoolWithMigrations, createMockPoolWithSchema } from '../shared/pool-mocks';
 * 
 * const mockPool = createMockPoolWithMigrations([
 *   { migration_name: '20250101_init', checksum: 'abc123', ... }
 * ]);
 * ```
 */

import type { Pool, QueryResult } from 'pg';
import { vi } from 'vitest';

import type {
  MockMigration,
  MockTable,
  MockColumn,
  MockIndex,
  MockConstraint,
  MockSchemaData,
} from './prisma-mocks.js';

// Re-export types for convenience
export type {
  MockMigration,
  MockTable,
  MockColumn,
  MockIndex,
  MockConstraint,
  MockSchemaData,
};

// ============================================================================
// Pool Mock Factory Functions
// ============================================================================

/**
 * Create a mock PostgreSQL Pool for migration/version testing
 * 
 * @param migrations - Array of migration records
 * @returns Mock Pool with query() method that returns migrations
 */
export function createMockPoolWithMigrations(migrations: MockMigration[]): Pool {
  const queryMock = vi.fn((sql: string, params?: any[]) => {
    // Handle getMigrations query (no LIMIT)
    if (sql.includes('_prisma_migrations') && !sql.includes('LIMIT')) {
      return Promise.resolve({
        rows: migrations,
        rowCount: migrations.length,
      } as QueryResult);
    }

    // Handle getMigrationsWithLimit query (with LIMIT)
    if (sql.includes('_prisma_migrations') && sql.includes('LIMIT')) {
      const limit = params?.[0] || migrations.length;
      return Promise.resolve({
        rows: migrations.slice(0, limit),
        rowCount: Math.min(limit, migrations.length),
      } as QueryResult);
    }

    // Handle createDbVersion INSERT
    if (sql.includes('INSERT INTO "DbVersion"')) {
      return Promise.resolve({
        rows: [{
          id: 1,
          versionFingerprint: params?.[0],
          migrationCount: params?.[1],
          lastMigrationName: params?.[2],
          lastMigrationAppliedAt: params?.[3],
          syncSource: params?.[4],
          createdAt: new Date(),
        }],
        rowCount: 1,
      } as QueryResult);
    }

    // Handle findDbSyncState SELECT
    if (sql.includes('SELECT') && sql.includes('FROM "DbSyncState"')) {
      return Promise.resolve({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as QueryResult);
    }

    // Handle upsertDbSyncState INSERT ... ON CONFLICT
    if (sql.includes('INSERT INTO "DbSyncState"') && sql.includes('ON CONFLICT')) {
      return Promise.resolve({
        rows: [{
          source: params?.[0],
          target: params?.[1],
          status: params?.[2],
          lastSyncAt: params?.[3],
          lastError: params?.[4],
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      } as QueryResult);
    }

    // Default: empty result
    return Promise.resolve({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    } as QueryResult);
  });

  return {
    query: queryMock,
    connect: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  } as any;
}

/**
 * Create a mock Pool for schema integrity testing
 * 
 * @param mockData - Schema elements (tables, columns, indexes, constraints)
 * @returns Mock Pool with query() supporting schema queries
 */
export function createMockPoolWithSchema(mockData: MockSchemaData): Pool {
  const queryMock = vi.fn((sql: string, params?: any[]) => {
    // Tables query (getTableNames)
    if (sql.includes('FROM information_schema.tables') && sql.includes('table_name')) {
      const tables = mockData.tables || [];
      return Promise.resolve({
        rows: tables.map(t => ({ table_name: t.table_name })),
        rowCount: tables.length,
      } as QueryResult);
    }

    // Columns query (getTableColumns)
    if (sql.includes('FROM information_schema.columns') && params?.[0]) {
      const tableName = params[0];
      const columns = (mockData.columns || []).filter(c => c.table_name === tableName);
      return Promise.resolve({
        rows: columns,
        rowCount: columns.length,
      } as QueryResult);
    }

    // Indexes query (getTableIndexes)
    if (sql.includes('FROM pg_class') && sql.includes('pg_index')) {
      const tableName = params?.[0];
      const indexes = (mockData.indexes || []).filter(idx => idx.tablename === tableName);
      return Promise.resolve({
        rows: indexes.map(idx => ({
          index_name: idx.indexname,
          column_name: 'id', // Simplified for testing
          is_unique: false,
        })),
        rowCount: indexes.length,
      } as QueryResult);
    }

    // Constraints query (getTableConstraints)
    if (sql.includes('FROM information_schema.table_constraints') && params?.[0]) {
      const tableName = params[0];
      const constraints = (mockData.constraints || []).filter(c => c.table_name === tableName);
      return Promise.resolve({
        rows: constraints,
        rowCount: constraints.length,
      } as QueryResult);
    }

    // Row count queries (countTableRows)
    if (sql.includes('COUNT(*)') && sql.includes('FROM')) {
      const tableMatch = sql.match(/FROM\s+"?(\w+)"?/i);
      if (tableMatch && mockData.rowCounts) {
        const tableName = tableMatch[1];
        return Promise.resolve({
          rows: [{ count: (mockData.rowCounts[tableName] || 0).toString() }],
          rowCount: 1,
        } as QueryResult);
      }
    }

    // Checksum queries (calculateTableChecksum via getColumnsForChecksum)
    if (sql.includes('column_name') && sql.includes('information_schema.columns')) {
      const tableName = params?.[0];
      const columns = (mockData.columns || []).filter(c => c.table_name === tableName);
      return Promise.resolve({
        rows: columns.map(c => ({ column_name: c.column_name })),
        rowCount: columns.length,
      } as QueryResult);
    }

    // Checksum calculation result (MD5)
    if (sql.includes('md5') && mockData.checksums) {
      const tableMatch = sql.match(/FROM\s+"?(\w+)"?/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        return Promise.resolve({
          rows: [{ checksum: mockData.checksums[tableName] || null }],
          rowCount: 1,
        } as QueryResult);
      }
    }

    // Foreign key queries (getForeignKeys)
    if (sql.includes('information_schema.table_constraints') && sql.includes('FOREIGN KEY')) {
      return Promise.resolve({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as QueryResult);
    }

    // Orphan count queries (countOrphanRecords)
    if (sql.includes('LEFT JOIN') && sql.includes('IS NULL')) {
      const tableMatch = sql.match(/FROM\s+"?(\w+)"?/i);
      if (tableMatch && mockData.fkOrphans) {
        const tableName = tableMatch[1];
        return Promise.resolve({
          rows: [{ count: (mockData.fkOrphans[tableName] || 0).toString() }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        } as QueryResult);
      }
    }

    // Default: empty result
    return Promise.resolve({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    } as QueryResult);
  });

  return {
    query: queryMock,
    connect: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  } as any;
}

/**
 * Create a fully-featured mock Pool for general testing
 * 
 * Combines migration and schema mock capabilities.
 */
export function createMockPool(options: {
  migrations?: MockMigration[];
  schema?: MockSchemaData;
}): Pool {
  const { migrations = [], schema = {} } = options;

  // Combine both mock types
  const queryMock = vi.fn((sql: string, params?: any[]) => {
    // Try migration queries first
    if (sql.includes('_prisma_migrations')) {
      const migrationPool = createMockPoolWithMigrations(migrations);
      return migrationPool.query(sql, params);
    }

    // Then schema queries
    const schemaPool = createMockPoolWithSchema(schema);
    return schemaPool.query(sql, params);
  });

  return {
    query: queryMock,
    connect: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  } as any;
}

/**
 * Create a basic mock Pool with minimal functionality
 * 
 * Useful for testing error handling or simple operations.
 */
export function createBasicMockPool(): Pool {
  return {
    query: vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    } as QueryResult),
    connect: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  } as any;
}

/**
 * Generate sample migrations for testing
 * 
 * @param count - Number of migrations to generate
 * @returns Array of mock migrations
 */
export function generateSampleMigrations(count: number): MockMigration[] {
  const migrations: MockMigration[] = [];
  
  for (let i = 0; i < count; i++) {
    const date = new Date(2025, 0, i + 1); // Jan 1, 2, 3, etc.
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    
    migrations.push({
      migration_name: `${dateStr}000000_migration_${i + 1}`,
      checksum: `checksum_${i + 1}`,
      applied_steps_count: 1,
      started_at: date,
      finished_at: new Date(date.getTime() + 1000), // 1 second later
    });
  }
  
  return migrations;
}

/**
 * Generate sample schema for testing
 * 
 * @param tableCount - Number of tables to generate
 * @returns Mock schema data
 */
export function generateSampleSchema(tableCount: number): MockSchemaData {
  const tables: MockTable[] = [];
  const columns: MockColumn[] = [];
  const indexes: MockIndex[] = [];
  const constraints: MockConstraint[] = [];
  
  for (let i = 0; i < tableCount; i++) {
    const tableName = `table_${i + 1}`;
    
    tables.push({ table_name: tableName });
    
    columns.push(
      {
        table_name: tableName,
        column_name: 'id',
        data_type: 'integer',
        is_nullable: 'NO',
        column_default: 'nextval(...)',
        character_maximum_length: null,
      },
      {
        table_name: tableName,
        column_name: 'name',
        data_type: 'text',
        is_nullable: 'YES',
        column_default: null,
        character_maximum_length: null,
      }
    );
    
    indexes.push({
      tablename: tableName,
      indexname: `${tableName}_pkey`,
      indexdef: `CREATE UNIQUE INDEX ${tableName}_pkey ON ${tableName} USING btree (id)`,
    });
    
    constraints.push({
      table_name: tableName,
      constraint_name: `${tableName}_pkey`,
      constraint_type: 'PRIMARY KEY',
    });
  }
  
  return {
    tables,
    columns,
    indexes,
    constraints,
    rowCounts: Object.fromEntries(tables.map(t => [t.table_name, 100])),
    checksums: Object.fromEntries(tables.map(t => [t.table_name, `checksum_${t.table_name}`])),
    fkOrphans: {},
  };
}
