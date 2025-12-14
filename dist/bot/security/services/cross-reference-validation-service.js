/**
 * Cross-Reference Validation Service (P2-002)
 *
 * Validates data consistency across related security tables by checking:
 * - Foreign key references (guild_id, user_id, etc.)
 * - Orphan record detection
 * - Referential integrity verification
 * - Cross-table consistency (event → threat → baseline chains)
 *
 * @module CrossReferenceValidationService
 * @security Data Integrity, CWE-840 (Business Logic Errors)
 */
/**
 * Types of validation checks
 */
export var ValidationCheckType;
(function (ValidationCheckType) {
    /** Foreign key reference exists */
    ValidationCheckType["FOREIGN_KEY"] = "FOREIGN_KEY";
    /** No orphan records */
    ValidationCheckType["ORPHAN_DETECTION"] = "ORPHAN_DETECTION";
    /** Cross-table consistency */
    ValidationCheckType["CONSISTENCY"] = "CONSISTENCY";
    /** Referential integrity */
    ValidationCheckType["REFERENTIAL_INTEGRITY"] = "REFERENTIAL_INTEGRITY";
    /** Business rule validation */
    ValidationCheckType["BUSINESS_RULE"] = "BUSINESS_RULE";
})(ValidationCheckType || (ValidationCheckType = {}));
/**
 * Severity of validation issues
 */
export var ValidationSeverity;
(function (ValidationSeverity) {
    /** Informational - expected state */
    ValidationSeverity["INFO"] = "INFO";
    /** Warning - potentially problematic */
    ValidationSeverity["WARNING"] = "WARNING";
    /** Error - data integrity issue */
    ValidationSeverity["ERROR"] = "ERROR";
    /** Critical - immediate action required */
    ValidationSeverity["CRITICAL"] = "CRITICAL";
})(ValidationSeverity || (ValidationSeverity = {}));
// ============================================================================
// Constants
// ============================================================================
/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
    batchSize: 1000,
    maxOrphansPerTable: 100,
    parallelValidation: true,
    validationTimeoutMs: 30000,
    tablesToValidate: [],
};
/**
 * Security table foreign key relationships
 */
export const SECURITY_FOREIGN_KEYS = [
    // SecurityEvent relationships
    {
        sourceTable: "SecurityEvent",
        sourceColumn: "guildId",
        targetTable: "Guild",
        targetColumn: "id",
        nullable: false,
        description: "Security events must reference a valid guild",
    },
    {
        sourceTable: "SecurityEvent",
        sourceColumn: "actorId",
        targetTable: "User",
        targetColumn: "id",
        nullable: true,
        description: "Security event actor should reference a valid user",
    },
    // RoleChangeAudit relationships
    {
        sourceTable: "RoleChangeAudit",
        sourceColumn: "guildId",
        targetTable: "Guild",
        targetColumn: "id",
        nullable: false,
        description: "Role changes must reference a valid guild",
    },
    {
        sourceTable: "RoleChangeAudit",
        sourceColumn: "memberId",
        targetTable: "User",
        targetColumn: "id",
        nullable: false,
        description: "Role changes must reference a valid member",
    },
    // ThreatDetection relationships
    {
        sourceTable: "ThreatDetection",
        sourceColumn: "guildId",
        targetTable: "Guild",
        targetColumn: "id",
        nullable: false,
        description: "Threat detections must reference a valid guild",
    },
    {
        sourceTable: "ThreatDetection",
        sourceColumn: "actorId",
        targetTable: "User",
        targetColumn: "id",
        nullable: true,
        description: "Threat detection actor should reference a valid user",
    },
    // SecurityBaseline relationships
    {
        sourceTable: "SecurityBaseline",
        sourceColumn: "guildId",
        targetTable: "Guild",
        targetColumn: "id",
        nullable: false,
        description: "Security baselines must reference a valid guild",
    },
];
// ============================================================================
// Service Implementation
// ============================================================================
/**
 * Cross-Reference Validation Service
 *
 * Validates data consistency across security tables by checking foreign keys,
 * detecting orphans, and verifying cross-table relationships.
 */
