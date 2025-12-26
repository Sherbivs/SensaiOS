/**
 * Error Brain Database — SQLite-based Local Intelligence Storage
 * 
 * Purpose:
 * - Store learned patterns for ultra-fast lookups (<10ms vs 50-100ms PostgreSQL)
 * - Persist ML model weights (time patterns, correlations, cascades, recovery strategies)
 * - Provide local-first intelligence that works offline
 * - Sync critical patterns to PostgreSQL hourly
 * 
 * Architecture:
 * - SQLite database (sql.js, WASM-based, no native bindings)
 * - WAL mode for durability without blocking
 * - Auto-save every 30 seconds
 * - Graceful shutdown with final save
 * 
 * Schema:
 * - time_patterns: Hourly error rate baselines per fingerprint
 * - correlations: Error A → Error B relationships
 * - cascades: Root cause → downstream errors
 * - recovery_weights: Strategy effectiveness per fingerprint
 * - impact_weights: User impact predictions per fingerprint
 * - baselines: Global metric baselines for anomaly detection
 * - brain_metadata: Schema version, last sync time, model info
 * 
 * Referenced By: src/services/error-brain/error-brain-cache.ts,
 *                src/services/error-brain/pattern-detector.ts,
 *                src/workers/error-brain-worker.ts,
 *                docs/projects/error-brain-architecture.md
 * 
 * @module services/error-brain/error-brain-db
 */

// KERNEL FIRST — Must be first import to monitor other system initialization
import {
  createIntelligenceHook,
  type IntelligenceHook,
} from '../../kernel/kernel-hooks.js';

// LOGGER SECOND — Must be early import to capture initialization errors
import { getLogger } from '../../shared/logging/index.js';
const logger = getLogger();

import initSqlJs, { type Database } from 'sql.js';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { ErrorBrainConfig } from '../../config/error-brain-config.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Time pattern entry (hourly error rate baseline)
 */
export interface TimePatternEntry {
  id: number;
  hour: number;                    // 0-23
  dayOfWeek: number | null;        // 0-6 (null = any day)
  fingerprint: string | null;      // null = global pattern
  avgCount: number;
  stdDev: number;
  anomalyThreshold: number;
  sampleCount: number;
  lastUpdated: number;             // Unix timestamp
}

/**
 * Correlation entry (error A → error B)
 */
export interface CorrelationEntry {
  id: number;
  primaryFingerprint: string;
  secondaryFingerprint: string;
  correlationStrength: number;     // 0.0 to 1.0
  avgTimeDeltaMs: number;
  observationCount: number;
  confidence: number;
  lastObserved: number;            // Unix timestamp
}

/**
 * Cascade entry (root cause → downstream errors)
 */
export interface CascadeEntry {
  id: number;
  rootFingerprint: string;
  childFingerprints: string[];     // JSON array
  cascadeDepth: number;
  avgSpreadTimeMs: number;
  totalImpact: number;
  confidence: number;
  lastObserved: number;            // Unix timestamp
}

/**
 * Recovery weight entry (strategy effectiveness)
 */
export interface RecoveryWeightEntry {
  id: number;
  fingerprint: string;
  strategy: string;
  successCount: number;
  failureCount: number;
  avgRecoveryTimeMs: number | null;
  effectivenessScore: number;
  lastUpdated: number;             // Unix timestamp
}

/**
 * Impact weight entry (user impact prediction)
 */
export interface ImpactWeightEntry {
  id: number;
  fingerprint: string;
  category: string;
  severity: string;
  avgUserImpact: number;
  avgFeatureCount: number;
  observationCount: number;
  confidence: number;
  lastUpdated: number;             // Unix timestamp
}

/**
 * Baseline entry (global metric baseline)
 */
export interface BaselineEntry {
  id: number;
  metricName: string;
  windowMinutes: number;
  avgValue: number;
  stdDev: number;
  sampleCount: number;
  lastUpdated: number;             // Unix timestamp
}

/**
 * Error Brain database statistics
 */
export interface ErrorBrainDbStats {
  timePatternCount: number;
  correlationCount: number;
  cascadeCount: number;
  recoveryWeightCount: number;
  impactWeightCount: number;
  baselineCount: number;
  sizeBytes: number;
  isInitialized: boolean;
  schemaVersion: string;
  lastSync: number | null;
}

