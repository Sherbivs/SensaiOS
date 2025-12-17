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
import { ThreatType, SecuritySeverity, } from '../types/database-models.js';
import { daysAgo } from '../../../shared/utils/date-utils.js';
/**
 * MITRE ATT&CK mapping for threat types.
 */
export const MITRE_ATTACK_MAPPING = {
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
    prisma;
    /**
     * Create a new ThreatDetectionService.
     *
     * @param prisma - Prisma client instance
     */
    constructor(prisma) {
        this.prisma = prisma;
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
    async recordThreat(input) {
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
                evidence: input.evidence,
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
    async recordThreatsBatch(inputs) {
        if (inputs.length === 0)
            return [];
        const threats = [];
        // Use `any` for transaction context until `prisma generate` is run
        await this.prisma.$transaction(async (tx) => {
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
                        evidence: input.evidence,
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
    async getThreat(id) {
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
    async queryThreats(options = {}) {
        const { guildId, threatType, severity, minConfidence, unresolvedOnly, falsePositivesOnly, mitreAttack, after, before, limit = 100, offset = 0, orderDir = 'desc', } = options;
        const where = {};
        if (guildId)
            where.guildId = guildId;
        if (threatType)
            where.threatType = threatType;
        if (severity)
            where.severity = severity;
        if (minConfidence !== undefined)
            where.confidence = { gte: minConfidence };
        if (unresolvedOnly)
            where.resolved = false;
        if (falsePositivesOnly)
            where.falsePositive = true;
        if (mitreAttack)
            where.mitreAttack = mitreAttack;
        if (after || before) {
            where.createdAt = {};
            if (after)
                where.createdAt.gte = after;
            if (before)
                where.createdAt.lte = before;
        }
        const threats = await this.prisma.threatDetection.findMany({
            where,
            take: Math.min(limit, 1000),
            skip: offset,
            orderBy: { createdAt: orderDir },
        });
        return threats.map((t) => this.mapPrismaToThreat(t));
    }
    /**
     * Count threats matching criteria.
     *
     * @param options - Query options
     * @returns Count of matching threats
     */
    async countThreats(options = {}) {
        const { guildId, threatType, severity, minConfidence, unresolvedOnly, falsePositivesOnly, mitreAttack, after, before, } = options;
        const where = {};
        if (guildId)
            where.guildId = guildId;
        if (threatType)
            where.threatType = threatType;
        if (severity)
            where.severity = severity;
        if (minConfidence !== undefined)
            where.confidence = { gte: minConfidence };
        if (unresolvedOnly)
            where.resolved = false;
        if (falsePositivesOnly)
            where.falsePositive = true;
        if (mitreAttack)
            where.mitreAttack = mitreAttack;
        if (after || before) {
            where.createdAt = {};
            if (after)
                where.createdAt.gte = after;
            if (before)
                where.createdAt.lte = before;
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
    async resolveThreat(id, resolution) {
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
    async markAutoMitigated(id, mitigation) {
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
    async markFalsePositive(id, resolvedBy, notes) {
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
    async getUnresolvedThreats(guildId, options = {}) {
        const where = {
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
        return threats.map((t) => this.mapPrismaToThreat(t));
    }
    /**
     * Get critical threats requiring immediate attention.
     *
     * @param guildId - Optional guild filter
     * @returns Array of critical unresolved threats
     */
    async getCriticalThreats(guildId) {
        const where = {
            severity: SecuritySeverity.CRITICAL,
            resolved: false,
        };
        if (guildId)
            where.guildId = guildId;
        const threats = await this.prisma.threatDetection.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
        return threats.map((t) => this.mapPrismaToThreat(t));
    }
    /**
     * Get threats by MITRE ATT&CK technique.
     *
     * @param mitreId - MITRE ATT&CK ID (e.g., 'T1098.003')
     * @param options - Query options
     * @returns Array of matching threats
     */
    async getThreatsByMitreTechnique(mitreId, options = {}) {
        const where = {
            mitreAttack: mitreId,
        };
        if (options.guildId)
            where.guildId = options.guildId;
        if (options.unresolvedOnly)
            where.resolved = false;
        const threats = await this.prisma.threatDetection.findMany({
            where,
            take: options.limit ?? 100,
            orderBy: { createdAt: 'desc' },
        });
        return threats.map((t) => this.mapPrismaToThreat(t));
    }
    /**
     * Get recent threats for dashboard display.
     *
     * @param guildId - Optional guild filter
     * @param hours - Hours to look back (default 24)
     * @returns Array of recent threats
     */
    async getRecentThreats(guildId, hours = 24) {
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
    async getStats(guildId) {
        const where = guildId ? { guildId } : {};
        const [totalThreats, unresolvedCount, falsePositiveCount, autoMitigatedCount, byTypeResults, bySeverityResults, last24h, last7d, avgConfidenceResult,] = await Promise.all([
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
        const byType = {};
        for (const row of byTypeResults) {
            if (row.threatType) {
                byType[row.threatType] = row._count.threatType;
            }
        }
        const bySeverity = {};
        for (const row of bySeverityResults) {
            if (row.severity) {
                bySeverity[row.severity] = row._count.severity;
            }
        }
        // Calculate average confidence
        const confidenceValues = avgConfidenceResult.map(r => r.confidence);
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
    mapPrismaToThreat(prismaThreat) {
        return {
            id: prismaThreat.id,
            threatType: prismaThreat.threatType,
            severity: prismaThreat.severity,
            confidence: prismaThreat.confidence,
            guildId: prismaThreat.guildId,
            guildName: prismaThreat.guildName,
            description: prismaThreat.description,
            evidence: prismaThreat.evidence,
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
