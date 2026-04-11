/**
 * Database Resource Manager — Intelligent DB Storage & Health Monitoring
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KERNEL-LAYER SERVICE: Active monitoring, trend projection, and adaptive
 * management of PostgreSQL storage resources.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is NOT a simple threshold check. It provides:
 *
 * 1. **Continuous Observation** — Periodic sampling of DB size, table sizes,
 *    and namespace breakdown at configurable intervals.
 *
 * 2. **Growth Rate Calculation** — Rolling window linear regression over
 *    historical samples to compute MB/day growth rate.
 *
 * 3. **Predictive Alerting** — Projects when the DB will hit warn/emergency/
 *    hard limit based on growth trend, not just current size.
 *
 * 4. **Per-Namespace Budgeting** — Tracks individual namespace usage against
 *    configurable budgets, detects runaway namespaces.
 *
 * 5. **Anomaly Detection** — Flags sudden spikes (>2× expected growth in a
 *    single sample period) and stale namespaces (no writes for >24h when
 *    data still exists).
 *
 * 6. **Adaptive Retention** — Dynamically adjusts the kernel retention policy
 *    based on actual DB pressure, not just fixed thresholds.
 *
 * 7. **Health Reporting** — Exports a structured health summary consumable
 *    by `/ops`, Grafana dashboards, and other kernel subsystems.
 *
 * All limits derived from `TIER.database.*` — a single plan upgrade
 * propagates to every threshold automatically.
 *
 * @module kernel/database-resource-manager
 */

import { prisma } from '../shared/prisma.js';
import { TIER } from '../config/resource-tiers.js';
import { kernel } from './kernel-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/** Severity levels for DB health status */
export type DbHealthLevel = 'healthy' | 'warning' | 'critical' | 'emergency';

/** A single point-in-time DB size sample */
export interface DbSizeSample {
  timestamp: number;   // epoch ms
  totalMb: number;     // pg_database_size() in MB
}

/** Per-namespace storage breakdown */
export interface NamespaceUsage {
  namespace: string;
  entryCount: number;
  estimatedMb: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  /** True if namespace has had no writes in >24h but still holds data */
  isStale: boolean;
}

/** Growth trend analysis result */
export interface GrowthTrend {
  /** MB per day (positive = growing, negative = shrinking) */
  mbPerDay: number;
  /** Days until warn threshold at current rate (Infinity if shrinking) */
  daysUntilWarn: number;
  /** Days until emergency threshold at current rate */
  daysUntilEmergency: number;
  /** Days until hard limit at current rate */
  daysUntilFull: number;
  /** Number of samples used in this calculation */
  sampleCount: number;
  /** Confidence: 'low' (<5 samples), 'medium' (5-20), 'high' (20+) */
  confidence: 'low' | 'medium' | 'high';
  /** R² coefficient of determination (0-1). Higher = better linear fit */
  rSquared: number;
  /** Growth acceleration (MB/day²): positive = accelerating, negative = decelerating */
  accelerationMbPerDay2: number;
}

/** Active anomaly detected by the manager */
export interface DbAnomaly {
  type: 'spike' | 'stale-namespace' | 'runaway-namespace' | 'unexpected-shrink' | 'acceleration';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  detectedAt: number; // epoch ms
  data: Record<string, unknown>;
}

/** Complete health report exported by the manager */
export interface DbHealthReport {
  /** Current overall health level */
  level: DbHealthLevel;
  /** Current DB size in MB */
  currentSizeMb: number;
  /** Plan storage limit in MB */
  storageLimitMb: number;
  /** Usage percentage (0-100) */
  usagePercent: number;
  /** Growth trend analysis */
  trend: GrowthTrend;
  /** Per-namespace breakdown (sorted largest first) */
  namespaces: NamespaceUsage[];
  /** Untracked MB (total DB size minus sum of tracked namespaces — shows WAL/index/schema bloat) */
  untrackedMb: number;
  /** Active anomalies */
  anomalies: DbAnomaly[];
  /** Active thresholds from TIER */
  thresholds: {
    warnMb: number;
    emergencyMb: number;
    limitMb: number;
    retentionDays: number;
    /** Currently effective retention (may be reduced under pressure) */
    effectiveRetentionDays: number;
  };
  /** GC effectiveness tracking */
  gcEffectiveness: {
    /** Number of GC deltas recorded */
    cycleCount: number;
    /** Average MB freed per observed GC cycle */
    avgMbFreed: number;
    /** Last observed GC freed MB */
    lastMbFreed: number;
  };
  /** Manager operational stats */
  manager: {
    running: boolean;
    sampleCount: number;
    lastSampleTime: string | null;
    uptimeMs: number;
    probesCompleted: number;
    probeErrors: number;
    consecutiveErrors: number;
    currentProbeIntervalMs: number;
  };
}

