/**
 * Console Output Plugin — Formatted stdout/stderr Logging
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * KERNEL OUTPUT PLUGIN: Console Destination
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * A concrete KernelOutputPlugin that formats and routes log entries to
 * process.stdout (INFO, DEBUG, TRACE) and process.stderr (KERNEL, CRITICAL,
 * ERROR, WARN). This is the default built-in plugin — it always runs.
 * 
 * NOTE: The kernel-logger.ts already has a hardcoded `outputToConsole()`.
 * This plugin is for registering as a MANAGED plugin that can be:
 * - Enabled/disabled at runtime
 * - Filtered by level or component
 * - Wrapped with PII scrubbing
 * - Replaced with a different console formatter
 * 
 * @module kernel/outputs/console-output
 */

import type { KernelOutputPlugin, PluginStats } from '../kernel-output-plugins.js';
import type { KernelLogEntry, KernelLogLevel } from '../kernel-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ConsoleOutputOptions {
  /** Plugin name (default: 'console-output') */
  name?: string;
  /** Minimum log level to output (default: 'TRACE') */
  minLevel?: KernelLogLevel;
  /** Enable ANSI color codes (default: true, auto-disabled in non-TTY) */
  colorize?: boolean;
  /** Include timestamps in output (default: true) */
  timestamps?: boolean;
  /** Include uptimeMs in output (default: true) */
  uptimeMs?: boolean;
  /** Include data payload in output (default: false for console, avoids noise) */
  includeData?: boolean;
  /** JSON mode: output structured JSON lines instead of formatted text */
  jsonMode?: boolean;
}

// ============================================================================
// ANSI COLORS
// ============================================================================

const ANSI_COLORS: Record<KernelLogLevel, string> = {
  KERNEL: '\x1b[35m',    // Magenta
  CRITICAL: '\x1b[31;1m', // Bold Red
  ERROR: '\x1b[31m',     // Red
  WARN: '\x1b[33m',      // Yellow
  INFO: '\x1b[36m',      // Cyan
  DEBUG: '\x1b[90m',     // Gray
  TRACE: '\x1b[90m',     // Gray
};
const ANSI_RESET = '\x1b[0m';

// ============================================================================
// PLUGIN IMPLEMENTATION
// ============================================================================

/**
 * Console output plugin class — registered with the kernel plugin system.
 */
export class ConsoleOutputPlugin implements KernelOutputPlugin {
  readonly name: string;
  readonly version = '1.0.0';
  enabled = true;
  minLevel: KernelLogLevel;

  private readonly colorize: boolean;
  private readonly timestamps: boolean;
  private readonly showUptime: boolean;
  private readonly includeData: boolean;
  private readonly jsonMode: boolean;

  private entriesProcessed = 0;
  private entriesFiltered = 0;
  private writeErrors = 0;
  private lastWriteTime: string | null = null;
  private lastError: string | null = null;

  constructor(options: ConsoleOutputOptions = {}) {
    this.name = options.name ?? 'console-output';
    this.minLevel = options.minLevel ?? 'TRACE';
    this.colorize = options.colorize ?? (process.stdout.isTTY ?? false);
    this.timestamps = options.timestamps ?? true;
    this.showUptime = options.uptimeMs ?? true;
    this.includeData = options.includeData ?? false;
    this.jsonMode = options.jsonMode ?? false;
  }

  write(entry: KernelLogEntry): void {
    try {
      const line = this.jsonMode
        ? this.formatJson(entry)
        : this.formatText(entry);

      if (
        entry.level === 'KERNEL' ||
        entry.level === 'CRITICAL' ||
        entry.level === 'ERROR' ||
        entry.level === 'WARN'
      ) {
        process.stderr.write(`${line}\n`);
      } else {
        process.stdout.write(`${line}\n`);
      }

      this.entriesProcessed++;
      this.lastWriteTime = new Date().toISOString();
    } catch (err) {
      this.writeErrors++;
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  getStats(): PluginStats {
    return {
      entriesProcessed: this.entriesProcessed,
      entriesFiltered: this.entriesFiltered,
      writeErrors: this.writeErrors,
      lastWriteTime: this.lastWriteTime,
      lastError: this.lastError,
      custom: {
        colorize: this.colorize,
        jsonMode: this.jsonMode,
      },
    };
  }

  // ── Formatting ──────────────────────────────────────────────────────────

  private formatText(entry: KernelLogEntry): string {
    const parts: string[] = [];

    if (this.timestamps) {
      parts.push(`[${entry.timestamp}]`);
    }
    if (this.showUptime) {
      parts.push(`[${entry.uptimeMs.toString().padStart(8, ' ')}ms]`);
    }
    parts.push(`[${entry.level.padEnd(8)}]`);
    parts.push(`[${entry.component}]`);
    parts.push(entry.message);

    if (this.includeData && entry.data) {
      parts.push(JSON.stringify(entry.data));
    }
    if (entry.error) {
      parts.push(`| ${entry.error.name}: ${entry.error.message}`);
    }

    const line = parts.join(' ');
    return this.colorize ? `${ANSI_COLORS[entry.level]}${line}${ANSI_RESET}` : line;
  }

  private formatJson(entry: KernelLogEntry): string {
    return JSON.stringify({
      ts: entry.timestamp,
      level: entry.level,
      component: entry.component,
      msg: entry.message,
      uptimeMs: entry.uptimeMs,
      ...(entry.data ? { data: entry.data } : {}),
      ...(entry.error ? { error: entry.error } : {}),
      ...(entry.preBoot ? { preBoot: true } : {}),
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create and return a ConsoleOutputPlugin instance.
 * @param options - Configuration options
 * @returns A ready-to-register KernelOutputPlugin
 */
export function createConsoleOutputPlugin(
  options: ConsoleOutputOptions = {},
): KernelOutputPlugin {
  return new ConsoleOutputPlugin(options);
}
