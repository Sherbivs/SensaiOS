/**
 * Base Security Plugin
 *
 * @module src/bot/security/plugins/base-plugin
 * @description Abstract base class for security plugins with common functionality
 *
 * @since Sprint 0 - Foundation Enhancement
 * @version 1.0.0
 */

import type {
  PluginMetadata,
  PluginResponse,
  PluginState,
  RoleChangeEvent,
  PermissionChangeEvent,
  ThreatDetectedEvent,
  SecurityContext,
  SecurityEvent,
  SecurityPlugin,
} from "./types.js";

import { IntelligentLogger } from "../../../utils/intelligent-logger.js";

// Centralized logger instance for all security plugins
const pluginLogger = new IntelligentLogger();

/**
 * Abstract base class for security plugins
 *
 * Provides common functionality:
 * - State management
 * - Structured logging
 * - Error handling utilities
 * - Response builders
 *
 * @example
 * ```typescript
 * export class MySecurityPlugin extends BaseSecurityPlugin {
 *   metadata = {
 *     id: 'my-security-plugin',
 *     name: 'My Security Plugin',
 *     version: '1.0.0',
 *     description: 'Example plugin',
 *     author: 'Team',
 *     priority: PluginPriority.NORMAL,
 *     tags: ['example'],
 *   };
 *
 *   async doInitialize(): Promise<void> {
 *     // Custom initialization
 *   }
 *
 *   async onRoleChange(event: RoleChangeEvent): Promise<PluginResponse> {
 *     // Handle role changes
 *     return this.successResponse();
 *   }
 * }
 * ```
 */
export abstract class BaseSecurityPlugin implements SecurityPlugin {
  /** Plugin metadata - must be overridden by subclasses */
  abstract readonly metadata: PluginMetadata;

  /** Current plugin state */
  private _state: PluginState = "unloaded";

  /** Security context from initialization */
  protected context: SecurityContext | null = null;

  /** Get current plugin state */
  get state(): PluginState {
    return this._state;
  }

  // ===========================================================================
  // Lifecycle Methods
  // ===========================================================================

  /**
   * Initialize the plugin
   * Calls doInitialize() which subclasses can override
   */
  async initialize(context: SecurityContext): Promise<void> {
    this._state = "initializing";
    this.context = context;

    try {
      await this.doInitialize();
      this._state = "ready";
      this.log("info", "Plugin initialized successfully");
    } catch (error) {
      this._state = "error";
      this.log("error", "Plugin initialization failed", { error });
      throw error;
    }
  }

  /**
   * Override this method for custom initialization logic
   */
  protected async doInitialize(): Promise<void> {
    // Default: no-op
  }

  /**
   * Shutdown the plugin
   * Calls doShutdown() which subclasses can override
   */
  async shutdown(): Promise<void> {
    try {
      await this.doShutdown();
      this._state = "unloaded";
      this.log("info", "Plugin shutdown complete");
    } catch (error) {
      this.log("error", "Plugin shutdown failed", { error });
      throw error;
    }
  }

  /**
   * Override this method for custom shutdown logic
   */
  protected async doShutdown(): Promise<void> {
    // Default: no-op
  }

  /**
   * Health check for the plugin
   * Override for custom health checks
   */
  async healthCheck(): Promise<boolean> {
    return this._state === "ready";
  }

  // ===========================================================================
  // Event Handlers (Override in subclasses)
  // ===========================================================================

  /**
   * Handle role change events
   * Override in subclasses that need to process role changes
   */
  async onRoleChange?(event: RoleChangeEvent): Promise<PluginResponse>;

  /**
   * Handle permission change events
   * Override in subclasses that need to process permission changes
   */
  async onPermissionChange?(
    event: PermissionChangeEvent
  ): Promise<PluginResponse>;

  /**
   * Handle threat detection events
   * Override in subclasses that need to process threat detections
   */
  async onThreatDetected?(event: ThreatDetectedEvent): Promise<PluginResponse>;

  /**
   * Handle generic security events
   * Override in subclasses that need to process custom events
   */
  async onEvent?(event: SecurityEvent): Promise<PluginResponse>;

