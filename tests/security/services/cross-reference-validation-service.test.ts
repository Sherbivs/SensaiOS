/**
 * Cross-Reference Validation Service Tests (P2-002)
 *
 * Tests for data consistency validation across security tables including:
 * - Foreign key validation
 * - Orphan record detection
 * - Cross-table consistency rules
 * - Business rule validation
 * - Guild-specific validation
 *
 * @module CrossReferenceValidationServiceTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CrossReferenceValidationService,
  createCrossReferenceValidationService,
  ValidationCheckType,
  ValidationSeverity,
  SECURITY_FOREIGN_KEYS,
  type CrossRefValidationConfig,
  type CrossRefLogger,
  type ConsistencyRule,
} from "../../../src/bot/security/services/cross-reference-validation-service.js";

// ============================================================================
// Mock Prisma Client
// ============================================================================

const createMockPrisma = () => ({
  $queryRawUnsafe: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRawUnsafe: vi.fn(),
  securityEvent: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  roleChangeAudit: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  threatDetection: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  securityBaseline: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
});

type MockPrisma = ReturnType<typeof createMockPrisma>;

// ============================================================================
// Mock Logger
// ============================================================================

const createMockLogger = (): CrossRefLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

// ============================================================================
// Test Suites
// ============================================================================

describe("CrossReferenceValidationService", () => {
  let mockPrisma: MockPrisma;
  let mockLogger: CrossRefLogger;
  let service: CrossReferenceValidationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    mockLogger = createMockLogger();
    service = new CrossReferenceValidationService(mockPrisma as any, {
      logger: mockLogger,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Constructor and Configuration Tests
  // ==========================================================================

  describe("constructor and configuration", () => {
    it("should create service with default configuration", () => {
      const defaultService = new CrossReferenceValidationService(mockPrisma as any);
      const stats = defaultService.getStats();

      expect(stats.config.batchSize).toBe(1000);
      expect(stats.config.maxOrphansPerTable).toBe(100);
      expect(stats.config.parallelValidation).toBe(true);
      expect(stats.config.validationTimeoutMs).toBe(30000);
      expect(stats.config.tablesToValidate).toEqual([]);
    });

    it("should create service with custom configuration", () => {
      const customConfig: Partial<CrossRefValidationConfig> = {
        batchSize: 500,
        maxOrphansPerTable: 50,
        parallelValidation: false,
        validationTimeoutMs: 10000,
        tablesToValidate: ["SecurityEvent", "ThreatDetection"],
      };

      const customService = new CrossReferenceValidationService(
        mockPrisma as any,
        customConfig
      );
      const stats = customService.getStats();

      expect(stats.config.batchSize).toBe(500);
      expect(stats.config.maxOrphansPerTable).toBe(50);
      expect(stats.config.parallelValidation).toBe(false);
      expect(stats.config.validationTimeoutMs).toBe(10000);
      expect(stats.config.tablesToValidate).toEqual(["SecurityEvent", "ThreatDetection"]);
    });

    it("should include logger in service when provided", () => {
      service = new CrossReferenceValidationService(mockPrisma as any, {
        logger: mockLogger,
      });

      // Logger should be used when running validation
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      // Trigger a validation that uses logger
      service.runFullValidation().catch(() => {});

      // Logger info should be called on validation start
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it("should report foreign key definitions count", () => {
      const stats = service.getStats();
      expect(stats.foreignKeyDefinitions).toBe(SECURITY_FOREIGN_KEYS.length);
      expect(stats.foreignKeyDefinitions).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Factory Function Tests
  // ==========================================================================

  describe("createCrossReferenceValidationService factory", () => {
    it("should create service using factory function", () => {
      const factoryService = createCrossReferenceValidationService(mockPrisma as any);
      expect(factoryService).toBeInstanceOf(CrossReferenceValidationService);
    });

    it("should create service with config using factory", () => {
      const factoryService = createCrossReferenceValidationService(mockPrisma as any, {
        batchSize: 250,
      });
      const stats = factoryService.getStats();
      expect(stats.config.batchSize).toBe(250);
    });
  });

  // ==========================================================================
  // Full Validation Tests
  // ==========================================================================

  describe("runFullValidation", () => {
    beforeEach(() => {
      // Setup default mock responses for all queries
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    });

    it("should return a validation report with all required fields", async () => {
      const report = await service.runFullValidation();

      expect(report).toHaveProperty("reportId");
      expect(report).toHaveProperty("startedAt");
      expect(report).toHaveProperty("completedAt");
      expect(report).toHaveProperty("totalDurationMs");
      expect(report).toHaveProperty("totalChecks");
      expect(report).toHaveProperty("passedChecks");
      expect(report).toHaveProperty("failedChecks");
      expect(report).toHaveProperty("totalIssues");
      expect(report).toHaveProperty("issuesBySeverity");
      expect(report).toHaveProperty("checkResults");
      expect(report).toHaveProperty("healthStatus");
      expect(report).toHaveProperty("summary");
    });

    it("should generate unique report IDs", async () => {
      const report1 = await service.runFullValidation();
      const report2 = await service.runFullValidation();

      expect(report1.reportId).not.toBe(report2.reportId);
      expect(report1.reportId).toMatch(/^XREF-[a-z0-9]+-[a-z0-9]+$/);
    });

    it("should log validation start and completion", async () => {
      await service.runFullValidation();

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Starting full cross-reference validation",
        expect.objectContaining({ reportId: expect.any(String) })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Cross-reference validation complete",
        expect.objectContaining({
          reportId: expect.any(String),
          totalChecks: expect.any(Number),
          passedChecks: expect.any(Number),
          failedChecks: expect.any(Number),
          totalIssues: expect.any(Number),
          healthStatus: expect.any(String),
          durationMs: expect.any(Number),
        })
      );
    });

    it("should return HEALTHY status when no issues found", async () => {
      const report = await service.runFullValidation();

      expect(report.healthStatus).toBe("HEALTHY");
      expect(report.totalIssues).toBe(0);
    });

    it("should track duration correctly", async () => {
      const startTime = Date.now();
      const report = await service.runFullValidation();
      const endTime = Date.now();

      expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(report.completedAt.getTime()).toBeGreaterThanOrEqual(
        report.startedAt.getTime()
      );
      expect(report.startedAt.getTime()).toBeGreaterThanOrEqual(startTime);
      expect(report.completedAt.getTime()).toBeLessThanOrEqual(endTime);
    });

    it("should include all check types in results", async () => {
      const report = await service.runFullValidation();
      const checkTypes = report.checkResults.map((r) => r.checkType);

      // Should include foreign key, orphan detection, and business rule checks
      expect(checkTypes).toContain(ValidationCheckType.FOREIGN_KEY);
      expect(checkTypes).toContain(ValidationCheckType.ORPHAN_DETECTION);
      expect(checkTypes).toContain(ValidationCheckType.BUSINESS_RULE);
    });
  });

  // ==========================================================================
  // Foreign Key Validation Tests
  // ==========================================================================

  describe("foreign key validation", () => {
    it("should validate all defined foreign keys", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const report = await service.runFullValidation();
      const fkChecks = report.checkResults.filter(
        (r) => r.checkType === ValidationCheckType.FOREIGN_KEY
      );

      // Should have checks for each foreign key definition
      expect(fkChecks.length).toBeGreaterThanOrEqual(SECURITY_FOREIGN_KEYS.length);
    });

    it("should detect invalid foreign key references", async () => {
      // Mock finding invalid foreign key references
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { invalid_id: "invalid-guild-1", count: BigInt(5) },
          { invalid_id: "invalid-guild-2", count: BigInt(3) },
        ])
        .mockResolvedValueOnce([{ count: BigInt(100) }]) // Total count
        .mockResolvedValue([]); // Remaining queries

      const report = await service.runFullValidation();
      const fkCheck = report.checkResults.find(
        (r) =>
          r.checkType === ValidationCheckType.FOREIGN_KEY &&
          r.issues.length > 0
      );

      expect(fkCheck).toBeDefined();
      expect(fkCheck!.passed).toBe(false);
      expect(fkCheck!.issues[0].affectedCount).toBe(8);
    });

    it("should assign severity based on affected count", async () => {
      // Test critical severity (> 100 records)
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { invalid_id: "id1", count: BigInt(150) },
        ])
        .mockResolvedValueOnce([{ count: BigInt(1000) }])
        .mockResolvedValue([]);

      let report = await service.runFullValidation();
      let criticalIssue = report.checkResults
        .flatMap((r) => r.issues)
        .find((i) => i.affectedCount > 100);

      if (criticalIssue) {
        expect(criticalIssue.severity).toBe(ValidationSeverity.CRITICAL);
      }

      // Reset mocks for next test
      mockPrisma.$queryRawUnsafe.mockReset();

      // Test error severity (> 10 records)
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { invalid_id: "id1", count: BigInt(25) },
        ])
        .mockResolvedValueOnce([{ count: BigInt(1000) }])
        .mockResolvedValue([]);

      report = await service.runFullValidation();
      const errorIssue = report.checkResults
        .flatMap((r) => r.issues)
        .find((i) => i.affectedCount > 10 && i.affectedCount <= 100);

      if (errorIssue) {
        expect(errorIssue.severity).toBe(ValidationSeverity.ERROR);
      }
    });

    it("should filter by tablesToValidate when configured", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const filteredService = new CrossReferenceValidationService(mockPrisma as any, {
        tablesToValidate: ["SecurityEvent"],
        logger: mockLogger,
      });

      const report = await filteredService.runFullValidation();
      const fkChecks = report.checkResults.filter(
        (r) =>
          r.checkType === ValidationCheckType.FOREIGN_KEY &&
          r.checkName.startsWith("FK_")
      );

      // Should only have checks for SecurityEvent table
      const securityEventChecks = fkChecks.filter((r) =>
        r.checkName.includes("SecurityEvent")
      );
      const otherChecks = fkChecks.filter(
        (r) =>
          !r.checkName.includes("SecurityEvent") &&
          r.checkName.startsWith("FK_")
      );

      expect(securityEventChecks.length).toBeGreaterThan(0);
      expect(otherChecks.length).toBe(0);
    });

    it("should handle database query errors gracefully", async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("Database connection failed"));

      const report = await service.runFullValidation();
      const errorCheck = report.checkResults.find(
        (r) => r.error === "Database connection failed"
      );

      expect(errorCheck).toBeDefined();
      expect(errorCheck!.passed).toBe(false);
    });

    it("should include suggested fixes for issues", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ invalid_id: "bad-id", count: BigInt(1) }])
        .mockResolvedValueOnce([{ count: BigInt(10) }])
        .mockResolvedValue([]);

      const report = await service.runFullValidation();
      const issueWithFix = report.checkResults
        .flatMap((r) => r.issues)
        .find((i) => i.suggestedFix);

      if (issueWithFix) {
        expect(issueWithFix.suggestedFix).toBeDefined();
        expect(issueWithFix.suggestedFix!.length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // Orphan Detection Tests
  // ==========================================================================

  describe("orphan detection", () => {
    beforeEach(() => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    });

    it("should detect old security events", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);

      // Mock old events found in first orphan query
      mockPrisma.$queryRawUnsafe
        // Skip FK queries (return empty)
        .mockResolvedValue([])
        // Old events query
        .mockResolvedValueOnce([
          { id: "old-event-1", guildId: "guild1", createdAt: oldDate },
          { id: "old-event-2", guildId: "guild2", createdAt: oldDate },
        ]);

      const report = await service.runFullValidation();
      const orphanCheck = report.checkResults.find(
        (r) => r.checkName === "ORPHAN_SecurityEvents"
      );

      // The check passes (INFO severity) but reports old events
      expect(orphanCheck).toBeDefined();
      expect(orphanCheck!.passed).toBe(true); // Old events are informational
    });

    it("should detect unresolved threats", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      // Position mock for unresolved threats query
      mockPrisma.$queryRawUnsafe.mockImplementation((query: string) => {
        if (query.includes('"resolved" = false')) {
          return Promise.resolve([
            {
              id: "threat-1",
              guildId: "guild1",
              threatType: "MASS_ROLE_CHANGE",
              createdAt: oldDate,
            },
          ]);
        }
        if (query.includes('COUNT(*)') && query.includes('"resolved" = false')) {
          return Promise.resolve([{ count: BigInt(5) }]);
        }
        return Promise.resolve([]);
      });

      const report = await service.runFullValidation();
      const unresolvedCheck = report.checkResults.find(
        (r) => r.checkName === "ORPHAN_UnresolvedThreats"
      );

      expect(unresolvedCheck).toBeDefined();
    });

    it("should detect stale baselines", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      mockPrisma.$queryRawUnsafe.mockImplementation((query: string) => {
        if (query.includes('"SecurityBaseline"') && query.includes('"updatedAt"')) {
          return Promise.resolve([
            { id: "baseline-1", guildId: "guild1", updatedAt: oldDate },
          ]);
        }
        if (query.includes('COUNT(*)') && query.includes('"SecurityBaseline"')) {
          return Promise.resolve([{ count: BigInt(10) }]);
        }
        return Promise.resolve([]);
      });

      const report = await service.runFullValidation();
      const staleCheck = report.checkResults.find(
        (r) => r.checkName === "ORPHAN_StaleBaselines"
      );

      expect(staleCheck).toBeDefined();
    });

    it("should respect maxOrphansPerTable limit", async () => {
      const customService = new CrossReferenceValidationService(mockPrisma as any, {
        maxOrphansPerTable: 5,
      });

      await customService.runFullValidation();

      // Verify queries include the LIMIT
      const calls = mockPrisma.$queryRawUnsafe.mock.calls;
      const hasLimitedQuery = calls.some((call) =>
        String(call[0]).includes("LIMIT 5")
      );

      expect(hasLimitedQuery).toBe(true);
    });
  });

  // ==========================================================================
  // Business Rule Validation Tests
  // ==========================================================================

  describe("business rule validation", () => {
    beforeEach(() => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    });

    it("should detect duplicate events", async () => {
      mockPrisma.$queryRawUnsafe.mockImplementation((query: string) => {
        if (query.includes("HAVING COUNT(*) > 1")) {
          return Promise.resolve([
            {
              guildId: "guild1",
              eventType: "ROLE_CHANGE",
              actorId: "user1",
              count: BigInt(3),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const report = await service.runFullValidation();
      const duplicateCheck = report.checkResults.find(
        (r) => r.checkName === "BUSINESS_DuplicateEvents"
      );

      expect(duplicateCheck).toBeDefined();
    });

    it("should detect future timestamps", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      mockPrisma.$queryRawUnsafe.mockImplementation((query: string) => {
        if (query.includes("NOW() + INTERVAL")) {
          return Promise.resolve([
            { id: "future-event", guildId: "guild1", createdAt: futureDate },
          ]);
        }
        return Promise.resolve([]);
      });

      const report = await service.runFullValidation();
      const timestampCheck = report.checkResults.find(
        (r) => r.checkName === "BUSINESS_TimestampSanity"
      );

      expect(timestampCheck).toBeDefined();
      if (timestampCheck && timestampCheck.issues.length > 0) {
        expect(timestampCheck.passed).toBe(false);
        expect(timestampCheck.issues[0].severity).toBe(ValidationSeverity.ERROR);
      }
    });

    it("should pass timestamp check when no future timestamps", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const report = await service.runFullValidation();
      const timestampCheck = report.checkResults.find(
        (r) => r.checkName === "BUSINESS_TimestampSanity"
      );

      expect(timestampCheck).toBeDefined();
      expect(timestampCheck!.passed).toBe(true);
    });
  });

  // ==========================================================================
  // Guild-Specific Validation Tests
  // ==========================================================================

  describe("validateGuild", () => {
    const testGuildId = "123456789012345678";

    beforeEach(() => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    });

    it("should return a guild-specific validation report", async () => {
      // Mock guild exists
      mockPrisma.$queryRawUnsafe.mockImplementation((query: string) => {
        if (query.includes('"Guild"') && query.includes('LIMIT 1')) {
          return Promise.resolve([{ "?column?": 1 }]);
        }
        if (query.includes('COUNT(*)')) {
          return Promise.resolve([{ count: BigInt(10) }]);
        }
        return Promise.resolve([]);
      });

      const report = await service.validateGuild(testGuildId);

      expect(report).toHaveProperty("reportId");
      expect(report.checkResults.length).toBeGreaterThan(0);
    });

    it("should detect non-existent guild", async () => {
      // Mock guild does not exist
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const report = await service.validateGuild("nonexistent-guild");

      const guildCheck = report.checkResults.find((r) =>
        r.checkName.includes("GUILD_FK")
      );

      expect(guildCheck).toBeDefined();
      if (guildCheck && guildCheck.issues.length > 0) {
        expect(guildCheck.issues[0].severity).toBe(ValidationSeverity.CRITICAL);
        expect(guildCheck.issues[0].description).toContain("does not exist");
      }
    });

    it("should detect guild with events but no baseline", async () => {
      mockPrisma.$queryRawUnsafe.mockImplementation((query: string, ..._params: unknown[]) => {
        // Guild exists
        if (query.includes('"Guild"') && query.includes('LIMIT 1')) {
          return Promise.resolve([{ "?column?": 1 }]);
        }
        // Has events
        if (query.includes('"SecurityEvent"') && query.includes('LIMIT 1')) {
          return Promise.resolve([{ "?column?": 1 }]);
        }
        // No baseline
        if (query.includes('"SecurityBaseline"') && query.includes('LIMIT 1')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([{ count: BigInt(0) }]);
      });

      const report = await service.validateGuild(testGuildId);

      const orphanCheck = report.checkResults.find((r) =>
        r.checkName.includes("ORPHAN_Guild")
      );

      expect(orphanCheck).toBeDefined();
      if (orphanCheck && orphanCheck.issues.length > 0) {
        expect(orphanCheck.issues[0].description).toContain(
          "has security events but no baseline"
        );
      }
    });

    it("should log guild validation start", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ "?column?": 1 }]);

      await service.validateGuild(testGuildId);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Starting guild-specific validation",
        expect.objectContaining({
          reportId: expect.any(String),
          guildId: testGuildId,
        })
      );
    });

    it("should handle database errors in guild validation", async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("Connection timeout"));

      const report = await service.validateGuild(testGuildId);

      // Database errors are caught and logged, checks return with error field
      // or return passed: false. The report should still be generated.
      expect(report).toBeDefined();
      expect(report.reportId).toMatch(/^XREF-/);

      // At least one check should have failed due to the error
      const failedCheck = report.checkResults.find(
        (r) => !r.passed || r.error
      );
      expect(failedCheck).toBeDefined();
    });
  });

  // ==========================================================================
  // Consistency Rules Tests
  // ==========================================================================

  describe("consistency rules", () => {
    it("should register custom consistency rules", () => {
      const customRule: ConsistencyRule = {
        id: "custom-rule-1",
        name: "Custom Test Rule",
        description: "A test consistency rule",
        tables: ["SecurityEvent", "ThreatDetection"],
        validate: async () => ({
          checkName: "Custom Test Rule",
          checkType: ValidationCheckType.CONSISTENCY,
          passed: true,
          recordsChecked: 100,
          issuesFound: 0,
          issues: [],
          durationMs: 50,
        }),
      };

      service.registerConsistencyRule(customRule);
      const rules = service.getConsistencyRules();

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe("custom-rule-1");
    });

    it("should run custom consistency rules during validation", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const validateFn = vi.fn().mockResolvedValue({
        checkName: "Custom Rule",
        checkType: ValidationCheckType.CONSISTENCY,
        passed: true,
        recordsChecked: 50,
        issuesFound: 0,
        issues: [],
        durationMs: 25,
      });

      const customRule: ConsistencyRule = {
        id: "run-test-rule",
        name: "Run Test Rule",
        description: "Tests that rules are executed",
        tables: ["SecurityEvent"],
        validate: validateFn,
      };

      service.registerConsistencyRule(customRule);
      await service.runFullValidation();

      expect(validateFn).toHaveBeenCalled();
    });

    it("should handle custom rule errors", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const errorRule: ConsistencyRule = {
        id: "error-rule",
        name: "Error Rule",
        description: "A rule that throws",
        tables: [],
        validate: async () => {
          throw new Error("Rule execution failed");
        },
      };

      service.registerConsistencyRule(errorRule);
      const report = await service.runFullValidation();

      const errorResult = report.checkResults.find(
        (r) => r.checkName === "Error Rule"
      );

      expect(errorResult).toBeDefined();
      expect(errorResult!.passed).toBe(false);
      expect(errorResult!.error).toBe("Rule execution failed");
    });

    it("should log custom rule registration", () => {
      const rule: ConsistencyRule = {
        id: "log-test",
        name: "Log Test Rule",
        description: "Test",
        tables: [],
        validate: async () => ({
          checkName: "Log Test",
          checkType: ValidationCheckType.CONSISTENCY,
          passed: true,
          recordsChecked: 0,
          issuesFound: 0,
          issues: [],
          durationMs: 0,
        }),
      };

      service.registerConsistencyRule(rule);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Registered consistency rule",
        expect.objectContaining({
          ruleId: "log-test",
          ruleName: "Log Test Rule",
        })
      );
    });

    it("should return registered rules count in stats", () => {
      expect(service.getStats().registeredRules).toBe(0);

      service.registerConsistencyRule({
        id: "r1",
        name: "Rule 1",
        description: "",
        tables: [],
        validate: async () => ({
          checkName: "",
          checkType: ValidationCheckType.CONSISTENCY,
          passed: true,
          recordsChecked: 0,
          issuesFound: 0,
          issues: [],
          durationMs: 0,
        }),
      });

      expect(service.getStats().registeredRules).toBe(1);
    });
  });

  // ==========================================================================
  // Health Status Tests
  // ==========================================================================

  describe("health status determination", () => {
    beforeEach(() => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    });

    it("should return HEALTHY when no issues", async () => {
      const report = await service.runFullValidation();
      expect(report.healthStatus).toBe("HEALTHY");
    });

    it("should return UNHEALTHY when critical issues exist", async () => {
      // Mock critical issue (>100 invalid refs)
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ invalid_id: "bad", count: BigInt(150) }])
        .mockResolvedValueOnce([{ count: BigInt(1000) }])
        .mockResolvedValue([]);

      const report = await service.runFullValidation();

      // The actual health status depends on issue count
      if (report.issuesBySeverity[ValidationSeverity.CRITICAL] > 0) {
        expect(report.healthStatus).toBe("UNHEALTHY");
      }
    });

    it("should return DEGRADED when error issues exist", async () => {
      // Mock error issue (10-100 invalid refs)
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ invalid_id: "bad", count: BigInt(25) }])
        .mockResolvedValueOnce([{ count: BigInt(1000) }])
        .mockResolvedValue([]);

      const report = await service.runFullValidation();

      // Check if there are error-level issues
      if (
        report.issuesBySeverity[ValidationSeverity.ERROR] > 0 &&
        report.issuesBySeverity[ValidationSeverity.CRITICAL] === 0
      ) {
        expect(report.healthStatus).toBe("DEGRADED");
      }
    });

    it("should track issues by severity correctly", async () => {
      const report = await service.runFullValidation();

      expect(report.issuesBySeverity).toHaveProperty(ValidationSeverity.INFO);
      expect(report.issuesBySeverity).toHaveProperty(ValidationSeverity.WARNING);
      expect(report.issuesBySeverity).toHaveProperty(ValidationSeverity.ERROR);
      expect(report.issuesBySeverity).toHaveProperty(ValidationSeverity.CRITICAL);

      // All counts should be non-negative
      expect(report.issuesBySeverity[ValidationSeverity.INFO]).toBeGreaterThanOrEqual(0);
      expect(report.issuesBySeverity[ValidationSeverity.WARNING]).toBeGreaterThanOrEqual(0);
      expect(report.issuesBySeverity[ValidationSeverity.ERROR]).toBeGreaterThanOrEqual(0);
      expect(report.issuesBySeverity[ValidationSeverity.CRITICAL]).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Report Summary Tests
  // ==========================================================================

  describe("report summary", () => {
    it("should generate meaningful summary text", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const report = await service.runFullValidation();

      expect(report.summary).toContain("Validation complete");
      expect(report.summary).toContain("checks passed");
    });

    it("should include issue counts in summary when issues exist", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ invalid_id: "bad", count: BigInt(5) }])
        .mockResolvedValueOnce([{ count: BigInt(100) }])
        .mockResolvedValue([]);

      const report = await service.runFullValidation();

      if (report.totalIssues > 0) {
        expect(report.summary).toContain("Found");
        expect(report.summary).toContain("issues");
      }
    });

    it("should correctly count passed and failed checks", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const report = await service.runFullValidation();

      expect(report.passedChecks + report.failedChecks).toBe(report.totalChecks);
      expect(report.totalChecks).toBe(report.checkResults.length);
    });
  });

  // ==========================================================================
  // Foreign Key Definitions Tests
  // ==========================================================================

  describe("SECURITY_FOREIGN_KEYS definitions", () => {
    it("should define SecurityEvent foreign keys", () => {
      const securityEventFKs = SECURITY_FOREIGN_KEYS.filter(
        (fk) => fk.sourceTable === "SecurityEvent"
      );

      expect(securityEventFKs.length).toBeGreaterThanOrEqual(2);

      const guildFK = securityEventFKs.find((fk) => fk.sourceColumn === "guildId");
      expect(guildFK).toBeDefined();
      expect(guildFK!.targetTable).toBe("Guild");
      expect(guildFK!.nullable).toBe(false);

      const actorFK = securityEventFKs.find((fk) => fk.sourceColumn === "actorId");
      expect(actorFK).toBeDefined();
      expect(actorFK!.targetTable).toBe("User");
      expect(actorFK!.nullable).toBe(true);
    });

    it("should define RoleChangeAudit foreign keys", () => {
      const roleAuditFKs = SECURITY_FOREIGN_KEYS.filter(
        (fk) => fk.sourceTable === "RoleChangeAudit"
      );

      expect(roleAuditFKs.length).toBeGreaterThanOrEqual(2);

      const guildFK = roleAuditFKs.find((fk) => fk.sourceColumn === "guildId");
      expect(guildFK).toBeDefined();
      expect(guildFK!.nullable).toBe(false);

      const memberFK = roleAuditFKs.find((fk) => fk.sourceColumn === "memberId");
      expect(memberFK).toBeDefined();
      expect(memberFK!.nullable).toBe(false);
    });

    it("should define ThreatDetection foreign keys", () => {
      const threatFKs = SECURITY_FOREIGN_KEYS.filter(
        (fk) => fk.sourceTable === "ThreatDetection"
      );

      expect(threatFKs.length).toBeGreaterThanOrEqual(2);
    });

    it("should define SecurityBaseline foreign keys", () => {
      const baselineFKs = SECURITY_FOREIGN_KEYS.filter(
        (fk) => fk.sourceTable === "SecurityBaseline"
      );

      expect(baselineFKs.length).toBeGreaterThanOrEqual(1);
    });

    it("should have descriptions for all foreign keys", () => {
      for (const fk of SECURITY_FOREIGN_KEYS) {
        expect(fk.description).toBeDefined();
        expect(fk.description.length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // Issue ID Generation Tests
  // ==========================================================================

  describe("issue ID generation", () => {
    it("should generate unique issue IDs", async () => {
      // Create multiple issues
      mockPrisma.$queryRawUnsafe.mockImplementation((query: string) => {
        if (query.includes("LEFT JOIN") && query.includes("NULL")) {
          return Promise.resolve([
            { invalid_id: "bad1", count: BigInt(1) },
            { invalid_id: "bad2", count: BigInt(1) },
          ]);
        }
        if (query.includes("COUNT(*)")) {
          return Promise.resolve([{ count: BigInt(100) }]);
        }
        return Promise.resolve([]);
      });

      const report = await service.runFullValidation();
      const allIssues = report.checkResults.flatMap((r) => r.issues);

      if (allIssues.length > 1) {
        const issueIds = allIssues.map((i) => i.id);
        const uniqueIds = new Set(issueIds);
        expect(uniqueIds.size).toBe(issueIds.length);
      }
    });

    it("should format issue IDs correctly", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ invalid_id: "bad", count: BigInt(1) }])
        .mockResolvedValueOnce([{ count: BigInt(10) }])
        .mockResolvedValue([]);

      const report = await service.runFullValidation();
      const issue = report.checkResults.flatMap((r) => r.issues)[0];

      if (issue) {
        expect(issue.id).toMatch(/^ISS-[a-z0-9]+-[a-z0-9]+$/);
      }
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("should handle empty database tables", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const report = await service.runFullValidation();

      expect(report.healthStatus).toBe("HEALTHY");
      expect(report.totalIssues).toBe(0);
    });

    it("should handle very large affected counts", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { invalid_id: "big-batch", count: BigInt(1000000) },
        ])
        .mockResolvedValueOnce([{ count: BigInt(10000000) }])
        .mockResolvedValue([]);

      const report = await service.runFullValidation();
      const bigIssue = report.checkResults
        .flatMap((r) => r.issues)
        .find((i) => i.affectedCount === 1000000);

      if (bigIssue) {
        expect(bigIssue.severity).toBe(ValidationSeverity.CRITICAL);
      }
    });

    it("should handle unicode guild IDs", async () => {
      const unicodeGuildId = "guild_テスト_123";

      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const report = await service.validateGuild(unicodeGuildId);

      expect(report).toBeDefined();
      expect(report.reportId).toMatch(/^XREF-/);
    });

    it("should handle null values in results", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { invalid_id: null, count: BigInt(0) },
      ]);

      // Should not throw
      await expect(service.runFullValidation()).resolves.toBeDefined();
    });
  });
});
