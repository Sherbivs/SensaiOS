/**
 * Centralized Resource Request System
 * 
 * All resource requests must flow through this system to ensure:
 * - Plan capacity validation (512 MB memory budget)
 * - Resource quota enforcement
 * - Optimal utilization monitoring
 * - Automatic tracking and cleanup
 * 
 * Integration: Resource Manager + Resource Monitor
 * Created: 2025-11-11
 * See: docs/deployment/RESOURCE-MONITOR-STANDARDS.md
 */

import { resourceManager } from './resource-manager.js';
import logger from '../utils/intelligent-logger.js';
import type { 
  ResourceType, 
  TimerHandle, 
  ListenerHandle, 
  ConnectionHandle 
} from './resource-manager.js';
import type { EventEmitter } from 'node:events';

// ============================================================================
// Configuration - Aligned with 512 MB Starter Plan
// ============================================================================

interface ResourceBudget {
  // Memory budgets (based on 512 MB plan, 60-70% target = 307-358 MB)
  totalMemoryBudgetMB: number;
  engineCacheMB: number;
  runtimeCacheMB: number;
  writeBufferMB: number;
  systemOverheadMB: number;
  availableForResourcesMB: number;
  
  // Resource count quotas
  maxTimersTotal: number;
  maxListenersTotal: number;
  maxConnectionsTotal: number;
  
  // Per-owner quotas
  maxTimersPerOwner: number;
  maxListenersPerOwner: number;
  maxConnectionsPerOwner: number;
}

const RESOURCE_BUDGET: ResourceBudget = {
  // Memory allocation (total: 307 MB target = 60% of 512 MB)
  totalMemoryBudgetMB: 307,
  engineCacheMB: 60,           // Engine L1 Cache (increased from 20 MB)
  runtimeCacheMB: 50,          // Runtime Cache (increased from 16 MB)
  writeBufferMB: 25,           // Write Buffer (increased from 10 MB)
  systemOverheadMB: 72,        // Node.js + V8 + Discord.js overhead
  availableForResourcesMB: 100, // Remaining for resources (307 - 207 = 100 MB)
  
  // Resource count quotas (aligned with increased limits)
  maxTimersTotal: 150,          // System-wide timer limit
  maxListenersTotal: 150,       // System-wide listener limit
  maxConnectionsTotal: 50,      // System-wide connection limit
  
  // Per-owner quotas (from resource-manager defaults)
  maxTimersPerOwner: 20,
  maxListenersPerOwner: 30,     // Increased from 10 for high-traffic services
  maxConnectionsPerOwner: 10,
};

// ============================================================================
// Request Types
// ============================================================================

interface ResourceRequest {
  type: ResourceType;
  owner: string;
  name: string;
  estimatedMemoryMB?: number;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  metadata?: Record<string, any>;
}

interface TimerRequest extends ResourceRequest {
  type: 'timer';
  callback: () => any;
  intervalMs: number;
  timerType: 'interval' | 'timeout';
}

interface ListenerRequest extends ResourceRequest {
  type: 'listener';
  emitter: EventEmitter;
  eventName: string;
  listener: (...args: any[]) => any;
  maxListeners?: number;
}

interface ConnectionRequest extends ResourceRequest {
  type: 'connection';
  connectionType: 'database' | 'http' | 'websocket';
  cleanup: () => Promise<void> | void;
  url?: string;
}

interface RequestValidationResult {
  approved: boolean;
  reason?: string;
  suggestedAction?: string;
  currentUtilization: {
    memory: { current: number; budget: number; percent: number };
    timers: { current: number; quota: number; percent: number };
    listeners: { current: number; quota: number; percent: number };
    connections: { current: number; quota: number; percent: number };
  };
}

// ============================================================================
// Centralized Resource Request Handler
// ============================================================================

class ResourceRequestHandler {
  private requestCount = 0;
  private approvedCount = 0;
  private rejectedCount = 0;

  // ============================================================================
  // Request Validation
  // ============================================================================

