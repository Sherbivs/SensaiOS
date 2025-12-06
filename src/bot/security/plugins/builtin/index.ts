/**
 * Built-in Security Plugins Index
 *
 * @module src/bot/security/plugins/builtin
 * @description Exports all built-in security plugins for the plugin system
 *
 * Built-in plugins provide core security functionality:
 * - RoleMonitorPlugin: Role change detection and DRIP alerts
 * - (Future) AuditLogPlugin: Comprehensive audit logging
 * - (Future) ThreatDetectorPlugin: Threat detection and response
 *
 * @since Sprint 0 - Foundation Enhancement
 * @version 1.0.0
 */

// ===========================================================================
// Plugin Exports
// ===========================================================================

export {
  RoleMonitorPlugin,
  createRoleMonitorPlugin,
} from "./role-monitor-plugin.js";

// ===========================================================================
// Factory Utilities
// ===========================================================================

import { RoleMonitorPlugin } from "./role-monitor-plugin.js";
import type { SecurityPlugin } from "../types.js";

/**
 * Map of built-in plugin IDs to their constructors
 */
export const BUILTIN_PLUGINS: Readonly<
  Record<string, () => SecurityPlugin>
> = {
  "role-monitor": () => new RoleMonitorPlugin(),
} as const;

/**
 * Get list of all built-in plugin IDs
 */
export function getBuiltinPluginIds(): readonly string[] {
  return Object.keys(BUILTIN_PLUGINS);
}

/**
 * Create a built-in plugin by ID
 */
export function createBuiltinPlugin(id: string): SecurityPlugin | null {
  const factory = BUILTIN_PLUGINS[id];
  return factory ? factory() : null;
}

/**
 * Create all built-in plugins
 */
export function createAllBuiltinPlugins(): SecurityPlugin[] {
  return Object.values(BUILTIN_PLUGINS).map((factory) => factory());
}
