/**
 * Security Event Service
 * ======================
 *
 * Service for managing security events in the database with HMAC integrity,
 * hash chain linking (SOC 2 compliance), and efficient querying.
 *
 * @module security/services/security-event-service
 * @research P0-002 (Service Extraction)
 * @research R6 (Immutable Audit Log)
 * @research S6 (Timing-Safe Crypto)
 *
 * @example
 * ```typescript
 * import { SecurityEventService } from './security-event-service';
 *
 * const service = new SecurityEventService(prisma);
 *
 * // Record a security event
 * const event = await service.recordEvent({
 *   eventType: 'role-change',
 *   severity: SecuritySeverity.HIGH,
 *   guildId: '123',
 *   guildName: 'My Server',
 *   origin: 'security-bot-sweep',
 * });
 *
 * // Query events
 * const events = await service.queryEvents({
 *   guildId: '123',
 *   severity: SecuritySeverity.HIGH,
 *   limit: 100,
 * });
 * ```
 */

import { PrismaClient } from '../../../generated/prisma/client.js';
import {
  type SecurityEvent,
  type SecurityEventInput,
  SecuritySeverity,
} from '../types/database-models.js';
import {
  generateHmac,
  timingSafeHexCompare,
  sha256,
} from '../../../shared/crypto/timing-safe.js';
import { daysAgo } from '../../../shared/utils/date-utils.js';

// Alias functions to match service semantics
const computeHmac = (secret: string, data: string): string => generateHmac(data, secret);
const timingSafeEqual = timingSafeHexCompare;
const hashData = sha256;

// Type assertion for Prisma client with SecurityEvent model
// NOTE: SecurityEvent model added in P0-001 schema update.
// After running `prisma generate`, this type assertion can be removed.
type PrismaClientWithSecurityEvent = PrismaClient & {
  securityEvent: {
    create: (args: { data: Record<string, unknown> }) => Promise<PrismaSecurityEventResult>;
    findUnique: (args: { where: { id: bigint } }) => Promise<PrismaSecurityEventResult | null>;
    findMany: (args: Record<string, unknown>) => Promise<PrismaSecurityEventResult[]>;
    findFirst: (args: Record<string, unknown>) => Promise<PrismaSecurityEventResult | null>;
    count: (args: Record<string, unknown>) => Promise<number>;
    groupBy: (args: Record<string, unknown>) => Promise<Array<{ severity?: string; eventType?: string; _count: Record<string, number> }>>;
  };
};

// Prisma result type for SecurityEvent
interface PrismaSecurityEventResult {
  id: bigint;
  eventType: string;
  severity: string;
  guildId: string;
  guildName: string;
  memberId: string | null;
  memberTag: string | null;
  roleId: string | null;
  roleName: string | null;
  executorId: string | null;
  executorTag: string | null;
  origin: string;
  metadata: unknown;
  signature: string | null;
  checksum: string;
  previousHash: string | null;
  createdAt: Date;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Query options for retrieving security events.
 */
export interface SecurityEventQueryOptions {
  /** Filter by guild ID */
  guildId?: string;
  /** Filter by event type */
  eventType?: string;
  /** Filter by severity (minimum) */
  severity?: SecuritySeverity;
  /** Filter by member ID */
  memberId?: string;
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
  /** Order by field */
  orderBy?: 'createdAt' | 'severity';
  /** Order direction */
  orderDir?: 'asc' | 'desc';
}

/**
 * Result of a batch integrity check.
 */
export interface IntegrityCheckResult {
  /** Total events checked */
  total: number;
  /** Events that passed validation */
  passed: number;
  /** Events that failed validation */
  failed: number;
  /** Details of failed events */
  failures: Array<{
    id: bigint;
    reason: string;
    expected?: string;
    actual?: string;
  }>;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Statistics about security events.
 */
export interface SecurityEventStats {
  /** Total event count */
  totalEvents: number;
  /** Events by severity */
  bySeverity: Record<SecuritySeverity, number>;
  /** Events by type */
  byType: Record<string, number>;
  /** Events in last 24 hours */
  last24Hours: number;
  /** Events in last 7 days */
  last7Days: number;
  /** Oldest event date */
  oldestEvent?: Date;
  /** Newest event date */
  newestEvent?: Date;
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Service for managing security events with integrity validation.
 *
 * Features:
 * - HMAC signature generation and validation
 * - Hash chain linking for immutability (R6 - SOC 2)
 * - Efficient querying with pagination
 * - Bulk integrity verification
 */
export class SecurityEventService {
  // Type assertion for Prisma client with SecurityEvent model
  // After `prisma generate`, this can use PrismaClient directly
  private readonly prisma: PrismaClientWithSecurityEvent;
  private readonly hmacSecret: string;
  private lastEventHash: string | null = null;

