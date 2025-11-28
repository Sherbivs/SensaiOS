import type { ChatInputCommandInteraction, GuildTextBasedChannel } from "discord.js";

import { spawnEncounterForUser } from "../../core/encounter/spawn.js";
import { linkEncounterToThread } from "../../shared/models/encounter-queries-pg.js";
import { findCooldownByUserAndKind, createCooldown, updateCooldownReadyAt } from "../../services/home-bundle-pg.js";
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { canStartWalk } from "../middleware/limits.js";

import { openEncounterDM } from "./controls.js";

async function getCooldownReadyAt(discordId: string, kind: string) {
  const cd = await findCooldownByUserAndKind(discordId, kind);
  return cd?.readyAt ?? null;
}

async function setCooldown(discordId: string, kind: string, ms: number) {
  const user = await ensureUser(discordId);
  const readyAt = new Date(Date.now() + ms);
  const existing = await findCooldownByUserAndKind(discordId, kind);
  
  if (existing) {
    await updateCooldownReadyAt(existing.id, readyAt);
  } else {
    await createCooldown(user.id, kind, readyAt);
  }
}

export async function handleWalk(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "Use /walk in a server's #wilds channel.", ephemeral: true });
    return;
  }

  const channel = interaction.channel as GuildTextBasedChannel | null;
  if (!channel) {
    await interaction.reply({ content: "Cannot determine channel.", ephemeral: true });
    return;
  }

  // Enforce #wilds channel by name (simple heuristic)
  const name = (channel as any).name?.toLowerCase?.() ?? "";
  if (!name.includes("wild")) {
    await interaction.reply({ content: "Please use /walk in the #wilds channel.", ephemeral: true });
    return;
  }

  // Cooldown check
  const now = Date.now();
  const readyAt = await getCooldownReadyAt(interaction.user.id, "walk");
  if (readyAt && readyAt.getTime() > now) {
    const secs = Math.ceil((readyAt.getTime() - now) / 1000);
    await interaction.reply({ content: `You can /walk again in ${secs}s.`, ephemeral: true });
    return;
  }

  // Limit: one active encounter per user
  const allowed = await canStartWalk(interaction.user.id);
  if (!allowed.ok) {
    await interaction.reply({ content: "You already have an active encounter. Finish it first.", ephemeral: true });
    return;
  }

  // Acknowledge early
  await interaction.deferReply({ ephemeral: true });

  // Spawn encounter in DB
  const enc = await spawnEncounterForUser({ discordId: interaction.user.id });

  // Create a thread in this channel; 60 min auto-archive TTL aligns with encounter expiry
  const thread = await (channel as any).threads?.create?.({
    name: `Encounter for ${interaction.user.username}`,
    autoArchiveDuration: 60,
    reason: `Walk encounter ${enc.id}`,
  });

  if (thread) {
    // Link thread to encounter
    await linkEncounterToThread(enc.id, thread.id);
    await thread.send(
      `A wild Pokémon appears (Lv ${enc.level})! <@${interaction.user.id}> check your homestead channel for controls.`
    );
  }

  // Send controls to homestead channel
  if (!interaction.guildId) {
    throw new Error("Cannot send encounter controls without guildId");
  }
  await openEncounterDM(interaction.client, interaction.guildId, interaction.user, enc.id);

  // Set a short cooldown (e.g., 30s) for demo
  await setCooldown(interaction.user.id, "walk", 30_000);

  await interaction.editReply({ content: `Your encounter is live${thread ? ` in thread ${thread.name}` : ''}. Good luck!` });
}
