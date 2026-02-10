/**
 * Memory Metrics Collection
 *
 * Centralized metrics for bounded data structures.
 * Used by /ops memory and monitoring dashboards.
 */

import { getBufferMetrics as getActivityBufferMetrics } from '../../utils/activityTracker.js';
import { PlayerResolver } from '../player-resolver.js';
import { getContentAddressableStorage } from '../../sensaios/storage/content-addressable.js';
import { getDiscordIdentityService } from '../discord-identity.js';
import { getKnowledgeBaseMetrics } from '../ai/ai-log-analyzer.js';
import { EventBus } from '../../shared/event-bus.js';
import { getCacheSnapshot } from '../cache.js';
import { getLogBuffer } from '../../shared/logBuffer.js';
import { getStats as getAiLogStats } from '../ai/ai-log-writer.js';
import { lokiBackend } from '../../observability/backends/loki/index.js';
import { getBufferStats as getResilientBufferStats } from './resilient-write-buffer.js';
import { getPatternDetectorStats, MAX_FINGERPRINTS } from '../error-brain/pattern-detector.js';
import { getStats as getErrorBrainCacheStats } from '../error-brain/error-brain-cache.js';
import { formatBytes, getCacheStats as getMonitoringCacheStats } from './monitoring-utils.js';
import { getAuditTrail } from '../../kernel/kernel-observer.js';

const WARNING_THRESHOLD = 75;
const CRITICAL_THRESHOLD = 90;

const EVENT_BUS_REPLAY_MAX = 100;
const EVENT_BUS_PATTERN_CACHE_MAX = 500;
const SECURITY_MEMORY_CACHE_MAX = 1000;
const LOG_BUFFER_MAX = 200;
const AI_LOG_BUFFER_MAX = 100;
const RESILIENT_WRITE_BUFFER_MAX = 1000;
const ERROR_BRAIN_RECENT_ERRORS_MAX = 1000;
const KERNEL_AUDIT_MAX = 500;

export type MetricStatus = 'healthy' | 'warning' | 'critical';
export type MetricUnit = 'count' | 'bytes';

export interface BoundedStructureMetrics {
  name: string;
  current: number;
  max: number;
  utilization: number;
  status: MetricStatus;
  unit?: MetricUnit;
}

export interface MemoryMetricsSummary {
  timestamp: Date;
  rssMemoryMB: number;
  heapUsedMB: number;
  boundedStructures: BoundedStructureMetrics[];
  warnings: string[];
}

function classifyStatus(utilization: number): MetricStatus {
  if (utilization >= CRITICAL_THRESHOLD) return 'critical';
  if (utilization >= WARNING_THRESHOLD) return 'warning';
  return 'healthy';
}

function buildMetric(
  name: string,
  current: number,
  max: number,
  unit: MetricUnit = 'count'
): BoundedStructureMetrics {
  const utilization = max > 0 ? (current / max) * 100 : 0;
  const status = classifyStatus(utilization);
  return { name, current, max, utilization, status, unit };
}

function pushMetric(
  metrics: BoundedStructureMetrics[],
  warnings: string[],
  metric: BoundedStructureMetrics
): void {
  metrics.push(metric);
  if (metric.status !== 'healthy') {
    warnings.push(`${metric.name} at ${metric.utilization.toFixed(1)}%`);
  }
}

function recordFailure(warnings: string[], label: string): void {
  warnings.push(`Failed to collect ${label} metrics`);
}

