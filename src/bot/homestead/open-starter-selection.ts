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
  EmbedBuilder,
  Message,
  TextChannel,
  User as DiscordUser,
  Client,
} from "discord.js";

import { EMBED_COLORS } from "../shared/embed-colors.js";
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
import { log } from "../../utils/logger.js";
import { getSpriteUrl } from "../../lib/assets.js";

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
export function buildWelcomeEmbed(): EmbedBuilder {
  const counts = getForbiddenCounts();
  
  return new EmbedBuilder()
    .setTitle("🎮 Welcome to Pokémon Infinite Gauntlet!")
    .setDescription(
      "Your adventure begins here in your **Homestead Channel** — your personal Pokémon hub.\n\n" +
      "Choose any Pokémon to start your journey! Simply **type the name** of the Pokémon you want as your starter."
    )
    .setColor(EMBED_COLORS.STARTER)
    .addFields(
      {
        name: "📋 Starter Rules",
        value: 
          "You can choose almost any Pokémon, but these are **not allowed**:\n" +
          "• ❌ Regional starters (Bulbasaur, Charmander, etc.)\n" +
          "• ❌ Legendary Pokémon\n" +
          "• ❌ Mythical Pokémon\n" +
          "• ❌ Pseudo-legendary final forms (Tyranitar, Dragonite, etc.)\n\n" +
          "✅ Earlier evolutions like **Pupitar** or **Dratini** are allowed!",
        inline: false,
      },
      {
        name: "💡 Examples of Valid Starters",
        value: 
          "Pikachu • Eevee • Riolu • Scyther • Heracross\n" +
          "Pupitar • Dratini • Ralts • Larvitar • Happiny\n" +
          "Growlithe • Vulpix • Abra • Machop • Geodude",
        inline: false,
      },
      {
        name: "📝 How to Choose",
        value: "**Type the name of your desired Pokémon** in this channel to select it as your starter.",
        inline: false,
      }
    )
    .setFooter({ text: `${counts.total} Pokémon are restricted • You have 5 minutes to choose` });
}

/**
 * Build error embed for invalid selection
 */
export function buildErrorEmbed(reason: string, attemptedName?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("❌ Invalid Selection")
    .setDescription(reason)
    .setColor(EMBED_COLORS.ERROR)
    .addFields({
      name: "Try Again",
      value: attemptedName 
        ? `"${attemptedName}" cannot be your starter. Type another Pokémon name!`
        : "Type a valid Pokémon name to continue.",
      inline: false,
    })
    .setFooter({ text: "Type a Pokémon name or wait for timeout" });
}

/**
 * Build confirmation embed when starter is successfully chosen
 */
export function buildConfirmationEmbed(speciesName: string, speciesId: number): EmbedBuilder {
  const capitalizedName = speciesName.charAt(0).toUpperCase() + speciesName.slice(1);
  const spriteUrl = getSpriteUrl(speciesId, 'official') || getSpriteUrl(speciesId, 'default');
  
  const embed = new EmbedBuilder()
    .setTitle(`🎉 You chose ${capitalizedName}!`)
    .setDescription(
      `**${capitalizedName}** is now your official starter Pokémon!\n\n` +
      "Your adventure in the Infinite Gauntlet begins now."
    )
    .setColor(EMBED_COLORS.SUCCESS)
    .addFields(
      {
        name: "📊 Your Starter",
        value: `• **Species:** ${capitalizedName}\n• **Level:** 5\n• **Added to Party:** Slot 1`,
        inline: true,
      },
      {
        name: "🎯 Next Steps",
        value: 
          "• Visit **public field channels** to explore\n" +
          "• Use `/walk` to encounter wild Pokémon\n" +
          "• Challenge others to battles!",
        inline: true,
      }
    )
    .setFooter({ text: "Welcome to Pokémon Infinite Gauntlet!" });
    
  if (spriteUrl) {
    embed.setThumbnail(spriteUrl);
  }
  
  return embed;
}

/**
 * Build the rules/how-to-play embed shown after starter confirmation
 */
export function buildRulesEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("📖 How to Play")
    .setDescription(
      "Your **Homestead Channel** (this DM) is your personal Pokémon hub. " +
      "Think of it as your in-game home or Main Menu."
    )
    .setColor(EMBED_COLORS.INFO)
    .addFields(
      {
        name: "🏠 Homestead (This Channel)",
        value:
          "• **Pokémon Center** — Heal your party instantly\n" +
          "• **Party/Storage** — Manage your team\n" +
          "• **Inventory** — Use items\n" +
          "• **Pokédex** — Track discoveries\n" +
          "• **Settings** — Customize your experience",
        inline: false,
      },
      {
        name: "🌍 Public Field Channels",
        value:
          "• Use `/walk`, `/search`, `/fish` to find wild Pokémon\n" +
          "• Different areas have different encounters\n" +
          "• Time & weather affect spawns!",
        inline: false,
      },
      {
        name: "⚔️ Battles",
        value:
          "• Challenge players from your Homestead\n" +
          "• Battles happen in public **Arena Threads**\n" +
          "• Spectators can watch live!",
        inline: false,
      }
    )
    .setFooter({ text: "Use the buttons below to navigate your Homestead" });
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
        
        // Send confirmation
        const confirmEmbed = buildConfirmationEmbed(validation.name, validation.speciesId);
        await channel.send({ embeds: [confirmEmbed] });
        
        // Send rules/how-to-play
        const rulesEmbed = buildRulesEmbed();
        const menuButtons = buildMainMenuButtons();
        await channel.send({ embeds: [rulesEmbed], components: menuButtons });
        
        log('info', "[open-starter] Starter selected successfully", {
          userId: user.id,
          speciesId: validation.speciesId,
          speciesName: validation.name,
        });
        
        resolve({
          success: true,
          speciesId: validation.speciesId,
          speciesName: validation.name,
          pokemonId: result.pokemonId,
        });
      } catch (error) {
        log('error', "[open-starter] Failed to create starter", { error, userId: user.id });
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
    log('error', "[open-starter] Failed to start selection flow", { error, userId: user.id });
    return { error: true, message: "Failed to initialize starter selection." };
  }
}
