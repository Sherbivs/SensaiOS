/**
 * Retention Policy Service
 *
 * @module src/bot/security/services/retention-policy-service
 * @description Manages data lifecycle policies for security audit data.
 * Implements configurable retention periods, automatic pruning, and
 * compliance reporting for GDPR and SOC 2 requirements.
 *
 * @compliance
 * - GDPR Art. 17: Right to erasure (data deletion after retention period)
 * - GDPR Art. 5(1)(e): Storage limitation principle
 * - SOC 2: CC6.1 Logical and physical access controls
 * - NIST 800-53: SI-12 Information handling and retention
 *
 * @features
 * - Configurable retention periods per data type
 * - Automatic pruning with batch processing
 * - Retention policy compliance reporting
 * - Audit trail for all deletion operations
 * - Dry-run mode for safe testing
 * - Rate-limited deletion to prevent database overload
 *
 * @author Database Specialist (Sprint 2)
 * @since 2025-12-05
 */
import * as crypto from 'crypto';
// ============================================================================
// Constants
// ============================================================================
/**
 * Default retention policies per category
 */
export const DEFAULT_RETENTION_POLICIES = {
    security_events: {
        category: 'security_events',
        retentionDays: 90,
        enabled: true,
        archiveBeforeDelete: true,
        minimumRecords: 1000,
        batchSize: 500,
        complianceStandard: 'SOC 2 CC7.2',
    },
    role_change_audit: {
        category: 'role_change_audit',
        retentionDays: 365, // 1 year for audit trails
        enabled: true,
        archiveBeforeDelete: true,
        minimumRecords: 500,
        batchSize: 500,
        complianceStandard: 'SOC 2 CC6.1',
    },
    threat_detections: {
        category: 'threat_detections',
        retentionDays: 180, // 6 months for threat intelligence
        enabled: true,
        archiveBeforeDelete: true,
        minimumRecords: 100,
        batchSize: 200,
        complianceStandard: 'NIST 800-53 SI-4',
    },
    permission_snapshots: {
        category: 'permission_snapshots',
        retentionDays: 30, // Short retention for point-in-time snapshots
        enabled: true,
        archiveBeforeDelete: false,
        minimumRecords: 50,
        batchSize: 1000,
        complianceStandard: 'SOC 2 CC6.1',
    },
    admin_role_requests: {
        category: 'admin_role_requests',
        retentionDays: 365, // 1 year for admin actions
        enabled: true,
        archiveBeforeDelete: true,
        minimumRecords: 100,
        batchSize: 200,
        complianceStandard: 'SOC 2 CC6.2',
    },
    security_baselines: {
        category: 'security_baselines',
        retentionDays: 90, // Keep recent baselines
        enabled: true,
        archiveBeforeDelete: false,
        minimumRecords: 10,
        batchSize: 50,
        complianceStandard: 'NIST 800-53 CM-2',
    },
};
/**
 * Table name mapping for Prisma queries
 */
const CATEGORY_TABLE_MAP = {
    security_events: 'securityEvent',
    role_change_audit: 'roleChangeAudit',
    threat_detections: 'threatDetection',
    permission_snapshots: 'permissionSnapshot',
    admin_role_requests: 'adminRoleRequest',
    security_baselines: 'securityBaseline',
};
/**
 * Date field for each category (used for retention calculations)
 */
const CATEGORY_DATE_FIELD = {
    security_events: 'createdAt',
    role_change_audit: 'createdAt',
    threat_detections: 'createdAt',
    permission_snapshots: 'capturedAt',
    admin_role_requests: 'createdAt',
    security_baselines: 'computedAt',
};
// ============================================================================
// Implementation
// ============================================================================
/**
 * Retention Policy Service
 *
 * Manages data lifecycle for security audit data, ensuring compliance with
 * retention requirements while maintaining data integrity.
 */