/** Configuration for namespace budget enforcement */
export interface NamespaceBudget {
  /** Namespace name (or '*' for default) */
  namespace: string;
  /** Max MB this namespace should consume */
  maxMb: number;
  /** Max entries this namespace should hold */
  maxEntries: number;
  /** Max age in days before entries are considered stale */
  maxAgeDays: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum samples retained in the rolling window */
const MAX_SAMPLES = 168; // 7 days at 1-hour intervals

/** Stale namespace threshold — no writes for this many ms */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Spike detection multiplier — flag if growth exceeds 2× expected */
const SPIKE_MULTIPLIER = 2.0;

/** Minimum samples needed for trend calculation */
const MIN_TREND_SAMPLES = 3;

/** Exponential decay factor for weighted regression (0-1, higher = more recency bias) */
const RECENCY_DECAY = 0.95;

/** Max consecutive errors before backing off probe interval */
const MAX_CONSECUTIVE_ERRORS_BEFORE_BACKOFF = 3;

/** Max backoff multiplier (e.g. 8× normal interval) */
const MAX_BACKOFF_MULTIPLIER = 8;

/** Default probe interval — matches TIER.database.gcIntervalMs / 4 for finer granularity */
const DEFAULT_PROBE_INTERVAL_MS = Math.min(
  TIER.database.gcIntervalMs / 4,
  60 * 60 * 1000, // cap at 1 hour
);

/** Default namespace budgets (overridable) */
const DEFAULT_NAMESPACE_BUDGETS: NamespaceBudget[] = [
  { namespace: 'kernel-logs', maxMb: 100, maxEntries: 5000, maxAgeDays: 7 },
  { namespace: 'kernel-snapshots', maxMb: 50, maxEntries: 2000, maxAgeDays: 7 },
  { namespace: 'kernel-crashes', maxMb: 20, maxEntries: 500, maxAgeDays: 30 },
  { namespace: 'kernel-exports', maxMb: 30, maxEntries: 1000, maxAgeDays: 7 },
  { namespace: 'kernel-metrics', maxMb: 20, maxEntries: 1000, maxAgeDays: 7 },
  { namespace: 'resilient-write-buffer', maxMb: 10, maxEntries: 1000, maxAgeDays: 3 },
  { namespace: 'ai-logs', maxMb: 10, maxEntries: 500, maxAgeDays: 7 },
  { namespace: 'security-bot-state', maxMb: 5, maxEntries: 100, maxAgeDays: 90 },
  { namespace: '*', maxMb: 50, maxEntries: 5000, maxAgeDays: 14 }, // default catch-all
];

// ============================================================================
// STATE
// ============================================================================

let probeInterval: NodeJS.Timeout | null = null;
let running = false;
let startTime = 0;
let probesCompleted = 0;
let probeErrors = 0;
let consecutiveProbeErrors = 0;
let baseProbeIntervalMs = 0;
let currentProbeIntervalMs = 0;

/** Rolling window of DB size samples */
const sizeSamples: DbSizeSample[] = [];

/** Last known namespace breakdown */
let lastNamespaces: NamespaceUsage[] = [];

/** Active anomalies (auto-cleared after 24h) */
const activeAnomalies: DbAnomaly[] = [];

/** Currently effective retention days (may differ from TIER default under pressure) */
let effectiveRetentionDays: number = TIER.database.retentionDays;

/** Namespace budgets (mutable for runtime reconfiguration) */
let namespaceBudgets: NamespaceBudget[] = [...DEFAULT_NAMESPACE_BUDGETS];

/** GC effectiveness tracking: observed deltas where size shrank between consecutive probes */
const gcDeltas: number[] = [];  // negative deltas (MB freed), up to last 50
const MAX_GC_DELTAS = 50;

type TableColumnSnapshot = {
  cacheEntries: Set<string>;
  runtimeMetrics: Set<string>;
};

let tableColumnSnapshot: TableColumnSnapshot | null = null;

async function getTableColumns(tableName: string): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    tableName
  );
  return new Set(rows.map((row) => row.column_name));
}

async function getTableColumnSnapshot(): Promise<TableColumnSnapshot> {
  if (tableColumnSnapshot) {
    return tableColumnSnapshot;
  }

  const [cacheEntries, runtimeMetrics] = await Promise.all([
    getTableColumns('cache_entries'),
    getTableColumns('runtime_metrics'),
  ]);

  tableColumnSnapshot = { cacheEntries, runtimeMetrics };
  return tableColumnSnapshot;
}

function resolveBytesExpression(columns: Set<string>, preferredColumns: string[]): string {
  for (const column of preferredColumns) {
    if (columns.has(column)) {
      return `COALESCE(SUM(LENGTH(${column}::text)::bigint), 0) as total_bytes`;
    }
  }
  return '0::bigint as total_bytes';
}

// ============================================================================
// CORE: Probing
// ============================================================================

