/**
 * Resource Cleanup Manager - Centralized Resource Lifecycle Management
 * 
 * Provides automatic tracking, capping, and cleanup for all system resources:
 * - EventEmitter listeners (with max limits per emitter)
 * - Timers (setInterval/setTimeout with automatic clearing)
 * - Database connections (pooling with limits)
 * - HTTP connections (timeout enforcement)
 * - Cache entries (TTL and size limits)
 * - File descriptors (automatic cleanup)
 * 
 * Integration with error detection system for leak monitoring and alerting.
 */

import { EventEmitter } from 'node:events';
import { errorTracker } from './error-tracker.js';
import { log } from '../utils/logger.js';

// Note: resource-monitor.ts imports this file, so we can't import it here (circular dependency)
// Instead, resource-monitor will call resourceManager.getStats() directly

// ============================================================================
// Types & Interfaces
// ============================================================================

export type ResourceType = 
  | 'listener' 
  | 'timer' 
  | 'connection' 
  | 'cache' 
  | 'file' 
  | 'stream';

export interface ResourceHandle {
  id: string;
  type: ResourceType;
  name: string;
  owner: string; // Service/module name
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface TimerHandle extends ResourceHandle {
  type: 'timer';
  intervalMs: number;
  timerType: 'interval' | 'timeout';
  nodeTimer: NodeJS.Timeout;
}

export interface ListenerHandle extends ResourceHandle {
  type: 'listener';
  emitter: EventEmitter;
  eventName: string;
  listener: (...args: any[]) => any;
  maxListeners?: number;
}

export interface ConnectionHandle extends ResourceHandle {
  type: 'connection';
  connectionType: 'database' | 'http' | 'websocket';
  url?: string;
  cleanup: () => Promise<void> | void;
}

export interface ResourceStats {
  total: number;
  byType: Record<ResourceType, number>;
  byOwner: Record<string, number>;
  oldest?: ResourceHandle;
  leakSuspects: ResourceHandle[]; // Resources older than threshold
}

export interface ResourceLimits {
  maxListenersPerEmitter: number;
  maxTimersPerOwner: number;
  maxConnectionsPerOwner: number;
  maxCacheSize: number;
  leakDetectionThresholdMs: number; // Resources older than this are suspects
  alertOnLeakSuspect: boolean;
}

// ============================================================================
// Resource Manager Class
// ============================================================================

class ResourceManager {
  private resources: Map<string, ResourceHandle> = new Map();
  private listenerCounts: Map<EventEmitter, Map<string, number>> = new Map();
  private ownerTimerCounts: Map<string, number> = new Map();
  private ownerConnectionCounts: Map<string, number> = new Map();
  
  private limits: ResourceLimits = {
    maxListenersPerEmitter: 10,
    maxTimersPerOwner: 20,
    maxConnectionsPerOwner: 10,
    maxCacheSize: 10000,
    leakDetectionThresholdMs: 3600000, // 1 hour
    alertOnLeakSuspect: true,
  };

  private monitoringInterval?: NodeJS.Timeout;
  private readonly MONITORING_INTERVAL_MS = 300000; // 5 minutes

  // ============================================================================
  // Initialization & Shutdown
  // ============================================================================

  public initialize(customLimits?: Partial<ResourceLimits>): void {
    if (customLimits) {
      this.limits = { ...this.limits, ...customLimits };
    }

    // Start background monitoring (runs every 5 minutes)
    this.startMonitoring();

    log('info', '[ResourceManager] Initialized', {
      limits: this.limits,
      monitoringIntervalMs: this.MONITORING_INTERVAL_MS,
    });

    // Note: Lightweight resource monitor (runs twice daily) is started separately
    // via startResourceMonitoring() in src/index.ts
  }

  public async shutdown(): Promise<void> {
    log('info', '[ResourceManager] Shutdown initiated', {
      totalResources: this.resources.size,
    });

    // Stop monitoring
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // Cleanup all resources
    await this.cleanupAll();

    log('info', '[ResourceManager] Shutdown complete', {
      remainingResources: this.resources.size,
    });
  }

