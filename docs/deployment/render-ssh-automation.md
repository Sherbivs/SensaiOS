# Render SSH Automation Guide

**Last Updated:** 2025-11-17  
**Status:** Production Ready  
**Automation Level:** Fully Automated

## Overview

This guide documents the automated SSH setup for Render services, enabling AI services and automation scripts to connect to production without manual intervention.

## Quick Start

### Automated Setup (Recommended)

```powershell
# Run automated setup script (no user interaction)
pwsh -File scripts/render_ssh_auto_setup.ps1

# Force reinstall/reconfigure
pwsh -File scripts/render_ssh_auto_setup.ps1 -Force
```

This script automatically:
- ✅ Extracts SSH key from `secrets/Infinity-Gauntlet.env`
- ✅ Installs public key to `~/.ssh/render_ed25519.pub`
- ✅ Configures SSH config with Render hosts
- ✅ Adds Render's public keys to known_hosts
- ✅ Configures Windows OpenSSH service (ssh-agent)
- ✅ Sets environment variable `RENDER_SSH_KEY_PATH`

### Manual Setup (Alternative)

```powershell
# Generate new SSH key pair
pwsh -File scripts/render_ssh_setup.ps1

# Copy public key to clipboard, then add to Render Dashboard
# https://dashboard.render.com/settings#ssh-public-keys
```

## Architecture

### SSH Key Storage

**Environment File:** `secrets/Infinity-Gauntlet.env`
```bash
# SSH key for Render service access (automation & debugging)
RENDER_SSH_KEY=ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHRmJahMqnfxmn+OSaYtWmFcxfdz8i3CPqvhOS+bkWBM render-sherb@SENSAI
```

**File System:**
- Public key: `~/.ssh/render_ed25519.pub` (installed by automation)
- Private key: `~/.ssh/render_ed25519` (must be obtained separately)
- SSH config: `~/.ssh/config` (auto-configured)
- Known hosts: `~/.ssh/known_hosts` (auto-populated)

**Registry/Environment:**
- Environment variable: `RENDER_SSH_KEY_PATH=%USERPROFILE%\.ssh\render_ed25519`
- Windows service: `ssh-agent` (automatic startup)

### SSH Configuration

**Auto-generated `~/.ssh/config`:**
```ssh
Host *.render.com
    IdentityFile ~/.ssh/render_ed25519
    StrictHostKeyChecking accept-new
    ServerAliveInterval 60
    ServerAliveCountMax 3
    AddKeysToAgent yes
    UseKeychain yes

Host render-virginia
    HostName ssh.virginia.render.com

Host render-oregon
    HostName ssh.oregon.render.com
```

## Usage Patterns

### Connect to Main Bot Service

```powershell
# Interactive connection (service menu)
npm run render:ssh-connect

# Direct connection to main bot
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# Using shortcut
ssh srv-d3snk2ndiees73cn709g@render-virginia
```

### Execute Remote Commands

```powershell
# Check disk usage
npm run render:ssh-disk

# View /Store contents
npm run render:ssh-store

# Custom command
pwsh -File scripts/render_ssh_exec.ps1 -ServiceId srv-d3snk2ndiees73cn709g -Command "df -h"
```

### Automation Scripts

```powershell
# PowerShell script using environment variable
$sshKey = $env:RENDER_SSH_KEY_PATH
$serviceId = "srv-d3snk2ndiees73cn709g"
$region = "virginia"

ssh -i $sshKey "$serviceId@ssh.$region.render.com" "ls -la /Store"
```

```typescript
// TypeScript/Node.js automation
import { execSync } from 'child_process';

const serviceId = 'srv-d3snk2ndiees73cn709g';
const region = 'virginia';
const command = 'df -h';

const result = execSync(
  `ssh ${serviceId}@ssh.${region}.render.com "${command}"`,
  { encoding: 'utf-8' }
);

console.log(result);
```

## Security

### Private Key Protection

**CRITICAL:** The private key must be stored securely and NEVER committed to Git.

**Secure Storage Options:**
1. **Local workstation:** `~/.ssh/render_ed25519` (owner read-only permissions)
2. **CI/CD secrets:** GitHub Actions secrets, Azure Key Vault, etc.
3. **Hardware token:** YubiKey or other FIDO2 device

**Windows Permissions:**
```powershell
# Set owner-only read permissions
icacls "$env:USERPROFILE\.ssh\render_ed25519" /inheritance:r /grant:r "${env:USERNAME}:R"

# Verify permissions
icacls "$env:USERPROFILE\.ssh\render_ed25519"
```

### Key Rotation

**Recommended Schedule:** Every 90 days

```powershell
# 1. Generate new key pair
pwsh -File scripts/render_ssh_setup.ps1 -KeyName "render_ed25519_new" -Force

# 2. Add new public key to Render Dashboard
# https://dashboard.render.com/settings#ssh-public-keys

# 3. Test new key
ssh -i ~/.ssh/render_ed25519_new srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# 4. Update environment file
# RENDER_SSH_KEY=<new-public-key>

# 5. Run automated setup
pwsh -File scripts/render_ssh_auto_setup.ps1 -Force

# 6. Remove old key from Render Dashboard
```

