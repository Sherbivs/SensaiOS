/**
 * PagerDuty Integration Service
 * ==============================
 *
 * Alert escalation service with severity-based routing and acknowledgment tracking.
 * Implements PagerDuty Events API v2 for incident management.
 *
 * @module security/services/pagerduty-service
 * @task P1-008 (PagerDuty Integration)
 *
 * Features:
 * - PagerDuty Events API v2 integration
 * - Severity-based routing to integration keys
 * - Alert deduplication with dedup_key
 * - Acknowledgment and resolution tracking
 * - Retry logic with exponential backoff
 * - Alert history for audit trail
 * - Circuit breaker for API failures
 * - Dry-run mode for testing
 *
 * References:
 * - PagerDuty Events API v2: https://developer.pagerduty.com/docs/events-api-v2/overview/
 * - Incident Management Best Practices: https://response.pagerduty.com/
 *
 * @example
 * ```typescript
 * import { createPagerDutyService } from './pagerduty-service.js';
 *
 * const pagerduty = createPagerDutyService({
 *   routingKey: process.env.PAGERDUTY_ROUTING_KEY!,
 *   serviceName: 'security-bot',
 * });
 *
 * // Trigger an alert
 * await pagerduty.trigger({
 *   severity: 'critical',
 *   summary: 'Multiple privilege escalation attempts detected',
 *   source: 'threat-detection',
 *   guildId: '123456789',
 *   component: 'role-audit',
 *   customDetails: { threatCount: 5, timeWindow: '5m' },
 * });
 *
 * // Acknowledge an alert
 * await pagerduty.acknowledge('dedup-key-123', 'Investigating');
 *
 * // Resolve an alert
 * await pagerduty.resolve('dedup-key-123', 'False positive - authorized admin action');
 * ```
 */

import { getErrorMessage, ensureError } from '../../../shared/utils/error-utils.js';
import { delay as asyncDelay } from '../../../shared/utils/async-utils.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * PagerDuty severity levels (maps to Events API v2 severity)
 */
export type AlertSeverity = 'critical' | 'error' | 'warning' | 'info';

/**
 * PagerDuty event action types
 */
export type EventAction = 'trigger' | 'acknowledge' | 'resolve';

/**
 * Alert status for tracking
 */
export type AlertStatus = 'triggered' | 'acknowledged' | 'resolved' | 'suppressed';

/**
 * Alert input for triggering a new alert
 */
export interface AlertInput {
  /** Severity level for routing */
  severity: AlertSeverity;
  /** Human-readable summary (max 1024 chars) */
  summary: string;
  /** Source of the alert (service/component name) */
  source: string;
  /** Guild ID for context */
  guildId?: string;
  /** Component within the source */
  component?: string;
  /** Group related alerts */
  group?: string;
  /** Alert class for categorization */
  class?: string;
  /** Custom key-value details */
  customDetails?: Record<string, unknown>;
  /** Links to related resources */
  links?: AlertLink[];
  /** Images to include in alert */
  images?: AlertImage[];
  /** Custom dedup key (auto-generated if not provided) */
  dedupKey?: string;
}

/**
 * Link resource for alert context
 */
export interface AlertLink {
  href: string;
  text: string;
}

/**
 * Image resource for alert context
 */
export interface AlertImage {
  src: string;
  href?: string;
  alt?: string;
}

/**
 * Internal alert record for tracking
 */
export interface AlertRecord {
  dedupKey: string;
  severity: AlertSeverity;
  summary: string;
  source: string;
  status: AlertStatus;
  triggeredAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  acknowledgedBy?: string;
  resolvedBy?: string;
  acknowledgementNote?: string;
  resolutionNote?: string;
  retryCount: number;
  lastError?: string;
  guildId?: string;
  component?: string;
}

/**
 * PagerDuty Events API v2 payload
 */
export interface PagerDutyEventPayload {
  routing_key: string;
  event_action: EventAction;
  dedup_key: string;
  payload?: {
    summary: string;
    source: string;
    severity: AlertSeverity;
    timestamp?: string;
    component?: string;
    group?: string;
    class?: string;
    custom_details?: Record<string, unknown>;
  };
  links?: AlertLink[];
  images?: AlertImage[];
}

/**
 * PagerDuty API response
 */
export interface PagerDutyResponse {
  status: 'success' | 'error';
  message: string;
  dedup_key?: string;
  errors?: string[];
}

/**
 * Service configuration
 */
