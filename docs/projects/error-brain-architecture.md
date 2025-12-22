# Error Brain Architecture — Local Intelligence System

**Created:** 2025-12-22  
**Status:** Design Phase  
**Author:** Code Specialist & Application Specialist Team

---

## Executive Summary

The **Error Brain** is a local SQLite-based intelligence system that provides:
- **Ultra-fast pattern matching** (<1μs via L1 cache)
- **Real-time anomaly detection** (deviation from learned baselines)
- **Cascade prediction** (predict downstream errors before they happen)
- **Impact forecasting** (estimate user impact from error fingerprints)
- **Self-healing recommendations** (suggest recovery strategies)

This system operates **independently from PostgreSQL**, using a local SQLite database as its "brain" for machine learning weights, pattern storage, and fast lookups.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERROR BRAIN SYSTEM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────┐    ┌──────────────────────┐                      │
│  │   Error Tracker      │───▶│   Pattern Detector   │                      │
│  │   (error-tracker.ts) │    │   (pattern-detector) │                      │
│  └──────────────────────┘    └──────────┬───────────┘                      │
│           │                             │                                   │
│           │                             ▼                                   │
│           │                  ┌──────────────────────┐                      │
│           │                  │   L1 Brain Cache     │◀──── <1μs lookups    │
│           │                  │   (in-memory Map)    │                      │
│           │                  └──────────┬───────────┘                      │
│           │                             │                                   │
│           │                             ▼                                   │
│           │                  ┌──────────────────────┐                      │
│           │                  │   Error Brain DB     │◀──── SQLite (local)  │
│           │                  │   (error-brain.db)   │                      │
│           │                  └──────────┬───────────┘                      │
│           │                             │                                   │
│           ▼                             ▼                                   │
│  ┌──────────────────────┐    ┌──────────────────────┐                      │
│  │   Impact Predictor   │───▶│   Brain Worker       │                      │
│  │   (impact-predictor) │    │   (continuous learn) │                      │
│  └──────────────────────┘    └──────────────────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────────┐
                    │   PostgreSQL (ErrorLog table)     │
                    │   Synced hourly for persistence   │
                    └───────────────────────────────────┘
```

---

## Component Design

### 1. Error Brain DB (SQLite)

**Location:** `Store/error-brain.db`

**Purpose:** Fast local storage for ML weights, learned patterns, and prediction models.

**Schema:**

```sql
-- Pattern clusters (time-of-day, day-of-week spikes)
CREATE TABLE time_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hour INTEGER NOT NULL,                    -- 0-23
    day_of_week INTEGER,                      -- 0-6 (null = any day)
    fingerprint TEXT,                         -- null = global pattern
    avg_count REAL NOT NULL,                  -- Average errors in this window
    std_dev REAL NOT NULL,                    -- Standard deviation
    anomaly_threshold REAL NOT NULL,          -- threshold for spike detection
    sample_count INTEGER DEFAULT 1,           -- training samples
    last_updated INTEGER NOT NULL,            -- Unix timestamp
    UNIQUE(hour, day_of_week, fingerprint)
);

-- Error correlations (error A → error B within N ms)
CREATE TABLE correlations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    primary_fingerprint TEXT NOT NULL,
    secondary_fingerprint TEXT NOT NULL,
    correlation_strength REAL NOT NULL,       -- 0.0 to 1.0
    avg_time_delta_ms REAL NOT NULL,
    observation_count INTEGER DEFAULT 1,
    confidence REAL DEFAULT 0.5,              -- Bayesian confidence
    last_observed INTEGER NOT NULL,
    UNIQUE(primary_fingerprint, secondary_fingerprint)
);

-- Cascade relationships (root cause → child errors)
CREATE TABLE cascades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    root_fingerprint TEXT NOT NULL,
    child_fingerprints TEXT NOT NULL,         -- JSON array
    cascade_depth INTEGER DEFAULT 1,
    avg_spread_time_ms REAL NOT NULL,
    total_impact INTEGER DEFAULT 1,           -- Total errors triggered
    confidence REAL DEFAULT 0.5,
    last_observed INTEGER NOT NULL,
    UNIQUE(root_fingerprint)
);

