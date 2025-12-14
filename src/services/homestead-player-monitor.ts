/**
 * Homestead Player Monitor
 * 
 * CONCEPT: VS Code-style continuous background integrity checking
 * 
 * Unlike the hourly cron job that checks all homesteads at once,
 * this monitor provides FAIR, DEDICATED checking for each player:
 * - Every player gets their homestead checked at a steady pace
 * - No player is left waiting for the hourly batch
 * - Proactive recreation before the user notices anything wrong
 * 
 * ARCHITECTURE:
 * - Runs in main bot process (no extra Render cost)
 * - Round-robin queue: oldest lastHealthCheck processed first
 * - Rate: ~1 player/second (3600 players/hour capacity)
 * - Non-blocking: checks run in background, don't affect gameplay
 * 
 * INTEGRATION:
 * - Uses PlayerCheckpointService for recovery when issues found
 * - Uses HomesteadChannelManager for channel recreation
 * - Updates lastHealthCheck timestamp in database
 * 
 * @module homestead-player-monitor
 */

import { Client } from 'discord.js';
import { prisma } from '../shared/prisma.js';
import { log } from '../utils/logger.js';
import { HomesteadChannelManager } from './homestead-manager.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';
import { HOMESTEAD_CHECK_INTERVAL_MS, HOMESTEAD_MIN_RECHECK_MS } from '../config/env.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Time between individual player checks (in milliseconds)
 * 1000ms = 1 player/second = 3600 players/hour
 * Adjust based on player count and Discord API limits
 */
const CHECK_INTERVAL_MS = HOMESTEAD_CHECK_INTERVAL_MS;

/**
 * Minimum time between rechecking the same player (in milliseconds)
 * Default: 1 hour - players won't be rechecked more than once per hour
 */
const MIN_RECHECK_INTERVAL_MS = HOMESTEAD_MIN_RECHECK_MS;

/**
 * Batch size for fetching players to check
 * Fetch in batches to reduce DB queries
 */
const FETCH_BATCH_SIZE = 100;

/**
 * Maximum consecutive errors before pausing
 * Prevents runaway error loops
 */
const MAX_CONSECUTIVE_ERRORS = 10;

/**
 * Pause duration after max errors (in milliseconds)
 */
const ERROR_PAUSE_MS = 60 * 1000; // 1 minute

// ============================================================================
// Types
// ============================================================================

interface MonitorStats {
  totalChecks: number;
  successfulChecks: number;
  issuesFound: number;
  issuesHealed: number;
  consecutiveErrors: number;
  lastCheckAt: Date | null;
  startedAt: Date | null;
  pausedUntil: Date | null;
}

interface PlayerCheckResult {
  userId: string;
  discordId: string;
  status: 'healthy' | 'missing' | 'recreated' | 'error';
  details?: string;
}

// ============================================================================
// Homestead Player Monitor Class
// ============================================================================

export class HomesteadPlayerMonitor {
  private client: Client;
  private guildId: string;
  private running: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private stats: MonitorStats;
  
  // Queue management
  private playerQueue: string[] = []; // Array of userIds to check
  private queueIndex: number = 0;
  private lastQueueRefresh: Date | null = null;
  
  constructor(client: Client, guildId: string) {
    this.client = client;
    this.guildId = guildId;
    this.stats = this.createEmptyStats();
  }
  
  private createEmptyStats(): MonitorStats {
    return {
      totalChecks: 0,
      successfulChecks: 0,
      issuesFound: 0,
      issuesHealed: 0,
      consecutiveErrors: 0,
      lastCheckAt: null,
      startedAt: null,
      pausedUntil: null,
    };
  }
  
  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------
  
  /**
   * Start the background monitor
   * Runs continuously, checking one player at a time
   */
  start(): void {
    if (this.running) {
      log.warn('[HomesteadMonitor] Already running', { guildId: this.guildId });
      return;
    }
    
    this.running = true;
    this.stats.startedAt = new Date();
    
    log.info('[HomesteadMonitor] Starting background monitor', {
      guildId: this.guildId,
      checkIntervalMs: CHECK_INTERVAL_MS,
      minRecheckMs: MIN_RECHECK_INTERVAL_MS,
    });
    
    // Start the check loop
    this.scheduleNextCheck();
  }
  
  /**
   * Stop the background monitor gracefully
   */
  stop(): void {
    if (!this.running) {
      return;
    }
    
    this.running = false;
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    log.info('[HomesteadMonitor] Stopped', {
      guildId: this.guildId,
      stats: this.getStats(),
    });
  }
  
