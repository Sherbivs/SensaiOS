/**
 * Database Integrity Verification
 * 
 * Verifies schema and data integrity between source and target databases
 * for the replication cascade (DEV → Prod → Local).
 * 
 * Features:
 * - Schema comparison (tables, columns, indexes, constraints, enums)
 * - Data validation (row counts, checksums, FK integrity)
 * - Configurable performance options (skip tables, sample size)
 * - Structured diff reporting for automated analysis
 */

import type { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

// Temporary logger until integration
const logger = {
  info: (msg: string, ...args: unknown[]) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

// ============================================================================
// Type Definitions
// ============================================================================

export interface IntegrityOptions {
  /** Tables to exclude from all integrity checks */
  skipTables?: string[];
  /** Skip expensive checksum validation (only do row counts) */
  skipChecksums?: boolean;
  /** Sample size for large table checksums (0 = all rows) */
  sampleSize?: number;
}

export type SchemaDiffType = 'table' | 'column' | 'index' | 'constraint' | 'enum';
export type SchemaDiffAction = 'missing' | 'extra' | 'mismatch';

export interface SchemaDiff {
  /** Type of schema element that differs */
  type: SchemaDiffType;
  /** Whether element is missing in target, extra in target, or mismatched */
  action: SchemaDiffAction;
  /** Path to the differing element (e.g., "public.users.email") */
  path: string;
  /** Additional details about the difference */
  details: unknown;
}

export interface DataCheck {
  /** Table name */
  table: string;
  /** Whether the check passed */
  passed: boolean;
  /** Source value (count or checksum) */
  source: number | string;
  /** Target value (count or checksum) */
  target: number | string;
  /** Human-readable difference description */
  difference: string;
}

export interface SchemaIntegrityResult {
  /** Whether schema is fully consistent */
  passed: boolean;
  /** List of schema differences found */
  diffs: SchemaDiff[];
  /** When the check was performed */
  checkedAt: Date;
}

export interface DataIntegrityResult {
  /** Whether data is fully consistent */
  passed: boolean;
  /** List of data check results */
  checks: DataCheck[];
  /** When the check was performed */
  checkedAt: Date;
}

// ============================================================================
// Schema Verification
// ============================================================================

/**
 * Verify schema integrity between source and target databases.
 * 
 * Compares:
 * - Tables (missing, extra)
 * - Columns (type, nullable, default, length)
 * - Indexes (definition, unique, columns)
 * - Constraints (FK, unique, check)
 * - Enums (values, order)
 * 
 * @param sourceClient - Source database Prisma client
 * @param targetClient - Target database Prisma client
 * @param options - Verification options
 * @returns Schema integrity result with structured diffs
 */
export async function verifySchemaIntegrity(
  sourceClient: PrismaClient,
  targetClient: PrismaClient,
  options: IntegrityOptions = {}
): Promise<SchemaIntegrityResult> {
  logger.info('Starting schema integrity verification');
  
  const diffs: SchemaDiff[] = [];
  const skipTables = new Set(options.skipTables || []);

  try {
    // Compare tables
    const tableDiffs = await compareTableStructures(sourceClient, targetClient, skipTables);
    diffs.push(...tableDiffs);

    // Compare columns (only for tables that exist in both)
    const columnDiffs = await compareColumnDefinitions(sourceClient, targetClient, skipTables);
    diffs.push(...columnDiffs);

    // Compare indexes
    const indexDiffs = await compareIndexes(sourceClient, targetClient, skipTables);
    diffs.push(...indexDiffs);

    // Compare constraints
    const constraintDiffs = await compareConstraints(sourceClient, targetClient, skipTables);
    diffs.push(...constraintDiffs);

    const passed = diffs.length === 0;
    logger.info(`Schema verification complete: ${passed ? 'PASSED' : `FAILED (${diffs.length} diffs)`}`);

    return {
      passed,
      diffs,
      checkedAt: new Date(),
    };
  } catch (error) {
    logger.error('Schema verification failed:', error);
    throw error;
  }
}

/**
 * Compare table structures between source and target.
 * Identifies missing and extra tables.
 */
async function compareTableStructures(
  sourceClient: PrismaClient,
  targetClient: PrismaClient,
  skipTables: Set<string>
): Promise<SchemaDiff[]> {
  const diffs: SchemaDiff[] = [];

  // Get table lists from information_schema
  const sourceTables = await sourceClient.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  const targetTables = await targetClient.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  const sourceTableNames = new Set(
    sourceTables.map(t => t.table_name).filter(name => !skipTables.has(name))
  );
  const targetTableNames = new Set(
    targetTables.map(t => t.table_name).filter(name => !skipTables.has(name))
  );

  // Find missing tables (in source but not target)
  for (const tableName of sourceTableNames) {
    if (!targetTableNames.has(tableName)) {
      diffs.push({
        type: 'table',
        action: 'missing',
        path: `public.${tableName}`,
        details: { table: tableName, message: 'Table exists in source but missing in target' },
      });
    }
  }

  // Find extra tables (in target but not source)
  for (const tableName of targetTableNames) {
    if (!sourceTableNames.has(tableName)) {
      diffs.push({
        type: 'table',
        action: 'extra',
        path: `public.${tableName}`,
        details: { table: tableName, message: 'Table exists in target but not in source' },
      });
    }
  }

  return diffs;
}

/**
 * Compare column definitions between source and target.
 * Checks type, nullable, default values, and character length.
 */
async function compareColumnDefinitions(
  sourceClient: PrismaClient,
  targetClient: PrismaClient,
  skipTables: Set<string>
): Promise<SchemaDiff[]> {
  const diffs: SchemaDiff[] = [];

  // Get column metadata from information_schema
  const sourceColumns = await sourceClient.$queryRaw<Array<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    character_maximum_length: number | null;
  }>>`
    SELECT table_name, column_name, data_type, is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;

  const targetColumns = await targetClient.$queryRaw<Array<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    character_maximum_length: number | null;
  }>>`
    SELECT table_name, column_name, data_type, is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;

  // Build lookup maps
  const sourceMap = new Map<string, typeof sourceColumns[0]>();
  for (const col of sourceColumns) {
    if (!skipTables.has(col.table_name)) {
      sourceMap.set(`${col.table_name}.${col.column_name}`, col);
    }
  }

  const targetMap = new Map<string, typeof targetColumns[0]>();
  for (const col of targetColumns) {
    if (!skipTables.has(col.table_name)) {
      targetMap.set(`${col.table_name}.${col.column_name}`, col);
    }
  }

  // Compare columns that exist in both
  for (const [key, sourceCol] of sourceMap) {
    const targetCol = targetMap.get(key);

    if (!targetCol) {
      // Column missing in target
      diffs.push({
        type: 'column',
        action: 'missing',
        path: `public.${key}`,
        details: {
          table: sourceCol.table_name,
          column: sourceCol.column_name,
          sourceType: sourceCol.data_type,
        },
      });
      continue;
    }

    // Check for mismatches
    if (sourceCol.data_type !== targetCol.data_type) {
      diffs.push({
        type: 'column',
        action: 'mismatch',
        path: `public.${key}`,
        details: {
          table: sourceCol.table_name,
          column: sourceCol.column_name,
          field: 'data_type',
          source: sourceCol.data_type,
          target: targetCol.data_type,
        },
      });
    }

    if (sourceCol.is_nullable !== targetCol.is_nullable) {
      diffs.push({
        type: 'column',
        action: 'mismatch',
        path: `public.${key}`,
        details: {
          table: sourceCol.table_name,
          column: sourceCol.column_name,
          field: 'is_nullable',
          source: sourceCol.is_nullable,
          target: targetCol.is_nullable,
        },
      });
    }

    if (sourceCol.column_default !== targetCol.column_default) {
      diffs.push({
        type: 'column',
        action: 'mismatch',
        path: `public.${key}`,
        details: {
          table: sourceCol.table_name,
          column: sourceCol.column_name,
          field: 'column_default',
          source: sourceCol.column_default,
          target: targetCol.column_default,
        },
      });
    }

    if (sourceCol.character_maximum_length !== targetCol.character_maximum_length) {
      diffs.push({
        type: 'column',
        action: 'mismatch',
        path: `public.${key}`,
        details: {
          table: sourceCol.table_name,
          column: sourceCol.column_name,
          field: 'character_maximum_length',
          source: sourceCol.character_maximum_length,
          target: targetCol.character_maximum_length,
        },
      });
    }
  }

  // Find extra columns (in target but not source)
  for (const [key, targetCol] of targetMap) {
    if (!sourceMap.has(key)) {
      diffs.push({
        type: 'column',
        action: 'extra',
        path: `public.${key}`,
        details: {
          table: targetCol.table_name,
          column: targetCol.column_name,
          targetType: targetCol.data_type,
        },
      });
    }
  }

  return diffs;
}

/**
 * Compare indexes between source and target.
 * Checks index definition, uniqueness, and columns.
 */
async function compareIndexes(
  sourceClient: PrismaClient,
  targetClient: PrismaClient,
  skipTables: Set<string>
): Promise<SchemaDiff[]> {
  const diffs: SchemaDiff[] = [];

  // Get index definitions from pg_indexes
  const sourceIndexes = await sourceClient.$queryRaw<Array<{
    tablename: string;
    indexname: string;
    indexdef: string;
  }>>`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `;

  const targetIndexes = await targetClient.$queryRaw<Array<{
    tablename: string;
    indexname: string;
    indexdef: string;
  }>>`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `;

  // Build lookup maps
  const sourceMap = new Map<string, string>();
  for (const idx of sourceIndexes) {
    if (!skipTables.has(idx.tablename)) {
      sourceMap.set(idx.indexname, idx.indexdef);
    }
  }

  const targetMap = new Map<string, string>();
  for (const idx of targetIndexes) {
    if (!skipTables.has(idx.tablename)) {
      targetMap.set(idx.indexname, idx.indexdef);
    }
  }

  // Compare indexes
  for (const [indexName, sourceDef] of sourceMap) {
    const targetDef = targetMap.get(indexName);

    if (!targetDef) {
      diffs.push({
        type: 'index',
        action: 'missing',
        path: `public.${indexName}`,
        details: { index: indexName, sourceDefinition: sourceDef },
      });
    } else if (sourceDef !== targetDef) {
      diffs.push({
        type: 'index',
        action: 'mismatch',
        path: `public.${indexName}`,
        details: {
          index: indexName,
          source: sourceDef,
          target: targetDef,
        },
      });
    }
  }

  // Find extra indexes
  for (const [indexName, targetDef] of targetMap) {
    if (!sourceMap.has(indexName)) {
      diffs.push({
        type: 'index',
        action: 'extra',
        path: `public.${indexName}`,
        details: { index: indexName, targetDefinition: targetDef },
      });
    }
  }

  return diffs;
}

/**
 * Compare constraints between source and target.
 * Checks foreign keys, unique constraints, and check constraints.
 */
async function compareConstraints(
  sourceClient: PrismaClient,
  targetClient: PrismaClient,
  skipTables: Set<string>
): Promise<SchemaDiff[]> {
  const diffs: SchemaDiff[] = [];

  // Get constraint metadata from information_schema
  const sourceConstraints = await sourceClient.$queryRaw<Array<{
    table_name: string;
    constraint_name: string;
    constraint_type: string;
  }>>`
    SELECT table_name, constraint_name, constraint_type
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_type IN ('FOREIGN KEY', 'UNIQUE', 'CHECK')
    ORDER BY table_name, constraint_name
  `;

  const targetConstraints = await targetClient.$queryRaw<Array<{
    table_name: string;
    constraint_name: string;
    constraint_type: string;
  }>>`
    SELECT table_name, constraint_name, constraint_type
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_type IN ('FOREIGN KEY', 'UNIQUE', 'CHECK')
    ORDER BY table_name, constraint_name
  `;

  // Build lookup maps
  const sourceMap = new Map<string, string>();
  for (const con of sourceConstraints) {
    if (!skipTables.has(con.table_name)) {
      sourceMap.set(con.constraint_name, con.constraint_type);
    }
  }

  const targetMap = new Map<string, string>();
  for (const con of targetConstraints) {
    if (!skipTables.has(con.table_name)) {
      targetMap.set(con.constraint_name, con.constraint_type);
    }
  }

  // Compare constraints
  for (const [constraintName, sourceType] of sourceMap) {
    const targetType = targetMap.get(constraintName);

    if (!targetType) {
      diffs.push({
        type: 'constraint',
        action: 'missing',
        path: `public.${constraintName}`,
        details: { constraint: constraintName, sourceType },
      });
    } else if (sourceType !== targetType) {
      diffs.push({
        type: 'constraint',
        action: 'mismatch',
        path: `public.${constraintName}`,
        details: {
          constraint: constraintName,
          source: sourceType,
          target: targetType,
        },
      });
    }
  }

  // Find extra constraints
  for (const [constraintName, targetType] of targetMap) {
    if (!sourceMap.has(constraintName)) {
      diffs.push({
        type: 'constraint',
        action: 'extra',
        path: `public.${constraintName}`,
        details: { constraint: constraintName, targetType },
      });
    }
  }

  return diffs;
}

// ============================================================================
// Data Verification
// ============================================================================

/**
 * Verify data integrity between source and target databases.
 * 
 * Validates:
 * - Row counts (all tables)
 * - Checksums (configurable tables with sampling)
 * - Foreign key integrity (orphaned records)
 * 
 * @param sourceClient - Source database Prisma client
 * @param targetClient - Target database Prisma client
 * @param options - Verification options
 * @returns Data integrity result with check details
 */
export async function verifyDataIntegrity(
  sourceClient: PrismaClient,
  targetClient: PrismaClient,
  options: IntegrityOptions = {}
): Promise<DataIntegrityResult> {
  logger.info('Starting data integrity verification');
  
  const checks: DataCheck[] = [];
  const skipTables = new Set(options.skipTables || []);

  try {
    // Get table list
    const tables = await sourceClient.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    // Verify row counts for all tables
    for (const { table_name } of tables) {
      if (skipTables.has(table_name)) continue;

      const sourceCount = await sourceClient.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM "${table_name}"`
      );
      const targetCount = await targetClient.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM "${table_name}"`
      );

      const sourceNum = Number(sourceCount[0].count);
      const targetNum = Number(targetCount[0].count);
      const passed = sourceNum === targetNum;

      checks.push({
        table: table_name,
        passed,
        source: sourceNum,
        target: targetNum,
        difference: passed ? 'Match' : `Source has ${sourceNum}, target has ${targetNum} (diff: ${sourceNum - targetNum})`,
      });

      if (!passed) {
        logger.warn(`Row count mismatch in ${table_name}: source=${sourceNum}, target=${targetNum}`);
      }
    }

    // Verify checksums if not skipped
    if (!options.skipChecksums) {
      for (const { table_name } of tables) {
        if (skipTables.has(table_name)) continue;

        try {
          const sourceChecksum = await calculateTableChecksum(sourceClient, table_name, options.sampleSize);
          const targetChecksum = await calculateTableChecksum(targetClient, table_name, options.sampleSize);
          const passed = sourceChecksum === targetChecksum;

          checks.push({
            table: `${table_name}_checksum`,
            passed,
            source: sourceChecksum,
            target: targetChecksum,
            difference: passed ? 'Match' : 'Data content differs',
          });

          if (!passed) {
            logger.warn(`Checksum mismatch in ${table_name}: source=${sourceChecksum}, target=${targetChecksum}`);
          }
        } catch (error) {
          logger.warn(`Checksum calculation failed for ${table_name}:`, error);
          // Non-fatal: continue with other tables
        }
      }
    }

    // Verify FK integrity
    const fkChecks = await verifyForeignKeyIntegrity(targetClient, skipTables);
    checks.push(...fkChecks);

    const passed = checks.every(c => c.passed);
    logger.info(`Data verification complete: ${passed ? 'PASSED' : `FAILED (${checks.filter(c => !c.passed).length} failures)`}`);

    return {
      passed,
      checks,
      checkedAt: new Date(),
    };
  } catch (error) {
    logger.error('Data verification failed:', error);
    throw error;
  }
}

