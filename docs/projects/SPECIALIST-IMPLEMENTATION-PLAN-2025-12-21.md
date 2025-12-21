# 🚀 Specialist-Led Implementation Plan — December 21, 2025

## Mission Control

**Objective:** Implement specialist enhancements with zero production disruption  
**Timeline:** December 21, 2025 – January 21, 2026 (4 weeks)  
**Risk Tolerance:** Zero unplanned downtime  
**Rollback Window:** < 5 minutes for any change  

---

## 🛡️ Production Safety Protocol

### Pre-Implementation Checklist (ALL Changes)
- [ ] Feature flag created (`FEATURE_<name>_ENABLED=false`)
- [ ] Rollback procedure documented
- [ ] Local Docker testing passed
- [ ] Staging validation completed (ONPREMISE-DEV-EXPERIMENT)
- [ ] No restart required OR operator permission obtained

### Deployment Windows
| Risk Level | Window | Approval Required |
|------------|--------|-------------------|
| 🟢 Low (config only) | Anytime | None |
| 🟡 Medium (new code) | Business hours | Lead specialist |
| 🔴 High (core changes) | Scheduled | DRIPTVDD + 2 specialists |

---

# 📋 PHASE 1: IMMEDIATE HARDENING (Week 1)

## 1.1 ESM Audit & Cleanup
**Lead:** Marcus Chen (Platform Engineer)  
**Risk:** 🟢 Low  
**Effort:** 2 hours  

### Current State
```bash
# Known ESM issues identified in disk monitoring fix
# Potential hidden require() calls may exist
```

### Implementation Steps

#### Step 1: Discovery (30 min)
```powershell
# Run from project root
$requireCalls = Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.js" |
    Select-String -Pattern "require\s*\(" |
    Where-Object { $_.Line -notmatch "// ESM:" }

Write-Host "Found $($requireCalls.Count) potential require() calls"
$requireCalls | Format-Table Path, LineNumber, Line -AutoSize
```

#### Step 2: Categorization
| Pattern | Action | Risk |
|---------|--------|------|
| `require('node:*')` | Convert to `import` | Low |
| `require('./local')` | Convert to `import` | Low |
| `require(variable)` | Dynamic import | Medium |
| `require.resolve()` | Keep (ESM compatible) | None |

#### Step 3: Migration Template
```typescript
// BEFORE (CommonJS)
const fs = require('node:fs');
const path = require('node:path');

// AFTER (ESM)
import fs from 'node:fs';
import path from 'node:path';
```

#### Step 4: Verification
```powershell
# Build must pass
npm run build

# Tests must pass
npm test

# No runtime errors on import
node --loader ts-node/esm src/index.ts --dry-run
```

### Rollback
- Git revert individual file changes
- No deployment required for discovery phase

### Success Criteria
- [ ] Zero `require()` calls in `src/` (except require.resolve)
- [ ] Build passes with no ESM warnings
- [ ] All tests pass

---

## 1.2 Disk Size Caching
**Lead:** Dr. James Wright (Performance Analyst)  
**Risk:** 🟢 Low  
**Effort:** 1 hour  

### Current State
```typescript
// Current: Recalculates on every call
function getDirectorySize(dir: string): number {
  // Walks entire directory tree
}
```

### Implementation

#### File: `src/shared/resource-monitor.ts`

```typescript
// ADD: Cache layer for disk size calculation
interface DiskSizeCache {
  sizeBytes: number;
  calculatedAt: number;
  directory: string;
}

const diskSizeCache = new Map<string, DiskSizeCache>();
const CACHE_TTL_MS = 60_000; // 60 seconds

export function getCachedDiskSize(directory: string): number {
  const cached = diskSizeCache.get(directory);
  const now = Date.now();
  
  if (cached && (now - cached.calculatedAt) < CACHE_TTL_MS) {
    return cached.sizeBytes;
  }
  
  // Cache miss or expired - recalculate
  const sizeBytes = getDirectorySize(directory);
  
  diskSizeCache.set(directory, {
    sizeBytes,
    calculatedAt: now,
    directory
  });
  
  return sizeBytes;
}

// Expose for testing
export function clearDiskSizeCache(): void {
  diskSizeCache.clear();
}

export function getDiskSizeCacheStats(): { entries: number; oldestMs: number } {
  let oldestMs = 0;
  const now = Date.now();
  
  for (const entry of diskSizeCache.values()) {
    const age = now - entry.calculatedAt;
    if (age > oldestMs) oldestMs = age;
  }
  
  return { entries: diskSizeCache.size, oldestMs };
}
```

### Integration Points
```typescript
// UPDATE: src/shared/resource-monitor.ts - getDiskUsage()
export function getDiskUsage(): DiskUsageResult {
  // Replace direct call with cached version
  const usedBytes = getCachedDiskSize('/Store');
  // ... rest unchanged
}
```

### Feature Flag
```bash
# .env - disable to revert to uncached behavior
DISK_CACHE_ENABLED=true
DISK_CACHE_TTL_MS=60000
```

### Rollback
- Set `DISK_CACHE_ENABLED=false`
- No restart required (reads env on each call)

### Success Criteria
- [ ] Cache hit rate > 90% in steady state
- [ ] No increase in memory usage (< 1KB for cache)
- [ ] Identical values returned within TTL window

---

## 1.3 Grafana Alert Rules
**Lead:** Dr. Elena Vasquez (Observability Architect)  
**Risk:** 🟢 Low  
**Effort:** 2 hours  

