/**
 * Lifecycle Event Notifier
 * 
 * Purpose: Send Discord webhook notifications on boot/shutdown/crash events.
 * Strategy: Immediate visibility when service goes down - don't wait for external monitors.
 * 
 * Features:
 * - Sends webhook on successful boot completion
 * - Sends webhook on graceful shutdown (with shutdown trigger)
 * - Sends webhook on uncaught exceptions (crash alerts)
 * - Includes restart count, uptime, memory usage, service health
 * - Respects LIFECYCLE_WEBHOOK_URL env var (optional feature)
 * 
 * Integration:
 * - Called at end of boot() after Discord client ready
 * - Called in gracefulShutdown() before exit
 * - Called in uncaughtException handler before crash
 * 
 * @module lifecycle-notifier
 */

import { getLogger } from "../shared/logging/index.js";
import { getErrorMessage } from '../shared/utils/error-utils.js';

const logger = getLogger();
import { bytesToMB } from '../shared/utils/format-utils.js';
import { ServiceRegistry } from '../shared/service-registry.js';
import { SERVICE_NAME } from '../config/env.js';

// ============================================================================
// Configuration
// ============================================================================

const WEBHOOK_URL = process.env.LIFECYCLE_WEBHOOK_URL ?? '';
const WEBHOOK_ENABLED = Boolean(WEBHOOK_URL);

// Persistent state (survives module reloads, tracks restarts)
let bootCount = 0;
let lastBootTime: number | null = null;
let lastShutdownTime: number | null = null;
let crashCount = 0;

// ============================================================================
// Types
// ============================================================================

interface BootNotification {
  event: 'boot';
  timestamp: number;
  bootCount: number;
  timeSinceLastBoot: number | null;
  timeSinceLastShutdown: number | null;
  memory: {
    rss_mb: number;
    heap_used_mb: number;
    heap_total_mb: number;
  };
  services?: {
    healthy: number;
    degraded: number;
    error: number;
    total: number;
  };
  environment: {
    node_version: string;
    service_name: string;
    region: string;
  };
}

interface ShutdownNotification {
  event: 'shutdown';
  timestamp: number;
  trigger: string;
  uptime_ms: number;
  uptime_human: string;
  memory: {
    rss_mb: number;
    heap_used_mb: number;
  };
  environment: {
    service_name: string;
  };
}

interface CrashNotification {
  event: 'crash';
  timestamp: number;
  crashCount: number;
  errorName: string;
  errorMessage: string;
  errorStack: string;
  memory: {
    rss_mb: number;
    heap_used_mb: number;
  };
  environment: {
    service_name: string;
  };
}

