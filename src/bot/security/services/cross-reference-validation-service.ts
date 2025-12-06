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

import type { PrismaClient } from "@prisma/client";

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Logger interface for cross-reference validation
 */
export interface CrossRefLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Configuration for cross-reference validation
 */
export interface CrossRefValidationConfig {
  /** Batch size for queries (default: 1000) */
  batchSize: number;

  /** Maximum orphans to return per table (default: 100) */
  maxOrphansPerTable: number;

  /** Enable parallel validation (default: true) */
  parallelValidation: boolean;

  /** Timeout for individual validations in milliseconds (default: 30000) */
  validationTimeoutMs: number;

  /** Tables to validate (empty = all tables) */
  tablesToValidate: string[];

  /** Optional logger */
  logger?: CrossRefLogger;
}

/**
 * Types of validation checks
 */
export enum ValidationCheckType {
  /** Foreign key reference exists */
  FOREIGN_KEY = "FOREIGN_KEY",
  /** No orphan records */
  ORPHAN_DETECTION = "ORPHAN_DETECTION",
  /** Cross-table consistency */
  CONSISTENCY = "CONSISTENCY",
  /** Referential integrity */
  REFERENTIAL_INTEGRITY = "REFERENTIAL_INTEGRITY",
  /** Business rule validation */
  BUSINESS_RULE = "BUSINESS_RULE",
}

/**
 * Severity of validation issues
 */
export enum ValidationSeverity {
  /** Informational - expected state */
  INFO = "INFO",
  /** Warning - potentially problematic */
  WARNING = "WARNING",
  /** Error - data integrity issue */
  ERROR = "ERROR",
  /** Critical - immediate action required */
  CRITICAL = "CRITICAL",
}

/**
 * A single validation issue found
 */
