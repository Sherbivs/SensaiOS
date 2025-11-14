# Discord Bot Command Suite — Quick Reference

## Admin Commands (Requires Administrator Permission)

### 1. System Health & Stats

#### `/ops stats`
**Purpose:** View basic usage statistics and battle history  
**Options:**
- `limit` (1-20): Maximum rows to show
- `after` (ISO timestamp): Filter battles after this time
- `participant` (Discord ID/@mention): Filter by specific user

**Example:**
```
/ops stats
/ops stats limit:10
/ops stats participant:@DripTVDD
/ops stats after:2025-11-14T00:00:00Z
```

**Shows:**
- Total users, active encounters, battles
- Recent battle history with outcomes
- Database status
- Bus message queue status

---

#### `/ops state`
**Purpose:** View security bot operational state and history  
**Options:**
- `timeline` (true/false): Show detailed activity timeline
- `guilds` (true/false): Show per-guild monitoring status

**Example:**
```
/ops state
/ops state --timeline true
/ops state --guilds true
/ops state --timeline true --guilds true
```

**Shows:**
- **Cumulative Statistics:**
  - Total uptime (across all restarts)
  - Total sweeps performed
  - Total alerts sent
  - Permission changes detected
  - Restart count and last restart time
  
- **Timeline (if enabled):**
  - Last 100 activity events
  - Sweeps, alerts, permission changes, errors
  - Timestamps and event types
  
- **Guild Status (if enabled):**
  - Guild name and monitoring status
  - Last sweep time for each guild
  - Total sweeps per guild
  - Timeout/error information

---

#### `/ops memory`
**Purpose:** Comprehensive memory profiling report (**NEW** - just deployed!)  

**Example:**
```
/ops memory
```

**Shows:**
- **Startup Memory Progression:**
  - Initial baseline
  - Post-Database loading
  - Post-Engine initialization
  - Steady state
  - Delta from each phase
  
- **Current Memory State:**
  - RSS (total process memory)
  - Heap used/total
  - External memory (C++ objects)
  - Array buffers
  - Delta from steady state
  
- **Resource Limits:**
  - Status: HEALTHY/WARNING/CRITICAL/EMERGENCY
  - Usage vs 512 MB Render limit
  - Percentage thresholds
  
- **Component Memory Breakdown:**
  - Engine L1 Cache size
  - Write Buffer utilization
  - Engine Read-DB size
  - Engine Write-DB size
  - **Log Buffer: X/200 entries** (NEW)
  - **Event Bus: subscribers, replay buffer, pattern cache X/500** (NEW)
  - **Discord Cache: messages/members/threads counts** (NEW)
  
- **Heap Statistics:**
  - Heap usage percentage
  - Available heap space
  
- **Recommendations:**
  - Status-based guidance
  - Memory optimization suggestions

---

#### `/ops cache`
**Purpose:** Inspect runtime cache metrics and maintenance state  
**Options:**
- `cleanup` (true/false): Run maintenance before collecting metrics

**Example:**
```
/ops cache
/ops cache --cleanup true
```

**Shows:**
- Cache hit/miss rates
- Disk usage per namespace
- Maintenance schedule status
- Last cleanup time
- Cache entry counts
- Memory estimates

---

#### `/ops engine`
**Purpose:** View Engine DB operational dashboard  

**Example:**
```
/ops engine
```

**Shows:**
- **L1 Cache (In-Memory):**
  - Hit rate
  - Memory usage
  - Entry counts (Pokémon, moves, types)
  - Latency stats
  
- **Write Buffer:**
  - Queue utilization
  - Battle logs/move usage/anomalies counts
  - Backpressure status
  
- **Background Workers (4 workers):**
  - Status (running/stopped/error)
  - Last execution time
  - Error counts
  
- **Read-DB (SQLite):**
  - Row counts (Pokémon, moves, types)
  - Database size
  
- **Write-DB (SQLite):**
  - Pending logs/usage/anomalies
  - WAL size
  - Oldest entry age

---

#### `/ops errors`
**Purpose:** Comprehensive error detection dashboard with learning insights  
**Options:**
- `severity` (CRITICAL/HIGH/MEDIUM/LOW): Filter by severity
- `category` (DATABASE/DISCORD/ENGINE/WORKER/CACHE/UNKNOWN): Filter by category
- `since` (1h/6h/24h/7d/30d): Time period

