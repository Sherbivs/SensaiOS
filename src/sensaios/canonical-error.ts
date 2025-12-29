/**
 * SensaiOS Canonical Error — Structured Error with Detection & Routing
 * 
 * CanonicalError is the structured error format that all errors are converted
 * to before routing. It provides:
 * - Automatic category detection
 * - Severity inference
 * - Fingerprinting for deduplication
 * - Recovery suggestions
 * - Full TenantScope context
 * 
 * @module sensaios/canonical-error
 * @since 2025-12-28
 */

import { randomUUID, createHash } from 'node:crypto';
import type { TenantScope } from './tenant-scope.js';
import type { ErrorCategory, ErrorSeverity, RecoverySuggestion } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * CanonicalError — The structured error format for SensaiOS
 * 
 * All errors flowing through SensaiOS are converted to this format.
 * This enables consistent handling, routing, and analysis.
 */
export interface CanonicalError extends Error {
  /** Unique error ID (UUID) */
  readonly id: string;

  /** ISO timestamp when error was captured */
  readonly timestamp: string;

  /** Error category for routing */
  readonly category: ErrorCategory;

  /** Severity level for routing */
  readonly severity: ErrorSeverity;

  /** Error code (derived from name + category) */
  readonly code: string;

  /** Fingerprint for deduplication */
  readonly fingerprint: string;

  /** Tenant scope (REQUIRED) */
  readonly scope: TenantScope;

  /** Correlation ID for tracing */
  readonly correlationId?: string;

  /** Additional context */
  readonly context?: Record<string, unknown>;

  /** Recovery suggestions */
  readonly recovery?: RecoverySuggestion[];

  /** Original error (if wrapped) */
  readonly cause?: Error;

  /** Whether this is a CanonicalError */
  readonly isCanonical: true;
}

/**
 * Options for converting an error to CanonicalError
 */
export interface ToCanonicalErrorOptions {
  /** Correlation ID */
  correlationId?: string;

  /** Additional context to attach */
  context?: Record<string, unknown>;

  /** Override detected category */
  category?: ErrorCategory;

  /** Override inferred severity */
  severity?: ErrorSeverity;

  /** Custom recovery suggestions */
  recovery?: RecoverySuggestion[];
}

// ============================================================================
// CATEGORY DETECTION
// ============================================================================

/**
 * Pattern matchers for error category detection
 */
const CATEGORY_PATTERNS: Array<{
  category: ErrorCategory;
  patterns: RegExp[];
}> = [
  {
    category: 'validation',
    patterns: [
      /validation/i,
      /invalid/i,
      /required/i,
      /must be/i,
      /expected/i,
      /schema/i,
      /parse error/i,
      /malformed/i,
    ],
  },
  {
    category: 'database',
    patterns: [
      /prisma/i,
      /database/i,
      /postgresql/i,
      /postgres/i,
      /sql/i,
      /connection.*refused/i,
      /ECONNREFUSED.*5432/i,
      /unique constraint/i,
      /foreign key/i,
      /deadlock/i,
      /transaction/i,
    ],
  },
  {
    category: 'network',
    patterns: [
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /ENOTFOUND/i,
      /ECONNRESET/i,
      /socket hang up/i,
      /network/i,
      /fetch failed/i,
      /request failed/i,
      /timeout/i,
      /EHOSTUNREACH/i,
    ],
  },
  {
    category: 'auth',
    patterns: [
      /unauthorized/i,
      /forbidden/i,
      /authentication/i,
      /permission/i,
      /access denied/i,
      /invalid token/i,
      /expired token/i,
      /401/,
      /403/,
    ],
  },
  {
    category: 'discord',
    patterns: [
      /discord/i,
      /interaction/i,
      /rate limit/i,
      /unknown interaction/i,
      /invalid webhook/i,
      /missing access/i,
      /missing permissions/i,
      /DiscordAPIError/i,
    ],
  },
  {
    category: 'worker',
    patterns: [
      /worker/i,
      /job failed/i,
      /queue/i,
      /background/i,
      /cron/i,
      /scheduler/i,
    ],
  },
  {
    category: 'game',
    patterns: [
      /battle/i,
      /pokemon/i,
      /trainer/i,
      /encounter/i,
      /homestead/i,
      /inventory/i,
      /move/i,
      /evolution/i,
    ],
  },
  {
    category: 'system',
    patterns: [
      /out of memory/i,
      /heap/i,
      /ENOMEM/i,
      /ENOSPC/i,
      /disk full/i,
      /memory limit/i,
      /fatal/i,
      /segmentation/i,
    ],
  },
];

