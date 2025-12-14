import { EmbedBuilder } from "discord.js";

import { EMBED_COLORS } from "../shared/embed-colors.js";
import { getSpriteUrl } from "../../lib/assets.js";
import type { TrainerProfileSummary } from "../../models/index.js";

function asDiscordTimestamp(input: Date | string | null | undefined, style: "R" | "d" = "R"): string | null {
  if (!input) return null;
  const value = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(value.valueOf())) return null;
  const unix = Math.floor(value.getTime() / 1000);
  return `<t:${unix}:${style}>`;
}

function formatStatLine(label: string, value: number | string): string {
  const rendered = typeof value === "number" ? value.toLocaleString("en-US") : value;
  return `${label}: ${rendered}`;
}

function formatOutcome(outcome: TrainerProfileSummary["battles"]["recent"][number]["outcome"]): string {
  switch (outcome) {
    case "win":
      return "Win";
    case "loss":
      return "Loss";
    case "forfeit":
      return "Forfeit";
    default:
      return "Draw";
  }
}

function formatRecentCaptures(summary: TrainerProfileSummary): string | null {
  if (!summary.stats.recentCaptures.length) return null;
  const lines = summary.stats.recentCaptures.map((capture) => {
    const species = capture.speciesName || (capture.speciesId ? `Species #${capture.speciesId}` : "Unknown");
    const nickname = capture.nickname && capture.nickname.trim().length ? `"${capture.nickname.trim()}"` : null;
    const shiny = capture.isShiny ? " *" : "";
    const when = asDiscordTimestamp(capture.capturedAt, "R");
    const pieces = [species + shiny];
    if (nickname) pieces.unshift(nickname);
    if (when) pieces.push(when);
    return `- ${pieces.join(" | ")}`;
  });
  return lines.join("\n");
}

export function buildTrainerProfileEmbed(
  summary: TrainerProfileSummary,
  opts: { now?: Date } = {}
): EmbedBuilder {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const embed = new EmbedBuilder()
    .setTitle("Trainer Profile")
    .setColor(EMBED_COLORS.WARNING)
    .setDescription(
      summary.profile.tagline && summary.profile.tagline.length
        ? summary.profile.tagline
        : `Trainer: <@${summary.user.discordId}>`
    );

  const statsLines = [
    formatStatLine("Coins", summary.user.coins),
    formatStatLine(
      "Pokémon",
      `${summary.stats.totalPokemon} (Party ${summary.stats.partyCount} / Storage ${summary.stats.storageCount})`
    ),
    formatStatLine("Unique Species", summary.stats.uniqueSpecies),
    formatStatLine("Shinies", summary.stats.shinyCount),
  ];
  embed.addFields({ name: "Stats", value: statsLines.join("\n") });

  if (summary.profile.bio) {
    embed.addFields({ name: "Bio", value: summary.profile.bio.slice(0, 1024) });
  }

  if (summary.battles.total > 0) {
    const { wins, losses, forfeits, total, lastOutcome, lastBattleAt } = summary.battles;
    const lastLine = lastOutcome
      ? `Last: ${formatOutcome(lastOutcome)}${lastBattleAt ? ` ${asDiscordTimestamp(lastBattleAt)}` : ""}`
      : 'Last: n/a';
    const battleLines = [
      formatStatLine("Record", `${wins}-${losses}${forfeits ? ` (${forfeits} forfeit)` : ""}`),
      formatStatLine("Battles", total),
      lastLine,
    ];
    embed.addFields({ name: "Battle Record", value: battleLines.join("\n") });
  }

  const questLines = [summary.quest.message];
  if (summary.quest.nextDue) {
    const rel = asDiscordTimestamp(summary.quest.nextDue, "R");
    if (rel) questLines.push(`Next quest ${rel}`);
  }
  if (summary.quest.lastCompleted) {
    const rel = asDiscordTimestamp(summary.quest.lastCompleted, "R");
    if (rel) questLines.push(`Last completed ${rel}`);
  }
  embed.addFields({ name: "Daily Quest", value: questLines.join("\n").slice(0, 1024) });

  const rewardLabel = summary.dailyRewardReadyAt && summary.dailyRewardReadyAt > now
    ? `Available ${asDiscordTimestamp(summary.dailyRewardReadyAt, "R")}`
    : "Ready now";
  embed.addFields({ name: "Daily Reward", value: rewardLabel });

  if (summary.profile.favoriteSpeciesId) {
    const speciesName = summary.profile.favoriteSpeciesName || `Species #${summary.profile.favoriteSpeciesId}`;
    const spriteUrl = getSpriteUrl(summary.profile.favoriteSpeciesId, "sprite");
    const lines = [speciesName];
    if (spriteUrl) {
      lines.push(spriteUrl);
    }
    embed.addFields({ name: "Favorite Pokémon", value: lines.join("\n").slice(0, 1024), inline: false });
  }

  const recentCaptures = formatRecentCaptures(summary);
  if (recentCaptures) {
    embed.addFields({ name: "Recent Captures", value: recentCaptures.slice(0, 1024) });
  }

  const trainerSince = asDiscordTimestamp(summary.user.createdAt, "d");
  if (trainerSince) {
    embed.setFooter({ text: `Trainer since ${trainerSince}` });
  }

  return embed;
}
