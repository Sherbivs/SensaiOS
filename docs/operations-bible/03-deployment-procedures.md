# Section 3: Deployment Procedures

[← Back to INDEX](INDEX.md) | [← Previous: Database Operations](02-database-operations.md) | [Next: Environment Management →](04-environment-management.md)

---

**Philosophy**: "Deployments are deliberate, reproducible, and observable—every push is a contract with production."

**Purpose**: [CRITICAL] Render path structure, service naming, API integration, SSH automation, disk resources.

## 3.1 Render Path Structure [CRITICAL]

**Status:** Expected Platform Behavior — **NOT a bug.**

### Repository Cloning Behavior

Render clones the **entire repository** to `/opt/render/project/src/` (NOT `/opt/render/project/`):

**Repository Structure (GitHub):**
```
Infinity-Gauntlet/
  ├─ package.json
  ├─ render.yaml
  ├─ src/              ← Our TypeScript source
  ├─ dist/             ← Build output (created during deploy)
  └─ ...
```

**Deployed Structure (Render):**
```
/opt/render/project/
  ├─ nodes/
  │   └─ node-22.16.0/        ← Node.js runtime (isolated)
  └─ src/                     ← ENTIRE repository cloned here
      ├─ package.json
      ├─ render.yaml
      ├─ src/                 ← Our source files (nested src/src/)
      ├─ dist/                ← Compiled JavaScript
      │   ├─ index.js
      │   ├─ services/
      │   └─ utils/
      ├─ node_modules/
      └─ ...
```

**Working Directory:** `/opt/render/project/src/`  
**Process Runs:** `node dist/index.js` (from working directory)

### Why "Double src" Appears

