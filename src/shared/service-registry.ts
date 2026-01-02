/**
 * Service Registry - Centralized service discovery and lifecycle management
 * 
 * Purpose: Provide dependency injection, health monitoring, and graceful shutdown
 * for all application services. Replaces tight coupling via direct imports.
 * 
 * Features:
 * - Service registration with factory pattern
 * - Dependency graph resolution (enforce startup order)
 * - Health check monitoring
 * - Graceful shutdown coordination
 * - Service statistics (uptime, request count, error rate)
 * - KERNEL INTEGRATION: All state changes report UP to observation layer (2025-12-26)
 * 
 * @module shared/service-registry
 */

// APP LAYER FIRST — Isolated access to kernel through application layer
import { createServiceRegistryHook, type ServiceRegistryHook } from '../app/index.js';

// LOGGER SECOND — Must be early import to capture initialization errors
import { getLogger } from "../shared/logging/index.js";
const logger = getLogger();
import { getErrorMessage } from './utils/error-utils.js';

// ═══════════════════════════════════════════════════════════════════════════
// Kernel Integration — Reports UP to observation layer
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kernel hook for reporting service state changes to the observation layer
 * Initialized lazily to avoid circular dependency issues during boot
 */
let kernelHook: ServiceRegistryHook | null = null;

/**
 * Get or create the kernel hook (lazy initialization)
 * Safe to call during boot - returns null if kernel not ready
 */
function getKernelHook(): ServiceRegistryHook | null {
  if (kernelHook) return kernelHook;
  
  try {
    kernelHook = createServiceRegistryHook('service-registry');
    return kernelHook;
  } catch {
    // Kernel not ready yet (during early boot), will retry on next state change
    return null;
  }
}

/**
 * Report service state change to kernel (non-blocking)
 */
function reportStateToKernel(
  serviceName: string, 
  event: 'REGISTERED' | 'INITIALIZING' | 'HEALTHY' | 'DEGRADED' | 'ERROR' | 'SHUTDOWN',
  previousState?: string,
  metadata?: Record<string, unknown>
): void {
  const hook = getKernelHook();
  if (hook) {
    hook.service(serviceName, event, previousState, metadata);
  }
}

// ============================================================================
// Types & Interfaces
// ============================================================================

export type ServiceStatus = 'registered' | 'initializing' | 'healthy' | 'degraded' | 'error' | 'shutdown';

export interface ServiceConfig {
  /** Unique service name */
  name: string;
  /** Factory function that creates the service instance */
  factory: ServiceFactory;
  /** Optional startup order (lower numbers start first, default: 100) */
  startupOrder?: number;
  /** Optional dependencies (service names that must be initialized first) */
  dependencies?: string[];
  /** Optional health check function (returns true if healthy) */
  healthCheck?: HealthCheckFunction;
  /** Optional health check interval in milliseconds (default: 60000 = 1 minute) */
  healthCheckInterval?: number;
  /** Optional shutdown function (called during graceful shutdown) */
  shutdown?: ShutdownFunction;
}

export interface ServiceMetadata {
  name: string;
  status: ServiceStatus;
  instance: any;
  config: ServiceConfig;
  stats: ServiceStats;
  healthCheckTimer?: NodeJS.Timeout;
  lastHealthCheckAt?: Date;
  lastHealthCheckResult?: boolean;
  initializationStartedAt?: Date; // Track when initialization began
  initializationTimeoutMs?: number; // Max time allowed in 'initializing' state (default: 5 minutes)
}

export interface ServiceStats {
  registeredAt: Date;
  initializedAt?: Date;
  shutdownAt?: Date;
  uptimeMs: number;
  healthCheckCount: number;
  healthCheckFailures: number;
}

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  uptime: number;
  lastHealthCheck?: Date;
  lastHealthCheckPassed?: boolean;
  healthCheckFailures: number;
}

export interface DependencyGraph {
  [serviceName: string]: string[];
}

