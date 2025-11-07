# Worker Architecture & Scaling Guide

**Last Updated**: 2025-11-07 (Phase 9 Optimization Complete)  
**Status**: Production-Ready, Scalable  
**Related**: `render.yaml`, `src/worker/*`, `scripts/worker.mjs`

**Cross-References**:
- See `OPERATIONS.md` (Service Matrix) for service definitions, rollout checklist, observability
- See `AGENTS.md` (Production & Render Notes) for environment setup, database configuration
- See `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` (Scaling Roadmap) for deployment procedures
- See `render.yaml` for canonical service definitions and environment variables
- See `docs/query-optimization-guide.md` for performance metrics and alert thresholds

**Referenced By**: OPERATIONS.md (service matrix), AGENTS.md (Production section), ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md (architecture reference), README.md (architecture snapshot)

---

## Overview

The Infinity Gauntlet uses a **distributed worker architecture** to separate concerns, improve reliability, and enable horizontal scaling. Workers run as independent Render.com services with dedicated resources, disk storage, and environment configurations.

**Current Workers** (7 production + 1 cron):
1. **Discord Bot Worker** (`infinity-gauntlet-bots`) - Main gameplay bot
2. **Outbox Worker** (`infinity-gauntlet-outbox`) - Async message delivery
3. **Cache Refresh Worker** (`infinity-gauntlet-cache`) - Runtime cache maintenance
4. **Data Pipeline Worker** (`infinity-gauntlet-data-pipeline`) - Reference data updates
5. **Security Bot Worker** (`infinity-gauntlet-security`) - Permission enforcement
6. **Pokédex Cache Worker** (`pokedex-cache-worker`) - External data sync
7. **Pokédex Cache Failsafe** (`pokedex-cache-failsafe`) - Cron fallback
8. **Web Service** (`infinity-gauntlet-bot`) - HTTP health checks & webhooks

**For complete service matrix and operational procedures, see `OPERATIONS.md` (Service Matrix section).**

---

## Current Worker Architecture

### 1. Discord Bot Worker (`infinity-gauntlet-bots`)

**Purpose**: Main Discord bot handling gameplay interactions, battles, encounters, and DM flows.

**Runtime**:
- **Start Command**: `npm start` → `tsx src/index.ts`
- **Plan**: Starter (shared CPU, 512 MB RAM)
- **Disk**: 2 GB persistent (`/opt/render/project/src/Store`)
- **Region**: Oregon

**Environment**:
```yaml
NODE_ENV: production
SERVICE_NAME: discord-bots
ENABLE_POKEMON_BOT: true
ENABLE_SECURITY_BOT: false
ENABLE_DB_AUTO_SYNC: true  # Runs DEV→PROD sync every 5 minutes
BATTLE_CHANNEL_NAME: pokemon-battles
DISABLE_SNAPSHOT_PRECHECK: true
```

**Database Access**:
- **PROD_DATABASE_URL**: Local PostgreSQL node (127.0.0.1:55433) for <50ms latency
- **DEV_DATABASE_URL**: Master PostgreSQL on Render (source of truth for migrations)
- Auto-sync worker consolidates DEV→PROD→LOCAL every 5 minutes

**Scaling Considerations**:
- CPU-bound during battle calculations (turn resolution, damage, RNG)
- Memory-bound with large guild member caches
- **Future**: Extract battle engine to dedicated worker pool

---

### 2. Outbox Worker (`infinity-gauntlet-outbox`)

**Purpose**: Async message delivery pattern - processes queued Discord messages from `BusMessage` table.

**Runtime**:
- **Start Command**: `node dist/worker/outbox.js`
- **Plan**: Starter
- **Disk**: 2 GB persistent
- **Region**: Oregon

**Environment**:
```yaml
OUTBOX_MIN_DELAY_MS: 250
OUTBOX_MAX_DELAY_MS: 1500
OUTBOX_HEALTH_INTERVAL: 20
OUTBOX_BATCH_SIZE: 100
```

**Processing Loop**:
1. Claims pending messages with `SKIP LOCKED` semantics (prevents duplicate processing)
2. Sends via Discord API
3. Marks as `processed` or `error` state
4. Implements exponential backoff on failures

