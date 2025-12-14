/**
 * Threat Detection Service
 * ========================
 *
 * Service for managing threat detection records in the database with
 * MITRE ATT&CK mapping, forensics evidence storage, and resolution tracking.
 *
 * This service extracts database operations from threatDetector.js as part
 * of P0-002 Service Extraction. The detection *logic* remains in threatDetector.js;
 * this service handles *persistence* of detected threats.
 *
 * @module security/services/threat-detection-service
 * @research P0-002 (Service Extraction)
 * @research R6 (Immutable Audit Log)
 *
 * @example
 * ```typescript
 * import { ThreatDetectionService } from './threat-detection-service';
 *
 * const service = new ThreatDetectionService(prisma);
 *
 * // Record a detected threat
 * const threat = await service.recordThreat({
 *   threatType: ThreatType.RAPID_ROLE_CHANGES,
 *   severity: SecuritySeverity.CRITICAL,
 *   confidence: 0.95,
 *   guildId: '123',
 *   guildName: 'Server',
 *   description: '15 role changes in 5 minutes',
 *   evidence: { currentRate: 15, baselineThreshold: 3 },
 *   recommendedAction: 'AUTO_REVERT + DRIP_ALERT',
 *   mitreAttack: 'T1098.003',
 *   mitreTactic: 'Privilege Escalation',
 * });
 *
 * // Get unresolved threats
 * const unresolved = await service.getUnresolvedThreats('123');
 * ```
 */

import { PrismaClient } from '../../../generated/prisma/client.js';
import {
  type ThreatDetection,
  type ThreatDetectionInput,
  type ThreatEvidence,
  ThreatType,
  SecuritySeverity,
} from '../types/database-models.js';
import { daysAgo } from '../../../shared/utils/date-utils.js';

// Type assertion for Prisma client with ThreatDetection model
// NOTE: After running `prisma generate`, this type assertion can be removed.
type PrismaClientWithThreatDetection = PrismaClient & {
  threatDetection: {
    create: (args: { data: Record<string, unknown> }) => Promise<PrismaThreatDetectionResult>;
    findUnique: (args: { where: { id: bigint } }) => Promise<PrismaThreatDetectionResult | null>;
    findMany: (args: Record<string, unknown>) => Promise<PrismaThreatDetectionResult[]>;
    findFirst: (args: Record<string, unknown>) => Promise<PrismaThreatDetectionResult | null>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: { where: { id: bigint }; data: Record<string, unknown> }) => Promise<PrismaThreatDetectionResult>;
    groupBy: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
  };
};

