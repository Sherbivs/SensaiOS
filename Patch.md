Infinity-Gauntlet Workspace Patch
=================================

1. Repo Layout Updates
---------------------

.                              # Infinity-Gauntlet (repo root)
├─ .gitignore
├─ .env                        # local only, not committed
├─ .env.example
├─ README.md
├─ package.json                # start: node security-bot.js; engines: >=18
├─ render.yaml
├─ index.js                    # forwarder → ./security-bot.js
├─ security-bot.js             # Security role-healing bot (production)
├─ cache.js                    # Root app cache module
│
├─ discord-pokemon-bot/        # Pokémon battle bot (separate app)
│  ├─ .gitignore
│  ├─ .env.example
│  ├─ package.json             # start: node pokemon-bot.js; engines: >=18; deps: discord.js ^14.15, dotenv ^16.4
│  ├─ index.js                 # forwarder → ./pokemon-bot.js
│  ├─ pokemon-bot.js           # Bot entry
│  ├─ cache/                   # User cache for Pokémon bot
│  │  ├─ index.js              # Cache API
│  │  └─ user-cache/           # auto-created per-user JSON files
│  ├─ data/
│  │  └─ pokemon.json
│  ├─ battles/
│  │  ├─ battle-manager.js     # Main battle logic
│  │  └─ battleManager.js      # deprecated shim → ./battle-manager.js
│  └─ utils/
│     ├─ pokemon-helpers.js    # Helpers
│     └─ helpers.js            # deprecated shim → ./pokemon-helpers.js


2. Root Bot Updates (Security)
------------------------------

- Entry point: security-bot.js (index.js is forwarder)
- Cache: cache.js replaces legacy caching.js or cachePatch.js
- Features:
  - Role healing on roleUpdate and guildMemberUpdate
  - Snapshot-based role permissions (ROLE_PERMISSION_POLICY=snapshot|standard)
  - Optional enforce-all-roles mode (STANDARD_ENFORCE_ALL=true)
  - Alerts on drift detection (ALERT_WEBHOOK_URL, ALERT_CHANNEL_ID, ALERT_USER_ID)
- Reporting: startup logs for resource usage, cache status, and role permissions


3. Pokémon Bot Updates
---------------------

3.1 Bot Entry
-------------
- pokemon-bot.js is main entry
- Loads data/pokemon.json, cache, battle-manager

3.2 Caching System
------------------
- Location: discord-pokemon-bot/cache/index.js
- Features:
  - Per-user JSON files in user-cache/<userId>.json
  - Hybrid memory + disk caching
  - Support commands:
    - readCache(userId)
    - writeCache(userId, data)
    - deleteCache(userId)
    - listUsers()
- Example cache format:

{
  "pokemons": [
    {
      "id": "pichu",
      "level": 3,
      "xp": 120,
      "currentHp": 35,
      "maxHp": 35,
      "moves": ["thunder-shock", "tail-whip"],
      "cooldowns": {}
    }
  ],
  "wins": 2,
  "losses": 1,
  "lastBattle": "2025-10-23T03:21:00Z"
}


3.3 Pokémon Selection DM Flow
----------------------------
- Rules:
  - Stage 1 or baby Pokémon only
  - Exclude starters, legendaries, pseudo-legendaries
  - Triggered in user DM
- Flow:
  1. User sends DM to bot
  2. Bot presents eligible Pokémon list
  3. User selects one
  4. Selection stored in per-user cache


3.4 Battle System
-----------------
- Location: battles/battle-manager.js
- Mechanics:
  - Turn-based, triggered when users react with a stare emoji
  - Reads/writes user cache: Pokémon stats, HP, XP, cooldowns
  - Maintains battle cooldowns
  - Optional leaderboard/battle log channel
- Forwarder: battleManager.js → battle-manager.js


3.5 Helpers
-----------
- Location: utils/pokemon-helpers.js
- Includes:
  - Pokémon filtering/validation
  - Level-up logic
  - XP gain, HP calculations, cooldown management
- Deprecated shim: helpers.js


4. Recommended Next Steps
-------------------------
1. Finalize per-user caching in cache/index.js
2. Implement DM Pokémon selection
3. Hook selection into battle-manager:
   - Initialize Pokémon stats
   - Enable turn-based battle on emoji reaction
4. Add battle cooldowns and persistent XP/HP
5. Optional: leaderboard channel for wins/losses
6. Remove legacy shims when stable


5. Misc Notes
-------------
- Engines: Node >=18
- Dependencies:
  - discord.js ^14.15.x
  - dotenv ^16.4.x
- Start commands:
  - Root: node security-bot.js
  - Pokémon: node pokemon-bot.js
- Archive legacy discord-role-bot/ to avoid confusion
- Logging & troubleshooting standardized: console logs + per-user cache inspection


6. Next Major Milestone
----------------------
- Step 1: DM Pokémon picker + per-user cache integration
- Step 2: Turn-based battle mechanics using cached Pokémon stats
- Step 3: Leaderboard / battle logs channel
- Step 4: Refine cooldowns, level/XP progression, debug utilities

