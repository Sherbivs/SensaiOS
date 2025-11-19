# 16. Boot Sequence Architecture

**Source File:** `src/index.ts` (1626 lines)  
**Entry Point:** `npm start` → `node dist/index.js` → `boot()` function  
**Created:** 2025-11-19  
**Status:** PRODUCTION

---

## Overview

The boot sequence is the ordered initialization of all services, databases, and runtime components when the application starts. This process is **instrumented with performance metrics** and includes **graceful degradation** for failures.

**Critical Goals:**
1. **Fast Startup**: Measure every phase with nanosecond precision
2. **Fail-Fast**: Database connectivity failure stops boot immediately
3. **Observable**: Real-time CLI status dashboard shows progress
4. **Memory Tracking**: Record memory usage at each phase
5. **Graceful Degradation**: Automatic recovery for database failures

---

## Boot Sequence Phases

### Phase 0: Pre-Boot (Before `boot()`)

**Timing Start:** `STARTUP_START = process.hrtime.bigint()`

1. **Module Imports** (Lines 1-66)
   - Import all dependencies (Prisma, Discord.js, services)
   - **Lazy-loaded modules** (only imported if needed):
     - `autoSync.js` (only if `ENABLE_DB_AUTO_SYNC=true`)
     - `databaseRecovery.js` (only if connection fails)
     - Cache monitoring utilities (deferred to reduce startup time)
   - **Timing Recorded:** `module_imports`
   - **Memory Recorded:** `initial`

2. **Global State Setup** (Lines 70-80)
   - Expose `STARTUP_MEMORY` globally (for `/ops memory` command)
   - Initialize startup performance tracking structures
   - Setup memory profiling functions

---

### Phase 1: Foundation Services (Service Registry)

**Entry Point:** `boot()` function (Line 1113)

**Timing Start:** `REGISTRY_START = process.hrtime.bigint()`

**Steps:**

1. **Install Signal Handlers** (Line 1116)
   ```typescript
   installSignalHandlers(); // SIGTERM, SIGINT, uncaughtException
   ```
   - Registers graceful shutdown handlers
   - Captures unhandled exceptions
   - Ensures clean process exit

2. **Start Monitor** (Line 1117)
   ```typescript
   startMonitor(); // CLI status dashboard
   ```
   - Initializes real-time CLI status dashboard
   - Updates every 5 seconds with service health

3. **Service Registry Initialization** (Lines 1124-1143)
   ```typescript
   registry.registerAll(getAllServiceConfigs());
   await registry.initializeAll();
   ```
   
   **Services Initialized (9 total):**
   - `resource-manager` — Memory and CPU monitoring
   - `error-tracker` — Error detection and tracking
   - `engine-cache` — L1 Pokemon data cache (20 MB max)
   - `engine-write-buffer` — Battle log write buffer (3 queues)
   - `error-learning` — AI-powered error analysis
   - `resource-monitor` — System resource monitoring
   - `engine-read-db` — SQLite read-only Pokemon database
   - `engine-write-db` — SQLite write-ahead log for battles
   - `cache-facade` — Unified cache interface

4. **Service Health Check** (Lines 1155-1169)
   ```typescript
   const allHealth = registry.getAllHealth();
   // healthy, initializing, degraded counts
   ```
   - Verifies all services initialized successfully
   - Logs health status for observability
   - **Expected:** 9 healthy, 0 degraded

5. **Logger Auto-Refresh Start** (Lines 1174-1178)
   ```typescript
   startLoggerAutoRefresh(); // 15s interval
   ```
   - **CRITICAL:** Started AFTER Service Registry to avoid race condition
   - Previously caused "degraded" warnings for error-tracker/engine-cache
   - **Why delayed:** Logger tries to import error-tracker during refresh

**Timing Recorded:** `service_registry`  
**Memory Recorded:** `pre_database`

---

### Phase 2: Database Connection

**Timing Start:** `dbStart = process.hrtime.bigint()`

**Status Dashboard:**
```
Section: database
Status: connecting → OK / error
```

**Steps:**

1. **Prisma Initialization** (Line 1185)
   ```typescript
   await initPrisma(); // Load all 3 Prisma clients
   ```
   - **Clients Initialized:**
     - `prisma` (PROD_DATABASE_URL) — Primary Render PostgreSQL
     - `onPremiseDevPrisma` (DATABASE_ONPREMISE_DEV_PRIMARY) — Workstation mirror
     - `onPremiseExperimentPrisma` (DATABASE_ONPREMISE_DEV_EXPERIMENT) — Test cluster

