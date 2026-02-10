/**
 * Role Audit Service
 * ==================
 *
 * Service for managing role change audit records in the database with
 * HMAC integrity, hash chain linking, and statistical analysis.
 *
 * This service extracts database operations from roleArchive.js as part
 * of P0-002 Service Extraction.
 *
 * @module security/services/role-audit-service
 * @research P0-002 (Service Extraction)
 * @research R6 (Immutable Audit Log)
 * @research S6 (Timing-Safe Crypto)
 *
 * @example
 * ```typescript
 * import { RoleAuditService } from './role-audit-service';
 *
 * const service = new RoleAuditService(prisma);
 *
 * // Record a role change
 * const audit = await service.recordRoleChange({
 *   memberId: '123',
 *   memberTag: 'User#1234',
 *   guildId: '456',
 *   guildName: 'My Server',
 *   changeType: 'addition',
 *   roleId: '789',
 *   roleName: 'Admin',
 *   origin: 'member-update',
 * });
 *
 * // Get member history
 * const history = await service.getMemberRoleHistory('123', { limit: 10 });
 * ```
 */

import { PrismaClient } from '@prisma/client';
import {
  type RoleChangeAudit,
  type RoleChangeAuditInput,
  RoleChangeType,
} from '../types/database-models.js';
import {
  generateHmac,
  timingSafeHexCompare,
  sha256,
} from '../../../shared/crypto/timing-safe.js';
import { daysAgo, minutesAgo } from '../../../shared/utils/date-utils.js';

// Alias functions for semantic clarity
const computeHmac = (secret: string, data: string): string => generateHmac(data, secret);
const timingSafeEqual = timingSafeHexCompare;
const hashData = sha256;

// Type assertion for Prisma client with RoleChangeAudit model
// NOTE: After running `prisma generate`, this type assertion can be removed.
type PrismaClientWithRoleChangeAudit = PrismaClient & {
  roleChangeAudit: {
    create: (args: { data: Record<string, unknown> }) => Promise<PrismaRoleChangeAuditResult>;
    findUnique: (args: { where: { id: bigint } }) => Promise<PrismaRoleChangeAuditResult | null>;
    findMany: (args: Record<string, unknown>) => Promise<PrismaRoleChangeAuditResult[]>;
    findFirst: (args: Record<string, unknown>) => Promise<PrismaRoleChangeAuditResult | null>;
    count: (args: Record<string, unknown>) => Promise<number>;
    groupBy: (args: Record<string, unknown>) => Promise<Array<{ changeType?: string; roleName?: string; _count: Record<string, number> }>>;
  };
};

// Prisma result type for RoleChangeAudit
interface PrismaRoleChangeAuditResult {
  id: bigint;
  memberId: string;
  memberTag: string;
  guildId: string;
  guildName: string;
  changeType: string;
  roleId: string;
  roleName: string;
  rolePosition: number | null;
  executorId: string;
  executorTag: string;
  executorRoles: string[];
  authorized: boolean;
  authReason: string | null;
  reverted: boolean;
  revertedAt: Date | null;
  revertedBy: string | null;
  revertReason: string | null;
  origin: string;
  metadata: unknown;
  checksum: string;
  createdAt: Date;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Query options for retrieving role change audits.
 */
export interface RoleChangeAuditQueryOptions {
  /** Filter by guild ID */
  guildId?: string;
  /** Filter by member ID */
  memberId?: string;
  /** Filter by role ID */
  roleId?: string;
  /** Filter by change type */
  changeType?: RoleChangeType;
  /** Filter by origin */
  origin?: string;
  /** Filter by executor ID */
  executorId?: string;
  /** Filter events after this date */
  after?: Date;
  /** Filter events before this date */
  before?: Date;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order direction */
  orderDir?: 'asc' | 'desc';
}

/**
 * Statistics about role changes.
 */
export interface RoleChangeStats {
  /** Total change count */
  totalChanges: number;
  /** Addition count */
  additionCount: number;
  /** Removal count */
  removalCount: number;
  /** Unique member count */
  uniqueMemberCount: number;
  /** Most modified roles */
  mostModifiedRoles: Array<{
    roleId: string;
    roleName: string;
    changeCount: number;
  }>;
  /** Changes in last 24 hours */
  last24Hours: number;
  /** Changes in last 7 days */
  last7Days: number;
}

/**
 * Anomaly detection result.
 */
export interface AnomalyResult {
  /** Whether an anomaly was detected */
  isAnomaly: boolean;
  /** Type of anomaly detected */
  anomalyType?: 'rapid-changes' | 'unauthorized-removal' | 'suspicious-pattern';
  /** Description of the anomaly */
  description?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Evidence for the anomaly */
  evidence?: Record<string, unknown>;
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Service for managing role change audit records.
 *
 * Features:
 * - HMAC signature generation and validation
 * - Hash chain linking for immutability (R6 - SOC 2)
 * - Member and role history queries
 * - Anomaly detection for rapid changes
 * - Statistical analysis
 */
export class RoleAuditService {
  private readonly prisma: PrismaClientWithRoleChangeAudit;
  private readonly hmacSecret: string;
  private lastAuditHash: string | null = null;

