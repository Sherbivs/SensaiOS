/**
 * Security Services Module
 * ========================
 *
 * Central export point for all security database services.
 * Provides typed database access layer replacing in-memory security state.
 *
 * @module security/services
 * @research P0-002 (Service Extraction) - COMPLETE
 * @research P0-004 (Checksum Implementation) - COMPLETE
 *
 * Services Overview:
 * - SecurityEventService: Core event recording with HMAC + hash chain
 * - RoleAuditService: Role change audit trail with anomaly detection
 * - ThreatDetectionService: Threat records with MITRE ATT&CK mapping
 * - BaselineService: Per-guild behavioral baselines for anomaly detection
 * - ChecksumService: Centralized checksum/signature operations (P0-004)
 *
 * @example
 * ```typescript
 * import {
 *   SecurityEventService,
 *   RoleAuditService,
 *   ThreatDetectionService,
 *   BaselineService,
 *   ChecksumService,
 * } from './security/services';
 *
 * // Initialize services with Prisma client
 * const eventService = new SecurityEventService(prisma);
 * const auditService = new RoleAuditService(prisma);
 * const threatService = new ThreatDetectionService(prisma);
 * const baselineService = new BaselineService(prisma);
 * const checksumService = new ChecksumService({ hmacSecret: 'secret' });
 *
 * // Record security event with automatic hash chain
 * await eventService.recordEvent({
 *   guildId: '123',
 *   eventType: 'ROLE_CHANGE',
 *   severity: SecuritySeverity.MEDIUM,
 *   ...
 * });
 *
 * // Detect and record threats with MITRE ATT&CK
 * await threatService.recordThreat({
 *   guildId: '123',
 *   threatType: ThreatType.RAPID_ROLE_CHANGE,
 *   mitreAttackId: 'T1098',
 *   ...
 * });
 *
 * // Compute behavioral baselines
 * await baselineService.computeBaseline('123', auditService);
 *
 * // Verify integrity with timing-safe operations
 * const isValid = checksumService.verifyEventIntegrity(event);
 * ```
 */

// ============================================================================
// Core Security Services
// ============================================================================

export { SecurityEventService } from './security-event-service.js';
export type {
  SecurityEventQueryOptions,
  IntegrityCheckResult,
  SecurityEventStats,
} from './security-event-service.js';

export { RoleAuditService } from './role-audit-service.js';
export type {
  RoleChangeAuditQueryOptions,
  RoleChangeStats,
  AnomalyResult,
} from './role-audit-service.js';

export { ThreatDetectionService } from './threat-detection-service.js';
export type {
  ThreatQueryOptions,
  ThreatStats,
} from './threat-detection-service.js';

export { BaselineService } from './baseline-service.js';
export type {
  BaselineFreshnessConfig,
  BaselineQueryOptions,
  BaselineHealth,
  BulkHealthResult,
} from './baseline-service.js';

// ============================================================================
// Checksum Service (P0-004)
// ============================================================================

export { ChecksumService, createChecksumService } from './checksum-service.js';
export type {
  ChecksumServiceConfig,
  IntegrityResult,
  ChecksumResult,
  HashChainLink,
} from './checksum-service.js';

// ============================================================================
// Key Rotation Service (P0-005)
// ============================================================================

export {
  KeyRotationService,
  createKeyRotationService,
} from './key-rotation-service.js';
export type {
  HmacAlgorithm,
  KeyStatus,
  ManagedKey,
  KeyRotationConfig,
  KeyRotationServiceConfig,
  VerificationResult,
  KeyRotationStats,
  KeyRotationEvent,
} from './key-rotation-service.js';

// ============================================================================
// Column Encryption Service (R5 - GDPR Art. 32)
// ============================================================================

export {
  ColumnEncryptionService,
  createColumnEncryptionService,
} from './column-encryption-service.js';
export type {
  ColumnEncryptionConfig,
  EncryptedField,
  SearchableHash,
  PIIFieldType,
  EncryptionStats,
  BatchEncryptionResult,
} from './column-encryption-service.js';

// ============================================================================
// Immutable Audit Service (R6 - SOC 2)
// ============================================================================