### Current State
- Loki receiving logs ✅
- Grafana displaying logs ✅
- No alerting configured ❌

### Implementation

#### File: `ops/grafana-alert-rules.yml`

```yaml
# Grafana Alert Rules for Infinity Gauntlet
# Import via Grafana UI: Alerting > Import

apiVersion: 1
groups:
  - orgId: 1
    name: InfinityGauntlet
    folder: Pokemon Alerts
    interval: 1m
    rules:
      # Critical: High Error Rate
      - uid: ig-high-error-rate
        title: High Error Rate Detected
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 300  # 5 minutes
              to: 0
            datasourceUid: loki
            model:
              expr: |
                sum(count_over_time({service="stats-logger"} |= "error" [5m]))
              queryType: instant
          - refId: B
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: __expr__
            model:
              type: threshold
              expression: A
              conditions:
                - evaluator:
                    params: [10]  # More than 10 errors in 5 min
                    type: gt
        noDataState: OK
        execErrState: Error
        for: 2m
        annotations:
          summary: Error rate exceeds threshold
          description: |
            More than 10 errors detected in the last 5 minutes.
            Check Grafana logs: http://localhost:3000/explore
        labels:
          severity: critical
          service: infinity-gauntlet

      # Warning: Database Connection Issues
      - uid: ig-db-connection
        title: Database Connection Warning
        condition: C
        data:
          - refId: A
            datasourceUid: loki
            model:
              expr: |
                count_over_time({service="db-logger"} |~ "connection.*fail|timeout|ECONNREFUSED" [5m])
        for: 1m
        annotations:
          summary: Database connection issues detected
        labels:
          severity: warning

      # Info: Circuit Breaker State Change
      - uid: ig-circuit-breaker
        title: Circuit Breaker Activated
        condition: C
        data:
          - refId: A
            datasourceUid: loki
            model:
              expr: |
                count_over_time({service=~".*"} |= "circuit breaker" |= "OPEN" [1m])
        for: 0s  # Immediate
        annotations:
          summary: A circuit breaker has opened
          description: Check which service is experiencing failures
        labels:
          severity: warning

      # Critical: Memory Threshold
      - uid: ig-memory-high
        title: High Memory Usage
        condition: C
        data:
          - refId: A
            datasourceUid: loki
            model:
              expr: |
                count_over_time({service="stats-logger"} |~ "memory.*[8-9][0-9]%" [5m])
        for: 5m
        annotations:
          summary: Memory usage above 80%
          description: Consider restarting service or investigating memory leak
        labels:
          severity: critical
```

### Notification Channel Setup
```yaml
# ops/grafana-notification-channels.yml
notifiers:
  - name: Discord Webhook
    type: discord
    uid: discord-alerts
    settings:
      url: "${DISCORD_WEBHOOK_URL}"  # Set in Grafana secrets
      message: |
        🚨 **{{ .Title }}**
        
        {{ .Message }}
        
        **Labels:** {{ .Labels }}
        **Dashboard:** {{ .DashboardURL }}
```