export async function collectMemoryMetrics(): Promise<MemoryMetricsSummary> {
  const metrics: BoundedStructureMetrics[] = [];
  const warnings: string[] = [];

  const memUsage = process.memoryUsage();
  const rssMemoryMB = memUsage.rss / (1024 * 1024);
  const heapUsedMB = memUsage.heapUsed / (1024 * 1024);

  try {
    const activity = getActivityBufferMetrics();
    pushMetric(metrics, warnings, buildMetric(
      'ActivityTracker.pendingActivities',
      activity.current,
      activity.max
    ));
  } catch {
    recordFailure(warnings, 'ActivityTracker');
  }

  try {
    const resolver = PlayerResolver.getInstance();
    const cacheStats = resolver.getCacheStats();
    pushMetric(metrics, warnings, buildMetric(
      'PlayerResolver.cache',
      cacheStats.size,
      cacheStats.max
    ));
  } catch {
    recordFailure(warnings, 'PlayerResolver');
  }

  try {
    const cas = getContentAddressableStorage();
    const casStats = cas.getStats();
    pushMetric(metrics, warnings, buildMetric(
      'ContentAddressableStorage.blobs',
      casStats.totalBlobs,
      casStats.maxBlobs
    ));
  } catch {
    recordFailure(warnings, 'ContentAddressableStorage');
  }

  try {
    const identity = getDiscordIdentityService();
    const stats = identity.getCacheStats();
    pushMetric(metrics, warnings, buildMetric(
      'DiscordIdentity.userCache',
      stats.users.size,
      stats.users.max
    ));
    pushMetric(metrics, warnings, buildMetric(
      'DiscordIdentity.guildCache',
      stats.guilds.size,
      stats.guilds.max
    ));
  } catch {
    recordFailure(warnings, 'DiscordIdentity');
  }

  try {
    const knowledgeStats = getKnowledgeBaseMetrics();
    pushMetric(metrics, warnings, buildMetric(
      'AiLogAnalyzer.errorPatterns',
      knowledgeStats.errorPatterns.size,
      knowledgeStats.errorPatterns.max
    ));
    pushMetric(metrics, warnings, buildMetric(
      'AiLogAnalyzer.performanceBaselines',
      knowledgeStats.performanceBaselines.size,
      knowledgeStats.performanceBaselines.max
    ));
    pushMetric(metrics, warnings, buildMetric(
      'AiLogAnalyzer.userBehavior',
      knowledgeStats.userBehaviorPatterns.size,
      knowledgeStats.userBehaviorPatterns.max
    ));
    pushMetric(metrics, warnings, buildMetric(
      'AiLogAnalyzer.correlations',
      knowledgeStats.correlations.size,
      knowledgeStats.correlations.max
    ));
    pushMetric(metrics, warnings, buildMetric(
      'AiLogAnalyzer.anomalies',
      knowledgeStats.anomalies.size,
      knowledgeStats.anomalies.max
    ));
    pushMetric(metrics, warnings, buildMetric(
      'AiLogAnalyzer.insights',
      knowledgeStats.insights.size,
      knowledgeStats.insights.max
    ));
  } catch {
    recordFailure(warnings, 'AiLogAnalyzer');
  }

  try {
    const bus = EventBus.getInstance();
    const busStats = bus.getStats();
    const patternStats = bus.getPatternCacheStats();
    pushMetric(metrics, warnings, buildMetric(
      'EventBus.replayBuffer',
      busStats.replayBufferSize,
      EVENT_BUS_REPLAY_MAX
    ));
    pushMetric(metrics, warnings, buildMetric(
      'EventBus.patternCache',
      patternStats.size,
      EVENT_BUS_PATTERN_CACHE_MAX
    ));
  } catch {
    recordFailure(warnings, 'EventBus');
  }

  try {
    const snapshot = getCacheSnapshot();
    pushMetric(metrics, warnings, buildMetric(
      'SecurityCache.memoryEntries',
      snapshot.entryCount,
      SECURITY_MEMORY_CACHE_MAX
    ));
  } catch {
    recordFailure(warnings, 'SecurityCache');
  }

  try {
    const logBuffer = getLogBuffer();
    if (logBuffer) {
      const stats = logBuffer.getStats();
      pushMetric(metrics, warnings, buildMetric(
        'LogBuffer.entries',
        stats.buffered,
        LOG_BUFFER_MAX
      ));
    } else {
      recordFailure(warnings, 'LogBuffer');
    }
  } catch {
    recordFailure(warnings, 'LogBuffer');
  }

  try {
    const stats = getAiLogStats();
    pushMetric(metrics, warnings, buildMetric(
      'AiLogWriter.buffer',
      stats.bufferSize,
      AI_LOG_BUFFER_MAX
    ));
  } catch {
    recordFailure(warnings, 'AiLogWriter');
  }

  try {
    const lokiStatus = lokiBackend.getDetailedStatus();
    pushMetric(metrics, warnings, buildMetric(
      'Loki.queueDepth',
      lokiStatus.queue.depth,
      lokiStatus.queue.capacity
    ));
  } catch {
    recordFailure(warnings, 'Loki');
  }

  try {
    const bufferStats = getResilientBufferStats();
    pushMetric(metrics, warnings, buildMetric(
      'ResilientWriteBuffer.pendingWrites',
      bufferStats.pendingWrites,
      RESILIENT_WRITE_BUFFER_MAX
    ));
  } catch {
    recordFailure(warnings, 'ResilientWriteBuffer');
  }

  try {
    const patternStats = getPatternDetectorStats();
    pushMetric(metrics, warnings, buildMetric(
      'ErrorBrain.recentErrors',
      patternStats.recentErrorsCount,
      ERROR_BRAIN_RECENT_ERRORS_MAX
    ));
    pushMetric(metrics, warnings, buildMetric(
      'ErrorBrain.fingerprintKeys',
      patternStats.fingerprintKeysTotal,
      MAX_FINGERPRINTS
    ));
  } catch {
    recordFailure(warnings, 'ErrorBrain.PatternDetector');
  }

  try {
    const cacheStats = getErrorBrainCacheStats();
    pushMetric(metrics, warnings, buildMetric(
      'ErrorBrain.cacheBytes',
      cacheStats.estimatedSizeBytes,
      cacheStats.maxSizeBytes,
      'bytes'
    ));
  } catch {
    recordFailure(warnings, 'ErrorBrain.Cache');
  }

  try {
    const cacheStats = getMonitoringCacheStats();
    pushMetric(metrics, warnings, buildMetric(
      'Monitoring.fingerprintCache',
      cacheStats.fingerprintCache.size,
      cacheStats.fingerprintCache.capacity
    ));
  } catch {
    recordFailure(warnings, 'MonitoringUtils');
  }

  try {
    const auditTrail = getAuditTrail(KERNEL_AUDIT_MAX);
    pushMetric(metrics, warnings, buildMetric(
      'Kernel.auditTrail',
      auditTrail.length,
      KERNEL_AUDIT_MAX
    ));
  } catch {
    recordFailure(warnings, 'KernelAuditTrail');
  }

  return {
    timestamp: new Date(),
    rssMemoryMB,
    heapUsedMB,
    boundedStructures: metrics,
    warnings,
  };
}