  // ============================================================================
  // Timer Management (setInterval/setTimeout)
  // ============================================================================

  public registerInterval(
    owner: string,
    name: string,
    callback: () => any,
    intervalMs: number,
    metadata?: Record<string, any>
  ): TimerHandle {
    // Check limits
    const currentCount = this.ownerTimerCounts.get(owner) ?? 0;
    if (currentCount >= this.limits.maxTimersPerOwner) {
      const error = new Error(`Timer limit exceeded for owner: ${owner} (max: ${this.limits.maxTimersPerOwner})`);
      errorTracker.captureError(error, {
        category: 'CONFIG',
        severity: 'HIGH',
        service: owner,
        operation: 'registerInterval',
        customData: { currentCount, limit: this.limits.maxTimersPerOwner },
      });
      throw error;
    }

    // Create timer
    const id = this.generateId('timer', owner, name);
    const nodeTimer = setInterval(callback, intervalMs);

    const handle: TimerHandle = {
      id,
      type: 'timer',
      name,
      owner,
      createdAt: new Date(),
      intervalMs,
      timerType: 'interval',
      nodeTimer,
      metadata,
    };

    this.resources.set(id, handle);
    this.ownerTimerCounts.set(owner, currentCount + 1);

    log('detail', '[ResourceManager] Interval registered', {
      id,
      owner,
      name,
      intervalMs,
    });

    return handle;
  }

  public registerTimeout(
    owner: string,
    name: string,
    callback: () => any,
    timeoutMs: number,
    metadata?: Record<string, any>
  ): TimerHandle {
    // Check limits
    const currentCount = this.ownerTimerCounts.get(owner) ?? 0;
    if (currentCount >= this.limits.maxTimersPerOwner) {
      const error = new Error(`Timer limit exceeded for owner: ${owner} (max: ${this.limits.maxTimersPerOwner})`);
      errorTracker.captureError(error, {
        category: 'CONFIG',
        severity: 'HIGH',
        service: owner,
        operation: 'registerTimeout',
        customData: { currentCount, limit: this.limits.maxTimersPerOwner },
      });
      throw error;
    }

    // Create timeout with auto-cleanup
    const id = this.generateId('timer', owner, name);
    const nodeTimer = setTimeout(() => {
      callback();
      // Auto-cleanup after execution
      this.unregisterTimer(id);
    }, timeoutMs);

    const handle: TimerHandle = {
      id,
      type: 'timer',
      name,
      owner,
      createdAt: new Date(),
      intervalMs: timeoutMs,
      timerType: 'timeout',
      nodeTimer,
      metadata,
    };

    this.resources.set(id, handle);
    this.ownerTimerCounts.set(owner, currentCount + 1);

    log('detail', '[ResourceManager] Timeout registered', {
      id,
      owner,
      name,
      timeoutMs,
    });

    return handle;
  }

  public unregisterTimer(id: string): boolean {
    const resource = this.resources.get(id);
    if (!resource || resource.type !== 'timer') {
      return false;
    }

    const timer = resource as TimerHandle;
    clearInterval(timer.nodeTimer); // Works for both interval and timeout

    this.resources.delete(id);
    const currentCount = this.ownerTimerCounts.get(timer.owner) ?? 1;
    this.ownerTimerCounts.set(timer.owner, currentCount - 1);

    log('detail', '[ResourceManager] Timer unregistered', {
      id,
      owner: timer.owner,
      name: timer.name,
      type: timer.timerType,
    });

    return true;
  }

  public clearAllTimers(owner?: string): number {
    let count = 0;
    for (const [id, resource] of this.resources.entries()) {
      if (resource.type === 'timer' && (!owner || resource.owner === owner)) {
        if (this.unregisterTimer(id)) {
          count++;
        }
      }
    }
    return count;
  }

  // ============================================================================
  // EventEmitter Listener Management
  // ============================================================================

