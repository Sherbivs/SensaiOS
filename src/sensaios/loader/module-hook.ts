/**
 * Module Loader Hook — Runtime Ring Security Enforcement
 * 
 * A Node.js ESM loader hook that intercepts all imports and enforces
 * ring security boundaries at load time. This is the deepest enforcement
 * layer - violations are caught before any code can execute.
 * 
 * Usage:
 *   node --loader ./dist/sensaios/loader/module-hook.js src/index.js
 * 
 * Ring Visibility Rules:
 * - Ring 0 (Kernel) → Any (unrestricted)
 * - Ring 1 (SensaiOS) → Ring 0, Ring 1 (cannot import Ring 3)
 * - Ring 3 (Apps) → Ring 3 + external modules only
 * 
 * @module sensaios/loader/module-hook
 * @since 2026-01-04
 */

import { performance } from 'node:perf_hooks';

// ============================================================================
// RING LEVEL DEFINITIONS (Inline to avoid import loops)
// ============================================================================

type RingLevel = 0 | 1 | 2 | 3;

const RING = {
  KERNEL: 0 as RingLevel,
  SENSAIOS: 1 as RingLevel,
  RESERVED: 2 as RingLevel,
  APPS: 3 as RingLevel,
} as const;

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Whether to enable security enforcement
 * Set SENSAIOS_LOADER_DISABLED=1 to bypass (for debugging/emergencies)
 */
const ENABLED = process.env.SENSAIOS_LOADER_DISABLED !== '1';

/**
 * Whether to log all import resolutions (verbose mode)
 * Set SENSAIOS_LOADER_VERBOSE=1 for detailed logging
 */
const VERBOSE = process.env.SENSAIOS_LOADER_VERBOSE === '1';

/**
 * Performance tracking
 */
const stats = {
  totalImports: 0,
  blockedImports: 0,
  allowedImports: 0,
  totalResolveTimeMs: 0,
  totalLoadTimeMs: 0,
  slowestResolveMs: 0,
  slowestLoadMs: 0,
};

// ============================================================================
// RING LEVEL DETECTION (Inline to avoid import loops in loader)
// ============================================================================

/**
 * External module patterns
 */
const EXTERNAL_PATTERNS = [
  /^node:/,
  /^@[a-z0-9_-]+\/[a-z0-9_-]+/i,
  /node_modules\//,
];

/**
 * Check if module is external (trusted)
 */
function isExternal(specifier: string): boolean {
  const normalized = specifier.replace(/\\/g, '/');
  
  for (const pattern of EXTERNAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }
  
  // Relative or absolute paths are not external
  if (normalized.startsWith('.') || normalized.startsWith('/') || normalized.startsWith('file:')) {
    return false;
  }
  
  // Has /src/ path - not external
  if (normalized.includes('/src/')) {
    return false;
  }
  
  // Bare specifier without dots/slashes - likely npm package
  return !normalized.includes('/');
}

/**
 * Ring path patterns
 */
