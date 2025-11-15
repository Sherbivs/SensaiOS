import { randomUUID } from "node:crypto";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  User as DiscordUser,
} from "discord.js";

import { invalidateBattleState, loadBattleState } from "../../services/cache/recipes.js";
import { createArenaThread, type ArenaThreadContext } from "../arena/thread.js";
import { canChallengeBattle } from "../middleware/limits.js";
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { createBattle, updateBattleStateAndEnd, activateBattle } from "../../shared/models/battle-queries-pg.js";

import { openActionDMs } from "./actions.js";

const ACCEPT_PREFIX = "BATTLE_ACCEPT_";
const DECLINE_PREFIX = "BATTLE_DECLINE_";

type ChallengeMetadata = {
  challengeChannelId: string | null;
  guildId: string | null;
};

type CommandOpts = {
  rngSeed?: string;
};

type ButtonHandlerOpts = {
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

function encodeMetadata(meta: ChallengeMetadata): Record<string, string | null> {
  return { ...meta };
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

  // Limit check: one active/pending battle per user
  const lim = await canChallengeBattle(interaction.user.id, opponent.id);
  if (!lim.ok) {
    const msg =
      lim.reason === "CHALLENGER_BUSY"
        ? "You already have an active or pending battle. Finish it first."
        : lim.reason === "OPPONENT_BUSY"
        ? `${opponent.tag} already has an active or pending battle.`
        : "Cannot start this battle right now.";
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  const challengerRecord = await ensureUser(interaction.user.id);
  const opponentRecord = await ensureUser(opponent.id);

  const meta: ChallengeMetadata = {
    challengeChannelId: interaction.channelId,
    guildId: interaction.guildId ?? null,
  };

  const battle = await createBattle({
    p1Id: challengerRecord.id,
    p2Id: opponentRecord.id,
    state: "Pending",
    rngSeed: opts.rngSeed ?? randomUUID(),
    ruleset: "standard-v1",
    logCompact: encodeMetadata(meta),
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

export async function handleBattleChallengeButton(
  interaction: ButtonInteraction,
  opts: ButtonHandlerOpts = {}
) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  const battle = await loadBattleState(parsed.battleId);
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
    await updateBattleStateAndEnd(battle.id, "Aborted", new Date());
    await invalidateBattleState(battle.id);

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
    | Parameters<typeof createArenaThread>[0]
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

  await activateBattle(battle.id, thread.id);
  await invalidateBattleState(battle.id);

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

  // Send action menus to both players in DM
  try {
    await openActionDMs(battle.id, (id) => interaction.client.users.fetch(id));
  } catch {
    // DM dispatch is best effort; log improvements in future work.
  }
}

export const __testing = {
  buildChallengePrompt,
  parseCustomId,
  decodeMetadata,
  encodeMetadata,
};
