# Section 4: Environment Management

[← Back to INDEX](INDEX.md) | [← Previous: Deployment Procedures](03-deployment-procedures.md) | [Next: Monitoring →](05-monitoring.md)

---

**Philosophy**: "Secrets are sacred—never committed, always external, strictly controlled."

**Purpose**: Render access configuration, credentials reference, secret management.

## 4.1 Render Access Configuration

### API Key Management

**Environment Variable:** `RENDER_API_KEY`

**Storage Location:** `secrets/Infinity-Gauntlet.env` (NOT committed to git)

**Access Scopes:**
- Service deployment
- Log streaming
- SSH key management
- Environment variable updates

### Service Discovery

**Manual Discovery:**
```powershell
# List all services
npm run render:status

# Get service ID from dashboard
# Example: srv-d3snk2ndiees73cn709g
```

**Programmatic Discovery:**
```powershell
# Query Render API for service list
Invoke-RestMethod -Uri "https://api.render.com/v1/services" `
  -Headers @{ Authorization = "Bearer $Env:RENDER_API_KEY" } `
  -Method GET
```

### Environment Variable Setup

**Render Dashboard Method:**
1. Navigate to service → "Environment" tab
2. Add key-value pairs
3. Click "Save Changes"
4. Service auto-restarts with new variables

**API Method (Bulk Updates):**
```powershell
# Update environment variables via API
$body = @{
  envVars = @(
    @{ key = "NODE_ENV"; value = "production" }
    @{ key = "ENABLE_SECURITY_BOT"; value = "true" }
  )
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g/env-vars" `
  -Headers @{ Authorization = "Bearer $Env:RENDER_API_KEY" } `
  -Method PATCH `
  -Body $body `
  -ContentType "application/json"
```

## 4.2 Credentials Reference

### Required Secrets (Production)

**Discord Tokens:**
```bash
POKEMON_BOT_TOKEN=xxx          # Main gameplay bot token
SECURITY_BOT_TOKEN=xxx         # Security bot token (dedicated worker)
```

**Database URLs:**
```bash
PROD_DATABASE_URL=postgresql://...              # PRIMARY production database (Render managed)
RENDER_DB_EXTERNAL_URL=postgresql://...         # Direct PostgreSQL access (same DB)
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://... # Optional: Workstation mirror (offline fallback)
```

**DRIP Alert Destinations:**
```bash
ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/...
ALERT_CHANNEL_ID=123456789
ALERT_USER_ID=987654321
```

**Render API:**
```bash
RENDER_API_KEY=rnd_xxx         # Render API token (deployment automation)
```

**Durable Storage (S3/R2):**
```bash
BACKUP_STORAGE_PROVIDER=s3
BACKUP_STORAGE_S3_BUCKET=infinity-gauntlet-outbox
BACKUP_STORAGE_S3_REGION=us-west-2
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

**GitHub (Cache Worker):**
```bash
GITHUB_TOKEN=ghp_xxx           # GitHub personal access token (cache refresh)
```

### Local Development Secrets

**Single Consolidated Environment File:**
```bash
# Location: secrets/Infinity-Gauntlet.env
# Load with: $Env:IG_ENV_FILE="secrets/Infinity-Gauntlet.env"

BOT_TOKEN=xxx                                    # Development bot token
PROD_DATABASE_URL=postgresql://...               # Render managed database (PRIMARY)
RENDER_DB_EXTERNAL_URL=postgresql://...          # Direct PostgreSQL (same DB)
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://...  # Optional: Workstation mirror
POKEMON_BOT_TOKEN=xxx
```

**Loading Commands:**
```powershell
# Set environment file pointer
$Env:IG_ENV_FILE="secrets/Infinity-Gauntlet.env"

# Register for future shells (persistent)
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist

# Verify loading
echo $Env:IG_ENV_FILE
```

**Production Safety:**
- Repository `.env` stays EMPTY
- Local secrets always from external file
- Production ignores repo `.env` unless `IG_ALLOW_REPO_ENV=1`

See [docs/ai-env-setup.md](../environment/ai-env-setup.md) for comprehensive setup guide.

## 4.4 Environment Variables Quick Reference

**File:** `secrets/Infinity-Gauntlet.env`  
**Status:** Production Ready  
**Last Updated:** 2025-11-17

### Critical Variables

**Discord Bot Credentials:**
```bash
BOT_TOKEN=<discord-bot-token>
POKEMON_BOT_TOKEN=<same-as-bot-token>
```

**Render Platform:**
```bash
# API key for deployment automation
RENDER_API_KEY=rnd_<api-key>
```

**Database URLs (Production - Render Managed PostgreSQL):**
```bash
# PRIMARY database for all operations
PROD_DATABASE_URL=postgresql://user:pass@host.virginia-postgres.render.com/db

