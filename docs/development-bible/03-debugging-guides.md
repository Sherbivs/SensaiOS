# Section 3: Debugging Guides

[← Back to INDEX](INDEX.md) | [← Previous: Testing Patterns](02-testing-patterns.md) | [Next: Performance →](04-performance.md)

---

**Philosophy**: "Debugging is archaeology—leave breadcrumbs, preserve context, trace causality."

**Purpose**: VS Code debugging, remote debugging, error reproduction, log analysis.

## 3.1 VS Code Debugging

### Launch Configuration

**File:** `.vscode/launch.json`

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Bot",
      "type": "node",
      "request": "launch",
      "runtimeArgs": ["--loader", "tsx"],
      "program": "${workspaceFolder}/src/index.ts",
      "console": "integratedTerminal",
      "envFile": "${workspaceFolder}/secrets/Infinity-Gauntlet.env",
      "skipFiles": ["<node_internals>/**", "**/node_modules/**"]
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeArgs": ["--loader", "tsx", "--test"],
      "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
      "args": ["run", "${file}"],
      "console": "integratedTerminal"
    },
    {
      "name": "Attach to Process",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### Debugging Workflow

1. **Set Breakpoints** — Click line gutter (red dot appears)
2. **Start Debugging** — Press `F5` or select configuration
3. **Step Through Code:**
   - `F10` — Step Over (execute line, skip function internals)
   - `F11` — Step Into (enter function)
   - `Shift+F11` — Step Out (exit function)
   - `F5` — Continue (resume execution)
4. **Inspect Variables** — Hover over variables or use Debug Console
5. **Watch Expressions** — Add expressions to Watch panel

### Debug Console Tips

```javascript
// Evaluate expressions
battle.attacker.hp
// Output: 100

// Call functions
calculateDamage({ attackerLevel: 50, movePower: 90 })
// Output: 78

// Modify state (careful!)
battle.attacker.hp = 50
```

## 3.2 Remote Debugging (Render SSH)

### Setup

**Enable Node Inspector:**
```bash
# Edit render.yaml start command
startCommand: node --inspect=0.0.0.0:9229 dist/index.js
```

**SSH Tunnel (Windows PowerShell):**
```powershell
# Port forwarding via WSL SSH
wsl ssh -L 9229:localhost:9229 render-virginia
```

**SSH Tunnel (Direct WSL):**
```bash
# Connect with port forwarding
wsl ssh -L 9229:localhost:9229 render-virginia
```

**Note:** Keep SSH session open while debugging. Press `Ctrl+C` to close tunnel when done.

**Attach VS Code:**
```json
{
  "name": "Attach to Render",
  "type": "node",
  "request": "attach",
  "address": "localhost",
  "port": 9229,
  "localRoot": "${workspaceFolder}",
  "remoteRoot": "/opt/render/project/src"
}
```

### Usage

1. Start SSH tunnel (leave terminal open)
2. Start debugger in VS Code (`F5`)
3. Set breakpoints in source files
4. Trigger Discord command to hit breakpoint
5. Inspect production state

**⚠️ WARNING:** Remote debugging on production can cause timeouts and service degradation. Use only for critical issues.

## 3.3 Error Reproduction

### Structured Error Reports

**When reproducing errors, document:**

1. **Environment:** Production, staging, local?
2. **Trigger:** User command, background job, API call?
3. **Inputs:** Discord user ID, command args, database state
4. **Expected Behavior:** What should happen?
5. **Actual Behavior:** What actually happened?
6. **Logs:** Relevant error messages + stack traces

### Reproduction Template

```markdown
## Error: Failed to execute battle turn

**Environment:** Production (Render worker `infinity-gauntlet`)
**Trigger:** `/battle` command, move selection button
**Timestamp:** 2025-11-10T12:34:56Z

**Inputs:**
- User: DripTVDD (ID: 987654321)
- Battle ID: abc123def456
- Move: Earthquake (ID: 89)
- Pokemon: Nidoking (ID: 34)

**Expected:** Battle turn executes, damage calculated, HP updated
**Actual:** Error thrown: "Pokemon not found (ID: 123)"

**Logs:**
```
[ERROR] [BattleEngine] Pokemon not found
  at resolveTurn (battle-engine.ts:145)
  at executeTurn (battle-turn.js:89)
  Context: { trainerId: 987654321, battleId: "abc123def456", moveId: 89 }
```

**Reproduction Steps:**
1. Start battle with DripTVDD
2. Select Earthquake move
3. Click "Execute Move" button
4. Error occurs

**Database State:**
- TrainerProfile exists: YES
- Party exists: YES
- Pokemon exists: YES (ID: 34, not 123)
- **Root Cause:** Wrong Pokemon ID passed to resolveTurn()
```

### Local Reproduction

```bash
# 1. Load production database snapshot (optional)
npm run ops:bootstrap-onpremise-dev

# 2. Query affected records
npm run db:cli -- query "SELECT * FROM \"Pokemon\" WHERE \"trainerId\" = 987654321;"

# 3. Run tests with specific data
npm test -- --grep "battle turn execution"

# 4. Debug locally with production state
npm run dev
# Trigger same command sequence in Discord
```

## 3.4 Log Analysis

### Intelligent Log Buffer

**Purpose:** Deduplicates and aggregates logs to reduce console noise.

**Configuration:**
```bash
LOG_BUFFER_ENABLED=true                    # Enable buffering (default)
LOG_BUFFER_INTERVAL=10000                  # Flush every 10 seconds
LOG_BUFFER_BYPASS_CRITICAL=true            # Errors/warnings bypass buffer
```

**Log Format:**
```
📦 Log buffer flush: 42 unique messages, 156 total

[INFO] [BattleEngine] Battle turn executed (x12)
  First: 2025-11-10T12:34:56.123Z
  Last:  2025-11-10T12:35:46.789Z
  
[WARN] [Database] Slow query detected (x3)
  Queries: SELECT * FROM "Pokemon" WHERE "trainerId" = ?
  Latency: 145ms, 178ms, 192ms
```

### Log Query Commands

```bash
# View recent logs
tail -100 logs/app.log

# Search for errors
grep ERROR logs/app.log

# Count errors by service
grep ERROR logs/app.log | awk '{print $3}' | sort | uniq -c

# Filter by timestamp range
grep "2025-11-10T12:" logs/app.log

# Export errors to file
grep ERROR logs/app.log > errors-$(date +%Y%m%d).log
```

### Common Log Patterns

**Slow Query Warning:**
```
[WARN] [Prisma] Slow query detected
  duration: 145ms
  model: Pokemon
  action: findMany
  query: SELECT * FROM "Pokemon" WHERE "trainerId" = 987654321
```

**N+1 Detection:**
```
[WARN] [Prisma] N+1 query pattern detected
  consecutive_queries: 12
  model: TrainerProfile
  suggestion: Use Prisma include to batch load
```

**Memory Warning:**
```
[WARN] [ServiceRegistry] High memory usage
  heapUsed: 428MB
  heapTotal: 2048MB
  utilization: 83.6%
  recommendation: Investigate memory leak
```

---

[← Back to INDEX](INDEX.md) | [← Previous: Testing Patterns](02-testing-patterns.md) | [Next: Performance →](04-performance.md)