-- Recovery strategy effectiveness
CREATE TABLE recovery_weights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT NOT NULL,
    strategy TEXT NOT NULL,                   -- RETRY, FALLBACK, RESTART, etc.
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    avg_recovery_time_ms REAL,
    effectiveness_score REAL,                 -- Bayesian success rate
    last_updated INTEGER NOT NULL,
    UNIQUE(fingerprint, strategy)
);

-- Impact prediction model weights
CREATE TABLE impact_weights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    avg_user_impact REAL DEFAULT 0,
    avg_feature_count REAL DEFAULT 0,
    observation_count INTEGER DEFAULT 1,
    confidence REAL DEFAULT 0.5,
    last_updated INTEGER NOT NULL,
    UNIQUE(fingerprint)
);

-- Real-time anomaly baselines (rolling averages)
CREATE TABLE baselines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,                -- 'error_rate', 'cascade_rate', etc.
    window_minutes INTEGER NOT NULL,          -- 5, 15, 60, 1440 (day)
    avg_value REAL NOT NULL,
    std_dev REAL NOT NULL,
    sample_count INTEGER DEFAULT 1,
    last_updated INTEGER NOT NULL,
    UNIQUE(metric_name, window_minutes)
);

-- Model metadata and versioning
CREATE TABLE brain_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Indexes for fast lookups
CREATE INDEX idx_time_patterns_hour ON time_patterns(hour);
CREATE INDEX idx_correlations_primary ON correlations(primary_fingerprint);
CREATE INDEX idx_correlations_strength ON correlations(correlation_strength DESC);
CREATE INDEX idx_cascades_root ON cascades(root_fingerprint);
CREATE INDEX idx_recovery_fingerprint ON recovery_weights(fingerprint);
CREATE INDEX idx_impact_fingerprint ON impact_weights(fingerprint);
```

---

### 2. L1 Brain Cache (In-Memory)

**Purpose:** Ultra-fast lookups for pattern matching during error capture.

**Structure:**
```typescript
interface BrainCache {
  // Pattern lookups (fingerprint → patterns)
  timePatterns: Map<string, TimePatternEntry[]>;      // ~1KB per fingerprint
  correlations: Map<string, CorrelationEntry[]>;       // ~500B per fingerprint
  cascades: Map<string, CascadeEntry>;                 // ~1KB per root
  recoveryWeights: Map<string, RecoveryWeightEntry[]>; // ~200B per fingerprint
  impactWeights: Map<string, ImpactWeightEntry>;       // ~100B per fingerprint
  
  // Global patterns (not fingerprint-specific)
  globalTimePatterns: TimePatternEntry[];              // 24 entries (hourly)
  baselines: Map<string, BaselineEntry>;               // ~10 metrics
  
  // Metadata
  lastRefresh: Date;
  entryCount: number;
  sizeBytes: number;
}
```

**Memory Budget:** 2 MB max (configurable)
- ~500 unique fingerprints tracked
- ~4KB per fingerprint (all pattern types combined)

---

### 3. Pattern Detector

**Purpose:** Real-time detection of anomalies, correlations, and cascades.

**Algorithms:**

#### a) Time Spike Detection (Z-Score)
```typescript
function detectTimeSpike(hour: number, fingerprint: string, count: number): boolean {
  const pattern = cache.timePatterns.get(fingerprint)?.[hour] 
                  ?? cache.globalTimePatterns[hour];
  if (!pattern) return false;
  
  const zScore = (count - pattern.avgCount) / pattern.stdDev;
  return zScore > pattern.anomalyThreshold; // Default: 2.0 (95% confidence)
}
```

#### b) Correlation Detection (Temporal Window)
```typescript
function detectCorrelation(fingerprint: string, windowMs: number = 5000): CorrelationMatch[] {
  const recent = getRecentErrors(windowMs);
  const knownCorrelations = cache.correlations.get(fingerprint) ?? [];
  
  return knownCorrelations.filter(c => 
    recent.some(e => e.fingerprint === c.secondaryFingerprint)
  );
}
```

#### c) Cascade Prediction (Bayesian)
```typescript
function predictCascade(fingerprint: string): CascadePrediction | null {
  const cascade = cache.cascades.get(fingerprint);
  if (!cascade || cascade.confidence < 0.5) return null;
  
  return {
    rootFingerprint: fingerprint,
    predictedChildren: JSON.parse(cascade.childFingerprints),
    probability: cascade.confidence,
    expectedTimeMs: cascade.avgSpreadTimeMs,
    totalImpact: cascade.totalImpact,
    recommendation: cascade.confidence > 0.8 ? 'BLOCK' : 'WARN'
  };
}
```

---

### 4. Impact Predictor

**Purpose:** Estimate user impact before error fully propagates.

**Model:**
```typescript
interface ImpactPrediction {
  estimatedUsers: number;           // Affected users
  estimatedFeatures: string[];      // Affected features
  severityMultiplier: number;       // 1.0 = normal, 2.0+ = critical
  confidence: number;               // 0.0 to 1.0
  recommendation: 'ALERT' | 'WARN' | 'LOG';
}

