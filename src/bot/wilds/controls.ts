import type { User as DiscordUser, ButtonInteraction, Client } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";

import { attemptCatch, runFromEncounter } from "../../core/encounter/catch.js";
import { invalidateEncounter, loadEncounter } from "../../services/cache/recipes.js";
import { getPartyWithSlots, updatePartySlotPosition } from "../../shared/models/party-queries-pg.js";
import { getUserBasic } from "../../shared/models/user-queries-pg.js";
import { updateEncounterData } from "../../shared/models/encounter-queries-pg.js";
import { transaction } from "../../shared/pg-transaction.js";
import { getProdDb } from "../../shared/pg-connection.js";
import type { PartySlotWithPokemon } from "../../types/db-models.js";
import type { PoolClient } from "pg";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatPokemonName(slot: PartySlotWithPokemon | null | undefined) {
  const mon = slot?.pokemon;
  if (!mon) return "Unknown Pokémon";
  const speciesName = `#${mon.speciesId}`;
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

function toEncounterDataJson(encounterData: unknown): Record<string, unknown> {
  if (isJsonObject(encounterData)) {
    return { ...encounterData };
  }
  return {};
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

export async function openEncounterDM(
  client: Client,
  guildId: string,
  user: DiscordUser, 
  encounterId: string
) {
  const enc = await loadEncounter(encounterId);
  if (!enc) return;
  
  const manager = new HomesteadChannelManager(client, guildId);
  const result = await manager.getOrCreateChannel(user);
  const homesteadChannel = result.channel;
  
  const embed = buildEncounterEmbed(enc);
  const components = buildEncounterButtons(encounterId);
  await homesteadChannel.send({ embeds: [embed], components });
}

export async function handleEncounterButton(interaction: ButtonInteraction) {
  const id = interaction.customId;
  if (!id || (!id.startsWith("ENCOUNTER_THROW_") && !id.startsWith("ENCOUNTER_RUN_") && !id.startsWith("ENCOUNTER_SWAP_"))) return;

  const [, action] = id.split("_"); // ENCOUNTER, ACTION, <id>
  const encounterId = id.substring(`ENCOUNTER_${action}_`.length);
  const ephemeral = interaction.inGuild();

  // Verify encounter belongs to the user
  const enc = await loadEncounter(encounterId);
  if (!enc) {
    await interaction.reply({ content: "This encounter no longer exists.", ephemeral });
    return;
  }
  const user = await getUserBasic(interaction.user.id);
  if (!user || user.id !== enc.ownerId) {
    await interaction.reply({ content: "This is not your encounter.", ephemeral });
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
      await interaction.reply({ content: messages.dm, ephemeral });
      await notifyThread(messages.thread);
    } else if (res.ok) {
      await interaction.reply({ content: `Oh no! It broke free. Try again.`, ephemeral });
      await notifyThread(`Poké Ball shook… and broke! <@${interaction.user.id}> can try again.`);
    } else {
      const reason = res.reason || "error";
      await interaction.reply({ content: `Cannot throw a ball: ${reason}.`, ephemeral });
    }
    return;
  }

  if (action === "RUN") {
    const res = await runFromEncounter({ discordId: interaction.user.id, encounterId });
    if (res.ok) {
      await interaction.reply({ content: `You fled from the encounter.`, ephemeral });
      await notifyThread(`<@${interaction.user.id}> fled from the encounter.`);
    } else {
      await interaction.reply({ content: `Cannot run right now.`, ephemeral });
    }
    return;
  }

  if (action === "SWAP") {
    const party = await getPartyWithSlots(user.id);
    const slots = party?.slots ?? [];
    const healthySlots = slots.filter((slot) => slot.pokemon && slot.pokemon.hp > 0);
    if (healthySlots.length < 2) {
      await interaction.reply({ content: `You need at least two healthy party members to swap.`, ephemeral });
      return;
    }

    const currentLead = slots.find((slot) => slot.slot === 1) ?? slots[0] ?? null;
    const selectCustomId = `ENCOUNTER_SWAP_SELECT_${encounterId}`;
    const options = healthySlots.slice(0, 25).map((slot) => ({
      label: buildOptionLabel(slot),
      value: slot.id,
      description: buildOptionDescription(slot, currentLead?.id ?? null),
    }));
    const select = new StringSelectMenuBuilder().setCustomId(selectCustomId).setPlaceholder(
      currentLead ? `Switch from ${formatPokemonName(currentLead)} to…` : "Choose a new lead"
    );
    select.addOptions(options);
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    const replyMessage = await interaction.reply({
      content: `Choose a party member to take the lead against the wild Pokémon.`,
      components: [row],
      ephemeral,
      fetchReply: true,
    });

    try {
      const selection = await replyMessage.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 30_000,
        filter: (componentInteraction: StringSelectMenuInteraction) =>
          componentInteraction.user.id === interaction.user.id && componentInteraction.customId === selectCustomId,
      });
      const chosenId = selection.values?.[0];
      if (!chosenId) {
        await selection.update({ content: "Selection cancelled.", components: [] });
        return;
      }

      type SwapResult = 
        | { kind: "error"; reason: "missing" | "fainted" }
        | { kind: "already-lead"; chosen: PartySlotWithPokemon; previous: PartySlotWithPokemon | null }
        | { kind: "swapped"; chosen: PartySlotWithPokemon; previous: PartySlotWithPokemon | null };

      const result = await transaction<SwapResult>(getProdDb(), async (client: PoolClient) => {
        // Re-fetch party with fresh data inside transaction
        // Note: Casting client as any to satisfy Pool type constraint - PoolClient has compatible query() method
        const freshParty = await getPartyWithSlots(user.id, client as any);
        const freshSlots = freshParty?.slots ?? [];
        const freshLead = freshSlots.find((slot: PartySlotWithPokemon) => slot.slot === 1) ?? freshSlots[0] ?? null;
        const picked = freshSlots.find((slot: PartySlotWithPokemon) => slot.id === chosenId) ?? null;
        if (!freshParty || !picked) {
          return { kind: "error" as const, reason: "missing" as const };
        }
        if (!picked.pokemon || picked.pokemon.hp <= 0) {
          return { kind: "error" as const, reason: "fainted" as const };
        }
        const baseData = toEncounterDataJson(enc.dataJson);
        if (!freshLead || freshLead.id === picked.id) {
          baseData.activePartySlotId = picked.id;
          baseData.activePokemonId = picked.pokemonId;
          await updateEncounterData(enc.id, baseData, client as any);
          return { kind: "already-lead" as const, chosen: picked, previous: freshLead ?? null };
        }

        // Swap slots: temp slot 0, then swap positions
        const originalSlot = picked.slot;
        await updatePartySlotPosition(picked.id, 0, client as any);
        await updatePartySlotPosition(freshLead.id, originalSlot, client as any);
        await updatePartySlotPosition(picked.id, 1, client as any);
        
        baseData.activePartySlotId = picked.id;
        baseData.activePokemonId = picked.pokemonId;
        await updateEncounterData(enc.id, baseData, client as any);
        
        const swapped = { ...picked, slot: 1 } as PartySlotWithPokemon;
        return { kind: "swapped" as const, chosen: swapped, previous: freshLead ?? null };
      });

      if (result.kind === "error") {
        const message =
          result.reason === "fainted"
            ? "That Pokémon can't battle right now."
            : "That Pokémon is no longer available for swapping.";
        await selection.update({ content: message, components: [] });
        return;
      }

      const leadName = formatPokemonName(result.chosen);
      if (result.kind === "already-lead") {
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
