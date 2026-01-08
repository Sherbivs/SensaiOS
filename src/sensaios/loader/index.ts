/**
 * SensaiOS Module Loader — Ring Security Enforcement
 * 
 * This module provides ESM loader hooks for enforcing ring security
 * boundaries at the Node.js module loading level.
 * 
 * Usage:
 *   node --loader ./dist/sensaios/loader/module-hook.js src/index.js
 * 
 * Components:
 * - ring-resolver: Path analysis and ring level detection
 * - module-hook: ESM loader hooks (resolve, load)
 * 
 * @module sensaios/loader
 * @since 2026-01-04
 */

// Re-export ring resolver utilities
export {
  normalizePath,
  resolveModulePath,
  isExternalModule,
  getRingLevel,
  getRingInfo,
  clearRingCache,
  getCacheStats,
} from './ring-resolver.js';

// Re-export module hook utilities (for testing/monitoring)
// Note: The actual hooks (resolve, load) are used by Node.js directly
export {
  getLoaderStats,
  resetStats,
  clearModuleCache,
} from './module-hook.js';
