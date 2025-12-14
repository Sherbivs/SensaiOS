/**
 * Security Error Types
 * ====================
 *
 * Domain-specific error hierarchy for security services.
 * Provides typed error codes, categorization, and rich context for debugging.
 *
 * @module security/errors
 * @task P1-009 (Error Types)
 *
 * Features:
 * - Base SecurityError class with error codes
 * - Domain-specific error subclasses
 * - Error categorization (operational vs programming)
 * - Rich context for debugging and logging
 * - Serialization for transport/logging
 * - Error wrapping for cause chains
 *
 * Error Categories:
 * - VALIDATION: Input validation failures
 * - AUTHENTICATION: Auth/token errors
 * - AUTHORIZATION: Permission/access errors
 * - INTEGRITY: Data integrity violations
 * - RATE_LIMIT: Rate limiting/throttling
 * - CIRCUIT_BREAKER: Circuit breaker states
 * - EXTERNAL_SERVICE: External API failures
 * - DATABASE: Database operation errors
 * - CONFIGURATION: Configuration errors
 * - INTERNAL: Unexpected internal errors
 *
 * @example
 * ```typescript
 * import {
 *   SecurityError,
 *   ValidationError,
 *   IntegrityError,
 *   isSecurityError,
 * } from './security-errors.js';
 *
 * // Throw a validation error
 * throw new ValidationError('Invalid guild ID format', {
 *   field: 'guildId',
 *   value: 'abc',
 *   constraint: 'Must be a valid Discord snowflake',
 * });
 *
 * // Throw an integrity error
 * throw new IntegrityError('Hash chain verification failed', {
 *   eventId: '12345',
 *   expectedHash: 'abc...',
 *   actualHash: 'def...',
 * });
 *
 * // Check if error is a security error
 * if (isSecurityError(error)) {
 *   logger.error(error.toJSON());
 * }
 * ```
 */
// ============================================================================
// Error Codes
// ============================================================================
/**
 * Security error code prefixes by category.
 */
export const ERROR_CODE_PREFIX = {
    VALIDATION: 'SEC_VAL',
    AUTHENTICATION: 'SEC_AUTH',
    AUTHORIZATION: 'SEC_AUTHZ',
    INTEGRITY: 'SEC_INT',
    RATE_LIMIT: 'SEC_RATE',
    CIRCUIT_BREAKER: 'SEC_CB',
    EXTERNAL_SERVICE: 'SEC_EXT',
    DATABASE: 'SEC_DB',
    CONFIGURATION: 'SEC_CFG',
    INTERNAL: 'SEC_ERR',
};
// ============================================================================
// Specific Error Codes
// ============================================================================
/**
 * Validation error codes.
 */
export const ValidationErrorCode = {
    INVALID_INPUT: 'SEC_VAL_001',
    MISSING_REQUIRED: 'SEC_VAL_002',
    INVALID_FORMAT: 'SEC_VAL_003',
    OUT_OF_RANGE: 'SEC_VAL_004',
    INVALID_ENUM: 'SEC_VAL_005',
    INVALID_LENGTH: 'SEC_VAL_006',
    INVALID_TYPE: 'SEC_VAL_007',
    CONSTRAINT_VIOLATION: 'SEC_VAL_008',
};
/**
 * Authentication error codes.
 */
export const AuthenticationErrorCode = {
    INVALID_TOKEN: 'SEC_AUTH_001',
    EXPIRED_TOKEN: 'SEC_AUTH_002',
    MISSING_TOKEN: 'SEC_AUTH_003',
    INVALID_SIGNATURE: 'SEC_AUTH_004',
    INVALID_CREDENTIALS: 'SEC_AUTH_005',
    SESSION_EXPIRED: 'SEC_AUTH_006',
};
/**
 * Authorization error codes.
 */
export const AuthorizationErrorCode = {
    PERMISSION_DENIED: 'SEC_AUTHZ_001',
    INSUFFICIENT_ROLE: 'SEC_AUTHZ_002',
    RESOURCE_FORBIDDEN: 'SEC_AUTHZ_003',
    GUILD_ACCESS_DENIED: 'SEC_AUTHZ_004',
    OPERATION_NOT_ALLOWED: 'SEC_AUTHZ_005',
    ELEVATED_PERMISSION_REQUIRED: 'SEC_AUTHZ_006',
};
/**
 * Integrity error codes.
 */
export const IntegrityErrorCode = {
    CHECKSUM_MISMATCH: 'SEC_INT_001',
    HASH_CHAIN_BROKEN: 'SEC_INT_002',
    SIGNATURE_INVALID: 'SEC_INT_003',
    DATA_TAMPERED: 'SEC_INT_004',
    BASELINE_DRIFT: 'SEC_INT_005',
    AUDIT_GAP: 'SEC_INT_006',
    KEY_COMPROMISED: 'SEC_INT_007',
};
/**
 * Rate limit error codes.
 */
