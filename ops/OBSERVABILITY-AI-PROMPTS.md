# Observability AI Prompts — Infinity Gauntlet

> **Created:** 2025-12-28  
> **Status:** AUTHORITATIVE  
> **Purpose:** AI prompt templates for observability tasks  
> **Audience:** AI agents (Copilot, Claude, GPT) working on observability

---

## 📋 Purpose

These prompts help AI agents understand context and generate correct observability code, queries, and configurations for Infinity Gauntlet.

**Usage:** Copy relevant context block into AI conversation when working on observability tasks.

---

## 1. Context Block: Full System

Use this when AI needs complete observability context:

```markdown
## Observability Context — Infinity Gauntlet

### Stack
- **Metrics:** Prometheus (local, future: Grafana Cloud)
- **Logs:** Loki (local via Docker, production via ngrok tunnel)
- **Visualization:** Grafana (localhost:3000)
- **Alerting:** Prometheus alertmanager + Grafana alerts

### Architecture
- **Event Bus:** Central pub-sub for all system events
- **Observability Hub:** Subscribes to Event Bus with '**' pattern
- **Loki Backend:** Queue → HTTP transport → Local Loki

### Key Files
- `src/observability/` — Hub, backends, envelope system
- `ops/prometheus-alerts.yml` — Metric-based alerts
- `ops/grafana-*.json` — Dashboard definitions
- `docs/operations-bible/loki-setup.md` — Loki quickstart

### Cardinality Rules (CRITICAL)
- **NEVER** use user_id, guild_id, battle_id as metric LABELS
- **ALWAYS** use them as log FIELDS for filtering
- **SAFE** labels: command_name, error_type, service, environment

### Telemetry Contract
See: `src/observability/TELEMETRY_CONTRACT.md` for all metrics/labels/schemas
```

---

## 2. Prompt: Write PromQL Query

```markdown
## Task: Write a PromQL query

### Context
- Infinity Gauntlet Discord bot
- Metrics available: (see TELEMETRY_CONTRACT.md)
- Target: {describe what you want to measure}

### Requirements
- Query must use existing metrics from the contract
- Include label filtering if needed
- Explain what the query measures

### Example Format
```promql
# Description of what this measures
sum(rate(infinity_gauntlet_commands_total{status="error"}[5m])) 
  / sum(rate(infinity_gauntlet_commands_total[5m]))
```
```

---

## 3. Prompt: Write LogQL Query

```markdown
## Task: Write a LogQL query

### Context
- Logs stored in Loki with labels: service, level, job, environment
- Logs are JSON structured
- Target: {describe what logs you need}

### Requirements
- Start with label selector: `{service="bot"}`
- Use `| json` to parse JSON logs
- Use field filters: `| user_id="123"` (NOT as labels!)
- Use `| line_format` for custom output

### Example Format
```logql
# Find all errors for a specific user
{service="bot", level="error"} 
  | json 
  | user_id="123456789"
  | line_format "{{.timestamp}} - {{.error.type}}: {{.error.message}}"
```
```

---

## 4. Prompt: Create Alert Rule

```markdown
## Task: Create a Prometheus alert rule

### Context
- Alert file: ops/prometheus-alerts.yml
- Severity levels: critical, warning, info
- All alerts MUST have runbook_url annotation

### Requirements
- Include meaningful "for" duration (prevent flapping)
- Add all required annotations: summary, description, runbook_url, action
- Use appropriate severity label
- Link to existing runbook or create new section

### Template
```yaml
- alert: AlertName
  expr: metric_expression > threshold
  for: 5m
  labels:
    severity: warning
    category: {security|availability|performance|capacity}
    service: {bot|security|database|cache}
  annotations:
    summary: "⚠️ Short description"
    description: "Detailed context with {{ $value }}"
    runbook_url: "https://github.com/Sherbivs/Infinity-Gauntlet/blob/main/docs/operations-bible/08-recovery-runbook.md#section"
    action: "1. First step\n2. Second step"
```
```

---

## 5. Prompt: Add New Metric

```markdown
## Task: Add a new metric to the codebase

### Context
- Metrics defined in: src/services/prometheus-metrics.ts
- Telemetry contract: src/observability/TELEMETRY_CONTRACT.md
- Discord bot observability: src/observability/DISCORD_OBSERVABILITY.md

### Requirements
1. Check if metric already exists in contract
2. Choose correct type: Counter (events), Gauge (current value), Histogram (distributions)
3. Define safe labels (NO user_id, guild_id as labels!)
4. Add to TELEMETRY_CONTRACT.md
5. Implement in code

### Checklist
- [ ] Metric name follows convention: `infinity_gauntlet_{domain}_{measurement}_{unit}`
- [ ] Labels are bounded (finite set of values)
- [ ] Help text is descriptive
- [ ] Added to telemetry contract
- [ ] Unit test covers metric increment
```

---

## 6. Prompt: Create Dashboard Panel

