# Applies the Pokémon Bot Expansion skeleton to the current workspace
# Safe to re-run: makes timestamped backups when overwriting existing files
# Usage (PowerShell):
#   pwsh -File ./apply-pokemon-skeleton-patch.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Backup-IfExists([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Copy-Item -LiteralPath $Path -Destination "$Path.$stamp.bak" -Force
  }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$botDir = Join-Path $root 'discord-pokemon-bot'
$utilsDir = Join-Path $botDir 'utils'
$battlesDir = Join-Path $botDir 'battles'

Ensure-Dir $botDir
Ensure-Dir $utilsDir
Ensure-Dir $battlesDir

# 1) Root forwarder
$rootIndex = Join-Path $root 'index.js'
Backup-IfExists $rootIndex
@'
// Forwarder for compatibility with older start commands
require('./security-bot.js');
'@ | Set-Content -LiteralPath $rootIndex -Encoding UTF8

# 2) Pokémon forwarders
$pokeIndex = Join-Path $botDir 'index.js'
Backup-IfExists $pokeIndex
@'
// Forwarder for compatibility
require('./pokemon-bot.js');
'@ | Set-Content -LiteralPath $pokeIndex -Encoding UTF8

$battleShim = Join-Path $battlesDir 'battleManager.js'
Backup-IfExists $battleShim
@'
// Deprecated shim: forward to new file name
module.exports = require('./battle-manager.js');
'@ | Set-Content -LiteralPath $battleShim -Encoding UTF8

# 3) cache.js (with per-user API)
$cachePath = Join-Path $botDir 'cache.js'
Backup-IfExists $cachePath
@'
// cache.js (pokemon bot)
// JSON file-backed cache for Pokémon data and per-user profiles

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PRIMARY_CACHE_DIR = '/Store/pokemon-cache';
const FALLBACK_CACHE_DIR = path.join(process.cwd(), 'Store', 'pokemon-cache');
const MAX_CACHE_PERCENT = 0.25;
const MAX_CACHE_FILE_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const test = path.join(dir, '.write-test');
    fs.writeFileSync(test, String(Date.now()));
    fs.unlinkSync(test);
    return true;
  } catch {
    return false;
  }
}

const CACHE_DIR = ensureDir(PRIMARY_CACHE_DIR) ? PRIMARY_CACHE_DIR : (ensureDir(FALLBACK_CACHE_DIR), FALLBACK_CACHE_DIR);
const USERS_DIR = path.join(CACHE_DIR, 'users');
ensureDir(USERS_DIR);

function getCachePath(key) {
  const safe = key.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
  return path.join(CACHE_DIR, `${safe}.json`);
}

// -----------------------------
// Key/value cache (existing API)
// -----------------------------
function readCache(key) {
  try {
    const p = getCachePath(key);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error('[CACHE READ ERROR]', key, err.message);
    return null;
  }
}

function writeCache(key, data) {
  try {
    const p = getCachePath(key);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    pruneCache();
  } catch (err) {
    console.error('[CACHE WRITE ERROR]', key, err.message);
  }
}

// -----------------------------
// Per-user cache (new API)
// -----------------------------
function getUserCachePath(userId) {
  const id = String(userId).trim();
  return path.join(USERS_DIR, `${id}.json`);
}

function getUserData(userId) {
  try {
    const p = getUserCachePath(userId);
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    console.log(`[CACHE READ] User ${userId}`);
    return data;
  } catch (err) {
    console.error('[CACHE ERROR] getUserData', err.message);
    return null;
  }
}

