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
// PHASE 3: RUN GUARDED (Coming Soon)
// ============================================================================

// export { runGuarded, runGuardedSafe, getCorrelationId } from './run-guarded.js';
// export { guarded } from './guarded-decorator.js';
