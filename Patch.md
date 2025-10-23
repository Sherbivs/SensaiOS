Perfect. Here’s a **draft patch for the Pokémon API caching and DM starter selection**, fully Node.js/Discord.js-compatible and aligned with your current directory layout.

---

# **Patch: Full Pokémon Roster Fetch & Starter Selection**

## 1. **New file: `utils/pokemon-fetcher.js`**

```js
// discord-pokemon-bot/utils/pokemon-fetcher.js
// Fetch all Pokémon from PokéAPI, cache locally in data/pokemon.json

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const CACHE_PATH = path.join(__dirname, '../data/pokemon.json');

async function fetchAllPokemon() {
  const url = 'https://pokeapi.co/api/v2/pokemon?limit=2000'; // large limit for all Pokémon
  const res = await fetch(url);
  const data = await res.json();
  const allPokemon = data.results;
  return allPokemon;
}

async function fetchPokemonDetails(name) {
  const url = `https://pokeapi.co/api/v2/pokemon/${name}`;
  const res = await fetch(url);
  const data = await res.json();

  // Map relevant stats and moves
  return {
    id: data.id,
    name: data.name,
    types: data.types.map(t => t.type.name),
    stats: data.stats.map(s => ({ name: s.stat.name, base: s.base_stat })),
    moves: data.moves
      .filter(m => m.version_group_details.some(v => v.move_learn_method.name === 'level-up'))
      .map(m => ({
        name: m.move.name,
        level: Math.min(...m.version_group_details.map(v => v.level_learned_at)),
      })),
    sprite: data.sprites.front_default,
    isStarter: false,         // set later for rules
    isLegendary: false,       // placeholder; use Pokédex data if available
    isPseudoLegendary: false, // placeholder
    stage: 'baby|1',           // placeholder, to be expanded
  };
}

async function buildPokemonRoster() {
  console.log('[Pokémon Fetch] Fetching all Pokémon list...');
  const allPokemonList = await fetchAllPokemon();
  const roster = {};

  for (const poke of allPokemonList) {
    try {
      const details = await fetchPokemonDetails(poke.name);
      roster[details.name] = details;
      console.log(`[Pokémon Fetch] Added: ${details.name}`);
    } catch (err) {
      console.error('[Pokémon Fetch ERROR]', poke.name, err.message);
    }
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify({ lastUpdated: Date.now(), roster }, null, 2));
  console.log('[Pokémon Fetch] Cache written to', CACHE_PATH);
}

module.exports = {
  fetchAllPokemon,
  fetchPokemonDetails,
  buildPokemonRoster,
  CACHE_PATH,
};
```

---

## 2. **Update: `pokemon-bot.js`** (load roster & DM starter filter)

```js
// discord-pokemon-bot/pokemon-bot.js
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { CACHE_PATH } = require('./utils/pokemon-fetcher');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], partials: ['CHANNEL'] });

let pokemonRoster = {};

// Load cached roster on startup
function loadPokemonRoster() {
  if (fs.existsSync(CACHE_PATH)) {
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    pokemonRoster = data.roster || {};
    console.log(`[Pokémon Bot] Loaded ${Object.keys(pokemonRoster).length} Pokémon from cache`);
  } else {
    console.warn('[Pokémon Bot] No cached roster found! Run fetcher first.');
  }
}

// DM starter selection (filtered)
function getEligibleStarters() {
  return Object.values(pokemonRoster).filter(p => 
    !p.isStarter && 
    !p.isLegendary && 
    !p.isPseudoLegendary && 
    p.stage === 'baby|1'
  );
}

client.on('messageCreate', async (msg) => {
  if (msg.channel.type !== 1) return; // Only handle DMs
  if (msg.content.toLowerCase() === '!choose') {
    const starters = getEligibleStarters();
    if (!starters.length) return msg.reply('No eligible Pokémon available.');

    const sample = starters.slice(0, 10); // show 10 choices
    let reply = '**Choose your Pokémon:**\n';
    sample.forEach((p, i) => reply += `\`${i + 1}\` - ${p.name} (${p.types.join(', ')})\n`);
    await msg.reply(reply);

    // Next step: user DM replies with selection number
    // Cache user selection per-user in cache/users/{userId}.json
  }
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  loadPokemonRoster();
});

client.login(process.env.BOT_TOKEN);
```

---

## 3. **Next Steps / Recommendations**

1. **User Cache**: Create `cache/users/{userId}.json` to store:

   * Selected Pokémon
   * Level, XP, HP, cooldowns
   * Battle history
2. **Battle Manager**:

   * Pull Pokémon stats from per-user cache + global roster
   * Implement turn-based mechanics triggered by emoji
   * Store battle logs in a dedicated channel
3. **Refresh Pokémon Cache**:

   * Optional command `!refreshRoster` for admins
   * Automatically scheduled weekly or monthly
4. **Starter Filter**:

   * Keep rules only at DM selection
   * Full roster remains in cache for battles, moves, and leveling

---

✅ With this patch, we now have a **full Pokémon roster cached**, **starter rules separated**, and **DM selection ready**.

---

I can produce the **next patch for per-user cache + battle manager integration** next, including storing Pokémon stats, XP, HP, cooldowns, and tracking battles in a channel.

Do you want me to do that now?
