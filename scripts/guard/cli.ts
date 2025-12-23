#!/usr/bin/env npx tsx
/**
 * CI Guard Tools CLI
 * 
 * TypeScript implementations of CI guards for meta checks,
 * router validation, and code quality enforcement.
 * 
 * @usage npx tsx scripts/guard/cli.ts <command> [options]
 * @example
 *   npx tsx scripts/guard/cli.ts all
 *   npx tsx scripts/guard/cli.ts meta
 *   npx tsx scripts/guard/cli.ts routing
 *   npx tsx scripts/guard/cli.ts secrets
 * 
 * @module scripts/guard/cli
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
  readText,
  readJson,
  exists,
  listFiles,
  type CommandDef,
} from '../lib/index.js';
import * as path from 'path';
import { execSync } from 'child_process';
import { readdir } from 'fs/promises';

// ============================================================================
// Types
// ============================================================================

interface GuardResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string[];
}

// ============================================================================
// Guard Helpers
// ============================================================================

function printGuardResult(result: GuardResult): void {
  const icon = result.passed ? c.green('✓') : c.red('✗');
  console.log(`${icon} ${result.name}: ${result.message}`);
  
  if (result.details && result.details.length > 0) {
    for (const detail of result.details) {
      console.log(`    ${c.gray(detail)}`);
    }
  }
}

function summarizeGuards(results: GuardResult[]): boolean {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log();
  printKeyValue('Passed', c.green(passed.toString()));
  printKeyValue('Failed', failed > 0 ? c.red(failed.toString()) : '0');
  
  console.log();
  if (failed > 0) {
    printError(`${failed} guard(s) failed`);
    return false;
  } else {
    printSuccess('All guards passed');
    return true;
  }
}

// ============================================================================
// Individual Guards
// ============================================================================

/**
 * Check NEXT.yaml points to a READY task
 */
async function guardNextYaml(): Promise<GuardResult> {
  const nextPath = 'ops/NEXT.yaml';
  
  if (!await exists(nextPath)) {
    return {
      name: 'NEXT.yaml',
      passed: false,
      message: 'File not found',
    };
  }

  const content = await readText(nextPath);
  
  // Check for task pointer
  if (!content.includes('current_task:') && !content.includes('task:')) {
    return {
      name: 'NEXT.yaml',
      passed: false,
      message: 'No task pointer found',
    };
  }

  // Check for READY or valid status
  const hasStatus = content.includes('status:');
  
  return {
    name: 'NEXT.yaml',
    passed: hasStatus,
    message: hasStatus ? 'Task pointer configured' : 'Missing status field',
  };
}

/**
 * Check Prompt.md has valid timestamp
 */
async function guardPromptMd(): Promise<GuardResult> {
  const promptPath = 'Prompt.md';
  
  if (!await exists(promptPath)) {
    return {
      name: 'Prompt.md',
      passed: false,
      message: 'File not found',
    };
  }

  const content = await readText(promptPath);
  
  // Check for timestamp
  const hasTimestamp = content.includes('Last Updated') || 
                       content.includes('Timestamp') ||
                       /\d{4}-\d{2}-\d{2}/.test(content);

  return {
    name: 'Prompt.md',
    passed: hasTimestamp,
    message: hasTimestamp ? 'Contains timestamp' : 'Missing timestamp',
  };
}

/**
 * Check Patch.md exists and has Absolutes section
 */
async function guardPatchMd(): Promise<GuardResult> {
  const patchPath = 'Patch.md';
  
  if (!await exists(patchPath)) {
    return {
      name: 'Patch.md',
      passed: false,
      message: 'File not found',
    };
  }

  const content = await readText(patchPath);
  const hasAbsolutes = content.includes('Absolute') || content.includes('ABSOLUTE');

  return {
    name: 'Patch.md',
    passed: hasAbsolutes,
    message: hasAbsolutes ? 'Contains Absolutes section' : 'Missing Absolutes section',
  };
}

/**
 * Check Tasklist.md has valid structure
 */
