/**
 * Alert Dispatcher — Centralized Alert Routing Hub
 * 
 * Phase 1, Project 2 of Metrics Expansion Bible
 * @see docs/projects/metrics-expansion-bible.md § Project 2
 * 
 * Purpose:
 * Routes system alerts from EventBus to appropriate destinations:
 * - Discord channel (#ops-alerts or configured channel)
 * - Admin DMs (CRITICAL/EMERGENCY only)
 * - Persistent JSON logs (for audit trail)
 * 
 * Features:
 * 1. EventBus subscription (alert.*, system.remediation.*)
 * 2. Severity-based routing (WARNING → channel, CRITICAL → channel + DM)
 * 3. Cooldown management via AlertThrottle integration
 * 4. Alert persistence for audit trail
 * 5. Startup grace period (prevents deploy false positives)
 * 6. Escalation after N consecutive alerts
 * 7. Test mode for development
 * 
 * Integration:
 * - Called from src/index.ts boot() after Event Bus ready
 * - Gracefully stopped in gracefulShutdown()
 * - Uses AlertThrottle for cooldown decisions
 * 
 * @module services/alert-dispatcher
 */

import { EventBus, type BusEvent } from '../shared/event-bus.js';
import { Client, type TextChannel, EmbedBuilder, type ColorResolvable } from 'discord.js';
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { performance } from 'node:perf_hooks';
import { log as logger } from '../shared/logging/index.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';
import {
  ALERT_DISPATCHER_ENABLED,
  ALERT_TEST_MODE,
  ALERT_CHANNEL_ID,
  ALERT_TEST_CHANNEL_ID,
  ALERT_ADMIN_USER_ID,
  ALERT_COOLDOWN_MS,
  ALERT_PERSIST_DIR,
  STARTUP_GRACE_PERIOD_MS,
  DRIP_USER_ID,
} from '../config/env.js';

// ============================================================================
// Types
// ============================================================================

/** Alert severity levels */
export type AlertLevel = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';

/** Alert payload from EventBus */
export interface AlertPayload {
  type: string;
  level: AlertLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp?: string;
  source?: string;
}

/** Internal alert record */
interface AlertRecord {
  id: string;
  type: string;
  level: AlertLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
  source: string;
  correlationId: string;
  routed: {
    channel: boolean;
    dm: boolean;
    persisted: boolean;
  };
  errors: string[];
}

/** Cooldown state per alert type */
interface CooldownState {
  lastSent: number;
  consecutiveCount: number;
}

/** Dispatcher status for observability */
export interface AlertDispatcherStatus {
  isRunning: boolean;
  enabled: boolean;
  testMode: boolean;
  inGracePeriod: boolean;
  gracePeriodRemainingMs: number;
  stats: {
    totalReceived: number;
    totalRouted: number;
    totalSuppressed: number;
    channelAlerts: number;
    dmAlerts: number;
    persistedAlerts: number;
    errors: number;
  };
  config: {
    channelId: string;
    adminUserId: string;
    cooldownMs: number;
    persistDir: string;
    gracePeriodMs: number;
  };
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  /** Master switch for dispatcher */
  enabled: ALERT_DISPATCHER_ENABLED,
  
  /** Route to test channel instead of production */
  testMode: ALERT_TEST_MODE,
  
  /** Discord channel for alerts */
  channelId: ALERT_TEST_MODE ? ALERT_TEST_CHANNEL_ID : ALERT_CHANNEL_ID,
  
  /** Admin user ID for DM alerts (default: DRIPTVDD) */
  adminUserId: ALERT_ADMIN_USER_ID || DRIP_USER_ID,
  
  /** Cooldown between same-type alerts (default: 1 hour) */
  cooldownMs: ALERT_COOLDOWN_MS,
  
  /** Escalation threshold (consecutive alerts before escalation) */
  escalationThreshold: 5,
  
  /** Directory for persisting critical alerts */
  persistDir: ALERT_PERSIST_DIR,
  
  /** Retention days for persisted alerts */
  retentionDays: 30,
  
  /** Startup grace period (no alerts during this window) */
  gracePeriodMs: STARTUP_GRACE_PERIOD_MS,
  
  /** EventBus patterns to subscribe to */
  patterns: [
    'alert.*',
    'alert.disk.*',
    'alert.memory.*',
    'alert.database.*',
    'system.remediation.*',
  ],
};

