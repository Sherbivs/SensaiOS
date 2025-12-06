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
export enum SecuritySeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO',
}

/**
 * Threat types for detection system.
 * Maps to ThreatType enum in Prisma schema.
 */
export enum ThreatType {
  RAPID_ROLE_CHANGES = 'RAPID_ROLE_CHANGES',
  UNUSUAL_ORIGIN = 'UNUSUAL_ORIGIN',
  MASS_ROLE_REMOVAL = 'MASS_ROLE_REMOVAL',
  OFF_HOURS_ACTIVITY = 'OFF_HOURS_ACTIVITY',
  SINGLE_MEMBER_ANOMALY = 'SINGLE_MEMBER_ANOMALY',
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',
  UNAUTHORIZED_CHANGE = 'UNAUTHORIZED_CHANGE',
  BOT_DETECTED_CHANGE = 'BOT_DETECTED_CHANGE',
}

/**
 * Admin role request status workflow.
 * Maps to AdminRequestStatus enum in Prisma schema.
 */
export enum AdminRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXECUTED = 'EXECUTED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Role change type for audit records.
 */
export enum RoleChangeType {
  ADDITION = 'addition',
  REMOVAL = 'removal',
}

// ============================================================================
// SECURITY EVENT
// ============================================================================

/**
 * Core security event - immutable audit trail entry.
 *
 * @research R6 (SOC 2) - Hash chain links for immutability
 */
export interface SecurityEvent {
  /** Auto-generated BigInt ID */
  id?: bigint;

  /** Event classification: role-change, threat-detected, permission-violation, sweep, startup, shutdown */
  eventType: string;

  /** Event severity level */
  severity: SecuritySeverity;

  /** Discord guild ID where event occurred */
  guildId: string;

  /** Discord guild name at time of event */
  guildName: string;

  /** Target member Discord ID (if applicable) */
  memberId?: string | null;

  /** Target member tag at time of event */
  memberTag?: string | null;

  /** Role ID involved (if applicable) */
  roleId?: string | null;

  /** Role name at time of event */
  roleName?: string | null;

  /** Executor Discord ID (who performed the action) */
  executorId?: string | null;

  /** Executor tag at time of action */
  executorTag?: string | null;

  /** Origin of the event: security-bot-sweep, admin-manual, member-join, role-reaction, api-direct */
  origin: string;

  /** Additional event-specific data */
  metadata?: Record<string, unknown> | null;

  /** HMAC-SHA256 signature of event data */
  signature?: string | null;

  /** Row checksum for tampering detection */
  checksum: string;

  /** Hash chain link to previous event (R6 - Immutable Audit) */
  previousHash?: string | null;

  /** Event creation timestamp */
  createdAt?: Date;
}

/**
 * Input type for creating a new SecurityEvent (without auto-generated fields).
 */
export type SecurityEventInput = Omit<SecurityEvent, 'id' | 'createdAt'>;

// ============================================================================
// ROLE CHANGE AUDIT
// ============================================================================

/**
 * Role change audit trail entry - detailed tracking of role modifications.
 * Replaces roleArchive.js JSON storage.
 */
export interface RoleChangeAudit {
  /** Auto-generated BigInt ID */
  id?: bigint;

  /** Discord guild ID */
  guildId: string;

  /** Guild name at time of change */
  guildName: string;

  /** Target member Discord ID */
  memberId: string;

  /** Target member tag at time of change */
  memberTag: string;

  /** Type of change: 'addition' | 'removal' */
  changeType: 'addition' | 'removal';

  /** Role ID being changed */
  roleId: string;

  /** Role name at time of change */
  roleName: string;

  /** Role color (Discord int color code) */
  roleColor?: number | null;

  /** Role hierarchy position at time of change */
  rolePosition?: number | null;

  /** Executor Discord ID (nullable for system actions) */
  executorId?: string | null;

  /** Executor tag at time of action (nullable for system actions) */
  executorTag?: string | null;

  /** Executor's roles at time of action */
  executorRoles?: string[];

  /** Was this change authorized? */
  authorized?: boolean;

  /** Reason for authorization decision */
  authReason?: string | null;

  /** Was this change reverted? */
  reverted?: boolean;

  /** When the reversion occurred */
  revertedAt?: Date | null;

  /** Who performed the reversion */
  revertedBy?: string | null;

  /** Reason for reversion */
  revertReason?: string | null;

  /** Origin: sweep, member-join, admin-manual, security-bot-revert, role-reaction */
  origin: string;

  /** HMAC-SHA256 signature of audit data */
  signature?: string | null;

  /** Row checksum using timing-safe HMAC */
  checksum: string;

  /** Hash chain link to previous audit (R6 - Immutable Audit) */
  previousHash?: string | null;

  /** Additional context */
  metadata?: Record<string, unknown> | null;

  /** Creation timestamp */
  createdAt?: Date;
}

/**
 * Input type for creating a new RoleChangeAudit.
 * Omits auto-generated fields, integrity fields, and reversion fields.
 */
