/**
 * Secure Import Module — Runtime Ring Boundary Enforcement
 * 
 * Validates dynamic imports against ring security boundaries.
 * ESLint catches static imports at compile-time; this module catches
 * dynamic imports (import(), require()) at runtime.
 * 
 * @module sensaios/security/secure-import
 * @since 2026-01-03
 */

import { SensaiError } from '../sensai-error.js';
import type { RingLevel } from '../types.js';
import { RING } from '../types.js';
import type { TenantScope } from '../tenant-scope.js';
import { scopedLogger } from '../../observability/envelope/console.js';

const log = scopedLogger('security.imports');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context for import validation
 */
export interface ImportContext {
  /** Component performing the import */
  component: string;

  /** Ring level of the importing component */
  ringLevel: RingLevel;

  /** Tenant scope for audit logging */
  scope: TenantScope;

  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Result of an import validation
 */
export interface ImportValidation {
  /** Whether the import is allowed */
  allowed: boolean;

  /** Module path being imported */
  modulePath: string;

  /** Ring level of the module being imported */
  targetRing: RingLevel;

  /** Ring level of the importing component */
  sourceRing: RingLevel;

  /** Reason for denial (if not allowed) */
  reason?: string;

  /** Timestamp of the validation */
  timestamp: Date;
}

// ============================================================================
// RING LEVEL DETECTION
// ============================================================================

/**
 * Check if a module path is an external (trusted) dependency
 * 
 * External modules include:
 * - Node.js builtins (node:fs, node:path)
 * - npm packages (prisma, discord.js, @scope/package)
 * - node_modules imports
 * 
 * These are considered trusted and ALLOWED for all rings.
 * 
 * @param modulePath - Module path to check
 * @returns True if external/trusted module
 */
function isExternalModule(modulePath: string): boolean {
  const normalized = modulePath.replace(/\\/g, '/');

  return (
    normalized.startsWith('node:') ||                           // node:fs, node:path
    normalized.includes('node_modules') ||                      // .../node_modules/...
    /^@[a-z0-9_-]+\/[a-z0-9_-]+/i.test(normalized) ||          // @scope/package
    (!normalized.startsWith('./') &&                            // Not relative
     !normalized.startsWith('../') &&                           // Not relative
     !normalized.includes('/src/') &&                           // Not src path
     !normalized.includes('\\') &&                              // No backslashes
     !normalized.endsWith('.ts') &&                             // Not TypeScript
     !normalized.endsWith('.js'))                               // Not JavaScript
  );
}

/**
 * Determine ring level from module path
 * 
 * Rules:
 * - src/kernel/** → Ring 0 (Kernel - INTERNAL, restricted for Apps)
 * - src/sensaios/** → Ring 1 (SensaiOS)
 * - src/bot/**, src/core/**, src/services/** → Ring 3 (Apps)
 * - External modules (node_modules, @scope) → Ring 0 (EXTERNAL, trusted for all)
 * 
 * @param modulePath - Module path to analyze
 * @returns Ring level of the module
 */
export function getRingLevel(modulePath: string): RingLevel {
  // Normalize path separators
  const normalized = modulePath.replace(/\\/g, '/');

  // External modules → Ring 0 EXTERNAL (trusted dependencies, allowed for all)
  if (isExternalModule(modulePath)) {
    return RING.KERNEL;
  }

  // Kernel modules → Ring 0 INTERNAL (restricted for Apps)
  if (normalized.includes('/kernel/') || normalized.includes('src/kernel')) {
    return RING.KERNEL;
  }

  // SensaiOS modules → Ring 1
  if (normalized.includes('/sensaios/') || normalized.includes('src/sensaios')) {
    return RING.SENSAIOS;
  }

  // Application modules → Ring 3
  if (
    normalized.includes('/bot/') ||
    normalized.includes('src/bot') ||
    normalized.includes('/core/') ||
    normalized.includes('src/core') ||
    normalized.includes('/services/') ||
    normalized.includes('src/services') ||
    normalized.includes('/app/') ||
    normalized.includes('src/app') ||
    normalized.includes('/observability/') ||
    normalized.includes('src/observability')
  ) {
    return RING.APPS;
  }

  // Default to Ring 3 (most restrictive for unknown paths)
  return RING.APPS;
}

// ============================================================================
// VISIBILITY RULES
// ============================================================================

/**
 * Assert that an import is allowed based on ring boundaries
 * 
 * Visibility Rules (one-way):
 * - Ring 0 (Kernel) → ANY (unrestricted)
 * - Ring 1 (SensaiOS) → Ring 0, Ring 1 (cannot import Ring 3)
 * - Ring 3 (Apps) → Ring 3 only (cannot import Ring 0 or Ring 1)
 * 
 * Apps must use ComponentContext interface (ctx.db, ctx.exports, etc.)
 * instead of importing kernel primitives directly.
 * 
 * @param from - Ring level of importing component
 * @param to - Module path being imported
 * @throws SensaiError if import violates ring boundaries
 * 
 * @example
 * ```ts
 * // App trying to import kernel
 * assertImportAllowed(RING.APPS, 'src/kernel/primitives/db.ts');
 * // Throws: 🚫 Ring 3 (Apps) CANNOT import from Ring 0 (Kernel)...
 * 
 * // Kernel importing anything
 * assertImportAllowed(RING.KERNEL, 'src/bot/commands/battle.ts');
 * // OK: Kernel can import from any ring
 * ```
 */
export function assertImportAllowed(from: RingLevel, to: string): void {
  const targetRing = getRingLevel(to);

  // Rule 1: Ring 0 (Kernel) can import anything
  if (from === RING.KERNEL) {
    return; // Unrestricted
  }

  // Rule 2: Ring 1 (SensaiOS) can import Ring 0 and Ring 1
  if (from === RING.SENSAIOS) {
    if (targetRing === RING.KERNEL || targetRing === RING.SENSAIOS) {
      return; // Allowed
    }

    // Denied: SensaiOS cannot import Apps
    throw new SensaiError({
      code: 3001, // Component error
      message: `🚫 Ring 1 (SensaiOS) CANNOT import from Ring 3 (Apps). Module: ${to}`,
      context: {
        sourceRing: from,
        targetRing,
        modulePath: to,
        rule: 'Ring 1 can only import Ring 0 (Kernel) and Ring 1 (SensaiOS)',
      },
    });
  }

  // Rule 3: Ring 3 (Apps) can import Ring 3 + external modules
  if (from === RING.APPS) {
    // Allow: Apps importing other Apps
    if (targetRing === RING.APPS) {
      return; // Allowed
    }

    // Allow: Apps importing external modules (trusted dependencies like prisma, @scope/package, node:*)
    if (targetRing === RING.KERNEL && isExternalModule(to)) {
      return; // Allowed - external dependencies are trusted
    }

    // Denied: Apps cannot import INTERNAL Kernel or SensaiOS
    const ringName = targetRing === RING.KERNEL ? 'Kernel' : 'SensaiOS';
    throw new SensaiError({
      code: 3002, // Component error
      message: `🚫 Ring 3 (Apps) CANNOT import from Ring ${targetRing} (${ringName}). Use ComponentContext interface instead. Module: ${to}`,
      context: {
        sourceRing: from,
        targetRing,
        modulePath: to,
        rule: 'Apps must use ctx.db, ctx.exports, etc. instead of importing kernel/sensaios directly',
        solution: 'Wrap handler with runGuarded() to get ComponentContext',
      },
    });
  }

  // Fallback: Unknown ring (should not happen)
  throw new SensaiError({
    code: 3003, // Component error
    message: `Unknown ring level for import validation. From: ${from}, To: ${to}`,
    context: { sourceRing: from, targetRing, modulePath: to },
  });
}

// ============================================================================
// SECURE IMPORT FUNCTION
// ============================================================================

/**
 * Securely import a module with ring boundary validation
 * 
 * This function validates dynamic imports against ring security boundaries.
 * If the import violates boundaries, it throws SecurityError.
 * If allowed, it performs the import and logs an audit event.
 * 
 * Usage:
 * - Wrap all dynamic import() calls with this function
 * - Provide accurate ImportContext with component name and ring level
 * - Handle SecurityError for denied imports
 * 
 * @param modulePath - Path to the module to import
 * @param context - Import context with component info and ring level
 * @returns Promise resolving to the imported module
 * @throws SensaiError if import violates ring boundaries
 * 
 * @example
 * ```ts
 * // Valid: Ring 1 importing Ring 0
 * const dbModule = await secureImport(
 *   'src/kernel/primitives/db.ts',
 *   {
 *     component: 'sensaios.supervisor',
 *     ringLevel: RING.SENSAIOS,
 *     scope: { tenant: 'system', ... }
 *   }
 * );
 * 
 * // Invalid: Ring 3 importing Ring 0
 * const dbModule = await secureImport(
 *   'src/kernel/primitives/db.ts',
 *   {
 *     component: 'game.battles',
 *     ringLevel: RING.APPS,
 *     scope: { tenant: 'guild-123', ... }
 *   }
 * );
 * // Throws: 🚫 Ring 3 (Apps) CANNOT import from Ring 0 (Kernel)...
 * ```
 */
export async function secureImport<T = unknown>(
  modulePath: string,
  context: ImportContext
): Promise<T> {
  const startTime = Date.now();
  const targetRing = getRingLevel(modulePath);

  // Validate ring boundaries
  try {
    assertImportAllowed(context.ringLevel, modulePath);
  } catch (error) {
    // Log denied import for security audit
    log.error('import.denied', 'Dynamic import blocked by ring security', {
      component: context.component,
      sourceRing: context.ringLevel,
      targetRing,
      modulePath,
      tenant: context.scope.tenant,
      correlationId: context.correlationId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Re-throw for caller to handle
    throw error;
  }

  // Import is allowed - perform the import
  try {
    const module = await import(modulePath);
    const duration = Date.now() - startTime;

    // Log successful import for audit trail
    log.info('import.allowed', 'Dynamic import validated and executed', {
      component: context.component,
      sourceRing: context.ringLevel,
      targetRing,
      modulePath,
      tenant: context.scope.tenant,
      correlationId: context.correlationId,
      durationMs: duration,
    });

    return module as T;
  } catch (error) {
    // Log import failure (non-security error)
    log.error('import.failed', 'Dynamic import failed (non-security)', {
      component: context.component,
      modulePath,
      tenant: context.scope.tenant,
      correlationId: context.correlationId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Validate an import without actually importing
 * 
 * Useful for checking imports before attempting them,
 * or for testing import validation logic.
 * 
 * @param modulePath - Path to validate
 * @param context - Import context
 * @returns Validation result with details
 * 
 * @example
 * ```ts
 * const validation = validateImport(
 *   'src/kernel/primitives/db.ts',
 *   {
 *     component: 'game.battles',
 *     ringLevel: RING.APPS,
 *     scope: { tenant: 'guild-123', ... }
 *   }
 * );
 * 
 * console.log(validation.allowed); // false
 * console.log(validation.reason); // "🚫 Ring 3 (Apps) CANNOT import..."
 * ```
 */
export function validateImport(
  modulePath: string,
  context: ImportContext
): ImportValidation {
  const targetRing = getRingLevel(modulePath);
  const timestamp = new Date();

  try {
    assertImportAllowed(context.ringLevel, modulePath);

    // Import is allowed
    return {
      allowed: true,
      modulePath,
      targetRing,
      sourceRing: context.ringLevel,
      timestamp,
    };
  } catch (error) {
    // Import is denied
    return {
      allowed: false,
      modulePath,
      targetRing,
      sourceRing: context.ringLevel,
      reason: error instanceof Error ? error.message : String(error),
      timestamp,
    };
  }
}
