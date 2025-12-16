/**
 * Console System Barrel Export
 *
 * This module provides a unified entry point for console I/O operations:
 *
 * CAPTURE PATH (console-interceptor.ts):
 *   console.log() → Buffer → TimescaleDB
 *
 * RENDER PATH (console-renderer.ts):
 *   TimescaleDB → Query → Beautiful Console Output
 *
 * @module shared/console
 * @since 2025-06-15 (Phase 6 reorganization)
 */

// ============================================================================
// CONSOLE INTERCEPTOR EXPORTS
// Captures console output and buffers for TimescaleDB persistence
// ============================================================================

export {
  installConsoleInterceptor,
  uninstallConsoleInterceptor,
  getConsoleInterceptorStats,
  forceFlush,
  getOriginalConsole,
} from "./console-interceptor.js";

// ============================================================================
// CONSOLE RENDERER EXPORTS
// Renders beautiful console output from TimescaleDB data
// ============================================================================

export {
  initConsoleRenderer,
  startConsoleRenderer,
  stopConsoleRenderer,
  queryAndDisplayLogs,
  displayHealthDashboard,
  getRendererStats,
  updateConfig,
} from "./console-renderer.js";
