# Render Platform Credentials Reference

**Last Updated:** 2025-12-06  
**Purpose:** Centralized reference for Render platform access (SSH-only policy enforced).

---

## ⚠️ CRITICAL: SSH-ONLY ACCESS POLICY (2025-12-06)

**Render API calls are PROHIBITED to minimize costs.** All remote access MUST use SSH.

### What's Allowed

| ✅ ALLOWED | Purpose |
|------------|---------|
| `render ssh srv-d3snk2ndiees73cn709g` | Interactive shell via Render CLI |
| `wsl ssh render-virginia` | SSH via WSL |
| `scripts/render_ssh_windows.ps1` | Windows SSH wrapper |
| `scripts/render_disk_usage_windows.ps1` | Disk usage via SSH |
| `scripts/render_cleanup_heaps_windows.ps1` | Cleanup via SSH |
| Render Dashboard | Manual deploys, restarts, logs |

### What's Prohibited

| ❌ PROHIBITED | Reason |
|---------------|--------|
| `api.render.com/*` endpoints | Incurs API costs |
| `RENDER_API_KEY` for REST calls | Incurs API costs |
| `Invoke-RestMethod` to Render | Incurs API costs |
| GitHub Actions using Render API | Incurs API costs |

### Archived Scripts (Do Not Use)

API-based scripts have been moved to `scripts/archive/render-api-deprecated/`:
- `render_deploy.ps1` → Use Dashboard "Manual Deploy"
- `render_restart.ps1` → Use Dashboard restart button
- `render_status.ps1` → Use `render services` via CLI
- `render_logs.ps1` → Use `render logs` via CLI or Dashboard
- `render_deploys.ps1` → Use Dashboard
- All `render_*_job.ps1` scripts → Use Dashboard

---

## 🔒 Security Notice

This file contains **references** to credentials stored in `secrets/Infinity-Gauntlet.env`. Never commit actual secrets to git.

**Secure Storage Locations:**
- Local: `secrets/Infinity-Gauntlet.env` (gitignored)
- Render: Environment variables (https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g/env-vars)

---

## 🔑 Render API Key

**Purpose:** Authenticate GitHub Actions workflows and VS Code tasks for service management.

**Value:** `rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp`

**⚠️ API KEY DEPRECATED (2025-12-06):**

API usage has been discontinued to minimize costs. The API key is retained for emergency use only.

**Archived Scripts (formerly required API):**
- ~~`.github/workflows/scheduled-restart.yml`~~ (DELETED - Render auto-restarts)
- ~~`.github/workflows/health-check-watchdog.yml`~~ (DELETED - Render monitoring)
- `scripts/archive/render-api-deprecated/render_deploy.ps1`
- `scripts/archive/render-api-deprecated/render_restart.ps1`
- `scripts/archive/render-api-deprecated/render_status.ps1`
- `scripts/archive/render-api-deprecated/render_logs.ps1`

**Emergency Use Only:**
```powershell
# ONLY for emergencies when Dashboard/SSH unavailable
curl https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g `
  -H "Authorization: Bearer rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp"
```

**Standard Operations (Use Instead):**
- Deploy: Render Dashboard → Manual Deploy
- Restart: Render Dashboard → Restart button
- Status: `render services` via Render CLI
- Logs: Render Dashboard → Logs tab

---

## 🏢 Service Information

**Main Bot Service:**
- **Name:** Infinity-Gauntlet
- **Service ID:** `srv-d3snk2ndiees73cn709g`
- **Type:** Worker (background service, no HTTP routes)
- **Region:** Virginia
- **Plan:** Standard (2 GB RAM, 1 vCPU, upgraded 2025-11-17)
- **Dashboard:** https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g

**Resource Specifications:**

| Resource | Limit | Purpose | Volatile? | Monitoring |
|----------|-------|---------|-----------|------------|
| **RAM (Memory)** | 2 GB (2048 MB) | Process memory, caches, heap | ✅ Yes (lost on restart) | `process.memoryUsage().rss` |
| **Persistent Disk** | 1 GB (974 MB formatted) | /Store directory, state files | ❌ No (survives restarts) | `df -h /Store` |
| **vCPU** | 1.0 | Compute capacity | N/A | `top` via SSH |

**⚠️ CRITICAL: RAM vs Disk Distinction**
- **RAM (2 GB):** Volatile process memory tracked by `resource-monitor.ts`
  - Current: ~356 MB (17%)
  - Alert thresholds: 75%, 85%, 90%
  - Failure mode: OOM kill → process crash
- **Disk (1 GB):** Persistent /Store volume tracked manually
  - Current: ~83 MB (9%)
  - No automatic alerts ⚠️
  - Failure mode: Write failures → data loss

**See:** `docs/RESOURCE-LIMITS-RAM-VS-DISK.md` for comprehensive guide

**Deployment:**
- **Auto-deploy:** Enabled (git push to `main` triggers deploy)
- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Docker:** Disabled (native Node.js runtime)

---

## 🔐 SSH Access

**Purpose:** Direct terminal access to Render service container for debugging and log inspection.

### Method 1: Windows PowerShell Wrappers (Recommended)

**Easiest for Windows users:**
```powershell
# Interactive SSH session
.\scripts\render_ssh_windows.ps1 -Interactive

