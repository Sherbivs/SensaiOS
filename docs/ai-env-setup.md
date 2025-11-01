# AI Environment Setup
Last Updated (UTC): 2025-10-30T16:47:00Z

Purpose: ensure automated agents and local operators load secrets from a secure location without copying sensitive data into the repository.

## Overview
- `src/config/env.js` now checks `IG_ENV_FILE` and `DOTENV_CONFIG_PATH` before reading `.env` from the repo root.
- `scripts/setup_ai_env.ps1` sets or persists `IG_ENV_FILE` so headless runs (hotfix agents, nightly automation) access the correct secret store.
- Templates (`.env.example`, `secrets/prisma-accelerate.env.example`, `secrets/prisma-dev.env.example`) describe required variables; copy them outside the repo before filling with secrets.
- Keep the managed secrets outside the repository by placing Dev credentials in `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env` and Accelerate/production credentials in `C:/Users/sherb/OneDrive/Documents/Key/Prod/.env` so backups and PRs never include them.
- When `NODE_ENV=production`, the repo `.env` fallback is skipped unless `IG_ALLOW_REPO_ENV=1` is set.

## Quick Start
1. Copy each template outside the repo. This console keeps the Dev and Prod folders side by side under `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env` (direct connection) and `C:/Users/sherb/OneDrive/Documents/Key/Prod/.env` (Accelerate runtime **plus** its direct PostgreSQL URL for migrations). Populate them with the real tunnel credentials before use.
2. Open a PowerShell session and point `IG_ENV_FILE` at the file you need for the current task:
   ```powershell
   pwsh -File scripts/setup_ai_env.ps1 -EnvFile "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env" -Persist
   ```
   - Swap to Accelerate when needed: `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "C:/Users/sherb/OneDrive/Documents/Key/Prod/.env" -Persist`.
   - Omit `-Persist` to scope the setting to the current shell only.
3. Restart terminals or VS Code so new sessions inherit `IG_ENV_FILE`.
4. Confirm the override is active and reachable:
   ```powershell
   dotenv info
   echo $Env:IG_ENV_FILE
   Get-Content $Env:IG_ENV_FILE | Select-Object -First 5
   ```
5. Run database checks via the control suite once secrets load:
   ```powershell
   npm run db:cli -- status
   ```
6. If you previously targeted `Key/Prod/.env`, run `npx prisma generate` before reconnecting to Dev so the client resets from Accelerate to the direct Node engine.

## Agent Run Checklist
- Before invoking planner/implementer agents, verify `IG_ENV_FILE` resolves to the expected path.
- When generating a new secret file, start from the templates tracked in the repo.
- For CI or automation workers, set the variable in the job configuration rather than persisting on the host.
- Never commit the external env files (`Key/Dev/.env`, `Key/Prod/.env`) or copy their contents into tracked files.
- When swapping back from Prod to Dev, run `npx prisma generate` once to rebuild the client without the Accelerate proxy.
 - For database inspections, prefer the structured interface in `npm run db:cli` (documented in `docs/db-control-suite.md`).

## Troubleshooting
- **`Environment file was not found`**: pass the correct path via `-EnvFile` or create the file at the expected location.
- **Secrets not loading**: run `Get-ChildItem Env: | Where-Object { $_.Name -eq 'IG_ENV_FILE' }` to confirm the variable is present, then restart the process that consumes it.
- **Persisted value not used**: `setx` updates registry-backed environment variables; sign out/in or restart shell hosts to pick up the change.
- **`Error validating datasource 'db': the URL must start with the protocol prisma://`**: the local Prisma client was generated while pointing at Accelerate. Run `npx prisma generate` after switching `IG_ENV_FILE` back to the Dev secrets file, then retry the command.
