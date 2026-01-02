/**
 * Event Bus - Unified Event Routing System (Layer 2)
 *
 * Provides centralized event distribution with:
 * - Correlation IDs for cross-system tracing
 * - Type-safe event payloads (via EventTopicMap)
 * - Pattern-based subscriptions (exact, wildcard, multi-level)
 * - Event replay buffer (last 100 events)
 * - Backpressure control (per-subscriber queue limits)
 * - Statistics tracking (events emitted, handler invocations, latency)
 * - KERNEL INTEGRATION: All events report UP to observation layer (2025-12-26)
 *
 * Replaces 4 fragmented event systems:
 * 1. EventTracker (user event batching)
 * 2. ErrorTracker live stream (real-time error broadcasting)
 * 3. DripAlertManager (in-memory alert queue)
 * 4. BusMessage (PostgreSQL async message queue)
 *
 * @module shared/event-bus
 */
// APP LAYER FIRST — Isolated access to kernel through application layer
import { createEventBusHook } from '../app/index.js';
import { scopedLogger } from '../observability/envelope/console.js';
import { randomUUID } from 'crypto';
import { getErrorMessage } from './utils/error-utils.js';
import { lokiTransport } from './logging/loki-transport.js';
// ═══════════════════════════════════════════════════════════════════════════
// Kernel Integration — Reports UP to observation layer
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Kernel hook for reporting events to the observation layer
 * Initialized lazily to avoid circular dependency issues during boot
 */
let kernelHook = null;
/**
 * Get or create the kernel hook (lazy initialization)
 * Safe to call during boot - returns null if kernel not ready
 */
function getKernelHook() {
    if (kernelHook)
        return kernelHook;
    try {
        kernelHook = createEventBusHook('event-bus');
        return kernelHook;
    }
    catch {
        // Kernel not ready yet (during early boot), will retry on next event
        return null;
    }
}
// NOTE: Event Bus now uses envelope system for internal logging (safe - no Event Bus dependency).
// The envelope system outputs directly to stdout/Loki without circular dependencies.
// Errors are also forwarded directly to Loki for observability.
/** Scoped logger for Event Bus - outputs directly without circular dependency */
const log = scopedLogger('event-bus');
/**
 * Forward a log entry directly to Loki (bypasses logger to avoid circular dep)
 */
function forwardToLoki(level, message, data) {
    try {
        lokiTransport.push({
            level,
            message,
            timestamp: new Date().toISOString(),
            service: 'EventBus',
            data
        });
    }
    catch {
        // Graceful degradation - Loki not available
    }
}
/// ---- Pattern Matching ----
/**
 * Pattern cache for compiled regex matchers
 * Key: subscription pattern, Value: compiled regex
 *
 * MEMORY PROTECTION: LRU eviction when cache exceeds 500 entries
 */
const patternCache = new Map();
const MAX_PATTERN_CACHE_SIZE = 500;
/**
 * Compile pattern to regex (with caching and LRU eviction)
 *
 * @param pattern - Subscription pattern
 * @returns Compiled regex for topic matching
 */
function compilePattern(pattern) {
    // Check cache first
    const cached = patternCache.get(pattern);
    if (cached) {
        // LRU: Move to end by deleting and re-inserting
        patternCache.delete(pattern);
        patternCache.set(pattern, cached);
        return cached;
    }
    // Compile regex based on pattern type
    let regex;
    // Match all
    if (pattern === '*' || pattern === '**') {
        regex = /.*/;
    }
    // Exact match (no wildcards)
    else if (!pattern.includes('*')) {
        // Escape ALL regex special characters for literal matching
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(`^${escaped}$`);
    }
    // Pattern with wildcards - compile below
    else {
        // Split pattern into parts and build regex
        const parts = pattern.split('.');
        const regexParts = [];
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part === '**') {
                // Multi-level wildcard: matches everything after this point
                regexParts.push('.*');
                break; // Stop processing (** matches all remaining levels)
            }
            else if (part === '*') {
                // Single-level wildcard: matches one segment (no dots)
                regexParts.push('[^.]+');
            }
            else {
                // Literal segment - escape regex special characters
                regexParts.push(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            }
        }
        const regexPattern = regexParts.join('\\.');
        regex = new RegExp(`^${regexPattern}$`);
    }
    // LRU eviction: Remove oldest entry if cache is full
    if (patternCache.size >= MAX_PATTERN_CACHE_SIZE) {
        const firstKey = patternCache.keys().next().value;
        if (firstKey !== undefined) {
            patternCache.delete(firstKey);
        }
    }
    // Store compiled regex in cache
    patternCache.set(pattern, regex);
    return regex;
}
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
function matchesPattern(topic, pattern) {
    // Fast path: exact match
    if (pattern === topic)
        return true;
    // Use compiled regex from cache
    const regex = compilePattern(pattern);
    return regex.test(topic);
}
/// ---- Event Replay Buffer ----
/**
 * FIFO buffer for event replay
 */
class EventReplayBuffer {
    buffer = [];
    maxSize;
    constructor(maxSize = 100) {
        this.maxSize = maxSize;
    }
    /**
     * Add event to buffer (FIFO eviction)
     */
    add(event) {
        this.buffer.push(event);
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift(); // Evict oldest
        }
    }
    /**
     * Replay events matching pattern and time filter
     */
    replay(pattern, since) {
        return this.buffer.filter(event => {
            if (since && event.timestamp < since)
                return false;
            return matchesPattern(event.topic, pattern);
        });
    }
    /**
     * Get all buffered events (defensive copy)
     */
    getAll() {
        return [...this.buffer];
    }
    /**
     * Get buffer size
     */
    size() {
        return this.buffer.length;
    }
    /**
     * Clear buffer
     */
    clear() {
        this.buffer.length = 0;
    }
}
/// ---- Subscription ----
/**
 * Internal subscription state
 */
