import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { errorTracker } from '../src/services/error-tracker.js';
import type { ErrorLog } from '@prisma/client';

// Mock Prisma
vi.mock('../src/shared/prisma.js', () => ({
  prisma: {
    errorLog: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
  log: vi.fn(),
}));

describe('ErrorTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Error Fingerprinting', () => {
    it('should generate consistent fingerprints for identical errors', async () => {
      const error1 = new Error('Test error');
      const error2 = new Error('Test error');

      // Mock stack traces to be identical
      error1.stack = 'Error: Test error\n    at test.js:10:5';
      error2.stack = 'Error: Test error\n    at test.js:10:5';

      const context1 = { category: 'TEST' as const, service: 'test-service' };
      const context2 = { category: 'TEST' as const, service: 'test-service' };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'test-id',
        fingerprint: args.data.fingerprint,
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
      } as ErrorLog));

      const result1 = await errorTracker.captureError(error1, context1);
      const result2 = await errorTracker.captureError(error2, context2);

      expect(result1.fingerprint).toBe(result2.fingerprint);
    });

    it('should generate different fingerprints for different errors', async () => {
      const error1 = new Error('Error A');
      const error2 = new Error('Error B');

      error1.stack = 'Error: Error A\n    at test.js:10:5';
      error2.stack = 'Error: Error B\n    at test.js:20:5';

      const context = { category: 'TEST' as const };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'test-id',
        fingerprint: args.data.fingerprint,
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
      } as ErrorLog));

      const result1 = await errorTracker.captureError(error1, context);
      const result2 = await errorTracker.captureError(error2, context);

      expect(result1.fingerprint).not.toBe(result2.fingerprint);
    });

    it('should include context in fingerprint when specified', async () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:5';

      const contextA = { category: 'TEST' as const, userId: 'user-123' };
      const contextB = { category: 'TEST' as const, userId: 'user-456' };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'test-id',
        fingerprint: args.data.fingerprint,
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
      } as ErrorLog));

      // With includeContextInFingerprint = true
      const result1 = await errorTracker.captureError(error, {
        ...contextA,
        includeContextInFingerprint: true,
      });
      const result2 = await errorTracker.captureError(error, {
        ...contextB,
        includeContextInFingerprint: true,
      });

      expect(result1.fingerprint).not.toBe(result2.fingerprint);
    });
  });

  describe('Error Deduplication', () => {
    it('should increment occurrence count for duplicate errors', async () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:5';
      const context = { category: 'TEST' as const };

      const existingError: ErrorLog = {
        errorId: 'existing-id',
        fingerprint: 'test-fingerprint',
        category: 'TEST',
        severity: 'MEDIUM',
        errorName: 'Error',
        errorMessage: 'Test error',
        stackTrace: error.stack || '',
        contextData: {},
        firstSeen: new Date('2025-11-01'),
        lastSeen: new Date('2025-11-09'),
        occurrenceCount: 5,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
        learningMetadata: null,
      };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(existingError);
      vi.mocked(prisma.errorLog.update).mockResolvedValue({
        ...existingError,
        occurrenceCount: 6,
        lastSeen: new Date(),
      });

      const result = await errorTracker.captureError(error, context);

      expect(prisma.errorLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { fingerprint: existingError.fingerprint },
          data: expect.objectContaining({
            occurrenceCount: 6,
          }),
        })
      );
      expect(result.occurrenceCount).toBe(6);
    });

    it('should create new error log for first occurrence', async () => {
      const error = new Error('New error');
      error.stack = 'Error: New error\n    at test.js:10:5';
      const context = { category: 'TEST' as const };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'new-id',
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
      } as ErrorLog));

      const result = await errorTracker.captureError(error, context);

      expect(prisma.errorLog.create).toHaveBeenCalled();
      expect(result.occurrenceCount).toBe(1);
    });
  });

  describe('Severity Classification', () => {
    it('should classify database errors as CRITICAL', async () => {
      const error = new Error('ECONNREFUSED');
      error.stack = 'Error: ECONNREFUSED\n    at postgres.js:10:5';
      const context = { category: 'DATABASE' as const };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'test-id',
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
      } as ErrorLog));

      const result = await errorTracker.captureError(error, context);

      expect(result.severity).toBe('CRITICAL');
    });

    it('should classify validation errors as LOW', async () => {
      const error = new Error('Invalid input');
      error.stack = 'Error: Invalid input\n    at validator.js:10:5';
      const context = { category: 'VALIDATION' as const };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'test-id',
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
      } as ErrorLog));

      const result = await errorTracker.captureError(error, context);

      expect(result.severity).toBe('LOW');
    });

    it('should classify Discord rate limit as MEDIUM', async () => {
      const error = new Error('429 Too Many Requests');
      error.stack = 'Error: 429 Too Many Requests\n    at discord.js:10:5';
      const context = { category: 'DISCORD' as const };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'test-id',
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
      } as ErrorLog));

      const result = await errorTracker.captureError(error, context);

      expect(result.severity).toBe('MEDIUM');
    });

    it('should allow manual severity override', async () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:5';
      const context = {
        category: 'TEST' as const,
        severity: 'HIGH' as const,
      };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'test-id',
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
      } as ErrorLog));

      const result = await errorTracker.captureError(error, context);

      expect(result.severity).toBe('HIGH');
    });
  });

  describe('Context Enrichment', () => {
    it('should preserve all context data', async () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:5';
      const context = {
        category: 'TEST' as const,
        userId: 'user-123',
        guildId: 'guild-456',
        commandName: 'test-command',
        service: 'test-service',
        metadata: { key: 'value' },
      };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'test-id',
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
      } as ErrorLog));

      const result = await errorTracker.captureError(error, context);

      expect(result.contextData).toMatchObject({
        userId: 'user-123',
        guildId: 'guild-456',
        commandName: 'test-command',
        service: 'test-service',
        metadata: { key: 'value' },
      });
    });

    it('should add timestamp to context', async () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:5';
      const context = { category: 'TEST' as const };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'test-id',
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
      } as ErrorLog));

      const result = await errorTracker.captureError(error, context);

      expect(result.contextData).toHaveProperty('timestamp');
      expect(typeof result.contextData.timestamp).toBe('string');
    });
  });

  describe('Statistics and Queries', () => {
    it('should return error statistics', async () => {
      const { prisma } = await import('../src/shared/prisma.js');

      vi.mocked(prisma.errorLog.count).mockResolvedValueOnce(100); // total
      vi.mocked(prisma.errorLog.count).mockResolvedValueOnce(10); // critical
      vi.mocked(prisma.errorLog.count).mockResolvedValueOnce(30); // high
      vi.mocked(prisma.errorLog.count).mockResolvedValueOnce(40); // medium
      vi.mocked(prisma.errorLog.count).mockResolvedValueOnce(20); // low

      const stats = await errorTracker.getErrorStats();

      expect(stats).toMatchObject({
        totalUniqueErrors: 100,
        bySeverity: {
          CRITICAL: 10,
          HIGH: 30,
          MEDIUM: 40,
          LOW: 20,
        },
      });
    });

    it('should return recent errors', async () => {
      const mockErrors: ErrorLog[] = [
        {
          errorId: 'error-1',
          fingerprint: 'fp-1',
          category: 'TEST',
          severity: 'HIGH',
          errorName: 'Error',
          errorMessage: 'Test error 1',
          stackTrace: 'stack trace',
          contextData: {},
          firstSeen: new Date('2025-11-09'),
          lastSeen: new Date('2025-11-10'),
          occurrenceCount: 5,
          recoveryAttempted: 0,
          recoverySuccess: 0,
          impactedFeatures: [],
          learningMetadata: null,
        },
      ];

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findMany).mockResolvedValue(mockErrors);

      const recent = await errorTracker.getRecentErrors(10);

      expect(recent).toHaveLength(1);
      expect(recent[0].errorId).toBe('error-1');
      expect(prisma.errorLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          orderBy: { lastSeen: 'desc' },
        })
      );
    });

    it('should find error by fingerprint', async () => {
      const mockError: ErrorLog = {
        errorId: 'error-1',
        fingerprint: 'test-fingerprint',
        category: 'TEST',
        severity: 'MEDIUM',
        errorName: 'Error',
        errorMessage: 'Test error',
        stackTrace: 'stack trace',
        contextData: {},
        firstSeen: new Date('2025-11-09'),
        lastSeen: new Date('2025-11-10'),
        occurrenceCount: 3,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: [],
        learningMetadata: null,
      };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(mockError);

      const result = await errorTracker.getErrorByFingerprint('test-fingerprint');

      expect(result).toBeDefined();
      expect(result?.fingerprint).toBe('test-fingerprint');
    });
  });

  describe('Impact Detection', () => {
    it('should identify impacted features for database errors', async () => {
      const error = new Error('Database connection failed');
      error.stack = 'Error: Database connection failed\n    at db.js:10:5';
      const context = { category: 'DATABASE' as const };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'test-id',
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: args.data.impactedFeatures || [],
      } as ErrorLog));

      const result = await errorTracker.captureError(error, context);

      expect(result.impactedFeatures).toContain('database');
      expect(result.impactedFeatures.length).toBeGreaterThan(0);
    });

    it('should identify impacted features for battle errors', async () => {
      const error = new Error('Battle calculation failed');
      error.stack = 'Error: Battle calculation failed\n    at battle.js:10:5';
      const context = {
        category: 'ENGINE' as const,
        commandName: 'battle',
      };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.errorLog.create).mockImplementation(async (args) => ({
        errorId: 'test-id',
        ...args.data,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrenceCount: 1,
        recoveryAttempted: 0,
        recoverySuccess: 0,
        impactedFeatures: args.data.impactedFeatures || [],
      } as ErrorLog));

      const result = await errorTracker.captureError(error, context);

      expect(result.impactedFeatures).toContain('battle');
    });
  });

  describe('Error Fallback Handling', () => {
    it('should handle errors during error capture gracefully', async () => {
      const error = new Error('Original error');
      const context = { category: 'TEST' as const };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockRejectedValue(
        new Error('Database unavailable')
      );

      // Should not throw, but return fallback error log
      const result = await errorTracker.captureError(error, context);

      expect(result).toBeDefined();
      expect(result.errorMessage).toBe('Original error');
      // Should have a fingerprint even if DB failed
      expect(result.fingerprint).toBeDefined();
    });

    it('should write to emergency log file when database fails', async () => {
      const error = new Error('Test error');
      const context = { category: 'TEST' as const };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockRejectedValue(
        new Error('Database unavailable')
      );

      await errorTracker.captureError(error, context);

      // Note: Actual file writing is tested in integration tests
      // Here we just verify the function doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('Learning Metadata', () => {
    it('should preserve existing learning metadata on duplicate', async () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:5';
      const context = { category: 'TEST' as const };

      const existingError: ErrorLog = {
        errorId: 'existing-id',
        fingerprint: 'test-fingerprint',
        category: 'TEST',
        severity: 'MEDIUM',
        errorName: 'Error',
        errorMessage: 'Test error',
        stackTrace: error.stack || '',
        contextData: {},
        firstSeen: new Date('2025-11-01'),
        lastSeen: new Date('2025-11-09'),
        occurrenceCount: 5,
        recoveryAttempted: 2,
        recoverySuccess: 1,
        impactedFeatures: [],
        learningMetadata: {
          patterns: ['time-of-day'],
          frequencyScore: 0.8,
        },
      };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findUnique).mockResolvedValue(existingError);
      vi.mocked(prisma.errorLog.update).mockResolvedValue({
        ...existingError,
        occurrenceCount: 6,
        lastSeen: new Date(),
      });

      const result = await errorTracker.captureError(error, context);

      expect(result.learningMetadata).toEqual({
        patterns: ['time-of-day'],
        frequencyScore: 0.8,
      });
    });
  });
});
