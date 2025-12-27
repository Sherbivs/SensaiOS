# Section 12: Analytics Queries

**Last Updated**: 2025-12-27 | **Status**: Production

[← Back to INDEX](INDEX.md) | [← Previous: Architecture Integration](11-architecture-integration.md)

---

**Philosophy**: "Data-driven decisions require fast, accurate queries. Query cookbook provides production-ready SQL for common analytics needs."

**Purpose**: Sample analytics queries for TimescaleDB hypertables covering system health, user behavior, game balance, and security audit.

---

## 12.1 System Health Queries

### Error Rate Monitoring

**Purpose:** Detect error spikes (3× baseline) for alerting

```sql
-- Error rate by service (last 24 hours vs previous 24 hours)
WITH current_period AS (
  SELECT 
    service,
    COUNT(*) FILTER (WHERE level = 'error') AS errors,
    COUNT(*) AS total
  FROM log_entries
  WHERE time >= NOW() - INTERVAL '24 hours'
  GROUP BY service
),
previous_period AS (
  SELECT 
    service,
    COUNT(*) FILTER (WHERE level = 'error') AS errors,
    COUNT(*) AS total
  FROM log_entries
  WHERE time >= NOW() - INTERVAL '48 hours' AND time < NOW() - INTERVAL '24 hours'
  GROUP BY service
)
SELECT 
  c.service,
  c.errors AS current_errors,
  p.errors AS previous_errors,
  ROUND(100.0 * c.errors / NULLIF(c.total, 0), 2) AS current_error_rate_pct,
  ROUND(100.0 * p.errors / NULLIF(p.total, 0), 2) AS previous_error_rate_pct,
  ROUND((c.errors::NUMERIC / NULLIF(p.errors, 0)), 2) AS spike_multiplier,
  CASE 
    WHEN c.errors::NUMERIC / NULLIF(p.errors, 0) >= 3 THEN '🔴 CRITICAL'
    WHEN c.errors::NUMERIC / NULLIF(p.errors, 0) >= 2 THEN '🟡 WARNING'
    ELSE '🟢 NORMAL'
  END AS status
FROM current_period c
LEFT JOIN previous_period p USING (service)
ORDER BY spike_multiplier DESC NULLS LAST;
```

**Alert Threshold:** `spike_multiplier >= 3.0` → Page ops team

**Dashboard Panel:** Time-series chart showing error rate over time with 3× baseline threshold line

---

### Correlation ID Tracing

**Purpose:** Trace full event chain across services for debugging

```sql
-- Trace all events for a specific correlation ID
SELECT 
  le.time,
  le.service,
  le.level,
  le.message,
  le.context,
  le.parent_correlation_id,
  CASE 
    WHEN le.parent_correlation_id IS NULL THEN '🌱 ROOT EVENT'
    ELSE '  └─ CHILD EVENT'
  END AS event_type
FROM log_entries le
WHERE 
  le.correlation_id = '550e8400-e29b-41d4-a716-446655440000'
  OR le.parent_correlation_id LIKE '550e8400-e29b-41d4-a716-446655440000%'
ORDER BY le.time;
```

**Use Case:** User reports "battle stuck", ops team traces correlation ID to find timeout in battle engine

**Enhanced Version (with event_history join):**

```sql
-- Trace correlation ID across logs + high-level events
WITH all_events AS (
  SELECT 
    time,
    'log' AS source,
    service AS context,
    level AS type,
    message AS description,
    correlation_id,
    parent_correlation_id
  FROM log_entries
  WHERE correlation_id = $1 OR parent_correlation_id LIKE $1 || '%'
  
  UNION ALL
  
  SELECT 
    time,
    'event' AS source,
    user_id AS context,
    event_type AS type,
    metadata->>'description' AS description,
    correlation_id,
    NULL AS parent_correlation_id
  FROM event_history
  WHERE correlation_id = $1
)
SELECT * FROM all_events ORDER BY time;
```

