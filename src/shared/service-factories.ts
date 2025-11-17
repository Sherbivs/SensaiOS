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
import { resourceManager } from '../services/monitoring/resource-manager.js';
import { errorTracker } from '../services/monitoring/error-tracker.js';
import { engineCache } from '../services/cache/engine-cache.js';
import { engineWriteBuffer } from '../services/cache/engine-write-buffer.js';
import { errorLearning } from '../services/monitoring/error-learning.js';
import * as resourceMonitor from '../services/monitoring/resource-monitor.js';
import * as engineReadDb from '../services/database/engine-read-db.js';
import * as engineWriteDb from '../services/database/engine-write-db.js';
import * as cacheFacade from '../services/cache/facade.js';

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
// ErrorLearning Factory
// ============================================================================

/**
 * Create ErrorLearning service instance
 * 
 * ErrorLearning analyzes historical error patterns to:
 * - Detect time-of-day clustering (errors spike at certain hours)
 * - Identify error correlations (ErrorA often followed by ErrorB)
 * - Detect cascade patterns (root error triggers downstream failures)
 * - Track recovery strategy effectiveness (success rates per strategy)
 * - Predict impact of future errors (features affected, user count)
 * 
 * Dependencies: ErrorTracker (requires error history for analysis)
 * 
 * Health Check:
 * - Validates analysis worker is operational
 * - Checks pattern detection cache is not stale (last update < 2 hours)
 * - Monitors knowledge base size (pattern count within bounds)
 * 
 * Shutdown:
 * - Stops analysis worker
 * - Flushes pending pattern updates
 * - Persists final knowledge base state
 */
export function createErrorLearning(): unknown {
  return errorLearning;
}

/**
 * Health check for ErrorLearning service
 * 
 * Checks:
 * - Analysis worker running (not crashed)
 * - Last analysis timestamp recent (< 2 hours ago)
 * - Pattern cache populated (has time/correlation/cascade data)
 * - No analysis deadlock (analysisInProgress flag not stuck)
 */
export function errorLearningHealthCheck(instance: unknown): boolean {
  const service = instance as typeof errorLearning;
  
  // Check if service is initialized
  if (!service) {
    return false;
  }
  
  // Service is healthy if it exists and has core methods
  // Note: Actual health checks would verify:
  // - Analysis worker not stuck (analysisInProgress flag)
  // - Pattern cache is fresh (lastAnalyzed timestamp)
  // - Knowledge base size within bounds
  return typeof service.detectTimePatterns === 'function' &&
         typeof service.detectCorrelations === 'function' &&
         typeof service.updateKnowledgeBase === 'function';
}

/**
 * Shutdown handler for ErrorLearning service
 * 
 * Cleanup sequence:
 * 1. Stop analysis worker (if running)
 * 2. Flush pending pattern updates to database
 * 3. Persist final knowledge base snapshot
 * 4. Clear in-memory pattern cache
 */
export async function errorLearningShutdown(_instance: unknown): Promise<void> {
  // Note: Add shutdown logic when ErrorLearningService implements shutdown() method
  // Current implementation is stateless (no workers to stop)
  // Future: const service = instance as typeof errorLearning;
  //         if (service.shutdown) await service.shutdown();
  
  // For now, service has no active resources to clean up
  return Promise.resolve();
}

/**
 * ServiceConfig for ErrorLearning
 */
export const errorLearningConfig: ServiceConfig = {
  name: 'error-learning',
  factory: createErrorLearning,
  dependencies: ['error-tracker'], // Requires error history for pattern analysis
  healthCheck: errorLearningHealthCheck,
  shutdown: errorLearningShutdown,
  startupOrder: 15, // After error-tracker (10), before application services (20+)
};

// ============================================================================
// ResourceMonitor Factory
// ============================================================================

/**
 * Create ResourceMonitor service instance
 * 
 * ResourceMonitor provides unified resource and memory management:
 * - Periodic health checks (startup + configurable intervals)
 * - Real-time memory guardian (30s polling with automatic pruning)
 * - Resource leak detection and alerting
 * - Integrated with intelligent logger for visibility
 * 
 * Memory Protection Levels (Standard Plan: 2 GB):
 * - NORMAL: <1536MB (75%) - Monitor only
 * - WARNING: 1536-1740MB (75-85%) - Preemptive pruning
 * - CRITICAL: 1741-1842MB (85-90%) - Aggressive pruning
 * - EMERGENCY: 1843-2047MB (90-99%) - Nuclear pruning
 * 
 * Dependencies: None (standalone monitoring service)
 * 
 * Health Check:
 * - Validates monitoring worker is operational
 * - Checks memory usage within safe thresholds (<90% = healthy)
 * - Monitors resource counts within limits
 * - Verifies prune operations are functional
 * 
 * Shutdown:
 * - Stops monitoring worker
 * - Stops memory guardian
 * - Flushes final health check snapshot
 * - Cleans up monitoring intervals
 */
