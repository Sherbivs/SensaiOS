/**
 * Dependency Injection Container Service
 * ======================================
 *
 * A lightweight, type-safe dependency injection container for managing
 * security service lifecycles, dependencies, and configuration.
 *
 * @module security/services/di-container
 * @research P2-006 (DI Container) - Sprint 4
 *
 * Features:
 * - Service registration with factory functions
 * - Singleton and transient lifecycle support
 * - Lazy initialization with circular dependency detection
 * - Service health monitoring and status reporting
 * - Graceful shutdown with dependency ordering
 * - Configuration injection and validation
 * - Service decoration and middleware support
 *
 * @example
 * ```typescript
 * const container = createDIContainer();
 *
 * // Register services
 * container.register('checksumService', () => createChecksumService({ hmacSecret: 'secret' }));
 * container.register('eventBus', () => createSecurityEventBus());
 *
 * // Resolve services (lazy initialization)
 * const checksumService = container.resolve<ChecksumService>('checksumService');
 *
 * // Graceful shutdown
 * await container.shutdown();
 * ```
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Service lifecycle type
 */
export enum ServiceLifecycle {
  /** Single instance shared across all resolutions */
  SINGLETON = 'singleton',
  /** New instance created on each resolution */
  TRANSIENT = 'transient',
  /** Single instance per scope (e.g., per request) */
  SCOPED = 'scoped',
}

/**
 * Service health status
 */
export enum ServiceHealth {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

/**
 * Service registration options
 */
export interface ServiceRegistration<T = unknown> {
  /** Unique service identifier */
  name: string;
  /** Factory function to create the service */
  factory: ServiceFactory<T>;
  /** Service lifecycle (default: SINGLETON) */
  lifecycle?: ServiceLifecycle;
  /** Services this service depends on */
  dependencies?: string[];
  /** Optional health check function */
  healthCheck?: () => Promise<ServiceHealth> | ServiceHealth;
  /** Optional cleanup function for shutdown */
  dispose?: (instance: T) => Promise<void> | void;
  /** Tags for grouping services */
  tags?: string[];
  /** Service description */
  description?: string;
  /** Whether service is enabled */
  enabled?: boolean;
}

/**
 * Factory function type for creating services
 */
export type ServiceFactory<T> = (container: DIContainer) => T | Promise<T>;

/**
 * Service instance wrapper with metadata
 */
export interface ServiceInstance<T = unknown> {
  /** Service identifier */
  name: string;
  /** The actual service instance */
  instance: T;
  /** When the service was created */
  createdAt: Date;
  /** Service lifecycle type */
  lifecycle: ServiceLifecycle;
  /** Current health status */
  health: ServiceHealth;
  /** Last health check timestamp */
  lastHealthCheck?: Date;
  /** Service resolution time in ms */
  resolutionTimeMs: number;
  /** Number of times resolved */
  resolutionCount: number;
}

/**
 * Service status for monitoring
 */
export interface ServiceStatus {
  name: string;
  registered: boolean;
  initialized: boolean;
  lifecycle: ServiceLifecycle;
  health: ServiceHealth;
  dependencies: string[];
  tags: string[];
  enabled: boolean;
  resolutionCount: number;
  resolutionTimeMs?: number;
  lastHealthCheck?: Date;
  error?: string;
}

/**
 * Container statistics
 */
export interface ContainerStats {
  totalRegistered: number;
  totalInitialized: number;
  healthySservices: number;
  unhealthyServices: number;
  singletons: number;
  transients: number;
  scoped: number;
  averageResolutionTimeMs: number;
  totalResolutions: number;
  uptime: number;
}

/**
 * Service decorator function
 */
export type ServiceDecorator<T> = (instance: T, name: string) => T;

/**
 * Container middleware for service resolution
 */
export interface ContainerMiddleware {
  /** Called before service resolution */
  beforeResolve?: (name: string) => void;
  /** Called after service resolution */
  afterResolve?: <T>(name: string, instance: T) => void;
  /** Called on resolution error */
  onError?: (name: string, error: Error) => void;
}

/**
 * Container configuration
 */
export interface DIContainerConfig {
  /** Enable strict mode (fail on missing dependencies) */
  strictMode?: boolean;
  /** Enable circular dependency detection */
  detectCircularDependencies?: boolean;
  /** Maximum resolution depth before assuming circular dependency */
  maxResolutionDepth?: number;
  /** Enable automatic health checks */
  enableHealthChecks?: boolean;
  /** Health check interval in ms */
  healthCheckIntervalMs?: number;
  /** Logger for container events */
  logger?: ContainerLogger;
  /** Global middleware */
  middleware?: ContainerMiddleware[];
  /** Default lifecycle for services */
  defaultLifecycle?: ServiceLifecycle;
}

/**
 * Logger interface for container
 */
export interface ContainerLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Scope for scoped services
 */
export interface ServiceScope {
  id: string;
  parent?: ServiceScope;
  instances: Map<string, unknown>;
  createdAt: Date;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<DIContainerConfig> = {
  strictMode: true,
  detectCircularDependencies: true,
  maxResolutionDepth: 50,
  enableHealthChecks: true,
  healthCheckIntervalMs: 60000, // 1 minute
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
  middleware: [],
  defaultLifecycle: ServiceLifecycle.SINGLETON,
};

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base DI container error
 */
export class DIContainerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly serviceName?: string,
  ) {
    super(message);
    this.name = 'DIContainerError';
  }
}

