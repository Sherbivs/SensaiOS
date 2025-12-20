/**
 * Loki Backend Configuration
 * ==========================
 *
 * Environment-based configuration for the Loki observability backend.
 * Isolated from Hub and other backends.
 *
 * @module observability/backends/loki/loki-config
 * @since 2025-12-20
 */

// ============================================================================
// Environment Helpers
// ============================================================================

const env = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;

const envInt = (key: string, fallback: number): number =>
  parseInt(env(key, String(fallback)), 10);

const envBool = (key: string, fallback: boolean): boolean =>
  env(key, String(fallback)) === 'true';

// ============================================================================
// Loki Configuration
// ============================================================================

/**
 * Loki backend configuration.
 *
 * Environment Variables:
 * - LOKI_ENABLED: Enable/disable Loki backend (default: true)
 * - LOKI_ENDPOINT: Loki push URL (required, e.g., ngrok tunnel)
 * - LOKI_TIMEOUT_MS: HTTP timeout (default: 5000)
 * - LOKI_QUEUE_MAX_SIZE: Max queue depth (default: 10000)
 * - LOKI_FLUSH_INTERVAL_MS: Flush interval (default: 5000)
 * - LOKI_HEALTH_INTERVAL_MS: Health check interval (default: 60000)
 * - LOKI_BATCH_SIZE: Entries per flush batch (default: 100)
 * - LOKI_CB_FAILURES: Failures before circuit opens (default: 3)
 * - LOKI_CB_RESET_MS: Time before circuit re-probes (default: 60000)
 */
export const LOKI_CONFIG = {
  // Master switch
  enabled: envBool('LOKI_ENABLED', true),

  // Endpoint
  endpoint: env('LOKI_ENDPOINT', ''),
  timeoutMs: envInt('LOKI_TIMEOUT_MS', 5000),

  // Queue
  queueMaxSize: envInt('LOKI_QUEUE_MAX_SIZE', 10_000),

  // Workers
  flushIntervalMs: envInt('LOKI_FLUSH_INTERVAL_MS', 5000),
  healthIntervalMs: envInt('LOKI_HEALTH_INTERVAL_MS', 60_000),
  batchSize: envInt('LOKI_BATCH_SIZE', 100),

  // Circuit breaker
  circuitBreaker: {
    failureThreshold: envInt('LOKI_CB_FAILURES', 3),
    resetTimeMs: envInt('LOKI_CB_RESET_MS', 60_000),
  },

  // Labels (static, added to all log entries)
  labels: {
    job: 'infinity-gauntlet',
    environment: env('NODE_ENV', 'production'),
  },
} as const;

/**
 * Check if Loki backend is enabled.
 */
export function isLokiEnabled(): boolean {
  return LOKI_CONFIG.enabled;
}

/**
 * Check if Loki endpoint is configured.
 */
export function hasLokiEndpoint(): boolean {
  return LOKI_CONFIG.endpoint !== '';
}
