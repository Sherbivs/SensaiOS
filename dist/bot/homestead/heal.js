/**
 * Homestead Heal Module
 *
 * Handles Pokémon party healing in homestead channels.
 * Migrated from src/bot/dm/heal.ts (DM-based implementation).
 *
 * @module homestead/heal
 */
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { getPartyWithSlots, healPokemon } from "../../shared/models/party-queries-pg.js";
import { replyInfo } from "../shared/response-helpers.js";
export async function healPartyForUser(discordId) {
    const user = await ensureUser(discordId);
    // Find user's first party with all slots and pokemon in one query
    const party = await getPartyWithSlots(user.id);
    if (!party)
        return { healed: 0 };
    const slots = party.slots;
    if (!slots.length)
        return { healed: 0 };
    // Extract pokemon instances from the joined query result
    const instances = slots
        .map((slot) => slot.pokemon)
        .filter((pokemon) => pokemon !== null);
    if (!instances.length)
        return { healed: 0 };
    // Heal all pokemon instances at once
    const healed = await healPokemon(instances.map(p => p.id));
    return { healed };
}
export async function handleHeal(interaction) {
    const discordId = interaction.user.id;
    const res = await healPartyForUser(discordId);
    if (res.healed === 0) {
        await replyInfo(interaction, "You don't have a party to heal yet. Use /starter to pick one!");
    }
    else {
        await replyInfo(interaction, `Healed your party (restored ${res.healed} Pokémon).`);
    }
}
