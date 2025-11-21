# Section 1: Service Matrix

[← Back to INDEX](INDEX.md) | [Next: Database Operations →](02-database-operations.md)

---

**Philosophy**: "Each worker has one clear responsibility—specialized, isolated, scalable."

**Purpose**: Define Render service topology, worker responsibilities, service dependencies, and scaling roadmap.

## 1.1 Production Service Topology

**⚠️ RESOURCE LIMITS:** All services run on Render Standard plan:
- **RAM:** 2 GB (2048 MB) — Volatile process memory, OOM kill at 100%
- **Persistent Disk:** 1 GB (974 MB) — /Store mount, write failures at 100%
- **CRITICAL:** These are DIFFERENT resources. See `docs/RESOURCE-LIMITS-RAM-VS-DISK.md` for comprehensive guide.

The Infinity Gauntlet deploys **8 independent Render services**:

| Render Service | Type | Purpose | Entry Command | Key Environment Flags |
|----------------|------|---------|---------------|----------------------|
| **infinity-gauntlet** | worker | Main Discord bot (battles, DM features, slash commands) | `npm start` → `node dist/index.js` | `DATABASE_URL`, `ENABLE_SECURITY_BOT=false`, `ENABLE_POKEMON_BOT=true` |
| **infinity-gauntlet-security** | worker | Dedicated security bot (role sweeps, permission enforcement) | `node security-bot.js` | `ENABLE_SECURITY_BOT=true`, `ENABLE_CONTINUOUS_SWEEP=true` |
| **infinity-gauntlet-outbox** | worker | Event bus message delivery (drains `BusMessage` table) | `node dist/worker/outbox.js` | `OUTBOX_MIN_DELAY_MS`, `OUTBOX_MAX_DELAY_MS`, `OUTBOX_BATCH_SIZE` |
| **infinity-gauntlet-cache** | worker | Runtime cache maintenance (prunes stale entries, rotates logs) | `node dist/worker/cache-refresh.js` | `CACHE_WORKER_INTERVAL_MS`, `CACHE_WORKER_INTERVAL_JITTER_MS` |
| **infinity-gauntlet-data-pipeline** | worker | Reference data updates (Pokédex, moves, abilities, type chart) | `node dist/worker/data-pipeline.js` | `DATA_PIPELINE_INTERVAL_MS`, `DATA_PIPELINE_RUN_ON_BOOT` |
| **pokedex-cache-worker** | worker | Git-backed cache refresher (external data sync) | `node scripts/worker.mjs` | Render disk mounts, Git credentials, schedule vars |
| **pokedex-cache-failsafe** | cron | Weekly cache fallback refresh | (Render cron schedule) | Cron schedule, fallback URLs |
| **infinity-gauntlet-bot** | web service | HTTP health checks & webhooks | `npm start` | HTTP port, health endpoint |

**For comprehensive worker architecture, scaling roadmap, and Phase 10+ opportunities, see [ARCHITECTURE-BIBLE § Worker Architecture](../architecture-bible/03-worker-architecture.md).**

## 1.2 Worker Responsibilities

### Main Bot Worker (`infinity-gauntlet`)

**Purpose:** Handles all gameplay interactions, battles, DM flows, and slash commands.

**Responsibilities:**
- Process Discord commands (`/home`, `/battle`, `/catch`, `/ops`)
- Execute battle engine calculations
- Manage encounter spawning
- Handle trainer progression
- Route admin commands

**Health Signals:**
- CLI dashboard (`discord` + `database` sections)
- Structured logs tagged `runtime.*`
- **RAM usage** <600 MB (15-30% of **2 GB RAM limit**, Standard plan) — NOT disk usage
- Latency <100ms for database queries

**Scaling Considerations:** CPU-bound during battle calculations, memory-bound with large guild caches. **Future:** Extract battle engine to dedicated worker pool (Phase 10+).

### Security Bot Worker (`infinity-gauntlet-security`)

**Purpose:** Enforces Discord permission guardrails via continuous role/permission sweeps.

**Responsibilities:**
- Monitor role/permission changes
- Auto-revert unauthorized edits
- Send DRIP alerts to DripTVDD
- Maintain 7-day operational history

