/**
 * Centralized Prisma Client Mocking Utilities
 * 
 * Provides reusable mock factories for testing database operations
 * without requiring actual database connections.
 * 
 * Usage:
 * ```typescript
 * import { createMockPrismaWithMigrations, createMockPrismaWithSchema } from '../shared/prisma-mocks';
 * 
 * const mockPrisma = createMockPrismaWithMigrations([
 *   { migration_name: '20250101_init', checksum: 'abc123', ... }
 * ]);
 * ```
 */

import type { PrismaClient } from '@prisma/client';
import { vi } from 'vitest';

// ============================================================================
// Type Definitions
// ============================================================================

export type MockMigration = {
  migration_name: string;
  checksum: string;
  applied_steps_count?: number;
  started_at: Date;
  finished_at: Date | null;
};

export type MockTable = {
  table_name: string;
};

export type MockColumn = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
};

export type MockIndex = {
  tablename: string;
  indexname: string;
  indexdef: string;
};

export type MockConstraint = {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
};

export type MockSchemaData = {
  tables?: MockTable[];
  columns?: MockColumn[];
  indexes?: MockIndex[];
  constraints?: MockConstraint[];
  rowCounts?: Record<string, number>;
  checksums?: Record<string, string>;
  fkOrphans?: Record<string, number>;
};

// ============================================================================
// Mock Factory Functions
// ============================================================================

/**
 * Create a mock Prisma client for migration/version testing
 * 
 * @param migrations - Array of migration records
 * @returns Mock PrismaClient with $queryRaw, dbVersion, and dbSyncState
 */
export function createMockPrismaWithMigrations(migrations: MockMigration[]): PrismaClient {
  return {
    $queryRaw: vi.fn().mockResolvedValue(migrations),
    dbVersion: {
      create: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    dbSyncState: {
      create: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  } as any;
}

/**
 * Create a mock Prisma client for schema integrity testing
 * 
 * @param mockData - Schema elements (tables, columns, indexes, constraints)
 * @returns Mock PrismaClient with $queryRaw supporting schema queries
 */
export function createMockPrismaWithSchema(mockData: MockSchemaData): PrismaClient {
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

      // Row count queries (COUNT(*) FROM table_name)
      const countMatch = queryStr.match(/COUNT\(\*\)\s+FROM\s+"?(\w+)"?/i);
      if (countMatch && mockData.rowCounts) {
        const tableName = countMatch[1];
        return [{ count: BigInt(mockData.rowCounts[tableName] || 0) }];
      }

      // Checksum queries (MD5 aggregation)
      const checksumMatch = queryStr.match(/FROM\s+"?(\w+)"?.*MD5/i);
      if (checksumMatch && mockData.checksums) {
        const tableName = checksumMatch[1];
        return [{ checksum: mockData.checksums[tableName] || '' }];
      }

      // Foreign key orphan queries (LEFT JOIN)
      const fkMatch = queryStr.match(/LEFT JOIN.*COUNT\(\*\).*WHERE.*IS NULL/i);
      if (fkMatch && mockData.fkOrphans) {
        const tableName = Object.keys(mockData.fkOrphans)[0] || '';
        return [{ orphan_count: BigInt(mockData.fkOrphans[tableName] || 0) }];
      }

      return [];
    }),
  } as any;
}

/**
 * Create a fully-featured mock Prisma client for general testing
 * 
 * @param options - Configuration for model mocks
 * @returns Mock PrismaClient with common model methods
 */
