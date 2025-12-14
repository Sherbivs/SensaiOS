/**
 * Alert Throttle Service
 *
 * Strategic management of admin DM alerts to prevent spam while ensuring
 * important notifications are delivered promptly.
 *
 * Features:
 * - Severity-based cooldowns (critical alerts more frequent than notices)
 * - Duplicate detection (prevent same alert within time window)
 * - Hourly rate limiting (prevent DM flood)
 * - Quiet hours support (non-critical alerts delayed until morning)
 * - Alert batching for digests
 * - Statistics tracking for /ops visibility
 *
 * @module services/alert-throttle
 * @since 2025-12-06
 */
import { ALERT_STRATEGY_CONSTANTS } from '../shared/constants.js';
// ============================================================================
// Constants
// ============================================================================
const { RESTART_ALERT_COOLDOWN_MS, CRITICAL_ALERT_COOLDOWN_MS, SECURITY_ALERT_COOLDOWN_MS, WARNING_ALERT_COOLDOWN_MS, NOTICE_ALERT_COOLDOWN_MS, DIGEST_MIN_INTERVAL_MS, DIGEST_BATCH_THRESHOLD, DUPLICATE_DETECTION_WINDOW_MS, MAX_ALERTS_PER_HOUR, MAX_CRITICAL_PER_HOUR, PRIORITY_CRITICAL, PRIORITY_SECURITY, PRIORITY_WARNING, PRIORITY_NOTICE, DEFAULT_QUIET_HOURS_START, DEFAULT_QUIET_HOURS_END, } = ALERT_STRATEGY_CONSTANTS;
/** Cooldown by severity type */
const COOLDOWN_BY_SEVERITY = {
    restart: RESTART_ALERT_COOLDOWN_MS,
    critical: CRITICAL_ALERT_COOLDOWN_MS,
    security: SECURITY_ALERT_COOLDOWN_MS,
    warning: WARNING_ALERT_COOLDOWN_MS,
    notice: NOTICE_ALERT_COOLDOWN_MS,
};
/** Priority by severity (higher = more urgent) */
const PRIORITY_BY_SEVERITY = {
    restart: PRIORITY_CRITICAL, // Restart treated as critical priority
    critical: PRIORITY_CRITICAL,
    security: PRIORITY_SECURITY,
    warning: PRIORITY_WARNING,
    notice: PRIORITY_NOTICE,
};
/** Maximum entries to keep in memory */
const MAX_HISTORY_SIZE = 500;
const MAX_FINGERPRINT_CACHE_SIZE = 200;
// ============================================================================
// Alert Throttle Service Class
// ============================================================================
export class AlertThrottleService {
    static instance = null;
    // Alert tracking
    alertHistory = [];
    lastAlertBySeverity = new Map();
    lastAlertByFingerprint = new Map();
    hourlyAlertTimestamps = [];
    hourlyCriticalTimestamps = [];
    // Batching
    pendingBatch = [];
    lastDigestAt = null;
    currentBatchId = null;
    // Statistics
    stats = {
        totalReceived: 0,
        totalDelivered: 0,
        totalSuppressed: 0,
        totalBatched: 0,
        suppressionsByReason: {},
        alertsBySeverity: {},
        deliveriesBySeverity: {},
    };
    // Configuration
    quietHours = {
        enabled: false,
        startHour: DEFAULT_QUIET_HOURS_START,
        endHour: DEFAULT_QUIET_HOURS_END,
        timezone: 'America/New_York',
    };
    startedAt = new Date();
    // ============================================================================
    // Singleton
    // ============================================================================
    static getInstance() {
        if (!AlertThrottleService.instance) {
            AlertThrottleService.instance = new AlertThrottleService();
        }
        return AlertThrottleService.instance;
    }
    constructor() {
        // Initialize severity counters
        const severities = ['critical', 'security', 'warning', 'notice', 'restart'];
        for (const sev of severities) {
            this.stats.alertsBySeverity[sev] = 0;
            this.stats.deliveriesBySeverity[sev] = 0;
        }
    }
    // ============================================================================
    // Configuration
    // ============================================================================
    /**
     * Configure quiet hours (non-critical alerts delayed until end of quiet period)
     */
    configureQuietHours(config) {
        this.quietHours = { ...this.quietHours, ...config };
    }
    /**
     * Check if currently in quiet hours
     */
    isInQuietHours() {
        if (!this.quietHours.enabled) {
            return false;
        }
        const now = new Date();
        const hour = now.getHours(); // Local hour
        const { startHour, endHour } = this.quietHours;
        // Handle overnight quiet hours (e.g., 23:00 - 07:00)
        if (startHour > endHour) {
            return hour >= startHour || hour < endHour;
        }
        // Same-day quiet hours (e.g., 01:00 - 06:00)
        return hour >= startHour && hour < endHour;
    }
    // ============================================================================
    // Core Throttle Logic
    // ============================================================================
    /**
     * Generate fingerprint for duplicate detection
     */
    generateFingerprint(severity, title) {
        // Normalize title for comparison (remove timestamps, IDs, etc.)
        const normalized = title
            .toLowerCase()
            .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/g, '') // Remove timestamps
            .replace(/#\d+/g, '#ID') // Normalize IDs
            .replace(/\d+/g, 'N') // Normalize numbers
            .trim();
        return `${severity}:${normalized}`;
    }
    /**
     * Clean up old entries to prevent memory leaks
     */
    cleanup() {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        const cleanupWindow = now - DUPLICATE_DETECTION_WINDOW_MS;
        // Clean hourly timestamps
        this.hourlyAlertTimestamps = this.hourlyAlertTimestamps.filter(ts => ts.getTime() > oneHourAgo);
        this.hourlyCriticalTimestamps = this.hourlyCriticalTimestamps.filter(ts => ts.getTime() > oneHourAgo);
        // Clean fingerprint cache (keep recent entries)
        for (const [fingerprint, timestamp] of this.lastAlertByFingerprint) {
            if (timestamp.getTime() < cleanupWindow) {
                this.lastAlertByFingerprint.delete(fingerprint);
            }
        }
        // Trim fingerprint cache if too large
        if (this.lastAlertByFingerprint.size > MAX_FINGERPRINT_CACHE_SIZE) {
            const entries = Array.from(this.lastAlertByFingerprint.entries())
                .sort((a, b) => b[1].getTime() - a[1].getTime());
            this.lastAlertByFingerprint.clear();
            for (const [key, value] of entries.slice(0, MAX_FINGERPRINT_CACHE_SIZE / 2)) {
                this.lastAlertByFingerprint.set(key, value);
            }
        }
        // Trim history if too large
        if (this.alertHistory.length > MAX_HISTORY_SIZE) {
            this.alertHistory = this.alertHistory.slice(-MAX_HISTORY_SIZE / 2);
        }
    }
    /**
     * Evaluate whether an alert should be delivered immediately, batched, or suppressed
     */
    shouldDeliver(severity, title, _meta) {
        const now = new Date();
        const fingerprint = this.generateFingerprint(severity, title);
        const priority = PRIORITY_BY_SEVERITY[severity];
        this.cleanup();
        // Track receipt
        this.stats.totalReceived++;
        this.stats.alertsBySeverity[severity] = (this.stats.alertsBySeverity[severity] || 0) + 1;
        // === Check 1: Duplicate detection ===
        const lastSameAlert = this.lastAlertByFingerprint.get(fingerprint);
        if (lastSameAlert) {
            const timeSinceSame = now.getTime() - lastSameAlert.getTime();
            if (timeSinceSame < DUPLICATE_DETECTION_WINDOW_MS) {
                this.recordSuppression('duplicate');
                return {
                    allow: false,
                    reason: `Duplicate alert suppressed (same alert ${Math.round(timeSinceSame / 1000)}s ago)`,
                    cooldownRemainingMs: DUPLICATE_DETECTION_WINDOW_MS - timeSinceSame,
                    priority,
                };
            }
        }
        // === Check 2: Severity-based cooldown ===
        const cooldown = COOLDOWN_BY_SEVERITY[severity];
        const lastOfSeverity = this.lastAlertBySeverity.get(severity);
        if (lastOfSeverity) {
            const timeSinceLast = now.getTime() - lastOfSeverity.getTime();
            if (timeSinceLast < cooldown) {
                // Exception: Security and critical alerts can override cooldown if different fingerprint
                if ((severity === 'security' || severity === 'critical') && !lastSameAlert) {
                    // Allow through but log
                }
                else {
                    this.recordSuppression('cooldown');
                    return {
                        allow: false,
                        reason: `${severity} cooldown active (${Math.round((cooldown - timeSinceLast) / 1000)}s remaining)`,
                        cooldownRemainingMs: cooldown - timeSinceLast,
                        shouldBatch: severity === 'warning' || severity === 'notice',
                        priority,
                    };
                }
            }
        }
        // === Check 3: Hourly rate limit ===
        const alertsThisHour = this.hourlyAlertTimestamps.length;
        if (alertsThisHour >= MAX_ALERTS_PER_HOUR) {
            // Only suppress non-critical alerts
            if (severity !== 'critical' && severity !== 'security' && severity !== 'restart') {
                this.recordSuppression('hourly_limit');
                return {
                    allow: false,
                    reason: `Hourly alert limit reached (${alertsThisHour}/${MAX_ALERTS_PER_HOUR})`,
                    shouldBatch: true,
                    priority,
                };
            }
        }
        // === Check 4: Critical alerts per hour limit ===
        if (severity === 'critical' || severity === 'restart') {
            const criticalThisHour = this.hourlyCriticalTimestamps.length;
            if (criticalThisHour >= MAX_CRITICAL_PER_HOUR) {
                this.recordSuppression('critical_limit');
                return {
                    allow: false,
                    reason: `Critical alert limit reached (${criticalThisHour}/${MAX_CRITICAL_PER_HOUR})`,
                    shouldBatch: true,
                    priority,
                };
            }
        }
        // === Check 5: Quiet hours (non-critical only) ===
        if (this.isInQuietHours()) {
            if (severity !== 'critical' && severity !== 'security' && severity !== 'restart') {
                this.recordSuppression('quiet_hours');
                return {
                    allow: false,
                    reason: 'Alert queued for digest (quiet hours active)',
                    shouldBatch: true,
                    priority,
                };
            }
        }
        // === Alert allowed ===
        return {
            allow: true,
            reason: 'Alert passes all throttle checks',
            priority,
        };
    }
    /**
     * Record an alert delivery attempt
     */
    recordDelivery(severity, title, success, _meta) {
        const now = new Date();
        const fingerprint = this.generateFingerprint(severity, title);
        // Create entry
        const entry = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            severity,
            title,
            meta: _meta,
            timestamp: now,
            fingerprint,
            delivered: success,
            suppressed: false,
        };
        this.alertHistory.push(entry);
        if (success) {
            // Update tracking
            this.lastAlertBySeverity.set(severity, now);
            this.lastAlertByFingerprint.set(fingerprint, now);
            this.hourlyAlertTimestamps.push(now);
            if (severity === 'critical' || severity === 'restart') {
                this.hourlyCriticalTimestamps.push(now);
            }
            // Update stats
            this.stats.totalDelivered++;
            this.stats.deliveriesBySeverity[severity] = (this.stats.deliveriesBySeverity[severity] || 0) + 1;
        }
    }
    /**
     * Record a suppression
     */
    recordSuppression(reason) {
        this.stats.totalSuppressed++;
        this.stats.suppressionsByReason[reason] = (this.stats.suppressionsByReason[reason] || 0) + 1;
    }
    // ============================================================================
    // Batching Support
    // ============================================================================
    /**
     * Add alert to pending batch
     */
    addToBatch(severity, title, meta) {
        const now = new Date();
        if (!this.currentBatchId) {
            this.currentBatchId = `batch_${Date.now()}`;
        }
        const entry = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            severity,
            title,
            meta,
            timestamp: now,
            fingerprint: this.generateFingerprint(severity, title),
            delivered: false,
            suppressed: false,
            batchId: this.currentBatchId,
        };
        this.pendingBatch.push(entry);
        this.stats.totalBatched++;
        return this.currentBatchId;
    }
    /**
     * Check if batch should be flushed
     */
    shouldFlushBatch() {
        if (this.pendingBatch.length === 0) {
            return false;
        }
        // Flush if batch threshold reached
        if (this.pendingBatch.length >= DIGEST_BATCH_THRESHOLD) {
            return true;
        }
        // Flush if minimum interval passed since last digest
        if (this.lastDigestAt) {
            const timeSinceDigest = Date.now() - this.lastDigestAt.getTime();
            if (timeSinceDigest >= DIGEST_MIN_INTERVAL_MS && this.pendingBatch.length > 0) {
                return true;
            }
        }
        return false;
    }
    /**
     * Get and clear pending batch
     */
    flushBatch() {
        const batch = [...this.pendingBatch];
        this.pendingBatch = [];
        this.lastDigestAt = new Date();
        this.currentBatchId = null;
        // Mark as delivered
        for (const entry of batch) {
            entry.delivered = true;
            this.alertHistory.push(entry);
        }
        return batch;
    }
    /**
     * Get current batch size
     */
    getBatchSize() {
        return this.pendingBatch.length;
    }
    // ============================================================================
    // Statistics & Reporting
    // ============================================================================
    /**
     * Get comprehensive statistics
     */
    getStatistics() {
        const now = new Date();
        const oneHourAgo = now.getTime() - (60 * 60 * 1000);
        // Count alerts this hour
        const alertsThisHour = this.hourlyAlertTimestamps.filter(ts => ts.getTime() > oneHourAgo).length;
        // Find last alert/delivery times
        const deliveredAlerts = this.alertHistory.filter(a => a.delivered);
        const lastAlertAt = this.alertHistory.length > 0
            ? this.alertHistory[this.alertHistory.length - 1].timestamp
            : null;
        const lastDeliveryAt = deliveredAlerts.length > 0
            ? deliveredAlerts[deliveredAlerts.length - 1].timestamp
            : null;
        return {
            totalReceived: this.stats.totalReceived,
            totalDelivered: this.stats.totalDelivered,
            totalSuppressed: this.stats.totalSuppressed,
            totalBatched: this.stats.totalBatched,
            suppressionsByReason: { ...this.stats.suppressionsByReason },
            alertsBySeverity: { ...this.stats.alertsBySeverity },
            deliveriesBySeverity: { ...this.stats.deliveriesBySeverity },
            lastAlertAt,
            lastDeliveryAt,
            alertsThisHour,
            currentBatchSize: this.pendingBatch.length,
            uptimeMs: now.getTime() - this.startedAt.getTime(),
        };
    }
    /**
     * Get recent alert history (for /ops command)
     */
    getRecentAlerts(limit = 10) {
        return this.alertHistory.slice(-limit);
    }
    /**
     * Get cooldown status for all severities
     */
    getCooldownStatus() {
        const now = Date.now();
        const severities = ['critical', 'security', 'warning', 'notice', 'restart'];
        const status = {};
        for (const severity of severities) {
            const lastAt = this.lastAlertBySeverity.get(severity);
            const cooldown = COOLDOWN_BY_SEVERITY[severity];
            if (lastAt) {
                const elapsed = now - lastAt.getTime();
                const remaining = Math.max(0, cooldown - elapsed);
                status[severity] = {
                    active: remaining > 0,
                    remainingMs: remaining,
                };
            }
            else {
                status[severity] = { active: false, remainingMs: 0 };
            }
        }
        return status;
    }
    /**
     * Reset statistics (for testing or /ops reset)
     */
    resetStatistics() {
        this.stats = {
            totalReceived: 0,
            totalDelivered: 0,
            totalSuppressed: 0,
            totalBatched: 0,
            suppressionsByReason: {},
            alertsBySeverity: {},
            deliveriesBySeverity: {},
        };
        const severities = ['critical', 'security', 'warning', 'notice', 'restart'];
        for (const sev of severities) {
            this.stats.alertsBySeverity[sev] = 0;
            this.stats.deliveriesBySeverity[sev] = 0;
        }
        this.alertHistory = [];
        this.hourlyAlertTimestamps = [];
        this.hourlyCriticalTimestamps = [];
    }
    /**
     * Force clear cooldown for a severity (admin override)
     */
    clearCooldown(severity) {
        const had = this.lastAlertBySeverity.has(severity);
        this.lastAlertBySeverity.delete(severity);
        return had;
    }
    /**
     * Force clear all cooldowns (admin override)
     */
    clearAllCooldowns() {
        const count = this.lastAlertBySeverity.size;
        this.lastAlertBySeverity.clear();
        this.lastAlertByFingerprint.clear();
        return count;
    }
}
// ============================================================================
// Singleton Export
// ============================================================================
export const alertThrottle = AlertThrottleService.getInstance();
export default alertThrottle;