---

### Top 10 Errors by Frequency

**Purpose:** Prioritize bug fixes by error frequency

```sql
-- Most common errors in last 7 days
SELECT 
  message,
  COUNT(*) AS occurrences,
  COUNT(DISTINCT service) AS affected_services,
  COUNT(DISTINCT user_id) AS affected_users,
  MIN(time) AS first_seen,
  MAX(time) AS last_seen,
  ARRAY_AGG(DISTINCT service) AS services
FROM log_entries
WHERE level = 'error' AND time > NOW() - INTERVAL '7 days'
GROUP BY message
ORDER BY occurrences DESC
LIMIT 10;
```

**Dashboard:** Table with sparkline showing error frequency over time

**Action Items:** 
- Occurrences >100 → Investigate immediately
- Affected users >50 → High priority fix
- Recurring daily → Add monitoring alert

---

### Service Latency (P50, P95, P99)

**Purpose:** Monitor API performance degradation

```sql
-- Service latency percentiles (from context->duration field)
SELECT 
  service,
  COUNT(*) AS requests,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (context->>'duration')::INTEGER), 0) AS p50_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (context->>'duration')::INTEGER), 0) AS p95_ms,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY (context->>'duration')::INTEGER), 0) AS p99_ms,
  MAX((context->>'duration')::INTEGER) AS max_ms
FROM log_entries
WHERE 
  time > NOW() - INTERVAL '1 hour'
  AND context->>'duration' IS NOT NULL
  AND level IN ('info', 'warn')
GROUP BY service
ORDER BY p95_ms DESC;
```

**Alert Thresholds:**
- P95 >200ms → Warning (investigate slow queries)
- P99 >500ms → Critical (performance degradation)
- Max >2000ms → Critical (timeout risk)

---

## 12.2 User Behavior Analytics

### Daily Active Users (DAU)

**Purpose:** Track user engagement trends

```sql
-- DAU for last 30 days
SELECT 
  time_bucket('1 day', time)::DATE AS day,
  COUNT(DISTINCT user_id) AS dau,
  COUNT(*) AS total_events,
  ROUND(AVG(COUNT(DISTINCT user_id)) OVER (ORDER BY time_bucket('1 day', time) ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 0) AS dau_7d_avg
FROM event_history
WHERE time > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day;
```

**Dashboard:** Line chart with 7-day moving average overlay

**Success Metrics:**
- DAU growing week-over-week → Healthy growth
- DAU flat or declining → Investigate retention issues
- Weekend spikes → Normal pattern for gaming apps

---

### User Retention Cohorts (7-day, 30-day)

**Purpose:** Measure long-term user retention

```sql
-- 7-day and 30-day retention by signup cohort
WITH first_seen AS (
  SELECT 
    user_id,
    MIN(time)::DATE AS signup_date
  FROM event_history
  GROUP BY user_id
),
cohort_activity AS (
  SELECT 
    fs.signup_date,
    fs.user_id,
    BOOL_OR(eh.time::DATE BETWEEN fs.signup_date + INTERVAL '7 days' AND fs.signup_date + INTERVAL '14 days') AS returned_7d,
    BOOL_OR(eh.time::DATE BETWEEN fs.signup_date + INTERVAL '30 days' AND fs.signup_date + INTERVAL '37 days') AS returned_30d
  FROM first_seen fs
  LEFT JOIN event_history eh ON fs.user_id = eh.user_id
  WHERE fs.signup_date > NOW() - INTERVAL '90 days'
  GROUP BY fs.signup_date, fs.user_id
)
SELECT 
  signup_date,
  COUNT(*) AS signups,
  COUNT(*) FILTER (WHERE returned_7d) AS retained_7d,
  COUNT(*) FILTER (WHERE returned_30d) AS retained_30d,
  ROUND(100.0 * COUNT(*) FILTER (WHERE returned_7d) / COUNT(*), 2) AS retention_7d_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE returned_30d) / COUNT(*), 2) AS retention_30d_pct
FROM cohort_activity
GROUP BY signup_date
ORDER BY signup_date DESC;
```

