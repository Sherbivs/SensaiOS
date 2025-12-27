# Observability Documentation — Pokémon Infinity Gauntlet

Professional-grade observability infrastructure for production game monitoring.

## 📚 Documentation Index

| Document | Purpose | Audience |
|----------|---------|----------|
| [LogQL Query Library](logql-queries.md) | Pre-built queries for troubleshooting | Engineers, On-Call |
| [Dashboard Guide](#dashboard-inventory) | Dashboard overview and usage | Everyone |
| [Alert Runbook](#alert-response) | How to respond to alerts | On-Call |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PRODUCTION (Render)                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Main Bot    │  │  Security    │  │   Cache      │              │
│  │  Worker      │  │  Worker      │  │   Worker     │              │
│  │              │  │              │  │              │              │
│  │  scopedLog() │  │  scopedLog() │  │  scopedLog() │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                  │                       │
│         └─────────────────┼──────────────────┘                       │
│                           │                                          │
│                    ┌──────▼──────┐                                   │
│                    │   Envelope   │                                   │
│                    │   System     │                                   │
│                    │  (console)   │                                   │
│                    └──────┬──────┘                                   │
│                           │                                          │
│                    ┌──────▼──────┐                                   │
│                    │ Loki Backend│                                   │
│                    │  (batched)  │                                   │
│                    └──────┬──────┘                                   │
│                           │                                          │
└───────────────────────────┼──────────────────────────────────────────┘
                            │ HTTP POST (ngrok tunnel)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     LOCAL OBSERVABILITY STACK                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │    Loki      │  │   Grafana    │  │  Prometheus  │              │
│  │   :3100      │──▶│    :3000     │◀──│    :9090     │              │
│  │              │  │              │  │              │              │
│  │  Log Storage │  │  Dashboards  │  │   Metrics    │              │
│  └──────────────┘  │  Alerting    │  │   Storage    │              │
│                    │  Explore     │  │              │              │
│                    └──────────────┘  └──────────────┘              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Dashboard Inventory

### 1. Main Operations Dashboard

**File:** `ops/grafana-infinity-gauntlet-main.json`  
**UID:** `infinity-gauntlet-main`  
**URL:** http://localhost:3000/d/infinity-gauntlet-main

**Sections:**
- 🏥 **System Health Overview**: Active services, error rate, memory, uptime, log rate
- 📈 **Log Analytics**: Log volume by level, error rate over time
- 🔍 **Service Breakdown**: Top errors, logs by service, errors by service
- 💻 **Resource Monitoring**: Memory timeseries, disk gauge, CPU timeseries
- 🎮 **Game Metrics**: Battles/encounters, command rate, catch rate
- 📡 **Observability Pipeline**: Loki queue depth, logs sent rate
- 📜 **Live Logs**: Streaming log panel with JSON parsing

**Variables:**
- `$service` — Filter by service (multi-select)
- `$level` — Filter by log level (multi-select)

---

### 2. Battle Engine Dashboard

**File:** `ops/grafana-battle-engine.json`  
**UID:** `infinity-gauntlet-battle`  
**URL:** http://localhost:3000/d/infinity-gauntlet-battle

**Sections:**
- ⚔️ **Battle Overview**: Total battles, started, completed, errors, avg duration, avg turns
- 📈 **Battle Activity**: Timeline (stacked), duration distribution histogram
- 🎯 **Move Analytics**: Top 20 moves table, type effectiveness pie, battle effects
- 📜 **Battle Logs**: Live battle event stream

**Use Cases:**
- Monitor battle system health
- Analyze move usage patterns
- Debug battle engine errors
- Track battle duration anomalies

---

### 3. Cache Performance Dashboard

**File:** `ops/grafana-cache-performance.json`  
**UID:** `infinity-gauntlet-cache`  
**URL:** http://localhost:3000/d/infinity-gauntlet-cache

**Sections:**
- 🎯 **L1 Cache Performance**: Hit rate gauge, hits/misses stats, operations over time
- 💾 **Cache Memory & Size**: Entry count, memory usage (20MB limit), evictions/refreshes
- 🗄️ **Database Performance**: Query latency percentiles, query rate, active connections
- 🔧 **Write Buffer & Engine DB**: Queue size, buffer operations, engine DB stats
- 📜 **Cache Logs**: Live cache/database operation logs

**Thresholds:**
- Cache Hit Rate: <80% = Red, 80-95% = Yellow, >95% = Green
- Cache Memory: <15MB = Green, 15-18MB = Yellow, >18MB = Red
- Queue Size: <7500 = Green, 7500-9500 = Yellow, >9500 = Red

---

### 4. Security Intelligence Dashboard

**File:** `ops/grafana-dashboard.json`  
**UID:** `security-intelligence`  
**URL:** http://localhost:3000/d/security-intelligence

**Purpose:** Security bot monitoring, role tracking, permission auditing

---

## 🚨 Alert Configuration

### Alert Rules v2

**File:** `ops/grafana-alert-rules-v2.yml`

### Severity Tiers

| Tier | Response Time | Examples |
|------|---------------|----------|
| 🔴 **Critical** | Immediate | Service down, Memory >90%, DB failure, Error rate >50/min |
| ⚠️ **Warning** | Within 1 hour | Memory >75%, Error rate >10/min, Cache hit <90% |
| ℹ️ **Info** | Next business day | Service restart, Deployment, Unusual volume |

### Critical Alerts

| Alert | Trigger | Runbook |
|-------|---------|---------|
| ServiceDown | No logs for 5min | `01-service-matrix.md#service-recovery` |
| MemoryCritical | Memory >90% | `02-database-operations.md#memory-pressure` |
| DatabaseConnectionFailed | >5 connection errors in 5min | `02-database-operations.md#connection-recovery` |
| ErrorRateCritical | >50 errors/min for 2min | `03-deployment-procedures.md#rollback` |
| DiskCritical | Disk >95% | `worker-troubleshooting-comprehensive.md#disk` |

### Warning Alerts

| Alert | Trigger | Action |
|-------|---------|--------|
| MemoryWarning | Memory >75% for 5min | Monitor, consider restart |
| ErrorRateWarning | >10 errors in 5min | Investigate root cause |
| CacheHitRateLow | Hit rate <90% for 10min | Check cache config |
| LokiQueueBacklog | Queue >750 entries | Check Loki health |
| DatabaseLatencyHigh | p95 >100ms for 5min | Review slow queries |

---

## 🔍 Quick Start Queries

### Find Errors

```logql
{level="error"} | json
```

### Trace Request

```logql
{service=~".+"} |= "CORRELATION_ID" | json
```

### Slow Operations

```logql
{service=~".+"} | json | unwrap duration_ms | duration_ms > 500
```

### Service Health

```logql
{service="stats-logger"} |= "heartbeat" | json
```

See [LogQL Query Library](logql-queries.md) for comprehensive query examples.

---

## 🛠️ Local Setup

### Start the Stack

```bash
# Start Loki, Grafana, and Promtail
docker-compose -f docker-compose.loki.yml up -d

# Check status
docker-compose -f docker-compose.loki.yml ps

# View logs
docker-compose -f docker-compose.loki.yml logs -f
```

### Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| **Grafana** | http://localhost:3000 | admin / admin |
| **Loki** | http://localhost:3100 | — |
| **Loki API** | http://localhost:3100/ready | — |

### Connect Production Logs

For receiving production logs, set up an ngrok tunnel:

```bash
# Start ngrok tunnel to Loki
ngrok http 3100

# Configure LOKI_PUSH_URL in production
# Example: https://abc123.ngrok.io/loki/api/v1/push
```

---

## 📁 File Reference

```
ops/
├── grafana-infinity-gauntlet-main.json  # Main operations dashboard
├── grafana-battle-engine.json           # Battle system dashboard
├── grafana-cache-performance.json       # Cache/DB performance
├── grafana-dashboard.json               # Security dashboard (existing)
├── grafana-datasources.yml              # Loki + Prometheus sources
├── grafana-dashboards.yml               # Dashboard provisioning
├── grafana-alert-rules-v2.yml           # Alert rule definitions
├── loki-config.yaml                     # Loki server config
└── promtail-config.yaml                 # Log collection agent

docs/observability/
├── INDEX.md                             # This file
└── logql-queries.md                     # Query library
```

---

## 📈 Metrics Reference

### Prometheus Metrics (security_bot_* prefix)

| Metric | Type | Description |
|--------|------|-------------|
| `memory_rss_bytes` | Gauge | Resident Set Size |
| `memory_heap_used_bytes` | Gauge | Heap used |
| `memory_heap_total_bytes` | Gauge | Heap total |
| `disk_used_percent` | Gauge | /Store disk usage |
| `cpu_user_percent` | Gauge | User CPU time |
| `cpu_system_percent` | Gauge | System CPU time |
| `uptime_seconds` | Counter | Process uptime |
| `battles_total` | Counter | Total battles |
| `battle_duration_seconds` | Histogram | Battle duration |
| `battle_turns` | Histogram | Turns per battle |
| `encounters_total` | Counter | Wild encounters |
| `catch_rate` | Gauge | Current catch rate |
| `commands_total` | Counter | Bot commands |
| `loki_queue_size` | Gauge | Pending log entries |
| `loki_logs_sent` | Counter | Logs sent to Loki |
| `loki_circuit_state` | Gauge | 0=closed, 1=open |

### Log Labels

| Label | Values | Description |
|-------|--------|-------------|
| `service` | stats-logger, security-bot, cache-worker, etc. | Originating service |
| `level` | debug, info, warn, error, fatal | Log severity |
| `job` | infinity-gauntlet | Prometheus job name |
| `environment` | production, development | Runtime environment |

### Log Fields (JSON)

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | ISO 8601 | Event time |
| `level` | string | Log level |
| `message` | string | Human-readable message |
| `service` | string | Service name |
| `operation` | string | Operation/function name |
| `correlationId` | string | Request correlation |
| `parentCorrelationId` | string | Parent correlation |
| `duration_ms` | number | Operation duration |
| `data` | object | Additional context |

---

*Last Updated: December 2025*  
*Part of Pokémon Infinity Gauntlet Professional Observability Suite*
