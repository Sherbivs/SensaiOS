/**
 * Open Starter Selection System
 * 
 * Implements the "choose any valid Pokémon" starter selection flow for
 * Pokémon Infinite Gauntlet. Players can type any Pokémon name and the
 * system validates against the starter rules.
 * 
 * FLOW:
 * 1. Player receives welcome + rules in homestead channel
 * 2. Player types a Pokémon name
 * 3. System validates: exists? not forbidden?
 * 4. If invalid → error message → retry
 * 5. If valid → create starter → show confirmation → main menu
 * 
 * @module homestead/open-starter-selection
 */

import {
  Message,
  TextChannel,
  User as DiscordUser,
  Client,
} from "discord.js";

import { 
  starterWelcomeEmbed, 
  starterErrorEmbed, 
  starterConfirmationEmbed, 
  starterRulesEmbed 
} from "../shared/embed-builders.js";
import { homeMenuButtonsEnhanced } from "../shared/button-utils.js";
import {
  validateStarterSelection,
  getRejectionMessage,
  getForbiddenCounts,
} from "../../core/starter-validation.js";
import { getPokemon } from "../../lib/dex-api.js";
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { getPartyWithSlots, createParty, createPartySlot, createPokemon } from "../../shared/models/party-queries-pg.js";
import { getProdDb } from "../../shared/pg-connection.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { getLogger } from "../../shared/logging/index.js";
import { getSpriteUrl } from "../../lib/assets.js";
import { giveStarterKit, formatItemRewardsInline } from "../../services/inventory.js";

const logger = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type OpenStarterResult = 
  | { success: true; speciesId: number; speciesName: string; pokemonId: string }
  | { alreadyHasStarter: true }
  | { cancelled: true; reason: string }
  | { error: true; message: string };

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

/**
 * Build the welcome embed shown when starter selection begins
 */
export function buildWelcomeEmbed() {
  const counts = getForbiddenCounts();
  return starterWelcomeEmbed(counts as { total: number });
}

/**
 * Build error embed for invalid selection
 */
export function buildErrorEmbed(reason: string, attemptedName?: string) {
  return starterErrorEmbed(reason, attemptedName);
}

/**
 * Build confirmation embed when starter is successfully chosen
 */
export function buildConfirmationEmbed(speciesName: string, speciesId: number) {
  const spriteUrl = getSpriteUrl(speciesId, 'artwork') || getSpriteUrl(speciesId, 'sprite');
  return starterConfirmationEmbed(speciesName, spriteUrl);
}

/**
 * Build the rules/how-to-play embed shown after starter confirmation
 */
export function buildRulesEmbed() {
  return starterRulesEmbed();
}

/**
 * Build the main menu buttons
 */
export function buildMainMenuButtons() {
  return homeMenuButtonsEnhanced();
}

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Species lookup adapter for validation
 */
function speciesLookup(query: string | number): { id: number; name: string } | null {
  const pokemon = getPokemon(query);
  if (!pokemon) return null;
  return { id: pokemon.id, name: pokemon.name };
}

/**
 * Check if user already has a starter (any Pokémon)
 */
async function userHasStarter(discordId: string): Promise<boolean> {
  const user = await ensureUser(discordId);
  const db = getProdDb();
  const result = await db.query(
    'SELECT COUNT(*)::int as count FROM "PokemonInstance" WHERE "ownerId" = $1',
    [user.id]
  );
  return (result.rows[0]?.count ?? 0) > 0;
}

/**
 * Create the starter Pokémon and assign to party
 */