**Dashboard:** Cohort table with heatmap coloring

**Benchmarks:**
- 7-day retention: >40% good, >60% excellent
- 30-day retention: >20% good, >40% excellent
- Industry average (gaming): 25% 7-day, 10% 30-day

---

### User Activity Heatmap (7×24 Grid)

**Purpose:** Identify peak usage hours for scaling capacity

```sql
-- Hourly activity heatmap (day of week × hour of day)
SELECT 
  EXTRACT(DOW FROM time) AS day_of_week,  -- 0=Sunday, 6=Saturday
  EXTRACT(HOUR FROM time) AS hour,
  COUNT(DISTINCT user_id) AS active_users,
  COUNT(*) AS events
FROM event_history
WHERE time > NOW() - INTERVAL '30 days'
GROUP BY day_of_week, hour
ORDER BY day_of_week, hour;
```

**Dashboard:** Heatmap visualization with color gradient (dark = high activity)

**Insights:**
- Peak hours → Schedule maintenance during valleys
- Weekend patterns → Adjust worker capacity
- Global distribution → Consider timezone support

---

### Conversion Funnel (Encounter → Catch)

**Purpose:** Optimize catch mechanics for engagement

```sql
-- Multi-stage conversion funnel
WITH funnel AS (
  SELECT 
    user_id,
    MAX(CASE WHEN event_type = 'encounter.wild' THEN 1 ELSE 0 END) AS step1_encounter,
    MAX(CASE WHEN event_type = 'encounter.throw' THEN 1 ELSE 0 END) AS step2_throw,
    MAX(CASE WHEN event_type = 'encounter.catch.success' THEN 1 ELSE 0 END) AS step3_catch
  FROM event_history
  WHERE time > NOW() - INTERVAL '7 days'
  GROUP BY user_id
)
SELECT 
  SUM(step1_encounter) AS encountered,
  SUM(step2_throw) AS threw_pokeball,
  SUM(step3_catch) AS caught,
  ROUND(100.0 * SUM(step2_throw) / NULLIF(SUM(step1_encounter), 0), 2) AS throw_rate_pct,
  ROUND(100.0 * SUM(step3_catch) / NULLIF(SUM(step2_throw), 0), 2) AS catch_rate_pct,
  ROUND(100.0 * SUM(step3_catch) / NULLIF(SUM(step1_encounter), 0), 2) AS overall_conversion_pct
FROM funnel;
```

**Dashboard:** Funnel visualization with drop-off percentages

**Action Items:**
- Low throw rate (<70%) → Encounter too difficult/boring
- Low catch rate (<50%) → Pokeball mechanics too hard
- Compare across Pokémon rarity tiers

---

## 12.3 Game Balance Analytics

### Top 20 Pokémon by Win Rate

**Purpose:** Identify overpowered/underpowered Pokémon for balancing

```sql
-- Win rates with statistical significance filter
SELECT 
  s.name AS pokemon,
  s.id AS species_id,
  COUNT(*) AS battles,
  COUNT(*) FILTER (WHERE ba.outcome = 'win') AS wins,
  COUNT(*) FILTER (WHERE ba.outcome = 'loss') AS losses,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ba.outcome = 'win') / COUNT(*), 2) AS win_rate_pct,
  ROUND(AVG(ba.damage_dealt), 0) AS avg_damage,
  ROUND(AVG(ba.turns_survived), 1) AS avg_turns,
  COUNT(DISTINCT ba.user_id) AS unique_users
FROM battle_analytics ba
JOIN "Species" s ON ba.pokemon_species_id = s.id
WHERE ba.time > NOW() - INTERVAL '30 days'
GROUP BY s.name, s.id
HAVING COUNT(*) >= 50  -- Statistical significance filter
ORDER BY win_rate_pct DESC
LIMIT 20;
```