  private validateRequest(request: ResourceRequest): RequestValidationResult {
    const stats = resourceManager.getStats();
    const memoryUsage = process.memoryUsage();
    const memoryRssMB = memoryUsage.rss / (1024 * 1024);
    const memoryPercent = (memoryRssMB / 512) * 100;

    // Calculate current resource counts by type
    const timerCount = stats.byType.timer || 0;
    const listenerCount = stats.byType.listener || 0;
    const connectionCount = stats.byType.connection || 0;

    // Build utilization summary
    const utilization = {
      memory: {
        current: memoryRssMB,
        budget: RESOURCE_BUDGET.totalMemoryBudgetMB,
        percent: memoryPercent,
      },
      timers: {
        current: timerCount,
        quota: RESOURCE_BUDGET.maxTimersTotal,
        percent: (timerCount / RESOURCE_BUDGET.maxTimersTotal) * 100,
      },
      listeners: {
        current: listenerCount,
        quota: RESOURCE_BUDGET.maxListenersTotal,
        percent: (listenerCount / RESOURCE_BUDGET.maxListenersTotal) * 100,
      },
      connections: {
        current: connectionCount,
        quota: RESOURCE_BUDGET.maxConnectionsTotal,
        percent: (connectionCount / RESOURCE_BUDGET.maxConnectionsTotal) * 100,
      },
    };

    // Validation Rule 1: Memory budget (critical - 85% threshold)
    if (memoryRssMB >= 435) { // 85% of 512 MB
      return {
        approved: false,
        reason: `Memory critical: ${memoryRssMB.toFixed(1)} MB / 512 MB (${memoryPercent.toFixed(1)}%). No capacity for new resources.`,
        suggestedAction: 'Scale to Standard plan (2 GB) or reduce cache sizes.',
        currentUtilization: utilization,
      };
    }

    // Validation Rule 2: Memory warning (75% threshold - warn but allow)
    if (memoryRssMB >= 384 && request.priority !== 'critical') {
      logger.warn('[ResourceRequest] Memory approaching limit', {
        category: 'ALERT',
        data: {
          memoryMB: memoryRssMB,
          requestType: request.type,
          requestOwner: request.owner,
          requestName: request.name,
        },
      });
    }

    // Validation Rule 3: Resource type quotas
    switch (request.type) {
      case 'timer':
        if (timerCount >= RESOURCE_BUDGET.maxTimersTotal) {
          return {
            approved: false,
            reason: `Timer quota exceeded: ${timerCount} / ${RESOURCE_BUDGET.maxTimersTotal}`,
            suggestedAction: 'Review and cleanup unused timers.',
            currentUtilization: utilization,
          };
        }
        break;

      case 'listener':
        if (listenerCount >= RESOURCE_BUDGET.maxListenersTotal) {
          return {
            approved: false,
            reason: `Listener quota exceeded: ${listenerCount} / ${RESOURCE_BUDGET.maxListenersTotal}`,
            suggestedAction: 'Check for listener leaks or increase quota.',
            currentUtilization: utilization,
          };
        }
        break;

      case 'connection':
        if (connectionCount >= RESOURCE_BUDGET.maxConnectionsTotal) {
          return {
            approved: false,
            reason: `Connection quota exceeded: ${connectionCount} / ${RESOURCE_BUDGET.maxConnectionsTotal}`,
            suggestedAction: 'Close idle connections or increase pool size.',
            currentUtilization: utilization,
          };
        }
        break;
    }

    // Validation Rule 4: Per-owner quotas
    const ownerTimers = Array.from(resourceManager.getResourcesByOwner(request.owner))
      .filter(r => r.type === 'timer').length;
    const ownerListeners = Array.from(resourceManager.getResourcesByOwner(request.owner))
      .filter(r => r.type === 'listener').length;
    const ownerConnections = Array.from(resourceManager.getResourcesByOwner(request.owner))
      .filter(r => r.type === 'connection').length;

    if (request.type === 'timer' && ownerTimers >= RESOURCE_BUDGET.maxTimersPerOwner) {
      return {
        approved: false,
        reason: `Owner '${request.owner}' timer quota exceeded: ${ownerTimers} / ${RESOURCE_BUDGET.maxTimersPerOwner}`,
        suggestedAction: `Review ${request.owner} timers and cleanup unused ones.`,
        currentUtilization: utilization,
      };
    }

    if (request.type === 'listener' && ownerListeners >= RESOURCE_BUDGET.maxListenersPerOwner) {
      return {
        approved: false,
        reason: `Owner '${request.owner}' listener quota exceeded: ${ownerListeners} / ${RESOURCE_BUDGET.maxListenersPerOwner}`,
        suggestedAction: `Check ${request.owner} for listener leaks.`,
        currentUtilization: utilization,
      };
    }

    if (request.type === 'connection' && ownerConnections >= RESOURCE_BUDGET.maxConnectionsPerOwner) {
      return {
        approved: false,
        reason: `Owner '${request.owner}' connection quota exceeded: ${ownerConnections} / ${RESOURCE_BUDGET.maxConnectionsPerOwner}`,
        suggestedAction: `Close idle ${request.owner} connections.`,
        currentUtilization: utilization,
      };
    }

    // Request approved
    return {
      approved: true,
      currentUtilization: utilization,
    };
  }

  // ============================================================================
  // Resource Request Handlers
  // ============================================================================

