#!/usr/bin/env node
/**
 * SensaiOS CLI — Application Management Tool
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Command-line interface for managing SensaiOS applications.
 * Uses the Installation API for all operations (no direct DB access).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   npm run sensaios install manifests/my-app.manifest.json
 *   npm run sensaios list
 *   npm run sensaios status game.core
 *   npm run sensaios enable game.battles
 *   npm run sensaios disable game.battles
 *   npm run sensaios uninstall game.battles --force
 *   npm run sensaios grant game.battles db.write --dry-run
 *   npm run sensaios revoke game.battles kernel.observe
 *
 * Flags:
 *   --dry-run    Simulate operation without changes (dangerous operations)
 *   --force      Override safety checks (uninstall with dependents)
 *   --json       Output in JSON format
 *   --help       Show command help
 *
 * @module scripts/sensaios-cli
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

import { config } from 'dotenv';

import {
  formatBorder,
  formatSectionHeader,
  formatKeyValueList,
  formatStatus,
  formatList,
  formatTable,
  formatSeparator,
} from '../src/utils/output-formatter.js';

import {
  installApp,
  uninstallApp,
  validateManifest,
  getDangerousCapabilities,
  listDependents,
  type InstallResult,
  type UninstallResult,
  type AppManifest,
} from '../src/sensaios/install/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Available CLI commands
 */
type Command =
  | 'install'
  | 'list'
  | 'enable'
  | 'disable'
  | 'uninstall'
  | 'grant'
  | 'revoke'
  | 'status'
  | 'help';

/**
 * Parsed command-line arguments
 */
interface ParsedArgs {
  command: Command;
  target: string;
  extra: string;
  options: {
    dryRun: boolean;
    force: boolean;
    json: boolean;
    help: boolean;
  };
}

/**
 * CLI context with database access
 * Implements ComponentContext interface for CLI operations
 */