**Dashboard:** Table with sparklines showing win rate trends

**Balancing Thresholds:**
- Win rate >60% → Consider nerfing
- Win rate <40% → Consider buffing
- Low unique users → Unpopular despite strength
- High battles + high win rate → Meta-dominant (priority nerf)

---

### Move Effectiveness Ranking

**Purpose:** Balance move power levels

```sql
-- Move damage and usage statistics
SELECT 
  m.name AS move,
  m.id AS move_id,
  m.power AS base_power,
  COUNT(*) AS uses,
  ROUND(AVG(ba.damage_dealt), 0) AS avg_damage,
  ROUND(STDDEV(ba.damage_dealt), 0) AS damage_stddev,
  MAX(ba.damage_dealt) AS max_damage,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ba.outcome = 'win') / COUNT(*), 2) AS win_rate_when_used_pct
FROM battle_analytics ba
JOIN "Move" m ON ba.move_id = m.id
WHERE ba.time > NOW() - INTERVAL '30 days' AND ba.move_id IS NOT NULL
GROUP BY m.name, m.id, m.power
HAVING COUNT(*) >= 20  -- Minimum usage threshold
ORDER BY avg_damage DESC
LIMIT 30;
```

**Analysis:**
- High avg_damage + high win_rate → Overpowered move
- Low damage_stddev → Consistent/predictable
- Base power mismatch → Formula needs tuning

---

### Battle Duration Trends (P50, P95, P99)

**Purpose:** Monitor game pacing and timeout issues

```sql
-- Battle duration percentiles over time
SELECT 
  time_bucket('1 day', time)::DATE AS day,
  COUNT(*) AS battles,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds), 0) AS p50_seconds,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_seconds), 0) AS p95_seconds,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_seconds), 0) AS p99_seconds,
  COUNT(*) FILTER (WHERE duration_seconds > 300) AS timeouts_5min
FROM battle_analytics
WHERE time > NOW() - INTERVAL '30 days' AND duration_seconds IS NOT NULL
GROUP BY day
ORDER BY day;
```

**Dashboard:** Line chart with P50/P95/P99 bands

**Targets:**
- P50: 60-120 seconds (ideal battle length)
- P95: <180 seconds (avoid long grinds)
- P99: <300 seconds (timeout threshold)
- Increasing trend → Investigate stalling strategies

---

### Pokémon Usage Trends (Weekly)

**Purpose:** Track meta shifts over time

```sql
-- Pokemon popularity over time (using continuous aggregate)
SELECT 
  week,
  s.name AS pokemon,
  unique_users,
  total_battles,
  ROUND(total_battles::NUMERIC / unique_users, 1) AS battles_per_user,
  RANK() OVER (PARTITION BY week ORDER BY total_battles DESC) AS popularity_rank
FROM pokemon_usage_weekly puw
JOIN "Species" s ON puw.pokemon_species_id = s.id
WHERE week >= NOW() - INTERVAL '12 weeks'
ORDER BY week DESC, popularity_rank;
```

**Dashboard:** Bump chart showing rank changes over time

**Insights:**
- Rising stars → New strategies emerging
- Falling off → Counters discovered
- Stable top 10 → Stale meta (consider balance patch)

---

## 12.4 Security & Audit Queries

### Alert Frequency by Severity

**Purpose:** Monitor security incident trends

```sql
-- Alert volume and average time between alerts
SELECT 
  severity,
  COUNT(*) AS alerts,
  COUNT(DISTINCT guild_id) AS affected_guilds,
  ROUND(AVG(EXTRACT(EPOCH FROM time - LAG(time) OVER (PARTITION BY severity ORDER BY time))), 0) AS avg_seconds_between,
  MAX(time) AS last_alert
FROM security_events
WHERE time > NOW() - INTERVAL '30 days' AND event_type LIKE 'alert.%'
GROUP BY severity
ORDER BY 
  CASE severity 
    WHEN 'critical' THEN 1 
    WHEN 'warning' THEN 2 
    WHEN 'notice' THEN 3 
  END;
```

