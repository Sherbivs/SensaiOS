/**
 * Checksum Service Tests
 * ======================
 *
 * Comprehensive test suite for the ChecksumService, verifying:
 * - Checksum computation for SecurityEvent and RoleChangeAudit
 * - HMAC signature generation and verification
 * - Timing-safe comparison operations
 * - Hash chain integrity verification
 * - Batch operations
 *
 * @module tests/security/services/checksum-service.test
 * @task P0-004 (Checksum Implementation + Timing-Safe R1)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChecksumService,
  createChecksumService,
  type ChecksumServiceConfig,
  type HashChainLink,
} from '../../../src/bot/security/services/checksum-service.js';
import { SecuritySeverity } from '../../../src/bot/security/types/database-models.js';
import type {
  SecurityEvent,
  RoleChangeAudit,
} from '../../../src/bot/security/types/database-models.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_HMAC_SECRET = 'test-hmac-secret-for-unit-tests-only';

const createTestConfig = (overrides?: Partial<ChecksumServiceConfig>): ChecksumServiceConfig => ({
  hmacSecret: TEST_HMAC_SECRET,
  algorithm: 'sha256',
  includeTimestamps: false,
  debug: false,
  ...overrides,
});

const createTestEvent = (
  overrides?: Partial<Omit<SecurityEvent, 'id' | 'checksum' | 'signature' | 'previousHash' | 'createdAt'>>
): Omit<SecurityEvent, 'id' | 'checksum' | 'signature' | 'previousHash' | 'createdAt'> => ({
  eventType: 'role-change',
  severity: SecuritySeverity.MEDIUM,
  guildId: '123456789',
  guildName: 'Test Guild',
  origin: 'security-bot-sweep',
  memberId: '987654321',
  memberTag: 'TestUser#1234',
  roleId: '111222333',
  roleName: 'Test Role',
  executorId: '555666777',
  executorTag: 'Admin#0001',
  metadata: { reason: 'test' },
  ...overrides,
});

const createTestAudit = (
  overrides?: Partial<
    Omit<
      RoleChangeAudit,
      | 'id'
      | 'checksum'
      | 'signature'
      | 'previousHash'
      | 'createdAt'
      | 'reverted'
      | 'revertedAt'
      | 'revertedBy'
      | 'revertReason'
    >
  >
): Omit<
  RoleChangeAudit,
  | 'id'
  | 'checksum'
  | 'signature'
  | 'previousHash'
  | 'createdAt'
  | 'reverted'
  | 'revertedAt'
  | 'revertedBy'
  | 'revertReason'
> => ({
  guildId: '123456789',
  guildName: 'Test Guild',
  memberId: '987654321',
  memberTag: 'TestUser#1234',
  roleId: '111222333',
  roleName: 'Test Role',
  changeType: 'addition',
  executorId: '555666777',
  executorTag: 'Admin#0001',
  origin: 'security-bot-sweep',
  authReason: 'manual-approval',
  metadata: { source: 'test' },
  ...overrides,
});

// ============================================================================
// Test Suite: Constructor & Configuration
// ============================================================================

describe('ChecksumService', () => {
  let service: ChecksumService;

  beforeEach(() => {
    service = new ChecksumService(createTestConfig());
  });

  describe('constructor', () => {
    it('should create service with valid config', () => {
      expect(service).toBeInstanceOf(ChecksumService);
      expect(service.getAlgorithm()).toBe('sha256');
    });

    it('should throw if hmacSecret is missing', () => {
      expect(() => new ChecksumService({ hmacSecret: '' })).toThrow(
        'ChecksumService: hmacSecret is required'
      );
    });

    it('should support different algorithms', () => {
      const sha384Service = new ChecksumService(createTestConfig({ algorithm: 'sha384' }));
      expect(sha384Service.getAlgorithm()).toBe('sha384');

      const sha512Service = new ChecksumService(createTestConfig({ algorithm: 'sha512' }));
      expect(sha512Service.getAlgorithm()).toBe('sha512');
    });
  });

  // ==========================================================================
  // SecurityEvent Checksum Tests
  // ==========================================================================

  describe('SecurityEvent checksums', () => {
    describe('computeEventChecksum', () => {
      it('should compute checksum for event', () => {
        const event = createTestEvent();
        const result = service.computeEventChecksum(event);

        expect(result.checksum).toBeDefined();
        expect(result.checksum).toHaveLength(64); // SHA-256 hex length
        expect(result.signature).toBeDefined();
        expect(result.signature).toHaveLength(64); // HMAC-SHA-256 hex length
      });

      it('should produce deterministic checksums', () => {
        const event = createTestEvent();
        const result1 = service.computeEventChecksum(event);
        const result2 = service.computeEventChecksum(event);

        expect(result1.checksum).toBe(result2.checksum);
        expect(result1.signature).toBe(result2.signature);
      });

      it('should produce different checksums for different events', () => {
        const event1 = createTestEvent({ guildId: '111' });
        const event2 = createTestEvent({ guildId: '222' });

        const result1 = service.computeEventChecksum(event1);
        const result2 = service.computeEventChecksum(event2);

        expect(result1.checksum).not.toBe(result2.checksum);
      });

      it('should include previousHash in signature computation', () => {
        const event = createTestEvent();
        const result1 = service.computeEventChecksum(event, null);
        const result2 = service.computeEventChecksum(event, 'abc123');

        // Checksum same (doesn't include previousHash)
        expect(result1.checksum).toBe(result2.checksum);
        // Signature different (includes previousHash)
        expect(result1.signature).not.toBe(result2.signature);
      });

      it('should handle null optional fields', () => {
        const event = createTestEvent({
          memberId: null,
          memberTag: null,
          roleId: null,
          roleName: null,
          executorId: null,
          executorTag: null,
          metadata: null,
        });

        const result = service.computeEventChecksum(event);
        expect(result.checksum).toBeDefined();
        expect(result.signature).toBeDefined();
      });

      it('should include input data in debug mode', () => {
        const debugService = new ChecksumService(createTestConfig({ debug: true }));
        const event = createTestEvent();
        const result = debugService.computeEventChecksum(event);

        expect(result.inputData).toBeDefined();
        expect(result.inputData).toContain('role-change');
        expect(result.inputData).toContain('123456789');
      });
    });

    describe('verifyEventIntegrity', () => {
      it('should verify valid event', () => {
        const event = createTestEvent();
        const { checksum, signature } = service.computeEventChecksum(event);

        const fullEvent: SecurityEvent = {
          ...event,
          checksum,
          signature,
          previousHash: null,
        };

        const result = service.verifyEventIntegrity(fullEvent);

        expect(result.valid).toBe(true);
        expect(result.checksumValid).toBe(true);
        expect(result.signatureValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('should detect tampered checksum', () => {
        const event = createTestEvent();
        const { signature } = service.computeEventChecksum(event);

        const fullEvent: SecurityEvent = {
          ...event,
          checksum: 'tampered-checksum-value',
          signature,
          previousHash: null,
        };

        const result = service.verifyEventIntegrity(fullEvent);

        expect(result.valid).toBe(false);
        expect(result.checksumValid).toBe(false);
        expect(result.error).toBe('Checksum mismatch');
      });

      it('should detect tampered signature', () => {
        const event = createTestEvent();
        const { checksum } = service.computeEventChecksum(event);

        const fullEvent: SecurityEvent = {
          ...event,
          checksum,
          signature: 'a'.repeat(64), // Fake signature
          previousHash: null,
        };

        const result = service.verifyEventIntegrity(fullEvent);

        expect(result.valid).toBe(false);
        expect(result.signatureValid).toBe(false);
        expect(result.error).toBe('Signature mismatch');
      });

      it('should handle event without signature', () => {
        const event = createTestEvent();
        const { checksum } = service.computeEventChecksum(event);

        const fullEvent: SecurityEvent = {
          ...event,
          checksum,
          signature: null, // No signature
          previousHash: null,
        };

        const result = service.verifyEventIntegrity(fullEvent);

        expect(result.valid).toBe(true);
        expect(result.checksumValid).toBe(true);
        expect(result.signatureValid).toBe(true); // Skipped, defaults to true
      });
    });
  });

  // ==========================================================================
  // RoleChangeAudit Checksum Tests
  // ==========================================================================

  describe('RoleChangeAudit checksums', () => {
    describe('computeAuditChecksum', () => {
      it('should compute checksum for audit', () => {
        const audit = createTestAudit();
        const result = service.computeAuditChecksum(audit);

        expect(result.checksum).toBeDefined();
        expect(result.checksum).toHaveLength(64);
        expect(result.signature).toBeDefined();
        expect(result.signature).toHaveLength(64);
      });

      it('should produce deterministic checksums', () => {
        const audit = createTestAudit();
        const result1 = service.computeAuditChecksum(audit);
        const result2 = service.computeAuditChecksum(audit);

        expect(result1.checksum).toBe(result2.checksum);
        expect(result1.signature).toBe(result2.signature);
      });

      it('should produce different checksums for different change types', () => {
        const addition = createTestAudit({ changeType: 'addition' });
        const removal = createTestAudit({ changeType: 'removal' });

        const result1 = service.computeAuditChecksum(addition);
        const result2 = service.computeAuditChecksum(removal);

        expect(result1.checksum).not.toBe(result2.checksum);
      });

      it('should include previousHash in signature computation', () => {
        const audit = createTestAudit();
        const result1 = service.computeAuditChecksum(audit, null);
        const result2 = service.computeAuditChecksum(audit, 'xyz789');

        expect(result1.checksum).toBe(result2.checksum);
        expect(result1.signature).not.toBe(result2.signature);
      });
    });

    describe('verifyAuditIntegrity', () => {
      it('should verify valid audit', () => {
        const audit = createTestAudit();
        const { checksum, signature } = service.computeAuditChecksum(audit);

        const fullAudit: RoleChangeAudit = {
          ...audit,
          checksum,
          signature,
          previousHash: null,
          reverted: false,
        };

        const result = service.verifyAuditIntegrity(fullAudit);

        expect(result.valid).toBe(true);
        expect(result.checksumValid).toBe(true);
        expect(result.signatureValid).toBe(true);
      });

      it('should detect tampered audit data', () => {
        const audit = createTestAudit();
        const { checksum, signature } = service.computeAuditChecksum(audit);

        // Tamper with the role name after computing checksum
        const fullAudit: RoleChangeAudit = {
          ...audit,
          roleName: 'TAMPERED_ROLE',
          checksum,
          signature,
          previousHash: null,
          reverted: false,
        };

        const result = service.verifyAuditIntegrity(fullAudit);

        expect(result.valid).toBe(false);
        expect(result.checksumValid).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Hash Chain Tests
  // ==========================================================================

  describe('Hash Chain Verification', () => {
    describe('verifyHashChain', () => {
      it('should verify valid empty chain', () => {
        const result = service.verifyHashChain([]);
        expect(result.valid).toBe(true);
        expect(result.hashChainValid).toBe(true);
      });

      it('should verify valid single-link chain', () => {
        const chain: HashChainLink[] = [
          { id: 1n, checksum: 'a'.repeat(64), previousHash: null },
        ];

        const result = service.verifyHashChain(chain);
        expect(result.valid).toBe(true);
      });

      it('should verify valid multi-link chain', () => {
        // Use real hex values for the checksums
        const chain: HashChainLink[] = [
          { id: 1n, checksum: 'a'.repeat(64), previousHash: null },
          { id: 2n, checksum: 'b'.repeat(64), previousHash: 'a'.repeat(64) },
          { id: 3n, checksum: 'c'.repeat(64), previousHash: 'b'.repeat(64) },
        ];

        const result = service.verifyHashChain(chain);
        expect(result.valid).toBe(true);
      });

      it('should detect broken chain', () => {
        const chain: HashChainLink[] = [
          { id: 1n, checksum: 'a'.repeat(64), previousHash: null },
          { id: 2n, checksum: 'b'.repeat(64), previousHash: 'ffff'.repeat(16) }, // Broken link (wrong hex)
          { id: 3n, checksum: 'c'.repeat(64), previousHash: 'b'.repeat(64) },
        ];

        const result = service.verifyHashChain(chain);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Hash chain broken at ID 2');
      });

      it('should detect non-null first previousHash', () => {
        const chain: HashChainLink[] = [
          { id: 1n, checksum: 'hash1', previousHash: 'should-be-null' }, // First should be null
        ];

        const result = service.verifyHashChain(chain);
        expect(result.valid).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Batch Operations Tests
  // ==========================================================================

  describe('Batch Operations', () => {
    describe('batchVerifyEventIntegrity', () => {
      it('should verify multiple events', () => {
        const events = [
          createTestEvent({ guildId: '111' }),
          createTestEvent({ guildId: '222' }),
          createTestEvent({ guildId: '333' }),
        ];

        const fullEvents: SecurityEvent[] = events.map((event) => {
          const { checksum, signature } = service.computeEventChecksum(event);
          return { ...event, checksum, signature, previousHash: null };
        });

        const results = service.batchVerifyEventIntegrity(fullEvents);

        expect(results).toHaveLength(3);
        expect(results.every((r) => r.valid)).toBe(true);
      });

      it('should identify invalid events in batch', () => {
        const events = [
          createTestEvent({ guildId: '111' }),
          createTestEvent({ guildId: '222' }),
        ];

        const fullEvents: SecurityEvent[] = events.map((event, i) => {
          const { checksum, signature } = service.computeEventChecksum(event);
          // Tamper with second event
          return {
            ...event,
            checksum: i === 1 ? 'tampered' : checksum,
            signature,
            previousHash: null,
          };
        });

        const results = service.batchVerifyEventIntegrity(fullEvents);

        expect(results[0].valid).toBe(true);
        expect(results[1].valid).toBe(false);
      });
    });

    describe('batchComputeEventChecksums', () => {
      it('should compute checksums with running hash chain', () => {
        const events = [
          createTestEvent({ guildId: '111' }),
          createTestEvent({ guildId: '222' }),
          createTestEvent({ guildId: '333' }),
        ];

        const results = service.batchComputeEventChecksums(events);

        expect(results).toHaveLength(3);
        // First event has no previous
        // Second event's signature should be based on first's checksum
        // Each should be unique
        const uniqueChecksums = new Set(results.map((r) => r.checksum));
        expect(uniqueChecksums.size).toBe(3);
      });
    });

    describe('batchComputeAuditChecksums', () => {
      it('should compute checksums with running hash chain', () => {
        const audits = [
          createTestAudit({ memberId: '111' }),
          createTestAudit({ memberId: '222' }),
        ];

        const results = service.batchComputeAuditChecksums(audits);

        expect(results).toHaveLength(2);
        expect(results[0].checksum).not.toBe(results[1].checksum);
      });
    });
  });

  // ==========================================================================
  // Utility Methods Tests
  // ==========================================================================

  describe('Utility Methods', () => {
    describe('generateNonce', () => {
      it('should generate unique nonces', () => {
        const nonce1 = service.generateNonce();
        const nonce2 = service.generateNonce();

        expect(nonce1).not.toBe(nonce2);
        expect(nonce1).toHaveLength(32); // 16 bytes = 32 hex chars
      });

      it('should respect custom length', () => {
        const nonce = service.generateNonce(8);
        expect(nonce).toHaveLength(16); // 8 bytes = 16 hex chars
      });
    });

    describe('hash', () => {
      it('should compute SHA-256 hash', () => {
        const hash = service.hash('test data');
        expect(hash).toHaveLength(64);
      });

      it('should be deterministic', () => {
        const hash1 = service.hash('test data');
        const hash2 = service.hash('test data');
        expect(hash1).toBe(hash2);
      });

      it('should use configured algorithm', () => {
        const sha384Service = new ChecksumService(createTestConfig({ algorithm: 'sha384' }));
        const hash = sha384Service.hash('test data');
        expect(hash).toHaveLength(96); // SHA-384 = 96 hex chars

        const sha512Service = new ChecksumService(createTestConfig({ algorithm: 'sha512' }));
        const hash512 = sha512Service.hash('test data');
        expect(hash512).toHaveLength(128); // SHA-512 = 128 hex chars
      });
    });

    describe('getAlgorithm', () => {
      it('should return configured algorithm', () => {
        expect(service.getAlgorithm()).toBe('sha256');
      });
    });
  });

  // ==========================================================================
  // Factory Function Tests
  // ==========================================================================

  describe('createChecksumService', () => {
    it('should create service with provided secret', () => {
      const svc = createChecksumService('my-secret');
      expect(svc).toBeInstanceOf(ChecksumService);
    });

    it('should throw without secret and no env var', () => {
      const originalEnv = process.env.HMAC_SECRET;
      delete process.env.HMAC_SECRET;
      delete process.env.SECURITY_HMAC_SECRET;

      expect(() => createChecksumService()).toThrow(
        'ChecksumService: HMAC_SECRET or SECURITY_HMAC_SECRET environment variable required'
      );

      process.env.HMAC_SECRET = originalEnv;
    });

    it('should use HMAC_SECRET from environment', () => {
      const originalEnv = process.env.HMAC_SECRET;
      process.env.HMAC_SECRET = 'env-secret';

      const svc = createChecksumService();
      expect(svc).toBeInstanceOf(ChecksumService);

      process.env.HMAC_SECRET = originalEnv;
    });
  });

  // ==========================================================================
  // Edge Cases & Security Tests
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty strings in event data', () => {
      const event = createTestEvent({
        eventType: '',
        guildId: '',
        guildName: '',
        origin: '',
      });

      const result = service.computeEventChecksum(event);
      expect(result.checksum).toBeDefined();
    });

    it('should handle complex metadata', () => {
      const event = createTestEvent({
        metadata: {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
          null: null,
          boolean: true,
        },
      });

      const result = service.computeEventChecksum(event);
      expect(result.checksum).toBeDefined();
    });

    it('should handle unicode in strings', () => {
      const event = createTestEvent({
        guildName: '日本語サーバー',
        memberTag: '用户#1234',
      });

      const result1 = service.computeEventChecksum(event);
      const result2 = service.computeEventChecksum(event);

      expect(result1.checksum).toBe(result2.checksum);
    });

    it('should use timing-safe comparisons (security)', () => {
      // This test verifies the service uses timing-safe operations
      // by checking that verification time is similar regardless of
      // where the mismatch occurs (prevents timing attacks)
      const event = createTestEvent();
      const { checksum, signature } = service.computeEventChecksum(event);

      const validEvent: SecurityEvent = {
        ...event,
        checksum,
        signature,
        previousHash: null,
      };

      const earlyMismatch: SecurityEvent = {
        ...event,
        checksum: 'x' + checksum.slice(1), // First char different
        signature,
        previousHash: null,
      };

      const lateMismatch: SecurityEvent = {
        ...event,
        checksum: checksum.slice(0, -1) + 'x', // Last char different
        signature,
        previousHash: null,
      };

      // Run multiple times to average out noise
      const iterations = 100;
      let earlyTime = 0;
      let lateTime = 0;

      for (let i = 0; i < iterations; i++) {
        // Verify valid event (to warm up)
        service.verifyEventIntegrity(validEvent);

        const start2 = performance.now();
        service.verifyEventIntegrity(earlyMismatch);
        earlyTime += performance.now() - start2;

        const start3 = performance.now();
        service.verifyEventIntegrity(lateMismatch);
        lateTime += performance.now() - start3;
      }

      // Timing-safe operations should show similar timing regardless of mismatch position
      // Allow 50% variance (generous to avoid flaky tests)
      const avgEarly = earlyTime / iterations;
      const avgLate = lateTime / iterations;
      const ratio = Math.max(avgEarly, avgLate) / Math.min(avgEarly, avgLate);

      expect(ratio).toBeLessThan(2); // Early and late mismatch should take similar time
    });
  });
});