/**
 * Execute a single probe — collects DB size, namespace breakdown, and runs
 * anomaly detection.
 */
async function probe(): Promise<void> {
  const probeStart = Date.now();

  try {
    // 1. Get total DB size
    const sizeResult = await prisma.$queryRawUnsafe<Array<{ size_bytes: bigint }>>(
      `SELECT pg_database_size(current_database()) as size_bytes`
    );
    const totalMb = Number(sizeResult[0]?.size_bytes ?? 0) / (1024 * 1024);

    // 2. Record sample
    const sample: DbSizeSample = { timestamp: Date.now(), totalMb };
    sizeSamples.push(sample);
    if (sizeSamples.length > MAX_SAMPLES) {
      sizeSamples.splice(0, sizeSamples.length - MAX_SAMPLES);
    }

    // 3. Collect namespace breakdown
    const columnSnapshot = await getTableColumnSnapshot();
    const cacheTotalBytesExpr = columnSnapshot.cacheEntries.has('size_bytes')
      ? 'COALESCE(SUM(size_bytes::bigint), 0) as total_bytes'
      : resolveBytesExpression(columnSnapshot.cacheEntries, ['value']);

    const namespaceRows = await prisma.$queryRawUnsafe<Array<{
      namespace: string;
      entry_count: bigint;
      total_bytes: bigint;
      oldest_entry: Date | null;
      newest_entry: Date | null;
    }>>(`
      SELECT
        namespace,
        COUNT(*) as entry_count,
        ${cacheTotalBytesExpr},
        MIN(created_at) as oldest_entry,
        MAX(updated_at) as newest_entry
      FROM cache_entries
      GROUP BY namespace
      ORDER BY total_bytes DESC
    `);

    const now = Date.now();
    lastNamespaces = namespaceRows.map(row => ({
      namespace: row.namespace,
      entryCount: Number(row.entry_count),
      estimatedMb: Number(row.total_bytes) / (1024 * 1024),
      oldestEntry: row.oldest_entry,
      newestEntry: row.newest_entry,
      isStale: row.newest_entry
        ? (now - row.newest_entry.getTime()) > STALE_THRESHOLD_MS && Number(row.entry_count) > 0
        : false,
    }));

    // 4. Also collect runtime_metrics table size
    const runtimeMetricsTotalBytesExpr = resolveBytesExpression(
      columnSnapshot.runtimeMetrics,
      ['metadata', 'value', 'payload']
    );
    const metricsRows = await prisma.$queryRawUnsafe<Array<{
      metric_type: string;
      entry_count: bigint;
      total_bytes: bigint;
      oldest_entry: Date | null;
      newest_entry: Date | null;
    }>>(`
      SELECT
        metric_type,
        COUNT(*) as entry_count,
        ${runtimeMetricsTotalBytesExpr},
        MIN(created_at) as oldest_entry,
        MAX(updated_at) as newest_entry
      FROM runtime_metrics
      GROUP BY metric_type
      ORDER BY total_bytes DESC
    `);

    for (const row of metricsRows) {
      lastNamespaces.push({
        namespace: `runtime_metrics:${row.metric_type}`,
        entryCount: Number(row.entry_count),
        estimatedMb: Number(row.total_bytes) / (1024 * 1024),
        oldestEntry: row.oldest_entry,
        newestEntry: row.newest_entry,
        isStale: row.newest_entry
          ? (now - row.newest_entry.getTime()) > STALE_THRESHOLD_MS && Number(row.entry_count) > 0
          : false,
      });
    }

    // 5. Track GC effectiveness (detect shrinks between consecutive probes)
    if (sizeSamples.length >= 2) {
      const prev = sizeSamples[sizeSamples.length - 2];
      const delta = totalMb - prev.totalMb;
      if (delta < -0.5) {  // Shrank by at least 0.5 MB — likely a GC cycle
        gcDeltas.push(Math.abs(delta));
        if (gcDeltas.length > MAX_GC_DELTAS) gcDeltas.splice(0, gcDeltas.length - MAX_GC_DELTAS);
      }
    }

    // 6. Run anomaly detection
    detectAnomalies(sample);

    // 7. Update adaptive retention
    updateAdaptiveRetention(totalMb);

    // 8. Check namespace budgets
    checkNamespaceBudgets();

    probesCompleted++;
    consecutiveProbeErrors = 0;  // Reset on success

    // If we were in backoff, restore normal interval
    if (currentProbeIntervalMs > baseProbeIntervalMs) {
      rescheduleProbe(baseProbeIntervalMs);
      kernel.info('db-resource', `Probe backoff cleared, restoring ${Math.round(baseProbeIntervalMs / 1000)}s interval`);
    }

    const durationMs = Date.now() - probeStart;
    const level = classifyHealth(totalMb);

    if (level === 'emergency' || level === 'critical') {
      kernel.warn('db-resource', `DB probe: ${totalMb.toFixed(0)} MB / ${TIER.database.storageLimitMb} MB (${level.toUpperCase()}) [${durationMs}ms]`);
    } else {
      kernel.debug('db-resource', `DB probe: ${totalMb.toFixed(0)} MB / ${TIER.database.storageLimitMb} MB (${level}) [${durationMs}ms]`);
    }
  } catch (err) {
    probeErrors++;
    consecutiveProbeErrors++;
    kernel.error('db-resource', `Probe failed (${consecutiveProbeErrors} consecutive): ${err instanceof Error ? err.message : String(err)}`);

    // Exponential backoff after repeated failures
    if (consecutiveProbeErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_BACKOFF) {
      const multiplier = Math.min(
        Math.pow(2, consecutiveProbeErrors - MAX_CONSECUTIVE_ERRORS_BEFORE_BACKOFF + 1),
        MAX_BACKOFF_MULTIPLIER,
      );
      const newInterval = baseProbeIntervalMs * multiplier;
      if (newInterval > currentProbeIntervalMs) {
        rescheduleProbe(newInterval);
        kernel.warn('db-resource', `Probe backoff: interval increased to ${Math.round(newInterval / 1000)}s (${multiplier}× base) after ${consecutiveProbeErrors} failures`);
      }
    }
  }
}

