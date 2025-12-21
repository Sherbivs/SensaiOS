# ROUTER

**Title:** Render Operations Domain  
**Purpose:** SSH-only Render service management — status, disk, cleanup, logs, info  
**Owned Globs:** `scripts/render/**`  
**Last Updated (UTC):** 2025-12-21T00:00:00Z

## Overview

Unified CLI for Render service operations. **SSH-ONLY policy compliant** — no Render API calls to minimize costs.

## Policy Compliance

| ✅ ALLOWED | ❌ PROHIBITED |
|------------|---------------|
| SSH via `render ssh` or WSL | REST API (`api.render.com`) |
| Render Dashboard (manual) | Scripts using `RENDER_API_KEY` |
| Render CLI SSH commands | `Invoke-RestMethod` to Render |

See `Agents.md` § "RENDER ACCESS POLICY" for full policy.

## Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `status` | Show service matrix | `npx tsx scripts/render/cli.ts status` |
| `ssh` | Interactive SSH session | `npx tsx scripts/render/cli.ts ssh -i` |
| `disk` | Check disk usage | `npx tsx scripts/render/cli.ts disk -d` |
| `cleanup` | Remove heap snapshots | `npx tsx scripts/render/cli.ts cleanup --keep 3` |
| `logs` | View service logs | `npx tsx scripts/render/cli.ts logs -n 100` |
| `info` | Environment info | `npx tsx scripts/render/cli.ts info` |

## Files

- **cli.ts** — Main CLI entry point with all commands. Uses lib/ssh.ts for WSL fallback, lib/cli.ts for framework.

## Service Matrix

| Service | Type | RAM | Purpose |
|---------|------|-----|---------|
| infinity-gauntlet-bot | web | 2 GB | HTTP health checks |
| Infinity-Gauntlet | worker | 2 GB | Main Discord bot |
| infinity-gauntlet-outbox | worker | 512 MB | Event bus delivery |
| infinity-gauntlet-cache | worker | 512 MB | Cache maintenance |
| infinity-gauntlet-data-pipeline | worker | 512 MB | Data updates |
| infinity-gauntlet-security | worker | 512 MB | Permission guardrails |
| pokedex-cache-worker | worker | 512 MB | External data sync |
| pokedex-cache-failsafe | cron | 512 MB | Weekly fallback |

## Usage Examples

```bash
# Check all services
npx tsx scripts/render/cli.ts status

# Interactive SSH
npx tsx scripts/render/cli.ts ssh --interactive

# Run remote command
npx tsx scripts/render/cli.ts ssh -c "df -h"

# Detailed disk usage
npx tsx scripts/render/cli.ts disk --detailed

# Cleanup heap files (dry run)
npx tsx scripts/render/cli.ts cleanup --dry-run

# Cleanup keeping 3 recent files
npx tsx scripts/render/cli.ts cleanup --keep 3
```

## SSH Configuration

Requires `render-virginia` host in SSH config:

```
# ~/.ssh/config (or WSL equivalent)
Host render-virginia
  HostName ssh.virginia.render.com
  User srv-d3snk2ndiees73cn709g
  IdentityFile ~/.ssh/render_key
```

## Migration from Legacy Scripts

| Old Script | New Command |
|------------|-------------|
| `render_status.ps1` | `render status` |
| `render_ssh_windows.ps1` | `render ssh -i` |
| `render_disk_usage_windows.ps1` | `render disk` |
| `render_cleanup_heaps_windows.ps1` | `render cleanup` |
| `render_logs.ps1` | `render logs` |

## Cross-References

- **Parent:** [scripts/ROUTER.md](../ROUTER.md)
- **Library:** [scripts/lib/ROUTER.md](../lib/ROUTER.md)
- **SSH Module:** [scripts/lib/ssh.ts](../lib/ssh.ts)
- **Credentials:** [ops/RENDER-CREDENTIALS.md](../../ops/RENDER-CREDENTIALS.md)

## Notes

1. All operations use SSH — no API key required
2. WSL fallback automatic on Windows
3. Dashboard URL: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
4. Heap cleanup preserves recent files by default

---

**Created:** 2025-12-21 | **Phase:** 2 Render Domain (Scripts Overhaul)
