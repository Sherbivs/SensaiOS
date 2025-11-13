/**
 * Memory Guardian — Active Memory Protection System
 * 
 * Prevents OOM crashes through proactive monitoring and emergency pruning:
 * - Polls Node.js process.memoryUsage() every 30 seconds
 * - Enforces hard memory limits with graduated responses
 * - Triggers emergency cache pruning before reaching 512MB limit
 * - Broadcasts memory pressure events to all registered caches
 * - Integrates with ResourceManager for coordinated cleanup
 * 
 * Memory Levels (Render Starter Plan: 512 MB):
 * - NORMAL: <384MB (75%) - All systems operational
 * - WARNING: 384-434MB (75-85%) - Monitor closely, preemptive pruning
 * - CRITICAL: 435-459MB (85-90%) - Aggressive pruning, defer non-critical ops
 * - EMERGENCY: 460-511MB (90-99%) - Nuclear pruning, all caches to minimum
 * - OOM: 512MB+ (100%) - Process will be killed by Render
 * 
 * @module services/memory-guardian
 */

import { EventEmitter } from 'node:events';
import { log } from '../utils/logger.js';
import { errorTracker } from './error-tracker.js';
import { resourceManager } from './resource-manager.js';

// ============================================================================
// Configuration & Thresholds
// ============================================================================

/** Memory thresholds aligned with Render Starter plan (512 MB limit) */
export const MEMORY_LIMITS = {
  /** Hard limit enforced by Render */
  RENDER_LIMIT_MB: 512,
  
  /** EMERGENCY: 90% - Nuclear pruning, all caches to minimum */
  EMERGENCY_MB: 460,
  
  /** CRITICAL: 85% - Aggressive pruning, defer non-critical ops */
  CRITICAL_MB: 435,
  
  /** WARNING: 75% - Monitor closely, preemptive pruning */
  WARNING_MB: 384,
  
  /** NORMAL: 60-75% - Target operational range */
  OPTIMAL_MIN_MB: 307,
  OPTIMAL_MAX_MB: 384,
  
  /** Polling interval for memory checks */
  POLL_INTERVAL_MS: 30000, // 30 seconds
  
  /** GC trigger cooldown (prevent GC spam) */
  GC_COOLDOWN_MS: 60000, // 1 minute between forced GC
  
  /** Emergency prune cooldown (prevent prune spam) */
  PRUNE_COOLDOWN_MS: 120000, // 2 minutes between emergency prunes
};

/** Memory pressure levels */
export type MemoryPressureLevel = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';

/** Memory pressure event payload */
export interface MemoryPressureEvent {
  level: MemoryPressureLevel;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  percentUsed: number;
  timestamp: Date;
  action: 'monitor' | 'prune' | 'aggressive_prune' | 'emergency_prune';
}

/** Memory statistics snapshot */
export interface MemorySnapshot {
  timestamp: Date;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  percentUsed: number;
  pressureLevel: MemoryPressureLevel;
}

/** Prunable cache interface (all caches must implement this) */
export interface IPrunableCache {
  /** Cache identifier for logging */
  name: string;
  
  /** Current memory footprint estimate in bytes */
  getMemoryUsage(): number;
  
  /** Prune to target size (normal pressure response) */
  prune(targetSizePercent: number): Promise<{ itemsRemoved: number; bytesFreed: number }>;
  
  /** Emergency prune to minimum viable size */
  emergencyPrune(): Promise<{ itemsRemoved: number; bytesFreed: number }>;
}

// ============================================================================
// Memory Guardian Class
// ============================================================================

export class MemoryGuardian extends EventEmitter {
  private pollingInterval?: NodeJS.Timeout;
  private isRunning = false;
  
  // Registered caches for coordinated pruning
  private registeredCaches = new Map<string, IPrunableCache>();
  
  // State tracking
  private currentPressureLevel: MemoryPressureLevel = 'NORMAL';
  private lastGcTime = 0;
  private lastPruneTime = 0;
  private consecutiveHighPressure = 0;
  
  // Statistics
  private snapshots: MemorySnapshot[] = [];
  private totalPrunesTriggered = 0;
  private totalBytesFreed = 0;
  private totalGcTriggered = 0;
  
  // ============================================================================
  // Initialization & Lifecycle
  // ============================================================================
  
