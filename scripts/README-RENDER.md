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
# Setup SSH keys
npm run render:ssh-setup

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

**Available SSH scripts:**
- `render_ssh_setup.ps1` - Generate and configure SSH keys
- `render_ssh_connect.ps1` - Interactive SSH connection
- `render_ssh_exec.ps1` - Execute commands remotely
- `render_ssh_transfer.ps1` - File transfer via SCP
- `render_ssh_tunnel.ps1` - Port forwarding and SOCKS proxy

See operations-bible/03-deployment-procedures.md § 7 for detailed SSH automation usage and examples.

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
