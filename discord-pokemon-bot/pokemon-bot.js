/*
Main bot entry point.
Handles:
- Discord client initialization
- Message detection for battle triggers (👀 emoji)
- Loading Pokémon data
- Active battle tracking
*/

const { Client, GatewayIntentBits } = require('discord.js');
const dotenv = require('dotenv');
const { readCache, writeCache } = require('./cache');
const { initiateBattle } = require('./battles/battle-manager');
const fs = require('fs');

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Load Pokémon data from cache or JSON
let pokemonData = readCache('pokemonData');
if (!pokemonData) {
  pokemonData = JSON.parse(fs.readFileSync('./data/pokemon.json', 'utf8'));
  writeCache('pokemonData', pokemonData);
}

// In-memory active battles
const activeBattles = {};

// Listen for messages
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

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

client.once('ready', () => {
  console.log(`✅ Pokémon Discord Bot is running as ${client.user.tag}!`);
});

client.login(process.env.BOT_TOKEN);
