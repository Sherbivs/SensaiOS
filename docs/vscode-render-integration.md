# VS Code + Render Integration Guide

This guide shows how to manage your Render services directly from VS Code using API keys.

## Setup (One-Time)

### 1. Create Render API Key

1. Go to [Render Dashboard → Account Settings → API Keys](https://dashboard.render.com/u/settings/api-keys)
2. Click **"+ Create API Key"**
3. Name it: `VS Code Integration`
4. Copy the generated key

### 2. Add to Environment File

Add to `secrets/Infinity-Gauntlet.env`:

```env
RENDER_API_KEY=rnd_your_api_key_here
```

**Security Note:** Never commit this key to git. It's already in `.gitignore` via the `secrets/` directory.

### 3. Verify Installation

Run from terminal:

```powershell
pwsh -File scripts/render_status.ps1
```

You should see all your services listed with their current status.

## Usage from VS Code

### Method 1: Command Palette (Recommended)

1. Press `Ctrl+Shift+P` (Windows) or `Cmd+Shift+P` (Mac)
2. Type: `Tasks: Run Task`
3. Select one of:
   - **Render: Check Service Status** - View all services
   - **Render: Deploy Main Bot** - Trigger deployment
   - **Render: View Service Logs** - Stream logs in real-time
   - **Render: Restart Service** - Suspend + Resume

### Method 2: Terminal Menu

1. Click **Terminal** → **Run Task...**
2. Select the Render task you want to execute

### Method 3: Keyboard Shortcut

1. Press `Ctrl+Shift+B` to run the default build task
2. Or configure custom shortcuts in **File → Preferences → Keyboard Shortcuts**

## Available Tasks

### 📊 Check Service Status
Shows all services with deployment status (live, building, deploying, etc.)

```powershell
npm run render:status
# or manually:
pwsh -File scripts/render_status.ps1
```

### 🚀 Deploy Service
Triggers a new deployment from the current Git branch:

```powershell
npm run render:deploy
# or manually:
pwsh -File scripts/render_deploy.ps1 -Service "infinity-gauntlet-bots"
```

### 📋 View Logs
**Note:** The Render REST API has limited logs support. For best experience, use one of these options:

**Option 1: Render Dashboard** (Recommended for browsing/searching)
```
https://dashboard.render.com/worker/srv-d3snk2ndiees73cn709g
```

**Option 2: Render CLI** (Recommended for live tailing)
```powershell
# Install Render CLI (one-time setup)
# Windows: Download from https://github.com/render-oss/cli/releases
# Or use Chocolatey: choco install render

# Authenticate with your API key
$env:RENDER_API_KEY = "your_api_key_here"

# Interactive mode (select service from menu)
render services

# Direct service logs
render logs -s srv-d3snk2ndiees73cn709g
```

**Option 3: Recent Deploys** (Shows deployment history)
```powershell
npm run render:deploys
# or manually:
pwsh -File scripts/render_deploys.ps1 -Service "Infinity-Gauntlet"
```

### 🔄 Restart Service
Gracefully restart a service (suspend + resume):

```powershell
npm run render:restart
# or manually:
pwsh -File scripts/render_restart.ps1 -Service "infinity-gauntlet-bots"
```

## Available Services

Your `render.yaml` defines these services:

- `infinity-gauntlet-bot` (web service)
- `infinity-gauntlet-bots` (main Discord bot worker)
- `infinity-gauntlet-outbox` (async message delivery)
- `infinity-gauntlet-cache` (cache maintenance)
- `infinity-gauntlet-data-pipeline` (reference data updates)
- `infinity-gauntlet-security` (permission guardrails)
- `pokedex-cache-worker` (external data sync)

## npm Scripts (Coming Soon)

For convenience, you can add these to `package.json`:

```json
{
  "scripts": {
    "render:status": "pwsh -File scripts/render_status.ps1",
    "render:deploy": "pwsh -File scripts/render_deploy.ps1 -Service infinity-gauntlet-bots",
    "render:deploys": "pwsh -File scripts/render_deploys.ps1 -Service Infinity-Gauntlet",
    "render:restart": "pwsh -File scripts/render_restart.ps1 -Service infinity-gauntlet-bots"
  }
}
```

## Troubleshooting

### Error: "RENDER_API_KEY not found"

**Solution:** Ensure the key is in `secrets/Infinity-Gauntlet.env` and the file is readable.

### Error: "Service 'X' not found"

**Solution:** Check the exact service name in your Render dashboard or run `npm run render:status` to list all services.

### API Rate Limits

Render API has rate limits:
- **100 requests per minute** per API key
- If you hit the limit, wait 60 seconds and retry

### Logs Not Updating

**Solution:** Use the `-Tail` flag to stream logs in real-time:

```powershell
pwsh -File scripts/render_logs.ps1 -Service "infinity-gauntlet-bots" -Tail
```

## SSH Access (Advanced)

For direct shell access to services (database shells, file system access), you can add SSH keys:

1. Generate SSH key pair:
   ```powershell
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. Copy public key:
   ```powershell
   Get-Content ~/.ssh/id_ed25519.pub | Set-Clipboard
   ```

3. Add to Render: [Dashboard → Account → SSH Public Keys](https://dashboard.render.com/u/settings/ssh-keys)

4. Connect to services that support SSH (e.g., PostgreSQL):
   ```bash
   ssh -L 5432:localhost:5432 user@your-service.render.com
   ```

## References

- [Render API Documentation](https://api-docs.render.com/)
- [VS Code Tasks Documentation](https://code.visualstudio.com/docs/editor/tasks)
- [PowerShell Invoke-RestMethod](https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/invoke-restmethod)