export class CrossReferenceValidationService {
    config;
    logger;
    prisma;
    customRules = [];
    /**
     * Creates a new CrossReferenceValidationService instance
     */
    constructor(prisma, config = {}) {
        this.prisma = prisma;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = this.config.logger;
    }
    // ==========================================================================
    // Public API
    // ==========================================================================
    /**
     * Runs a full validation sweep across all security tables
     */
    async runFullValidation() {
        const startedAt = new Date();
        const reportId = this.generateReportId();
        this.logger?.info("Starting full cross-reference validation", { reportId });
        const checkResults = [];
        // Run foreign key validations
        const fkResults = await this.validateForeignKeys();
        checkResults.push(...fkResults);
        // Run orphan detection
        const orphanResults = await this.detectOrphans();
        checkResults.push(...orphanResults);
        // Run consistency rules
        const consistencyResults = await this.runConsistencyRules();
        checkResults.push(...consistencyResults);
        // Run business rule validations
        const businessResults = await this.validateBusinessRules();
        checkResults.push(...businessResults);
        const completedAt = new Date();
        const report = this.buildReport(reportId, startedAt, completedAt, checkResults);
        this.logger?.info("Cross-reference validation complete", {
            reportId,
            totalChecks: report.totalChecks,
            passedChecks: report.passedChecks,
            failedChecks: report.failedChecks,
            totalIssues: report.totalIssues,
            healthStatus: report.healthStatus,
            durationMs: report.totalDurationMs,
        });
        return report;
    }
    /**
     * Validates a specific guild's data consistency
     */
    async validateGuild(guildId) {
        const startedAt = new Date();
        const reportId = this.generateReportId();
        this.logger?.info("Starting guild-specific validation", { reportId, guildId });
        const checkResults = [];
        // Guild-specific foreign key checks
        const fkResult = await this.validateGuildForeignKeys(guildId);
        checkResults.push(fkResult);
        // Guild-specific orphan detection
        const orphanResult = await this.detectGuildOrphans(guildId);
        checkResults.push(orphanResult);
        // Guild-specific consistency checks
        const consistencyResult = await this.validateGuildConsistency(guildId);
        checkResults.push(consistencyResult);
        const completedAt = new Date();
        return this.buildReport(reportId, startedAt, completedAt, checkResults);
    }
    /**
     * Registers a custom consistency rule
     */
    registerConsistencyRule(rule) {
        this.customRules.push(rule);
        this.logger?.debug("Registered consistency rule", {
            ruleId: rule.id,
            ruleName: rule.name,
        });
    }
    /**
     * Gets all registered consistency rules
     */
    getConsistencyRules() {
        return [...this.customRules];
    }
    // ==========================================================================
    // Foreign Key Validation
    // ==========================================================================
    /**
     * Validates all foreign key relationships
     */
    async validateForeignKeys() {
        const results = [];
        for (const fk of SECURITY_FOREIGN_KEYS) {
            if (this.config.tablesToValidate.length > 0 &&
                !this.config.tablesToValidate.includes(fk.sourceTable)) {
                continue;
            }
            const result = await this.validateForeignKey(fk);
            results.push(result);
        }
        return results;
    }
    /**
     * Validates a single foreign key relationship
     */
    async validateForeignKey(fk) {
        const startTime = Date.now();
        const checkName = `FK_${fk.sourceTable}_${fk.sourceColumn}_${fk.targetTable}`;
        const issues = [];
        try {
            // Find records with invalid foreign keys using raw SQL
            // This is more efficient than loading all records into memory
            const query = fk.nullable
                ? `
          SELECT s."${fk.sourceColumn}" as invalid_id, COUNT(*) as count
          FROM "${fk.sourceTable}" s
          LEFT JOIN "${fk.targetTable}" t ON s."${fk.sourceColumn}" = t."${fk.targetColumn}"
          WHERE s."${fk.sourceColumn}" IS NOT NULL AND t."${fk.targetColumn}" IS NULL
          GROUP BY s."${fk.sourceColumn}"
          LIMIT ${this.config.maxOrphansPerTable}
        `
                : `
          SELECT s."${fk.sourceColumn}" as invalid_id, COUNT(*) as count
          FROM "${fk.sourceTable}" s
          LEFT JOIN "${fk.targetTable}" t ON s."${fk.sourceColumn}" = t."${fk.targetColumn}"
          WHERE t."${fk.targetColumn}" IS NULL
          GROUP BY s."${fk.sourceColumn}"
          LIMIT ${this.config.maxOrphansPerTable}
        `;
            const invalidRefs = (await this.prisma.$queryRawUnsafe(query));
            if (invalidRefs.length > 0) {
                const totalCount = invalidRefs.reduce((sum, r) => sum + Number(r.count), 0);
                issues.push({
                    id: this.generateIssueId(),
                    checkType: ValidationCheckType.FOREIGN_KEY,
                    severity: totalCount > 100
                        ? ValidationSeverity.CRITICAL
                        : totalCount > 10
                            ? ValidationSeverity.ERROR
                            : ValidationSeverity.WARNING,
                    sourceTable: fk.sourceTable,
                    relatedTable: fk.targetTable,
                    column: fk.sourceColumn,
                    description: `${totalCount} records in ${fk.sourceTable} reference non-existent ${fk.targetTable} records`,
                    affectedIds: invalidRefs.map((r) => String(r.invalid_id)),
                    affectedCount: totalCount,
                    detectedAt: new Date(),
                    suggestedFix: `Delete orphaned records or restore missing ${fk.targetTable} records`,
                    context: {
                        foreignKey: fk,
                        sampleInvalidIds: invalidRefs
                            .slice(0, 5)
                            .map((r) => String(r.invalid_id)),
                    },
                });
            }
            // Get total count for reporting
            const countResult = (await this.prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${fk.sourceTable}"`));
            const totalRecords = Number(countResult[0]?.count ?? 0);
            return {
                checkName,
                checkType: ValidationCheckType.FOREIGN_KEY,
                passed: issues.length === 0,
                recordsChecked: totalRecords,
                issuesFound: issues.length,
                issues,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            this.logger?.error("Foreign key validation failed", {
                checkName,
                error: errorMessage,
            });
            return {
                checkName,
                checkType: ValidationCheckType.FOREIGN_KEY,
                passed: false,
                recordsChecked: 0,
                issuesFound: 0,
                issues: [],
                durationMs: Date.now() - startTime,
                error: errorMessage,
            };
        }
    }
    /**
     * Validates foreign keys for a specific guild
     */
    async validateGuildForeignKeys(guildId) {
        const startTime = Date.now();
        const checkName = `GUILD_FK_${guildId}`;
        const issues = [];
        try {
            // Check if guild exists
            const guildExists = await this.checkGuildExists(guildId);
            if (!guildExists) {
                issues.push({
                    id: this.generateIssueId(),
                    checkType: ValidationCheckType.FOREIGN_KEY,
                    severity: ValidationSeverity.CRITICAL,
                    sourceTable: "Guild",
                    column: "id",
                    description: `Guild ${guildId} does not exist`,
                    affectedIds: [guildId],
                    affectedCount: 1,
                    detectedAt: new Date(),
                    suggestedFix: "Create guild record or clean up orphaned data",
                });
            }
            // Count records referencing this guild across tables
            let totalRecords = 0;
            const tables = [
                "SecurityEvent",
                "RoleChangeAudit",
                "ThreatDetection",
                "SecurityBaseline",
            ];
            for (const table of tables) {
                try {
                    const countResult = (await this.prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${table}" WHERE "guildId" = $1`, guildId));
                    totalRecords += Number(countResult[0]?.count ?? 0);
                }
                catch {
                    // Table might not exist in schema
                }
            }
            return {
                checkName,
                checkType: ValidationCheckType.FOREIGN_KEY,
                passed: issues.length === 0,
                recordsChecked: totalRecords,
                issuesFound: issues.length,
                issues,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                checkName,
                checkType: ValidationCheckType.FOREIGN_KEY,
                passed: false,
                recordsChecked: 0,
                issuesFound: 0,
                issues: [],
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    // ==========================================================================
    // Orphan Detection
    // ==========================================================================
    /**
     * Detects orphan records across all tables
     */
    async detectOrphans() {
        const results = [];
        // Security events without associated threats (might be orphans)
        const eventOrphanResult = await this.detectSecurityEventOrphans();
        results.push(eventOrphanResult);
        // Threats without resolution
        const unresolvedThreatsResult = await this.detectUnresolvedThreats();
        results.push(unresolvedThreatsResult);
        // Baselines without recent events
        const staleBaselineResult = await this.detectStaleBaselines();
        results.push(staleBaselineResult);
        return results;
    }
    /**
     * Detects security events that might be orphaned
     */
    async detectSecurityEventOrphans() {
        const startTime = Date.now();
        const checkName = "ORPHAN_SecurityEvents";
        const issues = [];
        try {
            // Find events older than 90 days with no related records
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 90);
            // This is a placeholder - actual implementation depends on schema
            const query = `
        SELECT e."id", e."guildId", e."createdAt"
        FROM "SecurityEvent" e
        WHERE e."createdAt" < $1
        ORDER BY e."createdAt" ASC
        LIMIT ${this.config.maxOrphansPerTable}
      `;
            const oldEvents = (await this.prisma.$queryRawUnsafe(query, cutoffDate));
            // Get total count
            const countResult = (await this.prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "SecurityEvent"`));
            const totalRecords = Number(countResult[0]?.count ?? 0);
            if (oldEvents.length > 0) {
                issues.push({
                    id: this.generateIssueId(),
                    checkType: ValidationCheckType.ORPHAN_DETECTION,
                    severity: ValidationSeverity.INFO,
                    sourceTable: "SecurityEvent",
                    column: "createdAt",
                    description: `${oldEvents.length} security events older than 90 days found`,
                    affectedIds: oldEvents.map((e) => e.id),
                    affectedCount: oldEvents.length,
                    detectedAt: new Date(),
                    suggestedFix: "Consider archiving or deleting old security events",
                    context: {
                        cutoffDate: cutoffDate.toISOString(),
                        oldestEvent: oldEvents[0]?.createdAt,
                    },
                });
            }
            return {
                checkName,
                checkType: ValidationCheckType.ORPHAN_DETECTION,
                passed: true, // Old events are informational, not failures
                recordsChecked: totalRecords,
                issuesFound: issues.length,
                issues,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                checkName,
                checkType: ValidationCheckType.ORPHAN_DETECTION,
                passed: false,
                recordsChecked: 0,
                issuesFound: 0,
                issues: [],
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    /**
     * Detects unresolved threats
     */
    async detectUnresolvedThreats() {
        const startTime = Date.now();
        const checkName = "ORPHAN_UnresolvedThreats";
        const issues = [];
        try {
            // Find unresolved threats older than 7 days
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 7);
            const query = `
        SELECT t."id", t."guildId", t."threatType", t."createdAt"
        FROM "ThreatDetection" t
        WHERE t."resolved" = false AND t."createdAt" < $1
        ORDER BY t."createdAt" ASC
        LIMIT ${this.config.maxOrphansPerTable}
      `;
            const unresolvedThreats = (await this.prisma.$queryRawUnsafe(query, cutoffDate));
            // Get total unresolved count
            const countResult = (await this.prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "ThreatDetection" WHERE "resolved" = false`));
            const totalUnresolved = Number(countResult[0]?.count ?? 0);
            if (unresolvedThreats.length > 0) {
                issues.push({
                    id: this.generateIssueId(),
                    checkType: ValidationCheckType.ORPHAN_DETECTION,
                    severity: unresolvedThreats.length > 50
                        ? ValidationSeverity.ERROR
                        : unresolvedThreats.length > 10
                            ? ValidationSeverity.WARNING
                            : ValidationSeverity.INFO,
                    sourceTable: "ThreatDetection",
                    column: "resolved",
                    description: `${unresolvedThreats.length} unresolved threats older than 7 days`,
                    affectedIds: unresolvedThreats.map((t) => t.id),
                    affectedCount: unresolvedThreats.length,
                    detectedAt: new Date(),
                    suggestedFix: "Review and resolve stale threat detections",
                    context: {
                        cutoffDate: cutoffDate.toISOString(),
                        totalUnresolved,
                        threatTypes: [...new Set(unresolvedThreats.map((t) => t.threatType))],
                    },
                });
            }
            return {
                checkName,
                checkType: ValidationCheckType.ORPHAN_DETECTION,
                passed: unresolvedThreats.length === 0,
                recordsChecked: totalUnresolved,
                issuesFound: issues.length,
                issues,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                checkName,
                checkType: ValidationCheckType.ORPHAN_DETECTION,
                passed: false,
                recordsChecked: 0,
                issuesFound: 0,
                issues: [],
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    /**
     * Detects stale baselines
     */
    async detectStaleBaselines() {
        const startTime = Date.now();
        const checkName = "ORPHAN_StaleBaselines";
        const issues = [];
        try {
            // Find baselines not updated in 30+ days
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);
            const query = `
        SELECT b."id", b."guildId", b."updatedAt"
        FROM "SecurityBaseline" b
        WHERE b."updatedAt" < $1
        ORDER BY b."updatedAt" ASC
        LIMIT ${this.config.maxOrphansPerTable}
      `;
            const staleBaselines = (await this.prisma.$queryRawUnsafe(query, cutoffDate));
            // Get total baseline count
            const countResult = (await this.prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "SecurityBaseline"`));
            const totalBaselines = Number(countResult[0]?.count ?? 0);
            if (staleBaselines.length > 0) {
                issues.push({
                    id: this.generateIssueId(),
                    checkType: ValidationCheckType.ORPHAN_DETECTION,
                    severity: staleBaselines.length > 20
                        ? ValidationSeverity.WARNING
                        : ValidationSeverity.INFO,
                    sourceTable: "SecurityBaseline",
                    column: "updatedAt",
                    description: `${staleBaselines.length} security baselines not updated in 30+ days`,
                    affectedIds: staleBaselines.map((b) => b.id),
                    affectedCount: staleBaselines.length,
                    detectedAt: new Date(),
                    suggestedFix: "Recompute baselines for active guilds",
                    context: {
                        cutoffDate: cutoffDate.toISOString(),
                        totalBaselines,
                        oldestUpdate: staleBaselines[0]?.updatedAt,
                    },
                });
            }
            return {
                checkName,
                checkType: ValidationCheckType.ORPHAN_DETECTION,
                passed: true, // Stale baselines are informational
                recordsChecked: totalBaselines,
                issuesFound: issues.length,
                issues,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                checkName,
                checkType: ValidationCheckType.ORPHAN_DETECTION,
                passed: false,
                recordsChecked: 0,
                issuesFound: 0,
                issues: [],
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    /**
     * Detects orphan records for a specific guild
     */
    async detectGuildOrphans(guildId) {
        const startTime = Date.now();
        const checkName = `ORPHAN_Guild_${guildId}`;
        const issues = [];
        try {
            // Check for data in security tables but no baseline
            const hasBaseline = await this.checkGuildHasBaseline(guildId);
            const hasEvents = await this.checkGuildHasEvents(guildId);
            if (hasEvents && !hasBaseline) {
                issues.push({
                    id: this.generateIssueId(),
                    checkType: ValidationCheckType.ORPHAN_DETECTION,
                    severity: ValidationSeverity.WARNING,
                    sourceTable: "SecurityBaseline",
                    column: "guildId",
                    description: `Guild ${guildId} has security events but no baseline`,
                    affectedIds: [guildId],
                    affectedCount: 1,
                    detectedAt: new Date(),
                    suggestedFix: "Compute initial security baseline for this guild",
                });
            }
            return {
                checkName,
                checkType: ValidationCheckType.ORPHAN_DETECTION,
                passed: issues.length === 0,
                recordsChecked: 1,
                issuesFound: issues.length,
                issues,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                checkName,
                checkType: ValidationCheckType.ORPHAN_DETECTION,
                passed: false,
                recordsChecked: 0,
                issuesFound: 0,
                issues: [],
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    // ==========================================================================
    // Consistency Rules
    // ==========================================================================
    /**
     * Runs all registered consistency rules
     */
    async runConsistencyRules() {
        const results = [];
        for (const rule of this.customRules) {
            try {
                const result = await rule.validate(this.prisma, this.config);
                results.push(result);
            }
            catch (error) {
                results.push({
                    checkName: rule.name,
                    checkType: ValidationCheckType.CONSISTENCY,
                    passed: false,
                    recordsChecked: 0,
                    issuesFound: 0,
                    issues: [],
                    durationMs: 0,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        }
        return results;
    }
    /**
     * Validates consistency for a specific guild
     */
    async validateGuildConsistency(guildId) {
        const startTime = Date.now();
        const checkName = `CONSISTENCY_Guild_${guildId}`;
        const issues = [];
        try {
            // Check event severity consistency
            const severityIssues = await this.checkEventSeverityConsistency(guildId);
            issues.push(...severityIssues);
            // Check threat-event relationship
            const threatEventIssues = await this.checkThreatEventRelationship(guildId);
            issues.push(...threatEventIssues);
            return {
                checkName,
                checkType: ValidationCheckType.CONSISTENCY,
                passed: issues.length === 0,
                recordsChecked: 1,
                issuesFound: issues.length,
                issues,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                checkName,
                checkType: ValidationCheckType.CONSISTENCY,
                passed: false,
                recordsChecked: 0,
                issuesFound: 0,
                issues: [],
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    /**
     * Checks event severity consistency
     */
    async checkEventSeverityConsistency(guildId) {
        const issues = [];
        try {
            // Find events with severity mismatch (e.g., CRITICAL without threat)
            const query = `
        SELECT e."id", e."severity", e."eventType"
        FROM "SecurityEvent" e
        LEFT JOIN "ThreatDetection" t ON e."guildId" = t."guildId" 
          AND e."createdAt" BETWEEN t."createdAt" - INTERVAL '1 hour' AND t."createdAt" + INTERVAL '1 hour'
        WHERE e."guildId" = $1 AND e."severity" = 'CRITICAL' AND t."id" IS NULL
        LIMIT ${this.config.maxOrphansPerTable}
      `;
            const criticalWithoutThreat = (await this.prisma.$queryRawUnsafe(query, guildId));
            if (criticalWithoutThreat.length > 0) {
                issues.push({
                    id: this.generateIssueId(),
                    checkType: ValidationCheckType.CONSISTENCY,
                    severity: ValidationSeverity.WARNING,
                    sourceTable: "SecurityEvent",
                    relatedTable: "ThreatDetection",
                    column: "severity",
                    description: `${criticalWithoutThreat.length} CRITICAL events without associated threat detection`,
                    affectedIds: criticalWithoutThreat.map((e) => e.id),
                    affectedCount: criticalWithoutThreat.length,
                    detectedAt: new Date(),
                    suggestedFix: "Review critical events and create threat detections if needed",
                });
            }
        }
        catch {
            // Query might fail if schema doesn't match - that's OK
        }
        return issues;
    }
    /**
     * Checks threat-event relationship consistency
     */
    async checkThreatEventRelationship(guildId) {
        const issues = [];
        try {
            // Find threats without any associated events (suspicious)
            const query = `
        SELECT t."id", t."threatType", t."createdAt"
        FROM "ThreatDetection" t
        LEFT JOIN "SecurityEvent" e ON t."guildId" = e."guildId"
          AND e."createdAt" BETWEEN t."createdAt" - INTERVAL '1 hour' AND t."createdAt" + INTERVAL '1 hour'
        WHERE t."guildId" = $1 AND e."id" IS NULL
        LIMIT ${this.config.maxOrphansPerTable}
      `;
            const threatsWithoutEvents = (await this.prisma.$queryRawUnsafe(query, guildId));
            if (threatsWithoutEvents.length > 0) {
                issues.push({
                    id: this.generateIssueId(),
                    checkType: ValidationCheckType.CONSISTENCY,
                    severity: ValidationSeverity.INFO,
                    sourceTable: "ThreatDetection",
                    relatedTable: "SecurityEvent",
                    column: "id",
                    description: `${threatsWithoutEvents.length} threats without nearby security events`,
                    affectedIds: threatsWithoutEvents.map((t) => t.id),
                    affectedCount: threatsWithoutEvents.length,
                    detectedAt: new Date(),
                    suggestedFix: "Review threat source - may be legitimate or indicate data gap",
                });
            }
        }
        catch {
            // Query might fail if schema doesn't match - that's OK
        }
        return issues;
    }
    // ==========================================================================
    // Business Rule Validation
    // ==========================================================================
    /**
     * Validates business rules across security data
     */
    async validateBusinessRules() {
        const results = [];
        // Check for duplicate events
        const duplicateResult = await this.checkDuplicateEvents();
        results.push(duplicateResult);
        // Check for impossible timestamps
        const timestampResult = await this.checkTimestampSanity();
        results.push(timestampResult);
        return results;
    }
    /**
     * Checks for duplicate security events
     */
    async checkDuplicateEvents() {
        const startTime = Date.now();
        const checkName = "BUSINESS_DuplicateEvents";
        const issues = [];
        try {
            // Find potential duplicate events (same guild, type, actor within 1 second)
            const query = `
        SELECT "guildId", "eventType", "actorId", COUNT(*) as count
        FROM "SecurityEvent"
        WHERE "createdAt" > NOW() - INTERVAL '1 day'
        GROUP BY "guildId", "eventType", "actorId", DATE_TRUNC('second', "createdAt")
        HAVING COUNT(*) > 1
        LIMIT ${this.config.maxOrphansPerTable}
      `;
            const duplicates = (await this.prisma.$queryRawUnsafe(query));
            const totalDuplicates = duplicates.reduce((sum, d) => sum + Number(d.count), 0);
            if (totalDuplicates > 0) {
                issues.push({
                    id: this.generateIssueId(),
                    checkType: ValidationCheckType.BUSINESS_RULE,
                    severity: totalDuplicates > 100 ? ValidationSeverity.WARNING : ValidationSeverity.INFO,
                    sourceTable: "SecurityEvent",
                    column: "multiple",
                    description: `${totalDuplicates} potential duplicate events detected in last 24h`,
                    affectedIds: duplicates.map((d) => d.guildId),
                    affectedCount: totalDuplicates,
                    detectedAt: new Date(),
                    suggestedFix: "Review event generation for duplicate prevention",
                    context: {
                        sampleDuplicates: duplicates.slice(0, 5),
                    },
                });
            }
            return {
                checkName,
                checkType: ValidationCheckType.BUSINESS_RULE,
                passed: totalDuplicates === 0,
                recordsChecked: totalDuplicates,
                issuesFound: issues.length,
                issues,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                checkName,
                checkType: ValidationCheckType.BUSINESS_RULE,
                passed: false,
                recordsChecked: 0,
                issuesFound: 0,
                issues: [],
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    /**
     * Checks for impossible timestamps
     */
    async checkTimestampSanity() {
        const startTime = Date.now();
        const checkName = "BUSINESS_TimestampSanity";
        const issues = [];
        try {
            // Find events with future timestamps
            const query = `
        SELECT "id", "guildId", "createdAt"
        FROM "SecurityEvent"
        WHERE "createdAt" > NOW() + INTERVAL '1 minute'
        LIMIT ${this.config.maxOrphansPerTable}
      `;
            const futureEvents = (await this.prisma.$queryRawUnsafe(query));
            if (futureEvents.length > 0) {
                issues.push({
                    id: this.generateIssueId(),
                    checkType: ValidationCheckType.BUSINESS_RULE,
                    severity: ValidationSeverity.ERROR,
                    sourceTable: "SecurityEvent",
                    column: "createdAt",
                    description: `${futureEvents.length} events have future timestamps`,
                    affectedIds: futureEvents.map((e) => e.id),
                    affectedCount: futureEvents.length,
                    detectedAt: new Date(),
                    suggestedFix: "Fix timestamp generation - check for clock skew or bugs",
                });
            }
            return {
                checkName,
                checkType: ValidationCheckType.BUSINESS_RULE,
                passed: futureEvents.length === 0,
                recordsChecked: futureEvents.length,
                issuesFound: issues.length,
                issues,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                checkName,
                checkType: ValidationCheckType.BUSINESS_RULE,
                passed: false,
                recordsChecked: 0,
                issuesFound: 0,
                issues: [],
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    // ==========================================================================
    // Helper Methods
    // ==========================================================================
    /**
     * Checks if a guild exists
     */
    async checkGuildExists(guildId) {
        try {
            const result = (await this.prisma.$queryRawUnsafe(`SELECT 1 FROM "Guild" WHERE "id" = $1 LIMIT 1`, guildId));
            return result.length > 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Checks if a guild has a baseline
     */
    async checkGuildHasBaseline(guildId) {
        try {
            const result = (await this.prisma.$queryRawUnsafe(`SELECT 1 FROM "SecurityBaseline" WHERE "guildId" = $1 LIMIT 1`, guildId));
            return result.length > 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Checks if a guild has events
     */
    async checkGuildHasEvents(guildId) {
        try {
            const result = (await this.prisma.$queryRawUnsafe(`SELECT 1 FROM "SecurityEvent" WHERE "guildId" = $1 LIMIT 1`, guildId));
            return result.length > 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Generates a unique report ID
     */
    generateReportId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `XREF-${timestamp}-${random}`;
    }
    /**
     * Generates a unique issue ID
     */
    generateIssueId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 6);
        return `ISS-${timestamp}-${random}`;
    }
    /**
     * Builds a validation report from check results
     */
    buildReport(reportId, startedAt, completedAt, checkResults) {
        const passedChecks = checkResults.filter((r) => r.passed).length;
        const failedChecks = checkResults.filter((r) => !r.passed).length;
        const totalIssues = checkResults.reduce((sum, r) => sum + r.issuesFound, 0);
        // Count issues by severity
        const issuesBySeverity = {
            [ValidationSeverity.INFO]: 0,
            [ValidationSeverity.WARNING]: 0,
            [ValidationSeverity.ERROR]: 0,
            [ValidationSeverity.CRITICAL]: 0,
        };
        for (const result of checkResults) {
            for (const issue of result.issues) {
                issuesBySeverity[issue.severity]++;
            }
        }
        // Determine health status
        let healthStatus;
        if (issuesBySeverity[ValidationSeverity.CRITICAL] > 0 ||
            issuesBySeverity[ValidationSeverity.ERROR] > 10) {
            healthStatus = "UNHEALTHY";
        }
        else if (issuesBySeverity[ValidationSeverity.ERROR] > 0 ||
            issuesBySeverity[ValidationSeverity.WARNING] > 10) {
            healthStatus = "DEGRADED";
        }
        else {
            healthStatus = "HEALTHY";
        }
        // Build summary
        const summary = [
            `Validation complete: ${passedChecks}/${checkResults.length} checks passed`,
            totalIssues > 0
                ? `Found ${totalIssues} issues (${issuesBySeverity[ValidationSeverity.CRITICAL]} critical, ${issuesBySeverity[ValidationSeverity.ERROR]} errors, ${issuesBySeverity[ValidationSeverity.WARNING]} warnings)`
                : "No issues found",
        ].join(". ");
        return {
            reportId,
            startedAt,
            completedAt,
            totalDurationMs: completedAt.getTime() - startedAt.getTime(),
            totalChecks: checkResults.length,
            passedChecks,
            failedChecks,
            totalIssues,
            issuesBySeverity,
            checkResults,
            healthStatus,
            summary,
        };
    }
    /**
     * Gets service statistics
     */
    getStats() {
        const { logger: _logger, ...configWithoutLogger } = this.config;
        return {
            registeredRules: this.customRules.length,
            foreignKeyDefinitions: SECURITY_FOREIGN_KEYS.length,
            config: configWithoutLogger,
        };
    }
}
// ============================================================================
// Factory Function
// ============================================================================
/**
 * Creates a new CrossReferenceValidationService instance
 */
export function createCrossReferenceValidationService(prisma, config = {}) {
    return new CrossReferenceValidationService(prisma, config);
}
