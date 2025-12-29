/**
 * Error Routing Tests
 * 
 * Tests for severity-based error routing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ErrorRouter,
  getErrorRouter,
  initializeErrorRouter,
  routeError,
  shouldTrackError,
  shouldAlertError,
  getDestinations,
  DEFAULT_ERROR_ROUTES,
} from '../../src/sensaios/error-routing.js';
import { toCanonicalError } from '../../src/sensaios/canonical-error.js';
import { systemScope, type TenantScope } from '../../src/sensaios/tenant-scope.js';

describe('ErrorRouting', () => {
  const testScope: TenantScope = {
    tenant: 'test-guild',
    environment: 'development',
    service: 'test-service',
    component: 'test-component',
  };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEFAULT_ERROR_ROUTES', () => {
    it('should have routes for all severity levels', () => {
      expect(DEFAULT_ERROR_ROUTES.low).toBeDefined();
      expect(DEFAULT_ERROR_ROUTES.medium).toBeDefined();
      expect(DEFAULT_ERROR_ROUTES.high).toBeDefined();
      expect(DEFAULT_ERROR_ROUTES.critical).toBeDefined();
    });

    it('low severity should only log to console', () => {
      expect(DEFAULT_ERROR_ROUTES.low.destinations).toContain('console');
      expect(DEFAULT_ERROR_ROUTES.low.track).toBe(false);
      expect(DEFAULT_ERROR_ROUTES.low.alert).toBe(false);
    });

    it('medium severity should track but not alert', () => {
      expect(DEFAULT_ERROR_ROUTES.medium.track).toBe(true);
      expect(DEFAULT_ERROR_ROUTES.medium.alert).toBe(false);
    });

    it('high severity should alert', () => {
      expect(DEFAULT_ERROR_ROUTES.high.track).toBe(true);
      expect(DEFAULT_ERROR_ROUTES.high.alert).toBe(true);
      expect(DEFAULT_ERROR_ROUTES.high.page).toBe(false);
    });

    it('critical severity should page', () => {
      expect(DEFAULT_ERROR_ROUTES.critical.track).toBe(true);
      expect(DEFAULT_ERROR_ROUTES.critical.alert).toBe(true);
      expect(DEFAULT_ERROR_ROUTES.critical.page).toBe(true);
    });
  });

  describe('ErrorRouter', () => {
    it('should create with default config', () => {
      const router = new ErrorRouter();
      expect(router.isEnabled()).toBe(true);
    });

    it('should route low severity and track stats', async () => {
      const router = new ErrorRouter({ logToConsole: true });
      const error = toCanonicalError(new Error('Low error'), testScope, {
        severity: 'low',
      });

      await router.route(error);

      // Verify routing by checking stats
      const stats = router.getStats();
      expect(stats.routedCount).toBe(1);
      expect(stats.bySeverity.low).toBe(1);
    });

    it('should route high severity and track stats', async () => {
      const router = new ErrorRouter({ logToConsole: true });
      const error = toCanonicalError(new Error('High error'), testScope, {
        severity: 'high',
      });

      await router.route(error);

      // Verify routing by checking stats
      const stats = router.getStats();
      expect(stats.routedCount).toBe(1);
      expect(stats.bySeverity.high).toBe(1);
    });

    it('should track routing statistics', async () => {
      const router = new ErrorRouter();

      await router.route(
        toCanonicalError(new Error('Error 1'), testScope, { severity: 'low' })
      );
      await router.route(
        toCanonicalError(new Error('Error 2'), testScope, { severity: 'medium' })
      );
      await router.route(
        toCanonicalError(new Error('Error 3'), testScope, { severity: 'high' })
      );

      const stats = router.getStats();

      expect(stats.routedCount).toBe(3);
      expect(stats.bySeverity.low).toBe(1);
      expect(stats.bySeverity.medium).toBe(1);
      expect(stats.bySeverity.high).toBe(1);
    });

    it('should reset statistics', async () => {
      const router = new ErrorRouter();
      await router.route(
        toCanonicalError(new Error('Test'), testScope, { severity: 'low' })
      );

      router.resetStats();
      const stats = router.getStats();

      expect(stats.routedCount).toBe(0);
    });

    it('should not route when disabled', async () => {
      const router = new ErrorRouter({ enabled: false });
      await router.route(
        toCanonicalError(new Error('Test'), testScope, { severity: 'high' })
      );

      // Verify nothing was routed by checking stats remain at 0
      const stats = router.getStats();
      expect(stats.routedCount).toBe(0);
    });

    it('should register custom handlers', async () => {
      const router = new ErrorRouter();
      const customHandler = vi.fn().mockResolvedValue(undefined);

      router.registerHandler('database', {
        name: 'test-db-handler',
        handle: customHandler,
      });

      // Route an error that goes to database
      const error = toCanonicalError(new Error('DB error'), testScope, {
        severity: 'medium', // Medium goes to database
      });

      await router.route(error);

      expect(customHandler).toHaveBeenCalledWith(error);
    });

    it('should handle handler errors gracefully', async () => {
      const router = new ErrorRouter();
      const failingHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));

      router.registerHandler('database', {
        name: 'failing-handler',
        handle: failingHandler,
      });

      const error = toCanonicalError(new Error('Test'), testScope, {
        severity: 'medium',
      });

      // Should not throw, error is handled internally
      await expect(router.route(error)).resolves.not.toThrow();
      // Verify the failing handler was actually called
      expect(failingHandler).toHaveBeenCalled();
    });
  });

  describe('Convenience Functions', () => {
    it('shouldTrackError should return correct values', () => {
      expect(shouldTrackError('low')).toBe(false);
      expect(shouldTrackError('medium')).toBe(true);
      expect(shouldTrackError('high')).toBe(true);
      expect(shouldTrackError('critical')).toBe(true);
    });

    it('shouldAlertError should return correct values', () => {
      expect(shouldAlertError('low')).toBe(false);
      expect(shouldAlertError('medium')).toBe(false);
      expect(shouldAlertError('high')).toBe(true);
      expect(shouldAlertError('critical')).toBe(true);
    });

    it('getDestinations should return route destinations', () => {
      expect(getDestinations('low')).toContain('console');
      expect(getDestinations('critical')).toContain('loki');
      expect(getDestinations('critical')).toContain('discord');
    });
  });

  describe('Global Router', () => {
    it('getErrorRouter should return singleton', () => {
      const router1 = getErrorRouter();
      const router2 = getErrorRouter();

      expect(router1).toBe(router2);
    });

    it('initializeErrorRouter should create new instance', () => {
      const router1 = getErrorRouter();
      const router2 = initializeErrorRouter({ logToConsole: false });

      expect(router2).not.toBe(router1);
    });

    it('routeError should use global router', async () => {
      const router = initializeErrorRouter({ logToConsole: true });
      const error = toCanonicalError(new Error('Global test'), testScope, {
        severity: 'low',
      });

      await routeError(error);

      // Verify routing occurred by checking stats
      const stats = router.getStats();
      expect(stats.routedCount).toBe(1);
    });
  });
});
