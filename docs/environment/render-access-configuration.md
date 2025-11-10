# Render Access Configuration

**Purpose:** Guide for configuring Render API and SSH access for development  
**Status:** Template (credentials stored securely in `secrets/Infinity-Gauntlet.env` and `docs/environment/render-credentials-reference.md`)

---

## Quick Start

### 1. Load Credentials
```powershell
# Load environment file (includes RENDER_API_KEY)
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist

# Verify loaded
echo $env:RENDER_API_KEY  # Should print API key
```

### 2. SSH Access
```bash
# Connect to main bot service
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# Or use automated script
pwsh -File scripts/render_ssh_exec.ps1 -ServiceId "srv-d3snk2ndiees73cn709g" -Command "echo 'Hello from Render'"
```

### 3. API Access
```powershell
# Query service logs (requires RENDER_API_KEY loaded)
pwsh -File scripts/render_logs.ps1 -Service "infinity-gauntlet-bots" -Tail

# Check service status
pwsh -File scripts/render_status.ps1
```

---

## Available Scripts

### SSH Automation
- `scripts/render_ssh_setup.ps1` — Register SSH key (one-time setup)
- `scripts/render_ssh_connect.ps1` — Interactive SSH connection
- `scripts/render_ssh_exec.ps1` — Execute remote commands

**Usage:**
```powershell
# Setup SSH keys (one-time)
pwsh -File scripts/render_ssh_setup.ps1

# Connect interactively
pwsh -File scripts/render_ssh_connect.ps1 -ServiceId "srv-d3snk2ndiees73cn709g"

# Execute command
pwsh -File scripts/render_ssh_exec.ps1 -ServiceId "srv-d3snk2ndiees73cn709g" -Command "df -h"
```

### API-Based Scripts
- `scripts/render_logs.ps1` — Query service logs
- `scripts/render_deploy.ps1` — Trigger deployments
- `scripts/render_status.ps1` — Check service status

**Usage:**
```powershell
# View live logs
pwsh -File scripts/render_logs.ps1 -Service "infinity-gauntlet-bots" -Tail

# Deploy service
pwsh -File scripts/render_deploy.ps1 -Service "infinity-gauntlet-bots"

# Check all services
pwsh -File scripts/render_status.ps1
```

---

## Service IDs

### Main Services
- **Main Bot Worker:** `srv-d3snk2ndiees73cn709g` (infinity-gauntlet-bots)
- **Other Services:** See `render.yaml` for complete list

### Regions
- **Primary:** Virginia (`ssh.virginia.render.com`)
- **Others:** Oregon, Frankfurt, Singapore

---

## Security Notes

### Credential Storage
- ✅ **API Key:** Stored in `secrets/Infinity-Gauntlet.env` (gitignored)
- ✅ **SSH Key:** Registered in Render Dashboard (public key only)
- ✅ **Full Reference:** `docs/environment/render-credentials-reference.md` (gitignored)

### Access Control
- SSH key is workstation-specific
- API key has limited scope (logs, deployments)
- Both can be revoked via Render Dashboard if compromised

### Best Practices
1. Never commit credentials to Git
2. Use environment variables for automation
3. Rotate API key every 90 days
4. Revoke immediately if compromised

---

## Troubleshooting

### SSH Connection Failed
```
Error: Permission denied (publickey)
```
**Solution:** Re-run `scripts/render_ssh_setup.ps1`

### API Key Invalid
```
Error: 401 Unauthorized
```
**Solution:** Verify `$env:RENDER_API_KEY` is loaded from `secrets/Infinity-Gauntlet.env`

### Service ID Not Found
```
Error: 404 Not Found
```
**Solution:** Check service ID in `render.yaml` or Render Dashboard

---

## Related Documentation
- `docs/environment/ai-env-setup.md` — Environment setup guide
- `docs/environment/render-credentials-reference.md` — Full credentials reference (gitignored)
- `docs/deployment/render-ssh-automation.md` — SSH automation suite
- `docs/deployment/ssh-protocol.md` — SSH protocol documentation

---

**Last Updated:** 2025-11-10  
**Status:** Active configuration for development  
**Note:** Actual credentials are stored securely in gitignored files
