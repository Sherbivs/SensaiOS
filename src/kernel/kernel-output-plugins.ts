/**
 * Kernel Output Plugin System
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTENSIBLE OUTPUT ARCHITECTURE FOR KERNEL LOGGING
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Provides a plugin architecture for routing kernel logs to multiple destinations:
 * - Console (built-in, always active)
 * - File (built-in, always active)
 * - Loki (external, optional)
 * - Discord (external, optional)
 * - PostgreSQL (external, optional)
 * 
 * PLUGIN LIFECYCLE:
 * 1. Plugins register via registerOutputPlugin()
 * 2. Each log entry flows through all registered plugins
 * 3. Plugins can filter by level, component, or custom logic
 * 4. Plugins handle their own errors (failures don't cascade)
 * 
 * DESIGN PRINCIPLES:
 * - Synchronous core (console, file) for reliability
 * - Async plugins (Loki, DB) for external destinations
 * - Plugin failures are isolated (never break logging)
 * - Pre-boot logs are queued and replayed to plugins after boot
 * 
 * @module kernel/kernel-output-plugins
 */

import type { KernelLogEntry, KernelLogLevel } from './kernel-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Output plugin interface - implement this to add new log destinations
 */
export interface KernelOutputPlugin {
  /** Unique plugin name (e.g., "loki", "discord", "postgres") */
  name: string;
  
  /** Plugin version for debugging */
  version: string;
  
  /** Whether this plugin is currently enabled */
  enabled: boolean;
  
  /** 
   * Minimum log level this plugin handles
   * Plugin won't receive entries below this level
   */
  minLevel: KernelLogLevel;
  
  /**
   * Initialize the plugin (called once on registration)
   * Can be async for connection setup
   */
  initialize?(): Promise<void> | void;
  
  /**
   * Process a log entry
   * Called for every log entry that passes the level filter
   * MUST NOT throw - handle errors internally
   */
  write(entry: KernelLogEntry): Promise<void> | void;
  
  /**
   * Flush any buffered entries
   * Called during shutdown or manual flush
   */
  flush?(): Promise<void> | void;
  
  /**
   * Shutdown the plugin
   * Close connections, flush buffers, cleanup
   */
  shutdown?(): Promise<void> | void;
  
  /**
   * Get plugin statistics
   */
  getStats?(): PluginStats;
  
  /**
   * Optional filter function for fine-grained control
   * Return true to process entry, false to skip
   */
  filter?(entry: KernelLogEntry): boolean;
}

/**
 * Plugin statistics for monitoring
 */
export interface PluginStats {
  /** Total entries processed */
  entriesProcessed: number;
  
  /** Entries filtered/skipped */
  entriesFiltered: number;
  
  /** Write errors (non-fatal) */
  writeErrors: number;
  
  /** Last write time (ISO string) */
  lastWriteTime: string | null;
  
  /** Last error message */
  lastError: string | null;
  
  /** Plugin-specific metrics */
  custom?: Record<string, unknown>;
}

/**
 * Plugin registration result
 */
export interface PluginRegistration {
  name: string;
  success: boolean;
  error?: string;
}

/**
 * Output plugin manager state
 */
export interface OutputPluginManagerState {
  plugins: {
    name: string;
    version: string;
    enabled: boolean;
    minLevel: KernelLogLevel;
    stats: PluginStats | null;
  }[];
  totalPlugins: number;
  enabledPlugins: number;
}

// ============================================================================
// LEVEL PRIORITY (for filtering)
// ============================================================================

const LEVEL_PRIORITY: Record<KernelLogLevel, number> = {
  KERNEL: 0,
  CRITICAL: 1,
  ERROR: 2,
  WARN: 3,
  INFO: 4,
  DEBUG: 5,
  TRACE: 6,
};

// ============================================================================
// PLUGIN REGISTRY
// ============================================================================

/** Registered output plugins */
const plugins: Map<string, KernelOutputPlugin> = new Map();

/** Plugin execution order (registered order) */
const pluginOrder: string[] = [];

/** Whether the plugin system is initialized */
let initialized = false;

/** Whether we're in shutdown mode (no new writes) */
let shuttingDown = false;

// ============================================================================
// PLUGIN MANAGEMENT API
// ============================================================================

/**
 * Register an output plugin
 * 
 * @param plugin - The plugin to register
 * @returns Registration result
 */
