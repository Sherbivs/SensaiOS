import type { Prisma } from "@prisma/client";
import type { User as DiscordUser, ButtonInteraction } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";

import { attemptCatch, runFromEncounter } from "../../core/encounter/catch.js";
import { prisma } from "../../models/index.js";
import { invalidateEncounter, loadEncounter } from "../../services/cache/recipes.js";

type PartySlotWithPokemon = {
  id: string;
  slot: number;
  pokemonId: string;
  pokemon: {
    id: string;
    nickname: string | null;
    speciesId: number;
    level: number;
    hp: number;
    maxHp: number;
    species: { name: string } | null;
  } | null;
};

const PARTY_WITH_SLOTS_INCLUDE = {
  slots: {
    orderBy: { slot: "asc" as const },
    include: {
      pokemon: {
        select: {
          id: true,
          nickname: true,
          speciesId: true,
          level: true,
          hp: true,
          maxHp: true,
          species: { select: { name: true } },
        },
      },
    },
  },
} as const;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatPokemonName(slot: PartySlotWithPokemon | null | undefined) {
  const mon = slot?.pokemon;
  if (!mon) return "Unknown Pokémon";
  const speciesName = mon.species?.name ?? `#${mon.speciesId}`;
  const nickname = typeof mon.nickname === "string" && mon.nickname.trim().length > 0 ? mon.nickname.trim() : null;
  return nickname ? `${nickname} (${speciesName})` : speciesName;
}

function buildOptionLabel(slot: PartySlotWithPokemon) {
  const mon = slot.pokemon;
  const base = formatPokemonName(slot);
  const level = mon?.level != null ? `Lv ${mon.level}` : null;
  return [base, level].filter(Boolean).join(" • ").slice(0, 100);
}

function buildOptionDescription(slot: PartySlotWithPokemon, activeId: string | null) {
  const mon = slot.pokemon;
  const parts = [`Slot ${slot.slot}`];
  if (mon) {
    parts.push(`HP ${mon.hp}/${mon.maxHp}`);
  }
  if (activeId && slot.id === activeId) {
    parts.push("Active");
  }
  return parts.join(" • ").slice(0, 100);
}

function toEncounterDataJson(encounterData: unknown): Prisma.JsonObject {
  if (isJsonObject(encounterData)) {
    return { ...(encounterData as Prisma.JsonObject) };
  }
  return {} as Prisma.JsonObject;
}

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

  const [, action] = id.split("_"); // ENCOUNTER, ACTION, <id>
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
    } catch {
      // Ignore transient thread failures; encounter continues regardless.
    }
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
    const party = await prisma.party.findFirst({ where: { ownerId: user.id }, include: PARTY_WITH_SLOTS_INCLUDE });
    const slots = party?.slots ?? [];
    if (slots.length < 2) {
      await interaction.reply({ content: `You need at least two healthy party members to swap.`, ephemeral: true });
      return;
    }

    const currentLead = slots.find((slot) => slot.slot === 1) ?? slots[0] ?? null;
    const selectCustomId = `ENCOUNTER_SWAP_SELECT_${encounterId}`;
    const options = slots.slice(0, 25).map((slot) => ({
      label: buildOptionLabel(slot),
      value: slot.id,
      description: buildOptionDescription(slot, currentLead?.id ?? null),
    }));
    const select = new StringSelectMenuBuilder().setCustomId(selectCustomId).setPlaceholder(
      currentLead ? `Switch from ${formatPokemonName(currentLead)} to…` : "Choose a new lead"
    );
    select.addOptions(options);
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    await interaction.reply({
      content: `Choose a party member to take the lead against the wild Pokémon.`,
      components: [row],
      ephemeral: true,
    });

    try {
      const selection = await interaction.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 30_000,
        filter: (i) => i.user.id === interaction.user.id && i.customId === selectCustomId,
      });
      const chosenId = selection.values?.[0];
      if (!chosenId) {
        await selection.update({ content: "Selection cancelled.", components: [] });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const freshParty = await tx.party.findFirst({ where: { ownerId: user.id }, include: PARTY_WITH_SLOTS_INCLUDE });
        const freshSlots = freshParty?.slots ?? [];
        const freshLead = freshSlots.find((slot) => slot.slot === 1) ?? freshSlots[0] ?? null;
        const picked = freshSlots.find((slot) => slot.id === chosenId) ?? null;
        if (!freshParty || !picked) {
          return { ok: false as const, reason: "missing" as const };
        }
        const baseData = toEncounterDataJson(enc.dataJson);
        if (!freshLead || freshLead.id === picked.id) {
          baseData.activePartySlotId = picked.id;
          baseData.activePokemonId = picked.pokemonId;
          await tx.encounter.update({ where: { id: enc.id }, data: { dataJson: baseData } });
          return { ok: true as const, alreadyLead: true as const, chosen: picked, previous: freshLead };
        }

        const originalSlot = picked.slot;
        await tx.partySlot.update({ where: { id: picked.id }, data: { slot: 0 } });
        await tx.partySlot.update({ where: { id: freshLead.id }, data: { slot: originalSlot } });
        await tx.partySlot.update({ where: { id: picked.id }, data: { slot: 1 } });
        baseData.activePartySlotId = picked.id;
        baseData.activePokemonId = picked.pokemonId;
        await tx.encounter.update({ where: { id: enc.id }, data: { dataJson: baseData } });
        return { ok: true as const, chosen: picked, previous: freshLead };
      });

      if (!result.ok) {
        await selection.update({ content: "That Pokémon is no longer available for swapping.", components: [] });
        return;
      }

      const leadName = formatPokemonName(result.chosen);
      if (result.alreadyLead) {
        await selection.update({ content: `${leadName} is already leading your party.`, components: [] });
        await invalidateEncounter(enc.id);
        return;
      }

      const previousName = formatPokemonName(result.previous ?? null);
      await selection.update({
        content: `Lead swapped! ${leadName} takes point${previousName && previousName !== "Unknown Pokémon" ? `, relieving ${previousName}.` : "."}`,
        components: [],
      });
      await invalidateEncounter(enc.id);
      await notifyThread(`🔄 <@${interaction.user.id}> swapped their lead to ${leadName}.`);
    } catch {
      try {
        await interaction.editReply({ content: "Swap timed out.", components: [] });
      } catch {
        // ignore edit failures
      }
    }
    return;
  }
}