2. **Connectivity Test** (Line 1186)
   ```typescript
   await prisma.$queryRaw(Prisma.sql`SELECT 1`);
   ```
   - **Success:** Records latency, fires heartbeat event
   - **Failure:** Triggers automatic database recovery (Phase 2.1)

3. **Heartbeat Monitoring** (Lines 1199-1202)
   ```typescript
   detachPrismaHeartbeatListener = onPrismaHeartbeat(renderPrismaHeartbeat);
   stopPrismaHeartbeatTask = startPrismaHeartbeat(); // 30s interval
   ```
   - Monitors database health every 30 seconds
   - Renders heartbeat status to CLI dashboard

4. **Auto-Sync Supervisor** (Lines 1203-1212, optional)
   ```typescript
   if (ENABLE_DB_AUTO_SYNC) {
     const { startAutoSyncSupervisor } = await import("./runtime/autoSync.js");
     stopAutoSyncSupervisor = startAutoSyncSupervisor();
   }
   ```
   - **Only if** `ENABLE_DB_AUTO_SYNC=true`
   - Syncs ONPREMISE-DEV-PRIMARY ← CLOUD-PROD-MASTER every 5 minutes

**Timing Recorded:** `database_connect`  
**Memory Recorded:** `post_database`

---

#### Phase 2.1: Database Recovery (Failure Path)

**Triggered:** Database connection fails in Phase 2

**Status Dashboard:**
```
Phase: Database recovery
Section: database
Status: error → connecting
```

**Steps:**

1. **Lazy-Load Recovery Module** (Line 1225)
   ```typescript
   const { runDatabaseRecovery } = await import("./runtime/databaseRecovery.js");
   await runDatabaseRecovery();
   ```
   - Checks if PostgreSQL is installed
   - Attempts to bootstrap missing databases
   - Logs recovery attempts to `Store/db/bootstrap.log`

2. **Retry Connection** (Line 1229)
   ```typescript
   await initPrisma();
   await prisma.$queryRaw(Prisma.sql`SELECT 1`);
   ```
   - **Success:** Proceeds to Phase 3
   - **Failure:** Logs remediation steps, throws error, exits process

**Remediation Steps (Logged on Failure):**
```
- Ensure PROD_DATABASE_URL is set correctly (points to Render-managed PostgreSQL)
- For workers, confirm service type is 'Background Worker' and it references the same DB
- Check that PostgreSQL is installed and running on the target server
- Review logs at Store/db/bootstrap.log for bootstrap script errors
```

---

### Phase 3: Engine DB + Discord Bots (Parallel)

**Timing Start:** Individual timers for `engine_db` and `discord_bot`

**Status Dashboard:**
```
Section: engine (Engine DB: initializing → OK)
Section: discord (Discord Bot: connecting → ready)
```

**Parallel Initialization:**

The next section of code (lines 1280-1400) initializes:
- Engine Database workers (read DB, write DB, write buffer)
- Discord bot connections (Pokemon bot, Security bot)

These happen **in parallel** to reduce startup time.

**Components Initialized:**

1. **Engine Read DB** (`engine-read-db`)
   - SQLite database with Pokemon reference data
   - Loaded from `/Store/engine-read.db`
   - ~5 MB size, read-only, WAL mode

2. **Engine Write DB** (`engine-write-db`)
   - SQLite database for battle logs
   - Loaded from `/Store/engine-write.db`
   - WAL-protected, auto-checkpoint every 1000 pages

3. **Engine Write Buffer** (`engine-write-buffer`)
   - In-memory write queues (battles, moves, anomalies)
   - Flushes to Write DB every 30 seconds
   - 10k entry capacity per queue

4. **Discord Pokemon Bot**
   - Connects to Discord API with `POKEMON_BOT_TOKEN`
   - Registers slash commands
   - Sets up event handlers

5. **Discord Security Bot** (optional)
   - Only if `ENABLE_SECURITY_BOT=true`
   - Connects to Discord API with `SECURITY_BOT_TOKEN`
   - Loads persistent state from `/Store/security-bot-state/`

**Memory Recorded:** `pre_engine_and_bots` → `post_engine_and_bots`

---

### Phase 4: Engine Workers (Background Processing)

**Timing Start:** `ENGINE_WORKERS_START = process.hrtime.bigint()`

**Steps:**

