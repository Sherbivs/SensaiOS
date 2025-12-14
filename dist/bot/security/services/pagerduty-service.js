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
// ============================================================================
// Constants
// ============================================================================
/** PagerDuty Events API v2 endpoint */
const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue';
/** Default configuration values */
const DEFAULT_CONFIG = {
    maxRetries: 3,
    retryDelayMs: 1000,
    maxRetryDelayMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    dryRun: false,
    historyRetention: 1000,
};
/** Severity priority for sorting (higher = more critical) */
export const SEVERITY_PRIORITY = {
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
    config;
    alerts = new Map();
    alertHistory = [];
    circuitBreakerFailures = 0;
    circuitBreakerOpenedAt = null;
    stats = {
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
    constructor(config) {
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
    async trigger(input) {
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
        const record = {
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
    async acknowledge(dedupKey, note, acknowledgedBy) {
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
        const payload = {
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
    async resolve(dedupKey, note, resolvedBy) {
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
        const payload = {
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
    suppress(dedupKey, reason) {
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
    getAlert(dedupKey) {
        return this.alerts.get(dedupKey);
    }
    /**
     * Get all active alerts.
     */
    getActiveAlerts() {
        return Array.from(this.alerts.values()).filter((a) => a.status === 'triggered' || a.status === 'acknowledged');
    }
    /**
     * Get alerts by severity.
     */
    getAlertsBySeverity(severity) {
        return Array.from(this.alerts.values()).filter((a) => a.severity === severity);
    }
    /**
     * Get alerts by source.
     */
    getAlertsBySource(source) {
        return Array.from(this.alerts.values()).filter((a) => a.source === source);
    }
    /**
     * Get alerts by guild.
     */
    getAlertsByGuild(guildId) {
        return Array.from(this.alerts.values()).filter((a) => a.guildId === guildId);
    }
    /**
     * Get alert history.
     */
    getAlertHistory(limit) {
        const history = [...this.alertHistory].reverse();
        return limit ? history.slice(0, limit) : history;
    }
    /**
     * Get service statistics.
     */
    getStats() {
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
    getCircuitBreakerState() {
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
    resetCircuitBreaker() {
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
    generateDedupKey(input) {
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
    clear() {
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
    getRoutingKey(severity) {
        return this.config.severityRouting?.[severity] ?? this.config.routingKey;
    }
    /**
     * Build trigger event payload.
     */
    buildTriggerPayload(input, dedupKey) {
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
    async sendEvent(payload, record) {
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
        let lastError = null;
        let delay = this.config.retryDelayMs;
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                if (this.config.httpClient) {
                    // Custom HTTP client (for testing)
                    const response = await this.config.httpClient.post(PAGERDUTY_EVENTS_URL, payload);
                    if (response.status === 'error') {
                        throw new Error(response.message);
                    }
                }
                else {
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
                    const result = (await response.json());
                    if (result.status === 'error') {
                        throw new Error(result.message);
                    }
                }
                this.onSuccess();
                return;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                record.retryCount++;
                this.stats.totalRetries++;
                if (attempt < this.config.maxRetries) {
                    await this.sleep(delay);
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
    onSuccess() {
        if (this.getCircuitBreakerState() === 'half-open') {
            this.resetCircuitBreaker();
        }
        else {
            this.circuitBreakerFailures = Math.max(0, this.circuitBreakerFailures - 1);
        }
    }
    /**
     * Handle failed API call.
     */
    onFailure(record, error) {
        record.lastError = error instanceof Error ? error.message : String(error);
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
    addToHistory(record) {
        this.alertHistory.push({ ...record });
        while (this.alertHistory.length > this.config.historyRetention) {
            this.alertHistory.shift();
        }
    }
    /**
     * Sleep helper for retry delays.
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
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
export function createPagerDutyService(config) {
    return new PagerDutyService(config);
}