// ============================================================================
// Database State
// ============================================================================

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let db: Database | null = null;
let isInitialized = false;
let autoSaveInterval: NodeJS.Timeout | null = null;

// ============================================================================
// Kernel Integration
// ============================================================================

/** Lazy-initialized kernel hook for error-brain-db */
let kernelHook: IntelligenceHook | null = null;

/**
 * Get or create kernel hook for error-brain-db observability.
 * Uses lazy initialization to avoid startup dependencies.
 */
function getErrorBrainDbHook(): IntelligenceHook | null {
  if (!kernelHook) {
    try {
      kernelHook = createIntelligenceHook("error-brain-db");
    } catch {
      // Kernel not available, silently skip
    }
  }
  return kernelHook;
}

// ============================================================================
// Schema Version
// ============================================================================

const SCHEMA_VERSION = '1.0.0';

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize Error Brain database (idempotent)
 */
export async function initialize(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    logger.info('error-brain', 'init', 'Initializing Error Brain database', {
      metadata: {
        path: ErrorBrainConfig.brainDbPath,
      },
    });

    // Initialize sql.js
    const projectRoot = process.cwd();
    SQL = await initSqlJs({
      locateFile: (file: string) => path.join(projectRoot, 'node_modules/sql.js/dist/', file),
    });

    // Ensure Store directory exists
    const storeDir = path.dirname(ErrorBrainConfig.brainDbPath);
    await fsPromises.mkdir(storeDir, { recursive: true });

    // Load existing database or create new one
    let dbData: Uint8Array | undefined;
    try {
      const buffer = await fsPromises.readFile(ErrorBrainConfig.brainDbPath);
      dbData = new Uint8Array(buffer);
      logger.info('error-brain', 'init', 'Loaded existing database from disk');
    } catch {
      logger.info('error-brain', 'init', 'No existing database found, creating new');
    }

    db = new SQL.Database(dbData);

    // Configure SQLite for performance
    db.run(`PRAGMA journal_mode = WAL`);
    db.run(`PRAGMA synchronous = NORMAL`);
    db.run(`PRAGMA cache_size = ${ErrorBrainConfig.sqliteCacheSizePages}`);
    db.run(`PRAGMA busy_timeout = ${ErrorBrainConfig.sqliteBusyTimeoutMs}`);
    db.run(`PRAGMA page_size = ${ErrorBrainConfig.sqlitePageSize}`);

    // Create schema (idempotent)
    await createSchema();

    // Start auto-save
    startAutoSave();

    isInitialized = true;

    const stats = getStats();
    logger.info('error-brain', 'init', 'Initialization complete', {
      metadata: {
        timePatterns: stats.timePatternCount,
        correlations: stats.correlationCount,
        cascades: stats.cascadeCount,
        schemaVersion: stats.schemaVersion,
      },
    });
  } catch (error) {
    logger.error('error-brain', 'init', 'Initialization failed', { error: { name: 'InitError', message: String(error) } });
    throw error;
  }
}

/**
 * Create database schema (idempotent)
 */