1. **Validate Engine DB Configuration** (Line ~1380)
   ```typescript
   await validateEngineDbConfig();
   ```
   - Checks that Engine Read DB and Write DB are properly configured
   - Verifies SQLite files exist and are readable

2. **Start Engine Workers** (Line ~1390)
   ```typescript
   await startEngineWorkers();
   engineWorkersRunning = true;
   ```
   
   **Workers Started:**
   - **Flush Worker** — Flushes Write Buffer to Write DB every 30s
   - **Sync Worker** — Syncs Write DB to Read DB every 60s
   - **Checkpoint Worker** — Forces WAL checkpoint every 5 minutes

3. **Start Error Learning Worker** (Line ~1400)
   ```typescript
   errorLearningWorker.start();
   ```
   - Analyzes error patterns with AI
   - Suggests fixes for recurring errors
   - 5-minute stagger delay to avoid startup congestion

**Timing Recorded:** `engine_workers`

---

### Phase 5: Runtime Monitoring

**Timing Start:** `MONITORING_START = process.hrtime.bigint()`

**Steps:**

1. **Start Resource Monitor** (Line ~1410)
   ```typescript
   resourceMonitor.start(); // 5-minute interval
   ```
   - Monitors memory, CPU, disk usage
   - Logs resource warnings if thresholds exceeded

2. **Mark Engine Ready** (Line ~1420)
   ```typescript
   global.engineReady = true;
   ```
   - Signals that battle system is ready
   - Allows users to start battles

3. **Schedule Auto-Restart** (Line ~1430, production only)
   ```typescript
   if (process.env.RENDER) {
     scheduleAutoRestart(); // 12-hour timer
   }
   ```
   - **Production Only:** Schedules restart after 12 hours
   - Triggers `gracefulShutdown("scheduled-restart")`
   - Render automatically restarts the process after exit

**Memory Recorded:** `steady_state`

**Timing Recorded:** `monitoring`

---

### Phase 6: Boot Complete

**Final Steps:**

1. **Calculate Total Boot Time** (Line ~1450)
   ```typescript
   const totalBootMs = Number(process.hrtime.bigint() - STARTUP_START) / 1_000_000;
   ```

2. **Log Memory Progression** (Line ~1460)
   ```typescript
   const progression = calculateMemoryProgression(STARTUP_MEMORY);
   log.info("Memory progression", progression);
   ```
   
   **Example Output:**
   ```
   Memory Progression:
   - Module Imports: +15 MB RSS, +12 MB Heap
   - Database Connection: +5 MB RSS, +3 MB Heap
   - Engine DB + Bots: +80 MB RSS, +45 MB Heap
   - Runtime Monitoring: +2 MB RSS, +1 MB Heap
   Total Growth: +102 MB RSS (Startup → Steady State)
   ```

3. **Capture Heap Snapshot** (Line ~1480, if enabled)
   ```typescript
   if (process.env.CAPTURE_STARTUP_SNAPSHOT === 'true') {
     const snapshotPath = `/Store/heap-snapshots/startup-${Date.now()}.heapsnapshot`;
     v8.writeHeapSnapshot(snapshotPath);
   }
   ```
   - **Optional:** Captures V8 heap snapshot for memory analysis
   - Triggered by `CAPTURE_STARTUP_SNAPSHOT=true` environment variable

4. **Update CLI Status** (Line ~1500)
   ```typescript
   setPhase("Running");
   setSection("system", { title: "System", status: "ready", metrics: [...] });
   ```
   - Marks all systems as ready
   - CLI dashboard shows green status indicators

5. **Log Boot Summary** (Line ~1510)
   ```typescript
   log.info("Infinity Gauntlet online", {
     boot_time: `${totalBootMs.toFixed(2)}ms`,
     memory: formatBytes(process.memoryUsage().rss),
     uptime: `${process.uptime().toFixed(2)}s`,
   });
   ```

**Timing Recorded:** `total_boot` (from `STARTUP_START`)

---

## Boot Sequence Timing Breakdown

**Typical Production Boot (Render, Standard Plan, 2 GB RAM):**

| Phase | Duration | Cumulative | Notes |
|-------|----------|------------|-------|
| Module Imports | ~200ms | 200ms | Discord.js, Prisma, Services |
| Service Registry | ~150ms | 350ms | 9 services initialized |
| Database Connect | ~50ms | 400ms | Render PostgreSQL (Oregon) |
| Engine DB + Bots | ~800ms | 1200ms | Discord API + SQLite load |
| Engine Workers | ~50ms | 1250ms | Start background workers |
| Runtime Monitoring | ~10ms | 1260ms | Resource monitor start |
| **Total Boot Time** | **~1260ms** | — | ~1.3 seconds (target: <2s) |

