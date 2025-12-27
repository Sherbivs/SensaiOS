#!/usr/bin/env npx tsx
/**
 * Diagnostic Tools CLI
 * 
 * Emergency debugging tools for production issues.
 * Consolidates all check-* and diagnose-* scripts.
 * 
 * @usage npx tsx scripts/diagnose/cli.ts <command> [options]
 * @example
 *   npx tsx scripts/diagnose/cli.ts all
 *   npx tsx scripts/diagnose/cli.ts homestead
 *   npx tsx scripts/diagnose/cli.ts permissions
 *   npx tsx scripts/diagnose/cli.ts memory
 * 
 * @module scripts/diagnose/cli
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
  createProgressBar,
  handleError,
  loadEnv,
  getEnv,
  readJson,
  exists,
  type CommandDef,
} from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface DiagnosticResult {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'skip';
  message: string;
  details?: string[];
}

// ============================================================================
// Diagnostic Helpers
// ============================================================================

function printDiagnosticResult(result: DiagnosticResult): void {
  const icons = {
    pass: c.green('✓'),
    warn: c.yellow('⚠'),
    fail: c.red('✗'),
    skip: c.gray('○'),
  };
  
  console.log(`${icons[result.status]} ${result.name}: ${result.message}`);
  
  if (result.details && result.details.length > 0) {
    for (const detail of result.details) {
      console.log(`    ${c.gray(detail)}`);
    }
  }
}

function summarizeDiagnostics(results: DiagnosticResult[]): void {
  const passed = results.filter(r => r.status === 'pass').length;
  const warnings = results.filter(r => r.status === 'warn').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;

  console.log();
  printKeyValue('Passed', c.green(passed.toString()));
  printKeyValue('Warnings', warnings > 0 ? c.yellow(warnings.toString()) : warnings.toString());
  printKeyValue('Failed', failed > 0 ? c.red(failed.toString()) : failed.toString());
  if (skipped > 0) printKeyValue('Skipped', c.gray(skipped.toString()));
  
  console.log();
  if (failed > 0) {
    printError(`${failed} diagnostic(s) failed`);
  } else if (warnings > 0) {
    printWarning(`All checks passed with ${warnings} warning(s)`);
  } else {
    printSuccess('All diagnostics passed');
  }
}

// ============================================================================
// Individual Diagnostics
// ============================================================================

async function diagnoseEnvironment(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  
  // Check required env vars
  const requiredVars = [
    'BOT_TOKEN',
    'PROD_DATABASE_URL',
    'DISCORD_CLIENT_ID',
  ];
  
  const optionalVars = [
    'DATABASE_ONPREMISE_DEV_PRIMARY',
    'LOKI_URL',
    'GRAFANA_URL',
  ];

  for (const varName of requiredVars) {
    const value = getEnv(varName);
    results.push({
      name: `Env: ${varName}`,
      status: value ? 'pass' : 'fail',
      message: value ? 'Configured' : 'Missing (REQUIRED)',
    });
  }

  for (const varName of optionalVars) {
    const value = getEnv(varName);
    results.push({
      name: `Env: ${varName}`,
      status: value ? 'pass' : 'skip',
      message: value ? 'Configured' : 'Not configured (optional)',
    });
  }

  return results;
}

async function diagnoseMemory(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  
  // Current process memory
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  
  results.push({
    name: 'Heap Usage',
    status: heapUsedMB < 500 ? 'pass' : heapUsedMB < 1500 ? 'warn' : 'fail',
    message: `${heapUsedMB} MB / ${heapTotalMB} MB`,
    details: [`RSS: ${rssMB} MB`],
  });

  // Check for heap dumps
  const heapDumpPaths = [
    'Store/',
    '/Store/',
    '/opt/render/project/src/',
  ];

  let heapDumpsFound = 0;
  for (const path of heapDumpPaths) {
    if (await exists(path)) {
      const { listFiles } = await import('../lib/fs.js');
      try {
        const files = await listFiles(path);
        heapDumpsFound += files.filter(f => 
          f.endsWith('.heapsnapshot') || f.endsWith('.heapdump')
        ).length;
      } catch {
        // Directory might not be accessible
      }
    }
  }

  results.push({
    name: 'Heap Dumps',
    status: heapDumpsFound === 0 ? 'pass' : 'warn',
    message: heapDumpsFound === 0 ? 'None found' : `${heapDumpsFound} found (consider cleanup)`,
  });

  return results;
}

async function diagnoseFiles(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  
  // Check critical files
  const criticalFiles = [
    { path: 'package.json', name: 'package.json' },
    { path: 'prisma/schema.prisma', name: 'Prisma Schema' },
    { path: 'tsconfig.json', name: 'TypeScript Config' },
    { path: 'ops/NEXT.yaml', name: 'NEXT.yaml' },
    { path: 'Patch.md', name: 'Patch.md' },
  ];

  for (const file of criticalFiles) {
    const fileExists = await exists(file.path);
    results.push({
      name: file.name,
      status: fileExists ? 'pass' : 'fail',
      message: fileExists ? 'Present' : 'Missing',
    });
  }

  // Check package.json validity
  try {
    const pkg = await readJson('package.json');
    results.push({
      name: 'package.json Parse',
      status: 'pass',
      message: `Valid (${(pkg as { name?: string }).name || 'unnamed'})`,
    });
  } catch {
    results.push({
      name: 'package.json Parse',
      status: 'fail',
      message: 'Invalid JSON',
    });
  }

  return results;
}

async function diagnoseDatabase(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  
  const dbUrl = getEnv('PROD_DATABASE_URL');
  
  if (!dbUrl) {
    results.push({
      name: 'Database URL',
      status: 'fail',
      message: 'PROD_DATABASE_URL not configured',
    });
    return results;
  }

  results.push({
    name: 'Database URL',
    status: 'pass',
    message: 'Configured',
  });

  // Try to connect
  const { exec } = await import('../lib/exec.js');
  
  try {
    const start = Date.now();
    await exec('psql', [dbUrl, '-c', 'SELECT 1', '-t']);
    const latency = Date.now() - start;
    
    results.push({
      name: 'Database Connectivity',
      status: latency < 100 ? 'pass' : latency < 500 ? 'warn' : 'fail',
      message: `Connected (${latency}ms)`,
    });
  } catch (error) {
    results.push({
      name: 'Database Connectivity',
      status: 'fail',
      message: 'Connection failed',
      details: [(error as Error).message.split('\n')[0]],
    });
  }

  return results;
}

async function diagnoseSecurityBot(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  
  // Database-First Architecture (2025-12-27): Query state from database
  const stateKey = 'security-bot-state:current';
  
  try {
    // Use dynamic import to avoid circular dependencies
    const { prisma } = await import('../../src/shared/prisma.js');
    
    const entry = await prisma.cacheEntry.findUnique({
      where: { key: stateKey },
    });
    
    if (!entry) {
      results.push({
        name: 'Security Bot State',
        status: 'skip',
        message: 'State not found in database (bot may not have run)',
      });
      return results;
    }
    
    const state = entry.value as {
      cumulative?: { sweepCount?: number };
      metadata?: { lastSaved?: string };
    };
    
    results.push({
      name: 'Security Bot State',
      status: 'pass',
      message: 'State entry exists in database',
    });

    if (state.cumulative) {
      results.push({
        name: 'Sweeps Completed',
        status: 'pass',
        message: (state.cumulative.sweepCount || 0).toString(),
      });
    }

    if (state.metadata?.lastSaved) {
      const lastSave = new Date(state.metadata.lastSaved);
      const ageMs = Date.now() - lastSave.getTime();
      const ageHours = Math.round(ageMs / 1000 / 60 / 60);
      
      results.push({
        name: 'Last State Save',
        status: ageHours < 24 ? 'pass' : 'warn',
        message: ageHours < 24 ? `${ageHours}h ago` : `${ageHours}h ago (stale)`,
      });
    }
  } catch (err) {
    const error = err as Error;
    results.push({
      name: 'Security Bot State',
      status: 'fail',
      message: `Failed to query database: ${error.message}`,
    });
  }

  return results;
}

async function diagnoseHomestead(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  
  // Check homestead-related files
  const homesteadFiles = [
    'src/bot/homestead/home.ts',
    'src/bot/homestead/heal.ts',
    'src/bot/homestead/starters.ts',
  ];

  for (const file of homesteadFiles) {
    const fileExists = await exists(file);
    const name = file.split('/').pop() || file;
    results.push({
      name: `Homestead: ${name}`,
      status: fileExists ? 'pass' : 'fail',
      message: fileExists ? 'Present' : 'Missing',
    });
  }

  // Check architecture doc
  const archDoc = 'docs/architecture-bible/18-private-channel-architecture.md';
  if (await exists(archDoc)) {
    results.push({
      name: 'Architecture Doc',
      status: 'pass',
      message: 'Private channel architecture documented',
    });
  }

  return results;
}

// ============================================================================
// Commands
// ============================================================================

const allCommand: CommandDef = {
  description: 'Run all diagnostics',
  flags: [
    { name: 'verbose', short: 'v', description: 'Show all details', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    await loadEnv();
    
    printSection('Full System Diagnostics');
    console.log();

    const allResults: DiagnosticResult[] = [];
    
    const diagnostics = [
      { name: 'Environment', fn: diagnoseEnvironment },
      { name: 'Critical Files', fn: diagnoseFiles },
      { name: 'Memory', fn: diagnoseMemory },
      { name: 'Database', fn: diagnoseDatabase },
      { name: 'Security Bot', fn: diagnoseSecurityBot },
      { name: 'Homestead', fn: diagnoseHomestead },
    ];

    const progress = createProgressBar({ total: diagnostics.length });
    
    for (const diag of diagnostics) {
      progress.tick(diag.name);
      const results = await diag.fn();
      allResults.push(...results);
    }
    
    progress.complete();
    console.log();

    // Print all results grouped
    let currentGroup = '';
    for (const result of allResults) {
      const group = result.name.split(':')[0] || result.name;
      if (group !== currentGroup) {
        if (currentGroup) console.log();
        currentGroup = group;
      }
      printDiagnosticResult(result);
    }

    summarizeDiagnostics(allResults);
  },
};

const envCommand: CommandDef = {
  description: 'Diagnose environment configuration',
  run: async () => {
    await loadEnv();
    
    printSection('Environment Diagnostics');
    console.log();
    
    const results = await diagnoseEnvironment();
    for (const result of results) {
      printDiagnosticResult(result);
    }
    
    summarizeDiagnostics(results);
  },
};

const memoryCommand: CommandDef = {
  description: 'Diagnose memory usage',
  run: async () => {
    printSection('Memory Diagnostics');
    console.log();
    
    const results = await diagnoseMemory();
    for (const result of results) {
      printDiagnosticResult(result);
    }
    
    // Additional memory info
    console.log();
    const mem = process.memoryUsage();
    printKeyValue('Heap Used', `${Math.round(mem.heapUsed / 1024 / 1024)} MB`);
    printKeyValue('Heap Total', `${Math.round(mem.heapTotal / 1024 / 1024)} MB`);
    printKeyValue('RSS', `${Math.round(mem.rss / 1024 / 1024)} MB`);
    printKeyValue('External', `${Math.round(mem.external / 1024 / 1024)} MB`);
    printKeyValue('Array Buffers', `${Math.round(mem.arrayBuffers / 1024 / 1024)} MB`);
    
    summarizeDiagnostics(results);
  },
};

const databaseCommand: CommandDef = {
  description: 'Diagnose database connectivity',
  run: async () => {
    await loadEnv();
    
    printSection('Database Diagnostics');
    console.log();
    
    const results = await diagnoseDatabase();
    for (const result of results) {
      printDiagnosticResult(result);
    }
    
    summarizeDiagnostics(results);
  },
};

const securityCommand: CommandDef = {
  description: 'Diagnose security bot state',
  run: async () => {
    printSection('Security Bot Diagnostics');
    console.log();
    
    const results = await diagnoseSecurityBot();
    for (const result of results) {
      printDiagnosticResult(result);
    }
    
    summarizeDiagnostics(results);
  },
};

const homesteadCommand: CommandDef = {
  description: 'Diagnose homestead system',
  run: async () => {
    printSection('Homestead Diagnostics');
    console.log();
    
    const results = await diagnoseHomestead();
    for (const result of results) {
      printDiagnosticResult(result);
    }
    
    summarizeDiagnostics(results);
  },
};

const filesCommand: CommandDef = {
  description: 'Diagnose critical files',
  run: async () => {
    printSection('File System Diagnostics');
    console.log();
    
    const results = await diagnoseFiles();
    for (const result of results) {
      printDiagnosticResult(result);
    }
    
    summarizeDiagnostics(results);
  },
};

// ============================================================================
// CLI Setup
// ============================================================================

createCLI({
  name: 'diagnose',
  description: 'System diagnostic tools',
  version: '1.0.0',
  commands: {
    all: allCommand,
    env: envCommand,
    memory: memoryCommand,
    database: databaseCommand,
    security: securityCommand,
    homestead: homesteadCommand,
    files: filesCommand,
  },
});

// ============================================================================
// Entry Point — CLI runs automatically via createCLI
// ============================================================================
