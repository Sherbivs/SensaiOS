/* eslint-disable no-console */
/**
 * CLI Framework Library
 * 
 * Lightweight command-line interface framework with help generation.
 * No external dependencies (unlike commander.js).
 * 
 * @module scripts/lib/cli
 * @since 2025-12-21
 */

import { c, printError } from './output.js';
import { handleError } from './errors.js';

// ============================================================================
// Types
// ============================================================================

export interface FlagDef {
  /** Short flag (-v) */
  short?: string;
  /** Long flag (--verbose) - alternative to 'name' */
  long?: string;
  /** Flag name (alternative to 'long') */
  name?: string;
  /** Description for help */
  description: string;
  /** Flag takes a value - use 'type: string' as alternative */
  value?: boolean;
  /** Type of the flag value */
  type?: 'string' | 'boolean';
  /** Default value */
  default?: string | boolean;
}

export interface ArgDef {
  /** Argument name */
  name: string;
  /** Description for help */
  description: string;
  /** Required argument */
  required?: boolean;
  /** Default value */
  default?: string;
}

export interface CommandDef {
  /** Command name */
  name?: string;
  /** Command description */
  description: string;
  /** Command aliases */
  aliases?: string[];
  /** Positional arguments */
  args?: ArgDef[];
  /** Flag definitions */
  flags?: FlagDef[];
  /** Command handler - primary method */
  handler?: (ctx: CommandContext) => Promise<void> | void;
  /** Command run function - alternative to handler */
  run?: (ctx: CommandContext) => Promise<void> | void;
}

export interface CommandContext {
  /** Positional arguments */
  args: string[];
  /** Parsed flags */
  flags: Record<string, string | boolean>;
  /** Raw argv */
  argv: string[];
  /** Command name that was invoked */
  command: string;
}

export interface CLIOptions {
  /** CLI name */
  name: string;
  /** CLI version */
  version?: string;
  /** CLI description */
  description?: string;
  /** Commands - can be array or object with command names as keys */
  commands: CommandDef[] | Record<string, Omit<CommandDef, 'name'>>;
  /** Global flags */
  globalFlags?: FlagDef[];
}

// ============================================================================
// Command Normalization
// ============================================================================

/**
 * Get the effective long flag name from a FlagDef
 * Supports both 'long' and 'name' properties
 */
function getFlagLong(flag: FlagDef): string {
  const name = flag.long || flag.name || '';
  return name.startsWith('--') ? name : `--${name}`;
}

/**
 * Normalize flag definitions to consistent format
 */
function normalizeFlag(flag: FlagDef): FlagDef {
  return {
    ...flag,
    long: getFlagLong(flag),
    value: flag.value ?? flag.type === 'string',
  };
}

/**
 * Normalize commands to array format
 * Supports both array format and object format with names as keys
 */
function normalizeCommands(
  commands: CommandDef[] | Record<string, Omit<CommandDef, 'name'>>
): CommandDef[] {
  if (Array.isArray(commands)) {
    return commands.map(cmd => ({
      ...cmd,
      handler: cmd.handler || cmd.run,
      flags: cmd.flags?.map(normalizeFlag),
    }));
  }
  
  // Convert object format { name: def } to array format
  return Object.entries(commands).map(([name, def]) => ({
    name,
    ...def,
    // Support both 'handler' and 'run' for flexibility
    handler: def.handler || def.run,
    flags: def.flags?.map(normalizeFlag),
  }));
}

// ============================================================================
// Argument Parsing
// ============================================================================

/**
 * Parse command line arguments
 */
export function parseArgs(
  argv: string[],
  flagDefs: FlagDef[] = []
): { args: string[]; flags: Record<string, string | boolean> } {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  // Set defaults
  for (const def of flagDefs) {
    if (def.default !== undefined && def.long) {
      flags[def.long.replace(/^--/, '')] = def.default;
    }
  }

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      // Long flag
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        // --flag=value
        const key = arg.slice(2, eqIndex);
        flags[key] = arg.slice(eqIndex + 1);
      } else {
        const key = arg.slice(2);
        const def = flagDefs.find(f => f.long === `--${key}` || f.long === key);
        
        if (def?.value && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          // --flag value
          flags[key] = argv[++i];
        } else {
          // --flag (boolean)
          flags[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Short flag
      const short = arg;
      const def = flagDefs.find(f => f.short === short);
      
      if (def && def.long) {
        const key = def.long.replace(/^--/, '');
        if (def.value && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          flags[key] = argv[++i];
        } else {
          flags[key] = true;
        }
      } else {
        // Unknown short flag, treat as boolean
        flags[arg.slice(1)] = true;
      }
    } else {
      // Positional argument
      args.push(arg);
    }

    i++;
  }

  return { args, flags };
}

// ============================================================================
// Help Generation
// ============================================================================

/**
 * Generate help text for CLI
 */
