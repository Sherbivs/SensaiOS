/**
 * Security Bot Types — Public API
 * =================================
 *
 * Central export point for all Security Bot type definitions.
 *
 * @module security/types
 */

// Database model types and enums
export {
  // Enums
  SecuritySeverity,
  ThreatType,
  AdminRequestStatus,
  // Model types
  type SecurityEvent,
  type SecurityEventInput,
  type RoleChangeAudit,
  type RoleChangeAuditInput,
  type ThreatDetection,
  type ThreatDetectionInput,
  type ThreatEvidence,
  type SecurityBaseline,
  type SecurityBaselineInput,
  type PermissionSnapshot,
  type PermissionSnapshotInput,
  type AdminRoleRequest,
  type AdminRoleRequestInput,
  type IntegrityCheck,
  type IntegrityCheckInput,
  // Helper types
  type SecurityEventType,
  type ChangeOrigin,
  type MitreAttackTechnique,
  type MitreAttackTactic,
} from './database-models.js';

// Plugin system types (from Sprint 0)
export {
  // Enums
  PluginPriority,
  // Types
  type PluginState,
  type SecurityPlugin,
  type PluginMetadata,
  type SecurityContext,
  type SecurityOperationOrigin,
  type SecurityEventBase,
  type RoleChangeEvent,
  type PermissionChangeEvent,
  type ThreatDetectedEvent,
  // Note: ThreatType is exported from both - plugin version uses strings
  type ThreatSeverity,
  type ThreatEvidence as PluginThreatEvidence,
  type ThreatAction,
  type SecurityEvent as PluginSecurityEvent,
  type PluginResponse,
  type PluginAction,
  type PluginActionType,
  type PluginError,
  type PluginRegistration,
  type PluginRegistryStats,
} from '../plugins/types.js';
