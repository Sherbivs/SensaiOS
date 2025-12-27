# Section 3: Worker Architecture

**Last Updated**: 2025-12-27 | **Status**: Production

[← Back to INDEX](INDEX.md) | [← Previous: Database Architecture](02-database-architecture.md) | [Next: Event Bus →](04-event-bus.md)

---

**Philosophy**: "Workers are specialists—each with a clear responsibility, running independently, scaling horizontally."

**Purpose**: Distributed worker architecture for reliability, scalability, and operational clarity.

## 3.1 Current Worker Architecture

The Infinity Gauntlet uses **8 independent Render services** (7 workers + 1 web service + 1 cron job).

**Current Workers:**
1. **Discord Bot Worker** (`infinity-gauntlet-bots`) — Main gameplay bot
2. **Outbox Worker** (`infinity-gauntlet-outbox`) — Async message delivery
3. **Cache Refresh Worker** (`infinity-gauntlet-cache`) — Runtime cache maintenance
4. **Data Pipeline Worker** (`infinity-gauntlet-data-pipeline`) — Reference data updates
5. **Security Bot Worker** (`infinity-gauntlet-security`) — Permission enforcement
6. **Pokédex Cache Worker** (`pokedex-cache-worker`) — External data sync
7. **Pokédex Cache Failsafe** (`pokedex-cache-failsafe`) — Cron fallback
8. **Web Service** (`infinity-gauntlet-bot`) — HTTP health checks & webhooks

### 1. Discord Bot Worker

**Purpose**: Main Discord bot handling gameplay interactions, battles, encounters, and DM flows.

**Runtime**:
- Start Command: `npm start` → `tsx src/index.ts`
- Plan: Standard (1 vCPU, 2 GB RAM, upgraded 2025-11-17)
- Disk: 2 GB persistent (`/Store`)
- Region: Virginia

**Environment**:
```yaml
NODE_ENV: production
SERVICE_NAME: discord-bots
ENABLE_POKEMON_BOT: true
ENABLE_SECURITY_BOT: false
ENABLE_DB_AUTO_SYNC: true  # DEV→PROD sync every 5 minutes
BATTLE_CHANNEL_NAME: pokemon-battles
```

**Database Access** (Unified Architecture):
- **PROD_DATABASE_URL**: Render-managed PostgreSQL for <50ms latency
- **Unified Mode**: Single database for all operations (no separate DEV/PROD databases)

**Scaling Considerations**:
- CPU-bound during battle calculations
- Memory-bound with large guild member caches
- **Future**: Extract battle engine to dedicated worker pool

### 2. Outbox Worker

**Purpose**: Async message delivery — processes queued Discord messages from `BusMessage` table.

**Runtime**:
- Start Command: `node dist/worker/outbox.js`
- Plan: Starter
- Disk: 2 GB persistent

**Environment**:
```yaml
OUTBOX_MIN_DELAY_MS: 250
OUTBOX_MAX_DELAY_MS: 1500
OUTBOX_BATCH_SIZE: 100
```

**Processing Loop**:
1. Claims pending messages with `SKIP LOCKED` (prevents duplicate processing)
2. Sends via Discord API
3. Marks as `processed` or `error` state
4. Implements exponential backoff on failures

**Scaling**: Horizontally scalable (multiple workers process different batches)

### 3. Cache Refresh Worker

**Purpose**: Maintains runtime cache health — prunes stale entries, rotates logs, monitors disk usage.

**Runtime**:
- Start Command: `node dist/worker/cache-refresh.js`
- Disk: 1 GB persistent (`/Store/runtime-cache/`)

**Cache Namespaces**:
- `battle-state/` — Active battle snapshots
- `encounter-state/` — Wild encounter sessions
- `trainer-state/` — Player progression data

**Maintenance Tasks**:
- Evicts entries older than TTL
- Compacts disk storage
- Reports metrics via `cache.maintenance` events

### 4. Data Pipeline Worker

**Purpose**: Periodic reference data updates (Pokédex, moves, abilities, type chart).

**Runtime**:
- Start Command: `node dist/worker/data-pipeline.js`
- Disk: 1 GB persistent

**Pipeline Stages**:
1. Fetch latest data from PokéAPI
2. Transform to internal schema
3. Generate optimized dexpack (`assets/dexpack.gen.mjs`)
4. Seed database with new species/moves

**Scaling**: CPU-intensive during transformation, network-intensive during fetch

### 5. Security Bot Worker

