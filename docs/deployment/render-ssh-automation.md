# Render SSH Automation Suite

Complete PowerShell-based SSH automation for Render services - connect, execute commands, transfer files, and create tunnels.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Scripts](#scripts)
- [Use Cases](#use-cases)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

## Quick Start

```powershell
# 1. Generate SSH key and setup
npm run render:ssh-setup

# 2. Add public key to Render Dashboard
# (Key is copied to clipboard and displayed)
# Go to: https://dashboard.render.com/settings#ssh-public-keys

# 3. Connect to a service
npm run render:ssh-connect

# 4. Execute a command
npm run render:ssh-exec -- -ServiceId "srv-abc123" -Command "ls -la /Store"
```

## Prerequisites

- **Windows 10/11** with PowerShell 5.1+ or PowerShell Core 7+
- **OpenSSH Client** (included in Windows 10 1809+)
  - Verify: `ssh -V`
  - Install if needed: Settings → Apps → Optional Features → OpenSSH Client
- **Render API Key** (for interactive service selection)
  - Create at: https://dashboard.render.com/u/settings/api-keys
  - Add to `secrets/Infinity-Gauntlet.env` as `RENDER_API_KEY=rnd_...`

## Setup

### 1. Generate SSH Key

```powershell
npm run render:ssh-setup
```

**What this does:**
- Creates Ed25519 SSH key pair in `~/.ssh/id_ed25519_render`
- Sets proper permissions (Windows ACL)
- Configures `~/.ssh/config` with Render host aliases
- Adds Render's public keys to `~/.ssh/known_hosts`
- Copies public key to clipboard

**Options:**
```powershell
# Custom key name
powershell scripts/render_ssh_setup.ps1 -KeyName "id_render_production"

# Use RSA instead of Ed25519
powershell scripts/render_ssh_setup.ps1 -KeyType "rsa"

# Overwrite existing key
powershell scripts/render_ssh_setup.ps1 -Force
```

### 2. Add Public Key to Render

1. Go to [Render Dashboard → Account Settings → SSH Public Keys](https://dashboard.render.com/settings#ssh-public-keys)
2. Click **+ Add SSH Public Key**
3. Paste your public key (copied to clipboard by setup script)
4. Give it a descriptive name (e.g., "Windows Workstation")
5. Click **Add SSH Public Key**

### 3. Verify Connection

```powershell
# Interactive service selection
npm run render:ssh-connect

# Or connect directly
npm run render:ssh-exec -- -ServiceId "srv-abc123" -Command "echo 'Hello from Render!'"
```

## Scripts

### render_ssh_setup.ps1

**Generate and configure SSH keys for Render**

```powershell
npm run render:ssh-setup
```

**Advanced Usage:**
```powershell
powershell scripts/render_ssh_setup.ps1 -KeyName "custom_key" -KeyType "ed25519" -Force
```

**Parameters:**
- `-KeyName` - SSH key filename (default: `id_ed25519_render`)
- `-KeyType` - Key type: `ed25519`, `ecdsa`, or `rsa` (default: `ed25519`)
- `-Force` - Overwrite existing key

**Output:**
- SSH key pair created in `~/.ssh/`
- Public key copied to clipboard
- SSH config updated with Render hosts
- Known hosts updated with Render fingerprints

---

### render_ssh_connect.ps1

**Interactive SSH connection to Render services**

```powershell
# Interactive menu
npm run render:ssh-connect

# Connect to specific service
powershell scripts/render_ssh_connect.ps1 -ServiceId "srv-d3snk2ndiees73cn709g"

# Connect to specific instance
powershell scripts/render_ssh_connect.ps1 -ServiceId "srv-abc123" -Instance "d4e5f"

# Execute command and exit
powershell scripts/render_ssh_connect.ps1 -ServiceId "srv-abc123" -Command "ls -la"
```

**Parameters:**
- `-ServiceId` - Service ID (omit for interactive selection)
- `-Instance` - Specific instance slug (optional)
- `-Region` - Render region (default: `oregon`)
- `-Command` - Execute command and exit (non-interactive)

**Regions:**
- `oregon` (default)
- `ohio`
- `virginia`
- `frankfurt`
- `singapore`

---

### render_ssh_exec.ps1

**Execute commands remotely and capture output**

```powershell
# Basic command
npm run render:ssh-exec -- -ServiceId "srv-abc123" -Command "ls -la /Store"

# With timeout
powershell scripts/render_ssh_exec.ps1 `
  -ServiceId "srv-abc123" `
  -Command "node --version" `
  -Timeout 60
```

**Parameters:**
- `-ServiceId` - Service ID (required)
- `-Command` - Command to execute (required)
- `-Region` - Render region (default: `oregon`)
- `-Instance` - Specific instance slug (optional)
- `-Timeout` - Command timeout in seconds (default: 300)

**Output:**
- Command stdout/stderr
- Exit code
- Duration

---

### render_ssh_transfer.ps1

**Transfer files via SCP**

```powershell
# Upload file
npm run render:ssh-transfer -- `
  -ServiceId "srv-abc123" `
  -Source "./config.json" `
  -Destination "/Store/config.json" `
  -Direction upload

# Download file
powershell scripts/render_ssh_transfer.ps1 `
  -ServiceId "srv-abc123" `
  -Source "/Store/logs/app.log" `
  -Destination "./logs/app.log" `
  -Direction download

# Upload directory (recursive)
powershell scripts/render_ssh_transfer.ps1 `
  -ServiceId "srv-abc123" `
  -Source "./dist/" `
  -Destination "/opt/render/project/custom/" `
  -Direction upload `
  -Recursive
```

**Parameters:**
- `-ServiceId` - Service ID (required)
- `-Source` - Source path (required)
- `-Destination` - Destination path (required)
- `-Direction` - `upload` or `download` (required)
- `-Region` - Render region (default: `oregon`)
- `-Recursive` - Transfer directories recursively

**Common Paths:**
- `/Store/` - Persistent disk (if mounted)
- `/opt/render/project/src/` - Application source
- `/tmp/` - Temporary storage
- `/var/log/` - System logs

---

### render_ssh_tunnel.ps1

**Create SSH tunnels (port forwarding)**

```powershell
# Local port forwarding (access remote service locally)
npm run render:ssh-tunnel -- `
  -ServiceId "srv-abc123" `
  -LocalPort 5432 `
  -RemotePort 5432 `
  -Type local

# Dynamic SOCKS proxy (route traffic through Render)
powershell scripts/render_ssh_tunnel.ps1 `
  -ServiceId "srv-abc123" `
  -LocalPort 1080 `
  -Type dynamic

# Remote port forwarding (expose local service to Render)
powershell scripts/render_ssh_tunnel.ps1 `
  -ServiceId "srv-abc123" `
  -LocalPort 8080 `
  -RemotePort 9090 `
  -Type remote
```

**Parameters:**
- `-ServiceId` - Service ID (required)
- `-LocalPort` - Local port number (required)
- `-RemotePort` - Remote port number (required for local/remote types)
- `-RemoteHost` - Remote host (default: `localhost`)
- `-Type` - Tunnel type: `local`, `remote`, or `dynamic` (required)
- `-Region` - Render region (default: `oregon`)

**Tunnel Types:**

| Type | Use Case | Example |
|------|----------|---------|
| **local** | Access remote service on local machine | Database tunneling: connect to Render DB via localhost:5432 |
| **remote** | Expose local service to Render | Development webhook testing: Render service accesses your localhost:3000 |
| **dynamic** | SOCKS5 proxy | Route browser/app traffic through Render network |

---

## Use Cases

### 1. Database Access

**Connect to Render PostgreSQL via tunnel:**

```powershell
# Start tunnel
npm run render:ssh-tunnel -- `
  -ServiceId "srv-abc123" `
  -LocalPort 5432 `
  -RemotePort 5432 `
  -Type local

# In another terminal, connect with psql
psql -h localhost -p 5432 -U your_user -d your_db
```

### 2. Debug Production Issues

**Execute diagnostic commands:**

```powershell
# Check disk usage
npm run render:ssh-exec -- `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "df -h"

# View running processes
npm run render:ssh-exec -- `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "ps aux | head -20"

# Check Node.js version
npm run render:ssh-exec -- `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "node --version"

# Inspect environment
npm run render:ssh-exec -- `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "env | grep DATABASE"
```

### 3. File Management

**Download logs:**

```powershell
npm run render:ssh-transfer -- `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Source "/Store/logs/" `
  -Destination "./production-logs/" `
  -Direction download `
  -Recursive
```

**Upload configuration:**

```powershell
npm run render:ssh-transfer -- `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Source "./configs/production.json" `
  -Destination "/Store/config/production.json" `
  -Direction upload
```

### 4. Interactive Debugging

**Start an interactive shell session:**

```powershell
# Select service interactively
npm run render:ssh-connect

# Or connect directly
powershell scripts/render_ssh_connect.ps1 -ServiceId "srv-d3snk2ndiees73cn709g"
```

**Inside the shell:**
```bash
# Navigate filesystem
cd /opt/render/project/src
ls -la

# Check application status
pm2 list  # If using PM2
systemctl status your-service  # For systemd services

# View logs
tail -f /var/log/your-app.log

# Run application commands
npx prisma migrate status
npm run some-script
```

### 5. One-Time Maintenance Tasks

**Run database migrations:**

```powershell
npm run render:ssh-exec -- `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "npx prisma migrate deploy"
```

**Clear cache:**

```powershell
npm run render:ssh-exec -- `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "rm -rf /Store/cache/*"
```

**Restart application process:**

```powershell
npm run render:ssh-exec -- `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "pm2 restart all"
```

### 6. Development Workflows

**Test webhook locally:**

```powershell
# Expose local dev server to Render
npm run render:ssh-tunnel -- `
  -ServiceId "srv-abc123" `
  -LocalPort 3000 `
  -RemotePort 8080 `
  -Type remote

# Render service can now reach your localhost:3000 via its localhost:8080
```

**Deploy and test immediately:**

```powershell
# Deploy
npm run render:deploy

# Wait for deployment
Start-Sleep -Seconds 60

# Test deployment
npm run render:ssh-exec -- `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "curl -s http://localhost:10000/health"
```

## Troubleshooting

### Permission Denied (publickey)

**Symptoms:**
```
Permission denied (publickey).
```

**Solutions:**

1. **Verify key is loaded:**
```powershell
ssh-add -l
# Should show: 256 SHA256:... your_name@computer (ED25519)
```

2. **Add key to ssh-agent:**
```powershell
# Start ssh-agent
Start-Service ssh-agent
Set-Service ssh-agent -StartupType Automatic

# Add key
ssh-add ~/.ssh/id_ed25519_render
```

3. **Verify key in Render Dashboard:**
   - Go to: https://dashboard.render.com/settings#ssh-public-keys
   - Ensure your public key is listed
   - Compare fingerprint with `ssh-keygen -lf ~/.ssh/id_ed25519_render.pub`

4. **Test with verbose output:**
```powershell
ssh -v srv-abc123@ssh.oregon.render.com
```

### Connection Timeout

**Symptoms:**
```
Connection timed out
```

**Solutions:**

1. **Check service is running:**
```powershell
npm run render:status
```

2. **Verify region:**
```powershell
# Get service region from status
npm run render:status

# Use correct region in command
powershell scripts/render_ssh_connect.ps1 -ServiceId "srv-abc123" -Region "virginia"
```

3. **Check firewall/network:**
   - Ensure port 22 (SSH) is not blocked
   - Test from different network if possible

### Service Not Found

**Symptoms:**
```
Service 'srv-abc123' not found
```

**Solutions:**

1. **List available services:**
```powershell
npm run render:status
```

2. **Verify service type:**
   - SSH only works for **paid web services** and **background workers**
   - Free web services do NOT support SSH
   - Cron jobs have limited SSH support (temporary instances)

3. **Check service is not suspended:**
```powershell
npm run render:status
# Look for "suspended" status
```

### File Transfer Fails

**Symptoms:**
```
scp: /path/to/file: Permission denied
```

**Solutions:**

1. **Check path permissions:**
```powershell
# Check remote permissions
npm run render:ssh-exec -- `
  -ServiceId "srv-abc123" `
  -Command "ls -ld /Store/"
```

2. **Ensure persistent disk is mounted:**
   - Check `render.yaml` for disk configuration
   - Verify mount path matches your destination

3. **Use absolute paths:**
```powershell
# Bad: relative path
-Destination "Store/file.txt"

# Good: absolute path
-Destination "/Store/file.txt"
```

### Tunnel Connection Drops

**Symptoms:**
```
channel 2: open failed: connect failed: Connection refused
```

**Solutions:**

1. **Verify remote service is listening:**
```powershell
npm run render:ssh-exec -- `
  -ServiceId "srv-abc123" `
  -Command "netstat -tulpn | grep 5432"
```

2. **Check RemoteHost setting:**
```powershell
# If service listens on all interfaces (0.0.0.0):
-RemoteHost "localhost"

# If service listens on specific IP:
-RemoteHost "10.0.0.5"
```

3. **Add keepalive:**
   - SSH config already includes `ServerAliveInterval 60`
   - If still dropping, reduce interval: edit `~/.ssh/config`

## Security Best Practices

### 1. Key Management

**DO:**
- ✅ Use Ed25519 keys (smaller, faster, more secure than RSA)
- ✅ Add passphrase to private key for extra security:
  ```powershell
  ssh-keygen -p -f ~/.ssh/id_ed25519_render
  ```
- ✅ Use separate keys for different environments (dev/staging/prod)
- ✅ Rotate keys periodically (every 6-12 months)
- ✅ Delete keys from Render Dashboard when no longer needed

**DON'T:**
- ❌ Share private keys via email/Slack/Git
- ❌ Store private keys in cloud storage without encryption
- ❌ Use the same key for multiple services/providers
- ❌ Commit keys to version control

### 2. Connection Security

**DO:**
- ✅ Use SSH config with `StrictHostKeyChecking accept-new`
- ✅ Verify host fingerprints on first connection
- ✅ Use `ServerAliveInterval` to detect dropped connections
- ✅ Enable verbose mode (`-v`) when troubleshooting

**DON'T:**
- ❌ Disable host key checking (`-o StrictHostKeyChecking=no`)
- ❌ Ignore host key mismatch warnings
- ❌ Run untrusted commands from unknown sources

### 3. Access Control

**DO:**
- ✅ Use least privilege principle (only grant SSH to necessary team members)
- ✅ Use Render's workspace roles to control access
- ✅ Monitor SSH usage via Render audit logs
- ✅ Revoke access immediately when team members leave

**DON'T:**
- ❌ Share Render account credentials
- ❌ Use SSH for automated processes (use Render API or one-off jobs instead)
- ❌ Leave SSH sessions open indefinitely

### 4. Data Protection

**DO:**
- ✅ Encrypt sensitive files before uploading
- ✅ Use Render environment variables for secrets (not files)
- ✅ Audit transferred files for sensitive data
- ✅ Delete temporary files after use

**DON'T:**
- ❌ Transfer passwords or API keys as plain text
- ❌ Store sensitive data on persistent disks without encryption
- ❌ Leave debug logs containing sensitive data

### 5. Compliance

For **HIPAA, SOC 2, or other compliance requirements:**

- ✅ Document all SSH access in audit logs
- ✅ Use strong passphrases on private keys
- ✅ Implement key rotation policies
- ✅ Restrict SSH access to specific IP addresses (if possible)
- ✅ Monitor and alert on SSH usage anomalies

## Advanced Topics

### SSH Config Customization

Edit `~/.ssh/config` to customize behavior:

```sshconfig
# Custom key per environment
Host render-prod-*
    IdentityFile ~/.ssh/id_render_production
    
Host render-dev-*
    IdentityFile ~/.ssh/id_render_development

# Connection multiplexing (reuse connections)
Host render-*
    ControlMaster auto
    ControlPath ~/.ssh/control-%r@%h:%p
    ControlPersist 10m

# Proxy jump (access via bastion)
Host render-internal-*
    ProxyJump bastion.example.com
```

### Automated Workflows

**Health check script:**

```powershell
# health-check.ps1
$services = @("srv-abc123", "srv-def456")

foreach ($svc in $services) {
    Write-Host "Checking $svc..." -ForegroundColor Cyan
    
    $result = & powershell scripts/render_ssh_exec.ps1 `
        -ServiceId $svc `
        -Command "curl -sf http://localhost:10000/health || echo FAILED"
    
    if ($result -match "FAILED") {
        Write-Host "  ❌ Health check failed!" -ForegroundColor Red
        # Send alert...
    } else {
        Write-Host "  ✅ Healthy" -ForegroundColor Green
    }
}
```

**Backup script:**

```powershell
# backup-store.ps1
param([string]$ServiceId)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backups/$timestamp"

New-Item -ItemType Directory -Path $backupDir -Force

Write-Host "Backing up /Store from $ServiceId..." -ForegroundColor Cyan

& powershell scripts/render_ssh_transfer.ps1 `
    -ServiceId $ServiceId `
    -Source "/Store/" `
    -Destination $backupDir `
    -Direction download `
    -Recursive

Write-Host "✅ Backup complete: $backupDir" -ForegroundColor Green
```

## Related Documentation

- [Render SSH Documentation](https://render.com/docs/ssh)
- [Render One-Off Jobs](./render-one-off-jobs.md)
- [Render API Integration](./vscode-render-integration.md)
- [Render CLI](https://render.com/docs/cli)

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review [Render SSH Docs](https://render.com/docs/ssh)
3. Open an issue in the repository
4. Contact Render Support: support@render.com