export class RetentionPolicyService {
    prisma;
    config;
    policies;
    deletionAuditLog = [];
    /**
     * Create a new RetentionPolicyService
     */
    constructor(prisma, config = {}, customPolicies) {
        this.prisma = prisma;
        this.config = {
            defaultRetentionDays: config.defaultRetentionDays ?? 90,
            maxBatchSize: config.maxBatchSize ?? 1000,
            batchDelayMs: config.batchDelayMs ?? 100,
            auditDeletions: config.auditDeletions ?? true,
            hmacSecret: config.hmacSecret ?? 'retention-policy-default-secret',
        };
        // Initialize policies with defaults, allowing custom overrides
        this.policies = new Map();
        for (const [category, defaultPolicy] of Object.entries(DEFAULT_RETENTION_POLICIES)) {
            const customPolicy = customPolicies?.[category];
            this.policies.set(category, {
                ...defaultPolicy,
                ...customPolicy,
            });
        }
    }
    // ==========================================================================
    // Policy Management
    // ==========================================================================
    /**
     * Get the retention policy for a category
     */
    getPolicy(category) {
        return this.policies.get(category) ?? DEFAULT_RETENTION_POLICIES[category];
    }
    /**
     * Update a retention policy
     */
    updatePolicy(category, updates) {
        const current = this.getPolicy(category);
        this.policies.set(category, { ...current, ...updates });
    }
    /**
     * Get all policies
     */
    getAllPolicies() {
        return new Map(this.policies);
    }
    /**
     * Check if a category is enabled for retention
     */
    isPolicyEnabled(category) {
        return this.getPolicy(category).enabled;
    }
    // ==========================================================================
    // Retention Execution
    // ==========================================================================
    /**
     * Execute retention policy for a specific category
     */
    async executePolicy(category, options = {}) {
        const startTime = Date.now();
        const policy = this.getPolicy(category);
        const errors = [];
        // Check if policy is enabled
        if (!policy.enabled && !options.force) {
            return {
                category,
                deletedCount: 0,
                archivedCount: 0,
                retainedCount: 0,
                oldestRecordDate: null,
                durationMs: Date.now() - startTime,
                errors: ['Policy is disabled for this category'],
                dryRun: options.dryRun ?? false,
            };
        }
        try {
            const cutoffDate = this.calculateCutoffDate(policy.retentionDays);
            const tableName = CATEGORY_TABLE_MAP[category];
            const dateField = CATEGORY_DATE_FIELD[category];
            // Get count of records to delete
            const recordsToDelete = await this.countRecordsBeforeDate(tableName, dateField, cutoffDate);
            // Check minimum records constraint
            const totalRecords = await this.countTotalRecords(tableName);
            const recordsAfterDeletion = totalRecords - recordsToDelete;
            let actualDeleteCount = recordsToDelete;
            if (policy.minimumRecords && recordsAfterDeletion < policy.minimumRecords) {
                // Adjust deletion to maintain minimum records
                actualDeleteCount = Math.max(0, totalRecords - policy.minimumRecords);
            }
            if (options.dryRun) {
                // Dry run - just report what would be deleted
                return {
                    category,
                    deletedCount: actualDeleteCount,
                    archivedCount: policy.archiveBeforeDelete ? actualDeleteCount : 0,
                    retainedCount: totalRecords - actualDeleteCount,
                    oldestRecordDate: await this.getOldestRecordDate(tableName, dateField),
                    durationMs: Date.now() - startTime,
                    errors: [],
                    dryRun: true,
                };
            }
            // Execute deletion in batches
            let deletedCount = 0;
            let archivedCount = 0;
            const batchSize = Math.min(policy.batchSize ?? this.config.maxBatchSize, this.config.maxBatchSize);
            while (deletedCount < actualDeleteCount) {
                const batchToDelete = Math.min(batchSize, actualDeleteCount - deletedCount);
                // Archive if required
                if (policy.archiveBeforeDelete) {
                    const archived = await this.archiveBatch(tableName, dateField, cutoffDate, batchToDelete);
                    archivedCount += archived;
                }
                // Delete batch
                const deleted = await this.deleteBatch(tableName, dateField, cutoffDate, batchToDelete);
                deletedCount += deleted;
                // Rate limiting between batches
                if (deletedCount < actualDeleteCount) {
                    await this.delay(this.config.batchDelayMs);
                }
            }
            // Create audit record
            if (this.config.auditDeletions && deletedCount > 0) {
                await this.createDeletionAuditRecord(category, deletedCount, cutoffDate, false);
            }
            return {
                category,
                deletedCount,
                archivedCount,
                retainedCount: totalRecords - deletedCount,
                oldestRecordDate: await this.getOldestRecordDate(tableName, dateField),
                durationMs: Date.now() - startTime,
                errors,
                dryRun: false,
            };
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
            return {
                category,
                deletedCount: 0,
                archivedCount: 0,
                retainedCount: 0,
                oldestRecordDate: null,
                durationMs: Date.now() - startTime,
                errors,
                dryRun: options.dryRun ?? false,
            };
        }
    }
    /**
     * Execute retention policies for all enabled categories
     */
    async executeAllPolicies(options = {}) {
        const results = new Map();
        const categoriesToProcess = options.categories ?? Array.from(this.policies.keys());
        for (const category of categoriesToProcess) {
            if (this.isPolicyEnabled(category)) {
                const result = await this.executePolicy(category, { dryRun: options.dryRun });
                results.set(category, result);
            }
        }
        return results;
    }
    // ==========================================================================
    // Reporting
    // ==========================================================================
    /**
     * Generate a comprehensive retention compliance report
     */
    async generateReport() {
        const categoryResults = new Map();
        let totalRecords = 0;
        let recordsDueForDeletion = 0;
        const recommendations = [];
        for (const [category, policy] of this.policies) {
            const report = await this.generateCategoryReport(category);
            categoryResults.set(category, report);
            totalRecords += report.totalRecords;
            recordsDueForDeletion += report.recordsOutsideRetention;
            // Generate recommendations
            if (!report.isCompliant) {
                recommendations.push(`${category}: ${report.recordsOutsideRetention} records exceed retention period of ${policy.retentionDays} days`);
            }
            if (report.totalRecords === 0) {
                recommendations.push(`${category}: No records found - verify data collection`);
            }
        }
        // Determine overall compliance
        const nonCompliantCategories = Array.from(categoryResults.values()).filter(r => !r.isCompliant);
        let complianceStatus;
        if (nonCompliantCategories.length === 0) {
            complianceStatus = 'compliant';
        }
        else if (nonCompliantCategories.length === categoryResults.size) {
            complianceStatus = 'non_compliant';
        }
        else {
            complianceStatus = 'partial';
        }
        return {
            generatedAt: new Date(),
            complianceStatus,
            categoryResults,
            totalRecords,
            recordsDueForDeletion,
            recommendations,
        };
    }
    /**
     * Generate report for a single category
     */
    async generateCategoryReport(category) {
        const policy = this.getPolicy(category);
        const tableName = CATEGORY_TABLE_MAP[category];
        const dateField = CATEGORY_DATE_FIELD[category];
        const cutoffDate = this.calculateCutoffDate(policy.retentionDays);
        const totalRecords = await this.countTotalRecords(tableName);
        const recordsOutsideRetention = await this.countRecordsBeforeDate(tableName, dateField, cutoffDate);
        return {
            category,
            policy,
            totalRecords,
            recordsWithinRetention: totalRecords - recordsOutsideRetention,
            recordsOutsideRetention,
            oldestRecordDate: await this.getOldestRecordDate(tableName, dateField),
            newestRecordDate: await this.getNewestRecordDate(tableName, dateField),
            isCompliant: recordsOutsideRetention === 0,
        };
    }
    /**
     * Get deletion audit log
     */
    getDeletionAuditLog() {
        return [...this.deletionAuditLog];
    }
    // ==========================================================================
    // Utility Methods
    // ==========================================================================
    /**
     * Calculate cutoff date based on retention days
     */
    calculateCutoffDate(retentionDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);
        cutoff.setHours(0, 0, 0, 0); // Start of day
        return cutoff;
    }
    /**
     * Get statistics for all categories
     */
    async getStatistics() {
        const stats = {};
        for (const category of this.policies.keys()) {
            const tableName = CATEGORY_TABLE_MAP[category];
            const dateField = CATEGORY_DATE_FIELD[category];
            stats[category] = {
                total: await this.countTotalRecords(tableName),
                oldest: await this.getOldestRecordDate(tableName, dateField),
                newest: await this.getNewestRecordDate(tableName, dateField),
            };
        }
        return stats;
    }
    // ==========================================================================
    // Private Helpers
    // ==========================================================================
    /**
     * Get Prisma model dynamically by table name
     */
    getModel(tableName) {
        const model = this.prisma[tableName];
        return model ?? null;
    }
    /**
     * Count total records in a table
     */
    async countTotalRecords(tableName) {
        const model = this.getModel(tableName);
        if (!model || typeof model.count !== 'function') {
            return 0;
        }
        return model.count();
    }
    /**
     * Count records before a date
     */
    async countRecordsBeforeDate(tableName, dateField, cutoffDate) {
        const model = this.getModel(tableName);
        if (!model || typeof model.count !== 'function') {
            return 0;
        }
        return model.count({
            where: {
                [dateField]: { lt: cutoffDate },
            },
        });
    }
    /**
     * Get oldest record date
     */
    async getOldestRecordDate(tableName, dateField) {
        const model = this.getModel(tableName);
        if (!model || typeof model.findFirst !== 'function') {
            return null;
        }
        const result = await model.findFirst({
            orderBy: { [dateField]: 'asc' },
            select: { [dateField]: true },
        });
        return result ? result[dateField] : null;
    }
    /**
     * Get newest record date
     */
    async getNewestRecordDate(tableName, dateField) {
        const model = this.getModel(tableName);
        if (!model || typeof model.findFirst !== 'function') {
            return null;
        }
        const result = await model.findFirst({
            orderBy: { [dateField]: 'desc' },
            select: { [dateField]: true },
        });
        return result ? result[dateField] : null;
    }
    /**
     * Archive a batch of records (placeholder - actual implementation depends on archive storage)
     */
    async archiveBatch(_tableName, _dateField, _cutoffDate, _batchSize) {
        // TODO: Implement actual archival to cold storage (S3, etc.)
        // For now, this is a placeholder that returns the batch size
        return _batchSize;
    }
    /**
     * Delete a batch of records
     */
    async deleteBatch(tableName, dateField, cutoffDate, batchSize) {
        const model = this.getModel(tableName);
        if (!model || typeof model.deleteMany !== 'function') {
            return 0;
        }
        // Note: Prisma doesn't support LIMIT on deleteMany, so we need to find IDs first
        const recordsToDelete = await model.findMany({
            where: { [dateField]: { lt: cutoffDate } },
            take: batchSize,
            select: { id: true },
        });
        if (recordsToDelete.length === 0) {
            return 0;
        }
        const ids = recordsToDelete.map((r) => r.id);
        const result = await model.deleteMany({
            where: { id: { in: ids } },
        });
        return result.count;
    }
    /**
     * Create a deletion audit record
     */
    async createDeletionAuditRecord(category, deletedCount, cutoffDate, dryRun) {
        const record = {
            id: crypto.randomUUID(),
            category,
            deletedCount,
            policyRetentionDays: this.getPolicy(category).retentionDays,
            cutoffDate,
            executedAt: new Date(),
            dryRun,
            signature: this.computeAuditSignature(category, deletedCount, cutoffDate),
        };
        this.deletionAuditLog.push(record);
        // Also record as a security event if possible
        try {
            const securityEventModel = this.getModel('securityEvent');
            if (securityEventModel && typeof securityEventModel.create === 'function') {
                await securityEventModel.create({
                    data: {
                        eventType: 'retention_policy_execution',
                        severity: 'INFO',
                        guildId: 'SYSTEM',
                        guildName: 'SYSTEM',
                        origin: 'retention-policy-service',
                        metadata: {
                            category,
                            deletedCount,
                            cutoffDate: cutoffDate.toISOString(),
                            dryRun,
                        },
                    },
                });
            }
        }
        catch {
            // Silently ignore if security event creation fails
        }
    }
    /**
     * Compute HMAC signature for audit record
     */
    computeAuditSignature(category, deletedCount, cutoffDate) {
        const data = `${category}:${deletedCount}:${cutoffDate.toISOString()}`;
        return crypto
            .createHmac('sha256', this.config.hmacSecret)
            .update(data)
            .digest('hex');
    }
    /**
     * Delay helper for rate limiting
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
// ============================================================================
// Factory Function
// ============================================================================
/**
 * Create a RetentionPolicyService with environment-based configuration
 */
export function createRetentionPolicyService(prisma, overrides) {
    const config = {
        defaultRetentionDays: parseInt(process.env.RETENTION_DEFAULT_DAYS ?? '90', 10),
        maxBatchSize: parseInt(process.env.RETENTION_MAX_BATCH_SIZE ?? '1000', 10),
        batchDelayMs: parseInt(process.env.RETENTION_BATCH_DELAY_MS ?? '100', 10),
        auditDeletions: process.env.RETENTION_AUDIT_DELETIONS !== 'false',
        hmacSecret: process.env.RETENTION_HMAC_SECRET ?? 'retention-policy-service-secret',
        ...overrides,
    };
    return new RetentionPolicyService(prisma, config);
}
// ============================================================================
// Exports
// ============================================================================
export default RetentionPolicyService;