**Workstation Boot (Local, 16 GB RAM):**

| Phase | Duration | Cumulative | Notes |
|-------|----------|------------|-------|
| Module Imports | ~150ms | 150ms | Faster SSD |
| Service Registry | ~100ms | 250ms | 9 services initialized |
| Database Connect | ~30ms | 280ms | Local PostgreSQL |
| Engine DB + Bots | ~600ms | 880ms | Discord API + SQLite load |
| Engine Workers | ~40ms | 920ms | Start background workers |
| Runtime Monitoring | ~5ms | 925ms | Resource monitor start |
| **Total Boot Time** | **~925ms** | — | <1 second (excellent) |

---

## Memory Progression (Production)

**Initial → Steady State Memory Growth:**

| Phase | RSS (MB) | Heap (MB) | External (MB) | Notes |
|-------|----------|-----------|---------------|-------|
| **Initial** (Module load) | 50 | 30 | 5 | Node.js baseline |
| **Post-Database** | 65 | 40 | 6 | +15 MB (Prisma clients) |
| **Pre-Engine/Bots** | 65 | 40 | 6 | (No change) |
| **Post-Engine/Bots** | 180 | 95 | 25 | +115 MB (Discord.js cache) |
| **Steady State** | 185 | 98 | 26 | +5 MB (monitors started) |
| **Total Growth** | **+135 MB** | **+68 MB** | **+21 MB** | Startup overhead |

**Peak Memory (After 12 Hours):**
- RSS: ~300-600 MB (15-30% of 2 GB limit)
- Heap: ~150-250 MB
- External: ~30-50 MB

**Memory Leak Detection:**
- If RSS grows >50 MB/hour → investigate
- If Heap grows >20 MB/hour → investigate
- Auto-restart every 12 hours prevents unbounded growth

---

## Boot Failure Scenarios

### Scenario 1: Database Connection Failure

**Symptom:**
```
Database connectivity failed; attempting recovery
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Recovery Steps:**
1. Lazy-load `databaseRecovery.js`
2. Check if PostgreSQL is installed
3. Attempt to bootstrap databases
4. Retry connection
5. **If fails:** Log remediation steps, exit process

**Exit Code:** 1 (non-zero, Render restarts service)

### Scenario 2: Service Registry Initialization Failure

**Symptom:**
```
Service Registry initialization failed
Error: Failed to initialize service 'engine-cache'
```

**Recovery:** None (fail-fast)

**Exit Code:** 1 (non-zero, Render restarts service)

### Scenario 3: Discord API Connection Failure

**Symptom:**
```
Discord bot connection failed
Error: DISALLOWED_INTENTS
```

**Recovery:** None (fail-fast)

**Exit Code:** 1 (non-zero, Render restarts service)

**Remediation:** Check Discord bot token and intents configuration

### Scenario 4: Engine DB Corruption

**Symptom:**
```
Engine Read DB failed to load
Error: SQLITE_CORRUPT: database disk image is malformed
```

**Recovery:**
1. Delete corrupted SQLite file
2. Rebuild from PostgreSQL data
3. Retry initialization

**Exit Code:** 0 if recovery succeeds, 1 if fails

---

## Boot Observability

### CLI Status Dashboard

**Real-Time Display (Updates Every 5s):**

```
┌─────────────────────────────────────────────────────┐
│ Infinity Gauntlet — Initializing Services          │
├─────────────────────────────────────────────────────┤
│ Database            ✓ OK       Latency: 45ms       │
│ Engine DB           ✓ OK       Read: 5.2 MB        │
│ Discord Bot         ✓ Ready    Guilds: 12          │
│ Engine Workers      ✓ Running  Flush: 30s          │
│ System              ✓ Ready    Uptime: 1.2s        │
└─────────────────────────────────────────────────────┘