async function guardTasklistMd(): Promise<GuardResult> {
  const tasklistPath = 'Tasklist.md';
  
  if (!await exists(tasklistPath)) {
    return {
      name: 'Tasklist.md',
      passed: false,
      message: 'File not found',
    };
  }

  const content = await readText(tasklistPath);
  
  // Check for task entries
  const hasTaskEntries = content.includes('## Task') || 
                         content.includes('### T') ||
                         content.includes('Status:');

  return {
    name: 'Tasklist.md',
    passed: hasTaskEntries,
    message: hasTaskEntries ? 'Contains task entries' : 'No task entries found',
  };
}

/**
 * Check all directories have ROUTER.md
 */
async function guardRouters(): Promise<GuardResult> {
  const requiredRouters = [
    'src/ROUTER.md',
    'scripts/ROUTER.md',
    'docs/ROUTER.md',
    'ops/ROUTER.md',
    'tests/ROUTER.md',
  ];

  const missing: string[] = [];
  
  for (const routerPath of requiredRouters) {
    if (!await exists(routerPath)) {
      missing.push(routerPath);
    }
  }

  return {
    name: 'ROUTER.md files',
    passed: missing.length === 0,
    message: missing.length === 0 ? 'All required routers present' : `${missing.length} missing`,
    details: missing.length > 0 ? missing : undefined,
  };
}

/**
 * Check package.json is valid
 */
async function guardPackageJson(): Promise<GuardResult> {
  try {
    const pkg = await readJson('package.json') as { name?: string; version?: string };
    
    if (!pkg.name || !pkg.version) {
      return {
        name: 'package.json',
        passed: false,
        message: 'Missing name or version',
      };
    }

    return {
      name: 'package.json',
      passed: true,
      message: `Valid (${pkg.name}@${pkg.version})`,
    };
  } catch {
    return {
      name: 'package.json',
      passed: false,
      message: 'Invalid JSON',
    };
  }
}

/**
 * Check Prisma schema exists and is valid
 */
async function guardPrismaSchema(): Promise<GuardResult> {
  const schemaPath = 'prisma/schema.prisma';
  
  if (!await exists(schemaPath)) {
    return {
      name: 'Prisma Schema',
      passed: false,
      message: 'schema.prisma not found',
    };
  }

  const content = await readText(schemaPath);
  
  // Basic validation
  const hasGenerator = content.includes('generator client');
  const hasDatasource = content.includes('datasource db');
  const hasModel = content.includes('model ');

  if (!hasGenerator || !hasDatasource) {
    return {
      name: 'Prisma Schema',
      passed: false,
      message: 'Missing generator or datasource',
    };
  }

  return {
    name: 'Prisma Schema',
    passed: hasModel,
    message: hasModel ? 'Valid schema with models' : 'No models defined',
  };
}

/**
 * Scan for potential secret leaks
 */
