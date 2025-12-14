# ⚠️ DEPRECATED — Render API Scripts & Workflows

**Date:** 2025-12-06
**Reason:** Cost optimization — Render API calls incur charges
**Policy:** SSH-only access enforced going forward

## What Was Deprecated

### Archived Scripts (in this folder)

These scripts used the Render REST API (`api.render.com`) which has associated costs:

| Script | Purpose | Replacement |
|--------|---------|-------------|
| `render_deploy.ps1` | Trigger deployments | Use Render Dashboard or `render deploys create` via CLI |
| `render_restart.ps1` | Restart services | Use Render Dashboard or `render restart` via CLI |
| `render_status.ps1` | Check service status | Use `render services` via CLI or SSH |
| `render_logs.ps1` | View service logs | Use `render logs` via CLI or SSH |
| `render_deploys.ps1` | List deployments | Use Render Dashboard |
| `render_debug.ps1` | Debug API calls | No longer needed |
| `render_run_job.ps1` | Run one-off jobs | Use Render Dashboard |
| `render_cancel_job.ps1` | Cancel jobs | Use Render Dashboard |
| `render_get_store_logs.ps1` | Get store logs | Use SSH: `render ssh srv-xxx` |
| `render_job_client.mjs` | Job client library | No longer needed |

### Deleted GitHub Workflows

These workflows were **permanently deleted** (not archived) because they used the Render API:

| Workflow | Purpose | Replacement |
|----------|---------|-------------|
| `scheduled-restart.yml` | 12-hour auto-restarts | Render Standard plan handles restarts automatically |
| `health-check-watchdog.yml` | Health monitoring + auto-restart | Render monitors service health automatically |
| `retrieve-store-logs.yml` | Dashboard shell guide | Use SSH directly |

**Why deleted instead of archived:** GitHub Actions run on a schedule, so leaving them would continue incurring costs. Deleting prevents accidental execution.

## SSH-Only Access (Active)

The following scripts remain active and use SSH (free):

| Script | Purpose |
|--------|---------|
| `render_ssh_windows.ps1` | Interactive SSH session |
| `render_disk_usage_windows.ps1` | Check disk usage via SSH |
| `render_cleanup_heaps_windows.ps1` | Cleanup heap files via SSH |

## Policy Enforcement

**ABSOLUTE RULE (Patch.md):** Render API calls are PROHIBITED. All remote access MUST use SSH.

- ❌ Do NOT use `api.render.com` endpoints
- ❌ Do NOT use `RENDER_API_KEY` for API calls  
- ✅ Use `render ssh` or direct SSH for remote access
- ✅ Use Render Dashboard for deployments/restarts
- ✅ Use Render CLI with SSH commands only

## If You Need These Scripts

If API access is required in the future:
1. Get explicit approval
2. Move scripts back from this archive
3. Document cost justification
4. Update Patch.md Absolutes

---

**Last Updated:** 2025-12-06