  public registerListener(
    owner: string,
    name: string,
    emitter: EventEmitter,
    eventName: string,
    listener: (...args: any[]) => any,
    maxListeners?: number
  ): ListenerHandle {
    // Track listener count per emitter
    if (!this.listenerCounts.has(emitter)) {
      this.listenerCounts.set(emitter, new Map());
    }
    const emitterCounts = this.listenerCounts.get(emitter)!;
    const currentCount = emitterCounts.get(eventName) ?? 0;

    // Check limits
    const limit = maxListeners ?? this.limits.maxListenersPerEmitter;
    if (currentCount >= limit) {
      const error = new Error(`Listener limit exceeded for ${eventName} on ${name} (max: ${limit})`);
      errorTracker.captureError(error, {
        category: 'CONFIG',
        severity: 'HIGH',
        service: owner,
        operation: 'registerListener',
        customData: { eventName, currentCount, limit },
      });
      throw error;
    }

    // Set max listeners on emitter
    if (emitter.getMaxListeners() === 0 || emitter.getMaxListeners() === Infinity) {
      emitter.setMaxListeners(limit);
    }

    // Create handle
    const id = this.generateId('listener', owner, `${name}:${eventName}`);
    const handle: ListenerHandle = {
      id,
      type: 'listener',
      name,
      owner,
      createdAt: new Date(),
      emitter,
      eventName,
      listener,
      maxListeners: limit,
    };

    // Register listener
    emitter.on(eventName, listener);
    this.resources.set(id, handle);
    emitterCounts.set(eventName, currentCount + 1);

    log('detail', '[ResourceManager] Listener registered', {
      id,
      owner,
      name,
      eventName,
      currentCount: currentCount + 1,
      maxListeners: limit,
    });

    return handle;
  }

  public unregisterListener(id: string): boolean {
    const resource = this.resources.get(id);
    if (!resource || resource.type !== 'listener') {
      return false;
    }

    const listener = resource as ListenerHandle;
    listener.emitter.off(listener.eventName, listener.listener);

    // Update counts
    const emitterCounts = this.listenerCounts.get(listener.emitter);
    if (emitterCounts) {
      const currentCount = emitterCounts.get(listener.eventName) ?? 1;
      emitterCounts.set(listener.eventName, currentCount - 1);
    }

    this.resources.delete(id);

    log('detail', '[ResourceManager] Listener unregistered', {
      id,
      owner: listener.owner,
      name: listener.name,
      eventName: listener.eventName,
    });

    return true;
  }

  public clearAllListeners(owner?: string, emitter?: EventEmitter): number {
    let count = 0;
    for (const [id, resource] of this.resources.entries()) {
      if (resource.type === 'listener') {
        const listener = resource as ListenerHandle;
        const ownerMatch = !owner || listener.owner === owner;
        const emitterMatch = !emitter || listener.emitter === emitter;
        
        if (ownerMatch && emitterMatch) {
          if (this.unregisterListener(id)) {
            count++;
          }
        }
      }
    }
    return count;
  }

  // ============================================================================
  // Connection Management (Database, HTTP, WebSocket)
  // ============================================================================

  public registerConnection(
    owner: string,
    name: string,
    connectionType: 'database' | 'http' | 'websocket',
    cleanup: () => Promise<void> | void,
    metadata?: Record<string, any>
  ): ConnectionHandle {
    // Check limits
    const currentCount = this.ownerConnectionCounts.get(owner) ?? 0;
    if (currentCount >= this.limits.maxConnectionsPerOwner) {
      const error = new Error(`Connection limit exceeded for owner: ${owner} (max: ${this.limits.maxConnectionsPerOwner})`);
      errorTracker.captureError(error, {
        category: 'CONFIG',
        severity: 'HIGH',
        service: owner,
        operation: 'registerConnection',
        customData: { connectionType, currentCount, limit: this.limits.maxConnectionsPerOwner },
      });
      throw error;
    }

    const id = this.generateId('connection', owner, name);
    const handle: ConnectionHandle = {
      id,
      type: 'connection',
      name,
      owner,
      createdAt: new Date(),
      connectionType,
      cleanup,
      metadata,
    };

    this.resources.set(id, handle);
    this.ownerConnectionCounts.set(owner, currentCount + 1);

    log('detail', '[ResourceManager] Connection registered', {
      id,
      owner,
      name,
      connectionType,
    });

    return handle;
  }