When logs show `/opt/render/project/src/src/services/error-tracker.js`:
- `/opt/render/project/src/` = Repository root (Render's clone location)
- `/opt/render/project/src/src/` = Our source folder (nested)
- `/opt/render/project/src/dist/` = Compiled output (where imports resolve)

**This is CORRECT behavior** — Render clones the entire repo to a subdirectory when using `rootDirectory: .`.

### Module Resolution Flow

**Build Phase** (runs from `/opt/render/project/src/`):
```bash
npm install                          # Installs to ./node_modules/
npm run prebuild                     # Compiles src/ → dist/
# Result: dist/ created at /opt/render/project/src/dist/
```

**Runtime Phase** (runs from `/opt/render/project/src/`):
```bash
npm start                            # Executes: node dist/index.js
# CWD: /opt/render/project/src/
# Entry: dist/index.js
```

**Import Resolution:**
```javascript
// File: /opt/render/project/src/dist/utils/logger.js
import { errorTracker } from '../services/error-tracker.js';

// Resolves to:
// /opt/render/project/src/dist/services/error-tracker.js ✅
```

### Verification Commands (SSH)

```bash
# Check working directory
pwd
# Output: /opt/render/project/src

# Verify repository structure
ls -la /opt/render/project/
# Output: src/ nodes/ (NOT package.json - it's in src/)

# Verify nested structure
test -d /opt/render/project/src/src && echo "Nested src/ exists" || echo "No nesting"
# Output: Nested src/ exists ✅

# Verify compiled files
test -f /opt/render/project/src/dist/services/error-tracker.js && echo "EXISTS" || echo "MISSING"
# Output: EXISTS ✅

# Check actual process
ps aux | grep node
# Output: node dist/index.js (runs from /opt/render/project/src/)
```

Path mapping investigation documented in operations-bible/03-deployment-procedures.md § 7.2 (originally 2025-11-14).

## 3.2 Service Naming

### Render API Requirements

**Critical:** Render API uses **capital letters** in service names, even though `render.yaml` defines lowercase.

| render.yaml Name | Render API Name | Deployment Command |
|------------------|-----------------|-------------------|
| `infinity-gauntlet-bots` | `Infinity-Gauntlet` | `pwsh -File scripts/render_deploy.ps1 -Service "Infinity-Gauntlet"` |
| `infinity-gauntlet-security` | `Infinity-Gauntlet-Security` | `pwsh -File scripts/render_deploy.ps1 -Service "Infinity-Gauntlet-Security"` |
| `infinity-gauntlet-outbox` | `Infinity-Gauntlet-Outbox` | `pwsh -File scripts/render_deploy.ps1 -Service "Infinity-Gauntlet-Outbox"` |

### Deployment Script Usage

```powershell
# Deploy main bot worker
pwsh -File "scripts/render_deploy.ps1" -Service "Infinity-Gauntlet"

# Or use VS Code task
# Task: "Render: Deploy Main Bot"
```

**Service Details:**
- **Name:** `Infinity-Gauntlet`
- **ID:** `srv-d3snk2ndiees73cn709g`
- **Region:** Virginia
- **Dashboard:** https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g

## 3.3 API Integration

### Render Deployment Automation

**Script:** `scripts/render_deploy.ps1`

**Environment Variables Required:**
- `RENDER_API_KEY` — Render API token (stored in secrets)

**Usage:**
```powershell
# Deploy specific service
pwsh -File scripts/render_deploy.ps1 -Service "Infinity-Gauntlet"

# Deploy with confirmation prompt
pwsh -File scripts/render_deploy.ps1 -Service "Infinity-Gauntlet" -Confirm

# Deploy multiple services
@("Infinity-Gauntlet", "Infinity-Gauntlet-Security") | ForEach-Object {
  pwsh -File scripts/render_deploy.ps1 -Service $_
}
```

### Monitoring Commands

```powershell
# Check service status matrix
npm run render:status

# View deployment history
npm run render:deploys

# Restart service
npm run render:restart

# Stream logs in real-time
npm run render:logs
```

### API Response Handling

**Success Response:**
```json
{
  "deploy": {
    "id": "dep-abc123",
    "status": "pending",
    "commitId": "abc123def456",
    "finishedAt": null
  }
}
```

**Error Response:**
```json
{
  "message": "Service not found",
  "code": "service_not_found"
}
```

## 3.4 SSH Automation

### Setup Commands

```powershell
# First-time setup (generate keys)
pwsh -File scripts/render_ssh_setup.ps1

# Connect interactively
pwsh -File scripts/render_ssh_connect.ps1

# Connect to specific service
pwsh -File scripts/render_ssh_connect.ps1 -ServiceId "srv-d3snk2ndiees73cn709g"

# Execute remote command
pwsh -File scripts/render_ssh_exec.ps1 -ServiceId "srv-d3snk2ndiees73cn709g" -Command "df -h"
```

### Common SSH Operations

**Disk Usage Monitoring:**
```powershell
# Check /Store disk usage
pwsh -File scripts/render_ssh_exec.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "df -h /Store"

# View directory breakdown
pwsh -File scripts/render_ssh_exec.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "du -sh /Store/*"

# Count security bot snapshots
pwsh -File scripts/render_ssh_exec.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "ls -lah /Store/security-bot-state/snapshots/ | wc -l"
```

**Process Inspection:**
```powershell
# Check Node.js processes
pwsh -File scripts/render_ssh_exec.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "ps aux | grep node"

# Check memory usage
pwsh -File scripts/render_ssh_exec.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "free -m"
```

**Log Inspection:**
```powershell
# View recent logs
pwsh -File scripts/render_ssh_exec.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "tail -100 /var/log/render.log"

# Search for errors
pwsh -File scripts/render_ssh_exec.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "grep ERROR /var/log/render.log"
```

### VS Code Tasks (Quick Access)

```json
// tasks.json
{
  "label": "Render SSH: Check Disk Usage",
  "type": "shell",
  "command": "pwsh",
  "args": [
    "-File",
    "${workspaceFolder}/scripts/render_ssh_exec.ps1",
    "-ServiceId",
    "srv-d3snk2ndiees73cn709g",
    "-Command",
    "df -h"
  ]
}
```

## 3.5 Disk Resources

### Persistent Storage Configuration

**Security Bot Worker** (1 GB persistent disk):

```yaml
# render.yaml
- type: worker
  name: infinity-gauntlet-security
  disks:
    - name: security-state
      mountPath: /Store
      sizeGB: 1
```

**State Files Persist at `/Store/security-bot-state/`:**
- `current.json` — Active runtime state
- `previous.json` — Backup from last restart
- `snapshots/*.json` — Hourly backups (7-day retention)

### Disk Monitoring Thresholds

| Threshold | Action Required |
|-----------|-----------------|
| **>50% usage** (>500MB) | Review snapshot retention, check for log accumulation |
| **>100MB/day growth** | Investigate retention policy failure, check for unexpected files |
| **>95% full** | Emergency response: manually prune old snapshots |

### Expected Baseline (November 2025)

- **Total disk usage:** 4.7 MB / 974 MB (0.5%)
- **Security-bot-state:** ~164 snapshot files (7-day retention)
- **Growth rate:** ~20-30 KB/hour (stable after retention pruning)

### Historical Analysis Commands

```bash
# 1-hour delta comparison
date; du -sh /Store; sleep 3600; date; du -sh /Store

# Find files created in last 24 hours
find /Store -type f -mtime -1 -ls

# Snapshot count (expect ~168 for 7 days hourly)
ls -lah /Store/security-bot-state/snapshots/ | wc -l

# Check for abandoned temp files
find /Store -type f -name "*.tmp" -o -name "*.swp"
```

## 3.6 Durable Event Bus Sink

### Storage Provider Configuration

**Providers:**
- **S3/R2** (production): Set `BACKUP_STORAGE_PROVIDER=s3`
- **Local** (development): Set `BACKUP_STORAGE_PROVIDER=local`
- **None** (disabled): Leave unset (logs warning, skips uploads)

**S3/R2 Environment Variables:**
```bash
BACKUP_STORAGE_PROVIDER=s3
BACKUP_STORAGE_S3_BUCKET=infinity-gauntlet-outbox
BACKUP_STORAGE_S3_REGION=us-west-2
BACKUP_STORAGE_S3_ENDPOINT=https://s3.us-west-2.amazonaws.com  # Optional for R2
BACKUP_STORAGE_S3_FORCE_PATH_STYLE=true  # Required for Cloudflare R2

# AWS credentials (standard environment variables)
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

**Local Fallback:**
```bash
BACKUP_STORAGE_PROVIDER=local
BACKUP_STORAGE_LOCAL_DIR=%TEMP%/infinity-gauntlet/outbox-backups  # Optional
```

### Verification

After deployment, check logs for successful uploads:

```bash
# Tail outbox worker logs
npm run render:logs -- infinity-gauntlet-outbox

# Look for sink events
grep "worker.outbox.sink" logs/app.log

# Verify provider
# Expected: "provider": "s3", "location": "s3://bucket/outbox/topic/timestamp-id.json"
```

---

[← Back to INDEX](INDEX.md) | [← Previous: Database Operations](02-database-operations.md) | [Next: Environment Management →](04-environment-management.md)