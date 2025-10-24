Heck yes—let’s bolt in three slash commands that read from your most‑current snapshot and reply instantly, zero API calls. Everything below is drop‑in CommonJS, tuned for Discord.js v14, and guarded so you won’t accidentally break prod.

Assumptions

You already run npm run build:data to produce:

dist/data/dex.min.json

dist/data/moves.min.json

dist/meta/version.json

Your entry file is security-bot.js (from your logs).

Environment: DISCORD_TOKEN, DISCORD_CLIENT_ID, and (optionally) DISCORD_GUILD_ID.

1) Tiny runtime API over your snapshot

src/lib/dex-api.js

'use strict';
const fs = require('fs');
const path = require('path');

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

const ROOT = process.cwd();
const DEX_PATH   = path.join(ROOT, 'dist', 'data', 'dex.min.json');
const MOVES_PATH = path.join(ROOT, 'dist', 'data', 'moves.min.json');
const META_PATH  = path.join(ROOT, 'dist', 'meta', 'version.json');

if (!fs.existsSync(DEX_PATH) || !fs.existsSync(MOVES_PATH)) {
  throw new Error('Missing dist data. Run `npm run build:data` first.');
}

const dexArr = loadJSON(DEX_PATH);
const movesObj = loadJSON(MOVES_PATH);
const meta = fs.existsSync(META_PATH) ? loadJSON(META_PATH) : { version_group: 'latest' };

// Indexes
const byName = new Map(dexArr.map(p => [p.name.toLowerCase(), p]));
const byId   = new Map(dexArr.map(p => [p.id, p]));
const moveByName = new Map(Object.entries(movesObj).map(([k,v]) => [k.toLowerCase(), v]));

// Simple normalization + a few useful aliases
const ALIASES = new Map([
  ['mr mime', 'mr-mime'],
  ['mr. mime', 'mr-mime'],
  ['nidoran♀', 'nidoran-f'],
  ['nidoran♂', 'nidoran-m'],
  ['type null', 'type-null'],
  ['jangmo o', 'jangmo-o'], ['hakamo o', 'hakamo-o'], ['kommo o', 'kommo-o'],
  ['tapu koko', 'tapu-koko'], ['tapu lele', 'tapu-lele'], ['tapu bulu', 'tapu-bulu'], ['tapu fini', 'tapu-fini'],
]);

function normalize(q) {
  return String(q).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’'`]/g, "'");
}

function resolveName(q) {
  const n = normalize(q);
  if (byName.has(n)) return n;
  if (ALIASES.has(n)) return ALIASES.get(n);
  // soft search: try exact no-space, hyphenated, and includes
  const compact = n.replace(/[\s.]+/g, '-');
  if (byName.has(compact)) return compact;
  const withSpace = n.replace(/-/g, ' ');
  if (byName.has(withSpace)) return withSpace;
  // fallback: best "includes" match
  const cand = [...byName.keys()].find(k => k.includes(n)) || null;
  return cand;
}

function getPokemon(q) {
  if (typeof q === 'number') return byId.get(q) || null;
  const name = resolveName(q);
  return name ? byName.get(name) || null : null;
}

function getMove(name) {
  if (!name) return null;
  const n = normalize(name);
  return moveByName.get(n) || moveByName.get(n.replace(/\s+/g, '-')) || null;
}

function suggestPokemon(prefix, limit=25) {
  const n = normalize(prefix);
  if (!n) return [];
  const seen = new Set();
  const out = [];
  for (const k of byName.keys()) {
    if (out.length >= limit) break;
    if (k.startsWith(n) || k.includes(n)) { // simple, fast
      if (!seen.has(k)) { out.push(k); seen.add(k); }
    }
  }
  return out.slice(0, limit);
}

module.exports = { getPokemon, getMove, suggestPokemon, meta, dex: dexArr, moves: movesObj };


src/lib/type-colors.js (nice embeds)

'use strict';
module.exports = {
  normal: 0xA8A77A, fire: 0xEE8130, water: 0x6390F0, electric: 0xF7D02C,
  grass: 0x7AC74C, ice: 0x96D9D6, fighting: 0xC22E28, poison: 0xA33EA1,
  ground: 0xE2BF65, flying: 0xA98FF3, psychic: 0xF95587, bug: 0xA6B91A,
  rock: 0xB6A136, ghost: 0x735797, dragon: 0x6F35FC, dark: 0x705746,
  steel: 0xB7B7CE, fairy: 0xD685AD
};

