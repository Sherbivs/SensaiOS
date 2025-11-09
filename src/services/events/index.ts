import { log } from '../../utils/logger.js';
/**
 * Event Tracking Service
 * 
 * Comprehensive event tracking with batch processing, PII protection,
 * and retention policies.
 * 
 * @example
 * ```typescript
 * import { createEventTracker } from './services/events';
 * import { pool } from './shared/prisma';
 * 
 * const tracker = createEventTracker(pool, {
 *   maxBatchSize: 100,
 *   maxBatchDelay: 5000,
 *   enableMetrics: true,
 * });
 * 
 * // Track a single event
 * await tracker.track({
 *   userId: '123',
 *   category: 'gameplay',
 *   eventType: 'battle.won',
 *   severity: 'info',
 *   data: {
 *     battleId: 'battle_456',
 *     opponentId: '789',
 *     opponentName: 'Trainer Red',
 *     turns: 15,
 *     duration_ms: 180000,
 *     pokemon_fainted: 2,
 *     experience_gained: 1500,
 *     coins_earned: 500,
 *   },
 *   relatedEntityType: 'Battle',
 *   relatedEntityId: 'battle_456',
 * });
 * 
 * // Get metrics
 * const metrics = tracker.getMetrics();
 * log.info(`Events queued: ${metrics.eventsQueued}`);
 * log.info(`Events flushed: ${metrics.eventsFlushed}`);
 * log.info(`Avg batch size: ${metrics.avgBatchSize}`);
 * log.info(`Avg flush time: ${metrics.avgFlushTime}ms`);
 * 
 * // Shutdown gracefully
 * await tracker.shutdown();
 * ```
 */

export * from './types.js';
export * from './EventTracker.js';
