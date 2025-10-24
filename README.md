# Infinity Gauntlet bots

This repo contains two Discord bots:

- Security role-healing bot (root app)
   - Continuously assigns a default role to new members and can audit/remediate role permissions.
   - Primary entry: `src/index.js` (with compatibility forwarders in `index.js` and `security-bot.js`).
   - Cache module: `src/services/cache.js`
   - Shared utilities: `src/utils/logger.js`, `src/config/env.js`

- Pokémon battle bot (`discord-pokemon-bot/`)
   - Starts simple battles when a message contains the 👀 emoji and mentions a user.
   - Entry file: `discord-pokemon-bot/pokemon-bot.js`
   - Cache module: `discord-pokemon-bot/cache.js`
   - Internal modules: `battles/battle-manager.js`, `utils/pokemon-helpers.js`

## prerequisites

- Node.js 18+ (enforced via engines)
- Discord bot token(s)
   - Security bot requires Guild Members intent
   - Pokémon bot requires Message Content intent

## setup: combined worker (root)

1) Configure env in the repo root:

```env
# Either provide dedicated tokens or fall back to BOT_TOKEN for security.
SECURITY_BOT_TOKEN=security_bot_token_here
POKEMON_BOT_TOKEN=pokemon_bot_token_here
ENABLE_POKEMON_BOT=true

# Backwards-compatible fallback for the security bot
# BOT_TOKEN=your_discord_bot_token_here

# Optional overrides
# ROLE_NAME=Trainer
# ROLE_ID=123456789012345678
# ROLE_PERMISSIONS_AUDIT=true
# ROLE_PERMISSIONS_REMEDIATE=false
# BACKFILL_INTERVAL_SECONDS=45      # cadence for ongoing sweeps (defaults to <60s)
# ROLE_REMEDIATION_INTERVAL_SECONDS=50  # keep managed roles healed (defaults to <60s)
# ROLE_REMEDIATION_INTERVAL_MIN=0   # legacy minutes-based override (still supported)
# OPS_REPORT_INTERVAL_SECONDS=0     # set >0 for periodic operational summaries (defaults to <60s)
# ROLE_PERMISSION_POLICY=standard   # 'standard' (default) or 'snapshot'
# ROLE_PERMISSION_SNAPSHOT_UPDATE=true  # auto-seed snapshot from current if missing
# STANDARD_ENFORCE_ALL=false        # enforce a baseline on unlisted roles
# UNLISTED_PERMISSIONS=ViewChannel,SendMessages,ReadMessageHistory,AddReactions,UseExternalEmojis,EmbedLinks,AttachFiles
# STANDARD_EXEMPT_ROLES=RoleA,RoleB # roles to skip when enforcing-all
# STANDARD_ALL_PERMS_ROLES=Drip     # roles allowed to keep ALL perms when enforcing-all
# ALERT_WEBHOOK_URL=https://example.com/webhook
# ALERT_CHANNEL_ID=123456789012345678
# ALERT_USER_ID=123456789012345678   # also accepts <@123...>, username#1234, or username (resolved in mutual guilds)
```

2) Install dependencies and run:

```powershell
npm install
npm start
```

Notes:
- Ensure the bot’s role is above the target role in your server and has “Manage Roles”.
- Privileged Gateway Intent “Server Members Intent” must be enabled in the Developer Portal.
- When both tokens are supplied the single process hosts **both** bots and keeps a unified CLI dashboard (first line = security bot, second line = Pokémon bot).
- With remediation enabled and a remediation interval set, role permission drift will be corrected automatically.
- Snapshot policy: When set to 'snapshot', the bot heals roles to your last-known-good snapshots (auto-seeded from current if enabled). It falls back to the STANDARD map when no snapshot exists and auto-seed is off.
- Enforce-all mode: When enabled, unlisted roles are given the UNLISTED_PERMISSIONS baseline (unless exempted), or 'ALL' if listed under STANDARD_ALL_PERMS_ROLES.

## setup: Pokémon bot

The Pokémon bot can still run standalone from its subfolder if desired.

1) Configure env in `discord-pokemon-bot/.env` (or export `POKEMON_BOT_TOKEN`):

```env
BOT_TOKEN=your_discord_bot_token_here
```

2) Install and run from the subfolder:

```powershell
cd .\discord-pokemon-bot
npm install
npm start
```

Notes:
- Requires “Message Content Intent” in the Developer Portal.
- Triggers when a message contains 👀 and mentions a user.

## deploy on Render (security bot)

- Start Command: `npm start` (already set in root package.json)
- Environment variables: `SECURITY_BOT_TOKEN`, `POKEMON_BOT_TOKEN`, optional `ENABLE_POKEMON_BOT`
- See `render.yaml` for the single worker service definition.