/**
 * Reschedule the probe interval (used for backoff and recovery).
 */
function rescheduleProbe(intervalMs: number): void {
  if (probeInterval) clearInterval(probeInterval);
  currentProbeIntervalMs = intervalMs;
  probeInterval = setInterval(async () => {
    if (!running) return;
    try { await probe(); }
    catch (err) { kernel.error('db-resource', `Periodic probe failed: ${err instanceof Error ? err.message : String(err)}`); }
  }, intervalMs);
}

// ============================================================================
// CORE: Growth Trend Analysis
// ============================================================================

/**
 * Calculate growth trend using exponentially-weighted least squares regression.
 * Recent samples carry more weight (recency bias via RECENCY_DECAY).
 * Returns MB/day rate, R² fit quality, acceleration, and threshold projections.
 */
function calculateGrowthTrend(): GrowthTrend {
  const n = sizeSamples.length;

  if (n < MIN_TREND_SAMPLES) {
    return {
      mbPerDay: 0,
      daysUntilWarn: Infinity,
      daysUntilEmergency: Infinity,
      daysUntilFull: Infinity,
      sampleCount: n,
      confidence: 'low',
      rSquared: 0,
      accelerationMbPerDay2: 0,
    };
  }

  // Exponentially-weighted linear regression: y = mx + b
  // Weight[i] = RECENCY_DECAY^(n-1-i) so newest sample has weight 1.0
  const firstTimestamp = sizeSamples[0].timestamp;
  let sumW = 0, sumWX = 0, sumWY = 0, sumWXY = 0, sumWX2 = 0;

  for (let i = 0; i < n; i++) {
    const w = Math.pow(RECENCY_DECAY, n - 1 - i);
    const x = (sizeSamples[i].timestamp - firstTimestamp) / (24 * 60 * 60 * 1000); // days
    const y = sizeSamples[i].totalMb;
    sumW += w;
    sumWX += w * x;
    sumWY += w * y;
    sumWXY += w * x * y;
    sumWX2 += w * x * x;
  }

  const denominator = sumW * sumWX2 - sumWX * sumWX;
  const mbPerDay = Math.abs(denominator) < 1e-10
    ? 0
    : (sumW * sumWXY - sumWX * sumWY) / denominator;

  // R² (coefficient of determination) for weighted regression
  let rSquared = 0;
  if (Math.abs(denominator) >= 1e-10) {
    const b = (sumWY - mbPerDay * sumWX) / sumW;
    let ssTot = 0, ssRes = 0;
    const yMean = sumWY / sumW;
    for (let i = 0; i < n; i++) {
      const w = Math.pow(RECENCY_DECAY, n - 1 - i);
      const x = (sizeSamples[i].timestamp - firstTimestamp) / (24 * 60 * 60 * 1000);
      const y = sizeSamples[i].totalMb;
      const yPred = mbPerDay * x + b;
      ssTot += w * (y - yMean) * (y - yMean);
      ssRes += w * (y - yPred) * (y - yPred);
    }
    rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  }

  // Acceleration: compare recent half slope vs older half slope
  let accelerationMbPerDay2 = 0;
  if (n >= 6) {
    const mid = Math.floor(n / 2);
    const olderSlope = computeSimpleSlope(sizeSamples.slice(0, mid));
    const newerSlope = computeSimpleSlope(sizeSamples.slice(mid));
    const timeSpanDays = (sizeSamples[n - 1].timestamp - sizeSamples[0].timestamp) / (24 * 60 * 60 * 1000);
    if (timeSpanDays > 0) {
      accelerationMbPerDay2 = Math.round(((newerSlope - olderSlope) / timeSpanDays) * 100) / 100;
    }
  }

  const currentMb = sizeSamples[n - 1].totalMb;
  const limits = TIER.database;

  const daysUntilWarn = mbPerDay > 0
    ? Math.max(0, (limits.sizeWarnMb - currentMb) / mbPerDay)
    : Infinity;
  const daysUntilEmergency = mbPerDay > 0
    ? Math.max(0, (limits.sizeEmergencyMb - currentMb) / mbPerDay)
    : Infinity;
  const daysUntilFull = mbPerDay > 0
    ? Math.max(0, (limits.storageLimitMb - currentMb) / mbPerDay)
    : Infinity;

  // Confidence combines sample count AND fit quality
  let confidence: GrowthTrend['confidence'];
  if (n < 5 || rSquared < 0.3) {
    confidence = 'low';
  } else if (n < 20 || rSquared < 0.7) {
    confidence = 'medium';
  } else {
    confidence = 'high';
  }

  return {
    mbPerDay: Math.round(mbPerDay * 100) / 100,
    daysUntilWarn: Math.round(daysUntilWarn * 10) / 10,
    daysUntilEmergency: Math.round(daysUntilEmergency * 10) / 10,
    daysUntilFull: Math.round(daysUntilFull * 10) / 10,
    sampleCount: n,
    confidence,
    rSquared: Math.round(rSquared * 1000) / 1000,
    accelerationMbPerDay2,
  };
}