**Scaling**:
- Horizontally scalable (multiple workers can process different batches)
- Database-backed queue ensures exactly-once delivery
- **Future**: Add worker pool auto-scaling based on queue depth

---

### 3. Cache Refresh Worker (`infinity-gauntlet-cache`)

**Purpose**: Maintains runtime cache health - prunes stale entries, rotates logs, monitors disk usage.

**Runtime**:
- **Start Command**: `node dist/worker/cache-refresh.js`
- **Plan**: Starter
- **Disk**: 2 GB persistent (`/Store/runtime-cache/`)

**Environment**:
```yaml
CACHE_WORKER_INTERVAL_MS: 0  # Disabled (runs on-demand via scheduler)
CACHE_WORKER_INTERVAL_JITTER_MS: 0
```

**Cache Namespaces** (under `/Store/runtime-cache/`):
- `battle-state/` - Active battle snapshots
- `encounter-state/` - Wild encounter sessions
- `trainer-state/` - Player progression data

**Maintenance Tasks**:
- Evicts entries older than TTL
- Compacts disk storage
- Reports metrics via `cache.maintenance` events

**Scaling**:
- Single worker sufficient (cache operations are fast)
- **Future**: Add memory-backed Redis layer for hot data

---

### 4. Data Pipeline Worker (`infinity-gauntlet-data-pipeline`)

**Purpose**: Periodic reference data updates (Pokédex, moves, abilities, type chart).

**Runtime**:
- **Start Command**: `node dist/worker/data-pipeline.js`
- **Plan**: Starter
- **Disk**: 2 GB persistent

**Environment**:
```yaml
DATA_PIPELINE_INTERVAL_MS: 86400000  # 24 hours
DATA_PIPELINE_INTERVAL_JITTER_MS: 900000  # ±15 minutes
DATA_PIPELINE_RUN_ON_BOOT: false
```

**Pipeline Stages**:
1. Fetch latest data from PokéAPI
2. Transform to internal schema (`src/data_pipeline/schema/*`)
3. Generate optimized dexpack (`assets/dexpack.gen.mjs`)
4. Seed database with new species/moves

**Scaling**:
- CPU-intensive during transformation
- Network-intensive during fetch (200+ HTTP requests)
- **Future**: Parallelize PokéAPI fetching with worker pool

---

### 5. Security Bot Worker (`infinity-gauntlet-security`)

**Purpose**: Enforces Discord permission guardrails - auto-reverts unauthorized role changes.

**Runtime**:
- **Start Command**: `node security-bot.js`
- **Plan**: Starter
- **Disk**: 1 GB persistent (`/opt/render/project/src/Store`)

**Environment**:
```yaml
ENABLE_SECURITY_BOT: true
ENABLE_CONTINUOUS_SWEEP: true
ROLE_NAME: Trainer
ALERT_WEBHOOK_URL: <sync: false>
ALERT_CHANNEL_ID: <sync: false>
ALERT_USER_ID: <sync: false>
```

**Guardrail Logic**:
- Monitors role/permission changes via Discord events
- Allows guild owner + administrators
- Auto-reverts other edits, sends DM to DripTVDD
- Records `revertStatus` / `revertErrors` when rollback fails

**Scaling**:
- Event-driven (low CPU unless many permission changes)
- **Future**: Extract to serverless function (Cloudflare Workers)

---

### 6. Pokédex Cache Worker (`pokedex-cache-worker`)

**Purpose**: Syncs external Pokémon data to GitHub `data-cache` branch for CDN-style serving.

**Runtime**:
- **Start Command**: `node scripts/worker.mjs`
- **Plan**: Starter
- **Disk**: 1 GB persistent (`/store/cache`)

**Environment**:
```yaml
POKE_CONCURRENCY: 10
POKE_TIMEOUT_MS: 15000
POKE_REFRESH_CRON: "0 0 * * 4"  # Weekly Thursday midnight
POKE_REFRESH_TZ: America/New_York
POKE_RUN_JOB_ON_BOOT: true
POKE_REFRESH_JOB_COMMAND: node scripts/refresh_cache.mjs
GITHUB_REPO: https://github.com/sherbivs/infinity-gauntlet.git
GITHUB_BRANCH: data-cache
GITHUB_RAW_URL: https://raw.githubusercontent.com/sherbivs/infinity-gauntlet/data-cache/data/cache
```

