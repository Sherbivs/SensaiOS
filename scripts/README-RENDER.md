# Render Integration Scripts

PowerShell scripts for managing Render services directly from VS Code.

## Prerequisites

1. **Render API Key**: Create at [Render Dashboard → API Keys](https://dashboard.render.com/u/settings/api-keys)
2. **Environment File**: Add `RENDER_API_KEY=rnd_...` to `secrets/Infinity-Gauntlet.env`

## Scripts

### render_status.ps1
**Check deployment status of all services**

```powershell
npm run render:status
```

Shows:
- Service name and type (web/worker/cron)
- Current deployment status (live, building, deploying)
- Service URLs (if applicable)

### render_deploy.ps1
**Trigger a new deployment**

```powershell
npm run render:deploy

# Or specify a different service:
pwsh -File scripts/render_deploy.ps1 -Service "infinity-gauntlet-security"
```

Triggers deployment from the current Git branch on Render. Returns deploy ID and dashboard link.

### render_logs.ps1
**View service logs**

```powershell
# Tail logs in real-time (Ctrl+C to stop):
npm run render:logs

# Get last 100 log entries:
pwsh -File scripts/render_logs.ps1 -Service "Infinity-Gauntlet"
```

Streams logs with local timestamps for easier debugging.

### render_restart.ps1
**Restart a service (suspend + resume)**

```powershell
npm run render:restart

# Or specify a different service:
pwsh -File scripts/render_restart.ps1 -Service "infinity-gauntlet-cache"
```

Useful for forcing a clean restart without redeploying.

### render_run_job.ps1
**Run one-off commands in production environment**

```powershell
# Run a diagnostic script:
npm run render:check-db

# Run Prisma migrations:
npm run render:migrate

# Run custom commands:
npm run render:job -- -ServiceId "srv-xxx" -Command "node scripts/my-task.js"
```

One-off jobs execute commands in your production environment without deploying changes. Perfect for:
- Database health checks
- Running migrations
- Executing maintenance scripts
- Debugging production issues

See [One-Off Jobs Guide](../docs/render-one-off-jobs.md) for detailed documentation.

## SSH Integration

Complete SSH automation suite for Render services. See operations-bible/03-deployment-procedures.md § 7 for comprehensive SSH automation documentation.

### Quick SSH Commands

```powershell
## SSH Access

### Option 1: Windows PowerShell Wrappers (Recommended for Windows)

**Easiest method** - Native PowerShell scripts with familiar syntax:

```powershell
# Check disk usage
.\scripts\render_disk_usage_windows.ps1

# Interactive SSH session
.\scripts\render_ssh_windows.ps1 -Interactive

# Execute single command
.\scripts\render_ssh_windows.ps1 -Command "df -h /Store"

# Clean up old heap snapshots (preview)
.\scripts\render_cleanup_heaps_windows.ps1 -DryRun
```

**VS Code Tasks:** Use Command Palette (`Ctrl+Shift+P`) → `Tasks: Run Task` → `Render SSH (Windows): ...`

### Option 2: Direct WSL Commands (Linux/Advanced Users)

**WSL Setup (one-time):**
```bash
# Install Render CLI
cd ~
curl -L https://github.com/render-oss/render-cli/releases/download/v2.5.0/render-linux-amd64-v2.5.0.zip -o /tmp/render.zip
unzip /tmp/render.zip -d /tmp/
sudo mv /tmp/render /usr/local/bin/
sudo chmod +x /usr/local/bin/render

# Login (generates ~/.ssh/render_key automatically)
export RENDER_API_KEY='rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp'
render login

# Add SSH shortcut to ~/.ssh/config
cat >> ~/.ssh/config << 'EOF'
Host render-virginia
  HostName ssh.virginia.render.com
  User srv-d3snk2ndiees73cn709g
  IdentityFile ~/.ssh/render_key
  StrictHostKeyChecking no
EOF
```

**WSL Usage:**
```bash
# Interactive shell
wsl ssh render-virginia

# Run single command
wsl ssh render-virginia 'df -h /Store'

# Via Render CLI
wsl bash -c "export RENDER_API_KEY='rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp' && render ssh srv-d3snk2ndiees73cn709g"
```

### Windows Wrapper Scripts

Complete PowerShell wrappers with parameter validation, error checking, and color output:

| Script | Purpose | Example |
|--------|---------|---------|
| `render_ssh_windows.ps1` | General SSH access | `.\scripts\render_ssh_windows.ps1 -Interactive` |
| `render_disk_usage_windows.ps1` | Check /Store disk usage | `.\scripts\render_disk_usage_windows.ps1 -Detailed` |
| `render_cleanup_heaps_windows.ps1` | Clean heap snapshots | `.\scripts\render_cleanup_heaps_windows.ps1 -Keep 3` |

**Quick Start:**
```powershell
# Check disk usage
.\scripts\render_disk_usage_windows.ps1

# Interactive SSH session
.\scripts\render_ssh_windows.ps1 -Interactive

# Execute single command
.\scripts\render_ssh_windows.ps1 -Command "ls -lah /Store/"

# Clean up old heap snapshots (preview)
.\scripts\render_cleanup_heaps_windows.ps1 -DryRun
```

**VS Code Tasks:** Use Command Palette (`Ctrl+Shift+P`) → `Tasks: Run Task` → `Render SSH (Windows): ...`

**Features:**
- ✅ Automatic WSL/Render CLI verification
- ✅ Parameter validation and defaults  
- ✅ Better error messages than raw WSL commands
- ✅ Integrated with VS Code tasks
- ✅ Familiar PowerShell syntax

**Advanced Usage:**
```powershell
# Target different service
.\scripts\render_ssh_windows.ps1 -ServiceId "srv-abc123" -Command "ls -la"

# Different region
.\scripts\render_ssh_windows.ps1 -Region "oregon" -Interactive

# Keep more snapshots
.\scripts\render_cleanup_heaps_windows.ps1 -Keep 5
```

**Requirements:**
- WSL installed (`wsl --install`)
- Render CLI installed in WSL (see Option 2 setup above)
- SSH config in WSL `~/.ssh/config`

### Legacy SSH Scripts Status

**SSH Scripts Status:**

| Script | Purpose | Example |
|--------|---------|---------|
| `render_ssh_windows.ps1` | General SSH access | `.\scripts\render_ssh_windows.ps1 -Interactive` |
| `render_disk_usage_windows.ps1` | Check /Store disk usage | `.\scripts\render_disk_usage_windows.ps1 -Detailed` |
| `render_cleanup_heaps_windows.ps1` | Clean heap snapshots | `.\scripts\render_cleanup_heaps_windows.ps1 -DryRun` |

#### VS Code Tasks

Use **Command Palette** (`Ctrl+Shift+P`) → **Tasks: Run Task**:
- `Render SSH (Windows): Interactive` - Open interactive SSH session
- `Render SSH (Windows): Check Disk Usage` - Quick disk check
- `Render SSH (Windows): Detailed Disk Usage` - Full /Store breakdown
- `Render SSH (Windows): Cleanup Heaps (Dry Run)` - Preview cleanup
- `Render SSH (Windows): Cleanup Heaps` - Delete old snapshots

#### Requirements

- WSL installed (`wsl --install`)
- Render CLI installed in WSL (see setup above)
- SSH config in WSL `~/.ssh/config` with `render-virginia` shortcut

#### How It Works

Windows wrappers automatically:
1. Verify WSL is available
2. Check Render CLI is installed in WSL
3. Check SSH config exists
4. Execute commands via `wsl ssh render-virginia`
5. Return results to PowerShell with color formatting

**Benefits:**
- ✅ Familiar PowerShell syntax
- ✅ No need to type `wsl` prefix
- ✅ Parameter validation and defaults
- ✅ Better error messages
- ✅ Integrated with VS Code tasks

**Note:** Old Windows SSH scripts (`render_ssh_*.ps1`) without wrappers are deprecated.

# Connect to service (interactive)
npm run render:ssh-connect

# Execute command remotely
npm run render:ssh-exec -- -ServiceId "srv-abc123" -Command "ls -la"

# Transfer files
npm run render:ssh-transfer -- `
  -ServiceId "srv-abc123" `
  -Source "./file.txt" `
  -Destination "/Store/file.txt" `
  -Direction upload

# Create SSH tunnel
npm run render:ssh-tunnel -- `
  -ServiceId "srv-abc123" `
  -LocalPort 5432 `
  -RemotePort 5432 `
  -Type local
```

**SSH Scripts Status:**
- ⚠️ **DEPRECATED:** Old SSH scripts (`render_ssh_setup.ps1`, `render_ssh_connect.ps1`, `render_ssh_exec.ps1`)
- ✅ **ACTIVE:** Windows wrappers (`render_ssh_windows.ps1`, `render_disk_usage_windows.ps1`, `render_cleanup_heaps_windows.ps1`)
- ✅ **ACTIVE:** Direct WSL commands (`wsl ssh render-virginia`)
- 📚 **Documentation:** See `ops/RENDER-CREDENTIALS.md` for complete SSH setup and usage

## VS Code Tasks

All scripts are integrated as VS Code tasks. Access via:
- **Command Palette**: `Ctrl+Shift+P` → `Tasks: Run Task`
- **Terminal Menu**: `Terminal` → `Run Task...`
- **Keyboard**: `Ctrl+Shift+B` (build tasks)

See `.vscode/tasks.json` for configuration.

## Service Names

Available services from `render.yaml`:

- `Infinity-Gauntlet` (main Discord bot worker - render.yaml name: `infinity-gauntlet`)
- `infinity-gauntlet-outbox` (async message delivery)
- `infinity-gauntlet-cache` (cache maintenance)
- `infinity-gauntlet-data-pipeline` (reference data updates)
- `infinity-gauntlet-security` (permission guardrails)
- `pokedex-cache-worker` (external data sync)

**Note**: Use display name `Infinity-Gauntlet` (capitalized) in deployment commands, not the render.yaml lowercase `infinity-gauntlet`.

## Error Handling

All scripts include:
- ✅ Environment validation (checks for API key)
- ✅ Service existence validation
- ✅ Detailed error messages
- ✅ Non-zero exit codes on failure

## Rate Limits

Render API limits:
- **100 requests per minute** per API key
- Scripts include delays where appropriate

## References

- [Render API Documentation](https://api-docs.render.com/)
- [VS Code Integration Guide](../docs/vscode-render-integration.md)