async function createSchema(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  // Time patterns table
  db.run(`
    CREATE TABLE IF NOT EXISTS time_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hour INTEGER NOT NULL,
      day_of_week INTEGER,
      fingerprint TEXT,
      avg_count REAL NOT NULL,
      std_dev REAL NOT NULL,
      anomaly_threshold REAL NOT NULL,
      sample_count INTEGER DEFAULT 1,
      last_updated INTEGER NOT NULL,
      UNIQUE(hour, day_of_week, fingerprint)
    )
  `);

  // Correlations table
  db.run(`
    CREATE TABLE IF NOT EXISTS correlations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      primary_fingerprint TEXT NOT NULL,
      secondary_fingerprint TEXT NOT NULL,
      correlation_strength REAL NOT NULL,
      avg_time_delta_ms REAL NOT NULL,
      observation_count INTEGER DEFAULT 1,
      confidence REAL DEFAULT 0.5,
      last_observed INTEGER NOT NULL,
      UNIQUE(primary_fingerprint, secondary_fingerprint)
    )
  `);

  // Cascades table
  db.run(`
    CREATE TABLE IF NOT EXISTS cascades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_fingerprint TEXT NOT NULL UNIQUE,
      child_fingerprints TEXT NOT NULL,
      cascade_depth INTEGER DEFAULT 1,
      avg_spread_time_ms REAL NOT NULL,
      total_impact INTEGER DEFAULT 1,
      confidence REAL DEFAULT 0.5,
      last_observed INTEGER NOT NULL
    )
  `);

  // Recovery weights table
  db.run(`
    CREATE TABLE IF NOT EXISTS recovery_weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      strategy TEXT NOT NULL,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      avg_recovery_time_ms REAL,
      effectiveness_score REAL,
      last_updated INTEGER NOT NULL,
      UNIQUE(fingerprint, strategy)
    )
  `);

  // Impact weights table
  db.run(`
    CREATE TABLE IF NOT EXISTS impact_weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      avg_user_impact REAL DEFAULT 0,
      avg_feature_count REAL DEFAULT 0,
      observation_count INTEGER DEFAULT 1,
      confidence REAL DEFAULT 0.5,
      last_updated INTEGER NOT NULL
    )
  `);

  // Baselines table
  db.run(`
    CREATE TABLE IF NOT EXISTS baselines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name TEXT NOT NULL,
      window_minutes INTEGER NOT NULL,
      avg_value REAL NOT NULL,
      std_dev REAL NOT NULL,
      sample_count INTEGER DEFAULT 1,
      last_updated INTEGER NOT NULL,
      UNIQUE(metric_name, window_minutes)
    )
  `);

  // Brain metadata table
  db.run(`
    CREATE TABLE IF NOT EXISTS brain_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_time_patterns_hour ON time_patterns(hour)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_time_patterns_fingerprint ON time_patterns(fingerprint)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_correlations_primary ON correlations(primary_fingerprint)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_correlations_strength ON correlations(correlation_strength DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_cascades_root ON cascades(root_fingerprint)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_cascades_confidence ON cascades(confidence DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_recovery_fingerprint ON recovery_weights(fingerprint)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_recovery_strategy ON recovery_weights(strategy)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_impact_fingerprint ON impact_weights(fingerprint)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_baselines_metric ON baselines(metric_name)`);

  // Set schema version
  const now = Date.now();
  db.run(`
    INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
    VALUES ('schema_version', ?, ?)
  `, [SCHEMA_VERSION, now]);
}

// ============================================================================
// Auto-Save
// ============================================================================

function startAutoSave(): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
  }

  autoSaveInterval = setInterval(async () => {
    try {
      await saveToDisk();
    } catch (error) {
      logger.error('error-brain', 'auto-save', 'Auto-save failed', { error: { name: 'SaveError', message: String(error) } });
    }
  }, ErrorBrainConfig.autoSaveIntervalMs);
}

function stopAutoSave(): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

/**
 * Save database to disk
 */
export async function saveToDisk(): Promise<void> {
  if (!db) return;

  try {
    const data = db.export();
    await fsPromises.writeFile(ErrorBrainConfig.brainDbPath, Buffer.from(data));
    
    if (ErrorBrainConfig.verboseLogging) {
      logger.debug('error-brain', 'save', 'Saved to disk', {
        metadata: {
          sizeBytes: data.length,
        },
      });
    }
  } catch (error) {
    logger.error('error-brain', 'save', 'Failed to save to disk', { error: { name: 'SaveError', message: String(error) } });
    throw error;
  }
}

// ============================================================================
// Shutdown
// ============================================================================

/**
 * Graceful shutdown (save and close)
 */
export async function shutdown(): Promise<void> {
  if (!isInitialized) return;

  logger.info('error-brain', 'shutdown', 'Shutting down database');

  stopAutoSave();

  try {
    await saveToDisk();
    logger.info('error-brain', 'shutdown', 'Final save complete');
  } catch (error) {
    logger.error('error-brain', 'shutdown', 'Final save failed', { error: { name: 'SaveError', message: String(error) } });
  }

  if (db) {
    db.close();
    db = null;
  }

  SQL = null;
  isInitialized = false;

  logger.info('error-brain', 'shutdown', 'Database shutdown complete');
}

// ============================================================================
// Time Patterns CRUD
// ============================================================================

/**
 * Get time pattern for a specific hour and fingerprint
 */