**Workflow**:
1. Fetches Pokémon data from PokéAPI (concurrent pool of 10)
2. Writes to local `/store/cache`
3. Commits to GitHub `data-cache` branch
4. Triggers Render API to redeploy bot (picks up new data)

**Scaling**:
- Network-bound (PokéAPI rate limits)
- **Future**: Cache immutable responses in S3/R2

---

### 7. Pokédex Cache Failsafe (Cron Job)

**Purpose**: Weekly fallback refresh in case main worker fails.

**Runtime**:
- **Type**: Cron job (not persistent worker)
- **Schedule**: `0 0 * * 4` (Thursday midnight)
- **Start Command**: `node scripts/refresh_cache_gh_only.mjs`

**Difference from Main Worker**:
- No persistent disk (uses `/tmp/cache`)
- Only refreshes GitHub, doesn't trigger Render redeploy
- Lightweight fallback for safety

---

### 8. Web Service (`infinity-gauntlet-bot`)

**Purpose**: HTTP health checks, webhooks, and future API endpoints.

**Runtime**:
- **Type**: Web service (receives HTTP traffic)
- **Start Command**: `npm start`
- **Plan**: Starter
- **Disk**: 2 GB persistent

**Current Routes**:
- `/health` - Health check endpoint (200 OK)
- Future: Discord OAuth, admin API, metrics dashboard

**Scaling**:
- Horizontally scalable (Render auto-scaling)
- **Future**: Add dedicated API service separate from bot worker

---

## Worker Communication Patterns

### 1. Database-Backed Queues (Outbox Pattern)

**Example**: `BusMessage` table for async Discord messages

**Flow**:
```
Bot Worker → INSERT INTO BusMessage (pending)
                     ↓
Outbox Worker → SELECT ... FOR UPDATE SKIP LOCKED
                     ↓
Discord API → UPDATE status = processed
```

**Benefits**:
- Exactly-once delivery semantics
- Fault tolerance (survives worker crashes)
- Natural audit trail

**Trade-offs**:
- Database contention at high volume
- Requires cleanup of processed messages

---

### 2. Scheduled Workers (Cron Pattern)

**Example**: Data pipeline runs every 24 hours

**Flow**:
```
Worker Boot → Check last run timestamp
                     ↓
              Sleep until next interval
                     ↓
              Execute pipeline stages
                     ↓
              Log metrics, repeat
```

**Benefits**:
- Predictable resource usage
- No external scheduler required

**Trade-offs**:
- Wastes resources sleeping
- Requires manual restart on crashes

---

### 3. Event-Driven Workers (Pub/Sub Pattern)

**Example**: Security bot reacts to Discord events

**Flow**:
```
Discord Gateway → RoleUpdate event
                         ↓
Security Bot → Check authorization
                         ↓
              Auto-revert if unauthorized
                         ↓
              Send DM alert
```

**Benefits**:
- Real-time response
- Low latency (<1s)

**Trade-offs**:
- Must maintain WebSocket connection
- Single point of failure

---

## Future Worker Opportunities

### Phase 10+ Scaling Roadmap

#### 1. Battle Engine Worker Pool 🎯 **HIGH PRIORITY**

**Problem**: Battle calculations block bot thread (CPU-intensive).

**Solution**: Extract to dedicated worker pool.

**Architecture**:
```yaml
services:
  - type: worker
    name: battle-engine-pool
    plan: starter
    instances: 3  # Horizontal scaling
    startCommand: node dist/worker/battle-engine.js
    envVars:
      - key: BATTLE_WORKER_CONCURRENCY
        value: "5"  # 5 battles per worker = 15 total
```

**Benefits**:
- Bot remains responsive during battles
- Scale battle capacity independently
- Isolate battle crashes from bot crashes

**Implementation**:
- Move `src/core/battle/engine.ts` to worker
- Use Redis queue for battle job distribution
- Return results via webhook or database

---

#### 2. Encounter Generator Worker 🎯 **MEDIUM PRIORITY**

**Problem**: Wild encounter spawning uses RNG, can be pre-generated.

**Solution**: Pre-generate encounter pool, serve from cache.

