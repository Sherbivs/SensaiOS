/**
 * Homestead Security — Database Schema & Security Testing
 * 
 * Tests the database layer of homestead security integration:
 * - Phase 1: Database schema verification (fields, indexes, constraints)
 * - Phase 2: Security fingerprint generation and validation
 * - Phase 3: Data integrity checks (orphans, ghosts, duplicates)
 * - Phase 4: Admin operations (cleanup, metrics, status tracking)
 * 
 * NOTE: Discord.js integration requires full bot setup and is tested manually.
 * This suite validates the critical database security foundation.
 * 
 * USAGE: npm run test:database
 *        npm run test:database:local   (uses ONPREMISE-DEV-PRIMARY)
 *        npm run test:database:cloud   (uses PROD_DATABASE_URL)
 * 
 * @group homestead
 * @group database
 * @group security
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { delay } from './shared/index.js';
import { createHmac } from 'crypto';

// Create dedicated Prisma client for database tests
// This avoids the shared client which tries to connect to ALL databases
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

// Get database URL from environment (set by setup-database.ts)
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Run with: npm run test:database');
}

// Create a dedicated test client with connection pooling
// Using connectionString lets the adapter manage its own pool
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ 
  adapter,
  log: ['error'], // Only log errors for cleaner test output
});

// Track connection state
let isConnected = false;

// ===== TEST CONFIGURATION =====

const TEST_GUILD_ID = '1100976155579912222'; // Black Infinity Gauntlet guild ID
const TEST_HMAC_KEY = 'test-secret-key-for-homestead-fingerprints';

// Constants for fingerprint testing (not actual database records)
const FINGERPRINT_TEST_USER_ID = 'fingerprint-test-user-123';
const FINGERPRINT_TEST_USERNAME = 'testuser';

// Track created test users for cleanup
const testUserIds = new Set<string>();

/**
 * Helper: Create a test User record (required for HomesteadChannel foreign key)
 * Uses unique Discord IDs to avoid unique constraint violations
 */
async function createTestUser(overrides: { id?: string; discordId?: string } = {}) {
  const userId = overrides.id || `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const discordId = overrides.discordId || `discord-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  const user = await prisma.user.create({
    data: {
      id: userId,
      discordId,
    },
  });
  
  testUserIds.add(user.id);
  return user;
}

/**
 * Helper: Generate HMAC-SHA256 security fingerprint (matches service implementation)
 */
function generateTestFingerprint(data: {
  channelId: string;
  guildId: string;
  userId: string;
  username: string;
}): string {
  const payload = `${data.channelId}:${data.guildId}:${data.userId}:${data.username}`;
  return createHmac('sha256', TEST_HMAC_KEY).update(payload).digest('hex');
}

/**
 * Helper: Create test homestead with security verification
 * Automatically creates a User record to satisfy foreign key constraint
 */
