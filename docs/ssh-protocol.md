# SSH Protocol Documentation

**Last Updated**: 2025-11-10  
**Status**: Production-Ready  
**Region**: Virginia (Primary)

## Overview

This document describes the SSH protocol implementation for accessing Render services directly from VS Code and PowerShell. The system uses Ed25519 key authentication for secure, automated remote operations.

## Architecture

```
Local Workstation                  Render Infrastructure
-----------------                  ---------------------
PowerShell/VS Code    ──SSH──>    ssh.virginia.render.com:22
                                           │
                                           ├─> srv-d3snk2ndiees73cn709g
                                           │   (Infinity-Gauntlet worker)
                                           │   ├─> /Store/* (persistent disk)
                                           │   ├─> /opt/render/project/src/
                                           │   └─> Running processes
                                           │
                                           └─> Other services...
```

## Authentication

### Key Type
- **Algorithm**: Ed25519 (modern, secure, fast)
- **Key Size**: 256-bit
- **Private Key**: `C:\Users\sherb\.ssh\id_ed25519_render`
- **Public Key**: `C:\Users\sherb\.ssh\id_ed25519_render.pub`
- **Fingerprint**: `SHA256:HBAu6kfND5/9kOLzOi0OKR01Hh4RbqCIFrBbzjR5bd8`

### Public Key Content
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMoXmzZylwDVXzHyGgTSd8woE+DESSs41CkcGRrW6fHa render-ssh-sherb
```

### Authorization
The public key is registered in the Render Dashboard under Account Settings → SSH Public Keys. This enables passwordless authentication to all services in the account.

## Connection Protocol

### Base Connection Pattern
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-{serviceId}@ssh.{region}.render.com
```

### Service Identifier
- **Service ID**: `srv-d3snk2ndiees73cn709g`
- **Service Name**: Infinity-Gauntlet (background worker)
- **Type**: background_worker

### Regional Endpoints

| Region | SSH Endpoint | Status |
|--------|-------------|---------|
| **virginia** (default) | `ssh.virginia.render.com` | ✅ Active |
| oregon | `ssh.oregon.render.com` | ⚪ Available |
| frankfurt | `ssh.frankfurt.render.com` | ⚪ Available |
| singapore | `ssh.singapore.render.com` | ⚪ Available |

**Note**: Ohio region was removed from our configuration as it's not used by our infrastructure.

## Connection Types

### 1. Interactive Shell
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com
```

Opens an interactive bash session on the remote service.

### 2. Command Execution
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "command"
```

Executes a single command and returns the output.

### 3. File Transfer (SCP)
```powershell
# Upload
scp -i "$env:USERPROFILE\.ssh\id_ed25519_render" local-file srv-d3snk2ndiees73cn709g@ssh.virginia.render.com:/remote/path

# Download
scp -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com:/remote/path local-file
```

### 4. Port Forwarding
```powershell
# Local forward (access remote port locally)
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" -L local_port:localhost:remote_port srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# Remote forward (expose local port remotely)
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" -R remote_port:localhost:local_port srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# Dynamic SOCKS proxy
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" -D local_port srv-d3snk2ndiees73cn709g@ssh.virginia.render.com
```

## Common Operations

### Check Service Health
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "ps aux | grep -E 'node|npm|bot' | grep -v grep"
```

### View Persistent Storage
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "ls -la /Store/"
```

### Retrieve Operational Logs
```powershell
# Security bot state
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "cat /Store/security-bot-state/current.json"

# Parse latest event
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "cat /Store/security-bot-state/current.json" | ConvertFrom-Json | Select-Object -ExpandProperty timeline | Select-Object -First 1
```

### Query Engine Database
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "sqlite3 /Store/engine-write.db 'SELECT COUNT(*) FROM battle_logs;'"
```

### Check Disk Usage
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "df -h"
```

