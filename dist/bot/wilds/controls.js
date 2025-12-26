import { ActionRowBuilder, ComponentType, StringSelectMenuBuilder, } from "discord.js";
import { encounterEmbed } from "../shared/embed-builders.js";
import { encounterButtons } from "../shared/button-utils.js";
import { replyError, replyInfo } from "../shared/response-helpers.js";
import { attemptCatch, runFromEncounter } from "../../core/encounter/catch.js";
import { invalidateEncounter, loadEncounter } from "../../services/cache/recipes.js";
import { getPartyWithSlots, updatePartySlotPosition } from "../../shared/models/party-queries-pg.js";
import { getUserBasic } from "../../shared/models/user-queries-pg.js";
import { updateEncounterData } from "../../shared/models/encounter-queries-pg.js";
import { transaction } from "../../shared/pg-transaction.js";
import { getProdDb } from "../../shared/pg-connection.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { awardCatchExp, formatLevelUpMessage } from "../../services/leveling.js";
import { rollCatchRewards, formatItemRewardsInline } from "../../services/inventory.js";
function isJsonObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function formatPokemonName(slot) {
    const mon = slot?.pokemon;
    if (!mon)
        return "Unknown Pokémon";
    const speciesName = `#${mon.speciesId}`;
    const nickname = typeof mon.nickname === "string" && mon.nickname.trim().length > 0 ? mon.nickname.trim() : null;
    return nickname ? `${nickname} (${speciesName})` : speciesName;
}
function buildOptionLabel(slot) {
    const mon = slot.pokemon;
    const base = formatPokemonName(slot);
    const level = mon?.level != null ? `Lv ${mon.level}` : null;
    return [base, level].filter(Boolean).join(" • ").slice(0, 100);
}
function buildOptionDescription(slot, activeId) {
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
function toEncounterDataJson(encounterData) {
    if (isJsonObject(encounterData)) {
        return { ...encounterData };
    }
    return {};
}
export function composeCatchSuccessMessages(discordId, pokemonId) {
    const idSuffix = pokemonId ? ` (ID ${pokemonId})` : "";
    return {
        dm: `Gotcha! Pokémon caught${idSuffix} and added to your collection.`,
        thread: `🎉 <@${discordId}> caught the wild Pokémon${idSuffix}!`,
    };
}
function extractRarityFromDataJson(dataJson) {
    if (!isJsonObject(dataJson))
        return "common";
    const rarity = dataJson.rarity;
    if (rarity === "uncommon" || rarity === "rare" || rarity === "ultra-rare")
        return rarity;
    return "common";
}
function extractShinyFromDataJson(dataJson) {
    if (!isJsonObject(dataJson))
        return false;
    return dataJson.isShiny === true;
}
export function buildEncounterEmbed(enc) {
    const rarity = extractRarityFromDataJson(enc.dataJson);
    const isShiny = extractShinyFromDataJson(enc.dataJson);
    return encounterEmbed({
        speciesId: enc.speciesId,
        level: enc.level,
        rarity,
        isShiny,
    });
}
export function buildEncounterButtons(encounterId) {
    return encounterButtons(encounterId);
}
export async function openEncounterDM(client, guildId, user, encounterId) {
    const enc = await loadEncounter(encounterId);
    if (!enc)
        return;
    const manager = new HomesteadChannelManager(client, guildId);
    const result = await manager.getOrCreateChannel(user);
    const homesteadChannel = result.channel;
    const embed = buildEncounterEmbed(enc);
    const components = buildEncounterButtons(encounterId);
    await homesteadChannel.send({ embeds: [embed], components });
}
export async function handleEncounterButton(interaction) {
    const id = interaction.customId;
    if (!id || (!id.startsWith("ENCOUNTER_THROW_") && !id.startsWith("ENCOUNTER_RUN_") && !id.startsWith("ENCOUNTER_SWAP_")))
        return;
    const [, action] = id.split("_"); // ENCOUNTER, ACTION, <id>
    const encounterId = id.substring(`ENCOUNTER_${action}_`.length);
    const ephemeral = interaction.inGuild();
    // Verify encounter belongs to the user
    const enc = await loadEncounter(encounterId);
    if (!enc) {
        await replyError(interaction, "This encounter no longer exists.");
        return;
    }
    const user = await getUserBasic(interaction.user.id);
    if (!user || user.id !== enc.ownerId) {
        await replyError(interaction, "This is not your encounter.");
        return;
    }
    // Helper to notify thread if linked
    const notifyThread = async (msg) => {
        if (!enc.threadChannelId)
            return;
        try {
            const channel = await interaction.client.channels.fetch(enc.threadChannelId);
            if (channel && typeof channel.send === "function") {
                await channel.send(msg);
            }
        }
        catch {
            // Ignore transient thread failures; encounter continues regardless.
        }
    };
    if (action === "THROW") {
        const res = await attemptCatch({ discordId: interaction.user.id, encounterId });
        if (res.ok && res.caught) {
            // Award XP to lead Pokemon for the catch
            let expMessage = "";
            const party = await getPartyWithSlots(user.id);
            const leadSlot = party?.slots?.find((s) => s.slot === 1);
            if (leadSlot?.pokemon?.id) {
                const expResult = await awardCatchExp(leadSlot.pokemon.id, enc.speciesId, enc.level);
                if (expResult) {
                    expMessage = "\n" + formatLevelUpMessage(expResult);
                    // Evolution info is already in the expResult.levelUp.evolution
                    // formatLevelUpMessage handles showing evolution messages
                }
            }
            // Roll for bonus item rewards based on encounter rarity
            let itemMessage = "";
            const encData = isJsonObject(enc.dataJson) ? enc.dataJson : {};
            const rarity = encData.rarity || "common";
            const itemRewards = await rollCatchRewards(interaction.user.id, rarity);
            if (itemRewards.length > 0) {
                itemMessage = `\n🎁 **Bonus:** ${formatItemRewardsInline(itemRewards)}`;
            }
            const messages = composeCatchSuccessMessages(interaction.user.id, res.pokemonId);
            await replyInfo(interaction, messages.dm + expMessage + itemMessage);
            await notifyThread(messages.thread);
        }
        else if (res.ok) {
            await replyInfo(interaction, `Oh no! It broke free. Try again.`);
            await notifyThread(`Poké Ball shook… and broke! <@${interaction.user.id}> can try again.`);
        }
        else {
            const reason = res.reason || "error";
            await replyError(interaction, `Cannot throw a ball: ${reason}.`);
        }
        return;
    }
    if (action === "RUN") {
        const res = await runFromEncounter({ discordId: interaction.user.id, encounterId });
        if (res.ok) {
            await replyInfo(interaction, `You fled from the encounter.`);
            await notifyThread(`<@${interaction.user.id}> fled from the encounter.`);
        }
        else {
            await replyError(interaction, `Cannot run right now.`);
        }
        return;
    }
    if (action === "SWAP") {
        const party = await getPartyWithSlots(user.id);
        const slots = party?.slots ?? [];
        const healthySlots = slots.filter((slot) => slot.pokemon && slot.pokemon.hp > 0);
        if (healthySlots.length < 2) {
            await replyError(interaction, `You need at least two healthy party members to swap.`);
            return;
        }
        const currentLead = slots.find((slot) => slot.slot === 1) ?? slots[0] ?? null;
        const selectCustomId = `ENCOUNTER_SWAP_SELECT_${encounterId}`;
        const options = healthySlots.slice(0, 25).map((slot) => ({
            label: buildOptionLabel(slot),
            value: slot.id,
            description: buildOptionDescription(slot, currentLead?.id ?? null),
        }));
        const select = new StringSelectMenuBuilder().setCustomId(selectCustomId).setPlaceholder(currentLead ? `Switch from ${formatPokemonName(currentLead)} to…` : "Choose a new lead");
        select.addOptions(options);
        const row = new ActionRowBuilder().addComponents(select);
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
                filter: (componentInteraction) => componentInteraction.user.id === interaction.user.id && componentInteraction.customId === selectCustomId,
            });
            const chosenId = selection.values?.[0];
            if (!chosenId) {
                await selection.update({ content: "Selection cancelled.", components: [] });
                return;
            }
            const result = await transaction(getProdDb(), async (client) => {
                // Re-fetch party with fresh data inside transaction
                // Note: Casting client as any to satisfy Pool type constraint - PoolClient has compatible query() method
                const freshParty = await getPartyWithSlots(user.id, client);
                const freshSlots = freshParty?.slots ?? [];
                const freshLead = freshSlots.find((slot) => slot.slot === 1) ?? freshSlots[0] ?? null;
                const picked = freshSlots.find((slot) => slot.id === chosenId) ?? null;
                if (!freshParty || !picked) {
                    return { kind: "error", reason: "missing" };
                }
                if (!picked.pokemon || picked.pokemon.hp <= 0) {
                    return { kind: "error", reason: "fainted" };
                }
                const baseData = toEncounterDataJson(enc.dataJson);
                if (!freshLead || freshLead.id === picked.id) {
                    baseData.activePartySlotId = picked.id;
                    baseData.activePokemonId = picked.pokemonId;
                    await updateEncounterData(enc.id, baseData, client);
                    return { kind: "already-lead", chosen: picked, previous: freshLead ?? null };
                }
                // Swap slots: temp slot 0, then swap positions
                const originalSlot = picked.slot;
                await updatePartySlotPosition(picked.id, 0, client);
                await updatePartySlotPosition(freshLead.id, originalSlot, client);
                await updatePartySlotPosition(picked.id, 1, client);
                baseData.activePartySlotId = picked.id;
                baseData.activePokemonId = picked.pokemonId;
                await updateEncounterData(enc.id, baseData, client);
                const swapped = { ...picked, slot: 1 };
                return { kind: "swapped", chosen: swapped, previous: freshLead ?? null };
            });
            if (result.kind === "error") {
                const message = result.reason === "fainted"
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
        }
        catch {
            try {
                await interaction.editReply({ content: "Swap timed out.", components: [] });
            }
            catch {
                // ignore edit failures
            }
        }
        return;
    }
}