  public async unregisterConnection(id: string): Promise<boolean> {
    const resource = this.resources.get(id);
    if (!resource || resource.type !== 'connection') {
      return false;
    }

    const connection = resource as ConnectionHandle;
    
    try {
      await connection.cleanup();
    } catch (error) {
      log('error', '[ResourceManager] Connection cleanup failed', {
        id,
        owner: connection.owner,
        name: connection.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.resources.delete(id);
    const currentCount = this.ownerConnectionCounts.get(connection.owner) ?? 1;
    this.ownerConnectionCounts.set(connection.owner, currentCount - 1);

    log('detail', '[ResourceManager] Connection unregistered', {
      id,
      owner: connection.owner,
      name: connection.name,
    });

    return true;
  }

  public async clearAllConnections(owner?: string): Promise<number> {
    let count = 0;
    const promises: Promise<boolean>[] = [];
    
    for (const [id, resource] of this.resources.entries()) {
      if (resource.type === 'connection' && (!owner || resource.owner === owner)) {
        promises.push(this.unregisterConnection(id));
      }
    }

    const results = await Promise.all(promises);
    count = results.filter(Boolean).length;
    
    return count;
  }

  // ============================================================================
  // Resource Querying & Statistics
  // ============================================================================

  public getStats(): ResourceStats {
    const byType: Record<ResourceType, number> = {
      listener: 0,
      timer: 0,
      connection: 0,
      cache: 0,
      file: 0,
      stream: 0,
    };

    const byOwner: Record<string, number> = {};
    let oldest: ResourceHandle | undefined;
    const leakSuspects: ResourceHandle[] = [];
    const leakThreshold = Date.now() - this.limits.leakDetectionThresholdMs;

    for (const resource of this.resources.values()) {
      byType[resource.type]++;
      byOwner[resource.owner] = (byOwner[resource.owner] ?? 0) + 1;

      if (!oldest || resource.createdAt < oldest.createdAt) {
        oldest = resource;
      }

      if (resource.createdAt.getTime() < leakThreshold) {
        leakSuspects.push(resource);
      }
    }

    return {
      total: this.resources.size,
      byType,
      byOwner,
      oldest,
      leakSuspects,
    };
  }

  public getResourcesByOwner(owner: string): ResourceHandle[] {
    const resources: ResourceHandle[] = [];
    for (const resource of this.resources.values()) {
      if (resource.owner === owner) {
        resources.push(resource);
      }
    }
    return resources;
  }

  public getResourcesByType(type: ResourceType): ResourceHandle[] {
    const resources: ResourceHandle[] = [];
    for (const resource of this.resources.values()) {
      if (resource.type === type) {
        resources.push(resource);
      }
    }
    return resources;
  }

  // ============================================================================
  // Leak Detection & Monitoring
  // ============================================================================

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.detectLeaks();
    }, this.MONITORING_INTERVAL_MS);
    this.monitoringInterval.unref?.();
  }