/**
 * Simple unweighted slope calculation for a sub-window of samples.
 * Used for acceleration detection (comparing halves).
 */
function computeSimpleSlope(samples: DbSizeSample[]): number {
  const m = samples.length;
  if (m < 2) return 0;
  const firstTs = samples[0].timestamp;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (const s of samples) {
    const x = (s.timestamp - firstTs) / (24 * 60 * 60 * 1000);
    sx += x; sy += s.totalMb; sxy += x * s.totalMb; sx2 += x * x;
  }
  const d = m * sx2 - sx * sx;
  return Math.abs(d) < 1e-10 ? 0 : (m * sxy - sx * sy) / d;
}

// ============================================================================
// CORE: Anomaly Detection
// ============================================================================

/**
 * Detect anomalies based on the latest sample.
 * - Spike: growth between last two samples exceeds 2× the average per-sample growth
 * - Stale namespaces: already detected in probe()
 */
function detectAnomalies(latest: DbSizeSample): void {
  const now = Date.now();

  // Auto-clear old anomalies (>24h)
  for (let i = activeAnomalies.length - 1; i >= 0; i--) {
    if (now - activeAnomalies[i].detectedAt > 24 * 60 * 60 * 1000) {
      activeAnomalies.splice(i, 1);
    }
  }

  const n = sizeSamples.length;
  if (n < 2) return;

  const previous = sizeSamples[n - 2];
  const growthMb = latest.totalMb - previous.totalMb;
  const intervalHours = (latest.timestamp - previous.timestamp) / (60 * 60 * 1000);

  if (intervalHours < 0.01) return; // skip if too close

  // Calculate average growth per hour from full window
  if (n >= MIN_TREND_SAMPLES) {
    const first = sizeSamples[0];
    const totalWindowHours = (latest.timestamp - first.timestamp) / (60 * 60 * 1000);
    const avgGrowthPerHour = totalWindowHours > 0
      ? (latest.totalMb - first.totalMb) / totalWindowHours
      : 0;

    const expectedGrowthMb = avgGrowthPerHour * intervalHours;
    const threshold = Math.max(expectedGrowthMb * SPIKE_MULTIPLIER, 5); // min 5 MB to avoid noise

    if (growthMb > threshold && growthMb > 10) {
      addAnomaly({
        type: 'spike',
        severity: growthMb > 50 ? 'critical' : 'warning',
        message: `DB grew ${growthMb.toFixed(1)} MB in ${intervalHours.toFixed(1)}h (expected ~${expectedGrowthMb.toFixed(1)} MB)`,
        detectedAt: now,
        data: { growthMb, intervalHours, expectedGrowthMb, threshold },
      });
    }

    // Unexpected shrink (without GC running) — might indicate external changes
    if (growthMb < -50 && avgGrowthPerHour >= 0) {
      addAnomaly({
        type: 'unexpected-shrink',
        severity: 'info',
        message: `DB shrank ${Math.abs(growthMb).toFixed(1)} MB unexpectedly`,
        detectedAt: now,
        data: { growthMb, intervalHours },
      });
    }
  }

  // Stale namespace anomalies
  for (const ns of lastNamespaces) {
    if (ns.isStale && ns.estimatedMb > 1) {
      const existing = activeAnomalies.find(
        a => a.type === 'stale-namespace' && a.data.namespace === ns.namespace
      );
      if (!existing) {
        addAnomaly({
          type: 'stale-namespace',
          severity: ns.estimatedMb > 50 ? 'warning' : 'info',
          message: `Namespace "${ns.namespace}" has ${ns.entryCount} entries (~${ns.estimatedMb.toFixed(1)} MB) with no writes for >24h`,
          detectedAt: now,
          data: { namespace: ns.namespace, entryCount: ns.entryCount, estimatedMb: ns.estimatedMb },
        });
      }
    }
  }

  // Acceleration anomaly: growth rate is itself accelerating (second derivative)
  // This catches gradual but worsening trends before they become spikes
  if (n >= 8) {
    const trend = calculateGrowthTrend();
    if (trend.accelerationMbPerDay2 > 5 && trend.mbPerDay > 2) {
      addAnomaly({
        type: 'acceleration',
        severity: trend.accelerationMbPerDay2 > 20 ? 'critical' : 'warning',
        message: `Growth rate accelerating: ${trend.mbPerDay} MB/day, acceleration +${trend.accelerationMbPerDay2} MB/day² (R²=${trend.rSquared})`,
        detectedAt: now,
        data: { mbPerDay: trend.mbPerDay, acceleration: trend.accelerationMbPerDay2, rSquared: trend.rSquared },
      });
    }
  }
}