  /**
   * Create a new RoleAuditService.
   *
   * @param prisma - Prisma client instance
   * @param hmacSecret - Secret for HMAC signature generation
   */
  constructor(
    prisma: PrismaClient,
    hmacSecret: string = process.env.ARCHIVE_HMAC_SECRET ?? 'default-dev-secret-change-in-prod'
  ) {
    this.prisma = prisma as PrismaClientWithRoleChangeAudit;
    this.hmacSecret = hmacSecret;
  }

  // ==========================================================================
  // CORE CRUD OPERATIONS
  // ==========================================================================

  /**
   * Record a role change with integrity verification.
   *
   * @param input - Role change data
   * @returns The created audit record
   */
  async recordRoleChange(
    input: Omit<RoleChangeAuditInput, 'checksum' | 'signature' | 'previousHash'>
  ): Promise<RoleChangeAudit> {
    // Get the hash of the last audit for chain linking
    const previousHash = await this.getLastAuditHash();

    // Compute checksum of audit data
    const checksumData = this.buildChecksumData(input);
    const checksum = hashData(checksumData);

    // Compute HMAC signature
    const signatureData = this.buildSignatureData(input, checksum, previousHash);
    const signature = computeHmac(this.hmacSecret, signatureData);

    // Create the audit record
    const audit = await this.prisma.roleChangeAudit.create({
      data: {
        memberId: input.memberId,
        memberTag: input.memberTag,
        guildId: input.guildId,
        guildName: input.guildName,
        changeType: input.changeType,
        roleId: input.roleId,
        roleName: input.roleName,
        roleColor: input.roleColor ?? null,
        rolePosition: input.rolePosition ?? null,
        executorId: input.executorId ?? null,
        executorTag: input.executorTag ?? null,
        origin: input.origin,
        metadata: input.metadata ?? undefined,
        signature,
        checksum,
        previousHash,
      },
    });

    // Update cached last hash
    this.lastAuditHash = checksum;

    return this.mapPrismaToAudit(audit);
  }