### Installation Steps
1. Open Grafana UI (http://localhost:3000)
2. Navigate to Alerting → Alert Rules
3. Click "Import" and paste YAML
4. Configure notification channel with Discord webhook
5. Test alert with: `echo '{"level":"error","msg":"test alert"}' | curl -X POST http://localhost:3100/loki/api/v1/push ...`

### Feature Flag
- Alerts can be silenced in Grafana UI without code changes
- No production code modified

### Rollback
- Delete alert rules in Grafana UI
- No deployment required

### Success Criteria
- [ ] Test alert fires within 2 minutes of threshold breach
- [ ] Discord notification received
- [ ] No false positives in 24-hour monitoring period

---

## 1.4 PII Scrubbing in Error Messages
**Lead:** Raj Patel (Security & Reliability)  
**Risk:** 🟡 Medium  
**Effort:** 4 hours  

### Current State
```typescript
// Current: Raw error messages may contain sensitive data
log.error(`Failed for user ${userId}: ${error.message}`);
// Risk: error.message could contain tokens, passwords, etc.
```

### Implementation

#### File: `src/shared/utils/pii-scrubber.ts` (NEW)

```typescript
/**
 * PII Scrubbing Utility
 * Removes sensitive data from strings before logging
 */

// Patterns to detect and redact
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string; name: string }> = [
  // Discord tokens (Bot and User)
  { 
    pattern: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}/g, 
    replacement: '[DISCORD_TOKEN]',
    name: 'discord_token'
  },
  // Discord IDs (but preserve structure for debugging)
  { 
    pattern: /\b\d{17,20}\b/g, 
    replacement: (match: string) => `[ID:${match.slice(0,4)}...${match.slice(-4)}]`,
    name: 'discord_id'
  },
  // Email addresses
  { 
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, 
    replacement: '[EMAIL]',
    name: 'email'
  },
  // IP addresses
  { 
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, 
    replacement: '[IP]',
    name: 'ip_address'
  },
  // Bearer tokens
  { 
    pattern: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/gi, 
    replacement: '[BEARER_TOKEN]',
    name: 'bearer_token'
  },
  // API keys (common patterns)
  { 
    pattern: /(?:api[_-]?key|apikey|secret)[=:]\s*['"]?[A-Za-z0-9\-_]{20,}['"]?/gi, 
    replacement: '[API_KEY]',
    name: 'api_key'
  },
  // Database URLs with credentials
  { 
    pattern: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/gi, 
    replacement: (match: string) => match.replace(/:[^@]+@/, ':[REDACTED]@'),
    name: 'db_credentials'
  },
  // Render API keys
  { 
    pattern: /rnd_[A-Za-z0-9]{32}/g, 
    replacement: '[RENDER_API_KEY]',
    name: 'render_key'
  }
];

// Statistics for monitoring
interface ScrubStats {
  totalCalls: number;
  redactionsPerType: Map<string, number>;
}

const stats: ScrubStats = {
  totalCalls: 0,
  redactionsPerType: new Map()
};

/**
 * Scrub PII from a string
 * @param input - Raw string that may contain PII
 * @returns Sanitized string with PII redacted
 */
export function scrubPII(input: string | undefined | null): string {
  if (!input) return '';
  
  stats.totalCalls++;
  let result = input;
  
  for (const { pattern, replacement, name } of PII_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      stats.redactionsPerType.set(
        name, 
        (stats.redactionsPerType.get(name) || 0) + matches.length
      );
      
      if (typeof replacement === 'function') {
        result = result.replace(pattern, replacement as (match: string) => string);
      } else {
        result = result.replace(pattern, replacement);
      }
    }
  }
  
  return result;
}

/**
 * Scrub PII from an Error object
 */
export function scrubErrorPII(error: Error): Error {
  const scrubbed = new Error(scrubPII(error.message));
  scrubbed.name = error.name;
  if (error.stack) {
    scrubbed.stack = scrubPII(error.stack);
  }
  return scrubbed;
}

/**
 * Scrub PII from an object (deep)
 */
export function scrubObjectPII<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = scrubPII(value);
    } else if (value instanceof Error) {
      result[key] = scrubErrorPII(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = scrubObjectPII(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  
  return result as T;
}

/**
 * Get scrubbing statistics
 */
export function getScrubStats(): { totalCalls: number; redactions: Record<string, number> } {
  return {
    totalCalls: stats.totalCalls,
    redactions: Object.fromEntries(stats.redactionsPerType)
  };
}

/**
 * Reset statistics (for testing)
 */
export function resetScrubStats(): void {
  stats.totalCalls = 0;
  stats.redactionsPerType.clear();
}
```

#### Integration: `src/shared/utils/error-utils.ts`

```typescript
import { scrubPII, scrubErrorPII } from './pii-scrubber.js';

// UPDATE existing getErrorMessage function
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return scrubPII(error.message);  // ADD: PII scrubbing
  }
  if (typeof error === 'string') {
    return scrubPII(error);  // ADD: PII scrubbing
  }
  return scrubPII(String(error));  // ADD: PII scrubbing
}

// ADD: Safe error logging helper
export function getSafeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    const scrubbed = scrubErrorPII(error);
    return {
      message: scrubbed.message,
      stack: scrubbed.stack
    };
  }
  return { message: getErrorMessage(error) };
}
```

### Test Cases

#### File: `tests/shared/pii-scrubber.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { scrubPII, scrubErrorPII, resetScrubStats, getScrubStats } from '../../src/shared/utils/pii-scrubber.js';

describe('PII Scrubber', () => {
  beforeEach(() => {
    resetScrubStats();
  });

  describe('Discord tokens', () => {
    it('should redact bot tokens', () => {
      const input = 'Token: MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.Gh1234.abcdefghijklmnopqrstuvwxyz123';
      expect(scrubPII(input)).toBe('Token: [DISCORD_TOKEN]');
    });
  });

  describe('Discord IDs', () => {
    it('should partially redact Discord IDs', () => {
      const input = 'User 563220840708177927 joined';
      expect(scrubPII(input)).toBe('User [ID:5632...7927] joined');
    });
  });

  describe('Email addresses', () => {
    it('should redact emails', () => {
      const input = 'Contact: user@example.com for help';
      expect(scrubPII(input)).toBe('Contact: [EMAIL] for help');
    });
  });

  describe('Database URLs', () => {
    it('should redact database passwords', () => {
      const input = 'postgres://user:secretpass123@host:5432/db';
      expect(scrubPII(input)).toBe('postgres://user:[REDACTED]@host:5432/db');
    });
  });

  describe('Statistics', () => {
    it('should track redaction counts', () => {
      scrubPII('test@example.com and another@test.org');
      const stats = getScrubStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.redactions.email).toBe(2);
    });
  });
});
```

### Feature Flag
```bash
# .env
PII_SCRUBBING_ENABLED=true
```

### Rollback
1. Set `PII_SCRUBBING_ENABLED=false`
2. `getErrorMessage()` bypasses scrubbing
3. No restart required

### Success Criteria
- [ ] All test cases pass
- [ ] No tokens/credentials appear in Loki logs (manual audit)
- [ ] Discord IDs partially visible for debugging
- [ ] Performance: < 1ms for scrubbing typical error message

---

# 📋 PHASE 2: OBSERVABILITY EXPANSION (Week 2)

## 2.1 Prometheus Metrics Backend
**Lead:** Dr. Elena Vasquez (Observability Architect)  
**Risk:** 🟡 Medium  
**Effort:** 8 hours  

### Architecture
```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│ Application │────▶│ Metrics Registry│────▶│ /metrics    │
│   Code      │     │   (prom-client) │     │  endpoint   │
└─────────────┘     └─────────────────┘     └─────────────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │ Prometheus  │
                                            │  (scraper)  │
                                            └─────────────┘
