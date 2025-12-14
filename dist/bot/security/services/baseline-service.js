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
/**
 * Default freshness configuration.
 */
export const DEFAULT_FRESHNESS_CONFIG = {
    maxAgeHours: 24,
    minConfidence: 0.7,
    minDataPoints: 200,
};
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
    prisma;
    freshnessConfig;
    /**
     * Create a new BaselineService.
     *
     * @param prisma - Prisma client instance
     * @param freshnessConfig - Configuration for freshness checks
     */
    constructor(prisma, freshnessConfig = DEFAULT_FRESHNESS_CONFIG) {
        this.prisma = prisma;
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
    async getBaseline(guildId) {
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
    async upsertBaseline(input) {
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
    async deleteBaseline(guildId) {
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
    async getAllBaselines(options = {}) {
        const { minConfidence, staleOnly, maxAgeHours = this.freshnessConfig.maxAgeHours, limit = 100, offset = 0, } = options;
        const where = {};
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
        return baselines.map((b) => this.mapPrismaToBaseline(b));
    }
    /**
     * Count baselines matching criteria.
     *
     * @param options - Query options
     * @returns Count of matching baselines
     */
    async countBaselines(options = {}) {
        const { minConfidence, staleOnly, maxAgeHours = this.freshnessConfig.maxAgeHours, } = options;
        const where = {};
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
    async checkBaselineHealth(guildId) {
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
        let reason;
        if (!isFresh && !hasSufficientConfidence) {
            reason = `Stale (${ageHours.toFixed(1)}h) and low confidence (${baseline.confidenceLevel.toFixed(2)})`;
        }
        else if (!isFresh) {
            reason = `Stale: ${ageHours.toFixed(1)}h old (max ${this.freshnessConfig.maxAgeHours}h)`;
        }
        else if (!hasSufficientConfidence) {
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
    async needsRefresh(guildId) {
        const health = await this.checkBaselineHealth(guildId);
        return !health.exists || !health.isFresh || !health.hasSufficientConfidence;
    }
    /**
     * Get a usable baseline or null if not available.
     *
     * @param guildId - Discord guild ID
     * @returns Baseline if usable, null otherwise
     */
    async getUsableBaseline(guildId) {
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
    async getStaleBaselines(maxAgeHours) {
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
    async getLowConfidenceBaselines(maxConfidence) {
        const threshold = maxConfidence ?? this.freshnessConfig.minConfidence;
        const baselines = await this.prisma.securityBaseline.findMany({
            where: {
                confidenceLevel: { lt: threshold },
            },
            orderBy: { confidenceLevel: 'asc' },
        });
        return baselines.map((b) => this.mapPrismaToBaseline(b));
    }
    /**
     * Perform bulk health check for multiple guilds.
     *
     * @param guildIds - Array of guild IDs to check
     * @returns Bulk health result
     */
    async bulkHealthCheck(guildIds) {
        const details = [];
        let usable = 0;
        let stale = 0;
        let lowConfidence = 0;
        let missing = 0;
        for (const guildId of guildIds) {
            const health = await this.checkBaselineHealth(guildId);
            details.push(health);
            if (!health.exists) {
                missing++;
            }
            else if (health.isUsable) {
                usable++;
            }
            else if (!health.isFresh) {
                stale++;
            }
            else if (!health.hasSufficientConfidence) {
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
    async getGuildsNeedingRefresh(allGuildIds) {
        const needingRefresh = [];
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
    mapPrismaToBaseline(prismaBaseline) {
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
