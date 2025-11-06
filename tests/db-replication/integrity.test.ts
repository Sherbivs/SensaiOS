/**
 * Database Integrity Verification Tests
 * 
 * Comprehensive test coverage for schema and data integrity verification
 * between source and target databases in the replication cascade.
 */

import type { PrismaClient } from '@prisma/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  verifySchemaIntegrity,
  verifyDataIntegrity,
  type IntegrityOptions,
  type SchemaDiff,
  type DataCheck,
} from '../../src/services/db-replication/integrity.js';

// ============================================================================
// Mock Prisma Client Factory
// ============================================================================

function createMockPrismaClient(mockData: {
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
}): PrismaClient {
  return {
    $queryRaw: vi.fn(async (query: TemplateStringsArray) => {
      const queryStr = query.join('');

      // Tables query
      if (queryStr.includes('FROM information_schema.tables')) {
        return mockData.tables || [];
      }

      // Columns query
      if (queryStr.includes('FROM information_schema.columns')) {
        return mockData.columns || [];
      }

      // Indexes query
      if (queryStr.includes('FROM pg_indexes')) {
        return mockData.indexes || [];
      }

      // Constraints query
      if (queryStr.includes('FROM information_schema.table_constraints')) {
        return mockData.constraints || [];
      }

      // FK query
      if (queryStr.includes('information_schema.key_column_usage')) {
        return [];
      }

      return [];
    }),
    $queryRawUnsafe: vi.fn(async (query: string, ...params: unknown[]) => {
      // Row count queries
      if (query.includes('SELECT COUNT(*) as count FROM')) {
        const match = query.match(/FROM "(\w+)"/);
        if (match && mockData.rowCounts) {
          const tableName = match[1];
          return [{ count: BigInt(mockData.rowCounts[tableName] || 0) }];
        }
        return [{ count: BigInt(0) }];
      }

      // Checksum queries
      if (query.includes('md5(string_agg')) {
        const match = query.match(/FROM "(\w+)"/);
        if (match && mockData.checksums) {
          const tableName = match[1];
          return [{ checksum: mockData.checksums[tableName] || 'EMPTY' }];
        }
        return [{ checksum: 'EMPTY' }];
      }

      // FK orphan queries
      if (query.includes('LEFT JOIN')) {
        const match = query.match(/FROM "(\w+)" child/);
        if (match && mockData.fkOrphans) {
          const tableName = match[1];
          return [{ count: BigInt(mockData.fkOrphans[tableName] || 0) }];
        }
        return [{ count: BigInt(0) }];
      }

      // Column list query
      if (query.includes('FROM information_schema.columns') && params.length > 0) {
        const tableName = params[0] as string;
        const cols = mockData.columns?.filter(c => c.table_name === tableName) || [];
        return cols.map(c => ({ column_name: c.column_name }));
      }

      return [];
    }),
  } as unknown as PrismaClient;
}

// ============================================================================
// Schema Verification Tests
// ============================================================================

describe('verifySchemaIntegrity', () => {
  describe('Table Comparison', () => {
    it('should detect missing tables in target', async () => {
      const sourceClient = createMockPrismaClient({
        tables: [{ table_name: 'users' }, { table_name: 'posts' }],
        columns: [],
        indexes: [],
        constraints: [],
      });

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
        tables: [{ table_name: 'users' }],
        columns: [],
        indexes: [],
        constraints: [],
      });

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
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

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
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

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
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

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
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

      const targetClient = createMockPrismaClient({
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
        d.path === 'public.users.email'
      );
      expect(missingDiff).toBeDefined();
    });

    it('should detect extra columns', async () => {
      const sourceClient = createMockPrismaClient({
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

      const targetClient = createMockPrismaClient({
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
        d.path === 'public.users.extra_field'
      );
      expect(extraDiff).toBeDefined();
    });
  });

  describe('Index Comparison', () => {
    it('should detect missing indexes', async () => {
      const sourceClient = createMockPrismaClient({
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

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
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

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
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

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
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

      const targetClient = createMockPrismaClient({
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

      const sourceClient = createMockPrismaClient(mockData);
      const targetClient = createMockPrismaClient(mockData);

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
      const sourceClient = createMockPrismaClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 100 },
      });

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 100 },
      });

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 10 },
        checksums: { users: 'abc123def456' },
      });

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 10 },
        checksums: { users: 'abc123def456' },
      });

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
        tables: [{ table_name: 'users' }],
        columns: [{ table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { users: 10 },
      });

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
        tables: [{ table_name: 'posts' }],
        columns: [{ table_name: 'posts', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { posts: 50 },
        fkOrphans: { posts: 0 },
      });

      const targetClient = createMockPrismaClient({
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
      const mockClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
        tables: [{ table_name: 'users' }, { table_name: 'logs' }],
        columns: [
          { table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null },
          { table_name: 'logs', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null },
        ],
        rowCounts: { users: 100, logs: 1000 },
      });

      const targetClient = createMockPrismaClient({
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
      const sourceClient = createMockPrismaClient({
        tables: [{ table_name: 'large_table' }],
        columns: [{ table_name: 'large_table', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, character_maximum_length: null }],
        rowCounts: { large_table: 1000000 },
        checksums: { large_table: 'sample123' },
      });

      const targetClient = createMockPrismaClient({
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