export function getTimePattern(
  hour: number,
  fingerprint: string | null = null,
  dayOfWeek: number | null = null
): TimePatternEntry | null {
  if (!db) return null;

  const result = db.exec(`
    SELECT id, hour, day_of_week, fingerprint, avg_count, std_dev, 
           anomaly_threshold, sample_count, last_updated
    FROM time_patterns
    WHERE hour = ? AND fingerprint IS ? AND day_of_week IS ?
    LIMIT 1
  `, [hour, fingerprint, dayOfWeek]);

  if (!result[0]?.values[0]) return null;

  const row = result[0].values[0];
  return {
    id: row[0] as number,
    hour: row[1] as number,
    dayOfWeek: row[2] as number | null,
    fingerprint: row[3] as string | null,
    avgCount: row[4] as number,
    stdDev: row[5] as number,
    anomalyThreshold: row[6] as number,
    sampleCount: row[7] as number,
    lastUpdated: row[8] as number,
  };
}

/**
 * Get all time patterns for a fingerprint
 */
export function getTimePatternsByFingerprint(fingerprint: string | null): TimePatternEntry[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, hour, day_of_week, fingerprint, avg_count, std_dev,
           anomaly_threshold, sample_count, last_updated
    FROM time_patterns
    WHERE fingerprint IS ?
    ORDER BY hour ASC
  `, [fingerprint]);

  if (!result[0]?.values) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    hour: row[1] as number,
    dayOfWeek: row[2] as number | null,
    fingerprint: row[3] as string | null,
    avgCount: row[4] as number,
    stdDev: row[5] as number,
    anomalyThreshold: row[6] as number,
    sampleCount: row[7] as number,
    lastUpdated: row[8] as number,
  }));
}

/**
 * Upsert time pattern (insert or update)
 */
export function upsertTimePattern(
  hour: number,
  avgCount: number,
  stdDev: number,
  fingerprint: string | null = null,
  dayOfWeek: number | null = null
): void {
  if (!db) throw new Error('Database not initialized');

  const now = Date.now();
  const anomalyThreshold = ErrorBrainConfig.anomalyZScoreThreshold;

  db.run(`
    INSERT INTO time_patterns (hour, day_of_week, fingerprint, avg_count, std_dev, anomaly_threshold, sample_count, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(hour, day_of_week, fingerprint) DO UPDATE SET
      avg_count = ?,
      std_dev = ?,
      sample_count = sample_count + 1,
      last_updated = ?
  `, [hour, dayOfWeek, fingerprint, avgCount, stdDev, anomalyThreshold, now, avgCount, stdDev, now]);

  // Report learning event to kernel
  getErrorBrainDbHook()?.learning(
    "time_pattern",
    fingerprint ?? "global",
    { hour, avgCount, stdDev, dayOfWeek }
  );
}

// ============================================================================
// Correlations CRUD
// ============================================================================

/**
 * Get correlations for a primary fingerprint
 */
export function getCorrelations(primaryFingerprint: string): CorrelationEntry[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, primary_fingerprint, secondary_fingerprint, correlation_strength,
           avg_time_delta_ms, observation_count, confidence, last_observed
    FROM correlations
    WHERE primary_fingerprint = ?
    ORDER BY correlation_strength DESC
    LIMIT ?
  `, [primaryFingerprint, ErrorBrainConfig.maxCorrelationsPerFingerprint]);

  if (!result[0]?.values) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    primaryFingerprint: row[1] as string,
    secondaryFingerprint: row[2] as string,
    correlationStrength: row[3] as number,
    avgTimeDeltaMs: row[4] as number,
    observationCount: row[5] as number,
    confidence: row[6] as number,
    lastObserved: row[7] as number,
  }));
}

/**
 * Upsert correlation
 */
export function upsertCorrelation(
  primaryFingerprint: string,
  secondaryFingerprint: string,
  correlationStrength: number,
  avgTimeDeltaMs: number
): void {
  if (!db) throw new Error('Database not initialized');

  const now = Date.now();

  db.run(`
    INSERT INTO correlations (primary_fingerprint, secondary_fingerprint, correlation_strength, avg_time_delta_ms, observation_count, confidence, last_observed)
    VALUES (?, ?, ?, ?, 1, 0.5, ?)
    ON CONFLICT(primary_fingerprint, secondary_fingerprint) DO UPDATE SET
      correlation_strength = ?,
      avg_time_delta_ms = ?,
      observation_count = observation_count + 1,
      confidence = MIN(0.99, confidence + 0.05),
      last_observed = ?
  `, [primaryFingerprint, secondaryFingerprint, correlationStrength, avgTimeDeltaMs, now, correlationStrength, avgTimeDeltaMs, now]);

  // Report learning event to kernel
  getErrorBrainDbHook()?.learning(
    "correlation",
    primaryFingerprint,
    { secondary: secondaryFingerprint, strength: correlationStrength, avgTimeDeltaMs }
  );
}

