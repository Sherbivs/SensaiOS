/**
 * Homestead Starters Module
 * 
 * Handles starter Pokémon selection in homestead channels.
 * Uses the OPEN STARTER SELECTION system where players can choose
 * almost any Pokémon (800+ options, excluding forbidden categories).
 * 
 * INFINITY GAUNTLET PHILOSOPHY:
 * - ✅ ALLOWED: Almost any Pokémon (Pikachu, Eevee, Riolu, Dratini, etc.)
 * - ❌ FORBIDDEN: Regional starters, Legendaries, Mythicals, Pseudo-legendary finals
 * 
 * See docs/architecture-bible/23-game-design-bible.md § 5 for full specification.
 * 
 * @module homestead/starters
 */

// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from "../../shared/logging/index.js";
const logger = getLogger();

import {
  User as DiscordUser,
  RepliableInteraction,
  Client,
} from "discord.js";

import { replyInfo } from "../shared/response-helpers.js";
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { getPartyWithSlots, createParty, createPartySlot, createPokemon } from "../../shared/models/party-queries-pg.js";
import { getProdDb } from "../../shared/pg-connection.js";
import { computeInitialStats, computeFallbackStats } from "../../shared/pokemon/compute-stats.js";
import { getStartingMoves } from "../../shared/pokemon/initial-moves.js";
import { generateStarterIVs } from "../../shared/pokemon/generate-ivs.js";

// Import the open starter selection system
import { 
  startOpenStarterFlow, 
  type OpenStarterResult 
} from "./open-starter-selection.js";

/**
 * Open starters selection in user's homestead channel
 * 
 * Uses the OPEN STARTER SELECTION flow where players can choose
 * any valid Pokémon by typing its name. Validation rules:
 * - ❌ Regional starters (Bulbasaur, Charmander, etc.) forbidden
 * - ❌ Legendary Pokémon forbidden
 * - ❌ Mythical Pokémon forbidden
 * - ❌ Pseudo-legendary final forms (Dragonite, Tyranitar) forbidden
 * - ✅ Earlier forms (Dratini, Larvitar) allowed
 * - ✅ Regular Pokémon (Pikachu, Eevee, etc.) allowed
 * 
 * @param client Discord client instance
 * @param guildId Guild ID where homestead exists
 * @param user User to show starters to
 */
export async function openStartersHomestead(
  client: Client,
  guildId: string,
  user: DiscordUser
): Promise<OpenStarterResult> {
  try {
    logger.info('HomesteadStarters', 'openStartersHomestead', 'Starting open starter selection', { 
      userId: user.id,
      guildId,
    });
    
    // Use the open starter selection flow (type any Pokémon name)
    const result = await startOpenStarterFlow(client, guildId, user);
    
    if ('alreadyHasStarter' in result) {
      logger.info('HomesteadStarters', 'openStartersHomestead', 'User already has starter', { userId: user.id });
    } else if ('success' in result && result.success) {
      logger.info('HomesteadStarters', 'openStartersHomestead', 'Starter selection successful', { 
        userId: user.id,
        metadata: { speciesId: result.speciesId, speciesName: result.speciesName },
      });
    } else if ('cancelled' in result) {
      logger.info('HomesteadStarters', 'openStartersHomestead', 'Starter selection cancelled', { 
        userId: user.id,
        metadata: { reason: result.reason },
      });
    }
    
    return result;
  } catch (error) {
    logger.error('HomesteadStarters', 'openStartersHomestead', 'Failed to open starters in homestead channel', { 
      userId: user.id,
      guildId,
      metadata: { error },
    });
    throw error;
  }
}

type CreateOpts = { discordId: string; speciesId: number };

export async function createStarterAndAssignParty({
  discordId,
  speciesId,
}: CreateOpts) {
  // Ensure user exists
  const user = await ensureUser(discordId);

  // Check if user already owns any Pokemon — starter is one-time
  const db = getProdDb();
  const countResult = await db.query(
    'SELECT COUNT(*)::int as count FROM "PokemonInstance" WHERE "ownerId" = $1',
    [user.id]
  );
  const existingCount = countResult.rows[0]?.count ?? 0;
  
  if (existingCount > 0) {
    return { alreadyHasStarter: true } as const;
  }

  const level = 5;
  const stats = computeInitialStats(speciesId, level) ?? computeFallbackStats(level);
  const { hp, maxHp } = stats;

  const ivs = generateStarterIVs(discordId, speciesId);
  const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const moves = getStartingMoves(speciesId, level, 2);

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
  
  let partyId: string;
  let slots: Array<{ slot: number }>;
  
  if (!party) {
    // Create new party
    const newParty = await createParty(user.id);
    partyId = newParty.id;
    slots = [];
  } else {
    partyId = party.id;
    slots = party.slots;
  }

  // Determine next available slot 1..6
  const used = new Set(slots.map((s) => s.slot));
  let nextSlot = 1;
  for (; nextSlot <= 6; nextSlot++) {
    if (!used.has(nextSlot)) break;
  }
  if (nextSlot > 6) {
    // If party is full, just leave it in the box
    return { created, partyFull: true } as const;
  }

  await createPartySlot(partyId, created.id, nextSlot);

  return { created, partyFull: false } as const;
}

export async function handleStarterPick(
  interaction: RepliableInteraction,
  speciesId: number
) {
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

