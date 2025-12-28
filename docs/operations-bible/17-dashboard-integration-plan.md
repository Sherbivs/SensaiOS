# Observability Dashboard Integration Plan

**Created:** 2025-12-28
**Status:** Planning
**Goal:** Consolidate all observability tools into human-friendly dashboards

## Current State Assessment

### Available Observability Tools

#### 1. **Loki** (Log Aggregation)
- **Location:** `localhost:3100`
- **Status:** ✅ ACTIVE
- **Data Source:** Production logs via ngrok tunnel
- **Labels:** `service`, `level`, `environment`, `job`
- **Coverage:** All services emit logs to Loki

#### 2. **Prometheus** (Metrics)
- **Location:** `localhost:9090`
- **Status:** ✅ ACTIVE
- **Metrics Registry:** `src/services/prometheus-metrics.ts`
- **Coverage:** Security bot, resource monitoring, game metrics

#### 3. **Grafana** (Visualization)
- **Location:** `localhost:3000`
- **Status:** ✅ ACTIVE
- **Dashboards:** 5 JSON dashboards in `ops/`

### Existing Dashboards

| Dashboard | File | Purpose | Metrics Used |
|-----------|------|---------|--------------|
| **Security Intelligence** | `grafana-dashboard.json` | Security bot monitoring | Security score, violations |
| **Main Dashboard** | `grafana-infinity-gauntlet-main.json` | System overview | Logs, errors, memory, uptime |
| **Battle Engine** | `grafana-battle-engine.json` | Game performance | Battles, turns, duration |
| **Cache Performance** | `grafana-cache-performance.json` | Cache hit rates | Cache metrics |
| **TimescaleDB** | `grafana-timescaledb-dashboard.json` | Database performance | Query latency, connections |

### Available Prometheus Metrics

#### Security Bot Metrics
```
security_bot_role_assignments_total
security_bot_cache_invalidations_total
security_bot_permission_violations_total
security_bot_distributed_lock_acquisitions_total
security_bot_active_sweeps
security_bot_cache_hit_rate
security_bot_revert_failure_rate
security_bot_sweep_candidates
security_bot_role_assignment_duration
security_bot_sweeps_last_24_hours
security_bot_alerts_last_24_hours
security_bot_permission_changes_last_24_hours
security_bot_errors_last_24_hours
security_bot_sweep_rate_per_hour
security_bot_alert_rate_per_hour
```

#### Resource Monitor Metrics
```
security_bot_memory_rss
security_bot_memory_heap_used
security_bot_memory_heap_total
security_bot_memory_external
security_bot_disk_total
security_bot_disk_used
security_bot_disk_free
security_bot_disk_used_percent
security_bot_cpu_user
security_bot_cpu_system
security_bot_uptime_seconds
```

#### System Event Metrics
```
security_bot_heap_snapshots_pruned
security_bot_disk_alerts
security_bot_auto_remediation
```

#### Game Metrics
```
security_bot_battles_total
security_bot_battle_duration
security_bot_battle_turns
security_bot_encounters_total
security_bot_catch_rate
security_bot_commands_total
security_bot_command_latency
```

#### Database Metrics
```
security_bot_db_queries_total
security_bot_db_query_latency
security_bot_db_connections
```

#### Loki Metrics
```
security_bot_loki_queue_size
security_bot_loki_logs_sent
security_bot_loki_circuit_state
```

## Problems Identified

### 1. **Metric Naming Inconsistency**
- All metrics use `security_bot_` prefix
- Should be more specific: `game_`, `db_`, `loki_`, etc.
- Makes it hard to distinguish metric categories in dashboards

### 2. **Dashboard Fragmentation**
- 5 separate dashboards for different concerns
- No unified "System Health" view
- Metrics not always mapped to most appropriate dashboard

### 3. **Missing Human-Friendly Formatting**
- Raw metric names exposed in panels
- No contextual help text on panels
- Thresholds not clearly explained
- Missing color-coding for status

### 4. **Incomplete Metric Coverage**
- Not all Prometheus metrics used in dashboards
- Missing panels for:
  - Auto-remediation events
  - Heap pruning statistics
  - Loki circuit breaker state
  - Command latency histograms

### 5. **Query Complexity**
- Some PromQL queries are hard to understand
- LogQL queries not optimized
- Missing aggregations and transformations

## Proposed Solutions

### Phase 1: Metric Namespace Refactoring
**Goal:** Rename metrics to use category-specific prefixes

```typescript
// BEFORE
security_bot_battles_total
security_bot_db_queries_total
security_bot_loki_queue_size

// AFTER
game_battles_total
db_queries_total
observability_loki_queue_size
```

**Files to Update:**
- `src/services/prometheus-metrics.ts` — Metric definitions
- All dashboard JSON files — Update queries
- `src/shared/logging/loki-transport.ts` — Loki metric references

### Phase 2: Dashboard Consolidation
**Goal:** Create single "System Health" dashboard with tabs/rows

