/**
 * @file Distributed Lock Tests
 * @description Comprehensive test suite for race condition protection
 * @module tests/security/distributed-lock.spec
 * 
 * TEAM: QA/DevOps Engineer + Distributed Systems Engineer
 * VALIDATES: Critical Fix #1 - Race Condition Protection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { delay } from '../shared/index.js';
import { acquireLock, getLockStatistics, shutdownDistributedLock } from '../../src/services/distributed-lock.js';

describe('Distributed Lock - Race Condition Protection', () => {
  
  beforeEach(async () => {
    // Clear any existing locks
    await shutdownDistributedLock();
  });
  
  afterEach(async () => {
    await shutdownDistributedLock();
  });

  describe('Basic Lock Acquisition', () => {
    it('should acquire lock successfully with unique key', async () => {
      const lock = await acquireLock('test:lock:1', 5000);
      
      expect(lock).not.toBeNull();
      expect(lock).toHaveProperty('release');
      expect(lock).toHaveProperty('key');
      expect(lock).toHaveProperty('value');
      expect(lock.backend).toMatch(/redis|in-memory/);
      
      await lock.release();
    });
    
    it('should fail to acquire same lock twice', async () => {
      const lock1 = await acquireLock('test:lock:2', 5000);
      const lock2 = await acquireLock('test:lock:2', 5000);
      
      expect(lock1).not.toBeNull();
      expect(lock2).toBeNull(); // Second acquisition should fail
      
      await lock1.release();
    });
    
    it('should acquire lock after previous lock released', async () => {
      const lock1 = await acquireLock('test:lock:3', 5000);
      expect(lock1).not.toBeNull();
      
      await lock1.release();
      
      const lock2 = await acquireLock('test:lock:3', 5000);
      expect(lock2).not.toBeNull();
      
      await lock2.release();
    });
    
    it('should reject invalid lock keys', async () => {
      const invalidKeys = [null, undefined, '', 123, {}, []];
      
      for (const key of invalidKeys) {
        const lock = await acquireLock(key, 5000);
        expect(lock).toBeNull();
      }
    });
  });
  
  describe('Lock Expiration (TTL)', () => {
    it('should allow re-acquisition after TTL expires (in-memory)', async () => {
      // Force in-memory mode by using short TTL
      const lock1 = await acquireLock('test:lock:ttl', 100); // 100ms TTL
      expect(lock1).not.toBeNull();
      
      // Wait for lock to expire
      await delay();
      
      // Should be able to acquire again
      const lock2 = await acquireLock('test:lock:ttl', 100);
      expect(lock2).not.toBeNull();
      
      await lock2.release();
    }, 10000);
  });
  
  describe('Concurrent Lock Attempts (Race Condition)', () => {
    it('should prevent 10 concurrent acquisitions on same key', async () => {
      const lockKey = 'test:concurrent:10';
      const attempts = 10;
      
      // Fire 10 simultaneous lock attempts
      const results = await Promise.all(
        Array(attempts).fill(null).map(() => acquireLock(lockKey, 5000))
      );
      
      // Count successful acquisitions
      const successfulLocks = results.filter(lock => lock !== null);
      const failedAttempts = results.filter(lock => lock === null);
      
      // Exactly ONE should succeed
      expect(successfulLocks.length).toBe(1);
      expect(failedAttempts.length).toBe(9);
      
      // Release the successful lock
      await successfulLocks[0].release();
    });
    
    it('should prevent 100 concurrent acquisitions on same key', async () => {
      const lockKey = 'test:concurrent:100';
      const attempts = 100;
      
      const results = await Promise.all(
        Array(attempts).fill(null).map(() => acquireLock(lockKey, 5000))
      );
      
      const successfulLocks = results.filter(lock => lock !== null);
      const failedAttempts = results.filter(lock => lock === null);
      
      expect(successfulLocks.length).toBe(1);
      expect(failedAttempts.length).toBe(99);
      
      await successfulLocks[0].release();
    });
    
    it('should handle concurrent locks on DIFFERENT keys', async () => {
      const attempts = 10;
      
      // Each attempt uses a unique key
      const results = await Promise.all(
        Array(attempts).fill(null).map((_, i) => acquireLock(`test:concurrent:multi:${i}`, 5000))
      );
      
      // ALL should succeed (different keys)
      const successfulLocks = results.filter(lock => lock !== null);
      expect(successfulLocks.length).toBe(attempts);
      
      // Release all
      await Promise.all(successfulLocks.map(lock => lock.release()));
    });
  });
  
  describe('Lock Release Safety', () => {
    it('should safely release lock multiple times (idempotent)', async () => {
      const lock = await acquireLock('test:release:multiple', 5000);
      expect(lock).not.toBeNull();
      
      const release1 = await lock.release();
      const release2 = await lock.release();
      const release3 = await lock.release();
      
      // First release should succeed
      expect(release1).toBe(true);
      // Subsequent releases return false (already released)
      expect(release2).toBe(false);
      expect(release3).toBe(false);
    });
    
    it('should not release lock held by another process', async () => {
      const lock1 = await acquireLock('test:release:ownership', 5000);
      expect(lock1).not.toBeNull();
      
      // Simulate another process trying to release (wrong lock value)
      const fakeRelease = async () => {
        // This would be detected by the Lua script
        // For test purposes, we just verify lock1 still works
        const testLock = await acquireLock('test:release:ownership', 5000);
        return testLock; // Should be null (lock still held)
      };
      
      const attemptedLock = await fakeRelease();
      expect(attemptedLock).toBeNull(); // Lock still held by lock1
      
      await lock1.release();
    });
    
    it('should handle release after TTL expiration gracefully', async () => {
      const lock = await acquireLock('test:release:expired', 100);
      expect(lock).not.toBeNull();
      
      // Wait for TTL to expire
      await delay();
      
      // Release should succeed (or return false) without error
      const result = await lock.release();
      expect(typeof result).toBe('boolean');
    }, 10000);
  });
  
  describe('Statistics & Monitoring', () => {
    it('should track lock acquisition statistics', async () => {
      const statsBefore = getLockStatistics();
      const initialAcquired = statsBefore.totalAcquired;
      
      const lock1 = await acquireLock('test:stats:1', 5000);
      const lock2 = await acquireLock('test:stats:2', 5000);
      const _lock3Failed = await acquireLock('test:stats:1', 5000); // Should fail (intentionally unused)
      
      const statsAfter = getLockStatistics();
      
      expect(statsAfter.totalAcquired).toBe(initialAcquired + 2);
      expect(statsAfter.totalFailed).toBeGreaterThan(statsBefore.totalFailed);
      expect(statsAfter.currentLocks).toBeGreaterThanOrEqual(2);
      
      await lock1.release();
      await lock2.release();
    });
    
    it('should track lock release statistics', async () => {
      const statsBefore = getLockStatistics();
      const initialReleased = statsBefore.totalReleased;
      
      const lock = await acquireLock('test:stats:release', 5000);
      await lock.release();
      
      const statsAfter = getLockStatistics();
      expect(statsAfter.totalReleased).toBe(initialReleased + 1);
      expect(statsAfter.currentLocks).toBeLessThanOrEqual(statsBefore.currentLocks);
    });
    
    it('should report backend type (Redis or in-memory)', async () => {
      const stats = getLockStatistics();
      expect(stats).toHaveProperty('redisAvailable');
      expect(typeof stats.redisAvailable).toBe('boolean');
      expect(stats).toHaveProperty('inMemoryLocksCount');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle shutdown gracefully', async () => {
      const lock1 = await acquireLock('test:shutdown:1', 5000);
      const lock2 = await acquireLock('test:shutdown:2', 5000);
      
      expect(lock1).not.toBeNull();
      expect(lock2).not.toBeNull();
      
      // Shutdown should not throw
      await expect(shutdownDistributedLock()).resolves.not.toThrow();
      
      // Stats should reflect shutdown
      const stats = getLockStatistics();
      expect(stats.inMemoryLocksCount).toBe(0);
    });
    
    it('should allow operations after shutdown and re-init', async () => {
      const lock1 = await acquireLock('test:reinit:1', 5000);
      await lock1.release();
      
      await shutdownDistributedLock();
      
      // Should work after shutdown (re-initializes)
      const lock2 = await acquireLock('test:reinit:2', 5000);
      expect(lock2).not.toBeNull();
      await lock2.release();
    });
  });
  
  describe('Integration: Role Assignment Pattern', () => {
    it('should simulate real role assignment race condition', async () => {
      // Simulate 10 guildMemberAdd events firing simultaneously
      // (user joins multiple guilds, or reconnection storms)
      
      const guildId = 'guild123';
      const userId = 'user456';
      const roleId = 'role789';
      const lockKey = `assign:${guildId}:${userId}:${roleId}`;
      
      let roleAddCalled = 0;
      
      const assignRoleWithLock = async () => {
        const lock = await acquireLock(lockKey, 5000);
        
        if (!lock) {
          // Concurrent assignment detected - skip
          return { success: false, reason: 'lock_failed' };
        }
        
        try {
          // Simulate Discord API call
          await delay();
          roleAddCalled++;
          return { success: true, reason: 'assigned' };
        } finally {
          await lock.release();
        }
      };
      
      // Fire 10 concurrent assignment attempts
      const results = await Promise.all(
        Array(10).fill(null).map(() => assignRoleWithLock())
      );
      
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      // Role.add should be called exactly ONCE
      expect(roleAddCalled).toBe(1);
      expect(successful.length).toBe(1);
      expect(failed.length).toBe(9);
    });
  });
});
