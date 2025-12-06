/**
 * Security Logger Tests
 *
 * @module tests/security/services/security-logger.test
 * @description Comprehensive test suite for structured JSON logging.
 * Tests OpenTelemetry alignment, correlation ID tracking, log levels,
 * sensitive data redaction, and child logger functionality.
 *
 * @research R11: Structured Logging (OpenTelemetry Alignment) (Sprint 1)
 *
 * Test Categories:
 * 1. Configuration & Initialization
 * 2. Log Level Methods
 * 3. Security-Specific Logging
 * 4. Correlation Context
 * 5. Sensitive Data Redaction
 * 6. Child Loggers
 * 7. Timed Operations
 * 8. Factory Functions
 *
 * @author Testing Specialist (Sprint 1)
 * @since 2025-01-XX
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SecurityLogger,
  ConsoleLogOutput,
  createSecurityLogger,
  createCorrelation,
  childCorrelation,
  parseTraceparent,
  formatTraceparent,
  parseLogLevel,
  LogLevel,
  SecurityCategory,
  type LogEntry,
  type LogOutput,
  type SecurityLoggerConfig,
  type CorrelationContext,
} from '../../../src/bot/security/services/security-logger.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Mock log output that captures entries
 */
class MockLogOutput implements LogOutput {
  public entries: LogEntry[] = [];

  write(entry: LogEntry): void {
    this.entries.push(entry);
  }

  clear(): void {
    this.entries = [];
  }

  get lastEntry(): LogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }
}

