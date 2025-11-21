# Render Platform Credentials Reference

**Last Updated:** 2025-11-20  
**Purpose:** Centralized reference for Render platform credentials used by AI agents and automation workflows.

---

## ⚠️ Security Notice

This file contains **references** to credentials stored in `secrets/Infinity-Gauntlet.env`. Never commit actual secrets to git.

**Secure Storage Locations:**
- Local: `secrets/Infinity-Gauntlet.env` (gitignored)
- GitHub: Repository secrets (https://github.com/Sherbivs/Infinity-Gauntlet/settings/secrets/actions)
- Render: Environment variables (https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g/env-vars)

---

## 🔑 Render API Key

**Purpose:** Authenticate GitHub Actions workflows and VS Code tasks for service management.

**Value:** `rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp`

**Required For:**
- `.github/workflows/scheduled-restart.yml` (12-hour scheduled restarts)
- `.github/workflows/health-check-watchdog.yml` (5-minute health checks)
- `scripts/render_deploy.ps1` (VS Code deployment task)
- `scripts/render_restart.ps1` (VS Code restart task)
- `scripts/render_status.ps1` (VS Code status check)
- `scripts/render_logs.ps1` (VS Code log viewer)

**Environment Variable Names:**
- GitHub Actions: `secrets.RENDER_API_KEY`
- Local scripts: `$env:RENDER_API_KEY` (loaded from `secrets/Infinity-Gauntlet.env`)
- Render services: Not needed (services use internal auth)

**API Permissions:**
- Read: Service status, logs, deployment history
- Write: Trigger deploys, restart services, update environment variables

**Setup Instructions:**

1. **GitHub Actions Secret** (CRITICAL - Required for workflows to function):
   ```
   Navigate to: https://github.com/Sherbivs/Infinity-Gauntlet/settings/secrets/actions
   Click: "New repository secret"
   Name: RENDER_API_KEY
   Value: rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp
   Click: "Add secret"
   ```

2. **Local Environment** (Already configured in `secrets/Infinity-Gauntlet.env`):
   ```powershell
   # Load environment file
   pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist
   
   # Verify
   echo $env:RENDER_API_KEY
   # Should output: rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp
   ```

**Testing:**
```powershell
# Test API access
curl https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g `
  -H "Authorization: Bearer rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp"

# Should return service details (name, type, region, state)
```

---

## 🏢 Service Information

**Main Bot Service:**
- **Name:** Infinity-Gauntlet
- **Service ID:** `srv-d3snk2ndiees73cn709g`
- **Type:** Worker (background service, no HTTP routes)
- **Region:** Virginia (oregon endpoint)
- **Plan:** Starter (2 GB RAM, 0.5 vCPU)
- **Dashboard:** https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g

**Deployment:**
- **Auto-deploy:** Enabled (git push to `main` triggers deploy)
- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Docker:** Disabled (native Node.js runtime)

**Persistent Storage:**
- **Mount path:** `/Store`
- **Size:** 2 GB
- **Purpose:** State persistence (restart-metrics.json, security-bot-state/, cache/)

---

## 🔐 SSH Access

**Purpose:** Execute commands within Render service container for debugging and health checks.

**SSH Public Key:**
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHRmJahMqnfxmn+OSaYtWmFcxfdz8i3CPqvhOS+bkWBM render-sherb@SENSAI
```

**Usage via Render Shell API:**
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
- `Render SSH: Check Disk Usage` (`scripts/render_ssh_exec.ps1`)
- `Render SSH: View /Store Contents` (`scripts/render_ssh_exec.ps1`)
- `Render SSH: Execute Command` (interactive)

---

## 🌐 API Endpoints Reference

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

---

## 🤖 GitHub Actions Workflows

**Workflows Using RENDER_API_KEY:**

1. **Scheduled Restart** (`.github/workflows/scheduled-restart.yml`)
   - Schedule: `0 */12 * * *` (00:00 UTC and 12:00 UTC)
   - Actions: POST /restart, poll status, verify health
   - Secret: `secrets.RENDER_API_KEY`

2. **Health Check Watchdog** (`.github/workflows/health-check-watchdog.yml`)
   - Schedule: `*/5 * * * *` (every 5 minutes)
   - Actions: Shell API → curl localhost:3000/health, track failures, restart on threshold
   - Secret: `secrets.RENDER_API_KEY`

**Workflow Verification:**
```powershell
# Check workflow runs
gh run list --workflow scheduled-restart.yml --limit 5
gh run list --workflow health-check-watchdog.yml --limit 5

# View workflow logs
gh run view <run-id> --log
```

---

## 🔧 PowerShell Scripts

**Scripts Using RENDER_API_KEY:**

| Script | Purpose | API Calls |
|--------|---------|-----------|
| `render_deploy.ps1` | Trigger manual deployment | POST /deploys, GET /deploys/{id} |
| `render_restart.ps1` | Restart service | POST /restart, GET /services/{id} |
| `render_status.ps1` | Check service status | GET /services (all services) |
| `render_logs.ps1` | View service logs | GET /logs |
| `render_ssh_exec.ps1` | Execute shell command | POST /shell |

**Environment Loading:**
All scripts load credentials via:
```powershell
# Load from consolidated environment file
$env:IG_ENV_FILE = "secrets/Infinity-Gauntlet.env"
pwsh -File scripts/setup_ai_env.ps1 -EnvFile $env:IG_ENV_FILE
```

---

## 🔍 Troubleshooting

### Problem: "401 Unauthorized" API responses

**Cause:** RENDER_API_KEY missing or invalid

**Solutions:**
1. Verify environment variable is loaded:
   ```powershell
   echo $env:RENDER_API_KEY
   # Should output: rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp
   ```

2. Reload environment file:
   ```powershell
   pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist
   ```

3. Verify GitHub secret exists:
   - Navigate to: https://github.com/Sherbivs/Infinity-Gauntlet/settings/secrets/actions
   - Confirm `RENDER_API_KEY` is listed
   - Value should be: `rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp`

4. Test API key directly:
   ```powershell
   curl https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g `
     -H "Authorization: Bearer rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp"
   ```

### Problem: GitHub Actions workflows fail with "Context access might be invalid"

**Cause:** RENDER_API_KEY secret not configured in GitHub repository

**Solution:**
1. Add secret via GitHub UI (see Setup Instructions above)
2. Or via GitHub CLI:
   ```powershell
   gh secret set RENDER_API_KEY --body "rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp"
   ```

### Problem: Shell API commands timeout

**Cause:** Service is down or unresponsive

**Solution:**
1. Check service status:
   ```powershell
   pwsh -File scripts/render_status.ps1
   ```

2. Check service logs:
   ```powershell
   pwsh -File scripts/render_logs.ps1 -Service Infinity-Gauntlet -Tail
   ```

3. Restart service:
   ```powershell
   pwsh -File scripts/render_restart.ps1 -Service Infinity-Gauntlet
   ```

---

## 📚 Related Documentation

- **Setup Guide:** `SETUP-GITHUB-SECRET.md` (step-by-step GitHub secret configuration)
- **Scheduled Restart:** `docs/operations-bible/06-scheduled-restart.md` (workflow behavior, troubleshooting)
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

**End of Credentials Reference** | **Version:** 1.0 | **Last Updated:** 2025-11-20