# Check disk usage
.\scripts\render_disk_usage_windows.ps1

# Execute command
.\scripts\render_ssh_windows.ps1 -Command "df -h /Store"

# Clean up heap snapshots
.\scripts\render_cleanup_heaps_windows.ps1 -DryRun
```

**VS Code Tasks:** `Ctrl+Shift+P` → `Tasks: Run Task` → `Render SSH (Windows): ...`

### Method 2: Direct WSL Commands

**Connection Method:** WSL (Render CLI managed)

**Quick Access:**
```bash
# Via SSH config shortcut
wsl ssh render-virginia

# Via Render CLI
wsl bash -c "export RENDER_API_KEY='rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp' && render ssh srv-d3snk2ndiees73cn709g"

# Run commands directly
wsl ssh render-virginia 'df -h /Store'
```

**SSH Key:** `~/.ssh/render_key` (WSL - generated by `render login`)

**SSH Public Key:**
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH2nGfecHh4dwNrs1brxOvwvUUeG7daOsIim4qSzY7sI render-access
```

**Added to Render:** https://dashboard.render.com/u/settings#ssh-public-keys

**Dashboard Shell (Browser Access):**
```
https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g/shell
```

### Common Operations

**Windows PowerShell (Recommended):**
```powershell
# List Store directory contents
.\scripts\render_ssh_windows.ps1 -Command "ls -lah /Store/"

# View restart metrics
.\scripts\render_ssh_windows.ps1 -Command "cat /Store/restart-metrics.json | jq ."

# View security bot state
.\scripts\render_ssh_windows.ps1 -Command "cat /Store/security-bot-state/current.json | jq ."

# Check disk usage (detailed)
.\scripts\render_disk_usage_windows.ps1 -Detailed
```

**Direct WSL:**
```bash
# List Store directory contents
wsl ssh render-virginia 'ls -lah /Store/'

# View restart metrics
wsl ssh render-virginia 'cat /Store/restart-metrics.json | jq .'

# View security bot state
wsl ssh render-virginia 'cat /Store/security-bot-state/current.json | jq .'

# Check disk usage
wsl ssh render-virginia 'df -h'

# View process status
ps aux

# Check memory usage
free -h
```

**Usage via Render Shell API (Starter plan: Not supported - use Dashboard Shell):**
```powershell
# Execute command in service container
curl -X POST https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g/shell `
  -H "Authorization: Bearer rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp" `
  -H "Content-Type: application/json" `
  -d '{"command":"df -h"}'

# Check health endpoint (used by health-check-watchdog.yml)
curl -X POST https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g/shell `
  -H "Authorization: Bearer rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp" `
  -H "Content-Type: application/json" `
  -d '{"command":"curl http://localhost:3000/health"}'

# Check disk usage
curl -X POST https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g/shell `
  -H "Authorization: Bearer rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp" `
  -H "Content-Type: application/json" `
  -d '{"command":"du -sh /Store/*"}'
```

**VS Code Tasks Using SSH:**
- `Render SSH (Windows): Interactive` - Interactive SSH session
- `Render SSH (Windows): Check Disk Usage` - Quick disk check
- `Render SSH (Windows): Detailed Disk Usage` - Full /Store breakdown
- `Render SSH (Windows): Cleanup Heaps (Dry Run)` - Preview heap cleanup
- `Render SSH (Windows): Cleanup Heaps` - Delete old snapshots

**Legacy Tasks (Deprecated):**
- ~~`Render SSH: Setup Keys`~~ → Use WSL Render CLI setup
- ~~`Render SSH: Connect (Interactive)`~~ → Use `Render SSH (Windows): Interactive`
- ~~`Render SSH: Execute Command`~~ → Use `render_ssh_windows.ps1 -Command`

---

## 🌐 API Endpoints Reference (DEPRECATED)

**⚠️ DO NOT USE - API calls incur costs. Use SSH/Dashboard instead.**

<details>
<summary>Archived API Reference (Emergency Use Only)</summary>

**Base URL:** `https://api.render.com/v1`

**Authentication Header:**
```
Authorization: Bearer rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp
```

**Common Endpoints:**

1. **Get Service Details**
   ```
   GET /services/srv-d3snk2ndiees73cn709g
   Response: { id, name, type, state, region, createdAt, updatedAt }
   ```

2. **Restart Service**
   ```
   POST /services/srv-d3snk2ndiees73cn709g/restart
   Response: { id, status, message }
   ```

