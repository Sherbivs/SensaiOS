import { randomUUID } from "node:crypto";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  User as DiscordUser,
} from "discord.js";

import { battleChallengeEmbed } from "../shared/embed-builders.js";
import { challengeResponseButtons } from "../shared/button-utils.js";
import { replyError, replySuccess } from "../shared/response-helpers.js";
import { invalidateBattleState, loadBattleState } from "../../services/cache/recipes.js";
import { createArenaThread, type ArenaThreadContext } from "../arena/thread.js";
import { canChallengeBattle } from "../middleware/limits.js";
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { createBattle, updateBattleStateAndEnd, activateBattle } from "../../shared/models/battle-queries-pg.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";

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
  embed: ReturnType<typeof battleChallengeEmbed>;
  components: ActionRowBuilder<ButtonBuilder>[];
};

function buildChallengePrompt(challenger: DiscordUser, battleId: string): ChallengePrompt {
  const embed = battleChallengeEmbed({
    challengerTag: challenger.tag,
    challengerMention: `${challenger}`,
  });

  const buttons = challengeResponseButtons(battleId, ACCEPT_PREFIX, DECLINE_PREFIX);

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
    if (!interaction.guildId) {
      throw new Error('Cannot notify user: missing guild context');
    }
    
    const manager = new HomesteadChannelManager(interaction.client, interaction.guildId);
    const user = await interaction.client.users.fetch(discordId);
    const result = await manager.getOrCreateChannel(user);
    await result.channel.send(message);
  } catch {
    // Ignore homestead delivery failures silently; a later task can improve reliability/reporting.
  }
}

export async function handleBattleChallengeCommand(
  interaction: ChatInputCommandInteraction,
  opts: CommandOpts = {}
) {
  if (!interaction.inGuild() || !interaction.channel) {
    await replyError(interaction, "Run this command inside a server channel so I can open the Arena thread there.");
    return;
  }

  const opponent = interaction.options.getUser("opponent", true);
  if (opponent.id === interaction.user.id) {
    await replyError(interaction, "You cannot challenge yourself.");
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
    await replyError(interaction, msg);
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
    await replyError(interaction, `Could not deliver the challenge DM to ${opponent.tag}.`);
    return;
  }

  await replySuccess(interaction, `Challenge sent to ${opponent.tag}. They will receive a DM with Accept/Decline buttons.`);
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
    await replyError(interaction, "This challenge no longer exists.");
    return;
  }

  if (interaction.user.id !== battle.p2.discordId) {
    await replyError(interaction, "Only the challenged trainer can respond.");
    return;
  }

  if (battle.state !== "Pending") {
    await replyError(interaction, `This challenge is already ${battle.state}.`);
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
    await replyError(interaction, "Unable to create an Arena thread (missing channel).");
    return;
  }

  const channel = (await interaction.client.channels.fetch(metadata.challengeChannelId).catch(() => null)) as
    | Parameters<typeof createArenaThread>[0]
    | null;

  if (!channel) {
    await replyError(interaction, "Arena channel is unavailable.");
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
    await replyError(interaction, "Failed to create Arena thread. Please try again later.");
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

  // Send action menus to both players in their homestead channels
  try {
    if (!interaction.guildId) {
      throw new Error('Cannot send battle actions: missing guild context');
    }
    await openActionDMs(battle.id, interaction.client, interaction.guildId);
  } catch {
    // Homestead dispatch is best effort; log improvements in future work.
  }
}