/**
 * Service not found error
 */
export class ServiceNotFoundError extends DIContainerError {
  constructor(serviceName: string) {
    super(`Service '${serviceName}' not found in container`, 'SERVICE_NOT_FOUND', serviceName);
    this.name = 'ServiceNotFoundError';
  }
}

/**
 * Circular dependency error
 */
export class CircularDependencyError extends DIContainerError {
  constructor(
    serviceName: string,
    public readonly dependencyChain: string[],
  ) {
    super(
      `Circular dependency detected: ${dependencyChain.join(' -> ')} -> ${serviceName}`,
      'CIRCULAR_DEPENDENCY',
      serviceName,
    );
    this.name = 'CircularDependencyError';
  }
}

/**
 * Service initialization error
 */
export class ServiceInitializationError extends DIContainerError {
  constructor(
    serviceName: string,
    public readonly cause: Error,
  ) {
    super(
      `Failed to initialize service '${serviceName}': ${cause.message}`,
      'INITIALIZATION_FAILED',
      serviceName,
    );
    this.name = 'ServiceInitializationError';
  }
}

/**
 * Duplicate registration error
 */
export class DuplicateRegistrationError extends DIContainerError {
  constructor(serviceName: string) {
    super(`Service '${serviceName}' is already registered`, 'DUPLICATE_REGISTRATION', serviceName);
    this.name = 'DuplicateRegistrationError';
  }
}

// ============================================================================
// DI Container Implementation
// ============================================================================

/**
 * Dependency Injection Container
 */
export class DIContainer {
  private readonly config: Required<DIContainerConfig>;
  private readonly registrations = new Map<string, ServiceRegistration>();
  private readonly instances = new Map<string, ServiceInstance>();
  private readonly resolutionStack: string[] = [];
  private readonly decorators = new Map<string, ServiceDecorator<unknown>[]>();
  private readonly scopes = new Map<string, ServiceScope>();
  private readonly startedAt = new Date();
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private isShuttingDown = false;

