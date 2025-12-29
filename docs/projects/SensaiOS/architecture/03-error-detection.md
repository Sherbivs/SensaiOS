# 03 — Error Detection Subsystem

**Component:** Error Detection  
**Status:** SPECIFICATION  
**Created:** 2025-12-28

---

## Overview

The Error Detection Subsystem treats errors as **first-class citizens** in SensaiOS. Rather than catching and logging errors ad-hoc, we capture them in a canonical shape, fingerprint them for deduplication, route them by severity, and provide recovery suggestions.

---

## Design Principles

### 1. **Errors Are Data**
Every error becomes structured data that can be queried, aggregated, and analyzed.

### 2. **Automatic Fingerprinting**
Errors are automatically fingerprinted for deduplication and trending.

### 3. **Severity-Based Routing**
Different severities trigger different responses (log, alert, page).

### 4. **Recovery-Oriented**
Errors include suggested recovery actions where possible.

### 5. **Scoped**
Every error carries a TenantScope for multi-tenant isolation.

---

## Canonical Error Shape

```typescript
import type { TenantScope } from './tenant-scope.js';

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'validation'    // Input validation failures
  | 'database'      // Database errors (Prisma, connection)
  | 'network'       // Network/HTTP errors
  | 'auth'          // Authentication/authorization
  | 'game'          // Game logic errors
  | 'discord'       // Discord API errors
  | 'worker'        // Background job errors
  | 'system'        // System-level errors (memory, disk)
  | 'unknown';      // Uncategorized

/**
 * Severity levels for routing
 */
export type ErrorSeverity =
  | 'low'       // Log only, no action needed
  | 'medium'    // Should investigate, not urgent
  | 'high'      // Needs attention soon
  | 'critical'; // Immediate action required

/**
 * Recovery suggestion
 */
export interface RecoverySuggestion {
  /** What to try */
  action: string;
  
  /** Why this might help */
  rationale?: string;
  
  /** Is this automatic or manual? */
  automatic: boolean;
  
  /** Confidence level (0-1) */
  confidence: number;
}

/**
 * CanonicalError — The standard error shape in SensaiOS
 * 
 * All errors should be converted to this shape for consistent
 * handling, logging, and analysis.
 */
export interface CanonicalError {
  /**
   * Unique identifier (ULID)
   */
  id: string;

  /**
   * ISO-8601 timestamp
   */
  timestamp: string;

  /**
   * Error classification
   */
  category: ErrorCategory;

  /**
   * Severity level for routing
   */
  severity: ErrorSeverity;

  /**
   * Human-readable message
   */
  message: string;

  /**
   * Machine-readable error code
   * 
   * @example "ERR_DB_CONNECTION_FAILED"
   * @example "ERR_VALIDATION_INVALID_MOVE"
   * @example "ERR_DISCORD_RATE_LIMITED"
   */
  code: string;

  /**
   * Fingerprint for deduplication
   * 
   * Errors with the same fingerprint are considered duplicates.
   * Generated from: category + code + stack (first 3 frames)
   */
  fingerprint: string;

  /**
   * Tenant scope
   */
  scope: TenantScope;

  /**
   * Correlation ID for tracing
   */
  correlationId?: string;

  /**
   * Original error name (e.g., "TypeError", "PrismaClientKnownRequestError")
   */
  name: string;

  /**
   * Stack trace (sanitized, no secrets)
   */
  stack?: string;

  /**
   * Additional context
   */
  context?: Record<string, unknown>;

  /**
   * Recovery suggestions
   */
  recovery?: RecoverySuggestion[];

  /**
   * Cause chain (for wrapped errors)
   */
  cause?: CanonicalError;

  /**
   * Has this error been acknowledged/handled?
   */
  acknowledged?: boolean;

  /**
   * When was it acknowledged?
   */
  acknowledgedAt?: string;

  /**
   * Who/what acknowledged it?
   */
  acknowledgedBy?: string;
}
```

---

## Error Conversion

### From Native Error

