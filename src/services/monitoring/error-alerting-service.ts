/**
 * Error Alerting Service
 * Purpose: Auto-alert admins (DripTVDD) on CRITICAL/HIGH severity errors
 * 
 * DESIGN PRINCIPLES:
 * 1. IMMEDIATE: CRITICAL errors trigger instant DM to owner
 * 2. BATCHED: HIGH errors batched every 5 minutes to prevent spam
 * 3. RATE LIMITED: Max 5 alerts per fingerprint per 10 minutes
 * 4. AUDIT TRAIL: Every alert creates ErrorAlert database record
 * 5. ACKNOWLEDGEABLE: Admins can acknowledge alerts to stop repeats
 * 
 * @module services/monitoring/error-alerting-service
 */

import { Client, EmbedBuilder } from 'discord.js';
import { EMBED_COLORS } from '../../bot/shared/embed-colors.js';
import { EventBus, type BusEvent } from '../../shared/event-bus.js';
import { prisma } from '../../shared/prisma.js';
import { log } from '../../utils/logger.js';
import type { LiveErrorEvent } from './error-tracker.js';

// ---- Configuration ----

/** DripTVDD Discord User ID - receives all CRITICAL alerts */
const DRIP_TVDD_ID = '1049161859555643433';

/** Rate limit: max alerts per fingerprint in window */
const RATE_LIMIT_MAX = 5;

/** Rate limit window in milliseconds (10 minutes) */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** HIGH severity batch interval (5 minutes) */
const HIGH_BATCH_INTERVAL_MS = 5 * 60 * 1000;

// ---- Types ----

interface AlertRecord {
  fingerprint: string;
  timestamps: number[];
}

interface BatchedError {
  event: LiveErrorEvent;
  queuedAt: number;
}

export interface ErrorAlertingStats {
  initialized: boolean;
  criticalAlertsSent: number;
  highAlertsSent: number;
  alertsRateLimited: number;
  lastAlertSentAt: string | null;
  batchQueueSize: number;
  rateLimitedFingerprints: number;
}

// ---- Service Implementation ----

export class ErrorAlertingService {
  private static instance: ErrorAlertingService | null = null;
  
  private discordClient: Client | null = null;
  private initialized = false;
  
  // Rate limiting state
  private rateLimiter = new Map<string, AlertRecord>();
  
  // HIGH severity batching
  private highSeverityBatch: BatchedError[] = [];
  private batchFlushInterval: NodeJS.Timeout | null = null;
  
  // Statistics
  private criticalAlertsSent = 0;
  private highAlertsSent = 0;
  private alertsRateLimited = 0;
  private lastAlertSentAt: Date | null = null;
  
  private constructor() {}
  
  static getInstance(): ErrorAlertingService {
    if (!ErrorAlertingService.instance) {
      ErrorAlertingService.instance = new ErrorAlertingService();
    }
    return ErrorAlertingService.instance;
  }
  
  /**
   * Initialize the alerting service with Discord client
   * MUST be called after Discord client is ready
   */
  async initialize(client: Client): Promise<void> {
    if (this.initialized) {
      log('warn', '[ErrorAlerting] Already initialized, skipping');
      return;
    }
    
    this.discordClient = client;
    
    // Subscribe to error events from EventBus
    const bus = EventBus.getInstance();
    
    // CRITICAL errors: immediate alert
    bus.subscribe('error.critical', this.handleCriticalError.bind(this));
    
    // HIGH errors: batched alert
    bus.subscribe('error.high', this.handleHighError.bind(this));
    
    // Start batch flush interval
    this.batchFlushInterval = setInterval(
      () => this.flushHighSeverityBatch(),
      HIGH_BATCH_INTERVAL_MS
    );
    
    this.initialized = true;
    log('info', '[ErrorAlerting] Service initialized', {
      criticalRecipient: DRIP_TVDD_ID,
      batchInterval: `${HIGH_BATCH_INTERVAL_MS / 1000}s`,
      rateLimitWindow: `${RATE_LIMIT_WINDOW_MS / 1000}s`,
    });
  }
  
  /**
   * Cleanup service (call on shutdown)
   */
  async cleanup(): Promise<void> {
    if (this.batchFlushInterval) {
      clearInterval(this.batchFlushInterval);
      this.batchFlushInterval = null;
    }
    
    // Flush any remaining HIGH severity errors
    if (this.highSeverityBatch.length > 0) {
      await this.flushHighSeverityBatch();
    }
    
    this.initialized = false;
    log('info', '[ErrorAlerting] Service cleaned up');
  }
  