/** Color mapping for embed severity */
const LEVEL_COLORS: Record<AlertLevel, ColorResolvable> = {
  INFO: 0x3498db,      // Blue
  WARNING: 0xf39c12,   // Orange
  CRITICAL: 0xe74c3c,  // Red
  EMERGENCY: 0x9b59b6, // Purple (standout)
};

/** Emoji mapping for severity */
const LEVEL_EMOJI: Record<AlertLevel, string> = {
  INFO: 'ℹ️',
  WARNING: '⚠️',
  CRITICAL: '🚨',
  EMERGENCY: '🆘',
};

// ============================================================================
// Alert Dispatcher Class
// ============================================================================

class AlertDispatcher {
  private client: Client | null = null;
  private subscriptionIds: string[] = [];
  private cooldowns = new Map<string, CooldownState>();
  private bootTime = Date.now();
  private isRunning = false;
  
  // Statistics
  private stats = {
    totalReceived: 0,
    totalRouted: 0,
    totalSuppressed: 0,
    channelAlerts: 0,
    dmAlerts: 0,
    persistedAlerts: 0,
    errors: 0,
  };
  
  // ============================================================================
  // Lifecycle
  // ============================================================================
  
  /**
   * Initialize the alert dispatcher with Discord client
   */
  public initialize(client: Client): void {
    if (!CONFIG.enabled) {
      logger.info('[AlertDispatcher] Disabled via ALERT_DISPATCHER_ENABLED=false');
      return;
    }
    
    this.client = client;
    this.bootTime = Date.now();
    
    // Ensure persist directory exists
    this.ensurePersistDir();
    
    // Subscribe to EventBus patterns
    this.subscribeToPatterns();
    
    this.isRunning = true;
    
    logger.info('[AlertDispatcher] Initialized', {
      category: 'SYSTEM',
      data: {
        channelId: CONFIG.channelId,
        adminUserId: CONFIG.adminUserId,
        testMode: CONFIG.testMode,
        gracePeriodMs: CONFIG.gracePeriodMs,
        patterns: CONFIG.patterns,
      },
    });
    
    // Emit startup event
    EventBus.getInstance().emit('system.service.started', {
      service: 'alert-dispatcher',
      config: {
        channelId: CONFIG.channelId,
        testMode: CONFIG.testMode,
      },
    }, { emitter: 'alert-dispatcher' });
  }
  
  /**
   * Stop the dispatcher and unsubscribe from EventBus
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }
    
    // Unsubscribe from all patterns
    for (const subId of this.subscriptionIds) {
      EventBus.getInstance().unsubscribe(subId);
    }
    this.subscriptionIds = [];
    
    this.isRunning = false;
    
    logger.info('[AlertDispatcher] Stopped', {
      category: 'SYSTEM',
      data: {
        totalReceived: this.stats.totalReceived,
        totalRouted: this.stats.totalRouted,
        totalSuppressed: this.stats.totalSuppressed,
      },
    });
    
    // Emit shutdown event
    EventBus.getInstance().emit('system.service.stopped', {
      service: 'alert-dispatcher',
      stats: { ...this.stats },
    }, { emitter: 'alert-dispatcher' });
  }
  
  // ============================================================================
  // EventBus Integration
  // ============================================================================
  
  /**
   * Subscribe to all configured EventBus patterns
   */
  private subscribeToPatterns(): void {
    for (const pattern of CONFIG.patterns) {
      const subId = EventBus.getInstance().subscribe(pattern, (event: BusEvent<unknown>) => {
        void this.handleEvent(event);
      });
      this.subscriptionIds.push(subId);
    }
    
    logger.info('[AlertDispatcher] Subscribed to EventBus patterns', {
      category: 'SYSTEM',
      data: { patterns: CONFIG.patterns, subscriptionCount: this.subscriptionIds.length },
    });
  }
  
  /**
   * Handle incoming EventBus event
   */
  private async handleEvent(event: BusEvent<unknown>): Promise<void> {
    this.stats.totalReceived++;
    
    try {
      // Parse alert payload
      const payload = this.parsePayload(event);
      
      // Check grace period
      if (this.isInGracePeriod()) {
        this.stats.totalSuppressed++;
        logger.debug('[AlertDispatcher] Alert suppressed (grace period)', {
          category: 'SYSTEM',
          data: {
            type: payload.type,
            level: payload.level,
            gracePeriodRemainingMs: this.getGracePeriodRemainingMs(),
          },
        });
        return;
      }
      
      // Check cooldown
      const cooldownKey = `${payload.level}:${payload.type}`;
      if (this.isCoolingDown(cooldownKey)) {
        this.stats.totalSuppressed++;
        logger.debug('[AlertDispatcher] Alert suppressed (cooldown)', {
          category: 'SYSTEM',
          data: { type: payload.type, level: payload.level },
        });
        return;
      }
      
      // Create alert record
      const record = this.createRecord(event, payload);
      
      // Route based on severity
      await this.routeAlert(record);
      
      // Update cooldown
      this.updateCooldown(cooldownKey);
      
      this.stats.totalRouted++;
      
    } catch (error) {
      this.stats.errors++;
      logger.error('[AlertDispatcher] Error handling event', {
        category: 'SYSTEM',
        data: {
          topic: event.topic,
          error: getErrorMessage(error),
        },
      });
    }
  }
  
