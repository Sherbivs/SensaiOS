import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder()
  .setName('battle')
  .setDescription('Battle orchestration commands')
  .addSubcommand((sub) =>
    sub
      .setName('challenge')
      .setDescription('Challenge another trainer to a battle via DM prompt')
      .addUserOption((opt) =>
        opt
          .setName('opponent')
          .setDescription('Trainer to challenge')
          .setRequired(true)
      )
  )
  .setDMPermission(false);

const cooldownMs = 1000;

async function execute(interaction) {
  await interaction.reply({
    content: 'Battle command routing through bot runtime.',
    ephemeral: true,
  });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