```

### Implementation Plan

#### Step 1: Install Dependencies
```bash
npm install prom-client @types/prom-client
```

#### Step 2: Create Metrics Registry
**File:** `src/services/observability/metrics-registry.ts`

```typescript
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a single registry for all metrics
export const metricsRegistry = new Registry();

// Collect Node.js default metrics (memory, CPU, event loop)
collectDefaultMetrics({ register: metricsRegistry, prefix: 'ig_' });

// ===== GAME METRICS =====

export const battleMetrics = {
  total: new Counter({
    name: 'ig_battles_total',
    help: 'Total number of battles',
    labelNames: ['outcome', 'type'] as const,
    registers: [metricsRegistry]
  }),
  
  duration: new Histogram({
    name: 'ig_battle_duration_seconds',
    help: 'Battle duration in seconds',
    labelNames: ['type'] as const,
    buckets: [30, 60, 120, 300, 600], // 30s to 10min
    registers: [metricsRegistry]
  }),
  
  turnsPerBattle: new Histogram({
    name: 'ig_battle_turns',
    help: 'Number of turns per battle',
    buckets: [5, 10, 20, 50, 100],
    registers: [metricsRegistry]
  })
};

export const encounterMetrics = {
  total: new Counter({
    name: 'ig_encounters_total',
    help: 'Total Pokemon encounters',
    labelNames: ['rarity', 'area', 'caught'] as const,
    registers: [metricsRegistry]
  }),
  
  catchRate: new Gauge({
    name: 'ig_catch_rate',
    help: 'Current catch success rate (rolling 100)',
    registers: [metricsRegistry]
  })
};

export const commandMetrics = {
  total: new Counter({
    name: 'ig_commands_total',
    help: 'Discord commands executed',
    labelNames: ['command', 'status'] as const,
    registers: [metricsRegistry]
  }),
  
  latency: new Histogram({
    name: 'ig_command_latency_seconds',
    help: 'Command execution latency',
    labelNames: ['command'] as const,
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [metricsRegistry]
  })
};

// ===== INFRASTRUCTURE METRICS =====

export const databaseMetrics = {
  queries: new Counter({
    name: 'ig_db_queries_total',
    help: 'Database queries executed',
    labelNames: ['operation', 'table', 'status'] as const,
    registers: [metricsRegistry]
  }),
  
  latency: new Histogram({
    name: 'ig_db_query_latency_seconds',
    help: 'Database query latency',
    labelNames: ['operation'] as const,
    buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [metricsRegistry]
  }),
  
  connections: new Gauge({
    name: 'ig_db_connections',
    help: 'Current database connection count',
    labelNames: ['database'] as const,
    registers: [metricsRegistry]
  })
};

export const cacheMetrics = {
  hits: new Counter({
    name: 'ig_cache_hits_total',
    help: 'Cache hit count',
    labelNames: ['cache'] as const,
    registers: [metricsRegistry]
  }),
  
  misses: new Counter({
    name: 'ig_cache_misses_total',
    help: 'Cache miss count',
    labelNames: ['cache'] as const,
    registers: [metricsRegistry]
  }),
  
  size: new Gauge({
    name: 'ig_cache_size_bytes',
    help: 'Current cache size in bytes',
    labelNames: ['cache'] as const,
    registers: [metricsRegistry]
  })
};

export const lokiMetrics = {
  logsQueued: new Gauge({
    name: 'ig_loki_queue_size',
    help: 'Current Loki queue depth',
    registers: [metricsRegistry]
  }),
  
  logsSent: new Counter({
    name: 'ig_loki_logs_sent_total',
    help: 'Total logs sent to Loki',
    labelNames: ['status'] as const,
    registers: [metricsRegistry]
  }),
  
  circuitState: new Gauge({
    name: 'ig_loki_circuit_breaker_state',
    help: 'Loki circuit breaker state (0=closed, 1=open, 2=half-open)',
    registers: [metricsRegistry]
  })
};
```

#### Step 3: Create Metrics Endpoint
**File:** `src/services/observability/metrics-endpoint.ts`

```typescript
import { metricsRegistry } from './metrics-registry.js';

/**
 * Handler for /metrics endpoint (Prometheus scraping)
 */
export async function getMetrics(): Promise<{ contentType: string; metrics: string }> {
  return {
    contentType: metricsRegistry.contentType,
    metrics: await metricsRegistry.metrics()
  };
}

/**
 * Get metrics as JSON (for /ops metrics command)
 */
export async function getMetricsJson(): Promise<Record<string, unknown>> {
  const metrics = await metricsRegistry.getMetricsAsJSON();
  return { metrics };
}
```

#### Step 4: Integration Points

```typescript
// Battle completion
import { battleMetrics } from '../services/observability/metrics-registry.js';

function onBattleEnd(result: BattleResult) {
  battleMetrics.total.inc({ outcome: result.winner, type: result.type });
  battleMetrics.duration.observe({ type: result.type }, result.durationSeconds);
  battleMetrics.turnsPerBattle.observe(result.turns);
}

// Encounter
import { encounterMetrics } from '../services/observability/metrics-registry.js';

function onEncounter(pokemon: Pokemon, caught: boolean) {
  encounterMetrics.total.inc({ 
    rarity: pokemon.rarity, 
    area: pokemon.area, 
    caught: String(caught) 
  });
}

// Command execution
import { commandMetrics } from '../services/observability/metrics-registry.js';