function predictImpact(fingerprint: string, context: ErrorContext): ImpactPrediction {
  const weights = cache.impactWeights.get(fingerprint);
  
  if (weights && weights.confidence > 0.6) {
    // Use learned weights
    return {
      estimatedUsers: weights.avgUserImpact * context.activeUserCount,
      estimatedFeatures: deriveFeatures(weights.category),
      severityMultiplier: getSeverityWeight(weights.severity),
      confidence: weights.confidence,
      recommendation: weights.avgUserImpact > 10 ? 'ALERT' : 'WARN'
    };
  }
  
  // Fallback to heuristics
  return heuristicImpactPrediction(context);
}
```

---

### 5. Brain Worker

**Purpose:** Background learning and model updates.

**Schedule:**
| Task | Interval | Purpose |
|------|----------|---------|
| Refresh L1 Cache | 5 min | Keep cache hot |
| Update Time Patterns | 15 min | Learn hourly baselines |
| Update Correlations | 30 min | Detect new correlations |
| Update Cascades | 30 min | Learn cascade chains |
| Update Recovery Weights | 60 min | Track strategy effectiveness |
| Prune Stale Patterns | 24 hours | Remove old/invalid patterns |
| Sync to PostgreSQL | 60 min | Persist critical patterns |

**Learning Algorithm (Exponential Moving Average):**
```typescript
function updateTimePattern(
  fingerprint: string, 
  hour: number, 
  newCount: number,
  alpha: number = 0.1 // Learning rate
): void {
  const existing = db.getTimePattern(fingerprint, hour);
  
  if (existing) {
    // EMA update
    const newAvg = alpha * newCount + (1 - alpha) * existing.avgCount;
    const newVar = alpha * (newCount - newAvg) ** 2 + (1 - alpha) * existing.variance;
    db.updateTimePattern(fingerprint, hour, newAvg, Math.sqrt(newVar));
  } else {
    // Initialize
    db.insertTimePattern(fingerprint, hour, newCount, newCount * 0.5);
  }
}
```

---

## Integration Points

### Error Tracker Integration

```typescript
// In error-tracker.ts

import { ErrorBrain } from '../error-brain/index.js';

async function captureError(error: Error, context: ErrorContext): Promise<ErrorLog> {
  const fingerprint = generateFingerprint(error, context);
  
  // === ERROR BRAIN INTEGRATION ===
  
  // 1. Check for cascade (is this a downstream error?)
  const cascade = ErrorBrain.detectCascade(fingerprint);
  if (cascade) {
    context.rootCauseFingerprint = cascade.rootFingerprint;
    context.cascadeDepth = cascade.depth;
  }
  
  // 2. Predict impact
  const impact = ErrorBrain.predictImpact(fingerprint, context);
  context.predictedUserImpact = impact.estimatedUsers;
  context.predictedFeatures = impact.estimatedFeatures;
  
  // 3. Check for anomaly (is error rate spiking?)
  const anomaly = ErrorBrain.detectTimeSpike(fingerprint);
  if (anomaly) {
    context.isAnomalous = true;
    context.anomalyScore = anomaly.zScore;
  }
  
  // 4. Get recovery recommendation
  const recovery = ErrorBrain.recommendRecovery(fingerprint, context);
  context.recommendedStrategy = recovery.strategy;
  context.strategyConfidence = recovery.confidence;
  
  // === END ERROR BRAIN ===
  
  // Continue with normal error capture...
  return persistError(error, context);
}
```

### EventBus Integration

```typescript
// Subscribe to error events for continuous learning
EventBus.subscribe('error.*', (event) => {
  ErrorBrain.observe({
    fingerprint: event.fingerprint,
    timestamp: event.timestamp,
    category: event.category,
    severity: event.severity,
    context: event.context
  });
});

