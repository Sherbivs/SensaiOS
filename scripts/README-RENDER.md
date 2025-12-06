# Render Integration Scripts

PowerShell scripts for managing Render services from VS Code.

**Last Updated:** 2025-12-06  
**Access Policy:** SSH-Only (API calls prohibited)

---

## ⚠️ CRITICAL: SSH-ONLY ACCESS POLICY

**As of 2025-12-06, Render API calls are PROHIBITED to minimize costs.**

All remote access MUST use SSH. API-based scripts have been archived.

| ✅ ALLOWED | ❌ PROHIBITED |
|------------|---------------|
| SSH via Render CLI | REST API calls |
| Dashboard operations | `RENDER_API_KEY` for automation |
| `wsl ssh render-virginia` | `Invoke-RestMethod` to Render |

---

## Active Scripts (SSH-Based)

### render_ssh_windows.ps1
**General SSH access to Render service**

```powershell
# Interactive SSH session
.\scripts\render_ssh_windows.ps1 -Interactive

# Execute single command
.\scripts\render_ssh_windows.ps1 -Command "df -h /Store"
.\scripts\render_ssh_windows.ps1 -Command "cat /Store/restart-metrics.json | jq ."
```

### render_disk_usage_windows.ps1
**Check /Store disk usage**

```powershell
# Quick check
.\scripts\render_disk_usage_windows.ps1

# Detailed breakdown
.\scripts\render_disk_usage_windows.ps1 -Detailed
```

### render_cleanup_heaps_windows.ps1
**Clean up old heap snapshots**

```powershell
# Preview what would be deleted
.\scripts\render_cleanup_heaps_windows.ps1 -DryRun

# Delete old snapshots, keeping last 3
.\scripts\render_cleanup_heaps_windows.ps1 -Keep 3
```

---

## VS Code Tasks

Access via **Command Palette** (`Ctrl+Shift+P`) → **Tasks: Run Task**:

| Task | Purpose |
|------|---------|
| `Render SSH (Windows): Interactive` | Open interactive SSH session |
| `Render SSH (Windows): Check Disk Usage` | Quick disk check |
| `Render SSH (Windows): Detailed Disk Usage` | Full /Store breakdown |
| `Render SSH (Windows): Cleanup Heaps (Dry Run)` | Preview cleanup |
| `Render SSH (Windows): Cleanup Heaps` | Delete old snapshots |

---

## SSH Setup (One-Time)

### Prerequisites

1. **WSL installed:** `wsl --install` (Windows Terminal)
2. **Render CLI in WSL:** See setup below
3. **SSH config:** Added automatically by `render login`

### WSL Setup

```bash
# In WSL terminal
cd ~

# Install Render CLI
curl -L https://github.com/render-oss/render-cli/releases/download/v2.5.0/render-linux-amd64-v2.5.0.zip -o /tmp/render.zip
unzip /tmp/render.zip -d /tmp/
sudo mv /tmp/render /usr/local/bin/
sudo chmod +x /usr/local/bin/render

# Login (generates SSH key automatically)
export RENDER_API_KEY='rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp'
render login

# Add SSH shortcut
cat >> ~/.ssh/config << 'EOF'
Host render-virginia
  HostName ssh.virginia.render.com
  User srv-d3snk2ndiees73cn709g
  IdentityFile ~/.ssh/render_key
  StrictHostKeyChecking no
EOF
```

### Verify Setup

```powershell
# Test SSH connection
.\scripts\render_ssh_windows.ps1 -Command "echo hello"

# Or directly via WSL
wsl ssh render-virginia 'echo hello'
```

---

## Common Operations

### Check Service Status
```powershell
# Via SSH
.\scripts\render_ssh_windows.ps1 -Command "ps aux | head -20"

# Or use Dashboard
# https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
```

### View Logs
```powershell
# Via SSH (limited)
.\scripts\render_ssh_windows.ps1 -Command "tail -100 /var/log/render.log"

# Better: Use Dashboard → Logs tab
```

### Deploy
Use one of:
1. **Git push to `main`** (auto-deploy enabled)
2. **Dashboard → Manual Deploy**

### Restart Service
Use **Dashboard → Restart button**

---

## Archived Scripts (Do Not Use)

API-based scripts have been moved to `scripts/archive/render-api-deprecated/`:

| Archived Script | Former Purpose | Use Instead |
|-----------------|----------------|-------------|
| `render_deploy.ps1` | Trigger deployment | Dashboard: Manual Deploy |
| `render_restart.ps1` | Restart service | Dashboard: Restart |
| `render_status.ps1` | Check status | Dashboard or `render services` |
| `render_logs.ps1` | View logs | Dashboard: Logs tab |
| `render_deploys.ps1` | List deployments | Dashboard: Deploys tab |
| `render_run_job.ps1` | Run one-off jobs | SSH commands |

See `scripts/archive/render-api-deprecated/DEPRECATED.md` for details.

---

## Service Information

| Property | Value |
|----------|-------|
| **Name** | Infinity-Gauntlet |
| **Service ID** | `srv-d3snk2ndiees73cn709g` |
| **Region** | Virginia |
| **Plan** | Standard (2 GB RAM, 1 vCPU) |
| **Dashboard** | https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g |

---

## Troubleshooting

### SSH Connection Fails

1. **Check WSL is available:**
   ```powershell
   wsl --status
   ```

2. **Check Render CLI in WSL:**
   ```bash
   wsl bash -c "render --version"
   ```

3. **Re-authenticate:**
   ```bash
   wsl bash -c "render login"
   ```

### Permission Denied

SSH key may not be added to Render:
1. Get public key: `wsl cat ~/.ssh/render_key.pub`
2. Add to Render: https://dashboard.render.com/u/settings#ssh-public-keys

### Service Unreachable

Service may be crashed or restarting:
1. Check Dashboard: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
2. View events tab for crash reasons
3. Restart via Dashboard if needed

---

## References

- **Credentials:** `ops/RENDER-CREDENTIALS.md`
- **Deployment Procedures:** `docs/operations-bible/03-deployment-procedures.md`
- **Dashboard:** https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
