/**
 * Capability Assertion Module
 * 
 * Implements runtime capability checks for Ring 0-3 security model.
 * Components must have valid capability grants before performing privileged operations.
 * 
 * @module sensaios/capabilities/assert-capability
 */

import type { PrismaClient } from '../../generated/prisma/client.js';
import { SensaiError } from '../sensai-error.js';
import type { TenantScope } from '../tenant-scope.js';
import type { CapabilityType } from '../types.js';
import { scopedLogger } from '../../observability/envelope/console.js';

const log = scopedLogger('capabilities');

/**
 * Result of a capability check
 */
export interface CapabilityCheckResult {
  /** Whether the capability is granted */
  granted: boolean;

  /** Reason for denial (if not granted) */
  reason?: string;

  /** Expiration time (if granted and temporary) */
  expiresAt?: Date | null;

  /** When the capability was granted */
  grantedAt?: Date;

  /** Who granted the capability */
  grantedBy?: string;
}

/**
 * Check if a component has a specific capability
 * 
 * Queries the ComponentCapability table for a valid grant:
 * - Must exist for the component and capability type
 * - Must not be revoked (revokedAt === null)
 * - Must not be expired (expiresAt === null || expiresAt > now)
 * - Scope must match (checked via JSON scope field)
 * 
 * Emits an audit event after the check via the exports log.
 * 
 * @param prisma - Prisma client for database access
 * @param component - Component name requesting the capability
 * @param capability - Capability type (e.g., "db.write", "discord.send")
 * @param scope - Tenant scope for the operation
 * @param correlationId - Optional correlation ID for tracing (used in audit event)
 * @returns Capability check result
 * 
 * @example
 * ```ts
 * const check = await checkCapability(
 *   prisma,
 *   'game.battles',
 *   'db.write',
 *   { tenant: 'guild-123', ... }
 * );
 * 
 * if (!check.granted) {
 *   throw new Error(`Missing capability: ${check.reason}`);
 * }
 * ```
 */
export async function checkCapability(
  prisma: PrismaClient,
  component: string,
  capability: CapabilityType,
  scope: TenantScope,
  correlationId?: string
): Promise<CapabilityCheckResult> {
  const now = new Date();

  try {
    // Query for capability grant
    const grant = await prisma.componentCapability.findFirst({
      where: {
        component,
        type: capability,
        revokedAt: null, // Not revoked
        OR: [
          { expiresAt: null }, // Never expires
          { expiresAt: { gt: now } }, // Not expired yet
        ],
      },
      orderBy: {
        createdAt: 'desc', // Most recent grant
      },
    });

    // No grant found
    if (!grant) {
      const result = {
        granted: false,
        reason: `Component '${component}' does not have capability '${capability}'`,
      };

      // Emit audit event for denial
      log.warn('capability.check', 'Capability denied (no grant)', {
        component,
        capability,
        tenant: scope.tenant,
        granted: false,
        reason: result.reason,
        correlationId,
      });

      return result;
    }

    // Check scope match if grant has scope restrictions
    if (grant.scope) {
      const grantScope = grant.scope as { tenant?: string };
      
      // If grant specifies tenant, it must match
      if (grantScope.tenant && grantScope.tenant !== scope.tenant) {
        const result = {
          granted: false,
          reason: `Capability '${capability}' not valid for tenant '${scope.tenant}'`,
        };

        // Emit audit event for scope mismatch
        log.warn('capability.check', 'Capability denied (scope mismatch)', {
          component,
          capability,
          tenant: scope.tenant,
          grantTenant: grantScope.tenant,
          granted: false,
          reason: result.reason,
          correlationId,
        });

        return result;
      }
    }

    // Grant is valid
    const result = {
      granted: true,
      expiresAt: grant.expiresAt ?? undefined,
      grantedAt: grant.createdAt,
      grantedBy: grant.grantedBy ?? undefined,
    };

    // Emit audit event
    log.info('capability.check', 'Capability granted', {
      component,
      capability,
      tenant: scope.tenant,
      granted: true,
      expiresAt: result.expiresAt?.toISOString(),
      correlationId,
    });

    return result;
  } catch (error) {
    // Database error
    const result = {
      granted: false,
      reason: `Database error checking capability: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };

    // Emit audit event for error
    log.error('capability.check', 'Capability check failed (database error)', {
      component,
      capability,
      tenant: scope.tenant,
      granted: false,
      reason: result.reason,
      correlationId,
    });

    return result;
  }
}

/**
 * Assert that a component has a capability (throws if denied)
 * 
 * This is the primary enforcement function used by kernel primitives.
 * If the capability is not granted, throws a SecurityError with code 4xxx.
 * 
 * @param prisma - Prisma client for database access
 * @param component - Component name requesting the capability
 * @param capability - Capability type (e.g., "db.write", "discord.send")
 * @param scope - Tenant scope for the operation
 * @param correlationId - Optional correlation ID for tracing
 * @throws {SensaiError} If capability is not granted (code 4000-4999)
 * 
 * @example
 * ```ts
 * // Throws if component doesn't have db.write capability
 * await assertCapability(
 *   prisma,
 *   'game.battles',
 *   'db.write',
 *   { tenant: 'guild-123', ... }
 * );
 * 
 * // If we get here, capability is granted - proceed with write
 * await prisma.battle.create({ ... });
 * ```
 */
export async function assertCapability(
  prisma: PrismaClient,
  component: string,
  capability: CapabilityType,
  scope: TenantScope,
  correlationId?: string
): Promise<void> {
  const check = await checkCapability(prisma, component, capability, scope, correlationId);

  if (!check.granted) {
    throw new SensaiError({
      code: 4001, // 4xxx = Validation errors
      message: `Capability denied: ${check.reason}`,
      context: {
        component,
        capability,
        scope,
        reason: check.reason,
        correlationId,
      },
    });
  }
}

/**
 * List all capabilities for a component
 * 
 * Returns all active (non-revoked, non-expired) capability types
 * for the given component and scope.
 * 
 * @param prisma - Prisma client for database access
 * @param component - Component name
 * @param scope - Tenant scope
 * @returns Array of capability types
 * 
 * @example
 * ```ts
 * const capabilities = await listCapabilities(
 *   prisma,
 *   'game.battles',
 *   { tenantId: 'prod', guildId: '123' }
 * );
 * 
 * console.log(capabilities); // ['db.read', 'db.write', 'exports.append']
 * ```
 */
export async function listCapabilities(
  prisma: PrismaClient,
  component: string,
  scope: TenantScope
): Promise<string[]> {
  const now = new Date();

  try {
    const grants = await prisma.componentCapability.findMany({
      where: {
        component,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      select: {
        type: true,
        scope: true,
      },
    });

    // Filter by scope and return unique types
    const capabilities = grants
      .filter((grant) => {
        if (!grant.scope) return true; // No scope restriction

        const grantScope = grant.scope as { tenant?: string };

        // Check tenant match
        if (grantScope.tenant && grantScope.tenant !== scope.tenant) {
          return false;
        }

        return true;
      })
      .map((grant) => grant.type);

    // Return unique capability types
    return Array.from(new Set(capabilities));
  } catch (error) {
    // Return empty array on database error
    log.error('list_capabilities', 'Error listing capabilities', { component, error: String(error) });
    return [];
  }
}