export async function registerOutputPlugin(
  plugin: KernelOutputPlugin
): Promise<PluginRegistration> {
  if (shuttingDown) {
    return {
      name: plugin.name,
      success: false,
      error: 'Plugin system is shutting down',
    };
  }
  
  if (plugins.has(plugin.name)) {
    return {
      name: plugin.name,
      success: false,
      error: `Plugin "${plugin.name}" is already registered`,
    };
  }
  
  try {
    // Initialize if plugin has init function
    if (plugin.initialize) {
      await plugin.initialize();
    }
    
    plugins.set(plugin.name, plugin);
    pluginOrder.push(plugin.name);
    
    return {
      name: plugin.name,
      success: true,
    };
  } catch (error) {
    return {
      name: plugin.name,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Unregister an output plugin
 * 
 * @param name - Plugin name to unregister
 * @returns true if plugin was removed
 */
export async function unregisterOutputPlugin(name: string): Promise<boolean> {
  const plugin = plugins.get(name);
  if (!plugin) {
    return false;
  }
  
  try {
    // Shutdown plugin before removing
    if (plugin.shutdown) {
      await plugin.shutdown();
    }
  } catch {
    // Ignore shutdown errors during unregister
  }
  
  plugins.delete(name);
  const orderIndex = pluginOrder.indexOf(name);
  if (orderIndex >= 0) {
    pluginOrder.splice(orderIndex, 1);
  }
  
  return true;
}

/**
 * Get a registered plugin by name
 */
export function getPlugin(name: string): KernelOutputPlugin | undefined {
  return plugins.get(name);
}

/**
 * Get all registered plugins
 */
export function getAllPlugins(): KernelOutputPlugin[] {
  return pluginOrder.map(name => plugins.get(name)!);
}

/**
 * Enable or disable a plugin
 */
export function setPluginEnabled(name: string, enabled: boolean): boolean {
  const plugin = plugins.get(name);
  if (!plugin) {
    return false;
  }
  plugin.enabled = enabled;
  return true;
}

// ============================================================================
// LOG DISPATCH
// ============================================================================

/**
 * Dispatch a log entry to all registered plugins
 * 
 * This is the core function that routes logs to plugins.
 * Called by kernel-logger.ts for each log entry.
 * 
 * @param entry - The log entry to dispatch
 */
export async function dispatchToPlugins(entry: KernelLogEntry): Promise<void> {
  if (shuttingDown) {
    return;
  }
  
  const entryPriority = LEVEL_PRIORITY[entry.level];
  
  // Process each plugin in registration order
  for (const name of pluginOrder) {
    const plugin = plugins.get(name);
    if (!plugin || !plugin.enabled) {
      continue;
    }
    
    // Check level filter
    if (entryPriority > LEVEL_PRIORITY[plugin.minLevel]) {
      continue;
    }
    
    // Check custom filter
    if (plugin.filter && !plugin.filter(entry)) {
      continue;
    }
    
    // Write to plugin (errors are isolated)
    try {
      await plugin.write(entry);
    } catch {
      // Plugin errors are silently ignored to prevent cascade
      // Plugin should track its own errors via getStats()
    }
  }
}

/**
 * Dispatch synchronously (for core console/file plugins)
 * Does not wait for async plugins
 */
export function dispatchToPluginsSync(entry: KernelLogEntry): void {
  if (shuttingDown) {
    return;
  }
  
  const entryPriority = LEVEL_PRIORITY[entry.level];
  
  for (const name of pluginOrder) {
    const plugin = plugins.get(name);
    if (!plugin || !plugin.enabled) {
      continue;
    }
    
    if (entryPriority > LEVEL_PRIORITY[plugin.minLevel]) {
      continue;
    }
    
    if (plugin.filter && !plugin.filter(entry)) {
      continue;
    }
    
    try {
      // Fire and forget for sync dispatch
      const result = plugin.write(entry);
      // If it returns a promise, we don't wait (async plugins handle themselves)
      if (result instanceof Promise) {
        result.catch(() => {
          // Silently ignore async errors
        });
      }
    } catch {
      // Silently ignore sync errors
    }
  }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Initialize the plugin system
 */
export function initializePluginSystem(): void {
  initialized = true;
  shuttingDown = false;
}

/**
 * Flush all plugin buffers
 */
export async function flushAllPlugins(): Promise<void> {
  const flushPromises: Promise<void>[] = [];
  
  for (const name of pluginOrder) {
    const plugin = plugins.get(name);
    if (plugin?.flush) {
      try {
        const result = plugin.flush();
        if (result instanceof Promise) {
          flushPromises.push(result);
        }
      } catch {
        // Ignore flush errors
      }
    }
  }
  
  await Promise.allSettled(flushPromises);
}

/**
 * Shutdown all plugins
 */
export async function shutdownPluginSystem(): Promise<void> {
  shuttingDown = true;
  
  // Flush first
  await flushAllPlugins();
  
  // Then shutdown in reverse order
  const shutdownPromises: Promise<void>[] = [];
  
  for (let i = pluginOrder.length - 1; i >= 0; i--) {
    const name = pluginOrder[i];
    const plugin = plugins.get(name);
    if (plugin?.shutdown) {
      try {
        const result = plugin.shutdown();
        if (result instanceof Promise) {
          shutdownPromises.push(result);
        }
      } catch {
        // Ignore shutdown errors
      }
    }
  }
  
  await Promise.allSettled(shutdownPromises);
  
  // Clear registry
  plugins.clear();
  pluginOrder.length = 0;
  initialized = false;
}

// ============================================================================
// STATE & DIAGNOSTICS
// ============================================================================

/**
 * Get current state of plugin system
 */
export function getPluginSystemState(): OutputPluginManagerState {
  const pluginStates = pluginOrder.map(name => {
    const plugin = plugins.get(name)!;
    return {
      name: plugin.name,
      version: plugin.version,
      enabled: plugin.enabled,
      minLevel: plugin.minLevel,
      stats: plugin.getStats ? plugin.getStats() : null,
    };
  });
  
  return {
    plugins: pluginStates,
    totalPlugins: plugins.size,
    enabledPlugins: pluginOrder.filter(n => plugins.get(n)?.enabled).length,
  };
}

/**
 * Check if plugin system is ready
 */
export function isPluginSystemReady(): boolean {
  return initialized && !shuttingDown;
}

// ============================================================================
// BUILT-IN PLUGIN FACTORIES
// ============================================================================

/**
 * Create a simple console output plugin
 * This is primarily for testing - the kernel has built-in console output
 */
export function createConsolePlugin(options: {
  name?: string;
  minLevel?: KernelLogLevel;
  colorize?: boolean;
}): KernelOutputPlugin {
  const { name = 'console', minLevel = 'TRACE', colorize: _colorize = true } = options;
  
  let entriesProcessed = 0;
  let lastWriteTime: string | null = null;
  
  return {
    name,
    version: '1.0.0',
    enabled: true,
    minLevel,
    
    write(entry: KernelLogEntry): void {
      const line = `[${entry.level}] [${entry.component}] ${entry.message}`;
      if (entry.level === 'ERROR' || entry.level === 'CRITICAL') {
        // eslint-disable-next-line no-console
        console.error(line);
      } else if (entry.level === 'WARN') {
        // eslint-disable-next-line no-console
        console.warn(line);
      } else {
        // eslint-disable-next-line no-console
        console.log(line);
      }
      entriesProcessed++;
      lastWriteTime = new Date().toISOString();
    },
    
    getStats(): PluginStats {
      return {
        entriesProcessed,
        entriesFiltered: 0,
        writeErrors: 0,
        lastWriteTime,
        lastError: null,
      };
    },
  };
}

/**
 * Create a buffered async plugin
 * Useful as a base for Loki, Discord, PostgreSQL plugins
 */
export function createBufferedPlugin(options: {
  name: string;
  version?: string;
  minLevel?: KernelLogLevel;
  bufferSize?: number;
  flushIntervalMs?: number;
  onFlush: (entries: KernelLogEntry[]) => Promise<void>;
}): KernelOutputPlugin {
  const {
    name,
    version = '1.0.0',
    minLevel = 'INFO',
    bufferSize = 100,
    flushIntervalMs = 5000,
    onFlush,
  } = options;
  
  let buffer: KernelLogEntry[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let entriesProcessed = 0;
  let entriesFiltered = 0;
  let writeErrors = 0;
  let lastWriteTime: string | null = null;
  let lastError: string | null = null;
  
  const doFlush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    
    const toFlush = buffer;
    buffer = [];
    
    try {
      await onFlush(toFlush);
      lastWriteTime = new Date().toISOString();
    } catch (error) {
      writeErrors++;
      lastError = error instanceof Error ? error.message : String(error);
      // Re-add failed entries to front of buffer (up to limit)
      buffer = [...toFlush.slice(0, bufferSize - buffer.length), ...buffer];
    }
  };
  
  return {
    name,
    version,
    enabled: true,
    minLevel,
    
    initialize(): void {
      flushTimer = setInterval(() => {
        doFlush().catch(() => {
          // Ignore timer-triggered flush errors
        });
      }, flushIntervalMs);
    },
    
    write(entry: KernelLogEntry): void {
      buffer.push(entry);
      entriesProcessed++;
      
      // Flush if buffer is full
      if (buffer.length >= bufferSize) {
        doFlush().catch(() => {
          // Ignore immediate flush errors
        });
      }
    },
    
    async flush(): Promise<void> {
      await doFlush();
    },
    
    async shutdown(): Promise<void> {
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
      await doFlush();
    },
    
    getStats(): PluginStats {
      return {
        entriesProcessed,
        entriesFiltered,
        writeErrors,
        lastWriteTime,
        lastError,
        custom: {
          bufferSize: buffer.length,
          maxBufferSize: bufferSize,
        },
      };
    },
  };
}

/**
 * Create a filter plugin that wraps another plugin
 * Useful for component-specific or pattern-based filtering
 */
export function createFilteredPlugin(
  basePlugin: KernelOutputPlugin,
  filterFn: (entry: KernelLogEntry) => boolean
): KernelOutputPlugin {
  let entriesFiltered = 0;
  
  return {
    ...basePlugin,
    name: `${basePlugin.name}-filtered`,
    
    filter(entry: KernelLogEntry): boolean {
      const pass = filterFn(entry);
      if (!pass) entriesFiltered++;
      return pass;
    },
    
    getStats(): PluginStats {
      const baseStats = basePlugin.getStats?.() ?? {
        entriesProcessed: 0,
        entriesFiltered: 0,
        writeErrors: 0,
        lastWriteTime: null,
        lastError: null,
      };
      return {
        ...baseStats,
        entriesFiltered: baseStats.entriesFiltered + entriesFiltered,
      };
    },
  };
}