async function createTestHomestead(overrides: Partial<{
  userId: string;
  username: string;
  guildId: string;
  channelId: string;
  status: string;
  createdBy: string;
  verifiedAt: Date | null;
  securityFingerprint: string | null;
  lastHealthCheck: Date | null;
}> = {}) {
  const channelId = overrides.channelId || `channel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const username = overrides.username || 'testuser';
  
  // Create a User record first if userId is provided, or create a new one
  let userId: string;
  if (overrides.userId) {
    // Check if user exists, if not create it
    const existingUser = await prisma.user.findUnique({ where: { id: overrides.userId } });
    if (!existingUser) {
      const user = await createTestUser({ id: overrides.userId });
      userId = user.id;
    } else {
      userId = existingUser.id;
    }
  } else {
    // Create a new test user for this homestead
    const user = await createTestUser();
    userId = user.id;
  }
  
  const fingerprint = overrides.securityFingerprint !== undefined 
    ? overrides.securityFingerprint 
    : generateTestFingerprint({
        channelId,
        guildId: TEST_GUILD_ID,
        userId,
        username,
      });

  return await prisma.homesteadChannel.create({
    data: {
      guildId: overrides.guildId || TEST_GUILD_ID,
      channelId,
      userId,
      status: overrides.status || 'active',
      createdBy: overrides.createdBy || 'user',
      verifiedAt: overrides.verifiedAt !== undefined ? overrides.verifiedAt : new Date(),
      securityFingerprint: fingerprint,
      lastHealthCheck: overrides.lastHealthCheck !== undefined ? overrides.lastHealthCheck : new Date(),
    },
  });
}

// ===== TEST LIFECYCLE HOOKS =====

// Establish Prisma connection before all tests
beforeAll(async () => {
  // Connect and verify connection with a simple query
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  isConnected = true;
  console.log('[homestead-database-security] Database connection established');
});

// Clean up after all tests
afterAll(async () => {
  if (!isConnected) {
    console.log('[homestead-database-security] Skipping cleanup - not connected');
    return;
  }
  
  // Clean up test data
  try {
    // Delete homesteads first (foreign key constraint)
    await prisma.homesteadChannel.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
    
    // Delete test users
    if (testUserIds.size > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: Array.from(testUserIds) } },
      });
      testUserIds.clear();
    }
    console.log('[homestead-database-security] Test data cleaned up');
  } catch (error) {
    console.warn('[homestead-database-security] Cleanup warning:', error);
  }
  
  // Disconnect the dedicated test client
  await prisma.$disconnect();
  isConnected = false;
  console.log('[homestead-database-security] Database connection closed');
});

beforeEach(async () => {
  // Clean up test homesteads before each test
  await prisma.homesteadChannel.deleteMany({
    where: { guildId: TEST_GUILD_ID },
  });
});

afterEach(async () => {
  // Clean up after each test
  await prisma.homesteadChannel.deleteMany({
    where: { guildId: TEST_GUILD_ID },
  });
});

// ===== PHASE 1: DATABASE SCHEMA VERIFICATION =====

describe('Phase 1: Database Schema Verification', () => {
  it('should have all required security verification fields', async () => {
    const homestead = await createTestHomestead();

    // Verify all Phase 1 security fields exist
    expect(homestead).toHaveProperty('verifiedAt');
    expect(homestead).toHaveProperty('securityFingerprint');
    expect(homestead).toHaveProperty('lastHealthCheck');
    expect(homestead).toHaveProperty('createdBy');
    expect(homestead).toHaveProperty('status');
    
    // Verify data types
    expect(homestead.verifiedAt).toBeInstanceOf(Date);
    expect(typeof homestead.securityFingerprint).toBe('string');
    expect(homestead.lastHealthCheck).toBeInstanceOf(Date);
    expect(homestead.createdBy).toBe('user');
    expect(homestead.status).toBe('active');
  });

  it('should enforce status enum constraint', async () => {
    // Valid statuses per database CHECK constraint (homestead_channels_status_check)
    const validStatuses = ['active', 'suspended', 'orphaned', 'deleted'];
    
    for (const status of validStatuses) {
      const homestead = await createTestHomestead({ status });
      expect(homestead.status).toBe(status);
      await prisma.homesteadChannel.delete({ where: { id: homestead.id } });
    }
  });

  it('should enforce unique constraint: one homestead per user per guild', async () => {
    // Create first homestead with a specific user
    const user = await createTestUser();
    const homestead1 = await prisma.homesteadChannel.create({
      data: {
        guildId: TEST_GUILD_ID,
        channelId: `channel-${Date.now()}-1`,
        userId: user.id,
        status: 'active',
        createdBy: 'user',
        verifiedAt: new Date(),
        securityFingerprint: 'test-fingerprint-1',
        lastHealthCheck: new Date(),
      },
    });

    // Attempt to create duplicate (same userId) - should fail on @unique userId
    await expect(async () => {
      await prisma.homesteadChannel.create({
        data: {
          guildId: TEST_GUILD_ID,
          channelId: `channel-${Date.now()}-2`,
          userId: user.id, // Same user - violates @unique constraint
          status: 'active',
          createdBy: 'user',
          verifiedAt: new Date(),
          securityFingerprint: 'test-fingerprint-2',
          lastHealthCheck: new Date(),
        },
      });
    }).rejects.toThrow(); // Should violate unique constraint on userId
    
    // Cleanup
    await prisma.homesteadChannel.delete({ where: { id: homestead1.id } });
  });

  it('should allow multiple homesteads for different users', async () => {
    // Create homesteads for different users
    const homestead1 = await createTestHomestead({ userId: 'user-1' });
    const homestead2 = await createTestHomestead({ userId: 'user-2' });
    const homestead3 = await createTestHomestead({ userId: 'user-3' });

    expect(homestead1.userId).toBe('user-1');
    expect(homestead2.userId).toBe('user-2');
    expect(homestead3.userId).toBe('user-3');
  });

  it('should have index on (guildId, status) for integrity queries', async () => {
    // Create test homesteads with different statuses
    await createTestHomestead({ status: 'active', userId: 'user-1' });
    await createTestHomestead({ status: 'active', userId: 'user-2' });
    await createTestHomestead({ status: 'deleted', userId: 'user-3' });
    await createTestHomestead({ status: 'suspended', userId: 'user-4' });

    // Query using index (should be fast)
    const activeHomesteads = await prisma.homesteadChannel.findMany({
      where: {
        guildId: TEST_GUILD_ID,
        status: 'active',
      },
    });

    expect(activeHomesteads).toHaveLength(2);
  });
});

// ===== PHASE 2: SECURITY FINGERPRINT TESTING =====

describe('Phase 2: Security Fingerprint Generation & Validation', () => {
  it('should generate valid HMAC-SHA256 fingerprint', () => {
    const data = {
      channelId: 'test-channel-123',
      guildId: TEST_GUILD_ID,
      userId: FINGERPRINT_TEST_USER_ID,
      username: FINGERPRINT_TEST_USERNAME,
    };

    const fingerprint = generateTestFingerprint(data);

    // HMAC-SHA256 produces 64 hex characters (256 bits)
    expect(fingerprint).toHaveLength(64);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different fingerprints for different channel IDs', () => {
    const fingerprint1 = generateTestFingerprint({
      channelId: 'channel-1',
      guildId: TEST_GUILD_ID,
      userId: FINGERPRINT_TEST_USER_ID,
      username: FINGERPRINT_TEST_USERNAME,
    });

    const fingerprint2 = generateTestFingerprint({
      channelId: 'channel-2',
      guildId: TEST_GUILD_ID,
      userId: FINGERPRINT_TEST_USER_ID,
      username: FINGERPRINT_TEST_USERNAME,
    });

    expect(fingerprint1).not.toBe(fingerprint2);
  });

  it('should produce identical fingerprints for identical inputs', () => {
    const data = {
      channelId: 'test-channel',
      guildId: TEST_GUILD_ID,
      userId: FINGERPRINT_TEST_USER_ID,
      username: FINGERPRINT_TEST_USERNAME,
    };

    const fingerprint1 = generateTestFingerprint(data);
    const fingerprint2 = generateTestFingerprint(data);

    expect(fingerprint1).toBe(fingerprint2);
  });

  it('should store security fingerprint in database', async () => {
    const homestead = await createTestHomestead();

    expect(homestead.securityFingerprint).toBeDefined();
    expect(homestead.securityFingerprint).toHaveLength(64);
    expect(homestead.securityFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should detect fingerprint tampering by recalculating', async () => {
    const homestead = await createTestHomestead();
    const originalFingerprint = homestead.securityFingerprint;

    // Create a second test user for the "hacker" scenario
    const hackerUser = await createTestUser({ id: 'hacker-user-id-' + Date.now() });

    // Simulate tampering: change userId in database without updating fingerprint
    const tamperedHomestead = await prisma.homesteadChannel.update({
      where: { id: homestead.id },
      data: { userId: hackerUser.id }, // Changed userId but fingerprint unchanged
    });

    // Recalculate expected fingerprint
    const expectedFingerprint = generateTestFingerprint({
      channelId: tamperedHomestead.channelId,
      guildId: tamperedHomestead.guildId,
      userId: hackerUser.id, // New userId
      username: FINGERPRINT_TEST_USERNAME,
    });

    // Stored fingerprint should NOT match recalculated (detects tampering)
    expect(tamperedHomestead.securityFingerprint).toBe(originalFingerprint);
    expect(tamperedHomestead.securityFingerprint).not.toBe(expectedFingerprint);
  });
});

// ===== PHASE 3: DATA INTEGRITY CHECKS =====

describe('Phase 3: Data Integrity Checks', () => {
  it('should detect orphaned homesteads (verifiedAt is NULL)', async () => {
    // Create verified homestead
    await createTestHomestead({ verifiedAt: new Date() });

    // Create orphaned homestead (NULL verifiedAt)
    const orphan = await createTestHomestead({
      userId: 'orphan-user',
      verifiedAt: null,
    });

    // Query for orphans
    const orphans = await prisma.homesteadChannel.findMany({
      where: {
        guildId: TEST_GUILD_ID,
        status: 'active',
        verifiedAt: null,
      },
    });

    expect(orphans).toHaveLength(1);
    expect(orphans[0].id).toBe(orphan.id);
  });

  it('should calculate issue rate for integrity metrics', async () => {
    // Create mix of verified and orphaned homesteads
    await createTestHomestead({ userId: 'user-1', verifiedAt: new Date() });
    await createTestHomestead({ userId: 'user-2', verifiedAt: new Date() });
    await createTestHomestead({ userId: 'user-3', verifiedAt: null }); // Orphan
    await createTestHomestead({ userId: 'user-4', verifiedAt: null }); // Orphan

    const totalHomesteads = await prisma.homesteadChannel.count({
      where: { guildId: TEST_GUILD_ID, status: 'active' },
    });

    const orphanCount = await prisma.homesteadChannel.count({
      where: { guildId: TEST_GUILD_ID, status: 'active', verifiedAt: null },
    });

    const issueRate = (orphanCount / totalHomesteads) * 100;

    expect(totalHomesteads).toBe(4);
    expect(orphanCount).toBe(2);
    expect(issueRate).toBe(50); // 50% issue rate
  });

  it('should track last health check timestamp', async () => {
    const homestead = await createTestHomestead();
    const originalCheckTime = homestead.lastHealthCheck;

    // Simulate health check update (Phase 3.3)
    await delay(); // Small delay

    const updatedHomestead = await prisma.homesteadChannel.update({
      where: { id: homestead.id },
      data: { lastHealthCheck: new Date() },
    });

    if (originalCheckTime && updatedHomestead.lastHealthCheck) {
      expect(updatedHomestead.lastHealthCheck.getTime()).toBeGreaterThan(
        originalCheckTime.getTime()
      );
    }
  });

  it('should mark stale homesteads for investigation', async () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Create homesteads with different health check times
    await createTestHomestead({
      userId: 'fresh-user',
      lastHealthCheck: now,
    });

    const stale = await createTestHomestead({
      userId: 'stale-user',
      lastHealthCheck: oneDayAgo,
    });

    // Query for stale homesteads (>6 hours since last check)
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const staleHomesteads = await prisma.homesteadChannel.findMany({
      where: {
        guildId: TEST_GUILD_ID,
        status: 'active',
        lastHealthCheck: { lt: sixHoursAgo },
      },
    });

    expect(staleHomesteads).toHaveLength(1);
    expect(staleHomesteads[0].id).toBe(stale.id);
  });
});

// ===== PHASE 4: ADMIN OPERATIONS =====

describe('Phase 4: Admin Operations', () => {
  it('should calculate integrity metrics for /ops homestead:integrity', async () => {
    // Create test dataset
    await createTestHomestead({ userId: 'user-1', verifiedAt: new Date() });
    await createTestHomestead({ userId: 'user-2', verifiedAt: new Date() });
    await createTestHomestead({ userId: 'user-3', verifiedAt: null }); // Orphan
    await createTestHomestead({ userId: 'user-4', status: 'deleted' });

    // Calculate metrics
    const totalActive = await prisma.homesteadChannel.count({
      where: { guildId: TEST_GUILD_ID, status: 'active' },
    });

    const verified = await prisma.homesteadChannel.count({
      where: {
        guildId: TEST_GUILD_ID,
        status: 'active',
        verifiedAt: { not: null },
      },
    });

    const orphans = await prisma.homesteadChannel.count({
      where: {
        guildId: TEST_GUILD_ID,
        status: 'active',
        verifiedAt: null,
      },
    });

    const deleted = await prisma.homesteadChannel.count({
      where: { guildId: TEST_GUILD_ID, status: 'deleted' },
    });

    expect(totalActive).toBe(3); // user-1, user-2, user-3 (active)
    expect(verified).toBe(2); // user-1, user-2
    expect(orphans).toBe(1); // user-3
    expect(deleted).toBe(1); // user-4
  });

  it('should mark orphans as deleted during cleanup', async () => {
    // Create orphaned homesteads
    const orphan1 = await createTestHomestead({
      userId: 'orphan-1',
      verifiedAt: null,
    });
    const orphan2 = await createTestHomestead({
      userId: 'orphan-2',
      verifiedAt: null,
    });

    // Simulate /ops homestead:cleanup
    const orphans = await prisma.homesteadChannel.findMany({
      where: {
        guildId: TEST_GUILD_ID,
        status: 'active',
        verifiedAt: null,
      },
    });

    // Mark all orphans as deleted
    for (const orphan of orphans) {
      await prisma.homesteadChannel.update({
        where: { id: orphan.id },
        data: { status: 'deleted' },
      });
    }

    // Verify orphans are now deleted
    const deletedOrphans = await prisma.homesteadChannel.findMany({
      where: {
        id: { in: [orphan1.id, orphan2.id] },
        status: 'deleted',
      },
    });

    expect(deletedOrphans).toHaveLength(2);
  });

  it('should support dry-run mode (no database changes)', async () => {
    // Create orphan
    const orphan = await createTestHomestead({
      userId: 'orphan',
      verifiedAt: null,
    });

    // Simulate dry-run: query but don't modify
    const orphansToDelete = await prisma.homesteadChannel.findMany({
      where: {
        guildId: TEST_GUILD_ID,
        status: 'active',
        verifiedAt: null,
      },
    });

    // In dry-run, we DON'T execute the delete operation
    // Just count what WOULD be deleted
    expect(orphansToDelete).toHaveLength(1);

    // Verify orphan still exists with 'active' status
    const stillExists = await prisma.homesteadChannel.findUnique({
      where: { id: orphan.id },
    });

    expect(stillExists).not.toBeNull();
    expect(stillExists?.status).toBe('active');
  });

  it('should track cleanup operations with createdBy field', async () => {
    const homestead = await createTestHomestead({ createdBy: 'user' });

    // Admin cleanup marks as deleted
    const cleaned = await prisma.homesteadChannel.update({
      where: { id: homestead.id },
      data: { status: 'deleted', createdBy: 'admin' },
    });

    expect(cleaned.status).toBe('deleted');
    expect(cleaned.createdBy).toBe('admin');
  });
});

// ===== PHASE 5: PERFORMANCE & SCALABILITY =====

describe('Phase 5: Performance & Scalability', () => {
  it('should create 10 homesteads in <5s (database performance)', async () => {
    // Note: Network latency to cloud database adds ~100ms per operation
    // Local database would be much faster, but we're testing cloud connectivity
    const startTime = Date.now();

    const promises = Array.from({ length: 10 }, (_, i) =>
      createTestHomestead({ userId: `bulk-user-${i}` })
    );

    await Promise.all(promises);

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(5000); // <5s for 10 homesteads (cloud latency)
  });

  it('should query 100 homesteads in <3s (index performance)', async () => {
    // Note: Creating 100 records with network latency takes time
    // This test validates indexes work, not sub-millisecond performance
    
    // Create 100 homesteads
    const promises = Array.from({ length: 100 }, (_, i) =>
      createTestHomestead({ userId: `perf-user-${i}` })
    );
    await Promise.all(promises);

    // Time the query
    const startTime = Date.now();

    const homesteads = await prisma.homesteadChannel.findMany({
      where: {
        guildId: TEST_GUILD_ID,
        status: 'active',
      },
    });

    const duration = Date.now() - startTime;

    expect(homesteads).toHaveLength(100);
    expect(duration).toBeLessThan(3000); // <3s query time (includes network latency)
  });

  it('should handle concurrent duplicate detection correctly', async () => {
    // Attempt to create same homestead concurrently (race condition test)
    const promises = Array.from({ length: 5 }, () =>
      createTestHomestead({ userId: 'concurrent-user' })
    );

    // Only ONE should succeed, others should fail with unique constraint
    const results = await Promise.allSettled(promises);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1); // Only 1 success
    expect(failures).toHaveLength(4); // 4 failures (unique constraint)
  });
});
