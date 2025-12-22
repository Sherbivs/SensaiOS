# ROUTER

Title: Error Brain — Local Intelligence System  
Purpose: SQLite-based local database for ultra-fast error pattern detection, cascade prediction, impact forecasting, and recovery recommendations  
Owned Globs: `src/services/error-brain/**`  
Last Updated (UTC): 2025-12-22T00:00:00Z

---

## Overview

The **Error Brain** is a local SQLite-based intelligence system that provides:
- **Ultra-fast pattern matching** (<1μs via L1 cache)
- **Real-time anomaly detection** (deviation from learned baselines)
- **Cascade prediction** (predict downstream errors before they happen)
- **Impact forecasting** (estimate user impact from error fingerprints)
- **Self-healing recommendations** (suggest recovery strategies)

This system operates **independently from PostgreSQL**, using a local SQLite database as its "brain" for machine learning weights, pattern storage, and fast lookups.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     ERROR BRAIN SYSTEM                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐      ┌─────────────────┐               │
│  │  Error Tracker  │─────▶│  L1 Brain Cache │◀── <1μs       │
│  │  (integration)  │      │  (in-memory)    │               │
│  └─────────────────┘      └────────┬────────┘               │
│                                    │                         │
│                                    ▼                         │
│                           ┌─────────────────┐               │
│                           │  Error Brain DB │◀── SQLite     │
│                           │  (error-brain)  │               │
│                           └────────┬────────┘               │
│                                    │                         │
│                                    ▼                         │
│                           ┌─────────────────┐               │
│                           │  Brain Worker   │◀── Learning   │
│                           │  (background)   │               │
│                           └─────────────────┘               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Files

| File | Lines | Purpose |
|------|-------|---------|
| [index.ts](index.ts) | ~250 | Barrel export + facade API for simplified usage |
| [error-brain-db.ts](error-brain-db.ts) | ~750 | SQLite database service (schema, CRUD, persistence) |
| [error-brain-cache.ts](error-brain-cache.ts) | ~600 | L1 in-memory cache for <1μs lookups |
| [ROUTER.md](ROUTER.md) | - | This documentation file |

---

## Database Schema (SQLite)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `time_patterns` | Hourly error rate baselines | hour, fingerprint, avg_count, std_dev |
| `correlations` | Error A → Error B relationships | primary_fp, secondary_fp, strength |
| `cascades` | Root cause → downstream errors | root_fp, child_fps, confidence |
| `recovery_weights` | Strategy effectiveness per fingerprint | fingerprint, strategy, success_rate |
| `impact_weights` | User impact predictions | fingerprint, avg_user_impact |
| `baselines` | Global metric baselines | metric_name, avg_value, std_dev |
| `brain_metadata` | Schema version, last sync | key, value |

---

## API Reference

### Initialization

```typescript
import * as ErrorBrain from '../services/error-brain/index.js';

// Initialize at startup (blocking)
await ErrorBrain.initialize();

// Shutdown gracefully
await ErrorBrain.shutdown();
```

### Real-Time Detection (Synchronous, <1μs)

```typescript
// Detect anomalous error spike
const anomaly = ErrorBrain.detectTimeAnomaly(fingerprint, currentCount);
// { isAnomalous: true, zScore: 2.5, expectedCount: 10, actualCount: 25 }

// Predict cascade from root error
const cascade = ErrorBrain.predictCascade(fingerprint);
// { predictedChildren: ['fp1', 'fp2'], probability: 0.85, recommendation: 'WARN' }

// Get recovery recommendation
const recovery = ErrorBrain.recommendRecovery(fingerprint);
// { strategy: 'RETRY', effectivenessScore: 0.78, confidence: 0.92 }

// Predict user impact
const impact = ErrorBrain.predictImpact(fingerprint, activeUserCount);
// { estimatedUsers: 15, recommendation: 'ALERT' }
```

### Learning (Async, Background)

```typescript
// Record recovery outcome for learning
ErrorBrain.recordRecoveryOutcome(fingerprint, 'RETRY', true, 150);

// Update time pattern
ErrorBrain.updateTimePattern(14, 5.2, 1.8, fingerprint);

// Update correlation
ErrorBrain.updateCorrelation(primaryFp, secondaryFp, 0.75, 1200);

// Update cascade
ErrorBrain.updateCascade(rootFp, ['child1', 'child2'], 2, 3500, 5);
```

### Statistics

```typescript
const stats = ErrorBrain.getStats();
// { db: { timePatternCount, ... }, cache: { hitRate, utilizationPercent, ... } }
```

---

## Performance Targets

| Operation | Target | Implementation |
|-----------|--------|----------------|
| Pattern lookup | <1μs | L1 cache (Map) |
| Cascade prediction | <10μs | L1 cache + compute |
| Impact prediction | <50μs | L1 cache + model |
| Anomaly detection | <100μs | L1 cache + Z-score |
| DB query (fallback) | <10ms | SQLite prepared stmt |
| Cache refresh | <500ms | Batch SQLite read |

---

## Memory Budget

- **L1 Cache**: 2 MB max
- **~500 fingerprints** tracked
- **~4KB per fingerprint** (all pattern types)
- **LRU eviction** when limit exceeded

---

## Integration Points

- **Error Tracker** (`src/services/monitoring/error-tracker.ts`): Primary consumer
- **Error Learning** (`src/services/monitoring/error-learning.ts`): Pattern source
- **Brain Worker** (`src/workers/error-brain-worker.ts`): Background learning
- **Configuration** (`src/config/error-brain-config.ts`): All settings

---

## References

- **Architecture Doc**: `docs/projects/error-brain-architecture.md`
- **Config**: `src/config/error-brain-config.ts`
- **Engine DB Pattern**: `src/services/database/engine-read-db.ts` (similar architecture)

---

**Created:** 2025-12-22  
**Status:** Implementation Phase