class Subscription {
    id;
    pattern;
    handler;
    priority;
    maxQueueSize;
    async;
    queue = [];
    processing = false;
    stats = {
        successfulInvocations: 0,
        failedInvocations: 0,
        droppedEvents: 0,
        totalLatency: 0,
    };
    constructor(pattern, handler, options = {}) {
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
    enqueue(event) {
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
    async processQueue() {
        this.processing = true;
        while (this.queue.length > 0) {
            const event = this.queue.shift();
            const start = process.hrtime.bigint();
            try {
                if (this.async) {
                    await this.handler(event);
                }
                else {
                    this.handler(event);
                }
                this.stats.successfulInvocations++;
            }
            catch (error) {
                this.stats.failedInvocations++;
                const errorContext = {
                    subscriptionId: this.id,
                    pattern: this.pattern,
                    topic: event.topic,
                    correlationId: event.correlationId,
                    error: getErrorMessage(error),
                };
                log.error('handler', 'Handler error', errorContext);
                // Forward to Loki for observability
                forwardToLoki('error', 'Handler error', errorContext);
            }
            const latencyNs = Number(process.hrtime.bigint() - start);
            this.stats.totalLatency += latencyNs;
        }
        this.processing = false;
    }
    /**
     * Get subscriber info
     */
    getInfo() {
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
    async drain() {
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
    static instance = null;
    subscriptions = new Map();
    replayBuffer;
    stats = {
        eventsEmitted: 0,
        totalHandlerLatency: 0,
    };
    constructor(replayBufferSize = 100) {
        this.replayBuffer = new EventReplayBuffer(replayBufferSize);
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }
    /**
     * Reset instance (testing only)
     */
    static resetInstance() {
        if (EventBus.instance) {
            // Drain all subscriptions before reset
            const subscriptions = Array.from(EventBus.instance.subscriptions.values());
            Promise.all(subscriptions.map(sub => sub.drain())).then(() => {
                EventBus.instance = null;
            });
        }
        else {
            EventBus.instance = null;
        }
        // Clear pattern cache on reset
        patternCache.clear();
    }
    emit(topic, payload, options = {}) {
        // Generate correlation ID
        const correlationId = options.parentCorrelationId
            ? `${options.parentCorrelationId}:${randomUUID().split('-')[0]}`
            : randomUUID();
        // Create event
        const event = {
            correlationId,
            topic,
            payload,
            timestamp: new Date(),
            emitter: options.emitter,
            parentCorrelationId: options.parentCorrelationId,
        };
        // ═══════════════════════════════════════════════════════════════════════
        // KERNEL INTEGRATION — Report UP to observation layer (non-blocking)
        // ═══════════════════════════════════════════════════════════════════════
        // Kernel observes all events for unified metrics, patterns, anomalies
        // This doesn't interfere with normal event processing
        const hook = getKernelHook();
        if (hook) {
            const payloadSize = typeof payload === 'object'
                ? JSON.stringify(payload).length
                : String(payload).length;
            hook.event(topic, correlationId, options.emitter, payloadSize, {
                parentCorrelationId: options.parentCorrelationId,
                priority: options.priority,
            });
        }
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
            const backpressureContext = {
                topic,
                correlationId,
                droppedSubscribers: backpressureCount,
                totalSubscribers: matchingSubscriptions.length,
            };
            log.warn('backpressure', 'Backpressure detected', backpressureContext);
            // Forward to Loki for observability
            forwardToLoki('warn', 'Backpressure detected', backpressureContext);
        }
        return correlationId;
    }
    emitSync(topic, payload) {
        this.emit(topic, payload, {});
    }
    subscribe(pattern, handler, options = {}) {
        const subscription = new Subscription(pattern, handler, options);
        this.subscriptions.set(subscription.id, subscription);
        log.info('subscribe', 'Subscription added', {
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
    unsubscribe(subscriptionId) {
        const removed = this.subscriptions.delete(subscriptionId);
        if (removed) {
            log.info('unsubscribe', 'Subscription removed', {
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
    unsubscribeAll(pattern) {
        if (!pattern) {
            // Remove all subscriptions
            const count = this.subscriptions.size;
            this.subscriptions.clear();
            log.info('unsubscribeAll', 'All subscriptions removed', { count });
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
            log.info('unsubscribePattern', 'Pattern subscriptions removed', {
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
    replay(pattern, since) {
        return this.replayBuffer.replay(pattern, since);
    }
    /**
     * Get replay buffer contents
     */
    getReplayBuffer() {
        return this.replayBuffer.getAll();
    }
    /**
     * Get Event Bus statistics
     */
    getStats() {
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
    getSubscribers(pattern) {
        const subscriptions = Array.from(this.subscriptions.values());
        if (pattern) {
            return subscriptions
                .filter(sub => sub.pattern === pattern)
                .map(sub => sub.getInfo());
        }
        return subscriptions.map(sub => sub.getInfo());
    }
    /**
     * Get pattern cache statistics
     */
    getPatternCacheStats() {
        return {
            size: patternCache.size,
            patterns: Array.from(patternCache.keys()),
        };
    }
    /**
     * Graceful shutdown - drain all subscriptions
     */
    async shutdown() {
        log.info('shutdown', 'Shutting down', {
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
        log.info('shutdown', 'Shutdown complete');
    }
}
