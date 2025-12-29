/**
 * ExportEnvelope Tests
 * 
 * Tests for scoped envelope creation, serialization, and batching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createExportEnvelope,
  toExportEnvelope,
  isExportEnvelope,
  LogEnvelope,
  toJson,
  toJsonl,
  toPretty,
  toLoki,
  EnvelopeBatcher,
  type ExportEnvelope,
} from '../../src/sensaios/export-envelope.js';
import { systemScope, type TenantScope } from '../../src/sensaios/tenant-scope.js';
import type { UniversalEnvelope } from '../../src/observability/envelope/types.js';

describe('ExportEnvelope', () => {
  const testScope: TenantScope = {
    tenant: 'test-guild',
    environment: 'development',
    service: 'test-service',
    component: 'test-component',
  };

  describe('Factory Functions', () => {
    it('createExportEnvelope should create envelope with scope', () => {
      const envelope = createExportEnvelope({
        scope: testScope,
        message: 'Test message',
      });

      expect(envelope.scope).toEqual(testScope);
      expect(envelope.message).toBe('Test message');
      expect(envelope.id).toBeDefined();
      expect(envelope.timestamp).toBeDefined();
      expect(envelope.kind).toBe('log');
      expect(envelope.level).toBe('info');
    });

    it('createExportEnvelope should use provided values', () => {
      const envelope = createExportEnvelope({
        scope: testScope,
        message: 'Custom message',
        id: 'custom-id',
        kind: 'event',
        level: 'warn',
        correlationId: 'corr-123',
        data: { key: 'value' },
        tags: ['tag1', 'tag2'],
      });

      expect(envelope.id).toBe('custom-id');
      expect(envelope.kind).toBe('event');
      expect(envelope.level).toBe('warn');
      expect(envelope.correlation.id).toBe('corr-123');
      expect(envelope.data).toEqual({ key: 'value' });
      expect(envelope.tags).toEqual(['tag1', 'tag2']);
    });

    it('createExportEnvelope should set source from scope', () => {
      const envelope = createExportEnvelope({
        scope: testScope,
        message: 'Test',
        operation: 'query',
      });

      expect(envelope.source.service).toBe('test-service');
      expect(envelope.source.component).toBe('test-component');
      expect(envelope.source.operation).toBe('query');
    });

    it('createExportEnvelope should set export metadata', () => {
      const envelope = createExportEnvelope({
        scope: testScope,
        message: 'Test',
        format: 'jsonl',
        destination: 'loki',
        ttlSeconds: 3600,
      });

      expect(envelope.export.format).toBe('jsonl');
      expect(envelope.export.destination).toBe('loki');
      expect(envelope.export.ttlSeconds).toBe(3600);
      expect(envelope.export.exportedAt).toBeDefined();
    });

    it('toExportEnvelope should convert UniversalEnvelope', () => {
      const universal: UniversalEnvelope = {
        id: 'universal-id',
        timestamp: '2025-12-28T00:00:00Z',
        kind: 'log',
        level: 'info',
        source: { service: 's', component: 'c', operation: 'o' },
        correlation: { id: 'cid' },
        message: 'Universal message',
      };

      const exported = toExportEnvelope(universal, testScope);

      expect(exported.id).toBe('universal-id');
      expect(exported.message).toBe('Universal message');
      expect(exported.scope).toEqual(testScope);
      expect(exported.export.format).toBe('json');
    });
  });

  describe('Type Guard', () => {
    it('isExportEnvelope should return true for valid envelope', () => {
      const envelope = createExportEnvelope({
        scope: testScope,
        message: 'Test',
      });

      expect(isExportEnvelope(envelope)).toBe(true);
    });

    it('isExportEnvelope should return false for invalid objects', () => {
      expect(isExportEnvelope(null)).toBe(false);
      expect(isExportEnvelope({})).toBe(false);
      expect(isExportEnvelope({ id: 'test' })).toBe(false);
      expect(isExportEnvelope({ id: 'test', timestamp: 'ts', message: 'm' })).toBe(false);
    });
  });

  describe('LogEnvelope Helpers', () => {
    it('LogEnvelope.debug should create debug level envelope', () => {
      const envelope = LogEnvelope.debug(testScope, 'Debug message', { detail: 1 });

      expect(envelope.level).toBe('debug');
      expect(envelope.message).toBe('Debug message');
      expect(envelope.data).toEqual({ detail: 1 });
    });

    it('LogEnvelope.info should create info level envelope', () => {
      const envelope = LogEnvelope.info(testScope, 'Info message');

      expect(envelope.level).toBe('info');
      expect(envelope.message).toBe('Info message');
    });

    it('LogEnvelope.warn should create warn level envelope', () => {
      const envelope = LogEnvelope.warn(testScope, 'Warning');

      expect(envelope.level).toBe('warn');
    });

    it('LogEnvelope.error should create error level envelope', () => {
      const envelope = LogEnvelope.error(testScope, 'Error occurred');

      expect(envelope.level).toBe('error');
    });

    it('LogEnvelope.fatal should create fatal level envelope', () => {
      const envelope = LogEnvelope.fatal(testScope, 'Fatal error');

      expect(envelope.level).toBe('fatal');
    });

    it('LogEnvelope should accept correlation ID', () => {
      const envelope = LogEnvelope.info(testScope, 'Test', undefined, 'corr-456');

      expect(envelope.correlation.id).toBe('corr-456');
    });
  });

  describe('Serialization', () => {
    it('toJson should produce valid JSON', () => {
      const envelope = LogEnvelope.info(testScope, 'JSON test');
      const json = toJson(envelope);
      const parsed = JSON.parse(json);

      expect(parsed.message).toBe('JSON test');
      expect(parsed.scope.tenant).toBe('test-guild');
    });

    it('toJsonl should add newline', () => {
      const envelope = LogEnvelope.info(testScope, 'JSONL test');
      const jsonl = toJsonl(envelope);

      expect(jsonl.endsWith('\n')).toBe(true);
      expect(JSON.parse(jsonl.trim()).message).toBe('JSONL test');
    });

    it('toPretty should produce human-readable output', () => {
      const envelope = LogEnvelope.warn(testScope, 'Pretty warning', { count: 5 });
      const pretty = toPretty(envelope);

      expect(pretty).toContain('[development:test-guild]');
      expect(pretty).toContain('WARN');
      expect(pretty).toContain('Pretty warning');
      expect(pretty).toContain('"count":5');
    });

    it('toPretty should include error info when present', () => {
      const envelope = createExportEnvelope({
        scope: testScope,
        message: 'Error occurred',
        level: 'error',
        error: {
          name: 'TypeError',
          message: 'undefined is not a function',
          stack: 'TypeError: undefined is not a function\n    at test.js:1:1\n    at run.js:2:2',
        },
      });
      const pretty = toPretty(envelope);

      expect(pretty).toContain('Error: TypeError: undefined is not a function');
      expect(pretty).toContain('at test.js:1:1');
    });
  });

  describe('Loki Serialization', () => {
    it('toLoki should group by labels', () => {
      const envelopes = [
        LogEnvelope.info(testScope, 'Message 1'),
        LogEnvelope.info(testScope, 'Message 2'),
        LogEnvelope.error(testScope, 'Error 1'),
      ];

      const lokiPayload = toLoki(envelopes);

      // Should have 2 streams (info and error have different level labels)
      expect(lokiPayload.streams.length).toBe(2);

      // Find info stream
      const infoStream = lokiPayload.streams.find(s => s.stream.level === 'info');
      expect(infoStream).toBeDefined();
      expect(infoStream!.values.length).toBe(2);

      // Find error stream
      const errorStream = lokiPayload.streams.find(s => s.stream.level === 'error');
      expect(errorStream).toBeDefined();
      expect(errorStream!.values.length).toBe(1);
    });

    it('toLoki should set correct labels', () => {
      const envelope = LogEnvelope.info(testScope, 'Test');
      const lokiPayload = toLoki([envelope]);
      const stream = lokiPayload.streams[0];

      expect(stream.stream.tenant).toBe('test-guild');
      expect(stream.stream.env).toBe('development');
      expect(stream.stream.service).toBe('test-service');
      expect(stream.stream.component).toBe('test-component');
      expect(stream.stream.level).toBe('info');
    });

    it('toLoki should use nanosecond timestamps', () => {
      const envelope = createExportEnvelope({
        scope: testScope,
        message: 'Test',
        timestamp: '2025-12-28T12:00:00.000Z',
      });
      const lokiPayload = toLoki([envelope]);
      const [timestamp] = lokiPayload.streams[0].values[0];

      // 2025-12-28T12:00:00.000Z in nanoseconds
      const expectedNs = new Date('2025-12-28T12:00:00.000Z').getTime() * 1_000_000;
      expect(timestamp).toBe(expectedNs.toString());
    });
  });

  describe('EnvelopeBatcher', () => {
    it('should batch envelopes', async () => {
      const batches: ExportEnvelope[][] = [];
      const batcher = new EnvelopeBatcher(
        3, // maxSize
        10000, // maxWaitMs
        async (batch) => {
          batches.push(batch);
        }
      );

      batcher.push(LogEnvelope.info(testScope, 'Msg 1'));
      batcher.push(LogEnvelope.info(testScope, 'Msg 2'));
      expect(batcher.size).toBe(2);
      expect(batches.length).toBe(0);

      // Third push should trigger flush
      batcher.push(LogEnvelope.info(testScope, 'Msg 3'));
      
      // Wait for async flush
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(3);
      expect(batcher.size).toBe(0);

      await batcher.stop();
    });

    it('should assign batch ID and sequence', async () => {
      const batches: ExportEnvelope[][] = [];
      const batcher = new EnvelopeBatcher(
        10,
        10000,
        async (batch) => {
          batches.push(batch);
        }
      );

      batcher.push(LogEnvelope.info(testScope, 'Msg 1'));
      batcher.push(LogEnvelope.info(testScope, 'Msg 2'));
      await batcher.flush();

      expect(batches[0][0].export.batchId).toBeDefined();
      expect(batches[0][0].export.sequence).toBe(0);
      expect(batches[0][1].export.sequence).toBe(1);
      expect(batches[0][0].export.batchId).toBe(batches[0][1].export.batchId);

      await batcher.stop();
    });

    it('should reset batch ID after flush', async () => {
      const batches: ExportEnvelope[][] = [];
      const batcher = new EnvelopeBatcher(
        10,
        10000,
        async (batch) => {
          batches.push(batch);
        }
      );

      batcher.push(LogEnvelope.info(testScope, 'Batch 1'));
      await batcher.flush();

      batcher.push(LogEnvelope.info(testScope, 'Batch 2'));
      await batcher.flush();

      expect(batches[0][0].export.batchId).not.toBe(batches[1][0].export.batchId);

      await batcher.stop();
    });

    it('stop should flush remaining and clear timer', async () => {
      const batches: ExportEnvelope[][] = [];
      const batcher = new EnvelopeBatcher(
        10,
        10000,
        async (batch) => {
          batches.push(batch);
        }
      );

      batcher.push(LogEnvelope.info(testScope, 'Final'));
      await batcher.stop();

      expect(batches.length).toBe(1);
      expect(batches[0][0].message).toBe('Final');
    });
  });
});
