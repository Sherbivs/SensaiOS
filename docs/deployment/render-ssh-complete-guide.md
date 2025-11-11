# Render SSH Access - Complete Guide

**Date:** 2025-11-10  
**Source:** https://render.com/docs/ssh  
**Purpose:** Comprehensive guide for SSH access to Render services in the Infinity Gauntlet project

---

## Table of Contents

1. [Overview](#overview)
2. [Compatible Services](#compatible-services)
3. [SSH Setup](#ssh-setup)
4. [Starting SSH Sessions](#starting-ssh-sessions)
5. [Troubleshooting](#troubleshooting)
6. [Render Public Key Fingerprints](#render-public-key-fingerprints)
7. [Advanced Usage](#advanced-usage)
8. [Project-Specific Configuration](#project-specific-configuration)

---

## Overview

Render provides two methods to access running services:
1. **Dashboard Shell** — Web-based shell access via Render Dashboard
2. **SSH from Terminal** — Direct SSH connections from local machine

### Access Methods

**SSH from Terminal (Setup Required):**
- Generate SSH key pair (Ed25519 recommended)
- Add public key to Render account
- Connect via `ssh` command or Render CLI

---

## Compatible Services

| Service Type | Dashboard Shell | SSH from Terminal |
|--------------|----------------|-------------------|
| **Paid Web Service** | ✅ Yes | ✅ Yes |
| **Private Service** | ✅ Yes | ✅ Yes |
| **Background Worker** | ✅ Yes | ✅ Yes |
| **Cron Job** | ⚠️ Limited (temporary instance) | ❌ No |
| **Free Web Service** | ❌ No | ❌ No |
| **Static Sites** | ❌ No | ❌ No |
| **Datastores (PostgreSQL, Redis)** | ❌ No | ❌ No |

### Infinity Gauntlet Services (All Compatible ✅)

- **Infinity-Gauntlet** (Background Worker) — srv-d3snk2ndiees73cn709g — Main Discord bot (render.yaml: `infinity-gauntlet-bots`)
- **infinity-gauntlet-bot** (Web Service) — Check `render.yaml`
- **infinity-gauntlet-security** (Background Worker) — Check `render.yaml`
- **infinity-gauntlet-outbox** (Background Worker) — Check `render.yaml`
- **infinity-gauntlet-cache** (Background Worker) — Check `render.yaml`
- **infinity-gauntlet-data-pipeline** (Background Worker) — Check `render.yaml`

---

## SSH Setup

### Step 1: Generate SSH Key Pair

**Skip this if you already have an SSH key (check with `ls ~/.ssh/id_ed25519.pub`)**

#### Windows (PowerShell):
```powershell
# Generate Ed25519 key pair
ssh-keygen -t ed25519 -f $HOME\.ssh\id_ed25519

# Optional: Provide passphrase when prompted (recommended for security)
# Press Enter for no passphrase (less secure but more convenient)

# Verify files created
Get-ChildItem $HOME\.ssh\id_ed25519*
```

#### macOS/Linux (bash/zsh):
```bash
# Generate Ed25519 key pair
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519

# Optional: Provide passphrase when prompted
# Press Enter for no passphrase

# Verify files created
ls -la ~/.ssh/id_ed25519*
```

**Generated Files:**
- `~/.ssh/id_ed25519` — **Private key** (NEVER share this)
- `~/.ssh/id_ed25519.pub` — **Public key** (safe to share with Render)

### Step 2: Add Public Key to Render Account

1. **Copy public key to clipboard:**

   **Windows (PowerShell):**
   ```powershell
   Get-Content $HOME\.ssh\id_ed25519.pub | Set-Clipboard
   Write-Host "✅ Public key copied to clipboard"
   ```

   **macOS:**
   ```bash
   pbcopy < ~/.ssh/id_ed25519.pub
   echo "✅ Public key copied to clipboard"
   ```

   **Linux:**
   ```bash
   cat ~/.ssh/id_ed25519.pub
   # Manually copy the output
   ```

2. **Add to Render Dashboard:**
   - Go to https://dashboard.render.com/settings#ssh-public-keys
   - Click **"+ Add SSH Public Key"**
   - Enter descriptive name: `"Windows Workstation"` or `"Personal Laptop"`
   - Paste public key into "Key" field
   - Click **"Add SSH Public Key"**

3. **Verify key added:**
   - Public key should appear in SSH Public Keys list
   - Note the key fingerprint (e.g., `SHA256:HBAu8kfND5/9k0LzOi0KR81H4RbqCIFrBbzjR5bd8`)

**✅ Setup Complete!** You can now SSH into Render services.

---

## Starting SSH Sessions

### Method 1: Render CLI (Recommended)

**Install Render CLI:**
```bash
npm install -g render
# or
brew install render
```

**Login:**
```bash
render login
```

**Connect to Service (Interactive):**
```bash
render ssh
# Shows menu of SSH-compatible services
# Use arrow keys to select service, press Enter
```

**Connect to Specific Service (Direct):**
```bash
render ssh srv-d3snk2ndiees73cn709g
```

### Method 2: Direct SSH Command

**Basic Connection:**
```bash
ssh <service-id>@ssh.<region>.render.com
```

**Infinity Gauntlet Services:**
```bash
# Main bot worker (Virginia region)
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# Replace with your service IDs and regions
# Find service ID: Render Dashboard → Service → Settings → Service ID
# Find region: Render Dashboard → Service → Settings → Region
```

**Common Regions:**
- Virginia: `ssh.virginia.render.com`
- Oregon: `ssh.oregon.render.com`
- Ohio: `ssh.ohio.render.com`
- Frankfurt: `ssh.frankfurt.render.com`
- Singapore: `ssh.singapore.render.com`

### Method 3: Connect to Specific Instance

By default, SSH connects to a **random running instance**. For scaled services (multiple instances), connect to a specific instance:

```bash
# Random instance (default)
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# Specific instance (append 5-character instance slug)
ssh srv-d3snk2ndiees73cn709g-d4e5f@ssh.virginia.render.com
```

**Find Instance Slugs:**
- Service logs: `[instance-slug]` prefix on log lines
- Dashboard: Service → Logs → Filter by instance
- Metrics page: Instance dropdown

**Note:** You cannot SSH into an instance that is no longer running.

---

## Troubleshooting

### Issue 1: Permission Denied (publickey)

**Error:**
```
srv-d3snk2ndiees73cn709g@ssh.virginia.render.com: Permission denied (publickey).
```

**Causes:**
1. Public key not added to Render account
2. Wrong SSH key being used
3. SSH key not loaded into ssh-agent

**Solutions:**

#### Confirm Which SSH Key Is Being Used:
```bash
# Add verbose flag to see which key SSH is trying
ssh -v srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# Look for lines like:
# debug1: identity file /Users/YOUR_NAME/.ssh/id_ed25519 type 3
# debug1: Offering public key: /Users/YOUR_NAME/.ssh/id_ed25519
```

#### Confirm Keys Attached to Render Account:
```bash
# List keys loaded in ssh-agent
ssh-add -l

# Output example:
# 256 SHA256:SSH_KEY_FINGERPRINT YOUR_NAME@YOUR_HOST (ED25519)

# Compare this with keys listed in Render Dashboard:
# https://dashboard.render.com/settings#ssh-public-keys
```

#### Add Key to ssh-agent:
```bash
# Start ssh-agent (if not running)
eval "$(ssh-agent -s)"

# Add private key to agent
ssh-add ~/.ssh/id_ed25519

# Verify key added
ssh-add -l
```

#### Explicitly Specify Key:
```bash
# Use specific key file
ssh -i ~/.ssh/id_ed25519 srv-d3snk2ndiees73cn709g@ssh.virginia.render.com
```

### Issue 2: Connection Timeout

**Error:**
```
ssh: connect to host ssh.virginia.render.com port 22: Connection timed out
```

**Causes:**
1. Firewall blocking SSH port 22
2. Network restrictions (corporate VPN, etc.)
3. Wrong region specified

**Solutions:**
1. Check firewall allows outbound connections on port 22
2. Try different network (mobile hotspot, different WiFi)
3. Verify correct region in hostname

### Issue 3: Host Key Verification Failed

**Error:**
```
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
```

**Cause:**
Render's host keys changed or `known_hosts` file has stale entry.

**Solution:**
```bash
# Remove old host key
ssh-keygen -R ssh.virginia.render.com

# Or manually edit known_hosts
# Remove line matching ssh.virginia.render.com

# Retry connection (will prompt to accept new key)
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com
```

**Verify Render's Host Key Fingerprints:**
Compare SSH prompt fingerprint with official Render fingerprints (see next section).

---

## Render Public Key Fingerprints

Use these to verify you're connecting to authentic Render servers.

### SHA256 Fingerprints (Recommended)

| Region | Fingerprint |
|--------|-------------|
| **Oregon** | `SHA256:KkZPgnApmttFYSkdJsCi7B01sgZPMI6kY53MDbbanGM` |
| **Ohio** | `SHA256:kRDsLlrHqOyqso58sEKyO6ZFMPj7p24zfNxYJ42yXGI` |
| **Virginia** | `SHA256:NCpSwboPnqL/Nvyy2Qc8Kgzpc3P/f3w5wDphhc+UZO0` |
| **Frankfurt** | `SHA256:dBRrCEA0tBkvaYLzzDw/mzaANw6nUJO961Zx806spZs` |
| **Singapore** | `SHA256:CUlRyv4TZ0vmHwmhsJkII/pz2cO4IgvR+ykqnRsOQFs` |

### Add to known_hosts (Optional - Skip Host Verification)

Add these entries to `~/.ssh/known_hosts` to bypass host verification:

```bash
# Oregon
ssh.oregon.render.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFON8eay2FgHDBIVOLxWn/AWnsDJhCVvlY1igWEFoLD2

# Ohio
ssh.ohio.render.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINMjC1BfZQ3CYotN1/EqI48hvBpZ80zfgRdK8NpP58v1

# Virginia
ssh.virginia.render.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ6uO0jKQX9IjefnLz+pxTgfPhsPBhNuvxmvCFrxqxAM

# Frankfurt
ssh.frankfurt.render.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILg6kMvQOQjMREehk1wvBKsfe1I3+acRuS8cVSdLjinK

# Singapore
ssh.singapore.render.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGVcVcsy7RXA60ZyHs/OMS5aQj4YQy7Qn2nJCXHz4zLA
```

---

## Advanced Usage

### Supported Key Types

Render supports the following SSH key types:

1. **Ed25519** ✅ Recommended (smallest keys, best security)
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519
   ```

2. **ECDSA** ✅ Good (smaller than RSA, widely supported)
   ```bash
   ssh-keygen -t ecdsa -b 521 -f ~/.ssh/id_ecdsa
   ```

3. **RSA** ✅ Compatible (larger keys, widely supported)
   ```bash
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa
   ```

4. **Hardware Keys (U2F/FIDO)** ✅ YubiKey support
   ```bash
   ssh-keygen -t ed25519-sk -f ~/.ssh/id_ed25519_sk
   ssh-keygen -t ecdsa-sk -f ~/.ssh/id_ecdsa_sk
   ```

### Docker-Specific Configuration

If your service runs a **Docker image**, additional configuration is required:

#### Requirements:

1. **Include OpenSSH in image:**
   ```dockerfile
   # Debian/Ubuntu
   RUN apt-get update && apt-get install -y openssh-server
   
   # Alpine
   RUN apk add --no-cache openssh-server
   ```

2. **Create .ssh directory with correct permissions:**
   ```dockerfile
   # For root user
   RUN mkdir -p /root/.ssh && chmod 0700 /root/.ssh
   
   # For non-root user
   RUN mkdir -p /home/myuser/.ssh && \
       chmod 0700 /home/myuser/.ssh && \
       chown -R myuser:myuser /home/myuser/.ssh
   ```

3. **Enable shell access for non-root users:**
   ```dockerfile
   # Switch to root to modify user
   USER root
   
   # Give myuser shell access
   RUN usermod -s /bin/bash myuser
   
   # Switch back to non-root user
   USER myuser
   ```

4. **Unlock root account (if using root):**
   ```dockerfile
   RUN usermod --unlock root
   # or
   RUN passwd -u root
   ```

5. **Do NOT mount persistent disk to $HOME:**
   - If service uses persistent disk, mount to directory other than user's $HOME
   - Example: `/data`, `/mnt/disk`, `/app/storage`

### Cron Job Connections

When connecting to a **cron job** from Dashboard Shell:
- ✅ Render spins up **temporary instance** with latest build
- ✅ Instance includes cron job's configuration
- ❌ Does **NOT** automatically execute cron command
- ⚠️ Instance is **deprovisioned** when shell session closes
- ❌ Cannot connect to actual scheduled cron instances

**Use Case:** Debug cron job environment, test commands manually

### Automatic Session Closure

Render **automatically closes SSH sessions** in these cases:

1. **Service Redeployment:**
   - Service redeployed for any reason
   - Service manually restarted
   - Sessions close immediately

2. **Infrastructure Maintenance:**
   - Scheduled maintenance on SSH infrastructure
   - **1-hour warning** before closure
   - Active sessions get notification

**Best Practice:** For long-running commands, use [one-off jobs](https://render.com/docs/one-off-jobs) instead of SSH.

### Memory Usage

SSH sessions use service's allocated memory:

| Component | Memory Usage |
|-----------|--------------|
| SSH access (base) | ~2 MB |
| Each active session | ~3 MB |
| Each bash process | ~3.5 MB |

**Example (2 SSH sessions running bash):**
- SSH base: 2 MB
- 2 sessions: 2 × 3 MB = 6 MB
- 2 bash processes: 2 × 3.5 MB = 7 MB
- **Total: ~15 MB**

**Impact:** For services with tight memory limits, SSH may push usage over threshold.

---

## Project-Specific Configuration

### Infinity Gauntlet SSH Access

#### Current Setup Status:

**SSH Key:**
- ✅ Public key registered in Render Dashboard
- ✅ Name: "Windows Workstation"
- ✅ Fingerprint: `SHA256:HBAu8kfND5/9k0LzOi0KR81H4RbqCIFrBbzjR5bd8`
- ⚠️ Private key location: `$HOME\.ssh\id_ed25519` (verify exists)

**Primary Service:**
- Service: `Infinity-Gauntlet` (Render API name - capital letters)
- Worker Name: `infinity-gauntlet-bots` (render.yaml definition)
- ID: `srv-d3snk2ndiees73cn709g`
- Region: Virginia
- Type: Background Worker (SSH compatible ✅)
- Dashboard: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g

#### Quick Connect:

```bash
# Direct SSH
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# View logs
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "tail -100 /var/log/service.log"

# Check resource usage
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "df -h && free -h"

# View Store directory
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "ls -lah /Store/"

# Check Resource Monitor logs
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "grep -i 'resource\|health\|monitor' /var/log/service.log | tail -50"
```

#### Automated Scripts:

The project includes PowerShell scripts for SSH automation:

**Setup SSH keys (one-time):**
```powershell
pwsh -File scripts/render_ssh_setup.ps1
```

**Connect interactively:**
```powershell
pwsh -File scripts/render_ssh_connect.ps1 -ServiceId "srv-d3snk2ndiees73cn709g"
```

**Execute remote command:**
```powershell
pwsh -File scripts/render_ssh_exec.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "df -h"
```

**Check disk usage:**
```powershell
pwsh -File scripts/render_ssh_exec.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "du -sh /Store/*"
```

#### Common Use Cases:

**1. Verify Resource Monitor Deployment:**
```bash
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com \
  "journalctl -u render -n 200 | grep -E 'Resource Manager|Resource monitor|Health Check'"
```

**2. Check Application Logs:**
```bash
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com \
  "tail -200 /opt/render/project/src/.logs/out.log"
```

**3. Inspect Store Directory:**
```bash
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com \
  "ls -lah /Store/ && du -sh /Store/*"
```

**4. Check Memory Usage:**
```bash
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com \
  "ps aux --sort=-%mem | head -20"
```

**5. Test Database Connection:**
```bash
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com \
  "psql \$PROD_DATABASE_URL -c 'SELECT COUNT(*) FROM \"Species\";'"
```

#### Troubleshooting Project SSH:

**If "Permission denied":**
1. Verify key exists: `Get-ChildItem $HOME\.ssh\id_ed25519.pub`
2. Check key registered: https://dashboard.render.com/settings#ssh-public-keys
3. Re-run setup: `pwsh -File scripts/render_ssh_setup.ps1`

**If "Connection timeout":**
1. Check service is running: Render Dashboard → Service Status
2. Verify service ID correct: `srv-d3snk2ndiees73cn709g`
3. Verify region correct: `ssh.virginia.render.com`

**If "Command not found":**
1. Service may use minimal image without expected tools
2. Check available commands: `ssh srv-... "which bash ls ps df"`
3. Install tools if needed (requires Dockerfile changes)

---

## Best Practices

### Security:

1. ✅ **Use Ed25519 keys** (smaller, faster, more secure than RSA)
2. ✅ **Add passphrase** to private key (protects if key stolen)
3. ✅ **Never share private key** (ends in `.pub` is public, no extension is private)
4. ✅ **Use descriptive key names** in Render ("Work Laptop", "CI Server")
5. ✅ **Rotate keys periodically** (every 6-12 months)
6. ✅ **Remove old keys** from Render account when machine decommissioned

### Performance:

1. ✅ **Use one-off jobs** for long-running commands (don't hold SSH session open)
2. ✅ **Monitor memory usage** (SSH uses ~5-15 MB per session)
3. ✅ **Close sessions** when done (frees memory)
4. ✅ **Use Render CLI** (`render ssh`) for better UX
5. ⚠️ **Avoid SSH for automation** (use Render API instead)

### Operations:

1. ✅ **Use Dashboard Shell** for quick checks (no setup required)
2. ✅ **Use SSH** for scripted operations (automation, debugging)
3. ✅ **Document service IDs** in project README (avoid hunting for IDs)
4. ✅ **Create wrapper scripts** for common operations (see `scripts/render_ssh_*`)
5. ✅ **Log SSH sessions** for audit trail (when accessing production)

---

## Quick Reference

### Common Commands:

```bash
# Generate SSH key
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519

# Copy public key (macOS)
pbcopy < ~/.ssh/id_ed25519.pub

# Copy public key (Windows)
Get-Content $HOME\.ssh\id_ed25519.pub | Set-Clipboard

# List ssh-agent keys
ssh-add -l

# Add key to ssh-agent
ssh-add ~/.ssh/id_ed25519

# Connect to service
ssh <service-id>@ssh.<region>.render.com

# Connect with specific key
ssh -i ~/.ssh/id_ed25519 <service-id>@ssh.<region>.render.com

# Execute remote command
ssh <service-id>@ssh.<region>.render.com "command here"

# Verbose connection (debug)
ssh -v <service-id>@ssh.<region>.render.com

# Remove old host key
ssh-keygen -R ssh.virginia.render.com
```

### Project Commands:

```powershell
# Setup SSH (one-time)
pwsh -File scripts/render_ssh_setup.ps1

# Connect to main bot
pwsh -File scripts/render_ssh_connect.ps1 -ServiceId "srv-d3snk2ndiees73cn709g"

# Execute command
pwsh -File scripts/render_ssh_exec.ps1 -ServiceId "srv-d3snk2ndiees73cn709g" -Command "df -h"

# Check logs
pwsh -File scripts/render_ssh_exec.ps1 -ServiceId "srv-d3snk2ndiees73cn709g" -Command "tail -100 /var/log/service.log"
```

---

## Related Documentation

**Render Official Docs:**
- SSH Documentation: https://render.com/docs/ssh
- CLI Documentation: https://render.com/docs/cli
- One-Off Jobs: https://render.com/docs/one-off-jobs
- Dashboard Shell: https://render.com/docs/render-dashboard

**Project Documentation:**
- `docs/environment/render-credentials-reference.md` — API keys and SSH fingerprints (gitignored)
- `docs/environment/render-access-configuration.md` — Access setup template
- `docs/deployment/render-ssh-automation.md` — Automation scripts documentation
- `docs/deployment/ssh-protocol.md` — SSH protocol details
- `scripts/render_ssh_setup.ps1` — SSH key registration script
- `scripts/render_ssh_connect.ps1` — Interactive SSH connection
- `scripts/render_ssh_exec.ps1` — Remote command execution

---

**Last Updated:** 2025-11-10  
**Status:** Comprehensive guide based on official Render documentation  
**Next Review:** When Render updates SSH documentation or changes host keys