```markdown
## Task: Create a Grafana dashboard panel

### Context
- Dashboard files: ops/grafana-*.json
- Data sources: Loki (logs), Prometheus (metrics)
- Dashboard guide: ops/GRAFANA-DASHBOARDS.md

### Requirements
- Follow Four Golden Signals (latency, traffic, errors, saturation)
- Include thresholds for color coding
- Add meaningful title and description

### Panel Types
- **Stat:** Single value with threshold colors
- **Graph/Timeseries:** Metrics over time
- **Gauge:** Percentage/ratio with min/max
- **Table:** Multiple rows of data
- **Logs:** Log stream with filters

### Template (Stat Panel)
```json
{
  "type": "stat",
  "title": "Panel Title",
  "targets": [{
    "expr": "metric_expression",
    "refId": "A"
  }],
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "green", "value": null },
          { "color": "yellow", "value": 80 },
          { "color": "red", "value": 95 }
        ]
      },
      "unit": "percent"
    }
  }
}
```
```

---

## 7. Prompt: Debug Missing Logs

```markdown
## Task: Debug why logs aren't appearing in Loki

### Context
- Local stack: docker-compose.loki.yml
- Production logs: Render → ngrok → localhost:3100
- Transport: src/observability/backends/loki/

### Diagnostic Steps
1. Check Loki is running: `curl http://localhost:3100/ready`
2. Check ngrok tunnel is active: `ngrok http 3100`
3. Verify LOKI_ENDPOINT env var on Render
4. Check circuit breaker state in logs
5. Query Loki directly: 
   ```logql
   {job="infinity-gauntlet"} | json
   ```

### Common Issues
- **ngrok tunnel expired** — Restart ngrok, update Render env
- **Circuit breaker open** — Wait 60s or restart service
- **Queue overflow** — Check LOKI_QUEUE_MAX_SIZE
- **Wrong labels** — Verify label schema in code
```

---

## 8. Prompt: Investigate Alert

```markdown
## Task: Investigate a firing alert

### Context
- Alert: {alert_name}
- Firing since: {timestamp}
- Current value: {value}

### Investigation Framework
1. **Confirm alert is real** — Check metric/logs match alert
2. **Determine scope** — One service or system-wide?
3. **Identify root cause** — Recent changes? External factors?
4. **Apply fix** — Follow runbook steps
5. **Verify resolution** — Alert clears, metrics normalize

### Relevant Queries

**For error rate alerts:**
```logql
{service="bot", level="error"} | json | line_format "{{.error.type}}: {{.error.message}}"
```

**For latency alerts:**
```promql
histogram_quantile(0.95, sum(rate(command_duration_seconds_bucket[5m])) by (le, command))
```

**For resource alerts:**
```promql
process_resident_memory_bytes / 2147483648  # as % of 2GB
```
```

---

## 9. Prompt: Cardinality Review

```markdown
## Task: Review metric for cardinality issues

### Context
- Metric: {metric_name}
- Current labels: {list_labels}

### Review Checklist
- [ ] All labels have bounded cardinality?
- [ ] No user-controlled strings as labels?
- [ ] No UUIDs/IDs as labels?
- [ ] Estimated max series count acceptable?

### Cardinality Calculation
```
Total series = label1_values × label2_values × label3_values × ...
```

### Safe Cardinality Limits
- **Local Prometheus:** <100,000 series
- **Grafana Cloud Free:** <10,000 series
- **Production:** <500,000 series

### If High Cardinality Found
1. Move high-cardinality dimension to log field
2. Use buckets instead of exact values (e.g., latency_bucket)
3. Aggregate at collection time
```

---

## 10. Quick Reference Card

### LogQL Patterns

```logql
# Basic label filter
{service="bot"}

# Parse JSON and filter by field
{service="bot"} | json | error_type="pokemon_not_found"

# Count events per minute
sum(count_over_time({service="bot"} | json | event_type="command"[1m]))

# Extract specific field
{service="bot"} | json | line_format "{{.message}}"
```

### PromQL Patterns

```promql
# Rate of counter (per second)
rate(metric_total[5m])

# Sum across instances
sum(rate(metric_total[5m])) by (command)

# Histogram percentile
histogram_quantile(0.95, sum(rate(metric_bucket[5m])) by (le))

# Ratio (e.g., error rate)
sum(rate(errors_total[5m])) / sum(rate(requests_total[5m]))
```

### Label Best Practices

| ✅ GOOD Labels | ❌ BAD Labels |
|----------------|---------------|
| `service="bot"` | `user_id="123456789"` |
| `command="battle"` | `guild_id="987654321"` |
| `error_type="not_found"` | `correlation_id="abc123"` |
| `environment="production"` | `username="DRIPTVDD"` |

---

**Document Version:** 1.0  
**Cross-References:**
- [Telemetry Contract](../src/observability/TELEMETRY_CONTRACT.md)
- [Discord Observability](../src/observability/DISCORD_OBSERVABILITY.md)
- [Loki Query Suite](../docs/operations-bible/loki-query-suite.md)
- [Alerting Guide](./ALERTING-GUIDE.md)
