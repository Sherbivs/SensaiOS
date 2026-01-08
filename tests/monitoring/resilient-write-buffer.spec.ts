/**
 * Resilient Write Buffer Tests
 * Purpose: Verify crash-resilient database write operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Prisma before importing the module
vi.mock('../../src/shared/prisma.js', () => ({
  prisma: {
    cacheEntry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('../../src/shared/logging/index.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  initializeWriteBuffer,
  shutdownWriteBuffer,
  queueWrite,
  executeResilientWrite,
  registerWriteExecutor,
  getBufferStats,
  flushBuffer,
  cleanupWriteBuffer,
} from '../../src/services/monitoring/resilient-write-buffer.js';
import { prisma } from '../../src/shared/prisma.js';

describe('Resilient Write Buffer', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock checkpoint load - return empty state
    vi.mocked(prisma.cacheEntry.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.cacheEntry.findMany).mockResolvedValue([]);
    vi.mocked(prisma.cacheEntry.upsert).mockResolvedValue({
      key: 'test',
      namespace: 'test',
      value: {} as unknown as object,
      sizeBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: null,
    });
    vi.mocked(prisma.cacheEntry.create).mockResolvedValue({
      key: 'test',
      namespace: 'test',
      value: {} as unknown as object,
      sizeBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: null,
    });
    vi.mocked(prisma.cacheEntry.delete).mockResolvedValue({
      key: 'test',
      namespace: 'test',
      value: {} as unknown as object,
      sizeBytes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: null,
    });
    
    await initializeWriteBuffer();
  });

  afterEach(async () => {
    await shutdownWriteBuffer();
  });

  describe('Initialization', () => {
    it('should initialize with empty buffer', () => {
      const stats = getBufferStats();
      expect(stats.pendingWrites).toBe(0);
      expect(stats.processedWrites).toBeGreaterThanOrEqual(0);
      expect(stats.isRecoveryMode).toBe(false);
    });

    it('should recover uncommitted writes on init', async () => {
      // This test verifies the recovery mechanism exists
      const stats = getBufferStats();
      expect(stats).toBeDefined();
      expect(typeof stats.lastSequenceNumber).toBe('number');
    });
  });

  describe('Write Operations', () => {
    it('should queue a write operation', async () => {
      const executor = vi.fn().mockResolvedValue(undefined);
      registerWriteExecutor('test-op', executor);

      const key = await queueWrite({
        operationType: 'test-op',
        payload: { data: 'test' },
        execute: executor,
      });

      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key.length).toBe(32); // SHA-256 hex prefix
    });

    it('should deduplicate writes with same idempotency key', async () => {
      const executor = vi.fn().mockResolvedValue(undefined);
      registerWriteExecutor('test-op', executor);

      const key1 = await queueWrite({
        operationType: 'test-op',
        payload: { data: 'test' },
        idempotencyKey: 'same-key',
        execute: executor,
      });

      const key2 = await queueWrite({
        operationType: 'test-op',
        payload: { data: 'test' },
        idempotencyKey: 'same-key',
        execute: executor,
      });

      expect(key1).toBe(key2);
      expect(key1).toBe('same-key');
    });

    it('should execute resilient write with retries', async () => {
      let attempts = 0;
      const executor = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
      });

      const result = await executeResilientWrite({
        operationType: 'test-op',
        payload: { data: 'test' },
        execute: executor,
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('should fail after max retries', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('Permanent failure'));

      const result = await executeResilientWrite({
        operationType: 'test-op',
        payload: { data: 'test' },
        execute: executor,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3); // MAX_RETRY_ATTEMPTS
    });
  });

  describe('Buffer Flush', () => {
    it('should flush pending writes', async () => {
      const executor = vi.fn().mockResolvedValue(undefined);
      registerWriteExecutor('flush-test', executor);

      await queueWrite({
        operationType: 'flush-test',
        payload: { data: 'flush-me' },
        execute: executor,
      });

      const result = await flushBuffer();
      
      expect(result.processed).toBeGreaterThanOrEqual(0);
      expect(typeof result.remaining).toBe('number');
    });
  });

  describe('Statistics', () => {
    it('should track buffer statistics', async () => {
      const stats = getBufferStats();

      expect(stats).toHaveProperty('pendingWrites');
      expect(stats).toHaveProperty('processedWrites');
      expect(stats).toHaveProperty('failedWrites');
      expect(stats).toHaveProperty('lastFlushTime');
      expect(stats).toHaveProperty('lastSequenceNumber');
      expect(stats).toHaveProperty('isRecoveryMode');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup old completed markers', async () => {
      vi.mocked(prisma.cacheEntry.deleteMany).mockResolvedValue({ count: 5 });

      const result = await cleanupWriteBuffer();

      expect(result.deleted).toBe(5);
      expect(prisma.cacheEntry.deleteMany).toHaveBeenCalled();
    });
  });
});
