# Environment Variables Quick Reference

**File:** `secrets/Infinity-Gauntlet.env`  
**Status:** Production Ready  
**Last Updated:** 2025-11-17

## Critical Variables

### Discord Bot Credentials
```bash
BOT_TOKEN=<discord-bot-token>
POKEMON_BOT_TOKEN=<same-as-bot-token>
```

### Render Platform
```bash
# API key for deployment automation
RENDER_API_KEY=rnd_<api-key>

# SSH key for service access
RENDER_SSH_KEY=ssh-ed25519 AAAAC3Nza... render-sherb@SENSAI
```

### Database URLs

**Production (Render Managed PostgreSQL):**
```bash
DATABASE_URL=postgresql://user:pass@host/db
PROD_DATABASE_URL=postgresql://user:pass@host/db
RENDER_DB_EXTERNAL_URL=postgresql://user:pass@host.virginia-postgres.render.com/db
RENDER_DB_INTERNAL_URL=postgresql://user:pass@host/db
```

**Development (Optional - Local PostgreSQL):**
```bash
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://postgres@localhost:55433/infinity_gauntlet_db
DATABASE_ONPREMISE_DEV_EXPERIMENT=postgresql://postgres@localhost:55434/infinity_gauntlet_experiment
```

## Usage Patterns

### Loading Environment

```powershell
# Load for AI services (persists across sessions)
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist

# Verify loading
echo $Env:IG_ENV_FILE  # Should show: secrets/Infinity-Gauntlet.env
```

### Automated SSH Setup

```powershell
# One-time setup (extracts RENDER_SSH_KEY and configures SSH)
npm run render:ssh-auto

# Manual verification
npm run render:ssh-connect
```

### Database Access

```powershell
# Production (uses PROD_DATABASE_URL)
npm run db:cli -- status

# Local development (uses DATABASE_ONPREMISE_DEV_PRIMARY)
npm run db:cli -- status --target=onpremise-dev

# Migration testing (uses DATABASE_ONPREMISE_DEV_EXPERIMENT)
npm run db:cli -- status --target=onpremise-experiment
```

## Environment Variable Priority

### Production Runtime (Render)
1. `PROD_DATABASE_URL` → Primary for all operations
2. `RENDER_DB_INTERNAL_URL` → Fallback (internal network)
3. `DATABASE_URL` → Final fallback

### Migrations (Local Tooling)
1. `PROD_DATABASE_URL` → Primary target
2. `RENDER_DB_EXTERNAL_URL` → Direct access (if PROD unavailable)

### Development (Offline)
1. `DATABASE_ONPREMISE_DEV_PRIMARY` → Local workstation mirror
2. `DATABASE_ONPREMISE_DEV_EXPERIMENT` → Isolated migration testing

## Security Notes

### ✅ Safe to Store in `.env`
- Discord bot tokens (rotated regularly)
- Render API keys (scoped to account)
- SSH public keys
- Database URLs (credentials in URL)

### ❌ Never Commit
- Private SSH keys (stored in `~/.ssh/` only)
- Production secrets in repo `.env` file
- Backup credentials or API keys
- Personal access tokens

### 🔐 Key Rotation Schedule
- **Discord tokens:** Every 90 days or on compromise
- **Render API keys:** Every 90 days
- **SSH keys:** Every 90 days (see `docs/deployment/render-ssh-automation.md`)
- **Database passwords:** Every 180 days (coordinated with Render support)

## Troubleshooting

### Environment Not Loading
```powershell
# Check file exists
Test-Path "secrets/Infinity-Gauntlet.env"

# Verify IG_ENV_FILE is set
echo $Env:IG_ENV_FILE

# Reload environment
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist
```

### SSH Connection Fails
```powershell
# Re-run automated setup
npm run render:ssh-auto

# Verify SSH config
Get-Content ~/.ssh/config | Select-String "render.com"

# Test ssh-agent
ssh-add -l
```

### Database Connection Errors
```powershell
# Verify URLs are set
npm run db:cli -- status

# Test direct connection
psql $Env:PROD_DATABASE_URL -c "SELECT version();"

# Check Render dashboard
# https://dashboard.render.com/databases
```

## Related Documentation

- **AI Setup:** `docs/ai-env-setup.md` - Environment loading guide
- **SSH Automation:** `docs/deployment/render-ssh-automation.md` - Complete SSH setup
- **Database Operations:** `operations-bible/02-database-operations.md` - URL selection logic
- **Operations:** `OPERATIONS.md` - Secret handling and quick commands

## npm Scripts Reference

```bash
# Environment & Setup
npm run render:ssh-auto              # Automated SSH setup
npm run render:ssh-setup             # Manual SSH key generation

# SSH Access
npm run render:ssh-connect           # Interactive service connection
npm run render:ssh-disk              # Check disk usage
npm run render:ssh-store             # View /Store directory

# Database
npm run db:cli -- status             # Connection info
npm run db:cli -- counts             # Table row counts
npm run db:cli -- query "SELECT..."  # Run custom query

# Render API
npm run render:status                # Service status matrix
npm run render:deploy                # Deploy main bot
npm run render:restart               # Restart service
```

---

**Maintained By:** Operations Team  
**Version:** 1.0  
**Review Date:** 2025-02-17 (90 days)