2) Slash commands
/dex — compact overview

src/commands/dex.js

'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { getPokemon, suggestPokemon, meta } = require('../lib/dex-api');
const TYPE_COLORS = require('../lib/type-colors');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dex')
    .setDescription('Show Pokédex info for a Pokémon (latest ruleset)')
    .addStringOption(o => o.setName('name').setDescription('Name or ID').setRequired(true))
    .setDMPermission(false)
    .setIntegrationTypes?.([]) ?? undefined, // harmless in older discord.js
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const list = suggestPokemon(focused).map(n => ({ name: n, value: n })).slice(0,25);
    await interaction.respond(list);
  },
  async execute(interaction) {
    const q = interaction.options.getString('name');
    const mon = /^\d+$/.test(q) ? getPokemon(Number(q)) : getPokemon(q);

    if (!mon) {
      return interaction.reply({ content: 'Pokémon not found. Try `/dex pikachu`.', ephemeral: true });
    }

    const color = TYPE_COLORS[mon.types[0]] ?? 0x2F3136;
    const statLines = Object.entries(mon.stats)
      .map(([k,v]) => `${k.replace('-', ' ')}: **${v}**`).join('  •  ');

    const fields = [
      { name: 'Types', value: mon.types.join(' / '), inline: true },
      { name: 'Abilities', value: mon.abilities.map(a => `${a.hidden?'(H) ':''}${a.name}`).join(', '), inline: true },
      { name: 'Base Stats', value: statLines || '—', inline: false },
    ];

    return interaction.reply({
      embeds: [{
        title: `#${mon.id} — ${mon.name}`,
        color,
        fields,
        footer: { text: `Ruleset: ${meta.version_group || 'latest'}` }
      }]
    });
  }
};

/move — move details

src/commands/move.js

'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { getMove, moves } = require('../lib/dex-api');
const TYPE_COLORS = require('../lib/type-colors');

const MOVE_LIST = Object.keys(moves).sort();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Show move details')
    .addStringOption(o => o.setName('name').setDescription('Move name').setRequired(true))
    .setDMPermission(false),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const picks = MOVE_LIST.filter(n => n.startsWith(focused) || n.includes(focused))
      .slice(0,25).map(n => ({ name: n, value: n }));
    await interaction.respond(picks);
  },
  async execute(interaction) {
    const q = interaction.options.getString('name');
    const m = getMove(q);
    if (!m) return interaction.reply({ content: 'Move not found.', ephemeral: true });

    const color = TYPE_COLORS[m.type] ?? 0x2F3136;

    return interaction.reply({
      embeds: [{
        title: m.name,
        color,
        fields: [
          { name: 'Type', value: m.type || '—', inline: true },
          { name: 'Class', value: m.class || '—', inline: true },
          { name: 'Power', value: String(m.power ?? '—'), inline: true },
          { name: 'Accuracy', value: m.accuracy != null ? `${m.accuracy}%` : '—', inline: true },
          { name: 'PP', value: String(m.pp ?? '—'), inline: true },
          { name: 'Priority', value: String(m.priority ?? 0), inline: true },
          { name: 'Effect', value: m.effect || '—', inline: false },
        ]
      }]
    });
  }
};

/weak — weaknesses/resistances from precomputed matchups

src/commands/weak.js

'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { getPokemon, meta } = require('../lib/dex-api');
const TYPE_COLORS = require('../lib/type-colors');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weak')
    .setDescription('Show type multipliers (damage taken) for a Pokémon')
    .addStringOption(o => o.setName('name').setDescription('Name or ID').setRequired(true))
    .setDMPermission(false),
  async execute(interaction) {
    const q = interaction.options.getString('name');
    const mon = /^\d+$/.test(q) ? getPokemon(Number(q)) : getPokemon(q);
    if (!mon) return interaction.reply({ content: 'Pokémon not found.', ephemeral: true });

    const color = TYPE_COLORS[mon.types[0]] ?? 0x2F3136;
    const mults = Object.entries(mon.matchups);
    const buckets = { '4×':[], '2×':[], '½×':[], '¼×':[], '0×':[] };

    for (const [t,m] of mults) {
      if (m === 4) buckets['4×'].push(t);
      else if (m === 2) buckets['2×'].push(t);
      else if (m === 0.5) buckets['½×'].push(t);
      else if (m === 0.25) buckets['¼×'].push(t);
      else if (m === 0) buckets['0×'].push(t);
    }

    const lines = Object.entries(buckets)
      .filter(([,arr]) => arr.length)
      .map(([k, arr]) => `**${k}**  ${arr.join(', ')}`)
      .join('\n') || 'All neutral (1×)';

    return interaction.reply({
      embeds: [{
        title: `${mon.name} — weaknesses & resistances`,
        color,
        fields: [{ name: 'Multipliers', value: lines }],
        footer: { text: `Ruleset: ${meta.version_group || 'latest'}` }
      }]
    });
  }
};

