/**
 * Console Migration Helper
 * 
 * Provides utilities for migrating raw console.* calls to the envelope system.
 * This is a non-breaking bridge that allows incremental migration.
 * 
 * @module observability/envelope/migrate
 * @example
 * // In any file, replace:
 * import { console } from '../../observability/envelope/migrate.js';
 * 
 * // Then all console.log/warn/error calls automatically use envelopes
 * console.log('Starting server');           // → envelope with level INFO
 * console.warn('High memory', { usage });   // → envelope with level WARN
 * console.error('Failed', error);           // → envelope with level ERROR
 */

import { createLog } from './factory.js';
import { serialize, type OutputFormat, type SerializeOptions } from './serializer.js';
import { LogLevel, type LogEnvelope, type LogLevelType } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface MigrationConsoleConfig {
  /** Component name for all logs from this console */
  component: string;
  /** Default operation when not specified */
  defaultOperation: string;
  /** Output format */
  format: OutputFormat;
  /** Whether to also call original console for debugging */
  passthrough: boolean;
  /** Custom output function (default: process.stdout.write) */
  output?: (message: string) => void;
  /** Whether migration is enabled (false = use original console) */
  enabled: boolean;
}

const defaultConfig: MigrationConsoleConfig = {
  component: 'migrated',
  defaultOperation: 'console',
  format: process.env.NODE_ENV === 'production' ? 'jsonl' : 'pretty',
  passthrough: process.env.NODE_ENV !== 'production',
  enabled: true,
};

let globalConfig: MigrationConsoleConfig = { ...defaultConfig };

/**
 * Configure the migration console globally
 */
export function configureMigration(config: Partial<MigrationConsoleConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Reset migration config to defaults
 */
export function resetMigrationConfig(): void {
  globalConfig = { ...defaultConfig };
}

// ═══════════════════════════════════════════════════════════════════════════
// ARGUMENT PARSING
// ═══════════════════════════════════════════════════════════════════════════

interface ParsedArgs {
  message: string;
  data?: Record<string, unknown>;
  error?: Error;
}

/**
 * Parse console.log style arguments into structured format
 * 
 * Supports:
 * - console.log('message')
 * - console.log('message', data)
 * - console.log('message', data1, data2)
 * - console.log(error)
 * - console.log('message', error)
 * - console.log('%s %d', 'hello', 42)  // printf-style
 */
function parseArgs(args: unknown[]): ParsedArgs {
  if (args.length === 0) {
    return { message: '' };
  }

  const first = args[0];
  
  // Single error
  if (first instanceof Error) {
    return {
      message: first.message,
      error: first,
      data: { stack: first.stack },
    };
  }

  // String message
  if (typeof first === 'string') {
    // Check for printf-style formatting
    if (first.includes('%s') || first.includes('%d') || first.includes('%o') || first.includes('%j')) {
      return {
        message: formatPrintf(first, args.slice(1)),
        data: args.length > 1 ? { args: args.slice(1) } : undefined,
      };
    }

    // Regular string with optional data
    const rest = args.slice(1);
    const data: Record<string, unknown> = {};
    let error: Error | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg instanceof Error) {
        error = arg;
        data.error = { name: arg.name, message: arg.message, stack: arg.stack };
      } else if (typeof arg === 'object' && arg !== null) {
        Object.assign(data, arg);
      } else {
        data[`arg${i}`] = arg;
      }
    }

    return {
      message: first,
      data: Object.keys(data).length > 0 ? data : undefined,
      error,
    };
  }

  // Object first (common pattern: console.log({ foo, bar }))
  if (typeof first === 'object' && first !== null) {
    return {
      message: JSON.stringify(first),
      data: first as Record<string, unknown>,
    };
  }

  // Primitive
  return {
    message: String(first),
    data: args.length > 1 ? { args: args.slice(1) } : undefined,
  };
}

/**
 * Format printf-style string
 */