**Purpose**: Enforces Discord permission guardrails — auto-reverts unauthorized role changes.

**Runtime**:
- Start Command: `node security-bot.js`
- Disk: 1 GB persistent (`/Store/security-bot-state/`)

**Environment**:
```yaml
ENABLE_SECURITY_BOT: true
ENABLE_CONTINUOUS_SWEEP: true
ROLE_NAME: Trainer
```

**Guardrail Logic**:
- Monitors role/permission changes via Discord events
- Allows guild owner + administrators
- Auto-reverts other edits, sends DM to DripTVDD
- Records `revertStatus` / `revertErrors` when rollback fails

**State Persistence**: 7-day rolling history in `/Store/security-bot-state/`

## 3.2 Cross-Worker State Visibility

**Problem**: Render workers run as isolated processes. Each worker has its own memory space and cannot access `global` variables from other workers.

**Solution**: Workers write operational state to `/Store` (persistent disk shared across all services).

**Architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│ Render Infrastructure                                       │
│                                                             │
│  ┌─────────────────────────┐    ┌──────────────────────┐  │
│  │ infinity-gauntlet-bots  │    │ infinity-gauntlet-   │  │
│  │ (main bot worker)       │    │ security (security   │  │
│  │                         │    │ bot worker)          │  │
│  │  - Discord bot          │    │                      │  │
│  │  - Game engine          │    │  - Permission sweeps │  │
│  │  - Logger (metrics)     │    │  - Auto-revert       │  │
│  │    ↓ READ               │    │    ↓ WRITE           │  │
│  └─────────│───────────────┘    └──────────┬───────────┘  │
│            │                               │               │
│            │     /Store (persistent disk)  │               │
│            │           1GB mount           │               │
│            └───────────────┬───────────────┘               │
│                            │                               │
│      ┌─────────────────────┴─────────────────────┐        │
│      │ /Store/security-bot-state/                │        │
│      │   ├── current.json    (active state)     │        │
│      │   ├── previous.json   (backup)           │        │
│      │   └── snapshots/      (timestamped)      │        │
│      └──────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

**Benefits**:
- ✅ Cross-worker observability (main bot can show security bot stats)
- ✅ Restart resilience (state survives crashes)
- ✅ Historical analysis (timestamped snapshots retained)
- ✅ SSH debugging (can `cat` state files directly)

**Security Bot State Structure**:

```json
{
  "version": 1,
  "metadata": {
    "lastSaved": "2025-11-10T07:26:49.300Z",
    "lastRestart": "2025-11-10T07:16:49.292Z",
    "hostname": "infinity-gauntlet",
    "nodeVersion": "v22.16.0"
  },
  "cumulative": {
    "totalUptime": 0,
    "restartCount": 22,
    "sweepCount": 482,
    "alertCount": 0,
    "permissionChangesDetected": 0,
    "permissionChangesReverted": 0
  },
  "timeline": {
    "events": [
      {
        "type": "sweep",
        "timestamp": "2025-11-10T07:20:00.000Z",
        "guildId": "123456789",
        "changesDetected": 0
      }
    ]
  }
}
```

**Main Bot Integration**:

```typescript
// src/utils/logger.js (main bot worker)
import fs from 'fs';
import path from 'path';

function readSecurityBotState() {
  try {
    const statePath = path.join('/Store', 'security-bot-state', 'current.json');
    const stateRaw = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(stateRaw);
  } catch (error) {
    return null;  // Security bot not running or state unavailable
  }
}

function updateSecurityBotSection() {
  const state = readSecurityBotState();
  
  if (!state) {
    return "Status: <unavailable: not-running>";
  }
  
  return `
Status: ${state.cumulative.restartCount > 0 ? 'online' : 'initializing'}
Guilds: ${state.cumulative.guildCount}
Last Sweep: ${formatTimestamp(state.timeline.events[0]?.timestamp)}
Total Sweeps: ${state.cumulative.sweepCount}
Alerts: ${state.cumulative.alertCount}
  `.trim();
}
```

**Scaling Considerations**:
- Single writer per state file (one security bot worker)
- Multiple readers allowed (main bot, SSH sessions)
- File locking not needed (writes are atomic via `fs.writeFileSync`)
- State files small (<100 KB, negligible disk usage)

---

[← Back to INDEX](INDEX.md) | [← Previous: Database Architecture](02-database-architecture.md) | [Next: Event Bus →](04-event-bus.md)