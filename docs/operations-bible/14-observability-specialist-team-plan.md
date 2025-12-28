# Observability Specialist Team Plan
## Pokémon Infinity Gauntlet — Production-Ready Monitoring System

**Created:** 2025-12-28
**Status:** 🟡 SPEC APPROVED — Ready for Specialist Assignment
**End Goal:** Operator-friendly, self-healing observability system requiring minimal manual intervention

---

## 🎯 Mission Statement

Transform the current observability foundation into a **production-ready, operator-friendly monitoring system** that:
- Alerts proactively before issues become critical
- Self-heals common problems automatically
- Provides clear, actionable insights to non-technical operators
- Requires zero ongoing maintenance
- Just works™ for regular human admins

---

## 👥 Specialist Roles & Responsibilities

### **Role 0: User Experience & Visual Simplification Specialist** ⭐ HIGHEST PRIORITY — THE BIGGEST TASK
**Expertise:** CLI output design, log formatting, human-centered UX  
**Primary Goal:** Remove ALL legacy technical jumble and make everything visually friendly for operators

**Why This Is #1:** Observability tools are useless if operators can't understand them. Technical jargon, raw JSON, stack traces, and cryptic metric names prevent effective system monitoring. This role transforms everything into plain English with visual clarity.

**Responsibilities:**
- Audit all console output locations (scripts, services, workers)
- Convert raw `console.log` to `output-formatter.ts` patterns (ASCII-safe, clean sections)
- Translate dashboard labels from technical (`ig_memory_rss`) to plain English ("Memory Usage (MB)")
- Add color coding to CLI outputs (green/yellow/red status indicators)
- Reduce log noise by 85-90% (circuit breakers, Loki errors, duplicate lines)
- Create visual status dashboard for at-a-glance health checks
- Write operator guide explaining what outputs mean in plain language

**Current Problems Blocking Operator Use:**
- ❌ Raw JSON dumps (`console.log(JSON.stringify(obj))`) everywhere
- ❌ Stack traces and debug noise polluting production logs
- ❌ Cryptic metric names (`ig_memory_rss`, `ig_disk_used_percent`)
- ❌ No color coding or visual hierarchy in CLI
- ❌ Excessive log repetition (circuit breaker spam, Loki 404s × 30)
- ❌ Dashboard panels labeled for developers not operators

**Deliverables:**
- `ops/CLI-VISUAL-AUDIT.md` — Inventory of console outputs (raw vs formatted)
- `src/utils/visual-status.ts` — Color-coded status display module
- `docs/operations-bible/reading-system-output.md` — Plain English operator guide
- Updated `ops/grafana-unified-system-health.json` with translated labels
- `scripts/migrate-console-to-formatter.ts` — Auto-conversion script

**Task 1: CLI Output Audit**
```powershell
# Find raw console calls needing conversion
grep -r "console\.log\|console\.info\|console\.error" --include="*.ts" --include="*.js" src/ scripts/ | wc -l

# Find scripts already using output-formatter (examples)
grep -r "printSection\|printKeyValue\|printSuccess" --include="*.ts" src/ scripts/
```

