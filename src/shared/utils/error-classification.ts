/**
 * Error Classification System
 * ===========================
 * 
 * Categorizes errors for appropriate handling, alerting, and user messaging.
 * Provides structured error analysis to improve debugging and incident response.
 *
 * Features:
 * - Severity levels (operational, programmer, dependency, security, resource)
 * - Category classification (validation, database, discord_api, etc.)
 * - Pattern-based matching for automatic classification
 * - Retry recommendations based on error type
 * - User-friendly message generation
 * - Stable fingerprints for error deduplication
 *
 * @module shared/utils/error-classification
 * @see docs/development-bible/10-dead-code-analysis.md
 * @since 2025-12-21
 */

import * as crypto from 'crypto';

// ============================================================================
// Enums and Types
// ============================================================================

/**
 * Error severity levels.
 * Determines how critical an error is and what action to take.
 */
export enum ErrorSeverity {
  /** Expected errors from user input or normal operation */
  OPERATIONAL = 'operational',
  
  /** Bugs that should never happen - programming errors */
  PROGRAMMER = 'programmer',
  
  /** External service failures (DB, Discord API, etc.) */
  DEPENDENCY = 'dependency',
  
  /** Security-related errors (auth, permissions) */
  SECURITY = 'security',
  
  /** Resource exhaustion (memory, connections, rate limits) */
  RESOURCE = 'resource',
}

/**
 * Error categories for fine-grained classification.
 */
export enum ErrorCategory {
  // Operational
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  USER_INPUT = 'user_input',
  
  // Programmer
  TYPE_ERROR = 'type_error',
  NULL_REFERENCE = 'null_reference',
  ASSERTION = 'assertion',
  LOGIC_ERROR = 'logic_error',
  
  // Dependency
  DATABASE = 'database',
  DISCORD_API = 'discord_api',
  EXTERNAL_SERVICE = 'external_service',
  NETWORK = 'network',
  
  // Security
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMITED = 'rate_limited',
  PERMISSION_DENIED = 'permission_denied',
  
  // Resource
  MEMORY = 'memory',
  TIMEOUT = 'timeout',
  QUOTA = 'quota',
  CONNECTION_POOL = 'connection_pool',
  
  // Catch-all
  UNKNOWN = 'unknown',
}

/**
 * Alert levels for error notifications.
 */
export type AlertLevel = 'none' | 'log' | 'warn' | 'alert' | 'page';

/**
 * Classified error with full metadata.
 */
export interface ClassifiedError {
  /** Error severity level */
  severity: ErrorSeverity;
  
  /** Error category */
  category: ErrorCategory;
  
  /** Stable fingerprint for deduplication */
  fingerprint: string;
  
  /** Whether the error is retryable */
  retryable: boolean;
  
  /** Whether to show error details to user */
  userFacing: boolean;
  
  /** Alert level for notifications */
  alertLevel: AlertLevel;
  
  /** Suggested action for developers */
  suggestedAction: string;
  