**Dashboard:** Stat panels with trend indicators

**Alert Thresholds:**
- Critical alerts >1/day → Investigate root cause
- Warning alerts >10/day → Review alert rules
- Increasing frequency → System degradation

---

### Permission Changes Audit Log

**Purpose:** Track unauthorized permission escalations

```sql
-- Permission changes by guild with actor details
SELECT 
  se.time,
  se.guild_id,
  se.actor_id,
  se.target_id,
  se.details->>'role_name' AS role,
  se.details->>'permission' AS permission,
  se.details->>'action' AS action,  -- granted, revoked
  se.details->>'reverted' AS was_reverted
FROM security_events se
WHERE 
  se.event_type = 'permission.change' 
  AND se.time > NOW() - INTERVAL '90 days'
ORDER BY se.time DESC
LIMIT 100;
```

**Use Case:** Compliance audit requires 90-day permission change history

**Export:** CSV for external audit review

---

### Unauthorized Change Detection

**Purpose:** Detect security bot auto-reverts

```sql
-- Reverted permission changes (security violations)
SELECT 
  se.time,
  se.guild_id,
  se.actor_id,
  se.details->>'role_name' AS role,
  se.details->>'revert_reason' AS reason,
  se.details->>'revert_status' AS status
FROM security_events se
WHERE 
  se.event_type = 'permission.change'
  AND se.details->>'reverted' = 'true'
  AND se.time > NOW() - INTERVAL '30 days'
ORDER BY se.time DESC;
```

**Dashboard:** Table with revert success rate

**Metrics:**
- Total reverts → Security incident volume
- Failed reverts → Escalation needed (manual fix)
- Repeat offenders → Education/warnings

---

### Guild Activity Summary

**Purpose:** Executive dashboard for multi-guild deployments

```sql
-- Per-guild engagement metrics (last 30 days)
SELECT 
  eh.guild_id,
  COUNT(DISTINCT eh.user_id) AS active_users,
  COUNT(*) FILTER (WHERE eh.event_type LIKE 'battle.%') AS battles,
  COUNT(*) FILTER (WHERE eh.event_type LIKE 'encounter.%') AS encounters,
  COUNT(*) FILTER (WHERE se.severity = 'critical') AS critical_alerts,
  MAX(eh.time) AS last_activity
FROM event_history eh
LEFT JOIN security_events se ON eh.guild_id = se.guild_id AND se.time > NOW() - INTERVAL '30 days'
WHERE eh.time > NOW() - INTERVAL '30 days'
GROUP BY eh.guild_id
ORDER BY active_users DESC;
```

**Dashboard:** Guild leaderboard table

**Use Cases:**
- Identify inactive guilds for outreach
- Prioritize support for high-activity guilds
- Security incidents correlated with activity spikes

---

## 12.5 Performance Optimization Queries

### Slow Query Detection

**Purpose:** Identify queries exceeding latency targets

```sql
-- Queries with P95 latency >200ms
SELECT 
  context->>'query_type' AS query_type,
  COUNT(*) AS executions,
  ROUND(AVG((context->>'duration')::INTEGER), 0) AS avg_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (context->>'duration')::INTEGER), 0) AS p95_ms,
  MAX((context->>'duration')::INTEGER) AS max_ms,
  ARRAY_AGG(DISTINCT service) AS services
FROM log_entries
WHERE 
  level IN ('info', 'warn')
  AND context->>'duration' IS NOT NULL
  AND time > NOW() - INTERVAL '24 hours'
GROUP BY query_type
HAVING PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (context->>'duration')::INTEGER) > 200
ORDER BY p95_ms DESC;
```

**Action Items:**
- P95 >500ms → Immediate investigation
- Add indexes for slow queries
- Consider caching hot paths