export function createMockPrisma(options: {
  users?: any[];
  pokemon?: any[];
  parties?: any[];
  partySlots?: any[];
  battles?: any[];
  encounters?: any[];
} = {}): PrismaClient {
  const mockData = {
    users: options.users || [],
    pokemon: options.pokemon || [],
    parties: options.parties || [],
    partySlots: options.partySlots || [],
    battles: options.battles || [],
    encounters: options.encounters || [],
  };

  return {
    user: {
      findUnique: vi.fn(async ({ where }) => {
        return mockData.users.find((u) => 
          u.id === where.id || u.discordId === where.discordId
        ) || null;
      }),
      findMany: vi.fn().mockResolvedValue(mockData.users),
      create: vi.fn(async ({ data }) => ({ ...data, id: 'new-id' })),
      update: vi.fn(async ({ data, where }) => ({ ...data, ...where })),
      upsert: vi.fn(async ({ create, update, where }) => ({ ...create, ...update, ...where })),
    },
    pokemonInstance: {
      findUnique: vi.fn(async ({ where }) => {
        return mockData.pokemon.find((p) => p.id === where.id) || null;
      }),
      findMany: vi.fn().mockResolvedValue(mockData.pokemon),
      create: vi.fn(async ({ data }) => ({ ...data, id: 'new-pokemon-id' })),
      update: vi.fn(async ({ data, where }) => ({ ...data, ...where })),
    },
    party: {
      findUnique: vi.fn(async ({ where, include }) => {
        const party = mockData.parties.find((p) => p.id === where.id) || null;
        if (party && include?.slots) {
          return {
            ...party,
            slots: mockData.partySlots.filter((s) => s.partyId === party.id),
          };
        }
        return party;
      }),
      findFirst: vi.fn(async ({ where, include }) => {
        const party = mockData.parties.find((p) => p.ownerId === where?.ownerId) || null;
        if (party && include?.slots) {
          return {
            ...party,
            slots: mockData.partySlots.filter((s) => s.partyId === party.id),
          };
        }
        return party;
      }),
      findMany: vi.fn().mockResolvedValue(mockData.parties),
      create: vi.fn(async ({ data }) => ({ ...data, id: 'new-party-id' })),
    },
    partySlot: {
      findMany: vi.fn(async ({ where }) => {
        return mockData.partySlots.filter((s) => s.partyId === where?.partyId);
      }),
      create: vi.fn(async ({ data }) => ({ ...data, id: 'new-slot-id' })),
      update: vi.fn(async ({ data, where }) => ({ ...data, ...where })),
    },
    battle: {
      findUnique: vi.fn(async ({ where }) => {
        return mockData.battles.find((b) => b.id === where.id) || null;
      }),
      findMany: vi.fn().mockResolvedValue(mockData.battles),
      create: vi.fn(async ({ data }) => ({ ...data, id: 'new-battle-id' })),
      update: vi.fn(async ({ data, where }) => ({ ...data, ...where })),
    },
    encounter: {
      findUnique: vi.fn(async ({ where }) => {
        return mockData.encounters.find((e) => e.id === where.id) || null;
      }),
      findMany: vi.fn().mockResolvedValue(mockData.encounters),
      create: vi.fn(async ({ data }) => ({ ...data, id: 'new-encounter-id' })),
      update: vi.fn(async ({ data, where }) => ({ ...data, ...where })),
    },
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (callback: any) => {
      if (typeof callback === 'function') {
        const mockClient = createMockPrisma(options);
        return callback(mockClient);
      }
      return Promise.all(callback);
    }),
  } as any;
}

/**
 * Create a minimal mock Prisma client for simple tests
 * 
 * @returns Basic mock PrismaClient with essential methods
 */
export function createBasicMockPrisma(): PrismaClient {
  return {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (callback: any) => {
      if (typeof callback === 'function') {
        const mockClient = createBasicMockPrisma();
        return callback(mockClient);
      }
      return Promise.all(callback);
    }),
  } as any;
}

// ============================================================================
// Sample Test Data Factories
// ============================================================================

/**
 * Generate sample migration records for testing
 * 
 * @param count - Number of migrations to generate
 * @param startDate - Starting date for migrations
 * @returns Array of mock migrations
 */
export function generateSampleMigrations(
  count: number,
  startDate = new Date('2025-01-01T00:00:00Z')
): MockMigration[] {
  const migrations: MockMigration[] = [];
  
  for (let i = 0; i < count; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    
    migrations.push({
      migration_name: `2025010${i + 1}000000_migration_${i + 1}`,
      checksum: `checksum${i + 1}${String(i).repeat(3)}`,
      applied_steps_count: 1,
      started_at: date,
      finished_at: new Date(date.getTime() + 1000),
    });
  }
  
  return migrations;
}

/**
 * Generate sample schema data for testing
 * 
 * @param tableNames - Array of table names to include
 * @returns Mock schema data with tables and columns
 */
export function generateSampleSchema(tableNames: string[]): MockSchemaData {
  const tables: MockTable[] = tableNames.map((name) => ({ table_name: name }));
  
  const columns: MockColumn[] = tableNames.flatMap((tableName) => [
    {
      table_name: tableName,
      column_name: 'id',
      data_type: 'text',
      is_nullable: 'NO',
      column_default: null,
      character_maximum_length: null,
    },
    {
      table_name: tableName,
      column_name: 'created_at',
      data_type: 'timestamp without time zone',
      is_nullable: 'NO',
      column_default: 'now()',
      character_maximum_length: null,
    },
  ]);
  
  return { tables, columns };
}
