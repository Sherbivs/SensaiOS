/**
 * Security Plugin Registry
 *
 * @module src/bot/security/plugins/registry
 * @description Central registry for managing security plugins with hot-reload support
 *
 * Research Sources:
 * - Registry Pattern: https://martinfowler.com/eaaCatalog/registry.html
 * - Circuit Breaker: https://martinfowler.com/bliki/CircuitBreaker.html
 *
 * @since Sprint 0 - Foundation Enhancement
 * @version 1.0.0
 */

import { EventEmitter } from "events";
import { watch, type FSWatcher } from "fs";
import { readdir, stat } from "fs/promises";
import { join, resolve } from "path";

import type {
  PluginDiscoveryResult,
  PluginError,
  PluginMetadata,
  PluginRegistration,
  PluginRegistryStats,
  PluginResponse,
  PluginState,
  PluginSystemConfig,
  SecurityContext,
  SecurityEvent,
  SecurityPlugin,
  RoleChangeEvent,
  PermissionChangeEvent,
  ThreatDetectedEvent,
} from "./types.js";
import { DEFAULT_PLUGIN_CONFIG, PluginPriority } from "./types.js";
import { getErrorMessage } from "../../../shared/utils/error-utils.js";

// ============================================================================
// Plugin Registry Implementation
// ============================================================================

/**
 * Central registry for security plugins
 *
 * Features:
 * - Plugin registration and lifecycle management
 * - Priority-based event routing
 * - Hot-reload support for development
 * - Circuit breaker pattern for fault tolerance
 * - Metrics collection and health monitoring
 *
 * @example
 * ```typescript
 * const registry = new PluginRegistry(config);
 * await registry.initialize(securityContext);
 *
 * // Load plugins from directory
 * await registry.discoverAndLoad();
 *
 * // Process events
 * const responses = await registry.processRoleChange(roleChangeEvent);
 * ```
 */
export class PluginRegistry extends EventEmitter {
  /** Registered plugins by ID */
  private readonly plugins: Map<string, PluginRegistration> = new Map();

  /** Sorted plugin IDs by priority (cached) */
  private sortedPluginIds: string[] = [];

  /** File watcher for hot-reload */
  private watcher: FSWatcher | null = null;

  /** Hot-reload debounce timer */
  private reloadDebounceTimer: NodeJS.Timeout | null = null;

  /** Security context for plugins */
  private context: SecurityContext | null = null;

  /** Registry statistics */
  private stats = {
    eventsProcessed: 0,
    totalProcessingTimeMs: 0,
    errorCount: 0,
  };

  /** Circuit breaker state per plugin */
  private readonly circuitBreakers: Map<
    string,
    { failures: number; lastFailure: Date | null; open: boolean }
  > = new Map();

  /**
   * Create a new plugin registry
   * @param config Plugin system configuration
   */
  constructor(private readonly config: PluginSystemConfig = DEFAULT_PLUGIN_CONFIG) {
    super();
  }

  // ===========================================================================
  // Lifecycle Methods
  // ===========================================================================

  /**
   * Initialize the registry with security context
   */
  async initialize(context: SecurityContext): Promise<void> {
    this.context = context;
    this.emit("registry:initializing", { timestamp: new Date() });

    // Start hot-reload watcher in development
    if (this.config.hotReloadEnabled) {
      await this.startHotReload();
    }

    this.emit("registry:initialized", { timestamp: new Date() });
  }

  /**
   * Shutdown the registry and all plugins
   */
  async shutdown(): Promise<void> {
    this.emit("registry:shutting-down", { timestamp: new Date() });

    // Stop hot-reload watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Clear debounce timer
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
      this.reloadDebounceTimer = null;
    }

    // Shutdown all plugins in reverse priority order
    const shutdownOrder = [...this.sortedPluginIds].reverse();

    for (const pluginId of shutdownOrder) {
      const registration = this.plugins.get(pluginId);
      if (registration) {
        try {
          await registration.plugin.shutdown();
          this.emit("plugin:shutdown", { pluginId, timestamp: new Date() });
        } catch (error) {
          this.emit("plugin:shutdown-error", {
            pluginId,
            error: this.toPluginError(error),
            timestamp: new Date(),
          });
        }
      }
    }

    this.plugins.clear();
    this.sortedPluginIds = [];
    this.circuitBreakers.clear();

