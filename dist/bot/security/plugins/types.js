/**
 * Security Plugin System — Type Definitions
 *
 * @module src/bot/security/plugins/types
 * @description Core types for the security plugin architecture
 *
 * Research Sources:
 * - Plugin Pattern: https://refactoring.guru/design-patterns/strategy
 * - Event-Driven Architecture: Martin Fowler, "Patterns of Enterprise Application Architecture"
 *
 * @since Sprint 0 - Foundation Enhancement
 * @version 1.0.0
 */
/**
 * Plugin priority levels (lower = higher priority)
 */
export var PluginPriority;
(function (PluginPriority) {
    PluginPriority[PluginPriority["CRITICAL"] = 0] = "CRITICAL";
    PluginPriority[PluginPriority["HIGH"] = 10] = "HIGH";
    PluginPriority[PluginPriority["NORMAL"] = 50] = "NORMAL";
    PluginPriority[PluginPriority["LOW"] = 100] = "LOW";
})(PluginPriority || (PluginPriority = {}));
/**
 * Default plugin system configuration
 */
export const DEFAULT_PLUGIN_CONFIG = {
    pluginDirectory: "src/bot/security/plugins/implementations",
    hotReloadEnabled: process.env.NODE_ENV !== "production",
    hotReloadDebounceMs: 500,
    maxPlugins: 50,
    executionTimeoutMs: 5000,
    metricsEnabled: true,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
};
