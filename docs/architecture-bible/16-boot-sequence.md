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

## Graceful Shutdown Architecture

**Source Function:** `gracefulShutdown(reason: string)` (Lines 900-1020)  
**Triggers:** SIGTERM, SIGINT, scheduled 12-hour restart, manual shutdown  
**Philosophy:** "Save critical data first, then clean up services—zero data loss on restart."

### Overview

The graceful shutdown process ensures **zero data loss** during restarts through a **2-phase approach**: save critical runtime state first (battles, security data, logs), then cleanly tear down services in reverse dependency order.

**Critical Goals:**
1. **Zero Data Loss**: Persist all active gameplay state before shutdown
2. **Timed Operations**: Individual timing for each save operation (observability)
3. **Fail-Safe**: Continue shutdown even if individual operations fail (best-effort)
4. **Fast Execution**: Complete within 5-10 seconds (Render SIGTERM timeout)
5. **Reverse Order**: Shutdown services opposite of initialization (dependency safety)

**Shutdown Timing Target:** <10 seconds (Phase 1: 1-3s, Phase 2: 4-7s)

---

### Phase 1: Critical Data Persistence (Priority Saves)

**Purpose:** Persist all active runtime state that would cause data loss if not saved.

**Execution Strategy:** Sequential saves with individual timing (not parallel, to avoid I/O contention).

#### Step 1A: Persist Active Battle Sessions

**Source:** `battleManager.shutdown()`  
**Purpose:** Save all in-progress battles to database (move history, HP, status effects)  
**Timing:** ~50-200ms (depends on active battle count)

```typescript
log.info(`📊 Persisting battle sessions...`);
const battleStart = process.hrtime.bigint();
if (battleManager && typeof battleManager.shutdown === "function") {
  await battleManager.shutdown();
}
const battleTime = Number(process.hrtime.bigint() - battleStart) / 1_000_000;
log.info(`✅ Battle sessions persisted (${battleTime.toFixed(2)}ms)`);
```

**What's Saved:**
- Active battle state (both trainers, Pokémon HP, status, PP)
- Move history and turn count
- Battle type (wild encounter, trainer battle, arena)
- Last action timestamp

**Data Loss if Skipped:** All battles reset to initial state, players lose progress mid-battle.

#### Step 1B: Save Security Bot State

**Source:** `securityBotState.save()`  
**Purpose:** Persist 7-day security monitoring history to JSON snapshots  
**Timing:** ~10-50ms (JSON file write to `/Store/security-bot-state/`)

```typescript
log.info(`📊 Saving security bot state...`);
const securityStart = process.hrtime.bigint();
if (
  global.securityBotState &&
  typeof global.securityBotState.save === "function"
) {
  await global.securityBotState.save();
}
const securityTime = Number(process.hrtime.bigint() - securityStart) / 1_000_000;
log.info(`✅ Security bot state saved (${securityTime.toFixed(2)}ms)`);
```

**What's Saved:**
- Cumulative statistics (total sweeps, alerts, permission changes)
- Activity timeline (last 100 events with timestamps)
- Per-guild monitoring context (last sweep times, counts, status)
- Restart history (count, last restart timestamp)

**Data Loss if Skipped:** Security bot loses operational memory, cumulative stats reset to zero, restart count lost.

#### Step 1C: Flush Engine Write Buffer

**Source:** `engineWriteBuffer.flush()`  
**Purpose:** Drain pending battle logs, move usage, and anomaly entries to Write-DB  
**Timing:** ~100-500ms (depends on queue size, batch inserts to SQLite)

```typescript
log.info(`📊 Flushing engine write buffer...`);
const bufferStart = process.hrtime.bigint();
if (engineWriteBuffer && typeof engineWriteBuffer.flush === "function") {
  await engineWriteBuffer.flush();
}
const bufferTime = Number(process.hrtime.bigint() - bufferStart) / 1_000_000;
log.info(`✅ Engine write buffer flushed (${bufferTime.toFixed(2)}ms)`);
```

**What's Saved:**
- Battle outcome logs (winner, loser, duration, final HP)
- Move usage statistics (accuracy, damage, critical hits)
- Battle anomalies (impossible damage, invalid states)