export interface PagerDutyServiceConfig {
  /** Default routing key for all alerts */
  routingKey: string;
  /** Service name for identification */
  serviceName: string;
  /** Routing keys by severity (optional override) */
  severityRouting?: Partial<Record<AlertSeverity, string>>;
  /** Max retries for failed requests */
  maxRetries?: number;
  /** Initial retry delay in ms */
  retryDelayMs?: number;
  /** Max retry delay in ms */
  maxRetryDelayMs?: number;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold?: number;
  /** Circuit breaker reset timeout in ms */
  circuitBreakerResetMs?: number;
  /** Dry-run mode (no actual API calls) */
  dryRun?: boolean;
  /** Custom HTTP client for testing */
  httpClient?: HttpClient;
  /** Alert history retention count */
  historyRetention?: number;
}

/**
 * HTTP client interface for testing
 */
export interface HttpClient {
  post(url: string, data: PagerDutyEventPayload): Promise<PagerDutyResponse>;
}

/**
 * Alert statistics
 */
export interface AlertStats {
  totalTriggered: number;
  totalAcknowledged: number;
  totalResolved: number;
  totalSuppressed: number;
  totalRetries: number;
  totalErrors: number;
  bySeverity: Record<AlertSeverity, number>;
  bySource: Record<string, number>;
  activeAlerts: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
}

// ============================================================================
// Constants
// ============================================================================

/** PagerDuty Events API v2 endpoint */
const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue';

/** Default configuration values */
const DEFAULT_CONFIG: Required<Omit<PagerDutyServiceConfig, 'routingKey' | 'serviceName' | 'severityRouting' | 'httpClient'>> = {
  maxRetries: 3,
  retryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
  dryRun: false,
  historyRetention: 1000,
};

/** Severity priority for sorting (higher = more critical) */
export const SEVERITY_PRIORITY: Record<AlertSeverity, number> = {
  critical: 4,
  error: 3,
  warning: 2,
  info: 1,
};

// ============================================================================
// PagerDuty Service Implementation
// ============================================================================

/**
 * PagerDuty integration service for alert escalation.
 *
 * Handles alert lifecycle management with proper deduplication,
 * acknowledgment tracking, and retry logic.
 */
export class PagerDutyService {
  private readonly config: Required<Omit<PagerDutyServiceConfig, 'severityRouting' | 'httpClient'>> & {
    severityRouting?: Partial<Record<AlertSeverity, string>>;
    httpClient?: HttpClient;
  };
  private readonly alerts: Map<string, AlertRecord> = new Map();
  private readonly alertHistory: AlertRecord[] = [];
  private circuitBreakerFailures = 0;
  private circuitBreakerOpenedAt: Date | null = null;
  private stats: AlertStats = {
    totalTriggered: 0,
    totalAcknowledged: 0,
    totalResolved: 0,
    totalSuppressed: 0,
    totalRetries: 0,
    totalErrors: 0,
    bySeverity: { critical: 0, error: 0, warning: 0, info: 0 },
    bySource: {},
    activeAlerts: 0,
    circuitBreakerState: 'closed',
  };

