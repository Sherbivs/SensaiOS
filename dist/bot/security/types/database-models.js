/**
 * Security Bot Database Models — TypeScript Types
 * =================================================
 *
 * Type definitions matching Prisma schema for Security Bot Database Transformation.
 * These types provide compile-time safety for security operations.
 *
 * @module security/types/database-models
 * @research P0-001 (Database Foundation)
 * @research R6 (SOC 2 Compliance - Immutable Audit Log)
 *
 * @example
 * ```typescript
 * import type { SecurityEvent, ThreatDetection } from './database-models';
 *
 * const event: SecurityEvent = {
 *   eventType: 'role-change',
 *   severity: SecuritySeverity.HIGH,
 *   guildId: '123456789',
 *   // ...
 * };
 * ```
 */
// ============================================================================
// ENUMS
// ============================================================================
/**
 * Severity levels for security events.
 * Maps to SecuritySeverity enum in Prisma schema.
 */
export var SecuritySeverity;
(function (SecuritySeverity) {
    SecuritySeverity["CRITICAL"] = "CRITICAL";
    SecuritySeverity["HIGH"] = "HIGH";
    SecuritySeverity["MEDIUM"] = "MEDIUM";
    SecuritySeverity["LOW"] = "LOW";
    SecuritySeverity["INFO"] = "INFO";
})(SecuritySeverity || (SecuritySeverity = {}));
/**
 * Threat types for detection system.
 * Maps to ThreatType enum in Prisma schema.
 */
export var ThreatType;
(function (ThreatType) {
    ThreatType["RAPID_ROLE_CHANGES"] = "RAPID_ROLE_CHANGES";
    ThreatType["UNUSUAL_ORIGIN"] = "UNUSUAL_ORIGIN";
    ThreatType["MASS_ROLE_REMOVAL"] = "MASS_ROLE_REMOVAL";
    ThreatType["OFF_HOURS_ACTIVITY"] = "OFF_HOURS_ACTIVITY";
    ThreatType["SINGLE_MEMBER_ANOMALY"] = "SINGLE_MEMBER_ANOMALY";
    ThreatType["PRIVILEGE_ESCALATION"] = "PRIVILEGE_ESCALATION";
    ThreatType["UNAUTHORIZED_CHANGE"] = "UNAUTHORIZED_CHANGE";
    ThreatType["BOT_DETECTED_CHANGE"] = "BOT_DETECTED_CHANGE";
})(ThreatType || (ThreatType = {}));
/**
 * Admin role request status workflow.
 * Maps to AdminRequestStatus enum in Prisma schema.
 */
export var AdminRequestStatus;
(function (AdminRequestStatus) {
    AdminRequestStatus["PENDING"] = "PENDING";
    AdminRequestStatus["APPROVED"] = "APPROVED";
    AdminRequestStatus["REJECTED"] = "REJECTED";
    AdminRequestStatus["EXECUTED"] = "EXECUTED";
    AdminRequestStatus["FAILED"] = "FAILED";
    AdminRequestStatus["CANCELLED"] = "CANCELLED";
})(AdminRequestStatus || (AdminRequestStatus = {}));
/**
 * Role change type for audit records.
 */
export var RoleChangeType;
(function (RoleChangeType) {
    RoleChangeType["ADDITION"] = "addition";
    RoleChangeType["REMOVAL"] = "removal";
})(RoleChangeType || (RoleChangeType = {}));