export function formatMemoryMetrics(
  summary: MemoryMetricsSummary,
  options: { includeHeader?: boolean } = {}
): string {
  const lines: string[] = [];
  const includeHeader = options.includeHeader ?? true;

  if (includeHeader) {
    lines.push('=== MEMORY METRICS ===');
  }

  lines.push(`RSS Memory: ${summary.rssMemoryMB.toFixed(1)} MB`);
  lines.push(`Heap Used: ${summary.heapUsedMB.toFixed(1)} MB`);
  lines.push('');
  lines.push('Bounded Structures:');

  for (const metric of summary.boundedStructures) {
    const statusIcon = metric.status === 'healthy'
      ? '✅'
      : metric.status === 'warning'
        ? '⚠️'
        : '🔴';

    const currentValue = metric.unit === 'bytes'
      ? formatBytes(metric.current)
      : metric.current.toString();
    const maxValue = metric.unit === 'bytes'
      ? formatBytes(metric.max)
      : metric.max.toString();

    lines.push(
      `• ${statusIcon} ${metric.name}: ${currentValue}/${maxValue} (${metric.utilization.toFixed(1)}%)`
    );
  }

  if (summary.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of summary.warnings) {
      lines.push(`• ⚠️ ${warning}`);
    }
  }

  return lines.join('\n');
}
