/**
 * Error Alerting and Escalation Service
 * Purpose: Real-time alerting for critical errors, error storms, and new error patterns
 * Integrates with Discord DMs, restart notifications, and Render incident management
 * 
 * @module services/error-alerting
 */

import type { Client } from 'discord.js';
import type { ErrorLog } from '@prisma/client';
import { toEasternString } from '../shared/datetime.js';
import { errorTracker } from './error-tracker.js';
import { log } from '../utils/logger.js';

/// ---- Configuration ----

const ALERT_CONFIG = {
  // Admin user ID for critical error DMs
  adminDiscordId: process.env.ADMIN_DISCORD_ID || '275798742065938432', // DripTVDD
  
  // Error storm thresholds (errors per minute)
  errorStormThreshold: 10,
  errorStormWindowMs: 60 * 1000, // 1 minute
  
  // First occurrence alerting
  alertOnNewErrors: true,
  
  // Render escalation (future implementation)
  renderEscalationEnabled: false,
  renderApiKey: process.env.RENDER_API_KEY,
  renderServiceId: process.env.RENDER_SERVICE_ID,
} as const;

/// ---- State Tracking ----

interface AlertState {
  lastCriticalAlertTime: Map<string, number>; // fingerprint → timestamp
  lastStormAlertTime: number;
  stormWindowErrors: Array<{ timestamp: number; fingerprint: string }>;
  seenErrorFingerprints: Set<string>; // Track errors we've seen before
  client: Client | null; // Discord client reference
}

const alertState: AlertState = {
  lastCriticalAlertTime: new Map(),
  lastStormAlertTime: 0,
  stormWindowErrors: [],
  seenErrorFingerprints: new Set(),
  client: null,
};

/// ---- Public API ----

/**
 * Initialize the alerting system with Discord client
 * Must be called after bot client is ready
 */
export function initializeAlerting(client: Client): void {
  alertState.client = client;
  
  // Subscribe to live error stream from ErrorTracker
  subscribeToErrorStream();
  
  log('info', 'error-alerting: Initialized with Discord client');
}

/**
 * Alert admin on CRITICAL errors (rate-limited to prevent spam)
 * Sends a DM to admin with error details
 */
export async function alertOnCritical(error: ErrorLog): Promise<void> {
  if (error.severity !== 'CRITICAL') return;
  if (!alertState.client) {
    log('warn', 'error-alerting: Cannot send critical alert, Discord client not initialized');
    return;
  }
  
  const now = Date.now();
  const lastAlert = alertState.lastCriticalAlertTime.get(error.fingerprint) || 0;
  const timeSinceLastAlert = now - lastAlert;
  const rateLimit = 5 * 60 * 1000; // 5 minutes
  
  // Rate limit: Don't alert same error more than once per 5 minutes
  if (timeSinceLastAlert < rateLimit) {
    log('info', 'error-alerting: Critical alert rate-limited', {
      fingerprint: error.fingerprint,
      timeSinceLastAlert,
    });
    return;
  }
  
  // Update last alert time
  alertState.lastCriticalAlertTime.set(error.fingerprint, now);
  
  // Fetch admin user and send DM
  try {
    const admin = await alertState.client.users.fetch(ALERT_CONFIG.adminDiscordId);
    if (!admin) {
      log('warn', 'error-alerting: Admin user not found', { adminId: ALERT_CONFIG.adminDiscordId });
      return;
    }
    
    const message = formatCriticalErrorDM(error);
    await admin.send(message);
    
    log('info', 'error-alerting: Sent critical error DM to admin', {
      fingerprint: error.fingerprint,
      errorName: error.errorName,
    });
  } catch (err) {
    log('error', 'error-alerting: Failed to send critical error DM', {
      error: err instanceof Error ? err.message : String(err),
      fingerprint: error.fingerprint,
    });
  }
}

/**
 * Detect and alert on error storms (>10 errors/minute)
 * Triggers when error rate exceeds threshold in rolling window
 */