  // ===========================================================================
  // Response Builders
  // ===========================================================================

  /**
   * Build a successful response
   */
  protected successResponse(options: {
    continueChain?: boolean;
    data?: unknown;
    executionTimeMs?: number;
  } = {}): PluginResponse {
    return {
      success: true,
      continueChain: options.continueChain ?? true,
      data: options.data,
      executionTimeMs: options.executionTimeMs ?? 0,
    };
  }

  /**
   * Build a failure response
   */
  protected failureResponse(
    error: Error | string,
    options: {
      continueChain?: boolean;
      recoverable?: boolean;
      executionTimeMs?: number;
    } = {}
  ): PluginResponse {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    return {
      success: false,
      continueChain: options.continueChain ?? true,
      error: {
        code: "PLUGIN_ERROR",
        message: errorMessage,
        stack: errorStack,
        recoverable: options.recoverable ?? true,
      },
      executionTimeMs: options.executionTimeMs ?? 0,
    };
  }

  /**
   * Build a response that blocks the event chain
   */
  protected blockResponse(
    reason: string,
    executionTimeMs: number = 0
  ): PluginResponse {
    return {
      success: true,
      continueChain: false,
      action: {
        type: "block",
        params: { reason },
        priority: 0,
      },
      executionTimeMs,
    };
  }

  /**
   * Build a response that triggers an alert
   */
  protected alertResponse(
    severity: "notice" | "warning" | "critical",
    message: string,
    executionTimeMs: number = 0
  ): PluginResponse {
    return {
      success: true,
      continueChain: true,
      action: {
        type: "alert",
        params: { severity, message },
        priority: severity === "critical" ? 0 : severity === "warning" ? 10 : 50,
      },
      executionTimeMs,
    };
  }

  // ===========================================================================
  // Logging Utilities
  // ===========================================================================

  /**
   * Log a message with plugin context
   */
  protected log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>
  ): void {
    const logContext = {
      plugin: this.metadata.id,
      pluginVersion: this.metadata.version,
      correlationId: this.context?.correlationId,
      ...data,
    };

    // Use structured logging format with plugin prefix
    const logMessage = `[${this.metadata.id}] ${message}`;

    switch (level) {
      case "debug":
        pluginLogger.debug(logMessage, logContext);
        break;
      case "info":
        pluginLogger.info(logMessage, logContext);
        break;
      case "warn":
        pluginLogger.warn(logMessage, logContext);
        break;
      case "error":
        pluginLogger.error(logMessage, logContext);
        break;
    }
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Check if a feature flag is enabled
   */
  protected isFeatureEnabled(flag: string): boolean {
    return this.context?.featureFlags[flag] ?? false;
  }

  /**
   * Get the current correlation ID for tracing
   */
  protected getCorrelationId(): string | undefined {
    return this.context?.correlationId;
  }

  /**
   * Measure execution time of an async operation
   */
  protected async measureTime<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; timeMs: number }> {
    const start = performance.now();
    const result = await operation();
    const timeMs = performance.now() - start;
    return { result, timeMs };
  }
}

// ============================================================================
// Plugin Decorators (Optional)
// ============================================================================

/**
 * Decorator to mark a method as requiring feature flag
 */
export function RequiresFeature(flag: string) {
  return function (
    _target: BaseSecurityPlugin,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: BaseSecurityPlugin,
      ...args: unknown[]
    ) {
      if (!this.isFeatureEnabled(flag)) {
        return {
          success: false,
          continueChain: true,
          executionTimeMs: 0,
          error: {
            code: "FEATURE_DISABLED",
            message: `Feature '${flag}' is not enabled`,
            recoverable: true,
          },
        };
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Decorator to add timing to a method
 */
export function Timed() {
  return function (
    _target: BaseSecurityPlugin,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: BaseSecurityPlugin,
      ...args: unknown[]
    ) {
      const start = performance.now();
      const result = await originalMethod.apply(this, args);
      const timeMs = performance.now() - start;

      // If result is a PluginResponse, update executionTimeMs
      if (result && typeof result === "object" && "success" in result) {
        return { ...result, executionTimeMs: timeMs };
      }

      return result;
    };

    return descriptor;
  };
}
