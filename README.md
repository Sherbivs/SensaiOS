# Infinity Gauntlet bots

This repo contains two Discord bots:

- Security role-healing bot (root app)
   - Continuously assigns a default role to new members and can audit/remediate role permissions.
   - Entry file: `security-bot.js`
   - Cache module: `cache.js`

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
# ROLE_NAME=Trainer
# ROLE_ID=123456789012345678
# ROLE_PERMISSIONS_AUDIT=true
# ROLE_PERMISSIONS_REMEDIATE=false
# ROLE_REMEDIATION_INTERVAL_MIN=0  # set >0 to periodically re-validate and fix managed roles
# ROLE_PERMISSION_POLICY=standard   # 'standard' (default) or 'snapshot'
# ROLE_PERMISSION_SNAPSHOT_UPDATE=true  # auto-seed snapshot from current if missing
# ALERT_WEBHOOK_URL=https://example.com/webhook
# ALERT_CHANNEL_ID=123456789012345678
# ALERT_USER_ID=123456789012345678
```

2) Install dependencies and run:

```powershell
npm install
npm start
```

Notes:
- Ensure the bot’s role is above the target role in your server and has “Manage Roles”.
- Privileged Gateway Intent “Server Members Intent” must be enabled in the Developer Portal.
 - With remediation enabled and a remediation interval set, role permission drift will be corrected automatically.
 - Snapshot policy: When set to 'snapshot', the bot heals roles to your last-known-good snapshots (auto-seeded from current if enabled). It falls back to the STANDARD map when no snapshot exists and auto-seed is off.

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
security-bot.js         # Root security bot entry
cache.js                # Root cache module
index.js                # Legacy forwarder to security-bot.js
caching.js              # Legacy forwarder to cache.js
discord-pokemon-bot/
   pokemon-bot.js        # Pokémon bot entry
   cache.js              # Pokémon bot cache module
   index.js              # Legacy forwarder to pokemon-bot.js
   caching.js            # Legacy forwarder to cache.js
   battles/
      battle-manager.js   # Battle logic
      battleManager.js    # Legacy forwarder to battle-manager.js
   utils/
      pokemon-helpers.js  # Helper utilities
      helpers.js          # Legacy forwarder to pokemon-helpers.js
```

## troubleshooting

- If the bot exits immediately, verify `BOT_TOKEN` in `.env` and that it has the required intents enabled.
- Check role hierarchy if role assignment fails: the bot’s highest role must be above the target role.
 - To tighten security, keep `Trainer` permissions minimal; the default mapping is least-privilege (view/send/read/add reactions).
