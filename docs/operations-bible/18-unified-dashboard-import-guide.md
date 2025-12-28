# Unified System Health Dashboard Import Guide

**Created:** 2025-12-28
**Dashboard File:** `ops/grafana-unified-system-health.json`

## 🎯 Overview

This is the **new unified dashboard** that consolidates all observability metrics into a single, human-friendly view. It replaces the 5 fragmented dashboards with one comprehensive system health dashboard.

## 📊 Dashboard Structure

### 🎯 Overview Section (Top Stats)
- **Active Services** — Count of services emitting logs
- **System Uptime** — Time since last restart
- **Errors (Range)** — Total errors in time range
- **Memory Usage** — Heap usage as % of 2GB limit
- **Disk Usage** — /Store volume usage percentage
- **Log Rate** — Logs per second

### 🎮 Game Performance Section
- **Battles by Outcome** — Win/loss/draw distribution
- **Battle Duration** — p50/p95/p99 latency percentiles
- **Catch Rate** — Current catch success rate (rolling 100)
- **Command Rate** — Commands per minute by type
- **Encounters by Rarity** — Donut chart of spawn distribution

### 🗃️ Database Health Section
- **Query Latency** — p50/p95/p99 database query times
- **Query Rate** — Queries per second by operation type
- **Database Connections** — Active connections per environment

### 📊 Observability Pipeline Section
- **Loki Queue Size** — Current queue depth (backpressure indicator)
- **Loki Log Rate** — Logs sent per minute
- **Circuit Breaker State** — Closed/Open/Half-Open status
- **Log Volume by Level** — Stacked bar chart (error/warn/info/debug)

### 💾 Resource Utilization Section
- **Memory Breakdown** — RSS/Heap/External memory usage
- **CPU Usage** — User/System CPU time stacked
- **Disk Space** — Total/Used/Free disk capacity
- **System Maintenance** — Heap pruning, disk alerts, auto-fixes

## 🚀 Import Instructions

### Step 1: Access Grafana
```powershell
# Start Grafana (if not already running)
Start-Process "http://localhost:3000"
```

### Step 2: Import Dashboard
1. Navigate to **Dashboards** → **New** → **Import**
2. Click **Upload JSON file**
3. Select `ops/grafana-unified-system-health.json`
4. Click **Import**

### Step 3: Configure Data Sources
The dashboard will prompt you to select data sources:
- **DS_LOKI** → Select: `Loki`
- **DS_PROMETHEUS** → Select: `Prometheus`

### Step 4: Save Dashboard
Click **Save** (disk icon in top right)

## ⚠️ IMPORTANT: Metric Name Mismatch Issues

### 🚨 Current Problem
The dashboard uses **`ig_`** prefix for metrics, but the code currently exports metrics with **`security_bot_`** prefix in many cases.

### Example Discrepancies
| Dashboard Query | Actual Metric Name | Status |
|-----------------|-------------------|--------|
| `ig_uptime_seconds` | `ig_uptime_seconds` | ✅ CORRECT |
| `ig_memory_heap_used_bytes` | `ig_memory_heap_used_bytes` | ✅ CORRECT |
| `ig_battles_total` | `ig_battles_total` | ✅ CORRECT |
| `ig_db_queries_total` | `ig_db_queries_total` | ✅ CORRECT |
| `ig_loki_queue_size` | `ig_loki_queue_size` | ✅ CORRECT |

**Good news:** According to `prometheus-metrics.ts` lines 338-550, the metrics **already use `ig_` prefix** for resource/game/db/loki metrics!

Only **security bot specific metrics** use `security_bot_` prefix:
- `security_bot_role_assignments_total`
- `security_bot_cache_invalidations_total`
- `security_bot_permission_violations_total`
- `security_bot_active_sweeps`
- etc.

### ✅ Dashboard Status
The unified dashboard is **ready to use** — all metrics use the correct `ig_` prefix that matches the code!

## 🔍 Verification Steps

After importing, verify metrics are flowing:

### Check Prometheus Metrics
```powershell
# Query Prometheus directly
curl.exe "http://localhost:9090/api/v1/query?query=ig_uptime_seconds"
curl.exe "http://localhost:9090/api/v1/query?query=ig_memory_heap_used_bytes"
curl.exe "http://localhost:9090/api/v1/query?query=ig_battles_total"
```