**Task 2: Convert Legacy Console to Visual Format**
```typescript
// ❌ BEFORE: Technical jumble
console.log('Database connection established');
console.log('Memory:', process.memoryUsage().rss, 'bytes');
console.log('Errors:', JSON.stringify(errors));

// ✅ AFTER: Operator-friendly visual format
import { printSection, printKeyValue, printSuccess, printError } from '../utils/output-formatter.js';

printSection('Database Status');
printSuccess('Connection established');
printKeyValue('Memory Usage', `${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`);
if (errors.length > 0) {
  printError(`Found ${errors.length} errors - check logs`);
} else {
  printKeyValue('Errors', '✅ None');
}
```

**Task 3: Dashboard Label Translation** 
```json
// ops/grafana-unified-system-health.json — Update ALL panels
{
  "title": "Memory Usage (MB)",  // ✅ Plain English
  "description": "RAM used by the bot. Green (<1000 MB) = healthy, Yellow (1000-1500 MB) = high, Red (>1500 MB) = critical",
  "targets": [{
    "expr": "ig_memory_rss / 1024 / 1024",
    "legendFormat": "Memory"  // ✅ Not "ig_memory_rss"
  }]
}
```

**Task 4: Add Color-Coded Status Outputs**
```typescript
// src/utils/visual-status.ts (CREATE THIS FILE)
export const COLORS = {
  green: '\x1b[32m',   // Good/healthy
  yellow: '\x1b[33m',  // Warning/elevated
  red: '\x1b[31m',     // Critical/danger
  blue: '\x1b[34m',    // Info
  reset: '\x1b[0m'
};

export function formatSystemHealth(metrics: HealthMetrics): string {
  const memColor = metrics.memoryMB < 1000 ? COLORS.green : 
                   metrics.memoryMB < 1500 ? COLORS.yellow : COLORS.red;
  const diskColor = metrics.diskPercent < 75 ? COLORS.green :
                    metrics.diskPercent < 85 ? COLORS.yellow : COLORS.red;
  
  return `
╔════════════════════════════════════════╗
║  INFINITY GAUNTLET — SYSTEM STATUS    ║
╚════════════════════════════════════════╝

[HEALTH]     ${metrics.errors === 0 ? '✅ ALL SYSTEMS GO' : '⚠️ ISSUES DETECTED'}
[MEMORY]     ${memColor}${metrics.memoryMB} MB / 2048 MB (${Math.round(metrics.memoryMB/2048*100)}%)${COLORS.reset}
[DISK]       ${diskColor}${metrics.diskPercent}% used (${metrics.diskMB} MB / 974 MB)${COLORS.reset}
[DATABASE]   ${metrics.dbConnected ? '🟢 Connected' : '🔴 Disconnected'} (${metrics.dbLatencyMs}ms)
[DISCORD]    ${metrics.discordReady ? '🟢 Ready' : '🔴 Offline'} (${metrics.guilds} guilds)
[WORKERS]    ${metrics.workersRunning}/${metrics.workersTotal} running
  `;
}
```

**Task 5: Log Noise Reduction** (85-90% Complete — See `docs/logging-optimization-2025-12-26.md`)
- ✅ Circuit breaker silent mode (suppress noisy state transitions)
- ✅ Loki error suppression (log 1 in 60 failures instead of all)
- ✅ Status line deduplication (30-second window)
- 🟡 **Remaining:** Apply patterns to database retry logs, EventBus verbosity

**Reality Check:**
- ✅ `output-formatter.ts` exists (474 lines, 61 tests, Windows-compatible)
- ✅ Logging optimization 85-90% complete
- ✅ Status deduplication working
- ❌ ~100+ raw `console.log` calls still in codebase
- ❌ Dashboard labels still technical (`ig_*` metric names)
- ❌ No CLI color coding yet
- ❌ No visual status module yet

---

### **Role 1: Alert Architect**
**Expertise:** Grafana alerting, threshold tuning, notification routing  
**Primary Goal:** Design and implement comprehensive alert rule system

**Responsibilities:**
- Create alert rules for all critical metrics
- Configure notification channels (Discord webhooks)
- Test alert firing and recovery
- Document alert runbooks (what alerts mean, how to fix)
- Tune thresholds based on production baselines

**Deliverables:**
- `ops/grafana-unified-alert-rules.yml` — Complete alert rules (see template below)
- `docs/operations-bible/alert-runbooks.md` — Operator response guide
- Discord webhook integration configured (via `ALERT_WEBHOOK_URL`)
- Alert testing report

**Discord Webhook Setup (Already Configured!):**
```typescript
// src/config/env.ts (line 357) — Already exists
export const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL ?? "";

// src/bot/main.ts (lines 3335-3366) — Webhook sending logic already implemented
if (ALERT_WEBHOOK_URL) {
  await fetch(ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: alertMessage })
  });
}
```
**Your Job:** Connect Grafana alerts → Discord via webhook URL in alert rules

**Alert Rules Template** (Create this file):
```yaml
# ops/grafana-unified-alert-rules.yml
apiVersion: 1
groups:
  - name: critical_alerts
    interval: 1m
    rules:
      - alert: HighMemoryUsage
        expr: ig_memory_rss / (2 * 1024 * 1024 * 1024) > 0.90
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Memory usage above 90%"
          description: "Current: {{ $value | humanize }}%"
        # Grafana contact point: Discord webhook
      
      - alert: DiskSpaceLow
        expr: ig_disk_used_percent > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Disk usage above 85%"
      
      - alert: ErrorRateHigh
        expr: rate(ig_errors_total[5m]) > 10
        for: 2m
        labels:
          severity: critical
```

---

### **Role 2: Dashboard Validation Engineer**
**Expertise:** Grafana dashboard testing, metric validation, UX design  
**Primary Goal:** Ensure dashboard is production-ready and operator-friendly

**Responsibilities:**
- Import unified dashboard into Grafana
- Verify all 25 panels display data correctly
- Test time range selections and auto-refresh
- Validate color thresholds trigger at correct values
- Create operator training guide
- Document common dashboard interpretation patterns

**Deliverables:**
- `ops/DASHBOARD-VALIDATION-REPORT.md` — Complete test results (template below)
- `docs/operations-bible/dashboard-operator-guide.md` — Non-technical guide
- Screenshots of working dashboard (for documentation)
- List of any metric gaps requiring code changes

**Dashboard Import Steps:**
1. **Open Grafana:** `http://localhost:3000`
2. **Import Dashboard:** Dashboards → Import → Upload `ops/grafana-unified-system-health.json`
3. **Configure Data Sources:**
   - Prometheus: `http://localhost:9090`
   - Loki: `http://localhost:3100`
4. **Verify Panels Load:** All 25 panels show data (not "No Data")

**Metric Verification (Run these before validation):**
```powershell
# Check Prometheus has metrics
curl.exe "http://localhost:9090/api/v1/label/__name__/values" | ConvertFrom-Json | Select-Object -ExpandProperty data | Select-String "ig_"

# Expected metrics (from src/services/prometheus-metrics.ts):
# - ig_memory_rss (memory usage in bytes)
# - ig_disk_used_percent (disk usage percentage)
# - ig_uptime_seconds (process uptime)
# - ig_errors_total (error counter)
# - ig_battles_total (game battles)
# - ig_heap_snapshots_pruned_total (auto-remediation)

# Check Loki has logs
curl.exe "http://localhost:3100/loki/api/v1/labels" | ConvertFrom-Json
# Expected labels: service, level, environment
```

**Validation Report Template:**
```markdown
# Dashboard Validation Report
**Date:** YYYY-MM-DD
**Tester:** [Your Name]

## Panel Validation (25 panels)
| Panel # | Name | Shows Data? | Query Time | Notes |
|---------|------|-------------|------------|-------|
| 1 | Active Services | ✅ Yes | 0.5s | Shows 8 services |
| 2 | System Uptime | ✅ Yes | 0.2s | |
| 3 | Error Count | ❌ No | N/A | Metric missing? |

## Color Thresholds Test
- Memory 50% = Green ✅
- Memory 75% = Yellow ✅
- Memory 90% = Red ✅

## Issues Found
1. Panel 3 shows "No Data" — investigate metric export
2. Time range selector works ✅
```

---

### **Role 3: Query Optimization Specialist**
**Expertise:** PromQL, LogQL, query performance tuning  
**Primary Goal:** Optimize all dashboard queries for speed and efficiency

**Responsibilities:**
- Review all PromQL queries in unified dashboard
- Review all LogQL queries in unified dashboard
- Optimize rate calculations and aggregations
- Add missing indexes to Prometheus/Loki if needed
- Benchmark query performance (<1s target)
- Document query patterns and best practices

**Deliverables:**
- `ops/QUERY-OPTIMIZATION-REPORT.md` — Performance improvements (template below)
- Updated `grafana-unified-system-health.json` with optimized queries
- `docs/operations-bible/query-patterns.md` — Query pattern library
- Performance benchmark results

**Optimization Targets (from unified dashboard):**

**Before Optimization (Example):**
```promql
# SLOW — Full scan over 24 hours
sum(increase(ig_errors_total[24h]))
```

**After Optimization:**
```promql
# FAST — Use rate() + recording rules
sum(rate(ig_errors_total[5m])) * 300  # 5min rate × 300 = 24h estimate
```

**Query Patterns to Optimize:**

1. **Memory Usage Panel:**
```promql
# Current (check dashboard line 120):
ig_memory_rss

# Optimized (add unit conversion):
ig_memory_rss / (1024 * 1024)  # Convert to MB
```

2. **Error Rate Panel:**
```promql
# Current:
count_over_time({level="error"}[5m])

# Optimized (use Prometheus metric):
rate(ig_errors_total[5m]) * 60  # Errors per minute
```

**Benchmarking Methodology:**
```powershell
# Test query execution time
$queries = @(
    "ig_memory_rss",
    "rate(ig_errors_total[5m])",
    "histogram_quantile(0.95, ig_battle_duration_bucket)"
)

foreach ($query in $queries) {
    $start = Get-Date
    curl.exe "http://localhost:9090/api/v1/query?query=$query" | Out-Null
    $elapsed = ((Get-Date) - $start).TotalMilliseconds
    Write-Host "$query : $elapsed ms"
}

# Target: All queries <1000ms (1 second)
```

**Optimization Report Template:**
```markdown
# Query Optimization Report

## Performance Results
| Query | Before | After | Improvement |
|-------|--------|-------|-------------|
| Memory gauge | 1.2s | 0.3s | 75% faster |
| Error rate | 2.5s | 0.8s | 68% faster |

## Techniques Applied
- Recording rules for expensive aggregations
- Shorter time windows with extrapolation
- Index-friendly label selectors
```

---

### **Role 4: Metrics Integration Engineer**
**Expertise:** Prometheus exporters, instrumentation, metric design  
**Primary Goal:** Fill metric coverage gaps and validate instrumentation

**Responsibilities:**
- Audit current metric coverage vs dashboard requirements
- Identify missing metrics (if any)
- Implement missing metric exporters
- Validate metric accuracy (spot-check values)
- Test metric collection under load
- Document metric catalog

**Deliverables:**
- `ops/METRICS-COVERAGE-AUDIT.md` — Gap analysis report
- Code changes for missing metrics (if any)
- `docs/operations-bible/metrics-catalog.md` — Complete metric reference
- Metric accuracy validation report

---

### **Role 5: Automation & Self-Healing Engineer**
**Expertise:** Auto-remediation, event-driven automation, circuit breakers  
**Primary Goal:** Implement automated responses to common issues

**Responsibilities:**
- Design auto-remediation workflows for common alerts
- Implement automatic heap pruning when memory high
- Implement automatic cache clearing when disk full
- Create circuit breakers for cascading failures
- Test remediation actions in staging
- Document auto-remediation playbook

**Deliverables:**
- `src/services/auto-remediation.ts` — Auto-healing service (template below)
- `ops/AUTO-REMEDIATION-RULES.yml` — Remediation configuration
- `docs/operations-bible/auto-healing-guide.md` — What gets auto-fixed
- Staging test results

**Existing Auto-Remediation (Already Implemented!):**

**Heap Pruning** (`src/workers/heap-pruner.ts` — 476 lines):
```typescript
// ALREADY EXISTS — Automatic heap snapshot cleanup
export async function pruneHeapSnapshots(): Promise<PruneResult> {
  // Keeps 3 most recent snapshots
  // Deletes snapshots older than 7 days
  // Saves ~110 MB disk space (14% of 974 MB total)
  // Runs every 24 hours automatically
}

// EventBus integration for observability:
EventBus.emit('disk.pruning.complete', {
  deletedCount,
  deletedBytes,
  diskReclaimed: formatBytes(deletedBytes)
});
```

**Circuit Breakers** (`src/workers/database/strategies.ts`):
```typescript
// ALREADY EXISTS — Prevents cascade failures
export class CircuitBreakerStrategy {
  async handleError(error: Error, config: ErrorRecoveryConfig) {
    if (this.stats.circuitBreakerState === 'open') {
      // Block operations to prevent cascade
      throw new Error('Circuit breaker OPEN');
    }
    // Auto-recovery after threshold timeout
  }
}
```

**New Auto-Remediation Service Template:**
```typescript
// src/services/auto-remediation.ts (CREATE THIS)
import { EventBus } from '../shared/event-bus.js';
import { pruneHeapSnapshots } from '../workers/heap-pruner.js';
import { getLogger } from '../shared/logging/index.js';

const log = getLogger();

// Auto-remediation rules configuration
interface RemediationRule {
  trigger: string;  // EventBus topic
  threshold: number;
  action: () => Promise<void>;
  cooldown: number;  // ms between actions
}

const RULES: RemediationRule[] = [
  {
    trigger: 'resource.memory.high',
    threshold: 0.90,  // 90% memory usage
    action: async () => {
      log.warn('AutoRemediation', 'trigger', 'High memory — forcing GC');
      if (global.gc) global.gc();
      EventBus.emit('remediation.gc.triggered', {});
    },
    cooldown: 300000  // 5 minutes
  },
  {
    trigger: 'resource.disk.high',
    threshold: 0.85,  // 85% disk usage
    action: async () => {
      log.warn('AutoRemediation', 'trigger', 'High disk — pruning heaps');
      await pruneHeapSnapshots();
      EventBus.emit('remediation.prune.triggered', {});
    },
    cooldown: 3600000  // 1 hour
  },
  {
    trigger: 'queue.backpressure',
    threshold: 0.95,  // 95% queue full
    action: async () => {
      log.error('AutoRemediation', 'trigger', 'Queue backpressure — dropping old messages');
      // Implement queue drain logic
      EventBus.emit('remediation.queue.drained', {});
    },
    cooldown: 60000  // 1 minute
  }
];

export function startAutoRemediation() {
  RULES.forEach(rule => {
    EventBus.on(rule.trigger, async (event) => {
      if (event.value > rule.threshold) {
        await rule.action();
      }
    });
  });
}
```

**Auto-Remediation Configuration:**
```yaml
# ops/AUTO-REMEDIATION-RULES.yml
rules:
  - name: high_memory_gc
    trigger: memory_usage
    threshold: 90  # percent
    action: force_gc
    cooldown: 300  # seconds
    
  - name: high_disk_prune
    trigger: disk_usage
    threshold: 85
    action: prune_heaps
    cooldown: 3600
    
  - name: queue_backpressure
    trigger: queue_utilization
    threshold: 95
    action: drain_queue
    cooldown: 60
```

---

### **Role 6: Documentation & Training Specialist**
**Expertise:** Technical writing, operator training, knowledge transfer  
**Primary Goal:** Create operator-friendly documentation for all monitoring systems

**Responsibilities:**
- Write non-technical operator guides
- Create alert response playbooks
- Document common troubleshooting patterns
- Create video walkthrough (optional)
- Translate technical metrics into business impact
- Create operator cheat sheet

**Deliverables:**
- `docs/operations-bible/operator-quick-start.md` — 1-page guide (template below)
- `docs/operations-bible/alert-response-playbook.md` — What to do when alerts fire
- `docs/operations-bible/common-issues-guide.md` — FAQ-style troubleshooting
- Operator cheat sheet (PDF/printable)

**Operator Quick-Start Template:**
```markdown
# Observability Quick-Start for Operators

## 🚀 Access Points
- **Dashboard:** http://localhost:3000 (Grafana)
- **Prometheus:** http://localhost:9090 (raw metrics)
- **Loki:** http://localhost:3100 (logs)

## 🟢 What the Colors Mean
| Color | Meaning | Action |
|-------|---------|--------|
| 🟢 Green | Normal | No action needed |
| 🟡 Yellow | Warning | Monitor closely |
| 🟠 Orange | Elevated | Plan intervention |
| 🔴 Red | Critical | Take action now |

## 📊 Dashboard Sections (5 rows)

### 1. 🎯 System Overview
- **Active Services:** Should show 8+ (bot, workers, security, cache)
- **System Uptime:** Green >24h, Yellow 1-24h, Red <1h
- **Error Count:** Green <10, Yellow 10-25, Orange 25-50, Red >50
- **Memory Usage:** Red >90%, Yellow >75%, Green <75%

### 2. 🎮 Game Performance
- **Battles/Hour:** Normal 10-50, High >50
- **Catch Rate:** Should be 20-40%
- **Command Latency:** Green <500ms, Yellow <1s, Red >1s

### 3. 📦 Database Health
- **Query Latency (p95):** Green <100ms, Yellow <500ms, Red >500ms
- **Connection Pool:** Should have 5-10 active connections

### 4. 📊 Observability Pipeline
- **Loki Ingestion Rate:** Normal 10-50 logs/s
- **Prometheus Scrape Duration:** Should be <1s

### 5. 💻 Resource Utilization
- **Memory (RSS):** Red >1.8GB (out of 2GB limit)
- **Disk Usage:** Red >850MB (out of 974MB limit)
- **CPU Usage:** Yellow >70%, Red >90%

## ⚠️ Common Alerts

**High Memory (>90%)**
```
What: Process using too much RAM
Why: Might crash if reaches 2GB limit
Fix: System auto-runs garbage collection
Manual: Restart service if persists >10min
```

**Disk Space Low (<15% free)**
```
What: Running out of /Store disk space
Why: Heap snapshots accumulate
Fix: System auto-prunes old snapshots
Manual: Check logs at /Store/logs/
```

**Error Rate High (>10/min)**
```
What: Many errors being logged
Why: Could be Discord API issues, DB timeout, or bug
Fix: Check dashboard "Error Count" panel for pattern
Manual: Review Loki logs for specific errors
```

## 🚑 Escalation
If system doesn't auto-heal within 10 minutes:
1. Check if auto-remediation counters increased (Dashboard row 1)
2. Review Loki logs for repeated errors
3. Contact developer with dashboard screenshot
```

**Alert Response Playbook Template:**
```markdown
# Alert Response Playbook

## 🔴 Critical: High Memory Usage

**Alert:** `HighMemoryUsage` fires when >90% RAM used
**Discord Message:** "Memory usage above 90%"

### Step 1: Check Dashboard
- Open Grafana dashboard
- Look at "Memory Usage" panel (row 1)
- Note current percentage

### Step 2: Auto-Remediation
System automatically:
1. Forces garbage collection (clears unused memory)
2. Logs action to EventBus (`remediation.gc.triggered`)
3. Waits 5 minutes before next action

### Step 3: If Still High After 10min
```powershell
# Restart the service (LAST RESORT)
pwsh -File "scripts/render_restart.ps1" -Service "Infinity-Gauntlet"
```

### Step 4: Document
Record in incident log:
- Time alert fired
- Peak memory usage
- Actions taken
- Resolution time

---

## 🟡 Warning: Disk Space Low

**Alert:** `DiskSpaceLow` fires when >85% disk used

### Step 1: Auto-Remediation (Already Running)
Heap pruner runs every 24 hours:
- Keeps 3 newest snapshots
- Deletes snapshots >7 days old
- Reclaims ~110MB

### Step 2: Manual Check (If Needed)
```powershell
# Check disk usage details
.\scripts\render_disk_usage_windows.ps1 -Detailed

# Manual heap cleanup (if urgent)
.\scripts\render_cleanup_heaps_windows.ps1 -Keep 2
```
```

---

## 📋 Project Phases & Timeline

### **Phase 1: Foundation Validation** (Week 1)
**Status:** 🟡 IN PROGRESS

**Tasks:**
1. **Dashboard Validation Engineer** — Import and test unified dashboard
2. **Metrics Integration Engineer** — Audit metric coverage gaps

**Exit Criteria:**
- [ ] Dashboard imported and all panels show data
- [ ] Metric coverage audit complete with gap list
- [ ] Any blocking issues documented and prioritized

---

### **Phase 2: Alert & Query Optimization** (Week 2)
**Status:** ⏳ WAITING FOR PHASE 1

**Tasks:**
1. **Alert Architect** — Create comprehensive alert rules
2. **Query Optimization Specialist** — Optimize all dashboard queries
3. **Metrics Integration Engineer** — Fill any identified metric gaps

**Exit Criteria:**
- [ ] Alert rules created and tested
- [ ] All queries execute in <1s
- [ ] All metric gaps filled (or documented as won't-fix)
- [ ] Discord webhook notifications working

---

### **Phase 3: Automation & Self-Healing** (Week 3)
**Status:** ⏳ WAITING FOR PHASE 2

**Tasks:**
1. **Automation Engineer** — Implement auto-remediation service
2. **Alert Architect** — Configure alert-to-remediation workflows
3. **Dashboard Validation Engineer** — Add auto-remediation counters to dashboard

**Exit Criteria:**
- [ ] Auto-remediation service deployed
- [ ] At least 5 common issues auto-heal
- [ ] Dashboard shows auto-remediation stats
- [ ] Staging tests pass

---

### **Phase 4: Documentation & Handoff** (Week 4)
**Status:** ⏳ WAITING FOR PHASE 3

**Tasks:**
1. **Documentation Specialist** — Create all operator guides
2. **All Specialists** — Review documentation for accuracy
3. **Dashboard Validation Engineer** — Create operator training session

**Exit Criteria:**
- [ ] All operator documentation complete
- [ ] Operator training delivered
- [ ] Operator can respond to alerts independently
- [ ] System handoff complete

---

## 🎯 Success Criteria (System "Perfected")

The observability system is considered **production-ready** when:

### **For the Operator:**
✅ Operator receives Discord alerts for critical issues  
✅ Operator can open Grafana dashboard and understand status at a glance  
✅ Operator has clear playbook for each alert type (what to do)  
✅ Operator can access help docs without asking developers  
✅ **90% of common issues auto-heal without operator intervention**

### **For the System:**
✅ All 25 dashboard panels show data  
✅ All queries execute in <1s  
✅ Alerts fire reliably and accurately  
✅ No false positive alerts (>95% accuracy)  
✅ Auto-remediation handles memory pressure, disk full, queue backpressure  
✅ Circuit breakers prevent cascading failures  
✅ Zero ongoing maintenance required

### **For the Code:**
✅ 100% metric coverage (all dashboard metrics exist in code)  
✅ Metric naming consistent (all use `ig_` prefix)  
✅ No deprecated metrics referenced  
✅ Tests pass for all instrumentation  
✅ Documentation matches implementation

---

## 📊Current Status (As of 2025-12-28)

### ✅ **Completed (Foundation Ready):**
- ✅ Unified system health dashboard created (25 panels, 5 sections)
- ✅ Human-friendly panel descriptions and thresholds
- ✅ Import guide and integration plan
- ✅ Metric naming audit (ig_ prefix confirmed correct)
- ✅ ROUTER.md documentation updated
- ✅ **Prometheus metrics instrumented** (50+ metrics in `src/services/prometheus-metrics.ts`)
- ✅ **Discord webhook integration exists** (`ALERT_WEBHOOK_URL` in `src/config/env.ts`)
- ✅ **Auto-remediation working** (heap pruner runs daily, circuit breakers active)
- ✅ **Grafana/Prometheus/Loki running** (localhost:3000/9090/3100)

### 🟡 **Partially Complete (Needs Specialist Work):**
- 🟡 **Metrics export to Prometheus** — Instrumented but need to verify scraping works
- 🟡 **Auto-remediation service** — Heap pruner exists, need unified service
- 🟡 **Circuit breakers** — Implemented in database workers, need dashboard visibility

### ⏳ **Not Started (Specialist Tasks):**
- ❌ Alert rules creation (`ops/grafana-unified-alert-rules.yml` missing)
- ❌ Dashboard import validation (no one has tested if panels show data)
- ❌ Query optimization (queries untested for performance)
- ❌ Metric coverage audit (need to verify all 50+ metrics export correctly)
- ❌ Unified auto-remediation service (heap pruner isolated, need EventBus integration)
- ❌ Operator documentation (no quick-start guide exists)
- ❌ Grafana-to-Discord alert routing (webhook exists but not configured in Grafana)

### 🔍 **Reality Check:**

**What We Have:**
```typescript
// Metrics instrumented (src/services/prometheus-metrics.ts)
ig_memory_rss                  // ✅ Memory usage
ig_disk_used_percent           // ✅ Disk usage
ig_errors_total                // ✅ Error counter
ig_heap_snapshots_pruned_total // ✅ Auto-remediation counter
ig_uptime_seconds              // ✅ Uptime
ig_battles_total               // ✅ Game metrics
// ... 44 more metrics
```

**What's Missing:**
```yaml
# ops/grafana-unified-alert-rules.yml (DOES NOT EXIST)
# docs/operations-bible/operator-quick-start.md (DOES NOT EXIST)
# ops/DASHBOARD-VALIDATION-REPORT.md (DOES NOT EXIST)
# src/services/auto-remediation.ts (DOES NOT EXIST - only heap pruner)
```

**Critical Path:**
1. **Dashboard Validation Engineer** must verify metrics are actually scraped by Prometheus
2. **Alert Architect** must create alert rules YAML and configure Grafana contact points
3. **Automation Engineer** must create unified auto-remediation service
4. **Documentation Specialist** must write operator guides

**Blocker Risk:** If Prometheus isn't scraping metrics from `src/services/prometheus-metrics.ts`, dashboard will show "No Data" — Dashboard Validation Engineer MUST verify this first!

---

## 🔧 Specialist Onboarding Checklist

When a specialist joins, they should:

### **Step 1: Read Foundation Documents**
- [ ] `ops/UNIFIED-DASHBOARD-IMPORT-GUIDE.md` — Dashboard overview
- [ ] `ops/DASHBOARD-INTEGRATION-PLAN.md` — Integration plan
- [ ] `ops/OBSERVABILITY-DELIVERY-SUMMARY.md` — What's been delivered
- [ ] `src/services/prometheus-metrics.ts` — Current metric definitions

### **Step 2: Verify Local Environment**
```powershell
# Check Grafana running
curl.exe "http://localhost:3000"

# Check Prometheus running
curl.exe "http://localhost:9090/-/healthy"

# Check Loki running
curl.exe "http://localhost:3100/ready"

# Check metrics available
curl.exe "http://localhost:9090/api/v1/label/__name__/values"
```

### **Step 3: Review Relevant Code**
- **Alert Architect** → `ops/grafana-*.json` files
- **Dashboard Engineer** → `ops/grafana-unified-system-health.json`
- **Query Specialist** → PromQL/LogQL queries in dashboard JSON
- **Metrics Engineer** → `src/services/prometheus-metrics.ts`
- **Automation Engineer** → `src/workers/`, `src/services/monitoring/`
- **Documentation Specialist** → `docs/operations-bible/`

### **Step 4: Claim Your Tasks**
- [ ] Review task list in this document
- [ ] Check dependencies (are prerequisite tasks complete?)
- [ ] Create tracking issue in GitHub (optional)
- [ ] Start work and update status here

---

## 📞 Communication & Coordination

### **Status Updates:**
Each specialist should update this document with progress:
- Update phase status (🟡 IN PROGRESS, ✅ COMPLETE)
- Check off exit criteria as completed
- Document blockers or dependencies

### **Blocking Issues:**
If blocked, document here:
```markdown
### Blocker Log
- **Date:** YYYY-MM-DD
- **Specialist:** [Role]
- **Issue:** [Description]
- **Impact:** [What's blocked]
- **Resolution:** [How it was resolved]
```

### **Inter-Specialist Dependencies:**
- **Alert Architect** depends on **Metrics Engineer** (need complete metric list)
- **Query Specialist** works in parallel with **Dashboard Engineer**
- **Automation Engineer** depends on **Alert Architect** (need alert rules first)
- **Documentation Specialist** is final phase (needs everything else done)

---

## 🎓 Knowledge Transfer Requirements

Before considering system "perfected", operator must demonstrate:

### **Operator Competency Checklist:**
- [ ] Can open Grafana dashboard
- [ ] Can interpret panel colors (green/yellow/orange/red)
- [ ] Understands what each section measures (game, db, resources, etc.)
- [ ] Can respond to Discord alert notification
- [ ] Knows where to find alert playbook
- [ ] Can perform basic troubleshooting from documentation
- [ ] Understands when to escalate vs when system auto-heals
- [ ] Can restart services if needed (only as last resort)

### **Training Deliverables:**
1. **30-minute dashboard walkthrough** (video or live)
2. **Alert response drill** (simulate 3 common alerts)
3. **Documentation review session** (ensure docs make sense to operator)
4. **Q&A session** (answer operator questions)

---

## 📈 Metrics for Success

Track these KPIs to measure "perfection":

### **Operational Metrics:**
- **Mean Time to Alert (MTTA):** <2 minutes from issue start
- **Mean Time to Resolution (MTTR):** <10 minutes for auto-healed issues
- **Alert Accuracy:** >95% (alerts are real issues)
- **Auto-Heal Success Rate:** >90% (fixes work without operator)
- **Operator Satisfaction:** Operator feedback after 2 weeks

### **Technical Metrics:**
- **Dashboard Load Time:** <2 seconds
- **Query Execution Time:** <1 second per panel
- **Alert Rule Evaluation:** <30 seconds
- **Metric Collection Overhead:** <1% CPU/memory

---

## 🚀 Getting Started (For Specialists)

### **Priority Order:**
1. **START HERE:** Dashboard Validation Engineer — Import dashboard, verify it works
2. **START HERE:** Metrics Integration Engineer — Audit coverage gaps
3. **NEXT:** Alert Architect — Create alert rules
4. **NEXT:** Query Optimization Specialist — Optimize queries
5. **THEN:** Automation & Self-Healing Engineer — Implement auto-remediation
6. **FINAL:** Documentation & Training Specialist — Create operator guides

### **Quick Wins (First Week):**
- Import unified dashboard → See if panels show data
- Create 5 critical alert rules (memory, disk, errors, latency, queue)
- Write 1-page operator quick-start guide
- Test Discord webhook notification

### **Communication:**
Update this document as you complete tasks. Use git commits to track progress.

---

## 📝 Specialist Sign-Off

When your phase is complete, sign off here:

### **Phase 1 Validation:**
- [ ] **Dashboard Validation Engineer:** _________________________ (Date)
- [ ] **Metrics Integration Engineer:** _________________________ (Date)

### **Phase 2 Optimization:**
- [ ] **Alert Architect:** _________________________ (Date)
- [ ] **Query Optimization Specialist:** _________________________ (Date)

### **Phase 3 Automation:**
- [ ] **Automation & Self-Healing Engineer:** _________________________ (Date)

### **Phase 4 Handoff:**
- [ ] **Documentation & Training Specialist:** _________________________ (Date)
- [ ] **Operator Competency Verified:** _________________________ (Date)

---

## ✅ Final Acceptance Criteria

System is **PRODUCTION-READY** when:

### 1. "I understand what I'm looking at" ⭐ VISUAL CLARITY IS #1
✅ **NO TECHNICAL JARGON** — All labels in plain English ("Memory Usage" not "ig_memory_rss")  
✅ **NO RAW JSON** — CLI outputs use clean sections and key-value pairs (`output-formatter.ts`)  
✅ **NO STACK TRACES** — Logs show summaries, errors are readable  
✅ **COLOR-CODED** — Dashboard and CLI use green/yellow/red (obvious meaning)  
✅ **VISUAL HIERARCHY** — Important info stands out, noise suppressed  
✅ **PLAIN-ENGLISH DESCRIPTIONS** — Every panel explains what it means and when to worry  
✅ **LOGICAL ORGANIZATION** — Sections flow naturally (Health → Game → DB → Resources)  
✅ **REDUCED LOG NOISE** — 85-90% less repetition (circuit breakers, Loki errors, duplicates)  
✅ **GLANCEABLE STATUS** — Operator knows system health in <5 seconds

### 2. "I know what to do when alerts fire"
✅ Alert messages are clear ("Memory usage above 90%" not "ig_memory_rss threshold breach")  
✅ Playbook exists with step-by-step actions  
✅ Auto-remediation usually fixes issues automatically  
✅ Escalation path documented if manual intervention needed

### 3. "The system fixes most issues automatically"
✅ Memory pressure → Auto GC triggered  
✅ Disk full → Auto prune heap snapshots  
✅ Queue backpressure → Auto drain old messages  
✅ Circuit breaker → Auto block and recover  
✅ 90%+ success rate for common issues

### 4. "I feel confident using this without developer help"
✅ Quick-start guide explains dashboard in 1 page (plain English)  
✅ Alert playbooks have exact commands to run  
✅ Common issues guide covers FAQs  
✅ Training session delivered successfully  
✅ Operator can troubleshoot without contacting developers

**When all 4 criteria met → MISSION ACCOMPLISHED** 🎉

---

**Status:** ✅ SPEC COMPLETE — Fully Detailed with Examples & Validation  
**Next Action:** Assign specialists to roles and begin Phase 1  
**Owner:** Project Lead (coordinates specialist work)  
**Operator:** End user (receives final working system)

---

## 🔍 Investigation & Discovery Complete

**Infrastructure Analysis:**
- ✅ **Grafana 10.x** — Ready at localhost:3000
- ✅ **Prometheus** — Metrics at localhost:9090 (50+ metrics with `ig_` prefix)
- ✅ **Loki** — Logs at localhost:3100
- ✅ **Discord Webhook** — Configured via `ALERT_WEBHOOK_URL` env var (already integrated in `src/bot/main.ts`)
- ✅ **Auto-Remediation** — Heap pruner exists (`src/workers/heap-pruner.ts`), circuit breakers implemented
- ✅ **Metrics System** — `src/services/prometheus-metrics.ts` (1,238 lines, comprehensive instrumentation)