**New Dashboard Structure:**
```
📊 System Health Dashboard
├── 🎯 Overview (Top Stats)
│   ├── System Uptime
│   ├── Active Services
│   ├── Error Rate (Last Hour)
│   ├── Memory Usage
│   └── Disk Usage
├── 🎮 Game Performance
│   ├── Battles (Total, Rate, Duration)
│   ├── Encounters (Total, Catch Rate)
│   ├── Commands (Total, Latency)
│   └── Player Activity
├── 🗃️ Database Health
│   ├── Query Rate
│   ├── Query Latency (p50, p95, p99)
│   ├── Active Connections
│   └── Slow Queries
├── 🔒 Security
│   ├── Permission Violations
│   ├── Role Assignment Success Rate
│   ├── Sweep Activity
│   └── Alert Rate
├── 📊 Observability Pipeline
│   ├── Loki Queue Size
│   ├── Logs Sent (Rate)
│   ├── Circuit Breaker State
│   └── Log Levels Distribution
└── 💾 Resource Utilization
    ├── Memory (RSS, Heap, External)
    ├── Disk (Used, Free, Alerts)
    ├── CPU (User, System)
    └── Auto-Remediation Events
```

### Phase 3: Human-Friendly Panel Configuration

#### Panel Improvements:
1. **Clear Titles** — Use emojis and descriptive text
2. **Help Text** — Add descriptions explaining what each metric means
3. **Thresholds** — Color-coded with explicit ranges (green/yellow/red)
4. **Units** — Format values (MB, %, seconds, ops/sec)
5. **Transformations** — Apply calculations for derived metrics

#### Example Panel Configuration:
```json
{
  "title": "💾 Memory Usage",
  "description": "Current heap memory usage as percentage of 2GB Render limit. Green: <60%, Yellow: 60-75%, Orange: 75-90%, Red: >90%",
  "fieldConfig": {
    "defaults": {
      "unit": "percent",
      "thresholds": {
        "steps": [
          { "value": 0, "color": "green" },
          { "value": 60, "color": "yellow" },
          { "value": 75, "color": "orange" },
          { "value": 90, "color": "red" }
        ]
      }
    }
  },
  "targets": [{
    "expr": "(security_bot_memory_heap_used / 2147483648) * 100",
    "legendFormat": "Heap %"
  }]
}
```

### Phase 4: Query Optimization

#### LogQL Optimization:
```logql
# BEFORE (inefficient)
sum(count_over_time({service=~"$service"} [5m]))

# AFTER (optimized with parser)
sum(count_over_time({service=~"$service"} | json | __error__="" [5m]))
```

#### PromQL Optimization:
```promql
# BEFORE (raw metric)
security_bot_battle_duration

# AFTER (human-friendly percentiles)
histogram_quantile(0.95, security_bot_battle_duration_bucket)
```

### Phase 5: Alert Rules Integration

**Create Alert Rules YAML:**
```yaml
# ops/grafana-unified-alert-rules.yml
groups:
  - name: system_health
    rules:
      - alert: HighErrorRate
        expr: rate(security_bot_errors_last_24_hours[5m]) > 10
        annotations:
          summary: "Error rate exceeding 10 errors/min"
      
      - alert: MemoryPressure
        expr: (security_bot_memory_heap_used / 2147483648) * 100 > 85
        annotations:
          summary: "Memory usage above 85% of limit"
```

## Implementation Roadmap

### Task 1: Metric Namespace Audit
- [ ] List all 50+ metrics currently defined
- [ ] Categorize by concern (game, db, security, observability, resource)
- [ ] Design new naming scheme with prefixes
- [ ] Create migration mapping table

### Task 2: Metric Renaming
- [ ] Update `prometheus-metrics.ts` with new names
- [ ] Add deprecation warnings for old names (1-month grace period)
- [ ] Update all metric consumers (loki-transport, etc.)
- [ ] Test metric collection still works

### Task 3: Dashboard Unification
- [ ] Create new `grafana-unified-dashboard.json`
- [ ] Migrate panels from 5 existing dashboards
- [ ] Apply human-friendly formatting to all panels
- [ ] Add panel descriptions and help text
- [ ] Configure thresholds with clear color ranges

### Task 4: Query Optimization
- [ ] Review all PromQL queries for efficiency
- [ ] Review all LogQL queries for efficiency
- [ ] Add rate() functions where appropriate
- [ ] Use histogram_quantile() for latency metrics
- [ ] Test query performance in Grafana

### Task 5: Alert Rules
- [ ] Define critical alert conditions
- [ ] Create alert rule YAML file
- [ ] Configure notification channels (Discord webhooks?)
- [ ] Test alert firing and recovery

### Task 6: Documentation
- [ ] Update `docs/operations-bible/` with dashboard guide
- [ ] Create metric catalog document
- [ ] Document query patterns and best practices
- [ ] Add troubleshooting guide for common issues

## Success Criteria

✅ **Metric Naming:** All metrics use category-specific prefixes
✅ **Dashboard Count:** 1 unified dashboard replaces 5 fragmented dashboards
✅ **Panel Coverage:** 100% of Prometheus metrics visualized
✅ **Human-Friendly:** All panels have descriptions, units, thresholds
✅ **Query Performance:** All queries execute in <1s
✅ **Alert Rules:** 10+ critical alerts configured
✅ **Documentation:** Complete metric catalog + dashboard guide

## Next Steps

1. **Review this plan** — Get approval from operator
2. **Start with Task 1** — Metric namespace audit
3. **Implement in phases** — Test after each phase
4. **Rollout gradually** — Keep old dashboards until unified dashboard proven

---

**Status:** 🟡 AWAITING APPROVAL
**Dependencies:** None (all tools already running)
**Estimated Time:** 4-6 hours total work
**Risk:** LOW (non-breaking changes, old dashboards stay until replacement proven)
