/**
 * Security Plugins - Public API
 *
 * @module src/bot/security/plugins
 * @description Central export point for the security plugin system
 *
 * This module provides:
 * - Plugin type definitions and interfaces
 * - Plugin registry for management and lifecycle
 * - Base class for creating custom plugins
 * - Built-in plugins for common security features
 *
 * @since Sprint 0 - Foundation Enhancement
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   pluginRegistry,
 *   BaseSecurityPlugin,
 *   type SecurityPlugin,
 *   type RoleChangeEvent,
 * } from './plugins/index.js';
 *
 * // Create and register a custom plugin
 * class MyPlugin extends BaseSecurityPlugin {
 *   // ... implementation
 * }
 *
 * pluginRegistry.register(new MyPlugin());
 * ```
 */
// Enums need value export, not just type export
export { PluginPriority } from "./types.js";
// ===========================================================================
// Core Classes
// ===========================================================================
export { PluginRegistry, pluginRegistry } from "./registry.js";
export { BaseSecurityPlugin } from "./base-plugin.js";
// ===========================================================================
// Built-in Plugins (to be implemented in Sprint 0)
// ===========================================================================
// These will be exported once implemented:
// export { RoleMonitorPlugin } from './builtin/role-monitor-plugin.js';
// export { ThreatDetectorPlugin } from './builtin/threat-detector-plugin.js';
// export { BaselinePlugin } from './builtin/baseline-plugin.js';
// export { AuditLogPlugin } from './builtin/audit-log-plugin.js';
// ===========================================================================
// Convenience Helpers
// ===========================================================================
/**
 * Get the global plugin registry instance
 *
 * @returns The singleton PluginRegistry instance
 *
 * @example
 * ```typescript
 * const registry = getPluginRegistry();
 * registry.register(myPlugin);
 * ```
 */
export function getPluginRegistry() {
    // Dynamic import to avoid circular dependency issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { pluginRegistry: registry } = require("./registry.js");
    return registry;
}
/**
 * Check if a specific plugin is registered and enabled
 *
 * @param pluginId - The unique identifier of the plugin
 * @returns True if the plugin is registered and in 'ready' state
 */
export function isPluginEnabled(pluginId) {
    const registry = getPluginRegistry();
    const plugin = registry.getPlugin(pluginId);
    return plugin !== undefined && plugin.state === "ready";
}
/**
 * Get all registered plugin IDs
 *
 * @returns Array of registered plugin IDs
 */
export function getRegisteredPluginIds() {
    const registry = getPluginRegistry();
    const plugins = registry.getAllPlugins();
    return Array.from(plugins.keys());
}