/**
 * Build a stable dedup key for an anomaly (avoids fragile JSON.stringify).
 */
function anomalyKey(a: DbAnomaly): string {
  const ns = typeof a.data.namespace === 'string' ? a.data.namespace : '';
  return `${a.type}:${ns}`;
}

/**
 * Add anomaly with deduplication — don't add if same type+namespace exists within 1h.
 */
function addAnomaly(anomaly: DbAnomaly): void {
  const key = anomalyKey(anomaly);
  const isDuplicate = activeAnomalies.some(
    a => anomalyKey(a) === key
      && (anomaly.detectedAt - a.detectedAt) < 60 * 60 * 1000
  );
  if (!isDuplicate) {
    activeAnomalies.push(anomaly);
    if (anomaly.severity === 'critical') {
      kernel.warn('db-resource', `ANOMALY [${anomaly.type}]: ${anomaly.message}`);
    } else if (anomaly.severity === 'warning') {
      kernel.info('db-resource', `ANOMALY [${anomaly.type}]: ${anomaly.message}`);
    }
  }
}

// ============================================================================
// CORE: Namespace Budget Enforcement
// ============================================================================

/**
 * Check each namespace against its budget and flag overages.
 */
function checkNamespaceBudgets(): void {
  for (const ns of lastNamespaces) {
    // Skip runtime_metrics pseudo-namespaces for budget checks
    if (ns.namespace.startsWith('runtime_metrics:')) continue;

    const budget = namespaceBudgets.find(b => b.namespace === ns.namespace)
      ?? namespaceBudgets.find(b => b.namespace === '*');

    if (!budget) continue;

    if (ns.estimatedMb > budget.maxMb) {
      const existing = activeAnomalies.find(
        a => a.type === 'runaway-namespace' && a.data.namespace === ns.namespace
      );
      if (!existing) {
        addAnomaly({
          type: 'runaway-namespace',
          severity: ns.estimatedMb > budget.maxMb * 2 ? 'critical' : 'warning',
          message: `Namespace "${ns.namespace}" at ${ns.estimatedMb.toFixed(1)} MB exceeds budget of ${budget.maxMb} MB`,
          detectedAt: Date.now(),
          data: {
            namespace: ns.namespace,
            estimatedMb: ns.estimatedMb,
            budgetMb: budget.maxMb,
            entryCount: ns.entryCount,
            budgetEntries: budget.maxEntries,
          },
        });
      }
    }
  }
}

// ============================================================================
// CORE: Adaptive Retention
// ============================================================================

/**
 * Dynamically adjust effective retention based on current DB pressure.
 * Smooth continuous curve from full retention at <75% to 1 day at >=95%.
 * No discontinuities — the function is monotonically decreasing in the pressure zone.
 */
function updateAdaptiveRetention(currentMb: number): void {
  const limits = TIER.database;
  const usagePercent = (currentMb / limits.storageLimitMb) * 100;

  if (usagePercent < 75) {
    // Normal: use plan default
    effectiveRetentionDays = limits.retentionDays;
  } else {
    // Pressure zone: smoothly interpolate from full retention → 1 day
    // At 75% → retentionDays, at 95%+ → 1 day
    const pressureFactor = Math.min(1, (usagePercent - 75) / 20); // 0..1
    effectiveRetentionDays = Math.max(
      1,
      Math.round(limits.retentionDays - pressureFactor * (limits.retentionDays - 1))
    );
  }
}