  /**
   * Get current monitor statistics
   */
  getStats(): MonitorStats & { queueSize: number; isRunning: boolean } {
    return {
      ...this.stats,
      queueSize: this.playerQueue.length,
      isRunning: this.running,
    };
  }
  
  /**
   * Force an immediate check for a specific player
   * Useful for /ops commands or manual intervention
   */
  async checkPlayerNow(userId: string): Promise<PlayerCheckResult> {
    return this.checkSinglePlayer(userId);
  }
  
  // --------------------------------------------------------------------------
  // Queue Management
  // --------------------------------------------------------------------------
  
  /**
   * Refresh the player queue from database
   * Orders by oldest lastHealthCheck first (fairness)
   */
  private async refreshQueue(): Promise<void> {
    const cutoff = new Date(Date.now() - MIN_RECHECK_INTERVAL_MS);
    
    // Fetch players who haven't been checked recently
    // Ordered by lastHealthCheck ASC (oldest first = most fair)
    const players = await prisma.homesteadChannel.findMany({
      where: {
        guildId: this.guildId,
        status: 'active',
        OR: [
          { lastHealthCheck: null },
          { lastHealthCheck: { lt: cutoff } }
        ]
      },
      select: { userId: true, lastHealthCheck: true },
      orderBy: { lastHealthCheck: 'asc' },
      take: FETCH_BATCH_SIZE,
    });
    
    this.playerQueue = players.map(p => p.userId);
    this.queueIndex = 0;
    this.lastQueueRefresh = new Date();
    
    log.info('[HomesteadMonitor] Queue refreshed', {
      guildId: this.guildId,
      playersInQueue: this.playerQueue.length,
      oldestCheck: players[0]?.lastHealthCheck?.toISOString() || 'never',
    });
  }
  
  /**
   * Get the next player to check from the queue
   * Refreshes queue if empty or exhausted
   */
  private async getNextPlayer(): Promise<string | null> {
    // If queue is empty or exhausted, refresh it
    if (this.queueIndex >= this.playerQueue.length) {
      await this.refreshQueue();
    }
    
    // If still empty after refresh, no players need checking
    if (this.playerQueue.length === 0) {
      return null;
    }
    
    const userId = this.playerQueue[this.queueIndex];
    this.queueIndex++;
    
    return userId;
  }
  
  // --------------------------------------------------------------------------
  // Check Loop
  // --------------------------------------------------------------------------
  
  /**
   * Schedule the next player check
   */
  private scheduleNextCheck(): void {
    if (!this.running) {
      return;
    }
    
    // Check if we're in error pause
    if (this.stats.pausedUntil && this.stats.pausedUntil > new Date()) {
      const remainingMs = this.stats.pausedUntil.getTime() - Date.now();
      log.warn('[HomesteadMonitor] Paused due to errors', {
        remainingMs,
        consecutiveErrors: this.stats.consecutiveErrors,
      });
      this.timer = setTimeout(() => this.runCheckCycle(), remainingMs);
      return;
    }
    
    this.timer = setTimeout(() => this.runCheckCycle(), CHECK_INTERVAL_MS);
  }
  
  /**
   * Run a single check cycle
   * Gets next player, checks their homestead, schedules next cycle
   */
  private async runCheckCycle(): Promise<void> {
    if (!this.running) {
      return;
    }
    
    try {
      const userId = await this.getNextPlayer();
      
      if (!userId) {
        // No players need checking right now
        // Wait a bit longer before checking again
        log.info('[HomesteadMonitor] All players healthy, waiting for next cycle', {
          guildId: this.guildId,
        });
        this.timer = setTimeout(() => this.runCheckCycle(), CHECK_INTERVAL_MS * 10);
        return;
      }
      
      // Check this player
      const result = await this.checkSinglePlayer(userId);
      
      // Update stats
      this.stats.totalChecks++;
      this.stats.lastCheckAt = new Date();
      
      if (result.status === 'healthy') {
        this.stats.successfulChecks++;
        this.stats.consecutiveErrors = 0;
      } else if (result.status === 'recreated') {
        this.stats.issuesFound++;
        this.stats.issuesHealed++;
        this.stats.consecutiveErrors = 0;
      } else if (result.status === 'error') {
        this.stats.consecutiveErrors++;
        
        // Check if we need to pause
        if (this.stats.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          this.stats.pausedUntil = new Date(Date.now() + ERROR_PAUSE_MS);
          log.warn('[HomesteadMonitor] Too many errors, pausing', {
            guildId: this.guildId,
            consecutiveErrors: this.stats.consecutiveErrors,
            pauseMs: ERROR_PAUSE_MS,
          });
        }
      }
      
    } catch (error) {
      log.error('[HomesteadMonitor] Check cycle error', {
        guildId: this.guildId,
        error: getErrorMessage(error),
      });
      this.stats.consecutiveErrors++;
    }
    
    // Schedule next check
    this.scheduleNextCheck();
  }
  