async function executeCommand(name: string, handler: () => Promise<void>) {
  const start = Date.now();
  try {
    await handler();
    commandMetrics.total.inc({ command: name, status: 'success' });
  } catch (error) {
    commandMetrics.total.inc({ command: name, status: 'error' });
    throw error;
  } finally {
    commandMetrics.latency.observe({ command: name }, (Date.now() - start) / 1000);
  }
}
```

### Docker Integration
```yaml
# docker-compose.yml addition
  prometheus:
    image: prom/prometheus:v2.47.0
    ports:
      - "9090:9090"
    volumes:
      - ./ops/prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=7d'
```

```yaml
# ops/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'infinity-gauntlet'
    static_configs:
      - targets: ['host.docker.internal:3000']  # Bot's /metrics endpoint
    metrics_path: /metrics
```

### Feature Flag
```bash
METRICS_ENABLED=true
METRICS_PORT=9091  # Separate from main bot port
```

### Rollback
- Set `METRICS_ENABLED=false`
- Metrics endpoint returns 404
- No impact on core bot functionality

### Success Criteria
- [ ] `/metrics` returns valid Prometheus format
- [ ] Prometheus scrapes successfully every 15s
- [ ] Grafana dashboard shows game metrics
- [ ] No performance impact (< 1% CPU overhead)

---

## 2.2 Production Loki Deployment
**Lead:** Marcus Chen (Platform Engineer)  
**Risk:** 🔴 High (infrastructure change)  
**Effort:** 4 hours  

### Current Architecture (Development)
```
Render ──▶ ngrok tunnel ──▶ localhost:3100 (Loki)
```

### Target Architecture (Production)
```
Render ──▶ Grafana Cloud Loki (managed)
   OR
Render ──▶ Fly.io Loki (self-hosted, same region)
```

### Option A: Grafana Cloud (Recommended)

#### Pros
- Zero maintenance
- 50 GB/month free tier
- Built-in Grafana UI
- Automatic retention

#### Setup Steps
1. Sign up at https://grafana.com/products/cloud/
2. Create Loki data source
3. Get push URL and API key
4. Update Render environment:
   ```bash
   LOKI_ENDPOINT=https://logs-prod-us-central1.grafana.net
   LOKI_USERNAME=<instance-id>
   LOKI_PASSWORD=<api-key>
   ```

#### Code Changes
**File:** `src/services/observability/loki-http-transport.ts`

```typescript
// ADD: Basic auth support for Grafana Cloud
interface LokiConfig {
  endpoint: string;
  username?: string;  // Grafana Cloud instance ID
  password?: string;  // Grafana Cloud API key
}

function getAuthHeaders(config: LokiConfig): Record<string, string> {
  if (config.username && config.password) {
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    return { 'Authorization': `Basic ${auth}` };
  }
  return {};
}
```

### Option B: Fly.io Self-Hosted

#### Pros
- Same Virginia region as Render (low latency)
- Full control over configuration
- $5/month for 256MB instance

#### Setup Steps
1. Create Fly.io account
2. Deploy Loki:
   ```bash
   fly launch --image grafana/loki:2.9.0 --region iad
   fly secrets set LOKI_AUTH_TOKEN=$(openssl rand -hex 32)
   ```
3. Update Render environment:
   ```bash
   LOKI_ENDPOINT=https://infinity-loki.fly.dev
   ```

### Migration Plan
1. **Day 1:** Set up Grafana Cloud/Fly.io (parallel with ngrok)
2. **Day 2:** Configure dual-write to both endpoints
3. **Day 3:** Verify logs appearing in production Loki
4. **Day 4:** Disable ngrok, switch to production only
5. **Day 5:** Monitor for 24 hours
6. **Day 6:** Remove ngrok configuration

### Feature Flag
```bash
LOKI_DUAL_WRITE=true  # Send to both during migration
LOKI_PRIMARY=grafana-cloud  # or 'fly' or 'ngrok'
LOKI_FALLBACK=ngrok  # Fallback if primary fails
```

### Rollback
1. Set `LOKI_PRIMARY=ngrok`
2. Restart ngrok tunnel locally
3. Logs resume flowing within 30 seconds

### Success Criteria
- [ ] Production Loki receiving logs
- [ ] Query latency < 500ms
- [ ] 99.9% log delivery rate
- [ ] No ngrok dependency for production

---

## 2.3 Automated Dead Code CI Check
**Lead:** Sarah Okonkwo (Code Quality Lead)  
**Risk:** 🟢 Low  
**Effort:** 4 hours  

### Implementation

#### File: `.github/workflows/dead-code-check.yml`

```yaml
name: Dead Code Detection

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  dead-code:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Check for unused exports
        run: |
          npx ts-prune --error 2>&1 | tee ts-prune-report.txt
          
          # Count unused exports
          UNUSED_COUNT=$(grep -c "used in module" ts-prune-report.txt || echo "0")
          
          echo "::notice::Found $UNUSED_COUNT unused exports"
          
          # Fail if more than 10 unused exports
          if [ "$UNUSED_COUNT" -gt 10 ]; then
            echo "::error::Too many unused exports ($UNUSED_COUNT > 10)"
            exit 1
          fi
      
      - name: Check for unused dependencies
        run: |
          npx depcheck --json > depcheck-report.json
          
          # Parse unused dependencies
          UNUSED_DEPS=$(jq '.dependencies | length' depcheck-report.json)
          
          echo "::notice::Found $UNUSED_DEPS unused dependencies"
          
          if [ "$UNUSED_DEPS" -gt 0 ]; then
            echo "::warning::Unused dependencies found:"
            jq '.dependencies[]' depcheck-report.json
          fi
      
      - name: Upload reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: dead-code-reports
          path: |
            ts-prune-report.txt
            depcheck-report.json
