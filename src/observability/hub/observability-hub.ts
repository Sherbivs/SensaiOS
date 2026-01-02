/**
 * Observability Hub
 * =================
 *
 * Central intermediary between event sources and observability backends.
 * This is the "service manager" of the Observability Layer where backends
 * install themselves to receive events.
 *
 * Two Ingestion Paths:
 * 1. Event Bus Subscription — Hub subscribes to '**' (all events) and forwards
 * 2. Direct Ingestion — Sources call hub.ingest() directly (e.g., Security Bot)
 *
 * The Hub converts incoming events to a standardized format and fans out to
 * all registered backends (Loki, Prometheus, Datadog, etc.).
 *
 * Isolation Guarantees:
 * - Hub errors never propagate to Event Bus
 * - Hub failure doesn't affect main application
 * - Each backend handles its own errors independently
 *
 * @module observability/hub/observability-hub
 * @since 2025-12-20
 */

// KERNEL DIRECT — Observability Layer is a peer to Application Layer
// Both layers import directly from kernel as siblings
import {
  createObservabilityHook,
  type ObservabilityHook,
} from '../../kernel/kernel-hooks.js';

import { EventBus, type BusEvent, type SubscriptionId } from '../../shared/event-bus.js';
import { OBSERVABILITY_CONFIG } from './observability-config.js';
import { lokiTransport } from '../../shared/logging/loki-transport.js';
import type {
  ObservabilityEvent,
  ObservabilityLevel,
  IObservabilityBackend,
  HubStatus,
} from './observability-types.js';
import { scopedLogger } from '../envelope/console.js';

// ==================== KERNEL INTEGRATION ====================

/** Scoped logger for ObservabilityHub */
const log = scopedLogger('observability-hub');

/** Lazy-initialized kernel hook for observability hub */
let kernelHook: ObservabilityHook | null = null;

/**
 * Get or create kernel hook for observability hub observability.
 * Uses lazy initialization to avoid startup dependencies.
 */
function getHubKernelHook(): ObservabilityHook | null {
  if (!kernelHook) {
    try {
      kernelHook = createObservabilityHook('observability-hub');
    } catch {
      // Kernel not available, silently skip
    }
  }
  return kernelHook;
}

/**
 * Forward a log entry directly to Loki (bypasses logger to avoid circular dep)
 */
function forwardToLoki(level: string, message: string, data?: Record<string, unknown>): void {
  try {
    lokiTransport.push({
      level,
      message,
      timestamp: new Date().toISOString(),
      service: 'ObservabilityHub',
      data
    });
  } catch {
    // Graceful degradation - Loki not available
  }
}

// ============================================================================
// Observability Hub Class
// ============================================================================

/**
 * Central Observability Hub.
 * 
 * Subscribes to Event Bus with '**' pattern (all events) and forwards
 * to registered backends. Also accepts direct ingestion via ingest().
 */
export class ObservabilityHub {
  /** Registered backends */
  private backends: Map<string, IObservabilityBackend> = new Map();

  /** Event Bus subscription ID */
  private subscriptionId: SubscriptionId | null = null;

  /** Hub running state */
  private running = false;

  /** Event counter (from Event Bus) */
  private eventBusCount = 0;

  /** Event counter (from direct ingestion) */
  private directIngestCount = 0;

  // --------------------------------------------------------------------------
  // Backend Registry
  // --------------------------------------------------------------------------

  /**
   * Register an observability backend.
   * @param backend - Backend implementing IObservabilityBackend
   */
  register(backend: IObservabilityBackend): void {
    if (this.backends.has(backend.name)) {
      log.warn('register', `Backend '${backend.name}' already registered, replacing`, { backend: backend.name });
    }
    this.backends.set(backend.name, backend);
    log.info('register', `Backend registered: ${backend.name}`, { backend: backend.name });
    
    // Report to kernel
    try {
      getHubKernelHook()?.backend('register', backend.name, { enabled: backend.enabled });
    } catch {
      // Kernel failure should never affect hub operation
    }
  }