  /**
   * Create a new SecurityEventService.
   *
   * @param prisma - Prisma client instance
   * @param hmacSecret - Secret for HMAC signature generation (defaults to env var)
   */
  constructor(
    prisma: PrismaClient,
    hmacSecret: string = process.env.SECURITY_HMAC_SECRET ?? 'default-dev-secret-change-in-prod'
  ) {
    this.prisma = prisma as PrismaClientWithSecurityEvent;
    this.hmacSecret = hmacSecret;
  }

  // ==========================================================================
  // CORE CRUD OPERATIONS
  // ==========================================================================

  /**
   * Record a new security event with integrity verification.
   *
   * Generates HMAC signature, computes checksum, and links to previous event
   * in hash chain for SOC 2 compliance.
   *
   * @param input - Event data to record
   * @returns The created event with all computed fields
   */
  async recordEvent(input: Omit<SecurityEventInput, 'checksum' | 'signature' | 'previousHash'>): Promise<SecurityEvent> {
    // Get the hash of the last event for chain linking
    const previousHash = await this.getLastEventHash();

    // Compute checksum of event data
    const checksumData = this.buildChecksumData(input);
    const checksum = hashData(checksumData);

    // Compute HMAC signature
    const signatureData = this.buildSignatureData(input, checksum, previousHash);
    const signature = computeHmac(this.hmacSecret, signatureData);

    // Create the event in database
    const event = await this.prisma.securityEvent.create({
      data: {
        eventType: input.eventType,
        severity: input.severity,
        guildId: input.guildId,
        guildName: input.guildName,
        memberId: input.memberId ?? null,
        memberTag: input.memberTag ?? null,
        roleId: input.roleId ?? null,
        roleName: input.roleName ?? null,
        executorId: input.executorId ?? null,
        executorTag: input.executorTag ?? null,
        origin: input.origin,
        metadata: input.metadata ?? undefined,
        signature,
        checksum,
        previousHash,
      },
    });

    // Update cached last event hash
    this.lastEventHash = checksum;

    return this.mapPrismaToEvent(event);
  }

  /**
   * Record multiple security events in a transaction.
   *
   * All events are linked in a hash chain and committed atomically.
   *
   * @param inputs - Array of event data to record
   * @returns Array of created events
   */
  async recordEventsBatch(
    inputs: Array<Omit<SecurityEventInput, 'checksum' | 'signature' | 'previousHash'>>
  ): Promise<SecurityEvent[]> {
    if (inputs.length === 0) return [];

    const events: SecurityEvent[] = [];
    let currentPreviousHash = await this.getLastEventHash();

    // Use `any` for transaction context until `prisma generate` is run
    await this.prisma.$transaction(async (tx: any) => {
      for (const input of inputs) {
        const checksumData = this.buildChecksumData(input);
        const checksum = hashData(checksumData);
        const signatureData = this.buildSignatureData(input, checksum, currentPreviousHash);
        const signature = computeHmac(this.hmacSecret, signatureData);

        const event = await tx.securityEvent.create({
          data: {
            eventType: input.eventType,
            severity: input.severity,
            guildId: input.guildId,
            guildName: input.guildName,
            memberId: input.memberId ?? null,
            memberTag: input.memberTag ?? null,
            roleId: input.roleId ?? null,
            roleName: input.roleName ?? null,
            executorId: input.executorId ?? null,
            executorTag: input.executorTag ?? null,
            origin: input.origin,
            metadata: input.metadata ?? undefined,
            signature,
            checksum,
            previousHash: currentPreviousHash,
          },
        });

        events.push(this.mapPrismaToEvent(event));
        currentPreviousHash = checksum;
      }
    });

    // Update cached last event hash
    if (events.length > 0) {
      this.lastEventHash = events[events.length - 1].checksum;
    }

    return events;
  }

