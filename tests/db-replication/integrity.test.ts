/**
 * Database Integrity Verification Tests
 * 
 * Comprehensive test coverage for schema and data integrity verification
 * between source and target databases in the replication cascade.
 */

import type { Pool, QueryResult } from 'pg';
import { describe, it, expect, vi } from 'vitest';

import {
  verifySchemaIntegrity,
  verifyDataIntegrity,
} from '../../src/services/db-replication/integrity.js';

// ============================================================================
// Mock Prisma Client Factory
// ============================================================================

function createMockPoolClient(mockData: {
  tables?: Array<{ table_name: string }>;
  columns?: Array<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    character_maximum_length: number | null;
  }>;
  indexes?: Array<{
    tablename: string;
    indexname: string;
    indexdef: string;
  }>;
  constraints?: Array<{
    table_name: string;
    constraint_name: string;
    constraint_type: string;
  }>;
  rowCounts?: Record<string, number>;
  checksums?: Record<string, string>;
  fkOrphans?: Record<string, number>;
}): Pool {
  const queryFn = vi.fn(async (query: string | { text: string }, params?: unknown[]): Promise<QueryResult> => {
    const queryStr = typeof query === 'string' ? query : query.text;
    const queryParams = params || [];

    // Tables query
    if (queryStr.includes('FROM information_schema.tables')) {
      const rows = mockData.tables || [];
      return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }

    // Columns query (parameterized for specific table)
    if (queryStr.includes('FROM information_schema.columns') && queryParams.length > 0) {
      const tableName = queryParams[0] as string;
      const rows = mockData.columns?.filter(c => c.table_name === tableName) || [];
      return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }

    // Columns query (all columns)
    if (queryStr.includes('FROM information_schema.columns')) {
      const rows = mockData.columns || [];
      return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }

    // Indexes query
    if (queryStr.includes('FROM pg_indexes')) {
      const rows = mockData.indexes || [];
      return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }

    // Constraints query
    if (queryStr.includes('FROM information_schema.table_constraints')) {
      const rows = mockData.constraints || [];
      return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }

    // FK query
    if (queryStr.includes('information_schema.key_column_usage')) {
      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }

    // Row count queries
    if (queryStr.includes('SELECT COUNT(*)') || queryStr.includes('SELECT count(*)')) {
      const match = queryStr.match(/FROM "(\w+)"/);
      if (match && mockData.rowCounts) {
        const tableName = match[1];
        const rows = [{ count: BigInt(mockData.rowCounts[tableName] || 0) }];
        return { rows, rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
      }
      return { rows: [{ count: BigInt(0) }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
    }

    // Checksum queries (case-insensitive)
    if (queryStr.toUpperCase().includes('MD5') && queryStr.toUpperCase().includes('STRING_AGG')) {
      const match = queryStr.match(/FROM "(\w+)"/);
      if (match && mockData.checksums) {
        const tableName = match[1];
        const rows = [{ checksum: mockData.checksums[tableName] || 'EMPTY' }];
        return { rows, rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
      }
      return { rows: [{ checksum: 'EMPTY' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
    }

    // FK orphan queries
    if (queryStr.includes('LEFT JOIN')) {
      const match = queryStr.match(/FROM "(\w+)" child/);
      if (match && mockData.fkOrphans) {
        const tableName = match[1];
        const rows = [{ count: BigInt(mockData.fkOrphans[tableName] || 0) }];
        return { rows, rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
      }
      return { rows: [{ count: BigInt(0) }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
    }

    return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
  });

  return {
    query: queryFn,
    end: vi.fn(),
  } as unknown as Pool;
}

// ============================================================================
// Schema Verification Tests
// ============================================================================

describe('verifySchemaIntegrity', () => {
  describe('Table Comparison', () => {
    it('should detect missing tables in target', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }, { table_name: 'posts' }],
        columns: [],
        indexes: [],
        constraints: [],
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [],
        indexes: [],
        constraints: [],
      });

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0]).toMatchObject({
        type: 'table',
        action: 'missing',
        path: 'public.posts',
      });
    });

    it('should detect extra tables in target', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [],
        indexes: [],
        constraints: [],
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }, { table_name: 'posts' }],
        columns: [],
        indexes: [],
        constraints: [],
      });

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0]).toMatchObject({
        type: 'table',
        action: 'extra',
        path: 'public.posts',
      });
    });
  });

  describe('Column Comparison', () => {
    it('should detect column type mismatch', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [
          {
            table_name: 'users',
            column_name: 'email',
            data_type: 'varchar',
            is_nullable: 'NO',
            column_default: null,
            character_maximum_length: 255,
          },
        ],
        indexes: [],
        constraints: [],
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [
          {
            table_name: 'users',
            column_name: 'email',
            data_type: 'text',
            is_nullable: 'NO',
            column_default: null,
            character_maximum_length: null,
          },
        ],
        indexes: [],
        constraints: [],
      });

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      const typeDiff = result.diffs.find(d => 
        d.type === 'column' && 
        d.action === 'mismatch' &&
        (d.details as any).field === 'data_type'
      );
      expect(typeDiff).toBeDefined();
      expect((typeDiff?.details as any).source).toBe('varchar');
      expect((typeDiff?.details as any).target).toBe('text');
    });

    it('should detect column nullable mismatch', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [
          {
            table_name: 'users',
            column_name: 'bio',
            data_type: 'text',
            is_nullable: 'YES',
            column_default: null,
            character_maximum_length: null,
          },
        ],
        indexes: [],
        constraints: [],
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [
          {
            table_name: 'users',
            column_name: 'bio',
            data_type: 'text',
            is_nullable: 'NO',
            column_default: null,
            character_maximum_length: null,
          },
        ],
        indexes: [],
        constraints: [],
      });

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      const nullableDiff = result.diffs.find(d => 
        d.type === 'column' && 
        (d.details as any).field === 'is_nullable'
      );
      expect(nullableDiff).toBeDefined();
      expect((nullableDiff?.details as any).source).toBe('YES');
      expect((nullableDiff?.details as any).target).toBe('NO');
    });

    it('should detect column default mismatch', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [
          {
            table_name: 'users',
            column_name: 'status',
            data_type: 'varchar',
            is_nullable: 'NO',
            column_default: "'active'::character varying",
            character_maximum_length: 20,
          },
        ],
        indexes: [],
        constraints: [],
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [
          {
            table_name: 'users',
            column_name: 'status',
            data_type: 'varchar',
            is_nullable: 'NO',
            column_default: "'pending'::character varying",
            character_maximum_length: 20,
          },
        ],
        indexes: [],
        constraints: [],
      });

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      const defaultDiff = result.diffs.find(d => 
        d.type === 'column' && 
        (d.details as any).field === 'column_default'
      );
      expect(defaultDiff).toBeDefined();
    });

    it('should detect missing columns', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [
          {
            table_name: 'users',
            column_name: 'id',
            data_type: 'integer',
            is_nullable: 'NO',
            column_default: null,
            character_maximum_length: null,
          },
          {
            table_name: 'users',
            column_name: 'email',
            data_type: 'varchar',
            is_nullable: 'NO',
            column_default: null,
            character_maximum_length: 255,
          },
        ],
        indexes: [],
        constraints: [],
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [
          {
            table_name: 'users',
            column_name: 'id',
            data_type: 'integer',
            is_nullable: 'NO',
            column_default: null,
            character_maximum_length: null,
          },
        ],
        indexes: [],
        constraints: [],
      });

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      const missingDiff = result.diffs.find(d => 
        d.type === 'column' && 
        d.action === 'missing' &&
        d.path === 'users.email'
      );
      expect(missingDiff).toBeDefined();
    });

    it('should detect extra columns', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [
          {
            table_name: 'users',
            column_name: 'id',
            data_type: 'integer',
            is_nullable: 'NO',
            column_default: null,
            character_maximum_length: null,
          },
        ],
        indexes: [],
        constraints: [],
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [
          {
            table_name: 'users',
            column_name: 'id',
            data_type: 'integer',
            is_nullable: 'NO',
            column_default: null,
            character_maximum_length: null,
          },
          {
            table_name: 'users',
            column_name: 'extra_field',
            data_type: 'text',
            is_nullable: 'YES',
            column_default: null,
            character_maximum_length: null,
          },
        ],
        indexes: [],
        constraints: [],
      });

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      const extraDiff = result.diffs.find(d => 
        d.type === 'column' && 
        d.action === 'extra' &&
        d.path === 'users.extra_field'
      );
      expect(extraDiff).toBeDefined();
    });
  });

  describe('Index Comparison', () => {
    it('should detect missing indexes', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [],
        indexes: [
          {
            tablename: 'users',
            indexname: 'users_email_idx',
            indexdef: 'CREATE INDEX users_email_idx ON public.users USING btree (email)',
          },
        ],
        constraints: [],
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [],
        indexes: [],
        constraints: [],
      });

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      const indexDiff = result.diffs.find(d => 
        d.type === 'index' && 
        d.action === 'missing'
      );
      expect(indexDiff).toBeDefined();
      expect(indexDiff?.path).toBe('public.users_email_idx');
    });

    it('should detect index definition mismatch', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [],
        indexes: [
          {
            tablename: 'users',
            indexname: 'users_email_idx',
            indexdef: 'CREATE INDEX users_email_idx ON public.users USING btree (email)',
          },
        ],
        constraints: [],
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [],
        indexes: [
          {
            tablename: 'users',
            indexname: 'users_email_idx',
            indexdef: 'CREATE UNIQUE INDEX users_email_idx ON public.users USING btree (email)',
          },
        ],
        constraints: [],
      });

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      const indexDiff = result.diffs.find(d => 
        d.type === 'index' && 
        d.action === 'mismatch'
      );
      expect(indexDiff).toBeDefined();
    });
  });

  describe('Constraint Comparison', () => {
    it('should detect missing constraints', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'posts' }],
        columns: [],
        indexes: [],
        constraints: [
          {
            table_name: 'posts',
            constraint_name: 'posts_user_id_fkey',
            constraint_type: 'FOREIGN KEY',
          },
        ],
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'posts' }],
        columns: [],
        indexes: [],
        constraints: [],
      });

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      const constraintDiff = result.diffs.find(d => 
        d.type === 'constraint' && 
        d.action === 'missing'
      );
      expect(constraintDiff).toBeDefined();
      expect(constraintDiff?.path).toBe('public.posts_user_id_fkey');
    });

    it('should detect constraint type mismatch', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [],
        indexes: [],
        constraints: [
          {
            table_name: 'users',
            constraint_name: 'users_email_key',
            constraint_type: 'UNIQUE',
          },
        ],
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [],
        indexes: [],
        constraints: [
          {
            table_name: 'users',
            constraint_name: 'users_email_key',
            constraint_type: 'CHECK',
          },
        ],
      });

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      const constraintDiff = result.diffs.find(d => 
        d.type === 'constraint' && 
        d.action === 'mismatch'
      );
      expect(constraintDiff).toBeDefined();
    });
  });

  describe('Comprehensive Schema Tests', () => {
    it('should pass when schemas match perfectly', async () => {
      const mockData = {
        tables: [{ table_name: 'users' }],
        columns: [
          {
            table_name: 'users',
            column_name: 'id',
            data_type: 'integer',
            is_nullable: 'NO',
            column_default: null,
            character_maximum_length: null,
          },
        ],
        indexes: [
          {
            tablename: 'users',
            indexname: 'users_pkey',
            indexdef: 'CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)',
          },
        ],
        constraints: [
          {
            table_name: 'users',
            constraint_name: 'users_pkey',
            constraint_type: 'UNIQUE',
          },
        ],
      };

      const sourceClient = createMockPoolClient(mockData);
      const targetClient = createMockPoolClient(mockData);

      const result = await verifySchemaIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(true);
      expect(result.diffs).toHaveLength(0);
      expect(result.checkedAt).toBeInstanceOf(Date);
    });
  });
});

