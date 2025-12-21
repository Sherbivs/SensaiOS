#!/usr/bin/env npx tsx
/**
 * Observability Logs CLI
 * 
 * Query and view production logs from Loki.
 * 
 * @usage npx tsx scripts/observe/logs.ts <command> [options]
 * @example
 *   npx tsx scripts/observe/logs.ts query -s stats-logger -n 50
 *   npx tsx scripts/observe/logs.ts services
 *   npx tsx scripts/observe/logs.ts status
 * 
 * @module scripts/observe/logs
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
  getEnv,
  type CommandDef,
} from '../lib/index.js';

// ============================================================================
// Constants
// ============================================================================

const LOKI_URL = getEnv('LOKI_URL', 'http://localhost:3100');
const GRAFANA_URL = getEnv('GRAFANA_URL', 'http://localhost:3000');

const KNOWN_SERVICES = [
  'stats-logger',
  'infinity-gauntlet',
  'security-bot',
  'cache-worker',
  'outbox-worker',
  'data-pipeline',
] as const;

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

// ============================================================================
// Types
// ============================================================================

interface LokiQueryResponse {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      stream: Record<string, string>;
      values: Array<[string, string]>;
    }>;
  };
}

interface LogEntry {
  timestamp: Date;
  service: string;
  level: string;
  message: string;
}

// ============================================================================
// Loki Client
// ============================================================================

async function lokiRequest(endpoint: string): Promise<unknown> {
  const url = `${LOKI_URL}${endpoint}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Loki request failed: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function checkLokiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${LOKI_URL}/ready`);
    return response.ok;
  } catch {
    return false;
  }
}

async function queryLogs(
  query: string,
  options: { limit?: number; start?: number; end?: number } = {}
): Promise<LogEntry[]> {
  const { limit = 100, start, end } = options;
  
  const now = Date.now() * 1_000_000; // nanoseconds
  const defaultStart = now - (3 * 60 * 60 * 1_000_000_000); // 3 hours ago
  
  const params = new URLSearchParams({
    query,
    limit: limit.toString(),
    start: (start ?? defaultStart).toString(),
    end: (end ?? now).toString(),
  });

  const data = await lokiRequest(`/loki/api/v1/query_range?${params}`) as LokiQueryResponse;
  
  const entries: LogEntry[] = [];
  
  for (const result of data.data.result) {
    const service = result.stream.service || 'unknown';
    const level = result.stream.level || 'info';
    
    for (const [timestampNs, message] of result.values) {
      entries.push({
        timestamp: new Date(parseInt(timestampNs) / 1_000_000),
        service,
        level,
        message,
      });
    }
  }
  
  // Sort by timestamp descending (most recent first)
  return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

// ============================================================================
// Formatters
// ============================================================================

function formatLogLevel(level: string): string {
  switch (level.toLowerCase()) {
    case 'error': return c.red(level.toUpperCase().padEnd(5));
    case 'warn': return c.yellow(level.toUpperCase().padEnd(5));
    case 'info': return c.blue(level.toUpperCase().padEnd(5));
    case 'debug': return c.gray(level.toUpperCase().padEnd(5));
    default: return level.padEnd(5);
  }
}

function formatTimestamp(date: Date): string {
  return c.gray(date.toISOString().replace('T', ' ').substring(0, 19));
}

function formatService(service: string): string {
  return c.cyan(service.padEnd(15));
}

function printLogEntry(entry: LogEntry): void {
  const ts = formatTimestamp(entry.timestamp);
  const level = formatLogLevel(entry.level);
  const service = formatService(entry.service);
  
  console.log(`${ts} ${level} ${service} ${entry.message}`);
}

// ============================================================================
// Commands
// ============================================================================

const statusCommand: CommandDef = {
  description: 'Check Loki and Grafana status',
  run: async () => {
    printSection('Observability Stack Status');
    
    // Check Loki
    const lokiSpinner = createSpinner({ text: 'Checking Loki...' });
    const lokiHealthy = await checkLokiHealth();
    
    if (lokiHealthy) {
      lokiSpinner.success(`Loki: ${c.green('Ready')} (${LOKI_URL})`);
    } else {
      lokiSpinner.error(`Loki: ${c.red('Unavailable')} (${LOKI_URL})`);
    }

    // Check Grafana
    const grafanaSpinner = createSpinner({ text: 'Checking Grafana...' });
    try {
      const response = await fetch(`${GRAFANA_URL}/api/health`);
      if (response.ok) {
        grafanaSpinner.success(`Grafana: ${c.green('Ready')} (${GRAFANA_URL})`);
      } else {
        grafanaSpinner.warn(`Grafana: ${c.yellow('Degraded')} (${GRAFANA_URL})`);
      }
    } catch {
      grafanaSpinner.error(`Grafana: ${c.red('Unavailable')} (${GRAFANA_URL})`);
    }

    console.log();
    printSection('Quick Links');
    printKeyValue('Grafana Explore', `${GRAFANA_URL}/explore`);
    printKeyValue('Loki API', `${LOKI_URL}/loki/api/v1/query`);
    
    if (!lokiHealthy) {
      console.log();
      printWarning('Loki not available. Start with:');
      printInfo('  docker-compose -f docker-compose.loki.yml up -d');
    }
  },
};

const servicesCommand: CommandDef = {
  description: 'List known log services',
  run: async () => {
    printSection('Known Log Services');
    
    for (const service of KNOWN_SERVICES) {
      console.log(`  ${c.cyan('•')} ${service}`);
    }
    
    console.log();
    printInfo('Query with: logs query -s <service>');
    
    // Try to get actual labels from Loki
    const spinner = createSpinner({ text: 'Fetching active services from Loki...' });
    
    try {
      const data = await lokiRequest('/loki/api/v1/label/service/values') as { data: string[] };
      spinner.success('Active services retrieved');
      
      if (data.data && data.data.length > 0) {
        console.log();
        printSection('Active Services in Loki');
        for (const service of data.data) {
          console.log(`  ${c.green('•')} ${service}`);
        }
      }
    } catch {
      spinner.warn('Could not fetch from Loki (is it running?)');
    }
  },
};

const queryCommand: CommandDef = {
  description: 'Query logs from Loki',
  flags: [
    { name: 'service', short: 's', description: 'Service name to query', type: 'string' },
    { name: 'level', short: 'l', description: 'Log level filter', type: 'string' },
    { name: 'limit', short: 'n', description: 'Number of logs to return', type: 'string' },
    { name: 'hours', short: 'h', description: 'Hours of history to query', type: 'string' },
    { name: 'raw', short: 'r', description: 'Show raw LogQL query', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    const service = flags.service as string | undefined;
    const level = flags.level as string | undefined;
    const limit = parseInt(flags.limit as string || '50', 10);
    const hours = parseInt(flags.hours as string || '3', 10);
    const showRaw = flags.raw as boolean;

    // Build LogQL query
    const labels: string[] = [];
    if (service) labels.push(`service="${service}"`);
    if (level) labels.push(`level="${level}"`);
    
    const query = labels.length > 0 
      ? `{${labels.join(', ')}}`
      : '{service=~".+"}'; // Match any service

    if (showRaw) {
      printSection('LogQL Query');
      console.log(c.cyan(query));
      console.log();
    }

    printSection('Log Query');
    printKeyValue('Service', service || 'all');
    printKeyValue('Level', level || 'all');
    printKeyValue('Limit', limit.toString());
    printKeyValue('Time Range', `Last ${hours} hours`);
    console.log();

    const spinner = createSpinner({ text: 'Querying Loki...' });
    
    try {
      const now = Date.now() * 1_000_000;
      const start = now - (hours * 60 * 60 * 1_000_000_000);
      
      const entries = await queryLogs(query, { limit, start, end: now });
      
      if (entries.length === 0) {
        spinner.warn('No logs found');
        return;
      }
      
      spinner.success(`Found ${entries.length} log entries`);
      console.log();

      // Print logs (oldest first for reading order)
      for (const entry of entries.reverse()) {
        printLogEntry(entry);
      }

      console.log();
      printInfo(`Showing ${entries.length} entries (limit: ${limit})`);
    } catch (error) {
      spinner.error('Query failed');
      if (error instanceof Error) {
        printError(error.message);
      }
      printInfo('Is Loki running? Check with: logs status');
      process.exit(1);
    }
  },
};

const errorsCommand: CommandDef = {
  description: 'Show recent errors across all services',
  flags: [
    { name: 'limit', short: 'n', description: 'Number of errors to show', type: 'string' },
    { name: 'hours', short: 'h', description: 'Hours of history', type: 'string' },
  ],
  run: async ({ flags }) => {
    const limit = parseInt(flags.limit as string || '25', 10);
    const hours = parseInt(flags.hours as string || '24', 10);

    printSection('Recent Errors');
    printKeyValue('Time Range', `Last ${hours} hours`);
    console.log();

    const spinner = createSpinner({ text: 'Querying errors...' });
    
    try {
      const now = Date.now() * 1_000_000;
      const start = now - (hours * 60 * 60 * 1_000_000_000);
      
      const entries = await queryLogs('{level="error"}', { limit, start, end: now });
      
      if (entries.length === 0) {
        spinner.success('No errors found! 🎉');
        return;
      }
      
      spinner.warn(`Found ${entries.length} errors`);
      console.log();

      for (const entry of entries.reverse()) {
        printLogEntry(entry);
      }

      console.log();
      
      // Group by service
      const byService = new Map<string, number>();
      for (const entry of entries) {
        byService.set(entry.service, (byService.get(entry.service) || 0) + 1);
      }
      
      printSection('Errors by Service');
      for (const [svc, count] of [...byService.entries()].sort((a, b) => b[1] - a[1])) {
        printKeyValue(svc, count.toString());
      }
    } catch (error) {
      spinner.error('Query failed');
      if (error instanceof Error) {
        printError(error.message);
      }
      process.exit(1);
    }
  },
};

const openCommand: CommandDef = {
  description: 'Open Grafana in browser',
  run: async () => {
    const url = `${GRAFANA_URL}/explore`;
    printInfo(`Opening ${url}`);
    
    // Cross-platform open
    const { exec } = await import('child_process');
    const cmd = process.platform === 'win32' ? 'start' 
      : process.platform === 'darwin' ? 'open' 
      : 'xdg-open';
    
    exec(`${cmd} ${url}`);
    printSuccess('Grafana opened in browser');
  },
};

// ============================================================================
// CLI Setup
// ============================================================================

createCLI({
  name: 'observe',
  description: 'Observability CLI for Loki/Grafana',
  version: '1.0.0',
  commands: {
    status: statusCommand,
    services: servicesCommand,
    query: queryCommand,
    errors: errorsCommand,
    open: openCommand,
  },
});

// ============================================================================
// Entry Point — CLI runs automatically via createCLI
// ============================================================================
