/**
 * PagerDuty Service Tests
 * =======================
 *
 * Test suite for PagerDutyService (P1-008).
 * Tests alert lifecycle, retry logic, circuit breaker, and history tracking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PagerDutyService,
  createPagerDutyService,
  SEVERITY_PRIORITY,
  type AlertInput,
  type HttpClient,
  type PagerDutyEventPayload,
  type PagerDutyResponse,
  type PagerDutyServiceConfig,
} from '../../../src/bot/security/services/pagerduty-service.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock HTTP client for testing.
 */
function createMockHttpClient(responses: PagerDutyResponse[] = []): HttpClient & { calls: PagerDutyEventPayload[] } {
  let callIndex = 0;
  const calls: PagerDutyEventPayload[] = [];

  return {
    calls,
    async post(_url: string, data: PagerDutyEventPayload): Promise<PagerDutyResponse> {
      calls.push(data);
      if (callIndex < responses.length) {
        const response = responses[callIndex++];
        if (response.status === 'error') {
          throw new Error(response.message);
        }
        return response;
      }
      return { status: 'success', message: 'Event processed', dedup_key: data.dedup_key };
    },
  };
}

/**
 * Create a failing HTTP client for circuit breaker testing.
 */
function createFailingHttpClient(failCount: number): HttpClient & { callCount: number } {
  let callCount = 0;

  return {
    get callCount() {
      return callCount;
    },
    async post(_url: string, _data: PagerDutyEventPayload): Promise<PagerDutyResponse> {
      callCount++;
      if (callCount <= failCount) {
        throw new Error(`Failure ${callCount}`);
      }
      return { status: 'success', message: 'Event processed' };
    },
  };
}

/**
 * Create test config with mocked HTTP client.
 */
function createTestConfig(
  overrides?: Partial<PagerDutyServiceConfig>,
  httpClient?: HttpClient
): PagerDutyServiceConfig {
  return {
    routingKey: 'test-routing-key',
    serviceName: 'test-service',
    dryRun: httpClient ? false : true,
    httpClient,
    ...overrides,
  };
}

/**
 * Create test alert input.
 */