```typescript
import { ulid } from 'ulid';

/**
 * Convert any error to CanonicalError
 */
export function toCanonicalError(
  error: unknown,
  scope: TenantScope,
  options: ToCanonicalOptions = {}
): CanonicalError {
  const timestamp = new Date().toISOString();
  const id = ulid();
  
  // Handle different error types
  if (error instanceof Error) {
    const category = detectCategory(error);
    const severity = options.severity ?? inferSeverity(error, category);
    const code = extractErrorCode(error) ?? generateErrorCode(category, error);
    const stack = sanitizeStack(error.stack);
    
    return {
      id,
      timestamp,
      category,
      severity,
      message: error.message,
      code,
      fingerprint: generateFingerprint(category, code, stack),
      scope,
      correlationId: options.correlationId,
      name: error.name,
      stack,
      context: options.context,
      recovery: generateRecoverySuggestions(error, category),
      cause: error.cause ? toCanonicalError(error.cause, scope, options) : undefined,
    };
  }
  
  // Handle non-Error values
  const message = String(error);
  return {
    id,
    timestamp,
    category: 'unknown',
    severity: options.severity ?? 'medium',
    message,
    code: 'ERR_UNKNOWN',
    fingerprint: generateFingerprint('unknown', 'ERR_UNKNOWN', message),
    scope,
    correlationId: options.correlationId,
    name: 'UnknownError',
    context: { originalValue: error, ...options.context },
    recovery: [],
  };
}

interface ToCanonicalOptions {
  severity?: ErrorSeverity;
  correlationId?: string;
  context?: Record<string, unknown>;
}
```

### Category Detection

```typescript
/**
 * Detect error category from error type and message
 */
function detectCategory(error: Error): ErrorCategory {
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  
  // Prisma errors
  if (name.includes('prisma') || error.constructor.name.includes('Prisma')) {
    return 'database';
  }
  
  // Discord.js errors
  if (name.includes('discord') || message.includes('discord')) {
    return 'discord';
  }
  
  // Network errors
  if (
    name.includes('fetch') ||
    message.includes('econnrefused') ||
    message.includes('timeout') ||
    message.includes('network')
  ) {
    return 'network';
  }
  
  // Validation errors
  if (name.includes('validation') || name.includes('typeerror')) {
    return 'validation';
  }
  
  // Auth errors
  if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('401') || message.includes('403')) {
    return 'auth';
  }
  
  // System errors
  if (
    message.includes('memory') ||
    message.includes('heap') ||
    message.includes('disk') ||
    message.includes('enomem')
  ) {
    return 'system';
  }
  
  return 'unknown';
}
```

### Severity Inference

```typescript
/**
 * Infer severity from error characteristics
 */
function inferSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
  // Critical: System-level failures
  if (category === 'system') {
    return 'critical';
  }
  
  // Critical: Database connection failures
  if (category === 'database' && error.message.toLowerCase().includes('connection')) {
    return 'critical';
  }
  
  // High: Auth failures (potential security issue)
  if (category === 'auth') {
    return 'high';
  }
  
  // High: Unhandled promise rejections
  if (error.name === 'UnhandledPromiseRejection') {
    return 'high';
  }
  
  // Medium: Most database and network errors
  if (category === 'database' || category === 'network') {
    return 'medium';
  }
  
  // Low: Validation errors
  if (category === 'validation') {
    return 'low';
  }
  
  return 'medium';
}
```

### Fingerprinting

```typescript
import { createHash } from 'crypto';

/**
 * Generate a fingerprint for error deduplication
 */
function generateFingerprint(
  category: ErrorCategory,
  code: string,
  stack?: string
): string {
  // Extract first 3 stack frames (after error message)
  const stackFrames = stack
    ?.split('\n')
    .slice(1, 4)
    .map(line => line.trim())
    .join('|') ?? '';
  
  const input = `${category}:${code}:${stackFrames}`;
  
  return createHash('sha256')
    .update(input)
    .digest('hex')
    .slice(0, 16);
}
```

