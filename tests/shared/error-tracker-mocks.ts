/**
 * Error Tracker Test Mocks
 * 
 * Centralized mock factories for error tracker tests.
 * Eliminates duplication across 4+ test files with similar mock patterns.
 * 
 * @module tests/shared/error-tracker-mocks
 * 
 * @example
 * ```typescript
 * import { createMockErrorLog, mockPrismaWithErrorLog } from '../shared/error-tracker-mocks';
 * 
 * const error = createMockErrorLog({ severity: 'HIGH', category: 'DATABASE' });
 * const prisma = mockPrismaWithErrorLog();
 * ```
 */

import { vi } from 'vitest';
import type { ErrorLog } from '@prisma/client';

/**
 * Create a complete ErrorLog object with sensible defaults
 * 
 * @param overrides - Partial ErrorLog to override defaults
 * @returns Complete ErrorLog mock
 */
export function createMockErrorLog(overrides: Partial<ErrorLog> = {}): ErrorLog {
  const now = new Date();
  
  return {
    errorId: overrides.errorId ?? 'test-error-id',
    fingerprint: overrides.fingerprint ?? 'mock-fingerprint',
    category: overrides.category ?? 'VALIDATION',
    severity: overrides.severity ?? 'MEDIUM',
    errorName: overrides.errorName ?? 'Error',
    errorMessage: overrides.errorMessage ?? 'Test error message',
    stackTrace: overrides.stackTrace ?? null,
    contextData: overrides.contextData ?? null,
    firstSeen: overrides.firstSeen ?? now,
    lastSeen: overrides.lastSeen ?? now,
    occurrenceCount: overrides.occurrenceCount ?? 1,
    recoveryAttempted: overrides.recoveryAttempted ?? 0,
    recoverySuccess: overrides.recoverySuccess ?? 0,
    lastRecoveryStrategy: overrides.lastRecoveryStrategy ?? null,
    lastRecoveryOutcome: overrides.lastRecoveryOutcome ?? null,
    impactedFeatures: overrides.impactedFeatures ?? [],
    estimatedUserImpact: overrides.estimatedUserImpact ?? null,
    learningMetadata: overrides.learningMetadata ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

/**
 * Create multiple ErrorLog mocks with incremental IDs
 * 
 * @param count - Number of error logs to create
 * @param template - Template to use for all errors
 * @returns Array of ErrorLog mocks
 */
export function createMockErrorLogs(
  count: number,
  template: Partial<ErrorLog> = {}
): ErrorLog[] {
  return Array.from({ length: count }, (_, i) =>
    createMockErrorLog({
      ...template,
      errorId: `error-${i + 1}`,
      fingerprint: `fp-${i + 1}`,
    })
  );
}

/**
 * Create a mock Prisma client with ErrorLog methods
 * 
 * @returns Mock Prisma client with vi.fn() methods
 */
export function mockPrismaWithErrorLog() {
  return {
    errorLog: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
  };
}

/**
 * Create a mock logger for tests
 * 
 * @returns Mock logger with vi.fn() methods
 */
export function mockLogger() {
  return {
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/**
 * Create a mock Event Bus for tests
 * 
 * @returns Mock Event Bus with vi.fn() methods
 */
export function mockEventBus() {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
    listenerCount: vi.fn(),
    getStats: vi.fn(() => ({
      totalEmits: 0,
      totalDeliveries: 0,
      activeSubscriptions: 0,
      queuedMessages: 0,
    })),
  };
}

/**
 * Create a batch of ErrorLog mocks for pattern detection tests
 * 
 * @returns Object with categorized error logs
 */
export function createErrorLogBatch() {
  return {
    databaseErrors: createMockErrorLogs(3, { category: 'DATABASE', severity: 'HIGH' }),
    validationErrors: createMockErrorLogs(5, { category: 'VALIDATION', severity: 'MEDIUM' }),
    networkErrors: createMockErrorLogs(2, { category: 'NETWORK', severity: 'HIGH' }),
    recoveredErrors: createMockErrorLogs(4, {
      recoveryAttempted: 3,
      recoverySuccess: 2,
      lastRecoveryStrategy: 'RETRY',
      lastRecoveryOutcome: 'SUCCESS',
    }),
  };
}

/**
 * Create a mock ErrorLog with high occurrence count (for threshold tests)
 * 
 * @param count - Occurrence count
 * @returns ErrorLog mock
 */
export function createFrequentError(count: number = 100): ErrorLog {
  return createMockErrorLog({
    occurrenceCount: count,
    severity: 'HIGH',
    lastSeen: new Date(),
  });
}

/**
 * Create a mock ErrorLog with learning metadata
 * 
 * @param patterns - Detected patterns
 * @returns ErrorLog mock with learning metadata
 */
export function createLearnedError(patterns: string[] = []): ErrorLog {
  return createMockErrorLog({
    learningMetadata: {
      detectedPatterns: patterns,
      lastAnalysis: new Date().toISOString(),
      confidence: 0.85,
    } as any,
  });
}
