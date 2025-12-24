/**
 * Homestead Heal Module
 *
 * Implements the HEAL screen per Game Design Bible section 6.
 * Players click [💊 Heal] on home screen → arrive here →
 * see party HP status → confirm or cancel healing.
 *
 * SCREEN LAYOUT (per Bible):
 * ┌─────────────────────────────────────────────────────────┐
 * │  💊 POKÉMON CENTER                                      │
 * │                                                         │
 * │  Your party needs healing:                              │
 * │                                                         │
 * │  🔥 Charmander: ██████░░░░ 12/20 HP                     │
 * │  💧 Squirtle: ████████░░ 16/20 HP                       │
 * │                                                         │
 * │  [✅ Heal All] [❌ Cancel]                              │
 * └─────────────────────────────────────────────────────────┘
 *
 * @module homestead/heal
 */
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, } from "discord.js";
import { EMBED_COLORS } from "../shared/embed-colors.js";
import { dangerButton } from "../shared/button-utils.js";
import { safeReply, replyInfo } from "../shared/response-helpers.js";
import { getLogger } from "../../shared/logging/index.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { getPartyWithSlots, healPokemon } from "../../shared/models/party-queries-pg.js";
const logger = getLogger();
// ============================================================================
// BUTTON BUILDERS
// ============================================================================
/**
 * Build heal confirmation buttons
 * Per Bible: [✅ Heal All] [❌ Cancel]
 */
export function buildHealButtons(anyNeedHealing) {
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId("HEAL_CONFIRM")
        .setLabel("✅ Heal All")
        .setStyle(1) // Primary
        .setDisabled(!anyNeedHealing), dangerButton("HEAL_CANCEL", "❌ Cancel"));
    return [row];
}
// ============================================================================
// EMBED BUILDERS
// ============================================================================
/**
 * Build HP bar for a Pokémon
 */
function buildHpBar(hp, maxHp, length = 10) {
    const filled = Math.round((hp / maxHp) * length);
    const empty = length - filled;
    return "█".repeat(filled) + "░".repeat(empty);
}
/**
 * Get HP bar color emoji based on percentage
 */
function getHpEmoji(hp, maxHp) {
    const percent = (hp / maxHp) * 100;
    if (percent <= 0)
        return "💀"; // Fainted
    if (percent <= 25)
        return "🔴"; // Critical
    if (percent <= 50)
        return "🟠"; // Low
    if (percent <= 75)
        return "🟡"; // Medium
    return "🟢"; // Good
}
/**
 * Build the heal screen embed
 */
export function buildHealEmbed(data) {
    const embed = new EmbedBuilder()
        .setTitle("💊 Pokémon Center")
        .setColor(data.allFullHp ? EMBED_COLORS.SUCCESS : EMBED_COLORS.WARNING);
    if (data.partyMembers.length === 0) {
        embed.setDescription("⚠️ You don't have any Pokémon in your party!\n\n" +
            "Use `/starter` to choose your first Pokémon.");
        return embed;
    }
    if (data.allFullHp) {
        embed.setDescription("✨ **All your Pokémon are at full health!**\n\n" +
            "Your party is ready for adventure!");
    }
    else {
        embed.setDescription(`**${data.totalNeedHealing}** Pokémon need healing:\n\n`);
    }
    // Show each party member's HP
    const lines = [];
    for (const member of data.partyMembers) {
        const name = member.nickname || `Species #${member.speciesId}`;
        const hpEmoji = getHpEmoji(member.hp, member.maxHp);
        const hpBar = buildHpBar(member.hp, member.maxHp, 10);
        const status = member.needsHealing ? "" : " ✓";
        lines.push(`${hpEmoji} **${name}** (Lv.${member.level})\n   ${hpBar} ${member.hp}/${member.maxHp}${status}`);
    }
    embed.addFields({ name: "Party Status", value: lines.join("\n\n") });
    return embed;
}
/**
 * Build the healed confirmation embed
 */
export function buildHealedEmbed(healedCount) {
    return new EmbedBuilder()
        .setTitle("💊 Pokémon Center")
        .setColor(EMBED_COLORS.SUCCESS)
        .setDescription(`✨ **Your Pokémon have been healed!**\n\n` +
        `Restored ${healedCount} Pokémon to full health.\n\n` +
        `_"We hope to see you again!"_`);
}
// ============================================================================
// DATA LOADING
// ============================================================================
/**
 * Load party HP data for heal screen
 */
