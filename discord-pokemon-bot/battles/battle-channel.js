// battles/battle-channel.js
// Emoji-triggered battle handler for a dedicated channel

const { ChannelType } = require('discord.js');
const { getUserData } = require('../cache');
const { initiateBattle, BattleManager } = require('./battle-manager');

const BATTLE_CHANNEL_NAME = process.env.BATTLE_CHANNEL_NAME || 'pokemon-battles';
const activeBattles = new Map(); // battleId -> { manager?, users, channelId }
// Emoji-to-move mapping scaffold (expand as needed)
const MOVES_BY_EMOJI = {
  '⭐': 'Tackle',
  '⚡': 'Thunder Shock',
  '🔥': 'Ember',
  '💧': 'Water Gun',
  '👀': 'Tackle',
};
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

    // For future: turn-based manager
    const manager = new BattleManager(channel);
    const id = manager.startBattle(user, opponent) || battleId;
    activeBattles.set(id, { channelId: channel.id, users: [user.id, opponent.id], startedAt: Date.now(), manager });

    // Current behavior: one-shot battle for compatibility
    const result = await initiateBattle(user.id, opponent.id, []);
    await channel.send(`⚔️ Battle finished! <@${result.winner}> defeated <@${result.loser}>.`);

    activeBattles.delete(id);
  } catch (err) {
    console.error('[BATTLE CHANNEL ERROR]', err);
  }
}

module.exports = { handleReaction, activeBattles, BATTLE_CHANNEL_NAME, MOVES_BY_EMOJI };
