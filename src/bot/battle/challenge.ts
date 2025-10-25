import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildTextBasedChannel,
  User as DiscordUser,
} from "discord.js";
import { randomUUID } from "node:crypto";
import type { Battle, Prisma, PrismaClient, User as PrismaUser } from "@prisma/client";
import { prisma as prismaClient } from "../../models/index.js";
import { createArenaThread, type ArenaThreadContext } from "../arena/thread.js";

const ACCEPT_PREFIX = "BATTLE_ACCEPT_";
const DECLINE_PREFIX = "BATTLE_DECLINE_";

type PrismaLike = PrismaClient;

type ChallengeMetadata = {
  challengeChannelId: string | null;
  guildId: string | null;
};

type BattleWithPlayers = Battle & { p1: PrismaUser; p2: PrismaUser };

type CommandOpts = {
  prisma?: PrismaLike;
  rngSeed?: string;
};

type ButtonHandlerOpts = {
  prisma?: PrismaLike;
  arenaCreator?: typeof createArenaThread;
};

type ChallengePrompt = {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
};

function buildChallengePrompt(challenger: DiscordUser, battleId: string): ChallengePrompt {
  const embed = new EmbedBuilder()
    .setTitle("Battle Challenge")
    .setDescription(`${challenger} has challenged you to a battle.`)
    .setColor(0xff9800)
    .addFields(
      { name: "Challenger", value: `${challenger.tag}`, inline: true },
      { name: "What next?", value: "Accept to open an Arena thread or decline politely.", inline: false }
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ACCEPT_PREFIX}${battleId}`)
      .setLabel("Accept Challenge")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${DECLINE_PREFIX}${battleId}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embed, components: [buttons] };
}

function decodeMetadata(data: unknown): ChallengeMetadata {
  if (!data || typeof data !== "object") {
    return { challengeChannelId: null, guildId: null };
  }
  const obj = data as Record<string, unknown>;
  return {
    challengeChannelId:
      typeof obj.challengeChannelId === "string" && obj.challengeChannelId.length > 0
        ? obj.challengeChannelId
        : null,
    guildId: typeof obj.guildId === "string" && obj.guildId.length > 0 ? obj.guildId : null,
  };
}

function encodeMetadata(meta: ChallengeMetadata): Prisma.InputJsonValue {
  return { ...meta } satisfies Record<string, string | null> as Prisma.InputJsonValue;
}

function parseCustomId(customId: string) {
  if (customId.startsWith(ACCEPT_PREFIX)) {
    return { action: "accept" as const, battleId: customId.substring(ACCEPT_PREFIX.length) };
  }
  if (customId.startsWith(DECLINE_PREFIX)) {
    return { action: "decline" as const, battleId: customId.substring(DECLINE_PREFIX.length) };
  }
  return null;
}

async function ensureUser(prisma: PrismaLike, discordId: string) {
  return prisma.user.upsert({
    where: { discordId },
    update: {},
    create: { discordId, coins: 0 },
  });
}

async function notifyUser(discordId: string, message: string, interaction: ButtonInteraction) {
  try {
    const user = await interaction.client.users.fetch(discordId);
    const dm = await user.createDM();
    await dm.send(message);
  } catch {
    // Ignore DM failures silently; a later task can improve reliability/reporting.
  }
}

export async function handleBattleChallengeCommand(
  interaction: ChatInputCommandInteraction,
  opts: CommandOpts = {}
) {
  if (!interaction.inGuild() || !interaction.channel) {
    await interaction.reply({
      content: "Run this command inside a server channel so I can open the Arena thread there.",
      ephemeral: true,
    });
    return;
  }

  const opponent = interaction.options.getUser("opponent", true);
  if (opponent.id === interaction.user.id) {
    await interaction.reply({ content: "You cannot challenge yourself.", ephemeral: true });
    return;
  }

  const prisma = opts.prisma ?? prismaClient;
  const challengerRecord = await ensureUser(prisma, interaction.user.id);
  const opponentRecord = await ensureUser(prisma, opponent.id);

  const meta: ChallengeMetadata = {
    challengeChannelId: interaction.channelId,
    guildId: interaction.guildId ?? null,
  };

  const battle = await prisma.battle.create({
    data: {
      p1Id: challengerRecord.id,
      p2Id: opponentRecord.id,
      state: "Pending",
      rngSeed: opts.rngSeed ?? randomUUID(),
      ruleset: "standard-v1",
      logCompact: encodeMetadata(meta),
    },
  });

  const challenge = buildChallengePrompt(interaction.user, battle.id);
  try {
    const dm = await opponent.createDM();
    await dm.send({ embeds: [challenge.embed], components: challenge.components });
  } catch {
    await interaction.reply({
      content: `Could not deliver the challenge DM to ${opponent.tag}.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `Challenge sent to ${opponent.tag}. They will receive a DM with Accept/Decline buttons.`,
    ephemeral: true,
  });
}

