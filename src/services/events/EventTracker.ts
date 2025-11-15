/**
 * Event Tracker Service
 * 
 * Handles batch event tracking with PII protection, retention policies,
 * and performance monitoring.
 * 
 * Features:
 * - Event batching (max 100 events, 5s delay)
 * - PII handling (IP address hashing with SHA-256)
 * - Automatic retention calculation
 * - Performance metrics
 */

import { createHash } from 'crypto';
import type { Pool } from 'pg';
import { log } from '../../utils/logger.js';
import type { 
  BaseEvent, 
  TrackedEvent, 
  EventCategory, 
  EventSeverity
} from './types.js';
import { RETENTION_POLICIES as POLICIES } from './types.js';

/**
 * Event tracker configuration
 */
export interface EventTrackerConfig {
  /** Maximum number of events in a batch */
  maxBatchSize?: number;
  /** Maximum delay before flushing batch (ms) */
  maxBatchDelay?: number;
  /** Enable performance tracking */
  enableMetrics?: boolean;
  /** Custom logger */
  logger?: {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
  };
}

/**
 * Event tracker metrics
 */
export interface EventTrackerMetrics {
  eventsQueued: number;
  eventsFlushed: number;
  batchesProcessed: number;
  avgBatchSize: number;
  avgFlushTime: number;
  lastFlushAt?: Date;
  errors: number;
}

/**
 * EventTracker manages batch event tracking with PII protection
 */
export class EventTracker {
  private pool: Pool;
  private config: Required<EventTrackerConfig>;
  private eventQueue: BaseEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private metrics: EventTrackerMetrics = {
    eventsQueued: 0,
    eventsFlushed: 0,
    batchesProcessed: 0,
    avgBatchSize: 0,
    avgFlushTime: 0,
    errors: 0,
  };
  private totalFlushTime = 0;

