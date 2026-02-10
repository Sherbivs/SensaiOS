#!/usr/bin/env npx tsx
/**
 * Operations CLI
 * 
 * TypeScript CLI for project operations including migrations,
 * hotfix management, task archival, and project maintenance.
 * 
 * @usage npx tsx scripts/ops/cli.ts <command> [options]
 * @example
 *   npx tsx scripts/ops/cli.ts migrations status
 *   npx tsx scripts/ops/cli.ts hotfix start "Fix bug"
 *   npx tsx scripts/ops/cli.ts archive tasks
 *   npx tsx scripts/ops/cli.ts routers update
 * 
 * @module scripts/ops/cli
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
  handleError,
  exec,
  exists,
  readText,
  writeText,
  readJson,
  listFiles,
  type CommandDef,
} from '../lib/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Constants
// ============================================================================

const OPS_DIR = 'ops';
const NEXT_YAML = 'ops/NEXT.yaml';
const TASKLIST_MD = 'Tasklist.md';
const HOTFIX_PLAN = 'ops/HOTFIX_PLAN.yaml';
const ARCHIVE_DIR = 'ops/ARCHIVE';
const PRISMA_DIR = 'prisma';

// ============================================================================
// Helpers
// ============================================================================

function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

function formatDateTime(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').split('.')[0];
}

// ============================================================================
// Migration Commands
// ============================================================================

const migrationsCommand: CommandDef = {
  description: 'Database migration operations',
  args: [
    { name: 'action', description: 'status|create|deploy|reset', required: true },
    { name: 'name', description: 'Migration name (for create)' },
  ],
  flags: [
    { name: 'target', short: 't', description: 'Database target (cloud-prod, onpremise-dev)', type: 'string' },
    { name: 'force', short: 'f', description: 'Force operation', type: 'boolean' },
    { name: 'dry-run', description: 'Show what would be done', type: 'boolean' },
  ],
  run: async ({ args, flags }) => {
    const action = args[0];
    const name = args[1];
    const target = (flags.target as string) || 'cloud-prod';
    const dryRun = flags['dry-run'] as boolean;

    printSection('Migrations');
    printKeyValue('Target', target);
    console.log();

    switch (action) {
      case 'status': {
        // Check migrations directory
        const migrationsDir = path.join(PRISMA_DIR, 'migrations');
        
        if (!await exists(migrationsDir)) {
          printWarning('No migrations directory found');
          return;
        }

        const migrations = await fs.readdir(migrationsDir, { withFileTypes: true });
        const migrationDirs = migrations.filter(d => d.isDirectory() && d.name !== '..' && d.name !== '.');

        printInfo(`Found ${migrationDirs.length} migrations:`);
        console.log();

        for (const dir of migrationDirs.slice(-10)) {
          const migrationPath = path.join(migrationsDir, dir.name, 'migration.sql');
          const hasSQL = await exists(migrationPath);
          const icon = hasSQL ? c.green('✓') : c.yellow('○');
          console.log(`  ${icon} ${dir.name}`);
        }

        if (migrationDirs.length > 10) {
          console.log(c.gray(`  ... and ${migrationDirs.length - 10} more`));
        }

        // Check Prisma migrate status
        console.log();
        printInfo('Prisma Status:');
        
        try {
          const result = await exec('npx', ['prisma', 'migrate', 'status']);
          console.log(result.stdout);
        } catch (error: any) {
          if (error.stderr) {
            console.log(c.yellow(error.stderr));
          }
        }
        break;
      }

      case 'create': {
        if (!name) {
          printError('Migration name required');
          printInfo('Usage: npx tsx scripts/ops/cli.ts migrations create my_migration_name');
          process.exit(1);
        }

        if (dryRun) {
          printInfo(`Would create migration: ${name}`);
          return;
        }

        const spinner = createSpinner({ text: 'Creating migration...' });
        
        try {
          await exec('npx', ['prisma', 'migrate', 'dev', '--name', name, '--create-only']);
          spinner.stop();
          printSuccess(`Migration created: ${name}`);
        } catch (error) {
          spinner.stop();
          printError('Migration creation failed');
          throw error;
        }
        break;
      }

      case 'deploy': {
        if (dryRun) {
          printInfo('Would deploy pending migrations');
          return;
        }

        const spinner = createSpinner({ text: 'Deploying migrations...' });
        
        try {
          await exec('npx', ['prisma', 'migrate', 'deploy']);
          spinner.stop();
          printSuccess('Migrations deployed');
        } catch (error) {
          spinner.stop();
          printError('Migration deployment failed');
          throw error;
        }
        break;
      }

      case 'reset': {
        printWarning('This will reset the database and delete all data!');
        
        if (!flags.force) {
          printError('Use --force to confirm');
          process.exit(1);
        }

        if (dryRun) {
          printInfo('Would reset database');
          return;
        }

        const spinner = createSpinner({ text: 'Resetting database...' });
        
        try {
          await exec('npx', ['prisma', 'migrate', 'reset', '--force']);
          spinner.stop();
          printSuccess('Database reset complete');
        } catch (error) {
          spinner.stop();
          printError('Database reset failed');
          throw error;
        }
        break;
      }

      default:
        printError(`Unknown action: ${action}`);
        printInfo('Valid actions: status, create, deploy, reset');
        process.exit(1);
    }
  },
};

// ============================================================================
// Hotfix Commands
// ============================================================================

const hotfixCommand: CommandDef = {
  description: 'Hotfix management',
  args: [
    { name: 'action', description: 'start|status|complete|abort', required: true },
    { name: 'description', description: 'Hotfix description (for start)' },
  ],
  run: async ({ args }) => {
    const action = args[0];
    const description = args[1];

    printSection('Hotfix');

    switch (action) {
      case 'start': {
        if (!description) {
          printError('Hotfix description required');
          printInfo('Usage: npx tsx scripts/ops/cli.ts hotfix start "Fix critical bug"');
          process.exit(1);
        }

        // Check if hotfix already in progress
        if (await exists(HOTFIX_PLAN)) {
          const content = await readText(HOTFIX_PLAN);
          if (content.includes('status: active')) {
            printError('Hotfix already in progress');
            printInfo('Complete or abort the current hotfix first');
            process.exit(1);
          }
        }

        // Create hotfix plan
        const plan = `# Hotfix Plan
# Created: ${formatDateTime()}

status: active
description: "${description}"
created: ${new Date().toISOString()}
files:
  - # Add files to modify

steps:
  - [ ] Identify root cause
  - [ ] Implement fix
  - [ ] Test fix
  - [ ] Deploy

notes: |
  Add notes here
`;

        await writeText(HOTFIX_PLAN, plan);
        printSuccess('Hotfix started');
        printInfo(`Edit ${HOTFIX_PLAN} to track progress`);
        break;
      }

      case 'status': {
        if (!await exists(HOTFIX_PLAN)) {
          printInfo('No active hotfix');
          return;
        }

        const content = await readText(HOTFIX_PLAN);
        console.log();
        console.log(content);
        break;
      }

      case 'complete': {
        if (!await exists(HOTFIX_PLAN)) {
          printError('No active hotfix');
          process.exit(1);
        }

        // Archive the hotfix
        const content = await readText(HOTFIX_PLAN);
        const archivePath = path.join(ARCHIVE_DIR, `hotfix-${formatDate()}.yaml`);
        
        await fs.mkdir(ARCHIVE_DIR, { recursive: true });
        await writeText(archivePath, content.replace('status: active', 'status: completed'));
        
        // Clear the hotfix plan
        await writeText(HOTFIX_PLAN, '# No active hotfix\nstatus: none\n');
        
        printSuccess('Hotfix completed and archived');
        printKeyValue('Archive', archivePath);
        break;
      }

      case 'abort': {
        if (!await exists(HOTFIX_PLAN)) {
          printError('No active hotfix');
          process.exit(1);
        }

        await writeText(HOTFIX_PLAN, '# No active hotfix\nstatus: none\n');
        printWarning('Hotfix aborted');
        break;
      }

      default:
        printError(`Unknown action: ${action}`);
        printInfo('Valid actions: start, status, complete, abort');
        process.exit(1);
    }
  },
};

// ============================================================================
// Archive Commands
// ============================================================================

const archiveCommand: CommandDef = {
  description: 'Archive completed items',
  args: [
    { name: 'type', description: 'tasks|logs|all', required: true },
  ],
  flags: [
    { name: 'days', short: 'd', description: 'Age threshold in days', type: 'string' },
    { name: 'dry-run', description: 'Show what would be archived', type: 'boolean' },
  ],
  run: async ({ args, flags }) => {
    const type = args[0];
    const dryRun = flags['dry-run'] as boolean;

    printSection('Archive');
    printKeyValue('Type', type);
    if (dryRun) printKeyValue('Mode', 'dry-run');
    console.log();

    switch (type) {
      case 'tasks': {
        // Use existing archive script
        const spinner = createSpinner({ text: 'Archiving tasks...' });
        
        try {
          if (dryRun) {
            spinner.stop();
            printInfo('Would archive completed tasks from Tasklist.md');
          } else {
            await exec('node', ['scripts/archive_task_history.mjs']);
            spinner.stop();
            printSuccess('Tasks archived');
          }
        } catch (error) {
          spinner.stop();
          printWarning('Task archive script may not exist');
        }
        break;
      }

      case 'logs': {
        // Archive old log files
        const logsDir = 'logs';
        
        if (!await exists(logsDir)) {
          printInfo('No logs directory');
          return;
        }

        const files = await listFiles(logsDir);
        const oldFiles = files.filter(f => f.endsWith('.log') || f.endsWith('.jsonl'));
        
        if (oldFiles.length === 0) {
          printInfo('No log files to archive');
          return;
        }

        printInfo(`Found ${oldFiles.length} log files`);
        
        if (!dryRun) {
          const archivePath = path.join(ARCHIVE_DIR, `logs-${formatDate()}`);
          await fs.mkdir(archivePath, { recursive: true });
          
          for (const file of oldFiles) {
            await fs.rename(
              path.join(logsDir, file),
              path.join(archivePath, file)
            );
          }
          
          printSuccess(`Archived ${oldFiles.length} files to ${archivePath}`);
        }
        break;
      }

      case 'all': {
        printInfo('Archiving all...');
        // Recursively call other archive types
        await exec('npx', ['tsx', 'scripts/ops/cli.ts', 'archive', 'tasks']);
        await exec('npx', ['tsx', 'scripts/ops/cli.ts', 'archive', 'logs']);
        printSuccess('All archives complete');
        break;
      }

      default:
        printError(`Unknown type: ${type}`);
        printInfo('Valid types: tasks, logs, all');
        process.exit(1);
    }
  },
};

// ============================================================================
// Router Commands
// ============================================================================

const routersCommand: CommandDef = {
  description: 'Router documentation management',
  args: [
    { name: 'action', description: 'check|update|list', required: true },
  ],
  run: async ({ args }) => {
    const action = args[0];

    printSection('Routers');

    switch (action) {
      case 'check': {
        // Check for missing ROUTER.md files
        const requiredDirs = [
          'src',
          'scripts',
          'docs',
          'ops',
          'tests',
          'prisma',
          'assets',
          'data',
        ];

        const missing: string[] = [];
        const found: string[] = [];

        for (const dir of requiredDirs) {
          const routerPath = path.join(dir, 'ROUTER.md');
          if (await exists(routerPath)) {
            found.push(routerPath);
          } else {
            missing.push(routerPath);
          }
        }

        printKeyValue('Found', c.green(found.length.toString()));
        printKeyValue('Missing', missing.length > 0 ? c.red(missing.length.toString()) : '0');

        if (missing.length > 0) {
          console.log();
          printWarning('Missing routers:');
          for (const m of missing) {
            console.log(`  ${c.red('✗')} ${m}`);
          }
        }

        process.exit(missing.length > 0 ? 1 : 0);
        break;
      }

      case 'update': {
        const spinner = createSpinner({ text: 'Updating routers...' });
        
        try {
          // Run the router update script if it exists
          if (await exists('scripts/update-routers.ps1')) {
            await exec('pwsh', [
              '-NoProfile',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              'scripts/update-routers.ps1',
            ]);
          } else {
            // Fallback: update ROUTER_INDEX.yaml
            printWarning('Router update script not found');
          }
          spinner.stop();
          printSuccess('Routers updated');
        } catch (error) {
          spinner.stop();
          printError('Router update failed');
          throw error;
        }
        break;
      }

      case 'list': {
        // Find all ROUTER.md files
        const spinner = createSpinner({ text: 'Scanning...' });
        
        const routers: string[] = [];
        
        async function scanDir(dir: string): Promise<void> {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
              if (entry.name === 'node_modules' || entry.name === '.git') continue;
              
              const fullPath = path.join(dir, entry.name);
              
              if (entry.isDirectory()) {
                await scanDir(fullPath);
              } else if (entry.name === 'ROUTER.md') {
                routers.push(fullPath);
              }
            }
          } catch {
            // Skip inaccessible directories
          }
        }

        await scanDir('.');
        spinner.stop();

        printKeyValue('Found', routers.length.toString());
        console.log();

        for (const router of routers.sort()) {
          console.log(`  ${c.cyan('•')} ${router}`);
        }
        break;
      }

      default:
        printError(`Unknown action: ${action}`);
        printInfo('Valid actions: check, update, list');
        process.exit(1);
    }
  },
};

// ============================================================================
// Task Commands
// ============================================================================

const tasksCommand: CommandDef = {
  description: 'Task management',
  args: [
    { name: 'action', description: 'status|next|done', required: true },
  ],
  run: async ({ args }) => {
    const action = args[0];

    printSection('Tasks');

    switch (action) {
      case 'status': {
        // Show NEXT.yaml content
        if (!await exists(NEXT_YAML)) {
          printWarning('NEXT.yaml not found');
          return;
        }

        const content = await readText(NEXT_YAML);
        console.log(content);
        break;
      }

      case 'next': {
        // Show next task from Tasklist.md
        if (!await exists(TASKLIST_MD)) {
          printWarning('Tasklist.md not found');
          return;
        }

        const content = await readText(TASKLIST_MD);
        
        // Find READY tasks
        const readyMatch = content.match(/##.*?READY.*?\n([\s\S]*?)(?=##|$)/gi);
        
        if (readyMatch && readyMatch.length > 0) {
          printInfo('Next READY task:');
          console.log(readyMatch[0].substring(0, 500));
        } else {
          printInfo('No READY tasks found');
        }
        break;
      }

      case 'done': {
        // Count done tasks
        if (!await exists(TASKLIST_MD)) {
          printWarning('Tasklist.md not found');
          return;
        }

        const content = await readText(TASKLIST_MD);
        
        const done = (content.match(/DONE/gi) || []).length;
        const ready = (content.match(/READY/gi) || []).length;
        const inProgress = (content.match(/IN.?PROGRESS/gi) || []).length;
        
        printKeyValue('Done', c.green(done.toString()));
        printKeyValue('Ready', c.blue(ready.toString()));
        printKeyValue('In Progress', c.yellow(inProgress.toString()));
        break;
      }

      default:
        printError(`Unknown action: ${action}`);
        printInfo('Valid actions: status, next, done');
        process.exit(1);
    }
  },
};

// ============================================================================
// Clean Commands
// ============================================================================

const cleanCommand: CommandDef = {
  description: 'Clean project artifacts',
  args: [
    { name: 'target', description: 'dist|cache|logs|all', required: true },
  ],
  flags: [
    { name: 'dry-run', description: 'Show what would be cleaned', type: 'boolean' },
  ],
  run: async ({ args, flags }) => {
    const target = args[0];
    const dryRun = flags['dry-run'] as boolean;

    printSection('Clean');
    printKeyValue('Target', target);
    if (dryRun) printKeyValue('Mode', 'dry-run');
    console.log();

    const targets: { name: string; paths: string[] }[] = [];

    switch (target) {
      case 'dist':
        targets.push({ name: 'Build output', paths: ['dist'] });
        break;
      case 'cache':
        targets.push({ name: 'Caches', paths: ['data/cache', '.cache', 'node_modules/.cache'] });
        break;
      case 'logs':
        targets.push({ name: 'Logs', paths: ['logs'] });
        break;
      case 'all':
        targets.push(
          { name: 'Build output', paths: ['dist'] },
          { name: 'Caches', paths: ['data/cache', '.cache', 'node_modules/.cache'] },
          { name: 'Logs', paths: ['logs'] }
        );
        break;
      default:
        printError(`Unknown target: ${target}`);
        process.exit(1);
    }

    for (const t of targets) {
      printInfo(`Cleaning ${t.name}...`);
      
      for (const p of t.paths) {
        if (await exists(p)) {
          if (dryRun) {
            console.log(`  Would remove: ${p}`);
          } else {
            await fs.rm(p, { recursive: true });
            console.log(`  Removed: ${p}`);
          }
        }
      }
    }

    printSuccess('Clean complete');
  },
};

// ============================================================================
// CLI Setup
// ============================================================================

createCLI({
  name: 'ops',
  description: 'Operations CLI',
  version: '1.0.0',
  commands: {
    migrations: migrationsCommand,
    hotfix: hotfixCommand,
    archive: archiveCommand,
    routers: routersCommand,
    tasks: tasksCommand,
    clean: cleanCommand,
  },
});

// ============================================================================
// Entry Point — CLI runs automatically via createCLI
// ============================================================================
