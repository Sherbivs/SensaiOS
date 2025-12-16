/**
 * Security Bot State Types
 * @module bot/state/types
 */

// ─────────────────────────────────────────────────────────────────────────────
// State Structure Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DatabaseStatus {
  dev: 'unknown' | 'connected' | 'disconnected' | 'error';
  prod: 'unknown' | 'connected' | 'disconnected' | 'error';
}

export interface StateMetadata {
  lastSaved: string;
  lastRestart: string;
  previousRestart?: string;
  processStartTime: string;
  hostname: string;
  nodeVersion: string;
  botVersion: string;
}

export interface CumulativeStats {
  totalUptime: number;
  restartCount: number;
  sweepCount: number;
  alertCount: number;
  permissionChangesDetected: number;
  permissionChangesReverted: number;
  revertFailures: number;
  guildCount: number;
  firstStartTime: string;
}

export interface HourlyMetric {
  timestamp: string;
  sweeps: number;
  alerts: number;
  changes: number;
  reverts: number;
  failures: number;
  restarts?: number;
  permissionChanges?: number;
  permissionReverts?: number;
  revertFailures?: number;
  errors?: number;
  memberFetchTimeouts?: number;
}

// Extended hourly metrics for detailed tracking
export interface HourlyMetrics extends HourlyMetric {
  permissionChanges: number;
  permissionReverts: number;
  revertFailures: number;
  errors: number;
  memberFetchTimeouts: number;
}

// Summary of metrics over a period
export interface MetricsSummary {
  sweeps: number;
  alerts: number;
  permissionChanges: number;
  permissionReverts: number;
  revertFailures: number;
  errors: number;
  memberFetchTimeouts: number;
  restarts: number;
  hoursWithData: number;
}

export interface MetricsHistory {
  hourly: HourlyMetrics[];
  lastPruned: string;
}

export interface GuildState {
  id: string;
  name: string;
  lastSweep: string | null;
  sweepCount: number;
  alertCount: number;
  permissionChanges: number;
  monitoring: boolean;
  lastActivity: string;
}

export interface RuntimeState {
  currentUptime: number;
  currentRestartTime: string;
  databaseStatus: DatabaseStatus;
  activeSweepIntervals: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Event Types
// ─────────────────────────────────────────────────────────────────────────────

export type TimelineEventType = 
  | 'sweep'
  | 'permission_change'
  | 'alert'
  | 'restart'
  | 'shutdown'
  | 'error'
  | 'member_fetch_timeout';

export interface SweepDetails {
  rolesChecked: number;
  changesDetected: number;
}

export interface PermissionChangeDetails {
  userName: string;
  userId?: string;
  action: string;
  reverted: boolean;
  revertStatus?: string;
  revertErrors?: string[];
}

export interface AlertDetails {
  recipient: string;
  recipientId?: string;
  reason: string;
  delivered: boolean;
}

export interface RestartDetails {
  reason: string;
  previousUptime: number;
}

export interface ShutdownDetails {
  reason: string;
  uptime: number;
}

export interface ErrorDetails {
  message: string;
  stack?: string;
  code?: string;
}

export interface MemberFetchTimeoutDetails {
  origin: string;
  attempt: number;
  maxRetries: number;
  isFinal: boolean;
}

export type TimelineEventDetails = 
  | SweepDetails
  | PermissionChangeDetails
  | AlertDetails
  | RestartDetails
  | ShutdownDetails
  | ErrorDetails
  | MemberFetchTimeoutDetails;

export interface TimelineEvent {
  timestamp: string;
  type: TimelineEventType;
  guildId?: string;
  guildName?: string;
  details: TimelineEventDetails;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main State Type
// ─────────────────────────────────────────────────────────────────────────────

export interface SecurityBotState {
  version: number;
  schemaVersion: string;
  metadata: StateMetadata;
  cumulative: CumulativeStats;
  metricsHistory: MetricsHistory;
  timeline: TimelineEvent[];
  guilds: Record<string, GuildState>;
  runtime: RuntimeState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GuildContext {
  isNew: boolean;
  shouldResumeSweep: boolean;
  lastSweep: string | null;
  sweepCount: number;
  alertCount?: number;
  permissionChanges?: number;
}

export interface GuildNeedingSweep {
  id: string;
  name: string;
  timeSinceLastSweep: number | null;
}

export interface MonitoringStatus {
  id: string;
  name: string;
  monitoring: boolean;
  lastSweep: string | null;
  sweepCount: number;
  lastActivity: string;
}

export interface RestartSummary {
  restartNumber: number;
  timeSinceLastRestart: string;
  totalUptime: string;
  currentUptime: string;
  totalSweeps: number;
  totalAlerts: number;
  totalPermissionChanges: number;
  successfulReverts: number;
  failedReverts: number;
  guildsMonitored: number;
  databaseStatus: DatabaseStatus;
}

export interface RecoveryRecommendation {
  priority: 'high' | 'medium' | 'low';
  action: string;
  message: string;
  guilds?: GuildNeedingSweep[];
  errors?: TimelineEvent[];
  count?: number;
}

export interface TimelineSummary {
  total: number;
  byType: Record<string, number>;
  timeRange: {
    oldest: string | null;
    newest: string | null;
  };
}

export interface StatsSummary {
  totalSweeps: number;
  totalAlerts: number;
  totalPermissionChanges: number;
  revertSuccessRate: number;
  averageSweepsPerHour: number;
  uptimePercentage: number;
}

export interface MetricsTrend {
  period: string;
  sweeps: number;
  alerts: number;
  changes: number;
  reverts: number;
  failures: number;
  trend: 'up' | 'down' | 'stable';
}

// ─────────────────────────────────────────────────────────────────────────────
// Cumulative Stats Update
// ─────────────────────────────────────────────────────────────────────────────

export interface CumulativeStatsUpdate {
  sweepCount?: number;
  alertCount?: number;
  permissionChangesDetected?: number;
  permissionChangesReverted?: number;
  revertFailures?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric Event Types
// ─────────────────────────────────────────────────────────────────────────────

export type MetricEventType = 
  | 'sweep'
  | 'alert'
  | 'permission_change'
  | 'permission_revert'
  | 'revert_failure'
  | 'restart';