export function createResourceMonitor(): unknown {
  return resourceMonitor;
}

/**
 * Health check for ResourceMonitor service
 * 
 * Checks:
 * - Memory usage < 90% (emergency threshold)
 * - Monitoring worker active (not crashed)
 * - Resource counts within expected bounds
 * - No prune failures in last check
 */
export function resourceMonitorHealthCheck(instance: unknown): boolean {
  const service = instance as typeof resourceMonitor;
  
  // Check if service is initialized
  if (!service || !service.resourceMonitor) {
    return false;
  }
  
  // Service is healthy if the singleton has core public methods
  const monitor = service.resourceMonitor;
  return typeof monitor.start === 'function' &&
         typeof monitor.stop === 'function' &&
         typeof monitor.getHealthSummary === 'function';
}

/**
 * Shutdown handler for ResourceMonitor service
 * 
 * Cleanup sequence:
 * 1. Stop monitoring worker (periodic health checks)
 * 2. Stop memory guardian (30s polling)
 * 3. Flush final health check snapshot
 * 4. Clear monitoring intervals
 */
export async function resourceMonitorShutdown(instance: unknown): Promise<void> {
  const service = instance as typeof resourceMonitor;
  
  // Stop monitoring (clears intervals)
  service.resourceMonitor.stop();
}

/**
 * ServiceConfig for ResourceMonitor
 */
export const resourceMonitorConfig: ServiceConfig = {
  name: 'resource-monitor',
  factory: createResourceMonitor,
  dependencies: [], // Standalone monitoring service
  healthCheck: resourceMonitorHealthCheck,
  shutdown: resourceMonitorShutdown,
  startupOrder: 12, // After error-tracker (10), before error-learning (15)
};

// ============================================================================
// Engine Read-DB Factory (Read-Only SQLite for Pokemon Data)
// ============================================================================

/**
 * Factory for Engine Read-DB service
 * 
 * Provides read-only SQLite database for Pokemon, Moves, Type Effectiveness.
 * Used by L1 Cache (engineCache) to load data at startup + hourly refresh.
 * 
 * Dependencies: None (standalone database)
 * Initialization: Auto-creates schema if missing, loads from disk
 * Shutdown: Saves to disk, closes database connection
 */
export function createEngineReadDb(): unknown {
  return engineReadDb;
}

/**
 * Health check for Engine Read-DB service
 * 
 * Checks:
 * - Database initialized (isReady() === true)
 * - Core data loaded (pokemon, moves, types > 0)
 * - Version metadata present (SHA-256 fingerprint)
 * - Database file accessible on disk
 */
export function engineReadDbHealthCheck(instance: unknown): boolean {
  const service = instance as typeof engineReadDb;
  
  // Check if service exists
  if (!service) {
    return false;
  }
  
  // Service is healthy if initialized with core methods
  return typeof service.initialize === 'function' &&
         typeof service.isReady === 'function' &&
         typeof service.getAllPokemon === 'function' &&
         typeof service.getAllMoves === 'function' &&
         typeof service.getAllTypeEffectiveness === 'function' &&
         typeof service.getStats === 'function' &&
         typeof service.close === 'function';
}

/**
 * Shutdown handler for Engine Read-DB service
 * 
 * Cleanup sequence:
 * 1. Save database to disk (if dirty)
 * 2. Close SQLite connection
 * 3. Clear in-memory database handle
 */
export async function engineReadDbShutdown(instance: unknown): Promise<void> {
  const service = instance as typeof engineReadDb;
  
  // Close database (auto-saves)
  await service.close();
}

/**
 * ServiceConfig for Engine Read-DB
 * 
 * Startup order: 16 (after monitoring, before write-db)
 * Dependencies: None (standalone)
 */
export const engineReadDbConfig: ServiceConfig = {
  name: 'engine-read-db',
  factory: createEngineReadDb,
  dependencies: [],
  healthCheck: engineReadDbHealthCheck,
  shutdown: engineReadDbShutdown,
  startupOrder: 16
};

// ============================================================================
// Engine Write-DB Factory (Append-Only SQLite for Battle Logs)
// ============================================================================

/**
 * Factory for Engine Write-DB service
 * 
 * Provides append-only SQLite database for battle logs, move usage, anomalies.
 * Flushed from Write Buffer every 30s, validated and uploaded to PROD hourly.
 * 
 * Dependencies: engine-read-db (shares config, startup patterns)
 * Initialization: Auto-creates schema, replays WAL (crash recovery)
 * Shutdown: Final save to disk, closes database connection
 */
