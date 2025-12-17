import { spawnEncounterForUser } from "../../core/encounter/spawn.js";
import { linkEncounterToThread } from "../../shared/models/encounter-queries-pg.js";
import { findCooldownByUserAndKind, createCooldown, updateCooldownReadyAt } from "../../services/home-bundle-pg.js";
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { canStartWalk } from "../middleware/limits.js";
import { replyError, replyInfo, deferReply, editReply } from "../shared/response-helpers.js";
import { openEncounterDM } from "./controls.js";
async function getCooldownReadyAt(discordId, kind) {
    const cd = await findCooldownByUserAndKind(discordId, kind);
    return cd?.readyAt ?? null;
}
async function setCooldown(discordId, kind, ms) {
    const user = await ensureUser(discordId);
    const readyAt = new Date(Date.now() + ms);
    const existing = await findCooldownByUserAndKind(discordId, kind);
    if (existing) {
        await updateCooldownReadyAt(existing.id, readyAt);
    }
    else {
        await createCooldown(user.id, kind, readyAt);
    }
}
export async function handleWalk(interaction) {
    if (!interaction.inGuild()) {
        await replyError(interaction, "Use /walk in a server's #wilds channel.");
        return;
    }
    const channel = interaction.channel;
    if (!channel) {
        await replyError(interaction, "Cannot determine channel.");
        return;
    }
    // Enforce #wilds channel by name (simple heuristic)
    const name = channel.name?.toLowerCase?.() ?? "";
    if (!name.includes("wild")) {
        await replyError(interaction, "Please use /walk in the #wilds channel.");
        return;
    }
    // Cooldown check
    const now = Date.now();
    const readyAt = await getCooldownReadyAt(interaction.user.id, "walk");
    if (readyAt && readyAt.getTime() > now) {
        const secs = Math.ceil((readyAt.getTime() - now) / 1000);
        await replyInfo(interaction, `You can /walk again in ${secs}s.`);
        return;
    }
    // Limit: one active encounter per user
    const allowed = await canStartWalk(interaction.user.id);
    if (!allowed.ok) {
        await replyError(interaction, "You already have an active encounter. Finish it first.");
        return;
    }
    // Acknowledge early
    await deferReply(interaction, true);
    // Spawn encounter in DB
    const enc = await spawnEncounterForUser({ discordId: interaction.user.id });
    // Create a thread in this channel; 60 min auto-archive TTL aligns with encounter expiry
    const thread = await channel.threads?.create?.({
        name: `Encounter for ${interaction.user.username}`,
        autoArchiveDuration: 60,
        reason: `Walk encounter ${enc.id}`,
    });
    if (thread) {
        // Link thread to encounter
        await linkEncounterToThread(enc.id, thread.id);
        await thread.send(`A wild Pokémon appears (Lv ${enc.level})! <@${interaction.user.id}> check your homestead channel for controls.`);
    }
    // Send controls to homestead channel
    if (!interaction.guildId) {
        throw new Error("Cannot send encounter controls without guildId");
    }
    await openEncounterDM(interaction.client, interaction.guildId, interaction.user, enc.id);
    // Set a short cooldown (e.g., 30s) for demo
    await setCooldown(interaction.user.id, "walk", 30_000);
    await editReply(interaction, `Your encounter is live${thread ? ` in thread ${thread.name}` : ''}. Good luck!`);
}
