#!/usr/bin/env npx tsx
/**
 * Docker Management CLI
 * 
 * TypeScript CLI for Docker container management, building,
 * and compose operations.
 * 
 * @usage npx tsx scripts/docker/cli.ts <command> [options]
 * @example
 *   npx tsx scripts/docker/cli.ts build
 *   npx tsx scripts/docker/cli.ts run
 *   npx tsx scripts/docker/cli.ts logs
 *   npx tsx scripts/docker/cli.ts compose up
 * 
 * @module scripts/docker/cli
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
  type CommandDef,
} from '../lib/index.js';

// ============================================================================
// Constants
// ============================================================================

const PROJECT_NAME = 'infinity-gauntlet';
const DOCKERFILE_PATH = 'Dockerfile';
const COMPOSE_FILE = 'docker-compose.yml';
const LOKI_COMPOSE_FILE = 'docker-compose.loki.yml';

// ============================================================================
// Docker Helpers
// ============================================================================

async function checkDocker(): Promise<boolean> {
  try {
    await exec('docker', ['version', '--format', '{{.Server.Version}}']);
    return true;
  } catch {
    return false;
  }
}

async function getContainers(all = false): Promise<string[]> {
  const args = ['ps', '--format', '{{.Names}}'];
  if (all) args.push('-a');
  
  const result = await exec('docker', args);
  return result.stdout.trim().split('\n').filter(Boolean);
}

async function getImages(): Promise<{ repository: string; tag: string; size: string }[]> {
  const result = await exec('docker', ['images', '--format', '{{.Repository}}|{{.Tag}}|{{.Size}}']);
  return result.stdout.trim().split('\n').filter(Boolean).map(line => {
    const [repository, tag, size] = line.split('|');
    return { repository, tag, size };
  });
}

async function getContainerStatus(name: string): Promise<{ status: string; health: string } | null> {
  try {
    const result = await exec('docker', [
      'inspect', name,
      '--format', '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
    ]);
    const [status, health] = result.stdout.trim().split('|');
    return { status, health };
  } catch {
    return null;
  }
}

// ============================================================================
// Commands
// ============================================================================

const buildCommand: CommandDef = {
  description: 'Build Docker image',
  flags: [
    { name: 'tag', short: 't', description: 'Image tag', type: 'string' },
    { name: 'no-cache', description: 'Build without cache', type: 'boolean' },
    { name: 'platform', description: 'Target platform (e.g., linux/amd64)', type: 'string' },
  ],
  run: async ({ flags }) => {
    const tag = (flags.tag as string) || 'latest';
    const noCache = flags['no-cache'] as boolean;
    const platform = flags.platform as string;

    printSection('Docker Build');
    
    if (!await checkDocker()) {
      printError('Docker is not running');
      process.exit(1);
    }

    if (!await exists(DOCKERFILE_PATH)) {
      printError(`Dockerfile not found: ${DOCKERFILE_PATH}`);
      process.exit(1);
    }

    const imageName = `${PROJECT_NAME}:${tag}`;
    printKeyValue('Image', imageName);
    printKeyValue('Dockerfile', DOCKERFILE_PATH);
    if (noCache) printKeyValue('Cache', 'disabled');
    if (platform) printKeyValue('Platform', platform);
    console.log();

    const args = ['build', '-t', imageName, '.'];
    if (noCache) args.push('--no-cache');
    if (platform) args.push('--platform', platform);

    const spinner = createSpinner({ text: 'Building image...' });
    
    try {
      await exec('docker', args, { cwd: process.cwd() });
      spinner.stop();
      printSuccess(`Image built: ${imageName}`);
    } catch (error) {
      spinner.stop();
      printError('Build failed');
      throw error;
    }
  },
};

const runCommand: CommandDef = {
  description: 'Run Docker container',
  flags: [
    { name: 'tag', short: 't', description: 'Image tag', type: 'string' },
    { name: 'name', short: 'n', description: 'Container name', type: 'string' },
    { name: 'detach', short: 'd', description: 'Run in background', type: 'boolean' },
    { name: 'rm', description: 'Remove container when stopped', type: 'boolean' },
    { name: 'env-file', short: 'e', description: 'Environment file', type: 'string' },
    { name: 'port', short: 'p', description: 'Port mapping (host:container)', type: 'string' },
  ],
  run: async ({ flags }) => {
    const tag = (flags.tag as string) || 'latest';
    const name = (flags.name as string) || PROJECT_NAME;
    const detach = flags.detach as boolean;
    const rm = flags.rm as boolean;
    const envFile = flags['env-file'] as string;
    const port = flags.port as string;

    printSection('Docker Run');
    
    if (!await checkDocker()) {
      printError('Docker is not running');
      process.exit(1);
    }

    const imageName = `${PROJECT_NAME}:${tag}`;
    printKeyValue('Image', imageName);
    printKeyValue('Container', name);
    if (detach) printKeyValue('Mode', 'detached');
    if (envFile) printKeyValue('Env File', envFile);
    if (port) printKeyValue('Port', port);
    console.log();

    const args = ['run'];
    if (name) args.push('--name', name);
    if (detach) args.push('-d');
    if (rm) args.push('--rm');
    if (envFile) args.push('--env-file', envFile);
    if (port) args.push('-p', port);
    args.push(imageName);

    try {
      const result = await exec('docker', args);
      if (detach) {
        printSuccess(`Container started: ${result.stdout.trim().substring(0, 12)}`);
      }
    } catch (error) {
      printError('Failed to start container');
      throw error;
    }
  },
};

const logsCommand: CommandDef = {
  description: 'View container logs',
  args: [
    { name: 'container', description: 'Container name (default: infinity-gauntlet)' },
  ],
  flags: [
    { name: 'follow', short: 'f', description: 'Follow log output', type: 'boolean' },
    { name: 'tail', short: 'n', description: 'Number of lines', type: 'string' },
    { name: 'since', description: 'Show logs since timestamp', type: 'string' },
  ],
  run: async ({ args, flags }) => {
    const container = args[0] || PROJECT_NAME;
    const follow = flags.follow as boolean;
    const tail = flags.tail as string;
    const since = flags.since as string;

    if (!await checkDocker()) {
      printError('Docker is not running');
      process.exit(1);
    }

    const dockerArgs = ['logs'];
    if (follow) dockerArgs.push('-f');
    if (tail) dockerArgs.push('--tail', tail);
    if (since) dockerArgs.push('--since', since);
    dockerArgs.push(container);

    printInfo(`Logs from: ${container}`);
    console.log();

    try {
      const result = await exec('docker', dockerArgs);
      console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);
    } catch (error) {
      printError(`Container not found: ${container}`);
      process.exit(1);
    }
  },
};

const psCommand: CommandDef = {
  description: 'List containers',
  flags: [
    { name: 'all', short: 'a', description: 'Show all containers', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    const all = flags.all as boolean;

    printSection('Docker Containers');
    
    if (!await checkDocker()) {
      printError('Docker is not running');
      process.exit(1);
    }

    const format = '{{.Names}}|{{.Status}}|{{.Image}}|{{.Ports}}';
    const args = ['ps', '--format', format];
    if (all) args.push('-a');

    const result = await exec('docker', args);
    const lines = result.stdout.trim().split('\n').filter(Boolean);

    if (lines.length === 0) {
      printInfo('No containers running');
      return;
    }

    console.log();
    console.log(c.cyan('NAME'.padEnd(25)) + c.cyan('STATUS'.padEnd(20)) + c.cyan('IMAGE'.padEnd(30)) + c.cyan('PORTS'));
    console.log(c.gray('─'.repeat(100)));

    for (const line of lines) {
      const [name, status, image, ports] = line.split('|');
      const statusColor = status.includes('Up') ? c.green : c.yellow;
      console.log(
        name.padEnd(25) +
        statusColor(status.padEnd(20)) +
        image.padEnd(30) +
        (ports || '')
      );
    }
  },
};

const imagesCommand: CommandDef = {
  description: 'List Docker images',
  flags: [
    { name: 'project', description: 'Show only project images', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    const projectOnly = flags.project as boolean;

    printSection('Docker Images');
    
    if (!await checkDocker()) {
      printError('Docker is not running');
      process.exit(1);
    }

    let images = await getImages();
    
    if (projectOnly) {
      images = images.filter(img => img.repository.includes(PROJECT_NAME));
    }

    if (images.length === 0) {
      printInfo('No images found');
      return;
    }

    console.log();
    console.log(c.cyan('REPOSITORY'.padEnd(40)) + c.cyan('TAG'.padEnd(15)) + c.cyan('SIZE'));
    console.log(c.gray('─'.repeat(70)));

    for (const img of images) {
      // Highlight project images in green, others in default (no color function)
      const repoText = img.repository.padEnd(40);
      const displayRepo = img.repository.includes(PROJECT_NAME) ? c.green(repoText) : repoText;
      console.log(
        displayRepo +
        img.tag.padEnd(15) +
        img.size
      );
    }
  },
};

const stopCommand: CommandDef = {
  description: 'Stop container',
  args: [
    { name: 'container', description: 'Container name (default: infinity-gauntlet)' },
  ],
  run: async ({ args }) => {
    const container = args[0] || PROJECT_NAME;

    printSection('Stop Container');
    
    if (!await checkDocker()) {
      printError('Docker is not running');
      process.exit(1);
    }

    const spinner = createSpinner({ text: `Stopping ${container}...` });
    
    try {
      await exec('docker', ['stop', container]);
      spinner.stop();
      printSuccess(`Container stopped: ${container}`);
    } catch {
      spinner.stop();
      printError(`Container not found: ${container}`);
      process.exit(1);
    }
  },
};

const rmCommand: CommandDef = {
  description: 'Remove container',
  args: [
    { name: 'container', description: 'Container name (default: infinity-gauntlet)' },
  ],
  flags: [
    { name: 'force', short: 'f', description: 'Force removal', type: 'boolean' },
  ],
  run: async ({ args, flags }) => {
    const container = args[0] || PROJECT_NAME;
    const force = flags.force as boolean;

    printSection('Remove Container');
    
    if (!await checkDocker()) {
      printError('Docker is not running');
      process.exit(1);
    }

    const dockerArgs = ['rm'];
    if (force) dockerArgs.push('-f');
    dockerArgs.push(container);

    try {
      await exec('docker', dockerArgs);
      printSuccess(`Container removed: ${container}`);
    } catch {
      printError(`Failed to remove: ${container}`);
      process.exit(1);
    }
  },
};

const composeCommand: CommandDef = {
  description: 'Docker Compose operations',
  args: [
    { name: 'action', description: 'up|down|logs|ps|restart', required: true },
  ],
  flags: [
    { name: 'file', short: 'f', description: 'Compose file', type: 'string' },
    { name: 'loki', description: 'Use Loki compose file', type: 'boolean' },
    { name: 'detach', short: 'd', description: 'Detached mode for up', type: 'boolean' },
  ],
  run: async ({ args, flags }) => {
    const action = args[0];
    const useLoki = flags.loki as boolean;
    const detach = flags.detach as boolean;
    let file = flags.file as string;

    if (!file) {
      file = useLoki ? LOKI_COMPOSE_FILE : COMPOSE_FILE;
    }

    printSection(`Docker Compose: ${action}`);
    
    if (!await checkDocker()) {
      printError('Docker is not running');
      process.exit(1);
    }

    if (!await exists(file)) {
      printError(`Compose file not found: ${file}`);
      process.exit(1);
    }

    printKeyValue('File', file);
    console.log();

    const composeArgs = ['-f', file];

    switch (action) {
      case 'up':
        composeArgs.push('up');
        if (detach) composeArgs.push('-d');
        break;
      case 'down':
        composeArgs.push('down');
        break;
      case 'logs':
        composeArgs.push('logs', '-f');
        break;
      case 'ps':
        composeArgs.push('ps');
        break;
      case 'restart':
        composeArgs.push('restart');
        break;
      default:
        printError(`Unknown action: ${action}`);
        printInfo('Valid actions: up, down, logs, ps, restart');
        process.exit(1);
    }

    try {
      // Try docker compose first, fall back to docker-compose
      try {
        const result = await exec('docker', ['compose', ...composeArgs]);
        console.log(result.stdout);
      } catch {
        const result = await exec('docker-compose', composeArgs);
        console.log(result.stdout);
      }
    } catch (error) {
      printError(`Compose ${action} failed`);
      throw error;
    }
  },
};

const cleanCommand: CommandDef = {
  description: 'Clean up Docker resources',
  flags: [
    { name: 'all', short: 'a', description: 'Remove all unused resources', type: 'boolean' },
    { name: 'images', description: 'Remove dangling images', type: 'boolean' },
    { name: 'containers', description: 'Remove stopped containers', type: 'boolean' },
    { name: 'volumes', description: 'Remove unused volumes', type: 'boolean' },
    { name: 'force', short: 'f', description: 'Skip confirmation', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    const all = flags.all as boolean;
    const images = flags.images as boolean;
    const containers = flags.containers as boolean;
    const volumes = flags.volumes as boolean;

    printSection('Docker Cleanup');
    
    if (!await checkDocker()) {
      printError('Docker is not running');
      process.exit(1);
    }

    if (all || (!images && !containers && !volumes)) {
      printInfo('Removing all unused resources...');
      await exec('docker', ['system', 'prune', '-f']);
      printSuccess('Cleanup complete');
      return;
    }

    if (containers) {
      printInfo('Removing stopped containers...');
      await exec('docker', ['container', 'prune', '-f']);
    }

    if (images) {
      printInfo('Removing dangling images...');
      await exec('docker', ['image', 'prune', '-f']);
    }

    if (volumes) {
      printInfo('Removing unused volumes...');
      await exec('docker', ['volume', 'prune', '-f']);
    }

    printSuccess('Cleanup complete');
  },
};

const statusCommand: CommandDef = {
  description: 'Show Docker system status',
  run: async () => {
    printSection('Docker Status');
    
    if (!await checkDocker()) {
      printError('Docker is not running');
      process.exit(1);
    }

    // Docker version
    const version = await exec('docker', ['version', '--format', '{{.Server.Version}}']);
    printKeyValue('Docker Version', version.stdout.trim());

    // Disk usage
    const dfResult = await exec('docker', ['system', 'df', '--format', '{{.Type}}|{{.Size}}|{{.Reclaimable}}']);
    console.log();
    console.log(c.cyan('TYPE'.padEnd(15)) + c.cyan('SIZE'.padEnd(15)) + c.cyan('RECLAIMABLE'));
    console.log(c.gray('─'.repeat(45)));
    
    for (const line of dfResult.stdout.trim().split('\n').filter(Boolean)) {
      const [type, size, reclaimable] = line.split('|');
      console.log(type.padEnd(15) + size.padEnd(15) + reclaimable);
    }

    // Running containers
    const containers = await getContainers();
    console.log();
    printKeyValue('Running Containers', containers.length.toString());

    // Project-specific containers
    const projectContainers = containers.filter(c => c.includes(PROJECT_NAME));
    if (projectContainers.length > 0) {
      console.log();
      printInfo('Project Containers:');
      for (const container of projectContainers) {
        const status = await getContainerStatus(container);
        if (status) {
          const statusIcon = status.status === 'running' ? c.green('●') : c.yellow('○');
          console.log(`  ${statusIcon} ${container} — ${status.status}`);
        }
      }
    }
  },
};

// ============================================================================
// CLI Setup
// ============================================================================

createCLI({
  name: 'docker',
  description: 'Docker management CLI',
  version: '1.0.0',
  commands: {
    build: buildCommand,
    run: runCommand,
    logs: logsCommand,
    ps: psCommand,
    images: imagesCommand,
    stop: stopCommand,
    rm: rmCommand,
    compose: composeCommand,
    clean: cleanCommand,
    status: statusCommand,
  },
});

// ============================================================================
// Entry Point — CLI runs automatically via createCLI
// ============================================================================
