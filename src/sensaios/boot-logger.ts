/**
 * SensaiOS Boot Logger
 * 
 * Provides observability before database connection.
 * This is the FIRST thing that starts during kernel boot.
 * 
 * Per v1.1.2: Observability starts BEFORE database connection.
 * 
 * @module sensaios/boot-logger
 */

// ============================================================================
// BOOT LOGGER TYPES
// ============================================================================

/**
 * Boot log level
 */
export type BootLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Boot log entry structure
 */
export interface BootLogEntry {
  /** Log level */
  level: BootLogLevel;
  /** ISO timestamp */
  timestamp: string;
  /** Milliseconds since boot started */
  elapsed: number;
  /** Operation name */
  operation: string;
  /** Log message */
  message: string;
  /** Additional context */
  data?: Record<string, unknown>;
}

/**
 * Boot logger configuration
 */
export interface BootLoggerConfig {
  /** Service/component name */
  name: string;
  /** Whether to output JSON format */
  json?: boolean;
  /** Minimum log level */
  minLevel?: BootLogLevel;
  /** Custom output function (defaults to console) */
  output?: (entry: BootLogEntry) => void;
}

/**
 * Boot logger interface
 */
export interface BootLogger {
  /** Debug level log */
  debug(operation: string, message: string, data?: Record<string, unknown>): void;
  /** Info level log */
  info(operation: string, message: string, data?: Record<string, unknown>): void;
  /** Warning level log */
  warn(operation: string, message: string, data?: Record<string, unknown>): void;
  /** Error level log */
  error(operation: string, message: string, data?: Record<string, unknown>): void;
  /** Fatal level log (unrecoverable) */
  fatal(operation: string, message: string, data?: Record<string, unknown>): void;
  /** Get elapsed time since boot started */
  getElapsed(): number;
  /** Get all captured log entries */
  getEntries(): BootLogEntry[];
  /** Mark boot phase complete */
  phase(name: string, status: 'start' | 'complete' | 'failed', data?: Record<string, unknown>): void;
}

// ============================================================================
// LOG LEVEL PRIORITY
// ============================================================================

const LOG_LEVEL_PRIORITY: Record<BootLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const LOG_LEVEL_ICONS: Record<BootLogLevel, string> = {
  debug: '🔍',
  info: '📋',
  warn: '⚠️',
  error: '❌',
  fatal: '💀',
};

// ============================================================================
// BOOT LOGGER IMPLEMENTATION
// ============================================================================

/**
 * Create a boot logger for kernel initialization.
 * 
 * The boot logger:
 * - Starts with NO dependencies (not even database)
 * - Captures logs in memory for later persistence
 * - Outputs to console immediately for debugging
 * - Tracks elapsed time from boot start
 * - Can be upgraded to full observability hub later
 * 
 * @example
 * ```typescript
 * const bootLog = createBootLogger({ name: 'sensai-kernel' });
 * bootLog.info('boot', 'Starting kernel...');
 * 
 * bootLog.phase('database', 'start');
 * await connectDatabase();
 * bootLog.phase('database', 'complete');
 * 
 * // Later, flush captured logs to database
 * const entries = bootLog.getEntries();
 * ```
 */
