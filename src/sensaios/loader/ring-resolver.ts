/**
 * Ring Resolver — Determine Module Ring Level
 * 
 * Determines the security ring level for any module path.
 * Used by the module loader hook to enforce ring boundaries at load time.
 * 
 * Ring Levels:
 * - Ring 0 (KERNEL): src/kernel/** - Core primitives
 * - Ring 1 (SENSAIOS): src/sensaios/** - OS layer
 * - Ring 3 (APPS): src/bot/**, src/core/**, src/services/** - Applications
 * - External modules (node_modules, @scope) - Trusted, allowed for all rings
 * 
 * @module sensaios/loader/ring-resolver
 * @since 2026-01-04
 */

import type { RingLevel } from '../types.js';
import { RING } from '../types.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// ============================================================================
// MODULE REGISTRY (Static Analysis Cache)
// ============================================================================

/**
 * Cache of resolved ring levels per module path
 * Performance optimization to avoid repeated path analysis
 */
const ringLevelCache = new Map<string, RingLevel>();

/**
 * Maximum cache size to prevent unbounded growth
 */
const MAX_CACHE_SIZE = 10_000;

// ============================================================================
// PATH UTILITIES
// ============================================================================

/**
 * Normalize a module path for consistent comparison
 * Handles: file:// URLs, Windows backslashes, relative paths
 */
export function normalizePath(modulePath: string): string {
  // Handle file:// URLs
  if (modulePath.startsWith('file://')) {
    modulePath = fileURLToPath(modulePath);
  }
  
  // Convert Windows backslashes to forward slashes
  const normalized = modulePath.replace(/\\/g, '/');
  
  // Remove query strings and hashes (Node.js module resolution artifacts)
  const cleanPath = normalized.split('?')[0].split('#')[0];
  
  return cleanPath;
}

/**
 * Convert a module specifier to absolute path (if relative)
 * 
 * @param specifier - Module specifier (./foo, ../bar, /abs/path, package)
 * @param parentPath - Path of the importing module (for relative resolution)
 */
export function resolveModulePath(
  specifier: string,
  parentPath?: string
): string {
  // Already absolute or external
  if (
    specifier.startsWith('/') ||
    specifier.startsWith('file://') ||
    !specifier.startsWith('.') // Not relative
  ) {
    return normalizePath(specifier);
  }
  
  // Relative path - resolve from parent
  if (parentPath) {
    const parentDir = parentPath.replace(/\/[^/]+$/, ''); // Remove filename
    const resolved = resolve(parentDir, specifier);
    return normalizePath(resolved);
  }
  
  // No parent context - return as-is
  return normalizePath(specifier);
}

// ============================================================================
// EXTERNAL MODULE DETECTION
// ============================================================================

/**
 * Patterns that identify external (trusted) modules
 */
const EXTERNAL_PATTERNS = [
  // Node.js builtins
  /^node:/,
  
  // npm scoped packages
  /^@[a-z0-9_-]+\/[a-z0-9_-]+/i,
  
  // node_modules path
  /node_modules\//,
  
  // Common npm packages (non-scoped)
  /^(prisma|discord\.js|zod|express|fastify|pg|better-sqlite3)$/,
];

/**
 * File extensions that indicate local source files (not external)
 */
const SOURCE_EXTENSIONS = ['.ts', '.js', '.mts', '.mjs', '.cts', '.cjs'];

/**
 * Check if a module path refers to an external (trusted) dependency
 * 
 * External modules include:
 * - Node.js builtins (node:fs, node:path)
 * - npm packages (@scope/package, express, zod)
 * - node_modules paths
 * 
 * These are trusted and ALLOWED for all rings.
 * 
 * @param modulePath - Normalized module path
 * @returns True if external/trusted module
 */
export function isExternalModule(modulePath: string): boolean {
  const normalized = normalizePath(modulePath);
  
  // Check against external patterns
  for (const pattern of EXTERNAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }
  
  // Check if it's a relative import (always local)
  if (normalized.startsWith('./') || normalized.startsWith('../')) {
    return false;
  }
  
  // Check if it has a local source extension
  for (const ext of SOURCE_EXTENSIONS) {
    if (normalized.endsWith(ext)) {
      return false;
    }
  }
  
  // Check if it contains /src/ path (local source)
  if (normalized.includes('/src/') || normalized.includes('\\src\\')) {
    return false;
  }
  
  // Bare specifier without extension or /src/ is likely an external package
  if (
    !normalized.startsWith('/') &&
    !normalized.includes('/') &&
    !normalized.startsWith('.')
  ) {
    return true;
  }
  
  return false;
}

// ============================================================================
// RING LEVEL DETECTION
// ============================================================================

/**
 * Ring path patterns with priority order
 * First match wins - order matters!
 */