// ============================================================================
// Cascades CRUD
// ============================================================================

/**
 * Get cascade for a root fingerprint
 */
export function getCascade(rootFingerprint: string): CascadeEntry | null {
  if (!db) return null;

  const result = db.exec(`
    SELECT id, root_fingerprint, child_fingerprints, cascade_depth,
           avg_spread_time_ms, total_impact, confidence, last_observed
    FROM cascades
    WHERE root_fingerprint = ?
    LIMIT 1
  `, [rootFingerprint]);

  if (!result[0]?.values[0]) return null;

  const row = result[0].values[0];
  return {
    id: row[0] as number,
    rootFingerprint: row[1] as string,
    childFingerprints: JSON.parse(row[2] as string),
    cascadeDepth: row[3] as number,
    avgSpreadTimeMs: row[4] as number,
    totalImpact: row[5] as number,
    confidence: row[6] as number,
    lastObserved: row[7] as number,
  };
}

/**
 * Upsert cascade
 */
export function upsertCascade(
  rootFingerprint: string,
  childFingerprints: string[],
  cascadeDepth: number,
  avgSpreadTimeMs: number,
  totalImpact: number
): void {
  if (!db) throw new Error('Database not initialized');

  const now = Date.now();
  const childJson = JSON.stringify(childFingerprints);

  db.run(`
    INSERT INTO cascades (root_fingerprint, child_fingerprints, cascade_depth, avg_spread_time_ms, total_impact, confidence, last_observed)
    VALUES (?, ?, ?, ?, ?, 0.5, ?)
    ON CONFLICT(root_fingerprint) DO UPDATE SET
      child_fingerprints = ?,
      cascade_depth = ?,
      avg_spread_time_ms = ?,
      total_impact = ?,
      confidence = MIN(0.99, confidence + 0.05),
      last_observed = ?
  `, [rootFingerprint, childJson, cascadeDepth, avgSpreadTimeMs, totalImpact, now, childJson, cascadeDepth, avgSpreadTimeMs, totalImpact, now]);

  // Report learning event to kernel
  getErrorBrainDbHook()?.learning(
    "cascade",
    rootFingerprint,
    { childCount: childFingerprints.length, depth: cascadeDepth, avgSpreadTimeMs, totalImpact }
  );
}

// ============================================================================
// Recovery Weights CRUD
// ============================================================================

/**
 * Get recovery weights for a fingerprint
 */
export function getRecoveryWeights(fingerprint: string): RecoveryWeightEntry[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, fingerprint, strategy, success_count, failure_count,
           avg_recovery_time_ms, effectiveness_score, last_updated
    FROM recovery_weights
    WHERE fingerprint = ?
    ORDER BY effectiveness_score DESC
  `, [fingerprint]);

  if (!result[0]?.values) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    fingerprint: row[1] as string,
    strategy: row[2] as string,
    successCount: row[3] as number,
    failureCount: row[4] as number,
    avgRecoveryTimeMs: row[5] as number | null,
    effectivenessScore: row[6] as number,
    lastUpdated: row[7] as number,
  }));
}

/**
 * Record recovery attempt outcome
 */
export function recordRecoveryOutcome(
  fingerprint: string,
  strategy: string,
  success: boolean,
  recoveryTimeMs?: number
): void {
  if (!db) throw new Error('Database not initialized');

  const now = Date.now();

  // First, check if entry exists
  const existing = db.exec(`
    SELECT success_count, failure_count FROM recovery_weights
    WHERE fingerprint = ? AND strategy = ?
  `, [fingerprint, strategy]);

  if (existing[0]?.values[0]) {
    // Update existing
    const successCount = (existing[0].values[0][0] as number) + (success ? 1 : 0);
    const failureCount = (existing[0].values[0][1] as number) + (success ? 0 : 1);
    const total = successCount + failureCount;
    const effectivenessScore = total > 0 ? successCount / total : 0.5;

    db.run(`
      UPDATE recovery_weights SET
        success_count = ?,
        failure_count = ?,
        avg_recovery_time_ms = COALESCE(?, avg_recovery_time_ms),
        effectiveness_score = ?,
        last_updated = ?
      WHERE fingerprint = ? AND strategy = ?
    `, [successCount, failureCount, recoveryTimeMs ?? null, effectivenessScore, now, fingerprint, strategy]);
  } else {
    // Insert new
    const successCount = success ? 1 : 0;
    const failureCount = success ? 0 : 1;
    const effectivenessScore = success ? 1.0 : 0.0;

    db.run(`
      INSERT INTO recovery_weights (fingerprint, strategy, success_count, failure_count, avg_recovery_time_ms, effectiveness_score, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [fingerprint, strategy, successCount, failureCount, recoveryTimeMs ?? null, effectivenessScore, now]);
  }

  // Report learning event to kernel
  getErrorBrainDbHook()?.learning(
    "recovery",
    fingerprint,
    { strategy, success, recoveryTimeMs }
  );
}