  /**
   * Start active memory monitoring and protection
   */
  public start(): void {
    if (this.isRunning) {
      log('warn', 'memory-guardian: Already running, ignoring start request');
      return;
    }
    
    this.isRunning = true;
    
    // Take initial snapshot
    this.checkMemoryAndAct();
    
    // Start polling
    this.pollingInterval = setInterval(() => {
      this.checkMemoryAndAct();
    }, MEMORY_LIMITS.POLL_INTERVAL_MS);
    
    // Register with ResourceManager as a timer
    if (resourceManager) {
      try {
        resourceManager.registerInterval(
          'memory-guardian',
          'memory-poll',
          () => this.checkMemoryAndAct(),
          MEMORY_LIMITS.POLL_INTERVAL_MS,
          { critical: true }
        );
      } catch (error) {
        log('warn', 'memory-guardian: Failed to register with ResourceManager', error);
      }
    }
    
    log('info', 'memory-guardian: Started active memory protection', {
      pollIntervalMs: MEMORY_LIMITS.POLL_INTERVAL_MS,
      limits: {
        normal: `<${MEMORY_LIMITS.OPTIMAL_MAX_MB}MB`,
        warning: `${MEMORY_LIMITS.WARNING_MB}-${MEMORY_LIMITS.CRITICAL_MB}MB`,
        critical: `${MEMORY_LIMITS.CRITICAL_MB}-${MEMORY_LIMITS.EMERGENCY_MB}MB`,
        emergency: `${MEMORY_LIMITS.EMERGENCY_MB}-${MEMORY_LIMITS.RENDER_LIMIT_MB}MB`,
      },
    });
  }
  
  /**
   * Stop memory monitoring
   */
  public stop(): void {
    if (!this.isRunning) return;
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    
    this.isRunning = false;
    
    log('info', 'memory-guardian: Stopped', {
      totalPrunesTriggered: this.totalPrunesTriggered,
      totalBytesFreed: (this.totalBytesFreed / 1024 / 1024).toFixed(2) + ' MB',
      totalGcTriggered: this.totalGcTriggered,
    });
  }
  
  // ============================================================================
  // Cache Registration
  // ============================================================================
  
  /**
   * Register a prunable cache for coordinated memory management
   */
  public registerCache(cache: IPrunableCache): void {
    if (this.registeredCaches.has(cache.name)) {
      log('warn', 'memory-guardian: Cache already registered', { cacheName: cache.name });
      return;
    }
    
    this.registeredCaches.set(cache.name, cache);
    
    log('info', 'memory-guardian: Cache registered', {
      cacheName: cache.name,
      initialMemoryMB: (cache.getMemoryUsage() / 1024 / 1024).toFixed(2),
      totalCaches: this.registeredCaches.size,
    });
  }
  
  /**
   * Unregister a cache
   */
  public unregisterCache(cacheName: string): void {
    this.registeredCaches.delete(cacheName);
    
    log('info', 'memory-guardian: Cache unregistered', {
      cacheName,
      remainingCaches: this.registeredCaches.size,
    });
  }
  
  // ============================================================================
  // Memory Monitoring & Response
  // ============================================================================
  