/**
 * Detect error category from error properties
 */
export function detectCategory(error: Error): ErrorCategory {
  const searchText = `${error.name} ${error.message} ${error.stack ?? ''}`;

  for (const { category, patterns } of CATEGORY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(searchText)) {
        return category;
      }
    }
  }

  return 'unknown';
}

// ============================================================================
// SEVERITY INFERENCE
// ============================================================================

/**
 * Severity rules based on category and patterns
 */
const SEVERITY_RULES: Array<{
  severity: ErrorSeverity;
  categories?: ErrorCategory[];
  patterns?: RegExp[];
}> = [
  // Critical patterns
  {
    severity: 'critical',
    patterns: [
      /fatal/i,
      /out of memory/i,
      /ENOMEM/i,
      /ENOSPC/i,
      /crash/i,
      /unrecoverable/i,
      /data corruption/i,
      /database.*down/i,
    ],
  },
  // High severity categories
  {
    severity: 'high',
    categories: ['database', 'auth', 'system'],
  },
  // High severity patterns
  {
    severity: 'high',
    patterns: [
      /TypeError/i,
      /ReferenceError/i,
      /connection.*refused/i,
      /ECONNREFUSED/i,
    ],
  },
  // Medium severity categories
  {
    severity: 'medium',
    categories: ['network', 'discord', 'worker'],
  },
  // Medium severity patterns
  {
    severity: 'medium',
    patterns: [
      /timeout/i,
      /rate limit/i,
      /retry/i,
    ],
  },
  // Low severity categories
  {
    severity: 'low',
    categories: ['validation', 'game'],
  },
];

/**
 * Infer error severity from category and error properties
 */
export function inferSeverity(
  error: Error,
  category: ErrorCategory
): ErrorSeverity {
  const searchText = `${error.name} ${error.message}`;

  for (const rule of SEVERITY_RULES) {
    // Check patterns first (higher priority)
    if (rule.patterns) {
      for (const pattern of rule.patterns) {
        if (pattern.test(searchText)) {
          return rule.severity;
        }
      }
    }

    // Then check categories
    if (rule.categories?.includes(category)) {
      return rule.severity;
    }
  }

  // Default based on category
  if (category === 'unknown') {
    return 'medium';
  }

  return 'low';
}

// ============================================================================
// FINGERPRINTING
// ============================================================================

/**
 * Generate a stable fingerprint for error deduplication
 * 
 * Uses: error name + first line of message + first stack frame
 */