interface CliContext {
  db: {
    prisma: typeof import('../src/shared/prisma.js').prisma;
  };
  exports: {
    append: (envelope: unknown) => Promise<{ seq: number }>;
  };
  jobs: {
    enqueue: (job: unknown) => Promise<string>;
  };
  outbox: {
    send: (message: unknown) => Promise<string>;
  };
  obs: {
    log: {
      info: (msg: string, data?: unknown) => void;
      warn: (msg: string, data?: unknown) => void;
      error: (msg: string, data?: unknown) => void;
    };
    correlationId: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DANGEROUS_CAPABILITIES = ['db.migrate', 'kernel.observe', 'kernel.modify', 'discord.moderate'];

const HELP_TEXT = `
SensaiOS CLI — Application Management Tool

USAGE:
  npm run sensaios <command> [target] [options]

COMMANDS:
  install <path>               Install app from manifest file
  list                         List all installed apps
  status <appId>               Show app details and capabilities
  enable <appId>               Enable a disabled app
  disable <appId>              Disable an app (without uninstalling)
  uninstall <appId>            Uninstall an app
  grant <appId> <capability>   Grant capability to an app
  revoke <appId> <capability>  Revoke capability from an app
  help                         Show this help message

OPTIONS:
  --dry-run    Simulate operation without making changes
  --force      Override safety checks (e.g., uninstall with dependents)
  --json       Output results in JSON format

EXAMPLES:
  npm run sensaios install manifests/battle-engine.manifest.json
  npm run sensaios list
  npm run sensaios status game.core
  npm run sensaios enable game.battles
  npm run sensaios disable game.battles
  npm run sensaios uninstall game.battles --force
  npm run sensaios grant game.battles db.write --dry-run
  npm run sensaios revoke game.battles kernel.observe

DANGEROUS CAPABILITIES (require approval):
  - db.migrate        Schema changes (CREATE/ALTER/DROP)
  - kernel.observe    Read kernel internals
  - kernel.modify     Modify kernel behavior
  - discord.moderate  Ban/kick/timeout users
`.trim();

// ═══════════════════════════════════════════════════════════════════════════
// ARGUMENT PARSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse command-line arguments
 */
function parseArgs(argv: string[]): ParsedArgs {
  // Skip node and script path
  const args = argv.slice(2);

  const result: ParsedArgs = {
    command: 'help',
    target: '',
    extra: '',
    options: {
      dryRun: false,
      force: false,
      json: false,
      help: false,
    },
  };

  const positionals: string[] = [];

  for (const arg of args) {
    if (arg === '--dry-run') {
      result.options.dryRun = true;
    } else if (arg === '--force') {
      result.options.force = true;
    } else if (arg === '--json') {
      result.options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      result.options.help = true;
    } else if (!arg.startsWith('-')) {
      positionals.push(arg);
    }
  }

  // Extract command, target, extra from positionals
  const [command, target, extra] = positionals;

  if (command) {
    const validCommands: Command[] = [
      'install',
      'list',
      'enable',
      'disable',
      'uninstall',
      'grant',
      'revoke',
      'status',
      'help',
    ];
    if (validCommands.includes(command as Command)) {
      result.command = command as Command;
    } else {
      console.error(`Unknown command: ${command}`);
      console.error(`Run 'npm run sensaios help' for usage.`);
      process.exit(1);
    }
  }

  result.target = target || '';
  result.extra = extra || '';

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create CLI context with database access
 */
async function createContext(): Promise<CliContext> {
  // Lazy import prisma to avoid loading before env is set
  const { prisma } = await import('../src/shared/prisma.js');

  return {
    db: { prisma },
    exports: {
      append: async (envelope: unknown) => {
        // For CLI, we log instead of emitting exports
        console.log('[EXPORT]', JSON.stringify(envelope, null, 2));
        return { seq: Date.now() };
      },
    },
    jobs: {
      enqueue: async (job: unknown) => {
        // For CLI, jobs are logged but not actually enqueued
        console.log('[JOB]', JSON.stringify(job, null, 2));
        return `job-${Date.now()}`;
      },
    },
    outbox: {
      send: async (message: unknown) => {
        // For CLI, messages are logged but not actually sent
        console.log('[OUTBOX]', JSON.stringify(message, null, 2));
        return `msg-${Date.now()}`;
      },
    },
    obs: {
      log: {
        info: (msg: string, data?: unknown) => {
          if (!process.argv.includes('--json')) {
            console.log(`[INFO] ${msg}`, data ? JSON.stringify(data) : '');
          }
        },
        warn: (msg: string, data?: unknown) => {
          console.log(`[NOTE] ${msg}`, data ? JSON.stringify(data) : '');
        },
        error: (msg: string, data?: unknown) => {
          console.log(`[HALT] ${msg}`, data ? JSON.stringify(data) : '');
        },
      },
      correlationId: `cli-${Date.now()}`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prompt operator for approval of dangerous capabilities
 */
async function promptForApproval(
  capabilities: string[],
  appId: string
): Promise<boolean> {
  console.log('');
  console.log(formatSeparator('DANGEROUS CAPABILITIES DETECTED', 60));
  console.log('');
  console.log(`App: ${appId}`);
  console.log('');
  console.log('The following dangerous capabilities require approval:');
  console.log('');
  for (const cap of capabilities) {
    console.log(`  ⚠️  ${cap}`);
  }
  console.log('');
  console.log('These capabilities allow the app to:');
  for (const cap of capabilities) {
    if (cap === 'db.migrate') {
      console.log('  - Make schema changes (CREATE/ALTER/DROP tables)');
    } else if (cap === 'kernel.observe') {
      console.log('  - Read kernel internal state');
    } else if (cap === 'kernel.modify') {
      console.log('  - Modify kernel behavior');
    } else if (cap === 'discord.moderate') {
      console.log('  - Ban, kick, or timeout Discord users');
    }
  }
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Approve these capabilities? (yes/no): ', (answer) => {
      rl.close();
      const approved = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
      resolve(approved);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Install command: Load manifest, validate, call installApp
 */
async function handleInstall(
  target: string,
  options: ParsedArgs['options'],
  ctx: CliContext
): Promise<void> {
  if (!target) {
    console.log('[HALT] Missing manifest path');
    console.log('Usage: npm run sensaios install <path>');
    process.exit(1);
  }

  // Resolve manifest path
  const manifestPath = path.resolve(process.cwd(), target);
  if (!fs.existsSync(manifestPath)) {
    console.log(`[HALT] Manifest file not found: ${manifestPath}`);
    process.exit(1);
  }

  // Load and parse manifest
  let manifest: unknown;
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(content);
  } catch (e) {
    console.log(`[HALT] Could not parse manifest: ${(e as Error).message}`);
    process.exit(1);
  }

  // Validate manifest
  let validatedManifest: AppManifest;
  try {
    validatedManifest = validateManifest(manifest);
  } catch (e) {
    console.log(`[HALT] Invalid manifest: ${(e as Error).message}`);
    process.exit(1);
  }

  // Check for dangerous capabilities
  const dangerous = getDangerousCapabilities(validatedManifest);
  if (dangerous.length > 0 && !options.dryRun) {
    const approved = await promptForApproval(dangerous, validatedManifest.id);
    if (!approved) {
      console.log('');
      console.log('Installation cancelled — dangerous capabilities not approved.');
      process.exit(0);
    }
  }

  // Dry run mode
  if (options.dryRun) {
    console.log('');
    console.log(formatSectionHeader('DRY RUN — No changes will be made'));
    console.log('');
    console.log(
      formatKeyValueList([
        ['App ID', validatedManifest.id],
        ['Name', validatedManifest.name],
        ['Version', validatedManifest.version],
        ['Hosts', validatedManifest.hosts.join(', ')],
        ['Dependencies', (validatedManifest.dependencies || []).join(', ') || 'None'],
      ])
    );
    console.log('');
    console.log('Capabilities:');
    console.log(`  Database: ${validatedManifest.capabilities.db.join(', ')}`);
    if (validatedManifest.capabilities.discord) {
      console.log(`  Discord: ${validatedManifest.capabilities.discord.join(', ')}`);
    }
    if (validatedManifest.capabilities.network) {
      console.log(`  Network: ${validatedManifest.capabilities.network.join(', ')}`);
    }
    if (dangerous.length > 0) {
      console.log('');
      console.log('⚠️  Dangerous capabilities would require approval:');
      for (const cap of dangerous) {
        console.log(`     - ${cap}`);
      }
    }
    console.log('');
    console.log(formatStatus('Dry run complete — manifest is valid', 'success'));
    return;
  }

  // Perform installation
  const result = await installApp(manifest, ctx);

  // Output result
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }

  console.log('');
  if (result.success) {
    console.log(formatStatus(`Installed ${result.appId}`, 'success'));
    console.log(result.message);
  } else {
    console.log(formatStatus(`Could not install ${result.appId}`, 'error'));
    console.log(result.message);
    if (result.errors && result.errors.length > 0) {
      console.log('');
      console.log('Issues:');
      for (const issue of result.errors) {
        console.log(`  - ${issue}`);
      }
    }
    if (result.pendingApprovals && result.pendingApprovals.length > 0) {
      console.log('');
      console.log('Pending approvals:');
      for (const cap of result.pendingApprovals) {
        console.log(`  - ${cap}`);
      }
    }
    process.exit(1);
  }
}

/**
 * List command: Show all installed apps
 */
async function handleList(
  options: ParsedArgs['options'],
  ctx: CliContext
): Promise<void> {
  let apps;
  try {
    apps = await ctx.db.prisma.installedApp.findMany({
      orderBy: { installedAt: 'desc' },
      select: {
        id: true,
        name: true,
        version: true,
        status: true,
        installedAt: true,
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('does not exist in the current database')) {
      console.log('');
      console.log(formatStatus('SensaiOS tables not found', 'info'));
      console.log('');
      console.log('The SensaiOS schema tables have not been created yet.');
      console.log('Run database migrations to create the required tables:');
      console.log('');
      console.log('  npx prisma migrate deploy');
      console.log('');
      return;
    }
    throw e;
  }

  if (options.json) {
    console.log(JSON.stringify(apps, null, 2));
    return;
  }

  console.log('');
  console.log(formatSectionHeader('Installed Apps'));
  console.log('');

  if (apps.length === 0) {
    console.log('  No apps installed.');
  } else {
    // formatTable returns string[], join with newlines
    const tableLines = formatTable(
      ['ID', 'Name', 'Version', 'Status', 'Installed'],
      apps.map((app) => [
        app.id,
        app.name,
        app.version,
        formatAppStatus(app.status),
        formatDate(app.installedAt),
      ]),
      { columnWidths: [25, 20, 10, 10, 20] }
    );
    console.log(tableLines.join('\n'));
  }
  console.log('');
  console.log(`Total: ${apps.length} app(s)`);
}

/**
 * Status command: Show app details
 */
async function handleStatus(
  target: string,
  options: ParsedArgs['options'],
  ctx: CliContext
): Promise<void> {
  if (!target) {
    console.log('[HALT] Missing app ID');
    console.log('Usage: npm run sensaios status <appId>');
    process.exit(1);
  }

  const app = await ctx.db.prisma.installedApp.findUnique({
    where: { id: target },
  });

  if (!app) {
    console.log(`[HALT] App not found: ${target}`);
    process.exit(1);
  }

  // Fetch capabilities separately (no relation in schema)
  const capabilities = await ctx.db.prisma.componentCapability.findMany({
    where: { component: target, revokedAt: null },
  });

  // Parse manifest for additional details
  const manifest = app.manifest as any;

  if (options.json) {
    console.log(JSON.stringify({ ...app, capabilities }, null, 2));
    return;
  }

  console.log('');
  console.log(formatSectionHeader(`App: ${app.id}`));
  console.log('');
  console.log(
    formatKeyValueList([
      ['Name', app.name],
      ['Version', app.version],
      ['Status', formatAppStatus(app.status)],
      ['Ring Level', app.ringLevel.toString()],
      ['Description', manifest?.description || 'N/A'],
      ['Hosts', Array.isArray(manifest?.hosts) ? manifest.hosts.join(', ') : 'N/A'],
      ['Installed', formatDate(app.installedAt)],
      ['Updated', formatDate(app.updatedAt)],
    ])
  );

  // Show dependencies from manifest
  const deps = Array.isArray(manifest?.dependencies) ? manifest.dependencies : [];
  console.log('');
  console.log('Dependencies:');
  if (deps.length === 0) {
    console.log('  None');
  } else {
    for (const dep of deps) {
      console.log(`  - ${dep}`);
    }
  }

  // Show dependents (apps that depend on this one)
  const dependents = await listDependents(target, ctx);
  console.log('');
  console.log('Dependents (apps that depend on this):');
  if (dependents.length === 0) {
    console.log('  None');
  } else {
    for (const dep of dependents) {
      console.log(`  - ${dep}`);
    }
  }

  // Show capabilities
  console.log('');
  console.log('Capabilities:');
  if (capabilities.length === 0) {
    console.log('  None granted');
  } else {
    for (const cap of capabilities) {
      const icon = DANGEROUS_CAPABILITIES.includes(cap.type) ? '⚠️ ' : '  ';
      const scopeStr = cap.scope ? ` (scope: ${JSON.stringify(cap.scope)})` : '';
      console.log(`${icon} ${cap.type}${scopeStr}`);
    }
  }
  console.log('');
}

/**
 * Enable command: Enable a disabled app
 */
async function handleEnable(
  target: string,
  options: ParsedArgs['options'],
  ctx: CliContext
): Promise<void> {
  if (!target) {
    console.log('[HALT] Missing app ID');
    console.log('Usage: npm run sensaios enable <appId>');
    process.exit(1);
  }

  const app = await ctx.db.prisma.installedApp.findUnique({
    where: { id: target },
    select: { id: true, status: true, name: true },
  });

  if (!app) {
    console.log(`[HALT] App not found: ${target}`);
    process.exit(1);
  }

  if (app.status === 'enabled') {
    console.log(`App ${target} is already enabled.`);
    return;
  }

  if (options.dryRun) {
    console.log('');
    console.log(formatSectionHeader('DRY RUN'));
    console.log(`Would enable app: ${target}`);
    console.log(`Current status: ${app.status}`);
    return;
  }

  // Update status
  await ctx.db.prisma.installedApp.update({
    where: { id: target },
    data: {
      status: 'enabled',
      updatedAt: new Date(),
    },
  });

  // Emit export event
  await ctx.exports.append({
    source: 'sensaios.cli',
    type: 'app.enabled',
    idempotencyKey: `enable-${target}-${Date.now()}`,
    payload: { appId: target },
    occurredAt: new Date(),
    correlationId: ctx.obs.correlationId,
  });

  if (options.json) {
    console.log(JSON.stringify({ success: true, appId: target, status: 'enabled' }));
  } else {
    console.log('');
    console.log(formatStatus(`Enabled ${target}`, 'success'));
  }
}

/**
 * Disable command: Disable an app without uninstalling
 */
async function handleDisable(
  target: string,
  options: ParsedArgs['options'],
  ctx: CliContext
): Promise<void> {
  if (!target) {
    console.log('[HALT] Missing app ID');
    console.log('Usage: npm run sensaios disable <appId>');
    process.exit(1);
  }

  const app = await ctx.db.prisma.installedApp.findUnique({
    where: { id: target },
    select: { id: true, status: true, name: true },
  });

  if (!app) {
    console.log(`[HALT] App not found: ${target}`);
    process.exit(1);
  }

  if (app.status === 'disabled') {
    console.log(`App ${target} is already disabled.`);
    return;
  }

  // Check for dependents
  const dependents = await listDependents(target, ctx);
  if (dependents.length > 0 && !options.force) {
    console.log('');
    console.log(`[HALT] Cannot disable ${target} — other apps depend on it:`);
    for (const dep of dependents) {
      console.log(`  - ${dep}`);
    }
    console.log('');
    console.log('Use --force to disable anyway (may break dependent apps).');
    process.exit(1);
  }

  if (options.dryRun) {
    console.log('');
    console.log(formatSectionHeader('DRY RUN'));
    console.log(`Would disable app: ${target}`);
    console.log(`Current status: ${app.status}`);
    if (dependents.length > 0) {
      console.log('');
      console.log('⚠️  Warning: The following apps depend on this app:');
      for (const dep of dependents) {
        console.log(`     - ${dep}`);
      }
    }
    return;
  }

  // Update status
  await ctx.db.prisma.installedApp.update({
    where: { id: target },
    data: {
      status: 'disabled',
      updatedAt: new Date(),
    },
  });

  // Emit export event
  await ctx.exports.append({
    source: 'sensaios.cli',
    type: 'app.disabled',
    idempotencyKey: `disable-${target}-${Date.now()}`,
    payload: { appId: target, force: options.force },
    occurredAt: new Date(),
    correlationId: ctx.obs.correlationId,
  });

  if (options.json) {
    console.log(JSON.stringify({ success: true, appId: target, status: 'disabled' }));
  } else {
    console.log('');
    console.log(formatStatus(`Disabled ${target}`, 'success'));
    if (options.force && dependents.length > 0) {
      console.log('');
      console.log('[NOTE] The following apps may be broken:');
      for (const dep of dependents) {
        console.log(`     - ${dep}`);
      }
    }
  }
}

/**
 * Uninstall command: Remove an app
 */
async function handleUninstall(
  target: string,
  options: ParsedArgs['options'],
  ctx: CliContext
): Promise<void> {
  if (!target) {
    console.log('[HALT] Missing app ID');
    console.log('Usage: npm run sensaios uninstall <appId>');
    process.exit(1);
  }

  if (options.dryRun) {
    const app = await ctx.db.prisma.installedApp.findUnique({
      where: { id: target },
      select: { id: true, name: true, version: true },
    });

    if (!app) {
      console.log(`[HALT] App not found: ${target}`);
      process.exit(1);
    }

    const dependents = await listDependents(target, ctx);

    console.log('');
    console.log(formatSectionHeader('DRY RUN'));
    console.log(`Would uninstall app: ${target}`);
    console.log(`Name: ${app.name}`);
    console.log(`Version: ${app.version}`);

    if (dependents.length > 0) {
      console.log('');
      console.log('[NOTE] The following apps depend on this app:');
      for (const dep of dependents) {
        console.log(`     - ${dep}`);
      }
      console.log('');
      console.log('Uninstall would require --force flag.');
    }
    return;
  }

  // Call uninstall API
  const result = await uninstallApp(target, ctx, { force: options.force });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }

  console.log('');
  if (result.success) {
    console.log(formatStatus(`Uninstalled ${result.appId}`, 'success'));
    console.log(result.message);
  } else {
    console.log(formatStatus(`Could not uninstall ${result.appId}`, 'error'));
    console.log(result.message);

    if (result.blockedByDependents && result.blockedByDependents.length > 0) {
      console.log('');
      console.log('Blocked by dependents:');
      for (const dep of result.blockedByDependents) {
        console.log(`  - ${dep}`);
      }
      console.log('');
      console.log('Use --force to uninstall anyway.');
    }

    if (result.errors && result.errors.length > 0) {
      console.log('');
      console.log('Issues:');
      for (const issue of result.errors) {
        console.log(`  - ${issue}`);
      }
    }
    process.exit(1);
  }
}

/**
 * Grant command: Grant capability to an app
 */
async function handleGrant(
  target: string,
  extra: string,
  options: ParsedArgs['options'],
  ctx: CliContext
): Promise<void> {
  if (!target || !extra) {
    console.log('[HALT] Missing app ID or capability');
    console.log('Usage: npm run sensaios grant <appId> <capability>');
    process.exit(1);
  }

  const appId = target;
  const capability = extra;

  // Verify app exists
  const app = await ctx.db.prisma.installedApp.findUnique({
    where: { id: appId },
    select: { id: true, name: true },
  });

  if (!app) {
    console.log(`[HALT] App not found: ${appId}`);
    process.exit(1);
  }

  // Check if capability already granted
  const existing = await ctx.db.prisma.componentCapability.findFirst({
    where: {
      component: appId,
      type: capability,
    },
  });

  if (existing) {
    console.log(`Capability ${capability} is already granted to ${appId}.`);
    return;
  }

  // Check if dangerous
  const isDangerous = DANGEROUS_CAPABILITIES.includes(capability);
  if (isDangerous && !options.dryRun) {
    const approved = await promptForApproval([capability], appId);
    if (!approved) {
      console.log('');
      console.log('Grant cancelled — dangerous capability not approved.');
      process.exit(0);
    }
  }

  if (options.dryRun) {
    console.log('');
    console.log(formatSectionHeader('DRY RUN'));
    console.log(`Would grant capability: ${capability}`);
    console.log(`To app: ${appId}`);
    if (isDangerous) {
      console.log('');
      console.log('⚠️  This is a dangerous capability — approval would be required.');
    }
    return;
  }

  // Grant capability
  await ctx.db.prisma.componentCapability.create({
    data: {
      component: appId,
      type: capability,
      scope: { tenantId: 'default', guildId: '*' }, // Global scope for CLI grants
      reason: `Granted via CLI by operator`,
      grantedBy: 'cli-operator',
    },
  });

  // Emit export event
  await ctx.exports.append({
    source: 'sensaios.cli',
    type: 'capability.granted',
    idempotencyKey: `grant-${appId}-${capability}-${Date.now()}`,
    payload: { appId, capability, dangerous: isDangerous },
    occurredAt: new Date(),
    correlationId: ctx.obs.correlationId,
  });

  if (options.json) {
    console.log(JSON.stringify({ success: true, appId, capability, granted: true }));
  } else {
    console.log('');
    console.log(formatStatus(`Granted ${capability} to ${appId}`, 'success'));
  }
}

/**
 * Revoke command: Revoke capability from an app
 */
async function handleRevoke(
  target: string,
  extra: string,
  options: ParsedArgs['options'],
  ctx: CliContext
): Promise<void> {
  if (!target || !extra) {
    console.log('[HALT] Missing app ID or capability');
    console.log('Usage: npm run sensaios revoke <appId> <capability>');
    process.exit(1);
  }

  const appId = target;
  const capability = extra;

  // Verify app exists
  const app = await ctx.db.prisma.installedApp.findUnique({
    where: { id: appId },
    select: { id: true, name: true },
  });

  if (!app) {
    console.log(`[HALT] App not found: ${appId}`);
    process.exit(1);
  }

  // Check if capability exists
  const existing = await ctx.db.prisma.componentCapability.findFirst({
    where: {
      component: appId,
      type: capability,
    },
  });

  if (!existing) {
    console.log(`Capability ${capability} is not granted to ${appId}.`);
    return;
  }

  if (options.dryRun) {
    console.log('');
    console.log(formatSectionHeader('DRY RUN'));
    console.log(`Would revoke capability: ${capability}`);
    console.log(`From app: ${appId}`);
    return;
  }

  // Revoke capability
  await ctx.db.prisma.componentCapability.delete({
    where: { id: existing.id },
  });

  // Emit export event
  await ctx.exports.append({
    source: 'sensaios.cli',
    type: 'capability.revoked',
    idempotencyKey: `revoke-${appId}-${capability}-${Date.now()}`,
    payload: { appId, capability },
    occurredAt: new Date(),
    correlationId: ctx.obs.correlationId,
  });

  if (options.json) {
    console.log(JSON.stringify({ success: true, appId, capability, revoked: true }));
  } else {
    console.log('');
    console.log(formatStatus(`Revoked ${capability} from ${appId}`, 'success'));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format app status with color
 */
function formatAppStatus(status: string): string {
  switch (status) {
    case 'enabled':
      return '✅ enabled';
    case 'disabled':
      return '⏸️  disabled';
    case 'error':
      return '❌ error';
    default:
      return status;
  }
}

/**
 * Format date for display
 */
function formatDate(date: Date | null): string {
  if (!date) return 'N/A';
  return date.toISOString().replace('T', ' ').split('.')[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  // Load environment
  config();

  // Parse arguments
  const args = parseArgs(process.argv);

  // Show help
  if (args.options.help || args.command === 'help') {
    console.log(HELP_TEXT);
    return;
  }

  // Create context
  const ctx = await createContext();

  // Dispatch to command handler
  try {
    switch (args.command) {
      case 'install':
        await handleInstall(args.target, args.options, ctx);
        break;
      case 'list':
        await handleList(args.options, ctx);
        break;
      case 'status':
        await handleStatus(args.target, args.options, ctx);
        break;
      case 'enable':
        await handleEnable(args.target, args.options, ctx);
        break;
      case 'disable':
        await handleDisable(args.target, args.options, ctx);
        break;
      case 'uninstall':
        await handleUninstall(args.target, args.options, ctx);
        break;
      case 'grant':
        await handleGrant(args.target, args.extra, args.options, ctx);
        break;
      case 'revoke':
        await handleRevoke(args.target, args.extra, args.options, ctx);
        break;
      default:
        console.log(`Unknown command: ${args.command}`);
        console.log(HELP_TEXT);
        process.exit(1);
    }
  } catch (e) {
    console.log('');
    console.log(formatStatus('Command did not complete', 'error'));
    console.log((e as Error).message);
    if (process.env.DEBUG) {
      console.log((e as Error).stack);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.log('[HALT]', e);
  process.exit(1);
});