  /**
   * Parse event payload into AlertPayload
   */
  private parsePayload(event: BusEvent<unknown>): AlertPayload {
    const payload = event.payload as Partial<AlertPayload>;
    
    // Infer level from topic if not provided
    let level: AlertLevel = payload.level ?? 'INFO';
    if (!payload.level) {
      if (event.topic.includes('emergency')) level = 'EMERGENCY';
      else if (event.topic.includes('critical')) level = 'CRITICAL';
      else if (event.topic.includes('warning')) level = 'WARNING';
    }
    
    return {
      type: payload.type ?? event.topic,
      level,
      message: payload.message ?? `Alert: ${event.topic}`,
      data: payload.data,
      timestamp: payload.timestamp ?? event.timestamp.toISOString(),
      source: payload.source ?? event.emitter ?? 'unknown',
    };
  }
  
  /**
   * Create internal alert record
   */
  private createRecord(event: BusEvent<unknown>, payload: AlertPayload): AlertRecord {
    return {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: payload.type,
      level: payload.level,
      message: payload.message,
      data: payload.data,
      timestamp: new Date(),
      source: payload.source ?? 'unknown',
      correlationId: event.correlationId,
      routed: {
        channel: false,
        dm: false,
        persisted: false,
      },
      errors: [],
    };
  }
  
  // ============================================================================
  // Routing Logic
  // ============================================================================
  
  /**
   * Route alert to appropriate destinations based on severity
   * 
   * Routing rules:
   * - INFO: Log only (no Discord notification)
   * - WARNING: Discord channel
   * - CRITICAL: Discord channel + Admin DM
   * - EMERGENCY: Discord channel + Admin DM + @here + Persist
   */
  private async routeAlert(record: AlertRecord): Promise<void> {
    const startTime = performance.now();
    
    // INFO level: Log only
    if (record.level === 'INFO') {
      logger.info('[AlertDispatcher] Info alert (no routing)', {
        category: 'SYSTEM',
        data: { type: record.type, message: record.message },
      });
      return;
    }
    
    // WARNING and above: Channel notification
    if (['WARNING', 'CRITICAL', 'EMERGENCY'].includes(record.level)) {
      await this.sendToChannel(record);
    }
    
    // CRITICAL and above: Admin DM
    if (['CRITICAL', 'EMERGENCY'].includes(record.level)) {
      await this.sendToDM(record);
    }
    
    // EMERGENCY: Persist for audit trail
    if (record.level === 'EMERGENCY') {
      this.persistAlert(record);
    }
    
    // Also persist CRITICAL alerts
    if (record.level === 'CRITICAL') {
      this.persistAlert(record);
    }
    
    const durationMs = performance.now() - startTime;
    
    logger.info('[AlertDispatcher] Alert routed', {
      category: 'SYSTEM',
      data: {
        id: record.id,
        type: record.type,
        level: record.level,
        routed: record.routed,
        durationMs: durationMs.toFixed(2),
        errors: record.errors.length > 0 ? record.errors : undefined,
      },
    });
  }
  
  /**
   * Send alert to Discord channel
   */
  private async sendToChannel(record: AlertRecord): Promise<void> {
    if (!this.client || !CONFIG.channelId) {
      record.errors.push('No Discord client or channel ID configured');
      return;
    }
    
    try {
      const channel = await this.client.channels.fetch(CONFIG.channelId);
      
      if (!channel || !channel.isTextBased()) {
        record.errors.push(`Channel ${CONFIG.channelId} not found or not text-based`);
        return;
      }
      
      const embed = this.createEmbed(record);
      
      // Add @here for EMERGENCY
      const content = record.level === 'EMERGENCY' ? '@here' : undefined;
      
      await (channel as TextChannel).send({
        content,
        embeds: [embed],
      });
      
      record.routed.channel = true;
      this.stats.channelAlerts++;
      
    } catch (error) {
      record.errors.push(`Channel send failed: ${getErrorMessage(error)}`);
      this.stats.errors++;
    }
  }
  