export function generateFingerprint(error: Error): string {
  const messagePart = error.message.split('\n')[0].substring(0, 100);
  const stackPart = error.stack?.split('\n')[1]?.trim().substring(0, 100) ?? '';

  const raw = `${error.name}:${messagePart}:${stackPart}`;
  return createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

// ============================================================================
// ERROR CODE GENERATION
// ============================================================================

/**
 * Generate an error code from name and category
 * 
 * @example "ERR_DATABASE_PRISMA_CONNECTION"
 * @example "ERR_VALIDATION_SCHEMA"
 */
export function generateErrorCode(error: Error, category: ErrorCategory): string {
  const namePart = error.name
    .replace(/Error$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .substring(0, 20);

  return `ERR_${category.toUpperCase()}_${namePart || 'UNKNOWN'}`;
}

// ============================================================================
// RECOVERY SUGGESTIONS
// ============================================================================

/**
 * Default recovery suggestions by category
 */
const RECOVERY_SUGGESTIONS: Record<ErrorCategory, RecoverySuggestion[]> = {
  validation: [
    {
      action: 'Check input format and try again',
      rationale: 'Input validation failed',
      automatic: false,
      confidence: 0.8,
    },
  ],
  database: [
    {
      action: 'Retry the operation',
      rationale: 'Database connections can be transient',
      automatic: true,
      confidence: 0.6,
    },
    {
      action: 'Check database connection status',
      rationale: 'Connection may be down',
      automatic: false,
      confidence: 0.7,
    },
  ],
  network: [
    {
      action: 'Retry after a short delay',
      rationale: 'Network issues are often transient',
      automatic: true,
      confidence: 0.7,
    },
  ],
  auth: [
    {
      action: 'Verify credentials and permissions',
      rationale: 'Authentication or authorization failed',
      automatic: false,
      confidence: 0.9,
    },
  ],
  discord: [
    {
      action: 'Wait and retry',
      rationale: 'Discord rate limits are temporary',
      automatic: true,
      confidence: 0.8,
    },
  ],
  worker: [
    {
      action: 'Check worker logs and restart if needed',
      rationale: 'Worker may have crashed',
      automatic: false,
      confidence: 0.6,
    },
  ],
  game: [
    {
      action: 'Try the action again',
      rationale: 'Game state may have changed',
      automatic: false,
      confidence: 0.5,
    },
  ],
  system: [
    {
      action: 'Check system resources (memory, disk)',
      rationale: 'System resources may be exhausted',
      automatic: false,
      confidence: 0.8,
    },
    {
      action: 'Restart the service',
      rationale: 'Service may be in a bad state',
      automatic: false,
      confidence: 0.6,
    },
  ],
  unknown: [
    {
      action: 'Check logs for more details',
      rationale: 'Error type is unknown',
      automatic: false,
      confidence: 0.4,
    },
  ],
};

/**
 * Get recovery suggestions for an error
 */
export function getRecoverySuggestions(
  category: ErrorCategory,
  custom?: RecoverySuggestion[]
): RecoverySuggestion[] {
  const defaults = RECOVERY_SUGGESTIONS[category] ?? [];
  return custom ? [...custom, ...defaults] : defaults;
}

// ============================================================================
// TYPE GUARD
// ============================================================================

/**
 * Check if an error is already a CanonicalError
 */
export function isCanonicalError(error: unknown): error is CanonicalError {
  return (
    error instanceof Error &&
    'isCanonical' in error &&
    (error as CanonicalError).isCanonical === true
  );
}

// ============================================================================
// CONVERSION
// ============================================================================

/**
 * Convert any error to a CanonicalError
 * 
 * If the error is already a CanonicalError, returns it unchanged.
 * Otherwise, wraps it with full context and metadata.
 */
export function toCanonicalError(
  error: unknown,
  scope: TenantScope,
  options: ToCanonicalErrorOptions = {}
): CanonicalError {
  // Already canonical — return as-is
  if (isCanonicalError(error)) {
    return error;
  }

  // Convert to Error if not already
  const sourceError =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : String(error));

  // Detect category and severity
  const category = options.category ?? detectCategory(sourceError);
  const severity = options.severity ?? inferSeverity(sourceError, category);

  // Generate identifiers
  const id = randomUUID();
  const fingerprint = generateFingerprint(sourceError);
  const code = generateErrorCode(sourceError, category);

  // Get recovery suggestions
  const recovery = getRecoverySuggestions(category, options.recovery);

  // Create CanonicalError
  const canonical: CanonicalError = Object.assign(
    new Error(sourceError.message),
    {
      id,
      timestamp: new Date().toISOString(),
      name: sourceError.name,
      message: sourceError.message,
      stack: sourceError.stack,
      category,
      severity,
      code,
      fingerprint,
      scope,
      correlationId: options.correlationId,
      context: options.context,
      recovery,
      cause: sourceError,
      isCanonical: true as const,
    }
  );

  return canonical;
}

// ============================================================================
// SERIALIZATION
// ============================================================================

/**
 * Serialize a CanonicalError to a plain object (for JSON)
 */
export function serializeCanonicalError(error: CanonicalError): Record<string, unknown> {
  return {
    id: error.id,
    timestamp: error.timestamp,
    name: error.name,
    message: error.message,
    category: error.category,
    severity: error.severity,
    code: error.code,
    fingerprint: error.fingerprint,
    scope: error.scope,
    correlationId: error.correlationId,
    context: error.context,
    recovery: error.recovery,
    stack: error.stack,
    cause: error.cause
      ? {
          name: error.cause.name,
          message: error.cause.message,
          stack: error.cause.stack,
        }
      : undefined,
  };
}

/**
 * Create a short summary of the error for logs
 */
export function summarizeError(error: CanonicalError): string {
  return `[${error.severity.toUpperCase()}] ${error.code}: ${error.message} (${error.fingerprint})`;
}
