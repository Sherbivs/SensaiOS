/**
 * Security Baseline Service
 * =========================
 *
 * Service for managing per-guild security baselines in the database.
 * Baselines establish "normal" behavioral patterns for anomaly detection.
 *
 * This service extracts database operations from securityBaselines.js as part
 * of P0-002 Service Extraction. The baseline *computation* logic can remain
 * in securityBaselines.js; this service handles *persistence*.
 *
 * @module security/services/baseline-service
 * @research P0-002 (Service Extraction)
 *
 * @example
 * ```typescript
 * import { BaselineService } from './baseline-service';
 *
 * const service = new BaselineService(prisma);
 *
 * // Create or update a baseline
 * const baseline = await service.upsertBaseline({
 *   guildId: '123',
 *   guildName: 'My Server',
 *   averageChangesPerHour: 2.5,
 *   averageChangesPerDay: 45.3,
 *   peakActivityHours: [14, 15, 20],
 *   rapidChangeThreshold: 5,
 *   maxChangesPerMember: 10,
 *   expectedOrigins: ['member-join', 'sweep'],
 *   confidenceLevel: 0.85,
 *   dataPointCount: 350,
 *   computedAt: new Date(),
 * });
 *
 * // Get baseline for threat detection
 * const baseline = await service.getBaseline('123');
 * if (baseline && baseline.confidenceLevel >= 0.7) {
 *   // Use for threat detection
 * }
 * ```
 */

import { PrismaClient } from '../../../generated/prisma/client.js';
import {
  type SecurityBaseline,
  type SecurityBaselineInput,
} from '../types/database-models.js';