const RING_PATTERNS: Array<{ pattern: RegExp; ring: RingLevel }> = [
  { pattern: /\/kernel\//, ring: RING.KERNEL },
  { pattern: /src\/kernel/, ring: RING.KERNEL },
  { pattern: /\/sensaios\//, ring: RING.SENSAIOS },
  { pattern: /src\/sensaios/, ring: RING.SENSAIOS },
  { pattern: /\/bot\//, ring: RING.APPS },
  { pattern: /src\/bot/, ring: RING.APPS },
  { pattern: /\/core\//, ring: RING.APPS },
  { pattern: /src\/core/, ring: RING.APPS },
  { pattern: /\/services\//, ring: RING.APPS },
  { pattern: /src\/services/, ring: RING.APPS },
  { pattern: /\/workers\//, ring: RING.APPS },
  { pattern: /src\/workers/, ring: RING.APPS },
  { pattern: /\/shared\//, ring: RING.APPS },
  { pattern: /src\/shared/, ring: RING.APPS },
  { pattern: /\/observability\//, ring: RING.APPS },
  { pattern: /src\/observability/, ring: RING.APPS },
  { pattern: /\/generated\//, ring: RING.APPS },
  { pattern: /src\/generated/, ring: RING.APPS },
];

/**
 * Get ring level from resolved URL
 */
function getRingLevel(url: string): RingLevel {
  const normalized = url.replace(/\\/g, '/');
  
  // External modules are trusted
  if (isExternal(normalized) || normalized.includes('node_modules')) {
    return RING.KERNEL;
  }
  
  // Check ring patterns
  for (const { pattern, ring } of RING_PATTERNS) {
    if (pattern.test(normalized)) {
      return ring;
    }
  }
  
  // Default to Apps (most restrictive)
  return RING.APPS;
}

/**
 * Get ring name for logging
 */
function getRingName(ring: RingLevel): string {
  switch (ring) {
    case RING.KERNEL: return 'Kernel';
    case RING.SENSAIOS: return 'SensaiOS';
    case RING.RESERVED: return 'Reserved';
    case RING.APPS: return 'Apps';
    default: return 'Unknown';
  }
}

// ============================================================================
// VISIBILITY RULES
// ============================================================================

/**
 * Check if import is allowed based on ring boundaries
 * 
 * @param fromRing - Ring of the importing module
 * @param toRing - Ring of the imported module
 * @param toUrl - URL of the imported module (for external detection)
 * @returns Object with allowed flag and reason
 */
function checkVisibility(
  fromRing: RingLevel,
  toRing: RingLevel,
  toUrl: string
): { allowed: boolean; reason?: string } {
  // External modules are always allowed (trusted dependencies)
  if (isExternal(toUrl) || toUrl.includes('node_modules')) {
    return { allowed: true };
  }
  
  // Ring 0 (Kernel) can import anything
  if (fromRing === RING.KERNEL) {
    return { allowed: true };
  }
  
  // Ring 1 (SensaiOS) can import Ring 0 and Ring 1
  if (fromRing === RING.SENSAIOS) {
    if (toRing === RING.KERNEL || toRing === RING.SENSAIOS) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Ring 1 (SensaiOS) cannot import Ring ${toRing} (${getRingName(toRing)}). SensaiOS can only import Kernel and SensaiOS modules.`,
    };
  }
  
  // Ring 3 (Apps) can only import Ring 3 and external modules
  if (fromRing === RING.APPS) {
    if (toRing === RING.APPS) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Ring 3 (Apps) cannot import Ring ${toRing} (${getRingName(toRing)}). Apps must use ComponentContext (ctx.db, ctx.exports, etc.) instead of importing kernel/sensaios directly.`,
    };
  }
  
  // Default: deny unknown scenarios
  return {
    allowed: false,
    reason: `Unknown ring ${fromRing} attempting to import ring ${toRing}`,
  };
}

// ============================================================================
// PARENT MODULE TRACKING
// ============================================================================

/**
 * Track the ring level of each loaded module
 * Key: resolved URL, Value: ring level
 */
const moduleRings = new Map<string, RingLevel>();

/**
 * Get the ring level of a parent module (importing module)
 * 
 * Note: The loader hooks don't directly give us the parent URL in resolve,
 * but we can infer it from the parentURL parameter when available.
 */
function getParentRing(parentURL: string | undefined): RingLevel {
  if (!parentURL) {
    // Entry point - no parent, treat as Kernel (bootstrap)
    return RING.KERNEL;
  }
  
  // Check if we've seen this module before
  const cached = moduleRings.get(parentURL);
  if (cached !== undefined) {
    return cached;
  }
  
  // Determine from URL
  return getRingLevel(parentURL);
}

// ============================================================================
// LOADER HOOKS (Node.js ESM Loader API)
// ============================================================================

/**
 * resolve hook — Called for every import specifier
 * 
 * This is where we check ring visibility rules BEFORE the module is loaded.
 * If the import violates ring boundaries, we throw an error immediately.
 * 
 * @param specifier - The import specifier (e.g., './foo.js', '@prisma/client')
 * @param context - Context including parentURL
 * @param nextResolve - Default resolver to chain to
 */
export async function resolve(
  specifier: string,
  context: { parentURL?: string; conditions: string[] },
  nextResolve: (specifier: string, context: { parentURL?: string; conditions: string[] }) => Promise<{ url: string; format?: string; shortCircuit?: boolean }>
): Promise<{ url: string; format?: string; shortCircuit?: boolean }> {
  const startTime = performance.now();
  stats.totalImports++;
  
  try {
    // Get default resolution first (to have the full URL)
    const resolved = await nextResolve(specifier, context);
    const resolveTime = performance.now() - startTime;
    stats.totalResolveTimeMs += resolveTime;
    if (resolveTime > stats.slowestResolveMs) {
      stats.slowestResolveMs = resolveTime;
    }
    
    // Skip enforcement if disabled
    if (!ENABLED) {
      return resolved;
    }
    
    // Get ring levels
    const parentRing = getParentRing(context.parentURL);
    const targetRing = getRingLevel(resolved.url);
    
    // Store the resolved module's ring level
    moduleRings.set(resolved.url, targetRing);
    
    // Check visibility rules
    const check = checkVisibility(parentRing, targetRing, resolved.url);
    
    if (VERBOSE) {
      console.log(
        `[LOADER] ${check.allowed ? '✅' : '🚫'} ` +
        `Ring ${parentRing} (${getRingName(parentRing)}) → ` +
        `Ring ${targetRing} (${getRingName(targetRing)}): ` +
        `${specifier}`
      );
    }
    
    if (!check.allowed) {
      stats.blockedImports++;
      
      // Format a helpful error message
      const error = new Error(
        `🛡️ RING SECURITY VIOLATION\n\n` +
        `${check.reason}\n\n` +
        `  Import: ${specifier}\n` +
        `  From: ${context.parentURL || '(entry point)'}\n` +
        `  To: ${resolved.url}\n\n` +
        `Solution: Use ComponentContext interface instead of direct imports.\n` +
        `See: docs/projects/SensaiOS/architecture/06-os-security-model.md`
      );
      error.name = 'ImportSecurityError';
      throw error;
    }
    
    stats.allowedImports++;
    return resolved;
    
  } catch (error) {
    // Re-throw security errors as-is
    if (error instanceof Error && error.name === 'ImportSecurityError') {
      throw error;
    }
    
    // For other errors (module not found, etc.), let them through
    throw error;
  }
}

/**
 * load hook — Called when actually loading a module
 * 
 * We primarily use this for performance tracking and verbose logging.
 * The security check is done in resolve() before we get here.
 * 
 * @param url - The resolved URL of the module
 * @param context - Context including format
 * @param nextLoad - Default loader to chain to
 */
export async function load(
  url: string,
  context: { format?: string; importAttributes?: Record<string, string> },
  nextLoad: (url: string, context: { format?: string; importAttributes?: Record<string, string> }) => Promise<{ format: string; source: string | ArrayBuffer; shortCircuit?: boolean }>
): Promise<{ format: string; source: string | ArrayBuffer; shortCircuit?: boolean }> {
  const startTime = performance.now();
  
  const result = await nextLoad(url, context);
  
  const loadTime = performance.now() - startTime;
  stats.totalLoadTimeMs += loadTime;
  if (loadTime > stats.slowestLoadMs) {
    stats.slowestLoadMs = loadTime;
  }
  
  return result;
}

// ============================================================================
// STATISTICS API (For monitoring/debugging)
// ============================================================================

/**
 * Get loader statistics
 * 
 * Useful for monitoring performance impact and security events.
 * Access via: process.loaderStats (exposed below)
 */
export function getLoaderStats() {
  const avgResolve = stats.totalImports > 0
    ? stats.totalResolveTimeMs / stats.totalImports
    : 0;
  const avgLoad = stats.totalImports > 0
    ? stats.totalLoadTimeMs / stats.totalImports
    : 0;
  
  return {
    ...stats,
    avgResolveTimeMs: avgResolve,
    avgLoadTimeMs: avgLoad,
    securityEnabled: ENABLED,
    verboseMode: VERBOSE,
    cachedModules: moduleRings.size,
  };
}

/**
 * Reset statistics (for testing)
 */
export function resetStats() {
  stats.totalImports = 0;
  stats.blockedImports = 0;
  stats.allowedImports = 0;
  stats.totalResolveTimeMs = 0;
  stats.totalLoadTimeMs = 0;
  stats.slowestResolveMs = 0;
  stats.slowestLoadMs = 0;
}

/**
 * Clear module ring cache (for testing)
 */
export function clearModuleCache() {
  moduleRings.clear();
}

// ============================================================================
// GLOBAL EXPOSURE (For runtime access to stats)
// ============================================================================

// Make stats accessible at runtime via globalThis
(globalThis as Record<string, unknown>).sensaiOSLoaderStats = getLoaderStats;

// Log startup message
if (ENABLED) {
  console.log('[SensaiOS] 🛡️ Module loader security hook active');
  if (VERBOSE) {
    console.log('[SensaiOS] Verbose mode enabled (SENSAIOS_LOADER_VERBOSE=1)');
  }
} else {
  console.log('[SensaiOS] ⚠️ Module loader security DISABLED (SENSAIOS_LOADER_DISABLED=1)');
}