// Prisma result type for ThreatDetection
interface PrismaThreatDetectionResult {
  id: bigint;
  threatType: string;
  severity: string;
  confidence: number;
  guildId: string;
  guildName: string;
  description: string;
  evidence: unknown;
  triggeringEntryId: bigint | null;
  mitreAttack: string | null;
  mitreTactic: string | null;
  recommendedAction: string;
  autoMitigated: boolean;
  mitigationAction: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  falsePositive: boolean;
  createdAt: Date;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Query options for retrieving threat detections.
 */
export interface ThreatQueryOptions {
  /** Filter by guild ID */
  guildId?: string;
  /** Filter by threat type */
  threatType?: ThreatType;
  /** Filter by severity */
  severity?: SecuritySeverity;
  /** Filter by minimum confidence */
  minConfidence?: number;
  /** Filter unresolved only */
  unresolvedOnly?: boolean;
  /** Filter false positives only */
  falsePositivesOnly?: boolean;
  /** Filter by MITRE ATT&CK ID */
  mitreAttack?: string;
  /** Filter threats after this date */
  after?: Date;
  /** Filter threats before this date */
  before?: Date;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order direction */
  orderDir?: 'asc' | 'desc';
}

/**
 * Resolution input for closing a threat.
 */
export interface ThreatResolutionInput {
  /** Who resolved the threat */
  resolvedBy: string;
  /** Resolution notes */
  resolutionNotes?: string;
  /** Mark as false positive */
  falsePositive?: boolean;
}

/**
 * Mitigation input for auto-mitigation.
 */
export interface ThreatMitigationInput {
  /** What action was taken */
  mitigationAction: string;
}

/**
 * Threat statistics.
 */
export interface ThreatStats {
  /** Total threat count */
  totalThreats: number;
  /** Unresolved count */
  unresolvedCount: number;
  /** False positive count */
  falsePositiveCount: number;
  /** Auto-mitigated count */
  autoMitigatedCount: number;
  /** Threats by type */
  byType: Record<string, number>;
  /** Threats by severity */
  bySeverity: Record<string, number>;
  /** Threats in last 24 hours */
  last24Hours: number;
  /** Threats in last 7 days */
  last7Days: number;
  /** Average confidence score */
  averageConfidence: number;
}

/**
 * MITRE ATT&CK mapping for threat types.
 */
export const MITRE_ATTACK_MAPPING: Record<ThreatType, { id: string; tactic: string; name: string }> = {
  [ThreatType.RAPID_ROLE_CHANGES]: {
    id: 'T1098.003',
    tactic: 'Privilege Escalation',
    name: 'Add Office 365 Global Administrator Role',
  },
  [ThreatType.UNUSUAL_ORIGIN]: {
    id: 'T1078',
    tactic: 'Defense Evasion',
    name: 'Valid Accounts',
  },
  [ThreatType.MASS_ROLE_REMOVAL]: {
    id: 'T1531',
    tactic: 'Impact',
    name: 'Account Access Removal',
  },
  [ThreatType.OFF_HOURS_ACTIVITY]: {
    id: 'T1098',
    tactic: 'Persistence',
    name: 'Account Manipulation',
  },
  [ThreatType.SINGLE_MEMBER_ANOMALY]: {
    id: 'T1078.001',
    tactic: 'Initial Access',
    name: 'Default Accounts',
  },
  [ThreatType.PRIVILEGE_ESCALATION]: {
    id: 'T1098.003',
    tactic: 'Privilege Escalation',
    name: 'Add Cloud Administrator Role',
  },
  [ThreatType.UNAUTHORIZED_CHANGE]: {
    id: 'T1098',
    tactic: 'Persistence',
    name: 'Account Manipulation',
  },
  [ThreatType.BOT_DETECTED_CHANGE]: {
    id: 'T1078.004',
    tactic: 'Defense Evasion',
    name: 'Cloud Accounts',
  },
};

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Service for managing threat detection records.
 *
 * Features:
 * - Threat recording with MITRE ATT&CK mapping
 * - Resolution and false positive tracking
 * - Auto-mitigation recording
 * - Forensic evidence storage
 * - Statistical analysis
 */
export class ThreatDetectionService {
  private readonly prisma: PrismaClientWithThreatDetection;

  /**
   * Create a new ThreatDetectionService.
   *
   * @param prisma - Prisma client instance
   */
  constructor(prisma: PrismaClient) {
    this.prisma = prisma as PrismaClientWithThreatDetection;
  }

  // ==========================================================================
  // CORE CRUD OPERATIONS
  // ==========================================================================

  /**
   * Record a detected threat.
   *
   * @param input - Threat detection data
   * @returns The created threat record
   */
  async recordThreat(input: ThreatDetectionInput): Promise<ThreatDetection> {
    // Auto-populate MITRE mapping if not provided
    const mitreMapping = MITRE_ATTACK_MAPPING[input.threatType];
    const mitreAttack = input.mitreAttack ?? mitreMapping?.id ?? null;
    const mitreTactic = input.mitreTactic ?? mitreMapping?.tactic ?? null;

    const threat = await this.prisma.threatDetection.create({
      data: {
        threatType: input.threatType,
        severity: input.severity,
        confidence: input.confidence,
        guildId: input.guildId,
        guildName: input.guildName,
        description: input.description,
        evidence: input.evidence as Record<string, unknown>,
        triggeringEntryId: input.triggeringEntryId ?? null,
        mitreAttack,
        mitreTactic,
        recommendedAction: input.recommendedAction,
        autoMitigated: false,
        mitigationAction: null,
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNotes: null,
        falsePositive: false,
      },
    });

    return this.mapPrismaToThreat(threat);
  }