3. **List Deployments**
   ```
   GET /services/srv-d3snk2ndiees73cn709g/deploys
   Response: [{ id, status, createdAt, finishedAt, commitId }]
   ```

4. **Get Service Logs**
   ```
   GET /services/srv-d3snk2ndiees73cn709g/logs?tail=100
   Response: { logs: string }
   ```

5. **Execute Shell Command**
   ```
   POST /services/srv-d3snk2ndiees73cn709g/shell
   Body: { command: string }
   Response: { output: string, exitCode: number }
   ```

**Rate Limits:**
- 600 requests per minute (10 per second)
- Restart endpoint: Max 1 per minute per service

</details>

---

## 🤖 GitHub Actions Workflows (DEPRECATED)

**⚠️ ALL RENDER API WORKFLOWS DELETED (2025-12-06)**

GitHub Actions minutes are a paid resource. Render's Standard plan includes automatic restarts and monitoring, making these workflows unnecessary.

**Deleted Workflows:**
- ~~`.github/workflows/scheduled-restart.yml`~~ — Render auto-restarts on crash
- ~~`.github/workflows/health-check-watchdog.yml`~~ — Render monitors service health

**Remaining Workflows (No API Usage):**
- `.github/workflows/agent-health.yml` — Uses GITHUB_TOKEN only (no Render API)

**Cost Savings:**
- Previous: ~4,000 minutes/month on Render API calls
- Current: 0 minutes/month (SSH is free)

---

## 🔧 PowerShell Scripts

### Active Scripts (SSH-Based)

| Script | Purpose | Backend |
|--------|---------|---------|
| `render_ssh_windows.ps1` | General SSH access | WSL Render CLI |
| `render_disk_usage_windows.ps1` | Disk monitoring | WSL SSH + df |
| `render_cleanup_heaps_windows.ps1` | Heap cleanup | WSL SSH + rm |

### Archived Scripts (API-Based — Do Not Use)

Scripts moved to `scripts/archive/render-api-deprecated/`:

| Script | Former Purpose | Use Instead |
|--------|----------------|-------------|
| `render_deploy.ps1` | Trigger deployment | Dashboard: Manual Deploy |
| `render_restart.ps1` | Restart service | Dashboard: Restart button |
| `render_status.ps1` | Check status | `render services` via CLI |
| `render_logs.ps1` | View logs | Dashboard: Logs tab |
| `render_deploys.ps1` | List deployments | Dashboard: Deploys tab |

**See:** `scripts/archive/render-api-deprecated/DEPRECATED.md` for full archive manifest.

---

## 🔍 Troubleshooting

### Problem: SSH connection fails

**Cause:** Render CLI not authenticated or SSH key not configured

**Solutions:**
1. Verify Render CLI is installed:
   ```powershell
   render --version
   # Should output: render version 1.1.0
   ```

2. Login to Render CLI:
   ```powershell
   render login
   # Opens browser for authentication
   ```

3. Verify SSH works:
   ```powershell
   .\scripts\render_ssh_windows.ps1 -Command "echo hello"
   ```

### Problem: "Permission denied" on SSH

**Cause:** SSH key not added to Render account

**Solution:**
1. Check SSH key in WSL: `cat ~/.ssh/render_key.pub`
2. Add to Render: https://dashboard.render.com/u/settings#ssh-public-keys
3. Test: `wsl ssh render-virginia`

### Problem: Service is down

**Solutions:**
1. Check status via Dashboard: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
2. View logs in Dashboard → Logs tab
3. Restart via Dashboard → Restart button

### Problem: Need to deploy

**Solution:**
1. Push to `main` branch (auto-deploy enabled)
2. Or use Dashboard → Manual Deploy

---

## 📚 Related Documentation

- **Scheduled Restart:** `docs/operations-bible/07-scheduled-restart.md` (workflow behavior, setup instructions, troubleshooting)
- **Recovery Runbook:** `docs/operations-bible/07-recovery-runbook.md` (emergency procedures, restart methods)
- **Render Dashboard:** https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g

---

## 🔒 Security Best Practices

1. **Never commit secrets to git:**
   - Use `secrets/` directory (gitignored)
   - Use GitHub secrets for workflows
   - Use Render environment variables for services

2. **Rotate API keys periodically:**
   - Generate new key at: https://dashboard.render.com/u/settings/api-keys
   - Update in: GitHub secrets, local environment file
   - Test all workflows and scripts after rotation

3. **Limit API key scope:**
   - Use separate keys for different purposes (CI/CD, local dev, production)
   - Revoke unused keys immediately

4. **Monitor API usage:**
   - Review Render API logs monthly
   - Watch for unauthorized access attempts
   - Set up alerts for unusual patterns

---

**End of Credentials Reference** | **Version:** 2.0 (SSH-Only) | **Last Updated:** 2025-12-06