// ============================================================================
// Impact Weights CRUD
// ============================================================================

/**
 * Get impact weight for a fingerprint
 */
export function getImpactWeight(fingerprint: string): ImpactWeightEntry | null {
  if (!db) return null;

  const result = db.exec(`
    SELECT id, fingerprint, category, severity, avg_user_impact,
           avg_feature_count, observation_count, confidence, last_updated
    FROM impact_weights
    WHERE fingerprint = ?
    LIMIT 1
  `, [fingerprint]);

  if (!result[0]?.values[0]) return null;

  const row = result[0].values[0];
  return {
    id: row[0] as number,
    fingerprint: row[1] as string,
    category: row[2] as string,
    severity: row[3] as string,
    avgUserImpact: row[4] as number,
    avgFeatureCount: row[5] as number,
    observationCount: row[6] as number,
    confidence: row[7] as number,
    lastUpdated: row[8] as number,
  };
}

/**
 * Upsert impact weight
 */
export function upsertImpactWeight(
  fingerprint: string,
  category: string,
  severity: string,
  userImpact: number,
  featureCount: number
): void {
  if (!db) throw new Error('Database not initialized');

  const now = Date.now();
  const alpha = ErrorBrainConfig.learningRateAlpha;

  const existing = getImpactWeight(fingerprint);

  if (existing) {
    // EMA update
    const newAvgUserImpact = alpha * userImpact + (1 - alpha) * existing.avgUserImpact;
    const newAvgFeatureCount = alpha * featureCount + (1 - alpha) * existing.avgFeatureCount;
    const newConfidence = Math.min(0.99, existing.confidence + 0.02);

    db.run(`
      UPDATE impact_weights SET
        avg_user_impact = ?,
        avg_feature_count = ?,
        observation_count = observation_count + 1,
        confidence = ?,
        last_updated = ?
      WHERE fingerprint = ?
    `, [newAvgUserImpact, newAvgFeatureCount, newConfidence, now, fingerprint]);
  } else {
    db.run(`
      INSERT INTO impact_weights (fingerprint, category, severity, avg_user_impact, avg_feature_count, observation_count, confidence, last_updated)
      VALUES (?, ?, ?, ?, ?, 1, 0.5, ?)
    `, [fingerprint, category, severity, userImpact, featureCount, now]);
  }
}

// ============================================================================
// Baselines CRUD
// ============================================================================

/**
 * Get baseline for a metric
 */
export function getBaseline(metricName: string, windowMinutes: number): BaselineEntry | null {
  if (!db) return null;

  const result = db.exec(`
    SELECT id, metric_name, window_minutes, avg_value, std_dev, sample_count, last_updated
    FROM baselines
    WHERE metric_name = ? AND window_minutes = ?
    LIMIT 1
  `, [metricName, windowMinutes]);

  if (!result[0]?.values[0]) return null;

  const row = result[0].values[0];
  return {
    id: row[0] as number,
    metricName: row[1] as string,
    windowMinutes: row[2] as number,
    avgValue: row[3] as number,
    stdDev: row[4] as number,
    sampleCount: row[5] as number,
    lastUpdated: row[6] as number,
  };
}

/**
 * Upsert baseline
 */
