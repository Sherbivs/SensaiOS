/**
 * Observability Hub Configuration
 * ================================
 *
 * Environment-based configuration for the Observability Hub.
 * Reads OBSERVABILITY_HUB_ENABLED to control the master switch.
 *
 * @module observability/hub/observability-config
 * @since 2025-12-20
 */

import type { HubConfig } from './observability-types.js';

// ============================================================================
// Environment Helpers
// ============================================================================

const env = (key: string, fallback: string): string => 
  process.env[key] ?? fallback;

const envBool = (key: string, fallback: boolean): boolean => 
  env(key, String(fallback)) === 'true';

// ============================================================================
// Hub Configuration
// ============================================================================

/**
 * Observability Hub configuration.
 * 
 * Environment Variables:
 * - OBSERVABILITY_HUB_ENABLED: Master switch (default: true)
 */
export const OBSERVABILITY_CONFIG: HubConfig = {
  enabled: envBool('OBSERVABILITY_HUB_ENABLED', true),
};

/**
 * Check if the hub is enabled.
 */
export function isHubEnabled(): boolean {
  return OBSERVABILITY_CONFIG.enabled;
}