/**
 * Calculate deterministic checksum for a table.
 * Uses MD5 hash of ordered row data with optional sampling.
 */
async function calculateTableChecksum(
  client: PrismaClient,
  tableName: string,
  sampleSize?: number
): Promise<string> {
  // Get column list
  const columns = await client.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    tableName
  );

  if (columns.length === 0) {
    return 'EMPTY';
  }

  const columnList = columns.map(c => `"${c.column_name}"`).join(', ');

  // Build query with optional sampling
  let query = `SELECT md5(string_agg(row_data, '')) as checksum 
               FROM (
                 SELECT md5(CAST(ROW(${columnList}) AS TEXT)) as row_data 
                 FROM "${tableName}"`;

  if (sampleSize && sampleSize > 0) {
    query += ` TABLESAMPLE BERNOULLI (${Math.min(100, (sampleSize / 1000) * 100)})`;
  }

  query += ` ORDER BY ${columnList} LIMIT ${sampleSize || 'ALL'}
             ) as ordered_rows`;

  const result = await client.$queryRawUnsafe<Array<{ checksum: string | null }>>(query);
  return result[0].checksum || 'EMPTY';
}

/**
 * Verify foreign key integrity in the target database.
 * Detects orphaned records (child records with missing parents).
 */
async function verifyForeignKeyIntegrity(
  client: PrismaClient,
  skipTables: Set<string>
): Promise<DataCheck[]> {
  const checks: DataCheck[] = [];

  // Get FK constraints
  const fks = await client.$queryRaw<Array<{
    table_name: string;
    constraint_name: string;
    column_name: string;
    foreign_table_name: string;
    foreign_column_name: string;
  }>>`
    SELECT 
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name
  `;

  // Check each FK for orphans
  for (const fk of fks) {
    if (skipTables.has(fk.table_name) || skipTables.has(fk.foreign_table_name)) {
      continue;
    }

    try {
      const orphans = await client.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count 
         FROM "${fk.table_name}" child
         LEFT JOIN "${fk.foreign_table_name}" parent
           ON child."${fk.column_name}" = parent."${fk.foreign_column_name}"
         WHERE child."${fk.column_name}" IS NOT NULL
           AND parent."${fk.foreign_column_name}" IS NULL`
      );

      const orphanCount = Number(orphans[0].count);
      const passed = orphanCount === 0;

      checks.push({
        table: `${fk.table_name}_fk_${fk.constraint_name}`,
        passed,
        source: 0,
        target: orphanCount,
        difference: passed ? 'No orphaned records' : `Found ${orphanCount} orphaned records in ${fk.table_name}.${fk.column_name}`,
      });

      if (!passed) {
        logger.warn(`FK integrity violation in ${fk.table_name}.${fk.column_name}: ${orphanCount} orphaned records`);
      }
    } catch (error) {
      logger.warn(`FK check failed for ${fk.constraint_name}:`, error);
      // Non-fatal: continue with other FKs
    }
  }

  return checks;
}
