/**
 * Game & Database Metrics Instrumentation
 * =========================================
 * 
 * Central instrumentation module that wires up game events, database queries,
 * and Loki transport stats to Prometheus metrics.
 * 
 * @module services/metrics-instrumentation
 * @since 2025-12-21
 */

import {
  recordBattle,
  recordBattleDuration,
  recordBattleTurns,
  recordEncounter,
  updateCatchRate,
  recordCommand,
  recordCommandLatency,
  recordDbQuery,
  recordDbQueryLatency,
  updateDbConnections,
  updateLokiQueueSize,
  recordLokiLogsSent,
} from './prometheus-metrics.js';
import { lokiTransport } from '../shared/logging/loki-transport.js';
import { EventBus } from '../shared/event-bus.js';
import { getLogger } from '../shared/logging/index.js';

const logger = getLogger();

// ============================================================================
// Types
// ============================================================================

interface BattleCompletedEvent {
  topic: 'battle.completed';
  data: {
    battleId: string;
    battleType: 'wild' | 'trainer' | 'pvp';
    winnerId: string;
    loserId: string;
    turns: number;
    durationMs: number;
    outcome: 'victory' | 'defeat' | 'draw' | 'forfeit';
  };
}

interface EncounterEvent {
  topic: 'encounter.spawned' | 'encounter.caught' | 'encounter.fled';
  data: {
    encounterId?: string;
    species: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'ultra_rare' | 'legendary';
    area: string;
    caught?: boolean;
  };
}

interface CommandEvent {
  topic: 'command.executed';
  data: {
    command: string;
    status: 'success' | 'error' | 'timeout';
    durationMs: number;
    userId?: string;
    guildId?: string;
  };
}

interface DbQueryEvent {
  topic: 'db.query';
  data: {
    operation: 'select' | 'insert' | 'update' | 'delete' | 'transaction';
    table: string;
    status: 'success' | 'error';
    durationMs: number;
  };
}

// ============================================================================
// Catch Rate Tracker
// ============================================================================

const CATCH_RATE_WINDOW = 100;
const catchHistory: boolean[] = [];

function updateCatchHistory(caught: boolean): void {
  catchHistory.push(caught);
  if (catchHistory.length > CATCH_RATE_WINDOW) {
    catchHistory.shift();
  }
  
  const successCount = catchHistory.filter(c => c).length;
  const rate = (successCount / catchHistory.length) * 100;
  updateCatchRate(rate);
}

// ============================================================================
// Loki Stats Collector
// ============================================================================

let lokiStatsInterval: NodeJS.Timeout | null = null;

function startLokiStatsCollection(): void {
  if (lokiStatsInterval) return;
  
  // Update Loki metrics every 30 seconds
  lokiStatsInterval = setInterval(() => {
    try {
      const stats = lokiTransport.getStats();
      updateLokiQueueSize(stats.queueDepth);
      
      // Track sent/failed counts delta
      // Note: These are cumulative, Prometheus handles rate calculation
    } catch {
      // Graceful degradation
    }
  }, 30_000);
  
  logger.info('instrumentation', 'loki-stats-start', 'Loki stats collection started (30s interval)');
}

function stopLokiStatsCollection(): void {
  if (lokiStatsInterval) {
    clearInterval(lokiStatsInterval);
    lokiStatsInterval = null;
    logger.info('instrumentation', 'loki-stats-stop', 'Loki stats collection stopped');
  }
}

// ============================================================================
// Event Bus Subscriptions
// ============================================================================

let battleSubId: string | null = null;
let encounterSubId: string | null = null;
let commandSubId: string | null = null;
let dbQuerySubId: string | null = null;

/**
 * Initialize all metrics instrumentation.
 * Subscribes to EventBus for game events and starts Loki stats collection.
 */
