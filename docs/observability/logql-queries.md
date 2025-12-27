# LogQL Query Library — Pokémon Infinity Gauntlet

Professional LogQL queries for troubleshooting, monitoring, and analysis.

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Error Investigation](#error-investigation)
3. [Correlation Tracing](#correlation-tracing)
4. [Performance Analysis](#performance-analysis)
5. [Service Health](#service-health)
6. [Game Engine Queries](#game-engine-queries)
7. [Security & Audit](#security--audit)
8. [Aggregation Patterns](#aggregation-patterns)
9. [Alert Query Templates](#alert-query-templates)

---

## Quick Reference

### Basic Filters

```logql
# All logs from specific service
{service="stats-logger"}

# Multiple services
{service=~"stats-logger|security-bot|cache-worker"}

# All error logs
{level="error"}

# Errors from specific service
{service="stats-logger", level="error"}

# Exclude debug logs
{service=~".+"} != "debug"

# Regex match on service name
{service=~"infinity-gauntlet.*"}
```

### Time-Based

```logql
# Last 5 minutes
{service=~".+"} | json

# With explicit time range in Grafana
# Use time picker or $__range variable

# Count over time window
count_over_time({level="error"}[5m])

# Rate per second
rate({service=~".+"}[1m])
```

---

## Error Investigation

### Find All Errors

```logql
# All error logs, parsed as JSON
{level="error"} | json

# Errors with full context
{level="error"} | json | line_format "{{.timestamp}} [{{.service}}] {{.message}} | data={{.data}}"
```

### Error Patterns

```logql
# Database errors
{service=~".+"} |= "error" |~ "database|prisma|postgres|connection" | json

# Discord API errors  
{service=~".+"} |= "error" |~ "discord|rate.?limit|ECONNRESET" | json

# Memory pressure errors
{service=~".+"} |= "error" |~ "memory|heap|OOM|allocation" | json

# Timeout errors
{service=~".+"} |= "error" |~ "timeout|ETIMEDOUT|deadline" | json
```

### Top Error Messages

```logql
# Count errors by message (in Grafana Explore as table)
sum by (message) (count_over_time({level="error"} | json [$__range]))
```

### Error Rate Over Time

```logql
# Errors per minute
sum(count_over_time({level="error"}[1m]))

# Error rate by service
sum by (service) (count_over_time({level="error"}[1m]))
```

### Recent Stack Traces

```logql
{level="error"} |= "stack" | json | line_format "{{.timestamp}}\n{{.message}}\n{{.stack}}"
```

---

## Correlation Tracing

### Find Request by Correlation ID

```logql
# Specific correlation ID
{service=~".+"} |= "abc123-correlation-id" | json

# With formatted output
{service=~".+"} |= "abc123-correlation-id" | json | line_format "{{.timestamp}} [{{.service}}] {{.operation}} - {{.message}}"
```

### Trace Full Request Flow

```logql
# Find parent correlation
{service=~".+"} | json | correlationId = "request-123" or parentCorrelationId = "request-123"

# All related logs (parent + children)
{service=~".+"} | json | correlationId =~ "request-123.*"
```

### Request Duration Analysis

```logql
# Find long operations (logs with duration field)
{service=~".+"} | json | duration_ms > 1000

# Sort by duration
{service=~".+"} | json | duration_ms > 100 | line_format "{{.duration_ms}}ms - {{.operation}} - {{.message}}"
```

---

## Performance Analysis

### Slow Operations

```logql
# Operations taking >500ms
{service=~".+"} | json | unwrap duration_ms | duration_ms > 500

# Database slow queries
{service=~".+"} |= "query" | json | unwrap duration_ms | duration_ms > 100 | line_format "{{.duration_ms}}ms - {{.query}}"
```

### Cache Performance

```logql
# Cache hits
{service=~".+"} |= "cache" |= "hit" | json

# Cache misses
{service=~".+"} |= "cache" |= "miss" | json

# Cache hit rate over time
sum(count_over_time({service=~".+"} |= "cache" |= "hit" [5m])) / 
(sum(count_over_time({service=~".+"} |= "cache" |= "hit" [5m])) + sum(count_over_time({service=~".+"} |= "cache" |= "miss" [5m])))
```

### Memory Usage Patterns

```logql
# Memory-related logs
{service=~".+"} |= "memory" | json

# Heap snapshot events
{service=~".+"} |= "heap" | json

# Garbage collection events
{service=~".+"} |= "gc" | json
```

### Startup Performance

```logql
# Startup sequence
{service=~".+"} |= "startup" | json | line_format "{{.timestamp}} - {{.operation}} - {{.duration_ms}}ms"

# Service ready events
{service=~".+"} |= "ready" | json
```

---

## Service Health

### Heartbeat/Health Checks

```logql
# All health checks
{service=~".+"} |= "health" | json

# Database heartbeats
{service=~".+"} |= "heartbeat" | json

# Missing heartbeats (use with absent() in alerts)
count_over_time({service="stats-logger"} |= "heartbeat" [5m])
```

### Service Status

```logql
# Startup events
{service=~".+"} |= "starting" or |= "started" or |= "ready" | json

# Shutdown events
{service=~".+"} |= "shutdown" or |= "stopping" or |= "terminated" | json

# Worker status
{service=~".*worker.*"} | json
```

### Circuit Breaker Events

```logql
# Circuit breaker state changes
{service=~".+"} |= "circuit" | json

# Loki circuit breaker
{service=~".+"} |= "loki" |= "circuit" | json
```

---

## Game Engine Queries

### Battle Events

```logql
# All battle logs
{service=~".+"} |= "battle" | json

# Battle starts
{service=~".+"} |= "battle" |= "started" | json | line_format "Battle {{.battle_id}}: {{.player1}} vs {{.player2}}"

# Battle completions
{service=~".+"} |= "battle" |= "completed" | json | line_format "Battle {{.battle_id}} won by {{.winner}} in {{.turns}} turns"

# Battle errors
{service=~".+"} |= "battle" |= "error" | json
```

### Move Usage

```logql
# Move usage logs
{service=~".+"} |= "move" | json

# Top moves used
sum by (move_name) (count_over_time({service=~".+"} |= "move" | json [$__range]))

# Critical hits
{service=~".+"} |= "critical" | json

# Type effectiveness
{service=~".+"} |= "super effective" or |= "not very effective" | json
```

### Encounters

```logql
# Wild encounters
{service=~".+"} |= "encounter" | json | line_format "{{.pokemon}} (Lv.{{.level}}) encountered by {{.trainer}}"

# Catch attempts
{service=~".+"} |= "catch" | json

# Catch success rate
sum(count_over_time({service=~".+"} |= "catch" |= "success" [1h])) / 
sum(count_over_time({service=~".+"} |= "catch" [1h]))
```

### Homestead Channels

```logql
# Homestead activity
{service=~".+"} |= "homestead" | json

# Channel creation
{service=~".+"} |= "homestead" |= "created" | json

# Heal events
{service=~".+"} |= "heal" | json
```

---

## Security & Audit

### Permission Changes

```logql
# Role/permission changes
{service="security-bot"} |= "permission" or |= "role" | json

# Revert events
{service="security-bot"} |= "revert" | json

# Alert events
{service="security-bot"} |= "alert" | json
```

### Admin Commands

```logql
# All /ops commands
{service=~".+"} |= "/ops" | json

# Admin actions by user
{service=~".+"} | json | command =~ "/ops.*" | line_format "{{.user}} executed {{.command}}"
```

### Security Sweeps

```logql
# Security sweep results
{service="security-bot"} |= "sweep" | json

# Changes detected
{service="security-bot"} |= "change detected" | json
```

### Authentication/Authorization

```logql
# Auth failures
{service=~".+"} |= "auth" |= "failed" | json

# Permission denied
{service=~".+"} |= "permission denied" or |= "unauthorized" | json
```

---

## Aggregation Patterns

### Log Volume by Service

```logql
sum by (service) (count_over_time({service=~".+"} [5m]))
```

### Log Volume by Level

```logql
sum by (level) (count_over_time({service=~".+"} | json [5m]))
```

### Error Distribution by Service

```logql
sum by (service) (count_over_time({level="error"} [1h]))
```

### Top Operations

```logql
topk(10, sum by (operation) (count_over_time({service=~".+"} | json [$__range])))
```

### Hourly Patterns

```logql
# Logs per hour (for trend analysis)
sum(count_over_time({service=~".+"} [1h]))
```

### Percentile Calculations

```logql
# 95th percentile of duration
quantile_over_time(0.95, {service=~".+"} | json | unwrap duration_ms [$__range])

# 99th percentile
quantile_over_time(0.99, {service=~".+"} | json | unwrap duration_ms [$__range])
```

---

## Alert Query Templates

### Critical Error Detection

```logql
# For Grafana alerting - error spike
sum(count_over_time({level="error"} [1m])) > 50
```

### Service Down Detection

```logql
# No logs from service (use absent())
absent(count_over_time({service="stats-logger"} [5m]))
```

### Memory Pressure

```logql
# Memory warning logs
count_over_time({service=~".+"} |= "memory" |~ "warning|pressure|high" [5m]) > 3
```

### Database Connection Issues

```logql
# Connection errors
count_over_time({service=~".+"} |= "database" |= "error" |~ "connection|ECONNREFUSED|timeout" [5m]) > 5
```

### Log Volume Anomaly

```logql
# Sudden spike (>1000 logs/min)
sum(count_over_time({service=~".+"} [1m])) > 1000
```

### Game Engine Health

```logql
# Battle engine errors
count_over_time({service=~".+"} |= "battle" |= "error" [5m]) > 3
```

---

## Usage Tips

### Grafana Explore

1. **Start broad, then narrow**: Begin with `{service=~".+"}` and add filters
2. **Use JSON parser**: Most logs are JSON - use `| json` for structured access
3. **Line format for readability**: Use `| line_format` for custom output
4. **Unwrap for numeric operations**: Use `| unwrap field_name` for aggregations

### Performance Optimization

1. **Be specific with labels**: `{service="stats-logger"}` is faster than `{service=~".*"}`
2. **Filter early**: Put `|=` and `!=` filters before `| json`
3. **Limit time ranges**: Smaller ranges = faster queries
4. **Use regex sparingly**: Exact matches are faster than regex

### Common Mistakes

1. **Missing JSON parser**: `| json` is required before accessing fields
2. **Case sensitivity**: LogQL is case-sensitive
3. **Regex escaping**: Use `|~` for regex, `|=` for exact match
4. **Label vs field**: Labels are `{label="value"}`, fields are after `| json`

---

## Related Resources

- **Grafana Dashboard**: `ops/grafana-infinity-gauntlet-main.json`
- **Alert Rules**: `ops/grafana-alert-rules-v2.yml`
- **Loki Config**: `ops/loki-config.yaml`
- **Operations Bible**: `docs/operations-bible/INDEX.md`
- **Architecture Bible**: `docs/architecture-bible/INDEX.md`

---

*Last Updated: December 2025*
*Part of Pokémon Infinity Gauntlet Observability Suite*
