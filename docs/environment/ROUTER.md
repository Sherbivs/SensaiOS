# ROUTER
Title: Environment Setup Documentation
Purpose: Environment configuration, AI agent setup, and workstation gameplay.
Owned Globs: docs/environment/**
Last Updated (UTC): 2025-11-10T00:00:00Z

Notes:
- Secure environment setup procedures for AI agents
- Workstation gameplay configuration with local PostgreSQL
- Environment variable management and secrets handling
- Development environment best practices

Key Documents:
- **ai-env-setup.md** - Secure environment setup for AI agents
  * Environment file loading order and precedence
  * IG_ENV_FILE mechanism for external secrets
  * Available commands: setup_ai_env.ps1 with -EnvFile, -Persist flags
  * Security: Repo .env disabled in production unless IG_ALLOW_REPO_ENV=1
  * Loading verification: echo $Env:IG_ENV_FILE, Get-Content to confirm path
- **WORKSTATION-GAMEPLAY-SETUP.md** - Complete guide for local PostgreSQL gameplay
  * On-premise database setup (DATABASE_ONPREMISE_DEV_PRIMARY)
  * Bootstrap process: npm run ops:bootstrap-onpremise-dev or ops:auto-bootstrap-onpremise-dev
  * Prisma client: onPremiseDevPrisma for offline development
  * Performance: <50ms latency vs 50-100ms cloud PostgreSQL
  * Use cases: Offline development, local testing, gameplay without cloud dependency

Environment File Structure:
**Primary**: `secrets/Infinity-Gauntlet.env` (single consolidated file)
- BOT_TOKEN, POKEMON_BOT_TOKEN (Discord)
- PROD_DATABASE_URL (Render managed database - PRIMARY)
- RENDER_DB_EXTERNAL_URL (Render direct PostgreSQL)
- DATABASE_ONPREMISE_DEV_PRIMARY (workstation mirror - OPTIONAL)

Loading Workflow:
1. Run: `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist`
2. Verify: `echo $Env:IG_ENV_FILE` should print the chosen file
3. Use: All database operations, npm scripts, tooling use loaded environment
4. Bootstrap (optional): `npm run ops:auto-bootstrap-onpremise-dev` for local mirror

Security Notes:
- Never commit secrets to repo
- Keep environment files outside repo (secrets/ directory)
- Use IG_ENV_FILE to point to external secrets
- Production ignores repo .env unless explicitly allowed

Cross-References:
- See docs/database/dual-onpremise-database-guide.md for dual database setup
- See docs/database/database-url-selection.md for URL selection logic
- See Agents.md for environment setup contract
