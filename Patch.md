Alright — graphics are parked. Let’s keep momentum by hardening what ships every day: **stability, speed, and safety**. Here’s a focused next sprint with drop‑in files so you can commit and deploy immediately.

---

## 1) Preflight checks (fail fast, never mystery‑crash)

Add a tiny script that verifies env + data snapshot exist **before** the bot boots.

**`scripts/preflight.js`**

```js
'use strict';
const fs = require('fs');
const path = require('path');

const REQUIRED_ENV = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID']; // DISCORD_GUILD_ID optional
const REQUIRED_FILES = [
  'dist/data/dex.min.json',
  'dist/data/moves.min.json'
];

function fail(msg) { console.error('❌ Preflight:', msg); process.exit(1); }

(function main() {
  const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missingEnv.length) fail(`Missing env vars: ${missingEnv.join(', ')}`);

  const missingFiles = REQUIRED_FILES.filter(rel => !fs.existsSync(path.join(process.cwd(), rel)));
  if (missingFiles.length) {
    fail(`Missing build artifacts: ${missingFiles.join(', ')}. Run \`npm run refresh:data\`.`);
  }

  console.log('✅ Preflight OK');
})();
```

**Wire it to start-up** (add/merge in `package.json`):

```json
{
  "scripts": {
    "prestart": "node scripts/normalize-eol.js && node scripts/preflight.js",
    "start": "node security-bot.js"
  }
}
```

Now if data or a token is missing, you’ll see a clear error and a non‑zero exit instead of a stack trace salad.

---

## 2) Cooldowns & safety net (so you don’t rate‑limit yourself)

Implement per‑user, per‑command cooldowns with one tiny module and a few lines in your event handler.

**`src/lib/cooldown.js`**

```js
'use strict';
// In-memory cooldowns; good enough for a single bot instance.
const store = new Map(); // key -> timestamp (ms)

function keyFor(userId, commandName) {
  return `${userId}:${commandName}`;
}

/**
 * Returns { ok: boolean, waitMs: number }
 * If on cooldown, ok=false and waitMs=remaining.
 */
function checkAndSet(userId, commandName, cooldownMs = 2000) {
  const now = Date.now();
  const key = keyFor(userId, commandName);
  const until = store.get(key) || 0;
  if (now < until) return { ok: false, waitMs: until - now };
  store.set(key, now + cooldownMs);
  return { ok: true, waitMs: 0 };
}

module.exports = { checkAndSet };
```

**Patch your `security-bot.js` interaction handler**:

```diff
 const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
 const { loadCommands } = require('./src/command-loader');
+const { checkAndSet } = require('./src/lib/cooldown');

 ...
 client.on(Events.InteractionCreate, async (interaction) => {
   try {
     if (interaction.isAutocomplete()) {
       const cmd = commands.get(interaction.commandName);
       if (cmd?.autocomplete) return cmd.autocomplete(interaction);
     }
     if (!interaction.isChatInputCommand()) return;
     const cmd = commands.get(interaction.commandName);
     if (!cmd) return interaction.reply({ content: 'Unknown command.', ephemeral: true });
+
+    // Cooldown: default 2s unless command sets cmd.cooldownMs
+    const cdMs = typeof cmd.cooldownMs === 'number' ? cmd.cooldownMs : 2000;
+    const gate = checkAndSet(interaction.user.id, interaction.commandName, cdMs);
+    if (!gate.ok) {
+      const secs = Math.ceil(gate.waitMs / 1000);
+      return interaction.reply({ content: `Slow down—${secs}s cooldown`, ephemeral: true });
+    }

     await cmd.execute(interaction);
   } catch (err) {
     console.error('Command error:', err);
     if (interaction.deferred || interaction.replied) return interaction.editReply({ content: 'Something went wrong.' });
     return interaction.reply({ content: 'Something went wrong.', ephemeral: true });
   }
 });