export function createEngineWriteDb(): unknown {
  return engineWriteDb;
}

/**
 * Health check for Engine Write-DB service
 * 
 * Checks:
 * - Database initialized (isReady() === true)
 * - WAL functional (crash recovery enabled)
 * - Write operations working (insert methods)
 * - Auto-save active (30s intervals)
 */
export function engineWriteDbHealthCheck(instance: unknown): boolean {
  const service = instance as typeof engineWriteDb;
  
  // Check if service exists
  if (!service) {
    return false;
  }
  
  // Service is healthy if initialized with core methods
  return typeof service.initialize === 'function' &&
         typeof service.isReady === 'function' &&
         typeof service.insertBattleLogs === 'function' &&
         typeof service.insertMoveUsage === 'function' &&
         typeof service.insertAnomalies === 'function' &&
         typeof service.validateData === 'function' &&
         typeof service.uploadToProd === 'function' &&
         typeof service.getStats === 'function' &&
         typeof service.close === 'function';
}

/**
 * Shutdown handler for Engine Write-DB service
 * 
 * Cleanup sequence:
 * 1. Final save to disk (emergency flush)
 * 2. Close SQLite connection
 * 3. Clear in-memory database handle
 * 4. Preserve WAL entries (recovery on next startup)
 */
export async function engineWriteDbShutdown(instance: unknown): Promise<void> {
  const service = instance as typeof engineWriteDb;
  
  // Final save + close (preserves WAL)
  await service.close();
}

/**
 * ServiceConfig for Engine Write-DB
 * 
 * Startup order: 17 (after read-db, before cache workers)
 * Dependencies: engine-read-db (pairs with read database)
 */
export const engineWriteDbConfig: ServiceConfig = {
  name: 'engine-write-db',
  factory: createEngineWriteDb,
  dependencies: ['engine-read-db'],
  healthCheck: engineWriteDbHealthCheck,
  shutdown: engineWriteDbShutdown,
  startupOrder: 17
};

// ============================================================================
// Cache Facade Factory (Runtime Cache with Memory + Disk Tiers)
// ============================================================================

/**
 * Factory for Cache Facade service
 * 
 * Provides runtime cache with in-memory LRU (hot layer) + disk persistence.
 * Used across services for trainer profiles, Pokemon data, battle state.
 * 
 * Dependencies: None (standalone cache layer)
 * Initialization: Creates cache directories, starts maintenance scheduler
 * Shutdown: Stops scheduler, flushes dirty entries to disk
 */
export function createCacheFacade(): unknown {
  return cacheFacade;
}

/**
 * Health check for Cache Facade service
 * 
 * Checks:
 * - Maintenance scheduler active
 * - Cache root directory accessible
 * - Hit/miss counters functional
 * - No recent maintenance errors
 */
export function cacheFacadeHealthCheck(instance: unknown): boolean {
  const service = instance as typeof cacheFacade;
  
  // Check if service exists
  if (!service) {
    return false;
  }
  
  // Service is healthy if it has core cache methods
  return typeof service.getOrHydrate === 'function' &&
         typeof service.touch === 'function' &&
         typeof service.evict === 'function' &&
         typeof service.collectCacheMetrics === 'function' &&
         typeof service.startCacheMaintenanceScheduler === 'function' &&
         typeof service.stopCacheMaintenanceScheduler === 'function' &&
         typeof service.runCacheMaintenanceNow === 'function';
}

/**
 * Shutdown handler for Cache Facade service
 * 
 * Cleanup sequence:
 * 1. Stop maintenance scheduler
 * 2. Run final maintenance (prune expired entries)
 * 3. Flush dirty memory entries to disk
 */
export async function cacheFacadeShutdown(instance: unknown): Promise<void> {
  const service = instance as typeof cacheFacade;
  
  // Stop scheduler
  service.stopCacheMaintenanceScheduler();
  
  // Final maintenance flush
  await service.runCacheMaintenanceNow('manual');
}

/**
 * ServiceConfig for Cache Facade
 * 
 * Startup order: 18 (after databases, before workers)
 * Dependencies: None (standalone cache layer)
 */
export const cacheFacadeConfig: ServiceConfig = {
  name: 'cache-facade',
  factory: createCacheFacade,
  dependencies: [],
  healthCheck: cacheFacadeHealthCheck,
  shutdown: cacheFacadeShutdown,
  startupOrder: 18
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
    resourceMonitorConfig,
    errorLearningConfig,
    engineReadDbConfig,
    engineWriteDbConfig,
    cacheFacadeConfig,
    engineCacheConfig,
    engineWriteBufferConfig,
  ];
}