  /**
   * Record multiple threats in a batch.
   *
   * @param inputs - Array of threat detection data
   * @returns Array of created threat records
   */
  async recordThreatsBatch(inputs: ThreatDetectionInput[]): Promise<ThreatDetection[]> {
    if (inputs.length === 0) return [];

    const threats: ThreatDetection[] = [];

    // Use `any` for transaction context until `prisma generate` is run
    await this.prisma.$transaction(async (tx: any) => {
      for (const input of inputs) {
        const mitreMapping = MITRE_ATTACK_MAPPING[input.threatType];
        const mitreAttack = input.mitreAttack ?? mitreMapping?.id ?? null;
        const mitreTactic = input.mitreTactic ?? mitreMapping?.tactic ?? null;

        const threat = await tx.threatDetection.create({
          data: {
            threatType: input.threatType,
            severity: input.severity,
            confidence: input.confidence,
            guildId: input.guildId,
            guildName: input.guildName,
            description: input.description,
            evidence: input.evidence as Record<string, unknown>,
            triggeringEntryId: input.triggeringEntryId ?? null,
            mitreAttack,
            mitreTactic,
            recommendedAction: input.recommendedAction,
            autoMitigated: false,
            resolved: false,
            falsePositive: false,
          },
        });

        threats.push(this.mapPrismaToThreat(threat));
      }
    });

    return threats;
  }

  /**
   * Get a threat by ID.
   *
   * @param id - Threat record ID
   * @returns The threat record or null
   */
  async getThreat(id: bigint): Promise<ThreatDetection | null> {
    const threat = await this.prisma.threatDetection.findUnique({
      where: { id },
    });

    return threat ? this.mapPrismaToThreat(threat) : null;
  }

  /**
   * Query threats with filtering.
   *
   * @param options - Query options
   * @returns Array of matching threats
   */
  async queryThreats(options: ThreatQueryOptions = {}): Promise<ThreatDetection[]> {
    const {
      guildId,
      threatType,
      severity,
      minConfidence,
      unresolvedOnly,
      falsePositivesOnly,
      mitreAttack,
      after,
      before,
      limit = 100,
      offset = 0,
      orderDir = 'desc',
    } = options;

    const where: Record<string, unknown> = {};

    if (guildId) where.guildId = guildId;
    if (threatType) where.threatType = threatType;
    if (severity) where.severity = severity;
    if (minConfidence !== undefined) where.confidence = { gte: minConfidence };
    if (unresolvedOnly) where.resolved = false;
    if (falsePositivesOnly) where.falsePositive = true;
    if (mitreAttack) where.mitreAttack = mitreAttack;

    if (after || before) {
      where.createdAt = {};
      if (after) (where.createdAt as Record<string, Date>).gte = after;
      if (before) (where.createdAt as Record<string, Date>).lte = before;
    }

    const threats = await this.prisma.threatDetection.findMany({
      where,
      take: Math.min(limit, 1000),
      skip: offset,
      orderBy: { createdAt: orderDir },
    });

    return threats.map((t: PrismaThreatDetectionResult) => this.mapPrismaToThreat(t));
  }

  /**
   * Count threats matching criteria.
   *
   * @param options - Query options
   * @returns Count of matching threats
   */
  async countThreats(options: ThreatQueryOptions = {}): Promise<number> {
    const {
      guildId,
      threatType,
      severity,
      minConfidence,
      unresolvedOnly,
      falsePositivesOnly,
      mitreAttack,
      after,
      before,
    } = options;

    const where: Record<string, unknown> = {};

    if (guildId) where.guildId = guildId;
    if (threatType) where.threatType = threatType;
    if (severity) where.severity = severity;
    if (minConfidence !== undefined) where.confidence = { gte: minConfidence };
    if (unresolvedOnly) where.resolved = false;
    if (falsePositivesOnly) where.falsePositive = true;
    if (mitreAttack) where.mitreAttack = mitreAttack;

    if (after || before) {
      where.createdAt = {};
      if (after) (where.createdAt as Record<string, Date>).gte = after;
      if (before) (where.createdAt as Record<string, Date>).lte = before;
    }

    return this.prisma.threatDetection.count({ where });
  }

  // ==========================================================================
  // RESOLUTION & MITIGATION
  // ==========================================================================

