/**
 * Security Errors Tests
 * =====================
 *
 * Test suite for security error types (P1-009).
 * Tests error hierarchy, codes, serialization, and type guards.
 */

import { describe, it, expect } from 'vitest';
import {
  // Base class
  SecurityError,
  // Domain errors
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  IntegrityError,
  RateLimitError,
  CircuitBreakerError,
  ExternalServiceError,
  DatabaseError,
  ConfigurationError,
  InternalError,
  // Error codes
  ValidationErrorCode,
  IntegrityErrorCode,
  DatabaseErrorCode,
  InternalErrorCode,
  ERROR_CODE_PREFIX,
  // Type guards
  isSecurityError,
  isErrorCategory,
  isOperationalError,
  isProgrammingError,
  hasErrorCode,
  // Helpers
  wrapError,
  missingRequired,
  invalidFormat,
  notFound,
  permissionDenied,
} from '../../../src/bot/security/errors/index.js';

// ============================================================================
// Test Suites
// ============================================================================

describe('Security Errors', () => {
  // ==========================================================================
  // Base SecurityError Tests
  // ==========================================================================

  describe('SecurityError (base class)', () => {
    it('should create error with code and message', () => {
      const error = new SecurityError(
        'Test error message',
        ValidationErrorCode.INVALID_INPUT
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SecurityError);
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('SEC_VAL_001');
      expect(error.name).toBe('SecurityError');
    });

    it('should set category from code', () => {
      const error = new SecurityError('Test', IntegrityErrorCode.CHECKSUM_MISMATCH);
      expect(error.category).toBe('INTEGRITY');
    });

    it('should generate unique error ID', () => {
      const error1 = new SecurityError('Test 1', ValidationErrorCode.INVALID_INPUT);
      const error2 = new SecurityError('Test 2', ValidationErrorCode.INVALID_INPUT);

      expect(error1.errorId).toBeDefined();
      expect(error2.errorId).toBeDefined();
      expect(error1.errorId).not.toBe(error2.errorId);
    });

    it('should use provided error ID', () => {
      const error = new SecurityError(
        'Test',
        ValidationErrorCode.INVALID_INPUT,
        { errorId: 'custom-id-123' }
      );

      expect(error.errorId).toBe('custom-id-123');
    });

    it('should set default severity to medium', () => {
      const error = new SecurityError('Test', ValidationErrorCode.INVALID_INPUT);
      expect(error.severity).toBe('medium');
    });

    it('should accept custom severity', () => {
      const error = new SecurityError(
        'Test',
        ValidationErrorCode.INVALID_INPUT,
        {},
        { severity: 'critical' }
      );

      expect(error.severity).toBe('critical');
    });

    it('should set default type to operational', () => {
      const error = new SecurityError('Test', ValidationErrorCode.INVALID_INPUT);
      expect(error.type).toBe('operational');
    });

    it('should accept custom type', () => {
      const error = new SecurityError(
        'Test',
        InternalErrorCode.UNEXPECTED_ERROR,
        {},
        { type: 'programming' }
      );

      expect(error.type).toBe('programming');
    });

    it('should store context', () => {
      const error = new SecurityError(
        'Test',
        ValidationErrorCode.INVALID_INPUT,
        {
          guildId: '123456789',
          userId: '987654321',
          operation: 'roleUpdate',
          metadata: { extra: 'data' },
        }
      );

      expect(error.context.guildId).toBe('123456789');
      expect(error.context.userId).toBe('987654321');
      expect(error.context.operation).toBe('roleUpdate');
      expect(error.context.metadata).toEqual({ extra: 'data' });
    });

    it('should record timestamp', () => {
      const before = new Date();
      const error = new SecurityError('Test', ValidationErrorCode.INVALID_INPUT);
      const after = new Date();

      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should store cause for error chaining', () => {
      const cause = new Error('Original error');
      const error = new SecurityError(
        'Wrapped error',
        InternalErrorCode.UNEXPECTED_ERROR,
        {},
        { cause }
      );

      expect(error.cause).toBe(cause);
    });

    it('should serialize to JSON', () => {
      const error = new SecurityError(
        'Test error',
        ValidationErrorCode.INVALID_INPUT,
        { guildId: '123' }
      );

      const json = error.toJSON();

      expect(json.name).toBe('SecurityError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('SEC_VAL_001');
      expect(json.category).toBe('VALIDATION');
      expect(json.severity).toBe('medium');
      expect(json.type).toBe('operational');
      expect(json.context.guildId).toBe('123');
      expect(json.timestamp).toBeDefined();
    });

    it('should serialize cause chain', () => {
      const cause = new SecurityError('Cause error', IntegrityErrorCode.CHECKSUM_MISMATCH);
      const error = new SecurityError(
        'Outer error',
        InternalErrorCode.UNEXPECTED_ERROR,
        {},
        { cause }
      );

      const json = error.toJSON();
      expect(json.cause).toBeDefined();
      expect(json.cause?.code).toBe('SEC_INT_001');
    });

    it('should format toString correctly', () => {
      const error = new SecurityError('Test message', ValidationErrorCode.INVALID_INPUT);
      expect(error.toString()).toBe('[SEC_VAL_001] SecurityError: Test message');
    });
  });

  // ==========================================================================
  // ValidationError Tests
  // ==========================================================================

  describe('ValidationError', () => {
    it('should create validation error with field info', () => {
      const error = new ValidationError('Invalid field', {
        field: 'guildId',
        value: 'abc',
        constraint: 'Must be a snowflake',
      });

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(SecurityError);
      expect(error.field).toBe('guildId');
      expect(error.value).toBe('abc');
      expect(error.constraint).toBe('Must be a snowflake');
    });

    it('should use default severity low', () => {
      const error = new ValidationError('Test');
      expect(error.severity).toBe('low');
    });

    it('should use default code INVALID_INPUT', () => {
      const error = new ValidationError('Test');
      expect(error.code).toBe('SEC_VAL_001');
    });

    it('should accept custom error code', () => {
      const error = new ValidationError('Test', {}, ValidationErrorCode.MISSING_REQUIRED);
      expect(error.code).toBe('SEC_VAL_002');
    });
  });

  // ==========================================================================
  // AuthenticationError Tests
  // ==========================================================================

  describe('AuthenticationError', () => {
    it('should create auth error', () => {
      const error = new AuthenticationError('Token expired', {
        correlationId: 'corr-123',
      });

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.category).toBe('AUTHENTICATION');
      expect(error.severity).toBe('high');
    });

    it('should use default code INVALID_TOKEN', () => {
      const error = new AuthenticationError('Test');
      expect(error.code).toBe('SEC_AUTH_001');
    });
  });

  // ==========================================================================
  // AuthorizationError Tests
  // ==========================================================================

  describe('AuthorizationError', () => {
    it('should create authz error', () => {
      const error = new AuthorizationError('Access denied', {
        userId: 'user-123',
        operation: 'deleteGuild',
      });

      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.category).toBe('AUTHORIZATION');
      expect(error.severity).toBe('medium');
    });

    it('should use default code PERMISSION_DENIED', () => {
      const error = new AuthorizationError('Test');
      expect(error.code).toBe('SEC_AUTHZ_001');
    });
  });

  // ==========================================================================
  // IntegrityError Tests
  // ==========================================================================

  describe('IntegrityError', () => {
    it('should create integrity error with hash info', () => {
      const error = new IntegrityError('Hash mismatch', {
        eventId: '12345',
        expectedHash: 'abc123',
        actualHash: 'def456',
      });

      expect(error).toBeInstanceOf(IntegrityError);
      expect(error.category).toBe('INTEGRITY');
      expect(error.severity).toBe('critical');
      expect(error.expectedHash).toBe('abc123');
      expect(error.actualHash).toBe('def456');
    });

    it('should support checksum fields', () => {
      const error = new IntegrityError('Checksum mismatch', {
        expectedChecksum: 'checksum1',
        actualChecksum: 'checksum2',
      });

      expect(error.expectedHash).toBe('checksum1');
      expect(error.actualHash).toBe('checksum2');
    });
  });

  // ==========================================================================
  // RateLimitError Tests
  // ==========================================================================

  describe('RateLimitError', () => {
    it('should create rate limit error with limits', () => {
      const resetAt = new Date();
      const error = new RateLimitError('Rate exceeded', {
        limit: 100,
        current: 150,
        resetAt,
        retryAfter: 30,
      });

      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.category).toBe('RATE_LIMIT');
      expect(error.severity).toBe('low');
      expect(error.limit).toBe(100);
      expect(error.current).toBe(150);
      expect(error.resetAt).toBe(resetAt);
      expect(error.retryAfter).toBe(30);
    });
  });

  // ==========================================================================
  // CircuitBreakerError Tests
  // ==========================================================================

  describe('CircuitBreakerError', () => {
    it('should create circuit breaker error', () => {
      const error = new CircuitBreakerError('Circuit open', {
        component: 'discord-api',
      });

      expect(error).toBeInstanceOf(CircuitBreakerError);
      expect(error.category).toBe('CIRCUIT_BREAKER');
      expect(error.severity).toBe('high');
    });
  });

  // ==========================================================================
  // ExternalServiceError Tests
  // ==========================================================================

  describe('ExternalServiceError', () => {
    it('should create external service error', () => {
      const error = new ExternalServiceError('API failed', {
        service: 'discord',
        statusCode: 503,
        endpoint: '/api/guilds',
      });

      expect(error).toBeInstanceOf(ExternalServiceError);
      expect(error.category).toBe('EXTERNAL_SERVICE');
      expect(error.severity).toBe('high');
      expect(error.service).toBe('discord');
      expect(error.statusCode).toBe(503);
    });
  });

  // ==========================================================================
  // DatabaseError Tests
  // ==========================================================================

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Query failed', {
        table: 'SecurityEvent',
        query: 'SELECT * FROM ...',
        sqlState: '23505',
      });

      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.category).toBe('DATABASE');
      expect(error.severity).toBe('high');
      expect(error.table).toBe('SecurityEvent');
      expect(error.sqlState).toBe('23505');
    });
  });

  // ==========================================================================
  // ConfigurationError Tests
  // ==========================================================================

  describe('ConfigurationError', () => {
    it('should create config error', () => {
      const error = new ConfigurationError('Missing key', {
        component: 'encryption',
      });

      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.category).toBe('CONFIGURATION');
      expect(error.severity).toBe('critical');
      expect(error.type).toBe('programming');
    });
  });

  // ==========================================================================
  // InternalError Tests
  // ==========================================================================

  describe('InternalError', () => {
    it('should create internal error', () => {
      const error = new InternalError('Unexpected state');

      expect(error).toBeInstanceOf(InternalError);
      expect(error.category).toBe('INTERNAL');
      expect(error.severity).toBe('critical');
      expect(error.type).toBe('programming');
    });

    it('should accept cause', () => {
      const cause = new Error('Original');
      const error = new InternalError('Wrapped', {}, InternalErrorCode.UNEXPECTED_ERROR, cause);

      expect(error.cause).toBe(cause);
    });
  });

  // ==========================================================================
  // Type Guards Tests
  // ==========================================================================

  describe('Type Guards', () => {
    describe('isSecurityError', () => {
      it('should return true for SecurityError', () => {
        const error = new SecurityError('Test', ValidationErrorCode.INVALID_INPUT);
        expect(isSecurityError(error)).toBe(true);
      });

      it('should return true for subclasses', () => {
        expect(isSecurityError(new ValidationError('Test'))).toBe(true);
        expect(isSecurityError(new IntegrityError('Test'))).toBe(true);
        expect(isSecurityError(new DatabaseError('Test'))).toBe(true);
      });

      it('should return false for regular Error', () => {
        expect(isSecurityError(new Error('Test'))).toBe(false);
      });

      it('should return false for non-errors', () => {
        expect(isSecurityError('error')).toBe(false);
        expect(isSecurityError(null)).toBe(false);
        expect(isSecurityError(undefined)).toBe(false);
        expect(isSecurityError({})).toBe(false);
      });
    });

    describe('isErrorCategory', () => {
      it('should match category correctly', () => {
        const error = new ValidationError('Test');
        expect(isErrorCategory(error, 'VALIDATION')).toBe(true);
        expect(isErrorCategory(error, 'INTEGRITY')).toBe(false);
      });

      it('should return false for non-SecurityError', () => {
        expect(isErrorCategory(new Error('Test'), 'VALIDATION')).toBe(false);
      });
    });

    describe('isOperationalError', () => {
      it('should return true for operational errors', () => {
        expect(isOperationalError(new ValidationError('Test'))).toBe(true);
        expect(isOperationalError(new RateLimitError('Test'))).toBe(true);
      });

      it('should return false for programming errors', () => {
        expect(isOperationalError(new ConfigurationError('Test'))).toBe(false);
        expect(isOperationalError(new InternalError('Test'))).toBe(false);
      });
    });

    describe('isProgrammingError', () => {
      it('should return true for programming errors', () => {
        expect(isProgrammingError(new ConfigurationError('Test'))).toBe(true);
        expect(isProgrammingError(new InternalError('Test'))).toBe(true);
      });

      it('should return false for operational errors', () => {
        expect(isProgrammingError(new ValidationError('Test'))).toBe(false);
      });
    });

    describe('hasErrorCode', () => {
      it('should match error code', () => {
        const error = new ValidationError('Test', {}, ValidationErrorCode.MISSING_REQUIRED);
        expect(hasErrorCode(error, ValidationErrorCode.MISSING_REQUIRED)).toBe(true);
        expect(hasErrorCode(error, ValidationErrorCode.INVALID_INPUT)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Error Wrapping Tests
  // ==========================================================================

  describe('wrapError', () => {
    it('should return SecurityError unchanged', () => {
      const original = new ValidationError('Original');
      const wrapped = wrapError(original);
      expect(wrapped).toBe(original);
    });

    it('should wrap regular Error as InternalError', () => {
      const original = new Error('Original message');
      const wrapped = wrapError(original);

      expect(wrapped).toBeInstanceOf(InternalError);
      expect(wrapped.message).toBe('Original message');
      expect(wrapped.cause).toBe(original);
    });

    it('should wrap string as InternalError', () => {
      const wrapped = wrapError('error string');
      expect(wrapped).toBeInstanceOf(InternalError);
      expect(wrapped.message).toBe('error string');
    });

    it('should preserve context when wrapping', () => {
      const wrapped = wrapError(new Error('Test'), { guildId: '123' });
      expect(wrapped.context.guildId).toBe('123');
    });
  });

  // ==========================================================================
  // Helper Functions Tests
  // ==========================================================================

  describe('Helper Functions', () => {
    describe('missingRequired', () => {
      it('should create ValidationError for missing field', () => {
        const error = missingRequired('guildId');

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.code).toBe('SEC_VAL_002');
        expect(error.message).toContain('guildId');
        expect(error.field).toBe('guildId');
      });
    });

    describe('invalidFormat', () => {
      it('should create ValidationError for invalid format', () => {
        const error = invalidFormat('email', 'not-an-email', 'valid email address');

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.code).toBe('SEC_VAL_003');
        expect(error.field).toBe('email');
        expect(error.value).toBe('not-an-email');
      });
    });

    describe('notFound', () => {
      it('should create DatabaseError for not found', () => {
        const error = notFound('SecurityEvent', '12345');

        expect(error).toBeInstanceOf(DatabaseError);
        expect(error.code).toBe('SEC_DB_006');
        expect(error.table).toBe('SecurityEvent');
        expect(error.message).toContain('SecurityEvent');
        expect(error.message).toContain('12345');
      });

      it('should handle bigint IDs', () => {
        const error = notFound('User', BigInt(12345));
        expect(error.message).toContain('12345');
      });
    });

    describe('permissionDenied', () => {
      it('should create AuthorizationError', () => {
        const error = permissionDenied('deleteRole', { guildId: '123' });

        expect(error).toBeInstanceOf(AuthorizationError);
        expect(error.code).toBe('SEC_AUTHZ_001');
        expect(error.context.operation).toBe('deleteRole');
        expect(error.context.guildId).toBe('123');
      });
    });
  });

  // ==========================================================================
  // Error Codes Tests
  // ==========================================================================

  describe('Error Codes', () => {
    it('ERROR_CODE_PREFIX should have all categories', () => {
      expect(ERROR_CODE_PREFIX.VALIDATION).toBe('SEC_VAL');
      expect(ERROR_CODE_PREFIX.AUTHENTICATION).toBe('SEC_AUTH');
      expect(ERROR_CODE_PREFIX.AUTHORIZATION).toBe('SEC_AUTHZ');
      expect(ERROR_CODE_PREFIX.INTEGRITY).toBe('SEC_INT');
      expect(ERROR_CODE_PREFIX.RATE_LIMIT).toBe('SEC_RATE');
      expect(ERROR_CODE_PREFIX.CIRCUIT_BREAKER).toBe('SEC_CB');
      expect(ERROR_CODE_PREFIX.EXTERNAL_SERVICE).toBe('SEC_EXT');
      expect(ERROR_CODE_PREFIX.DATABASE).toBe('SEC_DB');
      expect(ERROR_CODE_PREFIX.CONFIGURATION).toBe('SEC_CFG');
      expect(ERROR_CODE_PREFIX.INTERNAL).toBe('SEC_ERR');
    });

    it('should have ValidationErrorCode values', () => {
      expect(Object.keys(ValidationErrorCode).length).toBeGreaterThan(0);
      expect(ValidationErrorCode.INVALID_INPUT).toBe('SEC_VAL_001');
    });

    it('should have IntegrityErrorCode values', () => {
      expect(Object.keys(IntegrityErrorCode).length).toBeGreaterThan(0);
      expect(IntegrityErrorCode.CHECKSUM_MISMATCH).toBe('SEC_INT_001');
      expect(IntegrityErrorCode.HASH_CHAIN_BROKEN).toBe('SEC_INT_002');
    });

    it('should have DatabaseErrorCode values', () => {
      expect(DatabaseErrorCode.CONNECTION_FAILED).toBe('SEC_DB_001');
      expect(DatabaseErrorCode.RECORD_NOT_FOUND).toBe('SEC_DB_006');
    });
  });

  // ==========================================================================
  // Edge Cases Tests
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty message', () => {
      const error = new SecurityError('', ValidationErrorCode.INVALID_INPUT);
      expect(error.message).toBe('');
      expect(error.toString()).toBe('[SEC_VAL_001] SecurityError: ');
    });

    it('should handle undefined context fields', () => {
      const error = new ValidationError('Test', {
        field: undefined,
        value: undefined,
      });

      expect(error.field).toBeUndefined();
      expect(error.value).toBeUndefined();
    });

    it('should handle complex metadata', () => {
      const error = new SecurityError(
        'Test',
        ValidationErrorCode.INVALID_INPUT,
        {
          metadata: {
            nested: { deep: { value: 123 } },
            array: [1, 2, 3],
            date: new Date().toISOString(),
          },
        }
      );

      const json = error.toJSON();
      expect(json.context.metadata).toBeDefined();
    });

    it('should handle null values in context', () => {
      const error = new SecurityError(
        'Test',
        ValidationErrorCode.INVALID_INPUT,
        {
          metadata: { nullValue: null, undefinedValue: undefined },
        }
      );

      expect(error.context.metadata).toEqual({ nullValue: null, undefinedValue: undefined });
    });
  });
});
