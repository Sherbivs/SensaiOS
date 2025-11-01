import type { User as DiscordUser, ButtonInteraction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { prisma } from "../../models/index.js";
import { attemptCatch, runFromEncounter, BallType } from "../../core/encounter/catch.js";
import { loadEncounter } from "../../services/cache/recipes.js";

export function composeCatchSuccessMessages(discordId: string, pokemonId?: string) {
  const idSuffix = pokemonId ? ` (ID ${pokemonId})` : "";
  return {
    dm: `Gotcha! Pokémon caught${idSuffix} and added to your collection.`,
    thread: `🎉 <@${discordId}> caught the wild Pokémon${idSuffix}!`,
  };
}

export function buildEncounterEmbed(enc: { speciesId: number; level: number }) {
  const embed = new EmbedBuilder()
    .setTitle(`A wild Pokémon appeared!`)
    .setDescription(`Species #${enc.speciesId} • Lv ${enc.level}`)
    .setColor(0x4caf50);
  return embed;
}

export function buildEncounterButtons(encounterId: string) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ENCOUNTER_THROW_${encounterId}`).setLabel("Throw Poké Ball").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ENCOUNTER_SWAP_${encounterId}`).setLabel("Swap Lead").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ENCOUNTER_RUN_${encounterId}`).setLabel("Run").setStyle(ButtonStyle.Danger)
  );
  return [row];
}

export async function openEncounterDM(user: DiscordUser, encounterId: string) {
  const enc = await loadEncounter(encounterId, { prisma });
  if (!enc) return;
  const dm = await user.createDM();
  const embed = buildEncounterEmbed(enc);
  const components = buildEncounterButtons(encounterId);
  await dm.send({ embeds: [embed], components });
}

export async function handleEncounterButton(interaction: ButtonInteraction) {
  const id = interaction.customId;
  if (!id || (!id.startsWith("ENCOUNTER_THROW_") && !id.startsWith("ENCOUNTER_RUN_") && !id.startsWith("ENCOUNTER_SWAP_"))) return;

  const [_, action, encId] = id.split("_"); // ENCOUNTER, ACTION, <id>
  const encounterId = id.substring(`ENCOUNTER_${action}_`.length);

  // Verify encounter belongs to the user
  const enc = await loadEncounter(encounterId, { prisma });
  if (!enc) {
    await interaction.reply({ content: "This encounter no longer exists.", ephemeral: true });
    return;
  }
  const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });
  if (!user || user.id !== enc.ownerId) {
    await interaction.reply({ content: "This is not your encounter.", ephemeral: true });
    return;
  }

  // Helper to notify thread if linked
  const notifyThread = async (msg: string) => {
    if (!enc.threadChannelId) return;
    try {
      const channel = await (interaction.client.channels as any).fetch(enc.threadChannelId);
      if (channel && typeof (channel as any).send === "function") {
        await (channel as any).send(msg);
      }
    } catch {}
  };

  if (action === "THROW") {
    const res = await attemptCatch({ discordId: interaction.user.id, encounterId });
    if (res.ok && res.caught) {
      const messages = composeCatchSuccessMessages(interaction.user.id, res.pokemonId);
      await interaction.reply({ content: messages.dm, ephemeral: true });
      await notifyThread(messages.thread);
    } else if (res.ok) {
      await interaction.reply({ content: `Oh no! It broke free. Try again.`, ephemeral: true });
      await notifyThread(`Poké Ball shook… and broke! <@${interaction.user.id}> can try again.`);
    } else {
      const reason = res.reason || "error";
      await interaction.reply({ content: `Cannot throw a ball: ${reason}.`, ephemeral: true });
    }
    return;
  }

  if (action === "RUN") {
    const res = await runFromEncounter({ discordId: interaction.user.id, encounterId });
    if (res.ok) {
      await interaction.reply({ content: `You fled from the encounter.`, ephemeral: true });
      await notifyThread(`<@${interaction.user.id}> fled from the encounter.`);
    } else {
      await interaction.reply({ content: `Cannot run right now.`, ephemeral: true });
    }
    return;
  }

  if (action === "SWAP") {
    await interaction.reply({ content: `Swap Lead is coming soon.`, ephemeral: true });
    return;
  }
}