async function loadHealScreenData(discordId) {
    const user = await ensureUser(discordId);
    const party = await getPartyWithSlots(user.id);
    if (!party || party.slots.length === 0) {
        return {
            partyMembers: [],
            totalNeedHealing: 0,
            allFullHp: true,
        };
    }
    const partyMembers = party.slots
        .filter(slot => slot.pokemon)
        .sort((a, b) => a.slot - b.slot)
        .map(slot => {
        const mon = slot.pokemon;
        return {
            speciesId: mon.speciesId,
            nickname: mon.nickname,
            level: mon.level,
            hp: mon.hp,
            maxHp: mon.maxHp,
            needsHealing: mon.hp < mon.maxHp,
        };
    });
    const totalNeedHealing = partyMembers.filter(m => m.needsHealing).length;
    const allFullHp = totalNeedHealing === 0;
    return {
        partyMembers,
        totalNeedHealing,
        allFullHp,
    };
}
// ============================================================================
// SCREEN HANDLERS
// ============================================================================
/**
 * Open the heal screen in user's homestead channel
 */
export async function openHealScreen(client, guildId, user) {
    try {
        const manager = new HomesteadChannelManager(client, guildId);
        const result = await manager.getOrCreateChannel(user);
        const homesteadChannel = result.channel;
        const data = await loadHealScreenData(user.id);
        const embed = buildHealEmbed(data);
        const buttons = buildHealButtons(!data.allFullHp);
        await homesteadChannel.send({ embeds: [embed], components: buttons });
        logger.info("HomesteadHeal", "openHealScreen", "Heal screen opened", {
            metadata: { userId: user.id, needsHealing: data.totalNeedHealing },
        });
    }
    catch (error) {
        logger.error("HomesteadHeal", "openHealScreen", "Failed to open heal screen", {
            metadata: { userId: user.id, error },
        });
        throw error;
    }
}
/**
 * Handle heal confirmation
 */
export async function handleHealConfirm(interaction) {
    const discordId = interaction.user.id;
    try {
        const user = await ensureUser(discordId);
        const party = await getPartyWithSlots(user.id);
        if (!party || party.slots.length === 0) {
            await safeReply(interaction, "You don't have a party to heal!", { ephemeral: true });
            return;
        }
        const instances = party.slots
            .map(slot => slot.pokemon)
            .filter((pokemon) => pokemon !== null);
        if (instances.length === 0) {
            await safeReply(interaction, "You don't have a party to heal!", { ephemeral: true });
            return;
        }
        // Heal all Pokémon
        const healedCount = await healPokemon(instances.map(p => p.id));
        // Update the message with healed confirmation
        const embed = buildHealedEmbed(healedCount);
        await interaction.update({
            embeds: [embed],
            components: [], // Remove buttons after healing
        });
        logger.info("HomesteadHeal", "handleHealConfirm", "Party healed", {
            metadata: { userId: discordId, healedCount },
        });
    }
    catch (error) {
        logger.error("HomesteadHeal", "handleHealConfirm", "Failed to heal", {
            metadata: { userId: discordId, error },
        });
        await safeReply(interaction, "Something went wrong healing your party.", { ephemeral: true });
    }
}
/**
 * Handle heal cancellation - return to home
 */
export async function handleHealCancel(interaction) {
    // Return to home screen
    if (interaction.guildId) {
        const { openPartyView } = await import("./home.js");
        await openPartyView(interaction, { respond: "update" });
    }
}
// ============================================================================
// LEGACY FUNCTIONS (for compatibility)
// ============================================================================
/**
 * @deprecated Use openHealScreen instead for button-first UI
 */
export async function healPartyForUser(discordId) {
    const user = await ensureUser(discordId);
    const party = await getPartyWithSlots(user.id);
    if (!party)
        return { healed: 0 };
    const slots = party.slots;
    if (!slots.length)
        return { healed: 0 };
    const instances = slots
        .map((slot) => slot.pokemon)
        .filter((pokemon) => pokemon !== null);
    if (!instances.length)
        return { healed: 0 };
    const healed = await healPokemon(instances.map(p => p.id));
    return { healed };
}
/**
 * @deprecated Use handleHealConfirm instead for button-first UI
 */
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
