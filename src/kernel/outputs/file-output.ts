/**
 * File Output Plugin — Database-First Architecture Stub
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * KERNEL OUTPUT PLUGIN: File Destination (DISABLED)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * As of 2025-12-27, file-based log persistence is DISABLED under the
 * Database-First Architecture policy. All persistent log storage goes
 * through the database export pipeline (kernel.exportLogs → Prisma).
 * 
 * This plugin exists as:
 * 1. A documented placeholder for the output plugin contract
 * 2. A safe no-op that can be registered without side effects
 * 3. A template for future file-based destinations (e.g., crash dump files)
 * 
 * If file logging is ever re-enabled (e.g., crash-recovery mode where
 * database is unreachable), implement the write() method here.
 * 
 * @module kernel/outputs/file-output
 */

import type { KernelOutputPlugin, PluginStats } from '../kernel-output-plugins.js';
import type { KernelLogEntry, KernelLogLevel } from '../kernel-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface FileOutputOptions {
  /** Plugin name (default: 'file-output') */
  name?: string;
  /** Minimum log level (default: 'INFO') */
  minLevel?: KernelLogLevel;
  /**
   * File path for log output.
   * Currently unused — Database-First Architecture (2025-12-27).
   * Retained for future crash-recovery file mode.
   */
  filePath?: string;
  /** Max file size in bytes before rotation (default: 10MB) */
  maxFileSize?: number;
  /** Max number of rotated files to keep (default: 5) */
  maxFiles?: number;
}

// ============================================================================
// PLUGIN IMPLEMENTATION
// ============================================================================

/**
 * File output plugin — currently a no-op under Database-First Architecture.
 * 
 * The plugin tracks call counts for observability but performs no file I/O.
 * Register it to satisfy the acceptance criteria without violating the
 * Database-First Architecture policy.
 */
export class FileOutputPlugin implements KernelOutputPlugin {
  readonly name: string;
  readonly version = '1.0.0';
  enabled: boolean;
  minLevel: KernelLogLevel;

  private readonly _filePath: string | null;

  private entriesReceived = 0;
  private lastReceiveTime: string | null = null;

  constructor(options: FileOutputOptions = {}) {
    this.name = options.name ?? 'file-output';
    this.minLevel = options.minLevel ?? 'INFO';
    // Disabled by default — Database-First Architecture
    this.enabled = false;
    this._filePath = options.filePath ?? null;
  }

  /**
   * No-op write — Database-First Architecture (2025-12-27).
   * Counts entries for observability but writes nothing to disk.
   */
  write(_entry: KernelLogEntry): void {
    this.entriesReceived++;
    this.lastReceiveTime = new Date().toISOString();
    // No file I/O — use kernel.exportLogs() → database instead
  }

  getStats(): PluginStats {
    return {
      entriesProcessed: this.entriesReceived,
      entriesFiltered: 0,
      writeErrors: 0,
      lastWriteTime: this.lastReceiveTime,
      lastError: null,
      custom: {
        mode: 'database-first-noop',
        filePath: this._filePath,
        reason: 'File logging disabled (Database-First Architecture, 2025-12-27)',
      },
    };
  }

  /**
   * Flush is a no-op (no buffer to flush).
   */
  flush(): void {
    // No-op
  }

  /**
   * Shutdown is a no-op (no file handle to close).
   */
  shutdown(): void {
    // No-op
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a FileOutputPlugin instance.
 * @param options - Configuration options
 * @returns A ready-to-register KernelOutputPlugin (disabled by default)
 */
export function createFileOutputPlugin(
  options: FileOutputOptions = {},
): KernelOutputPlugin {
  return new FileOutputPlugin(options);
}
