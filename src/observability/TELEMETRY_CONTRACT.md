# Telemetry Contract — Infinity Gauntlet

> **Created:** 2025-12-28  
> **Status:** AUTHORITATIVE  
> **Purpose:** Define ALL metrics, labels, log schemas, and cardinality rules  
> **Audience:** Developers, SREs, AI Agents

---

## 📋 Contract Overview

This document is the **single source of truth** for all telemetry in Infinity Gauntlet. Every metric, label, and log field must be documented here before deployment.

**Philosophy:** "One metric that nobody looks at costs more than zero metrics."

---

## 1. Primitives Reference

### 1.1 Metric Types

| Type | Purpose | Example | When to Use |
|------|---------|---------|-------------|
| **Counter** | Cumulative count (only goes up) | `battle_turns_total` | Counting events (battles, commands, errors) |
| **Gauge** | Point-in-time value (goes up/down) | `memory_heap_bytes` | Current state (memory, connections, queue depth) |
| **Histogram** | Distribution of values | `battle_turn_duration_seconds` | Latencies, sizes, durations |
| **Summary** | Client-side quantiles | — | Avoid (hard to aggregate) |

### 1.2 Log Levels

| Level | Purpose | Rate | Example |
|-------|---------|------|---------|
| `fatal` | Process cannot continue | <1/day | Database connection lost |
| `error` | Operation failed | <100/day | Pokemon not found, invalid move |
| `warn` | Unexpected but recoverable | <1000/day | Cache miss, retry needed |
| `info` | Business events | Unlimited | Battle started, command executed |
| `debug` | Development details | Disabled in prod | Variable values, timing |

---

## 2. Label Taxonomy

### 2.1 Global Labels (ALL metrics)

| Label | Cardinality | Example Values | Description |
|-------|-------------|----------------|-------------|
| `environment` | 3 | `production`, `staging`, `development` | Deployment environment |
| `service` | 8 | `bot`, `security`, `outbox`, `cache`, `pipeline` | Render service name |
| `instance` | ~10 | `srv-d3snk2ndiees73cn709g` | Render instance ID |

### 2.2 Discord Labels

| Label | Cardinality | Safe? | Notes |
|-------|-------------|-------|-------|
| `command_name` | ~50 | ✅ Yes | Finite set: `/battle`, `/catch`, `/walk`, etc. |
| `interaction_type` | ~5 | ✅ Yes | `command`, `button`, `select`, `modal`, `autocomplete` |
| `error_type` | ~20 | ✅ Yes | Finite error categories |

### 2.3 ⚠️ FORBIDDEN Labels (High Cardinality)

**NEVER use as metric labels — use as log fields instead:**

| Field | Cardinality | Why Forbidden |
|-------|-------------|---------------|
| `user_id` | 10K+ | Explodes series count |
| `guild_id` | 100+ | Moderate but risky growth |
| `battle_id` | Unbounded | New every battle |
| `correlation_id` | Unbounded | New every request |
| `pokemon_id` | 1000+ | Large but bounded |
| `trainer_name` | Unbounded | User-controlled string |

**Safe Alternative:** Use these as **log fields** for filtering:
```logql
{service="bot"} | json | user_id="123456789"
```

---

## 3. Metrics Catalog

### 3.1 Discord Bot Metrics

```promql
# Counter: Commands executed
infinity_gauntlet_commands_total{command="battle", status="success"}
infinity_gauntlet_commands_total{command="battle", status="error"}

# Histogram: Command latency
infinity_gauntlet_command_duration_seconds{command="battle"}

# Gauge: Active battles
infinity_gauntlet_active_battles

# Gauge: Connected guilds
infinity_gauntlet_guilds_total
```

### 3.2 Battle Engine Metrics

```promql
# Counter: Battle events
battle_turns_total{outcome="damage"}
battle_turns_total{outcome="miss"}
battle_turns_total{outcome="status"}

# Histogram: Turn resolution time
battle_turn_duration_seconds

# Counter: Type effectiveness hits
battle_type_effectiveness_total{effectiveness="super"}
battle_type_effectiveness_total{effectiveness="not_very"}
battle_type_effectiveness_total{effectiveness="no_effect"}

# Gauge: Concurrent battles
battle_active_count
```

