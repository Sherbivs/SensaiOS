/**
 * Observability Hub
 * =================
 *
 * Central intermediary between event sources and observability backends.
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
/* eslint-disable no-console */

import { EventBus, type BusEvent, type SubscriptionId } from '../../shared/event-bus.js';
import { OBSERVABILITY_CONFIG } from './observability-config.js';
import type {
  ObservabilityEvent,
  ObservabilityLevel,
  IObservabilityBackend,
  HubStatus,
} from './observability-types.js';

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
      console.warn(`[ObservabilityHub] Backend '${backend.name}' already registered, replacing`);
    }
    this.backends.set(backend.name, backend);
    console.info(`[ObservabilityHub] Backend registered: ${backend.name}`);
  }

  /**
   * Unregister a backend by name.
   * @param name - Backend name to remove
   * @returns true if removed, false if not found
   */
  unregister(name: string): boolean {
    const removed = this.backends.delete(name);
    if (removed) {
      console.info(`[ObservabilityHub] Backend unregistered: ${name}`);
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
      console.info('[ObservabilityHub] Disabled via OBSERVABILITY_HUB_ENABLED=false');
      return;
    }

    if (this.running) {
      console.warn('[ObservabilityHub] Already running');
      return;
    }

    console.info('[ObservabilityHub] Starting...');

    // Start all backends
    for (const [name, backend] of this.backends) {
      try {
        await backend.start();
        console.info(`[ObservabilityHub] Backend started: ${name}`);
      } catch (error) {
        console.error(`[ObservabilityHub] Failed to start backend '${name}':`, error);
        // Continue — don't let one backend failure prevent others
      }
    }

    // Subscribe to Event Bus
    try {
      const eventBus = EventBus.getInstance();
      this.subscriptionId = eventBus.subscribe('**', (event) => this.handleEvent(event));
      console.info('[ObservabilityHub] Subscribed to Event Bus (pattern: **)');
    } catch (error) {
      console.error('[ObservabilityHub] Failed to subscribe to Event Bus:', error);
      // Continue without Event Bus — direct ingestion still works
    }

    this.running = true;
    console.info('[ObservabilityHub] Started successfully');
  }

  /**
   * Stop the hub and all registered backends gracefully.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.info('[ObservabilityHub] Stopping...');

    // Unsubscribe from Event Bus
    if (this.subscriptionId) {
      try {
        const eventBus = EventBus.getInstance();
        eventBus.unsubscribe(this.subscriptionId);
        this.subscriptionId = null;
        console.info('[ObservabilityHub] Unsubscribed from Event Bus');
      } catch (error) {
        console.error('[ObservabilityHub] Error unsubscribing from Event Bus:', error);
      }
    }

    // Stop all backends
    for (const [name, backend] of this.backends) {
      try {
        await backend.stop();
        console.info(`[ObservabilityHub] Backend stopped: ${name}`);
      } catch (error) {
        console.error(`[ObservabilityHub] Error stopping backend '${name}':`, error);
      }
    }

    this.running = false;
    console.info('[ObservabilityHub] Stopped');
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
    } catch (error) {
      // Silently drop — never propagate to Event Bus
      console.error('[ObservabilityHub] Error handling event:', error);
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
    } catch (error) {
      // Silently drop — never propagate errors
      console.error('[ObservabilityHub] Error ingesting event:', error);
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
        console.error(`[ObservabilityHub] Backend '${backend.name}' error:`, error);
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
