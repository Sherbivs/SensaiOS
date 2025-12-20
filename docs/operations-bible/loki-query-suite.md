# Loki Query Suite — Pokémon Infinity Gauntlet

## 🎯 Overview

This document provides a comprehensive suite of LogQL queries for monitoring the Infinity Gauntlet production system via Grafana Loki. All queries are designed for the local Loki stack accessible at `localhost:3100` (API) and `localhost:3000` (Grafana UI).

**Architecture:** Render → ngrok tunnel → localhost:3100 (Loki) → Grafana

---

## 📊 Label Schema

| Label | Values | Description |
|-------|--------|-------------|
| `service` | `stats-logger` | Service emitting logs |
| `level` | `success`, `info`, `detail`, `error`, `warn` | Log severity |
| `job` | `infinity-gauntlet`, `infinity-gauntlet-local` | Job identifier |
| `environment` | `production`, `development` | Deployment environment |

---

## 🔍 Query Categories

### Quick Reference (Copy-Paste Ready)

```logql
# All production logs (last 1 hour)
{job="infinity-gauntlet", environment="production"}

# Errors only
{level="error"}

# Security bot sweep cycles
{level="info"} |= "Sweep"

# Role permission checks
{level=~"success|detail"} |= "Role Permissions"
```

---

## 1️⃣ Health & Status Monitoring

### 1.1 All Production Logs
```logql
{job="infinity-gauntlet", environment="production"}
```
**Use:** Overview of all production activity

### 1.2 Service Health Check
```logql
{service="stats-logger"} | json | line_format "{{.message}}"
```
**Use:** Parse JSON log lines and extract messages

### 1.3 Dashboard Render Events
```logql
{level="info"} |= "Dashboard rendered"
```
**Use:** Confirm stats logger is refreshing (every 15s)

---

## 2️⃣ Security Bot Monitoring

### 2.1 Sweep Cycle Overview
```logql
{level="info"} |= "Sweep"
```
**Use:** All sweep-related activity

### 2.2 Sweep Starts
```logql
{level="info"} |= "Sweep Start"
```
**Use:** When security sweeps begin

### 2.3 Sweep Completions
```logql
{level="info"} |= "Continuous Sweep Cycle Complete"
```
**Use:** Successful sweep completions

### 2.4 Sweep No-Ops (No Changes)
```logql
{level="info"} |= "Sweep No-Op"
```
**Use:** Sweeps that found no issues

### 2.5 Members Fetched
```logql
{level="info"} |= "Members Fetched"
```
**Use:** Guild member sync operations

### 2.6 Role Permission Checks (Success)
```logql
{level="success"} |= "Role Permissions Match"
```
**Use:** Verified role permissions are correct

### 2.7 Role Permission Details
```logql
{level="detail"} |= "Role Permissions"
```
**Use:** Granular role permission audit data

### 2.8 Security Anomalies (Potential Issues)
```logql
{level=~"warn|error"} |~ "permission|role|security|unauthorized"
```
**Use:** Security-related warnings and errors

---

## 3️⃣ Error Tracking

### 3.1 All Errors
```logql
{level="error"}
```
**Use:** All error-level logs

### 3.2 All Warnings
```logql
{level="warn"}
```
**Use:** Warning-level logs

### 3.3 Critical Issues (Errors + Warnings)
```logql
{level=~"error|warn"}
```
**Use:** All issues requiring attention

### 3.4 Error Rate (Last 5 Minutes)
```logql
count_over_time({level="error"}[5m])
```
**Use:** Error frequency metric for alerting

### 3.5 Errors by Message Pattern
```logql
{level="error"} | json | line_format "{{.message}}" | pattern `<_> <error_type>: <_>` | label_format error_type=error_type
```
**Use:** Categorize errors by type

---

## 4️⃣ Database Operations

### 4.1 Database Connection Issues
```logql
{service="stats-logger"} |~ "(?i)database|prisma|postgres|connection"
```
**Use:** Any database-related log messages

### 4.2 Database Latency Mentions
```logql
{service="stats-logger"} |~ "(?i)latency|slow|timeout"
```
**Use:** Performance-related database issues

### 4.3 Prisma Errors
```logql
{level="error"} |~ "(?i)prisma|P[0-9]{4}"
```
**Use:** Prisma ORM error codes

---

## 5️⃣ Battle Engine (Future)

### 5.1 Battle Events
```logql
{service="stats-logger"} |~ "(?i)battle|combat|fight"
```
**Use:** Battle-related activity

### 5.2 Move Usage
```logql
{service="stats-logger"} |~ "(?i)move|attack|damage"
```
**Use:** Battle move execution

### 5.3 Battle Anomalies
```logql
{level=~"warn|error"} |~ "(?i)battle|combat|desync"
```
**Use:** Battle system issues

---

## 6️⃣ Cache Operations

### 6.1 Cache Activity
```logql
{service="stats-logger"} |~ "(?i)cache|l1|refresh"
```
**Use:** Cache-related operations

### 6.2 Cache Misses
```logql
{service="stats-logger"} |~ "(?i)miss|fallback"
```
**Use:** Cache miss events

---

## 7️⃣ Worker Monitoring

### 7.1 Worker Events
```logql
{service="stats-logger"} |~ "(?i)worker|outbox|pipeline"
```
**Use:** Background worker activity

### 7.2 Worker Errors
```logql
{level="error"} |~ "(?i)worker|job|queue"
```
**Use:** Worker failures

---

## 8️⃣ Performance Analysis

### 8.1 Log Volume by Level (Rate)
```logql
sum by (level) (rate({job="infinity-gauntlet"}[5m]))
```
**Use:** Log throughput breakdown

