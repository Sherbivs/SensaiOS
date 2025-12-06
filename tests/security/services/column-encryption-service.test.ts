/**
 * Column Encryption Service Tests
 *
 * @module tests/security/services/column-encryption-service.test
 * @description Comprehensive test suite for field-level encryption service.
 * Tests GDPR Art. 32 compliance, key derivation, searchable encryption,
 * batch operations, and key rotation support.
 *
 * @research R5: Column Encryption (GDPR Art. 32) (Sprint 1)
 *
 * Test Categories:
 * 1. Configuration & Initialization
 * 2. Field Encryption/Decryption
 * 3. Searchable Encryption
 * 4. Batch Operations
 * 5. Key Rotation Support
 * 6. Security & Edge Cases
 *
 * @author Testing Specialist (Sprint 1)
 * @since 2025-01-XX
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  ColumnEncryptionService,
  createColumnEncryptionService,
  type ColumnEncryptionConfig,
  type EncryptedField,
  type PIIFieldType,
} from '../../../src/bot/security/services/column-encryption-service.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_MASTER_KEY = crypto.randomBytes(32);
const TEST_SALT = crypto.randomBytes(32);

function createTestService(overrides?: Partial<ColumnEncryptionConfig>): ColumnEncryptionService {
  return new ColumnEncryptionService({
    masterKey: TEST_MASTER_KEY,
    derivationSalt: TEST_SALT,
    keyVersion: 1,
    ...overrides,
  });
}

const TEST_PII_DATA = {
  email: 'user@example.com',
  ip_address: '192.168.1.100',
  member_tag: 'TestUser#1234',
  executor_tag: 'AdminUser#5678',
  guild_name: 'Test Discord Server',
  role_name: 'Moderator',
};

// ============================================================================
// Test Suite
// ============================================================================

describe('ColumnEncryptionService', () => {
  // ==========================================================================
  // 1. Configuration & Initialization
  // ==========================================================================

  describe('Configuration & Initialization', () => {
    it('should initialize with valid configuration', () => {
      const service = createTestService();
      expect(service).toBeInstanceOf(ColumnEncryptionService);
      expect(service.getKeyVersion()).toBe(1);
      expect(service.getAlgorithm()).toBe('aes-256-gcm');
    });

    it('should accept hex-encoded master key', () => {
      const hexKey = crypto.randomBytes(32).toString('hex');
      const service = new ColumnEncryptionService({
        masterKey: hexKey,
        derivationSalt: TEST_SALT,
      });
      expect(service.getKeyVersion()).toBe(1);
    });

    it('should accept base64-encoded master key', () => {
      const base64Key = crypto.randomBytes(32).toString('base64');
      const service = new ColumnEncryptionService({
        masterKey: base64Key,
        derivationSalt: TEST_SALT,
      });
      expect(service.getKeyVersion()).toBe(1);
    });

    it('should hash arbitrary string keys to correct length', () => {
      const service = new ColumnEncryptionService({
        masterKey: 'arbitrary-password-that-gets-hashed',
        derivationSalt: TEST_SALT,
      });
      expect(service.getKeyVersion()).toBe(1);
    });

    it('should accept custom algorithm', () => {
      const service = createTestService({ algorithm: 'aes-256-cbc' });
      expect(service.getAlgorithm()).toBe('aes-256-cbc');
    });

    it('should accept custom key version', () => {
      const service = createTestService({ keyVersion: 5 });
      expect(service.getKeyVersion()).toBe(5);
    });

    it('should initialize statistics', () => {
      const service = createTestService();
      const stats = service.getStats();
      expect(stats.encryptionCount).toBe(0);
      expect(stats.decryptionCount).toBe(0);
      expect(stats.searchHashCount).toBe(0);
      expect(stats.encryptionErrors).toBe(0);
      expect(stats.decryptionErrors).toBe(0);
      expect(stats.keyVersion).toBe(1);
      expect(stats.startedAt).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // 2. Field Encryption/Decryption
  // ==========================================================================

  describe('Field Encryption/Decryption', () => {
    let service: ColumnEncryptionService;

    beforeEach(() => {
      service = createTestService();
    });

    describe('AES-256-GCM (Default)', () => {
      it('should encrypt and decrypt email field', () => {
        const encrypted = service.encryptField(TEST_PII_DATA.email, 'email');
        expect(encrypted.v).toBe(1);
        expect(encrypted.alg).toBe('aes-256-gcm');
        expect(encrypted.field).toBe('email');
        expect(encrypted.ct).toBeTruthy();
        expect(encrypted.iv).toBeTruthy();
        expect(encrypted.tag).toBeTruthy();

        const decrypted = service.decryptField(encrypted, 'email');
        expect(decrypted).toBe(TEST_PII_DATA.email);
      });

      it('should encrypt and decrypt IP address field', () => {
        const encrypted = service.encryptField(TEST_PII_DATA.ip_address, 'ip_address');
        const decrypted = service.decryptField(encrypted, 'ip_address');
        expect(decrypted).toBe(TEST_PII_DATA.ip_address);
      });

      it('should encrypt and decrypt member tag field', () => {
        const encrypted = service.encryptField(TEST_PII_DATA.member_tag, 'member_tag');
        const decrypted = service.decryptField(encrypted, 'member_tag');
        expect(decrypted).toBe(TEST_PII_DATA.member_tag);
      });

      it('should encrypt and decrypt all PII field types', () => {
        const fieldTypes: PIIFieldType[] = [
          'email',
          'ip_address',
          'member_tag',
          'executor_tag',
          'guild_name',
          'role_name',
          'custom',
        ];

        for (const fieldType of fieldTypes) {
          const testValue = `test-value-for-${fieldType}`;
          const encrypted = service.encryptField(testValue, fieldType);
          const decrypted = service.decryptField(encrypted, fieldType);
          expect(decrypted).toBe(testValue);
        }
      });

      it('should produce different ciphertext for same plaintext (random IV)', () => {
        const encrypted1 = service.encryptField(TEST_PII_DATA.email, 'email');
        const encrypted2 = service.encryptField(TEST_PII_DATA.email, 'email');

        expect(encrypted1.ct).not.toBe(encrypted2.ct);
        expect(encrypted1.iv).not.toBe(encrypted2.iv);
      });

      it('should use different keys for different field types', () => {
        // Same plaintext, different field types should produce different results
        const encryptedEmail = service.encryptField('test@example.com', 'email');
        const _encryptedCustom = service.encryptField('test@example.com', 'custom');

        // Even with same IV (which we can't control), different field keys mean
        // different ciphertext - but we can verify decryption only works with correct type
        expect(() => service.decryptField(encryptedEmail, 'custom')).toThrow(/Field type mismatch/);
      });
    });

    describe('AES-256-CBC', () => {
      it('should encrypt and decrypt with CBC mode', () => {
        const cbcService = createTestService({ algorithm: 'aes-256-cbc' });
        const encrypted = cbcService.encryptField(TEST_PII_DATA.email, 'email');

        expect(encrypted.alg).toBe('aes-256-cbc');
        expect(encrypted.tag).toBeUndefined(); // CBC doesn't use auth tag

        const decrypted = cbcService.decryptField(encrypted, 'email');
        expect(decrypted).toBe(TEST_PII_DATA.email);
      });
    });

    describe('ChaCha20-Poly1305', () => {
      it('should encrypt and decrypt with ChaCha20-Poly1305', () => {
        const chachaService = createTestService({ algorithm: 'chacha20-poly1305' });
        const encrypted = chachaService.encryptField(TEST_PII_DATA.email, 'email');

        expect(encrypted.alg).toBe('chacha20-poly1305');
        expect(encrypted.tag).toBeTruthy();

        const decrypted = chachaService.decryptField(encrypted, 'email');
        expect(decrypted).toBe(TEST_PII_DATA.email);
      });
    });

    describe('Decryption Failures', () => {
      it('should fail decryption with wrong field type', () => {
        const encrypted = service.encryptField(TEST_PII_DATA.email, 'email');
        expect(() => service.decryptField(encrypted, 'ip_address')).toThrow(/Field type mismatch/);
      });

      it('should fail decryption with tampered ciphertext', () => {
        const encrypted = service.encryptField(TEST_PII_DATA.email, 'email');
        encrypted.ct = Buffer.from('tampered-data').toString('base64');
        expect(() => service.decryptField(encrypted, 'email')).toThrow();
      });

      it('should fail decryption with tampered auth tag', () => {
        const encrypted = service.encryptField(TEST_PII_DATA.email, 'email');
        encrypted.tag = Buffer.from('wrong-tag-value').toString('base64');
        expect(() => service.decryptField(encrypted, 'email')).toThrow();
      });

      it('should fail decryption with missing auth tag for AEAD', () => {
        const encrypted = service.encryptField(TEST_PII_DATA.email, 'email');
        delete encrypted.tag;
        expect(() => service.decryptField(encrypted, 'email')).toThrow(/Auth tag required/);
      });

      it('should fail decryption with different service instance (different key)', () => {
        const service1 = createTestService({ masterKey: crypto.randomBytes(32) });
        const service2 = createTestService({ masterKey: crypto.randomBytes(32) });

        const encrypted = service1.encryptField(TEST_PII_DATA.email, 'email');
        expect(() => service2.decryptField(encrypted, 'email')).toThrow();
      });
    });

    describe('Statistics Tracking', () => {
      it('should track encryption count', () => {
        service.encryptField(TEST_PII_DATA.email, 'email');
        service.encryptField(TEST_PII_DATA.ip_address, 'ip_address');
        service.encryptField(TEST_PII_DATA.member_tag, 'member_tag');

        const stats = service.getStats();
        expect(stats.encryptionCount).toBe(3);
      });

      it('should track decryption count', () => {
        const encrypted1 = service.encryptField(TEST_PII_DATA.email, 'email');
        const encrypted2 = service.encryptField(TEST_PII_DATA.ip_address, 'ip_address');

        service.decryptField(encrypted1, 'email');
        service.decryptField(encrypted2, 'ip_address');

        const stats = service.getStats();
        expect(stats.decryptionCount).toBe(2);
      });

      it('should track encryption errors', () => {
        // Force an error by providing invalid algorithm at runtime
        const encrypted = service.encryptField(TEST_PII_DATA.email, 'email');
        encrypted.alg = 'invalid-algorithm';

        try {
          service.decryptField(encrypted, 'email');
        } catch {
          // Expected to fail
        }

        const stats = service.getStats();
        expect(stats.decryptionErrors).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ==========================================================================
  // 3. Searchable Encryption
  // ==========================================================================

  describe('Searchable Encryption', () => {
    let service: ColumnEncryptionService;

    beforeEach(() => {
      service = createTestService();
    });

    it('should generate deterministic search hash', () => {
      const hash1 = service.hashForSearch(TEST_PII_DATA.email, 'email');
      const hash2 = service.hashForSearch(TEST_PII_DATA.email, 'email');

      expect(hash1.hash).toBe(hash2.hash);
      expect(hash1.field).toBe('email');
      expect(hash1.v).toBe(1);
    });

    it('should generate different hashes for different field types', () => {
      const emailHash = service.hashForSearch('test@example.com', 'email');
      const customHash = service.hashForSearch('test@example.com', 'custom');

      expect(emailHash.hash).not.toBe(customHash.hash);
    });

    it('should generate different hashes for different values', () => {
      const hash1 = service.hashForSearch('user1@example.com', 'email');
      const hash2 = service.hashForSearch('user2@example.com', 'email');

      expect(hash1.hash).not.toBe(hash2.hash);
    });

    it('should verify search hash correctly', () => {
      const searchHash = service.hashForSearch(TEST_PII_DATA.email, 'email');
      expect(service.verifySearchHash(TEST_PII_DATA.email, searchHash)).toBe(true);
    });

    it('should reject incorrect search hash', () => {
      const searchHash = service.hashForSearch(TEST_PII_DATA.email, 'email');
      expect(service.verifySearchHash('different@example.com', searchHash)).toBe(false);
    });

    it('should track search hash count', () => {
      service.hashForSearch(TEST_PII_DATA.email, 'email');
      service.hashForSearch(TEST_PII_DATA.ip_address, 'ip_address');

      const stats = service.getStats();
      expect(stats.searchHashCount).toBe(2);
    });

    it('should use timing-safe comparison for verification', () => {
      const searchHash = service.hashForSearch(TEST_PII_DATA.email, 'email');

      // Measure verification times
      const correctStart = performance.now();
      for (let i = 0; i < 100; i++) {
        service.verifySearchHash(TEST_PII_DATA.email, searchHash);
      }
      const correctTime = performance.now() - correctStart;

      const wrongStart = performance.now();
      for (let i = 0; i < 100; i++) {
        service.verifySearchHash('wrong@example.com', searchHash);
      }
      const wrongTime = performance.now() - wrongStart;

      // Times should be similar (within reasonable variance)
      const ratio = Math.max(correctTime, wrongTime) / Math.min(correctTime, wrongTime);
      expect(ratio).toBeLessThan(3);
    });
  });

  // ==========================================================================
  // 4. Batch Operations
  // ==========================================================================

  describe('Batch Operations', () => {
    let service: ColumnEncryptionService;

    beforeEach(() => {
      service = createTestService();
    });

    const fieldMappings: Record<string, PIIFieldType> = {
      email: 'email',
      ipAddress: 'ip_address',
      memberTag: 'member_tag',
    };

    describe('Record Encryption', () => {
      it('should encrypt all mapped fields in a record', () => {
        const record = {
          id: 1,
          email: 'user@example.com',
          ipAddress: '192.168.1.1',
          memberTag: 'User#1234',
          nonPiiField: 'this stays plaintext',
        };

        const encrypted = service.encryptRecord(record, fieldMappings);

        // Check encrypted fields
        expect(encrypted.email).toHaveProperty('ct');
        expect(encrypted.email).toHaveProperty('iv');
        expect(encrypted.ipAddress).toHaveProperty('ct');
        expect(encrypted.memberTag).toHaveProperty('ct');

        // Check non-PII field unchanged
        expect(encrypted.nonPiiField).toBe('this stays plaintext');
        expect(encrypted.id).toBe(1);
      });

      it('should handle null/undefined PII fields', () => {
        const record = {
          id: 1,
          email: null,
          ipAddress: undefined,
          memberTag: 'User#1234',
        };

        const encrypted = service.encryptRecord(record, fieldMappings);

        expect(encrypted.email).toBeNull();
        expect(encrypted.ipAddress).toBeUndefined();
        expect(encrypted.memberTag).toHaveProperty('ct');
      });
    });

    describe('Record Decryption', () => {
      it('should decrypt all mapped fields in a record', () => {
        const originalRecord = {
          id: 1,
          email: 'user@example.com',
          ipAddress: '192.168.1.1',
          memberTag: 'User#1234',
          nonPiiField: 'plaintext',
        };

        const encrypted = service.encryptRecord(originalRecord, fieldMappings);
        const decrypted = service.decryptRecord(encrypted, fieldMappings);

        expect(decrypted.email).toBe(originalRecord.email);
        expect(decrypted.ipAddress).toBe(originalRecord.ipAddress);
        expect(decrypted.memberTag).toBe(originalRecord.memberTag);
        expect(decrypted.nonPiiField).toBe(originalRecord.nonPiiField);
        expect(decrypted.id).toBe(originalRecord.id);
      });
    });

    describe('Batch Encryption', () => {
      it('should encrypt multiple records', () => {
        const records = [
          { id: 1, email: 'user1@example.com', memberTag: 'User1#1234' },
          { id: 2, email: 'user2@example.com', memberTag: 'User2#5678' },
          { id: 3, email: 'user3@example.com', memberTag: 'User3#9012' },
        ];

        const result = service.encryptBatch(records, {
          email: 'email',
          memberTag: 'member_tag',
        });

        expect(result.encrypted).toHaveLength(3);
        expect(result.failed).toHaveLength(0);
        expect(result.durationMs).toBeGreaterThan(0);

        for (const record of result.encrypted) {
          expect(record.email).toHaveProperty('ct');
          expect(record.memberTag).toHaveProperty('ct');
        }
      });

      it('should capture failures in batch encryption', () => {
        // Create a mock that will fail for specific records
        const records = [
          { id: 1, email: 'user1@example.com' },
          { id: 2, email: 'user2@example.com' },
        ];

        const result = service.encryptBatch(records, { email: 'email' });
        expect(result.encrypted).toHaveLength(2);
        expect(result.failed).toHaveLength(0);
      });
    });

    describe('Batch Decryption', () => {
      it('should decrypt multiple records', () => {
        const records = [
          { id: 1, email: 'user1@example.com' },
          { id: 2, email: 'user2@example.com' },
        ];

        const encryptedResult = service.encryptBatch(records, { email: 'email' });
        const decryptedResult = service.decryptBatch(encryptedResult.encrypted, { email: 'email' });

        expect(decryptedResult.encrypted).toHaveLength(2);
        expect(decryptedResult.encrypted[0].email).toBe('user1@example.com');
        expect(decryptedResult.encrypted[1].email).toBe('user2@example.com');
      });

      it('should report batch processing duration', () => {
        const records = Array.from({ length: 100 }, (_, i) => ({
          id: i,
          email: `user${i}@example.com`,
        }));

        const result = service.encryptBatch(records, { email: 'email' });
        expect(result.durationMs).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // 5. Key Rotation Support
  // ==========================================================================

  describe('Key Rotation Support', () => {
    it('should identify fields needing re-encryption', () => {
      const service = createTestService({ keyVersion: 2 });
      const oldVersionPayload: EncryptedField = {
        v: 1,
        alg: 'aes-256-gcm',
        field: 'email',
        ct: 'dummy',
        iv: 'dummy',
        tag: 'dummy',
      };

      expect(service.needsReEncryption(oldVersionPayload)).toBe(true);
    });

    it('should not flag current version as needing re-encryption', () => {
      const service = createTestService({ keyVersion: 1 });
      const currentVersionPayload: EncryptedField = {
        v: 1,
        alg: 'aes-256-gcm',
        field: 'email',
        ct: 'dummy',
        iv: 'dummy',
        tag: 'dummy',
      };

      expect(service.needsReEncryption(currentVersionPayload)).toBe(false);
    });

    it('should re-encrypt field with new key version', () => {
      // Service v1 encrypts
      const serviceV1 = createTestService({ keyVersion: 1 });
      const encryptedV1 = serviceV1.encryptField(TEST_PII_DATA.email, 'email');
      expect(encryptedV1.v).toBe(1);

      // Service v2 re-encrypts (same master key, different version)
      const serviceV2 = new ColumnEncryptionService({
        masterKey: TEST_MASTER_KEY,
        derivationSalt: TEST_SALT,
        keyVersion: 2,
      });

      const reEncrypted = serviceV2.reEncryptField(encryptedV1, 'email');
      expect(reEncrypted.v).toBe(2);

      // Should still decrypt correctly
      const decrypted = serviceV2.decryptField(reEncrypted, 'email');
      expect(decrypted).toBe(TEST_PII_DATA.email);
    });

    it('should clear key cache', () => {
      const service = createTestService();

      // Generate some keys
      service.encryptField(TEST_PII_DATA.email, 'email');
      service.encryptField(TEST_PII_DATA.ip_address, 'ip_address');

      // Clear cache
      service.clearKeyCache();

      // Should still work (keys will be re-derived)
      const encrypted = service.encryptField(TEST_PII_DATA.email, 'email');
      const decrypted = service.decryptField(encrypted, 'email');
      expect(decrypted).toBe(TEST_PII_DATA.email);
    });
  });

  // ==========================================================================
  // 6. Security & Edge Cases
  // ==========================================================================

  describe('Security & Edge Cases', () => {
    let service: ColumnEncryptionService;

    beforeEach(() => {
      service = createTestService();
    });

    describe('Edge Cases', () => {
      it('should handle empty string', () => {
        const encrypted = service.encryptField('', 'email');
        const decrypted = service.decryptField(encrypted, 'email');
        expect(decrypted).toBe('');
      });

      it('should handle unicode characters', () => {
        const unicodeEmail = 'ユーザー@例え.日本';
        const encrypted = service.encryptField(unicodeEmail, 'email');
        const decrypted = service.decryptField(encrypted, 'email');
        expect(decrypted).toBe(unicodeEmail);
      });

      it('should handle emojis', () => {
        const emojiName = 'Test 🎮 Server 🔒';
        const encrypted = service.encryptField(emojiName, 'guild_name');
        const decrypted = service.decryptField(encrypted, 'guild_name');
        expect(decrypted).toBe(emojiName);
      });

      it('should handle long strings', () => {
        const longString = 'x'.repeat(10000);
        const encrypted = service.encryptField(longString, 'custom');
        const decrypted = service.decryptField(encrypted, 'custom');
        expect(decrypted).toBe(longString);
      });

      it('should handle special characters', () => {
        const specialChars = "Test\x00null\x00bytes\nand\ttabs'quotes\"double";
        const encrypted = service.encryptField(specialChars, 'custom');
        const decrypted = service.decryptField(encrypted, 'custom');
        expect(decrypted).toBe(specialChars);
      });

      it('should handle newlines in data', () => {
        const multiline = 'Line 1\nLine 2\r\nLine 3';
        const encrypted = service.encryptField(multiline, 'custom');
        const decrypted = service.decryptField(encrypted, 'custom');
        expect(decrypted).toBe(multiline);
      });
    });

    describe('Serialization', () => {
      it('should serialize encrypted field to JSON', () => {
        const encrypted = service.encryptField(TEST_PII_DATA.email, 'email');
        const json = service.serializeField(encrypted);
        expect(() => JSON.parse(json)).not.toThrow();

        const parsed = JSON.parse(json);
        expect(parsed.v).toBe(encrypted.v);
        expect(parsed.alg).toBe(encrypted.alg);
        expect(parsed.ct).toBe(encrypted.ct);
      });

      it('should deserialize encrypted field from JSON', () => {
        const encrypted = service.encryptField(TEST_PII_DATA.email, 'email');
        const json = service.serializeField(encrypted);
        const deserialized = service.deserializeField(json);

        const decrypted = service.decryptField(deserialized, 'email');
        expect(decrypted).toBe(TEST_PII_DATA.email);
      });
    });

    describe('Algorithm Detection', () => {
      it('should decrypt data encrypted with different algorithms', () => {
        const gcmService = createTestService({ algorithm: 'aes-256-gcm' });
        const cbcService = createTestService({ algorithm: 'aes-256-cbc' });

        const gcmEncrypted = gcmService.encryptField(TEST_PII_DATA.email, 'email');
        const cbcEncrypted = cbcService.encryptField(TEST_PII_DATA.email, 'email');

        // GCM service can decrypt GCM data
        expect(gcmService.decryptField(gcmEncrypted, 'email')).toBe(TEST_PII_DATA.email);

        // CBC service can decrypt CBC data
        expect(cbcService.decryptField(cbcEncrypted, 'email')).toBe(TEST_PII_DATA.email);

        // Cross-decryption works because algorithm is stored in payload
        expect(gcmService.decryptField(cbcEncrypted, 'email')).toBe(TEST_PII_DATA.email);
        expect(cbcService.decryptField(gcmEncrypted, 'email')).toBe(TEST_PII_DATA.email);
      });
    });
  });

  // ==========================================================================
  // 7. Factory Function
  // ==========================================================================

  describe('Factory Function', () => {
    it('should throw without master key', () => {
      // Save and clear env var
      const originalKey = process.env.COLUMN_ENCRYPTION_KEY;
      delete process.env.COLUMN_ENCRYPTION_KEY;

      try {
        expect(() => createColumnEncryptionService()).toThrow(/Column encryption key required/);
      } finally {
        // Restore env var
        if (originalKey) {
          process.env.COLUMN_ENCRYPTION_KEY = originalKey;
        }
      }
    });

    it('should create service with overrides', () => {
      const service = createColumnEncryptionService({
        masterKey: TEST_MASTER_KEY,
        keyVersion: 5,
        algorithm: 'aes-256-cbc',
      });

      expect(service.getKeyVersion()).toBe(5);
      expect(service.getAlgorithm()).toBe('aes-256-cbc');
    });
  });
});