export {
  ImmutableAuditService,
  InMemoryAuditStorage,
  createImmutableAuditService,
} from './immutable-audit-service.js';
export type {
  ImmutableAuditConfig,
  AuditEntryInput,
  AuditEntry,
  ChainVerificationResult,
  EntryVerificationResult,
  ChainStats,
  GapDetectionResult,
  IAuditStorage,
} from './immutable-audit-service.js';

// ============================================================================
// Security Logger (R11 - Structured Logging)
// ============================================================================

export {
  SecurityLogger,
  ConsoleLogOutput,
  createSecurityLogger,
  createCorrelation,
  childCorrelation,
  parseTraceparent,
  formatTraceparent,
  parseLogLevel,
  LogLevel,
  SecurityCategory,
} from './security-logger.js';
export type {
  SecurityLoggerConfig,
  LogEntry,
  SecurityLogAttributes,
  CorrelationContext,
  LogOutput,
  LogLevelName,
} from './security-logger.js';

// ============================================================================
// Retention Policy Service (P1-005 - Data Retention)
// ============================================================================

export {
  RetentionPolicyService,
  createRetentionPolicyService,
  DEFAULT_RETENTION_POLICIES,
} from './retention-policy-service.js';
export type {
  RetentionCategory,
  RetentionPolicy,
  RetentionExecutionResult,
  RetentionReport,
  RetentionCategoryReport,
  RetentionPolicyServiceConfig,
  DeletionAuditRecord,
} from './retention-policy-service.js';

// ============================================================================
// Prometheus Metrics Service (P1-007 - Observability)
// ============================================================================

export {
  PrometheusMetricsService,
  createPrometheusMetricsService,
  DEFAULT_LATENCY_BUCKETS,
  SECURITY_METRICS,
} from './prometheus-metrics-service.js';
export type {
  MetricType,
  MetricConfig,
  Labels,
  CounterValue,
  GaugeValue,
  HistogramValue,
  SummaryValue,
  HealthStatus,
  ComponentHealth,
  HealthReport,
  HealthChecker,
  PrometheusMetricsConfig,
} from './prometheus-metrics-service.js';

// ============================================================================
// PagerDuty Service (P1-008 - Alert Escalation)
// ============================================================================

export {
  PagerDutyService,
  createPagerDutyService,
  SEVERITY_PRIORITY,
} from './pagerduty-service.js';
export type {
  AlertSeverity,
  EventAction,
  AlertStatus,
  AlertInput,
  AlertLink,
  AlertImage,
  AlertRecord,
  PagerDutyEventPayload,
  PagerDutyResponse,
  PagerDutyServiceConfig,
  HttpClient,
  AlertStats,
} from './pagerduty-service.js';

// ============================================================================
// Input Sanitization Service (P2-001 - Security Hardening)
// ============================================================================

export {
  InputSanitizationService,
  createInputSanitizationService,
  SanitizationError,
  SanitizationErrorCode,
  isSanitizationError,
  hasSanitizationErrorCode,
  isRecoverableSanitizationError,
} from './input-sanitization-service.js';
export type {
  InputSanitizationConfig,
  SanitizationLogger,
  ValidatedRequest,
  DiscordEmbed,
  SanitizationResult,
  NonceValidationResult,
  UrlValidationResult,
} from './input-sanitization-service.js';

// ============================================================================
// Cross-Reference Validation Service (P2-002 - Data Integrity)
// ============================================================================

export {
  CrossReferenceValidationService,
  createCrossReferenceValidationService,
  ValidationCheckType,
  ValidationSeverity,
  SECURITY_FOREIGN_KEYS,
} from './cross-reference-validation-service.js';
export type {
  CrossRefValidationConfig,
  CrossRefLogger,
  ValidationIssue,
  ValidationCheckResult,
  ValidationReport,
  ForeignKeyDefinition,
  ConsistencyRule,
} from './cross-reference-validation-service.js';

// ============================================================================
// Integrity Sweep Scheduler (P2-003 - Automated Validation)
// ============================================================================

export {
  IntegritySweepScheduler,
  createIntegritySweepScheduler,
  SweepType,
  ViolationType,
  ViolationSeverity,
} from './integrity-sweep-scheduler.js';
export type {
  SweepSchedulerConfig,
  SweepSchedule,
  SweepResult,
  IntegrityViolation,
  IntegrityAlert,
  SchedulerStatus,
  SweepLogger,
  AlertHandler,
} from './integrity-sweep-scheduler.js';