const RING_PATTERNS: Array<{ pattern: RegExp; ring: RingLevel; name: string }> = [
  // Ring 0: Kernel (highest priority)
  { pattern: /\/kernel\//, ring: RING.KERNEL, name: 'Kernel' },
  { pattern: /src\/kernel/, ring: RING.KERNEL, name: 'Kernel' },
  
  // Ring 1: SensaiOS
  { pattern: /\/sensaios\//, ring: RING.SENSAIOS, name: 'SensaiOS' },
  { pattern: /src\/sensaios/, ring: RING.SENSAIOS, name: 'SensaiOS' },
  
  // Ring 3: Applications
  { pattern: /\/bot\//, ring: RING.APPS, name: 'Bot' },
  { pattern: /src\/bot/, ring: RING.APPS, name: 'Bot' },
  { pattern: /\/core\//, ring: RING.APPS, name: 'Core' },
  { pattern: /src\/core/, ring: RING.APPS, name: 'Core' },
  { pattern: /\/services\//, ring: RING.APPS, name: 'Services' },
  { pattern: /src\/services/, ring: RING.APPS, name: 'Services' },
  { pattern: /\/app\//, ring: RING.APPS, name: 'App' },
  { pattern: /src\/app/, ring: RING.APPS, name: 'App' },
  { pattern: /\/observability\//, ring: RING.APPS, name: 'Observability' },
  { pattern: /src\/observability/, ring: RING.APPS, name: 'Observability' },
  { pattern: /\/workers\//, ring: RING.APPS, name: 'Workers' },
  { pattern: /src\/workers/, ring: RING.APPS, name: 'Workers' },
  { pattern: /\/shared\//, ring: RING.APPS, name: 'Shared' },
  { pattern: /src\/shared/, ring: RING.APPS, name: 'Shared' },
  { pattern: /\/generated\//, ring: RING.APPS, name: 'Generated' },
  { pattern: /src\/generated/, ring: RING.APPS, name: 'Generated' },
];

/**
 * Get the ring level for a module path
 * 
 * Determines which security ring a module belongs to based on its path.
 * External modules are treated as Ring 0 (Kernel) but with special
 * external=true flag for different access rules.
 * 
 * @param modulePath - Path to the module (absolute, relative, or specifier)
 * @returns Ring level (0, 1, or 3)
 * 
 * @example
 * ```ts
 * getRingLevel('src/kernel/primitives/db.ts');     // 0 (Kernel)
 * getRingLevel('src/sensaios/supervisor.ts');      // 1 (SensaiOS)
 * getRingLevel('src/bot/commands/battle.ts');      // 3 (Apps)
 * getRingLevel('prisma');                          // 0 (External/Trusted)
 * getRingLevel('@prisma/client');                  // 0 (External/Trusted)
 * getRingLevel('node:fs');                         // 0 (External/Trusted)
 * ```
 */
export function getRingLevel(modulePath: string): RingLevel {
  const normalized = normalizePath(modulePath);
  
  // Check cache first
  const cached = ringLevelCache.get(normalized);
  if (cached !== undefined) {
    return cached;
  }
  
  let ringLevel: RingLevel;
  
  // External modules are trusted (Ring 0 semantics for access)
  if (isExternalModule(normalized)) {
    ringLevel = RING.KERNEL;
  } else {
    // Check against ring patterns
    ringLevel = RING.APPS; // Default to most restrictive
    
    for (const { pattern, ring } of RING_PATTERNS) {
      if (pattern.test(normalized)) {
        ringLevel = ring;
        break; // First match wins
      }
    }
  }
  
  // Cache the result (with size limit)
  if (ringLevelCache.size < MAX_CACHE_SIZE) {
    ringLevelCache.set(normalized, ringLevel);
  }
  
  return ringLevel;
}

/**
 * Get detailed ring information for a module
 * 
 * Returns ring level plus additional context about why that level was assigned.
 * Useful for debugging and audit logging.
 * 
 * @param modulePath - Path to the module
 * @returns Detailed ring classification
 */
export function getRingInfo(modulePath: string): {
  path: string;
  ring: RingLevel;
  ringName: string;
  isExternal: boolean;
  matchedPattern?: string;
} {
  const normalized = normalizePath(modulePath);
  const isExternal = isExternalModule(normalized);
  
  if (isExternal) {
    return {
      path: normalized,
      ring: RING.KERNEL,
      ringName: 'External (Trusted)',
      isExternal: true,
    };
  }
  
  // Check ring patterns
  for (const { pattern, ring, name } of RING_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        path: normalized,
        ring,
        ringName: name,
        isExternal: false,
        matchedPattern: pattern.source,
      };
    }
  }
  
  // Default
  return {
    path: normalized,
    ring: RING.APPS,
    ringName: 'Unknown (defaulting to Apps)',
    isExternal: false,
  };
}

/**
 * Clear the ring level cache
 * 
 * Used for testing or when module paths change at runtime.
 */
export function clearRingCache(): void {
  ringLevelCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; maxSize: number } {
  return {
    size: ringLevelCache.size,
    maxSize: MAX_CACHE_SIZE,
  };
}