export type ServiceFactory = (dependencies: ServiceDependencies) => any | Promise<any>;
export type HealthCheckFunction = (instance: any) => boolean | Promise<boolean>;
export type ShutdownFunction = (instance: any) => void | Promise<void>;
export type ServiceDependencies = Record<string, any>;

// ============================================================================
// Service Registry Class
// ============================================================================

export class ServiceRegistry {
  private static instance: ServiceRegistry | null = null;
  private services: Map<string, ServiceMetadata> = new Map();
  private initializationOrder: string[] = [];
  private isInitialized = false;
  private isShuttingDown = false;

  private constructor() {
    // Private constructor for singleton pattern
    this.setupShutdownHandlers();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Reset singleton (for testing only)
   */
  static resetInstance(): void {
    if (ServiceRegistry.instance) {
      ServiceRegistry.instance.services.clear();
      ServiceRegistry.instance = null;
    }
  }

  // ============================================================================
  // Service Registration
  // ============================================================================

  /**
   * Register a service with the registry
   * 
   * @param config Service configuration
   * @throws Error if service already registered or has circular dependencies
   */
  register(config: ServiceConfig): void {
    if (this.isInitialized) {
      throw new Error(`Cannot register service '${config.name}' after initialization`);
    }

    if (this.services.has(config.name)) {
      throw new Error(`Service '${config.name}' is already registered`);
    }

    // Validate dependencies exist (if specified)
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        if (dep === config.name) {
          throw new Error(`Service '${config.name}' cannot depend on itself`);
        }
      }
    }

    const metadata: ServiceMetadata = {
      name: config.name,
      status: 'registered',
      instance: null,
      config: {
        ...config,
        startupOrder: config.startupOrder ?? 100,
        dependencies: config.dependencies ?? [],
        healthCheckInterval: config.healthCheckInterval ?? 60_000,
      },
      stats: {
        registeredAt: new Date(),
        uptimeMs: 0,
        healthCheckCount: 0,
        healthCheckFailures: 0,
      },
    };

    this.services.set(config.name, metadata);
    
    // Report registration to kernel
    reportStateToKernel(config.name, 'REGISTERED', undefined, {
      startupOrder: metadata.config.startupOrder,
      dependencies: metadata.config.dependencies,
    });
    