export async function alertOnPattern(error: ErrorLog): Promise<void> {
  if (!alertState.client) return;
  
  const now = Date.now();
  
  // Add current error to storm tracking window
  alertState.stormWindowErrors.push({
    timestamp: now,
    fingerprint: error.fingerprint,
  });
  
  // Remove errors outside the storm window (older than 1 minute)
  alertState.stormWindowErrors = alertState.stormWindowErrors.filter(
    (e) => now - e.timestamp < ALERT_CONFIG.errorStormWindowMs
  );
  
  // Check if we've exceeded storm threshold
  const errorCount = alertState.stormWindowErrors.length;
  if (errorCount >= ALERT_CONFIG.errorStormThreshold) {
    const timeSinceLastStorm = now - alertState.lastStormAlertTime;
    const stormRateLimit = 10 * 60 * 1000; // 10 minutes
    
    // Rate limit: Don't alert more than once per 10 minutes
    if (timeSinceLastStorm < stormRateLimit) return;
    
    alertState.lastStormAlertTime = now;
    
    // Count unique error types in storm
    const uniqueErrors = new Set(alertState.stormWindowErrors.map((e) => e.fingerprint));
    
    try {
      const admin = await alertState.client.users.fetch(ALERT_CONFIG.adminDiscordId);
      if (!admin) return;
      
      const message = formatErrorStormDM(errorCount, uniqueErrors.size);
      await admin.send(message);
      
      log('warn', 'error-alerting: Error storm detected and alerted', {
        errorCount,
        uniqueErrors: uniqueErrors.size,
      });
    } catch (err) {
      log('error', 'error-alerting: Failed to send error storm DM', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Alert on first occurrence of new error fingerprints
 * Helps identify new issues quickly
 */
export async function alertOnNewError(error: ErrorLog): Promise<void> {
  if (!ALERT_CONFIG.alertOnNewErrors) return;
  if (!alertState.client) return;
  
  // Check if we've seen this error before
  if (alertState.seenErrorFingerprints.has(error.fingerprint)) return;
  
  // Mark as seen
  alertState.seenErrorFingerprints.add(error.fingerprint);
  
  // Only alert on HIGH and CRITICAL severity for new errors
  if (error.severity !== 'HIGH' && error.severity !== 'CRITICAL') return;
  
  try {
    const admin = await alertState.client.users.fetch(ALERT_CONFIG.adminDiscordId);
    if (!admin) return;
    
    const message = formatNewErrorDM(error);
    await admin.send(message);
    
    log('info', 'error-alerting: Alerted on new error', {
      fingerprint: error.fingerprint,
      severity: error.severity,
      errorName: error.errorName,
    });
  } catch (err) {
    log('error', 'error-alerting: Failed to send new error DM', {
      error: err instanceof Error ? err.message : String(err),
      fingerprint: error.fingerprint,
    });
  }
}

/**
 * Escalate infrastructure errors to Render incident management
 * Creates Render incidents for CRITICAL database/worker/service errors
 * 
 * @future This is a placeholder for future Render API integration
 */
export async function escalateToRender(error: ErrorLog): Promise<void> {
  if (!ALERT_CONFIG.renderEscalationEnabled) return;
  if (!ALERT_CONFIG.renderApiKey || !ALERT_CONFIG.renderServiceId) {
    log('warn', 'error-alerting: Render escalation requested but API key/service ID not configured');
    return;
  }
  
  // Only escalate CRITICAL infrastructure errors
  if (error.severity !== 'CRITICAL') return;
  const infrastructureCategories = ['DATABASE', 'WORKER', 'CACHE'];
  if (!infrastructureCategories.includes(error.category)) return;
  
  log('info', 'error-alerting: Render escalation triggered (placeholder)', {
    fingerprint: error.fingerprint,
    category: error.category,
    severity: error.severity,
  });
  
  // TODO: Implement Render API integration
  // - POST to Render API to create incident
  // - Include error details, fingerprint, stack trace
  // - Link to /ops errors dashboard for more info
  // - Track incident ID in ErrorLog.customData
}

/**
 * Get alerting statistics for monitoring
 */
export function getAlertingStats(): {
  criticalAlertsTracked: number;
  lastStormAlertTime: number | null;
  currentStormWindowErrors: number;
  seenErrorCount: number;
  clientReady: boolean;
} {
  return {
    criticalAlertsTracked: alertState.lastCriticalAlertTime.size,
    lastStormAlertTime: alertState.lastStormAlertTime || null,
    currentStormWindowErrors: alertState.stormWindowErrors.length,
    seenErrorCount: alertState.seenErrorFingerprints.size,
    clientReady: alertState.client !== null,
  };
}

/// ---- Private Helpers ----

/**
 * Subscribe to ErrorTracker's live error stream
 * Processes each error in real-time for alerting
 */
function subscribeToErrorStream(): void {
  // Check for errors every 30 seconds (lightweight polling)
  // In production, this could be event-driven via EventEmitter
  setInterval(async () => {
    try {
      const recentErrors = await errorTracker.getRecentErrors(50);
      const now = Date.now();
      const recentThreshold = 60 * 1000; // Last 60 seconds
      
      for (const error of recentErrors) {
        const errorAge = now - error.lastSeen.getTime();
        if (errorAge > recentThreshold) continue; // Skip old errors
        
        // Process error through alerting pipeline
        await alertOnCritical(error);
        await alertOnPattern(error);
        await alertOnNewError(error);
        await escalateToRender(error);
      }
    } catch (err) {
      log('error', 'error-alerting: Error stream processing failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, 30 * 1000); // Every 30 seconds
}

/**
 * Format critical error DM message
 */
function formatCriticalErrorDM(error: ErrorLog): string {
  const lines: string[] = [];
  lines.push('🚨 **CRITICAL ERROR DETECTED**');
  lines.push('');
  lines.push(`**Error**: ${error.errorName}`);
  lines.push(`**Fingerprint**: \`${error.fingerprint.substring(0, 12)}\``);
  lines.push(`**Category**: ${error.category}`);
  lines.push(`**Occurrences**: ${error.occurrenceCount}`);
  lines.push(`**First Seen**: ${toEasternString(error.firstSeen)}`);
  lines.push(`**Last Seen**: ${toEasternString(error.lastSeen)}`);
  lines.push('');
  
  if (error.errorMessage) {
    const truncatedMessage = error.errorMessage.length > 200
      ? error.errorMessage.substring(0, 197) + '...'
      : error.errorMessage;
    lines.push(`**Message**: ${truncatedMessage}`);
    lines.push('');
  }
  
  if (error.contextData) {
    const ctx = error.contextData as any;
    if (ctx.operation) lines.push(`**Operation**: ${ctx.operation}`);
    if (ctx.service) lines.push(`**Service**: ${ctx.service}`);
    if (ctx.userId) lines.push(`**User**: <@${ctx.userId}>`);
    lines.push('');
  }
  
  lines.push('*Use `/ops errors` for full dashboard*');
  
  return lines.join('\n');
}

/**
 * Format error storm DM message
 */
function formatErrorStormDM(errorCount: number, uniqueErrors: number): string {
  const lines: string[] = [];
  lines.push('⚠️ **ERROR STORM DETECTED**');
  lines.push('');
  lines.push(`**Total Errors**: ${errorCount} in last minute`);
  lines.push(`**Unique Error Types**: ${uniqueErrors}`);
  lines.push(`**Threshold**: ${ALERT_CONFIG.errorStormThreshold}/minute`);
  lines.push('');
  lines.push('The system is experiencing an unusually high error rate.');
  lines.push('Check `/ops errors` dashboard and system logs immediately.');
  lines.push('');
  lines.push('*This alert is rate-limited to once per 10 minutes*');
  
  return lines.join('\n');
}

/**
 * Format new error DM message
 */
function formatNewErrorDM(error: ErrorLog): string {
  const lines: string[] = [];
  lines.push('🆕 **NEW ERROR DETECTED**');
  lines.push('');
  lines.push(`**Error**: ${error.errorName}`);
  lines.push(`**Fingerprint**: \`${error.fingerprint.substring(0, 12)}\``);
  lines.push(`**Severity**: ${error.severity}`);
  lines.push(`**Category**: ${error.category}`);
  lines.push('');
  
  if (error.errorMessage) {
    const truncatedMessage = error.errorMessage.length > 150
      ? error.errorMessage.substring(0, 147) + '...'
      : error.errorMessage;
    lines.push(`**Message**: ${truncatedMessage}`);
    lines.push('');
  }
  
  lines.push('This error fingerprint has not been seen before.');
  lines.push('*Monitor `/ops errors` dashboard for patterns*');
  
  return lines.join('\n');
}

/**
 * Integration with restart DM (called from main.ts during startup)
 * Returns critical errors summary for inclusion in restart notification
 */
export async function getCriticalErrorsSummary(hoursAgo: number = 24): Promise<string> {
  try {
    const sinceDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const recentErrors = await errorTracker.getRecentErrors(100);
    
    const criticalErrors = recentErrors.filter(
      (err) =>
        err.lastSeen >= sinceDate &&
        (err.severity === 'CRITICAL' || err.severity === 'HIGH')
    );
    
    if (criticalErrors.length === 0) {
      return '✅ No critical errors in last 24h';
    }
    
    const lines: string[] = [];
    lines.push(`⚠️ ${criticalErrors.length} critical/high errors in last ${hoursAgo}h:`);
    
    criticalErrors.slice(0, 5).forEach((err, idx) => {
      const fpShort = err.fingerprint.substring(0, 8);
      const count = err.occurrenceCount;
      lines.push(`  ${idx + 1}. [${err.severity}] \`${fpShort}\` ${err.errorName} (x${count})`);
    });
    
    if (criticalErrors.length > 5) {
      lines.push(`  ... and ${criticalErrors.length - 5} more`);
    }
    
    return lines.join('\n');
  } catch (err) {
    log('error', 'error-alerting: Failed to get critical errors summary', {
      error: err instanceof Error ? err.message : String(err),
    });
    return '⚠️ Unable to load error summary';
  }
}