3) Command loader & interaction handling
Minimal loader

src/command-loader.js

'use strict';
const fs = require('fs');
const path = require('path');

function loadCommands() {
  const dir = path.join(process.cwd(), 'src', 'commands');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  const commands = new Map();
  for (const f of files) {
    const mod = require(path.join(dir, f));
    if (mod?.data?.name && typeof mod.execute === 'function') {
      commands.set(mod.data.name, mod);
    }
  }
  return commands;
}

module.exports = { loadCommands };

Wire into your entry (security-bot.js)

Replace the core with this command-aware skeleton (or merge in if you already have logic):

security-bot.js

'use strict';
require('dotenv').config?.();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const { loadCommands } = require('./src/command-loader');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Load commands
const commands = loadCommands();
client.commands = new Collection([...commands.entries()]);

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag} with ${commands.size} slash commands loaded.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Autocomplete support
    if (interaction.isAutocomplete()) {
      const cmd = commands.get(interaction.commandName);
      if (cmd?.autocomplete) {
        return cmd.autocomplete(interaction);
      }
    }

    if (!interaction.isChatInputCommand()) return;
    const cmd = commands.get(interaction.commandName);
    if (!cmd) return interaction.reply({ content: 'Unknown command.', ephemeral: true });

    await cmd.execute(interaction);
  } catch (err) {
    console.error('Command error:', err);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: 'Something went wrong.' });
    }
    return interaction.reply({ content: 'Something went wrong.', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);

4) Register the slash commands

scripts/register-commands.js

'use strict';
require('dotenv').config?.();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID');
  process.exit(1);
}

function readCommandJSON() {
  const dir = path.join(process.cwd(), 'src', 'commands');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  const body = [];
  for (const f of files) {
    const mod = require(path.join(dir, f));
    if (mod?.data) body.push(mod.data.toJSON());
  }
  return body;
}

(async function main() {
  const commands = readCommandJSON();
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    if (DISCORD_GUILD_ID) {
      const route = Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID);
      await rest.put(route, { body: commands });
      console.log(`Registered ${commands.length} guild commands to ${DISCORD_GUILD_ID}.`);
    } else {
      const route = Routes.applicationCommands(DISCORD_CLIENT_ID);
      await rest.put(route, { body: commands });
      console.log(`Registered ${commands.length} global commands.`);
      console.log('Heads-up: global command propagation can take up to an hour.');
    }
  } catch (e) {
    console.error('Failed to register commands:', e);
    process.exit(1);
  }
})();


Add npm scripts:

package.json (add/merge)

{
  "scripts": {
    "build:data": "node scripts/build-data.js",
    "test:data": "node scripts/test-data.js",
    "refresh:data": "npm run build:data && npm run test:data",
    "register:commands": "node scripts/register-commands.js",
    "start": "node security-bot.js"
  }
}


Register them (guild-scoped is fastest while iterating):

# .env must contain DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
npm run register:commands

5) Quick verification checklist

 npm run refresh:data succeeds (invariants pass).

 npm run register:commands reports success.

 Start the bot → Logged in as ... with 3 slash commands loaded.

 In your server, run /dex pikachu, /move thunderbolt, /weak charizard.

If anything smells off, you’ll see a clean error in the bot logs and an ephemeral error in Discord rather than a crash.

Where to go next

Autocomplete polish: keep a cached list of names and do smarter ranking (prefix > substring).

Aliases file: generate dist/meta/aliases.json at build‑time for tricky forms and regional variants.