  /**
   * Resolve a threat.
   *
   * @param id - Threat ID
   * @param resolution - Resolution details
   * @returns Updated threat record
   */
  async resolveThreat(id: bigint, resolution: ThreatResolutionInput): Promise<ThreatDetection> {
    const threat = await this.prisma.threatDetection.update({
      where: { id },
      data: {
        resolved: true,
        resolvedBy: resolution.resolvedBy,
        resolvedAt: new Date(),
        resolutionNotes: resolution.resolutionNotes ?? null,
        falsePositive: resolution.falsePositive ?? false,
      },
    });

    return this.mapPrismaToThreat(threat);
  }

  /**
   * Mark a threat as auto-mitigated.
   *
   * @param id - Threat ID
   * @param mitigation - Mitigation details
   * @returns Updated threat record
   */
  async markAutoMitigated(id: bigint, mitigation: ThreatMitigationInput): Promise<ThreatDetection> {
    const threat = await this.prisma.threatDetection.update({
      where: { id },
      data: {
        autoMitigated: true,
        mitigationAction: mitigation.mitigationAction,
      },
    });

    return this.mapPrismaToThreat(threat);
  }

  /**
   * Mark a threat as a false positive.
   *
   * @param id - Threat ID
   * @param resolvedBy - Who marked it as false positive
   * @param notes - Optional notes
   * @returns Updated threat record
   */
  async markFalsePositive(id: bigint, resolvedBy: string, notes?: string): Promise<ThreatDetection> {
    return this.resolveThreat(id, {
      resolvedBy,
      resolutionNotes: notes,
      falsePositive: true,
    });
  }

  // ==========================================================================
  // SPECIALIZED QUERIES
  // ==========================================================================

  /**
   * Get unresolved threats for a guild.
   *
   * @param guildId - Guild ID
   * @param options - Additional options
   * @returns Array of unresolved threats
   */
  async getUnresolvedThreats(
    guildId: string,
    options: { minSeverity?: SecuritySeverity; limit?: number } = {}
  ): Promise<ThreatDetection[]> {
    const where: Record<string, unknown> = {
      guildId,
      resolved: false,
    };

    if (options.minSeverity) {
      // Filter by severity (CRITICAL > HIGH > MEDIUM > LOW > INFO)
      const severityOrder = [
        SecuritySeverity.INFO,
        SecuritySeverity.LOW,
        SecuritySeverity.MEDIUM,
        SecuritySeverity.HIGH,
        SecuritySeverity.CRITICAL,
      ];
      const minIndex = severityOrder.indexOf(options.minSeverity);
      const allowedSeverities = severityOrder.slice(minIndex);
      where.severity = { in: allowedSeverities };
    }

    const threats = await this.prisma.threatDetection.findMany({
      where,
      take: options.limit ?? 100,
      orderBy: { createdAt: 'desc' },
    });

    return threats.map((t: PrismaThreatDetectionResult) => this.mapPrismaToThreat(t));
  }

  /**
   * Get critical threats requiring immediate attention.
   *
   * @param guildId - Optional guild filter
   * @returns Array of critical unresolved threats
   */
  async getCriticalThreats(guildId?: string): Promise<ThreatDetection[]> {
    const where: Record<string, unknown> = {
      severity: SecuritySeverity.CRITICAL,
      resolved: false,
    };

    if (guildId) where.guildId = guildId;

    const threats = await this.prisma.threatDetection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return threats.map((t: PrismaThreatDetectionResult) => this.mapPrismaToThreat(t));
  }

  /**
   * Get threats by MITRE ATT&CK technique.
   *
   * @param mitreId - MITRE ATT&CK ID (e.g., 'T1098.003')
   * @param options - Query options
   * @returns Array of matching threats
   */
  async getThreatsByMitreTechnique(
    mitreId: string,
    options: { guildId?: string; unresolvedOnly?: boolean; limit?: number } = {}
  ): Promise<ThreatDetection[]> {
    const where: Record<string, unknown> = {
      mitreAttack: mitreId,
    };

    if (options.guildId) where.guildId = options.guildId;
    if (options.unresolvedOnly) where.resolved = false;

    const threats = await this.prisma.threatDetection.findMany({
      where,
      take: options.limit ?? 100,
      orderBy: { createdAt: 'desc' },
    });

    return threats.map((t: PrismaThreatDetectionResult) => this.mapPrismaToThreat(t));
  }

