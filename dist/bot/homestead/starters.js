/**
 * Homestead Starters Module
 *
 * Handles starter Pokémon selection in homestead channels.
 * Migrated from src/bot/dm/starters.ts (DM-based implementation).
 *
 * @module homestead/starters
 */
import { starterSelectEmbed } from "../shared/embed-builders.js";
import { starterChoiceButtons } from "../shared/button-utils.js";
import { replyInfo } from "../shared/response-helpers.js";
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { getPartyWithSlots, createParty, createPartySlot, createPokemon } from "../../shared/models/party-queries-pg.js";
import { getProdDb } from "../../shared/pg-connection.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { log } from "../../shared/logging/index.js";
// Kanto starters (species IDs per National Dex)
export const STARTER_OPTIONS = [
    { speciesId: 1, name: "Bulbasaur" },
    { speciesId: 4, name: "Charmander" },
    { speciesId: 7, name: "Squirtle" },
];
export function buildStartersEmbed() {
    return starterSelectEmbed(STARTER_OPTIONS);
}
export function buildStartersButtons() {
    const starters = STARTER_OPTIONS.map((s) => ({
        id: s.speciesId,
        label: s.name,
    }));
    return [starterChoiceButtons(starters)];
}
/**
 * Open starters selection in user's homestead channel
 * @param client Discord client instance
 * @param guildId Guild ID where homestead exists
 * @param user User to show starters to
 */
export async function openStartersHomestead(client, guildId, user) {
    try {
        const manager = new HomesteadChannelManager(client, guildId);
        const result = await manager.getOrCreateChannel(user);
        const homesteadChannel = result.channel;
        const embed = buildStartersEmbed();
        const components = buildStartersButtons();
        await homesteadChannel.send({ embeds: [embed], components });
    }
    catch (error) {
        log('error', "[homestead-starters] Failed to open starters in homestead channel", {
            error,
            userId: user.id,
            guildId,
        });
        throw error;
    }
}
// Minimal stat bootstrap without referencing the full Dex yet
function computeInitialStats(level) {
    const maxHp = 20 + level * 3; // simple placeholder formula
    return { hp: maxHp, maxHp };
}
export async function createStarterAndAssignParty({ discordId, speciesId, }) {
    // Ensure user exists
    const user = await ensureUser(discordId);
    // Check if user already owns any Pokemon — starter is one-time
    const db = getProdDb();
    const countResult = await db.query('SELECT COUNT(*)::int as count FROM "PokemonInstance" WHERE "ownerId" = $1', [user.id]);
    const existingCount = countResult.rows[0]?.count ?? 0;
    if (existingCount > 0) {
        return { alreadyHasStarter: true };
    }
    const level = 5;
    const { hp, maxHp } = computeInitialStats(level);
    const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    const moves = [
        { id: 33, name: "Tackle", pp: 35, maxPP: 35 }, // placeholder ids
        { id: 45, name: "Growl", pp: 40, maxPP: 40 },
    ];
    const created = await createPokemon({
        ownerId: user.id,
        speciesId,
        level,
        exp: 0,
        nature: null,
        ivsJson: ivs,
        evsJson: evs,
        movesJson: moves,
        status: null,
        hp,
        maxHp,
        isShiny: false,
        nickname: null,
        boxSlot: null,
    });
    // Ensure a party exists and get available slots in one query
    const party = await getPartyWithSlots(user.id);
    let partyId;
    let slots;
    if (!party) {
        // Create new party
        const newParty = await createParty(user.id);
        partyId = newParty.id;
        slots = [];
    }
    else {
        partyId = party.id;
        slots = party.slots;
    }
    // Determine next available slot 1..6
    const used = new Set(slots.map((s) => s.slot));
    let nextSlot = 1;
    for (; nextSlot <= 6; nextSlot++) {
        if (!used.has(nextSlot))
            break;
    }
    if (nextSlot > 6) {
        // If party is full, just leave it in the box
        return { created, partyFull: true };
    }
    await createPartySlot(partyId, created.id, nextSlot);
    return { created, partyFull: false };
}
export async function handleStarterPick(interaction, speciesId) {
    const discordId = interaction.user.id;
    const res = await createStarterAndAssignParty({ discordId, speciesId });
    if ("alreadyHasStarter" in res && res.alreadyHasStarter) {
        await replyInfo(interaction, "You already have a Pokémon. Starter can only be chosen once.");
        return;
    }
    if (res.partyFull) {
        await replyInfo(interaction, "You received your starter! Your party is full, so it was placed in your box.");
        return;
    }
    await replyInfo(interaction, `You received your starter! Welcome to the world of Pokémon.`);
}
