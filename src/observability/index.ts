/**
 * Observability Suite — Public API
 * =================================
 *
 * Main entry point for the Observability Suite.
 * Provides lifecycle functions and status access.
 *
 * Usage:
 * ```typescript
 * import { startObservabilitySuite, stopObservabilitySuite } from './observability/index.js';
 *
 * // Start (after Event Bus is ready)
 * await startObservabilitySuite();
 *
 * // Stop (in shutdown handler)
 * await stopObservabilitySuite();
 * ```
 *
 * @module observability
 * @since 2025-12-20
 */

import { scopedLogger } from './envelope/console.js';
import { observabilityHub, isHubEnabled } from './hub/index.js';
import { lokiBackend } from './backends/loki/index.js';

/** Scoped logger for Observability Suite */
const log = scopedLogger('observability-suite');

// ============================================================================
// Suite Lifecycle
// ============================================================================

/**
 * Start the Observability Suite.
 *
 * 1. Registers all backends with the Hub
 * 2. Starts the Hub (which starts backends and subscribes to Event Bus)
 *
 * Call this AFTER Event Bus is initialized and ready.
 */
export async function startObservabilitySuite(): Promise<void> {
  if (!isHubEnabled()) {
    log.info('start', 'Disabled via OBSERVABILITY_HUB_ENABLED=false');
    return;
  }

  log.info('start', 'Starting...');

  // Register backends with hub
  observabilityHub.register(lokiBackend);

  // Start hub (starts backends, subscribes to Event Bus)
  await observabilityHub.start();

  log.info('start', 'Started successfully');
}

/**
 * Stop the Observability Suite gracefully.
 *
 * 1. Stops the Hub (which stops backends and unsubscribes from Event Bus)
 *
 * Call this in shutdown handler (SIGTERM/SIGINT).
 */
export async function stopObservabilitySuite(): Promise<void> {
  log.info('stop', 'Stopping...');
  await observabilityHub.stop();
  log.info('stop', 'Stopped');
}

// ============================================================================
// Suite Status
// ============================================================================

/**
 * Get comprehensive status of the Observability Suite.
 */
export function getObservabilitySuiteStatus() {
  const hubStatus = observabilityHub.getStatus();
  const lokiStatus = lokiBackend.getDetailedStatus();

  return {
    hub: hubStatus,
    backends: {
      loki: lokiStatus,
    },
  };
}

// ============================================================================
// Re-exports
// ============================================================================

// Hub
export { observabilityHub, isHubEnabled } from './hub/index.js';
export type {
  ObservabilityEvent,
  ObservabilityLevel,
  IObservabilityBackend,
  BackendStatus,
  HubStatus,
} from './hub/index.js';

// Loki backend
export { lokiBackend, isLokiEnabled, hasLokiEndpoint } from './backends/loki/index.js';
export type { LokiBackendStatus } from './backends/loki/index.js';
