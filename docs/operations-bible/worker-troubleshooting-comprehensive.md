# Worker Troubleshooting Guide — Comprehensive Reference
**Version:** 1.0  
**Last Updated:** 2025-12-02  
**Scope:** Complete troubleshooting procedures for ALL worker failure scenarios  
**Target Audience:** Operations team, DevOps engineers, on-call responders

---

## Table of Contents

1. [Overview](#overview)
2. [Worker Architecture](#worker-architecture)
3. [Failure Scenarios](#failure-scenarios)
   - [Startup Failures](#startup-failures)
   - [Runtime Errors](#runtime-errors)
   - [Performance Degradation](#performance-degradation)
   - [Resource Exhaustion](#resource-exhaustion)
   - [Network Issues](#network-issues)
   - [Database Connectivity](#database-connectivity)
   - [Configuration Errors](#configuration-errors)
   - [Version Mismatches](#version-mismatches)
4. [Debug Procedures](#debug-procedures)
5. [Recovery Procedures](#recovery-procedures)
6. [Root Cause Analysis](#root-cause-analysis)
7. [Escalation Procedures](#escalation-procedures)
8. [Monitoring & Alerts](#monitoring-alerts)

---

## Overview

### Purpose
This guide provides **exhaustive troubleshooting procedures** for all worker subsystems in the Infinity Gauntlet application. Every failure scenario is documented with:
- **Symptoms:** Observable indicators of the problem
- **Diagnosis:** Step-by-step investigation procedures
- **Resolution:** Immediate remediation steps
- **Prevention:** Long-term fixes to prevent recurrence
- **Escalation:** When and how to escalate to senior engineers

### Worker Inventory

The application runs **9 worker subsystems** across **7 Render services**:

| Worker Name | Service | Purpose | Criticality | Startup Order |
|------------|---------|---------|-------------|---------------|
| **Engine DB Workers** | `infinity-gauntlet-bot` | Background task coordination | HIGH | After Service Registry |
| - Cache Refresh Worker | (same) | Hourly L1 cache refresh | MEDIUM | +5s stagger |
| - Write Buffer Flusher | (same) | 30s write buffer flush | HIGH | +10s stagger |
| - Read-DB Sync Worker | (same) | Daily PROD → Read-DB sync | MEDIUM | Render cron |
| - Write-DB Validator | (same) | 10min validation + upload | HIGH | +15s stagger |
| - Maintenance Worker | (same) | 8-hour maintenance cycle | LOW | +20s stagger |
| **Database Workers** | (same) | PostgreSQL + TimescaleDB operations | CRITICAL | After Prisma init |
| - PROD Postgres Worker | (same) | Primary database operations | CRITICAL | Startup |
| - TimescaleDB Worker | (same) | Time-series log ingestion | HIGH | Startup |
| - Engine Read Worker | (same) | Read-DB SQLite operations | MEDIUM | Startup |
| - Engine Write Worker | (same) | Write-DB SQLite operations | MEDIUM | Startup |
| **Error Learning Worker** | (same) | Hourly error pattern analysis | LOW | After Engine DB |
| **Log Ingestion Worker** | (same) | Event Bus → TimescaleDB pipeline | HIGH | After Service Registry |
| **Outbox Worker** | `infinity-gauntlet-outbox` | Async message delivery | HIGH | Independent |
| **Cache Worker** | `infinity-gauntlet-cache` | Runtime cache maintenance | MEDIUM | Independent |
| **Data Pipeline Worker** | `infinity-gauntlet-data-pipeline` | Reference data updates | LOW | Independent |
| **Security Worker** | `infinity-gauntlet-security` | Permission guardrails | CRITICAL | Independent |
| **Pokedex Cache Worker** | `pokedex-cache-worker` | External data sync | LOW | Independent |
| **Pokedex Cache Failsafe** | `pokedex-cache-failsafe` | Weekly fallback refresh | LOW | Cron |

### Health Check Commands

All workers are monitored via `/ops` Discord commands:

```
/ops workers              # Shows ALL workers status
/ops workers detailed:true  # Shows detailed metrics (success/error counts, latency, throughput)
/ops database             # Shows all 4 database workers
/ops database worker:prod # Shows PROD Postgres worker only
/ops database worker:timescale # Shows TimescaleDB worker only
/ops engine               # Shows Engine DB runtime status
```

---

## Worker Architecture

### Initialization Flow

```
Application Startup
│
├─ Service Registry Init (singleton)
│  └─ Registers all services with dependencies
│
├─ Database Connection (blocking)
│  ├─ PROD Postgres (PROD_DATABASE_URL)
│  ├─ TimescaleDB (TIMESCALE_DB_URL)
│  ├─ Engine Read-DB (SQLite)
│  └─ Engine Write-DB (SQLite)
│
├─ Engine DB Init (parallel with Bot)
│  ├─ Validate config
│  ├─ Init Read-DB → L1 Cache load (background)
│  ├─ Init Write-DB → WAL replay
│  ├─ Start Engine Workers (staggered)
│  │  ├─ Cache Refresh (+5s)
│  │  ├─ Buffer Flusher (+10s)
│  │  ├─ Validator (+15s)
│  │  └─ Maintenance (+20s)
│  ├─ Start Error Learning Worker
│  └─ Start Log Ingestion Worker
│
├─ Discord Bot Init (parallel with Engine)
│  ├─ Client connect
│  ├─ Commands load (lazy)
│  └─ Event handlers register
│
└─ Health Server Start
   └─ Ready for requests
```

### Dependency Graph

```
PROD Postgres ────────┐
                      ├─> Service Registry ─> Engine DB Workers
TimescaleDB ──────────┤                      └─> Database Workers
                      │
Engine Read-DB ───────┤
                      │
Engine Write-DB ──────┘
                      │
Event Bus ────────────┴─> Log Ingestion Worker
```

### Worker State Machine

```
REGISTERED ──> INITIALIZING ──> HEALTHY ──┐
                     │           ↓         │
                     │       DEGRADED ←────┘
                     │           ↓
                     └────> ERROR
```

---

## Failure Scenarios

### 1. Startup Failures

#### 1.1 Worker Never Reaches HEALTHY State

**Symptoms:**
- `/ops workers` shows worker stuck in "INITIALIZING" for >5 minutes
- Service Registry logs: `[ServiceRegistry] Service 'X' initialization timeout`
- No worker execution logs in Render logs

**Diagnosis:**

```powershell
# Step 1: Check worker status
/ops workers

# Step 2: Check Service Registry status
/ops stats

# Step 3: Check Render logs
pwsh -File scripts/render_logs.ps1 -Service Infinity-Gauntlet -Tail

# Step 4: Check database connectivity
/ops database

# Step 5: SSH into Render and check processes
.\scripts\render_ssh_windows.ps1 -Interactive
# Inside Render:
ps aux | grep node
cat /opt/render/project/src/logs/startup.log
```

**Root Causes:**

| Cause | Indicator | Resolution |
|-------|-----------|------------|
| **Database connection timeout** | `Error: connect ETIMEDOUT` | Verify PROD_DATABASE_URL, check network |
| **Missing environment variable** | `Missing required config: X` | Add variable to Render dashboard |
| **Dependency not initialized** | `Cannot access X before initialization` | Check Service Registry dependency order |
| **File system permissions** | `EACCES: permission denied` | Check /Store volume mount permissions |
| **SQLite database locked** | `database is locked` | Stop concurrent processes, restart service |
| **Port already in use** | `EADDRINUSE` | Find conflicting process, change port |

**Resolution:**

```bash
# Quick Fix (Restart service)
pwsh -File scripts/render_restart.ps1 -Service Infinity-Gauntlet

# If restart fails, check config
pwsh -File scripts/render_status.ps1

# If config correct, check database
npm run db:cli -- status

# If database unreachable, check network
Test-NetConnection -ComputerName <DB_HOST> -Port 5432

# If all checks pass but still failing, escalate
```

**Prevention:**
- Add initialization timeout monitoring (alert after 5 minutes)
- Implement health check retries with exponential backoff
- Add pre-flight checks before worker initialization
- Document all required environment variables

---

#### 1.2 Worker Initialization Dependency Failure

**Symptoms:**
- Worker logs: `Service 'X' depends on 'Y' which failed to initialize`
- Service Registry shows cascade failures (multiple services ERROR)
- Application startup aborts

**Diagnosis:**

```powershell
# Step 1: Identify failed dependency
/ops stats
# Look for first service in ERROR state

# Step 2: Check dependency initialization logs
pwsh -File scripts/render_logs.ps1 -Service Infinity-Gauntlet | Select-String "Service 'Y'"

# Step 3: Check dependency's dependencies
# Review Service Registry configuration in src/index.ts
code src/index.ts
# Search for ServiceRegistry.register() calls
```

**Root Causes:**

| Cause | Indicator | Resolution |
|-------|-----------|------------|
| **Circular dependency** | `Circular dependency detected` | Refactor to remove cycle |
| **Missing dependency registration** | `Service 'X' not found` | Add ServiceRegistry.register() call |
| **Wrong startup order** | Dep initialized after dependent | Adjust startupOrder values |
| **Dependency crash during init** | Exception in dependency logs | Fix dependency issue first |

**Resolution:**

```typescript
// Fix circular dependency:
// BEFORE: A depends on B, B depends on A
// AFTER: Extract shared logic to C, A and B both depend on C

// Fix startup order:
ServiceRegistry.getInstance().register({
  name: 'dependencyService',
  factory: createDependency,
  startupOrder: 50,  // Lower number = starts earlier
});

ServiceRegistry.getInstance().register({
  name: 'dependentService',
  factory: createDependent,
  startupOrder: 100, // Higher number = starts later
  dependencies: ['dependencyService'], // Explicit dependency
});
```

**Prevention:**
- Run `npm run test` to catch circular dependencies at build time
- Add dependency graph validation in CI/CD
- Document dependency relationships in architecture diagrams
- Use TypeScript to enforce compile-time dependency checks

---

### 2. Runtime Errors

#### 2.1 Worker Execution Failure (Sporadic)

**Symptoms:**
- `/ops workers detailed:true` shows errorCount increasing
- Worker still shows "HEALTHY" but some executions fail
- Logs show exceptions during worker.execute()

**Diagnosis:**

```powershell
# Step 1: Check error count trend
/ops workers detailed:true
# Note: errorCount should be 0 or very low

# Step 2: Check recent errors
/ops logs level:error limit:50
# Look for worker name in message

# Step 3: Check TimescaleDB for error patterns
/ops logs level:error category:worker since:24h
# Analyze error clustering (time, message patterns)

# Step 4: Check worker-specific stats
/ops database worker:timescale
# Look for error rate (errors / operations)
```

**Root Causes:**

| Cause | Indicator | Resolution |
|-------|-----------|------------|
| **Network timeout** | `ETIMEDOUT` or `ECONNRESET` | Increase timeout, add retry logic |
| **Database deadlock** | `deadlock detected` | Reduce transaction scope, add retry |
| **Resource temporarily unavailable** | `EAGAIN` | Add backpressure handling |
| **Rate limiting** | `429 Too Many Requests` | Implement exponential backoff |
| **Data validation failure** | `ValidationError` | Fix data quality issues |
| **External API failure** | `500 Internal Server Error` | Add circuit breaker pattern |

**Resolution:**

```typescript
// Add retry logic with exponential backoff:
async function executeWithRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
      log.warn(`Operation failed, retrying in ${delayMs}ms`, {
        attempt,
        maxRetries,
        error: getErrorMessage(error)
      });
      
      await delay(delayMs);
    }
  }
}
```

**Prevention:**
- Set error rate alerts (>5% error rate triggers alert)
- Implement circuit breaker for external dependencies
- Add retry logic with exponential backoff for transient errors
- Monitor error patterns via TimescaleDB aggregations

---

#### 2.2 Worker Execution Failure (Persistent)

**Symptoms:**
- Worker errorCount increases rapidly (every execution fails)
- Worker status changes to "DEGRADED" or "ERROR"
- Service functionality completely broken

**Diagnosis:**

```powershell
# Step 1: Check worker status
/ops workers
# Identify which worker is ERROR

# Step 2: Get last error message
/ops workers detailed:true
# Check lastError field

# Step 3: Check recent logs for stack trace
pwsh -File scripts/render_logs.ps1 -Service Infinity-Gauntlet -Tail

# Step 4: Check if issue affects all workers or just one
/ops database
# Compare PROD, TimescaleDB, Engine Read, Engine Write

# Step 5: SSH and check system resources
.\scripts\render_ssh_windows.ps1 -Interactive
# Inside Render:
top -bn1 | head -20
df -h
free -m
```

**Root Causes:**

| Cause | Indicator | Resolution |
|-------|-----------|------------|
| **Code regression** | Started after deployment | Rollback to previous version |
| **Config change** | Started after env var change | Revert config, verify values |
| **Database schema change** | `column does not exist` | Run migrations, verify schema |
| **Disk full** | `ENOSPC: no space left` | Clean up logs, increase disk size |
| **Memory exhaustion** | `JavaScript heap out of memory` | Restart service, investigate leak |
| **Corrupted data** | `invalid input syntax` | Fix data, add validation |

**Resolution:**

```bash
# IMMEDIATE: Disable failing worker (if non-critical)
# Edit src/config/engine-db-config.ts:
export const EngineDbConfig = {
  // ...
  workersEnabled: {
    cacheRefresh: false, // Disable problematic worker
    bufferFlush: true,
    // ...
  }
};

# Deploy with disabled worker:
pwsh -File scripts/render_deploy.ps1 -Service Infinity-Gauntlet

# THEN: Investigate root cause offline
# Fix issue in development
# Test thoroughly
# Re-enable worker
# Deploy fix
```

**Prevention:**
- Implement feature flags for all workers (easy disable)
- Add worker health checks that auto-disable on persistent failure
- Implement graceful degradation (app works with worker disabled)
- Add pre-deployment smoke tests that catch regressions

---

### 3. Performance Degradation

#### 3.1 Worker Execution Slow (Increasing Latency)

**Symptoms:**
- `/ops workers detailed:true` shows avgLatencyMs increasing over time
- Worker executions take 2-10x longer than baseline
- No errors, but throughput decreased

**Diagnosis:**

```powershell
# Step 1: Check current latency
/ops workers detailed:true
# Compare avgLatencyMs to baseline (document baseline!)

# Step 2: Check if database is slow
/ops database worker:prod
# Check latencyMs field

# Step 3: Check TimescaleDB query performance
/ops logs level:info category:performance since:1h
# Look for slow query warnings

# Step 4: Check resource utilization
.\scripts\render_ssh_windows.ps1
# Inside Render:
top -bn1
iostat -x 1 5
```

**Root Causes:**

| Cause | Indicator | Resolution |
|-------|-----------|------------|
| **Database query regression** | Queries take 10x+ longer | Add index, optimize query |
| **Lock contention** | High wait time on locks | Reduce transaction scope |
| **Network latency** | High ping times to DB | Check network, consider caching |
| **Memory pressure** | High swap usage | Reduce memory usage, increase RAM |
| **CPU saturation** | 100% CPU usage | Optimize algorithms, scale horizontally |
| **Disk I/O bottleneck** | High iowait% | Use faster disk, optimize I/O patterns |

**Resolution:**

```sql
-- Identify slow queries in TimescaleDB:
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100 -- queries >100ms average
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Add missing indexes:
CREATE INDEX idx_log_entries_timestamp 
ON log_entries (timestamp DESC);

CREATE INDEX idx_log_entries_level_timestamp 
ON log_entries (level, timestamp DESC);
```

```typescript
// Add query timeout monitoring:
const queryStartTime = performance.now();
const result = await worker.query(sql, params);
const queryDuration = performance.now() - queryStartTime;

if (queryDuration > 1000) {
  log.warn('Slow query detected', {
    worker: worker.name,
    durationMs: queryDuration,
    query: sql.substring(0, 100), // First 100 chars
  });
}
```

**Prevention:**
- Set performance baselines for all workers (document expected latency)
- Add latency alerts (>200% of baseline triggers warning)
- Monitor query performance via pg_stat_statements
- Implement query timeouts to prevent runaway queries
- Add performance regression tests in CI/CD

---

#### 3.2 Worker Execution Backlog (Queue Buildup)

**Symptoms:**
- Worker falls behind schedule (executions queued)
- `/ops workers` shows lastRunTime significantly behind expected
- Write buffer shows backpressure warnings (75%+ utilization)

**Diagnosis:**

```powershell
# Step 1: Check execution schedule
/ops workers detailed:true
# Compare lastRunTime to current time

# Step 2: Check write buffer status
/ops engine
# Look for backpressure warnings

# Step 3: Check if worker is executing
pwsh -File scripts/render_logs.ps1 -Service Infinity-Gauntlet | Select-String "Worker execution"

# Step 4: Check system resources
.\scripts\render_ssh_windows.ps1 -Interactive
# Inside Render:
ps aux | grep node
# Check if worker process is hung
```

**Root Causes:**

| Cause | Indicator | Resolution |
|-------|-----------|------------|
| **Worker interval too short** | Executions overlap | Increase interval |
| **Processing rate < ingestion rate** | Queue grows unbounded | Increase throughput, add workers |
| **Worker hung (infinite loop)** | No execution completion logs | Kill process, fix bug |
| **Resource starvation** | Worker waiting for resources | Increase resources, optimize usage |
| **External dependency slow** | Worker blocked on API call | Add timeout, circuit breaker |

**Resolution:**

```typescript
// Prevent overlapping executions:
class Worker {
  private isExecuting = false;
  
  async execute() {
    if (this.isExecuting) {
      log.warn('Worker execution skipped (previous run still in progress)', {
        worker: this.name
      });
      return;
    }
    
    this.isExecuting = true;
    try {
      // Do work...
    } finally {
      this.isExecuting = false;
    }
  }
}

// Add execution timeout:
async function executeWithTimeout(operation, timeoutMs = 30000) {
  return Promise.race([
    operation(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
    )
  ]);
}
```

**Prevention:**
- Monitor execution duration vs interval (duration should be <50% of interval)
- Add execution overlap detection (skip if previous run still active)
- Implement execution timeouts to prevent hung workers
- Add queue depth monitoring (alert when backlog grows)

---

### 4. Resource Exhaustion

#### 4.1 Memory Leak (Gradual OOM)

**Symptoms:**
- Process memory (RSS) increases steadily over time
- Eventually hits 2 GB limit and crashes with OOM error
- Memory usage never decreases (no garbage collection)

**Diagnosis:**

```powershell
# Step 1: Check current memory usage
/ops memory
# Look at memoryUsage.rss trend

# Step 2: Check if memory increases over time
# Wait 1 hour, check again
/ops memory
# Calculate growth rate: (newRSS - oldRSS) / 1 hour

# Step 3: Take heap snapshot (requires Node.js inspector)
.\scripts\render_ssh_windows.ps1 -Interactive
# Inside Render:
kill -USR2 <node_pid>  # Triggers heap dump
# Download heap dump, analyze in Chrome DevTools

# Step 4: Check for common leak patterns
pwsh -File scripts/render_logs.ps1 -Service Infinity-Gauntlet | Select-String "memory"
```

**Root Causes:**

| Cause | Indicator | Resolution |
|-------|-----------|------------|
| **Event listeners not removed** | Growing listener count | Remove listeners in cleanup |
| **Timers not cleared** | Growing timer count | Clear intervals/timeouts |
| **Cache unbounded** | Cache size keeps growing | Add size limits, eviction policy |
| **Closure capturing large objects** | Heap dominated by closures | Break circular references |
| **Buffer accumulation** | Write buffer never flushed | Implement periodic flush |

**Resolution:**

```typescript
// Fix event listener leak:
class Worker {
  private listeners = new Map<string, Function>();
  
  start() {
    const listener = () => { /* ... */ };
    this.listeners.set('heartbeat', listener);
    eventBus.on('heartbeat', listener);
  }
  
  stop() {
    // Remove ALL listeners on shutdown:
    for (const [event, listener] of this.listeners) {
      eventBus.off(event, listener);
    }
    this.listeners.clear();
  }
}

// Fix timer leak:
class Worker {
  private intervals = new Set<NodeJS.Timeout>();
  
  start() {
    const interval = setInterval(() => { /* ... */ }, 1000);
    this.intervals.add(interval);
  }
  
  stop() {
    // Clear ALL timers on shutdown:
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}

// Fix cache leak (add bounded size):
class Cache {
  private maxSize = 10000;
  private cache = new Map();
  
  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      // LRU eviction: remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

**Prevention:**
- Enable memory monitoring (alert at 1.5 GB = 75% of limit)
- Run memory leak detection tests in CI/CD
- Use WeakMap/WeakSet for caches (auto-GC when references gone)
- Implement periodic heap snapshot exports for offline analysis
- Add memory guardian that forces GC at 80% threshold

---

#### 4.2 CPU Saturation (100% Usage)

**Symptoms:**
- CPU usage stays at 100% for extended periods
- Application becomes unresponsive (commands timeout)
- Other workers starve (no CPU time available)

**Diagnosis:**

```powershell
# Step 1: Check CPU usage
.\scripts\render_ssh_windows.ps1 -Interactive
# Inside Render:
top -bn1 | head -20
# Look for node process at 100% CPU

# Step 2: Profile CPU usage
node --prof dist/index.js
# Wait 1 minute, Ctrl+C
node --prof-process isolate-*.log > cpu-profile.txt

# Step 3: Identify hot code paths
cat cpu-profile.txt
# Look for functions with high "ticks" count

# Step 4: Check for infinite loops
pwsh -File scripts/render_logs.ps1 -Service Infinity-Gauntlet -Tail
# Look for repeated log messages (sign of loop)
```

**Root Causes:**

| Cause | Indicator | Resolution |
|-------|-----------|------------|
| **Infinite loop** | Same log message repeated | Fix loop condition |
| **CPU-intensive algorithm** | Hot function in profile | Optimize algorithm, add caching |
| **Synchronous I/O** | Blocking on file read/write | Use async I/O |
| **JSON parsing large payloads** | JSON.parse in hot path | Stream parsing, smaller chunks |
| **Regex catastrophic backtracking** | Regex execution takes seconds | Simplify regex, add timeout |

**Resolution:**

```typescript
// Fix infinite loop (add exit condition):
// BEFORE:
while (true) {
  if (condition) break; // Missing break causes infinite loop
}

// AFTER:
let iterations = 0;
const maxIterations = 1000;
while (iterations++ < maxIterations) {
  if (condition) break;
}
if (iterations >= maxIterations) {
  throw new Error('Loop exceeded max iterations');
}

// Fix CPU-intensive algorithm (add async yielding):
async function processBatch(items) {
  for (let i = 0; i < items.length; i++) {
    await processItem(items[i]);
    
    // Yield to event loop every 100 items:
    if (i % 100 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
}
```

**Prevention:**
- Add CPU usage monitoring (alert at >80% for >5 minutes)
- Implement loop iteration limits (throw after N iterations)
- Use async/await to yield to event loop frequently
- Profile CPU usage in staging before production deployment
- Add CPU profiling hooks that can be triggered remotely

---

### 5. Network Issues

#### 5.1 Database Connection Timeout

**Symptoms:**
- Worker logs: `Error: connect ETIMEDOUT`
- Database worker shows "ERROR" status
- All database operations fail

**Diagnosis:**

```powershell
# Step 1: Check database worker status
/ops database

# Step 2: Test database connectivity from local machine
Test-NetConnection -ComputerName <DB_HOST> -Port 5432

# Step 3: SSH into Render and test connectivity
.\scripts\render_ssh_windows.ps1 -Interactive
# Inside Render:
nc -zv <DB_HOST> 5432
# Should return "Connection succeeded"

# Step 4: Check Render network status
# Visit https://status.render.com/
# Look for network incidents

# Step 5: Check database server status
# Visit Render dashboard > infinity-gauntlet-db
# Look for "Degraded" or "Unavailable" status
```

**Root Causes:**

| Cause | Indicator | Resolution |
|-------|-----------|------------|
| **Database server down** | Cannot reach DB from anywhere | Wait for DB restart, escalate to Render support |
| **Network partition** | Cannot reach DB from Render only | Check Render network status, escalate |
| **Firewall rule changed** | Connection refused | Update firewall rules to allow Render IP |
| **DNS resolution failure** | Cannot resolve hostname | Use IP address directly, check DNS |
| **Connection pool exhausted** | Max connections reached | Increase pool size, fix connection leaks |

**Resolution:**

```typescript
// Add connection retry logic:
async function connectWithRetry(url, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await createDatabaseClient(url);
      log.info('Database connection established', { attempt });
      return client;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 30000);
      log.warn('Database connection failed, retrying', {
        attempt,
        maxRetries,
        delayMs,
        error: getErrorMessage(error)
      });
      
      await delay(delayMs);
    }
  }
}

// Add connection health check:
setInterval(async () => {
  try {
    await client.query('SELECT 1');
    log.debug('Database health check passed');
  } catch (error) {
    log.error('Database health check failed', error);
    // Attempt reconnection
    await reconnect();
  }
}, 30000); // Check every 30 seconds
```

**Prevention:**
- Implement automatic connection retry with exponential backoff
- Add database health checks (every 30 seconds)
- Monitor connection pool usage (alert at >80%)
- Set up database monitoring alerts (alert when DB unreachable)
- Document database failover procedures

---

### 6. Database Connectivity

(See [Network Issues - Database Connection Timeout](#51-database-connection-timeout) above for detailed diagnosis)

Additional database-specific scenarios:

#### 6.1 Query Timeout

**Symptoms:**
- Worker logs: `Error: Query timeout after 5000ms`
- Queries succeed sometimes, timeout other times
- Database worker shows high latencyMs

**Diagnosis:**

```sql
-- Check for long-running queries:
SELECT 
  pid,
  now() - query_start AS duration,
  state,
  query
FROM pg_stat_activity
WHERE state != 'idle'
  AND now() - query_start > interval '5 seconds'
ORDER BY duration DESC;

-- Check for blocking queries:
SELECT 
  blocked_locks.pid AS blocked_pid,
  blocked_activity.query AS blocked_query,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.query AS blocking_query
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity 
  ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
JOIN pg_catalog.pg_stat_activity blocking_activity 
  ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

**Resolution:**
- Kill long-running query: `SELECT pg_terminate_backend(<pid>);`
- Add query timeout: `SET statement_timeout = '5s';`
- Optimize query: Add indexes, reduce JOIN complexity
- Increase timeout for known-slow queries

---

### 7. Configuration Errors

#### 7.1 Missing Environment Variable

**Symptoms:**
- Worker fails to initialize
- Logs: `Missing required config: X` or `undefined is not a function`
- Service doesn't start at all

**Diagnosis:**

```powershell
# Step 1: Check which variable is missing
pwsh -File scripts/render_logs.ps1 -Service Infinity-Gauntlet | Select-String "Missing"

# Step 2: Check Render environment variables
# Visit Render dashboard > infinity-gauntlet-bot > Environment
# Look for missing variable

# Step 3: Compare to local environment
Get-Content secrets/Infinity-Gauntlet.env | Select-String "VARIABLE_NAME"

# Step 4: Check if variable is required
code src/config/env.ts
# Search for variable name
```

**Resolution:**
1. Add missing variable to Render dashboard
2. Trigger redeploy: `pwsh -File scripts/render_deploy.ps1 -Service Infinity-Gauntlet`
3. Verify worker starts: `/ops workers`

**Prevention:**
- Document ALL required environment variables in `docs/configuration.md`
- Add environment variable validation at startup (fail fast)
- Implement pre-deployment config check script
- Use TypeScript to enforce required config at compile time

---

### 8. Version Mismatches

#### 8.1 Dependency Version Conflict

**Symptoms:**
- Worker fails with `Cannot find module 'X'` or `X is not a function`
- Started after npm install or deployment
- Works in development, fails in production

**Diagnosis:**

```powershell
# Step 1: Check installed versions
.\scripts\render_ssh_windows.ps1 -Interactive
# Inside Render:
cat package.json | grep "X"
npm list X

# Step 2: Compare to local versions
npm list X

# Step 3: Check for version mismatches
npm outdated

# Step 4: Check Node.js version
node --version
```

**Resolution:**
```bash
# Lock dependency versions (use exact versions):
npm install --save-exact X@1.2.3

# Rebuild package-lock.json:
rm package-lock.json
npm install

# Deploy:
pwsh -File scripts/render_deploy.ps1 -Service Infinity-Gauntlet
```

**Prevention:**
- Use exact versions in package.json (no `^` or `~`)
- Commit package-lock.json to version control
- Run `npm ci` instead of `npm install` in production
- Add dependency version checks in CI/CD

---

## Debug Procedures

### Quick Debug Checklist

When investigating ANY worker issue, follow this checklist:

- [ ] **Check worker status:** `/ops workers`
- [ ] **Check recent errors:** `/ops logs level:error limit:20`
- [ ] **Check database connectivity:** `/ops database`
- [ ] **Check memory usage:** `/ops memory`
- [ ] **Check Render logs:** `pwsh -File scripts/render_logs.ps1 -Service Infinity-Gauntlet -Tail`
- [ ] **Check Render service status:** `pwsh -File scripts/render_status.ps1`
- [ ] **SSH into Render:** `.\scripts\render_ssh_windows.ps1 -Interactive`
- [ ] **Check system resources:** `top -bn1`, `df -h`, `free -m`
- [ ] **Check application logs:** `cat /opt/render/project/src/logs/*.log`
- [ ] **Check database logs:** (via Render dashboard or pg_stat_activity)
- [ ] **Check network connectivity:** `nc -zv <DB_HOST> 5432`

### Advanced Debugging

#### Enable Debug Logging

```bash
# Set environment variable in Render dashboard:
LOG_LEVEL=debug

# Redeploy:
pwsh -File scripts/render_deploy.ps1 -Service Infinity-Gauntlet

# View debug logs:
/ops logs level:debug limit:100
```

#### Heap Snapshot Analysis

```bash
# SSH into Render:
.\scripts\render_ssh_windows.ps1 -Interactive

# Find Node.js process:
ps aux | grep node

# Trigger heap snapshot:
kill -USR2 <pid>

# Download snapshot:
# (Use Render dashboard file browser or scp)

# Analyze in Chrome DevTools:
# 1. Open Chrome DevTools
# 2. Memory tab > Load snapshot
# 3. Analyze retained size, dominators
```

#### CPU Profiling

```bash
# Start application with profiling:
node --prof dist/index.js

# Wait 1-2 minutes, then stop (Ctrl+C)

# Process profile:
node --prof-process isolate-*.log > cpu-profile.txt

# Analyze top functions:
cat cpu-profile.txt | head -100
```

---

## Recovery Procedures

### Immediate Recovery (< 5 minutes)

**Goal:** Restore service functionality as quickly as possible

1. **Restart service:** `pwsh -File scripts/render_restart.ps1 -Service Infinity-Gauntlet`
2. **Verify workers start:** `/ops workers` (wait 2 minutes)
3. **Check for immediate errors:** `/ops logs level:error since:5m`
4. **Test basic functionality:** `/ops database`, `/ops engine`
5. **If still failing:** Escalate to senior engineer

### Short-Term Recovery (< 30 minutes)

**Goal:** Identify and fix root cause

1. **Identify failing worker:** `/ops workers detailed:true`
2. **Check worker logs:** Find error message in Render logs
3. **Determine root cause:** Use diagnosis procedures above
4. **Apply fix:**
   - Config issue → Update environment variable
   - Code issue → Deploy hotfix
   - Resource issue → Scale up service
   - External issue → Wait for resolution
5. **Verify fix:** Monitor workers for 10 minutes
6. **Document incident:** Add entry to incident log

### Long-Term Recovery (< 2 hours)

**Goal:** Prevent recurrence

1. **Root cause analysis:** Complete RCA template (see below)
2. **Implement prevention:** Add monitoring, alerts, auto-recovery
3. **Update documentation:** Add new failure scenario to this guide
4. **Add tests:** Prevent regression
5. **Review with team:** Share lessons learned

---

## Root Cause Analysis

### RCA Template

```markdown
# Incident Report: [Worker Name] [Failure Type]

**Date:** YYYY-MM-DD HH:MM UTC
**Duration:** X minutes/hours
**Severity:** Critical / High / Medium / Low
**Affected Services:** [List services]

## Summary
[1-2 sentence summary of incident]

## Impact
- **User Impact:** [What users experienced]
- **Data Impact:** [Any data loss or corruption]
- **Financial Impact:** [Cost of downtime]

## Timeline
- **HH:MM** - [Event 1]
- **HH:MM** - [Event 2]
- **HH:MM** - [Resolution]

## Root Cause
[Detailed explanation of what went wrong and why]

## Resolution
[What was done to fix the issue]

## Prevention
- [ ] Add monitoring for X
- [ ] Implement auto-recovery for Y
- [ ] Update documentation to cover Z
- [ ] Add test for scenario W

## Lessons Learned
[Key takeaways for the team]
```

---

## Escalation Procedures

### When to Escalate

Escalate to senior engineer if:
- **Critical worker down for >15 minutes** (PROD Postgres, TimescaleDB, Security)
- **Multiple workers failing simultaneously** (indicates systemic issue)
- **Unknown error message** (not documented in this guide)
- **Recovery procedures fail** (restart doesn't fix issue)
- **Data corruption suspected** (invalid data in database)
- **Security incident suspected** (unauthorized access, breach)

### Escalation Contacts

| Tier | Contact | Availability | Response Time |
|------|---------|--------------|---------------|
| **L1 (On-call)** | ops-oncall@example.com | 24/7 | 15 minutes |
| **L2 (Senior Engineer)** | senior-eng@example.com | Business hours | 1 hour |
| **L3 (Architect)** | architect@example.com | Business hours | 4 hours |
| **L4 (CTO)** | cto@example.com | Emergency only | 1 hour |

### Escalation Information

When escalating, provide:
1. **Incident summary:** 2-3 sentences
2. **Affected services:** List all failing workers
3. **Error messages:** Copy-paste from logs
4. **Recovery attempts:** What you've tried
5. **Business impact:** User-facing impact
6. **Urgency:** Critical / High / Medium / Low

**Example:**
```
SUBJECT: [CRITICAL] PROD Postgres Worker Down

The PROD Postgres worker has been in ERROR state for 20 minutes.
All database operations are failing with "connect ETIMEDOUT".
I've tried restarting the service 3 times with no success.

Affected services: infinity-gauntlet-bot
Error: Error: connect ETIMEDOUT
Recovery attempts: Service restart (3x), config validation, network test
Business impact: ALL gameplay features broken (battles, wild encounters, healing)
Urgency: CRITICAL - No users can play

Escalating to senior engineer.
```

---

## Monitoring & Alerts

### Key Metrics to Monitor

| Metric | Target | Warning | Critical | Alert Channel |
|--------|--------|---------|----------|---------------|
| **Worker Health** | 100% HEALTHY | Any DEGRADED | Any ERROR | Slack #alerts |
| **Error Rate** | 0% | >1% | >5% | Slack #alerts |
| **Avg Latency** | <100ms | >200ms | >500ms | Slack #ops |
| **Memory Usage** | <1.5 GB | >1.5 GB (75%) | >1.7 GB (85%) | PagerDuty |
| **CPU Usage** | <70% | >80% | >95% | PagerDuty |
| **Disk Usage** | <800 MB | >900 MB (90%) | >950 MB (95%) | PagerDuty |
| **Database Connections** | <50 | >80 | >95 | Slack #alerts |
| **Query Timeout Rate** | 0% | >1% | >5% | Slack #alerts |

### Alert Rules

```yaml
# Example alert configuration (Prometheus/Grafana)

- alert: WorkerDegraded
  expr: worker_status{status="degraded"} == 1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Worker {{ $labels.worker_name }} is degraded"
    description: "Worker has been degraded for 5 minutes"

- alert: WorkerError
  expr: worker_status{status="error"} == 1
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Worker {{ $labels.worker_name }} is in error state"
    description: "Immediate investigation required"

- alert: HighErrorRate
  expr: rate(worker_error_count[5m]) > 0.05
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Worker {{ $labels.worker_name }} error rate >5%"
    description: "{{ $value | humanizePercentage }} of executions failing"
```

---

## Appendix

### Glossary

- **Worker:** Background process that executes tasks on a schedule
- **Service Registry:** Centralized service discovery and lifecycle management
- **Engine DB:** SQLite-based local database for game engine operations
- **PROD Postgres:** Primary PostgreSQL database (PROD_DATABASE_URL)
- **TimescaleDB:** Time-series database for log ingestion
- **Event Bus:** Pub-sub system for asynchronous communication
- **Backpressure:** Mechanism to prevent queue overflow by rejecting new items
- **Stagger:** Delay between worker startups to prevent thundering herd

### Related Documentation

- [Database Operations Runbook](./database-operations-runbook.md)
- [/ops Commands Reference](./ops-commands-reference.md)
- [Complete System Architecture](../architecture-bible/complete-system-architecture.md)
- [Deployment Checklist](./deployment-checklist-comprehensive.md)

### Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-12-02 | Initial comprehensive guide | Operations Team |

---

**END OF DOCUMENT**

For questions or updates to this guide, contact: ops-team@example.com
