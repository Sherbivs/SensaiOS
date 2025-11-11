/**
 * Service Registry Tests
 * 
 * Test coverage:
 * - Service registration (single, multiple, duplicate, after init)
 * - Dependency graph resolution (circular dependencies, missing dependencies)
 * - Initialization order (topological sort, startup order)
 * - Service retrieval (get, has, errors)
 * - Health monitoring (checks, degraded, recovery)
 * - Graceful shutdown (reverse order, cleanup)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServiceRegistry, type ServiceConfig } from '../src/shared/service-registry.js';

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    // Reset singleton before each test
    ServiceRegistry.resetInstance();
    registry = ServiceRegistry.getInstance();
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await registry.shutdownAll();
    } catch {
      // Ignore errors during cleanup
    }
    ServiceRegistry.resetInstance();
  });

  // ============================================================================
  // Service Registration Tests
  // ============================================================================

  describe('Service Registration', () => {
    it('should register a simple service', () => {
      const config: ServiceConfig = {
        name: 'test-service',
        factory: () => ({ value: 42 }),
      };

      registry.register(config);

      expect(registry.has('test-service')).toBe(true);
      expect(registry.getServiceNames()).toContain('test-service');
    });

    it('should register multiple services', () => {
      const configs: ServiceConfig[] = [
        { name: 'service-1', factory: () => ({ id: 1 }) },
        { name: 'service-2', factory: () => ({ id: 2 }) },
        { name: 'service-3', factory: () => ({ id: 3 }) },
      ];

      registry.registerAll(configs);

      expect(registry.getServiceNames()).toHaveLength(3);
      expect(registry.has('service-1')).toBe(true);
      expect(registry.has('service-2')).toBe(true);
      expect(registry.has('service-3')).toBe(true);
    });

    it('should reject duplicate service registration', () => {
      const config: ServiceConfig = {
        name: 'duplicate-service',
        factory: () => ({}),
      };

      registry.register(config);

      expect(() => registry.register(config)).toThrow(
        "Service 'duplicate-service' is already registered"
      );
    });

    it('should reject registration after initialization', async () => {
      const config1: ServiceConfig = {
        name: 'first-service',
        factory: () => ({}),
      };

      registry.register(config1);
      await registry.initializeAll();

      const config2: ServiceConfig = {
        name: 'second-service',
        factory: () => ({}),
      };

      expect(() => registry.register(config2)).toThrow(
        "Cannot register service 'second-service' after initialization"
      );
    });

    it('should reject self-dependency', () => {
      const config: ServiceConfig = {
        name: 'self-dep-service',
        factory: () => ({}),
        dependencies: ['self-dep-service'],
      };

      expect(() => registry.register(config)).toThrow(
        "Service 'self-dep-service' cannot depend on itself"
      );
    });
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe('Service Initialization', () => {
    it('should initialize a simple service', async () => {
      const factory = vi.fn(() => ({ value: 42 }));

      registry.register({
        name: 'test-service',
        factory,
      });

      await registry.initializeAll();

      expect(factory).toHaveBeenCalledTimes(1);
      expect(factory).toHaveBeenCalledWith({});

      const service = registry.get('test-service');
      expect(service).toEqual({ value: 42 });
    });

    it('should initialize async service', async () => {
      const factory = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { value: 'async' };
      });

      registry.register({
        name: 'async-service',
        factory,
      });

      await registry.initializeAll();

      expect(factory).toHaveBeenCalledTimes(1);

      const service = registry.get('async-service');
      expect(service).toEqual({ value: 'async' });
    });

    it('should initialize services with dependencies in correct order', async () => {
      const initOrder: string[] = [];

      registry.register({
        name: 'service-a',
        factory: () => {
          initOrder.push('a');
          return { id: 'a' };
        },
      });

      registry.register({
        name: 'service-b',
        factory: (deps) => {
          initOrder.push('b');
          return { id: 'b', depA: deps['service-a'] };
        },
        dependencies: ['service-a'],
      });

      registry.register({
        name: 'service-c',
        factory: (deps) => {
          initOrder.push('c');
          return { id: 'c', depB: deps['service-b'] };
        },
        dependencies: ['service-b'],
      });

      await registry.initializeAll();

      // Should initialize in order: a -> b -> c
      expect(initOrder).toEqual(['a', 'b', 'c']);

      const serviceC = registry.get('service-c');
      expect(serviceC.id).toBe('c');
      expect(serviceC.depB.id).toBe('b');
      expect(serviceC.depB.depA.id).toBe('a');
    });

    it('should respect startup order', async () => {
      const initOrder: string[] = [];

      registry.register({
        name: 'service-low-priority',
        factory: () => {
          initOrder.push('low');
          return {};
        },
        startupOrder: 200,
      });

      registry.register({
        name: 'service-high-priority',
        factory: () => {
          initOrder.push('high');
          return {};
        },
        startupOrder: 50,
      });

      registry.register({
        name: 'service-medium-priority',
        factory: () => {
          initOrder.push('medium');
          return {};
        },
        startupOrder: 100,
      });

      await registry.initializeAll();

      // Should initialize in startup order: high (50) -> medium (100) -> low (200)
      expect(initOrder).toEqual(['high', 'medium', 'low']);
    });

    it('should detect circular dependencies', async () => {
      registry.register({
        name: 'service-a',
        factory: () => ({}),
        dependencies: ['service-b'],
      });

      registry.register({
        name: 'service-b',
        factory: () => ({}),
        dependencies: ['service-c'],
      });

      registry.register({
        name: 'service-c',
        factory: () => ({}),
        dependencies: ['service-a'],
      });

      await expect(registry.initializeAll()).rejects.toThrow('Circular dependency detected');
    });

    it('should reject missing dependencies', async () => {
      registry.register({
        name: 'service-with-missing-dep',
        factory: () => ({}),
        dependencies: ['non-existent-service'],
      });

      await expect(registry.initializeAll()).rejects.toThrow(
        "Service 'service-with-missing-dep' depends on 'non-existent-service' which is not registered"
      );
    });

    it('should cleanup on initialization failure', async () => {
      const shutdownSpy = vi.fn();

      registry.register({
        name: 'good-service',
        factory: () => ({ value: 'good' }),
        shutdown: shutdownSpy,
      });

      registry.register({
        name: 'bad-service',
        factory: () => {
          throw new Error('Initialization failed');
        },
        dependencies: ['good-service'],
      });

      await expect(registry.initializeAll()).rejects.toThrow(
        "Failed to initialize service 'bad-service'"
      );

      // Should have attempted shutdown of initialized services
      expect(shutdownSpy).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Service Retrieval Tests
  // ============================================================================

  describe('Service Retrieval', () => {
    it('should retrieve initialized service', async () => {
      registry.register({
        name: 'test-service',
        factory: () => ({ value: 42 }),
      });

      await registry.initializeAll();

      const service = registry.get('test-service');
      expect(service).toEqual({ value: 42 });
    });

    it('should throw error when retrieving non-existent service', async () => {
      await registry.initializeAll();

      expect(() => registry.get('non-existent')).toThrow(
        "Service 'non-existent' not found in registry"
      );
    });

    it('should throw error when retrieving uninitialized service', () => {
      registry.register({
        name: 'uninitialized-service',
        factory: () => ({}),
      });

      expect(() => registry.get('uninitialized-service')).toThrow(
        "Service 'uninitialized-service' is not yet initialized"
      );
    });

    it('should check service existence', () => {
      registry.register({
        name: 'exists',
        factory: () => ({}),
      });

      expect(registry.has('exists')).toBe(true);
      expect(registry.has('does-not-exist')).toBe(false);
    });
  });

  // ============================================================================
  // Health Monitoring Tests
  // ============================================================================

  describe('Health Monitoring', () => {
    it('should run health checks', async () => {
      const healthCheck = vi.fn(() => true);

      registry.register({
        name: 'monitored-service',
        factory: () => ({ status: 'ok' }),
        healthCheck,
        healthCheckInterval: 100,
      });

      await registry.initializeAll();

      // Wait for first health check
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(healthCheck).toHaveBeenCalled();

      const health = registry.getHealth('monitored-service');
      expect(health).toBeTruthy();
      expect(health!.status).toBe('healthy');
      expect(health!.lastHealthCheckPassed).toBe(true);
    });

    it('should detect degraded service', async () => {
      let checkCount = 0;
      const healthCheck = vi.fn(() => {
        checkCount++;
        return checkCount <= 1; // First check passes (immediate), second fails (after interval)
      });

      registry.register({
        name: 'degrading-service',
        factory: () => ({ status: 'ok' }),
        healthCheck,
        healthCheckInterval: 50,
      });

      await registry.initializeAll();
      
      // First check runs immediately - should be healthy
      expect(registry.getHealth('degrading-service')!.status).toBe('healthy');

      // Wait for second check (fails after 50ms interval)
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(registry.getHealth('degrading-service')!.status).toBe('degraded');
    });

    it('should detect service recovery', async () => {
      let checkCount = 0;
      const healthCheck = vi.fn(() => {
        checkCount++;
        return checkCount === 1 || checkCount >= 3; // 1st passes, 2nd fails, 3rd+ pass
      });

      registry.register({
        name: 'recovering-service',
        factory: () => ({ status: 'ok' }),
        healthCheck,
        healthCheckInterval: 50,
      });

      await registry.initializeAll();
      
      // First check runs immediately - should be healthy
      expect(registry.getHealth('recovering-service')!.status).toBe('healthy');

      // Wait for second check (fails - degraded)
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(registry.getHealth('recovering-service')!.status).toBe('degraded');

      // Wait for third check (passes - recovered)
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(registry.getHealth('recovering-service')!.status).toBe('healthy');
    });

    it('should get health for all services', async () => {
      registry.registerAll([
        { name: 'service-1', factory: () => ({}) },
        { name: 'service-2', factory: () => ({}) },
        { name: 'service-3', factory: () => ({}) },
      ]);

      await registry.initializeAll();

      const allHealth = registry.getAllHealth();
      expect(Object.keys(allHealth)).toHaveLength(3);
      expect(allHealth['service-1']).toBeTruthy();
      expect(allHealth['service-2']).toBeTruthy();
      expect(allHealth['service-3']).toBeTruthy();
    });
  });

  // ============================================================================
  // Graceful Shutdown Tests
  // ============================================================================

  describe('Graceful Shutdown', () => {
    it('should shutdown services in reverse order', async () => {
      const shutdownOrder: string[] = [];

      registry.register({
        name: 'service-a',
        factory: () => ({}),
        shutdown: () => {
          shutdownOrder.push('a');
        },
      });

      registry.register({
        name: 'service-b',
        factory: () => ({}),
        shutdown: () => {
          shutdownOrder.push('b');
        },
        dependencies: ['service-a'],
      });

      registry.register({
        name: 'service-c',
        factory: () => ({}),
        shutdown: () => {
          shutdownOrder.push('c');
        },
        dependencies: ['service-b'],
      });

      await registry.initializeAll();
      await registry.shutdownAll();

      // Should shutdown in reverse order: c -> b -> a
      expect(shutdownOrder).toEqual(['c', 'b', 'a']);
    });

    it('should call shutdown handlers', async () => {
      const shutdownHandler = vi.fn();

      registry.register({
        name: 'test-service',
        factory: () => ({ value: 42 }),
        shutdown: shutdownHandler,
      });

      await registry.initializeAll();
      await registry.shutdownAll();

      expect(shutdownHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle async shutdown', async () => {
      const shutdownHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      registry.register({
        name: 'async-shutdown-service',
        factory: () => ({}),
        shutdown: shutdownHandler,
      });

      await registry.initializeAll();
      await registry.shutdownAll();

      expect(shutdownHandler).toHaveBeenCalledTimes(1);
    });

    it('should continue shutdown even if one fails', async () => {
      const shutdownOrder: string[] = [];

      registry.register({
        name: 'service-a',
        factory: () => ({}),
        shutdown: () => {
          shutdownOrder.push('a');
        },
      });

      registry.register({
        name: 'service-b',
        factory: () => ({}),
        shutdown: () => {
          shutdownOrder.push('b');
          throw new Error('Shutdown failed');
        },
      });

      registry.register({
        name: 'service-c',
        factory: () => ({}),
        shutdown: () => {
          shutdownOrder.push('c');
        },
      });

      await registry.initializeAll();
      await registry.shutdownAll();

      // Should have attempted shutdown of all services
      expect(shutdownOrder).toContain('a');
      expect(shutdownOrder).toContain('b');
      expect(shutdownOrder).toContain('c');
    });
  });

  // ============================================================================
  // Statistics Tests
  // ============================================================================

  describe('Statistics', () => {
    it('should track service statistics', async () => {
      registry.register({
        name: 'test-service',
        factory: () => ({ value: 42 }),
      });

      await registry.initializeAll();
      
      // Wait a tiny bit to ensure measurable uptime
      await new Promise((resolve) => setTimeout(resolve, 10));

      const stats = registry.getStats('test-service');
      expect(stats).toBeTruthy();
      expect(stats!.registeredAt).toBeInstanceOf(Date);
      expect(stats!.initializedAt).toBeInstanceOf(Date);
      expect(stats!.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track health check statistics', async () => {
      registry.register({
        name: 'monitored-service',
        factory: () => ({}),
        healthCheck: () => true,
        healthCheckInterval: 50,
      });

      await registry.initializeAll();

      // Wait for a few health checks (increased wait time for reliability)
      await new Promise((resolve) => setTimeout(resolve, 200));

      const stats = registry.getStats('monitored-service');
      expect(stats!.healthCheckCount).toBeGreaterThan(0);
    });

    it('should get registry status', async () => {
      registry.registerAll([
        { name: 'service-1', factory: () => ({}) },
        { name: 'service-2', factory: () => ({}) },
      ]);

      let status = registry.getStatus();
      expect(status.isInitialized).toBe(false);
      expect(status.serviceCount).toBe(2);

      await registry.initializeAll();

      status = registry.getStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.healthyCount).toBe(2);
    });
  });

  // ============================================================================
  // Singleton Tests
  // ============================================================================

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = ServiceRegistry.getInstance();
      const instance2 = ServiceRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should reset instance for testing', () => {
      const instance1 = ServiceRegistry.getInstance();
      instance1.register({
        name: 'test',
        factory: () => ({}),
      });

      expect(instance1.has('test')).toBe(true);

      ServiceRegistry.resetInstance();

      const instance2 = ServiceRegistry.getInstance();
      expect(instance2.has('test')).toBe(false);
    });
  });
});