```

#### File: `scripts/check-dead-code.ts`

```typescript
#!/usr/bin/env npx ts-node

/**
 * Local dead code checker
 * Run: npx ts-node scripts/check-dead-code.ts
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

interface DeadCodeReport {
  unusedExports: string[];
  unusedDependencies: string[];
  unusedDevDependencies: string[];
  timestamp: string;
}

async function checkDeadCode(): Promise<DeadCodeReport> {
  console.log('🔍 Checking for dead code...\n');
  
  // Check unused exports
  console.log('📦 Checking unused exports (ts-prune)...');
  let unusedExports: string[] = [];
  try {
    const output = execSync('npx ts-prune 2>&1', { encoding: 'utf-8' });
    unusedExports = output
      .split('\n')
      .filter(line => line.includes('used in module'))
      .map(line => line.trim());
  } catch (error) {
    // ts-prune exits with error if it finds issues
    if (error instanceof Error && 'stdout' in error) {
      unusedExports = (error as { stdout: string }).stdout
        .split('\n')
        .filter(line => line.includes('used in module'));
    }
  }
  
  console.log(`  Found ${unusedExports.length} unused exports`);
  
  // Check unused dependencies
  console.log('📚 Checking unused dependencies (depcheck)...');
  let unusedDependencies: string[] = [];
  let unusedDevDependencies: string[] = [];
  try {
    const output = execSync('npx depcheck --json', { encoding: 'utf-8' });
    const result = JSON.parse(output);
    unusedDependencies = result.dependencies || [];
    unusedDevDependencies = result.devDependencies || [];
  } catch (error) {
    console.warn('  ⚠️ depcheck failed, skipping dependency check');
  }
  
  console.log(`  Found ${unusedDependencies.length} unused dependencies`);
  console.log(`  Found ${unusedDevDependencies.length} unused devDependencies`);
  
  const report: DeadCodeReport = {
    unusedExports,
    unusedDependencies,
    unusedDevDependencies,
    timestamp: new Date().toISOString()
  };
  
  // Write report
  const reportPath = 'dead-code-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report written to ${reportPath}`);
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  
  if (unusedExports.length > 0) {
    console.log('\n🔴 Unused Exports:');
    unusedExports.slice(0, 10).forEach(e => console.log(`   ${e}`));
    if (unusedExports.length > 10) {
      console.log(`   ... and ${unusedExports.length - 10} more`);
    }
  }
  
  if (unusedDependencies.length > 0) {
    console.log('\n🟡 Unused Dependencies:');
    unusedDependencies.forEach(d => console.log(`   ${d}`));
  }
  
  const total = unusedExports.length + unusedDependencies.length;
  if (total === 0) {
    console.log('\n✅ No dead code detected!');
  } else {
    console.log(`\n⚠️ Total issues: ${total}`);
  }
  
  return report;
}

checkDeadCode().catch(console.error);
```

### npm Script
```json
{
  "scripts": {
    "check:dead-code": "npx ts-node scripts/check-dead-code.ts"
  }
}
```

### Feature Flag
- CI job can be disabled by removing workflow file
- No production code modified

### Rollback
- Delete `.github/workflows/dead-code-check.yml`
- No impact on production

### Success Criteria
- [ ] CI job runs on every PR
- [ ] Fails if > 10 unused exports
- [ ] Reports uploaded as artifacts
- [ ] Local script works for developers

---

## 2.4 Error Classification System
**Lead:** Raj Patel (Security & Reliability)  
**Risk:** 🟡 Medium  
**Effort:** 6 hours  

### Implementation

#### File: `src/shared/utils/error-classification.ts` (NEW)

```typescript
/**
 * Error Classification System
 * Categorizes errors for appropriate handling and alerting
 */

export enum ErrorSeverity {
  /** Expected errors from user input or normal operation */
  OPERATIONAL = 'operational',
  
  /** Bugs that should never happen - programming errors */
  PROGRAMMER = 'programmer',
  
  /** External service failures (DB, Discord API, etc.) */
  DEPENDENCY = 'dependency',
  
  /** Security-related errors (auth, permissions) */
  SECURITY = 'security',
  
  /** Resource exhaustion (memory, connections, rate limits) */
  RESOURCE = 'resource'
}

export enum ErrorCategory {
  // Operational
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  
  // Programmer
  TYPE_ERROR = 'type_error',
  NULL_REFERENCE = 'null_reference',
  ASSERTION = 'assertion',
  
  // Dependency
  DATABASE = 'database',
  DISCORD_API = 'discord_api',
  EXTERNAL_SERVICE = 'external_service',
  NETWORK = 'network',
  
  // Security
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMITED = 'rate_limited',
  
  // Resource
  MEMORY = 'memory',
  TIMEOUT = 'timeout',
  QUOTA = 'quota'
}

export interface ClassifiedError {
  severity: ErrorSeverity;
  category: ErrorCategory;
  fingerprint: string;
  retryable: boolean;
  userFacing: boolean;
  alertLevel: 'none' | 'log' | 'warn' | 'alert' | 'page';
  suggestedAction: string;
}