### 3.3 Cache Metrics

```promql
# Counter: Cache operations
cache_operations_total{cache="l1", operation="hit"}
cache_operations_total{cache="l1", operation="miss"}
cache_operations_total{cache="l1", operation="evict"}

# Gauge: Cache size
cache_entries_count{cache="l1", type="pokemon"}
cache_entries_count{cache="l1", type="moves"}
cache_memory_bytes{cache="l1"}

# Gauge: Hit rate (derived)
rate(cache_operations_total{operation="hit"}[5m]) / 
rate(cache_operations_total[5m])
```

### 3.4 Database Metrics

```promql
# Gauge: Connection pool
database_connections_active{database="prod"}
database_connections_idle{database="prod"}

# Histogram: Query latency
database_query_duration_seconds{database="prod", operation="read"}
database_query_duration_seconds{database="prod", operation="write"}

# Counter: Query counts
database_queries_total{database="prod", status="success"}
database_queries_total{database="prod", status="error"}
```

### 3.5 Resource Metrics

```promql
# Gauge: Process resources
process_heap_bytes
process_rss_bytes
process_cpu_seconds_total

# Gauge: Disk usage (Render /Store)
disk_used_bytes{mount="/Store"}
disk_total_bytes{mount="/Store"}
disk_usage_ratio{mount="/Store"}

# Gauge: Event bus
eventbus_queue_depth
eventbus_backpressure_active
```

### 3.6 Security Bot Metrics

```promql
# Counter: Security events
security_sweeps_total{guild="sanitized"}
security_alerts_total{type="role_change"}
security_alerts_total{type="permission_change"}

# Gauge: Sweep state
security_last_sweep_timestamp_seconds
security_guilds_monitored
```

---

## 4. Log Schema

### 4.1 Structured Log Format

All logs MUST be JSON with these base fields:

```json
{
  "timestamp": "2025-12-28T12:34:56.789Z",
  "level": "info",
  "service": "bot",
  "message": "Battle started",
  "correlation_id": "abc123",
  "context": {
    "user_id": "123456789",
    "guild_id": "987654321",
    "command": "battle"
  }
}
```

### 4.2 Domain-Specific Fields

**Battle Events:**
```json
{
  "event_type": "battle.turn",
  "battle_id": "uuid",
  "turn_number": 5,
  "attacker_pokemon": "Pikachu",
  "defender_pokemon": "Charmander",
  "move_used": "Thunderbolt",
  "damage_dealt": 45,
  "effectiveness": "super_effective"
}
```

**Encounter Events:**
```json
{
  "event_type": "encounter.spawn",
  "encounter_id": "uuid",
  "pokemon_species": "Rattata",
  "rarity": "common",
  "channel_type": "field",
  "user_seed": 12345
}
```

**Error Events:**
```json
{
  "event_type": "error",
  "error_type": "pokemon_not_found",
  "error_message": "Pokemon ID 999 not found",
  "stack_trace": "...",
  "recovery_action": "return_default"
}
```

---

## 5. Cardinality Budget

### 5.1 Current Cardinality Estimate

| Dimension | Values | Source |
|-----------|--------|--------|
| `environment` | 3 | Static |
| `service` | 8 | Render services |
| `command_name` | 50 | Discord commands |
| `error_type` | 20 | Error categories |
| `cache_operation` | 4 | hit/miss/evict/set |
| `database_operation` | 2 | read/write |

**Total Unique Series:** ~3 × 8 × 50 × 20 × 4 × 2 = **192,000** worst case

**Budget:** 500,000 series (Loki free tier)

### 5.2 Cardinality Rules

1. **NEVER** add user-controlled strings as labels
2. **ALWAYS** sanitize guild names to IDs
3. **CAP** dynamic labels to known sets
4. **TEST** new labels with cardinality query:
   ```promql
   count(count by (__name__, new_label) ({__name__=~".+"}))
   ```

---

## 6. SLI/SLO Definitions

### 6.1 Service Level Indicators