async function guardSecrets(): Promise<GuardResult> {
  const secretPatterns = [
    /api[_-]?key\s*[:=]\s*['"]\w{20,}/gi,
    /password\s*[:=]\s*['"]\w{8,}/gi,
    /secret\s*[:=]\s*['"]\w{16,}/gi,
    /token\s*[:=]\s*['"]\w{20,}/gi,
    /-----BEGIN (RSA |EC |)PRIVATE KEY-----/g,
    /ghp_[a-zA-Z0-9]{36}/g, // GitHub PAT
    /sk-[a-zA-Z0-9]{48}/g,  // OpenAI key
    /rnd_[a-zA-Z0-9]{24}/g, // Render key
  ];

  const excludeDirs = ['node_modules', '.git', 'dist', 'coverage', 'Store'];
  const violations: string[] = [];

  // Scan key directories
  const scanDirs = ['src', 'scripts', 'tests'];
  
  for (const dir of scanDirs) {
    if (!await exists(dir)) continue;
    
    try {
      const files = await listFiles(dir);
      
      for (const file of files) {
        if (excludeDirs.some(ex => file.includes(ex))) continue;
        if (!file.endsWith('.ts') && !file.endsWith('.js') && !file.endsWith('.mjs')) continue;
        
        try {
          const content = await readText(path.join(dir, file));
          
          for (const pattern of secretPatterns) {
            if (pattern.test(content)) {
              violations.push(`${dir}/${file}`);
              break;
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  return {
    name: 'Secret Scanning',
    passed: violations.length === 0,
    message: violations.length === 0 ? 'No secrets detected' : `${violations.length} potential leaks`,
    details: violations.length > 0 ? violations.slice(0, 5) : undefined,
  };
}

/**
 * Check for large files that shouldn't be committed
 */
async function guardLargeFiles(): Promise<GuardResult> {
  const maxSizeKB = 500;
  const excludeDirs = ['node_modules', '.git', 'dist', 'assets'];
  const largeFiles: string[] = [];

  const scanDirs = ['src', 'scripts', 'docs'];
  
  for (const dir of scanDirs) {
    if (!await exists(dir)) continue;
    
    try {
      const files = await listFiles(dir);
      const fs = await import('fs/promises');
      
      for (const file of files) {
        if (excludeDirs.some(ex => file.includes(ex))) continue;
        
        try {
          const filePath = path.join(dir, file);
          const stat = await fs.stat(filePath);
          const sizeKB = stat.size / 1024;
          
          if (sizeKB > maxSizeKB) {
            largeFiles.push(`${filePath} (${Math.round(sizeKB)}KB)`);
          }
        } catch {
          // Skip problematic files
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  return {
    name: 'Large Files',
    passed: largeFiles.length === 0,
    message: largeFiles.length === 0 ? `No files > ${maxSizeKB}KB` : `${largeFiles.length} large files`,
    details: largeFiles.length > 0 ? largeFiles.slice(0, 5) : undefined,
  };
}

// ============================================================================
// Ported Guards (from scripts/guards/)
// ============================================================================

/**
 * Guard: Auto-sync environment files exist and are non-empty
 * Ported from: scripts/guards/guard_auto_sync.sh
 */
async function guardAutoSync(): Promise<GuardResult> {
  const defaultDevEnv = 'C:/Users/sherb/OneDrive/Documents/Key/Dev/.env';
  const defaultProdEnv = 'C:/Users/sherb/OneDrive/Documents/Key/Prod/.env';
  const triggerPath = 'data/cache/dex-sync-trigger.json';

  const devEnvPath = process.env.IG_DEV_ENV_FILE || defaultDevEnv;
  const prodEnvPath = process.env.IG_PROD_ENV_FILE || defaultProdEnv;

  const issues: string[] = [];

  // Check dev env file
  if (!await exists(devEnvPath)) {
    issues.push(`Dev env file not found: ${devEnvPath}`);
  }

  // Check prod env file
  if (!await exists(prodEnvPath)) {
    issues.push(`Prod env file not found: ${prodEnvPath}`);
  }

  // Check trigger file
  if (!await exists(triggerPath)) {
    issues.push(`Trigger file not found: ${triggerPath}`);
  }

  return {
    name: 'Auto-Sync Files',
    passed: issues.length === 0,
    message: issues.length === 0 ? 'All required files present' : `${issues.length} missing files`,
    details: issues.length > 0 ? issues : undefined,
  };
}

/**
 * Guard: Dexpack artifacts are up-to-date
 * Ported from: scripts/guards/guard_dexpack.sh
 */
async function guardDexpack(): Promise<GuardResult> {
  const v1Script = 'scripts/build_dexpack.ts';
  const v2Script = 'scripts/build-dexpack.ts';

  // Check v1 artifacts
  try {
    execSync(`npx tsx ${v1Script} --check`, { 
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 60000,
    });
  } catch (error) {
    const err = error as { message?: string };
    return {
      name: 'Dexpack v1',
      passed: false,
      message: 'v1 artifacts out of date',
      details: [err.message || 'Check failed'],
    };
  }

  // Check v2 artifacts
  try {
    execSync(`npx tsx ${v2Script} --check`, { 
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 60000,
    });
  } catch (error) {
    const err = error as { message?: string };
    return {
      name: 'Dexpack v2',
      passed: false,
      message: 'v2 artifacts out of date',
      details: [err.message || 'Check failed'],
    };
  }

  return {
    name: 'Dexpack',
    passed: true,
    message: 'All dexpack artifacts up-to-date',
  };
}

/**
 * Guard: Prisma imports use the centralized prisma.ts module
 * 
 * This guard ensures that Prisma client usage goes through the centralized
 * src/shared/prisma.ts module rather than importing directly from generated
 * or @prisma/client. This ensures proper initialization and connection handling.
 * 
 * Originally ported from: scripts/guards/require-ensure-db-preload.mjs
 * Updated: 2025-12-23 to match actual codebase architecture
 */
async function guardDbPreload(): Promise<GuardResult> {
  const srcDir = 'src';
  
  // Check for direct @prisma/client imports (should use generated or shared)
  const directPrismaPattern = /from\s+["']@prisma\/client["']/;
  // Check for proper centralized prisma import
  const centralizedPrismaPattern = /from\s+["'][^"']*shared\/prisma(?:\.[jt]s)?["']/;
  
  const issues: string[] = [];

  async function collectTsFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        // Skip generated directory
        if (entry.name === 'generated') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...await collectTsFiles(fullPath));
        } else if (/\.(ts|tsx|js|jsx)$/i.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
    return files;
  }

  const files = await collectTsFiles(srcDir);
  
  for (const file of files) {
    try {
      const contents = await readText(file);
      const relPath = file.replace(/\\/g, '/');
      
      // Check for direct @prisma/client imports (excluding type imports)
      const lines = contents.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('import type')) continue;
        if (directPrismaPattern.test(line)) {
          issues.push(`${relPath}:${i + 1}: Direct @prisma/client import - use ../shared/prisma.js or ../generated/prisma/client.js`);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  // If no issues, the guard passes
  if (issues.length === 0) {
    return {
      name: 'Prisma Import Pattern',
      passed: true,
      message: 'All Prisma imports use centralized module',
    };
  }

  return {
    name: 'Prisma Import Pattern',
    passed: false,
    message: `${issues.length} direct @prisma/client imports found`,
    details: issues.slice(0, 10),
  };
}

// ============================================================================
// Commands
// ============================================================================

const allCommand: CommandDef = {
  description: 'Run all guards',
  flags: [
    { name: 'strict', short: 's', description: 'Exit on first failure', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    const strict = flags.strict as boolean;
    
    printSection('CI Guards');
    console.log();

    const guards = [
      { name: 'Meta', fn: async () => [
        await guardNextYaml(),
        await guardPromptMd(),
        await guardPatchMd(),
        await guardTasklistMd(),
      ]},
      { name: 'Routing', fn: async () => [await guardRouters()] },
      { name: 'Package', fn: async () => [await guardPackageJson()] },
      { name: 'Prisma', fn: async () => [await guardPrismaSchema()] },
      { name: 'Secrets', fn: async () => [await guardSecrets()] },
      { name: 'Large Files', fn: async () => [await guardLargeFiles()] },
      { name: 'Auto-Sync', fn: async () => [await guardAutoSync()] },
      { name: 'DB Preload', fn: async () => [await guardDbPreload()] },
      // Note: Dexpack guard is slow, run separately with: npx tsx scripts/guard/cli.ts dexpack
    ];

    const allResults: GuardResult[] = [];
    const progress = createProgressBar({ total: guards.length });
    
    for (const guard of guards) {
      progress.tick(guard.name);
      const results = await guard.fn();
      allResults.push(...results);
      
      if (strict && results.some(r => !r.passed)) {
        progress.complete();
        console.log();
        for (const result of results.filter(r => !r.passed)) {
          printGuardResult(result);
        }
        printError('Strict mode: stopping on first failure');
        process.exit(1);
      }
    }
    
    progress.complete();
    console.log();

    for (const result of allResults) {
      printGuardResult(result);
    }

    const allPassed = summarizeGuards(allResults);
    process.exit(allPassed ? 0 : 1);
  },
};

const metaCommand: CommandDef = {
  description: 'Check meta files (NEXT.yaml, Prompt.md, Patch.md, Tasklist.md)',
  run: async () => {
    printSection('Meta Guards');
    console.log();

    const results = [
      await guardNextYaml(),
      await guardPromptMd(),
      await guardPatchMd(),
      await guardTasklistMd(),
    ];

    for (const result of results) {
      printGuardResult(result);
    }

    const allPassed = summarizeGuards(results);
    process.exit(allPassed ? 0 : 1);
  },
};

const routingCommand: CommandDef = {
  description: 'Check ROUTER.md files',
  run: async () => {
    printSection('Routing Guards');
    console.log();

    const result = await guardRouters();
    printGuardResult(result);
    
    const allPassed = summarizeGuards([result]);
    process.exit(allPassed ? 0 : 1);
  },
};

const secretsCommand: CommandDef = {
  description: 'Scan for potential secret leaks',
  run: async () => {
    printSection('Secret Scanning');
    console.log();

    const spinner = createSpinner({ text: 'Scanning files...' });
    const result = await guardSecrets();
    spinner.stop();
    
    printGuardResult(result);
    
    const allPassed = summarizeGuards([result]);
    process.exit(allPassed ? 0 : 1);
  },
};

const schemaCommand: CommandDef = {
  description: 'Check Prisma schema validity',
  run: async () => {
    printSection('Schema Guards');
    console.log();

    const results = [
      await guardPrismaSchema(),
      await guardPackageJson(),
    ];

    for (const result of results) {
      printGuardResult(result);
    }

    const allPassed = summarizeGuards(results);
    process.exit(allPassed ? 0 : 1);
  },
};

const sizeCommand: CommandDef = {
  description: 'Check for large files',
  run: async () => {
    printSection('File Size Guards');
    console.log();

    const spinner = createSpinner({ text: 'Checking file sizes...' });
    const result = await guardLargeFiles();
    spinner.stop();
    
    printGuardResult(result);
    
    const allPassed = summarizeGuards([result]);
    process.exit(allPassed ? 0 : 1);
  },
};

const autoSyncCommand: CommandDef = {
  description: 'Check auto-sync environment files exist',
  run: async () => {
    printSection('Auto-Sync Guards');
    console.log();

    const result = await guardAutoSync();
    printGuardResult(result);
    
    const allPassed = summarizeGuards([result]);
    process.exit(allPassed ? 0 : 1);
  },
};

const dexpackCommand: CommandDef = {
  description: 'Check dexpack artifacts are up-to-date (slow)',
  run: async () => {
    printSection('Dexpack Guards');
    console.log();

    printInfo('Checking dexpack v1 artifacts...');
    const spinner = createSpinner({ text: 'Verifying dexpack...' });
    const result = await guardDexpack();
    spinner.stop();
    
    printGuardResult(result);
    
    const allPassed = summarizeGuards([result]);
    process.exit(allPassed ? 0 : 1);
  },
};

const dbPreloadCommand: CommandDef = {
  description: 'Check Prisma import order (ensure-db-url first)',
  run: async () => {
    printSection('DB Preload Guards');
    console.log();

    const spinner = createSpinner({ text: 'Scanning import order...' });
    const result = await guardDbPreload();
    spinner.stop();
    
    printGuardResult(result);
    
    const allPassed = summarizeGuards([result]);
    process.exit(allPassed ? 0 : 1);
  },
};

// ============================================================================
// CLI Setup
// ============================================================================

createCLI({
  name: 'guard',
  description: 'CI guard tools',
  version: '1.0.0',
  commands: {
    all: allCommand,
    meta: metaCommand,
    routing: routingCommand,
    secrets: secretsCommand,
    schema: schemaCommand,
    size: sizeCommand,
    'auto-sync': autoSyncCommand,
    dexpack: dexpackCommand,
    'db-preload': dbPreloadCommand,
  },
});

// ============================================================================
// Entry Point — CLI runs automatically via createCLI
// ============================================================================