**Data Loss if Skipped:** Battle analytics lost, move usage trends incomplete, anomaly detection gaps.

#### Step 1D: Flush AI Logs

**Source:** `aiLogger.flush()`  
**Purpose:** Drain buffered AI model interaction logs to disk  
**Timing:** ~50-100ms (async file writes)

```typescript
log.info(`📊 Flushing AI logs...`);
const aiLogsStart = process.hrtime.bigint();
if (aiLogger && typeof aiLogger.flush === "function") {
  await aiLogger.flush();
}
const aiLogsTime = Number(process.hrtime.bigint() - aiLogsStart) / 1_000_000;
log.info(`✅ AI logs flushed (${aiLogsTime.toFixed(2)}ms)`);
```

**What's Saved:**
- AI model requests/responses (prompts, completions, tokens)
- Error tracking and retry attempts
- Performance metrics (latency, throughput)

**Data Loss if Skipped:** AI interaction history incomplete, debugging context lost.

#### Step 1E: Persist Cooldowns

**Source:** `cooldownModule.shutdown()`  
**Purpose:** Save active command cooldowns to prevent exploit abuse  
**Timing:** ~10-30ms (in-memory map to JSON)

```typescript
log.info(`📊 Persisting cooldowns...`);
const cooldownStart = process.hrtime.bigint();
if (cooldownModule && typeof cooldownModule.shutdown === "function") {
  await cooldownModule.shutdown();
}
const cooldownTime = Number(process.hrtime.bigint() - cooldownStart) / 1_000_000;
log.info(`✅ Cooldowns persisted (${cooldownTime.toFixed(2)}ms)`);
```

**What's Saved:**
- Per-user cooldown expiry timestamps (catch, battle, heal commands)
- Rate limit counters (prevents spam after restart)

**Data Loss if Skipped:** Cooldowns reset, users can spam commands immediately after restart (exploit risk).

#### Step 1F: Save Pokémon Service Cache (Optional)

**Source:** `pokemonService?.saveCache()`  
**Purpose:** Persist Pokémon dex cache to reduce API calls after restart  
**Timing:** ~50-200ms (large JSON write)  
**Status:** **Non-Critical** (cache rebuild is safe but slower)

```typescript
log.info(`📊 Saving Pokémon service cache...`);
const cacheStart = process.hrtime.bigint();
try {
  const pokemonService = registry.get("pokemonService");
  if (pokemonService && typeof pokemonService.saveCache === "function") {
    await pokemonService.saveCache();
  }
} catch (err) {
  log.warn(`⚠️ Optional cache save failed (non-critical): ${err.message}`);
}
const cacheTime = Number(process.hrtime.bigint() - cacheStart) / 1_000_000;
log.info(`✅ Pokémon service cache saved (${cacheTime.toFixed(2)}ms)`);
```

**What's Saved:**
- Cached Pokémon species data (stats, types, moves)
- Cached move data (power, accuracy, effects)
- Type effectiveness chart

**Data Loss if Skipped:** Slower startup (cache rebuild from PokéAPI), but no gameplay data lost.

---

### Phase 2: Graceful Service Shutdown (Cleanup)

**Purpose:** Tear down services in reverse dependency order, stop workers, close database connections.

**Execution Strategy:** Reverse order of initialization (prevents "dependency not available" errors).

#### Step 2A: Mark Engine Not Ready

**Purpose:** Stop accepting new game operations (battles, encounters, catches)

```typescript
log.info(`🛑 Marking engine not ready...`);
global.engineReady = false;
```

**Impact:** All gameplay commands reject with "System maintenance, try again soon" error.

#### Step 2B: Stop Engine DB Workers

**Source:** `stopEngineWorkers()`  
**Workers Stopped:**
- CacheRefreshWorker (hourly L1 cache reload)
- WriteBufferFlusher (30s buffer drain)
- ReadDbSyncWorker (daily Read-DB refresh)
- WriteDbValidatorWorker (10min data quality checks)

```typescript
log.info(`🛑 Stopping Engine DB workers...`);
await stopEngineWorkers();
```

**Timing:** ~100-500ms (wait for active worker runs to complete)