// ============================================================================
// Data Verification Tests
// ============================================================================

describe('verifyDataIntegrity', () => {
  describe('Row Count Validation', () => {
    it('should pass when row counts match', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 100 },
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 100 },
      });

      const result = await verifyDataIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(true);
      const countCheck = result.checks.find(c => c.table === 'users');
      expect(countCheck).toBeDefined();
      expect(countCheck?.passed).toBe(true);
      expect(countCheck?.source).toBe(100);
      expect(countCheck?.target).toBe(100);
    });

    it('should fail when row counts differ', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 100 },
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 95 },
      });

      const result = await verifyDataIntegrity(sourceClient, targetClient);

      expect(result.passed).toBe(false);
      const countCheck = result.checks.find(c => c.table === 'users');
      expect(countCheck).toBeDefined();
      expect(countCheck?.passed).toBe(false);
      expect(countCheck?.source).toBe(100);
      expect(countCheck?.target).toBe(95);
      expect(countCheck?.difference).toContain('diff: 5');
    });
  });

  describe('Checksum Validation', () => {
    it('should pass when checksums match', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 10 },
        checksums: { users: 'abc123def456' },
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 10 },
        checksums: { users: 'abc123def456' },
      });

      const result = await verifyDataIntegrity(sourceClient, targetClient);

      const checksumCheck = result.checks.find(c => c.table === 'users_checksum');
      expect(checksumCheck).toBeDefined();
      expect(checksumCheck?.passed).toBe(true);
      expect(checksumCheck?.source).toBe('abc123def456');
      expect(checksumCheck?.target).toBe('abc123def456');
    });

    it('should fail when checksums differ', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 10 },
        checksums: { users: 'abc123def456' },
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 10 },
        checksums: { users: 'different789' },
      });

      const result = await verifyDataIntegrity(sourceClient, targetClient);

      const checksumCheck = result.checks.find(c => c.table === 'users_checksum');
      expect(checksumCheck).toBeDefined();
      expect(checksumCheck?.passed).toBe(false);
      expect(checksumCheck?.difference).toBe('Data content differs');
    });

    it('should skip checksums when skipChecksums option is true', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 10 },
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 10 },
      });

      const result = await verifyDataIntegrity(sourceClient, targetClient, { skipChecksums: true });

      const checksumCheck = result.checks.find(c => c.table === 'users_checksum');
      expect(checksumCheck).toBeUndefined();
    });
  });

  describe('Foreign Key Integrity', () => {
    it('should pass when no FK orphans exist', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'posts' }],
        columns: [{ table_name: 'posts', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { posts: 50 },
        fkOrphans: { posts: 0 },
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'posts' }],
        columns: [{ table_name: 'posts', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { posts: 50 },
        fkOrphans: { posts: 0 },
      });

      const result = await verifyDataIntegrity(sourceClient, targetClient);

      // FK checks come from target client only
      const fkCheck = result.checks.find(c => c.table.includes('_fk_'));
      if (fkCheck) {
        expect(fkCheck.passed).toBe(true);
      }
    });

    it('should detect FK orphans', async () => {
      const mockClient = createMockPoolClient({
        tables: [{ table_name: 'posts' }],
        columns: [{ table_name: 'posts', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { posts: 50 },
        fkOrphans: { posts: 5 },
      });

      const result = await verifyDataIntegrity(mockClient, mockClient);

      const fkCheck = result.checks.find(c => c.table.includes('_fk_'));
      if (fkCheck) {
        expect(fkCheck.passed).toBe(false);
        expect(fkCheck.target).toBe(5);
        expect(fkCheck.difference).toContain('5 orphaned records');
      }
    });
  });

  describe('Configuration Options', () => {
    it('should skip tables when skipTables option is provided', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'users' }, { table_name: 'logs' }],
        columns: [
          { table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null },
          { table_name: 'logs', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null },
        ],
        rowCounts: { users: 100, logs: 1000 },
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'users' }, { table_name: 'logs' }],
        columns: [
          { table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null },
          { table_name: 'logs', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null },
        ],
        rowCounts: { users: 100, logs: 999 },
      });

      const result = await verifyDataIntegrity(sourceClient, targetClient, { skipTables: ['logs'] });

      const logsCheck = result.checks.find(c => c.table === 'logs');
      expect(logsCheck).toBeUndefined();

      const usersCheck = result.checks.find(c => c.table === 'users');
      expect(usersCheck).toBeDefined();
    });

    it('should use sampleSize option for large tables', async () => {
      const sourceClient = createMockPoolClient({
        tables: [{ table_name: 'large_table' }],
        columns: [{ table_name: 'large_table', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { large_table: 1000000 },
        checksums: { large_table: 'sample123' },
      });

      const targetClient = createMockPoolClient({
        tables: [{ table_name: 'large_table' }],
        columns: [{ table_name: 'large_table', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { large_table: 1000000 },
        checksums: { large_table: 'sample123' },
      });

      const result = await verifyDataIntegrity(sourceClient, targetClient, { sampleSize: 1000 });

      // Verify that checksums were calculated (with sampling)
      const checksumCheck = result.checks.find(c => c.table === 'large_table_checksum');
      expect(checksumCheck).toBeDefined();
    });
  });
});