### Recovery Suggestions

```typescript
/**
 * Generate recovery suggestions based on error type
 */
function generateRecoverySuggestions(
  error: Error,
  category: ErrorCategory
): RecoverySuggestion[] {
  const suggestions: RecoverySuggestion[] = [];
  
  switch (category) {
    case 'database':
      if (error.message.includes('connection')) {
        suggestions.push({
          action: 'Check database connectivity and connection pool',
          rationale: 'Connection errors often indicate network issues or pool exhaustion',
          automatic: false,
          confidence: 0.8,
        });
        suggestions.push({
          action: 'Retry with exponential backoff',
          rationale: 'Transient connection issues often resolve with retry',
          automatic: true,
          confidence: 0.7,
        });
      }
      if (error.message.includes('unique constraint')) {
        suggestions.push({
          action: 'Check for duplicate data before insert',
          rationale: 'Unique constraint violations indicate duplicate keys',
          automatic: false,
          confidence: 0.9,
        });
      }
      break;
      
    case 'network':
      suggestions.push({
        action: 'Retry with exponential backoff',
        automatic: true,
        confidence: 0.8,
      });
      suggestions.push({
        action: 'Check external service status',
        automatic: false,
        confidence: 0.6,
      });
      break;
      
    case 'discord':
      if (error.message.includes('rate limit')) {
        suggestions.push({
          action: 'Wait for rate limit reset',
          rationale: 'Discord rate limits are time-bound',
          automatic: true,
          confidence: 0.95,
        });
      }
      break;
      
    case 'auth':
      suggestions.push({
        action: 'Verify user permissions',
        automatic: false,
        confidence: 0.7,
      });
      suggestions.push({
        action: 'Check token expiration',
        automatic: false,
        confidence: 0.6,
      });
      break;
      
    case 'validation':
      suggestions.push({
        action: 'Review input data against schema',
        automatic: false,
        confidence: 0.9,
      });
      break;
  }
  
  return suggestions;
}
```

---

## Error Routing

```typescript
/**
 * Route error to appropriate handlers based on severity
 */
export async function routeError(error: CanonicalError): Promise<void> {
  // Always log
  await logError(error);
  
  // Track in error tracker
  await trackError(error);
  
  // Severity-based routing
  switch (error.severity) {
    case 'critical':
      await sendDiscordAlert(error);
      await sendPagerAlert(error);
      break;
      
    case 'high':
      await sendDiscordAlert(error);
      break;
      
    case 'medium':
      // Just log and track
      break;
      
    case 'low':
      // Just log
      break;
  }
}

async function logError(error: CanonicalError): Promise<void> {
  const envelope = createErrorEnvelope(error);
  Kernel.log.error('error.captured', { 
    scope: error.scope,
    envelope,
  });
}

async function trackError(error: CanonicalError): Promise<void> {
  // Increment error counter by fingerprint
  errorTracker.track(error.fingerprint, error);
}

async function sendDiscordAlert(error: CanonicalError): Promise<void> {
  // Send to ops channel
  eventBus.emit('alert.discord', {
    correlationId: error.correlationId,
    payload: formatErrorForDiscord(error),
  });
}

async function sendPagerAlert(error: CanonicalError): Promise<void> {
  // Critical errors page on-call
  eventBus.emit('alert.pager', {
    correlationId: error.correlationId,
    payload: formatErrorForPager(error),
  });
}
```

---

## Error Tracking & Deduplication

