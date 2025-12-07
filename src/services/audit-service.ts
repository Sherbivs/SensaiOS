/**
 * Audit Service — Database-Centric Development Plan
 *
 * TypeScript service for audit logging integration with the repository pattern.
 * Uses the existing AuditLog model in the Prisma schema.
 *
 * Features:
 * - Automatic audit logging for CRUD operations
 * - Before/after state capture for UPDATE operations
 * - Integration with RLS context for actor identification
 * - Batch audit logging for bulk operations
 * - Query interface for audit history
 *
 * @module src/services/audit-service
 * @created 2025-12-04
 * @task P1-002 Audit Logging
 */

import { PrismaClient, Prisma, type AuditLog } from '../generated/prisma/client.js';
import type { RlsUserContext } from './rls-context.js';
import { IntelligentLogger } from '../utils/intelligent-logger.js';
import { toJsonValue } from '../shared/json-types.js';

const logger = new IntelligentLogger();

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Extended audit context that includes resolved IDs
 * RlsUserContext only has discordId/isAdmin; this adds the resolved database IDs
 */
export interface AuditUserContext {
  /** Discord user ID (from RlsUserContext) */
  discordId?: string;
  /** Resolved tenant ID from database */
  tenantId?: string | null;
  /** Resolved user ID from database */
  userId?: string | null;
}

/**
 * Audit action types
 */
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'READ' | 'LOGIN' | 'LOGOUT' | 'BATCH';

/**
 * Entity types that can be audited
 */
export type AuditableEntity =
  | 'Trainer'
  | 'PokemonInstance'
  | 'Party'
  | 'PartySlot'
  | 'Battle'
  | 'Encounter'
  | 'User'
  | 'Item'
  | 'Transaction';

/**
 * Audit log entry for creation
 */
export interface AuditEntry {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: AuditAction;
  entityType: AuditableEntity | string;
  entityId?: string | null;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

/**
 * Query options for audit log retrieval
 */
export interface AuditQueryOptions {
  entityType?: AuditableEntity | string;
  entityId?: string;
  actorUserId?: string;
  action?: AuditAction;
  tenantId?: string;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  pageSize?: number;
}

/**
 * Paginated audit log result
 */
export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Audit log entry from database
 */
export interface AuditLogEntry {
  id: bigint;
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  at: Date;
}

/**
 * Diff result showing what changed
 */
export interface DiffResult {
  field: string;
  before: unknown;
  after: unknown;
}

// ============================================================================
// Audit Service Class
// ============================================================================

/**
 * Service for managing audit logs
 *
 * @example
 * ```typescript
 * const auditService = new AuditService(prisma, userContext);
 *
 * // Log a create action
 * await auditService.logCreate('Trainer', trainerId, trainerData);
 *
 * // Log an update action with before/after
 * await auditService.logUpdate('PokemonInstance', pokemonId, beforeState, afterState);
 *
 * // Query audit history
 * const history = await auditService.getEntityHistory('Trainer', trainerId);
 * ```
 */
export class AuditService {
  private prisma: PrismaClient;
  private auditContext: AuditUserContext | null;
  private enabled: boolean;

  constructor(
    prisma: PrismaClient,
    userContext?: AuditUserContext | null,
    options?: { enabled?: boolean }
  ) {
    this.prisma = prisma;
    this.auditContext = userContext ?? null;
    this.enabled = options?.enabled ?? true;
  }

  // ==========================================================================
  // Core Logging Methods
  // ==========================================================================