// Pattern matching for error classification
const ERROR_PATTERNS: Array<{
  patterns: RegExp[];
  classification: Partial<ClassifiedError>;
}> = [
  // Database errors
  {
    patterns: [
      /ECONNREFUSED.*postgres/i,
      /connection.*refused/i,
      /P1001/i,  // Prisma connection error
    ],
    classification: {
      severity: ErrorSeverity.DEPENDENCY,
      category: ErrorCategory.DATABASE,
      retryable: true,
      userFacing: false,
      alertLevel: 'alert',
      suggestedAction: 'Check database connectivity and connection pool'
    }
  },
  
  // Discord API errors
  {
    patterns: [
      /DiscordAPIError/i,
      /Unknown interaction/i,
      /Missing Permissions/i,
    ],
    classification: {
      severity: ErrorSeverity.DEPENDENCY,
      category: ErrorCategory.DISCORD_API,
      retryable: false,
      userFacing: true,
      alertLevel: 'log',
      suggestedAction: 'Check bot permissions and interaction validity'
    }
  },
  
  // Rate limiting
  {
    patterns: [
      /rate.*limit/i,
      /429/,
      /too many requests/i,
    ],
    classification: {
      severity: ErrorSeverity.RESOURCE,
      category: ErrorCategory.RATE_LIMITED,
      retryable: true,
      userFacing: true,
      alertLevel: 'warn',
      suggestedAction: 'Implement exponential backoff'
    }
  },
  
  // Validation errors (user input)
  {
    patterns: [
      /validation.*fail/i,
      /invalid.*input/i,
      /required.*field/i,
    ],
    classification: {
      severity: ErrorSeverity.OPERATIONAL,
      category: ErrorCategory.VALIDATION,
      retryable: false,
      userFacing: true,
      alertLevel: 'none',
      suggestedAction: 'Return user-friendly validation message'
    }
  },
  
  // Type errors (programmer bugs)
  {
    patterns: [
      /TypeError/i,
      /Cannot read prop/i,
      /undefined is not/i,
    ],
    classification: {
      severity: ErrorSeverity.PROGRAMMER,
      category: ErrorCategory.TYPE_ERROR,
      retryable: false,
      userFacing: false,
      alertLevel: 'alert',
      suggestedAction: 'Fix null/undefined handling in code'
    }
  },
  
  // Memory errors
  {
    patterns: [
      /heap.*memory/i,
      /out of memory/i,
      /allocation failed/i,
    ],
    classification: {
      severity: ErrorSeverity.RESOURCE,
      category: ErrorCategory.MEMORY,
      retryable: false,
      userFacing: false,
      alertLevel: 'page',
      suggestedAction: 'Restart service and investigate memory leak'
    }
  },
];

/**
 * Generate a stable fingerprint for error deduplication
 */
function generateFingerprint(error: Error): string {
  const crypto = require('crypto');
  
  // Use error type + first line of stack trace
  const stackLine = error.stack?.split('\n')[1]?.trim() || '';
  const input = `${error.name}:${error.message.slice(0, 100)}:${stackLine}`;
  
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Classify an error based on patterns and heuristics
 */
export function classifyError(error: unknown): ClassifiedError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : '';
  const fullText = `${errorMessage} ${errorStack}`;
  
  // Default classification
  let classification: ClassifiedError = {
    severity: ErrorSeverity.PROGRAMMER,
    category: ErrorCategory.TYPE_ERROR,
    fingerprint: error instanceof Error ? generateFingerprint(error) : 'unknown',
    retryable: false,
    userFacing: false,
    alertLevel: 'alert',
    suggestedAction: 'Investigate and fix the bug'
  };
  
  // Match against patterns
  for (const { patterns, classification: partial } of ERROR_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(fullText)) {
        classification = { ...classification, ...partial };
        break;
      }
    }
  }
  
  return classification;
}

/**
 * Determine if error should be retried
 */
export function shouldRetry(error: unknown, attempt: number, maxAttempts: number = 3): boolean {
  if (attempt >= maxAttempts) return false;
  
  const classified = classifyError(error);
  return classified.retryable;
}

/**
 * Get user-facing error message
 */