  constructor(config: DIContainerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enableHealthChecks && this.config.healthCheckIntervalMs > 0) {
      this.startHealthCheckTimer();
    }
  }

  // ==========================================================================
  // Registration Methods
  // ==========================================================================

  /**
   * Register a service with the container
   */
  register<T>(
    name: string,
    factory: ServiceFactory<T>,
    options: Partial<Omit<ServiceRegistration<T>, 'name' | 'factory'>> = {},
  ): this {
    if (this.registrations.has(name) && this.config.strictMode) {
      throw new DuplicateRegistrationError(name);
    }

    const registration: ServiceRegistration<T> = {
      name,
      factory,
      lifecycle: options.lifecycle ?? this.config.defaultLifecycle,
      dependencies: options.dependencies ?? [],
      healthCheck: options.healthCheck,
      dispose: options.dispose,
      tags: options.tags ?? [],
      description: options.description,
      enabled: options.enabled ?? true,
    };

    this.registrations.set(name, registration as ServiceRegistration);
    this.config.logger.debug(`Registered service: ${name}`, {
      lifecycle: registration.lifecycle,
      dependencies: registration.dependencies,
      tags: registration.tags,
    });

    return this;
  }

  /**
   * Register a singleton service
   */
  registerSingleton<T>(
    name: string,
    factory: ServiceFactory<T>,
    options: Partial<Omit<ServiceRegistration<T>, 'name' | 'factory' | 'lifecycle'>> = {},
  ): this {
    return this.register(name, factory, { ...options, lifecycle: ServiceLifecycle.SINGLETON });
  }

  /**
   * Register a transient service
   */
  registerTransient<T>(
    name: string,
    factory: ServiceFactory<T>,
    options: Partial<Omit<ServiceRegistration<T>, 'name' | 'factory' | 'lifecycle'>> = {},
  ): this {
    return this.register(name, factory, { ...options, lifecycle: ServiceLifecycle.TRANSIENT });
  }

  /**
   * Register a scoped service
   */
  registerScoped<T>(
    name: string,
    factory: ServiceFactory<T>,
    options: Partial<Omit<ServiceRegistration<T>, 'name' | 'factory' | 'lifecycle'>> = {},
  ): this {
    return this.register(name, factory, { ...options, lifecycle: ServiceLifecycle.SCOPED });
  }

  /**
   * Register an existing instance directly
   */
  registerInstance<T>(name: string, instance: T, options: { tags?: string[]; description?: string } = {}): this {
    const registration: ServiceRegistration<T> = {
      name,
      factory: () => instance,
      lifecycle: ServiceLifecycle.SINGLETON,
      dependencies: [],
      tags: options.tags ?? [],
      description: options.description,
      enabled: true,
    };

    this.registrations.set(name, registration as ServiceRegistration);

    // Immediately create the service instance
    const serviceInstance: ServiceInstance<T> = {
      name,
      instance,
      createdAt: new Date(),
      lifecycle: ServiceLifecycle.SINGLETON,
      health: ServiceHealth.UNKNOWN,
      resolutionTimeMs: 0,
      resolutionCount: 1,
    };

    this.instances.set(name, serviceInstance as ServiceInstance);
    this.config.logger.debug(`Registered instance: ${name}`);

    return this;
  }

  /**
   * Unregister a service
   */
  unregister(name: string): boolean {
    const existed = this.registrations.delete(name);
    this.instances.delete(name);
    this.decorators.delete(name);
    return existed;
  }

  // ==========================================================================
  // Resolution Methods
  // ==========================================================================

  /**
   * Resolve a service by name
   */
  resolve<T>(name: string, scopeId?: string): T {
    if (this.isShuttingDown) {
      throw new DIContainerError('Container is shutting down', 'SHUTTING_DOWN', name);
    }

    // Run beforeResolve middleware
    for (const middleware of this.config.middleware) {
      middleware.beforeResolve?.(name);
    }

    try {
      const instance = this.resolveInternal<T>(name, scopeId);

      // Run afterResolve middleware
      for (const middleware of this.config.middleware) {
        middleware.afterResolve?.(name, instance);
      }

      return instance;
    } catch (error) {
      // Run onError middleware
      for (const middleware of this.config.middleware) {
        middleware.onError?.(name, error as Error);
      }
      throw error;
    }
  }

  /**
   * Internal resolution with circular dependency detection
   */
  private resolveInternal<T>(name: string, scopeId?: string): T {
    const registration = this.registrations.get(name);

    if (!registration) {
      throw new ServiceNotFoundError(name);
    }

    if (!registration.enabled) {
      throw new DIContainerError(`Service '${name}' is disabled`, 'SERVICE_DISABLED', name);
    }

    // Check for circular dependencies
    if (this.config.detectCircularDependencies) {
      if (this.resolutionStack.includes(name)) {
        throw new CircularDependencyError(name, [...this.resolutionStack]);
      }

      if (this.resolutionStack.length >= this.config.maxResolutionDepth) {
        throw new DIContainerError(
          `Maximum resolution depth (${this.config.maxResolutionDepth}) exceeded`,
          'MAX_DEPTH_EXCEEDED',
          name,
        );
      }
    }

    // Handle different lifecycles
    switch (registration.lifecycle) {
      case ServiceLifecycle.SINGLETON:
        return this.resolveSingleton<T>(name, registration as ServiceRegistration<T>);

      case ServiceLifecycle.TRANSIENT:
        return this.resolveTransient<T>(name, registration as ServiceRegistration<T>);

      case ServiceLifecycle.SCOPED:
        return this.resolveScoped<T>(name, registration as ServiceRegistration<T>, scopeId);

      default:
        return this.resolveSingleton<T>(name, registration as ServiceRegistration<T>);
    }
  }

  /**
   * Resolve singleton service
   */
  private resolveSingleton<T>(name: string, registration: ServiceRegistration<T>): T {
    const existing = this.instances.get(name);
    if (existing) {
      existing.resolutionCount++;
      return existing.instance as T;
    }

    return this.createInstance<T>(name, registration);
  }

  /**
   * Resolve transient service (new instance each time)
   */
  private resolveTransient<T>(name: string, registration: ServiceRegistration<T>): T {
    return this.createInstance<T>(name, registration, false);
  }

  /**
   * Resolve scoped service
   */
  private resolveScoped<T>(name: string, registration: ServiceRegistration<T>, scopeId?: string): T {
    if (!scopeId) {
      // No scope, treat as singleton
      return this.resolveSingleton<T>(name, registration);
    }

    const scope = this.scopes.get(scopeId);
    if (!scope) {
      throw new DIContainerError(`Scope '${scopeId}' not found`, 'SCOPE_NOT_FOUND', name);
    }

    const existing = scope.instances.get(name);
    if (existing) {
      return existing as T;
    }

    const instance = this.createInstance<T>(name, registration, false);
    scope.instances.set(name, instance);
    return instance;
  }

  /**
   * Create a new service instance
   */
  private createInstance<T>(name: string, registration: ServiceRegistration<T>, cache = true): T {
    const startTime = Date.now();

    try {
      this.resolutionStack.push(name);

      // Resolve dependencies first
      for (const dep of registration.dependencies ?? []) {
        this.resolveInternal(dep);
      }

      // Create the instance
      const factoryResult = registration.factory(this);
      let instance: T;

      // Handle async factories (convert to sync for now)
      if (factoryResult instanceof Promise) {
        throw new DIContainerError(
          'Async factories not supported in sync resolve. Use resolveAsync() instead.',
          'ASYNC_FACTORY',
          name,
        );
      }

      instance = factoryResult;

      // Apply decorators
      const decorators = this.decorators.get(name) ?? [];
      for (const decorator of decorators) {
        instance = decorator(instance, name) as T;
      }

      const resolutionTimeMs = Date.now() - startTime;

      // Cache singleton instances
      if (cache && registration.lifecycle === ServiceLifecycle.SINGLETON) {
        const serviceInstance: ServiceInstance<T> = {
          name,
          instance,
          createdAt: new Date(),
          lifecycle: registration.lifecycle ?? ServiceLifecycle.SINGLETON,
          health: ServiceHealth.UNKNOWN,
          resolutionTimeMs,
          resolutionCount: 1,
        };
        this.instances.set(name, serviceInstance as ServiceInstance);
      }

      this.config.logger.debug(`Created instance: ${name}`, { resolutionTimeMs });
      return instance;
    } catch (error) {
      if (error instanceof DIContainerError) {
        throw error;
      }
      throw new ServiceInitializationError(name, error as Error);
    } finally {
      this.resolutionStack.pop();
    }
  }

  /**
   * Resolve a service asynchronously
   */
  async resolveAsync<T>(name: string, _scopeId?: string): Promise<T> {
    if (this.isShuttingDown) {
      throw new DIContainerError('Container is shutting down', 'SHUTTING_DOWN', name);
    }

    const registration = this.registrations.get(name);
    if (!registration) {
      throw new ServiceNotFoundError(name);
    }

    if (!registration.enabled) {
      throw new DIContainerError(`Service '${name}' is disabled`, 'SERVICE_DISABLED', name);
    }

    // Check cache for singletons
    if (registration.lifecycle === ServiceLifecycle.SINGLETON) {
      const existing = this.instances.get(name);
      if (existing) {
        existing.resolutionCount++;
        return existing.instance as T;
      }
    }

    const startTime = Date.now();

    try {
      this.resolutionStack.push(name);

      // Resolve dependencies first
      for (const dep of registration.dependencies ?? []) {
        await this.resolveAsync(dep);
      }

      // Create the instance
      let instance = await Promise.resolve(registration.factory(this));

      // Apply decorators
      const decorators = this.decorators.get(name) ?? [];
      for (const decorator of decorators) {
        instance = decorator(instance, name);
      }

      const resolutionTimeMs = Date.now() - startTime;

      // Cache singleton instances
      if (registration.lifecycle === ServiceLifecycle.SINGLETON) {
        const serviceInstance: ServiceInstance = {
          name,
          instance,
          createdAt: new Date(),
          lifecycle: registration.lifecycle,
          health: ServiceHealth.UNKNOWN,
          resolutionTimeMs,
          resolutionCount: 1,
        };
        this.instances.set(name, serviceInstance);
      }

      this.config.logger.debug(`Created async instance: ${name}`, { resolutionTimeMs });
      return instance as T;
    } catch (error) {
      if (error instanceof DIContainerError) {
        throw error;
      }
      throw new ServiceInitializationError(name, error as Error);
    } finally {
      this.resolutionStack.pop();
    }
  }

  /**
   * Try to resolve a service, returning undefined if not found
   */
  tryResolve<T>(name: string, scopeId?: string): T | undefined {
    try {
      return this.resolve<T>(name, scopeId);
    } catch {
      return undefined;
    }
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.registrations.has(name);
  }

  /**
   * Check if a service is initialized
   */
  isInitialized(name: string): boolean {
    return this.instances.has(name);
  }

  // ==========================================================================
  // Scope Management
  // ==========================================================================

  /**
   * Create a new scope
   */
  createScope(id?: string, parentId?: string): ServiceScope {
    const scopeId = id ?? `scope-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const parent = parentId ? this.scopes.get(parentId) : undefined;

    const scope: ServiceScope = {
      id: scopeId,
      parent,
      instances: new Map(),
      createdAt: new Date(),
    };

    this.scopes.set(scopeId, scope);
    this.config.logger.debug(`Created scope: ${scopeId}`);

    return scope;
  }

  /**
   * Dispose a scope and its instances
   */
  async disposeScope(scopeId: string): Promise<void> {
    const scope = this.scopes.get(scopeId);
    if (!scope) {
      return;
    }

    // Dispose all instances in the scope
    for (const [name, instance] of scope.instances) {
      const registration = this.registrations.get(name);
      if (registration?.dispose) {
        try {
          await Promise.resolve(registration.dispose(instance));
        } catch (error) {
          this.config.logger.error(`Error disposing scoped service '${name}'`, {
            error: (error as Error).message,
          });
        }
      }
    }

    scope.instances.clear();
    this.scopes.delete(scopeId);
    this.config.logger.debug(`Disposed scope: ${scopeId}`);
  }

  // ==========================================================================
  // Decorator Support
  // ==========================================================================

  /**
   * Add a decorator for a service
   */
  decorate<T>(name: string, decorator: ServiceDecorator<T>): this {
    const decorators = this.decorators.get(name) ?? [];
    decorators.push(decorator as ServiceDecorator<unknown>);
    this.decorators.set(name, decorators);
    return this;
  }

  // ==========================================================================
  // Health Check Methods
  // ==========================================================================

  /**
   * Start automatic health check timer
   */
  private startHealthCheckTimer(): void {
    this.healthCheckTimer = setInterval(() => {
      this.checkAllHealth().catch((error) => {
        this.config.logger.error('Health check failed', { error: (error as Error).message });
      });
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Stop health check timer
   */
  private stopHealthCheckTimer(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Check health of all services
   */
  async checkAllHealth(): Promise<Map<string, ServiceHealth>> {
    const results = new Map<string, ServiceHealth>();

    for (const [name, serviceInstance] of this.instances) {
      const health = await this.checkServiceHealth(name);
      results.set(name, health);
      serviceInstance.health = health;
      serviceInstance.lastHealthCheck = new Date();
    }

    return results;
  }

  /**
   * Check health of a specific service
   */
  async checkServiceHealth(name: string): Promise<ServiceHealth> {
    const registration = this.registrations.get(name);
    const serviceInstance = this.instances.get(name);

    if (!registration || !serviceInstance) {
      return ServiceHealth.UNKNOWN;
    }

    if (!registration.healthCheck) {
      return ServiceHealth.HEALTHY; // No health check means healthy
    }

    try {
      const health = await Promise.resolve(registration.healthCheck());
      return health;
    } catch (error) {
      this.config.logger.error(`Health check failed for '${name}'`, {
        error: (error as Error).message,
      });
      return ServiceHealth.UNHEALTHY;
    }
  }

  // ==========================================================================
  // Status and Statistics
  // ==========================================================================

  /**
   * Get status of all services
   */
  getStatus(): ServiceStatus[] {
    const statuses: ServiceStatus[] = [];

    for (const [name, registration] of this.registrations) {
      const instance = this.instances.get(name);

      statuses.push({
        name,
        registered: true,
        initialized: !!instance,
        lifecycle: registration.lifecycle ?? ServiceLifecycle.SINGLETON,
        health: instance?.health ?? ServiceHealth.UNKNOWN,
        dependencies: registration.dependencies ?? [],
        tags: registration.tags ?? [],
        enabled: registration.enabled ?? true,
        resolutionCount: instance?.resolutionCount ?? 0,
        resolutionTimeMs: instance?.resolutionTimeMs,
        lastHealthCheck: instance?.lastHealthCheck,
      });
    }

    return statuses;
  }

  /**
   * Get status of a specific service
   */
  getServiceStatus(name: string): ServiceStatus | undefined {
    const registration = this.registrations.get(name);
    if (!registration) {
      return undefined;
    }

    const instance = this.instances.get(name);

    return {
      name,
      registered: true,
      initialized: !!instance,
      lifecycle: registration.lifecycle ?? ServiceLifecycle.SINGLETON,
      health: instance?.health ?? ServiceHealth.UNKNOWN,
      dependencies: registration.dependencies ?? [],
      tags: registration.tags ?? [],
      enabled: registration.enabled ?? true,
      resolutionCount: instance?.resolutionCount ?? 0,
      resolutionTimeMs: instance?.resolutionTimeMs,
      lastHealthCheck: instance?.lastHealthCheck,
    };
  }

  /**
   * Get container statistics
   */
  getStats(): ContainerStats {
    let totalResolutions = 0;
    let totalResolutionTime = 0;
    let healthyCount = 0;
    let unhealthyCount = 0;
    let singletonCount = 0;
    let transientCount = 0;
    let scopedCount = 0;

    for (const [, registration] of this.registrations) {
      switch (registration.lifecycle) {
        case ServiceLifecycle.SINGLETON:
          singletonCount++;
          break;
        case ServiceLifecycle.TRANSIENT:
          transientCount++;
          break;
        case ServiceLifecycle.SCOPED:
          scopedCount++;
          break;
      }
    }

    for (const [, instance] of this.instances) {
      totalResolutions += instance.resolutionCount;
      totalResolutionTime += instance.resolutionTimeMs * instance.resolutionCount;

      if (instance.health === ServiceHealth.HEALTHY) {
        healthyCount++;
      } else if (instance.health === ServiceHealth.UNHEALTHY) {
        unhealthyCount++;
      }
    }

    return {
      totalRegistered: this.registrations.size,
      totalInitialized: this.instances.size,
      healthySservices: healthyCount,
      unhealthyServices: unhealthyCount,
      singletons: singletonCount,
      transients: transientCount,
      scoped: scopedCount,
      averageResolutionTimeMs: totalResolutions > 0 ? totalResolutionTime / totalResolutions : 0,
      totalResolutions,
      uptime: Date.now() - this.startedAt.getTime(),
    };
  }

  /**
   * Get all service names
   */
  getServiceNames(): string[] {
    return Array.from(this.registrations.keys());
  }

  /**
   * Get services by tag
   */
  getServicesByTag(tag: string): string[] {
    const services: string[] = [];
    for (const [name, registration] of this.registrations) {
      if (registration.tags?.includes(tag)) {
        services.push(name);
      }
    }
    return services;
  }

  // ==========================================================================
  // Shutdown Methods
  // ==========================================================================

  /**
   * Gracefully shutdown the container
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.config.logger.info('Container shutdown initiated');

    // Stop health checks
    this.stopHealthCheckTimer();

    // Dispose all scopes
    for (const scopeId of this.scopes.keys()) {
      await this.disposeScope(scopeId);
    }

    // Build dependency graph and shutdown in reverse order
    const shutdownOrder = this.buildShutdownOrder();

    for (const name of shutdownOrder) {
      await this.disposeService(name);
    }

    this.instances.clear();
    this.config.logger.info('Container shutdown complete');
  }

  /**
   * Build shutdown order based on dependencies (reverse of initialization)
   */
  private buildShutdownOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) {
        return;
      }
      visited.add(name);

      const registration = this.registrations.get(name);
      if (registration?.dependencies) {
        for (const dep of registration.dependencies) {
          visit(dep);
        }
      }

      order.push(name);
    };

    for (const name of this.instances.keys()) {
      visit(name);
    }

    // Reverse to shut down dependents before dependencies
    return order.reverse();
  }

  /**
   * Dispose a single service
   */
  private async disposeService(name: string): Promise<void> {
    const instance = this.instances.get(name);
    const registration = this.registrations.get(name);

    if (!instance || !registration?.dispose) {
      return;
    }

    try {
      await Promise.resolve(registration.dispose(instance.instance));
      this.config.logger.debug(`Disposed service: ${name}`);
    } catch (error) {
      this.config.logger.error(`Error disposing service '${name}'`, {
        error: (error as Error).message,
      });
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Enable a service
   */
  enable(name: string): boolean {
    const registration = this.registrations.get(name);
    if (registration) {
      registration.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a service
   */
  disable(name: string): boolean {
    const registration = this.registrations.get(name);
    if (registration) {
      registration.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Clear all service instances (useful for testing)
   */
  clearInstances(): void {
    this.instances.clear();
    this.config.logger.debug('Cleared all service instances');
  }

  /**
   * Clear everything (useful for testing)
   */
  clear(): void {
    this.instances.clear();
    this.registrations.clear();
    this.decorators.clear();
    this.scopes.clear();
    this.config.logger.debug('Cleared container');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new DI container
 */
export function createDIContainer(config: DIContainerConfig = {}): DIContainer {
  return new DIContainer(config);
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if error is a DI container error
 */
export function isDIContainerError(error: unknown): error is DIContainerError {
  return error instanceof DIContainerError;
}

/**
 * Check if error is a service not found error
 */
export function isServiceNotFoundError(error: unknown): error is ServiceNotFoundError {
  return error instanceof ServiceNotFoundError;
}

/**
 * Check if error is a circular dependency error
 */
export function isCircularDependencyError(error: unknown): error is CircularDependencyError {
  return error instanceof CircularDependencyError;
}
