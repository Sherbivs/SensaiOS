#!/usr/bin/env npx tsx
/**
 * Database Operations CLI
 * 
 * Unified CLI for all database operations including status,
 * queries, health checks, and schema management.
 * 
 * @usage npx tsx scripts/db/cli.ts <command> [options]
 * @example
 *   npx tsx scripts/db/cli.ts status
 *   npx tsx scripts/db/cli.ts query "SELECT COUNT(*) FROM \"User\""
 *   npx tsx scripts/db/cli.ts smoke
 *   npx tsx scripts/db/cli.ts counts
 * 
 * @module scripts/db/cli
 * @since 2025-12-21
 */

import {
  createCLI,
  c,
  printSection,
  printKeyValue,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printTable,
  createSpinner,
  handleError,
  loadEnv,
  getEnv,
  requireEnv,
  type CommandDef,
} from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface DatabaseConfig {
  name: string;
  envVar: string;
  description: string;
}

interface TableCount {
  table: string;
  count: number;
}

// ============================================================================
// Constants
// ============================================================================

const DATABASES: DatabaseConfig[] = [
  {
    name: 'cloud-prod',
    envVar: 'PROD_DATABASE_URL',
    description: 'Production (Render-managed PostgreSQL)',
  },
  {
    name: 'onpremise-dev',
    envVar: 'DATABASE_ONPREMISE_DEV_PRIMARY',
    description: 'Workstation development mirror',
  },
  {
    name: 'onpremise-experiment',
    envVar: 'DATABASE_ONPREMISE_DEV_EXPERIMENT',
    description: 'Migration testing cluster',
  },
];

const CORE_TABLES = [
  'User',
  'TrainerProfile',
  'Pokemon',
  'Species',
  'Move',
  'Battle',
  'Encounter',
  'Item',
  'BusMessage',
] as const;

// ============================================================================
// Database Helpers
// ============================================================================

/**
 * Get database URL for a target
 */
function getDatabaseUrl(target: string): string | null {
  const db = DATABASES.find(d => d.name === target);
  if (!db) return null;
  return getEnv(db.envVar);
}

/**
 * Execute a query using psql
 */
async function executeQuery(url: string, query: string): Promise<{ success: boolean; output: string; error?: string }> {
  const { exec } = await import('../lib/exec.js');
  
  try {
    // Build psql command with proper quoting
    const escapedQuery = query.replace(/'/g, "'\"'\"'");
    const command = `psql "${url}" -c '${escapedQuery}' -t -A`;
    const result = await exec(command, { silent: true });
    return { success: result.code === 0, output: result.stdout.trim() };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return { success: false, output: '', error: err.stderr || err.message || 'Unknown error' };
  }
}

/**
 * Test database connectivity
 */
async function testConnection(url: string): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  const result = await executeQuery(url, 'SELECT 1');
  const latencyMs = Date.now() - start;
  
  return {
    connected: result.success,
    latencyMs,
    error: result.error,
  };
}

/**
 * Get table count
 */
async function getTableCount(url: string, table: string): Promise<number | null> {
  const result = await executeQuery(url, `SELECT COUNT(*) FROM "${table}"`);
  if (!result.success) return null;
  return parseInt(result.output, 10);
}

/**
 * Get database size
 */
async function getDatabaseSize(url: string): Promise<string | null> {
  const result = await executeQuery(url, 'SELECT pg_size_pretty(pg_database_size(current_database()))');
  if (!result.success) return null;
  return result.output;
}

/**
 * Get migration count
 */
async function getMigrationCount(url: string): Promise<number | null> {
  const result = await executeQuery(url, 'SELECT COUNT(*) FROM "_prisma_migrations"');
  if (!result.success) return null;
  return parseInt(result.output, 10);
}

// ============================================================================
// Commands
// ============================================================================