    this.emit("registry:shutdown", { timestamp: new Date() });
  }

  // ===========================================================================
  // Plugin Registration
  // ===========================================================================

  /**
   * Register a plugin with the registry
   */
  async register(plugin: SecurityPlugin, filePath?: string): Promise<void> {
    const { id } = plugin.metadata;

    // Check if already registered
    if (this.plugins.has(id)) {
      throw new Error(`Plugin '${id}' is already registered`);
    }

    // Check max plugins limit
    if (this.plugins.size >= this.config.maxPlugins) {
      throw new Error(
        `Maximum plugin limit (${this.config.maxPlugins}) reached`
      );
    }

    // Validate dependencies
    await this.validateDependencies(plugin.metadata);

    // Initialize the plugin
    if (this.context) {
      try {
        await plugin.initialize(this.context);
      } catch (error) {
        throw new Error(
          `Failed to initialize plugin '${id}': ${getErrorMessage(error)}`,
          { cause: error }
        );
      }
    }

    // Register the plugin
    const registration: PluginRegistration = {
      plugin,
      registeredAt: new Date(),
      filePath,
      errorCount: 0,
    };

    this.plugins.set(id, registration);

    // Initialize circuit breaker
    this.circuitBreakers.set(id, {
      failures: 0,
      lastFailure: null,
      open: false,
    });

    // Re-sort plugins by priority
    this.sortPluginsByPriority();

    this.emit("plugin:registered", {
      pluginId: id,
      metadata: plugin.metadata,
      timestamp: new Date(),
    });
  }

  /**
   * Unregister a plugin from the registry
   */
  async unregister(pluginId: string): Promise<void> {
    const registration = this.plugins.get(pluginId);

    if (!registration) {
      throw new Error(`Plugin '${pluginId}' is not registered`);
    }

    // Check if other plugins depend on this one
    const dependents = this.findDependentPlugins(pluginId);
    if (dependents.length > 0) {
      throw new Error(
        `Cannot unregister '${pluginId}': plugins depend on it: ${dependents.join(", ")}`
      );
    }

    // Shutdown the plugin
    try {
      await registration.plugin.shutdown();
    } catch (error) {
      this.emit("plugin:shutdown-error", {
        pluginId,
        error: this.toPluginError(error),
        timestamp: new Date(),
      });
    }

    // Remove from registry
    this.plugins.delete(pluginId);
    this.circuitBreakers.delete(pluginId);

    // Re-sort plugins
    this.sortPluginsByPriority();

    this.emit("plugin:unregistered", { pluginId, timestamp: new Date() });
  }

  /**
   * Get a plugin by ID
   */
  getPlugin(pluginId: string): SecurityPlugin | undefined {
    return this.plugins.get(pluginId)?.plugin;
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): ReadonlyMap<string, PluginRegistration> {
    return this.plugins;
  }

  /**
   * Check if a plugin is registered
   */
  hasPlugin(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  // ===========================================================================
  // Plugin Discovery
  // ===========================================================================

  /**
   * Discover plugins from the configured directory
   */
  async discover(): Promise<PluginDiscoveryResult> {
    const pluginPaths: string[] = [];
    const errors: Array<{ filePath: string; message: string; code: string }> =
      [];

    const pluginDir = resolve(this.config.pluginDirectory);

    try {
      const entries = await readdir(pluginDir, { withFileTypes: true });

      for (const entry of entries) {
        const filePath = join(pluginDir, entry.name);

        // Skip directories and non-JS/TS files
        if (entry.isDirectory()) continue;
        if (!/\.(ts|js|mjs)$/.test(entry.name)) continue;
        if (entry.name.endsWith(".d.ts")) continue;
        if (entry.name.endsWith(".test.ts")) continue;
        if (entry.name.endsWith(".spec.ts")) continue;

        try {
          const fileStat = await stat(filePath);
          if (fileStat.isFile()) {
            pluginPaths.push(filePath);
          }
        } catch (error) {
          errors.push({
            filePath,
            message: getErrorMessage(error),
            code: "STAT_ERROR",
          });
        }
      }
    } catch (error) {
      errors.push({
        filePath: pluginDir,
        message: getErrorMessage(error),
        code: "READDIR_ERROR",
      });
    }

    return {
      pluginPaths,
      errors,
      discoveredAt: new Date(),
    };
  }

  /**
   * Discover and load all plugins from the configured directory
   */
  async discoverAndLoad(): Promise<void> {
    const discovery = await this.discover();

    this.emit("discovery:complete", {
      found: discovery.pluginPaths.length,
      errors: discovery.errors.length,
      timestamp: new Date(),
    });

    for (const pluginPath of discovery.pluginPaths) {
      try {
        await this.loadPlugin(pluginPath);
      } catch (error) {
        this.emit("plugin:load-error", {
          filePath: pluginPath,
          error: this.toPluginError(error),
          timestamp: new Date(),
        });
      }
    }
  }

  /**
   * Load a plugin from a file path
   */
  async loadPlugin(filePath: string): Promise<void> {
    try {
      // Dynamic import with cache-busting for hot-reload
      const cacheBuster = `?t=${Date.now()}`;
      const module = await import(`file://${filePath}${cacheBuster}`);

      // Look for default export or named Plugin export
      const PluginClass = module.default ?? module.Plugin;

      if (!PluginClass) {
        throw new Error(`No plugin export found in ${filePath}`);
      }

      // Instantiate and register
      const plugin: SecurityPlugin = new PluginClass();
      await this.register(plugin, filePath);
    } catch (error) {
      throw new Error(
        `Failed to load plugin from ${filePath}: ${getErrorMessage(error)}`,
        { cause: error }
      );
    }
  }

  // ===========================================================================
  // Event Processing
  // ===========================================================================

  /**
   * Process a role change event through all registered plugins
   */
  async processRoleChange(event: RoleChangeEvent): Promise<PluginResponse[]> {
    return this.processEvent(event, "onRoleChange");
  }

  /**
   * Process a permission change event through all registered plugins
   */
  async processPermissionChange(
    event: PermissionChangeEvent
  ): Promise<PluginResponse[]> {
    return this.processEvent(event, "onPermissionChange");
  }

  /**
   * Process a threat detection event through all registered plugins
   */
  async processThreatDetected(
    event: ThreatDetectedEvent
  ): Promise<PluginResponse[]> {
    return this.processEvent(event, "onThreatDetected");
  }

  /**
   * Process a generic security event through all registered plugins
   */
  async processEvent(
    event: SecurityEvent,
    handlerName:
      | "onRoleChange"
      | "onPermissionChange"
      | "onThreatDetected"
      | "onEvent"
  ): Promise<PluginResponse[]> {
    const responses: PluginResponse[] = [];
    const startTime = Date.now();

    for (const pluginId of this.sortedPluginIds) {
      const registration = this.plugins.get(pluginId);
      if (!registration) continue;

      // Check circuit breaker
      if (this.isCircuitOpen(pluginId)) {
        responses.push({
          success: false,
          continueChain: true,
          executionTimeMs: 0,
          error: {
            code: "CIRCUIT_OPEN",
            message: `Plugin ${pluginId} circuit breaker is open`,
            recoverable: true,
          },
        });
        continue;
      }

      // Check if plugin has the handler
      const handler = registration.plugin[handlerName];
      if (typeof handler !== "function") continue;

      try {
        // Execute with timeout
        const response = await this.executeWithTimeout(
          () =>
            (handler as (event: SecurityEvent) => Promise<PluginResponse>).call(
              registration.plugin,
              event
            ),
          this.config.executionTimeoutMs
        );

        responses.push(response);

        // Reset circuit breaker on success
        this.resetCircuitBreaker(pluginId);

        // Check if we should stop processing
        if (!response.continueChain) break;
      } catch (error) {
        const pluginError = this.toPluginError(error);

        // Record failure
        registration.errorCount++;
        registration.lastError = pluginError;
        this.recordCircuitFailure(pluginId);

        responses.push({
          success: false,
          continueChain: true,
          executionTimeMs: Date.now() - startTime,
          error: pluginError,
        });

        this.emit("plugin:error", {
          pluginId,
          event: event.type,
          error: pluginError,
          timestamp: new Date(),
        });
      }
    }

    // Update stats
    this.stats.eventsProcessed++;
    this.stats.totalProcessingTimeMs += Date.now() - startTime;
    if (responses.some((r) => !r.success)) {
      this.stats.errorCount++;
    }

    return responses;
  }

  // ===========================================================================
  // Hot Reload
  // ===========================================================================

  /**
   * Start watching plugin directory for changes
   */
  private async startHotReload(): Promise<void> {
    const pluginDir = resolve(this.config.pluginDirectory);

    try {
      this.watcher = watch(
        pluginDir,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;
          if (!/\.(ts|js|mjs)$/.test(filename)) return;
          if (filename.endsWith(".d.ts")) return;

          // Debounce reload
          if (this.reloadDebounceTimer) {
            clearTimeout(this.reloadDebounceTimer);
          }

          this.reloadDebounceTimer = setTimeout(async () => {
            const filePath = join(pluginDir, filename);
            await this.handleFileChange(filePath, eventType);
          }, this.config.hotReloadDebounceMs);
        }
      );

      this.emit("hot-reload:started", {
        directory: pluginDir,
        timestamp: new Date(),
      });
    } catch (error) {
      this.emit("hot-reload:error", {
        error: this.toPluginError(error),
        timestamp: new Date(),
      });
    }
  }

  /**
   * Handle file change for hot-reload
   */
  private async handleFileChange(
    filePath: string,
    eventType: string
  ): Promise<void> {
    // Find plugin registered from this file
    const existingPlugin = Array.from(this.plugins.entries()).find(
      ([_, reg]) => reg.filePath === filePath
    );

    if (eventType === "rename") {
      // File deleted - unregister if exists
      if (existingPlugin) {
        try {
          await this.unregister(existingPlugin[0]);
          this.emit("hot-reload:unloaded", {
            pluginId: existingPlugin[0],
            filePath,
            timestamp: new Date(),
          });
        } catch (error) {
          this.emit("hot-reload:error", {
            filePath,
            error: this.toPluginError(error),
            timestamp: new Date(),
          });
        }
      }
    } else if (eventType === "change") {
      // File modified - reload
      if (existingPlugin) {
        try {
          await this.unregister(existingPlugin[0]);
        } catch {
          // Ignore unregister errors during reload
        }
      }

      try {
        await this.loadPlugin(filePath);
        this.emit("hot-reload:reloaded", { filePath, timestamp: new Date() });
      } catch (error) {
        this.emit("hot-reload:error", {
          filePath,
          error: this.toPluginError(error),
          timestamp: new Date(),
        });
      }
    }
  }

  // ===========================================================================
  // Circuit Breaker
  // ===========================================================================

  /**
   * Check if circuit breaker is open for a plugin
   */
  private isCircuitOpen(pluginId: string): boolean {
    const breaker = this.circuitBreakers.get(pluginId);
    if (!breaker) return false;

    if (breaker.open && breaker.lastFailure) {
      const timeSinceFailure =
        Date.now() - breaker.lastFailure.getTime();
      if (timeSinceFailure > this.config.circuitBreakerResetMs) {
        // Reset circuit breaker (half-open state)
        breaker.open = false;
        breaker.failures = 0;
        return false;
      }
    }

    return breaker.open;
  }

  /**
   * Record a failure for circuit breaker
   */
  private recordCircuitFailure(pluginId: string): void {
    const breaker = this.circuitBreakers.get(pluginId);
    if (!breaker) return;

    breaker.failures++;
    breaker.lastFailure = new Date();

    if (breaker.failures >= this.config.circuitBreakerThreshold) {
      breaker.open = true;
      this.emit("circuit-breaker:open", { pluginId, timestamp: new Date() });
    }
  }

  /**
   * Reset circuit breaker for a plugin
   */
  private resetCircuitBreaker(pluginId: string): void {
    const breaker = this.circuitBreakers.get(pluginId);
    if (!breaker) return;

    if (breaker.failures > 0 || breaker.open) {
      breaker.failures = 0;
      breaker.open = false;
      breaker.lastFailure = null;
      this.emit("circuit-breaker:reset", { pluginId, timestamp: new Date() });
    }
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get registry statistics
   */
  getStats(): PluginRegistryStats {
    const byState: Record<PluginState, number> = {
      unloaded: 0,
      initializing: 0,
      ready: 0,
      error: 0,
      disabled: 0,
    };

    for (const [_, registration] of this.plugins) {
      byState[registration.plugin.state]++;
    }

    return {
      totalPlugins: this.plugins.size,
      byState,
      eventsProcessed: this.stats.eventsProcessed,
      avgProcessingTimeMs:
        this.stats.eventsProcessed > 0
          ? this.stats.totalProcessingTimeMs / this.stats.eventsProcessed
          : 0,
      errorRate:
        this.stats.eventsProcessed > 0
          ? this.stats.errorCount / this.stats.eventsProcessed
          : 0,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Sort plugins by priority
   */
  private sortPluginsByPriority(): void {
    this.sortedPluginIds = Array.from(this.plugins.keys()).sort((a, b) => {
      const priorityA =
        this.plugins.get(a)?.plugin.metadata.priority ?? PluginPriority.NORMAL;
      const priorityB =
        this.plugins.get(b)?.plugin.metadata.priority ?? PluginPriority.NORMAL;
      return priorityA - priorityB;
    });
  }

  /**
   * Validate plugin dependencies
   */
  private async validateDependencies(metadata: PluginMetadata): Promise<void> {
    const { dependencies = [] } = metadata;

    for (const depId of dependencies) {
      if (!this.plugins.has(depId)) {
        throw new Error(
          `Plugin '${metadata.id}' requires dependency '${depId}' which is not registered`
        );
      }
    }
  }

  /**
   * Find plugins that depend on a given plugin
   */
  private findDependentPlugins(pluginId: string): string[] {
    const dependents: string[] = [];

    for (const [id, registration] of this.plugins) {
      const deps = registration.plugin.metadata.dependencies ?? [];
      if (deps.includes(pluginId)) {
        dependents.push(id);
      }
    }

    return dependents;
  }

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Execution timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Convert error to PluginError
   */
  private toPluginError(error: unknown): PluginError {
    if (error instanceof Error) {
      return {
        code: "PLUGIN_ERROR",
        message: error.message,
        stack: error.stack,
        recoverable: true,
      };
    }

    return {
      code: "UNKNOWN_ERROR",
      message: String(error),
      recoverable: true,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global plugin registry instance
 */
export const pluginRegistry = new PluginRegistry();