# Same database, different connection methods
DATABASE_URL=postgresql://user:pass@host/db
RENDER_DB_EXTERNAL_URL=postgresql://user:pass@host.virginia-postgres.render.com/db
RENDER_DB_INTERNAL_URL=postgresql://user:pass@host/db
```

**Database URLs (Development - Optional Local PostgreSQL):**
```bash
# Workstation mirror (offline fallback only, NOT production)
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://postgres@localhost:55433/infinity_gauntlet_db

# Migration testing cluster (isolated experiments)
DATABASE_ONPREMISE_DEV_EXPERIMENT=postgresql://postgres@localhost:55434/infinity_gauntlet_experiment
```

### Usage Patterns

**Loading Environment:**

```powershell
# Load for AI services (persists across sessions)
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist

# Verify loading
echo $Env:IG_ENV_FILE  # Should show: secrets/Infinity-Gauntlet.env

# Check specific variable
echo $Env:PROD_DATABASE_URL
```

**Accessing in Scripts:**

```powershell
# PowerShell scripts
if (-not $Env:IG_ENV_FILE) {
    Write-Error "IG_ENV_FILE not set. Run: pwsh -File scripts/setup_ai_env.ps1 -EnvFile 'secrets/Infinity-Gauntlet.env' -Persist"
    exit 1
}

# Node.js / TypeScript
import dotenv from 'dotenv';
const envFile = process.env.IG_ENV_FILE || 'secrets/Infinity-Gauntlet.env';
dotenv.config({ path: envFile });
```

**Production Behavior:**
- Render services load environment variables directly from dashboard
- Repository `.env` file is IGNORED in production (empty by design)
- Production never uses `IG_ENV_FILE` (Render platform manages secrets)
- Local development requires explicit `IG_ENV_FILE` setting

**Safety Rules:**
- ✅ DO use `secrets/Infinity-Gauntlet.env` for all local development
- ✅ DO keep repository `.env` file EMPTY
- ✅ DO load via `IG_ENV_FILE` pointer (never hardcode path)
- ❌ DON'T commit secrets to git
- ❌ DON'T use multiple environment files (single source of truth)
- ❌ DON'T set `IG_ALLOW_REPO_ENV=1` in production

## 4.3 Secret Rotation

### Rotation Schedule

| Secret Type | Rotation Frequency | Process |
|-------------|-------------------|---------|
| Discord Tokens | On compromise only | Regenerate in Discord Developer Portal → Update Render env vars |
| Database URLs | Never (managed by Render) | Render handles automatically |
| API Keys | Every 90 days | Regenerate in provider dashboard → Update Render + local env file |
| GitHub Token | Every 90 days | Regenerate in GitHub → Update Render worker env vars |

### Rotation Procedure

**Example: Rotating Discord Bot Token**

1. **Generate New Token:**
   - Navigate to Discord Developer Portal
   - Select application → "Bot" tab
   - Click "Reset Token" → Copy new token

2. **Update Render Environment:**
   - Render Dashboard → Service → "Environment" tab
   - Update `POKEMON_BOT_TOKEN` value
   - Click "Save Changes" (triggers automatic restart)

3. **Update Local Environment:**
   ```powershell
   # Edit secrets/Infinity-Gauntlet.env
   # Update POKEMON_BOT_TOKEN=new_token
   
   # Reload environment
   pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env"
   ```

4. **Verify Connectivity:**
   ```bash
   # Check bot comes online in Discord
   # Run npm start locally to test
   npm start
   ```

5. **Document Rotation:**
   - Record rotation date in Tasklist.md
   - Note any issues encountered
   - Update next rotation reminder (90 days)

### Emergency Secret Compromise

**If a secret is compromised:**

1. **Immediate Actions:**
   - Rotate compromised secret immediately
   - Update Render environment variables
   - Force restart affected services
   - Monitor logs for unauthorized access

2. **Investigation:**
   - Check git history for accidental commits
   - Review access logs
   - Identify compromise vector
   - Document findings in Tasklist.md

3. **Prevention:**
   - Add compromised file pattern to `.gitignore`
   - Run `git log -S "compromised_secret"` to find leaks
   - Consider using git-secrets or similar tools

---

[← Back to INDEX](INDEX.md) | [← Previous: Deployment Procedures](03-deployment-procedures.md) | [Next: Monitoring →](05-monitoring.md)