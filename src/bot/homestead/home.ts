import { getLogger } from "../../shared/logging/index.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionReplyOptions,
  MessageActionRowComponentBuilder,
  RepliableInteraction,
} from "discord.js";

const logger = getLogger();

import { EMBED_COLORS } from "../shared/embed-colors.js";
import { navButton, primaryButton, paginationRow } from "../shared/button-utils.js";
import { safeReply, safeReplyWithPayload } from "../shared/response-helpers.js";
import { getSpriteUrl } from "../../lib/assets.js";
import {
  DMHomeRepo,
  TrainerHomePokemon,
  TrainerHomeSnapshot,
  TrainerPartySlot,
  evaluateDailyQuestStreak,
} from "../../models/index.js";
import { errorTracker } from '../../services/monitoring/index.js';
import { HomesteadChannelManager } from '../../services/homestead-manager.js';
import { ensureError } from "../../shared/utils/error-utils.js";

const BOX_PAGE_SIZE = 10;
export const BOX_PAGE_PREFIX = "HOME_BOX_PAGE_";

type ViewKey = "party" | "box" | "profile";

type InteractionWithUser = (RepliableInteraction | ButtonInteraction | ChatInputCommandInteraction) & {
  user: RepliableInteraction["user"];
};

type ViewRender = {
  embed: EmbedBuilder;
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  meta?: { page?: number; totalPages?: number };
};

type ResponseMode = "reply" | "update" | "homestead";

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatPokemonName(mon: TrainerHomePokemon | null): string {
  if (!mon) return "Empty";
  const speciesLabel = mon.speciesName || (mon.speciesId ? `Species #${mon.speciesId}` : "Unknown");
  if (mon.nickname && mon.nickname.trim().length > 0 && mon.nickname.trim() !== speciesLabel) {
    return `${mon.nickname.trim()} (${speciesLabel})`;
  }
  return speciesLabel;
}

function formatHp(mon: TrainerHomePokemon | null): string {
  if (!mon) return "HP 0 / 0";
  const hp = safeNumber(mon.hp);
  const maxHp = safeNumber(mon.maxHp);
  if (hp === null || maxHp === null) return "HP ?";
  return `HP ${hp} / ${maxHp}`;
}

function formatStatus(mon: TrainerHomePokemon | null): string | null {
  if (!mon?.status) return null;
  return `Status: ${mon.status}`;
}

function buildNavRow(active: ViewKey): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(
    navButton("HOME_PARTY", "📋 Party", active === "party"),
    navButton("HOME_BOX", "📦 Box", active === "box"),
    navButton("HOME_PROFILE", "👤 Profile", active === "profile")
  );
  return row;
}

function buildActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    primaryButton("HOME_EXPLORE", "🚶 Explore"),
    primaryButton("HOME_HEAL", "💊 Heal")
  );
}

// Legacy alias for backwards compatibility
function buildHealRow(): ActionRowBuilder<ButtonBuilder> {
  return buildActionRow();
}

function formatPartyEntry(slot: TrainerPartySlot): string {
  const mon = slot.pokemon;
  if (!mon) {
    return "Empty slot — Visit the box to move a Pokémon into your party.";
  }
  const name = formatPokemonName(mon);
  const level = safeNumber(mon.level);
  const hp = formatHp(mon);
  const status = formatStatus(mon);
  const shiny = mon.isShiny ? " ✨" : "";
  const lines = [`${name}${shiny} — ${level !== null ? `Lv. ${level}` : "Lv. ?"}`, hp];
  if (status) {
    lines.push(status);
  }
  const sprite = mon.speciesId ? getSpriteUrl(mon.speciesId, "sprite") : null;
  if (sprite) {
    lines.push(sprite);
  }
  return lines.join("\n");
}

function buildPartyView(snapshot: TrainerHomeSnapshot): ViewRender {
  const embed = new EmbedBuilder()
    .setTitle("Party Overview")
    .setColor(EMBED_COLORS.SUCCESS)
    .setDescription("Your active party slots.");

  const hasMembers = snapshot.party.some((slot) => slot.pokemon);
  if (!snapshot.party.length || !hasMembers) {
    embed.setDescription("Your party is empty. Use /starter or move Pokémon from your storage box.");
  }

  snapshot.party.forEach((slot, idx) => {
    embed.addFields({
      name: `Slot ${slot.slot ?? idx + 1}`,
      value: formatPartyEntry(slot),
    });
  });

  const components = [buildNavRow("party"), buildHealRow()];
  return { embed, components };
}

function formatBoxEntry(mon: TrainerHomePokemon, absoluteIndex: number): string {
  const name = formatPokemonName(mon);
  const shiny = mon.isShiny ? " ✨" : "";
  const level = safeNumber(mon.level);
  const slotLabel = mon.boxSlot != null ? `Box Slot ${mon.boxSlot}` : `Stored #${absoluteIndex}`;
  const hp = formatHp(mon);
  const status = formatStatus(mon);
  const parts = [`${slotLabel}: ${name}${shiny}`, level !== null ? `Lv. ${level}` : "Lv. ?", hp];
  if (status) parts.push(status);
  return parts.join(" • ");
}

