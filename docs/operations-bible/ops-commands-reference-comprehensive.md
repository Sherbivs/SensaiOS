# /ops Commands Reference — Complete Guide
**Version:** 1.0  
**Last Updated:** 2025-12-02  
**Scope:** Complete reference for ALL /ops command variations  
**Target Audience:** Operations team, on-call engineers, administrators

---

## Table of Contents

1. [Overview](#overview)
2. [Access Control](#access-control)
3. [Command Structure](#command-structure)
4. [Commands Reference](#commands-reference)
   - [/ops stats](#ops-stats)
   - [/ops database](#ops-database)
   - [/ops workers](#ops-workers)
   - [/ops logs](#ops-logs)
   - [/ops cache](#ops-cache)
   - [/ops engine](#ops-engine)
   - [/ops state](#ops-state)
   - [/ops memory](#ops-memory)
   - [/ops cooldown reset](#ops-cooldown-reset)
5. [Integration with Monitoring](#integration-with-monitoring)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### Purpose
The `/ops` command suite provides **real-time operational visibility** into the Infinity Gauntlet Discord bot. These commands enable:
- **Database health monitoring** (PROD Postgres, TimescaleDB, Engine DBs)
- **Worker status tracking** (9 background workers)
- **Log query and analysis** (TimescaleDB ingestion)
- **Cache management** (runtime cache metrics + manual cleanup)
- **Memory profiling** (heap usage, buffer analysis)
- **Security bot state** (cumulative statistics, activity timeline)
- **Cooldown management** (reset user rate limits)

### Command Count
- **8 primary commands** (stats, database, workers, logs, cache, engine, state, memory)
- **1 subcommand group** (cooldown reset)
- **50+ parameter combinations** (detailed, filters, time windows)

### Execution Model
- **Admin-only** — All commands restricted via `isAdmin()` check
- **Ephemeral responses** — Output visible only to command executor
- **Deferred replies** — Long-running queries use `interaction.deferReply()`
- **Error tracking** — All failures captured via `errorTracker.captureError()`

---

## Access Control

### Authorization Methods

**Method 1: Discord Guild Permissions (Primary)**
```typescript
// User must have "Administrator" permission bit
const member = interaction.member as GuildMember;
if (member.permissions?.has?.("Administrator")) return true;
```

**Method 2: Environment Variable Whitelist (Fallback)**
```bash
# secrets/Infinity-Gauntlet.env
ADMIN_USER_IDS=123456789012345678,987654321098765432
```

```typescript
// Comma-separated Discord user IDs
const allowList = process.env.ADMIN_USER_IDS.split(",");
if (allowList.includes(interaction.user.id)) return true;
```

### Non-Admin Response
```
⛔ Admin only.
```
*Ephemeral message shown to unauthorized users*

### Security Considerations

**✅ DO:**
- Add trusted administrators to Discord guild roles
- Use ADMIN_USER_IDS for bot owner access
- Review audit logs for command usage

**❌ DON'T:**
- Share ADMIN_USER_IDS publicly
- Grant Administrator permission to untrusted users
- Execute /ops commands in public channels (use DMs or admin-only channels)

---

## Command Structure

### Discord Slash Command Format
```
/ops <subcommand> [parameters]
/ops <subcommand_group> <subcommand> [parameters]
```

### Parameter Types

| Type | Example | Validation |
|------|---------|------------|
| **String** | `worker:prod` | Options list or freeform |
| **Integer** | `limit:10` | Min/max range validation |
| **Boolean** | `detailed:true` | true/false toggle |
| **User Mention** | `user:@Player` | Discord user picker |

### Response Pattern
```
1. User invokes: /ops <subcommand>
2. Bot defers: "Thinking..." (ephemeral)
3. Bot executes: Query/analysis (1-10 seconds)
4. Bot replies: Formatted report (ephemeral)
5. Error handling: "Command failed: <reason>"
```

---

## Commands Reference

### /ops stats

**Purpose:** Display comprehensive application statistics including database counts, recent battles, Event Bus status, and system diagnostics.

#### Syntax
```
/ops stats [limit:<number>] [after:<ISO8601>] [participant:<discord_id>]
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | Integer | No | 5 | Number of recent battles (1-20) |
| `after` | String (ISO8601) | No | null | Filter battles after timestamp |
| `participant` | String (Discord ID or mention) | No | null | Filter battles by participant |

#### Examples

**Example 1: Basic stats (default)**
```
/ops stats
```

**Output:**
```
📊 Application Statistics
Generated: 2025-12-02 14:32:15 EST

Database Counts:
• Users: 1,234
• Active Encounters: 45
• Active Battles: 12
• Cooldowns: 678

Recent Battles (Last 5):
1. Battle ID: battle-abc123
   Ended: 2m ago (2025-12-02 14:30:00 EST)
   Winner: <@123456789012345678> (2500 XP)
   Loser: <@987654321098765432> (1000 XP)
   Turns: 15 | Reason: KO

2. Battle ID: battle-def456
   Ended: 15m ago (2025-12-02 14:17:00 EST)
   Winner: <@555555555555555555> (3000 XP)
   Loser: <@666666666666666666> (1200 XP)
   Turns: 22 | Reason: KO

[... 3 more battles ...]

Total Finished Battles: 5,678

Event Bus:
• Pending messages: 42
• Last processed: 2025-12-02T19:30:45.123Z

System Diagnostics:
• Node: v20.11.0
• Service: infinity-gauntlet-bot
• Environment: production
• Database: infinity-gauntlet-db.render.com
• Cache: 1,250 entries | TTL: 300,000ms
• Database Status: ✅ Connected
```

---

**Example 2: Recent battles (last 10)**
```
/ops stats limit:10
```

**Output:**
```
📊 Application Statistics
[...same header...]

Recent Battles (Last 10):
[... 10 battles with full details ...]
```

---

**Example 3: Battles after specific timestamp**
```
/ops stats after:2025-12-01T00:00:00Z limit:20
```

**Output:**
```
📊 Application Statistics
[...same header...]

Window: Showing 20 battles after 2025-12-01 00:00:00 EST

Recent Battles (Last 20):
[... battles filtered by timestamp ...]
```

---

**Example 4: Battles for specific participant**
```
/ops stats participant:@Player limit:15
```
*OR*
```
/ops stats participant:123456789012345678 limit:15
```

**Output:**
```
📊 Application Statistics
[...same header...]

Window: Showing 15 battles for participant 123456789012345678

Recent Battles (Last 15):
[... battles where participant was winner OR loser ...]
```

---

**Example 5: Combined filters**
```
/ops stats after:2025-12-01T00:00:00Z participant:@Player limit:10
```

**Output:**
```
📊 Application Statistics
[...same header...]

Window: Showing 10 battles after 2025-12-01 00:00:00 EST for participant 123456789012345678

Recent Battles (Last 10):
[... filtered results ...]
```

#### Error Cases

**Invalid limit (out of range)**
```
/ops stats limit:25
```
**Output:**
```
⛔ Limit must be between 1 and 20.
```

---

**Invalid after timestamp**
```
/ops stats after:invalid-date
```
**Output:**
```
⛔ Invalid 'after' timestamp. Use ISO 8601, e.g. 2025-10-26T00:00:00Z.
```

---

**Invalid participant format**
```
/ops stats participant:not-a-discord-id
```
**Output:**
```
⛔ Invalid 'participant' value. Provide a Discord ID or mention, e.g. 123456789012345678 or <@123456789012345678>.
```

---

### /ops database

**Purpose:** Check health status of ALL database workers (PROD Postgres, TimescaleDB, Engine Read, Engine Write).

#### Syntax
```
/ops database [worker:<worker_name>]
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `worker` | String (choice) | No | null (all workers) | Specific worker to inspect |

**Worker Options:**
- `prod` — PROD Postgres worker
- `timescale` — TimescaleDB worker
- `engine-read` — Engine Read-DB worker (SQLite)
- `engine-write` — Engine Write-DB worker (SQLite)

#### Examples

**Example 1: All database workers (default)**
```
/ops database
```

**Output:**
```
📊 Database Workers Status

PROD Postgres Worker:
  Status: ✅ HEALTHY
  Latency: 45ms
  Operations: 12,450 (12,398 success, 52 errors)
  Error Rate: 0.42%
  Uptime: 6h 23m

TimescaleDB Worker:
  Status: ✅ HEALTHY
  Latency: 67ms
  Operations: 145,678 (145,234 success, 444 errors)
  Error Rate: 0.30%
  Uptime: 6h 23m

Engine Read Worker:
  Status: ✅ HEALTHY
  Operations: 234 (234 success, 0 errors)
  Last Sync: 2h 15m ago
  
Engine Write Worker:
  Status: ✅ HEALTHY
  Operations: 1,234 (1,234 success, 0 errors)
  WAL Entries: 0 (all applied)
```

---

**Example 2: PROD Postgres worker only**
```
/ops database worker:prod
```

**Output:**
```
📊 PROD Postgres Worker Status

Status: ✅ HEALTHY
Connection: postgresql://infinity-gauntlet-db.render.com:5432/****
Latency: 45ms (last heartbeat)
Pool: 3/10 connections active
Operations: 12,450 total
  • Success: 12,398 (99.58%)
  • Errors: 52 (0.42%)
Last Error: 45m ago
  • Type: Query timeout
  • Query: SELECT * FROM "Battle" WHERE ...
Uptime: 6h 23m
Consecutive Failures: 0
```

---

**Example 3: TimescaleDB worker**
```
/ops database worker:timescale
```

**Output:**
```
📊 TimescaleDB Worker Status

Status: ✅ HEALTHY
Connection: postgresql://timescale-host.render.com:5432/****
Latency: 67ms (last query)
Ingestion Rate: 145 logs/min (average)
Operations: 145,678 total
  • Inserts: 145,234 (99.70%)
  • Failed: 444 (0.30%)
Last Batch: 2m ago
  • Size: 1,234 log entries
  • Duration: 1.2s
Hypertable: log_entries
  • Total Size: 2.4 GB
  • Compressed: 1.2 GB (50% compression)
  • Chunks: 30 (7 compressed)
Uptime: 6h 23m
```

---

**Example 4: Engine Read worker**
```
/ops database worker:engine-read
```

**Output:**
```
📊 Engine Read-DB Worker Status

Status: ✅ HEALTHY
File: /Store/engine-read-db/pokemon.db
Size: 15.2 MB
Last Sync: 2h 15m ago
  • Source: PROD Postgres
  • Duration: 45s
  • Status: ✅ Success
Operations: 234 (all reads)
Data Counts:
  • Pokémon: 1,025 species
  • Moves: 919 moves
  • Type Effectiveness: 324 entries
Version: 1.0.0
Next Sync: 21h 45m (daily at 05:00 UTC)
```

---

**Example 5: Engine Write worker**
```
/ops database worker:engine-write
```

**Output:**
```
📊 Engine Write-DB Worker Status

Status: ✅ HEALTHY
File: /Store/engine-write-db/battles.db
Size: 42.8 MB
WAL: 0 entries (all applied)
Operations: 1,234 total
  • Writes: 1,234 (100% success)
  • Errors: 0
Data Counts:
  • Battle Logs: 5,678 entries
  • Move Usage: 123,456 entries
  • Anomalies: 12 entries (2 unresolved)
Last Flush: 15s ago
  • Buffer → DB: 234 entries
  • Duration: 0.8s
Last Validation: 8m ago
  • Quality Score: 98.5%
  • Status: ✅ Passed (95%+ required)
Last Upload: 2h 30m ago
  • Uploaded: 12,345 entries to PROD
  • Duration: 45s
  • Status: ✅ Success
Uptime: 6h 23m
```

#### Error Cases

**Worker unavailable**
```
/ops database worker:prod
```
**Output:**
```
⚠️ PROD Postgres Worker: ERROR

Status: 🔴 UNHEALTHY
Last Error: Connection timeout
Error Time: 2m ago
Consecutive Failures: 3
Automatic Reconnect: In progress...

See /ops workers detailed:true for full diagnostics
```

---

### /ops workers

**Purpose:** Display status of ALL background workers (Engine workers, Database workers, Log Ingestion, Error Learning, Security Bot).

#### Syntax
```
/ops workers [detailed:<boolean>]
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `detailed` | Boolean | No | false | Show detailed execution history |

#### Examples

**Example 1: Summary view (default)**
```
/ops workers
```

**Output:**
```
🔧 Background Workers Status

Engine Workers (5):
✅ Cache Refresh Worker
   Last Run: 15m ago | Next: 45m
   Success: 23/23 (100%)
   
✅ Write Buffer Flusher
   Last Run: 15s ago | Next: 15s
   Success: 12,450/12,450 (100%)
   
✅ Read-DB Sync Worker
   Last Run: 2h 15m ago | Next: 21h 45m
   Success: 6/6 (100%)
   
✅ Write-DB Validator
   Last Run: 8m ago | Next: 2m
   Success: 37/37 (100%)
   
✅ Maintenance Worker
   Last Run: 4h 12m ago | Next: 3h 48m
   Success: 1/1 (100%)

Database Workers (4):
✅ PROD Postgres Worker
   Operations: 12,450 | Error Rate: 0.42%
   
✅ TimescaleDB Worker
   Operations: 145,678 | Error Rate: 0.30%
   
✅ Engine Read Worker
   Last Sync: 2h 15m ago
   
✅ Engine Write Worker
   WAL Entries: 0 (all applied)

Application Workers (4):
✅ Error Learning Worker
   Last Run: 5m ago | Next: 55m
   Patterns Learned: 45
   
✅ Log Ingestion Worker
   Last Run: 30s ago | Next: 30s
   Ingestion Rate: 145 logs/min
   
✅ Outbox Worker
   Last Run: 10s ago | Next: 5s
   Pending Messages: 42
   
✅ Cache Maintenance Worker
   Last Run: 8m ago | Next: 2m
   Cleaned: 234 expired entries

Overall: 13/13 workers ✅ HEALTHY
```

---

**Example 2: Detailed view**
```
/ops workers detailed:true
```

**Output:**
```
🔧 Background Workers Status (Detailed)

═══ Cache Refresh Worker ═══
Status: ✅ RUNNING
Interval: 1 hour (+5s stagger)
Last Run: 15m ago
  • Start: 2025-12-02 14:17:23 EST
  • End: 2025-12-02 14:18:08 EST
  • Duration: 45s
  • Status: ✅ Success
Next Run: 45m (2025-12-02 15:03:23 EST)
Execution History:
  • 2025-12-02 14:17:23 — 45s — ✅ Success
  • 2025-12-02 13:17:23 — 43s — ✅ Success
  • 2025-12-02 12:17:23 — 47s — ✅ Success
  • 2025-12-02 11:17:23 — 44s — ✅ Success
  • 2025-12-02 10:17:23 — 46s — ✅ Success
Success Rate: 23/23 (100%)
Total Uptime: 6h 23m

═══ Write Buffer Flusher ═══
Status: ✅ RUNNING
Interval: 30 seconds (+10s stagger)
Last Run: 15s ago
  • Start: 2025-12-02 14:32:00 EST
  • End: 2025-12-02 14:32:00 EST
  • Duration: 0.8s
  • Status: ✅ Success
  • Flushed: 234 entries (battle logs + move usage)
Next Run: 15s (2025-12-02 14:32:30 EST)
Recent Executions:
  • 14:32:00 — 0.8s — ✅ Success — 234 entries
  • 14:31:30 — 0.7s — ✅ Success — 189 entries
  • 14:31:00 — 0.9s — ✅ Success — 267 entries
  • 14:30:30 — 0.6s — ✅ Success — 145 entries
  • 14:30:00 — 0.8s — ✅ Success — 201 entries
Success Rate: 12,450/12,450 (100%)
Average Duration: 0.75s
Total Uptime: 6h 23m

[... detailed stats for all 13 workers ...]

Overall: 13/13 workers ✅ HEALTHY
Total Operations: 171,846
Total Errors: 496 (0.29% error rate)
```

#### Error Cases

**Worker degraded/error**
```
/ops workers
```
**Output:**
```
🔧 Background Workers Status

[... healthy workers ...]

⚠️ Write-DB Validator Worker
   Status: 🟡 DEGRADED
   Last Run: 8m ago | Next: 2m
   Success: 35/37 (94.6%)
   Last 2 Errors:
     • 45m ago: Validation failed (quality score 92% < 95%)
     • 1h 15m ago: Upload timeout (PROD database slow)

[... more workers ...]

Overall: 12/13 workers healthy, 1 degraded
```

---

### /ops logs

**Purpose:** Query and display log entries from TimescaleDB with filtering by level, category, time window, and limit.

#### Syntax
```
/ops logs [level:<level>] [category:<category>] [limit:<number>] [since:<duration>]
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `level` | String (choice) | No | null (all) | Filter by log level |
| `category` | String (choice) | No | null (all) | Filter by category |
| `limit` | Integer | No | 20 | Max entries to return (1-100) |
| `since` | String (duration) | No | 1h | Time window (e.g., "10m", "1h", "24h", "7d") |

**Level Options:**
- `error` — Critical failures
- `warn` — Warnings
- `info` — Informational messages
- `debug` — Debug output

**Category Options:**
- `DATABASE` — Database operations
- `WORKER` — Background worker execution
- `CACHE` — Cache operations
- `ENGINE` — Game engine operations
- `BATTLE` — Battle system
- `ENCOUNTER` — Wild encounter system
- `NETWORK` — Network/API calls
- `SECURITY` — Security bot operations

**Duration Format:**
- `s` — Seconds (e.g., `30s`)
- `m` — Minutes (e.g., `10m`)
- `h` — Hours (e.g., `1h`, `24h`)
- `d` — Days (e.g., `7d`)

#### Examples

**Example 1: Recent logs (default)**
```
/ops logs
```

**Output:**
```
📋 Log Entries

**Filters:** Since: 1h | Limit: 20
**Results:** 18 entries

🔵 **[DATABASE]** 2m ago
   Query executed successfully: SELECT * FROM "Battle" WHERE state = 'ACTIVE'

🟡 **[WORKER]** 5m ago
   Write Buffer at 75% capacity (7,500/10,000 entries)

🔵 **[ENGINE]** 8m ago
   Battle result validated: battle-abc123 (quality score: 98.5%)

🔵 **[CACHE]** 10m ago
   Cache maintenance completed (234 entries cleaned, 12 MB freed)

🔴 **[DATABASE]** 15m ago
   Query timeout: SELECT * FROM "BusMessage" WHERE status = 'PENDING' (exceeded 30s limit)

[... 13 more entries ...]

*Showing first 10 of 18 entries*
```

---

**Example 2: Error logs only**
```
/ops logs level:error
```

**Output:**
```
📋 Log Entries

**Filters:** Level: ERROR | Since: 1h | Limit: 20
**Results:** 3 entries

🔴 **[DATABASE]** 15m ago
   Query timeout: SELECT * FROM "BusMessage" WHERE status = 'PENDING' (exceeded 30s limit)

🔴 **[WORKER]** 45m ago
   Write-DB validation failed: quality score 92% < 95% threshold

🔴 **[NETWORK]** 58m ago
   Discord API rate limit exceeded: POST /channels/123456789/messages (429 Too Many Requests)
```

---

**Example 3: Worker category, last 10 minutes**
```
/ops logs category:WORKER since:10m limit:50
```

**Output:**
```
📋 Log Entries

**Filters:** Category: WORKER | Since: 10m | Limit: 50
**Results:** 12 entries

🟡 **[WORKER]** 2m ago
   Write Buffer at 75% capacity (7,500/10,000 entries)

🔵 **[WORKER]** 5m ago
   Cache Refresh Worker completed (45s duration, 1,025 species loaded)

🔵 **[WORKER]** 8m ago
   Write-DB Validator completed (quality score: 98.5%, 12,345 entries validated)

🔵 **[WORKER]** 10m ago
   Log Ingestion Worker processed batch (1,234 log entries, 1.2s duration)

[... 8 more entries ...]
```

---

**Example 4: Database errors, last 24 hours**
```
/ops logs level:error category:DATABASE since:24h limit:100
```

**Output:**
```
📋 Log Entries

**Filters:** Level: ERROR | Category: DATABASE | Since: 24h | Limit: 100
**Results:** 24 entries

🔴 **[DATABASE]** 15m ago
   Query timeout: SELECT * FROM "BusMessage" WHERE status = 'PENDING' (exceeded 30s limit)

🔴 **[DATABASE]** 2h 30m ago
   Connection lost: postgresql://infinity-gauntlet-db.render.com:5432 (ETIMEDOUT)

🔴 **[DATABASE]** 4h 15m ago
   Migration failed: 20251202120000_add_new_column (syntax error at line 15)

[... 21 more entries ...]
```

---

**Example 5: Debug logs, last 5 minutes**
```
/ops logs level:debug since:5m limit:30
```

**Output:**
```
📋 Log Entries

**Filters:** Level: DEBUG | Since: 5m | Limit: 30
**Results:** 28 entries

⚪ **[ENGINE]** 1m ago
   Move effectiveness calculated: Fire vs Grass = 2.0x

⚪ **[BATTLE]** 2m ago
   Turn resolved: Player1 used Flamethrower (120 damage, super effective)

⚪ **[DATABASE]** 3m ago
   Prisma query: findUnique({ where: { discordId: "123456789012345678" } })

⚪ **[CACHE]** 4m ago
   Cache hit: species:25 (Pikachu) — 0.5μs lookup

[... 24 more entries ...]
```

#### Error Cases

**Invalid duration format**
```
/ops logs since:invalid
```
**Output:**
```
⛔ Invalid duration format: invalid. Use format like "1h", "24h", "7d"
```

---

**No logs found**
```
/ops logs level:error category:SECURITY since:1h
```
**Output:**
```
📋 Log Entries

**Filters:** Level: ERROR | Category: SECURITY | Since: 1h | Limit: 20
**Results:** 0 entries

*No log entries found matching filters*
```

---

### /ops cache

**Purpose:** Display runtime cache metrics and optionally trigger manual cleanup.

#### Syntax
```
/ops cache [cleanup:<boolean>]
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `cleanup` | Boolean | No | false | Run manual cache cleanup |

#### Examples

**Example 1: Cache metrics (default)**
```
/ops cache
```

**Output:**
```
💾 Runtime Cache Metrics
Generated: 2025-12-02 14:32:15 EST

Overall Stats:
• Total Entries: 1,250
• Total Size: 42.3 MB
• Hit Rate: 87.5% (12,345 hits / 14,123 requests)
• Miss Rate: 12.5% (1,778 misses)
• Evictions: 234 (last hour)
• Last Cleanup: 8m ago

Namespace Breakdown:

┌─ species (Pokémon Reference Data) ─┐
│ Entries: 1,025                      │
│ Size: 15.2 MB                       │
│ Hit Rate: 98.5%                     │
│ Avg Lookup: 0.5μs                   │
│ TTL: 1 hour                         │
│ Last Refresh: 15m ago               │
└─────────────────────────────────────┘

┌─ moves (Move Reference Data) ─┐
│ Entries: 919                   │
│ Size: 8.7 MB                   │
│ Hit Rate: 97.2%                │
│ Avg Lookup: 0.4μs              │
│ TTL: 1 hour                    │
│ Last Refresh: 15m ago          │
└────────────────────────────────┘

┌─ user_sessions (Active Users) ─┐
│ Entries: 45                     │
│ Size: 1.2 MB                    │
│ Hit Rate: 65.3%                 │
│ TTL: 5 minutes                  │
│ Expiring Soon: 12 entries       │
└─────────────────────────────────┘

┌─ battle_state (Active Battles) ─┐
│ Entries: 12                      │
│ Size: 0.8 MB                     │
│ Hit Rate: 89.1%                  │
│ TTL: 30 minutes                  │
│ Expiring Soon: 3 entries         │
└──────────────────────────────────┘

Memory Pressure: 🟢 LOW (42.3 MB / 2048 MB = 2.1%)
Next Auto-Cleanup: 2m (every 10 minutes)
```

---

**Example 2: Manual cleanup**
```
/ops cache cleanup:true
```

**Output:**
```
💾 Runtime Cache Metrics (After Manual Cleanup)
Generated: 2025-12-02 14:32:15 EST

Cleanup Results:
✅ Expired entries removed: 45
✅ Memory freed: 3.2 MB
✅ Duration: 0.8s

Overall Stats:
• Total Entries: 1,205 (was 1,250)
• Total Size: 39.1 MB (was 42.3 MB)
• Hit Rate: 87.5%
• Miss Rate: 12.5%
• Evictions: 279 (234 + 45 from cleanup)
• Last Cleanup: Just now (manual)

[... same namespace breakdown as Example 1 ...]

Memory Pressure: 🟢 LOW (39.1 MB / 2048 MB = 1.9%)
Next Auto-Cleanup: 10m (every 10 minutes)
```

#### Integration Notes

**Cache Maintenance Scheduler:**
- **Automatic cleanup:** Every 10 minutes
- **Manual trigger:** `/ops cache cleanup:true`
- **Cleanup actions:** Remove expired entries, refresh stale data, collect metrics
- **Event emission:** `cache.maintenance` event logged to TimescaleDB

**Cache Namespaces:**
- `species` — Pokémon reference data (1,025 entries, 15 MB)
- `moves` — Move reference data (919 entries, 9 MB)
- `user_sessions` — Active user sessions (volatile, 5 min TTL)
- `battle_state` — Active battle state (volatile, 30 min TTL)
- `encounter_state` — Active encounters (volatile, 15 min TTL)

---

### /ops engine

**Purpose:** Display Engine DB statistics (L1 Cache, Write Buffer, Read-DB, Write-DB, Background Workers).

#### Syntax
```
/ops engine
```

#### Parameters
*No parameters*

#### Example

```
/ops engine
```

**Output:**
```
⚙️ Engine DB Statistics
Generated: 2025-12-02 14:32:15 EST

═══ L1 Cache (In-Memory) ═══
Status: ✅ ACTIVE
Memory: 18.7 MB / 20 MB (93.5%)
Entries:
  • Pokémon: 1,025 (by ID + by name indexes)
  • Moves: 919
  • Type Effectiveness: 324
Hit Rate: 98.5% (123,456 hits / 125,234 requests)
Miss Rate: 1.5% (1,778 misses → fallback to Read-DB)
Avg Lookup Latency: 0.5μs (sub-microsecond)
Last Refresh: 15m ago
Next Refresh: 45m (hourly + 5s stagger)

═══ Write Buffer (In-Memory Queues) ═══
Status: ✅ ACTIVE
Utilization: 75% (7,500/10,000 entries)
  ⚠️ Warning threshold reached
Queues:
  • Battle Logs: 2,345 entries (23%)
  • Move Usage: 4,567 entries (46%)
  • Anomalies: 588 entries (6%)
Backpressure: 🟡 WARN (75% > 75% threshold)
  • New entries accepted with warning
  • Consider manual flush if approaching 95%
Last Flush: 15s ago (auto-flush every 30s)
  • Flushed: 234 entries
  • Duration: 0.8s
Next Flush: 15s

═══ Read-DB (SQLite) ═══
Status: ✅ HEALTHY
File: /Store/engine-read-db/pokemon.db
Size: 15.2 MB
Mode: WAL (Write-Ahead Logging)
Data:
  • Pokémon: 1,025 species
  • Moves: 919 moves
  • Type Effectiveness: 324 entries
  • Version: 1.0.0
Last Sync: 2h 15m ago
  • Source: PROD Postgres
  • Duration: 45s
  • Status: ✅ Success
Next Sync: 21h 45m (daily at 05:00 UTC)
Query Performance:
  • Avg Latency: ~50ms (cached in L1 after first access)

═══ Write-DB (SQLite) ═══
Status: ✅ HEALTHY
File: /Store/engine-write-db/battles.db
Size: 42.8 MB
Mode: WAL (Write-Ahead Logging)
WAL: 0 entries (all applied)
Data:
  • Battle Logs: 5,678 entries
  • Move Usage: 123,456 entries
  • Anomalies: 12 entries (2 unresolved)
Last Validation: 8m ago
  • Quality Score: 98.5% (✅ passed 95% threshold)
  • Validated Rows: 12,345
  • Passed Rows: 12,160
  • Failed Rows: 185 (1.5%)
Last Upload: 2h 30m ago
  • Uploaded: 12,345 entries to PROD
  • Duration: 45s
  • Status: ✅ Success
Retention: 24h after upload
  • Oldest Entry: 18h ago
  • Next Prune: 6h (auto-prune after 24h)

═══ Background Workers ═══
Cache Refresh Worker: ✅ RUNNING
  • Last: 15m ago (45s duration)
  • Next: 45m (hourly + 5s stagger)

Buffer Flush Worker: ✅ RUNNING
  • Last: 15s ago (0.8s duration)
  • Next: 15s (30s interval + 10s stagger)

Read-DB Sync Worker: ✅ RUNNING
  • Last: 2h 15m ago (45s duration)
  • Next: 21h 45m (daily at 05:00 UTC)

Write-DB Validator: ✅ RUNNING
  • Last: 8m ago (2.3s duration)
  • Next: 2m (10m interval + 15s stagger)

Maintenance Worker: ✅ RUNNING
  • Last: 4h 12m ago (15s duration)
  • Next: 3h 48m (8hr interval + 20s stagger)

Overall: ✅ All systems operational
Performance: 10-100x faster than remote PostgreSQL queries
```

#### Warning States

**High buffer utilization:**
```
═══ Write Buffer (In-Memory Queues) ═══
Status: 🟡 DEGRADED
Utilization: 95% (9,500/10,000 entries)
  🔴 CRITICAL threshold reached
Backpressure: 🔴 REJECT (95% > 95% threshold)
  • New entries REJECTED until flush completes
  • Immediate action required
Recommendation: Wait for auto-flush or trigger manual flush
```

**Validation failures:**
```
═══ Write-DB (SQLite) ═══
Status: 🟡 DEGRADED
Last Validation: 8m ago
  • Quality Score: 92% (🔴 failed 95% threshold)
  • Validated Rows: 12,345
  • Passed Rows: 11,357
  • Failed Rows: 988 (8%)
Last Upload: SKIPPED (quality score too low)
Recommendation: Investigate data quality issues in battle logs
```

---

### /ops state

**Purpose:** Display Security Bot operational state (cumulative statistics, activity timeline, guild monitoring context).

#### Syntax
```
/ops state [timeline:<boolean>] [guilds:<boolean>]
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `timeline` | Boolean | No | false | Show activity timeline (last 100 events) |
| `guilds` | Boolean | No | false | Show per-guild monitoring context |

#### Examples

**Example 1: Basic state (default)**
```
/ops state
```

**Output:**
```
🛡️ Security Bot Operational State
Generated: 2025-12-02 14:32:15 EST

Cumulative Statistics:
• Restart #4
• Total uptime: 28h 45m (across all restarts)
• Current uptime: 6h 23m
• Time since restart: 6h 23m
• Total sweeps: 38
• Total alerts: 2
• Permission changes detected: 5
• Successful reverts: 4
• Failed reverts: 1

Recent Activity (Last Restart):
• Sweeps: 6 (1/hour average)
• Alerts: 0
• Permission changes: 1 (successfully reverted)
• Errors: 0

Last Restart:
• Time: 2025-12-02 08:09:12 EST
• Reason: Deployment
• Previous uptime: 8h 12m
• State restored: ✅ Successfully loaded from Store/security-bot-state/current.json

Monitoring:
• Guilds monitored: 3
• Roles monitored: 234
• Last sweep: 15m ago
• Next sweep: 45m (hourly)
```

---

**Example 2: With activity timeline**
```
/ops state timeline:true
```

**Output:**
```
🛡️ Security Bot Operational State
[... same cumulative stats as Example 1 ...]

Activity Timeline (Last 100 Events):

2025-12-02 14:17:23 EST | 🔍 SWEEP
  Guild: Infinity Gauntlet
  Roles: 78 checked
  Changes: 0 detected

2025-12-02 13:17:23 EST | 🔍 SWEEP
  Guild: Infinity Gauntlet
  Roles: 78 checked
  Changes: 1 detected
  
2025-12-02 13:17:24 EST | 🔴 ALERT
  Guild: Infinity Gauntlet
  Type: Unauthorized Permission Change
  Role: @Moderator
  Permission: MANAGE_ROLES (added)
  Actor: User#1234 (not in whitelist)
  
2025-12-02 13:17:25 EST | ✅ REVERT
  Guild: Infinity Gauntlet
  Role: @Moderator
  Permission: MANAGE_ROLES (removed)
  Status: ✅ Successfully reverted

2025-12-02 12:17:23 EST | 🔍 SWEEP
  Guild: Infinity Gauntlet
  Roles: 78 checked
  Changes: 0 detected

[... 95 more events ...]

*Showing last 100 events from rolling activity log*
```

---

**Example 3: With guild context**
```
/ops state guilds:true
```

**Output:**
```
🛡️ Security Bot Operational State
[... same cumulative stats as Example 1 ...]

Guild Monitoring Context:

┌─ Infinity Gauntlet (ID: 123456789012345678) ─┐
│ Status: ✅ ACTIVE                             │
│ Roles: 78                                     │
│ Last Sweep: 15m ago                           │
│ Sweep Count: 38                               │
│ Changes Detected: 5                           │
│ Changes Reverted: 4                           │
│ Failed Reverts: 1                             │
│ Last Alert: 1h ago                            │
└───────────────────────────────────────────────┘

┌─ Test Server (ID: 987654321098765432) ─┐
│ Status: ✅ ACTIVE                       │
│ Roles: 12                               │
│ Last Sweep: 15m ago                     │
│ Sweep Count: 38                         │
│ Changes Detected: 0                     │
│ Last Alert: Never                       │
└─────────────────────────────────────────┘

┌─ Dev Playground (ID: 555555555555555555) ─┐
│ Status: 🟡 MONITORING DISABLED              │
│ Roles: 5                                    │
│ Last Sweep: 6d ago                          │
│ Reason: Guild admin requested pause         │
└─────────────────────────────────────────────┘

Overall: 2/3 guilds actively monitored
```

---

**Example 4: Full state (timeline + guilds)**
```
/ops state timeline:true guilds:true
```

**Output:**
```
[... combines both timeline and guilds sections ...]
```

#### Notes

**State Persistence:**
- Saved to: `Store/security-bot-state/current.json`
- Auto-save: Every 5 minutes
- Backup: `Store/security-bot-state/previous.json` (last restart)
- Snapshots: `Store/security-bot-state/snapshots/*.json` (7-day retention)

**Activity Timeline:**
- Rolling window: Last 100 events
- Event types: SWEEP, ALERT, REVERT, ERROR
- Survives restarts (loaded from persistence layer)

---

### /ops memory

**Purpose:** Display detailed memory usage breakdown (heap, buffers, caches, worker overhead).

#### Syntax
```
/ops memory
```

#### Parameters
*No parameters*

#### Example

```
/ops memory
```

**Output:**
```
🧠 Memory Usage Analysis
Generated: 2025-12-02 14:32:15 EST

Process Memory:
• RSS (Resident Set): 487 MB
• Heap Used: 342 MB
• Heap Total: 450 MB
• External: 18 MB
• Array Buffers: 3 MB

Memory Breakdown:

┌─ Discord.js Cache ─┐
│ Size: 145 MB       │
│ Confidence: HIGH   │
│ Components:        │
│ • Guilds: 3        │
│ • Channels: 67     │
│ • Messages: 200    │
│ • Members: 1,250   │
│ • Roles: 234       │
└────────────────────┘

┌─ Engine L1 Cache ─┐
│ Size: 18.7 MB     │
│ Confidence: HIGH  │
│ Entries:          │
│ • Pokémon: 1,025  │
│ • Moves: 919      │
│ • Types: 324      │
└───────────────────┘

┌─ Write Buffer ─┐
│ Size: 5.2 MB   │
│ Confidence: MED │
│ Entries: 7,500 │
└────────────────┘

┌─ Log Buffer ─┐
│ Size: 0.8 MB │
│ Confidence: MED│
│ Entries: 200 │
└──────────────┘

┌─ Event Bus ─┐
│ Size: 1.2 MB│
│ Confidence: │
│   MEDIUM    │
│ Queue: 42   │
└─────────────┘

Estimated Overhead:
• V8 Engine: ~50 MB
• Node.js Runtime: ~30 MB
• Worker Threads: ~20 MB
• Misc Buffers: ~10 MB

Total Accounted: ~280 MB / 342 MB heap (82%)
Unaccounted: ~62 MB (18%)

Memory Health: 🟢 HEALTHY
• Current Usage: 487 MB / 2048 MB (23.8%)
• Heap Usage: 342 MB / 450 MB (76%)
• Growth Rate: +2 MB/hour (acceptable)

Recommendations:
✅ Memory usage within safe limits
✅ No leaks detected
✅ Cache sizes appropriate
```

#### Warning States

**High memory usage:**
```
Memory Health: 🟡 WARNING
• Current Usage: 1,536 MB / 2048 MB (75%)
• Heap Usage: 1,200 MB / 1,400 MB (86%)
• Growth Rate: +15 MB/hour (elevated)

Recommendations:
⚠️ Monitor for continued growth
⚠️ Consider manual cache cleanup: /ops cache cleanup:true
⚠️ Review buffer utilization: /ops engine
```

**Memory leak suspected:**
```
Memory Health: 🔴 CRITICAL
• Current Usage: 1,945 MB / 2048 MB (95%)
• Heap Usage: 1,850 MB / 1,900 MB (97%)
• Growth Rate: +50 MB/hour (CRITICAL)

Recommendations:
🔴 Immediate action required
🔴 Restart service: render_restart.ps1 -Service Infinity-Gauntlet
🔴 Investigate memory leak after restart
🔴 Review heap snapshot: node --inspect --expose-gc src/index.ts
```

---

### /ops cooldown reset

**Purpose:** Reset all cooldowns for a specific user (admin override for rate limits).

#### Syntax
```
/ops cooldown reset user:<@mention>
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `user` | User (mention) | Yes | — | Discord user to reset cooldowns for |

#### Example

```
/ops cooldown reset user:@Player
```

**Output:**
```
✅ Deleted 3 cooldown entries for <@123456789012345678>.

Cooldowns Reset:
• walk (wild encounters) — Was: 5m remaining
• battle (PvP battles) — Was: 10m remaining
• heal (Pokémon healing) — Was: 2m remaining

User can now:
✅ Use /walk immediately
✅ Start a battle immediately
✅ Heal Pokémon immediately
```

#### Use Cases

**Scenario 1: User stuck due to cooldown bug**
```
User reports: "I can't use /walk, it says cooldown but I haven't used it today"
Solution: /ops cooldown reset user:@Player
```

**Scenario 2: Testing cooldown system**
```
Developer needs to test cooldown logic repeatedly
Solution: /ops cooldown reset user:@TestUser (after each test)
```

**Scenario 3: Apology for service disruption**
```
Bot was down for 2 hours, users lost cooldown time
Solution: Reset cooldowns for affected users
```

#### Security Note

⚠️ **Admin only** — This command bypasses rate limiting and should be used sparingly. Abuse can enable exploit farming or spam.

---

## Integration with Monitoring

### Metrics Collection

**Prometheus Endpoint:**
```
GET /metrics
```

**Key Metrics Exposed:**
```
# Database workers
database_worker_latency_ms{worker="prod"} 45
database_worker_operations_total{worker="prod",status="success"} 12398
database_worker_operations_total{worker="prod",status="error"} 52

# Engine DB
engine_cache_hit_rate 0.985
engine_cache_size_bytes 18700000
engine_write_buffer_utilization 0.75

# Background workers
worker_execution_duration_seconds{worker="cache_refresh"} 45
worker_success_total{worker="cache_refresh"} 23
worker_error_total{worker="cache_refresh"} 0

# Memory
process_rss_bytes 487000000
process_heap_used_bytes 342000000
```

### Alert Rules (Prometheus/Grafana)

```yaml
# Database worker unhealthy
- alert: DatabaseWorkerUnhealthy
  expr: database_worker_status{status="error"} > 0
  for: 5m
  annotations:
    summary: "Database worker {{ $labels.worker }} unhealthy"
    
# High buffer utilization
- alert: EngineBufferHighUtilization
  expr: engine_write_buffer_utilization > 0.90
  for: 2m
  annotations:
    summary: "Engine write buffer at {{ $value }}% (critical)"
    
# Memory pressure
- alert: HighMemoryUsage
  expr: process_rss_bytes / 2048000000 > 0.90
  for: 10m
  annotations:
    summary: "Memory usage at {{ $value }}% of 2 GB limit"
```

### Slack Integration

**Channel Routing:**
- `#alerts` — Critical errors (database down, worker failures)
- `#ops` — Warnings (high utilization, slow queries)
- `#monitoring` — Info (deployments, restarts, maintenance)

**Alert Format:**
```
🔴 CRITICAL: PROD Postgres Worker Unhealthy

Status: ERROR
Last Error: Connection timeout
Consecutive Failures: 3
Time: 2025-12-02 14:32:15 EST

Actions:
• Check database status: /ops database worker:prod
• Review logs: /ops logs level:error category:DATABASE since:10m
• Restart if needed: render_restart.ps1 -Service Infinity-Gauntlet

Dashboard: https://dashboard.render.com/services/srv-XXXXXXXXXXXX
```

---

## Error Handling

### Common Error Patterns

**Error 1: Database Connection Timeout**
```
Command: /ops stats
Output: Failed to load stats (check logs).

Diagnosis:
• Database unreachable
• Network issues
• Render database maintenance

Solution:
1. Check Render status: https://status.render.com/
2. Verify database URL: npm run db:cli -- status
3. Check logs: /ops logs level:error category:DATABASE since:10m
4. Restart if needed: render_restart.ps1
```

---

**Error 2: Worker Not Responding**
```
Command: /ops workers
Output: Write-DB Validator Worker: ERROR

Diagnosis:
• Worker crashed
• Infinite loop
• Resource exhaustion

Solution:
1. Check worker logs: /ops logs category:WORKER since:30m
2. Review detailed status: /ops workers detailed:true
3. Restart service: render_restart.ps1
4. Verify recovery: /ops workers
```

---

**Error 3: TimescaleDB Query Timeout**
```
Command: /ops logs
Output: Log query failed: Query timeout (exceeded 30s)

Diagnosis:
• Large time window (e.g., since:7d with no filters)
• TimescaleDB slow
• Compression in progress

Solution:
1. Reduce time window: /ops logs since:1h
2. Add filters: /ops logs level:error since:24h
3. Check TimescaleDB status: /ops database worker:timescale
4. Wait for compression to complete
```

---

### Error Recovery Checklist

**Step 1: Identify scope**
- Single command failing? → Likely parameter issue
- All commands failing? → Likely database/network issue
- Specific worker failing? → Check worker logs

**Step 2: Check dependencies**
```
/ops database    # Database workers healthy?
/ops workers     # Background workers healthy?
/ops memory      # Memory pressure?
```

**Step 3: Review logs**
```
/ops logs level:error since:10m    # Recent errors
/ops logs category:WORKER since:30m # Worker issues
```

**Step 4: Escalate if needed**
```
# Contact on-call engineer
Slack: #ops-alerts
Include: Command attempted, error message, /ops output screenshots
```

---

## Best Practices

### Operational Workflows

**Daily Health Check (5 minutes):**
```
1. /ops stats              # Verify database counts reasonable
2. /ops database           # All workers HEALTHY?
3. /ops workers            # All workers running?
4. /ops cache              # Cache hit rate >85%?
5. /ops memory             # Memory <75%?
```

**Weekly Deep Dive (15 minutes):**
```
1. /ops logs level:error since:7d limit:100   # Review all errors
2. /ops workers detailed:true                 # Execution history
3. /ops engine                                # Buffer/cache health
4. /ops state timeline:true guilds:true       # Security bot activity
```

**Pre-Deployment Checklist:**
```
1. /ops stats              # Baseline stats before deploy
2. /ops memory             # Current memory usage
3. Deploy new version
4. /ops stats              # Verify stats unchanged
5. /ops logs since:5m      # Check for new errors
6. /ops workers            # Workers restarted cleanly?
```

**Post-Deployment Monitoring (30 minutes):**
```
1. /ops stats              # Every 5 minutes
2. /ops logs since:5m      # Every 10 minutes
3. /ops memory             # At 15, 30 minutes
4. Compare to baseline     # Any degradation?
```

### Performance Tuning

**Optimize cache hit rate:**
```
1. Check current rate: /ops cache
2. If <85%: Review TTL settings in config
3. If high miss rate for specific namespace: Increase cache size
4. Monitor improvement: /ops cache (hourly)
```

**Reduce buffer backpressure:**
```
1. Check utilization: /ops engine
2. If >75%: Increase flush frequency (30s → 15s)
3. If >90%: Increase buffer size (10k → 20k)
4. If >95%: Manual flush: Trigger via worker restart
```

**Tune worker execution:**
```
1. Check execution times: /ops workers detailed:true
2. If slow (>60s): Optimize queries, add indexes
3. If frequent errors: Review error logs
4. Adjust stagger intervals if workers conflict
```

---

## Troubleshooting

### Problem: "Admin only" error

**Symptoms:**
```
User executes: /ops stats
Output: ⛔ Admin only.
```

**Diagnosis:**
- User lacks Administrator permission in guild
- User not in ADMIN_USER_IDS environment variable

**Solution:**
```
1. Grant Discord Administrator permission:
   Server Settings > Roles > @Admin > Permissions > Administrator ✓
   
2. OR add to whitelist:
   Edit secrets/Infinity-Gauntlet.env
   ADMIN_USER_IDS=123456789012345678,<new_user_id>
   Redeploy: render_deploy.ps1 -Service Infinity-Gauntlet
```

---

### Problem: Commands time out (no response)

**Symptoms:**
```
User executes: /ops stats
Output: "Thinking..." (never completes)
```

**Diagnosis:**
- Database connection timeout
- Worker hang/deadlock
- Node process frozen

**Solution:**
```
1. Check Render logs:
   render_logs.ps1 -Service Infinity-Gauntlet -Tail
   
2. Look for errors:
   - "ETIMEDOUT" → Database unreachable
   - "Deadlock detected" → Database lock
   - No output → Process frozen
   
3. Restart service:
   render_restart.ps1 -Service Infinity-Gauntlet
   
4. Verify recovery:
   /ops stats
```

---

### Problem: Stats show 0 for all counts

**Symptoms:**
```
/ops stats
Output:
• Users: 0
• Active Encounters: 0
• Active Battles: 0
```

**Diagnosis:**
- Database connection failed (fallback to null)
- Wrong database URL
- Database empty (fresh deploy)

**Solution:**
```
1. Check database connection:
   npm run db:cli -- status
   
2. Verify database URL:
   echo $PROD_DATABASE_URL
   # Should be: postgresql://user@host.render.com:5432/db
   
3. Check table counts:
   npm run db:cli -- counts
   # If 0, database is empty
   
4. Seed reference data:
   npm run db:seed:dex
   
5. Verify recovery:
   /ops stats
```

---

### Problem: Cache hit rate very low (<50%)

**Symptoms:**
```
/ops cache
Output:
Hit Rate: 35% (low)
```

**Diagnosis:**
- TTL too short (data expires before reuse)
- Cache size too small (evictions frequent)
- Access pattern changed (different queries)

**Solution:**
```
1. Review cache config:
   src/config/cache-config.ts
   
2. Increase TTL for stable data:
   species_ttl: 1 hour → 4 hours
   moves_ttl: 1 hour → 4 hours
   
3. Increase cache size:
   L1_CACHE_MAX_SIZE: 20 MB → 50 MB
   
4. Redeploy and monitor:
   render_deploy.ps1
   /ops cache (every 10 minutes)
```

---

## Appendix

### Command Quick Reference

| Command | Purpose | Key Parameters |
|---------|---------|----------------|
| `/ops stats` | Database counts + recent battles | limit, after, participant |
| `/ops database` | Database worker health | worker (prod/timescale/engine-read/engine-write) |
| `/ops workers` | All background workers | detailed |
| `/ops logs` | TimescaleDB log query | level, category, limit, since |
| `/ops cache` | Runtime cache metrics | cleanup |
| `/ops engine` | Engine DB statistics | *(none)* |
| `/ops state` | Security bot state | timeline, guilds |
| `/ops memory` | Memory usage analysis | *(none)* |
| `/ops cooldown reset` | Reset user cooldowns | user (mention) |

### Environment Variables

```bash
# Admin access control
ADMIN_USER_IDS=123456789012345678,987654321098765432

# Database URLs
PROD_DATABASE_URL=postgresql://user:pass@host.render.com:5432/db
TIMESCALE_DB_URL=postgresql://user:pass@timescale.render.com:5432/timescale

# Cache configuration
L1_CACHE_MAX_SIZE=20971520  # 20 MB
CACHE_TTL_MS=3600000        # 1 hour

# Worker configuration
CACHE_REFRESH_INTERVAL=3600000     # 1 hour
BUFFER_FLUSH_INTERVAL=30000        # 30 seconds
VALIDATOR_INTERVAL=600000          # 10 minutes
```

### Related Documentation

- [Worker Troubleshooting Guide](./worker-troubleshooting-comprehensive.md)
- [Database Operations Runbook](./database-operations-runbook-comprehensive.md)
- [Complete System Architecture](../architecture-bible/complete-system-architecture.md)
- [Deployment Checklist](./deployment-checklist-comprehensive.md)

---

**END OF DOCUMENT**

For questions or updates to this reference, contact: ops-team@example.com