**Example:**
```
/ops errors
/ops errors --severity CRITICAL
/ops errors --category DATABASE --since 24h
/ops errors --severity HIGH --since 7d
```

**Shows:**
- **Summary Statistics:**
  - Total unique errors
  - Total occurrences
  - Error rate per hour
  - Trend indicator vs previous period
  
- **Top 10 Most Frequent Errors:**
  - Error name/fingerprint
  - Occurrence count
  - Last seen timestamp
  
- **Critical Errors (Last 24h):**
  - CRITICAL + HIGH severity errors
  - Sorted by most recent
  - Up to 5 entries
  
- **Recovery Analysis:**
  - Overall recovery success rate
  - Recovery attempts vs successes
  
- **Learning Insights (Hourly Analysis):**
  - Error patterns detected
  - Correlation analysis
  - Recommended recovery strategies
  - Effectiveness ratings

---

### 2. User Management

#### `/ops cooldown reset`
**Purpose:** Reset all cooldowns for a specific user  
**Options:**
- `user` (required): User to reset (@mention or select)

**Example:**
```
/ops cooldown reset user:@username
```

**Shows:**
- Confirmation of deleted cooldown entries
- Count of cooldowns removed

---

## Regular User Commands (No Admin Required)

### Battle System

#### `/battle`
**Purpose:** Challenge another trainer to battle  
**Usage:** `/battle @opponent`

#### `/battle-turn`
**Purpose:** Execute your turn in an active battle  
**Usage:** Follow prompts during battle

---

### Pokémon Management

#### `/starter`
**Purpose:** Choose your starter Pokémon  
**Usage:** `/starter` (first-time trainers)

#### `/walk`
**Purpose:** Encounter wild Pokémon  
**Usage:** `/walk`

#### `/party`
**Purpose:** View your current party  
**Usage:** `/party`

#### `/box`
**Purpose:** View your Pokémon storage box  
**Usage:** `/box`

#### `/heal`
**Purpose:** Heal your party Pokémon  
**Usage:** `/heal`

---

### Information Commands

#### `/dex`
**Purpose:** Look up Pokémon information  
**Usage:** `/dex pokemon:Pikachu`

#### `/move`
**Purpose:** Look up move information  
**Usage:** `/move name:Thunderbolt`

#### `/weak`
**Purpose:** Check type weaknesses  
**Usage:** `/weak type:Electric`

#### `/calc`
**Purpose:** Calculate damage/stats  
**Usage:** `/calc` (follow prompts)

#### `/profile`
**Purpose:** View trainer profile and stats  
**Options:**
- `user` (optional): View another user's profile

**Example:**
```
/profile
/profile user:@DripTVDD
```

#### `/daily`
**Purpose:** Claim daily rewards  
**Usage:** `/daily`

#### `/help`
**Purpose:** Get help information  
**Usage:** `/help`

#### `/ping`
**Purpose:** Check bot latency  
**Usage:** `/ping`

#### `/version`
**Purpose:** Check bot version  
**Usage:** `/version`

---

## Monitoring Scenarios

### Scenario 1: Quick Health Check
```
/ops stats
/ops state
```
Shows active users, battles, and security bot operational state.

---

### Scenario 2: Memory Investigation
```
/ops memory
```
Comprehensive memory breakdown with component analysis (includes new metrics: Log Buffer, Event Bus pattern cache, Discord cache).

---

### Scenario 3: Security Audit
```
/ops state --guilds true --timeline true
```
Shows:
- Per-guild sweep status
- Last sweep times
- Recent security events
- Permission changes
- Alerts sent

---

### Scenario 4: Performance Analysis
```
/ops cache
/ops engine
/ops memory
```
Shows:
- Cache performance
- Engine DB throughput
- Memory utilization
- Worker status

---

### Scenario 5: Error Investigation
```
/ops errors --severity CRITICAL
/ops errors --category DATABASE --since 24h
/ops errors --since 7d
```
Shows:
- Critical errors needing attention
- Database-specific issues
- Week-long trend analysis
- Learning insights and recovery strategies

---

