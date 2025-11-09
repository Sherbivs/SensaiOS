# Secrets Directory (Local Only)

This folder remains gitignored. The **single consolidated environment file** for all local development and testing is:

**`secrets/Infinity-Gauntlet.env`**

This file contains all required keys:
- `BOT_TOKEN` — Discord bot authentication
- `PROD_DATABASE_URL` — Render managed PostgreSQL (PRIMARY for all operations)
- `RENDER_DB_INTERNAL_URL` — Direct PostgreSQL Render internal (migrations on Render)
- `RENDER_DB_EXTERNAL_URL` — Direct PostgreSQL external access (migrations from workstation)
- `DATABASE_ONPREMISE_DEV_PRIMARY` — Local workstation PostgreSQL cluster (optional offline mirror)
- `POKEMON_BOT_TOKEN` — Secondary bot token

**No other environment files are needed for development.**

## Usage

1. Ensure `secrets/Infinity-Gauntlet.env` exists with all required keys populated.
2. Load it with: `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist`
3. All tooling (`npm run db:cli`, `npm run db:seed:dex`, etc.) will automatically use this file via `IG_ENV_FILE`.

## Security

- Never commit `secrets/Infinity-Gauntlet.env` (gitignored by default).
- Rotate any leaked tokens immediately.
- The runtime checks `IG_ENV_FILE` before falling back to repo `.env` (keep repo `.env` empty).
- On production (`NODE_ENV=production`), the fallback is disabled unless `IG_ALLOW_REPO_ENV=1` is set.