  // --------------------------------------------------------------------------
  // Single Player Check
  // --------------------------------------------------------------------------
  
  /**
   * Check a single player's homestead integrity
   * This is the core verification logic
   */
  private async checkSinglePlayer(userId: string): Promise<PlayerCheckResult> {
    try {
      // Get player's homestead record with user relation
      const homestead = await prisma.homesteadChannel.findFirst({
        where: { userId, guildId: this.guildId },
        include: { user: true }
      });
      
      if (!homestead) {
        return {
          userId,
          discordId: 'unknown',
          status: 'healthy',
          details: 'No homestead record (new player)',
        };
      }
      
      // Try to verify the Discord channel exists
      let channelExists = false;
      try {
        const guild = await this.client.guilds.fetch(this.guildId);
        const channel = await guild.channels.fetch(homestead.channelId);
        channelExists = channel !== null;
      } catch {
        // Channel fetch failed - treat as missing
        channelExists = false;
      }
      
      // Update lastHealthCheck regardless of result
      await prisma.homesteadChannel.update({
        where: { id: homestead.id },
        data: { lastHealthCheck: new Date() }
      });
      
      if (channelExists) {
        return {
          userId,
          discordId: homestead.user.discordId,
          status: 'healthy',
          details: 'Channel verified',
        };
      }
      
      // Channel is missing! Trigger proactive recovery
      log.info('[HomesteadMonitor] Missing channel detected, triggering recovery', {
        userId,
        discordId: homestead.user.discordId,
        channelId: homestead.channelId,
      });
      
      // Fetch the Discord user for recreation
      try {
        const discordUser = await this.client.users.fetch(homestead.user.discordId);
        
        // Use HomesteadChannelManager to recreate
        // This will also trigger the recovery diagnostics
        const manager = new HomesteadChannelManager(this.client, this.guildId);
        await manager.getOrCreateChannel(discordUser);
        
        return {
          userId,
          discordId: homestead.user.discordId,
          status: 'recreated',
          details: 'Channel was missing, proactively recreated',
        };
        
      } catch (recreateError) {
        log.error('[HomesteadMonitor] Failed to recreate channel', {
          userId,
          discordId: homestead.user.discordId,
          error: getErrorMessage(recreateError),
        });
        
        return {
          userId,
          discordId: homestead.user.discordId,
          status: 'error',
          details: `Recreation failed: ${getErrorMessage(recreateError)}`,
        };
      }
      
    } catch (error) {
      return {
        userId,
        discordId: 'unknown',
        status: 'error',
        details: getErrorMessage(error),
      };
    }
  }
}

// ============================================================================
// Factory & Global Instance
// ============================================================================

// Global monitor instances per guild
const monitors = new Map<string, HomesteadPlayerMonitor>();

/**
 * Get or create a monitor for a specific guild
 */
export function getHomesteadMonitor(
  client: Client, 
  guildId: string
): HomesteadPlayerMonitor {
  let monitor = monitors.get(guildId);
  
  if (!monitor) {
    monitor = new HomesteadPlayerMonitor(client, guildId);
    monitors.set(guildId, monitor);
  }
  
  return monitor;
}

/**
 * Start monitors for all guilds the bot is in
 * Call this on bot ready
 */
export async function startAllHomesteadMonitors(client: Client): Promise<void> {
  // Get all guilds with homesteads
  const guilds = await prisma.homesteadChannel.findMany({
    select: { guildId: true },
    distinct: ['guildId'],
    where: { status: 'active' }
  });
  
  log.info('[HomesteadMonitor] Starting monitors for all guilds', {
    guildCount: guilds.length,
  });
  
  for (const { guildId } of guilds) {
    const monitor = getHomesteadMonitor(client, guildId);
    monitor.start();
  }
}

/**
 * Stop all monitors (call on bot shutdown)
 */
export function stopAllHomesteadMonitors(): void {
  log.info('[HomesteadMonitor] Stopping all monitors', {
    monitorCount: monitors.size,
  });
  
  for (const monitor of monitors.values()) {
    monitor.stop();
  }
  
  monitors.clear();
}

/**
 * Get stats for all monitors (for /ops commands)
 */
export function getAllMonitorStats(): Record<string, ReturnType<HomesteadPlayerMonitor['getStats']>> {
  const stats: Record<string, ReturnType<HomesteadPlayerMonitor['getStats']>> = {};
  
  for (const [guildId, monitor] of monitors) {
    stats[guildId] = monitor.getStats();
  }
  
  return stats;
}
