# Alerting Guide — Infinity Gauntlet

> **Created:** 2025-12-28  
> **Status:** AUTHORITATIVE  
> **Purpose:** Alert design, lifecycle, runbook patterns, and response procedures  
> **Location:** All alert definitions in `ops/*.yml`

---

## 📋 Alert Inventory

| File | Purpose | Count | Channels |
|------|---------|-------|----------|
| `prometheus-alerts.yml` | Security & resource metrics | ~30 | Discord DM, Logs |
| `grafana-alert-rules-v2.yml` | Grafana-native alerts | ~15 | Grafana notifications |
| `grafana-loki-alert-rules.yml` | Log-based alerts | ~10 | Grafana notifications |

---

## 1. Alert Design Principles

### 1.1 Severity Levels

| Level | Response Time | Criteria | Notification |
|-------|--------------|----------|--------------|
| **Critical** | <15 min | Service down, data loss risk | Page on-call + DM DRIPTVDD |
| **Warning** | <1 hour | Performance degraded, approaching limits | Team channel |
| **Info** | Next business day | Anomalies, maintenance needed | Log only |

### 1.2 Alert Quality Rules

**GOOD alerts are:**
- ✅ **Actionable** — Someone can do something about it
- ✅ **Urgent** — Needs attention before impact
- ✅ **Symptomatic** — Indicates user-facing issue
- ✅ **Documented** — Has runbook link

**BAD alerts are:**
- ❌ **Noisy** — Fires frequently without action needed
- ❌ **Vague** — "Something is wrong" with no details
- ❌ **Unactionable** — No clear response path
- ❌ **Missing context** — No runbook, no next steps

### 1.3 The 3 A's of Alerting

1. **Alert** — Signal that something needs attention
2. **Annotate** — Provide context (what, when, severity)
3. **Action** — Link to runbook with specific steps

---

## 2. Alert Lifecycle

```
┌─────────────┐
│   NORMAL    │ ← System within thresholds
└──────┬──────┘
       │ Threshold breached
       ▼
┌─────────────┐
│   PENDING   │ ← Waiting for "for" duration
│   (wait)    │   (prevents flapping alerts)
└──────┬──────┘
       │ Duration exceeded
       ▼
┌─────────────┐     Notification sent
│   FIRING    │────────────────────────►  📱 On-call
│             │                           📧 Email
└──────┬──────┘                           💬 Discord DM
       │
       │ Condition resolves
       ▼
┌─────────────┐
│  RESOLVED   │ ← Recovery notification sent
└─────────────┘
```

### 2.1 The "for" Duration

**Purpose:** Prevent alert flapping from transient issues.

| Alert Type | Recommended "for" | Reason |
|------------|-------------------|--------|
| Service down | 1-2 minutes | Quick detection critical |
| High error rate | 5 minutes | Avoid transient spikes |
| Resource pressure | 10-15 minutes | Gradual issues |
| Security threats | 1 minute | Immediate response needed |

```yaml
# Example: 5-minute sustained error rate
- alert: HighErrorRate
  expr: error_rate > 0.05
  for: 5m  # Must be > 5% for 5 consecutive minutes
```

---

## 3. Runbook Pattern

### 3.1 Required Annotations

**Every alert MUST have:**

```yaml
annotations:
  summary: "Short one-liner (emoji + description)"
  description: "Detailed context with {{ $value }} templating"
  runbook_url: "Full URL to runbook section"
  action: "First 2-3 steps to take"
```

### 3.2 Runbook Structure

Each runbook section should include:

```markdown
## [Alert Name]

### Symptoms
- What the user/operator sees
- Related metrics/logs to check

### Possible Causes
1. Most common cause
2. Second most common
3. Rare but possible

### Diagnosis Steps
1. `command to run`
2. Check this dashboard
3. Query these logs

### Resolution Steps
1. If cause A: do X
2. If cause B: do Y
3. If unknown: escalate to Z

### Prevention
- Configuration change
- Monitoring improvement
- Capacity planning
```

### 3.3 Example: High Error Rate Runbook

```markdown
## High Error Rate Alert

### Symptoms
- Error rate > 5% sustained for 5+ minutes
- Users reporting failed commands
- Increased `/ops error` output

### Possible Causes
1. **Database connection issues** — Most common
2. **Discord API rate limiting** — Check rate limit metrics
3. **Bad deployment** — Recent code change
4. **External dependency down** — PokeAPI, etc.

### Diagnosis Steps
1. Check database: `npm run db:cli -- status`
2. Check recent errors: `/ops error recent`
3. Check Discord rate limits: `{service="bot"} | json | error_code="429"`
4. Check recent deploys: Render dashboard → Deploys

### Resolution Steps
1. **Database down**: Restart Prisma connection or restart service
2. **Rate limited**: Wait for reset, reduce request rate
3. **Bad deploy**: Rollback via Render dashboard
4. **External down**: Enable fallback/cache mode

### Prevention
- Add circuit breaker to external calls
- Increase rate limit headroom
- Implement query caching
```