  /**
   * Record multiple role changes in a transaction.
   *
   * @param inputs - Array of role change data
   * @returns Array of created audit records
   */
  async recordRoleChangesBatch(
    inputs: Array<Omit<RoleChangeAuditInput, 'checksum' | 'signature' | 'previousHash'>>
  ): Promise<RoleChangeAudit[]> {
    if (inputs.length === 0) return [];

    const audits: RoleChangeAudit[] = [];
    let currentPreviousHash = await this.getLastAuditHash();

    // Use `any` for transaction context until `prisma generate` is run
    await this.prisma.$transaction(async (tx: any) => {
      for (const input of inputs) {
        const checksumData = this.buildChecksumData(input);
        const checksum = hashData(checksumData);
        const signatureData = this.buildSignatureData(input, checksum, currentPreviousHash);
        const signature = computeHmac(this.hmacSecret, signatureData);

        const audit = await tx.roleChangeAudit.create({
          data: {
            memberId: input.memberId,
            memberTag: input.memberTag,
            guildId: input.guildId,
            guildName: input.guildName,
            changeType: input.changeType,
            roleId: input.roleId,
            roleName: input.roleName,
            roleColor: input.roleColor ?? null,
            rolePosition: input.rolePosition ?? null,
            executorId: input.executorId ?? null,
            executorTag: input.executorTag ?? null,
            origin: input.origin,
            metadata: input.metadata ?? undefined,
            signature,
            checksum,
            previousHash: currentPreviousHash,
          },
        });

        audits.push(this.mapPrismaToAudit(audit));
        currentPreviousHash = checksum;
      }
    });

    // Update cached last hash
    if (audits.length > 0) {
      this.lastAuditHash = audits[audits.length - 1].checksum;
    }

    return audits;
  }

  /**
   * Get a role change audit by ID.
   *
   * @param id - Audit record ID
   * @returns The audit record or null
   */
  async getAudit(id: bigint): Promise<RoleChangeAudit | null> {
    const audit = await this.prisma.roleChangeAudit.findUnique({
      where: { id },
    });

    return audit ? this.mapPrismaToAudit(audit) : null;
  }

  /**
   * Query role change audits with filtering.
   *
   * @param options - Query options
   * @returns Array of matching audits
   */
  async queryAudits(options: RoleChangeAuditQueryOptions = {}): Promise<RoleChangeAudit[]> {
    const {
      guildId,
      memberId,
      roleId,
      changeType,
      origin,
      executorId,
      after,
      before,
      limit = 100,
      offset = 0,
      orderDir = 'desc',
    } = options;

    const where: Record<string, unknown> = {};

    if (guildId) where.guildId = guildId;
    if (memberId) where.memberId = memberId;
    if (roleId) where.roleId = roleId;
    if (changeType) where.changeType = changeType;
    if (origin) where.origin = origin;
    if (executorId) where.executorId = executorId;

    if (after || before) {
      where.createdAt = {};
      if (after) (where.createdAt as Record<string, Date>).gte = after;
      if (before) (where.createdAt as Record<string, Date>).lte = before;
    }

    const audits = await this.prisma.roleChangeAudit.findMany({
      where,
      take: Math.min(limit, 1000),
      skip: offset,
      orderBy: { createdAt: orderDir },
    });

    return audits.map((a: PrismaRoleChangeAuditResult) => this.mapPrismaToAudit(a));
  }

  // ==========================================================================
  // HISTORY QUERIES
  // ==========================================================================

  /**
   * Get role change history for a member.
   *
   * @param memberId - Discord user ID
   * @param options - Query options
   * @returns Array of role changes for the member
   */
  async getMemberRoleHistory(
    memberId: string,
    options: { limit?: number; after?: Date; before?: Date } = {}
  ): Promise<RoleChangeAudit[]> {
    return this.queryAudits({
      memberId,
      limit: options.limit ?? 50,
      after: options.after,
      before: options.before,
    });
  }

  /**
   * Get change history for a specific role.
   *
   * @param roleId - Discord role ID
   * @param options - Query options
   * @returns Array of changes for the role
   */
  async getRoleChangeHistory(
    roleId: string,
    options: { limit?: number; after?: Date; before?: Date } = {}
  ): Promise<RoleChangeAudit[]> {
    return this.queryAudits({
      roleId,
      limit: options.limit ?? 50,
      after: options.after,
      before: options.before,
    });
  }