| SLI | Definition | Target |
|-----|------------|--------|
| **Availability** | `sum(rate(infinity_gauntlet_commands_total{status="success"}[5m])) / sum(rate(infinity_gauntlet_commands_total[5m]))` | 99.9% |
| **Latency** | `histogram_quantile(0.95, rate(infinity_gauntlet_command_duration_seconds_bucket[5m]))` | <500ms |
| **Error Rate** | `sum(rate(infinity_gauntlet_commands_total{status="error"}[5m])) / sum(rate(infinity_gauntlet_commands_total[5m]))` | <0.1% |
| **Battle Success** | `sum(rate(battle_turns_total{outcome!="error"}[5m])) / sum(rate(battle_turns_total[5m]))` | 99.99% |

### 6.2 Error Budget

```
Monthly error budget (99.9% SLO):
- 30 days × 24 hours × 60 minutes = 43,200 minutes
- Error budget = 43,200 × 0.001 = 43.2 minutes downtime allowed
```

---

## 7. Alert Definitions

### 7.1 Critical Alerts

| Alert | Expression | For | Runbook |
|-------|------------|-----|---------|
| `HighErrorRate` | `error_rate > 0.05` | 5m | [Runbook: High Error Rate](../docs/operations-bible/08-recovery-runbook.md) |
| `ServiceDown` | `up == 0` | 1m | [Runbook: Service Down](../docs/operations-bible/08-recovery-runbook.md) |
| `HighLatency` | `p95_latency > 2s` | 5m | [Runbook: High Latency](../docs/operations-bible/08-recovery-runbook.md) |
| `DiskPressure` | `disk_usage_ratio > 0.85` | 5m | [Runbook: Disk Pressure](../docs/operations-bible/08-recovery-runbook.md) |
| `MemoryPressure` | `heap_used / heap_max > 0.90` | 5m | [Runbook: Memory Pressure](../docs/operations-bible/13-memory-management.md) |

### 7.2 Warning Alerts

| Alert | Expression | For | Runbook |
|-------|------------|-----|---------|
| `CacheHitRateLow` | `cache_hit_rate < 0.80` | 15m | [Runbook: Cache Issues](../docs/operations-bible/09-discord-cache.md) |
| `QueueBackpressure` | `eventbus_queue_depth > 7500` | 5m | [Runbook: Backpressure](../docs/architecture-bible/04-event-bus.md) |
| `DatabaseSlow` | `p95_query_latency > 500ms` | 5m | [Runbook: Query Optimization](../docs/operations-bible/query-optimization-guide.md) |

---

## 8. Retention Policy

| Data Type | Retention | Storage |
|-----------|-----------|---------|
| **Metrics** (Prometheus) | 15 days | Local Prometheus |
| **Logs** (Loki) | 7 days | Local Loki |
| **Traces** (future) | 7 days | — |
| **Error Records** | 30 days | PostgreSQL |
| **Battle Logs** | 90 days | Engine Write-DB |

---

## 9. Contract Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-12-28 | Initial contract creation | AI Agent |
| — | — | — |

---

## 10. Appendix: Query Recipes

### 10.1 Common PromQL

```promql
# Error rate over 5 minutes
sum(rate(infinity_gauntlet_commands_total{status="error"}[5m])) 
  / sum(rate(infinity_gauntlet_commands_total[5m]))

# P95 latency
histogram_quantile(0.95, 
  sum(rate(infinity_gauntlet_command_duration_seconds_bucket[5m])) by (le)
)

# Commands per minute by type
sum(rate(infinity_gauntlet_commands_total[1m])) by (command)
```

### 10.2 Common LogQL

```logql
# All errors in last hour
{service="bot"} |= "error" | json

# Battle events for specific user (user_id as FIELD, not label)
{service="bot"} | json | user_id="123456789" | event_type="battle"

# Slow queries over 500ms
{service="bot"} | json | duration > 500

# Security sweep timeline
{service="security"} |= "sweep" | json | line_format "{{.timestamp}} - {{.message}}"
```

---

**Document Version:** 1.0  
**Cross-References:**
- [Architecture Bible: Observability](../docs/architecture-bible/12-observability.md)
- [Operations Bible: Monitoring](../docs/operations-bible/05-monitoring.md)
- [Loki Query Suite](../docs/operations-bible/loki-query-suite.md)
- [Metrics Expansion Bible](../docs/projects/observability/bible-integration/metrics-expansion-bible.md)