function formatPrintf(format: string, args: unknown[]): string {
  let argIndex = 0;
  return format.replace(/%[sdojc%]/g, (match) => {
    if (match === '%%') return '%';
    if (argIndex >= args.length) return match;
    
    const arg = args[argIndex++];
    switch (match) {
      case '%s': return String(arg);
      case '%d': return Number(arg).toString();
      case '%o': return JSON.stringify(arg);
      case '%j': return JSON.stringify(arg);
      case '%c': return ''; // CSS (browser only, ignore)
      default: return match;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION CONSOLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a migration-aware console replacement
 * 
 * @example
 * const console = createMigrationConsole({ component: 'database' });
 * console.log('Connected');  // Outputs structured envelope
 */
export function createMigrationConsole(config?: Partial<MigrationConsoleConfig>) {
  const cfg = { ...globalConfig, ...config };
  
  const write = (envelope: LogEnvelope<unknown>) => {
    const output = cfg.output ?? ((msg: string) => process.stdout.write(msg + '\n'));
    const serializeOpts: SerializeOptions = { format: cfg.format };
    output(serialize(envelope, serializeOpts));
  };

  const createMethod = (level: LogLevelType) => {
    return (...args: unknown[]) => {
      if (!cfg.enabled) {
        // Fall back to original console
        const originalMethod = level === LogLevel.DEBUG ? globalThis.console.debug
          : level === LogLevel.INFO ? globalThis.console.info
          : level === LogLevel.WARN ? globalThis.console.warn
          : level === LogLevel.ERROR ? globalThis.console.error
          : level === LogLevel.FATAL ? globalThis.console.error
          : globalThis.console.log;
        originalMethod.apply(globalThis.console, args);
        return;
      }

      const parsed = parseArgs(args);
      // Include error in data if present
      const envelopeData = parsed.error 
        ? { ...parsed.data, _error: { message: parsed.error.message, stack: parsed.error.stack } }
        : parsed.data;
      const envelope = createLog(
        level,
        cfg.component,
        cfg.defaultOperation,
        parsed.message,
        envelopeData
      );
      
      write(envelope);
      
      // Passthrough to original console for debugging
      if (cfg.passthrough) {
        const originalMethod = level === LogLevel.DEBUG ? globalThis.console.debug
          : level === LogLevel.INFO ? globalThis.console.info
          : level === LogLevel.WARN ? globalThis.console.warn
          : level === LogLevel.ERROR ? globalThis.console.error
          : level === LogLevel.FATAL ? globalThis.console.error
          : globalThis.console.log;
        originalMethod.apply(globalThis.console, args);
      }
    };
  };

  return {
    // Standard console methods
    log: createMethod(LogLevel.INFO),
    info: createMethod(LogLevel.INFO),
    warn: createMethod(LogLevel.WARN),
    error: createMethod(LogLevel.ERROR),
    debug: createMethod(LogLevel.DEBUG),
    
    // Additional methods
    trace: createMethod(LogLevel.DEBUG),
    fatal: createMethod(LogLevel.FATAL),
    
    // Console-specific methods (passthrough only)
    dir: (...args: unknown[]) => globalThis.console.dir(...args),
    table: (...args: unknown[]) => globalThis.console.table(...args),
    time: (label?: string) => globalThis.console.time(label),
    timeEnd: (label?: string) => globalThis.console.timeEnd(label),
    timeLog: (label?: string, ...args: unknown[]) => globalThis.console.timeLog(label, ...args),
    group: (...args: unknown[]) => globalThis.console.group(...args),
    groupEnd: () => globalThis.console.groupEnd(),
    groupCollapsed: (...args: unknown[]) => globalThis.console.groupCollapsed(...args),
    clear: () => globalThis.console.clear(),
    count: (label?: string) => globalThis.console.count(label),
    countReset: (label?: string) => globalThis.console.countReset(label),
    assert: (condition?: boolean, ...args: unknown[]) => globalThis.console.assert(condition, ...args),
    
    // Configuration
    configure: (newConfig: Partial<MigrationConsoleConfig>) => {
      Object.assign(cfg, newConfig);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT (DROP-IN REPLACEMENT)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Drop-in console replacement
 * 
 * Import this as `console` to automatically migrate all console calls:
 * 
 * @example
 * import { console } from '../../observability/envelope/migrate.js';
 * 
 * console.log('Hello world');  // Now outputs structured envelope
 */
export const console = createMigrationConsole();

// ═══════════════════════════════════════════════════════════════════════════
// FILE-SPECIFIC CONSOLES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-configured consoles for common file types
 */
export const migrationConsoles = {
  /** For database scripts */
  database: createMigrationConsole({ component: 'database', defaultOperation: 'script' }),
  
  /** For CLI tools */
  cli: createMigrationConsole({ component: 'cli', defaultOperation: 'command' }),
  
  /** For security scripts */
  security: createMigrationConsole({ component: 'security', defaultOperation: 'script' }),
  
  /** For data pipeline */
  data: createMigrationConsole({ component: 'data-pipeline', defaultOperation: 'process' }),
  
  /** For bot operations */
  bot: createMigrationConsole({ component: 'bot', defaultOperation: 'handler' }),
  
  /** For worker processes */
  worker: createMigrationConsole({ component: 'worker', defaultOperation: 'task' }),
  
  /** For tests */
  test: createMigrationConsole({ 
    component: 'test', 
    defaultOperation: 'spec',
    format: 'pretty',
    passthrough: true,
  }),
};

// ═══════════════════════════════════════════════════════════════════════════
// CODEMOD HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate the import statement to add to a file
 */
export function generateImportStatement(component: string): string {
  return `import { createMigrationConsole } from '../../observability/envelope/migrate.js';
const console = createMigrationConsole({ component: '${component}' });
`;
}

/**
 * Detect the component name from a file path
 */
export function detectComponent(filePath: string): string {
  const parts = filePath.toLowerCase().split(/[/\\]/);
  
  // Check for known directories
  if (parts.includes('database') || parts.includes('db')) return 'database';
  if (parts.includes('security')) return 'security';
  if (parts.includes('bot')) return 'bot';
  if (parts.includes('cli')) return 'cli';
  if (parts.includes('worker') || parts.includes('workers')) return 'worker';
  if (parts.includes('data') || parts.includes('data_pipeline')) return 'data-pipeline';
  if (parts.includes('cache')) return 'cache';
  if (parts.includes('api')) return 'api';
  if (parts.includes('test') || parts.includes('tests')) return 'test';
  if (parts.includes('scripts')) return 'script';
  
  // Default to last directory name
  const lastDir = parts.filter(p => !p.includes('.')).pop();
  return lastDir || 'app';
}

/**
 * Migration statistics for a file
 */
export interface MigrationStats {
  filePath: string;
  component: string;
  consoleCalls: number;
  importAdded: boolean;
  migrated: boolean;
}

/**
 * Analyze a file for console migration
 */
export function analyzeFile(content: string, filePath: string): MigrationStats {
  const consoleCalls = (content.match(/console\.(log|info|warn|error|debug)\s*\(/g) || []).length;
  const hasImport = content.includes('observability/envelope/migrate');
  
  return {
    filePath,
    component: detectComponent(filePath),
    consoleCalls,
    importAdded: hasImport,
    migrated: hasImport && consoleCalls > 0,
  };
}
