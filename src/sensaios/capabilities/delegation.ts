/**
 * Capability Delegation for SensaiOS
 * 
 * Implements time-bounded capability grants for cross-ring access:
 * - Short-lived grants (seconds to minutes)
 * - Automatic expiration and cleanup
 * - Delegation chains (A grants to B, B cannot grant further)
 * - Audit trail for all delegations
 * 
 * @module sensaios/capabilities/delegation
 * @version 1.0.0
 */

import type { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import type { TenantScope } from '../tenant-scope.js';
import type { CapabilityType } from '../types.js';
import { scopedLogger } from '../../observability/envelope/console.js';

const log = scopedLogger('capability-delegation');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Delegation token - proof of temporary capability grant
 */
export interface DelegationToken {
  /** Unique token ID */
  id: string;

  /** Component that delegated the capability */
  delegator: string;

  /** Component receiving the capability */
  delegatee: string;

  /** Capability type being delegated */
  capability: CapabilityType;

  /** Tenant scope restriction */
  scope: TenantScope;

  /** When the delegation was created */
  createdAt: Date;

  /** When the delegation expires */
  expiresAt: Date;

  /** Maximum uses (null = unlimited until expiry) */
  maxUses?: number;

  /** Current use count */
  useCount: number;

  /** Reason for delegation */
  reason?: string;

  /** Correlation ID for tracing */
  correlationId?: string;

  /** Whether this delegation can be re-delegated (chain) */
  chainable: boolean;

  /** Parent delegation ID (if this is a chained delegation) */
  parentId?: string;
}

/**
 * Delegation request
 */
export interface DelegationRequest {
  /** Component requesting delegation power */
  delegator: string;

  /** Component to receive the capability */
  delegatee: string;

  /** Capability to delegate */
  capability: CapabilityType;

  /** Scope restriction */
  scope: TenantScope;

  /** TTL in seconds (max 3600 = 1 hour) */
  ttlSeconds: number;

  /** Max uses (optional) */
  maxUses?: number;

  /** Reason (for audit) */
  reason?: string;

  /** Allow re-delegation */
  chainable?: boolean;

  /** Correlation ID */
  correlationId?: string;
}

/**
 * Delegation validation result
 */
export interface DelegationValidation {
  /** Whether the delegation is valid */
  valid: boolean;

  /** Token if valid */
  token?: DelegationToken;

  /** Reason if invalid */
  reason?: string;
}

/**
 * Delegation statistics
 */
export interface DelegationStats {
  /** Active delegations */
  active: number;

  /** Total delegations created */
  totalCreated: number;

  /** Delegations expired */
  expired: number;

  /** Delegations exhausted (max uses reached) */
  exhausted: number;

  /** Delegations revoked */
  revoked: number;

  /** Chain depth (max delegation depth seen) */
  maxChainDepth: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum TTL for delegations (1 hour) */
const MAX_TTL_SECONDS = 3600;

/** Maximum delegation chain depth */
const MAX_CHAIN_DEPTH = 3;

/** Cleanup interval (every 5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// ============================================================================
// DELEGATION MANAGER
// ============================================================================

/**
 * CapabilityDelegationManager — Time-bounded capability grants
 * 
 * Allows Ring 3 components to temporarily grant capabilities to other components
 * for specific operations. All delegations are:
 * - **Time-bounded**: Auto-expire after TTL
 * - **Scoped**: Restricted to specific tenant
 * - **Audited**: Full trail of delegations
 * - **Limited**: Max chain depth, max uses
 * 
 * @example
 * ```ts
 * const delegation = getDelegationManager();
 * 
 * // Component A grants temporary db.read to Component B
 * const token = await delegation.delegate(prisma, {
 *   delegator: 'game.core',
 *   delegatee: 'game.analytics',
 *   capability: 'db.read',
 *   scope: ctx.scope,
 *   ttlSeconds: 60, // 1 minute
 *   reason: 'Post-battle analytics',
 * });
 * 
 * // Component B validates and uses the delegation
 * const validation = await delegation.validate(token.id, 'game.analytics', ctx.scope);
 * if (validation.valid) {
 *   await delegation.recordUse(token.id);
 *   // Perform the operation...
 * }
 * ```
 */
export class CapabilityDelegationManager {
  /** In-memory delegation store (production would use database) */
  private readonly delegations = new Map<string, DelegationToken>();

  /** Statistics */
  private stats: DelegationStats = {
    active: 0,
    totalCreated: 0,
    expired: 0,
    exhausted: 0,
    revoked: 0,
    maxChainDepth: 0,
  };

  /** Cleanup interval handle */
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    log.info('init', 'Capability delegation manager initialized');
  }

  // ==========================================================================
  // DELEGATION OPERATIONS
  // ==========================================================================

  /**
   * Create a delegation token
   * 
   * @param prisma - Prisma client (to verify delegator has the capability)
   * @param request - Delegation request
   * @returns Delegation token
   */
  async delegate(prisma: PrismaClient, request: DelegationRequest): Promise<DelegationToken> {
    // Validate TTL
    const ttl = Math.min(request.ttlSeconds, MAX_TTL_SECONDS);
    if (ttl <= 0) {
      throw new Error('TTL must be positive');
    }

    // Check if delegator has the capability
    const hasCapability = await this.verifyDelegatorCapability(
      prisma,
      request.delegator,
      request.capability,
      request.scope
    );

    if (!hasCapability) {
      throw new Error(
        `Delegator '${request.delegator}' does not have capability '${request.capability}' to delegate`
      );
    }

    // Check chain depth if this is a chained delegation
    if (request.chainable) {
      // Find existing delegations from this delegator for this capability
      // that were themselves delegations
      const depth = this.calculateChainDepth(request.delegator, request.capability);
      if (depth >= MAX_CHAIN_DEPTH) {
        throw new Error(`Maximum delegation chain depth (${MAX_CHAIN_DEPTH}) exceeded`);
      }
    }

    // Generate token
    const token: DelegationToken = {
      id: crypto.randomBytes(16).toString('hex'),
      delegator: request.delegator,
      delegatee: request.delegatee,
      capability: request.capability,
      scope: request.scope,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + ttl * 1000),
      maxUses: request.maxUses,
      useCount: 0,
      reason: request.reason,
      correlationId: request.correlationId,
      chainable: request.chainable ?? false,
    };

    // Store delegation
    this.delegations.set(token.id, token);
    this.stats.active++;
    this.stats.totalCreated++;

    // Track chain depth
    const depth = this.calculateChainDepth(request.delegatee, request.capability);
    this.stats.maxChainDepth = Math.max(this.stats.maxChainDepth, depth);

    log.info('delegate', 'Capability delegated', {
      id: token.id.slice(0, 12),
      delegator: request.delegator,
      delegatee: request.delegatee,
      capability: request.capability,
      ttlSeconds: ttl,
      expiresAt: token.expiresAt.toISOString(),
    });

    return token;
  }

  /**
   * Validate a delegation token
   * 
   * @param tokenId - Delegation token ID
   * @param component - Component attempting to use the delegation
   * @param scope - Tenant scope for the operation
   * @returns Validation result
   */
  async validate(
    tokenId: string,
    component: string,
    scope: TenantScope
  ): Promise<DelegationValidation> {
    const token = this.delegations.get(tokenId);

    // Token not found
    if (!token) {
      return {
        valid: false,
        reason: 'Delegation token not found or expired',
      };
    }

    // Check delegatee
    if (token.delegatee !== component) {
      return {
        valid: false,
        reason: `Token was delegated to '${token.delegatee}', not '${component}'`,
      };
    }

    // Check expiration
    if (new Date() > token.expiresAt) {
      // Clean up expired token
      this.delegations.delete(tokenId);
      this.stats.active--;
      this.stats.expired++;

      return {
        valid: false,
        reason: 'Delegation has expired',
      };
    }

    // Check use count
    if (token.maxUses !== undefined && token.useCount >= token.maxUses) {
      // Clean up exhausted token
      this.delegations.delete(tokenId);
      this.stats.active--;
      this.stats.exhausted++;

      return {
        valid: false,
        reason: 'Delegation max uses exceeded',
      };
    }

    // Check scope
    if (token.scope.tenant !== scope.tenant) {
      return {
        valid: false,
        reason: `Delegation is for tenant '${token.scope.tenant}', not '${scope.tenant}'`,
      };
    }

    return {
      valid: true,
      token,
    };
  }

  /**
   * Record use of a delegation
   * 
   * @param tokenId - Token ID
   */
  async recordUse(tokenId: string): Promise<void> {
    const token = this.delegations.get(tokenId);
    if (token) {
      token.useCount++;

      // Check if exhausted
      if (token.maxUses !== undefined && token.useCount >= token.maxUses) {
        this.delegations.delete(tokenId);
        this.stats.active--;
        this.stats.exhausted++;

        log.info('recordUse', 'Delegation exhausted', {
          id: tokenId.slice(0, 12),
          uses: token.useCount,
        });
      }
    }
  }

  /**
   * Revoke a delegation
   * 
   * @param tokenId - Token ID
   * @param revoker - Component revoking (must be delegator)
   * @returns Whether revocation succeeded
   */
  async revoke(tokenId: string, revoker: string): Promise<boolean> {
    const token = this.delegations.get(tokenId);

    if (!token) {
      return false;
    }

    // Only delegator can revoke
    if (token.delegator !== revoker) {
      log.warn('revoke', 'Unauthorized revocation attempt', {
        tokenId: tokenId.slice(0, 12),
        delegator: token.delegator,
        revoker,
      });
      return false;
    }

    this.delegations.delete(tokenId);
    this.stats.active--;
    this.stats.revoked++;

    log.info('revoke', 'Delegation revoked', {
      id: tokenId.slice(0, 12),
      delegator: revoker,
      delegatee: token.delegatee,
    });

    return true;
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Get all active delegations for a component
   */
  getDelegationsFor(component: string): DelegationToken[] {
    return Array.from(this.delegations.values())
      .filter(t => t.delegatee === component && new Date() < t.expiresAt);
  }

  /**
   * Get all delegations created by a component
   */
  getDelegationsBy(component: string): DelegationToken[] {
    return Array.from(this.delegations.values())
      .filter(t => t.delegator === component && new Date() < t.expiresAt);
  }

  /**
   * Get statistics
   */
  getStats(): DelegationStats {
    return { ...this.stats };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Verify delegator has the capability to delegate
   */
  private async verifyDelegatorCapability(
    prisma: PrismaClient,
    delegator: string,
    capability: CapabilityType,
    _scope: TenantScope
  ): Promise<boolean> {
    try {
      const now = new Date();
      const grant = await prisma.componentCapability.findFirst({
        where: {
          component: delegator,
          type: capability,
          revokedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
      });

      return !!grant;
    } catch (error) {
      log.error('verifyDelegatorCapability', 'Failed to verify capability', {
        delegator,
        capability,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Calculate delegation chain depth for a component
   */
  private calculateChainDepth(component: string, capability: CapabilityType): number {
    let depth = 0;
    let current = component;
    const visited = new Set<string>();

    // Walk back the delegation chain
    for (const token of this.delegations.values()) {
      if (token.delegatee === current && token.capability === capability) {
        if (visited.has(token.delegator)) {
          // Cycle detected - shouldn't happen with proper validation
          break;
        }
        visited.add(current);
        current = token.delegator;
        depth++;

        if (depth >= MAX_CHAIN_DEPTH) break;
      }
    }

    return depth;
  }

  /**
   * Cleanup expired delegations
   */
  private cleanup(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [id, token] of this.delegations) {
      if (now > token.expiresAt) {
        this.delegations.delete(id);
        this.stats.active--;
        this.stats.expired++;
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug('cleanup', 'Cleaned expired delegations', { cleaned });
    }
  }

  /**
   * Shutdown manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.delegations.clear();
    log.info('shutdown', 'Delegation manager shutdown');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let delegationManagerInstance: CapabilityDelegationManager | null = null;

/**
 * Get singleton delegation manager
 */
export function getDelegationManager(): CapabilityDelegationManager {
  if (!delegationManagerInstance) {
    delegationManagerInstance = new CapabilityDelegationManager();
  }
  return delegationManagerInstance;
}

/**
 * Shutdown delegation manager
 */
export function shutdownDelegationManager(): void {
  if (delegationManagerInstance) {
    delegationManagerInstance.shutdown();
    delegationManagerInstance = null;
  }
}
