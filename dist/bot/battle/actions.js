import { randomUUID } from "node:crypto";
import { ActionRowBuilder, ComponentType, StringSelectMenuBuilder, } from "discord.js";
import { battleActionEmbed } from "../shared/embed-builders.js";
import { tripleActionRow } from "../shared/button-utils.js";
import { replyError, followUpEphemeral } from "../shared/response-helpers.js";
import { listLegalMoves, listSwitchOptions, queueMoveAction, queueSwitchAction, setPlayerState, } from "../../core/battle/turn-manager.js";
import { BattleRepo, prisma as prismaClient } from "../../models/index.js";
import { invalidateBattleState, loadBattleState } from "../../services/cache/recipes.js";
import { getPartyWithSlots } from "../../shared/models/party-queries-pg.js";
import { getProdDb } from "../../shared/pg-connection.js";
import { errorTracker } from '../../services/monitoring/index.js';
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import * as concludeModule from "./conclude.js";
export const MOVE_PREFIX = "BATTLE_MOVE_";
export const SWITCH_PREFIX = "BATTLE_SWITCH_";
export const FORFEIT_PREFIX = "BATTLE_FORFEIT_";
export function buildBattleActionPrompt(battleId) {
    const embed = battleActionEmbed();
    const row = tripleActionRow(`${MOVE_PREFIX}${battleId}`, "Move", `${SWITCH_PREFIX}${battleId}`, "Switch", `${FORFEIT_PREFIX}${battleId}`, "Forfeit");
    return { embed, components: [row] };
}
export async function openActionDMs(battleId, client, guildId) {
    const prisma = prismaClient;
    const battle = await loadBattleState(battleId, { prisma });
    if (!battle)
        return false;
    const payload = buildBattleActionPrompt(battle.id);
    const manager = new HomesteadChannelManager(client, guildId);
    try {
        const u1 = await client.users.fetch(battle.p1.discordId);
        const result1 = await manager.getOrCreateChannel(u1);
        await result1.channel.send({ embeds: [payload.embed], components: payload.components });
    }
    catch {
        // Best-effort homestead delivery; ignore individual failures.
    }
    try {
        const u2 = await client.users.fetch(battle.p2.discordId);
        const result2 = await manager.getOrCreateChannel(u2);
        await result2.channel.send({ embeds: [payload.embed], components: payload.components });
    }
    catch {
        // Best-effort homestead delivery; ignore individual failures.
    }
    return true;
}
function parse(customId) {
    if (customId.startsWith(MOVE_PREFIX))
        return { kind: "move", battleId: customId.substring(MOVE_PREFIX.length) };
    if (customId.startsWith(SWITCH_PREFIX))
        return { kind: "switch", battleId: customId.substring(SWITCH_PREFIX.length) };
    if (customId.startsWith(FORFEIT_PREFIX))
        return { kind: "forfeit", battleId: customId.substring(FORFEIT_PREFIX.length) };
    return null;
}
function collectIds(...values) {
    const ids = new Set();
    for (const value of values) {
        if (Array.isArray(value)) {
            for (const entry of value) {
                if (entry != null)
                    ids.add(String(entry));
            }
        }
        else if (value != null) {
            ids.add(String(value));
        }
    }
    return ids;
}
async function defaultPromptMove({ interaction, battleId, active, moves }) {
    if (moves.length === 0)
        return null;
    const selectId = `${MOVE_PREFIX}SELECT_${battleId}`;
    const select = new StringSelectMenuBuilder()
        .setCustomId(selectId)
        .setPlaceholder(`Choose a move for ${active.label}`)
        .addOptions(moves.map((move) => ({
        label: move.label.substring(0, 100),
        value: move.id,
        description: move.description?.substring(0, 100) ?? undefined,
    })));
    const row = new ActionRowBuilder().addComponents(select);
    const replyMessage = await interaction.reply({
        content: `Which move should ${active.label} use?`,
        components: [row],
        ephemeral: true,
        fetchReply: true,
    });
    try {
        const selection = await replyMessage.awaitMessageComponent({
            componentType: ComponentType.StringSelect,
            time: 30_000,
            filter: (componentInteraction) => componentInteraction.user.id === interaction.user.id && componentInteraction.customId === selectId,
        });
        const choice = selection.values?.[0] ?? null;
        const picked = moves.find((move) => move.id === choice);
        await selection.update({
            content: picked ? `Locked in **${picked.label}**.` : "Move selection recorded.",
            components: [],
        });
        return choice;
    }
    catch {
        try {
            await interaction.editReply({ content: "Move selection timed out.", components: [] });
        }
        catch {
            // ignore edit failures
        }
        return null;
    }
}
async function defaultPromptSwitch({ interaction, battleId, active, options }) {
    if (options.length === 0)
        return null;
    const selectId = `${SWITCH_PREFIX}SELECT_${battleId}`;
    const select = new StringSelectMenuBuilder()
        .setCustomId(selectId)
        .setPlaceholder(`Switch ${active.label} for...`)
        .addOptions(options.map((member) => ({
        label: member.label.substring(0, 100),
        value: member.id,
        description: `HP ${member.hp}/${member.maxHp}`.substring(0, 100),
    })));
    const row = new ActionRowBuilder().addComponents(select);
    const replyMessage = await interaction.reply({
        content: `Choose a healthy party member to switch in.`,
        components: [row],
        ephemeral: true,
        fetchReply: true,
    });
    try {
        const selection = await replyMessage.awaitMessageComponent({
            componentType: ComponentType.StringSelect,
            time: 30_000,
            filter: (componentInteraction) => componentInteraction.user.id === interaction.user.id && componentInteraction.customId === selectId,
        });
        const choice = selection.values?.[0] ?? null;
        const picked = options.find((member) => member.id === choice);
        await selection.update({
            content: picked ? `Switching to **${picked.label}** next turn.` : "Switch request recorded.",
            components: [],
        });
        return choice;
    }
    catch {
        try {
            await interaction.editReply({ content: "Switch selection timed out.", components: [] });
        }
        catch {
            // ignore edit failures
        }
        return null;
    }
}
function identifyPlayer(battle, interaction) {
    const userIds = collectIds(interaction.user?.id, interaction.user?.discordId);
    const p1Ids = collectIds(battle.p1?.id, battle.p1?.userId, battle.p1?.discordId);
    const p2Ids = collectIds(battle.p2?.id, battle.p2?.userId, battle.p2?.discordId);
    for (const id of userIds) {
        if (p1Ids.has(id)) {
            return { key: "p1", player: battle.p1 };
        }
        if (p2Ids.has(id)) {
            return { key: "p2", player: battle.p2 };
        }
    }
    return null;
}
function toPartyMember(entry) {
    const movesArray = Array.isArray(entry?.movesJson) ? entry.movesJson : [];
    const moves = [];
    movesArray.forEach((move, idx) => {
        if (!move || typeof move !== "object") {
            return;
        }
        const payload = move;
        const idValue = typeof payload.id === "string" || typeof payload.id === "number"
            ? String(payload.id)
            : typeof payload.slug === "string"
                ? payload.slug
                : typeof payload.name === "string"
                    ? payload.name.toLowerCase()
                    : `move-${idx}`;
        const label = typeof payload.name === "string" && payload.name.length > 0 ? payload.name : `Move ${idx + 1}`;
        const remaining = typeof payload.pp === "number" ? payload.pp : undefined;
        const max = typeof payload.maxPP === "number" ? payload.maxPP : undefined;
        const desc = remaining != null && max != null
            ? `PP ${remaining}/${max}`
            : remaining != null
                ? `PP ${remaining}`
                : undefined;
        moves.push({
            id: idValue,
            label,
            remainingPp: remaining,
            maxPp: max,
            description: desc,
        });
    });
    const nickname = typeof entry?.nickname === "string" && entry.nickname.length > 0 ? entry.nickname : null;
    const label = nickname ?? `Lv${entry?.level ?? "?"} #${entry?.speciesId ?? "?"}`;
    const hp = typeof entry?.hp === "number" ? entry.hp : 0;
    const maxHp = typeof entry?.maxHp === "number" ? entry.maxHp : Math.max(1, hp);
    return {
        id: String(entry?.id ?? randomUUID()),
        label,
        hp,
        maxHp,
        fainted: hp <= 0,
        moves,
    };
}
async function loadParticipantState(pool, player) {
    if (!player?.id)
        return null;
    const party = await getPartyWithSlots(player.id, pool);
    const slots = party?.slots ?? [];
    if (!Array.isArray(slots) || slots.length === 0) {
        return null;
    }
    const members = slots
        .map((slot) => (slot?.pokemon ? toPartyMember(slot.pokemon) : null))
        .filter((member) => Boolean(member));
    if (members.length === 0) {
        return null;
    }
    const healthy = members.filter((member) => !member.fainted);
    const active = healthy[0] ?? members[0];
    const bench = members.filter((member) => member.id !== active.id);
    return { active, bench };
}
async function maybeAdvanceTurn(battleId, interaction, dispatcher) {
    await invalidateBattleState(battleId);
    try {
        if (!interaction.guildId) {
            throw new Error('Cannot send battle actions: missing guild context');
        }
        await dispatcher(battleId, interaction.client, interaction.guildId);
    }
    catch {
        // ignore homestead delivery failures for now
    }
}
export async function handleBattleActionButton(interaction, opts = {}) {
    const parsedResult = parse(interaction.customId);
    if (!parsedResult)
        return;
    const parsed = parsedResult;
    const pool = opts.pool ?? getProdDb();
    // Note: loadBattleState still uses Prisma via cache layer - deferred to cache migration task
    const battle = await loadBattleState(parsed.battleId, { prisma: prismaClient });
    if (!battle) {
        await replyError(interaction, "This battle no longer exists.");
        return;
    }
    if (battle.state !== "Active") {
        await replyError(interaction, `Battle is ${battle.state}.`);
        return;
    }
    const identified = identifyPlayer(battle, interaction);
    if (!identified) {
        await replyError(interaction, "You are not a participant in this battle.");
        return;
    }
    if (parsed.kind === "forfeit") {
        const userIds = collectIds(interaction.user?.id, interaction.user?.discordId);
        const p1Ids = collectIds(battle.p1?.id, battle.p1?.userId, battle.p1?.discordId);
        const forfeiterIsP1 = Array.from(p1Ids).some((id) => userIds.has(id));
        const winnerKey = forfeiterIsP1 ? "p2" : "p1";
        // Note: BattleRepo.concludeBattle still uses Prisma - deferred to repository migration task
        const result = await BattleRepo.concludeBattle({
            prisma: prismaClient,
            battle,
            winner: winnerKey,
            turnCount: 0,
            reason: "forfeit",
        });
        await invalidateBattleState(battle.id);
        // Ensure we have guildId for homestead channel delivery
        if (!interaction.guildId) {
            throw new Error("Cannot announce battle result without guildId");
        }
        await concludeModule.announceBattleResult({
            client: interaction.client,
            guildId: interaction.guildId,
            battle,
            result,
            updateLoserInteraction: async (message) => {
                await interaction.update({ content: message, components: [] });
            },
        });
        return;
    }
    const participant = await loadParticipantState(pool, identified.player);
    if (!participant) {
        await replyError(interaction, "No available party members to act.");
        return;
    }
    setPlayerState(battle.id, identified.key, participant);
    const promptMove = opts.promptMove ?? defaultPromptMove;
    const promptSwitch = opts.promptSwitch ?? defaultPromptSwitch;
    const dispatcher = opts.openActionDmHandler ?? openActionDMs;
    if (parsed.kind === "move") {
        const moves = listLegalMoves(battle.id, identified.key);
        if (moves.length === 0) {
            await replyError(interaction, "No moves available for your active Pokémon.");
            return;
        }
        const choice = await promptMove({ interaction, battleId: battle.id, active: participant.active, moves });
        if (!choice) {
            return;
        }
        try {
            const result = queueMoveAction(battle.id, identified.key, choice);
            if (result.status === "ready") {
                await maybeAdvanceTurn(battle.id, interaction, dispatcher);
            }
        }
        catch (err) {
            await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
                category: 'ENGINE',
                userId: interaction.user.id,
                guildId: interaction.guildId || undefined,
                operation: 'battle:queueMoveAction',
                customData: {
                    battleId: battle.id,
                    playerKey: identified.key,
                    moveId: choice,
                },
            });
            await followUpEphemeral(interaction, "That move can't be used right now.");
        }
        return;
    }
    if (parsed.kind === "switch") {
        const options = listSwitchOptions(battle.id, identified.key);
        if (options.length === 0) {
            await replyError(interaction, "No healthy Pokémon available to switch in.");
            return;
        }
        const choice = await promptSwitch({
            interaction,
            battleId: battle.id,
            active: participant.active,
            options,
        });
        if (!choice) {
            return;
        }
        try {
            const result = queueSwitchAction(battle.id, identified.key, choice);
            await invalidateBattleState(battle.id);
            if (result.status === "ready") {
                try {
                    if (!interaction.guildId) {
                        throw new Error('Cannot send battle actions: missing guild context');
                    }
                    await dispatcher(battle.id, interaction.client, interaction.guildId);
                }
                catch {
                    // Homestead delivery failures are expected (permission/access issues)
                    // Don't track these as errors
                }
            }
        }
        catch (err) {
            await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
                category: 'ENGINE',
                userId: interaction.user.id,
                guildId: interaction.guildId || undefined,
                operation: 'battle:queueSwitchAction',
                customData: {
                    battleId: battle.id,
                    playerKey: identified.key,
                    switchToId: choice,
                },
            });
            await interaction.followUp({
                content: "Cannot switch to that Pokémon right now.",
                ephemeral: true,
            });
        }
        return;
    }
}
