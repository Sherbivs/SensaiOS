#!/usr/bin/env node
/**
 * logq — CLI Log Query Tool
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * Query, filter, and analyze JSONL logs from stdin or files
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Usage:
 *   # From stdin (pipe from Loki, files, etc.)
 *   cat logs.jsonl | npx ts-node scripts/logq.ts --level error
 *   
 *   # From file
 *   npx ts-node scripts/logq.ts -f logs.jsonl --since 1h
 *   
 *   # Complex query
 *   npx ts-node scripts/logq.ts -f logs.jsonl \
 *     --level error,fatal \
 *     --component database \
 *     --since 30m \
 *     --format pretty
 * 
 * @module scripts/logq
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

import {
  query,
  deserialize,
  tryDeserialize,
  serialize,
  type UniversalEnvelope,
  type OutputFormat,
  LogLevel,
} from '../src/observability/envelope/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// CLI ARGUMENT PARSING
// ═══════════════════════════════════════════════════════════════════════════

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    // Input
    file: { type: 'string', short: 'f', multiple: true },
    
    // Filters
    level: { type: 'string', short: 'l' },
    component: { type: 'string', short: 'c' },
    operation: { type: 'string', short: 'o' },
    service: { type: 'string', short: 's' },
    message: { type: 'string', short: 'm' },
    since: { type: 'string' },
    before: { type: 'string' },
    after: { type: 'string' },
    correlation: { type: 'string' },
    trace: { type: 'string', short: 't' },
    'has-error': { type: 'boolean' },
    'error-code': { type: 'string' },
    tag: { type: 'string', multiple: true },
    
    // Output
    format: { type: 'string', default: 'compact' },
    limit: { type: 'string', short: 'n', default: '100' },
    offset: { type: 'string' },
    sort: { type: 'string', default: 'desc' },
    
    // Aggregation
    count: { type: 'boolean' },
    'group-by': { type: 'string' },
    distinct: { type: 'string' },
    
    // Display
    'no-color': { type: 'boolean' },
    json: { type: 'boolean' },
    stats: { type: 'boolean' },
    
    // Help
    help: { type: 'boolean', short: 'h' },
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// HELP TEXT
// ═══════════════════════════════════════════════════════════════════════════

const HELP = `
logq — CLI Log Query Tool

USAGE:
  cat logs.jsonl | logq [OPTIONS]
  logq -f logs.jsonl [OPTIONS]

INPUT OPTIONS:
  -f, --file <path>     Read from file(s) instead of stdin (can repeat)

FILTER OPTIONS:
  -l, --level <levels>  Filter by level(s): debug,info,warn,error,fatal
  -c, --component <p>   Filter by component (supports wildcards: db*)
  -o, --operation <p>   Filter by operation (supports wildcards)
  -s, --service <name>  Filter by service name
  -m, --message <text>  Search in message (case-insensitive)
  --since <time>        Logs newer than: 5m, 1h, 2d, 1w
  --before <time>       Logs older than timestamp or relative
  --after <time>        Logs newer than timestamp or relative
  --correlation <id>    Filter by exact correlation ID
  -t, --trace <id>      Trace correlation chain (includes children)
  --has-error           Only show logs with errors
  --error-code <code>   Filter by error code
  --tag <tag>           Filter by tag (can repeat)

OUTPUT OPTIONS:
  --format <fmt>        Output format: compact, pretty, json, jsonl, structured
  -n, --limit <num>     Maximum results (default: 100)
  --offset <num>        Skip first N results
  --sort <dir>          Sort direction: asc, desc (default: desc)
  --no-color            Disable colors

AGGREGATION:
  --count               Show count only
  --group-by <field>    Group and count: level, component, operation, service
  --distinct <field>    Show unique values for field

DISPLAY:
  --json                Output raw JSON (alias for --format json)
  --stats               Show query statistics

EXAMPLES:
  # Recent errors
  logq -f app.log --level error --since 1h

  # Database queries
  logq -f app.log --component database --format pretty

  # Trace a request
  logq -f app.log --trace abc-123-def

  # Count by level
  logq -f app.log --group-by level

  # Unique components
  logq -f app.log --distinct component
`;

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT READING
// ═══════════════════════════════════════════════════════════════════════════

async function readLines(source: NodeJS.ReadableStream): Promise<string[]> {
  const rl = createInterface({ input: source, crlfDelay: Infinity });
  const lines: string[] = [];
  
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
  }
  
  return lines;
}

async function readInput(): Promise<UniversalEnvelope<unknown>[]> {
  const lines: string[] = [];
  
  if (values.file && values.file.length > 0) {
    // Read from files
    for (const file of values.file) {
      const fileLines = await readLines(createReadStream(file, 'utf-8'));
      lines.push(...fileLines);
    }
  } else {
    // Read from stdin
    const stdinLines = await readLines(process.stdin);
    lines.push(...stdinLines);
  }
  
  // Parse JSONL
  const envelopes: UniversalEnvelope<unknown>[] = [];
  let parseErrors = 0;
  
  for (const line of lines) {
    const env = tryDeserialize(line);
    if (env) {
      envelopes.push(env);
    } else {
      parseErrors++;
    }
  }
  
  if (parseErrors > 0 && !values['no-color']) {
    console.error(`\x1b[33mWarning: ${parseErrors} lines failed to parse\x1b[0m`);
  }
  
  return envelopes;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY BUILDING
// ═══════════════════════════════════════════════════════════════════════════

function buildQuery(envelopes: UniversalEnvelope<unknown>[]) {
  let q = query(envelopes);
  
  // Level filter
  if (values.level) {
    const levels = values.level.split(',').map(l => l.trim().toUpperCase()) as (keyof typeof LogLevel)[];
    q = q.level(...levels);
  }
  
  // Component filter
  if (values.component) {
    q = q.component(values.component);
  }
  
  // Operation filter
  if (values.operation) {
    q = q.operation(values.operation);
  }
  
  // Service filter
  if (values.service) {
    q = q.service(values.service);
  }
  
  // Message search
  if (values.message) {
    q = q.message(values.message);
  }
  
  // Time filters
  if (values.since) {
    q = q.since(values.since);
  }
  if (values.before) {
    q = q.before(values.before);
  }
  if (values.after) {
    q = q.after(values.after);
  }
  
  // Correlation filters
  if (values.correlation) {
    q = q.correlation(values.correlation);
  }
  if (values.trace) {
    q = q.correlationTrace(values.trace);
  }
  
  // Error filters
  if (values['has-error']) {
    q = q.hasError();
  }
  if (values['error-code']) {
    q = q.errorCode(values['error-code']);
  }
  
  // Tag filter
  if (values.tag && values.tag.length > 0) {
    q = q.tags(...values.tag);
  }
  
  // Sorting
  q = values.sort === 'asc' ? q.oldest() : q.newest();
  
  // Pagination
  const limit = parseInt(values.limit || '100', 10);
  q = q.limit(limit);
  
  if (values.offset) {
    q = q.offset(parseInt(values.offset, 10));
  }
  
  return q;
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

function formatOutput(envelopes: UniversalEnvelope<unknown>[]): void {
  const format = (values.json ? 'json' : values.format || 'compact') as OutputFormat;
  const colorize = !values['no-color'] && process.stdout.isTTY;
  
  for (const env of envelopes) {
    console.log(serialize(env, { format, colorize }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    // Read input
    const envelopes = await readInput();
    
    if (envelopes.length === 0) {
      console.error('No valid log entries found');
      process.exit(1);
    }
    
    // Build and execute query
    const q = buildQuery(envelopes);
    
    // Handle aggregation modes
    if (values['group-by']) {
      const groups = q.groupBy(values['group-by'] as 'level' | 'component' | 'operation' | 'service');
      const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);
      
      console.log(`\nGrouped by ${values['group-by']}:`);
      for (const [key, count] of sorted) {
        console.log(`  ${key}: ${count}`);
      }
      console.log(`\nTotal: ${sorted.reduce((sum, [, c]) => sum + c, 0)}`);
      return;
    }
    
    if (values.distinct) {
      const unique = q.distinct(values.distinct as 'level' | 'component' | 'operation' | 'service');
      console.log(`\nDistinct ${values.distinct} values (${unique.length}):`);
      for (const val of unique.sort()) {
        console.log(`  ${val}`);
      }
      return;
    }
    
    if (values.count) {
      const result = q.execute();
      console.log(result.total);
      return;
    }
    
    // Execute and output
    const result = q.execute();
    
    // Show stats if requested
    if (values.stats) {
      console.error(`\n--- Query Stats ---`);
      console.error(`Total matches: ${result.total}`);
      console.error(`Returned: ${result.items.length}`);
      console.error(`Execution time: ${result.executionTimeMs.toFixed(2)}ms`);
      console.error(`Filters: ${result.filters.join(', ') || 'none'}`);
      console.error(`-------------------\n`);
    }
    
    formatOutput(result.items);
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