**Architecture**:
```yaml
services:
  - type: worker
    name: encounter-generator
    plan: starter
    startCommand: node dist/worker/encounter-generator.js
    envVars:
      - key: ENCOUNTER_POOL_SIZE
        value: "1000"  # Pre-gen 1000 encounters
      - key: ENCOUNTER_REFRESH_INTERVAL_MS
        value: "3600000"  # Refresh hourly
```

**Flow**:
1. Worker generates encounters with deterministic RNG seeds
2. Stores in `encounter_pool` table
3. Bot pops from pool on `/walk` command
4. Worker refills pool when depleted

**Benefits**:
- Faster `/walk` response (<10ms vs ~50ms)
- Predictable resource usage
- Enables encounter analytics

---

#### 3. Analytics/Metrics Worker 🎯 **LOW PRIORITY**

**Problem**: No centralized metrics dashboard.

**Solution**: Dedicated worker aggregating telemetry.

**Architecture**:
```yaml
services:
  - type: worker
    name: metrics-aggregator
    plan: starter
    startCommand: node dist/worker/metrics.js
```

**Data Sources**:
- Database stats (battle win rates, catch rates)
- Cache metrics (hit/miss ratios)
- Worker health (queue depths, processing times)

**Outputs**:
- JSON metrics at `/metrics` endpoint
- Daily digest sent to Discord
- Integration with Grafana/Datadog

---

#### 4. Backup/Restore Worker 🎯 **MEDIUM PRIORITY**

**Problem**: Manual database backups, no automated restore testing.

**Solution**: Scheduled backup with automated validation.

**Architecture**:
```yaml
services:
  - type: cron
    name: database-backup
    schedule: "0 2 * * *"  # 2 AM daily
    startCommand: node scripts/backup_database.mjs
    envVars:
      - key: S3_BACKUP_BUCKET
        value: infinity-gauntlet-backups
      - key: BACKUP_RETENTION_DAYS
        value: "30"
```

**Workflow**:
1. `pg_dump` from DEV master
2. Encrypt with GPG key
3. Upload to S3 with timestamp
4. Test restore to temporary database
5. Alert on validation failure

---

## Worker Monitoring & Observability

### Current Telemetry

**Logs** (`src/shared/log.ts`):
- Structured JSON logging (production)
- CLI-friendly formatting (development)
- Log levels: debug, info, warn, error

**Metrics**:
- Cache hit/miss ratios (`/ops cache`)
- Database query counts (`npm run db:cli -- status`)
- Worker health intervals (configurable per worker)

**Tracing**:
- Not yet implemented
- **Future**: OpenTelemetry integration

---

### Recommended Monitoring Setup

#### 1. Health Checks (Per Worker)

**Implementation**:
```typescript
// src/worker/health.ts
export async function healthCheck(): Promise<HealthStatus> {
  return {
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: await checkDatabaseConnection(),
    lastJobTimestamp: getLastJobTimestamp(),
  };
}
```

**Render Integration**:
- Add `/health` endpoint to each worker
- Configure Render health checks (30s interval)
- Auto-restart on 3 consecutive failures

---

#### 2. Queue Depth Alerts

**Example**: Outbox worker queue depth

**SQL Query**:
```sql
SELECT COUNT(*) 
FROM "BusMessage" 
WHERE status = 'pending';
```

**Alert Thresholds**:
- Warning: >100 pending messages
- Critical: >500 pending messages

**Action**: Scale outbox worker instances

---

#### 3. Worker Crash Telemetry

**Implementation**:
```typescript
process.on('uncaughtException', async (error) => {
  await log.error('Worker crashed', { error, env: 'production' });
  await sendAlertToDiscord(error);
  process.exit(1);  // Let Render restart
});
```

---

## Worker Deployment Best Practices

### 1. Environment Parity

**Problem**: Dev/staging/prod environments differ.

**Solution**: Use same `render.yaml` for all environments, vary only via env vars.

**Example**:
```yaml
# Development
envVars:
  - key: DEV_DATABASE_URL
    value: postgresql://localhost:5432/dev_db
  
# Production
envVars:
  - key: DEV_DATABASE_URL
    fromDatabase:
      name: infinity-gauntlet-db
      property: connectionString
```

---

