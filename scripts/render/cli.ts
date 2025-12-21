#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * Render Operations CLI
 * 
 * Unified CLI for all Render service operations.
 * SSH-ONLY policy compliant (no API calls).
 * 
 * @usage npx tsx scripts/render/cli.ts <command> [options]
 * @example
 *   npx tsx scripts/render/cli.ts status
 *   npx tsx scripts/render/cli.ts ssh --interactive
 *   npx tsx scripts/render/cli.ts disk
 *   npx tsx scripts/render/cli.ts cleanup --keep 3
 * 
 * @module scripts/render/cli
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
  renderSSH,
  renderSSHInteractive,
  testSSH,
  createSpinner,
  createProgressBar,
  type CommandDef,
} from '../lib/index.js';

// ============================================================================
// Constants
// ============================================================================

const RENDER_SERVICE_ID = 'srv-d3snk2ndiees73cn709g';
const RENDER_REGION = 'Virginia';

const SERVICES = [
  { name: 'infinity-gauntlet-bot', type: 'web', ram: '2 GB', purpose: 'HTTP health checks' },
  { name: 'Infinity-Gauntlet', type: 'worker', ram: '2 GB', purpose: 'Main Discord bot' },
  { name: 'infinity-gauntlet-outbox', type: 'worker', ram: '512 MB', purpose: 'Event bus delivery' },
  { name: 'infinity-gauntlet-cache', type: 'worker', ram: '512 MB', purpose: 'Cache maintenance' },
  { name: 'infinity-gauntlet-data-pipeline', type: 'worker', ram: '512 MB', purpose: 'Data updates' },
  { name: 'infinity-gauntlet-security', type: 'worker', ram: '512 MB', purpose: 'Permission guardrails' },
  { name: 'pokedex-cache-worker', type: 'worker', ram: '512 MB', purpose: 'External data sync' },
  { name: 'pokedex-cache-failsafe', type: 'cron', ram: '512 MB', purpose: 'Weekly fallback' },
] as const;

// ============================================================================
// Commands
// ============================================================================

const statusCommand: CommandDef = {
  description: 'Show Render service matrix',
  run: async () => {
    printSection('Render Service Matrix');
    printKeyValue('Region', RENDER_REGION);
    printKeyValue('Primary Service ID', RENDER_SERVICE_ID);
    console.log();

    printTable(
      ['Service', 'Type', 'RAM', 'Purpose'],
      SERVICES.map(s => [s.name, s.type, s.ram, s.purpose])
    );

    console.log();
    printInfo('Use "render ssh" to connect interactively');
    printInfo('Use "render disk" to check disk usage');
  },
};

const sshCommand: CommandDef = {
  description: 'SSH into Render service',
  flags: [
    { name: 'interactive', short: 'i', description: 'Interactive shell session', type: 'boolean' },
    { name: 'command', short: 'c', description: 'Command to execute remotely', type: 'string' },
  ],
  run: async ({ flags }) => {
    // Test SSH connection first
    const spinner = createSpinner({ text: 'Testing SSH connection...' });
    const canConnect = await testSSH();
    
    if (!canConnect) {
      spinner.error('SSH connection failed');
      printError('Cannot connect to Render via SSH');
      printInfo('Ensure render-virginia host is configured in ~/.ssh/config');
      printInfo('Or use WSL: wsl ssh render-virginia');
      process.exit(1);
    }
    spinner.success('SSH connection available');

    if (flags.interactive) {
      printSection('Interactive SSH Session');
      printInfo('Connecting to Render service...');
      printInfo('Type "exit" to disconnect');
      console.log();
      
      await renderSSHInteractive();
    } else if (flags.command) {
      printSection('Remote Command Execution');
      printKeyValue('Command', flags.command as string);
      console.log();
      
      const result = await renderSSH(flags.command as string);
      if (result.success) {
        console.log(result.stdout);
      } else {
        printError(result.stderr || 'Command failed');
        process.exit(1);
      }
    } else {
      printWarning('No action specified');
      printInfo('Use --interactive for shell, or --command "cmd" to run a command');
    }
  },
};

const diskCommand: CommandDef = {
  description: 'Check Render disk usage',
  flags: [
    { name: 'detailed', short: 'd', description: 'Show detailed breakdown', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    printSection('Render Disk Usage');
    
    const spinner = createSpinner({ text: 'Fetching disk usage...' });
    
    try {
      // Get overall disk usage
      const dfResult = await renderSSH('df -h /opt/render');
      if (!dfResult.success) {
        spinner.error('Failed to get disk info');
        printError(dfResult.stderr || 'df command failed');
        process.exit(1);
      }
      
      spinner.success('Disk info retrieved');
      console.log();
      
      // Parse df output
      const lines = dfResult.stdout.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        if (parts.length >= 5) {
          printKeyValue('Filesystem', parts[0]);
          printKeyValue('Size', parts[1]);
          printKeyValue('Used', parts[2]);
          printKeyValue('Available', parts[3]);
          printKeyValue('Use%', parts[4]);
        }
      }

      if (flags.detailed) {
        console.log();
        printSection('Directory Breakdown');
        
        const duResult = await renderSSH('du -sh /opt/render/project/src/* 2>/dev/null | sort -hr | head -20');
        if (duResult.success) {
          console.log(duResult.stdout);
        }
        
        // Check for heap snapshots
        console.log();
        printSection('Heap Snapshots');
        const heapResult = await renderSSH('find /opt/render -name "*.heapsnapshot" -o -name "*.heapdump" 2>/dev/null | head -10');
        if (heapResult.success && heapResult.stdout.trim()) {
          console.log(c.yellow(heapResult.stdout));
          printWarning('Heap files found - consider cleanup');
        } else {
          printSuccess('No heap snapshots found');
        }
      }
    } catch (error) {
      spinner.error('Failed to connect');
      throw error;
    }
  },
};

