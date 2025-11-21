# Section 1: Local Setup

[← Back to INDEX](INDEX.md) | [Next: Testing Patterns →](02-testing-patterns.md)

---

**Philosophy**: "Local development should mirror production—same database schema, same runtime behavior, minimal setup friction."

**Purpose**: AI environment configuration, workstation gameplay setup, VS Code integration.

## 1.1 AI Environment

### Single Consolidated Environment File

**Purpose:** Use `secrets/Infinity-Gauntlet.env` as the **single source** for all local development and testing keys.

**Contents:**
```bash
# secrets/Infinity-Gauntlet.env
BOT_TOKEN=xxx                                    # Development bot token
PROD_DATABASE_URL=postgresql://...               # Render managed database (PRIMARY)
RENDER_DB_EXTERNAL_URL=postgresql://...          # Direct PostgreSQL (same DB)
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://...  # Optional: Workstation mirror (offline)
POKEMON_BOT_TOKEN=xxx
SECURITY_BOT_TOKEN=xxx (optional for local testing)
```

### Loading Commands

```powershell
# Set environment file pointer (current session)
$Env:IG_ENV_FILE="secrets/Infinity-Gauntlet.env"

# Register for future shells (creates persistent pointer)
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist

# Verify loading
echo $Env:IG_ENV_FILE
# Output: secrets/Infinity-Gauntlet.env

# Verify keys loaded (first 5 lines only, DO NOT expose full file)
Get-Content secrets/Infinity-Gauntlet.env | Select-Object -First 5
```

### Production Safety

- ✅ Repository `.env` stays EMPTY (never commit secrets)
- ✅ Local secrets always from external file
- ✅ Production ignores repo `.env` unless `IG_ALLOW_REPO_ENV=1`
- ✅ Git tracks `.env` as empty placeholder (prevents accidental commits)

### Environment Variable Priority

1. **Process environment** (highest priority)
2. **IG_ENV_FILE** external file
3. **Repo `.env`** (ignored unless `IG_ALLOW_REPO_ENV=1`)

## 1.2 Workstation Gameplay

### On-Premise Database Setup

**Purpose:** Mirror Render database to workstation for offline development and migration testing.

**Two-Database Architecture:**

| Database | Port | Purpose | Sync |
|----------|------|---------|------|
| **ONPREMISE-DEV-PRIMARY** | 55433 | Offline development with production-like data | PULL from Render (one-way) |
| **ONPREMISE-DEV-EXPERIMENT** | 55434 | Migration testing (isolated, safe) | MANUAL clone from PRIMARY |

### Bootstrap Commands

```powershell
# Auto-install PostgreSQL + bootstrap local DB (recommended for first-time setup)
npm run ops:auto-bootstrap-onpremise-dev

# Manual bootstrap (requires PostgreSQL already installed)
npm run ops:bootstrap-onpremise-dev

# Bootstrap EXPERIMENT database from PRIMARY
npm run ops:bootstrap-onpremise-experiment

# Show status of both databases
npm run ops:status-onpremise-dbs
```

### PostgreSQL Installation

**Auto-Install (Recommended):**
```powershell
# Installs PostgreSQL 17 via winget + bootstraps database
npm run ops:auto-bootstrap-onpremise-dev
```

**Manual Install:**
1. Download PostgreSQL 17: https://www.postgresql.org/download/windows/
2. Install to `C:\Program Files\PostgreSQL\17`
3. Add to PATH: `C:\Program Files\PostgreSQL\17\bin`
4. Run bootstrap: `npm run ops:bootstrap-onpremise-dev`

### Environment Configuration

**Add to `secrets/Infinity-Gauntlet.env`:**
```bash
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
DATABASE_ONPREMISE_DEV_EXPERIMENT=postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment
```

### Verification

```powershell
# Test connection to PRIMARY
npm run db:cli -- status --target local

# Test connection to EXPERIMENT
npm run db:cli -- status --target experiment

# Count records in PRIMARY
npm run db:cli -- counts --target local

# Query EXPERIMENT
npm run db:cli -- query "SELECT COUNT(*) FROM \"Species\";" --target experiment
```

See operations-bible/04-environment-management.md § 4.3 for comprehensive setup guide (originally WORKSTATION-GAMEPLAY-SETUP.md).

## 1.3 VS Code Integration

### Render Deployment Tasks

**Available in Command Palette** (`Ctrl+Shift+P` → "Tasks: Run Task"):

| Task Name | Description | Command |
|-----------|-------------|---------|
| **Render: Deploy Main Bot** | Deploy `Infinity-Gauntlet` service | `pwsh -File scripts/render_deploy.ps1 -Service "Infinity-Gauntlet"` |
| **Render: View Service Logs** | Tail logs in background | `pwsh -File scripts/render_logs.ps1 -Service "Infinity-Gauntlet" -Tail` |
| **Render: Check Service Status** | Service health matrix | `pwsh -File scripts/render_status.ps1` |
| **Render: Restart Service** | Restart worker | `pwsh -File scripts/render_restart.ps1 -Service "Infinity-Gauntlet"` |

### Render SSH Access

⚠️ **SSH Method Changed:** Windows PowerShell SSH tasks deprecated. Use WSL commands directly.

**WSL SSH Commands:**
```bash
# Interactive SSH session
wsl ssh render-virginia

# Check disk usage
wsl ssh render-virginia 'df -h'

# View /Store contents
wsl ssh render-virginia 'ls -lah /Store/'
```

See `ops/RENDER-CREDENTIALS.md` and `scripts/README-RENDER.md` for complete SSH setup and usage documentation.

### Debugging Configuration

**launch.json Example:**
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
      "envFile": "${workspaceFolder}/secrets/Infinity-Gauntlet.env"
    },
    {
      "name": "Debug Security Bot",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/security-bot.js",
      "console": "integratedTerminal",
      "envFile": "${workspaceFolder}/secrets/Infinity-Gauntlet.env"
    }
  ]
}
```

### Keyboard Shortcuts

Add to `keybindings.json`:
```json
[
  {
    "key": "ctrl+shift+d",
    "command": "workbench.action.tasks.runTask",
    "args": "Render: Deploy Main Bot"
  },
  {
    "key": "ctrl+shift+l",
    "command": "workbench.action.tasks.runTask",
    "args": "Render: View Service Logs"
  }
]
```

---

[← Back to INDEX](INDEX.md) | [Next: Testing Patterns →](02-testing-patterns.md)