  /** Original error message (may be scrubbed) */
  originalMessage: string;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

interface ErrorPattern {
  patterns: RegExp[];
  classification: Partial<Omit<ClassifiedError, 'fingerprint' | 'originalMessage'>>;
}

/**
 * Pattern matching rules for error classification.
 * Order matters - first match wins.
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Database errors
  // ─────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      /ECONNREFUSED.*postgres/i,
      /connection.*refused.*5432/i,
      /P1001/i,  // Prisma: Can't reach database server
      /P1002/i,  // Prisma: Server timeout
      /P1008/i,  // Prisma: Operations timed out
      /P1009/i,  // Prisma: Database already exists
      /P1010/i,  // Prisma: Access denied
    ],
    classification: {
      severity: ErrorSeverity.DEPENDENCY,
      category: ErrorCategory.DATABASE,
      retryable: true,
      userFacing: false,
      alertLevel: 'alert',
      suggestedAction: 'Check database connectivity, connection pool, and credentials',
    },
  },
  {
    patterns: [
      /P2002/i,  // Prisma: Unique constraint violation
      /P2003/i,  // Prisma: Foreign key constraint failed
      /P2025/i,  // Prisma: Record not found
      /duplicate.*key.*value/i,
      /violates.*constraint/i,
    ],
    classification: {
      severity: ErrorSeverity.OPERATIONAL,
      category: ErrorCategory.CONFLICT,
      retryable: false,
      userFacing: true,
      alertLevel: 'log',
      suggestedAction: 'Handle constraint violation gracefully - likely duplicate or missing record',
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Discord API errors
  // ─────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      /DiscordAPIError\[50001\]/i,  // Missing Access
      /Missing Permissions/i,
      /Missing Access/i,
    ],
    classification: {
      severity: ErrorSeverity.SECURITY,
      category: ErrorCategory.PERMISSION_DENIED,
      retryable: false,
      userFacing: true,
      alertLevel: 'warn',
      suggestedAction: 'Check bot permissions in the server/channel',
    },
  },
  {
    patterns: [
      /DiscordAPIError\[10008\]/i,  // Unknown Message
      /DiscordAPIError\[10062\]/i,  // Unknown Interaction
      /Unknown interaction/i,
      /Unknown Message/i,
    ],
    classification: {
      severity: ErrorSeverity.OPERATIONAL,
      category: ErrorCategory.NOT_FOUND,
      retryable: false,
      userFacing: false,
      alertLevel: 'log',
      suggestedAction: 'Interaction expired or message was deleted - safe to ignore',
    },
  },
  {
    patterns: [
      /DiscordAPIError/i,
      /Discord.*error/i,
    ],
    classification: {
      severity: ErrorSeverity.DEPENDENCY,
      category: ErrorCategory.DISCORD_API,
      retryable: true,
      userFacing: false,
      alertLevel: 'warn',
      suggestedAction: 'Check Discord API status and bot token validity',
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Rate limiting
  // ─────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      /rate.*limit/i,
      /429/,
      /too many requests/i,
      /You are being rate limited/i,
    ],
    classification: {
      severity: ErrorSeverity.RESOURCE,
      category: ErrorCategory.RATE_LIMITED,
      retryable: true,
      userFacing: true,
      alertLevel: 'warn',
      suggestedAction: 'Implement exponential backoff and reduce request frequency',
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Validation errors (user input)
  // ─────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      /validation.*fail/i,
      /invalid.*input/i,
      /required.*field/i,
      /must be.*string|number|boolean/i,
      /expected.*but got/i,
    ],
    classification: {
      severity: ErrorSeverity.OPERATIONAL,
      category: ErrorCategory.VALIDATION,
      retryable: false,
      userFacing: true,
      alertLevel: 'none',
      suggestedAction: 'Return user-friendly validation message',
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Type errors (programmer bugs)
  // ─────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      /TypeError/i,
      /Cannot read prop.*of undefined/i,
      /Cannot read prop.*of null/i,
      /is not a function/i,
      /undefined is not/i,
    ],
    classification: {
      severity: ErrorSeverity.PROGRAMMER,
      category: ErrorCategory.TYPE_ERROR,
      retryable: false,
      userFacing: false,
      alertLevel: 'alert',
      suggestedAction: 'Fix null/undefined handling in code - check optional chaining',
    },
  },
  {
    patterns: [
      /ReferenceError/i,
      /is not defined/i,
    ],
    classification: {
      severity: ErrorSeverity.PROGRAMMER,
      category: ErrorCategory.LOGIC_ERROR,
      retryable: false,
      userFacing: false,
      alertLevel: 'alert',
      suggestedAction: 'Variable not defined - check imports and scope',
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Memory errors
  // ─────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      /heap.*memory/i,
      /out of memory/i,
      /allocation failed/i,
      /JavaScript heap/i,
      /FATAL ERROR.*heap/i,
    ],
    classification: {
      severity: ErrorSeverity.RESOURCE,
      category: ErrorCategory.MEMORY,
      retryable: false,
      userFacing: false,
      alertLevel: 'page',
      suggestedAction: 'CRITICAL: Restart service immediately and investigate memory leak',
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Timeout errors
  // ─────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      /timeout/i,
      /ETIMEDOUT/i,
      /ESOCKETTIMEDOUT/i,
      /operation.*timed out/i,
    ],
    classification: {
      severity: ErrorSeverity.DEPENDENCY,
      category: ErrorCategory.TIMEOUT,
      retryable: true,
      userFacing: true,
      alertLevel: 'warn',
      suggestedAction: 'Increase timeout or check external service health',
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Network errors
  // ─────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      /ENOTFOUND/i,
      /ECONNRESET/i,
      /EPIPE/i,
      /network.*error/i,
      /fetch.*failed/i,
    ],
    classification: {
      severity: ErrorSeverity.DEPENDENCY,
      category: ErrorCategory.NETWORK,
      retryable: true,
      userFacing: false,
      alertLevel: 'warn',
      suggestedAction: 'Check network connectivity and DNS resolution',
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Authentication/Authorization
  // ─────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      /unauthorized/i,
      /401/,
      /invalid.*token/i,
      /token.*expired/i,
    ],
    classification: {
      severity: ErrorSeverity.SECURITY,
      category: ErrorCategory.AUTHENTICATION,
      retryable: false,
      userFacing: true,
      alertLevel: 'warn',
      suggestedAction: 'Check authentication credentials and token validity',
    },
  },
  {
    patterns: [
      /forbidden/i,
      /403/,
      /access.*denied/i,
      /not.*authorized/i,
    ],
    classification: {
      severity: ErrorSeverity.SECURITY,
      category: ErrorCategory.AUTHORIZATION,
      retryable: false,
      userFacing: true,
      alertLevel: 'warn',
      suggestedAction: 'User lacks permission for this action',
    },
  },
];

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Generate a stable fingerprint for error deduplication.
 * Uses error type + first line of stack trace for uniqueness.
 */
function generateFingerprint(error: Error): string {
  // Extract first meaningful stack line (skip error message line)
  const stackLine = error.stack?.split('\n')[1]?.trim() || '';
  
  // Remove variable parts (line numbers, memory addresses)
  const normalizedStack = stackLine
    .replace(/:\d+:\d+/g, ':X:X')  // Normalize line:column
    .replace(/0x[0-9a-f]+/gi, '0xX');  // Normalize memory addresses
  
  // Create fingerprint from error name + message prefix + normalized stack
  const input = `${error.name}:${error.message.slice(0, 100)}:${normalizedStack}`;
  
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Classify an error based on patterns and heuristics.
 * @param error - The error to classify (can be Error, string, or unknown)
 * @returns Classified error with full metadata
 */
export function classifyError(error: unknown): ClassifiedError {
  // Extract error message and stack
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : '';
  const fullText = `${errorMessage} ${errorStack}`;
  
  // Generate fingerprint
  const fingerprint = error instanceof Error 
    ? generateFingerprint(error) 
    : crypto.createHash('sha256').update(errorMessage).digest('hex').slice(0, 16);
  
  // Default classification (unknown programmer error)
  let classification: ClassifiedError = {
    severity: ErrorSeverity.PROGRAMMER,
    category: ErrorCategory.UNKNOWN,
    fingerprint,
    retryable: false,
    userFacing: false,
    alertLevel: 'alert',
    suggestedAction: 'Investigate and fix the bug',
    originalMessage: errorMessage,
  };
  
  // Match against patterns (first match wins)
  for (const { patterns, classification: partial } of ERROR_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(fullText)) {
        classification = { 
          ...classification, 
          ...partial,
          originalMessage: errorMessage,
        };
        return classification;
      }
    }
  }
  
