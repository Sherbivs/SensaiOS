# AI Environment Setup
Last Updated (UTC): 2025-10-29T00:00:00Z

Purpose: ensure automated agents and local operators load secrets from a secure location without copying sensitive data into the repository.

## Overview
- `src/config/env.js` now checks `IG_ENV_FILE` and `DOTENV_CONFIG_PATH` before reading `.env` from the repo root.
- `scripts/setup_ai_env.ps1` sets or persists `IG_ENV_FILE` so headless runs (hotfix agents, nightly automation) access the correct secret store.
- Templates (`.env.example`, `secrets/prisma-accelerate.env.example`, `secrets/prisma-dev.env.example`) describe required variables; copy them outside the repo before filling with secrets.
- Keep the managed secret file outside the repository (for example `C:/Users/sherb/OneDrive/Documents/Key/.env`) so backups and PRs never include credentials.
- When `NODE_ENV=production`, the repo `.env` fallback is skipped unless `IG_ALLOW_REPO_ENV=1` is set.

## Quick Start
1. Ensure your secret file exists outside the repo, e.g. `C:/Users/sherb/OneDrive/Documents/Key/.env`.
2. Open a PowerShell session and run:
   ```powershell
   pwsh -File scripts/setup_ai_env.ps1 -Persist
   ```
   - Use `-EnvFile` if your path differs: `-EnvFile "D:/Vault/gauntlet.env"`.
   - Omit `-Persist` to scope the setting to the current shell only.
3. Restart terminals or VS Code so new sessions inherit `IG_ENV_FILE`.
4. (Optional) Confirm the override is active:
   ```powershell
   dotenv info
   echo $Env:IG_ENV_FILE
   ```
5. Run database checks via the control suite once secrets load:
   ```powershell
   npm run db:cli -- status
   ```

## Agent Run Checklist
- Before invoking planner/implementer agents, verify `IG_ENV_FILE` resolves to the expected path.
- When generating a new secret file, start from the templates tracked in the repo.
- For CI or automation workers, set the variable in the job configuration rather than persisting on the host.
- Never commit the external `.env` file or copy its contents into tracked files.
 - For database inspections, prefer the structured interface in `npm run db:cli` (documented in `docs/db-control-suite.md`).

## Troubleshooting
- **`Environment file was not found`**: pass the correct path via `-EnvFile` or create the file at the expected location.
- **Secrets not loading**: run `Get-ChildItem Env: | Where-Object { $_.Name -eq 'IG_ENV_FILE' }` to confirm the variable is present, then restart the process that consumes it.
- **Persisted value not used**: `setx` updates registry-backed environment variables; sign out/in or restart shell hosts to pick up the change.
