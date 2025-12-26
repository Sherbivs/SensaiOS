/**
 * Kernel Test Utilities
 * 
 * Provides mocking and assertion utilities for testing kernel-aware code.
 * 
 * USAGE:
 * ```typescript
 * import { mockKernel, assertLogged, assertErrorCaptured, resetKernelMock } from '../kernel-test-utils.js';
 * 
 * describe('MyModule', () => {
 *   let kernelMock: MockKernel;
 *   
 *   beforeEach(() => {
 *     kernelMock = mockKernel();
 *   });
 *   
 *   afterEach(() => {
 *     resetKernelMock();
 *   });
 *   
 *   it('should log operations', () => {
 *     // ... test code that calls Kernel.log.info() ...
 *     assertLogged(kernelMock, 'INFO', 'Expected message');
 *   });
 *   
 *   it('should capture errors', () => {
 *     // ... test code that calls Kernel.captureError() ...
 *     assertErrorCaptured(kernelMock, 'MyError');
 *   });
 * });
 * ```
 * 
 * @module tests/kernel-test-utils
 */

import { vi, expect } from 'vitest';
import type { Mock } from 'vitest';
import type { KernelLogLevel, KernelLogEntry as _KernelLogEntry } from '../src/kernel/kernel-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Mock log entry captured by the mock kernel
 */
export interface MockLogEntry {
  level: KernelLogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
  error?: Error;
  timestamp: number;
}

/**
 * Mock error entry captured by the mock kernel
 */
export interface MockErrorEntry {
  error: Error;
  context?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Mock kernel instance with captured logs and errors
 */
export interface MockKernel {
  /** All captured log entries */
  logs: MockLogEntry[];
  
  /** All captured errors */
  errors: MockErrorEntry[];
  
  /** Mock log API matching kernel.log.* */
  log: {
    boot: Mock<(component: string, message: string, metadata?: Record<string, unknown>) => void>;
    critical: Mock<(component: string, message: string, metadata?: Record<string, unknown>) => void>;
    error: Mock<(component: string, message: string, metadata?: Record<string, unknown>, error?: Error) => void>;
    warn: Mock<(component: string, message: string, metadata?: Record<string, unknown>) => void>;
    info: Mock<(component: string, message: string, metadata?: Record<string, unknown>) => void>;
    debug: Mock<(component: string, message: string, metadata?: Record<string, unknown>) => void>;
    trace: Mock<(component: string, message: string, metadata?: Record<string, unknown>) => void>;
  };
  
  /** Mock captureError function */
  captureError: Mock<(error: Error, context?: Record<string, unknown>) => void>;
  
  /** Mock pre-boot API */
  preBoot: {
    isBooted: Mock<() => boolean>;
    markBooted: Mock<() => void>;
    getStats: Mock<() => {
      booted: boolean;
      queuedEntries: number;
      maxEntries: number;
      droppedEntries: number;
      replayedEntries: number;
      replayed: boolean;
    }>;
    getQueue: Mock<() => unknown[]>;
  };
  
  /** Clear all captured data */
  clear: () => void;
  
  /** Get logs filtered by level */
  getLogsByLevel: (level: KernelLogLevel) => MockLogEntry[];
  
  /** Get logs filtered by component */
  getLogsByComponent: (component: string) => MockLogEntry[];
  
  /** Get logs containing message substring */
  getLogsContaining: (substring: string) => MockLogEntry[];
  
  /** Check if any log matches criteria */
  hasLog: (level: KernelLogLevel, messageSubstring?: string, component?: string) => boolean;
  