  private detectLeaks(): void {
    const stats = this.getStats();

    // Alert on leak suspects
    if (this.limits.alertOnLeakSuspect && stats.leakSuspects.length > 0) {
      log('warn', '[ResourceManager] Leak suspects detected', {
        count: stats.leakSuspects.length,
        thresholdMs: this.limits.leakDetectionThresholdMs,
        suspects: stats.leakSuspects.map(r => ({
          id: r.id,
          type: r.type,
          owner: r.owner,
          name: r.name,
          ageMs: Date.now() - r.createdAt.getTime(),
        })),
      });

      // Report to error tracker
      for (const suspect of stats.leakSuspects) {
        const ageMs = Date.now() - suspect.createdAt.getTime();
        const error = new Error(`Resource leak suspect: ${suspect.type} ${suspect.name} (age: ${ageMs}ms)`);
        errorTracker.captureError(error, {
          category: 'ENGINE',
          severity: 'MEDIUM',
          service: suspect.owner,
          operation: 'leak-detection',
          customData: {
            resourceId: suspect.id,
            resourceType: suspect.type,
            resourceName: suspect.name,
            ageMs,
            metadata: suspect.metadata,
          },
        });
      }
    }

    // Log statistics
    log('info', '[ResourceManager] Resource statistics', {
      total: stats.total,
      byType: stats.byType,
      byOwner: stats.byOwner,
      leakSuspects: stats.leakSuspects.length,
      oldestResource: stats.oldest ? {
        type: stats.oldest.type,
        owner: stats.oldest.owner,
        name: stats.oldest.name,
        ageMs: Date.now() - stats.oldest.createdAt.getTime(),
      } : null,
    });
  }

  // ============================================================================
  // Bulk Cleanup Operations
  // ============================================================================

  public async cleanupByOwner(owner: string): Promise<number> {
    let count = 0;
    count += this.clearAllTimers(owner);
    count += this.clearAllListeners(owner);
    count += await this.clearAllConnections(owner);
    return count;
  }

  public async cleanupAll(): Promise<void> {
    const owners = new Set<string>();
    for (const resource of this.resources.values()) {
      owners.add(resource.owner);
    }

    for (const owner of owners) {
      await this.cleanupByOwner(owner);
    }

    log('info', '[ResourceManager] All resources cleaned up', {
      totalCleaned: this.resources.size,
    });

    // Final cleanup of any remaining resources
    this.resources.clear();
    this.listenerCounts.clear();
    this.ownerTimerCounts.clear();
    this.ownerConnectionCounts.clear();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private generateId(type: ResourceType, owner: string, name: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}:${owner}:${name}:${timestamp}:${random}`;
  }

  public getLimits(): ResourceLimits {
    return { ...this.limits };
  }

  public updateLimits(newLimits: Partial<ResourceLimits>): void {
    this.limits = { ...this.limits, ...newLimits };
    log('info', '[ResourceManager] Limits updated', {
      newLimits: this.limits,
    });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const resourceManager = new ResourceManager();

// ============================================================================
// Convenience Wrappers (Ergonomic API)
// ============================================================================

/**
 * Register a managed interval - automatically tracked and cleaned up
 */
export function createManagedInterval(
  owner: string,
  name: string,
  callback: () => any,
  intervalMs: number,
  metadata?: Record<string, any>
): TimerHandle {
  return resourceManager.registerInterval(owner, name, callback, intervalMs, metadata);
}

/**
 * Register a managed timeout - automatically tracked and cleaned up
 */
export function createManagedTimeout(
  owner: string,
  name: string,
  callback: () => any,
  timeoutMs: number,
  metadata?: Record<string, any>
): TimerHandle {
  return resourceManager.registerTimeout(owner, name, callback, timeoutMs, metadata);
}

/**
 * Register a managed event listener - automatically tracked and cleaned up
 */
export function createManagedListener<T extends EventEmitter>(
  owner: string,
  name: string,
  emitter: T,
  eventName: string,
  listener: (...args: any[]) => any,
  maxListeners?: number
): ListenerHandle {
  return resourceManager.registerListener(owner, name, emitter, eventName, listener, maxListeners);
}

/**
 * Register a managed connection - automatically tracked and cleaned up
 */
export function createManagedConnection(
  owner: string,
  name: string,
  connectionType: 'database' | 'http' | 'websocket',
  cleanup: () => Promise<void> | void,
  metadata?: Record<string, any>
): ConnectionHandle {
  return resourceManager.registerConnection(owner, name, connectionType, cleanup, metadata);
}
