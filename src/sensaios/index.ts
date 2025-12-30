/**
 * SensaiOS — Multi-Tenant Observability-First Architecture
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * BARREL EXPORTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SensaiOS provides:
 * - TenantScope: Mandatory context for multi-tenancy
 * - ExportEnvelope: Scoped envelope for observability data
 * - CanonicalError: Structured errors with recovery suggestions (Phase 2)
 * - runGuarded(): Kernel wrapper for handler invocations (Phase 3)
 * 
 * @module sensaios
 * @since 2025-12-28
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  Environment,
  ExportFormat,
  ExportDestination,
  ErrorCategory,
  ErrorSeverity,
  RecoverySuggestion,
  ExportMeta,
  GuardedContext,
  GuardedResult,
} from './types.js';

// ============================================================================
// TENANT SCOPE
// ============================================================================

export type { TenantScope } from './tenant-scope.js';

export {
  // Factory functions
  scopeFromInteraction,
  scopeFromGuild,
  scopeFromUser,
  systemScope,
  workerScope,
  // Context propagation
  withScope,
  withScopeAsync,
  getCurrentScope,
  requireScope,
  isInScope,
  // Validation
  ScopeValidationError,
  validateScope,
  isTenantScope,
  // Serialization
  serializeScope,
  scopePrefix,
  scopeToLabels,
  // Resolution
  resolveScope,
  getScopeData,
} from './tenant-scope.js';

// ============================================================================
// EXPORT ENVELOPE
// ============================================================================

export type {
  ExportEnvelope,
  CreateExportEnvelopeParams,
  LokiStream,
  LokiPushRequest,
} from './export-envelope.js';

export {
  // Type guard
  isExportEnvelope,
  // Factory functions
  createExportEnvelope,
  toExportEnvelope,
  // Logging helpers
  LogEnvelope,
  // Serialization
  toJson,
  toJsonl,
  toPretty,
  toLoki,
  // Batching
  EnvelopeBatcher,
} from './export-envelope.js';

// ============================================================================
// PHASE 2: ERROR DETECTION
// ============================================================================

export type {
  CanonicalError,
  ToCanonicalErrorOptions,
} from './canonical-error.js';

export {
  // Category & severity detection
  detectCategory,
  inferSeverity,
  // Fingerprinting
  generateFingerprint,
  generateErrorCode,
  // Recovery
  getRecoverySuggestions,
  // Type guard
  isCanonicalError,
  // Conversion
  toCanonicalError,
  // Serialization
  serializeCanonicalError,
  summarizeError,
} from './canonical-error.js';

export type {
  ErrorRoute,
  ErrorRouterConfig,
  ErrorOutputHandler,
} from './error-routing.js';

export {
  // Default routes
  DEFAULT_ERROR_ROUTES,
  // Router class
  ErrorRouter,
  // Global router
  getErrorRouter,
  initializeErrorRouter,
  routeError,
  // Convenience
  shouldTrackError,
  shouldAlertError,
  getDestinations,
} from './error-routing.js';

export type {
  ErrorPattern,
  ErrorTrackerConfig,
  ErrorTrackerStats,
} from './error-tracker.js';

export {
  // Tracker class
  ErrorTracker,
  // Global tracker
  getErrorTracker,
  initializeErrorTracker,
  trackError,
} from './error-tracker.js';

// ============================================================================
// PHASE 3: RUN GUARDED
// ============================================================================

export type { RunGuardedContext } from './run-guarded.js';

export {
  // Core functions
  runGuarded,
  runGuardedSafe,
  // Correlation ID access
  getCorrelationId,
  requireCorrelationId,
  // Convenience helpers
  createGuardedHandler,
  wrapWithGuard,
  runGuardedParallel,
  runGuardedSequence,
} from './run-guarded.js';

export type {
  GuardedDecoratorOptions,
  GuardedClassOptions,
} from './guarded-decorator.js';

export {
  // Decorators
  guarded,
  guardedClass,
  guardedProperty,
} from './guarded-decorator.js';

// ============================================================================
// PHASE 4: COMPONENT CONTEXT & KERNEL PRIMITIVES
// ============================================================================

export type {
  // Database primitive
  DbPrimitive,
  // Export log primitive
  ExportEnvelopeData,
  AppendResult,
  ExportFilter,
  ExportsPrimitive,
  // Job queue primitive
  JobEnvelope,
  LeasedJob,
  JobResult,
  JobsPrimitive,
  // Outbox primitive
  OutboxEnvelope,
  OutboxPrimitive,
  // Config primitive
  ConfigScope,
  ConfigPrimitive,
  // RBAC primitive
  Capability,
  AuditEvent,
  RbacPrimitive,
  // Observability primitive
  ScopedLogger,
  MetricsClient,
  ObsPrimitive,
  // RNG primitive
  DeterministicRng,
  RngPrimitive,
  // Storage primitive
  BlobMetadata,
  StorageObject,
  StoragePrimitive,
  // Component context
  ComponentContext,
  // Component model
  HostKind,
  DiscordHandler,
  ExportHandler,
  JobHandler,
  HttpHandler,
  CliHandler,
  SensaiComponent,
} from './component-context.js';

export type { CreateContextOptions } from './context-factory.js';

export {
  // Primitive factories (for custom implementations)
  createDbPrimitive,
  createExportsPrimitiveStub,
  createJobsPrimitiveStub,
  createOutboxPrimitiveStub,
  createConfigPrimitiveStub,
  createRbacPrimitiveStub,
  createStoragePrimitiveStub,
  createObsPrimitive,
  createRngPrimitive,
  // Main context factory
  createComponentContext,
  // Specialized context helpers
  contextFromInteraction,
  contextFromGuild,
  contextFromWorker,
  systemContext,
  contextFromCli,
  // Testing
  createTestContext,
} from './context-factory.js';

// ============================================================================
// PHASE 5: COMPONENT REGISTRY & SUPERVISOR
// ============================================================================

export type {
  // Component state types
  ComponentState,
  RegisteredComponent,
  RegistryStats,
  // Validation types
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './component-registry.js';

export {
  ComponentRegistry,
  componentRegistry,
} from './component-registry.js';

export type {
  // Handler registry types
  RegisteredHandler,
  HandlerLookup,
  SupervisorStats,
} from './component-supervisor.js';

export {
  ComponentSupervisor,
  supervisor,
  // Convenience functions
  registerComponent,
  bootSupervisor,
  shutdownSupervisor,
} from './component-supervisor.js';

// ============================================================================
// PHASE 6: INTEGRATION LAYER (Boot & Dispatchers)
// ============================================================================

export type {
  BootLogger,
  BootLogEntry,
  BootLogLevel,
  BootPhase,
  BootStatus,
} from './boot-logger.js';

export {
  BOOT_PHASES,
  createBootLogger,
  initBootLogger,
  getBootLogger,
  clearBootLogger,
} from './boot-logger.js';

export type {
  KernelConfig,
  DatabaseConfig,
  KernelStats,
  SensaiKernel,
} from './kernel-boot.js';

export {
  createKernel,
  initKernel,
  getKernel,
  clearKernel,
  bootKernel,
  shutdownKernel,
} from './kernel-boot.js';

export type {
  DiscordInteraction,
  DiscordDispatcherConfig,
  DiscordDispatchResult,
  ExportDispatcherConfig,
  ExportDispatchResult,
  JobDispatcherConfig,
  JobDispatchResult,
  HttpRequest,
  HttpResponse,
  HttpDispatcherConfig,
  HttpDispatchResult,
  CliCommand,
  CliResult,
  CliDispatcherConfig,
  CliDispatchResult,
} from './dispatchers.js';

export {
  createDiscordDispatcher,
  createExportDispatcher,
  createJobDispatcher,
  createHttpDispatcher,
  createCliDispatcher,
} from './dispatchers.js';