export function initializeMetricsInstrumentation(): void {
  const eventBus = EventBus.getInstance();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Battle Events
  // ─────────────────────────────────────────────────────────────────────────
  battleSubId = eventBus.subscribe('battle.*', (event) => {
    if (event.topic === 'battle.completed') {
      const data = (event as unknown as BattleCompletedEvent).data;
      recordBattle(data.outcome, data.battleType);
      recordBattleDuration(data.battleType, data.durationMs / 1000);
      recordBattleTurns(data.turns);
    }
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Encounter Events
  // ─────────────────────────────────────────────────────────────────────────
  encounterSubId = eventBus.subscribe('encounter.*', (event) => {
    const encounterEvent = event as unknown as EncounterEvent;
    const data = encounterEvent.data;
    
    if (event.topic === 'encounter.spawned') {
      // Just track the spawn, caught status will come later
    } else if (event.topic === 'encounter.caught' || event.topic === 'encounter.fled') {
      const caught = event.topic === 'encounter.caught';
      recordEncounter(data.rarity, data.area, caught);
      updateCatchHistory(caught);
    }
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Command Events
  // ─────────────────────────────────────────────────────────────────────────
  commandSubId = eventBus.subscribe('command.*', (event) => {
    if (event.topic === 'command.executed') {
      const data = (event as unknown as CommandEvent).data;
      recordCommand(data.command, data.status);
      recordCommandLatency(data.command, data.durationMs / 1000);
    }
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Database Events
  // ─────────────────────────────────────────────────────────────────────────
  dbQuerySubId = eventBus.subscribe('db.*', (event) => {
    if (event.topic === 'db.query') {
      const data = (event as unknown as DbQueryEvent).data;
      recordDbQuery(data.operation, data.table, data.status);
      recordDbQueryLatency(data.operation, data.durationMs / 1000);
    }
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Loki Stats Collection
  // ─────────────────────────────────────────────────────────────────────────
  startLokiStatsCollection();
  
  logger.info('instrumentation', 'init', 'Metrics instrumentation initialized (battle, encounter, command, db, loki)');
}

/**
 * Shutdown metrics instrumentation.
 * Unsubscribes from EventBus and stops collectors.
 */
export function shutdownMetricsInstrumentation(): void {
  const eventBus = EventBus.getInstance();
  
  if (battleSubId) {
    eventBus.unsubscribe(battleSubId);
    battleSubId = null;
  }
  
  if (encounterSubId) {
    eventBus.unsubscribe(encounterSubId);
    encounterSubId = null;
  }
  
  if (commandSubId) {
    eventBus.unsubscribe(commandSubId);
    commandSubId = null;
  }
  
  if (dbQuerySubId) {
    eventBus.unsubscribe(dbQuerySubId);
    dbQuerySubId = null;
  }
  
  stopLokiStatsCollection();
  
  logger.info('instrumentation', 'shutdown', 'Metrics instrumentation shutdown complete');
}

// ============================================================================
// Helper Functions for Direct Recording
// ============================================================================

/**
 * Record a battle completion directly (for use when EventBus not available).
 */
export function trackBattle(
  outcome: 'victory' | 'defeat' | 'draw' | 'forfeit',
  type: 'wild' | 'trainer' | 'pvp',
  turns: number,
  durationMs: number
): void {
  recordBattle(outcome, type);
  recordBattleDuration(type, durationMs / 1000);
  recordBattleTurns(turns);
}

/**
 * Record a Pokemon encounter directly.
 */
export function trackEncounter(
  rarity: 'common' | 'uncommon' | 'rare' | 'ultra_rare' | 'legendary',
  area: string,
  caught: boolean
): void {
  recordEncounter(rarity, area, caught);
  updateCatchHistory(caught);
}

/**
 * Record a Discord command execution directly.
 */
export function trackCommand(
  command: string,
  status: 'success' | 'error' | 'timeout',
  durationMs: number
): void {
  recordCommand(command, status);
  recordCommandLatency(command, durationMs / 1000);
}

/**
 * Record a database query directly.
 */
export function trackDbQuery(
  operation: 'select' | 'insert' | 'update' | 'delete' | 'transaction',
  table: string,
  status: 'success' | 'error',
  durationMs: number
): void {
  recordDbQuery(operation, table, status);
  recordDbQueryLatency(operation, durationMs / 1000);
}

/**
 * Update database connection count.
 */
export function trackDbConnections(database: string, count: number): void {
  updateDbConnections(database, count);
}

/**
 * Record Loki log send result.
 */
export function trackLokiSend(status: 'success' | 'error' | 'dropped', count: number = 1): void {
  recordLokiLogsSent(status, count);
}