  /**
   * Get a security event by ID.
   *
   * @param id - Event ID
   * @returns The event or null if not found
   */
  async getEvent(id: bigint): Promise<SecurityEvent | null> {
    const event = await this.prisma.securityEvent.findUnique({
      where: { id },
    });

    return event ? this.mapPrismaToEvent(event) : null;
  }

  /**
   * Query security events with filtering and pagination.
   *
   * @param options - Query options
   * @returns Array of matching events
   */
  async queryEvents(options: SecurityEventQueryOptions = {}): Promise<SecurityEvent[]> {
    const {
      guildId,
      eventType,
      severity,
      memberId,
      executorId,
      after,
      before,
      limit = 100,
      offset = 0,
      orderBy = 'createdAt',
      orderDir = 'desc',
    } = options;

    const where: Record<string, unknown> = {};

    if (guildId) where.guildId = guildId;
    if (eventType) where.eventType = eventType;
    if (memberId) where.memberId = memberId;
    if (executorId) where.executorId = executorId;

    // Severity filtering (minimum severity)
    if (severity) {
      const severityOrder: SecuritySeverity[] = [
        SecuritySeverity.INFO,
        SecuritySeverity.LOW,
        SecuritySeverity.MEDIUM,
        SecuritySeverity.HIGH,
        SecuritySeverity.CRITICAL,
      ];
      const minIndex = severityOrder.indexOf(severity);
      where.severity = {
        in: severityOrder.slice(minIndex),
      };
    }

    // Date range filtering
    if (after || before) {
      where.createdAt = {};
      if (after) (where.createdAt as Record<string, Date>).gte = after;
      if (before) (where.createdAt as Record<string, Date>).lte = before;
    }

    const events = await this.prisma.securityEvent.findMany({
      where,
      take: Math.min(limit, 1000), // Cap at 1000
      skip: offset,
      orderBy: { [orderBy]: orderDir },
    });

    return events.map((e) => this.mapPrismaToEvent(e));
  }

  /**
   * Count events matching query options.
   *
   * @param options - Query options (excluding limit/offset)
   * @returns Count of matching events
   */
  async countEvents(options: Omit<SecurityEventQueryOptions, 'limit' | 'offset' | 'orderBy' | 'orderDir'> = {}): Promise<number> {
    const { guildId, eventType, severity, memberId, executorId, after, before } = options;

    const where: Record<string, unknown> = {};

    if (guildId) where.guildId = guildId;
    if (eventType) where.eventType = eventType;
    if (memberId) where.memberId = memberId;
    if (executorId) where.executorId = executorId;

    if (severity) {
      const severityOrder: SecuritySeverity[] = [
        SecuritySeverity.INFO,
        SecuritySeverity.LOW,
        SecuritySeverity.MEDIUM,
        SecuritySeverity.HIGH,
        SecuritySeverity.CRITICAL,
      ];
      const minIndex = severityOrder.indexOf(severity);
      where.severity = { in: severityOrder.slice(minIndex) };
    }

    if (after || before) {
      where.createdAt = {};
      if (after) (where.createdAt as Record<string, Date>).gte = after;
      if (before) (where.createdAt as Record<string, Date>).lte = before;
    }

    return this.prisma.securityEvent.count({ where });
  }

