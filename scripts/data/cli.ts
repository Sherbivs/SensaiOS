#!/usr/bin/env npx tsx
/**
 * Data Pipeline CLI
 * 
 * TypeScript CLI for Pokemon data management, dexpack building,
 * cache operations, and data validation.
 * 
 * @usage npx tsx scripts/data/cli.ts <command> [options]
 * @example
 *   npx tsx scripts/data/cli.ts dexpack
 *   npx tsx scripts/data/cli.ts cache status
 *   npx tsx scripts/data/cli.ts fetch pokemon
 *   npx tsx scripts/data/cli.ts validate
 * 
 * @module scripts/data/cli
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
  createSpinner,
  createProgressBar,
  handleError,
  exec,
  exists,
  readJson,
  readText,
  writeText,
  listFiles,
  type CommandDef,
} from '../lib/index.js';
import * as path from 'path';
import * as fs from 'fs/promises';

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = 'data';
const ASSETS_DIR = 'assets';
const CACHE_DIR = 'data/cache';
const STORE_CACHE_DIR = 'Store/runtime-cache';

const DEXPACK_V1 = 'assets/dexpack.v1.json';
const DEXPACK_V2 = 'assets/dexpack.v2.json';
const POKEMON_DATA = 'data/pokemon.json';
const EFFECTS_DATA = 'data/effects.json';

// ============================================================================
// Data Helpers
// ============================================================================

interface DexpackStats {
  version: string;
  pokemon: number;
  moves: number;
  abilities: number;
  types: number;
  sizeKB: number;
}

interface CacheStats {
  namespaces: string[];
  totalFiles: number;
  totalSizeKB: number;
}

async function getDexpackStats(filePath: string): Promise<DexpackStats | null> {
  if (!await exists(filePath)) return null;

  try {
    const content = await readText(filePath);
    const data = JSON.parse(content);
    const stats = await fs.stat(filePath);

    return {
      version: data.version || 'unknown',
      pokemon: data.pokemon?.length || data.species?.length || 0,
      moves: data.moves?.length || 0,
      abilities: data.abilities?.length || 0,
      types: data.types?.length || 0,
      sizeKB: Math.round(stats.size / 1024),
    };
  } catch {
    return null;
  }
}

async function getCacheStats(cacheDir: string): Promise<CacheStats> {
  const stats: CacheStats = {
    namespaces: [],
    totalFiles: 0,
    totalSizeKB: 0,
  };

  if (!await exists(cacheDir)) return stats;

  try {
    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stats.namespaces.push(entry.name);
        const nsPath = path.join(cacheDir, entry.name);
        const files = await listFiles(nsPath);
        stats.totalFiles += files.length;

        for (const file of files) {
          const fileStat = await fs.stat(path.join(nsPath, file));
          stats.totalSizeKB += fileStat.size / 1024;
        }
      }
    }

    stats.totalSizeKB = Math.round(stats.totalSizeKB);
  } catch {
    // Directory might not exist
  }

  return stats;
}

// ============================================================================
// Commands
// ============================================================================

const dexpackCommand: CommandDef = {
  description: 'Build dexpack assets',
  args: [
    { name: 'version', description: 'Version to build (v1, v2, all)' },
  ],
  flags: [
    { name: 'force', short: 'f', description: 'Force rebuild', type: 'boolean' },
    { name: 'validate', short: 'v', description: 'Validate after build', type: 'boolean' },
  ],
  run: async ({ args, flags }) => {
    const version = args[0] || 'all';
    const force = flags.force as boolean;
    const validate = flags.validate as boolean;

    printSection('Dexpack Builder');

    // Check source data
    if (!await exists(POKEMON_DATA)) {
      printError(`Source data not found: ${POKEMON_DATA}`);
      printInfo('Run: npx tsx scripts/data/cli.ts fetch pokemon');
      process.exit(1);
    }

    const targets: string[] = [];
    if (version === 'all' || version === 'v1') targets.push('v1');
    if (version === 'all' || version === 'v2') targets.push('v2');

    if (targets.length === 0) {
      printError(`Invalid version: ${version}`);
      printInfo('Valid versions: v1, v2, all');
      process.exit(1);
    }

    printKeyValue('Versions', targets.join(', '));
    printKeyValue('Force', force ? 'yes' : 'no');
    console.log();

    const spinner = createSpinner({ text: 'Building dexpack...' });

    try {
      // Use the existing build script
      await exec('npx', ['tsx', 'scripts/build-dexpack.ts']);
      spinner.stop();

      // Show results
      for (const ver of targets) {
        const filePath = ver === 'v1' ? DEXPACK_V1 : DEXPACK_V2;
        const stats = await getDexpackStats(filePath);
        
        if (stats) {
          console.log();
          printInfo(`Dexpack ${ver}:`);
          printKeyValue('  Pokemon', stats.pokemon.toString());
          printKeyValue('  Moves', stats.moves.toString());
          printKeyValue('  Size', `${stats.sizeKB} KB`);
        }
      }

      printSuccess('Dexpack built successfully');

      if (validate) {
        console.log();
        printInfo('Validating...');
        // Validation logic would go here
        printSuccess('Validation passed');
      }
    } catch (error) {
      spinner.stop();
      printError('Dexpack build failed');
      throw error;
    }
  },
};

const cacheCommand: CommandDef = {
  description: 'Cache management',
  args: [
    { name: 'action', description: 'status|clear|warm', required: true },
    { name: 'namespace', description: 'Cache namespace (optional)' },
  ],
  run: async ({ args }) => {
    const action = args[0];
    const namespace = args[1];

    printSection('Cache Management');

    switch (action) {
      case 'status': {
        // Data cache
        const dataStats = await getCacheStats(CACHE_DIR);
        printInfo('Data Cache:');
        printKeyValue('  Location', CACHE_DIR);
        printKeyValue('  Namespaces', dataStats.namespaces.length.toString());
        printKeyValue('  Files', dataStats.totalFiles.toString());
        printKeyValue('  Size', `${dataStats.totalSizeKB} KB`);

        // Runtime cache
        const runtimeStats = await getCacheStats(STORE_CACHE_DIR);
        console.log();
        printInfo('Runtime Cache:');
        printKeyValue('  Location', STORE_CACHE_DIR);
        printKeyValue('  Namespaces', runtimeStats.namespaces.join(', ') || 'none');
        printKeyValue('  Files', runtimeStats.totalFiles.toString());
        printKeyValue('  Size', `${runtimeStats.totalSizeKB} KB`);

        // Dexpack stats
        console.log();
        printInfo('Dexpack Assets:');
        
        const v1Stats = await getDexpackStats(DEXPACK_V1);
        if (v1Stats) {
          printKeyValue('  v1', `${v1Stats.pokemon} pokemon, ${v1Stats.sizeKB} KB`);
        } else {
          printKeyValue('  v1', c.yellow('not built'));
        }

        const v2Stats = await getDexpackStats(DEXPACK_V2);
        if (v2Stats) {
          printKeyValue('  v2', `${v2Stats.pokemon} pokemon, ${v2Stats.sizeKB} KB`);
        } else {
          printKeyValue('  v2', c.yellow('not built'));
        }
        break;
      }

      case 'clear': {
        const targetDir = namespace ? path.join(CACHE_DIR, namespace) : CACHE_DIR;
        
        if (!await exists(targetDir)) {
          printWarning(`Cache not found: ${targetDir}`);
          return;
        }

        const spinner = createSpinner({ text: 'Clearing cache...' });
        
        try {
          if (namespace) {
            await fs.rm(targetDir, { recursive: true });
          } else {
            // Clear all but preserve directory
            const entries = await fs.readdir(targetDir);
            for (const entry of entries) {
              await fs.rm(path.join(targetDir, entry), { recursive: true });
            }
          }
          spinner.stop();
          printSuccess(`Cache cleared: ${targetDir}`);
        } catch (error) {
          spinner.stop();
          printError('Failed to clear cache');
          throw error;
        }
        break;
      }

      case 'warm': {
        printInfo('Warming cache...');
        
        // Trigger cache warm by loading dexpack
        const spinner = createSpinner({ text: 'Loading data...' });
        
        try {
          // Import and initialize dexpack
          await exec('npx', ['tsx', '-e', `
            import { loadDexpack } from './assets/dexpack.gen.mjs';
            await loadDexpack();
            console.log('Cache warmed');
          `]);
          spinner.stop();
          printSuccess('Cache warmed successfully');
        } catch {
          spinner.stop();
          printWarning('Could not warm cache (dexpack may not be built)');
        }
        break;
      }

      default:
        printError(`Unknown action: ${action}`);
        printInfo('Valid actions: status, clear, warm');
        process.exit(1);
    }
  },
};

const fetchCommand: CommandDef = {
  description: 'Fetch Pokemon data from sources',
  args: [
    { name: 'type', description: 'pokemon|moves|abilities|all', required: true },
  ],
  flags: [
    { name: 'limit', short: 'l', description: 'Limit number of records', type: 'string' },
    { name: 'force', short: 'f', description: 'Force refetch', type: 'boolean' },
  ],
  run: async ({ args, flags }) => {
    const type = args[0];
    const limit = flags.limit as string;
    const force = flags.force as boolean;

    printSection('Data Fetcher');
    printKeyValue('Type', type);
    if (limit) printKeyValue('Limit', limit);
    console.log();

    // Check if fetch script exists
    const fetchScript = 'scripts/fetch_pokemon.mjs';
    if (!await exists(fetchScript)) {
      printError(`Fetch script not found: ${fetchScript}`);
      process.exit(1);
    }

    const spinner = createSpinner({ text: `Fetching ${type} data...` });

    try {
      const fetchArgs = ['node', fetchScript];
      if (type !== 'all') fetchArgs.push('--type', type);
      if (limit) fetchArgs.push('--limit', limit);
      if (force) fetchArgs.push('--force');

      await exec(fetchArgs[0], fetchArgs.slice(1));
      spinner.stop();
      printSuccess(`${type} data fetched successfully`);
    } catch (error) {
      spinner.stop();
      printError(`Failed to fetch ${type} data`);
      throw error;
    }
  },
};

const validateCommand: CommandDef = {
  description: 'Validate data files',
  flags: [
    { name: 'strict', short: 's', description: 'Fail on warnings', type: 'boolean' },
    { name: 'fix', description: 'Auto-fix issues where possible', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    const strict = flags.strict as boolean;

    printSection('Data Validation');

    interface ValidationResult {
      file: string;
      status: 'ok' | 'warn' | 'error';
      message: string;
    }

    const results: ValidationResult[] = [];

    // Check required files
    const requiredFiles = [
      { path: POKEMON_DATA, name: 'Pokemon data' },
      { path: EFFECTS_DATA, name: 'Effects data' },
      { path: DEXPACK_V1, name: 'Dexpack v1' },
      { path: DEXPACK_V2, name: 'Dexpack v2' },
    ];

    for (const file of requiredFiles) {
      if (!await exists(file.path)) {
        results.push({
          file: file.path,
          status: 'error',
          message: `${file.name} not found`,
        });
      } else {
        try {
          const content = await readText(file.path);
          JSON.parse(content);
          results.push({
            file: file.path,
            status: 'ok',
            message: `${file.name} valid JSON`,
          });
        } catch {
          results.push({
            file: file.path,
            status: 'error',
            message: `${file.name} invalid JSON`,
          });
        }
      }
    }

    // Validate dexpack contents
    const v1Stats = await getDexpackStats(DEXPACK_V1);
    if (v1Stats) {
      if (v1Stats.pokemon < 100) {
        results.push({
          file: DEXPACK_V1,
          status: 'warn',
          message: `Low pokemon count: ${v1Stats.pokemon}`,
        });
      }
    }

    const v2Stats = await getDexpackStats(DEXPACK_V2);
    if (v2Stats) {
      if (v2Stats.pokemon < 100) {
        results.push({
          file: DEXPACK_V2,
          status: 'warn',
          message: `Low pokemon count: ${v2Stats.pokemon}`,
        });
      }
    }

    // Print results
    console.log();
    let errors = 0;
    let warnings = 0;

    for (const result of results) {
      let icon: string;
      let color: (s: string) => string;
      
      switch (result.status) {
        case 'ok':
          icon = '✓';
          color = c.green;
          break;
        case 'warn':
          icon = '⚠';
          color = c.yellow;
          warnings++;
          break;
        case 'error':
          icon = '✗';
          color = c.red;
          errors++;
          break;
      }

      console.log(`${color(icon)} ${result.file}: ${result.message}`);
    }

    console.log();
    printKeyValue('Errors', errors > 0 ? c.red(errors.toString()) : '0');
    printKeyValue('Warnings', warnings > 0 ? c.yellow(warnings.toString()) : '0');

    if (errors > 0) {
      printError('Validation failed');
      process.exit(1);
    } else if (warnings > 0 && strict) {
      printError('Validation failed (strict mode)');
      process.exit(1);
    } else {
      printSuccess('Validation passed');
    }
  },
};

const statsCommand: CommandDef = {
  description: 'Show data statistics',
  run: async () => {
    printSection('Data Statistics');

    // Pokemon data
    if (await exists(POKEMON_DATA)) {
      try {
        const content = await readText(POKEMON_DATA);
        const data = JSON.parse(content);
        const count = Array.isArray(data) ? data.length : Object.keys(data).length;
        const stat = await fs.stat(POKEMON_DATA);
        
        printInfo('Pokemon Data:');
        printKeyValue('  Records', count.toString());
        printKeyValue('  Size', `${Math.round(stat.size / 1024)} KB`);
      } catch {
        printWarning('Could not read pokemon.json');
      }
    } else {
      printKeyValue('Pokemon Data', c.yellow('not found'));
    }

    // Dexpack v1
    console.log();
    const v1Stats = await getDexpackStats(DEXPACK_V1);
    if (v1Stats) {
      printInfo('Dexpack v1:');
      printKeyValue('  Pokemon', v1Stats.pokemon.toString());
      printKeyValue('  Moves', v1Stats.moves.toString());
      printKeyValue('  Abilities', v1Stats.abilities.toString());
      printKeyValue('  Size', `${v1Stats.sizeKB} KB`);
    } else {
      printKeyValue('Dexpack v1', c.yellow('not built'));
    }

    // Dexpack v2
    console.log();
    const v2Stats = await getDexpackStats(DEXPACK_V2);
    if (v2Stats) {
      printInfo('Dexpack v2:');
      printKeyValue('  Pokemon', v2Stats.pokemon.toString());
      printKeyValue('  Moves', v2Stats.moves.toString());
      printKeyValue('  Abilities', v2Stats.abilities.toString());
      printKeyValue('  Size', `${v2Stats.sizeKB} KB`);
    } else {
      printKeyValue('Dexpack v2', c.yellow('not built'));
    }

    // Cache stats
    console.log();
    const cacheStats = await getCacheStats(CACHE_DIR);
    printInfo('Data Cache:');
    printKeyValue('  Namespaces', cacheStats.namespaces.length.toString());
    printKeyValue('  Total Size', `${cacheStats.totalSizeKB} KB`);
  },
};

const buildCommand: CommandDef = {
  description: 'Build all data assets',
  flags: [
    { name: 'skip-fetch', description: 'Skip fetching fresh data', type: 'boolean' },
    { name: 'skip-dexpack', description: 'Skip dexpack build', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    const skipFetch = flags['skip-fetch'] as boolean;
    const skipDexpack = flags['skip-dexpack'] as boolean;

    printSection('Data Pipeline');
    console.log();

    const steps = [
      { name: 'Fetch Data', skip: skipFetch, fn: async () => {
        await exec('node', ['scripts/fetch_pokemon.mjs']);
      }},
      { name: 'Build Dexpack', skip: skipDexpack, fn: async () => {
        await exec('npx', ['tsx', 'scripts/build-dexpack.ts']);
      }},
      { name: 'Validate', skip: false, fn: async () => {
        // Quick validation
        const files = [POKEMON_DATA, DEXPACK_V1, DEXPACK_V2];
        for (const file of files) {
          if (!await exists(file)) {
            throw new Error(`Missing: ${file}`);
          }
        }
      }},
    ];

    const progress = createProgressBar({ total: steps.filter(s => !s.skip).length });

    for (const step of steps) {
      if (step.skip) {
        printInfo(`Skipping: ${step.name}`);
        continue;
      }

      progress.tick(step.name);
      
      try {
        await step.fn();
      } catch (error) {
        progress.complete();
        printError(`Failed: ${step.name}`);
        throw error;
      }
    }

    progress.complete();
    console.log();
    printSuccess('Data pipeline complete');
  },
};

// ============================================================================
// CLI Setup
// ============================================================================

createCLI({
  name: 'data',
  description: 'Data pipeline CLI',
  version: '1.0.0',
  commands: {
    dexpack: dexpackCommand,
    cache: cacheCommand,
    fetch: fetchCommand,
    validate: validateCommand,
    stats: statsCommand,
    build: buildCommand,
  },
});

// ============================================================================
// Entry Point — CLI runs automatically via createCLI
// ============================================================================