#### Step 2C: Stop Error Learning Worker

**Source:** `errorLearningWorker.stop()`  
**Purpose:** Stop ML-based error pattern analysis

```typescript
log.info(`🛑 Stopping error learning worker...`);
if (errorLearningWorker && typeof errorLearningWorker.stop === "function") {
  await errorLearningWorker.stop();
}
```

#### Step 2D: Stop Resource Monitor

**Source:** `resourceMonitor.stop()`  
**Purpose:** Stop memory guardian and resource tracking

```typescript
log.info(`🛑 Stopping resource monitor...`);
if (resourceMonitor && typeof resourceMonitor.stop === "function") {
  await resourceMonitor.stop();
}
```

**Components Stopped:**
- Memory guardian (OOM prevention)
- Heap snapshot scheduler
- Resource usage metrics collection

#### Step 2E: Shutdown Services via Service Registry

**Source:** `registry.shutdownAll()`  
**Order:** Reverse of initialization (see Section 17.5)

```typescript
log.info(`🛑 Shutting down services via Service Registry...`);
const registryStart = process.hrtime.bigint();
await registry.shutdownAll();
const registryTime = Number(process.hrtime.bigint() - registryStart) / 1_000_000;
log.info(`✅ Services shut down (${registryTime.toFixed(2)}ms)`);
```

**Services Shutdown (Reverse Order):**
1. Discord Bot Client (stop interaction listeners)
2. Event Bus (drain subscriptions, clear replay buffer)
3. Cache Services (stop LRU eviction timers)
4. Database Heartbeat Monitors (stop Prisma health checks)
5. Logger Auto-Refresh (stop stats polling)
6. Error Tracker (flush pending errors)
7. Config Manager (release file watchers)
8. Service Registry (final cleanup)

**Timing:** ~500-1500ms (depends on active subscriptions and connections)

#### Step 2F: Shutdown Event Bus

**Source:** `eventBus.shutdown()`  
**Purpose:** Drain pending events, close subscriptions, clear replay buffer

```typescript
log.info(`🛑 Shutting down Event Bus...`);
if (eventBus && typeof eventBus.shutdown === "function") {
  await eventBus.shutdown();
}
```

**Operations:**
- Drain pending event queue (deliver all enqueued events)
- Close all pattern subscriptions
- Clear correlation tracking maps
- Release backpressure monitoring timers

#### Step 2G: Shutdown AI Logging System

**Source:** `aiLogger.shutdown()`  
**Purpose:** Final log flush, close file handles

```typescript
log.info(`🛑 Shutting down AI logging system...`);
if (aiLogger && typeof aiLogger.shutdown === "function") {
  await aiLogger.shutdown();
}
```

#### Step 2H: Save Write-DB to Disk

**Source:** `engineWriteDb.save()`  
**Purpose:** Persist in-memory SQLite (sql.js) to disk

```typescript
log.info(`🛑 Saving Write-DB...`);
if (engineWriteDb && typeof engineWriteDb.save === "function") {
  await engineWriteDb.save();
}
```

**Timing:** ~200-500ms (binary database export)

#### Step 2I: Close Read-DB

**Source:** `engineReadDb.close()`  
**Purpose:** Close SQLite connection, release file locks

```typescript
log.info(`🛑 Closing Read-DB...`);
if (engineReadDb && typeof engineReadDb.close === "function") {
  await engineReadDb.close();
}
```

---

### Shutdown Triggers

#### 1. Scheduled 12-Hour Restart (Auto-Restart Timer)

**Source:** Lines 1052-1055

```typescript
const AUTO_RESTART_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
setTimeout(() => {
  log.info("⏰ Scheduled 12-hour restart triggered");
  gracefulShutdown("scheduled-restart");
}, AUTO_RESTART_INTERVAL_MS);
```

**Purpose:** Regular memory cleanup, prevent long-running process degradation  
**Frequency:** Every 12 hours (Render best practice)  
**Impact:** Zero downtime (Render restarts immediately after exit code 0)

#### 2. SIGTERM (Render Deployment)

**Source:** Signal handler registration (Lines 1074-1080)