```

Optional: set per‑command cooldowns, e.g. in `src/commands/weak.js`:

```js
module.exports.cooldownMs = 1500;
```

---

## 3) A tiny `/version` command (ops visibility at a glance)

Let ops (and users) see exactly which ruleset is live, plus counts for quick sanity.

**`src/commands/version.js`**

```js
'use strict';
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

function loadJSON(rel) {
  const p = path.join(process.cwd(), rel);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Show live ruleset, data counts, and uptime'),
  cooldownMs: 1000,
  async execute(interaction) {
    const meta  = loadJSON('dist/meta/version.json') || {};
    const dex   = loadJSON('dist/data/dex.min.json') || [];
    const moves = loadJSON('dist/data/moves.min.json') || {};
    const mem = process.memoryUsage();
    const fmtMb = n => (n / (1024*1024)).toFixed(1) + ' MB';

    const fields = [
      { name: 'Ruleset', value: meta.version_group || 'latest', inline: true },
      { name: 'Pokémon', value: String(dex.length), inline: true },
      { name: 'Moves', value: String(Object.keys(moves).length), inline: true },
      { name: 'Uptime', value: `${Math.floor(process.uptime())}s`, inline: true },
      { name: 'Memory', value: `RSS ${fmtMb(mem.rss)}  Heap ${fmtMb(mem.heapUsed)}`, inline: true },
      { name: 'Built At', value: meta.built_at || '—', inline: false }
    ];

    return interaction.reply({ embeds: [{ title: 'Infinity-Gauntlet — Live Version', fields }] });
  }
};
```

Register it with your existing `register-commands` script and you’ll have a single‑source‑of‑truth for “what’s live”.

---

## 4) Nightly data health CI (no artifacts, just tests)

Even if your host does the caching, it’s smart to run a nightly “canary” in GitHub Actions so surprises are caught *before* prod updates.

**`.github/workflows/data-health.yml`**

```yaml
name: Data Health (Nightly)
on:
  schedule:
    - cron: "24 3 * * *"   # 03:24 UTC nightly
  workflow_dispatch:

jobs:
  data-health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install deps
        run: npm ci

      - name: Cache PokéAPI dataset
        run: |
          git clone --depth=1 https://github.com/PokeAPI/pokeapi.git data/pokeapi

      - name: Build snapshot
        run: npm run build:data

      - name: Run invariants
        run: npm run test:data
```

You already have `build-data.js` and `test-data.js`; this just executes them on a schedule.

---

## 5) Two small quality-of-life commands (free wins)

* **`/ping`** for latency and a basic liveness check.
* **`/help`** that enumerates your registered commands dynamically.

**`src/commands/ping.js`**

```js
'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Latency & liveness check'),
  cooldownMs: 1000,
  async execute(interaction) {
    const sent = Date.now();
    const msg = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const latency = Date.now() - sent;
    const api = Math.round(interaction.client.ws.ping);
    return interaction.editReply(`Pong! Client ${latency}ms • API ${api}ms`);
  }
};
```

**`src/commands/help.js`**

```js
'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('List available commands'),
  cooldownMs: 1500,
  async execute(interaction) {
    const names = [...interaction.client.commands.keys()].sort();
    return interaction.reply({ content: `**Commands:** ${names.map(n => '`/'+n+'`').join(' ')}`, ephemeral: true });
  }
};
```

---

## Ship checklist (do this now)

1. Add `scripts/preflight.js` and wire it in `prestart`.
2. Add `src/lib/cooldown.js` and patch `security-bot.js` as shown.
3. Add `src/commands/version.js` (and optionally `/ping`, `/help`).
4. Run:

   ```bash
   npm run register:commands
   npm start
   ```
5. (Optional) Add the GitHub Action for nightly data health.

---

## What this unlocks

* You’ll *know* the live ruleset and snapshot quality every deploy.
* Rate-limits and spam won’t take your bot down.
* CI will warn you when upstream data changes in surprising ways.
* Adding new commands is now safe, predictable, and fast.