export const RateLimitErrorCode = {
    RATE_EXCEEDED: 'SEC_RATE_001',
    QUOTA_EXHAUSTED: 'SEC_RATE_002',
    BURST_LIMIT: 'SEC_RATE_003',
    DAILY_LIMIT: 'SEC_RATE_004',
    CONCURRENT_LIMIT: 'SEC_RATE_005',
};
/**
 * Circuit breaker error codes.
 */
export const CircuitBreakerErrorCode = {
    CIRCUIT_OPEN: 'SEC_CB_001',
    CIRCUIT_HALF_OPEN: 'SEC_CB_002',
    SERVICE_UNAVAILABLE: 'SEC_CB_003',
    TIMEOUT: 'SEC_CB_004',
    FALLBACK_FAILED: 'SEC_CB_005',
};
/**
 * External service error codes.
 */
export const ExternalServiceErrorCode = {
    DISCORD_API_ERROR: 'SEC_EXT_001',
    PAGERDUTY_ERROR: 'SEC_EXT_002',
    WEBHOOK_FAILED: 'SEC_EXT_003',
    NETWORK_ERROR: 'SEC_EXT_004',
    SERVICE_TIMEOUT: 'SEC_EXT_005',
    INVALID_RESPONSE: 'SEC_EXT_006',
};
/**
 * Database error codes.
 */
export const DatabaseErrorCode = {
    CONNECTION_FAILED: 'SEC_DB_001',
    QUERY_FAILED: 'SEC_DB_002',
    CONSTRAINT_VIOLATION: 'SEC_DB_003',
    DEADLOCK: 'SEC_DB_004',
    TRANSACTION_FAILED: 'SEC_DB_005',
    RECORD_NOT_FOUND: 'SEC_DB_006',
    DUPLICATE_RECORD: 'SEC_DB_007',
    MIGRATION_FAILED: 'SEC_DB_008',
};
/**
 * Configuration error codes.
 */
export const ConfigurationErrorCode = {
    MISSING_CONFIG: 'SEC_CFG_001',
    INVALID_CONFIG: 'SEC_CFG_002',
    ENCRYPTION_KEY_MISSING: 'SEC_CFG_003',
    ENVIRONMENT_INVALID: 'SEC_CFG_004',
    FEATURE_DISABLED: 'SEC_CFG_005',
};
/**
 * Internal error codes.
 */
export const InternalErrorCode = {
    UNEXPECTED_ERROR: 'SEC_ERR_001',
    ASSERTION_FAILED: 'SEC_ERR_002',
    STATE_CORRUPTION: 'SEC_ERR_003',
    MEMORY_EXCEEDED: 'SEC_ERR_004',
    UNHANDLED_CASE: 'SEC_ERR_005',
};
// ============================================================================
// Base Security Error
// ============================================================================
/**
 * Generate a unique error ID.
 */