### View Running Processes
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "ps aux"
```

## Automation Scripts

### PowerShell Scripts (scripts/)
- `render_ssh_setup.ps1` - SSH key generation and configuration
- `render_ssh_connect.ps1` - Interactive service connection
- `render_ssh_exec.ps1` - Remote command execution
- `render_ssh_transfer.ps1` - File upload/download via SCP
- `render_ssh_tunnel.ps1` - Port forwarding (local/remote/dynamic)

### npm Scripts
```json
{
  "render:ssh-setup": "pwsh -File scripts/render_ssh_setup.ps1",
  "render:ssh-connect": "pwsh -File scripts/render_ssh_connect.ps1",
  "render:ssh-exec": "pwsh -File scripts/render_ssh_exec.ps1",
  "render:ssh-transfer": "pwsh -File scripts/render_ssh_transfer.ps1",
  "render:ssh-tunnel": "pwsh -File scripts/render_ssh_tunnel.ps1"
}
```

### VS Code Tasks (.vscode/tasks.json)
- "Render SSH: Setup Keys"
- "Render SSH: Connect (Interactive)"
- "Render SSH: Connect to Main Bot"
- "Render SSH: Execute Command"
- "Render SSH: Check Disk Usage"
- "Render SSH: View /Store Contents"

## Data Access Patterns

### Persistent Storage Structure
```
/Store/
├── discord-cache/           # Discord API cache
├── engine-write.db          # Battle engine SQLite database
├── guild-member-timeout-config.json
├── pokemon-cache/           # Pokémon reference data
├── runtime-cache/           # Runtime cache namespaces
└── security-bot-state/      # Security bot operational logs
    ├── current.json         # Active state
    ├── previous.json        # Last restart backup
    └── snapshots/           # Timestamped backups (7-day retention)
```

### Security Bot State Schema
```json
{
  "version": 1,
  "schemaVersion": "1.0.0",
  "metadata": {
    "lastSaved": "ISO-8601 timestamp",
    "lastRestart": "ISO-8601 timestamp",
    "processStartTime": "ISO-8601 timestamp",
    "hostname": "service hostname",
    "nodeVersion": "Node.js version",
    "botVersion": "Bot version",
    "previousRestart": "ISO-8601 timestamp"
  },
  "cumulative": {
    "totalUptime": 0,
    "restartCount": 22,
    "sweepCount": 482,
    "alertCount": 0,
    "permissionChangesDetected": 0,
    "permissionChangesReverted": 0,
    "revertFailures": 0,
    "guildCount": 0,
    "firstStartTime": "ISO-8601 timestamp"
  },
  "timeline": [
    {
      "timestamp": "ISO-8601 timestamp",
      "type": "sweep|alert|change|error|restart",
      "guildId": "Discord guild ID",
      "guildName": "Guild name",
      "details": {
        "rolesChecked": 13,
        "changesDetected": 0
      }
    }
  ]
}
```

### Engine Database Schema (SQLite)
```sql
-- Battle logs
CREATE TABLE battle_logs (
  id INTEGER PRIMARY KEY,
  timestamp TEXT,
  -- ... additional columns
);

-- Move usage statistics
CREATE TABLE move_usage (
  id INTEGER PRIMARY KEY,
  -- ... columns
);