export function getUserMessage(error: unknown): string {
  const classified = classifyError(error);
  
  if (!classified.userFacing) {
    return 'An unexpected error occurred. Please try again later.';
  }
  
  switch (classified.category) {
    case ErrorCategory.VALIDATION:
      return error instanceof Error ? error.message : 'Invalid input provided.';
    case ErrorCategory.NOT_FOUND:
      return 'The requested resource was not found.';
    case ErrorCategory.RATE_LIMITED:
      return 'Too many requests. Please wait a moment and try again.';
    case ErrorCategory.AUTHENTICATION:
      return 'Authentication failed. Please check your credentials.';
    case ErrorCategory.AUTHORIZATION:
      return 'You do not have permission to perform this action.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
```

### Integration Example

```typescript
import { classifyError, shouldRetry, getUserMessage } from '../utils/error-classification.js';
import { log } from '../log.js';

async function executeWithClassification<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const classified = classifyError(error);
      
      // Log with classification context
      log.error(`[${context}] ${classified.category}`, {
        severity: classified.severity,
        fingerprint: classified.fingerprint,
        attempt,
        retryable: classified.retryable,
        suggestedAction: classified.suggestedAction
      });
      
      if (!shouldRetry(error, attempt)) {
        break;
      }
      
      // Exponential backoff
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  
  throw lastError;
}
```

### Feature Flag
```bash
ERROR_CLASSIFICATION_ENABLED=true
```

### Rollback
- Set `ERROR_CLASSIFICATION_ENABLED=false`
- Falls back to basic error handling

### Success Criteria
- [ ] All error types correctly classified
- [ ] Retry logic respects classification
- [ ] Alert levels trigger appropriate notifications
- [ ] User messages are friendly and secure

---

# 📋 PHASE 3: ADVANCED OBSERVABILITY (Week 3)

## 3.1 OpenTelemetry Tracing
**Lead:** Dr. Elena Vasquez (Observability Architect)  
**Risk:** 🟡 Medium  
**Effort:** 16 hours  
**Dependencies:** Prometheus metrics (2.1)

### Deferred to Phase 3 due to:
- Requires metrics infrastructure
- Complex instrumentation
- Performance testing needed

### High-Level Plan
1. Install `@opentelemetry/sdk-node`
2. Configure trace exporter (Jaeger or OTLP)
3. Auto-instrument Prisma, Discord.js, HTTP
4. Add manual spans for battle engine
5. Create distributed tracing dashboard

---

## 3.2 Log Sampling for High-Volume Events
**Lead:** Dr. Elena Vasquez (Observability Architect)  
**Risk:** 🟢 Low  
**Effort:** 4 hours  

### Implementation Plan
1. Identify high-volume events (walk, encounter checks)
2. Implement 1:100 sampling for INFO level
3. Keep 100% of WARN/ERROR
4. Add `sampled: true/false` label

---

## 3.3 Dependency Graph Visualization
**Lead:** Sarah Okonkwo (Code Quality Lead)  
**Risk:** 🟢 Low  
**Effort:** 8 hours  

### Implementation Plan
1. Install `madge` for dependency analysis
2. Generate weekly SVG graphs
3. Post to Discord #dev-ops channel
4. Flag circular dependencies

---

## 3.4 Adaptive Batching for Loki Queue
**Lead:** Dr. James Wright (Performance Analyst)  
**Risk:** 🟡 Medium  
**Effort:** 6 hours  

### Implementation Plan
1. Flush when: batch > 100 entries OR > 1 second elapsed
2. Compress batches with gzip
3. Separate priority queues (critical vs info)
4. Add queue depth metrics

---

# 📊 TRACKING & REPORTING

## Weekly Sync Schedule

| Day | Time (UTC) | Agenda |
|-----|------------|--------|
| Monday | 10:00 | Sprint planning, priority review |
| Wednesday | 10:00 | Mid-week check-in, blocker resolution |
| Friday | 16:00 | Demo, metrics review, next week prep |

## Success Metrics Dashboard

### Code Health
| Metric | Baseline | Target | Current |
|--------|----------|--------|---------|
| Lines of Code | 145,000 | 45,000 | ✅ 45,000 |
| Unused Exports | Unknown | < 10 | 🔄 TBD |
| Test Coverage | ~60% | 80% | 🔄 TBD |

### Observability
| Metric | Baseline | Target | Current |
|--------|----------|--------|---------|
| Log Ingestion | 0 | 100/min | ✅ ~100/min |
| Query Latency | N/A | < 500ms | 🔄 TBD |
| Alert Coverage | 0 | 5 rules | 🔄 Pending |

### Performance
| Metric | Baseline | Target | Current |
|--------|----------|--------|---------|
| Memory Usage | 300 MB | < 400 MB | ✅ 300 MB |
| Disk Usage | 82 MB | < 500 MB | ✅ 82 MB |
| Startup Time | ~45s | < 30s | 🔄 TBD |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| ngrok tunnel instability | Medium | High | Phase 2.2 production Loki |
| Memory increase from metrics | Low | Medium | Monitor with existing alerts |
| CI job false positives | Medium | Low | Tune thresholds gradually |
| Error classification misses | Medium | Low | Iterate based on production data |

---

## Appendix: File Change Summary

### New Files to Create
```
src/shared/utils/pii-scrubber.ts
src/shared/utils/error-classification.ts
src/services/observability/metrics-registry.ts
src/services/observability/metrics-endpoint.ts
tests/shared/pii-scrubber.test.ts
tests/shared/error-classification.test.ts
scripts/check-dead-code.ts
.github/workflows/dead-code-check.yml
ops/grafana-alert-rules.yml
ops/grafana-notification-channels.yml
ops/prometheus.yml
```

### Files to Modify
```
src/shared/resource-monitor.ts    # Add disk caching
src/shared/utils/error-utils.ts   # Integrate PII scrubbing
src/services/observability/loki-http-transport.ts  # Add auth support
docker-compose.yml                 # Add Prometheus service
package.json                       # Add scripts
```

### Configuration Changes
```
.env.example:
  + DISK_CACHE_ENABLED=true
  + DISK_CACHE_TTL_MS=60000
  + PII_SCRUBBING_ENABLED=true
  + ERROR_CLASSIFICATION_ENABLED=true
  + METRICS_ENABLED=true
  + METRICS_PORT=9091
  + LOKI_DUAL_WRITE=false
  + LOKI_PRIMARY=ngrok
```

---

*Implementation Plan Version: 1.0*  
*Created: December 21, 2025 11:00 UTC*  
*Lead: Integration Specialist Agent*  
*Specialists: Dr. Elena Vasquez, Marcus Chen, Sarah Okonkwo, Raj Patel, Dr. James Wright*
