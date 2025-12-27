/**
 * Kernel Module Index — Root Observer Layer
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * THE COMPLETE KERNEL API
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Re-exports all kernel functionality from a single entry point.
 * The kernel is the root observer layer that sits ABOVE all application code.
 * 
 * Usage:
 * ```typescript
 * // Import the unified Kernel interface
 * import Kernel from './kernel/index.js';
 * 
 * // Or import specific functions
 * import { kernel, captureError, getDashboard } from './kernel/index.js';
 * 
 * // Or import hooks for application integration
 * import { createLoggerHook, createErrorTrackerHook } from './kernel/kernel-hooks.js';
 * 
 * // Or import persistence functions
 * import { saveSnapshot, registerDatabaseHook } from './kernel/kernel-persistence.js';
 * ```
 * 
 * @module kernel
 */

// ─── Boot Kernel (Main Entry Point) ────────────────────────────────────────
export * from './boot-kernel.js';
export { default } from './boot-kernel.js';

// ─── Types ─────────────────────────────────────────────────────────────────
export * from './kernel-types.js';

// ─── Hooks (for application integration) ───────────────────────────────────
export {
  createLoggerHook,
  createErrorTrackerHook,
  createServiceRegistryHook,
  createEventBusHook,
  createDatabaseHook,
  createDiscordHook,
  createWorkerHook,
  createCacheHook,
  createCustomHook,
  subscribeToLogs,
  subscribeToErrors,
  subscribeToServices,
  subscribeToEvents,
  queryKernel,
  kernelLog,
} from './kernel-hooks.js';

// ─── Persistence (for data export and storage) ─────────────────────────────
export {
  initializePersistence,
  saveSnapshot,
  saveCrashReport,
  exportFullState,
  exportMetricsHistory,
  registerDatabaseHook,
  unregisterDatabaseHook,
  cleanupOldFiles,
  listSnapshots,
  getPersistenceStats,
  shutdownPersistence,
  createPrismaHook,
  type PersistenceConfig,
  type KernelSnapshot,
  type DatabaseExportHook,
} from './kernel-persistence.js';