export function upsertBaseline(
  metricName: string,
  windowMinutes: number,
  value: number
): void {
  if (!db) throw new Error('Database not initialized');

  const now = Date.now();
  const alpha = ErrorBrainConfig.learningRateAlpha;

  const existing = getBaseline(metricName, windowMinutes);

  if (existing) {
    // EMA update
    const newAvgValue = alpha * value + (1 - alpha) * existing.avgValue;
    const variance = alpha * (value - newAvgValue) ** 2 + (1 - alpha) * (existing.stdDev ** 2);
    const newStdDev = Math.sqrt(variance);

    db.run(`
      UPDATE baselines SET
        avg_value = ?,
        std_dev = ?,
        sample_count = sample_count + 1,
        last_updated = ?
      WHERE metric_name = ? AND window_minutes = ?
    `, [newAvgValue, newStdDev, now, metricName, windowMinutes]);
  } else {
    db.run(`
      INSERT INTO baselines (metric_name, window_minutes, avg_value, std_dev, sample_count, last_updated)
      VALUES (?, ?, ?, ?, 1, ?)
    `, [metricName, windowMinutes, value, value * 0.5, now]);
  }
}

// ============================================================================
// Metadata
// ============================================================================

/**
 * Get metadata value
 */
export function getMetadata(key: string): string | null {
  if (!db) return null;

  const result = db.exec(`
    SELECT value FROM brain_metadata WHERE key = ?
  `, [key]);

  if (!result[0]?.values[0]) return null;
  return result[0].values[0][0] as string;
}

/**
 * Set metadata value
 */
export function setMetadata(key: string, value: string): void {
  if (!db) throw new Error('Database not initialized');

  const now = Date.now();
  db.run(`
    INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
    VALUES (?, ?, ?)
  `, [key, value, now]);
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get database statistics
 */
export function getStats(): ErrorBrainDbStats {
  if (!db) {
    return {
      timePatternCount: 0,
      correlationCount: 0,
      cascadeCount: 0,
      recoveryWeightCount: 0,
      impactWeightCount: 0,
      baselineCount: 0,
      sizeBytes: 0,
      isInitialized: false,
      schemaVersion: 'unknown',
      lastSync: null,
    };
  }

  const countQuery = (table: string): number => {
    const result = db!.exec(`SELECT COUNT(*) FROM ${table}`);
    return result[0]?.values[0]?.[0] as number ?? 0;
  };

  const lastSyncStr = getMetadata('last_postgres_sync');
  const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : null;

  return {
    timePatternCount: countQuery('time_patterns'),
    correlationCount: countQuery('correlations'),
    cascadeCount: countQuery('cascades'),
    recoveryWeightCount: countQuery('recovery_weights'),
    impactWeightCount: countQuery('impact_weights'),
    baselineCount: countQuery('baselines'),
    sizeBytes: db.export().length,
    isInitialized,
    schemaVersion: getMetadata('schema_version') ?? SCHEMA_VERSION,
    lastSync,
  };
}

// ============================================================================
// Pruning
// ============================================================================

/**
 * Prune old patterns (called by worker)
 */
export function pruneStalePatterns(): number {
  if (!db) return 0;

  const expiryTimestamp = Date.now() - (ErrorBrainConfig.patternExpiryDays * 24 * 60 * 60 * 1000);
  
  let totalDeleted = 0;

  // Prune time patterns
  db.run(`DELETE FROM time_patterns WHERE last_updated < ?`, [expiryTimestamp]);
  totalDeleted += db.getRowsModified();

  // Prune correlations
  db.run(`DELETE FROM correlations WHERE last_observed < ?`, [expiryTimestamp]);
  totalDeleted += db.getRowsModified();

  // Prune cascades
  db.run(`DELETE FROM cascades WHERE last_observed < ?`, [expiryTimestamp]);
  totalDeleted += db.getRowsModified();

  // Prune recovery weights
  db.run(`DELETE FROM recovery_weights WHERE last_updated < ?`, [expiryTimestamp]);
  totalDeleted += db.getRowsModified();

  // Prune impact weights
  db.run(`DELETE FROM impact_weights WHERE last_updated < ?`, [expiryTimestamp]);
  totalDeleted += db.getRowsModified();

  if (totalDeleted > 0) {
    logger.info('error-brain', 'prune', 'Pruned stale patterns', {
      metadata: {
        totalDeleted,
      },
    });
    db.run('VACUUM');
  }

  return totalDeleted;
}

// ============================================================================
// Bulk Operations (for cache refresh)
// ============================================================================

/**
 * Get all time patterns (for L1 cache refresh)
 */
export function getAllTimePatterns(): TimePatternEntry[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, hour, day_of_week, fingerprint, avg_count, std_dev,
           anomaly_threshold, sample_count, last_updated
    FROM time_patterns
    ORDER BY fingerprint, hour
  `);

  if (!result[0]?.values) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    hour: row[1] as number,
    dayOfWeek: row[2] as number | null,
    fingerprint: row[3] as string | null,
    avgCount: row[4] as number,
    stdDev: row[5] as number,
    anomalyThreshold: row[6] as number,
    sampleCount: row[7] as number,
    lastUpdated: row[8] as number,
  }));
}

/**
 * Get all correlations (for L1 cache refresh)
 */
export function getAllCorrelations(): CorrelationEntry[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, primary_fingerprint, secondary_fingerprint, correlation_strength,
           avg_time_delta_ms, observation_count, confidence, last_observed
    FROM correlations
    WHERE correlation_strength >= ?
    ORDER BY primary_fingerprint, correlation_strength DESC
  `, [ErrorBrainConfig.correlationMinStrength]);

  if (!result[0]?.values) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    primaryFingerprint: row[1] as string,
    secondaryFingerprint: row[2] as string,
    correlationStrength: row[3] as number,
    avgTimeDeltaMs: row[4] as number,
    observationCount: row[5] as number,
    confidence: row[6] as number,
    lastObserved: row[7] as number,
  }));
}