  constructor(config: PagerDutyServiceConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  // ==========================================================================
  // Alert Lifecycle Methods
  // ==========================================================================

  /**
   * Trigger a new alert or update an existing one.
   *
   * @param input - Alert input data
   * @returns Dedup key for the alert
   * @throws Error if API call fails after retries
   */
  async trigger(input: AlertInput): Promise<string> {
    // Generate dedup key if not provided
    const dedupKey = input.dedupKey ?? this.generateDedupKey(input);

    // Check for existing alert
    const existing = this.alerts.get(dedupKey);
    if (existing && existing.status !== 'resolved') {
      // Update existing alert
      existing.retryCount++;
      this.stats.totalRetries++;
      return dedupKey;
    }

    // Create alert record
    const record: AlertRecord = {
      dedupKey,
      severity: input.severity,
      summary: input.summary.slice(0, 1024), // PagerDuty limit
      source: input.source,
      status: 'triggered',
      triggeredAt: new Date(),
      retryCount: 0,
      guildId: input.guildId,
      component: input.component,
    };

    this.alerts.set(dedupKey, record);

    // Build and send event
    const payload = this.buildTriggerPayload(input, dedupKey);
    await this.sendEvent(payload, record);

    // Update stats
    this.stats.totalTriggered++;
    this.stats.bySeverity[input.severity]++;
    this.stats.bySource[input.source] = (this.stats.bySource[input.source] || 0) + 1;
    this.stats.activeAlerts++;

    // Add to history
    this.addToHistory(record);

    return dedupKey;
  }

  /**
   * Acknowledge an alert.
   *
   * @param dedupKey - Dedup key of the alert
   * @param note - Optional acknowledgment note
   * @param acknowledgedBy - Who acknowledged the alert
   */
  async acknowledge(dedupKey: string, note?: string, acknowledgedBy?: string): Promise<void> {
    const record = this.alerts.get(dedupKey);
    if (!record) {
      throw new Error(`Alert not found: ${dedupKey}`);
    }

    if (record.status === 'resolved') {
      throw new Error(`Cannot acknowledge resolved alert: ${dedupKey}`);
    }

    // Update record
    record.status = 'acknowledged';
    record.acknowledgedAt = new Date();
    record.acknowledgementNote = note;
    record.acknowledgedBy = acknowledgedBy;

    // Send acknowledgment event
    const payload: PagerDutyEventPayload = {
      routing_key: this.getRoutingKey(record.severity),
      event_action: 'acknowledge',
      dedup_key: dedupKey,
    };

    await this.sendEvent(payload, record);

    // Update stats
    this.stats.totalAcknowledged++;
  }

  /**
   * Resolve an alert.
   *
   * @param dedupKey - Dedup key of the alert
   * @param note - Optional resolution note
   * @param resolvedBy - Who resolved the alert
   */
  async resolve(dedupKey: string, note?: string, resolvedBy?: string): Promise<void> {
    const record = this.alerts.get(dedupKey);
    if (!record) {
      throw new Error(`Alert not found: ${dedupKey}`);
    }

    if (record.status === 'resolved') {
      return; // Already resolved
    }

    // Update record
    record.status = 'resolved';
    record.resolvedAt = new Date();
    record.resolutionNote = note;
    record.resolvedBy = resolvedBy;

    // Send resolution event
    const payload: PagerDutyEventPayload = {
      routing_key: this.getRoutingKey(record.severity),
      event_action: 'resolve',
      dedup_key: dedupKey,
    };

    await this.sendEvent(payload, record);

    // Update stats
    this.stats.totalResolved++;
    this.stats.activeAlerts--;
  }

  /**
   * Suppress an alert (mark as suppressed without sending to PagerDuty).
   *
   * @param dedupKey - Dedup key of the alert
   * @param reason - Reason for suppression
   */
  suppress(dedupKey: string, reason?: string): void {
    const record = this.alerts.get(dedupKey);
    if (!record) {
      throw new Error(`Alert not found: ${dedupKey}`);
    }

    record.status = 'suppressed';
    record.resolutionNote = reason;
    record.resolvedAt = new Date();

    this.stats.totalSuppressed++;
    this.stats.activeAlerts--;
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get an alert by dedup key.
   */
  getAlert(dedupKey: string): AlertRecord | undefined {
    return this.alerts.get(dedupKey);
  }

  /**
   * Get all active alerts.
   */
  getActiveAlerts(): AlertRecord[] {
    return Array.from(this.alerts.values()).filter(
      (a) => a.status === 'triggered' || a.status === 'acknowledged'
    );
  }

  /**
   * Get alerts by severity.
   */
  getAlertsBySeverity(severity: AlertSeverity): AlertRecord[] {
    return Array.from(this.alerts.values()).filter((a) => a.severity === severity);
  }

  /**
   * Get alerts by source.
   */
  getAlertsBySource(source: string): AlertRecord[] {
    return Array.from(this.alerts.values()).filter((a) => a.source === source);
  }

  /**
   * Get alerts by guild.
   */
  getAlertsByGuild(guildId: string): AlertRecord[] {
    return Array.from(this.alerts.values()).filter((a) => a.guildId === guildId);
  }

  /**
   * Get alert history.
   */
  getAlertHistory(limit?: number): AlertRecord[] {
    const history = [...this.alertHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get service statistics.
   */
  getStats(): AlertStats {
    return {
      ...this.stats,
      activeAlerts: this.getActiveAlerts().length,
      circuitBreakerState: this.getCircuitBreakerState(),
    };
  }

  // ==========================================================================
  // Circuit Breaker
  // ==========================================================================

  /**
   * Get current circuit breaker state.
   */
  getCircuitBreakerState(): 'closed' | 'open' | 'half-open' {
    if (this.circuitBreakerFailures >= this.config.circuitBreakerThreshold) {
      if (this.circuitBreakerOpenedAt) {
        const elapsed = Date.now() - this.circuitBreakerOpenedAt.getTime();
        if (elapsed >= this.config.circuitBreakerResetMs) {
          return 'half-open';
        }
      }
      return 'open';
    }
    return 'closed';
  }

  /**
   * Reset circuit breaker manually.
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerFailures = 0;
    this.circuitBreakerOpenedAt = null;
    this.stats.circuitBreakerState = 'closed';
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Generate a dedup key for an alert.
   */
  generateDedupKey(input: Pick<AlertInput, 'source' | 'severity' | 'guildId' | 'component'>): string {
    const parts = [
      this.config.serviceName,
      input.source,
      input.severity,
      input.guildId ?? 'global',
      input.component ?? 'default',
    ];
    return parts.join('-');
  }

  /**
   * Clear all alerts (useful for testing).
   */
  clear(): void {
    this.alerts.clear();
    this.alertHistory.length = 0;
    this.stats = {
      totalTriggered: 0,
      totalAcknowledged: 0,
      totalResolved: 0,
      totalSuppressed: 0,
      totalRetries: 0,
      totalErrors: 0,
      bySeverity: { critical: 0, error: 0, warning: 0, info: 0 },
      bySource: {},
      activeAlerts: 0,
      circuitBreakerState: 'closed',
    };
    this.resetCircuitBreaker();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Get routing key for a severity level.
   */
  private getRoutingKey(severity: AlertSeverity): string {
    return this.config.severityRouting?.[severity] ?? this.config.routingKey;
  }

  /**
   * Build trigger event payload.
   */
  private buildTriggerPayload(input: AlertInput, dedupKey: string): PagerDutyEventPayload {
    return {
      routing_key: this.getRoutingKey(input.severity),
      event_action: 'trigger',
      dedup_key: dedupKey,
      payload: {
        summary: input.summary.slice(0, 1024),
        source: input.source,
        severity: input.severity,
        timestamp: new Date().toISOString(),
        component: input.component,
        group: input.group,
        class: input.class,
        custom_details: {
          service_name: this.config.serviceName,
          guild_id: input.guildId,
          ...input.customDetails,
        },
      },
      links: input.links,
      images: input.images,
    };
  }

  /**
   * Send event to PagerDuty API with retry logic.
   */
  private async sendEvent(payload: PagerDutyEventPayload, record: AlertRecord): Promise<void> {
    // Check circuit breaker
    const cbState = this.getCircuitBreakerState();
    if (cbState === 'open') {
      record.lastError = 'Circuit breaker open';
      this.stats.totalErrors++;
      throw new Error('Circuit breaker is open');
    }

    // Dry-run mode
    if (this.config.dryRun) {
      return;
    }

    // Retry logic for both custom HTTP client and real fetch
    let lastError: Error | null = null;
    let delay = this.config.retryDelayMs;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (this.config.httpClient) {
          // Custom HTTP client (for testing)
          const response = await this.config.httpClient.post(PAGERDUTY_EVENTS_URL, payload);
          if (response.status === 'error') {
            throw new Error(response.message);
          }
        } else {
          // Real HTTP request
          const response = await fetch(PAGERDUTY_EVENTS_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const body = await response.text();
            throw new Error(`PagerDuty API error: ${response.status} ${body}`);
          }

          const result = (await response.json()) as PagerDutyResponse;
          if (result.status === 'error') {
            throw new Error(result.message);
          }
        }

        this.onSuccess();
        return;
      } catch (error) {
        lastError = ensureError(error);
        record.retryCount++;
        this.stats.totalRetries++;

        if (attempt < this.config.maxRetries) {
          await asyncDelay(delay);
          delay = Math.min(delay * 2, this.config.maxRetryDelayMs);
        }
      }
    }

    this.onFailure(record, lastError);
    throw lastError ?? new Error('Unknown error');
  }

  /**
   * Handle successful API call.
   */
  private onSuccess(): void {
    if (this.getCircuitBreakerState() === 'half-open') {
      this.resetCircuitBreaker();
    } else {
      this.circuitBreakerFailures = Math.max(0, this.circuitBreakerFailures - 1);
    }
  }

  /**
   * Handle failed API call.
   */
  private onFailure(record: AlertRecord, error: unknown): void {
    record.lastError = getErrorMessage(error);
    this.stats.totalErrors++;
    this.circuitBreakerFailures++;

    if (this.circuitBreakerFailures >= this.config.circuitBreakerThreshold) {
      this.circuitBreakerOpenedAt = new Date();
      this.stats.circuitBreakerState = 'open';
    }
  }

  /**
   * Add alert to history with retention limit.
   */
  private addToHistory(record: AlertRecord): void {
    this.alertHistory.push({ ...record });
    while (this.alertHistory.length > this.config.historyRetention) {
      this.alertHistory.shift();
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a PagerDuty service instance.
 *
 * @param config - Service configuration (uses env vars for defaults)
 * @returns Configured PagerDutyService instance
 *
 * @example
 * ```typescript
 * // Using environment variables
 * const pagerduty = createPagerDutyService({
 *   routingKey: process.env.PAGERDUTY_ROUTING_KEY!,
 *   serviceName: 'security-bot',
 * });
 *
 * // With severity-based routing
 * const pagerduty = createPagerDutyService({
 *   routingKey: process.env.PAGERDUTY_DEFAULT_KEY!,
 *   serviceName: 'security-bot',
 *   severityRouting: {
 *     critical: process.env.PAGERDUTY_CRITICAL_KEY!,
 *     error: process.env.PAGERDUTY_ERROR_KEY!,
 *   },
 * });
 * ```
 */
export function createPagerDutyService(
  config: PagerDutyServiceConfig
): PagerDutyService {
  return new PagerDutyService(config);
}
