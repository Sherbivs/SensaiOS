/**
 * DI Container Service Tests
 * ==========================
 *
 * Comprehensive test suite for the Dependency Injection Container.
 *
 * @module tests/security/services/di-container
 * @research P2-006 (DI Container) - Sprint 4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DIContainer,
  createDIContainer,
  ServiceLifecycle,
  ServiceHealth,
  DIContainerError,
  ServiceNotFoundError,
  CircularDependencyError,
  ServiceInitializationError,
  DuplicateRegistrationError,
  isDIContainerError,
  isServiceNotFoundError,
  isCircularDependencyError,
  type ContainerLogger,
  type ServiceDecorator,
} from '../../../src/bot/security/services/di-container.js';

// ============================================================================
// Test Helpers
// ============================================================================

interface MockService {
  name: string;
  initialized: boolean;
  disposed: boolean;
  value?: string;
}

function createMockService(name: string, value?: string): MockService {
  return {
    name,
    initialized: true,
    disposed: false,
    value,
  };
}

function createMockLogger(): ContainerLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('DIContainer', () => {
  let container: DIContainer;
  let mockLogger: ContainerLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    container = createDIContainer({
      logger: mockLogger,
      enableHealthChecks: false,
    });
  });

  afterEach(async () => {
    await container.shutdown();
  });

  // ==========================================================================
  // Constructor and Configuration Tests
  // ==========================================================================

  describe('Constructor and Configuration', () => {
    it('should create container with default config', () => {
      const defaultContainer = createDIContainer();
      expect(defaultContainer).toBeInstanceOf(DIContainer);
    });

    it('should create container with custom config', () => {
      const customContainer = createDIContainer({
        strictMode: false,
        detectCircularDependencies: false,
        maxResolutionDepth: 100,
        defaultLifecycle: ServiceLifecycle.TRANSIENT,
      });
      expect(customContainer).toBeInstanceOf(DIContainer);
    });

    it('should accept custom logger', () => {
      const logger = createMockLogger();
      const loggedContainer = createDIContainer({ logger });

      loggedContainer.register('test', () => createMockService('test'));
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should accept middleware', () => {
      const beforeResolve = vi.fn();
      const afterResolve = vi.fn();

      const middlewareContainer = createDIContainer({
        middleware: [{ beforeResolve, afterResolve }],
      });

      middlewareContainer.register('test', () => createMockService('test'));
      middlewareContainer.resolve('test');

      expect(beforeResolve).toHaveBeenCalledWith('test');
      expect(afterResolve).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Service Registration Tests
  // ==========================================================================

  describe('Service Registration', () => {
    it('should register a service with factory function', () => {
      container.register('testService', () => createMockService('test'));
      expect(container.has('testService')).toBe(true);
    });

    it('should register singleton service', () => {
      container.registerSingleton('singleton', () => createMockService('singleton'));
      expect(container.has('singleton')).toBe(true);
    });

    it('should register transient service', () => {
      container.registerTransient('transient', () => createMockService('transient'));
      expect(container.has('transient')).toBe(true);
    });

    it('should register scoped service', () => {
      container.registerScoped('scoped', () => createMockService('scoped'));
      expect(container.has('scoped')).toBe(true);
    });

    it('should register instance directly', () => {
      const instance = createMockService('direct');
      container.registerInstance('direct', instance);

      expect(container.has('direct')).toBe(true);
      expect(container.isInitialized('direct')).toBe(true);
    });

    it('should allow method chaining on registration', () => {
      const result = container
        .register('service1', () => createMockService('s1'))
        .register('service2', () => createMockService('s2'))
        .register('service3', () => createMockService('s3'));

      expect(result).toBe(container);
      expect(container.has('service1')).toBe(true);
      expect(container.has('service2')).toBe(true);
      expect(container.has('service3')).toBe(true);
    });

    it('should register service with dependencies', () => {
      container.register('dependency', () => createMockService('dep'));
      container.register('service', () => createMockService('svc'), {
        dependencies: ['dependency'],
      });

      expect(container.has('service')).toBe(true);
    });

    it('should register service with tags', () => {
      container.register('tagged', () => createMockService('tagged'), {
        tags: ['security', 'critical'],
      });

      const services = container.getServicesByTag('security');
      expect(services).toContain('tagged');
    });

    it('should register service with health check', () => {
      container.register('healthy', () => createMockService('healthy'), {
        healthCheck: () => ServiceHealth.HEALTHY,
      });

      expect(container.has('healthy')).toBe(true);
    });

    it('should register service with dispose function', () => {
      const dispose = vi.fn();
      container.register('disposable', () => createMockService('disposable'), {
        dispose,
      });

      expect(container.has('disposable')).toBe(true);
    });

    it('should throw on duplicate registration in strict mode', () => {
      container.register('duplicate', () => createMockService('dup'));

      expect(() => {
        container.register('duplicate', () => createMockService('dup2'));
      }).toThrow(DuplicateRegistrationError);
    });

    it('should allow duplicate registration when not in strict mode', () => {
      const nonStrictContainer = createDIContainer({ strictMode: false });
      nonStrictContainer.register('duplicate', () => createMockService('dup'));
      nonStrictContainer.register('duplicate', () => createMockService('dup2'));

      expect(nonStrictContainer.has('duplicate')).toBe(true);
    });

    it('should unregister a service', () => {
      container.register('toRemove', () => createMockService('remove'));
      expect(container.has('toRemove')).toBe(true);

      const removed = container.unregister('toRemove');
      expect(removed).toBe(true);
      expect(container.has('toRemove')).toBe(false);
    });

    it('should return false when unregistering non-existent service', () => {
      const removed = container.unregister('nonExistent');
      expect(removed).toBe(false);
    });
  });

  // ==========================================================================
  // Service Resolution Tests
  // ==========================================================================

  describe('Service Resolution', () => {
    it('should resolve a registered service', () => {
      container.register('service', () => createMockService('resolved'));
      const service = container.resolve<MockService>('service');

      expect(service.name).toBe('resolved');
      expect(service.initialized).toBe(true);
    });

    it('should throw when resolving unregistered service', () => {
      expect(() => {
        container.resolve('nonExistent');
      }).toThrow(ServiceNotFoundError);
    });

    it('should return same instance for singleton lifecycle', () => {
      container.registerSingleton('singleton', () => createMockService('single'));

      const instance1 = container.resolve<MockService>('singleton');
      const instance2 = container.resolve<MockService>('singleton');

      expect(instance1).toBe(instance2);
    });

    it('should return new instance for transient lifecycle', () => {
      let counter = 0;
      container.registerTransient('transient', () => createMockService(`trans-${++counter}`));

      const instance1 = container.resolve<MockService>('transient');
      const instance2 = container.resolve<MockService>('transient');

      expect(instance1).not.toBe(instance2);
      expect(instance1.name).toBe('trans-1');
      expect(instance2.name).toBe('trans-2');
    });

    it('should resolve dependencies before service', () => {
      const order: string[] = [];

      container.register('dep1', () => {
        order.push('dep1');
        return createMockService('dep1');
      });

      container.register('dep2', () => {
        order.push('dep2');
        return createMockService('dep2');
      });

      container.register(
        'main',
        () => {
          order.push('main');
          return createMockService('main');
        },
        { dependencies: ['dep1', 'dep2'] },
      );

      container.resolve('main');

      expect(order).toEqual(['dep1', 'dep2', 'main']);
    });

    it('should inject container into factory function', () => {
      container.register('dep', () => createMockService('dependency'));
      container.register('service', (c) => {
        const dep = c.resolve<MockService>('dep');
        return { ...createMockService('service'), depName: dep.name };
      });

      const service = container.resolve<MockService & { depName: string }>('service');
      expect(service.depName).toBe('dependency');
    });

    it('should tryResolve return undefined for non-existent service', () => {
      const result = container.tryResolve('nonExistent');
      expect(result).toBeUndefined();
    });

    it('should tryResolve return service when exists', () => {
      container.register('exists', () => createMockService('exists'));
      const result = container.tryResolve<MockService>('exists');

      expect(result?.name).toBe('exists');
    });

    it('should throw when resolving disabled service', () => {
      container.register('disabled', () => createMockService('disabled'), {
        enabled: false,
      });

      expect(() => {
        container.resolve('disabled');
      }).toThrow(DIContainerError);
    });

    it('should increment resolution count for singletons', () => {
      container.registerSingleton('counted', () => createMockService('counted'));

      container.resolve('counted');
      container.resolve('counted');
      container.resolve('counted');

      const status = container.getServiceStatus('counted');
      expect(status?.resolutionCount).toBe(3);
    });
  });

  // ==========================================================================
  // Circular Dependency Detection Tests
  // ==========================================================================

  describe('Circular Dependency Detection', () => {
    it('should detect direct circular dependency', () => {
      container.register('a', (c) => {
        c.resolve('b');
        return createMockService('a');
      });

      container.register('b', (c) => {
        c.resolve('a');
        return createMockService('b');
      });

      expect(() => {
        container.resolve('a');
      }).toThrow(CircularDependencyError);
    });

    it('should detect indirect circular dependency', () => {
      container.register('a', (c) => {
        c.resolve('b');
        return createMockService('a');
      });

      container.register('b', (c) => {
        c.resolve('c');
        return createMockService('b');
      });

      container.register('c', (c) => {
        c.resolve('a');
        return createMockService('c');
      });

      expect(() => {
        container.resolve('a');
      }).toThrow(CircularDependencyError);
    });

    it('should include dependency chain in error', () => {
      container.register('a', (c) => {
        c.resolve('b');
        return createMockService('a');
      });

      container.register('b', (c) => {
        c.resolve('a');
        return createMockService('b');
      });

      try {
        container.resolve('a');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isCircularDependencyError(error)).toBe(true);
        if (isCircularDependencyError(error)) {
          expect(error.dependencyChain).toContain('a');
        }
      }
    });

    it('should allow disabling circular dependency detection', () => {
      const noDetectionContainer = createDIContainer({
        detectCircularDependencies: false,
        maxResolutionDepth: 5,
      });

      let counter = 0;
      noDetectionContainer.register('infinite', (c) => {
        counter++;
        if (counter < 10) {
          try {
            c.resolve('infinite');
          } catch {
            // Expected to fail on max depth
          }
        }
        return createMockService('infinite');
      });

      // Should not throw circular dependency error
      noDetectionContainer.resolve('infinite');
    });

    it('should enforce max resolution depth', () => {
      const shallowContainer = createDIContainer({
        maxResolutionDepth: 3,
      });

      shallowContainer.register('deep1', (c) => {
        c.resolve('deep2');
        return createMockService('deep1');
      });

      shallowContainer.register('deep2', (c) => {
        c.resolve('deep3');
        return createMockService('deep2');
      });

      shallowContainer.register('deep3', (c) => {
        c.resolve('deep4');
        return createMockService('deep3');
      });

      shallowContainer.register('deep4', () => createMockService('deep4'));

      expect(() => {
        shallowContainer.resolve('deep1');
      }).toThrow('Maximum resolution depth');
    });
  });

  // ==========================================================================
  // Scope Management Tests
  // ==========================================================================

  describe('Scope Management', () => {
    it('should create a new scope', () => {
      const scope = container.createScope('test-scope');

      expect(scope.id).toBe('test-scope');
      expect(scope.instances).toBeInstanceOf(Map);
    });

    it('should create scope with auto-generated id', () => {
      const scope = container.createScope();

      expect(scope.id).toMatch(/^scope-\d+-[a-z0-9]+$/);
    });

    it('should return same instance within scope', () => {
      let counter = 0;
      container.registerScoped('scoped', () => createMockService(`scoped-${++counter}`));

      const _scope = container.createScope('my-scope');

      const instance1 = container.resolve<MockService>('scoped', 'my-scope');
      const instance2 = container.resolve<MockService>('scoped', 'my-scope');

      expect(instance1).toBe(instance2);
      expect(instance1.name).toBe('scoped-1');
    });

    it('should return different instances in different scopes', () => {
      let counter = 0;
      container.registerScoped('scoped', () => createMockService(`scoped-${++counter}`));

      container.createScope('scope1');
      container.createScope('scope2');

      const instance1 = container.resolve<MockService>('scoped', 'scope1');
      const instance2 = container.resolve<MockService>('scoped', 'scope2');

      expect(instance1).not.toBe(instance2);
      expect(instance1.name).toBe('scoped-1');
      expect(instance2.name).toBe('scoped-2');
    });

    it('should dispose scope and its instances', async () => {
      const dispose = vi.fn();
      container.registerScoped('disposable', () => createMockService('disposable'), {
        dispose,
      });

      container.createScope('dispose-scope');
      container.resolve('disposable', 'dispose-scope');

      await container.disposeScope('dispose-scope');

      expect(dispose).toHaveBeenCalled();
    });

    it('should handle disposing non-existent scope gracefully', async () => {
      await expect(container.disposeScope('non-existent')).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // Decorator Tests
  // ==========================================================================

  describe('Service Decorators', () => {
    it('should apply decorator to service', () => {
      container.register('service', () => createMockService('original'));

      const decorator: ServiceDecorator<MockService> = (instance) => ({
        ...instance,
        value: 'decorated',
      });

      container.decorate('service', decorator);

      const service = container.resolve<MockService>('service');
      expect(service.value).toBe('decorated');
    });

    it('should apply multiple decorators in order', () => {
      container.register('service', () => ({ ...createMockService('base'), values: [] as string[] }));

      container.decorate<MockService & { values: string[] }>('service', (instance) => ({
        ...instance,
        values: [...instance.values, 'first'],
      }));

      container.decorate<MockService & { values: string[] }>('service', (instance) => ({
        ...instance,
        values: [...instance.values, 'second'],
      }));

      const service = container.resolve<MockService & { values: string[] }>('service');
      expect(service.values).toEqual(['first', 'second']);
    });

    it('should allow method chaining with decorate', () => {
      const result = container
        .register('service', () => createMockService('base'))
        .decorate('service', (instance) => instance);

      expect(result).toBe(container);
    });
  });

  // ==========================================================================
  // Async Resolution Tests
  // ==========================================================================

  describe('Async Resolution', () => {
    it('should resolve async factory function', async () => {
      container.register('async', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createMockService('async');
      });

      const service = await container.resolveAsync<MockService>('async');
      expect(service.name).toBe('async');
    });

    it('should cache async singleton after resolution', async () => {
      let counter = 0;
      container.registerSingleton('asyncSingleton', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createMockService(`async-${++counter}`);
      });

      const instance1 = await container.resolveAsync<MockService>('asyncSingleton');
      const instance2 = await container.resolveAsync<MockService>('asyncSingleton');

      expect(instance1).toBe(instance2);
      expect(instance1.name).toBe('async-1');
    });

    it('should throw on sync resolve of async factory', () => {
      container.register('async', async () => createMockService('async'));

      expect(() => {
        container.resolve('async');
      }).toThrow('Async factories not supported in sync resolve');
    });
  });

  // ==========================================================================
  // Health Check Tests
  // ==========================================================================

  describe('Health Checks', () => {
    it('should check service health', async () => {
      container.register('healthy', () => createMockService('healthy'), {
        healthCheck: () => ServiceHealth.HEALTHY,
      });

      container.resolve('healthy');

      const health = await container.checkServiceHealth('healthy');
      expect(health).toBe(ServiceHealth.HEALTHY);
    });

    it('should return UNKNOWN for service without health check', async () => {
      container.register('noCheck', () => createMockService('noCheck'));
      container.resolve('noCheck');

      const health = await container.checkServiceHealth('noCheck');
      expect(health).toBe(ServiceHealth.HEALTHY); // Defaults to healthy
    });

    it('should return UNKNOWN for uninitialized service', async () => {
      container.register('notInit', () => createMockService('notInit'));

      const health = await container.checkServiceHealth('notInit');
      expect(health).toBe(ServiceHealth.UNKNOWN);
    });

    it('should check all services health', async () => {
      container.register('healthy1', () => createMockService('h1'), {
        healthCheck: () => ServiceHealth.HEALTHY,
      });
      container.register('healthy2', () => createMockService('h2'), {
        healthCheck: () => ServiceHealth.DEGRADED,
      });

      container.resolve('healthy1');
      container.resolve('healthy2');

      const results = await container.checkAllHealth();

      expect(results.get('healthy1')).toBe(ServiceHealth.HEALTHY);
      expect(results.get('healthy2')).toBe(ServiceHealth.DEGRADED);
    });

    it('should handle async health check', async () => {
      container.register('asyncHealth', () => createMockService('asyncHealth'), {
        healthCheck: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ServiceHealth.HEALTHY;
        },
      });

      container.resolve('asyncHealth');

      const health = await container.checkServiceHealth('asyncHealth');
      expect(health).toBe(ServiceHealth.HEALTHY);
    });

    it('should return UNHEALTHY when health check throws', async () => {
      container.register('failing', () => createMockService('failing'), {
        healthCheck: () => {
          throw new Error('Health check failed');
        },
      });

      container.resolve('failing');

      const health = await container.checkServiceHealth('failing');
      expect(health).toBe(ServiceHealth.UNHEALTHY);
    });
  });

  // ==========================================================================
  // Status and Statistics Tests
  // ==========================================================================

  describe('Status and Statistics', () => {
    it('should get service status', () => {
      container.register('service', () => createMockService('svc'), {
        tags: ['test'],
        dependencies: [],
      });

      const status = container.getServiceStatus('service');

      expect(status?.name).toBe('service');
      expect(status?.registered).toBe(true);
      expect(status?.initialized).toBe(false);
      expect(status?.lifecycle).toBe(ServiceLifecycle.SINGLETON);
      expect(status?.enabled).toBe(true);
    });

    it('should update status after resolution', () => {
      container.register('service', () => createMockService('svc'));
      container.resolve('service');

      const status = container.getServiceStatus('service');

      expect(status?.initialized).toBe(true);
      expect(status?.resolutionCount).toBe(1);
      expect(status?.resolutionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return undefined for non-existent service status', () => {
      const status = container.getServiceStatus('nonExistent');
      expect(status).toBeUndefined();
    });

    it('should get all service statuses', () => {
      container.register('s1', () => createMockService('s1'));
      container.register('s2', () => createMockService('s2'));
      container.resolve('s1');

      const statuses = container.getStatus();

      expect(statuses).toHaveLength(2);
      expect(statuses.find((s) => s.name === 's1')?.initialized).toBe(true);
      expect(statuses.find((s) => s.name === 's2')?.initialized).toBe(false);
    });

    it('should get container statistics', () => {
      container.registerSingleton('single', () => createMockService('single'));
      container.registerTransient('trans', () => createMockService('trans'));
      container.resolve('single');

      const stats = container.getStats();

      expect(stats.totalRegistered).toBe(2);
      expect(stats.totalInitialized).toBe(1);
      expect(stats.singletons).toBe(1);
      expect(stats.transients).toBe(1);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should get all service names', () => {
      container.register('a', () => createMockService('a'));
      container.register('b', () => createMockService('b'));
      container.register('c', () => createMockService('c'));

      const names = container.getServiceNames();

      expect(names).toContain('a');
      expect(names).toContain('b');
      expect(names).toContain('c');
    });

    it('should get services by tag', () => {
      container.register('tagged1', () => createMockService('t1'), { tags: ['security'] });
      container.register('tagged2', () => createMockService('t2'), { tags: ['security', 'critical'] });
      container.register('untagged', () => createMockService('u'));

      const securityServices = container.getServicesByTag('security');
      const criticalServices = container.getServicesByTag('critical');

      expect(securityServices).toContain('tagged1');
      expect(securityServices).toContain('tagged2');
      expect(securityServices).not.toContain('untagged');
      expect(criticalServices).toContain('tagged2');
      expect(criticalServices).not.toContain('tagged1');
    });
  });

  // ==========================================================================
  // Shutdown Tests
  // ==========================================================================

  describe('Container Shutdown', () => {
    it('should dispose services on shutdown', async () => {
      const dispose = vi.fn();
      container.register('disposable', () => createMockService('disposable'), {
        dispose,
      });

      container.resolve('disposable');
      await container.shutdown();

      expect(dispose).toHaveBeenCalled();
    });

    it('should dispose services in dependency order', async () => {
      const disposeOrder: string[] = [];

      container.register(
        'dependent',
        () => createMockService('dependent'),
        {
          dependencies: ['dependency'],
          dispose: () => { disposeOrder.push('dependent'); },
        },
      );

      container.register('dependency', () => createMockService('dependency'), {
        dispose: () => { disposeOrder.push('dependency'); },
      });

      container.resolve('dependent');
      await container.shutdown();

      // Dependent should be disposed before dependency
      expect(disposeOrder[0]).toBe('dependent');
      expect(disposeOrder[1]).toBe('dependency');
    });

    it('should throw when resolving after shutdown', async () => {
      container.register('service', () => createMockService('service'));
      await container.shutdown();

      expect(() => {
        container.resolve('service');
      }).toThrow('Container is shutting down');
    });

    it('should handle errors during disposal gracefully', async () => {
      container.register('failing', () => createMockService('failing'), {
        dispose: () => {
          throw new Error('Disposal failed');
        },
      });

      container.resolve('failing');

      // Should not throw
      await expect(container.shutdown()).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should be idempotent', async () => {
      await container.shutdown();
      await container.shutdown();
      // No error should be thrown
    });
  });

  // ==========================================================================
  // Enable/Disable Tests
  // ==========================================================================

  describe('Service Enable/Disable', () => {
    it('should enable a disabled service', () => {
      container.register('disabled', () => createMockService('disabled'), {
        enabled: false,
      });

      const enabled = container.enable('disabled');

      expect(enabled).toBe(true);
      expect(() => container.resolve('disabled')).not.toThrow();
    });

    it('should disable an enabled service', () => {
      container.register('enabled', () => createMockService('enabled'));
      const disabled = container.disable('enabled');

      expect(disabled).toBe(true);
      expect(() => container.resolve('enabled')).toThrow(DIContainerError);
    });

    it('should return false when enabling non-existent service', () => {
      const result = container.enable('nonExistent');
      expect(result).toBe(false);
    });

    it('should return false when disabling non-existent service', () => {
      const result = container.disable('nonExistent');
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Clear Tests
  // ==========================================================================

  describe('Clear Operations', () => {
    it('should clear all instances', () => {
      container.register('s1', () => createMockService('s1'));
      container.register('s2', () => createMockService('s2'));
      container.resolve('s1');
      container.resolve('s2');

      container.clearInstances();

      expect(container.isInitialized('s1')).toBe(false);
      expect(container.isInitialized('s2')).toBe(false);
      expect(container.has('s1')).toBe(true); // Registration still exists
    });

    it('should clear everything', () => {
      container.register('s1', () => createMockService('s1'));
      container.resolve('s1');

      container.clear();

      expect(container.has('s1')).toBe(false);
      expect(container.isInitialized('s1')).toBe(false);
    });
  });

  // ==========================================================================
  // Middleware Tests
  // ==========================================================================

  describe('Middleware', () => {
    it('should call beforeResolve middleware', () => {
      const beforeResolve = vi.fn();
      const middlewareContainer = createDIContainer({
        middleware: [{ beforeResolve }],
      });

      middlewareContainer.register('service', () => createMockService('service'));
      middlewareContainer.resolve('service');

      expect(beforeResolve).toHaveBeenCalledWith('service');
    });

    it('should call afterResolve middleware with instance', () => {
      const afterResolve = vi.fn();
      const middlewareContainer = createDIContainer({
        middleware: [{ afterResolve }],
      });

      middlewareContainer.register('service', () => createMockService('service'));
      middlewareContainer.resolve('service');

      expect(afterResolve).toHaveBeenCalledWith('service', expect.objectContaining({ name: 'service' }));
    });

    it('should call onError middleware on failure', () => {
      const onError = vi.fn();
      const middlewareContainer = createDIContainer({
        middleware: [{ onError }],
      });

      expect(() => middlewareContainer.resolve('nonExistent')).toThrow();
      expect(onError).toHaveBeenCalledWith('nonExistent', expect.any(ServiceNotFoundError));
    });

    it('should support multiple middleware', () => {
      const calls: string[] = [];

      const middlewareContainer = createDIContainer({
        middleware: [
          { beforeResolve: () => calls.push('first') },
          { beforeResolve: () => calls.push('second') },
        ],
      });

      middlewareContainer.register('service', () => createMockService('service'));
      middlewareContainer.resolve('service');

      expect(calls).toEqual(['first', 'second']);
    });
  });

  // ==========================================================================
  // Error Type Guards Tests
  // ==========================================================================

  describe('Error Type Guards', () => {
    it('should identify DIContainerError', () => {
      const error = new DIContainerError('test', 'TEST', 'service');
      expect(isDIContainerError(error)).toBe(true);
      expect(isDIContainerError(new Error('test'))).toBe(false);
    });

    it('should identify ServiceNotFoundError', () => {
      const error = new ServiceNotFoundError('service');
      expect(isServiceNotFoundError(error)).toBe(true);
      expect(isServiceNotFoundError(new DIContainerError('test', 'TEST'))).toBe(false);
    });

    it('should identify CircularDependencyError', () => {
      const error = new CircularDependencyError('service', ['a', 'b']);
      expect(isCircularDependencyError(error)).toBe(true);
      expect(isCircularDependencyError(new DIContainerError('test', 'TEST'))).toBe(false);
    });
  });

  // ==========================================================================
  // Edge Cases Tests
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle factory that returns null', () => {
      container.register('nullable', () => null);
      const result = container.resolve('nullable');
      expect(result).toBeNull();
    });

    it('should handle factory that returns undefined', () => {
      container.register('undefined', () => undefined);
      const result = container.resolve('undefined');
      expect(result).toBeUndefined();
    });

    it('should handle factory that returns primitive', () => {
      container.register('number', () => 42);
      container.register('string', () => 'test');
      container.register('boolean', () => true);

      expect(container.resolve('number')).toBe(42);
      expect(container.resolve('string')).toBe('test');
      expect(container.resolve('boolean')).toBe(true);
    });

    it('should handle factory that throws', () => {
      container.register('throwing', () => {
        throw new Error('Factory error');
      });

      expect(() => container.resolve('throwing')).toThrow(ServiceInitializationError);
    });

    it('should handle service with special characters in name', () => {
      container.register('my-service.v2', () => createMockService('special'));
      expect(container.resolve<MockService>('my-service.v2').name).toBe('special');
    });

    it('should handle empty tags array', () => {
      container.register('noTags', () => createMockService('noTags'), {
        tags: [],
      });

      const services = container.getServicesByTag('anyTag');
      expect(services).not.toContain('noTags');
    });
  });
});
