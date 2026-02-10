/**
 * Error Tracker Tests
 * 
 * Tests for error deduplication and trending detection.
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorTracker,
  getErrorTracker,
  initializeErrorTracker,
  trackError,
} from '../../src/sensaios/error-tracker.js';
import { toCanonicalError } from '../../src/sensaios/canonical-error.js';
import { type TenantScope } from '../../src/sensaios/tenant-scope.js';

describe('ErrorTracker', () => {
  const testScope: TenantScope = {
    tenant: 'test-guild',
    environment: 'development',
    service: 'test-service',
    component: 'test-component',
  };

  const makeCanonicalError = (
    message: string,
    scope: TenantScope = testScope,
    name?: string
  ) => {
    const err = new Error(message);
    if (name) err.name = name;
    return toCanonicalError(err, scope);
  };

  const makeCanonicalWithOptions = (
    message: string,
    options: Parameters<typeof toCanonicalError>[2]
  ) => {
    const err = new Error(message);
    return toCanonicalError(err, testScope, options);
  };

  describe('Basic Tracking', () => {
    it('should track new errors', () => {
      const tracker = new ErrorTracker();
      const error = toCanonicalError(new Error('Test error'), testScope);

      const pattern = tracker.track(error);

      expect(pattern.fingerprint).toBe(error.fingerprint);
      expect(pattern.occurrences).toBe(1);
      expect(pattern.isRecurring).toBe(false);
    });

    it('should increment occurrences for same fingerprint', () => {
      const tracker = new ErrorTracker();
      const error1 = makeCanonicalError('Same error');
      const error2 = makeCanonicalError('Same error');

      tracker.track(error1);
      const pattern = tracker.track(error2);

      expect(pattern.occurrences).toBe(2);
    });

    it('should mark recurring after threshold', () => {
      const tracker = new ErrorTracker({ recurringThreshold: 3 });
      const makeError = () => makeCanonicalError('Recurring');

      tracker.track(makeError());
      tracker.track(makeError());
      const pattern = tracker.track(makeError());

      expect(pattern.isRecurring).toBe(true);
    });

    it('should track affected tenants', () => {
      const tracker = new ErrorTracker();
      const scope1 = { ...testScope, tenant: 'tenant-1' };
      const scope2 = { ...testScope, tenant: 'tenant-2' };

      tracker.track(makeCanonicalError('Multi-tenant', scope1));
      const pattern = tracker.track(makeCanonicalError('Multi-tenant', scope2));

      expect(pattern.affectedTenants.size).toBe(2);
      expect(pattern.affectedTenants.has('tenant-1')).toBe(true);
      expect(pattern.affectedTenants.has('tenant-2')).toBe(true);
    });

    it('should track affected components', () => {
      const tracker = new ErrorTracker();
      const scope1 = { ...testScope, component: 'component-1' };
      const scope2 = { ...testScope, component: 'component-2' };

      tracker.track(makeCanonicalError('Multi-component', scope1));
      const pattern = tracker.track(makeCanonicalError('Multi-component', scope2));

      expect(pattern.affectedComponents.size).toBe(2);
    });

    it('should track max severity', () => {
      const tracker = new ErrorTracker();

      tracker.track(makeCanonicalWithOptions('Test', { severity: 'low' }));
      tracker.track(makeCanonicalWithOptions('Test', { severity: 'high' }));
      const pattern = tracker.track(makeCanonicalWithOptions('Test', { severity: 'medium' }));

      expect(pattern.maxSeverity).toBe('high');
    });
  });

  describe('Burst Detection', () => {
    it('should detect burst patterns', () => {
      const tracker = new ErrorTracker({
        burstWindowMs: 60000,
        burstThreshold: 3,
      });
      const makeError = () => makeCanonicalError('Burst error');

      tracker.track(makeError());
      tracker.track(makeError());
      const pattern = tracker.track(makeError());

      expect(pattern.isBurst).toBe(true);
    });

    it('should not mark as burst below threshold', () => {
      const tracker = new ErrorTracker({
        burstWindowMs: 60000,
        burstThreshold: 5,
      });
      const makeError = () => makeCanonicalError('Few errors');

      tracker.track(makeError());
      tracker.track(makeError());
      const pattern = tracker.track(makeError());

      expect(pattern.isBurst).toBe(false);
    });
  });

  describe('Pattern Retrieval', () => {
    it('should get pattern by fingerprint', () => {
      const tracker = new ErrorTracker();
      const error = toCanonicalError(new Error('Findable'), testScope);
      tracker.track(error);

      const pattern = tracker.getPattern(error.fingerprint);

      expect(pattern).toBeDefined();
      expect(pattern!.fingerprint).toBe(error.fingerprint);
    });

    it('should return undefined for unknown fingerprint', () => {
      const tracker = new ErrorTracker();

      expect(tracker.getPattern('unknown-fp')).toBeUndefined();
    });

    it('should get all patterns', () => {
      const tracker = new ErrorTracker();
      tracker.track(toCanonicalError(new Error('Error 1'), testScope));
      tracker.track(toCanonicalError(new Error('Error 2'), testScope));

      const patterns = tracker.getAllPatterns();

      expect(patterns.length).toBe(2);
    });

    it('should get recurring patterns', () => {
      const tracker = new ErrorTracker({ recurringThreshold: 2 });

      // Make one recurring
      tracker.track(makeCanonicalError('Recurring'));
      tracker.track(makeCanonicalError('Recurring'));

      // Make one not recurring
      tracker.track(makeCanonicalError('Single'));

      const recurring = tracker.getRecurringPatterns();

      expect(recurring.length).toBe(1);
      expect(recurring[0].message).toContain('Recurring');
    });

    it('should get top patterns by occurrence', () => {
      const tracker = new ErrorTracker();

      // Track different frequencies
      tracker.track(toCanonicalError(new Error('Rare'), testScope));

      for (let i = 0; i < 5; i++) {
        tracker.track(toCanonicalError(new Error('Common'), testScope));
      }

      for (let i = 0; i < 3; i++) {
        tracker.track(toCanonicalError(new Error('Medium'), testScope));
      }

      const top = tracker.getTopPatterns(2);

      expect(top.length).toBe(2);
      expect(top[0].message).toContain('Common');
      expect(top[0].occurrences).toBe(5);
    });

    it('should get patterns by category', () => {
      const tracker = new ErrorTracker();
      tracker.track(toCanonicalError(new Error('Database connection'), testScope));
      tracker.track(toCanonicalError(new Error('Validation failed'), testScope));

      const dbPatterns = tracker.getPatternsByCategory('database');

      expect(dbPatterns.length).toBe(1);
    });

    it('should get patterns by tenant', () => {
      const tracker = new ErrorTracker();
      const scope1 = { ...testScope, tenant: 'guild-1' };
      const scope2 = { ...testScope, tenant: 'guild-2' };

      tracker.track(toCanonicalError(new Error('Guild 1 error'), scope1));
      tracker.track(toCanonicalError(new Error('Guild 2 error'), scope2));

      const guild1Patterns = tracker.getPatternsByTenant('guild-1');

      expect(guild1Patterns.length).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should calculate statistics', () => {
      const tracker = new ErrorTracker({ recurringThreshold: 2 });
      const makeRecurring = () => makeCanonicalError('Recurring 1');

      // Create some patterns
      tracker.track(makeRecurring());
      tracker.track(makeRecurring());
      tracker.track(toCanonicalError(new Error('Single'), testScope));

      const stats = tracker.getStats();

      expect(stats.totalErrors).toBe(3);
      expect(stats.uniquePatterns).toBe(2);
      expect(stats.recurringPatterns).toBe(1);
    });

    it('should count by category', () => {
      const tracker = new ErrorTracker();
      tracker.track(toCanonicalError(new Error('Database error'), testScope));
      tracker.track(toCanonicalError(new Error('Validation error'), testScope));

      const stats = tracker.getStats();

      expect(stats.byCategory.database).toBe(1);
      expect(stats.byCategory.validation).toBe(1);
    });

    it('should return top patterns in stats', () => {
      const tracker = new ErrorTracker();
      for (let i = 0; i < 5; i++) {
        tracker.track(toCanonicalError(new Error('Top error'), testScope));
      }

      const stats = tracker.getStats();

      expect(stats.topPatterns.length).toBeGreaterThan(0);
      expect(stats.topPatterns[0].occurrences).toBe(5);
    });
  });

  describe('Capacity Management', () => {
    it('should evict oldest when at capacity', () => {
      const tracker = new ErrorTracker({ maxPatterns: 2 });

      tracker.track(toCanonicalError(new Error('First'), testScope));
      tracker.track(toCanonicalError(new Error('Second'), testScope));
      tracker.track(toCanonicalError(new Error('Third'), testScope));

      const patterns = tracker.getAllPatterns();

      expect(patterns.length).toBe(2);
      // First should be evicted
      expect(patterns.some((p) => p.message.includes('First'))).toBe(false);
    });

    it('should cleanup expired patterns', async () => {
      const tracker = new ErrorTracker({ patternTtlMs: 100 });
      tracker.track(toCanonicalError(new Error('Old'), testScope));

      // Wait for TTL
      await new Promise((resolve) => setTimeout(resolve, 150));

      const removed = tracker.cleanup();

      expect(removed).toBe(1);
      expect(tracker.getAllPatterns().length).toBe(0);
    });
  });

  describe('State Persistence', () => {
    it('should export state', () => {
      const tracker = new ErrorTracker();
      tracker.track(toCanonicalError(new Error('Test'), testScope));

      const state = tracker.getState();

      expect(state.totalErrors).toBe(1);
      expect(state.patterns.length).toBe(1);
      expect(state.patterns[0].affectedTenants).toBeInstanceOf(Array);
    });

    it('should restore state', () => {
      const tracker1 = new ErrorTracker();
      tracker1.track(toCanonicalError(new Error('Test'), testScope));
      const state = tracker1.getState();

      const tracker2 = new ErrorTracker();
      tracker2.restoreState(state);

      expect(tracker2.getAllPatterns().length).toBe(1);
      expect(tracker2.getStats().totalErrors).toBe(1);
    });
  });

  describe('Reset', () => {
    it('should clear all data on reset', () => {
      const tracker = new ErrorTracker();
      tracker.track(toCanonicalError(new Error('Test'), testScope));

      tracker.reset();

      expect(tracker.getAllPatterns().length).toBe(0);
      expect(tracker.getStats().totalErrors).toBe(0);
    });
  });

  describe('Global Tracker', () => {
    it('getErrorTracker should return singleton', () => {
      const tracker1 = getErrorTracker();
      const tracker2 = getErrorTracker();

      expect(tracker1).toBe(tracker2);
    });

    it('initializeErrorTracker should create new instance', () => {
      const tracker1 = getErrorTracker();
      const tracker2 = initializeErrorTracker({ maxPatterns: 100 });

      expect(tracker2).not.toBe(tracker1);
    });

    it('trackError should use global tracker', () => {
      const freshTracker = initializeErrorTracker();
      const error = toCanonicalError(new Error('Global'), testScope);

      const pattern = trackError(error);

      expect(pattern.fingerprint).toBe(error.fingerprint);
      expect(freshTracker.getAllPatterns().length).toBe(1);
    });
  });
});
