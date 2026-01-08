/**
 * SensaiOS Installation API
 * 
 * Exports core installation functions and types.
 * 
 * @module sensaios/install
 */

export { installApp } from './install-app.js';
export { uninstallApp, listDependents } from './uninstall-app.js';
export {
  resolveDependencies,
  detectCycles,
  topologicalSort,
  validateDependencies,
} from './dependency-resolver.js';
export {
  validateManifest,
  getDangerousCapabilities,
  appManifestSchema,
} from './manifest-schema.js';
export type {
  AppManifest,
  AppLifecycle,
  InstallResult,
  UninstallResult,
  DependencyGraph,
  DependencyNode,
} from './app-manifest.js';