  /**
   * Log an audit entry
   */
  async log(entry: AuditEntry): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId ?? this.auditContext?.tenantId ?? null,
          actorUserId: entry.actorUserId ?? this.auditContext?.userId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          beforeJson: entry.beforeJson ? toJsonValue(entry.beforeJson) : Prisma.DbNull,
          afterJson: entry.afterJson ? toJsonValue(entry.afterJson) : Prisma.DbNull,
          at: new Date(),
        },
      });
    } catch (error) {
      // Audit logging should not break the main operation
      logger.error('[AuditService] Failed to log audit entry', error);
    }
  }

  /**
   * Log a CREATE action
   */
  async logCreate(
    entityType: AuditableEntity | string,
    entityId: string,
    afterState: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: 'CREATE',
      entityType,
      entityId,
      afterJson: this.sanitize(afterState),
    });
  }

  /**
   * Log an UPDATE action with before/after states
   */
  async logUpdate(
    entityType: AuditableEntity | string,
    entityId: string,
    beforeState: Record<string, unknown>,
    afterState: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: 'UPDATE',
      entityType,
      entityId,
      beforeJson: this.sanitize(beforeState),
      afterJson: this.sanitize(afterState),
    });
  }

  /**
   * Log a DELETE action
   */
  async logDelete(
    entityType: AuditableEntity | string,
    entityId: string,
    beforeState: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: 'DELETE',
      entityType,
      entityId,
      beforeJson: this.sanitize(beforeState),
    });
  }

  /**
   * Log multiple entries in a batch (for bulk operations)
   */
  async logBatch(entries: AuditEntry[]): Promise<void> {
    if (!this.enabled || entries.length === 0) return;

    try {
      await this.prisma.auditLog.createMany({
        data: entries.map((entry) => ({
          tenantId: entry.tenantId ?? this.auditContext?.tenantId ?? null,
          actorUserId: entry.actorUserId ?? this.auditContext?.userId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          beforeJson: entry.beforeJson ? toJsonValue(entry.beforeJson) : Prisma.DbNull,
          afterJson: entry.afterJson ? toJsonValue(entry.afterJson) : Prisma.DbNull,
          at: new Date(),
        })),
      });
    } catch (error) {
      logger.error('[AuditService] Failed to log batch audit entries', error);
    }
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get audit history for a specific entity
   */
  async getEntityHistory(
    entityType: AuditableEntity | string,
    entityId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<AuditLogEntry[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const entries = await this.prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: {
        at: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return entries.map((e: AuditLog) => this.mapEntry(e));
  }

  /**
   * Get all audit logs for a user (as actor)
   */
  async getUserActivity(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<AuditLogEntry[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const entries = await this.prisma.auditLog.findMany({
      where: {
        actorUserId: userId,
      },
      orderBy: {
        at: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return entries.map((e: AuditLog) => this.mapEntry(e));
  }

  /**
   * Query audit logs with flexible filters
   */
  async query(options: AuditQueryOptions): Promise<AuditLogPage> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AuditLogWhereInput = {};

    if (options.entityType) {
      where.entityType = options.entityType;
    }
    if (options.entityId) {
      where.entityId = options.entityId;
    }
    if (options.actorUserId) {
      where.actorUserId = options.actorUserId;
    }
    if (options.action) {
      where.action = options.action;
    }
    if (options.tenantId) {
      where.tenantId = options.tenantId;
    }
    if (options.fromDate || options.toDate) {
      where.at = {};
      if (options.fromDate) {
        where.at.gte = options.fromDate;
      }
      if (options.toDate) {
        where.at.lte = options.toDate;
      }
    }

    const [entries, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { at: 'desc' },
        take: pageSize,
        skip,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: entries.map((e: AuditLog) => this.mapEntry(e)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get recent audit logs (last N entries)
   */
  async getRecent(limit: number = 100): Promise<AuditLogEntry[]> {
    const entries = await this.prisma.auditLog.findMany({
      orderBy: { at: 'desc' },
      take: limit,
    });

    return entries.map((e: AuditLog) => this.mapEntry(e));
  }

  /**
   * Count audit logs matching criteria
   */
  async count(options?: AuditQueryOptions): Promise<number> {
    const where: Prisma.AuditLogWhereInput = {};

    if (options?.entityType) {
      where.entityType = options.entityType;
    }
    if (options?.entityId) {
      where.entityId = options.entityId;
    }
    if (options?.actorUserId) {
      where.actorUserId = options.actorUserId;
    }
    if (options?.action) {
      where.action = options.action;
    }

    return this.prisma.auditLog.count({ where });
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Compute diff between two states
   */
  computeDiff(
    before: Record<string, unknown>,
    after: Record<string, unknown>
  ): DiffResult[] {
    const diffs: DiffResult[] = [];
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      const beforeVal = before[key];
      const afterVal = after[key];

      if (!this.deepEqual(beforeVal, afterVal)) {
        diffs.push({
          field: key,
          before: beforeVal,
          after: afterVal,
        });
      }
    }

    return diffs;
  }

  /**
   * Get the diff for an audit log entry
   */
  getEntryDiff(entry: AuditLogEntry): DiffResult[] {
    if (entry.action === 'CREATE') {
      // For creates, everything is new
      const after = entry.afterJson as Record<string, unknown>;
      if (!after) return [];
      return Object.entries(after).map(([field, value]) => ({
        field,
        before: undefined,
        after: value,
      }));
    }

    if (entry.action === 'DELETE') {
      // For deletes, everything is removed
      const before = entry.beforeJson as Record<string, unknown>;
      if (!before) return [];
      return Object.entries(before).map(([field, value]) => ({
        field,
        before: value,
        after: undefined,
      }));
    }

    // For updates, compute actual diff
    const before = (entry.beforeJson as Record<string, unknown>) ?? {};
    const after = (entry.afterJson as Record<string, unknown>) ?? {};
    return this.computeDiff(before, after);
  }

  /**
   * Set user context (for deferred context binding)
   */
  setUserContext(context: AuditUserContext | null): void {
    this.auditContext = context;
  }

  /**
   * Set context from RlsUserContext (discordId only, needs tenant/user resolution)
   */
  setRlsContext(context: RlsUserContext | null): void {
    if (context) {
      this.auditContext = { discordId: context.discordId };
    } else {
      this.auditContext = null;
    }
  }

  /**
   * Enable/disable audit logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if audit logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Map database entry to typed interface
   */
  private mapEntry(entry: {
    id: bigint;
    tenantId: string | null;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    beforeJson: Prisma.JsonValue | null;
    afterJson: Prisma.JsonValue | null;
    at: Date;
  }): AuditLogEntry {
    return {
      id: entry.id,
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeJson: entry.beforeJson,
      afterJson: entry.afterJson,
      at: entry.at,
    };
  }

  /**
   * Sanitize data for storage (remove sensitive fields, handle circular refs)
   */
  private sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'hash'];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      // Skip sensitive fields
      if (sensitiveFields.some((f) => key.toLowerCase().includes(f))) {
        result[key] = '[REDACTED]';
        continue;
      }

      // Handle special types
      if (value instanceof Date) {
        result[key] = value.toISOString();
      } else if (typeof value === 'bigint') {
        result[key] = value.toString();
      } else if (value === undefined) {
        // Skip undefined values
        continue;
      } else if (value !== null && typeof value === 'object') {
        // Shallow copy objects, don't recurse deeply to avoid circular refs
        try {
          result[key] = JSON.parse(JSON.stringify(value));
        } catch {
          result[key] = '[Complex Object]';
        }
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object' && typeof b === 'object') {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);

      if (aKeys.length !== bKeys.length) return false;

      for (const key of aKeys) {
        if (!this.deepEqual(aObj[key], bObj[key])) return false;
      }
      return true;
    }

    return false;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an audit service instance with AuditUserContext
 */
export function createAuditService(
  prisma: PrismaClient,
  userContext?: AuditUserContext | null,
  options?: { enabled?: boolean }
): AuditService {
  return new AuditService(prisma, userContext, options);
}

/**
 * Create an audit service instance from RlsUserContext
 * (discordId only, tenant/user IDs need to be resolved separately)
 */
export function createAuditServiceFromRls(
  prisma: PrismaClient,
  rlsContext?: RlsUserContext | null,
  options?: { enabled?: boolean }
): AuditService {
  const auditContext: AuditUserContext | null = rlsContext
    ? { discordId: rlsContext.discordId }
    : null;
  return new AuditService(prisma, auditContext, options);
}

// ============================================================================
// Higher-Order Function for Audited Operations
// ============================================================================

/**
 * Wrapper that automatically audits an operation
 *
 * @example
 * ```typescript
 * const createTrainer = withAudit(auditService, 'Trainer', 'CREATE', async () => {
 *   const trainer = await prisma.trainer.create({ data });
 *   return { id: trainer.id, data: trainer };
 * });
 * ```
 */
export async function withAudit<T extends { id: string }>(
  auditService: AuditService,
  entityType: AuditableEntity | string,
  action: AuditAction,
  operation: () => Promise<{ id: string; data: Record<string, unknown>; before?: Record<string, unknown> }>
): Promise<T> {
  const result = await operation();

  if (action === 'CREATE') {
    await auditService.logCreate(entityType, result.id, result.data);
  } else if (action === 'UPDATE' && result.before) {
    await auditService.logUpdate(entityType, result.id, result.before, result.data);
  } else if (action === 'DELETE' && result.before) {
    await auditService.logDelete(entityType, result.id, result.before);
  }

  return result.data as T;
}

// ============================================================================
// Re-exports
// ============================================================================

export type { RlsUserContext } from './rls-context.js';