/**
 * Get all cascades (for L1 cache refresh)
 */
export function getAllCascades(): CascadeEntry[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, root_fingerprint, child_fingerprints, cascade_depth,
           avg_spread_time_ms, total_impact, confidence, last_observed
    FROM cascades
    WHERE confidence >= ?
    ORDER BY confidence DESC
  `, [ErrorBrainConfig.cascadeMinConfidence]);

  if (!result[0]?.values) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    rootFingerprint: row[1] as string,
    childFingerprints: JSON.parse(row[2] as string),
    cascadeDepth: row[3] as number,
    avgSpreadTimeMs: row[4] as number,
    totalImpact: row[5] as number,
    confidence: row[6] as number,
    lastObserved: row[7] as number,
  }));
}

/**
 * Get all recovery weights (for L1 cache refresh)
 */
export function getAllRecoveryWeights(): RecoveryWeightEntry[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, fingerprint, strategy, success_count, failure_count,
           avg_recovery_time_ms, effectiveness_score, last_updated
    FROM recovery_weights
    ORDER BY fingerprint, effectiveness_score DESC
  `);

  if (!result[0]?.values) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    fingerprint: row[1] as string,
    strategy: row[2] as string,
    successCount: row[3] as number,
    failureCount: row[4] as number,
    avgRecoveryTimeMs: row[5] as number | null,
    effectivenessScore: row[6] as number,
    lastUpdated: row[7] as number,
  }));
}

/**
 * Get all impact weights (for L1 cache refresh)
 */
export function getAllImpactWeights(): ImpactWeightEntry[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, fingerprint, category, severity, avg_user_impact,
           avg_feature_count, observation_count, confidence, last_updated
    FROM impact_weights
    WHERE confidence >= ?
    ORDER BY fingerprint
  `, [ErrorBrainConfig.impactMinConfidence]);

  if (!result[0]?.values) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    fingerprint: row[1] as string,
    category: row[2] as string,
    severity: row[3] as string,
    avgUserImpact: row[4] as number,
    avgFeatureCount: row[5] as number,
    observationCount: row[6] as number,
    confidence: row[7] as number,
    lastUpdated: row[8] as number,
  }));
}

/**
 * Get all baselines (for L1 cache refresh)
 */
export function getAllBaselines(): BaselineEntry[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, metric_name, window_minutes, avg_value, std_dev, sample_count, last_updated
    FROM baselines
    ORDER BY metric_name, window_minutes
  `);

  if (!result[0]?.values) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    metricName: row[1] as string,
    windowMinutes: row[2] as number,
    avgValue: row[3] as number,
    stdDev: row[4] as number,
    sampleCount: row[5] as number,
    lastUpdated: row[6] as number,
  }));
}

// ============================================================================
// Export for testing
// ============================================================================

export const _testing = {
  getDb: () => db,
  isInitialized: () => isInitialized,
};