    logger.info('ServiceRegistry', 'register', `Registered service: ${config.name}`, {
      metadata: {
        startupOrder: metadata.config.startupOrder,
        dependencies: metadata.config.dependencies,
      },
    });
  }

  /**
   * Register multiple services at once
   */
  registerAll(configs: ServiceConfig[]): void {
    for (const config of configs) {
      this.register(config);
    }
  }

  // ============================================================================
  // Service Initialization
  // ============================================================================

  /**
   * Initialize all registered services in dependency order
   * 
   * @throws Error if circular dependencies detected or initialization fails
   */
  async initializeAll(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('ServiceRegistry', 'initializeAll', 'Already initialized, skipping');
      return;
    }

    logger.info('ServiceRegistry', 'initializeAll', 'Starting initialization', {
      metadata: { serviceCount: this.services.size },
    });

    try {
      // Build dependency graph and detect circular dependencies
      const graph = this.buildDependencyGraph();
      this.detectCircularDependencies(graph);

      // Resolve initialization order
      this.initializationOrder = this.resolveInitializationOrder();

      logger.info('ServiceRegistry', 'initializeAll', 'Initialization order resolved', {
        metadata: { order: this.initializationOrder },
      });

      // Initialize services in order
      for (const serviceName of this.initializationOrder) {
        await this.initializeService(serviceName);
      }

      this.isInitialized = true;
      logger.info('ServiceRegistry', 'initializeAll', 'All services initialized successfully', {
        metadata: {
          count: this.services.size,
          duration: this.calculateTotalInitTime(),
        },
      });

      // Start health checks for all services
      this.startAllHealthChecks();
    } catch (error) {
      logger.error('ServiceRegistry', 'initializeAll', 'Initialization failed', { metadata: { error } });
      // Attempt to shutdown any partially initialized services
      await this.shutdownAll();
      throw error;
    }
  }

  /**
   * Initialize a single service
   */
  private async initializeService(serviceName: string): Promise<void> {
    const metadata = this.services.get(serviceName);
    if (!metadata) {
      throw new Error(`Service '${serviceName}' not found in registry`);
    }

    if (metadata.status === 'healthy') {
      logger.info('ServiceRegistry', 'initializeService', `Service '${serviceName}' already initialized, skipping`);
      return;
    }

    const previousState = metadata.status;
    logger.info('ServiceRegistry', 'initializeService', `Initializing service: ${serviceName}`);
    metadata.status = 'initializing';
    metadata.initializationStartedAt = new Date();
    metadata.initializationTimeoutMs = 5 * 60 * 1000; // 5 minutes timeout
    
    // Report initialization start to kernel
    reportStateToKernel(serviceName, 'INITIALIZING', previousState);

    try {
      // Gather dependencies
      const dependencies = this.resolveDependencies(metadata.config.dependencies ?? []);

      // Call factory with dependencies
      const startTime = Date.now();
      const instance = await metadata.config.factory(dependencies);
      const duration = Date.now() - startTime;

      metadata.instance = instance;
      metadata.status = 'healthy';
      metadata.stats.initializedAt = new Date();
      
      // Report healthy to kernel
      reportStateToKernel(serviceName, 'HEALTHY', 'initializing', {
        durationMs: duration,
        dependencies: Object.keys(dependencies),
      });

      logger.info('ServiceRegistry', 'initializeService', `Service initialized: ${serviceName}`, {
        durationMs: duration,
        metadata: { dependencies: Object.keys(dependencies) },
      });
    } catch (error) {
      metadata.status = 'error';
      
      // Report error to kernel
      reportStateToKernel(serviceName, 'ERROR', 'initializing', {
        error: getErrorMessage(error),
      });
      
      logger.error('ServiceRegistry', 'initializeService', `Failed to initialize service: ${serviceName}`, { metadata: { error } });
      throw new Error(`Failed to initialize service '${serviceName}': ${getErrorMessage(error)}`);
    }
  }

  // ============================================================================
  // Service Retrieval
  // ============================================================================

  /**
   * Get a service instance by name
   * 
   * @param serviceName Service name
   * @returns Service instance
   * @throws Error if service not found or not initialized
   */
  get<T = any>(serviceName: string): T {
    const metadata = this.services.get(serviceName);
    
    if (!metadata) {
      throw new Error(`Service '${serviceName}' not found in registry. Available services: ${Array.from(this.services.keys()).join(', ')}`);
    }

    if (metadata.status === 'registered' || metadata.status === 'initializing') {
      throw new Error(`Service '${serviceName}' is not yet initialized (status: ${metadata.status})`);
    }

    if (metadata.status === 'shutdown') {
      throw new Error(`Service '${serviceName}' has been shut down`);
    }

    return metadata.instance as T;
  }

  /**
   * Check if a service is registered
   */
  has(serviceName: string): boolean {
    return this.services.has(serviceName);
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  /**
   * Get health status for a specific service
   */
  getHealth(serviceName: string): ServiceHealth | null {
    const metadata = this.services.get(serviceName);
    if (!metadata) return null;

    const uptime = metadata.stats.initializedAt
      ? Date.now() - metadata.stats.initializedAt.getTime()
      : 0;

    return {
      name: metadata.name,
      status: metadata.status,
      uptime,
      lastHealthCheck: metadata.lastHealthCheckAt,
      lastHealthCheckPassed: metadata.lastHealthCheckResult,
      healthCheckFailures: metadata.stats.healthCheckFailures,
    };
  }

  /**
   * Get health status for all services
   */
  getAllHealth(): Record<string, ServiceHealth> {
    const health: Record<string, ServiceHealth> = {};
    
    for (const serviceName of this.services.keys()) {
      const serviceHealth = this.getHealth(serviceName);
      if (serviceHealth) {
        health[serviceName] = serviceHealth;
      }
    }

    return health;
  }

  /**
   * Start health checks for all services
   */
  private startAllHealthChecks(): void {
    for (const [serviceName, metadata] of this.services.entries()) {
      if (metadata.config.healthCheck) {
        this.startHealthCheck(serviceName);
      }
    }
  }

  /**
   * Start health check for a specific service
   */
  private startHealthCheck(serviceName: string): void {
    const metadata = this.services.get(serviceName);
    if (!metadata || !metadata.config.healthCheck) return;

    // Clear existing timer if any
    if (metadata.healthCheckTimer) {
      clearInterval(metadata.healthCheckTimer);
    }

    // Run initial health check immediately
    this.runHealthCheck(serviceName).catch(() => {
      // Error already logged in runHealthCheck
    });

    // Schedule periodic health checks
    metadata.healthCheckTimer = setInterval(() => {
      this.runHealthCheck(serviceName).catch(() => {
        // Error already logged in runHealthCheck
      });
    }, metadata.config.healthCheckInterval!);

    // Ensure timer doesn't prevent process exit
    metadata.healthCheckTimer.unref?.();
  }

  /**
   * Run health check for a specific service
   */
  private async runHealthCheck(serviceName: string): Promise<void> {
    const metadata = this.services.get(serviceName);
    if (!metadata || !metadata.config.healthCheck) return;

    try {
      const isHealthy = await metadata.config.healthCheck(metadata.instance);
      
      metadata.lastHealthCheckAt = new Date();
      metadata.lastHealthCheckResult = isHealthy;
      metadata.stats.healthCheckCount++;

      if (!isHealthy) {
        metadata.stats.healthCheckFailures++;
        
        // Check if service is still initializing
        if (metadata.status === 'initializing') {
          // Check if initialization timeout exceeded (default: 5 minutes)
          const initElapsed = Date.now() - (metadata.initializationStartedAt?.getTime() || 0);
          const timeout = metadata.initializationTimeoutMs || 5 * 60 * 1000;
          
          if (initElapsed > timeout) {
            // Timeout exceeded - mark as degraded
            const previousState = metadata.status;
            metadata.status = 'degraded';
            
            // Report to kernel
            reportStateToKernel(serviceName, 'DEGRADED', previousState, {
              reason: 'initialization_timeout',
              timeoutMs: timeout,
              elapsedMs: initElapsed,
            });
            
            logger.warn('ServiceRegistry', 'runHealthCheck', `Service initialization timeout: ${serviceName}`, {
              durationMs: initElapsed,
              metadata: {
                timeoutMs: timeout,
                failures: metadata.stats.healthCheckFailures,
              },
            });
          } else {
            // Still within initialization window - keep status as 'initializing'
            // Log at info level with initialization progress
            logger.info('ServiceRegistry', 'runHealthCheck', `Service still initializing: ${serviceName}`, {
              durationMs: initElapsed,
              metadata: {
                timeoutMs: timeout,
                remainingMs: timeout - initElapsed,
              },
            });
          }
        } else if (metadata.status === 'healthy') {
          // Service was healthy but now failing - mark as degraded
          const previousState = metadata.status;
          metadata.status = 'degraded';
          
          // Report to kernel
          reportStateToKernel(serviceName, 'DEGRADED', previousState, {
            reason: 'health_check_failed',
            failures: metadata.stats.healthCheckFailures,
          });
          
          logger.warn('ServiceRegistry', 'runHealthCheck', `Service degraded: ${serviceName}`, {
            metadata: { failures: metadata.stats.healthCheckFailures },
          });
        }
      } else {
        // Health check passed
        if (metadata.status === 'degraded') {
          const previousState = metadata.status;
          metadata.status = 'healthy';
          
          // Report recovery to kernel
          reportStateToKernel(serviceName, 'HEALTHY', previousState, {
            reason: 'recovered',
          });
          
          logger.info('ServiceRegistry', 'runHealthCheck', `Service recovered: ${serviceName}`);
        } else if (metadata.status === 'initializing') {
          // First successful health check - transition from initializing to healthy
          const previousState = metadata.status;
          metadata.status = 'healthy';
          const initElapsed = Date.now() - (metadata.initializationStartedAt?.getTime() || 0);
          
          // Report to kernel
          reportStateToKernel(serviceName, 'HEALTHY', previousState, {
            reason: 'initialization_complete',
            initDurationMs: initElapsed,
          });
          
          logger.info('ServiceRegistry', 'runHealthCheck', `Service initialization complete: ${serviceName}`, {
            durationMs: initElapsed,
          });
        }
      }
    } catch (error) {
      const previousState = metadata.status;
      metadata.stats.healthCheckFailures++;
      metadata.status = 'error';
      
      // Report error to kernel
      reportStateToKernel(serviceName, 'ERROR', previousState, {
        reason: 'health_check_exception',
        error: getErrorMessage(error),
      });
      
      logger.error('ServiceRegistry', 'runHealthCheck', `Health check failed for service: ${serviceName}`, { metadata: { error } });
    }
  }

  // ============================================================================
  // Graceful Shutdown
  // ============================================================================

  /**
   * Shutdown all services in reverse initialization order
   */
  async shutdownAll(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('ServiceRegistry', 'shutdownAll', 'Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('ServiceRegistry', 'shutdownAll', 'Starting graceful shutdown', {
      metadata: { serviceCount: this.services.size },
    });

    try {
      // Stop all health checks
      for (const metadata of this.services.values()) {
        if (metadata.healthCheckTimer) {
          clearInterval(metadata.healthCheckTimer);
          metadata.healthCheckTimer = undefined;
        }
      }

      // Shutdown services in reverse order
      const shutdownOrder = [...this.initializationOrder].reverse();

      for (const serviceName of shutdownOrder) {
        await this.shutdownService(serviceName);
      }

      logger.info('ServiceRegistry', 'shutdownAll', 'All services shut down successfully');
    } catch (error) {
      logger.error('ServiceRegistry', 'shutdownAll', 'Shutdown failed', { metadata: { error } });
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Shutdown a single service
   */
  private async shutdownService(serviceName: string): Promise<void> {
    const metadata = this.services.get(serviceName);
    if (!metadata) return;

    if (metadata.status === 'shutdown' || metadata.status === 'registered') {
      return;
    }

    const previousState = metadata.status;
    logger.info('ServiceRegistry', 'shutdownService', `Shutting down service: ${serviceName}`);

    try {
      if (metadata.config.shutdown) {
        await metadata.config.shutdown(metadata.instance);
      }

      metadata.status = 'shutdown';
      metadata.stats.shutdownAt = new Date();
      
      // Report shutdown to kernel
      reportStateToKernel(serviceName, 'SHUTDOWN', previousState);

      logger.info('ServiceRegistry', 'shutdownService', `Service shut down: ${serviceName}`);
    } catch (error) {
      // Report error during shutdown to kernel
      reportStateToKernel(serviceName, 'ERROR', previousState, {
        error: getErrorMessage(error),
        phase: 'shutdown',
      });
      
      logger.error('ServiceRegistry', 'shutdownService', `Failed to shut down service: ${serviceName}`, { metadata: { error } });
      // Continue with other shutdowns even if this one fails
    }
  }

  /**
   * Setup process signal handlers for graceful shutdown
   */
  private setupShutdownHandlers(): void {
    const handleShutdown = async (signal: string) => {
      logger.info('ServiceRegistry', 'handleShutdown', `Received ${signal}, initiating graceful shutdown`);
      
      try {
        await this.shutdownAll();
        process.exit(0);
      } catch (error) {
        logger.error('ServiceRegistry', 'handleShutdown', 'Shutdown failed', { metadata: { error } });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  }

  // ============================================================================
  // Dependency Resolution
  // ============================================================================

  /**
   * Build dependency graph for all services
   */
  private buildDependencyGraph(): DependencyGraph {
    const graph: DependencyGraph = {};

    for (const [serviceName, metadata] of this.services.entries()) {
      graph[serviceName] = metadata.config.dependencies ?? [];
    }

    return graph;
  }

  /**
   * Detect circular dependencies in the dependency graph
   */
  private detectCircularDependencies(graph: DependencyGraph): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (serviceName: string, path: string[]): void => {
      visited.add(serviceName);
      recursionStack.add(serviceName);

      const dependencies = graph[serviceName] ?? [];
      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          detectCycle(dep, [...path, dep]);
        } else if (recursionStack.has(dep)) {
          throw new Error(`Circular dependency detected: ${[...path, dep].join(' -> ')}`);
        }
      }

      recursionStack.delete(serviceName);
    };

    for (const serviceName of Object.keys(graph)) {
      if (!visited.has(serviceName)) {
        detectCycle(serviceName, [serviceName]);
      }
    }
  }

  /**
   * Resolve initialization order using topological sort
   */
  private resolveInitializationOrder(): string[] {
    const graph = this.buildDependencyGraph();
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (serviceName: string): void => {
      if (visited.has(serviceName)) return;

      visited.add(serviceName);

      const dependencies = graph[serviceName] ?? [];
      for (const dep of dependencies) {
        if (!this.services.has(dep)) {
          throw new Error(`Service '${serviceName}' depends on '${dep}' which is not registered`);
        }
        visit(dep);
      }

      order.push(serviceName);
    };

    // Sort services by startup order first
    const sortedServices = Array.from(this.services.entries()).sort((a, b) => {
      const orderA = a[1].config.startupOrder ?? 100;
      const orderB = b[1].config.startupOrder ?? 100;
      return orderA - orderB;
    });

    // Visit services in startup order
    for (const [serviceName] of sortedServices) {
      visit(serviceName);
    }

    return order;
  }

  /**
   * Resolve dependencies for a service
   */
  private resolveDependencies(dependencies: string[]): ServiceDependencies {
    const resolved: ServiceDependencies = {};

    for (const depName of dependencies) {
      const depMetadata = this.services.get(depName);
      
      if (!depMetadata) {
        throw new Error(`Dependency '${depName}' not found in registry`);
      }

      if (depMetadata.status !== 'healthy') {
        throw new Error(`Dependency '${depName}' is not healthy (status: ${depMetadata.status})`);
      }

      resolved[depName] = depMetadata.instance;
    }

    return resolved;
  }

  // ============================================================================
  // Statistics & Utilities
  // ============================================================================

  /**
   * Get statistics for a specific service
   */
  getStats(serviceName: string): ServiceStats | null {
    const metadata = this.services.get(serviceName);
    if (!metadata) return null;

    const uptime = metadata.stats.initializedAt
      ? Date.now() - metadata.stats.initializedAt.getTime()
      : 0;

    return {
      ...metadata.stats,
      uptimeMs: uptime,
    };
  }

  /**
   * Calculate total initialization time
   */
  private calculateTotalInitTime(): string {
    let totalMs = 0;

    for (const metadata of this.services.values()) {
      if (metadata.stats.initializedAt) {
        const duration = metadata.stats.initializedAt.getTime() - metadata.stats.registeredAt.getTime();
        totalMs += duration;
      }
    }

    return `${totalMs}ms`;
  }

  /**
   * Get registry status summary
   */
  getStatus(): {
    isInitialized: boolean;
    isShuttingDown: boolean;
    serviceCount: number;
    healthyCount: number;
    degradedCount: number;
    errorCount: number;
  } {
    let healthyCount = 0;
    let degradedCount = 0;
    let errorCount = 0;

    for (const metadata of this.services.values()) {
      switch (metadata.status) {
        case 'healthy':
          healthyCount++;
          break;
        case 'degraded':
          degradedCount++;
          break;
        case 'error':
          errorCount++;
          break;
      }
    }

    return {
      isInitialized: this.isInitialized,
      isShuttingDown: this.isShuttingDown,
      serviceCount: this.services.size,
      healthyCount,
      degradedCount,
      errorCount,
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

// ServiceRegistry class is the primary export - used throughout src/index.ts

