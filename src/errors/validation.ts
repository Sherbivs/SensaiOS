/**
 * Validation Error Types
 * ======================
 *
 * Error classes for input validation including user input,
 * API requests, and data integrity checks.
 *
 * @module errors/validation
 * @since 2025-12-16
 *
 * @example
 * ```typescript
 * import { ValidationError, RequiredFieldError, InvalidFormatError } from './validation.js';
 *
 * // Missing required field
 * throw new RequiredFieldError('username', {
 *   endpoint: '/api/register',
 * });
 *
 * // Invalid format
 * throw new InvalidFormatError('email', 'abc123', 'valid email address', {
 *   endpoint: '/api/register',
 * });
 * ```
 */

import { AppError, type ErrorContext, type ErrorSeverity } from "./base.js";

// ============================================================================
// Error Codes
// ============================================================================

export const ValidationErrorCode = {
  // Field errors
  INVALID_INPUT: "VAL_001",
  REQUIRED_FIELD: "VAL_002",
  INVALID_FORMAT: "VAL_003",
  OUT_OF_RANGE: "VAL_004",
  INVALID_ENUM: "VAL_005",
  INVALID_LENGTH: "VAL_006",
  INVALID_TYPE: "VAL_007",
  
  // Constraint errors
  CONSTRAINT_VIOLATION: "VAL_CNS_001",
  UNIQUE_VIOLATION: "VAL_CNS_002",
  REFERENCE_VIOLATION: "VAL_CNS_003",
  
  // Business rule errors
  BUSINESS_RULE_VIOLATION: "VAL_BIZ_001",
  STATE_INVALID: "VAL_BIZ_002",
  PRECONDITION_FAILED: "VAL_BIZ_003",
  
  // Schema errors
  SCHEMA_MISMATCH: "VAL_SCH_001",
  MISSING_PROPERTIES: "VAL_SCH_002",
  EXTRA_PROPERTIES: "VAL_SCH_003",
} as const;

export type ValidationErrorCodeType = typeof ValidationErrorCode[keyof typeof ValidationErrorCode];

// ============================================================================
// Error Contexts
// ============================================================================

export interface ValidationContext extends ErrorContext {
  /** Field name that failed validation */
  field?: string;
  /** Value that failed validation (sanitized) */
  value?: unknown;
  /** Expected constraint/format */
  constraint?: string;
  /** Endpoint or operation being validated */
  endpoint?: string;
}

export interface RangeContext extends ValidationContext {
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Actual value */
  actual?: number;
}

export interface LengthContext extends ValidationContext {
  /** Minimum length */
  minLength?: number;
  /** Maximum length */
  maxLength?: number;
  /** Actual length */
  actualLength?: number;
}

export interface EnumContext extends ValidationContext {
  /** Allowed values */
  allowedValues?: string[];
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base class for all validation errors.
 */
export class ValidationError extends AppError {
  readonly field?: string;
  readonly value?: unknown;
  readonly constraint?: string;

  constructor(
    message: string,
    code: ValidationErrorCodeType = ValidationErrorCode.INVALID_INPUT,
    context: ValidationContext = {},
    options?: { severity?: ErrorSeverity; cause?: Error }
  ) {
    super(message, code, context, {
      severity: options?.severity ?? "low",
      type: "operational",
      cause: options?.cause,
    });
    this.field = context.field;
    this.value = context.value;
    this.constraint = context.constraint;
  }
}

/**
 * Required field missing.
 */
export class RequiredFieldError extends ValidationError {
  constructor(field: string, context: ValidationContext = {}) {
    super(
      `Required field missing: ${field}`,
      ValidationErrorCode.REQUIRED_FIELD,
      { ...context, field }
    );
  }
}

/**
 * Invalid format (email, phone, etc).
 */
export class InvalidFormatError extends ValidationError {
  constructor(
    field: string,
    value: unknown,
    expectedFormat: string,
    context: ValidationContext = {}
  ) {
    super(
      `Invalid format for ${field}: expected ${expectedFormat}`,
      ValidationErrorCode.INVALID_FORMAT,
      { ...context, field, value, constraint: expectedFormat }
    );
  }
}

/**
 * Value out of allowed range.
 */
export class OutOfRangeError extends ValidationError {
  readonly min?: number;
  readonly max?: number;
  readonly actual?: number;

  constructor(
    field: string,
    actual: number,
    min: number,
    max: number,
    context: RangeContext = {}
  ) {
    super(
      `${field} out of range: ${actual} (expected ${min}-${max})`,
      ValidationErrorCode.OUT_OF_RANGE,
      { ...context, field, value: actual, constraint: `${min}-${max}` }
    );
    this.min = min;
    this.max = max;
    this.actual = actual;
  }
}

/**
 * Invalid enum value.
 */
export class InvalidEnumError extends ValidationError {
  readonly allowedValues: string[];

  constructor(
    field: string,
    value: unknown,
    allowedValues: string[],
    context: EnumContext = {}
  ) {
    super(
      `Invalid value for ${field}: must be one of [${allowedValues.join(", ")}]`,
      ValidationErrorCode.INVALID_ENUM,
      { ...context, field, value, allowedValues }
    );
    this.allowedValues = allowedValues;
  }
}

/**
 * Invalid length (too short or too long).
 */
export class InvalidLengthError extends ValidationError {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly actualLength: number;

  constructor(
    field: string,
    actualLength: number,
    minLength?: number,
    maxLength?: number,
    context: LengthContext = {}
  ) {
    const constraint = minLength !== undefined && maxLength !== undefined
      ? `${minLength}-${maxLength} characters`
      : minLength !== undefined
        ? `at least ${minLength} characters`
        : `at most ${maxLength} characters`;
    
    super(
      `Invalid length for ${field}: ${actualLength} (expected ${constraint})`,
      ValidationErrorCode.INVALID_LENGTH,
      { ...context, field, actualLength, minLength, maxLength }
    );
    this.minLength = minLength;
    this.maxLength = maxLength;
    this.actualLength = actualLength;
  }
}

/**
 * Invalid type.
 */
export class InvalidTypeError extends ValidationError {
  readonly expectedType: string;
  readonly actualType: string;

  constructor(
    field: string,
    expectedType: string,
    actualType: string,
    context: ValidationContext = {}
  ) {
    super(
      `Invalid type for ${field}: expected ${expectedType}, got ${actualType}`,
      ValidationErrorCode.INVALID_TYPE,
      { ...context, field, constraint: expectedType }
    );
    this.expectedType = expectedType;
    this.actualType = actualType;
  }
}

/**
 * Business rule violation.
 */
export class BusinessRuleError extends ValidationError {
  readonly rule: string;

  constructor(rule: string, message: string, context: ValidationContext = {}) {
    super(
      message,
      ValidationErrorCode.BUSINESS_RULE_VIOLATION,
      { ...context, constraint: rule },
      { severity: "medium" }
    );
    this.rule = rule;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isRequiredFieldError(error: unknown): error is RequiredFieldError {
  return error instanceof RequiredFieldError;
}

export function isBusinessRuleError(error: unknown): error is BusinessRuleError {
  return error instanceof BusinessRuleError;
}
