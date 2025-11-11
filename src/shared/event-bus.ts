/**
 * Event Bus - Unified Event Routing System (Layer 2)
 * 
 * Provides centralized event distribution with:
 * - Correlation IDs for cross-system tracing
 * - Pattern-based subscriptions (exact, wildcard, multi-level)
 * - Event replay buffer (last 100 events)
 * - Backpressure control (per-subscriber queue limits)
 * - Statistics tracking (events emitted, handler invocations, latency)
 * 
 * Replaces 4 fragmented event systems:
 * 1. EventTracker (user event batching)
 * 2. ErrorTracker live stream (real-time error broadcasting)
 * 3. DripAlertManager (in-memory alert queue)
 * 4. BusMessage (PostgreSQL async message queue)
 * 
 * @module shared/event-bus
 */

import { randomUUID } from 'crypto';
import { log } from '../utils/logger.js';

/// ---- Type Definitions ----

/**
 * Core event structure
 */
export interface BusEvent {
  correlationId: string;         // UUID for cross-system tracing
  topic: string;                 // Dot-separated (battle.started, error.critical)
  payload: any;                  // Event-specific data
  timestamp: Date;               // Emission time
  emitter?: string;              // Service that emitted (optional)
  parentCorrelationId?: string;  // For event chains (optional)
}

/**
 * Emission options
 */
export interface EmitOptions {
  emitter?: string;              // Service name
  parentCorrelationId?: string;  // Chain to parent event
  priority?: 'high' | 'normal' | 'low';
}

/**
 * Event handler function
 */
export type EventHandler = (event: BusEvent) => void | Promise<void>;

/**
 * Subscription options
 */
export interface SubscribeOptions {
  priority?: number;             // Handler execution order (higher first, default 0)
  maxQueueSize?: number;         // Backpressure limit (default 1000)
  async?: boolean;               // Async handler (default true)
}

/**
 * Correlation ID (UUID)
 */
export type CorrelationId = string;

/**
 * Subscription ID (UUID)
 */
export type SubscriptionId = string;

/**
 * Subscriber information
 */
export interface SubscriberInfo {
  id: SubscriptionId;
  pattern: string;
  priority: number;
  queueSize: number;
  maxQueueSize: number;
  droppedEvents: number;
  handlerName?: string;
}

/**
 * Event Bus statistics
 */
export interface BusStats {
  eventsEmitted: number;
  subscriptionsActive: number;
  replayBufferSize: number;
  totalHandlerInvocations: number;
  failedHandlerInvocations: number;
  averageHandlerLatency: number;
  backpressureEvents: number;
}

/// ---- Pattern Matching ----

/**
 * Check if topic matches pattern
 * 
 * Supported patterns:
 * - Exact: "battle.started" matches only "battle.started"
 * - Single-level wildcard: "battle.*" matches "battle.started", "battle.ended"
 * - Multi-level wildcard: "battle.**" matches "battle.started", "battle.turn.1"
 * - Match all: "*" or "**" matches everything
 * 
 * @param topic - Event topic (dot-separated)
 * @param pattern - Subscription pattern
 * @returns true if topic matches pattern
 */
function matchesPattern(topic: string, pattern: string): boolean {
  if (pattern === topic) return true; // Exact match
  if (pattern === '*' || pattern === '**') return true; // Match all
  
  const patternParts = pattern.split('.');
  const topicParts = topic.split('.');
  
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '**') return true; // Multi-level wildcard (matches rest)
    if (patternParts[i] === '*') continue;     // Single-level wildcard (matches this level)
    if (patternParts[i] !== topicParts[i]) return false; // Mismatch
  }
  
  // Exact length match required (unless multi-level wildcard)
  return topicParts.length === patternParts.length;
}

/// ---- Event Replay Buffer ----

/**
 * FIFO buffer for event replay
 */
class EventReplayBuffer {
  private buffer: BusEvent[] = [];
  private readonly maxSize: number;
  
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }
  
  /**
   * Add event to buffer (FIFO eviction)
   */
  add(event: BusEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift(); // Evict oldest
    }
  }
  
  /**
   * Replay events matching pattern and time filter
   */
  replay(pattern: string, since?: Date): BusEvent[] {
    return this.buffer.filter(event => {
      if (since && event.timestamp < since) return false;
      return matchesPattern(event.topic, pattern);
    });
  }
  
  /**
   * Get all buffered events (defensive copy)
   */
  getAll(): BusEvent[] {
    return [...this.buffer];
  }
  
  /**
   * Get buffer size
   */
  size(): number {
    return this.buffer.length;
  }
  
  /**
   * Clear buffer
   */
  clear(): void {
    this.buffer.length = 0;
  }
}

/// ---- Subscription ----

/**
 * Internal subscription state
 */
