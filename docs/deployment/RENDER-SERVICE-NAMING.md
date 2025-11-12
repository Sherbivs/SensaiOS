# Render Service Naming Convention

**CRITICAL:** Always use the correct service names when deploying to Render.

## Correct Service Names

| render.yaml Definition | Render API/Dashboard Name | Deploy Command |
|---|---|---|
| `infinity-gauntlet-bots` | **Infinity-Gauntlet** | `-Service "Infinity-Gauntlet"` |
| `infinity-gauntlet-outbox` | **infinity-gauntlet-outbox** | `-Service "infinity-gauntlet-outbox"` |
| `infinity-gauntlet-cache` | **infinity-gauntlet-cache** | `-Service "infinity-gauntlet-cache"` |
| `infinity-gauntlet-data-pipeline` | **infinity-gauntlet-data-pipeline** | `-Service "infinity-gauntlet-data-pipeline"` |
| `infinity-gauntlet-security` | **infinity-gauntlet-security** | `-Service "infinity-gauntlet-security"` |
| `pokedex-cache-worker` | **pokedex-cache-worker** | `-Service "pokedex-cache-worker"` |

## Main Bot Worker (CRITICAL)

The main Discord bot worker has **TWO DIFFERENT NAMES**:

- **render.yaml name**: `infinity-gauntlet-bots` (lowercase, used in configuration)
- **Render API name**: `Infinity-Gauntlet` (capitalized, used for deployment)

### Correct Usage

✅ **Deploy to production:**
```powershell
pwsh -File scripts/render_deploy.ps1 -Service "Infinity-Gauntlet"
```

✅ **View logs:**
```powershell
pwsh -File scripts/render_logs.ps1 -Service "Infinity-Gauntlet"
```

✅ **Restart service:**
```powershell
pwsh -File scripts/render_restart.ps1 -Service "Infinity-Gauntlet"
```

❌ **WRONG - Will fail:**
```powershell
pwsh -File scripts/render_deploy.ps1 -Service "infinity-gauntlet-bots"
# Error: Service 'infinity-gauntlet-bots' not found
```

## VS Code Tasks

The `.vscode/tasks.json` file has been updated to use the correct name:

```json
{
  "label": "Render: Deploy Main Bot",
  "args": [
    "-Service",
    "Infinity-Gauntlet"  // ✅ Correct capitalization
  ]
}
```

## npm Scripts

The `package.json` scripts use the correct name:

```json
{
  "render:deploy": "... -Service Infinity-Gauntlet",
  "render:restart": "... -Service Infinity-Gauntlet"
}
```

## Service ID

The main bot worker service ID is: `srv-d3snk2ndiees73cn709g`

This ID is used for:
- SSH connections
- Direct API calls
- Service-specific operations

## Documentation Updated

All references to `infinity-gauntlet-bots` in deployment commands have been updated to use `Infinity-Gauntlet`:

- ✅ `.vscode/tasks.json` - All tasks updated
- ✅ `package.json` - npm scripts updated
- ✅ `Agents.md` - Service list updated
- ✅ `docs/deployment/RENDER-SERVICE-NAMING.md` - This document

## Why the Name Difference?

Render's API uses a different naming convention than the render.yaml file. The service was likely renamed in the Render dashboard after initial creation, which explains the discrepancy between:

- **Configuration name** (render.yaml): `infinity-gauntlet-bots`
- **API/Dashboard name**: `Infinity-Gauntlet`

Always use `Infinity-Gauntlet` (capitalized) when calling Render APIs or deployment scripts.

## Production Deployment Checklist

Before deploying, verify:

1. ✅ Service name is `Infinity-Gauntlet` (capitalized)
2. ✅ Service ID matches: `srv-d3snk2ndiees73cn709g`
3. ✅ Deployment script: `scripts/render_deploy.ps1`
4. ✅ All changes committed and pushed to GitHub
5. ✅ Build passes locally: `npm run build`

## Emergency Hotfix

For critical production issues:

```powershell
# 1. Fix the code
# 2. Build and validate
npm run build

# 3. Commit and push
git add .
git commit -m "HOTFIX: [description]"
git push origin main

# 4. Deploy immediately
pwsh -File scripts/render_deploy.ps1 -Service "Infinity-Gauntlet"
```

**NEVER** use `infinity-gauntlet-bots` in deployment commands - it will fail.