### Audit Trail

**Track SSH connections:**
```powershell
# View recent SSH connections on service
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "last -n 20"

# View auth logs
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "sudo journalctl -u ssh -n 50"
```

## Troubleshooting

### Connection Refused

**Symptoms:**
```
ssh: connect to host ssh.virginia.render.com port 22: Connection refused
```

**Solutions:**
1. Verify service is running: `npm run render:status`
2. Check if service is paid tier (SSH requires paid plan)
3. Verify region is correct (virginia, oregon, etc.)
4. Test with verbose output: `ssh -v srv-XXX@ssh.virginia.render.com`

### Permission Denied (publickey)

**Symptoms:**
```
Permission denied (publickey).
```

**Solutions:**
1. Verify public key is added to Render Dashboard
2. Check private key exists: `Test-Path ~/.ssh/render_ed25519`
3. Verify private key permissions: `icacls ~/.ssh/render_ed25519`
4. Test key loading: `ssh-add -l` (should show render_ed25519)
5. Re-run setup: `pwsh -File scripts/render_ssh_auto_setup.ps1 -Force`

### ssh-agent Not Running

**Symptoms:**
```
Could not open a connection to your authentication agent.
```

**Solutions:**
```powershell
# Start ssh-agent service
Start-Service ssh-agent

# Set to automatic startup
Set-Service ssh-agent -StartupType Automatic

# Add key to agent
ssh-add ~/.ssh/render_ed25519
```

### Wrong Service ID

**Symptoms:**
```
ssh_exchange_identification: Connection closed by remote host
```

**Solutions:**
1. Verify service ID: `npm run render:status`
2. Check service region matches SSH hostname
3. Use interactive menu: `npm run render:ssh-connect` (no ServiceId parameter)

## Integration with AI Services

### GitHub Copilot

The automated setup enables GitHub Copilot to suggest SSH commands:

```typescript
// Copilot understands RENDER_SSH_KEY_PATH environment variable
const sshKey = process.env.RENDER_SSH_KEY_PATH;
const serviceId = 'srv-d3snk2ndiees73cn709g';

// Copilot can suggest complete SSH commands
execSync(`ssh -i ${sshKey} ${serviceId}@ssh.virginia.render.com "ls -la"`);
```

### VS Code Tasks

**Automated SSH tasks** use the environment variable:

```json
{
  "label": "Render: SSH Connect to Main Bot",
  "type": "shell",
  "command": "ssh",
  "args": [
    "srv-d3snk2ndiees73cn709g@ssh.virginia.render.com"
  ]
}
```

SSH config automatically loads `~/.ssh/render_ed25519` for `*.render.com` hosts.

### PowerShell Scripts

All render_ssh_*.ps1 scripts use the automated configuration:

```powershell
# Scripts automatically detect:
# 1. SSH key from RENDER_SSH_KEY_PATH environment variable
# 2. SSH config from ~/.ssh/config
# 3. Known hosts from ~/.ssh/known_hosts
```

## Best Practices

### ✅ DO

- Use automated setup for consistency
- Rotate keys every 90 days
- Monitor SSH access logs
- Use environment variables for key paths
- Keep private keys owner-only readable
- Test SSH access after setup

### ❌ DON'T

- Commit private keys to Git
- Share private keys via email/chat
- Use same key across multiple accounts
- Skip key rotation
- Ignore permission warnings
- Store keys in cloud storage without encryption

## npm Scripts Reference

```json
{
  "render:ssh-setup": "Automated SSH key setup (no interaction)",
  "render:ssh-connect": "Interactive SSH connection menu",
  "render:ssh-disk": "Check disk usage on main bot",
  "render:ssh-store": "View /Store directory contents",
  "render:ssh-exec": "Execute custom command on service"
}
```

## Related Documentation

- **Main Operations:** `OPERATIONS.md` - Service matrix and deployment
- **Environment Setup:** `docs/ai-env-setup.md` - Environment configuration
- **Deployment:** `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` - Pre-deployment validation
- **SSH Scripts:** `scripts/ROUTER.md` - Complete script inventory

## Changelog

### 2025-11-17
- ✅ Added automated setup script (render_ssh_auto_setup.ps1)
- ✅ Integrated SSH key into environment file
- ✅ Configured Windows registry for ssh-agent
- ✅ Set RENDER_SSH_KEY_PATH environment variable
- ✅ Created comprehensive documentation

### Previous
- Initial SSH setup script (render_ssh_setup.ps1)
- SSH connection script (render_ssh_connect.ps1)
- SSH execution script (render_ssh_exec.ps1)

---

**Document Version:** 1.0  
**Maintained By:** Automation Team  
**Review Schedule:** Quarterly (with key rotation)
