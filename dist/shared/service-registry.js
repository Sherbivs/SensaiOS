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
 *
 * @module shared/service-registry
 */
import { getLogger } from "../shared/logging/index.js";
import { getErrorMessage } from './utils/error-utils.js';
const logger = getLogger();
// ============================================================================
// Service Registry Class
// ============================================================================
export class ServiceRegistry {
    static instance = null;
    services = new Map();
    initializationOrder = [];
    isInitialized = false;
    isShuttingDown = false;
    constructor() {
        // Private constructor for singleton pattern
        this.setupShutdownHandlers();
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!ServiceRegistry.instance) {
            ServiceRegistry.instance = new ServiceRegistry();
        }
        return ServiceRegistry.instance;
    }
    /**
     * Reset singleton (for testing only)
     */
    static resetInstance() {
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
    register(config) {
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
        const metadata = {
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
    registerAll(configs) {
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
    async initializeAll() {
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
        }
        catch (error) {
            logger.error('ServiceRegistry', 'initializeAll', 'Initialization failed', { metadata: { error } });
            // Attempt to shutdown any partially initialized services
            await this.shutdownAll();
            throw error;
        }
    }
    /**
     * Initialize a single service
     */
    async initializeService(serviceName) {
        const metadata = this.services.get(serviceName);
        if (!metadata) {
            throw new Error(`Service '${serviceName}' not found in registry`);
        }
        if (metadata.status === 'healthy') {
            logger.info('ServiceRegistry', 'initializeService', `Service '${serviceName}' already initialized, skipping`);
            return;
        }
        logger.info('ServiceRegistry', 'initializeService', `Initializing service: ${serviceName}`);
        metadata.status = 'initializing';
        metadata.initializationStartedAt = new Date();
        metadata.initializationTimeoutMs = 5 * 60 * 1000; // 5 minutes timeout
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
            logger.info('ServiceRegistry', 'initializeService', `Service initialized: ${serviceName}`, {
                durationMs: duration,
                metadata: { dependencies: Object.keys(dependencies) },
            });
        }
        catch (error) {
            metadata.status = 'error';
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
    get(serviceName) {
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
        return metadata.instance;
    }
    /**
     * Check if a service is registered
     */
    has(serviceName) {
        return this.services.has(serviceName);
    }
    /**
     * Get all registered service names
     */
    getServiceNames() {
        return Array.from(this.services.keys());
    }
    // ============================================================================
    // Health Monitoring
    // ============================================================================
    /**
     * Get health status for a specific service
     */
    getHealth(serviceName) {
        const metadata = this.services.get(serviceName);
        if (!metadata)
            return null;
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
    getAllHealth() {
        const health = {};
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
    startAllHealthChecks() {
        for (const [serviceName, metadata] of this.services.entries()) {
            if (metadata.config.healthCheck) {
                this.startHealthCheck(serviceName);
            }
        }
    }
    /**
     * Start health check for a specific service
     */
    startHealthCheck(serviceName) {
        const metadata = this.services.get(serviceName);
        if (!metadata || !metadata.config.healthCheck)
            return;
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
        }, metadata.config.healthCheckInterval);
        // Ensure timer doesn't prevent process exit
        metadata.healthCheckTimer.unref?.();
    }
    /**
     * Run health check for a specific service
     */
    async runHealthCheck(serviceName) {
        const metadata = this.services.get(serviceName);
        if (!metadata || !metadata.config.healthCheck)
            return;
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
                        metadata.status = 'degraded';
                        logger.warn('ServiceRegistry', 'runHealthCheck', `Service initialization timeout: ${serviceName}`, {
                            durationMs: initElapsed,
                            metadata: {
                                timeoutMs: timeout,
                                failures: metadata.stats.healthCheckFailures,
                            },
                        });
                    }
                    else {
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
                }
                else if (metadata.status === 'healthy') {
                    // Service was healthy but now failing - mark as degraded
                    metadata.status = 'degraded';
                    logger.warn('ServiceRegistry', 'runHealthCheck', `Service degraded: ${serviceName}`, {
                        metadata: { failures: metadata.stats.healthCheckFailures },
                    });
                }
            }
            else {
                // Health check passed
                if (metadata.status === 'degraded') {
                    metadata.status = 'healthy';
                    logger.info('ServiceRegistry', 'runHealthCheck', `Service recovered: ${serviceName}`);
                }
                else if (metadata.status === 'initializing') {
                    // First successful health check - transition from initializing to healthy
                    metadata.status = 'healthy';
                    const initElapsed = Date.now() - (metadata.initializationStartedAt?.getTime() || 0);
                    logger.info('ServiceRegistry', 'runHealthCheck', `Service initialization complete: ${serviceName}`, {
                        durationMs: initElapsed,
                    });
                }
            }
        }
        catch (error) {
            metadata.stats.healthCheckFailures++;
            metadata.status = 'error';
            logger.error('ServiceRegistry', 'runHealthCheck', `Health check failed for service: ${serviceName}`, { metadata: { error } });
        }
    }
    // ============================================================================
    // Graceful Shutdown
    // ============================================================================
    /**
     * Shutdown all services in reverse initialization order
     */
    async shutdownAll() {
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
        }
        catch (error) {
            logger.error('ServiceRegistry', 'shutdownAll', 'Shutdown failed', { metadata: { error } });
            throw error;
        }
        finally {
            this.isShuttingDown = false;
        }
    }
    /**
     * Shutdown a single service
     */
    async shutdownService(serviceName) {
        const metadata = this.services.get(serviceName);
        if (!metadata)
            return;
        if (metadata.status === 'shutdown' || metadata.status === 'registered') {
            return;
        }
        logger.info('ServiceRegistry', 'shutdownService', `Shutting down service: ${serviceName}`);
        try {
            if (metadata.config.shutdown) {
                await metadata.config.shutdown(metadata.instance);
            }
            metadata.status = 'shutdown';
            metadata.stats.shutdownAt = new Date();
            logger.info('ServiceRegistry', 'shutdownService', `Service shut down: ${serviceName}`);
        }
        catch (error) {
            logger.error('ServiceRegistry', 'shutdownService', `Failed to shut down service: ${serviceName}`, { metadata: { error } });
            // Continue with other shutdowns even if this one fails
        }
    }
    /**
     * Setup process signal handlers for graceful shutdown
     */
    setupShutdownHandlers() {
        const handleShutdown = async (signal) => {
            logger.info('ServiceRegistry', 'handleShutdown', `Received ${signal}, initiating graceful shutdown`);
            try {
                await this.shutdownAll();
                process.exit(0);
            }
            catch (error) {
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
    buildDependencyGraph() {
        const graph = {};
        for (const [serviceName, metadata] of this.services.entries()) {
            graph[serviceName] = metadata.config.dependencies ?? [];
        }
        return graph;
    }
    /**
     * Detect circular dependencies in the dependency graph
     */
    detectCircularDependencies(graph) {
        const visited = new Set();
        const recursionStack = new Set();
        const detectCycle = (serviceName, path) => {
            visited.add(serviceName);
            recursionStack.add(serviceName);
            const dependencies = graph[serviceName] ?? [];
            for (const dep of dependencies) {
                if (!visited.has(dep)) {
                    detectCycle(dep, [...path, dep]);
                }
                else if (recursionStack.has(dep)) {
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
    resolveInitializationOrder() {
        const graph = this.buildDependencyGraph();
        const visited = new Set();
        const order = [];
        const visit = (serviceName) => {
            if (visited.has(serviceName))
                return;
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
    resolveDependencies(dependencies) {
        const resolved = {};
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
    getStats(serviceName) {
        const metadata = this.services.get(serviceName);
        if (!metadata)
            return null;
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
    calculateTotalInitTime() {
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
    getStatus() {
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