  /**
   * Get recent changes by an executor.
   *
   * @param executorId - Discord user ID of the executor
   * @param options - Query options
   * @returns Array of changes made by the executor
   */
  async getExecutorHistory(
    executorId: string,
    options: { limit?: number; after?: Date; before?: Date } = {}
  ): Promise<RoleChangeAudit[]> {
    return this.queryAudits({
      executorId,
      limit: options.limit ?? 50,
      after: options.after,
      before: options.before,
    });
  }

  // ==========================================================================
  // ANOMALY DETECTION
  // ==========================================================================

  /**
   * Detect if a role change is anomalous.
   *
   * Checks for:
   * - Rapid role changes on the same member (5+ in 5 minutes)
   * - Unauthorized removals of critical roles
   * - Suspicious patterns
   *
   * @param memberId - Member being changed
   * @param metadata - Optional metadata with context
   * @returns Anomaly detection result
   */
  async detectAnomaly(
    memberId: string,
    metadata?: { isUnauthorized?: boolean; changeType?: RoleChangeType }
  ): Promise<AnomalyResult> {
    // Check for rapid role changes
    const recentChanges = await this.queryAudits({
      memberId,
      after: minutesAgo(5),
      limit: 10,
    });

    if (recentChanges.length >= 5) {
      return {
        isAnomaly: true,
        anomalyType: 'rapid-changes',
        description: `${recentChanges.length} role changes in 5 minutes`,
        confidence: Math.min(recentChanges.length / 10, 1),
        evidence: {
          changeCount: recentChanges.length,
          timeWindowMinutes: 5,
          changes: recentChanges.map(c => ({
            changeType: c.changeType,
            roleName: c.roleName,
            timestamp: c.createdAt,
          })),
        },
      };
    }

    // Check for unauthorized removal
    if (metadata?.isUnauthorized && metadata?.changeType === RoleChangeType.REMOVAL) {
      return {
        isAnomaly: true,
        anomalyType: 'unauthorized-removal',
        description: 'Unauthorized role removal detected',
        confidence: 0.9,
        evidence: { isUnauthorized: true },
      };
    }

    return { isAnomaly: false };
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get statistics about role changes.
   *
   * @param guildId - Optional guild ID to filter
   * @returns Role change statistics
   */
  async getStats(guildId?: string): Promise<RoleChangeStats> {
    const where = guildId ? { guildId } : {};

    const [
      totalChanges,
      additionCount,
      removalCount,
      uniqueMembers,
      topRoles,
      last24h,
      last7d,
    ] = await Promise.all([
      // Total count
      this.prisma.roleChangeAudit.count({ where }),

      // Addition count
      this.prisma.roleChangeAudit.count({
        where: { ...where, changeType: RoleChangeType.ADDITION },
      }),

      // Removal count
      this.prisma.roleChangeAudit.count({
        where: { ...where, changeType: RoleChangeType.REMOVAL },
      }),

      // Unique members (using raw query for DISTINCT COUNT)
      this.prisma.roleChangeAudit.groupBy({
        by: ['memberId'],
        where,
        _count: { memberId: true },
      }),

      // Top modified roles
      this.prisma.roleChangeAudit.groupBy({
        by: ['roleId', 'roleName'],
        where,
        _count: { roleId: true },
        orderBy: { _count: { roleId: 'desc' } },
        take: 10,
      }),

      // Last 24 hours
      this.prisma.roleChangeAudit.count({
        where: {
          ...where,
          createdAt: { gte: daysAgo(1) },
        },
      }),

      // Last 7 days
      this.prisma.roleChangeAudit.count({
        where: {
          ...where,
          createdAt: { gte: daysAgo(7) },
        },
      }),
    ]);

    // Type the topRoles result properly
    type RoleGroupResult = { roleId?: string; roleName?: string; _count: { roleId: number } };
    const typedTopRoles = topRoles as RoleGroupResult[];

    return {
      totalChanges,
      additionCount,
      removalCount,
      uniqueMemberCount: uniqueMembers.length,
      mostModifiedRoles: typedTopRoles.map((r) => ({
        roleId: r.roleId ?? '',
        roleName: r.roleName ?? '',
        changeCount: r._count.roleId,
      })),
      last24Hours: last24h,
      last7Days: last7d,
    };
  }

  // ==========================================================================
  // INTEGRITY VERIFICATION
  // ==========================================================================

  /**
   * Verify the integrity of an audit record.
   *
   * @param audit - Audit record to verify
   * @returns True if integrity checks pass
   */
  verifyAuditIntegrity(audit: RoleChangeAudit): boolean {
    // Verify checksum
    const checksumData = this.buildChecksumData(audit);
    const expectedChecksum = hashData(checksumData);
    if (!timingSafeEqual(audit.checksum, expectedChecksum)) {
      return false;
    }

    // Verify signature if present
    if (audit.signature) {
      const signatureData = this.buildSignatureData(audit, audit.checksum, audit.previousHash ?? null);
      const expectedSignature = computeHmac(this.hmacSecret, signatureData);
      if (!timingSafeEqual(audit.signature, expectedSignature)) {
        return false;
      }
    }

    return true;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Get the hash of the last audit in the chain.
   */
  private async getLastAuditHash(): Promise<string | null> {
    if (this.lastAuditHash !== null) {
      return this.lastAuditHash;
    }

    const lastAudit = await this.prisma.roleChangeAudit.findFirst({
      orderBy: { id: 'desc' },
      select: { checksum: true },
    });

    this.lastAuditHash = lastAudit?.checksum ?? null;
    return this.lastAuditHash;
  }

  /**
   * Build checksum data string.
   */
  private buildChecksumData(audit: Partial<RoleChangeAudit>): string {
    return JSON.stringify({
      memberId: audit.memberId,
      memberTag: audit.memberTag,
      guildId: audit.guildId,
      guildName: audit.guildName,
      changeType: audit.changeType,
      roleId: audit.roleId,
      roleName: audit.roleName,
      roleColor: audit.roleColor,
      rolePosition: audit.rolePosition,
      executorId: audit.executorId,
      executorTag: audit.executorTag,
      origin: audit.origin,
      metadata: audit.metadata,
    });
  }

  /**
   * Build signature data string.
   */
  private buildSignatureData(
    audit: Partial<RoleChangeAudit>,
    checksum: string,
    previousHash: string | null
  ): string {
    return JSON.stringify({
      checksum,
      previousHash,
      memberId: audit.memberId,
      roleId: audit.roleId,
      changeType: audit.changeType,
      guildId: audit.guildId,
    });
  }

  /**
   * Map Prisma result to RoleChangeAudit type.
   */
  private mapPrismaToAudit(prismaAudit: PrismaRoleChangeAuditResult): RoleChangeAudit {
    return {
      id: prismaAudit.id,
      memberId: prismaAudit.memberId,
      memberTag: prismaAudit.memberTag,
      guildId: prismaAudit.guildId,
      guildName: prismaAudit.guildName,
      changeType: prismaAudit.changeType as RoleChangeType,
      roleId: prismaAudit.roleId,
      roleName: prismaAudit.roleName,
      rolePosition: prismaAudit.rolePosition,
      executorId: prismaAudit.executorId,
      executorTag: prismaAudit.executorTag,
      executorRoles: prismaAudit.executorRoles,
      authorized: prismaAudit.authorized,
      authReason: prismaAudit.authReason,
      reverted: prismaAudit.reverted,
      revertedAt: prismaAudit.revertedAt,
      revertedBy: prismaAudit.revertedBy,
      revertReason: prismaAudit.revertReason,
      origin: prismaAudit.origin,
      metadata: prismaAudit.metadata as Record<string, unknown> | null,
      checksum: prismaAudit.checksum,
      createdAt: prismaAudit.createdAt,
    };
  }
}