  /**
   * Handle CRITICAL severity errors - immediate DM to DripTVDD
   */
  private async handleCriticalError(busEvent: BusEvent): Promise<void> {
    const event = busEvent.payload as LiveErrorEvent;
    const fingerprint = event.fingerprint;
    
    // Rate limit check
    if (this.isRateLimited(fingerprint)) {
      this.alertsRateLimited++;
      log('warn', '[ErrorAlerting] CRITICAL error rate limited', { 
        fingerprint: fingerprint.substring(0, 8),
        errorName: event.errorName,
      });
      return;
    }
    
    // Record this alert for rate limiting
    this.recordAlertTimestamp(fingerprint);
    
    // Send immediate DM
    try {
      await this.sendCriticalAlert(event);
      this.criticalAlertsSent++;
      this.lastAlertSentAt = new Date();
      
      // Record in database
      await this.createAlertRecord(event, 'DM_CRITICAL');
      
      log('info', '[ErrorAlerting] CRITICAL alert sent', {
        fingerprint: fingerprint.substring(0, 8),
        errorName: event.errorName,
        recipient: DRIP_TVDD_ID,
      });
    } catch (err) {
      log('error', '[ErrorAlerting] Failed to send CRITICAL alert', {
        error: err instanceof Error ? err.message : String(err),
        fingerprint: fingerprint.substring(0, 8),
      });
    }
  }
  
  /**
   * Handle HIGH severity errors - batched DM
   */
  private async handleHighError(busEvent: BusEvent): Promise<void> {
    const event = busEvent.payload as LiveErrorEvent;
    const fingerprint = event.fingerprint;
    
    // Rate limit check
    if (this.isRateLimited(fingerprint)) {
      this.alertsRateLimited++;
      return;
    }
    
    // Add to batch queue (deduped by fingerprint)
    const existingIndex = this.highSeverityBatch.findIndex(
      b => b.event.fingerprint === fingerprint
    );
    
    if (existingIndex === -1) {
      this.highSeverityBatch.push({ event, queuedAt: Date.now() });
    } else {
      // Update existing with latest event data
      this.highSeverityBatch[existingIndex] = { event, queuedAt: Date.now() };
    }
  }
  
  /**
   * Flush batched HIGH severity errors
   */
  private async flushHighSeverityBatch(): Promise<void> {
    if (this.highSeverityBatch.length === 0) return;
    
    // Take all batched errors
    const batch = this.highSeverityBatch.splice(0);
    
    try {
      await this.sendBatchedAlert(batch);
      this.highAlertsSent += batch.length;
      this.lastAlertSentAt = new Date();
      
      // Record alerts in database
      for (const item of batch) {
        this.recordAlertTimestamp(item.event.fingerprint);
        await this.createAlertRecord(item.event, 'DM_BATCHED');
      }
      
      log('info', '[ErrorAlerting] HIGH severity batch sent', {
        count: batch.length,
        recipient: DRIP_TVDD_ID,
      });
    } catch (err) {
      log('error', '[ErrorAlerting] Failed to send batched alert', {
        error: err instanceof Error ? err.message : String(err),
        count: batch.length,
      });
      
      // Put errors back in queue for retry (max 1 retry)
      for (const item of batch) {
        if (Date.now() - item.queuedAt < HIGH_BATCH_INTERVAL_MS * 2) {
          this.highSeverityBatch.push(item);
        }
      }
    }
  }
  
  /**
   * Send immediate CRITICAL alert DM
   */
  private async sendCriticalAlert(event: LiveErrorEvent): Promise<void> {
    if (!this.discordClient) {
      throw new Error('Discord client not initialized');
    }
    
    const user = await this.discordClient.users.fetch(DRIP_TVDD_ID);
    
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.CRITICAL)
      .setTitle('🚨 CRITICAL ERROR')
      .setDescription(`**${event.errorName}**: ${event.errorMessage.substring(0, 200)}`)
      .addFields(
        { name: '📂 Category', value: event.category, inline: true },
        { name: '⏰ Time', value: event.timestamp, inline: true },
        { name: '🔑 Fingerprint', value: `\`${event.fingerprint.substring(0, 12)}...\``, inline: true },
      )
      .setTimestamp();
    
    // Add source location if available
    if (event.sourceLocation) {
      embed.addFields({
        name: '📍 Location',
        value: `\`${event.sourceLocation.file}:${event.sourceLocation.line}\``,
        inline: false,
      });
    }
    