function setUserData(userId, data) {
  try {
    const p = getUserCachePath(userId);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[CACHE WRITE] User ${userId}`);
  } catch (err) {
    console.error('[CACHE ERROR] setUserData', err.message);
  }
}

function deleteUserData(userId) {
  try {
    const p = getUserCachePath(userId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    console.log(`[CACHE DELETE] User ${userId}`);
  } catch (err) {
    console.error('[CACHE ERROR] deleteUserData', err.message);
  }
}

function getAllUserData() {
  try {
    const files = fs.readdirSync(USERS_DIR).filter(f => f.toLowerCase().endsWith('.json'));
    return files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(USERS_DIR, f), 'utf8'));
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function approxFreeBytes() {
  return Math.max(os.freemem(), 512 * 1024 * 1024);
}

function getCacheSize() {
  try {
    return fs.readdirSync(CACHE_DIR).reduce((sum, f) => sum + (fs.statSync(path.join(CACHE_DIR, f)).size || 0), 0);
  } catch {
    return 0;
  }
}

function pruneCache() {
  let entries = [];
  try {
    entries = fs.readdirSync(CACHE_DIR).map(f => {
      const fp = path.join(CACHE_DIR, f);
      const st = fs.statSync(fp);
      return { filePath: fp, mtime: st.mtimeMs, size: st.size || 0 };
    }).sort((a, b) => a.mtime - b.mtime);
  } catch {
    return;
  }
  let total = getCacheSize();
  const budget = Math.floor(approxFreeBytes() * MAX_CACHE_PERCENT);
  for (const e of entries) {
    if (total <= budget) break;
    try {
      fs.unlinkSync(e.filePath);
      total -= e.size;
      console.log(`[CACHE PRUNE] ${path.basename(e.filePath)} removed`);
    } catch (err) {
      console.error('[CACHE PRUNE ERROR]', err.message);
    }
  }
}

function cleanOldCache() {
  const now = Date.now();
  let files = [];
  try {
    files = fs.readdirSync(CACHE_DIR).map(f => path.join(CACHE_DIR, f));
  } catch { return; }
  for (const fp of files) {
    try {
      const st = fs.statSync(fp);
      if (now - st.mtimeMs > MAX_CACHE_FILE_AGE_MS) {
        fs.unlinkSync(fp);
        console.log(`[CACHE CLEANUP] ${path.basename(fp)} removed`);
      }
    } catch (err) {
      console.error('[CACHE CLEANUP ERROR]', err.message);
    }
  }
}

module.exports = {
  CACHE_DIR,
  USERS_DIR,
  readCache,
  writeCache,
  pruneCache,
  cleanOldCache,
  // per-user API
  getUserData,
  setUserData,
  deleteUserData,
  getAllUserData,
};
'@ | Set-Content -LiteralPath $cachePath -Encoding UTF8

# 4) pokemon-picker.js
$pickerPath = Join-Path $utilsDir 'pokemon-picker.js'
Backup-IfExists $pickerPath
@'
// utils/pokemon-picker.js
// DM-based Pokémon picker with simple collector

const { setUserData } = require('../cache');
const path = require('node:path');
const fs = require('node:fs');

function loadPokemonDataset() {
  const dataPath = path.join(__dirname, '..', 'data', 'pokemon.json');
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

function getSelectablePokemon(list) {
  // With current dataset, no stage/starter flags; allow all for now
  return Array.isArray(list) ? list : [];
}

async function promptUserSelection(user) {
  const dataset = loadPokemonDataset();
  const selectable = getSelectablePokemon(dataset);
  if (!selectable.length) return;

  const dm = await user.createDM();
  const top = selectable.slice(0, 10);
  const menu = top.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
  await dm.send(`Choose your Pokémon by replying with the number or name within 60 seconds.\n${menu}`);

  const filter = (m) => m.author.id === user.id;
  const collector = dm.createMessageCollector({ filter, max: 1, time: 60_000 });

  return new Promise((resolve) => {
    collector.on('collect', async (m) => {
      const content = m.content.trim();
      let choice = null;
      const num = Number(content);
      if (!Number.isNaN(num) && num >= 1 && num <= top.length) {
        choice = top[num - 1];
      } else {
        choice = selectable.find(p => p.name.toLowerCase() === content.toLowerCase());
      }

      if (choice) {
        const profile = { pokemon: choice, level: 1, xp: 0, hp: choice?.stats?.hp ?? 100, updatedAt: new Date().toISOString() };
        setUserData(user.id, profile);
        await dm.send(`You chose ${choice.name}!`);
        resolve(profile);
      } else {
        await dm.send('Invalid choice. Try again later with !pickpokemon.');
        resolve(null);
      }
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        try { await dm.send('Selection timed out. Try again with !pickpokemon.'); } catch {}
        resolve(null);
      }
    });
  });
}

module.exports = { promptUserSelection };
'@ | Set-Content -LiteralPath $pickerPath -Encoding UTF8

# 5) battle-channel.js
$battleChannelPath = Join-Path $battlesDir 'battle-channel.js'
Backup-IfExists $battleChannelPath
@'
// battles/battle-channel.js
// Emoji-triggered battle handler for a dedicated channel

const { ChannelType } = require('discord.js');
const { getUserData } = require('../cache');
const { initiateBattle } = require('./battle-manager');

const BATTLE_CHANNEL_NAME = process.env.BATTLE_CHANNEL_NAME || 'pokemon-battles';
const activeBattles = new Map();
const ALLOWED_EMOJIS = new Set(['⭐', '⚡', '🔥', '💧', '👀']);

async function handleReaction(reaction, user) {
  try {
    if (user.bot) return;

    // Ensure full objects when partials are enabled
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    const message = reaction.message;
    if (!message || !message.channel) return;

    const channel = message.channel;
    if (channel.type !== ChannelType.GuildText) return;
    if (channel.name !== BATTLE_CHANNEL_NAME) return;

    const emojiName = reaction.emoji?.name;
    if (!ALLOWED_EMOJIS.has(emojiName)) return;

    const opponent = message.mentions?.users?.first?.();
    if (!opponent) {
      await channel.send(`${user.username}, you must mention someone to challenge!`);
      return;
    }

    const userProfile = getUserData(user.id);
    const oppProfile = getUserData(opponent.id);
    if (!userProfile || !oppProfile) {
      await channel.send(`Both players must choose their Pokémon in DMs first (use !pickpokemon).`);
      return;
    }

    const battleId = `${user.id}-${opponent.id}-${Date.now()}`;
    if (activeBattles.has(battleId)) return; // already running

    activeBattles.set(battleId, { channelId: channel.id, users: [user.id, opponent.id], startedAt: Date.now() });

    // Use existing immediate battle flow for now
    const result = await initiateBattle(user.id, opponent.id, []);
    await channel.send(`⚔️ Battle finished! <@${result.winner}> defeated <@${result.loser}>.`);

    activeBattles.delete(battleId);
  } catch (err) {
    console.error('[BATTLE CHANNEL ERROR]', err);
  }
}

module.exports = { handleReaction, activeBattles, BATTLE_CHANNEL_NAME };
'@ | Set-Content -LiteralPath $battleChannelPath -Encoding UTF8

# 6) pokemon-bot.js (wire DMs, reactions, robust data path)
$pokeBotPath = Join-Path $botDir 'pokemon-bot.js'
Backup-IfExists $pokeBotPath
@'
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
const { readCache, writeCache, getUserData, setUserData, getAllUserData } = require('./cache');
const { initiateBattle } = require('./battles/battle-manager');
const { handleReaction, BATTLE_CHANNEL_NAME } = require('./battles/battle-channel');
const { promptUserSelection } = require('./utils/pokemon-picker');
const fs = require('fs');

dotenv.config();

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

// Load Pokémon data from cache or JSON
let pokemonData = readCache('pokemonData');
if (!pokemonData) {
  const path = require('node:path');
  const dataPath = path.join(__dirname, 'data', 'pokemon.json');
  pokemonData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  writeCache('pokemonData', pokemonData);
}

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
'@ | Set-Content -LiteralPath $pokeBotPath -Encoding UTF8

# 7) battle-manager.js (integrated per-user profiles, safe fallbacks)
$managerPath = Join-Path $battlesDir 'battle-manager.js'
Backup-IfExists $managerPath
@'
/*
Handles all battle logic.
Features:
- Turn-based system between two Pokémon
- Simple damage calculation
- Tracks HP and levels
- Updates cache to persist Pokémon level-ups
*/

const { writeCache, getUserData, setUserData } = require('../cache');
const { levelUp } = require('../utils/pokemon-helpers');

// Simple damage calculation formula
function calculateDamage(attacker, defender) {
  return Math.max(1, attacker.stats.attack - Math.floor(defender.stats.defense / 2));
}

function selectPokemonForUser(userId, pokemonData, fallbackIndex) {
  // Prefer per-user selected Pokémon from profile cache
  const profile = getUserData(userId);
  if (profile?.pokemon) {
    return JSON.parse(JSON.stringify(profile.pokemon));
  }
  // Fallback: pick from dataset (first/second)
  const length = Array.isArray(pokemonData) ? pokemonData.length : 0;
  if (length > 0) {
    const idx = Math.max(0, Math.min(length - 1, fallbackIndex));
    const base = pokemonData[idx];
    if (base) return JSON.parse(JSON.stringify(base));
  }
  // As a last resort, return a minimal placeholder to avoid crashing
  return { name: 'Missingno', stats: { hp: 50, attack: 10, defense: 10, specialAttack: 10, specialDefense: 10, speed: 10 } };
}

// Initiate a battle between two users
async function initiateBattle(challengerId, opponentId, pokemonData) {
  const challengerPokemon = selectPokemonForUser(challengerId, pokemonData, 0);
  const opponentPokemon = selectPokemonForUser(opponentId, pokemonData, 1);

  let challengerHP = challengerPokemon.stats.hp;
  let opponentHP = opponentPokemon.stats.hp;
  let turn = 'challenger';
  const battleLog = [];

  while (challengerHP > 0 && opponentHP > 0) {
    if (turn === 'challenger') {
      const dmg = calculateDamage(challengerPokemon, opponentPokemon);
      opponentHP -= dmg;
      battleLog.push({ actor: challengerId, target: opponentId, damage: dmg, remainingHP: Math.max(0, opponentHP) });
      turn = 'opponent';
    } else {
      const dmg = calculateDamage(opponentPokemon, challengerPokemon);
      challengerHP -= dmg;
      battleLog.push({ actor: opponentId, target: challengerId, damage: dmg, remainingHP: Math.max(0, challengerHP) });
      turn = 'challenger';
    }
  }

  const winnerId = challengerHP > 0 ? challengerId : opponentId;
  const loserId = winnerId === challengerId ? opponentId : challengerId;

  // Award XP/level to winner's profile
  const winnerProfile = getUserData(winnerId) || { pokemon: selectPokemonForUser(winnerId, pokemonData, 0), level: 1, xp: 0, hp: 100 };
  winnerProfile.xp = (winnerProfile.xp || 0) + 50;
  // Simple level-up rule: every 100 XP
  while (winnerProfile.xp >= 100) {
    winnerProfile.xp -= 100;
    winnerProfile.level = (winnerProfile.level || 1) + 1;
    // apply helper to evolve stats if available
    if (winnerProfile.pokemon) {
      try { winnerProfile.pokemon = levelUp(winnerProfile.pokemon); } catch {}
    }
  }
  winnerProfile.updatedAt = new Date().toISOString();
  setUserData(winnerId, winnerProfile);

  // Persist any dataset changes if needed (kept for compatibility)
  if (Array.isArray(pokemonData) && pokemonData.length > 0) {
    writeCache('pokemonData', pokemonData);
  }

  return {
    winner: winnerId,
    loser: loserId,
    battleLog,
    challengerPokemon,
    opponentPokemon,
  };
}

module.exports = { initiateBattle };
'@ | Set-Content -LiteralPath $managerPath -Encoding UTF8

Write-Host '✅ Pokémon skeleton patch applied.' -ForegroundColor Green

# Mechanics expansion additions (helpers and class-based manager)
$helpersPath = Join-Path $utilsDir 'pokemon-helpers.js'
Backup-IfExists $helpersPath
@'
/*
Helper functions for Pokémon management.
- Level up adjustments
- Status effects engine
- Damage calculation
*/

function levelUp(pokemon) {
  const updated = { ...pokemon };
  updated.level = (updated.level || 1) + 1;
  const s = updated.stats || {};
  updated.stats = {
    ...s,
    hp: (s.hp || 0) + 5,
    attack: (s.attack || 0) + 2,
    defense: (s.defense || 0) + 2,
    specialAttack: (s.specialAttack || 0) + 2,
    specialDefense: (s.specialDefense || 0) + 2,
    speed: (s.speed || 0) + 1,
  };
  return updated;
}

const STATUS_EFFECTS = {
  burn: {
    onTurn: (pokemon) => {
      const lvl = pokemon.level || 1;
      const dmg = Math.max(1, Math.floor(lvl * 0.1));
      if (pokemon.currentHp != null) pokemon.currentHp = Math.max(0, pokemon.currentHp - dmg);
      return dmg;
    },
    preventsAction: false,
  },
  poison: {
    onTurn: (pokemon) => {
      const lvl = pokemon.level || 1;
      const dmg = Math.max(1, Math.floor(lvl * 0.1));
      if (pokemon.currentHp != null) pokemon.currentHp = Math.max(0, pokemon.currentHp - dmg);
      return dmg;
    },
    preventsAction: false,
  },
  sleep: { onTurn: () => 0, preventsAction: true },
  paralysis: { onTurn: () => 0, preventsAction: () => Math.random() < 0.25 },
};

function applyStatusEffects(pokemon) {
  const statuses = Array.isArray(pokemon.status) ? pokemon.status : [];
  let total = 0;
  for (const eff of statuses) {
    const def = STATUS_EFFECTS[eff];
    if (!def) continue;
    try { total += def.onTurn(pokemon) || 0; } catch {}
  }
  return total;
}

function calculateDamage(attacker, defender, move) {
  const level = attacker.level || 1;
  const power = move?.power || 10;
  const physical = (move?.category || 'Physical') === 'Physical';
  const aStats = attacker.stats || {};
  const dStats = defender.stats || {};
  const attackStat = physical ? (aStats.attack || 10) : (aStats.specialAttack || 10);
  const defenseStat = physical ? (dStats.defense || 10) : (dStats.specialDefense || 10);
  let damage = Math.floor((((2 * level) / 5 + 2) * power * (attackStat / Math.max(1, defenseStat))) / 50 + 2);
  try {
    if (Array.isArray(attacker.types) && move?.type && attacker.types.includes(move.type)) damage = Math.floor(damage * 1.5);
  } catch {}
  damage = Math.floor(damage * (0.85 + Math.random() * 0.15));
  return Math.max(1, damage);
}

module.exports = { levelUp, STATUS_EFFECTS, applyStatusEffects, calculateDamage };
'@ | Set-Content -LiteralPath $helpersPath -Encoding UTF8

$managerPath = Join-Path $battlesDir 'battle-manager.js'
Backup-IfExists $managerPath
@'
/*
Handles all battle logic.
Features:
- Turn-based system between two Pokémon
- Simple damage calculation
- Tracks HP and levels
- Updates cache to persist Pokémon level-ups
*/

const { writeCache, getUserData, setUserData, getUserCache } = require('../cache');
const { levelUp, applyStatusEffects, calculateDamage } = require('../utils/pokemon-helpers');

function calculateDamageLegacy(attacker, defender) {
  return Math.max(1, attacker.stats.attack - Math.floor(defender.stats.defense / 2));
}

function selectPokemonForUser(userId, pokemonData, fallbackIndex) {
  const profile = getUserData(userId);
  if (profile?.pokemon) {
    return JSON.parse(JSON.stringify(profile.pokemon));
  }
  const length = Array.isArray(pokemonData) ? pokemonData.length : 0;
  if (length > 0) {
    const idx = Math.max(0, Math.min(length - 1, fallbackIndex));
    const base = pokemonData[idx];
    if (base) return JSON.parse(JSON.stringify(base));
  }
  return { name: 'Missingno', stats: { hp: 50, attack: 10, defense: 10, specialAttack: 10, specialDefense: 10, speed: 10 } };
}

async function initiateBattle(challengerId, opponentId, pokemonData) {
  const challengerPokemon = selectPokemonForUser(challengerId, pokemonData, 0);
  const opponentPokemon = selectPokemonForUser(opponentId, pokemonData, 1);

  let challengerHP = challengerPokemon.stats.hp;
  let opponentHP = opponentPokemon.stats.hp;
  let turn = 'challenger';
  const battleLog = [];

  while (challengerHP > 0 && opponentHP > 0) {
    if (turn === 'challenger') {
      const dmg = calculateDamageLegacy(challengerPokemon, opponentPokemon);
      opponentHP -= dmg;
      battleLog.push({ actor: challengerId, target: opponentId, damage: dmg, remainingHP: Math.max(0, opponentHP) });
      turn = 'opponent';
    } else {
      const dmg = calculateDamageLegacy(opponentPokemon, challengerPokemon);
      challengerHP -= dmg;
      battleLog.push({ actor: opponentId, target: challengerId, damage: dmg, remainingHP: Math.max(0, challengerHP) });
      turn = 'challenger';
    }
  }

  const winnerId = challengerHP > 0 ? challengerId : opponentId;
  const loserId = winnerId === challengerId ? opponentId : challengerId;

  const winnerProfile = getUserData(winnerId) || { pokemon: selectPokemonForUser(winnerId, pokemonData, 0), level: 1, xp: 0, hp: 100 };
  winnerProfile.xp = (winnerProfile.xp || 0) + 50;
  while (winnerProfile.xp >= 100) {
    winnerProfile.xp -= 100;
    winnerProfile.level = (winnerProfile.level || 1) + 1;
    if (winnerProfile.pokemon) {
      try { winnerProfile.pokemon = levelUp(winnerProfile.pokemon); } catch {}
    }
  }
  winnerProfile.updatedAt = new Date().toISOString();
  setUserData(winnerId, winnerProfile);

  if (Array.isArray(pokemonData) && pokemonData.length > 0) {
    writeCache('pokemonData', pokemonData);
  }

  return {
    winner: winnerId,
    loser: loserId,
    battleLog,
    challengerPokemon,
    opponentPokemon,
  };
}

module.exports = { initiateBattle };

class BattleManager {
  constructor(channel) {
    this.channel = channel;
    this.activeBattles = new Map();
  }
  startBattle(player1, player2) {
    const p1 = getUserCache(player1.id);
    const p2 = getUserCache(player2.id);
    if (!p1?.party?.length || !p2?.party?.length) {
      this.channel?.send?.('Both players must have a Pokémon in their party.');
      return null;
    }
    const state = {
      players: [player1.id, player2.id],
      turnIdx: 0,
      parties: { [player1.id]: JSON.parse(JSON.stringify(p1)), [player2.id]: JSON.parse(JSON.stringify(p2)) },
      log: [],
      createdAt: Date.now(),
    };
    const id = `${player1.id}-${player2.id}-${Date.now()}`;
    this.activeBattles.set(id, state);
    this.channel?.send?.(`Battle started between <@${player1.id}> and <@${player2.id}>! Turn: <@${player1.id}>`);
    return id;
  }
  getActive(state, userId) {
    const party = state.parties[userId];
    const idx = party?.currentActive ?? 0;
    return party?.party?.[idx] || null;
  }
  async playerMove(battleId, userId, moveName) {
    const state = this.activeBattles.get(battleId);
    if (!state) return false;
    const currentUser = state.players[state.turnIdx % state.players.length];
    if (currentUser !== userId) {
      this.channel?.send?.(`Not your turn, <@${userId}>.`);
      return false;
    }
    const oppId = state.players.find(id => id !== userId);
    const atk = this.getActive(state, userId);
    const def = this.getActive(state, oppId);
    if (!atk || !def) return false;
    applyStatusEffects(atk);
    applyStatusEffects(def);
    const move = (atk.moves || []).find(m => (m.name || '').toLowerCase() === String(moveName).toLowerCase());
    if (!move || (move.pp != null && move.pp <= 0)) {
      this.channel?.send?.(`<@${userId}> has no PP for ${moveName} or it doesn't exist.`);
      return false;
    }
    if (typeof move.pp === 'number') move.pp = Math.max(0, move.pp - 1);
    const dmg = calculateDamage({ ...atk, types: atk.types, stats: atk.stats, level: atk.level }, { ...def, stats: def.stats }, move);
    def.currentHp = Math.max(0, (def.currentHp ?? def.stats?.hp ?? 50) - dmg);
    state.log.push({ t: Date.now(), actor: userId, move: move.name, dmg, target: oppId, hp: def.currentHp });
    this.channel?.send?.(`${atk.name} used ${move.name}! ${def.name} took ${dmg} damage (HP ${def.currentHp}).`);
    if (def.currentHp <= 0) {
      this.channel?.send?.(`<@${oppId}>'s ${def.name} fainted! <@${userId}> wins!`);
      const profile = getUserData(userId) || {};
      profile.xp = (profile.xp || 0) + 10;
      setUserData(userId, profile);
      this.activeBattles.delete(battleId);
      return true;
    }
    state.turnIdx += 1;
    this.activeBattles.set(battleId, state);
    this.channel?.send?.(`Next turn: <@${state.players[state.turnIdx % state.players.length]}>`);
    return true;
  }
}

module.exports.BattleManager = BattleManager;
'@ | Set-Content -LiteralPath $managerPath -Encoding UTF8