async function createOpenStarter(
  discordId: string,
  speciesId: number
): Promise<{ pokemonId: string; partyFull: boolean }> {
  const user = await ensureUser(discordId);
  
  // Compute initial stats (level 5)
  const level = 5;
  const maxHp = 20 + level * 3; // Simple formula for now
  const hp = maxHp;
  
  // Perfect IVs for starter (reward for choosing freely)
  const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
  const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  
  // Basic starting moves
  const moves = [
    { id: 33, name: "Tackle", pp: 35, maxPP: 35 },
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
  
  // Ensure party exists
  const party = await getPartyWithSlots(user.id);
  let partyId: string;
  let slots: Array<{ slot: number }>;
  
  if (!party) {
    const newParty = await createParty(user.id);
    partyId = newParty.id;
    slots = [];
  } else {
    partyId = party.id;
    slots = party.slots;
  }
  
  // Find next available slot
  const used = new Set(slots.map((s) => s.slot));
  let nextSlot = 1;
  for (; nextSlot <= 6; nextSlot++) {
    if (!used.has(nextSlot)) break;
  }
  
  if (nextSlot > 6) {
    return { pokemonId: created.id, partyFull: true };
  }
  
  await createPartySlot(partyId, created.id, nextSlot);
  return { pokemonId: created.id, partyFull: false };
}

// ============================================================================
// MAIN FLOW
// ============================================================================

/**
 * Run the open starter selection flow in a homestead channel
 * 
 * @param client Discord client
 * @param channel The homestead channel to run selection in
 * @param user The user selecting their starter
 * @param timeoutMs Timeout for selection (default: 5 minutes)
 */
export async function runOpenStarterSelection(
  client: Client,
  channel: TextChannel,
  user: DiscordUser,
  timeoutMs: number = 5 * 60 * 1000
): Promise<OpenStarterResult> {
  // Check if user already has a starter
  const hasStarter = await userHasStarter(user.id);
  if (hasStarter) {
    return { alreadyHasStarter: true };
  }
  
  // Send welcome message with rules
  const welcomeEmbed = buildWelcomeEmbed();
  await channel.send({ embeds: [welcomeEmbed] });
  
  // Create message collector for user's response
  const filter = (msg: Message) => msg.author.id === user.id;
  const collector = channel.createMessageCollector({
    filter,
    time: timeoutMs,
  });
  
  return new Promise<OpenStarterResult>((resolve) => {
    let resolved = false;
    
    collector.on('collect', async (message: Message) => {
      if (resolved) return;
      
      const input = message.content.trim();
      
      // Skip empty messages or commands
      if (!input || input.startsWith('/') || input.startsWith('!')) {
        return;
      }
      
      // Validate the selection
      const validation = validateStarterSelection(input, speciesLookup);
      
      if (!validation.valid) {
        // Send error and continue collecting
        const errorEmbed = buildErrorEmbed(
          getRejectionMessage(validation.reason),
          validation.name || input
        );
        await channel.send({ embeds: [errorEmbed] });
        return;
      }
      
      // Valid selection! Stop collector and process
      resolved = true;
      collector.stop('selected');
      
      try {
        // Create the starter
        const result = await createOpenStarter(user.id, validation.speciesId);
        
        // Give starter kit items
        const starterItems = await giveStarterKit(user.id);
        const itemsText = starterItems.length > 0 
          ? `\n\n🎒 **Starter Kit:** ${formatItemRewardsInline(starterItems)}`
          : '';
        
        // Send confirmation
        const confirmEmbed = buildConfirmationEmbed(validation.name, validation.speciesId);
        if (itemsText) {
          confirmEmbed.setDescription((confirmEmbed.data.description || '') + itemsText);
        }
        await channel.send({ embeds: [confirmEmbed] });
        
        // Send rules/how-to-play
        const rulesEmbed = buildRulesEmbed();
        const menuButtons = buildMainMenuButtons();
        await channel.send({ embeds: [rulesEmbed], components: menuButtons });
        
        logger.info('OpenStarterSelection', 'runOpenStarterSelection', 'Starter selected successfully', {
          userId: user.id,
          metadata: {
            speciesId: validation.speciesId,
            speciesName: validation.name,
          },
        });
        
        resolve({
          success: true,
          speciesId: validation.speciesId,
          speciesName: validation.name,
          pokemonId: result.pokemonId,
        });
      } catch (error) {
        logger.error('OpenStarterSelection', 'runOpenStarterSelection', 'Failed to create starter', { userId: user.id, metadata: { error } });
        resolve({ error: true, message: "Failed to create your starter. Please try again." });
      }
    });
    
    collector.on('end', (collected, reason) => {
      if (resolved) return;
      
      if (reason === 'time') {
        channel.send({
          content: "⏰ Starter selection timed out. Use `/start` to try again!",
        });
        resolve({ cancelled: true, reason: 'timeout' });
      }
    });
  });
}

/**
 * Start the open starter selection flow for a user
 * Creates homestead channel if needed, then runs selection
 */
export async function startOpenStarterFlow(
  client: Client,
  guildId: string,
  user: DiscordUser
): Promise<OpenStarterResult> {
  try {
    // Get or create homestead channel
    const manager = new HomesteadChannelManager(client, guildId);
    const result = await manager.getOrCreateChannel(user);
    const channel = result.channel as TextChannel;
    
    // Run the selection flow
    return await runOpenStarterSelection(client, channel, user);
  } catch (error) {
    logger.error('OpenStarterSelection', 'startOpenStarterFlow', 'Failed to start selection flow', { userId: user.id, metadata: { error } });
    return { error: true, message: "Failed to initialize starter selection." };
  }
}