// ============================================================================
// Security Event Bus (P2-004 - Event-Driven Architecture)
// ============================================================================

export {
  SecurityEventBus,
  createSecurityEventBus,
  SecurityChannel,
  EventPriority,
  createAuthEvent,
  createRoleEvent,
  createThreatEvent,
} from './security-event-bus.js';
export type {
  EventBusConfig,
  SecurityEvent as BusSecurityEvent,
  EventHandler,
  EventFilter,
  EventTransformer,
  SubscriptionOptions,
  Subscription,
  DeadLetterEntry,
  EventBusStats,
  EventBusLogger,
  AuthEventPayload,
  RoleEventPayload,
  ThreatEventPayload,
} from './security-event-bus.js';

// ============================================================================
// Row-Level Security Service (D7 - PostgreSQL RLS)
// ============================================================================

export {
  RowLevelSecurityService,
  createRowLevelSecurityService,
  RLSServiceError,
  RLS_ERROR_CODES,
  RLS_TABLES,
  RLSPolicyType,
  isRLSTable,
  isRLSError,
  isRecoverableRLSError,
} from './row-level-security-service.js';
export type {
  RLSTable,
  RLSPolicy,
  TableRLSStatus,
  RLSPolicyInfo,
  RLSStatus,
  GuildContext,
  RLSOperationResult,
  RLSError,
  RLSLogger,
  RLSPrismaClient,
  RowLevelSecurityServiceConfig,
  RLSErrorCode,
} from './row-level-security-service.js';

// ============================================================================
// DI Container Service (P2-006 - Dependency Injection)
// ============================================================================

export {
  DIContainer,
  createDIContainer,
  ServiceLifecycle,
  ServiceHealth,
  DIContainerError,
  ServiceNotFoundError,
  CircularDependencyError,
  ServiceInitializationError,
  DuplicateRegistrationError,
  isDIContainerError,
  isServiceNotFoundError,
  isCircularDependencyError,
} from './di-container.js';
export type {
  DIContainerConfig,
  ServiceRegistration,
  ServiceFactory,
  ServiceInstance,
  ServiceStatus,
  ContainerStats,
  ServiceDecorator,
  ContainerMiddleware,
  ContainerLogger,
  ServiceScope,
} from './di-container.js';

// ============================================================================
// Migration Automation Service (D11 - Schema Migration)
// ============================================================================

export {
  MigrationAutomationService,
  createMigrationAutomationService,
  MigrationStatus,
  LockStatus,
  MigrationError,
  MigrationNotFoundError,
  MigrationLockError,
  MigrationValidationError,
  isMigrationError,
  isMigrationNotFoundError,
  isMigrationLockError,
  isMigrationValidationError,
} from './migration-automation-service.js';
export type {
  MigrationAutomationConfig,
  MigrationMetadata,
  MigrationResult,
  BatchMigrationResult,
  RollbackResult,
  ValidationResult,
  PreMigrationCheck,
  MigrationLock,
  MigrationHistoryEntry,
  MigrationStats,
  MigrationLogger,
  MigrationNotification,
} from './migration-automation-service.js';

// ============================================================================
// Continuous Aggregates Service (R4 - TimescaleDB)
// ============================================================================

export {
  ContinuousAggregatesService,
  createContinuousAggregatesService,
  AggregateError,
  AggregateNotFoundError,
  AggregateExistsError,
  RefreshError,
  QueryError,
  isAggregateError,
  isAggregateNotFoundError,
  isRefreshError,
  SECURITY_AGGREGATE_TEMPLATES,
} from './continuous-aggregates-service.js';
export type {
  ContinuousAggregatesConfig,
  ContinuousAggregateDefinition,
  AggregateExpression,
  RefreshPolicy,
  RefreshResult,
  AggregateStats,
  AggregateQueryParams,
  AggregateNotification,
} from './continuous-aggregates-service.js';

// ============================================================================
// Re-exported Types
// ============================================================================

// Enums
export {
  SecuritySeverity,
  ThreatType,
  RoleChangeType,
} from '../types/database-models.js';

// Type-only exports for interfaces
export type {
  SecurityEvent,
  SecurityEventInput,
  RoleChangeAudit,
  RoleChangeAuditInput,
  ThreatDetection,
  ThreatDetectionInput,
  SecurityBaseline,
  SecurityBaselineInput,
} from '../types/database-models.js';