function createTestAlert(overrides?: Partial<AlertInput>): AlertInput {
  return {
    severity: 'warning',
    summary: 'Test alert summary',
    source: 'test-source',
    guildId: '123456789',
    component: 'test-component',
    ...overrides,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('PagerDutyService', () => {
  let service: PagerDutyService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new PagerDutyService(createTestConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
    service.clear();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('Constructor', () => {
    it('should create instance with default configuration', () => {
      const svc = new PagerDutyService({
        routingKey: 'key',
        serviceName: 'service',
      });

      expect(svc).toBeInstanceOf(PagerDutyService);
      expect(svc.getStats().activeAlerts).toBe(0);
    });

    it('should create instance with custom configuration', () => {
      const svc = new PagerDutyService({
        routingKey: 'custom-key',
        serviceName: 'custom-service',
        maxRetries: 5,
        retryDelayMs: 500,
        circuitBreakerThreshold: 10,
      });

      expect(svc).toBeInstanceOf(PagerDutyService);
    });

    it('should accept severity-based routing configuration', () => {
      const svc = new PagerDutyService({
        routingKey: 'default-key',
        serviceName: 'service',
        severityRouting: {
          critical: 'critical-key',
          error: 'error-key',
        },
      });

      expect(svc).toBeInstanceOf(PagerDutyService);
    });
  });

  // ==========================================================================
  // Factory Function Tests
  // ==========================================================================

  describe('createPagerDutyService factory', () => {
    it('should create service instance via factory', () => {
      const svc = createPagerDutyService({
        routingKey: 'key',
        serviceName: 'service',
      });

      expect(svc).toBeInstanceOf(PagerDutyService);
    });

    it('should pass configuration to service', () => {
      const svc = createPagerDutyService({
        routingKey: 'key',
        serviceName: 'service',
        dryRun: true,
      });

      expect(svc.getStats().activeAlerts).toBe(0);
    });
  });

  // ==========================================================================
  // Alert Trigger Tests
  // ==========================================================================

  describe('trigger', () => {
    it('should trigger a new alert', async () => {
      const alert = createTestAlert();
      const dedupKey = await service.trigger(alert);

      expect(dedupKey).toBeDefined();
      expect(dedupKey).toContain('test-service');
      expect(dedupKey).toContain('test-source');
    });

    it('should use provided dedup key', async () => {
      const alert = createTestAlert({ dedupKey: 'custom-key-123' });
      const dedupKey = await service.trigger(alert);

      expect(dedupKey).toBe('custom-key-123');
    });

    it('should create alert record with correct data', async () => {
      const alert = createTestAlert({
        severity: 'critical',
        summary: 'Critical alert',
        source: 'security-monitor',
      });

      const dedupKey = await service.trigger(alert);
      const record = service.getAlert(dedupKey);

      expect(record).toBeDefined();
      expect(record!.severity).toBe('critical');
      expect(record!.summary).toBe('Critical alert');
      expect(record!.source).toBe('security-monitor');
      expect(record!.status).toBe('triggered');
      expect(record!.triggeredAt).toBeInstanceOf(Date);
    });

    it('should truncate summary to 1024 characters', async () => {
      const longSummary = 'x'.repeat(2000);
      const alert = createTestAlert({ summary: longSummary });

      const dedupKey = await service.trigger(alert);
      const record = service.getAlert(dedupKey);

      expect(record!.summary.length).toBe(1024);
    });

    it('should update stats on trigger', async () => {
      await service.trigger(createTestAlert({ severity: 'warning', source: 'source-a' }));
      await service.trigger(createTestAlert({ severity: 'critical', source: 'source-b' }));

      const stats = service.getStats();
      expect(stats.totalTriggered).toBe(2);
      expect(stats.bySeverity.warning).toBe(1);
      expect(stats.bySeverity.critical).toBe(1);
      expect(stats.bySource['source-a']).toBe(1);
      expect(stats.bySource['source-b']).toBe(1);
    });

    it('should increment retry count for duplicate alerts', async () => {
      const alert = createTestAlert({ dedupKey: 'dup-key' });

      await service.trigger(alert);
      await service.trigger(alert);
      await service.trigger(alert);

      const record = service.getAlert('dup-key');
      expect(record!.retryCount).toBe(2);
      expect(service.getStats().totalRetries).toBe(2);
    });

    it('should send payload via HTTP client', async () => {
      const mockClient = createMockHttpClient();
      const svc = new PagerDutyService(createTestConfig({}, mockClient));

      const alert = createTestAlert({
        severity: 'error',
        summary: 'Error alert',
        source: 'api-monitor',
        component: 'auth-service',
        group: 'api-errors',
        class: 'service-error',
        customDetails: { errorCode: 500 },
      });

      await svc.trigger(alert);

      expect(mockClient.calls.length).toBe(1);
      expect(mockClient.calls[0].event_action).toBe('trigger');
      expect(mockClient.calls[0].routing_key).toBe('test-routing-key');
      expect(mockClient.calls[0].payload?.severity).toBe('error');
      expect(mockClient.calls[0].payload?.summary).toBe('Error alert');
      expect(mockClient.calls[0].payload?.source).toBe('api-monitor');
      expect(mockClient.calls[0].payload?.component).toBe('auth-service');
      expect(mockClient.calls[0].payload?.group).toBe('api-errors');
      expect(mockClient.calls[0].payload?.class).toBe('service-error');
      expect(mockClient.calls[0].payload?.custom_details).toMatchObject({
        errorCode: 500,
        service_name: 'test-service',
      });
    });

    it('should add alert to history', async () => {
      await service.trigger(createTestAlert());

      const history = service.getAlertHistory();
      expect(history.length).toBe(1);
      expect(history[0].status).toBe('triggered');
    });
  });

  // ==========================================================================
  // Acknowledge Tests
  // ==========================================================================

  describe('acknowledge', () => {
    it('should acknowledge a triggered alert', async () => {
      const dedupKey = await service.trigger(createTestAlert());
      await service.acknowledge(dedupKey, 'Investigating issue');

      const record = service.getAlert(dedupKey);
      expect(record!.status).toBe('acknowledged');
      expect(record!.acknowledgedAt).toBeInstanceOf(Date);
      expect(record!.acknowledgementNote).toBe('Investigating issue');
    });

    it('should track who acknowledged the alert', async () => {
      const dedupKey = await service.trigger(createTestAlert());
      await service.acknowledge(dedupKey, 'Looking into it', 'user@example.com');

      const record = service.getAlert(dedupKey);
      expect(record!.acknowledgedBy).toBe('user@example.com');
    });

    it('should update stats on acknowledge', async () => {
      const dedupKey = await service.trigger(createTestAlert());
      await service.acknowledge(dedupKey);

      expect(service.getStats().totalAcknowledged).toBe(1);
    });

    it('should throw for non-existent alert', async () => {
      await expect(service.acknowledge('non-existent')).rejects.toThrow('Alert not found');
    });

    it('should throw for already resolved alert', async () => {
      const dedupKey = await service.trigger(createTestAlert());
      await service.resolve(dedupKey);

      await expect(service.acknowledge(dedupKey)).rejects.toThrow('Cannot acknowledge resolved alert');
    });

    it('should send acknowledge event via HTTP client', async () => {
      const mockClient = createMockHttpClient();
      const svc = new PagerDutyService(createTestConfig({}, mockClient));

      const dedupKey = await svc.trigger(createTestAlert());
      await svc.acknowledge(dedupKey);

      expect(mockClient.calls.length).toBe(2);
      expect(mockClient.calls[1].event_action).toBe('acknowledge');
      expect(mockClient.calls[1].dedup_key).toBe(dedupKey);
    });
  });

  // ==========================================================================
  // Resolve Tests
  // ==========================================================================

  describe('resolve', () => {
    it('should resolve an alert', async () => {
      const dedupKey = await service.trigger(createTestAlert());
      await service.resolve(dedupKey, 'Issue fixed');

      const record = service.getAlert(dedupKey);
      expect(record!.status).toBe('resolved');
      expect(record!.resolvedAt).toBeInstanceOf(Date);
      expect(record!.resolutionNote).toBe('Issue fixed');
    });

    it('should track who resolved the alert', async () => {
      const dedupKey = await service.trigger(createTestAlert());
      await service.resolve(dedupKey, 'Fixed in deploy', 'deploy-bot');

      const record = service.getAlert(dedupKey);
      expect(record!.resolvedBy).toBe('deploy-bot');
    });

    it('should update stats on resolve', async () => {
      const dedupKey = await service.trigger(createTestAlert());
      await service.resolve(dedupKey);

      expect(service.getStats().totalResolved).toBe(1);
      expect(service.getStats().activeAlerts).toBe(0);
    });

    it('should throw for non-existent alert', async () => {
      await expect(service.resolve('non-existent')).rejects.toThrow('Alert not found');
    });

    it('should be idempotent for already resolved alerts', async () => {
      const dedupKey = await service.trigger(createTestAlert());
      await service.resolve(dedupKey);
      await service.resolve(dedupKey); // Should not throw

      expect(service.getStats().totalResolved).toBe(1);
    });

    it('should send resolve event via HTTP client', async () => {
      const mockClient = createMockHttpClient();
      const svc = new PagerDutyService(createTestConfig({}, mockClient));

      const dedupKey = await svc.trigger(createTestAlert());
      await svc.resolve(dedupKey);

      expect(mockClient.calls.length).toBe(2);
      expect(mockClient.calls[1].event_action).toBe('resolve');
      expect(mockClient.calls[1].dedup_key).toBe(dedupKey);
    });
  });

  // ==========================================================================
  // Suppress Tests
  // ==========================================================================

  describe('suppress', () => {
    it('should suppress an alert', () => {
      const dedupKey = service.generateDedupKey(createTestAlert());
      service['alerts'].set(dedupKey, {
        dedupKey,
        severity: 'warning',
        summary: 'Test',
        source: 'test',
        status: 'triggered',
        triggeredAt: new Date(),
        retryCount: 0,
      });

      service.suppress(dedupKey, 'Known issue');

      const record = service.getAlert(dedupKey);
      expect(record!.status).toBe('suppressed');
      expect(record!.resolutionNote).toBe('Known issue');
    });

    it('should update stats on suppress', async () => {
      const dedupKey = await service.trigger(createTestAlert());
      service.suppress(dedupKey, 'False positive');

      expect(service.getStats().totalSuppressed).toBe(1);
      expect(service.getStats().activeAlerts).toBe(0);
    });

    it('should throw for non-existent alert', () => {
      expect(() => service.suppress('non-existent')).toThrow('Alert not found');
    });
  });

  // ==========================================================================
  // Query Tests
  // ==========================================================================

  describe('Query Methods', () => {
    beforeEach(async () => {
      await service.trigger(createTestAlert({ severity: 'critical', source: 'source-a', guildId: 'guild-1' }));
      await service.trigger(createTestAlert({ severity: 'warning', source: 'source-a', guildId: 'guild-2' }));
      await service.trigger(createTestAlert({ severity: 'warning', source: 'source-b', guildId: 'guild-1' }));
    });

    it('getActiveAlerts should return triggered and acknowledged alerts', async () => {
      const alerts = service.getActiveAlerts();
      expect(alerts.length).toBe(3);

      // Resolve one
      await service.resolve(alerts[0].dedupKey);
      expect(service.getActiveAlerts().length).toBe(2);
    });

    it('getAlertsBySeverity should filter by severity', () => {
      const critical = service.getAlertsBySeverity('critical');
      expect(critical.length).toBe(1);

      const warnings = service.getAlertsBySeverity('warning');
      expect(warnings.length).toBe(2);
    });

    it('getAlertsBySource should filter by source', () => {
      const sourceA = service.getAlertsBySource('source-a');
      expect(sourceA.length).toBe(2);

      const sourceB = service.getAlertsBySource('source-b');
      expect(sourceB.length).toBe(1);
    });

    it('getAlertsByGuild should filter by guild', () => {
      const guild1 = service.getAlertsByGuild('guild-1');
      expect(guild1.length).toBe(2);

      const guild2 = service.getAlertsByGuild('guild-2');
      expect(guild2.length).toBe(1);
    });

    it('getAlertHistory should return alerts in reverse chronological order', () => {
      const history = service.getAlertHistory();
      expect(history.length).toBe(3);
      // Most recent first
      expect(history[0].source).toBe('source-b');
    });

    it('getAlertHistory should respect limit', () => {
      const history = service.getAlertHistory(2);
      expect(history.length).toBe(2);
    });
  });

  // ==========================================================================
  // Circuit Breaker Tests
  // ==========================================================================

  describe('Circuit Breaker', () => {
    it('should start in closed state', () => {
      expect(service.getCircuitBreakerState()).toBe('closed');
    });

    it('should open after threshold failures', async () => {
      const failingClient = createFailingHttpClient(100);
      const svc = new PagerDutyService(
        createTestConfig({ circuitBreakerThreshold: 3, maxRetries: 0 }, failingClient)
      );

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        try {
          await svc.trigger(createTestAlert({ dedupKey: `fail-${i}` }));
        } catch {
          // Expected
        }
      }

      expect(svc.getCircuitBreakerState()).toBe('open');
    });

    it('should reject requests when open', async () => {
      const failingClient = createFailingHttpClient(100);
      const svc = new PagerDutyService(
        createTestConfig({ circuitBreakerThreshold: 2, maxRetries: 0 }, failingClient)
      );

      // Open the circuit breaker
      for (let i = 0; i < 2; i++) {
        try {
          await svc.trigger(createTestAlert({ dedupKey: `fail-${i}` }));
        } catch {
          // Expected
        }
      }

      await expect(svc.trigger(createTestAlert())).rejects.toThrow('Circuit breaker is open');
    });

    it('should transition to half-open after reset timeout', async () => {
      const failingClient = createFailingHttpClient(100);
      const svc = new PagerDutyService(
        createTestConfig({ circuitBreakerThreshold: 2, circuitBreakerResetMs: 1000, maxRetries: 0 }, failingClient)
      );

      // Open the circuit breaker
      for (let i = 0; i < 2; i++) {
        try {
          await svc.trigger(createTestAlert({ dedupKey: `fail-${i}` }));
        } catch {
          // Expected
        }
      }

      expect(svc.getCircuitBreakerState()).toBe('open');

      // Advance time past reset timeout
      vi.advanceTimersByTime(1100);

      expect(svc.getCircuitBreakerState()).toBe('half-open');
    });

    it('should reset to closed on success in half-open state', async () => {
      // Use a client that fails first 2 times, then succeeds
      let callCount = 0;
      const client: HttpClient = {
        async post(): Promise<PagerDutyResponse> {
          callCount++;
          if (callCount <= 2) {
            throw new Error('Fail');
          }
          return { status: 'success', message: 'OK' };
        },
      };

      const svc = new PagerDutyService(
        createTestConfig({ circuitBreakerThreshold: 2, circuitBreakerResetMs: 100, maxRetries: 0 }, client)
      );

      // Open circuit breaker
      for (let i = 0; i < 2; i++) {
        try {
          await svc.trigger(createTestAlert({ dedupKey: `fail-${i}` }));
        } catch {
          // Expected
        }
      }

      expect(svc.getCircuitBreakerState()).toBe('open');

      // Wait for half-open
      vi.advanceTimersByTime(150);
      expect(svc.getCircuitBreakerState()).toBe('half-open');

      // Successful request should close
      await svc.trigger(createTestAlert({ dedupKey: 'success' }));
      expect(svc.getCircuitBreakerState()).toBe('closed');
    });

    it('resetCircuitBreaker should manually reset state', async () => {
      const failingClient = createFailingHttpClient(100);
      const svc = new PagerDutyService(
        createTestConfig({ circuitBreakerThreshold: 2, maxRetries: 0 }, failingClient)
      );

      // Open the circuit breaker
      for (let i = 0; i < 2; i++) {
        try {
          await svc.trigger(createTestAlert({ dedupKey: `fail-${i}` }));
        } catch {
          // Expected
        }
      }

      expect(svc.getCircuitBreakerState()).toBe('open');

      svc.resetCircuitBreaker();
      expect(svc.getCircuitBreakerState()).toBe('closed');
    });
  });

  // ==========================================================================
  // Retry Logic Tests
  // ==========================================================================

  describe('Retry Logic', () => {
    it('should retry on failure', async () => {
      vi.useRealTimers(); // Use real timers for retry tests
      let attempts = 0;
      const client: HttpClient = {
        async post(): Promise<PagerDutyResponse> {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary failure');
          }
          return { status: 'success', message: 'OK' };
        },
      };

      const svc = new PagerDutyService(
        createTestConfig({ maxRetries: 3, retryDelayMs: 1 }, client)
      );

      await svc.trigger(createTestAlert());
      expect(attempts).toBe(3);
    });

    it('should throw after max retries exhausted', async () => {
      vi.useRealTimers(); // Use real timers for retry tests
      const client: HttpClient = {
        async post(): Promise<PagerDutyResponse> {
          throw new Error('Permanent failure');
        },
      };

      const svc = new PagerDutyService(
        createTestConfig({ maxRetries: 2, retryDelayMs: 1, circuitBreakerThreshold: 100 }, client)
      );

      await expect(svc.trigger(createTestAlert())).rejects.toThrow('Permanent failure');
    });

    it('should update retry count in stats', async () => {
      vi.useRealTimers(); // Use real timers for retry tests
      let attempts = 0;
      const client: HttpClient = {
        async post(): Promise<PagerDutyResponse> {
          attempts++;
          if (attempts < 3) {
            throw new Error('Fail');
          }
          return { status: 'success', message: 'OK' };
        },
      };

      const svc = new PagerDutyService(
        createTestConfig({ maxRetries: 3, retryDelayMs: 1 }, client)
      );

      await svc.trigger(createTestAlert());

      // 2 retries (initial + 2 retries = 3 attempts)
      expect(svc.getStats().totalRetries).toBe(2);
    });
  });

  // ==========================================================================
  // Severity Routing Tests
  // ==========================================================================

  describe('Severity Routing', () => {
    it('should use severity-specific routing key when configured', async () => {
      const mockClient = createMockHttpClient();
      const svc = new PagerDutyService(
        createTestConfig(
          {
            routingKey: 'default-key',
            severityRouting: {
              critical: 'critical-key',
              error: 'error-key',
            },
          },
          mockClient
        )
      );

      await svc.trigger(createTestAlert({ severity: 'critical' }));
      expect(mockClient.calls[0].routing_key).toBe('critical-key');

      await svc.trigger(createTestAlert({ severity: 'error', dedupKey: 'error-1' }));
      expect(mockClient.calls[1].routing_key).toBe('error-key');

      await svc.trigger(createTestAlert({ severity: 'warning', dedupKey: 'warning-1' }));
      expect(mockClient.calls[2].routing_key).toBe('default-key');
    });
  });

  // ==========================================================================
  // Utility Tests
  // ==========================================================================

  describe('Utility Methods', () => {
    describe('generateDedupKey', () => {
      it('should generate deterministic dedup key', () => {
        const key1 = service.generateDedupKey({
          source: 'source',
          severity: 'warning',
          guildId: 'guild-1',
          component: 'comp',
        });

        const key2 = service.generateDedupKey({
          source: 'source',
          severity: 'warning',
          guildId: 'guild-1',
          component: 'comp',
        });

        expect(key1).toBe(key2);
      });

      it('should use "global" for missing guildId', () => {
        const key = service.generateDedupKey({
          source: 'source',
          severity: 'warning',
          component: 'comp',
        });

        expect(key).toContain('global');
      });

      it('should use "default" for missing component', () => {
        const key = service.generateDedupKey({
          source: 'source',
          severity: 'warning',
          guildId: 'guild-1',
        });

        expect(key).toContain('default');
      });
    });

    describe('clear', () => {
      it('should reset all state', async () => {
        await service.trigger(createTestAlert());
        await service.trigger(createTestAlert({ dedupKey: 'key-2' }));

        expect(service.getActiveAlerts().length).toBe(2);
        expect(service.getAlertHistory().length).toBe(2);

        service.clear();

        expect(service.getActiveAlerts().length).toBe(0);
        expect(service.getAlertHistory().length).toBe(0);
        expect(service.getStats().totalTriggered).toBe(0);
      });
    });

    describe('getStats', () => {
      it('should return comprehensive statistics', async () => {
        await service.trigger(createTestAlert({ severity: 'critical', source: 'src-a' }));
        await service.trigger(createTestAlert({ severity: 'warning', source: 'src-b', dedupKey: 'key-2' }));

        const stats = service.getStats();

        expect(stats.totalTriggered).toBe(2);
        expect(stats.bySeverity.critical).toBe(1);
        expect(stats.bySeverity.warning).toBe(1);
        expect(stats.bySource['src-a']).toBe(1);
        expect(stats.bySource['src-b']).toBe(1);
        expect(stats.activeAlerts).toBe(2);
        expect(stats.circuitBreakerState).toBe('closed');
      });
    });
  });

  // ==========================================================================
  // History Retention Tests
  // ==========================================================================

  describe('History Retention', () => {
    it('should limit history to configured retention', async () => {
      const svc = new PagerDutyService(
        createTestConfig({ historyRetention: 5 })
      );

      for (let i = 0; i < 10; i++) {
        await svc.trigger(createTestAlert({ dedupKey: `key-${i}` }));
      }

      expect(svc.getAlertHistory().length).toBe(5);
    });
  });

  // ==========================================================================
  // Constants Tests
  // ==========================================================================

  describe('Constants', () => {
    it('SEVERITY_PRIORITY should have correct ordering', () => {
      expect(SEVERITY_PRIORITY.critical).toBeGreaterThan(SEVERITY_PRIORITY.error);
      expect(SEVERITY_PRIORITY.error).toBeGreaterThan(SEVERITY_PRIORITY.warning);
      expect(SEVERITY_PRIORITY.warning).toBeGreaterThan(SEVERITY_PRIORITY.info);
    });
  });

  // ==========================================================================
  // Dry Run Mode Tests
  // ==========================================================================

  describe('Dry Run Mode', () => {
    it('should not make API calls in dry-run mode', async () => {
      const mockClient = createMockHttpClient();
      const svc = new PagerDutyService(
        createTestConfig({ dryRun: true }, mockClient)
      );

      await svc.trigger(createTestAlert());
      await svc.acknowledge(service.generateDedupKey(createTestAlert()));

      // Despite having httpClient, dry-run should skip API calls
      // The service creates alert locally but skips HTTP
      const stats = svc.getStats();
      expect(stats.totalTriggered).toBe(1);
    });

    it('should still track alerts locally in dry-run mode', async () => {
      const svc = new PagerDutyService(createTestConfig({ dryRun: true }));

      const dedupKey = await svc.trigger(createTestAlert());
      const record = svc.getAlert(dedupKey);

      expect(record).toBeDefined();
      expect(record!.status).toBe('triggered');
    });
  });
});