-- Anomaly detection
CREATE TABLE anomalies (
  id INTEGER PRIMARY KEY,
  -- ... columns
);
```

## Security Considerations

### Key Management
- ✅ Private key stored locally only (`~/.ssh/id_ed25519_render`)
- ✅ Never commit private keys to version control
- ✅ Public key registered in Render Dashboard
- ✅ Key rotation: Generate new key and update Dashboard

### Connection Security
- ✅ Ed25519 provides strong cryptographic security (256-bit)
- ✅ SSH protocol encryption (AES-256-GCM or ChaCha20-Poly1305)
- ✅ Host key verification (known_hosts)
- ⚠️ Warning about "bad signature" is normal and can be ignored

### Access Control
- ✅ SSH access requires authorized public key
- ✅ Service-level isolation (can only access assigned service)
- ✅ File system permissions enforced by Render
- ✅ No root access provided

### Audit Trail
- Render logs all SSH connections
- Command execution is logged
- File transfers are tracked
- Security bot records all operations in state files

## Known Issues & Warnings

### "bad signature" Warning
```
client_global_hostkeys_prove_confirm: server gave bad signature for ED25519 key 0: incorrect signature
```

**Status**: Normal, can be safely ignored  
**Cause**: Host key verification protocol difference  
**Impact**: None - connection is still secure  
**Action**: No action required

### PowerShell Script Encoding Issues
Some PowerShell scripts contain emoji characters that cause parser errors when run via npm scripts.

**Workaround**: Use direct SSH commands instead of the PowerShell scripts  
**Fix**: Remove emoji characters from scripts or re-save with proper UTF-8 encoding

### Log Accessibility
Application stdout/stderr logs are captured by Render's logging system and are not directly accessible via SSH.

**Access Method**: Use Render Dashboard or API for application logs  
**Available via SSH**: Persistent storage files (`/Store/*`), SQLite databases, state files

## Performance Characteristics

### Connection Latency
- Initial connection: ~100-300ms (Virginia region from East Coast)
- Command execution: ~50-200ms overhead per command
- File transfer: Limited by network bandwidth

### Data Transfer
- Small commands (<1KB): ~50-100ms total
- JSON state files (~10KB): ~100-200ms total
- Database queries: ~50-150ms (SQLite local access)

### Recommended Usage
- ✅ Quick health checks and status queries
- ✅ Operational state retrieval
- ✅ Emergency debugging and investigation
- ✅ Database queries and analysis
- ❌ Real-time log tailing (use Render Dashboard)
- ❌ Large file transfers (use Render API or deploy)
- ❌ Interactive development (use local environment)

## Troubleshooting

### Connection Refused
**Symptoms**: `Connection refused` or timeout  
**Causes**:
- Service is not running
- Wrong region endpoint
- Network/firewall issues

**Resolution**:
1. Verify service status: `npm run render:status`
2. Check region is correct (virginia)
3. Verify SSH key is authorized in Dashboard

### Permission Denied
**Symptoms**: `Permission denied (publickey)`  
**Causes**:
- Public key not added to Render Dashboard
- Wrong private key path
- Key file permissions too open (Windows usually OK)

**Resolution**:
1. Verify public key is in Render Dashboard
2. Check private key path: `Test-Path "$env:USERPROFILE\.ssh\id_ed25519_render"`
3. Re-add public key if needed

### Command Not Found
**Symptoms**: `command not found` when running commands  
**Causes**:
- Tool not installed in Render environment
- Wrong PATH
- Command syntax error

**Resolution**:
1. Check available commands: `ssh ... "which command_name"`
2. Use full paths: `/usr/bin/sqlite3` instead of `sqlite3`
3. Verify Render environment capabilities

## Examples

### Complete Operational Health Check
```powershell
# 1. Check running processes
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "ps aux | grep -E 'node|npm' | grep -v grep"

# 2. Check disk usage
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "df -h"

# 3. Check security bot state
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "cat /Store/security-bot-state/current.json" | ConvertFrom-Json | Select-Object -ExpandProperty metadata

# 4. Check latest security event
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "cat /Store/security-bot-state/current.json" | ConvertFrom-Json | Select-Object -ExpandProperty timeline | Select-Object -First 1

# 5. Check battle logs
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "sqlite3 /Store/engine-write.db 'SELECT COUNT(*) FROM battle_logs;'"
```

### Retrieve Full Security Bot Timeline
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "cat /Store/security-bot-state/current.json" | ConvertFrom-Json | Select-Object -ExpandProperty timeline | Format-Table -AutoSize
```

### Download Security State for Analysis
```powershell
scp -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com:/Store/security-bot-state/current.json ./security-state-backup.json
```

### Emergency Database Backup
```powershell
scp -i "$env:USERPROFILE\.ssh\id_ed25519_render" srv-d3snk2ndiees73cn709g@ssh.virginia.render.com:/Store/engine-write.db ./engine-write-backup.db
```

## Integration with Render API

SSH complements the Render API but serves different purposes:

| Operation | SSH | Render API |
|-----------|-----|------------|
| Application logs | ❌ Not available | ✅ Best method |
| Deploy/Restart | ❌ Not available | ✅ Use API |
| File access | ✅ Direct access | ❌ Not available |
| Database queries | ✅ Direct SQLite | ❌ Not available |
| Operational state | ✅ State files | ⚠️ Limited |
| Process inspection | ✅ ps/top | ❌ Not available |
| Emergency access | ✅ Always available | ⚠️ API limits |

**Best Practice**: Use SSH for operational inspection and emergency access; use Render API for deployments and log retrieval.

## References

- Render SSH Documentation: https://docs.render.com/ssh
- Ed25519 Specification: RFC 8709
- OpenSSH Documentation: https://www.openssh.com/manual.html
- Related Docs: `docs/render-ssh-automation.md`, `docs/render-api-logging-summary.md`

## Changelog

### 2025-11-10
- Initial protocol documentation
- Ed25519 key generation and authorization
- Virginia region confirmed as primary
- Ohio region removed from configuration
- Successful testing of all connection types
- Security bot state retrieval validated
- Engine database access confirmed