**Health Signals:**
- CLI security section
- `worker.outbox.*` and `security.*` logs
- DRIP alert receipts
- State persistence to `/Store/security-bot-state/`

**Persistent Disk:** 1 GB mounted at `/Store` (defined in `render.yaml`) for 7-day state snapshots.

**⚠️ RESOURCE DISTINCTION:** This 1 GB disk is SEPARATE from the 2 GB RAM limit. The security bot uses BOTH:
- **RAM:** Process memory for runtime caching, event processing (~50-100 MB typical)
- **Disk:** Persistent state files surviving restarts (current.json, snapshots/*.json)

**See [ARCHITECTURE-BIBLE § Security Bot](../architecture-bible/07-security-bot.md) for comprehensive state persistence documentation.**

### Outbox Worker (`infinity-gauntlet-outbox`)

**Purpose:** Drains `BusMessage` events and uploads payloads to durable storage (S3/R2/local).

**Responsibilities:**
- Claim pending messages with `SKIP LOCKED`
- Send via Discord API
- Mark as `processed` or `error` state
- Implement exponential backoff on failures

**Health Signals:**
- `worker.outbox.health` logs
- Cache entries `outbox:last-*`
- `backupProvider` field in logs

**Durable Sink Configuration:**
- **S3/R2:** Set `BACKUP_STORAGE_PROVIDER=s3`, provide bucket/region/endpoint
- **Local:** Set `BACKUP_STORAGE_PROVIDER=local` for development
- **Disabled:** Leave unset (defaults to `none`, logs warning)

### Cache Refresh Worker (`infinity-gauntlet-cache`)

**Purpose:** Maintains runtime cache health via scheduled pruning and log rotation.

**Responsibilities:**
- Evict entries older than TTL
- Compact disk storage
- Report metrics via `cache.maintenance` events

**Health Signals:**
- `worker.cache.health` logs
- Cache metadata timestamps
- Disk usage <50% of allocated storage

**Cache Namespaces:**
- `battle-state/` — Active battle snapshots
- `encounter-state/` — Wild encounter sessions
- `trainer-state/` — Player progression data

### Data Pipeline Worker (`infinity-gauntlet-data-pipeline`)

**Purpose:** Periodic reference data updates from PokéAPI (Pokédex, moves, abilities, type chart).

**Responsibilities:**
- Fetch latest data from PokéAPI
- Transform to internal schema
- Generate optimized dexpack (`assets/dexpack.gen.mjs`)
- Seed database with new species/moves

**Health Signals:**
- `worker.pipeline.health` logs
- Manifest version logs
- Data staleness warnings

**Pipeline Stages:**
1. Fetch data from PokéAPI
2. Transform to internal schema
3. Generate dexpack assets
4. Seed database via Prisma

## 1.3 Service Dependencies

### Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│ External Dependencies                                       │
│  ├─ Discord API                                            │
│  ├─ Render PostgreSQL (PROD_DATABASE_URL)                 │
│  ├─ PokéAPI (reference data)                              │
│  └─ S3/R2 (durable event storage)                         │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Core Services                                               │
│  ├─ infinity-gauntlet (main bot) ────────────────┐         │
│  │   └─ Depends: PostgreSQL, Discord API         │         │
│  │                                                │         │
│  ├─ infinity-gauntlet-security ──────────────────┤         │
│  │   └─ Depends: PostgreSQL, Discord API, /Store │         │
│  │                                                │         │
│  ├─ infinity-gauntlet-outbox ────────────────────┤         │
│  │   └─ Depends: PostgreSQL, Discord API, S3/R2  │         │
│  │                                                │         │
│  ├─ infinity-gauntlet-cache ─────────────────────┤         │
│  │   └─ Depends: /Store (runtime cache)          │         │
│  │                                                │         │
│  └─ infinity-gauntlet-data-pipeline ─────────────┘         │
│      └─ Depends: PostgreSQL, PokéAPI                       │
└─────────────────────────────────────────────────────────────┘
```

### Critical Dependencies

**All Services:**
- Render PostgreSQL (`PROD_DATABASE_URL`) for <50ms latency
- Structured logging system
- Error tracking via ErrorTracker

**Security Bot ONLY:**
- Persistent disk at `/Store` for state snapshots
- DRIP alert webhook (`ALERT_WEBHOOK_URL`, `ALERT_CHANNEL_ID`, `ALERT_USER_ID`)

**Outbox Worker ONLY:**
- Durable storage provider (S3/R2/local)
- Backup storage credentials

## 1.4 Rollout Checklist

**Pre-Deployment Validation:**

1. ✅ Confirm pooled and direct database URLs resolve in Render dashboard for every service
2. ✅ Verify environment variables set correctly (see [§ 4 Environment Management](04-environment-management.md))
3. ✅ Run `npm run guard:dexpack` locally (ensures committed assets match source)
4. ✅ Check git status clean (no uncommitted changes)
5. ✅ Review recent commits for breaking changes

**Deployment Sequence:**

1. **Deploy security bot first** (`infinity-gauntlet-security`)
   - Allows `ENABLE_CONTINUOUS_SWEEP` traffic to move off main bot worker
   - Verify health signals within 5 minutes
   - Check `/Store/security-bot-state/current.json` for active state

2. **Redeploy main bot** (`infinity-gauntlet`) with `ENABLE_SECURITY_BOT=false`
   - Prevents duplicate sweeps
   - Verify gameplay commands functional (`/home`, `/battle`)
   - Check CLI dashboard shows healthy database connection

3. **Verify supporting workers** (outbox, cache, data-pipeline)
   - Tail logs for `worker.outbox.health`, `worker.cache.health`
   - Confirm pending counts stabilize (<5 minutes to first signal)
   - Check event bus messages draining correctly

4. **Post-Deployment Validation:**
   - Run `/ops stats` to verify query plans use indexes
   - Test DM Home history and cooldown flows
   - Verify security bot sweeps running (check logs for `security.*` events)

**Rollback Criteria:**
- Memory usage >450 MB sustained over 10 minutes
- Error rate >5% of requests
- Database latency >200ms consistently
- Security bot sweeps not running after 15 minutes
- Event bus queue depth >200 messages

## 1.5 Scaling Roadmap

**Current Capacity:**
- **Guilds:** 5-10 concurrent guilds
- **Players:** 100-200 concurrent users
- **Battles:** 10-20 concurrent battles
- **Memory:** 300-600 MB per service (15-30% of 2 GB limit, Standard plan)

**Phase 10+ Scaling Opportunities** (See [docs/workers.md](../deployment/workers.md)):

### Horizontal Scaling (Add More Workers)

1. **Battle Worker Pool** (P1 - High Impact)
   - Extract battle engine to dedicated worker pool
   - Scale based on concurrent battle count
   - Benefits: Isolate CPU-intensive calculations, improve main bot responsiveness

2. **Encounter Worker Pool** (P2 - Medium Impact)
   - Dedicated workers for wild encounters
   - Scale based on spawn rate
   - Benefits: Reduce main bot memory pressure

3. **Cache Worker Sharding** (P3 - Low Impact)
   - Shard cache namespaces across multiple workers
   - Benefits: Distribute disk I/O load

### Vertical Scaling (Increase Resources)

**✅ CURRENT:** Standard Plan (Upgraded 2025-11-17)
- 1 vCPU, 2 GB RAM per service
- 1 GB persistent disk (/Store)
- ~300-600 MB memory utilization (15-30%)

**Future Scaling Options:**

1. **CPU Upgrade** (1 vCPU → 2 vCPU)
   - When: Battle calculations cause latency >500ms
   - Benefits: Faster battle resolution, improved player experience

2. **Memory Upgrade** (2 GB → 4 GB)
   - When: Memory usage >1.5 GB sustained
   - Benefits: Support larger guild caches, more concurrent battles

### Cost Optimization

**Current Costs (November 2025):**
- Standard Plan: $25/month per service (1 CPU, 2 GB RAM)
- 7 workers @ $25/month = $175/month
- 1 web service @ $25/month = $25/month
- PostgreSQL @ $7/month = $7/month
- **Total:** ~$207/month

**Scaling Cost Projections:**
- +2 battle workers: +$14/month ($77/month total)
- +1 GB memory upgrade: +$7/service ($112/month for 8 services)
- +Dedicated CPU: +$25/service (recommended for battle workers only)

---

[← Back to INDEX](INDEX.md) | [Next: Database Operations →](02-database-operations.md)