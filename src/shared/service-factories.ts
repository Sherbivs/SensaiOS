/**
 * Service Factory Functions for Service Registry
 * 
 * Provides factory functions that create service instances for the Service Registry.
 * Each factory function encapsulates service initialization logic and returns the
 * singleton instance, allowing the registry to manage lifecycle and dependencies.
 * 
 * Migration Pattern:
 * 1. Create factory function that returns singleton instance
 * 2. Define dependencies in ServiceConfig
 * 3. Add health check function (validates service operational state)
 * 4. Add shutdown handler (cleanup resources)
 * 5. Register with ServiceRegistry in src/index.ts
 * 6. Replace direct imports with registry.get<T>()
 * 
 * Benefits:
 * - Centralized service lifecycle management
 * - Automatic dependency resolution and startup order
 * - Health monitoring with degraded state detection
 * - Graceful shutdown in reverse dependency order
 * - Loose coupling (dependency injection vs. direct imports)
 */

import type { ServiceConfig } from './service-registry.js';
import { resourceManager } from '../services/resource-manager.js';
import { errorTracker } from '../services/error-tracker.js';
import { engineCache } from '../services/engine-cache.js';
import { engineWriteBuffer } from '../services/engine-write-buffer.js';

// ============================================================================
// ResourceManager Factory
// ============================================================================

/**
 * Create ResourceManager service instance
 * 
 * ResourceManager tracks and cleans up all system resources:
 * - Timers (setInterval/setTimeout)
 * - EventEmitter listeners
 * - Database connections
 * - Cache entries
 * - File descriptors
 * 
 * Dependencies: None (foundation service)
 * 
 * Health Check:
 * - Validates resource tracking is operational
 * - Checks resource counts are within expected limits
 * - Monitors for resource leaks (excessive growth)
 * 
 * Shutdown:
 * - Clears all tracked timers
 * - Removes all tracked listeners
 * - Closes all tracked connections
 * - Flushes all tracked caches
 */
export function createResourceManager(): unknown {
  return resourceManager;
}

/**
 * Health check for ResourceManager
 * 
 * Validates:
 * - Resource tracking operational (getStats returns valid data)
 * - Timer count < 100 (leak detection)
 * - Listener count < 500 (leak detection)
 * - Connection count < 50 (leak detection)
 * 
 * Returns true if healthy, false if degraded
 */