const cleanupCommand: CommandDef = {
  description: 'Cleanup heap snapshots on Render',
  flags: [
    { name: 'keep', short: 'k', description: 'Number of recent files to keep', type: 'string' },
    { name: 'dry-run', short: 'n', description: 'Show what would be deleted', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    const keepCount = parseInt(flags.keep as string || '3', 10);
    const dryRun = flags['dry-run'] as boolean;

    printSection(dryRun ? 'Cleanup Preview (Dry Run)' : 'Heap Snapshot Cleanup');
    printKeyValue('Keep Recent', `${keepCount} files`);
    console.log();

    const spinner = createSpinner({ text: 'Scanning for heap files...' });
    
    // Find heap files
    const findCmd = 'find /opt/render -name "*.heapsnapshot" -o -name "*.heapdump" 2>/dev/null';
    const findResult = await renderSSH(findCmd);
    
    if (!findResult.success || !findResult.stdout.trim()) {
      spinner.success('No heap files found');
      return;
    }

    const files = findResult.stdout.trim().split('\n').filter(Boolean);
    spinner.success(`Found ${files.length} heap file(s)`);

    if (files.length <= keepCount) {
      printInfo(`Only ${files.length} files found, keeping all`);
      return;
    }

    const toDelete = files.slice(keepCount);
    console.log();
    printKeyValue('Files to delete', toDelete.length.toString());

    for (const file of toDelete) {
      console.log(c.red(`  - ${file}`));
    }

    if (dryRun) {
      console.log();
      printInfo('Dry run - no files deleted');
      printInfo('Remove --dry-run to actually delete');
      return;
    }

    console.log();
    const progress = createProgressBar({ total: toDelete.length });
    
    let deleted = 0;
    for (const file of toDelete) {
      const rmResult = await renderSSH(`rm -f "${file}"`);
      if (rmResult.success) {
        deleted++;
      }
      progress.tick(file);
    }

    progress.complete();
    console.log();
    printSuccess(`Deleted ${deleted}/${toDelete.length} files`);
  },
};

const logsCommand: CommandDef = {
  description: 'View recent service logs (via SSH)',
  flags: [
    { name: 'lines', short: 'n', description: 'Number of lines to show', type: 'string' },
    { name: 'follow', short: 'f', description: 'Follow log output', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    const lines = flags.lines || '50';
    const follow = flags.follow as boolean;

    printSection('Service Logs');
    printInfo('Fetching logs via SSH...');
    console.log();

    if (follow) {
      // Interactive follow mode
      printWarning('Following logs - press Ctrl+C to stop');
      await renderSSHInteractive();
    } else {
      // Fetch recent logs
      const logCmd = `journalctl -n ${lines} --no-pager 2>/dev/null || tail -n ${lines} /var/log/syslog 2>/dev/null || echo "Log access not available"`;
      const result = await renderSSH(logCmd);
      
      if (result.success) {
        console.log(result.stdout);
      } else {
        printWarning('Could not fetch logs');
        printInfo('Use Loki for production log access: npx tsx scripts/observe/logs.ts');
      }
    }
  },
};

const infoCommand: CommandDef = {
  description: 'Show Render environment info',
  run: async () => {
    printSection('Render Environment');
    
    const spinner = createSpinner({ text: 'Fetching environment info...' });
    
    const commands = [
      { name: 'Node Version', cmd: 'node --version' },
      { name: 'NPM Version', cmd: 'npm --version' },
      { name: 'Working Directory', cmd: 'pwd' },
      { name: 'User', cmd: 'whoami' },
      { name: 'Memory', cmd: 'free -h | head -2' },
    ];

    const results: { name: string; value: string }[] = [];
    
    for (const { name, cmd } of commands) {
      const result = await renderSSH(cmd);
      results.push({
        name,
        value: result.success ? result.stdout.trim().split('\n')[0] : 'N/A',
      });
    }

    spinner.success('Info retrieved');
    console.log();

    for (const { name, value } of results) {
      printKeyValue(name, value);
    }

    console.log();
    printSection('Path Structure');
    printInfo('Render clones to /opt/render/project/src/');
    printInfo('This creates nested structure: /opt/render/project/src/src/');
    printInfo('Working directory for commands: /opt/render/project/src/');
  },
};

// ============================================================================
// CLI Setup
// ============================================================================

// Convert command objects to array format with name and handler
const commands: CommandDef[] = [
  {
    name: 'status',
    description: 'Show Render service matrix',
    handler: statusCommand.run!,
  },
  {
    name: 'ssh',
    description: 'SSH into Render service',
    flags: sshCommand.flags,
    handler: sshCommand.run!,
  },
  {
    name: 'disk',
    description: 'Check Render disk usage',
    flags: diskCommand.flags,
    handler: diskCommand.run!,
  },
  {
    name: 'cleanup',
    description: 'Cleanup heap snapshots on Render',
    flags: cleanupCommand.flags,
    handler: cleanupCommand.run!,
  },
  {
    name: 'logs',
    description: 'View recent service logs (via SSH)',
    flags: logsCommand.flags,
    handler: logsCommand.run!,
  },
  {
    name: 'info',
    description: 'Show Render environment info',
    handler: infoCommand.run!,
  },
];

createCLI({
  name: 'render',
  description: 'Render operations CLI (SSH-only, no API calls)',
  version: '1.0.0',
  commands,
});

// ============================================================================
// Entry Point — CLI runs automatically via createCLI
// ============================================================================
