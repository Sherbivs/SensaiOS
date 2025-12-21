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
  },
});

// ============================================================================
// Entry Point — CLI runs automatically via createCLI
// ============================================================================