  /**
   * Check current memory usage and take appropriate action
   */
  private checkMemoryAndAct(): void {
    const snapshot = this.captureMemorySnapshot();
    this.snapshots.push(snapshot);
    
    // Keep only last 100 snapshots (50 minutes of history)
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-100);
    }
    
    // Determine pressure level and action
    const previousLevel = this.currentPressureLevel;
    this.currentPressureLevel = snapshot.pressureLevel;
    
    // Track consecutive high pressure periods
    if (snapshot.pressureLevel !== 'NORMAL') {
      this.consecutiveHighPressure++;
    } else {
      this.consecutiveHighPressure = 0;
    }
    
    // Log level changes
    if (previousLevel !== this.currentPressureLevel) {
      log('warn', 'memory-guardian: Pressure level changed', {
        from: previousLevel,
        to: this.currentPressureLevel,
        heapUsedMB: snapshot.heapUsedMB.toFixed(2),
        percentUsed: snapshot.percentUsed.toFixed(1) + '%',
      });
    }
    
    // Take action based on pressure level
    switch (this.currentPressureLevel) {
      case 'EMERGENCY':
        this.handleEmergencyPressure(snapshot);
        break;
      case 'CRITICAL':
        this.handleCriticalPressure(snapshot);
        break;
      case 'WARNING':
        this.handleWarningPressure(snapshot);
        break;
      case 'NORMAL':
        this.handleNormalPressure(snapshot);
        break;
    }
    
    // Emit pressure event for subscribers
    const event: MemoryPressureEvent = {
      level: snapshot.pressureLevel,
      heapUsedMB: snapshot.heapUsedMB,
      heapTotalMB: snapshot.heapTotalMB,
      rssMB: snapshot.rssMB,
      externalMB: snapshot.externalMB,
      percentUsed: snapshot.percentUsed,
      timestamp: snapshot.timestamp,
      action: this.getActionForLevel(snapshot.pressureLevel),
    };
    
    this.emit('pressure', event);
  }
  
  /**
   * Capture current memory usage snapshot
   */
  private captureMemorySnapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const rssMB = memUsage.rss / 1024 / 1024;
    const externalMB = memUsage.external / 1024 / 1024;
    
    // Calculate percent used (based on RSS vs Render limit)
    const percentUsed = (rssMB / MEMORY_LIMITS.RENDER_LIMIT_MB) * 100;
    
    // Determine pressure level
    const pressureLevel = this.calculatePressureLevel(rssMB);
    
    return {
      timestamp: new Date(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      heapUsedMB,
      heapTotalMB,
      rssMB,
      externalMB,
      percentUsed,
      pressureLevel,
    };
  }
  
  /**
   * Calculate pressure level based on RSS usage
   */
  private calculatePressureLevel(rssMB: number): MemoryPressureLevel {
    if (rssMB >= MEMORY_LIMITS.EMERGENCY_MB) return 'EMERGENCY';
    if (rssMB >= MEMORY_LIMITS.CRITICAL_MB) return 'CRITICAL';
    if (rssMB >= MEMORY_LIMITS.WARNING_MB) return 'WARNING';
    return 'NORMAL';
  }
  
  /**
   * Get recommended action for pressure level
   */
  private getActionForLevel(level: MemoryPressureLevel): MemoryPressureEvent['action'] {
    switch (level) {
      case 'EMERGENCY': return 'emergency_prune';
      case 'CRITICAL': return 'aggressive_prune';
      case 'WARNING': return 'prune';
      case 'NORMAL': return 'monitor';
    }
  }
  
  // ============================================================================
  // Pressure Response Handlers
  // ============================================================================
  
  /**
   * EMERGENCY: 90%+ - Nuclear pruning, all caches to minimum
   */
  private async handleEmergencyPressure(snapshot: MemorySnapshot): Promise<void> {
    log('error', 'memory-guardian: EMERGENCY PRESSURE - Initiating nuclear pruning', {
      rssMB: snapshot.rssMB.toFixed(2),
      percentUsed: snapshot.percentUsed.toFixed(1) + '%',
      limitMB: MEMORY_LIMITS.RENDER_LIMIT_MB,
      remainingMB: (MEMORY_LIMITS.RENDER_LIMIT_MB - snapshot.rssMB).toFixed(2),
    });
    
    // Check prune cooldown
    const now = Date.now();
    if (now - this.lastPruneTime < MEMORY_LIMITS.PRUNE_COOLDOWN_MS) {
      log('warn', 'memory-guardian: Emergency prune on cooldown, skipping');
      return;
    }
    
    this.lastPruneTime = now;
    this.totalPrunesTriggered++;
    
    // Emergency prune all registered caches
    const results = await Promise.allSettled(
      Array.from(this.registeredCaches.values()).map(cache => cache.emergencyPrune())
    );
    
    let totalItemsRemoved = 0;
    let totalBytesFreed = 0;
    
    results.forEach((result, index) => {
      const cache = Array.from(this.registeredCaches.values())[index];
      
      if (result.status === 'fulfilled') {
        totalItemsRemoved += result.value.itemsRemoved;
        totalBytesFreed += result.value.bytesFreed;
        
        log('info', 'memory-guardian: Cache emergency pruned', {
          cacheName: cache.name,
          itemsRemoved: result.value.itemsRemoved,
          bytesFreedMB: (result.value.bytesFreed / 1024 / 1024).toFixed(2),
        });
      } else {
        log('error', 'memory-guardian: Cache emergency prune failed', {
          cacheName: cache.name,
          error: result.reason,
        });
      }
    });
    
    this.totalBytesFreed += totalBytesFreed;
    
    // Force GC
    this.forceGarbageCollection();
    
    log('warn', 'memory-guardian: Emergency prune complete', {
      cachesPruned: this.registeredCaches.size,
      totalItemsRemoved,
      totalBytesFreedMB: (totalBytesFreed / 1024 / 1024).toFixed(2),
    });
    
    // Capture error for tracking
    await errorTracker.captureError(
      new Error('Emergency memory pressure triggered nuclear cache pruning'),
      {
        category: 'CACHE',
        severity: 'CRITICAL',
        customData: {
          rssMB: snapshot.rssMB,
          percentUsed: snapshot.percentUsed,
          bytesFreedMB: (totalBytesFreed / 1024 / 1024).toFixed(2),
        },
      }
    );
  }
  
  /**
   * CRITICAL: 85-90% - Aggressive pruning, defer non-critical ops
   */
  private async handleCriticalPressure(snapshot: MemorySnapshot): Promise<void> {
    log('warn', 'memory-guardian: CRITICAL PRESSURE - Aggressive pruning', {
      rssMB: snapshot.rssMB.toFixed(2),
      percentUsed: snapshot.percentUsed.toFixed(1) + '%',
    });
    
    // Check prune cooldown
    const now = Date.now();
    if (now - this.lastPruneTime < MEMORY_LIMITS.PRUNE_COOLDOWN_MS) {
      return;
    }
    
    this.lastPruneTime = now;
    this.totalPrunesTriggered++;
    
    // Prune all caches to 40% of max capacity (aggressive)
    const results = await Promise.allSettled(
      Array.from(this.registeredCaches.values()).map(cache => cache.prune(40))
    );
    
    let totalBytesFreed = 0;
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        totalBytesFreed += result.value.bytesFreed;
      }
    });
    
    this.totalBytesFreed += totalBytesFreed;
    
    // Force GC
    this.forceGarbageCollection();
    
    log('info', 'memory-guardian: Critical prune complete', {
      bytesFreedMB: (totalBytesFreed / 1024 / 1024).toFixed(2),
    });
  }
  
  /**
   * WARNING: 75-85% - Preemptive pruning
   */
  private async handleWarningPressure(snapshot: MemorySnapshot): Promise<void> {
    // Only log on pressure level change or every 5 checks
    if (this.consecutiveHighPressure === 1 || this.consecutiveHighPressure % 5 === 0) {
      log('info', 'memory-guardian: WARNING PRESSURE - Preemptive pruning', {
        rssMB: snapshot.rssMB.toFixed(2),
        percentUsed: snapshot.percentUsed.toFixed(1) + '%',
        consecutiveChecks: this.consecutiveHighPressure,
      });
    }
    
    // Check prune cooldown
    const now = Date.now();
    if (now - this.lastPruneTime < MEMORY_LIMITS.PRUNE_COOLDOWN_MS) {
      return;
    }
    
    this.lastPruneTime = now;
    this.totalPrunesTriggered++;
    
    // Prune all caches to 60% of max capacity (gentle)
    const results = await Promise.allSettled(
      Array.from(this.registeredCaches.values()).map(cache => cache.prune(60))
    );
    
    let totalBytesFreed = 0;
    
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        totalBytesFreed += result.value.bytesFreed;
      }
    });
    
    this.totalBytesFreed += totalBytesFreed;
    
    // Suggest GC (let V8 decide timing)
    this.forceGarbageCollection();
  }
  
  /**
   * NORMAL: <75% - All systems operational
   */
  private handleNormalPressure(snapshot: MemorySnapshot): void {
    // Only log every 10 checks when normal
    if (this.snapshots.length % 10 === 0) {
      log('detail', 'memory-guardian: Normal pressure', {
        rssMB: snapshot.rssMB.toFixed(2),
        percentUsed: snapshot.percentUsed.toFixed(1) + '%',
      });
    }
  }
  
  // ============================================================================
  // Garbage Collection
  // ============================================================================
  
  /**
   * Force garbage collection (requires --expose-gc flag)
   */
  private forceGarbageCollection(): void {
    // Check cooldown
    const now = Date.now();
    if (now - this.lastGcTime < MEMORY_LIMITS.GC_COOLDOWN_MS) {
      return;
    }
    
    if (global.gc) {
      try {
        this.lastGcTime = now;
        this.totalGcTriggered++;
        
        const before = process.memoryUsage().heapUsed;
        global.gc();
        const after = process.memoryUsage().heapUsed;
        
        const freedMB = (before - after) / 1024 / 1024;
        
        log('info', 'memory-guardian: Forced garbage collection', {
          freedMB: freedMB.toFixed(2),
          heapBeforeMB: (before / 1024 / 1024).toFixed(2),
          heapAfterMB: (after / 1024 / 1024).toFixed(2),
        });
      } catch (error) {
        log('error', 'memory-guardian: GC failed', error);
      }
    }
  }
  
  // ============================================================================
  // Statistics & Reporting
  // ============================================================================
  
  /**
   * Get current memory statistics
   */
  public getStats(): {
    currentSnapshot: MemorySnapshot;
    pressureLevel: MemoryPressureLevel;
    registeredCaches: number;
    totalPrunesTriggered: number;
    totalBytesFreedMB: number;
    totalGcTriggered: number;
    isRunning: boolean;
  } {
    const currentSnapshot = this.snapshots[this.snapshots.length - 1] ?? this.captureMemorySnapshot();
    
    return {
      currentSnapshot,
      pressureLevel: this.currentPressureLevel,
      registeredCaches: this.registeredCaches.size,
      totalPrunesTriggered: this.totalPrunesTriggered,
      totalBytesFreedMB: this.totalBytesFreed / 1024 / 1024,
      totalGcTriggered: this.totalGcTriggered,
      isRunning: this.isRunning,
    };
  }
  
  /**
   * Get memory history snapshots
   */
  public getHistory(): MemorySnapshot[] {
    return [...this.snapshots];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const memoryGuardian = new MemoryGuardian();
