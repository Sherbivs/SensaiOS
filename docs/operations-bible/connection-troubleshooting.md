# Connection Troubleshooting Runbook

**Purpose:** Diagnose and resolve database connection pool issues  
**Part of:** Database-Centric Development Plan (Sprint 3, P2-003)  
**Severity Guide:** P0 = User-facing outage, P1 = Degraded performance, P2 = Warning only

---

## Table of Contents

1. [Quick Diagnostics](#1-quick-diagnostics)
2. [Pool Exhaustion](#2-pool-exhaustion)
3. [Connection Leaks](#3-connection-leaks)
4. [Slow Connections](#4-slow-connections)
5. [Connection Timeouts](#5-connection-timeouts)
6. [High Latency](#6-high-latency)
7. [Monitoring & Alerts](#7-monitoring--alerts)
8. [Prevention Checklist](#8-prevention-checklist)

---

## 1. Quick Diagnostics

### Check Current Pool Status

```bash
# Via /ops command in Discord
/ops database pool

# Via Prometheus metrics
curl http://localhost:9090/metrics | grep infinity_gauntlet_db_pool

# Via PostgreSQL directly
SELECT 
  datname,
  numbackends as connections,
  xact_commit + xact_rollback as transactions
FROM pg_stat_database 
WHERE datname = current_database();
```

### Key Metrics to Check

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Pool Utilization | <70% | 70-90% | >90% |
| Waiting Requests | 0 | 1-3 | >3 |
| Health Score | >80 | 50-80 | <50 |
| Suspected Leaks | 0 | 1 | >1 |
| Oldest Connection | <60s | 60-300s | >300s |

### Health Check Endpoint

```bash
# Returns JSON health report
curl http://localhost:3000/health/database
```

---

## 2. Pool Exhaustion

### Symptoms
- Requests timing out waiting for connections
- `PrismaClientKnownRequestError: Timed out fetching a new connection`
- High `waiting` count in pool metrics
- Pool utilization at 100%

### Diagnosis

```sql
-- Check active connections
SELECT 
  count(*) as total,
  state,
  wait_event_type,
  query
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state, wait_event_type, query
ORDER BY count(*) DESC;

-- Find long-running queries
SELECT 
  pid,
  now() - query_start as duration,
  state,
  query
FROM pg_stat_activity
WHERE datname = current_database()
  AND state != 'idle'
  AND now() - query_start > interval '30 seconds'
ORDER BY duration DESC;
```

### Immediate Actions

1. **Kill long-running queries (if safe)**
   ```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE datname = current_database()
     AND state != 'idle'
     AND now() - query_start > interval '5 minutes';
   ```

2. **Restart affected service**
   ```bash
   # Via Render dashboard or CLI
   render services restart <service-id>
   ```

3. **Temporarily increase pool size**
   ```typescript
   // In database-pool-config.ts
   'discord-bots': {
     max: 15,  // Increased from 10
     // ...
   }
   ```

### Long-term Fixes

1. **Identify query hotspots**
   - Enable slow query logging (threshold: 100ms)
   - Review `pg_stat_statements` for frequent queries
   - Add indexes for common WHERE clauses

2. **Optimize connection usage**
   - Use `findFirst` instead of `findMany()[0]`
   - Batch related queries in transactions
   - Use eager loading (`include`) to prevent N+1

3. **Scale horizontally**
   - Add read replicas for read-heavy workloads
   - Implement write-behind caching for non-critical writes

---

## 3. Connection Leaks

### Symptoms
- Pool utilization increases over time without load increase
- Connections with long idle time but not released
- `suspected_leak` warnings in logs
- Health score degrading over service lifetime

### Diagnosis

```bash
# Check connection age distribution
curl http://localhost:9090/metrics | grep oldest_age_seconds

# In logs, look for:
# "Suspected connection leak detected"
# "connectionId": "xxx", "ageMs": xxx, "idleTimeMs": xxx
```

```sql
-- Find idle connections
SELECT 
  pid,
  usename,
  client_addr,
  state,
  now() - state_change as idle_time,
  query
FROM pg_stat_activity
WHERE datname = current_database()
  AND state = 'idle'
  AND now() - state_change > interval '1 minute'
ORDER BY idle_time DESC;
```

### Common Leak Patterns

**1. Missing `finally` block:**
```typescript
// ❌ LEAK: If error thrown, connection not released
const client = await pool.connect();
const result = await client.query('...');
client.release();  // Never reached on error

// ✅ FIXED: Always release
const client = await pool.connect();
try {
  const result = await client.query('...');
  return result;
} finally {
  client.release();
}
```

**2. Unclosed transactions:**
```typescript
// ❌ LEAK: Transaction never committed/rolled back
await prisma.$executeRaw`BEGIN`;
await prisma.trainer.update({...});
// Missing: await prisma.$executeRaw`COMMIT`;

// ✅ FIXED: Use Prisma transactions
await prisma.$transaction(async (tx) => {
  await tx.trainer.update({...});
});
```

**3. Forgotten event listeners:**
```typescript
// ❌ LEAK: Listener keeps connection alive
prisma.$on('query', (e) => {
  // Handler holds reference to connection context
});

// ✅ FIXED: Clean up on shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
});
```

### Resolution Steps

1. **Identify leaking code path**
   - Check recent deployments
   - Review code using raw SQL or `$executeRaw`
   - Search for missing `try/finally` patterns

2. **Force cleanup (emergency)**
   ```bash
   # Restart service to release all connections
   render services restart <service-id>
   ```

3. **Implement monitoring**
   ```typescript
   import { startConnectionHealthMonitoring } from '../services/connection-health-monitor.js';
   
   // On startup
   startConnectionHealthMonitoring({
     leakThresholdMs: 30_000,  // Alert if connection idle >30s
   });
   ```

---

## 4. Slow Connections

### Symptoms
- Connection acquisition taking >1 second
- `connection_timeout_ms` warnings in logs
- High `wait_event_type: Client` in `pg_stat_activity`

### Diagnosis

```sql
-- Check for connection bottlenecks
SELECT 
  wait_event_type,
  wait_event,
  count(*)
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY wait_event_type, wait_event
ORDER BY count(*) DESC;

-- Check SSL handshake overhead
SELECT 
  ssl,
  count(*) 
FROM pg_stat_activity 
GROUP BY ssl;
```

### Resolution

1. **Increase min connections** (keep warm pool)
   ```typescript
   'discord-bots': {
     min: 3,  // Increased from 2
     // ...
   }
   ```

2. **Reduce connection timeout** for faster failover
   ```typescript
   connectionTimeoutMs: 5_000,  // Reduced from 10s
   ```

3. **Check network latency**
   ```bash
   # Ping database host
   ping <db-host>
   
   # Test TCP connection time
   time nc -zv <db-host> 5432
   ```

---

## 5. Connection Timeouts

### Symptoms
- `PrismaClientKnownRequestError: Timed out fetching a new connection from the pool`
- `connect ETIMEDOUT` errors
- Intermittent database unavailability

### Diagnosis

```bash
# Check if database is reachable
pg_isready -h <host> -p 5432

# Check connection limits
psql -c "SHOW max_connections;"

# Check current connection count
psql -c "SELECT count(*) FROM pg_stat_activity;"
```

### Resolution

1. **Check firewall/security groups**
   - Render PostgreSQL allows connections from Render services
   - External access may require allowlisting IP

2. **Verify connection string**
   ```bash
   echo $PROD_DATABASE_URL
   # Should be: postgresql://user:pass@host:5432/db
   ```

3. **Increase timeout (temporary)**
   ```typescript
   connectionTimeoutMs: 30_000,  // Increased from 10s
   ```

4. **Enable connection retry**
   ```bash
   # Environment variables
   PRISMA_CONNECT_MAX_RETRIES=5
   PRISMA_CONNECT_RETRY_DELAY_MS=1000
   ```

---

## 6. High Latency

### Symptoms
- Query response times >100ms consistently
- Slow query warnings in logs
- Users experiencing lag

### Diagnosis

```sql
-- Enable pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slowest queries by total time
SELECT 
  substring(query, 1, 80) as query_preview,
  calls,
  total_exec_time / 1000 as total_seconds,
  mean_exec_time as avg_ms,
  rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Find queries with high average time
SELECT 
  substring(query, 1, 80) as query_preview,
  calls,
  mean_exec_time as avg_ms
FROM pg_stat_statements
WHERE calls > 10
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Resolution

1. **Add missing indexes**
   ```sql
   -- Find sequential scans on large tables
   SELECT 
     relname,
     seq_scan,
     seq_tup_read,
     idx_scan,
     idx_tup_fetch
   FROM pg_stat_user_tables
   WHERE seq_scan > 0
   ORDER BY seq_tup_read DESC
   LIMIT 10;
   ```

2. **Analyze query plans**
   ```sql
   EXPLAIN (ANALYZE, BUFFERS) 
   SELECT * FROM "Trainer" WHERE "discordId" = '123456789';
   ```

3. **Update table statistics**
   ```sql
   ANALYZE "Trainer";
   ANALYZE "Pokemon";
   -- Or for all tables:
   VACUUM ANALYZE;
   ```

4. **Consider caching**
   - Enable L1 cache for reference data
   - Use query result caching for expensive aggregations

---

## 7. Monitoring & Alerts

### Prometheus Alert Rules

```yaml
# Add to prometheus-alerts.yml
groups:
  - name: database_connection_alerts
    rules:
      - alert: PoolExhaustionWarning
        expr: infinity_gauntlet_db_pool_utilization_percent > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database pool utilization high"
          description: "Pool utilization {{ $value }}% for {{ $labels.service }}"

      - alert: PoolExhaustionCritical
        expr: infinity_gauntlet_db_pool_utilization_percent > 95
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database pool near exhaustion"
          description: "Pool utilization {{ $value }}% - immediate action required"

      - alert: ConnectionLeakDetected
        expr: increase(infinity_gauntlet_conn_leaks_detected_total[5m]) > 0
        labels:
          severity: warning
        annotations:
          summary: "Connection leak detected"
          description: "{{ $value }} suspected leaks in last 5 minutes"

      - alert: PoolHealthDegraded
        expr: infinity_gauntlet_conn_health_score < 50
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Pool health degraded"
          description: "Health score {{ $value }} for {{ $labels.service }}"
```

### Grafana Dashboard Panels

**Panel 1: Pool Utilization Over Time**
```
Query: infinity_gauntlet_db_pool_utilization_percent
Thresholds: 70 (warning), 90 (critical)
```

**Panel 2: Connection States**
```
Query: infinity_gauntlet_db_pool_connections{state=~"acquired|idle|waiting"}
Legend: {{state}}
```

**Panel 3: Health Score**
```
Query: infinity_gauntlet_conn_health_score
Gauge: 0-100, thresholds at 50, 80
```

**Panel 4: Query Latency Percentiles**
```
Query: histogram_quantile(0.95, infinity_gauntlet_db_query_duration_seconds_bucket)
```

---

## 8. Prevention Checklist

### Code Review Checklist

- [ ] All database operations use repository pattern
- [ ] No raw `$executeRaw` without transaction wrapper
- [ ] Proper error handling with `try/finally`
- [ ] N+1 queries prevented with `include`
- [ ] Pagination on list endpoints
- [ ] Appropriate indexes exist for WHERE clauses

### Deployment Checklist

- [ ] Connection pool limits configured for service
- [ ] Health monitoring enabled
- [ ] Slow query threshold set (100ms)
- [ ] Alert rules deployed
- [ ] Runbook accessible to on-call

### Operational Checklist

- [ ] Review pool metrics weekly
- [ ] Check for slow query trends
- [ ] Validate index usage monthly
- [ ] Test failover procedures quarterly

---

## Quick Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVICE_NAME` | unknown | Service identifier for pool config |
| `SLOW_QUERY_THRESHOLD_MS` | 100 | Log queries slower than this |
| `PRISMA_CONNECT_MAX_RETRIES` | 3 | Connection retry count |
| `PRISMA_HEARTBEAT_INTERVAL_MS` | 30000 | Health check interval |

### Key Files

| File | Purpose |
|------|---------|
| `src/config/database-pool-config.ts` | Pool limits per service |
| `src/services/database-metrics.ts` | Prometheus metrics |
| `src/services/connection-health-monitor.ts` | Leak detection |
| `ops/prometheus-alerts.yml` | Alert rules |

### Emergency Contacts

- **Database Issues:** Check Render dashboard status
- **Service Restart:** Use Render dashboard or `render services restart`
- **Escalation:** See `playbooks/escalate.md`

---

**Last Updated:** 2025-12-04  
**Author:** DevOps Specialist, Database Specialist  
**Part of:** Database-Centric Development Plan Sprint 3