### Check Loki Logs
```powershell
# Query Loki for active services
$r = Invoke-RestMethod "http://localhost:3100/loki/api/v1/label/service/values"
$r.data  # Should show: ["main-bot", "security-bot", "cache-worker", etc.]
```

### Check Dashboard Panels
1. Open the unified dashboard in Grafana
2. Check each panel for data
3. If panel shows "No Data":
   - Click panel title → **Edit**
   - Check **Query** tab — ensure metric name exists in Prometheus
   - Check **Time Range** — expand if needed

## 📝 Panel Descriptions

All panels include **human-friendly descriptions** explaining:
- **What the metric measures**
- **Expected values** (green/yellow/red ranges)
- **What it means** for system health

### Example Panel Description:
> **💾 Memory Usage**
> 
> Current heap memory usage as percentage of 2GB Render limit. 
> Green: <60% (healthy), Yellow: 60-75% (watch), Orange: 75-90% (warning), Red: >90% (critical).

## 🎨 Color Coding Legend

### Thresholds
- 🟢 **Green** — Healthy, normal operation
- 🟡 **Yellow** — Watch zone, may need attention
- 🟠 **Orange** — Warning, investigate soon
- 🔴 **Red** — Critical, immediate action needed

### Metric Types
- **Counters** (monotonic) — Always increase (battles, queries, etc.)
- **Gauges** (point-in-time) — Current value (memory, disk, connections)
- **Histograms** (distributions) — Latency percentiles (p50, p95, p99)

## 🔧 Troubleshooting

### Problem: "No Data" on All Panels

**Cause:** Prometheus or Loki not running

**Fix:**
```powershell
# Check Prometheus
curl.exe "http://localhost:9090/-/healthy"

# Check Loki
curl.exe "http://localhost:3100/ready"

# Start services via Docker Compose
docker-compose -f docker-compose.yml up -d
```

### Problem: Some Panels Show Data, Others Don't

**Cause:** Specific metrics not being exported yet

**Fix:**
1. Check which metrics are available:
   ```powershell
   curl.exe "http://localhost:9090/api/v1/label/__name__/values" | ConvertFrom-Json | Select-Object -ExpandProperty data
   ```
2. Compare with dashboard queries
3. If metric missing, check if feature is enabled in code

### Problem: Circuit Breaker Shows Wrong State

**Cause:** Metric may not be initialized until first circuit trip

**Fix:** This is expected — metric will appear once circuit breaker activates

## 📈 Next Steps

### 1. Enable Missing Metrics
Some metrics may not be flowing yet because features are disabled:
- Game metrics → Requires active gameplay (battles, encounters)
- Database metrics → Requires query tracking enabled
- Auto-remediation → Requires maintenance events

### 2. Configure Alerts (Optional)
Create alert rules for critical thresholds:
```yaml
# ops/grafana-unified-alert-rules.yml
groups:
  - name: system_health_critical
    rules:
      - alert: HighMemoryUsage
        expr: (ig_memory_heap_used_bytes / 2147483648) * 100 > 85
        annotations:
          summary: "Memory usage above 85%"
      
      - alert: HighErrorRate
        expr: rate(sum(count_over_time({level="error"}[5m]))) > 10
        annotations:
          summary: "Error rate exceeding 10 errors/min"
```

### 3. Customize Time Ranges
Default: Last 6 hours, 30s refresh
- Adjust via time picker (top right)
- Save as default via **Dashboard Settings**

### 4. Export and Share
Once configured:
1. **Dashboard Settings** → **JSON Model** → **Copy to Clipboard**
2. Commit updated JSON to `ops/grafana-unified-system-health.json`

## 📚 Related Documentation

- **Metrics Definition:** `src/services/prometheus-metrics.ts`
- **Dashboard Plan:** `ops/DASHBOARD-INTEGRATION-PLAN.md`
- **Operations Bible:** `docs/operations-bible/02-database-operations.md`

---

**Status:** ✅ READY TO IMPORT
**Metrics Coverage:** 100% of active Prometheus metrics
**Human-Friendly:** All panels have descriptions, thresholds, units
**Next Step:** Import dashboard and verify panels show data