### 8.2 Log Volume Over Time
```logql
sum(count_over_time({job="infinity-gauntlet"}[1m]))
```
**Use:** Total log volume per minute

### 8.3 High-Frequency Events
```logql
topk(10, sum by (level) (count_over_time({job="infinity-gauntlet"}[1h])))
```
**Use:** Most frequent log levels

---

## 9️⃣ Alerting Queries

### 9.1 Error Spike Alert
```logql
# Alert when > 10 errors in 5 minutes
count_over_time({level="error"}[5m]) > 10
```

### 9.2 No Logs Alert (Dead Service)
```logql
# Alert when no logs for 5 minutes
absent_over_time({service="stats-logger"}[5m])
```

### 9.3 Security Alert
```logql
# Alert on any security warnings/errors
{level=~"warn|error"} |~ "(?i)security|permission|unauthorized"
```

---

## 🛠️ PowerShell Query Helpers

### Basic Query Template
```powershell
# Query Loki API
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000
$start = ([DateTimeOffset]::UtcNow.AddHours(-3)).ToUnixTimeMilliseconds() * 1000000
$query = [uri]::EscapeDataString('{service="stats-logger"}')
$r = Invoke-RestMethod "http://localhost:3100/loki/api/v1/query_range?query=$query&limit=50&start=$start&end=$now"
$r.data.result | ForEach-Object { $_.values | ForEach-Object { Write-Host $_[1] } }
```

### Error-Only Query
```powershell
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000
$start = ([DateTimeOffset]::UtcNow.AddHours(-1)).ToUnixTimeMilliseconds() * 1000000
$query = [uri]::EscapeDataString('{level="error"}')
$r = Invoke-RestMethod "http://localhost:3100/loki/api/v1/query_range?query=$query&limit=100&start=$start&end=$now"
Write-Host "Errors found: $($r.data.result.Count)"
```

### Stream Count by Level
```powershell
$labels = Invoke-RestMethod "http://localhost:3100/loki/api/v1/label/level/values"
$labels.data | ForEach-Object {
    $level = $_
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000
    $start = ([DateTimeOffset]::UtcNow.AddHours(-1)).ToUnixTimeMilliseconds() * 1000000
    $query = [uri]::EscapeDataString("{level=`"$level`"}")
    $r = Invoke-RestMethod "http://localhost:3100/loki/api/v1/query_range?query=$query&limit=1000&start=$start&end=$now"
    $count = ($r.data.result | ForEach-Object { $_.values.Count } | Measure-Object -Sum).Sum
    Write-Host "$level`: $count"
}
```

---

## 📈 Grafana Dashboard Panels

### Recommended Panel Configurations

#### Panel 1: Log Stream (Main View)
- **Type:** Logs
- **Query:** `{job="infinity-gauntlet"}`
- **Sort:** Newest first

#### Panel 2: Error Rate Graph
- **Type:** Time Series
- **Query:** `sum(count_over_time({level="error"}[$__interval]))`
- **Legend:** Errors per interval

#### Panel 3: Level Distribution Pie
- **Type:** Pie Chart
- **Query:** `sum by (level) (count_over_time({job="infinity-gauntlet"}[1h]))`

#### Panel 4: Security Sweep Status
- **Type:** Stat
- **Query:** `count_over_time({level="success"} |= "Role Permissions Match"[1h])`
- **Title:** Successful Permission Checks

---

## 🔗 Quick Access URLs

| Resource | URL |
|----------|-----|
| **Grafana Explore** | http://localhost:3000/explore |
| **Loki API** | http://localhost:3100 |
| **Labels List** | http://localhost:3100/loki/api/v1/labels |
| **Ready Check** | http://localhost:3100/ready |

---

## 📝 Query Development Workflow

1. **Start in Grafana Explore** (`localhost:3000/explore`)
2. **Select Loki data source**
3. **Use label browser** to discover available labels
4. **Build query incrementally** (start broad, add filters)
5. **Test with small time ranges** first
6. **Save working queries** to this document

---

## 🚨 Troubleshooting

### No Logs Appearing
1. Check ngrok tunnel is active
2. Verify `LOKI_ENDPOINT` in Render environment
3. Confirm service is deployed with Loki integration
4. Check `http://localhost:3100/ready` returns "ready"

### Query Returns Empty
1. Expand time range (try last 6-24 hours)
2. Remove filters to broaden query
3. Check label values: `http://localhost:3100/loki/api/v1/label/level/values`

### Slow Queries
1. Add more specific label selectors
2. Use line filters (`|=`, `|~`) to reduce parsing
3. Limit time range

---

## 📚 LogQL Reference

### Operators
| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Exact match | `{level="error"}` |
| `!=` | Not equal | `{level!="debug"}` |
| `=~` | Regex match | `{level=~"error\|warn"}` |
| `!~` | Regex not match | `{level!~"debug\|info"}` |

### Line Filters
| Filter | Description | Example |
|--------|-------------|---------|
| `\|=` | Contains | `\|= "error"` |
| `\|~` | Regex contains | `\|~ "(?i)error"` |
| `!=` | Not contains | `!= "debug"` |
| `!~` | Regex not contains | `!~ "(?i)debug"` |

### Parser Functions
| Function | Description |
|----------|-------------|
| `json` | Parse JSON log lines |
| `logfmt` | Parse logfmt lines |
| `pattern` | Parse with pattern |
| `regexp` | Parse with regex |

---

**Created:** 2025-12-20  
**Specialist Team:** Loki Integration, Security Monitoring, Performance Analysis  
**Last Updated:** 2025-12-20T15:30:00Z