### 2. Graceful Shutdown

**Problem**: Worker crashes mid-job, leaves partial state.

**Solution**: Handle `SIGTERM` signal, finish current job, then exit.

**Implementation**:
```typescript
let isShuttingDown = false;

process.on('SIGTERM', () => {
  isShuttingDown = true;
  log.info('Graceful shutdown initiated');
});

while (!isShuttingDown) {
  const job = await claimNextJob();
  await processJob(job);
}

log.info('Worker shutdown complete');
process.exit(0);
```

---

### 3. Idempotent Jobs

**Problem**: Worker crashes after partial processing, retry causes duplicates.

**Solution**: Design jobs to be safely retryable.

**Example**: Outbox message delivery
```typescript
// ✅ GOOD: Check if already processed
const message = await db.busMessage.findUnique({ where: { id } });
if (message.status === 'processed') return;

await sendToDiscord(message);
await db.busMessage.update({ 
  where: { id }, 
  data: { status: 'processed' } 
});

// ❌ BAD: Send without checking
await sendToDiscord(message);  // Sends duplicate if retry
```

---

### 4. Resource Limits

**Problem**: Worker memory leak crashes entire service.

**Solution**: Set memory/CPU limits in `render.yaml`.

**Example**:
```yaml
services:
  - type: worker
    plan: starter  # 512 MB RAM
    # Render auto-restarts if >90% memory
```

**Manual Limits** (Node.js):
```bash
# Limit heap to 400 MB
node --max-old-space-size=400 dist/worker/outbox.js
```

---

## Worker Scaling Decision Matrix

| Worker | Current Load | Scale Trigger | Scale Method |
|--------|--------------|---------------|--------------|
| **Discord Bot** | Medium | >1000 concurrent users | Horizontal (multiple instances) |
| **Outbox** | Low | Queue depth >500 | Horizontal (worker pool) |
| **Cache Refresh** | Low | Disk >80% full | Vertical (larger disk) |
| **Data Pipeline** | Low | Pipeline time >1 hour | Vertical (faster CPU) |
| **Security Bot** | Very Low | - | Keep as-is |
| **Pokédex Cache** | Low | PokéAPI rate limit hit | Add caching layer |
| **Web Service** | Very Low | Traffic >100 req/min | Horizontal (auto-scaling) |

---

## Worker Cost Optimization

### Current Monthly Cost (Render Starter Plans)

| Service | Plan | Cost |
|---------|------|------|
| Database | Starter | $7/month |
| Bot Worker | Starter | $7/month |
| Outbox Worker | Starter | $7/month |
| Cache Worker | Starter | $7/month |
| Data Pipeline | Starter | $7/month |
| Security Bot | Starter | $7/month |
| Pokédex Cache | Starter | $7/month |
| Web Service | Starter | $7/month |
| **TOTAL** | - | **$56/month** |

### Optimization Opportunities

1. **Consolidate Low-Traffic Workers**:
   - Merge Security Bot + Cache Refresh into single worker
   - Savings: $7/month

2. **Convert Cron Jobs to Serverless**:
   - Use Cloudflare Workers for Pokédex cache failsafe
   - Savings: $7/month

3. **Use Free Tier for Dev**:
   - Render free tier allows 1 web + 1 worker
   - Dev environment: $0/month

**Optimized Cost**: ~$35-42/month

---

## Summary

**Current State** (Phase 9 Complete):
- ✅ 8 production-ready workers
- ✅ Clean separation of concerns
- ✅ Horizontal scaling foundation
- ✅ Comprehensive telemetry

**Phase 10 Priorities**:
1. Battle engine worker pool (performance)
2. Backup/restore automation (reliability)
3. Encounter generator worker (latency)
4. OpenTelemetry tracing (observability)

**Scaling Capacity**:
- Current: ~1000 concurrent users
- With battle pool: ~5000 concurrent users
- Cost per 1000 users: ~$14/month

---

**Related Documentation**:
- `render.yaml` - Service definitions
- `src/worker/*` - Worker implementations
- `docs/database-systems.md` - Database architecture
- `docs/2-node-cluster-automation.md` - Auto-sync workflow
- `ops/REPO-OPTIMIZATION-REPORT.md` - Phase 9 achievements