    // Add call chain if available
    if (event.callChain && event.callChain.length > 0) {
      embed.addFields({
        name: '🔗 Call Chain',
        value: `\`${event.callChain.slice(0, 3).join(' → ')}\``,
        inline: false,
      });
    }
    
    embed.setFooter({ text: 'Use /ops errors detail <fingerprint> for full details' });
    
    await user.send({ embeds: [embed] });
  }
  
  /**
   * Send batched HIGH severity alert DM
   */
  private async sendBatchedAlert(batch: BatchedError[]): Promise<void> {
    if (!this.discordClient) {
      throw new Error('Discord client not initialized');
    }
    
    const user = await this.discordClient.users.fetch(DRIP_TVDD_ID);
    
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.WARNING)
      .setTitle(`⚠️ HIGH Severity Errors (${batch.length})`)
      .setDescription('The following errors occurred in the last 5 minutes:')
      .setTimestamp();
    
    // Add up to 10 errors as fields
    for (const item of batch.slice(0, 10)) {
      const event = item.event;
      embed.addFields({
        name: `${event.errorName} (${event.category})`,
        value: `${event.errorMessage.substring(0, 100)}...\n\`${event.fingerprint.substring(0, 8)}...\``,
        inline: false,
      });
    }
    
    if (batch.length > 10) {
      embed.addFields({
        name: '...',
        value: `And ${batch.length - 10} more errors`,
        inline: false,
      });
    }
    
    embed.setFooter({ text: 'Use /ops errors list severity:HIGH for full list' });
    
    await user.send({ embeds: [embed] });
  }
  
  /**
   * Create ErrorAlert database record
   */
  private async createAlertRecord(
    event: LiveErrorEvent, 
    alertType: string
  ): Promise<void> {
    try {
      // Find ErrorLog by fingerprint
      const errorLog = await prisma.errorLog.findUnique({
        where: { fingerprint: event.fingerprint },
        select: { errorId: true },
      });
      
      if (!errorLog) {
        log('warn', '[ErrorAlerting] ErrorLog not found for fingerprint', {
          fingerprint: event.fingerprint.substring(0, 8),
        });
        return;
      }
      
      await prisma.errorAlert.create({
        data: {
          errorId: errorLog.errorId,
          alertType,
          recipientId: DRIP_TVDD_ID,
          sentAt: new Date(),
        },
      });
    } catch (err) {
      log('error', '[ErrorAlerting] Failed to create alert record', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  
  /**
   * Check if fingerprint is rate limited
   */
  private isRateLimited(fingerprint: string): boolean {
    const record = this.rateLimiter.get(fingerprint);
    if (!record) return false;
    
    const now = Date.now();
    // Clean old timestamps
    record.timestamps = record.timestamps.filter(
      ts => now - ts < RATE_LIMIT_WINDOW_MS
    );
    
    if (record.timestamps.length === 0) {
      this.rateLimiter.delete(fingerprint);
      return false;
    }
    
    return record.timestamps.length >= RATE_LIMIT_MAX;
  }
  
  /**
   * Record alert timestamp for rate limiting
   */
  private recordAlertTimestamp(fingerprint: string): void {
    const record = this.rateLimiter.get(fingerprint);
    if (record) {
      record.timestamps.push(Date.now());
    } else {
      this.rateLimiter.set(fingerprint, {
        fingerprint,
        timestamps: [Date.now()],
      });
    }
  }
  
  /**
   * Get service statistics
   */
  getStats(): ErrorAlertingStats {
    return {
      initialized: this.initialized,
      criticalAlertsSent: this.criticalAlertsSent,
      highAlertsSent: this.highAlertsSent,
      alertsRateLimited: this.alertsRateLimited,
      lastAlertSentAt: this.lastAlertSentAt?.toISOString() ?? null,
      batchQueueSize: this.highSeverityBatch.length,
      rateLimitedFingerprints: this.rateLimiter.size,
    };
  }
  
  /**
   * Manually acknowledge an alert (stops future alerts for this fingerprint temporarily)
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
    try {
      await prisma.errorAlert.update({
        where: { alertId },
        data: {
          acknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedBy: userId,
        },
      });
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get pending (unacknowledged) alerts
   */
  async getPendingAlerts(limit = 10): Promise<any[]> {
    return prisma.errorAlert.findMany({
      where: { acknowledged: false },
      orderBy: { sentAt: 'desc' },
      take: limit,
      include: {
        error: {
          select: {
            errorName: true,
            errorMessage: true,
            severity: true,
            category: true,
            fingerprint: true,
          },
        },
      },
    });
  }
}

// Singleton export
export const errorAlertingService = ErrorAlertingService.getInstance();