```typescript
/**
 * Error tracker for deduplication and trending
 */
export class ErrorTracker {
  private errors = new Map<string, TrackedError>();
  private readonly maxErrors = 1000;
  
  track(fingerprint: string, error: CanonicalError): TrackedError {
    const existing = this.errors.get(fingerprint);
    
    if (existing) {
      existing.count++;
      existing.lastSeen = error.timestamp;
      existing.latestId = error.id;
      return existing;
    }
    
    // Evict oldest if at capacity
    if (this.errors.size >= this.maxErrors) {
      const oldest = this.findOldest();
      if (oldest) this.errors.delete(oldest);
    }
    
    const tracked: TrackedError = {
      fingerprint,
      firstSeen: error.timestamp,
      lastSeen: error.timestamp,
      count: 1,
      latestId: error.id,
      category: error.category,
      severity: error.severity,
      code: error.code,
      message: error.message,
    };
    
    this.errors.set(fingerprint, tracked);
    return tracked;
  }
  
  getTopErrors(limit = 10): TrackedError[] {
    return Array.from(this.errors.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
  
  private findOldest(): string | undefined {
    let oldest: string | undefined;
    let oldestTime = Infinity;
    
    for (const [fp, err] of this.errors) {
      const time = new Date(err.lastSeen).getTime();
      if (time < oldestTime) {
        oldestTime = time;
        oldest = fp;
      }
    }
    
    return oldest;
  }
}

interface TrackedError {
  fingerprint: string;
  firstSeen: string;
  lastSeen: string;
  count: number;
  latestId: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  message: string;
}
```

---

## Integration with runGuarded()

The error detection subsystem is automatically invoked by `runGuarded()`:

```typescript
async function runGuarded<T>(
  handler: () => Promise<T>,
  context: GuardedContext
): Promise<T> {
  try {
    return await handler();
  } catch (error) {
    // Convert to canonical error
    const canonical = toCanonicalError(error, context.scope, {
      correlationId: context.correlationId,
      context: context.metadata,
    });
    
    // Route based on severity
    await routeError(canonical);
    
    // Re-throw for caller handling
    throw canonical;
  }
}
```

---

## Testing

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Error Detection', () => {
  const testScope: TenantScope = {
    tenant: 'test-guild',
    environment: 'development',
    service: 'test-service',
    component: 'test-component',
  };

  describe('toCanonicalError', () => {
    it('should convert Error to CanonicalError', () => {
      const error = new Error('Test error');
      const canonical = toCanonicalError(error, testScope);
      
      expect(canonical.message).toBe('Test error');
      expect(canonical.name).toBe('Error');
      expect(canonical.scope).toEqual(testScope);
      expect(canonical.fingerprint).toBeDefined();
    });

    it('should detect database category', () => {
      const error = new Error('Connection refused');
      error.name = 'PrismaClientKnownRequestError';
      
      const canonical = toCanonicalError(error, testScope);
      
      expect(canonical.category).toBe('database');
    });

    it('should generate recovery suggestions', () => {
      const error = new Error('Connection timeout');
      error.name = 'PrismaClientKnownRequestError';
      
      const canonical = toCanonicalError(error, testScope);
      
      expect(canonical.recovery).toBeDefined();
      expect(canonical.recovery!.length).toBeGreaterThan(0);
    });
  });

  describe('ErrorTracker', () => {
    it('should track errors by fingerprint', () => {
      const tracker = new ErrorTracker();
      const error = toCanonicalError(new Error('Test'), testScope);
      
      const tracked = tracker.track(error.fingerprint, error);
      
      expect(tracked.count).toBe(1);
      
      // Same fingerprint increments count
      tracker.track(error.fingerprint, error);
      expect(tracked.count).toBe(2);
    });

    it('should return top errors', () => {
      const tracker = new ErrorTracker();
      
      const error1 = toCanonicalError(new Error('Error 1'), testScope);
      const error2 = toCanonicalError(new Error('Error 2'), testScope);
      
      // Track error1 three times
      tracker.track(error1.fingerprint, error1);
      tracker.track(error1.fingerprint, error1);
      tracker.track(error1.fingerprint, error1);
      
      // Track error2 once
      tracker.track(error2.fingerprint, error2);
      
      const top = tracker.getTopErrors(2);
      
      expect(top[0].count).toBe(3);
      expect(top[1].count).toBe(1);
    });
  });
});
```

---

## Next Steps

→ Continue to [04-run-guarded.md](./04-run-guarded.md) for the kernel wrapper pattern.