export type RoleChangeAuditInput = Omit<
  RoleChangeAudit,
  'id' | 'createdAt' | 'reverted' | 'revertedAt' | 'revertedBy' | 'revertReason' | 'checksum' | 'signature' | 'previousHash'
> & {
  /** Optional checksum (computed by service if not provided) */
  checksum?: string;
  /** Optional signature (computed by service if not provided) */
  signature?: string;
  /** Optional previous hash (computed by service if not provided) */
  previousHash?: string | null;
};

// ============================================================================
// THREAT DETECTION
// ============================================================================

/**
 * Threat evidence structure for forensics.
 */
export interface ThreatEvidence {
  /** Entries that triggered the detection */
  triggeringEntries?: Array<{
    id: bigint;
    changeType: string;
    timestamp: Date;
  }>;

  /** Statistical anomalies detected */
  anomalies?: Array<{
    metric: string;
    expected: number;
    actual: number;
    deviation: number;
  }>;

  /** Timeline of suspicious activity */
  timeline?: Array<{
    timestamp: Date;
    action: string;
    actor?: string;
  }>;

  /** Additional evidence */
  [key: string]: unknown;
}

/**
 * Threat detection record - forensics and incident response.
 */
export interface ThreatDetection {
  /** Auto-generated BigInt ID */
  id?: bigint;

  /** Type of threat detected */
  threatType: ThreatType;

  /** Threat severity */
  severity: SecuritySeverity;

  /** Confidence score (0.0 - 1.0) */
  confidence: number;

  /** Discord guild ID */
  guildId: string;

  /** Guild name */
  guildName: string;

  /** Human-readable description */
  description: string;

  /** Detailed evidence for forensics */
  evidence: ThreatEvidence;

  /** ID of RoleChangeAudit that triggered detection */
  triggeringEntryId?: bigint | null;

  /** MITRE ATT&CK technique ID (e.g., T1098.003) */
  mitreAttack?: string | null;

  /** MITRE ATT&CK tactic (e.g., Persistence) */
  mitreTactic?: string | null;

  /** Recommended response action */
  recommendedAction: string;

  /** Was automatic mitigation performed? */
  autoMitigated: boolean;

  /** What automatic action was taken */
  mitigationAction?: string | null;

  /** Has this threat been resolved? */
  resolved: boolean;

  /** Who resolved it */
  resolvedBy?: string | null;

  /** When it was resolved */
  resolvedAt?: Date | null;

  /** Resolution notes */
  resolutionNotes?: string | null;

  /** Was this a false positive? */
  falsePositive: boolean;

  /** Detection timestamp */
  createdAt?: Date;
}

/**
 * Input type for creating a new ThreatDetection.
 */
export type ThreatDetectionInput = Omit<
  ThreatDetection,
  | 'id'
  | 'createdAt'
  | 'autoMitigated'
  | 'resolved'
  | 'resolvedBy'
  | 'resolvedAt'
  | 'resolutionNotes'
  | 'falsePositive'
>;

// ============================================================================
// SECURITY BASELINE
// ============================================================================

/**
 * Security baseline - per-guild behavioral patterns.
 * Replaces securityBaselines.js.
 */
export interface SecurityBaseline {
  /** Auto-generated BigInt ID */
  id?: bigint;

  /** Discord guild ID (unique constraint) */
  guildId: string;

  /** Guild name */
  guildName: string;

  /** Average role changes per hour */
  averageChangesPerHour: number;

  /** Average role changes per day */
  averageChangesPerDay: number;

  /** Hours (0-23) with historically high activity */
  peakActivityHours: number[];

  /** Changes/minute threshold that triggers alert */
  rapidChangeThreshold: number;

  /** Per-member limit per hour */
  maxChangesPerMember: number;

  /** Whitelist of normal change origins */
  expectedOrigins: string[];

  /** Confidence level (0.0 - 1.0) based on data quantity */
  confidenceLevel: number;

  /** Number of entries used for computation */
  dataPointCount: number;

  /** When baseline was last computed */
  computedAt: Date;

  /** Last update timestamp */
  updatedAt?: Date;
}

/**
 * Input type for creating/updating a SecurityBaseline.
 */
export type SecurityBaselineInput = Omit<SecurityBaseline, 'id' | 'updatedAt'>;

// ============================================================================
// PERMISSION SNAPSHOT
// ============================================================================

/**
 * Permission snapshot - point-in-time role permission capture.
 * Used for cross-reference validation in 4-layer integrity.
 */
export interface PermissionSnapshot {
  /** Auto-generated BigInt ID */
  id?: bigint;

  /** Discord guild ID */
  guildId: string;

  /** Guild name */
  guildName: string;

  /** Discord role ID */
  roleId: string;

  /** Role name at capture time */
  roleName: string;

  /** Array of Discord permission flags */
  permissions: string[];

  /** Role hierarchy position */
  position: number;

  /** Role color (for display) */
  color?: number | null;

  /** Whether role is displayed separately */
  hoist: boolean;

  /** Whether role can be mentioned */
  mentionable: boolean;

  /** HMAC signature of permissions using timing-safe crypto */
  signature: string;

  /** Capture timestamp */
  capturedAt?: Date;
}