  /**
   * Get recent threats for dashboard display.
   *
   * @param guildId - Optional guild filter
   * @param hours - Hours to look back (default 24)
   * @returns Array of recent threats
   */
  async getRecentThreats(guildId?: string, hours: number = 24): Promise<ThreatDetection[]> {
    const after = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.queryThreats({
      guildId,
      after,
      limit: 100,
    });
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get threat statistics.
   *
   * @param guildId - Optional guild filter
   * @returns Threat statistics
   */
  async getStats(guildId?: string): Promise<ThreatStats> {
    const where = guildId ? { guildId } : {};

    const [
      totalThreats,
      unresolvedCount,
      falsePositiveCount,
      autoMitigatedCount,
      byTypeResults,
      bySeverityResults,
      last24h,
      last7d,
      avgConfidenceResult,
    ] = await Promise.all([
      // Total count
      this.prisma.threatDetection.count({ where }),

      // Unresolved count
      this.prisma.threatDetection.count({
        where: { ...where, resolved: false },
      }),

      // False positive count
      this.prisma.threatDetection.count({
        where: { ...where, falsePositive: true },
      }),

      // Auto-mitigated count
      this.prisma.threatDetection.count({
        where: { ...where, autoMitigated: true },
      }),

      // By type
      this.prisma.threatDetection.groupBy({
        by: ['threatType'],
        where,
        _count: { threatType: true },
      }),

      // By severity
      this.prisma.threatDetection.groupBy({
        by: ['severity'],
        where,
        _count: { severity: true },
      }),

      // Last 24 hours
      this.prisma.threatDetection.count({
        where: {
          ...where,
          createdAt: { gte: daysAgo(1) },
        },
      }),

      // Last 7 days
      this.prisma.threatDetection.count({
        where: {
          ...where,
          createdAt: { gte: daysAgo(7) },
        },
      }),

      // Average confidence (using raw aggregation)
      this.prisma.threatDetection.findMany({
        where,
        select: { confidence: true },
      }),
    ]);

    // Build byType map
    type GroupByTypeResult = { threatType?: string; _count: { threatType: number } };
    const byType: Record<string, number> = {};
    for (const row of byTypeResults as GroupByTypeResult[]) {
      if (row.threatType) {
        byType[row.threatType] = row._count.threatType;
      }
    }

    // Build bySeverity map
    type GroupBySeverityResult = { severity?: string; _count: { severity: number } };
    const bySeverity: Record<string, number> = {};
    for (const row of bySeverityResults as GroupBySeverityResult[]) {
      if (row.severity) {
        bySeverity[row.severity] = row._count.severity;
      }
    }

    // Calculate average confidence
    const confidenceValues = (avgConfidenceResult as Array<{ confidence: number }>).map(r => r.confidence);
    const averageConfidence = confidenceValues.length > 0
      ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
      : 0;

    return {
      totalThreats,
      unresolvedCount,
      falsePositiveCount,
      autoMitigatedCount,
      byType,
      bySeverity,
      last24Hours: last24h,
      last7Days: last7d,
      averageConfidence,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Map Prisma result to ThreatDetection type.
   */
  private mapPrismaToThreat(prismaThreat: PrismaThreatDetectionResult): ThreatDetection {
    return {
      id: prismaThreat.id,
      threatType: prismaThreat.threatType as ThreatType,
      severity: prismaThreat.severity as SecuritySeverity,
      confidence: prismaThreat.confidence,
      guildId: prismaThreat.guildId,
      guildName: prismaThreat.guildName,
      description: prismaThreat.description,
      evidence: prismaThreat.evidence as ThreatEvidence,
      triggeringEntryId: prismaThreat.triggeringEntryId,
      mitreAttack: prismaThreat.mitreAttack,
      mitreTactic: prismaThreat.mitreTactic,
      recommendedAction: prismaThreat.recommendedAction,
      autoMitigated: prismaThreat.autoMitigated,
      mitigationAction: prismaThreat.mitigationAction,
      resolved: prismaThreat.resolved,
      resolvedBy: prismaThreat.resolvedBy,
      resolvedAt: prismaThreat.resolvedAt,
      resolutionNotes: prismaThreat.resolutionNotes,
      falsePositive: prismaThreat.falsePositive,
      createdAt: prismaThreat.createdAt,
    };
  }
}