  /**
   * Unregister a backend by name.
   * @param name - Backend name to remove
   * @returns true if removed, false if not found
   */
  unregister(name: string): boolean {
    const removed = this.backends.delete(name);
    if (removed) {
      log.info('unregister', `Backend unregistered: ${name}`, { backend: name });
      
      // Report to kernel
      try {
        getHubKernelHook()?.backend('unregister', name);
      } catch {
        // Kernel failure should never affect hub operation
      }
    }
    return removed;
  }

  /**
   * Get a registered backend by name.
   * @param name - Backend name
   * @returns Backend instance or undefined
   */
  getBackend(name: string): IObservabilityBackend | undefined {
    return this.backends.get(name);
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start the hub and all registered backends.
   * Subscribes to Event Bus with '**' pattern.
   */
  async start(): Promise<void> {
    if (!OBSERVABILITY_CONFIG.enabled) {
      log.info('start', 'Disabled via OBSERVABILITY_HUB_ENABLED=false');
      return;
    }

    if (this.running) {
      log.warn('start', 'Already running');
      return;
    }

    log.info('start', 'Starting...');

    // Start all backends
    for (const [name, backend] of this.backends) {
      try {
        await backend.start();
        log.info('start', `Backend started: ${name}`, { backend: name });
      } catch (error) {
        log.error('start', `Failed to start backend '${name}'`, { backend: name, error });
        forwardToLoki('error', `Failed to start backend '${name}'`, { backendName: name, error: String(error) });
        // Continue — don't let one backend failure prevent others
      }
    }

    // Subscribe to Event Bus
    try {
      const eventBus = EventBus.getInstance();
      this.subscriptionId = eventBus.subscribe('**', (event) => this.handleEvent(event));
      log.info('start', 'Subscribed to Event Bus', { pattern: '**' });
    } catch (error) {
      log.error('start', 'Failed to subscribe to Event Bus', { error });
      forwardToLoki('error', 'Failed to subscribe to Event Bus', { error: String(error) });
      // Continue without Event Bus — direct ingestion still works
    }

    this.running = true;
    log.info('start', 'Started successfully', { backendCount: this.backends.size });
    
    // Report lifecycle to kernel
    try {
      getHubKernelHook()?.lifecycle('start', { 
        backendCount: this.backends.size,
        backends: Array.from(this.backends.keys()),
      });
    } catch {
      // Kernel failure should never affect hub operation
    }
  }

  /**
   * Stop the hub and all registered backends gracefully.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    log.info('stop', 'Stopping...', { eventBusCount: this.eventBusCount, directIngestCount: this.directIngestCount });

    // Unsubscribe from Event Bus
    if (this.subscriptionId) {
      try {
        const eventBus = EventBus.getInstance();
        eventBus.unsubscribe(this.subscriptionId);
        this.subscriptionId = null;
        log.info('stop', 'Unsubscribed from Event Bus');
      } catch (error) {
        log.error('stop', 'Error unsubscribing from Event Bus', { error });
        forwardToLoki('error', 'Error unsubscribing from Event Bus', { error: String(error) });
      }
    }

    // Stop all backends
    for (const [name, backend] of this.backends) {
      try {
        await backend.stop();
        log.info('stop', `Backend stopped: ${name}`, { backend: name });
      } catch (error) {
        log.error('stop', `Error stopping backend '${name}'`, { backend: name, error });
        forwardToLoki('error', `Error stopping backend '${name}'`, { backendName: name, error: String(error) });
      }
    }

    this.running = false;
    log.info('stop', 'Stopped');
    
    // Report lifecycle to kernel
    try {
      getHubKernelHook()?.lifecycle('stop', { 
        eventBusTotal: this.eventBusCount,
        directIngestTotal: this.directIngestCount,
      });
    } catch {
      // Kernel failure should never affect hub operation
    }
  }

  // --------------------------------------------------------------------------
  // Event Handling
  // --------------------------------------------------------------------------

  /**
   * Handle event from Event Bus subscription.
   * Converts BusEvent to ObservabilityEvent and fans out.
   * @private
   */
  private handleEvent(event: BusEvent): void {
    if (!this.running) return;

    this.eventBusCount++;

    try {
      const obsEvent = this.convertBusEvent(event);
      this.fanOut(obsEvent);
      
      // Report to kernel (sample: every 100th event to reduce noise)
      if (this.eventBusCount % 100 === 0) {
        try {
          getHubKernelHook()?.event('eventbus', event.topic, { count: this.eventBusCount });
        } catch {
          // Kernel failure should never affect hub operation
        }
      }
    } catch (error) {
      // Silently drop — never propagate to Event Bus
      log.error('handleEvent', 'Error handling event', { error });
      forwardToLoki('error', 'Error handling event', { error: String(error) });
    }
  }

  /**
   * Direct ingestion of observability events.
   * Use this for sources that bypass Event Bus (e.g., Security Bot).
   *
   * @param topic - Event topic (e.g., 'security.sweep.completed')
   * @param payload - Event payload data
   * @param source - Source service name (default: 'direct')
   */
  ingest(topic: string, payload: Record<string, unknown>, source = 'direct'): void {
    if (!this.running) return;

    this.directIngestCount++;

    try {
      const event: ObservabilityEvent = {
        timestamp: new Date(),
        topic,
        level: this.extractLevel(topic),
        service: source,
        payload,
      };
      this.fanOut(event);
      
      // Report to kernel (sample: every 50th direct event)
      if (this.directIngestCount % 50 === 0) {
        try {
          getHubKernelHook()?.event('direct', topic, { count: this.directIngestCount, source });
        } catch {
          // Kernel failure should never affect hub operation
        }
      }
    } catch (error) {
      // Silently drop — never propagate errors
      log.error('ingest', 'Error ingesting event', { topic, source, error });
      forwardToLoki('error', 'Error ingesting event', { topic, source, error: String(error) });
    }
  }

  /**
   * Fan out event to all registered backends.
   * @private
   */
  private fanOut(event: ObservabilityEvent): void {
    for (const backend of this.backends.values()) {
      if (!backend.enabled) continue;

      try {
        backend.receive(event);
      } catch (error) {
        // Isolate backend errors — don't let one backend affect others
        log.error('fanOut', `Backend '${backend.name}' error`, { backend: backend.name, error });
        forwardToLoki('error', `Backend '${backend.name}' error`, { backendName: backend.name, error: String(error) });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Converters
  // --------------------------------------------------------------------------

  /**
   * Convert BusEvent (from Event Bus) to ObservabilityEvent.
   * @private
   */
  private convertBusEvent(event: BusEvent): ObservabilityEvent {
    return {
      timestamp: event.timestamp,
      topic: event.topic,
      level: this.extractLevel(event.topic),
      service: event.emitter ?? 'unknown',
      payload: typeof event.payload === 'object' && event.payload !== null
        ? event.payload as Record<string, unknown>
        : { value: event.payload },
      correlationId: event.correlationId,
      parentCorrelationId: event.parentCorrelationId,
    };
  }

  /**
   * Extract log level from topic string.
   * @private
   */
  private extractLevel(topic: string): ObservabilityLevel {
    const lowerTopic = topic.toLowerCase();

    // Error topics
    if (lowerTopic.includes('error') || lowerTopic.includes('critical')) {
      return 'error';
    }

    // Warning topics
    if (
      lowerTopic.includes('warn') ||
      lowerTopic.includes('alert') ||
      lowerTopic.includes('security.permission')
    ) {
      return 'warn';
    }

    // Debug topics
    if (lowerTopic.includes('debug') || lowerTopic.includes('trace')) {
      return 'debug';
    }

    // Default to info
    return 'info';
  }

  // --------------------------------------------------------------------------
  // Status
  // --------------------------------------------------------------------------

  /**
   * Get hub status snapshot.
   */
  getStatus(): HubStatus {
    return {
      enabled: OBSERVABILITY_CONFIG.enabled,
      running: this.running,
      eventBusEvents: this.eventBusCount,
      directIngestEvents: this.directIngestCount,
      backendCount: this.backends.size,
      backends: Array.from(this.backends.keys()),
      subscriptionId: this.subscriptionId,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton Observability Hub instance.
 * Import this to interact with the hub.
 */
export const observabilityHub = new ObservabilityHub();