### Scenario 6: Guild Member Sweep Status
```
/ops state --guilds true
```
Check when each guild was last swept and how many times. The bot automatically:
- Sweeps on startup (just happened at 21:31 UTC)
- Sweeps continuously (if enabled)
- Assigns "Trainer" role to members with no other roles

---

### Scenario 7: Full System Diagnostic
```
/ops state --guilds true --timeline true
/ops stats
/ops memory
/ops cache
/ops engine
/ops errors --since 24h
```
Complete system overview across all subsystems.

---

## Expected Response Times

| Command | Response Time | Output Size |
|---------|--------------|-------------|
| `/ops stats` | ~100-500ms | 1-2 embeds |
| `/ops state` | ~50-200ms | 1 embed (3+ embeds with options) |
| `/ops memory` | ~100-200ms | 1 large message |
| `/ops cache` | ~200-500ms | 1 embed |
| `/ops engine` | ~100-300ms | 1 embed |
| `/ops errors` | ~200-800ms | 1 large message |
| `/ops cooldown reset` | ~100-500ms | 1 line confirmation |

All commands are **ephemeral** (only you see the response).

---

## Permissions Required

### Admin Commands:
- All `/ops` commands require **Administrator** permission
- Cannot be used in DMs (server-only)

### Regular Commands:
- No special permissions needed
- Some commands work in DMs (`/help`, `/ping`, `/version`)
- Most require server context (`/battle`, `/walk`, etc.)

---

## Tips & Best Practices

1. **Memory Monitoring:** Run `/ops memory` every 6 hours during the first 24 hours after deployment to track growth patterns.

2. **Error Tracking:** Check `/ops errors` daily to catch issues early. Use `--severity CRITICAL` for quick scans.

3. **Security Audits:** Review `/ops state --guilds true` weekly to ensure all guilds are being monitored properly.

4. **Performance Checks:** Compare `/ops cache` and `/ops engine` before/after busy periods to identify bottlenecks.

5. **Pattern Cache Growth:** Monitor "Pattern Cache: X/500 patterns" in `/ops memory` - should stay well below 500.

6. **Guild Sweeps:** If someone reports missing "Trainer" role, check `/ops state --guilds true` to see last sweep time.

7. **Quick Status:** Bookmark this sequence for daily checks:
   ```
   /ops stats
   /ops state
   /ops memory
   ```

---

## New Features (Deployed 2025-11-14)

### Enhanced `/ops memory` Command
- ✅ **Log Buffer metrics:** Shows buffered entries (X/200 max)
- ✅ **Event Bus metrics:** Shows subscribers, replay buffer, pattern cache utilization (X/500)
- ✅ **Discord Cache metrics:** Shows cached messages/members/threads with counts
- ✅ **Pattern Cache LRU:** Now bounded at 500 entries (prevents unbounded growth)

**Why it matters:**
- Real-time visibility into memory accumulators
- Pattern cache tracking prevents potential memory leaks
- Component-level breakdown helps diagnose growth patterns

---

## Troubleshooting

### Command Not Responding?
1. Check bot status: Is bot online in Discord?
2. Verify permissions: Do you have Administrator role?
3. Try `/ping` first to check basic connectivity

### "Missing Permissions" Error?
- `/ops` commands require Administrator permission
- Some commands are server-only (won't work in DMs)

### Response Too Long?
- Use filters: `--limit`, `--since`, `--severity`, `--category`
- Responses auto-truncate at 2000 characters

### Stats Look Wrong?
- Database may be catching up (check `/ops stats` for "bus pending" count)
- Worker may be processing backlog (check `/ops engine` for worker status)

---

## Related Documentation

- **Memory Audit:** `docs/MEMORY-AUDIT-2025-11-14.md`
- **Deployment Validation:** `docs/DEPLOYMENT-VALIDATION-2025-11-14.md`
- **Memory Improvements:** `docs/MEMORY-IMPROVEMENTS-2025-11-14.md`
- **Security Bot State:** `docs/security-bot-state.md`
- **Operations Guide:** `OPERATIONS.md`

---

**Last Updated:** 2025-11-14 21:45 UTC  
**Bot Version:** See `/version` for current build  
**Service:** infinity-gauntlet-bots (srv-d3snk2ndiees73cn709g)
