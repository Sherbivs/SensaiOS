# Render One-Off Jobs

## Overview

Render one-off jobs allow you to execute commands in your service's production environment without deploying code changes or restarting the service. This is useful for:

- Running diagnostic scripts
- Testing database connectivity
- Executing maintenance tasks
- Debugging production issues
- Running migrations or data fixes

## Prerequisites

- Render API key stored in `secrets/Infinity-Gauntlet.env`
- Service must be deployed and active
- Scripts must exist in the deployed codebase

## Usage

### Basic Command

```powershell
pwsh -File scripts/render_run_job.ps1 -ServiceId "srv-xxx" -Command "your-command"
```

### Examples

#### Run a TypeScript diagnostic script
```powershell
pwsh -File scripts/render_run_job.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "npx tsx scripts/check_prisma_findmany.ts"
```

#### Run a Node.js script
```powershell
pwsh -File scripts/render_run_job.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "node dist/maintenance/cleanup.js"
```

#### Run inline Node code
```powershell
pwsh -File scripts/render_run_job.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "node --input-type=module -e \"console.log('Hello from Render')\""
```

#### Run Prisma commands
```powershell
pwsh -File scripts/render_run_job.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "npx prisma migrate status"
```

## Finding Your Service ID

Use the Render API to list services:

```powershell
$apiKey = (Select-String -Path 'secrets/Infinity-Gauntlet.env' -Pattern '^RENDER_API_KEY=' | ForEach-Object { ($_ -split '=',2)[1].Trim() })
$headers = @{ "Authorization" = "Bearer $apiKey" }
Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=20" -Headers $headers | 
  ConvertTo-Json -Depth 5
```

Or use the existing script:
```powershell
npm run render:status
```

## Service IDs Reference

| Service Name | Service ID | Type |
|-------------|-----------|------|
| Infinity-Gauntlet | srv-d3snk2ndiees73cn709g | worker |
| PgHero | srv-d3vs4r2li9vc73akhi90 | web_service |

## Job Lifecycle

1. **Create** - Job is submitted to Render API
2. **Pending** - Job is queued
3. **Running** - Job is executing
4. **Succeeded/Failed** - Job completed

The script automatically polls for completion and reports the final status.

## Viewing Job Output

Job logs are not available via the REST API. To view output:

### Option 1: Render Dashboard (Recommended)
Visit the dashboard URL shown in the script output:
```
https://dashboard.render.com
```

### Option 2: Render CLI
```bash
render logs --job job-xxx
```

### Option 3: Add logging to your script
Scripts can write to files in the `/Store` persistent disk:
```typescript
import fs from 'node:fs';
fs.writeFileSync('/Store/job-output.txt', 'Results here');
```

## Environment Configuration

### Environment Variables
Jobs automatically inherit all environment variables configured for the service, including:
- `PROD_DATABASE_URL` - Database connection string
- `NODE_ENV` - Set to "production"
- `SERVICE_NAME` - Name of the service
- Custom environment variables

### Secret Files
If you've configured Secret Files in Render, they're mounted at:
- `/etc/secrets/<filename>`

Example: Access your environment file:
```typescript
import fs from 'node:fs';
const content = fs.readFileSync('/etc/secrets/Infinity-Gauntlet.env', 'utf8');
```

### Persistent Disk
Services with persistent disks can access them at their configured mount paths:
- Main services: `/Store` (2GB)
- Security bot: `/Store` (1GB)

## Best Practices

### 1. Make scripts environment-aware
```typescript
// Check for environment variables first, fall back to secret files
if (!process.env.PROD_DATABASE_URL) {
  const envFile = fs.existsSync('/etc/secrets/Infinity-Gauntlet.env')
    ? '/etc/secrets/Infinity-Gauntlet.env'
    : 'secrets/Infinity-Gauntlet.env';
  // Load from file...
}
```

### 2. Add diagnostic output
```typescript
console.log('Environment:', process.env.NODE_ENV);
console.log('Database URL set:', !!process.env.PROD_DATABASE_URL);
console.log('Starting operation...');
```

### 3. Handle errors gracefully
```typescript
try {
  // Your operation
  process.exit(0);
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
```

### 4. Wait for deployments before running jobs
If you just pushed code changes:
```powershell
# Wait for deployment to finish
Start-Sleep -Seconds 90

# Then run the job
pwsh -File scripts/render_run_job.ps1 -ServiceId "srv-xxx" -Command "..."
```

### 5. Trigger manual deployment if needed
```powershell
$apiKey = (Select-String -Path 'secrets/Infinity-Gauntlet.env' -Pattern '^RENDER_API_KEY=' | ForEach-Object { ($_ -split '=',2)[1].Trim() })
$headers = @{ "Authorization" = "Bearer $apiKey" }
Invoke-RestMethod `
  -Uri "https://api.render.com/v1/services/srv-xxx/deploys" `
  -Method POST `
  -Headers $headers `
  -Body '{"clearCache":"clear"}' `
  -ContentType "application/json"
```

## Troubleshooting

### Script not found
- Ensure the script exists in the repository
- Check that it's not in `.gitignore`
- Verify the deployment includes the script (check build filters)
- Trigger a manual deployment with cache clear

### Secret file not found
- Verify Secret Files are configured in Render Dashboard
- Check the mount path: `/etc/secrets/<filename>`
- Ensure the filename matches exactly (case-sensitive)

### Database connection failed
- Verify `PROD_DATABASE_URL` is set in service environment
- Check that the database service is running
- Internal hostnames (like `dpg-xxx`) only work from within Render's network
- For local testing, use `RENDER_DB_EXTERNAL_URL` instead

### Job times out
- Increase the timeout in the script (default: 5 minutes)
- For long-running tasks, consider using a regular deployment instead
- Check job logs in Render Dashboard for actual errors

### Build filters preventing deployment
If scripts in `scripts/**` don't trigger deployment:
1. Make a change to a non-ignored file (e.g., add a comment to `src/index.ts`)
2. Or trigger a manual deployment via API
3. Or temporarily remove the build filter

## Related Documentation

- [Render API Integration](./vscode-render-integration.md) - VS Code tasks and PowerShell scripts
- [Render API Logging](./render-api-logging-summary.md) - Logging capabilities and limitations
- [Database URL Selection](./database-url-selection.md) - Database connectivity architecture

## Common Use Cases

### Database Health Check
```powershell
pwsh -File scripts/render_run_job.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "npx tsx scripts/check_prisma_findmany.ts"
```

### Run Prisma Migrations
```powershell
pwsh -File scripts/render_run_job.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "npx prisma migrate deploy"
```

### Clear Cache
```powershell
pwsh -File scripts/render_run_job.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "node dist/maintenance/clear-cache.js"
```

### Test Environment Variables
```powershell
pwsh -File scripts/render_run_job.ps1 `
  -ServiceId "srv-d3snk2ndiees73cn709g" `
  -Command "node -e \"console.log('DB URL:', process.env.PROD_DATABASE_URL ? 'Set' : 'Missing')\""
```

## NPM Scripts

Add convenience scripts to `package.json`:

```json
{
  "scripts": {
    "render:job": "pwsh -File scripts/render_run_job.ps1",
    "render:check-db": "pwsh -File scripts/render_run_job.ps1 -ServiceId srv-d3snk2ndiees73cn709g -Command 'npx tsx scripts/check_prisma_findmany.ts'",
    "render:migrate": "pwsh -File scripts/render_run_job.ps1 -ServiceId srv-d3snk2ndiees73cn709g -Command 'npx prisma migrate deploy'"
  }
}
```

Then use:
```powershell
npm run render:check-db
npm run render:migrate
```
