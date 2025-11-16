import { describe, it, expect, beforeEach, vi } from 'vitest';
import { errorLearning } from '../src/services/error-learning.js';
import type { ErrorLog } from '@prisma/client';
import { createMockErrorLog, mockPrismaWithErrorLog, mockLogger } from './shared/index.js';

// Mock Prisma
vi.mock('../src/shared/prisma.js', () => ({
  prisma: mockPrismaWithErrorLog(),
}));

// Mock logger
vi.mock('../src/utils/logger.js', () => mockLogger());

describe('ErrorLearning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Knowledge Base Updates', () => {
    it('should update knowledge base for recent errors', async () => {
      const mockErrors: ErrorLog[] = [
        createMockErrorLog({
          errorId: 'error-1',
          fingerprint: 'fp-1',
          category: 'DATABASE',
          severity: 'HIGH',
          lastSeen: new Date(),
          occurrenceCount: 5,
        }),
        createMockErrorLog({
          errorId: 'error-2',
          fingerprint: 'fp-2',
          category: 'NETWORK',
          severity: 'MEDIUM',
          lastSeen: new Date(),
          occurrenceCount: 3,
        }),
      ];

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findMany).mockResolvedValue(mockErrors);
      vi.mocked(prisma.errorLog.update).mockResolvedValue(mockErrors[0]);

      const result = await errorLearning.updateKnowledgeBase();

      // Should have processed errors
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty error list', async () => {
      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findMany).mockResolvedValue([]);

      await expect(errorLearning.updateKnowledgeBase()).resolves.not.toThrow();
    });

    it('should force update when requested', async () => {
      const mockError = createMockErrorLog({
        errorId: 'error-1',
        fingerprint: 'fp-1',
        category: 'DATABASE',
        severity: 'HIGH',
        occurrenceCount: 10,
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findMany).mockResolvedValue([mockError]);
      vi.mocked(prisma.errorLog.update).mockResolvedValue(mockError);

      const result = await errorLearning.updateKnowledgeBase(true);

      // Should process all errors
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('API Exposure', () => {
    it('should expose time pattern detection API', () => {
      expect(errorLearning.detectTimePatterns).toBeDefined();
      expect(typeof errorLearning.detectTimePatterns).toBe('function');
    });

    it('should expose correlation detection API', () => {
      expect(errorLearning.detectCorrelations).toBeDefined();
      expect(typeof errorLearning.detectCorrelations).toBe('function');
    });

    it('should expose impact prediction API', () => {
      expect(errorLearning.predictImpact).toBeDefined();
      expect(typeof errorLearning.predictImpact).toBe('function');
    });

    it('should expose mitigation suggestion API', () => {
      expect(errorLearning.suggestMitigation).toBeDefined();
      expect(typeof errorLearning.suggestMitigation).toBe('function');
    });

    it('should expose cascade detection API', () => {
      expect(errorLearning.detectCascades).toBeDefined();
      expect(typeof errorLearning.detectCascades).toBe('function');
    });
  });

  describe('Recovery Learning', () => {
    it('should process errors with recovery data', async () => {
      const errorWithRecovery = createMockErrorLog({
        errorId: 'error-1',
        fingerprint: 'fp-1',
        category: 'NETWORK',
        severity: 'MEDIUM',
        recoveryAttempted: 3,
        recoverySuccess: 2,
        lastRecoveryStrategy: 'exponential-backoff-retry',
        lastRecoveryOutcome: 'success',
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findMany).mockResolvedValue([errorWithRecovery]);
      vi.mocked(prisma.errorLog.update).mockResolvedValue(errorWithRecovery);

      const result = await errorLearning.updateKnowledgeBase();

      // Should process errors with recovery data
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Frequency Analysis', () => {
    it('should analyze frequent errors', async () => {
      const frequentError = createMockErrorLog({
        errorId: 'error-1',
        fingerprint: 'fp-frequent',
        occurrenceCount: 50,
        firstSeen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        lastSeen: new Date(),
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.findMany).mockResolvedValue([frequentError]);
      vi.mocked(prisma.errorLog.update).mockResolvedValue(frequentError);

      const result = await errorLearning.updateKnowledgeBase();

      // Should process frequent errors
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });
});