  // ==========================================================================
  // INTEGRITY VERIFICATION
  // ==========================================================================

  /**
   * Verify the integrity of a single event.
   *
   * Checks both the HMAC signature and checksum using timing-safe comparison.
   *
   * @param event - Event to verify
   * @returns True if integrity checks pass
   */
  verifyEventIntegrity(event: SecurityEvent): boolean {
    // Verify checksum
    const checksumData = this.buildChecksumData(event);
    const expectedChecksum = hashData(checksumData);
    if (!timingSafeEqual(event.checksum, expectedChecksum)) {
      return false;
    }

    // Verify signature if present
    if (event.signature) {
      const signatureData = this.buildSignatureData(event, event.checksum, event.previousHash ?? null);
      const expectedSignature = computeHmac(this.hmacSecret, signatureData);
      if (!timingSafeEqual(event.signature, expectedSignature)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Verify the hash chain integrity for a range of events.
   *
   * Ensures each event's previousHash matches the checksum of the preceding event.
   *
   * @param guildId - Optional guild ID to filter events
   * @param limit - Maximum events to check
   * @returns Integrity check result
   */
  async verifyHashChain(guildId?: string, limit = 1000): Promise<IntegrityCheckResult> {
    const startTime = Date.now();
    const failures: IntegrityCheckResult['failures'] = [];

    const where = guildId ? { guildId } : {};
    const events = await this.prisma.securityEvent.findMany({
      where,
      orderBy: { id: 'asc' },
      take: limit,
    });

    let previousChecksum: string | null = null;
    let passed = 0;

    for (const event of events) {
      // Verify this event's previousHash matches the last checksum
      if (event.previousHash !== previousChecksum) {
        failures.push({
          id: event.id,
          reason: 'Hash chain broken',
          expected: previousChecksum ?? '(null)',
          actual: event.previousHash ?? '(null)',
        });
      } else {
        // Also verify the event's own integrity
        const mapped = this.mapPrismaToEvent(event);
        if (!this.verifyEventIntegrity(mapped)) {
          failures.push({
            id: event.id,
            reason: 'Signature or checksum mismatch',
          });
        } else {
          passed++;
        }
      }

      previousChecksum = event.checksum;
    }

    return {
      total: events.length,
      passed,
      failed: failures.length,
      failures,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Batch verify integrity for multiple events.
   *
   * @param eventIds - Array of event IDs to verify
   * @returns Integrity check result
   */
  async batchVerifyIntegrity(eventIds: bigint[]): Promise<IntegrityCheckResult> {
    const startTime = Date.now();
    const failures: IntegrityCheckResult['failures'] = [];

    const events = await this.prisma.securityEvent.findMany({
      where: { id: { in: eventIds } },
    });

    let passed = 0;
    for (const event of events) {
      const mapped = this.mapPrismaToEvent(event);
      if (this.verifyEventIntegrity(mapped)) {
        passed++;
      } else {
        failures.push({
          id: event.id,
          reason: 'Integrity check failed',
        });
      }
    }

    return {
      total: events.length,
      passed,
      failed: failures.length,
      failures,
      durationMs: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get statistics about security events.
   *
   * @param guildId - Optional guild ID to filter
   * @returns Event statistics
   */
  async getStats(guildId?: string): Promise<SecurityEventStats> {
    const where = guildId ? { guildId } : {};

    const [
      totalEvents,
      severityCounts,
      typeCounts,
      oldest,
      newest,
      last24h,
      last7d,
    ] = await Promise.all([
      // Total count
      this.prisma.securityEvent.count({ where }),

      // By severity
      this.prisma.securityEvent.groupBy({
        by: ['severity'],
        where,
        _count: { severity: true },
      }),

      // By type
      this.prisma.securityEvent.groupBy({
        by: ['eventType'],
        where,
        _count: { eventType: true },
      }),

      // Oldest event
      this.prisma.securityEvent.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      // Newest event
      this.prisma.securityEvent.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),

      // Last 24 hours
      this.prisma.securityEvent.count({
        where: {
          ...where,
          createdAt: { gte: daysAgo(1) },
        },
      }),

      // Last 7 days
      this.prisma.securityEvent.count({
        where: {
          ...where,
          createdAt: { gte: daysAgo(7) },
        },
      }),
    ]);

    const bySeverity: Record<SecuritySeverity, number> = {
      [SecuritySeverity.CRITICAL]: 0,
      [SecuritySeverity.HIGH]: 0,
      [SecuritySeverity.MEDIUM]: 0,
      [SecuritySeverity.LOW]: 0,
      [SecuritySeverity.INFO]: 0,
    };

    for (const item of severityCounts) {
      bySeverity[item.severity as SecuritySeverity] = item._count.severity;
    }

    const byType: Record<string, number> = {};
    for (const item of typeCounts) {
      if (item.eventType) {
        byType[item.eventType] = item._count.eventType;
      }
    }

    return {
      totalEvents,
      bySeverity,
      byType,
      last24Hours: last24h,
      last7Days: last7d,
      oldestEvent: oldest?.createdAt ?? undefined,
      newestEvent: newest?.createdAt ?? undefined,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Get the hash of the last event in the chain.
   */
  private async getLastEventHash(): Promise<string | null> {
    if (this.lastEventHash !== null) {
      return this.lastEventHash;
    }

    const lastEvent = await this.prisma.securityEvent.findFirst({
      orderBy: { id: 'desc' },
      select: { checksum: true },
    });

    this.lastEventHash = lastEvent?.checksum ?? null;
    return this.lastEventHash;
  }

  /**
   * Build the data string for checksum computation.
   */
  private buildChecksumData(event: Partial<SecurityEvent>): string {
    return JSON.stringify({
      eventType: event.eventType,
      severity: event.severity,
      guildId: event.guildId,
      guildName: event.guildName,
      memberId: event.memberId,
      memberTag: event.memberTag,
      roleId: event.roleId,
      roleName: event.roleName,
      executorId: event.executorId,
      executorTag: event.executorTag,
      origin: event.origin,
      metadata: event.metadata,
    });
  }

  /**
   * Build the data string for signature computation.
   */
  private buildSignatureData(
    event: Partial<SecurityEvent>,
    checksum: string,
    previousHash: string | null
  ): string {
    return JSON.stringify({
      checksum,
      previousHash,
      eventType: event.eventType,
      guildId: event.guildId,
      origin: event.origin,
    });
  }

  /**
   * Map Prisma result to SecurityEvent type.
   */
  private mapPrismaToEvent(prismaEvent: {
    id: bigint;
    eventType: string;
    severity: string;
    guildId: string;
    guildName: string;
    memberId: string | null;
    memberTag: string | null;
    roleId: string | null;
    roleName: string | null;
    executorId: string | null;
    executorTag: string | null;
    origin: string;
    metadata: unknown;
    signature: string | null;
    checksum: string;
    previousHash: string | null;
    createdAt: Date;
  }): SecurityEvent {
    return {
      id: prismaEvent.id,
      eventType: prismaEvent.eventType,
      severity: prismaEvent.severity as SecuritySeverity,
      guildId: prismaEvent.guildId,
      guildName: prismaEvent.guildName,
      memberId: prismaEvent.memberId,
      memberTag: prismaEvent.memberTag,
      roleId: prismaEvent.roleId,
      roleName: prismaEvent.roleName,
      executorId: prismaEvent.executorId,
      executorTag: prismaEvent.executorTag,
      origin: prismaEvent.origin,
      metadata: prismaEvent.metadata as Record<string, unknown> | null,
      signature: prismaEvent.signature,
      checksum: prismaEvent.checksum,
      previousHash: prismaEvent.previousHash,
      createdAt: prismaEvent.createdAt,
    };
  }
}