export function createBootLogger(config: BootLoggerConfig): BootLogger {
  const { name, json = true, minLevel = 'debug', output } = config;
  const bootStartTime = Date.now();
  const entries: BootLogEntry[] = [];
  const phases: Map<string, { startTime: number; status: string }> = new Map();

  // Default output function
  /* eslint-disable no-console -- Boot logger runs BEFORE logging infrastructure is available */
  const defaultOutput = (entry: BootLogEntry): void => {
    if (json) {
      const line = JSON.stringify({
        ...entry,
        service: name,
      });
      if (entry.level === 'error' || entry.level === 'fatal') {
        console.error(line);
      } else {
        console.log(line);
      }
    } else {
      const icon = LOG_LEVEL_ICONS[entry.level];
      const elapsed = `+${entry.elapsed}ms`.padStart(8);
      const op = entry.operation.padEnd(20);
      const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
      const line = `${icon} [${elapsed}] ${entry.level.toUpperCase().padEnd(5)} ${op} ${entry.message}${dataStr}`;
      
      if (entry.level === 'error' || entry.level === 'fatal') {
        console.error(line);
      } else {
        console.log(line);
      }
    }
  };
  /* eslint-enable no-console */

  const outputFn = output ?? defaultOutput;

  // Core log function
  function log(
    level: BootLogLevel,
    operation: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    // Check minimum level
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[minLevel]) {
      return;
    }

    const entry: BootLogEntry = {
      level,
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - bootStartTime,
      operation,
      message,
      data,
    };

    // Capture in memory
    entries.push(entry);

    // Output immediately
    outputFn(entry);
  }

  // Phase tracking
  function phase(
    phaseName: string,
    status: 'start' | 'complete' | 'failed',
    data?: Record<string, unknown>
  ): void {
    if (status === 'start') {
      phases.set(phaseName, { startTime: Date.now(), status: 'running' });
      log('info', `phase.${phaseName}`, `Starting ${phaseName}...`, data);
    } else if (status === 'complete') {
      const phaseInfo = phases.get(phaseName);
      const duration = phaseInfo ? Date.now() - phaseInfo.startTime : 0;
      phases.set(phaseName, { startTime: phaseInfo?.startTime ?? Date.now(), status: 'complete' });
      log('info', `phase.${phaseName}`, `${phaseName} complete`, { ...data, durationMs: duration });
    } else if (status === 'failed') {
      const phaseInfo = phases.get(phaseName);
      const duration = phaseInfo ? Date.now() - phaseInfo.startTime : 0;
      phases.set(phaseName, { startTime: phaseInfo?.startTime ?? Date.now(), status: 'failed' });
      log('error', `phase.${phaseName}`, `${phaseName} failed`, { ...data, durationMs: duration });
    }
  }

  return {
    debug: (op, msg, data) => log('debug', op, msg, data),
    info: (op, msg, data) => log('info', op, msg, data),
    warn: (op, msg, data) => log('warn', op, msg, data),
    error: (op, msg, data) => log('error', op, msg, data),
    fatal: (op, msg, data) => log('fatal', op, msg, data),
    getElapsed: () => Date.now() - bootStartTime,
    getEntries: () => [...entries],
    phase,
  };
}

// ============================================================================
// GLOBAL BOOT LOGGER
// ============================================================================

let globalBootLogger: BootLogger | null = null;

/**
 * Initialize the global boot logger.
 * Should be called FIRST thing in application startup.
 */
export function initBootLogger(config: Partial<BootLoggerConfig> = {}): BootLogger {
  if (globalBootLogger) {
    throw new Error('Boot logger already initialized');
  }

  globalBootLogger = createBootLogger({
    name: config.name ?? 'sensai-kernel',
    json: config.json ?? true,
    minLevel: config.minLevel ?? 'debug',
    output: config.output,
  });

  return globalBootLogger;
}

/**
 * Get the global boot logger.
 * Creates one if not initialized (useful for library code).
 */
export function getBootLogger(): BootLogger {
  if (!globalBootLogger) {
    // Auto-initialize with defaults for convenience
    globalBootLogger = createBootLogger({
      name: 'sensai-kernel',
      json: true,
      minLevel: 'debug',
    });
  }
  return globalBootLogger;
}

/**
 * Clear the global boot logger (for testing).
 */
export function clearBootLogger(): void {
  globalBootLogger = null;
}

// ============================================================================
// BOOT PHASE HELPERS
// ============================================================================

/**
 * Boot phases in order
 */
export const BOOT_PHASES = [
  'logger',      // Boot logger itself
  'config',      // Configuration loading
  'database',    // Database connection
  'kernel',      // Kernel primitives
  'components',  // Component loading
  'handlers',    // Handler registration
  'ready',       // Boot complete
] as const;

export type BootPhase = typeof BOOT_PHASES[number];

/**
 * Boot status tracking
 */
export interface BootStatus {
  /** Current boot phase */
  currentPhase: BootPhase;
  /** Whether boot is complete */
  isReady: boolean;
  /** Boot start time */
  startTime: Date;
  /** Boot end time (if complete) */
  endTime?: Date;
  /** Total boot duration in ms */
  durationMs?: number;
  /** Error if boot failed */
  error?: Error;
  /** Phase completion times */
  phaseTimes: Partial<Record<BootPhase, number>>;
}

/**
 * Create a boot status tracker
 */
export function createBootStatus(): BootStatus {
  return {
    currentPhase: 'logger',
    isReady: false,
    startTime: new Date(),
    phaseTimes: {},
  };
}

/**
 * Update boot status for phase completion
 */
export function completeBootPhase(status: BootStatus, phase: BootPhase): BootStatus {
  const now = Date.now();
  const updated: BootStatus = {
    ...status,
    currentPhase: phase,
    phaseTimes: {
      ...status.phaseTimes,
      [phase]: now - status.startTime.getTime(),
    },
  };

  if (phase === 'ready') {
    updated.isReady = true;
    updated.endTime = new Date();
    updated.durationMs = now - status.startTime.getTime();
  }

  return updated;
}

/**
 * Mark boot as failed
 */
export function failBoot(status: BootStatus, error: Error): BootStatus {
  return {
    ...status,
    isReady: false,
    endTime: new Date(),
    durationMs: Date.now() - status.startTime.getTime(),
    error,
  };
}
