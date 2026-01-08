/**
 * Security Bot State Module
 * Unified exports for state persistence, tracking, and security analysis
 * 
 * @module bot/state
 * 
 * @example
 * ```typescript
 * import {
 *   // Lifecycle
 *   initializeState, saveState, shutdownState,
 *   // Recording
 *   recordSweep, recordAlert, recordError,
 *   // Queries
 *   getStatsSummary, getRecentEvents,
 *   // Types
 *   type SecurityBotState
 * } from './state/index.js';
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types (re-export all from types.ts)
// ─────────────────────────────────────────────────────────────────────────────

export type {
  // Core state structure
  SecurityBotState,
  StateMetadata,
  CumulativeStats,
  GuildState,
  RuntimeState,
  DatabaseStatus,
  
  // Timeline
  TimelineEvent,
  TimelineEventType,
  TimelineEventDetails,
  SweepDetails,
  PermissionChangeDetails,
  AlertDetails,
  RestartDetails,
  ShutdownDetails,
  ErrorDetails,
  MemberFetchTimeoutDetails,
  
  // Metrics
  HourlyMetric,
  HourlyMetrics,
  MetricsSummary,
  MetricsHistory,
  MetricsEventType,
  
  // Context
  GuildContext,
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Environment detection
  IS_PRODUCTION,
  IS_TEST,
  
  // Constants
  MAX_TIMELINE_EVENTS,
  SNAPSHOT_RETENTION_DAYS,
  AUTO_SAVE_INTERVAL_MS,
  MAX_ARCHIVE_SIZE,
  HMAC_ALGORITHM,
  
  // Security
  getHmacSecret,
  
  // Config object
  stateConfig,
} from './config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Persistence (Core Lifecycle)
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Lifecycle
  initializeState,
  loadState,
  saveState,
  shutdownState,
  
  // Auto-save management
  startAutoSave,
  stopAutoSave,
  
  // State factories
  createDefaultState,
  
  // State mutations
  addTimelineEvent,
  updateCumulativeStats,
  updateGuildState,
  updateRuntimeState,
  recordMetricsEvent,
  
  // Metrics queries
  getMetricsSummary,
  getMetricsTrend,
  
  // Validation & Integrity (P5-G)
  validateState,
  computeStateChecksum,
  verifyStateChecksum,
  
  // Degraded mode
  isStateDegraded,
} from './persistence.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stats (Recording & Queries)
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Event recording
  recordSweep,
  recordPermissionChange,
  recordAlert,
  recordError,
  recordMemberFetchTimeout,
  
  // Database tracking
  updateDatabaseStatus,
  updateActiveSweeps,
  
  // Queries
  getStatsSummary,
  getRecentEvents,
  getGuildStats,
  getAllGuildsSummary,
  getTimeSinceRestart,
  
  // Lifecycle events
  emitStartup,
  emitShutdown,
  
  // Utilities
  formatUptime,
} from './stats.js';

// Re-export stats types
export type { StatsSummaryResult, GuildSummary } from './stats.js';

// ─────────────────────────────────────────────────────────────────────────────
// Context (Guild Management)
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Guild initialization
  initializeGuild,
  restoreGuildContext,
  
  // Sweep scheduling
  getTimeSinceLastSweep,
  isSweepOverdue,
  getGuildsNeedingSweep,
  
  // Monitoring control
  enableGuildMonitoring,
  disableGuildMonitoring,
  getMonitoringStatus,
  
  // Recovery
  buildRestartSummary,
  getRecoveryRecommendations,
} from './context.js';

// ─────────────────────────────────────────────────────────────────────────────
// Timeline (Formatting)
// ─────────────────────────────────────────────────────────────────────────────

export {
  formatTimelineEvent,
  getTimelineSummary,
  getFormattedTimeline,
  getRecentActivitySummary,
  getEventIcon,
  buildTimelineEmbedFields,
} from './timeline.js';

// ─────────────────────────────────────────────────────────────────────────────
// Role Archive (HMAC-Protected History)
// ─────────────────────────────────────────────────────────────────────────────

export {
  initializeRoleArchive,
  recordRoleChange,
  getRoleStatistics,
  getMemberRoleHistory,
  getRoleChangeHistory,
  isAnomalousChange,
  exportArchive,
  refreshSecurityBaselines,
  getSecurityBaselines,
  shutdownRoleArchive,
} from './roleArchive.js';

// ─────────────────────────────────────────────────────────────────────────────
// Security Analysis
// ─────────────────────────────────────────────────────────────────────────────

// Security baselines
export {
  generateSecurityBaselines,
  loadSecurityBaselines,
  saveSecurityBaselines,
  shouldRefreshBaselines,
} from './securityBaselines.js';

// Threat detection
export {
  detectSecurityThreats,
  calculateCurrentActivity,
} from './threatDetector.js';

// Security metrics & scoring
export {
  calculateSecurityScore,
  analyzeThreatTrends,
  generateRecommendations,
  getSecurityMetrics,
} from './securityMetrics.js';

// Re-export security types
export type {
  SecurityScoreComponents,
  SecurityScore,
  ThreatWindowData,
  ThreatTrendAnalysis,
  Recommendation,
  RecommendationPriority,
  RecommendationCategory,
} from './securityMetrics.js';