// Type assertion for Prisma client with SecurityBaseline model
// NOTE: After running `prisma generate`, this type assertion can be removed.
type PrismaClientWithSecurityBaseline = PrismaClient & {
  securityBaseline: {
    create: (args: { data: Record<string, unknown> }) => Promise<PrismaSecurityBaselineResult>;
    findUnique: (args: { where: { guildId: string } }) => Promise<PrismaSecurityBaselineResult | null>;
    findMany: (args: Record<string, unknown>) => Promise<PrismaSecurityBaselineResult[]>;
    update: (args: { where: { guildId: string }; data: Record<string, unknown> }) => Promise<PrismaSecurityBaselineResult>;
    upsert: (args: { where: { guildId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<PrismaSecurityBaselineResult>;
    delete: (args: { where: { guildId: string } }) => Promise<PrismaSecurityBaselineResult>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
};

// Prisma result type for SecurityBaseline
interface PrismaSecurityBaselineResult {
  id: bigint;
  guildId: string;
  guildName: string;
  averageChangesPerHour: number;
  averageChangesPerDay: number;
  peakActivityHours: number[];
  rapidChangeThreshold: number;
  maxChangesPerMember: number;
  expectedOrigins: string[];
  confidenceLevel: number;
  dataPointCount: number;
  computedAt: Date;
  updatedAt: Date;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for baseline freshness checks.
 */
export interface BaselineFreshnessConfig {
  /** Maximum age in hours before baseline is considered stale */
  maxAgeHours: number;
  /** Minimum confidence level required */
  minConfidence: number;
  /** Minimum data points required for high confidence */
  minDataPoints: number;
}

/**
 * Default freshness configuration.
 */
export const DEFAULT_FRESHNESS_CONFIG: BaselineFreshnessConfig = {
  maxAgeHours: 24,
  minConfidence: 0.7,
  minDataPoints: 200,
};

/**
 * Baseline query options.
 */
export interface BaselineQueryOptions {
  /** Filter by minimum confidence */
  minConfidence?: number;
  /** Filter by stale baselines (older than maxAgeHours) */
  staleOnly?: boolean;
  /** Maximum age in hours for stale filter */
  maxAgeHours?: number;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Baseline health status.
 */
export interface BaselineHealth {
  /** Guild ID */
  guildId: string;
  /** Whether baseline exists */
  exists: boolean;
  /** Whether baseline is fresh (not stale) */
  isFresh: boolean;
  /** Whether confidence is sufficient */
  hasSufficientConfidence: boolean;
  /** Whether baseline is usable for threat detection */
  isUsable: boolean;
  /** Baseline age in hours */
  ageHours: number | null;
  /** Current confidence level */
  confidenceLevel: number | null;
  /** Reason if not usable */
  reason?: string;
}

/**
 * Bulk health check result.
 */
export interface BulkHealthResult {
  /** Total guilds checked */
  total: number;
  /** Usable baselines */
  usable: number;
  /** Stale baselines */
  stale: number;
  /** Low confidence baselines */
  lowConfidence: number;
  /** Missing baselines */
  missing: number;
  /** Per-guild health details */
  details: BaselineHealth[];
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Service for managing security baselines.
 *
 * Features:
 * - Per-guild baseline storage
 * - Upsert (create or update)
 * - Freshness and confidence checks
 * - Bulk health monitoring
 */
export class BaselineService {
  private readonly prisma: PrismaClientWithSecurityBaseline;
  private readonly freshnessConfig: BaselineFreshnessConfig;

  /**
   * Create a new BaselineService.
   *
   * @param prisma - Prisma client instance
   * @param freshnessConfig - Configuration for freshness checks
   */
  constructor(
    prisma: PrismaClient,
    freshnessConfig: BaselineFreshnessConfig = DEFAULT_FRESHNESS_CONFIG
  ) {
    this.prisma = prisma as PrismaClientWithSecurityBaseline;
    this.freshnessConfig = freshnessConfig;
  }

  // ==========================================================================
  // CORE CRUD OPERATIONS
  // ==========================================================================

  /**
   * Get baseline for a guild.
   *
   * @param guildId - Discord guild ID
   * @returns Baseline or null if not found
   */
  async getBaseline(guildId: string): Promise<SecurityBaseline | null> {
    const baseline = await this.prisma.securityBaseline.findUnique({
      where: { guildId },
    });

    return baseline ? this.mapPrismaToBaseline(baseline) : null;
  }

  /**
   * Create or update a baseline for a guild.
   *
   * @param input - Baseline data
   * @returns The created or updated baseline
   */
  async upsertBaseline(input: SecurityBaselineInput): Promise<SecurityBaseline> {
    const data = {
      guildName: input.guildName,
      averageChangesPerHour: input.averageChangesPerHour,
      averageChangesPerDay: input.averageChangesPerDay,
      peakActivityHours: input.peakActivityHours,
      rapidChangeThreshold: input.rapidChangeThreshold,
      maxChangesPerMember: input.maxChangesPerMember,
      expectedOrigins: input.expectedOrigins,
      confidenceLevel: input.confidenceLevel,
      dataPointCount: input.dataPointCount,
      computedAt: input.computedAt,
    };

    const baseline = await this.prisma.securityBaseline.upsert({
      where: { guildId: input.guildId },
      create: {
        guildId: input.guildId,
        ...data,
      },
      update: data,
    });

    return this.mapPrismaToBaseline(baseline);
  }

  /**
   * Delete a baseline for a guild.
   *
   * @param guildId - Discord guild ID
   * @returns The deleted baseline
   */
  async deleteBaseline(guildId: string): Promise<SecurityBaseline> {
    const baseline = await this.prisma.securityBaseline.delete({
      where: { guildId },
    });

    return this.mapPrismaToBaseline(baseline);
  }

  /**
   * Get all baselines.
   *
   * @param options - Query options
   * @returns Array of baselines
   */
  async getAllBaselines(options: BaselineQueryOptions = {}): Promise<SecurityBaseline[]> {
    const {
      minConfidence,
      staleOnly,
      maxAgeHours = this.freshnessConfig.maxAgeHours,
      limit = 100,
      offset = 0,
    } = options;

    const where: Record<string, unknown> = {};

    if (minConfidence !== undefined) {
      where.confidenceLevel = { gte: minConfidence };
    }

    if (staleOnly) {
      const staleThreshold = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
      where.computedAt = { lt: staleThreshold };
    }

    const baselines = await this.prisma.securityBaseline.findMany({
      where,
      take: Math.min(limit, 1000),
      skip: offset,
      orderBy: { computedAt: 'desc' },
    });

    return baselines.map((b: PrismaSecurityBaselineResult) => this.mapPrismaToBaseline(b));
  }

  /**
   * Count baselines matching criteria.
   *
   * @param options - Query options
   * @returns Count of matching baselines
   */
  async countBaselines(options: BaselineQueryOptions = {}): Promise<number> {
    const {
      minConfidence,
      staleOnly,
      maxAgeHours = this.freshnessConfig.maxAgeHours,
    } = options;

    const where: Record<string, unknown> = {};

    if (minConfidence !== undefined) {
      where.confidenceLevel = { gte: minConfidence };
    }

    if (staleOnly) {
      const staleThreshold = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
      where.computedAt = { lt: staleThreshold };
    }

    return this.prisma.securityBaseline.count({ where });
  }

  // ==========================================================================
  // HEALTH & FRESHNESS
  // ==========================================================================

  /**
   * Check if a baseline exists and is usable for threat detection.
   *
   * @param guildId - Discord guild ID
   * @returns Baseline health status
   */
  async checkBaselineHealth(guildId: string): Promise<BaselineHealth> {
    const baseline = await this.getBaseline(guildId);

    if (!baseline) {
      return {
        guildId,
        exists: false,
        isFresh: false,
        hasSufficientConfidence: false,
        isUsable: false,
        ageHours: null,
        confidenceLevel: null,
        reason: 'Baseline does not exist',
      };
    }

    const ageMs = Date.now() - baseline.computedAt.getTime();
    const ageHours = ageMs / (60 * 60 * 1000);
    const isFresh = ageHours <= this.freshnessConfig.maxAgeHours;
    const hasSufficientConfidence = baseline.confidenceLevel >= this.freshnessConfig.minConfidence;
    const isUsable = isFresh && hasSufficientConfidence;

    let reason: string | undefined;
    if (!isFresh && !hasSufficientConfidence) {
      reason = `Stale (${ageHours.toFixed(1)}h) and low confidence (${baseline.confidenceLevel.toFixed(2)})`;
    } else if (!isFresh) {
      reason = `Stale: ${ageHours.toFixed(1)}h old (max ${this.freshnessConfig.maxAgeHours}h)`;
    } else if (!hasSufficientConfidence) {
      reason = `Low confidence: ${baseline.confidenceLevel.toFixed(2)} (min ${this.freshnessConfig.minConfidence})`;
    }

    return {
      guildId,
      exists: true,
      isFresh,
      hasSufficientConfidence,
      isUsable,
      ageHours,
      confidenceLevel: baseline.confidenceLevel,
      reason,
    };
  }

  /**
   * Check if a baseline needs refresh.
   *
   * @param guildId - Discord guild ID
   * @returns True if refresh is needed
   */
  async needsRefresh(guildId: string): Promise<boolean> {
    const health = await this.checkBaselineHealth(guildId);
    return !health.exists || !health.isFresh || !health.hasSufficientConfidence;
  }

  /**
   * Get a usable baseline or null if not available.
   *
   * @param guildId - Discord guild ID
   * @returns Baseline if usable, null otherwise
   */
  async getUsableBaseline(guildId: string): Promise<SecurityBaseline | null> {
    const health = await this.checkBaselineHealth(guildId);
    if (!health.isUsable) {
      return null;
    }
    return this.getBaseline(guildId);
  }

  /**
   * Get stale baselines that need refresh.
   *
   * @param maxAgeHours - Maximum age in hours (default from config)
   * @returns Array of stale baselines
   */
  async getStaleBaselines(maxAgeHours?: number): Promise<SecurityBaseline[]> {
    return this.getAllBaselines({
      staleOnly: true,
      maxAgeHours: maxAgeHours ?? this.freshnessConfig.maxAgeHours,
    });
  }

  /**
   * Get low confidence baselines that need more data.
   *
   * @param maxConfidence - Maximum confidence to filter (default from config)
   * @returns Array of low confidence baselines
   */
  async getLowConfidenceBaselines(maxConfidence?: number): Promise<SecurityBaseline[]> {
    const threshold = maxConfidence ?? this.freshnessConfig.minConfidence;
    
    const baselines = await this.prisma.securityBaseline.findMany({
      where: {
        confidenceLevel: { lt: threshold },
      },
      orderBy: { confidenceLevel: 'asc' },
    });

    return baselines.map((b: PrismaSecurityBaselineResult) => this.mapPrismaToBaseline(b));
  }

  /**
   * Perform bulk health check for multiple guilds.
   *
   * @param guildIds - Array of guild IDs to check
   * @returns Bulk health result
   */
  async bulkHealthCheck(guildIds: string[]): Promise<BulkHealthResult> {
    const details: BaselineHealth[] = [];
    let usable = 0;
    let stale = 0;
    let lowConfidence = 0;
    let missing = 0;

    for (const guildId of guildIds) {
      const health = await this.checkBaselineHealth(guildId);
      details.push(health);

      if (!health.exists) {
        missing++;
      } else if (health.isUsable) {
        usable++;
      } else if (!health.isFresh) {
        stale++;
      } else if (!health.hasSufficientConfidence) {
        lowConfidence++;
      }
    }

    return {
      total: guildIds.length,
      usable,
      stale,
      lowConfidence,
      missing,
      details,
    };
  }

  // ==========================================================================
  // UTILITY
  // ==========================================================================

  /**
   * Get guild IDs that need baseline computation.
   *
   * @param allGuildIds - All guild IDs to check
   * @returns Guild IDs needing refresh
   */
  async getGuildsNeedingRefresh(allGuildIds: string[]): Promise<string[]> {
    const needingRefresh: string[] = [];

    for (const guildId of allGuildIds) {
      if (await this.needsRefresh(guildId)) {
        needingRefresh.push(guildId);
      }
    }

    return needingRefresh;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Map Prisma result to SecurityBaseline type.
   */
  private mapPrismaToBaseline(prismaBaseline: PrismaSecurityBaselineResult): SecurityBaseline {
    return {
      id: prismaBaseline.id,
      guildId: prismaBaseline.guildId,
      guildName: prismaBaseline.guildName,
      averageChangesPerHour: prismaBaseline.averageChangesPerHour,
      averageChangesPerDay: prismaBaseline.averageChangesPerDay,
      peakActivityHours: prismaBaseline.peakActivityHours,
      rapidChangeThreshold: prismaBaseline.rapidChangeThreshold,
      maxChangesPerMember: prismaBaseline.maxChangesPerMember,
      expectedOrigins: prismaBaseline.expectedOrigins,
      confidenceLevel: prismaBaseline.confidenceLevel,
      dataPointCount: prismaBaseline.dataPointCount,
      computedAt: prismaBaseline.computedAt,
      updatedAt: prismaBaseline.updatedAt,
    };
  }
}