async function loadBattle(prisma: PrismaLike, battleId: string): Promise<BattleWithPlayers | null> {
  return prisma.battle.findUnique({
    where: { id: battleId },
    include: { p1: true, p2: true },
  }) as Promise<BattleWithPlayers | null>;
}

export async function handleBattleChallengeButton(
  interaction: ButtonInteraction,
  opts: ButtonHandlerOpts = {}
) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  const prisma = opts.prisma ?? prismaClient;
  const battle = await loadBattle(prisma, parsed.battleId);
  if (!battle) {
    await interaction.reply({ content: "This challenge no longer exists.", ephemeral: true });
    return;
  }

  if (interaction.user.id !== battle.p2.discordId) {
    await interaction.reply({ content: "Only the challenged trainer can respond.", ephemeral: true });
    return;
  }

  if (battle.state !== "Pending") {
    await interaction.reply({ content: `This challenge is already ${battle.state}.`, ephemeral: true });
    return;
  }

  const metadata = decodeMetadata(battle.logCompact);

  if (parsed.action === "decline") {
    await prisma.battle.update({
      where: { id: battle.id },
      data: {
        state: "Aborted",
        endedAt: new Date(),
      },
    });

    await interaction.update({
      content: "You declined the battle challenge.",
      components: [],
    });

    await notifyUser(
      battle.p1.discordId,
      `${interaction.user.tag} declined your battle challenge.`,
      interaction
    );
    return;
  }

  if (!metadata.challengeChannelId) {
    await interaction.reply({
      content: "Unable to create an Arena thread (missing channel).",
      ephemeral: true,
    });
    return;
  }

  const channel = (await interaction.client.channels.fetch(metadata.challengeChannelId).catch(() => null)) as
    | GuildTextBasedChannel
    | null;

  if (!channel) {
    await interaction.reply({ content: "Arena channel is unavailable.", ephemeral: true });
    return;
  }

  const arenaCtx: ArenaThreadContext = {
    battleId: battle.id,
    challengerTag: `<@${battle.p1.discordId}>`,
    opponentTag: `<@${battle.p2.discordId}>`,
  };
  const creator = opts.arenaCreator ?? createArenaThread;
  const thread = await creator(channel, arenaCtx);

  if (!thread) {
    await interaction.reply({
      content: "Failed to create Arena thread. Please try again later.",
      ephemeral: true,
    });
    return;
  }

  await prisma.battle.update({
    where: { id: battle.id },
    data: {
      state: "Active",
      arenaThreadId: thread.id,
    },
  });

  await interaction.update({
    content: `Challenge accepted! Arena thread created: <#${thread.id}>`,
    components: [],
  });

  await notifyUser(
    battle.p1.discordId,
    `${interaction.user.tag} accepted your battle challenge. Arena thread: <#${thread.id}>`,
    interaction
  );
  await notifyUser(
    battle.p2.discordId,
    `You accepted the battle challenge from <@${battle.p1.discordId}>. Join the Arena thread: <#${thread.id}>`,
    interaction
  );
}

export const __testing = {
  buildChallengePrompt,
  parseCustomId,
  decodeMetadata,
  encodeMetadata,
};