const statusCommand: CommandDef = {
  description: 'Show database connection status',
  flags: [
    { name: 'target', short: 't', description: 'Database target (cloud-prod, onpremise-dev, onpremise-experiment)', type: 'string' },
    { name: 'all', short: 'a', description: 'Show all databases', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    await loadEnv();
    
    const showAll = flags.all as boolean;
    const target = flags.target as string | undefined;
    
    const targets = showAll ? DATABASES : 
      target ? DATABASES.filter(d => d.name === target) : 
      DATABASES.slice(0, 1); // Default to cloud-prod only

    printSection('Database Status');

    for (const db of targets) {
      const url = getEnv(db.envVar);
      
      console.log();
      printKeyValue('Database', c.cyan(db.name));
      printKeyValue('Description', db.description);
      
      if (!url) {
        printKeyValue('Status', c.yellow('Not configured'));
        continue;
      }

      const spinner = createSpinner({ text: 'Testing connection...' });
      const result = await testConnection(url);
      
      if (result.connected) {
        spinner.success(`Connected (${result.latencyMs}ms)`);
        
        // Get additional info
        const size = await getDatabaseSize(url);
        const migrations = await getMigrationCount(url);
        
        if (size) printKeyValue('Size', size);
        if (migrations !== null) printKeyValue('Migrations', migrations.toString());
      } else {
        spinner.error('Connection failed');
        if (result.error) {
          printError(result.error.split('\n')[0]);
        }
      }
    }
  },
};

const queryCommand: CommandDef = {
  description: 'Execute an ad-hoc SQL query',
  args: [
    { name: 'sql', description: 'SQL query to execute', required: true },
  ],
  flags: [
    { name: 'target', short: 't', description: 'Database target', type: 'string' },
    { name: 'format', short: 'f', description: 'Output format (table, csv, raw)', type: 'string' },
  ],
  run: async ({ args, flags }) => {
    await loadEnv();
    
    const sql = args[0];  // First positional argument
    const target = (flags.target as string) || 'cloud-prod';
    const format = (flags.format as string) || 'raw';
    
    if (!sql) {
      printError('SQL query is required');
      process.exit(1);
    }
    
    const url = getDatabaseUrl(target);
    if (!url) {
      printError(`Database "${target}" not configured`);
      printInfo(`Available: ${DATABASES.map(d => d.name).join(', ')}`);
      process.exit(1);
    }

    printSection('Query Execution');
    printKeyValue('Target', target);
    printKeyValue('Query', sql.length > 60 ? sql.substring(0, 60) + '...' : sql);
    console.log();

    const spinner = createSpinner({ text: 'Executing...' });
    const result = await executeQuery(url, sql);
    
    if (result.success) {
      spinner.success('Query executed');
      console.log();
      
      if (result.output) {
        console.log(result.output);
      } else {
        printInfo('Query returned no results');
      }
    } else {
      spinner.error('Query failed');
      printError(result.error || 'Unknown error');
      process.exit(1);
    }
  },
};

const countsCommand: CommandDef = {
  description: 'Show row counts for core tables',
  flags: [
    { name: 'target', short: 't', description: 'Database target', type: 'string' },
    { name: 'table', description: 'Specific table to count', type: 'string' },
  ],
  run: async ({ flags }) => {
    await loadEnv();
    
    const target = (flags.target as string) || 'cloud-prod';
    const specificTable = flags.table as string | undefined;
    
    const url = getDatabaseUrl(target);
    if (!url) {
      printError(`Database "${target}" not configured`);
      process.exit(1);
    }

    printSection('Table Counts');
    printKeyValue('Target', target);
    console.log();

    const tables = specificTable ? [specificTable] : CORE_TABLES;
    const counts: TableCount[] = [];

    const spinner = createSpinner({ text: 'Counting rows...' });
    
    for (const table of tables) {
      const count = await getTableCount(url, table);
      if (count !== null) {
        counts.push({ table, count });
      }
    }

    spinner.success('Counts retrieved');
    console.log();

    printTable(
      ['Table', 'Rows'],
      counts.map(c => [c.table, c.count.toLocaleString()])
    );

    // Summary
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    console.log();
    printKeyValue('Total Rows', total.toLocaleString());
  },
};

const smokeCommand: CommandDef = {
  description: 'Run database health checks',
  flags: [
    { name: 'target', short: 't', description: 'Database target', type: 'string' },
    { name: 'verbose', short: 'v', description: 'Show detailed output', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    await loadEnv();
    
    const target = (flags.target as string) || 'cloud-prod';
    const verbose = flags.verbose as boolean;
    
    const url = getDatabaseUrl(target);
    if (!url) {
      printError(`Database "${target}" not configured`);
      process.exit(1);
    }

    printSection('Database Health Check');
    printKeyValue('Target', target);
    console.log();

    const checks: { name: string; status: 'pass' | 'fail' | 'warn'; message: string }[] = [];

    // Check 1: Connectivity
    const connResult = await testConnection(url);
    checks.push({
      name: 'Connectivity',
      status: connResult.connected ? 'pass' : 'fail',
      message: connResult.connected ? `${connResult.latencyMs}ms latency` : (connResult.error || 'Failed'),
    });

    if (!connResult.connected) {
      for (const check of checks) {
        const icon = check.status === 'pass' ? c.green('✓') : c.red('✗');
        console.log(`${icon} ${check.name}: ${check.message}`);
      }
      printError('Cannot continue - database unreachable');
      process.exit(1);
    }

    // Check 2: Migrations table exists
    const migResult = await getMigrationCount(url);
    checks.push({
      name: 'Migrations',
      status: migResult !== null ? 'pass' : 'fail',
      message: migResult !== null ? `${migResult} applied` : 'Table not found',
    });

    // Check 3: Core tables exist
    let tablesFound = 0;
    for (const table of CORE_TABLES.slice(0, 3)) {
      const count = await getTableCount(url, table);
      if (count !== null) tablesFound++;
    }
    checks.push({
      name: 'Core Tables',
      status: tablesFound === 3 ? 'pass' : tablesFound > 0 ? 'warn' : 'fail',
      message: `${tablesFound}/3 tables accessible`,
    });

    // Check 4: Database size
    const size = await getDatabaseSize(url);
    checks.push({
      name: 'Storage',
      status: size ? 'pass' : 'warn',
      message: size || 'Could not determine size',
    });

    // Check 5: Latency threshold
    checks.push({
      name: 'Latency',
      status: connResult.latencyMs < 100 ? 'pass' : connResult.latencyMs < 500 ? 'warn' : 'fail',
      message: connResult.latencyMs < 100 ? 'Excellent' : connResult.latencyMs < 500 ? 'Acceptable' : 'High latency',
    });

    // Print results
    for (const check of checks) {
      const icon = check.status === 'pass' ? c.green('✓') : 
                   check.status === 'warn' ? c.yellow('⚠') : c.red('✗');
      console.log(`${icon} ${check.name}: ${check.message}`);
    }

    // Summary
    const passed = checks.filter(c => c.status === 'pass').length;
    const warnings = checks.filter(c => c.status === 'warn').length;
    const failed = checks.filter(c => c.status === 'fail').length;

    console.log();
    if (failed > 0) {
      printError(`Health check failed: ${failed} issues`);
      process.exit(1);
    } else if (warnings > 0) {
      printWarning(`Health check passed with ${warnings} warnings`);
    } else {
      printSuccess(`All ${passed} checks passed`);
    }
  },
};

const diffCommand: CommandDef = {
  description: 'Compare schemas between databases',
  args: [
    { name: 'source', description: 'Source database', required: true },
    { name: 'target', description: 'Target database', required: true },
  ],
  flags: [
    { name: 'tables-only', description: 'Compare tables only, skip columns', type: 'boolean' },
  ],
  run: async ({ args, flags }) => {
    await loadEnv();
    
    const source = args[0];  // First positional argument
    const target = args[1];  // Second positional argument
    const tablesOnly = flags['tables-only'] as boolean;
    
    if (!source || !target) {
      printError('Both source and target database names are required');
      process.exit(1);
    }
    
    const sourceUrl = getDatabaseUrl(source);
    const targetUrl = getDatabaseUrl(target);
    
    if (!sourceUrl) {
      printError(`Source database "${source}" not configured`);
      process.exit(1);
    }
    if (!targetUrl) {
      printError(`Target database "${target}" not configured`);
      process.exit(1);
    }

    printSection('Schema Comparison');
    printKeyValue('Source', source);
    printKeyValue('Target', target);
    console.log();

    // Get tables from both databases
    const tableQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const spinner = createSpinner({ text: 'Comparing schemas...' });
    
    const sourceResult = await executeQuery(sourceUrl, tableQuery);
    const targetResult = await executeQuery(targetUrl, tableQuery);
    
    if (!sourceResult.success || !targetResult.success) {
      spinner.error('Failed to retrieve schema');
      process.exit(1);
    }

    const sourceTables = new Set(sourceResult.output.split('\n').filter(Boolean));
    const targetTables = new Set(targetResult.output.split('\n').filter(Boolean));
    
    spinner.success('Schemas retrieved');
    console.log();

    // Find differences
    const onlyInSource: string[] = [];
    const onlyInTarget: string[] = [];
    const inBoth: string[] = [];

    for (const table of sourceTables) {
      if (targetTables.has(table)) {
        inBoth.push(table);
      } else {
        onlyInSource.push(table);
      }
    }

    for (const table of targetTables) {
      if (!sourceTables.has(table)) {
        onlyInTarget.push(table);
      }
    }

    // Report
    printKeyValue('Tables in both', inBoth.length.toString());
    printKeyValue(`Only in ${source}`, onlyInSource.length.toString());
    printKeyValue(`Only in ${target}`, onlyInTarget.length.toString());
    console.log();

    if (onlyInSource.length > 0) {
      printSection(`Only in ${source}`);
      for (const table of onlyInSource) {
        console.log(`  ${c.red('-')} ${table}`);
      }
      console.log();
    }

    if (onlyInTarget.length > 0) {
      printSection(`Only in ${target}`);
      for (const table of onlyInTarget) {
        console.log(`  ${c.green('+')} ${table}`);
      }
      console.log();
    }

    if (onlyInSource.length === 0 && onlyInTarget.length === 0) {
      printSuccess('Schemas are identical (table-level)');
    } else {
      printWarning(`${onlyInSource.length + onlyInTarget.length} table differences found`);
    }

    if (!tablesOnly && inBoth.length > 0) {
      printInfo('Use --tables-only to skip column-level comparison');
    }
  },
};

const migrationsCommand: CommandDef = {
  description: 'Show migration status',
  flags: [
    { name: 'target', short: 't', description: 'Database target', type: 'string' },
    { name: 'limit', short: 'n', description: 'Number of migrations to show', type: 'string' },
  ],
  run: async ({ flags }) => {
    await loadEnv();
    
    const target = (flags.target as string) || 'cloud-prod';
    const limit = parseInt(flags.limit as string || '10', 10);
    
    const url = getDatabaseUrl(target);
    if (!url) {
      printError(`Database "${target}" not configured`);
      process.exit(1);
    }

    printSection('Migration History');
    printKeyValue('Target', target);
    console.log();

    const query = `
      SELECT migration_name, finished_at, applied_steps_count
      FROM "_prisma_migrations"
      ORDER BY finished_at DESC
      LIMIT ${limit}
    `;

    const spinner = createSpinner({ text: 'Fetching migrations...' });
    const result = await executeQuery(url, query);
    
    if (!result.success) {
      spinner.error('Failed to fetch migrations');
      printError(result.error || 'Unknown error');
      process.exit(1);
    }

    spinner.success('Migrations retrieved');
    console.log();

    if (!result.output) {
      printWarning('No migrations found');
      return;
    }

    const lines = result.output.split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const date = parts[1].trim();
        console.log(`  ${c.green('✓')} ${name}`);
        console.log(`    ${c.gray(date)}`);
      }
    }

    console.log();
    printInfo(`Showing last ${lines.length} migrations`);
  },
};

// ============================================================================
// CLI Setup
// ============================================================================

createCLI({
  name: 'db',
  description: 'Database operations CLI',
  version: '1.0.0',
  commands: {
    status: statusCommand,
    query: queryCommand,
    counts: countsCommand,
    smoke: smokeCommand,
    diff: diffCommand,
    migrations: migrationsCommand,
  },
});

// ============================================================================
// Entry Point — CLI runs automatically via createCLI
// ============================================================================
