import { getLogger } from '../shared/logging/index.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';

const logger = getLogger();

// ============================================================================
// Type Definitions
// ============================================================================

export interface DexCounts {
  species?: number;
  moves?: number;
}

export interface RecordDexLoadOptions {
  runtime?: string;
  source?: string;
  counts?: DexCounts;
  manifestHash?: string;
  path?: string;
}

export interface RecordDexFallbackOptions {
  runtime?: string;
  reason?: string;
  error?: Error | unknown;
  counts?: DexCounts;
}

export interface RecordDexLookupOptions {
  runtime?: string;
  query?: string;
  resolution?: string;
  found?: boolean;
  durationMs?: number;
}

export interface RecordDexLookupMissOptions {
  runtime?: string;
  query?: string;
  attemptedResolutions?: string[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_RUNTIME = 'unknown';

// ============================================================================
// Internal Helpers
// ============================================================================

function serializeCounts(counts?: DexCounts): DexCounts | undefined {
  if (!counts || typeof counts !== 'object') {
    return undefined;
  }
  const { species, moves } = counts;
  return {
    species: typeof species === 'number' ? species : undefined,
    moves: typeof moves === 'number' ? moves : undefined,
  };
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Record a successful dex load event
 */
export function recordDexLoad({
  runtime = DEFAULT_RUNTIME,
  source,
  counts,
  manifestHash,
  path,
}: RecordDexLoadOptions = {}): void {
  logger.info('dex-metrics', 'load', 'Dex loaded', {
    metadata: {
      runtime,
      source,
      counts: serializeCounts(counts),
      manifestHash,
      path,
    }
  });
}

/**
 * Record a dex fallback event (when primary load fails)
 */
export function recordDexFallback({
  runtime = DEFAULT_RUNTIME,
  reason,
  error,
  counts,
}: RecordDexFallbackOptions = {}): void {
  logger.warn('dex-metrics', 'fallback', 'Dex fallback triggered', {
    error: error ? { name: 'DexFallbackError', message: getErrorMessage(error) } : undefined,
    metadata: {
      runtime,
      reason,
      counts: serializeCounts(counts),
    }
  });
}

/**
 * Record a dex lookup event
 */
export function recordDexLookup({
  runtime = DEFAULT_RUNTIME,
  query,
  resolution,
  found,
  durationMs,
}: RecordDexLookupOptions = {}): void {
  logger.debug('dex-metrics', 'lookup', 'Dex lookup performed', {
    durationMs: typeof durationMs === 'number' && Number.isFinite(durationMs) ? Math.max(0, durationMs) : undefined,
    metadata: {
      runtime,
      query,
      resolution,
      found: Boolean(found),
    }
  });
}

/**
 * Record a dex lookup miss event
 */
export function recordDexLookupMiss({
  runtime = DEFAULT_RUNTIME,
  query,
  attemptedResolutions,
}: RecordDexLookupMissOptions = {}): void {
  logger.debug('dex-metrics', 'lookupMiss', 'Dex lookup miss', {
    metadata: {
      runtime,
      query,
      attemptedResolutions,
    }
  });
}