function generateErrorId() {
    return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
/**
 * Get error category from code.
 */
function getCategoryFromCode(code) {
    const prefix = code.split('_').slice(0, 2).join('_');
    const entry = Object.entries(ERROR_CODE_PREFIX).find(([_, p]) => p === prefix);
    return entry?.[0] ?? 'INTERNAL';
}
/**
 * Base class for all security errors.
 *
 * Provides error code, category, context, and serialization.
 */
export class SecurityError extends Error {
    /** Error code for categorization */
    code;
    /** Error category */
    category;
    /** Error severity */
    severity;
    /** Operational or programming error */
    type;
    /** Error context */
    context;
    /** Unique error instance ID */
    errorId;
    /** Timestamp of error creation */
    timestamp;
    constructor(message, code, context = {}, options) {
        super(message, { cause: options?.cause });
        this.name = this.constructor.name;
        this.code = code;
        this.category = getCategoryFromCode(code);
        this.severity = options?.severity ?? 'medium';
        this.type = options?.type ?? 'operational';
        this.errorId = context.errorId ?? generateErrorId();
        this.context = { ...context, errorId: this.errorId };
        this.timestamp = new Date();
        // Maintain proper stack trace
        Error.captureStackTrace?.(this, this.constructor);
    }
    /**
     * Serialize error for transport/logging.
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            category: this.category,
            severity: this.severity,
            type: this.type,
            context: this.context,
            stack: this.stack,
            cause: this.cause instanceof SecurityError ? this.cause.toJSON() : undefined,
            timestamp: this.timestamp.toISOString(),
        };
    }
    /**
     * Create a string representation.
     */
    toString() {
        return `[${this.code}] ${this.name}: ${this.message}`;
    }
}
// ============================================================================
// Domain-Specific Errors
// ============================================================================
/**
 * Validation error for input validation failures.
 */
export class ValidationError extends SecurityError {
    field;
    value;
    constraint;
    constructor(message, context = {}, code = ValidationErrorCode.INVALID_INPUT) {
        super(message, code, context, { severity: 'low', type: 'operational' });
        this.field = context.field;
        this.value = context.value;
        this.constraint = context.constraint;
    }
}
/**
 * Authentication error for auth failures.
 */
export class AuthenticationError extends SecurityError {
    constructor(message, context = {}, code = AuthenticationErrorCode.INVALID_TOKEN) {
        super(message, code, context, { severity: 'high', type: 'operational' });
    }
}
/**
 * Authorization error for permission failures.
 */
export class AuthorizationError extends SecurityError {
    constructor(message, context = {}, code = AuthorizationErrorCode.PERMISSION_DENIED) {
        super(message, code, context, { severity: 'medium', type: 'operational' });
    }
}
/**
 * Integrity error for data integrity violations.
 */
export class IntegrityError extends SecurityError {
    expectedHash;
    actualHash;
    constructor(message, context = {}, code = IntegrityErrorCode.CHECKSUM_MISMATCH) {
        super(message, code, context, { severity: 'critical', type: 'operational' });
        this.expectedHash = context.expectedHash ?? context.expectedChecksum;
        this.actualHash = context.actualHash ?? context.actualChecksum;
    }
}
/**
 * Rate limit error for throttling.
 */
export class RateLimitError extends SecurityError {
    limit;
    current;
    resetAt;
    retryAfter;
    constructor(message, context = {}, code = RateLimitErrorCode.RATE_EXCEEDED) {
        super(message, code, context, { severity: 'low', type: 'operational' });
        this.limit = context.limit;
        this.current = context.current;
        this.resetAt = context.resetAt;
        this.retryAfter = context.retryAfter;
    }
}
/**
 * Circuit breaker error for service protection.
 */
export class CircuitBreakerError extends SecurityError {
    constructor(message, context = {}, code = CircuitBreakerErrorCode.CIRCUIT_OPEN) {
        super(message, code, context, { severity: 'high', type: 'operational' });
    }
}
/**
 * External service error for API failures.
 */
export class ExternalServiceError extends SecurityError {
    service;
    statusCode;
    constructor(message, context = {}, code = ExternalServiceErrorCode.NETWORK_ERROR) {
        super(message, code, context, { severity: 'high', type: 'operational' });
        this.service = context.service;
        this.statusCode = context.statusCode;
    }
}
/**
 * Database error for database operation failures.
 */
export class DatabaseError extends SecurityError {
    table;
    sqlState;
    constructor(message, context = {}, code = DatabaseErrorCode.QUERY_FAILED) {
        super(message, code, context, { severity: 'high', type: 'operational' });
        this.table = context.table;
        this.sqlState = context.sqlState;
    }
}
/**
 * Configuration error for config failures.
 */
export class ConfigurationError extends SecurityError {
    constructor(message, context = {}, code = ConfigurationErrorCode.INVALID_CONFIG) {
        super(message, code, context, { severity: 'critical', type: 'programming' });
    }
}
/**
 * Internal error for unexpected failures.
 */
export class InternalError extends SecurityError {
    constructor(message, context = {}, code = InternalErrorCode.UNEXPECTED_ERROR, cause) {
        super(message, code, context, { severity: 'critical', type: 'programming', cause });
    }
}
// ============================================================================
// Type Guards
// ============================================================================
/**
 * Check if error is a SecurityError.
 */
export function isSecurityError(error) {
    return error instanceof SecurityError;
}
/**
 * Check if error is a specific category.
 */
export function isErrorCategory(error, category) {
    return isSecurityError(error) && error.category === category;
}
/**
 * Check if error is operational (expected, can be handled).
 */
export function isOperationalError(error) {
    return isSecurityError(error) && error.type === 'operational';
}
/**
 * Check if error is a programming error (bug, unexpected).
 */
export function isProgrammingError(error) {
    return isSecurityError(error) && error.type === 'programming';
}
/**
 * Check if error has specific code.
 */
export function hasErrorCode(error, code) {
    return isSecurityError(error) && error.code === code;
}
// ============================================================================
// Error Wrapping
// ============================================================================
/**
 * Wrap an unknown error as a SecurityError.
 */
export function wrapError(error, context = {}) {
    if (isSecurityError(error)) {
        return error;
    }
    if (error instanceof Error) {
        return new InternalError(error.message, { ...context, metadata: { originalName: error.name } }, InternalErrorCode.UNEXPECTED_ERROR, error);
    }
    return new InternalError(String(error), context, InternalErrorCode.UNEXPECTED_ERROR);
}
/**
 * Create a ValidationError for a missing required field.
 */
export function missingRequired(field, context = {}) {
    return new ValidationError(`Missing required field: ${field}`, { ...context, field }, ValidationErrorCode.MISSING_REQUIRED);
}
/**
 * Create a ValidationError for an invalid format.
 */
export function invalidFormat(field, value, expected, context = {}) {
    return new ValidationError(`Invalid format for ${field}: expected ${expected}`, { ...context, field, value, expected }, ValidationErrorCode.INVALID_FORMAT);
}
/**
 * Create a DatabaseError for record not found.
 */
export function notFound(table, id, context = {}) {
    return new DatabaseError(`Record not found in ${table}: ${id}`, { ...context, table, metadata: { id: String(id) } }, DatabaseErrorCode.RECORD_NOT_FOUND);
}
/**
 * Create an AuthorizationError for permission denied.
 */
export function permissionDenied(operation, context = {}) {
    return new AuthorizationError(`Permission denied for operation: ${operation}`, { ...context, operation }, AuthorizationErrorCode.PERMISSION_DENIED);
}