function buildBoxPaginationRow(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  const prevId = `${BOX_PAGE_PREFIX}${Math.max(1, page - 1)}`;
  const nextId = `${BOX_PAGE_PREFIX}${Math.min(totalPages, page + 1)}`;
  return paginationRow(prevId, nextId, page > 1, page < totalPages);
}

function buildBoxView(snapshot: TrainerHomeSnapshot, page = 1): ViewRender {
  const total = snapshot.box.length;
  const totalPages = Math.max(1, Math.ceil(total / BOX_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * BOX_PAGE_SIZE;
  const items = snapshot.box.slice(start, start + BOX_PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setTitle("Storage Box")
    .setColor(EMBED_COLORS.INFO)
    .setDescription(`Stored Pokémon: ${total}`)
    .setFooter({ text: `Page ${currentPage} of ${totalPages}` });

  if (!items.length) {
    embed.addFields({ name: "Storage", value: "Your storage box is empty. Catch more Pokémon to fill it up!" });
  } else {
    const lines = items.map((mon, index) => formatBoxEntry(mon, start + index + 1));
    embed.addFields({
      name: "Storage",
      value: lines.join("\n").slice(0, 1024),
    });
  }

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [buildNavRow("box")];
  if (totalPages > 1) {
    components.push(buildBoxPaginationRow(currentPage, totalPages));
  }
  components.push(buildHealRow());
  return { embed, components, meta: { page: currentPage, totalPages } };
}

function asDiscordTimestamp(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const instance = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(instance.valueOf())) return null;
  const unix = Math.floor(instance.getTime() / 1000);
  return `<t:${unix}:R>`;
}

function formatReadyLabel(date: Date | string | null | undefined, now: Date): string {
  if (!date) return "Ready now";
  const instance = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(instance.valueOf()) || instance <= now) return "Ready now";
  const unix = Math.floor(instance.getTime() / 1000);
  return `<t:${unix}:R>`;
}

function buildProfileView(snapshot: TrainerHomeSnapshot, now = new Date()): ViewRender {
  const embed = new EmbedBuilder()
    .setTitle("Trainer Profile")
    .setColor(EMBED_COLORS.WARNING)
    .setDescription(`Trainer: <@${snapshot.user.discordId}>`);

  const partyCount = snapshot.party.filter((slot) => Boolean(slot.pokemon)).length;
  const boxCount = snapshot.box.length;
  const total = partyCount + boxCount;
  embed.addFields(
    { name: "Coins", value: `${snapshot.user.coins}`, inline: true },
    { name: "Party", value: `${partyCount} / 6 slots`, inline: true },
    { name: "Storage", value: `${boxCount} Pokémon`, inline: true }
  );

  const createdAt = asDiscordTimestamp(snapshot.user.createdAt ?? null);
  if (createdAt) {
    embed.addFields({ name: "Joined", value: createdAt });
  }

  const questState = evaluateDailyQuestStreak({
    streak: snapshot.user.dailyQuestStreak,
    lastCompleted: snapshot.user.dailyQuestLastCompleted,
    lastReset: snapshot.user.dailyQuestLastReset,
    now,
  });
  const questLines = [questState.message];
  if (questState.nextDue) {
    const rel = formatReadyLabel(questState.nextDue, now);
    if (rel && rel !== "Ready now") {
      questLines.push(`Next quest ${rel}`);
    }
  }
  if (questState.lastCompleted) {
    const rel = asDiscordTimestamp(questState.lastCompleted);
    if (rel) {
      questLines.push(`Last completed ${rel}`);
    }
  }
  embed.addFields({ name: "Daily Quest", value: questLines.join("\n").slice(0, 1024) });

  const dailyCooldown = snapshot.cooldowns.find((cd) => cd.kind === "daily");
  const nextDaily = formatReadyLabel(dailyCooldown?.readyAt ?? null, now);
  embed.addFields({
    name: "Daily Reward",
    value: nextDaily === "Ready now" ? "Ready to claim now." : `Available ${nextDaily}`,
  });

  embed.setFooter({ text: `Pokémon owned: ${total}` });

  const components = [buildNavRow("profile"), buildHealRow()];
  return { embed, components };
}

async function fetchSnapshot(discordId: string): Promise<TrainerHomeSnapshot> {
  return DMHomeRepo.loadTrainerHomeSnapshot(discordId);
}

async function acknowledge(interaction: InteractionWithUser, content: string) {
  const result = await safeReply(interaction, content, { ephemeral: true });
  if (!result.success) {
    // Swallow follow-up failures so homestead responses still resolve cleanly when the
    // acknowledgement cannot be delivered (e.g., interaction already concluded).
    logger.warn('HomesteadHome', 'acknowledge', 'Failed to send acknowledgement', { metadata: { error: result.error } });
  }
}

async function respondWithView(
  interaction: InteractionWithUser,
  render: ViewRender,
  mode: ResponseMode,
  ackContent?: string
) {
  const embeds = [render.embed];
  const components = render.components;

  if (mode === "update" && "isButton" in interaction && interaction.isButton()) {
    await interaction.update({ embeds, components });
    return;
  }

  if (mode === "homestead") {
    try {
      // Get or create the user's homestead channel
      if (!interaction.client || !interaction.guildId) {
        throw new Error("Cannot create homestead channel: missing client or guild context");
      }

      const manager = new HomesteadChannelManager(interaction.client, interaction.guildId);
      const result = await manager.getOrCreateChannel(interaction.user);
      const homesteadChannel = result.channel;

      await homesteadChannel.send({ embeds, components });
      
      if (ackContent) {
        await acknowledge(interaction, ackContent);
      }
    } catch (error) {
      logger.warn('HomesteadHome', 'respondWithView', 'Failed to deliver view to homestead channel; falling back to ephemeral reply', { metadata: { error } });
      
      // Track homestead delivery failure
      await errorTracker.captureError(ensureError(error), {
        category: 'DISCORD',
        userId: interaction.user.id,
        guildId: interaction.guildId || undefined,
        operation: 'homestead:getOrCreateChannel',
        customData: {
          view: 'homestead-home',
          fallback: 'ephemeral-reply',
        },
      });
      
      const fallback: InteractionReplyOptions = {
        embeds,
        components,
        content:
          "I couldn't access your homestead channel. Please contact an administrator — showing the view here instead.",
        ephemeral: true,
      };
      await safeReplyWithPayload(interaction, fallback);
    }
    return;
  }

  const finalPayload = { embeds, components, ephemeral: true } satisfies InteractionReplyOptions;
  await safeReplyWithPayload(interaction, finalPayload);
}

type OpenViewOptions = {
  snapshot?: TrainerHomeSnapshot;
  respond?: ResponseMode;
  page?: number;
  ackContent?: string;
  now?: Date;
};

function resolveResponseMode(
  interaction: InteractionWithUser,
  options: OpenViewOptions
): ResponseMode {
  if (options.respond) {
    return options.respond;
  }
  if ("isButton" in interaction && typeof interaction.isButton === "function" && interaction.isButton()) {
    return "update";
  }
  return "reply";
}

async function openPartyView(interaction: InteractionWithUser, options: OpenViewOptions = {}): Promise<void> {
  const snapshot = options.snapshot ?? (await fetchSnapshot(interaction.user.id));
  const render = buildPartyView(snapshot);
  const mode = resolveResponseMode(interaction, options);
  await respondWithView(interaction, render, mode, options.ackContent);
}

async function openBoxView(interaction: InteractionWithUser, options: OpenViewOptions = {}): Promise<void> {
  const snapshot = options.snapshot ?? (await fetchSnapshot(interaction.user.id));
  const render = buildBoxView(snapshot, options.page ?? 1);
  const mode = resolveResponseMode(interaction, options);
  await respondWithView(interaction, render, mode, options.ackContent);
}

async function openBoxPage(interaction: InteractionWithUser, page: number): Promise<void> {
  await openBoxView(interaction, { page, respond: "update" });
}

async function openProfileView(interaction: InteractionWithUser, options: OpenViewOptions = {}): Promise<void> {
  const snapshot = options.snapshot ?? (await fetchSnapshot(interaction.user.id));
  const render = buildProfileView(snapshot, options.now ?? new Date());
  const mode = resolveResponseMode(interaction, options);
  await respondWithView(interaction, render, mode, options.ackContent);
}

export {
  buildBoxView,
  buildPartyView,
  buildProfileView,
  fetchSnapshot as fetchTrainerHomeSnapshot,
  openBoxPage,
  openBoxView,
  openPartyView,
  openProfileView,
};

type HomesteadHomeViewExports = {
  buildBoxView: typeof buildBoxView;
  buildPartyView: typeof buildPartyView;
  buildProfileView: typeof buildProfileView;
  fetchTrainerHomeSnapshot: typeof fetchSnapshot;
  openBoxPage: typeof openBoxPage;
  openBoxView: typeof openBoxView;
  openPartyView: typeof openPartyView;
  openProfileView: typeof openProfileView;
  BOX_PAGE_PREFIX: typeof BOX_PAGE_PREFIX;
};

declare global {
  var __homesteadHomeViews: HomesteadHomeViewExports | undefined;
}

globalThis.__homesteadHomeViews = {
  buildBoxView,
  buildPartyView,
  buildProfileView,
  fetchTrainerHomeSnapshot: fetchSnapshot,
  openBoxPage,
  openBoxView,
  openPartyView,
  openProfileView,
  BOX_PAGE_PREFIX,
};

