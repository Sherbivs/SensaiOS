/**
 * Envelope System Tests
 * 
 * Tests for the Universal Envelope observability system
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  // Types
  type UniversalEnvelope,
  type LogEnvelope,
  ObservationKind,
  LogLevel,
  
  // Factory
  createLog,
  debug,
  info,
  warn,
  error,
  createMetric,
  createAlert,
  generateId,
  generateCorrelationId,
  
  // Serializer
  serialize,
  deserialize,
  tryDeserialize,
  serializers,
  
  // Query
  query,
  errors,
  recent,
  search,
  levelFilter,
  and,
  or,
  not,
  parseRelativeTime,
  
  // Console
  log,
  scopedLogger,
  configureConsole,
  flushBuffer,
  peekBuffer,
  
  // Converters
  fromLogObservation,
  toObservabilityEvent,
} from '../../src/observability/envelope/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Envelope Factory', () => {
  it('creates log envelope with all fields', () => {
    const env = createLog('info', 'database', 'query', 'Query executed', { sql: 'SELECT 1' });
    
    expect(env.kind).toBe(ObservationKind.LOG);
    expect(env.level).toBe(LogLevel.INFO);
    expect(env.source.component).toBe('database');
    expect(env.source.operation).toBe('query');
    expect(env.message).toBe('Query executed');
    expect(env.data).toEqual({ sql: 'SELECT 1' });
    expect(env.id).toBeDefined();
    expect(env.timestamp).toBeDefined();
    expect(env.correlation.id).toBeDefined();
  });
  
  it('provides shorthand functions for each level', () => {
    const d = debug('test', 'op', 'debug msg');
    const i = info('test', 'op', 'info msg');
    const w = warn('test', 'op', 'warn msg');
    const e = error('test', 'op', 'error msg');
    
    expect(d.level).toBe(LogLevel.DEBUG);
    expect(i.level).toBe(LogLevel.INFO);
    expect(w.level).toBe(LogLevel.WARN);
    expect(e.level).toBe(LogLevel.ERROR);
  });
  
  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });
  
  it('generates correlation IDs', () => {
    const id = generateCorrelationId();
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
  
  it('creates metric envelope', () => {
    const env = createMetric('cache', 'hit', { hitRate: 0.95, latencyMs: 2 });
    
    expect(env.kind).toBe(ObservationKind.METRIC);
    expect(env.source.component).toBe('cache');
    expect(env.data).toEqual({ hitRate: 0.95, latencyMs: 2 });
  });
  
  it('creates alert envelope', () => {
    const env = createAlert('critical', 'database', 'health-check', 'Database connection lost', { host: 'db-1' });
    
    expect(env.kind).toBe(ObservationKind.ALERT);
    expect(env.message).toBe('Database connection lost');
    expect(env.alertSeverity).toBe('critical');
    expect(env.source.component).toBe('database');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERIALIZER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Envelope Serializer', () => {
  const testEnvelope = createLog('info', 'test', 'serialize', 'Test message', { key: 'value' });
  
  it('serializes to JSON', () => {
    const json = serialize(testEnvelope, { format: 'json' });
    const parsed = JSON.parse(json);
    
    expect(parsed.kind).toBe('log');
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('Test message');
  });
  
  it('serializes to JSONL (single line)', () => {
    const jsonl = serialize(testEnvelope, { format: 'jsonl' });
    
    expect(jsonl).not.toContain('\n');
    const parsed = JSON.parse(jsonl);
    expect(parsed.message).toBe('Test message');
  });
  
  it('serializes to compact format', () => {
    const compact = serialize(testEnvelope, { format: 'compact', colorize: false });
    
    expect(compact).toContain('INFO');
    expect(compact).toContain('test.serialize');
    expect(compact).toContain('Test message');
  });
  
  it('serializes to structured format', () => {
    const structured = serialize(testEnvelope, { format: 'structured' });
    
    expect(structured).toContain('level=info');
    expect(structured).toContain('component=test');
    expect(structured).toContain('message="Test message"');
  });
  
  it('deserializes JSON back to envelope', () => {
    const json = serialize(testEnvelope, { format: 'json' });
    const restored = deserialize(json);
    
    expect(restored.id).toBe(testEnvelope.id);
    expect(restored.message).toBe(testEnvelope.message);
    expect(restored.level).toBe(testEnvelope.level);
  });
  
  it('tryDeserialize returns null on invalid JSON', () => {
    expect(tryDeserialize('not json')).toBeNull();
    expect(tryDeserialize('{}')).toBeNull(); // Missing required fields
  });
  
  it('pre-configured serializers work', () => {
    const jsonOut = serializers.json.serialize(testEnvelope);
    expect(JSON.parse(jsonOut).message).toBe('Test message');
    
    const structuredOut = serializers.structured.serialize(testEnvelope);
    expect(structuredOut).toContain('level=info');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QUERY TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Envelope Query', () => {
  const testLogs: UniversalEnvelope<unknown>[] = [
    createLog('debug', 'database', 'connect', 'Connecting to DB'),
    createLog('info', 'database', 'query', 'Query executed', { sql: 'SELECT 1' }),
    createLog('info', 'cache', 'hit', 'Cache hit'),
    createLog('warn', 'database', 'slow', 'Slow query detected'),
    createLog('error', 'database', 'error', 'Query failed', { error: 'timeout' }),
    createLog('error', 'api', 'error', 'API error'),
    createLog('fatal', 'system', 'crash', 'System crash'),
  ];
  
  it('filters by level', () => {
    const result = query(testLogs).level('ERROR').toArray();
    expect(result.length).toBe(2);
    expect(result.every(e => e.level === 'error')).toBe(true);
  });
  
  it('filters by multiple levels', () => {
    const result = query(testLogs).level('ERROR', 'FATAL').toArray();
    expect(result.length).toBe(3);
  });
  
  it('filters by component', () => {
    const result = query(testLogs).component('database').toArray();
    expect(result.length).toBe(4);
  });
  
  it('filters by component with wildcard', () => {
    const result = query(testLogs).component('data*').toArray();
    expect(result.length).toBe(4);
  });
  
  it('filters by message search', () => {
    const result = query(testLogs).message('query').toArray();
    // Matches: 'Query executed', 'Slow query detected', 'Query failed'
    expect(result.length).toBe(3);
  });
  
  it('chains multiple filters', () => {
    const result = query(testLogs)
      .component('database')
      .level('ERROR', 'WARN')
      .toArray();
    
    expect(result.length).toBe(2);
  });
  
  it('sorts by timestamp', () => {
    const newest = query(testLogs).newest().toArray();
    const oldest = query(testLogs).oldest().toArray();
    
    // Newest first should have last created at top
    expect(new Date(newest[0].timestamp).getTime())
      .toBeGreaterThanOrEqual(new Date(newest[newest.length - 1].timestamp).getTime());
  });
  
  it('limits results', () => {
    const result = query(testLogs).limit(3).toArray();
    expect(result.length).toBe(3);
  });
  
  it('counts results', () => {
    const count = query(testLogs).level('INFO').count();
    expect(count).toBe(2);
  });
  
  it('checks existence', () => {
    expect(query(testLogs).level('FATAL').exists()).toBe(true);
    expect(query(testLogs).level('TRACE').exists()).toBe(false);
  });
  
  it('groups by field', () => {
    const groups = query(testLogs).groupBy('level');
    
    expect(groups.get('info')).toBe(2);
    expect(groups.get('error')).toBe(2);
  });
  
  it('gets distinct values', () => {
    const components = query(testLogs).distinct('component');
    
    expect(components).toContain('database');
    expect(components).toContain('cache');
    expect(components).toContain('api');
    expect(components).toContain('system');
  });
  
  it('provides query result with metadata', () => {
    const result = query(testLogs).level('INFO').execute();
    
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(2);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.filters.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QUICK FILTER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Quick Filters', () => {
  const testLogs: UniversalEnvelope<unknown>[] = [
    createLog('info', 'test', 'op', 'Info message'),
    createLog('error', 'test', 'op', 'Error message'),
    createLog('fatal', 'test', 'op', 'Fatal message'),
  ];
  
  it('errors() returns only error and fatal', () => {
    const result = errors(testLogs);
    expect(result.length).toBe(2);
    expect(result.every(e => e.level === 'error' || e.level === 'fatal')).toBe(true);
  });
  
  it('search() finds by message', () => {
    const result = search(testLogs, 'Fatal');
    expect(result.length).toBe(1);
    expect(result[0].level).toBe('fatal');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FILTER COMBINATOR TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Filter Combinators', () => {
  const testLogs: UniversalEnvelope<unknown>[] = [
    createLog('info', 'database', 'query', 'DB info'),
    createLog('error', 'database', 'query', 'DB error'),
    createLog('info', 'cache', 'hit', 'Cache info'),
    createLog('error', 'cache', 'miss', 'Cache error'),
  ];
  
  it('and() combines filters', () => {
    const filter = and(
      levelFilter('error'),
      (e) => e.source.component === 'database'
    );
    
    const result = testLogs.filter(filter);
    expect(result.length).toBe(1);
    expect(result[0].message).toBe('DB error');
  });
  
  it('or() combines filters', () => {
    const filter = or(
      levelFilter('error'),
      (e) => e.source.component === 'cache'
    );
    
    const result = testLogs.filter(filter);
    expect(result.length).toBe(3); // 2 errors + 1 cache info
  });
  
  it('not() negates filter', () => {
    const filter = not(levelFilter('error'));
    
    const result = testLogs.filter(filter);
    expect(result.length).toBe(2);
    expect(result.every(e => e.level !== 'error')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TIME PARSING TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Time Parsing', () => {
  it('parses relative time strings', () => {
    const now = Date.now();
    
    const fiveMinAgo = parseRelativeTime('5m');
    expect(now - fiveMinAgo.getTime()).toBeCloseTo(5 * 60 * 1000, -2);
    
    const oneHourAgo = parseRelativeTime('1h');
    expect(now - oneHourAgo.getTime()).toBeCloseTo(60 * 60 * 1000, -2);
    
    const twoDaysAgo = parseRelativeTime('2d');
    expect(now - twoDaysAgo.getTime()).toBeCloseTo(2 * 24 * 60 * 60 * 1000, -2);
  });
  
  it('throws on invalid relative time', () => {
    expect(() => parseRelativeTime('5x')).toThrow();
    expect(() => parseRelativeTime('abc')).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONSOLE BRIDGE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Console Bridge', () => {
  beforeEach(() => {
    configureConsole({ buffer: true });
    flushBuffer(); // Clear any previous logs
  });
  
  it('buffers logs in buffer mode', () => {
    log.info('test', 'op', 'Test message', { key: 'value' });
    
    const buffered = peekBuffer();
    expect(buffered.length).toBe(1);
    expect(buffered[0].message).toBe('Test message');
  });
  
  it('supports all log levels', () => {
    log.debug('test', 'op', 'Debug');
    log.info('test', 'op', 'Info');
    log.warn('test', 'op', 'Warn');
    log.error('test', 'op', 'Error');
    log.fatal('test', 'op', 'Fatal');
    
    const buffered = flushBuffer();
    expect(buffered.length).toBe(5);
    
    expect(buffered[0].level).toBe('debug');
    expect(buffered[1].level).toBe('info');
    expect(buffered[2].level).toBe('warn');
    expect(buffered[3].level).toBe('error');
    expect(buffered[4].level).toBe('fatal');
  });
  
  it('scoped logger prefills component', () => {
    const dbLog = scopedLogger('database');
    dbLog.info('query', 'Query OK');
    
    const buffered = flushBuffer();
    expect(buffered[0].source.component).toBe('database');
    expect(buffered[0].source.operation).toBe('query');
  });
  
  it('flushBuffer clears the buffer', () => {
    log.info('test', 'op', 'Message 1');
    log.info('test', 'op', 'Message 2');
    
    const first = flushBuffer();
    expect(first.length).toBe(2);
    
    const second = flushBuffer();
    expect(second.length).toBe(0);
  });
});