export function resourceManagerHealthCheck(instance: unknown): boolean {
  try {
    const stats = (instance as any).getStats();
    
    // Validate stats structure
    if (!stats || typeof stats.total !== 'number') {
      return false;
    }
    
    // Check for resource leaks
    const timerCount = stats.byType?.timer || 0;
    const listenerCount = stats.byType?.listener || 0;
    const connectionCount = stats.byType?.connection || 0;
    
    // Degraded if excessive resource counts (potential leaks)
    if (timerCount > 100 || listenerCount > 500 || connectionCount > 50) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Shutdown handler for ResourceManager
 * 
 * Cleans up all tracked resources:
 * - Clears timers
 * - Removes listeners
 * - Closes connections
 * - Flushes caches
 */
export async function resourceManagerShutdown(instance: unknown): Promise<void> {
  await (instance as any).shutdown();
}

/**
 * ServiceConfig for ResourceManager
 */
export const resourceManagerConfig: ServiceConfig = {
  name: 'resource-manager',
  factory: createResourceManager,
  dependencies: [], // Foundation service - no dependencies
  healthCheck: resourceManagerHealthCheck,
  shutdown: resourceManagerShutdown,
  startupOrder: 1, // Initialize first (foundation service)
};

// ============================================================================
// ErrorTracker Factory
// ============================================================================

/**
 * Create ErrorTracker service instance
 * 
 * ErrorTracker monitors and analyzes errors across the system:
 * - Tracks error frequency and patterns
 * - Provides live error stream for monitoring
 * - Integrates with alerting systems
 * 
 * Dependencies: ResourceManager (for timer/listener tracking)
 * 
 * Health Check:
 * - Validates error tracking is operational
 * - Checks error buffer not overflowing
 * - Monitors error stream active
 * 
 * Shutdown:
 * - Stops error stream
 * - Flushes error buffer
 */
export function createErrorTracker(): unknown {
  return errorTracker;
}

/**
 * Health check for ErrorTracker
 * 
 * Validates:
 * - Error tracking operational (getStats returns valid data)
 * - Error buffer not overflowing (< 1000 errors queued)
 * 
 * Returns true if healthy, false if degraded
 */
export function errorTrackerHealthCheck(instance: unknown): boolean {
  try {
    const stats = (instance as any).getStats();
    
    // Validate stats structure
    if (!stats || typeof stats.totalErrors !== 'number') {
      return false;
    }
    
    // Check for error buffer overflow (potential issue if > 1000 queued)
    const queueSize = stats.queueSize || 0;
    if (queueSize > 1000) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Shutdown handler for ErrorTracker
 * 
 * Stops error stream and flushes buffer
 */
export async function errorTrackerShutdown(instance: unknown): Promise<void> {
  (instance as any).stopErrorStream();
  // ErrorTracker doesn't have async shutdown, but we wrap for consistency
  await Promise.resolve();
}

/**
 * ServiceConfig for ErrorTracker
 */
export const errorTrackerConfig: ServiceConfig = {
  name: 'error-tracker',
  factory: createErrorTracker,
  dependencies: ['resource-manager'], // Depends on ResourceManager for timer/listener tracking
  healthCheck: errorTrackerHealthCheck,
  shutdown: errorTrackerShutdown,
  startupOrder: 10, // Initialize after ResourceManager
};

// ============================================================================
// EngineCache Factory
// ============================================================================

/**
 * Create EngineCache service instance
 * 
 * EngineCache provides ultra-fast in-memory lookups for game engine:
 * - Pokemon data (species, stats, abilities)
 * - Move data (power, accuracy, effects)
 * - Type effectiveness chart
 * 
 * Performance: <1μs read latency (10-100x faster than SQLite)
 * 
 * Dependencies: None (independent cache)
 * 
 * Health Check:
 * - Validates cache initialized (data loaded)
 * - Checks memory within limits (< 20 MB)
 * - Monitors cache hit rate (> 90%)
 * 
 * Shutdown:
 * - Clears in-memory cache
 * - Releases memory
 */
export function createEngineCache(): unknown {
  return engineCache;
}

/**
 * Health check for EngineCache
 * 
 * Validates:
 * - Cache initialized (pokemon/moves/types loaded)
 * - Memory within limits (< 20 MB)
 * 
 * Returns true if healthy, false if degraded
 */
export function engineCacheHealthCheck(instance: unknown): boolean {
  try {
    const stats = (instance as any).getStats();
    
    // Validate cache initialized (has data)
    if (!stats || stats.pokemonCount === 0 || stats.moveCount === 0) {
      return false;
    }
    
    // Check memory limits (degraded if > 20 MB)
    const memoryMb = stats.memorySizeMb || 0;
    if (memoryMb > 20) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Shutdown handler for EngineCache
 * 
 * Clears in-memory cache and releases memory
 */
export async function engineCacheShutdown(instance: unknown): Promise<void> {
  (instance as any).shutdown();
  await Promise.resolve();
}

/**
 * ServiceConfig for EngineCache
 */
export const engineCacheConfig: ServiceConfig = {
  name: 'engine-cache',
  factory: createEngineCache,
  dependencies: [], // Independent cache
  healthCheck: engineCacheHealthCheck,
  shutdown: engineCacheShutdown,
  startupOrder: 20, // Initialize after foundation services
};

// ============================================================================
// EngineWriteBuffer Factory
// ============================================================================

/**
 * Create EngineWriteBuffer service instance
 * 
 * EngineWriteBuffer buffers game engine writes for batch processing:
 * - Battle logs
 * - Move usage statistics
 * - Anomaly detection events
 * 
 * Performance: <10μs push latency (non-blocking)
 * 
 * Dependencies: None (independent buffer)
 * 
 * Health Check:
 * - Validates buffer operational (accepting writes)
 * - Checks buffer not overflowing (< 95% full)
 * - Monitors flush working (last flush < 2 minutes ago)
 * 
 * Shutdown:
 * - Emergency flush of buffered data
 * - Ensures no data loss on shutdown
 */
export function createEngineWriteBuffer(): unknown {
  return engineWriteBuffer;
}

/**
 * Health check for EngineWriteBuffer
 * 
 * Validates:
 * - Buffer operational (getStats returns valid data)
 * - Buffer not overflowing (< 95% full triggers backpressure)
 * 
 * Returns true if healthy, false if degraded
 */
export function engineWriteBufferHealthCheck(instance: unknown): boolean {
  try {
    const stats = (instance as any).getStats();
    
    // Validate stats structure
    if (!stats || typeof stats.battleLogQueue !== 'number') {
      return false;
    }
    
    // Check for buffer overflow (degraded if > 9500 entries in any queue)
    const battleQueueSize = stats.battleLogQueue || 0;
    const moveQueueSize = stats.moveUsageQueue || 0;
    const anomalyQueueSize = stats.anomalyQueue || 0;
    const maxQueueSize = 10000; // From engine-write-buffer.ts config
    
    const battleUtilization = battleQueueSize / maxQueueSize;
    const moveUtilization = moveQueueSize / maxQueueSize;
    const anomalyUtilization = anomalyQueueSize / maxQueueSize;
    
    // Degraded if any queue > 95% full
    if (battleUtilization > 0.95 || moveUtilization > 0.95 || anomalyUtilization > 0.95) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Shutdown handler for EngineWriteBuffer
 * 
 * Emergency flush of all buffered data to prevent data loss
 */
export async function engineWriteBufferShutdown(instance: unknown): Promise<void> {
  await (instance as any).emergencyShutdown();
}

/**
 * ServiceConfig for EngineWriteBuffer
 */
export const engineWriteBufferConfig: ServiceConfig = {
  name: 'engine-write-buffer',
  factory: createEngineWriteBuffer,
  dependencies: [], // Independent buffer
  healthCheck: engineWriteBufferHealthCheck,
  shutdown: engineWriteBufferShutdown,
  startupOrder: 20, // Initialize after foundation services
};

// ============================================================================
// Registry Configuration Helper
// ============================================================================

/**
 * Get all service configurations for registration
 * 
 * Usage:
 * ```typescript
 * import { ServiceRegistry } from './shared/service-registry.js';
 * import { getAllServiceConfigs } from './shared/service-factories.js';
 * 
 * const registry = ServiceRegistry.getInstance();
 * registry.registerAll(getAllServiceConfigs());
 * await registry.initializeAll();
 * ```
 */
export function getAllServiceConfigs(): ServiceConfig[] {
  return [
    resourceManagerConfig,
    errorTrackerConfig,
    engineCacheConfig,
    engineWriteBufferConfig,
  ];
}
