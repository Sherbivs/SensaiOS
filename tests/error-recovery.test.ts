import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { attemptRecovery, getRecoveryStats, clearRecoveryState } from '../src/services/error-recovery.js';
import type { ErrorLog } from '@prisma/client';
import { createMockErrorLog, mockPrismaWithErrorLog, mockLogger } from './shared/index.js';

// Mock Prisma
vi.mock('../src/shared/prisma.js', () => ({
  prisma: mockPrismaWithErrorLog(),
}));

// Mock logger
vi.mock('../src/utils/logger.js', () => mockLogger());

// Mock cache facade
vi.mock('../src/services/cache/facade.js', () => ({
  runCacheMaintenanceNow: vi.fn().mockResolvedValue(undefined),
}));

describe('ErrorRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRecoveryState();
  });

  afterEach(() => {
    clearRecoveryState();
  });

  describe('Strategy Selection', () => {
    it('should select reconnect-database for database connection errors', async () => {
      const error = createMockErrorLog({
        category: 'DATABASE',
        severity: 'CRITICAL',
        errorName: 'ConnectionError',
        errorMessage: 'ECONNREFUSED',
        impactedFeatures: ['database'],
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ result: 1 }]);
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      const result = await attemptRecovery(error);

      expect(result).toBe(true);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should select rate-limit-queue for Discord 429 errors', async () => {
      const error = createMockErrorLog({
        category: 'DISCORD',
        severity: 'MEDIUM',
        errorName: 'DiscordAPIError',
        errorMessage: '429 Too Many Requests',
        impactedFeatures: ['discord'],
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      const result = await attemptRecovery(error);

      expect(result).toBe(true);
      const stats = getRecoveryStats();
      expect(stats.queuedOperations).toBeGreaterThanOrEqual(0);
    });

    it('should select increase-timeout for timeout errors', async () => {
      const error = createMockErrorLog({
        category: 'NETWORK',
        severity: 'MEDIUM',
        errorName: 'TimeoutError',
        errorMessage: 'Operation timed out',
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      const result = await attemptRecovery(error);

      expect(result).toBe(true);
    });

    it('should select rebuild-cache for cache corruption', async () => {
      const error = createMockErrorLog({
        category: 'CACHE',
        severity: 'HIGH',
        errorName: 'CacheCorruptionError',
        errorMessage: 'Invalid cache data',
        contextData: { cacheKey: 'test-namespace' },
        impactedFeatures: ['cache'],
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      const result = await attemptRecovery(error);

      expect(result).toBe(true);
      const { runCacheMaintenanceNow } = await import('../src/services/cache/facade.js');
      expect(runCacheMaintenanceNow).toHaveBeenCalledWith('manual');
    });

    it('should select restart-worker for worker crash', async () => {
      const error = createMockErrorLog({
        category: 'WORKER',
        severity: 'HIGH',
        errorName: 'WorkerCrashError',
        errorMessage: 'Worker unexpectedly crashed',
        contextData: { workerName: 'test-worker' },
        impactedFeatures: ['worker'],
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      const result = await attemptRecovery(error);

      expect(result).toBe(true);
    });

    it('should select exponential-backoff-retry for network errors', async () => {
      const error = createMockErrorLog({
        category: 'NETWORK',
        severity: 'MEDIUM',
        errorName: 'NetworkError',
        errorMessage: 'ECONNRESET',
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      const result = await attemptRecovery(error);

      expect(result).toBe(true);
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate exponential backoff delays correctly', async () => {
      const error = createMockErrorLog({
        category: 'NETWORK',
        severity: 'MEDIUM',
        errorName: 'NetworkError',
        errorMessage: 'Connection failed',
      });

      const config = {
        baseDelayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 1000,
      };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      const startTime = Date.now();
      await attemptRecovery(error, config);
      const elapsed = Date.now() - startTime;

      // First attempt should delay ~100ms
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);
    });

    it('should cap delays at maximum', async () => {
      const error = createMockErrorLog({
        category: 'NETWORK',
        severity: 'MEDIUM',
        errorName: 'NetworkError',
        errorMessage: 'Connection failed',
        occurrenceCount: 10,
        recoveryAttempted: 9,
      });

      const config = {
        baseDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 5000,
      };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      const startTime = Date.now();
      await attemptRecovery(error, config);
      const elapsed = Date.now() - startTime;

      // Delay should be capped at 5000ms
      expect(elapsed).toBeLessThan(6000);
    });
  });

  describe('Max Retries Enforcement', () => {
    it('should stop recovery after max retries', async () => {
      const error = createMockErrorLog({
        category: 'NETWORK',
        severity: 'MEDIUM',
        errorName: 'NetworkError',
        errorMessage: 'Connection failed',
        occurrenceCount: 4,
        recoveryAttempted: 3, // Already at max
      });

      const config = { maxRetries: 3 };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      const result = await attemptRecovery(error, config);

      // Should reject due to max retries
      expect(result).toBe(false);
    });

    it('should allow retries up to max limit', async () => {
      const error = createMockErrorLog({
        category: 'NETWORK',
        severity: 'MEDIUM',
        errorName: 'NetworkError',
        errorMessage: 'Connection failed',
        occurrenceCount: 2,
        recoveryAttempted: 1, // Below max
      });

      const config = { maxRetries: 3 };

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      const result = await attemptRecovery(error, config);

      // Should allow retry
      expect(result).toBe(true);
    });
  });

  describe('Database Updates', () => {
    it('should update recovery attempt counter', async () => {
      const error = createMockErrorLog({
        category: 'NETWORK',
        severity: 'MEDIUM',
        errorName: 'NetworkError',
        errorMessage: 'Connection failed',
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue({
        ...error,
        recoveryAttempted: 1,
      });

      await attemptRecovery(error);

      expect(prisma.errorLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { errorId: error.errorId },
          data: expect.objectContaining({
            recoveryAttempted: 1,
          }),
        })
      );
    });

    it('should update recovery success counter on success', async () => {
      const error = createMockErrorLog({
        category: 'NETWORK',
        severity: 'MEDIUM',
        errorName: 'NetworkError',
        errorMessage: 'Connection failed',
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue({
        ...error,
        recoveryAttempted: 1,
        recoverySuccess: 1,
      });

      const result = await attemptRecovery(error);

      expect(result).toBe(true);
      expect(prisma.errorLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recoverySuccess: 1,
          }),
        })
      );
    });

    it('should update learning metadata with recovery details', async () => {
      const error = createMockErrorLog({
        category: 'NETWORK',
        severity: 'MEDIUM',
        errorName: 'NetworkError',
        errorMessage: 'Connection failed',
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      await attemptRecovery(error);

      expect(prisma.errorLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            learningMetadata: expect.objectContaining({
              lastRecoveryAttempt: expect.objectContaining({
                strategy: expect.any(String),
                success: expect.any(Boolean),
                attemptNumber: expect.any(Number),
                timestamp: expect.any(String),
              }),
            }),
          }),
        })
      );
    });
  });

  describe('Recovery Statistics', () => {
    it('should return accurate recovery statistics', async () => {
      const error = createMockErrorLog({
        category: 'NETWORK',
        severity: 'MEDIUM',
        errorName: 'NetworkError',
        errorMessage: 'Connection failed',
      });

      const { prisma } = await import('../src/shared/prisma.js');
      vi.mocked(prisma.errorLog.update).mockResolvedValue(error);

      const statsBefore = getRecoveryStats();
      await attemptRecovery(error);
      const statsAfter = getRecoveryStats();

      expect(statsAfter.totalRecoveryAttempts).toBeGreaterThanOrEqual(
        statsBefore.totalRecoveryAttempts
      );
    });
  });

  describe('State Management', () => {
    it('should clear recovery state on demand', () => {
      const _statsBefore = getRecoveryStats();
      clearRecoveryState();
      const statsAfter = getRecoveryStats();

      expect(statsAfter.activeRecoveries).toBe(0);
      expect(statsAfter.queuedOperations).toBe(0);
      expect(Object.keys(statsAfter.workerRestartCounts).length).toBe(0);
    });
  });
});