  constructor(pool: Pool, config: EventTrackerConfig = {}) {
    this.pool = pool;
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 100,
      maxBatchDelay: config.maxBatchDelay ?? 5000,
      enableMetrics: config.enableMetrics ?? true,
      logger: config.logger ?? console,
    };
  }

  /**
   * Track a single event (queues for batch processing)
   */
  async track(event: TrackedEvent): Promise<void> {
    // Process PII fields
    const processedEvent = this.processPII(event);

    // Calculate retention date
    const _retainUntil = this.calculateRetention(
      processedEvent.category,
      processedEvent.severity
    );

    // Add to queue
    this.eventQueue.push({
      ...processedEvent,
      occurredAt: processedEvent.occurredAt ?? new Date(),
      data: processedEvent.data ? JSON.parse(JSON.stringify(processedEvent.data)) : undefined,
    });

    this.metrics.eventsQueued++;

    // Flush if batch is full
    if (this.eventQueue.length >= this.config.maxBatchSize) {
      await this.flush();
    } else {
      // Schedule flush if not already scheduled
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flush().catch(err => {
            this.config.logger.error('Failed to flush events:', err);
            this.metrics.errors++;
          });
        }, this.config.maxBatchDelay);
      }
    }
  }

  /**
   * Track multiple events at once
   */
  async trackBatch(events: TrackedEvent[]): Promise<void> {
    for (const event of events) {
      await this.track(event);
    }
  }

  /**
   * Manually flush all pending events
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    // Clear flush timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    const batch = this.eventQueue.splice(0, this.config.maxBatchSize);
    const startTime = Date.now();

    try {
      await this.insertBatch(batch);

      const flushTime = Date.now() - startTime;
      this.totalFlushTime += flushTime;
      this.metrics.eventsFlushed += batch.length;
      this.metrics.batchesProcessed++;
      this.metrics.avgBatchSize = 
        this.metrics.eventsFlushed / this.metrics.batchesProcessed;
      this.metrics.avgFlushTime = 
        this.totalFlushTime / this.metrics.batchesProcessed;
      this.metrics.lastFlushAt = new Date();

      if (this.config.enableMetrics) {
        log('info', `[EventTracker] Flushed batch`, {
          batchSize: batch.length,
          flushTimeMs: flushTime,
          totalFlushed: this.metrics.eventsFlushed,
          avgBatchSize: this.metrics.avgBatchSize.toFixed(2),
          avgFlushTimeMs: this.metrics.avgFlushTime.toFixed(2),
        });
      }

      // Warn if queue depth is high
      if (this.eventQueue.length > 50) {
        log('warn', `[EventTracker] High queue depth detected`, {
          queueDepth: this.eventQueue.length,
          batchSize: this.config.maxBatchSize,
          recommendation: 'Consider increasing maxBatchSize or maxBatchDelay',
        });
      }

      // Continue flushing if more events remain
      if (this.eventQueue.length > 0) {
        await this.flush();
      }
    } catch (error) {
      this.metrics.errors++;
      log('error', '[EventTracker] Failed to insert batch', {
        error: error instanceof Error ? error.message : String(error),
        batchSize: batch.length,
        queueDepth: this.eventQueue.length,
      });
      // Re-queue failed events at the front
      this.eventQueue.unshift(...batch);
      throw error;
    }
  }

  /**
   * Insert a batch of events into the database
   */
  private async insertBatch(events: BaseEvent[]): Promise<void> {
    if (events.length === 0) return;

    // Build bulk INSERT query
    const values: unknown[] = [];
    const placeholders: string[] = [];
    
    events.forEach((event, idx) => {
      const baseIdx = idx * 13;
      placeholders.push(
        `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, ` +
        `$${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, ` +
        `$${baseIdx + 9}, $${baseIdx + 10}, $${baseIdx + 11}, $${baseIdx + 12}, $${baseIdx + 13})`
      );

      const retainUntil = this.calculateRetention(event.category, event.severity);
      const isPII = Boolean(event.ipAddress);

      values.push(
        event.userId,
        event.category,
        event.eventType,
        event.severity,
        event.data ? JSON.stringify(event.data) : null,
        event.sessionId ?? null,
        event.ipAddress ?? null,
        event.userAgent ?? null,
        event.relatedEntityType ?? null,
        event.relatedEntityId ?? null,
        event.occurredAt ?? new Date(),
        retainUntil,
        isPII
      );
    });

    const query = `
      INSERT INTO "UserEvent" (
        "userId", "category", "eventType", "severity", 
        "data", "sessionId", "ipAddress", "userAgent",
        "relatedEntityType", "relatedEntityId", "occurredAt",
        "retainUntil", "isPII"
      )
      VALUES ${placeholders.join(', ')}
    `;

    await this.pool.query(query, values);
  }

  /**
   * Process PII fields (hash IP addresses)
   */
  private processPII(event: TrackedEvent): BaseEvent {
    if (event.ipAddress) {
      return {
        ...event,
        ipAddress: this.hashIP(event.ipAddress),
      };
    }
    return event;
  }

  /**
   * Hash IP address using SHA-256
   */
  private hashIP(ip: string): string {
    return createHash('sha256')
      .update(ip)
      .digest('hex');
  }

  /**
   * Calculate retention date based on category and severity
   */
  private calculateRetention(
    category: EventCategory,
    severity: EventSeverity
  ): Date | null {
    const retentionDays = POLICIES[category][severity];
    
    if (retentionDays === Infinity) {
      return null; // Indefinite retention
    }

    const retainUntil = new Date();
    retainUntil.setDate(retainUntil.getDate() + retentionDays);
    return retainUntil;
  }

  /**
   * Get current metrics
   */
  getMetrics(): EventTrackerMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      eventsQueued: 0,
      eventsFlushed: 0,
      batchesProcessed: 0,
      avgBatchSize: 0,
      avgFlushTime: 0,
      errors: 0,
    };
    this.totalFlushTime = 0;
  }

  /**
   * Cleanup: flush pending events and clear timers
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.eventQueue.length > 0) {
      await this.flush();
    }
  }
}

/**
 * Create a singleton event tracker instance
 */
let globalTracker: EventTracker | null = null;

export function createEventTracker(
  pool: Pool,
  config?: EventTrackerConfig
): EventTracker {
  if (!globalTracker) {
    globalTracker = new EventTracker(pool, config);
  }
  return globalTracker;
}

export function getEventTracker(): EventTracker | null {
  return globalTracker;
}