  public requestTimer(
    owner: string,
    name: string,
    callback: () => any,
    intervalMs: number,
    timerType: 'interval' | 'timeout',
    priority: 'critical' | 'high' | 'normal' | 'low' = 'normal',
    metadata?: Record<string, any>
  ): TimerHandle {
    this.requestCount++;

    const request: TimerRequest = {
      type: 'timer',
      owner,
      name,
      callback,
      intervalMs,
      timerType,
      priority,
      estimatedMemoryMB: 0.001, // ~1 KB per timer
      metadata,
    };

    const validation = this.validateRequest(request);

    if (!validation.approved) {
      this.rejectedCount++;
      logger.error('[ResourceRequest] Timer request REJECTED', new Error(validation.reason!), {
        category: 'SYSTEM',
        data: {
          owner,
          name,
          reason: validation.reason,
          suggestedAction: validation.suggestedAction,
          utilization: validation.currentUtilization,
        },
      });
      throw new Error(`Timer request rejected: ${validation.reason}`);
    }

    this.approvedCount++;

    // Route to resource manager
    if (timerType === 'interval') {
      return resourceManager.registerInterval(owner, name, callback, intervalMs, metadata);
    } else {
      return resourceManager.registerTimeout(owner, name, callback, intervalMs, metadata);
    }
  }

  public requestListener(
    owner: string,
    name: string,
    emitter: EventEmitter,
    eventName: string,
    listener: (...args: any[]) => any,
    maxListeners?: number,
    priority: 'critical' | 'high' | 'normal' | 'low' = 'normal',
    metadata?: Record<string, any>
  ): ListenerHandle {
    this.requestCount++;

    const request: ListenerRequest = {
      type: 'listener',
      owner,
      name,
      emitter,
      eventName,
      listener,
      maxListeners,
      priority,
      estimatedMemoryMB: 0.002, // ~2 KB per listener (closure + context)
      metadata,
    };

    const validation = this.validateRequest(request);

    if (!validation.approved) {
      this.rejectedCount++;
      logger.error('[ResourceRequest] Listener request REJECTED', new Error(validation.reason!), {
        category: 'SYSTEM',
        data: {
          owner,
          name,
          eventName,
          reason: validation.reason,
          suggestedAction: validation.suggestedAction,
          utilization: validation.currentUtilization,
        },
      });
      throw new Error(`Listener request rejected: ${validation.reason}`);
    }

    this.approvedCount++;

    // Route to resource manager
    return resourceManager.registerListener(owner, name, emitter, eventName, listener, maxListeners);
  }

  public requestConnection(
    owner: string,
    name: string,
    connectionType: 'database' | 'http' | 'websocket',
    cleanup: () => Promise<void> | void,
    url?: string,
    priority: 'critical' | 'high' | 'normal' | 'low' = 'normal',
    metadata?: Record<string, any>
  ): ConnectionHandle {
    this.requestCount++;

    const request: ConnectionRequest = {
      type: 'connection',
      owner,
      name,
      connectionType,
      cleanup,
      url,
      priority,
      estimatedMemoryMB: connectionType === 'database' ? 5 : 1, // DB connections ~5 MB, HTTP ~1 MB
      metadata,
    };

    const validation = this.validateRequest(request);

    if (!validation.approved) {
      this.rejectedCount++;
      logger.error('[ResourceRequest] Connection request REJECTED', new Error(validation.reason!), {
        category: 'SYSTEM',
        data: {
          owner,
          name,
          connectionType,
          url,
          reason: validation.reason,
          suggestedAction: validation.suggestedAction,
          utilization: validation.currentUtilization,
        },
      });
      throw new Error(`Connection request rejected: ${validation.reason}`);
    }

    this.approvedCount++;

    // Route to resource manager
    return resourceManager.registerConnection(owner, name, connectionType, cleanup, metadata);
  }

  // ============================================================================
  // Statistics & Monitoring
  // ============================================================================

  public getStats() {
    return {
      requests: {
        total: this.requestCount,
        approved: this.approvedCount,
        rejected: this.rejectedCount,
        approvalRate: this.requestCount > 0 
          ? ((this.approvedCount / this.requestCount) * 100).toFixed(1) + '%'
          : '100%',
      },
      budget: RESOURCE_BUDGET,
      currentUtilization: this.validateRequest({
        type: 'timer',
        owner: 'system',
        name: 'stats-check',
        priority: 'low',
      }).currentUtilization,
    };
  }

  public getBudget(): ResourceBudget {
    return { ...RESOURCE_BUDGET };
  }

  public updateBudget(newBudget: Partial<ResourceBudget>): void {
    Object.assign(RESOURCE_BUDGET, newBudget);
    logger.info('[ResourceRequest] Budget updated', {
      category: 'SYSTEM',
      data: { newBudget: RESOURCE_BUDGET },
    });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================