// ============================================================================
// Discord Webhook Formatting
// ============================================================================

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatTimeSince(ms: number | null): string {
  if (ms === null) return 'never';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function createBootEmbed(
  notification: BootNotification,
  restartContext?: { reason: string; seamless: boolean }
) {
  const fields = [
    {
      name: '⏱️ Boot Info',
      value: [
        `Boot #${notification.bootCount}`,
        `Last boot: ${formatTimeSince(notification.timeSinceLastBoot)}`,
        `Last shutdown: ${formatTimeSince(notification.timeSinceLastShutdown)}`,
      ].join('\n'),
      inline: true,
    },
    {
      name: '💾 Memory',
      value: [
        `RSS: ${notification.memory.rss_mb} MB`,
        `Heap Used: ${notification.memory.heap_used_mb} MB`,
        `Heap Total: ${notification.memory.heap_total_mb} MB`,
      ].join('\n'),
      inline: true,
    },
  ];
  
  // PHASE 5: Add restart context field if available
  if (restartContext) {
    fields.push({
      name: restartContext.seamless ? '✨ Seamless Restart' : '🔄 Restart Context',
      value: restartContext.reason,
      inline: false,
    });
  }

  if (notification.services) {
    fields.push({
      name: '⚙️ Services',
      value: [
        `✅ Healthy: ${notification.services.healthy}`,
        `⚠️ Degraded: ${notification.services.degraded}`,
        `❌ Error: ${notification.services.error}`,
        `Total: ${notification.services.total}`,
      ].join('\n'),
      inline: true,
    });
  }

  fields.push({
    name: '🌍 Environment',
    value: [
      `Node: ${notification.environment.node_version}`,
      `Service: ${notification.environment.service_name}`,
      `Region: ${notification.environment.region}`,
    ].join('\n'),
    inline: false,
  });

  return {
    embeds: [
      {
        title: '🚀 Application Started',
        description: `Infinity Gauntlet bot is now online and ready.`,
        color: 0x00ff00, // Green
        fields,
        timestamp: new Date(notification.timestamp).toISOString(),
      },
    ],
  };
}

function createShutdownEmbed(notification: ShutdownNotification) {
  return {
    embeds: [
      {
        title: '🛑 Application Shutdown',
        description: `Infinity Gauntlet bot is shutting down gracefully.`,
        color: 0xffa500, // Orange
        fields: [
          {
            name: '⚙️ Shutdown Info',
            value: [
              `Trigger: \`${notification.trigger}\``,
              `Uptime: ${notification.uptime_human}`,
            ].join('\n'),
            inline: false,
          },
          {
            name: '💾 Memory',
            value: [
              `RSS: ${notification.memory.rss_mb} MB`,
              `Heap Used: ${notification.memory.heap_used_mb} MB`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🌍 Environment',
            value: `Service: ${notification.environment.service_name}`,
            inline: true,
          },
        ],
        timestamp: new Date(notification.timestamp).toISOString(),
      },
    ],
  };
}

function createCrashEmbed(notification: CrashNotification) {
  return {
    embeds: [
      {
        title: '💥 Application Crash',
        description: `Infinity Gauntlet bot encountered a fatal error and is restarting.`,
        color: 0xff0000, // Red
        fields: [
          {
            name: '❌ Error Info',
            value: [
              `Crash #${notification.crashCount}`,
              `Name: \`${notification.errorName}\``,
              `Message: ${notification.errorMessage}`,
            ].join('\n'),
            inline: false,
          },
          {
            name: '📜 Stack Trace',
            value: `\`\`\`\n${notification.errorStack.substring(0, 1000)}\n\`\`\``,
            inline: false,
          },
          {
            name: '💾 Memory',
            value: [
              `RSS: ${notification.memory.rss_mb} MB`,
              `Heap Used: ${notification.memory.heap_used_mb} MB`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🌍 Environment',
            value: `Service: ${notification.environment.service_name}`,
            inline: true,
          },
        ],
        timestamp: new Date(notification.timestamp).toISOString(),
      },
    ],
  };
}

// ============================================================================
// Webhook Sender
// ============================================================================

async function sendWebhook(payload: Record<string, unknown>): Promise<void> {
  if (!WEBHOOK_ENABLED) {
    return;
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }

    logger.info('lifecycle', 'webhook-sent', 'Lifecycle webhook sent successfully', {
      metadata: { event: (payload.embeds as Array<{ title?: string }>)?.[0]?.title ?? 'unknown' },
    });
  } catch (error) {
    logger.error('lifecycle', 'webhook-failed', 'Failed to send lifecycle webhook', {
      metadata: { errorMsg: getErrorMessage(error) },
    });
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Send boot notification webhook
 * 
 * PHASE 5 (Seamless Restart): Include restart context for user visibility
 * - Shows restart reason (planned vs crash vs manual)
 * - Shows time since last shutdown (indicates seamless transition)
 * - Shows restart count (reliability metric)
 * - Enables users to understand restart impact
 */
export async function notifyBoot(): Promise<void> {
  bootCount++;
  const now = Date.now();
  const timeSinceLastBoot = lastBootTime ? now - lastBootTime : null;
  const timeSinceLastShutdown = lastShutdownTime ? now - lastShutdownTime : null;
  lastBootTime = now;

  const memUsage = process.memoryUsage();
  const memory = {
    rss_mb: bytesToMB(memUsage.rss),
    heap_used_mb: bytesToMB(memUsage.heapUsed),
    heap_total_mb: bytesToMB(memUsage.heapTotal),
  };

  let services: BootNotification['services'] | undefined;
  try {
    const registry = ServiceRegistry.getInstance();
    const registryStatus = registry.getStatus();
    services = {
      healthy: registryStatus.healthyCount,
      degraded: registryStatus.degradedCount,
      error: registryStatus.errorCount,
      total: registryStatus.serviceCount,
    };
  } catch {
    // Service Registry not ready yet
  }
  
  // PHASE 5: Load restart context from persistent metrics
  let restartContext: { reason: string; seamless: boolean } | undefined;
  try {
    const { getMetrics } = await import('./restart-metrics.js');
    const metrics = getMetrics();
    
    if (metrics && metrics.lastShutdownTrigger) {
      // Determine restart reason (user-friendly message)
      const trigger = metrics.lastShutdownTrigger;
      const reason = 
        trigger === 'SIGTERM' || trigger === 'scheduled' ? 'Planned restart (automated schedule)' :
        trigger === 'SIGINT' ? 'Manual restart (operator initiated)' :
        trigger === 'crash' ? '⚠️ Crash recovery (unexpected termination)' :
        trigger === 'health-check' ? '⚠️ Health check auto-restart' :
        `Unknown restart (${trigger})`;
      
      // Seamless = planned restart with quick turnaround (<30s)
      const seamless = 
        (trigger === 'SIGTERM' || trigger === 'scheduled') &&
        timeSinceLastShutdown !== null &&
        timeSinceLastShutdown < 30000; // <30s = seamless
      
      restartContext = { reason, seamless };
      
      logger.info('lifecycle', 'restart-context', 'Restart context', {
        metadata: {
          reason,
          seamless,
          timeSinceShutdown: timeSinceLastShutdown ? `${(timeSinceLastShutdown / 1000).toFixed(1)}s` : 'unknown',
        },
      });
    }
  } catch (error) {
    // Restart metrics not available (first boot or error)
    logger.warn('lifecycle', 'restart-context', 'Restart context unavailable', { metadata: { error } });
  }

  const notification: BootNotification = {
    event: 'boot',
    timestamp: now,
    bootCount,
    timeSinceLastBoot,
    timeSinceLastShutdown,
    memory,
    services,
    environment: {
      node_version: process.version,
      service_name: SERVICE_NAME,
      region: process.env.RENDER_REGION || 'unknown',
    },
  };

  await sendWebhook(createBootEmbed(notification, restartContext));
}

/**
 * Send shutdown notification webhook
 */
export async function notifyShutdown(trigger: string, uptimeMs: number): Promise<void> {
  const now = Date.now();
  lastShutdownTime = now;

  const memUsage = process.memoryUsage();
  const notification: ShutdownNotification = {
    event: 'shutdown',
    timestamp: now,
    trigger,
    uptime_ms: uptimeMs,
    uptime_human: formatUptime(uptimeMs),
    memory: {
      rss_mb: bytesToMB(memUsage.rss),
      heap_used_mb: bytesToMB(memUsage.heapUsed),
    },
    environment: {
      service_name: SERVICE_NAME,
    },
  };

  await sendWebhook(createShutdownEmbed(notification));
}

/**
 * Send crash notification webhook
 */
export async function notifyCrash(error: Error): Promise<void> {
  crashCount++;
  const now = Date.now();

  const memUsage = process.memoryUsage();
  const notification: CrashNotification = {
    event: 'crash',
    timestamp: now,
    crashCount,
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack || 'No stack trace available',
    memory: {
      rss_mb: bytesToMB(memUsage.rss),
      heap_used_mb: bytesToMB(memUsage.heapUsed),
    },
    environment: {
      service_name: SERVICE_NAME,
    },
  };

  await sendWebhook(createCrashEmbed(notification));
}

/**
 * Check if lifecycle webhooks are enabled
 */
export function isLifecycleWebhookEnabled(): boolean {
  return WEBHOOK_ENABLED;
}

/**
 * Get lifecycle statistics (for observability)
 */
export function getLifecycleStats() {
  return {
    bootCount,
    lastBootTime,
    lastShutdownTime,
    crashCount,
    webhookEnabled: WEBHOOK_ENABLED,
  };
}