---

## 4. Alert Categories

### 4.1 Security Alerts (Critical)

| Alert | Expression | For | Runbook |
|-------|------------|-----|---------|
| `CriticalThreatDetected` | `threats{severity="CRITICAL"} > 0` | 1m | security-incidents.md |
| `IntegrityCheckFailed` | `integrity_failed > 0` | 1m | integrity-failure.md |
| `ArchiveSignatureInvalid` | `signature_verified == 0` | 2m | archive-integrity.md |

### 4.2 Availability Alerts

| Alert | Expression | For | Runbook |
|-------|------------|-----|---------|
| `ServiceDown` | `up == 0` | 1m | service-recovery.md |
| `HighErrorRate` | `error_rate > 0.05` | 5m | high-error-rate.md |
| `GatewayDisconnected` | `gateway_state != 2` | 2m | discord-gateway.md |

### 4.3 Performance Alerts

| Alert | Expression | For | Runbook |
|-------|------------|-----|---------|
| `HighLatency` | `p95_latency > 2s` | 5m | latency-issues.md |
| `SlowQueries` | `query_p95 > 500ms` | 5m | query-optimization.md |
| `CacheHitRateLow` | `hit_rate < 0.80` | 15m | cache-issues.md |

### 4.4 Capacity Alerts

| Alert | Expression | For | Runbook |
|-------|------------|-----|---------|
| `DiskPressure` | `disk_usage > 0.85` | 5m | disk-pressure.md |
| `MemoryPressure` | `memory_usage > 0.90` | 5m | memory-pressure.md |
| `QueueBackpressure` | `queue_depth > 7500` | 5m | backpressure.md |

---

## 5. Notification Channels

### 5.1 Current Channels

| Channel | Type | Alerts | Config |
|---------|------|--------|--------|
| DRIPTVDD DM | Discord DM | Critical | Bot direct message |
| #alerts channel | Discord webhook | Warning+ | Grafana notification |
| Console logs | Stdout | All | Docker logs |
| Loki | Log aggregator | All | Persistent storage |

### 5.2 Notification Templates

**Critical Alert DM:**
```
🚨 CRITICAL ALERT: {alert_name}

Summary: {summary}
Value: {value}
Since: {firing_time}

Action: {action_steps}

Runbook: {runbook_url}
```

**Warning Alert Webhook:**
```json
{
  "embeds": [{
    "title": "⚠️ {alert_name}",
    "description": "{description}",
    "color": 16776960,
    "fields": [
      { "name": "Value", "value": "{value}", "inline": true },
      { "name": "Duration", "value": "{duration}", "inline": true }
    ],
    "footer": { "text": "Runbook: {runbook_url}" }
  }]
}
```

---

## 6. Testing Alerts

### 6.1 Manual Testing

```bash
# Prometheus: Trigger test alert
curl -X POST http://localhost:9090/-/reload

# Grafana: Test notification channel
# Dashboard → Alerting → Contact points → Test
```

### 6.2 Alert Validation Checklist

Before deploying new alert:

- [ ] Expression returns expected value
- [ ] "for" duration is appropriate
- [ ] Severity matches impact
- [ ] Runbook exists and is accurate
- [ ] Notification channel configured
- [ ] Test fired successfully
- [ ] Resolution clears alert

---

## 7. Alert Maintenance

### 7.1 Monthly Review

1. **Noise audit** — Which alerts fired most?
2. **False positives** — Adjust thresholds
3. **Missing coverage** — What incidents had no alert?
4. **Runbook accuracy** — Update based on incidents

### 7.2 Post-Incident Updates

After every incident:

1. **Was there an alert?** If not, create one
2. **Was it actionable?** If not, improve runbook
3. **Was timing right?** Adjust "for" duration
4. **Was severity correct?** Adjust level

---

## 8. Quick Reference: Alert Template

```yaml
groups:
  - name: infinity_gauntlet_alerts
    interval: 30s
    rules:
      - alert: AlertName
        expr: metric_expression > threshold
        for: 5m
        labels:
          severity: warning  # critical, warning, info
          category: performance  # security, availability, performance, capacity
          service: bot  # bot, security, database, cache
        annotations:
          summary: "⚠️ Short description with {{ $value }}"
          description: |
            Detailed description explaining:
            - What is happening
            - Current value: {{ $value }}
            - Threshold: X
            - Impact: Y
          runbook_url: "https://github.com/Sherbivs/Infinity-Gauntlet/blob/main/docs/operations-bible/08-recovery-runbook.md#section"
          action: |
            1. First step to take
            2. Second step
            3. Escalate if unresolved
```

---

**Document Version:** 1.0  
**Cross-References:**
- [Recovery Runbook](../docs/operations-bible/08-recovery-runbook.md)
- [Monitoring](../docs/operations-bible/05-monitoring.md)
- [Telemetry Contract](../src/observability/TELEMETRY_CONTRACT.md)
- [Grafana Dashboards](./GRAFANA-DASHBOARDS.md)
