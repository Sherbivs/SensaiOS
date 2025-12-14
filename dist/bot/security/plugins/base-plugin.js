/**
 * Base Security Plugin
 *
 * @module src/bot/security/plugins/base-plugin
 * @description Abstract base class for security plugins with common functionality
 *
 * @since Sprint 0 - Foundation Enhancement
 * @version 1.0.0
 */
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
export class BaseSecurityPlugin {
    /** Current plugin state */
    _state = "unloaded";
    /** Security context from initialization */
    context = null;
    /** Get current plugin state */
    get state() {
        return this._state;
    }
    // ===========================================================================
    // Lifecycle Methods
    // ===========================================================================
    /**
     * Initialize the plugin
     * Calls doInitialize() which subclasses can override
     */
    async initialize(context) {
        this._state = "initializing";
        this.context = context;
        try {
            await this.doInitialize();
            this._state = "ready";
            this.log("info", "Plugin initialized successfully");
        }
        catch (error) {
            this._state = "error";
            this.log("error", "Plugin initialization failed", { error });
            throw error;
        }
    }
    /**
     * Override this method for custom initialization logic
     */
    async doInitialize() {
        // Default: no-op
    }
    /**
     * Shutdown the plugin
     * Calls doShutdown() which subclasses can override
     */
    async shutdown() {
        try {
            await this.doShutdown();
            this._state = "unloaded";
            this.log("info", "Plugin shutdown complete");
        }
        catch (error) {
            this.log("error", "Plugin shutdown failed", { error });
            throw error;
        }
    }
    /**
     * Override this method for custom shutdown logic
     */
    async doShutdown() {
        // Default: no-op
    }
    /**
     * Health check for the plugin
     * Override for custom health checks
     */
    async healthCheck() {
        return this._state === "ready";
    }
    // ===========================================================================
    // Response Builders
    // ===========================================================================
    /**
     * Build a successful response
     */
    successResponse(options = {}) {
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
    failureResponse(error, options = {}) {
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
    blockResponse(reason, executionTimeMs = 0) {
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
    alertResponse(severity, message, executionTimeMs = 0) {
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
    log(level, message, data) {
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
    isFeatureEnabled(flag) {
        return this.context?.featureFlags[flag] ?? false;
    }
    /**
     * Get the current correlation ID for tracing
     */
    getCorrelationId() {
        return this.context?.correlationId;
    }
    /**
     * Measure execution time of an async operation
     */
    async measureTime(operation) {
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
export function RequiresFeature(flag) {
    return function (_target, _propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
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
    return function (_target, _propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
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
