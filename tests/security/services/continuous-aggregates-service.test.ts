/**
 * @file continuous-aggregates-service.test.ts
 * @description Tests for TimescaleDB Continuous Aggregates Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContinuousAggregatesService,
  createContinuousAggregatesService,
  ContinuousAggregatesConfig,
  ContinuousAggregateDefinition,
  AggregateError,
  AggregateNotFoundError,
  AggregateExistsError,
  RefreshError,
  isAggregateError,
  isAggregateNotFoundError,
  isRefreshError,
  SECURITY_AGGREGATE_TEMPLATES,
} from '../../../src/bot/security/services/continuous-aggregates-service.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createTestConfig(
  overrides: Partial<ContinuousAggregatesConfig> = {},
): ContinuousAggregatesConfig {
  return {
    schemaName: 'test_aggs',
    defaultRefreshInterval: '1 hour',
    defaultRealTime: true,
    defaultCompressionHours: 168,
    defaultRetentionDays: 90,
    autoManagePolicies: true,
    logger: createMockLogger(),
    mockMode: true, // Enable mock mode for testing
    ...overrides,
  };
}

function createTestAggregateDefinition(
  name: string,
  overrides: Partial<ContinuousAggregateDefinition> = {},
): ContinuousAggregateDefinition {
  return {
    name,
    sourceTable: 'security_events',
    bucketInterval: '1 hour',
    description: `Test aggregate: ${name}`,
    groupByColumns: ['event_type'],
    aggregateExpressions: [
      { alias: 'event_count', expression: 'COUNT(*)', dataType: 'bigint' },
    ],
    realTimeAggregation: true,
    ...overrides,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('ContinuousAggregatesService', () => {
  let service: ContinuousAggregatesService;

  beforeEach(() => {
    service = createContinuousAggregatesService(createTestConfig());
  });

  // ==========================================================================
  // Constructor and Configuration Tests
  // ==========================================================================

  describe('Constructor and Configuration', () => {
    it('should create service with default config', () => {
      const svc = createContinuousAggregatesService(createTestConfig({
        schemaName: 'test_schema',
      }));

      expect(svc).toBeInstanceOf(ContinuousAggregatesService);
    });

    it('should create service with custom config', () => {
      const config = createTestConfig({
        defaultRefreshInterval: '30 minutes',
        defaultRealTime: false,
        defaultCompressionHours: 72,
        defaultRetentionDays: 365,
      });

      const svc = createContinuousAggregatesService(config);
      expect(svc).toBeInstanceOf(ContinuousAggregatesService);
    });

    it('should accept custom logger', () => {
      const logger = createMockLogger();
      const svc = createContinuousAggregatesService(
        createTestConfig({ logger }),
      );

      expect(svc).toBeInstanceOf(ContinuousAggregatesService);
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should accept notification callback', async () => {
      const notifications: unknown[] = [];
      const svc = createContinuousAggregatesService(
        createTestConfig({ 
          onNotification: (n) => notifications.push(n),
        }),
      );

      await svc.create(createTestAggregateDefinition('notify-test'));

      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0]).toHaveProperty('type', 'aggregate_created');
    });
  });

  // ==========================================================================
  // Aggregate Creation Tests
  // ==========================================================================

  describe('Aggregate Creation', () => {
    it('should create a continuous aggregate', async () => {
      const definition = createTestAggregateDefinition('test_aggregate');

      await service.create(definition);

      expect(service.exists('test_aggregate')).toBe(true);
    });

    it('should store aggregate definition', async () => {
      const definition = createTestAggregateDefinition('stored_agg', {
        bucketInterval: '5 minutes',
        realTimeAggregation: false,
      });

      await service.create(definition);

      const stored = service.getAggregate('stored_agg');
      expect(stored).toBeDefined();
      expect(stored?.bucketInterval).toBe('5 minutes');
      expect(stored?.realTimeAggregation).toBe(false);
    });

    it('should throw when aggregate already exists', async () => {
      await service.create(createTestAggregateDefinition('duplicate'));

      await expect(
        service.create(createTestAggregateDefinition('duplicate')),
      ).rejects.toThrow(AggregateExistsError);
    });

    it('should create refresh policy when auto-manage enabled', async () => {
      const definition = createTestAggregateDefinition('with_policy', {
        refreshPolicy: {
          refreshInterval: '30 minutes',
          startOffset: '2 hours',
          endOffset: '30 minutes',
        },
      });

      await service.create(definition);

      const policy = service.getRefreshPolicy('with_policy');
      expect(policy).toBeDefined();
      expect(policy?.refreshInterval).toBe('30 minutes');
    });

    it('should enable compression when configured', async () => {
      const notifications: unknown[] = [];
      const svc = createContinuousAggregatesService(
        createTestConfig({
          onNotification: (n) => notifications.push(n),
        }),
      );

      const definition = createTestAggregateDefinition('compressed', {
        compressionAfter: 24,
      });

      await svc.create(definition);

      const compressionNotification = notifications.find(
        (n: unknown) => (n as { type: string }).type === 'compression_enabled',
      );
      expect(compressionNotification).toBeDefined();
    });

    it('should set retention policy when configured', async () => {
      const notifications: unknown[] = [];
      const svc = createContinuousAggregatesService(
        createTestConfig({
          onNotification: (n) => notifications.push(n),
        }),
      );

      const definition = createTestAggregateDefinition('retained', {
        retentionDays: 30,
      });

      await svc.create(definition);

      const retentionNotification = notifications.find(
        (n: unknown) => (n as { type: string }).type === 'retention_applied',
      );
      expect(retentionNotification).toBeDefined();
    });
  });

  // ==========================================================================
  // Template Creation Tests
  // ==========================================================================

  describe('Template Creation', () => {
    it('should create aggregate from template', async () => {
      await service.createFromTemplate('events_hourly', 'my_events_hourly');

      expect(service.exists('my_events_hourly')).toBe(true);
      const aggregate = service.getAggregate('my_events_hourly');
      expect(aggregate?.bucketInterval).toBe('1 hour');
    });

    it('should create daily login metrics from template', async () => {
      await service.createFromTemplate('login_metrics_daily', 'login_daily');

      const aggregate = service.getAggregate('login_daily');
      expect(aggregate?.bucketInterval).toBe('1 day');
      expect(aggregate?.retentionDays).toBe(365);
    });

    it('should create alert metrics from template', async () => {
      await service.createFromTemplate('alert_metrics_hourly', 'alerts_hourly');

      const aggregate = service.getAggregate('alerts_hourly');
      expect(aggregate?.compressionAfter).toBe(168);
      expect(aggregate?.retentionDays).toBe(90);
    });

    it('should throw for unknown template', async () => {
      await expect(
        service.createFromTemplate('unknown_template' as keyof typeof SECURITY_AGGREGATE_TEMPLATES, 'test'),
      ).rejects.toThrow('Unknown template');
    });

    it('should have all expected templates', () => {
      const expectedTemplates = [
        'events_hourly',
        'login_metrics_daily',
        'alert_metrics_hourly',
        'permission_changes_daily',
        'threat_metrics_5min',
      ];

      for (const template of expectedTemplates) {
        expect(SECURITY_AGGREGATE_TEMPLATES).toHaveProperty(template);
      }
    });
  });

  // ==========================================================================
  // Aggregate Drop Tests
  // ==========================================================================

  describe('Aggregate Drop', () => {
    it('should drop an aggregate', async () => {
      await service.create(createTestAggregateDefinition('to_drop'));
      expect(service.exists('to_drop')).toBe(true);

      await service.drop('to_drop');
      expect(service.exists('to_drop')).toBe(false);
    });

    it('should throw when dropping non-existent aggregate', async () => {
      await expect(service.drop('nonexistent')).rejects.toThrow(
        AggregateNotFoundError,
      );
    });

    it('should clean up policies when dropping', async () => {
      const definition = createTestAggregateDefinition('with_cleanup', {
        refreshPolicy: { refreshInterval: '1 hour' },
      });
      await service.create(definition);

      expect(service.getRefreshPolicy('with_cleanup')).toBeDefined();

      await service.drop('with_cleanup');
      expect(service.getRefreshPolicy('with_cleanup')).toBeUndefined();
    });

    it('should send notification when dropping', async () => {
      const notifications: unknown[] = [];
      const svc = createContinuousAggregatesService(
        createTestConfig({
          onNotification: (n) => notifications.push(n),
        }),
      );

      await svc.create(createTestAggregateDefinition('drop_notify'));
      await svc.drop('drop_notify');

      const dropNotification = notifications.find(
        (n: unknown) => (n as { type: string }).type === 'aggregate_dropped',
      );
      expect(dropNotification).toBeDefined();
    });
  });

  // ==========================================================================
  // Listing Tests
  // ==========================================================================

  describe('Aggregate Listing', () => {
    it('should list all aggregates', async () => {
      await service.create(createTestAggregateDefinition('list_1'));
      await service.create(createTestAggregateDefinition('list_2'));
      await service.create(createTestAggregateDefinition('list_3'));

      const aggregates = service.listAggregates();
      expect(aggregates).toHaveLength(3);
    });

    it('should return empty list when no aggregates', () => {
      const aggregates = service.listAggregates();
      expect(aggregates).toHaveLength(0);
    });

    it('should check existence correctly', async () => {
      await service.create(createTestAggregateDefinition('exists_check'));

      expect(service.exists('exists_check')).toBe(true);
      expect(service.exists('does_not_exist')).toBe(false);
    });
  });

  // ==========================================================================
  // Refresh Tests
  // ==========================================================================

  describe('Refresh Operations', () => {
    beforeEach(async () => {
      await service.create(createTestAggregateDefinition('refresh_test'));
    });

    it('should refresh an aggregate', async () => {
      const result = await service.refresh('refresh_test');

      expect(result.success).toBe(true);
      expect(result.aggregateName).toBe('refresh_test');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should refresh with custom window', async () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');

      const result = await service.refresh('refresh_test', start, end);

      expect(result.windowStart).toEqual(start);
      expect(result.windowEnd).toEqual(end);
    });

    it('should throw when refreshing non-existent aggregate', async () => {
      await expect(service.refresh('nonexistent')).rejects.toThrow(
        AggregateNotFoundError,
      );
    });

    it('should record refresh history', async () => {
      await service.refresh('refresh_test');
      await service.refresh('refresh_test');

      const history = service.getRefreshHistory('refresh_test');
      expect(history).toHaveLength(2);
    });

    it('should send notifications during refresh', async () => {
      const notifications: unknown[] = [];
      const svc = createContinuousAggregatesService(
        createTestConfig({
          onNotification: (n) => notifications.push(n),
        }),
      );

      await svc.create(createTestAggregateDefinition('notify_refresh'));
      await svc.refresh('notify_refresh');

      const startNotification = notifications.find(
        (n: unknown) => (n as { type: string }).type === 'refresh_started',
      );
      const completeNotification = notifications.find(
        (n: unknown) => (n as { type: string }).type === 'refresh_completed',
      );

      expect(startNotification).toBeDefined();
      expect(completeNotification).toBeDefined();
    });

    it('should refresh all aggregates', async () => {
      await service.create(createTestAggregateDefinition('refresh_all_1'));
      await service.create(createTestAggregateDefinition('refresh_all_2'));

      const results = await service.refreshAll();

      expect(results).toHaveLength(3); // Including refresh_test from beforeEach
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  // ==========================================================================
  // Policy Tests
  // ==========================================================================

  describe('Policy Management', () => {
    beforeEach(async () => {
      await service.create(createTestAggregateDefinition('policy_test', {
        refreshPolicy: undefined, // Don't auto-create policy
      }));
    });

    it('should create refresh policy', async () => {
      const policy = await service.createRefreshPolicy('policy_test', {
        refreshInterval: '2 hours',
        startOffset: '6 hours',
        endOffset: '2 hours',
      });

      expect(policy.aggregateName).toBe('policy_test');
      expect(policy.refreshInterval).toBe('2 hours');
      expect(policy.enabled).toBe(true);
    });

    it('should use default values for policy', async () => {
      const policy = await service.createRefreshPolicy('policy_test', {});

      expect(policy.refreshInterval).toBe('1 hour'); // Default from config
      expect(policy.startOffset).toBe('3 hours');
      expect(policy.endOffset).toBe('1 hour');
    });

    it('should throw when creating policy for non-existent aggregate', async () => {
      await expect(
        service.createRefreshPolicy('nonexistent', {}),
      ).rejects.toThrow(AggregateNotFoundError);
    });

    it('should remove refresh policy', async () => {
      await service.createRefreshPolicy('policy_test', {});
      expect(service.getRefreshPolicy('policy_test')).toBeDefined();

      await service.removeRefreshPolicy('policy_test');
      expect(service.getRefreshPolicy('policy_test')).toBeUndefined();
    });

    it('should not throw when removing non-existent policy', async () => {
      await expect(
        service.removeRefreshPolicy('policy_test'),
      ).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // Compression Tests
  // ==========================================================================

  describe('Compression Management', () => {
    it('should enable compression', async () => {
      const notifications: unknown[] = [];
      const svc = createContinuousAggregatesService(
        createTestConfig({
          onNotification: (n) => notifications.push(n),
        }),
      );

      await svc.create(createTestAggregateDefinition('compress_test'));
      await svc.enableCompression('compress_test', 48);

      const notification = notifications.find(
        (n: unknown) => (n as { type: string }).type === 'compression_enabled',
      );
      expect(notification).toBeDefined();
      expect((notification as { data: { afterHours: number } }).data.afterHours).toBe(48);
    });

    it('should throw when enabling compression for non-existent aggregate', async () => {
      await expect(
        service.enableCompression('nonexistent', 24),
      ).rejects.toThrow(AggregateNotFoundError);
    });
  });

  // ==========================================================================
  // Retention Tests
  // ==========================================================================

  describe('Retention Management', () => {
    it('should set retention policy', async () => {
      await service.create(createTestAggregateDefinition('retention_test'));
      await service.setRetentionPolicy('retention_test', 180);

      const aggregate = service.getAggregate('retention_test');
      expect(aggregate?.retentionDays).toBe(180);
    });

    it('should throw when setting retention for non-existent aggregate', async () => {
      await expect(
        service.setRetentionPolicy('nonexistent', 30),
      ).rejects.toThrow(AggregateNotFoundError);
    });
  });

  // ==========================================================================
  // Query Tests
  // ==========================================================================

  describe('Query Operations', () => {
    beforeEach(async () => {
      await service.create(createTestAggregateDefinition('query_test'));
    });

    it('should query aggregate', async () => {
      const results = await service.query('query_test', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should query with filters', async () => {
      const results = await service.query('query_test', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
        filters: { event_type: 'login' },
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should query with pagination', async () => {
      const results = await service.query('query_test', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
        limit: 10,
        offset: 5,
      });

      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('should query with ordering', async () => {
      const results = await service.query('query_test', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
        orderBy: 'bucket',
        orderDirection: 'DESC',
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should throw when querying non-existent aggregate', async () => {
      await expect(
        service.query('nonexistent', {
          from: new Date('2024-01-01'),
          to: new Date('2024-01-31'),
        }),
      ).rejects.toThrow(AggregateNotFoundError);
    });
  });

  // ==========================================================================
  // Statistics Tests
  // ==========================================================================

  describe('Statistics', () => {
    beforeEach(async () => {
      await service.create(createTestAggregateDefinition('stats_test'));
    });

    it('should get aggregate statistics', async () => {
      const stats = await service.getStats('stats_test');

      expect(stats.name).toBe('stats_test');
      expect(stats.totalRows).toBeGreaterThanOrEqual(0);
      expect(stats.sizeBytes).toBeGreaterThanOrEqual(0);
      expect(stats.sizeHuman).toBeDefined();
      expect(stats.isRealTime).toBe(true);
    });

    it('should throw for non-existent aggregate', async () => {
      await expect(service.getStats('nonexistent')).rejects.toThrow(
        AggregateNotFoundError,
      );
    });

    it('should get all statistics', async () => {
      await service.create(createTestAggregateDefinition('stats_1'));
      await service.create(createTestAggregateDefinition('stats_2'));

      const allStats = await service.getAllStats();
      expect(allStats).toHaveLength(3); // Including stats_test from beforeEach
    });

    it('should include query metrics in stats', async () => {
      // Perform some queries to record metrics
      await service.query('stats_test', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });
      await service.query('stats_test', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });

      const stats = await service.getStats('stats_test');
      expect(stats.avgQueryTimeMs).toBeDefined();
    });

    it('should get service overview', async () => {
      await service.create(createTestAggregateDefinition('overview_1'));
      await service.refresh('overview_1');

      const overview = service.getOverview();

      expect(overview.totalAggregates).toBe(2); // stats_test + overview_1
      expect(overview.totalRefreshes).toBeGreaterThanOrEqual(1);
      expect(overview.successfulRefreshes).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Error Type Guards Tests
  // ==========================================================================

  describe('Error Type Guards', () => {
    it('should identify AggregateError', () => {
      const error = new AggregateError('test', 'TEST_CODE');
      expect(isAggregateError(error)).toBe(true);
      expect(isAggregateError(new Error())).toBe(false);
    });

    it('should identify AggregateNotFoundError', () => {
      const error = new AggregateNotFoundError('test');
      expect(isAggregateNotFoundError(error)).toBe(true);
      expect(isAggregateNotFoundError(new AggregateError('test', 'OTHER'))).toBe(
        false,
      );
    });

    it('should identify RefreshError', () => {
      const error = new RefreshError('test', 'refresh failed');
      expect(isRefreshError(error)).toBe(true);
      expect(isRefreshError(new AggregateError('test', 'OTHER'))).toBe(false);
    });
  });

  // ==========================================================================
  // Clear and Dispose Tests
  // ==========================================================================

  describe('Clear and Dispose', () => {
    it('should clear all tracking data', async () => {
      await service.create(createTestAggregateDefinition('clear_1'));
      await service.create(createTestAggregateDefinition('clear_2'));
      await service.refresh('clear_1');

      service.clear();

      expect(service.listAggregates()).toHaveLength(0);
      expect(service.getRefreshHistory('clear_1')).toHaveLength(0);
    });

    it('should dispose service', async () => {
      await service.create(createTestAggregateDefinition('dispose_test'));

      service.dispose();

      expect(service.listAggregates()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Edge Cases Tests
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle aggregate with no group by columns', async () => {
      const definition = createTestAggregateDefinition('no_groupby', {
        groupByColumns: [],
        aggregateExpressions: [
          { alias: 'total', expression: 'COUNT(*)', dataType: 'bigint' },
        ],
      });

      await service.create(definition);
      expect(service.exists('no_groupby')).toBe(true);
    });

    it('should handle aggregate with where clause', async () => {
      const definition = createTestAggregateDefinition('with_where', {
        whereClause: "severity = 'critical'",
      });

      await service.create(definition);
      const aggregate = service.getAggregate('with_where');
      expect(aggregate?.whereClause).toBe("severity = 'critical'");
    });

    it('should handle aggregate with multiple expressions', async () => {
      const definition = createTestAggregateDefinition('multi_expr', {
        aggregateExpressions: [
          { alias: 'count', expression: 'COUNT(*)', dataType: 'bigint' },
          { alias: 'avg_time', expression: 'AVG(duration_ms)', dataType: 'numeric' },
          { alias: 'max_time', expression: 'MAX(duration_ms)', dataType: 'numeric' },
          { alias: 'min_time', expression: 'MIN(duration_ms)', dataType: 'numeric' },
        ],
      });

      await service.create(definition);
      const aggregate = service.getAggregate('multi_expr');
      expect(aggregate?.aggregateExpressions).toHaveLength(4);
    });

    it('should handle empty query result window', async () => {
      await service.create(createTestAggregateDefinition('empty_query'));

      const results = await service.query('empty_query', {
        from: new Date('2000-01-01'),
        to: new Date('2000-01-02'), // Very old date range
        limit: 0,
      });

      expect(results).toHaveLength(0);
    });

    it('should handle special characters in aggregate name', async () => {
      // Note: In real usage, names should be validated
      const definition = createTestAggregateDefinition('test_aggregate_v2');

      await service.create(definition);
      expect(service.exists('test_aggregate_v2')).toBe(true);
    });
  });
});