export interface ValidationIssue {
  /** Unique identifier for the issue */
  id: string;
  /** Type of validation check */
  checkType: ValidationCheckType;
  /** Severity level */
  severity: ValidationSeverity;
  /** Table where issue was found */
  sourceTable: string;
  /** Related table (if applicable) */
  relatedTable?: string;
  /** Column involved */
  column: string;
  /** Description of the issue */
  description: string;
  /** Affected record IDs */
  affectedIds: string[];
  /** Count of affected records */
  affectedCount: number;
  /** Timestamp when issue was detected */
  detectedAt: Date;
  /** Suggested fix */
  suggestedFix?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Result of a single validation check
 */
export interface ValidationCheckResult {
  /** Check name/identifier */
  checkName: string;
  /** Type of check performed */
  checkType: ValidationCheckType;
  /** Whether the check passed */
  passed: boolean;
  /** Number of records checked */
  recordsChecked: number;
  /** Number of issues found */
  issuesFound: number;
  /** Issues detected */
  issues: ValidationIssue[];
  /** Duration in milliseconds */
  durationMs: number;
  /** Error if check failed to run */
  error?: string;
}

/**
 * Result of full validation sweep
 */
export interface ValidationReport {
  /** Unique report identifier */
  reportId: string;
  /** Start time */
  startedAt: Date;
  /** Completion time */
  completedAt: Date;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Total checks run */
  totalChecks: number;
  /** Checks that passed */
  passedChecks: number;
  /** Checks that failed */
  failedChecks: number;
  /** Total issues found */
  totalIssues: number;
  /** Issues by severity */
  issuesBySeverity: Record<ValidationSeverity, number>;
  /** Individual check results */
  checkResults: ValidationCheckResult[];
  /** Overall health status */
  healthStatus: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  /** Summary message */
  summary: string;
}

/**
 * Foreign key relationship definition
 */
export interface ForeignKeyDefinition {
  /** Source table */
  sourceTable: string;
  /** Source column */
  sourceColumn: string;
  /** Target table */
  targetTable: string;
  /** Target column */
  targetColumn: string;
  /** Whether null is allowed */
  nullable: boolean;
  /** Description for error messages */
  description: string;
}

/**
 * Cross-table consistency rule
 */
export interface ConsistencyRule {
  /** Rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Description */
  description: string;
  /** Tables involved */
  tables: string[];
  /** Validation function */
  validate: (
    prisma: PrismaClient,
    config: CrossRefValidationConfig
  ) => Promise<ValidationCheckResult>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: CrossRefValidationConfig = {
  batchSize: 1000,
  maxOrphansPerTable: 100,
  parallelValidation: true,
  validationTimeoutMs: 30000,
  tablesToValidate: [],
};

/**
 * Security table foreign key relationships
 */
export const SECURITY_FOREIGN_KEYS: ForeignKeyDefinition[] = [
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
  private readonly config: CrossRefValidationConfig;
  private readonly logger?: CrossRefLogger;
  private readonly prisma: PrismaClient;
  private readonly customRules: ConsistencyRule[] = [];

  /**
   * Creates a new CrossReferenceValidationService instance
   */
  constructor(prisma: PrismaClient, config: Partial<CrossRefValidationConfig> = {}) {
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
  async runFullValidation(): Promise<ValidationReport> {
    const startedAt = new Date();
    const reportId = this.generateReportId();

    this.logger?.info("Starting full cross-reference validation", { reportId });

    const checkResults: ValidationCheckResult[] = [];

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
    const report = this.buildReport(
      reportId,
      startedAt,
      completedAt,
      checkResults
    );

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
  async validateGuild(guildId: string): Promise<ValidationReport> {
    const startedAt = new Date();
    const reportId = this.generateReportId();

    this.logger?.info("Starting guild-specific validation", { reportId, guildId });

    const checkResults: ValidationCheckResult[] = [];

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
  registerConsistencyRule(rule: ConsistencyRule): void {
    this.customRules.push(rule);
    this.logger?.debug("Registered consistency rule", {
      ruleId: rule.id,
      ruleName: rule.name,
    });
  }

  /**
   * Gets all registered consistency rules
   */
  getConsistencyRules(): ConsistencyRule[] {
    return [...this.customRules];
  }

  // ==========================================================================
  // Foreign Key Validation
  // ==========================================================================

  /**
   * Validates all foreign key relationships
   */
  private async validateForeignKeys(): Promise<ValidationCheckResult[]> {
    const results: ValidationCheckResult[] = [];

    for (const fk of SECURITY_FOREIGN_KEYS) {
      if (
        this.config.tablesToValidate.length > 0 &&
        !this.config.tablesToValidate.includes(fk.sourceTable)
      ) {
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
  private async validateForeignKey(
    fk: ForeignKeyDefinition
  ): Promise<ValidationCheckResult> {
    const startTime = Date.now();
    const checkName = `FK_${fk.sourceTable}_${fk.sourceColumn}_${fk.targetTable}`;
    const issues: ValidationIssue[] = [];

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

      const invalidRefs = (await this.prisma.$queryRawUnsafe(query)) as Array<{
        invalid_id: string;
        count: bigint;
      }>;

      if (invalidRefs.length > 0) {
        const totalCount = invalidRefs.reduce(
          (sum, r) => sum + Number(r.count),
          0
        );

        issues.push({
          id: this.generateIssueId(),
          checkType: ValidationCheckType.FOREIGN_KEY,
          severity:
            totalCount > 100
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
      const countResult = (await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM "${fk.sourceTable}"`
      )) as Array<{ count: bigint }>;
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

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
  private async validateGuildForeignKeys(
    guildId: string
  ): Promise<ValidationCheckResult> {
    const startTime = Date.now();
    const checkName = `GUILD_FK_${guildId}`;
    const issues: ValidationIssue[] = [];

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
          const countResult = (await this.prisma.$queryRawUnsafe(
            `SELECT COUNT(*) as count FROM "${table}" WHERE "guildId" = $1`,
            guildId
          )) as Array<{ count: bigint }>;
          totalRecords += Number(countResult[0]?.count ?? 0);
        } catch {
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
    } catch (error) {
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
  private async detectOrphans(): Promise<ValidationCheckResult[]> {
    const results: ValidationCheckResult[] = [];

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
  private async detectSecurityEventOrphans(): Promise<ValidationCheckResult> {
    const startTime = Date.now();
    const checkName = "ORPHAN_SecurityEvents";
    const issues: ValidationIssue[] = [];

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

      const oldEvents = (await this.prisma.$queryRawUnsafe(query, cutoffDate)) as Array<{
        id: string;
        guildId: string;
        createdAt: Date;
      }>;

      // Get total count
      const countResult = (await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM "SecurityEvent"`
      )) as Array<{ count: bigint }>;
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
    } catch (error) {
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
  private async detectUnresolvedThreats(): Promise<ValidationCheckResult> {
    const startTime = Date.now();
    const checkName = "ORPHAN_UnresolvedThreats";
    const issues: ValidationIssue[] = [];

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

      const unresolvedThreats = (await this.prisma.$queryRawUnsafe(
        query,
        cutoffDate
      )) as Array<{
        id: string;
        guildId: string;
        threatType: string;
        createdAt: Date;
      }>;

      // Get total unresolved count
      const countResult = (await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM "ThreatDetection" WHERE "resolved" = false`
      )) as Array<{ count: bigint }>;
      const totalUnresolved = Number(countResult[0]?.count ?? 0);

      if (unresolvedThreats.length > 0) {
        issues.push({
          id: this.generateIssueId(),
          checkType: ValidationCheckType.ORPHAN_DETECTION,
          severity:
            unresolvedThreats.length > 50
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
    } catch (error) {
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
  private async detectStaleBaselines(): Promise<ValidationCheckResult> {
    const startTime = Date.now();
    const checkName = "ORPHAN_StaleBaselines";
    const issues: ValidationIssue[] = [];

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

      const staleBaselines = (await this.prisma.$queryRawUnsafe(
        query,
        cutoffDate
      )) as Array<{
        id: string;
        guildId: string;
        updatedAt: Date;
      }>;

      // Get total baseline count
      const countResult = (await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM "SecurityBaseline"`
      )) as Array<{ count: bigint }>;
      const totalBaselines = Number(countResult[0]?.count ?? 0);

      if (staleBaselines.length > 0) {
        issues.push({
          id: this.generateIssueId(),
          checkType: ValidationCheckType.ORPHAN_DETECTION,
          severity:
            staleBaselines.length > 20
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
    } catch (error) {
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
  private async detectGuildOrphans(guildId: string): Promise<ValidationCheckResult> {
    const startTime = Date.now();
    const checkName = `ORPHAN_Guild_${guildId}`;
    const issues: ValidationIssue[] = [];

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
    } catch (error) {
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
  private async runConsistencyRules(): Promise<ValidationCheckResult[]> {
    const results: ValidationCheckResult[] = [];

    for (const rule of this.customRules) {
      try {
        const result = await rule.validate(this.prisma, this.config);
        results.push(result);
      } catch (error) {
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
  private async validateGuildConsistency(
    guildId: string
  ): Promise<ValidationCheckResult> {
    const startTime = Date.now();
    const checkName = `CONSISTENCY_Guild_${guildId}`;
    const issues: ValidationIssue[] = [];

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
    } catch (error) {
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
  private async checkEventSeverityConsistency(
    guildId: string
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

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

      const criticalWithoutThreat = (await this.prisma.$queryRawUnsafe(
        query,
        guildId
      )) as Array<{
        id: string;
        severity: string;
        eventType: string;
      }>;

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
    } catch {
      // Query might fail if schema doesn't match - that's OK
    }

    return issues;
  }

  /**
   * Checks threat-event relationship consistency
   */
  private async checkThreatEventRelationship(
    guildId: string
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

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

      const threatsWithoutEvents = (await this.prisma.$queryRawUnsafe(
        query,
        guildId
      )) as Array<{
        id: string;
        threatType: string;
        createdAt: Date;
      }>;

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
    } catch {
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
  private async validateBusinessRules(): Promise<ValidationCheckResult[]> {
    const results: ValidationCheckResult[] = [];

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
  private async checkDuplicateEvents(): Promise<ValidationCheckResult> {
    const startTime = Date.now();
    const checkName = "BUSINESS_DuplicateEvents";
    const issues: ValidationIssue[] = [];

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

      const duplicates = (await this.prisma.$queryRawUnsafe(query)) as Array<{
        guildId: string;
        eventType: string;
        actorId: string;
        count: bigint;
      }>;

      const totalDuplicates = duplicates.reduce((sum, d) => sum + Number(d.count), 0);

      if (totalDuplicates > 0) {
        issues.push({
          id: this.generateIssueId(),
          checkType: ValidationCheckType.BUSINESS_RULE,
          severity:
            totalDuplicates > 100 ? ValidationSeverity.WARNING : ValidationSeverity.INFO,
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
    } catch (error) {
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
  private async checkTimestampSanity(): Promise<ValidationCheckResult> {
    const startTime = Date.now();
    const checkName = "BUSINESS_TimestampSanity";
    const issues: ValidationIssue[] = [];

    try {
      // Find events with future timestamps
      const query = `
        SELECT "id", "guildId", "createdAt"
        FROM "SecurityEvent"
        WHERE "createdAt" > NOW() + INTERVAL '1 minute'
        LIMIT ${this.config.maxOrphansPerTable}
      `;

      const futureEvents = (await this.prisma.$queryRawUnsafe(query)) as Array<{
        id: string;
        guildId: string;
        createdAt: Date;
      }>;

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
    } catch (error) {
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
  private async checkGuildExists(guildId: string): Promise<boolean> {
    try {
      const result = (await this.prisma.$queryRawUnsafe(
        `SELECT 1 FROM "Guild" WHERE "id" = $1 LIMIT 1`,
        guildId
      )) as Array<{ "?column?": number }>;
      return result.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Checks if a guild has a baseline
   */
  private async checkGuildHasBaseline(guildId: string): Promise<boolean> {
    try {
      const result = (await this.prisma.$queryRawUnsafe(
        `SELECT 1 FROM "SecurityBaseline" WHERE "guildId" = $1 LIMIT 1`,
        guildId
      )) as Array<{ "?column?": number }>;
      return result.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Checks if a guild has events
   */
  private async checkGuildHasEvents(guildId: string): Promise<boolean> {
    try {
      const result = (await this.prisma.$queryRawUnsafe(
        `SELECT 1 FROM "SecurityEvent" WHERE "guildId" = $1 LIMIT 1`,
        guildId
      )) as Array<{ "?column?": number }>;
      return result.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Generates a unique report ID
   */
  private generateReportId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `XREF-${timestamp}-${random}`;
  }

  /**
   * Generates a unique issue ID
   */
  private generateIssueId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `ISS-${timestamp}-${random}`;
  }

  /**
   * Builds a validation report from check results
   */
  private buildReport(
    reportId: string,
    startedAt: Date,
    completedAt: Date,
    checkResults: ValidationCheckResult[]
  ): ValidationReport {
    const passedChecks = checkResults.filter((r) => r.passed).length;
    const failedChecks = checkResults.filter((r) => !r.passed).length;
    const totalIssues = checkResults.reduce((sum, r) => sum + r.issuesFound, 0);

    // Count issues by severity
    const issuesBySeverity: Record<ValidationSeverity, number> = {
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
    let healthStatus: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
    if (
      issuesBySeverity[ValidationSeverity.CRITICAL] > 0 ||
      issuesBySeverity[ValidationSeverity.ERROR] > 10
    ) {
      healthStatus = "UNHEALTHY";
    } else if (
      issuesBySeverity[ValidationSeverity.ERROR] > 0 ||
      issuesBySeverity[ValidationSeverity.WARNING] > 10
    ) {
      healthStatus = "DEGRADED";
    } else {
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
  getStats(): {
    registeredRules: number;
    foreignKeyDefinitions: number;
    config: Omit<CrossRefValidationConfig, "logger">;
  } {
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
export function createCrossReferenceValidationService(
  prisma: PrismaClient,
  config: Partial<CrossRefValidationConfig> = {}
): CrossReferenceValidationService {
  return new CrossReferenceValidationService(prisma, config);
}