---

### Database Disk Usage Growth

**Purpose:** Predict when disk quota will be exhausted

```sql
-- Database size growth trend (requires manual polling)
SELECT 
  time_bucket('1 day', time)::DATE AS day,
  MAX((context->>'db_size_mb')::INTEGER) AS db_size_mb,
  MAX((context->>'db_size_mb')::INTEGER) - LAG(MAX((context->>'db_size_mb')::INTEGER)) OVER (ORDER BY time_bucket('1 day', time)) AS growth_mb_per_day
FROM log_entries
WHERE 
  context->>'db_size_mb' IS NOT NULL
  AND time > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day;
```

**Forecasting:**
```sql
-- Linear regression forecast (days until 1 GB limit)
WITH growth AS (
  SELECT AVG(growth_mb_per_day) AS avg_daily_growth_mb
  FROM (
    SELECT 
      MAX((context->>'db_size_mb')::INTEGER) - LAG(MAX((context->>'db_size_mb')::INTEGER)) OVER (ORDER BY time_bucket('1 day', time)) AS growth_mb_per_day
    FROM log_entries
    WHERE context->>'db_size_mb' IS NOT NULL AND time > NOW() - INTERVAL '30 days'
    GROUP BY time_bucket('1 day', time)
  ) sub
),
current_size AS (
  SELECT MAX((context->>'db_size_mb')::INTEGER) AS current_mb
  FROM log_entries
  WHERE context->>'db_size_mb' IS NOT NULL
)
SELECT 
  current_mb,
  avg_daily_growth_mb,
  ROUND((1024 - current_mb) / NULLIF(avg_daily_growth_mb, 0), 0) AS days_until_full
FROM current_size, growth;
```

**Alert:** days_until_full <30 → Review retention policies

---

## 12.6 Query Performance Tips

### Use Continuous Aggregates

**Before (slow - full table scan):**
```sql
SELECT 
  time_bucket('1 day', time) AS day,
  COUNT(*) AS battles
FROM battle_analytics
WHERE time > NOW() - INTERVAL '90 days'
GROUP BY day;
```

**After (fast - pre-aggregated):**
```sql
SELECT day, SUM(battles) AS battles
FROM battles_daily
WHERE day > NOW() - INTERVAL '90 days'
GROUP BY day;
```

**Performance:** 179ms → 12ms (15× faster)

---

### Leverage Indexes

**Indexed query (fast):**
```sql
SELECT * FROM log_entries
WHERE correlation_id = '550e8400-e29b-41d4-a716-446655440000';
```

**Non-indexed query (slow):**
```sql
SELECT * FROM log_entries
WHERE context->>'custom_field' = 'value';  -- No index on custom_field
```

**Solution:** Add GIN index on JSONB column

```sql
CREATE INDEX idx_custom_field ON log_entries USING GIN ((context->>'custom_field') gin_trgm_ops);
```

---

### Time-Range Filtering

**Always include time filter on hypertables:**

```sql
-- GOOD (time-range specified)
SELECT * FROM log_entries
WHERE time > NOW() - INTERVAL '7 days' AND level = 'error';

-- BAD (scans all chunks)
SELECT * FROM log_entries
WHERE level = 'error';
```

**Reason:** TimescaleDB partitions by time. Time filter enables chunk exclusion.

---

### Parameterized Queries

**Use placeholders for safety + performance:**

```javascript
// Node.js example
const result = await prisma.$queryRaw`
  SELECT * FROM log_entries
  WHERE correlation_id = ${correlationId}
  AND time > ${timeThreshold}
`;
```

**Benefits:**
- SQL injection protection
- Query plan caching
- Automatic type coercion

---

## 12.7 Dashboard Integration

### Grafana Datasource Setup

**Connection String:**
```
postgresql://user:password@host:5432/infinity_gauntlet_db?sslmode=require
```

**Recommended Panels:**