  /**
   * Send alert to admin via DM
   */
  private async sendToDM(record: AlertRecord): Promise<void> {
    if (!this.client || !CONFIG.adminUserId) {
      record.errors.push('No Discord client or admin user ID configured');
      return;
    }
    
    try {
      const user = await this.client.users.fetch(CONFIG.adminUserId);
      
      if (!user) {
        record.errors.push(`User ${CONFIG.adminUserId} not found`);
        return;
      }
      
      const embed = this.createEmbed(record);
      
      // Add urgency indicator for EMERGENCY
      const content = record.level === 'EMERGENCY' 
        ? '🆘 **EMERGENCY ALERT** — Immediate action may be required!'
        : undefined;
      
      await user.send({
        content,
        embeds: [embed],
      });
      
      record.routed.dm = true;
      this.stats.dmAlerts++;
      
    } catch (error) {
      record.errors.push(`DM send failed: ${getErrorMessage(error)}`);
      this.stats.errors++;
    }
  }
  
  /**
   * Create Discord embed for alert
   */
  private createEmbed(record: AlertRecord): EmbedBuilder {
    const emoji = LEVEL_EMOJI[record.level];
    const color = LEVEL_COLORS[record.level];
    
    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${record.level}: ${record.type}`)
      .setDescription(record.message)
      .setColor(color)
      .setTimestamp(record.timestamp)
      .setFooter({ text: `Source: ${record.source} | ID: ${record.id}` });
    
    // Add data fields if present
    if (record.data) {
      const dataStr = JSON.stringify(record.data, null, 2);
      if (dataStr.length <= 1000) {
        embed.addFields({
          name: 'Details',
          value: `\`\`\`json\n${dataStr}\n\`\`\``,
          inline: false,
        });
      } else {
        embed.addFields({
          name: 'Details',
          value: `\`\`\`json\n${dataStr.slice(0, 950)}...\n\`\`\``,
          inline: false,
        });
      }
    }
    
    // Add test mode indicator
    if (CONFIG.testMode) {
      embed.addFields({
        name: '⚠️ Test Mode',
        value: 'This alert was sent in test mode',
        inline: false,
      });
    }
    
    return embed;
  }
  
  // ============================================================================
  // Persistence
  // ============================================================================
  
  /**
   * Ensure persist directory exists
   */
  private ensurePersistDir(): void {
    try {
      if (!existsSync(CONFIG.persistDir)) {
        mkdirSync(CONFIG.persistDir, { recursive: true });
        logger.info('[AlertDispatcher] Created persist directory', {
          category: 'SYSTEM',
          data: { path: CONFIG.persistDir },
        });
      }
    } catch (error) {
      logger.warn('[AlertDispatcher] Failed to create persist directory', {
        category: 'SYSTEM',
        data: { path: CONFIG.persistDir, error: getErrorMessage(error) },
      });
    }
  }
  
  /**
   * Persist alert to JSON file for audit trail
   */
  private persistAlert(record: AlertRecord): void {
    try {
      const filename = `${record.timestamp.toISOString().replace(/[:.]/g, '-')}_${record.level}_${record.id}.json`;
      const filepath = pathJoin(CONFIG.persistDir, filename);
      
      const data = {
        ...record,
        persistedAt: new Date().toISOString(),
      };
      
      writeFileSync(filepath, JSON.stringify(data, null, 2));
      
      record.routed.persisted = true;
      this.stats.persistedAlerts++;
      
      // Cleanup old alerts
      this.cleanupOldAlerts();
      
    } catch (error) {
      record.errors.push(`Persist failed: ${getErrorMessage(error)}`);
      this.stats.errors++;
    }
  }
  
  /**
   * Cleanup alerts older than retention period
   */
  private cleanupOldAlerts(): void {
    try {
      if (!existsSync(CONFIG.persistDir)) {
        return;
      }
      
      const files = readdirSync(CONFIG.persistDir);
      const retentionMs = CONFIG.retentionDays * 24 * 60 * 60 * 1000;
      const now = Date.now();
      let cleaned = 0;
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filepath = pathJoin(CONFIG.persistDir, file);
        const fileStat = statSync(filepath);
        
        if (now - fileStat.mtimeMs > retentionMs) {
          unlinkSync(filepath);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        logger.info('[AlertDispatcher] Cleaned up old alerts', {
          category: 'SYSTEM',
          data: { count: cleaned, retentionDays: CONFIG.retentionDays },
        });
      }
      
    } catch (error) {
      logger.warn('[AlertDispatcher] Cleanup failed', {
        category: 'SYSTEM',
        data: { error: getErrorMessage(error) },
      });
    }
  }
  
  // ============================================================================
  // Cooldown Management
  // ============================================================================
  
  /**
   * Check if alert type is cooling down
   */
  private isCoolingDown(key: string): boolean {
    const state = this.cooldowns.get(key);
    if (!state) return false;
    
    return Date.now() - state.lastSent < CONFIG.cooldownMs;
  }
  
  /**
   * Update cooldown state for alert type
   */
  private updateCooldown(key: string): void {
    const existing = this.cooldowns.get(key);
    
    this.cooldowns.set(key, {
      lastSent: Date.now(),
      consecutiveCount: (existing?.consecutiveCount ?? 0) + 1,
    });
    
    // Check for escalation
    const state = this.cooldowns.get(key)!;
    if (state.consecutiveCount >= CONFIG.escalationThreshold) {
      logger.warn('[AlertDispatcher] Alert escalation threshold reached', {
        category: 'SYSTEM',
        data: {
          key,
          consecutiveCount: state.consecutiveCount,
          threshold: CONFIG.escalationThreshold,
        },
      });
      
      // Emit escalation event
      EventBus.getInstance().emit('alert.escalation', {
        type: key,
        consecutiveCount: state.consecutiveCount,
        threshold: CONFIG.escalationThreshold,
      }, { emitter: 'alert-dispatcher' });
    }
  }
  
  // ============================================================================
  // Grace Period
  // ============================================================================
  
  /**
   * Check if still in startup grace period
   */
  private isInGracePeriod(): boolean {
    return Date.now() - this.bootTime < CONFIG.gracePeriodMs;
  }
  
  /**
   * Get remaining grace period time
   */
  private getGracePeriodRemainingMs(): number {
    const remaining = CONFIG.gracePeriodMs - (Date.now() - this.bootTime);
    return Math.max(0, remaining);
  }
  
  // ============================================================================
  // Public API
  // ============================================================================
  
  /**
   * Get dispatcher status for observability
   */
  public getStatus(): AlertDispatcherStatus {
    return {
      isRunning: this.isRunning,
      enabled: CONFIG.enabled,
      testMode: CONFIG.testMode,
      inGracePeriod: this.isInGracePeriod(),
      gracePeriodRemainingMs: this.getGracePeriodRemainingMs(),
      stats: { ...this.stats },
      config: {
        channelId: CONFIG.channelId,
        adminUserId: CONFIG.adminUserId,
        cooldownMs: CONFIG.cooldownMs,
        persistDir: CONFIG.persistDir,
        gracePeriodMs: CONFIG.gracePeriodMs,
      },
    };
  }
  
  /**
   * Send a test alert (for /ops test-alert command)
   */
  public async sendTestAlert(level: AlertLevel = 'WARNING'): Promise<{ success: boolean; errors: string[] }> {
    const record: AlertRecord = {
      id: `test-${Date.now()}`,
      type: 'test.alert',
      level,
      message: `This is a test ${level} alert sent via /ops test-alert`,
      timestamp: new Date(),
      source: 'ops-command',
      correlationId: `test-${Date.now()}`,
      routed: {
        channel: false,
        dm: false,
        persisted: false,
      },
      errors: [],
    };
    
    await this.routeAlert(record);
    
    return {
      success: record.errors.length === 0,
      errors: record.errors,
    };
  }
  
  /**
   * Manually trigger an alert (bypass EventBus)
   */
  public async sendAlert(payload: AlertPayload): Promise<{ success: boolean; errors: string[] }> {
    const record: AlertRecord = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: payload.type,
      level: payload.level,
      message: payload.message,
      data: payload.data,
      timestamp: new Date(),
      source: payload.source ?? 'manual',
      correlationId: `manual-${Date.now()}`,
      routed: {
        channel: false,
        dm: false,
        persisted: false,
      },
      errors: [],
    };
    
    // Check grace period for manual alerts too
    if (this.isInGracePeriod()) {
      return {
        success: false,
        errors: [`Alert suppressed: Still in grace period (${this.getGracePeriodRemainingMs()}ms remaining)`],
      };
    }
    
    await this.routeAlert(record);
    
    return {
      success: record.errors.length === 0,
      errors: record.errors,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const alertDispatcher = new AlertDispatcher();

export default alertDispatcher;