// ============================================================================
// CORE: Health Classification
// ============================================================================

/**
 * Classify current DB health level from size.
 * Thresholds: <60% healthy, 60-75% warning, 75-90% critical, >=90% emergency
 */
function classifyHealth(sizeMb: number): DbHealthLevel {
  const limits = TIER.database;
  if (sizeMb >= limits.sizeEmergencyMb) return 'emergency';
  if (sizeMb >= limits.sizeWarnMb) return 'critical';
  if (sizeMb >= limits.storageLimitMb * 0.6) return 'warning';
  return 'healthy';
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start the database resource manager.
 * Runs an immediate probe, then schedules periodic probes.
 *
 * @param intervalMs - Override probe interval (default: auto from TIER)
 */
export function startDatabaseResourceManager(intervalMs?: number): void {
  if (running) {
    kernel.warn('db-resource', 'Database resource manager already running');
    return;
  }

  const interval = intervalMs ?? DEFAULT_PROBE_INTERVAL_MS;
  running = true;
  startTime = Date.now();
  baseProbeIntervalMs = interval;
  currentProbeIntervalMs = interval;
  consecutiveProbeErrors = 0;

  kernel.info('db-resource', [
    'Database Resource Manager starting',
    `Plan: ${TIER.label}`,
    `DB Limit: ${TIER.database.storageLimitMb} MB`,
    `Warn: ${TIER.database.sizeWarnMb} MB`,
    `Emergency: ${TIER.database.sizeEmergencyMb} MB`,
    `Retention: ${TIER.database.retentionDays}d`,
    `Probe interval: ${Math.round(interval / 1000)}s`,
  ].join(' | '));

  // Immediate first probe (delayed 10s to let boot finish)
  setTimeout(async () => {
    if (!running) return;
    try {
      await probe();
    } catch (err) {
      kernel.error('db-resource', `Initial probe failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, 10_000);

  // Periodic probes
  probeInterval = setInterval(async () => {
    if (!running) return;
    try {
      await probe();
    } catch (err) {
      kernel.error('db-resource', `Periodic probe failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, interval);
}

/**
 * Stop the database resource manager.
 */
export function stopDatabaseResourceManager(): void {
  if (probeInterval) {
    clearInterval(probeInterval);
    probeInterval = null;
  }
  running = false;
  kernel.info('db-resource', `Database Resource Manager stopped (${probesCompleted} probes, ${probeErrors} errors)`);
}

/**
 * Get the current effective retention days (adaptive — may be lower than plan default).
 * Other modules (like kernel-persistence GC) should use this instead of TIER.database.retentionDays.
 */
export function getEffectiveRetentionDays(): number {
  return effectiveRetentionDays;
}

/**
 * Get the current growth trend analysis.
 */
export function getGrowthTrend(): GrowthTrend {
  return calculateGrowthTrend();
}

/**
 * Get a full health report for diagnostics and /ops commands.
 */
export function getDatabaseHealthReport(): DbHealthReport {
  const currentSizeMb = sizeSamples.length > 0
    ? sizeSamples[sizeSamples.length - 1].totalMb
    : 0;

  const limits = TIER.database;

  // Calculate untracked MB (total DB - sum of tracked namespace data)
  const trackedMb = lastNamespaces.reduce((sum, ns) => sum + ns.estimatedMb, 0);
  const untrackedMb = Math.max(0, Math.round((currentSizeMb - trackedMb) * 10) / 10);

  // GC effectiveness stats
  const avgMbFreed = gcDeltas.length > 0
    ? Math.round((gcDeltas.reduce((s, d) => s + d, 0) / gcDeltas.length) * 10) / 10
    : 0;
  const lastMbFreed = gcDeltas.length > 0
    ? Math.round(gcDeltas[gcDeltas.length - 1] * 10) / 10
    : 0;

  return {
    level: classifyHealth(currentSizeMb),
    currentSizeMb: Math.round(currentSizeMb * 10) / 10,
    storageLimitMb: limits.storageLimitMb,
    usagePercent: Math.round((currentSizeMb / limits.storageLimitMb) * 1000) / 10,
    trend: calculateGrowthTrend(),
    namespaces: [...lastNamespaces],
    untrackedMb,
    anomalies: [...activeAnomalies],
    thresholds: {
      warnMb: limits.sizeWarnMb,
      emergencyMb: limits.sizeEmergencyMb,
      limitMb: limits.storageLimitMb,
      retentionDays: limits.retentionDays,
      effectiveRetentionDays,
    },
    gcEffectiveness: {
      cycleCount: gcDeltas.length,
      avgMbFreed,
      lastMbFreed,
    },
    manager: {
      running,
      sampleCount: sizeSamples.length,
      lastSampleTime: sizeSamples.length > 0
        ? new Date(sizeSamples[sizeSamples.length - 1].timestamp).toISOString()
        : null,
      uptimeMs: running ? Date.now() - startTime : 0,
      probesCompleted,
      probeErrors,
      consecutiveErrors: consecutiveProbeErrors,
      currentProbeIntervalMs,
    },
  };
}

/**
 * Get the raw size sample history (for graphing).
 */
export function getSizeSamples(): ReadonlyArray<DbSizeSample> {
  return sizeSamples;
}

/**
 * Get active anomalies.
 */
export function getActiveAnomalies(): ReadonlyArray<DbAnomaly> {
  return activeAnomalies;
}

/**
 * Update namespace budgets at runtime.
 */
export function setNamespaceBudgets(budgets: NamespaceBudget[]): void {
  namespaceBudgets = [...budgets];
  kernel.info('db-resource', `Namespace budgets updated: ${budgets.length} budgets configured`);
}

/**
 * Force an immediate probe (for /ops commands or testing).
 */
export async function forceProbe(): Promise<DbHealthReport> {
  await probe();
  return getDatabaseHealthReport();
}

/**
 * Format a human-readable health summary for Discord embeds or logs.
 */
export function formatHealthSummary(): string {
  const report = getDatabaseHealthReport();
  const lines: string[] = [];

  // Status header
  const emoji = {
    healthy: '🟢',
    warning: '🟡',
    critical: '🟠',
    emergency: '🔴',
  }[report.level];

  lines.push(`${emoji} **DB Health: ${report.level.toUpperCase()}**`);
  lines.push(`${report.currentSizeMb.toFixed(0)} MB / ${report.storageLimitMb} MB (${report.usagePercent}%)`);

  // Dark storage warning
  if (report.untrackedMb > 50) {
    lines.push(`⚫ Untracked storage: ${report.untrackedMb.toFixed(0)} MB (WAL/indexes/schema/other tables)`);
  }

  // Growth trend
  const t = report.trend;
  if (t.sampleCount >= MIN_TREND_SAMPLES) {
    const direction = t.mbPerDay > 0 ? '📈' : t.mbPerDay < 0 ? '📉' : '➡️';
    lines.push(`${direction} Growth: ${t.mbPerDay > 0 ? '+' : ''}${t.mbPerDay} MB/day (${t.confidence} confidence, R²=${t.rSquared})`);

    if (t.accelerationMbPerDay2 !== 0) {
      const accelIcon = t.accelerationMbPerDay2 > 0 ? '🚀' : '🛬';
      lines.push(`${accelIcon} Acceleration: ${t.accelerationMbPerDay2 > 0 ? '+' : ''}${t.accelerationMbPerDay2} MB/day²`);
    }

    if (t.daysUntilFull !== Infinity && t.daysUntilFull < 90) {
      lines.push(`⏱️ Days until full: ${t.daysUntilFull}`);
    }
    if (t.daysUntilWarn !== Infinity && t.daysUntilWarn < 30) {
      lines.push(`⚠️ Days until warning: ${t.daysUntilWarn}`);
    }
  } else {
    lines.push(`📊 Trend: insufficient data (${t.sampleCount}/${MIN_TREND_SAMPLES} samples)`);
  }

  // GC effectiveness
  if (report.gcEffectiveness.cycleCount > 0) {
    lines.push(`♻️ GC: ${report.gcEffectiveness.cycleCount} cycles observed, avg ${report.gcEffectiveness.avgMbFreed} MB freed/cycle`);
  }

  // Retention
  if (report.thresholds.effectiveRetentionDays < report.thresholds.retentionDays) {
    lines.push(`🔧 Retention: ${report.thresholds.effectiveRetentionDays}d (reduced from ${report.thresholds.retentionDays}d under pressure)`);
  } else {
    lines.push(`📅 Retention: ${report.thresholds.retentionDays}d`);
  }

  // Top namespaces
  if (report.namespaces.length > 0) {
    lines.push('');
    lines.push('**Top Namespaces:**');
    for (const ns of report.namespaces.slice(0, 5)) {
      const staleTag = ns.isStale ? ' ⚠️STALE' : '';
      lines.push(`• \`${ns.namespace}\`: ${ns.estimatedMb.toFixed(1)} MB (${ns.entryCount} entries)${staleTag}`);
    }
  }

  // Active anomalies
  if (report.anomalies.length > 0) {
    lines.push('');
    lines.push(`**Anomalies (${report.anomalies.length}):**`);
    for (const a of report.anomalies.slice(0, 5)) {
      const icon = a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : 'ℹ️';
      lines.push(`${icon} ${a.message}`);
    }
  }

  // Probe health
  if (report.manager.consecutiveErrors > 0) {
    lines.push(`\n⚠️ Probe: ${report.manager.consecutiveErrors} consecutive errors (interval: ${Math.round(report.manager.currentProbeIntervalMs / 1000)}s)`);
  }

  return lines.join('\n');
}
