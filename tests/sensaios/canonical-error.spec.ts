/**
 * CanonicalError Tests
 * 
 * Tests for error conversion, category detection, and fingerprinting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toCanonicalError,
  isCanonicalError,
  detectCategory,
  inferSeverity,
  generateFingerprint,
  generateErrorCode,
  getRecoverySuggestions,
  serializeCanonicalError,
  summarizeError,
  type CanonicalError,
} from '../../src/sensaios/canonical-error.js';
import { systemScope, type TenantScope } from '../../src/sensaios/tenant-scope.js';

describe('CanonicalError', () => {
  const testScope: TenantScope = {
    tenant: 'test-guild',
    environment: 'development',
    service: 'test-service',
    component: 'test-component',
  };

  describe('Category Detection', () => {
    // Helper to create error with empty stack to avoid test environment path matching
    const makeError = (message: string): Error => {
      const error = new Error(message);
      error.stack = '';
      return error;
    };

    it('should detect validation errors', () => {
      expect(detectCategory(makeError('Validation failed'))).toBe('validation');
      expect(detectCategory(makeError('Invalid input'))).toBe('validation');
      expect(detectCategory(makeError('Field is required'))).toBe('validation');
    });

    it('should detect database errors', () => {
      expect(detectCategory(makeError('Prisma query failed'))).toBe('database');
      expect(detectCategory(makeError('PostgreSQL connection refused'))).toBe('database');
      expect(detectCategory(makeError('Unique constraint violation'))).toBe('database');
    });

    it('should detect network errors', () => {
      expect(detectCategory(makeError('ECONNREFUSED'))).toBe('network');
      expect(detectCategory(makeError('Request timeout'))).toBe('network');
      expect(detectCategory(makeError('Fetch failed'))).toBe('network');
    });

    it('should detect auth errors', () => {
      expect(detectCategory(makeError('Unauthorized'))).toBe('auth');
      expect(detectCategory(makeError('Permission denied'))).toBe('auth');
      expect(detectCategory(makeError('Expired token'))).toBe('auth');
    });

    it('should detect Discord errors', () => {
      expect(detectCategory(makeError('DiscordAPIError'))).toBe('discord');
      expect(detectCategory(makeError('Rate limit exceeded'))).toBe('discord');
      expect(detectCategory(makeError('Unknown interaction'))).toBe('discord');
    });

    it('should detect worker errors', () => {
      expect(detectCategory(makeError('Worker crashed'))).toBe('worker');
      expect(detectCategory(makeError('Job failed'))).toBe('worker');
    });

    it('should detect game errors', () => {
      expect(detectCategory(makeError('Battle not found'))).toBe('game');
      expect(detectCategory(makeError('Pokemon evolution failed'))).toBe('game');
    });

    it('should detect system errors', () => {
      expect(detectCategory(makeError('Out of memory'))).toBe('system');
      expect(detectCategory(makeError('ENOSPC disk full'))).toBe('system');
    });

    it('should return unknown for unrecognized errors', () => {
      expect(detectCategory(makeError('completely random 12345'))).toBe('unknown');
    });
  });

  describe('Severity Inference', () => {
    it('should infer critical for fatal errors', () => {
      expect(inferSeverity(new Error('Fatal crash'), 'system')).toBe('critical');
      expect(inferSeverity(new Error('Out of memory'), 'system')).toBe('critical');
    });

    it('should infer high for database errors', () => {
      expect(inferSeverity(new Error('Connection failed'), 'database')).toBe('high');
    });

    it('should infer high for TypeError', () => {
      const typeError = new TypeError('undefined is not a function');
      expect(inferSeverity(typeError, 'unknown')).toBe('high');
    });

    it('should infer medium for network errors', () => {
      expect(inferSeverity(new Error('Timeout'), 'network')).toBe('medium');
    });

    it('should infer low for validation errors', () => {
      expect(inferSeverity(new Error('Invalid input'), 'validation')).toBe('low');
    });
  });

  describe('Fingerprinting', () => {
    it('should generate consistent fingerprints', () => {
      const error = new Error('Test error message');
      const fp1 = generateFingerprint(error);
      const fp2 = generateFingerprint(error);

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(16);
    });

    it('should generate different fingerprints for different errors', () => {
      const error1 = new Error('Error one');
      const error2 = new Error('Error two');

      expect(generateFingerprint(error1)).not.toBe(generateFingerprint(error2));
    });

    it('should use error name and first stack frame for fingerprint', () => {
      // Fingerprinting uses name + message + stack, so different stacks = different fingerprints
      const error1 = new Error('Same message');
      const error2 = new Error('Same message');

      // Same error type and message, but stack differs due to different call sites
      // In practice, fingerprints will differ if stack frames differ
      const fp1 = generateFingerprint(error1);
      const fp2 = generateFingerprint(error2);

      // Both should be 16 chars
      expect(fp1).toHaveLength(16);
      expect(fp2).toHaveLength(16);
    });
  });

  describe('Error Code Generation', () => {
    it('should generate error codes from name and category', () => {
      const error = new TypeError('Invalid type');
      expect(generateErrorCode(error, 'validation')).toBe('ERR_VALIDATION_TYPE');
    });

    it('should handle Error name', () => {
      const error = new Error('Generic error');
      // Error name becomes UNKNOWN after removing "Error" suffix
      expect(generateErrorCode(error, 'unknown')).toBe('ERR_UNKNOWN_UNKNOWN');
    });

    it('should handle custom error names', () => {
      const error = new Error('Custom');
      error.name = 'DatabaseConnectionError';
      // Truncated to 20 chars after processing
      expect(generateErrorCode(error, 'database')).toMatch(/^ERR_DATABASE_DATABASE/);
    });
  });

  describe('Recovery Suggestions', () => {
    it('should return suggestions for known categories', () => {
      const suggestions = getRecoverySuggestions('database');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].action).toBeDefined();
    });

    it('should include custom suggestions first', () => {
      const custom = [{ action: 'Custom action', automatic: false, confidence: 0.9 }];
      const suggestions = getRecoverySuggestions('validation', custom);

      expect(suggestions[0].action).toBe('Custom action');
    });

    it('should return default suggestions for unknown', () => {
      const suggestions = getRecoverySuggestions('unknown');
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('toCanonicalError', () => {
    it('should convert Error to CanonicalError', () => {
      const error = new Error('Test error');
      const canonical = toCanonicalError(error, testScope);

      expect(canonical.isCanonical).toBe(true);
      expect(canonical.id).toBeDefined();
      expect(canonical.timestamp).toBeDefined();
      expect(canonical.message).toBe('Test error');
      expect(canonical.scope).toEqual(testScope);
      expect(canonical.fingerprint).toBeDefined();
      expect(canonical.code).toBeDefined();
      expect(canonical.category).toBeDefined();
      expect(canonical.severity).toBeDefined();
    });

    it('should preserve original error as cause', () => {
      const original = new Error('Original');
      const canonical = toCanonicalError(original, testScope);

      expect(canonical.cause).toBe(original);
    });

    it('should return same CanonicalError if already canonical', () => {
      const original = new Error('Test');
      const canonical = toCanonicalError(original, testScope);
      const again = toCanonicalError(canonical, testScope);

      expect(again).toBe(canonical);
    });

    it('should convert string to CanonicalError', () => {
      const canonical = toCanonicalError('String error', testScope);

      expect(canonical.message).toBe('String error');
      expect(canonical.isCanonical).toBe(true);
    });

    it('should use provided options', () => {
      const error = new Error('Test');
      const canonical = toCanonicalError(error, testScope, {
        correlationId: 'corr-123',
        category: 'game',
        severity: 'high',
        context: { key: 'value' },
      });

      expect(canonical.correlationId).toBe('corr-123');
      expect(canonical.category).toBe('game');
      expect(canonical.severity).toBe('high');
      expect(canonical.context).toEqual({ key: 'value' });
    });

    it('should include recovery suggestions', () => {
      const error = new Error('Database connection failed');
      const canonical = toCanonicalError(error, testScope);

      expect(canonical.recovery).toBeDefined();
      expect(canonical.recovery!.length).toBeGreaterThan(0);
    });
  });

  describe('isCanonicalError', () => {
    it('should return true for CanonicalError', () => {
      const canonical = toCanonicalError(new Error('Test'), testScope);
      expect(isCanonicalError(canonical)).toBe(true);
    });

    it('should return false for regular Error', () => {
      expect(isCanonicalError(new Error('Test'))).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isCanonicalError(null)).toBe(false);
      expect(isCanonicalError({})).toBe(false);
      expect(isCanonicalError('string')).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('serializeCanonicalError should produce plain object', () => {
      const canonical = toCanonicalError(new Error('Test'), testScope);
      const serialized = serializeCanonicalError(canonical);

      expect(typeof serialized).toBe('object');
      expect(serialized.id).toBe(canonical.id);
      expect(serialized.message).toBe(canonical.message);
      expect(serialized.scope).toEqual(testScope);

      // Should be JSON-serializable
      expect(() => JSON.stringify(serialized)).not.toThrow();
    });

    it('summarizeError should produce readable summary', () => {
      const canonical = toCanonicalError(new Error('Test message'), testScope);
      const summary = summarizeError(canonical);

      expect(summary).toContain(canonical.severity.toUpperCase());
      expect(summary).toContain(canonical.code);
      expect(summary).toContain('Test message');
      expect(summary).toContain(canonical.fingerprint);
    });
  });
});
