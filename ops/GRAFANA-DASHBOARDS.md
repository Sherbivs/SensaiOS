# Grafana Dashboards — Infinity Gauntlet

> **Created:** 2025-12-28  
> **Status:** AUTHORITATIVE  
> **Purpose:** Document all Grafana dashboard files, their purpose, and maintenance guidelines  
> **Location:** `ops/grafana-*.json`

---

## 📋 Dashboard Inventory

| Dashboard File | Purpose | Data Source | Priority |
|----------------|---------|-------------|----------|
| `grafana-unified-system-health.json` | Overall system health | Loki + Prometheus | P0 |
| `grafana-infinity-gauntlet-main.json` | Primary operations dashboard | Loki | P0 |
| `grafana-battle-engine.json` | Battle system metrics | Loki | P1 |
| `grafana-cache-performance.json` | Cache hit rates, memory | Loki + Prometheus | P1 |
| `grafana-timescaledb-dashboard.json` | Database performance | Prometheus | P2 |
| `grafana-dashboard.json` | Legacy/general dashboard | Loki | P3 |

---

## 1. Dashboard Design Principles

### 1.1 The Four Golden Signals (Google SRE)

Every dashboard SHOULD include panels for:

| Signal | Definition | Example Metrics |
|--------|------------|-----------------|
| **Latency** | Time to serve requests | `command_duration_seconds`, `query_latency_ms` |
| **Traffic** | Demand on system | `commands_total`, `requests_per_second` |
| **Errors** | Rate of failed requests | `errors_total`, `error_rate` |
| **Saturation** | How "full" the system is | `memory_usage_percent`, `queue_depth` |

### 1.2 Panel Hierarchy

```
Dashboard Layout (Top → Bottom):
├── 🚨 Row 1: Alerts & Critical Status (RED metrics)
│   └── Active alerts, error rate, service health
├── 📊 Row 2: Key Performance Indicators
│   └── Latency (P50/P95/P99), throughput, success rate
├── 📈 Row 3: Resource Utilization
│   └── Memory, CPU, disk, connections
├── 🔍 Row 4: Detailed Metrics
│   └── Per-service breakdown, queue depths, cache stats
└── 📝 Row 5: Logs Panel (optional)
    └── Recent errors, filtered log stream
```

### 1.3 Time Range Guidelines

| Dashboard Type | Default Range | Auto-Refresh |
|----------------|---------------|--------------|
| Operational | 1 hour | 30 seconds |
| Debugging | 15 minutes | 10 seconds |
| Historical | 24 hours | 5 minutes |
| Capacity Planning | 7 days | Off |

---

## 2. Dashboard Documentation

### 2.1 Unified System Health (`grafana-unified-system-health.json`)

**Purpose:** Single-pane-of-glass for overall system status.

**Rows:**
| Row | Panels | Purpose |
|-----|--------|---------|
| 1 | Service Status Matrix | All 8 Render services: UP/DOWN |
| 2 | Error Rate, Latency P95 | Golden signals overview |
| 3 | Memory, CPU, Disk | Resource saturation |
| 4 | Active Connections, Queue Depth | Capacity indicators |

**Key Queries:**
```promql
# Service availability (simplified)
up{job="infinity-gauntlet"}

# Error rate
sum(rate(errors_total[5m])) / sum(rate(requests_total[5m]))

# Memory saturation
process_resident_memory_bytes / 2147483648  # / 2GB
```

**Alert Integration:** Links to `grafana-alert-rules-v2.yml`

---

### 2.2 Main Operations Dashboard (`grafana-infinity-gauntlet-main.json`)

**Purpose:** Primary daily operations view.

**Panels:**
| Panel | Type | Query |
|-------|------|-------|
| Bot Status | Stat | Gateway state |
| Commands/min | Graph | Rate of commands |
| Active Battles | Stat | Current battle count |
| Error Log Stream | Logs | `{level="error"}` |

**Usage:** First dashboard to check during incidents.

---

### 2.3 Battle Engine Dashboard (`grafana-battle-engine.json`)

**Purpose:** Game-specific battle system monitoring.

**Panels:**
| Panel | Type | Description |
|-------|------|-------------|
| Active Battles | Gauge | Concurrent battles |
| Turn Latency | Histogram | P50/P95/P99 turn resolution |
| Type Effectiveness | Bar | Distribution of super/not-very/immune |
| Battle Outcomes | Pie | Win/lose/forfeit/timeout |
| Battle Errors | Table | Recent battle failures |

**Domain-Specific Queries:**
```logql
# Battle turns
{service="bot"} | json | event_type="battle.turn"

# Super-effective moves
{service="bot"} | json | effectiveness="super_effective"

# Battle completions
{service="bot"} | json | event_type="battle.completed"
```

---

### 2.4 Cache Performance Dashboard (`grafana-cache-performance.json`)

**Purpose:** L1 cache and Discord.js cache monitoring.