### Dex snapshot requirements for slash commands

Slash commands like `/dex`, `/move`, and `/weak` use an offline snapshot built into `dist/data/dex.min.json` and `dist/data/moves.min.json`.

- To build these locally: run `npm run build:data` (optionally followed by `npm run build:assets`).
- On Render, add a build step that runs `npm run build:data` or set `DISABLE_SNAPSHOT_PRECHECK=true` to let the service start without the snapshot (commands will gracefully respond that data is unavailable until the snapshot is present).

You can also generate and host the snapshot in a separate job or repository and copy it into `dist/data` during your build.

## PokéAPI cache publisher

The cache worker clones a writable repository (or branch), refreshes PokéAPI payloads,
and commits any diffs. This lets Render (or any scheduler) publish updated data without
impacting the main bot process.

1. Provision a separate repository or branch for cached data and create a token with
   `contents:write` permission.
2. Configure the following environment variables wherever the job runs:
   - `REPO_URL` – HTTPS URL to the target repository.
   - `GITHUB_TOKEN` – token with push access to the repository.
   - `CACHE_BRANCH` – branch for cached artifacts (defaults to `data-cache`).
   - `GIT_USER_NAME` / `GIT_USER_EMAIL` – identity used for commits.
   - `CACHE_REPO_DIR` – optional override for the on-disk clone path.
   - `POKE_LIMIT` – optional limit for local/testing runs.
3. Execute the publisher with `npm run cache`. The script prints a JSON summary of each
   run and only pushes when new data is generated.

Render tip: run the cache workflow as a cron job or secondary worker so it does not
interfere with the real-time Discord bots.

The managed worker defined in `render.yaml` now **dispatches Render one-off jobs**
instead of running the refresh pipeline inline. On boot it queues a job that runs
`node scripts/refresh_cache.mjs` on the same worker (reusing the persistent disk), and
it schedules additional jobs using the `POKE_REFRESH_CRON` expression in the
`POKE_REFRESH_TZ` time zone (defaults to `0 0 * * 4` in `America/New_York`, i.e. every
Thursday at 12:00 a.m. Eastern). Adjust those environment variables if you need a
different cadence, or set `POKE_RUN_JOB_ON_BOOT=false` if you only want the scheduled
runs.

### Render Jobs configuration

Jobs are dispatched via the Render Jobs API. Provide a scoped API key and (optionally)
override the defaults with the following environment variables:

| Variable | Purpose |
| --- | --- |
| `RENDER_API_KEY` or `POKE_RENDER_API_KEY` | Required. Bearer token used to call the Jobs API. Give it the minimal `jobs` scope. |
| `POKE_RENDER_SERVICE_ID` | Optional. Service ID to target when dispatching jobs. Defaults to `RENDER_SERVICE_ID`, which Render injects automatically when running inside the worker. |
| `POKE_REFRESH_JOB_COMMAND` | Optional. Command executed by the one-off job. Defaults to `node scripts/refresh_cache.mjs`. |
| `RENDER_JOB_ALLOW_OVERRIDE` | Optional. Set to `true` to let callers provide a one-off `startCommand` override when triggering jobs. |
| `POKE_RUN_JOB_ON_BOOT` | Optional. Controls whether the worker queues a job immediately after boot. Defaults to `true`. |

If you want to trigger refreshes manually, execute `node scripts/worker_trigger_job.mjs`
from any environment that has the same variables configured (or call
`triggerRenderJob` from `scripts/render_job_client.mjs` in your own automation).

## repo layout

```
security-bot.js         # Backwards-compatible entry (for legacy deploy scripts)
index.js                # Forwarder to src/index.js
src/
  index.js              # Primary boot script
  bot/
    main.js             # Security bot implementation
  config/
    env.js              # Environment parsing & feature flags
  services/
    cache.js            # Persistent cache utilities
  utils/
    logger.js           # Structured logging helpers
discord-pokemon-bot/
   pokemon-bot.js        # Pokémon bot entry
   cache.js              # Pokémon bot cache module
   index.js              # Forwarder to pokemon-bot.js
   battles/
      battle-manager.js   # Battle logic
      battleManager.js    # Deprecated shim forwarder to battle-manager.js
   utils/
      pokemon-helpers.js  # Helper utilities
      helpers.js          # Deprecated shim forwarder to pokemon-helpers.js (kept for compatibility)
```

## troubleshooting

- If the bot exits immediately, verify `BOT_TOKEN` in `.env` and that it has the required intents enabled.
- Check role hierarchy if role assignment fails: the bot’s highest role must be above the target role.
 - To tighten security, keep `Trainer` permissions minimal; the default mapping is least-privilege (view/send/read/add reactions).
