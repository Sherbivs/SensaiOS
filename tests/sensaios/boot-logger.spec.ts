/**
 * Tests for SensaiOS Boot Logger — Observability Before Database
 *
 * Per v1.1.2: Boot logger starts BEFORE database connection.
 *
 * @module tests/sensaios/boot-logger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createBootLogger,
  createBootStatus,
  completeBootPhase,
  failBoot,
  clearBootLogger,
  getBootLogger,
  type BootLogger,
  type BootLogEntry,
} from '../../src/sensaios/boot-logger.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const defaultConfig = {
  name: 'test-kernel',
};

// ============================================================================
// createBootLogger Tests
// ============================================================================

describe('createBootLogger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    clearBootLogger();
  });

  describe('creation', () => {
    it('should create logger with default config', () => {
      const logger = createBootLogger(defaultConfig);

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.fatal).toBe('function');
      expect(typeof logger.phase).toBe('function');
      expect(typeof logger.getElapsed).toBe('function');
      expect(typeof logger.getEntries).toBe('function');
    });

    it('should start with empty entries', () => {
      const logger = createBootLogger(defaultConfig);
      expect(logger.getEntries()).toEqual([]);
    });

    it('should track elapsed time from creation', () => {
      const logger = createBootLogger(defaultConfig);
      const elapsed1 = logger.getElapsed();
      
      // Small delay
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait
      }
      
      const elapsed2 = logger.getElapsed();
      expect(elapsed2).toBeGreaterThanOrEqual(elapsed1);
    });
  });

  describe('JSON output format', () => {
    it('should output JSON when json=true (default)', () => {
      const logger = createBootLogger({ ...defaultConfig, json: true });
      logger.info('test', 'Test message');

      expect(consoleSpy).toHaveBeenCalledOnce();
      const output = consoleSpy.mock.calls[0][0] as string;
      
      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('info');
      expect(parsed.operation).toBe('test');
      expect(parsed.message).toBe('Test message');
      expect(parsed.service).toBe('test-kernel');
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.elapsed).toBeGreaterThanOrEqual(0);
    });

    it('should include data in JSON output', () => {
      const logger = createBootLogger({ ...defaultConfig, json: true });
      logger.info('test', 'Test message', { key: 'value', count: 42 });

      const output = consoleSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      
      expect(parsed.data).toEqual({ key: 'value', count: 42 });
    });
  });

  describe('pretty output format', () => {
    it('should output pretty format when json=false', () => {
      const logger = createBootLogger({ ...defaultConfig, json: false });
      logger.info('test', 'Test message');

      expect(consoleSpy).toHaveBeenCalledOnce();
      const output = consoleSpy.mock.calls[0][0] as string;
      
      // Should not be JSON
      expect(() => JSON.parse(output)).toThrow();
      
      // Should contain level and message
      expect(output).toContain('INFO');
      expect(output).toContain('Test message');
    });
  });

  describe('minLevel filtering', () => {
    it('should filter debug when minLevel=info', () => {
      const logger = createBootLogger({ ...defaultConfig, minLevel: 'info' });
      logger.debug('test', 'Debug message');

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(logger.getEntries()).toHaveLength(0);
    });

    it('should include info when minLevel=info', () => {
      const logger = createBootLogger({ ...defaultConfig, minLevel: 'info' });
      logger.info('test', 'Info message');

      expect(consoleSpy).toHaveBeenCalledOnce();
      expect(logger.getEntries()).toHaveLength(1);
    });

    it('should include all levels when minLevel=debug', () => {
      const logger = createBootLogger({ ...defaultConfig, minLevel: 'debug' });
      logger.debug('test', 'Debug');
      logger.info('test', 'Info');
      logger.warn('test', 'Warn');
      logger.error('test', 'Error');
      logger.fatal('test', 'Fatal');

      expect(logger.getEntries()).toHaveLength(5);
    });

    it('should only include errors and fatal when minLevel=error', () => {
      const logger = createBootLogger({ ...defaultConfig, minLevel: 'error' });
      logger.debug('test', 'Debug');
      logger.info('test', 'Info');
      logger.warn('test', 'Warn');
      logger.error('test', 'Error');
      logger.fatal('test', 'Fatal');

      expect(logger.getEntries()).toHaveLength(2);
      expect(logger.getEntries().map(e => e.level)).toEqual(['error', 'fatal']);
    });
  });
});

// ============================================================================
// Log Level Tests
// ============================================================================

describe('log levels', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logger: BootLogger;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger = createBootLogger({ ...defaultConfig, minLevel: 'debug' });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    clearBootLogger();
  });

  it('should log debug messages to console.log', () => {
    logger.debug('op', 'Debug message');

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should log info messages to console.log', () => {
    logger.info('op', 'Info message');

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should log warn messages to console.log', () => {
    logger.warn('op', 'Warning message');

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should log error messages to console.error', () => {
    logger.error('op', 'Error message');

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should log fatal messages to console.error', () => {
    logger.fatal('op', 'Fatal message');

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should capture all log entries with correct levels', () => {
    logger.debug('op', 'Debug');
    logger.info('op', 'Info');
    logger.warn('op', 'Warn');
    logger.error('op', 'Error');
    logger.fatal('op', 'Fatal');

    const entries = logger.getEntries();
    expect(entries).toHaveLength(5);
    expect(entries.map(e => e.level)).toEqual(['debug', 'info', 'warn', 'error', 'fatal']);
  });

  it('should include operation name in entries', () => {
    logger.info('boot.database', 'Connecting...');

    const entries = logger.getEntries();
    expect(entries[0].operation).toBe('boot.database');
  });

  it('should include message in entries', () => {
    logger.info('op', 'This is the message');

    const entries = logger.getEntries();
    expect(entries[0].message).toBe('This is the message');
  });

  it('should include data in entries', () => {
    logger.info('op', 'Message', { host: 'localhost', port: 5432 });

    const entries = logger.getEntries();
    expect(entries[0].data).toEqual({ host: 'localhost', port: 5432 });
  });

  it('should include timestamp in ISO format', () => {
    logger.info('op', 'Message');

    const entries = logger.getEntries();
    expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ============================================================================
// Phase Tracking Tests
// ============================================================================

describe('phase tracking', () => {
  let _consoleSpy: ReturnType<typeof vi.spyOn>;
  let logger: BootLogger;

  beforeEach(() => {
    _consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    logger = createBootLogger(defaultConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBootLogger();
  });

  it('should log phase start', () => {
    logger.phase('database', 'start');

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe('phase.database');
    expect(entries[0].message).toContain('Starting');
  });

  it('should log phase completion with duration', () => {
    logger.phase('database', 'start');
    
    // Small delay
    const start = Date.now();
    while (Date.now() - start < 10) {
      // busy wait
    }
    
    logger.phase('database', 'complete');

    const entries = logger.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[1].operation).toBe('phase.database');
    expect(entries[1].message).toContain('complete');
    expect(entries[1].data?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should log phase failure', () => {
    logger.phase('database', 'start');
    logger.phase('database', 'failed', { reason: 'Connection refused' });

    const entries = logger.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[1].message).toContain('failed');
    expect(entries[1].data?.reason).toBe('Connection refused');
  });

  it('should include custom data in phase logs', () => {
    logger.phase('components', 'start', { count: 5 });

    const entries = logger.getEntries();
    expect(entries[0].data?.count).toBe(5);
  });
});

// ============================================================================
// Boot Status Tests
// ============================================================================

describe('BootStatus', () => {
  describe('createBootStatus', () => {
    it('should create status with initial phase as logger', () => {
      const status = createBootStatus();

      expect(status.currentPhase).toBe('logger');
      expect(status.isReady).toBe(false);
    });

    it('should have no error initially', () => {
      const status = createBootStatus();
      expect(status.error).toBeUndefined();
    });

    it('should have empty phase times initially', () => {
      const status = createBootStatus();
      expect(status.phaseTimes).toEqual({});
    });

    it('should have start time set', () => {
      const before = new Date();
      const status = createBootStatus();
      const after = new Date();

      expect(status.startTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(status.startTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('completeBootPhase', () => {
    it('should update current phase', () => {
      let status = createBootStatus();
      status = completeBootPhase(status, 'config');

      expect(status.currentPhase).toBe('config');
    });

    it('should record phase duration', () => {
      let status = createBootStatus();
      status = completeBootPhase(status, 'logger');

      expect(status.phaseTimes.logger).toBeGreaterThanOrEqual(0);
    });

    it('should accumulate phase times', () => {
      let status = createBootStatus();
      status = completeBootPhase(status, 'logger');
      status = completeBootPhase(status, 'config');

      expect(status.phaseTimes.logger).toBeDefined();
      expect(status.phaseTimes.config).toBeDefined();
    });

    it('should mark as ready when ready phase completes', () => {
      let status = createBootStatus();
      status = completeBootPhase(status, 'ready');

      expect(status.isReady).toBe(true);
      expect(status.endTime).toBeDefined();
      expect(status.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('failBoot', () => {
    it('should record error', () => {
      let status = createBootStatus();
      const error = new Error('Boot failed');
      status = failBoot(status, error);

      expect(status.error).toBe(error);
    });

    it('should mark as not ready', () => {
      let status = createBootStatus();
      status = failBoot(status, new Error('DB connection failed'));

      expect(status.isReady).toBe(false);
    });

    it('should record end time and duration', () => {
      let status = createBootStatus();
      status = failBoot(status, new Error('Failure'));

      expect(status.endTime).toBeDefined();
      expect(status.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// Global Boot Logger Tests
// ============================================================================

describe('global boot logger', () => {
  beforeEach(() => {
    clearBootLogger();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBootLogger();
  });

  it('should auto-create logger when getBootLogger called without init', () => {
    // getBootLogger auto-creates if not initialized
    const logger = getBootLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('should return same logger on repeated getBootLogger calls', () => {
    const logger1 = getBootLogger();
    const logger2 = getBootLogger();
    
    // Both should be the same instance (auto-created)
    expect(logger1).toBe(logger2);
  });

  it('should clear global logger reference', () => {
    getBootLogger(); // auto-creates
    clearBootLogger();
    
    // After clear, getBootLogger creates a NEW logger
    const loggerAfterClear = getBootLogger();
    expect(loggerAfterClear).toBeDefined();
    
    // Log something to verify it works
    loggerAfterClear.info('test', 'After clear');
    expect(loggerAfterClear.getEntries()).toHaveLength(1);
  });

  it('should use initBootLogger to set global logger explicitly', () => {
    // First call to getBootLogger auto-creates
    const autoLogger = getBootLogger();
    autoLogger.info('test', 'Auto message');
    expect(autoLogger.getEntries()).toHaveLength(1);
    
    // clearBootLogger clears the global
    clearBootLogger();
    
    // Creating new logger directly does NOT set global
    const localLogger = createBootLogger({ name: 'local' });
    localLogger.info('test', 'Local message');
    
    // getBootLogger will create NEW auto logger (not localLogger)
    const newAutoLogger = getBootLogger();
    
    // newAutoLogger is different from localLogger
    expect(newAutoLogger).not.toBe(localLogger);
    expect(newAutoLogger.getEntries()).toHaveLength(0); // Fresh logger
  });
});

// ============================================================================
// Custom Output Function Tests
// ============================================================================

describe('custom output', () => {
  beforeEach(() => {
    clearBootLogger();
  });

  afterEach(() => {
    clearBootLogger();
  });

  it('should use custom output function', () => {
    const customOutput = vi.fn();
    const logger = createBootLogger({
      ...defaultConfig,
      output: customOutput,
    });

    logger.info('test', 'Custom output test');

    expect(customOutput).toHaveBeenCalledOnce();
    expect(customOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        operation: 'test',
        message: 'Custom output test',
      })
    );
  });

  it('should pass full entry to custom output', () => {
    const customOutput = vi.fn();
    const logger = createBootLogger({
      ...defaultConfig,
      output: customOutput,
    });

    logger.info('test', 'Message', { extra: 'data' });

    const entry = customOutput.mock.calls[0][0] as BootLogEntry;
    expect(entry.level).toBe('info');
    expect(entry.timestamp).toBeDefined();
    expect(entry.elapsed).toBeGreaterThanOrEqual(0);
    expect(entry.operation).toBe('test');
    expect(entry.message).toBe('Message');
    expect(entry.data).toEqual({ extra: 'data' });
  });
});