**Panels:**
| Panel | Type | Description |
|-------|------|-------------|
| Cache Hit Rate | Gauge | Target: >90% |
| Cache Memory | Graph | MB used over time |
| Cache Entries | Stat | Pokemon + moves count |
| Eviction Rate | Graph | Entries evicted/min |
| Discord.js Cache | Table | Guilds, users, messages |

**Key Thresholds:**
- Hit Rate < 80%: ⚠️ Warning
- Hit Rate < 60%: 🔴 Critical
- Memory > 18 MB (90% of 20 MB): ⚠️ Warning

---

### 2.5 TimescaleDB Dashboard (`grafana-timescaledb-dashboard.json`)

**Purpose:** Database performance and query analysis.

**Panels:**
| Panel | Type | Description |
|-------|------|-------------|
| Query Latency | Histogram | P50/P95/P99 |
| Connections | Gauge | Active vs idle |
| Queries/sec | Graph | Read vs write rate |
| Slow Queries | Table | Queries > 500ms |
| Database Size | Gauge | GB used |

**Alert Thresholds:**
- Query latency P95 > 500ms: ⚠️ Warning
- Connections > 80% pool: ⚠️ Warning
- Database size > 400 MB (80% of 500 MB): 🔴 Critical

---

## 3. Alert Rules Integration

### 3.1 Alert Files

| File | Purpose | Severity Levels |
|------|---------|-----------------|
| `grafana-alert-rules-v2.yml` | Primary alert definitions | Critical, Warning, Info |
| `grafana-loki-alert-rules.yml` | Log-based alerts | Error patterns |
| `prometheus-alerts.yml` | Metric-based alerts | Resource thresholds |

### 3.2 Alert Lifecycle

```
Alert Trigger → Pending (wait period) → Firing → Notification
                    ↓                      ↓
              Resolved (if condition clears)
```

### 3.3 Runbook Links

**Every alert MUST include a runbook annotation:**

```yaml
annotations:
  summary: "High error rate detected"
  description: "Error rate is {{ $value | printf \"%.2f\" }}%"
  runbook_url: "https://github.com/Sherbivs/Infinity-Gauntlet/blob/main/docs/operations-bible/08-recovery-runbook.md#high-error-rate"
```

---

## 4. Dashboard Maintenance

### 4.1 Change Process

1. **Export current JSON** before making changes
2. **Document changes** in commit message
3. **Test in dev environment** if possible
4. **Update this documentation** if panels change

### 4.2 Version Control

All dashboard JSONs are committed to `ops/`. Changes should be:
- Reviewed before commit
- Tested against live data source
- Documented in this file

### 4.3 Backup Strategy

```powershell
# Export all dashboards
$timestamp = Get-Date -Format "yyyy-MM-dd"
Copy-Item ops/grafana-*.json "backups/grafana-$timestamp/"
```

---

## 5. Panel Templates

### 5.1 Standard Stat Panel

```json
{
  "type": "stat",
  "title": "Active Battles",
  "targets": [{
    "expr": "battle_active_count",
    "refId": "A"
  }],
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "steps": [
          { "color": "green", "value": null },
          { "color": "yellow", "value": 50 },
          { "color": "red", "value": 100 }
        ]
      }
    }
  }
}
```

### 5.2 Standard Graph Panel

```json
{
  "type": "timeseries",
  "title": "Commands per Minute",
  "targets": [{
    "expr": "sum(rate(commands_total[1m]))",
    "legendFormat": "Commands/min",
    "refId": "A"
  }],
  "fieldConfig": {
    "defaults": {
      "unit": "reqps"
    }
  }
}
```

### 5.3 Standard Log Panel

```json
{
  "type": "logs",
  "title": "Recent Errors",
  "targets": [{
    "expr": "{level=\"error\"}",
    "refId": "A"
  }],
  "options": {
    "showTime": true,
    "sortOrder": "Descending"
  }
}
```

---

## 6. Troubleshooting

### 6.1 No Data in Panel

1. Check data source connectivity
2. Verify time range includes data
3. Check query syntax in Explore view
4. Verify labels exist in data

### 6.2 Dashboard Won't Load

1. Check JSON syntax validity
2. Verify data source UID matches
3. Check panel plugin versions
4. Try importing fresh copy

### 6.3 Alerts Not Firing

1. Check alert rule syntax
2. Verify evaluation interval
3. Check notification channel
4. Review alert state in Alerting UI

---

## 7. Import Instructions

### 7.1 First-Time Setup

1. Start local Loki stack: `docker-compose -f docker-compose.loki.yml up -d`
2. Open Grafana: http://localhost:3000
3. Navigate to: Dashboards → Import
4. Upload JSON files from `ops/grafana-*.json`
5. Select Loki data source when prompted

### 7.2 Update Existing Dashboard

1. Navigate to dashboard
2. Click gear icon → JSON Model
3. Replace with updated JSON
4. Click Save Dashboard

---

**Document Version:** 1.0  
**Cross-References:**
- [Loki Setup](../docs/operations-bible/loki-setup.md)
- [Monitoring](../docs/operations-bible/05-monitoring.md)
- [Telemetry Contract](../src/observability/TELEMETRY_CONTRACT.md)