  /** Check if any error matches criteria */
  hasError: (errorNameOrMessage: string) => boolean;
}

// ============================================================================
// STATE
// ============================================================================

let activeMock: MockKernel | null = null;

// ============================================================================
// MOCK FACTORY
// ============================================================================

/**
 * Create a mock kernel for testing.
 * 
 * The mock captures all log and error calls for later assertion.
 * Use resetKernelMock() after each test to clean up.
 * 
 * @example
 * ```typescript
 * const mock = mockKernel();
 * 
 * // Your code calls Kernel.log.info('myComponent', 'Hello');
 * 
 * expect(mock.logs).toHaveLength(1);
 * expect(mock.logs[0].message).toBe('Hello');
 * ```
 */
export function mockKernel(): MockKernel {
  const logs: MockLogEntry[] = [];
  const errors: MockErrorEntry[] = [];
  
  // Create log level mocks
  const createLogMock = (level: KernelLogLevel) => {
    return vi.fn((component: string, message: string, data?: Record<string, unknown>, error?: Error) => {
      logs.push({
        level,
        component,
        message,
        data,
        error,
        timestamp: Date.now(),
      });
    });
  };
  
  const mock: MockKernel = {
    logs,
    errors,
    
    log: {
      boot: createLogMock('KERNEL'),
      critical: createLogMock('CRITICAL'),
      error: createLogMock('ERROR'),
      warn: createLogMock('WARN'),
      info: createLogMock('INFO'),
      debug: createLogMock('DEBUG'),
      trace: createLogMock('TRACE'),
    },
    
    captureError: vi.fn((error: Error, context?: Record<string, unknown>) => {
      errors.push({
        error,
        context,
        timestamp: Date.now(),
      });
    }),
    
    preBoot: {
      isBooted: vi.fn(() => true), // Default to booted for tests
      markBooted: vi.fn(() => undefined),
      getStats: vi.fn(() => ({
        booted: true,
        queuedEntries: 0,
        maxEntries: 1000,
        droppedEntries: 0,
        replayedEntries: 0,
        replayed: true,
      })),
      getQueue: vi.fn(() => []),
    },
    
    clear: () => {
      logs.length = 0;
      errors.length = 0;
    },
    
    getLogsByLevel: (level: KernelLogLevel) => {
      return logs.filter(l => l.level === level);
    },
    
    getLogsByComponent: (component: string) => {
      return logs.filter(l => l.component === component);
    },
    
    getLogsContaining: (substring: string) => {
      return logs.filter(l => l.message.includes(substring));
    },
    
    hasLog: (level: KernelLogLevel, messageSubstring?: string, component?: string) => {
      return logs.some(l => {
        if (l.level !== level) return false;
        if (messageSubstring && !l.message.includes(messageSubstring)) return false;
        if (component && l.component !== component) return false;
        return true;
      });
    },
    
    hasError: (errorNameOrMessage: string) => {
      return errors.some(e => 
        e.error.name.includes(errorNameOrMessage) || 
        e.error.message.includes(errorNameOrMessage)
      );
    },
  };
  
  activeMock = mock;
  return mock;
}

/**
 * Reset and clear the active kernel mock.
 * Call this in afterEach() to clean up between tests.
 */
export function resetKernelMock(): void {
  if (activeMock) {
    activeMock.clear();
    // Reset all vi.fn() mocks
    Object.values(activeMock.log).forEach(fn => fn.mockReset());
    activeMock.captureError.mockReset();
    Object.values(activeMock.preBoot).forEach(fn => fn.mockReset());
  }
  activeMock = null;
}

/**
 * Get the currently active mock (if any).
 */
export function getActiveMock(): MockKernel | null {
  return activeMock;
}

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

/**
 * Assert that a log was captured with the specified criteria.
 * 
 * @param mock - The mock kernel instance
 * @param level - Expected log level
 * @param messageSubstring - Optional substring that must appear in the message
 * @param component - Optional component name to match
 * 
 * @example
 * ```typescript
 * assertLogged(mock, 'INFO', 'User logged in');
 * assertLogged(mock, 'ERROR', 'Failed', 'auth-service');
 * ```
 */
export function assertLogged(
  mock: MockKernel,
  level: KernelLogLevel,
  messageSubstring?: string,
  component?: string
): void {
  const matching = mock.logs.filter(l => {
    if (l.level !== level) return false;
    if (messageSubstring && !l.message.includes(messageSubstring)) return false;
    if (component && l.component !== component) return false;
    return true;
  });
  
  if (matching.length === 0) {
    const criteria = [
      `level: ${level}`,
      messageSubstring ? `message containing: "${messageSubstring}"` : null,
      component ? `component: ${component}` : null,
    ].filter(Boolean).join(', ');
    
    const actualLogs = mock.logs.map(l => 
      `  [${l.level}] [${l.component}] ${l.message}`
    ).join('\n') || '  (no logs captured)';
    
    throw new Error(
      `Expected log entry matching:\n  ${criteria}\n\nActual logs:\n${actualLogs}`
    );
  }
}

/**
 * Assert that a log was NOT captured with the specified criteria.
 * 
 * @param mock - The mock kernel instance
 * @param level - Log level that should NOT appear
 * @param messageSubstring - Optional substring that should NOT appear in any message
 */
export function assertNotLogged(
  mock: MockKernel,
  level: KernelLogLevel,
  messageSubstring?: string
): void {
  const matching = mock.logs.filter(l => {
    if (l.level !== level) return false;
    if (messageSubstring && !l.message.includes(messageSubstring)) return false;
    return true;
  });
  
  if (matching.length > 0) {
    const matchingLogs = matching.map(l => 
      `  [${l.level}] [${l.component}] ${l.message}`
    ).join('\n');
    
    throw new Error(
      `Expected NO log entries at level ${level}${messageSubstring ? ` containing "${messageSubstring}"` : ''}, but found:\n${matchingLogs}`
    );
  }
}

/**
 * Assert that an error was captured with the specified criteria.
 * 
 * @param mock - The mock kernel instance
 * @param errorNameOrMessage - Error name or message substring to match
 * 
 * @example
 * ```typescript
 * assertErrorCaptured(mock, 'ValidationError');
 * assertErrorCaptured(mock, 'Invalid user ID');
 * ```
 */
export function assertErrorCaptured(
  mock: MockKernel,
  errorNameOrMessage: string
): void {
  const matching = mock.errors.filter(e => 
    e.error.name.includes(errorNameOrMessage) || 
    e.error.message.includes(errorNameOrMessage)
  );
  
  if (matching.length === 0) {
    const actualErrors = mock.errors.map(e => 
      `  ${e.error.name}: ${e.error.message}`
    ).join('\n') || '  (no errors captured)';
    
    throw new Error(
      `Expected error matching "${errorNameOrMessage}"\n\nActual errors:\n${actualErrors}`
    );
  }
}

/**
 * Assert that no errors were captured.
 * 
 * @param mock - The mock kernel instance
 */
export function assertNoErrors(mock: MockKernel): void {
  if (mock.errors.length > 0) {
    const actualErrors = mock.errors.map(e => 
      `  ${e.error.name}: ${e.error.message}`
    ).join('\n');
    
    throw new Error(
      `Expected no errors, but found ${mock.errors.length}:\n${actualErrors}`
    );
  }
}

/**
 * Assert exact log count at a specific level.
 * 
 * @param mock - The mock kernel instance
 * @param level - Log level to count
 * @param expectedCount - Expected number of logs at this level
 */
export function assertLogCount(
  mock: MockKernel,
  level: KernelLogLevel,
  expectedCount: number
): void {
  const actualCount = mock.getLogsByLevel(level).length;
  
  if (actualCount !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} ${level} logs, but found ${actualCount}`
    );
  }
}

// ============================================================================
// VITEST MATCHERS (optional registration)
// ============================================================================

/**
 * Register custom Vitest matchers for kernel assertions.
 * 
 * Call this once in your test setup file:
 * ```typescript
 * import { registerKernelMatchers } from './kernel-test-utils.js';
 * registerKernelMatchers();
 * ```
 * 
 * Then use in tests:
 * ```typescript
 * expect(mock).toHaveLogged('INFO', 'Hello');
 * expect(mock).toHaveCapturedError('MyError');
 * ```
 */
export function registerKernelMatchers(): void {
  expect.extend({
    toHaveLogged(received: MockKernel, level: KernelLogLevel, messageSubstring?: string) {
      const pass = received.hasLog(level, messageSubstring);
      return {
        pass,
        message: () => pass
          ? `Expected kernel NOT to have logged ${level}${messageSubstring ? ` containing "${messageSubstring}"` : ''}`
          : `Expected kernel to have logged ${level}${messageSubstring ? ` containing "${messageSubstring}"` : ''}`,
      };
    },
    
    toHaveCapturedError(received: MockKernel, errorNameOrMessage: string) {
      const pass = received.hasError(errorNameOrMessage);
      return {
        pass,
        message: () => pass
          ? `Expected kernel NOT to have captured error matching "${errorNameOrMessage}"`
          : `Expected kernel to have captured error matching "${errorNameOrMessage}"`,
      };
    },
  });
}

// ============================================================================
// TYPE DECLARATIONS FOR CUSTOM MATCHERS
// ============================================================================

declare module 'vitest' {
  // @ts-expect-error - Assertion interface may or may not have type parameter depending on Vitest version
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T = unknown> {
    toHaveLogged(level: KernelLogLevel, messageSubstring?: string): void;
    toHaveCapturedError(errorNameOrMessage: string): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveLogged(level: KernelLogLevel, messageSubstring?: string): void;
    toHaveCapturedError(errorNameOrMessage: string): void;
  }
}