class Subscription {
  readonly id: SubscriptionId;
  readonly pattern: string;
  readonly handler: EventHandler;
  readonly priority: number;
  readonly maxQueueSize: number;
  readonly async: boolean;
  
  private queue: BusEvent[] = [];
  private processing = false;
  private stats = {
    successfulInvocations: 0,
    failedInvocations: 0,
    droppedEvents: 0,
    totalLatency: 0,
  };
  
  constructor(
    pattern: string,
    handler: EventHandler,
    options: SubscribeOptions = {}
  ) {
    this.id = randomUUID();
    this.pattern = pattern;
    this.handler = handler;
    this.priority = options.priority ?? 0;
    this.maxQueueSize = options.maxQueueSize ?? 1000;
    this.async = options.async ?? true;
  }
  
  /**
   * Enqueue event for processing
   * @returns true if enqueued, false if dropped (backpressure)
   */
  enqueue(event: BusEvent): boolean {
    // Backpressure: Drop oldest if queue full
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift(); // Drop oldest
      this.stats.droppedEvents++;
      return false; // Signal backpressure
    }
    
    this.queue.push(event);
    
    // Process queue asynchronously
    if (!this.processing) {
      this.processQueue();
    }
    
    return true;
  }
  
  /**
   * Process queue asynchronously
   */
  private async processQueue(): Promise<void> {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      const start = process.hrtime.bigint();
      
      try {
        if (this.async) {
          await this.handler(event);
        } else {
          this.handler(event);
        }
        this.stats.successfulInvocations++;
      } catch (error) {
        this.stats.failedInvocations++;
        log('error', 'EventBus: Handler error', {
          subscriptionId: this.id,
          pattern: this.pattern,
          topic: event.topic,
          correlationId: event.correlationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      const latencyNs = Number(process.hrtime.bigint() - start);
      this.stats.totalLatency += latencyNs;
    }
    
    this.processing = false;
  }
  
  /**
   * Get subscriber info
   */
  getInfo(): SubscriberInfo {
    return {
      id: this.id,
      pattern: this.pattern,
      priority: this.priority,
      queueSize: this.queue.length,
      maxQueueSize: this.maxQueueSize,
      droppedEvents: this.stats.droppedEvents,
      handlerName: this.handler.name || 'anonymous',
    };
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return {
      successfulInvocations: this.stats.successfulInvocations,
      failedInvocations: this.stats.failedInvocations,
      droppedEvents: this.stats.droppedEvents,
      averageLatency: this.stats.successfulInvocations > 0
        ? this.stats.totalLatency / this.stats.successfulInvocations / 1_000_000 // Convert ns → ms
        : 0,
    };
  }
  
  /**
   * Wait for queue to drain (for graceful shutdown)
   */
  async drain(): Promise<void> {
    // Wait for current processing to finish
    while (this.processing || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

/// ---- Event Bus ----

/**
 * EventBus - Centralized event routing system
 */
export class EventBus {
  private static instance: EventBus | null = null;
  
  private subscriptions = new Map<SubscriptionId, Subscription>();
  private replayBuffer: EventReplayBuffer;
  private stats = {
    eventsEmitted: 0,
    totalHandlerLatency: 0,
  };
  
  private constructor(replayBufferSize = 100) {
    this.replayBuffer = new EventReplayBuffer(replayBufferSize);
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
  
  /**
   * Reset instance (testing only)
   */
  static resetInstance(): void {
    if (EventBus.instance) {
      // Drain all subscriptions before reset
      const subscriptions = Array.from(EventBus.instance.subscriptions.values());
      Promise.all(subscriptions.map(sub => sub.drain())).then(() => {
        EventBus.instance = null;
      });
    } else {
      EventBus.instance = null;
    }
  }
  
  /**
   * Emit event to all matching subscribers
   * @returns Correlation ID for tracing
   */
  emit(topic: string, payload: any, options: EmitOptions = {}): CorrelationId {
    // Generate correlation ID
    const correlationId = options.parentCorrelationId
      ? `${options.parentCorrelationId}:${randomUUID().split('-')[0]}`
      : randomUUID();
    
    // Create event
    const event: BusEvent = {
      correlationId,
      topic,
      payload,
      timestamp: new Date(),
      emitter: options.emitter,
      parentCorrelationId: options.parentCorrelationId,
    };
    
    // Add to replay buffer
    this.replayBuffer.add(event);
    
    // Update stats
    this.stats.eventsEmitted++;
    
    // Find matching subscriptions (sorted by priority descending)
    const matchingSubscriptions = Array.from(this.subscriptions.values())
      .filter(sub => matchesPattern(topic, sub.pattern))
      .sort((a, b) => b.priority - a.priority);
    
    // Enqueue event for each subscription
    let backpressureCount = 0;
    for (const subscription of matchingSubscriptions) {
      const enqueued = subscription.enqueue(event);
      if (!enqueued) {
        backpressureCount++;
      }
    }
    
    // Log backpressure events
    if (backpressureCount > 0) {
      log('warn', 'EventBus: Backpressure detected', {
        topic,
        correlationId,
        droppedSubscribers: backpressureCount,
        totalSubscribers: matchingSubscriptions.length,
      });
    }
    
    return correlationId;
  }
  
  /**
   * Emit event synchronously (no async subscribers)
   */
  emitSync(topic: string, payload: any): void {
    this.emit(topic, payload, {});
  }
  
  /**
   * Subscribe to event pattern
   * @returns Subscription ID for unsubscribing
   */
  subscribe(
    pattern: string,
    handler: EventHandler,
    options: SubscribeOptions = {}
  ): SubscriptionId {
    const subscription = new Subscription(pattern, handler, options);
    this.subscriptions.set(subscription.id, subscription);
    
    log('info', 'EventBus: Subscription added', {
      subscriptionId: subscription.id,
      pattern,
      priority: subscription.priority,
      totalSubscriptions: this.subscriptions.size,
    });
    
    return subscription.id;
  }
  
  /**
   * Unsubscribe by subscription ID
   * @returns true if unsubscribed, false if not found
   */
  unsubscribe(subscriptionId: SubscriptionId): boolean {
    const removed = this.subscriptions.delete(subscriptionId);
    
    if (removed) {
      log('info', 'EventBus: Subscription removed', {
        subscriptionId,
        totalSubscriptions: this.subscriptions.size,
      });
    }
    
    return removed;
  }
  
  /**
   * Unsubscribe all subscriptions matching pattern
   * @returns Number of subscriptions removed
   */
  unsubscribeAll(pattern?: string): number {
    if (!pattern) {
      // Remove all subscriptions
      const count = this.subscriptions.size;
      this.subscriptions.clear();
      log('info', 'EventBus: All subscriptions removed', { count });
      return count;
    }
    
    // Remove matching subscriptions
    let count = 0;
    for (const [id, subscription] of this.subscriptions.entries()) {
      if (subscription.pattern === pattern) {
        this.subscriptions.delete(id);
        count++;
      }
    }
    
    if (count > 0) {
      log('info', 'EventBus: Pattern subscriptions removed', {
        pattern,
        count,
        totalSubscriptions: this.subscriptions.size,
      });
    }
    
    return count;
  }
  
  /**
   * Replay events matching pattern and time filter
   */
  replay(pattern: string, since?: Date): BusEvent[] {
    return this.replayBuffer.replay(pattern, since);
  }
  
  /**
   * Get replay buffer contents
   */
  getReplayBuffer(): BusEvent[] {
    return this.replayBuffer.getAll();
  }
  
  /**
   * Get Event Bus statistics
   */
  getStats(): BusStats {
    // Aggregate subscription stats
    let totalHandlerInvocations = 0;
    let failedHandlerInvocations = 0;
    let totalHandlerLatency = 0;
    let backpressureEvents = 0;
    
    for (const subscription of this.subscriptions.values()) {
      const stats = subscription.getStats();
      totalHandlerInvocations += stats.successfulInvocations + stats.failedInvocations;
      failedHandlerInvocations += stats.failedInvocations;
      totalHandlerLatency += stats.averageLatency * stats.successfulInvocations;
      backpressureEvents += stats.droppedEvents;
    }
    
    return {
      eventsEmitted: this.stats.eventsEmitted,
      subscriptionsActive: this.subscriptions.size,
      replayBufferSize: this.replayBuffer.size(),
      totalHandlerInvocations,
      failedHandlerInvocations,
      averageHandlerLatency: totalHandlerInvocations > 0
        ? totalHandlerLatency / totalHandlerInvocations
        : 0,
      backpressureEvents,
    };
  }
  
  /**
   * Get subscriber information
   */
  getSubscribers(pattern?: string): SubscriberInfo[] {
    const subscriptions = Array.from(this.subscriptions.values());
    
    if (pattern) {
      return subscriptions
        .filter(sub => sub.pattern === pattern)
        .map(sub => sub.getInfo());
    }
    
    return subscriptions.map(sub => sub.getInfo());
  }
  
  /**
   * Graceful shutdown - drain all subscriptions
   */
  async shutdown(): Promise<void> {
    log('info', 'EventBus: Shutting down', {
      subscriptions: this.subscriptions.size,
      queuedEvents: Array.from(this.subscriptions.values())
        .reduce((sum, sub) => sum + sub.getInfo().queueSize, 0),
    });
    
    // Drain all subscriptions in parallel
    const subscriptions = Array.from(this.subscriptions.values());
    await Promise.all(subscriptions.map(sub => sub.drain()));
    
    // Clear subscriptions
    this.subscriptions.clear();
    
    // Clear replay buffer
    this.replayBuffer.clear();
    
    log('info', 'EventBus: Shutdown complete');
  }
}