function createTestLogger(overrides?: Partial<SecurityLoggerConfig>): {
  logger: SecurityLogger;
  output: MockLogOutput;
} {
  const output = new MockLogOutput();
  const logger = new SecurityLogger({
    serviceName: 'test-service',
    environment: 'test',
    output,
    ...overrides,
  });
  return { logger, output };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('SecurityLogger', () => {
  // ==========================================================================
  // 1. Configuration & Initialization
  // ==========================================================================

  describe('Configuration & Initialization', () => {
    it('should initialize with valid configuration', () => {
      const { logger } = createTestLogger();
      expect(logger).toBeInstanceOf(SecurityLogger);
      expect(logger.getServiceName()).toBe('test-service');
      expect(logger.getEnvironment()).toBe('test');
    });

    it('should use default environment if not specified', () => {
      const output = new MockLogOutput();
      const logger = new SecurityLogger({
        serviceName: 'test',
        output,
      });
      expect(logger.getEnvironment()).toBeTruthy();
    });

    it('should accept custom minimum log level', () => {
      const { logger } = createTestLogger({ minLevel: LogLevel.WARN });
      expect(logger.getMinLevel()).toBe(LogLevel.WARN);
      expect(logger.isLevelEnabled(LogLevel.INFO)).toBe(false);
      expect(logger.isLevelEnabled(LogLevel.WARN)).toBe(true);
    });

    it('should accept default context', () => {
      const { logger, output } = createTestLogger({
        defaultContext: { requestId: 'abc123' },
      });

      logger.info('Test message');

      expect(output.lastEntry?.attributes).toHaveProperty('requestId', 'abc123');
    });
  });

  // ==========================================================================
  // 2. Log Level Methods
  // ==========================================================================

  describe('Log Level Methods', () => {
    let logger: SecurityLogger;
    let output: MockLogOutput;

    beforeEach(() => {
      ({ logger, output } = createTestLogger({ minLevel: LogLevel.TRACE }));
    });

    it('should log at TRACE level', () => {
      logger.trace('Trace message');

      expect(output.lastEntry?.severityNumber).toBe(LogLevel.TRACE);
      expect(output.lastEntry?.severityText).toBe('trace');
      expect(output.lastEntry?.body).toBe('Trace message');
    });

    it('should log at DEBUG level', () => {
      logger.debug('Debug message');

      expect(output.lastEntry?.severityNumber).toBe(LogLevel.DEBUG);
      expect(output.lastEntry?.severityText).toBe('debug');
    });

    it('should log at INFO level', () => {
      logger.info('Info message');

      expect(output.lastEntry?.severityNumber).toBe(LogLevel.INFO);
      expect(output.lastEntry?.severityText).toBe('info');
    });

    it('should log at WARN level', () => {
      logger.warn('Warn message');

      expect(output.lastEntry?.severityNumber).toBe(LogLevel.WARN);
      expect(output.lastEntry?.severityText).toBe('warn');
    });

    it('should log at ERROR level', () => {
      logger.error('Error message');

      expect(output.lastEntry?.severityNumber).toBe(LogLevel.ERROR);
      expect(output.lastEntry?.severityText).toBe('error');
    });

    it('should log at FATAL level', () => {
      logger.fatal('Fatal message');

      expect(output.lastEntry?.severityNumber).toBe(LogLevel.FATAL);
      expect(output.lastEntry?.severityText).toBe('fatal');
    });

    it('should filter logs below minimum level', () => {
      const { logger: warnLogger, output: warnOutput } = createTestLogger({
        minLevel: LogLevel.WARN,
      });

      warnLogger.debug('Should not appear');
      warnLogger.info('Should not appear');
      warnLogger.warn('Should appear');

      expect(warnOutput.entries).toHaveLength(1);
      expect(warnOutput.lastEntry?.body).toBe('Should appear');
    });

    it('should include timestamp in ISO format', () => {
      logger.info('Test message');

      expect(output.lastEntry?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(output.lastEntry?.observedTimestamp).toBeTruthy();
    });

    it('should include resource information', () => {
      logger.info('Test message');

      expect(output.lastEntry?.resource['service.name']).toBe('test-service');
      expect(output.lastEntry?.resource['deployment.environment']).toBe('test');
    });
  });

  // ==========================================================================
  // 3. Security-Specific Logging
  // ==========================================================================

  describe('Security-Specific Logging', () => {
    let logger: SecurityLogger;
    let output: MockLogOutput;

    beforeEach(() => {
      ({ logger, output } = createTestLogger());
    });

    it('should log security event with category', () => {
      logger.security('Role change detected', {
        category: SecurityCategory.ROLE_AUDIT,
        guildId: '123',
        action: 'role-change',
      });

      expect(output.lastEntry?.attributes['security.event']).toBe(true);
      expect(output.lastEntry?.attributes.category).toBe(SecurityCategory.ROLE_AUDIT);
      expect(output.lastEntry?.attributes.guildId).toBe('123');
      expect(output.lastEntry?.attributes.action).toBe('role-change');
    });

    it('should log threat detection event', () => {
      logger.threat('Suspicious activity detected', {
        guildId: '123',
        userId: 'user456',
      });

      expect(output.lastEntry?.severityNumber).toBe(LogLevel.WARN);
      expect(output.lastEntry?.attributes['security.event']).toBe(true);
      expect(output.lastEntry?.attributes['security.threat']).toBe(true);
      expect(output.lastEntry?.attributes.category).toBe(SecurityCategory.THREAT_DETECTION);
    });

    it('should log audit trail event', () => {
      logger.audit('Permission granted', {
        userId: 'user123',
        target: 'role789',
      });

      expect(output.lastEntry?.attributes['security.event']).toBe(true);
      expect(output.lastEntry?.attributes['security.audit']).toBe(true);
      expect(output.lastEntry?.attributes.category).toBe(SecurityCategory.AUDIT_TRAIL);
    });

    it('should log security error with error details', () => {
      const error = new Error('Authentication failed');
      error.name = 'AuthError';

      logger.securityError('Login attempt failed', error, {
        userId: 'user123',
      });

      expect(output.lastEntry?.severityNumber).toBe(LogLevel.ERROR);
      expect(output.lastEntry?.attributes['security.event']).toBe(true);
      expect(output.lastEntry?.attributes.error).toEqual({
        type: 'AuthError',
        message: 'Authentication failed',
        stack: error.stack,
      });
    });

    it('should support all security categories', () => {
      const categories = Object.values(SecurityCategory);

      for (const category of categories) {
        output.clear();
        logger.security(`Event for ${category}`, { category });
        expect(output.lastEntry?.attributes.category).toBe(category);
      }
    });
  });

  // ==========================================================================
  // 4. Correlation Context
  // ==========================================================================

  describe('Correlation Context', () => {
    let logger: SecurityLogger;
    let output: MockLogOutput;

    beforeEach(() => {
      ({ logger, output } = createTestLogger());
    });

    it('should create new correlation context', () => {
      const correlation = createCorrelation();

      expect(correlation.traceId).toMatch(/^[a-f0-9]{32}$/);
      expect(correlation.spanId).toMatch(/^[a-f0-9]{16}$/);
      expect(correlation.parentSpanId).toBeUndefined();
      expect(correlation.traceFlags).toBe(1);
    });

    it('should create child correlation with same trace ID', () => {
      const parent = createCorrelation();
      const child = childCorrelation(parent);

      expect(child.traceId).toBe(parent.traceId);
      expect(child.spanId).not.toBe(parent.spanId);
      expect(child.parentSpanId).toBe(parent.spanId);
    });

    it('should include correlation in log entry', () => {
      const correlation = createCorrelation();

      logger.info('Correlated event', { correlation });

      expect(output.lastEntry?.traceId).toBe(correlation.traceId);
      expect(output.lastEntry?.spanId).toBe(correlation.spanId);
      expect(output.lastEntry?.traceFlags).toBe(correlation.traceFlags);
    });

    it('should inherit correlation from default context', () => {
      const correlation = createCorrelation();
      const { logger: correlatedLogger, output: correlatedOutput } = createTestLogger({
        defaultContext: { correlation },
      });

      correlatedLogger.info('Event with inherited correlation');

      expect(correlatedOutput.lastEntry?.traceId).toBe(correlation.traceId);
    });

    it('should parse W3C traceparent header', () => {
      const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      const correlation = parseTraceparent(traceparent);

      expect(correlation).not.toBeNull();
      expect(correlation?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(correlation?.spanId).toBe('b7ad6b7169203331');
      expect(correlation?.traceFlags).toBe(1);
    });

    it('should return null for invalid traceparent', () => {
      expect(parseTraceparent('invalid')).toBeNull();
      expect(parseTraceparent('01-invalid-format-00')).toBeNull();
    });

    it('should format correlation as W3C traceparent', () => {
      const correlation: CorrelationContext = {
        traceId: '0af7651916cd43dd8448eb211c80319c',
        spanId: 'b7ad6b7169203331',
        traceFlags: 1,
      };

      const traceparent = formatTraceparent(correlation);
      expect(traceparent).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    });
  });

  // ==========================================================================
  // 5. Sensitive Data Redaction
  // ==========================================================================

  describe('Sensitive Data Redaction', () => {
    it('should redact sensitive fields by default', () => {
      const { logger, output } = createTestLogger();

      logger.info('Login attempt', {
        username: 'user@example.com',
        password: 'secret123',
        apiKey: 'key123',
        token: 'tok_123',
      });

      expect(output.lastEntry?.attributes.username).toBe('user@example.com');
      expect(output.lastEntry?.attributes.password).toBe('[REDACTED]');
      expect(output.lastEntry?.attributes.apiKey).toBe('[REDACTED]');
      expect(output.lastEntry?.attributes.token).toBe('[REDACTED]');
    });

    it('should redact nested sensitive fields', () => {
      const { logger, output } = createTestLogger();

      // Note: 'credentials' as a key matches /credential/i pattern so whole object is redacted
      // Using 'settings' which doesn't match any pattern to test nested redaction
      logger.info('Config loaded', {
        config: {
          host: 'localhost',
          settings: {
            apiSecret: 'secret-value',
            username: 'admin',
          },
        },
      });

      const entry = output.lastEntry;
      expect(entry).toBeDefined();
      
      // Check nested structure exists
      const config = entry?.attributes.config as Record<string, unknown> | undefined;
      expect(config).toBeDefined();
      expect(config?.host).toBe('localhost');
      
      const settings = config?.settings as Record<string, unknown> | undefined;
      expect(settings).toBeDefined();
      expect(settings?.username).toBe('admin');
      // apiSecret should be redacted because it contains 'secret'
      expect(settings?.apiSecret).toBe('[REDACTED]');
    });

    it('should allow disabling redaction', () => {
      const { logger, output } = createTestLogger({
        redactSensitive: false,
      });

      logger.info('Login attempt', {
        password: 'secret123',
      });

      expect(output.lastEntry?.attributes.password).toBe('secret123');
    });

    it('should redact various sensitive field patterns', () => {
      const { logger, output } = createTestLogger();

      const sensitiveFields = [
        'password',
        'secret',
        'token',
        'apiKey',
        'api_key',
        'authorization',
        'bearer',
        'credential',
        'privateKey',
      ];

      for (const field of sensitiveFields) {
        output.clear();
        logger.info('Test', { [field]: 'sensitive_value' });
        expect(output.lastEntry?.attributes[field]).toBe('[REDACTED]');
      }
    });
  });

  // ==========================================================================
  // 6. Child Loggers
  // ==========================================================================

  describe('Child Loggers', () => {
    let logger: SecurityLogger;
    let output: MockLogOutput;

    beforeEach(() => {
      ({ logger, output } = createTestLogger());
    });

    it('should create child logger with inherited context', () => {
      const child = logger.child({ guildId: '123' });

      child.info('Child log');

      expect(output.lastEntry?.attributes.guildId).toBe('123');
    });

    it('should inherit parent configuration', () => {
      const child = logger.child({ guildId: '123' });

      expect(child.getServiceName()).toBe(logger.getServiceName());
      expect(child.getEnvironment()).toBe(logger.getEnvironment());
    });

    it('should merge child context with log attributes', () => {
      const child = logger.child({ guildId: '123' });

      child.info('Event', { userId: '456' });

      expect(output.lastEntry?.attributes.guildId).toBe('123');
      expect(output.lastEntry?.attributes.userId).toBe('456');
    });

    it('should allow attribute override in child', () => {
      const child = logger.child({ guildId: '123' });

      child.info('Event', { guildId: '999' });

      expect(output.lastEntry?.attributes.guildId).toBe('999');
    });

    it('should create logger with correlation via withCorrelation', () => {
      const correlation = createCorrelation();
      const child = logger.withCorrelation(correlation);

      child.info('Correlated event');

      expect(output.lastEntry?.traceId).toBe(correlation.traceId);
    });

    it('should support nested child loggers', () => {
      const child1 = logger.child({ level1: 'a' });
      const child2 = child1.child({ level2: 'b' });

      child2.info('Nested log');

      expect(output.lastEntry?.attributes.level1).toBe('a');
      expect(output.lastEntry?.attributes.level2).toBe('b');
    });
  });

  // ==========================================================================
  // 7. Timed Operations
  // ==========================================================================

  describe('Timed Operations', () => {
    let logger: SecurityLogger;
    let output: MockLogOutput;

    beforeEach(() => {
      ({ logger, output } = createTestLogger());
    });

    it('should track operation duration with startTimer', () => {
      const timer = logger.startTimer();

      // Simulate work
      for (let i = 0; i < 1000; i++) Math.random();

      const duration = timer.end();
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should log successful operation with withTiming', async () => {
      await logger.withTiming('Operation completed', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'result';
      });

      expect(output.lastEntry?.body).toBe('Operation completed');
      expect(output.lastEntry?.attributes.success).toBe(true);
      expect(output.lastEntry?.attributes.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should log failed operation with withTiming', async () => {
      const error = new Error('Operation failed');

      await expect(
        logger.withTiming('Operation', async () => {
          throw error;
        })
      ).rejects.toThrow('Operation failed');

      expect(output.lastEntry?.severityNumber).toBe(LogLevel.ERROR);
      expect(output.lastEntry?.attributes.success).toBe(false);
      expect(output.lastEntry?.attributes.error).toEqual({
        type: 'Error',
        message: 'Operation failed',
        stack: error.stack,
      });
    });

    it('should include additional attributes with withTiming', async () => {
      await logger.withTiming(
        'Query executed',
        async () => 'result',
        { query: 'SELECT * FROM users' }
      );

      expect(output.lastEntry?.attributes.query).toBe('SELECT * FROM users');
    });
  });

  // ==========================================================================
  // 8. Factory Function & Utilities
  // ==========================================================================

  describe('Factory Function & Utilities', () => {
    it('should create logger with default configuration', () => {
      const output = new MockLogOutput();
      const logger = createSecurityLogger({ output });

      expect(logger).toBeInstanceOf(SecurityLogger);
    });

    it('should parse log level from string', () => {
      expect(parseLogLevel('trace')).toBe(LogLevel.TRACE);
      expect(parseLogLevel('debug')).toBe(LogLevel.DEBUG);
      expect(parseLogLevel('info')).toBe(LogLevel.INFO);
      expect(parseLogLevel('warn')).toBe(LogLevel.WARN);
      expect(parseLogLevel('warning')).toBe(LogLevel.WARN);
      expect(parseLogLevel('error')).toBe(LogLevel.ERROR);
      expect(parseLogLevel('fatal')).toBe(LogLevel.FATAL);
      expect(parseLogLevel('unknown')).toBe(LogLevel.INFO);
    });

    it('should handle case-insensitive log level parsing', () => {
      expect(parseLogLevel('DEBUG')).toBe(LogLevel.DEBUG);
      expect(parseLogLevel('Info')).toBe(LogLevel.INFO);
      expect(parseLogLevel('WARN')).toBe(LogLevel.WARN);
    });
  });

  // ==========================================================================
  // 9. Console Output
  // ==========================================================================

  describe('ConsoleLogOutput', () => {
    it('should create console output with pretty option', () => {
      const output = new ConsoleLogOutput({ pretty: true });
      expect(output).toBeInstanceOf(ConsoleLogOutput);
    });

    it('should write to console.log for info level', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const output = new ConsoleLogOutput();

      output.write({
        timestamp: new Date().toISOString(),
        observedTimestamp: new Date().toISOString(),
        severityNumber: LogLevel.INFO,
        severityText: 'info',
        body: 'Test message',
        resource: { 'service.name': 'test' },
        attributes: {},
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should write to console.warn for warn level', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const output = new ConsoleLogOutput();

      output.write({
        timestamp: new Date().toISOString(),
        observedTimestamp: new Date().toISOString(),
        severityNumber: LogLevel.WARN,
        severityText: 'warn',
        body: 'Warning message',
        resource: { 'service.name': 'test' },
        attributes: {},
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should write to console.error for error level', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const output = new ConsoleLogOutput();

      output.write({
        timestamp: new Date().toISOString(),
        observedTimestamp: new Date().toISOString(),
        severityNumber: LogLevel.ERROR,
        severityText: 'error',
        body: 'Error message',
        resource: { 'service.name': 'test' },
        attributes: {},
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ==========================================================================
  // 10. Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle undefined attributes', () => {
      const { logger, output } = createTestLogger();

      logger.info('No attributes');

      expect(output.lastEntry).toBeDefined();
      expect(output.lastEntry?.attributes).toEqual({});
    });

    it('should handle unicode in messages', () => {
      const { logger, output } = createTestLogger();

      logger.info('ユーザーログイン 🔐', {
        actor: 'ユーザー',
      });

      expect(output.lastEntry?.body).toBe('ユーザーログイン 🔐');
      expect(output.lastEntry?.attributes.actor).toBe('ユーザー');
    });

    it('should handle null values in attributes', () => {
      const { logger, output } = createTestLogger({
        redactSensitive: false,
      });

      logger.info('Test', { value: null });

      expect(output.lastEntry?.attributes.value).toBeNull();
    });

    it('should handle array values in attributes', () => {
      const { logger, output } = createTestLogger();

      logger.info('Test', { items: [1, 2, 3] });

      expect(output.lastEntry?.attributes.items).toEqual([1, 2, 3]);
    });

    it('should handle large log volume', () => {
      const { logger, output } = createTestLogger();

      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`);
      }

      expect(output.entries).toHaveLength(1000);
    });
  });
});
