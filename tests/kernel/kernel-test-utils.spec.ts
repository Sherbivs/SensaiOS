/**
 * Kernel Test Utilities - Test Suite
 * 
 * Tests the kernel mocking and assertion utilities themselves.
 * Also serves as documentation/examples for usage.
 * 
 * @module tests/kernel/kernel-test-utils.spec
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mockKernel,
  resetKernelMock,
  getActiveMock,
  assertLogged,
  assertNotLogged,
  assertErrorCaptured,
  assertNoErrors,
  assertLogCount,
  registerKernelMatchers,
  type MockKernel,
} from '../kernel-test-utils.js';

// Register custom matchers
registerKernelMatchers();

describe('Kernel Test Utilities', () => {
  let mock: MockKernel;
  
  beforeEach(() => {
    mock = mockKernel();
  });
  
  afterEach(() => {
    resetKernelMock();
  });
  
  describe('mockKernel()', () => {
    it('should create a mock with empty logs and errors', () => {
      expect(mock.logs).toHaveLength(0);
      expect(mock.errors).toHaveLength(0);
    });
    
    it('should capture log calls', () => {
      mock.log.info('test-component', 'Hello world', { userId: 123 });
      
      expect(mock.logs).toHaveLength(1);
      expect(mock.logs[0]).toMatchObject({
        level: 'INFO',
        component: 'test-component',
        message: 'Hello world',
        data: { userId: 123 },
      });
    });
    
    it('should capture error log calls with Error object', () => {
      const error = new Error('Something went wrong');
      mock.log.error('error-component', 'Operation failed', {}, error);
      
      expect(mock.logs).toHaveLength(1);
      expect(mock.logs[0].error).toBe(error);
    });
    
    it('should capture captureError calls', () => {
      const error = new TypeError('Invalid input');
      mock.captureError(error, { userId: 456 });
      
      expect(mock.errors).toHaveLength(1);
      expect(mock.errors[0]).toMatchObject({
        error,
        context: { userId: 456 },
      });
    });
    
    it('should track logs at different levels', () => {
      mock.log.boot('boot', 'Starting up');
      mock.log.critical('system', 'Critical failure');
      mock.log.error('auth', 'Login failed');
      mock.log.warn('perf', 'Slow query');
      mock.log.info('api', 'Request received');
      mock.log.debug('cache', 'Cache hit');
      mock.log.trace('sql', 'SELECT * FROM users');
      
      expect(mock.logs).toHaveLength(7);
      expect(mock.getLogsByLevel('INFO')).toHaveLength(1);
      expect(mock.getLogsByLevel('ERROR')).toHaveLength(1);
      expect(mock.getLogsByLevel('KERNEL')).toHaveLength(1);
    });
  });
  
  describe('clear()', () => {
    it('should clear all logs and errors', () => {
      mock.log.info('test', 'Message 1');
      mock.log.warn('test', 'Message 2');
      mock.captureError(new Error('Test error'));
      
      expect(mock.logs).toHaveLength(2);
      expect(mock.errors).toHaveLength(1);
      
      mock.clear();
      
      expect(mock.logs).toHaveLength(0);
      expect(mock.errors).toHaveLength(0);
    });
  });
  
  describe('getLogsByLevel()', () => {
    it('should filter logs by level', () => {
      mock.log.info('a', 'Info 1');
      mock.log.warn('b', 'Warn 1');
      mock.log.info('c', 'Info 2');
      mock.log.error('d', 'Error 1');
      
      const infoLogs = mock.getLogsByLevel('INFO');
      expect(infoLogs).toHaveLength(2);
      expect(infoLogs.map(l => l.message)).toEqual(['Info 1', 'Info 2']);
    });
  });
  
  describe('getLogsByComponent()', () => {
    it('should filter logs by component', () => {
      mock.log.info('auth', 'Login attempt');
      mock.log.info('auth', 'Login success');
      mock.log.info('api', 'Request received');
      
      const authLogs = mock.getLogsByComponent('auth');
      expect(authLogs).toHaveLength(2);
    });
  });
  
  describe('getLogsContaining()', () => {
    it('should filter logs by message substring', () => {
      mock.log.info('test', 'User logged in');
      mock.log.info('test', 'User logged out');
      mock.log.info('test', 'Request processed');
      
      const userLogs = mock.getLogsContaining('User');
      expect(userLogs).toHaveLength(2);
    });
  });
  
  describe('hasLog()', () => {
    it('should return true when matching log exists', () => {
      mock.log.info('auth', 'User authenticated');
      
      expect(mock.hasLog('INFO')).toBe(true);
      expect(mock.hasLog('INFO', 'User')).toBe(true);
      expect(mock.hasLog('INFO', 'authenticated', 'auth')).toBe(true);
    });
    
    it('should return false when no matching log exists', () => {
      mock.log.info('auth', 'User authenticated');
      
      expect(mock.hasLog('ERROR')).toBe(false);
      expect(mock.hasLog('INFO', 'not found')).toBe(false);
      expect(mock.hasLog('INFO', 'User', 'wrong-component')).toBe(false);
    });
  });
  
  describe('hasError()', () => {
    it('should return true when matching error exists', () => {
      mock.captureError(new TypeError('Invalid value'));
      
      expect(mock.hasError('TypeError')).toBe(true);
      expect(mock.hasError('Invalid')).toBe(true);
    });
    
    it('should return false when no matching error exists', () => {
      mock.captureError(new TypeError('Invalid value'));
      
      expect(mock.hasError('RangeError')).toBe(false);
      expect(mock.hasError('not found')).toBe(false);
    });
  });
  
  describe('assertLogged()', () => {
    it('should pass when log matches', () => {
      mock.log.info('test', 'Expected message');
      
      expect(() => assertLogged(mock, 'INFO', 'Expected')).not.toThrow();
      expect(() => assertLogged(mock, 'INFO', 'message', 'test')).not.toThrow();
    });
    
    it('should throw when log does not match', () => {
      mock.log.info('test', 'Something else');
      
      expect(() => assertLogged(mock, 'ERROR', 'Expected'))
        .toThrow(/Expected log entry matching/);
    });
    
    it('should throw with helpful message showing actual logs', () => {
      mock.log.info('comp1', 'Message A');
      mock.log.warn('comp2', 'Message B');
      
      try {
        assertLogged(mock, 'ERROR', 'Not found');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('level: ERROR');
        expect((error as Error).message).toContain('[INFO] [comp1] Message A');
        expect((error as Error).message).toContain('[WARN] [comp2] Message B');
      }
    });
  });
  
  describe('assertNotLogged()', () => {
    it('should pass when log does not exist', () => {
      mock.log.info('test', 'Some message');
      
      expect(() => assertNotLogged(mock, 'ERROR')).not.toThrow();
      expect(() => assertNotLogged(mock, 'INFO', 'different text')).not.toThrow();
    });
    
    it('should throw when matching log exists', () => {
      mock.log.error('test', 'Error occurred');
      
      expect(() => assertNotLogged(mock, 'ERROR'))
        .toThrow(/Expected NO log entries at level ERROR/);
    });
  });
  
  describe('assertErrorCaptured()', () => {
    it('should pass when error matches', () => {
      mock.captureError(new TypeError('Invalid input'));
      
      expect(() => assertErrorCaptured(mock, 'TypeError')).not.toThrow();
      expect(() => assertErrorCaptured(mock, 'Invalid')).not.toThrow();
    });
    
    it('should throw when error does not match', () => {
      mock.captureError(new RangeError('Out of range'));
      
      expect(() => assertErrorCaptured(mock, 'TypeError'))
        .toThrow(/Expected error matching "TypeError"/);
    });
  });
  
  describe('assertNoErrors()', () => {
    it('should pass when no errors exist', () => {
      expect(() => assertNoErrors(mock)).not.toThrow();
    });
    
    it('should throw when errors exist', () => {
      mock.captureError(new Error('Oops'));
      
      expect(() => assertNoErrors(mock))
        .toThrow(/Expected no errors, but found 1/);
    });
  });
  
  describe('assertLogCount()', () => {
    it('should pass when count matches', () => {
      mock.log.info('a', 'One');
      mock.log.info('b', 'Two');
      mock.log.warn('c', 'Warning');
      
      expect(() => assertLogCount(mock, 'INFO', 2)).not.toThrow();
      expect(() => assertLogCount(mock, 'WARN', 1)).not.toThrow();
      expect(() => assertLogCount(mock, 'ERROR', 0)).not.toThrow();
    });
    
    it('should throw when count does not match', () => {
      mock.log.info('test', 'Message');
      
      expect(() => assertLogCount(mock, 'INFO', 2))
        .toThrow(/Expected 2 INFO logs, but found 1/);
    });
  });
  
  describe('resetKernelMock()', () => {
    it('should clear logs and errors', () => {
      mock.log.info('test', 'Message');
      mock.captureError(new Error('Test'));
      
      resetKernelMock();
      
      // After reset, activeMock is null but the original mock reference still works
      expect(getActiveMock()).toBeNull();
    });
    
    it('should reset all vi.fn() mocks', () => {
      mock.log.info('test', 'Message');
      expect(mock.log.info).toHaveBeenCalledTimes(1);
      
      resetKernelMock();
      
      // Create new mock to verify reset behavior
      const newMock = mockKernel();
      expect(newMock.log.info).toHaveBeenCalledTimes(0);
    });
  });
  
  describe('preBoot API', () => {
    it('should mock isBooted', () => {
      expect(mock.preBoot.isBooted()).toBe(true);
      
      mock.preBoot.isBooted.mockReturnValue(false);
      expect(mock.preBoot.isBooted()).toBe(false);
    });
    
    it('should mock getStats', () => {
      const stats = mock.preBoot.getStats();
      expect(stats.booted).toBe(true);
      expect(stats.maxEntries).toBe(1000);
    });
  });
  
  describe('Custom Vitest Matchers', () => {
    it('should support toHaveLogged matcher', () => {
      mock.log.info('test', 'Hello world');
      
      expect(mock).toHaveLogged('INFO', 'Hello');
      expect(mock).not.toHaveLogged('ERROR');
    });
    
    it('should support toHaveCapturedError matcher', () => {
      mock.captureError(new TypeError('Bad input'));
      
      expect(mock).toHaveCapturedError('TypeError');
      expect(mock).not.toHaveCapturedError('RangeError');
    });
  });
});

// ============================================================================
// EXAMPLE: Testing Real Code (Demonstration)
// ============================================================================

describe('Example: Testing a Hypothetical Service', () => {
  let mock: MockKernel;
  
  beforeEach(() => {
    mock = mockKernel();
  });
  
  afterEach(() => {
    resetKernelMock();
  });
  
  // This demonstrates how you would test code that uses the kernel
  it('should demonstrate testing a service that uses kernel logging', () => {
    // Imagine this is a function from your codebase:
    function processUser(userId: string, kernelLog: typeof mock.log) {
      kernelLog.info('user-service', `Processing user: ${userId}`);
      
      if (!userId) {
        kernelLog.error('user-service', 'User ID is required');
        return null;
      }
      
      kernelLog.debug('user-service', 'User processing complete', { userId });
      return { id: userId, processed: true };
    }
    
    // Test the function with our mock
    const result = processUser('user-123', mock.log);
    
    // Assert the result
    expect(result).toEqual({ id: 'user-123', processed: true });
    
    // Assert the logs
    assertLogged(mock, 'INFO', 'Processing user');
    assertNotLogged(mock, 'ERROR');
    
    // Using custom matcher
    expect(mock).toHaveLogged('DEBUG', 'complete');
  });
  
  it('should demonstrate testing error handling', () => {
    function riskyOperation(kernelLog: typeof mock.log, captureError: typeof mock.captureError) {
      try {
        throw new Error('Something went wrong');
      } catch (error) {
        kernelLog.error('risky-service', 'Operation failed', {}, error as Error);
        captureError(error as Error, { operation: 'risky' });
        return false;
      }
    }
    
    const result = riskyOperation(mock.log, mock.captureError);
    
    expect(result).toBe(false);
    assertLogged(mock, 'ERROR', 'failed');
    assertErrorCaptured(mock, 'Something went wrong');
  });
});
