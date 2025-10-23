/*
Main bot entry point.
Handles:
- Discord client initialization
- Message detection for battle triggers (👀 emoji)
- Loading Pokémon data
- Active battle tracking
*/

const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const dotenv = require('dotenv');
const {
  readCache,
  writeCache,
  cachePokemonList,
  cleanOldCache,
  getCacheBudget,
  getCacheSize,
  LAST_RUN_META_KEY,
  CACHE_DIR,
} = require('./cache');
const { initiateBattle } = require('./battles/battle-manager');
const { handleReaction, BATTLE_CHANNEL_NAME } = require('./battles/battle-channel');
const { promptUserSelection } = require('./utils/pokemon-picker');
const fs = require('fs');

dotenv.config();

cleanOldCache();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// Load Pokémon data from cache or JSON; support both array and roster-object formats
function transformRosterToArray(rosterFile) {
  try {
    if (!rosterFile || typeof rosterFile !== 'object') return null;
    const roster = Array.isArray(rosterFile) ? null : rosterFile.roster;
    if (!roster) return Array.isArray(rosterFile) ? rosterFile : null;
    const arr = Object.values(roster).map(p => {
      const statsArr = Array.isArray(p.stats) ? p.stats : [];
      const get = (n) => statsArr.find(s => s.name === n)?.base || 0;
      return {
        id: p.id,
        name: p.name,
        type: Array.isArray(p.types) ? p.types : [],
        level: 5,
        stats: {
          hp: get('hp'),
          attack: get('attack'),
          defense: get('defense'),
          specialAttack: get('special-attack'),
          specialDefense: get('special-defense'),
          speed: get('speed'),
        },
        rarity: p.isLegendary ? 'Legendary' : (p.isPseudoLegendary ? 'Pseudo-Legendary' : (p.isStarter ? 'Starter' : 'Common')),
        caughtBy: [],
      };
    });
    return arr;
  } catch {
    return null;
  }
}

let pokemonData = readCache('pokemonData');
if (!pokemonData) {
  const path = require('node:path');
  const dataPath = path.join(__dirname, 'data', 'pokemon.json');
  try {
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const asArray = transformRosterToArray(raw) || (Array.isArray(raw) ? raw : null);
    if (asArray) {
      pokemonData = asArray;
      writeCache('pokemonData', pokemonData);
      console.log(`[Pokémon Bot] Loaded ${pokemonData.length} Pokémon from data/pokemon.json`);
    } else {
      console.warn('[Pokémon Bot] data/pokemon.json format unrecognized. Starting with empty dataset.');
      pokemonData = [];
    }
  } catch (e) {
    console.warn('[Pokémon Bot] Failed to read data/pokemon.json:', e.message);
    pokemonData = [];
  }
}

cachePokemonList(pokemonData);

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) {
    return 'unknown';
  }
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function logCacheMonitorStatus(where = 'startup') {
  try {
    const meta = readCache(LAST_RUN_META_KEY) || {};
    const budget = getCacheBudget();
    const size = getCacheSize();
    const maxBytes = budget?.maxAllowedBytes || 0;
    const percent = maxBytes > 0 ? Math.min(999, Math.round((size / maxBytes) * 100)) : 0;
    const describe = (iso) => {
      if (!iso) return 'never';
      try {
        return new Date(iso).toLocaleString();
      } catch {
        return iso;
      }
    };
    const totalEntries = typeof meta.total === 'number' ? meta.total : (Array.isArray(pokemonData) ? pokemonData.length : 0);
    const previousEntries = typeof meta.previousTotal === 'number' ? meta.previousTotal : null;
    console.log('[Pokémon Cache Monitor]', {
      at: where,
      cacheDir: CACHE_DIR,
      cacheSize: formatBytes(size),
      budgetMax: formatBytes(maxBytes),
      percentUsed: `${percent}%`,
      approxFree: formatBytes(budget?.approxBytes),
      lastRunAt: describe(meta.lastRunAt),
      previousRunAt: describe(meta.previousRunAt),
      entries: totalEntries,
      previousEntries,
    });
  } catch (err) {
    console.warn('[Pokémon Cache Monitor] Failed to report status:', err.message);
  }
}

logCacheMonitorStatus('startup');

const CACHE_MONITOR_INTERVAL_MS = 1000 * 60 * 30; // 30 minutes
setInterval(() => logCacheMonitorStatus('interval'), CACHE_MONITOR_INTERVAL_MS).unref?.();

// In-memory active battles
const activeBattles = {};

// Listen for messages
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // DM command: choose a Pokémon
  if (!message.guild && (message.content.trim().toLowerCase().startsWith('!choose') || message.content.trim().toLowerCase().startsWith('!pickpokemon'))) {
    try {
      const profile = await promptUserSelection(message.author);
      if (!profile) return;
    } catch (err) {
      console.error('[DM CHOOSE ERROR]', err);
    }
    return;
  }

  // Leaderboard command (works in guilds or DMs)
  if (message.content.trim().toLowerCase() === '!leaderboard') {
    const all = getAllUserData();
    if (!all.length) {
      await message.channel.send('No trainers on the board yet. Use !choose in DMs to pick your Pokémon.');
      return;
    }
    // Sort by xp (fallbacks for different shapes)
    const sorted = all
      .map(u => ({
        name: u.pokemon?.name || 'Unknown',
        level: u.level ?? u.pokemon?.level ?? 1,
        xp: u.xp ?? u.pokemon?.xp ?? 0,
      }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 10);

    let board = '🏆 Pokémon Leaderboard 🏆\n';
    sorted.forEach((u, i) => {
      board += `${i + 1}. ${u.name} (Level ${u.level}, XP ${u.xp})\n`;
    });
    await message.channel.send(board);
    return;
  }

  // Trigger battle when message contains 👀 emoji
  if (message.content.includes('👀')) {
    const challengerId = message.author.id;
    const opponent = message.mentions.users.first();
    if (!opponent) {
      await message.reply('You need to mention a user to battle!');
      return;
    }

    const battleId = `${challengerId}-${opponent.id}`;
    if (activeBattles[battleId]) {
      await message.reply('Battle already in progress!');
      return;
    }

    try {
      const result = await initiateBattle(challengerId, opponent.id, pokemonData);
      activeBattles[battleId] = result;

      await message.reply({
        content: `⚔️ Battle completed! <@${result.winner}> defeated <@${result.loser}>.`,
        allowedMentions: { users: [] }
      });
    } catch (error) {
      console.error('Battle initiation failed:', error);
      await message.reply('Something went wrong starting the battle.');
    } finally {
      delete activeBattles[battleId];
    }
  }
});

// Reaction handler for battles in dedicated channel
client.on('messageReactionAdd', async (reaction, user) => {
  await handleReaction(reaction, user);
});

client.once('ready', () => {
  console.log(`✅ Pokémon Discord Bot is running as ${client.user.tag}!`);
  // Ensure battle channel exists in each guild
  client.guilds.cache.forEach(async (guild) => {
    try {
      const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === BATTLE_CHANNEL_NAME);
      if (!existing) {
        await guild.channels.create({ name: BATTLE_CHANNEL_NAME, type: ChannelType.GuildText, reason: 'Pokémon battles channel' });
        console.log(`[BATTLE CHANNEL] Created #${BATTLE_CHANNEL_NAME} in ${guild.name}`);
      }
    } catch (err) {
      console.warn(`[BATTLE CHANNEL WARN] ${guild.name}:`, err.message);
    }
  });
});

client.login(process.env.BOT_TOKEN);
