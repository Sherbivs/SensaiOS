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

## setup: security role-healing bot (root)

1) Configure env in the repo root:

```env
BOT_TOKEN=your_discord_bot_token_here
# Optional overrides
# BACKFILL_INTERVAL_SECONDS=30      # periodic sweep cadence (min 5 seconds)
# ROLE_NAME=Trainer
# ROLE_ID=123456789012345678
# ROLE_PERMISSIONS_AUDIT=true
# ROLE_PERMISSIONS_REMEDIATE=false
# ROLE_REMEDIATION_INTERVAL_MIN=0  # set >0 to periodically re-validate and fix managed roles
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
- Periodic sweeps run every 30 seconds by default. Tune `BACKFILL_INTERVAL_SECONDS` (or legacy `BACKFILL_INTERVAL_MIN`) to adjust cadence.
- Privileged Gateway Intent “Server Members Intent” must be enabled in the Developer Portal.
 - With remediation enabled and a remediation interval set, role permission drift will be corrected automatically.
 - Snapshot policy: When set to 'snapshot', the bot heals roles to your last-known-good snapshots (auto-seeded from current if enabled). It falls back to the STANDARD map when no snapshot exists and auto-seed is off.
 - Enforce-all mode: When enabled, unlisted roles are given the UNLISTED_PERMISSIONS baseline (unless exempted), or 'ALL' if listed under STANDARD_ALL_PERMS_ROLES.

## setup: Pokémon bot

1) Configure env in `discord-pokemon-bot/.env`:

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
- Environment variable: `BOT_TOKEN`
- See `render.yaml` for a worker service example.

For the Pokémon bot, create a separate service using the app’s subfolder with its own `BOT_TOKEN`.

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
