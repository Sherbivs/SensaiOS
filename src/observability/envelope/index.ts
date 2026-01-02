/**
 * Envelope Module — Unified Observability Data Format
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTENDS existing systems, provides universal interchange format
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module bridges:
 *   - Kernel types (LogObservation, ErrorObservation)
 *   - ObservabilityEvent (hub layer)
 *   - LogEntry (database schema)
 *   - CLI output
 * 
 * Usage:
 * ```typescript
 * import { 
 *   createLog, 
 *   fromLogObservation, 
 *   toObservabilityEvent 
 * } from './observability/envelope/index.js';
 * 
 * // Create new envelope
 * const log = createLog('info', 'database', 'query', 'Query OK', { sql: '...' });
 * 
 * // Convert from kernel format
 * const envelope = fromLogObservation(kernelObs);
 * 
 * // Convert to hub format (for backends)
 * const hubEvent = toObservabilityEvent(envelope);
 * ```
 * 
 * @module observability/envelope
 */

// ─── Types ─────────────────────────────────────────────────────────────────
export {
  // Core types
  type UniversalEnvelope,
  type LogEnvelope,
  type MetricEnvelope,
  type EventEnvelope,
  type TraceEnvelope,
  type AlertEnvelope,
  type OutputEnvelope,
  
  // Enums
  ObservationKind,
  LogLevel,
  AlertSeverity,
  
  // Sub-types
  type EnvelopeSource,
  type EnvelopeCorrelation,
  type EnvelopeContext,
  type EnvelopeMetrics,
  type EnvelopeError,
  type DiscordContext,
  type GameContext,
  type DatabaseContext,
  type HttpContext,
  
  // Type guards
  isEnvelope,
  isLogEnvelope,
  isMetricEnvelope,
  isAlertEnvelope,
  isOutputEnvelope,
  
  // Converters (FROM existing formats)
  fromLogObservation,
  fromErrorObservation,
  fromObservabilityEvent,
  
  // Converters (TO existing formats)
  toObservabilityEvent,
  toLogObservation,
  
  // Re-exports of existing types for convenience
  type LogObservation,
  type ErrorObservation,
  type ServiceObservation,
  type EventObservation,
  type ObservabilityEvent,
  type ObservabilityLevel,
} from './types.js';

// ─── Factory ───────────────────────────────────────────────────────────────
export {
  // Configuration
  configureFactory,
  getFactoryConfig,
  type FactoryConfig,
  
  // ID generation (uses kernel system)
  generateId,
  generateCorrelationId,
  getCorrelationChain,
  
  // Log factory (all levels)
  createLog,
  debug,
  info,
  warn,
  error,
  fatal,
  
  // Other factories
  createMetric,
  createEvent,
  createTrace,
  createAlert,
  createOutput,
  
  // Error helpers
  errorToEnvelopeError,
  createErrorLog,
  
  // Options type
  type CreateEnvelopeOptions,
} from './factory.js';

// ─── Kernel Re-exports (Observability Layer is a peer to App Layer) ────────
// These let consumers use kernel correlation without importing both modules
export {
  getCurrentCorrelationId,
  getParentCorrelationId,
  withCorrelation,
  startTrace,
  getCurrentContext,
  type CorrelationContext,
} from '../../kernel/correlation.js';

// ─── Serializer ────────────────────────────────────────────────────────────
export {
  // Core functions
  serialize,
  deserialize,
  tryDeserialize,
  deserializeJsonl,
  serializeMany,
  
  // Configurable serializer factory
  createSerializer,
  
  // Pre-configured serializers
  serializers,
  
  // Types
  type OutputFormat,
  type SerializeOptions,
} from './serializer.js';

// ─── Console Bridge ────────────────────────────────────────────────────────
export {
  // Main API
  log,
  // Note: debug/info/warn/error/fatal exported from factory as envelope creators
  // Console versions available via: log.debug, log.info, etc.
  
  // Scoped loggers
  scopedLogger,
  loggers,
  
  // Configuration
  configureConsole,
  getConsoleConfig,
  
  // Testing utilities
  flushBuffer,
  peekBuffer,
  
  // Types
  type ConsoleConfig,
} from './console.js';

// ─── Query DSL ─────────────────────────────────────────────────────────────
export {
  // Main query builder
  query,
  EnvelopeQuery,
  
  // Quick filters
  errors,
  recent,
  search,
  trace,
  
  // Filter builders
  levelFilter,
  kindFilter,
  componentFilter,
  operationFilter,
  serviceFilter,
  messageFilter,
  messageRegexFilter,
  timeFilter,
  sinceFilter,
  correlationFilter,
  correlationTraceFilter,
  tagFilter,
  dataFilter,
  hasErrorFilter,
  errorCodeFilter,
  
  // Combinators
  and,
  or,
  not,
  
  // Utilities
  parseRelativeTime,
  
  // Types
  type FilterPredicate,
  type SortDirection,
  type SortField,
  type TimeRange,
  type QueryResult,
} from './query.js';

// ─── Migration Helper ──────────────────────────────────────────────────────
export {
  // Drop-in console replacement
  console as migratedConsole,
  
  // Factory for custom consoles
  createMigrationConsole,
  
  // Pre-configured consoles for common file types
  migrationConsoles,
  
  // Configuration
  configureMigration,
  resetMigrationConfig,
  
  // Codemod helpers
  generateImportStatement,
  detectComponent,
  analyzeFile,
  
  // Types
  type MigrationConsoleConfig,
  type MigrationStats,
} from './migrate.js';