// Subscribe to recovery events
EventBus.subscribe('error.recovery', (event) => {
  ErrorBrain.learnRecovery({
    fingerprint: event.fingerprint,
    strategy: event.strategy,
    outcome: event.outcome,
    durationMs: event.durationMs
  });
});
```

---

## Configuration

```typescript
// src/config/error-brain-config.ts

export const ErrorBrainConfig = {
  // File paths
  brainDbPath: path.join(STORAGE_BASE_DIR, 'error-brain.db'),
  
  // Cache limits
  l1CacheMaxSizeMB: 2,
  maxTrackedFingerprints: 500,
  patternExpiryDays: 30,
  
  // Detection thresholds
  anomalyZScoreThreshold: 2.0,      // 95% confidence
  correlationMinStrength: 0.3,
  cascadeMinConfidence: 0.5,
  
  // Learning parameters
  learningRate: 0.1,                // EMA alpha
  minObservationsForConfidence: 5,
  
  // Worker intervals (ms)
  cacheRefreshIntervalMs: 5 * 60 * 1000,     // 5 min
  patternUpdateIntervalMs: 15 * 60 * 1000,   // 15 min
  correlationUpdateIntervalMs: 30 * 60 * 1000, // 30 min
  syncToPostgresIntervalMs: 60 * 60 * 1000,  // 1 hour
  
  // Performance limits
  maxCorrelationsPerFingerprint: 10,
  maxCascadeDepth: 5,
  observationWindowMs: 5000,         // 5 seconds for correlation detection
};
```

---

## File Structure

```
src/
├── config/
│   └── error-brain-config.ts       # Configuration constants
├── services/
│   └── error-brain/
│       ├── index.ts                # Barrel export
│       ├── error-brain-db.ts       # SQLite database service
│       ├── error-brain-cache.ts    # L1 in-memory cache
│       ├── pattern-detector.ts     # Pattern detection algorithms
│       ├── impact-predictor.ts     # Impact prediction model
│       └── ROUTER.md               # Directory documentation
├── workers/
│   └── error-brain-worker.ts       # Background learning worker
Store/
└── error-brain.db                  # SQLite database file
```

---

## Performance Targets

| Operation | Target Latency | Implementation |
|-----------|---------------|----------------|
| Pattern lookup | <1μs | L1 cache (Map) |
| Cascade prediction | <10μs | L1 cache + simple compute |
| Impact prediction | <50μs | L1 cache + model inference |
| Anomaly detection | <100μs | L1 cache + Z-score calc |
| Full error enrichment | <500μs | All operations combined |
| DB query (fallback) | <10ms | SQLite prepared statement |
| Cache refresh | <500ms | Batch SQLite read |

---

## Next Steps

1. **Phase 1:** Create `error-brain-config.ts` with all constants
2. **Phase 2:** Implement `error-brain-db.ts` (SQLite schema + CRUD)
3. **Phase 3:** Implement `error-brain-cache.ts` (L1 Map cache)
4. **Phase 4:** Implement `pattern-detector.ts` (detection algorithms)
5. **Phase 5:** Implement `impact-predictor.ts` (ML model)
6. **Phase 6:** Create `error-brain-worker.ts` (background learning)
7. **Phase 7:** Integrate with `error-tracker.ts`
8. **Phase 8:** Add `/ops brain` commands
9. **Phase 9:** Write comprehensive tests

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-22
