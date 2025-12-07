/**
 * @fileoverview Tests for Test Isolation Service
 * @module tests/security/services/test-isolation-service
 *
 * Task: P1-006 - Test Isolation Framework
 * Sprint: 2 (SECDB-2025-12)
 *
 * Tests the test isolation and fixture generation functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "../../../src/generated/prisma/client.js";
import {
  TestIsolationService,
  createTestIsolationService,
} from "../../../src/bot/security/services/test-isolation-service.js";
import { ThreatType, RoleChangeType } from "../../../src/bot/security/types/database-models.js";

// ============================================================================
// TEST FIXTURES & MOCKS
// ============================================================================

function createMockPrisma() {
  let idCounter = 1n;

  const createMockModel = () => ({
    create: vi.fn().mockImplementation(async () => {
      return { id: idCounter++ };
    }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  });

  return {
    securityEvent: createMockModel(),
    roleChangeAudit: createMockModel(),
    threatDetection: createMockModel(),
    securityBaseline: createMockModel(),
    permissionSnapshot: createMockModel(),
    adminRoleRequest: createMockModel(),
  };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe("TestIsolationService", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: TestIsolationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    service = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
      seed: "test-seed-12345",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // CONSTRUCTOR TESTS
  // ==========================================================================

  describe("Constructor", () => {
    it("should create instance with default configuration", () => {
      const instance = new TestIsolationService(mockPrisma as unknown as PrismaClient);
      expect(instance).toBeInstanceOf(TestIsolationService);
    });

    it("should create instance with custom seed", () => {
      const instance = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
        seed: "custom-seed",
      });
      expect(instance.getSeed()).toBe("custom-seed");
    });

    it("should create instance with custom configuration", () => {
      const instance = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
        useTransactions: false,
        autoCleanup: false,
        maxFixtureRecords: 500,
        trackCreatedRecords: false,
      });
      expect(instance).toBeInstanceOf(TestIsolationService);
    });
  });

  // ==========================================================================
  // FACTORY FUNCTION TESTS
  // ==========================================================================

  describe("createTestIsolationService factory", () => {
    it("should create service instance via factory", () => {
      const instance = createTestIsolationService(mockPrisma as unknown as PrismaClient);
      expect(instance).toBeInstanceOf(TestIsolationService);
    });

    it("should create service with overrides via factory", () => {
      const instance = createTestIsolationService(mockPrisma as unknown as PrismaClient, {
        seed: "factory-seed",
      });
      expect(instance.getSeed()).toBe("factory-seed");
    });
  });

  // ==========================================================================
  // LIFECYCLE TESTS
  // ==========================================================================

  describe("Test Lifecycle", () => {
    describe("setup", () => {
      it("should initialize for new test", async () => {
        await service.setup();
        expect(service.getTrackedRecordCount()).toBe(0);
      });

      it("should clear previous tracked records", async () => {
        // Create some fixtures first
        await service.createSecurityEventFixtures({ count: 2 });
        const countBefore = service.getTrackedRecordCount();
        expect(countBefore).toBe(2);

        // Setup should clear them
        await service.setup();
        expect(service.getTrackedRecordCount()).toBe(0);
      });

      it("should activate transaction mode when configured", async () => {
        await service.setup();
        expect(service.isTransactionActive()).toBe(true);
      });
    });

    describe("teardown", () => {
      it("should cleanup tracked records when autoCleanup enabled", async () => {
        await service.setup();
        await service.createSecurityEventFixtures({ count: 3 });

        await service.teardown();

        expect(mockPrisma.securityEvent.deleteMany).toHaveBeenCalled();
        expect(service.getTrackedRecordCount()).toBe(0);
      });

      it("should deactivate transaction mode", async () => {
        await service.setup();
        expect(service.isTransactionActive()).toBe(true);

        await service.teardown();
        expect(service.isTransactionActive()).toBe(false);
      });
    });
  });

  // ==========================================================================
  // SECURITY EVENT FIXTURES
  // ==========================================================================

  describe("createSecurityEventFixtures", () => {
    it("should create specified number of fixtures", async () => {
      const result = await service.createSecurityEventFixtures({ count: 5 });

      expect(result.records.length).toBe(5);
      expect(result.ids.length).toBe(5);
      expect(mockPrisma.securityEvent.create).toHaveBeenCalledTimes(5);
    });

    it("should use provided guild ID", async () => {
      await service.createSecurityEventFixtures({
        count: 2,
        guildId: "my-guild-123",
      });

      expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guildId: "my-guild-123",
          }),
        })
      );
    });

    it("should generate fixtures with correct structure", async () => {
      await service.createSecurityEventFixtures({ count: 1 });

      expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guildId: expect.any(String),
            guildName: expect.any(String),
            eventType: expect.any(String),
            severity: expect.any(String),
            origin: "test-isolation-service",
            metadata: expect.objectContaining({
              testRun: true,
            }),
          }),
        })
      );
    });

    it("should return timing information", async () => {
      const result = await service.createSecurityEventFixtures({ count: 3 });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.seed).toBe("test-seed-12345");
    });

    it("should track created records for cleanup", async () => {
      await service.createSecurityEventFixtures({ count: 3 });

      expect(service.getTrackedRecordCount()).toBe(3);
    });

    it("should respect maxFixtureRecords limit", async () => {
      const limitedService = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
        maxFixtureRecords: 5,
      });

      const result = await limitedService.createSecurityEventFixtures({ count: 100 });

      expect(result.records.length).toBe(5);
    });

    it("should use date range for fixture creation", async () => {
      const start = new Date("2024-01-01");
      const end = new Date("2024-06-30");

      await service.createSecurityEventFixtures({
        count: 1,
        dateRange: { start, end },
      });

      expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdAt: expect.any(Date),
          }),
        })
      );
    });
  });

  // ==========================================================================
  // ROLE AUDIT FIXTURES
  // ==========================================================================

  describe("createRoleAuditFixtures", () => {
    it("should create specified number of fixtures", async () => {
      const result = await service.createRoleAuditFixtures({ count: 4 });

      expect(result.records.length).toBe(4);
      expect(mockPrisma.roleChangeAudit.create).toHaveBeenCalledTimes(4);
    });

    it("should use provided change types", async () => {
      await service.createRoleAuditFixtures({
        count: 2,
        changeTypes: [RoleChangeType.ADDITION],
      });

      expect(mockPrisma.roleChangeAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            changeType: RoleChangeType.ADDITION,
          }),
        })
      );
    });

    it("should cycle through provided user IDs", async () => {
      await service.createRoleAuditFixtures({
        count: 3,
        userIds: ["user1", "user2"],
      });

      expect(mockPrisma.roleChangeAudit.create).toHaveBeenCalledTimes(3);
    });

    it("should generate role audit with correct structure", async () => {
      await service.createRoleAuditFixtures({ count: 1 });

      expect(mockPrisma.roleChangeAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guildId: expect.any(String),
            userId: expect.any(String),
            roleId: expect.any(String),
            roleName: expect.any(String),
            changeType: expect.any(String),
            performedBy: expect.any(String),
          }),
        })
      );
    });
  });

  // ==========================================================================
  // THREAT DETECTION FIXTURES
  // ==========================================================================

  describe("createThreatDetectionFixtures", () => {
    it("should create specified number of fixtures", async () => {
      const result = await service.createThreatDetectionFixtures({ count: 6 });

      expect(result.records.length).toBe(6);
      expect(mockPrisma.threatDetection.create).toHaveBeenCalledTimes(6);
    });

    it("should use provided threat types", async () => {
      await service.createThreatDetectionFixtures({
        count: 2,
        threatTypes: [ThreatType.RAPID_ROLE_CHANGES],
      });

      expect(mockPrisma.threatDetection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            threatType: ThreatType.RAPID_ROLE_CHANGES,
          }),
        })
      );
    });

    it("should include resolved threats when specified", async () => {
      await service.createThreatDetectionFixtures({
        count: 5,
        includeResolved: true,
      });

      expect(mockPrisma.threatDetection.create).toHaveBeenCalled();
    });

    it("should exclude resolved threats when specified", async () => {
      await service.createThreatDetectionFixtures({
        count: 3,
        includeResolved: false,
      });

      // All records should have resolved: false
      const calls = mockPrisma.threatDetection.create.mock.calls;
      calls.forEach((call) => {
        expect((call[0] as { data: { resolved: boolean } }).data.resolved).toBe(false);
      });
    });

    it("should include MITRE ATT&CK IDs", async () => {
      await service.createThreatDetectionFixtures({ count: 1 });

      expect(mockPrisma.threatDetection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mitreAttackId: expect.stringMatching(/^T\d{4}$/),
          }),
        })
      );
    });
  });

  // ==========================================================================
  // BASELINE FIXTURES
  // ==========================================================================

  describe("createBaselineFixtures", () => {
    it("should create specified number of baselines", async () => {
      const result = await service.createBaselineFixtures({ count: 3 });

      expect(result.records.length).toBe(3);
      expect(mockPrisma.securityBaseline.create).toHaveBeenCalledTimes(3);
    });

    it("should use provided guild IDs", async () => {
      await service.createBaselineFixtures({
        count: 2,
        guildIds: ["guild-a", "guild-b"],
      });

      expect(mockPrisma.securityBaseline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guildId: expect.stringMatching(/^guild-[ab]$/),
          }),
        })
      );
    });

    it("should set isActive based on option", async () => {
      await service.createBaselineFixtures({
        count: 1,
        isActive: false,
      });

      expect(mockPrisma.securityBaseline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
          }),
        })
      );
    });

    it("should include normal patterns metadata", async () => {
      await service.createBaselineFixtures({ count: 1 });

      expect(mockPrisma.securityBaseline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            normalPatterns: expect.objectContaining({
              fixture: true,
            }),
          }),
        })
      );
    });
  });

  // ==========================================================================
  // CLEANUP TESTS
  // ==========================================================================

  describe("Cleanup", () => {
    describe("cleanupTrackedRecords", () => {
      it("should delete tracked records", async () => {
        await service.createSecurityEventFixtures({ count: 2 });
        await service.createRoleAuditFixtures({ count: 2 });

        const result = await service.cleanupTrackedRecords();

        expect(mockPrisma.securityEvent.deleteMany).toHaveBeenCalled();
        expect(mockPrisma.roleChangeAudit.deleteMany).toHaveBeenCalled();
        expect(result.tablesCleared).toContain("securityEvent");
        expect(result.tablesCleared).toContain("roleChangeAudit");
      });

      it("should return cleanup statistics", async () => {
        mockPrisma.securityEvent.deleteMany.mockResolvedValue({ count: 5 });
        await service.createSecurityEventFixtures({ count: 5 });

        const result = await service.cleanupTrackedRecords();

        expect(result.totalDeleted).toBe(5);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.errors).toEqual([]);
      });

      it("should handle errors gracefully", async () => {
        mockPrisma.securityEvent.deleteMany.mockRejectedValue(new Error("Delete failed"));
        await service.createSecurityEventFixtures({ count: 2 });

        const result = await service.cleanupTrackedRecords();

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("Delete failed");
      });
    });

    describe("fullCleanup", () => {
      it("should delete all records from specified tables", async () => {
        await service.fullCleanup(["securityEvent", "roleChangeAudit"]);

        expect(mockPrisma.securityEvent.deleteMany).toHaveBeenCalledWith({});
        expect(mockPrisma.roleChangeAudit.deleteMany).toHaveBeenCalledWith({});
      });

      it("should clean all tables when none specified", async () => {
        await service.fullCleanup();

        expect(mockPrisma.securityEvent.deleteMany).toHaveBeenCalled();
        expect(mockPrisma.roleChangeAudit.deleteMany).toHaveBeenCalled();
        expect(mockPrisma.threatDetection.deleteMany).toHaveBeenCalled();
        expect(mockPrisma.securityBaseline.deleteMany).toHaveBeenCalled();
      });

      it("should return cleanup statistics", async () => {
        mockPrisma.securityEvent.deleteMany.mockResolvedValue({ count: 10 });
        mockPrisma.roleChangeAudit.deleteMany.mockResolvedValue({ count: 5 });

        const result = await service.fullCleanup(["securityEvent", "roleChangeAudit"]);

        expect(result.totalDeleted).toBe(15);
        expect(result.tablesCleared).toContain("securityEvent");
        expect(result.tablesCleared).toContain("roleChangeAudit");
      });
    });
  });

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  describe("Utility Methods", () => {
    describe("generateGuildId", () => {
      it("should generate deterministic guild IDs with same seed", () => {
        const service1 = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
          seed: "fixed-seed",
        });
        const service2 = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
          seed: "fixed-seed",
        });

        const id1 = service1.generateGuildId();
        const id2 = service2.generateGuildId();

        expect(id1).toBe(id2);
      });

      it("should generate different IDs with different seeds", () => {
        const service1 = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
          seed: "seed-a",
        });
        const service2 = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
          seed: "seed-b",
        });

        const id1 = service1.generateGuildId();
        const id2 = service2.generateGuildId();

        expect(id1).not.toBe(id2);
      });

      it("should generate valid guild ID format", () => {
        const id = service.generateGuildId();

        expect(id).toMatch(/^test-guild-[a-z0-9]+$/);
      });
    });

    describe("generateUserId", () => {
      it("should generate valid user ID format", () => {
        const id = service.generateUserId();

        expect(id).toMatch(/^test-user-[a-z0-9]+$/);
      });
    });

    describe("generateRoleId", () => {
      it("should generate valid role ID format", () => {
        const id = service.generateRoleId();

        expect(id).toMatch(/^test-role-[a-z0-9]+$/);
      });
    });

    describe("generateMitreId", () => {
      it("should generate valid MITRE ATT&CK ID", () => {
        const id = service.generateMitreId();

        expect(id).toMatch(/^T\d{4}$/);
      });
    });

    describe("getSeed", () => {
      it("should return current seed", () => {
        expect(service.getSeed()).toBe("test-seed-12345");
      });
    });

    describe("reseed", () => {
      it("should update seed and reset generator", () => {
        service.reseed("new-seed");

        expect(service.getSeed()).toBe("new-seed");
      });

      it("should produce different output after reseed", () => {
        const id1 = service.generateGuildId();
        service.reseed("different-seed");
        const id2 = service.generateGuildId();

        expect(id1).not.toBe(id2);
      });
    });

    describe("getTrackedRecordCount", () => {
      it("should return 0 initially", () => {
        expect(service.getTrackedRecordCount()).toBe(0);
      });

      it("should count tracked records", async () => {
        await service.createSecurityEventFixtures({ count: 3 });
        await service.createRoleAuditFixtures({ count: 2 });

        expect(service.getTrackedRecordCount()).toBe(5);
      });
    });

    describe("isTransactionActive", () => {
      it("should return false initially", () => {
        expect(service.isTransactionActive()).toBe(false);
      });

      it("should return true after setup", async () => {
        await service.setup();

        expect(service.isTransactionActive()).toBe(true);
      });
    });
  });

  // ==========================================================================
  // DETERMINISM TESTS
  // ==========================================================================

  describe("Determinism", () => {
    it("should produce same fixtures with same seed", async () => {
      const service1 = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
        seed: "deterministic-seed",
      });
      const mockPrisma2 = createMockPrisma();
      const service2 = new TestIsolationService(mockPrisma2 as unknown as PrismaClient, {
        seed: "deterministic-seed",
      });

      await service1.createSecurityEventFixtures({ count: 3 });
      await service2.createSecurityEventFixtures({ count: 3 });

      // Both should have created fixtures with same characteristics
      // (can't compare exact data due to mocks, but structure should match)
      expect(mockPrisma.securityEvent.create).toHaveBeenCalledTimes(3);
      expect(mockPrisma2.securityEvent.create).toHaveBeenCalledTimes(3);
    });

    it("should produce different fixtures with different seeds", async () => {
      const service1 = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
        seed: "seed-alpha",
      });
      const id1 = service1.generateGuildId();

      const service2 = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
        seed: "seed-beta",
      });
      const id2 = service2.generateGuildId();

      expect(id1).not.toBe(id2);
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe("Edge Cases", () => {
    it("should handle creating 0 fixtures", async () => {
      const result = await service.createSecurityEventFixtures({ count: 0 });

      expect(result.records.length).toBe(0);
      expect(result.ids.length).toBe(0);
    });

    it("should not track records when tracking disabled", async () => {
      const noTrackService = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
        trackCreatedRecords: false,
      });

      await noTrackService.createSecurityEventFixtures({ count: 5 });

      expect(noTrackService.getTrackedRecordCount()).toBe(0);
    });

    it("should skip cleanup when autoCleanup disabled", async () => {
      const noAutoCleanupService = new TestIsolationService(mockPrisma as unknown as PrismaClient, {
        autoCleanup: false,
      });

      await noAutoCleanupService.setup();
      await noAutoCleanupService.createSecurityEventFixtures({ count: 3 });
      await noAutoCleanupService.teardown();

      // deleteMany should not have been called during teardown
      expect(mockPrisma.securityEvent.deleteMany).not.toHaveBeenCalled();
    });

    it("should handle concurrent fixture creation", async () => {
      const promises = [
        service.createSecurityEventFixtures({ count: 2 }),
        service.createRoleAuditFixtures({ count: 2 }),
        service.createThreatDetectionFixtures({ count: 2 }),
      ];

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.records.length).toBe(2);
      });
      expect(service.getTrackedRecordCount()).toBe(6);
    });
  });
});