/**
 * Input type for creating a new PermissionSnapshot.
 */
export type PermissionSnapshotInput = Omit<PermissionSnapshot, 'id' | 'capturedAt'>;

// ============================================================================
// ADMIN ROLE REQUEST
// ============================================================================

/**
 * Admin role management request - workflow tracking with DRIP alerts.
 */
export interface AdminRoleRequest {
  /** Auto-generated BigInt ID */
  id?: bigint;

  /** Discord guild ID */
  guildId: string;

  /** Guild name */
  guildName: string;

  /** Requester Discord ID */
  requesterId: string;

  /** Requester tag at time of request */
  requesterTag: string;

  /** Requester's roles at time of request */
  requesterRoles: string[];

  /** Target member Discord ID */
  targetMemberId: string;

  /** Target member tag */
  targetMemberTag: string;

  /** Role ID being modified */
  roleId: string;

  /** Role name */
  roleName: string;

  /** Role hierarchy position */
  rolePosition: number;

  /** Action: 'add' | 'remove' */
  action: 'add' | 'remove';

  /** Optional reason provided */
  reason?: string | null;

  /** Workflow status */
  status: AdminRequestStatus;

  /** Does this request require approval? */
  requiresApproval: boolean;

  /** Who approved (if applicable) */
  approvedBy?: string | null;

  /** When approved */
  approvedAt?: Date | null;

  /** Who rejected (if applicable) */
  rejectedBy?: string | null;

  /** When rejected */
  rejectedAt?: Date | null;

  /** Rejection reason */
  rejectionReason?: string | null;

  /** When executed */
  executedAt?: Date | null;

  /** Execution result: success, failed, partial */
  executionResult?: string | null;

  /** Error message if failed */
  executionError?: string | null;

  /** Was DRIP alert sent? */
  dripAlertSent: boolean;

  /** DRIP alert message ID */
  dripAlertId?: string | null;

  /** When DRIP alert was sent */
  dripAlertSentAt?: Date | null;

  /** Additional context */
  metadata?: Record<string, unknown> | null;

  /** Creation timestamp */
  createdAt?: Date;

  /** Last update timestamp */
  updatedAt?: Date;
}

/**
 * Input type for creating a new AdminRoleRequest.
 */
export type AdminRoleRequestInput = Omit<
  AdminRoleRequest,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
  | 'approvedBy'
  | 'approvedAt'
  | 'rejectedBy'
  | 'rejectedAt'
  | 'rejectionReason'
  | 'executedAt'
  | 'executionResult'
  | 'executionError'
  | 'dripAlertSent'
  | 'dripAlertId'
  | 'dripAlertSentAt'
>;

// ============================================================================
// INTEGRITY CHECK
// ============================================================================

/**
 * Integrity verification log - track all validation runs.
 */
export interface IntegrityCheck {
  /** Auto-generated BigInt ID */
  id?: bigint;

  /** Check type: hmac_validation, cross_reference, sweep, baseline_compare */
  checkType: 'hmac_validation' | 'cross_reference' | 'sweep' | 'baseline_compare';

  /** Guild ID (if guild-specific check) */
  guildId?: string | null;

  /** Did the check pass? */
  passed: boolean;

  /** Total items checked */
  totalChecked: number;

  /** Number of failed items */
  failedCount: number;

  /** Details of failed validations */
  failedItems?: Array<{
    id: bigint | string;
    reason: string;
    expected?: string;
    actual?: string;
  }> | null;

  /** Duration in milliseconds */
  durationMs: number;

  /** Triggered by: scheduler, manual, startup */
  triggeredBy: 'scheduler' | 'manual' | 'startup';

  /** Correlation ID for tracing */
  correlationId?: string | null;

  /** When check started */
  startedAt: Date;

  /** When check completed */
  completedAt?: Date;
}

/**
 * Input type for creating a new IntegrityCheck.
 */
export type IntegrityCheckInput = Omit<IntegrityCheck, 'id' | 'completedAt'>;

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Valid event types for SecurityEvent.
 */
export type SecurityEventType =
  | 'role-change'
  | 'threat-detected'
  | 'permission-violation'
  | 'sweep'
  | 'startup'
  | 'shutdown'
  | 'integrity-check'
  | 'admin-request';

/**
 * Valid origins for role changes.
 */
export type ChangeOrigin =
  | 'security-bot-sweep'
  | 'admin-manual'
  | 'member-join'
  | 'role-reaction'
  | 'api-direct'
  | 'security-bot-revert'
  | 'sweep';

/**
 * MITRE ATT&CK techniques relevant to Discord security.
 */
export type MitreAttackTechnique =
  | 'T1098.003' // Account Manipulation: Additional Cloud Roles
  | 'T1078' // Valid Accounts
  | 'T1531' // Account Access Removal
  | 'T1136' // Create Account
  | 'T1087'; // Account Discovery

/**
 * MITRE ATT&CK tactics.
 */
export type MitreAttackTactic =
  | 'Persistence'
  | 'Privilege Escalation'
  | 'Defense Evasion'
  | 'Impact';