Services: 9 healthy, 0 degraded
Boot Time: 1260ms
Memory: 185 MB RSS
```

### Startup Logs (JSON Format, Production)

```json
{
  "level": "info",
  "message": "Service Registry initialized",
  "services": 9,
  "duration": "150.23ms",
  "timestamp": "2025-11-19T12:00:01.234Z"
}
{
  "level": "info",
  "message": "Database connectivity OK",
  "latency": "45.67ms",
  "transport": "PROD",
  "timestamp": "2025-11-19T12:00:01.384Z"
}
{
  "level": "info",
  "message": "Infinity Gauntlet online",
  "boot_time": "1260.45ms",
  "memory": "185 MB",
  "uptime": "1.26s",
  "timestamp": "2025-11-19T12:00:02.494Z"
}
```

### Performance Metrics (`/ops performance`)

**Accessible via Discord command:**
```
/ops performance
```

**Output:**
```
Boot Performance:
- Module Imports: 200.12ms
- Service Registry: 150.23ms
- Database Connect: 45.67ms
- Engine DB + Bots: 800.45ms
- Engine Workers: 50.12ms
- Runtime Monitoring: 10.34ms
Total Boot Time: 1260.45ms

Memory Progression:
- Initial: 50 MB
- Post-Database: 65 MB (+15 MB)
- Post-Engine/Bots: 180 MB (+115 MB)
- Steady State: 185 MB (+5 MB)
Total Growth: +135 MB
```

---

## Boot Optimization Strategies

### 1. Lazy Loading (Implemented)

**Deferred Imports:**
- `autoSync.js` (only if `ENABLE_DB_AUTO_SYNC=true`)
- `databaseRecovery.js` (only if connection fails)
- Cache monitoring utilities (deferred to post-boot)

**Savings:** ~50ms startup time

### 2. Parallel Initialization (Implemented)

**Parallel Tasks:**
- Engine DB initialization + Discord bot connection
- Read DB load + Write DB load

**Savings:** ~300ms startup time (from 1.5s → 1.2s)

### 3. Service Registry Optimization (Future)

**Idea:** Initialize services in dependency order
- Phase 1: Independent services (resource-manager, error-tracker)
- Phase 2: Dependent services (engine-cache needs error-tracker)
- Phase 3: High-level services (cache-facade needs engine-cache)

**Expected Savings:** ~50ms (reduce initialization wait time)

### 4. Discord.js Cache Tuning (Future)

**Current:** Default cache settings (~100 MB memory)

**Optimization:**
```typescript
const client = new Client({
  intents: [...],
  sweepers: {
    messages: { interval: 300, lifetime: 60 }, // 5min sweep, 1min lifetime
    users: { interval: 300, filter: () => (user) => user.bot }, // Sweep bot users
  },
  makeCache: Options.cacheWithLimits({
    MessageManager: 200, // 200 messages max
    UserManager: 100, // 100 users max
    GuildMemberManager: 100, // 100 members max
  }),
});
```

**Expected Savings:** ~50 MB memory, ~100ms startup time

---

## Boot Sequence Exit Codes

| Exit Code | Meaning | Recovery Action |
|-----------|---------|-----------------|
| 0 | Clean shutdown (scheduled restart) | Render restarts immediately |
| 1 | Boot failure (database, services) | Render restarts after 30s delay |
| 2 | Uncaught exception | Render restarts after 30s delay |
| 137 | SIGKILL (OOM, force kill) | Render restarts after 30s delay |
| 143 | SIGTERM (graceful shutdown) | Render restarts immediately |

---

## Cross-References

### Related Architecture Sections
- **[02-database-architecture.md](02-database-architecture.md)** — Database URL selection, multi-client runtime
- **[03-worker-architecture.md](03-worker-architecture.md)** — Worker boot sequences (outbox, cache, data-pipeline)
- **[05-logging-architecture.md](05-logging-architecture.md)** — Logger initialization order constraint
- **[06-error-system.md](06-error-system.md)** — Error tracker integration during boot
- **[11-safety-guarantees.md](11-safety-guarantees.md)** — Fail-fast database validation

### Related Operations Documentation
- **[operations-bible/01-service-matrix.md](../operations-bible/01-service-matrix.md)** — Render service start commands
- **[operations-bible/02-database-operations.md](../operations-bible/02-database-operations.md)** — Database bootstrap procedures
- **[operations-bible/05-monitoring.md](../operations-bible/05-monitoring.md)** — Boot performance monitoring

### Related Development Documentation
- **[development-bible/01-local-setup.md](../development-bible/01-local-setup.md)** — Local boot sequence differences
- **[development-bible/03-debugging.md](../development-bible/03-debugging.md)** — Debugging boot failures

---

**Last Updated:** 2025-11-19  
**Maintained By:** Core Infrastructure  
**Review Cadence:** On boot sequence changes, performance regressions