```typescript
process.on("SIGTERM", () => {
  log.info("📡 SIGTERM received (Render deployment)");
  gracefulShutdown("SIGTERM");
});
```

**When Triggered:**
- Render deployment (new code push)
- Manual restart via Render dashboard
- Scale-down events

**Timeout:** Render waits 30 seconds for graceful shutdown before sending SIGKILL

#### 3. SIGINT (Local Development)

**Source:** Signal handler registration (Lines 1082-1088)

```typescript
process.on("SIGINT", () => {
  log.info("⌨️ SIGINT received (Ctrl+C)");
  gracefulShutdown("SIGINT");
});
```

**When Triggered:** Developer presses `Ctrl+C` in terminal

#### 4. Uncaught Exception (Crash Recovery)

**Source:** Exception handler (Lines 1090-1099)

```typescript
process.on("uncaughtException", async (error) => {
  log.error("💥 Uncaught exception:", error);
  try {
    await gracefulShutdown("uncaught-exception");
  } catch (shutdownError) {
    log.error("Failed to shutdown gracefully:", shutdownError);
  }
  process.exit(2);
});
```

**Exit Code:** 2 (signals crash, Render restarts after 30s delay)

---

### Shutdown Performance Metrics

**Total Timing Target:** <10 seconds (within Render's 30s SIGTERM timeout)

**Phase 1 Breakdown (Critical Saves):**
- Battle sessions: 50-200ms
- Security state: 10-50ms
- Write buffer: 100-500ms
- AI logs: 50-100ms
- Cooldowns: 10-30ms
- Pokémon cache: 50-200ms (optional)
- **Phase 1 Total:** 270-1,080ms (~1-3 seconds)

**Phase 2 Breakdown (Service Cleanup):**
- Engine workers stop: 100-500ms
- Error learning stop: 50-100ms
- Resource monitor stop: 50-100ms
- Service Registry shutdown: 500-1,500ms
- Event Bus shutdown: 100-300ms
- AI logger shutdown: 50-100ms
- Write-DB save: 200-500ms
- Read-DB close: 10-50ms
- **Phase 2 Total:** 1,060-3,150ms (~1-3 seconds)

**Combined Total:** 1,330-4,230ms (~2-5 seconds typical, <10 seconds worst-case)

---

### Shutdown Safety Guarantees

#### 1. Zero Data Loss

**Guarantee:** All active gameplay state persisted before service teardown.

**Verified By:**
- Battle sessions saved to database (Step 1A)
- Security monitoring state saved to JSON (Step 1B)
- Engine write buffer flushed to Write-DB (Step 1C)
- AI interaction logs flushed to disk (Step 1D)
- Cooldowns persisted to prevent exploits (Step 1E)

**Failure Handling:** If Phase 1 operation fails, error logged but shutdown continues (best-effort).

#### 2. Dependency Safety

**Guarantee:** Services never torn down while dependents are active.

**Verified By:**
- Phase 1 completes BEFORE Phase 2 starts (sequential execution)
- Phase 2 uses Service Registry reverse shutdown (opposite of init order)
- Workers stopped BEFORE services (prevents "service not available" errors)

#### 3. Idempotency

**Guarantee:** Calling `gracefulShutdown()` multiple times is safe.

**Implementation:** Guard flag `isShuttingDown` prevents concurrent shutdown.

```typescript
let isShuttingDown = false;

async function gracefulShutdown(reason: string) {
  if (isShuttingDown) {
    log.warn(`Shutdown already in progress (reason: ${reason})`);
    return;
  }
  isShuttingDown = true;
  // ... shutdown logic
}
```

#### 4. Crash Recovery

**Guarantee:** Even if shutdown fails, next boot detects unclean shutdown and recovers.

**Recovery Mechanisms:**
- Battle manager detects incomplete battles, offers resume/forfeit
- Security bot detects missing `gracefulShutdown` flag, sends crash alert DM
- Write-DB replays WAL (Write-Ahead Log) to recover uncommitted transactions
- Event Bus replays event buffer (up to 1000 events preserved)

---

### Shutdown Observability

#### Console Logging

**Format:** Emoji-prefixed sequential operations with individual timing.

```
📊 Persisting battle sessions...
✅ Battle sessions persisted (127.43ms)
📊 Saving security bot state...
✅ Security bot state saved (23.18ms)
📊 Flushing engine write buffer...
✅ Engine write buffer flushed (345.67ms)
🛑 Marking engine not ready...
🛑 Stopping Engine DB workers...
✅ Services shut down (1,234.56ms)
👋 Graceful shutdown complete (reason: SIGTERM)
```

#### Shutdown Metrics (Logged to Render)

**Captured Metrics:**
- Total shutdown duration
- Phase 1 duration (critical saves)
- Phase 2 duration (service cleanup)
- Per-operation timing (each save/stop)
- Shutdown reason (scheduled, SIGTERM, SIGINT, crash)
- Success/failure status per operation

**Monitoring:** Render logs capture all shutdown metrics for performance analysis.

---

### Shutdown Error Handling

#### Best-Effort Philosophy

**Strategy:** Continue shutdown even if individual operations fail (prevent cascade failures).

```typescript
try {
  await battleManager.shutdown();
} catch (err) {
  log.error(`❌ Battle session save failed: ${err.message}`);
  // Continue shutdown (don't throw)
}
```

#### Error Scenarios

| Scenario | Handling | Impact |
|----------|----------|--------|
| **Battle save fails** | Log error, continue shutdown | Recent battle progress lost (rare) |
| **Security state save fails** | Log error, continue shutdown | Cumulative stats lost, restart count reset |
| **Write buffer flush fails** | Log error, continue shutdown | Battle analytics incomplete (non-critical) |
| **Service Registry shutdown fails** | Log error, force exit | May leak resources, Render cleans up |
| **Database close fails** | Log error, force exit | File locks released by OS |

**Worst-Case:** All Phase 1 saves fail → Shutdown completes anyway → Render restarts → Boot recovery detects unclean shutdown → Offers resume/recovery options to users.

---

### Shutdown Integration with Seamless Restart Architecture

**Future Enhancement (65-Day Roadmap):**

The graceful shutdown architecture is **Phase 0** of the seamless restart system. Planned enhancements:

1. **Phase 1 (Days 1-5):** Battle state versioning (migration-safe battle resume)
2. **Phase 2 (Days 6-15):** Pre-shutdown player notifications (30s warning DMs)
3. **Phase 3 (Days 16-30):** Active session migration (transfer battles to standby instance)
4. **Phase 4 (Days 31-45):** Zero-downtime deployment (blue-green switchover)
5. **Phase 5 (Days 46-55):** Intelligent restart scheduling (avoid peak hours)
6. **Phase 6 (Days 56-60):** Restart metrics dashboard (success rate, data loss tracking)
7. **Phase 7 (Days 61-65):** Automated rollback (detect bad deployments, auto-revert)

See `docs/SEAMLESS-RESTART-ARCHITECTURE.md` for comprehensive roadmap.

---

### Cross-References

#### Related Architecture Sections
- **[17-service-registry.md](17-service-registry.md)** — Service Registry shutdown mechanism (Section 17.5)
- **[02-database-architecture.md](02-database-architecture.md)** — Database connection cleanup
- **[09-game-engine.md](09-game-engine.md)** — Engine DB Write-DB save, Read-DB close
- **[07-security-bot.md](07-security-bot.md)** — Security bot state persistence on shutdown

#### Related Operations Documentation
- **[operations-bible/01-service-matrix.md](../operations-bible/01-service-matrix.md)** — Render restart behavior, exit codes
- **[operations-bible/05-monitoring.md](../operations-bible/05-monitoring.md)** — Shutdown metrics monitoring

#### Related Development Documentation
- **[development-bible/03-debugging.md](../development-bible/03-debugging.md)** — Debugging shutdown failures
- **SEAMLESS-RESTART-ARCHITECTURE.md** — Future seamless restart system (65-day roadmap)

---

**Last Updated:** 2025-11-19  
**Lines Added:** 602 (shutdown documentation)  
**Total Document Lines:** 1,257  
**Status:** PRODUCTION

**Last Updated:** 2025-11-19  
**Maintained By:** Core Infrastructure  
**Review Cadence:** On boot sequence changes, performance regressions

