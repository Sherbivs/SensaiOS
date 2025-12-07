import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder()
  .setName('starter')
  .setDescription('Choose any Pokémon as your starter (one-time, forbidden categories excluded)');

const cooldownMs = 1000;

// Note: Actual execution handled in src/bot/index.ts via startOpenStarterFlow()
// This execute function is a fallback that should not normally run
async function execute(interaction) {
  await interaction.reply({ 
    content: '⚠️ Use this command in a server to choose your starter Pokémon!', 
    ephemeral: true 
  });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