  return classification;
}

/**
 * Determine if an error should be retried.
 * @param error - The error to check
 * @param attempt - Current attempt number (1-based)
 * @param maxAttempts - Maximum retry attempts (default: 3)
 * @returns true if the error can be retried
 */
export function shouldRetry(
  error: unknown, 
  attempt: number, 
  maxAttempts: number = 3
): boolean {
  if (attempt >= maxAttempts) return false;
  
  const classified = classifyError(error);
  return classified.retryable;
}

/**
 * Get a user-facing error message.
 * Returns a safe, friendly message that doesn't leak internals.
 * @param error - The error to get a message for
 * @returns User-friendly error message
 */
export function getUserMessage(error: unknown): string {
  const classified = classifyError(error);
  
  // If not user-facing, return generic message
  if (!classified.userFacing) {
    return 'An unexpected error occurred. Please try again later.';
  }
  
  // Return category-specific messages
  switch (classified.category) {
    case ErrorCategory.VALIDATION:
    case ErrorCategory.USER_INPUT:
      // For validation errors, the original message is usually safe
      return error instanceof Error ? error.message : 'Invalid input provided.';
      
    case ErrorCategory.NOT_FOUND:
      return 'The requested resource was not found.';
      
    case ErrorCategory.CONFLICT:
      return 'This action conflicts with existing data. Please refresh and try again.';
      
    case ErrorCategory.RATE_LIMITED:
      return 'Too many requests. Please wait a moment and try again.';
      
    case ErrorCategory.AUTHENTICATION:
      return 'Authentication failed. Please check your credentials.';
      
    case ErrorCategory.AUTHORIZATION:
    case ErrorCategory.PERMISSION_DENIED:
      return 'You do not have permission to perform this action.';
      
    case ErrorCategory.TIMEOUT:
      return 'The request timed out. Please try again.';
      
    case ErrorCategory.DATABASE:
    case ErrorCategory.NETWORK:
    case ErrorCategory.EXTERNAL_SERVICE:
      return 'A temporary service issue occurred. Please try again in a few moments.';
      
    default:
      return 'Something went wrong. Please try again.';
  }
}

/**
 * Calculate recommended retry delay using exponential backoff.
 * @param attempt - Current attempt number (1-based)
 * @param baseDelayMs - Base delay in milliseconds (default: 1000)
 * @param maxDelayMs - Maximum delay cap (default: 30000)
 * @returns Delay in milliseconds before next retry
 */
export function getRetryDelay(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000
): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
  
  // Add jitter (±10%) to prevent thundering herd
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  
  return Math.round(delay + jitter);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if an error is operational (expected) vs programmer error.
 */
export function isOperationalError(error: unknown): boolean {
  const classified = classifyError(error);
  return classified.severity === ErrorSeverity.OPERATIONAL;
}

/**
 * Check if an error requires immediate attention (page-level).
 */
export function requiresImmediate(error: unknown): boolean {
  const classified = classifyError(error);
  return classified.alertLevel === 'page';
}

/**
 * Get the alert level for an error.
 */
export function getAlertLevel(error: unknown): AlertLevel {
  return classifyError(error).alertLevel;
}

// ============================================================================
// Export All
// ============================================================================

export {
  generateFingerprint,
  ERROR_PATTERNS,
};