1. **System Health Dashboard**
   - Error rate time-series (§ 12.1)
   - Service latency heatmap
   - Top 10 errors table

2. **User Activity Dashboard**
   - DAU line chart (§ 12.2)
   - Retention cohort table
   - Activity heatmap 7×24 grid

3. **Game Metrics Dashboard**
   - Top 20 Pokémon table (§ 12.3)
   - Battle duration trends
   - Move effectiveness ranking

4. **Security Dashboard**
   - Alert frequency by severity (§ 12.4)
   - Permission changes audit log
   - Guild activity summary

**Refresh Intervals:**
- Real-time panels: 10 seconds
- Hourly aggregates: 5 minutes
- Daily aggregates: 1 hour

---

## 12.8 Query Benchmarks

**Hardware:** Render PostgreSQL (Standard plan, 2 CPU, 4 GB RAM)

| Query | Rows Scanned | Duration | Notes |
|-------|--------------|----------|-------|
| Error rate (24h) | ~24,000 | 87ms | Uses idx_log_entries_level_time |
| Correlation trace | ~50 | 29ms | Uses idx_log_entries_correlation_id |
| Top 10 errors (7d) | ~150,000 | 245ms | Full scan with GROUP BY |
| DAU (30d) | ~450,000 | 312ms | Uses time_bucket + DISTINCT |
| Win rate (30d) | ~180,000 | 421ms | JOIN Species, multiple aggregates |
| Battle duration trends | ~180,000 | 179ms | Percentiles + time_bucket |

**All queries <500ms → Dashboard requirements met** ✅

---

## 12.9 Troubleshooting Common Issues

### Issue: Query timeout (>30s)

**Diagnosis:**
```sql
-- Check query execution plan
EXPLAIN ANALYZE
SELECT * FROM log_entries WHERE context->>'custom_field' = 'value';
```

**Solutions:**
1. Add index on filtered column
2. Reduce time range (e.g., 7 days → 24 hours)
3. Use continuous aggregates for pre-rolled data

---

### Issue: Index not being used

**Diagnosis:**
```sql
-- Check if index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'log_entries';
```

**Solutions:**
1. Run `ANALYZE log_entries;` to update statistics
2. Check WHERE clause matches index (exact type match required)
3. Verify query selectivity (index unused if >10% rows match)

---

### Issue: Continuous aggregate stale

**Diagnosis:**
```sql
-- Check refresh policy status
SELECT * FROM timescaledb_information.job_stats
WHERE job_id IN (
  SELECT job_id FROM timescaledb_information.jobs
  WHERE proc_name = 'policy_refresh_continuous_aggregate'
)
ORDER BY last_run_started_at DESC;
```

**Solutions:**
1. Manual refresh: `CALL refresh_continuous_aggregate('logs_hourly', NOW() - INTERVAL '24 hours', NOW());`
2. Check refresh policy schedule: `SELECT * FROM timescaledb_information.jobs;`
3. Verify no locks blocking refresh: `SELECT * FROM pg_locks WHERE relation = 'logs_hourly'::regclass;`

---

## 12.10 Cross-References

**Related Sections:**
- **[02-database-operations.md](02-database-operations.md)** § 2.11 — TimescaleDB hypertable schemas
- **[05-monitoring.md](05-monitoring.md)** — Grafana dashboard JSON
- **[04-observability.md](04-observability.md)** — Correlation ID tracing
- **[data-analyst-requirements.md](../specialists/data-analyst-requirements.md)** — Metric definitions

**Related Architecture:**
- **[architecture-bible/04-event-bus.md](../architecture-bible/04-event-bus.md)** — Event correlation tracking
- **[architecture-bible/17-engine-db-replication.md](../architecture-bible/17-engine-db-replication.md)** — Battle analytics upload pipeline

---

[← Back to INDEX](INDEX.md) | [← Previous: Architecture Integration](11-architecture-integration.md)