export function generateHelp(options: CLIOptions): string {
  const lines: string[] = [];
  const { name, version, description, globalFlags } = options;
  
  // Normalize commands to array format
  const commands = normalizeCommands(options.commands);

  // Header
  lines.push('');
  lines.push(c.bold(c.cyan(`${name}${version ? ` v${version}` : ''}`)));
  if (description) {
    lines.push(c.gray(description));
  }
  lines.push('');

  // Usage
  lines.push(c.bold('Usage:'));
  lines.push(`  npm run ${name} <command> [options]`);
  lines.push('');

  // Commands
  lines.push(c.bold('Commands:'));
  const maxCmdLen = Math.max(...commands.map(c => (c.name ?? '').length));
  for (const cmd of commands) {
    const aliases = cmd.aliases?.length ? c.gray(` (${cmd.aliases.join(', ')})`) : '';
    lines.push(`  ${c.cyan((cmd.name ?? '').padEnd(maxCmdLen))}  ${cmd.description}${aliases}`);
  }
  lines.push('');

  // Global flags
  if (globalFlags && globalFlags.length > 0) {
    lines.push(c.bold('Global Options:'));
    for (const flag of globalFlags) {
      const short = flag.short ? `${flag.short}, ` : '    ';
      lines.push(`  ${short}${(flag.long ?? '').padEnd(15)}  ${flag.description}`);
    }
    lines.push('');
  }

  // Examples
  lines.push(c.bold('Examples:'));
  lines.push(`  npm run ${name} ${commands[0]?.name ?? 'help'}`);
  lines.push(`  npm run ${name} help <command>`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate help text for a specific command
 */
export function generateCommandHelp(cmd: CommandDef, cliName: string): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(c.bold(c.cyan(cmd.name ?? 'unknown')));
  lines.push(c.gray(cmd.description));
  lines.push('');

  // Usage
  lines.push(c.bold('Usage:'));
  let usage = `  npm run ${cliName} ${cmd.name}`;
  if (cmd.args?.length) {
    for (const arg of cmd.args) {
      usage += arg.required ? ` <${arg.name}>` : ` [${arg.name}]`;
    }
  }
  if (cmd.flags?.length) {
    usage += ' [options]';
  }
  lines.push(usage);
  lines.push('');

  // Arguments
  if (cmd.args?.length) {
    lines.push(c.bold('Arguments:'));
    const maxArgLen = Math.max(...cmd.args.map(a => a.name.length));
    for (const arg of cmd.args) {
      const req = arg.required ? c.red('*') : ' ';
      const def = arg.default ? c.gray(` (default: ${arg.default})`) : '';
      lines.push(`  ${req}${arg.name.padEnd(maxArgLen)}  ${arg.description}${def}`);
    }
    lines.push('');
  }

  // Flags
  if (cmd.flags?.length) {
    lines.push(c.bold('Options:'));
    for (const flag of cmd.flags) {
      const short = flag.short ? `${flag.short}, ` : '    ';
      const def = flag.default !== undefined ? c.gray(` (default: ${flag.default})`) : '';
      lines.push(`  ${short}${(flag.long ?? '').padEnd(15)}  ${flag.description}${def}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// CLI Runner
// ============================================================================

/**
 * Create and run CLI
 */
export function createCLI(options: CLIOptions): void {
  const { name, globalFlags = [] } = options;
  
  // Normalize commands to array format
  const commands = normalizeCommands(options.commands);

  // Add help flag to global
  const allGlobalFlags: FlagDef[] = [
    { short: '-h', long: '--help', description: 'Show help' },
    ...globalFlags,
  ];

  // Parse arguments
  const rawArgs = process.argv.slice(2);
  const { args, flags } = parseArgs(rawArgs, allGlobalFlags);

  // Extract command name
  const [cmdName, ...restArgs] = args;

  // Show help if no command or --help
  if (!cmdName || flags.help) {
    if (cmdName && cmdName !== 'help') {
      // Help for specific command
      const cmd = commands.find(c => c.name === cmdName || c.aliases?.includes(cmdName));
      if (cmd) {
        console.log(generateCommandHelp(cmd, name));
        return;
      }
    }
    console.log(generateHelp(options));
    return;
  }

  // Handle 'help <command>'
  if (cmdName === 'help') {
    const targetCmd = restArgs[0];
    if (targetCmd) {
      const cmd = commands.find(c => c.name === targetCmd || c.aliases?.includes(targetCmd));
      if (cmd) {
        console.log(generateCommandHelp(cmd, name));
        return;
      }
      printError(`Unknown command: ${targetCmd}`);
    }
    console.log(generateHelp(options));
    return;
  }

  // Find command
  const command = commands.find(c => c.name === cmdName || c.aliases?.includes(cmdName));
  if (!command) {
    printError(`Unknown command: ${cmdName}`);
    console.log(generateHelp(options));
    process.exit(1);
  }

  // Parse command-specific flags
  const cmdFlags = [...allGlobalFlags, ...(command.flags ?? [])];
  const { args: cmdArgs, flags: parsedFlags } = parseArgs(restArgs, cmdFlags);

  // Build context
  const ctx: CommandContext = {
    args: cmdArgs,
    flags: parsedFlags,
    argv: rawArgs,
    command: cmdName,
  };

  // Run handler
  const handler = command.handler ?? command.run;
  if (!handler) {
    printError(`Command "${cmdName}" has no handler`);
    process.exit(1);
  }
  
  const result = handler(ctx);
  if (result instanceof Promise) {
    result.catch(handleError);
  }
}

/**
 * Convenience: run a single command (no subcommands)
 */
export function runSingle(
  handler: (ctx: CommandContext) => Promise<void> | void,
  flags?: FlagDef[]
): void {
  const allFlags: FlagDef[] = [
    { short: '-h', long: '--help', description: 'Show help' },
    ...(flags ?? []),
  ];

  const rawArgs = process.argv.slice(2);
  const { args, flags: parsedFlags } = parseArgs(rawArgs, allFlags);

  if (parsedFlags.help) {
    console.log(c.bold('Options:'));
    for (const flag of allFlags) {
      const short = flag.short ? `${flag.short}, ` : '    ';
      console.log(`  ${short}${(flag.long ?? '').padEnd(15)}  ${flag.description}`);
    }
    return;
  }

  const ctx: CommandContext = {
    args,
    flags: parsedFlags,
    argv: rawArgs,
    command: '',
  };

  const result = handler(ctx);
  if (result instanceof Promise) {
    result.catch(handleError);
  }
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  parseArgs,
  generateHelp,
  generateCommandHelp,
  createCLI,
  runSingle,
};
